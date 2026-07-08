import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, jest, test } from '@jest/globals';

import { createCanonicalSqliteManager } from '../src/canonical-sqlite.js';
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
            reason: 'audit_drift_blocked',
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
            reason: 'audit_drift_blocked',
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
});
