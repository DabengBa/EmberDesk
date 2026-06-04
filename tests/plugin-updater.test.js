import { describe, test, beforeAll, afterAll } from '@jest/globals';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { setConfigFilePath } from '../src/util.js';

const configTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-plugin-test-'));
const tmpConfig = path.join(configTmpDir, 'config.yaml');
fs.writeFileSync(tmpConfig, 'port: 8000\n', 'utf8');
setConfigFilePath(tmpConfig);

const { updatePlugins } = await import('../src/plugin-updater.js');

afterAll(() => {
    fs.rmSync(configTmpDir, { recursive: true, force: true });
});

describe('updatePlugins', () => {
    let pluginsTmpDir;

    beforeAll(() => {
        pluginsTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-plugins-'));
    });

    afterAll(() => {
        fs.rmSync(pluginsTmpDir, { recursive: true, force: true });
    });

    test('autoUpdate false: no-op, no error', async () => {
        await updatePlugins(pluginsTmpDir, { autoUpdate: false });
    });

    test('empty plugins directory: no-op, no error', async () => {
        await updatePlugins(pluginsTmpDir, { autoUpdate: true });
    });

    test('non-git directory: skips gracefully', async () => {
        const nonGitDir = path.join(pluginsTmpDir, 'my-plugin');
        fs.mkdirSync(nonGitDir);
        fs.writeFileSync(path.join(nonGitDir, 'index.js'), 'module.exports = {};', 'utf8');
        await updatePlugins(pluginsTmpDir, { autoUpdate: true });
    });
});
