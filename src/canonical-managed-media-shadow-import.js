import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import mime from 'mime-types';

import { getCanonicalMigrationStatus, runCanonicalMigrations } from './canonical-sqlite-migrations.js';
import { persistCanonicalAuditStatus } from './canonical-sqlite-shadow-import.js';
import {
    listCanonicalManagedMediaReferences,
    replaceCanonicalManagedMediaFolders,
    upsertCanonicalManagedMediaReference,
} from './endpoints/canonical-managed-media-store.js';
import { isPathUnderParent } from './util.js';

export const MANAGED_MEDIA_AUDIT_SCOPE = 'managed_media';

const MEDIA_DOMAINS = Object.freeze([
    { key: 'backgrounds', ownerType: 'background', role: 'background', recursive: false },
    { key: 'assets', ownerType: 'asset', role: 'asset', recursive: true },
    { key: 'avatars', ownerType: 'persona_avatar', role: 'persona_avatar', recursive: false },
    { key: 'files', ownerType: 'attachment', role: 'attachment', recursive: true },
    { key: 'userImages', ownerType: 'user_image', role: 'user_image', recursive: true },
]);

function toCompatibilityPath(directories, filePath) {
    return path.relative(directories.root, filePath).split(path.sep).join(path.posix.sep);
}

function isSafeCompatibilityPath(directories, compatibilityPath, domainRoot = null) {
    if (typeof compatibilityPath !== 'string' || !compatibilityPath || path.isAbsolute(compatibilityPath)) {
        return false;
    }
    const root = path.resolve(directories.root);
    const resolved = path.resolve(root, compatibilityPath);
    if (!isPathUnderParent(root, resolved)) {
        return false;
    }
    return !domainRoot || isPathUnderParent(path.resolve(domainRoot), resolved);
}

function listDomainFiles(directories, domain) {
    const root = directories?.[domain.key];
    if (!root || !fs.existsSync(root)) {
        return [];
    }
    const files = [];
    const walk = current => {
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

function listCompatibilityMedia(directories) {
    return MEDIA_DOMAINS.flatMap(domain => listDomainFiles(directories, domain));
}

function hashFile(filePath) {
    const hash = crypto.createHash('sha256');
    hash.update(fs.readFileSync(filePath));
    return hash.digest('hex');
}

function readFolderProjection(directories) {
    const metadataPath = path.join(directories.root, 'image-metadata.json');
    try {
        const payload = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        const folders = Array.isArray(payload?.folders) ? payload.folders : [];
        const imageFolderMap = {};
        for (const [relativePath, metadata] of Object.entries(payload?.images ?? {})) {
            if (!relativePath.startsWith('backgrounds/') || !Array.isArray(metadata?.folderIds)) {
                continue;
            }
            imageFolderMap[path.posix.basename(relativePath)] = metadata.folderIds.map(String);
        }
        return { folders, imageFolderMap };
    } catch {
        return { folders: [], imageFolderMap: {} };
    }
}

function summarizeImport({ handle, entries, skipped = false, reason = null, migrationStatus = null }) {
    const count = status => entries.filter(entry => entry.status === status).length;
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

function buildAuditSummary({ handle, migrationStatus, entries }) {
    const blocking = entries.some(entry => entry.status === 'drift' || entry.status === 'error');
    return {
        ok: !blocking,
        handle,
        hasDrift: entries.some(entry => entry.status === 'drift'),
        blocking,
        reason: blocking ? 'audit_drift_blocked' : null,
        migrationStatus,
        entries,
    };
}

function getDomainForPath(directories, compatibilityPath) {
    const normalized = String(compatibilityPath).split(path.sep).join(path.posix.sep);
    return MEDIA_DOMAINS.find(domain => {
        const root = directories?.[domain.key];
        return root && isSafeCompatibilityPath(directories, normalized, root);
    }) ?? null;
}

export async function runCanonicalManagedMediaShadowImport({
    handle,
    directories,
    featureFlags,
    manager,
    nowMs = Date.now(),
} = {}) {
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

    const entries = [];
    for (const item of listCompatibilityMedia(directories)) {
        try {
            const stat = fs.statSync(item.filePath);
            const contentHash = hashFile(item.filePath);
            const result = upsertCanonicalManagedMediaReference(db, {
                compatibilityPath: item.compatibilityPath,
                // Shadow mode has no content root yet. Keep a stable future
                // managed-file identity without treating any compatibility path
                // as canonical, so duplicate references share one blob row.
                managedRelativePath: `managed-media/${contentHash}`,
                contentHash,
                sizeBytes: stat.size,
                mediaType: mime.lookup(item.filePath) || 'application/octet-stream',
                ownerType: item.domain.ownerType,
                ownerId: item.compatibilityPath,
                role: item.domain.role,
                displayName: path.basename(item.filePath),
                metadata: { sourceMtimeMs: Number(stat.mtimeMs) },
                nowMs,
            });
            entries.push({ compatibility_path: item.compatibilityPath, status: result.status });
        } catch (error) {
            entries.push({
                compatibility_path: item.compatibilityPath,
                status: 'error',
                errorMessage: String(error?.message ?? error ?? ''),
            });
        }
    }
    replaceCanonicalManagedMediaFolders(db, { ...readFolderProjection(directories), nowMs });
    return summarizeImport({ handle, entries, migrationStatus });
}

export async function auditCanonicalManagedMediaShadowImport({
    handle,
    directories,
    db,
    auditedAtMs = Date.now(),
} = {}) {
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

    const entries = [];
    const liveFiles = new Map(listCompatibilityMedia(directories).map(item => [item.compatibilityPath, item]));
    const references = listCanonicalManagedMediaReferences(db);
    const referenceCountsByBlob = new Map();
    for (const reference of references) {
        referenceCountsByBlob.set(reference.blobId, (referenceCountsByBlob.get(reference.blobId) ?? 0) + 1);
    }

    for (const reference of references) {
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
                details: {},
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
                details: { expectedContentHash: reference.contentHash, actualContentHash: actualHash },
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

    for (const [compatibilityPath] of liveFiles) {
        entries.push({
            compatibility_path: compatibilityPath,
            status: 'drift',
            drift_types: ['orphan'],
            details: {},
            audited_at_ms: auditedAtMs,
        });
    }
    const result = buildAuditSummary({ handle, migrationStatus, entries });
    persistCanonicalAuditStatus(db, result, { scope: MANAGED_MEDIA_AUDIT_SCOPE, auditedAtMs });
    return result;
}
