import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import express from 'express';

import { disposeCanonicalDatabases } from '../src/canonical-sqlite.js';
import { setConfigFilePath } from '../src/util.js';

let root;
let server;
let origin;
const target = { avatar: 'alice.png', chat: 'chat-a', world: 'book-a', card: true, chatSelected: true, worldSelected: true };

async function post(route, body = {}, user = 'alice') {
    const response = await fetch(`${origin}${route}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(user ? { 'x-test-user': user } : {}) },
        body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
}

beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-replace-routes-'));
    const config = path.join(root, 'config.yaml');
    fs.writeFileSync(config, 'features:\n  storage:\n    canonicalSqlite:\n      enabled: true\n');
    setConfigFilePath(config);
    const { router } = await import('../src/endpoints/character-replace-coordination.js');
    const app = express();
    app.use(express.json());
    app.use((request, _response, next) => {
        const handle = request.get('x-test-user');
        if (handle) {
            const userRoot = path.join(root, handle);
            request.user = { profile: { handle }, directories: { root: userRoot, storage: path.join(userRoot, 'storage') } };
        }
        next();
    });
    app.use('/api/character-replace-coordination', router);
    await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
    origin = `http://127.0.0.1:${server.address().port}/api/character-replace-coordination`;
});

afterAll(async () => {
    if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    disposeCanonicalDatabases();
    if (root) fs.rmSync(root, { recursive: true, force: true });
});

describe('character replacement coordination API', () => {
    test('supports idempotent intent setup, write fences, acknowledgement and session cleanup', async () => {
        const created = await post('/sessions/create');
        expect(created.status).toBe(200);
        const { sessionId } = created.body;
        const intent = { sessionId, intentId: 'intent-1', target };
        expect((await post('/intents/create', intent)).body).toMatchObject({ created: true, status: 'preparing' });
        expect((await post('/intents/create', intent)).body).toMatchObject({ created: false, status: 'preparing' });
        expect((await post('/intents/register-writes', { ...intent, operationIds: ['late'] })).status).toBe(200);
        expect((await post('/intents/ready', intent)).status).toBe(409);
        expect((await post('/writes/status', { sessionId, operationId: 'late' })).body).toEqual({ write: null });
        expect((await post('/writes/fence', { sessionId, operationId: 'late' })).body).toMatchObject({ status: 'cancelled' });
        expect((await post('/intents/ready', intent)).body).toMatchObject({ status: 'ready' });
        expect((await post('/intents/list')).body.intents).toEqual(expect.arrayContaining([
            expect.objectContaining({ sessionId, intentId: 'intent-1', status: 'ready' }),
        ]));
        expect((await post('/intents/fence', intent)).body).toMatchObject({ status: 'cancelled' });
        expect((await post('/intents/acknowledge', intent)).body).toMatchObject({ acknowledged: true });
        expect((await post('/sessions/close', { sessionId })).body).toMatchObject({ status: 'closed' });
        expect((await post('/sessions/cleanup', { sessionId })).body).toMatchObject({ status: 'closed' });
        expect((await post('/intents/create', intent)).body).toMatchObject({ status: 'session_closed' });
    });

    test('a fence on an unseen intent prevents late registration', async () => {
        const { body: { sessionId } } = await post('/sessions/create');
        const params = { sessionId, intentId: 'late-intent' };
        expect((await post('/intents/fence', params)).body).toMatchObject({ status: 'cancelled' });
        expect((await post('/intents/create', { ...params, target })).body).toMatchObject({ created: false, status: 'cancelled' });
    });

    test('uses the authenticated account and never a supplied handle to access another user database', async () => {
        const { body: { sessionId } } = await post('/sessions/create', {}, 'alice');
        await post('/intents/create', { sessionId, intentId: 'private', target }, 'alice');
        const result = await post('/intents/status', { sessionId, intentId: 'private', handle: 'alice' }, 'bob');
        expect(result.status).toBe(409);
        expect(JSON.stringify(result.body)).not.toContain('alice.png');
        expect((await post('/intents/list', {}, 'bob')).body.intents).toEqual([]);
        expect((await post('/intents/status', { sessionId, intentId: 'private' }, 'alice')).body.intent.status).toBe('preparing');
    });

    test('rejects unauthenticated and invalid inputs without creating a usable session', async () => {
        expect((await post('/sessions/create', {}, null)).status).toBe(401);
        const { body: { sessionId } } = await post('/sessions/create');
        expect((await post('/writes/fence', { sessionId, operationId: '../invalid' })).status).toBe(400);
        expect((await post('/intents/create', { sessionId, intentId: 'x', target: { ...target, avatar: '' } })).status).toBe(400);
    });
});
