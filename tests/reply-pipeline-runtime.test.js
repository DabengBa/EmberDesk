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
    test('captures base once, appends actual rounds and keeps tools through fallback and retries', () => {
        const first = request();
        runtime.applyPipelineRequestShaping(first);
        const prefix = structuredClone(first.messages);
        first.messages[0].content = 'external mutation';
        first.tools[0].function.name = 'external mutation';
        const assistant = { role: 'assistant', content: 'actual accompanying text', tool_calls: [call()], reasoning_content: 'reason' };
        core.validatePipelineToolCalls([call()], assistant);
        runtime.preparePipelineRound([{ name: 'analyze', id: 'original-id', result: 'result one' }]);
        const next = request('drifted WI macro must not be used');
        runtime.applyPipelineRequestShaping(next);
        expect(next.messages.slice(0, prefix.length)).toEqual(prefix);
        expect(next.messages.slice(prefix.length, -1)).toEqual([assistant, { role: 'tool', tool_call_id: 'original-id', content: 'result one' }]);
        expect(next.tools).toEqual(tools);
        const secondPrefix = structuredClone(next.messages);
        runtime.applyPipelineRequestShaping(next);
        expect(next.messages).toEqual(secondPrefix);
        core.validatePipelineToolCalls([call('reply', 'last-id')]);
        runtime.preparePipelineRound([{ name: 'reply', id: 'last-id', result: '{"ok":true}' }]);
        const fallback = request('more drift');
        runtime.applyPipelineRequestShaping(fallback);
        expect(fallback.messages.slice(0, secondPrefix.length)).toEqual(secondPrefix);
        expect(fallback.tools).toEqual(tools);
        expect(fallback.tool_choice).toBe('none');
    });

    test.each([[call('reply')], [call('other')], [call(), call()], [call(), call('reply')]].map(calls => [calls]))('rejects invalid call set before execution: %p', calls => {
        expect(() => core.validatePipelineToolCalls(calls)).toThrow(/Reply pipeline/);
    });

    test('rejects duplicate dispatch; ending the run releases all wire state', () => {
        core.validatePipelineToolCalls([call()]);
        expect(() => core.validatePipelineToolCalls([call()])).toThrow(/Reply pipeline/);
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
});
