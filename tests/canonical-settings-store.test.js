import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

import { afterEach, describe, expect, jest, test } from '@jest/globals';

import { createCanonicalSqliteManager } from '../src/canonical-sqlite.js';
import { CANONICAL_SQLITE_MIGRATIONS, runCanonicalMigrations } from '../src/canonical-sqlite-migrations.js';
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
import { SETTINGS_FILE } from '../src/constants.js';

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

function writeSettingsFile(directories, payload) {
    const filePath = path.join(directories.root, SETTINGS_FILE);
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
        expect(CANONICAL_SQLITE_MIGRATIONS.map(x => x.version)).toEqual([1, 2, 3, 4]);
        const settingsMigration = CANONICAL_SQLITE_MIGRATIONS.find(x => x.version === 4);
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
            currentVersion: 4,
            targetVersion: 4,
            appliedVersions: expect.arrayContaining([4]),
        }));
        expect(second).toEqual(expect.objectContaining({
            ok: true,
            appliedVersions: [],
            currentVersion: 4,
            targetVersion: 4,
        }));
        expect(db.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?').get('table', 'settings_documents')).toBeTruthy();
        expect(db.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?').get('table', 'settings_snapshots')).toBeTruthy();
        expect(db.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?').get('table', 'settings_projection_repairs')).toBeTruthy();
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
            extension_settings: {
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

    test('shadow-imports settings.json idempotently and audits DB/file drift classes', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const payload = {
            firstRun: false,
            power_user: { personas: { default: 'Me' }, mystery: 42 },
            extension_settings: { demo: { on: true } },
            background: { name: 'x.png' },
        };
        writeSettingsFile(directories, payload);

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
            importedCount: 1,
            updatedCount: 0,
            unchangedCount: 0,
            failedCount: 0,
        }));

        const second = await runCanonicalSettingsShadowImport({
            handle: 'alice',
            directories,
            featureFlags: {
                enabled: true,
                shadowImport: true,
                strict: false,
            },
            manager,
            nowMs: 1735689601000,
        });
        expect(second).toEqual(expect.objectContaining({
            ok: true,
            importedCount: 0,
            updatedCount: 0,
            unchangedCount: 1,
            failedCount: 0,
        }));

        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        const cleanAudit = await auditCanonicalSettingsShadowImport({
            handle: 'alice',
            directories,
            db,
            auditedAtMs: 1735689602000,
        });
        expect(cleanAudit).toEqual(expect.objectContaining({
            ok: true,
            blocking: false,
            hasDrift: false,
            reason: null,
        }));
        expect(getPersistedCanonicalAuditStatus(db, { scope: SETTINGS_AUDIT_SCOPE })).toEqual(expect.objectContaining({
            ok: true,
            blocking: false,
            status: 'clean',
        }));

        // File mutated after import -> payload_mismatch drift.
        writeSettingsFile(directories, { ...payload, firstRun: true });
        const driftAudit = await auditCanonicalSettingsShadowImport({
            handle: 'alice',
            directories,
            db,
            auditedAtMs: 1735689603000,
        });
        expect(driftAudit).toEqual(expect.objectContaining({
            ok: false,
            blocking: true,
            hasDrift: true,
            reason: 'audit_drift_blocked',
        }));
        expect(driftAudit.entries).toEqual(expect.arrayContaining([
            expect.objectContaining({
                status: 'drift',
                drift_types: expect.arrayContaining(['payload_mismatch']),
            }),
        ]));

        // Missing file while DB has document.
        fs.rmSync(path.join(directories.root, SETTINGS_FILE), { force: true });
        const missingFileAudit = await auditCanonicalSettingsShadowImport({
            handle: 'alice',
            directories,
            db,
            auditedAtMs: 1735689604000,
        });
        expect(missingFileAudit.entries).toEqual(expect.arrayContaining([
            expect.objectContaining({
                status: 'drift',
                drift_types: expect.arrayContaining(['missing_projection_file']),
            }),
        ]));
    });

    test('audit classifies missing import, invalid JSON, and schema not ready', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });

        // Schema not migrated yet.
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

        runCanonicalMigrations(db, { nowMs: 2000 });
        writeSettingsFile(directories, '{not-json');
        const invalidAudit = await auditCanonicalSettingsShadowImport({
            handle: 'alice',
            directories,
            db,
            auditedAtMs: 3000,
        });
        expect(invalidAudit.entries).toEqual(expect.arrayContaining([
            expect.objectContaining({
                status: 'error',
                drift_types: expect.arrayContaining(['invalid_json']),
            }),
        ]));

        writeSettingsFile(directories, { firstRun: true });
        const notImported = await auditCanonicalSettingsShadowImport({
            handle: 'alice',
            directories,
            db,
            auditedAtMs: 4000,
        });
        expect(notImported.entries).toEqual(expect.arrayContaining([
            expect.objectContaining({
                status: 'drift',
                drift_types: expect.arrayContaining(['missing_db_settings']),
            }),
        ]));
    });

    test('registers settings slice in the default canonical storage registry', () => {
        const registry = getDefaultCanonicalStorageSliceRegistry();
        expect(registry.has('settings')).toBe(true);
        const slice = registry.get('settings');
        expect(slice.auditScope).toBe(SETTINGS_AUDIT_SCOPE);
        expect(typeof slice.listOpenRepairs).toBe('function');
        expect(typeof slice.getRollbackBlockers).toBe('function');
        expect(slice.getBackupManagedPaths({
            root: '/tmp/user',
            storage: '/tmp/user/storage',
        })).toEqual(expect.arrayContaining([
            path.join('/tmp/user', SETTINGS_FILE),
        ]));
    });
});

describe('canonical settings route integration', () => {
    const envKeys = [
        'EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED',
        'EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SHADOWIMPORT',
        'EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_READS',
        'EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_WRITES',
        'EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_STRICT',
    ];

    function setCanonicalEnv({ enabled = true, shadowImport = true, reads = true, writes = false, strict = false } = {}) {
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED = String(enabled);
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SHADOWIMPORT = String(shadowImport);
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_READS = String(reads);
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_WRITES = String(writes);
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_STRICT = String(strict);
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
        fs.writeFileSync(path.join(directories.themes, 'Dark.json'), JSON.stringify({ name: 'Dark' }), 'utf8');

        const canonicalPayload = {
            firstRun: false,
            power_user: { personas: { default: 'DB' }, persona_descriptions: { DB: 'hi' } },
            extension_settings: { demo: { on: true } },
            background: { name: 'bg.png' },
            oai_settings: { stream_openai: false },
            mystery: 9,
        };
        setCanonicalEnv({ enabled: true, shadowImport: true, reads: true, writes: false });
        const router = await loadSettingsRouter();
        await seedSettingsDocument(directories, canonicalPayload);
        const response = await invokeRoute(router, '/get', { directories });

        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body.settings)).toEqual(canonicalPayload);
        expect(response.body.settings_revision).toBe(1);
        expect(response.body.themes).toEqual([{ name: 'Dark' }]);
        // File still has the old payload; DB is authority for settings string.
        expect(JSON.parse(fs.readFileSync(path.join(directories.root, SETTINGS_FILE), 'utf8'))).toEqual(filePayload);
    });

    test('falls back to file settings when reads are off or settings audit is blocked', async () => {
        const root = makeRoot();
        const directories = createRouteDirectories(root);
        const filePayload = { firstRun: true, source: 'file' };
        writeSettingsFile(directories, filePayload);

        setCanonicalEnv({ enabled: true, reads: false });
        let router = await loadSettingsRouter();
        const { db } = await seedSettingsDocument(directories, { firstRun: false, source: 'db' }, { auditClean: false });
        let response = await invokeRoute(router, '/get', { directories });
        expect(JSON.parse(response.body.settings)).toEqual(filePayload);
        expect(response.body.settings_revision).toBeUndefined();

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
        setCanonicalEnv({ enabled: true, reads: true });
        router = await loadSettingsRouter();
        response = await invokeRoute(router, '/get', { directories });
        expect(JSON.parse(response.body.settings)).toEqual(filePayload);
    });

    test('canonical save enforces revision conflicts and projects settings.json after DB commit', async () => {
        const root = makeRoot();
        const directories = createRouteDirectories(root);
        writeSettingsFile(directories, { firstRun: true });

        setCanonicalEnv({ enabled: true, shadowImport: true, reads: true, writes: true });
        const router = await loadSettingsRouter();
        const { db } = await seedSettingsDocument(directories, { firstRun: false, v: 1 });

        const firstSave = await invokeRoute(router, '/save', {
            directories,
            body: {
                firstRun: false,
                v: 2,
                settings_revision: 1,
            },
        });
        expect(firstSave.statusCode).toBe(200);
        expect(firstSave.body).toEqual(expect.objectContaining({
            result: 'ok',
            settings_revision: 2,
        }));
        expect(JSON.parse(fs.readFileSync(path.join(directories.root, SETTINGS_FILE), 'utf8'))).toEqual({
            firstRun: false,
            v: 2,
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
        expect(JSON.parse(fs.readFileSync(path.join(directories.root, SETTINGS_FILE), 'utf8'))).toEqual({
            firstRun: false,
            v: 2,
        });
    });

    test('projection failure keeps DB revision and records a settings repair blocker', async () => {
        const root = makeRoot();
        const directories = createRouteDirectories(root);
        writeSettingsFile(directories, { firstRun: true });

        setCanonicalEnv({ enabled: true, reads: true, writes: true });
        const router = await loadSettingsRouter();
        const { db } = await seedSettingsDocument(directories, { firstRun: false, v: 1 });

        // Make projection fail: replace settings.json path with a directory.
        const settingsPath = path.join(directories.root, SETTINGS_FILE);
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

        expect(response.statusCode).toBe(500);
        expect(response.body).toEqual(expect.objectContaining({
            error: expect.stringMatching(/project/i),
            repairKey: expect.stringContaining('settings:'),
            settings_revision: 2,
        }));
        expect(getCanonicalSettingsDocument(db, { userId: 'alice' }).payload).toEqual({
            firstRun: false,
            v: 2,
        });
        expect(listOpenSettingsProjectionRepairs(db).length).toBe(1);
    });
    test('ignores top-level document revision field and only honors settings_revision', async () => {
        const root = makeRoot();
        const directories = createRouteDirectories(root);
        writeSettingsFile(directories, { firstRun: true });
        setCanonicalEnv({ enabled: true, reads: true, writes: true });
        const router = await loadSettingsRouter();
        await seedSettingsDocument(directories, { firstRun: false, v: 1 });

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

});

describe('canonical settings snapshots and rollback', () => {
    const envKeys = [
        'EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED',
        'EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SHADOWIMPORT',
        'EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_READS',
        'EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_WRITES',
        'EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_STRICT',
    ];

    function setCanonicalEnv({ enabled = true, shadowImport = true, reads = true, writes = true, strict = false } = {}) {
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED = String(enabled);
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SHADOWIMPORT = String(shadowImport);
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_READS = String(reads);
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_WRITES = String(writes);
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_STRICT = String(strict);
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
            expectedRevision: 0,
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
            expectedRevision: 1,
            nowMs: 4000,
        });
        expect(getCanonicalSettingsRevision(db, { userId: 'alice' })).toBe(2);

        const restore = await invokeRoute(router, '/restore-snapshot', {
            directories,
            body: { name: snap.name },
        });
        expect(restore.statusCode).toBe(204);
        const restored = getCanonicalSettingsDocument(db, { userId: 'alice' });
        expect(restored.payload).toEqual({ firstRun: false, v: 1 });
        expect(restored.revision).toBe(3); // new revision, not rewind
        expect(JSON.parse(fs.readFileSync(path.join(directories.root, SETTINGS_FILE), 'utf8'))).toEqual({
            firstRun: false,
            v: 1,
        });
    });

    test('open settings projection repairs block write rollback', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        runCanonicalMigrations(db, { nowMs: 1000 });
        recordSettingsProjectionRepair(db, {
            repairKey: 'settings:alice:projection',
            userId: 'alice',
            reason: 'projection_failed',
            details: { operation: 'save' },
            nowMs: 2000,
        });

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
        expect(blockers.ok).toBe(false);
        expect(blockers.blockers).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'open_settings_projection_repairs' }),
        ]));
    });
});
