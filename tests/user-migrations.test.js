import { describe, test, beforeAll, afterAll, jest } from '@jest/globals';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { setConfigFilePath } from '../src/util.js';

const overrideServerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-mig-server-'));
jest.unstable_mockModule('../src/server-directory.js', () => ({ serverDirectory: overrideServerDir }));

// The migration countdown delay is real seconds; stub the util surface the
// migration chain touches. isPathUnderParent/uuidv4 get faithful stand-ins
// because canonical helpers (resolveCanonicalDatabasePath, upsert) use them.
jest.unstable_mockModule('../src/util.js', () => ({
    color: { magenta: v => v, yellow: v => v, blue: v => v, green: v => v, red: v => v },
    delay: async () => {},
    setPermissionsSync: () => {},
    getConfigValue: (key, defaultValue) => defaultValue,
    setConfigFilePath: () => {},
    isPathUnderParent: (parentPath, childPath) => {
        const relativePath = path.relative(path.normalize(parentPath), path.normalize(childPath));
        return relativePath !== '..' && !relativePath.startsWith('..' + path.sep) && !path.isAbsolute(relativePath);
    },
    uuidv4: () => crypto.randomUUID(),
}));

// Set up config before any module that calls getConfigValue at top level
const configTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-mig-test-'));
const tmpConfig = path.join(configTmpDir, 'config.yaml');
fs.writeFileSync(tmpConfig, 'port: 8000\n', 'utf8');
setConfigFilePath(tmpConfig);

const { migratePublicOverrides, migrateUserData } = await import('../src/user-migrations.ts');

afterAll(() => {
    fs.rmSync(configTmpDir, { recursive: true, force: true });
    fs.rmSync(overrideServerDir, { recursive: true, force: true });
});

describe('migratePublicOverrides', () => {
    let dataTmpDir;
    let origDataRoot;

    beforeAll(() => {
        dataTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-mig-data-'));
        origDataRoot = globalThis.DATA_ROOT;
        globalThis.DATA_ROOT = dataTmpDir;
    });

    afterAll(() => {
        globalThis.DATA_ROOT = origDataRoot;
        fs.rmSync(dataTmpDir, { recursive: true, force: true });
    });

    test('imports public/settings.json straight into canonical storage', async () => {
        const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-mig-userdata-'));
        const publicDir = path.join(sandbox, 'public');
        fs.mkdirSync(path.join(publicDir, 'characters'), { recursive: true });
        fs.writeFileSync(path.join(publicDir, 'settings.json'), JSON.stringify({ marker: 'legacy' }), 'utf8');

        const previousCwd = process.cwd();
        process.chdir(sandbox);
        try {
            await migrateUserData();
        } finally {
            process.chdir(previousCwd);
        }

        const userRoot = path.join(dataTmpDir, 'default-user');
        // No settings-named file lands in the user directory — the payload is
        // a canonical document instead.
        expect(fs.existsSync(path.join(userRoot, 'settings.json'))).toBe(false);
        expect(fs.existsSync(path.join(userRoot, 'settings.migrated.json'))).toBe(false);
        expect(fs.existsSync(path.join(publicDir, 'settings.json'))).toBe(false);

        const { DatabaseSync } = await import('node:sqlite');
        const { getCanonicalSettingsDocument } = await import('../src/endpoints/settings-store.ts');
        const db = new DatabaseSync(path.join(userRoot, 'storage', 'emberdesk.sqlite'));
        try {
            const document = getCanonicalSettingsDocument(db, { userId: 'default-user' });
            expect(document.payload).toEqual({ marker: 'legacy' });
            expect(document.revision).toBe(1);
        } finally {
            db.close();
        }

        // The migration backup copy of the source is preserved.
        const today = new Date().toISOString().split('T')[0];
        expect(fs.existsSync(path.join(sandbox, 'backups', '_migration', today, 'settings.json'))).toBe(true);
        fs.rmSync(sandbox, { recursive: true, force: true });
    });

    test('idempotent: calling twice does not error', async () => {
        const source = path.join(overrideServerDir, 'public', 'css', 'user.css');
        const target = path.join(dataTmpDir, '_css', 'user.css');
        fs.mkdirSync(path.dirname(source), { recursive: true });
        fs.writeFileSync(source, 'legacy');
        await migratePublicOverrides();
        expect(fs.readFileSync(target, 'utf8')).toBe('legacy');
        expect(fs.existsSync(source)).toBe(false);
        fs.writeFileSync(source, 'new-source');
        await migratePublicOverrides();
        expect(fs.readFileSync(target, 'utf8')).toBe('legacy');
        expect(fs.readFileSync(source, 'utf8')).toBe('new-source');
    });

    test('keeps existing canonical settings when legacy settings are imported', async () => {
        const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-mig-existing-'));
        const publicDir = path.join(sandbox, 'public');
        fs.mkdirSync(path.join(publicDir, 'characters'), { recursive: true });
        fs.writeFileSync(path.join(publicDir, 'settings.json'), JSON.stringify({ marker: 'should-not-overwrite' }));
        const previousCwd = process.cwd();
        try {
            const { DatabaseSync } = await import('node:sqlite');
            const { runCanonicalMigrations } = await import('../src/canonical-sqlite-migrations.js');
            const { getCanonicalSettingsDocument, upsertCanonicalSettingsDocument } = await import('../src/endpoints/settings-store.ts');
            const dbPath = path.join(dataTmpDir, 'default-user', 'storage', 'emberdesk.sqlite');
            fs.mkdirSync(path.dirname(dbPath), { recursive: true });
            const initial = new DatabaseSync(dbPath);
            let revision;
            try {
                expect(runCanonicalMigrations(initial).ok).toBe(true);
                const previous = getCanonicalSettingsDocument(initial, { userId: 'default-user' });
                const result = upsertCanonicalSettingsDocument(initial, { userId: 'default-user', payload: { marker: 'existing' }, expectedRevision: previous?.revision ?? 0 });
                expect(result.ok).toBe(true);
                revision = result.revision;
                expect(getCanonicalSettingsDocument(initial, { userId: 'default-user' }).revision).toBe(result.revision);
            } finally {
                initial.close();
            }
            process.chdir(sandbox);
            await migrateUserData();
            const db = new DatabaseSync(dbPath);
            try {
                const document = getCanonicalSettingsDocument(db, { userId: 'default-user' });
                expect(document.payload).toEqual({ marker: 'existing' });
                expect(document.revision).toBe(revision);
            } finally {
                db.close();
            }
        } finally {
            process.chdir(previousCwd);
            fs.rmSync(sandbox, { recursive: true, force: true });
        }
    });

    test('leaves invalid legacy settings in place after migration failure', async () => {
        const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-mig-invalid-'));
        const publicDir = path.join(sandbox, 'public');
        fs.mkdirSync(path.join(publicDir, 'characters'), { recursive: true });
        const source = path.join(publicDir, 'settings.json');
        fs.writeFileSync(source, 'not-json');
        const previousCwd = process.cwd();
        try {
            process.chdir(sandbox);
            await migrateUserData();
            expect(fs.readFileSync(source, 'utf8')).toBe('not-json');
        } finally {
            process.chdir(previousCwd);
            fs.rmSync(sandbox, { recursive: true, force: true });
        }
    });

    test('leaves settings source in place when its backup fails', async () => {
        const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-mig-backup-'));
        const publicDir = path.join(sandbox, 'public');
        fs.mkdirSync(path.join(publicDir, 'characters'), { recursive: true });
        const source = path.join(publicDir, 'settings.json');
        fs.writeFileSync(source, JSON.stringify({ marker: 'source' }));
        const previousCwd = process.cwd();
        const copy = fs.cpSync;
        const spy = jest.spyOn(fs, 'cpSync').mockImplementation((from, to, options) => {
            if (from === source) throw new Error('backup failed');
            return copy(from, to, options);
        });
        try {
            process.chdir(sandbox);
            await migrateUserData();
            expect(spy.mock.calls.some(([from]) => from === source)).toBe(true);
            expect(JSON.parse(fs.readFileSync(source, 'utf8'))).toEqual({ marker: 'source' });
        } finally {
            spy.mockRestore();
            process.chdir(previousCwd);
            fs.rmSync(sandbox, { recursive: true, force: true });
        }
    });

    test('blocks startup with an offline recovery procedure even on already upgraded installations', async () => {
        const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-mig-worlds-'));
        const publicDir = path.join(sandbox, 'public');
        const userRoot = path.join(dataTmpDir, 'default-user');
        fs.rmSync(userRoot, { recursive: true, force: true });
        fs.mkdirSync(path.join(publicDir, 'characters'), { recursive: true });
        fs.mkdirSync(path.join(publicDir, 'worlds'), { recursive: true });
        fs.mkdirSync(path.join(userRoot, 'worlds'), { recursive: true });
        fs.writeFileSync(path.join(publicDir, 'characters', 'legacy.png'), 'character');
        fs.writeFileSync(path.join(publicDir, 'worlds', 'Book.json'), 'legacy');
        fs.writeFileSync(path.join(userRoot, 'worlds', 'Book.json'), 'current');
        const cwd = process.cwd();
        process.chdir(sandbox);
        try {
            await expect(migrateUserData()).rejects.toThrow(/stop.*move.*public.*worlds/i);
            expect(fs.readFileSync(path.join(publicDir, 'worlds', 'Book.json'), 'utf8')).toBe('legacy');
            expect(fs.readFileSync(path.join(userRoot, 'worlds', 'Book.json'), 'utf8')).toBe('current');
            fs.rmSync(path.join(publicDir, 'characters'), { recursive: true });
            await expect(migrateUserData()).rejects.toThrow(/stop.*move.*public.*worlds/i);
        } finally {
            process.chdir(cwd);
            fs.rmSync(sandbox, { recursive: true, force: true });
            fs.rmSync(userRoot, { recursive: true, force: true });
        }
    });
});
