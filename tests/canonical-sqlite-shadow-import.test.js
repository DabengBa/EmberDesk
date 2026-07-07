import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, jest, test } from '@jest/globals';

import { createCanonicalSqliteManager } from '../src/canonical-sqlite.js';
import {
    auditCanonicalShadowImport,
    runCanonicalShadowImport,
} from '../src/canonical-sqlite-shadow-import.js';
import { buildCharacterFileSnapshotRow } from '../src/endpoints/character-file-snapshot.js';

const tempRoots = [];
const managers = [];

function makeRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-canonical-shadow-import-'));
    tempRoots.push(root);
    return root;
}

function createDirectories(root) {
    const directories = {
        root,
        storage: path.join(root, 'storage'),
        characters: path.join(root, 'characters'),
        chats: path.join(root, 'chats'),
        worlds: path.join(root, 'worlds'),
    };
    for (const directory of Object.values(directories)) {
        if (directory !== root) {
            fs.mkdirSync(directory, { recursive: true });
        }
    }
    return directories;
}

function createLogger() {
    return {
        info: jest.fn(),
        warn: jest.fn(),
    };
}

function createManager(options = {}) {
    const manager = createCanonicalSqliteManager({
        logger: createLogger(),
        ...options,
    });
    managers.push(manager);
    return manager;
}

function writeCharacterFile(directories, avatar, payload) {
    fs.writeFileSync(
        path.join(directories.characters, avatar),
        JSON.stringify(payload),
        'utf8',
    );
}

function writeWorldFile(directories, worldName, payload = { entries: {} }) {
    fs.writeFileSync(
        path.join(directories.worlds, `${worldName}.json`),
        JSON.stringify(payload),
        'utf8',
    );
}

function writeChatFile(directories, avatar, fileName, contents) {
    const chatDirectory = path.join(directories.chats, path.parse(avatar).name);
    fs.mkdirSync(chatDirectory, { recursive: true });
    fs.writeFileSync(path.join(chatDirectory, fileName), contents, 'utf8');
}

function createSnapshotBuilder() {
    return (avatar, directories) => buildCharacterFileSnapshotRow({
        avatar,
        directories,
        readCharacterData: async filePath => fs.readFileSync(filePath, 'utf8'),
        getCharaCardV2: jsonObject => jsonObject,
    });
}

afterEach(() => {
    for (const manager of managers.splice(0, managers.length)) {
        manager.dispose();
    }
    for (const root of tempRoots.splice(0, tempRoots.length)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

describe('canonical sqlite shadow import', () => {
    test('imports canonical character metadata and chat stats idempotently without rewriting files', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const buildSnapshotRow = createSnapshotBuilder();

        writeWorldFile(directories, 'Lore');
        writeCharacterFile(directories, 'alpha.png', {
            name: 'Alpha',
            chat: 'Alpha - chat',
            fav: false,
            tags: ['hero'],
            data: {
                name: 'Alpha',
                extensions: {
                    fav: false,
                    world: 'Lore',
                },
                tags: ['hero'],
            },
        });
        writeCharacterFile(directories, 'beta.png', {
            name: 'Beta',
            chat: 'Beta - chat',
            fav: false,
            tags: [],
            data: {
                name: 'Beta',
                extensions: {
                    fav: false,
                    world: '',
                },
                tags: [],
            },
        });
        writeChatFile(directories, 'alpha.png', 'one.jsonl', '{"mes":"one"}\n');
        writeChatFile(directories, 'alpha.png', 'two.jsonl', '{"mes":"two"}\n');
        writeChatFile(directories, 'beta.png', 'solo.jsonl', '{"mes":"solo"}\n');

        const alphaStatBefore = fs.statSync(path.join(directories.characters, 'alpha.png')).mtimeMs;

        const first = await runCanonicalShadowImport({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, shadowImport: true, strict: false },
            manager,
            buildSnapshotRow,
            nowMs: 1735689600000,
        });

        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });

        expect(first).toEqual(expect.objectContaining({
            ok: true,
            skipped: false,
            importedCount: 2,
            unchangedCount: 0,
            failedCount: 0,
        }));
        const alphaId = db.prepare('SELECT id FROM characters WHERE avatar_filename = ?').get('alpha.png').id;
        expect(db.prepare('SELECT COUNT(*) AS count FROM characters').get().count).toBe(2);
        expect(db.prepare('SELECT COUNT(*) AS count FROM character_chat_stats').get().count).toBe(2);
        expect(db.prepare('SELECT world_name FROM characters WHERE avatar_filename = ?').get('alpha.png').world_name).toBe('Lore');
        expect(db.prepare('SELECT chat_count, chat_size_bytes FROM character_chat_stats WHERE character_id = (SELECT id FROM characters WHERE avatar_filename = ?)').get('alpha.png'))
            .toEqual(expect.objectContaining({ chat_count: 2, chat_size_bytes: expect.any(Number) }));
        expect(alphaId).toMatch(/^[0-9a-f-]{36}$/i);

        const second = await runCanonicalShadowImport({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, shadowImport: true, strict: false },
            manager,
            buildSnapshotRow,
            nowMs: 1735689609999,
        });

        expect(second).toEqual(expect.objectContaining({
            ok: true,
            skipped: false,
            importedCount: 0,
            unchangedCount: 2,
            failedCount: 0,
        }));
        expect(db.prepare('SELECT id FROM characters WHERE avatar_filename = ?').get('alpha.png').id).toBe(alphaId);
        expect(db.prepare('SELECT COUNT(*) AS count FROM characters').get().count).toBe(2);
        expect(db.prepare('SELECT COUNT(*) AS count FROM character_chat_stats').get().count).toBe(2);
        expect(fs.statSync(path.join(directories.characters, 'alpha.png')).mtimeMs).toBe(alphaStatBefore);
    });

    test('preserves the canonical character id when re-import updates an existing avatar row', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const buildSnapshotRow = createSnapshotBuilder();

        writeCharacterFile(directories, 'alpha.png', {
            name: 'Alpha',
            chat: 'Alpha - chat',
            fav: false,
            tags: [],
            data: { name: 'Alpha', extensions: { fav: false, world: '' }, tags: [] },
        });

        await runCanonicalShadowImport({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, shadowImport: true, strict: false },
            manager,
            buildSnapshotRow,
            nowMs: 1735689600000,
        });

        writeCharacterFile(directories, 'alpha.png', {
            name: 'Alpha Revised',
            chat: 'Alpha - chat',
            fav: false,
            tags: ['updated'],
            data: { name: 'Alpha Revised', extensions: { fav: false, world: '' }, tags: ['updated'] },
        });

        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        const originalId = db.prepare('SELECT id FROM characters WHERE avatar_filename = ?').get('alpha.png').id;

        const result = await runCanonicalShadowImport({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, shadowImport: true, strict: false },
            manager,
            buildSnapshotRow,
            nowMs: 1735689609999,
        });

        expect(result).toEqual(expect.objectContaining({
            ok: true,
            updatedCount: 1,
            failedCount: 0,
        }));
        expect(db.prepare('SELECT id, display_name FROM characters WHERE avatar_filename = ?').get('alpha.png')).toEqual({
            id: originalId,
            display_name: 'Alpha Revised',
        });
    });

    test('matches the existing chat-directory naming semantics for avatars containing .png in the basename', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const buildSnapshotRow = createSnapshotBuilder();

        writeCharacterFile(directories, 'my.png.character.png', {
            name: 'Edge Case',
            chat: 'Edge Case - chat',
            fav: false,
            tags: [],
            data: { name: 'Edge Case', extensions: { fav: false, world: '' }, tags: [] },
        });
        fs.mkdirSync(path.join(directories.chats, 'my.character.png'), { recursive: true });
        fs.writeFileSync(path.join(directories.chats, 'my.character.png', 'odd.jsonl'), '{"mes":"edge"}\n', 'utf8');

        const result = await runCanonicalShadowImport({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, shadowImport: true, strict: false },
            manager,
            buildSnapshotRow,
            nowMs: 1735689600000,
        });

        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });

        expect(result).toEqual(expect.objectContaining({
            ok: true,
            importedCount: 1,
            failedCount: 0,
        }));
        expect(db.prepare(`
            SELECT chat_count, chat_size_bytes
            FROM character_chat_stats
            WHERE character_id = (SELECT id FROM characters WHERE avatar_filename = ?)
        `).get('my.png.character.png')).toEqual(expect.objectContaining({
            chat_count: 1,
            chat_size_bytes: expect.any(Number),
        }));
    });

    test('records per-character failures without clearing already imported canonical rows', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const buildSnapshotRow = jest.fn((avatar, currentDirectories) => {
            if (avatar === 'broken.png') {
                throw new Error('broken snapshot');
            }
            return buildCharacterFileSnapshotRow({
                avatar,
                directories: currentDirectories,
                readCharacterData: async filePath => fs.readFileSync(filePath, 'utf8'),
                getCharaCardV2: jsonObject => jsonObject,
            });
        });

        writeCharacterFile(directories, 'alpha.png', {
            name: 'Alpha',
            chat: 'Alpha - chat',
            fav: false,
            tags: [],
            data: { name: 'Alpha', extensions: { fav: false, world: '' }, tags: [] },
        });
        writeCharacterFile(directories, 'broken.png', {
            name: 'Broken',
            chat: 'Broken - chat',
            fav: false,
            tags: [],
            data: { name: 'Broken', extensions: { fav: false, world: '' }, tags: [] },
        });

        const result = await runCanonicalShadowImport({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, shadowImport: true, strict: false },
            manager,
            buildSnapshotRow,
            nowMs: 1735689600000,
        });

        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });

        expect(result).toEqual(expect.objectContaining({
            ok: false,
            skipped: false,
            importedCount: 1,
            failedCount: 1,
        }));
        expect(result.entries).toEqual(expect.arrayContaining([
            expect.objectContaining({
                avatar_filename: 'broken.png',
                status: 'error',
                errorMessage: expect.stringContaining('broken snapshot'),
            }),
        ]));
        expect(db.prepare('SELECT COUNT(*) AS count FROM characters').get().count).toBe(1);
        expect(db.prepare('SELECT avatar_filename FROM characters').get().avatar_filename).toBe('alpha.png');
    });

    test('audits payload, stats, world-binding, and missing-row drift with machine-readable entries', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const buildSnapshotRow = createSnapshotBuilder();

        writeWorldFile(directories, 'Lore');
        writeWorldFile(directories, 'Archive');
        writeCharacterFile(directories, 'alpha.png', {
            name: 'Alpha',
            chat: 'Alpha - chat',
            fav: false,
            tags: [],
            data: { name: 'Alpha', extensions: { fav: false, world: '' }, tags: [] },
        });
        writeCharacterFile(directories, 'beta.png', {
            name: 'Beta',
            chat: 'Beta - chat',
            fav: false,
            tags: [],
            data: { name: 'Beta', extensions: { fav: false, world: '' }, tags: [] },
        });
        writeCharacterFile(directories, 'gamma.png', {
            name: 'Gamma',
            chat: 'Gamma - chat',
            fav: false,
            tags: [],
            data: { name: 'Gamma', extensions: { fav: false, world: '' }, tags: [] },
        });
        writeCharacterFile(directories, 'delta.png', {
            name: 'Delta',
            chat: 'Delta - chat',
            fav: false,
            tags: [],
            data: { name: 'Delta', extensions: { fav: false, world: 'Archive' }, tags: [] },
        });
        writeChatFile(directories, 'gamma.png', 'one.jsonl', '{"mes":"one"}\n');

        const importResult = await runCanonicalShadowImport({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, shadowImport: true, strict: false },
            manager,
            buildSnapshotRow,
            nowMs: 1735689600000,
        });
        expect(importResult.ok).toBe(true);

        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        db.prepare('DELETE FROM characters WHERE avatar_filename = ?').run('alpha.png');
        db.prepare('UPDATE characters SET shallow_json = ? WHERE avatar_filename = ?').run('{"avatar":"beta.png","name":"Wrong"}', 'beta.png');
        db.prepare('UPDATE character_chat_stats SET chat_count = ?, chat_size_bytes = ? WHERE character_id = (SELECT id FROM characters WHERE avatar_filename = ?)').run(99, 999, 'gamma.png');
        db.prepare('UPDATE characters SET world_name = ? WHERE avatar_filename = ?').run('WrongWorld', 'delta.png');

        const audit = await auditCanonicalShadowImport({
            handle: 'alice',
            directories,
            db,
            buildSnapshotRow,
            auditedAtMs: 1735689601234,
        });

        expect(audit).toEqual(expect.objectContaining({
            ok: false,
            handle: 'alice',
            hasDrift: true,
            blocking: true,
        }));
        expect(audit.entries).toEqual(expect.arrayContaining([
            expect.objectContaining({
                avatar_filename: 'alpha.png',
                status: 'drift',
                drift_types: expect.arrayContaining(['missing_db_character']),
                audited_at_ms: 1735689601234,
            }),
            expect.objectContaining({
                avatar_filename: 'beta.png',
                status: 'drift',
                drift_types: expect.arrayContaining(['payload_mismatch']),
            }),
            expect.objectContaining({
                avatar_filename: 'gamma.png',
                status: 'drift',
                drift_types: expect.arrayContaining(['chat_stats_mismatch']),
            }),
            expect.objectContaining({
                avatar_filename: 'delta.png',
                status: 'drift',
                drift_types: expect.arrayContaining(['world_binding_mismatch']),
            }),
        ]));
    });

    test('stays inert when the shadow-import flag is disabled', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();

        writeCharacterFile(directories, 'alpha.png', {
            name: 'Alpha',
            chat: 'Alpha - chat',
            fav: false,
            tags: [],
            data: { name: 'Alpha', extensions: { fav: false, world: '' }, tags: [] },
        });

        const result = await runCanonicalShadowImport({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, shadowImport: false, strict: false },
            manager,
            buildSnapshotRow: createSnapshotBuilder(),
            nowMs: 1735689600000,
        });

        expect(result).toEqual(expect.objectContaining({
            ok: true,
            skipped: true,
            reason: 'shadow_import_disabled',
        }));
        expect(fs.existsSync(path.join(directories.storage, 'emberdesk.sqlite'))).toBe(false);
    });

    test('fails closed when shadow import is requested but canonical sqlite is unavailable', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager({
            DatabaseSync: undefined,
        });

        writeCharacterFile(directories, 'alpha.png', {
            name: 'Alpha',
            chat: 'Alpha - chat',
            fav: false,
            tags: [],
            data: { name: 'Alpha', extensions: { fav: false, world: '' }, tags: [] },
        });

        const result = await runCanonicalShadowImport({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, shadowImport: true, strict: false },
            manager,
            buildSnapshotRow: createSnapshotBuilder(),
            nowMs: 1735689600000,
        });

        expect(result).toEqual(expect.objectContaining({
            ok: false,
            skipped: false,
            reason: 'canonical_storage_unavailable',
            importedCount: 0,
            failedCount: 0,
        }));
    });

    test('fails audit closed with an explicit reason when canonical migrations have not been applied', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });

        writeCharacterFile(directories, 'alpha.png', {
            name: 'Alpha',
            chat: 'Alpha - chat',
            fav: false,
            tags: [],
            data: { name: 'Alpha', extensions: { fav: false, world: '' }, tags: [] },
        });

        const audit = await auditCanonicalShadowImport({
            handle: 'alice',
            directories,
            db,
            buildSnapshotRow: createSnapshotBuilder(),
            auditedAtMs: 1735689601234,
        });

        expect(audit).toEqual(expect.objectContaining({
            ok: false,
            handle: 'alice',
            hasDrift: false,
            blocking: true,
            reason: 'migration_not_applied',
            entries: [],
            migrationStatus: expect.objectContaining({
                ok: true,
                currentVersion: 0,
                targetVersion: 1,
            }),
        }));
    });
});
