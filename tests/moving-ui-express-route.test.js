import { expect, jest, test } from '@jest/globals';
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { setConfigFilePath } from '../src/util.js';

const configTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-moving-ui-config-'));
const configPath = path.join(configTmpDir, 'config.yaml');
fs.writeFileSync(configPath, 'enableUserAccounts: false\n', 'utf8');
setConfigFilePath(configPath);

const { requireLoginMiddleware } = await import('../src/users.js');
const { router, getMovingUiRetiredBody } = await import('../src/endpoints/moving-ui.js');

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

test('returns the stable 410 retirement contract for every method and path', async () => {
    const app = express();

    app.use(express.json());
    app.use((request, _response, next) => {
        if (request.get('x-test-user')) {
            request.user = {
                profile: { handle: 'test-user' },
                directories: { root: os.tmpdir() },
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

        const retired = await fetch(`${url}/api/moving-ui/save`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-test-user': '1',
            },
            body: JSON.stringify({ name: 'safe-layout' }),
        });
        expect(retired.status).toBe(410);
        expect(await retired.json()).toEqual(getMovingUiRetiredBody());
        expect(retired.headers.get('content-type')).toContain('application/json');

        const retiredGet = await fetch(`${url}/api/moving-ui/anything`, {
            headers: { 'x-test-user': '1' },
        });
        expect(retiredGet.status).toBe(410);
        expect(await retiredGet.json()).toEqual(getMovingUiRetiredBody());
    });
});
