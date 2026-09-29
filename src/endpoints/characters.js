import path from 'node:path';
import fs, { promises as fsPromises } from 'node:fs';
import { Buffer } from 'node:buffer';
import crypto, { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

import express from 'express';
import sanitize from 'sanitize-filename';
import { sync as writeFileAtomicSync } from 'write-file-atomic';
import yaml from 'yaml';
import _ from 'lodash';
import mime from 'mime-types';
import { Jimp, JimpMime } from '../jimp.js';
import storage from 'node-persist';

import { AVATAR_WIDTH, AVATAR_HEIGHT, DEFAULT_AVATAR_PATH } from '../constants.js';
import { default as validateAvatarUrlMiddleware, getFileNameValidationFunction, forbiddenRegExp } from '../middleware/validateFileName.js';
import { deepMerge, humanizedDateTime, tryParse, MemoryLimitedMap, getConfigValue, mutateJsonString, clientRelativePath, getUniqueName, sanitizeSafeCharacterReplacements } from '../util.js';
import { TavernCardValidator } from '../validator/TavernCardValidator.js';
import { parse, write } from '../character-card-parser.js';
import { processUnsetSentinels, toShallow, unsetPrivateFields } from './character-card-helpers.js';
import {
    buildCharacterFileSnapshotRow,
    processCharacterFileSnapshot,
    statCharacterSnapshotFile,
} from './character-file-snapshot.js';
import {
    charaFormatData,
    convertToV2,
    convertWorldInfoToCharacterBook,
    getCharaCardV2,
    readFromV2,
} from './character-card-v2.js';
import {
    readCharacterFullPayload,
    readCharacterListPayload,
    readCharacterSummaryPayload,
} from './character-read-service.js';
import { getCanonicalStorageSlice } from '../canonical-storage-slice-registry.js';
import { ensureCanonicalSliceBackend } from '../canonical-backend.js';
import { getCanonicalStorageStatus, openCanonicalDatabase, withCanonicalTransaction } from '../canonical-sqlite.js';
import { runCanonicalMigrations } from '../canonical-sqlite-migrations.js';
import { getPersistedCanonicalAuditStatus, invalidateCanonicalAuditStatus } from '../canonical-sqlite-shadow-import.js';
import { recordImportLedgerEntry, removeImportLedgerEntry } from '../canonical-import-ledger.js';
import {
    renameCharacterAvatarBlobReference,
    retireCharacterAvatarBlobReference,
} from '../canonical-avatar-blobs.js';
import { getCharacterAvatarBlobContents, recordCharacterAvatarBlob } from '../canonical-avatar-blob-service.js';
import { getCanonicalFlagContractStatus } from '../canonical-sqlite-rollout-contract.js';
import {
    getCanonicalCharacter,
    listCanonicalCharacters,
    markCanonicalCharacterDeleted,
    recordProjectionRepair as persistProjectionRepair,
    renameCanonicalCharacter,
    scanCanonicalCharacterWorldBindings,
    upsertCanonicalCharacter,
} from './character-store.js';
import { getCanonicalWorldInfoBook, normalizeCanonicalWorldInfoName } from './world-info-store.js';
import {
    createCharacterCard,
    deleteCharacterCard,
    editCharacterCard,
    renameCharacterCard,
} from './character-write-service.js';
import { listCanonicalCharacterChatPayload } from './canonical-chat-query-service.js';
import {
    deleteCanonicalChatSessionsForOwner,
    retargetCanonicalChatSessionsOwner,
} from './canonical-chat-store.js';
import {
    parseCanonicalChatJsonl,
    writeCanonicalChatPayload,
} from './canonical-chat-write-service.js';
import { writeCanonicalManagedMedia } from './canonical-managed-media-write-service.js';
import { createCharacterImportCoordinator } from './character-import-service.js';

import { areThumbnailsEnabled, generateThumbnail, invalidateThumbnail } from './thumbnails.js';
import { getUserDirectories } from '../users.js';
import { ByafParser } from '../byaf.js';
import { CharXParser, persistCharXAssets } from '../charx.js';
import cacheBuster from '../middleware/cacheBuster.js';

const DELETE_PREFLIGHT_AVATAR_LIMIT = 500;

// With 100 MB limit it would take roughly 3000 characters to reach this limit
const memoryCacheCapacity = getConfigValue('performance.memoryCacheCapacity', '100mb');
const memoryCache = new MemoryLimitedMap(memoryCacheCapacity);
// Some Android devices require tighter memory management
const isAndroid = process.platform === 'android';
// Use shallow character data for the character list
const useShallowCharacters = !!getConfigValue('performance.lazyLoadCharacters', false, 'boolean');
const useDiskCache = !!getConfigValue('performance.useDiskCache', true, 'boolean');

function isInteractionPerfModeEnabled() {
    return process.env.EMBERDESK_INTERACTION_PERF_MODE === '1';
}

function applyInteractionPerfHeaders(response, pathName, startedAt, _directories = null) {
    if (!isInteractionPerfModeEnabled()) {
        return;
    }

    const durationMs = Math.max(0, performance.now() - startedAt);
    response.set('X-EmberDesk-Interaction-Path', pathName);
    response.set('Server-Timing', `route;dur=${durationMs.toFixed(1)}`);
}

class DiskCache {
    /**
     * @type {string}
     * @readonly
     */
    static DIRECTORY = 'characters';

    /**
     * @type {number}
     * @readonly
     */
    static SYNC_INTERVAL = 5 * 60 * 1000;

    /** @type {import('node-persist').LocalStorage} */
    #instance;

    /** @type {NodeJS.Timeout} */
    #syncInterval;

    /**
     * Queue of user handles to sync.
     * @type {Set<string>}
     * @readonly
     */
    syncQueue = new Set();

    /**
     * Path to the cache directory.
     * @returns {string}
     */
    get cachePath() {
        return path.join(globalThis.DATA_ROOT, '_cache', DiskCache.DIRECTORY);
    }

    /**
     * Returns the list of hashed keys in the cache.
     * @returns {string[]}
     */
    get hashedKeys() {
        return fs.readdirSync(this.cachePath);
    }

    /**
     * Processes the synchronization queue.
     * @returns {Promise<void>}
     */
    async #syncCacheEntries() {
        try {
            if (!useDiskCache || this.syncQueue.size === 0) {
                return;
            }

            const directories = [...this.syncQueue].map(entry => getUserDirectories(entry));
            this.syncQueue.clear();

            await this.verify(directories);
        } catch (error) {
            console.error('Error while synchronizing cache entries:', error);
        }
    }

    /**
     * Gets the disk cache instance.
     * @returns {Promise<import('node-persist').LocalStorage>}
     */
    async instance() {
        if (this.#instance) {
            return this.#instance;
        }

        this.#instance = storage.create({
            dir: this.cachePath,
            ttl: false,
            forgiveParseErrors: true,
            expiredInterval: 0,
            // @ts-ignore
            maxFileDescriptors: 100,
        });
        await this.#instance.init();
        this.#syncInterval = setInterval(this.#syncCacheEntries.bind(this), DiskCache.SYNC_INTERVAL);
        return this.#instance;
    }

    /**
     * Verifies disk cache size and prunes it if necessary.
     * @param {import('../users.js').UserDirectoryList[]} directoriesList List of user directories
     * @returns {Promise<void>}
     */
    async verify(directoriesList) {
        try {
            if (!useDiskCache) {
                return;
            }

            const cache = await this.instance();
            const validKeys = new Set();
            for (const dir of directoriesList) {
                const files = fs.readdirSync(dir.characters, { withFileTypes: true });
                for (const file of files.filter(f => f.isFile() && path.extname(f.name) === '.png')) {
                    const filePath = path.join(dir.characters, file.name);
                    const cacheKey = getCacheKey(filePath);
                    validKeys.add(path.parse(cache.getDatumPath(cacheKey)).base);
                }
            }
            for (const key of this.hashedKeys) {
                if (!validKeys.has(key)) {
                    await cache.removeItem(key);
                }
            }
        } catch (error) {
            console.error('Error while verifying disk cache:', error);
        }
    }

    dispose() {
        if (this.#syncInterval) {
            clearInterval(this.#syncInterval);
        }
    }
}

export const diskCache = new DiskCache();

/**
 * Gets the cache key for the specified image file.
 * @param {string} inputFile - Path to the image file
 * @returns {string} - Cache key
 */
function getCacheKey(inputFile) {
    if (fs.existsSync(inputFile)) {
        const stat = fs.statSync(inputFile);
        return `${inputFile}-${stat.mtimeMs}`;
    }

    return inputFile;
}

/**
 * Reads the character card from the specified image file.
 * @param {string} inputFile - Path to the image file
 * @param {string} inputFormat - 'png'
 * @returns {Promise<string | undefined>} - Character card data
 */
async function readCharacterData(inputFile, inputFormat = 'png') {
    const cacheKey = getCacheKey(inputFile);
    if (memoryCache.has(cacheKey)) {
        return memoryCache.get(cacheKey);
    }
    if (useDiskCache) {
        try {
            const cache = await diskCache.instance();
            const cachedData = await cache.getItem(cacheKey);
            if (cachedData) {
                return cachedData;
            }
        } catch (error) {
            console.warn('Error while reading from disk cache:', error);
        }
    }

    const result = await parse(inputFile, inputFormat);
    if (!isAndroid) {
        memoryCache.set(cacheKey, result);
    }
    if (useDiskCache) {
        try {
            const cache = await diskCache.instance();
            await cache.setItem(cacheKey, result);
        } catch (error) {
            console.warn('Error while writing to disk cache:', error);
        }
    }
    return result;
}

/**
 * Writes the character card to the specified image file.
 * @param {string|Buffer} inputFile - Path to the image file or image buffer
 * @param {string} data - Character card data
 * @param {string} outputFile - Target image file name
 * @param {import('express').Request} request - Express request obejct
 * @param {Crop|undefined} crop - Crop parameters
 * @param {{ shouldRegenerateThumbnail?: boolean }} [options] - Thumbnail regeneration options
 * @returns {Promise<boolean>} - True if the operation was successful
 */
async function writeCharacterData(inputFile, data, outputFile, request, crop = undefined, options = {}) {
    try {
        const outputImagePath = path.join(request.user.directories.characters, `${outputFile}.png`);
        const outputAvatarName = path.parse(outputImagePath).base;
        const shouldRegenerateThumbnail = options.shouldRegenerateThumbnail ?? true;

        if (options.projection === 'off') {
            // Canonical rows are already committed; the PNG file is an export
            // surface. Only keep the avatar blob + thumbnail warm when a real
            // image source was provided (card-only edits and renames may not
            // have one — their blobs are handled by canonical transactions).
            const hasImageSource = Buffer.isBuffer(inputFile)
                || (typeof inputFile === 'string' && fs.existsSync(inputFile));
            if (!hasImageSource) {
                return true;
            }
            const inputImage = await (async () => {
                try {
                    return Buffer.isBuffer(inputFile)
                        ? await parseImageBuffer(inputFile, crop)
                        : await tryReadImage(inputFile, crop);
                } catch (error) {
                    console.warn('Failed to read image; using fallback avatar.', error);
                    return await fs.promises.readFile(DEFAULT_AVATAR_PATH);
                }
            })();
            const outputImage = write(inputImage, data);
            recordCharacterAvatarBlobSafe(request.user.profile?.handle ?? null, request.user.directories, outputAvatarName, outputImage);
            startThumbnailPregeneration(request.user.directories, 'avatar', outputAvatarName, false, shouldRegenerateThumbnail);
            return true;
        }

        // Reset the cache
        for (const key of memoryCache.keys()) {
            if (Buffer.isBuffer(inputFile)) {
                break;
            }
            if (key.startsWith(inputFile)) {
                memoryCache.delete(key);
                break;
            }
        }
        if (useDiskCache && !Buffer.isBuffer(inputFile)) {
            diskCache.syncQueue.add(request.user.profile.handle);
        }
        /**
         * Read the image, resize, and save it as a PNG into the buffer.
         * @returns {Promise<Buffer>} Image buffer
         */
        async function getInputImage() {
            try {
                if (Buffer.isBuffer(inputFile)) {
                    return await parseImageBuffer(inputFile, crop);
                }

                return await tryReadImage(inputFile, crop);
            } catch (error) {
                const message = Buffer.isBuffer(inputFile) ? 'Failed to read image buffer.' : `Failed to read image: ${inputFile}.`;
                console.warn(message, 'Using a fallback image.', error);
                return await fs.promises.readFile(DEFAULT_AVATAR_PATH);
            }
        }

        if (shouldRegenerateThumbnail && fs.existsSync(outputImagePath)) {
            invalidateThumbnail(request.user.directories, 'avatar', outputAvatarName);
        }

        const inputImage = await getInputImage();

        // Get the chunks
        const outputImage = write(inputImage, data);

        writeFileAtomicSync(outputImagePath, outputImage);
        recordCharacterProjectionLedgerSafe(request.user.profile?.handle ?? null, request.user.directories, outputAvatarName, outputImage);
        recordCharacterAvatarBlobSafe(request.user.profile?.handle ?? null, request.user.directories, outputAvatarName, outputImage);
        if (!options.skipCanonicalAuditInvalidation) {
            invalidateCanonicalCharacterAuditSafe(request.user.profile?.handle ?? null, request.user.directories, `character_write:${outputAvatarName}`);
        }
        startThumbnailPregeneration(request.user.directories, 'avatar', outputAvatarName, false, shouldRegenerateThumbnail);
        return true;
    } catch (err) {
        console.error(err);
        return false;
    }
}

function getCanonicalCharacterFeatureFlags() {
    return getCanonicalStorageSlice('characters').getFeatureFlags();
}

/**
 * Reads a live canonical character row's card_json string, or null when the
 * canonical slice cannot serve it. Used as the projection 'off' fallback for
 * every legacy PNG read.
 * @param {string|null} handle User handle
 * @param {import('../users.js').UserDirectoryList} directories User directories
 * @param {string} avatarFilename Avatar file name (e.g. "name.png")
 * @returns {Promise<string|null>} card_json string or null
 */
async function getCanonicalCharacterCardJsonSafe(handle, directories, avatarFilename) {
    try {
        const featureFlags = getCanonicalCharacterFeatureFlags();
        if (!featureFlags.enabled) {
            return null;
        }
        const resolvedHandle = handle
            ?? directories?.handle
            ?? path.basename(path.resolve(directories?.root ?? 'default-user'));
        // Heal any file-side drift (unimported PNG writes) before reading so
        // the canonical row is current; ensure is memoized per process.
        await ensureCanonicalSliceBackend('characters', directories, resolvedHandle, {
            buildSnapshotRow: buildCharacterSnapshotRowForBackend,
        });
        const storageStatus = getCanonicalStorageStatus({ handle: resolvedHandle, directories, featureFlags });
        if (!storageStatus.supported || storageStatus.disabledReason === 'migration_blocked') {
            return null;
        }
        const db = openCanonicalDatabase({ handle: resolvedHandle, directories, featureFlags });
        if (!db) {
            return null;
        }
        const migrationStatus = runCanonicalMigrations(db, { strict: !!featureFlags.strict });
        if (!migrationStatus.ok) {
            return null;
        }
        const row = db.prepare(`
            SELECT card_json FROM characters
            WHERE avatar_filename = ? AND deleted_at_ms IS NULL
        `).get(avatarFilename);
        return row?.card_json ?? null;
    } catch {
        return null;
    }
}

/**
 * Whether a live canonical character row exists for the avatar filename.
 * @param {string|null} handle User handle
 * @param {import('../users.js').UserDirectoryList} directories User directories
 * @param {string} avatarFilename Avatar file name
 * @returns {boolean} True when a live canonical row exists
 */
async function canonicalCharacterExistsSafe(handle, directories, avatarFilename) {
    return await getCanonicalCharacterCardJsonSafe(handle, directories, avatarFilename) != null;
}

/**
 * Reads canonical avatar blob contents for a character, or null when the blob
 * slice cannot serve it.
 * @param {import('../users.js').UserDirectoryList} directories User directories
 * @param {string} avatarFilename Avatar file name
 * @returns {Promise<{contents: Buffer, mediaType?: string}|null>} Blob read result
 */
async function getCharacterAvatarBlobContentsSafe(directories, avatarFilename) {
    try {
        const handle = directories?.handle ?? path.basename(path.resolve(directories?.root ?? 'default-user'));
        return await getCharacterAvatarBlobContents({ handle, directories, avatarFilename });
    } catch {
        return null;
    }
}

/**
 * Opens the canonical chats database for the request's user, or null when the
 * slice cannot serve the phase (callers then fall back to JSONL files).
 * Mirrors getCanonicalChatReadState: strict mode throws on real blockers.
 * @param {import('express').Request} request Request object
 * @param {'reads'|'writes'} phase Gate phase
 * @returns {Promise<{db: import('better-sqlite3').Database, featureFlags: object, handle: string}|null>}
 */
async function getCanonicalChatsDbSafe(request, phase = 'reads') {
    const chatSlice = getCanonicalStorageSlice('chats');
    const featureFlags = chatSlice.getFeatureFlags();
    if (!featureFlags.enabled) {
        return null;
    }
    const handle = request.user?.profile?.handle ?? 'default-user';
    try {
        await ensureCanonicalSliceBackend('chats', request.user.directories, handle);
    } catch {
        return null;
    }
    const storageStatus = getCanonicalStorageStatus({
        handle,
        directories: request.user.directories,
        featureFlags,
    });
    if (!storageStatus.supported || storageStatus.disabledReason === 'migration_blocked') {
        return null;
    }
    const db = openCanonicalDatabase({ handle, directories: request.user.directories, featureFlags });
    if (!db) {
        return null;
    }
    const migrationStatus = runCanonicalMigrations(db, { strict: !!featureFlags.strict });
    if (!migrationStatus.ok) {
        return null;
    }
    const auditStatus = getPersistedCanonicalAuditStatus(db, { scope: chatSlice.auditScope });
    const rollback = chatSlice.getRollbackBlockers({
        db,
        featureFlags,
        phase,
        persistedAuditStatus: auditStatus,
    });
    if (!rollback.ok) {
        return null;
    }
    return { db, featureFlags, handle };
}

/**
 * Lists canonical chat sessions for one character, or null when the canonical
 * chats slice cannot serve reads (the caller reports the listing failed).
 * @param {import('express').Request} request Request object
 * @param {string} ownerId Character internal name
 * @returns {Promise<object[]|null>} Chat info payloads, or null when inactive
 */
async function listCanonicalCharacterChatsSafe(request, ownerId) {
    const state = await getCanonicalChatsDbSafe(request, 'reads');
    if (!state) {
        return null;
    }
    return listCanonicalCharacterChatPayload({
        db: state.db,
        ownerId,
        metadata: !!request.body?.metadata,
    });
}

/**
 * Commits a canonical chat session for a character import path (BYAF), or null
 * when canonical chats cannot serve writes. The projected JSONL file is
 * materialized only while chats projection is 'sync'.
 * @param {import('express').Request} request Request object
 * @param {string} ownerId Character internal name
 * @param {string} filePath Legacy chat file destination
 * @param {string} jsonlData Full chat JSONL payload
 * @returns {Promise<{ok: boolean, repairKey?: string}|null>} Write result
 */
async function writeCanonicalChatSafe(request, ownerId, filePath, jsonlData) {
    const state = await getCanonicalChatsDbSafe(request, 'writes');
    if (!state) {
        return null;
    }
    const sourcePath = path.relative(request.user.directories.root, filePath).split(path.sep).join('/');
    const result = writeCanonicalChatPayload({
        db: state.db,
        locator: { ownerType: 'character', ownerId, sourcePath },
        payload: parseCanonicalChatJsonl(jsonlData),
        operation: 'import',
        projection: getCanonicalStorageSlice('chats').getProjectionMode(),
        projectJsonl(projectedJsonl) {
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            writeFileAtomicSync(filePath, projectedJsonl, 'utf8');
        },
    });
    return { ok: result.ok, repairKey: result.repairKey };
}

/**
 * Commits a user-images asset through canonical managed media, or null when the
 * slice cannot serve writes (the caller skips the asset).
 * @param {import('express').Request} request Request object
 * @param {string} compatibilityPath Path relative to the user root
 * @param {Buffer} contents File bytes
 * @param {object} [options] Extra write options (displayName, mediaType)
 * @returns {Promise<object|null>} Canonical write result or null
 */
async function writeCanonicalManagedMediaSafe(request, compatibilityPath, contents, options = {}) {
    try {
        const handle = request.user?.profile?.handle ?? 'default-user';
        await ensureCanonicalSliceBackend('managed_media', request.user.directories, handle);
        const result = await writeCanonicalManagedMedia({
            handle,
            directories: request.user.directories,
            compatibilityPath,
            ownerType: 'user_image',
            ownerId: compatibilityPath,
            role: 'user_image',
            displayName: options.displayName ?? path.basename(compatibilityPath),
            contents,
            mediaType: options.mediaType ?? null,
        });
        return result.authorityCommitted ? result : null;
    } catch {
        return null;
    }
}

/**
 * Lists canonical avatar filenames (live rows). Empty when the slice is off.
 * @param {string|null} handle User handle
 * @param {import('../users.js').UserDirectoryList} directories User directories
 * @returns {Set<string>} Canonical avatar filenames
 */
function listCanonicalAvatarFilenamesSafe(handle, directories) {
    try {
        const featureFlags = getCanonicalCharacterFeatureFlags();
        if (!featureFlags.enabled || !featureFlags.reads) {
            return new Set();
        }
        const resolvedHandle = handle
            ?? directories?.handle
            ?? path.basename(path.resolve(directories?.root ?? 'default-user'));
        const storageStatus = getCanonicalStorageStatus({ handle: resolvedHandle, directories, featureFlags });
        if (!storageStatus.supported || storageStatus.disabledReason === 'migration_blocked') {
            return new Set();
        }
        const db = openCanonicalDatabase({ handle: resolvedHandle, directories, featureFlags });
        if (!db) {
            return new Set();
        }
        const migrationStatus = runCanonicalMigrations(db, { strict: !!featureFlags.strict });
        if (!migrationStatus.ok) {
            return new Set();
        }
        return new Set(db.prepare(`
            SELECT avatar_filename FROM characters
            WHERE deleted_at_ms IS NULL
        `).all().map(row => String(row.avatar_filename)));
    } catch {
        return new Set();
    }
}

function getCanonicalCharacterAuditTrackingFeatureFlags() {
    return getCanonicalStorageSlice('characters').getAuditTrackingFeatureFlags();
}

function recordCharacterProjectionLedgerSafe(handle, directories, avatarFilename, contents) {
    try {
        const featureFlags = getCanonicalCharacterAuditTrackingFeatureFlags();
        if (!featureFlags.enabled) {
            return;
        }

        const storageStatus = getCanonicalStorageStatus({ handle, directories, featureFlags });
        if (!storageStatus.supported || storageStatus.disabledReason === 'migration_blocked') {
            return;
        }

        const db = openCanonicalDatabase({ handle, directories, featureFlags });
        if (!db) {
            return;
        }

        recordImportLedgerEntry(db, {
            sliceKey: 'characters',
            sourcePath: `characters/${avatarFilename}`,
            contentHash: crypto.createHash('sha256').update(contents).digest('hex'),
            origin: 'projection',
        });
    } catch (error) {
        console.warn('Canonical character projection ledger skipped:', error);
    }
}

function removeCharacterFileLedgerEntrySafe(handle, directories, targetPath) {
    try {
        const relative = path.relative(directories.characters, targetPath);
        if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || relative.includes(path.sep)) {
            return;
        }

        const featureFlags = getCanonicalCharacterAuditTrackingFeatureFlags();
        if (!featureFlags.enabled) {
            return;
        }

        const storageStatus = getCanonicalStorageStatus({ handle, directories, featureFlags });
        if (!storageStatus.supported || storageStatus.disabledReason === 'migration_blocked') {
            return;
        }

        const db = openCanonicalDatabase({ handle, directories, featureFlags });
        if (!db) {
            return;
        }

        removeImportLedgerEntry(db, {
            sliceKey: 'characters',
            sourcePath: `characters/${relative}`,
        });
    } catch (error) {
        console.warn('Canonical character ledger cleanup skipped:', error);
    }
}

function recordCharacterAvatarBlobSafe(handle, directories, avatarFilename, contents) {
    try {
        const featureFlags = getCanonicalCharacterAuditTrackingFeatureFlags();
        if (!featureFlags.enabled) {
            return;
        }
        Promise.resolve(recordCharacterAvatarBlob({
            handle,
            directories,
            avatarFilename,
            contents,
        })).catch(error => {
            console.warn('Canonical character avatar blob skipped:', error);
        });
    } catch (error) {
        console.warn('Canonical character avatar blob skipped:', error);
    }
}

function invalidateCanonicalCharacterAuditSafe(handle, directories, source) {
    try {
        const featureFlags = getCanonicalCharacterAuditTrackingFeatureFlags();
        if (!featureFlags.enabled) {
            return;
        }

        const storageStatus = getCanonicalStorageStatus({ handle, directories, featureFlags });
        if (!storageStatus.supported || storageStatus.disabledReason === 'migration_blocked') {
            return;
        }

        const db = openCanonicalDatabase({ handle, directories, featureFlags });
        if (!db) {
            return;
        }

        invalidateCanonicalAuditStatus(db, {
            handle,
            reason: 'audit_stale_after_file_write',
            source,
        });
    } catch (error) {
        console.warn(`Canonical audit invalidation skipped after ${source}:`, error);
    }
}

async function getCanonicalWorldBindingScanState(request) {
    try {
        const characterFlags = getCanonicalStorageSlice('characters').getFeatureFlags();
        const worldInfoFlags = getCanonicalStorageSlice('world_info').getFeatureFlags();
        if (!characterFlags.enabled || !characterFlags.reads || !worldInfoFlags.enabled || !worldInfoFlags.reads) {
            return { ok: false };
        }

        const handle = request.user?.profile?.handle ?? null;
        const directories = request.user.directories;
        await ensureCanonicalSliceBackend('characters', directories, handle);
        await ensureCanonicalSliceBackend('world_info', directories, handle);
        const storageStatus = getCanonicalStorageStatus({ handle, directories, featureFlags: characterFlags });
        if (!storageStatus.supported || storageStatus.disabledReason === 'migration_blocked') {
            return { ok: false };
        }

        const db = openCanonicalDatabase({ handle, directories, featureFlags: characterFlags });
        if (!db) {
            return { ok: false };
        }

        return { ok: true, db };
    } catch {
        return { ok: false };
    }
}

function createCanonicalWriteBlockedError(reason) {
    const error = new Error(`Canonical write blocked: ${reason}`);
    error.name = 'CanonicalWriteBlockedError';
    error.reason = reason;
    return error;
}

/**
 * Starts thumbnail pregeneration without blocking the caller.
 * @param {import('../users.js').UserDirectoryList} directories
 * @param {'avatar'} type
 * @param {string} file
 * @param {boolean|null} isKnownAnimated
 * @param {boolean} shouldRegenerateThumbnail
 */
function startThumbnailPregeneration(directories, type, file, isKnownAnimated, shouldRegenerateThumbnail = true) {
    if (!shouldRegenerateThumbnail || !areThumbnailsEnabled()) {
        return;
    }

    void generateThumbnail(directories, type, file, true, isKnownAnimated).catch(error => {
        console.warn(`Thumbnail pregeneration skipped for ${type}/${file}:`, error);
    });
}

/**
 * @typedef {Object} Crop
 * @property {number} x X-coordinate
 * @property {number} y Y-coordinate
 * @property {number} width Width
 * @property {number} height Height
 * @property {boolean} want_resize Resize the image to the standard avatar size
 */

/**
 * Applies avatar crop and resize operations to an image.
 * I couldn't fix the type issue, so the first argument has {any} type.
 * @param {object} jimp Jimp image instance
 * @param {Crop|undefined} [crop] Crop parameters
 * @returns {Promise<Buffer>} Processed image buffer
 */
export async function applyAvatarCropResize(jimp, crop) {
    if (!(jimp instanceof Jimp)) {
        throw new TypeError('Expected a Jimp instance');
    }

    const image = /** @type {InstanceType<typeof Jimp>} */ (jimp);
    let finalWidth = image.bitmap.width, finalHeight = image.bitmap.height;

    // Apply crop if defined
    if (typeof crop == 'object' && [crop.x, crop.y, crop.width, crop.height].every(x => typeof x === 'number')) {
        image.crop({ x: crop.x, y: crop.y, w: crop.width, h: crop.height });
        // Apply standard resize if requested
        if (crop.want_resize) {
            finalWidth = AVATAR_WIDTH;
            finalHeight = AVATAR_HEIGHT;
        } else {
            finalWidth = crop.width;
            finalHeight = crop.height;
        }
    }

    image.cover({ w: finalWidth, h: finalHeight });
    return await image.getBuffer(JimpMime.png);
}

/**
 * Parses an image buffer and applies crop if defined.
 * @param {Buffer} buffer Buffer of the image
 * @param {Crop|undefined} [crop] Crop parameters
 * @returns {Promise<Buffer>} Image buffer
 */
async function parseImageBuffer(buffer, crop) {
    const image = await Jimp.fromBuffer(buffer);
    return await applyAvatarCropResize(image, crop);
}

/**
 * Reads an image file and applies crop if defined.
 * @param {string} imgPath Path to the image file
 * @param {Crop|undefined} crop Crop parameters
 * @returns {Promise<Buffer>} Image buffer
 */
async function tryReadImage(imgPath, crop) {
    try {
        const rawImg = await Jimp.read(imgPath);
        return await applyAvatarCropResize(rawImg, crop);
    } catch (error) {
        // If it's an unsupported type of image (APNG) - just read the file as buffer
        console.error(`Failed to read image: ${imgPath}`, error);
        return fs.readFileSync(imgPath);
    }
}

const processCharacter = async (item, directories, { shallow }) => {
    const character = await processCharacterFileSnapshot({
        avatar: item,
        directories,
        readCharacterData,
        getCharaCardV2,
    });
    return shallow ? toShallow(character) : character;
};

function statCharacterFile(filePath) {
    return statCharacterSnapshotFile(filePath);
}

/**
 * @returns {object}
 */
/**
 * Builds a canonical snapshot row using the production card decoder and
 * normalizer. Shared by the runtime slice initializer and the repair CLI so
 * both produce byte-identical card_json payloads.
 */
export function buildCharacterSnapshotRowForBackend(avatar, directories) {
    return buildCharacterFileSnapshotRow({
        avatar,
        directories,
        readCharacterData,
        getCharaCardV2,
    });
}

/**
 * Re-resolves the linked World Info book into `data.character_book` on
 * canonical payloads. Snapshots persist only the card-native embedded book,
 * so the authoritative world_info slice is consulted at serve time.
 * Best-effort: a blocked or unavailable world_info slice leaves the stored
 * payload untouched.
 *
 * @param {object|object[]} payloads Canonical character payload(s), mutated in place
 * @param {{ db: object, directories: object, handle: string|null }} context
 */
async function hydrateCanonicalCharacterBooks(payloads, { db, directories, handle }) {
    const list = Array.isArray(payloads) ? payloads : [payloads];
    const linked = list.filter(payload => String(payload?.data?.extensions?.world ?? payload?.world ?? '').trim());
    if (!linked.length) {
        return;
    }

    try {
        await ensureCanonicalSliceBackend('world_info', directories, handle);
    } catch (error) {
        console.warn('Canonical World Info init failed; serving stored character_book.', error);
        return;
    }

    for (const payload of linked) {
        const worldName = String(payload?.data?.extensions?.world ?? payload?.world ?? '').trim();
        let book;
        try {
            book = getCanonicalWorldInfoBook(db, worldName);
        } catch (error) {
            console.warn(`Canonical World Info lookup failed for ${worldName}:`, error);
            continue;
        }
        if (!book) {
            continue;
        }
        if (book.originalData) {
            _.set(payload, 'data.character_book', book.originalData);
        }
        if (book.entries) {
            _.set(payload, 'data.character_book', convertWorldInfoToCharacterBook(worldName, book.entries));
        }
    }
}

function createCharacterReadDependencies() {
    return {
        getCanonicalSqliteFeatureFlags: getCanonicalCharacterFeatureFlags,
        getCanonicalStorageStatus,
        openCanonicalDatabase,
        runCanonicalMigrations,
        getCanonicalAuditStatus: ({ db }) => getPersistedCanonicalAuditStatus(db, {
            scope: getCanonicalStorageSlice('characters').auditScope,
        }),
        ensureCanonicalBackend: (directories, handle) => ensureCanonicalSliceBackend('characters', directories, handle, {
            buildSnapshotRow: buildCharacterSnapshotRowForBackend,
        }),
        resolveCanonicalCharacterBooks: hydrateCanonicalCharacterBooks,
        listCanonicalCharacters,
        getCanonicalCharacter,
        processCharacter,
        statCharacterFile,
        toShallow,
        warn: console.warn,
    };
}

function createCharacterWriteDependencies({ bustCache = null } = {}) {
    return {
        defaultAvatarPath: DEFAULT_AVATAR_PATH,
        sanitizeName: sanitize,
        formatCharacterData: charaFormatData,
        getPngName,
        readCharacterData,
        readCanonicalCharacterData: async (avatarName, directories) =>
            await getCanonicalCharacterCardJsonSafe(null, directories, avatarName) ?? undefined,
        characterExists: async (directories, avatarName) =>
            await canonicalCharacterExistsSafe(null, directories, avatarName),
        getCharaCardV2,
        setValue: _.set,
        fileExists: fs.existsSync,
        makeDirectory: fs.mkdirSync,
        unlinkFile: fs.unlinkSync,
        copyDirectory: (from, to) => fs.cpSync(from, to, { recursive: true }),
        removeDirectory: target => fs.promises.rm(target, { recursive: true, force: true }),
        joinPath: path.join,
        parsePath: path.parse,
        writeCharacterData,
        invalidateCanonicalAudit: invalidateCanonicalCharacterAuditSafe,
        removeCompatibilityLedgerEntry: (target, directories, handle) => removeCharacterFileLedgerEntrySafe(handle, directories, target),
        invalidateThumbnail,
        bustCache,
        performCanonicalWrite: async (operation, payload) => {
            const featureFlags = getCanonicalCharacterFeatureFlags();
            if (!featureFlags.enabled) {
                return { enabled: false, authorityCommitted: false, repairKey: null };
            }

            const characterSlice = getCanonicalStorageSlice('characters');
            const sliceFeatureFlags = characterSlice.getFeatureFlags(featureFlags);
            const flagContract = getCanonicalFlagContractStatus(sliceFeatureFlags);
            if (!flagContract.ok) {
                throw createCanonicalWriteBlockedError(flagContract.blockingReason);
            }

            const handle = payload.request?.user?.profile?.handle ?? null;
            const directories = payload.directories;
            await ensureCanonicalSliceBackend('characters', directories, handle, {
                buildSnapshotRow: buildCharacterSnapshotRowForBackend,
            });
            const storageStatus = getCanonicalStorageStatus({ handle, directories, featureFlags: sliceFeatureFlags });
            if (!storageStatus.supported || storageStatus.disabledReason === 'migration_blocked') {
                throw createCanonicalWriteBlockedError(storageStatus.disabledReason ?? 'canonical_runtime_blocked');
            }

            const db = openCanonicalDatabase({ handle, directories, featureFlags: sliceFeatureFlags });
            if (!db) {
                throw createCanonicalWriteBlockedError('canonical_db_unavailable');
            }

            const migrationStatus = runCanonicalMigrations(db, { strict: true });
            if (!migrationStatus.ok) {
                throw createCanonicalWriteBlockedError('canonical_migration_blocked');
            }

            const auditStatus = getPersistedCanonicalAuditStatus(db, { scope: characterSlice.auditScope });
            const rollbackBlockers = characterSlice.getRollbackBlockers({
                db,
                featureFlags: sliceFeatureFlags,
                persistedAuditStatus: auditStatus,
                phase: sliceFeatureFlags.chatStats ? 'chatStats' : 'writes',
            });
            if (!rollbackBlockers.ok) {
                const blockedReason = rollbackBlockers.blockers[0]?.code ?? auditStatus.reason ?? 'canonical_write_blocked';
                throw createCanonicalWriteBlockedError(blockedReason);
            }

            const nowMs = Date.now();
            const repairKey = `${operation}:${payload.avatarName ?? payload.newAvatarName}:${nowMs}`;
            const payloadAvatar = payload.newAvatarName ?? payload.avatarName;

            try {
                if (operation === 'rename') {
                    const fullPayload = JSON.parse(payload.characterData);
                    fullPayload.json_data = payload.characterData;
                    fullPayload.avatar = payloadAvatar;
                    const shallowPayload = toShallow(fullPayload);

                    withCanonicalTransaction(db, txnDb => {
                        const renameResult = renameCanonicalCharacter(txnDb, {
                            oldAvatarFilename: payload.oldAvatarName,
                            newAvatarFilename: payload.newAvatarName,
                            fullPayload,
                            shallowPayload,
                            updatedAtMs: nowMs,
                        });

                        if ((renameResult?.changes ?? 0) === 0) {
                            throw new Error(`Canonical rename target not found: ${payload.oldAvatarName}`);
                        }
                        renameCharacterAvatarBlobReference(txnDb, payload.oldAvatarName, payload.newAvatarName);
                        retargetCanonicalChatSessionsOwner(txnDb, {
                            oldOwnerId: payload.oldInternalName,
                            newOwnerId: payload.newInternalName,
                            nowMs,
                        });
                    });
                } else if (operation === 'delete') {
                    withCanonicalTransaction(db, txnDb => {
                        const deleteResult = markCanonicalCharacterDeleted(txnDb, {
                            avatarFilename: payload.avatarName,
                            deletedAtMs: nowMs,
                        });

                        if ((deleteResult?.changes ?? 0) === 0) {
                            throw new Error(`Canonical delete target not found: ${payload.avatarName}`);
                        }
                        retireCharacterAvatarBlobReference(txnDb, payload.avatarName);
                        if (payload.deleteChats) {
                            deleteCanonicalChatSessionsForOwner(
                                txnDb,
                                String(payload.avatarName ?? '').replace(/\.png$/i, ''),
                            );
                        }
                    });
                } else {
                    const fullPayload = JSON.parse(payload.characterData);
                    fullPayload.json_data = payload.characterData;
                    fullPayload.avatar = payloadAvatar;
                    const shallowPayload = toShallow(fullPayload);

                    withCanonicalTransaction(db, txnDb => {
                        const existing = txnDb.prepare('SELECT id, created_at_ms FROM characters WHERE avatar_filename = ?').get(payloadAvatar);
                        upsertCanonicalCharacter(txnDb, {
                            id: existing?.id ?? randomUUID(),
                            avatarFilename: payloadAvatar,
                            fullPayload,
                            shallowPayload,
                            createdAtMs: existing?.created_at_ms ?? nowMs,
                            updatedAtMs: nowMs,
                        });
                    });
                }
            } catch (error) {
                // No file fallback exists anymore: a failed canonical commit
                // must surface instead of silently writing files.
                throw createCanonicalWriteBlockedError(`canonical_commit_failed:${error?.message ?? error}`);
            }

            return {
                enabled: true,
                authorityCommitted: true,
                repairKey,
                projection: typeof characterSlice.getProjectionMode === 'function'
                    ? characterSlice.getProjectionMode()
                    : 'sync',
            };
        },
        recordProjectionRepair: async repair => {
            const featureFlags = getCanonicalCharacterFeatureFlags();
            if (!featureFlags.enabled) {
                return { ok: false, skipped: true };
            }

            const handle = repair.handle ?? null;
            const directories = repair.directories;
            const db = openCanonicalDatabase({ handle, directories, featureFlags });
            if (!db) {
                return { ok: false, skipped: true };
            }

            persistProjectionRepair(db, {
                repairKey: repair.repairKey,
                repairType: repair.repairType,
                avatarFilename: repair.avatarName,
                reason: repair.reason,
                details: {
                    operation: repair.operation,
                    ...repair.details,
                },
            });

            invalidateCanonicalAuditStatus(db, {
                handle,
                reason: 'projection_repair_pending',
                source: `projection_repair:${repair.operation}`,
            });

            return { ok: true };
        },
    };
}

const importCharacterUpload = createCharacterImportCoordinator({
    importFromYaml,
    importFromJson,
    importFromPng,
    importFromCharX,
    importFromByaf,
});

/**
 * @param {import("express").Request} request
 * @param {import("express").Response} response
 * @returns {Promise<void>}
 */
async function sendCharacterListResponse(request, response) {
    try {
        const payload = await readCharacterSummaryPayload({
            handle: request.user.profile?.handle ?? null,
            directories: request.user.directories,
            dependencies: createCharacterReadDependencies(),
        });

        response.send(payload.result.data);
    } catch (err) {
        console.error(err);
        const isRangeError = err instanceof RangeError;
        response.status(500).send({ overflow: isRangeError, error: true });
    }
}


/**
 * Import a character from a YAML file.
 * @param {string} uploadPath Path to the uploaded file
 * @param {{ request: import('express').Request, response: import('express').Response }} context Express request and response objects
 * @param {string|undefined} preservedFileName Preserved file name
 * @returns {Promise<string>} Internal name of the character
 */
async function importFromYaml(uploadPath, context, preservedFileName) {
    const fileText = fs.readFileSync(uploadPath, 'utf8');
    fs.unlinkSync(uploadPath);
    const yamlData = yaml.parse(fileText);
    console.info('Importing from YAML');
    yamlData.name = sanitize(yamlData.name);
    const fileName = preservedFileName || getPngName(yamlData.name, context.request.user.directories);
    let char = convertToV2({
        'name': yamlData.name,
        'description': yamlData.context ?? '',
        'first_mes': yamlData.greeting ?? '',
        'create_date': new Date().toISOString(),
        'chat': `${yamlData.name} - ${humanizedDateTime()}`,
        'personality': '',
        'creatorcomment': '',
        'avatar': 'none',
        'mes_example': '',
        'scenario': '',
        'talkativeness': 0.5,
        'creator': '',
        'tags': '',
    }, context.request.user.directories);
    return persistImportedCharacter({
        request: context.request,
        fileName,
        characterData: JSON.stringify(char),
        sourceImage: DEFAULT_AVATAR_PATH,
    });
}

/**
 * Imports a character card from CharX (ZIP) file.
 * @param {string} uploadPath
 * @param {object} params
 * @param {import('express').Request} params.request
 * @param {string|undefined} preservedFileName Preserved file name
 * @returns {Promise<string>} Internal name of the character
 */
async function importFromCharX(uploadPath, { request }, preservedFileName) {
    const fileBuffer = fs.readFileSync(uploadPath);
    // Create a properly-sized ArrayBuffer (Node's buffer pool can cause oversized .buffer)
    const data = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength);
    fs.unlinkSync(uploadPath);

    const parser = new CharXParser(data);
    const { card, avatar, auxiliaryAssets, extractedBuffers } = await parser.parse();

    // Apply standard character transformations
    if (card.data?.name) {
        card.data.name = sanitize(card.data.name);
    }
    card.name = sanitize(card.data?.name || card.name);
    let processedCard = readFromV2(card);
    unsetPrivateFields(processedCard);
    processedCard.create_date = new Date().toISOString();

    const fileName = preservedFileName || getPngName(processedCard.name, request.user.directories);
    // Use the actual character name for asset folders, not the unique filename
    // Character-specific backgrounds and miscellaneous CharX assets use this folder.
    const characterFolder = processedCard.name;

    if (auxiliaryAssets.length > 0) {
        try {
            const summary = await persistCharXAssets(auxiliaryAssets, extractedBuffers, request.user.directories, characterFolder, {
                handle: request.user?.profile?.handle ?? request.user?.handle ?? null,
            });
            if (summary.backgrounds || summary.misc) {
                console.log(`CharX: Imported ${summary.backgrounds} background(s), ${summary.misc} misc asset(s) for ${characterFolder}`);
            }
        } catch (error) {
            console.warn(`CharX: Failed to persist auxiliary assets for ${characterFolder}`, error);
        }
    }

    return persistImportedCharacter({
        request,
        fileName,
        characterData: JSON.stringify(processedCard),
        sourceImage: avatar,
    });
}

async function importFromByaf(uploadPath, { request }, preservedFileName) {
    const data = (await fsPromises.readFile(uploadPath)).buffer;
    await fsPromises.unlink(uploadPath);
    console.info('Importing from BYAF');

    const byafData = await new ByafParser(data).parse();
    const card = readFromV2(byafData.card);
    const fileName = preservedFileName || getPngName(sanitize(byafData.character.displayName || card.name, { replacement: sanitizeSafeCharacterReplacements }), request.user.directories);

    // Don't import chats and images if the character is being replaced or updated, instead of newly imported.
    if (!preservedFileName) {
        /**
         * @param {Partial<ByafScenario>} scenario
        */
        const createChatAsCurrentPersona = async (scenario) => {
            const chatName = sanitize(`${scenario.title || card.name} - ${humanizedDateTime()} imported.jsonl`, { replacement: sanitizeSafeCharacterReplacements });
            const filePath = path.join(request.user.directories.chats, path.basename(fileName), chatName);
            const jsonlData = ByafParser.getChatFromScenario(scenario, request.body.user_name, card.name, byafData.chatBackgrounds);
            const canonicalResult = await writeCanonicalChatSafe(request, path.basename(fileName), filePath, jsonlData);
            if (canonicalResult) {
                console.log(`Created ${chatName} chat from BYAF import (canonical)`);
                return chatName;
            }
            // No file-only fallback: an uncommitted session would be invisible.
            console.warn(`Skipped ${chatName} chat from BYAF import: canonical chats unavailable`);
            return null;
        };

        // Upload backgrounds
        for (const bg of byafData.chatBackgrounds) {
            const extension = path.extname(bg.paths?.[0]) || '.png';
            const baseName = `${path.basename(fileName)}_bg`;
            const filePath = path.join(request.user.directories.userImages, fileName);
            if (!fs.existsSync(filePath)) fs.mkdirSync(filePath, { recursive: true });
            const file = getUniqueName(baseName, (name) => fs.existsSync(path.join(filePath, `${name}${extension}`)));
            if (Buffer.isBuffer(bg.data)) {
                const newFile = `${file}${extension}`;
                const newFilePath = path.join(filePath, newFile);
                // user/images/* is a managed-media domain: commit through the
                // canonical service so the asset stays listable under 'off'.
                const canonicalResult = await writeCanonicalManagedMediaSafe(
                    request,
                    `user/images/${fileName}/${newFile}`,
                    bg.data,
                    { displayName: newFile },
                );
                if (canonicalResult) {
                    bg.name = clientRelativePath(request.user.directories.root, newFilePath); // Update background name to the new file
                    console.log(`Created ${newFile} background from BYAF import`);
                } else {
                    console.warn(`Skipped ${newFile} background from BYAF import: canonical managed media unavailable`);
                }
            }
        }

        const chats = [];
        // Create chats for each scenario
        if (Array.isArray(byafData.scenarios)) {
            for (const scenario of byafData.scenarios) {
                const chatName = await createChatAsCurrentPersona(scenario);
                if (chatName) {
                    chats.push(chatName);
                }
            }
        }

        // Update the default chat if there are any so we open to an existing chat instead of creating a new one and opening that.
        if (chats.length > 0) {
            card.chat = path.basename(chats[0], path.extname(chats[0]));
        }

        // Save alternate icons for the character.
        for (const icon of byafData.images.slice(1)) {
            // BYAF does not support character expressions, so using the same structure will not result in conflicts,
            // even if the expression system did not tolerate additional icons that are not mapped to expressions.
            // This will not yet allow changing icons within the UI but at least the icons will be available for manual selection, rather than being lost.
            const altImagesFolder = path.join(request.user.directories.characters, sanitize(card.name));
            if (!fs.existsSync(altImagesFolder)) fs.mkdirSync(altImagesFolder, { recursive: true });
            const extension = path.extname(icon.filename) || '.png';
            const file = getUniqueName(`${sanitize(icon.label, { replacement: sanitizeSafeCharacterReplacements }) || 'alt'}`, (name) => fs.existsSync(path.join(altImagesFolder, `${name}${extension}`)));
            if (Buffer.isBuffer(icon.image)) {
                writeFileAtomicSync(path.join(altImagesFolder, `${file}${extension}`), icon.image);
                console.log(`Created ${file}${extension} alternate icon from BYAF import`);
            }
        }
    }

    return persistImportedCharacter({
        request,
        fileName,
        characterData: JSON.stringify(card),
        sourceImage: byafData.images[0].image,
    });
}

/**
 * Import a character from a JSON file.
 * @param {string} uploadPath Path to the uploaded file
 * @param {{ request: import('express').Request, response: import('express').Response }} context Express request and response objects
 * @param {string|undefined} preservedFileName Preserved file name
 * @returns {Promise<string>} Internal name of the character
 */
async function importFromJson(uploadPath, { request }, preservedFileName) {
    const data = fs.readFileSync(uploadPath, 'utf8');
    fs.unlinkSync(uploadPath);

    let jsonData = JSON.parse(data);

    if (jsonData.spec !== undefined) {
        console.info(`Importing from ${jsonData.spec} json`);
        unsetPrivateFields(jsonData);
        if (jsonData.data?.name) {
            jsonData.data.name = sanitize(jsonData.data.name);
        }
        jsonData.name = sanitize(jsonData.data?.name || jsonData.name);
        jsonData = readFromV2(jsonData);
        jsonData.create_date = new Date().toISOString();
        const pngName = preservedFileName || getPngName(jsonData.name, request.user.directories);
        return persistImportedCharacter({
            request,
            fileName: pngName,
            characterData: JSON.stringify(jsonData),
            sourceImage: DEFAULT_AVATAR_PATH,
        });
    } else if (jsonData.name !== undefined) {
        console.info('Importing from v1 json');
        jsonData.name = sanitize(jsonData.name);
        if (jsonData.creator_notes) {
            jsonData.creator_notes = jsonData.creator_notes.replace('Creator\'s notes go here.', '');
        }
        const pngName = preservedFileName || getPngName(jsonData.name, request.user.directories);
        let char = {
            'name': jsonData.name,
            'description': jsonData.description ?? '',
            'creatorcomment': jsonData.creatorcomment ?? jsonData.creator_notes ?? '',
            'personality': jsonData.personality ?? '',
            'first_mes': jsonData.first_mes ?? '',
            'avatar': 'none',
            'chat': jsonData.name + ' - ' + humanizedDateTime(),
            'mes_example': jsonData.mes_example ?? '',
            'scenario': jsonData.scenario ?? '',
            'create_date': new Date().toISOString(),
            'talkativeness': jsonData.talkativeness ?? 0.5,
            'creator': jsonData.creator ?? '',
            'tags': jsonData.tags ?? '',
        };
        char = convertToV2(char, request.user.directories);
        const charJSON = JSON.stringify(char);
        return persistImportedCharacter({
            request,
            fileName: pngName,
            characterData: charJSON,
            sourceImage: DEFAULT_AVATAR_PATH,
        });
    } else if (jsonData.char_name !== undefined) {
        //json Pygmalion notepad
        console.info('Importing from gradio json');
        jsonData.char_name = sanitize(jsonData.char_name);
        if (jsonData.creator_notes) {
            jsonData.creator_notes = jsonData.creator_notes.replace('Creator\'s notes go here.', '');
        }
        const pngName = preservedFileName || getPngName(jsonData.char_name, request.user.directories);
        let char = {
            'name': jsonData.char_name,
            'description': jsonData.char_persona ?? '',
            'creatorcomment': jsonData.creatorcomment ?? jsonData.creator_notes ?? '',
            'personality': '',
            'first_mes': jsonData.char_greeting ?? '',
            'avatar': 'none',
            'chat': jsonData.name + ' - ' + humanizedDateTime(),
            'mes_example': jsonData.example_dialogue ?? '',
            'scenario': jsonData.world_scenario ?? '',
            'create_date': new Date().toISOString(),
            'talkativeness': jsonData.talkativeness ?? 0.5,
            'creator': jsonData.creator ?? '',
            'tags': jsonData.tags ?? '',
        };
        char = convertToV2(char, request.user.directories);
        const charJSON = JSON.stringify(char);
        return persistImportedCharacter({
            request,
            fileName: pngName,
            characterData: charJSON,
            sourceImage: DEFAULT_AVATAR_PATH,
        });
    }

    return '';
}

/**
 * Import a character from a PNG file.
 * @param {string} uploadPath Path to the uploaded file
 * @param {{ request: import('express').Request, response: import('express').Response }} context Express request and response objects
 * @param {string|undefined} preservedFileName Preserved file name
 * @returns {Promise<string|object>} Internal name of the character or normalized import result
 */
async function importFromPng(uploadPath, { request }, preservedFileName) {
    const imgData = await readCharacterData(uploadPath);
    if (imgData === undefined) throw new Error('Failed to read character data');

    let jsonData = JSON.parse(imgData);

    if (jsonData.data?.name) {
        jsonData.data.name = sanitize(jsonData.data.name);
    }
    jsonData.name = sanitize(jsonData.data?.name || jsonData.name);
    const pngName = preservedFileName || getPngName(jsonData.name, request.user.directories);

    if (jsonData.spec !== undefined) {
        console.info(`Found a ${jsonData.spec} character file.`);
        unsetPrivateFields(jsonData);
        jsonData = readFromV2(jsonData);
        jsonData.create_date = new Date().toISOString();
        return persistImportedCharacter({
            request,
            fileName: pngName,
            characterData: JSON.stringify(jsonData),
            file: {
                destination: path.dirname(uploadPath),
                filename: path.basename(uploadPath),
            },
        });
    } else if (jsonData.name !== undefined) {
        console.info('Found a v1 character file.');

        if (jsonData.creator_notes) {
            jsonData.creator_notes = jsonData.creator_notes.replace('Creator\'s notes go here.', '');
        }

        let char = {
            'name': jsonData.name,
            'description': jsonData.description ?? '',
            'creatorcomment': jsonData.creatorcomment ?? jsonData.creator_notes ?? '',
            'personality': jsonData.personality ?? '',
            'first_mes': jsonData.first_mes ?? '',
            'avatar': 'none',
            'chat': jsonData.name + ' - ' + humanizedDateTime(),
            'mes_example': jsonData.mes_example ?? '',
            'scenario': jsonData.scenario ?? '',
            'create_date': new Date().toISOString(),
            'talkativeness': jsonData.talkativeness ?? 0.5,
            'creator': jsonData.creator ?? '',
            'tags': jsonData.tags ?? '',
        };
        char = convertToV2(char, request.user.directories);
        const charJSON = JSON.stringify(char);
        return persistImportedCharacter({
            request,
            fileName: pngName,
            characterData: charJSON,
            file: {
                destination: path.dirname(uploadPath),
                filename: path.basename(uploadPath),
            },
        });
    }

    return '';
}

export const router = express.Router();

router.post('/create', getFileNameValidationFunction('file_name'), async function (request, response) {
    try {
        if (!request.body) return response.sendStatus(400);

        const result = await createCharacterCard({
            request,
            body: request.body,
            file: request.file ?? null,
            crop: request.file ? tryParse(request.query.crop) : undefined,
            dependencies: createCharacterWriteDependencies(),
        });

        if (!result.ok) {
            return response.status(500).send(result.message);
        }

        return response.send(result.avatarName);
    } catch (err) {
        console.error(err);
        response.sendStatus(500);
    }
});

router.post('/rename', validateAvatarUrlMiddleware, async function (request, response) {
    if (!request.body.avatar_url || !request.body.new_name) {
        return response.sendStatus(400);
    }

    try {
        const result = await renameCharacterCard({
            request,
            body: request.body,
            dependencies: createCharacterWriteDependencies(),
        });

        if (!result.ok) {
            return response.status(500).send(result.message);
        }

        // Return new avatar name to ST
        return response.send({ avatar: result.avatarName });
    } catch (err) {
        console.error(err);
        return response.sendStatus(500);
    }
});

router.post('/edit', validateAvatarUrlMiddleware, async function (request, response) {
    if (!request.body) {
        console.warn('Error: no response body detected');
        response.status(400).send('Error: no response body detected');
        return;
    }

    if (request.body.ch_name === '' || request.body.ch_name === undefined || request.body.ch_name === '.') {
        console.warn('Error: invalid name.');
        response.status(400).send('Error: invalid name.');
        return;
    }

    if (!request.body.avatar_url) {
        console.warn('Error: no avatar_url in request body');
        response.status(400).send('Error: no avatar_url in request body');
        return;
    }

    try {
        const result = await editCharacterCard({
            request,
            response,
            body: request.body,
            file: request.file ?? null,
            crop: request.file ? tryParse(request.query.crop) : undefined,
            dependencies: createCharacterWriteDependencies({
                bustCache: cacheBuster.bust.bind(cacheBuster),
            }),
        });

        if (result.reason === 'missing_avatar') {
            console.warn(result.message, result.avatarPath);
            return response.status(400).send(result.message);
        }

        if (!result.ok) {
            return response.status(500).send(result.message);
        }

        return response.sendStatus(200);
    } catch (err) {
        console.error('An error occurred, character edit invalidated.', err);
        return response.sendStatus(500);
    }
});

router.post('/edit-avatar', validateAvatarUrlMiddleware, async function (request, response) {
    try {
        if (!request.file) {
            return response.status(400).send('Error: no file uploaded');
        }

        if (!request.body || !request.body.avatar_url) {
            return response.status(400).send('Error: no avatar_url in request body');
        }

        const uploadPath = path.join(request.file.destination, request.file.filename);
        if (!fs.existsSync(uploadPath)) {
            return response.status(400).send('Error: uploaded file does not exist');
        }
        const characterExists = await canonicalCharacterExistsSafe(request.user.profile?.handle ?? null, request.user.directories, request.body.avatar_url);
        if (!characterExists) {
            return response.status(400).send('Error: character file does not exist');
        }
        const data = await getCanonicalCharacterCardJsonSafe(request.user.profile?.handle ?? null, request.user.directories, request.body.avatar_url);
        if (!data) {
            return response.status(400).send('Error: failed to read character data');
        }

        const crop = tryParse(request.query.crop);
        const fileName = request.body.avatar_url.replace('.png', '');
        const result = await editCharacterCard({
            request,
            response,
            avatarUrl: request.body.avatar_url,
            targetFile: fileName,
            characterData: data,
            file: request.file,
            crop,
            dependencies: createCharacterWriteDependencies({ bustCache: cacheBuster.bust.bind(cacheBuster) }),
        });

        if (!result.ok) {
            return response.status(500).send(result.message);
        }

        return response.sendStatus(200);
    } catch (err) {
        console.error('An error occurred while editing avatar', err);
        return response.sendStatus(500);
    }
});

/**
 * Handle a POST request to edit a character attribute.
 *
 * This function reads the character data from a file, updates the specified attribute,
 * and writes the updated data back to the file.
 *
 * @param {Object} request - The HTTP request object.
 * @param {Object} response - The HTTP response object.
 * @returns {void}
 */
router.post('/edit-attribute', validateAvatarUrlMiddleware, async function (request, response) {
    console.debug(request.body);
    if (!request.body) {
        console.warn('Error: no response body detected');
        return response.status(400).send('Error: no response body detected');
    }

    if (request.body.ch_name === '' || request.body.ch_name === undefined || request.body.ch_name === '.') {
        console.warn('Error: invalid name.');
        return response.status(400).send('Error: invalid name.');
    }

    if (request.body.field === 'json_data') {
        console.warn('Error: cannot edit json_data field.');
        return response.status(400).send('Error: cannot edit json_data field.');
    }

    try {
        const charJSON = await getCanonicalCharacterCardJsonSafe(request.user.profile?.handle ?? null, request.user.directories, request.body.avatar_url);
        if (typeof charJSON !== 'string') throw new Error('Failed to read character file');

        const char = JSON.parse(charJSON);
        //check if the field exists
        if (char[request.body.field] === undefined && char.data[request.body.field] === undefined) {
            console.warn('Error: invalid field.');
            response.status(400).send('Error: invalid field.');
            return;
        }
        char[request.body.field] = request.body.value;
        char.data[request.body.field] = request.body.value;
        const newCharJSON = JSON.stringify(char);
        const targetFile = (request.body.avatar_url).replace('.png', '');
        const result = await editCharacterCard({
            request,
            avatarUrl: request.body.avatar_url,
            targetFile,
            characterData: newCharJSON,
            dependencies: createCharacterWriteDependencies(),
        });

        if (!result.ok) {
            return response.status(500).send(result.message);
        }

        return response.sendStatus(200);
    } catch (err) {
        console.error('An error occurred, character edit invalidated.', err);
        return response.sendStatus(500);
    }
});

/** Maximum number of characters processed in parallel during bulk merge */
const BULK_MERGE_CONCURRENCY = 10;

/**
 * Reads a character card, applies a merge update (with sentinel-based
 * unsetting), validates the result, and writes it back.
 * @param {string} avatarPath Full path to the character PNG
 * @param {string} avatar     Avatar filename (e.g. "char.png")
 * @param {object} updateData The merge payload to apply
 * @param {import("express").Request} request Express request object
 * @param {((data: any) => boolean) | null} [shouldSkip] Optional function to determine if a character should be skipped based on its original data (used for bulk merge filtering)
 * @returns {Promise<{ok: boolean, error?: string, skipped?: boolean}>} Result of the merge operation, including any validation error
 */
async function mergeCharacterUpdate(avatarPath, avatar, updateData, request, shouldSkip = null) {
    const pngStringData = await getCanonicalCharacterCardJsonSafe(request.user.profile?.handle ?? null, request.user.directories, avatar);
    if (!pngStringData) {
        return { ok: false, error: 'Invalid character file' };
    }

    let character = JSON.parse(pngStringData);

    if (typeof shouldSkip === 'function' && shouldSkip(character)) {
        return { ok: false, skipped: true };
    }

    const update = _.cloneDeep(updateData);
    _.unset(update, 'json_data');
    _.unset(character, 'json_data');

    character = deepMerge(character, update);
    processUnsetSentinels(character, update);

    const validator = new TavernCardValidator(character);
    //Accept either V1 or V2.
    if (!validator.validate()) {
        return { ok: false, error: validator.lastValidationError ?? 'Validation failed' };
    }

    const targetImg = avatar.replace('.png', '');
    const result = await editCharacterCard({
        request,
        avatarUrl: avatar,
        targetFile: targetImg,
        characterData: JSON.stringify(character),
        dependencies: createCharacterWriteDependencies(),
    });

    if (!result.ok) {
        return { ok: false, error: result.message ?? 'Failed to write character data' };
    }

    return { ok: true };
}

/**
 * Handle a POST request to edit character properties.
 *
 * Operates in two modes depending on the request body:
 *
 * **Single mode** (default behavior) — when `avatar` (string) is present:
 *   Merges the request body with the selected character and validates the
 *   result against TavernCard V2 specification.
 *
 * **Bulk mode** — when `avatars` (array) is present:
 *   Applies the same merge to multiple characters in parallel. Supports:
 *   - An explicit list of avatars, or all characters when the array is empty
 *   - An optional server-side `filter` so only characters where a given
 *     JSON path exists and is non-null are updated
 *
 * In both modes, any value equal to the sentinel `__@@UNSET@@__` will cause
 * that key to be **deleted** from the character card instead of being set.
 *
 * @param {import("express").Request} request - The HTTP request object
 * @param {import("express").Response} response - The HTTP response object
 * @returns {void}
 */
router.post('/merge-attributes', getFileNameValidationFunction('avatar'), async function (request, response) {
    try {
        // ── Bulk mode: avatars array is present ──────────────────
        if (Array.isArray(request.body.avatars)) {
            const { avatars, data, filter } = request.body;

            if (!_.isPlainObject(data)) {
                return response.status(400).send({ message: 'No valid update data provided.' });
            }

            // Determine which avatar files to process
            let targetAvatars;
            if (avatars.length > 0) {
                for (const avatar of avatars) {
                    if (typeof avatar !== 'string' || forbiddenRegExp.test(avatar) || path.extname(avatar).toLowerCase() !== '.png') {
                        return response.status(400).send({ message: `Invalid avatar filename: ${avatar}` });
                    }
                }
                targetAvatars = avatars;
            } else {
                // Empty array → all characters: directory scan ∪ canonical rows
                // (projection 'off' may leave live characters fileless).
                const files = fs.readdirSync(request.user.directories.characters);
                const fileAvatars = files.filter(file => path.extname(file).toLowerCase() === '.png');
                targetAvatars = [...new Set([
                    ...fileAvatars,
                    ...listCanonicalAvatarFilenamesSafe(request.user.profile?.handle ?? null, request.user.directories),
                ])];
            }

            const updated = [];
            const skipped = [];
            const failed = [];

            /**
             * Process a single character in bulk: read, filter, merge, validate, write.
             * @param {string} avatar Avatar filename
             */
            const processOne = async (avatar) => {
                const avatarPath = path.join(request.user.directories.characters, avatar);

                try {
                    /** @type {(character: object) => boolean} */
                    let shouldSkip = () => false;

                    // Apply optional server-side filter before updating the card
                    if (filter && typeof filter.path === 'string') {
                        shouldSkip = (character) => {
                            const value = _.get(character, filter.path);
                            return value === undefined;
                        };
                    }

                    const result = await mergeCharacterUpdate(avatarPath, avatar, data, request, shouldSkip);
                    if (result.ok) {
                        updated.push(avatar);
                    } else if (result.skipped) {
                        skipped.push(avatar);
                    } else {
                        console.warn(`Bulk merge failed for ${avatar}:`, result.error);
                        failed.push(avatar);
                    }
                } catch (error) {
                    console.error(`Bulk merge failed for ${avatar}:`, error);
                    failed.push(avatar);
                }
            };

            // Process in parallel with a concurrency limit
            for (let i = 0; i < targetAvatars.length; i += BULK_MERGE_CONCURRENCY) {
                const batch = targetAvatars.slice(i, i + BULK_MERGE_CONCURRENCY);
                await Promise.allSettled(batch.map(processOne));
            }

            return response.send({ updated, skipped, failed });
        }

        // ── Single mode (default behavior) ───────────────────────
        const update = request.body;
        const avatarPath = path.join(request.user.directories.characters, update.avatar);

        const result = await mergeCharacterUpdate(avatarPath, update.avatar, update, request);
        if (result.ok) {
            response.sendStatus(200);
        } else {
            console.warn(result.error);
            response.status(400).send({ message: `Validation failed for ${update.avatar}`, error: result.error });
        }
    } catch (exception) {
        response.status(500).send({ message: 'Unexpected error while saving character.', error: exception.toString() });
    }
});

router.post('/delete-preflight', async function (request, response) {
    try {
        const avatars = request.body?.avatars;
        if (!Array.isArray(avatars) || avatars.length === 0) {
            return response.send({ worldInfos: [] });
        }

        if (avatars.length > DELETE_PREFLIGHT_AVATAR_LIMIT) {
            return response.status(400).send({ error: 'Too many avatars requested.' });
        }

        const canonicalBindings = await getCanonicalWorldBindingScanState(request);
        if (!canonicalBindings.ok) {
            return response.status(503).send({ error: 'canonical_storage_unavailable' });
        }
        const worldNameToAvatars = new Map();
        const { worldNameToCharacters, avatarToWorldName } = scanCanonicalCharacterWorldBindings(canonicalBindings.db);

        for (const avatar of avatars) {
            const safeName = sanitize(avatar);
            if (!safeName || safeName !== avatar) continue;

            const worldName = avatarToWorldName.get(avatar);
            if (!worldName) continue;

            if (!worldNameToAvatars.has(worldName)) {
                worldNameToAvatars.set(worldName, []);
            }
            worldNameToAvatars.get(worldName).push(avatar);
        }

        if (worldNameToAvatars.size === 0) {
            return response.send({ worldInfos: [] });
        }

        const worldInfos = [];

        for (const [worldName, deleteCandidateAvatars] of worldNameToAvatars) {
            const book = getCanonicalWorldInfoBook(canonicalBindings.db, normalizeCanonicalWorldInfoName(worldName));
            if (!book) continue;
            const entryCount = book?.entries ? Object.keys(book.entries).length : 0;
            const boundCharacters = worldNameToCharacters.get(worldName) ?? [];

            worldInfos.push({
                name: worldName,
                entryCount,
                boundCharacters,
                deleteCandidateAvatars,
            });
        }

        return response.send({ worldInfos });
    } catch (error) {
        console.error('Delete preflight error:', error);
        return response.status(500).send({ error: 'Failed to gather world info metadata.' });
    }
});

router.post('/delete', validateAvatarUrlMiddleware, async function (request, response) {
    if (!request.body || !request.body.avatar_url) {
        return response.sendStatus(400);
    }

    if (request.body.avatar_url !== sanitize(request.body.avatar_url)) {
        console.error('Malicious filename prevented');
        return response.sendStatus(403);
    }

    const dir_name = (request.body.avatar_url.replace('.png', ''));
    if (!dir_name.length) {
        console.error('Malicious dirname prevented');
        return response.sendStatus(403);
    }

    try {
        const result = await deleteCharacterCard({
            request,
            avatarName: request.body.avatar_url,
            deleteChats: request.body.delete_chats == true,
            dependencies: createCharacterWriteDependencies(),
        });

        if (result.reason === 'missing_avatar') {
            return response.sendStatus(400);
        }

        if (!result.ok) {
            return response.status(500).send(result.message);
        }
    } catch (error) {
        console.error(error);
        return response.sendStatus(500);
    }

    return response.sendStatus(200);
});

/**
 * HTTP POST endpoint for the "/api/characters/all" route.
 *
 * This endpoint is responsible for reading character files from the `charactersPath` directory,
 * parsing character data, calculating stats for each character and responding with the data.
 * Stats are calculated only on the first run, on subsequent runs the stats are fetched from
 * the `charStats` variable.
 * The stats are calculated by the `calculateStats` function.
 * The characters are processed by the `processCharacter` function.
 *
 * @param  {import("express").Request} request The HTTP request object.
 * @param  {import("express").Response} response The HTTP response object.
 * @return {void}
 */
router.post('/all', async function (request, response) {
    const startedAt = performance.now();
    try {
        const payload = await readCharacterListPayload({
            handle: request.user.profile?.handle ?? null,
            directories: request.user.directories,
            shallow: useShallowCharacters,
            dependencies: createCharacterReadDependencies(),
        });

        applyInteractionPerfHeaders(response, payload.interactionPath, startedAt, request.user.directories);
        return response.send(payload.result.data);
    } catch (err) {
        console.error(err);
        const isRangeError = err instanceof RangeError;
        applyInteractionPerfHeaders(response, 'characters_all:error', startedAt, request.user?.directories);
        response.status(500).send({ overflow: isRangeError, error: true });
    }
});

router.post('/list', async function (request, response) {
    await sendCharacterListResponse(request, response);
});

router.post('/get', validateAvatarUrlMiddleware, async function (request, response) {
    const startedAt = performance.now();
    try {
        if (!request.body) return response.sendStatus(400);
        const item = request.body.avatar_url;

        const payload = await readCharacterFullPayload({
            handle: request.user.profile?.handle ?? null,
            directories: request.user.directories,
            avatarUrl: item,
            dependencies: createCharacterReadDependencies(),
        });

        if (payload.status === 'not_found') {
            return response.sendStatus(404);
        }

        applyInteractionPerfHeaders(response, payload.interactionPath, startedAt, request.user.directories);
        return response.send(payload.result.data);
    } catch (err) {
        console.error(err);
        applyInteractionPerfHeaders(response, 'characters_get:error', startedAt, request.user?.directories);
        response.sendStatus(500);
    }
});

router.post('/chats', validateAvatarUrlMiddleware, async function (request, response) {
    try {
        if (!request.body) return response.sendStatus(400);

        const characterDirectory = (request.body.avatar_url).replace('.png', '');

        // Canonical chat sessions are the listing authority; JSONL files are
        // export surfaces and never read back at runtime.
        const canonicalChats = await listCanonicalCharacterChatsSafe(request, characterDirectory);
        if (canonicalChats === null) {
            return response.send({ error: true });
        }
        if (request.body.simple) {
            return response.send(canonicalChats.map(chat => ({ file_name: chat.file_name, file_id: chat.file_id })));
        }
        return response.send(canonicalChats);
    } catch (error) {
        console.error(error);
        return response.send({ error: true });
    }
});

/**
 * Gets the name for the uploaded PNG file.
 * @param {string} file File name
 * @param {import('../users.js').UserDirectoryList} directories User directories
 * @returns {string} - The name for the uploaded PNG file
 */
function getPngName(file, directories) {
    file = sanitize(file);
    // Name uniqueness spans projected PNGs *and* canonical rows — under
    // projection 'off' the directory may not list every live character.
    const canonicalNames = listCanonicalAvatarFilenamesSafe(null, directories);
    return getUniqueName(file, (name) => fs.existsSync(path.join(directories.characters, `${name}.png`))
        || canonicalNames.has(`${name}.png`),
    { nameBuilder: (base, i) => i === 0 ? base : `${base}${i}`, startIndex: 0, maxTries: 10000 }) ?? file;
}

/**
 * Gets the preserved name for the uploaded file if the request is valid.
 * @param {import("express").Request} request - Express request object
 * @returns {string | undefined} - The preserved name if the request is valid, otherwise undefined
 */
function getPreservedName(request) {
    return typeof request.body.preserved_name === 'string' && request.body.preserved_name.length > 0
        ? path.parse(request.body.preserved_name).name
        : undefined;
}

/**
 * @param {object} options
 * @param {import('express').Request} options.request
 * @param {string} options.fileName
 * @param {string} options.characterData
 * @param {string|Buffer} [options.sourceImage]
 * @param {{ destination: string, filename: string }} [options.file]
 * @returns {Promise<{ ok: boolean, fileName?: string, avatarName?: string, reason?: string, message?: string, refreshHandled?: boolean }>}
 */
async function persistImportedCharacter({ request, fileName, characterData, sourceImage = undefined, file = undefined }) {
    const normalizedSourceImage = Buffer.isBuffer(sourceImage)
        ? sourceImage
        : ArrayBuffer.isView(sourceImage)
            ? Buffer.from(sourceImage.buffer, sourceImage.byteOffset, sourceImage.byteLength)
            : sourceImage instanceof ArrayBuffer
                ? Buffer.from(sourceImage)
                : sourceImage;

    const result = await createCharacterCard({
        request,
        internalName: fileName,
        characterData,
        file,
        sourceImage: normalizedSourceImage,
        dependencies: createCharacterWriteDependencies(),
    });

    if (!result.ok) {
        return {
            ok: false,
            reason: result.reason ?? 'import_failed',
            message: result.message,
        };
    }

    return {
        ok: true,
        fileName,
        avatarName: result.avatarName,
        refreshHandled: true,
    };
}

router.post('/import', async function (request, response) {
    if (!request.body || !request.file) return response.sendStatus(400);

    const uploadPath = path.join(request.file.destination, request.file.filename);
    const format = request.body.file_type;
    const preservedFileName = getPreservedName(request);
    const removeUploadedFile = () => {
        if (fs.existsSync(uploadPath)) {
            fs.unlinkSync(uploadPath);
        }
    };

    try {
        const result = await importCharacterUpload({
            uploadPath,
            format,
            preservedFileName,
            request,
            response,
        });

        if (!result.ok) {
            console.warn('Failed to import character');
            removeUploadedFile();
            return response.sendStatus(400);
        }

        response.send({ file_name: result.fileName });
    } catch (err) {
        console.error(err);
        try {
            removeUploadedFile();
        } catch (cleanupError) {
            console.warn('Failed to remove uploaded character import file:', cleanupError);
        }
        response.status(400).send({ error: true });
    }
});

router.post('/duplicate', validateAvatarUrlMiddleware, async function (request, response) {
    try {
        if (!request.body.avatar_url) {
            console.warn('avatar URL not found in request body');
            console.debug(request.body);
            return response.sendStatus(400);
        }
        const filename = path.join(request.user.directories.characters, sanitize(request.body.avatar_url));
        const canonicalExists = await canonicalCharacterExistsSafe(request.user.profile?.handle ?? null, request.user.directories, request.body.avatar_url);
        if (!canonicalExists) {
            console.error('character for dupe not found', filename);
            return response.sendStatus(404);
        }
        let suffix = 1;
        let newFilename = filename;

        // If filename ends with a _number, increment the number
        const nameParts = path.basename(filename, path.extname(filename)).split('_');
        const lastPart = nameParts[nameParts.length - 1];

        let baseName;

        if (!isNaN(Number(lastPart)) && nameParts.length > 1) {
            suffix = parseInt(lastPart) + 1;
            baseName = nameParts.slice(0, -1).join('_'); // construct baseName without suffix
        } else {
            baseName = nameParts.join('_'); // original filename is completely the baseName
        }

        // Uniqueness spans projected PNGs and canonical rows.
        const canonicalNames = listCanonicalAvatarFilenamesSafe(request.user.profile?.handle ?? null, request.user.directories);
        newFilename = path.join(request.user.directories.characters, `${baseName}_${suffix}${path.extname(filename)}`);

        while (fs.existsSync(newFilename) || canonicalNames.has(path.basename(newFilename))) {
            let suffixStr = '_' + suffix;
            newFilename = path.join(request.user.directories.characters, `${baseName}${suffixStr}${path.extname(filename)}`);
            suffix++;
        }

        const rawCharacterData = await getCanonicalCharacterCardJsonSafe(request.user.profile?.handle ?? null, request.user.directories, request.body.avatar_url);
        if (rawCharacterData == null) {
            throw new Error(`Failed to read character file for duplicate: ${filename}`);
        }

        // The canonical avatar blob is the image source (the projected PNG is
        // an export surface and may be absent or stale).
        const sourceImage = (await getCharacterAvatarBlobContentsSafe(request.user.directories, request.body.avatar_url))?.contents ?? null;

        const duplicateInternalName = path.parse(newFilename).name;
        const result = await createCharacterCard({
            request,
            internalName: duplicateInternalName,
            characterData: rawCharacterData,
            sourceImage: sourceImage ?? undefined,
            ensureChatsDirectory: false,
            dependencies: createCharacterWriteDependencies(),
        });

        if (!result.ok) {
            return response.status(500).send(result.message);
        }

        console.info(`${filename} was copied to ${newFilename}`);
        response.send({ path: result.avatarName });
    } catch (error) {
        console.error(error);
        return response.send({ error: true });
    }
});

router.post('/export', validateAvatarUrlMiddleware, async function (request, response) {
    try {
        if (!request.body.format || !request.body.avatar_url) {
            return response.sendStatus(400);
        }

        const filename = path.join(request.user.directories.characters, sanitize(request.body.avatar_url));
        const handle = request.user.profile?.handle ?? null;

        // Canonical card_json + avatar blob are the authority; a projected
        // PNG file is only an export artifact and is never read back.
        const canonicalJson = await getCanonicalCharacterCardJsonSafe(handle, request.user.directories, request.body.avatar_url);
        if (canonicalJson === null) {
            return response.sendStatus(404);
        }

        switch (request.body.format) {
            case 'png': {
                const blob = await getCharacterAvatarBlobContentsSafe(request.user.directories, request.body.avatar_url);
                if (!blob?.contents) {
                    return response.sendStatus(404);
                }
                const mutatedData = mutateJsonString(String(canonicalJson), unsetPrivateFields);
                const mutatedBuffer = write(blob.contents, mutatedData);
                const contentType = mime.lookup(filename) || 'image/png';
                response.setHeader('Content-Type', contentType);
                response.setHeader('Content-Disposition', `attachment; filename="${encodeURI(path.basename(filename))}"`);
                return response.send(mutatedBuffer);
            }
            case 'json': {
                try {
                    const json = canonicalJson;
                    const jsonObject = getCharaCardV2(JSON.parse(json), request.user.directories);
                    unsetPrivateFields(jsonObject);
                    return response.type('json').send(JSON.stringify(jsonObject, null, 4));
                } catch {
                    return response.sendStatus(400);
                }
            }
        }

        return response.sendStatus(400);
    } catch (err) {
        console.error('Character export failed', err);
        response.sendStatus(500);
    }
});
