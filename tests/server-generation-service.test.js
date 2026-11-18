import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeAll, expect, test } from '@jest/globals';
import { runCanonicalMigrations } from '../src/canonical-sqlite-migrations.ts';
import { withCanonicalTransaction } from '../src/canonical-sqlite.ts';
import { readCanonicalChatPayload } from '../src/endpoints/canonical-chat-read-service.ts';
import { writeCanonicalChatPayload, deleteCanonicalChat, renameCanonicalChat } from '../src/endpoints/canonical-chat-write-service.ts';
import { createCanonicalChatSessionRecord, deleteCanonicalChatSessionsForOwner, getCanonicalChatSession, importCanonicalChatProjection, retargetCanonicalChatSessionsOwner, upsertCanonicalChatSession } from '../src/endpoints/canonical-chat-store.ts';
import { createCanonicalChatBackup, getCanonicalChatRestoreVersion, restoreCanonicalChatBackup } from '../src/endpoints/canonical-chat-backup-restore-service.ts';

let createServerGenerationService;
beforeAll(async () => {
    ({ createServerGenerationService } = await import('../src/server-generation-service.ts'));
});

const cleanups = [];
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); });
const one = { ownerType: 'character', ownerId: 'alice', sourcePath: 'chats/alice/one.jsonl' };
const two = { ...one, ownerId: 'bob', sourcePath: 'chats/bob/two.jsonl' };
const header = { chat_metadata: {} };
const user = { is_user: true, mes: 'hello' };
const assistant = { is_user: false, name: 'Alice', mes: 'old', extra: { keep: true } };
const writeOptions = { projection: 'off', projectJsonl() {} };

function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'server-generation-'));
    const filename = path.join(root, 'emberdesk.sqlite');
    const db = new DatabaseSync(filename);
    const observer = new DatabaseSync(filename);
    cleanups.push(() => { db.close(); observer.close(); fs.rmSync(root, { recursive: true, force: true }); });
    expect(runCanonicalMigrations(db).ok).toBe(true);
    const seed = (locator, payload = [header]) => writeCanonicalChatPayload({ db, locator, payload, ...writeOptions, condition: { create: true } });
    const version = locator => getCanonicalChatSession(observer, locator)?.concurrency_token;
    const payload = locator => readCanonicalChatPayload(observer, locator);
    const edit = locator => writeCanonicalChatPayload({ db: observer, locator, payload: [header, { mes: 'edit' }], ...writeOptions, condition: { version: version(locator) } });
    return { db, observer, seed, version, payload, edit, root };
}

function controlled() {
    const calls = [];
    const service = createServerGenerationService({ execute(input) {
        const completion = Promise.withResolvers();
        calls.push({ ...input, ...completion });
        return completion.promise;
    } });
    return { service, calls };
}

function send(f, service, locator = one, requestId = 'request-1', expectedVersion = f.version(locator)) {
    return service.create(f.db, {
        locator, requestId, version: expectedVersion, kind: 'send', userMessage: user,
        capturePrompt(txn, input) { return { payload: readCanonicalChatPayload(txn, locator), version: input.version }; },
    });
}

function terminal(service, db, id) {
    const done = Promise.withResolvers();
    const detach = service.subscribe(db, id, event => {
        if (event.type === 'terminal' || (event.type === 'snapshot' && event.run.status !== 'running')) done.resolve(event.run);
    });
    return done.promise.finally(() => detach?.());
}

test('persisted send, replay before stale version/busy, and independent chats under the same request ID', async () => {
    const f = fixture();
    f.seed(one);
    f.seed(two);
    const v = f.version(one);
    const { service, calls } = controlled();
    const a = send(f, service);
    const b = send(f, service, two);
    expect(a.status).toBe('running');
    expect(b.id).not.toBe(a.id);
    expect(send(f, service, one, 'request-1', v).id).toBe(a.id);
    expect(() => send(f, service, one, 'request-2')).toThrow('chat_generation_busy');
    expect(f.payload(one)).toEqual([header, user]);
    expect(service.find(f.observer, one)).toEqual({ ...a, chatVersion: f.version(one) });
    expect(() => f.edit(one)).toThrow('chat_generation_busy');
    expect(() => renameCanonicalChat({ db: f.observer, locator: one, nextLocator: { ...one, sourcePath: 'chats/alice/renamed.jsonl' }, version: f.version(one), projection: 'off', projectRename() {} })).toThrow('chat_generation_busy');
    expect(() => deleteCanonicalChat({ db: f.observer, locator: one, version: f.version(one), projection: 'off', projectDelete() {} })).toThrow('chat_generation_busy');
    expect(() => withCanonicalTransaction(f.observer, txn => retargetCanonicalChatSessionsOwner(txn, { oldOwnerId: 'alice', newOwnerId: 'moved' }))).toThrow('chat_generation_busy');
    expect(() => withCanonicalTransaction(f.observer, txn => deleteCanonicalChatSessionsForOwner(txn, 'alice'))).toThrow('chat_generation_busy');
    await Promise.resolve();
    expect(calls.map(call => call.prompt.payload)).toEqual([[header, user], [header, user]]);
    expect(calls[0].prompt.version).toBe(f.version(one));
    const done = terminal(service, f.observer, a.id);
    calls[0].resolve({ ...assistant, mes: 'full' });
    expect(await done).toMatchObject({ status: 'completed', version: f.version(one) });
    expect(f.payload(one)).toEqual([header, user, { ...assistant, mes: 'full' }]);
    expect(service.cancel(f.db, a.id).status).toBe('completed');
    expect(f.edit(one).ok).toBe(true);
    expect(service.query(f.db, b.id).status).toBe('running');
    service.cancel(f.db, b.id);
    calls[1].resolve(assistant);
});

test('creation and completion failures roll back their paired chat change', async () => {
    const f = fixture();
    f.seed(one);
    const v = f.version(one);
    const { service, calls } = controlled();
    const start = { locator: one, requestId: 'request-1', version: v, kind: 'send', userMessage: user };
    expect(() => service.create(f.db, { ...start, capturePrompt() { throw new Error('capture fault'); } })).toThrow('capture fault');
    expect(() => send(f, service, one, 'stale', 'invalid-version')).toThrow('chat_conflict');
    expect(f.payload(one)).toEqual([header]);
    expect(f.version(one)).toBe(v);
    expect(service.find(f.db, one)).toBeNull();
    const a = send(f, service);
    const done = terminal(service, f.db, a.id);
    f.db.exec("CREATE TEMP TRIGGER enqueue_message_fault BEFORE INSERT ON chat_messages WHEN json_extract(NEW.payload_json, '$.mes') = 'old' BEGIN SELECT RAISE(ABORT, 'reply fault'); END");
    await Promise.resolve();
    calls[0].resolve(assistant);
    expect(await done).toMatchObject({ status: 'failed', error: 'chat_commit_failed' });
    expect(f.payload(one)).toEqual([header, user]);
    expect(f.version(one)).toBe(a.version);
});

test('unconditional upsert and passive projection cannot overwrite an active chat', () => {
    const f = fixture();
    f.seed(one);
    const { service } = controlled();
    const run = send(f, service);
    const record = createCanonicalChatSessionRecord(f.observer, { locator: one, payload: [header] });
    expect(() => upsertCanonicalChatSession(f.observer, record)).toThrow('chat_generation_busy');
    expect(importCanonicalChatProjection(f.observer, record)).toEqual({ status: 'suppressed' });
    expect(f.payload(one)).toEqual([header, user]);
    service.cancel(f.db, run.id);
});

test('first send can create a chat atomically, and replay still works after rename', async () => {
    const f = fixture();
    const { service, calls } = controlled();
    const input = { locator: one, requestId: 'first', kind: 'send', header, userMessage: user, capturePrompt: (_, chat) => chat };
    expect(() => service.create(f.db, { ...input, capturePrompt() { throw new Error('capture fault'); } })).toThrow('capture fault');
    expect(f.payload(one)).toBeNull();
    const a = service.create(f.db, input);
    expect(f.payload(one)).toEqual([header, user]);
    expect(service.create(f.db, input).id).toBe(a.id);
    await Promise.resolve();
    const done = terminal(service, f.db, a.id);
    calls[0].resolve(assistant);
    await done;
    const next = { ...one, sourcePath: 'chats/alice/renamed.jsonl' };
    expect(renameCanonicalChat({ db: f.db, locator: one, nextLocator: next, version: f.version(one), projection: 'off', projectRename() {} }).ok).toBe(true);
    expect(service.create(f.db, { ...input, locator: next }).id).toBe(a.id);
});

test('late subscription and reentrant delivery, detach/reconnect, cancellation and late result', async () => {
    const f = fixture();
    f.seed(one);
    const { service, calls } = controlled();
    const a = send(f, service);
    await Promise.resolve();
    const call = calls[0];
    call.emit('a');
    const first = [];
    const detach = service.subscribe(f.observer, a.id, event => {
        first.push(event);
        if (event.type === 'snapshot') call.emit('b');
    });
    detach();
    expect(call.signal.aborted).toBe(false);
    call.emit('c');
    const second = [];
    service.subscribe(f.db, a.id, event => second.push(event));
    call.emit('d');
    expect(service.cancel(f.observer, a.id).status).toBe('cancelled');
    expect(call.signal.aborted).toBe(true);
    call.emit('late');
    call.resolve(assistant);
    await Promise.resolve();
    expect(first.map(event => [event.type, event.text])).toEqual([['snapshot', 'a'], ['delta', 'b']]);
    expect(second.map(event => [event.type, event.text])).toEqual([['snapshot', 'abc'], ['delta', 'd'], ['terminal', undefined]]);
    expect(service.query(f.db, a.id).status).toBe('cancelled');
    expect(f.payload(one)).toEqual([header, user]);
});

test('regenerate and continue only change the original on successful commit', async () => {
    const f = fixture();
    const retained = [header, user, { ...assistant, mes: 'Manual reply', extra: { api: 'manual' } }];
    const previous = [...retained, assistant, { is_system: true, mes: 'Tool step', extra: { tool_invocations: [] } }, { ...assistant, mes: 'Old final' }];
    f.seed(one, previous);
    const { service, calls } = controlled();
    const create = (kind, requestId) => service.create(f.db, {
        locator: one, requestId, version: f.version(one), kind,
        capturePrompt: (_, input) => input,
    });
    const failure = create('regenerate', 'failed');
    await Promise.resolve();
    const failed = terminal(service, f.db, failure.id);
    calls[0].reject(new Error('upstream failed'));
    expect(await failed).toMatchObject({ status: 'failed', error: 'generation_failed' });
    expect(f.payload(one)).toEqual(previous);
    expect(f.version(one)).toBe(failure.version);
    const stopped = create('regenerate', 'stopped');
    await Promise.resolve();
    expect(service.cancel(f.observer, stopped.id).status).toBe('cancelled');
    calls[1].resolve(assistant);
    await Promise.resolve();
    expect(f.payload(one)).toEqual(previous);
    const regen = create('regenerate', 'regen');
    await Promise.resolve();
    expect(calls[2].prompt.payload).toEqual(retained);
    expect(f.payload(one)).toEqual(previous);
    const regenerated = terminal(service, f.db, regen.id);
    const replacement = { ...assistant, mes: 'new' };
    calls[2].resolve(replacement);
    expect((await regenerated).status).toBe('completed');
    expect(f.payload(one)).toEqual([...retained, replacement]);
    const continuation = create('continue', 'continue');
    await Promise.resolve();
    expect(calls[3].prompt.payload).toEqual([...retained, replacement]);
    expect(calls[3].prompt.original).toEqual(replacement);
    const continued = terminal(service, f.db, continuation.id);
    calls[3].resolve({ ...replacement, mes: 'new extended' });
    expect((await continued).status).toBe('completed');
    expect(f.payload(one)).toEqual([...retained, { ...replacement, mes: 'new extended' }]);
});

test('orphaned runs recover, but another service in this process does not interrupt a live run', () => {
    const f = fixture();
    const other = fixture();
    f.seed(one);
    f.seed(two);
    other.seed(one);
    const seedOrphan = (fixture, locator, id) => fixture.db.prepare(`
        INSERT INTO chat_generation_runs (id, chat_id, request_id, kind, status, version, created_at_ms)
        VALUES (?, ?, ?, 'send', 'running', ?, ?)
    `).run(id, getCanonicalChatSession(fixture.db, locator).id, id, fixture.version(locator), Date.now());
    seedOrphan(f, one, 'orphan-a');
    seedOrphan(f, two, 'orphan-b');
    seedOrphan(other, one, 'orphan-c');
    const { service } = controlled();
    const observer = controlled().service;
    expect(service.query(f.observer, 'orphan-a')).toMatchObject({ status: 'interrupted' });
    expect(service.find(f.db, two)).toMatchObject({ id: 'orphan-b', status: 'interrupted' });
    const a = send(f, service, one, 'request-2');
    const c = send(other, service, one, 'request-2');
    try {
        expect(service.query(other.db, 'orphan-c').status).toBe('interrupted');
        expect(observer.query(other.db, a.id)).toBeNull();
        expect(observer.query(f.observer, a.id)?.status).toBe('running');
        expect(() => f.edit(one)).toThrow('chat_generation_busy');
    } finally {
        service.cancel(f.db, a.id);
        service.cancel(other.db, c.id);
    }
});

test('chat restore refuses to replace histories with active runs', async () => {
    const f = fixture();
    f.seed(one);
    const directories = { root: f.root, chats: path.join(f.root, 'chats') };
    const backup = createCanonicalChatBackup({ db: f.db, handle: 'alice', directories });
    const { service } = controlled();
    const a = send(f, service);
    const result = await restoreCanonicalChatBackup({ db: f.observer, backup, handle: 'alice', directories, expectedVersion: getCanonicalChatRestoreVersion(f.db) });
    expect(result).toMatchObject({ status: 'blocked', reasonCode: 'chat_generation_busy', commitState: 'not_committed' });
    expect(f.payload(one)).toEqual([header, user]);
    service.cancel(f.db, a.id);
});
