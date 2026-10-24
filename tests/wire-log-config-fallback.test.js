/* global globalThis */
import { describe, test, expect } from '@jest/globals';
import express from 'express';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

import { setConfigFilePath } from '../src/util.js';

/**
 * The config route's fallback branch only runs when canonical storage is
 * frozen off, and `getConfigValue` caches the config on first read. So this
 * proof lives in its own process: `wire-log-route.test.js` launches it with a
 * `canonicalSqlite.enabled: false` config and asserts it passes.
 *
 * The claim: with no persisted `feature_settings.wire_log` and canonical
 * storage unavailable, the viewer must still be told that logging is on and
 * that records auto-clear after 48 hours — never that cleanup is off.
 */

const configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-wire-log-fallback-config-'));
const configPath = path.join(configRoot, 'config.yaml');
fs.writeFileSync(
    configPath,
    'port: 8000\nfeatures:\n  storage:\n    canonicalSqlite:\n      enabled: false\n',
    'utf8',
);
setConfigFilePath(configPath);
globalThis.COMMAND_LINE_ARGS = {};

const { router: wireLogRouter } = await import('../src/endpoints/wire-log.js');

function makeDirectories() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-wire-log-fallback-'));
    const directories = {
        root,
        storage: path.join(root, 'storage'),
        backups: path.join(root, 'backups'),
        openAI_Settings: path.join(root, 'OpenAI Settings'),
        worlds: path.join(root, 'worlds'),
    };
    for (const directory of Object.values(directories)) {
        fs.mkdirSync(directory, { recursive: true });
    }
    return { root, directories };
}

function createApp(directories) {
    const app = express();
    app.use(express.json());
    app.use((request, _response, next) => {
        request.user = { profile: { handle: 'fallback-user' }, handle: 'fallback-user', directories };
        next();
    });
    app.use('/api/wire-logs', wireLogRouter);
    return app;
}

function listen(app) {
    const server = http.createServer(app);
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            resolve({ server, url: `http://127.0.0.1:${server.address().port}` });
        });
    });
}

describe('GET /api/wire-logs/config without canonical storage', () => {
    test('still promises logging on and the 48h auto-clear window', async () => {
        const { root, directories } = makeDirectories();
        const { server, url } = await listen(createApp(directories));

        try {
            const body = await (await fetch(`${url}/api/wire-logs/config`)).json();
            // Opt-out default: an unreadable settings document means "on".
            expect(body.enabled).toBe(true);
            // 48h auto-clear is default-on, so the fallback keeps it.
            expect(body.retentionDays).toBe(2);
            expect(body.maxFileBytes).toBe(2 * 1024 * 1024);
            // The viewer can still tell "stored" from "defaulted".
            expect(body.persisted).toBe(false);
            expect(typeof body.reason).toBe('string');
        } finally {
            await new Promise(resolve => server.close(resolve));
            fs.rmSync(root, { recursive: true, force: true });
            fs.rmSync(configRoot, { recursive: true, force: true });
        }
    });
});
