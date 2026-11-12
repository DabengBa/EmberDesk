import { beforeEach, expect, jest, test } from '@jest/globals';

jest.unstable_mockModule('../public/lib.js', () => ({ DOMPurify: {} }));
jest.unstable_mockModule('../public/script.js', () => Object.fromEntries(['addOneMessage', 'chat', 'getGeneratingApi', 'getGeneratingModel', 'main_api', 'saveChatConditional', 'system_avatar', 'systemUserName'].map(key => [key, key === 'main_api' ? 'openai' : jest.fn()])));
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
beforeEach(() => {
    action.mockClear(); formatter.mockClear();
    oai_settings.reply_pipeline.enabled = true;
    run = { steps: [{ tool: 'analyze' }], index: 0 };
    setPipelineRunStateProvider(() => run);
    for (const name of ['analyze', 'later', 'outside']) {
        ToolManager.unregisterFunctionTool(name);
        ToolManager.registerFunctionTool({ name, description: `${name} description`, action, formatMessage: formatter, parameters: {}, stealth: false });
    }
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
    const assistant = { role: 'assistant', content: 'actual text', reasoning_content: 'reason', tool_calls: [call('analyze')] };
    const result = await ToolManager.invokeFunctionTools({ choices: [{ index: 0, message: assistant }] });
    expect(run.pendingAssistant).toEqual(assistant);
    expect(result.invocations[0].result).toBe('raw text');
    await expect(ToolManager.invokeFunctionTools([[call('analyze')]])).rejects.toThrow(/Reply pipeline/);
    expect(action).toHaveBeenCalledTimes(1);
    run = { steps: [{ tool: 'analyze' }], index: 0 };
    await ToolManager.invokeFunctionTools([[call('analyze')]], { reasoningText: 'stream reason', assistantMessage: { role: 'assistant', content: 'stream accompanying text', tool_calls: [call('analyze')], signature: 'sig' } });
    expect(run.pendingAssistant.tool_calls).toEqual([call('analyze')]);
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
    const wireTools = JSON.parse(JSON.stringify(first.tools));
    expect(first.tools[0].toString()).toContain('<b>analyze</b>');
    runtime.applyPipelineRequestShaping(first);
    expect(first.tools).toEqual(wireTools);
    expect(first.messages.at(-1).content).toContain('analyze');

    runtime.preparePipelineRound([{ name: 'analyze', id: 'id', result: 'raw text' }]);
    const second = { type: 'normal', messages: [{ role: 'user', content: 'hello' }] };
    await ToolManager.registerFunctionToolsOpenAI(second);
    runtime.applyPipelineRequestShaping(second);
    expect(second.tools).toEqual(wireTools);
    expect(second.messages.at(-1).content).toContain('later');
    runtime.endPipelineRun();
});
