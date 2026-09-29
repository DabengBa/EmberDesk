import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';

import { setConfigFilePath } from '../src/util.js';
import { canonicalSqliteManager } from '../src/canonical-sqlite.js';
import {
    ensureCanonicalSliceBackend,
    resetCanonicalBackendsForTests,
} from '../src/canonical-backend.js';
import {
    getCanonicalSettingsDocument,
    upsertCanonicalSettingsDocument,
} from '../src/endpoints/settings-store.js';
import {
    getPersistedCanonicalAuditStatus,
    invalidateCanonicalAuditStatus,
} from '../src/canonical-sqlite-shadow-import.js';
import { SETTINGS_AUDIT_SCOPE } from '../src/canonical-settings-shadow-import.js';
import { SETTINGS_FILE } from '../src/constants.js';

const roots = [];
const configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-canonical-backend-config-'));
const configPath = path.join(configRoot, 'config.yaml');
fs.writeFileSync(configPath, 'port: 8000\n', 'utf8');
setConfigFilePath(configPath);

const envKeys = [
    'EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED',
    'EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SHADOWIMPORT',
    'EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_READS',
    'EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_WRITES',
    'EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_STRICT',
    'EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SLICES_CHATS_READS',
    'EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SLICES_SETTINGS_PROJECTION',
];

function clearCanonicalEnv() {
    for (const key of envKeys) {
        delete process.env[key];
    }
}

function makeRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-canonical-backend-'));
    roots.push(root);
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

function writeSettingsFile(directories, payload) {
    fs.writeFileSync(path.join(directories.root, SETTINGS_FILE), JSON.stringify(payload), 'utf8');
}

beforeEach(() => {
    clearCanonicalEnv();
    resetCanonicalBackendsForTests();
});

afterEach(() => {
    clearCanonicalEnv();
    resetCanonicalBackendsForTests();
    canonicalSqliteManager.dispose();
    for (const root of roots.splice(0)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

describe('canonical sqlite flag defaults', () => {
    test('resolve enabled with reads/writes/shadowImport on and strict off', async () => {
        const { getCanonicalSqliteFeatureFlags } = await import('../src/storage-feature-flags.js');
        expect(getCanonicalSqliteFeatureFlags()).toEqual({
            enabled: true,
            shadowImport: true,
            reads: true,
            writes: true,
            chatStats: true,
            strict: false,
        });
    });

    test('every registered slice inherits the enabled defaults', async () => {
        const { getDefaultCanonicalStorageSliceRegistry } = await import('../src/canonical-storage-slice-registry.js');
        const registry = getDefaultCanonicalStorageSliceRegistry();
        for (const key of ['characters', 'world_info', 'settings', 'secrets', 'managed_media', 'chats']) {
            const flags = registry.get(key).getFeatureFlags();
            expect(flags.enabled).toBe(true);
            expect(flags.shadowImport).toBe(true);
            expect(flags.reads).toBe(true);
            expect(flags.writes).toBe(true);
            expect(flags.strict).toBe(false);
        }
    });

    test('per-slice overrides still win over the enabled defaults', async () => {
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SLICES_CHATS_READS = 'false';
        const { getDefaultCanonicalStorageSliceRegistry } = await import('../src/canonical-storage-slice-registry.js');
        const registry = getDefaultCanonicalStorageSliceRegistry();
        expect(registry.get('chats').getFeatureFlags().reads).toBe(false);
        expect(registry.get('chats').getFeatureFlags().writes).toBe(true);
        expect(registry.get('settings').getFeatureFlags().reads).toBe(true);
    });
});

describe('legacy canonical sqlite config migration', () => {
    test('strips the untouched all-false rollout block so defaults turn on', async () => {
        const { addMissingConfigValues } = await import('../src/config-init.js');
        const root = makeRoot();
        const target = path.join(root, 'config.yaml');
        fs.writeFileSync(target, [
            'port: 8000',
            'features:',
            '  storage:',
            '    canonicalSqlite:',
            '      enabled: false',
            '      shadowImport: false',
            '      reads: false',
            '      writes: false',
            '      chatStats: false',
            '      strict: false',
            '      slices:',
            '        managedMedia:',
            '          enabled: false',
            '          shadowImport: false',
            '          reads: false',
            '          writes: false',
            '          strict: false',
        ].join('\n'), 'utf8');

        addMissingConfigValues(target);

        const migrated = (await import('yaml')).parse(fs.readFileSync(target, 'utf8'));
        expect(migrated.features.storage.canonicalSqlite).toEqual({
            enabled: true,
            shadowImport: true,
            reads: true,
            writes: true,
            chatStats: true,
            strict: false,
            slices: {
                secrets: {
                    projection: 'off',
                },
                settings: {
                    projection: 'off',
                },
                world_info: {
                    projection: 'off',
                },
                chats: {
                    projection: 'off',
                },
                managed_media: {
                    projection: 'off',
                },
                characters: {
                    projection: 'off',
                },
            },
        });
    });

    test('keeps a customized canonical block instead of overwriting user choice', async () => {
        const { addMissingConfigValues } = await import('../src/config-init.js');
        const root = makeRoot();
        const target = path.join(root, 'config.yaml');
        fs.writeFileSync(target, [
            'port: 8000',
            'features:',
            '  storage:',
            '    canonicalSqlite:',
            '      enabled: true',
            '      shadowImport: true',
            '      reads: false',
            '      writes: false',
            '      chatStats: false',
            '      strict: false',
        ].join('\n'), 'utf8');

        addMissingConfigValues(target);

        const migrated = (await import('yaml')).parse(fs.readFileSync(target, 'utf8'));
        expect(migrated.features.storage.canonicalSqlite.reads).toBe(false);
        expect(migrated.features.storage.canonicalSqlite.writes).toBe(false);
    });
});

describe('lazy slice backend initialization', () => {
    test('shadow-imports the settings file on first touch when the audit is missing', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        writeSettingsFile(directories, { firstRun: true, marker: 'file' });

        const init = await ensureCanonicalSliceBackend('settings', directories, 'alice');

        expect(init.ok).toBe(true);
        expect(init.auditResult.blocking).toBe(false);
        expect(getCanonicalSettingsDocument(init.db, { userId: 'alice' }).payload).toEqual({
            firstRun: true,
            marker: 'file',
        });
        expect(getPersistedCanonicalAuditStatus(init.db, { scope: SETTINGS_AUDIT_SCOPE }).blocking).toBe(false);
    });

    test('does not re-import when a completed audit already exists', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        writeSettingsFile(directories, { firstRun: true, marker: 'canonical' });
        const first = await ensureCanonicalSliceBackend('settings', directories, 'alice');
        expect(first.ok).toBe(true);

        // Out-of-band file change after a clean audit must not win over the DB.
        writeSettingsFile(directories, { firstRun: true, marker: 'external' });
        resetCanonicalBackendsForTests();
        const second = await ensureCanonicalSliceBackend('settings', directories, 'alice');

        expect(second.ok).toBe(true);
        expect(second.importResult).toBeUndefined();
        expect(getCanonicalSettingsDocument(second.db, { userId: 'alice' }).payload).toEqual({
            firstRun: true,
            marker: 'canonical',
        });
    });

    test('re-imports when a file-side write marked the audit stale', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        writeSettingsFile(directories, { firstRun: true, marker: 'v1' });
        const first = await ensureCanonicalSliceBackend('settings', directories, 'alice');
        expect(first.ok).toBe(true);

        writeSettingsFile(directories, { firstRun: true, marker: 'v2' });
        invalidateCanonicalAuditStatus(first.db, {
            scope: SETTINGS_AUDIT_SCOPE,
            handle: 'alice',
            reason: 'audit_stale_after_settings_file_write',
            source: 'test',
        });
        resetCanonicalBackendsForTests();
        const second = await ensureCanonicalSliceBackend('settings', directories, 'alice');

        expect(second.ok).toBe(true);
        expect(getCanonicalSettingsDocument(second.db, { userId: 'alice' }).payload).toEqual({
            firstRun: true,
            marker: 'v2',
        });
    });

    test('re-audits without re-importing when a projection failure marked the DB ahead', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        // DB-ahead drift is only blocking while the file is still a projection.
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SLICES_SETTINGS_PROJECTION = 'sync';
        writeSettingsFile(directories, { firstRun: true, marker: 'stale-file' });
        const first = await ensureCanonicalSliceBackend('settings', directories, 'alice');
        expect(first.ok).toBe(true);

        // DB moved ahead of the (stale) file projection.
        upsertCanonicalSettingsDocument(first.db, {
            userId: 'alice',
            payload: { firstRun: true, marker: 'canonical-v2' },
            expectedRevision: 1,
        });
        invalidateCanonicalAuditStatus(first.db, {
            scope: SETTINGS_AUDIT_SCOPE,
            handle: 'alice',
            reason: 'audit_stale_after_settings_projection_failure',
            source: 'test',
        });
        resetCanonicalBackendsForTests();
        const second = await ensureCanonicalSliceBackend('settings', directories, 'alice');

        expect(second.ok).toBe(true);
        // The committed DB revision survives; the stale file is not re-imported.
        const doc = getCanonicalSettingsDocument(second.db, { userId: 'alice' });
        expect(doc.payload).toEqual({ firstRun: true, marker: 'canonical-v2' });
        expect(doc.revision).toBe(2);
        // The fresh audit re-verifies the drift and stays blocking for repair.
        expect(getPersistedCanonicalAuditStatus(second.db, { scope: SETTINGS_AUDIT_SCOPE }).blocking).toBe(true);
    });

    test('leaves a real drift verdict blocking instead of importing over it', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        // This scenario verifies sync-projection repair blocking; pin it so the
        // slice default ('off') does not suppress the file-side drift.
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SLICES_SETTINGS_PROJECTION = 'sync';
        writeSettingsFile(directories, { firstRun: true, marker: 'file' });
        const first = await ensureCanonicalSliceBackend('settings', directories, 'alice');
        expect(first.ok).toBe(true);

        const { persistCanonicalAuditStatus } = await import('../src/canonical-sqlite-shadow-import.js');
        persistCanonicalAuditStatus(first.db, {
            ok: false,
            handle: 'alice',
            hasDrift: true,
            blocking: true,
            reason: 'audit_drift_blocked',
            entries: [{ status: 'drift' }],
        }, { scope: SETTINGS_AUDIT_SCOPE });
        resetCanonicalBackendsForTests();
        const second = await ensureCanonicalSliceBackend('settings', directories, 'alice');

        expect(second.ok).toBe(true);
        expect(second.importResult).toBeUndefined();
        expect(second.auditResult.blocking).toBe(true);
        expect(second.auditResult.reason).toBe('audit_drift_blocked');
    });
});
