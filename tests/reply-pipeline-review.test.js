import { beforeEach, expect, jest, test } from '@jest/globals';
import { loadTsModule } from './helpers/load-ts-module.mjs';

globalThis.localStorage = { getItem: () => null };
jest.unstable_mockModule('../public/scripts/openai.js', () => ({ oai_settings: { reply_pipeline: {
    enabled: true, steps: [{ tool: 'analyze' }, { tool: 'review' }, { tool: 'respond' }],
} } }));
jest.unstable_mockModule('../public/scripts/feature-settings.js', () => ({ feature_settings: { tool_bindings: [
    { name: 'analyze', enabled: true }, { name: 'review', enabled: true }, { name: 'respond', enabled: true },
] } }));
jest.unstable_mockModule('../public/scripts/tool-bindings.js', () => ({ syncPipelineToolBindings: jest.fn() }));
const runtime = await import('../public/scripts/reply-pipeline.js');
const { assertPipelineResponseAllowed, getPipelineRunState } = await import('../public/scripts/reply-pipeline-core.js');
const { isRecoverableGenerationFailure } = await import('../public/scripts/chat-generation-auto-recovery.js');
const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
const lifecycle = createGenerationLifecycleService(() => ({}));

beforeEach(() => {
    runtime.endPipelineRun();
    runtime.beginPipelineRun();
    runtime.markPipelineFallbackRound();
});

// Exercise the typed transport's actual recurse gate and, for streams, its
// real completion policy. Only provider and browser effects are controlled.
async function runClosingRound({ streaming, calls, type = 'normal', text = 'closing prose', depth = 10 }) {
    let canPerformTools;
    const invokeTools = jest.fn();
    const processor = { isStopped: false, isFinished: true, toolCalls: calls ? [[{ id: 'bad' }]] : [],
        result: text, messageId: 7, reasoningHandler: { reasoning: '' }, reasoningSignature: null };
    const emptyFailure = () => Object.assign(new Error('empty reply'), { emptyReply: true, messageId: 7 });
    const requirePipelineCall = () => {
        const run = getPipelineRunState();
        if (type === 'normal' && run && !run.fallbackRound) throw new Error('Reply pipeline: expected exactly one current-step call (submit_story).');
    };
    const transport = {
        ownsRun: () => true, presetModel: () => 'model', pipelineModel: model => model,
        setAttemptModel: () => {}, canPerformTools: () => true, recurseLimit: () => 10,
        setCanPerformTools: value => { canPerformTools = value; },
        isOpenAIStreaming: () => streaming, createStream: () => processor,
        sendStream: async () => ({}), setStreamGenerator: () => {}, consumeStream: async () => text,
        streamAborted: () => false,
        finishStream: (_context, text, current) => lifecycle.finishStreamAttempt({
            type, isOpenAI: true, canPerformTools, attemptModel: 'model', text, processor: current,
        }, {
            ownsRun: () => true, clean: value => value,
            assertAllowed: count => assertPipelineResponseAllowed(count, { canPerformToolCalls: canPerformTools }),
            invokeTools, requirePipelineCall, emptyFailure, setModel: () => {}, finishMessage: async () => {}, markComplete: () => {},
            refresh: () => {}, clearProcessor: () => {}, clearRecovery: () => {}, endPipeline: () => {},
        }),
        send: async () => ({ content: text, tool_calls: calls ? [{ id: 'bad' }] : [] }),
        hasToolCalls: result => Boolean(result.tool_calls?.length),
        assertAllowed: () => assertPipelineResponseAllowed(1, { canPerformToolCalls: canPerformTools }),
        isEmpty: result => !result.content.trim(), emptyFailure, requirePipelineCall,
    };
    const result = lifecycle.runTransportAttempt({ type, depth, isOpenAI: true,
        attempt: { fallbackProvider: false }, index: 0, attemptCount: 1, jsonSchema: null, trace: {} }, transport);
    return { result, invokeTools, canPerformTools: () => canPerformTools };
}

test.each([false, true])('depth-exhausted response with tool calls rejects before tool dispatch (stream=%s)', async streaming => {
    expect(getPipelineRunState().fallbackRound).toBe(true);
    const run = await runClosingRound({ streaming, calls: true });
    await expect(run.result).rejects.toThrow(/Reply pipeline: expected exactly one current-step call \(none\)/);
    expect(run.canPerformTools()).toBe(false);
    expect(run.invokeTools).not.toHaveBeenCalled();
});

test.each([false, true])('prose-only closing response succeeds (stream=%s)', async streaming => {
    const run = await runClosingRound({ streaming, calls: false });
    const result = await run.result;
    expect(streaming ? String(result) : result.content).toBe('closing prose');
    expect(run.canPerformTools()).toBe(false);
    expect(run.invokeTools).not.toHaveBeenCalled();
});

test.each([true, false])('required pipeline step rejects prose before completion (stream=%s)', async streaming => {
    runtime.endPipelineRun();
    runtime.beginPipelineRun();
    const run = await runClosingRound({ streaming, calls: false, depth: 0 });
    await expect(run.result).rejects.toMatchObject({ message: 'Reply pipeline: expected exactly one current-step call (submit_story).', ...(streaming ? { messageId: 7 } : {}) });
    expect(run.invokeTools).not.toHaveBeenCalled();
});

test.each([true, false])('active run accepts a quiet response without advancing (stream=%s)', async streaming => {
    runtime.endPipelineRun();
    runtime.beginPipelineRun();
    const run = getPipelineRunState();
    const attempt = await runClosingRound({ streaming, calls: false, type: 'quiet', text: 'quiet output', depth: 0 });
    await expect(attempt.result).resolves.toBeTruthy();
    expect(getPipelineRunState()).toBe(run);
    expect(run.index).toBe(0);
});

test.each([true, false])('empty response retains recoverable classification without advancing (stream=%s)', async streaming => {
    runtime.endPipelineRun();
    runtime.beginPipelineRun();
    const run = getPipelineRunState();
    let failure;
    const attempt = await runClosingRound({ streaming, calls: false, text: '   ', depth: 0 });
    try { await attempt.result; } catch (error) { failure = error; }
    expect(failure).toMatchObject({ message: 'empty reply', emptyReply: true, messageId: 7 });
    expect(isRecoverableGenerationFailure(failure)).toBe(true);
    expect(getPipelineRunState()).toBe(run);
    expect(run.index).toBe(0);
});

test('final story reply tags the final pipeline step using carrier metadata', async () => {
    const invocation = { name: 'submit_story', pipeline: { tool: 'respond' } };
    const chat = [{ extra: { reply_pipeline_run: 'run', tool_invocations: [invocation] } }];
    const formatTags = jest.fn((_calls, text) => `<respond>${text}</respond>`);
    const saveReply = jest.fn(async reply => { chat.push({ extra: {} }); return reply; });
    await lifecycle.finalizePipelineReply({ type: 'normal', text: 'answer', step: { tool: 'respond' }, meta: { runId: 'run' } }, {
        ownsRun: () => true, chat, clean: value => value, formatTags, regexOutput: value => value,
        removeCardView: () => {}, emitDeleted: async () => {}, saveReply,
        endPipeline: () => {}, saveChat: async () => {}, unblock: () => {}, clearProcessor: () => {}, refresh: () => {},
    });
    expect(formatTags).toHaveBeenCalledWith([invocation], 'answer');
    expect(saveReply.mock.calls[0][0].getMessage).toBe('<respond>answer</respond>');
});

test('stream story call removes provisional prose before saving the pipeline card', async () => {
    const deleteLast = jest.fn(async () => {});
    const finalizeIntermediary = jest.fn(async () => {});
    const processor = { isStopped: false, isFinished: true, toolCalls: [[{ id: 'one' }]], result: 'provisional', messageId: 1,
        reasoningHandler: { reasoning: 'thinking' }, reasoningSignature: null };
    await lifecycle.finishStreamAttempt({ type: 'normal', isOpenAI: true, canPerformTools: true, attemptModel: 'model', text: 'provisional', processor }, {
        ownsRun: () => true, clean: value => value, lastMessage: () => ({ mes: 'provisional' }), hasToolCalls: () => true,
        hasPipeline: () => true, deleteLast, finalizeIntermediary, invokeTools: async () => ({ invocations: [{}], stealthCalls: [] }),
        prepareRound: () => ({ action: 'continue' }), clearProcessor: () => {}, saveInvocations: async () => {},
    });
    expect(deleteLast).toHaveBeenCalledTimes(1);
    expect(finalizeIntermediary).not.toHaveBeenCalled();
});

test('nonstream story call removes provisional prose before saving the pipeline card', async () => {
    const deleteLastMessage = jest.fn(async () => {});
    await lifecycle.completeGenerationResponse({ data: {}, type: 'normal', canPerformToolCalls: true }, {
        ownsRun: () => true, extractMessage: () => 'provisional', extractTitle: () => '', extractReasoning: () => 'thinking',
        extractImages: () => null, extractSignature: () => null, clean: value => value, cleanReasoning: value => value,
        hasRecoveryMessage: () => false, saveReply: async reply => reply, setType: () => {}, hasToolCalls: () => true,
        hasPipeline: () => true, deleteLastMessage, invokeTools: async () => ({ invocations: [{}], stealthCalls: [] }),
        preparePipeline: () => ({ action: 'continue' }), saveTools: async () => {}, continueAfterTools: async () => {},
    });
    expect(deleteLastMessage).toHaveBeenCalledTimes(1);
});
