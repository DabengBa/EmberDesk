import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, afterEach, beforeAll, describe, expect, jest, test } from '@jest/globals';
import extract from 'png-chunks-extract';
import PNGtext from 'png-chunk-text';
import sanitize from 'sanitize-filename';

import {
    deleteCharacterIndexEntry,
    disposeCharacterIndexDatabases,
    getFreshIndexedCharacterFullPayload,
    getCharacterIndexPath,
    isCharacterIndexSupported,
    listIndexedCharacterPayloads,
    markCharacterChatStatsDirty,
} from '../src/endpoints/character-index.js';
import { write as writeCharacterCardPngData } from '../src/character-card-parser.js';
import encodePngChunks from '../src/png/encode.js';
import { setConfigFilePath } from '../src/util.js';
import { removeCharactersFromState } from '../public/scripts/character-list-state.js';

/**
 * @param {string} prefix
 * @returns {{root: string, characters: string, chats: string}}
 */
function makeDirectories(prefix) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    const characters = path.join(root, 'characters');
    const chats = path.join(root, 'chats');
    const worlds = path.join(root, 'worlds');
    fs.mkdirSync(characters, { recursive: true });
    fs.mkdirSync(chats, { recursive: true });
    fs.mkdirSync(worlds, { recursive: true });
    return { root, characters, chats, worlds };
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
 * @param {{characters: string}} directories
 * @param {string} avatar
 * @param {string} name
 */
function writeCharacterCardFile(directories, avatar, name) {
    const payload = JSON.stringify({
        spec: 'chara_card_v2',
        spec_version: '2.0',
        data: {
            name,
            description: `Description ${name}`,
            personality: `Personality ${name}`,
            scenario: `Scenario ${name}`,
            first_mes: `First ${name}`,
            mes_example: `Example ${name}`,
            creator_notes: `Creator notes ${name}`,
            tags: [],
            creator: 'tester',
            character_version: '2.0',
            extensions: {
                talkativeness: 0.5,
                fav: false,
                world: '',
            },
        },
    });
    const pngBuffer = writeCharacterCardPngData(DEFAULT_AVATAR_BUFFER, payload);
    fs.writeFileSync(path.join(directories.characters, avatar), pngBuffer);
}

/**
 * @param {{characters: string}} directories
 * @param {string} avatar
 * @param {string} name
 * @param {string} world
 */
function writeLegacyCharacterCardFile(directories, avatar, name, world) {
    const payload = JSON.stringify({
        name,
        description: `Description ${name}`,
        personality: `Personality ${name}`,
        scenario: `Scenario ${name}`,
        first_mes: `First ${name}`,
        mes_example: `Example ${name}`,
        creatorcomment: `Creator notes ${name}`,
        talkativeness: 0.5,
        fav: false,
        tags: [],
        world,
    });
    const pngBuffer = writeCharacterCardPngData(DEFAULT_AVATAR_BUFFER, payload);
    const chunks = extract(new Uint8Array(pngBuffer));
    const v1Chunks = chunks.filter((chunk) => {
        if (chunk.name !== 'tEXt') {
            return true;
        }
        const decoded = PNGtext.decode(chunk.data);
        return decoded.keyword.toLowerCase() !== 'ccv3';
    });
    fs.writeFileSync(path.join(directories.characters, avatar), Buffer.from(encodePngChunks(v1Chunks)));
}

/**
 * @param {{worlds: string}} directories
 * @param {string} worldName
 * @param {object} data
 */
function writeWorldInfoFile(directories, worldName, data) {
    fs.writeFileSync(path.join(directories.worlds, `${worldName}.json`), JSON.stringify(data, null, 4));
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

/**
 * @param {number} [statusCode]
 * @returns {{
 *   statusCode: number,
 *   body: any,
 *   send: (payload: any) => any,
 *   sendStatus: (code: number) => any,
 *   status: (code: number) => any,
 * }}
 */
function createMockResponse(statusCode = 200) {
    return {
        statusCode,
        body: undefined,
        headers: {},
        send(payload) {
            this.body = payload;
            return this;
        },
        sendStatus(code) {
            this.statusCode = code;
            return this;
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
        set(field, value) {
            this.headers[String(field).toLowerCase()] = value;
            return this;
        },
    };
}

test('frontend getCharacters implementation uses /api/characters/all to preserve eager payload mode', () => {
    const scriptSource = fs.readFileSync(path.join(process.cwd(), 'public', 'script.js'), 'utf8');
    const getCharactersStart = scriptSource.indexOf('export async function getCharacters()');

    expect(getCharactersStart).toBeGreaterThanOrEqual(0);

    const getCharactersBody = scriptSource.slice(getCharactersStart, getCharactersStart + 800);
    expect(getCharactersBody).toContain("fetch('/api/characters/all'");
    expect(getCharactersBody).not.toContain("fetch('/api/characters/list'");
});

/**
 * @returns {(request: any, response: any) => Promise<void>}
 */
function getCharacterRouteHandler() {
    const layer = charactersRouter.stack.find(entry => entry.route?.path === '/get');
    if (!layer?.route?.stack?.length) {
        throw new Error('Could not locate /api/characters/get route handler');
    }

    return layer.route.stack[layer.route.stack.length - 1].handle;
}

/**
 * @returns {(request: any, response: any) => Promise<void>}
 */
function getCharactersAllRouteHandler() {
    const layer = charactersRouter.stack.find(entry => entry.route?.path === '/all');
    if (!layer?.route?.stack?.length) {
        throw new Error('Could not locate /api/characters/all route handler');
    }

    return layer.route.stack[layer.route.stack.length - 1].handle;
}

/**
 * @returns {(request: any, response: any) => Promise<void>}
 */
function getCharactersListRouteHandler() {
    const layer = charactersRouter.stack.find(entry => entry.route?.path === '/list');
    if (!layer?.route?.stack?.length) {
        throw new Error('Could not locate /api/characters/list route handler');
    }

    return layer.route.stack[layer.route.stack.length - 1].handle;
}

/**
 * @param {{ root: string, characters: string, chats: string }} directories
 * @param {string} avatar
 * @returns {Promise<ReturnType<typeof createMockResponse>>}
 */
async function invokeCharacterGet(directories, avatar) {
    const handler = getCharacterRouteHandler();
    const request = {
        body: { avatar_url: avatar },
        user: { directories },
    };
    const response = createMockResponse();
    await handler(request, response);
    return response;
}

/**
 * @param {{ root: string, characters: string, chats: string }} directories
 * @returns {Promise<ReturnType<typeof createMockResponse>>}
 */
async function invokeCharactersList(directories) {
    const handler = getCharactersListRouteHandler();
    const request = {
        user: { directories },
    };
    const response = createMockResponse();
    await handler(request, response);
    return response;
}

/**
 * @param {{ root: string, characters: string, chats: string }} directories
 * @returns {Promise<ReturnType<typeof createMockResponse>>}
 */
async function invokeCharactersAll(directories) {
    const handler = getCharactersAllRouteHandler();
    const request = {
        user: { directories },
    };
    const response = createMockResponse();
    await handler(request, response);
    return response;
}

const tempRoots = [];
let sharedDataRoot = '';
const DEFAULT_AVATAR_BUFFER = fs.readFileSync(new URL('../public/img/ai4.png', import.meta.url));
const sharedGlobal = global;
let diskCache;
let charactersRouter;

beforeAll(async () => {
    sharedDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-character-route-cache-'));
    sharedGlobal.DATA_ROOT = sharedDataRoot;
    setConfigFilePath(fileURLToPath(new URL('../default/config.yaml', import.meta.url)));
    ({ diskCache, router: charactersRouter } = await import('../src/endpoints/characters.js'));
});

afterEach(() => {
    disposeCharacterIndexDatabases();
    diskCache?.dispose();
    delete process.env.EMBERDESK_CHARACTER_INDEX_MODE;
    delete process.env.EMBERDESK_INTERACTION_PERF_MODE;

    for (const root of tempRoots.splice(0, tempRoots.length)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

afterAll(() => {
    if (sharedDataRoot) {
        fs.rmSync(sharedDataRoot, { recursive: true, force: true });
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

    test('serves /api/characters/get from a fresh indexed full payload without reparsing the avatar file', async () => {
        const directories = makeDirectories('emberdesk-character-index-route-');
        tempRoots.push(directories.root);
        writeAvatarFile(directories, 'alpha.png', 'not-a-real-png');

        await listIndexedCharacterPayloads({
            userRoot: directories.root,
            directories,
            avatarFiles: ['alpha.png'],
            useShallowPayload: false,
            buildRow: createBuildRow([]),
        });

        const response = await invokeCharacterGet(directories, 'alpha.png');

        expect(response.statusCode).toBe(200);
        expect(response.body).toEqual(expect.objectContaining({
            avatar: 'alpha.png',
            name: 'Full alpha',
            json_data: 'json:alpha',
        }));
    });

    test('refreshes dirty chat stats before serving /api/characters/get from a fresh indexed row', async () => {
        const directories = makeDirectories('emberdesk-character-index-route-');
        tempRoots.push(directories.root);
        writeAvatarFile(directories, 'alpha.png', 'not-a-real-png');

        await listIndexedCharacterPayloads({
            userRoot: directories.root,
            directories,
            avatarFiles: ['alpha.png'],
            useShallowPayload: false,
            buildRow: createBuildRow([]),
        });

        writeChatFile(directories.root, 'alpha.png', 'alpha.jsonl', 'hello');
        markCharacterChatStatsDirty(directories.root, 'alpha.png');

        const response = await invokeCharacterGet(directories, 'alpha.png');

        expect(response.statusCode).toBe(200);
        expect(response.body).toEqual(expect.objectContaining({
            avatar: 'alpha.png',
            name: 'Full alpha',
            chat_size: 5,
        }));
    });

    test('recomputes chat stats before serving /api/characters/get after out-of-band chat cleanup', async () => {
        const directories = makeDirectories('emberdesk-character-index-route-');
        tempRoots.push(directories.root);
        writeAvatarFile(directories, 'alpha.png', 'not-a-real-png');
        writeChatFile(directories.root, 'alpha.png', 'alpha.jsonl', 'hello');

        await listIndexedCharacterPayloads({
            userRoot: directories.root,
            directories,
            avatarFiles: ['alpha.png'],
            useShallowPayload: false,
            buildRow: createBuildRow([]),
        });

        fs.rmSync(path.join(directories.chats, 'alpha'), { recursive: true, force: true });

        const response = await invokeCharacterGet(directories, 'alpha.png');

        expect(response.statusCode).toBe(200);
        expect(response.body).toEqual(expect.objectContaining({
            avatar: 'alpha.png',
            name: 'Full alpha',
            chat_size: 0,
            date_last_chat: 0,
        }));

        const database = await openRawIndexDatabase(directories.root);
        try {
            const row = database.prepare('SELECT full_json FROM characters WHERE avatar = ?').get('alpha.png');
            expect(JSON.parse(row.full_json)).toEqual(expect.objectContaining({
                chat_size: 0,
                date_last_chat: 0,
            }));
        } finally {
            database.close();
        }
    });

    test('falls back to file-backed rebuild for /api/characters/get when the indexed row is stale', async () => {
        const directories = makeDirectories('emberdesk-character-index-route-');
        tempRoots.push(directories.root);
        writeAvatarFile(directories, 'alpha.png', 'stale-row-seed');

        await listIndexedCharacterPayloads({
            userRoot: directories.root,
            directories,
            avatarFiles: ['alpha.png'],
            useShallowPayload: false,
            buildRow: createBuildRow([]),
        });

        writeCharacterCardFile(directories, 'alpha.png', 'Alpha Live');

        const response = await invokeCharacterGet(directories, 'alpha.png');

        expect(response.statusCode).toBe(200);
        expect(response.body).toEqual(expect.objectContaining({
            avatar: 'alpha.png',
            name: 'Alpha Live',
        }));
        expect(response.body.json_data).toContain('"name":"Alpha Live"');

        const database = await openRawIndexDatabase(directories.root);
        try {
            const row = database.prepare('SELECT full_json FROM characters WHERE avatar = ?').get('alpha.png');
            expect(JSON.parse(row.full_json)).toEqual(expect.objectContaining({
                avatar: 'alpha.png',
                name: 'Alpha Live',
            }));
        } finally {
            database.close();
        }
    });

    test('falls back to file-backed rebuild for /api/characters/get when the indexed full payload is corrupt', async () => {
        const directories = makeDirectories('emberdesk-character-index-route-');
        tempRoots.push(directories.root);
        writeCharacterCardFile(directories, 'alpha.png', 'Alpha Live');

        await listIndexedCharacterPayloads({
            userRoot: directories.root,
            directories,
            avatarFiles: ['alpha.png'],
            useShallowPayload: false,
            buildRow: createBuildRow([]),
        });

        const database = await openRawIndexDatabase(directories.root);
        try {
            database.prepare('UPDATE characters SET full_json = ? WHERE avatar = ?').run('not-json', 'alpha.png');
        } finally {
            database.close();
        }

        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

        try {
            const response = await invokeCharacterGet(directories, 'alpha.png');

            expect(response.statusCode).toBe(200);
            expect(response.body).toEqual(expect.objectContaining({
                avatar: 'alpha.png',
                name: 'Alpha Live',
            }));

            const verificationDb = await openRawIndexDatabase(directories.root);
            try {
                const row = verificationDb.prepare('SELECT full_json FROM characters WHERE avatar = ?').get('alpha.png');
                expect(JSON.parse(row.full_json)).toEqual(expect.objectContaining({
                    avatar: 'alpha.png',
                    name: 'Alpha Live',
                }));
            } finally {
                verificationDb.close();
            }
        } finally {
            warnSpy.mockRestore();
        }
    });

    test('rebuilds legacy world-linked cards when the referenced world info file changes', async () => {
        const directories = makeDirectories('emberdesk-character-index-route-');
        tempRoots.push(directories.root);
        writeLegacyCharacterCardFile(directories, 'legacy.png', 'Legacy Hero', 'lorebook');
        writeWorldInfoFile(directories, 'lorebook', {
            entries: {
                1: {
                    uid: 1,
                    key: 'first',
                    content: 'old lore',
                    order: 0,
                    position: 0,
                    disable: false,
                    selective: false,
                },
            },
        });

        const initialResponse = await invokeCharacterGet(directories, 'legacy.png');
        expect(initialResponse.statusCode).toBe(200);
        expect(initialResponse.body.data.character_book.entries[0].content).toBe('old lore');

        writeWorldInfoFile(directories, 'lorebook', {
            entries: {
                1: {
                    uid: 1,
                    key: 'first',
                    content: 'new lore',
                    order: 0,
                    position: 0,
                    disable: false,
                    selective: false,
                },
            },
        });

        const refreshedResponse = await invokeCharacterGet(directories, 'legacy.png');

        expect(refreshedResponse.statusCode).toBe(200);
        expect(refreshedResponse.body.data.character_book.entries[0].content).toBe('new lore');
    });

    test('rebuilds indexed /api/characters/all full rows when legacy world info changes', async () => {
        const directories = makeDirectories('emberdesk-character-index-route-');
        tempRoots.push(directories.root);
        writeLegacyCharacterCardFile(directories, 'legacy.png', 'Legacy Hero', 'lorebook');
        writeWorldInfoFile(directories, 'lorebook', {
            entries: {
                1: {
                    uid: 1,
                    key: 'first',
                    content: 'old lore',
                    order: 0,
                    position: 0,
                    disable: false,
                    selective: false,
                },
            },
        });

        const initialResponse = await invokeCharactersAll(directories);
        expect(initialResponse.statusCode).toBe(200);
        expect(initialResponse.body[0].data.character_book.entries[0].content).toBe('old lore');

        writeWorldInfoFile(directories, 'lorebook', {
            entries: {
                1: {
                    uid: 1,
                    key: 'first',
                    content: 'new lore',
                    order: 0,
                    position: 0,
                    disable: false,
                    selective: false,
                },
            },
        });

        const refreshedResponse = await invokeCharactersAll(directories);

        expect(refreshedResponse.statusCode).toBe(200);
        expect(refreshedResponse.body[0].data.character_book.entries[0].content).toBe('new lore');
    });

    test('stores sanitized world names in the index for legacy world-linked cards', async () => {
        const directories = makeDirectories('emberdesk-character-index-route-');
        tempRoots.push(directories.root);
        const rawWorldName = '../lorebook';
        const sanitizedWorldName = sanitize(rawWorldName);

        writeLegacyCharacterCardFile(directories, 'legacy.png', 'Legacy Hero', rawWorldName);
        writeWorldInfoFile(directories, sanitizedWorldName, {
            entries: {
                1: {
                    uid: 1,
                    key: 'first',
                    content: 'safe lore',
                    order: 0,
                    position: 0,
                    disable: false,
                    selective: false,
                },
            },
        });

        const response = await invokeCharacterGet(directories, 'legacy.png');
        expect(response.statusCode).toBe(200);
        expect(response.body.data.character_book.entries[0].content).toBe('safe lore');

        const database = await openRawIndexDatabase(directories.root);
        try {
            const row = database.prepare('SELECT source_world_name FROM characters WHERE avatar = ?').get('legacy.png');
            expect(row.source_world_name).toBe(sanitizedWorldName);
            expect(row.source_world_name).not.toBe(rawWorldName);
        } finally {
            database.close();
        }
    });

    test('serves a cached legacy world-linked card after the referenced world info file is deleted and rebuilds when it reappears', async () => {
        const directories = makeDirectories('emberdesk-character-index-route-');
        tempRoots.push(directories.root);
        writeLegacyCharacterCardFile(directories, 'legacy.png', 'Legacy Hero', 'lorebook');
        writeWorldInfoFile(directories, 'lorebook', {
            entries: {
                1: {
                    uid: 1,
                    key: 'first',
                    content: 'old lore',
                    order: 0,
                    position: 0,
                    disable: false,
                    selective: false,
                },
            },
        });

        const initialResponse = await invokeCharacterGet(directories, 'legacy.png');
        expect(initialResponse.statusCode).toBe(200);
        expect(initialResponse.body.data.character_book.entries[0].content).toBe('old lore');

        fs.unlinkSync(path.join(directories.worlds, 'lorebook.json'));

        const deletedWorldResponse = await invokeCharacterGet(directories, 'legacy.png');
        expect(deletedWorldResponse.statusCode).toBe(200);
        expect(deletedWorldResponse.body.data.character_book).toBeUndefined();

        const cachedPayload = getFreshIndexedCharacterFullPayload(
            directories.root,
            directories,
            'legacy.png',
            fs.statSync(path.join(directories.characters, 'legacy.png')),
        );
        expect(cachedPayload).toEqual(expect.objectContaining({
            avatar: 'legacy.png',
            name: 'Legacy Hero',
        }));
        expect(cachedPayload.data.character_book).toBeUndefined();

        writeWorldInfoFile(directories, 'lorebook', {
            entries: {
                1: {
                    uid: 1,
                    key: 'first',
                    content: 'restored lore',
                    order: 0,
                    position: 0,
                    disable: false,
                    selective: false,
                },
            },
        });

        const restoredWorldResponse = await invokeCharacterGet(directories, 'legacy.png');
        expect(restoredWorldResponse.statusCode).toBe(200);
        expect(restoredWorldResponse.body.data.character_book.entries[0].content).toBe('restored lore');
    });

    test('resets a broken fast-path lookup after a non-SyntaxError index failure', async () => {
        const directories = makeDirectories('emberdesk-character-index-route-');
        tempRoots.push(directories.root);
        writeCharacterCardFile(directories, 'alpha.png', 'Alpha Live');

        const initialResponse = await invokeCharacterGet(directories, 'alpha.png');
        expect(initialResponse.statusCode).toBe(200);
        expect(initialResponse.body.name).toBe('Alpha Live');

        const database = await openRawIndexDatabase(directories.root);
        try {
            database.exec('ALTER TABLE characters RENAME TO characters_broken;');
        } finally {
            database.close();
        }

        const sourceStat = fs.statSync(path.join(directories.characters, 'alpha.png'));
        expect(() => getFreshIndexedCharacterFullPayload(
            directories.root,
            directories,
            'alpha.png',
            sourceStat,
        )).toThrow();

        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

        try {
            const fallbackResponse = await invokeCharacterGet(directories, 'alpha.png');
            expect(fallbackResponse.statusCode).toBe(200);
            expect(fallbackResponse.body).toEqual(expect.objectContaining({
                avatar: 'alpha.png',
                name: 'Alpha Live',
            }));
        } finally {
            warnSpy.mockRestore();
        }
    });

    test('stores current file metadata after /api/characters/get rebuilds a file that changes mid-request', async () => {
        const directories = makeDirectories('emberdesk-character-index-route-');
        tempRoots.push(directories.root);
        writeCharacterCardFile(directories, 'alpha.png', 'Alpha Before');

        const filePath = path.join(directories.characters, 'alpha.png');
        const originalStatSync = fs.statSync;
        let swappedFile = false;
        const statSpy = jest.spyOn(fs, 'statSync').mockImplementation((targetPath, ...args) => {
            const stat = originalStatSync.call(fs, targetPath, ...args);

            if (!swappedFile && targetPath === filePath) {
                swappedFile = true;
                writeCharacterCardFile(directories, 'alpha.png', 'Alpha After Much Longer');
            }

            return stat;
        });

        try {
            const response = await invokeCharacterGet(directories, 'alpha.png');

            expect(response.statusCode).toBe(200);
            expect(response.body).toEqual(expect.objectContaining({
                avatar: 'alpha.png',
                name: 'Alpha After Much Longer',
            }));
        } finally {
            statSpy.mockRestore();
        }

        const indexedPayload = getFreshIndexedCharacterFullPayload(
            directories.root,
            directories,
            'alpha.png',
            fs.statSync(filePath),
        );

        expect(indexedPayload).toEqual(expect.objectContaining({
            avatar: 'alpha.png',
            name: 'Alpha After Much Longer',
        }));
    });

    test('disables the SQLite fast path when EMBERDESK_CHARACTER_INDEX_MODE=force_off', async () => {
        const directories = makeDirectories('emberdesk-character-index-route-');
        tempRoots.push(directories.root);
        writeCharacterCardFile(directories, 'alpha.png', 'Alpha Live');

        await listIndexedCharacterPayloads({
            userRoot: directories.root,
            directories,
            avatarFiles: ['alpha.png'],
            useShallowPayload: false,
            buildRow: createBuildRow([]),
        });

        expect(isCharacterIndexSupported()).toBe(true);

        process.env.EMBERDESK_CHARACTER_INDEX_MODE = 'force_off';
        process.env.EMBERDESK_INTERACTION_PERF_MODE = '1';

        const response = await invokeCharacterGet(directories, 'alpha.png');

        expect(response.statusCode).toBe(200);
        expect(response.body).toEqual(expect.objectContaining({
            avatar: 'alpha.png',
            name: 'Alpha Live',
        }));
        expect(response.body.name).not.toBe('Full alpha');
        expect(response.headers['x-emberdesk-interaction-path']).toBe('characters_get:filesystem');
    });

    test('emits interaction perf metadata for /api/characters/all', async () => {
        const directories = makeDirectories('emberdesk-character-index-route-');
        tempRoots.push(directories.root);
        writeCharacterCardFile(directories, 'alpha.png', 'Alpha One');
        writeCharacterCardFile(directories, 'beta.png', 'Beta Two');
        process.env.EMBERDESK_INTERACTION_PERF_MODE = '1';

        const response = await invokeCharactersAll(directories);

        expect(response.statusCode).toBe(200);
        expect(response.headers['x-emberdesk-interaction-path']).toBeDefined();
        expect(response.headers['server-timing']).toContain('route;dur=');
    });

    test('serves a richer shallow summary from /api/characters/list without full-only fields', async () => {
        const directories = makeDirectories('emberdesk-character-index-route-');
        tempRoots.push(directories.root);
        writeCharacterCardFile(directories, 'alpha.png', 'Alpha One');

        const response = await invokeCharactersList(directories);

        expect(response.statusCode).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
        expect(response.body).toHaveLength(1);
        expect(response.body[0]).toEqual(expect.objectContaining({
            shallow: true,
            avatar: 'alpha.png',
            name: 'Alpha One',
            description: 'Description Alpha One',
            personality: 'Personality Alpha One',
            scenario: 'Scenario Alpha One',
            first_mes: 'First Alpha One',
            mes_example: 'Example Alpha One',
            data: expect.objectContaining({
                name: 'Alpha One',
                description: 'Description Alpha One',
                personality: 'Personality Alpha One',
                scenario: 'Scenario Alpha One',
                first_mes: 'First Alpha One',
                mes_example: 'Example Alpha One',
                creator_notes: 'Creator notes Alpha One',
                alternate_greetings: [],
                extensions: expect.objectContaining({
                    talkativeness: 0.5,
                }),
            }),
        }));
        expect(response.body[0].json_data).toBeUndefined();
        expect(response.body[0].data.character_book).toBeUndefined();
    });

    test('keeps /api/characters/all full payload behavior when lazy-load mode is disabled', async () => {
        const directories = makeDirectories('emberdesk-character-index-route-');
        tempRoots.push(directories.root);
        writeCharacterCardFile(directories, 'alpha.png', 'Alpha One');

        const response = await invokeCharactersAll(directories);

        expect(response.statusCode).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
        expect(response.body).toHaveLength(1);
        expect(response.body[0]).toEqual(expect.objectContaining({
            avatar: 'alpha.png',
            name: 'Alpha One',
        }));
        expect(response.body[0].json_data).toContain('"name":"Alpha One"');
        expect(response.body[0].shallow).toBeUndefined();
    });

    test('emits interaction perf metadata for /api/characters/get', async () => {
        const directories = makeDirectories('emberdesk-character-index-route-');
        tempRoots.push(directories.root);
        writeCharacterCardFile(directories, 'alpha.png', 'Alpha Live');
        process.env.EMBERDESK_INTERACTION_PERF_MODE = '1';

        const response = await invokeCharacterGet(directories, 'alpha.png');

        expect(response.statusCode).toBe(200);
        expect(response.headers['x-emberdesk-interaction-path']).toBeDefined();
        expect(response.headers['server-timing']).toContain('route;dur=');
    });
});
