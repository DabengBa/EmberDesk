import { beforeEach, expect, jest, test } from '@jest/globals';

jest.unstable_mockModule('../public/lib.js', () => ({ DOMPurify: {} }));
const chat = [];
const emit = jest.fn(async () => {});
const save = jest.fn(async predicate => { if (!predicate || predicate()) return true; });
jest.unstable_mockModule('../public/script.js', () => ({ addOneMessage: jest.fn(), chat, getGeneratingApi: jest.fn(), getGeneratingModel: jest.fn(), main_api: 'openai', saveChatConditional: save, system_avatar: '', systemUserName: 'system' }));
jest.unstable_mockModule('../public/scripts/events.js', () => ({ eventSource: { emit }, event_types: { TOOL_CALLS_PERFORMED: 'performed', TOOL_CALLS_RENDERED: 'rendered' } }));
jest.unstable_mockModule('../public/scripts/feature-settings.js', () => ({ feature_settings: { tool_bindings: [{ name: 'analyze', enabled: true }, { name: 'later', enabled: true }] } }));
jest.unstable_mockModule('../public/scripts/extensions/regex/engine.js', () => ({ getRegexedString: jest.fn(), regex_placement: {} }));
jest.unstable_mockModule('../public/scripts/message-service.js', () => ({ updateMessageBlock: jest.fn() }));
jest.unstable_mockModule('../public/scripts/openai.js', () => ({ chat_completion_sources: { OPENAI: 'openai' }, getChatCompletionModel: () => 'model', model_list: [], oai_settings: { chat_completion_source: 'openai', reply_pipeline: { enabled: true, steps: [{ tool: 'analyze' }, { tool: 'later' }] } } }));
jest.unstable_mockModule('../public/scripts/tool-bindings.js', () => ({ syncPipelineToolBindings: jest.fn() }));
jest.unstable_mockModule('../public/scripts/popup.js', () => ({ Popup: {} }));

const { ToolManager } = await import('../public/scripts/tool-calling.js');
const { oai_settings } = await import('../public/scripts/openai.js');
const { setPipelineRunStateProvider } = await import('../public/scripts/reply-pipeline-core.js');
const runtime = await import('../public/scripts/reply-pipeline.js');
let run;
const action = jest.fn(async () => 'raw text');
const formatter = jest.fn(() => 'toast');
const call = (name, id = 'id') => ({ id, type: 'function', function: { name, arguments: '{ "content": "raw text" }' } });
globalThis.toastr = { info: jest.fn(), clear: jest.fn() };
globalThis.document = { createElement: () => ({ classList: { add() {} }, setAttribute() {}, append() {}, outerHTML: '<details></details>' }) };
beforeEach(() => {
    action.mockClear(); formatter.mockClear();
    chat.length = 0; emit.mockReset().mockResolvedValue(undefined); save.mockClear();
    oai_settings.reply_pipeline.enabled = true;
    run = { steps: [{ tool: 'analyze' }], index: 0 };
    setPipelineRunStateProvider(() => run);
    ToolManager.unregisterFunctionTool('submit_story');
    for (const name of ['analyze', 'later', 'outside']) {
        ToolManager.unregisterFunctionTool(name);
        ToolManager.registerFunctionTool({ name, description: `${name} description`, action, formatMessage: formatter, parameters: {}, stealth: false });
    }
});

test('stop during asynchronous tool formatting prevents starting the tool', async () => {
    run = null;
    let resume;
    formatter.mockImplementationOnce(() => new Promise(resolve => { resume = resolve; }));
    let owned = true;
    const pending = ToolManager.invokeFunctionTools([[call('outside')]], { ownsRun: () => owned });
    await new Promise(resolve => setImmediate(resolve));
    owned = false;
    resume('formatted');
    await pending;
    expect(action).not.toHaveBeenCalled();
});

test('ownership lost during performed event prevents publishing the tool card', async () => {
    let resume;
    emit.mockImplementationOnce(() => new Promise(resolve => { resume = resolve; }));
    let owned = true;
    const pending = ToolManager.saveFunctionToolInvocations([{ name: 'outside', parameters: '{}', result: 'result' }], { ownsRun: () => owned });
    await new Promise(resolve => setImmediate(resolve));
    owned = false;
    resume();
    await pending;
    expect(chat).toEqual([]);
    expect(save).not.toHaveBeenCalled();
});

test('queued tool-card save receives a live ownership predicate', async () => {
    let release;
    let owned = true;
    let committed = false;
    save.mockImplementationOnce(async predicate => {
        await new Promise(resolve => { release = resolve; });
        if (!predicate || predicate()) committed = true;
    });
    const pending = ToolManager.saveFunctionToolInvocations([{ name: 'outside', parameters: '{}', result: 'result' }], { ownsRun: () => owned });
    await new Promise(resolve => setImmediate(resolve));
    owned = false;
    release();
    await pending;
    expect(committed).toBe(false);
});

test('native tools remain available without the retired Slash registration API', async () => {
    expect(ToolManager.initToolSlashCommands).toBeUndefined();
    run = null;
    expect(await ToolManager.invokeFunctionTool('outside', '{"content":"native"}')).toBe('raw text');
    expect(action).toHaveBeenCalledWith({ content: 'native' });
    expect(await ToolManager.formatToolCallMessage('outside', '{}')).toBe('toast');
});

test('native registration respects shouldRegister and stealth calls stay out of chat', async () => {
    run = null;
    ToolManager.registerFunctionTool({ name: 'hidden-test', description: 'hidden', parameters: {}, action, stealth: true, shouldRegister: () => false });
    try {
        const request = {};
        await ToolManager.registerFunctionToolsOpenAI(request);
        expect(request.tools.some(tool => tool.function.name === 'hidden-test')).toBe(false);
        const result = await ToolManager.invokeFunctionTools([[call('hidden-test')]]);
        expect(result.stealthCalls).toEqual(['hidden-test']);
        expect(result.invocations).toEqual([]);
        expect(action).toHaveBeenCalledTimes(1);
    } finally {
        ToolManager.unregisterFunctionTool('hidden-test');
    }
});
test('disabled pipeline suppresses tools on the next generation without changing bindings', () => {
    run = null;
    expect(ToolManager.canPerformToolCalls('normal')).toBe(true);
    oai_settings.reply_pipeline.enabled = false;
    const restoredSettings = JSON.parse(JSON.stringify(oai_settings));
    expect(ToolManager.canPerformToolCalls('normal', restoredSettings, 'model')).toBe(false);
    oai_settings.reply_pipeline.enabled = true;
    expect(ToolManager.canPerformToolCalls('normal')).toBe(true);
});

test('active story carrier bypasses same-name formatter and action, but ordinary calls do not', async () => {
    ToolManager.unregisterFunctionTool('submit_story');
    ToolManager.registerFunctionTool({ name: 'submit_story', description: 'conflict', action, formatMessage: formatter, parameters: {}, stealth: false });
    const result = await ToolManager.invokeFunctionTools([[call('submit_story')]]);
    expect(result.invocations[0].result).toBe('raw text');
    expect(action).not.toHaveBeenCalled();
    expect(formatter).not.toHaveBeenCalled();
    run = null;
    await ToolManager.invokeFunctionTools([[call('submit_story', 'other')]]);
    expect(action).toHaveBeenCalledTimes(1);
    expect(formatter).toHaveBeenCalledTimes(1);
});

test('disabling during an active pipeline leaves its current run intact', () => {
    oai_settings.reply_pipeline.enabled = false;
    expect(ToolManager.canPerformToolCalls('normal')).toBe(true);
    run = null;
    expect(ToolManager.canPerformToolCalls('normal')).toBe(false);
});
test.each([[call('later')], [call('outside')], [call('analyze'), call('analyze', 'id2')], [call('analyze'), call('later', 'id2')]].map(calls => [calls]))('rejects entire invalid batch before formatter/action: %p', async calls => {
    await expect(ToolManager.invokeFunctionTools([[...calls]])).rejects.toThrow(/Reply pipeline/);
    expect(action).not.toHaveBeenCalled(); expect(formatter).not.toHaveBeenCalled();
});

test('nonstream and stream capture same original argument bytes; duplicate dispatch has no effects', async () => {
    const assistant = { role: 'assistant', content: 'actual text', reasoning_content: 'reason', tool_calls: [call('submit_story')] };
    const result = await ToolManager.invokeFunctionTools({ choices: [{ index: 0, message: assistant }] });
    expect(run.pendingAssistant).toEqual(assistant);
    expect(result.invocations[0].result).toBe('raw text');
    await expect(ToolManager.invokeFunctionTools([[call('submit_story')]])).rejects.toThrow(/Reply pipeline/);
    expect(action).not.toHaveBeenCalled();
    run = { steps: [{ tool: 'analyze' }], index: 0 };
    await ToolManager.invokeFunctionTools([[call('submit_story')]], { reasoningText: 'stream reason', assistantMessage: { role: 'assistant', content: 'stream accompanying text', tool_calls: [call('submit_story')], signature: 'sig' } });
    expect(run.pendingAssistant.tool_calls).toEqual([call('submit_story')]);
    expect(run.pendingAssistant.content).toBe('stream accompanying text');
    expect(run.pendingAssistant.signature).toBe('sig');
});

test('fallback cannot execute tools; ending run restores ordinary tool calls', async () => {
    run.fallbackRound = true;
    await expect(ToolManager.invokeFunctionTools([[call('analyze')]])).rejects.toThrow(/Reply pipeline/);
    expect(action).not.toHaveBeenCalled();
    run = null;
    await ToolManager.invokeFunctionTools([[call('outside')]]);
    expect(action).toHaveBeenCalledTimes(1);
});

test('real registered tools survive pipeline shaping across two rounds', async () => {

    runtime.endPipelineRun();
    expect(runtime.beginPipelineRun()).toBe(true);
    const first = { type: 'normal', messages: [{ role: 'user', content: 'hello' }] };
    await ToolManager.registerFunctionToolsOpenAI(first);

    expect(first.tools[0].toString()).toContain('<b>analyze</b>');
    runtime.applyPipelineRequestShaping(first);
    expect(first.tools[0].function.name).toBe('submit_story');
    expect(first.messages.at(-1).content).toContain('analyze');

    runtime.preparePipelineRound([{ name: 'submit_story', id: 'id', result: 'raw text' }]);
    const second = { type: 'normal', messages: [{ role: 'user', content: 'hello' }] };
    await ToolManager.registerFunctionToolsOpenAI(second);
    runtime.applyPipelineRequestShaping(second);
    expect(second.tools).toEqual(first.tools);
    expect(second.messages.at(-1).content).toContain('later');
    runtime.endPipelineRun();
});
