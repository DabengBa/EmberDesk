import { describe, expect, jest, test } from '@jest/globals';

import { loadTsModule } from './helpers/load-ts-module.mjs';
import { createGenerationCallerService } from '../public/scripts/generation-caller-service.js';

async function importFreshCore() {
    return import(`../public/scripts/chat-regenerate.js?cacheBust=${Date.now()}-${Math.random()}`);
}

const userMessage = (mes = 'hi') => ({ is_user: true, is_system: false, mes, extra: {} });
const assistantMessage = (mes = 'reply') => ({ is_user: false, is_system: false, mes, extra: { api: 'openai' } });
const toolCard = () => ({ is_user: false, is_system: true, mes: 'card', extra: { tool_invocations: [{ name: 'analyze' }] } });
const narrator = () => ({ is_user: false, is_system: false, mes: 'note', extra: { api: 'narrator', type: 'narrator' } });
const manualAssistant = () => ({ is_user: false, is_system: false, mes: 'manual', extra: { api: 'manual' } });
const systemNote = () => ({ is_user: false, is_system: true, mes: 'notice', extra: {} });
const recoveryRow = () => ({ is_user: false, is_system: false, mes: '', extra: { api: 'openai' } });

async function restoreFixture() {
    const { collectRegenerateTurn } = await importFreshCore();
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const env = {
        chat: [userMessage(), assistantMessage('original')], chatId: 'same-chat', revision: 1,
        chat_metadata: {}, pendingRegenerateRestore: null, this_edit_mes_id: undefined, abortController: new AbortController(),
        system_message_types: { NARRATOR: 'narrator' }, collectRegenerateTurn,
        getCurrentChatId: () => env.chatId,
        getCurrentGenerationContextIdentity: () => ({ chatId: env.chatId, chatReference: env.chat, contextRevision: env.revision }),
        isReactMainChatOwner: () => false, mainChatVisibleStartIndices: new Map(),
        saveChatDebounced: jest.fn(), eventSource: { emit: jest.fn(async () => {}) },
        event_types: { MESSAGE_DELETED: 'deleted' }, redisplayChat: jest.fn(async () => {}),
        saveChatConditional: jest.fn(async predicate => predicate ? predicate() : true),
        scrollChatToBottom: jest.fn(), console,
    };
    const lifecycle = createGenerationLifecycleService(env.getCurrentGenerationContextIdentity);
    env.getGenerationLifecycleService = () => lifecycle;
    const entry = createGenerationCallerService({
        getChat: () => env.chat, getChatId: () => env.chatId, getNarratorType: () => env.system_message_types.NARRATOR,
        getLifecycle: () => env.getGenerationLifecycleService(), getAbortController: () => env.abortController,
        isReactOwner: () => env.isReactMainChatOwner(), clearMessageUi: () => {},
        clearVisibleStart: id => env.mainChatVisibleStartIndices.delete(id),
        getEditId: () => env.this_edit_mes_id, clearEditId: () => { env.this_edit_mes_id = undefined; },
        markTainted: () => { env.chat_metadata.tainted = true; }, saveDebounced: predicate => env.saveChatDebounced(predicate),
        emitEvent: (...args) => env.eventSource.emit(...args), events: env.event_types,
        redisplay: (...args) => env.redisplayChat(...args), saveConditional: (...args) => env.saveChatConditional(...args),
        scrollToBottom: (...args) => env.scrollChatToBottom(...args),
    });
    Object.defineProperty(env, 'pendingRegenerateRestore', { configurable: true, get: () => entry.pendingRegenerateRestore });
    return { env, ...entry };
}

test('same-id replacement chat cannot receive a stale regenerate restore', async () => {
    const f = await restoreFixture();
    const snapshot = f.removeRegenerateTurnTail();
    f.env.chat = [userMessage(), assistantMessage('other chat')];
    expect(await f.restoreRegenerateTurnTail(snapshot)).toBe(false);
    expect(f.env.chat[1].mes).toBe('other chat');
    expect(f.env.saveChatConditional).not.toHaveBeenCalled();
});

test('typed lifecycle removes a generated tail synchronously and registers its restore snapshot', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'chat' }));
    const chat = [userMessage(), toolCard(), assistantMessage()];
    const snapshot = { chatId: 'chat', insertIndex: 1, messages: [toolCard(), assistantMessage()] };
    const calls = [];
    const ownsRestore = () => true;
    const result = lifecycle.removeRegenerateTail(snapshot, {
        capture: () => ownsRestore,
        clearView: index => calls.push(['view', index]),
        clearEditing: index => calls.push(['edit', index]),
        chat,
        markTainted: () => calls.push(['tainted']),
        save: () => calls.push(['save']),
        deleted: length => calls.push(['deleted', length]),
        render: index => calls.push(['render', index]),
        register: value => calls.push(['register', value]),
    });
    expect(result).toBe(snapshot);
    expect(snapshot.ownsRestore).toBe(ownsRestore);
    expect(chat).toEqual([userMessage()]);
    expect(calls).toEqual([
        ['view', 1], ['edit', 1], ['tainted'], ['save'], ['deleted', 1], ['render', 1], ['register', snapshot],
    ]);
});

test('real regenerate removal uses the installed typed owner', async () => {
    const f = await restoreFixture();
    const lifecycle = f.env.getGenerationLifecycleService();
    const owner = jest.spyOn(lifecycle, 'removeRegenerateTail');
    const snapshot = f.removeRegenerateTurnTail();
    expect(owner).toHaveBeenCalledTimes(1);
    expect(snapshot.messages[0].mes).toBe('original');
    expect(f.env.chat).toEqual([userMessage()]);
    expect(f.env.pendingRegenerateRestore).toBe(snapshot);
});

test('regenerate tail save carries live chat identity without treating stop as a chat switch', async () => {
    const f = await restoreFixture();
    f.removeRegenerateTurnTail();
    const predicate = f.env.saveChatDebounced.mock.calls[0][0];
    expect(typeof predicate).toBe('function');
    expect(predicate()).toBe(true);
    f.env.abortController.abort();
    expect(predicate()).toBe(true);
    f.env.chat = [userMessage('other chat')];
    expect(predicate()).toBe(false);
});

test('a user-ended turn remains a synchronous no-op before runtime installation', async () => {
    const f = await restoreFixture();
    f.removeRegenerateTurnTail();
    expect(f.env.pendingRegenerateRestore).not.toBeNull();
    f.env.saveChatDebounced.mockClear();
    f.env.chat = [userMessage()];

    f.env.getGenerationLifecycleService = () => { throw new Error('runtime not installed'); };
    expect(f.removeRegenerateTurnTail()).toBeNull();
    expect(f.env.pendingRegenerateRestore).toBeNull();
    expect(f.env.saveChatDebounced).not.toHaveBeenCalled();
});

test('regenerate classification is shared by the synchronous facade and the typed lifecycle', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'chat' }));
    const facade = await importFreshCore();
    const chat = [userMessage(), toolCard(), assistantMessage()];
    expect(lifecycle.collectRegenerateTurn(chat, { chatId: 'chat' })).toEqual(facade.collectRegenerateTurn(chat, { chatId: 'chat' }));
    expect(lifecycle.canRegenerateLastReply({ busy: false, connected: true, hasCharacter: true, chat })).toBe(true);
    expect(lifecycle.canRegenerateLastReply({ busy: true, connected: true, hasCharacter: true, chat })).toBe(false);
});

test('regenerate save queued before chat switch checks live identity and skips redisplay', async () => {
    const f = await restoreFixture();
    const snapshot = f.removeRegenerateTurnTail();
    f.env.redisplayChat.mockClear();
    let release;
    const waiting = new Promise(resolve => { release = resolve; });
    let saved = false;
    f.env.saveChatConditional.mockImplementationOnce(async predicate => { await waiting; saved = predicate ? predicate() : true; });
    const restoring = f.restoreRegenerateTurnTail(snapshot);
    f.env.chat = [userMessage(), assistantMessage('other chat')];
    release();
    await restoring;
    expect(saved).toBe(false);
    expect(f.env.redisplayChat).not.toHaveBeenCalled();
});

test('one regenerate snapshot cannot commit twice', async () => {
    const f = await restoreFixture();
    const snapshot = f.removeRegenerateTurnTail();
    expect(await f.restoreRegenerateTurnTail(snapshot)).toBe(true);
    expect(await f.restoreRegenerateTurnTail(snapshot)).toBe(false);
    expect(f.env.saveChatConditional).toHaveBeenCalledTimes(1);
});

test.each(['revision', 'stop'])('regenerate restore is suppressed on %s', async change => {
    const f = await restoreFixture();
    const snapshot = f.removeRegenerateTurnTail();
    if (change === 'revision') f.env.revision++;
    else f.env.abortController.abort();
    expect(await f.restoreRegenerateTurnTail(snapshot)).toBe(false);
    expect(f.env.chat).toHaveLength(1);
    expect(f.env.saveChatConditional).not.toHaveBeenCalled();
});

test('external generation cancellation suppresses regenerate restore', async () => {
    const f = await restoreFixture();
    const external = new AbortController();
    const snapshot = f.removeRegenerateTurnTail(external.signal);
    external.abort();
    expect(await f.restoreRegenerateTurnTail(snapshot)).toBe(false);
    expect(f.env.saveChatConditional).not.toHaveBeenCalled();
});

test('a second restore cannot commit while the first save is queued', async () => {
    const f = await restoreFixture();
    const snapshot = f.removeRegenerateTurnTail();
    let release;
    const waiting = new Promise(resolve => { release = resolve; });
    f.env.saveChatConditional.mockImplementationOnce(async () => { await waiting; return true; });
    const first = f.restoreRegenerateTurnTail(snapshot);
    expect(f.env.chat[1].mes).toBe('original'); // commit remains synchronous before the first await
    expect(await f.restoreRegenerateTurnTail(snapshot)).toBe(false);
    release();
    expect(await first).toBe(true);
    expect(f.env.saveChatConditional).toHaveBeenCalledTimes(1);
});

test('chat switch during restore redisplay prevents stale scrolling', async () => {
    const f = await restoreFixture();
    const snapshot = f.removeRegenerateTurnTail();
    let release;
    let rendered;
    const entered = new Promise(resolve => { rendered = resolve; });
    const waiting = new Promise(resolve => { release = resolve; });
    f.env.redisplayChat.mockImplementationOnce(async () => { rendered(); await waiting; });
    const restoring = f.restoreRegenerateTurnTail(snapshot);
    await entered;
    f.env.chat = [userMessage(), assistantMessage('other')];
    release();
    expect(await restoring).toBe(false);
    expect(f.env.scrollChatToBottom).not.toHaveBeenCalled();
});

describe('isRegenerateRemovableMessage', () => {
    test('removes generated assistant rows and pipeline/tool cards', async () => {
        const { isRegenerateRemovableMessage } = await importFreshCore();

        expect(isRegenerateRemovableMessage(assistantMessage())).toBe(true);
        expect(isRegenerateRemovableMessage(recoveryRow())).toBe(true);
        expect(isRegenerateRemovableMessage(toolCard())).toBe(true);
    });

    test('keeps user, narrator, manual, and generic system rows', async () => {
        const { isRegenerateRemovableMessage } = await importFreshCore();

        expect(isRegenerateRemovableMessage(userMessage())).toBe(false);
        expect(isRegenerateRemovableMessage(narrator())).toBe(false);
        expect(isRegenerateRemovableMessage(manualAssistant())).toBe(false);
        expect(isRegenerateRemovableMessage(systemNote())).toBe(false);
    });

    test('keeps non-object and null entries', async () => {
        const { isRegenerateRemovableMessage } = await importFreshCore();

        expect(isRegenerateRemovableMessage(null)).toBe(false);
        expect(isRegenerateRemovableMessage('text')).toBe(false);
    });
});

describe('findRegenerateTurnStart', () => {
    test('returns chat.length when the last message is a user message', async () => {
        const { findRegenerateTurnStart } = await importFreshCore();
        const chat = [assistantMessage(), userMessage()];

        expect(findRegenerateTurnStart(chat)).toBe(chat.length);
    });

    test('removes the assistant reply plus same-turn tool cards', async () => {
        const { findRegenerateTurnStart } = await importFreshCore();
        const chat = [userMessage(), toolCard(), assistantMessage()];

        expect(findRegenerateTurnStart(chat)).toBe(1);
    });

    test('stops at the last user message and never crosses it', async () => {
        const { findRegenerateTurnStart } = await importFreshCore();
        const chat = [assistantMessage('old'), userMessage(), assistantMessage('new')];

        expect(findRegenerateTurnStart(chat)).toBe(2);
    });

    test('stops before user-authored narrator/system rows', async () => {
        const { findRegenerateTurnStart } = await importFreshCore();

        // Narrator sits between the reply and the end — nothing removable.
        const withNarrator = [userMessage(), assistantMessage(), narrator()];
        expect(findRegenerateTurnStart(withNarrator)).toBe(3);

        // Generic system note at the end protects the whole tail.
        const withNote = [userMessage(), assistantMessage(), systemNote()];
        expect(findRegenerateTurnStart(withNote)).toBe(3);
    });

    test('a leading character greeting counts as a removable turn', async () => {
        const { findRegenerateTurnStart } = await importFreshCore();
        const chat = [assistantMessage('greeting')];

        expect(findRegenerateTurnStart(chat)).toBe(0);
    });

    test('a narrator sandwiched inside the tail protects everything before it', async () => {
        const { findRegenerateTurnStart } = await importFreshCore();
        // The scan walks back from the end: reply + card at the tail are
        // removable, the narrator stops the walk, and the earlier reply
        // stays — even though it looks generated, it belongs to a turn the
        // user already annotated.
        const chat = [
            userMessage(),
            assistantMessage('older reply'),
            narrator(),
            toolCard(),
            assistantMessage('latest reply'),
        ];

        expect(findRegenerateTurnStart(chat)).toBe(3);
    });

    test('a tool card at the tail of an earlier turn is not touched', async () => {
        const { findRegenerateTurnStart } = await importFreshCore();
        const chat = [toolCard(), userMessage(), assistantMessage('new')];

        expect(findRegenerateTurnStart(chat)).toBe(2);
    });

    test('empty and non-array histories produce an empty tail', async () => {
        const { findRegenerateTurnStart, collectRegenerateTurn } = await importFreshCore();

        expect(findRegenerateTurnStart([])).toBe(0);
        expect(collectRegenerateTurn([])).toEqual({ chatId: null, insertIndex: 0, messages: [] });
        expect(collectRegenerateTurn(undefined)).toEqual({ chatId: null, insertIndex: 0, messages: [] });
    });
});

describe('collectRegenerateTurn', () => {
    test('deep-clones the removed tail so later mutation cannot corrupt it', async () => {
        const { collectRegenerateTurn } = await importFreshCore();
        const reply = assistantMessage('old reply');
        reply.extra.reasoning = 'chain';
        const chat = [userMessage(), reply];

        const snapshot = collectRegenerateTurn(chat, { chatId: 'chat-1' });
        chat[1].mes = 'mutated';
        chat[1].extra.reasoning = 'mutated';

        expect(snapshot.chatId).toBe('chat-1');
        expect(snapshot.insertIndex).toBe(1);
        expect(snapshot.messages).toHaveLength(1);
        expect(snapshot.messages[0].mes).toBe('old reply');
        expect(snapshot.messages[0].extra.reasoning).toBe('chain');
    });

    test('returns an empty snapshot when the tail is a user message', async () => {
        const { collectRegenerateTurn } = await importFreshCore();
        const chat = [assistantMessage(), userMessage()];

        const snapshot = collectRegenerateTurn(chat);

        expect(snapshot.insertIndex).toBe(chat.length);
        expect(snapshot.messages).toEqual([]);
    });
});
