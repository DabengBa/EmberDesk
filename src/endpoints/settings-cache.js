import fs from 'node:fs';
import path from 'node:path';

/**
 * In-process directory payload cache for /api/settings/get.
 * Key: absolute directory path.
 * Value: { payload, inflight }
 */

/** @type {Map<string, { payload: any, inflight: Promise<any> | null }>} */
const cache = new Map();
/** @type {Map<string, number>} */
const generations = new Map();

/**
 * Read and parse all files in a directory (async).
 * @param {string} directoryPath
 * @param {string} [fileExtension='.json']
 * @returns {Promise<Array>}
 */
export async function readAndParseFromDirectoryAsync(directoryPath, fileExtension = '.json') {
    const entries = await fs.promises.readdir(directoryPath);
    const files = entries
        .filter(x => path.parse(x).ext === fileExtension)
        .sort();

    const results = await Promise.allSettled(
        files.map(async item => {
            const content = await fs.promises.readFile(path.join(directoryPath, item), 'utf-8');
            return fileExtension === '.json' ? JSON.parse(content) : content;
        }),
    );

    const parsed = [];
    for (const r of results) {
        if (r.status === 'fulfilled') {
            parsed.push(r.value);
        }
    }
    return parsed;
}

/**
 * Read preset files from a directory (async).
 * @param {string} directoryPath
 * @param {object} [options={}]
 * @returns {Promise<{ fileContents: string[], fileNames: string[] }>}
 */
export async function readPresetsFromDirectoryAsync(directoryPath, options = {}) {
    const {
        sortFunction,
        removeFileExtension = false,
        fileExtension = '.json',
    } = options;

    const entries = await fs.promises.readdir(directoryPath);
    const files = entries.sort(sortFunction).filter(x => path.parse(x).ext === fileExtension);

    const fileContents = [];
    const fileNames = [];

    const results = await Promise.allSettled(
        files.map(async item => {
            const content = await fs.promises.readFile(path.join(directoryPath, item), 'utf8');
            JSON.parse(content); // validate
            return { content, name: removeFileExtension ? item.replace(/\.[^/.]+$/, '') : item };
        }),
    );

    for (let i = 0; i < results.length; i++) {
        const r = results[i];
        if (r.status === 'fulfilled') {
            fileContents.push(r.value.content);
            fileNames.push(r.value.name);
        } else {
            console.warn(`${files[i]} is not a valid JSON`);
        }
    }

    return { fileContents, fileNames };
}

/**
 * Read world names from the worlds directory (async).
 * @param {string} directoryPath
 * @returns {Promise<string[]>}
 */
export async function readWorldNamesAsync(directoryPath) {
    const entries = await fs.promises.readdir(directoryPath);
    const worldFiles = entries
        .filter(file => path.extname(file).toLowerCase() === '.json')
        .sort((a, b) => a.localeCompare(b));
    return worldFiles.map(item => path.parse(item).name);
}

/**
 * Get cached payload for a directory, rebuilding if needed.
 * Concurrent callers for the same directory share one rebuild.
 * @param {string} dirPath  Absolute directory path
 * @param {() => Promise<any>} rebuild  Async function that produces the payload
 * @returns {Promise<any>}
 */
export async function getCachedPayload(dirPath, rebuild) {
    const entry = cache.get(dirPath);
    if (entry && entry.payload !== undefined) {
        return entry.payload;
    }

    if (entry && entry.inflight) {
        return entry.inflight;
    }

    const generation = generations.get(dirPath) ?? 0;
    const promise = (async () => {
        try {
            const payload = await rebuild();
            const latestEntry = cache.get(dirPath);
            const latestGeneration = generations.get(dirPath) ?? 0;
            if (latestEntry?.inflight === promise && latestGeneration === generation) {
                cache.set(dirPath, { payload, inflight: null });
            }
            return payload;
        } catch (err) {
            // Remove broken entry so next request retries
            if (cache.get(dirPath)?.inflight === promise) {
                cache.delete(dirPath);
            }
            throw err;
        }
    })();

    cache.set(dirPath, { payload: undefined, inflight: promise });
    return promise;
}

/**
 * Invalidate a cached directory payload.
 * Called after successful EmberDesk writes to a directory.
 * @param {string} dirPath  Absolute directory path
 */
export function invalidateDirectory(dirPath) {
    generations.set(dirPath, (generations.get(dirPath) ?? 0) + 1);
    cache.delete(dirPath);
}
