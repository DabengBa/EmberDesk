import { describe, expect, test } from '@jest/globals';

async function importFreshComposerStateModule() {
    return import(`../public/scripts/main-chat-composer-state.js?cacheBust=${Date.now()}-${Math.random()}`);
}

describe('main chat composer bridge state', () => {
    test.each([
        ['empty', {}, {
            valueLength: 0,
            isEmpty: true,
            canSubmit: false,
            isFocused: false,
            isDisabled: false,
            isGenerating: false,
            activeContext: 'none',
        }],
        ['non-empty', { valueLength: 24, hasValue: true, canSubmit: true, activeContext: 'character' }, {
            valueLength: 24,
            isEmpty: false,
            canSubmit: true,
            isFocused: false,
            isDisabled: false,
            isGenerating: false,
            activeContext: 'character',
        }],
        ['focused', { valueLength: 3, hasValue: true, canSubmit: true, isFocused: true, activeContext: 'group' }, {
            valueLength: 3,
            isEmpty: false,
            canSubmit: true,
            isFocused: true,
            isDisabled: false,
            isGenerating: false,
            activeContext: 'group',
        }],
        ['disabled while generating', { valueLength: 8, hasValue: true, canSubmit: true, isDisabled: true, isGenerating: true, activeContext: 'assistant' }, {
            valueLength: 8,
            isEmpty: false,
            canSubmit: false,
            isFocused: false,
            isDisabled: true,
            isGenerating: true,
            activeContext: 'assistant',
        }],
        ['after send empty', { valueLength: 0, hasValue: false, canSubmit: false, activeContext: 'character' }, {
            valueLength: 0,
            isEmpty: true,
            canSubmit: false,
            isFocused: false,
            isDisabled: false,
            isGenerating: false,
            activeContext: 'character',
        }],
    ])('classifies %s composer state without exposing prompt text', async (_name, input, expected) => {
        const { getMainChatComposerState } = await importFreshComposerStateModule();

        expect(getMainChatComposerState(input)).toEqual(expected);
    });

    test('normalizes unsafe metadata and never returns prompt text', async () => {
        const { getMainChatComposerState } = await importFreshComposerStateModule();

        const composerState = getMainChatComposerState({
            valueLength: -3,
            hasValue: 'yes',
            canSubmit: 1,
            isFocused: 'true',
            isDisabled: 0,
            isGenerating: 1,
            activeContext: 'unknown',
            value: 'secret prompt text',
        });

        expect(composerState).toEqual({
            valueLength: 0,
            isEmpty: true,
            canSubmit: false,
            isFocused: true,
            isDisabled: false,
            isGenerating: true,
            activeContext: 'none',
        });
        expect(composerState).not.toHaveProperty('value');
    });
});
