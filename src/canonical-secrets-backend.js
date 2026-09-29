import crypto from 'node:crypto';
import path from 'node:path';

import { sync as writeFileAtomicSync } from 'write-file-atomic';

import { recordImportLedgerEntry } from './canonical-import-ledger.js';
import { canonicalSqliteManager } from './canonical-sqlite.js';
import { runCanonicalMigrations } from './canonical-sqlite-migrations.js';
import {
    getPersistedCanonicalAuditStatus,
    invalidateCanonicalAuditStatus,
} from './canonical-sqlite-shadow-import.js';
import {
    auditCanonicalSecretsShadowImport,
    CANONICAL_SECRETS_AUDIT_SCOPE,
    getCanonicalSecretsProjection,
    runCanonicalSecretsShadowImport,
} from './canonical-secrets-shadow-import.js';
import { getCanonicalStorageSlice } from './canonical-storage-slice-registry.js';
import { decideCanonicalBackendInitAction } from './canonical-backend.js';
import {
    listOpenSecretProjectionRepairs,
    recordSecretProjectionRepair,
} from './endpoints/canonical-secrets-store.js';

const initializedBackends = new Map();

function getHandle(directories) {
    return directories?.handle ?? path.basename(path.resolve(directories?.root ?? 'default-user'));
}

/**
 * Secrets keeps its own synchronous initializer (SecretManager callers are
 * synchronous), but follows the same audit-driven rules as the generic
 * initializer: a completed clean audit is trusted, file-side stale marks heal
 * via re-import, projection marks re-audit only, and real drift stays blocking.
 */
function initializeCanonicalSecrets(directories) {
    const featureFlags = getCanonicalStorageSlice('secrets').getFeatureFlags();
    if (!featureFlags.enabled) {
        return { ok: false, reason: 'canonical_storage_disabled', featureFlags };
    }

    const stateKey = path.resolve(directories.root);
    const initialized = initializedBackends.get(stateKey);
    if (initialized) {
        const persistedAudit = getPersistedCanonicalAuditStatus(initialized.db, {
            scope: CANONICAL_SECRETS_AUDIT_SCOPE,
        });
        if (decideCanonicalBackendInitAction(persistedAudit) === 'skip') {
            return {
                ...initialized,
                featureFlags,
            };
        }
        initializedBackends.delete(stateKey);
    }

    const handle = getHandle(directories);
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
        return {
            ok: false,
            reason: 'migration_blocked',
            featureFlags,
            migrationStatus,
        };
    }

    const persistedAudit = getPersistedCanonicalAuditStatus(db, {
        scope: CANONICAL_SECRETS_AUDIT_SCOPE,
    });
    let action = decideCanonicalBackendInitAction(persistedAudit);
    if (action === 'import' && featureFlags.shadowImport === false) {
        // Without shadow import the file side cannot heal drift — audit only.
        action = 'audit';
    }
    if (action === 'skip') {
        const state = {
            ok: true,
            db,
            handle,
            featureFlags,
            migrationStatus,
            auditResult: persistedAudit,
        };
        initializedBackends.set(stateKey, state);
        return state;
    }

    const importResult = action === 'import'
        ? runCanonicalSecretsShadowImport({
            handle,
            directories,
            featureFlags,
            manager: canonicalSqliteManager,
        })
        : null;
    const auditResult = auditCanonicalSecretsShadowImport({
        handle,
        directories,
        db,
        projection: getCanonicalSecretsProjectionMode(),
    });
    const state = {
        ok: true,
        db,
        handle,
        featureFlags,
        migrationStatus,
        importResult,
        auditResult,
    };
    initializedBackends.set(stateKey, state);
    return state;
}

export function getCanonicalSecretsProjectionMode() {
    return getCanonicalStorageSlice('secrets').getProjectionMode();
}

export function initializeCanonicalSecretsForDirectories(directories) {
    return initializeCanonicalSecrets(directories);
}

export function getCanonicalSecretsReadBackend(directories) {
    const state = initializeCanonicalSecrets(directories);
    if (!state.ok) {
        // Frozen or sqlite-less environments cannot run canonical secrets at
        // all — the secrets file remains the only persistence surface there.
        // A migration-blocked (enabled but broken) slice must fail closed:
        // falling back to the file would silently resurrect drifted secrets.
        if (state.reason === 'canonical_storage_disabled' || state.reason === 'canonical_storage_unavailable') {
            return null;
        }
        throw new Error(`Canonical secrets reads blocked: ${state.reason ?? 'canonical_storage_unavailable'}`);
    }

    const openRepairs = listOpenSecretProjectionRepairs(state.db);
    if (openRepairs.length > 0) {
        // A failed projection must not make the compatibility file authoritative again.
        return state;
    }

    const slice = getCanonicalStorageSlice('secrets');
    const auditStatus = getPersistedCanonicalAuditStatus(state.db, {
        scope: CANONICAL_SECRETS_AUDIT_SCOPE,
    });
    const blockers = slice.getRollbackBlockers({
        db: state.db,
        featureFlags: state.featureFlags,
        phase: 'reads',
        persistedAuditStatus: auditStatus,
    });
    if (!blockers.ok) {
        throw new Error(`Canonical secrets reads blocked: ${blockers.blockers[0]?.code ?? auditStatus.reason ?? 'secrets_slice_blocked'}`);
    }
    return state;
}

export function getCanonicalSecretsWriteBackend(directories) {
    const featureFlags = getCanonicalStorageSlice('secrets').getFeatureFlags();
    if (!featureFlags.enabled || !featureFlags.writes) {
        return null;
    }

    const state = initializeCanonicalSecrets(directories);
    if (!state.ok) {
        throw new Error(`Canonical secrets writes blocked: ${state.reason}`);
    }

    const slice = getCanonicalStorageSlice('secrets');
    const auditStatus = getPersistedCanonicalAuditStatus(state.db, {
        scope: CANONICAL_SECRETS_AUDIT_SCOPE,
    });
    const blockers = slice.getRollbackBlockers({
        db: state.db,
        featureFlags: state.featureFlags,
        phase: 'writes',
        persistedAuditStatus: auditStatus,
    });
    if (!blockers.ok) {
        throw new Error(`Canonical secrets writes blocked: ${blockers.blockers[0]?.code ?? 'unknown'}`);
    }
    return state;
}

export function projectCanonicalSecretsFile(directories, db, { nowMs = Date.now() } = {}) {
    const filePath = path.join(directories.root, 'secrets.json');
    if (getCanonicalSecretsProjectionMode() === 'off') {
        return filePath;
    }
    const contents = JSON.stringify(getCanonicalSecretsProjection(db), null, 4);
    writeFileAtomicSync(filePath, contents, 'utf8');
    recordImportLedgerEntry(db, {
        sliceKey: 'secrets',
        sourcePath: 'secrets.json',
        contentHash: crypto.createHash('sha256').update(contents).digest('hex'),
        origin: 'projection',
        nowMs,
    });
    return filePath;
}

export function recordCanonicalSecretsProjectionFailure({
    directories,
    db,
    key,
    recordId = null,
    operation,
    error,
    nowMs = Date.now(),
} = {}) {
    const repairKey = `secrets:${String(key ?? '')}:${String(recordId ?? 'active')}:${String(operation ?? 'unknown')}`;
    recordSecretProjectionRepair(db, {
        repairKey,
        key,
        recordId,
        operation,
        errorClass: String(error?.name ?? 'Error'),
        nowMs,
    });
    invalidateCanonicalAuditStatus(db, {
        scope: CANONICAL_SECRETS_AUDIT_SCOPE,
        handle: getHandle(directories),
        reason: 'audit_stale_after_secret_projection_failure',
        source: `secrets:${operation ?? 'unknown'}`,
        auditedAtMs: nowMs,
    });
    return repairKey;
}

export function invalidateCanonicalSecretsAfterFileWrite(directories, operation) {
    const featureFlags = getCanonicalStorageSlice('secrets').getAuditTrackingFeatureFlags();
    if (!featureFlags.enabled) {
        return;
    }
    const handle = getHandle(directories);
    const db = canonicalSqliteManager.open({
        handle,
        directories,
        featureFlags: {
            enabled: true,
            strict: !!featureFlags.strict,
        },
    });
    if (!db) {
        return;
    }
    const migrationStatus = runCanonicalMigrations(db, {
        strict: !!featureFlags.strict,
    });
    if (!migrationStatus.ok) {
        return;
    }
    invalidateCanonicalAuditStatus(db, {
        scope: CANONICAL_SECRETS_AUDIT_SCOPE,
        handle,
        reason: 'audit_stale_after_secret_file_write',
        source: `secrets:${operation}`,
    });
}
