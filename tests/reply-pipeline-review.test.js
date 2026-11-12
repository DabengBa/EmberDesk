import { beforeEach, expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

// Real pipeline runtime: the depth-exhausted run is produced by the production
// state machine, not hand-built, so the guard is proven against the same shape
// generation-service sees at depth === RECURSE_LIMIT.
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

const source = readFileSync(new URL('../public/scripts/generation-service.js', import.meta.url), 'utf8');

beforeEach(() => {
    runtime.endPipelineRun();
    runtime.beginPipelineRun();
    // Depth exhaustion: RECURSE_LIMIT gate closes the run before the call
    // validator inside invokeFunctionTools can ever see the response.
    runtime.markPipelineFallbackRound();
});

/**
 * Executes the real response-boundary statements of generation-service.js.
 * The slice ends before the dispatch gate, so nothing about tool execution is
 * reimplemented here — only the guard under test runs.
 */
function boundarySlice(mode) {
    const start = mode === 'stream'
        ? source.indexOf('const isStreamFinished =')
        : source.indexOf('const result = await sendGenerationRequest');
    const end = mode === 'stream'
        ? source.indexOf('if (canPerformToolCalls && isStreamFinished', start)
        : source.indexOf('const carriesToolCalls', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return source.slice(start, end);
}

test('depth-exhausted stream response with tool calls rejects instead of succeeding', async () => {
    expect(getPipelineRunState().fallbackRound).toBe(true);
    // Depth exhaustion closes canPerformToolCalls, so the response boundary —
    // not the (unreachable) validator inside invokeFunctionTools — must reject.
    const state = { streamingProcessor: { isStopped: false, isFinished: true, toolCalls: [[{ id: 'bad' }]] } };
    const run = new Function('state', 'assertPipelineResponseAllowed', 'canPerformToolCalls',
        `return (async () => { ${boundarySlice('stream')} })();`);
    await expect(run(state, assertPipelineResponseAllowed, false))
        .rejects.toThrow(/Reply pipeline: expected exactly one current-step call \(none\)/);
});

test('depth-exhausted nonstream response with tool calls rejects instead of succeeding', async () => {
    const state = { ToolManager: { hasToolCalls: result => Boolean(result?.tool_calls?.length) } };
    const run = new Function('state', 'type', 'generate_data', 'requestOptions', 'sendGenerationRequest',
        'assertPipelineResponseAllowed', 'canPerformToolCalls',
        `return (async () => { ${boundarySlice('nonstream')} return result; })();`);
    const response = { content: 'fallback prose', tool_calls: [{ id: 'bad' }] };
    await expect(run(state, 'normal', {}, {}, async () => response, assertPipelineResponseAllowed, false))
        .rejects.toThrow(/Reply pipeline: expected exactly one current-step call \(none\)/);
});

test('clean prose-only closing round stays allowed', async () => {
    const state = { ToolManager: { hasToolCalls: result => Boolean(result?.tool_calls?.length) } };
    const run = new Function('state', 'type', 'generate_data', 'requestOptions', 'sendGenerationRequest',
        'assertPipelineResponseAllowed', 'canPerformToolCalls',
        `return (async () => { ${boundarySlice('nonstream')} return result; })();`);
    await expect(run(state, 'normal', {}, {}, async () => ({ content: 'closing prose' }), assertPipelineResponseAllowed, false))
        .resolves.toEqual({ content: 'closing prose' });
});

test('required nonstream step rejects prose without saving a reply', async () => {
    runtime.endPipelineRun();
    runtime.beginPipelineRun();
    await expect(runFinishedBoundary('nonstream', 'normal', 'prose'))
        .rejects.toThrow('Reply pipeline: expected exactly one current-step call (submit_story).');
});

test('required stream step rejects prose and identifies the provisional message', async () => {
    runtime.endPipelineRun();
    runtime.beginPipelineRun();
    await expect(runFinishedBoundary('stream', 'normal', 'prose'))
        .rejects.toMatchObject({ message: 'Reply pipeline: expected exactly one current-step call (submit_story).', messageId: 7 });
});

test('both response boundaries guard before their dispatch gate', () => {
    // The gate itself: depth === RECURSE_LIMIT disables dispatch, so the
    // validator path is unreachable and the boundary must reject on its own.
    expect(source).toContain('&& depth < state.ToolManager.RECURSE_LIMIT');
    const streamGuard = source.indexOf('assertPipelineResponseAllowed(state.streamingProcessor?.toolCalls');
    const streamDispatch = source.indexOf('state.ToolManager.invokeFunctionTools(state.streamingProcessor.toolCalls');
    const streamGate = source.indexOf('if (canPerformToolCalls && isStreamFinished && isStreamWithToolCalls)');
    expect(streamGuard).toBeGreaterThan(-1);
    expect(streamGuard).toBeLessThan(streamGate);
    expect(streamGate).toBeLessThan(streamDispatch);
    const nonstreamGuard = source.indexOf('assertPipelineResponseAllowed(1, { canPerformToolCalls })');
    const nonstreamSuccess = source.indexOf('if (!carriesToolCalls && isEmptyGenerationResult(result))');
    expect(nonstreamGuard).toBeGreaterThan(-1);
    expect(nonstreamGuard).toBeLessThan(nonstreamSuccess);
});

// Run the actual finished-response boundary, including the existing empty
// error constructor, so empty replies are checked against recovery policy.
function runFinishedBoundary(mode, type, text) {
    const constructorStart = source.indexOf('const createEmptyReplyFailure =');
    const constructorEnd = source.indexOf('const isEmptyGenerationResult =', constructorStart);
    const start = mode === 'stream'
        ? source.indexOf('const finishedMessageId = state.streamingProcessor.messageId;')
        : source.indexOf('const carriesToolCalls =');
    const end = mode === 'stream'
        ? source.indexOf("if (state.main_api === 'openai'", start)
        : source.indexOf('return result;', start);
    expect(constructorStart).toBeGreaterThan(-1);
    expect(constructorEnd).toBeGreaterThan(constructorStart);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const state = { streamingProcessor: { messageId: 7 }, ToolManager: { hasToolCalls: () => false } };
    const run = new Function('state', 'type', 'messageChunk', 'result', 'canPerformToolCalls', 'getPipelineRunState', 'isEmptyGenerationResult', 'activeRecoveryMessageId',
        `return (async () => { ${source.slice(constructorStart, constructorEnd)} ${source.slice(start, end)} return 'accepted'; })();`);
    return run(state, type, text, { content: text }, true, getPipelineRunState, result => !result.content.trim(), 7);
}

test.each(['stream', 'nonstream'])('%s active run accepts a quiet response without advancing', async mode => {
    runtime.endPipelineRun();
    runtime.beginPipelineRun();
    const run = getPipelineRunState();
    await expect(runFinishedBoundary(mode, 'quiet', 'quiet output')).resolves.toBe('accepted');
    expect(getPipelineRunState()).toBe(run);
    expect(run.index).toBe(0);
});

test.each(['stream', 'nonstream'])('%s empty response retains recoverable classification without advancing', async mode => {
    runtime.endPipelineRun();
    runtime.beginPipelineRun();
    const run = getPipelineRunState();
    let failure;
    try { await runFinishedBoundary(mode, 'normal', '   '); } catch (error) { failure = error; }
    expect(failure).toMatchObject({ message: 'empty reply', emptyReply: true, messageId: 7 });
    expect(isRecoverableGenerationFailure(failure)).toBe(true);
    expect(getPipelineRunState()).toBe(run);
    expect(run.index).toBe(0);
});
