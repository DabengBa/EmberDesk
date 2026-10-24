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

const testsDirectory = path.dirname(fileURLToPath(import.meta.url));

// The settings gate requires runtime args; without them every config call
// degrades to "canonical flags unavailable".
const hadCommandLineArgs = Object.prototype.hasOwnProperty.call(globalThis, 'COMMAND_LINE_ARGS');
const previousCommandLineArgs = globalThis.COMMAND_LINE_ARGS;
globalThis.COMMAND_LINE_ARGS = {};

const tmpConfigRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-wire-log-route-config-'));
const tmpConfigPath = path.join(tmpConfigRoot, 'config.yaml');
fs.writeFileSync(tmpConfigPath, 'port: 8000\n', 'utf8');
setConfigFilePath(tmpConfigPath);

const { writeRecord } = await import('../src/wire-log-store.js');
const { canonicalSqliteManager } = await import('../src/canonical-sqlite.js');
const { router: wireLogRouter } = await import('../src/endpoints/wire-log.js');

const HANDLE = 'test-user';
const roots = [];

function makeDirectories() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-wire-log-'));
    roots.push(root);
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
    return directories;
}

/** @param {object} directories */
function createApp(directories) {
    const app = express();
    app.use(express.json());
    app.use((request, _response, next) => {
        request.user = { profile: { handle: HANDLE }, handle: HANDLE, directories };
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

async function usingApp(app, callback) {
    const { server, url } = await listen(app);
    try {
        return await callback(url);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
}

/**
 * Persists a completed record through the real store so the route reads exactly
 * what the recorder would have written.
 * @param {object} directories User directories
 * @param {object} [overrides] Record fields to override
 * @returns {Promise<object>} The written record
 */
async function seedRecord(directories, overrides = {}) {
    const storeRoot = path.join(directories.root, 'wire-logs');
    const record = {
        id: overrides.id ?? `wl_${Date.now()}${Math.floor(Math.random() * 1000)}_abcdef`,
        ts: overrides.ts ?? Date.now(),
        status: 'completed',
        request: {
            url: 'https://api.example.test/v1/chat/completions',
            method: 'POST',
            headers: { authorization: '***redacted***', 'content-type': 'application/json' },
            body: { model: 'test-model', messages: [{ role: 'user', content: 'hello' }], tools: [{}] },
            messageCount: 1,
            toolCount: 1,
            bytes: 128,
            truncated: false,
        },
        response: {
            status: 200,
            statusText: 'OK',
            headers: {},
            streamed: false,
            body: { choices: [{ message: { content: 'hi there' } }] },
            bytes: 64,
            truncated: false,
            durationMs: 42,
            ttftMs: null,
            chunks: null,
        },
        error: null,
        context: { type: 'normal', model: 'test-model', charName: 'Seraphina' },
        ...overrides,
    };
    await writeRecord(storeRoot, record);
    return record;
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

afterEach(() => {
    canonicalSqliteManager.dispose();
    while (roots.length) {
        fs.rmSync(roots.pop(), { recursive: true, force: true });
    }
});

describe('GET /api/wire-logs', () => {
    test('lists metadata without bodies', async () => {
        const directories = makeDirectories();
        const record = await seedRecord(directories);

        await usingApp(createApp(directories), async (url) => {
            const response = await fetch(`${url}/api/wire-logs`);
            expect(response.status).toBe(200);
            const entries = await response.json();
            expect(entries).toHaveLength(1);
            expect(entries[0].id).toBe(record.id);
            expect(entries[0].status).toBe('completed');
            expect(entries[0].request.messageCount).toBe(1);
            expect(entries[0].request.toolCount).toBe(1);
            expect(entries[0]).not.toHaveProperty('body');
            expect(entries[0].request).not.toHaveProperty('body');
            expect(entries[0].request).not.toHaveProperty('headers');
            expect(entries[0].response).not.toHaveProperty('body');
            expect(JSON.stringify(entries)).not.toContain('hi there');
            expect(JSON.stringify(entries)).not.toContain('hello');
        });
    });

    test('exposes token usage on the row without leaking the body', async () => {
        const directories = makeDirectories();
        const record = await seedRecord(directories, {
            response: {
                status: 200,
                statusText: 'OK',
                headers: {},
                streamed: false,
                body: { choices: [{ message: { content: 'hi there' } }] },
                usage: { prompt_tokens: 900, completion_tokens: 12, total_tokens: 912 },
                bytes: 64,
                truncated: false,
                durationMs: 42,
                ttftMs: null,
                chunks: null,
            },
        });

        await usingApp(createApp(directories), async (url) => {
            const entries = await (await fetch(`${url}/api/wire-logs`)).json();
            expect(entries[0].id).toBe(record.id);
            expect(entries[0].response.usage).toEqual({ prompt_tokens: 900, completion_tokens: 12, total_tokens: 912 });
            // Usage is metadata; the reply text still stays out of the list.
            expect(JSON.stringify(entries)).not.toContain('hi there');
        });
    });

    test('reports usage as null for a record written before the field existed', async () => {
        const directories = makeDirectories();
        await seedRecord(directories);

        await usingApp(createApp(directories), async (url) => {
            const entries = await (await fetch(`${url}/api/wire-logs`)).json();
            expect(entries[0].response.usage).toBeNull();
        });
    });

    test('honours date, status, type and limit filters', async () => {
        const directories = makeDirectories();
        await seedRecord(directories, { id: 'wl_20260101aaa_aaaaaa', ts: Date.parse('2026-01-01T10:00:00Z') });
        await seedRecord(directories, {
            id: 'wl_20260102aaa_aaaaaa',
            ts: Date.parse('2026-01-02T10:00:00Z'),
            status: 'error',
            context: { type: 'quiet' },
        });

        await usingApp(createApp(directories), async (url) => {
            const byDate = await (await fetch(`${url}/api/wire-logs?date=2026-01-01`)).json();
            expect(byDate.map(entry => entry.id)).toEqual(['wl_20260101aaa_aaaaaa']);

            const byStatus = await (await fetch(`${url}/api/wire-logs?status=error`)).json();
            expect(byStatus.map(entry => entry.id)).toEqual(['wl_20260102aaa_aaaaaa']);

            const byType = await (await fetch(`${url}/api/wire-logs?type=quiet`)).json();
            expect(byType.map(entry => entry.id)).toEqual(['wl_20260102aaa_aaaaaa']);

            const limited = await (await fetch(`${url}/api/wire-logs?limit=1`)).json();
            expect(limited).toHaveLength(1);
            // Newest first.
            expect(limited[0].id).toBe('wl_20260102aaa_aaaaaa');
        });
    });

    test('honours the chatId filter', async () => {
        const directories = makeDirectories();
        await seedRecord(directories, {
            id: 'wl_20260103aaa_aaaaaa',
            ts: Date.parse('2026-01-03T10:00:00Z'),
            context: { type: 'normal', chatId: 'chat-a' },
        });
        await seedRecord(directories, {
            id: 'wl_20260103bbb_bbbbbb',
            ts: Date.parse('2026-01-03T11:00:00Z'),
            context: { type: 'normal', chatId: 'chat-b' },
        });

        await usingApp(createApp(directories), async (url) => {
            const scoped = await (await fetch(`${url}/api/wire-logs?chatId=chat-a`)).json();
            expect(scoped.map(entry => entry.id)).toEqual(['wl_20260103aaa_aaaaaa']);

            const empty = await (await fetch(`${url}/api/wire-logs?chatId=chat-zzz`)).json();
            expect(empty).toEqual([]);

            // An empty value means "no filter", not "match nothing".
            const all = await (await fetch(`${url}/api/wire-logs?chatId=`)).json();
            expect(all).toHaveLength(2);
        });
    });

    test('rejects a malformed date with 400', async () => {
        const directories = makeDirectories();

        await usingApp(createApp(directories), async (url) => {
            for (const date of ['2026-1-1', '../../etc', 'yesterday']) {
                const response = await fetch(`${url}/api/wire-logs?date=${encodeURIComponent(date)}`);
                expect(response.status).toBe(400);
                const payload = await response.json();
                expect(payload.error).toBe(true);
                expect(payload.message).toMatch(/invalid/);
            }
        });
    });
});

describe('GET /api/wire-logs/:id', () => {
    test('returns the full record', async () => {
        const directories = makeDirectories();
        const record = await seedRecord(directories);

        await usingApp(createApp(directories), async (url) => {
            const response = await fetch(`${url}/api/wire-logs/${record.id}`);
            expect(response.status).toBe(200);
            const body = await response.json();
            expect(body.id).toBe(record.id);
            expect(body.request.body.messages[0].content).toBe('hello');
            expect(body.request.headers.authorization).toBe('***redacted***');
            expect(body.response.body.choices[0].message.content).toBe('hi there');
        });
    });

    test('returns 404 for an unknown id', async () => {
        const directories = makeDirectories();

        await usingApp(createApp(directories), async (url) => {
            const response = await fetch(`${url}/api/wire-logs/wl_doesnotexist_000000`);
            expect(response.status).toBe(404);
        });
    });

    test('rejects path traversal without leaving the store', async () => {
        const directories = makeDirectories();
        // A file adjacent to the store that traversal would reach if unguarded.
        fs.writeFileSync(path.join(directories.root, 'secret.json'), '{"secret":true}', 'utf8');

        await usingApp(createApp(directories), async (url) => {
            const attempts = [
                '/api/wire-logs/..%2Fsecret',
                '/api/wire-logs/%2e%2e%2fsecret',
                '/api/wire-logs/..%2F..%2Fetc%2Fpasswd',
                '/api/wire-logs/..%5Csecret',
                '/api/wire-logs/wl_abc%2F..%2F..%2Fsecret',
            ];
            for (const attempt of attempts) {
                // fetch normalizes `..`/`.` segments, so send the raw path over http.
                const status = await rawGetStatus(url, attempt);
                expect([400, 404]).toContain(status);
            }

            const traversal = await rawGetBody(url, '/api/wire-logs/../../etc/passwd');
            expect(traversal.status).toBe(404);
            expect(traversal.body).not.toContain('root:');

            const adjacent = await rawGetBody(url, '/api/wire-logs/..%2Fsecret');
            expect([400, 404]).toContain(adjacent.status);
            // The 400 echoes the rejected id, so assert on file contents instead.
            expect(adjacent.body).not.toContain('"secret":true');
        });
    });
});

describe('DELETE /api/wire-logs/:id', () => {
    test('deletes a record and subsequent reads return 404', async () => {
        const directories = makeDirectories();
        const record = await seedRecord(directories);

        await usingApp(createApp(directories), async (url) => {
            const first = await fetch(`${url}/api/wire-logs/${record.id}`, { method: 'DELETE' });
            expect(first.status).toBe(200);
            expect(await first.json()).toEqual({ ok: true, deleted: true });

            const afterRead = await fetch(`${url}/api/wire-logs/${record.id}`);
            expect(afterRead.status).toBe(404);

            const second = await fetch(`${url}/api/wire-logs/${record.id}`, { method: 'DELETE' });
            expect(await second.json()).toEqual({ ok: true, deleted: false });
        });
    });

    test('rejects an invalid id with 400', async () => {
        const directories = makeDirectories();

        await usingApp(createApp(directories), async (url) => {
            const response = await fetch(`${url}/api/wire-logs/..%2Fsecret`, { method: 'DELETE' });
            expect(response.status).toBe(400);
            const payload = await response.json();
            expect(payload.error).toBe(true);
        });
    });
});

describe('/api/wire-logs/config', () => {
    test('stores only the normalized options, dropping unknown leaf keys', async () => {
        const directories = makeDirectories();
        await usingApp(createApp(directories), async url => {
            const saved = await (await fetch(`${url}/api/wire-logs/config`, {
                method: 'POST', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ enabled: false, unknown: 'discard', retentionDays: -1 }),
            })).json();
            const { getCanonicalSettingsDocument } = await import('../src/endpoints/settings-store.js');
            const db = canonicalSqliteManager.open({ handle: HANDLE, directories, featureFlags: { enabled: true } });
            expect(getCanonicalSettingsDocument(db, { userId: HANDLE }).payload.feature_settings.wire_log).toEqual(saved);
        });
    });
    test('GET returns defaults with enabled true when nothing is stored', async () => {
        const directories = makeDirectories();

        await usingApp(createApp(directories), async (url) => {
            const response = await fetch(`${url}/api/wire-logs/config`);
            expect(response.status).toBe(200);
            const body = await response.json();
            // Logging is opt-out: an unstored fragment means "on".
            expect(body.enabled).toBe(true);
            expect(body.captureBody).toBe(true);
            expect(body.retentionDays).toBe(2);
            expect(body.maxFileBytes).toBe(2 * 1024 * 1024);
            expect(body.redact).toContain('authorization');
            expect(body.redact).toContain('x-api-key');
        });
    });

    test('reports the 48h auto-clear window even when canonical storage is unavailable', async () => {
        // Canonical storage frozen off makes the route fall back to the
        // normalizer defaults. The config cache is read once per process, so a
        // child process is the only faithful way to exercise that branch.
        const finished = spawnSync(
            process.execPath,
            [
                '--experimental-vm-modules',
                // jest is hoisted to the workspace root; the tests package
                // only lists it in package.json.
                path.join(testsDirectory, 'node_modules', 'jest', 'bin', 'jest.js'),
                '--config', 'jest.integration.config.cjs',
                '--runTestsByPath', path.join(testsDirectory, 'wire-log-config-fallback.test.js'),
            ],
            { cwd: testsDirectory, encoding: 'utf8' },
        );
        // jest writes its report to stderr.
        expect(finished.stderr).toContain('1 passed');
        expect(finished.status).toBe(0);
    });

    test('persisting only the switch keeps the 48h default instead of erasing it', async () => {
        const directories = makeDirectories();

        await usingApp(createApp(directories), async (url) => {
            // The viewer's toggle posts `{ enabled }` and nothing else.
            const post = await fetch(`${url}/api/wire-logs/config`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ enabled: false }),
            });
            const saved = await post.json();
            expect(saved.enabled).toBe(false);
            // Auto-clear keeps its 48h default because the normalizer fills it in.
            expect(saved.retentionDays).toBe(2);

            const readBack = await (await fetch(`${url}/api/wire-logs/config`)).json();
            expect(readBack.enabled).toBe(false);
            expect(readBack.retentionDays).toBe(2);
        });
    });

    test('POST enabled:false is the only way to turn logging off', async () => {
        const directories = makeDirectories();

        await usingApp(createApp(directories), async (url) => {
            const off = await fetch(`${url}/api/wire-logs/config`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ enabled: false }),
            });
            expect(await off.json()).toEqual(expect.objectContaining({ enabled: false }));

            expect((await (await fetch(`${url}/api/wire-logs/config`)).json()).enabled).toBe(false);
        });
    });

    test('config route is not shadowed by the :id route', async () => {
        const directories = makeDirectories();

        await usingApp(createApp(directories), async (url) => {
            const response = await fetch(`${url}/api/wire-logs/config`);
            expect(response.status).toBe(200);
            expect(response.headers.get('content-type')).toContain('application/json');
            expect(await response.json()).toHaveProperty('enabled');
        });
    });

    test('POST persists only feature_settings.wire_log and GET reads it back', async () => {
        const directories = makeDirectories();

        await usingApp(createApp(directories), async (url) => {
            const post = await fetch(`${url}/api/wire-logs/config`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    enabled: true,
                    captureBody: false,
                    retentionDays: 3,
                    maxFileBytes: 4096,
                    unrelated: 'dropped',
                }),
            });
            expect(post.status).toBe(200);
            const saved = await post.json();
            expect(saved.enabled).toBe(true);
            expect(saved.captureBody).toBe(false);
            expect(saved.retentionDays).toBe(3);
            expect(saved.maxFileBytes).toBe(4096);
            expect(saved).not.toHaveProperty('unrelated');

            const readBack = await (await fetch(`${url}/api/wire-logs/config`)).json();
            expect(readBack.enabled).toBe(true);
            expect(readBack.captureBody).toBe(false);
            expect(readBack.retentionDays).toBe(3);
            expect(readBack.maxFileBytes).toBe(4096);

            // Unrelated settings keys must survive the patch.
            const db = canonicalSqliteManager.open({
                handle: HANDLE,
                directories,
                featureFlags: { enabled: true, strict: false },
            });
            const row = db.prepare('SELECT payload_json FROM settings_documents WHERE user_id = ?').get(HANDLE);
            const payload = JSON.parse(row.payload_json);
            expect(payload.feature_settings.wire_log.enabled).toBe(true);
            expect(payload).toHaveProperty('feature_settings');
        });
    });
});

/**
 * Sends a raw path (no client-side normalization) so `..` segments reach the
 * router exactly as an attacker would send them.
 * @param {string} baseUrl Server base URL
 * @param {string} rawPath Path to request verbatim
 * @param {string} [method] HTTP method
 * @returns {Promise<{status: number, body: string}>} Status and text body
 */
function rawRequest(baseUrl, rawPath, method = 'GET') {
    const { hostname, port } = new URL(baseUrl);
    return new Promise((resolve, reject) => {
        const request = http.request({ hostname, port, path: rawPath, method }, response => {
            let body = '';
            response.setEncoding('utf8');
            response.on('data', chunk => { body += chunk; });
            response.on('end', () => resolve({ status: response.statusCode, body }));
        });
        request.once('error', reject);
        request.end();
    });
}

function rawGetStatus(baseUrl, rawPath) {
    return rawRequest(baseUrl, rawPath).then(result => result.status);
}

function rawGetBody(baseUrl, rawPath) {
    return rawRequest(baseUrl, rawPath);
}
