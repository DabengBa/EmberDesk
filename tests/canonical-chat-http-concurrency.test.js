import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

import express from 'express';
import { afterAll, beforeAll, expect, jest, test } from '@jest/globals';
import { setConfigFilePath } from '../src/util.js';
import { canonicalSqliteManager } from '../src/canonical-sqlite.js';
import { runCanonicalMigrations } from '../src/canonical-sqlite-migrations.js';
import { auditCanonicalChatShadowImport, runCanonicalChatShadowImport } from '../src/canonical-chat-shadow-import.js';

jest.setTimeout(20000);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-chat-http-concurrency-'));
const configPath = path.join(root, 'config.yaml');
fs.writeFileSync(configPath, `backups:\n  chat:\n    enabled: false\nfeatures:\n  storage:\n    canonicalSqlite:\n      enabled: true\n      shadowImport: true\n      reads: true\n      writes: true\n      strict: false\n      slices:\n        chats:\n          enabled: true\n          shadowImport: true\n          reads: true\n          writes: true\n          projection: sync\n`);
setConfigFilePath(configPath);
const { router } = await import('../src/endpoints/chats.js');

const directories = Object.fromEntries(['storage', 'chats', 'groupChats', 'backups'].map(name => [name, path.join(root, name)]));
directories.root = root;
let server;
let url;
const payload = [{ chat_metadata: {} }, { name: 'User', mes: 'Original' }];
const avatar_url = 'alice.png';

beforeAll(async () => {
    for (const dir of Object.values(directories)) fs.mkdirSync(dir, { recursive: true });
    const chatDir = path.join(directories.chats, 'alice');
    fs.mkdirSync(chatDir, { recursive: true });
    fs.writeFileSync(path.join(chatDir, 'first.jsonl'), payload.map(JSON.stringify).join('\n'));
    const db = canonicalSqliteManager.open({ handle: 'alice', directories, featureFlags: { enabled: true, strict: false } });
    runCanonicalMigrations(db);
    await runCanonicalChatShadowImport({ handle: 'alice', directories, db, featureFlags: { enabled: true, shadowImport: true, strict: false } });
    await auditCanonicalChatShadowImport({ handle: 'alice', directories, db });
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.user = { directories, profile: { handle: 'alice' } }; next(); });
    app.use((req, _res, next) => {
        if (req.path === '/chats/import' && typeof req.body?.testUpload === 'string') {
            const filename = `upload-${Math.random().toString(16).slice(2)}.jsonl`;
            fs.writeFileSync(path.join(root, filename), req.body.testUpload);
            req.file = { destination: root, filename };
        }
        next();
    });
    app.use((req, res, next) => {
        if (req.get('x-test-drop-response') === 'yes') {
            res.send = () => { res.socket.destroy(); return res; };
        }
        next();
    });
    app.use('/chats', router);
    await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
    url = `http://127.0.0.1:${server.address().port}/chats`;
});

afterAll(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
});

async function post(route, body) {
    return fetch(`${url}${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

test('import retry after a disconnected response does not overwrite later edits', async () => {
    const body = { avatar_url, file_type: 'jsonl', character_name: 'Alice', user_name: 'User', operationId: 'import-lost-response', testUpload: '{"chat_metadata":{}}\n{"mes":"imported"}' };
    await expect(fetch(`${url}/import`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-test-drop-response': 'yes' }, body: JSON.stringify(body) })).rejects.toThrow();
    const replay = await post('/import', body);
    expect(replay.status).toBe(200);
    const result = await replay.json();
    expect(result.fileNames).toHaveLength(1);
    const file_name = result.fileNames[0].replace(/\.jsonl$/, '');
    const read = await post('/get', { avatar_url, file_name });
    const version = read.headers.get('x-chat-version');
    const later = [{ chat_metadata: {} }, { mes: 'later edit' }];
    expect((await post('/save', { avatar_url, file_name, chat: later, version, operationId: 'import-later-edit' })).status).toBe(200);
    expect(await (await post('/import', body)).json()).toEqual(result);
    expect(await (await post('/get', { avatar_url, file_name })).json()).toEqual(later);
    expect((await post('/import', { ...body, testUpload: '{"chat_metadata":{}}\n{"mes":"different"}' })).status).toBe(409);
});

test('multi-chat import never overwrites a colliding target and resumes committed items safely', async () => {
    const operationId = 'import-partial';
    const key = crypto.createHash('sha256').update(operationId).digest('hex');
    const name = index => `Alice - ${key}-${index} imported`;
    const original = [{ chat_metadata: {} }, { mes: 'existing target' }];
    const create = await post('/save', { avatar_url, file_name: name(1), chat: original, create: true, operationId: 'import-collision-create' });
    const { version: collisionVersion } = await create.json();
    const upload = JSON.stringify({ histories: { histories: [{ msgs: [{ src: { is_human: true }, text: 'one' }] }, { msgs: [{ src: { is_human: true }, text: 'two' }] }] } });
    const body = { avatar_url, file_type: 'json', character_name: 'Alice', user_name: 'User', operationId, testUpload: upload };
    const conflict = await post('/import', body);
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).completed).toEqual([`${name(0)}.jsonl`]);
    expect(await (await post('/get', { avatar_url, file_name: name(1) })).json()).toEqual(original);
    const first = await post('/get', { avatar_url, file_name: name(0) });
    const version = first.headers.get('x-chat-version');
    const edit = [{ chat_metadata: {} }, { mes: 'edited after partial import' }];
    expect((await post('/save', { avatar_url, file_name: name(0), chat: edit, version, operationId: 'partial-later-edit' })).status).toBe(200);
    expect((await post('/delete', { avatar_url, chatfile: name(1), version: collisionVersion, operationId: 'partial-remove-collision' })).status).toBe(200);
    const retry = await post('/import', body);
    expect(retry.status).toBe(200);
    expect((await retry.json()).fileNames).toEqual([`${name(0)}.jsonl`, `${name(1)}.jsonl`]);
    expect(await (await post('/get', { avatar_url, file_name: name(0) })).json()).toEqual(edit);
});
test('versions, explicit creation, stale writes and durable operation replay over real HTTP', async () => {
    const read = await post('/get', { avatar_url, file_name: 'first' });
    expect(await read.json()).toEqual(payload);
    const version = read.headers.get('x-chat-version');
    expect(version).toMatch(/^[0-9a-f]{32}$/);
    const legacy = await post('/save', { avatar_url, file_name: 'first', chat: payload });
    expect(legacy.status).toBe(428);
    const deleted = await post('/delete', { avatar_url, chatfile: 'first', version, operationId: 'delete-first' });
    expect(deleted.ok).toBe(true);
    const deletedResult = await deleted.json();
    const stale = await post('/save', { avatar_url, file_name: 'first', chat: payload, version, operationId: 'save-stale' });
    expect(stale.status).toBe(409);
    const reread = await post('/get', { avatar_url, file_name: 'first' });
    expect(await reread.json()).toEqual({});
    const created = await post('/save', { avatar_url, file_name: 'first', chat: payload, create: true, operationId: 'create-first' });
    expect(created.status).toBe(200);
    const createResult = await created.json();
    expect(createResult.version).toMatch(/^[0-9a-f]{32}$/);
    expect(createResult.version).not.toBe(version);
    const retryDelete = await post('/delete', { avatar_url, chatfile: 'first', version, operationId: 'delete-first' });
    expect(retryDelete.status).toBe(200);
    expect(await retryDelete.json()).toEqual(deletedResult);
    const retryCreate = await post('/save', { avatar_url, file_name: 'first', chat: payload, create: true, operationId: 'create-first' });
    expect(await retryCreate.json()).toEqual(createResult);
    const reused = await post('/save', { avatar_url, file_name: 'first', chat: [...payload, { mes: 'different' }], create: true, operationId: 'create-first' });
    expect(reused.status).toBe(409);
    const current = await post('/get', { avatar_url, file_name: 'first' });
    expect(current.headers.get('x-chat-version')).toBe(createResult.version);
    expect(await current.json()).toEqual(payload);
});

test('a stale delete cannot erase a later edit, including a force save attempt', async () => {
    const read = await post('/get', { avatar_url, file_name: 'first' });
    const oldVersion = read.headers.get('x-chat-version');
    const edit = [{ chat_metadata: {} }, { name: 'User', mes: 'New edit' }];
    const saved = await post('/save', { avatar_url, file_name: 'first', chat: edit, version: oldVersion, operationId: 'save-new-edit' });
    expect(saved.status).toBe(200);
    const { version: newVersion } = await saved.json();
    expect(newVersion).not.toBe(oldVersion);
    const staleDelete = await post('/delete', { avatar_url, chatfile: 'first', version: oldVersion, operationId: 'delete-stale' });
    expect(staleDelete.status).toBe(409);
    const force = await post('/save', { avatar_url, file_name: 'first', chat: payload, force: true, version: oldVersion, operationId: 'force-stale' });
    expect(force.status).toBe(409);
    const current = await post('/get', { avatar_url, file_name: 'first' });
    expect(current.headers.get('x-chat-version')).toBe(newVersion);
    expect(await current.json()).toEqual(edit);
});

test('a committed delete with a disconnected HTTP response can be retried after recreation without deleting it', async () => {
    const read = await post('/get', { avatar_url, file_name: 'first' });
    const version = read.headers.get('x-chat-version');
    const body = { avatar_url, chatfile: 'first', version, operationId: 'delete-disconnected' };
    await expect(fetch(`${url}/delete`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-test-drop-response': 'yes' }, body: JSON.stringify(body),
    })).rejects.toThrow();
    const missing = await post('/get', { avatar_url, file_name: 'first' });
    expect(await missing.json()).toEqual({});
    const created = await post('/save', { avatar_url, file_name: 'first', chat: payload, create: true, operationId: 'create-after-disconnect' });
    expect(created.status).toBe(200);
    const { version: newVersion } = await created.json();
    const retry = await post('/delete', body);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual({ ok: true });
    const current = await post('/get', { avatar_url, file_name: 'first' });
    expect(current.headers.get('x-chat-version')).toBe(newVersion);
    expect(await current.json()).toEqual(payload);
});

test('a disconnected save response replays its committed version without overwriting a subsequent edit', async () => {
    const read = await post('/get', { avatar_url, file_name: 'first' });

    const version = read.headers.get('x-chat-version');
    const firstEdit = [{ chat_metadata: {} }, { mes: 'first edit' }];
    const body = { avatar_url, file_name: 'first', chat: firstEdit, version, operationId: 'save-disconnected' };
    await expect(fetch(`${url}/save`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-test-drop-response': 'yes' }, body: JSON.stringify(body),
    })).rejects.toThrow();
    const afterFirst = await post('/get', { avatar_url, file_name: 'first' });
    const firstVersion = afterFirst.headers.get('x-chat-version');
    expect(await afterFirst.json()).toEqual(firstEdit);
    const nextEdit = [{ chat_metadata: {} }, { mes: 'later edit' }];
    const nextSave = await post('/save', { avatar_url, file_name: 'first', chat: nextEdit, version: firstVersion, operationId: 'later-save' });
    expect(nextSave.status).toBe(200);
    const { version: nextVersion } = await nextSave.json();
    const replay = await post('/save', body);
    expect(await replay.json()).toEqual({ ok: true, version: firstVersion });
    const final = await post('/get', { avatar_url, file_name: 'first' });
    expect(final.headers.get('x-chat-version')).toBe(nextVersion);
    expect(await final.json()).toEqual(nextEdit);
});

test('rename rejects a stale version and safely replays a disconnected commit after the original path is recreated', async () => {
    const read = await post('/get', { avatar_url, file_name: 'first' });

    const staleVersion = read.headers.get('x-chat-version');
    const update = await post('/save', { avatar_url, file_name: 'first', chat: [{ chat_metadata: {} }, { mes: 'new edit' }], version: staleVersion, operationId: 'rename-setup-save' });
    const { version } = await update.json();
    const body = { avatar_url, original_file: 'first.jsonl', renamed_file: 'renamed.jsonl', version, operationId: 'rename-disconnected' };
    const stale = await post('/rename', { ...body, version: staleVersion, operationId: 'rename-stale' });
    expect(stale.status).toBe(409);
    await expect(fetch(`${url}/rename`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-test-drop-response': 'yes' }, body: JSON.stringify(body) })).rejects.toThrow();
    const renamed = await post('/get', { avatar_url, file_name: 'renamed' });
    const renamedVersion = renamed.headers.get('x-chat-version');
    expect(await renamed.json()).toEqual([{ chat_metadata: {} }, { mes: 'new edit' }]);
    const removed = await post('/delete', { avatar_url, chatfile: 'renamed', version: renamedVersion, operationId: 'rename-delete-destination' });
    expect(removed.status).toBe(200);
    const recreated = await post('/save', { avatar_url, file_name: 'first', chat: payload, create: true, operationId: 'rename-recreate' });
    expect(recreated.status).toBe(200);
    const retry = await post('/rename', body);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ ok: true, sanitizedFileName: 'renamed' });
    expect(await (await post('/get', { avatar_url, file_name: 'first' })).json()).toEqual(payload);
});

test('renamed and newly created chats coexist at their respective paths', async () => {
    const original = await post('/save', { avatar_url, file_name: 'identity-old', chat: payload, create: true, operationId: 'identity-create-old' });
    expect(original.status).toBe(200);
    const { version } = await original.json();
    const renamed = await post('/rename', { avatar_url, original_file: 'identity-old.jsonl', renamed_file: 'identity-new.jsonl', version, operationId: 'identity-rename' });
    expect(renamed.status).toBe(200);
    const newPayload = [{ chat_metadata: {} }, { mes: 'new original path' }];
    const created = await post('/save', { avatar_url, file_name: 'identity-old', chat: newPayload, create: true, operationId: 'identity-recreate' });
    expect(created.status).toBe(200);
    expect(await (await post('/get', { avatar_url, file_name: 'identity-old' })).json()).toEqual(newPayload);
    expect(await (await post('/get', { avatar_url, file_name: 'identity-new' })).json()).toEqual(payload);
    expect((await post('/delete', { avatar_url, chatfile: 'identity-old', version, operationId: 'identity-stale-delete' })).status).toBe(409);
});
