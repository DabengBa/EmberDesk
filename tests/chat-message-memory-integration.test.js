import { afterAll, beforeAll, expect, jest, test } from '@jest/globals';

let state;
let saveMemory;
let refreshMemory;

// Keep the command, event bus, memory service and reconciliation real; isolate
// the shell and generation/network dependencies not involved in this handoff.
jest.unstable_mockModule('../public/scripts/request-context.js', () => ({ getRequestHeaders: () => ({}) }));
jest.unstable_mockModule('../public/scripts/generation-shell-context.js', () => ({ requireGenerationShellContext: () => ({ state, saveChatConditional: saveMemory, scheduleMainChatMessageListPanelRefresh: refreshMemory }) }));
jest.unstable_mockModule('../public/scripts/openai.js', () => ({ buildChatCompletionRequest: jest.fn(), getChatCompletionModel: () => 'model' }));
jest.unstable_mockModule('../public/scripts/chat-generation-auto-recovery.js', () => ({ getFallbackOpenAIModel: () => null }));
jest.unstable_mockModule('../public/scripts/utils.js', () => ({ uuidv4: () => 'new-id' }));
jest.unstable_mockModule('../public/scripts/constants.js', () => ({ IGNORE_SYMBOL: 'ignore' }));
jest.unstable_mockModule('../public/scripts/i18n.js', () => ({ translate: value => value }));

const { eventSource, event_types } = await import('../public/scripts/events.js');
const { initChatMemory } = await import('../public/scripts/chat-memory-service.js');
const { partitionChatTurns, computeTurnHash } = await import('../public/scripts/chat-memory-core.js');
const { createChatMessageCommands } = await import('../public/scripts/chat-message-commands.js');

let previousLocalStorage;
let debug;
beforeAll(() => {
    previousLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null } });
    debug = jest.spyOn(console, 'debug').mockImplementation(() => {});
    initChatMemory();
});
afterAll(() => {
    eventSource.events = {};
    debug.mockRestore();
    if (previousLocalStorage) Object.defineProperty(globalThis, 'localStorage', previousLocalStorage);
    else delete globalThis.localStorage;
});

function fixture(emit) {
    const chat = [
        { name: 'keep', is_user: true, mes: 'old turn', extra: { id: 'u' } },
        { name: 'keep', mes: 'old reply', extra: { id: 'a' } },
        { name: 'remove', is_user: true, mes: 'recent turn', extra: { id: 'v' } },
        { name: 'remove', mes: 'recent reply', extra: { id: 'b' } },
    ];
    const turn = partitionChatTurns(chat).turns[0];
    const hash = computeTurnHash(chat, turn);
    state = {
        chat, chat_metadata: { chat_memory: { summaries: [{ id: 'summary', turnKey: 'u', turnIndex: 0, firstIndex: 0, messageIds: turn.messageIds, contentHash: hash, text: 'old summary', status: 'active', stale: false }] } },
        characters: [{ chat: 'chat', avatar: 'avatar' }], this_chid: 0, main_api: 'openai',
        oai_settings: { chat_memory_enabled: true, chat_memory_keep_turns: 1 },
    };
    const snapshots = [];
    saveMemory = jest.fn(async guard => {
        expect(guard()).toBe(true);
        snapshots.push({ source: 'memory', chat: structuredClone(state.chat), metadata: structuredClone(state.chat_metadata) });
        return true;
    });
    refreshMemory = jest.fn();
    const commands = createChatMessageCommands({
        getChat: () => state.chat, getChatId: () => 'chat', isBlocked: () => false,
        getUiStates: () => new Map(), getEditingId: () => undefined,
        resetWindow: jest.fn(), refresh: jest.fn(), emit,
        save: async () => { snapshots.push({ source: 'command', chat: structuredClone(state.chat), metadata: structuredClone(state.chat_metadata) }); },
    });
    return { commands, snapshots };
}

test('matching-name deletion hands off to the real memory subscriber and persists the expanded summary', async () => {
    // Negative control: deleting identical messages without the notification
    // leaves the stored projection stale, despite the save having completed.
    const silent = fixture(async () => {});
    expect(await silent.commands.deleteMatching(message => message.name === 'remove')).toBe(2);
    expect(state.chat_metadata.chat_memory.summaries[0].status).toBe('active');
    expect(saveMemory).not.toHaveBeenCalled();

    const observed = [];
    const listener = count => observed.push(count);
    eventSource.on(event_types.MESSAGE_DELETED, listener);
    try {
        const live = fixture((event, id) => eventSource.emit(event_types[event], id));
        expect(await live.commands.deleteMatching(message => message.name === 'remove')).toBe(2);
        expect(state.chat.map(message => message.extra.id)).toEqual(['u', 'a']);
        expect(observed).toEqual([2]);
        expect(state.chat_metadata.chat_memory.summaries[0]).toMatchObject({ turnKey: 'u', status: 'expanded', stale: false });
        expect(live.snapshots.map(snapshot => snapshot.source)).toEqual(['command', 'memory']);
        expect(live.snapshots[0].metadata.chat_memory.summaries[0].status).toBe('active');
        expect(live.snapshots[1].metadata.chat_memory.summaries[0].status).toBe('expanded');
        expect(refreshMemory).toHaveBeenCalled();
    } finally {
        eventSource.removeListener(event_types.MESSAGE_DELETED, listener);
    }
});
