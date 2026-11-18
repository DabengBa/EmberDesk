import { DatabaseSync } from 'node:sqlite';

import { runCanonicalMigrations } from '../src/canonical-sqlite-migrations.ts';
import { createCanonicalChatSessionRecord, persistCanonicalChatSessionInTransaction } from '../src/endpoints/canonical-chat-store.ts';
import { upsertCanonicalCharacter } from '../src/endpoints/character-store.ts';
import { upsertCanonicalPreset } from '../src/endpoints/presets-store.ts';
import { upsertCanonicalSettingsDocument } from '../src/endpoints/settings-store.ts';
import { upsertCanonicalWorldInfoBook } from '../src/endpoints/world-info-store.ts';
import { assembleServerPipelineTail, assembleServerPrompt, readServerPromptSnapshot } from '../src/server-prompt.ts';

const order = (...identifiers) => [{ character_id: 100001, order: identifiers.map(identifier => ({ identifier, enabled: true })) }];
const snapshot = overrides => ({
    version: 'version-1',
    character: { name: 'Mira', description: '{{char}} the navigator', avatar: 'mira.png' },
    settings: { oai_settings: { custom_url: 'http://127.0.0.1:3000/v1', openai_model: 'gpt-4o', openai_max_context: 100, openai_max_tokens: 20 } },
    preset: {
        temperature: 0.5, new_chat_prompt: '',
        prompts: [{ identifier: 'custom', role: 'system', content: 'Speak to {{user}}.', system_prompt: false }],
        prompt_order: order('custom', 'charDescription', 'worldInfo', 'chatHistory'),
    },
    chat: [{ user_name: 'Rin', chat_metadata: {} }, { name: 'Mira', mes: 'Where to?', is_user: false }],
    books: [{ name: 'Stars', scope: 'global', entries: [
        { uid: 0, key: ['/\\bORION\\b/i'], content: '{{char}} knows Orion.', position: 0, order: 200 },
        { uid: 1, key: ['orion'], content: 'Depth lore.', position: 4, depth: 0, role: 1, order: 100 },
        { uid: 2, key: ['mars'], content: 'Should not activate.', position: 1, order: 100 },
    ] }],
    ...overrides,
});

test('preview and saved send share ordered preset, character, activated lore and history', async () => {
    const base = snapshot();
    const preview = await assembleServerPrompt(base, { action: 'send', pendingUserText: 'Orion' });
    const saved = await assembleServerPrompt({ ...base, chat: [...base.chat, { is_user: true, mes: 'Orion' }] }, { action: 'send' });
    expect(preview).toEqual(saved);
    expect(saved.messages).toEqual([
        { role: 'system', content: 'Speak to Rin.' },
        { role: 'system', content: 'Mira the navigator' },
        { role: 'system', content: 'Mira knows Orion.' },
        { role: 'assistant', content: 'Where to?' },
        { role: 'user', content: 'Orion' },
        { role: 'user', content: 'Depth lore.' },
    ]);
    expect(saved.connection).toMatchObject({ baseUrl: 'http://127.0.0.1:3000/v1', model: 'gpt-4o', temperature: 0.5 });
    expect(base.chat).toHaveLength(2);
    const other = await assembleServerPrompt(snapshot({ character: { name: 'Sol', description: 'Cartographer' } }), { action: 'send', pendingUserText: 'Mars' });
    expect(other.messages.map(message => message.content)).toEqual(['Speak to Rin.', 'Cartographer', 'Should not activate.', 'Where to?', 'Mars']);
});

test('regenerate prompt retains the manual or narrator boundary and removes only the generated suffix', async () => {
    for (const boundary of [
        { is_user: false, mes: 'Keep the boundary', extra: { api: 'manual' } },
        { is_system: true, mes: 'Keep the boundary', extra: { type: 'narrator' } },
    ]) {
        const base = snapshot({ books: [], chat: [
            { user_name: 'Rin' }, { is_user: true, mes: 'My turn' }, boundary,
            { is_user: false, mes: 'Old draft' }, { is_system: true, mes: 'Old tool step', extra: { tool_invocations: [] } },
        ] });
        const { messages } = await assembleServerPrompt(base, { action: 'regenerate' });
        expect(messages.map(message => message.content)).toEqual(['Speak to Rin.', 'Mira the navigator', 'My turn', 'Keep the boundary']);
    }
});

test('configuration fails explicitly without echoing credentials', async () => {
    const base = snapshot();
    base.settings.oai_settings.custom_url = 'http://alice:secret@localhost/v1';
    await expect(assembleServerPrompt(base, { action: 'send', pendingUserText: 'Orion' })).rejects.toMatchObject({ code: 'invalid_config', message: 'Invalid model base URL' });
    base.settings.oai_settings.custom_url = '';
    base.settings.oai_settings.secret = 'another-secret';
    base.preset.proxy_password = 'old-secret';
    expect(JSON.stringify(await assembleServerPrompt(base, { action: 'send', pendingUserText: 'Orion' }))).not.toContain('secret');
});

test('trim older history, not the current user message or mandatory prompts', async () => {
    const base = snapshot({ books: [] });
    base.settings.oai_settings.openai_max_context = 50;
    base.chat[1].mes = 'old '.repeat(200);
    const result = await assembleServerPrompt(base, { action: 'send', pendingUserText: 'Latest' });
    expect(result.messages.at(-1)).toEqual({ role: 'user', content: 'Latest' });
    expect(result.budget).toMatchObject({ contextTokens: 50, responseTokens: 20, omittedHistory: 1 });
    await expect(assembleServerPrompt(base, { action: 'send', pendingUserText: 'latest '.repeat(200) })).rejects.toMatchObject({ code: 'budget_exceeded' });
    base.character.description = 'mandatory '.repeat(200);
    await expect(assembleServerPrompt(base, { action: 'send', pendingUserText: 'Latest' })).rejects.toMatchObject({ code: 'budget_exceeded' });
});

test('reads canonical sources and the saved send within the caller transaction', async () => {
    const db = new DatabaseSync(':memory:');
    const base = snapshot();
    const locator = { ownerType: 'character', ownerId: 'mira.png', sourcePath: 'Mira.jsonl' };
    const userId = 'fixture';
    let preview;
    let saved;
    try {
        runCanonicalMigrations(db);
        upsertCanonicalCharacter(db, { id: 'mira', avatarFilename: locator.ownerId, fullPayload: base.character, shallowPayload: base.character });
        upsertCanonicalPreset(db, { name: 'Navigation', payload: base.preset });
        upsertCanonicalSettingsDocument(db, { userId, expectedRevision: 0, payload: {
            oai_settings: { ...base.settings.oai_settings, preset_settings_openai: 'Navigation' },
            world_info_settings: { world_info: { globalSelect: ['Stars'] }, world_info_depth: 1 },
        } });
        base.books[0].entries.push({ uid: 3, key: ['where'], content: 'Outside the scan depth.', position: 0, order: 100 });
        upsertCanonicalWorldInfoBook(db, { name: 'Stars', payload: { entries: Object.fromEntries(base.books[0].entries.map(entry => [entry.uid, entry])) } });
        const write = payload => persistCanonicalChatSessionInTransaction(db, createCanonicalChatSessionRecord(db, { locator, payload }));
        db.exec('BEGIN');
        write(base.chat);
        db.exec('COMMIT');
        preview = readServerPromptSnapshot(db, { locator, userId });
        db.exec('BEGIN');
        write([...base.chat, { is_user: true, name: 'Rin', mes: 'Orion' }]);
        saved = readServerPromptSnapshot(db, { locator, userId });
        db.exec('ROLLBACK');
        expect(readServerPromptSnapshot(db, { locator, userId })).toEqual(preview);
    } finally {
        db.close();
    }
    expect(typeof saved.version).toBe('string');
    expect(saved.version).not.toBe(preview.version);
    const send = await assembleServerPrompt(saved, { action: 'send' });
    expect(send).toEqual(await assembleServerPrompt(preview, { action: 'send', pendingUserText: 'Orion' }));
    expect(send.messages.map(message => message.content)).toEqual(['Speak to Rin.', 'Mira the navigator', 'Mira knows Orion.', 'Where to?', 'Orion', 'Depth lore.']);
});

test('scans request-local prompts and forced lore, and places runtime depth injections', async () => {
    const base = snapshot({ books: [{ name: 'Runtime', scope: 'chat', entries: [
        { uid: 1, key: ['private-trigger'], content: 'Scoped lore', position: 0, order: 100 },
        { uid: 2, key: ['unmatched'], content: 'Forced lore', position: 4, depth: 0, role: 2, order: 100 },
        { uid: 3, key: ['not-scanned'], content: 'Not activated', position: 0, order: 100 },
    ] }] });
    const runtime = {
        scanPrompts: ['private-trigger'], forceWorldInfo: [{ world: 'Runtime', uid: 2, content: 'Runtime replacement', position: 4, depth: 0, role: 2, order: 100 }],
        injections: [{ content: 'not-scanned', role: 'system', depth: 0, order: 100 }],
    };
    const command = { action: 'send', pendingUserText: 'Hello' };
    const { messages } = await assembleServerPrompt(base, command, runtime);
    expect(messages).toContainEqual({ role: 'system', content: 'Scoped lore' });
    expect(messages.slice(-2)).toEqual([{ role: 'assistant', content: 'Runtime replacement' }, { role: 'system', content: 'not-scanned' }]);
    expect(messages.map(x => x.content)).not.toContain('Not activated');
    expect((await assembleServerPrompt(base, command)).messages.map(x => x.content)).not.toContain('Scoped lore');
});

test('pipeline projects ordinary history and settled cards, replays active/mixed calls, and budgets the step tail', async () => {
    const call = (id, name, runId) => ({ id, name, parameters: '{}', result: `${id} output`, ...(runId && { pipeline: { runId, tool: name } }) });
    const base = snapshot({ books: [] });
    base.settings.oai_settings.openai_max_context = 1000;
    base.preset.prompt_order = order('chatHistory', 'tail', 'every');
    base.preset.prompts.push(
        { identifier: 'tail', role: 'system', content: 'Analyze with {{model}}.', injection_trigger: ['pipeline:analyze'] },
        { identifier: 'every', role: 'system', content: 'Always.', injection_trigger: ['all', 'pipeline:analyze'] },
    );
    base.chat.push(
        { mes: '&lt;respond&gt;Finished prose&lt;/respond&gt;', extra: { tool_invocations: [call('settled', 'respond', 'past')] } },
        { is_user: true, mes: 'Current user' },
        { is_system: true, mes: 'card', extra: { tool_invocations: [call('active', 'analyze', 'current')] } },
        { mes: 'Mixed prose', extra: { tool_invocations: [call('mixed', 'lookup')] } },
    );
    const runtime = { pipeline: { activeRunId: 'current', step: { tool: 'analyze', prompt: 'Read carefully.' }, index: 0, total: 2 } };
    const result = await assembleServerPrompt(base, { action: 'send' }, runtime);
    expect(result.messages[0]).toMatchObject({ role: 'assistant', tool_calls: expect.any(Array) });
    expect(result.messages.some(message => message.role === 'user')).toBe(false);
    expect(result.messages.flatMap(message => message.tool_calls ?? []).map(call => call.function.name)).toEqual(['submit_story', 'submit_story', 'submit_story', 'analyze', 'lookup', 'submit_story', 'story_preset', 'story_preset']);
    expect(result.messages).toContainEqual({ role: 'tool', tool_call_id: 'active', content: 'active output' });
    expect(JSON.stringify(result.messages)).toContain('Mixed prose');
    expect(JSON.stringify(result.messages)).toContain('Finished prose');
    expect(JSON.stringify(result.messages)).not.toContain('&lt;respond');
    expect(result.messages.at(-1).content).toContain('Read carefully.');
    expect(result.pipeline.tools[0].function.name).toBe('analyze');
    expect(result.pipeline.baseMessages).toEqual(result.messages.slice(0, -3));
    await expect(assembleServerPipelineTail(base, runtime, [...result.messages, { role: 'tool', content: ' long result'.repeat(1000) }], result.pipeline.mediaCosts, new Set())).rejects.toMatchObject({ code: 'budget_exceeded' });
    base.settings.oai_settings.openai_max_context = 70;
    await expect(assembleServerPrompt(base, { action: 'send' }, runtime)).rejects.toMatchObject({ code: 'budget_exceeded' });
});

test('honors gallery selection and budgets media without tokenizing data URL contents', async () => {
    const base = snapshot({ books: [] });
    base.settings.oai_settings.inline_image_quality = 'low';
    base.settings.oai_settings.openai_max_context = 180;
    base.chat.push({ is_user: true, mes: 'See this', extra: { media_display: 'gallery', media_index: 1, media: [
        { url: '/unused' }, { url: '/selected', type: 'image' },
    ] } });
    const dataUrl = `data:image/png;base64,${'axY0'.repeat(1000)}`;
    const seen = [];
    const runtime = { resolveMedia: async ({ url }) => { seen.push(url); return { dataUrl, tokens: 85 }; } };
    const result = await assembleServerPrompt(base, { action: 'send' }, runtime);
    expect(seen).toEqual(['/selected']);
    expect(result.messages.at(-1).content).toEqual([{ type: 'text', text: 'See this' }, { type: 'image_url', image_url: { url: dataUrl, detail: 'low' } }]);
    expect(result.budget.promptTokens).toBeGreaterThan(85);
    await expect(assembleServerPrompt(base, { action: 'send' })).rejects.toMatchObject({ code: 'invalid_config', message: 'Chat media projection requires a server media resolver' });
    base.settings.oai_settings.openai_max_context = 600;
    const withPipeline = await assembleServerPrompt(base, { action: 'send' }, {
        ...runtime, pipeline: { step: { tool: 'respond' }, index: 0, total: 1 },
    });
    expect(withPipeline.messages.filter(message => message.role === 'user')).toEqual([result.messages.at(-1)]);
    expect(withPipeline.messages.at(-1).content).toContain('The latest native user message is the current input.');

    const firstStep = { ...runtime, pipeline: { step: { tool: 'analyze', model: 'gpt-3.5-turbo' }, index: 0, total: 2 } };
    const secondStep = {
        resolveMedia: async () => ({ dataUrl, tokens: 999 }),
        pipeline: { step: { tool: 'respond', model: 'gpt-4o' }, index: 1, total: 2 },
    };
    const first = await assembleServerPrompt(base, { action: 'send' }, firstStep);
    await expect(assembleServerPrompt(base, { action: 'send' }, secondStep)).rejects.toMatchObject({ code: 'budget_exceeded' });
    const second = await assembleServerPipelineTail(base, { ...secondStep, pipeline: { ...secondStep.pipeline, currentInput: first.pipeline.currentInput } },
        first.messages, first.pipeline.mediaCosts, new Set(first.messages.flatMap(message => (message.tool_calls ?? []).map(call => call.id))));
    expect(second.messages.slice(0, -1)).toEqual(first.messages);
    expect(second.messages.at(-1).content).toContain(first.pipeline.currentInput);
});

test('scans request-local memory and projects setup, summary and depth lore in place', async () => {
    const base = snapshot();
    base.settings.oai_settings.openai_max_context = 1200;
    base.chat[0].chat_metadata.chat_memory = { summaries: [{ status: 'active', text: 'Orion memory' }] };
    const command = { action: 'send', pendingUserText: 'Current user' };

    const { messages } = await assembleServerPrompt(base, command, {
        projectMemory: rows => [{ mes: 'Orion memory', is_user: true, extra: { chatMemorySummary: { turnIndices: [0] } } }, rows.at(-1)],
        pipeline: { step: { tool: 'respond' }, index: 0, total: 1 },
    });
    const calls = messages.flatMap(message => message.tool_calls ?? []);
    expect(calls.map(call => [call.function.name, JSON.parse(call.function.arguments).content])).toEqual([
        ['story_preset', 'Speak to Rin.'], ['character_card', 'Mira the navigator'], ['world_info', 'Mira knows Orion.'],
        ['story_history', 'Orion memory'], ['submit_story', 'Current user'], ['world_info', 'Depth lore.'],
    ]);
    for (const call of calls) {
        expect(messages[messages.findIndex(message => message.tool_calls?.includes(call)) + 1]).toMatchObject({ role: 'tool', tool_call_id: call.id });
    }
    expect(messages.map(x => x.content)).not.toContain('Where to?');
    expect(base.chat).toHaveLength(2);
});

test('adding an adjacent summary keeps the earlier recap and unchanged source calls intact', async () => {
    const base = snapshot({ books: [] });
    base.settings.oai_settings.openai_max_context = 1500;
    const memory = { keepTurns: 1, wrap: 'Recap: {{summary}}', summaries: [
        { id: 's1', turnKey: '0cfc0457-8f93-41a5-9c69-4253545fd739', messageIds: ['u1', 'a1'], manual: true, text: 'first summary' },
    ] };
    base.chat[0].chat_metadata.chat_memory = memory;
    for (let n = 1; n <= 3; n++) base.chat.push(
        { is_user: true, mes: `question ${n}`, extra: { id: `u${n}` } },
        { mes: `answer ${n}`, extra: { id: `a${n}` } },
    );
    const runtime = { translateMemory: text => text, pipeline: { step: { tool: 'respond' }, index: 0, total: 1 } };
    const send = async text => (await assembleServerPrompt(base, { action: 'send', pendingUserText: text }, runtime)).messages.flatMap(m => m.tool_calls ?? []);
    const before = await send('four');
    memory.summaries.push({ id: 's2', turnKey: 'u2', messageIds: ['u2', 'a2'], manual: true, text: 'second summary' });
    base.chat.push({ is_user: true, mes: 'four', extra: { id: 'memory-backfilled-id' } }, { mes: 'answer 4' });
    const after = await send('five');
    const summaries = after.filter(call => call.function.name === 'story_history');
    expect(summaries.map(call => JSON.parse(call.function.arguments).content)).toEqual(['Recap: first summary', 'Recap: second summary']);
    expect(summaries[0]).toEqual(before.find(call => call.function.name === 'story_history'));
    expect(after.every(call => call.id.length <= 64)).toBe(true);
    for (const content of ['question 3', 'four']) {
        const call = before.find(call => JSON.parse(call.function.arguments).content === content);
        expect(call).toBeDefined();
        expect(after).toContainEqual(call);
    }
});

test('projects saved memory using turn reconciliation, pinning and the recent window without mutating the snapshot', async () => {
    const base = snapshot({ books: [] });
    base.settings.oai_settings.openai_max_context = 600;
    base.chat = [{ user_name: 'Rin', chat_metadata: { chat_memory: { keepTurns: 1, wrap: 'Recap: {{summary}}', summaries: [
        { id: 's1', turnKey: 'u1', messageIds: ['u1', 'a1'], manual: true, text: 'first summary' },
        { id: 's2', turnKey: 'u2', messageIds: ['u2', 'a2'], manual: true, text: 'pinned summary' },
    ] } } },
    { is_user: true, mes: 'first question', extra: { id: 'u1' } },
    { mes: 'first answer', extra: { id: 'a1' } },
    { is_user: true, mes: 'pinned question', extra: { id: 'u2', pinned: true } },
    { mes: 'pinned answer', extra: { id: 'a2' } },
    { is_user: true, mes: 'recent question', extra: { id: 'u3' } },
    { mes: 'recent answer', extra: { id: 'a3' } }];
    const before = structuredClone(base);
    await expect(assembleServerPrompt(base, { action: 'send', pendingUserText: 'next' }))
        .rejects.toMatchObject({ code: 'invalid_config', message: 'Chat memory projection requires a server memory translator' });
    const result = await assembleServerPrompt(base, { action: 'send', pendingUserText: 'next' }, { translateMemory: text => text });
    const texts = result.messages.map(message => message.content);
    expect(texts).toContain('Recap: first summary');
    expect(texts).not.toContain('first question');
    expect(texts).toContain('pinned question');
    expect(texts).toContain('recent question');
    expect(texts).not.toContain('Recap: pinned summary');
    expect(base).toEqual(before);
});
