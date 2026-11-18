import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import mime from 'mime-types';
import { canonicalSqliteManager, withCanonicalTransaction } from '../canonical-sqlite.ts';
import { runCanonicalMigrations } from '../canonical-sqlite-migrations.ts';
import { getPersistedCanonicalAuditStatus, invalidateCanonicalAuditStatus } from '../canonical-sqlite-shadow-import.ts';
import {
    recordImportLedgerEntry,
    removeImportLedgerEntry,
} from '../canonical-import-ledger.js';
import { getCanonicalStorageSlice } from '../canonical-storage-slice-registry.ts';
import { uuidv4 } from '../util.js';
import {
    getCanonicalManagedMediaReference,
    listCanonicalManagedMediaReferences,
    listOpenCanonicalManagedMediaRepairs,
    markCanonicalManagedMediaRepairAttempt,
    recordCanonicalManagedMediaRepair,
    resolveCanonicalManagedMediaRepair,
    upsertCanonicalManagedMediaReference,
} from './canonical-managed-media-store.ts';

const MANAGED_MEDIA_ROOT = 'managed-media';

type Directories = import('../users.js').UserDirectoryList;
type Flags = ReturnType<ReturnType<typeof getCanonicalStorageSlice>['getFeatureFlags']>;
type OpenOptions = { handle: string | undefined; directories: Directories | undefined; featureFlags: { enabled: boolean; strict: boolean } };
type Dependencies = {
    getSlice: () => ReturnType<typeof getCanonicalStorageSlice>;
    getFeatureFlags: () => Flags;
    getProjectionMode: () => string;
    openDatabase: (options: OpenOptions) => DatabaseSync | null;
    runMigrations: (db: DatabaseSync, options: Parameters<typeof runCanonicalMigrations>[1]) => ReturnType<typeof runCanonicalMigrations>;
    getAuditStatus: (db: DatabaseSync, options: Parameters<typeof getPersistedCanonicalAuditStatus>[1]) => ReturnType<typeof getPersistedCanonicalAuditStatus>;
};
type BaseOptions = { handle?: string; directories: Directories; dependencies?: Partial<Dependencies> };
type Reference = ReturnType<typeof getCanonicalManagedMediaReference>;
type ProjectionFile = { managedPath: string; compatibilityPath: string };
type RenameProjection = { managedPath: string; oldPath: string; newPath: string };
type Repair = ReturnType<typeof listOpenCanonicalManagedMediaRepairs>[number];
// Repair details originate in unchecked JSON; preserve the existing property access.
type RepairDetails = { compatibilityPath: string; previousCompatibilityPath?: string; managedRelativePath?: string };
// JS audit API accepts these values despite inference from its null defaults.


function normalizePath(value: unknown) {
    return String(value ?? '').split(path.sep).join(path.posix.sep).replace(/^\/+/, '');
}

function getDefaultDependencies() {
    const slice = getCanonicalStorageSlice('managed_media');
    return {
        getFeatureFlags: () => slice.getFeatureFlags(),
        getSlice: () => slice,
        getProjectionMode: () => typeof slice.getProjectionMode === 'function' ? slice.getProjectionMode() : 'sync',
        openDatabase: (options: OpenOptions): DatabaseSync | null => canonicalSqliteManager.open(options),
        runMigrations: (db: DatabaseSync, options: Parameters<typeof runCanonicalMigrations>[1]) => runCanonicalMigrations(db, options),
        getAuditStatus: (db: DatabaseSync, options: Parameters<typeof getPersistedCanonicalAuditStatus>[1]) => getPersistedCanonicalAuditStatus(db, options),
    };
}

function resolveProjectionMode(projection: string | null, dependencies: Partial<Dependencies>) {
    if (projection === 'off' || projection === 'sync') {
        return projection;
    }
    const getProjectionMode = dependencies.getProjectionMode ?? getDefaultDependencies().getProjectionMode;
    return getProjectionMode();
}

function blockedWriteState({ reason, featureFlags, strict, details = {} }: { reason: string; featureFlags: Flags; strict: boolean; details?: object }) {
    if (strict) {
        throw new Error(`Canonical managed media writes blocked: ${reason}`);
    }
    return { ok: false, reason, featureFlags, ...details } as const;
}

export function getCanonicalManagedMediaWriteState({
    handle,
    directories,
    dependencies = {},
}: { handle?: string; directories?: Directories; dependencies?: Partial<Dependencies> } = {}) {
    const defaults = getDefaultDependencies();
    const slice = (dependencies.getSlice ?? defaults.getSlice)();
    const featureFlags = (dependencies.getFeatureFlags ?? defaults.getFeatureFlags)();
    const strict = !!featureFlags.strict;

    if (!featureFlags.enabled) {
        return blockedWriteState({ reason: 'canonical_storage_disabled', featureFlags, strict });
    }
    if (!featureFlags.writes) {
        return blockedWriteState({ reason: 'canonical_writes_disabled', featureFlags, strict });
    }

    const db = (dependencies.openDatabase ?? defaults.openDatabase)({
        handle,
        directories,
        featureFlags: { enabled: true, strict },
    });
    if (!db) {
        return blockedWriteState({ reason: 'canonical_storage_unavailable', featureFlags, strict });
    }

    const migrationStatus = (dependencies.runMigrations ?? defaults.runMigrations)(db, { strict });
    if (!migrationStatus.ok) {
        return blockedWriteState({ reason: 'migration_blocked', featureFlags, strict, details: { migrationStatus } });
    }

    const auditStatus = (dependencies.getAuditStatus ?? defaults.getAuditStatus)(db, { scope: slice.auditScope });
    if (auditStatus.blocking) {
        return blockedWriteState({
            reason: auditStatus.reason ?? 'audit_not_run',
            featureFlags,
            strict,
            details: { auditStatus },
        });
    }

    const rollback = slice.getRollbackBlockers({
        db,
        featureFlags,
        phase: 'writes',
        persistedAuditStatus: auditStatus,
    });
    if (!rollback.ok) {
        return blockedWriteState({
            reason: rollback.blockers[0]?.code ?? 'managed_media_write_blocked',
            featureFlags,
            strict,
            details: { auditStatus, rollback },
        });
    }

    return { ok: true, db, featureFlags, migrationStatus, auditStatus, sliceKey: slice.key } as const;
}

function getManagedRoot(directories: Directories) {
    return path.resolve(directories.storage, MANAGED_MEDIA_ROOT);
}

function assertCompatibilityPath(directories: Directories, compatibilityPath: string) {
    const normalized = normalizePath(compatibilityPath);
    const root = path.resolve(directories.root);
    const absolute = path.resolve(root, normalized);
    if (!normalized || path.isAbsolute(compatibilityPath) || (absolute !== root && !absolute.startsWith(`${root}${path.sep}`))) {
        throw new Error(`Managed media compatibility path escapes user root: ${compatibilityPath}`);
    }
    return { normalized, absolute };
}

function getContentsBuffer(contents: unknown) {
    if (Buffer.isBuffer(contents)) {
        return contents;
    }
    if (contents instanceof Uint8Array) {
        return Buffer.from(contents);
    }
    if (typeof contents === 'string') {
        return fs.readFileSync(contents);
    }
    throw new Error('Managed media contents must be a buffer, Uint8Array, or source path');
}

function stageManagedContents({ directories, contents, contentHash }: { directories: Directories; contents: Buffer; contentHash: string }) {
    const managedRoot = getManagedRoot(directories);
    const stagingRoot = path.join(managedRoot, '.staging');
    const managedPath = path.join(managedRoot, contentHash);
    fs.mkdirSync(stagingRoot, { recursive: true });
    const stagedPath = path.join(stagingRoot, `${uuidv4()}.stage`);
    try {
        fs.writeFileSync(stagedPath, contents);
        if (!fs.existsSync(managedPath)) {
            fs.renameSync(stagedPath, managedPath);
            return { managedPath, installed: true };
        }
        return { managedPath, installed: false };
    } finally {
        fs.rmSync(stagedPath, { force: true });
    }
}

function projectCompatibilityFile({ managedPath, compatibilityPath }: ProjectionFile) {
    fs.mkdirSync(path.dirname(compatibilityPath), { recursive: true });
    const stagedPath = `${compatibilityPath}.${uuidv4()}.projection`;
    fs.copyFileSync(managedPath, stagedPath);
    fs.renameSync(stagedPath, compatibilityPath);
}

function createRepairKey(operation: string, referenceId: string) {
    return `managed_media:${operation}:${referenceId}:${uuidv4()}`;
}

function getReferenceAndManagedPath(db: DatabaseSync, directories: Directories, compatibilityPath: string) {
    const reference = getCanonicalManagedMediaReference(db, compatibilityPath);
    if (!reference) {
        return { reference: null, managedPath: null };
    }
    const managedPath = path.resolve(directories.storage, reference.managedRelativePath);
    const storageRoot = path.resolve(directories.storage);
    if (managedPath !== storageRoot && !managedPath.startsWith(`${storageRoot}${path.sep}`)) {
        throw new Error(`Managed media path escapes storage root: ${reference.managedRelativePath}`);
    }
    return { reference, managedPath };
}

function saveProjectionRepair(db: DatabaseSync, { repairKey, reference, operation, compatibilityPath, previousCompatibilityPath = null, reason, nowMs }: { repairKey: string | null; reference: Reference; operation: string; compatibilityPath: string; previousCompatibilityPath?: string | null; reason: string; nowMs: number }) {
    recordCanonicalManagedMediaRepair(db, {
        repairKey,
        blobId: reference?.blobId ?? null,
        mediaReferenceId: reference?.id ?? null,
        operation,
        reason,
        details: {
            compatibilityPath,
            previousCompatibilityPath,
            managedRelativePath: reference?.managedRelativePath ?? null,
        },
        nowMs,
    });
}

export async function writeCanonicalManagedMedia({
    handle,
    directories,
    compatibilityPath,
    ownerType,
    ownerId,
    role,
    displayName,
    contents,
    mediaType = null,
    metadata = {},
    projectCompatibility = null,
    projection = null,
    dependencies = {},
    nowMs = Date.now(),
}: BaseOptions & { compatibilityPath: string; ownerType: string; ownerId?: string; role?: string; displayName?: string; contents?: unknown; mediaType?: string | null; metadata?: unknown; projectCompatibility?: ((input: ProjectionFile) => void) | null; projection?: string | null; nowMs?: number } = {} as BaseOptions & { compatibilityPath: string; ownerType: string }) {
    const state = getCanonicalManagedMediaWriteState({ handle, directories, dependencies });
    if (!state.ok) {
        return state;
    }
    const projectionMode = resolveProjectionMode(projection, dependencies);

    const target = assertCompatibilityPath(directories, compatibilityPath);
    const buffer = getContentsBuffer(contents);
    const contentHash = crypto.createHash('sha256').update(buffer).digest('hex');
    const staged = stageManagedContents({ directories, contents: buffer, contentHash });
    const previousReference = getCanonicalManagedMediaReference(state.db, target.normalized);
    const repairKey = createRepairKey('project', `${target.normalized}:${contentHash}`);
    // A hash path may already be in use by another writer, even if this call
    // installed it. On any database failure retain it rather than unlinking.
    const result = upsertCanonicalManagedMediaReference(state.db, {
        compatibilityPath: target.normalized,
        contentHash,
        sizeBytes: buffer.length,
        mediaType: mediaType ?? (mime.lookup(target.normalized) || 'application/octet-stream'),
        managedRelativePath: `${MANAGED_MEDIA_ROOT}/${contentHash}`,
        ownerType,
        ownerId,
        role,
        displayName,
        metadata,
        nowMs,
    }, {
        onPersist: projectionMode === 'off' ? null : (db, saved) => saveProjectionRepair(db, {
            repairKey,
            reference: saved.reference,
            operation: 'project',
            compatibilityPath: target.normalized,
            reason: 'projection_pending',
            nowMs,
        }),
    });
    // The store reads back the reference it just upserted in the same transaction.
    const reference = result.reference as NonNullable<Reference>;
    if (previousReference && previousReference.blobId !== reference.blobId) {
        withCanonicalTransaction(state.db, (db: DatabaseSync) => {
            const stillReferenced = db.prepare(`
                SELECT 1 FROM media_references
                WHERE blob_id = ? AND deleted_at_ms IS NULL
                LIMIT 1
            `).get(previousReference.blobId);
            if (!stillReferenced) {
                db.prepare(`
                    UPDATE managed_blobs
                    SET lifecycle_state = 'tombstoned', deleted_at_ms = ?, updated_at_ms = ?
                    WHERE id = ?
                `).run(Number(nowMs), Number(nowMs), previousReference.blobId);
            }
        });
    }

    try {
        if (projectionMode !== 'off') {
            withCanonicalTransaction(state.db, (db: DatabaseSync) => {
                const current = getCanonicalManagedMediaReference(db, target.normalized);
                if (!current || current.deletedAtMs != null) throw new Error('managed_media_projection_path_changed');
                const currentPath = path.resolve(directories.storage, current.managedRelativePath);
                (projectCompatibility ?? projectCompatibilityFile)({ managedPath: currentPath, compatibilityPath: target.absolute });
                recordImportLedgerEntry(db, {
                    sliceKey: 'managed_media', sourcePath: target.normalized,
                    contentHash: current.contentHash, origin: 'projection', nowMs,
                });
                resolveCanonicalManagedMediaRepair(db, { repairKey, resolvedAtMs: nowMs });
            });
        }
        return { ok: true, authorityCommitted: true, reference, managedPath: staged.managedPath };
    } catch (error) {
        withCanonicalTransaction(state.db, (db: DatabaseSync) => saveProjectionRepair(db, {
            repairKey, reference: getCanonicalManagedMediaReference(db, target.normalized),
            operation: 'project', compatibilityPath: target.normalized,
            reason: String((error as { message?: unknown } | null)?.message ?? error ?? 'projection_failed'), nowMs,
        }));
        return {
            ok: false,
            authorityCommitted: true,
            reason: 'projection_failed',
            repairKey,
            reference,
        };
    }
}

export async function deleteCanonicalManagedMediaReference({
    handle,
    directories,
    compatibilityPath,
    projectDelete = null,
    projection = null,
    dependencies = {},
    nowMs = Date.now(),
}: BaseOptions & { compatibilityPath: string; projectDelete?: ((path: string) => void) | null; projection?: string | null; nowMs?: number } = {} as BaseOptions & { compatibilityPath: string }) {
    const state = getCanonicalManagedMediaWriteState({ handle, directories, dependencies });
    if (!state.ok) {
        return state;
    }
    const projectionMode = resolveProjectionMode(projection, dependencies);
    const target = assertCompatibilityPath(directories, compatibilityPath);
    // Assigned synchronously inside withCanonicalTransaction.
    let reference = null as Reference;
    let managedPath: string | null = null;
    let blobTombstoned = false;
    let repairKey: string | null = null;
    withCanonicalTransaction(state.db, (db: DatabaseSync) => {
        ({ reference, managedPath } = getReferenceAndManagedPath(db, directories, target.normalized));
        if (!reference || reference.deletedAtMs != null) return;
        repairKey = createRepairKey('delete', reference.id);
        db.prepare(`
            UPDATE media_references
            SET deleted_at_ms = ?, updated_at_ms = ?
            WHERE id = ? AND deleted_at_ms IS NULL
        `).run(Number(nowMs), Number(nowMs), reference.id);
        const activeReference = db.prepare(`
            SELECT 1 FROM media_references
            WHERE blob_id = ? AND deleted_at_ms IS NULL
            LIMIT 1
        `).get(reference.blobId);
        if (!activeReference) {
            blobTombstoned = true;
            db.prepare(`
                UPDATE managed_blobs
                SET lifecycle_state = 'tombstoned', deleted_at_ms = ?, updated_at_ms = ?
                WHERE id = ?
            `).run(Number(nowMs), Number(nowMs), reference.blobId);
        }
        if (projectionMode !== 'off') {
            saveProjectionRepair(db, {
                repairKey, reference, operation: 'delete', compatibilityPath: target.normalized,
                reason: 'projection_pending', nowMs,
            });
        } else {
            fs.rmSync(target.absolute, { force: true });
            removeImportLedgerEntry(db, { sliceKey: 'managed_media', sourcePath: target.normalized });
        }
    });
    if (!reference) return { ok: false, reason: 'reference_not_found' };


    if (projectionMode === 'off') {
        return {
            ok: true,
            authorityCommitted: true,
            reference,
            blobTombstoned,
            managedRelativePath: reference.managedRelativePath,
            managedPath,
        };
    }

    try {
        withCanonicalTransaction(state.db, (db: DatabaseSync) => {
            if (getCanonicalManagedMediaReference(db, target.normalized)?.deletedAtMs == null) {
                throw new Error('managed_media_projection_path_reused');
            }
            (projectDelete ?? (targetPath => fs.rmSync(targetPath, { force: true })))(target.absolute);
            removeImportLedgerEntry(db, { sliceKey: 'managed_media', sourcePath: target.normalized });
            resolveCanonicalManagedMediaRepair(db, { repairKey, resolvedAtMs: nowMs });
        });
        return {
            ok: true,
            authorityCommitted: true,
            reference,
            blobTombstoned,
            managedRelativePath: reference.managedRelativePath,
            managedPath,
        };
    } catch (error) {
        withCanonicalTransaction(state.db, (db: DatabaseSync) => saveProjectionRepair(db, {
            repairKey, reference, operation: 'delete', compatibilityPath: target.normalized,
            reason: String((error as { message?: unknown } | null)?.message ?? error ?? 'projection_delete_failed'), nowMs,
        }));
        return { ok: false, authorityCommitted: true, reason: 'projection_failed', repairKey, reference, blobTombstoned };
    }
}

export async function renameCanonicalManagedMediaReference({
    handle,
    directories,
    oldCompatibilityPath,
    newCompatibilityPath,
    displayName = null,
    projectRename = null,
    projection = null,
    dependencies = {},
    nowMs = Date.now(),
}: BaseOptions & { oldCompatibilityPath: string; newCompatibilityPath: string; displayName?: string | null; projectRename?: ((input: RenameProjection) => void) | null; projection?: string | null; nowMs?: number } = {} as BaseOptions & { oldCompatibilityPath: string; newCompatibilityPath: string }) {
    const state = getCanonicalManagedMediaWriteState({ handle, directories, dependencies });
    if (!state.ok) {
        return state;
    }
    const projectionMode = resolveProjectionMode(projection, dependencies);
    const oldTarget = assertCompatibilityPath(directories, oldCompatibilityPath);
    const newTarget = assertCompatibilityPath(directories, newCompatibilityPath);
    let reference = null as Reference;
    let renamed: Reference = null;
    let repairKey: string | null = null;
    withCanonicalTransaction(state.db, (db: DatabaseSync) => {
        reference = getCanonicalManagedMediaReference(db, oldTarget.normalized);
        if (!reference || reference.deletedAtMs != null) return;
        const conflict = db.prepare(`
            SELECT id FROM media_references
            WHERE compatibility_path = ? AND id != ? AND deleted_at_ms IS NULL
        `).get(newTarget.normalized, reference.id);
        if (conflict) {
            throw new Error(`Managed media compatibility path already exists: ${newTarget.normalized}`);
        }
        repairKey = createRepairKey('rename', reference.id);
        db.prepare(`
            UPDATE media_references
            SET compatibility_path = ?, display_name = ?, updated_at_ms = ?
            WHERE id = ?
        `).run(newTarget.normalized, displayName ?? path.posix.basename(newTarget.normalized), Number(nowMs), reference.id);
        if (projectionMode !== 'off') saveProjectionRepair(db, {
            repairKey, reference, operation: 'rename', compatibilityPath: newTarget.normalized,
            previousCompatibilityPath: oldTarget.normalized, reason: 'projection_pending', nowMs,
        });
        renamed = getCanonicalManagedMediaReference(db, newTarget.normalized);
        if (projectionMode === 'off') {
            const oldOwner = getCanonicalManagedMediaReference(db, oldTarget.normalized);
            if (!oldOwner || oldOwner.deletedAtMs != null) {
                fs.rmSync(oldTarget.absolute, { force: true });
                removeImportLedgerEntry(db, { sliceKey: 'managed_media', sourcePath: oldTarget.normalized });
            }
        }
    });
    if (!reference) return { ok: false, reason: 'reference_not_found' };


    if (projectionMode === 'off') {
        return { ok: true, authorityCommitted: true, reference: renamed };
    }

    try {
        withCanonicalTransaction(state.db, (db: DatabaseSync) => {
            const current = getCanonicalManagedMediaReference(db, newTarget.normalized);
            if (!current || current.deletedAtMs != null) throw new Error('managed_media_projection_path_changed');
            const currentManagedPath = path.resolve(directories.storage, current.managedRelativePath);
            (projectRename ?? ((input) => {
                projectCompatibilityFile({ managedPath: input.managedPath, compatibilityPath: input.newPath });
                fs.rmSync(input.oldPath, { force: true });
            }))({ managedPath: currentManagedPath, oldPath: oldTarget.absolute, newPath: newTarget.absolute });
            recordImportLedgerEntry(db, {
                sliceKey: 'managed_media', sourcePath: newTarget.normalized,
                contentHash: current.contentHash, origin: 'projection', nowMs,
            });
            removeImportLedgerEntry(db, { sliceKey: 'managed_media', sourcePath: oldTarget.normalized });
            resolveCanonicalManagedMediaRepair(db, { repairKey, resolvedAtMs: nowMs });
        });
        return { ok: true, authorityCommitted: true, reference: renamed };
    } catch (error) {
        withCanonicalTransaction(state.db, (db: DatabaseSync) => saveProjectionRepair(db, {
            repairKey, reference: renamed, operation: 'rename', compatibilityPath: newTarget.normalized,
            previousCompatibilityPath: oldTarget.normalized,
            reason: String((error as { message?: unknown } | null)?.message ?? error ?? 'projection_rename_failed'), nowMs,
        }));
        return { ok: false, authorityCommitted: true, reason: 'projection_failed', repairKey, reference: renamed };
    }
}

function projectRepair({ directories, repair }: { directories: Directories; repair: Repair }) {
    const details = repair.details as RepairDetails;
    const compatibilityPath = assertCompatibilityPath(directories, details.compatibilityPath);
    const managedRelativePath = normalizePath(details.managedRelativePath);
    const managedPath = path.resolve(directories.storage, managedRelativePath);
    if (!managedRelativePath || !fs.existsSync(managedPath)) {
        throw new Error('missing_managed_media_content');
    }
    if (repair.operation === 'delete') {
        fs.rmSync(compatibilityPath.absolute, { force: true });
        return;
    }
    projectCompatibilityFile({ managedPath, compatibilityPath: compatibilityPath.absolute });
    if (repair.operation === 'rename' && details.previousCompatibilityPath) {
        const previous = assertCompatibilityPath(directories, details.previousCompatibilityPath);
        fs.rmSync(previous.absolute, { force: true });
    }
}

export async function repairCanonicalManagedMediaProjection({
    db,
    directories,
    repairKeys = null,
    nowMs = Date.now(),
}: { db: DatabaseSync; directories: Directories; repairKeys?: string[] | null; nowMs?: number } = {} as { db: DatabaseSync; directories: Directories }) {
    const requested = repairKeys ? new Set(repairKeys) : null;
    const results = [];
    for (const repair of listOpenCanonicalManagedMediaRepairs(db)) {
        if (requested && !requested.has(repair.repairKey)) {
            continue;
        }
        markCanonicalManagedMediaRepairAttempt(db, { repairKey: repair.repairKey, attemptedAtMs: nowMs });
        try {
            withCanonicalTransaction(db, (txn: DatabaseSync) => {
                const latest = listOpenCanonicalManagedMediaRepairs(txn)
                    .find(item => item.repairKey === repair.repairKey);
                if (!latest) return;
                const details = latest.details as RepairDetails | null;
                const compatibilityPath = normalizePath(details?.compatibilityPath);
                const previousCompatibilityPath = normalizePath(details?.previousCompatibilityPath);
                const current = listCanonicalManagedMediaReferences(txn, { includeDeleted: true })
                    .find(item => item.id === latest.mediaReferenceId) ?? null;
                if (latest.operation === 'delete') {
                    const pathOwner = compatibilityPath ? getCanonicalManagedMediaReference(txn, compatibilityPath) : null;
                    if (pathOwner && pathOwner.deletedAtMs == null) {
                        resolveCanonicalManagedMediaRepair(txn, { repairKey: latest.repairKey, resolvedAtMs: nowMs });
                        return;
                    }
                    projectRepair({ directories, repair: latest });
                    removeImportLedgerEntry(txn, { sliceKey: 'managed_media', sourcePath: compatibilityPath });
                } else if (current && current.deletedAtMs == null) {
                    const currentPathName = normalizePath(current.compatibilityPath);
                    const managedPath = path.resolve(directories.storage, current.managedRelativePath);
                    if (!managedPath.startsWith(`${path.resolve(directories.storage)}${path.sep}`) || !fs.existsSync(managedPath)) {
                        throw new Error('missing_managed_media_content');
                    }
                    const target = assertCompatibilityPath(directories, currentPathName);
                    projectCompatibilityFile({ managedPath, compatibilityPath: target.absolute });
                    if (latest.operation === 'rename' && previousCompatibilityPath && previousCompatibilityPath !== currentPathName) {
                        const previousOwner = getCanonicalManagedMediaReference(txn, previousCompatibilityPath);
                        if (!previousOwner || previousOwner.deletedAtMs != null) {
                            fs.rmSync(assertCompatibilityPath(directories, previousCompatibilityPath).absolute, { force: true });
                            removeImportLedgerEntry(txn, { sliceKey: 'managed_media', sourcePath: previousCompatibilityPath });
                        }
                    }
                    recordImportLedgerEntry(txn, {
                        sliceKey: 'managed_media',
                        sourcePath: currentPathName,
                        contentHash: current.contentHash,
                        origin: 'projection',
                        nowMs,
                    });
                } else {
                    const pathOwner = compatibilityPath ? getCanonicalManagedMediaReference(txn, compatibilityPath) : null;
                    if (pathOwner && pathOwner.deletedAtMs == null) {
                        resolveCanonicalManagedMediaRepair(txn, { repairKey: latest.repairKey, resolvedAtMs: nowMs });
                        return;
                    }
                    fs.rmSync(assertCompatibilityPath(directories, compatibilityPath).absolute, { force: true });
                    removeImportLedgerEntry(txn, { sliceKey: 'managed_media', sourcePath: compatibilityPath });
                }
                resolveCanonicalManagedMediaRepair(txn, { repairKey: latest.repairKey, resolvedAtMs: nowMs });
            });
            results.push({ repairKey: repair.repairKey, status: 'repaired', operation: repair.operation });
        } catch (error) {
            results.push({
                repairKey: repair.repairKey,
                status: 'blocked',
                operation: repair.operation,
                blocker: String((error as { message?: unknown } | null)?.message ?? error ?? 'projection_repair_failed'),
            });
        }
    }
    if (results.some(result => result.status === 'repaired')) {
        invalidateCanonicalAuditStatus(db, {
            scope: 'managed_media',
            handle: null,
            reason: 'audit_stale_after_managed_media_projection_repair',
            source: 'canonical_repair:repair_managed_media_projection',
        });
    }
    return { ok: results.every(result => result.status === 'repaired'), results };
}

export async function collectCanonicalManagedMediaGarbage({
    handle,
    directories,
    db = null,
    dryRun = true,
    dependencies = {},
}: BaseOptions & { db?: DatabaseSync | null; dryRun?: boolean } = {} as BaseOptions) {
    let activeDb = db;
    if (!activeDb) {
        const state = getCanonicalManagedMediaWriteState({ handle, directories, dependencies });
        if (!state.ok) {
            return state;
        }
        activeDb = state.db;
    }
    const auditStatus = (dependencies.getAuditStatus ?? getDefaultDependencies().getAuditStatus)(activeDb, { scope: 'managed_media' });
    if (auditStatus.blocking) {
        return { ok: false, reason: auditStatus.reason ?? 'audit_not_run', dryRun: !!dryRun, candidateCount: 0, deletedCount: 0 };
    }
    const rows = activeDb.prepare(`
        SELECT id, relative_path
        FROM managed_blobs
        WHERE lifecycle_state = 'tombstoned'
            AND deleted_at_ms IS NOT NULL
            AND NOT EXISTS (
                SELECT 1 FROM media_references
                WHERE media_references.blob_id = managed_blobs.id
                    AND media_references.deleted_at_ms IS NULL
            )
        ORDER BY deleted_at_ms ASC, id ASC
    `).all();
    const candidates = [];
    for (const row of rows) {
        const relativePath = normalizePath(row.relative_path);
        const absolutePath = path.resolve(directories.storage, relativePath);
        if (!relativePath || !absolutePath.startsWith(`${path.resolve(directories.storage)}${path.sep}`)) {
            continue;
        }
        candidates.push({ id: String(row.id), relativePath, absolutePath });
    }
    if (!dryRun) {
        for (const candidate of candidates) {
            fs.rmSync(candidate.absolutePath, { force: true });
            activeDb.prepare(`
                UPDATE managed_blobs
                SET lifecycle_state = 'collected', updated_at_ms = ?
                WHERE id = ?
            `).run(Date.now(), candidate.id);
        }
    }
    return {
        ok: true,
        dryRun: !!dryRun,
        candidateCount: candidates.length,
        deletedCount: dryRun ? 0 : candidates.length,
        candidates: candidates.map(candidate => ({ id: candidate.id, relativePath: candidate.relativePath })),
    };
}

export function invalidateCanonicalManagedMediaAudit({
    handle,
    directories,
    operation,
    dependencies = {},
}: { handle?: string; directories?: Directories; operation?: string; dependencies?: Partial<Dependencies> } = {}) {
    const defaults = getDefaultDependencies();
    const featureFlags = (dependencies.getFeatureFlags ?? defaults.getFeatureFlags)();
    if (!featureFlags.enabled) {
        return false;
    }
    const openDatabase = dependencies.openDatabase ?? defaults.openDatabase;
    const db = openDatabase({
        handle,
        directories,
        featureFlags: { enabled: true, strict: false },
    });
    if (!db) {
        return false;
    }
    const migration = (dependencies.runMigrations ?? defaults.runMigrations)(db, { strict: false });
    if (!migration.ok) {
        return false;
    }
    invalidateCanonicalAuditStatus(db, {
        scope: 'managed_media',
        handle,
        reason: 'audit_stale_after_compatibility_media_mutation',
        source: operation ?? 'compatibility_media_mutation',
    });
    return true;
}
