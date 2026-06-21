import { describe, expect, test } from '@jest/globals';

async function importFreshSlashStateModule() {
    return import(`../public/scripts/main-chat-slash-command-state.js?cacheBust=${Date.now()}-${Math.random()}`);
}

describe('main chat slash-command bridge state', () => {
    test.each([
        ['inactive text', { text: 'hello world' }, {
            active: false,
            queryLength: 0,
            autocompleteVisible: false,
            executing: false,
            paused: false,
            aborted: false,
            errorLabel: null,
        }],
        ['trigger only', { text: '/', autocompleteVisible: true }, {
            active: true,
            queryLength: 0,
            autocompleteVisible: true,
            executing: false,
            paused: false,
            aborted: false,
            errorLabel: null,
        }],
        ['command query', { text: '/help me', autocompleteVisible: true }, {
            active: true,
            queryLength: 4,
            autocompleteVisible: true,
            executing: false,
            paused: false,
            aborted: false,
            errorLabel: null,
        }],
        ['paused execution', { text: '/echo hello', isExecuting: true, isPaused: true }, {
            active: true,
            queryLength: 4,
            autocompleteVisible: false,
            executing: true,
            paused: true,
            aborted: false,
            errorLabel: null,
        }],
        ['aborted execution', { text: '/delay 2', isAborted: true }, {
            active: true,
            queryLength: 5,
            autocompleteVisible: false,
            executing: false,
            paused: false,
            aborted: true,
            errorLabel: null,
        }],
    ])('classifies %s slash-command state without exposing command text', async (_name, input, expected) => {
        const { getMainChatSlashCommandState } = await importFreshSlashStateModule();

        expect(getMainChatSlashCommandState(input)).toEqual(expected);
    });

    test('normalizes unsafe metadata and never returns command text', async () => {
        const { getMainChatSlashCommandState } = await importFreshSlashStateModule();

        const slashCommandState = getMainChatSlashCommandState({
            text: '/secret value',
            queryLength: -3,
            autocompleteVisible: 'yes',
            isExecuting: 1,
            isPaused: 'true',
            isAborted: 0,
            hasError: true,
            errorLabel: '  command failed  ',
        });

        expect(slashCommandState).toEqual({
            active: true,
            queryLength: 6,
            autocompleteVisible: true,
            executing: true,
            paused: true,
            aborted: false,
            errorLabel: 'command failed',
        });
        expect(slashCommandState).not.toHaveProperty('text');
    });
});
