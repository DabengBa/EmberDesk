import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';

let tempRoot = '';
let storeRoot = '';

async function importRecorder() {
    return import(`../src/wire-log-recorder.js?cacheBust=${Date.now()}-${Math.random()}`);
}

beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'wire-log-recorder-'));
    storeRoot = path.join(tempRoot, 'wire-logs');
});

afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('normalizeWireLogOptions', () => {
    test('defaults to enabled with a 48h retention window', async () => {
        const { normalizeWireLogOptions } = await importRecorder();

        expect(normalizeWireLogOptions(undefined)).toEqual({
            enabled: true,
            captureBody: true,
            maxFileBytes: 2097152,
            retentionDays: 2,
            redact: ['authorization', 'x-api-key', 'cookie', 'proxy-authorization'],
        });
    });

    test('is opt-out: only an explicit false disables logging', async () => {
        const { normalizeWireLogOptions } = await importRecorder();

        expect(normalizeWireLogOptions({}).enabled).toBe(true);
        expect(normalizeWireLogOptions({ enabled: undefined }).enabled).toBe(true);
        expect(normalizeWireLogOptions({ enabled: null }).enabled).toBe(true);
        expect(normalizeWireLogOptions({ enabled: 'false' }).enabled).toBe(true);
        expect(normalizeWireLogOptions({ enabled: false }).enabled).toBe(false);
    });

    test('clamps invalid numbers and merges redaction names', async () => {
        const { normalizeWireLogOptions } = await importRecorder();

        const options = normalizeWireLogOptions({
            enabled: true,
            maxFileBytes: -5,
            retentionDays: 0,
            redact: ['x-custom'],
        });

        expect(options.enabled).toBe(true);
        expect(options.maxFileBytes).toBe(2097152);
        expect(options.retentionDays).toBe(2);
        expect(options.redact).toContain('x-custom');
        expect(options.redact).toContain('authorization');
    });

    test('rounds positive fractional limits up instead of down', async () => {
        const { normalizeWireLogOptions } = await importRecorder();
        expect(normalizeWireLogOptions({ maxFileBytes: 0.5, retentionDays: 0.5 })).toMatchObject({ maxFileBytes: 1, retentionDays: 1 });
    });
});

describe('createWireLogRecorder — defaults', () => {
    test('is enabled when no switch is passed', async () => {
        const { createWireLogRecorder } = await importRecorder();
        const recorder = createWireLogRecorder({ storeRoot });

        expect(recorder.enabled).toBe(true);
        expect(recorder.options.retentionDays).toBe(2);
        expect(recorder.begin({ url: 'u', headers: {}, body: {} })).not.toBeNull();
    });
});

describe('createWireLogRecorder — disabled', () => {
    test('records nothing and returns a no-op handle', async () => {
        const { createWireLogRecorder } = await importRecorder();
        const recorder = createWireLogRecorder({ storeRoot, enabled: false });

        expect(recorder.enabled).toBe(false);
        expect(recorder.begin({ url: 'u', headers: {}, body: {} })).toBeNull();
        await recorder.flush();

        await expect(fs.readdir(storeRoot)).rejects.toThrow();
    });
});

describe('createWireLogRecorder — non-streaming', () => {
    test('body-off keeps real response bytes and usage metadata', async () => {
        const { createWireLogRecorder } = await importRecorder();
        const recorder = createWireLogRecorder({ storeRoot, captureBody: false });
        const body = { choices: [{ message: { content: '中文 response' } }], usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } };
        const session = recorder.begin({ url: 'u', headers: {}, body: { messages: [{ role: 'user' }], tools: [{ type: 'function' }] } });
        session.complete({ status: 200, body });
        await recorder.flush();
        const records = await collectRecords(storeRoot);
        expect(records[0].response.bytes).toBe(Buffer.byteLength(JSON.stringify(body), 'utf8'));
        expect(records[0].response.body).toBeNull();
        expect(records[0].response.usage).toEqual(body.usage);
    });
    test('persists request and response on completion', async () => {
        const { createWireLogRecorder } = await importRecorder();
        const recorder = createWireLogRecorder({ storeRoot, enabled: true });
        const session = recorder.begin({
            url: 'https://example.test/v1/chat/completions',
            headers: { Authorization: 'Bearer sk-x', 'Content-Type': 'application/json' },
            body: { model: 'gpt-5', messages: [{ role: 'user', content: 'hi' }] },
            context: { type: 'normal', model: 'gpt-5' },
        });

        session.complete({
            status: 200,
            statusText: 'OK',
            headers: { 'content-type': 'application/json' },
            body: { choices: [{ message: { content: 'hello' } }] },
            durationMs: 120,
        });
        await recorder.flush();

        const dates = await fs.readdir(storeRoot);
        const files = await fs.readdir(path.join(storeRoot, dates[0]));
        const record = JSON.parse(await fs.readFile(path.join(storeRoot, dates[0], files[0]), 'utf8'));

        expect(record.status).toBe('completed');
        expect(record.request.headers.Authorization).toBe('***redacted***');
        expect(record.request.body.messages).toHaveLength(1);
        expect(record.response.body.choices[0].message.content).toBe('hello');
        expect(record.response.streamed).toBe(false);
        // No usage in the response means "unknown", never a guessed number.
        expect(record.response.usage).toBeNull();
    });

    test('captures upstream error status without throwing', async () => {
        const { createWireLogRecorder } = await importRecorder();
        const recorder = createWireLogRecorder({ storeRoot, enabled: true });
        const session = recorder.begin({ url: 'u', headers: {}, body: { model: 'm' } });

        session.complete({ status: 429, statusText: 'Too Many Requests', body: { error: { message: 'quota' } }, durationMs: 8 });
        await recorder.flush();

        const records = await collectRecords(storeRoot);
        expect(records[0].status).toBe('completed');
        expect(records[0].response.status).toBe(429);
    });

    test('records a transport failure', async () => {
        const { createWireLogRecorder } = await importRecorder();
        const recorder = createWireLogRecorder({ storeRoot, enabled: true });
        const session = recorder.begin({ url: 'u', headers: {}, body: {} });

        session.fail(new Error('ECONNREFUSED'));
        await recorder.flush();

        const records = await collectRecords(storeRoot);
        expect(records[0].status).toBe('error');
        expect(records[0].error.message).toBe('ECONNREFUSED');
        expect(records[0].response.bytes).toBe(0);
    });

    test('records non-stream failure response details without pretending it streamed', async () => {
        const { createWireLogRecorder } = await importRecorder();
        const recorder = createWireLogRecorder({ storeRoot, captureBody: false });
        const session = recorder.begin({ url: 'u', headers: {}, body: {} });
        const body = 'not json';
        session.fail(new Error('invalid json'), { status: 502, statusText: 'Bad Gateway', headers: { 'content-type': 'text/plain' }, body });
        await recorder.flush();
        const records = await collectRecords(storeRoot);
        expect(records[0]).toMatchObject({ status: 'error', response: { status: 502, streamed: false, body: null } });
        expect(records[0].response.bytes).toBe(Buffer.byteLength(JSON.stringify(body), 'utf8'));
    });

    test('two recorders can purge and write concurrently', async () => {
        const { createWireLogRecorder } = await importRecorder();
        const a = createWireLogRecorder({ storeRoot });
        const b = createWireLogRecorder({ storeRoot });
        const first = a.begin({ url: 'a', headers: {}, body: {} });
        const second = b.begin({ url: 'b', headers: {}, body: {} });
        first.complete({ status: 200, body: {} });
        second.complete({ status: 200, body: {} });
        await Promise.all([a.flush(), b.flush()]);
        expect(await collectRecords(storeRoot)).toHaveLength(2);
    });

    test('ignores double completion', async () => {
        const { createWireLogRecorder } = await importRecorder();
        const recorder = createWireLogRecorder({ storeRoot, enabled: true });
        const session = recorder.begin({ url: 'u', headers: {}, body: {} });

        session.complete({ status: 200, body: { ok: true } });
        session.fail(new Error('late'));
        await recorder.flush();

        const records = await collectRecords(storeRoot);
        expect(records).toHaveLength(1);
        expect(records[0].status).toBe('completed');
    });

    test('purges expired partitions once per recorder, after creating the session', async () => {
        const { createWireLogRecorder } = await importRecorder();
        const stalePartition = path.join(storeRoot, '2020-01-01');
        await fs.mkdir(stalePartition, { recursive: true });
        await fs.writeFile(path.join(stalePartition, 'wl_stale_aaaaaa.json'), '{}', 'utf8');

        const recorder = createWireLogRecorder({ storeRoot, enabled: true });
        recorder.begin({ url: 'u', headers: {}, body: {} });
        recorder.begin({ url: 'u', headers: {}, body: {} });
        await recorder.flush();

        await expect(fs.readdir(stalePartition)).rejects.toThrow();
    });

    test('a default recorder (no options at all) cleans up 48h-old partitions', async () => {
        const { createWireLogRecorder } = await importRecorder();
        // Nothing persisted, nothing passed: this is the fresh-profile case the
        // "自动清除默认开启" contract is about.
        const stalePartition = path.join(storeRoot, '2020-01-01');
        const recentPartition = path.join(storeRoot, '2999-01-01');
        await fs.mkdir(stalePartition, { recursive: true });
        await fs.mkdir(recentPartition, { recursive: true });
        await fs.writeFile(path.join(stalePartition, 'wl_stale_aaaaaa.json'), '{}', 'utf8');
        await fs.writeFile(path.join(recentPartition, 'wl_fresh_aaaaaa.json'), '{}', 'utf8');

        const recorder = createWireLogRecorder({ storeRoot });
        expect(recorder.options.retentionDays).toBe(2);
        recorder.begin({ url: 'u', headers: {}, body: {} });
        await recorder.flush();

        await expect(fs.readdir(stalePartition)).rejects.toThrow();
        await expect(fs.readdir(recentPartition)).resolves.toEqual(['wl_fresh_aaaaaa.json']);
    });

    test('a disabled recorder never sweeps, so an opt-out leaves the disk alone', async () => {
        const { createWireLogRecorder } = await importRecorder();
        const stalePartition = path.join(storeRoot, '2020-01-01');
        await fs.mkdir(stalePartition, { recursive: true });

        const recorder = createWireLogRecorder({ storeRoot, enabled: false });
        recorder.begin({ url: 'u', headers: {}, body: {} });
        await recorder.flush();

        await expect(fs.readdir(stalePartition)).resolves.toEqual([]);
    });

    test('a default recorder also drops 48h-old records that share a kept day', async () => {
        const { createWireLogRecorder } = await importRecorder();
        // Yesterday's partition holds one record 50h old (outside the window)
        // and one 20h old (inside it). The day-granular sweep keeps the whole
        // partition, so only a record-level sweep can honour 48h here — and it
        // must not take the 20h record with it.
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const partition = path.join(storeRoot, yesterday);
        await fs.mkdir(partition, { recursive: true });
        const staleTs = Date.now() - 50 * 60 * 60 * 1000;
        const freshTs = Date.now() - 20 * 60 * 60 * 1000;
        await fs.writeFile(
            path.join(partition, 'wl_stale_aaaaaa.json'),
            JSON.stringify({ id: 'wl_stale_aaaaaa', ts: staleTs, status: 'completed' }),
            'utf8',
        );
        await fs.writeFile(
            path.join(partition, 'wl_fresh_aaaaaa.json'),
            JSON.stringify({ id: 'wl_fresh_aaaaaa', ts: freshTs, status: 'completed' }),
            'utf8',
        );

        const recorder = createWireLogRecorder({ storeRoot });
        recorder.begin({ url: 'u', headers: {}, body: {} });
        await recorder.flush();

        expect(await fs.readdir(partition)).toEqual(['wl_fresh_aaaaaa.json']);
    });

    test('never fails the session when the purge cannot read the root', async () => {
        const { createWireLogRecorder } = await importRecorder();
        const blocker = path.join(tempRoot, 'blocker');
        await fs.writeFile(blocker, 'not a directory', 'utf8');
        const errors = [];
        const recorder = createWireLogRecorder({
            storeRoot: path.join(blocker, 'nested'),
            enabled: true,
            onError: message => errors.push(message),
        });
        const session = recorder.begin({ url: 'u', headers: {}, body: {} });

        expect(session).not.toBeNull();
        expect(() => session.complete({ status: 200, body: {} })).not.toThrow();
        await expect(recorder.flush()).resolves.toBeUndefined();
    });
});

describe('createWireLogRecorder — streaming', () => {
    test('assembles SSE chunks and records timing', async () => {
        const { createWireLogRecorder } = await importRecorder();
        const recorder = createWireLogRecorder({ storeRoot, enabled: true });
        const session = recorder.begin({ url: 'u', headers: {}, body: { stream: true } });

        const tap = session.stream({ status: 200, statusText: 'OK', headers: {} });
        tap.onChunk(Buffer.from('data: {"choices":[{"delta":{"content":"He"}}]}\n\n', 'utf8'));
        tap.onChunk(Buffer.from('data: {"choices":[{"delta":{"content":"llo"},"finish_reason":"stop"}]}\n\n', 'utf8'));
        tap.onChunk(Buffer.from('data: [DONE]\n\n', 'utf8'));
        session.completeStream();
        await recorder.flush();

        const records = await collectRecords(storeRoot);
        expect(records[0].status).toBe('completed');
        expect(records[0].response.streamed).toBe(true);
        expect(records[0].response.body.assembled.content).toBe('Hello');
        expect(records[0].response.body.assembled.finishReason).toBe('stop');
        expect(records[0].response.chunks).toBe(3);
        expect(records[0].response.bytes).toBeGreaterThan(0);
        // A stream without a usage event leaves the counts unknown.
        expect(records[0].response.usage).toBeNull();
        expect(records[0].response.body.assembled.usage ?? null).toBeNull();
    });

    test('captureBody false keeps byte and message/tool metadata', async () => {
        const { createWireLogRecorder } = await importRecorder();
        const recorder = createWireLogRecorder({ storeRoot, captureBody: false });
        const session = recorder.begin({ url: 'u', headers: {}, body: { messages: [{ role: 'user' }], tools: [{ type: 'function' }] } });
        const tap = session.stream({ status: 200, headers: {} });
        tap.onChunk(Buffer.from('data: {"choices":[]}\n\n'));
        session.completeStream();
        await recorder.flush();
        const records = await collectRecords(storeRoot);
        expect(records[0].request.bytes).toBeGreaterThan(0);
        expect(records[0].request.body).toBeNull();
        expect(records[0].response.bytes).toBeGreaterThan(0);
    });

    test('does not retain streamed bodies beyond maxFileBytes', async () => {
        const { createWireLogRecorder } = await importRecorder();
        const recorder = createWireLogRecorder({ storeRoot, maxFileBytes: 32 });
        const session = recorder.begin({ url: 'u', headers: {}, body: {} });
        const tap = session.stream({ status: 200, headers: {} });
        tap.onChunk(Buffer.from('data: {"choices":[{"delta":{"content":"' + 'x'.repeat(200) + '"}}]}\n\n'));
        session.completeStream();
        await recorder.flush();
        const records = await collectRecords(storeRoot);
        expect(records[0].response.bytes).toBeGreaterThan(32);
        expect(records[0].response.truncated).toBe(true);
        expect(records[0].response.body.raw).toEqual(expect.objectContaining({ __truncated: true }));
    });

    test('bounds persisted SSE content and tool calls while retaining total bytes', async () => {
        const { createWireLogRecorder } = await importRecorder();
        const recorder = createWireLogRecorder({ storeRoot, maxFileBytes: 96 });
        const session = recorder.begin({ url: 'u', headers: {}, body: {} });
        const tap = session.stream({ status: 200, headers: {} });
        for (const event of [
            { choices: [{ delta: { content: '中文'.repeat(80), tool_calls: [{ index: 0, id: 'call', type: 'function', function: { name: 'tool', arguments: 'x'.repeat(200) } }] } }] },
            { choices: [], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } },
        ]) tap.onChunk(Buffer.from(`data: ${JSON.stringify(event)}\n\n`));
        session.completeStream();
        await recorder.flush();
        const records = await collectRecords(storeRoot);
        expect(records[0].response.bytes).toBeGreaterThan(96);
        expect(records[0].response.truncated).toBe(true);
        expect(records[0].response.body.raw.__truncated).toBe(true);
        expect(records[0].response.usage).toBeNull();
    });

    test('marks an aborted stream instead of losing the record', async () => {
        const { createWireLogRecorder } = await importRecorder();
        const recorder = createWireLogRecorder({ storeRoot, enabled: true });
        const session = recorder.begin({ url: 'u', headers: {}, body: { stream: true } });
        const tap = session.stream({ status: 200, headers: {} });
        tap.onChunk(Buffer.from('data: {"choices":[{"delta":{"content":"par"}}]}\n\n', 'utf8'));

        session.fail(new Error('aborted'));
        await recorder.flush();

        const records = await collectRecords(storeRoot);
        expect(records[0].status).toBe('error');
        expect(records[0].response.body.assembled.content).toBe('par');
    });
});

describe('createWireLogRecorder — token usage', () => {
    test('copies the usage block out of a non-streaming response', async () => {
        const { createWireLogRecorder } = await importRecorder();
        const recorder = createWireLogRecorder({ storeRoot, enabled: true });
        const session = recorder.begin({ url: 'u', headers: {}, body: { model: 'm' } });

        session.complete({
            status: 200,
            body: {
                choices: [{ message: { content: 'ok' } }],
                usage: {
                    prompt_tokens: 1200,
                    completion_tokens: 34,
                    total_tokens: 1234,
                    prompt_tokens_details: { cached_tokens: 300 },
                },
            },
        });
        await recorder.flush();

        const records = await collectRecords(storeRoot);
        expect(records[0].response.usage).toEqual({
            prompt_tokens: 1200,
            completion_tokens: 34,
            total_tokens: 1234,
            prompt_tokens_details: { cached_tokens: 300 },
        });
    });

    test('keeps the usage event of a streamed response', async () => {
        const { createWireLogRecorder } = await importRecorder();
        const recorder = createWireLogRecorder({ storeRoot, enabled: true });
        const session = recorder.begin({ url: 'u', headers: {}, body: { stream: true } });

        const tap = session.stream({ status: 200, headers: {} });
        tap.onChunk(Buffer.from('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n', 'utf8'));
        tap.onChunk(Buffer.from(
            'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":2,"total_tokens":12}}\n\n',
            'utf8',
        ));
        tap.onChunk(Buffer.from('data: [DONE]\n\n', 'utf8'));
        session.completeStream();
        await recorder.flush();

        const records = await collectRecords(storeRoot);
        // Providers that stream usage send it on a final event; it must reach
        // both the flat response projection and the assembled view.
        expect(records[0].response.usage).toEqual({ prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 });
        expect(records[0].response.body.assembled.usage).toEqual({ prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 });
    });

    test('records usage as null when the provider sends none', async () => {
        const { createWireLogRecorder } = await importRecorder();
        const recorder = createWireLogRecorder({ storeRoot, enabled: true });
        const session = recorder.begin({ url: 'u', headers: {}, body: { model: 'm' } });

        session.complete({ status: 200, body: { choices: [{ message: { content: 'ok' } }] } });
        await recorder.flush();

        const records = await collectRecords(storeRoot);
        expect(records[0].response.usage).toBeNull();
    });

    test('ignores a usage value that is not an object', async () => {
        const { createWireLogRecorder } = await importRecorder();
        const recorder = createWireLogRecorder({ storeRoot, enabled: true });
        const session = recorder.begin({ url: 'u', headers: {}, body: { model: 'm' } });

        session.complete({ status: 200, body: { choices: [], usage: 'n/a' } });
        await recorder.flush();

        const records = await collectRecords(storeRoot);
        expect(records[0].response.usage).toBeNull();
    });
});

describe('createWireLogRecorder — resilience', () => {
    test('stamps the active chat id onto the record context', async () => {
        const { createWireLogRecorder } = await importRecorder();
        const recorder = createWireLogRecorder({ storeRoot, enabled: true });
        const session = recorder.begin({
            url: 'u',
            headers: {},
            body: {},
            context: { type: 'normal' },
            chatId: 'chat-42',
        });

        expect(session.record.context.chatId).toBe('chat-42');
        session.complete({ status: 200, body: {} });
        await recorder.flush();

        const records = await collectRecords(storeRoot);
        expect(records[0].context).toEqual({ type: 'normal', chatId: 'chat-42' });
    });

    test('survives a write failure without throwing', async () => {
        const { createWireLogRecorder } = await importRecorder();
        const blocker = path.join(tempRoot, 'blocker');
        await fs.writeFile(blocker, 'not a directory', 'utf8');
        const recorder = createWireLogRecorder({ storeRoot: path.join(blocker, 'nested'), enabled: true });
        const session = recorder.begin({ url: 'u', headers: {}, body: {} });

        expect(() => session.complete({ status: 200, body: {} })).not.toThrow();
        await expect(recorder.flush()).resolves.toBeUndefined();
    });

    test('skips the body when captureBody is false', async () => {
        const { createWireLogRecorder } = await importRecorder();
        const recorder = createWireLogRecorder({ storeRoot, enabled: true, captureBody: false });
        const session = recorder.begin({ url: 'u', headers: {}, body: { model: 'm', messages: [{ role: 'user', content: 'secret' }] } });

        session.complete({ status: 200, body: { choices: [] } });
        await recorder.flush();

        const records = await collectRecords(storeRoot);
        expect(records[0].request.body).toBeNull();
        expect(records[0].response.body).toBeNull();
        expect(records[0].request.bytes).toBeGreaterThan(0);
    });
});

async function collectRecords(root) {
    const dates = await fs.readdir(root);
    const records = [];
    for (const date of dates) {
        const files = await fs.readdir(path.join(root, date));
        for (const file of files) {
            records.push(JSON.parse(await fs.readFile(path.join(root, date, file), 'utf8')));
        }
    }
    return records;
}
