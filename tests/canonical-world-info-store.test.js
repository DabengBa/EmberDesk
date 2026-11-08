import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, jest, test } from '@jest/globals';

import { createCanonicalSqliteManager, withCanonicalTransaction } from '../src/canonical-sqlite.js';
import * as worldStore from '../src/endpoints/world-info-store.js';
import { runCanonicalMigrations } from '../src/canonical-sqlite-migrations.js';
import {
    getCanonicalWorldInfoBook,
    listCanonicalWorldInfoBooks,
    normalizeCanonicalWorldInfoName,
    recordWorldInfoProjectionRepair,
    upsertCanonicalWorldInfoBook,
} from '../src/endpoints/world-info-store.js';
import {
    auditCanonicalWorldInfoShadowImport,
    runCanonicalWorldInfoShadowImport,
} from '../src/canonical-world-info-shadow-import.js';
import {
    recordWorldProjectionIntent,
} from '../src/canonical-world-info-projection.js';
import {
    getPersistedCanonicalAuditStatus,
    persistCanonicalAuditStatus,
} from '../src/canonical-sqlite-shadow-import.js';

const tempRoots = [];
const managers = [];

function makeRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-canonical-world-info-'));
    tempRoots.push(root);
    return root;
}

function createDirectories(root) {
    const directories = {
        root,
        storage: path.join(root, 'storage'),
        worlds: path.join(root, 'worlds'),
    };
    fs.mkdirSync(directories.worlds, { recursive: true });
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

afterEach(() => {
    for (const manager of managers.splice(0, managers.length)) {
        manager.dispose();
    }
    for (const root of tempRoots.splice(0, tempRoots.length)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

describe('canonical world info store', () => {
    test('audit persistence failure rolls back and releases its writer transaction', async () => {
        const directories = createDirectories(makeRoot());
        const db = createManager().open({ handle: 'alice', directories, featureFlags: { enabled: true } });
        runCanonicalMigrations(db);
        db.exec('CREATE TEMP TRIGGER audit_abort BEFORE INSERT ON canonical_audit_state BEGIN SELECT RAISE(ABORT, \'audit fault\'); END');
        await expect(auditCanonicalWorldInfoShadowImport({ db, directories, handle: 'alice' })).rejects.toThrow('audit fault');
        expect(db.isTransaction).toBe(false);
        expect(db.prepare('SELECT count(*) AS n FROM canonical_audit_state WHERE audit_scope = \'world_info\'').get().n).toBe(0);
        db.exec('BEGIN IMMEDIATE; ROLLBACK');
    });
    test('audit holds the SQLite writer lock while scanning projection files', async () => {
        const directories = createDirectories(makeRoot());
        const db = createManager().open({ handle: 'alice', directories, featureFlags: { enabled: true } });
        runCanonicalMigrations(db);
        const other = new DatabaseSync(path.join(directories.storage, 'emberdesk.sqlite'));
        other.exec('PRAGMA busy_timeout = 0');
        const original = fs.readdirSync;
        let blocked = false;
        const spy = jest.spyOn(fs, 'readdirSync').mockImplementation((...args) => {
            if (String(args[0]) === directories.worlds) {
                try { other.exec('INSERT INTO world_books (id,name,payload_json,created_at_ms,updated_at_ms) VALUES (\'race\',\'Race\',\'{}\',1,1)'); }
                catch (error) { blocked = /locked|busy/i.test(String(error)); }
            }
            return original(...args);
        });
        try {
            await auditCanonicalWorldInfoShadowImport({ db, directories, handle: 'alice' });
            expect(blocked).toBe(true);
        } finally {
            spy.mockRestore();
            other.close();
        }
    });
    test('transaction-scoped world upsert rolls back with its repair intent', () => {
        const directories = createDirectories(makeRoot());
        const db = createManager().open({ handle: 'alice', directories, featureFlags: { enabled: true } });
        runCanonicalMigrations(db);
        expect(typeof worldStore.upsertCanonicalWorldInfoBookInTransaction).toBe('function');
        expect(() => withCanonicalTransaction(db, txn => {
            worldStore.upsertCanonicalWorldInfoBookInTransaction(txn, { name: 'Atomic', payload: { entries: {} } });
            recordWorldInfoProjectionRepair(txn, { repairKey: 'atomic-test', worldName: 'Atomic', reason: 'pending' });
            throw new Error('abort before commit');
        })).toThrow('abort before commit');
        expect(db.prepare('SELECT count(*) AS count FROM world_books').get().count).toBe(0);
        expect(db.prepare('SELECT count(*) AS count FROM world_info_projection_repairs').get().count).toBe(0);
    });
    test('uses the committed world book id when another writer inserts before BEGIN IMMEDIATE', () => {
        const directories = createDirectories(makeRoot());
        const manager = createManager();
        const db = manager.open({ handle: 'alice', directories, featureFlags: { enabled: true } });
        runCanonicalMigrations(db);
        const concurrent = new DatabaseSync(path.join(directories.storage, 'emberdesk.sqlite'));
        concurrent.exec('PRAGMA foreign_keys = ON');
        let injected = false;
        const connection = {
            prepare: db.prepare.bind(db),
            exec(sql) {
                if (sql === 'BEGIN IMMEDIATE' && !injected) {
                    injected = true;
                    upsertCanonicalWorldInfoBook(concurrent, { name: 'race', payload: { entries: {} } });
                }
                return db.exec(sql);
            },
        };
        try {
            const result = upsertCanonicalWorldInfoBook(connection, {
                name: 'race', payload: { entries: { one: { content: 'winner' } } },
            });
            expect(result.id).toBe(db.prepare('SELECT id FROM world_books WHERE name = ?').get('race').id);
            expect(db.prepare('SELECT world_book_id FROM world_book_entries').get().world_book_id).toBe(result.id);
        } finally {
            concurrent.close();
        }
    });
    test('normalizes canonical world info names to the projection-safe file id', () => {
        expect(normalizeCanonicalWorldInfoName('Folder/../Unsafe:Name')).toBe('Folder..UnsafeName');
    });

    test('migrations create the world info authority tables idempotently', () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });

        const first = runCanonicalMigrations(db, { nowMs: 1735689600000 });
        const second = runCanonicalMigrations(db, { nowMs: 1735689609999 });

        expect(first).toEqual(expect.objectContaining({
            ok: true,
            currentVersion: expect.any(Number),
            targetVersion: expect.any(Number),
        }));
        expect(first.targetVersion).toBeGreaterThanOrEqual(3);
        expect(second).toEqual(expect.objectContaining({
            ok: true,
            appliedVersions: [],
        }));
        expect(db.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?').get('table', 'world_books')).toBeTruthy();
        expect(db.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?').get('table', 'world_book_entries')).toBeTruthy();
        expect(db.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?').get('table', 'world_info_projection_repairs')).toBeTruthy();
    });

    test('round-trips a world book payload without changing the route-visible JSON shape', () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        runCanonicalMigrations(db, { nowMs: 1735689600000 });

        const payload = {
            name: 'Lorebook',
            extensions: { depth: 2 },
            entries: {
                '2': {
                    uid: 2,
                    key: ['beta'],
                    keysecondary: ['fallback'],
                    content: 'Beta lore',
                    comment: 'Beta',
                    order: 20,
                    enabled: true,
                    selective: false,
                    constant: true,
                    position: 0,
                    role: 1,
                    probability: 80,
                    depth: 4,
                    extensions: { source: 'test' },
                },
                '1': {
                    uid: 1,
                    key: ['alpha'],
                    content: 'Alpha lore',
                    order: 10,
                    enabled: false,
                },
            },
        };

        upsertCanonicalWorldInfoBook(db, {
            name: 'Lorebook',
            payload,
            sourceMtimeMs: 111,
            sourceSizeBytes: 222,
            nowMs: 1735689600000,
        });

        expect(getCanonicalWorldInfoBook(db, 'Lorebook')).toEqual(payload);
        expect(listCanonicalWorldInfoBooks(db)).toEqual([{
            file_id: 'Lorebook',
            name: 'Lorebook',
            extensions: { depth: 2 },
        }]);
    });

    test('records world info projection repairs separately from character repairs', () => {
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
            repairKey: 'world-info:Lorebook:projection',
            worldName: 'Lorebook',
            reason: 'projection_failed',
            details: { operation: 'edit' },
            nowMs: 1735689601000,
        });

        expect(db.prepare(`
            SELECT repair_key, world_name, reason, details_json, resolved_at_ms
            FROM world_info_projection_repairs
        `).all()).toEqual([{
            repair_key: 'world-info:Lorebook:projection',
            world_name: 'Lorebook',
            reason: 'projection_failed',
            details_json: JSON.stringify({ operation: 'edit' }),
            resolved_at_ms: null,
        }]);
        expect(db.prepare('SELECT COUNT(*) AS count FROM projection_repairs').get().count).toBe(0);
    });

    test('imports an uppercase extension and blocks audit for conflicting aliases', async () => {
        const directories = createDirectories(makeRoot());
        const manager = createManager();
        fs.writeFileSync(path.join(directories.worlds, 'Lore.JSON'), JSON.stringify({ entries: {} }));
        const options = { handle: 'alice', directories, featureFlags: { enabled: true, shadowImport: true }, manager };
        const result = await runCanonicalWorldInfoShadowImport(options);
        expect(result).toEqual(expect.objectContaining({ ok: true, importedCount: 1 }));
        const db = manager.open({ handle: 'alice', directories, featureFlags: { enabled: true } });
        expect(getCanonicalWorldInfoBook(db, 'Lore')).toEqual({ entries: {} });
        expect((await auditCanonicalWorldInfoShadowImport({ handle: 'alice', directories, db })).ok).toBe(true);
        const upper = path.join(directories.worlds, 'Lore.JSON');
        if (!fs.existsSync(upper)) {
            fs.writeFileSync(upper, JSON.stringify({ entries: {} }));
            const conflict = await runCanonicalWorldInfoShadowImport(options);
            expect(conflict.ok).toBe(false);
            expect((await auditCanonicalWorldInfoShadowImport({ handle: 'alice', directories, db })).blocking).toBe(true);
        }
    });

    test('uppercase import supports case-insensitive lookup of the same file', async () => {
        const directories = createDirectories(makeRoot());
        const manager = createManager();
        const source = path.join(directories.worlds, 'Lore.JSON');
        const target = path.join(directories.worlds, 'Lore.json');
        fs.writeFileSync(source, JSON.stringify({ entries: {} }));
        const originalExists = fs.existsSync.bind(fs);
        const exists = jest.spyOn(fs, 'existsSync').mockImplementation(p => p === target && originalExists(source) ? true : originalExists(p));
        try {
            const result = await runCanonicalWorldInfoShadowImport({ handle: 'alice', directories, manager, featureFlags: { enabled: true, shadowImport: true } });
            expect(result.ok).toBe(true);
            expect(fs.readFileSync(target, 'utf8')).toBe(JSON.stringify({ entries: {} }));
        } finally { exists.mockRestore(); }
    });

    test.each(['target', 'source'])('uppercase import preserves a concurrently replaced %s', async race => {
        const directories = createDirectories(makeRoot());
        const manager = createManager();
        const source = path.join(directories.worlds, 'Lore.JSON');
        const target = path.join(directories.worlds, 'Lore.json');
        const original = JSON.stringify({ entries: { original: {} } });
        const replacement = JSON.stringify({ entries: { replacement: {} } });
        fs.writeFileSync(source, original);
        // Independent case variants cannot coexist on a case-insensitive volume.
        if (race === 'target' && fs.existsSync(target)) return;
        const realRename = fs.renameSync.bind(fs);
        let injected = false;
        const rename = jest.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
            if (!injected && from === source) {
                injected = true;
                if (race === 'target') fs.writeFileSync(target, replacement);
                else { fs.unlinkSync(source); fs.writeFileSync(source, replacement); }
            }
            return realRename(from, to);
        });
        try {
            const result = await runCanonicalWorldInfoShadowImport({ handle: 'alice', directories, manager, featureFlags: { enabled: true, shadowImport: true } });
            expect(injected).toBe(true);
            expect(result.ok).toBe(false);
            const findContents = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? findContents(path.join(dir, e.name)) : [fs.readFileSync(path.join(dir, e.name), 'utf8')]);
            expect(findContents(directories.worlds)).toContain(replacement);
        } finally { rename.mockRestore(); }
    });

    test('failed SQLite import cannot rename an independent uppercase file', async () => {
        const directories = createDirectories(makeRoot());
        const manager = createManager();
        const db = manager.open({ handle: 'alice', directories, featureFlags: { enabled: true } });
        runCanonicalMigrations(db);
        db.exec("CREATE TRIGGER reject_world BEFORE INSERT ON world_books BEGIN SELECT RAISE(ABORT, 'import fault'); END");
        const source = path.join(directories.worlds, 'Lore.JSON');
        fs.writeFileSync(source, JSON.stringify({ entries: {} }));
        const result = await runCanonicalWorldInfoShadowImport({ handle: 'alice', directories, manager, featureFlags: { enabled: true, shadowImport: true } });
        expect(result.ok).toBe(false);
        expect(fs.existsSync(source)).toBe(true);
        expect(fs.readdirSync(directories.worlds)).not.toContain('Lore.json');
    });

    test('an import error remains blocking even when projection mode is off', async () => {
        const directories = createDirectories(makeRoot());
        const manager = createManager();
        const db = manager.open({ handle: 'alice', directories, featureFlags: { enabled: true } });
        runCanonicalMigrations(db);
        upsertCanonicalWorldInfoBook(db, { name: 'Lore', payload: { entries: { current: {} } } });
        fs.writeFileSync(path.join(directories.worlds, 'Lore.json'), JSON.stringify({ entries: { legacy: {} } }));
        const importResult = await runCanonicalWorldInfoShadowImport({ handle: 'alice', directories, manager, featureFlags: { enabled: true, shadowImport: true } });
        expect(importResult.ok).toBe(false);
        const audit = await auditCanonicalWorldInfoShadowImport({ handle: 'alice', directories, db, projection: 'off', importResult });
        expect(audit.blocking).toBe(true);
        expect(getPersistedCanonicalAuditStatus(db, { scope: 'world_info' }).blocking).toBe(true);
    });

    test('shadow-imports world info files idempotently without rewriting projections', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const lorebookPath = path.join(directories.worlds, 'Lorebook.json');
        fs.writeFileSync(lorebookPath, JSON.stringify({
            name: 'Display Lore',
            extensions: { depth: 2 },
            entries: {
                one: { uid: 1, key: ['alpha'], content: 'Alpha lore' },
            },
        }, null, 4));
        const mtimeBefore = fs.statSync(lorebookPath).mtimeMs;

        const first = await runCanonicalWorldInfoShadowImport({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, shadowImport: true, strict: false },
            manager,
            nowMs: 1735689600000,
        });
        const second = await runCanonicalWorldInfoShadowImport({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, shadowImport: true, strict: false },
            manager,
            nowMs: 1735689609999,
        });

        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });

        expect(first).toEqual(expect.objectContaining({
            ok: true,
            importedCount: 1,
            updatedCount: 0,
            unchangedCount: 0,
            failedCount: 0,
        }));
        expect(second).toEqual(expect.objectContaining({
            ok: true,
            importedCount: 0,
            updatedCount: 0,
            unchangedCount: 1,
            failedCount: 0,
        }));
        expect(getCanonicalWorldInfoBook(db, 'Lorebook')).toEqual({
            name: 'Display Lore',
            extensions: { depth: 2 },
            entries: {
                one: { uid: 1, key: ['alpha'], content: 'Alpha lore' },
            },
        });
        expect(fs.statSync(lorebookPath).mtimeMs).toBe(mtimeBefore);
    });

    test('audits world info drift and persists the world_info audit scope', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const cleanPath = path.join(directories.worlds, 'Clean.json');
        const changedPath = path.join(directories.worlds, 'Changed.json');
        fs.writeFileSync(cleanPath, JSON.stringify({ entries: { one: { content: 'clean' } } }));
        fs.writeFileSync(changedPath, JSON.stringify({ entries: { one: { content: 'before' } } }));

        await runCanonicalWorldInfoShadowImport({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, shadowImport: true, strict: false },
            manager,
            nowMs: 1735689600000,
        });
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        persistCanonicalAuditStatus(db, {
            ok: true,
            handle: 'alice',
            hasDrift: false,
            blocking: false,
            entries: [],
        }, {
            scope: 'world_info',
            auditedAtMs: 1735689600100,
        });

        fs.writeFileSync(changedPath, JSON.stringify({ entries: { one: { content: 'after' } } }));
        fs.writeFileSync(path.join(directories.worlds, 'MissingDb.json'), JSON.stringify({ entries: {} }));
        fs.rmSync(cleanPath);

        const audit = await auditCanonicalWorldInfoShadowImport({
            handle: 'alice',
            directories,
            db,
            auditedAtMs: 1735689602000,
        });
        expect(audit).toEqual(expect.objectContaining({
            ok: false,
            blocking: true,
            hasDrift: true,
            reason: 'audit_stale_file_changes',
        }));
        expect(audit.entries).toEqual(expect.arrayContaining([
            expect.objectContaining({
                world_name: 'Changed',
                status: 'drift',
                drift_types: ['payload_mismatch'],
            }),
            expect.objectContaining({
                world_name: 'MissingDb',
                status: 'drift',
                drift_types: ['missing_db_world_info'],
            }),
            expect.objectContaining({
                world_name: 'Clean',
                status: 'drift',
                drift_types: ['missing_projection_file'],
            }),
        ]));
        expect(getPersistedCanonicalAuditStatus(db, { scope: 'world_info' })).toEqual(expect.objectContaining({
            ok: false,
            reason: 'audit_stale_file_changes',
            driftCount: 3,
            entryCount: 3,
        }));
    });

    test('audits malformed world info projections as audit errors', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        fs.writeFileSync(path.join(directories.worlds, 'Broken.json'), '{ broken json');
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        runCanonicalMigrations(db, { nowMs: 1735689600000 });

        const audit = await auditCanonicalWorldInfoShadowImport({
            handle: 'alice',
            directories,
            db,
            auditedAtMs: 1735689603000,
        });

        expect(audit).toEqual(expect.objectContaining({
            ok: false,
            blocking: true,
            reason: 'audit_drift_blocked',
        }));
        expect(audit.entries).toEqual([
            expect.objectContaining({
                world_name: 'Broken',
                status: 'error',
                drift_types: ['audit_error'],
            }),
        ]);
        expect(getPersistedCanonicalAuditStatus(db, { scope: 'world_info' })).toEqual(expect.objectContaining({
            ok: false,
            errorCount: 1,
            entryCount: 1,
        }));
    });

    test('audit treats a pending v1 write intent as expected drift but keeps legacy rows blocking', async () => {
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
            name: 'Pending',
            payload: { entries: { one: { content: 'committed' } } },
            nowMs: 1735689600100,
        });

        // Authority committed, projection not yet written: an expected pending
        // state, not unproven history.
        withCanonicalTransaction(db, txn => recordWorldProjectionIntent(txn, {
            directories,
            name: 'Pending',
            action: 'write',
            mode: 'sync',
            nowMs: 1735689600200,
        }));

        const pendingAudit = await auditCanonicalWorldInfoShadowImport({
            handle: 'alice',
            directories,
            db,
            auditedAtMs: 1735689600300,
        });
        expect(pendingAudit).toEqual(expect.objectContaining({
            ok: true,
            blocking: false,
        }));
        expect(pendingAudit.entries).toEqual([
            expect.objectContaining({
                world_name: 'Pending',
                status: 'drift',
                drift_types: ['missing_projection_file'],
                details: expect.objectContaining({ expected_projection_pending: true }),
            }),
        ]);
        expect(getPersistedCanonicalAuditStatus(db, { scope: 'world_info' })).toEqual(expect.objectContaining({
            ok: true,
            blocking: false,
        }));

        // A legacy row is unproven history and must stay blocking.
        recordWorldInfoProjectionRepair(db, {
            repairKey: 'world_info:Legacy:edit',
            worldName: 'Legacy',
            reason: 'projection_failed',
            details: { operation: 'edit' },
        });
        const legacyAudit = await auditCanonicalWorldInfoShadowImport({
            handle: 'alice',
            directories,
            db,
            auditedAtMs: 1735689600400,
        });
        expect(legacyAudit.blocking).toBe(true);
    });

    test('audit associates an existing stale projection with the database row id and off keeps legacy blockers', async () => {
        const directories = createDirectories(makeRoot());
        const manager = createManager();
        const db = manager.open({ handle: 'alice', directories, featureFlags: { enabled: true, strict: false } });
        runCanonicalMigrations(db);
        upsertCanonicalWorldInfoBook(db, { name: 'Pending', payload: { id: 'not-the-db-id', entries: { a: { content: 'new' } } } });
        fs.writeFileSync(path.join(directories.worlds, 'Pending.json'), JSON.stringify({ entries: { a: { content: 'old' } } }));
        withCanonicalTransaction(db, txn => recordWorldProjectionIntent(txn, { directories, name: 'Pending', action: 'write', mode: 'sync' }));
        const audit = await auditCanonicalWorldInfoShadowImport({ handle: 'alice', directories, db, projection: 'sync' });
        expect(audit.blocking).toBe(false);
        expect(audit.entries[0].details.expected_projection_pending).toBe(true);
        recordWorldInfoProjectionRepair(db, { repairKey: 'world_info:Legacy:edit', worldName: 'Legacy', reason: 'projection_failed' });
        const off = await auditCanonicalWorldInfoShadowImport({ handle: 'alice', directories, db, projection: 'off' });
        expect(off.blocking).toBe(true);
    });
});
