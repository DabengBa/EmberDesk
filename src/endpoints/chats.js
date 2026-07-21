import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import process from 'node:process';

import express from 'express';
import sanitize from 'sanitize-filename';
import { sync as writeFileAtomicSync } from 'write-file-atomic';
import _ from 'lodash';

import validateAvatarUrlMiddleware from '../middleware/validateFileName.js';
import { sendGroupChatRetired } from './group-chat-retirement.js';
import {
    getConfigValue,
    humanizedDateTime,
    tryParse,
    generateTimestamp,
    removeOldBackups,
    formatBytes,
    tryWriteFileSync,
    tryReadFileSync,
    tryDeleteFile,
    readFirstLine,
    isPathUnderParent,
} from '../util.js';
import { calculateCharacterChatStats, getCharacterChatDirectory } from './character-file-snapshot.js';
import {
    CHAT_IMPORT_ERROR_KINDS,
    CHAT_IMPORT_UPLOAD_CLEANUP,
    createCharacterChatImportPlan,
} from './chat-import-service.js';
import { createChatBackupPlan } from './chat-backup-helpers.js';
import {
    readRecentChatPayload,
    searchChatPayload,
} from './chat-route-service.js';
import { getCanonicalStorageSlice } from '../canonical-storage-slice-registry.js';
import { getCanonicalStorageStatus, openCanonicalDatabase, withCanonicalTransaction } from '../canonical-sqlite.js';
import { runCanonicalMigrations } from '../canonical-sqlite-migrations.js';
import {
    getPersistedCanonicalAuditStatus,
    invalidateCanonicalAuditStatus,
} from '../canonical-sqlite-shadow-import.js';
import {
    readCanonicalChatPayload,
    serializeCanonicalChatPayload,
} from './canonical-chat-read-service.js';
import {
    readCanonicalRecentChatPayload,
    searchCanonicalChatPayload,
} from './canonical-chat-query-service.js';
import {
    deleteCanonicalChat,
    parseCanonicalChatJsonl,
    renameCanonicalChat,
    writeCanonicalChatPayload,
} from './canonical-chat-write-service.js';

const isBackupEnabled = !!getConfigValue('backups.chat.enabled', true, 'boolean');
const maxTotalChatBackups = Number(getConfigValue('backups.chat.maxTotalBackups', -1, 'number'));
const throttleInterval = Number(getConfigValue('backups.chat.throttleInterval', 10_000, 'number'));
const checkIntegrity = !!getConfigValue('backups.chat.checkIntegrity', true, 'boolean');

export const CHAT_BACKUPS_PREFIX = 'chat_';

function getRequestHandle(request) {
    return request.user?.profile?.handle ?? request.user?.handle ?? 'default-user';
}

function getCanonicalChatReadState(request) {
    const chatSlice = getCanonicalStorageSlice('chats');
    const featureFlags = chatSlice.getFeatureFlags();
    if (!featureFlags.enabled) {
        return { ok: false, reason: 'canonical_storage_disabled', featureFlags };
    }
    if (!featureFlags.reads) {
        return { ok: false, reason: 'canonical_reads_disabled', featureFlags };
    }

    const handle = getRequestHandle(request);
    const storageStatus = getCanonicalStorageStatus({
        handle,
        directories: request.user.directories,
        featureFlags,
    });
    if (!storageStatus.supported || storageStatus.disabledReason === 'migration_blocked') {
        return {
            ok: false,
            reason: storageStatus.disabledReason ?? 'canonical_storage_unavailable',
            featureFlags,
        };
    }

    const db = openCanonicalDatabase({
        handle,
        directories: request.user.directories,
        featureFlags,
    });
    if (!db) {
        return { ok: false, reason: 'canonical_storage_unavailable', featureFlags };
    }

    const migrationStatus = runCanonicalMigrations(db, { strict: !!featureFlags.strict });
    if (!migrationStatus.ok) {
        if (featureFlags.strict) {
            throw new Error(migrationStatus.blockedReason);
        }
        return { ok: false, reason: 'migration_blocked', featureFlags, migrationStatus };
    }

    const auditStatus = getPersistedCanonicalAuditStatus(db, { scope: chatSlice.auditScope });
    const rollback = chatSlice.getRollbackBlockers({
        db,
        featureFlags,
        phase: 'reads',
        persistedAuditStatus: auditStatus,
    });
    if (!rollback.ok) {
        const reason = rollback.blockers[0]?.code ?? auditStatus.reason ?? 'chat_audit_blocked';
        if (featureFlags.strict) {
            throw new Error(`Canonical chat reads blocked: ${reason}`);
        }
        return { ok: false, reason, featureFlags, auditStatus, rollback };
    }

    return { ok: true, db, featureFlags, auditStatus };
}

function getCanonicalChatWriteState(request) {
    const chatSlice = getCanonicalStorageSlice('chats');
    const featureFlags = chatSlice.getFeatureFlags();
    if (!featureFlags.enabled || !featureFlags.writes) {
        return {
            ok: false,
            fallback: true,
            reason: !featureFlags.enabled ? 'canonical_storage_disabled' : 'canonical_writes_disabled',
            featureFlags,
        };
    }
    if (!featureFlags.reads) {
        return {
            ok: false,
            blocked: true,
            reason: 'canonical_reads_disabled',
            featureFlags,
        };
    }

    const readState = getCanonicalChatReadState(request);
    if (!readState.ok) {
        return { ...readState, blocked: true };
    }

    const rollback = chatSlice.getRollbackBlockers({
        db: readState.db,
        featureFlags: readState.featureFlags,
        phase: 'writes',
        persistedAuditStatus: readState.auditStatus,
    });
    if (!rollback.ok) {
        const reason = rollback.blockers[0]?.code ?? 'canonical_chat_write_blocked';
        if (readState.featureFlags.strict) {
            throw new Error(`Canonical chat writes blocked: ${reason}`);
        }
        return { ...readState, ok: false, blocked: true, reason, rollback };
    }

    return readState;
}

function sendCanonicalChatWriteBlocked(response, writeState) {
    return response.status(503).send({
        error: 'canonical_chat_write_blocked',
        reason: writeState.reason ?? 'canonical_chat_write_blocked',
    });
}

function sendCanonicalChatWriteRejected(response, result) {
    return response.status(400).send({
        error: 'canonical_chat_write_rejected',
        reason: result.reason ?? 'canonical_chat_write_rejected',
        ...(result.path ? { path: result.path } : {}),
    });
}

function getCanonicalChatLocator(directories, { ownerType, ownerId, filePath }) {
    return {
        ownerType,
        ownerId,
        sourcePath: path.relative(directories.root, filePath).split(path.sep).join('/'),
    };
}

function readCanonicalChatRoutePayload(request, locator) {
    const readState = getCanonicalChatReadState(request);
    if (!readState.ok) {
        return { active: false, payload: null };
    }

    return {
        active: true,
        payload: readCanonicalChatPayload(readState.db, locator),
        db: readState.db,
    };
}

function serializeCanonicalChatRoutePayload(request, locator) {
    const readState = getCanonicalChatReadState(request);
    if (!readState.ok) {
        return { active: false, jsonl: null };
    }

    return {
        active: true,
        jsonl: serializeCanonicalChatPayload(readState.db, locator),
        db: readState.db,
    };
}

/**
 * @param {string | null} handle
 * @param {import('../users.js').UserDirectoryList} directories
 * @param {string | undefined} avatar
 * @param {string} operation
 * @returns {void}
 */
function syncCanonicalChatStatsAfterCharacterChatMutation(handle, directories, avatar, operation) {
    if (!avatar) {
        return;
    }

    const characterSlice = getCanonicalStorageSlice('characters');
    const featureFlags = characterSlice.getFeatureFlags();
    if (featureFlags.enabled && featureFlags.chatStats) {
        try {
            updateCanonicalCharacterChatStats(handle, directories, avatar, operation, featureFlags);
            return;
        } catch (error) {
            invalidateCanonicalChatStatsAuditSafe(handle, directories, avatar, operation, featureFlags, 'audit_stale_after_chat_stats_sync_failure');
            console.warn(`Canonical chat stats sync skipped after ${operation} for ${avatar}; keeping file-backed mutation result:`, error);
            return;
        }
    }

    invalidateCanonicalChatStatsAuditSafe(
        handle,
        directories,
        avatar,
        operation,
        characterSlice.getAuditTrackingFeatureFlags(),
    );
}

function invalidateCanonicalChatStatsAuditSafe(handle, directories, avatar, operation, featureFlags, reason = 'audit_stale_after_chat_stats_change') {
    try {
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
            reason,
            source: `${operation}:${avatar}`,
        });
    } catch (error) {
        console.warn(`Canonical audit invalidation skipped after ${operation} for ${avatar}:`, error);
    }
}

function createCanonicalChatStatsError(reason, operation, avatar) {
    const error = new Error(`Canonical chat stats update failed after ${operation} for ${avatar}: ${reason}`);
    error.name = 'CanonicalChatStatsUpdateError';
    error.reason = reason;
    return error;
}

function updateCanonicalCharacterChatStats(handle, directories, avatar, operation, featureFlags) {
    const storageStatus = getCanonicalStorageStatus({ handle, directories, featureFlags });
    if (!storageStatus.supported || storageStatus.disabledReason === 'migration_blocked') {
        throw createCanonicalChatStatsError(storageStatus.disabledReason ?? 'canonical_runtime_unsupported', operation, avatar);
    }

    const db = openCanonicalDatabase({ handle, directories, featureFlags });
    if (!db) {
        throw createCanonicalChatStatsError('canonical_db_unavailable', operation, avatar);
    }

    const migrationStatus = runCanonicalMigrations(db, { strict: !!featureFlags.strict });
    if (!migrationStatus.ok) {
        throw createCanonicalChatStatsError('canonical_migration_blocked', operation, avatar);
    }

    const stats = calculateCharacterChatStats(getCharacterChatDirectory(directories, avatar));
    const nowMs = Date.now();
    const result = withCanonicalTransaction(db, txnDb => txnDb.prepare(`
        INSERT INTO character_chat_stats (
            character_id,
            chat_count,
            chat_size_bytes,
            date_last_chat_ms,
            stats_updated_at_ms
        )
        SELECT
            characters.id,
            ?,
            ?,
            ?,
            ?
        FROM characters
        WHERE characters.avatar_filename = ?
            AND characters.deleted_at_ms IS NULL
        ON CONFLICT(character_id) DO UPDATE SET
            chat_count = excluded.chat_count,
            chat_size_bytes = excluded.chat_size_bytes,
            date_last_chat_ms = excluded.date_last_chat_ms,
            stats_updated_at_ms = excluded.stats_updated_at_ms
    `).run(
        stats.chatCount,
        stats.chatSize,
        stats.dateLastChat,
        nowMs,
        avatar,
    ));

    if (result.changes < 1) {
        throw createCanonicalChatStatsError('canonical_character_missing', operation, avatar);
    }
}

function warnAboutChatImportFailure(importPlan) {
    if (importPlan.error) {
        console.error(importPlan.error);
        return;
    }

    if (importPlan.errorKind === CHAT_IMPORT_ERROR_KINDS.UNSUPPORTED_JSON_FORMAT) {
        console.error('Incorrect chat format .json');
        return;
    }

    if (importPlan.errorKind === CHAT_IMPORT_ERROR_KINDS.INVALID_JSONL_FORMAT) {
        console.error('Incorrect chat format .jsonl');
        return;
    }

    console.error(`Chat import failed: ${importPlan.errorKind}`);
}

function writeCharacterChatImportPlan(importPlan) {
    for (const write of importPlan.writes) {
        if (write.kind === 'copy-upload') {
            fs.copyFileSync(write.uploadPath, write.filePath);
            continue;
        }

        writeFileAtomicSync(write.filePath, write.contents, 'utf8');
    }
}

function getInteractionPerfChatTimestampMs() {
    if (process.env.EMBERDESK_INTERACTION_PERF_MODE !== '1') {
        return null;
    }

    const rawValue = process.env.EMBERDESK_INTERACTION_PERF_CHAT_MTIME_MS;
    const timestampMs = Number(rawValue);
    return Number.isFinite(timestampMs) ? timestampMs : null;
}

function applyInteractionPerfChatTimestamp(filePath) {
    const timestampMs = getInteractionPerfChatTimestampMs();
    if (timestampMs === null) {
        return;
    }

    const timestamp = new Date(timestampMs);
    fs.utimesSync(filePath, timestamp, timestamp);
}

/**
 * Saves a chat to the backups directory.
 * @param {string} directory The user's backup directory.
 * @param {string} name The name of the chat.
 * @param {string} data The serialized chat to save.
 * @param {string} backupPrefix The file prefix. Typically CHAT_BACKUPS_PREFIX.
 * @returns
 */
function backupChat(directory, name, data, backupPrefix = CHAT_BACKUPS_PREFIX) {
    let backupName = name;
    try {
        if (!isBackupEnabled) { return; }
        if (!fs.existsSync(directory)) {
            console.error(`The chat couldn't be backed up because no directory exists at ${directory}!`);
        }
        const backupPlan = createChatBackupPlan({
            directory,
            name,
            backupPrefix,
            timestamp: generateTimestamp(),
            maxTotalChatBackups,
        });
        backupName = backupPlan.normalizedName;

        tryWriteFileSync(backupPlan.backupFile, data);
        removeOldBackups(directory, backupPlan.perChatCleanupPrefix);
        if (!backupPlan.shouldApplyTotalRetention) {
            return;
        }
        removeOldBackups(directory, backupPlan.totalCleanupPrefix, backupPlan.totalCleanupLimit);
    } catch (err) {
        console.error(`Could not backup chat for ${backupName}`, err);
    }
}

/**
 * @type {Map<string, import('lodash').DebouncedFunc<typeof backupChat>>}
 */
const backupFunctions = new Map();

/**
 * Gets a backup function for a user.
 * @param {string} handle User handle
 * @returns {typeof backupChat} Backup function
 */
function getBackupFunction(handle) {
    if (!backupFunctions.has(handle)) {
        backupFunctions.set(handle, _.throttle(backupChat, throttleInterval, { leading: true, trailing: true }));
    }
    return backupFunctions.get(handle) || (() => { });
}

process.on('exit', () => {
    for (const func of backupFunctions.values()) {
        func.flush();
    }
});

/**
 * Checks if the chat being saved has the same integrity as the one being loaded.
 * @param {string} filePath Path to the chat file
 * @param {string} integritySlug Integrity slug
 * @returns {Promise<boolean>} Whether the chat is intact
 */
async function checkChatIntegrity(filePath, integritySlug) {
    // If the chat file doesn't exist, assume it's intact
    if (!fs.existsSync(filePath)) {
        return true;
    }

    // Parse the first line of the chat file as JSON
    const firstLine = await readFirstLine(filePath);
    const jsonData = tryParse(firstLine);
    const chatIntegrity = jsonData?.chat_metadata?.integrity;

    // If the chat has no integrity metadata, assume it's intact
    if (!chatIntegrity) {
        console.debug(`File "${filePath}" does not have integrity metadata matching "${integritySlug}". The integrity validation has been skipped.`);
        return true;
    }

    // Check if the integrity matches
    return chatIntegrity === integritySlug;
}

/**
 * @typedef {Object} ChatInfo
 * @property {string} [file_id] - The name of the chat file (without extension)
 * @property {string} [file_name] - The name of the chat file (with extension)
 * @property {string} [file_size] - The size of the chat file in a human-readable format
 * @property {number} [chat_items] - The number of chat items in the file
 * @property {string} [mes] - The last message in the chat
 * @property {number|string} [last_mes] - The timestamp of the last message
 * @property {object} [chat_metadata] - Additional chat metadata
 * @property {boolean} [match] - Whether the chat matches the search criteria
 */

/**
 * Reads the information from a chat file.
 * @param {string} pathToFile - Path to the chat file
 * @param {object} additionalData - Additional data to include in the result
 * @param {boolean} withMetadata - Whether to read chat metadata
 * @param {ChatMatchFunction|null} matcher - Optional function to match messages
 * @returns {Promise<ChatInfo>}
 *
 * @typedef {(textArray: string[]) => boolean} ChatMatchFunction
 */
export async function getChatInfo(pathToFile, additionalData = {}, withMetadata = false, matcher = null) {
    return new Promise(async (res) => {
        const parsedPath = path.parse(pathToFile);
        const stats = await fs.promises.stat(pathToFile);
        const hasMatcher = (typeof matcher === 'function');

        const chatData = {
            match: false,
            file_id: parsedPath.name,
            file_name: parsedPath.base,
            file_size: formatBytes(stats.size),
            chat_items: 0,
            mes: '[The chat is empty]',
            last_mes: stats.mtimeMs,
            ...additionalData,
        };

        if (stats.size === 0) {
            res(chatData);
            return;
        }

        const fileStream = fs.createReadStream(pathToFile);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity,
        });

        let lastLine;
        let itemCounter = 0;
        let hasAnyMatch = false;
        let matchBuffer = [];
        rl.on('line', (line) => {
            if (withMetadata && itemCounter === 0) {
                const jsonData = tryParse(line);
                if (jsonData && _.isObjectLike(jsonData.chat_metadata)) {
                    chatData.chat_metadata = jsonData.chat_metadata;
                }
            }
            // Skip matching if any match was already found
            if (hasMatcher && !hasAnyMatch && itemCounter > 0) {
                const jsonData = tryParse(line);
                if (jsonData) {
                    matchBuffer.push(jsonData.mes || '');
                    if (matcher(matchBuffer)) {
                        hasAnyMatch = true;
                        matchBuffer = [];
                    }
                }
            }
            itemCounter++;
            lastLine = line;
        });
        rl.on('close', () => {
            rl.close();

            if (lastLine) {
                const jsonData = tryParse(lastLine);
                if (jsonData && (jsonData.name || jsonData.character_name || jsonData.chat_metadata)) {
                    chatData.chat_items = (itemCounter - 1);
                    chatData.mes = jsonData.mes || '[The message is empty]';
                    chatData.last_mes = jsonData.send_date || new Date(Math.round(stats.mtimeMs)).toISOString();
                    chatData.match = hasMatcher ? hasAnyMatch : true;

                    res(chatData);
                } else {
                    console.warn('Found an invalid or corrupted chat file:', pathToFile);
                    res({});
                }
            }
        });
    });
}

export const router = express.Router();

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error
class IntegrityMismatchError extends Error {
    constructor(...params) {
        // Pass remaining arguments (including vendor specific ones) to parent constructor
        super(...params);
        // Maintains proper stack trace for where our error was thrown (non-standard)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, IntegrityMismatchError);
        }
        this.date = new Date();
    }
}

/**
 * Tries to save the chat data to a file, performing an integrity check if required.
 * @param {Array} chatData The chat array to save.
 * @param {string} filePath Target file path for the data.
 * @param {boolean} skipIntegrityCheck If undefined, the chat's integrity will not be checked.
 * @param {string} handle The users handle, passed to getBackupFunction.
 * @param {string} cardName Passed to backupChat.
 * @param {string} backupDirectory Passed to backupChat.
 */
export async function trySaveChat(chatData, filePath, skipIntegrityCheck = false, handle, cardName, backupDirectory) {
    const jsonlData = chatData?.map(m => JSON.stringify(m)).join('\n');
    await assertChatIntegrity(chatData, filePath, skipIntegrityCheck);
    writeChatProjection(jsonlData, filePath, handle, cardName, backupDirectory);
}

export async function assertChatIntegrity(chatData, filePath, skipIntegrityCheck = false) {
    const doIntegrityCheck = (checkIntegrity && !skipIntegrityCheck);
    const chatIntegritySlug = doIntegrityCheck ? chatData?.[0]?.chat_metadata?.integrity : undefined;

    if (chatIntegritySlug && !await checkChatIntegrity(filePath, chatIntegritySlug)) {
        throw new IntegrityMismatchError(`Chat integrity check failed for "${filePath}". The expected integrity slug was "${chatIntegritySlug}".`);
    }
}

export function writeChatProjection(jsonlData, filePath, handle, cardName, backupDirectory) {
    tryWriteFileSync(filePath, jsonlData);
    getBackupFunction(handle)(backupDirectory, cardName, jsonlData);
}

router.post('/save', validateAvatarUrlMiddleware, async function (request, response) {
    if (request.body?.is_group) {
        return sendGroupChatRetired(response);
    }
    try {
        const handle = request.user.profile?.handle ?? null;
        const cardName = String(request.body.avatar_url).replace('.png', '');
        const chatData = request.body.chat;
        const chatFileName = `${String(request.body.file_name)}.jsonl`;
        const chatFilePath = path.join(request.user.directories.chats, cardName, sanitize(chatFileName));
        if (!isPathUnderParent(request.user.directories.chats, chatFilePath)) {
            return response.sendStatus(400);
        }

        if (Array.isArray(chatData)) {
            const writeState = getCanonicalChatWriteState(request);
            if (writeState.blocked) {
                return sendCanonicalChatWriteBlocked(response, writeState);
            }
            if (writeState.ok) {
                await assertChatIntegrity(chatData, chatFilePath, request.body.force);
                const result = writeCanonicalChatPayload({
                    db: writeState.db,
                    locator: getCanonicalChatLocator(request.user.directories, {
                        ownerType: 'character',
                        ownerId: cardName,
                        filePath: chatFilePath,
                    }),
                    payload: chatData,
                    operation: 'save',
                    projectJsonl(jsonlData) {
                        writeChatProjection(
                            jsonlData,
                            chatFilePath,
                            handle,
                            cardName,
                            request.user.directories.backups,
                        );
                    },
                    onProjectionFailure() {
                        invalidateCanonicalAuditStatus(writeState.db, {
                            scope: getCanonicalStorageSlice('chats').auditScope,
                            handle,
                            reason: 'audit_stale_after_chat_projection_failure',
                            source: 'chat:save',
                        });
                    },
                });
                if (!result.ok) {
                    if (!result.authorityCommitted) {
                        return sendCanonicalChatWriteRejected(response, result);
                    }
                    return response.status(500).send({
                        error: 'Failed to project canonical chat file.',
                        repairKey: result.repairKey,
                    });
                }
                applyInteractionPerfChatTimestamp(chatFilePath);
                syncCanonicalChatStatsAfterCharacterChatMutation(handle, request.user.directories, request.body.avatar_url, 'chat save');
                return response.send({ ok: true });
            }

            await trySaveChat(chatData, chatFilePath, request.body.force, handle, cardName, request.user.directories.backups);
            applyInteractionPerfChatTimestamp(chatFilePath);
            syncCanonicalChatStatsAfterCharacterChatMutation(handle, request.user.directories, request.body.avatar_url, 'chat save');
            return response.send({ ok: true });
        } else {
            return response.status(400).send({ error: 'The request\'s body.chat is not an array.' });
        }
    } catch (error) {
        if (error instanceof IntegrityMismatchError) {
            console.error(error.message);
            return response.status(400).send({ error: 'integrity' });
        }
        console.error(error);
        return response.status(500).send({ error: 'An error has occurred, see the console logs for more information.' });
    }
});

/**
 * Gets the chat as an object.
 * @param {string} chatFilePath The full chat file path.
 * @returns {Array}} If the chatFilePath cannot be read, this will return [].
 */
export function getChatData(chatFilePath) {
    let chatData = [];

    const chatJSON = tryReadFileSync(chatFilePath) ?? '';
    if (chatJSON.length > 0) {
        const lines = chatJSON.split('\n');
        // Iterate through the array of strings and parse each line as JSON
        chatData = lines.map(line => tryParse(line)).filter(x => x);
    } else {
        console.warn(`File not found: ${chatFilePath}. The chat does not exist or is empty.`);
    }

    return chatData;
}

router.post('/get', validateAvatarUrlMiddleware, function (request, response) {
    if (request.body?.is_group) {
        return sendGroupChatRetired(response);
    }
    try {
        const dirName = String(request.body.avatar_url).replace('.png', '');
        const directoryPath = path.join(request.user.directories.chats, dirName);
        if (!isPathUnderParent(request.user.directories.chats, directoryPath)) {
            return response.sendStatus(400);
        }
        if (!request.body.file_name) {
            if (!fs.existsSync(directoryPath)) {
                fs.mkdirSync(directoryPath);
            }
            return response.send({});
        }

        const chatFileName = `${String(request.body.file_name)}.jsonl`;
        const chatFilePath = path.join(directoryPath, sanitize(chatFileName));
        const canonical = readCanonicalChatRoutePayload(request, getCanonicalChatLocator(request.user.directories, {
            ownerType: 'character',
            ownerId: dirName,
            filePath: chatFilePath,
        }));
        if (canonical.active) {
            return response.send(canonical.payload ?? {});
        }

        //if no chat dir for the character is found, make one with the character name
        if (!fs.existsSync(directoryPath)) {
            fs.mkdirSync(directoryPath);
            return response.send({});
        }

        return response.send(getChatData(chatFilePath));
    } catch (error) {
        console.error(error);
        return response.send({});
    }
});

router.post('/rename', validateAvatarUrlMiddleware, async function (request, response) {
    if (request.body?.is_group) {
        return sendGroupChatRetired(response);
    }
    try {
        if (!request.body || !request.body.original_file || !request.body.renamed_file) {
            return response.sendStatus(400);
        }

        const pathToFolder = request.body.is_group
            ? request.user.directories.groupChats
            : path.join(request.user.directories.chats, String(request.body.avatar_url).replace('.png', ''));
        if (!request.body.is_group && !isPathUnderParent(request.user.directories.chats, pathToFolder)) {
            return response.sendStatus(400);
        }
        const pathToOriginalFile = path.join(pathToFolder, sanitize(request.body.original_file));
        const pathToRenamedFile = path.join(pathToFolder, sanitize(request.body.renamed_file));
        const sanitizedFileName = path.parse(pathToRenamedFile).name;
        console.debug('Old chat name', pathToOriginalFile);
        console.debug('New chat name', pathToRenamedFile);

        if (!fs.existsSync(pathToOriginalFile) || fs.existsSync(pathToRenamedFile)) {
            console.error('Either Source or Destination files are not available');
            return response.status(400).send({ error: true });
        }

        const writeState = getCanonicalChatWriteState(request);
        if (writeState.blocked) {
            return sendCanonicalChatWriteBlocked(response, writeState);
        }
        if (writeState.ok) {
            const ownerType = request.body.is_group ? 'group' : 'character';
            const originalLocator = getCanonicalChatLocator(request.user.directories, {
                ownerType,
                ownerId: request.body.is_group
                    ? path.parse(sanitize(request.body.original_file)).name
                    : String(request.body.avatar_url).replace('.png', ''),
                filePath: pathToOriginalFile,
            });
            const nextLocator = getCanonicalChatLocator(request.user.directories, {
                ownerType,
                ownerId: request.body.is_group
                    ? path.parse(sanitize(request.body.renamed_file)).name
                    : String(request.body.avatar_url).replace('.png', ''),
                filePath: pathToRenamedFile,
            });
            const result = renameCanonicalChat({
                db: writeState.db,
                locator: originalLocator,
                nextLocator,
                projectRename() {
                    fs.copyFileSync(pathToOriginalFile, pathToRenamedFile);
                    fs.unlinkSync(pathToOriginalFile);
                },
                onProjectionFailure() {
                    invalidateCanonicalAuditStatus(writeState.db, {
                        scope: getCanonicalStorageSlice('chats').auditScope,
                        handle: getRequestHandle(request),
                        reason: 'audit_stale_after_chat_projection_failure',
                        source: 'chat:rename',
                    });
                },
            });
            if (!result.ok) {
                if (!result.authorityCommitted) {
                    return response.status(400).send({ error: true });
                }
                return response.status(500).send({
                    error: true,
                    repairKey: result.repairKey,
                });
            }
            console.info('Successfully renamed canonical chat file.');
            if (!request.body.is_group) {
                syncCanonicalChatStatsAfterCharacterChatMutation(request.user.profile?.handle ?? null, request.user.directories, request.body.avatar_url, 'chat rename');
            }
            return response.send({ ok: true, sanitizedFileName });
        }

        fs.copyFileSync(pathToOriginalFile, pathToRenamedFile);
        fs.unlinkSync(pathToOriginalFile);
        console.info('Successfully renamed chat file.');
        if (!request.body.is_group) {
            syncCanonicalChatStatsAfterCharacterChatMutation(request.user.profile?.handle ?? null, request.user.directories, request.body.avatar_url, 'chat rename');
        }
        return response.send({ ok: true, sanitizedFileName });
    } catch (error) {
        console.error('Error renaming chat file:', error);
        return response.status(500).send({ error: true });
    }
});

router.post('/delete', validateAvatarUrlMiddleware, function (request, response) {
    if (request.body?.is_group) {
        return sendGroupChatRetired(response);
    }
    try {
        if (!path.extname(request.body.chatfile)) {
            request.body.chatfile += '.jsonl';
        }

        const dirName = String(request.body.avatar_url).replace('.png', '');
        const chatFileName = String(request.body.chatfile);
        const chatFilePath = path.join(request.user.directories.chats, dirName, sanitize(chatFileName));
        if (!isPathUnderParent(request.user.directories.chats, chatFilePath)) {
            return response.sendStatus(400);
        }
        const writeState = getCanonicalChatWriteState(request);
        if (writeState.blocked) {
            return sendCanonicalChatWriteBlocked(response, writeState);
        }
        if (writeState.ok) {
            if (!fs.existsSync(chatFilePath)) {
                console.error('The chat file was not deleted.');
                return response.sendStatus(400);
            }
            const result = deleteCanonicalChat({
                db: writeState.db,
                locator: getCanonicalChatLocator(request.user.directories, {
                    ownerType: 'character',
                    ownerId: dirName,
                    filePath: chatFilePath,
                }),
                projectDelete() {
                    if (!tryDeleteFile(chatFilePath)) {
                        throw new Error('JSONL chat projection was not deleted.');
                    }
                },
                onProjectionFailure() {
                    invalidateCanonicalAuditStatus(writeState.db, {
                        scope: getCanonicalStorageSlice('chats').auditScope,
                        handle: getRequestHandle(request),
                        reason: 'audit_stale_after_chat_projection_failure',
                        source: 'chat:delete',
                    });
                },
            });
            if (!result.ok) {
                if (!result.authorityCommitted) {
                    return response.sendStatus(400);
                }
                return response.status(500).send({
                    error: 'Failed to project canonical chat deletion.',
                    repairKey: result.repairKey,
                });
            }
            syncCanonicalChatStatsAfterCharacterChatMutation(request.user.profile?.handle ?? null, request.user.directories, request.body.avatar_url, 'chat delete');
            return response.send({ ok: true });
        }
        //Return success if the file was deleted.
        if (tryDeleteFile(chatFilePath)) {
            syncCanonicalChatStatsAfterCharacterChatMutation(request.user.profile?.handle ?? null, request.user.directories, request.body.avatar_url, 'chat delete');
            return response.send({ ok: true });
        } else {
            console.error('The chat file was not deleted.');
            return response.sendStatus(400);
        }
    } catch (error) {
        console.error(error);
        return response.sendStatus(500);
    }
});

router.post('/export', validateAvatarUrlMiddleware, async function (request, response) {
    if (request.body?.is_group) {
        return sendGroupChatRetired(response);
    }
    if (!request.body.file || (!request.body.avatar_url && request.body.is_group === false)) {
        return response.sendStatus(400);
    }
    const pathToFolder = request.body.is_group
        ? request.user.directories.groupChats
        : path.join(request.user.directories.chats, String(request.body.avatar_url).replace('.png', ''));
    const filename = path.join(pathToFolder, sanitize(request.body.file));
    if (!request.body.is_group && !isPathUnderParent(request.user.directories.chats, filename)) {
        return response.sendStatus(400);
    }
    let exportfilename = request.body.exportfilename;
    const canonical = serializeCanonicalChatRoutePayload(request, getCanonicalChatLocator(request.user.directories, {
        ownerType: request.body.is_group ? 'group' : 'character',
        ownerId: request.body.is_group
            ? path.parse(sanitize(request.body.file)).name
            : String(request.body.avatar_url).replace('.png', ''),
        filePath: filename,
    }));
    if (canonical.active && canonical.jsonl === null) {
        const errorMessage = {
            message: `Could not find JSONL file to export. Source chat file: ${filename}.`,
        };
        console.error(errorMessage.message);
        return response.status(404).json(errorMessage);
    }
    try {
        const rawFile = canonical.active
            ? canonical.jsonl
            : fs.existsSync(filename)
                ? fs.readFileSync(filename, 'utf8')
                : null;
        if (rawFile === null) {
            const errorMessage = {
                message: `Could not find JSONL file to export. Source chat file: ${filename}.`,
            };
            console.error(errorMessage.message);
            return response.status(404).json(errorMessage);
        }

        // Short path for JSONL files
        if (request.body.format === 'jsonl') {
            const successMessage = {
                message: `Chat saved to ${exportfilename}`,
                result: rawFile,
            };
            console.info(`Chat exported as ${exportfilename}`);
            return response.status(200).json(successMessage);
        }

        let buffer = '';
        for (const line of rawFile.split('\n')) {
            if (!line) {
                continue;
            }
            const data = JSON.parse(line);
            // Skip non-printable/prompt-hidden messages
            if (data.is_system) {
                continue;
            }
            if (data.mes) {
                const name = data.name;
                const message = (data?.extra?.display_text || data?.mes || '').replace(/\r?\n/g, '\n');
                buffer += (`${name}: ${message}\n\n`);
            }
        }
        const successMessage = {
            message: `Chat saved to ${exportfilename}`,
            result: buffer,
        };
        console.info(`Chat exported as ${exportfilename}`);
        return response.status(200).json(successMessage);
    } catch (err) {
        console.error('chat export failed.', err);
        return response.sendStatus(400);
    }
});

router.post('/group/import', function (request, response) {
    return sendGroupChatRetired(response);
});

router.post('/import', validateAvatarUrlMiddleware, function (request, response) {
    if (!request.body) return response.sendStatus(400);

    const format = request.body.file_type;
    const avatarUrl = (request.body.avatar_url).replace('.png', '');
    const characterName = sanitize(request.body.character_name) || 'Character';
    const userName = sanitize(request.body.user_name) || 'User';
    const fileNames = [];

    if (!request.file) {
        return response.sendStatus(400);
    }

    const directoryPath = path.join(request.user.directories.chats, avatarUrl);
    if (!isPathUnderParent(request.user.directories.chats, directoryPath)) {
        return response.sendStatus(400);
    }

    try {
        const pathToUpload = path.join(request.file.destination, request.file.filename);
        const data = fs.readFileSync(pathToUpload, 'utf8');

        if (format === 'json') {
            fs.unlinkSync(pathToUpload);
        }

        const importPlan = createCharacterChatImportPlan({
            format,
            data,
            directories: request.user.directories,
            avatarUrl,
            characterName,
            userName,
            timestampLabel: humanizedDateTime,
            uploadPath: pathToUpload,
        });

        if (!importPlan.ok) {
            warnAboutChatImportFailure(importPlan);
            return response.send({ error: true });
        }

        const writeState = getCanonicalChatWriteState(request);
        if (writeState.blocked) {
            return sendCanonicalChatWriteBlocked(response, writeState);
        }
        if (writeState.ok) {
            for (const write of importPlan.writes) {
                const jsonlData = write.kind === 'copy-upload'
                    ? fs.readFileSync(write.uploadPath, 'utf8')
                    : write.contents;
                const result = writeCanonicalChatPayload({
                    db: writeState.db,
                    locator: getCanonicalChatLocator(request.user.directories, {
                        ownerType: 'character',
                        ownerId: avatarUrl,
                        filePath: write.filePath,
                    }),
                    payload: parseCanonicalChatJsonl(jsonlData),
                    operation: 'import',
                    projectJsonl(projectedJsonl) {
                        writeFileAtomicSync(write.filePath, projectedJsonl, 'utf8');
                    },
                    onProjectionFailure() {
                        invalidateCanonicalAuditStatus(writeState.db, {
                            scope: getCanonicalStorageSlice('chats').auditScope,
                            handle: getRequestHandle(request),
                            reason: 'audit_stale_after_chat_projection_failure',
                            source: 'chat:import',
                        });
                    },
                });
                if (!result.ok) {
                    if (!result.authorityCommitted) {
                        return sendCanonicalChatWriteRejected(response, result);
                    }
                    return response.send({ error: true, repairKey: result.repairKey });
                }
            }
            fileNames.push(...importPlan.fileNames);
            if (importPlan.uploadCleanup === CHAT_IMPORT_UPLOAD_CLEANUP.AFTER_SUCCESS) {
                fs.unlinkSync(pathToUpload);
            }
            if (importPlan.shouldMarkChatStatsDirty) {
                syncCanonicalChatStatsAfterCharacterChatMutation(request.user.profile?.handle ?? null, request.user.directories, request.body.avatar_url, 'chat import');
            }
            return response.send({ res: true, fileNames });
        }

        writeCharacterChatImportPlan(importPlan);
        fileNames.push(...importPlan.fileNames);

        if (importPlan.uploadCleanup === CHAT_IMPORT_UPLOAD_CLEANUP.AFTER_SUCCESS) {
            fs.unlinkSync(pathToUpload);
        }

        if (importPlan.shouldMarkChatStatsDirty) {
            syncCanonicalChatStatsAfterCharacterChatMutation(request.user.profile?.handle ?? null, request.user.directories, request.body.avatar_url, 'chat import');
        }

        return response.send({ res: true, fileNames });
    } catch (error) {
        console.error(error);
        return response.send({ error: true });
    }
});

router.post('/group/get', function (request, response) {
    return sendGroupChatRetired(response);
});

router.post('/group/info', function (request, response) {
    return sendGroupChatRetired(response);
});

router.post('/group/delete', function (request, response) {
    return sendGroupChatRetired(response);
});

router.post('/group/save', function (request, response) {
    return sendGroupChatRetired(response);
});

router.post('/search', validateAvatarUrlMiddleware, async function (request, response) {
    try {
        const { query, avatar_url, group_id } = request.body;
        const dependencies = {
            fs,
            path,
            getChatInfo,
            warn: console.warn,
        };
        const readState = getCanonicalChatReadState(request);
        const payload = readState.ok
            ? await searchCanonicalChatPayload({
                db: readState.db,
                directories: request.user.directories,
                query,
                avatarUrl: avatar_url,
                groupId: group_id,
                dependencies,
            })
            : await searchChatPayload({
                directories: request.user.directories,
                query,
                avatarUrl: avatar_url,
                groupId: group_id,
                dependencies,
            });

        return response.send(payload);
    } catch (error) {
        console.error('Chat search error:', error);
        return response.status(500).json({ error: 'Search failed' });
    }
});

router.post('/recent', async function (request, response) {
    try {
        const dependencies = {
            fs,
            path,
            getChatInfo,
        };
        const readState = getCanonicalChatReadState(request);
        const payload = readState.ok
            ? await readCanonicalRecentChatPayload({
                db: readState.db,
                directories: request.user.directories,
                pinned: request.body.pinned,
                max: request.body.max,
                metadata: !!request.body.metadata,
                dependencies,
            })
            : await readRecentChatPayload({
                directories: request.user.directories,
                pinned: request.body.pinned,
                max: request.body.max,
                metadata: !!request.body.metadata,
                dependencies,
            });

        return response.send(payload);
    } catch (error) {
        console.error(error);
        return response.sendStatus(500);
    }
});
