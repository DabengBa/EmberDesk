import fs from 'node:fs';
import path from 'node:path';

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
    directories,
    shallow,
    filter: _filter,
    pagination: _pagination,
    dependencies,
}) {
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
            return wrapSnapshot(data, {
                interactionPath: 'characters_all:filesystem',
                latencyHint: 'slow',
            });
        }
    }

    const data = await readCharactersFromFiles(directories, shallow, dependencies);
    return wrapSnapshot(data, {
        interactionPath: 'characters_all:filesystem',
        latencyHint: 'slow',
    });
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
    directories,
    filter: _filter,
    pagination: _pagination,
    dependencies,
}) {
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
            return wrapSnapshot(data, { latencyHint: 'slow' });
        }
    }

    const data = await readCharactersFromFiles(directories, true, dependencies);
    return wrapSnapshot(data, { latencyHint: 'slow' });
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
    directories,
    avatarUrl,
    dependencies,
}) {
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
                return {
                    status: 'found',
                    result: { mode: 'snapshot', data: indexedPayload },
                    interactionPath: 'characters_get:indexed',
                    latencyHint: 'instant',
                };
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

    return {
        status: 'found',
        result: { mode: 'snapshot', data },
        interactionPath: 'characters_get:filesystem',
        latencyHint,
    };
}
