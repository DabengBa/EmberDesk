import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import sanitize from 'sanitize-filename';

const require = createRequire(import.meta.url);
let DatabaseSync;

try {
    ({ DatabaseSync } = require('node:sqlite'));
} catch {
    DatabaseSync = undefined;
}

const SCHEMA_VERSION = 2;
const DATABASES = new Map();
const ROW_REFRESH_CONCURRENCY = 10;
const CHARACTER_AVATAR_COLLATOR = new Intl.Collator(undefined, {
    sensitivity: 'base',
    numeric: false,
});

/**
 * @param {{ chats?: string }} directories
 * @param {string} avatar
 * @returns {{ chatSize: number, dateLastChat: number }}
 */
function calculateCharacterChatStats(directories, avatar) {
    let chatSize = 0;
    let dateLastChat = 0;

    if (!directories.chats) {
        return { chatSize, dateLastChat };
    }

    const chatsDirectory = path.join(directories.chats, avatar.replace(/\.png$/i, ''));
    if (!fs.existsSync(chatsDirectory)) {
        return { chatSize, dateLastChat };
    }

    for (const chat of fs.readdirSync(chatsDirectory)) {
        const chatStat = fs.statSync(path.join(chatsDirectory, chat));
        chatSize += chatStat.size;
        dateLastChat = Math.max(dateLastChat, chatStat.mtimeMs);
    }

    return { chatSize, dateLastChat };
}

/**
 * @param {{ chats?: string }} directories
 * @param {string} avatar
 * @param {{ full_json?: string, shallow_json: string }} row
 * @param {object} [fullPayload]
 * @param {number} chatSize
 * @param {number} dateLastChat
 * @returns {void}
 */
function updateCharacterChatStatsRow(userRoot, avatar, row, fullPayload, chatSize, dateLastChat) {
    const db = openCharacterIndexDatabase(userRoot);
    if (!db) {
        return;
    }

    try {
        const nextFullPayload = fullPayload ?? JSON.parse(row.full_json);
        const shallowPayload = JSON.parse(row.shallow_json);

        nextFullPayload.chat_size = chatSize;
        nextFullPayload.date_last_chat = dateLastChat;
        shallowPayload.chat_size = chatSize;
        shallowPayload.date_last_chat = dateLastChat;

        db.prepare(`
            UPDATE characters
            SET
                full_json = ?,
                shallow_json = ?,
                chat_stats_dirty = 0
            WHERE avatar = ?
        `).run(
            JSON.stringify(nextFullPayload),
            JSON.stringify(shallowPayload),
            avatar,
        );
    } catch (error) {
        resetCharacterIndexDatabase(userRoot);
        throw error;
    }
}

/**
 * @param {string} userRoot
 * @param {{ chats?: string }} directories
 * @param {string} avatar
 * @returns {void}
 */
function refreshCharacterChatStatsRow(userRoot, directories, avatar) {
    const db = openCharacterIndexDatabase(userRoot);
    if (!db) {
        return;
    }

    try {
        const row = db.prepare('SELECT full_json, shallow_json FROM characters WHERE avatar = ?').get(avatar);
        if (!row) {
            return;
        }

        const { chatSize, dateLastChat } = calculateCharacterChatStats(directories, avatar);
        updateCharacterChatStatsRow(userRoot, avatar, row, undefined, chatSize, dateLastChat);
    } catch (error) {
        resetCharacterIndexDatabase(userRoot);
        throw error;
    }
}

/**
 * @param {{ worlds?: string }} directories
 * @param {string} worldInfoName
 * @returns {{ mtimeMs: number, size: number } | null}
 */
function calculateWorldInfoStat(directories, worldInfoName) {
    if (!directories.worlds || !worldInfoName) {
        return null;
    }

    const filename = sanitize(`${worldInfoName}.json`);
    const worldInfoPath = path.join(directories.worlds, filename);

    try {
        const stat = fs.statSync(worldInfoPath);
        return {
            mtimeMs: stat.mtimeMs,
            size: stat.size,
        };
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return null;
        }
        throw error;
    }
}

/**
 * @param {{ source_world_mtime_ms: number, source_world_size: number }} row
 * @returns {boolean}
 */
function isMissingWorldInfoSnapshot(row) {
    return Number(row.source_world_mtime_ms) === -1
        && Number(row.source_world_size) === -1;
}

/**
 * @param {string} userRoot
 * @param {{ chats?: string }} directories
 * @param {string} avatar
 * @param {{ mtimeMs: number, size: number }} sourceStat
 * @returns {object|null}
 */
export function getFreshIndexedCharacterFullPayload(userRoot, directories, avatar, sourceStat) {
    const db = openCharacterIndexDatabase(userRoot);
    if (!db) {
        return null;
    }

    let row;
    try {
        row = db.prepare(`
            SELECT
                full_json,
                shallow_json,
                source_mtime_ms,
                source_size,
                source_world_name,
                source_world_mtime_ms,
                source_world_size,
                chat_stats_dirty
            FROM characters
            WHERE avatar = ?
        `).get(avatar);
    } catch (error) {
        resetCharacterIndexDatabase(userRoot);
        throw error;
    }

    if (!row) {
        return null;
    }

    if (Number(row.source_mtime_ms) !== Number(sourceStat.mtimeMs)
        || Number(row.source_size) !== Number(sourceStat.size)) {
        return null;
    }

    let fullPayload;
    try {
        fullPayload = JSON.parse(row.full_json);
    } catch (error) {
        if (error instanceof SyntaxError) {
            console.warn(`Character index payload skipped for ${avatar}:`, error);
            try {
                deleteCharacterIndexEntry(userRoot, avatar);
            } catch (deleteError) {
                console.warn(`Character index cleanup skipped for ${avatar}:`, deleteError);
            }
            return null;
        }

        throw error;
    }

    const { chatSize, dateLastChat } = calculateCharacterChatStats(directories, avatar);
    const chatStatsChanged =
        Number(fullPayload.chat_size ?? 0) !== Number(chatSize)
        || Number(fullPayload.date_last_chat ?? 0) !== Number(dateLastChat)
        || Number(row.chat_stats_dirty) === 1;

    if (chatStatsChanged) {
        updateCharacterChatStatsRow(userRoot, avatar, {
            full_json: row.full_json,
            shallow_json: row.shallow_json,
        }, fullPayload, chatSize, dateLastChat);
    }

    if (row.source_world_name) {
        const currentWorldStat = calculateWorldInfoStat(directories, row.source_world_name);
        if (!currentWorldStat) {
            if (!isMissingWorldInfoSnapshot(row)) {
                return null;
            }
        } else if (Number(row.source_world_mtime_ms) !== Number(currentWorldStat.mtimeMs)
            || Number(row.source_world_size) !== Number(currentWorldStat.size)) {
            return null;
        }
    }

    return fullPayload;
}

/**
 * @returns {boolean}
 */
export function isCharacterIndexSupported() {
    return typeof DatabaseSync === 'function';
}

/**
 * @param {string} userRoot
 * @returns {string}
 */
export function getCharacterIndexPath(userRoot) {
    return path.join(userRoot, '_cache', 'character-index.sqlite');
}

/**
 * @param {string} userRoot
 * @returns {DatabaseSync}
 */
function openCharacterIndexDatabase(userRoot) {
    if (!isCharacterIndexSupported()) {
        return null;
    }

    if (DATABASES.has(userRoot)) {
        return DATABASES.get(userRoot);
    }

    const databasePath = getCharacterIndexPath(userRoot);
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    const db = new DatabaseSync(databasePath);
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec(`
        CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS characters (
            avatar TEXT PRIMARY KEY,
            full_json TEXT NOT NULL,
            shallow_json TEXT NOT NULL,
            source_mtime_ms INTEGER NOT NULL,
            source_size INTEGER NOT NULL,
            source_world_name TEXT NOT NULL DEFAULT '',
            source_world_mtime_ms INTEGER NOT NULL DEFAULT -1,
            source_world_size INTEGER NOT NULL DEFAULT -1,
            chat_stats_dirty INTEGER NOT NULL DEFAULT 0
        );
    `);

    const currentVersion = db.prepare('SELECT value FROM meta WHERE key = \'schema_version\'').get()?.value;
    if (Number(currentVersion) !== SCHEMA_VERSION) {
        db.prepare('DELETE FROM characters').run();
        db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (\'schema_version\', ?)').run(String(SCHEMA_VERSION));
    }

    DATABASES.set(userRoot, db);
    return db;
}

/**
 * @param {string} userRoot
 * @returns {void}
 */
export function resetCharacterIndexDatabase(userRoot) {
    const db = DATABASES.get(userRoot);
    if (!db) {
        return;
    }

    try {
        db.close();
    } catch {
        // Ignore close failures while recovering a broken index.
    }

    DATABASES.delete(userRoot);
}

/**
 * @param {string} userRoot
 * @param {string} avatar
 * @returns {void}
 */
export function markCharacterChatStatsDirty(userRoot, avatar) {
    const db = openCharacterIndexDatabase(userRoot);
    if (!db) {
        return;
    }
    try {
        db.prepare('UPDATE characters SET chat_stats_dirty = 1 WHERE avatar = ?').run(avatar);
    } catch (error) {
        resetCharacterIndexDatabase(userRoot);
        throw error;
    }
}

/**
 * @param {string} userRoot
 * @param {string} avatar
 * @returns {void}
 */
export function deleteCharacterIndexEntry(userRoot, avatar) {
    const db = openCharacterIndexDatabase(userRoot);
    if (!db) {
        return;
    }
    try {
        db.prepare('DELETE FROM characters WHERE avatar = ?').run(avatar);
    } catch (error) {
        resetCharacterIndexDatabase(userRoot);
        throw error;
    }
}

/**
 * @returns {void}
 */
export function disposeCharacterIndexDatabases() {
    for (const db of DATABASES.values()) {
        try {
            db.close();
        } catch {
            // Ignore shutdown close failures.
        }
    }
    DATABASES.clear();
}

/**
 * @param {string} userRoot
 * @param {string} avatar
 * @param {{
 *   fullPayload: object,
 *   shallowPayload: object,
 *   sourceMtimeMs: number,
 *   sourceSize: number,
 * }} row
 * @returns {void}
 */
export function upsertCharacterIndexEntry(userRoot, avatar, row) {
    const db = openCharacterIndexDatabase(userRoot);
    if (!db) {
        return;
    }
    try {
        db.prepare(`
            INSERT INTO characters (
                avatar,
                full_json,
                shallow_json,
                source_mtime_ms,
                source_size,
                source_world_name,
                source_world_mtime_ms,
                source_world_size,
                chat_stats_dirty
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
            ON CONFLICT(avatar) DO UPDATE SET
                full_json = excluded.full_json,
                shallow_json = excluded.shallow_json,
                source_mtime_ms = excluded.source_mtime_ms,
                source_size = excluded.source_size,
                source_world_name = excluded.source_world_name,
                source_world_mtime_ms = excluded.source_world_mtime_ms,
                source_world_size = excluded.source_world_size,
                chat_stats_dirty = 0
        `).run(
            avatar,
            JSON.stringify(row.fullPayload),
            JSON.stringify(row.shallowPayload),
            row.sourceMtimeMs,
            row.sourceSize,
            row.sourceWorldName ?? '',
            row.sourceWorldMtimeMs ?? -1,
            row.sourceWorldSize ?? -1,
        );
    } catch (error) {
        resetCharacterIndexDatabase(userRoot);
        throw error;
    }
}

/**
 * @param {{
 *   userRoot: string,
 *   directories: { characters: string, chats?: string },
 *   avatarFiles: string[],
 *   useShallowPayload: boolean,
 *   buildRow: (avatar: string, directories: { characters: string, chats?: string }) => Promise<{
 *     avatar: string,
 *     fullPayload: object,
 *     shallowPayload: object,
 *     sourceMtimeMs: number,
 *     sourceSize: number,
 *   }>,
 * }} options
 * @returns {Promise<object[]>}
 */
export async function listIndexedCharacterPayloads({
    userRoot,
    directories,
    avatarFiles,
    useShallowPayload,
    buildRow,
}) {
    const db = openCharacterIndexDatabase(userRoot);
    if (!db) {
        return [];
    }
    const payloadColumn = useShallowPayload ? 'shallow_json' : 'full_json';
    try {
        const existingRows = new Map(
            db.prepare('SELECT avatar, source_mtime_ms, source_size, chat_stats_dirty FROM characters').all()
                .map(row => [row.avatar, row]),
        );
        const avatarSet = new Set(avatarFiles);
        const avatarsToRefresh = [];
        const avatarsToRefreshChatStats = [];

        for (const avatar of avatarFiles) {
            const filePath = path.join(directories.characters, avatar);
            let stat;

            try {
                stat = fs.statSync(filePath);
            } catch (error) {
                if (error?.code === 'ENOENT') {
                    try {
                        deleteCharacterIndexEntry(userRoot, avatar);
                    } catch (deleteError) {
                        console.warn(`Character index delete skipped for missing avatar ${avatar}:`, deleteError);
                    }
                }
                console.warn(`Character index refresh skipped for ${avatar}:`, error);
                continue;
            }

            const existingRow = existingRows.get(avatar);
            if (!existingRow
                || Number(existingRow.source_mtime_ms) !== Number(stat.mtimeMs)
                || Number(existingRow.source_size) !== Number(stat.size)) {
                avatarsToRefresh.push(avatar);
                continue;
            }

            if (Number(existingRow.chat_stats_dirty) === 1) {
                avatarsToRefreshChatStats.push(avatar);
            }
        }

        for (let index = 0; index < avatarsToRefreshChatStats.length; index += ROW_REFRESH_CONCURRENCY) {
            const batch = avatarsToRefreshChatStats.slice(index, index + ROW_REFRESH_CONCURRENCY);
            const results = await Promise.allSettled(batch.map(async (avatar) => {
                refreshCharacterChatStatsRow(userRoot, directories, avatar);
            }));

            for (let i = 0; i < results.length; i++) {
                if (results[i].status === 'rejected') {
                    console.warn(`Character index chat-stat refresh skipped for ${batch[i]}:`, results[i].reason);
                }
            }
        }

        for (let index = 0; index < avatarsToRefresh.length; index += ROW_REFRESH_CONCURRENCY) {
            const batch = avatarsToRefresh.slice(index, index + ROW_REFRESH_CONCURRENCY);
            const results = await Promise.allSettled(batch.map(async (avatar) => {
                const row = await buildRow(avatar, directories);
                upsertCharacterIndexEntry(userRoot, avatar, row);
            }));

            for (let i = 0; i < results.length; i++) {
                if (results[i].status === 'rejected') {
                    console.warn(`Character index refresh skipped for ${batch[i]}:`, results[i].reason);
                }
            }
        }

        for (const avatar of existingRows.keys()) {
            if (!avatarSet.has(avatar)) {
                deleteCharacterIndexEntry(userRoot, avatar);
            }
        }

        const rows = db.prepare(`SELECT avatar, ${payloadColumn} AS payload FROM characters`).all();
        rows.sort((left, right) => CHARACTER_AVATAR_COLLATOR.compare(left.avatar, right.avatar));

        const payloads = [];
        for (const row of rows) {
            try {
                payloads.push(JSON.parse(row.payload));
            } catch (error) {
                console.warn(`Character index payload skipped for ${row.avatar}:`, error);
                try {
                    deleteCharacterIndexEntry(userRoot, row.avatar);
                } catch (deleteError) {
                    console.warn(`Character index cleanup skipped for ${row.avatar}:`, deleteError);
                }
            }
        }

        return payloads;
    } catch (error) {
        resetCharacterIndexDatabase(userRoot);
        throw error;
    }
}
