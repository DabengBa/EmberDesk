import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, test } from '@jest/globals';

import { createCanonicalSqliteManager } from '../src/canonical-sqlite.js';
import { runCanonicalShadowImport, getPersistedCanonicalAuditStatus } from '../src/canonical-sqlite-shadow-import.js';
import { recordProjectionRepair } from '../src/endpoints/character-store.js';
import { buildCharacterFileSnapshotRow } from '../src/endpoints/character-file-snapshot.js';
import {
    explainCanonicalRolloutBlockers,
    listCanonicalRepairs,
    rebuildCanonicalChatStats,
    repairCanonicalProjection,
    runCanonicalAudit,
} from '../src/canonical-sqlite-operator.js';

const tempRoots = [];
const managers = [];

function makeRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-canonical-operator-'));
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

function createManager() {
    const manager = createCanonicalSqliteManager({ logger: { info() {}, warn() {} } });
    managers.push(manager);
    return manager;
}

function writeCharacterFile(directories, avatar, payload) {
    fs.writeFileSync(path.join(directories.characters, avatar), JSON.stringify(payload), 'utf8');
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

describe('canonical sqlite operator helpers', () => {
    test('repairs a missing projection file from canonical data and resolves the repair row', async () => {
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

        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });

        fs.rmSync(path.join(directories.characters, 'alpha.png'));
        recordProjectionRepair(db, {
            repairKey: 'repair:create:alpha.png',
            repairType: 'character_projection',
            avatarFilename: 'alpha.png',
            reason: 'projection_failed',
            details: {
                operation: 'create',
                internalName: 'alpha',
                chatsDirectoryName: 'alpha',
                sourceImage: 'default-avatar.png',
            },
            nowMs: 1735689601111,
        });

        const repairResult = await repairCanonicalProjection({
            db,
            directories,
            repairKeys: ['repair:create:alpha.png'],
            nowMs: 1735689602222,
        });

        expect(repairResult).toEqual({
            ok: true,
            results: [
                expect.objectContaining({
                    repairKey: 'repair:create:alpha.png',
                    status: 'repaired',
                    operation: 'create',
                }),
            ],
        });
        expect(fs.existsSync(path.join(directories.characters, 'alpha.png'))).toBe(true);
        expect(listCanonicalRepairs(db)).toEqual([]);
        expect(getPersistedCanonicalAuditStatus(db)).toEqual(expect.objectContaining({
            blocking: true,
            reason: 'audit_stale_after_projection_repair',
        }));
    });

    test('rebuilds canonical chat stats from JSONL chat files', async () => {
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
        writeChatFile(directories, 'alpha.png', 'one.jsonl', '{"mes":"one"}\n');

        await runCanonicalShadowImport({
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

        db.prepare(`
            UPDATE character_chat_stats
            SET chat_count = 0,
                chat_size_bytes = 0,
                date_last_chat_ms = 0
        `).run();
        writeChatFile(directories, 'alpha.png', 'two.jsonl', '{"mes":"two"}\n');

        const rebuilt = rebuildCanonicalChatStats({
            db,
            directories,
            avatars: ['alpha.png'],
            nowMs: 1735689603333,
        });

        expect(rebuilt).toEqual({
            ok: true,
            rebuilt: [
                expect.objectContaining({
                    avatarFilename: 'alpha.png',
                    chatCount: 2,
                }),
            ],
        });
        expect(db.prepare(`
            SELECT chat_count
            FROM character_chat_stats
            WHERE character_id = (SELECT id FROM characters WHERE avatar_filename = ?)
        `).get('alpha.png').chat_count).toBe(2);
    });

    test('explains open repair blockers for write rollback and can rerun audit on demand', async () => {
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

        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        recordProjectionRepair(db, {
            repairKey: 'repair:rename:alpha.png',
            repairType: 'character_projection',
            avatarFilename: 'alpha.png',
            reason: 'projection_failed',
            details: { operation: 'rename' },
            nowMs: 1735689604444,
        });

        const blockers = explainCanonicalRolloutBlockers({
            db,
            featureFlags: {
                enabled: true,
                shadowImport: true,
                reads: true,
                writes: true,
                chatStats: false,
                strict: false,
            },
            phase: 'writes',
        });
        const audit = await runCanonicalAudit({
            handle: 'alice',
            directories,
            db,
            auditedAtMs: 1735689605555,
        });

        expect(blockers.ok).toBe(false);
        expect(blockers.blockers).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'audit_not_run' }),
            expect.objectContaining({ code: 'open_projection_repairs' }),
        ]));
        expect(audit.ok).toBe(false);
        expect(audit.entries).toEqual(expect.arrayContaining([
            expect.objectContaining({
                drift_types: expect.arrayContaining(['open_projection_repair']),
            }),
        ]));
    });
});
