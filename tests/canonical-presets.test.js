import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

import { afterAll, afterEach, beforeAll, describe, expect, test } from '@jest/globals';

import { createCanonicalSqliteManager, canonicalSqliteManager } from '../src/canonical-sqlite.ts';
import { CANONICAL_SQLITE_MIGRATIONS, runCanonicalMigrations } from '../src/canonical-sqlite-migrations.ts';
import { getPersistedCanonicalAuditStatus } from '../src/canonical-sqlite-shadow-import.ts';
import { setConfigFilePath } from '../src/util.js';

// canReadCanonicalFeatureFlags() requires runtime args; without them the
// routers would return 503 instead of serving canonical data.
const hadCommandLineArgs = Object.prototype.hasOwnProperty.call(globalThis, 'COMMAND_LINE_ARGS');
const previousCommandLineArgs = globalThis.COMMAND_LINE_ARGS;
globalThis.COMMAND_LINE_ARGS = {};

const tmpConfigRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-presets-config-'));
const tmpConfigPath = path.join(tmpConfigRoot, 'config.yaml');
fs.writeFileSync(tmpConfigPath, 'port: 8000\n', 'utf8');
setConfigFilePath(tmpConfigPath);

const {
    deleteCanonicalPreset,
    ensureCanonicalPreset,
    getCanonicalPreset,
    getPresetMigrationMarker,
    importPresetFile,
    listCanonicalPresets,
    upsertCanonicalPreset,
} = await import('../src/endpoints/presets-store.ts');
const {
    PRESETS_AUDIT_SCOPE,
    auditCanonicalPresetsShadowImport,
    runCanonicalPresetsShadowImport,
} = await import('../src/canonical-presets-shadow-import.ts');
const { router: presetsRouter } = await import('../src/endpoints/presets.js');
const { router: settingsRouter } = await import('../src/endpoints/settings.js');
const { exportCanonicalStorageToFiles } = await import('../src/canonical-sqlite-export.ts');

const roots = [];
const managers = [];

function makeDirectories() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-presets-'));
    roots.push(root);
    const directories = {
        root,
        storage: path.join(root, 'storage'),
        backups: path.join(root, 'backups'),
        openAI_Settings: path.join(root, 'OpenAI Settings'),
        worlds: path.join(root, 'worlds'),
    };
    for (const dir of Object.values(directories)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return directories;
}

function openDb(directories, { handle = 'tester' } = {}) {
    const db = canonicalSqliteManager.open({
        handle,
        directories,
        featureFlags: { enabled: true, strict: false },
    });
    runCanonicalMigrations(db);
    return db;
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

async function invokeRoute(router, pathName, { body = {}, directories, handle = 'tester' } = {}) {
    const layer = router.stack.find(entry => entry.route?.path === pathName && entry.route.methods?.post);
    if (!layer) {
        throw new Error(`Route not found: POST ${pathName}`);
    }
    const response = createResponse();
    await layer.route.stack[0].handle({ body, user: { profile: { handle }, directories } }, response);
    return response;
}

beforeAll(() => {
    process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED = 'true';
});

afterAll(() => {
    delete process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED;
    if (hadCommandLineArgs) {
        globalThis.COMMAND_LINE_ARGS = previousCommandLineArgs;
    } else {
        delete globalThis.COMMAND_LINE_ARGS;
    }
    fs.rmSync(tmpConfigRoot, { recursive: true, force: true });
});

afterEach(() => {
    canonicalSqliteManager.dispose();
    for (const manager of managers.splice(0, managers.length)) {
        manager.dispose();
    }
    while (roots.length) {
        fs.rmSync(roots.pop(), { recursive: true, force: true });
    }
});

describe('presets canonical store', () => {
    test('upsert bumps revisions monotonically with last-write-wins semantics', () => {
        const directories = makeDirectories();
        const db = openDb(directories);

        const first = upsertCanonicalPreset(db, { name: 'Alpha', payload: { temperature: 1 } });
        expect(first.revision).toBe(1);
        const second = upsertCanonicalPreset(db, { name: 'Alpha', payload: { temperature: 2 } });
        expect(second.revision).toBe(2);
        expect(JSON.parse(getCanonicalPreset(db, { name: 'Alpha' }).payloadJson)).toEqual({ temperature: 2 });
    });

    test('expectedRevision conflicts report the current revision', () => {
        const directories = makeDirectories();
        const db = openDb(directories);

        upsertCanonicalPreset(db, { name: 'Alpha', payload: { a: 1 } });
        const conflict = upsertCanonicalPreset(db, { name: 'Alpha', payload: { a: 2 }, expectedRevision: 5 });
        expect(conflict).toEqual({ ok: false, conflicted: true, revision: 1 });
        expect(JSON.parse(getCanonicalPreset(db, { name: 'Alpha' }).payloadJson)).toEqual({ a: 1 });
    });

    test('ensureCanonicalPreset inserts only when the name is absent', () => {
        const directories = makeDirectories();
        const db = openDb(directories);

        const seed = ensureCanonicalPreset(db, { name: 'Default', payload: { v: 1 }, source: 'seed' });
        expect(seed.inserted).toBe(true);
        expect(getCanonicalPreset(db, { name: 'Default' }).source).toBe('seed');

        const again = ensureCanonicalPreset(db, { name: 'Default', payload: { v: 2 }, source: 'seed' });
        expect(again.inserted).toBe(false);
        expect(JSON.parse(getCanonicalPreset(db, { name: 'Default' }).payloadJson)).toEqual({ v: 1 });
    });

    test('delete hides the preset and reports whether anything was deleted', () => {
        const directories = makeDirectories();
        const db = openDb(directories);

        upsertCanonicalPreset(db, { name: 'Alpha', payload: {} });
        expect(deleteCanonicalPreset(db, { name: 'Alpha', expectedRevision: 1 }).deleted).toBe(true);
        expect(getCanonicalPreset(db, { name: 'Alpha' })).toBeNull();
        expect(deleteCanonicalPreset(db, { name: 'Alpha', expectedRevision: 1 }).deleted).toBe(false);
    });

    test('v18 preset survives upgrade and revisions advance across repeated deletes and recreations', () => {
        const directories = makeDirectories();
        const db = canonicalSqliteManager.open({ handle: 'tester', directories, featureFlags: { enabled: true, strict: false } });
        runCanonicalMigrations(db, { migrations: CANONICAL_SQLITE_MIGRATIONS.slice(0, 18) });
        db.prepare("INSERT INTO preset_documents (api_id, name, payload_json, revision, content_hash, source, created_at_ms, updated_at_ms) VALUES ('openai', 'Alpha', '{\"v\":1}', 7, 'hash', 'user', 1, 1)").run();
        expect(runCanonicalMigrations(db).ok).toBe(true);
        expect(getCanonicalPreset(db, { name: 'Alpha' }).revision).toBe(7);
        for (let oldRevision = 7; oldRevision < 10; oldRevision++) {
            expect(deleteCanonicalPreset(db, { name: 'Alpha', expectedRevision: oldRevision }).deleted).toBe(true);
            expect(listCanonicalPresets(db)).toEqual([]);
            expect(upsertCanonicalPreset(db, { name: 'Alpha', payload: { v: 'stale' }, expectedRevision: oldRevision }).ok).toBe(false);
            const recreated = upsertCanonicalPreset(db, { name: 'Alpha', payload: { v: oldRevision }, expectedRevision: 0 });
            expect(recreated.created).toBe(true);
            expect(recreated.revision).toBe(oldRevision + 1);
        }
        expect(deleteCanonicalPreset(db, { name: 'Alpha', expectedRevision: 10 }).deleted).toBe(true);
        const reseeded = ensureCanonicalPreset(db, { name: 'Alpha', payload: { seeded: true } });
        expect(reseeded.inserted).toBe(true);
        expect(reseeded.preset.revision).toBe(11);
    });

    test('list sorts names like the retired directory read', () => {
        const directories = makeDirectories();
        const db = openDb(directories);

        for (const name of ['beta', 'Alpha', 'ceta']) {
            upsertCanonicalPreset(db, { name, payload: {} });
        }
        expect(listCanonicalPresets(db).map(p => p.name)).toEqual(['Alpha', 'beta', 'ceta']);
    });
});

describe('preset file one-shot import', () => {
    test('imports each file exactly once and marks it consumed', () => {
        const directories = makeDirectories();
        const db = openDb(directories);

        fs.writeFileSync(path.join(directories.openAI_Settings, 'Alpha.json'), JSON.stringify({ a: 1 }), 'utf8');

        const markerKey = 'OpenAI Settings/Alpha.json';
        const first = importPresetFile(db, {
            name: 'Alpha',
            payloadJson: JSON.stringify({ a: 1 }),
            markerKey,
            sourceHash: 'h1',
        });
        expect(first.status).toBe('imported');
        expect(getPresetMigrationMarker(db, markerKey)).toBeTruthy();

        // Marker present → file is inert even if it changes on disk.
        const second = importPresetFile(db, {
            name: 'Alpha',
            payloadJson: JSON.stringify({ a: 999 }),
            markerKey,
            sourceHash: 'h2',
        });
        expect(second.status).toBe('skipped_marker');
        expect(JSON.parse(getCanonicalPreset(db, { name: 'Alpha' }).payloadJson)).toEqual({ a: 1 });
    });

    test('file never wins over a diverging canonical row (marker lost / rebuilt DB)', () => {
        const directories = makeDirectories();
        const db = openDb(directories);

        // User edited the preset via the API after import.
        upsertCanonicalPreset(db, { name: 'Alpha', payload: { edited: true }, source: 'user' });

        const result = importPresetFile(db, {
            name: 'Alpha',
            payloadJson: JSON.stringify({ a: 1 }),
            markerKey: 'OpenAI Settings/Alpha.json',
            sourceHash: 'h1',
        });
        expect(result.status).toBe('skipped_conflict');
        expect(JSON.parse(getCanonicalPreset(db, { name: 'Alpha' }).payloadJson)).toEqual({ edited: true });
    });

    test('shadow import scans the directory once and re-runs are no-ops', async () => {
        const directories = makeDirectories();
        fs.writeFileSync(path.join(directories.openAI_Settings, 'Beta.json'), JSON.stringify({ b: 2 }), 'utf8');
        fs.writeFileSync(path.join(directories.openAI_Settings, 'broken.json'), '{nope', 'utf8');

        const manager = createCanonicalSqliteManager({ logger: { info() {}, warn() {} } });
        managers.push(manager);
        const featureFlags = { enabled: true, shadowImport: true, strict: false };

        const first = await runCanonicalPresetsShadowImport({
            handle: 'tester', directories, featureFlags, manager,
        });
        expect(first.importedCount).toBe(1);
        expect(first.failedCount).toBe(1); // broken.json errors without a marker
        expect(getCanonicalPreset(manager.open({
            handle: 'tester', directories, featureFlags: { enabled: true, strict: false },
        }), { name: 'Beta' })).toBeTruthy();

        const second = await runCanonicalPresetsShadowImport({
            handle: 'tester', directories, featureFlags, manager,
        });
        expect(second.importedCount).toBe(0);
        expect(second.entries.some(e => e.status === 'skipped_marker')).toBe(true);
    });
});

describe('presets routes', () => {
    test('/save upserts a canonical row and /delete removes it', async () => {
        const directories = makeDirectories();

        const save = await invokeRoute(presetsRouter, '/save', {
            directories,
            body: { apiId: 'openai', name: 'Route Preset', preset: { temperature: 0.5 } },
        });
        expect(save.statusCode).toBe(200);

        const db = openDb(directories);
        expect(getCanonicalPreset(db, { name: 'Route Preset' })).toBeTruthy();

        const del = await invokeRoute(presetsRouter, '/delete', {
            directories,
            body: { apiId: 'openai', name: 'Route Preset', expectedRevision: save.body.revision },
        });
        expect(del.statusCode).toBe(200);
        expect(getCanonicalPreset(db, { name: 'Route Preset' })).toBeNull();

        const missing = await invokeRoute(presetsRouter, '/delete', {
            directories,
            body: { apiId: 'openai', name: 'Route Preset', expectedRevision: save.body.revision },
        });
        expect(missing.statusCode).toBe(404);
    });

    test('/delete rejects a missing revision without deleting the preset', async () => {
        const directories = makeDirectories();
        const db = openDb(directories);
        upsertCanonicalPreset(db, { name: 'Alpha', payload: { value: 'current' } });

        const response = await invokeRoute(presetsRouter, '/delete', {
            directories,
            body: { apiId: 'openai', name: 'Alpha' },
        });
        expect(response.statusCode).toBe(400);
        expect(JSON.parse(getCanonicalPreset(db, { name: 'Alpha' }).payloadJson)).toEqual({ value: 'current' });
    });


    test('/save never writes a preset file', async () => {
        const directories = makeDirectories();
        await invokeRoute(presetsRouter, '/save', {
            directories,
            body: { apiId: 'openai', name: 'Fileless', preset: { x: 1 } },
        });
        expect(fs.existsSync(path.join(directories.openAI_Settings, 'Fileless.json'))).toBe(false);
    });

    test('/restore still answers from bundled defaults', async () => {
        const directories = makeDirectories();
        const response = await invokeRoute(presetsRouter, '/restore', {
            directories,
            body: { apiId: 'openai', name: 'Default' },
        });
        expect(response.statusCode).toBe(200);
        expect(response.body.isDefault).toBe(true);
        expect(response.body.preset).toEqual(expect.objectContaining({}));
    });
});

describe('settings /get preset integration', () => {
    test('HTTP stale editor cannot overwrite a preset deleted and recreated under the same name', async () => {
        const directories = makeDirectories();
        const db = openDb(directories);
        upsertCanonicalPreset(db, { name: 'Alpha', payload: { value: 'original' } });
        const app = express();
        app.use(express.json(), (req, _res, next) => { req.user = { profile: { handle: 'tester' }, directories }; next(); });
        app.use('/settings', settingsRouter);
        app.use('/presets', presetsRouter);
        const server = app.listen(0, '127.0.0.1');
        try {
            await new Promise(resolve => server.once('listening', resolve));
            const post = (route, body = {}) => fetch(`http://127.0.0.1:${server.address().port}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const before = await (await post('/settings/get')).json();
            const staleRevision = before.openai_setting_revisions.Alpha;
            expect(staleRevision).toBe(1);
            expect((await post('/presets/delete', { apiId: 'openai', name: 'Alpha', expectedRevision: staleRevision })).status).toBe(200);
            const deleted = await (await post('/settings/get')).json();
            expect(deleted.openai_setting_names).not.toContain('Alpha');
            const recreated = await post('/presets/save', { apiId: 'openai', name: 'Alpha', preset: { value: 'recreated' }, expectedRevision: 0 });
            expect(recreated.status).toBe(200);
            const recreatedRevision = (await recreated.json()).revision;
            const stale = await post('/presets/save', { apiId: 'openai', name: 'Alpha', preset: { value: 'stale' }, expectedRevision: staleRevision });
            expect(stale.status).toBe(409);
            expect(recreatedRevision).toBeGreaterThan(staleRevision);
            const staleDelete = await post('/presets/delete', { apiId: 'openai', name: 'Alpha', expectedRevision: staleRevision });
            expect(staleDelete.status).toBe(409);
            expect(await staleDelete.json()).toEqual({ error: 'preset_conflict', revision: recreatedRevision });
            expect(JSON.parse(getCanonicalPreset(db, { name: 'Alpha' }).payloadJson)).toEqual({ value: 'recreated' });
            const current = await (await post('/settings/get')).json();
            expect(current.openai_setting_revisions.Alpha).toBe(recreatedRevision);
            expect((await post('/presets/delete', { apiId: 'openai', name: 'Alpha', expectedRevision: current.openai_setting_revisions.Alpha })).status).toBe(200);
            expect(getCanonicalPreset(db, { name: 'Alpha' })).toBeNull();
        } finally {
            await new Promise(resolve => server.close(resolve));
        }
    });

    test('HTTP preset revisions match the loaded values and reject a stale editor', async () => {
        const directories = makeDirectories();
        const db = openDb(directories);
        upsertCanonicalPreset(db, { name: 'Alpha', payload: { value: 'original' } });
        const app = express();
        app.use(express.json(), (req, _res, next) => { req.user = { profile: { handle: 'tester' }, directories }; next(); });
        app.use('/settings', settingsRouter);
        app.use('/presets', presetsRouter);
        const server = app.listen(0, '127.0.0.1');
        try {
            await new Promise(resolve => server.once('listening', resolve));
            const post = (route, body = {}) => fetch(`http://127.0.0.1:${server.address().port}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const a = await (await post('/settings/get')).json();
            const b = await (await post('/settings/get')).json();
            expect(a.openai_settings).toEqual(b.openai_settings);
            const revision = a.openai_setting_revisions.Alpha;
            const first = await post('/presets/save', { apiId: 'openai', name: 'Alpha', preset: { value: 'first' }, expectedRevision: revision });
            expect(first.status).toBe(200);
            const firstResult = await first.json();
            const stale = await post('/presets/save', { apiId: 'openai', name: 'Alpha', preset: { value: 'stale' }, expectedRevision: revision });
            expect(stale.status).toBe(409);
            expect(await stale.json()).toMatchObject({ error: 'preset_conflict', revision: revision + 1 });
            expect(a.openai_setting_revisions.Alpha).toBe(revision);
            expect(b.openai_setting_revisions.Alpha).toBe(revision);
            expect(firstResult.revision).toBe(revision + 1);
            expect(JSON.parse(getCanonicalPreset(db, { name: 'Alpha' }).payloadJson)).toEqual({ value: 'first' });
        } finally {
            await new Promise(resolve => server.close(resolve));
        }
    });
    test('first /get migrates files into canonical rows and serves them', async () => {
        const directories = makeDirectories();
        fs.writeFileSync(path.join(directories.openAI_Settings, 'openai.json'), JSON.stringify({ name: 'OpenAI' }), 'utf8');

        const response = await invokeRoute(settingsRouter, '/get', { directories });
        expect(response.statusCode).toBe(200);
        expect(response.body.openai_settings).toEqual([JSON.stringify({ name: 'OpenAI' })]);
        expect(response.body.openai_setting_names).toEqual(['openai']);

        // The file was consumed once; edits afterwards stay inert.
        fs.writeFileSync(path.join(directories.openAI_Settings, 'openai.json'), JSON.stringify({ name: 'HACKED' }), 'utf8');
        const second = await invokeRoute(settingsRouter, '/get', { directories });
        expect(second.body.openai_settings).toEqual([JSON.stringify({ name: 'OpenAI' })]);
    });
});

describe('presets export', () => {
    test('export-all materializes preset documents under OpenAI Settings/', () => {
        const directories = makeDirectories();
        const db = openDb(directories);
        upsertCanonicalPreset(db, { name: 'My Preset', payload: { temperature: 0.7 } });

        const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-presets-export-'));
        roots.push(outDir);
        const result = exportCanonicalStorageToFiles({
            db, directories, handle: 'tester', sliceKeys: ['presets'], outDir,
        });
        expect(result.ok).toBe(true);
        const exported = path.join(outDir, 'OpenAI Settings', 'My Preset.json');
        expect(fs.existsSync(exported)).toBe(true);
        expect(JSON.parse(fs.readFileSync(exported, 'utf8'))).toEqual({ temperature: 0.7 });
    });
});

describe('presets audit', () => {
    test('audit persists a clean verdict once schema is ready', async () => {
        const directories = makeDirectories();
        const db = openDb(directories);

        const result = await auditCanonicalPresetsShadowImport({ handle: 'tester', db });
        expect(result.ok).toBe(true);
        expect(result.blocking).toBe(false);

        const persisted = getPersistedCanonicalAuditStatus(db, { scope: PRESETS_AUDIT_SCOPE });
        expect(persisted.blocking).toBe(false);
    });
});
