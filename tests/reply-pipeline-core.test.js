import { describe, expect, test } from '@jest/globals';

async function importFreshCore() {
    return import(`../public/scripts/reply-pipeline-core.js?cacheBust=${Date.now()}-${Math.random()}`);
}

describe('normalizeReplyPipeline', () => {
    test('returns a disabled pipeline for non-object input', async () => {
        const { normalizeReplyPipeline } = await importFreshCore();

        for (const input of [undefined, null, 'x', 42, []]) {
            expect(normalizeReplyPipeline(input)).toMatchObject({ enabled: false, steps: [], final: '' });
        }
    });

    test('normalizes steps and fills defaults', async () => {
        const { normalizeReplyPipeline } = await importFreshCore();

        const pipeline = normalizeReplyPipeline({
            enabled: true,
            steps: [
                { tool: 'analyze', prompt: 'think first' },
                { tool: 'respond', prompt: 'write the reply', max_tokens: 900 },
            ],
            final: 'respond',
        });

        expect(pipeline.enabled).toBe(true);
        expect(pipeline.final).toBe('respond');
        expect(pipeline.enforceMode).toBe('auto');
        expect(pipeline.steps).toHaveLength(2);
        expect(pipeline.steps[0]).toMatchObject({ tool: 'analyze', prompt: 'think first', display: 'summary', maxTokens: null });
        expect(pipeline.steps[1]).toMatchObject({ tool: 'respond', maxTokens: 900 });
        expect(typeof pipeline.steps[0].id).toBe('string');
    });

    test('defaults the final step to hidden and honors explicit display', async () => {
        const { normalizeReplyPipeline } = await importFreshCore();

        const pipeline = normalizeReplyPipeline({
            enabled: true,
            steps: [{ tool: 'analyze' }, { tool: 'respond' }],
            final: 'respond',
        });

        expect(pipeline.steps[0].display).toBe('summary');
        expect(pipeline.steps[1].display).toBe('hidden');
    });

    test('truncates the plan at the named final step', async () => {
        const { normalizeReplyPipeline } = await importFreshCore();

        const pipeline = normalizeReplyPipeline({
            enabled: true,
            steps: [{ tool: 'analyze' }, { tool: 'review' }, { tool: 'respond', display: 'full' }],
            final: 'review',
        });

        // Steps after `final` are unreachable — the run ends there.
        expect(pipeline.steps.map(step => step.tool)).toEqual(['analyze', 'review']);
        expect(pipeline.final).toBe('review');
        expect(pipeline.steps[1].display).toBe('hidden');
    });

    test('falls back to the last step when final is missing or unknown', async () => {
        const { normalizeReplyPipeline } = await importFreshCore();

        const missing = normalizeReplyPipeline({ enabled: true, steps: [{ tool: 'a' }, { tool: 'b' }] });
        expect(missing.final).toBe('b');
        expect(missing.steps[1].display).toBe('hidden');

        const unknown = normalizeReplyPipeline({ enabled: true, steps: [{ tool: 'a' }, { tool: 'b' }], final: 'nope' });
        expect(unknown.final).toBe('b');
    });

    test('clamps the plan to the recursion-bound step budget', async () => {
        const { MAX_PIPELINE_STEPS, normalizeReplyPipeline } = await importFreshCore();

        const pipeline = normalizeReplyPipeline({
            enabled: true,
            steps: Array.from({ length: MAX_PIPELINE_STEPS + 2 }, (_, index) => ({ tool: `tool_${index}` })),
        });

        expect(pipeline.steps).toHaveLength(MAX_PIPELINE_STEPS);
        expect(pipeline.final).toBe(`tool_${MAX_PIPELINE_STEPS - 1}`);
    });

    test('drops steps without a usable tool name and clamps display modes', async () => {
        const { normalizeReplyPipeline } = await importFreshCore();

        const pipeline = normalizeReplyPipeline({
            enabled: true,
            steps: [
                { tool: 'ok-name', display: 'hidden' },
                { tool: 'bad name!' },
                { tool: '' },
                { prompt: 'no tool' },
                { tool: 'other', display: 'nonsense' },
                { tool: 'tail' },
            ],
            final: 'tail',
        });

        expect(pipeline.steps.map(step => step.tool)).toEqual(['ok-name', 'other', 'tail']);
        expect(pipeline.steps[0].display).toBe('hidden');
        expect(pipeline.steps[1].display).toBe('summary');
        expect(pipeline.steps[2].display).toBe('hidden');
    });

    test('accepts forced enforce mode and rejects unknown values', async () => {
        const { normalizeReplyPipeline } = await importFreshCore();

        expect(normalizeReplyPipeline({ enabled: true, enforce_mode: 'forced', steps: [{ tool: 'a' }] }).enforceMode).toBe('forced');
        expect(normalizeReplyPipeline({ enabled: true, enforce_mode: 'weird', steps: [{ tool: 'a' }] }).enforceMode).toBe('auto');
    });

    test('parses result_field when present', async () => {
        const { normalizeReplyPipeline } = await importFreshCore();

        expect(normalizeReplyPipeline({ enabled: true, steps: [{ tool: 'a' }], final: 'a', result_field: 'writing' }).resultField).toBe('writing');
        expect(normalizeReplyPipeline({ enabled: true, steps: [{ tool: 'a' }], final: 'a' }).resultField).toBe('');
    });
});

describe('resolvePipelineSteps', () => {
    test('keeps only steps whose tools are available', async () => {
        const { normalizeReplyPipeline, resolvePipelineSteps } = await importFreshCore();

        const pipeline = normalizeReplyPipeline({
            enabled: true,
            steps: [{ tool: 'analyze' }, { tool: 'missing' }, { tool: 'respond' }],
            final: 'respond',
        });

        const resolved = resolvePipelineSteps(pipeline, ['analyze', 'respond']);
        expect(resolved.map(step => step.tool)).toEqual(['analyze', 'respond']);
        expect(resolvePipelineSteps(pipeline, [])).toEqual([]);
    });
});

describe('buildStepPrompt', () => {
    test('names the tool and embeds the step prompt', async () => {
        const { buildStepPrompt } = await importFreshCore();

        const prompt = buildStepPrompt({ tool: 'analyze', prompt: 'think about pacing' }, 0, 3);
        expect(prompt).toContain('analyze');
        expect(prompt).toContain('think about pacing');
        expect(prompt).toContain('1/3');
    });

    test('handles empty step prompts', async () => {
        const { buildStepPrompt } = await importFreshCore();

        const prompt = buildStepPrompt({ tool: 'respond', prompt: '' }, 2, 3);
        expect(prompt).toContain('respond');
        expect(prompt).toContain('3/3');
    });
});

describe('extractFinalStepText', () => {
    const finalStep = { id: 's3', tool: 'respond' };

    test('returns null when the final step was not invoked', async () => {
        const { extractFinalStepText } = await importFreshCore();

        expect(extractFinalStepText([{ name: 'analyze', result: 'ok', error: false }], finalStep, '')).toBeNull();
        expect(extractFinalStepText([], finalStep, '')).toBeNull();
    });

    test('returns null for errored or empty final results', async () => {
        const { extractFinalStepText } = await importFreshCore();

        expect(extractFinalStepText([{ name: 'respond', result: 'boom', error: true }], finalStep, '')).toBeNull();
        expect(extractFinalStepText([{ name: 'respond', result: '', error: false }], finalStep, '')).toBeNull();
        expect(extractFinalStepText([{ name: 'respond', result: '   ', error: false }], finalStep, '')).toBeNull();
    });

    test('uses a plain string result as the message', async () => {
        const { extractFinalStepText } = await importFreshCore();

        const text = extractFinalStepText([{ name: 'respond', result: '*She nods.* "Tea?"', error: false }], finalStep, '');
        expect(text).toBe('*She nods.* "Tea?"');
    });

    test('refuses JSON object results when no result_field is configured', async () => {
        const { extractFinalStepText } = await importFreshCore();

        expect(extractFinalStepText([{ name: 'respond', result: '{"ok":true}', error: false }], finalStep, '')).toBeNull();
    });

    test('extracts a dot-path result_field from JSON results', async () => {
        const { extractFinalStepText } = await importFreshCore();

        const result = JSON.stringify({ ok: true, writing: 'the actual reply' });
        expect(extractFinalStepText([{ name: 'respond', result, error: false }], finalStep, 'writing')).toBe('the actual reply');

        const nested = JSON.stringify({ data: { text: 'deep' } });
        expect(extractFinalStepText([{ name: 'respond', result: nested, error: false }], finalStep, 'data.text')).toBe('deep');
        expect(extractFinalStepText([{ name: 'respond', result: nested, error: false }], finalStep, 'data.missing')).toBeNull();
    });

    test('unwraps JSON scalar strings without leaking quotes', async () => {
        const { extractFinalStepText } = await importFreshCore();

        expect(extractFinalStepText([{ name: 'respond', result: '"hello there"', error: false }], finalStep, '')).toBe('hello there');
        expect(extractFinalStepText([{ name: 'respond', result: '""', error: false }], finalStep, '')).toBeNull();
    });
});

describe('findStepCompletion', () => {
    const steps = [{ id: 's1', tool: 'analyze' }, { id: 's2', tool: 'review' }, { id: 's3', tool: 'respond' }];

    test('matches invocations to steps by tool name', async () => {
        const { findStepCompletion } = await importFreshCore();

        const completion = findStepCompletion(steps, [{ name: 'analyze', error: false }]);
        expect(completion).toMatchObject({ step: steps[0], index: 0, isFinal: false, errored: false });

        const finalCompletion = findStepCompletion(steps, [{ name: 'respond', error: false }]);
        expect(finalCompletion).toMatchObject({ step: steps[2], index: 2, isFinal: true });
    });

    test('advances to the furthest matched step when the model batches or jumps ahead', async () => {
        const { findStepCompletion } = await importFreshCore();

        // Parallel calls in one round: plan advances past both.
        const batched = findStepCompletion(steps, [{ name: 'analyze' }, { name: 'review' }]);
        expect(batched).toMatchObject({ step: steps[1], index: 1, isFinal: false });

        // The final tool called early: the reply exists, so the run finalizes
        // instead of re-requesting skipped steps.
        const early = findStepCompletion(steps, [{ name: 'respond' }]);
        expect(early).toMatchObject({ index: 2, isFinal: true });
    });

    test('returns null when nothing matches and flags errored matches', async () => {
        const { findStepCompletion } = await importFreshCore();

        expect(findStepCompletion(steps, [{ name: 'unknown', error: false }])).toBeNull();
        expect(findStepCompletion(steps, [{ name: 'analyze', error: true }])).toMatchObject({ errored: true, isFinal: false });
    });
});

describe('pipelineTriggerTag', () => {
    test('builds pipeline:<tool> trigger tags', async () => {
        const { pipelineTriggerTag } = await importFreshCore();

        expect(pipelineTriggerTag('review')).toBe('pipeline:review');
        expect(pipelineTriggerTag('  analyze ')).toBe('pipeline:analyze');
    });
});

describe('step reasoning_effort', () => {
    test('normalizes a valid reasoning_effort onto the step', async () => {
        const { normalizeReplyPipeline } = await importFreshCore();

        const pipeline = normalizeReplyPipeline({
            enabled: true,
            steps: [
                { tool: 'analyze', reasoning_effort: 'low' },
                { tool: 'respond' },
            ],
        });

        expect(pipeline.steps[0].reasoningEffort).toBe('low');
        expect(pipeline.steps[1].reasoningEffort).toBeNull();
    });

    test('rejects values outside the reasoning effort vocabulary', async () => {
        const { normalizeReplyPipeline } = await importFreshCore();

        const pipeline = normalizeReplyPipeline({
            enabled: true,
            steps: [{ tool: 'analyze', reasoning_effort: 'extreme' }],
        });

        expect(pipeline.steps[0].reasoningEffort).toBeNull();
    });
});

describe('applyStepRequestOverrides tool narrowing', () => {
    const makeBody = () => ({
        tools: [
            { type: 'function', function: { name: 'analyze' } },
            { type: 'function', function: { name: 'review' } },
            { type: 'function', function: { name: 'respond' } },
            { type: 'function', function: { name: 'options' } },
        ],
        tool_choice: 'auto',
    });

    test('forced mode pins tool_choice and narrows tools to the step function', async () => {
        const { applyStepRequestOverrides } = await importFreshCore();

        const data = applyStepRequestOverrides(makeBody(), { tool: 'analyze' }, { enforceMode: 'forced' });

        expect(data.tool_choice).toEqual({ type: 'function', function: { name: 'analyze' } });
        expect(data.tools.map(tool => tool.function.name)).toEqual(['analyze']);
    });

    test('auto mode narrows tools to the step function too — the plan owns the tool surface', async () => {
        const { applyStepRequestOverrides } = await importFreshCore();

        const data = applyStepRequestOverrides(makeBody(), { tool: 'review' }, { enforceMode: 'auto' });

        expect(data.tool_choice).toBe('auto');
        expect(data.tools.map(tool => tool.function.name)).toEqual(['review']);
    });

    test('keeps the list untouched when the step tool is not registered', async () => {
        const { applyStepRequestOverrides } = await importFreshCore();

        const data = applyStepRequestOverrides(makeBody(), { tool: 'absent' }, { enforceMode: 'auto' });

        expect(data.tools).toHaveLength(4);
    });

    test('leaves bodies without tools alone', async () => {
        const { applyStepRequestOverrides } = await importFreshCore();

        const data = applyStepRequestOverrides({ messages: [] }, { tool: 'analyze' }, { enforceMode: 'forced' });

        expect(data.tools).toBeUndefined();
        expect(data.tool_choice).toBeUndefined();
    });
});
