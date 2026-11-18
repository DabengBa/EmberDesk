import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import mime from 'mime-types';

import {
    classifyImportCandidate,
    recordImportLedgerEntry,
    resolveAuditDriftReason,
} from './canonical-import-ledger.js';
import { getCanonicalMigrationStatus, runCanonicalMigrations } from './canonical-sqlite-migrations.ts';
import { withCanonicalTransaction } from './canonical-sqlite.ts';
import { persistCanonicalAuditStatus } from './canonical-sqlite-shadow-import.ts';
import {
    hashCanonicalManagedMediaBuffer,
    installCanonicalManagedMediaContents,
    listCanonicalManagedMediaReferences,
    managedMediaRelativePath,
    persistCanonicalManagedMediaContents,
} from './endpoints/canonical-managed-media-store.ts';
import { isVirtualAvatarReference } from './canonical-avatar-blobs.js';
import { isPathUnderParent } from './util.js';

export const MANAGED_MEDIA_AUDIT_SCOPE = 'managed_media';

const MEDIA_DOMAINS = Object.freeze([
    { key: 'assets', ownerType: 'asset', role: 'asset', recursive: true },
    { key: 'files', ownerType: 'attachment', role: 'attachment', recursive: true },
    { key: 'userImages', ownerType: 'user_image', role: 'user_image', recursive: true },
] as const);

type MediaDirectories = { root: string; storage: string; assets?: string; files?: string; userImages?: string; backgrounds?: string };
type MediaDomain = (typeof MEDIA_DOMAINS)[number];
type MigrationStatus = ReturnType<typeof runCanonicalMigrations>;
type MediaImportEntry = { compatibility_path: string; status: string; errorMessage?: string };
type MediaAuditEntry = { compatibility_path: string; status: string; drift_types: string[]; details: { suppressed?: boolean; [key: string]: unknown }; audited_at_ms: number };
type MediaImportOptions = {
    handle: string;
    directories: MediaDirectories;
    featureFlags: { enabled?: boolean; shadowImport?: boolean; strict?: boolean } | null | undefined;
    manager: { open(options: { handle: string; directories: MediaDirectories; featureFlags: { enabled: boolean; strict: boolean } }): DatabaseSync | null };
    nowMs?: number;
};

function toCompatibilityPath(directories: MediaDirectories, filePath: string) {
    return path.relative(directories.root, filePath).split(path.sep).join(path.posix.sep);
}

function isSafeCompatibilityPath(directories: MediaDirectories, compatibilityPath: string, domainRoot: string | null | undefined = null) {
    if (typeof compatibilityPath !== 'string' || !compatibilityPath) {
        return false;
    }
    if (compatibilityPath.includes('/') && compatibilityPath.includes('\\')) {
        return false;
    }
    if (path.isAbsolute(compatibilityPath)
        || path.posix.isAbsolute(compatibilityPath)
        || path.win32.isAbsolute(compatibilityPath)) {
        return false;
    }
    const normalized = compatibilityPath.split(path.sep).join(path.posix.sep);
    if (normalized !== path.posix.normalize(normalized)) {
        return false;
    }
    const root = path.resolve(directories.root);
    const resolved = path.resolve(root, normalized);
    if (!isPathUnderParent(root, resolved)) {
        return false;
    }
    return !domainRoot || isPathUnderParent(path.resolve(domainRoot), resolved);
}

function listDomainFiles(directories: MediaDirectories, domain: MediaDomain) {
    const root = directories?.[domain.key];
    if (!root || !fs.existsSync(root)) {
        return [];
    }
    const files: { domain: MediaDomain; filePath: string; compatibilityPath: string }[] = [];
    const walk = (current: string) => {
        let entries = [];
        try {
            entries = fs.readdirSync(current, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            if (entry.isSymbolicLink()) {
                continue;
            }
            const filePath = path.join(current, entry.name);
            if (entry.isDirectory()) {
                if (domain.recursive && !(domain.key === 'assets' && entry.name === 'temp')) {
                    walk(filePath);
                }
                continue;
            }
            if (!entry.isFile() || entry.name === '.placeholder' || entry.name.endsWith('.placeholder')) {
                continue;
            }
            if (isSafeCompatibilityPath(directories, toCompatibilityPath(directories, filePath), root)) {
                files.push({ domain, filePath, compatibilityPath: toCompatibilityPath(directories, filePath) });
            }
        }
    };
    walk(root);
    return files.sort((left, right) => left.compatibilityPath.localeCompare(right.compatibilityPath));
}

function listCompatibilityMedia(directories: MediaDirectories) {
    return MEDIA_DOMAINS.flatMap(domain => listDomainFiles(directories, domain));
}

function hashFile(filePath: string) {
    const hash = crypto.createHash('sha256');
    hash.update(fs.readFileSync(filePath));
    return hash.digest('hex');
}

function summarizeImport({ handle, entries, skipped = false, reason = null, migrationStatus = null }: { handle: string; entries: MediaImportEntry[]; skipped?: boolean; reason?: string | null; migrationStatus?: MigrationStatus | null }) {
    const count = (status: string) => entries.filter(entry => entry.status === status).length;
    return {
        ok: skipped || (reason == null && count('error') === 0 && migrationStatus?.ok !== false),
        handle,
        skipped,
        reason,
        importedCount: count('imported'),
        updatedCount: count('updated'),
        unchangedCount: count('unchanged'),
        failedCount: count('error'),
        migrationStatus,
        entries,
    };
}

function buildAuditSummary({ handle, migrationStatus, entries, ignoreSuppressed = false }: { handle: string; migrationStatus: MigrationStatus; entries: MediaAuditEntry[]; ignoreSuppressed?: boolean }) {
    const active = entries.filter(entry => !(ignoreSuppressed && entry.details?.suppressed));
    const blocking = active.some(entry => entry.status === 'drift' || entry.status === 'error');
    return {
        ok: !blocking,
        handle,
        hasDrift: active.some(entry => entry.status === 'drift'),
        blocking,
        reason: resolveAuditDriftReason(blocking, entries),
        migrationStatus,
        entries,
    };
}

function getDomainForPath(directories: MediaDirectories, compatibilityPath: string) {
    return MEDIA_DOMAINS.find(domain => {
        const root = directories?.[domain.key];
        return root && isSafeCompatibilityPath(directories, compatibilityPath, root);
    }) ?? null;
}

function isRetiredCompatibilityPath(directories: MediaDirectories, reference: ReturnType<typeof listCanonicalManagedMediaReferences>[number]) {
    return reference.ownerType === 'background'
        && isSafeCompatibilityPath(directories, reference.compatibilityPath, directories?.backgrounds);
}

/** Backfills old registered blobs without importing any changes from the projection. */
export function backfillCanonicalManagedMediaContents({ directories, db }: { directories: MediaDirectories; db: DatabaseSync }) {
    const missing = listCanonicalManagedMediaReferences(db).filter(reference => reference.lifecycleState === 'active'
        && /^[a-f0-9]{64}$/.test(reference.contentHash)
        && reference.managedRelativePath === managedMediaRelativePath(reference.contentHash)
        && !fs.existsSync(path.join(directories.storage, reference.managedRelativePath)));
    if (!missing.length) return;

    const compatibilityFiles = new Map(listCompatibilityMedia(directories).map(item => [item.compatibilityPath, item.filePath]));
    for (const reference of missing) {
        const sourcePath = compatibilityFiles.get(reference.compatibilityPath);
        if (!sourcePath) continue;
        const managedPath = path.join(directories.storage, reference.managedRelativePath);
        const contents = fs.readFileSync(sourcePath);
        if (hashCanonicalManagedMediaBuffer(contents) !== reference.contentHash) continue;
        withCanonicalTransaction(db, txnDb => {
            const current = txnDb.prepare(`
                SELECT 1 FROM media_references AS ref JOIN managed_blobs AS blob ON blob.id = ref.blob_id
                WHERE ref.id = ? AND ref.deleted_at_ms IS NULL AND blob.id = ?
                    AND blob.relative_path = ? AND blob.lifecycle_state = 'active'
            `).get(reference.id, reference.blobId, reference.managedRelativePath);
            if (current) installCanonicalManagedMediaContents(managedPath, contents);
        });
    }
}

export async function runCanonicalManagedMediaShadowImport({
    handle,
    directories,
    featureFlags,
    manager,
    nowMs = Date.now(),
}: MediaImportOptions = {} as MediaImportOptions) {
    if (!featureFlags?.enabled) {
        return summarizeImport({ handle, skipped: true, reason: 'canonical_storage_disabled', entries: [] });
    }
    if (!featureFlags?.shadowImport) {
        return summarizeImport({ handle, skipped: true, reason: 'shadow_import_disabled', entries: [] });
    }
    const db = manager.open({
        handle,
        directories,
        featureFlags: { enabled: true, strict: !!featureFlags.strict },
    });
    if (!db) {
        return summarizeImport({ handle, reason: 'canonical_storage_unavailable', entries: [] });
    }
    const migrationStatus = runCanonicalMigrations(db, { strict: !!featureFlags.strict, nowMs });
    if (!migrationStatus.ok) {
        return summarizeImport({ handle, reason: 'migration_blocked', entries: [], migrationStatus });
    }

    const entries: MediaImportEntry[] = [];
    for (const item of listCompatibilityMedia(directories)) {
        try {
            const stat = fs.statSync(item.filePath);
            const contents = fs.readFileSync(item.filePath);
            const contentHash = hashCanonicalManagedMediaBuffer(contents);
            const result = persistCanonicalManagedMediaContents(db, directories.storage, contents, {
                compatibilityPath: item.compatibilityPath,
                contentHash,
                sizeBytes: contents.length,
                mediaType: mime.lookup(item.filePath) || 'application/octet-stream',
                ownerType: item.domain.ownerType,
                ownerId: item.compatibilityPath,
                role: item.domain.role,
                displayName: path.basename(item.filePath),
                metadata: { sourceMtimeMs: Number(stat.mtimeMs) },
                nowMs,
            }, txnDb => recordImportLedgerEntry(txnDb, {
                sliceKey: 'managed_media',
                sourcePath: item.compatibilityPath,
                contentHash,
                origin: 'import',
                nowMs,
            }));
            entries.push({ compatibility_path: item.compatibilityPath, status: result.status });
        } catch (error) {
            entries.push({
                compatibility_path: item.compatibilityPath,
                status: 'error',
                errorMessage: String((error as { message?: unknown } | null | undefined)?.message ?? error ?? ''),
            });
        }
    }
    return summarizeImport({ handle, entries, migrationStatus });
}

export async function auditCanonicalManagedMediaShadowImport({
    handle,
    directories,
    db,
    auditedAtMs = Date.now(),
    projection = 'sync',
}: { handle: string; directories: MediaDirectories; db: DatabaseSync; auditedAtMs?: number; projection?: string } = {} as { handle: string; directories: MediaDirectories; db: DatabaseSync; auditedAtMs?: number; projection?: string }) {
    const migrationStatus = getCanonicalMigrationStatus(db);
    if (!migrationStatus.ok || migrationStatus.currentVersion !== migrationStatus.targetVersion) {
        return {
            ok: false,
            handle,
            hasDrift: false,
            blocking: true,
            reason: migrationStatus.ok ? 'migration_not_applied' : 'migration_blocked',
            migrationStatus,
            entries: [],
        };
    }

    // File-side drift (missing/hash_mismatch/orphan) means the compatibility
    // copy is absent or stale. With projection 'off' that is the expected
    // steady state — entries stay informational with suppressed details.
    // unsafe_path stays blocking: it flags malformed canonical rows, not
    // file-vs-DB divergence.
    const suppressFileSide = projection === 'off';
    const suppressDetails = suppressFileSide
        ? { projection_mode: 'off', suppressed: true }
        : {};

    const entries: MediaAuditEntry[] = [];
    const liveFiles = new Map(listCompatibilityMedia(directories).map(item => [item.compatibilityPath, item]));
    const references = listCanonicalManagedMediaReferences(db);
    const referenceCountsByBlob = new Map();
    for (const reference of references) {
        referenceCountsByBlob.set(reference.blobId, (referenceCountsByBlob.get(reference.blobId) ?? 0) + 1);
    }

    for (const reference of references) {
        if (!isSafeCompatibilityPath(directories, reference.compatibilityPath)) {
            entries.push({
                compatibility_path: reference.compatibilityPath,
                status: 'drift',
                drift_types: ['unsafe_path'],
                details: {},
                audited_at_ms: auditedAtMs,
            });
            continue;
        }
        // Only safe, retired background references are ignored after background retirement.
        if (isRetiredCompatibilityPath(directories, reference)) {
            continue;
        }
        // Avatar blob references live on virtual paths with no projected file.
        if (isVirtualAvatarReference(reference)) {
            continue;
        }
        const domain = getDomainForPath(directories, reference.compatibilityPath);
        if (!domain) {
            entries.push({
                compatibility_path: reference.compatibilityPath,
                status: 'drift',
                drift_types: ['unsafe_path'],
                details: {},
                audited_at_ms: auditedAtMs,
            });
            continue;
        }
        const item = liveFiles.get(reference.compatibilityPath);
        if (!item || !fs.existsSync(item.filePath)) {
            entries.push({
                compatibility_path: reference.compatibilityPath,
                status: 'drift',
                drift_types: ['missing'],
                details: { ...suppressDetails },
                audited_at_ms: auditedAtMs,
            });
            continue;
        }
        const actualHash = hashFile(item.filePath);
        if (actualHash !== reference.contentHash) {
            entries.push({
                compatibility_path: reference.compatibilityPath,
                status: 'drift',
                drift_types: ['hash_mismatch'],
                details: {
                    expectedContentHash: reference.contentHash,
                    actualContentHash: actualHash,
                    import_classification: classifyImportCandidate(db, {
                        sliceKey: 'managed_media',
                        sourcePath: reference.compatibilityPath,
                        contentHash: actualHash,
                    }),
                    ...suppressDetails,
                },
                audited_at_ms: auditedAtMs,
            });
            continue;
        }
        const driftTypes = ['registered'];
        if ((referenceCountsByBlob.get(reference.blobId) ?? 0) > 1) {
            driftTypes.push('duplicate_content');
        }
        entries.push({
            compatibility_path: reference.compatibilityPath,
            status: 'clean',
            drift_types: driftTypes,
            details: {},
            audited_at_ms: auditedAtMs,
        });
        liveFiles.delete(reference.compatibilityPath);
    }

    for (const [compatibilityPath, item] of liveFiles) {
        entries.push({
            compatibility_path: compatibilityPath,
            status: 'drift',
            drift_types: ['orphan'],
            details: {
                import_classification: fs.existsSync(item.filePath)
                    ? classifyImportCandidate(db, {
                        sliceKey: 'managed_media',
                        sourcePath: compatibilityPath,
                        contentHash: hashFile(item.filePath),
                    })
                    : 'candidate',
                ...suppressDetails,
            },
            audited_at_ms: auditedAtMs,
        });
    }
    const result = buildAuditSummary({ handle, migrationStatus, entries, ignoreSuppressed: suppressFileSide });
    persistCanonicalAuditStatus(db, result, { scope: MANAGED_MEDIA_AUDIT_SCOPE, auditedAtMs });
    return result;
}
