import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import archiver from 'archiver';
import { afterEach, describe, expect, jest, test } from '@jest/globals';

import { humanizedDateTime, setConfigFilePath } from '../src/util.js';
import { canonicalSqliteManager } from '../src/canonical-sqlite.js';
import { runCanonicalMigrations } from '../src/canonical-sqlite-migrations.js';
import { auditCanonicalShadowImport } from '../src/canonical-sqlite-shadow-import.js';
import { auditCanonicalChatShadowImport } from '../src/canonical-chat-shadow-import.js';
import { markCanonicalCharacterDeleted, upsertCanonicalCharacter } from '../src/endpoints/character-store.js';
import {
    createCanonicalChatSessionRecord,
    upsertCanonicalChatSession,
} from '../src/endpoints/canonical-chat-store.js';
import { recordCharacterAvatarBlob } from '../src/canonical-avatar-blob-service.js';
import { getCanonicalSettingsDocument, upsertCanonicalSettingsDocument } from '../src/endpoints/settings-store.js';
import { read } from '../src/character-card-parser.js';

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
].join('\n'), 'utf8');
setConfigFilePath(configPath);

const { router } = await import('../src/endpoints/characters.js');
const { router: settingsRouter } = await import('../src/endpoints/settings.js');

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

function getRouteHandler(routePath) {
    const layer = router.stack.find(entry => entry.route?.path === routePath);
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
        const archive = archiver('zip');
        output.on('close', resolve);
        output.on('error', reject);
        archive.on('warning', reject);
        archive.on('error', reject);
        archive.pipe(output);
        for (const entry of entries) {
            archive.append(JSON.stringify(entry.data), { name: entry.name });
        }
        archive.finalize();
    });
}

function openDb(directories) {
    const db = canonicalSqliteManager.open({
        handle: 'alice',
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

async function seedCanonicalCharacter(directories, { avatarFilename = 'alice.png', name = 'Alice' } = {}) {
    const db = openDb(directories);
    const cardData = makeCard(name);
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

async function seedCanonicalChat(directories, db, { ownerId = 'alice', fileName = 'first' } = {}) {
    const payload = [
        { chat_metadata: { integrity: 'canonical-chat' } },
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

            expect(response.statusCode).toBe(200);
            expect(response.body).toEqual({ file_name: ownerId });
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
