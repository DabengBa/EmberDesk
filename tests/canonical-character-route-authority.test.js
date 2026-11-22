import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

import { ZipArchive } from 'archiver';
import express from 'express';
import { zipSync } from 'fflate';
import multer from 'multer';
import extractPngChunks from '../src/png/extract.ts';
import { afterEach, describe, expect, jest, test } from '@jest/globals';

import { humanizedDateTime, setConfigFilePath } from '../src/util.ts';
import { canonicalSqliteManager } from '../src/canonical-sqlite.ts';
import { ensureCanonicalSliceBackend } from '../src/canonical-backend.ts';
import { runCanonicalMigrations } from '../src/canonical-sqlite-migrations.ts';
import { auditCanonicalShadowImport, persistCanonicalAuditStatus } from '../src/canonical-sqlite-shadow-import.ts';
import { auditCanonicalChatShadowImport } from '../src/canonical-chat-shadow-import.ts';
import { markCanonicalCharacterDeleted, upsertCanonicalCharacter } from '../src/endpoints/character-store.ts';
import { upsertCanonicalWorldInfoBook } from '../src/endpoints/world-info-store.ts';
import {
    createCanonicalChatSessionRecord,
    upsertCanonicalChatSession,
} from '../src/endpoints/canonical-chat-store.ts';
import { recordCharacterAvatarBlob } from '../src/canonical-avatar-blob-service.ts';
import { readManagedMediaContent } from '../src/endpoints/canonical-managed-media-read-service.ts';
import { writeCanonicalManagedMedia } from '../src/endpoints/canonical-managed-media-write-service.ts';
import { getCanonicalSettingsDocument, upsertCanonicalSettingsDocument } from '../src/endpoints/settings-store.ts';
import { read } from '../src/character-card-parser.ts';
import { router as userFileRouter } from '../src/user-files.ts';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');
const REAL_AVATAR_PNG = fs.readFileSync(path.join(repoRoot, 'public/img/ai4.png'));

const roots = [];
const configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-canonical-character-route-config-'));
const configPath = path.join(configRoot, 'config.yaml');
fs.writeFileSync(configPath, [
    'backups:',
    '  chat:',
    '    enabled: false',
    '    maxTotalBackups: -1',
    '    throttleInterval: 10000',
    '    checkIntegrity: true',
    'performance:',
    '  lazyLoadCharacters: false',
    '  useDiskCache: false',
    '  memoryCacheCapacity: 100mb',
    'features:',
    '  storage:',
    '    canonicalSqlite:',
    '      enabled: true',
    '      shadowImport: true',
    '      reads: true',
    '      writes: true',
    '      strict: false',
    '      slices:',
    '        characters:',
    '          enabled: true',
    '          shadowImport: true',
    '          reads: true',
    '          writes: true',
    '          chatStats: true',
    '          projection: off',
    '        chats:',
    '          enabled: true',
    '          shadowImport: true',
    '          reads: true',
    '          writes: true',
    '          projection: off',
    '        managed_media:',
    '          enabled: true',
    '          shadowImport: true',
    '          reads: true',
    '          writes: true',
    '          projection: off',
    '        worldInfo:',
    '          enabled: true',
    '          shadowImport: true',
    '          reads: true',
    '          writes: true',
    '          projection: off',
].join('\n'), 'utf8');
setConfigFilePath(configPath);

const { applyAvatarCropResize, router } = await import('../src/endpoints/characters.ts');
const { router: settingsRouter } = await import('../src/endpoints/settings-routes.ts');
const { router: chatRouter } = await import('../src/endpoints/chats.ts');
const { router: worldRouter } = await import('../src/endpoints/worldinfo-routes.ts');

function makeResponse() {
    return {
        body: undefined,
        statusCode: 200,
        headers: {},
        set(name, value) {
            this.headers[name] = value;
            return this;
        },
        setHeader(name, value) {
            this.headers[name] = value;
            return this;
        },
        type() {
            return this;
        },
        send(payload) {
            this.body = payload;
            return this;
        },
        json(payload) {
            return this.send(payload);
        },
        status(statusCode) {
            this.statusCode = statusCode;
            return this;
        },
        sendStatus(statusCode) {
            this.statusCode = statusCode;
            return this;
        },
    };
}

function getRouteHandler(routePath, owner = router) {
    const layer = owner.stack.find(entry => entry.route?.path === routePath);
    if (!layer?.route?.stack?.length) {
        throw new Error(`Missing characters route ${routePath}`);
    }
    return layer.route.stack.at(-1).handle;
}

function makeDirectories() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-canonical-character-off-'));
    roots.push(root);
    const directories = {
        root,
        storage: path.join(root, 'storage'),
        characters: path.join(root, 'characters'),
        chats: path.join(root, 'chats'),
        worlds: path.join(root, 'worlds'),
        assets: path.join(root, 'assets'),
        userImages: path.join(root, 'user', 'images'),
        files: path.join(root, 'user', 'files'),
        avatars: path.join(root, 'User Avatars'),
        backups: path.join(root, 'backups'),
        thumbnailsAvatar: path.join(root, 'thumbnails', 'avatar'),
    }
    for (const directory of Object.values(directories)) {
        fs.mkdirSync(directory, { recursive: true });
    }
    return directories;
}

async function writeByafArchive(filePath, entries) {
    await new Promise((resolve, reject) => {
        const output = fs.createWriteStream(filePath);
        const archive = new ZipArchive();
        output.on('close', resolve);
        output.on('error', reject);
        archive.on('warning', reject);
        archive.on('error', reject);
        archive.pipe(output);
        for (const entry of entries) {
            archive.append(Buffer.isBuffer(entry.data) ? entry.data : JSON.stringify(entry.data), { name: entry.name });
        }
        archive.finalize();
    });
}

async function callByafImport(directories, uploadName) {
    const response = makeResponse();
    const previousCwd = process.cwd();
    try {
        process.chdir(repoRoot);
        await getRouteHandler('/import')({
            body: { file_type: 'byaf', user_name: 'User' },
            file: { destination: directories.root, filename: uploadName },
            user: { directories, profile: { handle: 'alice' } },
        }, response);
    } finally {
        process.chdir(previousCwd);
    }
    return response;
}

async function runByafImportNotice(response) {
    const source = fs.readFileSync(path.join(repoRoot, 'public/script.js'), 'utf8');
    const entry = source.match(/async function importCharacter\([\s\S]*?\n}\n/)[0];
    const toastr = { success: jest.fn(), warning: jest.fn(), error: jest.fn() };
    const importCharacter = runInNewContext(`(${entry})`, {
        is_send_press: false, document: { getElementById: () => null },
        name1: 'User', FormData, HTMLInputElement: class {}, toastr, console,
        t: (parts, ...values) => String.raw({ raw: parts }, ...values),
        getRequestHeaders: () => ({}), fetch: async () => Response.json(response.body),
    });
    const avatar = await importCharacter(new File([], 'import.byaf'));
    return { avatar, toastr };
}

function openDb(directories, handle = 'alice') {
    const db = canonicalSqliteManager.open({
        handle,
        directories,
        featureFlags: { enabled: true, strict: false },
    });
    runCanonicalMigrations(db);
    return db;
}

function makeCard(name) {
    return {
        spec: 'chara_card_v2',
        spec_version: '2.0',
        name,
        description: `${name} description`,
        data: {
            name,
            description: `${name} description`,
            extensions: { world: '' },
        },
    };
}

async function seedCanonicalCharacter(directories, { avatarFilename = 'alice.png', name = 'Alice', world = '', cardFields = {} } = {}) {
    const db = openDb(directories);
    const cardData = { ...makeCard(name), ...cardFields };
    cardData.data.extensions.world = world;
    const cardJson = JSON.stringify(cardData);
    upsertCanonicalCharacter(db, {
        id: `character-${avatarFilename}`,
        avatarFilename,
        fullPayload: { ...cardData, avatar: avatarFilename, json_data: cardJson },
        shallowPayload: { name, avatar: avatarFilename, description: cardData.description },
        createdAtMs: 1700000000000,
        updatedAtMs: 1700000000000,
    });
    upsertCanonicalSettingsDocument(db, {
        userId: 'alice',
        expectedRevision: 0,
        payload: { power_user: {} },
        nowMs: 1700000000000,
    });
    // No PNG files exist: the characters audit must stay clean under 'off'.
    const audit = await auditCanonicalShadowImport({
        handle: 'alice',
        directories,
        db,
        buildSnapshotRow: async () => {
            throw new Error('file snapshots must not run when no projections exist');
        },
        projection: 'off',
    });
    return { db, audit };
}

async function seedCanonicalChat(directories, db, { ownerId = 'alice', fileName = 'first', world } = {}) {
    const payload = [
        { chat_metadata: { integrity: 'canonical-chat', ...(world ? { world_info: world } : {}) } },
        { name: 'User', mes: 'Hello Alice', send_date: '2026-01-01T00:00:00.000Z' },
    ];
    upsertCanonicalChatSession(db, createCanonicalChatSessionRecord(db, {
        locator: {
            ownerType: 'character',
            ownerId,
            sourcePath: `chats/${ownerId}/${fileName}.jsonl`,
        },
        payload,
        nowMs: 1700000000000,
    }));
    await auditCanonicalChatShadowImport({ handle: 'alice', directories, db, projection: 'off' });
}

afterEach(() => {
    for (const root of roots.splice(0)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

describe('characters projection off', () => {
    test.each([false, true])('CharX import reports filtered expressions in the character notification (expression only: %s)', async expressionOnly => {
        const directories = makeDirectories();
        const db = openDb(directories);
        const card = makeCard('CharX Example');
        card.data.assets = [{ type: 'expression', name: 'Happy', uri: 'embedded://happy.png' }];
        if (!expressionOnly) card.data.assets.push(
            { type: 'misc', name: 'Gallery', uri: 'embedded://gallery.png' },
            { type: 'misc', name: 'Missing', uri: 'embedded://missing.png' },
            { type: 'background', name: 'Blocked', uri: 'embedded://background.png' },
        );
        const blocked = path.join(directories.characters, card.name, 'backgrounds');
        fs.mkdirSync(path.dirname(blocked));
        fs.writeFileSync(blocked, 'not a directory');
        const zip = zipSync({
            'card.json': Buffer.from(JSON.stringify(card)),
            'gallery.png': REAL_AVATAR_PNG,
            'background.png': REAL_AVATAR_PNG,
            'happy.png': REAL_AVATAR_PNG,
        });
        const app = express();
        app.use(multer({ dest: directories.root }).single('avatar'));
        app.use((request, _response, next) => {
            request.user = { directories, profile: { handle: 'alice' } };
            next();
        });
        app.use('/api/characters', router);
        const server = await new Promise(resolve => {
            const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
        });

        try {
            const source = fs.readFileSync(path.join(repoRoot, 'public/script.js'), 'utf8');
            const entry = source.match(/async function importCharacter\([\s\S]*?\n}\n/)[0];
            const toastr = { success: jest.fn(), warning: jest.fn(), error: jest.fn() };
            let response;
            const importCharacter = runInNewContext(`(${entry})`, {
                is_send_press: false, document: { getElementById: () => null },
                name1: 'User', FormData, HTMLInputElement: class {}, toastr, console,
                t: (parts, ...values) => String.raw({ raw: parts }, ...values),
                getRequestHeaders: () => ({}),
                fetch: async (url, options) => {
                    const result = await fetch(`http://127.0.0.1:${server.address().port}${url}`, options);
                    response = { status: result.status, body: await result.clone().json() };
                    return result;
                },
            });

            expect(await importCharacter(new File([zip], 'example.charx'))).toBe('CharX Example.png');
            expect(toastr.success).toHaveBeenCalledWith('Character Created: CharX Example');
            const auxiliaryMedia = expressionOnly ? { imported: 0, skipped: 1, failed: 0 } : { imported: 1, skipped: 2, failed: 1 };
            expect(toastr.warning).toHaveBeenCalledWith(`CharX auxiliary media: ${auxiliaryMedia.imported} imported, ${auxiliaryMedia.skipped} skipped, ${auxiliaryMedia.failed} failed.`, 'Character import');
            expect(toastr.error).not.toHaveBeenCalled();
            expect(response).toEqual({ status: 200, body: {
                file_name: 'CharX Example',
                report: { auxiliaryMedia },
            } });
            expect(db.prepare('SELECT display_name FROM media_references').all()).toEqual(expressionOnly ? [] : [{ display_name: 'gallery.png' }]);
            expect(fs.readdirSync(directories.userImages)).toEqual([]);
        } finally {
            await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        }
    });

    test('independent HTTP reads protect a character from a stale edit', async () => {
        const directories = makeDirectories();
        const { db } = await seedCanonicalCharacter(directories);
        const app = express();
        app.use(express.json());
        app.use(multer({ dest: directories.root, limits: { fieldSize: 500 * 1024 * 1024 } }).single('avatar'));
        app.use((request, _response, next) => {
            request.user = { directories, profile: { handle: 'alice' } };
            next();
        });
        app.use('/api/characters', router);
        const server = await new Promise(resolve => {
            const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
        });
        try {
            const url = `http://127.0.0.1:${server.address().port}/api/characters`;
            const post = (route, body) => fetch(url + route, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
            });
            const firstResponse = await post('/get', { avatar_url: 'alice.png' });
            const secondResponse = await post('/get', { avatar_url: 'alice.png' });
            expect(firstResponse.status).toBe(200);
            expect(secondResponse.status).toBe(200);
            const first = await firstResponse.json();
            const second = await secondResponse.json();
            expect(typeof first.canonical_card_version).toBe('string');
            expect(second.canonical_card_version).toBe(first.canonical_card_version);
            const edit = (snapshot, description) => {
                const form = new FormData();
                for (const [key, value] of Object.entries({
                    avatar_url: 'alice.png', ch_name: 'Alice', description,
                    json_data: snapshot.json_data, expected_card_json: snapshot.canonical_card_version,
                })) form.set(key, value);
                return fetch(url + '/edit', { method: 'POST', body: form });
            };
            const missingVersion = await post('/edit', { avatar_url: 'alice.png', ch_name: 'Alice', description: 'unversioned', json_data: first.json_data });
            expect(missingVersion.status).toBe(400);
            const saved = await edit(first, 'first edit');
            expect(saved.status).toBe(200);
            const savedVersion = (await saved.json()).canonical_card_version;
            expect(savedVersion).toBe(db.prepare('SELECT card_json FROM characters WHERE avatar_filename = ?').get('alice.png').card_json);
            expect((await edit(second, 'stale edit')).status).toBe(409);
            expect(JSON.parse(db.prepare('SELECT card_json FROM characters WHERE avatar_filename = ?').get('alice.png').card_json).description).toBe('first edit');
            const attribute = await post('/edit-attribute', { avatar_url: 'alice.png', ch_name: 'Alice', field: 'description', value: 'attribute edit', expected_card_json: savedVersion });
            expect(attribute.status).toBe(200);
            expect((await attribute.json()).canonical_card_version).toBe(db.prepare('SELECT card_json FROM characters WHERE avatar_filename = ?').get('alice.png').card_json);
            expect((await post('/edit-attribute', { avatar_url: 'alice.png', ch_name: 'Alice', field: 'description', value: 'stale attribute', expected_card_json: savedVersion })).status).toBe(409);
            expect(JSON.parse(db.prepare('SELECT card_json FROM characters WHERE avatar_filename = ?').get('alice.png').card_json).description).toBe('attribute edit');
            const currentVersion = db.prepare('SELECT card_json FROM characters WHERE avatar_filename = ?').get('alice.png').card_json;
            expect((await post('/merge-attributes', { avatar: 'alice.png', description: 'missing version' })).status).toBe(400);
            const merged = await post('/merge-attributes', { avatar: 'alice.png', description: 'merged', expected_card_json: currentVersion });
            expect(merged.status).toBe(200);
            expect((await merged.json()).canonical_card_version).toBe(db.prepare('SELECT card_json FROM characters WHERE avatar_filename = ?').get('alice.png').card_json);
            expect((await post('/merge-attributes', { avatar: 'alice.png', description: 'stale merge', expected_card_json: currentVersion })).status).toBe(409);
            expect(JSON.parse(db.prepare('SELECT card_json FROM characters WHERE avatar_filename = ?').get('alice.png').card_json).description).toBe('merged');
            const bob = JSON.parse(db.prepare('SELECT card_json FROM characters WHERE avatar_filename = ?').get('alice.png').card_json);
            upsertCanonicalCharacter(db, { id: 'character-bob.png', avatarFilename: 'bob.png', fullPayload: { ...bob, avatar: 'bob.png' }, shallowPayload: { name: 'Bob', avatar: 'bob.png' }, createdAtMs: 1700000000000, updatedAtMs: 1700000000000 });
            const bobVersion = db.prepare('SELECT card_json FROM characters WHERE avatar_filename = ?').get('bob.png').card_json;
            const bulk = await post('/merge-attributes', { avatars: ['alice.png', 'bob.png'], data: { description: 'bulk' }, expected_card_json_by_avatar: { 'alice.png': currentVersion, 'bob.png': bobVersion } });
            expect(bulk.status).toBe(200);
            const bulkResult = await bulk.json();
            expect(bulkResult.updated).toEqual(['bob.png']);
            expect(bulkResult.failed).toEqual(['alice.png']);
            expect(bulkResult.conflicts).toEqual(['alice.png']);
            expect(bulkResult.canonical_card_versions['bob.png']).toBe(db.prepare('SELECT card_json FROM characters WHERE avatar_filename = ?').get('bob.png').card_json);
            expect(JSON.parse(db.prepare('SELECT card_json FROM characters WHERE avatar_filename = ?').get('alice.png').card_json).description).toBe('merged');
            const noSnapshots = await post('/merge-attributes', { avatars: ['alice.png'], data: { description: 'unsafe' } });
            expect((await noSnapshots.json()).failed).toContain('alice.png');
            expect(JSON.parse(db.prepare('SELECT card_json FROM characters WHERE avatar_filename = ?').get('alice.png').card_json).description).toBe('merged');
        } finally {
            await new Promise(resolve => server.close(resolve));
        }
    });

    test('BYAF import does not overwrite a colliding canonical chat or assign it as the imported character default', async () => {
        const directories = makeDirectories();
        const db = openDb(directories);
        const nowMs = Date.UTC(2026, 0, 2, 3, 4, 5, 6);
        const clock = jest.spyOn(Date, 'now').mockReturnValue(nowMs);
        try {
            const ownerId = 'BYAF Alice';
            const chatName = `Collision - ${humanizedDateTime(nowMs)} imported.jsonl`;
            const sourcePath = `chats/${ownerId}/${chatName}`;
            const existingJsonl = JSON.stringify([
                { chat_metadata: { source: 'pre-existing' } },
                { name: 'User', mes: 'Keep this chat', send_date: '2026-01-01T00:00:00.000Z' },
            ].map(row => row));
            const existingPayload = JSON.parse(existingJsonl);
            upsertCanonicalChatSession(db, createCanonicalChatSessionRecord(db, {
                locator: { ownerType: 'character', ownerId, sourcePath },
                payload: existingPayload,
                nowMs,
            }));
            const canonicalBefore = db.prepare(`
                SELECT source_jsonl FROM chat_sessions
                WHERE owner_type = 'character' AND owner_id = ? AND source_path = ?
            `).get(ownerId, sourcePath).source_jsonl;

            const uploadName = 'import.byaf';
            const uploadPath = path.join(directories.root, uploadName);
            await writeByafArchive(uploadPath, [
                {
                    name: 'manifest.json',
                    data: { characters: ['characters/card.json'], scenarios: ['scenarios/collision.json'], author: {} },
                },
                {
                    name: 'characters/card.json',
                    data: { name: 'BYAF Alice', displayName: ownerId, persona: '', images: [] },
                },
                {
                    name: 'scenarios/collision.json',
                    data: { title: 'Collision', firstMessages: [], messages: [] },
                },
            ]);

            const response = await callByafImport(directories, uploadName);
            expect(response.statusCode).toBe(200);
            expect(response.body).toEqual({
                file_name: ownerId,
                report: { scenarios: { conflicts: 1, failed: [{ name: 'Collision', reason: 'conflict' }] } },
            });
            const { avatar, toastr } = await runByafImportNotice(response);
            expect(avatar).toBe(`${ownerId}.png`);
            expect(toastr.warning).toHaveBeenCalledWith(expect.stringMatching(/1.*conflict/i), 'Character import');
            expect(toastr.warning).toHaveBeenCalledWith(expect.stringMatching(/Collision.*already exists/i), 'Character import', { escapeHtml: true });
            const canonicalAfter = db.prepare(`
                SELECT source_jsonl FROM chat_sessions
                WHERE owner_type = 'character' AND owner_id = ? AND source_path = ?
            `).get(ownerId, sourcePath).source_jsonl;
            expect(canonicalAfter).toBe(canonicalBefore);

            const importedCard = JSON.parse(db.prepare('SELECT card_json FROM characters WHERE avatar_filename = ?').get(`${ownerId}.png`).card_json);
            expect(importedCard.chat).not.toBe(path.basename(chatName, path.extname(chatName)));
        } finally {
            clock.mockRestore();
        }
    });

    test('BYAF import reports failed writes by name and keeps committed scenarios and backgrounds', async () => {
        const directories = makeDirectories();
        const db = openDb(directories);
        const ownerId = 'Mixed BYAF';
        const failedBackground = fs.readFileSync(path.join(repoRoot, 'public/img/user-default.png'));
        expect(failedBackground.length).not.toBe(REAL_AVATAR_PNG.length);
        db.exec(`
            CREATE TEMP TRIGGER fail_byaf_chat BEFORE INSERT ON chat_sessions
            WHEN NEW.source_path LIKE 'chats/Mixed BYAF/Failed%'
            BEGIN SELECT RAISE(ABORT, 'test chat write failure'); END;
            CREATE TEMP TRIGGER fail_byaf_background BEFORE INSERT ON media_references
            WHEN NEW.owner_type = 'user_image' AND NEW.blob_id IN (
                SELECT id FROM managed_blobs WHERE size_bytes = ${failedBackground.length}
            )
            BEGIN SELECT RAISE(ABORT, 'test background write failure'); END;
        `);

        const uploadName = 'mixed.byaf';
        await writeByafArchive(path.join(directories.root, uploadName), [
            { name: 'manifest.json', data: { characters: ['card.json'], scenarios: ['failed.json', 'kept.json'], author: {} } },
            { name: 'card.json', data: { name: ownerId, displayName: ownerId, persona: '', images: [] } },
            { name: 'failed.json', data: { title: 'Failed <draft>', firstMessages: [], messages: [], backgroundImage: 'bg/rejected.png' } },
            { name: 'kept.json', data: { title: 'Kept', firstMessages: [{ text: 'Welcome' }], messages: [], backgroundImage: 'bg/kept.png' } },
            { name: 'bg/rejected.png', data: failedBackground },
            { name: 'bg/kept.png', data: REAL_AVATAR_PNG },
        ]);

        const response = await callByafImport(directories, uploadName);
        expect(response.statusCode).toBe(200);
        expect(response.body).toEqual({
            file_name: ownerId,
            report: {
                scenarios: { conflicts: 0, failed: [{ name: 'Failed <draft>', reason: 'write_failed' }] },
                backgrounds: { failed: [{ name: 'rejected.png', reason: 'write_failed' }] },
            },
        });
        const sessions = db.prepare('SELECT source_path, source_jsonl FROM chat_sessions WHERE owner_id = ?').all(ownerId);
        expect(sessions).toEqual([{
            source_path: expect.stringMatching(/^chats\/Mixed BYAF\/Kept - .* imported\.jsonl$/),
            source_jsonl: expect.stringContaining('Welcome'),
        }]);
        const importedCard = JSON.parse(db.prepare('SELECT card_json FROM characters WHERE avatar_filename = ?').get(`${ownerId}.png`).card_json);
        expect(importedCard.chat).toBe(path.basename(sessions[0].source_path, '.jsonl'));
        const [backgroundPath] = JSON.parse(sessions[0].source_jsonl.split('\n')[0]).chat_metadata.chat_backgrounds;
        expect(backgroundPath).toMatch(/^\/user\/images\/Mixed BYAF\//);
        expect(readManagedMediaContent(db, directories, backgroundPath.slice(1))).toMatchObject({ contents: REAL_AVATAR_PNG });

        const { avatar, toastr } = await runByafImportNotice(response);
        expect(avatar).toBe(`${ownerId}.png`);
        expect(toastr.success).toHaveBeenCalledTimes(1);
        expect(toastr.warning).toHaveBeenCalledWith(expect.stringMatching(/scenario.*Failed <draft>.*could not be saved/i), 'Character import', { escapeHtml: true });
        expect(toastr.warning).toHaveBeenCalledWith(expect.stringMatching(/background.*rejected\.png.*could not be saved/i), 'Character import', { escapeHtml: true });
    });

    test('renaming an unmapped legacy grant does not bind it to a canonical identity', async () => {
        const directories = makeDirectories();
        const { db } = await seedCanonicalCharacter(directories);
        const doc = getCanonicalSettingsDocument(db, { userId: 'alice' });
        doc.payload.power_user.external_media_allowed_overrides = ['alice.png'];
        upsertCanonicalSettingsDocument(db, { userId: 'alice', expectedRevision: doc.revision, payload: doc.payload });
        const renamed = makeResponse();
        await getRouteHandler('/rename')({ body: { avatar_url: 'alice.png', new_name: 'AliceTwo' }, user: { directories, profile: { handle: 'alice' } } }, renamed);
        expect(renamed.statusCode).toBe(200);
        expect(getCanonicalSettingsDocument(db, { userId: 'alice' }).payload.power_user.external_media_authorization_canonical_ids?.['AliceTwo.png']).toBeUndefined();
    });
    test('a revoke submitted against the old avatar after rename persists against the same identity', async () => {
        const original = process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED;
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED = 'true';
        try {
            const directories = makeDirectories();
            const { db } = await seedCanonicalCharacter(directories);
            const user = { directories, profile: { handle: 'alice' } };
            const authorization = settingsRouter.stack.find(entry => entry.route?.path === '/character-css-authorization').route.stack.at(-1).handle;
            const grant = makeResponse();
            await authorization({ body: { characterId: 'alice.png', canonicalId: 'character-alice.png', allowed: true }, user }, grant);
            expect({ status: grant.statusCode, body: grant.body }).toEqual(expect.objectContaining({ status: 200 }));
            const renamed = makeResponse();
            await getRouteHandler('/rename')({ body: { avatar_url: 'alice.png', new_name: 'AliceTwo' }, user }, renamed);
            expect(renamed.statusCode).toBe(200);
            const revoke = makeResponse();
            await authorization({ body: { characterId: 'alice.png', canonicalId: 'character-alice.png', allowed: false }, user }, revoke);
            expect(revoke.statusCode).toBe(200);
            expect(getCanonicalSettingsDocument(db, { userId: 'alice' }).payload.power_user.external_media_allowed_overrides).not.toContain('AliceTwo.png');
        } finally {
            if (original === undefined) delete process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED;
            else process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED = original;
        }
    });
    test('recreating a soft-deleted avatar gets a new canonical identity', async () => {
        const directories = makeDirectories();
        const db = openDb(directories);
        const firstCard = makeCard('First');
        upsertCanonicalCharacter(db, {
            id: 'first-identity',
            avatarFilename: 'reused.png',
            fullPayload: { ...firstCard, avatar: 'reused.png' },
            shallowPayload: { name: 'First', avatar: 'reused.png' },
            createdAtMs: 1,
            updatedAtMs: 1,
        });
        expect(markCanonicalCharacterDeleted(db, { avatarFilename: 'reused.png', deletedAtMs: 2 }).changes).toBe(1);

        const secondCard = makeCard('Second');
        upsertCanonicalCharacter(db, {
            id: 'second-identity',
            avatarFilename: 'reused.png',
            fullPayload: { ...secondCard, avatar: 'reused.png' },
            shallowPayload: { name: 'Second', avatar: 'reused.png' },
            createdAtMs: 3,
            updatedAtMs: 3,
        });

        expect(db.prepare('SELECT id, deleted_at_ms FROM characters WHERE avatar_filename = ?').get('reused.png')).toEqual({
            id: 'second-identity',
            deleted_at_ms: null,
        });
    });

    test('audit suppresses fileless canonical rows and keeps the slice readable', async () => {
        const directories = makeDirectories();
        const { audit } = await seedCanonicalCharacter(directories);

        expect(audit.ok).toBe(true);
        expect(audit.hasDrift).toBe(false);
        expect(audit.entries).toEqual([
            expect.objectContaining({
                avatar_filename: 'alice.png',
                status: 'drift',
                drift_types: ['missing_projection_file'],
                details: expect.objectContaining({ suppressed: true, projection_mode: 'off' }),
            }),
        ]);
    });

    test('/all and /get serve canonical rows with no PNG projections on disk', async () => {
        const directories = makeDirectories();
        await seedCanonicalCharacter(directories);
        expect(fs.readdirSync(directories.characters)).toEqual([]);

        const allResponse = makeResponse();
        await getRouteHandler('/all')({
            body: {},
            user: { directories, profile: { handle: 'alice' } },
        }, allResponse);

        expect(allResponse.statusCode).toBe(200);
        expect(allResponse.body).toEqual([
            expect.objectContaining({ avatar: 'alice.png', name: 'Alice' }),
        ]);

        const getResponse = makeResponse();
        await getRouteHandler('/get')({
            body: { avatar_url: 'alice.png' },
            user: { directories, profile: { handle: 'alice' } },
        }, getResponse);

        expect(getResponse.statusCode).toBe(200);
        expect(getResponse.body).toEqual(expect.objectContaining({
            avatar: 'alice.png',
            name: 'Alice',
        }));
        expect(fs.readdirSync(directories.characters)).toEqual([]);
    });

    test('/chats lists canonical chat sessions with no JSONL files on disk', async () => {
        const directories = makeDirectories();
        const { db } = await seedCanonicalCharacter(directories);
        await seedCanonicalChat(directories, db);

        const response = makeResponse();
        await getRouteHandler('/chats')({
            body: { avatar_url: 'alice.png', metadata: true },
            user: { directories, profile: { handle: 'alice' } },
        }, response);

        expect(response.statusCode).toBe(200);
        expect(response.body).toEqual([
            expect.objectContaining({
                file_name: 'first.jsonl',
                file_id: 'first',
                chat_items: 1,
                mes: 'Hello Alice',
                chat_metadata: { integrity: 'canonical-chat' },
            }),
        ]);
    });

    test('/export json serves canonical card data with no PNG on disk', async () => {
        const directories = makeDirectories();
        await seedCanonicalCharacter(directories);

        const response = makeResponse();
        await getRouteHandler('/export')({
            body: { format: 'json', avatar_url: 'alice.png' },
            user: { directories, profile: { handle: 'alice' } },
        }, response);

        expect(response.statusCode).toBe(200);
        const exported = JSON.parse(response.body);
        expect(exported).toEqual(expect.objectContaining({ name: 'Alice' }));
    });

    test('/export png synthesizes the card PNG from canonical data and the avatar blob', async () => {
        const directories = makeDirectories();
        await seedCanonicalCharacter(directories);
        const blobResult = await recordCharacterAvatarBlob({
            handle: 'alice',
            directories,
            avatarFilename: 'alice.png',
            contents: REAL_AVATAR_PNG,
        });
        expect(blobResult.authorityCommitted).toBe(true);

        const response = makeResponse();
        await getRouteHandler('/export')({
            body: { format: 'png', avatar_url: 'alice.png' },
            user: { directories, profile: { handle: 'alice' } },
        }, response);

        expect(response.statusCode).toBe(200);
        const cardJson = read(Buffer.from(response.body));
        expect(JSON.parse(cardJson)).toEqual(expect.objectContaining({ name: 'Alice' }));
        expect(fs.existsSync(path.join(directories.characters, 'alice.png'))).toBe(false);
    });

    test('a fileless PNG moves between isolated users and only a local live card can be replaced', async () => {
        const directories = makeDirectories();
        const target = makeDirectories();
        const { db } = await seedCanonicalCharacter(directories, { world: 'Lorebook' });
        const targetDb = openDb(target, 'bob');
        const sourceUser = { directories, profile: { handle: 'alice' } };
        const targetUser = { directories: target, profile: { handle: 'bob' } };

        const avatar = fs.readFileSync(path.join(repoRoot, 'public/img/user-default.png'));
        expect((await recordCharacterAvatarBlob({
            handle: 'alice', directories, avatarFilename: 'alice.png', contents: avatar,
        })).authorityCommitted).toBe(true);

        const invoke = async (owner, route, user, options) => {
            const response = makeResponse();
            await getRouteHandler(route, owner)({ user, get: () => undefined, ...options }, response);
            return response;
        };
        const world = { entries: { 0: { uid: 0, key: ['test'], content: 'A canonical world entry' } } };
        const importWorld = async (user, contents) => {
            fs.writeFileSync(path.join(user.directories.root, 'world.json'), contents);
            return invoke(worldRouter, '/import', user, {
                body: {}, file: { originalname: 'Lorebook.json', destination: user.directories.root, filename: 'world.json' },
            });
        };
        expect(await importWorld(sourceUser, JSON.stringify(world))).toMatchObject({ statusCode: 200, body: { name: 'Lorebook' } });
        const exportedWorld = await invoke(worldRouter, '/get', sourceUser, { body: { name: 'Lorebook' } });
        expect(exportedWorld).toMatchObject({ statusCode: 200, body: world });
        expect(await importWorld(targetUser, JSON.stringify(exportedWorld.body))).toMatchObject({ statusCode: 200, body: { name: 'Lorebook' } });
        expect(await invoke(worldRouter, '/get', targetUser, { body: { name: 'Lorebook' } })).toMatchObject({ statusCode: 200, body: world });

        const exported = makeResponse();
        await getRouteHandler('/export')({ body: { format: 'png', avatar_url: 'alice.png' }, user: sourceUser }, exported);
        expect(exported.statusCode).toBe(200);

        const importCard = async preservedName => {
            fs.writeFileSync(path.join(target.root, 'upload.png'), exported.body);
            const response = makeResponse();
            await getRouteHandler('/import')({
                body: { file_type: 'png', preserved_name: preservedName },
                file: { destination: target.root, filename: 'upload.png' },
                user: targetUser,
            }, response);
            expect(response.statusCode).toBe(200);
            return response.body;
        };

        expect(await importCard('alice.png')).toEqual({ file_name: 'Alice', report: { ignored: ['replacement-target-not-found'] } });
        const readTargetCard = () => targetDb.prepare('SELECT id, avatar_filename, world_name FROM characters WHERE deleted_at_ms IS NULL').all();
        const imported = readTargetCard();
        expect(imported).toEqual([{ id: expect.any(String), avatar_filename: 'Alice.png', world_name: 'Lorebook' }]);
        expect(await importCard('Alice.png')).toEqual({ file_name: 'Alice' });
        expect(readTargetCard()).toEqual(imported);
        expect(db.prepare('SELECT avatar_filename FROM characters WHERE deleted_at_ms IS NULL').all())
            .toEqual([{ avatar_filename: 'alice.png' }]);

        const reexported = makeResponse();
        await getRouteHandler('/export')({ body: { format: 'png', avatar_url: 'Alice.png' }, user: targetUser }, reexported);
        expect(reexported.statusCode).toBe(200);
        expect(JSON.parse(read(Buffer.from(reexported.body)))).toMatchObject({ name: 'Alice', description: 'Alice description' });
        const imageData = buffer => extractPngChunks(buffer).filter(chunk => chunk.name === 'IDAT');
        expect(imageData(reexported.body)).toEqual(imageData(await applyAvatarCropResize(avatar)));

        await seedCanonicalChat(directories, db);
        const exportChat = (user, avatarUrl, file) => invoke(chatRouter, '/export', user, {
            body: { avatar_url: avatarUrl, file, format: 'jsonl', exportfilename: file },
        });
        const chat = await exportChat(sourceUser, 'alice.png', 'first.jsonl');
        expect(chat).toMatchObject({ statusCode: 200, body: { result: expect.stringContaining('Hello Alice') } });
        const importChat = async () => {
            fs.writeFileSync(path.join(target.root, 'upload.jsonl'), chat.body.result);
            return invoke(chatRouter, '/import', targetUser, {
                body: { avatar_url: 'Alice.png', file_type: 'jsonl', operationId: 'round-trip', character_name: 'Alice', user_name: 'User' },
                file: { destination: target.root, filename: 'upload.jsonl' },
            });
        };
        const importedChat = await importChat();
        expect(importedChat).toMatchObject({ statusCode: 200, body: { res: true, fileNames: [expect.stringMatching(/ imported\.jsonl$/)] } });
        expect((await importChat()).body).toEqual(importedChat.body);
        const [chatFile] = importedChat.body.fileNames;
        const exportedChat = await exportChat(targetUser, 'Alice.png', chatFile);
        expect(exportedChat).toMatchObject({ statusCode: 200, body: { result: chat.body.result } });
        expect(targetDb.prepare('SELECT owner_id, source_path FROM chat_sessions').all()).toEqual([
            { owner_id: 'Alice', source_path: `chats/Alice/${chatFile}` },
        ]);
        expect(fs.existsSync(path.join(directories.chats, 'alice', 'first.jsonl'))).toBe(false);
        expect(fs.existsSync(path.join(target.chats, 'Alice', chatFile))).toBe(false);
        expect(fs.readdirSync(directories.characters)).toEqual([]);
        expect(fs.readdirSync(target.characters)).toEqual([]);
        expect(fs.readdirSync(directories.worlds)).toEqual([]);
        expect(fs.readdirSync(target.worlds)).toEqual([]);
    });

    test('exchanges only the selected chat attachments with another account over HTTP', async () => {
        const directories = makeDirectories();
        const target = { ...makeDirectories(), handle: 'bob' };
        const { db } = await seedCanonicalCharacter(directories);
        const targetDb = openDb(target, 'bob');
        const attachment = 'user/files/source-only.txt';
        const unassociated = 'user/files/not-in-chat.txt';
        const bytes = Buffer.from([0, 255, 123, 17]);
        await ensureCanonicalSliceBackend('managed_media', directories, 'alice');
        for (const [compatibilityPath, contents] of [[attachment, bytes], [unassociated, Buffer.from('not part of this chat')]]) {
            expect(await writeCanonicalManagedMedia({
                handle: 'alice', directories, compatibilityPath, contents, ownerType: 'attachment', role: 'attachment',
            })).toMatchObject({ ok: true });
        }
        const locator = { ownerType: 'character', ownerId: 'alice', sourcePath: 'chats/alice/exchange.jsonl' };
        const payload = [{ chat_metadata: { title: 'Exchange' } }, { name: 'User', mes: 'Message', extra: { file: { url: `/${attachment}` } } }];
        upsertCanonicalChatSession(db, createCanonicalChatSessionRecord(db, { locator, payload }));

        const app = express();
        app.use(express.json());
        app.use(multer({ dest: target.root }).single('avatar'));
        for (const [handle, userDirectories] of [['alice', directories], ['bob', target]]) {
            app.use(`/${handle}`, (request, _response, next) => {
                request.user = { directories: userDirectories, profile: { handle } };
                next();
            }, chatRouter, userFileRouter);
        }
        const server = await new Promise(resolve => {
            const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
        });
        try {
            const url = `http://127.0.0.1:${server.address().port}`;
            const exportChat = format => fetch(`${url}/alice/export`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file: 'exchange.jsonl', avatar_url: 'alice.png', format, exportfilename: `exchange.${format}` }),
            });
            expect(await (await exportChat('txt')).json()).toMatchObject({ result: 'User: Message\n\n' });
            expect(await (await exportChat('jsonl')).json()).toMatchObject({ result: payload.map(row => JSON.stringify(row)).join('\n') });
            const exported = await exportChat('zip');
            expect(exported.status).toBe(200);
            expect(exported.headers.get('content-type')).toMatch(/^application\/zip/);
            const zip = await exported.blob();
            expect(targetDb.prepare('SELECT COUNT(*) AS count FROM media_references').get().count).toBe(0);
            const importChat = (archive = zip, operationId = 'zip-exchange') => {
                const form = new FormData();
                for (const [key, value] of Object.entries({ avatar_url: 'alice.png', file_type: 'zip', operationId, character_name: 'Alice', user_name: 'User' })) {
                    form.set(key, value);
                }
                form.set('avatar', archive, 'exchange.zip');
                return fetch(`${url}/bob/import`, { method: 'POST', body: form });
            };
            const incomplete = new Blob([zipSync({ 'chat.jsonl': Buffer.from('{}') })], { type: 'application/zip' });
            const rejected = await importChat(incomplete, 'incomplete-exchange');
            expect(rejected.status).toBe(400);
            expect(await rejected.json()).toEqual({ error: 'invalid_chat_exchange' });
            expect(targetDb.prepare('SELECT COUNT(*) AS count FROM chat_sessions').get().count).toBe(0);
            expect(targetDb.prepare('SELECT COUNT(*) AS count FROM media_references').get().count).toBe(0);
            const imported = await importChat();
            expect(imported.status).toBe(200);
            const result = await imported.json();
            expect(result).toMatchObject({ res: true, fileNames: [expect.stringMatching(/ imported\.jsonl$/)] });
            expect(await (await importChat()).json()).toEqual(result);
            const [saved] = targetDb.prepare('SELECT source_jsonl FROM chat_sessions').all();
            expect(targetDb.prepare('SELECT COUNT(*) AS count FROM chat_sessions').get().count).toBe(1);
            const rows = saved.source_jsonl.split('\n').map(row => JSON.parse(row));
            const mapped = rows[1].extra.file.url;
            expect(mapped).not.toBe(attachment);
            expect(rows).toEqual([payload[0], { ...payload[1], extra: { file: { url: mapped } } }]);
            expect(targetDb.prepare('SELECT compatibility_path FROM media_references').all()).toEqual([{ compatibility_path: mapped }]);
            expect(readManagedMediaContent(targetDb, target, mapped)).toMatchObject({ contents: bytes });
            const downloaded = await fetch(`${url}/bob/${mapped}`);
            expect(downloaded.status).toBe(200);
            expect(Buffer.from(await downloaded.arrayBuffer())).toEqual(bytes);
        } finally {
            await new Promise(resolve => server.close(resolve));
        }
    });

    test('/delete removes the canonical row and owned chat sessions with no PNG on disk', async () => {
        const directories = makeDirectories();
        const { db } = await seedCanonicalCharacter(directories);
        await seedCanonicalChat(directories, db);

        const response = makeResponse();
        await getRouteHandler('/delete')({
            body: { avatar_url: 'alice.png', delete_chats: true },
            user: { directories, profile: { handle: 'alice' } },
        }, response);

        expect(response.statusCode).toBe(200);
        expect(db.prepare(`
            SELECT deleted_at_ms FROM characters WHERE avatar_filename = 'alice.png'
        `).get().deleted_at_ms).not.toBeNull();
        expect(db.prepare(`
            SELECT COUNT(*) AS count FROM chat_sessions WHERE owner_type = 'character' AND owner_id = 'alice'
        `).get().count).toBe(0);
    });

    test('persisted embedded binding and auxiliary books are cleaned only after the owning card is deleted', async () => {
        const directories = makeDirectories();
        const { db } = await seedCanonicalCharacter(directories, { cardFields: {
            data: { ...makeCard('Alice').data, scenario: '', first_mes: '', creator_notes: '', alternate_greetings: [], tags: [], creator: '', character_version: '', character_book: { name: 'Embedded', entries: [], extensions: {} } },
        } });
        const user = { directories, profile: { handle: 'alice' } };
        const invoke = async (route, body) => {
            const response = makeResponse();
            await getRouteHandler(route)({ body, user }, response);
            return response;
        };
        const getCard = avatar_url => invoke('/get', { avatar_url });
        const bind = async (avatar, world) => invoke('/merge-attributes', {
            avatar, expected_card_json: (await getCard(avatar)).body.canonical_card_version, data: { extensions: { world } },
        });


        for (const name of ['Embedded', 'Auxiliary', 'Shared', 'Global', 'Chat', 'Skipped', 'Unrelated']) {
            upsertCanonicalWorldInfoBook(db, { name, payload: { entries: {} } });
        }
        expect((await bind('alice.png', 'Embedded')).statusCode).toBe(200);
        expect((await getCard('alice.png')).body.data.extensions.world).toBe('Embedded');
        const bob = makeCard('Bob');
        bob.data.extensions.world = 'Shared';
        upsertCanonicalCharacter(db, { id: 'bob', avatarFilename: 'bob.png', fullPayload: bob, shallowPayload: bob, createdAtMs: 1, updatedAtMs: 1 });
        const settings = getCanonicalSettingsDocument(db, { userId: 'alice' });
        upsertCanonicalSettingsDocument(db, {
            userId: 'alice', expectedRevision: settings.revision, payload: { ...settings.payload,
                world_info: { globalSelect: ['Global'], charLore: [{ name: 'alice', extraBooks: ['Auxiliary', 'Shared', 'Global', 'Chat', 'Skipped'] }] },
            },
        });
        await seedCanonicalChat(directories, db, { world: 'Chat' });
        const preflight = await invoke('/delete-preflight', { avatars: ['alice.png', 'bob.png'] });
        expect(preflight.statusCode).toBe(200);
        expect(preflight.body.worldInfos.map(info => info.name)).toEqual(['Embedded', 'Auxiliary', 'Shared', 'Global', 'Chat', 'Skipped']);
        const outcome = await invoke('/delete', { avatar_url: 'alice.png', delete_chats: false, delete_worlds: ['Embedded', 'Auxiliary', 'Shared', 'Global', 'Chat', 'Unrelated'] });
        expect(outcome.body).toEqual({ deletedWorlds: ['Embedded', 'Auxiliary'], projectionWarning: false, worldCleanupWarning: false });
        expect(db.prepare('SELECT name FROM world_books WHERE deleted_at_ms IS NULL ORDER BY name').all().map(row => row.name)).toEqual(['Chat', 'Global', 'Shared', 'Skipped', 'Unrelated']);
        expect((await getCard('bob.png')).body.data.extensions.world).toBe('Shared');
        expect((await invoke('/delete', { avatar_url: 'bob.png', delete_worlds: ['Shared'] })).body.deletedWorlds).toEqual(['Shared']);
    });

    test('a failed world cleanup preserves its books without rolling back the card deletion', async () => {
        const directories = makeDirectories();
        const { db } = await seedCanonicalCharacter(directories, { world: 'Keep on failure' });
        upsertCanonicalWorldInfoBook(db, { name: 'Keep on failure', payload: { entries: {} } });
        db.exec(`CREATE TRIGGER reject_world_delete BEFORE UPDATE OF deleted_at_ms ON world_books
            WHEN NEW.deleted_at_ms IS NOT NULL BEGIN SELECT RAISE(ABORT, 'test cleanup failure'); END`);
        const response = makeResponse();
        await getRouteHandler('/delete')({
            body: { avatar_url: 'alice.png', delete_worlds: ['Keep on failure'] },
            user: { directories, profile: { handle: 'alice' } },
        }, response);
        expect(response.statusCode).toBe(200);
        expect(response.body).toEqual({ deletedWorlds: [], projectionWarning: false, worldCleanupWarning: true });
        expect(db.prepare('SELECT deleted_at_ms FROM characters WHERE avatar_filename = ?').get('alice.png').deleted_at_ms).not.toBeNull();
        expect(db.prepare('SELECT deleted_at_ms FROM world_books WHERE name = ?').get('Keep on failure').deleted_at_ms).toBeNull();
    });

    test.each(['Legacy Global', ['Legacy Global']])('keeps a book enabled by the legacy world_info setting %j', async worldInfo => {
        const directories = makeDirectories();
        const { db } = await seedCanonicalCharacter(directories, { world: 'Legacy Global' });
        upsertCanonicalWorldInfoBook(db, { name: 'Legacy Global', payload: { entries: {} } });
        const settings = getCanonicalSettingsDocument(db, { userId: 'alice' });
        upsertCanonicalSettingsDocument(db, {
            userId: 'alice', expectedRevision: settings.revision, payload: { ...settings.payload, world_info: worldInfo },
        });
        const response = makeResponse();
        await getRouteHandler('/delete')({ body: { avatar_url: 'alice.png', delete_worlds: ['Legacy Global'] }, user: { directories, profile: { handle: 'alice' } } }, response);
        expect(response.statusCode).toBe(200);
        expect(response.body.deletedWorlds).toEqual([]);
    });

    test('preserves the book and warns if standalone world writes are blocked', async () => {
        const directories = makeDirectories();
        const { db } = await seedCanonicalCharacter(directories, { world: 'Blocked book' });
        await ensureCanonicalSliceBackend('world_info', directories, 'alice');
        upsertCanonicalWorldInfoBook(db, { name: 'Blocked book', payload: { entries: {} } });
        persistCanonicalAuditStatus(db, {
            ok: false, handle: 'alice', hasDrift: true, blocking: true, reason: 'audit_drift_blocked', entries: [{ status: 'drift' }],
        }, { scope: 'world_info' });
        const response = makeResponse();
        await getRouteHandler('/delete')({ body: { avatar_url: 'alice.png', delete_worlds: ['Blocked book'] }, user: { directories, profile: { handle: 'alice' } } }, response);
        expect(response.statusCode).toBe(200);
        expect(response.body).toEqual({ deletedWorlds: [], worldCleanupWarning: true, projectionWarning: false });
        expect(db.prepare('SELECT deleted_at_ms FROM characters WHERE avatar_filename = ?').get('alice.png').deleted_at_ms).not.toBeNull();
        expect(db.prepare('SELECT deleted_at_ms FROM world_books WHERE name = ?').get('Blocked book').deleted_at_ms).toBeNull();
    });

    test('/rename retargets canonical chat sessions when no PNG exists', async () => {
        const directories = makeDirectories();
        const { db } = await seedCanonicalCharacter(directories);
        await seedCanonicalChat(directories, db);

        const response = makeResponse();
        await getRouteHandler('/rename')({
            body: { avatar_url: 'alice.png', new_name: 'AliceTwo' },
            user: { directories, profile: { handle: 'alice' } },
        }, response);

        expect(response.statusCode).toBe(200);
        expect(db.prepare(`
            SELECT avatar_filename FROM characters WHERE avatar_filename = 'AliceTwo.png' AND deleted_at_ms IS NULL
        `).get()).toBeTruthy();
        expect(db.prepare(`
            SELECT owner_id, source_path FROM chat_sessions WHERE owner_type = 'character'
        `).all()).toEqual([
            expect.objectContaining({ owner_id: 'AliceTwo', source_path: 'chats/AliceTwo/first.jsonl' }),
        ]);
        // The listing endpoint sees the renamed owner's chats without JSONL files.
        const chatsResponse = makeResponse();
        await getRouteHandler('/chats')({
            body: { avatar_url: 'AliceTwo.png' },
            user: { directories, profile: { handle: 'alice' } },
        }, chatsResponse);
        expect(chatsResponse.body).toEqual([
            expect.objectContaining({ file_name: 'first.jsonl' }),
        ]);
    });
});
