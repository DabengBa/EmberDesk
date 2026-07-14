import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import mime from 'mime-types';
import { sync as writeFileAtomicSync } from 'write-file-atomic';

import { canonicalSqliteManager, withCanonicalTransaction } from '../canonical-sqlite.js';
import { runCanonicalMigrations } from '../canonical-sqlite-migrations.js';
import { getPersistedCanonicalAuditStatus, invalidateCanonicalAuditStatus } from '../canonical-sqlite-shadow-import.js';
import { getCanonicalStorageSlice } from '../canonical-storage-slice-registry.js';
import { uuidv4 } from '../util.js';
import {
    getCanonicalManagedMediaReference,
    getCanonicalManagedMediaFolderState,
    listOpenCanonicalManagedMediaRepairs,
    markCanonicalManagedMediaRepairAttempt,
    recordCanonicalManagedMediaRepair,
    replaceCanonicalManagedMediaFolders,
    resolveCanonicalManagedMediaRepair,
    upsertCanonicalManagedMediaReference,
} from './canonical-managed-media-store.js';

const MANAGED_MEDIA_ROOT = 'managed-media';

function normalizePath(value) {
    return String(value ?? '').split(path.sep).join(path.posix.sep).replace(/^\/+/, '');
}

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

function blockedWriteState({ reason, featureFlags, strict, details = {} }) {
    if (strict) {
        throw new Error(`Canonical managed media writes blocked: ${reason}`);
    }
    return { ok: false, reason, featureFlags, ...details };
}

export function getCanonicalManagedMediaWriteState({
    handle,
    directories,
    dependencies = {},
} = {}) {
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

    return { ok: true, db, featureFlags, migrationStatus, auditStatus, sliceKey: slice.key };
}

function getManagedRoot(directories) {
    return path.resolve(directories.storage, MANAGED_MEDIA_ROOT);
}

function assertCompatibilityPath(directories, compatibilityPath) {
    const normalized = normalizePath(compatibilityPath);
    const root = path.resolve(directories.root);
    const absolute = path.resolve(root, normalized);
    if (!normalized || path.isAbsolute(compatibilityPath) || (absolute !== root && !absolute.startsWith(`${root}${path.sep}`))) {
        throw new Error(`Managed media compatibility path escapes user root: ${compatibilityPath}`);
    }
    return { normalized, absolute };
}

function getContentsBuffer(contents) {
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

function stageManagedContents({ directories, contents, contentHash }) {
    const managedRoot = getManagedRoot(directories);
    const stagingRoot = path.join(managedRoot, '.staging');
    const managedPath = path.join(managedRoot, contentHash);
    fs.mkdirSync(stagingRoot, { recursive: true });
    const stagedPath = path.join(stagingRoot, `${uuidv4()}.stage`);
    fs.writeFileSync(stagedPath, contents);
    if (!fs.existsSync(managedPath)) {
        fs.renameSync(stagedPath, managedPath);
        return { managedPath, installed: true };
    }
    fs.rmSync(stagedPath, { force: true });
    return { managedPath, installed: false };
}

function projectCompatibilityFile({ managedPath, compatibilityPath }) {
    fs.mkdirSync(path.dirname(compatibilityPath), { recursive: true });
    const stagedPath = `${compatibilityPath}.${uuidv4()}.projection`;
    fs.copyFileSync(managedPath, stagedPath);
    fs.renameSync(stagedPath, compatibilityPath);
}

function createRepairKey(operation, referenceId) {
    return `managed_media:${operation}:${referenceId}:${uuidv4()}`;
}

function getReferenceAndManagedPath(db, directories, compatibilityPath) {
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

function saveProjectionRepair(db, { repairKey, reference, operation, compatibilityPath, previousCompatibilityPath = null, reason, nowMs }) {
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

function projectCanonicalManagedMediaFolderState({ directories, folderState }) {
    const metadataPath = path.join(directories.root, 'image-metadata.json');
    let index;
    try {
        index = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    } catch {
        index = { version: 1, images: {}, folders: [] };
    }
    index.images = index.images && typeof index.images === 'object' ? index.images : {};
    for (const [relativePath, metadata] of Object.entries(index.images)) {
        if (normalizePath(relativePath).startsWith('backgrounds/') && metadata && typeof metadata === 'object') {
            delete metadata.folderIds;
        }
    }
    for (const [filename, folderIds] of Object.entries(folderState.imageFolderMap ?? {})) {
        const relativePath = path.posix.join('backgrounds', path.posix.basename(filename));
        const metadata = index.images[relativePath] && typeof index.images[relativePath] === 'object'
            ? index.images[relativePath]
            : {};
        metadata.folderIds = Array.isArray(folderIds) ? [...folderIds] : [];
        index.images[relativePath] = metadata;
    }
    index.folders = Array.isArray(folderState.folders) ? folderState.folders : [];
    writeFileAtomicSync(metadataPath, JSON.stringify(index, null, 4), 'utf8');
}

export async function writeCanonicalManagedMediaFolderState({
    handle,
    directories,
    folderState,
    projectFolderState = null,
    dependencies = {},
    nowMs = Date.now(),
} = {}) {
    const state = getCanonicalManagedMediaWriteState({ handle, directories, dependencies });
    if (!state.ok) {
        return state;
    }

    replaceCanonicalManagedMediaFolders(state.db, {
        folders: folderState?.folders,
        imageFolderMap: folderState?.imageFolderMap,
        nowMs,
    });
    const canonicalFolderState = getCanonicalManagedMediaFolderState(state.db);
    try {
        (projectFolderState ?? projectCanonicalManagedMediaFolderState)({
            directories,
            folderState: canonicalFolderState,
        });
        return { ok: true, authorityCommitted: true, folderState: canonicalFolderState };
    } catch (error) {
        const repairKey = createRepairKey('folder_projection', 'folder-state');
        recordCanonicalManagedMediaRepair(state.db, {
            repairKey,
            operation: 'folder_projection',
            reason: String(error?.message ?? error ?? 'folder_projection_failed'),
            details: { folderState: canonicalFolderState },
            nowMs,
        });
        return {
            ok: false,
            authorityCommitted: true,
            reason: 'projection_failed',
            repairKey,
            folderState: canonicalFolderState,
        };
    }
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
    dependencies = {},
    nowMs = Date.now(),
} = {}) {
    const state = getCanonicalManagedMediaWriteState({ handle, directories, dependencies });
    if (!state.ok) {
        return state;
    }

    const target = assertCompatibilityPath(directories, compatibilityPath);
    const buffer = getContentsBuffer(contents);
    const contentHash = crypto.createHash('sha256').update(buffer).digest('hex');
    const staged = stageManagedContents({ directories, contents: buffer, contentHash });
    const previousReference = getCanonicalManagedMediaReference(state.db, target.normalized);
    let reference = null;
    try {
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
        });
        reference = result.reference;
        if (previousReference && previousReference.blobId !== reference.blobId) {
            withCanonicalTransaction(state.db, db => {
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
    } catch (error) {
        if (staged.installed) {
            fs.rmSync(staged.managedPath, { force: true });
        }
        throw error;
    }

    try {
        (projectCompatibility ?? projectCompatibilityFile)({
            managedPath: staged.managedPath,
            compatibilityPath: target.absolute,
        });
        return { ok: true, authorityCommitted: true, reference, managedPath: staged.managedPath };
    } catch (error) {
        const repairKey = createRepairKey('project', reference.id);
        saveProjectionRepair(state.db, {
            repairKey,
            reference,
            operation: 'project',
            compatibilityPath: target.normalized,
            reason: String(error?.message ?? error ?? 'projection_failed'),
            nowMs,
        });
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
    dependencies = {},
    nowMs = Date.now(),
} = {}) {
    const state = getCanonicalManagedMediaWriteState({ handle, directories, dependencies });
    if (!state.ok) {
        return state;
    }
    const target = assertCompatibilityPath(directories, compatibilityPath);
    const { reference, managedPath } = getReferenceAndManagedPath(state.db, directories, target.normalized);
    if (!reference) {
        return { ok: false, reason: 'reference_not_found' };
    }

    let blobTombstoned = false;
    withCanonicalTransaction(state.db, db => {
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
    });

    try {
        (projectDelete ?? (targetPath => fs.rmSync(targetPath, { force: true })))(target.absolute);
        return {
            ok: true,
            authorityCommitted: true,
            reference,
            blobTombstoned,
            managedRelativePath: reference.managedRelativePath,
            managedPath,
        };
    } catch (error) {
        const repairKey = createRepairKey('delete', reference.id);
        saveProjectionRepair(state.db, {
            repairKey,
            reference,
            operation: 'delete',
            compatibilityPath: target.normalized,
            reason: String(error?.message ?? error ?? 'projection_delete_failed'),
            nowMs,
        });
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
    dependencies = {},
    nowMs = Date.now(),
} = {}) {
    const state = getCanonicalManagedMediaWriteState({ handle, directories, dependencies });
    if (!state.ok) {
        return state;
    }
    const oldTarget = assertCompatibilityPath(directories, oldCompatibilityPath);
    const newTarget = assertCompatibilityPath(directories, newCompatibilityPath);
    const { reference, managedPath } = getReferenceAndManagedPath(state.db, directories, oldTarget.normalized);
    if (!reference) {
        return { ok: false, reason: 'reference_not_found' };
    }

    withCanonicalTransaction(state.db, db => {
        const conflict = db.prepare(`
            SELECT id FROM media_references
            WHERE compatibility_path = ? AND id != ? AND deleted_at_ms IS NULL
        `).get(newTarget.normalized, reference.id);
        if (conflict) {
            throw new Error(`Managed media compatibility path already exists: ${newTarget.normalized}`);
        }
        db.prepare(`
            UPDATE media_references
            SET compatibility_path = ?, display_name = ?, updated_at_ms = ?
            WHERE id = ?
        `).run(newTarget.normalized, displayName ?? path.posix.basename(newTarget.normalized), Number(nowMs), reference.id);
    });
    const renamed = getCanonicalManagedMediaReference(state.db, newTarget.normalized);

    try {
        (projectRename ?? ((input) => {
            projectCompatibilityFile({ managedPath: input.managedPath, compatibilityPath: input.newPath });
            fs.rmSync(input.oldPath, { force: true });
        }))({ managedPath, oldPath: oldTarget.absolute, newPath: newTarget.absolute });
        return { ok: true, authorityCommitted: true, reference: renamed };
    } catch (error) {
        const repairKey = createRepairKey('rename', renamed.id);
        saveProjectionRepair(state.db, {
            repairKey,
            reference: renamed,
            operation: 'rename',
            compatibilityPath: newTarget.normalized,
            previousCompatibilityPath: oldTarget.normalized,
            reason: String(error?.message ?? error ?? 'projection_rename_failed'),
            nowMs,
        });
        return { ok: false, authorityCommitted: true, reason: 'projection_failed', repairKey, reference: renamed };
    }
}

function projectRepair({ db, directories, repair }) {
    if (repair.operation === 'folder_projection') {
        projectCanonicalManagedMediaFolderState({
            directories,
            folderState: getCanonicalManagedMediaFolderState(db),
        });
        return;
    }
    const compatibilityPath = assertCompatibilityPath(directories, repair.details.compatibilityPath);
    const managedRelativePath = normalizePath(repair.details.managedRelativePath);
    const managedPath = path.resolve(directories.storage, managedRelativePath);
    if (!managedRelativePath || !fs.existsSync(managedPath)) {
        throw new Error('missing_managed_media_content');
    }
    if (repair.operation === 'delete') {
        fs.rmSync(compatibilityPath.absolute, { force: true });
        return;
    }
    projectCompatibilityFile({ managedPath, compatibilityPath: compatibilityPath.absolute });
    if (repair.operation === 'rename' && repair.details.previousCompatibilityPath) {
        const previous = assertCompatibilityPath(directories, repair.details.previousCompatibilityPath);
        fs.rmSync(previous.absolute, { force: true });
    }
}

export async function repairCanonicalManagedMediaProjection({
    db,
    directories,
    repairKeys = null,
    nowMs = Date.now(),
} = {}) {
    const requested = repairKeys ? new Set(repairKeys) : null;
    const results = [];
    for (const repair of listOpenCanonicalManagedMediaRepairs(db)) {
        if (requested && !requested.has(repair.repairKey)) {
            continue;
        }
        markCanonicalManagedMediaRepairAttempt(db, { repairKey: repair.repairKey, attemptedAtMs: nowMs });
        try {
            projectRepair({ db, directories, repair });
            resolveCanonicalManagedMediaRepair(db, { repairKey: repair.repairKey, resolvedAtMs: nowMs });
            results.push({ repairKey: repair.repairKey, status: 'repaired', operation: repair.operation });
        } catch (error) {
            results.push({
                repairKey: repair.repairKey,
                status: 'blocked',
                operation: repair.operation,
                blocker: String(error?.message ?? error ?? 'projection_repair_failed'),
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
} = {}) {
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
    reason,
    dependencies = {},
} = {}) {
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
        reason: reason ?? 'audit_stale_after_compatibility_media_mutation',
        source: 'compatibility_media_mutation',
    });
    return true;
}
