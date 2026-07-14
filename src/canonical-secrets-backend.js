import path from 'node:path';

import { sync as writeFileAtomicSync } from 'write-file-atomic';

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
import {
    listOpenSecretProjectionRepairs,
    recordSecretProjectionRepair,
} from './endpoints/canonical-secrets-store.js';

const initializedBackends = new Map();

function getHandle(directories) {
    return directories?.handle ?? path.basename(path.resolve(directories?.root ?? 'default-user'));
}

function initializeCanonicalSecrets(directories) {
    const featureFlags = getCanonicalStorageSlice('secrets').getFeatureFlags();
    if (!featureFlags.enabled) {
        return { ok: false, reason: 'canonical_storage_disabled', featureFlags };
    }

    const stateKey = path.resolve(directories.root);
    const initialized = initializedBackends.get(stateKey);
    if (initialized) {
        return {
            ...initialized,
            featureFlags,
        };
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
        if (featureFlags.strict) {
            throw new Error(migrationStatus.blockedReason);
        }
        return {
            ok: false,
            reason: 'migration_blocked',
            featureFlags,
            migrationStatus,
        };
    }

    const importResult = runCanonicalSecretsShadowImport({
        handle,
        directories,
        featureFlags,
        manager: canonicalSqliteManager,
    });
    const auditResult = auditCanonicalSecretsShadowImport({
        handle,
        directories,
        db,
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

export function initializeCanonicalSecretsForDirectories(directories) {
    return initializeCanonicalSecrets(directories);
}

export function getCanonicalSecretsReadBackend(directories) {
    const state = initializeCanonicalSecrets(directories);
    if (!state.ok) {
        return null;
    }

    const openRepairs = listOpenSecretProjectionRepairs(state.db);
    if (openRepairs.length > 0) {
        // A failed projection must not make the compatibility file authoritative again.
        return state;
    }

    if (!state.featureFlags.reads) {
        return null;
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
        if (state.featureFlags.strict) {
            throw new Error(`Canonical secrets reads blocked: ${blockers.blockers[0]?.code ?? 'unknown'}`);
        }
        return null;
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
    if (!state.featureFlags.reads) {
        throw new Error('Canonical secrets writes require canonical reads.');
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

export function projectCanonicalSecretsFile(directories, db) {
    const filePath = path.join(directories.root, 'secrets.json');
    writeFileAtomicSync(filePath, JSON.stringify(getCanonicalSecretsProjection(db), null, 4), 'utf8');
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
    const featureFlags = getCanonicalStorageSlice('secrets').getFeatureFlags();
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
