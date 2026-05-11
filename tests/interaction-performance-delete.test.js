import { describe, expect, test } from '@jest/globals';

import { runDeleteCharacterClosePreflight } from '../public/scripts/delete-character-preflight.js';

describe('runDeleteCharacterClosePreflight', () => {
    test('returns false and skips cleanup when generation is still active', async () => {
        const calls = [];

        const result = await runDeleteCharacterClosePreflight({
            isGenerationInProgress: () => true,
            onGenerationBlocked: () => calls.push('blocked'),
            waitForPendingChatSave: async () => calls.push('wait'),
            clearCurrentChat: async () => calls.push('clear'),
            resetSelectedGroup: () => calls.push('reset-group'),
            resetSelectionState: () => calls.push('reset-selection'),
        });

        expect(result).toBe(false);
        expect(calls).toEqual(['blocked']);
    });

    test('waits for pending save, clears chat state, and emits lightweight close callbacks', async () => {
        const calls = [];

        const result = await runDeleteCharacterClosePreflight({
            isGenerationInProgress: () => false,
            waitForPendingChatSave: async () => calls.push('wait'),
            clearCurrentChat: async () => calls.push('clear'),
            resetSelectedGroup: () => calls.push('reset-group'),
            resetSelectionState: () => calls.push('reset-selection'),
            selectCharactersView: () => calls.push('select-characters-view'),
            suppressWelcomeScreen: () => calls.push('suppress-welcome-screen'),
            emitChatChanged: async () => calls.push('emit-chat-changed'),
        });

        expect(result).toBe(true);
        expect(calls).toEqual([
            'wait',
            'clear',
            'reset-group',
            'reset-selection',
            'select-characters-view',
            'suppress-welcome-screen',
            'emit-chat-changed',
        ]);
    });

    test('propagates save wait failures without running cleanup', async () => {
        const calls = [];

        await expect(runDeleteCharacterClosePreflight({
            isGenerationInProgress: () => false,
            waitForPendingChatSave: async () => {
                calls.push('wait');
                throw new Error('save-timeout');
            },
            clearCurrentChat: async () => calls.push('clear'),
            resetSelectedGroup: () => calls.push('reset-group'),
            resetSelectionState: () => calls.push('reset-selection'),
        })).rejects.toThrow('save-timeout');

        expect(calls).toEqual(['wait']);
    });
});
