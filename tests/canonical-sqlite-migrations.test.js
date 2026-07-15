import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, jest, test } from '@jest/globals';

import { createCanonicalSqliteManager } from '../src/canonical-sqlite.js';
import {
    CanonicalMigrationBlockedError,
    CANONICAL_SQLITE_MIGRATIONS,
    getCanonicalMigrationStatus,
    runCanonicalMigrations,
} from '../src/canonical-sqlite-migrations.js';
import { expectCanonicalDomainSchema } from './helpers/canonical-domain-schema.js';

const tempRoots = [];
const managers = [];

function makeRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-canonical-migrations-'));
    tempRoots.push(root);
    return root;
}

function createDirectories(root) {
    return {
        root,
        storage: path.join(root, 'storage'),
    };
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

describe('canonical sqlite migrations', () => {
    test('exports an ordered migration catalog with the phase-one schema contract', () => {
        expect(CANONICAL_SQLITE_MIGRATIONS).toEqual(expect.arrayContaining([
            expect.objectContaining({ version: 1, name: expect.any(String), sql: expect.any(String) }),
            expect.objectContaining({ version: 2, name: expect.any(String), sql: expect.any(String) }),
            expect.objectContaining({ version: 3, name: expect.any(String), sql: expect.any(String) }),
            expect.objectContaining({ version: 4, name: expect.any(String), sql: expect.any(String) }),
            expect.objectContaining({ version: 5, name: expect.any(String), sql: expect.any(String) }),
            expect.objectContaining({ version: 6, name: expect.any(String), sql: expect.any(String) }),
            expect.objectContaining({ version: 7, name: expect.any(String), sql: expect.any(String) }),
            expect.objectContaining({ version: 8, name: expect.any(String), sql: expect.any(String) }),
            expect.objectContaining({ version: 9, name: expect.any(String), sql: expect.any(String) }),
        ]));
        expect(CANONICAL_SQLITE_MIGRATIONS.map(x => x.version)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
        expect(CANONICAL_SQLITE_MIGRATIONS[0].sql).toContain('CREATE TABLE IF NOT EXISTS characters');
        expect(CANONICAL_SQLITE_MIGRATIONS[0].sql).toContain('CREATE TABLE IF NOT EXISTS character_chat_stats');
        expect(CANONICAL_SQLITE_MIGRATIONS[0].sql).toContain('CREATE TABLE IF NOT EXISTS projection_repairs');
        expect(CANONICAL_SQLITE_MIGRATIONS[1].sql).toContain('CREATE TABLE IF NOT EXISTS canonical_audit_state');
        expect(CANONICAL_SQLITE_MIGRATIONS[2].sql).toContain('CREATE TABLE IF NOT EXISTS world_books');
        expect(CANONICAL_SQLITE_MIGRATIONS[2].sql).toContain('CREATE TABLE IF NOT EXISTS world_book_entries');
        expect(CANONICAL_SQLITE_MIGRATIONS[2].sql).toContain('CREATE TABLE IF NOT EXISTS world_info_projection_repairs');
        expect(CANONICAL_SQLITE_MIGRATIONS[3].sql).toContain('CREATE TABLE IF NOT EXISTS settings_documents');
        expect(CANONICAL_SQLITE_MIGRATIONS[3].sql).toContain('CREATE TABLE IF NOT EXISTS settings_snapshots');
        expect(CANONICAL_SQLITE_MIGRATIONS[3].sql).toContain('CREATE TABLE IF NOT EXISTS settings_projection_repairs');
        expect(CANONICAL_SQLITE_MIGRATIONS[4].sql).toContain('CREATE TABLE IF NOT EXISTS secret_records');
        expect(CANONICAL_SQLITE_MIGRATIONS[4].sql).toContain('CREATE TABLE IF NOT EXISTS secret_migration_markers');
        expect(CANONICAL_SQLITE_MIGRATIONS[4].sql).toContain('CREATE TABLE IF NOT EXISTS secret_projection_repairs');
        expect(CANONICAL_SQLITE_MIGRATIONS[5].sql).toContain('CREATE TABLE IF NOT EXISTS managed_blobs');
        expect(CANONICAL_SQLITE_MIGRATIONS[5].sql).toContain('CREATE TABLE IF NOT EXISTS media_references');
        expect(CANONICAL_SQLITE_MIGRATIONS[5].sql).toContain('CREATE TABLE IF NOT EXISTS media_folders');
        expect(CANONICAL_SQLITE_MIGRATIONS[5].sql).toContain('CREATE TABLE IF NOT EXISTS media_folder_memberships');
        expect(CANONICAL_SQLITE_MIGRATIONS[5].sql).toContain('CREATE TABLE IF NOT EXISTS managed_media_repairs');
        expect(CANONICAL_SQLITE_MIGRATIONS[6].sql).toContain('CREATE TABLE IF NOT EXISTS chat_sessions');
        expect(CANONICAL_SQLITE_MIGRATIONS[6].sql).toContain('CREATE TABLE IF NOT EXISTS chat_messages');
        expect(CANONICAL_SQLITE_MIGRATIONS[6].sql).toContain('CREATE TABLE IF NOT EXISTS chat_message_swipes');
        expect(CANONICAL_SQLITE_MIGRATIONS[6].sql).toContain('CREATE TABLE IF NOT EXISTS chat_attachment_refs');
        expect(CANONICAL_SQLITE_MIGRATIONS[7].sql).toContain('CREATE TABLE IF NOT EXISTS chat_projection_repairs');
        expect(CANONICAL_SQLITE_MIGRATIONS[8].sql).toContain('CREATE TABLE IF NOT EXISTS chat_restore_operations');
    });

    test('bootstraps the canonical schema and reports applied versions', () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });

        const status = runCanonicalMigrations(db, { nowMs: 1735689600000 });

        expect(status).toEqual(expect.objectContaining({
            ok: true,
            blockedReason: null,
            currentVersion: 9,
            targetVersion: 9,
            appliedVersions: [1, 2, 3, 4, 5, 6, 7, 8, 9],
        }));
        expect(db.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?').get('table', 'schema_migrations')).toBeTruthy();
        expect(db.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?').get('table', 'characters')).toBeTruthy();
        expect(db.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?').get('table', 'character_chat_stats')).toBeTruthy();
        expect(db.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?').get('table', 'projection_repairs')).toBeTruthy();
        expect(db.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?').get('table', 'canonical_audit_state')).toBeTruthy();
        expect(db.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?').get('table', 'world_books')).toBeTruthy();
        expect(db.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?').get('table', 'world_book_entries')).toBeTruthy();
        expect(db.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?').get('table', 'world_info_projection_repairs')).toBeTruthy();
        expect(db.prepare('SELECT version, name, applied_at_ms FROM schema_migrations').all()).toEqual([
            {
                version: 1,
                name: CANONICAL_SQLITE_MIGRATIONS[0].name,
                applied_at_ms: 1735689600000,
            },
            {
                version: 2,
                name: CANONICAL_SQLITE_MIGRATIONS[1].name,
                applied_at_ms: 1735689600000,
            },
            {
                version: 3,
                name: CANONICAL_SQLITE_MIGRATIONS[2].name,
                applied_at_ms: 1735689600000,
            },
            {
                version: 4,
                name: CANONICAL_SQLITE_MIGRATIONS[3].name,
                applied_at_ms: 1735689600000,
            },
            {
                version: 5,
                name: CANONICAL_SQLITE_MIGRATIONS[4].name,
                applied_at_ms: 1735689600000,
            },
            {
                version: 6,
                name: CANONICAL_SQLITE_MIGRATIONS[5].name,
                applied_at_ms: 1735689600000,
            },
            {
                version: 7,
                name: CANONICAL_SQLITE_MIGRATIONS[6].name,
                applied_at_ms: 1735689600000,
            },
            {
                version: 8,
                name: CANONICAL_SQLITE_MIGRATIONS[7].name,
                applied_at_ms: 1735689600000,
            },
            {
                version: 9,
                name: CANONICAL_SQLITE_MIGRATIONS[8].name,
                applied_at_ms: 1735689600000,
            },
        ]);
        expect(db.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?').get('table', 'settings_documents')).toBeTruthy();
        expect(db.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?').get('table', 'settings_snapshots')).toBeTruthy();
        expect(db.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?').get('table', 'settings_projection_repairs')).toBeTruthy();
        expect(db.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?').get('table', 'secret_records')).toBeTruthy();
        expect(db.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?').get('table', 'secret_migration_markers')).toBeTruthy();
        expect(db.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?').get('table', 'secret_projection_repairs')).toBeTruthy();
        expect(db.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?').get('table', 'managed_blobs')).toBeTruthy();
        expect(db.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?').get('table', 'media_references')).toBeTruthy();
        expect(db.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?').get('table', 'media_folders')).toBeTruthy();
        expect(db.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?').get('table', 'media_folder_memberships')).toBeTruthy();
        expect(db.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?').get('table', 'managed_media_repairs')).toBeTruthy();
        expect(db.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?').get('table', 'chat_sessions')).toBeTruthy();
        expect(db.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?').get('table', 'chat_messages')).toBeTruthy();
        expect(db.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?').get('table', 'chat_message_swipes')).toBeTruthy();
        expect(db.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?').get('table', 'chat_attachment_refs')).toBeTruthy();
        expect(db.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?').get('table', 'chat_projection_repairs')).toBeTruthy();
        expect(db.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?').get('table', 'chat_restore_operations')).toBeTruthy();
    });

    test('runs idempotently without duplicating rows or schema records', () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });

        const first = runCanonicalMigrations(db, { nowMs: 1735689600000 });
        db.prepare(`
            INSERT INTO characters (
                id, avatar_filename, internal_name, display_name, card_json, shallow_json,
                world_name, created_at_ms, updated_at_ms, deleted_at_ms
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            'char-1',
            'alpha.png',
            'Alpha',
            'Alpha',
            '{"name":"Alpha"}',
            '{"name":"Alpha"}',
            '',
            1,
            1,
            null,
        );

        const second = runCanonicalMigrations(db, { nowMs: 1735689609999 });

        expect(first.appliedVersions).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
        expect(second).toEqual(expect.objectContaining({
            ok: true,
            blockedReason: null,
            currentVersion: 9,
            targetVersion: 9,
            appliedVersions: [],
        }));
        expect(db.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get().count).toBe(9);
        expect(db.prepare('SELECT COUNT(*) AS count FROM characters').get().count).toBe(1);
        expect(db.prepare('SELECT avatar_filename FROM characters WHERE id = ?').get('char-1').avatar_filename).toBe('alpha.png');
    });

    test('adds canonical_audit_state for databases that were already at schema version 1', () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });

        db.exec(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                applied_at_ms INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS characters (
                id TEXT PRIMARY KEY,
                avatar_filename TEXT NOT NULL UNIQUE,
                internal_name TEXT NOT NULL,
                display_name TEXT NOT NULL,
                card_json TEXT NOT NULL,
                shallow_json TEXT NOT NULL,
                world_name TEXT NOT NULL DEFAULT '',
                created_at_ms INTEGER NOT NULL,
                updated_at_ms INTEGER NOT NULL,
                deleted_at_ms INTEGER
            );

            CREATE TABLE IF NOT EXISTS character_chat_stats (
                character_id TEXT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
                chat_count INTEGER NOT NULL DEFAULT 0,
                chat_size_bytes INTEGER NOT NULL DEFAULT 0,
                date_last_chat_ms INTEGER NOT NULL DEFAULT 0,
                stats_updated_at_ms INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS projection_repairs (
                repair_key TEXT PRIMARY KEY,
                repair_type TEXT NOT NULL,
                character_id TEXT,
                avatar_filename TEXT NOT NULL DEFAULT '',
                reason TEXT NOT NULL,
                details_json TEXT NOT NULL DEFAULT '{}',
                created_at_ms INTEGER NOT NULL,
                updated_at_ms INTEGER NOT NULL,
                last_attempt_at_ms INTEGER,
                resolved_at_ms INTEGER
            );
        `);
        db.prepare(`
            INSERT INTO schema_migrations (version, name, applied_at_ms)
            VALUES (?, ?, ?)
        `).run(1, 'phase_one_character_metadata_and_chat_stats', 1735689600000);

        const status = runCanonicalMigrations(db, { nowMs: 1735689610000 });

        expect(status).toEqual(expect.objectContaining({
            ok: true,
            currentVersion: 9,
            targetVersion: 9,
            appliedVersions: [2, 3, 4, 5, 6, 7, 8, 9],
        }));
        expect(db.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?').get('table', 'canonical_audit_state')).toBeTruthy();
        expect(db.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?').get('table', 'world_books')).toBeTruthy();
        expect(db.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?').get('table', 'settings_documents')).toBeTruthy();
        expect(db.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?').get('table', 'secret_records')).toBeTruthy();
        expect(db.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?').get('table', 'managed_blobs')).toBeTruthy();
    });

    test('reports a clear blocker and keeps the database file when a migration fails', () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        const dbPath = path.join(directories.storage, 'emberdesk.sqlite');

        const status = runCanonicalMigrations(db, {
            nowMs: 1735689600000,
            migrations: [{
                version: 1,
                name: 'broken_schema',
                sql: 'CREATE TABLE bad (;',
            }],
            strict: false,
        });

        expect(status).toEqual(expect.objectContaining({
            ok: false,
            currentVersion: 0,
            targetVersion: 1,
            failedVersion: 1,
            failedName: 'broken_schema',
            blockedReason: expect.stringContaining('broken_schema'),
        }));
        expect(fs.existsSync(dbPath)).toBe(true);
        expect(db.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?').get('table', 'schema_migrations')).toBeTruthy();
        expect(db.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get().count).toBe(0);
    });

    test('throws in strict mode and exposes the blocker to the canonical manager contract', () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });

        expect(() => runCanonicalMigrations(db, {
            nowMs: 1735689600000,
            migrations: [{
                version: 1,
                name: 'broken_schema',
                sql: 'CREATE TABLE bad (;',
            }],
            strict: true,
        })).toThrow(CanonicalMigrationBlockedError);

        const status = getCanonicalMigrationStatus(db, {
            migrations: [{
                version: 1,
                name: 'broken_schema',
                sql: 'CREATE TABLE bad (;',
            }],
            strict: false,
        });

        expect(manager.getStatus({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
            migrationBlockedReason: status.blockedReason,
        })).toEqual(expect.objectContaining({
            disabledReason: 'migration_blocked',
            migrationBlockedReason: status.blockedReason,
            open: true,
        }));
    });

    test('blocks when the database schema version is newer than the supported target', () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });

        db.exec(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                applied_at_ms INTEGER NOT NULL
            );
        `);
        db.prepare(`
            INSERT INTO schema_migrations (version, name, applied_at_ms)
            VALUES (?, ?, ?)
        `).run(99, 'future_schema', 1735689600000);

        const status = runCanonicalMigrations(db, {
            migrations: [{
                version: 1,
                name: 'phase_one_character_metadata_and_chat_stats',
                sql: 'CREATE TABLE IF NOT EXISTS safe_table (id TEXT PRIMARY KEY);',
            }],
            strict: false,
        });

        expect(status).toEqual(expect.objectContaining({
            ok: false,
            currentVersion: 99,
            targetVersion: 1,
            blockedReason: expect.stringContaining('newer than supported target 1'),
        }));
    });

    test('blocks when applied migration versions are non-contiguous within the current catalog', () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });

        db.exec(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                applied_at_ms INTEGER NOT NULL
            );
        `);
        db.prepare(`
            INSERT INTO schema_migrations (version, name, applied_at_ms)
            VALUES (?, ?, ?)
        `).run(2, 'second_step_without_first', 1735689600000);

        const migrations = [
            {
                version: 1,
                name: 'first_step',
                sql: 'CREATE TABLE IF NOT EXISTS first_step_table (id TEXT PRIMARY KEY);',
            },
            {
                version: 2,
                name: 'second_step_without_first',
                sql: 'CREATE TABLE IF NOT EXISTS second_step_table (id TEXT PRIMARY KEY);',
            },
        ];

        const status = runCanonicalMigrations(db, { migrations, strict: false });

        expect(status).toEqual(expect.objectContaining({
            ok: false,
            currentVersion: 2,
            targetVersion: 2,
            appliedVersions: [2],
            blockedReason: expect.stringContaining('diverges at position 1'),
        }));
        expect(db.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get().count).toBe(1);
    });

    test('blocks when an applied migration name does not match the current catalog', () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });

        runCanonicalMigrations(db, { nowMs: 1735689600000 });
        db.prepare('UPDATE schema_migrations SET name = ? WHERE version = ?').run('renamed_phase_one', 1);

        const status = getCanonicalMigrationStatus(db);

        expect(status).toEqual(expect.objectContaining({
            ok: false,
            currentVersion: 9,
            targetVersion: 9,
            appliedVersions: [1, 2, 3, 4, 5, 6, 7, 8, 9],
            blockedReason: expect.stringContaining('expected name'),
        }));
    });

    test('clears a remembered blocker after a later successful migration run', () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });

        const failed = runCanonicalMigrations(db, {
            nowMs: 1735689600000,
            migrations: [{
                version: 1,
                name: 'broken_schema',
                sql: 'CREATE TABLE bad (;',
            }],
            strict: false,
        });
        expect(failed.ok).toBe(false);

        const recovered = runCanonicalMigrations(db, {
            nowMs: 1735689601234,
        });

        expect(recovered).toEqual(expect.objectContaining({
            ok: true,
            blockedReason: null,
            currentVersion: 9,
            targetVersion: 9,
            appliedVersions: [1, 2, 3, 4, 5, 6, 7, 8, 9],
        }));
        expect(getCanonicalMigrationStatus(db)).toEqual(expect.objectContaining({
            ok: true,
            blockedReason: null,
            currentVersion: 9,
            targetVersion: 9,
            appliedVersions: [1, 2, 3, 4, 5, 6, 7, 8, 9],
        }));
    });

    test('domain schema assertions remain valid after an unrelated later migration', () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        const lastVersion = Math.max(...CANONICAL_SQLITE_MIGRATIONS.map(migration => migration.version));
        const migrations = [
            ...CANONICAL_SQLITE_MIGRATIONS,
            {
                version: lastVersion + 1,
                name: 'unrelated_test_fixture',
                sql: 'CREATE TABLE IF NOT EXISTS unrelated_test_fixture (id TEXT PRIMARY KEY);',
            },
        ];

        const status = runCanonicalMigrations(db, {
            migrations,
            nowMs: 1735689600000,
        });

        expect(status).toEqual(expect.objectContaining({ ok: true }));
        expectCanonicalDomainSchema(db, {
            migrationName: 'settings_document_authority',
            tables: ['settings_documents', 'settings_snapshots', 'settings_projection_repairs'],
        });
        expectCanonicalDomainSchema(db, {
            migrationName: 'secrets_authority',
            tables: ['secret_records', 'secret_migration_markers', 'secret_projection_repairs'],
        });
        expectCanonicalDomainSchema(db, {
            migrationName: 'managed_media_authority',
            tables: ['managed_blobs', 'media_references', 'media_folders', 'media_folder_memberships', 'managed_media_repairs'],
        });
        expect(db.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?')
            .get('table', 'unrelated_test_fixture')).toEqual({ name: 'unrelated_test_fixture' });
    });
});
