import { afterEach, expect, jest, test } from '@jest/globals';
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { setConfigFilePath } from '../src/util.js';

const invalidateDirectoryMock = jest.fn();

const configTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-moving-ui-config-'));
const configPath = path.join(configTmpDir, 'config.yaml');
fs.writeFileSync(configPath, 'enableUserAccounts: false\n', 'utf8');
setConfigFilePath(configPath);

jest.unstable_mockModule('../src/endpoints/settings-cache.js', () => ({
    invalidateDirectory: invalidateDirectoryMock,
}));

const { requireLoginMiddleware } = await import('../src/users.js');
const { router } = await import('../src/endpoints/moving-ui.js');

const tempRoots = [];

function makeDirectories() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-moving-ui-'));
    tempRoots.push(root);
    const directories = {
        root,
        movingUI: path.join(root, 'moving-ui'),
    };
    fs.mkdirSync(directories.movingUI, { recursive: true });
    return directories;
}

function listen(app) {
    const server = http.createServer(app);
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            resolve({
                server,
                url: `http://127.0.0.1:${address.port}`,
            });
        });
    });
}

async function usingApp(app, callback) {
    const { server, url } = await listen(app);
    try {
        return await callback(url);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
}

afterEach(() => {
    invalidateDirectoryMock.mockReset();
    for (const root of tempRoots.splice(0)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('uses an Express router without a second route framework or bridge', () => {
    const source = fs.readFileSync(
        new URL('../src/endpoints/moving-ui.js', import.meta.url),
        'utf8',
    );

    expect(source).not.toContain('from \'hono\'');
    expect(source).not.toContain('createHonoBridgeRequest');
    expect(source).not.toContain('sendHonoBridgeResponse');
    expect(source).not.toContain('movingUiRouteOwner');
});

test('keeps the moving-ui route behind the existing login wall under Express', async () => {
    const directories = makeDirectories();
    const app = express();

    app.use(express.json());
    app.use((request, _response, next) => {
        if (request.get('x-test-user')) {
            request.user = {
                profile: { handle: 'test-user' },
                directories,
            };
        }
        next();
    });
    app.get('/login', (_request, response) => response.type('text/plain').send('login'));
    app.use(requireLoginMiddleware);
    app.use('/api/moving-ui', router);

    await usingApp(app, async (url) => {
        const blocked = await fetch(`${url}/api/moving-ui/save`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: 'blocked' }),
        });
        expect(blocked.status).toBe(403);

        const missingName = await fetch(`${url}/api/moving-ui/save`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-test-user': '1',
            },
            body: JSON.stringify({ theme: 'compact' }),
        });
        expect(missingName.status).toBe(400);
        expect(await missingName.text()).toBe('Bad Request');
        expect(missingName.headers.get('content-type')).toBe('text/plain; charset=utf-8');

        const invalidName = await fetch(`${url}/api/moving-ui/save`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-test-user': '1',
            },
            body: JSON.stringify({ name: 'CON' }),
        });
        expect(invalidName.status).toBe(400);
        expect(await invalidName.text()).toBe('Bad Request');

        const saved = await fetch(`${url}/api/moving-ui/save`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-test-user': '1',
            },
            body: JSON.stringify({ name: 'safe-layout', theme: 'wide' }),
        });
        expect(saved.status).toBe(200);
        expect(await saved.text()).toBe('OK');
        expect(saved.headers.get('content-type')).toBe('text/plain; charset=utf-8');
        expect(
            fs.readFileSync(path.join(directories.movingUI, 'safe-layout.json'), 'utf8'),
        ).toBe(JSON.stringify({ name: 'safe-layout', theme: 'wide' }, null, 4));
        expect(invalidateDirectoryMock).toHaveBeenCalledWith(directories.movingUI);
    });
});
