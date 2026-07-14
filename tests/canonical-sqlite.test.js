import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeAll, describe, expect, jest, test } from '@jest/globals';

import {
    CanonicalSqliteDisabledError,
    createCanonicalSqliteManager,
    resolveCanonicalDatabasePath,
    withCanonicalTransaction,
} from '../src/canonical-sqlite.js';
import {
    getCanonicalSqliteFeatureFlags,
    getCanonicalStorageSliceFeatureFlagSnapshot,
} from '../src/storage-feature-flags.js';
import { setConfigFilePath } from '../src/util.js';

const tempRoots = [];
const managers = [];
const tmpConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-canonical-sqlite-config-'));
const configPath = path.join(tmpConfigDir, 'config.yaml');

function makeRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-canonical-sqlite-'));
    tempRoots.push(root);
    return root;
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

function createDirectories(root, overrides = {}) {
    return {
        root,
        storage: path.join(root, 'storage'),
        ...overrides,
    };
}

beforeAll(() => {
    fs.writeFileSync(configPath, [
        'features:',
        '  storage:',
        '    canonicalSqlite:',
        '      enabled: false',
        '      shadowImport: false',
        '      reads: false',
        '      writes: false',
        '      chatStats: false',
        '      strict: false',
        '',
    ].join('\n'), 'utf8');
    setConfigFilePath(configPath);
});

afterEach(() => {
    for (const manager of managers.splice(0, managers.length)) {
        manager.dispose();
    }
    for (const root of tempRoots.splice(0, tempRoots.length)) {
        fs.rmSync(root, { recursive: true, force: true });
    }

    delete process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED;
    delete process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SHADOWIMPORT;
    delete process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_READS;
    delete process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_WRITES;
    delete process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_CHATSTATS;
    delete process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_STRICT;
    delete process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SLICES_CHARACTERS_ENABLED;
    delete process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SLICES_CHARACTERS_READS;
    delete process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SLICES_SETTINGS_READS;
});

describe('canonical sqlite feature flags', () => {
    test('default to disabled and honor env overrides behind the master gate', () => {
        expect(getCanonicalSqliteFeatureFlags()).toEqual({
            enabled: false,
            shadowImport: false,
            reads: false,
            writes: false,
            chatStats: false,
            strict: false,
        });

        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SHADOWIMPORT = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_READS = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_WRITES = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_CHATSTATS = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_STRICT = 'true';

        expect(getCanonicalSqliteFeatureFlags()).toEqual({
            enabled: true,
            shadowImport: true,
            reads: true,
            writes: true,
            chatStats: true,
            strict: true,
        });
    });

    test('resolves slice flags from explicit overrides or the compatible global fallback', () => {
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SHADOWIMPORT = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_READS = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_WRITES = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_CHATSTATS = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_STRICT = 'true';

        expect(getCanonicalStorageSliceFeatureFlagSnapshot({
            flagKey: 'characters',
            supportsChatStats: true,
        })).toEqual(expect.objectContaining({
            featureFlags: {
                enabled: true,
                shadowImport: true,
                reads: true,
                writes: true,
                chatStats: true,
                strict: true,
            },
            sources: expect.objectContaining({
                enabled: 'global',
                reads: 'global',
            }),
            resolution: {
                ok: true,
                reasonCode: null,
            },
        }));

        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SLICES_CHARACTERS_ENABLED = 'false';
        expect(getCanonicalStorageSliceFeatureFlagSnapshot({
            flagKey: 'characters',
            supportsChatStats: true,
        })).toEqual(expect.objectContaining({
            featureFlags: {
                enabled: false,
                shadowImport: false,
                reads: false,
                writes: false,
                chatStats: false,
                strict: false,
            },
            sources: expect.objectContaining({
                enabled: 'slice',
                reads: 'disabled_by_enabled',
            }),
        }));
        expect(getCanonicalStorageSliceFeatureFlagSnapshot({
            flagKey: 'worldInfo',
        }).featureFlags.reads).toBe(true);

        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SLICES_CHARACTERS_ENABLED = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SLICES_CHARACTERS_READS = 'false';
        expect(getCanonicalStorageSliceFeatureFlagSnapshot({
            flagKey: 'characters',
            supportsChatStats: true,
        })).toEqual(expect.objectContaining({
            featureFlags: expect.objectContaining({
                enabled: true,
                reads: false,
                writes: true,
            }),
            sources: expect.objectContaining({
                enabled: 'slice',
                reads: 'slice',
                writes: 'global',
            }),
        }));
    });

    test('fails closed with a stable reason code for invalid explicit slice flags', () => {
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED = 'true';
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SLICES_SETTINGS_READS = 'not-a-boolean';

        expect(getCanonicalStorageSliceFeatureFlagSnapshot({
            flagKey: 'settings',
        })).toEqual(expect.objectContaining({
            featureFlags: {
                enabled: false,
                shadowImport: false,
                reads: false,
                writes: false,
                strict: false,
            },
            resolution: {
                ok: false,
                reasonCode: 'invalid_slice_flag_configuration',
            },
        }));
    });
});

describe('canonical sqlite manager', () => {
    test('resolves database paths under the per-user storage directory', () => {
        const root = makeRoot();
        const directories = createDirectories(root);

        expect(resolveCanonicalDatabasePath(directories)).toEqual({
            storageRoot: path.join(root, 'storage'),
            dbPath: path.join(root, 'storage', 'emberdesk.sqlite'),
        });
    });

    test('rejects database paths that escape the storage directory', () => {
        const root = makeRoot();

        expect(() => resolveCanonicalDatabasePath(createDirectories(root), path.join('..', 'escaped.sqlite')))
            .toThrow(/escapes storage directory/);
    });

    test('rejects using the user root itself as the storage directory', () => {
        const root = makeRoot();

        expect(() => resolveCanonicalDatabasePath(createDirectories(root, {
            storage: root,
        }))).toThrow(/escapes user root/);
    });

    test('does not take authority when the master flag is disabled', () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();

        expect(manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: false, strict: false },
        })).toBeNull();
        expect(manager.getStatus({
            handle: 'alice',
            directories,
            featureFlags: { enabled: false, strict: false },
        })).toEqual(expect.objectContaining({
            enabled: false,
            disabledReason: 'disabled',
            open: false,
        }));
    });

    test('fails closed when sqlite is unsupported and throws in strict mode', () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const logger = createLogger();
        const manager = createCanonicalSqliteManager({
            DatabaseSync: undefined,
            logger,
        });
        managers.push(manager);

        expect(manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        })).toBeNull();
        expect(manager.getStatus({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        })).toEqual(expect.objectContaining({
            supported: false,
            disabledReason: 'unsupported',
            open: false,
        }));

        expect(() => manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: true },
        })).toThrow(CanonicalSqliteDisabledError);
        expect(logger.info).toHaveBeenCalledWith('Canonical SQLite status', expect.objectContaining({
            action: 'unsupported',
            disabledReason: 'unsupported',
        }));
    });

    test('reports migration blocked status and throws in strict mode', () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();

        expect(manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
            migrationBlockedReason: 'schema pending',
        })).toBeNull();
        expect(manager.getStatus({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
            migrationBlockedReason: 'schema pending',
        })).toEqual(expect.objectContaining({
            disabledReason: 'migration_blocked',
            migrationBlockedReason: 'schema pending',
        }));

        expect(() => manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: true },
            migrationBlockedReason: 'schema pending',
        })).toThrow(CanonicalSqliteDisabledError);
    });

    test('opens a reusable database handle with canonical pragma settings', () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();

        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        const reused = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });

        expect(reused).toBe(db);
        expect(db.prepare('PRAGMA journal_mode').get().journal_mode.toLowerCase()).toBe('wal');
        expect(Number(db.prepare('PRAGMA synchronous').get().synchronous)).toBe(2);
        expect(Number(db.prepare('PRAGMA busy_timeout').get().timeout)).toBe(5000);
        expect(Number(db.prepare('PRAGMA foreign_keys').get().foreign_keys)).toBe(1);
        expect(Number(db.prepare('PRAGMA temp_store').get().temp_store)).toBe(2);
    });

    test('rolls back transactions on error and closes idempotently', () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });

        db.exec(`
            CREATE TABLE IF NOT EXISTS rows (
                id TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
        `);

        expect(() => withCanonicalTransaction(db, () => {
            db.prepare('INSERT INTO rows (id, value) VALUES (?, ?)').run('one', 'first');
            throw new Error('boom');
        })).toThrow('boom');
        expect(db.prepare('SELECT id FROM rows WHERE id = ?').get('one')).toBeUndefined();

        withCanonicalTransaction(db, () => {
            db.prepare('INSERT INTO rows (id, value) VALUES (?, ?)').run('two', 'second');
        });
        expect(db.prepare('SELECT value FROM rows WHERE id = ?').get('two').value).toBe('second');

        expect(manager.close(directories)).toBe(true);
        expect(manager.close(directories)).toBe(false);
    });

    test('rejects async transaction callbacks before commit', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });

        db.exec(`
            CREATE TABLE IF NOT EXISTS rows (
                id TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
        `);

        expect(() => withCanonicalTransaction(db, async () => {
            db.prepare('INSERT INTO rows (id, value) VALUES (?, ?)').run('async', 'value');
        })).toThrow('only supports synchronous callbacks');
        expect(db.prepare('SELECT id FROM rows WHERE id = ?').get('async')).toBeUndefined();
    });

    test('preserves open state details when close throws', () => {
        const root = makeRoot();
        const directories = createDirectories(root);

        class BrokenDatabase {
            exec() {
                // No-op
            }

            close() {
                throw new Error('close failed');
            }
        }

        const manager = createManager({ DatabaseSync: BrokenDatabase });
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });

        expect(db).not.toBeNull();
        expect(() => manager.close(directories)).toThrow('close failed');
        expect(manager.getStatus({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        })).toEqual(expect.objectContaining({
            open: true,
            lastAction: 'close_failed',
            lastError: 'close failed',
        }));
    });

    test('does not delete database or user files when open fails', () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const dbPath = path.join(directories.storage, 'emberdesk.sqlite');
        const userFilePath = path.join(root, 'characters', 'sentinel.png');
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });
        fs.mkdirSync(path.dirname(userFilePath), { recursive: true });
        fs.writeFileSync(dbPath, 'keep-me', 'utf8');
        fs.writeFileSync(userFilePath, 'keep-user-file', 'utf8');

        class BrokenDatabase {
            exec() {
                throw new Error('pragma failed');
            }

            close() {
                // No-op
            }
        }

        const manager = createManager({ DatabaseSync: BrokenDatabase });

        expect(manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        })).toBeNull();
        expect(fs.readFileSync(dbPath, 'utf8')).toBe('keep-me');
        expect(fs.readFileSync(userFilePath, 'utf8')).toBe('keep-user-file');
        expect(manager.getStatus({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        })).toEqual(expect.objectContaining({
            lastAction: 'open_failed',
            lastError: 'pragma failed',
        }));
    });
});
