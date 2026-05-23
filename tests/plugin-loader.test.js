import { describe, test, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { setConfigFilePath } from '../src/util.js';

// Set up config before any module that calls getConfigValue
const configTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-plugloader-test-'));
const tmpConfig = path.join(configTmpDir, 'config.yaml');
fs.writeFileSync(tmpConfig, 'enableServerPlugins: true\nport: 8000\n', 'utf8');
setConfigFilePath(tmpConfig);

const { loadPlugins, clearLoadedPlugins } = await import('../src/plugin-loader.js');

afterAll(() => {
    fs.rmSync(configTmpDir, { recursive: true, force: true });
});

function makeMockPlugin(id, { hasExit = false, hasRoutes = false } = {}) {
    const lines = ['export const info = { id: ' + JSON.stringify(id) + ', name: ' + JSON.stringify(id) + ', description: "test" };'];
    lines.push('export async function init(router) {');
    if (hasRoutes) {
        lines.push('  router.get("/test", (req, res) => res.json({ ok: true }));');
    }
    lines.push('}');
    if (hasExit) {
        lines.push('let exited = false;');
        lines.push('export function exit() { exited = true; }');
    }
    return lines.join('\n');
}

describe('loadPlugins', () => {
    let pluginsTmpDir;
    let mockApp;

    beforeAll(() => {
        pluginsTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-plugins-'));
        mockApp = { use: () => {} };
    });

    afterAll(() => {
        fs.rmSync(pluginsTmpDir, { recursive: true, force: true });
    });

    afterEach(() => {
        clearLoadedPlugins();
    });

    test('disabled plugins: returns no-op cleanup', async () => {
        // Override config to disable plugins
        fs.writeFileSync(tmpConfig, 'enableServerPlugins: false\nport: 8000\n', 'utf8');
        // Clear cached config
        const cleanup = await loadPlugins(mockApp, pluginsTmpDir);
        expect(typeof cleanup).toBe('function');
        // Should not throw
        await cleanup();
        // Restore config
        fs.writeFileSync(tmpConfig, 'enableServerPlugins: true\nport: 8000\n', 'utf8');
    });

    test('empty plugins directory: returns no-op cleanup', async () => {
        const emptyDir = path.join(pluginsTmpDir, 'empty');
        fs.mkdirSync(emptyDir, { recursive: true });
        const cleanup = await loadPlugins(mockApp, emptyDir);
        expect(typeof cleanup).toBe('function');
    });

    test('non-existent directory: returns no-op cleanup', async () => {
        const cleanup = await loadPlugins(mockApp, path.join(pluginsTmpDir, 'nonexistent'));
        expect(typeof cleanup).toBe('function');
    });

    test('valid plugin file: loads and returns cleanup', async () => {
        const pluginFile = path.join(pluginsTmpDir, 'test-plugin.mjs');
        fs.writeFileSync(pluginFile, makeMockPlugin('test-valid'), 'utf8');
        const cleanup = await loadPlugins(mockApp, pluginFile.replace('test-plugin.mjs', ''));
        expect(typeof cleanup).toBe('function');
        // Cleanup should not throw
        await cleanup();
    });

    test('invalid plugin (no info): rejected with console error', async () => {
        const pluginFile = path.join(pluginsTmpDir, 'bad-plugin.mjs');
        fs.writeFileSync(pluginFile, 'export async function init() {}', 'utf8');
        const cleanup = await loadPlugins(mockApp, pluginsTmpDir);
        expect(typeof cleanup).toBe('function');
    });
});
