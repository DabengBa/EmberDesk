import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { afterEach, describe, expect, test } from '@jest/globals';

import { createCanonicalSqliteManager } from '../src/canonical-sqlite.js';
import { runCanonicalMigrations } from '../src/canonical-sqlite-migrations.js';
import { runCanonicalChatShadowImport } from '../src/canonical-chat-shadow-import.js';
import { repairCanonicalChatProjection } from '../src/canonical-sqlite-operator.js';
import { listOpenCanonicalChatProjectionRepairs } from '../src/endpoints/canonical-chat-store.js';
import { readCanonicalChatPayload } from '../src/endpoints/canonical-chat-read-service.ts';
import {
    createCanonicalChatBackup,
    getCanonicalChatRestoreStatus,
    restoreCanonicalChatBackup as restoreWithVersion,
    getCanonicalChatRestoreVersion,
} from '../src/endpoints/canonical-chat-backup-restore-service.js';

function restoreCanonicalChatBackup(options) {
    return restoreWithVersion({ expectedVersion: getCanonicalChatRestoreVersion(options.db), ...options });
}
import { deleteCanonicalChat, writeCanonicalChatPayload } from '../src/endpoints/canonical-chat-write-service.js';

const roots = [];
const managers = [];

function makeDirectories() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-canonical-chat-backup-'));
    roots.push(root);
    const directories = {
        root,
        storage: path.join(root, 'storage'),
        chats: path.join(root, 'chats'),
        groupChats: path.join(root, 'group chats'),
    };
    for (const directory of Object.values(directories)) {
        fs.mkdirSync(directory, { recursive: true });
    }
    fs.mkdirSync(path.join(directories.chats, 'alice'), { recursive: true });
    return directories;
}

function createManager() {
    const manager = createCanonicalSqliteManager({ logger: { info() {}, warn() {} } });
    managers.push(manager);
    return manager;
}

afterEach(() => {
    for (const manager of managers.splice(0)) {
        manager.dispose();
    }
    for (const root of roots.splice(0)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

describe('canonical chat backup and restore service', () => {
    test('restore rejects a stale database version without erasing a later chat edit', async () => {
        const directories = makeDirectories();
        const db = createManager().open({ handle: 'alice', directories, featureFlags: { enabled: true } });
        const other = createManager().open({ handle: 'alice', directories, featureFlags: { enabled: true } });
        runCanonicalMigrations(db);
        const backup = createCanonicalChatBackup({ db });
        const expectedVersion = backup.databaseRevision.version;
        const locator = { ownerType: 'character', ownerId: 'alice', sourcePath: 'chats/alice/new.jsonl' };
        const written = writeCanonicalChatPayload({ db: other, locator, payload: [{ chat_metadata: {} }, { mes: 'concurrent edit' }], projection: 'off', projectJsonl() {} });
        expect(written.ok).toBe(true);
        const result = await restoreCanonicalChatBackup({ db, backup, handle: 'alice', directories, expectedVersion });
        expect(result).toEqual(expect.objectContaining({ ok: false, reasonCode: 'chat_conflict', commitState: 'not_committed' }));
        expect(readCanonicalChatPayload(db, locator)[1].mes).toBe('concurrent edit');
    });
    test('caller-provided IDs are claimed once and cannot overwrite another operation', async () => {
        const directories = makeDirectories();
        const db = createManager().open({ handle: 'alice', directories, featureFlags: { enabled: true } });
        runCanonicalMigrations(db);
        const backup = createCanonicalChatBackup({ db });
        const restoreId = 'chat-restore-11111111-1111-4111-8111-111111111111';
        const invalid = await restoreCanonicalChatBackup({ db, backup, handle: 'alice', directories, restoreId: 'invalid' });
        expect(invalid).toEqual(expect.objectContaining({ ok: false, reasonCode: 'invalid_restore_id', commitState: 'not_committed' }));
        expect(db.prepare('SELECT COUNT(*) AS n FROM chat_restore_operations').get().n).toBe(0);
        const firstPromise = restoreCanonicalChatBackup({ db, backup, handle: 'alice', directories, restoreId, nowMs: 5000 });
        const original = getCanonicalChatRestoreStatus(db, restoreId);
        const secondPromise = restoreCanonicalChatBackup({ db, backup: null, handle: 'alice', directories, restoreId, nowMs: 4000 });
        expect(getCanonicalChatRestoreStatus(db, restoreId)).toEqual(original);
        const second = await secondPromise;
        const first = await firstPromise;
        expect(first.restoreId).toBe(restoreId);
        expect(second).toEqual(expect.objectContaining({ ok: false, reasonCode: 'restore_id_in_use', restoreId }));
        expect(getCanonicalChatRestoreStatus(db, restoreId)).toEqual(expect.objectContaining({ status: 'restored', commitState: 'committed' }));
    });

    test('known IDs survive child termination before and after the authority commit', () => {
        const directories = makeDirectories();
        const db = createManager().open({ handle: 'alice', directories, featureFlags: { enabled: true } });
        runCanonicalMigrations(db);
        const backup = createCanonicalChatBackup({ db });
        backup.sessions = [{ ownerType: 'character', ownerId: 'alice', sourcePath: 'chats/alice/first.jsonl', sourceMtimeMs: 0, jsonl: '{"chat_metadata":{}}' }];
        const service = pathToFileURL(path.resolve(process.cwd(), '../src/endpoints/canonical-chat-backup-restore-service.js')).href;
        const sqlite = pathToFileURL(path.resolve(process.cwd(), '../src/canonical-sqlite.js')).href;
        const child = `
            import { createCanonicalSqliteManager } from ${JSON.stringify(sqlite)};
            import { restoreCanonicalChatBackup, getCanonicalChatRestoreVersion } from ${JSON.stringify(service)};
            const [directories, backup, restoreId, phase, nowMs] = JSON.parse(process.argv[1]);
            const manager = createCanonicalSqliteManager({ logger: { info() {}, warn() {} } });
            const db = manager.open({ handle: 'alice', directories, featureFlags: { enabled: true } });
            db.function('exit_now', () => process.exit(71));
            db.exec(phase === 'before'
                ? 'CREATE TEMP TRIGGER crash_restore BEFORE INSERT ON chat_sessions BEGIN SELECT exit_now(); END'
                : "CREATE TEMP TRIGGER crash_restore BEFORE UPDATE ON chat_restore_operations WHEN NEW.status = 'restored' BEGIN SELECT exit_now(); END");
            await restoreCanonicalChatBackup({ db, backup, restoreId, handle: 'alice', directories, nowMs, expectedVersion: getCanonicalChatRestoreVersion(db) });
        `;
        const before = 'chat-restore-22222222-2222-4222-8222-222222222222';
        const after = 'chat-restore-33333333-3333-4333-8333-333333333333';
        for (const [restoreId, phase, nowMs] of [[before, 'before', 5000], [after, 'after', 4000]]) {
            const result = spawnSync(process.execPath, ['--input-type=module', '-e', child, JSON.stringify([directories, backup, restoreId, phase, nowMs])], { encoding: 'utf8' });
            expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 71, stderr: '' });
            expect(result.stdout).toBe('');
            if (phase === 'before') {
                expect(getCanonicalChatRestoreStatus(db, restoreId)).toEqual(expect.objectContaining({ status: 'restoring', commitState: 'unknown' }));
                expect(db.prepare('SELECT COUNT(*) AS n FROM chat_sessions').get().n).toBe(0);
            }
        }
        expect(getCanonicalChatRestoreStatus(db, before)).toEqual(expect.objectContaining({ restoreId: before, commitState: 'unknown' }));
        expect(getCanonicalChatRestoreStatus(db, after)).toEqual(expect.objectContaining({ restoreId: after, commitState: 'committed' }));
        expect(getCanonicalChatRestoreStatus(db).restoreId).toBe(before);
        expect(db.prepare('SELECT COUNT(*) AS n FROM chat_sessions').get().n).toBe(1);
    });
    test('same-millisecond interleaved operations retain independent committed and blocked journals', async () => {
        const directories = makeDirectories();
        const db = createManager().open({ handle: 'alice', directories, featureFlags: { enabled: true } });
        runCanonicalMigrations(db);
        const backup = createCanonicalChatBackup({ db });
        const committedPromise = restoreCanonicalChatBackup({ db, backup, handle: 'alice', directories, nowMs: 3000 });
        const blocked = await restoreCanonicalChatBackup({ db, backup: null, handle: 'alice', directories, nowMs: 3000 });
        const committed = await committedPromise;
        expect(committed.commitState).toBe('committed');
        expect(blocked.commitState).toBe('not_committed');
        expect(committed.restoreId).not.toBe(blocked.restoreId);
        expect(db.prepare('SELECT COUNT(*) AS n FROM chat_restore_operations').get().n).toBe(2);
        expect(getCanonicalChatRestoreStatus(db, committed.restoreId)).toEqual(expect.objectContaining({ restoreId: committed.restoreId, commitState: 'committed', status: 'restored' }));
        expect(getCanonicalChatRestoreStatus(db, blocked.restoreId)).toEqual(expect.objectContaining({ restoreId: blocked.restoreId, commitState: 'not_committed', status: 'blocked' }));
    });

    test('specific operation lookup survives a backwards clock and reports missing and legacy records as unknown', async () => {
        const directories = makeDirectories();
        const db = createManager().open({ handle: 'alice', directories, featureFlags: { enabled: true } });
        runCanonicalMigrations(db);
        const backup = createCanonicalChatBackup({ db });
        const first = await restoreCanonicalChatBackup({ db, backup, handle: 'alice', directories, nowMs: 5000 });
        const second = await restoreCanonicalChatBackup({ db, backup: null, handle: 'alice', directories, nowMs: 4000 });
        expect(getCanonicalChatRestoreStatus(db).restoreId).toBe(first.restoreId);
        expect(getCanonicalChatRestoreStatus(db, second.restoreId)).toEqual(expect.objectContaining({ restoreId: second.restoreId, status: 'blocked', commitState: 'not_committed' }));
        expect(getCanonicalChatRestoreStatus(db, 'missing-id')).toEqual(expect.objectContaining({ status: 'none', commitState: 'unknown' }));
        db.prepare('UPDATE chat_restore_operations SET details_json = ? WHERE restore_id = ?').run('{}', first.restoreId);
        expect(getCanonicalChatRestoreStatus(db, first.restoreId).commitState).toBe('unknown');
        db.prepare('UPDATE chat_restore_operations SET restore_id = ?, details_json = ? WHERE restore_id = ?')
            .run('chat-restore-5000', '{"commitState":"committed"}', first.restoreId);
        expect(getCanonicalChatRestoreStatus(db, 'chat-restore-5000').commitState).toBe('unknown');
        expect(getCanonicalChatRestoreStatus(db, 'chat-restore-5000').details.commitState).not.toBe('committed');
    });

    test('restores a validated backup bundle and records a completed restore journal entry', async () => {
        const directories = makeDirectories();
        const manager = createManager();
        const sourcePath = path.join(directories.chats, 'alice', 'first.jsonl');
        const initialPayload = [
            { chat_metadata: { integrity: 'clean' } },
            { name: 'User', send_date: '2026-01-01T00:00:00.000Z', mes: 'Before' },
        ];
        fs.writeFileSync(sourcePath, initialPayload.map(line => JSON.stringify(line)).join('\n'), 'utf8');

        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        runCanonicalMigrations(db, { nowMs: 1735689600000 });
        await runCanonicalChatShadowImport({
            handle: 'alice',
            directories,
            db,
            featureFlags: { enabled: true, shadowImport: true, strict: false },
            nowMs: 1735689600000,
        });

        const backup = createCanonicalChatBackup({
            db,
            createdAtMs: 1735689601000,
        });

        writeCanonicalChatPayload({
            db,
            locator: {
                ownerType: 'character',
                ownerId: 'alice',
                sourcePath: 'chats/alice/first.jsonl',
            },
            payload: [
                { chat_metadata: { integrity: 'clean', updated: true } },
                { name: 'User', send_date: '2026-02-01T00:00:00.000Z', mes: 'After' },
            ],
            projectJsonl(jsonl) {
                fs.writeFileSync(sourcePath, jsonl, 'utf8');
            },
            nowMs: 1735689602000,
        });

        const restored = await restoreCanonicalChatBackup({
            db,
            backup,
            handle: 'alice',
            directories,
            nowMs: 1735689603000,
        });

        expect(restored).toEqual(expect.objectContaining({
            ok: true,
            status: 'restored',
            commitState: 'committed',
        }));
        expect(readCanonicalChatPayload(db, {
            ownerType: 'character',
            ownerId: 'alice',
            sourcePath: 'chats/alice/first.jsonl',
        })).toEqual(initialPayload);
        expect(fs.readFileSync(sourcePath, 'utf8')).toBe(
            initialPayload.map(line => JSON.stringify(line)).join('\n'),
        );
        expect(getCanonicalChatRestoreStatus(db)).toEqual(expect.objectContaining({
            status: 'restored',
            reasonCode: null,
            commitState: 'committed',
        }));
    });

    test('portable backups retain deleted-chat tombstones so stale projections cannot be reimported', async () => {
        const sourceDirectories = makeDirectories();
        const sourceDb = createManager().open({ handle: 'alice', directories: sourceDirectories, featureFlags: { enabled: true } });
        runCanonicalMigrations(sourceDb);
        const locator = {
            ownerType: 'character',
            ownerId: 'alice',
            sourcePath: 'chats/alice/previously-deleted.jsonl',
        };
        const sourceProjection = path.join(sourceDirectories.root, locator.sourcePath);
        const deletedPayload = [
            { chat_metadata: { title: 'Deleted chat' } },
            { name: 'User', mes: 'This was deleted before the backup.' },
        ];
        const written = writeCanonicalChatPayload({
            db: sourceDb,
            locator,
            payload: deletedPayload,
            condition: { create: true },
            projectJsonl(jsonl) {
                fs.writeFileSync(sourceProjection, jsonl, 'utf8');
            },
        });
        expect(written).toEqual(expect.objectContaining({ ok: true, authorityCommitted: true }));
        const deleted = deleteCanonicalChat({
            db: sourceDb,
            locator,
            version: written.version,
            projectDelete() {
                fs.rmSync(sourceProjection, { force: true });
            },
        });
        expect(deleted).toEqual(expect.objectContaining({ ok: true, authorityCommitted: true }));
        expect(sourceDb.prepare('SELECT COUNT(*) AS count FROM chat_projection_tombstones').get().count).toBe(1);
        const backup = createCanonicalChatBackup({ db: sourceDb });
        expect(backup.sessions).toEqual([]);

        const targetDirectories = makeDirectories();
        const targetDb = createManager().open({ handle: 'alice', directories: targetDirectories, featureFlags: { enabled: true } });
        runCanonicalMigrations(targetDb);
        const staleProjection = path.join(targetDirectories.root, locator.sourcePath);
        fs.writeFileSync(staleProjection, deletedPayload.map(line => JSON.stringify(line)).join('\n'), 'utf8');

        const restored = await restoreCanonicalChatBackup({
            db: targetDb,
            backup,
            handle: 'alice',
            directories: targetDirectories,
        });
        expect(restored.commitState).toBe('committed');
        await runCanonicalChatShadowImport({
            handle: 'alice',
            directories: targetDirectories,
            db: targetDb,
            featureFlags: { enabled: true, shadowImport: true, strict: false },
        });
        expect(targetDb.prepare('SELECT COUNT(*) AS count FROM chat_sessions').get().count).toBe(0);
    });

    test('captures the revision and session payload from one consistent SQLite snapshot', () => {
        const directories = makeDirectories();
        const db = createManager().open({ handle: 'alice', directories, featureFlags: { enabled: true } });
        const writerDb = createManager().open({ handle: 'alice', directories, featureFlags: { enabled: true } });
        runCanonicalMigrations(db);
        const locator = {
            ownerType: 'character',
            ownerId: 'alice',
            sourcePath: 'chats/alice/snapshot.jsonl',
        };
        const originalPayload = [{ chat_metadata: { version: 'before' } }, { mes: 'before' }];
        const nextPayload = [{ chat_metadata: { version: 'after' } }, { mes: 'after' }];
        const created = writeCanonicalChatPayload({
            db,
            locator,
            payload: originalPayload,
            condition: { create: true },
            projection: 'off',
            projectJsonl() {},
        });
        const initialRevision = getCanonicalChatRestoreVersion(db);
        const sourceJsonl = originalPayload.map(line => JSON.stringify(line)).join('\n');
        const originalPrepare = db.prepare.bind(db);
        let writeInterleaved = false;
        const revisionQuery = 'SELECT owner_type, owner_id, source_path, concurrency_token FROM chat_sessions ORDER BY owner_type, owner_id, source_path';
        db.prepare = sql => {
            const statement = originalPrepare(sql);
            if (sql.trim() !== revisionQuery) return statement;
            return new Proxy(statement, {
                get(target, property) {
                    if (property === 'all') {
                        return (...args) => {
                            const rows = target.all(...args);
                            if (!writeInterleaved) {
                                writeInterleaved = true;
                                expect(writeCanonicalChatPayload({
                                    db: writerDb,
                                    locator,
                                    payload: nextPayload,
                                    condition: { version: created.version },
                                    projection: 'off',
                                    projectJsonl() {},
                                }).ok).toBe(true);
                            }
                            return rows;
                        };
                    }
                    const value = Reflect.get(target, property, target);
                    return typeof value === 'function' ? value.bind(target) : value;
                },
            });
        };

        const backup = createCanonicalChatBackup({ db });
        db.prepare = originalPrepare;

        expect(writeInterleaved).toBe(true);
        expect(backup.databaseRevision.version).toBe(initialRevision);
        expect(backup.sessions).toEqual([expect.objectContaining({ jsonl: sourceJsonl })]);
        expect(writerDb.prepare('SELECT source_jsonl FROM chat_sessions').get().source_jsonl)
            .toBe(nextPayload.map(line => JSON.stringify(line)).join('\n'));
    });

    test('portable backups preserve committed operation receipts so old retries cannot recreate deleted chats', async () => {
        const sourceDirectories = makeDirectories();
        const sourceDb = createManager().open({ handle: 'alice', directories: sourceDirectories, featureFlags: { enabled: true } });
        runCanonicalMigrations(sourceDb);
        const locator = {
            ownerType: 'character',
            ownerId: 'alice',
            sourcePath: 'chats/alice/retried-create.jsonl',
        };
        const payload = [{ chat_metadata: {} }, { name: 'User', mes: 'Already deleted' }];
        const createOperation = { id: 'portable-create-1', fingerprint: 'a'.repeat(64) };
        const deleteOperation = { id: 'portable-delete-1', fingerprint: 'b'.repeat(64) };
        const created = writeCanonicalChatPayload({
            db: sourceDb,
            locator,
            payload,
            condition: { create: true },
            operationIdentity: createOperation,
            projection: 'off',
            projectJsonl() {},
        });
        const deleted = deleteCanonicalChat({
            db: sourceDb,
            locator,
            version: created.version,
            operationIdentity: deleteOperation,
            projection: 'off',
            projectDelete() {},
        });
        expect(deleted).toEqual(expect.objectContaining({ ok: true, authorityCommitted: true }));
        const backup = createCanonicalChatBackup({ db: sourceDb });

        const targetDirectories = makeDirectories();
        const targetDb = createManager().open({ handle: 'alice', directories: targetDirectories, featureFlags: { enabled: true } });
        runCanonicalMigrations(targetDb);
        const restored = await restoreCanonicalChatBackup({
            db: targetDb,
            backup,
            handle: 'alice',
            directories: targetDirectories,
        });
        expect(restored.commitState).toBe('committed');
        const replay = writeCanonicalChatPayload({
            db: targetDb,
            locator,
            payload,
            condition: { create: true },
            operationIdentity: createOperation,
            projection: 'off',
            projectJsonl() {},
        });
        expect(replay).toEqual(expect.objectContaining({ ok: true, authorityCommitted: true, replayed: true }));
        expect(targetDb.prepare('SELECT COUNT(*) AS count FROM chat_sessions').get().count).toBe(0);
    });

    test('blocks a conflicting operation receipt without changing chats or tombstones', async () => {
        const directories = makeDirectories();
        const db = createManager().open({ handle: 'alice', directories, featureFlags: { enabled: true } });
        runCanonicalMigrations(db);
        const locator = { ownerType: 'character', ownerId: 'alice', sourcePath: 'chats/alice/existing.jsonl' };
        writeCanonicalChatPayload({ db, locator, payload: [{ chat_metadata: {} }, { mes: 'retain' }], condition: { create: true }, projection: 'off', projectJsonl() {} });
        const backup = createCanonicalChatBackup({ db });
        backup.sessions = [];
        backup.tombstones.push({ owner_type: 'character', owner_id: 'alice', source_path: 'chats/alice/other.jsonl' });
        backup.operationResults.push({ operation_id: 'collision', fingerprint: 'old', result_json: '{}' });
        db.prepare('INSERT INTO chat_operation_results VALUES (?, ?, ?)').run('collision', 'new', '{}');
        const result = await restoreCanonicalChatBackup({ db, backup, handle: 'alice', directories });
        expect(result).toEqual(expect.objectContaining({ ok: false, reasonCode: 'chat_operation_conflict', commitState: 'not_committed' }));
        expect(readCanonicalChatPayload(db, locator)[1].mes).toBe('retain');
        expect(db.prepare('SELECT COUNT(*) AS count FROM chat_projection_tombstones').get().count).toBe(0);
        expect(db.prepare('SELECT fingerprint FROM chat_operation_results WHERE operation_id = ?').get('collision').fingerprint).toBe('new');
    });

    test('accepts legacy version one backups without claiming they contain deletion or operation history', async () => {
        const directories = makeDirectories();
        const db = createManager().open({ handle: 'alice', directories, featureFlags: { enabled: true } });
        runCanonicalMigrations(db);
        const backup = createCanonicalChatBackup({ db });
        backup.manifestVersion = 1;
        delete backup.tombstones;
        delete backup.operationResults;
        const result = await restoreCanonicalChatBackup({ db, backup, handle: 'alice', directories });
        expect(result).toEqual(expect.objectContaining({ ok: true, commitState: 'committed' }));
    });

    test('blocks restore when the managed attachment manifest can no longer be satisfied and keeps current authority intact', async () => {
        const directories = makeDirectories();
        const manager = createManager();
        const sourcePath = path.join(directories.chats, 'alice', 'first.jsonl');
        const initialPayload = [
            { chat_metadata: { integrity: 'clean' } },
            { name: 'User', send_date: '2026-01-01T00:00:00.000Z', mes: 'Attachment', extra: { file: 'files/notes.txt' } },
        ];
        fs.writeFileSync(sourcePath, initialPayload.map(line => JSON.stringify(line)).join('\n'), 'utf8');

        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        runCanonicalMigrations(db, { nowMs: 1735689600000 });
        db.prepare(`
            INSERT INTO managed_blobs (
                id, content_hash, size_bytes, media_type, relative_path, lifecycle_state, created_at_ms, updated_at_ms, deleted_at_ms
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
        `).run('blob-notes', 'hash', 4, 'text/plain', 'managed-media/hash', 'active', 1735689600000, 1735689600000);
        db.prepare(`
            INSERT INTO media_references (
                id, blob_id, owner_type, owner_id, role, display_name, compatibility_path, metadata_json, created_at_ms, updated_at_ms, deleted_at_ms
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
        `).run('ref-notes', 'blob-notes', 'attachment', 'files/notes.txt', 'attachment', 'notes.txt', 'files/notes.txt', '{}', 1735689600000, 1735689600000);
        await runCanonicalChatShadowImport({
            handle: 'alice',
            directories,
            db,
            featureFlags: { enabled: true, shadowImport: true, strict: false },
            nowMs: 1735689600000,
        });

        const backup = createCanonicalChatBackup({
            db,
            createdAtMs: 1735689601000,
        });
        db.prepare('DELETE FROM media_references WHERE id = ?').run('ref-notes');
        writeCanonicalChatPayload({
            db,
            locator: {
                ownerType: 'character',
                ownerId: 'alice',
                sourcePath: 'chats/alice/first.jsonl',
            },
            payload: [
                { chat_metadata: { integrity: 'clean', updated: true } },
                { name: 'User', send_date: '2026-02-01T00:00:00.000Z', mes: 'Current authority' },
            ],
            projectJsonl(jsonl) {
                fs.writeFileSync(sourcePath, jsonl, 'utf8');
            },
            nowMs: 1735689602000,
        });

        const restored = await restoreCanonicalChatBackup({
            db,
            backup,
            handle: 'alice',
            directories,
            nowMs: 1735689603000,
        });

        expect(restored).toEqual(expect.objectContaining({
            ok: false,
            status: 'blocked',
            reasonCode: 'missing_attachment_reference',
            commitState: 'not_committed',
        }));
        expect(readCanonicalChatPayload(db, {
            ownerType: 'character',
            ownerId: 'alice',
            sourcePath: 'chats/alice/first.jsonl',
        })).toEqual([
            { chat_metadata: { integrity: 'clean', updated: true } },
            { name: 'User', send_date: '2026-02-01T00:00:00.000Z', mes: 'Current authority' },
        ]);
        expect(getCanonicalChatRestoreStatus(db)).toEqual(expect.objectContaining({
            status: 'blocked',
            reasonCode: 'missing_attachment_reference',
            commitState: 'not_committed',
        }));
    });

    test('keeps a committed restore intent pending after projection failure and replays current authority', async () => {
        const directories = makeDirectories();
        const db = createManager().open({ handle: 'alice', directories, featureFlags: { enabled: true } });
        runCanonicalMigrations(db);
        const backup = createCanonicalChatBackup({ db });
        backup.sessions = [{ ownerType: 'character', ownerId: 'alice', sourcePath: 'chats/alice/first.jsonl', sourceMtimeMs: 0, jsonl: '{"chat_metadata":{}}' }];
        fs.mkdirSync(path.join(directories.chats, 'alice', 'first.jsonl'));
        const result = await restoreCanonicalChatBackup({ db, backup, handle: 'alice', directories, nowMs: 1735689603000 });
        expect(result).toEqual(expect.objectContaining({ ok: false, reasonCode: 'restore_projection_failed', commitState: 'committed' }));
        expect(db.prepare('SELECT source_path FROM chat_sessions').get().source_path).toBe('chats/alice/first.jsonl');
        expect(getCanonicalChatRestoreStatus(db)).toEqual(expect.objectContaining({ reasonCode: 'restore_projection_failed', commitState: 'committed' }));
        const [repair] = listOpenCanonicalChatProjectionRepairs(db);
        expect(repair).toEqual(expect.objectContaining({
            repairKey: expect.stringContaining('chat-restore:'),
            operation: 'restore',
        }));

        fs.rmSync(path.join(directories.chats, 'alice', 'first.jsonl'), { recursive: true, force: true });
        const replay = await repairCanonicalChatProjection({ db, directories, repairKeys: [repair.repairKey], nowMs: 1735689604000 });
        expect(replay).toEqual(expect.objectContaining({ ok: true }));
        expect(listOpenCanonicalChatProjectionRepairs(db)).toEqual([]);
        expect(fs.readFileSync(path.join(directories.chats, 'alice', 'first.jsonl'), 'utf8')).toBe('{"chat_metadata":{}}');
    });

    test('reports transaction errors conservatively and legacy and unreadable journals as unknown', async () => {
        const directories = makeDirectories();
        const db = createManager().open({ handle: 'alice', directories, featureFlags: { enabled: true } });
        runCanonicalMigrations(db);
        const backup = createCanonicalChatBackup({ db });

        backup.sessions = [{ ownerType: 'character', ownerId: 'alice', sourcePath: 'chats/alice/first.jsonl', sourceMtimeMs: 0, jsonl: '{"chat_metadata":{}}' }];
        db.exec('CREATE TRIGGER reject_insert BEFORE INSERT ON chat_sessions BEGIN SELECT RAISE(ABORT, \'injected\'); END');
        const result = await restoreCanonicalChatBackup({ db, backup, handle: 'alice', directories, nowMs: 1735689603000 });
        expect(result).toEqual(expect.objectContaining({ ok: false, reasonCode: 'restore_failed', commitState: 'unknown' }));
        expect(db.prepare('SELECT COUNT(*) AS n FROM chat_sessions').get().n).toBe(0);
        expect(getCanonicalChatRestoreStatus(db).commitState).toBe('unknown');
        db.exec('UPDATE chat_restore_operations SET details_json = \'{}\' ');
        expect(getCanonicalChatRestoreStatus(db).commitState).toBe('unknown');
        expect(getCanonicalChatRestoreStatus({ exec() { throw new Error('unreadable'); } }).commitState).toBe('unknown');
    });

    test('reports a committed restore after audit failure and after a later exception', async () => {
        const directories = makeDirectories();
        const db = createManager().open({ handle: 'alice', directories, featureFlags: { enabled: true } });
        runCanonicalMigrations(db);
        const backup = createCanonicalChatBackup({ db });
        backup.sessions = [{ ownerType: 'character', ownerId: 'alice', sourcePath: 'chats/alice/first.jsonl', sourceMtimeMs: 0, jsonl: '{"chat_metadata":{}}' }];
        db.exec('DELETE FROM schema_migrations WHERE version = (SELECT MAX(version) FROM schema_migrations)');
        const audit = await restoreCanonicalChatBackup({ db, backup, handle: 'alice', directories, nowMs: 1735689603000 });
        expect(audit).toEqual(expect.objectContaining({ reasonCode: 'restore_audit_failed', commitState: 'committed' }));
        expect(getCanonicalChatRestoreStatus(db)).toEqual(expect.objectContaining({ reasonCode: 'restore_audit_failed', commitState: 'committed' }));
        expect(db.prepare('SELECT COUNT(*) AS n FROM chat_sessions').get().n).toBe(1);
        const otherDirectories = makeDirectories();
        const otherDb = createManager().open({ handle: 'alice', directories: otherDirectories, featureFlags: { enabled: true } });
        runCanonicalMigrations(otherDb);
        otherDb.exec('CREATE TRIGGER fail_completion BEFORE UPDATE ON chat_restore_operations WHEN NEW.status = \'restored\' BEGIN SELECT RAISE(ABORT, \'completion exception\'); END');
        const caught = await restoreCanonicalChatBackup({ db: otherDb, backup, handle: 'alice', directories: otherDirectories, nowMs: 1735689604000 });
        expect(caught).toEqual(expect.objectContaining({ reasonCode: 'restore_failed', commitState: 'committed' }));
        expect(getCanonicalChatRestoreStatus(otherDb)).toEqual(expect.objectContaining({ reasonCode: 'restore_failed', commitState: 'committed' }));
    });

    test('returns an explicit warning if the journal cannot be written', async () => {
        const directories = makeDirectories();
        const db = createManager().open({ handle: 'alice', directories, featureFlags: { enabled: true } });
        runCanonicalMigrations(db);
        const backup = createCanonicalChatBackup({ db });
        db.exec('CREATE TRIGGER fail_journal BEFORE INSERT ON chat_restore_operations BEGIN SELECT RAISE(ABORT, \'journal unavailable\'); END');
        const result = await restoreCanonicalChatBackup({ db, backup, handle: 'alice', directories });
        expect(result).toEqual(expect.objectContaining({ ok: false, commitState: 'not_committed', journalWritten: false }));
        expect(getCanonicalChatRestoreStatus(db)).toEqual(expect.objectContaining({ status: 'none', commitState: 'unknown' }));
    });

    test('preserves backed-up source mtimes and rejects incomplete projection repair state', async () => {
        const directories = makeDirectories();
        const manager = createManager();
        const sourcePath = path.join(directories.chats, 'alice', 'first.jsonl');
        fs.writeFileSync(sourcePath, [
            '{"chat_metadata":{"integrity":"clean"}}',
            '{"name":"User","send_date":"2026-01-01T00:00:00.000Z","mes":"Before"}',
        ].join('\n'), 'utf8');

        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        runCanonicalMigrations(db, { nowMs: 1735689600000 });
        await runCanonicalChatShadowImport({
            handle: 'alice',
            directories,
            db,
            featureFlags: { enabled: true, shadowImport: true, strict: false },
            nowMs: 1735689600000,
        });

        const originalMtime = db.prepare(`
            SELECT source_mtime_ms
            FROM chat_sessions
            WHERE owner_type = ? AND owner_id = ? AND source_path = ?
        `).get('character', 'alice', 'chats/alice/first.jsonl').source_mtime_ms;
        const backup = createCanonicalChatBackup({
            db,
            createdAtMs: 1735689601000,
        });

        writeCanonicalChatPayload({
            db,
            locator: {
                ownerType: 'character',
                ownerId: 'alice',
                sourcePath: 'chats/alice/first.jsonl',
            },
            payload: [
                { chat_metadata: { integrity: 'clean', updated: true } },
                { name: 'User', send_date: '2026-02-01T00:00:00.000Z', mes: 'After' },
            ],
            projectJsonl(jsonl) {
                fs.writeFileSync(sourcePath, jsonl, 'utf8');
            },
            nowMs: 1735689602000,
        });

        const incomplete = await restoreCanonicalChatBackup({
            db,
            backup: { ...backup, projectionRepairs: undefined },
            handle: 'alice',
            directories,
            nowMs: 1735689603000,
        });
        expect(incomplete).toEqual(expect.objectContaining({
            ok: false,
            status: 'blocked',
            reasonCode: 'incomplete_projection_state',
        }));
        expect(readCanonicalChatPayload(db, {
            ownerType: 'character',
            ownerId: 'alice',
            sourcePath: 'chats/alice/first.jsonl',
        })[1].mes).toBe('After');

        const restored = await restoreCanonicalChatBackup({
            db,
            backup,
            handle: 'alice',
            directories,
            nowMs: 1735689604000,
        });
        expect(restored).toEqual(expect.objectContaining({
            ok: true,
            status: 'restored',
        }));
        expect(db.prepare(`
            SELECT source_mtime_ms
            FROM chat_sessions
            WHERE owner_type = ? AND owner_id = ? AND source_path = ?
        `).get('character', 'alice', 'chats/alice/first.jsonl').source_mtime_ms).toBe(originalMtime);
    });

    test('includes only compatibility paths actually referenced by chat attachments', async () => {
        const directories = makeDirectories();
        const manager = createManager();
        const sourcePath = path.join(directories.chats, 'alice', 'first.jsonl');
        fs.writeFileSync(sourcePath, [
            '{"chat_metadata":{"integrity":"clean"}}',
            '{"name":"User","mes":"Attachment","extra":{"file":"files/notes.txt"}}',
        ].join('\n'), 'utf8');

        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        runCanonicalMigrations(db, { nowMs: 1735689600000 });
        db.prepare(`
            INSERT INTO managed_blobs (
                id, content_hash, size_bytes, media_type, relative_path, lifecycle_state, created_at_ms, updated_at_ms, deleted_at_ms
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
        `).run('blob-notes', 'hash', 4, 'text/plain', 'managed-media/hash', 'active', 1735689600000, 1735689600000);
        const insertReference = db.prepare(`
            INSERT INTO media_references (
                id, blob_id, owner_type, owner_id, role, display_name, compatibility_path, metadata_json, created_at_ms, updated_at_ms, deleted_at_ms
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
        `);
        insertReference.run('ref-notes', 'blob-notes', 'attachment', 'files/notes.txt', 'attachment', 'notes.txt', 'files/notes.txt', '{}', 1735689600000, 1735689600000);
        insertReference.run('ref-unrelated', 'blob-notes', 'attachment', 'files/unrelated-copy.txt', 'attachment', 'unrelated-copy.txt', 'files/unrelated-copy.txt', '{}', 1735689600000, 1735689600000);
        await runCanonicalChatShadowImport({
            handle: 'alice',
            directories,
            db,
            featureFlags: { enabled: true, shadowImport: true, strict: false },
            nowMs: 1735689600000,
        });

        expect(createCanonicalChatBackup({ db }).attachmentManifest.entries).toEqual([
            {
                blobId: 'blob-notes',
                compatibilityPath: 'files/notes.txt',
            },
        ]);
    });

    test('blocks restore when an attachment reference points to a deleted blob', async () => {
        const directories = makeDirectories();
        const manager = createManager();
        const sourcePath = path.join(directories.chats, 'alice', 'first.jsonl');
        fs.writeFileSync(sourcePath, [
            '{"chat_metadata":{"integrity":"clean"}}',
            '{"name":"User","mes":"Attachment","extra":{"file":"files/notes.txt"}}',
        ].join('\n'), 'utf8');

        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        runCanonicalMigrations(db, { nowMs: 1735689600000 });
        db.prepare(`
            INSERT INTO managed_blobs (
                id, content_hash, size_bytes, media_type, relative_path, lifecycle_state, created_at_ms, updated_at_ms, deleted_at_ms
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
        `).run('blob-notes', 'hash', 4, 'text/plain', 'managed-media/hash', 'active', 1735689600000, 1735689600000);
        db.prepare(`
            INSERT INTO media_references (
                id, blob_id, owner_type, owner_id, role, display_name, compatibility_path, metadata_json, created_at_ms, updated_at_ms, deleted_at_ms
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
        `).run('ref-notes', 'blob-notes', 'attachment', 'files/notes.txt', 'attachment', 'notes.txt', 'files/notes.txt', '{}', 1735689600000, 1735689600000);
        await runCanonicalChatShadowImport({
            handle: 'alice',
            directories,
            db,
            featureFlags: { enabled: true, shadowImport: true, strict: false },
            nowMs: 1735689600000,
        });

        const backup = createCanonicalChatBackup({ db });
        db.prepare('UPDATE managed_blobs SET deleted_at_ms = ? WHERE id = ?').run(1735689601000, 'blob-notes');

        expect(await restoreCanonicalChatBackup({
            db,
            backup,
            handle: 'alice',
            directories,
            nowMs: 1735689602000,
        })).toEqual(expect.objectContaining({
            ok: false,
            status: 'blocked',
            reasonCode: 'missing_attachment_reference',
        }));
    });

    test('rejects backup sessions whose projection path targets non-chat user data', async () => {
        const directories = makeDirectories();
        const manager = createManager();
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        runCanonicalMigrations(db, { nowMs: 1735689600000 });
        const protectedFile = path.join(directories.root, 'secrets.json');
        fs.writeFileSync(protectedFile, '{"keep":true}', 'utf8');

        const result = await restoreCanonicalChatBackup({
            db,
            handle: 'alice',
            directories,
            backup: {
                manifestVersion: 1,
                createdAtMs: 1735689600000,
                databaseRevision: { sessionCount: 1, maxUpdatedAtMs: 0 },
                projectionState: { openRepairCount: 0, repairKeys: [] },
                projectionRepairs: [],
                attachmentManifest: { version: 1, entries: [] },
                sessions: [{
                    ownerType: 'character',
                    ownerId: 'alice',
                    sourcePath: 'secrets.json',
                    sourceMtimeMs: 0,
                    jsonl: '{"chat_metadata":{}}',
                }],
            },
            nowMs: 1735689601000,
        });

        expect(result).toEqual(expect.objectContaining({
            ok: false,
            status: 'blocked',
            reasonCode: 'invalid_backup_session',
        }));
        expect(fs.readFileSync(protectedFile, 'utf8')).toBe('{"keep":true}');
    });
});
