import { beforeEach, expect, jest, test } from '@jest/globals';
import { get_encoding } from 'tiktoken';

// Real request assembly + pipeline runtime; only browser/external boundaries are controlled.
const substitute = jest.fn(value => value);
globalThis.localStorage = { getItem: () => null };
const count = jest.fn(async () => 10);
let tailContent = 'STEP_TAIL';
let toolCallingSupported = true;
let includeHistory = false;
let historyToolsSupported = false;
// Minimal prompt collection so the real base assembly runs (and stays empty)
// instead of being stubbed out: only the pipeline step tail is under test.
const emptyPrompts = () => {
    const items = includeHistory ? [{ identifier: 'chatHistory', system_prompt: true }] : [];
    return {
        collection: items, overriddenPrompts: [],
        add(prompt) { items.push(prompt); },
        get(identifier) { return items.find(item => item.identifier === identifier) ?? { role: 'system', content: '', identifier }; },
        has(identifier) { return items.some(item => item.identifier === identifier); },
        index(identifier) { return items.findIndex(item => item.identifier === identifier); },
        filter(predicate) { return items.filter(predicate); },
    };
};
const manager = {
    activeCharacter: { id: 1 }, serviceSettings: { openai_max_context: 100, openai_max_tokens: 20 },
    init: jest.fn(), getPromptOrderForCharacter: () => [{ identifier: 'tail', enabled: true }],
    getPromptById: () => ({ identifier: 'tail', role: 'system', content: tailContent, injection_trigger: ['pipeline:analyze'] }),
    preparePrompt: substitute,
    getPromptCollection: emptyPrompts,
    isPromptDisabledForActiveCharacter: () => false,
    log: () => {},
    setChatCompletion: jest.fn(),
    isValidName: () => true,
    sanitizeName: value => value,
};
jest.unstable_mockModule('../src/util.js', () => ({
    getConfigValue: (_key, fallback) => fallback,
}));
const { postProcessPrompt } = await import('../src/prompt-converters.js');
jest.unstable_mockModule('../public/lib.js', () => ({ DOMPurify: {} }));
jest.unstable_mockModule('../public/script.js', () => Object.fromEntries([
    'abortStatusCheck', 'extension_prompt_roles', 'extension_prompt_types', 'getExtensionPrompt', 'getExtensionPromptMaxDepth',
    'getMediaDisplay', 'getMediaIndex', 'is_send_press', 'main_api', 'name1', 'name2', 'displayOnlineStatus',
    'saveSettingsDebounced', 'setOnlineStatus', 'substituteParams', 'system_message_types', 'withGeneratingModel',
].map(key => [key, key === 'substituteParams' ? substitute : key === 'withGeneratingModel' ? (_model, callback) => callback() : key === 'system_message_types' ? { NARRATOR: 'narrator' } : jest.fn()])));
jest.unstable_mockModule('../public/scripts/PromptManager.js', () => ({ chatCompletionDefaultPrompts: [],
    INJECTION_POSITION: { ABSOLUTE: 1 }, Prompt: class { constructor(value) { Object.assign(this, value); } }, PromptManager: class { constructor() { return manager; } }, promptManagerDefaultPromptOrders: [],
    // openai.js imports this migration helper; the mock must expose it too.
    removeRetiredExamplePrompts: jest.fn() }));
jest.unstable_mockModule('../public/scripts/request-context.js', () => ({ getRequestHeaders: jest.fn() }));
jest.unstable_mockModule('../public/scripts/power-user.js', () => ({ forceCharacterEditorTokenize: jest.fn(), getCustomStoppingStrings: () => [] }));
jest.unstable_mockModule('../public/scripts/secrets.js', () => Object.fromEntries(['SECRET_KEYS', 'secret_state', 'writeSecret', 'deleteSecret', 'resolveSecretKey'].map(k => [k, jest.fn()])));
jest.unstable_mockModule('../public/scripts/sse-stream.js', () => ({ getEventSourceStream: jest.fn() }));
jest.unstable_mockModule('../public/scripts/utils.js', () => Object.fromEntries(['createThumbnail', 'delay', 'download', 'getAudioDurationFromDataURL', 'getBase64Async', 'getFileText', 'getImageSizeFromDataURL', 'getSanitizedFilename', 'getVideoDurationFromDataURL', 'isDataURL', 'isValidUrl', 'resetScrollHeight', 'stringFormat'].map(k => [k, jest.fn()])));
jest.unstable_mockModule('../public/scripts/tokenizers.js', () => ({ countTokensOpenAIAsync: count }));

jest.unstable_mockModule('../public/scripts/templates.js', () => ({ renderTemplateAsync: jest.fn() }));
jest.unstable_mockModule('../public/scripts/popup.js', () => ({ callGenericPopup: jest.fn(), Popup: {}, POPUP_RESULT: {}, POPUP_TYPE: {} }));
jest.unstable_mockModule('../public/scripts/local-dialogs.js', () => ({ showLocalDialog: jest.fn() }));
jest.unstable_mockModule('../public/scripts/i18n.js', () => ({ t: strings => strings[0] }));
jest.unstable_mockModule('../public/scripts/tool-calling.js', () => ({ ToolManager: {
    canPerformToolCalls: () => toolCallingSupported,
    isToolCallingSupported: (_settings, model) => historyToolsSupported && model !== 'unsupported-model',
    registerFunctionToolsOpenAI: async data => { data.tools = [{ type: 'function', function: { name: 'analyze' } }]; },
} }));
jest.unstable_mockModule('../public/scripts/feature-settings.js', () => ({ feature_settings: { tool_bindings: [{ name: 'analyze', enabled: true }] } }));
jest.unstable_mockModule('../public/scripts/tool-bindings.js', () => ({ syncPipelineToolBindings: jest.fn() }));
const openai = await import('../public/scripts/openai.js');
const initialChatMemoryEnabled = openai.oai_settings.chat_memory_enabled;
const runtime = await import('../public/scripts/reply-pipeline.js');
const core = await import('../public/scripts/reply-pipeline-core.js');
const { eventSource, event_types } = await import('../public/scripts/events.js');
const { isRecoverableGenerationFailure } = await import('../public/scripts/chat-generation-auto-recovery.js');
eventSource.on(event_types.CHAT_COMPLETION_SETTINGS_READY, runtime.applyPipelineRequestShaping);
openai.setupChatCompletionPromptManager(openai.oai_settings);
beforeEach(() => {
    runtime.endPipelineRun();
    Object.assign(openai.oai_settings, { reply_pipeline: { enabled: true, steps: [{ tool: 'analyze' }] }, openai_max_context: 100, openai_max_tokens: 20 });
    runtime.beginPipelineRun();
    count.mockResolvedValue(10); substitute.mockClear();
    tailContent = 'STEP_TAIL';
    toolCallingSupported = true;
    includeHistory = false;
    historyToolsSupported = false;
    manager.serviceSettings.openai_max_context = 100;
    manager.serviceSettings.names_behavior = 0;
    openai.oai_settings.names_behavior = 0;
    globalThis.toastr = { error: jest.fn(), warning: jest.fn() };
});

test('chat memory is enabled in the initial provider settings', () => {
    expect(initialChatMemoryEnabled).toBe(true);
});

test.each(['o1', 'gpt-5-chat-latest'])('pipeline rejects a model whose request branch removes tools: %s', async model => {
    await expect(openai.buildChatCompletionRequest({ type: 'normal', messages: [], model, emitSettingsReady: true }))
        .rejects.toThrow(/Reply pipeline.*tools/i);
});

test('pipeline rejects explicit provider tool incompatibility', async () => {
    toolCallingSupported = false;
    await expect(openai.buildChatCompletionRequest({ type: 'normal', messages: [], model: 'known-model', emitSettingsReady: true }))
        .rejects.toThrow(/Reply pipeline.*tools/i);
});

test('preview model shapes the actual body without changing the live run', async () => {
    runtime.endPipelineRun();
    openai.oai_settings.reply_pipeline.steps = [{ tool: 'analyze', model: 'gpt-5.4' }];
    runtime.beginPipelineRun();
    const before = structuredClone(core.getPipelineRunState());
    const model = runtime.resolvePreviewPipelineModel('gpt-4o-mini', 0);
    const { generate_data } = await openai.buildChatCompletionRequest({ type: 'normal', messages: [], model });
    runtime.previewPipelineRequestShaping(generate_data, { round: 0 });
    expect(generate_data.model).toBe('gpt-5.4');
    expect(generate_data.max_completion_tokens).toBe(20);
    expect(core.getPipelineRunState()).toEqual(before);
});

test('closing round never restores captured tools to a model that strips them', async () => {
    await openai.buildChatCompletionRequest({ type: 'normal', messages: [], model: 'gpt-4o-mini', emitSettingsReady: true });
    runtime.markPipelineFallbackRound();
    const { generate_data } = await openai.buildChatCompletionRequest({ type: 'normal', messages: [], model: 'o1', emitSettingsReady: true });
    expect(generate_data.tools).toBeUndefined();
    expect(generate_data.tool_choice).toBeUndefined();
});

test('tool incompatibility is terminal while network failures remain recoverable', async () => {
    let failure;
    try {
        await openai.buildChatCompletionRequest({ type: 'normal', messages: [], model: 'o1', emitSettingsReady: true });
    } catch (error) { failure = error; }
    expect(failure?.message).toMatch(/Reply pipeline.*tools/i);
    expect(isRecoverableGenerationFailure(failure)).toBe(false);
    expect(isRecoverableGenerationFailure(new Error('provider network failure'))).toBe(true);
});

test('o1 closing live and preview requests convert every system message without altering captured prefix', async () => {
    await openai.buildChatCompletionRequest({ type: 'normal', messages: [{ role: 'system', content: 'base' }], model: 'gpt-4o-mini', emitSettingsReady: true });
    runtime.markPipelineFallbackRound();
    const before = structuredClone(core.getPipelineRunState().messages);
    const { generate_data: live } = await openai.buildChatCompletionRequest({ type: 'normal', messages: [], model: 'o1', emitSettingsReady: true });
    expect(live.messages.some(message => message.role === 'system')).toBe(false);
    expect(core.getPipelineRunState().messages.slice(0, before.length)).toEqual(before);
    const { generate_data: preview } = await openai.buildChatCompletionRequest({ type: 'normal', messages: [{ role: 'system', content: 'base' }], model: 'o1' });
    runtime.previewPipelineRequestShaping(preview, { round: 1 });
    expect(preview.messages.some(message => message.role === 'system')).toBe(false);
    expect(preview.tool_choice).toBeUndefined();
});

test('closing preview omits tool_choice when the built request has no tools', async () => {
    const { generate_data } = await openai.buildChatCompletionRequest({ type: 'normal', messages: [], model: 'o1' });
    runtime.previewPipelineRequestShaping(generate_data, { round: 1 });
    expect(generate_data.tools).toBeUndefined();
    expect(generate_data.tool_choice).toBeUndefined();
});

test('first request reserves step material and instruction before trimming real history', async () => {
    includeHistory = true;
    globalThis.toastr = { error: jest.fn(), warning: jest.fn() };
    count.mockImplementation(async value => (Array.isArray(value) ? value : [value]).reduce((sum, m) => sum + (m.content ? 10 : 0), 0));
    const history = Array.from({ length: 8 }, (_, i) => ({ role: 'user', content: `history-${7 - i}` }));
    const [messages] = await openai.prepareOpenAIMessages({ type: 'normal', pipelineStepTag: 'pipeline:analyze', messages: history }, false);
    const { generate_data } = await openai.buildChatCompletionRequest({ type: 'normal', messages, model: 'gpt-4o-mini', emitSettingsReady: true });

    expect(generate_data.messages.some(m => m.content === 'history-0')).toBe(false);
    expect(generate_data.messages.some(m => m.content === 'history-7')).toBe(true);
    expect(generate_data.messages.some(m => m.content === 'STEP_TAIL')).toBe(true);
    expect(generate_data.messages.at(-1).content).toContain('must call the analyze tool exactly once');
});

test('captured run bypasses base assembly and only prepares step-only tail once', async () => {
    const base = [{ role: 'user', content: 'captured WI/macros' }];
    runtime.applyPipelineRequestShaping({ type: 'normal', messages: base, tools: [] });
    const captured = structuredClone(core.getPipelineRunState().messages);
    // No assembly inputs: touching the old base path would fail, not coincidentally match.
    const [messages] = await openai.prepareOpenAIMessages({ type: 'normal', pipelineStepTag: 'pipeline:analyze' }, false);
    expect(messages).toEqual(captured);
    expect(core.getPipelineRunState().stepPrompts).toEqual([{ role: 'system', content: 'STEP_TAIL' }]);
    await openai.prepareOpenAIMessages({ type: 'normal', pipelineStepTag: 'pipeline:analyze' }, false);
    expect(substitute).toHaveBeenCalledTimes(1);
});

test('final request budget overflow rejects rather than trimming the captured prefix', async () => {
    count.mockResolvedValue(90);
    const base = [{ role: 'user', content: 'captured WI/macros' }];
    await expect(openai.buildChatCompletionRequest({ type: 'normal', messages: base, model: 'gpt-4o-mini', emitSettingsReady: true }))
        .rejects.toThrow(/Reply pipeline.*budget/);
    expect(core.getPipelineRunState().messages[0]).toEqual(base[0]);
});

test('missing output limit cannot bypass pipeline context overflow check', async () => {
    count.mockResolvedValue(90);
    const settings = { ...openai.oai_settings, openai_max_tokens: undefined };
    await expect(openai.buildChatCompletionRequest({ type: 'normal', messages: [], settings, model: 'gpt-4o-mini', emitSettingsReady: true }))
        .rejects.toThrow(/Reply pipeline.*budget/);
});

test('completed-run display folding still projects only final content for the next base', () => {
    runtime.endPipelineRun();
    const [message] = openai.setOpenAIMessages([{ is_user: false, name: 'Character',
        mes: '&lt;analyze&gt;internal note&lt;/analyze&gt;\n&lt;reply&gt;final prose&lt;/reply&gt;',
        extra: { reply_pipeline_run: 'completed', tool_invocations: [{ name: 'analyze' }, { name: 'reply' }] },
    }]);
    expect(message.content.trim()).toBe('final prose');
    expect(message.content).not.toContain('internal note');
    expect(core.getPipelineRunState()).toBeNull();
});

function historyRecord(mes, is_user = false, extra = {}) {
    return { name: is_user ? 'User' : 'Character', is_user, is_system: false, mes, extra };
}

function pipelineRecord() {
    return historyRecord('&lt;analyze&gt;PRIVATE_SCRATCH&lt;/analyze&gt;\n&lt;respond&gt;EDITED_FINAL&lt;/respond&gt;', false, {
        reply_pipeline_run: 'completed',
        tool_invocations: [
            { id: 'old-analysis', name: 'analyze', parameters: '{"content":"PRIVATE_SCRATCH"}', result: 'PRIVATE_SCRATCH', pipeline: { runId: 'completed' } },
            { id: 'old-final', name: 'respond', parameters: '{"content":"STALE_FINAL"}', result: 'STALE_FINAL', pipeline: { runId: 'completed' } },
        ],
    });
}

async function assembleHistory(chat, { type = 'normal', preview = false, model = 'gpt-4o-mini', pipelineHistory = true, raw = false } = {}) {
    includeHistory = true;
    const [messages, , completion] = await openai.prepareOpenAIMessages({
        type, assemblyModel: model, pipelineHistory,
        messages: raw ? structuredClone(chat).reverse() : openai.setOpenAIMessages(chat, model),
    }, preview, { bookkeep: false });
    expect(completion.error).toBeUndefined();
    return { messages, completion };
}

function submissions(messages) {
    return messages.flatMap(message => message.tool_calls ?? []).filter(call => call.function.name === 'submit_story');
}

test.each([1, 2])('history preserves speaker identity in name mode %i without duplicate prefixes', async namesBehavior => {
    historyToolsSupported = true;
    manager.serviceSettings.openai_max_context = 2000;
    manager.serviceSettings.names_behavior = namesBehavior;
    openai.oai_settings.names_behavior = namesBehavior;
    const chat = [
        { ...historyRecord('I hold the key.', true), name: 'Alex' },
        { ...historyRecord('I hold the map.'), name: 'Morgan' },
        { ...historyRecord('Who has the key?', true), name: 'Alex' },
    ];
    const { messages } = await assembleHistory(chat);
    expect(submissions(messages).map(call => JSON.parse(call.function.arguments).content)).toEqual([
        'Alex: I hold the key.', 'Morgan: I hold the map.',
    ]);
    expect((await assembleHistory(chat, { preview: true })).messages).toEqual(messages);
    const upstream = postProcessPrompt(structuredClone(messages), { userName: 'Alex', charName: 'Morgan' });
    expect(upstream.some(message => message.role === 'user' && message.content === 'Alex: Who has the key?')).toBe(true);
    runtime.endPipelineRun();
    openai.oai_settings.reply_pipeline.enabled = false;
    const off = await assembleHistory(chat, { pipelineHistory: false });
    expect(submissions(off.messages)).toHaveLength(0);
    const offUpstream = postProcessPrompt(structuredClone(off.messages), { userName: 'Alex', charName: 'Morgan' });
    expect(offUpstream.some(message => message.content === 'Alex: I hold the key.')).toBe(true);
});

test('pipeline history projects old users and effective replies once without changing stored records', async () => {
    historyToolsSupported = true;
    manager.serviceSettings.openai_max_context = 2000;
    const chat = [historyRecord('OLD_USER', true), pipelineRecord(), historyRecord('CURRENT_USER', true)];
    const before = structuredClone(chat);
    const { messages } = await assembleHistory(chat);
    const calls = submissions(messages);
    expect(calls.map(call => JSON.parse(call.function.arguments).content.trim())).toEqual(['OLD_USER', 'EDITED_FINAL']);
    for (const call of calls) {
        const index = messages.findIndex(message => message.tool_calls?.some(item => item.id === call.id));
        expect(messages[index].role).toBe('assistant');
        expect(messages[index + 1]).toEqual({ role: 'tool', content: '已收到。', tool_call_id: call.id });
    }
    expect(messages.filter(message => message.role === 'user')).toEqual([
        { role: 'user', content: '以下是此前已经发生的对话。' },
        { role: 'user', content: 'CURRENT_USER' },
    ]);
    for (const text of ['PRIVATE_SCRATCH', 'STALE_FINAL', 'old-analysis', 'old-final', '&lt;respond&gt;']) {
        expect(JSON.stringify(messages)).not.toContain(text);
    }
    expect(JSON.stringify(messages).match(/EDITED_FINAL/g)).toHaveLength(1);
    expect(chat).toEqual(before);
    const { messages: preview } = await assembleHistory(chat, { preview: true });
    expect(preview).toEqual(messages);
});

test('history excludes instructions, summaries, media, reasoning and genuine tool records', async () => {
    historyToolsSupported = true;
    manager.serviceSettings.openai_max_context = 4000;
    const ordinary = { id: 'real-lookup', name: 'lookup', parameters: '{}', result: 'lookup result' };
    const messages = [
        { role: 'system', content: 'SYSTEM' },
        { role: 'user', content: 'OLD_USER' },
        { role: 'assistant', content: 'INJECTED_ASSISTANT', injected: true },
        { role: 'assistant', content: 'SUMMARY', summaryMeta: { turnIndex: 0 } },
        { role: 'assistant', content: 'IMAGE_CAPTION', media: [{ type: 'image', url: 'unused' }] },
        { role: 'assistant', content: 'REASONED_REPLY', reasoning: 'reasoning' },
        { role: 'assistant', content: 'REAL_SYSTEM', isSystemRecord: true },
        { role: 'assistant', content: 'ORDINARY_CARD', isSystemRecord: true, invocations: [ordinary] },
        { role: 'assistant', content: 'ABANDONED_SCRATCH', isSystemRecord: true, invocations: [{ ...ordinary, id: 'abandoned', pipeline: { runId: 'old' } }] },
        { role: 'assistant', content: 'MIXED_CARD', isSystemRecord: true, invocations: [{ ...ordinary, id: 'mixed-real' }, { ...ordinary, id: 'mixed-pipeline', pipeline: { runId: 'old' } }] },
        { role: 'user', content: 'CURRENT_USER' },
        { role: 'user', content: 'INJECTED_USER', injected: true },
    ];
    const { messages: wire } = await assembleHistory(messages, { raw: true });
    expect(submissions(wire).map(call => JSON.parse(call.function.arguments).content)).toEqual(['OLD_USER']);
    for (const text of ['SYSTEM', 'INJECTED_ASSISTANT', 'SUMMARY', 'IMAGE_CAPTION', 'REASONED_REPLY', 'REAL_SYSTEM', 'CURRENT_USER', 'INJECTED_USER']) {
        expect(wire.some(message => message.content === text)).toBe(true);
    }
    expect(wire.filter(message => message.role === 'tool').map(message => message.tool_call_id)).toEqual(expect.arrayContaining(['real-lookup', 'mixed-real', 'mixed-pipeline']));
    expect(JSON.stringify(wire)).not.toContain('ABANDONED_SCRATCH');
});

test('reasoning provenance survives model change and does not turn into story submissions', async () => {
    historyToolsSupported = true;
    manager.serviceSettings.openai_max_context = 2000;
    const chat = [historyRecord('REASONED', false, { api: 'other', model: 'other', reasoning: 'private reasoning' }), historyRecord('NOW', true)];
    const { messages } = await assembleHistory(chat);
    expect(submissions(messages)).toHaveLength(0);
    expect(messages.some(message => message.content === 'REASONED')).toBe(true);
    expect(JSON.stringify(messages)).not.toContain('private reasoning');
});

test.each(['quiet', 'raw', 'chat_memory', 'disabled', 'no-runnable', 'unsupported-model', 'o1'])(
    'history projection is scoped out for %s', async scope => {
        historyToolsSupported = true;
        manager.serviceSettings.openai_max_context = 2000;
        if (scope === 'disabled' || scope === 'no-runnable') {
            runtime.endPipelineRun();
            openai.oai_settings.reply_pipeline.enabled = scope !== 'disabled';
            openai.oai_settings.reply_pipeline.steps = [];
        }
        const { messages } = await assembleHistory([historyRecord('OLD', true), pipelineRecord(), historyRecord('NOW', true)], {
            type: ['quiet', 'raw', 'chat_memory'].includes(scope) ? scope : 'normal',
            model: ['unsupported-model', 'o1'].includes(scope) ? scope : 'gpt-4o-mini',
            pipelineHistory: false,
        });
        expect(submissions(messages)).toHaveLength(0);
        expect(messages.some(message => message.role === 'user' && message.content === 'OLD')).toBe(true);
    },
);

test('synthetic call IDs are stable and cannot collide with real calls', async () => {
    historyToolsSupported = true;
    manager.serviceSettings.openai_max_context = 2000;
    const chat = [historyRecord('OLD', true), historyRecord('OLDER_REPLY'), historyRecord('NOW', true)];
    const first = await assembleHistory(chat);
    const collision = submissions(first.messages)[0]?.id;
    expect(collision).toBeDefined();
    const real = historyRecord('lookup card', false, { tool_invocations: [{ id: collision, name: 'lookup', parameters: '{}', result: 'lookup' }] });
    real.is_system = true;
    chat.splice(2, 0, real);
    const { messages } = await assembleHistory(chat);
    const ids = messages.flatMap(message => message.tool_calls ?? []).map(call => call.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(messages.some(message => message.role === 'tool' && message.tool_call_id === collision)).toBe(true);
    expect((await assembleHistory(chat)).messages).toEqual(messages);
});

test.each([[57, false], [58, true]])('history budget %i admits the anchor and a whole synthetic pair or neither', async (budget, admitted) => {
    historyToolsSupported = true;
    manager.serviceSettings.openai_max_context = budget;
    tailContent = '';
    count.mockImplementation(async value => (Array.isArray(value) ? value : [value]).reduce((sum, message) => {
        if (message.tool_calls) return sum + 20;
        if (message.role === 'tool') return sum + 7;
        if (message.content === '以下是此前已经发生的对话。') return sum + 5;
        if (message.content === 'NOW') return sum + 3;
        return sum;
    }, 0));
    // context - output(20) - priming(3) - current input(3) - anchor(5) = pair budget.
    const { messages, completion } = await assembleHistory([historyRecord('OLD', true), historyRecord('NOW', true)]);
    expect(submissions(messages)).toHaveLength(admitted ? 1 : 0);
    expect(messages.filter(message => message.role === 'tool')).toHaveLength(admitted ? 1 : 0);
    expect(messages.some(message => message.content === '以下是此前已经发生的对话。')).toBe(admitted);
    expect(messages.some(message => message.content === 'NOW')).toBe(true);
    if (!admitted) expect(completion.getDroppedEntries().some(entry => entry.content === 'OLD')).toBe(true);
});

test.each([
    [61, false, false, true],
    [62, true, false, false],
    [70, true, false, false],
    [71, true, true, true],
])('history budget %i charges a user injection and the anchor only when needed', async (budget, hasInjection, hasEarlier, hasAnchor) => {
    historyToolsSupported = true;
    manager.serviceSettings.openai_max_context = budget;
    tailContent = '';
    count.mockImplementation(async value => (Array.isArray(value) ? value : [value]).reduce((sum, message) => {
        if (message.tool_calls) return sum + 20;
        if (message.role === 'tool') return sum + 7;
        if (message.content === '以下是此前已经发生的对话。') return sum + 5;
        if (message.content === 'NOW') return sum + 3;
        if (message.content === 'USER_INJECTION') return sum + 9;
        if (message.content === 'EARLIER_SYSTEM') return sum + 4;
        return sum;
    }, 0));
    const chat = [
        { role: 'system', content: 'EARLIER_SYSTEM' },
        { role: 'user', content: 'USER_INJECTION', injected: true },
        { role: 'assistant', content: 'OLD' },
        { role: 'user', content: 'NOW' },
    ];
    const { messages } = await assembleHistory(chat, { raw: true });
    expect(submissions(messages)).toHaveLength(1);
    expect(messages.some(message => message.content === 'USER_INJECTION')).toBe(hasInjection);
    expect(messages.some(message => message.content === 'EARLIER_SYSTEM')).toBe(hasEarlier);
    expect(messages.some(message => message.content === '以下是此前已经发生的对话。')).toBe(hasAnchor);
    expect((await assembleHistory(chat, { raw: true, preview: true })).messages).toEqual(messages);
});

test.each([
    'Short instruction',
    'History instruction from the user: keep track of the location, the characters, and everything they have said and done so far.',
])('a user injection fits without an unnecessary anchor at a real tokenizer boundary: %s', async instruction => {
    const encoding = get_encoding('cl100k_base');
    historyToolsSupported = true;
    tailContent = '';
    count.mockImplementation(async (value, full = false) => {
        const messages = Array.isArray(value) ? value : [value];
        return messages.reduce((sum, message) => sum + 6 + Object.entries(message).reduce(
            (tokens, [key, content]) => tokens + encoding.encode(content).length + (key === 'name' ? 1 : 0), 0,
        ), -1) - (full ? 0 : 2);
    });
    const chat = [
        { role: 'user', content: instruction, injected: true },
        { role: 'assistant', content: 'Past story' },
        { role: 'user', content: 'Continue' },
    ];
    try {
        manager.serviceSettings.openai_max_context = 2000;
        const wide = await assembleHistory(chat, { raw: true });
        const normalized = wide.messages.map(message => Object.fromEntries(Object.entries(message).filter(([, value]) => value !== undefined)
            .map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)])));
        const messageTokens = (await Promise.all(normalized.map(message => count([message])))).reduce((a, b) => a + b, 0);
        const toolTokens = await count([{ role: 'user', content: JSON.stringify({ tools: [{ type: 'function', function: { name: 'analyze' } }] }) }]);
        const run = core.getPipelineRunState();
        const instructionTokens = await count([{ role: 'system', content: core.buildStepPrompt(run.steps[run.index], run.index, run.steps.length) }], true);
        manager.serviceSettings.openai_max_context = 20 + 3 + messageTokens + toolTokens + instructionTokens;
        const exact = await assembleHistory(chat, { raw: true });
        expect(exact.messages).toEqual(wide.messages);
        expect(exact.messages.some(message => message.content === instruction)).toBe(true);
        expect(exact.messages.some(message => message.content === '以下是此前已经发生的对话。')).toBe(false);
        const upstream = postProcessPrompt(structuredClone(exact.messages), { userName: 'User', charName: 'Character' });
        expect(upstream.some(message => message.content === 'Let\'s get started.')).toBe(false);
    } finally { encoding.free(); }
});

test.each([[81, false], [82, true]])('budget %i rolls back tentative real calls unless the preceding user fits', async (budget, includeRealCall) => {
    historyToolsSupported = true;
    manager.serviceSettings.openai_max_context = budget;
    tailContent = '';
    count.mockImplementation(async value => (Array.isArray(value) ? value : [value]).reduce((sum, message) => {
        if (message.tool_calls) return sum + 20;
        if (message.role === 'tool') return sum + 7;
        if (message.content === '以下是此前已经发生的对话。') return sum + 5;
        if (message.content === 'NOW') return sum + 3;
        if (message.content === 'SHORT_USER') return sum + 2;
        return sum;
    }, 0));
    const chat = [
        { role: 'user', content: 'SHORT_USER', injected: true },
        { role: 'assistant', content: '', isSystemRecord: true, invocations: [{ id: 'real', name: 'lookup', parameters: '{}', result: 'RESULT' }] },
        { role: 'assistant', content: 'OLD' },
        { role: 'user', content: 'NOW' },
    ];
    const { messages, completion } = await assembleHistory(chat, { raw: true });
    expect(submissions(messages)).toHaveLength(1);
    expect(messages.some(message => message.tool_calls?.some(call => call.id === 'real'))).toBe(includeRealCall);
    expect(messages.some(message => message.tool_call_id === 'real')).toBe(includeRealCall);
    expect(messages.some(message => message.content === 'SHORT_USER')).toBe(includeRealCall);
    expect(messages.some(message => message.content === '以下是此前已经发生的对话。')).toBe(!includeRealCall);
    if (!includeRealCall) expect(completion.getDroppedEntries().some(entry => entry.content === 'SHORT_USER')).toBe(true);
    expect((await assembleHistory(chat, { raw: true, preview: true })).messages).toEqual(messages);
});

test('a budget-filled projected history passes the wire budget check with the real counter convention', async () => {
    const encoding = get_encoding('cl100k_base');
    historyToolsSupported = true;
    tailContent = '';
    // Client sends one message per count request. The server adds 3 tokens
    // per message plus 3 padding; the client starts at -1 and subtracts 2
    // unless full=true. Preserve that convention, not just text token costs.
    count.mockImplementation(async (value, full = false) => {
        const messages = Array.isArray(value) ? value : [value];
        return messages.reduce((sum, message) => sum + 6 + Object.entries(message).reduce(
            (tokens, [key, content]) => tokens + encoding.encode(content).length + (key === 'name' ? 1 : 0), 0,
        ), -1) - (full ? 0 : 2);
    });
    const chat = Array.from({ length: 20 }, (_, index) => historyRecord(`PAST_${index} ${'story '.repeat(15)}`, index % 2 === 0));
    chat.push(historyRecord('NOW', true));
    try {
        for (const context of [300, 350, 400]) {
            runtime.endPipelineRun();
            runtime.beginPipelineRun();
            manager.serviceSettings.openai_max_context = context;
            openai.oai_settings.openai_max_context = context;
            const { messages, completion } = await assembleHistory(chat);
            expect(submissions(messages).length).toBeGreaterThan(0);
            expect(completion.getDroppedEntries().length).toBeGreaterThan(0);
            const { generate_data } = await openai.buildChatCompletionRequest({ type: 'normal', messages, model: 'gpt-4o-mini', emitSettingsReady: true });
            const upstream = postProcessPrompt(structuredClone(generate_data.messages), { userName: 'User', charName: 'Character' });
            // The history anchor must prevent server-only placeholder growth.
            expect(upstream.some(message => message.content === 'Let\'s get started.')).toBe(false);
            const normalized = upstream.map(message => Object.fromEntries(Object.entries(message).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)])));
            const wireTokens = 3 + (await Promise.all(normalized.map(message => count([message])))).reduce((sum, tokens) => sum + tokens, 0);
            const toolTokens = await count([{ role: 'system', content: JSON.stringify(generate_data.tools) }], true);
            expect(wireTokens + toolTokens + generate_data.max_tokens).toBeLessThanOrEqual(context);
        }
    } finally { encoding.free(); }
});

test('budget boundary counts native null content and tool argument bytes with a real tokenizer', async () => {
    const encoding = get_encoding('cl100k_base');
    const text = 'very large analysis '.repeat(1000);
    count.mockImplementation(async messages => {
        let tokens = 0;
        for (const message of messages) {
            try { for (const value of Object.values(message)) tokens += encoding.encode(value).length; } catch { /* actual route swallows per-message errors */ }
        }
        return tokens;
    });
    openai.oai_settings.openai_max_context = 5000;
    try {
        await expect(openai.buildChatCompletionRequest({ type: 'normal', model: 'gpt-4o-mini', emitSettingsReady: true,
            messages: [{ role: 'assistant', content: null, tool_calls: [{ id: 'a', type: 'function', function: { name: 'analyze', arguments: JSON.stringify({ content: text }) } }] },
                { role: 'tool', tool_call_id: 'a', content: text }],
        })).rejects.toThrow(/Reply pipeline.*budget/);
    } finally { encoding.free(); }
});

test('dry-run appends the same step-only tail as live without mutating the run', async () => {
    const before = structuredClone(core.getPipelineRunState());
    globalThis.toastr = { error: jest.fn() };
    const [preview] = await openai.prepareOpenAIMessages({ type: 'normal', pipelineStepTag: 'pipeline:analyze', messages: [] }, true, { bookkeep: false });
    expect(preview.at(-1)).toEqual({ role: 'system', content: 'STEP_TAIL' });
    expect(core.getPipelineRunState()).toEqual(before);
    runtime.applyPipelineRequestShaping({ type: 'normal', messages: [], tools: [] });
    await openai.prepareOpenAIMessages({ type: 'normal', pipelineStepTag: 'pipeline:analyze' }, false);
    expect(core.getPipelineRunState().stepPrompts).toEqual(preview.filter(message => message.content === 'STEP_TAIL'));
});

/** Mirrors src/endpoints/tokenizers.js:957-969: each value goes to encode(), a throw loses the rest of that message. */
function serverCountLoop(encoding) {
    return async messages => {
        let tokens = 0;
        for (const message of messages) {
            try {
                for (const value of Object.values(message)) tokens += encoding.encode(value).length;
            } catch { /* the route swallows the per-message error and keeps a partial count */ }
        }
        return tokens;
    };
}

test.each([
    ['refusal', { refusal: null }],
    ['reasoning_details', { reasoning_details: [{ type: 'reasoning.encrypted', id: 'a', data: 'provider-signature' }] }],
])('provider metadata (%s) before the call arguments cannot interrupt the count', async (_label, extra) => {
    const encoding = get_encoding('cl100k_base');
    count.mockImplementation(serverCountLoop(encoding));
    const text = 'very large analysis '.repeat(1000);
    openai.oai_settings.openai_max_context = 5000;
    try {
        // Field order matters: the reviewed defect only fires when the native
        // metadata precedes tool_calls, exactly as the provider sends it.
        await expect(openai.buildChatCompletionRequest({ type: 'normal', model: 'gpt-4o-mini', emitSettingsReady: true,
            messages: [
                { role: 'assistant', content: null, ...extra,
                    tool_calls: [{ id: 'a', type: 'function', function: { name: 'analyze', arguments: JSON.stringify({ content: text }) } }] },
                { role: 'tool', tool_call_id: 'a', content: text },
            ],
        })).rejects.toThrow(/Reply pipeline.*budget/);
    } finally { encoding.free(); }
});

test('preview step tail is counted into the preview budget data path', async () => {
    const encoding = get_encoding('cl100k_base');
    count.mockImplementation(async messages => {
        let tokens = 0;
        // The client counter takes a message or an array of messages.
        for (const message of Array.isArray(messages) ? messages : [messages]) {
            tokens += Object.values(message).reduce((sum, value) => sum + encoding.encode(value).length, 0);
        }
        return tokens;
    });
    toolCallingSupported = false;
    globalThis.toastr = { error: jest.fn() };
    try {
        const tailCost = text => Object.values({ role: 'system', content: text })
            .reduce((sum, value) => sum + encoding.encode(value).length, 0);
        const shortTail = 'short step material';
        tailContent = shortTail;
        const [, , shortCompletion] = await openai.prepareOpenAIMessages({ type: 'normal', pipelineStepTag: 'pipeline:analyze', messages: [] }, true, { bookkeep: false });
        const shortTokens = tailCost(shortTail);
        expect(shortTokens).toBeGreaterThan(0);
        // The inspector reads exactly these three fields off ChatCompletion.
        expect(shortCompletion.getTotalTokenCount()).toBe(shortTokens);
        expect(shortCompletion.getChatEntries()?.at(-1)).toMatchObject({ role: 'system', content: shortTail });
        expect(shortCompletion.getChat().at(-1)).toEqual({ role: 'system', content: shortTail });
        expect(shortCompletion.error).toBeUndefined();
        const baseBudget = shortCompletion.tokenBudget + shortTokens;
        expect(baseBudget).toBeLessThan(100 - 20);

        const longTail = 'very large step material '.repeat(2000);
        tailContent = longTail;
        const [, , longCompletion] = await openai.prepareOpenAIMessages({ type: 'normal', pipelineStepTag: 'pipeline:analyze', messages: [] }, true, { bookkeep: false });
        const longTokens = tailCost(longTail);
        expect(longTokens).toBeGreaterThan(baseBudget);
        expect(longCompletion.getTotalTokenCount()).toBe(longTokens);
        // The budget follows the material: same base, only the tail differs.
        expect(longCompletion.tokenBudget).toBe(baseBudget - longTokens);
        expect(longCompletion.tokenBudget).toBeLessThan(0);
        // Overflow still shows the material; it is reported, not silently dropped.
        expect(longCompletion.getChat().at(-1)).toEqual({ role: 'system', content: longTail });
        expect(longCompletion.error?.name).toBe('TokenBudgetExceeded');
    } finally { encoding.free(); }
});
