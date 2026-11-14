import { test, expect } from '@jest/globals';
import { readFile } from 'node:fs/promises';
import { loadTsModule } from './helpers/load-ts-module.mjs';
import { createGenerationCallerService } from '../public/scripts/generation-caller-service.js';

const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
const lifecycle = createGenerationLifecycleService(() => ({}));

// Exercise the actual send boundary with controlled transport and assembly.
const source = await readFile(new URL('../public/scripts/openai.js', import.meta.url), 'utf8');
const start = source.indexOf('async function sendOpenAIRequest(');
const end = source.indexOf('    if (!response.ok)', start);
const send = new Function('oai_settings', 'getFallbackOpenAIModel', 'getChatCompletionModel', 'buildChatCompletionRequest', 'fetch', 'getRequestHeaders',
    `return (${source.slice(start, end)} return response; })`);

test('send adds a detached request trace after assembly without contaminating preview data', async () => {
    const body = { messages: [{ role: 'user', content: 'hello' }] };
    let sent;
    const request = send({}, () => '', () => 'model', async () => ({ generate_data: body, stream: false }), async (_url, init) => { sent = JSON.parse(init.body); return {}; }, () => ({}));
    await request('normal', [], null, { trace: { chatId: 'chat-a', charName: 'Alice', regenerate: true } });
    expect(sent._trace).toEqual({ chatId: 'chat-a', charName: 'Alice', regenerate: true });
    expect(body).not.toHaveProperty('_trace');
});

test('an independent connection probe does not fabricate a conversation trace', async () => {
    let sent;
    const request = send({}, () => '', () => 'model', async () => ({ generate_data: {}, stream: false }), async (_url, init) => { sent = JSON.parse(init.body); return {}; }, () => ({}));
    await request('quiet', [], null);
    expect(sent).not.toHaveProperty('_trace');
});

test('typed generation captures conversation identity before asynchronous entry listeners', async () => {
    const state = { characters: [{ chat: 'chat-a' }, { chat: 'chat-b' }], this_chid: 0, name2: 'Alice' };
    const chat = [];
    let entered;
    const listenerEntered = new Promise(resolve => { entered = resolve; });
    let resume;
    const listenerWait = new Promise(resolve => { resume = resolve; });
    const noop = () => {};
    const ready = lifecycle.prepareOwnedGeneration({ type: 'normal', depth: 0, dryRun: false, preview: null, regenerate: true }, {
        entry: { getController: () => null, setController: noop, getComposer: noop, setSignal: noop },
        promptContext: { globalPrompts: () => ({}), set: noop },
        identity: () => 'identity', chat: () => chat, currentComposer: noop, ownsRun: () => true, unblock: noop,
        chatId: () => state.characters[state.this_chid].chat, characterName: () => state.name2, start: noop,
        preparation: (_entry, _context, isStale) => ({ unshallow: async () => {}, emitStarted: async () => { entered(); await listenerWait; },
            emitAfterCommands: async () => {}, ping: async () => true, isStale, markTainted: noop }),
        preflight: { substitute: value => value, hasBackendConnection: () => true },
        composer: { isSending: () => false, setSending: noop }, deactivate: noop, remove: () => null,
        bias: () => ({ messageBias: '', promptBias: '' }),
        userInput: isStale => ({ hasAttachment: () => false, emptyText: () => '', isStale }),
        isOpenAI: () => true,
        policy: { canUseTools: () => false, recurseLimit: () => 10, liveModel: model => model, previewModel: model => model },
    });
    await listenerEntered;
    state.this_chid = 1; state.name2 = 'Bob';
    resume();
    expect((await ready).requestTrace).toEqual({ type: 'normal', chatId: 'chat-a', charName: 'Alice', regenerate: true });
});

const browserSource = await readFile(new URL('../app/components/wire-log/WireLogBrowser.tsx', import.meta.url), 'utf8');
test('a successful config toggle synchronizes server truth back to the shell', async () => {
    const start = browserSource.indexOf('    const toggleLogging = useCallback(async () => {');
    const end = browserSource.indexOf('    const deleteSelected', start);
    const block = browserSource.slice(start, end).replaceAll(' as WireLogConfig', '');
    let synced;
    const toggle = new Function('useCallback', 'config', 'setConfigBusy', 'setConfigError', 'apiFetch', 'readJson', 'errorMessageFrom', 'setConfig', 'onConfigChange', `${block} return toggleLogging;`)(
        fn => fn, { enabled: true }, () => {}, () => {}, async () => ({ ok: true }), async () => ({ enabled: false, captureBody: true, retentionDays: 2 }), () => '', () => {}, value => { synced = value; },
    );
    await toggle();
    expect(synced).toEqual({ enabled: false, captureBody: true, retentionDays: 2 });
});

test.each([
    ['normal', false, { pipelineRun: 'run-1', pipelineStep: 'analyze' }],
    ['normal', true, { pipelineRun: 'run-1' }],
    ['quiet', false, {}],
])('pipeline trace for %s closing=%s', (type, closing, expected) => {
    const trace = {};
    lifecycle.prepareAttemptPlan({ type, depth: 0, isOpenAI: true, hasPipeline: true,
        command: { depth: 0, capabilities: { autoRecover: false } }, trace }, {
        plan: command => command, meta: () => ({ runId: 'run-1' }), step: () => ({ tool: 'analyze' }),
        isFallback: () => closing, activeRunId: () => 'run-1',
    });
    expect(trace).toEqual(expected);
});

test('a closing round without a current step still belongs to its pipeline run', () => {
    const trace = {};
    lifecycle.prepareAttemptPlan({ type: 'normal', depth: 0, isOpenAI: true, hasPipeline: true,
        command: { depth: 0, capabilities: { autoRecover: false } }, trace }, {
        plan: command => command, meta: () => null, step: () => null, isFallback: () => true, activeRunId: () => 'run-1',
    });
    expect(trace).toEqual({ pipelineRun: 'run-1' });
});

test('raw quiet generation snapshots its conversation before async prompt listeners', async () => {
    let chatId = 'chat-a';
    let sentOptions;
    const service = createGenerationCallerService({
        events: {}, getMainApi: () => 'openai', getChatId: () => chatId, getCharacterName: () => 'Alice',
        createRawPrompt: value => value, onEvent() {}, onceEvent() {}, removeEventListener() {},
        async emitEvent() { chatId = 'chat-b'; },
        async sendOpenAIRequest(_type, _data, _signal, options) { sentOptions = options; return {}; },
    });
    await service.generateRawData({ prompt: [] });
    expect(sentOptions.trace).toEqual({ type: 'quiet', chatId: 'chat-a', charName: 'Alice' });
});
