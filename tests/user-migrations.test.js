import { describe, test, beforeAll, afterAll } from '@jest/globals';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { setConfigFilePath } from '../src/util.js';

// Set up config before any module that calls getConfigValue at top level
const configTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-mig-test-'));
const tmpConfig = path.join(configTmpDir, 'config.yaml');
fs.writeFileSync(tmpConfig, 'port: 8000\n', 'utf8');
setConfigFilePath(tmpConfig);

const { migratePublicOverrides } = await import('../src/user-migrations.js');

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

    test('idempotent: calling twice does not error', async () => {
        await migratePublicOverrides();
        await migratePublicOverrides();
    });
});
