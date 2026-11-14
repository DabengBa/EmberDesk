import { afterAll, beforeAll, expect, jest, test } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { setConfigFilePath, keyToEnv } from '../src/util.js';
import { canonicalSqliteManager } from '../src/canonical-sqlite.js';
import { runCanonicalMigrations } from '../src/canonical-sqlite-migrations.js';
import { upsertCanonicalCharacter } from '../src/endpoints/character-store.js';
import { getPersistedCanonicalAuditStatus, persistCanonicalAuditStatus } from '../src/canonical-sqlite-shadow-import.js';
import { readCharacterFullPayload } from '../src/endpoints/character-read-service.ts';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'character-read-http-'));
fs.writeFileSync(path.join(root, 'config.yaml'), 'enableUserAccounts: true\n');
setConfigFilePath(path.join(root, 'config.yaml'));
globalThis.DATA_ROOT = root;
const { getUserDirectories } = await import('../src/users.js');
const { router } = await import('../src/endpoints/characters.js');
const flag = keyToEnv('features.storage.canonicalSqlite.enabled');
const previousFlag = process.env[flag];
let server; let base;
const databases = new Map();

beforeAll(async () => {
    for (const handle of ['empty', 'populated', 'newer', 'broken', 'auditblocked', 'auditspoof']) {
        const dirs = getUserDirectories(handle);
        for (const dir of Object.values(dirs)) fs.mkdirSync(dir, { recursive: true });
        const db = new DatabaseSync(path.join(dirs.storage, 'emberdesk.sqlite'));
        db.exec('PRAGMA journal_mode=WAL');
        runCanonicalMigrations(db);
        if (handle === 'newer') db.prepare('INSERT INTO schema_migrations VALUES (?, ?, ?)').run(999, 'private migration detail', 0);
        if (handle === 'auditblocked') persistCanonicalAuditStatus(db, { blocking: true, reason: '/private/audit-detail', entries: [] });
        if (handle === 'auditspoof') persistCanonicalAuditStatus(db, { blocking: true, reason: 'canonical_storage_disabled', entries: [] });
        if (handle === 'populated' || handle === 'broken') {
            const card = { name: 'Alpha', description: 'fixture' };
            upsertCanonicalCharacter(db, { id: 'fixture-id', avatarFilename: 'alpha.png', fullPayload: card, shallowPayload: card, createdAtMs: 1, updatedAtMs: 1 });
            if (handle === 'broken') db.prepare('UPDATE characters SET card_json = ?, shallow_json = ?').run('{broken', '{broken');
        }
        databases.set(handle, db);
    }
    const app = express();
    app.use(express.json());
    // Identity is injected only by this isolated fixture; production authentication is not changed.
    app.use((req, _res, next) => { const handle = req.headers['x-fixture-user']; req.user = { profile: { handle }, directories: getUserDirectories(handle) }; next(); });
    app.use('/api/characters', router);
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
    if (previousFlag === undefined) delete process.env[flag]; else process.env[flag] = previousFlag;
    canonicalSqliteManager.dispose();
    for (const db of databases.values()) db.close();
    server?.closeAllConnections();
    if (server) await new Promise(resolve => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
});

async function request(route, user = 'empty') {
    return fetch(`${base}/api/characters/${route}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-fixture-user': user }, body: JSON.stringify({ avatar_url: 'alpha.png' }) });
}

test.each(['all', 'list', 'get'])('disabled storage is unavailable at /%s', async route => {
    process.env[flag] = 'false';
    const response = await request(route);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'canonical_storage_unavailable', reason: 'canonical_storage_disabled' });
});

test.each(['all', 'list', 'get'])('strict migration blocker is safely classified at /%s', async route => {
    process.env[flag] = 'true';
    const response = await request(route, 'newer');
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'canonical_storage_unavailable', reason: 'canonical_migration_blocked' });
});

test.each(['all', 'list', 'get'])('strict audit blocker does not disclose its reason at /%s', async route => {
    process.env[flag] = 'true';
    const response = await request(route, 'auditblocked');
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'canonical_storage_unavailable', reason: 'canonical_storage_unavailable' });
});

test('an audit reason cannot impersonate a trusted storage classification', async () => {
    process.env[flag] = 'true';
    const response = await request('get', 'auditspoof');
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'canonical_storage_unavailable', reason: 'canonical_storage_unavailable' });
});

test('readable empty, missing and populated responses retain legacy shapes', async () => {
    process.env[flag] = 'true';
    for (const route of ['all', 'list']) {
        const empty = await request(route);
        expect(empty.status).toBe(200); expect(await empty.json()).toEqual([]);
        const populated = await request(route, 'populated');
        expect(populated.status).toBe(200); expect(await populated.json()).toEqual([expect.objectContaining({ name: 'Alpha', avatar: 'alpha.png', canonical_id: 'fixture-id' })]);
    }
    expect((await request('get')).status).toBe(404);
    const found = await request('get', 'populated');
    expect(found.status).toBe(200); expect(await found.json()).toEqual(expect.objectContaining({ name: 'Alpha', avatar: 'alpha.png', canonical_id: 'fixture-id' }));
});

test('unexpected malformed canonical payload stays a generic 500', async () => {
    process.env[flag] = 'true';
    for (const route of ['all', 'list', 'get']) {
        const response = await request(route, 'broken');
        expect(response.status).toBe(500);
        expect(await response.text()).not.toContain(root);
    }
});

test('range errors keep the list overflow response', async () => {
    process.env[flag] = 'true';
    // Exercise the actual route and store with a controlled clone failure.
    const original = globalThis.structuredClone;
    const spy = jest.spyOn(globalThis, 'structuredClone').mockImplementation((value, ...args) => {
        if (value?.name === 'Alpha') throw new RangeError('private detail');
        return original(value, ...args);
    });
    try {
        for (const route of ['all', 'list']) {
            const response = await request(route, 'populated');
            expect(response.status).toBe(500);
            expect(await response.json()).toEqual({ overflow: true, error: true });
        }
    } finally { spy.mockRestore(); }
});

test('non-strict blocking audit is distinguishable from an absent row with the same reason', async () => {
    // Injected flags establish the service-contract boundary, not production defaults.
    const db = databases.get('empty');
    const dependencies = {
        getCanonicalSqliteFeatureFlags: () => ({ enabled: true, reads: true, strict: false }),
        getCanonicalStorageStatus: () => ({ supported: true }),
        openCanonicalDatabase: () => db,
        runCanonicalMigrations: () => ({ ok: true }),
        getCanonicalAuditStatus: () => ({ blocking: false }),
        getCanonicalCharacter: () => null,
    };
    const options = { handle: 'empty', directories: getUserDirectories('empty'), avatarUrl: 'alpha.png', dependencies };
    const missing = await readCharacterFullPayload(options);
    persistCanonicalAuditStatus(db, { blocking: true, reason: 'canonical_db_row_missing', entries: [] });
    dependencies.getCanonicalAuditStatus = () => getPersistedCanonicalAuditStatus(db);
    const blocked = await readCharacterFullPayload(options);
    expect(missing).not.toHaveProperty('canonicalUnavailable');
    const { canonicalUnavailable, ...unchangedFields } = blocked;
    expect(canonicalUnavailable).toBe('canonical_storage_unavailable');
    expect(unchangedFields).toEqual(missing);
    expect(blocked).toMatchObject({ status: 'not_found', fallbackReason: 'canonical_db_row_missing' });
});
