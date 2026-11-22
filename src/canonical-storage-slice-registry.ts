import fs from 'node:fs';
import path from 'node:path';
import {
    getCanonicalSliceProjectionMode,
    getCanonicalSqliteFeatureFlags,
    getCanonicalStorageSliceFeatureFlagSnapshot,
} from './storage-feature-flags.ts';
import { getCanonicalMigrationStatus } from './canonical-sqlite-migrations.ts';
import { getPersistedCanonicalAuditStatus } from './canonical-sqlite-shadow-import.ts';
import { WORLD_INFO_AUDIT_SCOPE } from './canonical-world-info-shadow-import.ts';
import { WORLD_PROJECTION_INTENT_PREFIX } from './canonical-world-info-projection.ts';
import { SETTINGS_AUDIT_SCOPE } from './canonical-settings-shadow-import.ts';
import { CANONICAL_SECRETS_AUDIT_SCOPE } from './canonical-secrets-shadow-import.ts';
import { MANAGED_MEDIA_AUDIT_SCOPE } from './canonical-managed-media-shadow-import.ts';
import { CANONICAL_CHAT_AUDIT_SCOPE } from './canonical-chat-shadow-import.ts';
import { PRESETS_AUDIT_SCOPE } from './canonical-presets-shadow-import.ts';
import {
    buildCanonicalSliceRollbackBlockers,
    getCanonicalSliceFlagContractStatus,
    listOpenProjectionRepairs,
    registerDefaultCanonicalStorageSliceRegistry,
} from './canonical-sqlite-rollout-contract.ts';
import { listOpenWorldInfoProjectionRepairs } from './endpoints/world-info-store.ts';
import { listOpenSettingsProjectionRepairs } from './endpoints/settings-store.ts';
import { listOpenSecretProjectionRepairs } from './endpoints/canonical-secrets-store.ts';
import { listOpenCanonicalManagedMediaRepairs } from './endpoints/canonical-managed-media-store.ts';
import { listOpenCanonicalChatProjectionRepairs } from './endpoints/canonical-chat-write-service.ts';
import type { DatabaseSync } from 'node:sqlite';

type Directories = { root?: string; storage?: string; characters?: string; chats?: string; groupChats?: string; worlds?: string; backgrounds?: string; assets?: string; avatars?: string; files?: string; userImages?: string };
type FeatureFlags = { enabled: boolean; shadowImport: boolean; reads: boolean; writes: boolean; strict: boolean; chatStats?: boolean };
type FlagOverrides = object | null;
type FlagSnapshot = { featureFlags: FeatureFlags; sources: Record<string, string>; resolution: { ok: boolean; reasonCode: string | null } };
type AuditStatus = { blocking: boolean; reason?: string | null };
type RollbackOptions = { db?: DatabaseSync; featureFlags?: FlagOverrides; phase?: string; persistedAuditStatus?: AuditStatus | null; allowProtocolPending?: boolean };
type RollbackResult = { ok: boolean; phase: string; sliceKey: string; blockers: { code: string; severity: string; details: { sliceKey?: string; illegalFlags?: string[]; auditReason?: string | null; auditBlocking?: boolean; repairCount?: number; repairKeys?: string[]; protocolPendingCount?: number } }[] };
type RollbackBuilderOptions = RollbackOptions & { sliceKey: string; featureFlags: FeatureFlags; listOpenRepairs: (db: DatabaseSync) => { repairKey: string }[]; openRepairCode: string; protocolRepairPrefix?: string; includeChatStatsPhase: boolean };
// Without a database, an explicit audit avoids the lookup. Presets have no
// repair table; other slices check repairs on writes, and characters also on
// chatStats. Arbitrary descriptors do not inherit these guarantees.
type UnsafeRepairPhase<K extends BuiltinSliceKey> = 'characters' extends K ? 'writes' | 'chatStats' : 'writes';
type NoDbRollbackOptions<K extends BuiltinSliceKey, P extends string> = Omit<RollbackOptions, 'db' | 'phase' | 'persistedAuditStatus'> & {
    db?: null | undefined;
    persistedAuditStatus: AuditStatus;
} & ([K] extends ['presets']
    ? { phase?: string }
    : { phase: P & (Extract<UnsafeRepairPhase<K>, P> extends never ? unknown : never) });
type RollbackBlockers<K extends BuiltinSliceKey> = <P extends string>(options: (RollbackOptions & { db: DatabaseSync }) | NoDbRollbackOptions<K, P>) => RollbackResult;
// The unchecked JS helper accepts RollbackBuilderOptions; its defaulted null
// parameters otherwise infer as null-only when imported from TypeScript.
type Slice = {
    key: string; flagKey: string; auditScope: string;
    authorityMode?: string;
    listOpenRepairs: (db: DatabaseSync) => { repairKey: string }[];
    getFeatureFlags: (overrides?: FlagOverrides) => Partial<FeatureFlags>;
    getFeatureFlagSnapshot: (overrides?: FlagOverrides) => Omit<FlagSnapshot, 'featureFlags'> & { featureFlags: Partial<FeatureFlags> };
    getAuditTrackingFeatureFlags: () => Partial<FeatureFlags>;
    getMigrationReadiness: (db: DatabaseSync) => Partial<ReturnType<typeof getCanonicalMigrationStatus>>;
    getRollbackBlockers: (options: RollbackOptions & { db: DatabaseSync }) => RollbackResult;
    getBackupManagedPaths: (directories?: Directories) => string[];
    getProjectionMode?: () => string;
};
// Runners are an open JS extension point with slice-specific input/output
// shapes. Registration checks callability and the operator invokes them.
type SliceRunners = { runAudit?: Function | null; runRepair?: Function | null };
type Manifest = { managedFileManifestVersion?: unknown; version?: unknown; slices?: { managedPaths?: { path?: unknown }[] }[] };
type BuiltinSliceKey = 'characters' | 'world_info' | 'settings' | 'secrets' | 'managed_media' | 'chats' | 'presets';
type BuiltinSlice<K extends BuiltinSliceKey> = Omit<Slice, 'getProjectionMode' | 'getFeatureFlags' | 'getFeatureFlagSnapshot' | 'getAuditTrackingFeatureFlags' | 'getMigrationReadiness' | 'getRollbackBlockers'> & {
    getRollbackBlockers: RollbackBlockers<K>;
    getProjectionMode: () => string;
    getFeatureFlags: (overrides?: FlagOverrides) => FeatureFlags;
    getFeatureFlagSnapshot: (overrides?: FlagOverrides) => FlagSnapshot;
    getAuditTrackingFeatureFlags: () => FeatureFlags;
    getMigrationReadiness: (db: DatabaseSync) => ReturnType<typeof getCanonicalMigrationStatus>;
};
type Registry = Readonly<{
    register: (descriptor: unknown) => Readonly<Slice>;
    get: (key: string) => Slice;
    has: (key: string) => boolean;
    list: () => Slice[];
    keys: () => string[];
    setRunners: (key: string, runner: SliceRunners) => void;
    getRunners: (key: string) => SliceRunners | null;
}>;
// Only registries created with defaults have protected built-in keys.
declare const builtinRegistryBrand: unique symbol;
type BuiltinRegistry = Omit<Registry, 'get'> & {
    readonly [builtinRegistryBrand]: true;
    get<K extends BuiltinSliceKey>(key: K): BuiltinSlice<K>;
    get(key: string): Slice;
};

const REQUIRED_SLICE_FIELDS = Object.freeze([
    'key',
    'flagKey',
    'auditScope',
    'listOpenRepairs',
    'getFeatureFlags',
    'getFeatureFlagSnapshot',
    'getAuditTrackingFeatureFlags',
    'getMigrationReadiness',
    'getRollbackBlockers',
    'getBackupManagedPaths',
]);

const CHARACTER_AUDIT_SCOPE = 'character_metadata_and_chat_stats';

function assertSliceDescriptor(descriptor: unknown): asserts descriptor is Slice {
    if (!descriptor || typeof descriptor !== 'object') {
        throw new Error('Canonical storage slice descriptor is required.');
    }

    const missing = REQUIRED_SLICE_FIELDS.filter(field => {
        const value = (descriptor as Record<string, unknown>)[field];
        if (field === 'key' || field === 'flagKey' || field === 'auditScope') {
            return typeof value !== 'string' || value.length === 0;
        }
        return typeof value !== 'function';
    });

    if (missing.length > 0) {
        throw new Error(`Canonical storage slice is missing required capabilities: ${missing.join(', ')}`);
    }
}

function createSharedMigrationReadiness(db: DatabaseSync) {
    return getCanonicalMigrationStatus(db);
}

function createSliceFlagCapabilities({
    flagKey,
    supportsChatStats = false,
    fallbackToGlobal = true,
}: { flagKey: string; supportsChatStats?: boolean; fallbackToGlobal?: boolean }) {
    const getFeatureFlagSnapshot = (overrides: FlagOverrides = null) => getCanonicalStorageSliceFeatureFlagSnapshot({
        flagKey,
        supportsChatStats,
        fallbackToGlobal,
        overrides,
    }) as FlagSnapshot;
    return {
        flagKey,
        getFeatureFlagSnapshot,
        getFeatureFlags(overrides: FlagOverrides = null) {
            return getFeatureFlagSnapshot(overrides).featureFlags;
        },
        getProjectionMode: getCanonicalSliceProjectionMode,
        getAuditTrackingFeatureFlags() {
            const featureFlags = getFeatureFlagSnapshot().featureFlags;
            return featureFlags.enabled || !fallbackToGlobal
                ? featureFlags
                : getCanonicalSqliteFeatureFlags();
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
        listOpenRepairs(db: DatabaseSync) {
            return listOpenProjectionRepairs(db);
        },
        getMigrationReadiness(db: DatabaseSync) {
            return createSharedMigrationReadiness(db);
        },
        getRollbackBlockers({
            db,
            featureFlags = null,
            phase = 'writes',
            persistedAuditStatus = null,
        }: RollbackOptions = {}) {
            return (buildCanonicalSliceRollbackBlockers as unknown as (options: RollbackBuilderOptions) => RollbackResult)({
                db,
                sliceKey: 'characters',
                featureFlags: flags.getFeatureFlags(featureFlags),
                phase,
                persistedAuditStatus: persistedAuditStatus
                    ?? getPersistedCanonicalAuditStatus(db as DatabaseSync, { scope: CHARACTER_AUDIT_SCOPE }),
                listOpenRepairs: listOpenProjectionRepairs,
                openRepairCode: 'open_projection_repairs',
                includeChatStatsPhase: true,
            });
        },
        getBackupManagedPaths(directories?: Directories) {
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
        listOpenRepairs(db: DatabaseSync) {
            return listOpenWorldInfoProjectionRepairs(db);
        },
        getMigrationReadiness(db: DatabaseSync) {
            return createSharedMigrationReadiness(db);
        },
        getRollbackBlockers({
            db,
            featureFlags = null,
            phase = 'writes',
            persistedAuditStatus = null,
            allowProtocolPending = false,
        }: RollbackOptions = {}) {
            return (buildCanonicalSliceRollbackBlockers as unknown as (options: RollbackBuilderOptions) => RollbackResult)({
                db,
                sliceKey: 'world_info',
                featureFlags: flags.getFeatureFlags(featureFlags),
                phase,
                persistedAuditStatus: persistedAuditStatus
                    ?? getPersistedCanonicalAuditStatus(db as DatabaseSync, { scope: WORLD_INFO_AUDIT_SCOPE }),
                listOpenRepairs: listOpenWorldInfoProjectionRepairs,
                openRepairCode: 'open_world_info_projection_repairs',
                allowProtocolPending,
                protocolRepairPrefix: WORLD_PROJECTION_INTENT_PREFIX,
                includeChatStatsPhase: false,
            });
        },
        getBackupManagedPaths(directories?: Directories) {
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
        listOpenRepairs(db: DatabaseSync) {
            return listOpenSettingsProjectionRepairs(db);
        },
        getMigrationReadiness(db: DatabaseSync) {
            return createSharedMigrationReadiness(db);
        },
        getRollbackBlockers({
            db,
            featureFlags = null,
            phase = 'writes',
            persistedAuditStatus = null,
        }: RollbackOptions = {}) {
            return (buildCanonicalSliceRollbackBlockers as unknown as (options: RollbackBuilderOptions) => RollbackResult)({
                db,
                sliceKey: 'settings',
                featureFlags: flags.getFeatureFlags(featureFlags),
                phase,
                persistedAuditStatus: persistedAuditStatus
                    ?? getPersistedCanonicalAuditStatus(db as DatabaseSync, { scope: SETTINGS_AUDIT_SCOPE }),
                listOpenRepairs: listOpenSettingsProjectionRepairs,
                openRepairCode: 'open_settings_projection_repairs',
                includeChatStatsPhase: false,
            });
        },
        getBackupManagedPaths() {
            // settings.json is not a runtime artifact anymore: backups and
            // restores run through canonical snapshots/exports, so there are
            // no slice-managed paths to verify.
            return [];
        },
    };
}

function createPresetsSlice() {
    const flags = createSliceFlagCapabilities({ flagKey: 'presets' });
    return {
        key: 'presets',
        ...flags,

        auditScope: PRESETS_AUDIT_SCOPE,
        // Presets never had a projection era: no repair table, nothing open.
        listOpenRepairs() {
            return [];
        },
        getMigrationReadiness(db: DatabaseSync) {
            return createSharedMigrationReadiness(db);
        },
        getRollbackBlockers({
            db,
            featureFlags = null,
            phase = 'writes',
            persistedAuditStatus = null,
        }: RollbackOptions = {}) {
            return (buildCanonicalSliceRollbackBlockers as unknown as (options: RollbackBuilderOptions) => RollbackResult)({
                db,
                sliceKey: 'presets',
                featureFlags: flags.getFeatureFlags(featureFlags),
                phase,
                persistedAuditStatus: persistedAuditStatus
                    ?? getPersistedCanonicalAuditStatus(db as DatabaseSync, { scope: PRESETS_AUDIT_SCOPE }),
                listOpenRepairs: () => [],
                openRepairCode: 'open_preset_repairs',
                includeChatStatsPhase: false,
            });
        },
        getBackupManagedPaths() {
            // Preset files are a one-shot migration input only; backups run
            // through canonical payloads, so there are no managed paths.
            return [];
        },
    };
}

function createSecretsSlice() {
    const flags = createSliceFlagCapabilities({ flagKey: 'secrets' });
    return {
        key: 'secrets',
        ...flags,
        auditScope: CANONICAL_SECRETS_AUDIT_SCOPE,
        listOpenRepairs(db: DatabaseSync) {
            return listOpenSecretProjectionRepairs(db);
        },
        getMigrationReadiness(db: DatabaseSync) {
            return createSharedMigrationReadiness(db);
        },
        getRollbackBlockers({
            db,
            featureFlags = null,
            phase = 'writes',
            persistedAuditStatus = null,
        }: RollbackOptions = {}) {
            return (buildCanonicalSliceRollbackBlockers as unknown as (options: RollbackBuilderOptions) => RollbackResult)({
                db,
                sliceKey: 'secrets',
                featureFlags: flags.getFeatureFlags(featureFlags),
                phase,
                persistedAuditStatus: persistedAuditStatus
                    ?? getPersistedCanonicalAuditStatus(db as DatabaseSync, { scope: CANONICAL_SECRETS_AUDIT_SCOPE }),
                listOpenRepairs: listOpenSecretProjectionRepairs,
                openRepairCode: 'open_secret_projection_repairs',
                includeChatStatsPhase: false,
            });
        },
        getBackupManagedPaths(directories?: Directories) {
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

    });
    return {
        key: 'managed_media',
        ...flags,
        auditScope: MANAGED_MEDIA_AUDIT_SCOPE,
        listOpenRepairs(db: DatabaseSync) {
            return listOpenCanonicalManagedMediaRepairs(db);
        },
        getMigrationReadiness(db: DatabaseSync) {
            return createSharedMigrationReadiness(db);
        },
        getRollbackBlockers({
            db,
            featureFlags = null,
            phase = 'writes',
            persistedAuditStatus = null,
        }: RollbackOptions = {}) {
            return (buildCanonicalSliceRollbackBlockers as unknown as (options: RollbackBuilderOptions) => RollbackResult)({
                db,
                sliceKey: 'managed_media',
                featureFlags: flags.getFeatureFlags(featureFlags),
                phase,
                persistedAuditStatus: persistedAuditStatus
                    ?? getPersistedCanonicalAuditStatus(db as DatabaseSync, { scope: MANAGED_MEDIA_AUDIT_SCOPE }),
                listOpenRepairs: listOpenCanonicalManagedMediaRepairs,
                openRepairCode: 'open_managed_media_repairs',
                includeChatStatsPhase: false,
            });
        },
        getBackupManagedPaths(directories?: Directories) {
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

function createChatsSlice() {
    const flags = createSliceFlagCapabilities({ flagKey: 'chats' });
    return {
        key: 'chats',
        ...flags,
        auditScope: CANONICAL_CHAT_AUDIT_SCOPE,
        authorityMode: 'canonical',
        listOpenRepairs(db: DatabaseSync) {
            return listOpenCanonicalChatProjectionRepairs(db);
        },
        getMigrationReadiness(db: DatabaseSync) {
            return createSharedMigrationReadiness(db);
        },
        getRollbackBlockers({
            db,
            featureFlags = null,
            phase = 'writes',
            persistedAuditStatus = null,
        }: RollbackOptions = {}) {
            return (buildCanonicalSliceRollbackBlockers as unknown as (options: RollbackBuilderOptions) => RollbackResult)({
                db,
                sliceKey: 'chats',
                featureFlags: flags.getFeatureFlags(featureFlags),
                phase,
                persistedAuditStatus: persistedAuditStatus
                    ?? getPersistedCanonicalAuditStatus(db as DatabaseSync, { scope: CANONICAL_CHAT_AUDIT_SCOPE }),
                listOpenRepairs: listOpenCanonicalChatProjectionRepairs,
                openRepairCode: 'open_chat_projection_repairs',
                includeChatStatsPhase: false,
            });
        },
        getBackupManagedPaths(directories?: Directories) {
            return [
                directories?.chats ?? null,
                directories?.groupChats ?? null,
            ].filter(Boolean);
        },
    };
}

export function createCanonicalStorageSliceRegistry(options: { registerDefaults: true }): BuiltinRegistry;
export function createCanonicalStorageSliceRegistry(options?: { registerDefaults?: boolean }): Registry;
export function createCanonicalStorageSliceRegistry({ registerDefaults = false } = {}): Registry {
    const slices = new Map<string, Slice>();
    const runners = new Map<string, SliceRunners>();

    function register(descriptor: unknown) {
        assertSliceDescriptor(descriptor);
        if (slices.has(descriptor.key)) {
            throw new Error(`Duplicate canonical storage slice key: ${descriptor.key}`);
        }
        const frozen = Object.freeze({ ...descriptor });
        slices.set(descriptor.key, frozen);
        return frozen;
    }

    function get(key: string) {
        const slice = slices.get(key);
        if (!slice) {
            throw new Error(`Unknown canonical storage slice: ${key}`);
        }
        return slice;
    }

    function has(key: string) {
        return slices.has(key);
    }

    function list() {
        return Array.from(slices.values());
    }

    function keys() {
        return Array.from(slices.keys());
    }

    function setRunners(key: string, runner: SliceRunners) {
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

    function getRunners(key: string) {
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
        register(createChatsSlice());
        register(createPresetsSlice());
    }

    return registry;
}

let defaultRegistry: BuiltinRegistry | null = null;

export function getDefaultCanonicalStorageSliceRegistry() {
    if (!defaultRegistry) {
        // Default registration installs these built-ins and duplicate keys are
        // rejected, unlike an arbitrary caller-supplied registry.
        defaultRegistry = createCanonicalStorageSliceRegistry({ registerDefaults: true });
        registerDefaultCanonicalStorageSliceRegistry(defaultRegistry);
    }
    return defaultRegistry;
}

// Eagerly register defaults so sliceKey-based blocker resolution works without
// an explicit getDefault call.
getDefaultCanonicalStorageSliceRegistry();


export function listCanonicalStorageSliceKeys(registry: ReturnType<typeof createCanonicalStorageSliceRegistry> = getDefaultCanonicalStorageSliceRegistry()) {
    return registry.keys();
}

export function getCanonicalStorageSlice<K extends BuiltinSliceKey>(key: K, registry?: BuiltinRegistry): BuiltinSlice<K>;
export function getCanonicalStorageSlice(key: string, registry?: ReturnType<typeof createCanonicalStorageSliceRegistry>): Slice;
export function getCanonicalStorageSlice(key: string, registry: ReturnType<typeof createCanonicalStorageSliceRegistry> = getDefaultCanonicalStorageSliceRegistry()): Slice {
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
}: { directories?: Directories; db?: DatabaseSync | null; registry?: ReturnType<typeof createCanonicalStorageSliceRegistry>; createdAtMs?: number; schemaVersion?: number | null } = {}) {
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
}: { directories?: Directories; db?: DatabaseSync | null; registry?: ReturnType<typeof createCanonicalStorageSliceRegistry>; managedFileManifest?: Manifest | null } = {}) {
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
