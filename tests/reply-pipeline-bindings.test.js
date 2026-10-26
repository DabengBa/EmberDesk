import { describe, expect, test } from '@jest/globals';
import * as core from '../public/scripts/tool-bindings-core.js';
import { extractFinalStepText } from '../public/scripts/reply-pipeline-core.js';

describe('pipeline binding synchronization', () => {
    test.each([undefined, null, 42, true, { text: 'must not become reply' }, '', '  \n'])('rejects malformed content %p even with result_field', async content => {
        const store = [];
        core.ensurePipelineToolBindings(store, ['reply']);
        const result = await core.createToolAction(store[0].actionBody)({ content });
        for (const field of [undefined, 'text', 'error']) {
            expect(extractFinalStepText([{ name: 'reply', result }], { tool: 'reply' }, field)).toBeNull();
        }
    });
    test('creates only valid, missing names and returns usable model-authored text', async () => {
        const store = [];
        expect(core.ensurePipelineToolBindings(store, ['reply', '', 'bad name', 'reply', 'x'.repeat(65)])).toBe(true);
        expect(store).toHaveLength(1);
        expect(store[0]).toMatchObject({ name: 'reply', enabled: true, stealth: false,
            parameters: { required: ['content'], properties: { content: { type: 'string' } } } });
        const action = core.createToolAction(store[0].actionBody);
        for (const content of ['hello', '{"hello":"world"}', '[1,2]', '42', 'null', '"quoted"']) {
            const result = await action({ content });
            expect(result).toBe(content);
            expect(extractFinalStepText([{ name: 'reply', result, parameters: JSON.stringify({ content }) }], { tool: 'reply' })).toBe(content);
        }
        expect(core.ensurePipelineToolBindings(store, ['reply'])).toBe(false);
        expect(store).toHaveLength(1);
    });

    test('passive load preserves custom fields and flags; explicit commit enables without replacing action/schema', () => {
        const binding = { id: 'custom', name: 'reply', enabled: false, stealth: true,
            parameters: { type: 'object', properties: { custom: { type: 'number' } } }, actionBody: 'return args.custom;', extra: 42 };
        const store = [binding];
        expect(core.ensurePipelineToolBindings(store, ['reply'])).toBe(false);
        expect(binding).toMatchObject({ enabled: false, stealth: true });
        expect(core.ensurePipelineToolBindings(store, ['reply'], { activate: true })).toBe(true);
        expect(store[0]).toBe(binding);
        expect(binding).toMatchObject({ enabled: true, stealth: false, extra: 42, actionBody: 'return args.custom;' });
        expect(binding.parameters.properties.custom).toEqual({ type: 'number' });
    });

    test('does not create placeholders for code-registered names, or delete bindings', () => {
        const store = [{ name: 'old', enabled: true }];
        expect(core.ensurePipelineToolBindings(store, ['code'], { registeredNames: ['code'] })).toBe(false);
        core.ensurePipelineToolBindings(store, []);
        expect(store).toEqual([{ name: 'old', enabled: true }]);
    });
});
