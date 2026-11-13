import { expect, jest, test } from '@jest/globals';

let release;
const state = { isChatSaving: true, DEFAULT_SAVE_EDIT_TIMEOUT: 1000, chat: [], chat_metadata: {}, characters: [{ chat: 'chat', name: 'character', avatar: 'a' }], this_chid: 0 };
const shell = { state, waitUntilCondition: () => new Promise(resolve => { release = resolve; }), cancelDebouncedChatSave: jest.fn(), saveTokenCache: jest.fn(), compressRequest: async request => request, unshallowCharacter: async () => {}, uuidv4: () => 'integrity', queueMainChatMessageListScrollRestore: () => {}, getChatResult: async () => {}, delay: () => new Promise(() => {}) };
jest.unstable_mockModule('../public/scripts/events.js', () => ({ eventSource: { emit: jest.fn() }, event_types: {} }));
jest.unstable_mockModule('../public/scripts/constants.js', () => ({ CHAT_TRUNCATION: {}, debounce_timeout: {} }));
jest.unstable_mockModule('../public/scripts/request-context.js', () => ({ getRequestHeaders: () => ({}) }));
jest.unstable_mockModule('../public/scripts/character-lifecycle-service.js', () => ({ createOrEditCharacter: jest.fn() }));
jest.unstable_mockModule('../public/scripts/message-service.js', () => ({ ensureMessageMediaIsArray: jest.fn(), scrollChatToBottom: jest.fn(), updateMessageElement: jest.fn() }));
jest.unstable_mockModule('../public/scripts/delete-character-preflight.js', () => ({ runDeleteCharacterClosePreflight: jest.fn() }));
jest.unstable_mockModule('../public/scripts/chat-ops-shell-context.js', () => ({ requireChatOpsShellContext: () => shell }));
jest.unstable_mockModule('../public/scripts/main-chat-greetings.js', () => ({ buildGreetingOptions: jest.fn(), canSwitchGreeting: jest.fn(), replaceGreeting: jest.fn() }));
jest.unstable_mockModule('../public/scripts/main-chat-composer-service.js', () => ({ getComposerSnapshot: () => ({}), requestComposerFocus: jest.fn(), subscribeComposerState: () => () => {} }));
const { getChat, saveChatConditional, saveChatDebounced } = await import('../public/scripts/chat-ops-service.js');

test('checks session guard after waiting and before save reads the live chat', async () => {
    globalThis.fetch = jest.fn();
    shell.cancelDebouncedChatSave.mockClear();
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
    globalThis.fetch = jest.fn(async url => url.endsWith('/get')
        ? { ok: true, headers: new Headers({ 'X-Chat-Version': 'a'.repeat(32) }), json: async () => [{ chat_metadata: {} }] }
        : { ok: true, json: async () => ({ version: 'b'.repeat(32) }) });
    expect(await getChat()).toBe(true);
    fetch.mockClear();
    const original = state.chat;
    const task = saveChatConditional(() => state.chat === original);
    release();
    expect(await task).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
});

test.each(['before timeout', 'while waiting for save lock'])('a regenerate-style debounced save cannot save another chat for the same character %s', async phase => {
    jest.useFakeTimers();
    try {
        state.this_chid = 0;
        state.characters[0].chat = 'original';
        state.chat = [{ mes: 'original after tail removal' }];
        state.isChatSaving = true;
        globalThis.fetch = jest.fn(async () => ({ ok: true }));
        const chat = state.chat;
        const chatId = state.characters[0].chat;
        saveChatDebounced(() => state.this_chid === 0 && state.chat === chat && state.characters[0].chat === chatId);
        if (phase === 'while waiting for save lock') await jest.advanceTimersByTimeAsync(1000);
        state.characters[0].chat = 'different';
        state.chat = [{ mes: 'different chat' }];
        if (phase === 'before timeout') await jest.advanceTimersByTimeAsync(1000);
        if (release) release();
        await Promise.resolve();
        await Promise.resolve();
        expect(fetch).not.toHaveBeenCalled();
    } finally {
        jest.useRealTimers();
    }
});
