import { describe, test, beforeAll, afterAll, jest } from '@jest/globals';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { setConfigFilePath } from '../src/util.js';

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

const { migratePublicOverrides, migrateUserData } = await import('../src/user-migrations.js');

afterAll(() => {
    fs.rmSync(configTmpDir, { recursive: true, force: true });
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
        const { getCanonicalSettingsDocument } = await import('../src/endpoints/settings-store.js');
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
        await migratePublicOverrides();
        await migratePublicOverrides();
    });
});
