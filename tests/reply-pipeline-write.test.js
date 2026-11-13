import { expect, jest, test } from '@jest/globals';
import { loadTsModule } from './helpers/load-ts-module.mjs';

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
const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
const lifecycle = createGenerationLifecycleService(() => ({}));

// Execute typed dispatch and final folding, with real pipeline/tool logic and
// only browser and storage effects isolated in memory.
test.each(['stream', 'nonstream'])('%s call plus prose folds two real card writes into one assistant reply', async mode => {
    chat.length = 0;
    runtime.endPipelineRun();
    runtime.beginPipelineRun();
    const saveReply = jest.fn(async ({ getMessage, type }) => {
        chat.push({ is_user: false, mes: getMessage, extra: {} });
        return { type, getMessage };
    });
    const ownsRun = () => true;
    const finalizePipeline = input => lifecycle.finalizePipelineReply(input, {
        ownsRun, chat, clean: value => value, formatTags: (calls, text) => ToolManager.formatPipelineTagMarkup(calls, text),
        regexOutput: value => value, removeCardView: () => {}, emitDeleted: async () => {}, saveReply,
        endPipeline: runtime.endPipelineRun, saveChat: async () => {}, unblock: () => {}, clearProcessor: () => {}, refresh: () => {},
    });
    const saveInvocations = calls => ToolManager.saveFunctionToolInvocations(calls, { ownsRun });
    const deleteLast = async () => { chat.pop(); };
    for (const [index, content] of ['first', 'second'].entries()) {
        runtime.applyPipelineRequestShaping({ type: 'normal', messages: [{ role: 'user', content: 'hello' }], tools: [] });
        const call = { id: `id-${index}`, type: 'function', function: { name: 'submit_story', arguments: JSON.stringify({ content }) } };
        const response = { choices: [{ index: 0, message: { role: 'assistant', content: 'companion prose', tool_calls: [call] } }] };
        if (mode === 'stream') {
            // The stream session has already saved its provisional assistant message.
            await saveReply({ type: 'normal', getMessage: 'companion prose' });
            const processor = { isStopped: false, isFinished: true, toolCalls: [[call]], result: 'companion prose', messageId: chat.length - 1, reasoningHandler: { reasoning: '' }, reasoningSignature: null };
            await lifecycle.finishStreamAttempt({ type: 'normal', isOpenAI: true, canPerformTools: true, attemptModel: 'model', text: 'companion prose', processor }, {
                ownsRun, clean: value => value, lastMessage: () => chat.at(-1), hasToolCalls: () => true, hasPipeline: () => true,
                deleteLast, invokeTools: (calls, options) => ToolManager.invokeFunctionTools(calls, options),
                prepareRound: runtime.preparePipelineRound, clearProcessor: () => {}, saveInvocations,
                markComplete: () => {}, finalizePipeline,
            });
        } else {
            await lifecycle.completeGenerationResponse({ type: 'normal', data: response, canPerformToolCalls: true }, {
                ownsRun, extractMessage: () => 'companion prose', extractTitle: () => '', extractReasoning: () => '',
                extractImages: () => null, extractSignature: () => null, clean: value => value, cleanReasoning: value => value,
                hasRecoveryMessage: () => false, saveReply, setType: () => {}, hasToolCalls: () => true,
                hasPipeline: () => true, deleteLastMessage: deleteLast,
                invokeTools: (data, reasoning, owner) => ToolManager.invokeFunctionTools(data, { reasoningText: reasoning, ownsRun: owner }),
                preparePipeline: runtime.preparePipelineRound, saveTools: saveInvocations, finalizePipeline, continueAfterTools: async () => {},
            });
        }
        if (index === 0) {
            expect(chat).toHaveLength(1);
            expect(chat[0].extra.tool_invocations.map(item => item.pipeline.tool)).toEqual(['analyze']);
            expect(JSON.stringify(chat)).not.toContain('companion prose');
            expect(getPipelineRunState().index).toBe(1);
        }
    }
    expect(chat).toHaveLength(1);
    expect(chat[0].mes).toBe('&lt;analyze&gt;first&lt;/analyze&gt;\n&lt;respond&gt;second&lt;/respond&gt;');
    expect(chat[0].extra.tool_invocations.map(item => item.pipeline.tool)).toEqual(['analyze', 'respond']);
    expect(JSON.stringify(chat)).not.toContain('companion prose');
    expect(getPipelineRunState()).toBeNull();
});
