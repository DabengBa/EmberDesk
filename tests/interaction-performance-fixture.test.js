import { describe, expect, test } from '@jest/globals';
import { createCharacterCard, createChatMessages, createStreamMarker } from '../scripts/interaction-performance-fixture.mjs';

describe('interaction benchmark fixture', () => {
    test('selects an existing safe chat and supplies stable message identities', () => {
        const card = createCharacterCard(4);
        const chat = createChatMessages(4, 0, 500);
        expect(card.chat).toBe('Session 1');
        expect(chat[0].chat_metadata.chat_memory.disabled).toBe(true);
        const ids = chat.slice(1).map(message => message.extra.id);
        expect(ids.every(id => typeof id === 'string' && id.length > 0)).toBe(true);
        expect(new Set(ids).size).toBe(500);
        expect(createChatMessages(4, 0, 500)).toEqual(chat);
        expect(createChatMessages(4, 1, 1)[1].extra.id).not.toBe(ids[0]);
    });

    test('stream repetitions use distinct markers so earlier output cannot satisfy the next measurement', () => {
        const markers = [1, 2, 3, 4].map(createStreamMarker);
        expect(new Set(markers).size).toBe(markers.length);
        for (let index = 1; index < markers.length; index++) {
            expect(`${markers[index - 1]}final.`).not.toContain(markers[index]);
        }
    });
});
