import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/scripts/chat-ops-service.js', import.meta.url), 'utf8');
const code = source.slice(source.indexOf('export async function loadEarlierChatMessages('), source.indexOf('export async function printMessages()')).replace('export ', '');

test.each([[['4', '5'], 2, 2], [['1'], 5, 0], [[], null, 1]])('load earlier expands the React window and emits the event', async (ids, count, expected) => {
    const state = { chat: [0, 1, 2, 3], mainChatVisibleStartIndices: new Map(), reactMainChatProjectionCleared: false };
    const eventSource = { emit: jest.fn(async () => {}) };
    const mount = jest.fn();
    const env = { state, getMainChatReactVisibleWindow: jest.fn(() => ({ visibleMessageIds: ids })), getCurrentChatId: () => 'chat', CHAT_TRUNCATION: 3, eventSource, event_types: { MORE_MESSAGES_LOADED: 'more' }, mountReactMainChatMessageListPanel: mount };
    const load = new Function(...Object.keys(env), code + '; return loadEarlierChatMessages;')(...Object.values(env));
    await load(count);
    expect(state.mainChatVisibleStartIndices.get('chat')).toBe(expected);
    expect(eventSource.emit).toHaveBeenCalledWith('more');
    expect(mount).toHaveBeenCalledTimes(1);
});
