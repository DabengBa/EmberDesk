import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

import { afterEach, beforeAll, describe, expect, test } from '@jest/globals';

import { canonicalSqliteManager } from '../src/canonical-sqlite.ts';
import { runCanonicalMigrations } from '../src/canonical-sqlite-migrations.ts';
import { runCanonicalWorldInfoShadowImport } from '../src/canonical-world-info-shadow-import.ts';
import { getPersistedCanonicalAuditStatus, persistCanonicalAuditStatus } from '../src/canonical-sqlite-shadow-import.ts';
import { runCanonicalWorldInfoAudit } from '../src/canonical-sqlite-operator.ts';
import { upsertCanonicalWorldInfoBook } from '../src/endpoints/world-info-store.ts';
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
        characters: path.join(root, 'characters'),
    };
    fs.mkdirSync(directories.storage, { recursive: true });
    fs.mkdirSync(directories.worlds, { recursive: true });
    fs.mkdirSync(directories.characters, { recursive: true });
    return directories;
}

function createResponse() {
    return {
        body: undefined,
        statusCode: 200,
        set() { return this; },
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
        get() { return undefined; },
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

function setCanonicalEnv({ enabled = true, shadowImport = true, reads = true, writes = false, strict = false, projection = null } = {}) {
    process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED = String(enabled);
    process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SHADOWIMPORT = String(shadowImport);
    process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_READS = String(reads);
    process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_WRITES = String(writes);
    process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_STRICT = String(strict);
    if (projection != null) {
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SLICES_WORLDINFO_PROJECTION = String(projection);
    }
}

function clearCanonicalEnv() {
    delete process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED;
    delete process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SHADOWIMPORT;
    delete process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_READS;
    delete process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_WRITES;
    delete process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_CHATSTATS;
    delete process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_STRICT;
    delete process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SLICES_WORLDINFO_ENABLED;
    delete process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SLICES_WORLDINFO_PROJECTION;
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

function seedCanonicalCharacter(directories, {
    avatarFilename = 'alpha.png',
    displayName = 'Alpha',
    worldName = '',
    cardPayload = null,
    shallowPayload = null,
} = {}) {
    const db = canonicalSqliteManager.open({
        handle: 'alice',
        directories,
        featureFlags: { enabled: true, strict: false },
    });
    runCanonicalMigrations(db, { nowMs: 1735689600000 });
    const nowMs = 1735689600000;
    db.prepare(`
        INSERT INTO characters (
            id, avatar_filename, internal_name, display_name, card_json, shallow_json,
            world_name, created_at_ms, updated_at_ms, deleted_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `).run(
        `char-${avatarFilename}`,
        avatarFilename,
        avatarFilename.replace(/\.png$/i, ''),
        displayName,
        JSON.stringify(cardPayload ?? { name: displayName, data: { name: displayName } }),
        JSON.stringify(shallowPayload ?? cardPayload ?? { name: displayName, data: { name: displayName } }),
        worldName,
        nowMs,
        nowMs,
    );
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
    test('HTTP reads carry revisions and reject a second stale editor', async () => {
        const directories = createDirectories(makeRoot());
        const db = seedCanonicalWorldInfo(directories, { payload: { entries: { original: {} } } });
        setCanonicalEnv({ enabled: true, shadowImport: true, reads: true, writes: true, projection: 'off' });
        const app = express();
        app.use(express.json(), (req, _res, next) => { req.user = { profile: { handle: 'alice' }, directories }; next(); }, router);
        const server = app.listen(0, '127.0.0.1');
        try {
            await new Promise(resolve => server.once('listening', resolve));
            const post = (route, body) => fetch(`http://127.0.0.1:${server.address().port}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const firstRead = await post('/get', { name: 'Lorebook' });
            const secondRead = await post('/get', { name: 'Lorebook' });
            expect(firstRead.status).toBe(200);
            expect(secondRead.status).toBe(200);
            expect(await firstRead.json()).toEqual(await secondRead.json());
            const revision = Number(firstRead.headers.get('X-World-Info-Revision'));
            const first = await post('/edit', { name: 'Lorebook', data: { entries: { first: {} } }, expectedRevision: revision });
            expect(first.status).toBe(200);
            const firstResult = await first.json();
            const stale = await post('/edit', { name: 'Lorebook', data: { entries: { stale: {} } }, expectedRevision: revision });
            expect(stale.status).toBe(409);
            expect(await stale.json()).toMatchObject({ error: 'world_info_conflict', revision: revision + 1 });
            expect(Number(firstRead.headers.get('X-World-Info-Revision'))).toBe(revision);
            expect(Number(secondRead.headers.get('X-World-Info-Revision'))).toBe(revision);
            expect(firstResult.revision).toBe(revision + 1);
            expect(JSON.parse(db.prepare('SELECT payload_json FROM world_books WHERE name = ?').get('Lorebook').payload_json)).toEqual({ entries: { first: {} } });
        } finally {
            await new Promise(resolve => server.close(resolve));
        }
    });
    test('rejects imported basenames that normalize to an existing world name', async () => {
        const directories = createDirectories(makeRoot());
        const db = seedCanonicalWorldInfo(directories, { payload: { name: 'Old', entries: {} } });
        setCanonicalEnv({ enabled: true, shadowImport: true, reads: true, writes: true, projection: 'off' });
        const response = await invokeRouteWithRequest('/import', {
            body: { convertedData: JSON.stringify({ name: 'New', entries: {} }) },
            file: { originalname: ' Lorebook .json' },
            user: { profile: { handle: 'alice' }, directories },
        });
        expect(response.statusCode).toBe(400);
        expect(JSON.parse(db.prepare('SELECT payload_json FROM world_books WHERE name = ?').get('Lorebook').payload_json).name).toBe('Old');
    });
    test('rolls back an edit if recording its projection intent fails', async () => {
        const directories = createDirectories(makeRoot());
        const previous = { name: 'Old', entries: {} };
        const db = seedCanonicalWorldInfo(directories, { payload: previous });
        fs.writeFileSync(path.join(directories.worlds, 'Lorebook.json'), JSON.stringify(previous));
        db.exec(`CREATE TRIGGER reject_world_intent BEFORE INSERT ON world_info_projection_repairs
            BEGIN SELECT RAISE(ABORT, 'injected intent failure'); END`);
        setCanonicalEnv({ enabled: true, shadowImport: true, reads: true, writes: true, projection: 'sync' });
        try {
            await invokeRoute('/edit', { name: 'Lorebook', data: { name: 'New', entries: {} } }, directories);
        } catch (error) {
            expect(error.message).toContain('injected intent failure');
        }
        expect(JSON.parse(db.prepare('SELECT payload_json FROM world_books WHERE name = ?').get('Lorebook').payload_json)).toEqual(previous);
        expect(JSON.parse(fs.readFileSync(path.join(directories.worlds, 'Lorebook.json'), 'utf8'))).toEqual(previous);
    });
    test('rolls back a delete if recording its projection intent fails', async () => {
        const directories = createDirectories(makeRoot());
        const previous = { entries: {} };
        const db = seedCanonicalWorldInfo(directories, { payload: previous });
        const file = path.join(directories.worlds, 'Lorebook.json');
        fs.writeFileSync(file, JSON.stringify(previous));
        db.exec(`CREATE TRIGGER reject_delete_intent BEFORE INSERT ON world_info_projection_repairs
            BEGIN SELECT RAISE(ABORT, 'injected delete intent failure'); END`);
        setCanonicalEnv({ enabled: true, shadowImport: true, reads: true, writes: true, projection: 'off' });
        try {
            await invokeRoute('/delete', { name: 'Lorebook' }, directories);
        } catch (error) {
            expect(error.message).toContain('injected delete intent failure');
        }
        expect(db.prepare('SELECT deleted_at_ms FROM world_books WHERE name = ?').get('Lorebook').deleted_at_ms).toBeNull();
        expect(fs.existsSync(file)).toBe(true);
    });
    test('rolls back a cascade book if recording its projection intent fails', async () => {
        const directories = createDirectories(makeRoot());
        const db = seedCanonicalWorldInfo(directories, { payload: { entries: {} } });
        const file = path.join(directories.worlds, 'Lorebook.json');
        fs.writeFileSync(file, '{}');
        db.exec(`CREATE TRIGGER reject_cascade_intent BEFORE INSERT ON world_info_projection_repairs
            BEGIN SELECT RAISE(ABORT, 'injected cascade intent failure'); END`);
        setCanonicalEnv({ enabled: true, shadowImport: true, reads: true, writes: true, projection: 'off' });
        const response = await invokeRoute('/delete-cascade', { worlds: ['Lorebook'] }, directories);
        expect(response.statusCode).toBe(500);
        expect(db.prepare('SELECT deleted_at_ms FROM world_books WHERE name = ?').get('Lorebook').deleted_at_ms).toBeNull();
        expect(fs.existsSync(file)).toBe(true);
    });
    test('rolls back an import if recording its projection intent fails', async () => {
        const directories = createDirectories(makeRoot());
        const db = seedCanonicalWorldInfo(directories, { payload: { name: 'Old', entries: {} } });
        db.exec(`CREATE TRIGGER reject_import_intent BEFORE INSERT ON world_info_projection_repairs
            BEGIN SELECT RAISE(ABORT, 'injected import intent failure'); END`);
        setCanonicalEnv({ enabled: true, shadowImport: true, reads: true, writes: true, projection: 'off' });
        try {
            await invokeRouteWithRequest('/import', {
                body: { convertedData: JSON.stringify({ name: 'New', entries: {} }) },
                file: { originalname: 'Lorebook.json' },
                user: { profile: { handle: 'alice' }, directories },
            });

        } catch (error) {
            expect(error.message).toContain('injected import intent failure');
        }
        expect(JSON.parse(db.prepare('SELECT payload_json FROM world_books WHERE name = ?').get('Lorebook').payload_json).name).toBe('Old');
    });
    test('rejects an edit whose input sanitizes to another world name', async () => {
        const directories = createDirectories(makeRoot());
        const db = seedCanonicalWorldInfo(directories, { payload: { name: 'Old', entries: {} } });
        setCanonicalEnv({ enabled: true, shadowImport: true, reads: true, writes: true, projection: 'off' });
        const response = await invokeRoute('/edit', { name: 'Lore/book', data: { name: 'New', entries: {} } }, directories);
        expect(response.statusCode).toBe(400);
        expect(JSON.parse(db.prepare('SELECT payload_json FROM world_books WHERE name = ?').get('Lorebook').payload_json).name).toBe('Old');
    });
    test('shadow import does not resurrect a deleted world from a stale projection', async () => {
        const directories = createDirectories(makeRoot());
        const db = seedCanonicalWorldInfo(directories, { payload: { name: 'Old', entries: {} } });
        setCanonicalEnv({ enabled: true, shadowImport: true, reads: true, writes: true, projection: 'off' });
        expect((await invokeRoute('/delete', { name: 'Lorebook' }, directories)).statusCode).toBe(200);
        fs.writeFileSync(path.join(directories.worlds, 'Lorebook.json'), JSON.stringify({ name: 'Stale', entries: {} }));
        const result = await runCanonicalWorldInfoShadowImport({ handle: 'alice', directories, manager: canonicalSqliteManager, featureFlags: { enabled: true, shadowImport: true } });
        expect(result.ok).toBe(false);
        expect(db.prepare('SELECT deleted_at_ms FROM world_books WHERE name = ?').get('Lorebook').deleted_at_ms).not.toBeNull();
    });
    test('shadow import blocks an unproven historical file over a different authority', async () => {
        const directories = createDirectories(makeRoot());
        const db = seedCanonicalWorldInfo(directories, { payload: { name: 'Authority', entries: {} } });
        fs.writeFileSync(path.join(directories.worlds, 'Lorebook.json'), JSON.stringify({ name: 'Unproven', entries: {} }));
        const result = await runCanonicalWorldInfoShadowImport({ handle: 'alice', directories, manager: canonicalSqliteManager, featureFlags: { enabled: true, shadowImport: true } });
        expect(result.ok).toBe(false);
        expect(JSON.parse(db.prepare('SELECT payload_json FROM world_books WHERE name = ?').get('Lorebook').payload_json).name).toBe('Authority');
    });
    test('bootstrap cannot overwrite an existing canonical book with an unproven file', async () => {
        const directories = createDirectories(makeRoot());
        const db = seedCanonicalWorldInfo(directories, { payload: { name: 'Authority', entries: {} }, auditClean: false });
        fs.writeFileSync(path.join(directories.worlds, 'Lorebook.json'), JSON.stringify({ name: 'Historical', entries: {} }));
        const result = await runCanonicalWorldInfoShadowImport({ handle: 'alice', directories, manager: canonicalSqliteManager, featureFlags: { enabled: true, shadowImport: true }, bootstrap: true });
        expect(result.ok).toBe(false);
        expect(JSON.parse(db.prepare('SELECT payload_json FROM world_books WHERE name = ?').get('Lorebook').payload_json).name).toBe('Authority');
    });
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

    test('does not replace existing canonical authority with an unproven file when audit has not run', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        fs.writeFileSync(path.join(directories.worlds, 'Lorebook.json'), JSON.stringify({
            name: 'File Lore',
            extensions: { source: 'file' },
            entries: { one: { content: 'file' } },
        }));
        const db = seedCanonicalWorldInfo(directories, { auditClean: false });
        setCanonicalEnv({ enabled: true, shadowImport: true, reads: true });

        const listResponse = await invokeRoute('/list', {}, directories);
        const getResponse = await invokeRoute('/get', { name: 'Lorebook' }, directories);

        expect(listResponse.body).toEqual(expect.objectContaining({ error: 'canonical_storage_unavailable' }));
        expect(getResponse.body).toEqual(expect.objectContaining({ error: 'canonical_storage_unavailable' }));
        expect(JSON.parse(db.prepare('SELECT payload_json FROM world_books WHERE name = ?').get('Lorebook').payload_json).name).toBe('Canonical Lore');
    });

    test('first import with no authority establishes the file in SQLite', async () => {
        const directories = createDirectories(makeRoot());
        fs.writeFileSync(path.join(directories.worlds, 'First.json'), JSON.stringify({ name: 'First file', entries: {} }));
        setCanonicalEnv({ enabled: true, shadowImport: true, reads: true, projection: 'sync' });
        const response = await invokeRoute('/get', { name: 'First' }, directories);
        expect(response.statusCode).toBe(200);
        expect(response.body.name).toBe('First file');
        const db = canonicalSqliteManager.open({ handle: 'alice', directories, featureFlags: { enabled: true } });
        expect(JSON.parse(db.prepare('SELECT payload_json FROM world_books WHERE name = ?').get('First').payload_json).name).toBe('First file');
    });

    test('ignores the retired reads flag and keeps serving canonical books', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        fs.writeFileSync(path.join(directories.worlds, 'Lorebook.json'), JSON.stringify({
            name: 'File Lore',
            extensions: { source: 'file' },
            entries: { one: { content: 'file' } },
        }));
        seedCanonicalWorldInfo(directories);

        // 'reads' is retired: pinning it to false warns and is ignored, so the
        // canonical book list stays authoritative.
        setCanonicalEnv({ enabled: true, shadowImport: true, reads: false });
        const response = await invokeRoute('/list', {}, directories);
        expect(response.statusCode).toBe(200);
        expect(response.body).toEqual(expect.arrayContaining([
            expect.objectContaining({ name: 'Canonical Lore' }),
        ]));
        expect(response.body).not.toEqual(expect.arrayContaining([
            expect.objectContaining({ name: 'File Lore' }),
        ]));
    });

    test('canonical reads fail closed with a structured 503 instead of silently falling back', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        fs.writeFileSync(path.join(directories.worlds, 'Lorebook.json'), JSON.stringify({
            entries: { one: { content: 'file' } },
        }));
        // audit_not_run now self-heals through lazy init, so fail-closed
        // coverage uses a real blocking drift verdict that init must preserve.
        const db = seedCanonicalWorldInfo(directories, { auditClean: true });
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
        setCanonicalEnv({ enabled: true, shadowImport: true, reads: true, strict: true });

        const response = await invokeRoute('/get', { name: 'Lorebook' }, directories);
        expect(response.statusCode).toBe(503);
        expect(response.body).toEqual({
            error: 'canonical_storage_unavailable',
            reason: 'audit_drift_blocked',
        });
    });

    test('writes edits to canonical SQLite and quarantines the old file despite legacy sync config', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        fs.writeFileSync(path.join(directories.worlds, 'Lorebook.json'), JSON.stringify({ entries: {} }));
        const db = seedCanonicalWorldInfo(directories, {
            payload: { name: 'Old', entries: {} },
        });
        setCanonicalEnv({ enabled: true, shadowImport: true, reads: true, writes: true, projection: 'sync' });

        const response = await invokeRoute('/edit', {
            name: 'Lorebook',
            data: {
                name: 'Edited Lore',
                extensions: { source: 'route' },
                entries: { one: { content: 'edited' } },
            },
        }, directories);

        expect(response.statusCode).toBe(200);
        expect(response.body).toEqual({ ok: true, revision: 2 });
        expect(fs.existsSync(path.join(directories.worlds, 'Lorebook.json'))).toBe(false);
        expect(db.prepare('SELECT payload_json FROM world_books WHERE name = ?').get('Lorebook').payload_json)
            .toBe(JSON.stringify({
                name: 'Edited Lore',
                extensions: { source: 'route' },
                entries: { one: { content: 'edited' } },
            }));
    });

    test('commits canonical edits and removes the file projection in off mode', async () => {
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
                name: 'Canonical Edited',
                entries: { one: { content: 'canonical write' } },
            },
        }, directories);

        expect(response.statusCode).toBe(200);
        expect(db.prepare('SELECT payload_json FROM world_books WHERE name = ?').get('Lorebook').payload_json)
            .toBe(JSON.stringify({
                name: 'Canonical Edited',
                entries: { one: { content: 'canonical write' } },
            }));
        expect(fs.existsSync(path.join(directories.worlds, 'Lorebook.json'))).toBe(false);
        expect(getPersistedCanonicalAuditStatus(db, { scope: 'world_info' })).toEqual(expect.objectContaining({
            ok: true,
            blocking: false,
        }));
    });

    test('rejects edits with canonical unavailable while a slice override is frozen', async () => {
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
                entries: { one: { content: 'must not write' } },
            },
        }, directories);

        expect(response.statusCode).toBe(503);
        expect(response.body).toEqual(expect.objectContaining({
            error: 'canonical_storage_unavailable',
        }));
        // The frozen slice neither writes the file nor dirties the audit.
        expect(JSON.parse(fs.readFileSync(path.join(directories.worlds, 'Lorebook.json'), 'utf8'))).toEqual({
            name: 'File Lore',
            entries: {},
        });
        expect(getPersistedCanonicalAuditStatus(db, { scope: 'world_info' })).toEqual(expect.objectContaining({
            ok: true,
            blocking: false,
        }));
    });


    test.each(['native upload', 'converted data'])('imports %s with World Info positions through canonical writes and preserves delete responses', async (source) => {
        const root = makeRoot();
        const directories = createDirectories(root);
        seedCanonicalWorldInfo(directories, {
            name: 'Existing',
            payload: { name: 'Existing', entries: { old: { content: 'old' } } },
        });
        setCanonicalEnv({ enabled: true, shadowImport: true, reads: true, writes: true, projection: 'sync' });
        const uploadDirectory = path.join(root, 'uploads');
        fs.mkdirSync(uploadDirectory, { recursive: true });
        const importedBook = {
            name: 'Imported Lore',
            extensions: { source: 'upload' },
            entries: {
                one: { content: 'imported', position: 4, depth: 2, role: 1 },
                two: { content: 'outlet lore', position: 7, outletName: 'example' },
                three: { content: 'no position' },
            },
        };
        const upload = JSON.stringify(importedBook);
        fs.writeFileSync(path.join(uploadDirectory, 'upload.json'), upload);

        const importResponse = await invokeRouteWithRequest('/import', {
            body: source === 'converted data' ? { convertedData: upload } : {},
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
        expect(fs.existsSync(path.join(directories.worlds, 'Imported.json'))).toBe(false);
        expect(JSON.parse(db.prepare('SELECT payload_json FROM world_books WHERE name = ?').get('Imported').payload_json)).toEqual({
            ...importedBook,
            entries: {
                one: { ...importedBook.entries.one, position: 0 },
                two: { ...importedBook.entries.two, position: 0 },
                three: { ...importedBook.entries.three, position: 0 },
            },
        });
        expect(deleteResponse.statusCode).toBe(200);
        expect(db.prepare('SELECT deleted_at_ms FROM world_books WHERE name = ?').get('Existing').deleted_at_ms).not.toBeNull();
        expect(fs.existsSync(path.join(directories.worlds, 'Existing.json'))).toBe(false);
    });

    test('default projection mode off keeps canonical writes out of worlds/*.json', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const db = seedCanonicalWorldInfo(directories, {
            payload: { name: 'Old', entries: {} },
        });
        setCanonicalEnv({ enabled: true, shadowImport: true, reads: true, writes: true });

        const response = await invokeRoute('/edit', {
            name: 'Lorebook',
            data: { name: 'Edited Lore', entries: { one: { content: 'edited', position: 4, depth: 2 } } },
        }, directories);

        expect(response.statusCode).toBe(200);
        expect(JSON.parse(db.prepare('SELECT payload_json FROM world_books WHERE name = ?').get('Lorebook').payload_json)).toEqual({
            name: 'Edited Lore',
            entries: { one: { content: 'edited', position: 4, depth: 2 } },
        });
        expect(fs.existsSync(path.join(directories.worlds, 'Lorebook.json'))).toBe(false);
    });

    test('serves canonical reads over a stale projection file when projection is off', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        fs.writeFileSync(path.join(directories.worlds, 'Lorebook.json'), JSON.stringify({
            name: 'Stale File Lore',
            entries: { old: { content: 'stale' } },
        }));
        seedCanonicalWorldInfo(directories);
        setCanonicalEnv({ enabled: true, shadowImport: true, reads: true });

        const response = await invokeRoute('/get', { name: 'Lorebook' }, directories);

        expect(response.statusCode).toBe(200);
        expect(response.body).toEqual({
            name: 'Canonical Lore',
            extensions: { source: 'db' },
            entries: { one: { content: 'db' } },
        });
    });

    test('audit suppresses stale projection drift when projection is off', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        fs.writeFileSync(path.join(directories.worlds, 'Lorebook.json'), JSON.stringify({
            name: 'Stale File Lore',
            entries: { old: { content: 'stale' } },
        }));
        fs.writeFileSync(path.join(directories.worlds, 'ExtraFile.json'), JSON.stringify({
            name: 'File Only',
            entries: {},
        }));
        seedCanonicalWorldInfo(directories);
        setCanonicalEnv({ enabled: true, shadowImport: true, reads: true });

        const db = canonicalSqliteManager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        const audit = await runCanonicalWorldInfoAudit({ handle: 'alice', directories, db });

        expect(audit.blocking).toBe(false);
        expect(audit.ok).toBe(true);
        expect(audit.hasDrift).toBe(false);
        const suppressed = audit.entries.filter(entry => entry.details?.suppressed);
        expect(suppressed.map(entry => entry.drift_types)).toEqual(expect.arrayContaining([
            ['payload_mismatch'],
            ['missing_db_world_info'],
        ]));
        expect(suppressed.every(entry => entry.details?.import_classification != null)).toBe(true);
    });

    test('audit suppresses stale projection drift despite legacy sync config', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        fs.writeFileSync(path.join(directories.worlds, 'Lorebook.json'), JSON.stringify({
            name: 'Stale File Lore',
            entries: { old: { content: 'stale' } },
        }));
        seedCanonicalWorldInfo(directories);
        setCanonicalEnv({ enabled: true, shadowImport: true, reads: true, projection: 'sync' });

        const db = canonicalSqliteManager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        const audit = await runCanonicalWorldInfoAudit({ handle: 'alice', directories, db });

        expect(audit.blocking).toBe(false);
        expect(audit.entries).toEqual(expect.arrayContaining([
            expect.objectContaining({
                status: 'drift',
                drift_types: ['payload_mismatch'],
                details: expect.objectContaining({ suppressed: true }),
            }),
        ]));
    });

    test('canonical delete removes the row without requiring a projection file', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        seedCanonicalWorldInfo(directories);
        setCanonicalEnv({ enabled: true, shadowImport: true, reads: true, writes: true });

        const response = await invokeRoute('/delete', { name: 'Lorebook' }, directories);

        const db = canonicalSqliteManager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        expect(response.statusCode).toBe(200);
        expect(db.prepare('SELECT deleted_at_ms FROM world_books WHERE name = ?').get('Lorebook').deleted_at_ms).not.toBeNull();
    });

    test('delete-preflight reads bound characters from canonical sqlite', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        seedCanonicalWorldInfo(directories);
        seedCanonicalCharacter(directories, {
            avatarFilename: 'alpha.png',
            worldName: 'Lorebook',
            displayName: 'Alpha',
        });
        seedCanonicalCharacter(directories, {
            avatarFilename: 'beta.png',
            worldName: '',
            displayName: 'Beta',
        });
        setCanonicalEnv({ enabled: true, shadowImport: true, reads: true, writes: true });

        const response = await invokeRoute('/delete-preflight', { name: 'Lorebook' }, directories);

        expect(response.statusCode).toBe(200);
        expect(response.body.worldInfos).toEqual([expect.objectContaining({
            name: 'Lorebook',
            entryCount: 1,
            boundCharacters: [{ avatar: 'alpha.png', name: 'Alpha' }],
            deleteCandidateAvatars: [],
        })]);
    });

    test('delete-cascade clears canonical character bindings and tombstones the book', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        seedCanonicalWorldInfo(directories);
        seedCanonicalCharacter(directories, {
            avatarFilename: 'alpha.png',
            worldName: 'Lorebook',
            displayName: 'Alpha',
            cardPayload: {
                name: 'Alpha',
                world: 'Lorebook',
                data: { name: 'Alpha', extensions: { world: 'Lorebook' } },
            },
            shallowPayload: {
                name: 'Alpha',
                world: 'Lorebook',
                data: { name: 'Alpha', extensions: { world: 'Lorebook' } },
            },
        });
        seedCanonicalCharacter(directories, {
            avatarFilename: 'beta.png',
            worldName: 'Other',
            displayName: 'Beta',
            cardPayload: { name: 'Beta', data: { name: 'Beta', extensions: { world: 'Other' } } },
        });
        fs.writeFileSync(path.join(directories.worlds, 'Lorebook.json'), JSON.stringify({ entries: {} }));
        setCanonicalEnv({ enabled: true, shadowImport: true, reads: true, writes: true });

        const response = await invokeRoute('/delete-cascade', {
            worlds: ['Lorebook'],
            clear_references: true,
        }, directories);

        const db = canonicalSqliteManager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        const alpha = db.prepare('SELECT card_json, shallow_json, world_name FROM characters WHERE avatar_filename = ?').get('alpha.png');
        const alphaCard = JSON.parse(alpha.card_json);
        const alphaShallow = JSON.parse(alpha.shallow_json);
        const beta = db.prepare('SELECT world_name FROM characters WHERE avatar_filename = ?').get('beta.png');

        expect(response.statusCode).toBe(200);
        expect(alpha.world_name).toBe('');
        expect(alphaCard.data.extensions.world).toBe('');
        expect(alphaCard.world).toBe('');
        expect(alphaShallow.data.extensions.world).toBe('');
        expect(alphaShallow.world).toBe('');
        expect(beta.world_name).toBe('Other');
        expect(db.prepare('SELECT deleted_at_ms FROM world_books WHERE name = ?').get('Lorebook').deleted_at_ms).not.toBeNull();
        expect(fs.existsSync(path.join(directories.worlds, 'Lorebook.json'))).toBe(false);
    });
});
