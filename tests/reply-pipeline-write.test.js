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

test('plain text becomes an internal result while in-run history stays plain', () => {
    runtime.endPipelineRun();
    runtime.beginPipelineRun();
    runtime.applyPipelineRequestShaping({ type: 'normal', messages: [{ role: 'user', content: 'hello' }], tools: [] });
    const invocations = runtime.pipelineTextInvocations('plain first', '');
    expect(invocations[0]).toMatchObject({ name: 'submit_story', result: 'plain first' });
    expect(runtime.preparePipelineRound(invocations).action).toBe('continue');
    const next = { type: 'normal', messages: [], tools: [] };
    runtime.applyPipelineRequestShaping(next);
    expect(next.messages).toContainEqual({ role: 'assistant', content: 'plain first' });
    expect(next.messages.some(message => message.role === 'tool')).toBe(false);
    expect(next.tools[0].function.name).toBe('respond');
    runtime.endPipelineRun();
});

test.each(['stream', 'nonstream'])('%s plain text continuation preserves provider metadata without fake calls', async mode => {
    chat.length = 0;
    runtime.endPipelineRun(); runtime.beginPipelineRun();
    runtime.applyPipelineRequestShaping({ type: 'normal', messages: [{ role: 'user', content: 'hello' }], tools: [] });
    const message = { role: 'assistant', content: 'raw text', reasoning_content: 'provider thought', reasoning_details: [{ type: 'reasoning.encrypted', data: 'opaque' }] };
    if (mode === 'stream') {
        chat.push({ mes: 'raw text', extra: {} });
        const processor = { isStopped: false, isFinished: true, toolCalls: [], result: 'raw text', messageId: 0, reasoningHandler: { reasoning: 'stream thought' }, reasoningSignature: 'stream-signature' };
        await lifecycle.finishStreamAttempt({ type: 'normal', isOpenAI: true, canPerformTools: true, attemptModel: 'model', text: 'raw text', processor }, {
            ownsRun: () => true, clean: value => value, textInvocations: runtime.pipelineTextInvocations,
            deleteLast: async () => { chat.pop(); }, prepareRound: runtime.preparePipelineRound, clearProcessor: () => {}, saveInvocations: async () => {},
        });
    } else {
        const data = { choices: [{ index: 0, message }] };
        await lifecycle.completeGenerationResponse({ type: 'normal', data, canPerformToolCalls: true }, {
            ownsRun: () => true, extractMessage: value => value.choices[0].message.content, extractTitle: () => '', extractReasoning: () => 'provider thought',
            extractImages: () => null, extractSignature: () => null, clean: value => value, cleanReasoning: value => value,
            hasRecoveryMessage: () => false, saveReply: async ({ type, getMessage }) => ({ type, getMessage }), setType: () => {},
            hasToolCalls: () => false, textInvocations: runtime.pipelineTextInvocations, deleteLastMessage: async () => {},
            preparePipeline: runtime.preparePipelineRound, saveTools: async () => {}, continueAfterTools: async () => {},
        });
    }
    const next = { type: 'normal', messages: [], tools: [] };
    runtime.applyPipelineRequestShaping(next);
    const assistant = next.messages.find(item => item.role === 'assistant');
    if (mode === 'stream') expect(assistant).toEqual({ role: 'assistant', content: 'raw text', reasoning: 'stream thought', signature: 'stream-signature' });
    else expect(assistant).toEqual(message);
    expect(assistant.tool_calls).toBeUndefined();
    expect(next.messages.some(item => item.role === 'tool')).toBe(false);
    const retry = { type: 'normal', messages: [], tools: [] };
    runtime.applyPipelineRequestShaping(retry);
    expect(retry.messages).toEqual(next.messages);
    runtime.endPipelineRun();
});
test.each(['stream', 'nonstream'])('%s text loses ownership during provisional deletion without writing a card', async mode => {
    chat.length = 0;
    runtime.endPipelineRun(); runtime.beginPipelineRun();
    runtime.applyPipelineRequestShaping({ type: 'normal', messages: [{ role: 'user', content: 'hello' }], tools: [] });
    const run = getPipelineRunState();
    let owned = true;
    const ownsRun = () => owned;
    const deleteLast = async () => { chat.pop(); owned = false; };
    const saved = jest.fn();
    if (mode === 'stream') {
        chat.push({ mes: 'plain', extra: {} });
        const processor = { isStopped: false, isFinished: true, toolCalls: [], result: 'plain', messageId: 0, reasoningHandler: { reasoning: '' }, reasoningSignature: null };
        await expect(lifecycle.finishStreamAttempt({ type: 'normal', isOpenAI: true, canPerformTools: true, attemptModel: 'model', text: 'plain', processor }, {
            ownsRun, clean: value => value, textInvocations: runtime.pipelineTextInvocations, deleteLast,
            prepareRound: runtime.preparePipelineRound, saveInvocations: saved,
        })).rejects.toThrow('Generation was aborted.');
    } else {
        await lifecycle.completeGenerationResponse({ type: 'normal', data: { text: 'plain' }, canPerformToolCalls: true }, {
            ownsRun, extractMessage: data => data.text, extractTitle: () => '', extractReasoning: () => '', extractImages: () => null,
            extractSignature: () => null, clean: value => value, cleanReasoning: value => value, hasRecoveryMessage: () => false,
            saveReply: async ({ type, getMessage }) => { chat.push({ mes: getMessage }); return { type, getMessage }; }, setType: () => {},
            hasToolCalls: () => false, textInvocations: runtime.pipelineTextInvocations, deleteLastMessage: deleteLast,
            preparePipeline: runtime.preparePipelineRound, saveTools: saved,
        });
    }
    expect(saved).not.toHaveBeenCalled();
    expect(chat).toEqual([]);
    expect(run.index).toBe(0);
    expect(run.messages.some(message => message.role === 'assistant')).toBe(false);
    runtime.endPipelineRun();
});

test.each([['stream', 'nonstream'], ['nonstream', 'stream']])('mixed %s then %s plain replies save one ordered answer', async (first, second) => {
    chat.length = 0;
    runtime.endPipelineRun();
    runtime.beginPipelineRun();
    const ownsRun = () => true;
    const savedSnapshots = [];
    const saveReply = async ({ getMessage, type }) => { chat.push({ is_user: false, mes: getMessage, extra: {} }); return { type, getMessage }; };
    const saveInvocations = calls => ToolManager.saveFunctionToolInvocations(calls, { ownsRun });
    const finalizePipeline = input => lifecycle.finalizePipelineReply(input, {
        ownsRun, chat, clean: value => value, formatTags: (calls, text) => ToolManager.formatPipelineTagMarkup(calls, text),
        regexOutput: value => value, removeCardView: () => {}, emitDeleted: async () => {}, saveReply,
        endPipeline: runtime.endPipelineRun, saveChat: async () => { savedSnapshots.push(structuredClone(chat)); }, unblock: () => {}, clearProcessor: () => {}, refresh: () => {},
    });
    for (const [index, mode] of [first, second].entries()) {
        const text = ['first', 'second'][index];
        const request = { type: 'normal', messages: [{ role: 'user', content: 'hello' }], tools: [] };
        runtime.applyPipelineRequestShaping(request);
        if (index) expect(request.messages).toContainEqual({ role: 'assistant', content: 'first' });
        if (mode === 'stream') {
            await saveReply({ type: 'normal', getMessage: text });
            const processor = { isStopped: false, isFinished: true, toolCalls: [], result: text, messageId: chat.length - 1, reasoningHandler: { reasoning: '' }, reasoningSignature: null };
            await lifecycle.finishStreamAttempt({ type: 'normal', isOpenAI: true, canPerformTools: true, attemptModel: 'model', text, processor }, {
                ownsRun, clean: value => value, textInvocations: runtime.pipelineTextInvocations,
                deleteLast: async () => { chat.pop(); }, prepareRound: runtime.preparePipelineRound, clearProcessor: () => {},
                saveInvocations, markComplete: () => {}, finalizePipeline,
            });
        } else {
            await lifecycle.completeGenerationResponse({ type: 'normal', data: { text }, canPerformToolCalls: true }, {
                ownsRun, extractMessage: data => data.text, extractTitle: () => '', extractReasoning: () => '',
                extractImages: () => null, extractSignature: () => null, clean: value => value, cleanReasoning: value => value,
                hasRecoveryMessage: () => false, saveReply, setType: () => {}, hasToolCalls: () => false,
                textInvocations: runtime.pipelineTextInvocations, deleteLastMessage: async () => { chat.pop(); },
                preparePipeline: runtime.preparePipelineRound, saveTools: saveInvocations, finalizePipeline, continueAfterTools: async () => {},
            });
        }
    }
    expect(chat).toHaveLength(1);
    expect(chat[0].mes).toBe('&lt;analyze&gt;first&lt;/analyze&gt;\n&lt;respond&gt;second&lt;/respond&gt;');
    expect(chat[0].extra.tool_invocations.map(item => item.pipeline.tool)).toEqual(['analyze', 'respond']);
    expect(savedSnapshots).toEqual([chat]);
});


// Execute typed dispatch and final folding, with real pipeline/tool logic and
// only browser and storage effects isolated in memory.
test.each([
    ['stream', false], ['nonstream', false], ['stream', true], ['nonstream', true],
])('%s call then text=%s folds two real card writes into one assistant reply', async (mode, textSecond) => {
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
        const call = { id: `id-${index}`, type: 'function', function: { name: index === 0 ? 'analyze' : 'respond', arguments: JSON.stringify({ content }) } };
        const response = { choices: [{ index: 0, message: { role: 'assistant', content: 'companion prose', tool_calls: [call] } }] };
        const textOnly = textSecond && index === 1;
        const prose = textOnly ? content : 'companion prose';
        if (mode === 'stream') {
            // The stream session has already saved its provisional assistant message.
            await saveReply({ type: 'normal', getMessage: prose });
            const processor = { isStopped: false, isFinished: true, toolCalls: textOnly ? [] : [[call]], result: prose, messageId: chat.length - 1, reasoningHandler: { reasoning: '' }, reasoningSignature: null };
            await lifecycle.finishStreamAttempt({ type: 'normal', isOpenAI: true, canPerformTools: true, attemptModel: 'model', text: prose, processor }, {
                ownsRun, clean: value => value, lastMessage: () => chat.at(-1), hasToolCalls: () => !textOnly, hasPipeline: () => true, textInvocations: runtime.pipelineTextInvocations,
                deleteLast, invokeTools: (calls, options) => ToolManager.invokeFunctionTools(calls, options),
                prepareRound: runtime.preparePipelineRound, clearProcessor: () => {}, saveInvocations,
                markComplete: () => {}, finalizePipeline,
            });
        } else {
            await lifecycle.completeGenerationResponse({ type: 'normal', data: response, canPerformToolCalls: true }, {
                ownsRun, extractMessage: () => prose, extractTitle: () => '', extractReasoning: () => '',
                extractImages: () => null, extractSignature: () => null, clean: value => value, cleanReasoning: value => value,
                hasRecoveryMessage: () => false, saveReply, setType: () => {}, hasToolCalls: () => !textOnly, textInvocations: runtime.pipelineTextInvocations,
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
