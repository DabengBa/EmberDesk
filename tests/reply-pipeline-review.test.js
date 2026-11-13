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
const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
const lifecycle = createGenerationLifecycleService(() => ({}));

beforeEach(() => {
    runtime.endPipelineRun();
    runtime.beginPipelineRun();
    runtime.markPipelineFallbackRound();
});

// Exercise the typed transport's actual recurse gate and, for streams, its
// real completion policy. Only provider and browser effects are controlled.
async function runClosingRound({ streaming, calls }) {
    let canPerformTools;
    const invokeTools = jest.fn();
    const processor = { isStopped: false, isFinished: true, toolCalls: calls ? [[{ id: 'bad' }]] : [],
        result: 'closing prose', messageId: 0, reasoningHandler: { reasoning: '' }, reasoningSignature: null };
    const transport = {
        ownsRun: () => true, presetModel: () => 'model', pipelineModel: model => model,
        setAttemptModel: () => {}, canPerformTools: () => true, recurseLimit: () => 10,
        setCanPerformTools: value => { canPerformTools = value; },
        isOpenAIStreaming: () => streaming, createStream: () => processor,
        sendStream: async () => ({}), setStreamGenerator: () => {}, consumeStream: async () => 'closing prose',
        streamAborted: () => false,
        finishStream: (_context, text, current) => lifecycle.finishStreamAttempt({
            type: 'normal', isOpenAI: true, canPerformTools, attemptModel: 'model', text, processor: current,
        }, {
            ownsRun: () => true, clean: value => value,
            assertAllowed: count => assertPipelineResponseAllowed(count, { canPerformToolCalls: canPerformTools }),
            invokeTools, setModel: () => {}, finishMessage: async () => {}, markComplete: () => {},
            refresh: () => {}, clearProcessor: () => {}, clearRecovery: () => {}, endPipeline: () => {},
        }),
        send: async () => ({ content: 'closing prose', tool_calls: calls ? [{ id: 'bad' }] : [] }),
        hasToolCalls: result => Boolean(result.tool_calls?.length),
        assertAllowed: () => assertPipelineResponseAllowed(1, { canPerformToolCalls: canPerformTools }),
        isEmpty: () => false,
    };
    const result = lifecycle.runTransportAttempt({ type: 'normal', depth: 10, isOpenAI: true,
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
