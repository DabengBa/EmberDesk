import { expect, test } from '@jest/globals';
import express from 'express';
import http from 'node:http';

import { router, getProviderRetiredBody, PROVIDER_RETIRED_ERROR } from '../src/endpoints/provider-retirement.js';

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

test('returns the stable 410 retirement contract for every retired provider route', async () => {
    const app = express();
    app.use(express.json());
    for (const mount of ['/api/horde', '/api/novelai', '/api/nanogpt', '/api/openrouter']) {
        app.use(mount, router);
    }

    await usingApp(app, async (url) => {
        const cases = [
            ['/api/horde/status', 'POST'],
            ['/api/horde/generate-text', 'POST'],
            ['/api/novelai/status', 'POST'],
            ['/api/novelai/generate', 'POST'],
            ['/api/nanogpt/credits', 'POST'],
            ['/api/nanogpt/models/providers', 'POST'],
            ['/api/openrouter/credits', 'POST'],
            ['/api/openrouter/models/providers', 'POST'],
        ];

        for (const [path, method] of cases) {
            const response = await fetch(`${url}${path}`, {
                method,
                headers: { 'content-type': 'application/json' },
                body: '{}',
            });
            expect(response.status).toBe(410);
            expect(await response.json()).toEqual(getProviderRetiredBody());
        }
    });
});

test('retired body carries the stable error code', () => {
    expect(getProviderRetiredBody().error).toBe(PROVIDER_RETIRED_ERROR);
    expect(getProviderRetiredBody().error).toBe('provider_feature_removed');
});
