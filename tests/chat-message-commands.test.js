import { describe, test, expect, jest } from '@jest/globals';
import { createChatMessageCommands } from '../public/scripts/chat-message-commands.js';
import { createChatMessageRowCommands } from '../public/scripts/chat-message-row-commands.js';
import { getMessageUid } from '../public/scripts/message-uid.js';

function fixture() {
    const chat = [0, 1, 2].map(id => ({ mes: `message ${id}`, name: 'A', extra: { id: String(id) } }));
    const ui = new Map();
    const calls = [];
    let editing;
    let chatId = 'first';
    const deps = {
        getChat: () => chat, getChatId: () => chatId, getUiStates: () => ui,
        getUiState: id => ui.get(String(id)), setUiState: (id, patch) => ui.set(String(id), { ...ui.get(String(id)), ...patch }),
        getEditingId: () => editing, setEditingId: id => { editing = id; },
        isBlocked: () => false, isGenerating: () => false,
        prepareEdit: text => text.trim(), applyEdit: (id, text) => { chat[id].mes = text.trim(); },
        save: async () => { calls.push('save'); }, saveDebounced: () => calls.push('debounce'),
        emit: async (event, id) => { calls.push([event, id]); }, refresh: jest.fn(), resetWindow: jest.fn(), taint: jest.fn(),
        copyText: jest.fn(), notifyCopied: jest.fn(), createId: () => 'new-id',
        confirmDelete: async () => true,
    };
    return { chat, ui, calls, deps, commands: createChatMessageCommands(deps), switchChat: () => { chatId = 'second'; } };
}

describe('message commands', () => {
    test('field changes keep object identity and emit edited, refresh, updated, save in order', async () => {
        const { chat, commands, deps, calls } = fixture();
        const original = chat[1];
        deps.refresh = () => calls.push('refresh');
        expect(await commands.updateMessageFields(1, message => { message.name = 'B'; })).toBe(true);
        expect(chat[1]).toBe(original);
        expect(original.name).toBe('B');
        expect(calls).toEqual([['MESSAGE_EDITED', 1], 'refresh', ['MESSAGE_UPDATED', 1], 'save']);
    });
    test('field edit does not continue on a different chat after the edited event', async () => {
        const f = fixture();
        f.deps.emit = async event => { f.calls.push(event); f.switchChat(); };
        expect(await f.commands.updateMessageFields(1, message => { message.name = 'B'; })).toBe(false);
        expect(f.calls).toEqual(['MESSAGE_EDITED']);
        expect(f.deps.refresh).not.toHaveBeenCalled();
    });
    test('visibility mutation refreshes the authoritative message without events or saves', () => {
        const { chat, commands, deps, calls } = fixture();
        const message = chat[0];
        expect(commands.updateMessage(0, target => { target.is_system = true; })).toBe(true);
        expect(chat[0]).toBe(message);
        expect(message.is_system).toBe(true);
        expect(deps.refresh).toHaveBeenCalledTimes(1);
        expect(calls).toEqual([]);
    });
    test('matching delete preserves survivor drafts and notifies history after saving', async () => {
        const { chat, commands, ui, deps, calls } = fixture();
        chat[1].name = 'B';
        commands.startMessageEdit(1); commands.updateMessageEdit(1, 'draft');
        calls.length = 0; deps.refresh = () => calls.push('refresh');
        expect(await commands.deleteMatching(message => message.name === 'A')).toBe(2);
        expect(chat).toHaveLength(1);
        expect(chat[0].name).toBe('B');
        expect(ui.get('0').editText).toBe('draft');
        expect(deps.getEditingId()).toBe(0);
        expect(calls).toEqual(['refresh', 'save', ['MESSAGE_DELETED', 1], 'refresh']);
    });
    test('bulk deletion saves before emitting original start and refresh', async () => {
        const { chat, commands, deps, calls } = fixture();
        deps.refresh = () => calls.push('refresh');
        expect(await commands.deleteFrom(1)).toBe(true);
        expect(chat).toHaveLength(1);
        expect(calls).toEqual(['refresh', 'save', ['MESSAGE_DELETED', 1], 'refresh']);
        expect(deps.taint).toHaveBeenCalled();
    });
    test('moving messages moves both drafts and editing identity without cloning messages', async () => {
        const { chat, ui, commands, deps } = fixture();
        const first = chat[0], second = chat[1];
        commands.startMessageEdit(0); commands.updateMessageEdit(0, 'first draft');
        commands.startMessageEdit(1); commands.updateMessageEdit(1, 'second draft');
        await commands.moveMessage(0, 1);
        expect(chat.slice(0, 2)).toEqual([second, first]);
        expect(chat[1]).toBe(first);
        expect(ui.get('1').editText).toBe('first draft');
        expect(ui.get('0').editText).toBe('second draft');
        expect(deps.getEditingId()).toBe(0);
    });
    test('moving persists the swapped chat, refreshes and emits the source update', async () => {
        const { chat, commands, deps, calls } = fixture();
        const first = chat[0], second = chat[1];
        deps.save = async () => {
            expect(chat[0]).toBe(second);
            expect(chat[1]).toBe(first);
            calls.push('save');
        };
        expect(await commands.moveMessage(0, 1)).toBe(true);
        expect(calls).toEqual(['save', ['MESSAGE_UPDATED', 0]]);
        expect(deps.refresh).toHaveBeenCalledTimes(2);
    });
    test('deletion drops deleted UI and shifts subsequent drafts and edit target', async () => {
        const { ui, commands, deps } = fixture();
        commands.startMessageEdit(0); commands.updateMessageEdit(0, 'keep');
        commands.startMessageEdit(1); commands.updateMessageEdit(1, 'discard');
        commands.startMessageEdit(2); commands.updateMessageEdit(2, 'shift');
        await commands.deleteMessage(1);
        expect(ui.get('0').editText).toBe('keep');
        expect(ui.get('1').editText).toBe('shift');
        expect(ui.has('2')).toBe(false);
        expect(deps.getEditingId()).toBe(1);
    });
    test('duplicate uses draft with a new persistent identity and preserves source', async () => {
        const { chat, commands, calls } = fixture();
        const source = chat[0];
        commands.startMessageEdit(0); commands.updateMessageEdit(0, ' draft ');
        await commands.duplicateMessage(0);
        expect(chat[0]).toBe(source);
        expect(chat[1].mes).toBe('draft');
        expect(chat[1].extra.id).toBe('new-id');
        expect(source.extra.id).toBe('0');
        expect(calls).toEqual(['save', ['MESSAGE_UPDATED', 1]]);
    });
    test('edit commits state before edited/updated/save events', async () => {
        const { chat, commands, calls, ui } = fixture();
        commands.startMessageEdit(0); commands.updateMessageEdit(0, ' saved ');
        await commands.commitMessageEdit(0);
        expect(chat[0].mes).toBe('saved');
        expect(ui.get('0').editing).toBe(false);
        expect(calls).toEqual([['MESSAGE_EDITED', 0], ['MESSAGE_UPDATED', 0], 'save']);
    });
    test('cancel leaves the authoritative text intact and copy uses saved text', async () => {
        const { chat, commands, deps } = fixture();
        commands.startMessageEdit(0); commands.updateMessageEdit(0, 'draft');
        await commands.copyMessage(0); await commands.cancelMessageEdit(0);
        expect(deps.copyText).toHaveBeenCalledWith('message 0');
        expect(chat[0].mes).toBe('message 0');
    });
    test.each(['switch', 'move'])('confirmation cannot delete a stale target after %s', async mode => {
        const f = fixture();
        f.deps.confirmDelete = async () => {
            if (mode === 'switch') f.switchChat();
            else f.chat.reverse();
            return true;
        };
        expect(await f.commands.deleteMessage(0, true)).toBe(false);
        expect(f.chat).toHaveLength(3);
    });
    test('invalid, nonadjacent and generation-time moves do nothing', async () => {
        const { chat, commands, deps } = fixture();
        expect(await commands.deleteMessage(-1)).toBe(false);
        expect(await commands.deleteMessage(99)).toBe(false);
        expect(await commands.moveMessage(0, 2)).toBe(false);
        deps.isGenerating = () => true;
        expect(await commands.moveMessage(0, 1)).toBe(false);
        expect(chat.map(x => x.extra.id)).toEqual(['0', '1', '2']);
    });
    test('range deletion remaps state once and emits the final length', async () => {
        const { chat, commands, calls, deps } = fixture();
        await commands.deleteRange(1, 2);
        expect(chat).toHaveLength(1);
        expect(calls).toEqual(['debounce', ['MESSAGE_DELETED', 1]]);
        expect(deps.taint).toHaveBeenCalledTimes(1);
        expect(deps.resetWindow).toHaveBeenCalledTimes(1);
        expect(deps.refresh).toHaveBeenCalledTimes(2);
    });
});

describe('stable React row command identities', () => {
    const methods = [
        ['startMessageEdit'], ['updateMessageEdit', 'draft'], ['commitMessageEdit'], ['cancelMessageEdit'],
        ['copyMessage'], ['duplicateMessage'], ['deleteMessage'], ['moveMessage', 'up'],
        ['setMessageReasoningOpen', true], ['copyMessageReasoning'], ['startMessageReasoningEdit'],
        ['updateMessageReasoningEdit', 'thought'], ['commitMessageReasoningEdit'],
        ['cancelMessageReasoningEdit'], ['deleteMessageReasoning'],
    ];
    test.each(methods)('%s resolves a moved object and rejects a removed object or switched chat', (name, ...args) => {
        const chat = [{}, {}, {}], message = chat[1], uid = getMessageUid(message);
        let current = true;
        const commands = Object.fromEntries(methods.map(([method]) => [method, jest.fn(() => true)]));
        const row = createChatMessageRowCommands({ commands, getChat: () => chat, isCurrentChat: () => current });
        chat.splice(1, 1); chat.unshift(message);
        expect(row[name](uid, ...args)).toBe(true);
        const expectedArgs = name === 'deleteMessage' ? [0, true] : name === 'moveMessage' ? [0, -1] : [0, ...args];
        expect(commands[name]).toHaveBeenCalledWith(...expectedArgs);
        current = false;
        expect(row[name](uid, ...args)).toBe(false);
        current = true; chat.shift();
        expect(row[name](uid, ...args)).toBe(false);
        expect(commands[name]).toHaveBeenCalledTimes(1);
    });

    test('slow structural save refreshes immediately and stale UID edits its moved draft', async () => {
        const f = fixture();
        const uid = getMessageUid(f.chat[1]), moved = f.chat[1], neighbor = f.chat[0];
        const row = createChatMessageRowCommands({ commands: f.commands, getChat: () => f.chat, isCurrentChat: () => true });
        let release;
        f.deps.save = jest.fn(() => new Promise(resolve => { release = resolve; }));
        row.startMessageEdit(uid);
        row.updateMessageEdit(uid, 'before move');
        f.deps.refresh.mockClear();
        const pending = row.moveMessage(uid, 'up');
        expect(f.deps.refresh).toHaveBeenCalledTimes(1);
        row.updateMessageEdit(uid, 'after move');
        expect(f.ui.get('0').editText).toBe('after move');
        expect(f.ui.get('1')?.editText).toBeUndefined();
        expect(f.chat[0]).toBe(moved);
        expect(f.chat[1]).toBe(neighbor);
        release(); await pending;
    });

    test('slow matching deletion refreshes at once, resolves surviving reasoning and rejects the deleted row', async () => {
        const f = fixture();
        const removedUid = getMessageUid(f.chat[0]), survivorUid = getMessageUid(f.chat[1]);
        const row = createChatMessageRowCommands({ commands: f.commands, getChat: () => f.chat, isCurrentChat: () => true });
        let release;
        f.deps.save = jest.fn(() => new Promise(resolve => { release = resolve; }));
        const pending = f.commands.deleteMatching((_, index) => index === 0);
        expect(f.deps.refresh).toHaveBeenCalledTimes(1);
        expect(row.startMessageReasoningEdit(removedUid)).toBe(false);
        expect(row.startMessageReasoningEdit(survivorUid)).toBe(true);
        expect(row.updateMessageReasoningEdit(survivorUid, 'correct thought')).toBe(true);
        expect(f.ui.get('0').reasoningEditText).toBe('correct thought');
        expect(f.ui.get('1')).toBeUndefined();
        release(); await pending;
    });
});
