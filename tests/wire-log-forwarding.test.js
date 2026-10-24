import { test, expect } from '@jest/globals';
import http from 'node:http';
import fetch from 'node-fetch';
import { forwardFetchResponse } from '../src/util.js';

test('throwing observers cannot interrupt real HTTP forwarding and listeners are removed', async () => {
    const upstream = http.createServer((_req, res) => res.end('data: hello\n\n'));
    await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
    let body;
    const app = http.createServer(async (_req, res) => {
        const response = await fetch(`http://127.0.0.1:${upstream.address().port}`);
        body = response.body;
        await forwardFetchResponse(response, res, {
            onChunk() { throw new Error('observer failed'); },
            onComplete() { throw new Error('observer failed'); },
        });
    });
    await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
    try {
        const response = await fetch(`http://127.0.0.1:${app.address().port}`);
        expect(await response.text()).toBe('data: hello\n\n');
        expect(body.listenerCount('data')).toBe(0);
        expect(body.listeners('close').map(listener => listener.name)).not.toContain('onBodyClose');
        expect(body.listeners('error').map(listener => listener.name)).not.toContain('onError');
    } finally {
        await Promise.all([app, upstream].map(server => new Promise(resolve => server.close(resolve))));
    }
});
