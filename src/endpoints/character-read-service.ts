import type { DatabaseSync } from 'node:sqlite';
import type { UserDirectoryList } from '../users.js';

type MaybePromise<T> = T | Promise<T>;
export type CharacterReadFilter = { query?: string; tags?: string[]; sort?: string };
export type CharacterReadPagination = { offset?: number; limit?: number };
export type CharacterReadLatencyHint = 'instant' | 'fast' | 'slow';
export type CharacterReadFlags = { enabled: boolean; reads: boolean; strict: boolean; chatStats?: boolean };
type ReadContext = { handle: string | null; directories: UserDirectoryList; featureFlags: CharacterReadFlags };
type CharacterPayload = object;
export type CharacterReadDependencies = {
    getCanonicalSqliteFeatureFlags?: () => CharacterReadFlags;
    ensureCanonicalBackend?: (directories: UserDirectoryList, handle: string | null) => MaybePromise<unknown>;
    getCanonicalStorageStatus?: (context: ReadContext) => { supported: boolean; disabledReason: string | null };
    openCanonicalDatabase?: (context: ReadContext) => DatabaseSync | null | undefined;
    runCanonicalMigrations?: (db: DatabaseSync, options: { strict: boolean }) => { ok: boolean };
    getCanonicalAuditStatus?: (context: { handle: string | null; directories: UserDirectoryList; db: DatabaseSync }) => { blocking: boolean; reason: string | null };
    listCanonicalCharacters: (db: DatabaseSync, options: { useShallowPayload: boolean; includeChatStats: boolean }) => MaybePromise<CharacterPayload[]>;
    getCanonicalCharacter: (db: DatabaseSync, avatarUrl: string, options: { includeChatStats: boolean }) => MaybePromise<CharacterPayload | null | undefined>;
    resolveCanonicalCharacterBooks?: (data: CharacterPayload | CharacterPayload[], context: { db: DatabaseSync; directories: UserDirectoryList; handle: string | null }) => MaybePromise<unknown>;
    warn?: (message: string) => void;
};
type CanonicalReadState = { enabled: true; strict: boolean; readsRequested: true; fallbackReason: null; includeChatStats: boolean; db: DatabaseSync } | { enabled: false; strict: boolean; readsRequested: boolean; fallbackReason: string; safeReason?: string };
type ReadOptions = { handle?: string | null; directories: UserDirectoryList; filter?: CharacterReadFilter; pagination?: CharacterReadPagination; dependencies: CharacterReadDependencies };
export type CharacterListReadOptions = ReadOptions & { shallow: boolean };
export type CharacterSummaryReadOptions = ReadOptions;
export type CharacterFullReadOptions = Omit<ReadOptions, 'filter' | 'pagination'> & { avatarUrl: string };
export type CharacterSnapshotResult = { result: { mode: 'snapshot'; data: CharacterPayload[] }; interactionPath?: string; latencyHint: CharacterReadLatencyHint; fallbackReason?: string; canonicalUnavailable?: string };
export type CharacterFullReadResult = { status: 'found' | 'not_found'; result?: { mode: 'snapshot'; data: CharacterPayload }; interactionPath: string; latencyHint: CharacterReadLatencyHint; fallbackReason?: string; canonicalUnavailable?: string };

export class CanonicalReadBlockedError extends Error {
    declare readonly reason: string;
    declare readonly safeReason: string;

    constructor(reason: string, safeReason: string) {
        super(reason);
        this.name = 'CanonicalReadBlockedError';
        this.reason = reason;
        this.safeReason = safeReason;
    }
}

/**
 * @param {object[]} data
 * @param {object} options
 * @param {string} [options.interactionPath]
 * @param {CharacterReadLatencyHint} options.latencyHint
 * @returns {{ result: { mode: 'snapshot', data: object[] }, interactionPath?: string, latencyHint: CharacterReadLatencyHint }}
 */
function wrapSnapshot(data: CharacterPayload[], { interactionPath, latencyHint }: { interactionPath?: string; latencyHint: CharacterReadLatencyHint }): CharacterSnapshotResult {
    return {
        result: { mode: 'snapshot', data },
        ...(interactionPath ? { interactionPath } : {}),
        latencyHint,
    };
}

function maybeAttachFallbackReason(result: CharacterSnapshotResult, fallbackReason: string | null): CharacterSnapshotResult {
    return fallbackReason
        ? { ...result, fallbackReason }
        : result;
}

async function getCanonicalReadState(handle: string | null, directories: UserDirectoryList, dependencies: CharacterReadDependencies): Promise<CanonicalReadState> {
    const featureFlags = dependencies.getCanonicalSqliteFeatureFlags?.() ?? {
        enabled: false,
        reads: false,
        strict: false,
    };

    if (!featureFlags.enabled) {
        return {
            enabled: false,
            strict: !!featureFlags.strict,
            readsRequested: false,
            fallbackReason: 'canonical_storage_disabled',
        };
    }

    // Run the per-user shadow import and audit so persisted audit status is fresh.
    await dependencies.ensureCanonicalBackend?.(directories, handle);

    if (!featureFlags.reads) {
        return {
            enabled: false,
            strict: !!featureFlags.strict,
            readsRequested: false,
            fallbackReason: 'canonical_reads_disabled',
        };
    }

    const storageStatus = dependencies.getCanonicalStorageStatus?.({
        handle,
        directories,
        featureFlags,
    }) ?? {
        supported: true,
        disabledReason: null,
    };

    if (!storageStatus.supported) {
        return {
            enabled: false,
            strict: !!featureFlags.strict,
            readsRequested: true,
            fallbackReason: 'canonical_runtime_unsupported',
        };
    }

    if (storageStatus.disabledReason === 'migration_blocked') {
        return {
            enabled: false,
            strict: !!featureFlags.strict,
            readsRequested: true,
            fallbackReason: 'canonical_migration_blocked',
        };
    }

    const db = dependencies.openCanonicalDatabase?.({
        handle,
        directories,
        featureFlags,
    });
    if (!db) {
        return {
            enabled: false,
            strict: !!featureFlags.strict,
            readsRequested: true,
            fallbackReason: 'canonical_db_unavailable',
        };
    }

    const migrationStatus = dependencies.runCanonicalMigrations?.(db, {
        strict: !!featureFlags.strict,
    }) ?? { ok: true, currentVersion: 0, targetVersion: 0 };
    if (!migrationStatus.ok) {
        return {
            enabled: false,
            strict: !!featureFlags.strict,
            readsRequested: true,
            fallbackReason: 'canonical_migration_blocked',
        };
    }

    const auditStatus = dependencies.getCanonicalAuditStatus?.({
        handle,
        directories,
        db,
    }) ?? { ok: true, blocking: false, reason: null };
    if (auditStatus.blocking) {
        // Persisted audit reasons are arbitrary data, not public error categories.
        return {
            enabled: false,
            strict: !!featureFlags.strict,
            readsRequested: true,
            fallbackReason: auditStatus.reason ?? 'audit_drift_blocked',
            safeReason: 'canonical_storage_unavailable',
        };
    }

    return {
        enabled: true,
        strict: !!featureFlags.strict,
        readsRequested: true,
        fallbackReason: null,
        includeChatStats: !!featureFlags.chatStats,
        db,
    };
}

function maybeThrowCanonicalFallback(canonicalState: CanonicalReadState): void {
    if (canonicalState.enabled || !canonicalState.strict) {
        return;
    }

    throw new CanonicalReadBlockedError(canonicalState.fallbackReason, canonicalState.safeReason ?? canonicalState.fallbackReason);
}

/**
 * Reads the character list payload used by `/api/characters/all`.
 *
 * `filter` and `pagination` are intentionally accepted as future read context
 * and ignored in this behavior-equivalent slice.
 *
 * @param {object} options
 * @param {import('../users.js').UserDirectoryList} options.directories
 * @param {boolean} options.shallow
 * @param {CharacterReadFilter} [options.filter]
 * @param {CharacterReadPagination} [options.pagination]
 * @param {object} options.dependencies
 * @returns {Promise<{ result: { mode: 'snapshot', data: object[] }, interactionPath: string, latencyHint: CharacterReadLatencyHint, canonicalUnavailable?: string }>}
 */
export async function readCharacterListPayload({
    handle = null,
    directories,
    shallow,
    filter: _filter,
    pagination: _pagination,
    dependencies,
}: CharacterListReadOptions): Promise<CharacterSnapshotResult> {
    const canonicalState = await getCanonicalReadState(handle, directories, dependencies);
    if (canonicalState.enabled) {
        const data = await dependencies.listCanonicalCharacters(canonicalState.db, {
            useShallowPayload: shallow,
            includeChatStats: canonicalState.includeChatStats,
        });
        if (!shallow) {
            await dependencies.resolveCanonicalCharacterBooks?.(data, {
                db: canonicalState.db,
                directories,
                handle,
            });
        }

        return wrapSnapshot(data, {
            interactionPath: 'characters_all:canonical',
            latencyHint: 'instant',
        });
    }

    maybeThrowCanonicalFallback(canonicalState);

    // Canonical storage is the only runtime authority: files are export
    // surfaces, so an unavailable canonical backend yields an empty snapshot
    // with the blocking reason rather than a file-backed list.
    return {
        ...maybeAttachFallbackReason(wrapSnapshot([], {
            interactionPath: 'characters_all:canonical_unavailable',
            latencyHint: 'instant',
        }), canonicalState.fallbackReason),
        canonicalUnavailable: canonicalState.safeReason ?? canonicalState.fallbackReason,
    };
}

/**
 * Reads the shallow summary payload used by `/api/characters/list`.
 *
 * `filter` and `pagination` are intentionally accepted as future read context
 * and ignored in this behavior-equivalent slice.
 *
 * @param {object} options
 * @param {import('../users.js').UserDirectoryList} options.directories
 * @param {CharacterReadFilter} [options.filter]
 * @param {CharacterReadPagination} [options.pagination]
 * @param {object} options.dependencies
 * @returns {Promise<{ result: { mode: 'snapshot', data: object[] }, latencyHint: CharacterReadLatencyHint, canonicalUnavailable?: string }>}
 */
export async function readCharacterSummaryPayload({
    handle = null,
    directories,
    filter: _filter,
    pagination: _pagination,
    dependencies,
}: CharacterSummaryReadOptions): Promise<CharacterSnapshotResult> {
    const canonicalState = await getCanonicalReadState(handle, directories, dependencies);
    if (canonicalState.enabled) {
        const data = await dependencies.listCanonicalCharacters(canonicalState.db, {
            useShallowPayload: true,
            includeChatStats: canonicalState.includeChatStats,
        });

        return wrapSnapshot(data, {
            latencyHint: 'instant',
        });
    }

    maybeThrowCanonicalFallback(canonicalState);

    return {
        ...maybeAttachFallbackReason(wrapSnapshot([], { latencyHint: 'instant' }), canonicalState.fallbackReason),
        canonicalUnavailable: canonicalState.safeReason ?? canonicalState.fallbackReason,
    };
}

/**
 * Reads the full character payload used by `/api/characters/get`.
 *
 * @param {object} options
 * @param {import('../users.js').UserDirectoryList} options.directories
 * @param {string} options.avatarUrl
 * @param {object} options.dependencies
 * @returns {Promise<{
 *   status: 'found' | 'not_found',
 *   result?: { mode: 'snapshot', data: object },
 *   interactionPath: string,
 *   latencyHint: CharacterReadLatencyHint,
 *   canonicalUnavailable?: string,
 * }>}
 */
export async function readCharacterFullPayload({
    handle = null,
    directories,
    avatarUrl,
    dependencies,
}: CharacterFullReadOptions): Promise<CharacterFullReadResult> {
    const canonicalState = await getCanonicalReadState(handle, directories, dependencies);
    let fallbackReason = canonicalState.fallbackReason;
    if (canonicalState.enabled) {
        const data = await dependencies.getCanonicalCharacter(canonicalState.db, avatarUrl, {
            includeChatStats: canonicalState.includeChatStats,
        });
        if (data) {
            await dependencies.resolveCanonicalCharacterBooks?.(data, {
                db: canonicalState.db,
                directories,
                handle,
            });
            return {
                status: 'found',
                result: { mode: 'snapshot', data },
                interactionPath: 'characters_get:canonical',
                latencyHint: 'instant',
            };
        }

        dependencies.warn?.(`Canonical character row missing for ${avatarUrl}.`);
        fallbackReason = 'canonical_db_row_missing';
    } else {
        maybeThrowCanonicalFallback(canonicalState);
    }

    // No file fallback: a missing canonical row means the character does not
    // exist (or has not been imported yet by the shadow-import machinery).
    return {
        status: 'not_found',
        interactionPath: 'characters_get:canonical_unavailable',
        latencyHint: 'instant',
        ...(fallbackReason ? { fallbackReason } : {}),
        ...(!canonicalState.enabled ? { canonicalUnavailable: canonicalState.safeReason ?? canonicalState.fallbackReason } : {}),
    };
}
