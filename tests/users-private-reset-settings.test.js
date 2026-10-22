import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

const checkForNewContentMock = jest.fn(async () => {});
const defaultsPayload = JSON.parse(
    fs.readFileSync(new URL('../default/templates/settings-defaults.json', import.meta.url), 'utf8'),
);

jest.unstable_mockModule('node-persist', () => ({
    default: { getItem: jest.fn(async () => undefined), setItem: jest.fn(async () => {}) },
}));

// Deterministic reset code for the /reset-step1 -> /reset-step2 flow.
jest.unstable_mockModule('node:crypto', async () => {
    const actual = await jest.requireActual('node:crypto');
    const randomInt = () => 4242;
    return { ...actual, default: { ...actual, randomInt }, randomInt };
});

jest.unstable_mockModule('../src/endpoints/content-manager.js', () => ({
    checkForNewContent: checkForNewContentMock,
    getDefaultTemplateFile: (name) => (name === 'settings-defaults.json' ? structuredClone(defaultsPayload) : null),
    getDefaultPresets: () => [],
    getDefaultPresetFile: () => null,
}));

jest.unstable_mockModule('../src/users.js', () => ({
    getUserAvatar: async () => '',
    toKey: handle => `user:${handle}`,
    getPasswordHash: password => `hash:${password}`,
    getPasswordSalt: () => 'salt',
    createBackupArchive: async () => {},
    ensurePublicDirectoriesExist: async () => {},
    toAvatarKey: handle => handle,
    getAccountVersion: () => 'account-version',
    getAllUserHandles: async () => [],
    getUserDirectories: () => ({}),
}));

const { setConfigFilePath } = await import('../src/util.js');
const configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-reset-config-'));
fs.writeFileSync(path.join(configRoot, 'config.yaml'), 'port: 8000\n', 'utf8');
setConfigFilePath(path.join(configRoot, 'config.yaml'));

const { router } = await import('../src/endpoints/users-private.js');
const { canonicalSqliteManager } = await import('../src/canonical-sqlite.js');
const { resetCanonicalBackendsForTests } = await import('../src/canonical-backend.js');
const { runCanonicalMigrations } = await import('../src/canonical-sqlite-migrations.js');
const { upsertCanonicalSettingsDocument, getCanonicalSettingsDocument } = await import('../src/endpoints/settings-store.js');
const { persistCanonicalAuditStatus } = await import('../src/canonical-sqlite-shadow-import.js');
const { SETTINGS_AUDIT_SCOPE } = await import('../src/canonical-settings-shadow-import.js');

const envKeys = [
    'EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED',
    'EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SHADOWIMPORT',
    'EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_READS',
    'EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_WRITES',
    'EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_STRICT',
];

const tempRoots = [];

function makeRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-reset-settings-'));
    tempRoots.push(root);
    return root;
}

function createDirectories(root) {
    const directories = {
        root,
        storage: path.join(root, 'storage'),
        backups: path.join(root, 'backups'),
    };
    fs.mkdirSync(directories.storage, { recursive: true });
    fs.mkdirSync(directories.backups, { recursive: true });
    return directories;
}

function setCanonicalEnv() {
    process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED = 'true';
    process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SHADOWIMPORT = 'true';
    process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_READS = 'true';
    process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_WRITES = 'true';
    process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_STRICT = 'false';
}

function createResponse() {
    return {
        body: undefined,
        headers: {},
        statusCode: 200,
        json(payload) { this.body = payload; return this; },
        send(payload) { this.body = payload; return this; },
        sendStatus(code) { this.statusCode = code; this.body = code; return this; },
        status(code) { this.statusCode = code; return this; },
    };
}

async function invokeReset(directories, { body = {}, handle = 'alice', password = null } = {}) {
    const layer = router.stack.find(entry => entry.route?.path === '/reset-settings' && entry.route.methods?.post);
    if (!layer) {
        throw new Error('Route not found: POST /reset-settings');
    }
    const response = createResponse();
    await layer.route.stack[0].handle({
        body,
        session: {},
        user: {
            profile: { handle, ...(password ? { password: 'hash:secret', salt: 'salt' } : {}) },
            directories,
        },
    }, response);
    return response;
}

function seedDocument(directories, payload, { handle = 'alice', expectedRevision = 0 } = {}) {
    const db = canonicalSqliteManager.open({
        handle,
        directories,
        featureFlags: { enabled: true, strict: false },
    });
    runCanonicalMigrations(db, { nowMs: 1000 });
    upsertCanonicalSettingsDocument(db, { userId: handle, payload, expectedRevision, nowMs: 2000 });
    persistCanonicalAuditStatus(db, {
        ok: true,
        handle,
        hasDrift: false,
        blocking: false,
        entries: [],
    }, {
        scope: SETTINGS_AUDIT_SCOPE,
        auditedAtMs: 3000,
    });
    return db;
}

function readDocument(directories, handle = 'alice') {
    const db = canonicalSqliteManager.open({
        handle,
        directories,
        featureFlags: { enabled: true, strict: false },
    });
    return getCanonicalSettingsDocument(db, { userId: handle });
}

beforeEach(() => {
    setCanonicalEnv();
    checkForNewContentMock.mockClear();
});

afterEach(() => {
    for (const key of envKeys) {
        delete process.env[key];
    }
    try {
        canonicalSqliteManager.dispose();
    } catch {
        // ignore
    }
    resetCanonicalBackendsForTests();
    for (const root of tempRoots.splice(0, tempRoots.length)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

afterAll(() => {
    fs.rmSync(configRoot, { recursive: true, force: true });
});

describe('reset-settings under canonical authority', () => {
    test('resets the canonical document to defaults instead of re-seeding the file', async () => {
        const directories = createDirectories(makeRoot());
        fs.writeFileSync(path.join(directories.root, 'settings.json'), JSON.stringify({ custom: 'stale-file' }));
        seedDocument(directories, { custom: 'user-values', marker: true });

        const response = await invokeReset(directories, { body: { password: 'x' } });

        expect(response.statusCode).toBe(204);
        const doc = readDocument(directories);
        expect(doc.payload).toEqual(defaultsPayload);
        expect(doc.revision).toBe(2);
        // The stray legacy file is fully inert: reset neither deletes nor
        // re-seeds it — canonical reset touches only the document.
        expect(fs.readFileSync(path.join(directories.root, 'settings.json'), 'utf8'))
            .toBe(JSON.stringify({ custom: 'stale-file' }));
        expect(checkForNewContentMock).not.toHaveBeenCalled();
    });

    test('creates a defaults document when the canonical doc is missing', async () => {
        const directories = createDirectories(makeRoot());
        fs.writeFileSync(path.join(directories.root, 'settings.json'), JSON.stringify({ custom: 'file-only' }));

        const response = await invokeReset(directories, { body: { password: 'x' } });

        expect(response.statusCode).toBe(204);
        const doc = readDocument(directories);
        expect(doc.payload).toEqual(defaultsPayload);
        expect(doc.revision).toBeGreaterThanOrEqual(1);
    });

    test('keeps existing snapshots intact', async () => {
        const directories = createDirectories(makeRoot());
        fs.writeFileSync(path.join(directories.root, 'settings.json'), JSON.stringify({ custom: 'file' }));
        const db = seedDocument(directories, { custom: 'v1' });
        db.prepare(`INSERT INTO settings_snapshots (id, user_id, source_revision, payload_json, content_hash, name, created_at_ms)
                    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
            'snap-1', 'alice', 1, '{}', 'hash', 'keep-me', 1000,
        );

        await invokeReset(directories, { body: { password: 'x' } });

        const row = db.prepare('SELECT name FROM settings_snapshots WHERE id = ?').get('snap-1');
        expect(row.name).toBe('keep-me');
    });

    test('fails closed when canonical storage is unavailable', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED = 'false';

        const response = await invokeReset(directories, { body: { password: 'x' } });

        expect(response.statusCode).toBe(503);
        expect(response.body).toEqual(expect.objectContaining({
            error: 'canonical_storage_unavailable',
        }));
    });

    test('still rejects a wrong password without touching the document', async () => {
        const directories = createDirectories(makeRoot());
        seedDocument(directories, { custom: 'v1' });

        const response = await invokeReset(directories, {
            body: { password: 'wrong' },
            password: 'set',
        });

        expect(response.statusCode).toBe(403);
        expect(readDocument(directories).payload).toEqual({ custom: 'v1' });
    });
});

describe('reset-step2 under canonical authority', () => {
    async function invokeStep(routePath, request) {
        const layer = router.stack.find(entry => entry.route?.path === routePath && entry.route.methods?.post);
        if (!layer) {
            throw new Error(`Route not found: POST ${routePath}`);
        }
        const response = createResponse();
        await layer.route.stack[0].handle(request, response);
        return response;
    }

    test('full reset recreates a canonical document and never a settings.json', async () => {
        const directories = createDirectories(makeRoot());
        seedDocument(directories, { custom: 'v1' });
        fs.writeFileSync(path.join(directories.root, 'settings.json'), JSON.stringify({ custom: 'file' }));
        const user = { profile: { handle: 'alice', name: 'Alice' }, directories };

        const step1 = await invokeStep('/reset-step1', { body: {}, user });
        expect(step1.statusCode).toBe(204);

        const response = await invokeStep('/reset-step2', {
            body: { code: '4242', password: 'x' },
            user,
        });

        expect(response.statusCode).toBe(204);
        // The whole root (sqlite included) was wiped; the bootstrap rebuilt a
        // defaults document without ever materializing a file.
        const doc = readDocument(directories);
        expect(doc.payload).toEqual(defaultsPayload);
        expect(doc.revision).toBe(1);
        expect(fs.existsSync(path.join(directories.root, 'settings.json'))).toBe(false);
    });
});
