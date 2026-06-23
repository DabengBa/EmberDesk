import { afterEach, describe, expect, jest, test } from '@jest/globals';
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
const { router, movingUiRouteOwner } = await import('../src/endpoints/moving-ui.js');

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

test('exports a Hono route owner that validates name and preserves save semantics', async () => {
    const directories = makeDirectories();

    const missingNameResponse = await movingUiRouteOwner.fetch(
        new Request('http://localhost/save', { method: 'POST' }),
        {
            parsedBody: {},
            user: { directories },
        },
    );

    expect(missingNameResponse.status).toBe(400);
    expect(await missingNameResponse.text()).toBe('Bad Request');
    expect(missingNameResponse.headers.get('content-type')).toBe('text/plain; charset=utf-8');

    const invalidNameResponse = await movingUiRouteOwner.fetch(
        new Request('http://localhost/save', { method: 'POST' }),
        {
            parsedBody: { name: 'CON' },
            user: { directories },
        },
    );

    expect(invalidNameResponse.status).toBe(400);
    expect(await invalidNameResponse.text()).toBe('Bad Request');

    const validBody = {
        name: 'alpha',
        theme: 'compact',
    };
    const validResponse = await movingUiRouteOwner.fetch(
        new Request('http://localhost/save', { method: 'POST' }),
        {
            parsedBody: validBody,
            user: { directories },
        },
    );

    expect(validResponse.status).toBe(200);
    expect(await validResponse.text()).toBe('OK');
    expect(validResponse.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(
        fs.readFileSync(path.join(directories.movingUI, 'alpha.json'), 'utf8'),
    ).toBe(JSON.stringify(validBody, null, 4));
    expect(invalidateDirectoryMock).toHaveBeenCalledWith(directories.movingUI);
});

test('keeps the moving-ui route island behind the existing login wall under Express', async () => {
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
