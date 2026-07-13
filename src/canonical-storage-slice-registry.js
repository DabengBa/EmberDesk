import fs from 'node:fs';
import { getCanonicalMigrationStatus } from './canonical-sqlite-migrations.js';
import { getPersistedCanonicalAuditStatus } from './canonical-sqlite-shadow-import.js';
import { WORLD_INFO_AUDIT_SCOPE } from './canonical-world-info-shadow-import.js';
import {
    buildCanonicalSliceRollbackBlockers,
    getCanonicalSliceFlagContractStatus,
    listOpenProjectionRepairs,
    registerDefaultCanonicalStorageSliceRegistry,
} from './canonical-sqlite-rollout-contract.js';
import { listOpenWorldInfoProjectionRepairs } from './endpoints/world-info-store.js';
import { getCanonicalSqliteFeatureFlags } from './storage-feature-flags.js';

const REQUIRED_SLICE_FIELDS = Object.freeze([
    'key',
    'auditScope',
    'listOpenRepairs',
    'getFeatureFlags',
    'getMigrationReadiness',
    'getRollbackBlockers',
    'getBackupManagedPaths',
]);

const CHARACTER_AUDIT_SCOPE = 'character_metadata_and_chat_stats';

function assertSliceDescriptor(descriptor) {
    if (!descriptor || typeof descriptor !== 'object') {
        throw new Error('Canonical storage slice descriptor is required.');
    }

    const missing = REQUIRED_SLICE_FIELDS.filter(field => {
        const value = descriptor[field];
        if (field === 'key' || field === 'auditScope') {
            return typeof value !== 'string' || value.length === 0;
        }
        return typeof value !== 'function';
    });

    if (missing.length > 0) {
        throw new Error(`Canonical storage slice is missing required capabilities: ${missing.join(', ')}`);
    }
}

function createSharedMigrationReadiness(db) {
    return getCanonicalMigrationStatus(db);
}

function createCharacterSlice() {
    return {
        key: 'characters',
        auditScope: CHARACTER_AUDIT_SCOPE,
        listOpenRepairs(db) {
            return listOpenProjectionRepairs(db);
        },
        getFeatureFlags(overrides = null) {
            return overrides ?? getCanonicalSqliteFeatureFlags();
        },
        getMigrationReadiness(db) {
            return createSharedMigrationReadiness(db);
        },
        getRollbackBlockers({
            db,
            featureFlags = null,
            phase = 'writes',
            persistedAuditStatus = null,
        } = {}) {
            return buildCanonicalSliceRollbackBlockers({
                db,
                sliceKey: 'characters',
                featureFlags: featureFlags ?? getCanonicalSqliteFeatureFlags(),
                phase,
                persistedAuditStatus: persistedAuditStatus
                    ?? getPersistedCanonicalAuditStatus(db, { scope: CHARACTER_AUDIT_SCOPE }),
                listOpenRepairs: listOpenProjectionRepairs,
                openRepairCode: 'open_projection_repairs',
                includeChatStatsPhase: true,
            });
        },
        getBackupManagedPaths(directories) {
            return [
                directories?.characters ?? null,
                directories?.chats ?? null,
            ].filter(Boolean);
        },
    };
}

function createWorldInfoSlice() {
    return {
        key: 'world_info',
        auditScope: WORLD_INFO_AUDIT_SCOPE,
        listOpenRepairs(db) {
            return listOpenWorldInfoProjectionRepairs(db);
        },
        getFeatureFlags(overrides = null) {
            // World Info currently shares the global canonicalSqlite flags.
            // Later slices may provide independent flag objects.
            return overrides ?? getCanonicalSqliteFeatureFlags();
        },
        getMigrationReadiness(db) {
            return createSharedMigrationReadiness(db);
        },
        getRollbackBlockers({
            db,
            featureFlags = null,
            phase = 'writes',
            persistedAuditStatus = null,
        } = {}) {
            return buildCanonicalSliceRollbackBlockers({
                db,
                sliceKey: 'world_info',
                featureFlags: featureFlags ?? getCanonicalSqliteFeatureFlags(),
                phase,
                persistedAuditStatus: persistedAuditStatus
                    ?? getPersistedCanonicalAuditStatus(db, { scope: WORLD_INFO_AUDIT_SCOPE }),
                listOpenRepairs: listOpenWorldInfoProjectionRepairs,
                openRepairCode: 'open_world_info_projection_repairs',
                includeChatStatsPhase: false,
            });
        },
        getBackupManagedPaths(directories) {
            return [
                directories?.worlds ?? null,
            ].filter(Boolean);
        },
    };
}

export function createCanonicalStorageSliceRegistry({ registerDefaults = false } = {}) {
    /** @type {Map<string, object>} */
    const slices = new Map();

    function register(descriptor) {
        assertSliceDescriptor(descriptor);
        if (slices.has(descriptor.key)) {
            throw new Error(`Duplicate canonical storage slice key: ${descriptor.key}`);
        }
        const frozen = Object.freeze({ ...descriptor });
        slices.set(descriptor.key, frozen);
        return frozen;
    }

    function get(key) {
        const slice = slices.get(key);
        if (!slice) {
            throw new Error(`Unknown canonical storage slice: ${key}`);
        }
        return slice;
    }

    function has(key) {
        return slices.has(key);
    }

    function list() {
        return Array.from(slices.values());
    }

    function keys() {
        return Array.from(slices.keys());
    }

    const registry = Object.freeze({
        register,
        get,
        has,
        list,
        keys,
    });

    if (registerDefaults) {
        register(createCharacterSlice());
        register(createWorldInfoSlice());
    }

    return registry;
}

let defaultRegistry = null;

export function getDefaultCanonicalStorageSliceRegistry() {
    if (!defaultRegistry) {
        defaultRegistry = createCanonicalStorageSliceRegistry({ registerDefaults: true });
        registerDefaultCanonicalStorageSliceRegistry(defaultRegistry);
    }
    return defaultRegistry;
}

// Eagerly register defaults so sliceKey-based blocker resolution works without
// an explicit getDefault call.
getDefaultCanonicalStorageSliceRegistry();


export function listCanonicalStorageSliceKeys(registry = getDefaultCanonicalStorageSliceRegistry()) {
    return registry.keys();
}

export function getCanonicalStorageSlice(key, registry = getDefaultCanonicalStorageSliceRegistry()) {
    return registry.get(key);
}

export {
    CHARACTER_AUDIT_SCOPE,
    REQUIRED_SLICE_FIELDS,
    getCanonicalSliceFlagContractStatus,
};

export const MANAGED_FILE_MANIFEST_VERSION = 1;

/**
 * Build a backup manifest description for operator tooling.
 * Records inventory only; does not copy or rewrite files.
 */
export function buildCanonicalBackupManifest({
    directories,
    db = null,
    registry = getDefaultCanonicalStorageSliceRegistry(),
    createdAtMs = Date.now(),
    schemaVersion = null,
} = {}) {
    const slices = listCanonicalStorageSliceKeys(registry).map(key => {
        const slice = registry.get(key);
        const migration = db ? slice.getMigrationReadiness(db) : null;
        const managedPaths = slice.getBackupManagedPaths(directories);
        return {
            key: slice.key,
            auditScope: slice.auditScope,
            schemaVersion: migration?.currentVersion ?? null,
            managedPaths: managedPaths.map(managedPath => ({
                path: managedPath,
                exists: !!managedPath && fs.existsSync(managedPath),
            })),
        };
    });

    return {
        schemaVersion: schemaVersion
            ?? (db ? registry.get(listCanonicalStorageSliceKeys(registry)[0]).getMigrationReadiness(db).currentVersion : null),
        managedFileManifestVersion: MANAGED_FILE_MANIFEST_VERSION,
        createdAtMs: Number(createdAtMs),
        slices,
    };
}

/**
 * Readiness for backup/restore of database + managed files.
 * Never mutates files or the database.
 */
export function getCanonicalBackupRestoreReadiness({
    directories,
    db = null,
    registry = getDefaultCanonicalStorageSliceRegistry(),
    managedFileManifest = null,
} = {}) {
    const expected = buildCanonicalBackupManifest({
        directories,
        db,
        registry,
    });
    const blockers = [];

    if (!directories?.storage || !fs.existsSync(directories.storage)) {
        blockers.push({
            code: 'missing_storage_root',
            severity: 'error',
            details: { path: directories?.storage ?? null },
        });
    }

    for (const slice of expected.slices) {
        for (const managed of slice.managedPaths) {
            if (!managed.exists) {
                blockers.push({
                    code: 'missing_managed_path',
                    severity: 'error',
                    details: {
                        sliceKey: slice.key,
                        path: managed.path,
                    },
                });
            }
        }
    }

    if (managedFileManifest == null) {
        blockers.push({
            code: 'missing_managed_file_manifest',
            severity: 'error',
            details: {
                expectedVersion: MANAGED_FILE_MANIFEST_VERSION,
            },
        });
    } else {
        const version = Number(managedFileManifest.managedFileManifestVersion
            ?? managedFileManifest.version
            ?? NaN);
        if (version !== MANAGED_FILE_MANIFEST_VERSION) {
            blockers.push({
                code: 'managed_file_manifest_version_mismatch',
                severity: 'error',
                details: {
                    expectedVersion: MANAGED_FILE_MANIFEST_VERSION,
                    actualVersion: Number.isFinite(version) ? version : null,
                },
            });
        }

        const declaredPaths = new Set();
        for (const slice of managedFileManifest.slices ?? []) {
            for (const managed of slice.managedPaths ?? []) {
                declaredPaths.add(managed.path);
            }
        }
        for (const slice of expected.slices) {
            for (const managed of slice.managedPaths) {
                if (!declaredPaths.has(managed.path)) {
                    blockers.push({
                        code: 'managed_file_manifest_incomplete',
                        severity: 'error',
                        details: {
                            sliceKey: slice.key,
                            path: managed.path,
                        },
                    });
                }
            }
        }
    }

    return {
        ok: blockers.length === 0,
        ready: blockers.length === 0,
        managedFileManifestVersion: MANAGED_FILE_MANIFEST_VERSION,
        expectedManifest: expected,
        providedManifest: managedFileManifest,
        blockers,
        mutatesData: false,
    };
}
