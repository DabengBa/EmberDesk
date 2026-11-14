import { describe, expect, jest, test } from '@jest/globals';
import { dispatchChatEditShortcut, isChatShortcutModalOpen } from '../public/scripts/chat-shortcut-edit-commands.js';
import { buildMainChatSnapshotFromLegacyChat } from '../public/scripts/main-chat-store-projection.js';
import { createChatMessageRowCommands } from '../public/scripts/chat-message-row-commands.js';
import { loadTsModule } from './helpers/load-ts-module.mjs';

function fixture(overrides = {}) {
    const event = { key: 'Enter', ctrlKey: true, shiftKey: false, altKey: false, metaKey: false, isComposing: false, keyCode: 13, defaultPrevented: false, repeat: false, preventDefault: jest.fn(), ...overrides };
    const commands = { commitMessageEdit: jest.fn(), commitMessageReasoningEdit: jest.fn(), cancelMessageEdit: jest.fn(), cancelMessageReasoningEdit: jest.fn(), stopVisibleGeneration: jest.fn(), startMessageEdit: jest.fn(), loadMoreUntilMessage: jest.fn().mockResolvedValue(true) };
    const snapshot = { orderedMessageIds: ['0'], messagesById: { 0: { uid: 'uid-0', editing: true, reasoningEditing: false } }, composer: { value: '', focused: true }, generation: { phase: 'idle' }, lastMessageTarget: { id: '2', uid: 'uid-2' }, lastUserMessageTarget: { id: '1', uid: 'uid-1' }, lastMessageEditable: true, lastUserMessageEditable: true };
    return { event, commands, snapshot, composerAtStart: true };
}

describe('chat edit shortcut dispatch', () => {
    test('commits the active edit by uid and consumes Ctrl+Enter', () => {
        const f = fixture();
        expect(dispatchChatEditShortcut(f)).toBe(true);
        expect(f.commands.commitMessageEdit).toHaveBeenCalledWith('uid-0');
        expect(f.event.preventDefault).toHaveBeenCalled();
    });
    test('Escape cancels a reasoning edit by uid', () => {
        const f = fixture({ key: 'Escape', ctrlKey: false });
        f.snapshot.messagesById[0].editing = false;
        f.snapshot.messagesById[0].reasoningEditing = true;
        expect(dispatchChatEditShortcut(f)).toBe(true);
        expect(f.commands.cancelMessageReasoningEdit).toHaveBeenCalledWith('uid-0');
    });
    test.each([{ isComposing: true }, { keyCode: 229 }, { defaultPrevented: true }, { shiftKey: true }, { altKey: true }, { metaKey: true }, { repeat: true }])('respects key priority %j', overrides => {
        const f = fixture(overrides);
        expect(dispatchChatEditShortcut(f)).toBe(false);
        expect(f.commands.commitMessageEdit).not.toHaveBeenCalled();
    });
    test('leaves modal input to the modal', () => {
        const f = fixture();
        expect(dispatchChatEditShortcut({ ...f, modalOpen: true })).toBe(false);
        expect(f.commands.commitMessageEdit).not.toHaveBeenCalled();
    });
    test('gives the message editor priority over simultaneous reasoning', () => {
        const f = fixture();
        f.snapshot.messagesById[0].reasoningEditing = true;
        expect(dispatchChatEditShortcut(f)).toBe(true);
        expect(f.commands.commitMessageEdit).toHaveBeenCalledWith('uid-0');
        expect(f.commands.commitMessageReasoningEdit).not.toHaveBeenCalled();
        f.event.key = 'Escape'; f.event.ctrlKey = false;
        expect(dispatchChatEditShortcut(f)).toBe(true);
        expect(f.commands.cancelMessageEdit).toHaveBeenCalledWith('uid-0');
    });
    test.each([[false, '2', 'uid-2'], [true, '1', 'uid-1']])('ArrowUp loads target before editing (ctrl=%s)', async (ctrlKey, id, uid) => {
        const f = fixture({ key: 'ArrowUp', ctrlKey });
        f.snapshot.messagesById[0].editing = false;
        expect(dispatchChatEditShortcut(f)).toBe(true);
        expect(f.commands.loadMoreUntilMessage).toHaveBeenCalledWith(id);
        expect(f.commands.startMessageEdit).not.toHaveBeenCalled();
        await Promise.resolve();
        expect(f.commands.startMessageEdit).toHaveBeenCalledWith(uid);
        expect(f.event.preventDefault).toHaveBeenCalled();
    });
    test('does not start editing for a nonempty composer, selection or active edit', () => {
        const f = fixture({ key: 'ArrowUp', ctrlKey: false });
        expect(dispatchChatEditShortcut(f)).toBe(false);
        f.snapshot.messagesById[0].editing = false;
        f.snapshot.composer.value = 'text';
        expect(dispatchChatEditShortcut(f)).toBe(false);
        f.snapshot.composer.value = ''; f.composerAtStart = false;
        expect(dispatchChatEditShortcut(f)).toBe(false);
    });
    test('Escape stops active generation even for an empty chat', () => {
        const f = fixture({ key: 'Escape', ctrlKey: false });
        f.snapshot.orderedMessageIds = []; f.snapshot.messagesById = {};
        f.snapshot.generation.phase = 'streaming';
        expect(dispatchChatEditShortcut(f)).toBe(true);
        expect(f.commands.stopVisibleGeneration).toHaveBeenCalledTimes(1);
    });
    test('does not edit a target whose row has no edit action', () => {
        const f = fixture({ key: 'ArrowUp', ctrlKey: false });
        f.snapshot.messagesById[0].editing = false;
        f.snapshot.lastMessageEditable = false;
        expect(dispatchChatEditShortcut(f)).toBe(false);
        expect(f.commands.loadMoreUntilMessage).not.toHaveBeenCalled();
    });
    test('allows editing existing messages while composer submission has no API connection', async () => {
        const f = fixture({ key: 'ArrowUp', ctrlKey: false });
        f.snapshot.messagesById[0].editing = false;
        f.snapshot.composer.disabled = true;
        expect(dispatchChatEditShortcut(f)).toBe(true);
        await Promise.resolve();
        expect(f.commands.startMessageEdit).toHaveBeenCalledWith('uid-2');
    });
    test('retains the uid command session guard while loading an earlier message', async () => {
        const f = fixture({ key: 'ArrowUp', ctrlKey: true });
        const chat = [{ is_user: true, extra: {} }, { is_user: false, extra: {} }];
        const projected = buildMainChatSnapshotFromLegacyChat({ chat, visibleMessageIds: ['1'], formatMessage: text => text });
        f.snapshot = { ...projected, composer: { value: '', focused: true } };
        let current = true;
        let finish;
        f.commands.loadMoreUntilMessage = jest.fn(() => new Promise(resolve => { finish = resolve; }));
        const start = jest.fn();
        f.commands.startMessageEdit = createChatMessageRowCommands({ commands: { startMessageEdit: start }, getChat: () => chat, isCurrentChat: () => current }).startMessageEdit;
        expect(dispatchChatEditShortcut(f)).toBe(true);
        expect(f.commands.loadMoreUntilMessage).toHaveBeenCalledWith('0');
        current = false; finish(true);
        await Promise.resolve();
        expect(start).not.toHaveBeenCalled();
    });
    test('does not edit if loading the target fails', async () => {
        const f = fixture({ key: 'ArrowUp', ctrlKey: true });
        f.snapshot.messagesById[0].editing = false;
        f.commands.loadMoreUntilMessage.mockResolvedValue(false);
        expect(dispatchChatEditShortcut(f)).toBe(true);
        await Promise.resolve();
        expect(f.commands.startMessageEdit).not.toHaveBeenCalled();
    });
});

test('the stable-owner hook module exposes the integration entry', async () => {
    const module = await loadTsModule('app/components/main-chat/useMainChatHotkeys.ts');
    expect(typeof module.useMainChatHotkeys).toBe('function');
});

test('hidden aria-modal markup does not block chat; visible modal layers do', () => {
    let visible = false;
    let dialogOpen = false;
    const hiddenOrVisible = { getClientRects: () => visible ? [{}] : [] };
    const document = {
        querySelector: selector => dialogOpen || (selector.includes('[role=') && !visible) ? {} : null,
        querySelectorAll: () => [hiddenOrVisible],
        getElementById: () => null,
    };
    expect(isChatShortcutModalOpen(document)).toBe(false);
    visible = true;
    expect(isChatShortcutModalOpen(document)).toBe(true);
    visible = false; dialogOpen = true;
    expect(isChatShortcutModalOpen(document)).toBe(true);
});

test('visible projection does not encode the role of earlier messages', () => {
    const visible = { name: 'Assistant', mes: 'visible', is_user: false, extra: {} };
    const make = isUser => buildMainChatSnapshotFromLegacyChat({ chatId: null, chat: [
        { name: 'Earlier', mes: 'earlier', is_user: isUser, extra: {} },
        visible,
    ], visibleMessageIds: ['1'], formatMessage: text => text });
    const userEarlier = make(true);
    const noUserEarlier = make(false);
    expect(userEarlier.orderedMessageIds).toEqual(noUserEarlier.orderedMessageIds);
    expect(userEarlier.messagesById).toEqual(noUserEarlier.messagesById);
    expect(userEarlier.messagesById['0']).toBeUndefined();
    expect(userEarlier.lastUserMessageTarget).toEqual({ id: '0', uid: expect.any(String) });
    expect(noUserEarlier.lastUserMessageTarget).toBeNull();
    expect(userEarlier.lastMessageTarget).toEqual({ id: '1', uid: userEarlier.messagesById['1'].uid });
});

test('projection exposes edit availability without formatting a hidden target', () => {
    const formatMessage = jest.fn(text => text);
    const snapshot = buildMainChatSnapshotFromLegacyChat({ chat: [{ is_user: true, extra: {} }, { extra: { type: 'assistant_message' } }], visibleMessageIds: [], formatMessage });
    expect(snapshot.lastUserMessageEditable).toBe(true);
    expect(snapshot.lastMessageEditable).toBe(false);
    expect(snapshot.lastUserMessageTarget).toEqual({ id: '0', uid: expect.any(String) });
    expect(formatMessage).not.toHaveBeenCalled();
});
