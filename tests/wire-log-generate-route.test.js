/* global globalThis */
import { describe, test, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import express from 'express';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { setConfigFilePath } from '../src/util.js';

// The settings gate requires runtime args; without them every config call
// degrades to "canonical flags unavailable".
const hadCommandLineArgs = Object.prototype.hasOwnProperty.call(globalThis, 'COMMAND_LINE_ARGS');
const previousCommandLineArgs = globalThis.COMMAND_LINE_ARGS;
globalThis.COMMAND_LINE_ARGS = {};

const tmpConfigRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-wire-log-generate-config-'));
const tmpConfigPath = path.join(tmpConfigRoot, 'config.yaml');
fs.writeFileSync(tmpConfigPath, process.env.WIRE_FLAG_CHILD
    ? `port: 8000\nfeatures:\n  storage:\n    canonicalSqlite:\n      enabled: true\n      reads: ${process.env.WIRE_READS}\n      writes: ${process.env.WIRE_WRITES}\n      slices:\n        settings:\n          reads: ${process.env.WIRE_READS}\n          writes: ${process.env.WIRE_WRITES}\n`
    : 'port: 8000\n', 'utf8');
setConfigFilePath(tmpConfigPath);

const { router: chatCompletionsRouter } = await import('../src/endpoints/backends/chat-completions.js');
const { router: wireLogRouter } = await import('../src/endpoints/wire-log.js');
const { canonicalSqliteManager } = await import('../src/canonical-sqlite.js');

const HANDLE = 'wire-log-generate-user';
const roots = [];
const servers = [];

function makeDirectories() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-wire-log-generate-'));
    roots.push(root);
    const directories = {
        root,
        handle: HANDLE,
        storage: path.join(root, 'storage'),
        backups: path.join(root, 'backups'),
        openAI_Settings: path.join(root, 'OpenAI Settings'),
        worlds: path.join(root, 'worlds'),
    };
    for (const directory of Object.values(directories)) {
        fs.mkdirSync(directory, { recursive: true });
    }
    return directories;
}

function listen(handler, { port = 0 } = {}) {
    const server = http.createServer(handler);
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => {
            servers.push(server);
            resolve({ server, port: server.address().port, url: `http://127.0.0.1:${server.address().port}` });
        });
    });
}

async function closeServer(server) {
    const index = servers.indexOf(server);
    if (index >= 0) {
        servers.splice(index, 1);
    }
    await new Promise(resolve => server.close(resolve));
}

/**
 * Upstream stub that records every request body it receives.
 * @param {{status?: number, statusText?: string, body?: object, stream?: boolean}} [options] Response shape
 * @returns {Promise<{url: string, received: string[], server: object}>} Stub handle
 */
async function createUpstreamStub(options = {}) {
    const received = [];
    const status = options.status ?? 200;
    const handler = (request, response) => {
        const chunks = [];
        request.on('data', chunk => chunks.push(chunk));
        request.on('end', () => {
            received.push(Buffer.concat(chunks).toString('utf8'));
            if (options.stream) {
                response.writeHead(status, { 'Content-Type': 'text/event-stream' });
                response.write('data: {"choices":[{"delta":{"content":"hi"}}]}\n\n');
                response.end('data: [DONE]\n\n');
                return;
            }
            response.writeHead(status, {
                'Content-Type': 'application/json',
                ...(options.statusText ? { 'X-Test-Status-Text': options.statusText } : {}),
            });
            response.end(options.rawBody ?? JSON.stringify(options.body ?? { id: 'cmpl-1', choices: [{ message: { role: 'assistant', content: 'hello' } }] }));
        });
    };
    const { server, url } = await listen(handler);
    return { server, url, received };
}

function createApp(directories) {
    const app = express();
    app.use(express.json());
    app.use((request, _response, next) => {
        request.user = { profile: { handle: HANDLE }, handle: HANDLE, directories };
        next();
    });
    app.use('/api/backends/chat-completions', chatCompletionsRouter);
    app.use('/api/wire-logs', wireLogRouter);
    return app;
}

/**
 * Enables or disables the wire log switch through the real settings route.
 * @param {string} appUrl Express app URL
 * @param {boolean} enabled Desired switch value
 */
async function setWireLogEnabled(appUrl, enabled) {
    const response = await fetch(`${appUrl}/api/wire-logs/config`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({ enabled }));
}

function listRecordFiles(directories) {
    const storeRoot = path.join(directories.root, 'wire-logs');
    if (!fs.existsSync(storeRoot)) {
        return [];
    }
    const files = [];
    for (const partition of fs.readdirSync(storeRoot)) {
        const partitionPath = path.join(storeRoot, partition);
        if (!fs.statSync(partitionPath).isDirectory()) {
            continue;
        }
        for (const file of fs.readdirSync(partitionPath)) {
            if (file.endsWith('.json')) {
                files.push(path.join(partitionPath, file));
            }
        }
    }
    return files;
}

/**
 * Waits until the recorder has flushed its asynchronous write.
 * @param {object} directories User directories
 * @param {number} [expected] Expected minimum record count
 * @returns {Promise<object[]>} Parsed records
 */
async function waitForRecords(directories, expected = 1) {
    const deadline = Date.now() + 5000;
    let records = [];
    while (Date.now() < deadline) {
        records = listRecordFiles(directories).map(file => JSON.parse(fs.readFileSync(file, 'utf8')));
        if (records.length >= expected) {
            return records;
        }
        await new Promise(resolve => setTimeout(resolve, 25));
    }
    return records;
}

/**
 * Polls a predicate for work the endpoint starts but never awaits (the
 * retention sweep). Fails the test rather than hanging when it never happens.
 * @param {() => boolean} predicate Condition to reach
 * @param {number} [timeoutMs] Give-up budget
 * @returns {Promise<void>}
 */
async function waitFor(predicate, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (predicate()) {
            return;
        }
        await new Promise(resolve => setTimeout(resolve, 25));
    }
}

beforeAll(() => {
    process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED = 'true';
});

afterAll(() => {
    delete process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED;
    if (hadCommandLineArgs) {
        globalThis.COMMAND_LINE_ARGS = previousCommandLineArgs;
    } else {
        delete globalThis.COMMAND_LINE_ARGS;
    }
    fs.rmSync(tmpConfigRoot, { recursive: true, force: true });
});

afterEach(async () => {
    canonicalSqliteManager.dispose();
    for (const server of servers.splice(0)) {
        await new Promise(resolve => server.close(resolve));
    }
    while (roots.length) {
        fs.rmSync(roots.pop(), { recursive: true, force: true });
    }
});

describe('POST /api/backends/chat-completions/generate wire logging', () => {
    test.each(['audit', 'rollback'])('blocked %s cannot pretend to save logging off', async blocker => {
        const directories = makeDirectories();
        const upstream = await createUpstreamStub();
        const { url } = await listen(createApp(directories));
        await fetch(`${url}/api/wire-logs/config`);
        const db = canonicalSqliteManager.open({ handle: HANDLE, directories, featureFlags: { enabled: true } });
        if (blocker === 'audit') {
            const { persistCanonicalAuditStatus } = await import('../src/canonical-sqlite-shadow-import.js');
            const { getCanonicalStorageSlice } = await import('../src/canonical-storage-slice-registry.js');
            persistCanonicalAuditStatus(db, { blocking: true, reason: 'audit_drift_blocked' }, {
                scope: getCanonicalStorageSlice('settings').auditScope,
            });
        } else {
            const { recordSettingsProjectionRepair } = await import('../src/endpoints/settings-store.js');
            recordSettingsProjectionRepair(db, { repairKey: 'blocked', userId: HANDLE, reason: 'test repair' });
        }
        const saved = await fetch(`${url}/api/wire-logs/config`, {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"enabled":false}',
        });
        expect(saved.status).toBe(503);
        expect(await saved.json()).toMatchObject({ error: true });
        const config = await (await fetch(`${url}/api/wire-logs/config`)).json();
        expect(config).toMatchObject({ enabled: true, persisted: blocker === 'rollback' });
        await fetch(`${url}/api/backends/chat-completions/generate`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ chat_completion_source: 'openai', custom_url: upstream.url, model: 'test', messages: [] }),
        });
        expect(await waitForRecords(directories)).toHaveLength(1);
    });

    test('flag matrix uses isolated config processes', () => {
        const testsDir = path.dirname(fileURLToPath(import.meta.url));
        for (const [reads, writes] of [[false, true], [true, false], [false, false]]) {
            const result = spawnSync(process.execPath, [
                '--experimental-vm-modules', path.join(testsDir, 'node_modules/jest/bin/jest.js'),
                '--config', 'jest.integration.config.cjs', '--runInBand', '--runTestsByPath', fileURLToPath(import.meta.url),
                '--testNamePattern', 'isolated retired flags honor effective settings',
            ], {
                cwd: testsDir, encoding: 'utf8', env: {
                    ...process.env, WIRE_FLAG_CHILD: 'true',
                    WIRE_READS: String(reads), WIRE_WRITES: String(writes),
                },
            });
            expect({ status: result.status, error: result.status ? result.stderr : '' }).toEqual({ status: 0, error: '' });
        }
    });

    test('isolated retired flags honor effective settings', async () => {
        if (!process.env.WIRE_FLAG_CHILD) {
            return;
        }
        const directories = makeDirectories();
        const upstream = await createUpstreamStub();
        const { url } = await listen(createApp(directories));
        const response = await fetch(`${url}/api/wire-logs/config`, {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"enabled":false}',
        });
        // reads/writes are retired rollout flags: the storage owner deliberately
        // makes them follow enabled, even when old config explicitly says false.
        const { getCanonicalStorageSlice } = await import('../src/canonical-storage-slice-registry.js');
        expect(getCanonicalStorageSlice('settings').getFeatureFlags()).toMatchObject({ enabled: true, reads: true, writes: true });
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ enabled: false });
        expect((await (await fetch(`${url}/api/wire-logs/config`)).json()).enabled).toBe(false);
        await fetch(`${url}/api/backends/chat-completions/generate`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ chat_completion_source: 'openai', custom_url: upstream.url, model: 'test', messages: [] }),
        });
        expect(fs.existsSync(path.join(directories.root, 'wire-logs'))).toBe(false);
    });
    test.each(['normal', 'abort', 'upstream-close'])('real SSE terminates exactly once: %s', async mode => {
        const directories = makeDirectories();
        let release;
        const upstream = await listen((_req, res) => {
            res.writeHead(200, { 'content-type': 'text/event-stream' });
            res.write('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n');
            release = () => mode === 'upstream-close' ? res.destroy() : res.end('data: [DONE]\n\n');
            if (mode === 'normal') release();
        });
        const { url } = await listen(createApp(directories));
        const controller = new AbortController();
        const response = await fetch(`${url}/api/backends/chat-completions/generate`, {
            method: 'POST', signal: controller.signal, headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ chat_completion_source: 'openai', custom_url: upstream.url, stream: true, model: 'test', messages: [], _trace: { model: 'spoof', source: 'spoof' } }),
        });
        if (mode === 'normal') {
            expect(await response.text()).toContain('[DONE]');
        } else {
            const reader = response.body.getReader();
            expect(new TextDecoder().decode((await reader.read()).value)).toContain('partial');
            if (mode === 'abort') controller.abort();
            else release();
            if (mode === 'upstream-close') {
                await expect(reader.read()).rejects.toThrow();
            } else {
                await reader.read().catch(() => {});
            }
        }
        const records = await waitForRecords(directories);
        expect(records).toHaveLength(1);
        expect(records[0].status).toBe(mode === 'normal' ? 'completed' : 'error');
        expect(JSON.stringify(records[0].response)).toContain('partial');
        expect(records[0].context).toMatchObject({ model: 'test', source: 'openai' });
        release();
    });

    test('connection refusal produces one terminal error record', async () => {
        const directories = makeDirectories();
        const upstream = await listen(() => {});
        await closeServer(upstream.server);
        const { url } = await listen(createApp(directories));
        const response = await fetch(`${url}/api/backends/chat-completions/generate`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ chat_completion_source: 'openai', custom_url: upstream.url, model: 'test', messages: [] }),
        });
        expect(response.status).toBe(502);
        const records = await waitForRecords(directories);
        expect(records).toHaveLength(1);
        expect(records[0].status).toBe('error');
    });
    test('invalid JSON keeps the generation error instead of succeeding with raw text', async () => {
        const directories = makeDirectories();
        const upstream = await createUpstreamStub({ rawBody: 'not json' });
        const { url } = await listen(createApp(directories));
        const response = await fetch(`${url}/api/backends/chat-completions/generate`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ chat_completion_source: 'openai', custom_url: upstream.url, model: 'test', messages: [] }),
        });
        expect(response.status).toBe(502);
        const records = await waitForRecords(directories);
        expect(records).toHaveLength(1);
        expect(records[0].status).toBe('error');
        expect(records[0].response).toMatchObject({
            status: 200,
            body: 'not json',
            headers: { 'content-type': 'application/json' },
        });
    });

    test('streaming HTTP errors retain their response body in one terminal record', async () => {
        const directories = makeDirectories();
        const upstream = await createUpstreamStub({ status: 429, body: { error: 'slow down' } });
        const { url } = await listen(createApp(directories));
        const response = await fetch(`${url}/api/backends/chat-completions/generate`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ chat_completion_source: 'openai', custom_url: upstream.url, stream: true, model: 'test', messages: [] }),
        });
        expect(response.status).toBe(429);
        expect(await response.text()).toContain('slow down');
        const records = await waitForRecords(directories);
        expect(records).toHaveLength(1);
        expect(JSON.stringify(records[0].response)).toContain('slow down');
    });
    test('never forwards _trace to the upstream API', async () => {
        const directories = makeDirectories();
        const upstream = await createUpstreamStub();
        const app = createApp(directories);
        const { server, url } = await listen(app);

        try {
            const response = await fetch(`${url}/api/backends/chat-completions/generate`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    chat_completion_source: 'openai',
                    custom_url: upstream.url,
                    secret_id: 'test-secret',
                    model: 'gpt-4o-mini',
                    messages: [{ role: 'user', content: 'hello' }],
                    _trace: { chatId: 'chat-1', charName: 'Seraphina', model: 'gpt-4o-mini' },
                }),
            });
            expect(response.status).toBe(200);
            expect(await response.json()).toEqual(expect.objectContaining({ id: 'cmpl-1' }));

            expect(upstream.received).toHaveLength(1);
            const upstreamBody = JSON.parse(upstream.received[0]);
            expect(upstreamBody).not.toHaveProperty('_trace');
            expect(upstream.received[0]).not.toContain('_trace');
            expect(upstreamBody.messages).toEqual([{ role: 'user', content: 'hello' }]);
        } finally {
            await closeServer(server);
            await closeServer(upstream.server);
        }
    });

    test('does not create the wire-logs directory when logging is explicitly off', async () => {
        const directories = makeDirectories();
        const upstream = await createUpstreamStub();
        const app = createApp(directories);
        const { server, url } = await listen(app);

        try {
            await setWireLogEnabled(url, false);

            const response = await fetch(`${url}/api/backends/chat-completions/generate`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    chat_completion_source: 'openai',
                    custom_url: upstream.url,
                    secret_id: 'test-secret',
                    model: 'gpt-4o-mini',
                    messages: [{ role: 'user', content: 'hello' }],
                    _trace: { chatId: 'chat-off' },
                }),
            });
            expect(response.status).toBe(200);
            expect(fs.existsSync(path.join(directories.root, 'wire-logs'))).toBe(false);
        } finally {
            await closeServer(server);
            await closeServer(upstream.server);
        }
    });

    test('logs by default without any stored setting', async () => {
        const directories = makeDirectories();
        const upstream = await createUpstreamStub();
        const app = createApp(directories);
        const { server, url } = await listen(app);

        try {
            // No POST to /config: logging is opt-out, so generation alone writes.
            const response = await fetch(`${url}/api/backends/chat-completions/generate`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    chat_completion_source: 'openai',
                    custom_url: upstream.url,
                    secret_id: 'test-secret',
                    model: 'gpt-4o-mini',
                    messages: [{ role: 'user', content: 'hello' }],
                    _trace: { chatId: 'chat-default' },
                }),
            });
            expect(response.status).toBe(200);

            const records = await waitForRecords(directories, 1);
            expect(records).toHaveLength(1);
            expect(records[0].status).toBe('completed');
            expect(records[0].context?.chatId).toBe('chat-default');
        } finally {
            await closeServer(server);
            await closeServer(upstream.server);
        }
    });

    test('sweeps records older than 48h by default, with no stored setting', async () => {
        const directories = makeDirectories();
        const storeRoot = path.join(directories.root, 'wire-logs');
        // A profile that has been running for a while, nothing ever saved to
        // feature_settings.wire_log. The stale record sits in *yesterday's*
        // partition, which the day-granular sweep keeps: only a record-level
        // 48h sweep removes it. The fresh one shares that partition, so the
        // test also proves the window is not "delete yesterday wholesale".
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const yesterdayPartition = path.join(storeRoot, yesterday);
        fs.mkdirSync(yesterdayPartition, { recursive: true });
        const staleFile = path.join(yesterdayPartition, 'wl_stale_aaaaaa.json');
        fs.writeFileSync(
            staleFile,
            JSON.stringify({ id: 'wl_stale_aaaaaa', ts: Date.now() - 50 * 60 * 60 * 1000, status: 'completed' }),
            'utf8',
        );
        const freshFile = path.join(yesterdayPartition, 'wl_fresh_aaaaaa.json');
        fs.writeFileSync(
            freshFile,
            JSON.stringify({ id: 'wl_fresh_aaaaaa', ts: Date.now() - 20 * 60 * 60 * 1000, status: 'completed' }),
            'utf8',
        );

        const upstream = await createUpstreamStub();
        const app = createApp(directories);
        const { server, url } = await listen(app);

        try {
            // Generation alone must trigger the sweep: 48h cleanup is default-on.
            const response = await fetch(`${url}/api/backends/chat-completions/generate`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    chat_completion_source: 'openai',
                    custom_url: upstream.url,
                    secret_id: 'test-secret',
                    model: 'gpt-4o-mini',
                    messages: [{ role: 'user', content: 'hello' }],
                }),
            });
            expect(response.status).toBe(200);

            await waitForRecords(directories, 1);
            // The sweep is deliberately fire-and-forget (it must never delay a
            // generation), so wait for it instead of assuming it beat the write.
            await waitFor(() => !fs.existsSync(staleFile));
            expect(fs.existsSync(staleFile)).toBe(false);
            // 20h is still inside the window, so it stays.
            expect(fs.existsSync(freshFile)).toBe(true);

            // The config route agrees that the persisted default is on + 48h.
            const config = await (await fetch(`${url}/api/wire-logs/config`)).json();
            expect(config.enabled).toBe(true);
            expect(config.retentionDays).toBe(2);
        } finally {
            await closeServer(server);
            await closeServer(upstream.server);
        }
    });

    test('writes a non-streaming record whose messages match the upstream body', async () => {
        const directories = makeDirectories();
        const upstream = await createUpstreamStub();
        const app = createApp(directories);
        const { server, url } = await listen(app);

        try {
            await setWireLogEnabled(url, true);

            const response = await fetch(`${url}/api/backends/chat-completions/generate`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    chat_completion_source: 'openai',
                    custom_url: upstream.url,
                    secret_id: 'test-secret',
                    model: 'gpt-4o-mini',
                    messages: [{ role: 'user', content: 'hello' }],
                    _trace: { chatId: 'chat-on', charName: 'Seraphina', type: 'normal' },
                }),
            });
            expect(response.status).toBe(200);

            const records = await waitForRecords(directories, 1);
            expect(records).toHaveLength(1);
            const [record] = records;
            const upstreamBody = JSON.parse(upstream.received[0]);

            expect(record.status).toBe('completed');
            expect(record.response.status).toBe(200);
            expect(record.response.streamed).toBe(false);
            expect(record.request.body.messages).toEqual(upstreamBody.messages);
            expect(record.request.body).not.toHaveProperty('_trace');
            expect(record.request.url).toContain('/chat/completions');
            expect(JSON.stringify(record)).not.toContain('_trace');
            expect(record.context?.chatId).toBe('chat-on');
            expect(JSON.stringify(record.request.headers)).not.toContain('Bearer test-secret');
        } finally {
            await closeServer(server);
            await closeServer(upstream.server);
        }
    });

    test('records the token usage the provider reported', async () => {
        const directories = makeDirectories();
        const upstream = await createUpstreamStub({
            body: {
                id: 'cmpl-usage',
                choices: [{ message: { role: 'assistant', content: 'hello' } }],
                usage: { prompt_tokens: 1500, completion_tokens: 60, total_tokens: 1560 },
            },
        });
        const app = createApp(directories);
        const { server, url } = await listen(app);

        try {
            const response = await fetch(`${url}/api/backends/chat-completions/generate`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    chat_completion_source: 'openai',
                    custom_url: upstream.url,
                    secret_id: 'test-secret',
                    model: 'gpt-4o-mini',
                    messages: [{ role: 'user', content: 'hello' }],
                    _trace: { chatId: 'chat-usage' },
                }),
            });
            expect(response.status).toBe(200);

            const records = await waitForRecords(directories, 1);
            expect(records).toHaveLength(1);
            expect(records[0].response.usage).toEqual({
                prompt_tokens: 1500,
                completion_tokens: 60,
                total_tokens: 1560,
            });

            // The viewer list must carry the same counts.
            const listed = await (await fetch(`${url}/api/wire-logs?chatId=chat-usage`)).json();
            expect(listed).toHaveLength(1);
            expect(listed[0].response.usage).toEqual({
                prompt_tokens: 1500,
                completion_tokens: 60,
                total_tokens: 1560,
            });
        } finally {
            await closeServer(server);
            await closeServer(upstream.server);
        }
    });

    test('writes a record even when the upstream returns 429', async () => {
        const directories = makeDirectories();
        const upstream = await createUpstreamStub({
            status: 429,
            body: { error: { message: 'slow down', type: 'insufficient_quota' } },
        });
        const app = createApp(directories);
        const { server, url } = await listen(app);

        try {
            await setWireLogEnabled(url, true);

            const response = await fetch(`${url}/api/backends/chat-completions/generate`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    chat_completion_source: 'openai',
                    custom_url: upstream.url,
                    secret_id: 'test-secret',
                    model: 'gpt-4o-mini',
                    messages: [{ role: 'user', content: 'hello' }],
                }),
            });
            expect(response.status).toBe(200);
            const payload = await response.json();
            expect(payload.quota_error).toBe(true);

            const records = await waitForRecords(directories, 1);
            expect(records).toHaveLength(1);
            expect(records[0].status).toBe('completed');
            expect(records[0].response.status).toBe(429);
        } finally {
            await closeServer(server);
            await closeServer(upstream.server);
        }
    });

    test('keeps the HTTP response intact when the wire log write fails', async () => {
        const directories = makeDirectories();
        const upstream = await createUpstreamStub();
        const app = createApp(directories);
        const { server, url } = await listen(app);

        try {
            await setWireLogEnabled(url, true);

            // A file where the store expects a directory makes every write fail.
            fs.writeFileSync(path.join(directories.root, 'wire-logs'), 'not a directory', 'utf8');

            const response = await fetch(`${url}/api/backends/chat-completions/generate`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    chat_completion_source: 'openai',
                    custom_url: upstream.url,
                    secret_id: 'test-secret',
                    model: 'gpt-4o-mini',
                    messages: [{ role: 'user', content: 'hello' }],
                }),
            });
            expect(response.status).toBe(200);
            expect(await response.json()).toEqual(expect.objectContaining({ id: 'cmpl-1' }));
        } finally {
            await closeServer(server);
            await closeServer(upstream.server);
        }
    });
});
