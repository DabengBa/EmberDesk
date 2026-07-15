import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, test } from '@jest/globals';

import { createCanonicalSqliteManager } from '../src/canonical-sqlite.js';
import { runCanonicalShadowImport, getPersistedCanonicalAuditStatus, persistCanonicalAuditStatus } from '../src/canonical-sqlite-shadow-import.js';
import { runCanonicalChatShadowImport } from '../src/canonical-chat-shadow-import.js';
import { recordProjectionRepair } from '../src/endpoints/character-store.js';
import {
    recordWorldInfoProjectionRepair,
    upsertCanonicalWorldInfoBook,
} from '../src/endpoints/world-info-store.js';
import { buildCharacterFileSnapshotRow } from '../src/endpoints/character-file-snapshot.js';
import {
    explainCanonicalRolloutBlockers,
    getCanonicalStorageControlPlaneStatus,
    listCanonicalRepairs,
    listCanonicalWorldInfoRepairs,
    rebuildCanonicalChatStats,
    repairCanonicalProjection,
    repairCanonicalWorldInfoProjection,
    runCanonicalAudit,
    runCanonicalSliceAudit,
    runCanonicalSliceRepair,
} from '../src/canonical-sqlite-operator.js';
import { getDefaultCanonicalStorageSliceRegistry } from '../src/canonical-storage-slice-registry.js';
import { runCanonicalMigrations } from '../src/canonical-sqlite-migrations.js';
import { MANAGED_MEDIA_AUDIT_SCOPE } from '../src/canonical-managed-media-shadow-import.js';
import { CANONICAL_CHAT_AUDIT_SCOPE } from '../src/canonical-chat-shadow-import.js';
import { writeCanonicalChatPayload } from '../src/endpoints/canonical-chat-write-service.js';

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
        backgrounds: path.join(root, 'backgrounds'),
        assets: path.join(root, 'assets'),
        avatars: path.join(root, 'User Avatars'),
        files: path.join(root, 'user', 'files'),
        userImages: path.join(root, 'user', 'images'),
    };
    for (const directory of Object.values(directories)) {
        if (directory !== root) {
            fs.mkdirSync(directory, { recursive: true });
        }
    }
    fs.mkdirSync(path.join(directories.storage, 'managed-media'), { recursive: true });
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
    test('reports canonical chat authority and audits its projection without changing route payload shape', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        runCanonicalMigrations(db, { nowMs: 1735689600000 });

        const audit = await runCanonicalSliceAudit({
            sliceKey: 'chats',
            handle: 'alice',
            directories,
            db,
            auditedAtMs: 1735689600000,
        });
        expect(audit).toEqual(expect.objectContaining({
            ok: true,
            sliceKey: 'chats',
            entries: [],
        }));
        expect(getPersistedCanonicalAuditStatus(db, {
            scope: CANONICAL_CHAT_AUDIT_SCOPE,
        })).toEqual(expect.objectContaining({
            ok: true,
            blocking: false,
        }));

        const status = getCanonicalStorageControlPlaneStatus({
            handle: 'alice',
            directories,
            db,
            featureFlags: {
                enabled: true,
                shadowImport: true,
                reads: true,
                writes: true,
                strict: false,
            },
            sliceKeys: ['chats'],
        });
        expect(status.slices).toEqual([expect.objectContaining({
            key: 'chats',
            authorityMode: 'canonical',
            ready: true,
        })]);
    });

    test('replays an open chat projection repair from canonical rows and resolves the repair', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        runCanonicalMigrations(db, { nowMs: 1735689600000 });
        writeChatFile(directories, 'alice.png', 'first.jsonl', [
            '{"chat_metadata":{"integrity":"clean"}}',
            '{"name":"User","mes":"Before"}',
        ].join('\n'));
        await runCanonicalChatShadowImport({
            handle: 'alice',
            directories,
            db,
            featureFlags: { enabled: true, shadowImport: true, strict: false },
            nowMs: 1735689600000,
        });

        const result = writeCanonicalChatPayload({
            db,
            locator: {
                ownerType: 'character',
                ownerId: 'alice',
                sourcePath: 'chats/alice/first.jsonl',
            },
            payload: [
                { chat_metadata: { integrity: 'clean', updated: true } },
                { name: 'User', mes: 'After' },
            ],
            projectJsonl() {
                throw new Error('projection unavailable');
            },
            nowMs: 1735689601000,
        });
        expect(result).toEqual(expect.objectContaining({ reason: 'projection_failed' }));

        await expect(runCanonicalSliceRepair({
            sliceKey: 'chats',
            db,
            directories,
            repairKeys: [result.repairKey],
            nowMs: 1735689602000,
        })).resolves.toEqual(expect.objectContaining({
            ok: true,
            sliceKey: 'chats',
            results: [expect.objectContaining({
                repairKey: result.repairKey,
                status: 'repaired',
                operation: 'save',
            })],
        }));
        expect(fs.readFileSync(path.join(directories.chats, 'alice', 'first.jsonl'), 'utf8')).toBe([
            '{"chat_metadata":{"integrity":"clean","updated":true}}',
            '{"name":"User","mes":"After"}',
        ].join('\n'));
    });

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

    test('reports repair_not_found when a requested character repair key does not exist', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        runCanonicalMigrations(db, { nowMs: 1735689600000 });

        await expect(repairCanonicalProjection({
            db,
            directories,
            repairKeys: ['repair:create:missing.png'],
            nowMs: 1735689602000,
        })).resolves.toEqual({
            ok: false,
            results: [{
                repairKey: 'repair:create:missing.png',
                status: 'blocked',
                blocker: 'repair_not_found',
            }],
        });
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

    test('repairs a missing world info projection file from canonical data using a safe filename', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        runCanonicalMigrations(db, { nowMs: 1735689600000 });
        upsertCanonicalWorldInfoBook(db, {
            name: '../Lore/book',
            payload: {
                name: 'Canonical Lore',
                entries: { one: { content: 'repair me' } },
            },
            nowMs: 1735689600000,
        });
        recordWorldInfoProjectionRepair(db, {
            repairKey: 'world_info:..Lorebook:edit',
            worldName: '../Lore/book',
            reason: 'projection_failed',
            details: { operation: 'edit' },
            nowMs: 1735689601000,
        });

        const repairResult = await repairCanonicalWorldInfoProjection({
            db,
            directories,
            repairKeys: ['world_info:..Lorebook:edit'],
            nowMs: 1735689602000,
        });

        expect(repairResult).toEqual({
            ok: true,
            results: [{
                repairKey: 'world_info:..Lorebook:edit',
                status: 'repaired',
                operation: 'edit',
            }],
        });
        expect(JSON.parse(fs.readFileSync(path.join(directories.worlds, '..Lorebook.json'), 'utf8'))).toEqual({
            name: 'Canonical Lore',
            entries: { one: { content: 'repair me' } },
        });
        expect(fs.existsSync(path.join(root, 'Lore', 'book.json'))).toBe(false);
        expect(listCanonicalWorldInfoRepairs(db)).toEqual([]);
    });

    test('repairs a failed canonical world info delete projection without requiring an active row', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        runCanonicalMigrations(db, { nowMs: 1735689600000 });
        upsertCanonicalWorldInfoBook(db, {
            name: 'Lorebook',
            payload: { entries: { one: { content: 'delete me' } } },
            nowMs: 1735689600000,
        });
        db.prepare(`
            UPDATE world_books
            SET deleted_at_ms = ?, updated_at_ms = ?
            WHERE name = ?
        `).run(1735689600500, 1735689600500, 'Lorebook');
        fs.writeFileSync(path.join(directories.worlds, 'Lorebook.json'), JSON.stringify({ entries: {} }), 'utf8');
        recordWorldInfoProjectionRepair(db, {
            repairKey: 'world_info:Lorebook:delete',
            worldName: 'Lorebook',
            reason: 'projection_failed',
            details: { operation: 'delete' },
            nowMs: 1735689601000,
        });

        const repairResult = await repairCanonicalWorldInfoProjection({
            db,
            directories,
            repairKeys: ['world_info:Lorebook:delete'],
            nowMs: 1735689602000,
        });

        expect(repairResult).toEqual({
            ok: true,
            results: [{
                repairKey: 'world_info:Lorebook:delete',
                status: 'repaired',
                operation: 'delete',
            }],
        });
        expect(fs.existsSync(path.join(directories.worlds, 'Lorebook.json'))).toBe(false);
        expect(listCanonicalWorldInfoRepairs(db)).toEqual([]);
    });

    test('reports repair_not_found when repair-slice targets a missing managed-media key', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        runCanonicalMigrations(db, { nowMs: 1735689600000 });

        await expect(runCanonicalSliceRepair({
            sliceKey: 'managed_media',
            db,
            directories,
            repairKeys: ['managed_media:missing:write'],
            nowMs: 1735689602000,
        })).resolves.toEqual(expect.objectContaining({
            ok: false,
            sliceKey: 'managed_media',
            results: [{
                repairKey: 'managed_media:missing:write',
                status: 'blocked',
                blocker: 'repair_not_found',
            }],
        }));
    });

    test('explains open character and world info repair blockers for write rollback and can rerun audits on demand', async () => {
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
        upsertCanonicalWorldInfoBook(db, {
            name: 'Lorebook',
            payload: { entries: {} },
            nowMs: 1735689604444,
        });
        recordWorldInfoProjectionRepair(db, {
            repairKey: 'world_info:Lorebook:edit',
            worldName: 'Lorebook',
            reason: 'projection_failed',
            details: { operation: 'edit' },
            nowMs: 1735689604444,
        });
        persistCanonicalAuditStatus(db, {
            ok: true,
            handle: 'alice',
            hasDrift: false,
            blocking: false,
            entries: [],
        }, {
            scope: 'world_info',
            auditedAtMs: 1735689605000,
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
            expect.objectContaining({ code: 'open_world_info_projection_repairs' }),
        ]));
        expect(audit.ok).toBe(false);
        expect(audit.entries).toEqual(expect.arrayContaining([
            expect.objectContaining({
                drift_types: expect.arrayContaining(['open_projection_repair']),
            }),
        ]));
    });

    test('aggregates per-slice control-plane status without leaking user content', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        runCanonicalMigrations(db, { nowMs: 1735689600000 });

        recordProjectionRepair(db, {
            repairKey: 'repair:create:alpha.png',
            repairType: 'character_projection',
            avatarFilename: 'alpha.png',
            reason: 'projection_failed',
            details: {
                operation: 'create',
                secret: 'should-not-appear',
                cardJson: '{"name":"Alpha"}',
            },
            nowMs: 1735689601111,
        });
        persistCanonicalAuditStatus(db, {
            ok: true,
            handle: 'alice',
            hasDrift: false,
            blocking: false,
            entries: [],
        }, {
            scope: 'world_info',
            auditedAtMs: 1735689602222,
        });

        const status = getCanonicalStorageControlPlaneStatus({
            handle: 'alice',
            directories,
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

        expect(status.handle).toBe('alice');
        expect(status.slices.map(slice => slice.key)).toEqual(['characters', 'world_info', 'settings', 'secrets', 'managed_media', 'chats']);

        const characters = status.slices.find(slice => slice.key === 'characters');
        const worldInfo = status.slices.find(slice => slice.key === 'world_info');

        expect(characters.ready).toBe(false);
        expect(characters.openRepairCount).toBe(1);
        expect(characters.openRepairKeys).toEqual(['repair:create:alpha.png']);
        expect(characters.rollback.ok).toBe(false);
        expect(worldInfo.ready).toBe(true);
        expect(worldInfo.openRepairCount).toBe(0);
        expect(worldInfo.rollback.ok).toBe(true);

        const serialized = JSON.stringify(status);
        expect(serialized).not.toContain('should-not-appear');
        expect(serialized).not.toContain('{"name":"Alpha"}');
        expect(serialized).not.toContain('cardJson');
        expect(status.backupRestore.mutatesData).toBe(false);
        expect(status.backupRestore.ready).toBe(false);
        expect(status.backupRestore.blockers.map(b => b.code)).toContain('missing_managed_file_manifest');
        // Sanitization: never embed full auditStatus objects or repair detail payloads.
        for (const slice of status.slices) {
            for (const blocker of slice.rollback.blockers) {
                expect(blocker.details).not.toHaveProperty('auditStatus');
                expect(JSON.stringify(blocker.details)).not.toContain('should-not-appear');
            }
        }
    });


    test('status blockers omit raw auditStatus payloads', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        runCanonicalMigrations(db, { nowMs: 1735689600000 });

        const status = getCanonicalStorageControlPlaneStatus({
            handle: 'alice',
            directories,
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

        const characters = status.slices.find(slice => slice.key === 'characters');
        expect(characters.rollback.ok).toBe(false);
        expect(characters.rollback.blockers.some(b => b.code === 'audit_not_run')).toBe(true);
        for (const blocker of characters.rollback.blockers) {
            expect(blocker.details).not.toHaveProperty('auditStatus');
        }
        expect(JSON.stringify(status)).not.toContain('"auditStatus"');
    });

    test('reports each slice effective flags, sources, and isolated override blockers', () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        runCanonicalMigrations(db, { nowMs: 1735689600000 });

        const status = getCanonicalStorageControlPlaneStatus({
            handle: 'alice',
            directories,
            db,
            featureFlags: {
                enabled: true,
                shadowImport: true,
                reads: true,
                writes: true,
                chatStats: true,
                strict: false,
                slices: {
                    characters: { enabled: false },
                },
            },
            sliceKeys: ['characters', 'world_info'],
        });

        const characters = status.slices.find(slice => slice.key === 'characters');
        const worldInfo = status.slices.find(slice => slice.key === 'world_info');
        expect(characters).toEqual(expect.objectContaining({
            featureFlags: expect.objectContaining({
                enabled: false,
                reads: false,
            }),
            flagSources: expect.objectContaining({
                enabled: 'slice_override',
                reads: 'disabled_by_enabled',
            }),
        }));
        expect(worldInfo).toEqual(expect.objectContaining({
            featureFlags: expect.objectContaining({
                enabled: true,
                reads: true,
            }),
            flagSources: expect.objectContaining({
                enabled: 'global_override',
                reads: 'global_override',
            }),
        }));
    });

    test('reports invalid slice flag configuration as an isolated resolver blocker', () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        runCanonicalMigrations(db, { nowMs: 1735689600000 });

        const status = getCanonicalStorageControlPlaneStatus({
            handle: 'alice',
            directories,
            db,
            featureFlags: {
                enabled: true,
                shadowImport: true,
                reads: true,
                writes: true,
                chatStats: true,
                strict: false,
                slices: {
                    settings: { reads: 'not-a-boolean' },
                },
            },
            sliceKeys: ['settings', 'secrets'],
        });

        const settings = status.slices.find(slice => slice.key === 'settings');
        const secrets = status.slices.find(slice => slice.key === 'secrets');
        expect(settings).toEqual(expect.objectContaining({
            enabled: false,
            ready: false,
            flagResolution: {
                ok: false,
                reasonCode: 'invalid_slice_flag_configuration',
                blockers: [{
                    code: 'invalid_slice_flag_configuration',
                    severity: 'error',
                    details: { sliceKey: 'settings' },
                }],
            },
        }));
        expect(secrets.flagResolution).toEqual({
            ok: true,
            reasonCode: null,
            blockers: [],
        });
    });

    test('uses registry slice runners for audit and repair routing', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        runCanonicalMigrations(db, { nowMs: 1735689600000 });
        const registry = getDefaultCanonicalStorageSliceRegistry();

        await runCanonicalSliceAudit({
            sliceKey: 'world_info',
            handle: 'alice',
            directories,
            db,
            auditedAtMs: 1735689601111,
        });

        for (const key of ['characters', 'world_info']) {
            const runners = registry.getRunners(key);
            expect(runners).toEqual(expect.objectContaining({
                runAudit: expect.any(Function),
                runRepair: expect.any(Function),
            }));
        }

        expect(registry.getRunners('managed_media')).toEqual({
            runAudit: expect.any(Function),
            runRepair: expect.any(Function),
        });
    });

    test('runs the managed media audit through its registered slice runner', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        runCanonicalMigrations(db, { nowMs: 1735689600000 });
        fs.writeFileSync(path.join(directories.backgrounds, 'sky.png'), 'background', 'utf8');

        const audit = await runCanonicalSliceAudit({
            sliceKey: 'managed_media',
            handle: 'alice',
            directories,
            db,
            auditedAtMs: 1735689601111,
        });

        expect(audit).toEqual(expect.objectContaining({
            sliceKey: 'managed_media',
            ok: false,
            blocking: true,
            reason: 'audit_drift_blocked',
        }));
        expect(audit.entries).toEqual(expect.arrayContaining([
            expect.objectContaining({
                compatibility_path: 'backgrounds/sky.png',
                drift_types: ['orphan'],
            }),
        ]));
        expect(getPersistedCanonicalAuditStatus(db, { scope: MANAGED_MEDIA_AUDIT_SCOPE }))
            .toEqual(expect.objectContaining({ blocking: true }));
        const repair = await runCanonicalSliceRepair({
            sliceKey: 'managed_media',
            db,
            directories,
        });
        expect(repair).toEqual(expect.objectContaining({
            ok: true,
            sliceKey: 'managed_media',
            results: [],
        }));
    });

    test('routes audit and repair by slice key through the control plane', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        runCanonicalMigrations(db, { nowMs: 1735689600000 });

        recordWorldInfoProjectionRepair(db, {
            repairKey: 'world_info:Lorebook:edit',
            worldName: 'Lorebook',
            reason: 'projection_failed',
            details: { operation: 'edit' },
            nowMs: 1735689601111,
        });
        upsertCanonicalWorldInfoBook(db, {
            name: 'Lorebook',
            payload: { entries: {} },
            nowMs: 1735689601111,
        });

        const repair = await runCanonicalSliceRepair({
            sliceKey: 'world_info',
            db,
            directories,
            repairKeys: ['world_info:Lorebook:edit'],
            nowMs: 1735689602222,
        });
        expect(repair.ok).toBe(true);
        expect(repair.sliceKey).toBe('world_info');
        expect(listCanonicalWorldInfoRepairs(db)).toEqual([]);

        const audit = await runCanonicalSliceAudit({
            sliceKey: 'world_info',
            handle: 'alice',
            directories,
            db,
            auditedAtMs: 1735689603333,
        });
        expect(audit.sliceKey).toBe('world_info');
        expect(audit).toEqual(expect.objectContaining({
            ok: expect.any(Boolean),
        }));
    });
});
