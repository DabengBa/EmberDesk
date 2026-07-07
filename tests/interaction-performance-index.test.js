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
    resetCharacterIndexDatabase,
} from '../src/endpoints/character-index.js';
import { createCanonicalSqliteManager } from '../src/canonical-sqlite.js';
import { runCanonicalMigrations } from '../src/canonical-sqlite-migrations.js';
import { persistCanonicalAuditStatus, runCanonicalShadowImport } from '../src/canonical-sqlite-shadow-import.js';
import { parse as parseCharacterCard, write as writeCharacterCardPngData } from '../src/character-card-parser.js';
import encodePngChunks from '../src/png/encode.js';
import { setConfigFilePath } from '../src/util.js';
import { buildCharacterFileSnapshotRow } from '../src/endpoints/character-file-snapshot.js';
import {
    getCharacterDeleteCandidates,
    shouldRefreshCharacterAfterEdit,
    removeCharactersFromState,
    resolveCharacterAvatarsByIds,
} from '../public/scripts/character-list-state.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

/**
 * @param {string} prefix
 * @returns {{root: string, characters: string, chats: string}}
 */
function makeDirectories(prefix) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    const characters = path.join(root, 'characters');
    const chats = path.join(root, 'chats');
    const groupChats = path.join(root, 'group chats');
    const backups = path.join(root, 'backups');
    const worlds = path.join(root, 'worlds');
    const thumbnailsAvatar = path.join(root, 'thumbnails', 'avatar');
    const thumbnailsPersona = path.join(root, 'thumbnails', 'persona');
    const thumbnailsBg = path.join(root, 'thumbnails', 'bg');
    fs.mkdirSync(characters, { recursive: true });
    fs.mkdirSync(chats, { recursive: true });
    fs.mkdirSync(groupChats, { recursive: true });
    fs.mkdirSync(backups, { recursive: true });
    fs.mkdirSync(worlds, { recursive: true });
    fs.mkdirSync(thumbnailsAvatar, { recursive: true });
    fs.mkdirSync(thumbnailsPersona, { recursive: true });
    fs.mkdirSync(thumbnailsBg, { recursive: true });
    return { root, characters, chats, groupChats, backups, worlds, thumbnailsAvatar, thumbnailsPersona, thumbnailsBg };
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

function openCanonicalDbForTests(directories, handle = 'default-user') {
    const manager = createCanonicalSqliteManager();
    const db = manager.open({
        handle,
        directories,
        featureFlags: { enabled: true, strict: true },
    });
    runCanonicalMigrations(db, { strict: true, nowMs: 1735689600000 });
    return { manager, db };
}

function seedCanonicalCharacterForTests(db, avatarFilename = 'alpha.png') {
    db.prepare(`
        INSERT INTO characters (
            id, avatar_filename, internal_name, display_name, card_json, shallow_json, world_name, created_at_ms, updated_at_ms, deleted_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        `char-${path.parse(avatarFilename).name}`,
        avatarFilename,
        path.parse(avatarFilename).name,
        path.parse(avatarFilename).name,
        JSON.stringify({ avatar: avatarFilename, name: path.parse(avatarFilename).name, data: { extensions: { world: '' } } }),
        JSON.stringify({ avatar: avatarFilename, name: path.parse(avatarFilename).name }),
        '',
        1,
        2,
        null,
    );
    db.prepare(`
        INSERT INTO character_chat_stats (
            character_id, chat_count, chat_size_bytes, date_last_chat_ms, stats_updated_at_ms
        ) VALUES (?, ?, ?, ?, ?)
    `).run(`char-${path.parse(avatarFilename).name}`, 0, 0, 0, 0);
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

function expectNoCharacterReadEnvelope(payload) {
    expect(payload).not.toHaveProperty('result');
    expect(payload).not.toHaveProperty('mode');
    expect(payload).not.toHaveProperty('latencyHint');
    expect(payload).not.toHaveProperty('interactionPath');

    if (Array.isArray(payload)) {
        for (const item of payload) {
            expect(item).not.toHaveProperty('result');
            expect(item).not.toHaveProperty('mode');
            expect(item).not.toHaveProperty('latencyHint');
            expect(item).not.toHaveProperty('interactionPath');
        }
    }
}

test('frontend getCharacters implementation uses /api/characters/all to preserve eager payload mode', () => {
    const scriptSource = fs.readFileSync(path.join(repoRoot, 'public', 'script.js'), 'utf8');
    const fetchAllCharactersDataOnlyStart = scriptSource.indexOf('async function fetchAllCharactersDataOnly()');
    const getCharactersStart = scriptSource.indexOf('export async function getCharacters()');

    expect(fetchAllCharactersDataOnlyStart).toBeGreaterThanOrEqual(0);
    expect(getCharactersStart).toBeGreaterThanOrEqual(0);

    const fetchAllCharactersDataOnlyBody = scriptSource.slice(fetchAllCharactersDataOnlyStart, fetchAllCharactersDataOnlyStart + 500);
    const getCharactersBody = scriptSource.slice(getCharactersStart, getCharactersStart + 800);

    expect(fetchAllCharactersDataOnlyBody).toContain('fetch(\'/api/characters/all\'');
    expect(fetchAllCharactersDataOnlyBody).not.toContain('fetch(\'/api/characters/list\'');
    expect(getCharactersBody).toContain('await fetchAllCharactersDataOnly()');
    expect(getCharactersBody).not.toContain('fetch(\'/api/characters/list\'');
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
 * @returns {(request: any, response: any) => Promise<void>}
 */
function getCharactersDeletePreflightRouteHandler() {
    const layer = charactersRouter.stack.find(entry => entry.route?.path === '/delete-preflight');
    if (!layer?.route?.stack?.length) {
        throw new Error('Could not locate /api/characters/delete-preflight route handler');
    }

    return layer.route.stack[layer.route.stack.length - 1].handle;
}

/**
 * @returns {(request: any, response: any) => Promise<void>}
 */
function getCharactersEditAttributeRouteHandler() {
    const layer = charactersRouter.stack.find(entry => entry.route?.path === '/edit-attribute');
    if (!layer?.route?.stack?.length) {
        throw new Error('Could not locate /api/characters/edit-attribute route handler');
    }

    return layer.route.stack[layer.route.stack.length - 1].handle;
}

/**
 * @returns {(request: any, response: any) => Promise<void>}
 */
function getCharactersDuplicateRouteHandler() {
    const layer = charactersRouter.stack.find(entry => entry.route?.path === '/duplicate');
    if (!layer?.route?.stack?.length) {
        throw new Error('Could not locate /api/characters/duplicate route handler');
    }

    return layer.route.stack[layer.route.stack.length - 1].handle;
}

/**
 * @returns {(request: any, response: any) => Promise<void>}
 */
function getCharactersDeleteRouteHandler() {
    const layer = charactersRouter.stack.find(entry => entry.route?.path === '/delete');
    if (!layer?.route?.stack?.length) {
        throw new Error('Could not locate /api/characters/delete route handler');
    }

    return layer.route.stack[layer.route.stack.length - 1].handle;
}

/**
 * @returns {(request: any, response: any) => Promise<void>}
 */
function getCharactersMergeAttributesRouteHandler() {
    const layer = charactersRouter.stack.find(entry => entry.route?.path === '/merge-attributes');
    if (!layer?.route?.stack?.length) {
        throw new Error('Could not locate /api/characters/merge-attributes route handler');
    }

    return layer.route.stack[layer.route.stack.length - 1].handle;
}

/**
 * @returns {(request: any, response: any) => Promise<void>}
 */
function getCharactersEditAvatarRouteHandler() {
    const layer = charactersRouter.stack.find(entry => entry.route?.path === '/edit-avatar');
    if (!layer?.route?.stack?.length) {
        throw new Error('Could not locate /api/characters/edit-avatar route handler');
    }

    return layer.route.stack[layer.route.stack.length - 1].handle;
}

/**
 * @returns {(request: any, response: any) => Promise<void>}
 */
function getCharactersImportRouteHandler() {
    const layer = charactersRouter.stack.find(entry => entry.route?.path === '/import');
    if (!layer?.route?.stack?.length) {
        throw new Error('Could not locate /api/characters/import route handler');
    }

    return layer.route.stack[layer.route.stack.length - 1].handle;
}

/**
 * @returns {(request: any, response: any) => Promise<void>}
 */
function getCharactersCreateRouteHandler() {
    const layer = charactersRouter.stack.find(entry => entry.route?.path === '/create');
    if (!layer?.route?.stack?.length) {
        throw new Error('Could not locate /api/characters/create route handler');
    }

    return layer.route.stack[layer.route.stack.length - 1].handle;
}

/**
 * @param {string} routePath
 * @returns {(request: any, response: any) => Promise<void>}
 */
function getChatsRouteHandler(routePath) {
    const layer = chatsRouter.stack.find(entry => entry.route?.path === routePath);
    if (!layer?.route?.stack?.length) {
        throw new Error(`Could not locate /api/chats${routePath} route handler`);
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
        user: { directories, profile: { handle: 'default-user' } },
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
        user: { directories, profile: { handle: 'default-user' } },
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
        user: { directories, profile: { handle: 'default-user' } },
    };
    const response = createMockResponse();
    await handler(request, response);
    return response;
}

/**
 * @param {{ root: string, characters: string, chats: string }} directories
 * @param {string[]} avatars
 * @returns {Promise<ReturnType<typeof createMockResponse>>}
 */
async function invokeCharactersDeletePreflight(directories, avatars) {
    const handler = getCharactersDeletePreflightRouteHandler();
    const request = {
        body: { avatars },
        user: { directories, profile: { handle: 'default-user' } },
    };
    const response = createMockResponse();
    await handler(request, response);
    return response;
}

/**
 * @param {{ root: string, characters: string, chats: string }} directories
 * @param {string} avatar
 * @param {string} field
 * @param {any} value
 * @returns {Promise<ReturnType<typeof createMockResponse>>}
 */
async function invokeCharacterEditAttribute(directories, avatar, field, value) {
    const handler = getCharactersEditAttributeRouteHandler();
    const request = {
        body: {
            avatar_url: avatar,
            ch_name: path.parse(avatar).name,
            field,
            value,
        },
        user: { directories, profile: { handle: 'default-user' } },
    };
    const response = createMockResponse();
    await handler(request, response);
    return response;
}

/**
 * @param {{ root: string, characters: string, chats: string }} directories
 * @param {string} avatar
 * @returns {Promise<ReturnType<typeof createMockResponse>>}
 */
async function invokeCharacterDuplicate(directories, avatar) {
    const handler = getCharactersDuplicateRouteHandler();
    const request = {
        body: { avatar_url: avatar },
        user: { directories, profile: { handle: 'default-user' } },
    };
    const response = createMockResponse();
    await handler(request, response);
    return response;
}

/**
 * @param {{ root: string, characters: string, chats: string }} directories
 * @param {string} avatar
 * @param {{ deleteChats?: boolean }} [options]
 * @returns {Promise<ReturnType<typeof createMockResponse>>}
 */
async function invokeCharacterDelete(directories, avatar, options = {}) {
    const handler = getCharactersDeleteRouteHandler();
    const request = {
        body: {
            avatar_url: avatar,
            delete_chats: options.deleteChats ?? false,
        },
        user: { directories, profile: { handle: 'default-user' } },
    };
    const response = createMockResponse();
    await handler(request, response);
    return response;
}

/**
 * @param {{ root: string, characters: string, chats: string }} directories
 * @param {string} avatar
 * @param {object} patch
 * @returns {Promise<ReturnType<typeof createMockResponse>>}
 */
async function invokeCharacterMergeAttributes(directories, avatar, patch) {
    const handler = getCharactersMergeAttributesRouteHandler();
    const request = {
        body: {
            avatar,
            ...patch,
        },
        user: { directories, profile: { handle: 'default-user' } },
    };
    const response = createMockResponse();
    await handler(request, response);
    return response;
}

/**
 * @param {{ root: string, characters: string, chats: string }} directories
 * @param {{ destination: string, filename: string }} file
 * @param {string} fileType
 * @returns {Promise<ReturnType<typeof createMockResponse>>}
 */
async function invokeCharacterImport(directories, file, fileType) {
    const handler = getCharactersImportRouteHandler();
    const request = {
        body: {
            file_type: fileType,
        },
        file,
        user: { directories, profile: { handle: 'default-user' } },
    };
    const response = createMockResponse();
    await handler(request, response);
    return response;
}

/**
 * @param {{ root: string, characters: string, chats: string }} directories
 * @param {{ destination: string, filename: string }} file
 * @param {string} avatar
 * @returns {Promise<ReturnType<typeof createMockResponse>>}
 */
async function invokeCharacterEditAvatar(directories, file, avatar) {
    const handler = getCharactersEditAvatarRouteHandler();
    const request = {
        body: {
            avatar_url: avatar,
        },
        file,
        query: {},
        user: { directories, profile: { handle: 'default-user' } },
    };
    const response = createMockResponse();
    await handler(request, response);
    return response;
}

/**
 * @param {{ root: string, characters: string, chats: string }} directories
 * @param {string} name
 * @returns {Promise<ReturnType<typeof createMockResponse>>}
 */
async function invokeCharacterCreate(directories, name, { file } = {}) {
    const handler = getCharactersCreateRouteHandler();
    const request = {
        body: {
            ch_name: name,
            description: `Description ${name}`,
            personality: `Personality ${name}`,
            scenario: `Scenario ${name}`,
            first_mes: `First ${name}`,
            mes_example: `Example ${name}`,
            creator_notes: `Creator notes ${name}`,
            system_prompt: '',
            post_history_instructions: '',
            tags: '',
            creator: 'tester',
            talkativeness: 0.5,
            fav: false,
            world: '',
            depth_prompt_prompt: '',
            depth_prompt_depth: 4,
            depth_prompt_role: 'system',
            alternate_greetings: [],
            group_only_greetings: [],
            extensions: '{}',
        },
        file: file ?? null,
        query: {},
        user: { directories, profile: { handle: 'default-user' } },
    };
    const response = createMockResponse();
    await handler(request, response);
    return response;
}

async function invokeChatSave(directories, avatar, fileName, chat) {
    const handler = getChatsRouteHandler('/save');
    const request = {
        body: {
            avatar_url: avatar,
            file_name: fileName,
            chat,
            force: true,
        },
        user: { directories, profile: { handle: `chat-test-${path.basename(directories.root)}` } },
    };
    const response = createMockResponse();
    jest.useFakeTimers();
    try {
        await handler(request, response);
        jest.runAllTimers();
        jest.clearAllTimers();
    } finally {
        jest.useRealTimers();
    }
    return response;
}

async function invokeChatDelete(directories, avatar, chatfile) {
    const handler = getChatsRouteHandler('/delete');
    const request = {
        body: {
            avatar_url: avatar,
            chatfile,
        },
        user: { directories, profile: { handle: 'default-user' } },
    };
    const response = createMockResponse();
    jest.useFakeTimers();
    try {
        await handler(request, response);
        jest.runAllTimers();
        jest.clearAllTimers();
    } finally {
        jest.useRealTimers();
    }
    return response;
}

async function invokeChatRename(directories, avatar, originalFile, renamedFile) {
    const handler = getChatsRouteHandler('/rename');
    const request = {
        body: {
            avatar_url: avatar,
            original_file: originalFile,
            renamed_file: renamedFile,
            is_group: false,
        },
        user: { directories, profile: { handle: 'default-user' } },
    };
    const response = createMockResponse();
    await handler(request, response);
    return response;
}

async function invokeChatImport(directories, avatar, file, format = 'jsonl') {
    const handler = getChatsRouteHandler('/import');
    const request = {
        body: {
            file_type: format,
            avatar_url: avatar,
            character_name: path.parse(avatar).name,
            user_name: 'User',
        },
        file,
        user: { directories, profile: { handle: 'default-user' } },
    };
    const response = createMockResponse();
    await handler(request, response);
    return response;
}

async function invokeGroupChatSave(directories, id, chat) {
    const handler = getChatsRouteHandler('/group/save');
    const request = {
        body: {
            id,
            chat,
            force: true,
        },
        user: { directories, profile: { handle: `chat-test-${path.basename(directories.root)}` } },
    };
    const response = createMockResponse();
    jest.useFakeTimers();
    try {
        await handler(request, response);
        jest.runAllTimers();
        jest.clearAllTimers();
    } finally {
        jest.useRealTimers();
    }
    return response;
}

const tempRoots = [];
let sharedDataRoot = '';
const DEFAULT_AVATAR_BUFFER = fs.readFileSync(new URL('../public/img/ai4.png', import.meta.url));
const sharedGlobal = global;
let diskCache;
let charactersRouter;
let chatsRouter;

beforeAll(async () => {
    sharedDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-character-route-cache-'));
    sharedGlobal.DATA_ROOT = sharedDataRoot;
    setConfigFilePath(fileURLToPath(new URL('../default/config.yaml', import.meta.url)));
    ({ diskCache, router: charactersRouter } = await import('../src/endpoints/characters.js'));
    ({ router: chatsRouter } = await import('../src/endpoints/chats.js'));
});

afterEach(() => {
    disposeCharacterIndexDatabases();
    diskCache?.dispose();
    delete process.env.EMBERDESK_CHARACTER_INDEX_MODE;
    delete process.env.EMBERDESK_INTERACTION_PERF_MODE;
    delete process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED;
    delete process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SHADOWIMPORT;
    delete process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_READS;
    delete process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_WRITES;
    delete process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_CHATSTATS;
    delete process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_STRICT;

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
    test('rejects oversized delete preflight avatar batches before scanning files', async () => {
        const directories = makeDirectories('emberdesk-character-delete-preflight-');
        tempRoots.push(directories.root);
        const avatars = Array.from({ length: 501 }, (_, index) => `avatar-${index}.png`);

        const response = await invokeCharactersDeletePreflight(directories, avatars);

        expect(response.statusCode).toBe(400);
        expect(response.body).toEqual({ error: 'Too many avatars requested.' });
    });

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

    test('captures avatar keys from selected character ids before delete dialogs mutate state', () => {
        const characters = [
            { avatar: 'alpha.png', name: 'Alpha' },
            { avatar: 'beta.png', name: 'Beta' },
            { avatar: 'gamma.png', name: 'Gamma' },
        ];

        const avatars = resolveCharacterAvatarsByIds(characters, [2, 0, 99]);

        expect(avatars).toEqual(['gamma.png', 'alpha.png']);
    });

    test('keeps explicit delete avatar keys even when the local character list no longer contains them', () => {
        const characters = [
            { avatar: 'alpha.png', name: 'Alpha' },
            { avatar: 'gamma.png', name: 'Gamma' },
        ];

        const candidates = getCharacterDeleteCandidates(characters, ['beta.png', 'gamma.png']);

        expect(candidates).toEqual([
            { avatar: 'beta.png', character: null, index: -1 },
            { avatar: 'gamma.png', character: { avatar: 'gamma.png', name: 'Gamma' }, index: 1 },
        ]);
    });

    test('throws instead of returning an empty list when the sidecar is circuit-disabled', async () => {
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

        resetCharacterIndexDatabase(directories.root);
        resetCharacterIndexDatabase(directories.root);
        resetCharacterIndexDatabase(directories.root);

        await expect(listIndexedCharacterPayloads({
            userRoot: directories.root,
            directories,
            avatarFiles: ['alpha.png'],
            useShallowPayload: false,
            buildRow: createBuildRow([]),
        })).rejects.toThrow('Derived SQLite sidecar character-index is disabled');
    });

    test('does not refresh an edited character after it was removed locally', () => {
        const characters = [
            { avatar: 'alpha.png', name: 'Alpha' },
            { avatar: 'beta.png', name: 'Beta' },
        ];

        removeCharactersFromState(characters, ['beta.png']);

        expect(shouldRefreshCharacterAfterEdit(characters, 'beta.png')).toBe(false);
        expect(shouldRefreshCharacterAfterEdit(characters, 'alpha.png')).toBe(true);
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
        expectNoCharacterReadEnvelope(response.body);
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

    test('serves /api/characters/all from canonical sqlite when canonical read flags are enabled', async () => {
        const directories = makeDirectories('emberdesk-character-canonical-route-');
        tempRoots.push(directories.root);
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SHADOWIMPORT = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_READS = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_WRITES = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_CHATSTATS = 'true';

        const { manager, db } = openCanonicalDbForTests(directories);
        try {
            db.prepare(`
                INSERT INTO characters (
                    id, avatar_filename, internal_name, display_name, card_json, shallow_json, world_name, created_at_ms, updated_at_ms, deleted_at_ms
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                'char-alpha',
                'alpha.png',
                'alpha',
                'Alpha',
                JSON.stringify({ avatar: 'alpha.png', name: 'Alpha', json_data: '{}', data: { extensions: { world: '' } } }),
                JSON.stringify({ avatar: 'alpha.png', name: 'Alpha' }),
                '',
                1,
                2,
                null,
            );
            db.prepare(`
                INSERT INTO character_chat_stats (
                    character_id, chat_count, chat_size_bytes, date_last_chat_ms, stats_updated_at_ms
                ) VALUES (?, ?, ?, ?, ?)
            `).run('char-alpha', 1, 42, 99, 100);
            persistCanonicalAuditStatus(db, {
                ok: true,
                handle: 'default-user',
                hasDrift: false,
                blocking: false,
                entries: [],
            }, { auditedAtMs: 1735689602000 });

            const response = await invokeCharactersAll(directories);
            expect(response.statusCode).toBe(200);
            expect(response.body).toEqual([
                expect.objectContaining({
                    avatar: 'alpha.png',
                    name: 'Alpha',
                    chat_size: 42,
                    date_last_chat: 99,
                }),
            ]);
        } finally {
            manager.dispose();
        }
    });

    test('updates canonical chat stats after saving a character chat when chat stats are enabled', async () => {
        const directories = makeDirectories('emberdesk-chat-stats-route-');
        tempRoots.push(directories.root);
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SHADOWIMPORT = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_READS = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_WRITES = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_CHATSTATS = 'true';

        const { manager, db } = openCanonicalDbForTests(directories);
        try {
            seedCanonicalCharacterForTests(db, 'alpha.png');
            persistCanonicalAuditStatus(db, {
                ok: true,
                handle: 'default-user',
                hasDrift: false,
                blocking: false,
                entries: [],
            }, { auditedAtMs: 1735689602000 });

            const response = await invokeChatSave(directories, 'alpha.png', 'first', [
                { name: 'Alpha', mes: 'hello' },
                { name: 'User', mes: 'world' },
            ]);

            expect(response.statusCode).toBe(200);
            expect(response.body).toEqual({ ok: true });
            const stats = db.prepare('SELECT chat_count, chat_size_bytes, date_last_chat_ms, stats_updated_at_ms FROM character_chat_stats WHERE character_id = ?').get('char-alpha');
            const chatPath = path.join(directories.chats, 'alpha', 'first.jsonl');
            const fileStat = fs.statSync(chatPath);
            expect(stats).toEqual({
                chat_count: 1,
                chat_size_bytes: fileStat.size,
                date_last_chat_ms: fileStat.mtimeMs,
                stats_updated_at_ms: expect.any(Number),
            });
            expect(stats.stats_updated_at_ms).toBeGreaterThan(0);
            const readResponse = await invokeCharactersAll(directories);
            expect(readResponse.statusCode).toBe(200);
            expect(readResponse.body).toEqual([
                expect.objectContaining({
                    avatar: 'alpha.png',
                    chat_size: fileStat.size,
                    date_last_chat: fileStat.mtimeMs,
                }),
            ]);
        } finally {
            manager.dispose();
        }
    });

    test('updates canonical chat stats after deleting a character chat when chat stats are enabled', async () => {
        const directories = makeDirectories('emberdesk-chat-stats-route-');
        tempRoots.push(directories.root);
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SHADOWIMPORT = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_READS = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_WRITES = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_CHATSTATS = 'true';

        const { manager, db } = openCanonicalDbForTests(directories);
        try {
            seedCanonicalCharacterForTests(db, 'alpha.png');
            writeChatFile(directories.root, 'alpha.png', 'first.jsonl', '{"name":"Alpha"}');
            db.prepare('UPDATE character_chat_stats SET chat_count = ?, chat_size_bytes = ?, date_last_chat_ms = ?, stats_updated_at_ms = ? WHERE character_id = ?')
                .run(1, 16, 100, 101, 'char-alpha');

            const response = await invokeChatDelete(directories, 'alpha.png', 'first');

            expect(response.statusCode).toBe(200);
            expect(response.body).toEqual({ ok: true });
            const stats = db.prepare('SELECT chat_count, chat_size_bytes, date_last_chat_ms, stats_updated_at_ms FROM character_chat_stats WHERE character_id = ?').get('char-alpha');
            expect(stats).toEqual({
                chat_count: 0,
                chat_size_bytes: 0,
                date_last_chat_ms: 0,
                stats_updated_at_ms: expect.any(Number),
            });
            expect(stats.stats_updated_at_ms).toBeGreaterThan(101);
        } finally {
            manager.dispose();
        }
    });

    test('updates canonical chat stats after renaming a character chat when chat stats are enabled', async () => {
        const directories = makeDirectories('emberdesk-chat-stats-route-');
        tempRoots.push(directories.root);
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SHADOWIMPORT = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_READS = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_WRITES = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_CHATSTATS = 'true';

        const { manager, db } = openCanonicalDbForTests(directories);
        try {
            seedCanonicalCharacterForTests(db, 'alpha.png');
            writeChatFile(directories.root, 'alpha.png', 'first.jsonl', '{"name":"Alpha"}');

            const response = await invokeChatRename(directories, 'alpha.png', 'first.jsonl', 'renamed.jsonl');

            expect(response.statusCode).toBe(200);
            expect(response.body).toEqual({ ok: true, sanitizedFileName: 'renamed' });
            expect(fs.existsSync(path.join(directories.chats, 'alpha', 'first.jsonl'))).toBe(false);
            const renamedPath = path.join(directories.chats, 'alpha', 'renamed.jsonl');
            const fileStat = fs.statSync(renamedPath);
            const stats = db.prepare('SELECT chat_count, chat_size_bytes, date_last_chat_ms, stats_updated_at_ms FROM character_chat_stats WHERE character_id = ?').get('char-alpha');
            expect(stats).toEqual({
                chat_count: 1,
                chat_size_bytes: fileStat.size,
                date_last_chat_ms: fileStat.mtimeMs,
                stats_updated_at_ms: expect.any(Number),
            });
            expect(stats.stats_updated_at_ms).toBeGreaterThan(0);
        } finally {
            manager.dispose();
        }
    });

    test('updates canonical chat stats after importing a character chat when chat stats are enabled', async () => {
        const directories = makeDirectories('emberdesk-chat-stats-route-');
        tempRoots.push(directories.root);
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SHADOWIMPORT = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_READS = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_WRITES = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_CHATSTATS = 'true';

        const uploadDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-chat-import-upload-'));
        tempRoots.push(uploadDirectory);
        const uploadFile = { destination: uploadDirectory, filename: 'import.jsonl' };
        const uploadPath = path.join(uploadFile.destination, uploadFile.filename);
        fs.writeFileSync(uploadPath, '{"user_name":"User"}\n{"name":"Alpha","mes":"hello"}', 'utf8');
        fs.mkdirSync(path.join(directories.chats, 'alpha'), { recursive: true });

        const { manager, db } = openCanonicalDbForTests(directories);
        try {
            seedCanonicalCharacterForTests(db, 'alpha.png');

            const response = await invokeChatImport(directories, 'alpha.png', uploadFile);

            expect(response.statusCode).toBe(200);
            expect(response.body).toEqual({ res: true, fileNames: expect.any(Array) });
            const stats = db.prepare('SELECT chat_count, chat_size_bytes, date_last_chat_ms, stats_updated_at_ms FROM character_chat_stats WHERE character_id = ?').get('char-alpha');
            expect(stats.chat_count).toBe(1);
            expect(stats.chat_size_bytes).toBeGreaterThan(0);
            expect(stats.date_last_chat_ms).toBeGreaterThan(0);
            expect(stats.stats_updated_at_ms).toBeGreaterThan(0);
        } finally {
            manager.dispose();
        }
    });

    test('does not update character chat stats after saving a group chat', async () => {
        const directories = makeDirectories('emberdesk-chat-stats-route-');
        tempRoots.push(directories.root);
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SHADOWIMPORT = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_READS = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_WRITES = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_CHATSTATS = 'true';

        const { manager, db } = openCanonicalDbForTests(directories);
        try {
            seedCanonicalCharacterForTests(db, 'alpha.png');

            const response = await invokeGroupChatSave(directories, 'group-1', [
                { name: 'Alpha', mes: 'hello group' },
            ]);

            expect(response.statusCode).toBe(200);
            expect(response.body).toEqual({ ok: true });
            const stats = db.prepare('SELECT chat_count, chat_size_bytes, date_last_chat_ms, stats_updated_at_ms FROM character_chat_stats WHERE character_id = ?').get('char-alpha');
            expect(stats).toEqual({
                chat_count: 0,
                chat_size_bytes: 0,
                date_last_chat_ms: 0,
                stats_updated_at_ms: 0,
            });
        } finally {
            manager.dispose();
        }
    });

    test('serves /api/characters/get from canonical sqlite when the compatibility PNG is missing', async () => {
        const directories = makeDirectories('emberdesk-character-canonical-route-');
        tempRoots.push(directories.root);
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SHADOWIMPORT = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_READS = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_WRITES = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_CHATSTATS = 'true';

        const { manager, db } = openCanonicalDbForTests(directories);
        try {
            db.prepare(`
                INSERT INTO characters (
                    id, avatar_filename, internal_name, display_name, card_json, shallow_json, world_name, created_at_ms, updated_at_ms, deleted_at_ms
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                'char-alpha',
                'alpha.png',
                'alpha',
                'Alpha',
                JSON.stringify({ avatar: 'alpha.png', name: 'Alpha', json_data: '{}', data: { extensions: { world: '' } } }),
                JSON.stringify({ avatar: 'alpha.png', name: 'Alpha' }),
                '',
                1,
                2,
                null,
            );
            db.prepare(`
                INSERT INTO character_chat_stats (
                    character_id, chat_count, chat_size_bytes, date_last_chat_ms, stats_updated_at_ms
                ) VALUES (?, ?, ?, ?, ?)
            `).run('char-alpha', 1, 42, 99, 100);
            persistCanonicalAuditStatus(db, {
                ok: true,
                handle: 'default-user',
                hasDrift: false,
                blocking: false,
                entries: [],
            }, { auditedAtMs: 1735689602000 });

            const response = await invokeCharacterGet(directories, 'alpha.png');
            expect(response.statusCode).toBe(200);
            expect(response.body).toEqual(expect.objectContaining({
                avatar: 'alpha.png',
                name: 'Alpha',
                chat_size: 42,
                date_last_chat: 99,
            }));
        } finally {
            manager.dispose();
        }
    });

    test('serves a full character payload after shadow import populates canonical sqlite from a real PNG card', async () => {
        const directories = makeDirectories('emberdesk-character-canonical-route-');
        tempRoots.push(directories.root);
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SHADOWIMPORT = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_READS = 'true';

        writeCharacterCardFile(directories, 'alpha.png', 'Alpha Shadow');

        const manager = createCanonicalSqliteManager();
        try {
            const importResult = await runCanonicalShadowImport({
                handle: 'default-user',
                directories,
                featureFlags: { enabled: true, shadowImport: true, strict: true },
                manager,
                buildSnapshotRow: (avatar, currentDirectories) => buildCharacterFileSnapshotRow({
                    avatar,
                    directories: currentDirectories,
                    readCharacterData: async filePath => parseCharacterCard(filePath, 'png'),
                    getCharaCardV2: value => ({
                        ...value,
                        name: value.data?.name ?? value.name,
                        description: value.data?.description ?? value.description ?? '',
                        personality: value.data?.personality ?? value.personality ?? '',
                        scenario: value.data?.scenario ?? value.scenario ?? '',
                        first_mes: value.data?.first_mes ?? value.first_mes ?? '',
                        mes_example: value.data?.mes_example ?? value.mes_example ?? '',
                        creatorcomment: value.data?.creator_notes ?? value.creatorcomment ?? '',
                        talkativeness: value.data?.extensions?.talkativeness ?? value.talkativeness ?? 0.5,
                        fav: value.data?.extensions?.fav ?? value.fav ?? false,
                        tags: value.data?.tags ?? value.tags ?? [],
                    }),
                }),
                nowMs: 1735689600000,
            });

            expect(importResult.ok).toBe(true);

            const db = manager.open({
                handle: 'default-user',
                directories,
                featureFlags: { enabled: true, strict: true },
            });
            persistCanonicalAuditStatus(db, {
                ok: true,
                handle: 'default-user',
                hasDrift: false,
                blocking: false,
                entries: [],
            }, { auditedAtMs: 1735689602000 });

            const response = await invokeCharacterGet(directories, 'alpha.png');
            expect(response.statusCode).toBe(200);
            expect(response.body).toEqual(expect.objectContaining({
                avatar: 'alpha.png',
                name: 'Alpha Shadow',
            }));
            expect(response.body.json_data).toContain('Alpha Shadow');
            expect(response.body.data).toEqual(expect.objectContaining({
                name: 'Alpha Shadow',
                description: 'Description Alpha Shadow',
            }));
        } finally {
            manager.dispose();
        }
    });

    test('falls back to the file-backed route when canonical reads are enabled but no persisted audit has run', async () => {
        const directories = makeDirectories('emberdesk-character-canonical-route-');
        tempRoots.push(directories.root);
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_READS = 'true';

        writeLegacyCharacterCardFile(directories, 'legacy.png', 'Legacy Hero');

        const { manager, db } = openCanonicalDbForTests(directories);
        try {
            db.prepare(`
                INSERT INTO characters (
                    id, avatar_filename, internal_name, display_name, card_json, shallow_json, world_name, created_at_ms, updated_at_ms, deleted_at_ms
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                'char-legacy',
                'legacy.png',
                'legacy',
                'Canonical Legacy',
                JSON.stringify({ avatar: 'legacy.png', name: 'Canonical Legacy', json_data: '{}', data: { extensions: { world: '' } } }),
                JSON.stringify({ avatar: 'legacy.png', name: 'Canonical Legacy' }),
                '',
                1,
                2,
                null,
            );

            const response = await invokeCharactersAll(directories);
            expect(response.statusCode).toBe(200);
            expect(response.body).toEqual([
                expect.objectContaining({
                    avatar: 'legacy.png',
                    name: 'Legacy Hero',
                }),
            ]);
        } finally {
            manager.dispose();
        }
    });

    test('invalidates a previously clean canonical audit after file-backed character edits so later reads fall back', async () => {
        const directories = makeDirectories('emberdesk-character-canonical-route-');
        tempRoots.push(directories.root);
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_READS = 'true';

        writeCharacterCardFile(directories, 'alpha.png', 'Live Alpha');

        const { manager, db } = openCanonicalDbForTests(directories);
        try {
            db.prepare(`
                INSERT INTO characters (
                    id, avatar_filename, internal_name, display_name, card_json, shallow_json, world_name, created_at_ms, updated_at_ms, deleted_at_ms
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                'char-alpha',
                'alpha.png',
                'alpha',
                'Alpha',
                JSON.stringify({ avatar: 'alpha.png', name: 'Canonical Alpha', json_data: '{}', data: { extensions: { world: '' } } }),
                JSON.stringify({ avatar: 'alpha.png', name: 'Canonical Alpha' }),
                '',
                1,
                2,
                null,
            );
            persistCanonicalAuditStatus(db, {
                ok: true,
                handle: 'default-user',
                hasDrift: false,
                blocking: false,
                entries: [],
            }, { auditedAtMs: 1735689602000 });

            const initialResponse = await invokeCharacterGet(directories, 'alpha.png');
            expect(initialResponse.statusCode).toBe(200);
            expect(initialResponse.body.name).toBe('Canonical Alpha');

            const editResponse = await invokeCharacterEditAttribute(directories, 'alpha.png', 'description', 'Edited description');
            expect(editResponse.statusCode).toBe(200);

            const fallbackResponse = await invokeCharacterGet(directories, 'alpha.png');
            expect(fallbackResponse.statusCode).toBe(200);
            expect(fallbackResponse.body.name).toBe('Live Alpha');
            expect(fallbackResponse.body.description).toBe('Edited description');
        } finally {
            manager.dispose();
        }
    });

    test('invalidates a previously clean canonical audit after duplicate creates a new file-backed character', async () => {
        const directories = makeDirectories('emberdesk-character-canonical-route-');
        tempRoots.push(directories.root);
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_READS = 'true';

        writeCharacterCardFile(directories, 'alpha.png', 'Live Alpha');

        const { manager, db } = openCanonicalDbForTests(directories);
        try {
            db.prepare(`
                INSERT INTO characters (
                    id, avatar_filename, internal_name, display_name, card_json, shallow_json, world_name, created_at_ms, updated_at_ms, deleted_at_ms
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                'char-alpha',
                'alpha.png',
                'alpha',
                'Alpha',
                JSON.stringify({ avatar: 'alpha.png', name: 'Canonical Alpha', json_data: '{}', data: { extensions: { world: '' } } }),
                JSON.stringify({ avatar: 'alpha.png', name: 'Canonical Alpha' }),
                '',
                1,
                2,
                null,
            );
            persistCanonicalAuditStatus(db, {
                ok: true,
                handle: 'default-user',
                hasDrift: false,
                blocking: false,
                entries: [],
            }, { auditedAtMs: 1735689602000 });

            const initialResponse = await invokeCharactersAll(directories);
            expect(initialResponse.statusCode).toBe(200);
            expect(initialResponse.body).toEqual([
                expect.objectContaining({
                    avatar: 'alpha.png',
                    name: 'Canonical Alpha',
                }),
            ]);

            const duplicateResponse = await invokeCharacterDuplicate(directories, 'alpha.png');
            expect(duplicateResponse.statusCode).toBe(200);
            expect(duplicateResponse.body).toEqual({ path: 'alpha_1.png' });

            const fallbackResponse = await invokeCharactersAll(directories);
            expect(fallbackResponse.statusCode).toBe(200);
            expect(fallbackResponse.body).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    avatar: 'alpha.png',
                    name: 'Live Alpha',
                }),
                expect.objectContaining({
                    avatar: 'alpha_1.png',
                    name: 'Live Alpha',
                }),
            ]));
            expect(fallbackResponse.body).toHaveLength(2);
        } finally {
            manager.dispose();
        }
    });

    test('updates the canonical row during edit-attribute when canonical writes are enabled', async () => {
        const directories = makeDirectories('emberdesk-character-canonical-route-');
        tempRoots.push(directories.root);
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SHADOWIMPORT = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_READS = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_WRITES = 'true';

        writeCharacterCardFile(directories, 'alpha.png', 'Live Alpha');

        const { manager, db } = openCanonicalDbForTests(directories);
        try {
            db.prepare(`
                INSERT INTO characters (
                    id, avatar_filename, internal_name, display_name, card_json, shallow_json, world_name, created_at_ms, updated_at_ms, deleted_at_ms
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                'char-alpha',
                'alpha.png',
                'alpha',
                'Canonical Alpha',
                JSON.stringify({ avatar: 'alpha.png', name: 'Canonical Alpha', description: 'Before', json_data: '{}', data: { extensions: { world: '' }, description: 'Before' } }),
                JSON.stringify({ avatar: 'alpha.png', name: 'Canonical Alpha', description: 'Before' }),
                '',
                1,
                2,
                null,
            );
            persistCanonicalAuditStatus(db, {
                ok: true,
                handle: 'default-user',
                hasDrift: false,
                blocking: false,
                entries: [],
            }, { auditedAtMs: 1735689602000 });

            const editResponse = await invokeCharacterEditAttribute(directories, 'alpha.png', 'description', 'Edited description');
            expect(editResponse.statusCode).toBe(200);

            const row = db.prepare('SELECT card_json FROM characters WHERE avatar_filename = ?').get('alpha.png');
            const card = JSON.parse(row.card_json);
            expect(card.description).toBe('Edited description');
            expect(card.data.description).toBe('Edited description');

            const readResponse = await invokeCharacterGet(directories, 'alpha.png');
            expect(readResponse.statusCode).toBe(200);
            expect(readResponse.body.description).toBe('Edited description');
        } finally {
            manager.dispose();
        }
    });

    test('writes a duplicated character into canonical sqlite when canonical writes are enabled', async () => {
        const directories = makeDirectories('emberdesk-character-canonical-route-');
        tempRoots.push(directories.root);
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SHADOWIMPORT = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_READS = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_WRITES = 'true';

        writeCharacterCardFile(directories, 'alpha.png', 'Live Alpha');

        const { manager, db } = openCanonicalDbForTests(directories);
        try {
            db.prepare(`
                INSERT INTO characters (
                    id, avatar_filename, internal_name, display_name, card_json, shallow_json, world_name, created_at_ms, updated_at_ms, deleted_at_ms
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                'char-alpha',
                'alpha.png',
                'alpha',
                'Canonical Alpha',
                JSON.stringify({ avatar: 'alpha.png', name: 'Canonical Alpha', json_data: '{}', data: { extensions: { world: '' } } }),
                JSON.stringify({ avatar: 'alpha.png', name: 'Canonical Alpha' }),
                '',
                1,
                2,
                null,
            );
            persistCanonicalAuditStatus(db, {
                ok: true,
                handle: 'default-user',
                hasDrift: false,
                blocking: false,
                entries: [],
            }, { auditedAtMs: 1735689602000 });

            const duplicateResponse = await invokeCharacterDuplicate(directories, 'alpha.png');
            expect(duplicateResponse.statusCode).toBe(200);
            expect(duplicateResponse.body).toEqual({ path: 'alpha_1.png' });

            const duplicateRow = db.prepare(`
                SELECT avatar_filename, card_json, deleted_at_ms
                FROM characters
                WHERE avatar_filename = ?
            `).get('alpha_1.png');
            expect(duplicateRow).toEqual(expect.objectContaining({
                avatar_filename: 'alpha_1.png',
                deleted_at_ms: null,
            }));
            expect(JSON.parse(duplicateRow.card_json)).toEqual(expect.objectContaining({
                avatar: 'alpha_1.png',
                data: expect.objectContaining({
                    name: 'Live Alpha',
                }),
            }));

            const readResponse = await invokeCharacterGet(directories, 'alpha_1.png');
            expect(readResponse.statusCode).toBe(200);
            expect(readResponse.body).toEqual(expect.objectContaining({
                avatar: 'alpha_1.png',
                data: expect.objectContaining({
                    name: 'Live Alpha',
                }),
            }));
        } finally {
            manager.dispose();
        }
    });

    test('updates the canonical row during single merge-attributes when canonical writes are enabled', async () => {
        const directories = makeDirectories('emberdesk-character-canonical-route-');
        tempRoots.push(directories.root);
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SHADOWIMPORT = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_READS = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_WRITES = 'true';

        writeCharacterCardFile(directories, 'alpha.png', 'Live Alpha');

        const { manager, db } = openCanonicalDbForTests(directories);
        try {
            db.prepare(`
                INSERT INTO characters (
                    id, avatar_filename, internal_name, display_name, card_json, shallow_json, world_name, created_at_ms, updated_at_ms, deleted_at_ms
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                'char-alpha',
                'alpha.png',
                'alpha',
                'Canonical Alpha',
                JSON.stringify({ avatar: 'alpha.png', name: 'Canonical Alpha', description: 'Before', json_data: '{}', data: { name: 'Canonical Alpha', extensions: { world: '' }, description: 'Before' } }),
                JSON.stringify({ avatar: 'alpha.png', name: 'Canonical Alpha', description: 'Before' }),
                '',
                1,
                2,
                null,
            );
            persistCanonicalAuditStatus(db, {
                ok: true,
                handle: 'default-user',
                hasDrift: false,
                blocking: false,
                entries: [],
            }, { auditedAtMs: 1735689602000 });

            const mergeResponse = await invokeCharacterMergeAttributes(directories, 'alpha.png', {
                description: 'Merged description',
            });
            expect(mergeResponse.statusCode).toBe(200);

            const row = db.prepare('SELECT card_json FROM characters WHERE avatar_filename = ?').get('alpha.png');
            const card = JSON.parse(row.card_json);
            expect(card.description).toBe('Merged description');

            const readResponse = await invokeCharacterGet(directories, 'alpha.png');
            expect(readResponse.statusCode).toBe(200);
            expect(readResponse.body.description).toBe('Merged description');
        } finally {
            manager.dispose();
        }
    });

    test('writes imported png characters into canonical sqlite when canonical writes are enabled', async () => {
        const directories = makeDirectories('emberdesk-character-canonical-route-');
        tempRoots.push(directories.root);
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SHADOWIMPORT = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_READS = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_WRITES = 'true';

        const uploadPath = path.join(directories.root, 'import.png');
        const importPayload = JSON.stringify({
            spec: 'chara_card_v3',
            spec_version: '3.0',
            data: {
                name: 'Imported Alpha',
                description: 'Imported description',
                personality: '',
                scenario: '',
                first_mes: '',
                mes_example: '',
                creator_notes: '',
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
        fs.writeFileSync(uploadPath, writeCharacterCardPngData(DEFAULT_AVATAR_BUFFER, importPayload));

        const { manager, db } = openCanonicalDbForTests(directories);
        try {
            persistCanonicalAuditStatus(db, {
                ok: true,
                handle: 'default-user',
                hasDrift: false,
                blocking: false,
                entries: [],
            }, { auditedAtMs: 1735689602000 });

            const importResponse = await invokeCharacterImport(directories, {
                destination: directories.root,
                filename: 'import.png',
            }, 'png');
            expect(importResponse.statusCode).toBe(200);
            expect(importResponse.body).toEqual({ file_name: 'Imported Alpha' });

            const row = db.prepare(`
                SELECT avatar_filename, card_json
                FROM characters
                WHERE avatar_filename = ?
            `).get('Imported Alpha.png');
            expect(row).toEqual(expect.objectContaining({
                avatar_filename: 'Imported Alpha.png',
            }));
            expect(JSON.parse(row.card_json)).toEqual(expect.objectContaining({
                avatar: 'Imported Alpha.png',
                data: expect.objectContaining({
                    name: 'Imported Alpha',
                }),
            }));

            const readResponse = await invokeCharacterGet(directories, 'Imported Alpha.png');
            expect(readResponse.statusCode).toBe(200);
            expect(readResponse.body).toEqual(expect.objectContaining({
                avatar: 'Imported Alpha.png',
                data: expect.objectContaining({
                    name: 'Imported Alpha',
                }),
            }));
        } finally {
            manager.dispose();
        }
    });

    test('updates the canonical row during edit-avatar when canonical writes are enabled', async () => {
        const directories = makeDirectories('emberdesk-character-canonical-route-');
        tempRoots.push(directories.root);
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SHADOWIMPORT = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_READS = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_WRITES = 'true';

        writeCharacterCardFile(directories, 'alpha.png', 'Live Alpha');
        const uploadPath = path.join(directories.root, 'avatar.tmp');
        fs.writeFileSync(uploadPath, DEFAULT_AVATAR_BUFFER);

        const { manager, db } = openCanonicalDbForTests(directories);
        try {
            db.prepare(`
                INSERT INTO characters (
                    id, avatar_filename, internal_name, display_name, card_json, shallow_json, world_name, created_at_ms, updated_at_ms, deleted_at_ms
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                'char-alpha',
                'alpha.png',
                'alpha',
                'Canonical Alpha',
                JSON.stringify({ avatar: 'alpha.png', name: 'Canonical Alpha', json_data: '{}', data: { name: 'Canonical Alpha', extensions: { world: '' } } }),
                JSON.stringify({ avatar: 'alpha.png', name: 'Canonical Alpha' }),
                '',
                1,
                2,
                null,
            );
            persistCanonicalAuditStatus(db, {
                ok: true,
                handle: 'default-user',
                hasDrift: false,
                blocking: false,
                entries: [],
            }, { auditedAtMs: 1735689602000 });

            const editResponse = await invokeCharacterEditAvatar(directories, {
                destination: directories.root,
                filename: 'avatar.tmp',
            }, 'alpha.png');
            expect(editResponse.statusCode).toBe(200);

            const row = db.prepare('SELECT card_json FROM characters WHERE avatar_filename = ?').get('alpha.png');
            expect(JSON.parse(row.card_json)).toEqual(expect.objectContaining({
                avatar: 'alpha.png',
            }));

            const readResponse = await invokeCharacterGet(directories, 'alpha.png');
            expect(readResponse.statusCode).toBe(200);
            expect(readResponse.body).toEqual(expect.objectContaining({
                avatar: 'alpha.png',
            }));
        } finally {
            manager.dispose();
        }
    });

    test('keeps canonical reads available after a successful DB-first create projection and writes the new row to canonical sqlite', async () => {
        const directories = makeDirectories('emberdesk-character-canonical-route-');
        tempRoots.push(directories.root);
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SHADOWIMPORT = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_READS = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_WRITES = 'true';

        const uploadPath = path.join(directories.root, 'upload.tmp');
        fs.writeFileSync(uploadPath, DEFAULT_AVATAR_BUFFER);

        const { manager, db } = openCanonicalDbForTests(directories);
        try {
            persistCanonicalAuditStatus(db, {
                ok: true,
                handle: 'default-user',
                hasDrift: false,
                blocking: false,
                entries: [],
            }, { auditedAtMs: 1735689602000 });

            const createResponse = await invokeCharacterCreate(directories, 'Created Canonical', {
                file: { destination: directories.root, filename: 'upload.tmp' },
            });
            expect(createResponse.statusCode).toBe(200);
            expect(createResponse.body).toBe('Created Canonical.png');

            const createdRow = db.prepare(`
                SELECT avatar_filename, display_name, card_json, shallow_json
                FROM characters
                WHERE avatar_filename = ?
            `).get('Created Canonical.png');
            expect(createdRow).toEqual(expect.objectContaining({
                avatar_filename: 'Created Canonical.png',
                display_name: 'Created Canonical',
            }));
            expect(JSON.parse(createdRow.card_json)).toEqual(expect.objectContaining({
                avatar: 'Created Canonical.png',
                name: 'Created Canonical',
            }));

            const auditStatus = db.prepare(`
                SELECT status, reason, blocking
                FROM canonical_audit_state
                WHERE audit_scope = ?
            `).get('character_metadata_and_chat_stats');
            expect(auditStatus).toEqual(expect.objectContaining({
                status: 'clean',
                reason: null,
                blocking: 0,
            }));

            const readResponse = await invokeCharacterGet(directories, 'Created Canonical.png');
            expect(readResponse.statusCode).toBe(200);
            expect(readResponse.body).toEqual(expect.objectContaining({
                avatar: 'Created Canonical.png',
                name: 'Created Canonical',
            }));
        } finally {
            manager.dispose();
        }
    });

    test('marks the canonical row deleted and keeps DB-first reads authoritative after a successful delete projection', async () => {
        const directories = makeDirectories('emberdesk-character-canonical-route-');
        tempRoots.push(directories.root);
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SHADOWIMPORT = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_READS = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_WRITES = 'true';

        writeCharacterCardFile(directories, 'alpha.png', 'Live Alpha');

        const { manager, db } = openCanonicalDbForTests(directories);
        try {
            db.prepare(`
                INSERT INTO characters (
                    id, avatar_filename, internal_name, display_name, card_json, shallow_json, world_name, created_at_ms, updated_at_ms, deleted_at_ms
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                'char-alpha',
                'alpha.png',
                'alpha',
                'Canonical Alpha',
                JSON.stringify({ avatar: 'alpha.png', name: 'Canonical Alpha', json_data: '{}', data: { extensions: { world: '' } } }),
                JSON.stringify({ avatar: 'alpha.png', name: 'Canonical Alpha' }),
                '',
                1,
                2,
                null,
            );
            persistCanonicalAuditStatus(db, {
                ok: true,
                handle: 'default-user',
                hasDrift: false,
                blocking: false,
                entries: [],
            }, { auditedAtMs: 1735689602000 });

            const initialResponse = await invokeCharacterGet(directories, 'alpha.png');
            expect(initialResponse.statusCode).toBe(200);
            expect(initialResponse.body.name).toBe('Canonical Alpha');

            const deleteResponse = await invokeCharacterDelete(directories, 'alpha.png');
            expect(deleteResponse.statusCode).toBe(200);
            expect(fs.existsSync(path.join(directories.characters, 'alpha.png'))).toBe(false);

            const deletedRow = db.prepare(`
                SELECT deleted_at_ms
                FROM characters
                WHERE avatar_filename = ?
            `).get('alpha.png');
            expect(Number(deletedRow.deleted_at_ms)).toBeGreaterThan(0);

            const readResponse = await invokeCharacterGet(directories, 'alpha.png');
            expect(readResponse.statusCode).toBe(404);

            const listResponse = await invokeCharactersAll(directories);
            expect(listResponse.statusCode).toBe(200);
            expect(listResponse.body).toEqual([]);
        } finally {
            manager.dispose();
        }
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
        expectNoCharacterReadEnvelope(response.body);
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
        expect(response.headers['x-emberdesk-character-index-status']).toBeDefined();
        expect(response.headers['x-emberdesk-character-index-status']).not.toContain('dbPath');
    });

    test('serves a richer shallow summary from /api/characters/list without full-only fields', async () => {
        const directories = makeDirectories('emberdesk-character-index-route-');
        tempRoots.push(directories.root);
        writeCharacterCardFile(directories, 'alpha.png', 'Alpha One');

        const response = await invokeCharactersList(directories);

        expect(response.statusCode).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
        expectNoCharacterReadEnvelope(response.body);
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
        expectNoCharacterReadEnvelope(response.body);
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
        expect(response.headers['x-emberdesk-character-index-status']).toBeDefined();
        expect(response.headers['x-emberdesk-character-index-status']).not.toContain('dbPath');
    });
});
