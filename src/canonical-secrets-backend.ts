import crypto from 'node:crypto';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

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
} from './endpoints/canonical-secrets-store.ts';

type Directories = { root: string; storage?: string; backups?: string; handle?: string };
type InitSuccess = { ok: true; db: DatabaseSync; handle: string; featureFlags: ReturnType<ReturnType<typeof getCanonicalStorageSlice>['getFeatureFlags']>; migrationStatus: ReturnType<typeof runCanonicalMigrations>; auditResult: unknown; importResult?: unknown };
type InitFailure = { ok: false; reason: string; featureFlags: InitSuccess['featureFlags']; migrationStatus?: InitSuccess['migrationStatus'] };
// JS default-destructured options are inferred too narrowly across the JS/TS boundary.
const runSecretsImport = runCanonicalSecretsShadowImport as unknown as (options: { handle: string; directories: Directories; featureFlags: InitSuccess['featureFlags']; manager: typeof canonicalSqliteManager }) => unknown;
const auditSecrets = auditCanonicalSecretsShadowImport as unknown as (options: { handle: string; directories: Directories; db: DatabaseSync; projection: string }) => unknown;
const invalidateAudit = invalidateCanonicalAuditStatus as unknown as (db: DatabaseSync, options: { scope: string; handle: string; reason: string; source: string; auditedAtMs?: number }) => void;
const initializedBackends = new Map<string, InitSuccess>();

function getHandle(directories: Directories) {
    return directories?.handle ?? path.basename(path.resolve(directories?.root ?? 'default-user'));
}

/**
 * Secrets keeps its own synchronous initializer (SecretManager callers are
 * synchronous), but follows the same audit-driven rules as the generic
 * initializer: a completed clean audit is trusted, file-side stale marks heal
 * via re-import, projection marks re-audit only, and real drift stays blocking.
 */
function initializeCanonicalSecrets(directories: Directories): InitSuccess | InitFailure {
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
            ok: true as const,
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
        ? runSecretsImport({
            handle,
            directories,
            featureFlags,
            manager: canonicalSqliteManager,
        })
        : null;
    const auditResult = auditSecrets({
        handle,
        directories,
        db,
        projection: getCanonicalSecretsProjectionMode(),
    });
    const state = {
        ok: true as const,
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

export function initializeCanonicalSecretsForDirectories(directories: Directories) {
    return initializeCanonicalSecrets(directories);
}

export function getCanonicalSecretsReadBackend(directories: Directories) {
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

export function getCanonicalSecretsWriteBackend(directories: Directories) {
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

export function projectCanonicalSecretsFile(directories: Directories, db: DatabaseSync, { nowMs = Date.now() } = {}) {
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
}: { directories: Directories; db: DatabaseSync; key?: string; recordId?: string | null; operation?: string; error?: { name?: string } | null; nowMs?: number } = {} as { directories: Directories; db: DatabaseSync }) {
    const repairKey = `secrets:${String(key ?? '')}:${String(recordId ?? 'active')}:${String(operation ?? 'unknown')}`;
    recordSecretProjectionRepair(db, {
        repairKey,
        key,
        recordId,
        operation,
        errorClass: String(error?.name ?? 'Error'),
        nowMs,
    });
    invalidateAudit(db, {
        scope: CANONICAL_SECRETS_AUDIT_SCOPE,
        handle: getHandle(directories),
        reason: 'audit_stale_after_secret_projection_failure',
        source: `secrets:${operation ?? 'unknown'}`,
        auditedAtMs: nowMs,
    });
    return repairKey;
}

export function invalidateCanonicalSecretsAfterFileWrite(directories: Directories, operation: string) {
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
    invalidateAudit(db, {
        scope: CANONICAL_SECRETS_AUDIT_SCOPE,
        handle,
        reason: 'audit_stale_after_secret_file_write',
        source: `secrets:${operation}`,
    });
}
