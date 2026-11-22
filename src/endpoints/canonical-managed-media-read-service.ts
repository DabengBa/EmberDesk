import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import mime from 'mime-types';

import { MEDIA_REQUEST_TYPE } from '../constants.ts';
import { canonicalSqliteManager } from '../canonical-sqlite.ts';
import { runCanonicalMigrations } from '../canonical-sqlite-migrations.ts';
import { getPersistedCanonicalAuditStatus } from '../canonical-sqlite-shadow-import.ts';
import { getCanonicalStorageSlice } from '../canonical-storage-slice-registry.ts';
import {
    getCanonicalManagedMediaReference,
    listCanonicalManagedMediaReferences,
} from './canonical-managed-media-store.ts';

type Reference = Pick<NonNullable<ReturnType<typeof getCanonicalManagedMediaReference>>, 'lifecycleState' | 'managedRelativePath'>
    & Partial<Pick<NonNullable<ReturnType<typeof getCanonicalManagedMediaReference>>, 'deletedAtMs' | 'mediaType' | 'contentHash'>>;
type Directories = import('../user-types.ts').UserDirectoryList;
type Flags = ReturnType<ReturnType<typeof getCanonicalStorageSlice>['getFeatureFlags']>;
type OpenOptions = { handle: string | undefined; directories: Directories | undefined; featureFlags: { enabled: boolean; strict: boolean } };
type MigrationOptions = Parameters<typeof runCanonicalMigrations>[1];
type AuditOptions = Parameters<typeof getPersistedCanonicalAuditStatus>[1];
type Dependencies = {
    getSlice: () => ReturnType<typeof getCanonicalStorageSlice>;
    getFeatureFlags: () => Flags;
    openDatabase: (options: OpenOptions) => DatabaseSync | null;
    runMigrations: (db: DatabaseSync, options: MigrationOptions) => ReturnType<typeof runCanonicalMigrations>;
    getAuditStatus: (db: DatabaseSync, options: AuditOptions) => ReturnType<typeof getPersistedCanonicalAuditStatus>;
};

function getDefaultDependencies() {
    const slice = getCanonicalStorageSlice('managed_media');
    return {
        getFeatureFlags: () => slice.getFeatureFlags(),
        getSlice: () => slice,
        openDatabase: (options: OpenOptions) => canonicalSqliteManager.open(options),
        runMigrations: (db: DatabaseSync, options: MigrationOptions) => runCanonicalMigrations(db, options),
        getAuditStatus: (db: DatabaseSync, options: AuditOptions) => getPersistedCanonicalAuditStatus(db, options),
    };
}

function blockedReadState({ reason, featureFlags, strict, details = {} }: { reason: string; featureFlags: Flags; strict: boolean; details?: object }) {
    if (strict) {
        throw new Error(`Canonical managed media reads blocked: ${reason}`);
    }
    return {
        ok: false,
        reason,
        featureFlags,
        ...details,
    } as const;
}

export function getCanonicalManagedMediaReadState({
    handle,
    directories,
    dependencies = {},
}: { handle?: string; directories?: Directories; dependencies?: Partial<Dependencies> } = {}) {
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

    const openDatabase: Dependencies['openDatabase'] = dependencies.openDatabase ?? defaults.openDatabase;
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
    } as const;
}

function normalizeCompatibilityPath(value: unknown) {
    return String(value ?? '').split(path.sep).join(path.posix.sep);
}

function listOwnerReferences(db: DatabaseSync, ownerType: string, prefix: string) {
    return listCanonicalManagedMediaReferences(db)
        .filter(reference => reference.ownerType === ownerType)
        .filter(reference => normalizeCompatibilityPath(reference.compatibilityPath).startsWith(prefix));
}

/** Resolves the active blob file for a reference or compatibility path. */
export function resolveManagedMediaPath(db: DatabaseSync, directories: Pick<Directories, 'storage'>, referenceOrPath: Reference | string | null | undefined) {
    const reference = typeof referenceOrPath === 'string'
        ? getCanonicalManagedMediaReference(db, normalizeCompatibilityPath(referenceOrPath))
        : referenceOrPath;
    if (!reference || reference.deletedAtMs != null) {
        return { ok: false, reason: 'reference_not_found' } as const;
    }
    if (reference.lifecycleState !== 'active') {
        return { ok: false, reason: 'blob_not_active', reference } as const;
    }

    const managedPath = path.resolve(directories.storage, reference.managedRelativePath);
    const storageRoot = path.resolve(directories.storage);
    if (managedPath !== storageRoot && !managedPath.startsWith(`${storageRoot}${path.sep}`)) {
        return { ok: false, reason: 'unsafe_managed_path', reference } as const;
    }
    if (!fs.existsSync(managedPath)) {
        return { ok: false, reason: 'blob_bytes_missing', reference } as const;
    }
    return { ok: true, managedPath, reference } as const;
}

/** Reads blob bytes for a managed-media reference or compatibility path. */
export function readManagedMediaContent(db: DatabaseSync, directories: Pick<Directories, 'storage'>, referenceOrPath: Reference | string | null | undefined) {
    const resolved = resolveManagedMediaPath(db, directories, referenceOrPath);
    if (!resolved.ok) {
        return resolved;
    }
    const { managedPath, reference } = resolved;
    return {
        ok: true as const,
        contents: fs.readFileSync(managedPath),
        mediaType: reference.mediaType,
        contentHash: reference.contentHash,
        reference,
    };
}

const USER_IMAGES_PREFIX = 'user/images/';

/**
 * Lists file names for one user-images folder from canonical references.
 * Subfolder assets are not included (same contract as `getImages`).
 * @param {object} db Canonical SQLite handle
 * @param {string} folder Folder name under user/images
 * @param {string} sortBy 'name' or 'date'
 * @param {number} type MEDIA_REQUEST_TYPE bitmask
 * @returns {string[]} File names
 */
export function listCanonicalUserImageFiles(db: DatabaseSync, folder: string, sortBy = 'name', type = MEDIA_REQUEST_TYPE.IMAGE) {
    const prefix = `${USER_IMAGES_PREFIX}${String(folder ?? '').replace(/^\/+|\/+$/g, '')}/`;
    const collator = Intl.Collator();
    return listCanonicalManagedMediaReferences(db)
        .filter(reference => {
            const compatibilityPath = normalizeCompatibilityPath(reference.compatibilityPath);
            return compatibilityPath.startsWith(prefix)
                && !compatibilityPath.slice(prefix.length).includes('/');
        })
        .filter(reference => {
            const fileType = mime.lookup(reference.displayName || reference.compatibilityPath);
            if (!fileType) {
                return false;
            }
            if ((type & MEDIA_REQUEST_TYPE.IMAGE) && fileType.startsWith('image/')) {
                return true;
            }
            if ((type & MEDIA_REQUEST_TYPE.VIDEO) && fileType.startsWith('video/')) {
                return true;
            }
            return (type & MEDIA_REQUEST_TYPE.AUDIO) !== 0 && fileType.startsWith('audio/');
        })
        .map(reference => {
            const name = normalizeCompatibilityPath(reference.compatibilityPath).slice(prefix.length);
            return {
                name,
                // Store metadata is unchecked JSON; this view preserves the original property access.
                sortKey: sortBy === 'date'
                    ? Number((reference.metadata as { sourceMtimeMs?: unknown } | null)?.sourceMtimeMs ?? reference.updatedAtMs ?? 0)
                    : name,
            };
        })
        // The same sortBy branch constructs and consumes each sort key.
        .sort((a, b) => sortBy === 'date' ? (a.sortKey as number) - (b.sortKey as number) : collator.compare(a.sortKey as string, b.sortKey as string))
        .map(entry => entry.name);
}

/**
 * Lists first-level folder names under user/images from canonical references.
 * @param {object} db Canonical SQLite handle
 * @returns {string[]} Folder names
 */
export function listCanonicalUserImageFolders(db: DatabaseSync) {
    const folders = new Set<string>();
    for (const reference of listCanonicalManagedMediaReferences(db)) {
        const compatibilityPath = normalizeCompatibilityPath(reference.compatibilityPath);
        if (!compatibilityPath.startsWith(USER_IMAGES_PREFIX)) {
            continue;
        }
        const remainder = compatibilityPath.slice(USER_IMAGES_PREFIX.length);
        const separator = remainder.indexOf('/');
        if (separator > 0) {
            folders.add(remainder.slice(0, separator));
        }
    }
    return [...folders].sort(Intl.Collator().compare);
}

export function listCanonicalAssetPayload(db: DatabaseSync) {
    const output: Record<string, string[] | { model: string[]; animation: string[] }> & { live2d?: string[]; vrm?: { model: string[]; animation: string[] } } = {};
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
        // live2d and vrm have already been handled above; other categories are arrays.
        (output[category] as string[]).push(compatibilityPath);
    }
    return output;
}
