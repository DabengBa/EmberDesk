import { describe, expect, test } from '@jest/globals';

import { applyResetChatState } from '../public/scripts/chat-state-reset.js';

describe('applyResetChatState', () => {
    test('preserves the in-memory character list when requested for delete UI refresh', () => {
        const chat = [{ mes: 'old' }];
        const safetyChat = [{ mes: 'safe' }];
        const characters = [{ avatar: 'alpha.png' }, { avatar: 'beta.png' }];
        const calls = [];

        const nextCharacterName = applyResetChatState({
            currentCharacterId: '1',
            neutralCharacterName: 'Neutral',
            systemUserName: 'System',
            chat,
            safetyChat,
            characters,
            setCharacterId: value => calls.push(value),
            clearCharacters: false,
        });

        expect(nextCharacterName).toBe('System');
        expect(calls).toEqual([undefined]);
        expect(chat).toEqual(safetyChat);
        expect(characters).toEqual([{ avatar: 'alpha.png' }, { avatar: 'beta.png' }]);
    });

    test('clears the in-memory character list for full chat resets', () => {
        const chat = [{ mes: 'old' }];
        const safetyChat = [{ mes: 'safe' }];
        const characters = [{ avatar: 'alpha.png' }, { avatar: 'beta.png' }];

        const nextCharacterName = applyResetChatState({
            currentCharacterId: undefined,
            neutralCharacterName: 'Neutral',
            systemUserName: 'System',
            chat,
            safetyChat,
            characters,
            setCharacterId: () => {},
        });

        expect(nextCharacterName).toBe('Neutral');
        expect(chat).toEqual(safetyChat);
        expect(characters).toEqual([]);
    });
});
