import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';

let tempRoot = '';
let storeRoot = '';

async function importStore() {
    return import(`../src/wire-log-store.js?cacheBust=${Date.now()}-${Math.random()}`);
}

beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'wire-log-store-'));
    storeRoot = path.join(tempRoot, 'wire-logs');
});

afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('redactHeaders', () => {
    test('masks configured header names case-insensitively', async () => {
        const { redactHeaders } = await importStore();

        const redacted = redactHeaders(
            { Authorization: 'Bearer sk-abc', 'Content-Type': 'application/json', 'X-Api-Key': 'secret' },
            ['authorization', 'x-api-key'],
        );

        expect(redacted).toEqual({
            Authorization: '***redacted***',
            'Content-Type': 'application/json',
            'X-Api-Key': '***redacted***',
        });
    });

    test('returns an empty object for non-object input', async () => {
        const { redactHeaders } = await importStore();

        expect(redactHeaders(null, ['authorization'])).toEqual({});
        expect(redactHeaders('x', ['authorization'])).toEqual({});
    });
});

describe('truncateBody', () => {
    test('passes through bodies under the limit', async () => {
        const { truncateBody } = await importStore();

        const result = truncateBody({ a: 1 }, 1024);

        expect(result).toEqual({ value: { a: 1 }, truncated: false, bytes: expect.any(Number) });
        expect(result.value).toEqual({ a: 1 });
    });

    test('replaces oversized bodies with a marker carrying original bytes', async () => {
        const { truncateBody } = await importStore();

        const result = truncateBody({ big: 'x'.repeat(2048) }, 64);

        expect(result.truncated).toBe(true);
        expect(result.bytes).toBeGreaterThan(2048);
        expect(result.value).toEqual({ __truncated: true, bytes: result.bytes, limit: 64 });
    });
});

describe('createWireRecord', () => {
    test('builds a record with an idempotent id and no response yet', async () => {
        const { createWireRecord } = await importStore();

        const record = createWireRecord({
            url: 'https://api.openai.com/v1/chat/completions',
            headers: { authorization: 'Bearer x' },
            body: { model: 'gpt-5' },
            context: { type: 'normal', model: 'gpt-5' },
            redact: ['authorization'],
        });

        expect(record.id).toMatch(/^wl_/);
        expect(record.status).toBe('pending');
        expect(record.request.headers.authorization).toBe('***redacted***');
        expect(record.request.body).toEqual({ model: 'gpt-5' });
        expect(record.response).toBeNull();
    });
});

describe('writeRecord / readRecord / listRecords', () => {
    test('round-trips a record through disk', async () => {
        const { createWireRecord, writeRecord, readRecord } = await importStore();
        const record = createWireRecord({ url: 'u', headers: {}, body: { model: 'm' }, context: {}, redact: [] });
        record.status = 'completed';
        record.response = { status: 200, body: { ok: true } };

        await writeRecord(storeRoot, record);
        const loaded = await readRecord(storeRoot, record.id);

        expect(loaded.id).toBe(record.id);
        expect(loaded.response.body).toEqual({ ok: true });
    });

    test('leaves no temp files behind after a write', async () => {
        const { createWireRecord, writeRecord } = await importStore();
        const record = createWireRecord({ url: 'u', headers: {}, body: {}, context: {}, redact: [] });

        await writeRecord(storeRoot, record);

        const dirs = await fs.readdir(storeRoot);
        const dateDir = path.join(storeRoot, dirs[0]);
        const files = await fs.readdir(dateDir);
        expect(files.filter(name => name.endsWith('.tmp'))).toEqual([]);
        expect(files).toHaveLength(1);
    });

    test('lists newest first with metadata only', async () => {
        const { createWireRecord, writeRecord, listRecords } = await importStore();
        const older = createWireRecord({ url: 'u', headers: {}, body: { model: 'a' }, context: { type: 'normal' }, redact: [] });
        older.ts = 1_000;
        older.status = 'completed';
        older.request.bytes = 10;
        const newer = createWireRecord({ url: 'u', headers: {}, body: { model: 'b' }, context: { type: 'quiet' }, redact: [] });
        newer.ts = 2_000;
        newer.status = 'error';

        await writeRecord(storeRoot, older);
        await writeRecord(storeRoot, newer);
        const listed = await listRecords(storeRoot, {});

        expect(listed.map(item => item.id)).toEqual([newer.id, older.id]);
        expect(listed[0]).toMatchObject({ status: 'error', context: { type: 'quiet' } });
        // List entries never carry full bodies.
        expect(listed[0].request.body).toBeUndefined();
    });

    test('filters by status and type', async () => {
        const { createWireRecord, writeRecord, listRecords } = await importStore();
        const a = createWireRecord({ url: 'u', headers: {}, body: {}, context: { type: 'normal' }, redact: [] });
        a.status = 'completed';
        const b = createWireRecord({ url: 'u', headers: {}, body: {}, context: { type: 'quiet' }, redact: [] });
        b.status = 'error';
        await writeRecord(storeRoot, a);
        await writeRecord(storeRoot, b);

        expect((await listRecords(storeRoot, { status: 'error' })).map(item => item.id)).toEqual([b.id]);
        expect((await listRecords(storeRoot, { type: 'normal' })).map(item => item.id)).toEqual([a.id]);
    });

    test('projects response.usage onto the list entry', async () => {
        const { createWireRecord, writeRecord, listRecords } = await importStore();
        const counted = createWireRecord({ url: 'u', headers: {}, body: {}, context: {}, redact: [] });
        counted.status = 'completed';
        counted.response = {
            status: 200,
            streamed: false,
            body: { choices: [] },
            usage: { prompt_tokens: 11, completion_tokens: 4, total_tokens: 15 },
            bytes: 10,
            durationMs: 5,
            ttftMs: null,
            chunks: null,
        };
        const uncounted = createWireRecord({ url: 'u', headers: {}, body: {}, context: {}, redact: [] });
        uncounted.status = 'completed';
        uncounted.ts += 1;
        uncounted.response = {
            status: 200,
            streamed: false,
            body: { choices: [] },
            usage: null,
            bytes: 10,
            durationMs: 5,
            ttftMs: null,
            chunks: null,
        };
        await writeRecord(storeRoot, counted);
        await writeRecord(storeRoot, uncounted);

        const listed = await listRecords(storeRoot, {});
        // Newest first (uncounted has the later timestamp).
        expect(listed.map(entry => entry.id)).toEqual([uncounted.id, counted.id]);
        expect(listed[1].response.usage).toEqual({ prompt_tokens: 11, completion_tokens: 4, total_tokens: 15 });
        expect(listed[0].response.usage).toBeNull();
    });

    test('filters by chatId and ignores an absent one', async () => {
        const { createWireRecord, writeRecord, listRecords } = await importStore();
        const inChat = createWireRecord({ url: 'u', headers: {}, body: {}, context: { chatId: 'chat-a' }, redact: [] });
        inChat.status = 'completed';
        const otherChat = createWireRecord({ url: 'u', headers: {}, body: {}, context: { chatId: 'chat-b' }, redact: [] });
        otherChat.status = 'completed';
        const noChat = createWireRecord({ url: 'u', headers: {}, body: {}, context: { type: 'quiet' }, redact: [] });
        noChat.status = 'completed';
        await writeRecord(storeRoot, inChat);
        await writeRecord(storeRoot, otherChat);
        await writeRecord(storeRoot, noChat);

        expect((await listRecords(storeRoot, { chatId: 'chat-a' })).map(item => item.id)).toEqual([inChat.id]);
        expect((await listRecords(storeRoot, { chatId: 'chat-missing' }))).toEqual([]);
        // An empty/unset filter is not a filter.
        expect((await listRecords(storeRoot, { chatId: '' }))).toHaveLength(3);
        expect((await listRecords(storeRoot, {}))).toHaveLength(3);
    });

    test('combines chatId with the other filters', async () => {
        const { createWireRecord, writeRecord, listRecords } = await importStore();
        const match = createWireRecord({ url: 'u', headers: {}, body: {}, context: { chatId: 'chat-a', type: 'normal' }, redact: [] });
        match.status = 'completed';
        const wrongType = createWireRecord({ url: 'u', headers: {}, body: {}, context: { chatId: 'chat-a', type: 'quiet' }, redact: [] });
        wrongType.status = 'completed';
        await writeRecord(storeRoot, match);
        await writeRecord(storeRoot, wrongType);

        expect((await listRecords(storeRoot, { chatId: 'chat-a', type: 'normal' })).map(item => item.id)).toEqual([match.id]);
    });

    test('returns null for a missing record', async () => {
        const { readRecord } = await importStore();

        expect(await readRecord(storeRoot, 'wl_missing')).toBeNull();
    });
});

describe('path safety', () => {
    test('rejects ids that escape the store root', async () => {
        const { readRecord, deleteRecord, writeRecord, createWireRecord } = await importStore();

        await expect(readRecord(storeRoot, '../../etc/passwd')).rejects.toThrow(/invalid/i);
        await expect(deleteRecord(storeRoot, '../escape')).rejects.toThrow(/invalid/i);

        const record = createWireRecord({ url: 'u', headers: {}, body: {}, context: {}, redact: [] });
        await expect(writeRecord(storeRoot, { ...record, id: '../../../evil' })).rejects.toThrow(/invalid/i);
    });

    test('rejects date partitions that are not YYYY-MM-DD', async () => {
        const { listRecords } = await importStore();

        await expect(listRecords(storeRoot, { date: '../../..' })).rejects.toThrow(/invalid/i);
    });
});

describe('deleteRecord / purgeExpired', () => {
    test('deleteRecord removes the file', async () => {
        const { createWireRecord, writeRecord, deleteRecord, readRecord } = await importStore();
        const record = createWireRecord({ url: 'u', headers: {}, body: {}, context: {}, redact: [] });
        await writeRecord(storeRoot, record);

        expect(await deleteRecord(storeRoot, record.id)).toBe(true);
        expect(await readRecord(storeRoot, record.id)).toBeNull();
        expect(await deleteRecord(storeRoot, record.id)).toBe(false);
    });

    test('purgeExpired drops date directories older than the retention window', async () => {
        const { createWireRecord, writeRecord, purgeExpired } = await importStore();
        const now = new Date('2026-03-15T12:00:00Z');
        const recent = createWireRecord({ url: 'u', headers: {}, body: {}, context: {}, redact: [] });
        recent.ts = now.getTime();
        const stale = createWireRecord({ url: 'u', headers: {}, body: {}, context: {}, redact: [] });
        stale.ts = new Date('2026-03-01T12:00:00Z').getTime();
        await writeRecord(storeRoot, recent);
        await writeRecord(storeRoot, stale);

        const removed = await purgeExpired(storeRoot, { retentionDays: 7, now });

        expect(removed).toBe(1);
        const remaining = await fs.readdir(storeRoot);
        expect(remaining).toEqual(['2026-03-15']);
    });

    test('purgeExpired is a no-op for a missing root', async () => {
        const { purgeExpired } = await importStore();

        expect(await purgeExpired(path.join(tempRoot, 'nope'), { retentionDays: 7 })).toBe(0);
    });

    test('purgeExpired defaults to the 48h (2 day) window', async () => {
        const { createWireRecord, writeRecord, purgeExpired } = await importStore();
        const now = new Date('2026-03-15T12:00:00Z');
        const partitions = ['2026-03-15', '2026-03-14', '2026-03-01', '2026-02-28'];
        for (const [index, day] of partitions.entries()) {
            const record = createWireRecord({ url: 'u', headers: {}, body: {}, context: {}, redact: [] });
            record.ts = new Date(`${day}T12:00:00Z`).getTime();
            await writeRecord(storeRoot, record);
            // Distinct ts per record keeps the ids unique.
            record.ts += index;
        }

        // The cutoff partition is day-granular: 2026-03-13 (exactly 48h back)
        // is still inside the window, everything older is dropped.
        expect(await purgeExpired(storeRoot, { now })).toBe(2);
    });

    test('purges only partitions before cutoff day', async () => {
        const { createWireRecord, writeRecord, purgeExpired } = await importStore();
        const now = new Date('2026-03-15T12:00:00Z');
        for (const day of ['2026-03-13', '2026-03-12']) {
            const record = createWireRecord({ url: 'u', headers: {}, body: {}, context: {}, redact: [] });
            record.ts = new Date(`${day}T12:00:00Z`).getTime();
            await writeRecord(storeRoot, record);
        }
        await purgeExpired(storeRoot, { now });
        expect(await fs.readdir(storeRoot)).toEqual(['2026-03-13']);
    });
});

describe('purgeExpiredRecords', () => {
    test('real writeRecord records at cutoff minus/equal/plus one millisecond', async () => {
        const { createWireRecord, writeRecord, purgeExpiredRecords, readRecord } = await importStore();
        const now = new Date('2026-03-15T12:00:00Z');
        const records = [-1, 0, 1].map(offset => {
            const record = createWireRecord({ url: 'u', headers: {}, body: {}, context: {}, redact: [] });
            record.ts = now.getTime() - 48 * 60 * 60 * 1000 + offset;
            return record;
        });
        for (const record of records) await writeRecord(storeRoot, record);
        expect(await purgeExpiredRecords(storeRoot, { now })).toBe(1);
        expect(await readRecord(storeRoot, records[0].id)).toBeNull();
        expect(await readRecord(storeRoot, records[1].id)).not.toBeNull();
        expect(await readRecord(storeRoot, records[2].id)).not.toBeNull();
    });
    test('removes records older than 48h inside a partition the day sweep keeps', async () => {
        const { createWireRecord, writeRecord, purgeExpiredRecords, listRecords } = await importStore();
        const now = new Date('2026-03-15T12:00:00Z');
        // Same day partition, two ages: 50h is already outside a 48h window,
        // 20h is not. The day-granular sweep keeps both, which is the gap this
        // pass exists for.
        const old = createWireRecord({ url: 'u', headers: {}, body: {}, context: {}, redact: [] });
        old.ts = new Date('2026-03-13T10:00:00Z').getTime();
        const recent = createWireRecord({ url: 'u', headers: {}, body: {}, context: {}, redact: [] });
        recent.ts = new Date('2026-03-14T16:00:00Z').getTime();
        await writeRecord(storeRoot, old);
        await writeRecord(storeRoot, recent);

        expect(await purgeExpiredRecords(storeRoot, { now })).toBe(1);
        expect((await listRecords(storeRoot, {})).map(entry => entry.id)).toEqual([recent.id]);
        // The partition survives with the record that is still inside the window.
        expect((await fs.readdir(path.join(storeRoot, '2026-03-13'))).length).toBe(0);
        expect(await fs.readdir(path.join(storeRoot, '2026-03-14'))).toEqual([`${recent.id}.json`]);
    });

    test('keeps records written exactly at the cutoff', async () => {
        const { createWireRecord, writeRecord, purgeExpiredRecords } = await importStore();
        const now = new Date('2026-03-15T12:00:00Z');
        const boundary = createWireRecord({ url: 'u', headers: {}, body: {}, context: {}, redact: [] });
        boundary.ts = now.getTime() - 2 * 24 * 60 * 60 * 1000;
        await writeRecord(storeRoot, boundary);

        expect(await purgeExpiredRecords(storeRoot, { now })).toBe(0);
        expect((await fs.readdir(path.join(storeRoot, '2026-03-13')))).toEqual([`${boundary.id}.json`]);
    });

    test('is a no-op for a missing root and a non-positive window', async () => {
        const { createWireRecord, writeRecord, purgeExpiredRecords } = await importStore();
        const stale = createWireRecord({ url: 'u', headers: {}, body: {}, context: {}, redact: [] });
        stale.ts = new Date('2020-01-01T00:00:00Z').getTime();
        await writeRecord(storeRoot, stale);

        expect(await purgeExpiredRecords(path.join(tempRoot, 'nope'), {})).toBe(0);
        expect(await purgeExpiredRecords(storeRoot, { retentionDays: 0 })).toBe(0);
        expect(await purgeExpiredRecords(storeRoot, { retentionDays: Number.NaN })).toBe(0);
    });

    test('leaves an unreadable record alone instead of deleting on a guess', async () => {
        const { purgeExpiredRecords } = await importStore();
        const partition = path.join(storeRoot, '2020-01-01');
        await fs.mkdir(partition, { recursive: true });
        await fs.writeFile(path.join(partition, 'wl_corrupt_aaaaaa.json'), '{not json', 'utf8');

        expect(await purgeExpiredRecords(storeRoot, { now: new Date('2026-03-15T12:00:00Z') })).toBe(0);
        expect(await fs.readdir(partition)).toEqual(['wl_corrupt_aaaaaa.json']);
    });
});
