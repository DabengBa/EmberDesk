import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

// The production card writer uses DOM construction; the isolated shell only
// needs its string result, not browser layout.
globalThis.document = { createElement: () => ({ classList: { add() {} }, setAttribute() {}, append() {}, outerHTML: '<card></card>' }) };
globalThis.localStorage = { getItem: () => null };
globalThis.toastr = { info: jest.fn(), clear: jest.fn() };
const chat = [];
jest.unstable_mockModule('../public/lib.js', () => ({ DOMPurify: {} }));
jest.unstable_mockModule('../public/script.js', () => ({ chat, main_api: 'openai', addOneMessage: jest.fn(), getGeneratingApi: jest.fn(), getGeneratingModel: jest.fn(), saveChatConditional: jest.fn(), system_avatar: '', systemUserName: 'System' }));
jest.unstable_mockModule('../public/scripts/feature-settings.js', () => ({ feature_settings: { tool_bindings: [{ name: 'analyze', enabled: true }, { name: 'respond', enabled: true }] } }));
jest.unstable_mockModule('../public/scripts/extensions/regex/engine.js', () => ({ getRegexedString: value => value, regex_placement: {} }));
jest.unstable_mockModule('../public/scripts/message-service.js', () => ({ updateMessageBlock: jest.fn() }));
jest.unstable_mockModule('../public/scripts/openai.js', () => ({ chat_completion_sources: { OPENAI: 'openai' }, getChatCompletionModel: () => 'model', model_list: [], oai_settings: { chat_completion_source: 'openai', reply_pipeline: { enabled: true, steps: [{ tool: 'analyze' }, { tool: 'respond' }] } } }));
jest.unstable_mockModule('../public/scripts/tool-bindings.js', () => ({ syncPipelineToolBindings: jest.fn() }));
jest.unstable_mockModule('../public/scripts/popup.js', () => ({ Popup: {} }));

const { ToolManager } = await import('../public/scripts/tool-calling.js');
const runtime = await import('../public/scripts/reply-pipeline.js');
const { getPipelineRunState } = await import('../public/scripts/reply-pipeline-core.js');
const source = readFileSync(new URL('../public/scripts/generation-service.js', import.meta.url), 'utf8');

function slice(startText, endText) {
    const start = source.indexOf(startText);
    const end = source.indexOf(endText, start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return source.slice(start, end);
}

// Execute the actual generation-service dispatch and final-fold statements,
// with only the shell's storage/UI operations isolated in memory.
test.each(['stream', 'nonstream'])('%s call plus prose folds two real card writes into one assistant reply', async mode => {
    chat.length = 0;
    runtime.endPipelineRun();
    runtime.beginPipelineRun();
    const saveReply = jest.fn(async ({ getMessage, type }) => {
        chat.push({ is_user: false, mes: getMessage, extra: {} });
        return { type, getMessage };
    });
    const context = {
        state: { chat, ToolManager, regex_placement: { AI_OUTPUT: 'output' }, streamingProcessor: null },
        type: 'normal', canPerformToolCalls: true, depth: 0, automatic_trigger: false, force_name2: false,
        quiet_prompt: '', quietToLoud: false, skipWIAN: false, signal: null, quietImage: '', quietName: '', dryRun: false,
        reasoning: '', reasoningSignature: null, title: '', imageUrls: null, attemptModel: 'model',
        saveReply, cleanUpMessage: ({ getMessage }) => getMessage, getRegexedString: value => value,
        deleteLastMessage: async () => { chat.pop(); }, getPipelineRunState, preparePipelineRound: runtime.preparePipelineRound,
        endPipelineRun: runtime.endPipelineRun, saveChatConditional: async () => {}, unblockGeneration: () => {},
        isReactMainChatOwner: () => true, mountReactMainChatMessageListPanel: async () => {},
        scheduleMainChatMessageListPanelRefresh: () => {}, eventSource: { emit: async () => {} }, event_types: { MESSAGE_DELETED: 'deleted' },
        rememberMainChatStreamingTransportProcessorTerminal: () => {}, Generate: async () => 'continue',
        getGenerationSuccessFinalization: () => ({ action: 'save', type: 'normal' }),
        isAssistantRecoveryMessageId: () => false, activeRecoveryMessageId: null,
    };
    const finalSource = slice('async function finalizePipelineReply(', '\n    async function finishGenerating()');
    context.finalizePipelineReply = new Function('ctx', `with (ctx) { ${finalSource}; return finalizePipelineReply; }`)(context);
    const dispatch = mode === 'stream'
        ? slice('const isStreamFinished =', '\n                if (isStreamFinished)')
        : slice("if (type == 'quiet') {", "\n        console.debug('/api/chats/save called by /Generate');");
    const execute = new Function('ctx', `with (ctx) { return (async () => { ${dispatch} })(); }`);
    for (const [index, content] of ['first', 'second'].entries()) {
        runtime.applyPipelineRequestShaping({ type: 'normal', messages: [{ role: 'user', content: 'hello' }], tools: [] });
        const call = { id: `id-${index}`, type: 'function', function: { name: 'submit_story', arguments: JSON.stringify({ content }) } };
        const response = { choices: [{ index: 0, message: { role: 'assistant', content: 'companion prose', tool_calls: [call] } }] };
        context.getMessage = 'companion prose';
        context.data = response;
        if (mode === 'stream') {
            // The stream session has already saved its provisional assistant message.
            await saveReply({ type: 'normal', getMessage: 'companion prose' });
            context.state.streamingProcessor = { isStopped: false, isFinished: true, toolCalls: [[call]], result: 'companion prose', messageId: chat.length - 1, reasoningHandler: { reasoning: '' } };
        }
        await execute(context);
    }
    expect(chat).toHaveLength(1);
    expect(chat[0].mes).toBe('&lt;analyze&gt;first&lt;/analyze&gt;\n&lt;respond&gt;second&lt;/respond&gt;');
    expect(chat[0].extra.tool_invocations.map(item => item.pipeline.tool)).toEqual(['analyze', 'respond']);
    expect(JSON.stringify(chat)).not.toContain('companion prose');
    expect(getPipelineRunState()).toBeNull();
});
