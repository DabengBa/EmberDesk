import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, jest, test } from '@jest/globals';

import {
    createDerivedSqliteManager,
    DERIVED_SQLITE_MODES,
} from '../src/derived-cache-sqlite.js';

const tempRoots = [];
const managers = [];

function makeRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-derived-sqlite-'));
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
    const manager = createDerivedSqliteManager({
        logger: createLogger(),
        resetThreshold: 3,
        ...options,
    });
    managers.push(manager);
    return manager;
}

function createSidecarOptions(userRoot, overrides = {}) {
    return {
        userRoot,
        key: 'character-index',
        filename: 'character-index.sqlite',
        schemaVersion: 2,
        modeEnvVar: 'EMBERDESK_CHARACTER_INDEX_MODE',
        initialize(db) {
            db.exec(`
                CREATE TABLE IF NOT EXISTS rows (
                    id TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
            `);
        },
        resetSchema(db) {
            db.prepare('DELETE FROM rows').run();
        },
        ...overrides,
    };
}

afterEach(() => {
    for (const manager of managers.splice(0, managers.length)) {
        manager.dispose();
    }
    for (const root of tempRoots.splice(0, tempRoots.length)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

describe('derived sqlite manager', () => {
    test('parses supported modes and defaults invalid values to auto', () => {
        const manager = createManager();

        expect(manager.parseMode('force_on')).toBe(DERIVED_SQLITE_MODES.FORCE_ON);
        expect(manager.parseMode('FORCE_OFF')).toBe(DERIVED_SQLITE_MODES.FORCE_OFF);
        expect(manager.parseMode('auto')).toBe(DERIVED_SQLITE_MODES.AUTO);
        expect(manager.parseMode('invalid')).toBe(DERIVED_SQLITE_MODES.AUTO);
        expect(manager.parseMode(undefined)).toBe(DERIVED_SQLITE_MODES.AUTO);
    });

    test('reports unsupported status when node sqlite is unavailable', () => {
        const userRoot = makeRoot();
        const logger = createLogger();
        const manager = createDerivedSqliteManager({
            DatabaseSync: undefined,
            logger,
        });
        managers.push(manager);

        const db = manager.open(createSidecarOptions(userRoot));

        expect(db).toBeNull();
        expect(fs.existsSync(path.join(userRoot, '_cache'))).toBe(false);
        expect(manager.getStatus(userRoot, 'character-index', {
            filename: 'character-index.sqlite',
            modeEnvVar: 'EMBERDESK_CHARACTER_INDEX_MODE',
        })).toEqual(expect.objectContaining({
            supported: false,
            mode: 'auto',
            open: false,
            schemaVersion: 2,
            resetCount: 0,
            disabledReason: 'unsupported',
        }));
        expect(logger.info).toHaveBeenCalledWith('Derived SQLite sidecar status', expect.objectContaining({
            action: 'unsupported',
            nodeSqliteAvailable: false,
        }));
    });

    test('does not open a database when mode is force_off', () => {
        const userRoot = makeRoot();
        const logger = createLogger();
        const manager = createDerivedSqliteManager({
            env: { EMBERDESK_CHARACTER_INDEX_MODE: 'force_off' },
            logger,
        });
        managers.push(manager);

        const db = manager.open(createSidecarOptions(userRoot));

        expect(db).toBeNull();
        expect(fs.existsSync(path.join(userRoot, '_cache'))).toBe(false);
        expect(manager.getStatus(userRoot, 'character-index', {
            filename: 'character-index.sqlite',
            modeEnvVar: 'EMBERDESK_CHARACTER_INDEX_MODE',
        })).toEqual(expect.objectContaining({
            supported: false,
            mode: 'force_off',
            open: false,
            disabledReason: 'force_off',
        }));
        expect(logger.info).toHaveBeenCalledWith('Derived SQLite sidecar status', expect.objectContaining({
            action: 'disabled',
            mode: 'force_off',
        }));
    });

    test('reuses the same handle for the same user root and key while isolating different roots', () => {
        const firstRoot = makeRoot();
        const secondRoot = makeRoot();
        const manager = createManager();

        const firstHandle = manager.open(createSidecarOptions(firstRoot));
        const reusedHandle = manager.open(createSidecarOptions(firstRoot));
        const secondHandle = manager.open(createSidecarOptions(secondRoot));

        expect(reusedHandle).toBe(firstHandle);
        expect(secondHandle).not.toBe(firstHandle);
        expect(manager.getStatus(firstRoot, 'character-index', { filename: 'character-index.sqlite' })).toEqual(expect.objectContaining({
            supported: true,
            open: true,
            dbPath: path.join(firstRoot, '_cache', 'character-index.sqlite'),
        }));
    });

    test('applies the shared pragma baseline', () => {
        const userRoot = makeRoot();
        const manager = createManager();
        const db = manager.open(createSidecarOptions(userRoot));

        expect(db.prepare('PRAGMA journal_mode').get().journal_mode.toLowerCase()).toBe('wal');
        expect(Number(db.prepare('PRAGMA synchronous').get().synchronous)).toBe(1);
        expect(Number(db.prepare('PRAGMA busy_timeout').get().timeout)).toBe(5000);
        expect(Number(db.prepare('PRAGMA temp_store').get().temp_store)).toBe(2);
    });

    test('runs schema reset when the stored schema version does not match', () => {
        const userRoot = makeRoot();
        const manager = createManager();
        const options = createSidecarOptions(userRoot);
        const db = manager.open({ ...options, schemaVersion: 1 });
        db.prepare('INSERT INTO rows (id, value) VALUES (?, ?)').run('stale', 'payload');
        manager.dispose();

        const reopened = manager.open(options);

        expect(reopened.prepare('SELECT id FROM rows WHERE id = ?').get('stale')).toBeUndefined();
        expect(reopened.prepare('SELECT value FROM meta WHERE key = ?').get('schema_version').value).toBe('2');
        expect(fs.existsSync(path.join(userRoot, '_cache', 'character-index.sqlite'))).toBe(true);
    });

    test('recovers from a corrupt database file by rebuilding derived state', () => {
        const userRoot = makeRoot();
        const dbPath = path.join(userRoot, '_cache', 'character-index.sqlite');
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });
        fs.writeFileSync(dbPath, 'not a sqlite database', 'utf8');

        const manager = createManager();
        const db = manager.open(createSidecarOptions(userRoot));

        expect(db).not.toBeNull();
        expect(db.prepare('SELECT value FROM meta WHERE key = ?').get('schema_version').value).toBe('2');
        expect(manager.getStatus(userRoot, 'character-index', { filename: 'character-index.sqlite' })).toEqual(expect.objectContaining({
            open: true,
            resetCount: 1,
            disabledReason: null,
        }));
    });

    test('disables a sidecar in the current process after repeated structural resets', () => {
        const userRoot = makeRoot();
        const manager = createManager({ resetThreshold: 3 });
        const options = createSidecarOptions(userRoot);

        manager.open(options);
        manager.reset(userRoot, 'character-index', { reason: 'first failure' });
        manager.open(options);
        manager.reset(userRoot, 'character-index', { reason: 'second failure' });
        manager.open(options);
        manager.reset(userRoot, 'character-index', { reason: 'third failure' });

        expect(manager.open(options)).toBeNull();
        expect(manager.getStatus(userRoot, 'character-index', { filename: 'character-index.sqlite' })).toEqual(expect.objectContaining({
            supported: false,
            open: false,
            resetCount: 3,
            disabledReason: 'reset_threshold_exceeded',
        }));
    });

    test('dispose closes handles and allows later reopen', () => {
        const userRoot = makeRoot();
        const manager = createManager();
        const options = createSidecarOptions(userRoot);
        const firstHandle = manager.open(options);

        manager.dispose();
        const secondHandle = manager.open(options);

        expect(secondHandle).not.toBe(firstHandle);
        expect(manager.getStatus(userRoot, 'character-index', { filename: 'character-index.sqlite' })).toEqual(expect.objectContaining({
            open: true,
            resetCount: 0,
        }));
    });
});
