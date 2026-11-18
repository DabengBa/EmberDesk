import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import { afterAll, beforeAll, expect, test } from '@jest/globals';
import { setConfigFilePath } from '../src/util.js';
import { canonicalSqliteManager } from '../src/canonical-sqlite.ts';
import { runCanonicalMigrations } from '../src/canonical-sqlite-migrations.ts';
import { upsertCanonicalCharacter } from '../src/endpoints/character-store.ts';
import { getCanonicalSettingsDocument, upsertCanonicalSettingsDocument } from '../src/endpoints/settings-store.ts';
import { upsertCanonicalWorldInfoBook } from '../src/endpoints/world-info-store.ts';
import { router as filesRouter } from '../src/endpoints/files.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ed-generation-http-'));
const config = path.join(root, 'config.yaml');
fs.writeFileSync(config, 'backups:\n  chat:\n    enabled: false\nfeatures:\n  storage:\n    canonicalSqlite:\n      enabled: true\n      reads: true\n      writes: true\n      slices:\n        chats:\n          enabled: true\n          reads: true\n          writes: true\n          projection: off\n');
setConfigFilePath(config);
const { router } = await import('../src/endpoints/chats.js');
const users = new Map();
const servers = [];
const calls = [];
let url;
const hold = Promise.withResolvers();
const holdRegex = Promise.withResolvers();
let closingAttempts = 0;

async function listen(server) {
    servers.push(server);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${server.address().port}`;
}

beforeAll(async () => {
    const baseUrl = await listen(http.createServer(async (req, res) => {
        let body = '';
        for await (const chunk of req) body += chunk;
        const completion = JSON.parse(body);
        calls.push(completion);
        const hasStoryInput = text => completion.messages.some(message => message.tool_calls?.some(call =>
            call.function.name === 'submit_story' && JSON.parse(call.function.arguments).content === text));
        if (completion.tool_choice?.function?.name === 'first' && completion.model !== 'gpt-4o-mini'
            && hasStoryInput('Pipeline fallback input')) {
            res.writeHead(503).end();
            return;
        }
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        if (completion.tool_choice?.function) {
            const name = completion.tool_choice.function.name;
            res.end(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: `call-${name}`, function: { name, arguments: JSON.stringify({ content: `from ${name}` }) } }] } }] })}\n\ndata: [DONE]\n\n`);
            return;
        }
        if (completion.tool_choice === 'none' && hasStoryInput('Pipeline closing input')) {
            if (++closingAttempts === 1) res.end('data: {"choices":[{"delta":{"content":"Discard closing draft"}}]}\n\n');
            else res.end('data: {"choices":[{"delta":{"content":"Closing answer"}}]}\n\ndata: [DONE]\n\n');
            return;
        }
        if (completion.messages.some(message => message.role === 'user' && message.content === 'Hold this chat')) {
            res.write('data: {"choices":[{"delta":{"content":"Draft"}}]}\n\n');
            await hold.promise;
        }
        if (completion.messages.some(message => message.role === 'user' && message.content === 'Interrupted upstream')) {
            res.end('data: {"choices":[{"delta":{"content":"Do not save"}}]}\n\n');
            return;
        }
        if (completion.messages.at(-1)?.content === 'Use captured regex') await holdRegex.promise;
        if (['prompt for User', 'Use captured regex'].includes(completion.messages.at(-1)?.content)) {
            res.end('data: {"choices":[{"delta":{"content":"RAW REPLY"}}]}\n\ndata: [DONE]\n\n');
            return;
        }
        res.end('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: [DONE]\n\n');
    }));
    for (const handle of ['alice', 'bob']) {
        const home = path.join(root, handle);
        const directories = { root: home, ...Object.fromEntries(['storage', 'chats', 'groupChats', 'backups', 'characters'].map(name => [name, path.join(home, name)])) };
        directories.files = path.join(home, 'user', 'files');
        for (const directory of Object.values(directories)) fs.mkdirSync(directory, { recursive: true });


        users.set(handle, { directories, profile: { handle } });
        const db = canonicalSqliteManager.open({ handle, directories, featureFlags: { enabled: true } });
        runCanonicalMigrations(db);
        const card = { name: 'Mira', description: 'A navigator' };
        upsertCanonicalCharacter(db, { id: 'mira', avatarFilename: 'mira.png', fullPayload: card, shallowPayload: card });
        upsertCanonicalWorldInfoBook(db, { name: 'Lore', payload: { entries: {
            1: { uid: 1, key: ['never matches'], content: 'Canonical entry marker', order: 100 },
            2: { uid: 2, key: ['scan-only-keyword'], content: 'Scan-only lore marker', order: 90 },
        } } });
        upsertCanonicalSettingsDocument(db, { userId: handle, expectedRevision: 0, payload: {
            world_info_settings: { world_info: ['Lore'] },
            oai_settings: { custom_url: `${baseUrl}/v1`, openai_model: 'gpt-4o' },
            extension_settings: { regex: [
                { findRegex: '^RAW SEND$', replaceString: 'saved for {{user}}', placement: [1], minDepth: 5 },
                { findRegex: '^saved for ', replaceString: 'prompt for ', placement: [1], promptOnly: true },
                { findRegex: '^saved for ', replaceString: 'display for ', placement: [1], markdownOnly: true },
                { findRegex: '^RAW REPLY$', replaceString: 'reply to {{user}}', placement: [2] },
                { findRegex: '^reply to ', replaceString: 'model reply to ', placement: [2], promptOnly: true },
                { findRegex: '^reply to ', replaceString: 'display reply to ', placement: [2], markdownOnly: true },
            ] },
        } });
    }
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.user = users.get(req.get('x-test-user')); next(); });
    app.use('/api/chats', router);
    app.use('/api/files', filesRouter);
    url = `${await listen(http.createServer(app))}/api/chats`;
});

afterAll(async () => {
    await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
    canonicalSqliteManager.dispose();
    fs.rmSync(root, { recursive: true, force: true });
});

function call(route, body, user = 'alice') {
    return fetch(`${url}${route}`, {
        method: body ? 'POST' : 'GET', headers: { 'x-test-user': user, 'content-type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
}

test('temporary exit cancels before create or after an SSE disconnect, scoped to the authenticated user', async () => {
    const command = { temporary: true, action: 'send', text: 'Hold this chat', history: [] };
    const cancel = (requestId, user) => call('/generation/cancel', { temporary: true, requestId }, user);
    expect((await cancel('cancel-before-create')).status).toBe(204);
    const offset = calls.length;
    const early = await call('/generation/create', { ...command, requestId: 'cancel-before-create' });
    expect(early.status).toBe(202);
    expect(await early.json()).toMatchObject({ status: 'cancelled', temporary: true });
    expect(calls).toHaveLength(offset);

    const requestId = 'cancel-after-disconnect';
    const created = await call('/generation/create', { ...command, requestId });
    expect(created.status).toBe(202);
    const { id } = await created.json();
    try {
        const events = await call(`/generation/${id}/events`);
        await events.body.cancel();
        expect((await cancel(requestId, 'bob')).status).toBe(204);
        expect(await (await call(`/generation/${id}`)).json()).toMatchObject({ status: 'running' });
        expect((await cancel(requestId)).status).toBe(204);
        expect(await (await call(`/generation/${id}/events`)).text()).toContain('"status":"cancelled"');
        expect(await (await call('/generation/create', { ...command, requestId })).json()).toMatchObject({ id, status: 'cancelled' });
    } finally {
        await call(`/generation/${id}/cancel`, {});
    }
});

test('temporary regenerate previews and executes the custom pipeline with uploaded history, then continue remains plain', async () => {
    const { directories } = users.get('alice');
    const db = canonicalSqliteManager.open({ handle: 'alice', directories, featureFlags: { enabled: true } });
    const counts = () => ['chat_sessions', 'chat_messages', 'chat_generation_runs'].map(table => db.prepare(`SELECT count(*) AS count FROM ${table}`).get().count);
    const before = counts();
    const saved = getCanonicalSettingsDocument(db, { userId: 'alice' });
    const setSettings = payload => upsertCanonicalSettingsDocument(db, { userId: 'alice', expectedRevision: getCanonicalSettingsDocument(db, { userId: 'alice' }).revision, payload });
    setSettings({ ...saved.payload, oai_settings: { ...saved.payload.oai_settings, reply_pipeline: { enabled: true, steps: [{ tool: 'custom' }, { tool: 'last' }] } },
        feature_settings: { tool_bindings: [{ name: 'custom', enabled: true, actionBody: 'return "browser:" + args.content;' }] } });
    let id;
    try {
        const upload = await call('/../files/upload', { name: 'temporary-history.txt', data: Buffer.from('TEMPORARY_FILE_CONTENT').toString('base64') });
        expect(upload.status).toBe(200);
        const { path: url } = await upload.json();
        const command = { temporary: true, action: 'regenerate', history: [
            { is_user: true, mes: 'Previous question' }, { is_user: false, mes: 'Previous answer' },
            { is_user: true, mes: 'Regenerate this question', extra: { files: [{ name: 'temporary-history.txt', url }] } },
            { is_user: false, mes: 'REMOVE_OLD_DRAFT' }, { is_user: false, mes: 'REMOVE_OLD_REPLY' },
        ] };
        const preview = await (await call('/generation/preview', command)).json();
        expect(preview.previewPipeline).toMatchObject({ round: 0, total: 2, step: { tool: 'custom' } });
        const second = await (await call('/generation/preview', { ...command, round: 1 })).json();
        expect(second.previewPipeline.step.tool).toBe('last');
        const offset = calls.length;
        const created = await call('/generation/create', { ...command, requestId: 'temp-regenerate' });
        expect(created.status).toBe(202);
        ({ id } = await created.json());
        let pending;
        for (let attempt = 0; attempt < 100 && !pending; attempt++) {
            pending = (await (await call(`/generation/${id}`)).json()).step;
            if (!pending) await new Promise(resolve => setTimeout(resolve, 10));
        }
        expect(pending).toMatchObject({ name: 'custom', args: { content: 'from custom' } });
        expect(calls[offset]).toMatchObject({ messages: preview.messages, tool_choice: preview.toolChoice });
        const wire = JSON.stringify(preview.messages);
        for (const text of ['Previous answer', 'Regenerate this question', 'TEMPORARY_FILE_CONTENT', 'The current user input is the submit_story call']) expect(wire).toContain(text);
        expect(wire).not.toContain('REMOVE_OLD_');
        const step = { stepId: pending.id, result: 'BROWSER RESULT' };
        expect((await call(`/generation/${id}/step`, step, 'bob')).status).toBe(404);
        expect((await call(`/generation/${id}/step`, step)).status).toBe(204);
        expect((await call(`/generation/${id}/step`, step)).status).toBe(409);
        expect(await (await call(`/generation/${id}/events`)).text()).toMatch(/"status":"completed"[^\n]+from last/);
        expect(calls[offset + 1].tool_choice).toEqual(second.toolChoice);
        expect(calls[offset + 1].messages.at(-1)).toEqual(second.messages.at(-1));
        expect(calls[offset + 1].messages).toContainEqual(expect.objectContaining({ role: 'tool', content: 'BROWSER RESULT' }));

        const continued = await call('/generation/create', { ...command, action: 'continue', requestId: 'temp-continue' });
        expect(continued.status).toBe(202);
        ({ id } = await continued.json());
        expect(await (await call(`/generation/${id}/events`)).text()).toContain('"mes":"REMOVE_OLD_REPLYHello"');
        expect(calls[offset + 2].tool_choice).toBeUndefined();
        expect(counts()).toEqual(before);
    } finally {
        if (id) await call(`/generation/${id}/cancel`, {});
        setSettings(saved.payload);
    }
});

test('runs a temporary assistant prompt over SSE without saving a chat or exposing the run to another user', async () => {
    const user = users.get('alice');
    const db = canonicalSqliteManager.open({ handle: 'alice', directories: user.directories, featureFlags: { enabled: true } });
    const counts = () => ['chat_sessions', 'chat_generation_runs'].map(table => Number(db.prepare(`SELECT count(*) AS count FROM ${table}`).get().count));
    const before = counts();
    const command = { temporary: true, action: 'send', text: 'Temporary follow-up', history: [
        { is_user: true, name: 'User', mes: 'Earlier question' },
        { is_user: false, name: 'Assistant', mes: 'Earlier answer' },
    ] };
    const preview = await call('/generation/preview', command);
    expect(preview.status).toBe(200);
    const { messages } = await preview.json();
    const created = await call('/generation/create', { ...command, requestId: 'temp-send' });
    expect(created.status).toBe(202);
    const { id } = await created.json();
    expect((await call(`/generation/${id}/events`, undefined, 'bob')).status).toBe(404);
    const events = await call(`/generation/${id}/events`);
    expect(events.headers.get('content-type')).toContain('text/event-stream');
    expect(await events.text()).toMatch(/"status":"completed"[^\n]+"assistant":\{[^\n]+"mes":"Hello"/);
    expect(calls.at(-1).messages).toEqual(messages);
    expect(messages.some(message => message.role === 'assistant' && message.content.includes('Earlier answer'))).toBe(true);
    expect(counts()).toEqual(before);
    calls.pop();
});

test('real chat router assembles preview and send equally, commits, replays and isolates users', async () => {
    const offset = calls.length;
    const target = { avatar_url: 'mira.png', file_name: 'first' };
    const command = { ...target, action: 'send', text: 'Orion' };
    const preview = await call('/generation/preview', command);
    expect(preview.status).toBe(200);
    const { messages } = await preview.json();
    expect(messages.some(message => String(message.content).includes('A navigator'))).toBe(true);
    const created = await call('/generation/create', { ...command, requestId: 'first-send' });
    expect(created.status).toBe(202);
    const { id } = await created.json();
    const events = await call(`/generation/${id}/events`);
    expect(events.headers.get('content-type')).toContain('text/event-stream');
    expect(await events.text()).toMatch(/event: snapshot[\s\S]*"status":"completed"/);
    expect(calls).toHaveLength(offset + 1);
    expect(calls[offset].messages).toEqual(messages);
    expect((await (await call('/get', target)).json()).slice(1).map(row => row.mes)).toEqual(['Orion', 'Hello']);
    expect((await (await call('/generation/find', target)).json()).id).toBe(id);
    expect((await (await call('/generation/create', { ...command, requestId: 'first-send' })).json()).id).toBe(id);
    expect((await call(`/generation/${id}`, null, 'bob')).status).toBe(404);
    expect((await call(`/generation/${id}`, null, 'unknown')).status).toBe(401);
});

test('discovery returns the current canonical version even after a terminal run and subsequent edit', async () => {
    const target = { avatar_url: 'mira.png', file_name: 'find-version' };
    const created = await (await call('/generation/create', { ...target, action: 'send', text: 'Find my version', requestId: 'find-version' })).json();
    await (await call(`/generation/${created.id}/events`)).text();
    const terminal = await (await call(`/generation/${created.id}`)).json();
    const read = await call('/get', target);
    const payload = await read.json();
    const edited = await call('/save', { ...target, version: read.headers.get('X-Chat-Version'), operationId: 'after-terminal', chat: [...payload, { mes: 'Edit' }] });
    expect(edited.status).toBe(200);
    const { version: chatVersion } = await edited.json();
    expect(chatVersion).not.toBe(terminal.version);
    expect(await (await call('/generation/find', target)).json()).toEqual({ ...terminal, chatVersion });
});

test('new drafts and legacy unused headers use the same default display name', async () => {
    const messages = [];
    for (const type of ['draft', 'legacy']) {
        const target = { avatar_url: 'mira.png', file_name: `user-name-${type}` };
        let version;
        if (type === 'legacy') {
            const saved = await call('/save', { ...target, create: true, operationId: 'name-header', chat: [{ user_name: 'unused' }] });
            expect(saved.status).toBe(200);
            ({ version } = await saved.json());
        }
        const created = await call('/generation/create', { ...target, version, action: 'send', text: 'A plain send', requestId: 'default-name' });
        expect(created.status).toBe(202);
        await (await call(`/generation/${(await created.json()).id}/events`)).text();
        messages.push((await (await call('/get', target)).json()).at(1).name);
    }
    expect(messages).toEqual(['User', 'User']);
});

test('AI_OUTPUT final write uses the same captured settings even after the user changes regex scripts', async () => {
    const handle = 'bob';
    const db = canonicalSqliteManager.open({ handle, directories: users.get(handle).directories, featureFlags: { enabled: true } });
    const original = getCanonicalSettingsDocument(db, { userId: handle });
    const target = { avatar_url: 'mira.png', file_name: 'snapshot-regex' };
    const created = await call('/generation/create', { ...target, action: 'send', text: 'Use captured regex', requestId: 'snapshot-regex' }, handle);
    let updated;
    try {
        expect(created.status).toBe(202);
        const { id } = await created.json();
        updated = upsertCanonicalSettingsDocument(db, { userId: handle, expectedRevision: original.revision, payload: {
            ...original.payload, extension_settings: { regex: [{ findRegex: '^RAW REPLY$', replaceString: 'New rule', placement: [2] }] },
        } });
        expect(updated.ok).toBe(true);
        holdRegex.resolve();
        await (await call(`/generation/${id}/events`, null, handle)).text();
        expect((await (await call('/get', target, handle)).json()).at(-1).mes).toBe('reply to User');
    } finally {
        holdRegex.resolve();
        if (updated?.ok) upsertCanonicalSettingsDocument(db, { userId: handle, expectedRevision: updated.revision, payload: original.payload });
    }
});

test.each(['draft', 'legacy'])('server send applies each regex only in its own phase and uses User for %s names', async type => {
    const target = { avatar_url: 'mira.png', file_name: `write-regex-${type}` };
    let version;
    if (type === 'legacy') {
        const saved = await call('/save', { ...target, create: true, operationId: 'legacy-header', chat: [{ user_name: 'unused', chat_metadata: {} }] });
        expect(saved.status).toBe(200);
        ({ version } = await saved.json());
    }
    const command = { ...target, action: 'send', text: 'RAW SEND' };
    const { messages } = await (await call('/generation/preview', command)).json();
    expect(messages.at(-1)).toEqual({ role: 'user', content: 'prompt for User' });
    const start = calls.length;
    const result = await call('/generation/create', { ...command, version, requestId: `regex-${type}` });
    expect(result.status).toBe(202);
    const { id } = await result.json();
    expect(await (await call(`/generation/${id}/events`)).text()).toContain('"status":"completed"');
    expect(calls[start].messages).toEqual(messages);
    const [header, user, assistant] = await (await call('/get', target)).json();
    expect(header.user_name).toBe(type === 'draft' ? 'User' : 'unused');
    expect(user).toMatchObject({ name: 'User', mes: 'saved for User' });
    expect(assistant.mes).toBe('reply to User');
    const history = await (await call('/generation/preview', { ...target, action: 'send' })).json();
    expect(history.messages.at(-1)).toMatchObject({ role: 'assistant', content: 'model reply to User' });
});

test('regenerate preview and upstream see the same prefix that a successful reply retains', async () => {
    const target = { avatar_url: 'mira.png', file_name: 'regenerate-turn' };
    const retained = [
        { user_name: 'User' },
        { is_user: true, name: 'User', mes: 'Last input' },
        { is_user: false, name: 'Mira', mes: 'Manual boundary', extra: { api: 'manual' } },
    ];
    const saved = await call('/save', { ...target, create: true, operationId: 'seed-turn', chat: [
        ...retained,
        { is_user: false, name: 'Mira', mes: 'Old generated answer' },
        { is_system: true, is_user: false, mes: 'Old tool response', extra: { tool_invocations: [] } },
    ] });
    expect(saved.status).toBe(200);
    const { version } = await saved.json();
    const command = { ...target, action: 'regenerate' };
    const preview = await call('/generation/preview', command);
    expect(preview.status).toBe(200);
    const { messages } = await preview.json();
    expect(messages.slice(-2)).toEqual([{ role: 'user', content: 'Last input' }, { role: 'assistant', content: 'Manual boundary' }]);
    const start = calls.length;
    const created = await call('/generation/create', { ...command, version, requestId: 'regenerate-turn' });
    expect(created.status).toBe(202);
    const { id } = await created.json();
    expect(await (await call(`/generation/${id}/events`)).text()).toContain('"status":"completed"');
    expect(calls[start].messages).toEqual(messages);
    const payload = await (await call('/get', target)).json();
    expect(payload.slice(0, -1)).toEqual(retained);
    expect(payload.at(-1)).toMatchObject({ is_user: false, name: 'Mira', mes: 'Hello' });
});

test('continuation updates one reply and a truncated upstream leaves only the persisted user message', async () => {
    const run = async (target, command) => {
        const created = await call('/generation/create', { ...target, ...command });
        expect(created.status).toBe(202);
        const { id } = await created.json();
        await (await call(`/generation/${id}/events`)).text();
        return (await call(`/generation/${id}`)).json();
    };
    const target = { avatar_url: 'mira.png', file_name: 'continue' };
    const sent = await run(target, { action: 'send', text: 'One more sentence', requestId: 'continue-send' });
    expect(sent.status).toBe('completed');
    expect((await run(target, { action: 'continue', version: sent.version, requestId: 'continue-reply' })).status).toBe('completed');
    expect((await (await call('/get', target)).json()).slice(1).map(row => row.mes)).toEqual(['One more sentence', 'HelloHello']);

    const failedTarget = { ...target, file_name: 'failed' };
    expect((await run(failedTarget, { action: 'send', text: 'Interrupted upstream', requestId: 'failed-send' })).status).toBe('failed');
    expect((await (await call('/get', failedTarget)).json()).slice(1).map(row => row.mes)).toEqual(['Interrupted upstream']);
});

test('HTTP enforces the same-chat lock while a different chat can complete', async () => {
    const target = { avatar_url: 'mira.png', file_name: 'busy' };
    const command = { ...target, action: 'send', text: 'Hold this chat', requestId: 'held' };
    const created = await call('/generation/create', command);
    expect(created.status).toBe(202);
    const { id, version } = await created.json();
    try {
        const blocked = await call('/generation/create', { ...command, version, requestId: 'same-chat' });
        expect(blocked.status).toBe(409);
        expect(await blocked.json()).toMatchObject({ error: 'chat_generation_busy' });
        const payload = await (await call('/get', target)).json();
        const edit = await call('/save', { ...target, version, operationId: 'blocked-edit', chat: [...payload, { mes: 'Edit' }] });
        expect(edit.status).toBe(409);
        const parallel = await call('/generation/create', { ...command, file_name: 'parallel', text: 'Not held' });
        expect(parallel.status).toBe(202);
        expect(await (await call(`/generation/${(await parallel.json()).id}/events`)).text()).toContain('"status":"completed"');
        expect((await (await call(`/generation/${id}`)).json()).status).toBe('running');
    } finally {
        await call(`/generation/${id}/cancel`, {});
        hold.resolve();
    }
});

test('HTTP discovery reconciles a persisted orphan as interrupted and releases the chat', async () => {
    const target = { avatar_url: 'mira.png', file_name: 'restart' };
    const command = { ...target, action: 'send', text: 'Before restart', requestId: 'before-restart' };
    const prior = await (await call('/generation/create', command)).json();
    await (await call(`/generation/${prior.id}/events`)).text();
    const user = users.get('alice');
    const db = canonicalSqliteManager.open({ handle: 'alice', directories: user.directories, featureFlags: { enabled: true } });
    // Persist exactly the state a new process sees after a crash between create and completion.
    db.prepare("UPDATE chat_generation_runs SET status = 'running', finished_at_ms = NULL WHERE id = ?").run(prior.id);
    const read = await call('/get', target);
    const edit = await call('/save', { ...target, version: read.headers.get('X-Chat-Version'), operationId: 'after-restart-edit', chat: [...await read.json(), { mes: 'Ordinary edit' }] });
    expect(edit.status).toBe(200);
    const { version } = await edit.json();
    expect(await (await call('/generation/find', target)).json()).toMatchObject({ id: prior.id, status: 'interrupted' });
    expect(await (await call(`/generation/${prior.id}/events`)).text()).toContain('"status":"interrupted"');
    const next = await call('/generation/create', { ...command, version, text: 'After restart', requestId: 'after-restart' });
    expect(next.status).toBe(202);
    expect(await (await call(`/generation/${(await next.json()).id}/events`)).text()).toContain('"status":"completed"');
});

test('preview and send resolve force-activated lore and newly uploaded attachment text from the user database', async () => {
    const upload = await call('/../files/upload', { name: 'new-attachment.txt', data: Buffer.from('Managed attachment marker').toString('base64') });
    expect(upload.status).toBe(200);
    const { path: attachmentUrl } = await upload.json();
    const command = {
        avatar_url: 'mira.png', file_name: 'attachment', action: 'send', text: 'Read this',
        worldInfo: [{ world: 'Lore', uid: 1 }], attachments: { files: [{ url: attachmentUrl, name: 'notes.txt' }] },
    };
    const preview = await call('/generation/preview', command);
    expect(preview.status).toBe(200);
    const { messages } = await preview.json();
    expect(JSON.stringify(messages)).toContain('Canonical entry marker');
    expect(JSON.stringify(messages)).toContain('Managed attachment marker');
    const otherUser = await call('/generation/preview', command, 'bob');
    expect(otherUser.status).toBe(400);
    const result = await call('/generation/create', { ...command, requestId: 'attachment-send' });
    expect(result.status).toBe(202);
    await (await call(`/generation/${(await result.json()).id}/events`)).text();
    expect(calls.at(-1).messages).toEqual(messages);
    const [, userMessage] = await (await call('/get', command)).json();
    expect(userMessage).toMatchObject({ mes: 'Read this', extra: { files: [{ url: attachmentUrl, name: 'notes.txt' }] } });
});

test('temporary lore replacements and scan inputs affect preview and send without changing the stored book', async () => {
    const command = {
        avatar_url: 'mira.png', file_name: 'temporary-lore', action: 'send', text: 'Hello there',
        worldInfo: [{ world: 'Lore', uid: 1, content: 'Temporary replacement marker', position: '4', depth: 0, role: 2, order: 100 }],
        scanPrompts: ['scan-only-keyword'],
    };
    const preview = await call('/generation/preview', command);
    expect(preview.status).toBe(200);
    const { messages } = await preview.json();
    expect(messages).toContainEqual({ role: 'assistant', content: 'Temporary replacement marker' });
    expect(JSON.stringify(messages)).toContain('Scan-only lore marker');
    expect(JSON.stringify(messages)).not.toContain('Canonical entry marker');
    expect(JSON.stringify(messages)).not.toContain('scan-only-keyword');

    const created = await call('/generation/create', { ...command, requestId: 'temporary-lore' });
    expect(created.status).toBe(202);
    await (await call(`/generation/${(await created.json()).id}/events`)).text();
    expect(calls.at(-1).messages).toEqual(messages);

    const next = await call('/generation/preview', { ...command, file_name: 'later-preview', worldInfo: [{ world: 'Lore', uid: 1 }], scanPrompts: [] });
    const later = JSON.stringify((await next.json()).messages);
    expect(later).toContain('Canonical entry marker');
    expect(later).not.toMatch(/Temporary replacement marker|Scan-only lore marker/);
});

test('malformed temporary lore and scan inputs are rejected before saving the send', async () => {
    const command = { avatar_url: 'mira.png', file_name: 'invalid-runtime', action: 'send', text: 'Do not save', requestId: 'invalid-runtime' };
    const invalid = await call('/generation/create', { ...command, worldInfo: [{ world: 'Lore', uid: 1, content: 42 }] });
    expect(invalid.status).toBe(400);
    expect((await call('/generation/preview', { ...command, scanPrompts: [42] })).status).toBe(400);
    expect(await (await call('/generation/find', command)).json()).toBeNull();
});

test('default pipeline completes without a browser; custom step resumes once from an authorized SSE snapshot', async () => {
    const user = users.get('alice');
    const db = canonicalSqliteManager.open({ handle: 'alice', directories: user.directories, featureFlags: { enabled: true } });
    const saved = db.prepare('SELECT revision, payload_json FROM settings_documents WHERE user_id = ?').get('alice');
    const initial = JSON.parse(saved.payload_json);
    const setPipeline = (steps, bindings) => {
        const { revision } = db.prepare('SELECT revision FROM settings_documents WHERE user_id = ?').get('alice');
        upsertCanonicalSettingsDocument(db, { userId: 'alice', expectedRevision: revision, payload: {
            ...initial, oai_settings: { ...initial.oai_settings, fallback_provider_model: 'gpt-4o-mini', reply_pipeline: { enabled: true, steps: steps.map(tool => ({ tool })) } },
            feature_settings: { tool_bindings: bindings },
        } });
    };
    let run;
    const open = async (file_name, text = 'Pipeline input') => {
        const target = { avatar_url: 'mira.png', file_name };
        const command = { ...target, action: 'send', text };
        const preview = await call('/generation/preview', command);
        expect(preview.status).toBe(200);
        const created = await call('/generation/create', { ...command, requestId: file_name });
        expect(created.status).toBe(202);
        run = await created.json();
        return { target, preview: await preview.json() };
    };
    try {
        setPipeline(['first', 'last'], []);
        const offset = calls.length;
        const { target, preview } = await open('default-pipeline');
        expect(await (await call(`/generation/${run.id}/events`)).text()).toContain('"status":"completed"');
        expect(calls[offset].messages).toEqual(preview.messages);
        const [firstWire, secondWire] = calls.slice(offset, offset + 2);
        expect(firstWire.messages[0]).toMatchObject({ role: 'assistant', tool_calls: expect.any(Array) });
        expect(firstWire.messages.some(message => message.role === 'user')).toBe(false);
        const current = firstWire.messages.flatMap(message => message.tool_calls ?? [])
            .find(call => JSON.parse(call.function.arguments).content === 'Pipeline input');
        expect(current.function.name).toBe('submit_story');
        expect(firstWire.messages.at(-1).content).toContain(current.id);
        expect(firstWire.tools.map(tool => tool.function.name)).toEqual(['first', 'last']);
        expect(secondWire.tools).toEqual(firstWire.tools);
        expect(secondWire.messages.slice(0, firstWire.messages.length)).toEqual(firstWire.messages);
        const [actualCall, actualReceipt, nextStep] = secondWire.messages.slice(firstWire.messages.length);
        expect(actualCall.tool_calls[0].function.name).toBe('first');
        expect(actualReceipt.tool_call_id).toBe(actualCall.tool_calls[0].id);
        expect(nextStep.content).toContain(current.id);
        expect(preview.previewPipeline).toMatchObject({ round: 0, total: 2, step: { tool: 'first' } });
        const secondPreview = await (await call('/generation/preview', { ...target, action: 'send', round: 1 })).json();
        expect(secondPreview.previewPipeline).toMatchObject({ round: 1, step: { tool: 'last' } });
        expect(secondPreview.toolChoice).toEqual({ type: 'function', function: { name: 'last' } });
        const closingPreview = await (await call('/generation/preview', { ...target, action: 'send', round: 2 })).json();
        expect(closingPreview.previewPipeline).toMatchObject({ round: 2, fallback: true, step: null });
        expect(closingPreview.toolChoice).toBe('none');
        expect(calls[offset + 1].messages).toContainEqual(expect.objectContaining({ role: 'tool', content: '已收到。' }));
        expect((await (await call('/get', target)).json()).at(-1).extra.tool_invocations).toHaveLength(2);

        const roleRegenerate = await (await call('/generation/preview', { ...target, action: 'regenerate' })).json();
        expect(roleRegenerate.previewPipeline).toBeUndefined();
        expect(roleRegenerate.messages).toContainEqual({ role: 'user', content: 'Pipeline input' });

        const retryOffset = calls.length;
        const retry = await open('pipeline-fallback', 'Pipeline fallback input');
        expect(await (await call(`/generation/${run.id}/events`)).text()).toContain('"status":"completed"');
        expect(calls.slice(retryOffset).map(({ model, tool_choice }) => [model, tool_choice.function.name])).toEqual([
            ['gpt-4o', 'first'], ['gpt-4o', 'first'], ['gpt-4o-mini', 'first'], ['gpt-4o', 'last'],
        ]);
        expect(calls.slice(retryOffset, retryOffset + 3).map(call => call.messages)).toEqual(Array(3).fill(calls[retryOffset].messages));
        expect((await (await call('/get', retry.target)).json()).slice(1)).toHaveLength(2);

        setPipeline(['custom', 'last'], [{ name: 'custom', enabled: true, actionBody: 'return args.content.toUpperCase();' }]);
        const custom = await open('custom-pipeline');
        let pending;
        for (let tries = 0; !pending && tries < 50; tries++) {
            pending = (await (await call(`/generation/${run.id}`)).json()).step;
            if (!pending) await new Promise(resolve => setTimeout(resolve, 10));
        }
        expect(pending).toMatchObject({ name: 'custom', args: { content: 'from custom' } });
        const first = (await call(`/generation/${run.id}/events`)).body.getReader();
        expect(new TextDecoder().decode((await first.read()).value)).toContain(pending.id);
        await first.cancel();
        const second = (await call(`/generation/${run.id}/events`)).body.getReader();
        expect(new TextDecoder().decode((await second.read()).value)).toContain(pending.id);
        const result = { stepId: pending.id, result: 'BROWSER RESULT' };
        expect((await call(`/generation/${run.id}/step`, result, 'bob')).status).toBe(404);
        expect((await call(`/generation/${run.id}/step`, result)).status).toBe(204);
        expect((await call(`/generation/${run.id}/step`, result)).status).toBe(409);
        await second.cancel();
        expect(await (await call(`/generation/${run.id}/events`)).text()).toContain('"status":"completed"');
        expect(calls.at(-1).messages).toContainEqual(expect.objectContaining({ role: 'tool', content: 'BROWSER RESULT' }));
        expect((await (await call('/get', custom.target)).json()).slice(1)).toHaveLength(2);

        setPipeline(['custom'], [{ name: 'custom', enabled: true, actionBody: 'return {};' }]);
        const closing = await open('pipeline-closing', 'Pipeline closing input');
        const events = await call(`/generation/${run.id}/events`);
        const step = (await (await call(`/generation/${run.id}`)).json()).step
            ?? (await (await call(`/generation/${run.id}`)).json()).step;
        expect(step?.name).toBe('custom');
        expect((await call(`/generation/${run.id}/step`, { stepId: step.id, result: '{}' })).status).toBe(204);
        const eventStream = await events.text();
        expect(eventStream).toContain('"text":"Discard closing draft"');
        expect(eventStream).toContain('"text":"","reset":true');
        expect(eventStream).toContain('"text":"Closing answer"');
        expect((await (await call('/get', closing.target)).json()).at(-1).mes).toBe('&lt;custom&gt;Closing answer&lt;/custom&gt;');
    } finally {
        if (run) await call(`/generation/${run.id}/cancel`, {});
        const { revision } = db.prepare('SELECT revision FROM settings_documents WHERE user_id = ?').get('alice');
        upsertCanonicalSettingsDocument(db, { userId: 'alice', expectedRevision: revision, payload: initial });
    }
});
