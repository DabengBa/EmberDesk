import fs from 'node:fs';
import path from 'node:path';
import { getCanonicalMigrationStatus } from './canonical-sqlite-migrations.js';
import { getPersistedCanonicalAuditStatus } from './canonical-sqlite-shadow-import.js';
import { WORLD_INFO_AUDIT_SCOPE } from './canonical-world-info-shadow-import.js';
import { SETTINGS_AUDIT_SCOPE } from './canonical-settings-shadow-import.js';
import { CANONICAL_SECRETS_AUDIT_SCOPE } from './canonical-secrets-shadow-import.js';
import { MANAGED_MEDIA_AUDIT_SCOPE } from './canonical-managed-media-shadow-import.js';
import {
    buildCanonicalSliceRollbackBlockers,
    getCanonicalSliceFlagContractStatus,
    listOpenProjectionRepairs,
    registerDefaultCanonicalStorageSliceRegistry,
} from './canonical-sqlite-rollout-contract.js';
import { listOpenWorldInfoProjectionRepairs } from './endpoints/world-info-store.js';
import { listOpenSettingsProjectionRepairs } from './endpoints/settings-store.js';
import { listOpenSecretProjectionRepairs } from './endpoints/canonical-secrets-store.js';
import { listOpenCanonicalManagedMediaRepairs } from './endpoints/canonical-managed-media-store.js';
import { getCanonicalStorageSliceFeatureFlagSnapshot } from './storage-feature-flags.js';
import { SETTINGS_FILE } from './constants.js';

const REQUIRED_SLICE_FIELDS = Object.freeze([
    'key',
    'flagKey',
    'auditScope',
    'listOpenRepairs',
    'getFeatureFlags',
    'getFeatureFlagSnapshot',
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
        if (field === 'key' || field === 'flagKey' || field === 'auditScope') {
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

function createSliceFlagCapabilities({
    flagKey,
    supportsChatStats = false,
    fallbackToGlobal = true,
}) {
    const getFeatureFlagSnapshot = (overrides = null) => getCanonicalStorageSliceFeatureFlagSnapshot({
        flagKey,
        supportsChatStats,
        fallbackToGlobal,
        overrides,
    });
    return {
        flagKey,
        getFeatureFlagSnapshot,
        getFeatureFlags(overrides = null) {
            return getFeatureFlagSnapshot(overrides).featureFlags;
        },
    };
}

function createCharacterSlice() {
    const flags = createSliceFlagCapabilities({
        flagKey: 'characters',
        supportsChatStats: true,
    });
    return {
        key: 'characters',
        ...flags,
        auditScope: CHARACTER_AUDIT_SCOPE,
        listOpenRepairs(db) {
            return listOpenProjectionRepairs(db);
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
                featureFlags: flags.getFeatureFlags(featureFlags),
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
    const flags = createSliceFlagCapabilities({ flagKey: 'worldInfo' });
    return {
        key: 'world_info',
        ...flags,
        auditScope: WORLD_INFO_AUDIT_SCOPE,
        listOpenRepairs(db) {
            return listOpenWorldInfoProjectionRepairs(db);
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
                featureFlags: flags.getFeatureFlags(featureFlags),
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

function createSettingsSlice() {
    const flags = createSliceFlagCapabilities({ flagKey: 'settings' });
    return {
        key: 'settings',
        ...flags,
        auditScope: SETTINGS_AUDIT_SCOPE,
        listOpenRepairs(db) {
            return listOpenSettingsProjectionRepairs(db);
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
                sliceKey: 'settings',
                featureFlags: flags.getFeatureFlags(featureFlags),
                phase,
                persistedAuditStatus: persistedAuditStatus
                    ?? getPersistedCanonicalAuditStatus(db, { scope: SETTINGS_AUDIT_SCOPE }),
                listOpenRepairs: listOpenSettingsProjectionRepairs,
                openRepairCode: 'open_settings_projection_repairs',
                includeChatStatsPhase: false,
            });
        },
        getBackupManagedPaths(directories) {
            if (!directories?.root) {
                return [];
            }
            return [path.join(directories.root, SETTINGS_FILE)];
        },
    };
}

function createSecretsSlice() {
    const flags = createSliceFlagCapabilities({ flagKey: 'secrets' });
    return {
        key: 'secrets',
        ...flags,
        auditScope: CANONICAL_SECRETS_AUDIT_SCOPE,
        listOpenRepairs(db) {
            return listOpenSecretProjectionRepairs(db);
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
                sliceKey: 'secrets',
                featureFlags: flags.getFeatureFlags(featureFlags),
                phase,
                persistedAuditStatus: persistedAuditStatus
                    ?? getPersistedCanonicalAuditStatus(db, { scope: CANONICAL_SECRETS_AUDIT_SCOPE }),
                listOpenRepairs: listOpenSecretProjectionRepairs,
                openRepairCode: 'open_secret_projection_repairs',
                includeChatStatsPhase: false,
            });
        },
        getBackupManagedPaths(directories) {
            if (!directories?.root) {
                return [];
            }
            return [path.join(directories.root, 'secrets.json')];
        },
    };
}

function createManagedMediaSlice() {
    const flags = createSliceFlagCapabilities({
        flagKey: 'managedMedia',
        fallbackToGlobal: false,
    });
    return {
        key: 'managed_media',
        ...flags,
        auditScope: MANAGED_MEDIA_AUDIT_SCOPE,
        listOpenRepairs(db) {
            return listOpenCanonicalManagedMediaRepairs(db);
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
                sliceKey: 'managed_media',
                featureFlags: flags.getFeatureFlags(featureFlags),
                phase,
                persistedAuditStatus: persistedAuditStatus
                    ?? getPersistedCanonicalAuditStatus(db, { scope: MANAGED_MEDIA_AUDIT_SCOPE }),
                listOpenRepairs: listOpenCanonicalManagedMediaRepairs,
                openRepairCode: 'open_managed_media_repairs',
                includeChatStatsPhase: false,
            });
        },
        getBackupManagedPaths(directories) {
            return [
                directories?.backgrounds ?? null,
                directories?.assets ?? null,
                directories?.avatars ?? null,
                directories?.files ?? null,
                directories?.userImages ?? null,
                directories?.storage ? path.join(directories.storage, 'managed-media') : null,
            ].filter(Boolean);
        },
    };
}

export function createCanonicalStorageSliceRegistry({ registerDefaults = false } = {}) {
    /** @type {Map<string, object>} */
    const slices = new Map();
    /** @type {Map<string, {runAudit?: Function, runRepair?: Function}>} */
    const runners = new Map();

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

    function setRunners(key, runner) {
        if (!slices.has(key)) {
            throw new Error(`Unknown canonical storage slice: ${key}`);
        }
        if (!runner || typeof runner !== 'object') {
            throw new Error(`Canonical storage slice runners required for: ${key}`);
        }
        runners.set(key, {
            runAudit: typeof runner.runAudit === 'function' ? runner.runAudit : null,
            runRepair: typeof runner.runRepair === 'function' ? runner.runRepair : null,
        });
    }

    function getRunners(key) {
        return runners.get(key) ?? null;
    }

    const registry = Object.freeze({
        register,
        get,
        has,
        list,
        keys,
        setRunners,
        getRunners,
    });

    if (registerDefaults) {
        register(createCharacterSlice());
        register(createWorldInfoSlice());
        register(createSettingsSlice());
        register(createSecretsSlice());
        register(createManagedMediaSlice());
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
