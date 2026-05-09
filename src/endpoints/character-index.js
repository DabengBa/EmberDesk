import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
let DatabaseSync;

try {
    ({ DatabaseSync } = require('node:sqlite'));
} catch {
    DatabaseSync = undefined;
}

const SCHEMA_VERSION = 1;
const DATABASES = new Map();

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
            chat_stats_dirty INTEGER NOT NULL DEFAULT 0
        );
    `);

    const currentVersion = db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get()?.value;
    if (Number(currentVersion) !== SCHEMA_VERSION) {
        db.prepare('DELETE FROM characters').run();
        db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)`).run(String(SCHEMA_VERSION));
    }

    DATABASES.set(userRoot, db);
    return db;
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
    db.prepare('UPDATE characters SET chat_stats_dirty = 1 WHERE avatar = ?').run(avatar);
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
    db.prepare('DELETE FROM characters WHERE avatar = ?').run(avatar);
}

/**
 * @returns {void}
 */
export function disposeCharacterIndexDatabases() {
    for (const db of DATABASES.values()) {
        db.close();
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
    db.prepare(`
        INSERT INTO characters (
            avatar,
            full_json,
            shallow_json,
            source_mtime_ms,
            source_size,
            chat_stats_dirty
        ) VALUES (?, ?, ?, ?, ?, 0)
        ON CONFLICT(avatar) DO UPDATE SET
            full_json = excluded.full_json,
            shallow_json = excluded.shallow_json,
            source_mtime_ms = excluded.source_mtime_ms,
            source_size = excluded.source_size,
            chat_stats_dirty = 0
    `).run(
        avatar,
        JSON.stringify(row.fullPayload),
        JSON.stringify(row.shallowPayload),
        row.sourceMtimeMs,
        row.sourceSize,
    );
}

/**
 * @param {{
 *   userRoot: string,
 *   directories: { characters: string },
 *   avatarFiles: string[],
 *   useShallowPayload: boolean,
 *   buildRow: (avatar: string, directories: { characters: string }) => Promise<{
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
    const existingRows = new Map(
        db.prepare('SELECT avatar, source_mtime_ms, source_size, chat_stats_dirty, full_json, shallow_json FROM characters').all()
            .map(row => [row.avatar, row]),
    );
    const avatarSet = new Set(avatarFiles);

    for (const avatar of avatarFiles) {
        const filePath = path.join(directories.characters, avatar);
        const stat = fs.statSync(filePath);
        const existingRow = existingRows.get(avatar);
        const needsRefresh = !existingRow
            || Number(existingRow.source_mtime_ms) !== Number(stat.mtimeMs)
            || Number(existingRow.source_size) !== Number(stat.size)
            || Number(existingRow.chat_stats_dirty) === 1;

        if (!needsRefresh) {
            continue;
        }

        const row = await buildRow(avatar, directories);
        upsertCharacterIndexEntry(userRoot, avatar, row);
    }

    for (const avatar of existingRows.keys()) {
        if (!avatarSet.has(avatar)) {
            deleteCharacterIndexEntry(userRoot, avatar);
        }
    }

    const payloadColumn = useShallowPayload ? 'shallow_json' : 'full_json';
    const rows = db.prepare(`SELECT avatar, ${payloadColumn} AS payload FROM characters ORDER BY avatar COLLATE NOCASE ASC`).all();
    return rows.map(row => JSON.parse(row.payload));
}
