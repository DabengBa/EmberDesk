import { describe, expect, test } from '@jest/globals';

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
