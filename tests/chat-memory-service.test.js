import { beforeEach, expect, jest, test } from '@jest/globals';

let state;
let save;
let handlers;
let refresh;
jest.unstable_mockModule('../public/scripts/events.js', () => ({ eventSource: { on: (event, handler) => { handlers[event] = handler; } }, event_types: { CHAT_CHANGED: 'changed', CHAT_LOADED: 'loaded', GENERATION_STARTED: 'start', GENERATION_ENDED: 'end', GENERATION_STOPPED: 'stop', MESSAGE_DELETED: 'deleted', MESSAGE_EDITED: 'edited', MESSAGE_UPDATED: 'updated' } }));
jest.unstable_mockModule('../public/scripts/request-context.js', () => ({ getRequestHeaders: () => ({}) }));
jest.unstable_mockModule('../public/scripts/generation-shell-context.js', () => ({ requireGenerationShellContext: () => ({ state, saveChatConditional: save, scheduleMainChatMessageListPanelRefresh: refresh, extractMessageFromData: data => data.text }) }));
jest.unstable_mockModule('../public/scripts/openai.js', () => ({ buildChatCompletionRequest: async ({ messages }) => ({ generate_data: { messages } }), getChatCompletionModel: () => 'model' }));
jest.unstable_mockModule('../public/scripts/chat-generation-auto-recovery.js', () => ({ getFallbackOpenAIModel: () => null }));
jest.unstable_mockModule('../public/scripts/utils.js', () => ({ uuidv4: () => 'new-id' }));
jest.unstable_mockModule('../public/scripts/constants.js', () => ({ IGNORE_SYMBOL: 'ignore' }));
jest.unstable_mockModule('../public/scripts/i18n.js', () => ({ translate: value => value }));
const service = await import('../public/scripts/chat-memory-service.js');
const core = await import('../public/scripts/chat-memory-core.js');

beforeEach(() => {
    handlers = {};
    save = jest.fn(async () => true);
    refresh = jest.fn();
    state = { chat: [{ is_user: true, mes: 'secret source', extra: { id: 'u' } }, { mes: 'reply', extra: { id: 'a' } }, { is_user: true, mes: 'next', extra: { id: 'v' } }, { mes: 'reply', extra: { id: 'b' } }], chat_metadata: {}, characters: [{ chat: 'chat', avatar: 'avatar' }], this_chid: 0, main_api: 'openai', oai_settings: { chat_memory_enabled: true, chat_memory_keep_turns: 1 } };
    service.initChatMemory();
    handlers.changed();
});

test('view, local settings, subscriptions and persistence failures', async () => {
    const listener = jest.fn();
    const unsubscribe = service.subscribeChatMemory(listener);
    expect(service.getChatMemoryView()).toMatchObject({ settings: { enabled: true }, globalSettings: { enabled: true }, turns: [{ key: 'u', eligible: true }, { key: 'v', eligible: false }] });
    expect(await service.updateChatMemorySettings({ enabled: false, keepTurns: 2 })).toEqual({ ok: true });
    expect(state.chat_metadata.chat_memory).toMatchObject({ disabled: true, keepTurns: 2 });
    expect(listener).toHaveBeenCalled();
    expect(await service.updateChatMemorySettings({ enabled: null })).toEqual({ ok: true });
    expect(state.chat_metadata.chat_memory).not.toHaveProperty('disabled');
    save.mockResolvedValue(false);
    expect(await service.setChatMemoryPinned('u', true)).toEqual({ ok: false, error: expect.any(String) });
    unsubscribe();
});

test('single turn regeneration discards a response after source or session changes', async () => {
    let resolve;
    globalThis.fetch = jest.fn(() => new Promise(done => { resolve = done; }));
    const operation = service.regenerateChatMemoryTurn('u');
    await new Promise(done => setTimeout(done, 0));
    state.chat[0].mes = 'edited';
    resolve({ ok: true, json: async () => ({ text: 'summary' }) });
    expect((await operation).ok).toBe(false);
    expect(service.getChatMemoryView().summaries.some(item => item.text === 'summary')).toBe(false);
    expect(JSON.stringify(state.chat_metadata)).not.toContain('secret source');
});

test('view exposes explicit overrides and projects safe history fields', async () => {
    state.chat_metadata.chat_memory = { disabled: false, keepTurns: 2, history: [{ at: 1, action: 'pin', turnKey: 'u', status: 'success', error: 'secret source', sourceText: 'secret source' }] };
    expect(service.getChatMemoryView().overrides).toEqual({ enabled: true, keepTurns: 2 });
    expect(JSON.stringify(service.getChatMemoryView().history)).not.toContain('secret source');
    await service.updateChatMemorySettings({ enabled: null });
    expect(service.getChatMemoryView().overrides).toEqual({ keepTurns: 2 });
    expect(save.mock.calls.length).toBe(1);
    expect(state.chat_metadata.chat_memory.history.at(-1)).toMatchObject({ action: 'settings', status: 'success' });
});

test('manual work waits for foreground and shares the automatic queue', async () => {
    const pending = [];
    globalThis.fetch = jest.fn(() => new Promise(resolve => pending.push(resolve)));
    state.is_send_press = true;
    state.oai_settings.chat_memory_keep_turns = 1;
    state.chat.push({ is_user: true, mes: 'third', extra: { id: 'w' } }, { mes: 'reply', extra: { id: 'c' } });
    service.scheduleMemoryMaintenance();
    const action = service.regenerateChatMemoryTurn('v');
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(fetch).toHaveBeenCalledTimes(0);
    state.is_send_press = false;
    handlers.end();
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(fetch).toHaveBeenCalledTimes(1);
    pending.shift()({ ok: true, json: async () => ({ text: 'first' }) });
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(fetch).toHaveBeenCalledTimes(2);
    pending.shift()({ ok: true, json: async () => ({ text: 'second' }) });
    expect(await action).toEqual({ ok: true });
});

test('same-name reopen discards asynchronous failure without changing new session', async () => {
    let reject;
    globalThis.fetch = jest.fn(() => new Promise((_, fail) => { reject = fail; }));
    const action = service.regenerateChatMemoryTurn('u');
    await new Promise(resolve => setTimeout(resolve, 0));
    handlers.changed();
    state.chat = structuredClone(state.chat);
    state.chat_metadata = {};
    reject(new Error('secret source'));
    expect((await action).ok).toBe(false);
    expect(state.chat_metadata).toEqual({});
});
test('save receives bounded safe history and failure never leaves a success record', async () => {
    let persisted;
    save.mockImplementation(async () => { persisted = structuredClone(state.chat_metadata); return true; });
    globalThis.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ text: 'summary' }) }));
    expect(await service.regenerateChatMemoryTurn('u')).toEqual({ ok: true });
    expect(persisted.chat_memory.history.at(-1)).toMatchObject({ action: 'regenerate', turnKey: 'u', status: 'success' });
    save.mockResolvedValue(false);
    expect((await service.updateChatMemorySettings({ keepTurns: 3 })).ok).toBe(false);
    const history = service.getChatMemoryView().history;
    expect(history.at(-1)).toMatchObject({ action: 'regenerate', status: 'success' });
    expect(history.some(item => item.action === 'settings' && item.status === 'success')).toBe(false);
});

test('manual actions require enabled, eligible turns and retry requires failed status', async () => {
    globalThis.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ text: 'summary' }) }));
    expect((await service.regenerateChatMemoryTurn('v')).ok).toBe(false);
    expect((await service.retryChatMemoryTurn('u')).ok).toBe(false);
    state.chat[0].extra.pinned = true;
    expect((await service.regenerateChatMemoryTurn('u')).ok).toBe(false);
    state.chat[0].extra.pinned = false;
    state.chat_metadata.chat_memory = { disabled: true };
    expect((await service.regenerateChatMemoryTurn('u')).ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
});

test('eligibility is checked again after the request', async () => {
    let resolve;
    globalThis.fetch = jest.fn(() => new Promise(done => { resolve = done; }));
    const task = service.regenerateChatMemoryTurn('u');
    await new Promise(done => setTimeout(done, 0));
    state.chat[0].extra.pinned = true;
    resolve({ ok: true, json: async () => ({ text: 'summary' }) });
    expect((await task).ok).toBe(false);
    expect(save).not.toHaveBeenCalled();
});

test('retry accepts a failed eligible turn', async () => {
    const turn = core.partitionChatTurns(state.chat).turns[0];
    const hash = core.computeTurnHash(state.chat, turn);
    state.chat_metadata.chat_memory = { summaries: [{ turnKey: 'u', messageIds: turn.messageIds, contentHash: hash, lastAttemptHash: hash, status: 'failed', text: '', retries: 3 }] };
    globalThis.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ text: 'summary' }) }));
    expect(await service.retryChatMemoryTurn('u')).toEqual({ ok: true });
    expect(service.getChatMemoryView().summaries[0]).toMatchObject({ status: 'active', text: 'summary' });
});

test('pending settings save wins over an in-flight summary even when summary response arrives first', async () => {
    let resolveFetch, resolveSave;
    globalThis.fetch = jest.fn(() => new Promise(done => { resolveFetch = done; }));
    save.mockImplementation(() => new Promise(done => { resolveSave = done; }));
    const summary = service.regenerateChatMemoryTurn('u');
    await new Promise(done => setTimeout(done, 0));
    const setting = service.updateChatMemorySettings({ enabled: false });
    await new Promise(done => setTimeout(done, 0));
    resolveFetch({ ok: true, json: async () => ({ text: 'summary' }) });
    resolveSave(true);
    expect(await setting).toEqual({ ok: true });
    expect((await summary).ok).toBe(false);
    expect(service.getChatMemoryView().summaries).toEqual([]);
});
test('failed save restores settings, pins and summary without fake failure history', async () => {
    globalThis.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ text: 'summary' }) }));
    save.mockResolvedValue(false);
    expect((await service.updateChatMemorySettings({ keepTurns: 3 })).ok).toBe(false);
    expect(service.getChatMemoryView().overrides).toEqual({});
    expect((await service.setChatMemoryPinned('u', true)).ok).toBe(false);
    expect(state.chat[0].extra.pinned).toBeUndefined();
    expect((await service.regenerateChatMemoryTurn('u')).ok).toBe(false);
    expect(service.getChatMemoryView().summaries).toEqual([]);
    expect(service.getChatMemoryView().history).toEqual([]);
});

test('pinning during a summary prevents its result from being saved', async () => {
    let resolve;
    globalThis.fetch = jest.fn(() => new Promise(done => { resolve = done; }));
    const action = service.regenerateChatMemoryTurn('u');
    await new Promise(done => setTimeout(done, 0));
    expect(await service.setChatMemoryPinned('u', true)).toEqual({ ok: true });
    resolve({ ok: true, json: async () => ({ text: 'summary' }) });
    expect((await action).ok).toBe(false);
    expect(service.getChatMemoryView().summaries).toEqual([]);
    expect(save).toHaveBeenCalledTimes(1);
});

test('memory saves provide a session guard and refresh on successful changes', async () => {
    save.mockImplementation(async guard => {
        expect(typeof guard).toBe('function');
        expect(guard()).toBe(true);
        return true;
    });
    expect(await service.updateChatMemorySettings({ keepTurns: 2 })).toEqual({ ok: true });
    expect(refresh).toHaveBeenCalled();
    refresh.mockClear();
    expect(await service.setChatMemoryPinned('u', true)).toEqual({ ok: true });
    expect(refresh).toHaveBeenCalled();
});

test('automatic jobs queued before disabling memory do not send source text', async () => {
    globalThis.fetch = jest.fn();
    state.is_send_press = true;
    service.scheduleMemoryMaintenance();
    await service.updateChatMemorySettings({ enabled: false });
    state.is_send_press = false;
    handlers.end();
    await new Promise(done => setTimeout(done, 10));
    expect(fetch).not.toHaveBeenCalled();
});

test('automatic jobs skip turns pinned while queued', async () => {
    globalThis.fetch = jest.fn();
    state.is_send_press = true;
    service.scheduleMemoryMaintenance();
    state.chat[0].extra.pinned = true;
    state.is_send_press = false;
    handlers.end();
    await new Promise(done => setTimeout(done, 10));
    expect(fetch).not.toHaveBeenCalled();
});

test('maintenance save guard rejects same-name session reopen', () => {
    state.is_send_press = false;
    globalThis.fetch = jest.fn(() => new Promise(() => {}));
    service.scheduleMemoryMaintenance();
    const guard = save.mock.calls[0][0];
    expect(guard()).toBe(true);
    handlers.changed();
    expect(guard()).toBe(false);
});
test('same-name reopen discards asynchronous success', async () => {
    let resolve;
    globalThis.fetch = jest.fn(() => new Promise(done => { resolve = done; }));
    const action = service.regenerateChatMemoryTurn('u');
    await new Promise(done => setTimeout(done, 0));
    handlers.changed();
    state.chat = structuredClone(state.chat);
    state.chat_metadata = {};
    resolve({ ok: true, json: async () => ({ text: 'old summary' }) });
    expect((await action).ok).toBe(false);
    expect(state.chat_metadata).toEqual({});
    expect(save).not.toHaveBeenCalled();
});
