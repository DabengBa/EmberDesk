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
