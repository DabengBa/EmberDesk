import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/scripts/chat-ops-service.js', import.meta.url), 'utf8');
const code = source.slice(source.indexOf('export async function printMessages()'), source.indexOf('/**\n * Visually removes all chat message elements.')).replace('export ', '');

test.each([true, false])('legacy long chat adds the load-earlier control using native DOM (wrapped=%s)', async wrapped => {
    const button = {};
    const root = { append: jest.fn() };
    const state = { chat: [1, 2, 3], mainChatMessageUiState: new Map([[1, {}]]), chatElement: wrapped ? { jquery: 'legacy', 0: root } : root, mainChatMessageRenderGeneration: 0 };
    const env = {
        state, isReactMainChatOwner: () => false, CHAT_TRUNCATION: 2,
        document: { createElement: tag => { expect(tag).toBe('div'); return button; } },
        redisplayChat: jest.fn(async () => {}), consumeMainChatMessageListScrollRestore: () => true,
    };
    const print = new Function(...Object.keys(env), `${code}; return printMessages;`)(...Object.values(env));
    await print();
    expect(button).toEqual({ id: 'show_more_messages', textContent: 'Show more messages' });
    expect(root.append).toHaveBeenCalledWith(button);
    expect(env.redisplayChat).toHaveBeenCalledWith({ startIndex: 1, fade: false });
    expect(state.mainChatMessageUiState.size).toBe(0);
    expect(state.mainChatMessageRenderGeneration).toBe(1);
});
