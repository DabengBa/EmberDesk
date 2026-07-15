import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeAll, describe, expect, test } from '@jest/globals';

import { canonicalSqliteManager } from '../src/canonical-sqlite.js';
import { runCanonicalMigrations } from '../src/canonical-sqlite-migrations.js';
import { getPersistedCanonicalAuditStatus, persistCanonicalAuditStatus } from '../src/canonical-sqlite-shadow-import.js';
import { upsertCanonicalWorldInfoBook } from '../src/endpoints/world-info-store.js';
import { router } from '../src/endpoints/worldinfo.js';
import { setConfigFilePath } from '../src/util.js';

const tempRoots = [];
const tmpConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-worldinfo-route-config-'));
const configPath = path.join(tmpConfigDir, 'config.yaml');

function makeRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-worldinfo-route-'));
    tempRoots.push(root);
    return root;
}

function createDirectories(root) {
    const directories = {
        root,
        storage: path.join(root, 'storage'),
        worlds: path.join(root, 'worlds'),
    };
    fs.mkdirSync(directories.storage, { recursive: true });
    fs.mkdirSync(directories.worlds, { recursive: true });
    return directories;
}

function createResponse() {
    return {
        body: undefined,
        statusCode: 200,
        send(payload) { this.body = payload; return this; },
        sendStatus(code) { this.statusCode = code; this.body = code; return this; },
        status(code) { this.statusCode = code; return this; },
    };
}

async function invokeRoute(pathName, body, directories) {
    const layer = router.stack.find(entry => entry.route?.path === pathName && entry.route.methods?.post);
    if (!layer) {
        throw new Error(`Route not found: POST ${pathName}`);
    }

    const response = createResponse();
    await layer.route.stack[0].handle({
        body,
        user: {
            profile: { handle: 'alice' },
            directories,
        },
    }, response);
    return response;
}

async function invokeRouteWithRequest(pathName, request) {
    const layer = router.stack.find(entry => entry.route?.path === pathName && entry.route.methods?.post);
    if (!layer) {
        throw new Error(`Route not found: POST ${pathName}`);
    }

    const response = createResponse();
    await layer.route.stack[0].handle(request, response);
    return response;
}

function setCanonicalEnv({ enabled = true, shadowImport = true, reads = true, writes = false, strict = false } = {}) {
    process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED = String(enabled);
    process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SHADOWIMPORT = String(shadowImport);
    process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_READS = String(reads);
    process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_WRITES = String(writes);
    process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_STRICT = String(strict);
}

function clearCanonicalEnv() {
    delete process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED;
    delete process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SHADOWIMPORT;
    delete process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_READS;
    delete process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_WRITES;
    delete process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_CHATSTATS;
    delete process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_STRICT;
    delete process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SLICES_WORLDINFO_ENABLED;
}

function seedCanonicalWorldInfo(directories, {
    name = 'Lorebook',
    payload = { name: 'Canonical Lore', extensions: { source: 'db' }, entries: { one: { content: 'db' } } },
    auditClean = true,
} = {}) {
    const db = canonicalSqliteManager.open({
        handle: 'alice',
        directories,
        featureFlags: { enabled: true, strict: false },
    });
    runCanonicalMigrations(db, { nowMs: 1735689600000 });
    upsertCanonicalWorldInfoBook(db, {
        name,
        payload,
        sourceMtimeMs: 1,
        sourceSizeBytes: 2,
        nowMs: 1735689600000,
    });
    if (auditClean) {
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
    }
    return db;
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
    canonicalSqliteManager.dispose();
    clearCanonicalEnv();
    for (const root of tempRoots.splice(0, tempRoots.length)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

describe('world info canonical route service', () => {
    test('serves list and get from canonical sqlite when read flags and world_info audit are clean', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        fs.writeFileSync(path.join(directories.worlds, 'Lorebook.json'), JSON.stringify({
            name: 'File Lore',
            extensions: { source: 'file' },
            entries: { one: { content: 'file' } },
        }));
        seedCanonicalWorldInfo(directories);
        setCanonicalEnv({ enabled: true, shadowImport: true, reads: true });

        const listResponse = await invokeRoute('/list', {}, directories);
        const getResponse = await invokeRoute('/get', { name: 'Lorebook' }, directories);

        expect(listResponse.statusCode).toBe(200);
        expect(listResponse.body).toEqual([{
            file_id: 'Lorebook',
            name: 'Canonical Lore',
            extensions: { source: 'db' },
        }]);
        expect(getResponse.statusCode).toBe(200);
        expect(getResponse.body).toEqual({
            name: 'Canonical Lore',
            extensions: { source: 'db' },
            entries: { one: { content: 'db' } },
        });
    });

    test('falls back to file-backed reads when world_info audit has not run', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        fs.writeFileSync(path.join(directories.worlds, 'Lorebook.json'), JSON.stringify({
            name: 'File Lore',
            extensions: { source: 'file' },
            entries: { one: { content: 'file' } },
        }));
        seedCanonicalWorldInfo(directories, { auditClean: false });
        setCanonicalEnv({ enabled: true, shadowImport: true, reads: true });

        const listResponse = await invokeRoute('/list', {}, directories);
        const getResponse = await invokeRoute('/get', { name: 'Lorebook' }, directories);

        expect(listResponse.body).toEqual([{
            file_id: 'Lorebook',
            name: 'File Lore',
            extensions: { source: 'file' },
        }]);
        expect(getResponse.body).toEqual({
            name: 'File Lore',
            extensions: { source: 'file' },
            entries: { one: { content: 'file' } },
        });
    });

    test('falls back to file-backed reads when canonical reads are disabled or audit drift blocks cutover', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        fs.writeFileSync(path.join(directories.worlds, 'Lorebook.json'), JSON.stringify({
            name: 'File Lore',
            extensions: { source: 'file' },
            entries: { one: { content: 'file' } },
        }));
        const db = seedCanonicalWorldInfo(directories);

        setCanonicalEnv({ enabled: true, shadowImport: true, reads: false });
        expect((await invokeRoute('/list', {}, directories)).body).toEqual([{
            file_id: 'Lorebook',
            name: 'File Lore',
            extensions: { source: 'file' },
        }]);

        persistCanonicalAuditStatus(db, {
            ok: false,
            handle: 'alice',
            hasDrift: true,
            blocking: true,
            reason: 'audit_drift_blocked',
            entries: [{ status: 'drift' }],
        }, {
            scope: 'world_info',
            auditedAtMs: 1735689602000,
        });

        setCanonicalEnv({ enabled: true, shadowImport: true, reads: true });
        expect((await invokeRoute('/get', { name: 'Lorebook' }, directories)).body).toEqual({
            name: 'File Lore',
            extensions: { source: 'file' },
            entries: { one: { content: 'file' } },
        });
    });

    test('strict canonical reads fail closed instead of silently falling back', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        fs.writeFileSync(path.join(directories.worlds, 'Lorebook.json'), JSON.stringify({
            entries: { one: { content: 'file' } },
        }));
        seedCanonicalWorldInfo(directories, { auditClean: false });
        setCanonicalEnv({ enabled: true, shadowImport: true, reads: true, strict: true });

        await expect(invokeRoute('/get', { name: 'Lorebook' }, directories))
            .rejects.toThrow('Canonical World Info reads blocked: audit_not_run');
    });

    test('writes edits to canonical sqlite first and projects the compatibility JSON file', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        fs.writeFileSync(path.join(directories.worlds, 'Lorebook.json'), JSON.stringify({ entries: {} }));
        const db = seedCanonicalWorldInfo(directories, {
            payload: { name: 'Old', entries: {} },
        });
        setCanonicalEnv({ enabled: true, shadowImport: true, reads: true, writes: true });

        const response = await invokeRoute('/edit', {
            name: 'Lorebook',
            data: {
                name: 'Edited Lore',
                extensions: { source: 'route' },
                entries: { one: { content: 'edited' } },
            },
        }, directories);

        expect(response.statusCode).toBe(200);
        expect(response.body).toEqual({ ok: true });
        expect(JSON.parse(fs.readFileSync(path.join(directories.worlds, 'Lorebook.json'), 'utf8'))).toEqual({
            name: 'Edited Lore',
            extensions: { source: 'route' },
            entries: { one: { content: 'edited' } },
        });
        expect(db.prepare('SELECT payload_json FROM world_books WHERE name = ?').get('Lorebook').payload_json)
            .toBe(JSON.stringify({
                name: 'Edited Lore',
                extensions: { source: 'route' },
                entries: { one: { content: 'edited' } },
            }));
    });

    test('file-backed writes invalidate the world_info audit when reads are enabled but writes are disabled', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        fs.writeFileSync(path.join(directories.worlds, 'Lorebook.json'), JSON.stringify({
            name: 'File Lore',
            entries: {},
        }));
        const db = seedCanonicalWorldInfo(directories, {
            payload: { name: 'Canonical Lore', entries: {} },
        });
        setCanonicalEnv({ enabled: true, shadowImport: true, reads: true, writes: false });

        const response = await invokeRoute('/edit', {
            name: 'Lorebook',
            data: {
                name: 'File Edited',
                entries: { one: { content: 'file-backed write' } },
            },
        }, directories);

        expect(response.statusCode).toBe(200);
        expect(JSON.parse(fs.readFileSync(path.join(directories.worlds, 'Lorebook.json'), 'utf8'))).toEqual({
            name: 'File Edited',
            entries: { one: { content: 'file-backed write' } },
        });
        expect(getPersistedCanonicalAuditStatus(db, { scope: 'world_info' })).toEqual(expect.objectContaining({
            ok: false,
            blocking: true,
            reason: 'audit_stale_after_world_info_file_write',
        }));
    });

    test('file-backed writes invalidate the world_info audit while a slice override is disabled', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        fs.writeFileSync(path.join(directories.worlds, 'Lorebook.json'), JSON.stringify({
            name: 'File Lore',
            entries: {},
        }));
        const db = seedCanonicalWorldInfo(directories, {
            payload: { name: 'Canonical Lore', entries: {} },
        });
        setCanonicalEnv({ enabled: true, shadowImport: true, reads: true, writes: true });
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SLICES_WORLDINFO_ENABLED = 'false';

        const response = await invokeRoute('/edit', {
            name: 'Lorebook',
            data: {
                name: 'File Edited',
                entries: { one: { content: 'file-backed write' } },
            },
        }, directories);

        expect(response.statusCode).toBe(200);
        expect(getPersistedCanonicalAuditStatus(db, { scope: 'world_info' })).toEqual(expect.objectContaining({
            ok: false,
            blocking: true,
            reason: 'audit_stale_after_world_info_file_write',
        }));
    });

    test('records a projection repair when canonical edit commits but JSON projection fails', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const brokenWorldsPath = path.join(root, 'worlds-as-file');
        fs.writeFileSync(brokenWorldsPath, 'not a directory');
        directories.worlds = brokenWorldsPath;
        const db = seedCanonicalWorldInfo(directories, {
            payload: { name: 'Old', entries: {} },
        });
        setCanonicalEnv({ enabled: true, shadowImport: true, reads: true, writes: true });

        const response = await invokeRoute('/edit', {
            name: 'Lorebook',
            data: {
                name: 'Edited Lore',
                entries: { one: { content: 'db survives' } },
            },
        }, directories);

        expect(response.statusCode).toBe(500);
        expect(response.body).toEqual(expect.objectContaining({
            error: 'Failed to project canonical World Info file.',
            repairKey: 'world_info:Lorebook:edit',
        }));
        expect(JSON.parse(db.prepare('SELECT payload_json FROM world_books WHERE name = ?').get('Lorebook').payload_json)).toEqual({
            name: 'Edited Lore',
            entries: { one: { content: 'db survives' } },
        });
        expect(db.prepare(`
            SELECT repair_key, world_name, reason, details_json, resolved_at_ms
            FROM world_info_projection_repairs
        `).all()).toEqual([{
            repair_key: 'world_info:Lorebook:edit',
            world_name: 'Lorebook',
            reason: 'projection_failed',
            details_json: JSON.stringify({ operation: 'edit' }),
            resolved_at_ms: null,
        }]);
    });

    test('imports and deletes world info through canonical writes while preserving route responses', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        seedCanonicalWorldInfo(directories, {
            name: 'Existing',
            payload: { name: 'Existing', entries: { old: { content: 'old' } } },
        });
        setCanonicalEnv({ enabled: true, shadowImport: true, reads: true, writes: true });
        const uploadDirectory = path.join(root, 'uploads');
        fs.mkdirSync(uploadDirectory, { recursive: true });
        fs.writeFileSync(path.join(uploadDirectory, 'upload.json'), JSON.stringify({
            name: 'Imported Lore',
            extensions: { source: 'upload' },
            entries: { one: { content: 'imported' } },
        }));

        const importResponse = await invokeRouteWithRequest('/import', {
            body: {},
            file: {
                originalname: 'Imported.json',
                destination: uploadDirectory,
                filename: 'upload.json',
            },
            user: {
                profile: { handle: 'alice' },
                directories,
            },
        });
        const deleteResponse = await invokeRoute('/delete', { name: 'Existing' }, directories);

        const db = canonicalSqliteManager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });

        expect(importResponse.statusCode).toBe(200);
        expect(importResponse.body).toEqual({ name: 'Imported' });
        expect(JSON.parse(fs.readFileSync(path.join(directories.worlds, 'Imported.json'), 'utf8'))).toEqual({
            name: 'Imported Lore',
            extensions: { source: 'upload' },
            entries: { one: { content: 'imported' } },
        });
        expect(JSON.parse(db.prepare('SELECT payload_json FROM world_books WHERE name = ?').get('Imported').payload_json)).toEqual({
            name: 'Imported Lore',
            extensions: { source: 'upload' },
            entries: { one: { content: 'imported' } },
        });
        expect(deleteResponse.statusCode).toBe(200);
        expect(db.prepare('SELECT deleted_at_ms FROM world_books WHERE name = ?').get('Existing').deleted_at_ms).not.toBeNull();
        expect(fs.existsSync(path.join(directories.worlds, 'Existing.json'))).toBe(false);
    });
});
