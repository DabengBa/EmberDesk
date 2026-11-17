import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import process from 'node:process';
import crypto from 'node:crypto';

import express from 'express';
import sanitize from 'sanitize-filename';
import { sync as writeFileAtomicSync } from 'write-file-atomic';
import _ from 'lodash';

import validateAvatarUrlMiddleware from '../middleware/validateFileName.js';
import {
    getConfigValue,

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
} from './chat-import-service.ts';
import { createChatBackupPlan } from './chat-backup-helpers.ts';
import { registerChatGetRoute, registerChatSearchRoute, registerChatRecentRoute } from './chat-read-routes.ts';
import { registerChatSaveRoute, registerChatRenameRoute, registerChatDeleteRoute } from './chat-write-routes.ts';
import { registerChatImportRoute } from './chat-import-routes.ts';
import { registerChatExportRoute } from './chat-compatibility.ts';
import { getCanonicalStorageSlice } from '../canonical-storage-slice-registry.ts';
import { ensureCanonicalSliceBackend } from '../canonical-backend.js';
import { getCanonicalStorageStatus, openCanonicalDatabase, withCanonicalTransaction } from '../canonical-sqlite.ts';
import { runCanonicalMigrations } from '../canonical-sqlite-migrations.ts';
import {
    getPersistedCanonicalAuditStatus,
    invalidateCanonicalAuditStatus,
} from '../canonical-sqlite-shadow-import.ts';
import {
    readCanonicalChatPayload,
    serializeCanonicalChatPayload,
} from './canonical-chat-read-service.ts';
import { reconcileCanonicalChatSources } from '../canonical-chat-shadow-import.ts';
import {
    readCanonicalRecentChatPayload,
    searchCanonicalChatPayload,
} from './canonical-chat-query-service.ts';
import {
    deleteCanonicalChat,
    parseCanonicalChatJsonl,
    renameCanonicalChat,
    writeCanonicalChatPayload,
} from './canonical-chat-write-service.ts';
import { calculateCanonicalCharacterChatStats, getCanonicalChatOperation, getCanonicalChatSession } from './canonical-chat-store.ts';
import { coordinateWorkspaceWrite, openRequestCoordinationDatabase } from './coordinate-workspace-write.js';

const isBackupEnabled = !!getConfigValue('backups.chat.enabled', true, 'boolean');
const maxTotalChatBackups = Number(getConfigValue('backups.chat.maxTotalBackups', -1, 'number'));
const throttleInterval = Number(getConfigValue('backups.chat.throttleInterval', 10_000, 'number'));
const checkIntegrity = !!getConfigValue('backups.chat.checkIntegrity', true, 'boolean');

export const CHAT_BACKUPS_PREFIX = 'chat_';

function rejectGroupChatRequest(request, response, next) {
    if (request.body?.is_group) {
        return response.status(400).send({ error: 'group chats are not supported' });
    }
    return next();
}
function getRequestHandle(request) {
    return request.user?.profile?.handle ?? request.user?.handle ?? 'default-user';
}

async function getCanonicalChatReadState(request) {
    const chatSlice = getCanonicalStorageSlice('chats');
    const featureFlags = chatSlice.getFeatureFlags();
    if (!featureFlags.enabled) {
        return { ok: false, reason: 'canonical_storage_disabled', featureFlags };
    }
    await ensureCanonicalSliceBackend('chats', request.user.directories, getRequestHandle(request));
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
        return { ok: false, reason, featureFlags, auditStatus, rollback };
    }

    return { ok: true, db, featureFlags, auditStatus };
}

async function getCanonicalChatWriteState(request) {
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

    const readState = await getCanonicalChatReadState(request);
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
        return { ...readState, ok: false, blocked: true, reason, rollback };
    }

    return readState;
}

function getChatsProjectionMode() {
    return getCanonicalStorageSlice('chats').getProjectionMode();
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

function chatOperationIdentity(request, kind, locator) {
    const id = request.body?.operationId;
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) return null;
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify([kind, locator, request.body])).digest('hex');
    return { id, fingerprint };
}

function sendCanonicalChatReadBlocked(response, readState) {
    return response.status(503).send({
        error: 'canonical_chat_read_blocked',
        reason: readState.reason ?? 'canonical_chat_read_blocked',
    });
}

function reconcileCanonicalChatLocator(db, directories, locator) {
    reconcileCanonicalChatSources({
        db,
        directories,
        ownerType: locator.ownerType,
        ownerId: locator.ownerId,
        filePaths: [path.join(directories.root, locator.sourcePath)],
    });
}

async function readCanonicalChatRoutePayload(request, locator) {
    const readState = await getCanonicalChatReadState(request);
    if (!readState.ok) {
        return { active: false, payload: null, reason: readState.reason };
    }

    reconcileCanonicalChatLocator(readState.db, request.user.directories, locator);
    return withCanonicalTransaction(readState.db, db => ({
        active: true,
        payload: readCanonicalChatPayload(db, locator),
        version: getCanonicalChatSession(db, locator)?.concurrency_token ?? null,
        db,
    }));
}

async function serializeCanonicalChatRoutePayload(request, locator) {
    const readState = await getCanonicalChatReadState(request);
    if (!readState.ok) {
        return { active: false, jsonl: null, reason: readState.reason };
    }

    reconcileCanonicalChatLocator(readState.db, request.user.directories, locator);
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
    // All callers follow a successful ordinary canonical write. With projection
    // off that transaction already maintains stats; never overwrite it later.
    if (getChatsProjectionMode() === 'off') return;

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

    const chatsSlice = getCanonicalStorageSlice('chats');
    const chatsFlags = chatsSlice.getFeatureFlags();
    const stats = chatsFlags.enabled && chatsFlags.writes && chatsSlice.getProjectionMode() === 'off'
        ? calculateCanonicalCharacterChatStats(db, String(avatar).replace(/\.png$/i, ''))
        : calculateCharacterChatStats(getCharacterChatDirectory(directories, avatar));
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
    if (timestampMs === null || getChatsProjectionMode() === 'off') {
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
        return chatData;
    }

    return new Promise((res) => {
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

export const chatRouteContext = {
    router,
    fs,
    path,
    crypto,
    sanitize,
    writeFileAtomicSync,
    validateAvatarUrlMiddleware,
    rejectGroupChatRequest,
    coordinateWorkspaceWrite,
    openRequestCoordinationDatabase,
    getCanonicalChatOperation,
    getCanonicalChatWriteState,
    getCanonicalChatReadState,
    getCanonicalChatLocator,
    chatOperationIdentity,
    getChatsProjectionMode,
    getRequestHandle,
    sendCanonicalChatWriteBlocked,
    sendCanonicalChatWriteRejected,
    sendCanonicalChatReadBlocked,
    writeCanonicalChatPayload,
    deleteCanonicalChat,
    renameCanonicalChat,
    parseCanonicalChatJsonl,
    invalidateCanonicalAuditStatus,
    getCanonicalStorageSlice,
    writeChatProjection,
    getBackupFunction,
    IntegrityMismatchError,
    applyInteractionPerfChatTimestamp,
    syncCanonicalChatStatsAfterCharacterChatMutation,
    tryDeleteFile,
    isPathUnderParent,
    serializeCanonicalChatRoutePayload,
    createCharacterChatImportPlan,
    CHAT_IMPORT_UPLOAD_CLEANUP,
    warnAboutChatImportFailure,
    reconcileCanonicalChatSources,
    searchCanonicalChatPayload,
    readCanonicalRecentChatPayload,
    getChatInfo,
};

registerChatSaveRoute(chatRouteContext);

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

registerChatGetRoute(router, {
    rejectGroupChatRequest,
    getCanonicalChatLocator,
    readCanonicalChatRoutePayload,
    sendCanonicalChatReadBlocked,
});

registerChatRenameRoute(chatRouteContext);

registerChatDeleteRoute(chatRouteContext);

registerChatExportRoute(chatRouteContext);

registerChatImportRoute(chatRouteContext);

registerChatSearchRoute(chatRouteContext);

registerChatRecentRoute(chatRouteContext);

/**
 * Opens the canonical chat session the text-replace feature targets, running
 * the same write-state gate and file→canonical reconciliation the /save route
 * uses. Returns { ok:false, reason } when chat writes are blocked.
 *
 * @param {import('express').Request} request Express request
 * @param {{ ownerId: string, chatFileName: string }} options Character internal name + chat file name (without .jsonl)
 * @returns {Promise<{ ok: boolean, reason?: string, db?: object, locator?: object, filePath?: string, cardName?: string }>}
 */
export async function openCanonicalChatForTextReplace(request, { ownerId, chatFileName }) {
    const writeState = await getCanonicalChatWriteState(request);
    if (!writeState.ok) {
        return { ok: false, reason: writeState.reason ?? 'canonical_chat_write_blocked' };
    }
    const cardName = String(ownerId);
    const filePath = path.join(request.user.directories.chats, cardName, sanitize(`${String(chatFileName)}.jsonl`));
    if (!isPathUnderParent(request.user.directories.chats, filePath)) {
        return { ok: false, reason: 'invalid_chat_path' };
    }
    const locator = getCanonicalChatLocator(request.user.directories, {
        ownerType: 'character',
        ownerId: cardName,
        filePath,
    });
    reconcileCanonicalChatLocator(writeState.db, request.user.directories, locator);
    return { ok: true, db: writeState.db, locator, filePath, cardName };
}

/**
 * Writes a transformed chat payload through the canonical write path —
 * same transaction, projection, backup, and audit-invalidation semantics as
 * /save — then refreshes the character chat-stats cache.
 *
 * @param {import('express').Request} request Express request
 * @param {{ db: object, locator: object, filePath: string, cardName: string, avatarUrl: string, payload: Array<object> }} options
 * @returns {{ ok: boolean, authorityCommitted?: boolean, reason?: string, repairKey?: string }}
 */
export function writeCanonicalChatForTextReplace(request, { db, locator, filePath, cardName, avatarUrl, payload, version }) {
    if (typeof version !== 'string' || !version) return { ok: false, authorityCommitted: false, reason: 'missing_chat_version' };
    const handle = getRequestHandle(request);
    const result = writeCanonicalChatPayload({
        db,
        locator,
        payload,
        operation: 'text-replace',
        condition: { version },
        projection: getChatsProjectionMode(),
        projectJsonl(jsonlData) {
            writeChatProjection(jsonlData, filePath, handle, cardName, request.user.directories.backups);
        },
        onAuthorityCommitted(jsonlData) {
            getBackupFunction(handle)(request.user.directories.backups, cardName, jsonlData);
        },
        onProjectionFailure() {
            invalidateCanonicalAuditStatus(db, {
                scope: getCanonicalStorageSlice('chats').auditScope,
                handle,
                reason: 'audit_stale_after_chat_projection_failure',
                source: 'chat:text-replace',
            });
        },
    });
    if (result.ok) {
        applyInteractionPerfChatTimestamp(filePath);
        syncCanonicalChatStatsAfterCharacterChatMutation(handle, request.user.directories, avatarUrl, 'text replace');
    }
    return result;
}
