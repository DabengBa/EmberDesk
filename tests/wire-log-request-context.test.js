import { test, expect } from '@jest/globals';
import { readFile } from 'node:fs/promises';

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

const generationSource = await readFile(new URL('../public/scripts/generation-service.js', import.meta.url), 'utf8');
const captureStart = generationSource.indexOf('    const requestTrace =');
const captureEnd = generationSource.indexOf("    console.log('Generate entered')", captureStart);

test('generation conversation identity is detached from later UI switches', () => {
    expect(captureStart).toBeGreaterThan(0);
    const capture = new Function('state', 'isRegenerate', 'type', `${generationSource.slice(captureStart, captureEnd)} return requestTrace;`);
    const state = { characters: [{ chat: 'chat-a' }, { chat: 'chat-b' }], this_chid: 0, name2: 'Alice' };
    const trace = capture(state, true, 'normal');
    state.this_chid = 1;
    state.name2 = 'Bob';
    expect(trace).toEqual({ type: 'normal', chatId: 'chat-a', charName: 'Alice', regenerate: true });
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
    const start = generationSource.indexOf('        const pipelineMeta =');
    const end = generationSource.indexOf('        const runGenerationAttempt', start);
    const capture = new Function('type', 'requestTrace', 'getPipelineStepMeta', 'getCurrentPipelineStep', 'isPipelineFallbackRound', 'getActivePipelineRunId',
        `${generationSource.slice(start, end)} return requestTrace;`);
    expect(capture(type, {}, () => ({ runId: 'run-1', stepId: 'step-1' }), () => ({ tool: 'analyze' }), () => closing, () => 'run-1')).toEqual(expected);
});

test('a closing round without a current step still belongs to its pipeline run', () => {
    const start = generationSource.indexOf('        const pipelineMeta =');
    const end = generationSource.indexOf('        const runGenerationAttempt', start);
    const capture = new Function('type', 'requestTrace', 'getPipelineStepMeta', 'getCurrentPipelineStep', 'isPipelineFallbackRound', 'getActivePipelineRunId',
        `${generationSource.slice(start, end)} return requestTrace;`);
    expect(capture('normal', {}, () => null, () => null, () => true, () => 'run-1')).toEqual({ pipelineRun: 'run-1' });
});

test('raw quiet generation snapshots its conversation before async prompt listeners', async () => {
    const shellSource = await readFile(new URL('../public/script.js', import.meta.url), 'utf8');
    const start = shellSource.indexOf('export async function generateRawData(');
    const end = shellSource.indexOf('\n}\n', start) + 2;
    let chatId = 'chat-a';
    let sentOptions;
    const raw = new Function('main_api', 'getCurrentChatId', 'name2', 'createRawPrompt', 'eventSource', 'event_types', 'TempResponseLength', 'sendOpenAIRequest',
        `return (${shellSource.slice(start, end).replace('export ', '')});`)(
        'openai', () => chatId, 'Alice', value => value,
        { on() {}, removeListener() {}, async emit() { chatId = 'chat-b'; } }, {},
        { setupEventHook: () => () => {} }, async (_type, _data, _signal, options) => { sentOptions = options; return {}; },
    );
    await raw({ prompt: [] });
    expect(sentOptions.trace).toEqual({ type: 'quiet', chatId: 'chat-a', charName: 'Alice' });
});
