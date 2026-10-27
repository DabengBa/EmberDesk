import { expect, jest, test } from '@jest/globals';

let release;
const state = { isChatSaving: true, DEFAULT_SAVE_EDIT_TIMEOUT: 1000, chat: [], chat_metadata: {}, characters: [{ chat: 'chat', name: 'character', avatar: 'a' }], this_chid: 0 };
const shell = { state, waitUntilCondition: () => new Promise(resolve => { release = resolve; }), cancelDebouncedChatSave: jest.fn(), saveTokenCache: jest.fn(), compressRequest: async request => request };
jest.unstable_mockModule('../public/scripts/events.js', () => ({ eventSource: {}, event_types: {} }));
jest.unstable_mockModule('../public/scripts/constants.js', () => ({ CHAT_TRUNCATION: {}, debounce_timeout: {} }));
jest.unstable_mockModule('../public/scripts/request-context.js', () => ({ getRequestHeaders: () => ({}) }));
jest.unstable_mockModule('../public/scripts/character-lifecycle-service.js', () => ({ createOrEditCharacter: jest.fn() }));
jest.unstable_mockModule('../public/scripts/message-service.js', () => ({ ensureMessageMediaIsArray: jest.fn(), scrollChatToBottom: jest.fn(), updateMessageElement: jest.fn() }));
jest.unstable_mockModule('../public/scripts/delete-character-preflight.js', () => ({ runDeleteCharacterClosePreflight: jest.fn() }));
jest.unstable_mockModule('../public/scripts/chat-ops-shell-context.js', () => ({ requireChatOpsShellContext: () => shell }));
jest.unstable_mockModule('../public/scripts/main-chat-greetings.js', () => ({ buildGreetingOptions: jest.fn(), canSwitchGreeting: jest.fn(), replaceGreeting: jest.fn() }));
const { saveChatConditional } = await import('../public/scripts/chat-ops-service.js');

test('checks session guard after waiting and before save reads the live chat', async () => {
    globalThis.fetch = jest.fn();
    const original = state.chat;
    const task = saveChatConditional(() => state.chat === original);
    state.chat = [];
    state.isChatSaving = false;
    release();
    expect(await task).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(shell.cancelDebouncedChatSave).not.toHaveBeenCalled();
});

test('saves normally when the guarded session remains current', async () => {
    globalThis.fetch = jest.fn(async () => ({ ok: true }));
    const original = state.chat;
    const task = saveChatConditional(() => state.chat === original);
    release();
    expect(await task).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
});
