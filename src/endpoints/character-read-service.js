import fs from 'node:fs';
import path from 'node:path';

class CanonicalReadBlockedError extends Error {
    constructor(reason) {
        super(reason);
        this.name = 'CanonicalReadBlockedError';
        this.reason = reason;
    }
}

/**
 * @typedef {{ query?: string, tags?: string[], sort?: string }} CharacterReadFilter
 * @typedef {{ offset?: number, limit?: number }} CharacterReadPagination
 * @typedef {'instant' | 'fast' | 'slow'} CharacterReadLatencyHint
 */

/**
 * @param {object[]} data
 * @param {object} options
 * @param {string} [options.interactionPath]
 * @param {CharacterReadLatencyHint} options.latencyHint
 * @returns {{ result: { mode: 'snapshot', data: object[] }, interactionPath?: string, latencyHint: CharacterReadLatencyHint }}
 */
function wrapSnapshot(data, { interactionPath, latencyHint }) {
    return {
        result: { mode: 'snapshot', data },
        ...(interactionPath ? { interactionPath } : {}),
        latencyHint,
    };
}

function maybeAttachFallbackReason(result, fallbackReason) {
    return fallbackReason
        ? { ...result, fallbackReason }
        : result;
}

/**
 * @param {string} charactersDirectory
 * @param {{ sorted?: boolean }} [options]
 * @returns {string[]}
 */
function listAvatarFiles(charactersDirectory, { sorted = false } = {}) {
    const avatarFiles = fs.readdirSync(charactersDirectory).filter(file => file.endsWith('.png'));
    return sorted ? avatarFiles.sort((left, right) => left.localeCompare(right)) : avatarFiles;
}

/**
 * @param {import('../users.js').UserDirectoryList} directories
 * @param {boolean} shallow
 * @param {object} dependencies
 * @returns {Promise<object[]>}
 */
async function readCharactersFromFiles(directories, shallow, dependencies) {
    const avatarFiles = listAvatarFiles(directories.characters);
    const processingPromises = avatarFiles.map(file => dependencies.processCharacter(file, directories, { shallow }));
    return (await Promise.all(processingPromises)).filter(character => character.name);
}

function getCanonicalReadState(handle, directories, dependencies) {
    const featureFlags = dependencies.getCanonicalSqliteFeatureFlags?.() ?? {
        enabled: false,
        reads: false,
        strict: false,
    };

    if (!featureFlags.enabled) {
        return { enabled: false, strict: !!featureFlags.strict, fallbackReason: 'canonical_storage_disabled' };
    }

    if (!featureFlags.reads) {
        return { enabled: false, strict: !!featureFlags.strict, fallbackReason: 'canonical_reads_disabled' };
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
        return { enabled: false, strict: !!featureFlags.strict, fallbackReason: 'canonical_runtime_unsupported' };
    }

    if (storageStatus.disabledReason === 'migration_blocked') {
        return { enabled: false, strict: !!featureFlags.strict, fallbackReason: 'canonical_migration_blocked' };
    }

    const db = dependencies.openCanonicalDatabase?.({
        handle,
        directories,
        featureFlags,
    });
    if (!db) {
        return { enabled: false, strict: !!featureFlags.strict, fallbackReason: 'canonical_db_unavailable' };
    }

    const migrationStatus = dependencies.runCanonicalMigrations?.(db, {
        strict: !!featureFlags.strict,
    }) ?? { ok: true, currentVersion: 0, targetVersion: 0 };
    if (!migrationStatus.ok) {
        return { enabled: false, strict: !!featureFlags.strict, fallbackReason: 'canonical_migration_blocked' };
    }

    const auditStatus = dependencies.getCanonicalAuditStatus?.({
        handle,
        directories,
        db,
    }) ?? { ok: true, blocking: false, reason: null };
    if (auditStatus.blocking) {
        return {
            enabled: false,
            strict: !!featureFlags.strict,
            fallbackReason: auditStatus.reason ?? 'audit_drift_blocked',
        };
    }

    return {
        enabled: true,
        strict: !!featureFlags.strict,
        fallbackReason: null,
        includeChatStats: !!featureFlags.chatStats,
        db,
    };
}

function maybeThrowCanonicalFallback(canonicalState) {
    if (canonicalState.enabled || !canonicalState.strict) {
        return;
    }

    throw new CanonicalReadBlockedError(canonicalState.fallbackReason);
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
 * @returns {Promise<{ result: { mode: 'snapshot', data: object[] }, interactionPath: string, latencyHint: CharacterReadLatencyHint }>}
 */
export async function readCharacterListPayload({
    handle = null,
    directories,
    shallow,
    filter: _filter,
    pagination: _pagination,
    dependencies,
}) {
    const canonicalState = getCanonicalReadState(handle, directories, dependencies);
    if (canonicalState.enabled) {
        const data = await dependencies.listCanonicalCharacters(canonicalState.db, {
            useShallowPayload: shallow,
            includeChatStats: canonicalState.includeChatStats,
        });

        return wrapSnapshot(data, {
            interactionPath: 'characters_all:canonical',
            latencyHint: 'instant',
        });
    }

    maybeThrowCanonicalFallback(canonicalState);

    if (dependencies.isCharacterIndexSupported()) {
        try {
            const avatarFiles = listAvatarFiles(directories.characters, { sorted: true });
            const data = await dependencies.listIndexedCharacterPayloads({
                userRoot: directories.root,
                directories,
                avatarFiles,
                useShallowPayload: shallow,
                buildRow: avatar => dependencies.buildCharacterIndexRow(directories, avatar),
            });

            return wrapSnapshot(data, {
                interactionPath: 'characters_all:indexed',
                latencyHint: 'instant',
            });
        } catch (error) {
            dependencies.warn('Falling back to filesystem-backed character list after index read failure:', error);
            const data = await readCharactersFromFiles(directories, shallow, dependencies);
            return maybeAttachFallbackReason({
                ...wrapSnapshot(data, {
                    interactionPath: 'characters_all:filesystem',
                    latencyHint: 'slow',
                }),
            }, canonicalState.fallbackReason);
        }
    }

    const data = await readCharactersFromFiles(directories, shallow, dependencies);
    return maybeAttachFallbackReason({
        ...wrapSnapshot(data, {
        interactionPath: 'characters_all:filesystem',
        latencyHint: 'slow',
        }),
    }, canonicalState.fallbackReason);
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
 * @returns {Promise<{ result: { mode: 'snapshot', data: object[] }, latencyHint: CharacterReadLatencyHint }>}
 */
export async function readCharacterSummaryPayload({
    handle = null,
    directories,
    filter: _filter,
    pagination: _pagination,
    dependencies,
}) {
    const canonicalState = getCanonicalReadState(handle, directories, dependencies);
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

    if (dependencies.isCharacterIndexSupported()) {
        try {
            const avatarFiles = listAvatarFiles(directories.characters, { sorted: true });
            const data = await dependencies.listIndexedCharacterPayloads({
                userRoot: directories.root,
                directories,
                avatarFiles,
                useShallowPayload: true,
                buildRow: avatar => dependencies.buildCharacterIndexRow(directories, avatar),
            });

            return wrapSnapshot(data, { latencyHint: 'instant' });
        } catch (error) {
            dependencies.warn('Falling back to filesystem-backed character summary list after index read failure:', error);
            const data = await readCharactersFromFiles(directories, true, dependencies);
            return maybeAttachFallbackReason(wrapSnapshot(data, { latencyHint: 'slow' }), canonicalState.fallbackReason);
        }
    }

    const data = await readCharactersFromFiles(directories, true, dependencies);
    return maybeAttachFallbackReason(wrapSnapshot(data, { latencyHint: 'slow' }), canonicalState.fallbackReason);
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
 * }>}
 */
export async function readCharacterFullPayload({
    handle = null,
    directories,
    avatarUrl,
    dependencies,
}) {
    const canonicalState = getCanonicalReadState(handle, directories, dependencies);
    let fallbackReason = canonicalState.fallbackReason;
    if (canonicalState.enabled) {
        const data = await dependencies.getCanonicalCharacter(canonicalState.db, avatarUrl, {
            includeChatStats: canonicalState.includeChatStats,
        });
        if (data) {
            return {
                status: 'found',
                result: { mode: 'snapshot', data },
                interactionPath: 'characters_get:canonical',
                latencyHint: 'instant',
            };
        }

        dependencies.warn?.(`Canonical character row missing for ${avatarUrl}; falling back to file-backed read.`);
        fallbackReason = 'canonical_db_row_missing';
    } else {
        maybeThrowCanonicalFallback(canonicalState);
    }

    const filePath = path.join(directories.characters, avatarUrl);
    let fileStat;
    try {
        fileStat = dependencies.statCharacterFile(filePath);
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return {
                status: 'not_found',
                interactionPath: 'characters_get:filesystem',
                latencyHint: 'instant',
                ...(fallbackReason ? { fallbackReason } : {}),
            };
        }
        throw error;
    }

    if (dependencies.isCharacterIndexSupported()) {
        try {
            const indexedPayload = dependencies.getFreshIndexedCharacterFullPayload(
                directories.root,
                directories,
                avatarUrl,
                fileStat,
            );

            if (indexedPayload) {
                return maybeAttachFallbackReason({
                    status: 'found',
                    result: { mode: 'snapshot', data: indexedPayload },
                    interactionPath: 'characters_get:indexed',
                    latencyHint: 'instant',
                }, fallbackReason);
            }
        } catch (error) {
            dependencies.warn(`Character index lookup skipped for ${avatarUrl}:`, error);
        }
    }

    const data = await dependencies.processCharacter(avatarUrl, directories, { shallow: false });
    const latencyHint = dependencies.isCharacterIndexSupported() ? 'fast' : 'slow';

    if (dependencies.isCharacterIndexSupported() && data?.name) {
        try {
            fileStat = dependencies.statCharacterFile(filePath);
            dependencies.upsertCharacterIndexEntry(directories.root, avatarUrl, {
                avatar: avatarUrl,
                fullPayload: data,
                shallowPayload: dependencies.toShallow(data),
                sourceMtimeMs: fileStat.mtimeMs,
                sourceSize: fileStat.size,
                ...dependencies.getCharacterIndexWorldMetadata(directories, data),
            });
        } catch (error) {
            if (error?.code !== 'ENOENT') {
                dependencies.warn(`Character index refresh skipped after get for ${avatarUrl}:`, error);
            }
        }
    }

    return maybeAttachFallbackReason({
        status: 'found',
        result: { mode: 'snapshot', data },
        interactionPath: 'characters_get:filesystem',
        latencyHint,
    }, fallbackReason);
}
