import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeAll, describe, expect, test } from '@jest/globals';

import { canonicalSqliteManager } from '../src/canonical-sqlite.js';
import { runCanonicalMigrations } from '../src/canonical-sqlite-migrations.js';
import { getPersistedCanonicalAuditStatus, persistCanonicalAuditStatus } from '../src/canonical-sqlite-shadow-import.js';
import { runCanonicalWorldInfoAudit } from '../src/canonical-sqlite-operator.js';
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

    test('writes edits to canonical sqlite first and projects the compatibility JSON file', async () => {
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

    test('commits edits to canonical sqlite even when the retired writes flag is pinned off', async () => {
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
        // The retired flag is ignored: the write commits canonically, no file
        // projection is written under 'off', and the audit stays clean.
        expect(JSON.parse(fs.readFileSync(path.join(directories.worlds, 'Lorebook.json'), 'utf8'))).toEqual({
            name: 'File Lore',
            entries: {},
        });
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

    test('records a projection repair when canonical edit commits but JSON projection fails', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const brokenWorldsPath = path.join(root, 'worlds-as-file');
        fs.writeFileSync(brokenWorldsPath, 'not a directory');
        directories.worlds = brokenWorldsPath;
        const db = seedCanonicalWorldInfo(directories, {
            payload: { name: 'Old', entries: {} },
        });
        setCanonicalEnv({ enabled: true, shadowImport: true, reads: true, writes: true, projection: 'sync' });

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
        setCanonicalEnv({ enabled: true, shadowImport: true, reads: true, writes: true, projection: 'sync' });
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

    test('default projection mode off keeps canonical writes out of worlds/*.json', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const db = seedCanonicalWorldInfo(directories, {
            payload: { name: 'Old', entries: {} },
        });
        setCanonicalEnv({ enabled: true, shadowImport: true, reads: true, writes: true });

        const response = await invokeRoute('/edit', {
            name: 'Lorebook',
            data: { name: 'Edited Lore', entries: { one: { content: 'edited' } } },
        }, directories);

        expect(response.statusCode).toBe(200);
        expect(JSON.parse(db.prepare('SELECT payload_json FROM world_books WHERE name = ?').get('Lorebook').payload_json)).toEqual({
            name: 'Edited Lore',
            entries: { one: { content: 'edited' } },
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

    test('audit blocks on stale projection drift when projection is sync', async () => {
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

        expect(audit.blocking).toBe(true);
        expect(audit.entries).toEqual(expect.arrayContaining([
            expect.objectContaining({
                status: 'drift',
                drift_types: ['payload_mismatch'],
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
