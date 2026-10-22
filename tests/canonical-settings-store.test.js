import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

import { afterEach, describe, expect, jest, test } from '@jest/globals';

import { createCanonicalSqliteManager } from '../src/canonical-sqlite.js';
import { CANONICAL_SQLITE_MIGRATIONS, runCanonicalMigrations } from '../src/canonical-sqlite-migrations.js';
import { expectCanonicalDomainSchema } from './helpers/canonical-domain-schema.js';
import {
    getCanonicalSettingsDocument,
    getCanonicalSettingsRevision,
    listOpenSettingsProjectionRepairs,
    recordSettingsProjectionRepair,
    resolveSettingsProjectionRepair,
    upsertCanonicalSettingsDocument,
} from '../src/endpoints/settings-store.js';
import {
    SETTINGS_AUDIT_SCOPE,
    auditCanonicalSettingsShadowImport,
    runCanonicalSettingsShadowImport,
} from '../src/canonical-settings-shadow-import.js';
import {
    getPersistedCanonicalAuditStatus,
} from '../src/canonical-sqlite-shadow-import.js';
import { getDefaultCanonicalStorageSliceRegistry } from '../src/canonical-storage-slice-registry.js';

const tempRoots = [];
const managers = [];

function makeRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-canonical-settings-'));
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

function hashPayload(payloadJson) {
    return crypto.createHash('sha256').update(payloadJson, 'utf8').digest('hex');
}

// Writes a stray `settings.json` under the user root. The file is fully inert:
// nothing reads it, projects it, or imports it — tests use it to prove that.
function writeSettingsFile(directories, payload) {
    const filePath = path.join(directories.root, 'settings.json');
    const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 4);
    fs.writeFileSync(filePath, text, 'utf8');
    return filePath;
}

afterEach(() => {
    for (const manager of managers.splice(0, managers.length)) {
        manager.dispose();
    }
    for (const root of tempRoots.splice(0, tempRoots.length)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

describe('canonical settings store', () => {
    test('migration catalog includes settings document authority tables', () => {
        const settingsMigration = CANONICAL_SQLITE_MIGRATIONS.find(x => x.name === 'settings_document_authority');
        expect(settingsMigration?.name).toBe('settings_document_authority');
        expect(settingsMigration.sql).toContain('CREATE TABLE IF NOT EXISTS settings_documents');
        expect(settingsMigration.sql).toContain('CREATE TABLE IF NOT EXISTS settings_snapshots');
        expect(settingsMigration.sql).toContain('CREATE TABLE IF NOT EXISTS settings_projection_repairs');
    });

    test('migrations create settings tables idempotently', () => {
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
        }));
        expect(second).toEqual(expect.objectContaining({
            ok: true,
            appliedVersions: [],
        }));
        expectCanonicalDomainSchema(db, {
            migrationName: 'settings_document_authority',
            tables: ['settings_documents', 'settings_snapshots', 'settings_projection_repairs'],
        });
    });

    test('round-trips a full settings document while preserving unknown nested fields', () => {
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
            firstRun: false,
            power_user: {
                personas: { default: 'Me' },
                persona_descriptions: { Me: 'hello' },
                custom_unknown: { nested: true, arr: [1, 2] },
            },
            feature_settings: {
                third_party: { enabled: true, secret_ish: 'not-a-secret-store' },
            },
            background: { name: 'bg.png', url: '/bg.png' },
            totally_unknown_top: 'keep-me',
        };

        const saved = upsertCanonicalSettingsDocument(db, {
            userId: 'alice',
            payload,
            expectedRevision: 0,
            nowMs: 1735689601000,
        });

        expect(saved).toEqual(expect.objectContaining({
            ok: true,
            revision: 1,
            updatedAtMs: 1735689601000,
        }));
        expect(saved.contentHash).toBe(hashPayload(JSON.stringify(payload)));

        const loaded = getCanonicalSettingsDocument(db, { userId: 'alice' });
        expect(loaded.payload).toEqual(payload);
        expect(loaded.revision).toBe(1);
        expect(getCanonicalSettingsRevision(db, { userId: 'alice' })).toBe(1);
    });

    test('rejects stale revision saves without overwriting the newer document', () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        runCanonicalMigrations(db, { nowMs: 1735689600000 });

        const first = upsertCanonicalSettingsDocument(db, {
            userId: 'alice',
            payload: { v: 1 },
            expectedRevision: 0,
            nowMs: 1000,
        });
        expect(first.ok).toBe(true);
        expect(first.revision).toBe(1);

        const conflict = upsertCanonicalSettingsDocument(db, {
            userId: 'alice',
            payload: { v: 'stale' },
            expectedRevision: 0,
            nowMs: 2000,
        });
        expect(conflict).toEqual(expect.objectContaining({
            ok: false,
            conflict: true,
            currentRevision: 1,
        }));
        expect(getCanonicalSettingsDocument(db, { userId: 'alice' }).payload).toEqual({ v: 1 });

        const second = upsertCanonicalSettingsDocument(db, {
            userId: 'alice',
            payload: { v: 2 },
            expectedRevision: 1,
            nowMs: 3000,
        });
        expect(second).toEqual(expect.objectContaining({
            ok: true,
            revision: 2,
        }));
        expect(getCanonicalSettingsDocument(db, { userId: 'alice' }).payload).toEqual({ v: 2 });
    });

    test('records settings projection repairs separately from character and world info repairs', () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        runCanonicalMigrations(db, { nowMs: 1735689600000 });

        recordSettingsProjectionRepair(db, {
            repairKey: 'settings:alice:projection',
            userId: 'alice',
            reason: 'projection_failed',
            details: { operation: 'save' },
            nowMs: 1735689601000,
        });

        expect(listOpenSettingsProjectionRepairs(db)).toEqual([
            expect.objectContaining({
                repairKey: 'settings:alice:projection',
                userId: 'alice',
                reason: 'projection_failed',
                details: { operation: 'save' },
                resolvedAtMs: null,
            }),
        ]);
        expect(db.prepare('SELECT COUNT(*) AS count FROM projection_repairs').get().count).toBe(0);
        expect(db.prepare('SELECT COUNT(*) AS count FROM world_info_projection_repairs').get().count).toBe(0);

        resolveSettingsProjectionRepair(db, {
            repairKey: 'settings:alice:projection',
            resolvedAtMs: 1735689602000,
        });
        expect(listOpenSettingsProjectionRepairs(db)).toEqual([]);
    });

    test('settings shadow import is a no-op: nothing ingests on-disk files', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        writeSettingsFile(directories, {
            firstRun: false,
            power_user: { personas: { default: 'Me' } },
        });

        const first = await runCanonicalSettingsShadowImport({
            handle: 'alice',
            directories,
            featureFlags: {
                enabled: true,
                shadowImport: true,
                strict: false,
            },
            manager,
            nowMs: 1735689600000,
        });
        expect(first).toEqual(expect.objectContaining({
            ok: true,
            skipped: false,
            importedCount: 0,
            updatedCount: 0,
            unchangedCount: 1,
            failedCount: 0,
        }));
        expect(first.entries).toEqual(expect.arrayContaining([
            expect.objectContaining({ status: 'unchanged', reason: 'no_file_surfaces' }),
        ]));

        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        // The stray file is inert: no document was imported from it.
        expect(getCanonicalSettingsDocument(db, { userId: 'alice' })).toBeNull();
    });

    test('audit stays clean with zero drift entries regardless of on-disk files', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        writeSettingsFile(directories, { firstRun: true, ghost: true });
        fs.writeFileSync(path.join(directories.root, 'settings.migrated.json'), '{not-json', 'utf8');

        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        runCanonicalMigrations(db, { nowMs: 1000 });
        upsertCanonicalSettingsDocument(db, {
            userId: 'alice',
            payload: { firstRun: false, current: true },
            expectedRevision: 0,
        });

        const audit = await auditCanonicalSettingsShadowImport({
            handle: 'alice',
            directories,
            db,
            auditedAtMs: 2000,
            projection: 'off',
        });
        expect(audit).toEqual(expect.objectContaining({
            ok: true,
            blocking: false,
            hasDrift: false,
            reason: null,
            entries: [],
        }));
        expect(getPersistedCanonicalAuditStatus(db, { scope: SETTINGS_AUDIT_SCOPE })).toEqual(expect.objectContaining({
            ok: true,
            blocking: false,
            status: 'clean',
        }));
    });

    test('audit reports schema not ready before migrations run', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });

        const schemaAudit = await auditCanonicalSettingsShadowImport({
            handle: 'alice',
            directories,
            db,
            auditedAtMs: 1000,
        });
        expect(schemaAudit).toEqual(expect.objectContaining({
            ok: false,
            blocking: true,
            reason: expect.stringMatching(/migration/),
        }));
    });

    test('registers settings slice in the default canonical storage registry', () => {
        const registry = getDefaultCanonicalStorageSliceRegistry();
        expect(registry.has('settings')).toBe(true);
        const slice = registry.get('settings');
        expect(slice.auditScope).toBe(SETTINGS_AUDIT_SCOPE);
        expect(typeof slice.listOpenRepairs).toBe('function');
        expect(typeof slice.getRollbackBlockers).toBe('function');
        // settings.json is no longer a managed runtime artifact; backup and
        // restore run through canonical snapshots instead.
        expect(slice.getBackupManagedPaths({
            root: '/tmp/user',
            storage: '/tmp/user/storage',
        })).toEqual([]);
    });
});

describe('canonical settings route integration', () => {
    const envKeys = [
        'EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED',
        'EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SHADOWIMPORT',
        'EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_READS',
        'EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_WRITES',
        'EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_STRICT',
        'EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SLICES_SETTINGS_PROJECTION',
    ];

    function setCanonicalEnv({ enabled = true, shadowImport = true, reads = true, writes = false, strict = false, projection = null } = {}) {
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED = String(enabled);
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SHADOWIMPORT = String(shadowImport);
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_READS = String(reads);
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_WRITES = String(writes);
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_STRICT = String(strict);
        if (projection != null) {
            process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SLICES_SETTINGS_PROJECTION = projection;
        }
    }

    function clearCanonicalEnv() {
        for (const key of envKeys) {
            delete process.env[key];
        }
    }

    function createResponse() {
        return {
            body: undefined,
            statusCode: 200,
            headers: {},
            send(payload) { this.body = payload; return this; },
            json(payload) { this.body = payload; return this; },
            sendStatus(code) { this.statusCode = code; this.body = code; return this; },
            status(code) { this.statusCode = code; return this; },
        };
    }

    async function loadSettingsRouter() {
        jest.resetModules();
        const { setConfigFilePath } = await import('../src/util.js');
        const configRoot = makeRoot();
        const configPath = path.join(configRoot, 'config.yaml');
        fs.writeFileSync(configPath, 'port: 8000\n', 'utf8');
        setConfigFilePath(configPath);
        const settingsModule = await import(`../src/endpoints/settings.js?settingsCanonical=${Date.now()}-${Math.random()}`);
        return settingsModule.router;
    }

    async function invokeRoute(router, pathName, { body = {}, directories, handle = 'alice' } = {}) {
        const layer = router.stack.find(entry => entry.route?.path === pathName && entry.route.methods?.post);
        if (!layer) {
            throw new Error(`Route not found: POST ${pathName}`);
        }
        const response = createResponse();
        await layer.route.stack[0].handle({
            body,
            user: {
                profile: { handle },
                directories,
            },
        }, response);
        return response;
    }

    function createRouteDirectories(root) {
        const directories = {
            root,
            storage: path.join(root, 'storage'),
            backups: path.join(root, 'backups'),
            novelAI_Settings: path.join(root, 'NovelAI Settings'),
            openAI_Settings: path.join(root, 'OpenAI Settings'),
            koboldAI_Settings: path.join(root, 'KoboldAI Settings'),
            textGen_Settings: path.join(root, 'TextGen Settings'),
            worlds: path.join(root, 'worlds'),
            themes: path.join(root, 'themes'),
            movingUI: path.join(root, 'movingUI'),
            quickreplies: path.join(root, 'QuickReplies'),
            instruct: path.join(root, 'instruct'),
            context: path.join(root, 'context'),
            sysprompt: path.join(root, 'sysprompt'),
            reasoning: path.join(root, 'reasoning'),
        };
        for (const dir of Object.values(directories)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        return directories;
    }

    afterEach(async () => {
        clearCanonicalEnv();
        try {
            const { canonicalSqliteManager } = await import('../src/canonical-sqlite.js');
            canonicalSqliteManager.dispose();
        } catch {
            // ignore
        }
        for (const manager of managers.splice(0, managers.length)) {
            manager.dispose();
        }
    });

    async function seedSettingsDocument(directories, payload, {
        handle = 'alice',
        auditClean = true,
        expectedRevision = 0,
        nowMs = 2000,
    } = {}) {
        const { canonicalSqliteManager } = await import('../src/canonical-sqlite.js');
        const { persistCanonicalAuditStatus } = await import('../src/canonical-sqlite-shadow-import.js');
        const db = canonicalSqliteManager.open({
            handle,
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        runCanonicalMigrations(db, { nowMs: 1000 });
        const saved = upsertCanonicalSettingsDocument(db, {
            userId: handle,
            payload,
            expectedRevision,
            nowMs,
        });
        if (auditClean) {
            persistCanonicalAuditStatus(db, {
                ok: true,
                handle,
                hasDrift: false,
                blocking: false,
                entries: [],
            }, {
                scope: SETTINGS_AUDIT_SCOPE,
                auditedAtMs: nowMs + 1,
            });
        }
        return { db, saved };
    }

    test('DB-first get returns canonical settings string and revision while keeping directory aggregates', async () => {
        const root = makeRoot();
        const directories = createRouteDirectories(root);
        const filePayload = {
            firstRun: false,
            power_user: { personas: { default: 'File' } },
            oai_settings: { stream_openai: true },
        };
        writeSettingsFile(directories, filePayload);

        const canonicalPayload = {
            firstRun: false,
            power_user: { personas: { default: 'DB' }, persona_descriptions: { DB: 'hi' } },
            feature_settings: { demo: { on: true } },
            background: { name: 'bg.png' },
            oai_settings: { stream_openai: false },
            mystery: 9,
        };
        setCanonicalEnv({ enabled: true, shadowImport: true, reads: true, writes: false });
        const router = await loadSettingsRouter();
        // First get bootstraps a defaults document (rev 1) — the stray file is
        // never read; seeding on top keeps DB authority divergent from it.
        await invokeRoute(router, '/get', { directories });
        await seedSettingsDocument(directories, canonicalPayload, { expectedRevision: 1 });
        const response = await invokeRoute(router, '/get', { directories });

        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body.settings)).toEqual(canonicalPayload);
        expect(response.body.settings_revision).toBe(2);
        // File still has the old payload; DB is authority for settings string.
        expect(JSON.parse(fs.readFileSync(path.join(directories.root, 'settings.json'), 'utf8'))).toEqual(filePayload);
    });

    test('bootstraps a defaults document on first get without any settings.json file', async () => {
        const root = makeRoot();
        const directories = createRouteDirectories(root);
        // No settings.json and no canonical document — a fresh user must not
        // depend on the legacy file to receive defaults.
        const defaultsPayload = JSON.parse(fs.readFileSync(new URL('../default/templates/settings-defaults.json', import.meta.url), 'utf8'));

        setCanonicalEnv({ enabled: true, shadowImport: true, reads: true, writes: false });
        const router = await loadSettingsRouter();
        const response = await invokeRoute(router, '/get', { directories });

        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body.settings)).toEqual(defaultsPayload);
        expect(response.body.settings_revision).toBe(1);
        // Still no file on disk: the bootstrap path must not re-create it.
        expect(fs.existsSync(path.join(directories.root, 'settings.json'))).toBe(false);
    });

    test('concurrent first /get and /save initialize a single document idempotently', async () => {
        const root = makeRoot();
        const directories = createRouteDirectories(root);
        setCanonicalEnv({ enabled: true, shadowImport: true, reads: true, writes: true });
        const router = await loadSettingsRouter();

        const [getResponse, saveResponse] = await Promise.all([
            invokeRoute(router, '/get', { directories }),
            invokeRoute(router, '/save', {
                directories,
                body: { firstRun: false, race: true },
            }),
        ]);

        expect(getResponse.statusCode).toBe(200);
        expect(saveResponse.statusCode).toBe(200);

        const { canonicalSqliteManager } = await import('../src/canonical-sqlite.js');
        const db = canonicalSqliteManager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        const rowCount = db.prepare('SELECT COUNT(*) AS count FROM settings_documents').get().count;
        expect(rowCount).toBe(1);
        const doc = getCanonicalSettingsDocument(db, { userId: 'alice' });
        // Whichever caller won the create race committed exactly one document;
        // the loser observed the revision conflict and adopted the winner.
        expect(doc.revision).toBeGreaterThanOrEqual(1);
        const payload = doc.payload;
        const isDefaults = payload.race === undefined && payload.firstRun !== false;
        const isSaveBody = payload.firstRun === false && payload.race === true;
        expect(isDefaults || isSaveBody).toBe(true);
        expect(fs.existsSync(path.join(directories.root, 'settings.json'))).toBe(false);
    });

    test('ignores the retired reads flag and fails closed when the settings audit blocks', async () => {
        const root = makeRoot();
        const directories = createRouteDirectories(root);

        // 'reads' is retired: pinning it off warns and is ignored — the
        // canonical document stays authoritative.
        setCanonicalEnv({ enabled: true, reads: false });
        const router = await loadSettingsRouter();
        const { db } = await seedSettingsDocument(directories, { firstRun: false, source: 'db' });
        let response = await invokeRoute(router, '/get', { directories });
        expect(JSON.parse(response.body.settings)).toEqual({ firstRun: false, source: 'db' });
        expect(response.body.settings_revision).toBe(1);

        const { persistCanonicalAuditStatus } = await import('../src/canonical-sqlite-shadow-import.js');
        persistCanonicalAuditStatus(db, {
            ok: false,
            handle: 'alice',
            hasDrift: true,
            blocking: true,
            reason: 'audit_drift_blocked',
            entries: [{ status: 'drift' }],
        }, {
            scope: SETTINGS_AUDIT_SCOPE,
            auditedAtMs: 3000,
        });
        response = await invokeRoute(router, '/get', { directories });
        expect(response.statusCode).toBe(503);
        expect(response.body).toEqual({
            error: 'canonical_storage_unavailable',
            reason: 'audit_drift_blocked',
        });
    });

    test('world_names lists canonical world books even without file projections', async () => {
        const root = makeRoot();
        const directories = createRouteDirectories(root);

        setCanonicalEnv({ enabled: true, shadowImport: true });
        const router = await loadSettingsRouter();

        // Seed a DB-only world book: no worlds/*.json exists, so a directory
        // scan would produce an empty list while canonical storage has the row.
        const { canonicalSqliteManager } = await import('../src/canonical-sqlite.js');
        const { upsertCanonicalWorldInfoBook } = await import('../src/endpoints/world-info-store.js');
        const { persistCanonicalAuditStatus } = await import('../src/canonical-sqlite-shadow-import.js');
        const db = canonicalSqliteManager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        runCanonicalMigrations(db, { nowMs: 3000 });
        upsertCanonicalWorldInfoBook(db, {
            name: 'DbOnlyBook',
            payload: { entries: {} },
            sourceMtimeMs: 1,
            sourceSizeBytes: 2,
            nowMs: 3000,
        });
        persistCanonicalAuditStatus(db, {
            ok: true,
            handle: 'alice',
            hasDrift: false,
            blocking: false,
            entries: [],
        }, {
            scope: 'world_info',
            auditedAtMs: 3001,
        });
        expect(fs.readdirSync(directories.worlds)).toHaveLength(0);

        const response = await invokeRoute(router, '/get', { directories });
        expect(response.statusCode).toBe(200);
        expect(response.body.world_names).toContain('DbOnlyBook');
    });

    test('canonical save enforces revision conflicts without writing settings.json', async () => {
        const root = makeRoot();
        const directories = createRouteDirectories(root);
        writeSettingsFile(directories, { firstRun: true });

        setCanonicalEnv({ enabled: true, shadowImport: true, reads: true, writes: true });
        const router = await loadSettingsRouter();

        // First save bootstraps a defaults document (rev 1) before the DB write.
        const firstSave = await invokeRoute(router, '/save', {
            directories,
            body: {
                firstRun: false,
                v: 2,
                settings_revision: 1,
            },
        });
        const { canonicalSqliteManager } = await import('../src/canonical-sqlite.js');
        const db = canonicalSqliteManager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        expect(firstSave.statusCode).toBe(200);
        expect(firstSave.body).toEqual(expect.objectContaining({
            result: 'ok',
            settings_revision: 2,
        }));
        // No file projection exists anymore: the seeded file keeps its stale
        // content while the canonical document is the only thing updated.
        expect(JSON.parse(fs.readFileSync(path.join(directories.root, 'settings.json'), 'utf8'))).toEqual({
            firstRun: true,
        });
        expect(getCanonicalSettingsDocument(db, { userId: 'alice' }).payload).toEqual({
            firstRun: false,
            v: 2,
        });

        const staleSave = await invokeRoute(router, '/save', {
            directories,
            body: {
                firstRun: false,
                v: 'stale',
                settings_revision: 1,
            },
        });
        expect(staleSave.statusCode).toBe(409);
        expect(staleSave.body).toEqual(expect.objectContaining({
            error: 'settings_revision_conflict',
            settings_revision: 2,
        }));
        expect(staleSave.body).not.toHaveProperty('current');
        expect(getCanonicalSettingsDocument(db, { userId: 'alice' }).payload).toEqual({
            firstRun: false,
            v: 2,
        });
        expect(JSON.parse(fs.readFileSync(path.join(directories.root, 'settings.json'), 'utf8'))).toEqual({
            firstRun: true,
        });
    });

    test('save ignores a sabotaged settings.json path entirely', async () => {
        const root = makeRoot();
        const directories = createRouteDirectories(root);
        writeSettingsFile(directories, { firstRun: true });

        setCanonicalEnv({ enabled: true, reads: true, writes: true });
        const router = await loadSettingsRouter();
        await invokeRoute(router, '/get', { directories });
        const { canonicalSqliteManager } = await import('../src/canonical-sqlite.js');
        const db = canonicalSqliteManager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });

        // A settings.json DIRECTORY must not break the save: the
        // projection write path is gone, the file is inert.
        const settingsPath = path.join(directories.root, 'settings.json');
        fs.rmSync(settingsPath, { force: true });
        fs.mkdirSync(settingsPath);
        const response = await invokeRoute(router, '/save', {
            directories,
            body: {
                firstRun: false,
                v: 2,
                settings_revision: 1,
            },
        });

        expect(response.statusCode).toBe(200);
        expect(response.body).toEqual(expect.objectContaining({
            result: 'ok',
            settings_revision: 2,
        }));
        expect(getCanonicalSettingsDocument(db, { userId: 'alice' }).payload).toEqual({
            firstRun: false,
            v: 2,
        });
        expect(listOpenSettingsProjectionRepairs(db).length).toBe(0);
    });
    test('ignores top-level document revision field and only honors settings_revision', async () => {
        const root = makeRoot();
        const directories = createRouteDirectories(root);
        writeSettingsFile(directories, { firstRun: true });
        setCanonicalEnv({ enabled: true, reads: true, writes: true });
        const router = await loadSettingsRouter();
        // First canonical access bootstraps a defaults document (rev 1); the
        // stray file is never consulted.

        // A body field named revision must not act as optimistic concurrency token.
        const byDocumentRevision = await invokeRoute(router, '/save', {
            directories,
            body: {
                firstRun: false,
                v: 2,
                revision: 0,
            },
        });
        expect(byDocumentRevision.statusCode).toBe(200);
        expect(byDocumentRevision.body).toEqual(expect.objectContaining({
            result: 'ok',
            settings_revision: 2,
        }));

        const stale = await invokeRoute(router, '/save', {
            directories,
            body: {
                firstRun: false,
                v: 3,
                settings_revision: 1,
            },
        });
        expect(stale.statusCode).toBe(409);
        expect(stale.body).toEqual({
            error: 'settings_revision_conflict',
            settings_revision: 2,
        });
    });

    test('leaves settings.json stale while serving DB authority', async () => {
        const root = makeRoot();
        const directories = createRouteDirectories(root);
        writeSettingsFile(directories, { firstRun: true });
        setCanonicalEnv({ enabled: true, reads: true, writes: true });
        const router = await loadSettingsRouter();

        const save = await invokeRoute(router, '/save', {
            directories,
            body: {
                firstRun: false,
                v: 2,
            },
        });
        const get = await invokeRoute(router, '/get', { directories });
        const filePayload = JSON.parse(fs.readFileSync(path.join(directories.root, 'settings.json'), 'utf8'));

        expect(save.statusCode).toBe(200);
        expect(save.body).toEqual(expect.objectContaining({ result: 'ok' }));
        expect(JSON.parse(get.body.settings)).toEqual({ firstRun: false, v: 2 });
        // The compatibility file still holds the pre-save content.
        expect(filePayload).toEqual({ firstRun: true });
    });

    test('make-snapshot creates a canonical snapshot and no file backup', async () => {
        const root = makeRoot();
        const directories = createRouteDirectories(root);
        writeSettingsFile(directories, { firstRun: true });
        setCanonicalEnv({ enabled: true, reads: true, writes: true });
        const router = await loadSettingsRouter();
        await invokeRoute(router, '/save', {
            directories,
            body: { firstRun: false, v: 5 },
        });
        // The stray settings.json is intentionally stale and fully inert.
        expect(JSON.parse(fs.readFileSync(path.join(directories.root, 'settings.json'), 'utf8')))
            .toEqual({ firstRun: true });

        const make = await invokeRoute(router, '/make-snapshot', { directories });
        expect(make.statusCode).toBe(204);

        // Snapshots live in canonical storage only — the backups directory
        // receives no settings_* materialization.
        const backups = fs.readdirSync(directories.backups)
            .filter(name => name.startsWith('settings_alice_'));
        expect(backups).toEqual([]);

        const list = await invokeRoute(router, '/get-snapshots', { directories });
        expect(list.body).toEqual(expect.arrayContaining([
            expect.objectContaining({ source: 'canonical' }),
        ]));
    });

});

describe('canonical settings snapshots and rollback', () => {
    const envKeys = [
        'EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED',
        'EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SHADOWIMPORT',
        'EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_READS',
        'EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_WRITES',
        'EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_STRICT',
        'EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SLICES_SETTINGS_PROJECTION',
    ];

    function setCanonicalEnv({ enabled = true, shadowImport = true, reads = true, writes = true, strict = false, projection = null } = {}) {
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED = String(enabled);
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SHADOWIMPORT = String(shadowImport);
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_READS = String(reads);
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_WRITES = String(writes);
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_STRICT = String(strict);
        if (projection != null) {
            process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SLICES_SETTINGS_PROJECTION = projection;
        }
    }

    function clearCanonicalEnv() {
        for (const key of envKeys) {
            delete process.env[key];
        }
    }

    function createResponse() {
        return {
            body: undefined,
            statusCode: 200,
            send(payload) { this.body = payload; return this; },
            json(payload) { this.body = payload; return this; },
            sendStatus(code) { this.statusCode = code; this.body = code; return this; },
            status(code) { this.statusCode = code; return this; },
        };
    }

    async function loadSettingsRouter() {
        jest.resetModules();
        const { setConfigFilePath } = await import('../src/util.js');
        const configRoot = makeRoot();
        const configPath = path.join(configRoot, 'config.yaml');
        fs.writeFileSync(configPath, 'port: 8000\n', 'utf8');
        setConfigFilePath(configPath);
        const settingsModule = await import(`../src/endpoints/settings.js?settingsSnap=${Date.now()}-${Math.random()}`);
        return settingsModule.router;
    }

    async function invokeRoute(router, pathName, { body = {}, directories, handle = 'alice' } = {}) {
        const layer = router.stack.find(entry => entry.route?.path === pathName && entry.route.methods?.post);
        if (!layer) {
            throw new Error(`Route not found: POST ${pathName}`);
        }
        const response = createResponse();
        // Filename validation middleware may be stacked before the handler.
        const handlers = layer.route.stack.map(entry => entry.handle);
        let idx = 0;
        const next = async (err) => {
            if (err) {
                throw err;
            }
            const handler = handlers[idx++];
            if (!handler) {
                return;
            }
            await handler({
                body,
                user: {
                    profile: { handle },
                    directories,
                },
            }, response, next);
        };
        await next();
        return response;
    }

    function createRouteDirectories(root) {
        const directories = {
            root,
            storage: path.join(root, 'storage'),
            backups: path.join(root, 'backups'),
            novelAI_Settings: path.join(root, 'NovelAI Settings'),
            openAI_Settings: path.join(root, 'OpenAI Settings'),
            koboldAI_Settings: path.join(root, 'KoboldAI Settings'),
            textGen_Settings: path.join(root, 'TextGen Settings'),
            worlds: path.join(root, 'worlds'),
            themes: path.join(root, 'themes'),
            movingUI: path.join(root, 'movingUI'),
            quickreplies: path.join(root, 'QuickReplies'),
            instruct: path.join(root, 'instruct'),
            context: path.join(root, 'context'),
            sysprompt: path.join(root, 'sysprompt'),
            reasoning: path.join(root, 'reasoning'),
        };
        for (const dir of Object.values(directories)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        return directories;
    }

    afterEach(async () => {
        clearCanonicalEnv();
        try {
            const { canonicalSqliteManager } = await import('../src/canonical-sqlite.js');
            canonicalSqliteManager.dispose();
        } catch {
            // ignore
        }
    });

    test('make/load/restore snapshot creates a new revision without rewinding the counter', async () => {
        const root = makeRoot();
        const directories = createRouteDirectories(root);
        writeSettingsFile(directories, { firstRun: true, v: 0 });
        setCanonicalEnv({ enabled: true, reads: true, writes: true });
        const router = await loadSettingsRouter();

        // Lazy init bootstraps a defaults document (rev 1); the stray file
        // stays inert while we seed divergent state on top.
        await invokeRoute(router, '/get', { directories });

        const { canonicalSqliteManager } = await import('../src/canonical-sqlite.js');
        const { persistCanonicalAuditStatus } = await import('../src/canonical-sqlite-shadow-import.js');
        const db = canonicalSqliteManager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        runCanonicalMigrations(db, { nowMs: 1000 });
        upsertCanonicalSettingsDocument(db, {
            userId: 'alice',
            payload: { firstRun: false, v: 1 },
            expectedRevision: 1,
            nowMs: 2000,
        });
        persistCanonicalAuditStatus(db, {
            ok: true,
            handle: 'alice',
            hasDrift: false,
            blocking: false,
            entries: [],
        }, { scope: SETTINGS_AUDIT_SCOPE, auditedAtMs: 3000 });

        const make = await invokeRoute(router, '/make-snapshot', { directories });
        expect(make.statusCode).toBe(204);

        const list = await invokeRoute(router, '/get-snapshots', { directories });
        expect(list.statusCode).toBe(200);
        expect(Array.isArray(list.body)).toBe(true);
        expect(list.body.length).toBeGreaterThanOrEqual(1);
        const snap = list.body.find(entry => String(entry.name).startsWith('canonical:')) ?? list.body[0];
        expect(snap).toEqual(expect.objectContaining({
            name: expect.stringMatching(/^canonical:/),
            date: expect.any(Number),
            size: expect.any(Number),
        }));

        // Mutate live document to v2.
        upsertCanonicalSettingsDocument(db, {
            userId: 'alice',
            payload: { firstRun: false, v: 2 },
            expectedRevision: 2,
            nowMs: 4000,
        });
        expect(getCanonicalSettingsRevision(db, { userId: 'alice' })).toBe(3);

        const restore = await invokeRoute(router, '/restore-snapshot', {
            directories,
            body: { name: snap.name },
        });
        expect(restore.statusCode).toBe(204);
        const restored = getCanonicalSettingsDocument(db, { userId: 'alice' });
        expect(restored.payload).toEqual({ firstRun: false, v: 1 });
        expect(restored.revision).toBe(4); // new revision, not rewind
        // The on-disk file is fully inert: it keeps the seeded payload.
        expect(JSON.parse(fs.readFileSync(path.join(directories.root, 'settings.json'), 'utf8'))).toEqual({
            firstRun: true,
            v: 0,
        });
    });

    test('make-snapshot fails closed when canonical storage is unavailable', async () => {
        const root = makeRoot();
        const directories = createRouteDirectories(root);
        setCanonicalEnv({ enabled: false, reads: true, writes: true });
        const router = await loadSettingsRouter();

        const response = await invokeRoute(router, '/make-snapshot', { directories });

        expect(response.statusCode).toBe(503);
        expect(response.body).toEqual(expect.objectContaining({
            error: 'canonical_storage_unavailable',
        }));
        // Nothing may be materialized when canonical is unavailable.
        expect(fs.readdirSync(directories.backups).filter(n => n.startsWith('settings_alice_'))).toEqual([]);
    });

    test('restore-snapshot reports a canonical snapshot unavailable as 503', async () => {
        const root = makeRoot();
        const directories = createRouteDirectories(root);
        setCanonicalEnv({ enabled: false, reads: true, writes: true });
        const router = await loadSettingsRouter();

        const response = await invokeRoute(router, '/restore-snapshot', {
            directories,
            body: { name: 'canonical:abc' },
        });

        expect(response.statusCode).toBe(503);
        expect(response.body).toEqual(expect.objectContaining({
            error: 'canonical_storage_unavailable',
        }));
    });

    test('stale open settings projection repairs are resolved by migration and no longer block writes', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        // Simulate a pre-upgrade database: an open projection repair left over
        // from the file-projection era. Later migrations (v12+) are held back so
        // the upgrade pass below is what resolves the stale row.
        runCanonicalMigrations(db, {
            nowMs: 1000,
            migrations: CANONICAL_SQLITE_MIGRATIONS.filter(m => m.version <= 11),
        });
        recordSettingsProjectionRepair(db, {
            repairKey: 'settings:alice:projection',
            userId: 'alice',
            reason: 'projection_failed',
            details: { operation: 'save' },
            nowMs: 2000,
        });
        expect(listOpenSettingsProjectionRepairs(db).length).toBe(1);

        // The upgrade migration resolves the stale row; writes proceed.
        runCanonicalMigrations(db, { nowMs: 3000 });
        expect(listOpenSettingsProjectionRepairs(db).length).toBe(0);

        const slice = getDefaultCanonicalStorageSliceRegistry().get('settings');
        const blockers = slice.getRollbackBlockers({
            db,
            featureFlags: {
                enabled: true,
                shadowImport: true,
                reads: true,
                writes: true,
                strict: false,
            },
            phase: 'writes',
            persistedAuditStatus: { ok: true, blocking: false, reason: null },
        });
        expect(blockers.ok).toBe(true);
    });
});
