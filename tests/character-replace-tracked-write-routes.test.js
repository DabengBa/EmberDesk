import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import express from 'express';
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';

import { disposeCanonicalDatabases, openCanonicalDatabase } from '../src/canonical-sqlite.js';
import { runCanonicalMigrations } from '../src/canonical-sqlite-migrations.js';
import {
    createReplaceIntent,
    createWorkspaceWriteSession,
    fenceReplaceIntent,
    fenceWorkspaceWrite,
    getReplaceIntent,
    getWorkspaceWrite,
    markReplaceIntentReady,
} from '../src/character-replace-write-coordinator.js';
import { getCanonicalSqliteFeatureFlags } from '../src/storage-feature-flags.js';
import { setConfigFilePath } from '../src/util.js';

let root;
let server;
let origin;
let db;
let writes = 0;
let onStarted;
let release;

function headers(sessionId, operationId) {
    return {
        'content-type': 'application/json',
        ...(sessionId ? { 'x-emberdesk-write-session': sessionId } : {}),
        ...(operationId ? { 'x-emberdesk-write-operation': operationId } : {}),
    };
}

async function post(body, sessionId, operationId, signal) {
    return fetch(`${origin}/write`, { method: 'POST', headers: headers(sessionId, operationId), body: JSON.stringify(body), signal });
}

async function waitFor(check) {
    for (let attempt = 0; attempt < 100; attempt++) {
        if (check()) return;
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error('Timed out waiting for tracked write');
}

beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-tracked-write-'));
    const config = path.join(root, 'config.yaml');
    fs.writeFileSync(config, 'features:\n  storage:\n    canonicalSqlite:\n      enabled: true\n');
    setConfigFilePath(config);
    const directories = { root: path.join(root, 'alice'), storage: path.join(root, 'alice', 'storage') };
    db = openCanonicalDatabase({ handle: 'alice', directories, featureFlags: getCanonicalSqliteFeatureFlags() });
    runCanonicalMigrations(db, { strict: true });
    const { coordinateWorkspaceWrite } = await import('../src/endpoints/coordinate-workspace-write.js');
    const app = express();
    app.use(express.json());
    app.use((request, _response, next) => {
        request.user = { profile: { handle: 'alice' }, directories };
        next();
    });
    app.post('/write', coordinateWorkspaceWrite('chat', request => request.body.target, async (request, response) => {
        writes++;
        onStarted?.();
        if (request.body.delay) await new Promise(resolve => { release = resolve; });
        if (request.body.throw) throw new Error('writer threw after starting');
        return response.status(request.body.status ?? 200).json({ saved: request.body.target });
    }));
    const { router: characters } = await import('../src/endpoints/characters.js');
    const { router: chats } = await import('../src/endpoints/chats.js');
    const { router: worldinfo } = await import('../src/endpoints/worldinfo.js');
    app.use('/api/characters', characters);
    app.use('/api/chats', chats);
    app.use('/api/worldinfo', worldinfo);
    await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
    origin = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
    release?.();
    if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    disposeCanonicalDatabases();
    if (root) fs.rmSync(root, { recursive: true, force: true });
});

describe('HTTP write tracking', () => {
    const replaceTarget = { avatar: 'alice.png', chat: '', world: '', card: true, chatSelected: false, worldSelected: false };
    const replaceBody = { avatar_url: 'alice.png', query: '', replacement: 'new', areas: { card: true, worldBook: false, chats: 'off' } };

    async function postReplace(body, sessionId, intentId) {
        return fetch(`${origin}/api/characters/text-replace/apply`, {
            method: 'POST',
            headers: { ...headers(sessionId), ...(intentId ? { 'x-emberdesk-replace-intent': intentId } : {}) },
            body: JSON.stringify(body),
        });
    }

    test('actual replacement rejects a cancelled intent before running the writer', async () => {
        const { sessionId } = createWorkspaceWriteSession(db);
        const intentId = 'replace-fenced';
        createReplaceIntent(db, { sessionId, intentId, target: replaceTarget });
        markReplaceIntentReady(db, { sessionId, intentId });
        fenceReplaceIntent(db, { sessionId, intentId });
        const response = await postReplace(replaceBody, sessionId, intentId);
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({ error: 'replacement_not_claimed', status: 'cancelled' });
        expect(getReplaceIntent(db, { sessionId, intentId }).status).toBe('cancelled');
    });

    test('actual replacement refuses a body targeting a different protected resource', async () => {
        const { sessionId } = createWorkspaceWriteSession(db);
        const intentId = 'replace-other-target';
        createReplaceIntent(db, { sessionId, intentId, target: replaceTarget });
        markReplaceIntentReady(db, { sessionId, intentId });
        const response = await postReplace({ ...replaceBody, avatar_url: 'bob.png' }, sessionId, intentId);
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({ error: 'replacement_target_mismatch' });
        expect(getReplaceIntent(db, { sessionId, intentId }).status).toBe('ready');
    });

    test('actual replacement records completion before returning a preflight error and never repeats the intent', async () => {
        const { sessionId } = createWorkspaceWriteSession(db);
        const intentId = 'replace-invalid-query';
        createReplaceIntent(db, { sessionId, intentId, target: replaceTarget });
        markReplaceIntentReady(db, { sessionId, intentId });
        const first = await postReplace(replaceBody, sessionId, intentId);
        expect(first.status).toBe(400);
        expect(getReplaceIntent(db, { sessionId, intentId })).toMatchObject({ status: 'finished', outcome: 'completed' });
        const again = await postReplace(replaceBody, sessionId, intentId);
        expect(again.status).toBe(409);
        expect(await again.json()).toMatchObject({ error: 'replacement_not_claimed', status: 'finished' });
    });

    test.each([
        ['/api/characters/edit', { avatar_url: 'alice.png', ch_name: 'Alice' }],
        ['/api/chats/save', { avatar_url: 'alice.png', file_name: 'chat-a', chat: [] }],
        ['/api/worldinfo/edit', { name: 'book-a', data: { entries: {} } }],
    ])('actual %s rejects a fenced operation before its write handler', async (route, body) => {
        const { sessionId } = createWorkspaceWriteSession(db);
        const operationId = 'actual-fenced';
        fenceWorkspaceWrite(db, { sessionId, operationId });
        const response = await fetch(`${origin}${route}`, {
            method: 'POST', headers: headers(sessionId, operationId), body: JSON.stringify(body),
        });
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({ error: 'workspace_write_not_claimed', status: 'cancelled' });
    });

    test('a disconnected request remains running until the real writer ends and duplicate requests do not execute', async () => {
        const { sessionId } = createWorkspaceWriteSession(db);
        const operationId = 'delayed';
        const previousWrites = writes;
        const started = new Promise(resolve => { onStarted = resolve; });
        const controller = new AbortController();
        const first = post({ target: 'chat-a', delay: true }, sessionId, operationId, controller.signal).catch(() => null);
        await started;
        onStarted = null;
        controller.abort();
        await first;
        expect(fenceWorkspaceWrite(db, { sessionId, operationId })).toMatchObject({ status: 'running' });
        const duplicate = await post({ target: 'other-chat' }, sessionId, operationId);
        expect(duplicate.status).toBe(409);
        expect(await duplicate.json()).toMatchObject({ error: 'workspace_write_not_claimed', status: 'running' });
        expect(writes).toBe(previousWrites + 1);
        release();
        release = null;
        await waitFor(() => getWorkspaceWrite(db, { sessionId, operationId }).status === 'finished');
        expect(getWorkspaceWrite(db, { sessionId, operationId })).toMatchObject({ status: 'finished', outcome: 'committed', target: 'chat-a' });
    });

    test('a fenced request cannot arrive late and execute', async () => {
        const { sessionId } = createWorkspaceWriteSession(db);
        const operationId = 'fenced';
        fenceWorkspaceWrite(db, { sessionId, operationId });
        const previousWrites = writes;
        const response = await post({ target: 'chat-a' }, sessionId, operationId);
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({ error: 'workspace_write_not_claimed', status: 'cancelled' });
        expect(writes).toBe(previousWrites);
    });

    test('preserves successful and failed responses while recording failed results as unknown', async () => {
        const { sessionId } = createWorkspaceWriteSession(db);
        const success = await post({ target: 'chat-a' }, sessionId, 'success');
        expect(success.status).toBe(200);
        expect(await success.json()).toEqual({ saved: 'chat-a' });
        expect(getWorkspaceWrite(db, { sessionId, operationId: 'success' })).toMatchObject({ status: 'finished', outcome: 'committed' });
        const failed = await post({ target: 'chat-a', status: 500 }, sessionId, 'failed');
        expect(failed.status).toBe(500);
        expect(await failed.json()).toEqual({ saved: 'chat-a' });
        expect(getWorkspaceWrite(db, { sessionId, operationId: 'failed' })).toMatchObject({ status: 'finished', outcome: 'unknown' });
    });

    test('rejects partial tracking headers without calling the writer, but preserves untracked legacy requests', async () => {
        const { sessionId } = createWorkspaceWriteSession(db);
        const previousWrites = writes;
        expect((await post({ target: 'chat-a' }, sessionId)).status).toBe(400);
        expect(writes).toBe(previousWrites);
        expect((await post({ target: 'chat-a' })).status).toBe(200);
        expect(writes).toBe(previousWrites + 1);
    });

    test('a thrown writer has an unknown terminal outcome', async () => {
        const { sessionId } = createWorkspaceWriteSession(db);
        const response = await post({ target: 'chat-a', throw: true }, sessionId, 'throwing');
        expect(response.status).toBe(500);
        expect(getWorkspaceWrite(db, { sessionId, operationId: 'throwing' })).toMatchObject({ status: 'finished', outcome: 'unknown' });
    });

    test('terminal persistence failure never sends the buffered success response', async () => {
        const { sessionId } = createWorkspaceWriteSession(db);
        db.exec(`CREATE TRIGGER deny_terminal_http BEFORE UPDATE ON workspace_write_operations
            WHEN NEW.status = 'finished' BEGIN SELECT RAISE(ABORT, 'terminal unavailable'); END`);
        try {
            const response = await post({ target: 'chat-a' }, sessionId, 'terminal-error');
            expect(response.status).toBe(503);
            expect(getWorkspaceWrite(db, { sessionId, operationId: 'terminal-error' })).toMatchObject({ status: 'running' });
        } finally {
            db.exec('DROP TRIGGER deny_terminal_http');
        }
    });
});
