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
            steps: [{ tool: 'analyze' }, { tool: 'respond' }, { tool: 'respond2', display: 'full' }],
            final: 'respond',
        });

        expect(pipeline.steps[0].display).toBe('summary');
        expect(pipeline.steps[1].display).toBe('hidden');
        expect(pipeline.steps[2].display).toBe('full');
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
            ],
            final: 'ok-name',
        });

        expect(pipeline.steps.map(step => step.tool)).toEqual(['ok-name', 'other']);
        expect(pipeline.steps[0].display).toBe('hidden');
        expect(pipeline.steps[1].display).toBe('summary');
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

    test('returns null when nothing matches and flags errored matches', async () => {
        const { findStepCompletion } = await importFreshCore();

        expect(findStepCompletion(steps, [{ name: 'unknown', error: false }])).toBeNull();
        expect(findStepCompletion(steps, [{ name: 'analyze', error: true }])).toMatchObject({ errored: true, isFinal: false });
    });
});
