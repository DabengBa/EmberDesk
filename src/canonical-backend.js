import path from 'node:path';

import { canonicalSqliteManager } from './canonical-sqlite.js';
import { runCanonicalMigrations } from './canonical-sqlite-migrations.js';
import {
    auditCanonicalShadowImport,
    runCanonicalShadowImport,
} from './canonical-sqlite-shadow-import.js';
import {
    auditCanonicalWorldInfoShadowImport,
    runCanonicalWorldInfoShadowImport,
} from './canonical-world-info-shadow-import.js';
import {
    auditCanonicalSettingsShadowImport,
    runCanonicalSettingsShadowImport,
} from './canonical-settings-shadow-import.js';
import {
    auditCanonicalSecretsShadowImport,
    runCanonicalSecretsShadowImport,
} from './canonical-secrets-shadow-import.js';
import {
    auditCanonicalManagedMediaShadowImport,
    runCanonicalManagedMediaShadowImport,
} from './canonical-managed-media-shadow-import.js';
import {
    auditCanonicalChatShadowImport,
    runCanonicalChatShadowImport,
} from './canonical-chat-shadow-import.js';
import { getCanonicalStorageSlice } from './canonical-storage-slice-registry.js';
import { getPersistedCanonicalAuditStatus } from './canonical-sqlite-shadow-import.js';
import { buildCharacterFileSnapshotRow } from './endpoints/character-file-snapshot.js';
import { parse as parseCharacterCard } from './character-card-parser.js';
import { getCharaCardV2 } from './endpoints/character-card-v2.js';

/**
 * Default canonical character snapshot builder: real PNG card decoding and
 * V2 normalization so stored card_json matches what the runtime serves.
 * @param {string} avatar Avatar filename
 * @param {import('./users.js').UserDirectoryList} directories User directories
 */
function buildCharacterSnapshotRow(avatar, directories) {
    return buildCharacterFileSnapshotRow({
        avatar,
        directories,
        readCharacterData: filePath => parseCharacterCard(filePath, 'png'),
        getCharaCardV2,
    });
}

const SLICE_RUNNERS = {
    characters: {
        runImport: ({ handle, directories, featureFlags, manager, buildSnapshotRow }) => runCanonicalShadowImport({
            handle,
            directories,
            featureFlags,
            manager,
            buildSnapshotRow: buildSnapshotRow ?? buildCharacterSnapshotRow,
        }),
        runAudit: ({ handle, directories, db, buildSnapshotRow }) => auditCanonicalShadowImport({
            handle,
            directories,
            db,
            buildSnapshotRow: buildSnapshotRow ?? buildCharacterSnapshotRow,
        }),
    },
    world_info: {
        runImport: runCanonicalWorldInfoShadowImport,
        runAudit: auditCanonicalWorldInfoShadowImport,
    },
    settings: {
        runImport: runCanonicalSettingsShadowImport,
        runAudit: auditCanonicalSettingsShadowImport,
    },
    secrets: {
        runImport: runCanonicalSecretsShadowImport,
        runAudit: auditCanonicalSecretsShadowImport,
    },
    managed_media: {
        runImport: runCanonicalManagedMediaShadowImport,
        runAudit: auditCanonicalManagedMediaShadowImport,
    },
    chats: {
        runImport: runCanonicalChatShadowImport,
        runAudit: auditCanonicalChatShadowImport,
    },
};

const initializedBackends = new Map();

const DB_AHEAD_STALE_PATTERN = /projection_failure|projection_repair/;

/**
 * Decides what a lazy init pass may do with the persisted audit verdict:
 *  - 'import': file side is (or may be) ahead — shadow-import, then audit.
 *  - 'audit' : DB is ahead of the file (projection failure/repair marks) —
 *              re-verify only; re-importing would regress committed revisions.
 *  - 'skip'  : a completed audit already governs the slice — trust it. Real
 *              drift/error verdicts stay blocking until repair tooling runs.
 * @param {object} auditStatus Persisted audit state for the slice
 * @returns {'import'|'audit'|'skip'}
 */
export function decideCanonicalBackendInitAction(auditStatus) {
    if (auditStatus.status === 'missing' || auditStatus.reason === 'audit_not_run') {
        return 'import';
    }
    if (!auditStatus.blocking) {
        return 'skip';
    }
    const reason = String(auditStatus.reason ?? '');
    if (DB_AHEAD_STALE_PATTERN.test(reason)) {
        return 'audit';
    }
    if (reason.startsWith('audit_stale')) {
        return 'import';
    }
    return 'skip';
}

function getHandle(directories) {
    return directories?.handle ?? path.basename(path.resolve(directories?.root ?? 'default-user'));
}

async function initializeSlice(slice, handle, directories, featureFlags, options = {}) {
    const db = canonicalSqliteManager.open({
        handle,
        directories,
        featureFlags: {
            enabled: true,
            strict: !!featureFlags.strict,
        },
    });
    if (!db) {
        return { ok: false, reason: 'canonical_storage_unavailable', featureFlags };
    }

    const migrationStatus = runCanonicalMigrations(db, {
        strict: !!featureFlags.strict,
    });
    if (!migrationStatus.ok) {
        if (featureFlags.strict) {
            throw new Error(migrationStatus.blockedReason);
        }
        return { ok: false, reason: 'migration_blocked', featureFlags, migrationStatus };
    }

    const runners = SLICE_RUNNERS[slice.key];
    if (!runners) {
        return { ok: false, reason: 'canonical_slice_unknown', featureFlags };
    }

    const persistedAudit = getPersistedCanonicalAuditStatus(db, { scope: slice.auditScope });
    const action = decideCanonicalBackendInitAction(persistedAudit);
    if (action === 'skip') {
        return { ok: true, db, handle, featureFlags, migrationStatus, auditResult: persistedAudit };
    }

    const importResult = action === 'import'
        ? await runners.runImport({
            handle,
            directories,
            db,
            featureFlags,
            manager: canonicalSqliteManager,
            buildSnapshotRow: options.buildSnapshotRow,
        })
        : null;
    const auditResult = await runners.runAudit({
        handle,
        directories,
        db,
        buildSnapshotRow: options.buildSnapshotRow,
    });
    return {
        ok: true,
        db,
        handle,
        featureFlags,
        migrationStatus,
        importResult,
        auditResult,
    };
}

/**
 * Lazily runs the per-user shadow import and audit for one storage slice so
 * DB-first gates see a persisted audit status instead of `audit_not_run`.
 * The initializer is idempotent, runs at most once per (user root, slice)
 * per process, and a slice failure never poisons unrelated slices.
 *
 * @param {string} sliceKey Registry slice key (e.g. 'settings')
 * @param {import('./users.js').UserDirectoryList} directories User directories
 * @param {string} [handle] User handle; defaults to the directory basename
 * @param {{ buildSnapshotRow?: Function }} [options] Slice-specific hooks (character card decoding)
 * @returns {Promise<{ok: boolean, reason?: string, db?: object}>}
 */
export function ensureCanonicalSliceBackend(sliceKey, directories, handle = null, options = {}) {
    const slice = getCanonicalStorageSlice(sliceKey);
    const featureFlags = slice.getFeatureFlags();
    if (!featureFlags.enabled) {
        return Promise.resolve({ ok: false, reason: 'canonical_storage_disabled', featureFlags });
    }

    const rootKey = path.resolve(directories.root);
    let perSlice = initializedBackends.get(rootKey);
    if (!perSlice) {
        perSlice = new Map();
        initializedBackends.set(rootKey, perSlice);
    }

    const prior = perSlice.get(sliceKey);
    const resolvedHandle = handle ?? getHandle(directories);
    const initPromise = Promise.resolve(prior)
        .then(prev => {
            if (prev?.ok && prev.db) {
                const freshAudit = getPersistedCanonicalAuditStatus(prev.db, { scope: slice.auditScope });
                if (decideCanonicalBackendInitAction(freshAudit) === 'skip') {
                    return prev;
                }
            }
            return initializeSlice(slice, resolvedHandle, directories, featureFlags, options);
        });
    perSlice.set(sliceKey, initPromise);
    return initPromise;
}

export function resetCanonicalBackendsForTests() {
    initializedBackends.clear();
}
