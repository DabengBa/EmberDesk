import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const settings = { reply_pipeline: { enabled: true, steps: [{ tool: 'analyze' }, { tool: 'reply' }] } };
jest.unstable_mockModule('../public/scripts/openai.js', () => ({ oai_settings: settings }));
jest.unstable_mockModule('../public/scripts/feature-settings.js', () => ({ feature_settings: {
    tool_bindings: [{ name: 'analyze', enabled: true }, { name: 'reply', enabled: true }],
} }));
jest.unstable_mockModule('../public/scripts/tool-bindings.js', () => ({ syncPipelineToolBindings: jest.fn() }));
const runtime = await import('../public/scripts/reply-pipeline.js');
const core = await import('../public/scripts/reply-pipeline-core.js');
const tools = ['analyze', 'reply', 'other'].map(name => ({ type: 'function', function: { name } }));
const request = (content = 'base WI macro once') => ({ type: 'normal', messages: [{ role: 'user', content }], tools: structuredClone(tools), tool_choice: 'auto' });
const call = (name = 'analyze', id = 'original-id') => ({ id, type: 'function', function: { name, arguments: '{ "content": "value" }' } });

beforeEach(() => { runtime.endPipelineRun(); runtime.beginPipelineRun(); });

describe('live pipeline wire state', () => {
    test('same wire name advances by index with logical step metadata and receipts', () => {
        const first = request();
        runtime.applyPipelineRequestShaping(first);
        core.validatePipelineToolCalls([call('submit_story', 'one')]);
        const one = [{ name: 'submit_story', id: 'one', result: 'first', parameters: '{"content":"first"}' }];
        expect(runtime.preparePipelineRound(one).action).toBe('continue');
        expect(one[0].pipeline).toMatchObject({ stepIndex: 0, stepId: 'step-1' });
        expect(runtime.getPipelineTriggerTag('normal')).toBe('pipeline:reply');
        const second = request('drift');
        runtime.applyPipelineRequestShaping(second);
        expect(second.messages).toContainEqual({ role: 'tool', tool_call_id: 'one', content: '已收到。' });
        core.validatePipelineToolCalls([call('submit_story', 'two')]);
        const two = [{ name: 'submit_story', id: 'two', result: 'second', parameters: '{"content":"second"}' }];
        expect(runtime.preparePipelineRound(two)).toMatchObject({ action: 'final', text: 'second' });
        expect(two[0].pipeline).toMatchObject({ stepIndex: 1, stepId: 'step-2' });
    });
    test('runnable pipeline exposes the submit_story content interface', () => {
        const first = request();
        runtime.applyPipelineRequestShaping(first);
        const story = first.tools.find(tool => tool.function.name === 'submit_story');
        expect(story?.function.parameters).toMatchObject({
            type: 'object',
            properties: { content: { type: 'string' } },
            required: ['content'],
        });
    });

    test('resolves the selected step before building, with recovery and closing taking precedence', () => {
        runtime.endPipelineRun();
        settings.reply_pipeline.steps = [{ tool: 'analyze', model: 'gpt-4o-mini' }, { tool: 'reply', model: 'o3' }];
        runtime.beginPipelineRun();
        expect(runtime.resolvePipelineModel('preset')).toBe('gpt-4o-mini');
        expect(runtime.resolvePipelineModel('preset', { fallbackModel: 'recovery' })).toBe('recovery');
        expect(runtime.resolvePreviewPipelineModel('preset', 1)).toBe('o3');
        expect(runtime.resolvePreviewPipelineModel('preset', 2)).toBe('preset');
        runtime.markPipelineFallbackRound();
        expect(runtime.resolvePipelineModel('preset')).toBe('preset');
        settings.reply_pipeline.steps = [{ tool: 'analyze' }, { tool: 'reply' }];
    });
    test('captures base once, appends actual rounds and keeps tools through fallback and retries', () => {
        const first = request();
        runtime.applyPipelineRequestShaping(first);
        const prefix = structuredClone(first.messages);
        first.messages[0].content = 'external mutation';
        first.tools[0].function.name = 'external mutation';
        const assistant = { role: 'assistant', content: 'actual accompanying text', tool_calls: [call('submit_story')], reasoning_content: 'reason' };
        core.validatePipelineToolCalls([call('submit_story')], assistant);
        runtime.preparePipelineRound([{ name: 'submit_story', id: 'original-id', result: 'result one' }]);
        const next = request('drifted WI macro must not be used');
        runtime.applyPipelineRequestShaping(next);
        expect(next.messages.slice(0, prefix.length)).toEqual(prefix);
        expect(next.messages.slice(prefix.length, -1)).toEqual([assistant, { role: 'tool', tool_call_id: 'original-id', content: '已收到。' }]);
        expect(next.tools[0].function.name).toBe('submit_story');
        const secondPrefix = structuredClone(next.messages);
        runtime.applyPipelineRequestShaping(next);
        expect(next.messages).toEqual(secondPrefix);
        core.validatePipelineToolCalls([call('submit_story', 'last-id')]);
        runtime.preparePipelineRound([{ name: 'submit_story', id: 'last-id', result: '{"ok":true}' }]);
        const fallback = request('more drift');
        runtime.applyPipelineRequestShaping(fallback);
        expect(fallback.messages.slice(0, secondPrefix.length)).toEqual(secondPrefix);
        expect(fallback.tools[0].function.name).toBe('submit_story');
        expect(fallback.tool_choice).toBe('none');
    });

    test.each([[call('reply')], [call('other')], [call(), call()], [call(), call('reply')]].map(calls => [calls]))('rejects invalid call set before execution: %p', calls => {
        expect(() => core.validatePipelineToolCalls(calls)).toThrow(/Reply pipeline/);
    });

    test('rejects duplicate dispatch; ending the run releases all wire state', () => {
        core.validatePipelineToolCalls([call('submit_story')]);
        expect(() => core.validatePipelineToolCalls([call('submit_story')])).toThrow(/Reply pipeline/);
        runtime.endPipelineRun();
        expect(core.getPipelineRunState()).toBeNull();
        expect(() => core.validatePipelineToolCalls([call('other')])).not.toThrow();
    });

    test('quiet request does not capture or modify active run', () => {
        const quiet = { ...request(), type: 'quiet' };
        const before = structuredClone(quiet);
        runtime.applyPipelineRequestShaping(quiet);
        expect(quiet).toEqual(before);
        expect(core.getPipelineRunState().messages).toBeUndefined();
    });

    test('closing preview uses the same captured story tool and choice as live fallback', () => {
        const initial = request();
        runtime.applyPipelineRequestShaping(initial);
        runtime.markPipelineFallbackRound();
        const live = request();
        runtime.applyPipelineRequestShaping(live);
        const preview = request();
        runtime.previewPipelineRequestShaping(preview, { round: 2 });
        expect(preview.tools).toEqual(live.tools);
        expect(preview.tool_choice).toEqual(live.tool_choice);
    });
});
