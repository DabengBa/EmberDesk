import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, test } from '@jest/globals';

import {
    deleteCharacterIndexEntry,
    disposeCharacterIndexDatabases,
    getCharacterIndexPath,
    listIndexedCharacterPayloads,
    markCharacterChatStatsDirty,
} from '../src/endpoints/character-index.js';
import { removeCharactersFromState } from '../public/scripts/character-list-state.js';

/**
 * @param {string} prefix
 * @returns {{root: string, characters: string, chats: string}}
 */
function makeDirectories(prefix) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    const characters = path.join(root, 'characters');
    const chats = path.join(root, 'chats');
    fs.mkdirSync(characters, { recursive: true });
    fs.mkdirSync(chats, { recursive: true });
    return { root, characters, chats };
}

/**
 * @param {{characters: string}} directories
 * @param {string} avatar
 * @param {string} [contents]
 */
function writeAvatarFile(directories, avatar, contents = 'avatar') {
    fs.writeFileSync(path.join(directories.characters, avatar), contents, 'utf8');
}

/**
 * @param {string} root
 * @param {string} avatar
 * @param {string} fileName
 * @param {string} contents
 */
function writeChatFile(root, avatar, fileName, contents) {
    const chatDirectory = path.join(root, 'chats', path.parse(avatar).name);
    fs.mkdirSync(chatDirectory, { recursive: true });
    fs.writeFileSync(path.join(chatDirectory, fileName), contents, 'utf8');
}

/**
 * @param {string} name
 * @returns {string}
 */
function toIsoDate(name) {
    return `2026-05-09T00:00:00.000Z#${name}`;
}

/**
 * @param {string[]} buildLog
 * @param {{fullNamePrefix?: string, shallowNamePrefix?: string}} [options]
 * @returns {(avatar: string, directories: {characters: string}) => Promise<{avatar: string, fullPayload: object, shallowPayload: object, sourceMtimeMs: number, sourceSize: number}>}
 */
function createBuildRow(buildLog, options = {}) {
    const fullNamePrefix = options.fullNamePrefix ?? 'Full';
    const shallowNamePrefix = options.shallowNamePrefix ?? 'Shallow';

    return async (avatar, directories) => {
        buildLog.push(avatar);

        const filePath = path.join(directories.characters, avatar);
        const stat = fs.statSync(filePath);
        const baseName = path.parse(avatar).name;

        const fullPayload = {
            name: `${fullNamePrefix} ${baseName}`,
            description: `Description ${baseName}`,
            personality: `Personality ${baseName}`,
            first_mes: `First ${baseName}`,
            scenario: `Scenario ${baseName}`,
            mes_example: `Example ${baseName}`,
            creatorcomment: `Creator notes ${baseName}`,
            talkativeness: 0.5,
            avatar,
            chat: `${baseName} - chat`,
            fav: false,
            tags: [],
            json_data: `json:${baseName}`,
            date_added: 1,
            create_date: toIsoDate(baseName),
            date_last_chat: stat.mtimeMs,
            chat_size: stat.size,
            data_size: stat.size,
            data: {
                name: `${fullNamePrefix} ${baseName}`,
                character_version: '2.0',
                creator: 'tester',
                creator_notes: `Creator notes ${baseName}`,
                tags: [],
                extensions: {
                    fav: false,
                    world: '',
                },
            },
        };

        const shallowPayload = {
            shallow: true,
            name: `${shallowNamePrefix} ${baseName}`,
            avatar,
            chat: `${baseName} - chat`,
            fav: false,
            date_added: 1,
            create_date: toIsoDate(baseName),
            date_last_chat: stat.mtimeMs,
            chat_size: stat.size,
            data_size: stat.size,
            tags: [],
            data: {
                name: `${shallowNamePrefix} ${baseName}`,
                character_version: '2.0',
                creator: 'tester',
                creator_notes: `Creator notes ${baseName}`,
                tags: [],
                extensions: {
                    fav: false,
                    world: '',
                },
            },
        };

        return {
            avatar,
            fullPayload,
            shallowPayload,
            sourceMtimeMs: stat.mtimeMs,
            sourceSize: stat.size,
        };
    };
}

/**
 * @param {string} userRoot
 * @returns {Promise<import('node:sqlite').DatabaseSync>}
 */
async function openRawIndexDatabase(userRoot) {
    const { DatabaseSync } = await import('node:sqlite');
    return new DatabaseSync(getCharacterIndexPath(userRoot));
}

const tempRoots = [];

afterEach(() => {
    disposeCharacterIndexDatabases();

    for (const root of tempRoots.splice(0, tempRoots.length)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

describe('character index', () => {
    test('rebuilds a missing index and serves both full and shallow payload modes from the same rows', async () => {
        const directories = makeDirectories('emberdesk-character-index-');
        tempRoots.push(directories.root);
        writeAvatarFile(directories, 'alpha.png', 'alpha');
        writeAvatarFile(directories, 'beta.png', 'beta');

        const buildLog = [];
        const buildRow = createBuildRow(buildLog);
        const avatarFiles = ['alpha.png', 'beta.png'];

        const fullRows = await listIndexedCharacterPayloads({
            userRoot: directories.root,
            directories,
            avatarFiles,
            useShallowPayload: false,
            buildRow,
        });

        expect(fs.existsSync(getCharacterIndexPath(directories.root))).toBe(true);
        expect(buildLog).toEqual(['alpha.png', 'beta.png']);
        expect(fullRows.map(row => row.avatar)).toEqual(avatarFiles);
        expect(fullRows[0]).toEqual(expect.objectContaining({
            avatar: 'alpha.png',
            json_data: 'json:alpha',
        }));
        expect(fullRows[0].shallow).toBeUndefined();

        const shallowRows = await listIndexedCharacterPayloads({
            userRoot: directories.root,
            directories,
            avatarFiles,
            useShallowPayload: true,
            buildRow,
        });

        expect(buildLog).toEqual(['alpha.png', 'beta.png']);
        expect(shallowRows[0]).toEqual(expect.objectContaining({
            avatar: 'alpha.png',
            shallow: true,
            name: 'Shallow alpha',
        }));
    });

    test('rebuilds only dirty rows on the next list read after chat-stat invalidation', async () => {
        const directories = makeDirectories('emberdesk-character-index-');
        tempRoots.push(directories.root);
        writeAvatarFile(directories, 'alpha.png', 'alpha');
        writeAvatarFile(directories, 'beta.png', 'beta');
        writeChatFile(directories.root, 'alpha.png', 'alpha.jsonl', 'hello');
        writeChatFile(directories.root, 'beta.png', 'beta.jsonl', 'hello');

        const avatarFiles = ['alpha.png', 'beta.png'];
        await listIndexedCharacterPayloads({
            userRoot: directories.root,
            directories,
            avatarFiles,
            useShallowPayload: false,
            buildRow: createBuildRow([]),
        });

        markCharacterChatStatsDirty(directories.root, 'beta.png');

        const refreshLog = [];
        const refreshedRows = await listIndexedCharacterPayloads({
            userRoot: directories.root,
            directories,
            avatarFiles,
            useShallowPayload: false,
            buildRow: createBuildRow(refreshLog, { fullNamePrefix: 'Refreshed', shallowNamePrefix: 'Refreshed' }),
        });

        expect(refreshLog).toEqual([]);
        expect(refreshedRows.find(row => row.avatar === 'beta.png')).toEqual(expect.objectContaining({
            name: 'Full beta',
            chat_size: 5,
        }));
    });

    test('skips a corrupt cached row instead of failing the whole character list', async () => {
        const directories = makeDirectories('emberdesk-character-index-');
        tempRoots.push(directories.root);
        writeAvatarFile(directories, 'alpha.png', 'alpha');
        writeAvatarFile(directories, 'beta.png', 'beta');

        const avatarFiles = ['alpha.png', 'beta.png'];
        await listIndexedCharacterPayloads({
            userRoot: directories.root,
            directories,
            avatarFiles,
            useShallowPayload: false,
            buildRow: createBuildRow([]),
        });

        const database = await openRawIndexDatabase(directories.root);
        try {
            database.prepare('UPDATE characters SET full_json = ? WHERE avatar = ?').run('not-json', 'beta.png');
        } finally {
            database.close();
        }

        const rows = await listIndexedCharacterPayloads({
            userRoot: directories.root,
            directories,
            avatarFiles,
            useShallowPayload: false,
            buildRow: createBuildRow([]),
        });

        expect(rows.map(row => row.avatar)).toEqual(['alpha.png']);

        const verificationDb = await openRawIndexDatabase(directories.root);
        try {
            expect(verificationDb.prepare('SELECT avatar FROM characters WHERE avatar = ?').get('beta.png')).toBeUndefined();
        } finally {
            verificationDb.close();
        }
    });

    test('drops an index row when the avatar disappears between directory scan and stat', async () => {
        const directories = makeDirectories('emberdesk-character-index-');
        tempRoots.push(directories.root);
        writeAvatarFile(directories, 'alpha.png', 'alpha');
        writeAvatarFile(directories, 'beta.png', 'beta');

        await listIndexedCharacterPayloads({
            userRoot: directories.root,
            directories,
            avatarFiles: ['alpha.png', 'beta.png'],
            useShallowPayload: false,
            buildRow: createBuildRow([]),
        });

        fs.unlinkSync(path.join(directories.characters, 'beta.png'));

        const rows = await listIndexedCharacterPayloads({
            userRoot: directories.root,
            directories,
            avatarFiles: ['alpha.png', 'beta.png'],
            useShallowPayload: false,
            buildRow: createBuildRow([]),
        });

        expect(rows.map(row => row.avatar)).toEqual(['alpha.png']);
    });

    test('resets a broken cached database so the next request can rebuild it', async () => {
        const directories = makeDirectories('emberdesk-character-index-');
        tempRoots.push(directories.root);
        writeAvatarFile(directories, 'alpha.png', 'alpha');

        await listIndexedCharacterPayloads({
            userRoot: directories.root,
            directories,
            avatarFiles: ['alpha.png'],
            useShallowPayload: false,
            buildRow: createBuildRow([]),
        });

        const database = await openRawIndexDatabase(directories.root);
        try {
            database.exec('DROP TABLE characters;');
        } finally {
            database.close();
        }

        await expect(listIndexedCharacterPayloads({
            userRoot: directories.root,
            directories,
            avatarFiles: ['alpha.png'],
            useShallowPayload: false,
            buildRow: createBuildRow([]),
        })).rejects.toThrow();

        const rows = await listIndexedCharacterPayloads({
            userRoot: directories.root,
            directories,
            avatarFiles: ['alpha.png'],
            useShallowPayload: false,
            buildRow: createBuildRow([]),
        });

        expect(rows).toHaveLength(1);
        expect(rows[0]).toEqual(expect.objectContaining({
            avatar: 'alpha.png',
        }));
    });

    test('refreshes a row when the source character file stat changes', async () => {
        const directories = makeDirectories('emberdesk-character-index-');
        tempRoots.push(directories.root);
        writeAvatarFile(directories, 'alpha.png', 'alpha');

        const avatarFiles = ['alpha.png'];
        await listIndexedCharacterPayloads({
            userRoot: directories.root,
            directories,
            avatarFiles,
            useShallowPayload: false,
            buildRow: createBuildRow([]),
        });

        writeAvatarFile(directories, 'alpha.png', 'alpha-changed');

        const refreshLog = [];
        const refreshedRows = await listIndexedCharacterPayloads({
            userRoot: directories.root,
            directories,
            avatarFiles,
            useShallowPayload: false,
            buildRow: createBuildRow(refreshLog, { fullNamePrefix: 'Changed', shallowNamePrefix: 'Changed' }),
        });

        expect(refreshLog).toEqual(['alpha.png']);
        expect(refreshedRows[0]).toEqual(expect.objectContaining({
            name: 'Changed alpha',
        }));
    });

    test('removes a deleted row from the index', async () => {
        const directories = makeDirectories('emberdesk-character-index-');
        tempRoots.push(directories.root);
        writeAvatarFile(directories, 'alpha.png', 'alpha');

        await listIndexedCharacterPayloads({
            userRoot: directories.root,
            directories,
            avatarFiles: ['alpha.png'],
            useShallowPayload: false,
            buildRow: createBuildRow([]),
        });

        deleteCharacterIndexEntry(directories.root, 'alpha.png');

        const rows = await listIndexedCharacterPayloads({
            userRoot: directories.root,
            directories,
            avatarFiles: [],
            useShallowPayload: false,
            buildRow: createBuildRow([]),
        });

        expect(rows).toEqual([]);
    });

    test('removes deleted character avatars locally without rebuilding the array', () => {
        const characters = [
            { avatar: 'alpha.png', name: 'Alpha' },
            { avatar: 'beta.png', name: 'Beta' },
            { avatar: 'gamma.png', name: 'Gamma' },
        ];

        const removed = removeCharactersFromState(characters, ['beta.png', 'missing.png']);

        expect(removed).toEqual([
            { avatar: 'beta.png', name: 'Beta' },
        ]);
        expect(characters).toEqual([
            { avatar: 'alpha.png', name: 'Alpha' },
            { avatar: 'gamma.png', name: 'Gamma' },
        ]);
    });
});
