import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, jest, test } from '@jest/globals';

import { createCanonicalSqliteManager } from '../src/canonical-sqlite.js';
import { CANONICAL_SQLITE_MIGRATIONS, runCanonicalMigrations } from '../src/canonical-sqlite-migrations.js';
import {
    getCanonicalSecretRecords,
    listOpenSecretProjectionRepairs,
    writeCanonicalSecret,
} from '../src/endpoints/canonical-secrets-store.js';
import {
    CANONICAL_SECRETS_AUDIT_SCOPE,
    auditCanonicalSecretsShadowImport,
    runCanonicalSecretsShadowImport,
} from '../src/canonical-secrets-shadow-import.js';
import { getPersistedCanonicalAuditStatus } from '../src/canonical-sqlite-shadow-import.js';
import { runCanonicalSliceRepair } from '../src/canonical-sqlite-operator.js';

const tempRoots = [];
const managers = [];
const canary = 'canonical-secrets-canary-do-not-leak';
const canonicalEnvKeys = [
    'EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED',
    'EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SHADOWIMPORT',
    'EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_READS',
    'EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_WRITES',
    'EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_STRICT',
];

function makeRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-canonical-secrets-'));
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

function createManager() {
    const manager = createCanonicalSqliteManager({
        logger: {
            info: jest.fn(),
            warn: jest.fn(),
        },
    });
    managers.push(manager);
    return manager;
}

function writeSecretsFile(directories, payload) {
    fs.writeFileSync(path.join(directories.root, 'secrets.json'), JSON.stringify(payload, null, 4), 'utf8');
}

function setCanonicalEnv({ enabled = true, shadowImport = true, reads = true, writes = true, strict = false } = {}) {
    process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED = String(enabled);
    process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SHADOWIMPORT = String(shadowImport);
    process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_READS = String(reads);
    process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_WRITES = String(writes);
    process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_STRICT = String(strict);
}

afterEach(async () => {
    for (const key of canonicalEnvKeys) {
        delete process.env[key];
    }
    try {
        const { canonicalSqliteManager } = await import('../src/canonical-sqlite.js');
        canonicalSqliteManager.dispose();
    } catch {
        // Ignore disposal failures from tests that never load the singleton.
    }
    for (const manager of managers.splice(0, managers.length)) {
        manager.dispose();
    }
    for (const root of tempRoots.splice(0, tempRoots.length)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

describe('canonical secrets store', () => {
    test('migrates flat and array secrets idempotently while preserving record IDs and active state', () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();

        writeSecretsFile(directories, {
            api_key_openai: [
                { id: 'openai-old', value: `${canary}-old`, label: 'Old', active: false },
                { id: 'openai-active', value: `${canary}-active`, label: 'Active', active: true },
            ],
            api_key_custom: `${canary}-custom`,
        });

        const first = runCanonicalSecretsShadowImport({
            handle: 'alice',
            directories,
            featureFlags: {
                enabled: true,
                shadowImport: true,
                reads: false,
                strict: false,
            },
            manager,
            nowMs: 1735689600000,
        });
        const second = runCanonicalSecretsShadowImport({
            handle: 'alice',
            directories,
            featureFlags: {
                enabled: true,
                shadowImport: true,
                reads: false,
                strict: false,
            },
            manager,
            nowMs: 1735689601000,
        });

        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        expect(CANONICAL_SQLITE_MIGRATIONS.map(migration => migration.version)).toEqual([1, 2, 3, 4, 5]);
        expect(first).toEqual(expect.objectContaining({
            ok: true,
            importedCount: 2,
            failedCount: 0,
        }));
        expect(second).toEqual(expect.objectContaining({
            ok: true,
            unchangedCount: 2,
            failedCount: 0,
        }));
        expect(getCanonicalSecretRecords(db, 'api_key_openai')).toEqual([
            expect.objectContaining({ id: 'openai-old', label: 'Old', active: false }),
            expect.objectContaining({ id: 'openai-active', label: 'Active', active: true }),
        ]);
        expect(getCanonicalSecretRecords(db, 'api_key_custom')).toEqual([
            expect.objectContaining({ label: 'api_key_custom', active: true }),
        ]);
        expect(db.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?').get('table', 'secret_records')).toBeTruthy();
        expect(db.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?').get('table', 'secret_projection_repairs')).toBeTruthy();
    });

    test('audits DB/file drift without returning secret plaintext and persists a scoped clean status', () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        writeSecretsFile(directories, {
            api_key_openai: [{ id: 'openai-active', value: canary, label: 'Active', active: true }],
        });

        runCanonicalSecretsShadowImport({
            handle: 'alice',
            directories,
            featureFlags: {
                enabled: true,
                shadowImport: true,
                reads: false,
                strict: false,
            },
            manager,
            nowMs: 1735689600000,
        });
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        const cleanAudit = auditCanonicalSecretsShadowImport({
            handle: 'alice',
            directories,
            db,
            auditedAtMs: 1735689601000,
        });
        expect(getPersistedCanonicalAuditStatus(db, { scope: CANONICAL_SECRETS_AUDIT_SCOPE })).toEqual(expect.objectContaining({
            ok: true,
            blocking: false,
        }));
        writeSecretsFile(directories, {
            api_key_openai: [{ id: 'openai-active', value: `${canary}-changed`, label: 'Active', active: true }],
        });
        const driftAudit = auditCanonicalSecretsShadowImport({
            handle: 'alice',
            directories,
            db,
            auditedAtMs: 1735689602000,
        });
        const serialized = JSON.stringify(driftAudit);

        expect(cleanAudit).toEqual(expect.objectContaining({
            ok: true,
            blocking: false,
        }));
        expect(driftAudit).toEqual(expect.objectContaining({
            ok: false,
            blocking: true,
            reason: 'audit_drift_blocked',
        }));
        expect(serialized).not.toContain(canary);
        expect(serialized).toContain('value_hash_mismatch');
    });

    test('writes and rotates canonical secrets transactionally with one active record per key', () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        runCanonicalMigrations(db, { nowMs: 1735689600000 });

        const firstId = writeCanonicalSecret(db, {
            key: 'api_key_openai',
            value: `${canary}-first`,
            label: 'First',
            id: 'first',
            nowMs: 1735689601000,
        });
        const secondId = writeCanonicalSecret(db, {
            key: 'api_key_openai',
            value: `${canary}-second`,
            label: 'Second',
            id: 'second',
            nowMs: 1735689602000,
        });

        expect(firstId).toBe('first');
        expect(secondId).toBe('second');
        expect(getCanonicalSecretRecords(db, 'api_key_openai')).toEqual([
            expect.objectContaining({ id: 'first', active: false }),
            expect.objectContaining({ id: 'second', active: true }),
        ]);
        expect(listOpenSecretProjectionRepairs(db)).toEqual([]);
        expect(() => db.prepare(`
            INSERT INTO secret_records (id, secret_key, value, label, active, created_at_ms, updated_at_ms)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run('invalid-second-active', 'api_key_openai', 'x', 'Invalid', 1, 1, 1)).toThrow();
    });

    test('keeps the SecretManager API DB-first while projecting the compatibility file', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        writeSecretsFile(directories, {
            api_key_openai: [
                { id: 'seed', value: `${canary}-seed`, label: 'Seed', active: true },
            ],
            _migrated: [],
        });
        setCanonicalEnv();

        jest.resetModules();
        const { setConfigFilePath } = await import('../src/util.js');
        setConfigFilePath(fileURLToPath(new URL('../default/config.yaml', import.meta.url)));
        const { SecretManager } = await import(`../src/endpoints/secrets.js?canonicalSecrets=${Date.now()}-${Math.random()}`);
        const { canonicalSqliteManager } = await import('../src/canonical-sqlite.js');
        const secretManager = new SecretManager(directories);

        expect(secretManager.readSecret('api_key_openai')).toBe(`${canary}-seed`);
        const secondId = secretManager.writeSecret('api_key_openai', `${canary}-second`, 'Second');
        secretManager.renameSecret('api_key_openai', 'seed', 'Renamed seed');
        secretManager.rotateSecret('api_key_openai', 'seed');
        secretManager.deleteSecret('api_key_openai', secondId);

        const db = canonicalSqliteManager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        const canonicalRecords = getCanonicalSecretRecords(db, 'api_key_openai');
        const projected = JSON.parse(fs.readFileSync(path.join(directories.root, 'secrets.json'), 'utf8'));
        const state = secretManager.getSecretState();

        expect(canonicalRecords).toEqual([
            expect.objectContaining({
                id: 'seed',
                label: 'Renamed seed',
                active: true,
                value: `${canary}-seed`,
            }),
        ]);
        expect(projected.api_key_openai).toEqual([
            expect.objectContaining({
                id: 'seed',
                label: 'Renamed seed',
                active: true,
                value: `${canary}-seed`,
            }),
        ]);
        expect(state.api_key_openai).toEqual([
            expect.objectContaining({
                id: 'seed',
                label: 'Renamed seed',
                active: true,
                value: expect.not.stringContaining(canary),
            }),
        ]);
    });

    test('keeps DB authority after projection failure and repairs without leaking secret values', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        writeSecretsFile(directories, {
            api_key_openai: [
                { id: 'seed', value: `${canary}-seed`, label: 'Seed', active: true },
            ],
            _migrated: [],
        });
        setCanonicalEnv();

        jest.resetModules();
        const { setConfigFilePath } = await import('../src/util.js');
        setConfigFilePath(fileURLToPath(new URL('../default/config.yaml', import.meta.url)));
        const { SecretManager } = await import(`../src/endpoints/secrets.js?canonicalRepair=${Date.now()}-${Math.random()}`);
        const { canonicalSqliteManager } = await import('../src/canonical-sqlite.js');
        const secretManager = new SecretManager(directories);
        expect(secretManager.readSecret('api_key_openai')).toBe(`${canary}-seed`);

        const secretsPath = path.join(directories.root, 'secrets.json');
        fs.rmSync(secretsPath, { force: true });
        fs.mkdirSync(secretsPath);
        expect(() => secretManager.writeSecret(
            'api_key_openai',
            `${canary}-committed`,
            'Committed despite projection failure',
        )).toThrow();

        const db = canonicalSqliteManager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        const committed = getCanonicalSecretRecords(db, 'api_key_openai')
            .find(record => record.active);
        const repairs = listOpenSecretProjectionRepairs(db);
        expect(committed).toEqual(expect.objectContaining({
            value: `${canary}-committed`,
            label: 'Committed despite projection failure',
        }));
        expect(secretManager.readSecret('api_key_openai')).toBe(`${canary}-committed`);
        expect(repairs).toEqual([
            expect.objectContaining({
                key: 'api_key_openai',
                operation: 'write',
                errorClass: expect.any(String),
            }),
        ]);
        expect(JSON.stringify(repairs)).not.toContain(canary);
        expect(() => secretManager.writeSecret('api_key_openai', `${canary}-blocked`, 'Blocked')).toThrow(
            /canonical secrets writes blocked/i,
        );

        fs.rmSync(secretsPath, { recursive: true, force: true });
        const repaired = await runCanonicalSliceRepair({
            sliceKey: 'secrets',
            db,
            directories,
        });
        const projected = fs.readFileSync(secretsPath, 'utf8');

        expect(repaired).toEqual(expect.objectContaining({
            ok: true,
            sliceKey: 'secrets',
            results: [
                expect.objectContaining({
                    status: 'repaired',
                }),
            ],
        }));
        expect(listOpenSecretProjectionRepairs(db)).toEqual([]);
        expect(projected).toContain(`${canary}-committed`);
        expect(JSON.stringify(repaired)).not.toContain(canary);
    });
});
