import fs from 'node:fs';
import path from 'node:path';

import mime from 'mime-types';

import { MEDIA_REQUEST_TYPE } from '../constants.js';
import { canonicalSqliteManager } from '../canonical-sqlite.js';
import { runCanonicalMigrations } from '../canonical-sqlite-migrations.js';
import { getPersistedCanonicalAuditStatus } from '../canonical-sqlite-shadow-import.js';
import { getCanonicalStorageSlice } from '../canonical-storage-slice-registry.js';
import {
    getCanonicalManagedMediaReference,
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

/**
 * Reads blob bytes for a managed-media reference (or a compatibility path
 * resolving to one). Virtual-path references (e.g. character avatars) are
 * served the same way — the managed blob file is the content authority.
 * @param {object} db Canonical SQLite handle
 * @param {import('../users.js').UserDirectoryList} directories User directories
 * @param {object|string} referenceOrPath Reference object or compatibility path
 * @returns {{ok: boolean, reason?: string, contents?: Buffer, mediaType?: string, contentHash?: string, reference?: object}}
 */
export function readManagedMediaContent(db, directories, referenceOrPath) {
    const reference = typeof referenceOrPath === 'string'
        ? getCanonicalManagedMediaReference(db, normalizeCompatibilityPath(referenceOrPath))
        : referenceOrPath;
    if (!reference || reference.deletedAtMs != null) {
        return { ok: false, reason: 'reference_not_found' };
    }
    if (reference.lifecycleState !== 'active') {
        return { ok: false, reason: 'blob_not_active', reference };
    }

    const managedPath = path.resolve(directories.storage, reference.managedRelativePath);
    const storageRoot = path.resolve(directories.storage);
    if (managedPath !== storageRoot && !managedPath.startsWith(`${storageRoot}${path.sep}`)) {
        return { ok: false, reason: 'unsafe_managed_path', reference };
    }
    if (!fs.existsSync(managedPath)) {
        return { ok: false, reason: 'blob_bytes_missing', reference };
    }

    return {
        ok: true,
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
export function listCanonicalUserImageFiles(db, folder, sortBy = 'name', type = MEDIA_REQUEST_TYPE.IMAGE) {
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
                sortKey: sortBy === 'date'
                    ? Number(reference.metadata?.sourceMtimeMs ?? reference.updatedAtMs ?? 0)
                    : name,
            };
        })
        .sort((a, b) => sortBy === 'date' ? a.sortKey - b.sortKey : collator.compare(a.sortKey, b.sortKey))
        .map(entry => entry.name);
}

/**
 * Lists first-level folder names under user/images from canonical references.
 * @param {object} db Canonical SQLite handle
 * @returns {string[]} Folder names
 */
export function listCanonicalUserImageFolders(db) {
    const folders = new Set();
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
