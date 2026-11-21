import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

test('clearing a React-owned chat removes only zoomed character avatars without jQuery', async () => {
    const source = readFileSync(new URL('../public/scripts/chat-ops-service.js', import.meta.url), 'utf8');
    const start = source.indexOf('export async function clearChat(');
    const end = source.indexOf('export async function renamePastChats(', start);
    const clearSource = source.slice(start, end).replace('export ', '');
    const avatars = [{ remove: jest.fn() }, { remove: jest.fn() }];
    const document = { querySelectorAll: jest.fn(() => avatars) };
    const state = { extension_prompts: { a: 1 }, chat: [1], is_delete_mode: false };
    const mount = jest.fn();
    const names = ['document', 'state', 'beginChatTransition', 'checkpointChatTransition', 'cancelDebouncedChatSave', 'cancelDebouncedMetadataSave', 'closeMessageEditor', 'persistMainChatMessageListScrollSnapshotBeforeClear', 'isReactMainChatOwner', 'mountReactMainChatMessageListPanel', '$'];
    const noop = () => {};
    const values = [document, state, noop, async () => {}, noop, noop, noop, noop, () => true, mount, () => { throw Error('clear chat must not use jQuery for avatar cleanup'); }];
    const clear = new Function(...names, `let chatSessionVersion = 0; let chatClearInProgress = true; ${clearSource}; return clearChat;`)(...values);
    await clear({ clearData: true });
    expect(document.querySelectorAll).toHaveBeenCalledWith('.zoomed_avatar[forChar]');
    expect(avatars.every(avatar => avatar.remove.mock.calls.length === 1)).toBe(true);
    expect(state.chat).toEqual([]);
    expect(state.reactMainChatProjectionCleared).toBe(true);
    expect(mount).toHaveBeenCalledTimes(1);
});

test.each(['native root', 'existing collection'])('clear updates the React projection without mutating rows from %s', async (kind) => {
    const source = readFileSync(new URL('../public/scripts/chat-ops-service.js', import.meta.url), 'utf8');
    const start = source.indexOf('export async function clearChat(');
    const end = source.indexOf('export async function renamePastChats(', start);
    const clearSource = source.slice(start, end).replace('export ', '');
    const message = { remove: jest.fn() };
    const loadMore = { remove: jest.fn() };
    const root = { children: [message, loadMore] };
    const state = { extension_prompts: {}, chat: [1], is_delete_mode: false,
        chatElement: kind === 'native root' ? root : Object.assign([root], { jquery: '3.5.1' }) };
    const document = { querySelectorAll: jest.fn(() => []) };
    const mount = jest.fn();
    const names = ['document', 'state', 'beginChatTransition', 'checkpointChatTransition', 'cancelDebouncedChatSave', 'cancelDebouncedMetadataSave', 'closeMessageEditor', 'persistMainChatMessageListScrollSnapshotBeforeClear', 'isReactMainChatOwner', 'mountReactMainChatMessageListPanel'];
    const noop = () => {};
    const values = [document, state, noop, async () => {}, noop, noop, noop, noop, () => false, mount];
    const clear = new Function(...names, `let chatSessionVersion = 0; let chatClearInProgress = true; ${clearSource}; return clearChat;`)(...values);
    await clear({ clearData: true });
    expect(message.remove).not.toHaveBeenCalled();
    expect(loadMore.remove).not.toHaveBeenCalled();
    expect(state.chat).toEqual([]);
    expect(state.reactMainChatProjectionCleared).toBe(true);
    expect(mount).toHaveBeenCalledTimes(1);
});
