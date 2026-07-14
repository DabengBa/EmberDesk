import path from 'node:path';

import { canonicalSqliteManager } from '../canonical-sqlite.js';
import { runCanonicalMigrations } from '../canonical-sqlite-migrations.js';
import { getPersistedCanonicalAuditStatus } from '../canonical-sqlite-shadow-import.js';
import { getCanonicalStorageSlice } from '../canonical-storage-slice-registry.js';
import {
    getCanonicalManagedMediaFolderState,
    listCanonicalManagedMediaReferences,
} from './canonical-managed-media-store.js';

function getDefaultDependencies() {
    const slice = getCanonicalStorageSlice('managed_media');
    return {
        getFeatureFlags: () => slice.getFeatureFlags(),
        getSlice: () => slice,
        openDatabase: options => canonicalSqliteManager.open(options),
        runMigrations: (db, options) => runCanonicalMigrations(db, options),
        getAuditStatus: (db, options) => getPersistedCanonicalAuditStatus(db, options),
    };
}

function blockedReadState({ reason, featureFlags, strict, details = {} }) {
    if (strict) {
        throw new Error(`Canonical managed media reads blocked: ${reason}`);
    }
    return {
        ok: false,
        reason,
        featureFlags,
        ...details,
    };
}

export function getCanonicalManagedMediaReadState({
    handle,
    directories,
    dependencies = {},
} = {}) {
    const defaults = getDefaultDependencies();
    const getSlice = dependencies.getSlice ?? defaults.getSlice;
    const slice = getSlice();
    const getFeatureFlags = dependencies.getFeatureFlags ?? defaults.getFeatureFlags;
    const featureFlags = getFeatureFlags();
    const strict = !!featureFlags.strict;

    if (!featureFlags.enabled) {
        return blockedReadState({ reason: 'canonical_storage_disabled', featureFlags, strict });
    }
    if (!featureFlags.reads) {
        return blockedReadState({ reason: 'canonical_reads_disabled', featureFlags, strict });
    }

    const openDatabase = dependencies.openDatabase ?? defaults.openDatabase;
    const db = openDatabase({
        handle,
        directories,
        featureFlags: { enabled: true, strict },
    });
    if (!db) {
        return blockedReadState({ reason: 'canonical_storage_unavailable', featureFlags, strict });
    }

    const runMigrations = dependencies.runMigrations ?? defaults.runMigrations;
    const migrationStatus = runMigrations(db, { strict });
    if (!migrationStatus.ok) {
        return blockedReadState({
            reason: 'migration_blocked',
            featureFlags,
            strict,
            details: { migrationStatus },
        });
    }

    const getAuditStatus = dependencies.getAuditStatus ?? defaults.getAuditStatus;
    const auditStatus = getAuditStatus(db, { scope: slice.auditScope });
    if (auditStatus.blocking) {
        return blockedReadState({
            reason: auditStatus.reason ?? 'audit_not_run',
            featureFlags,
            strict,
            details: { auditStatus },
        });
    }

    const rollback = slice.getRollbackBlockers({
        db,
        featureFlags,
        phase: 'reads',
        persistedAuditStatus: auditStatus,
    });
    if (!rollback.ok) {
        return blockedReadState({
            reason: rollback.blockers[0]?.code ?? 'managed_media_read_blocked',
            featureFlags,
            strict,
            details: { auditStatus, rollback },
        });
    }

    return {
        ok: true,
        db,
        featureFlags,
        migrationStatus,
        auditStatus,
        sliceKey: slice.key,
    };
}

function normalizeCompatibilityPath(value) {
    return String(value ?? '').split(path.sep).join(path.posix.sep);
}

function listOwnerReferences(db, ownerType, prefix) {
    return listCanonicalManagedMediaReferences(db)
        .filter(reference => reference.ownerType === ownerType)
        .filter(reference => normalizeCompatibilityPath(reference.compatibilityPath).startsWith(prefix));
}

export function listCanonicalBackgroundPayload(db, { metadataByPath = {} } = {}) {
    const images = listOwnerReferences(db, 'background', 'backgrounds/')
        .map(reference => {
            const compatibilityPath = normalizeCompatibilityPath(reference.compatibilityPath);
            return {
                filename: path.posix.basename(compatibilityPath),
                isAnimated: metadataByPath[compatibilityPath]?.isAnimated ?? false,
            };
        });

    return {
        images,
        ...getCanonicalManagedMediaFolderState(db),
    };
}

export function listCanonicalAssetPayload(db) {
    const output = {};
    for (const reference of listOwnerReferences(db, 'asset', 'assets/')) {
        const compatibilityPath = normalizeCompatibilityPath(reference.compatibilityPath);
        const segments = compatibilityPath.split('/');
        const category = segments[1];
        if (!category || category === 'temp') {
            continue;
        }

        if (category === 'live2d') {
            if (compatibilityPath.includes('model') && compatibilityPath.endsWith('.json')) {
                output.live2d ??= [];
                output.live2d.push(`/${compatibilityPath}`);
            }
            continue;
        }

        if (category === 'vrm') {
            const variant = segments[2];
            if (variant === 'model' || variant === 'animation') {
                output.vrm ??= { model: [], animation: [] };
                output.vrm[variant].push(`/${compatibilityPath}`);
            }
            continue;
        }

        output[category] ??= [];
        output[category].push(compatibilityPath);
    }
    return output;
}
