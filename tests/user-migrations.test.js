import { describe, test, beforeAll, afterAll, jest } from '@jest/globals';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { setConfigFilePath } from '../src/util.js';

// The migration countdown delay is real seconds; stub only what the
// migration chain needs from util (the rest is not exercised here).
jest.unstable_mockModule('../src/util.js', () => ({
    color: { magenta: v => v, yellow: v => v, blue: v => v, green: v => v, red: v => v },
    delay: async () => {},
    setPermissionsSync: () => {},
    getConfigValue: (key, defaultValue) => defaultValue,
    setConfigFilePath: () => {},
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

    test('lands public/settings.json as an ephemeral settings.migrated.json', async () => {
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
        // The legacy file lands under the ephemeral name — never as a
        // contract settings.json that would look like a runtime artifact.
        expect(JSON.parse(fs.readFileSync(path.join(userRoot, 'settings.migrated.json'), 'utf8')))
            .toEqual({ marker: 'legacy' });
        expect(fs.existsSync(path.join(userRoot, 'settings.json'))).toBe(false);
        expect(fs.existsSync(path.join(publicDir, 'settings.json'))).toBe(false);
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
