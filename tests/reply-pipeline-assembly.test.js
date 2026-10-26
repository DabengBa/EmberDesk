import { beforeEach, expect, jest, test } from '@jest/globals';
import { get_encoding } from 'tiktoken';

// Real request assembly + pipeline runtime; only browser/external boundaries are controlled.
const substitute = jest.fn(value => value);
globalThis.localStorage = { getItem: () => null };
const count = jest.fn(async () => 10);
let tailContent = 'STEP_TAIL';
let toolCallingSupported = true;
// Minimal prompt collection so the real base assembly runs (and stays empty)
// instead of being stubbed out: only the pipeline step tail is under test.
const emptyPrompts = () => {
    const items = [];
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
};
jest.unstable_mockModule('../public/lib.js', () => ({ DOMPurify: {} }));
jest.unstable_mockModule('../public/script.js', () => Object.fromEntries([
    'abortStatusCheck', 'extension_prompt_roles', 'extension_prompt_types', 'getExtensionPrompt', 'getExtensionPromptMaxDepth',
    'getMediaDisplay', 'getMediaIndex', 'is_send_press', 'main_api', 'name1', 'name2', 'displayOnlineStatus',
    'saveSettingsDebounced', 'setOnlineStatus', 'substituteParams', 'system_message_types',
].map(key => [key, key === 'substituteParams' ? substitute : jest.fn()])));
jest.unstable_mockModule('../public/scripts/PromptManager.js', () => ({ chatCompletionDefaultPrompts: [],
    INJECTION_POSITION: {}, Prompt: class {}, PromptManager: class { constructor() { return manager; } }, promptManagerDefaultPromptOrders: [],
    // openai.js imports this migration helper; the mock must expose it too.
    removeRetiredExamplePrompts: jest.fn() }));
jest.unstable_mockModule('../public/scripts/request-context.js', () => ({ getRequestHeaders: jest.fn() }));
jest.unstable_mockModule('../public/scripts/power-user.js', () => ({ forceCharacterEditorTokenize: jest.fn(), getCustomStoppingStrings: () => [] }));
jest.unstable_mockModule('../public/scripts/secrets.js', () => Object.fromEntries(['SECRET_KEYS', 'secret_state', 'writeSecret', 'deleteSecret', 'resolveSecretKey'].map(k => [k, jest.fn()])));
jest.unstable_mockModule('../public/scripts/sse-stream.js', () => ({ getEventSourceStream: jest.fn() }));
jest.unstable_mockModule('../public/scripts/utils.js', () => Object.fromEntries(['createThumbnail', 'delay', 'download', 'getAudioDurationFromDataURL', 'getBase64Async', 'getFileText', 'getImageSizeFromDataURL', 'getVideoDurationFromDataURL', 'isDataURL', 'isValidUrl', 'resetScrollHeight', 'stringFormat'].map(k => [k, jest.fn()])));
jest.unstable_mockModule('../public/scripts/tokenizers.js', () => ({ countTokensOpenAIAsync: count }));
jest.unstable_mockModule('../public/scripts/slash-commands/SlashCommandParser.js', () => ({ SlashCommandParser: {} }));
jest.unstable_mockModule('../public/scripts/slash-commands/SlashCommand.js', () => ({ SlashCommand: {} }));
jest.unstable_mockModule('../public/scripts/slash-commands/SlashCommandArgument.js', () => ({ ARGUMENT_TYPE: {}, SlashCommandArgument: {} }));
jest.unstable_mockModule('../public/scripts/templates.js', () => ({ renderTemplateAsync: jest.fn() }));
jest.unstable_mockModule('../public/scripts/popup.js', () => ({ callGenericPopup: jest.fn(), Popup: {}, POPUP_RESULT: {}, POPUP_TYPE: {} }));
jest.unstable_mockModule('../public/scripts/i18n.js', () => ({ t: strings => strings[0] }));
jest.unstable_mockModule('../public/scripts/tool-calling.js', () => ({ ToolManager: {
    canPerformToolCalls: () => toolCallingSupported,
    registerFunctionToolsOpenAI: async data => { data.tools = [{ type: 'function', function: { name: 'analyze' } }]; },
} }));
jest.unstable_mockModule('../public/scripts/feature-settings.js', () => ({ feature_settings: { tool_bindings: [{ name: 'analyze', enabled: true }] } }));
jest.unstable_mockModule('../public/scripts/tool-bindings.js', () => ({ syncPipelineToolBindings: jest.fn() }));
const openai = await import('../public/scripts/openai.js');
const runtime = await import('../public/scripts/reply-pipeline.js');
const core = await import('../public/scripts/reply-pipeline-core.js');
const { eventSource, event_types } = await import('../public/scripts/events.js');
eventSource.on(event_types.CHAT_COMPLETION_SETTINGS_READY, runtime.applyPipelineRequestShaping);
openai.setupChatCompletionPromptManager(openai.oai_settings);
beforeEach(() => {
    runtime.endPipelineRun();
    Object.assign(openai.oai_settings, { reply_pipeline: { enabled: true, steps: [{ tool: 'analyze' }] }, openai_max_context: 100, openai_max_tokens: 20 });
    runtime.beginPipelineRun();
    count.mockResolvedValue(10); substitute.mockClear();
    tailContent = 'STEP_TAIL';
    toolCallingSupported = true;
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
