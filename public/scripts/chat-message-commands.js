import { createChatMessageReasoningCommands } from './chat-message-reasoning-commands.js';

/** One mutation entry for message actions; chat remains the compatibility authority. */
export function createChatMessageCommands(deps) {
    const messageAt = id => Number.isInteger(Number(id)) && Number(id) >= 0 ? deps.getChat()[Number(id)] : undefined;
    const isCurrent = (id, message, chatId) => deps.getChatId() === chatId && messageAt(id) === message;

    function remapUi(mapIndex) {
        const states = deps.getUiStates();
        const next = [];
        for (const [key, state] of states) {
            const index = mapIndex(Number(key));
            if (index !== undefined) next.push([String(index), state]);
        }
        states.clear();
        for (const [key, state] of next) states.set(key, state);
        const editing = deps.getEditingId();
        if (Number.isInteger(editing)) deps.setEditingId(mapIndex(editing));
    }

    function startMessageEdit(messageId) {
        const id = Number(messageId), message = messageAt(id);
        if (deps.isBlocked() || !message) return false;
        deps.setEditingId(id);
        deps.setUiState(id, { editing: true, editText: deps.prepareEdit(String(message.mes ?? '')) });
        deps.refresh();
        return true;
    }

    function updateMessageEdit(messageId, text) {
        const id = Number(messageId);
        if (!messageAt(id)) return false;
        deps.setUiState(id, { editing: true, editText: String(text ?? '') });
        return true;
    }

    async function commitMessageEdit(messageId) {
        const id = Number(messageId), message = messageAt(id), ui = deps.getUiState(id);
        if (!message || !ui?.editing) return false;
        const chatId = deps.getChatId();
        deps.applyEdit(id, ui.editText);
        await deps.emit('MESSAGE_EDITED', id);
        if (!isCurrent(id, message, chatId)) return false;
        deps.setUiState(id, { editing: false, editText: null });
        if (deps.getEditingId() === id) deps.setEditingId(undefined);
        await deps.emit('MESSAGE_UPDATED', id);
        if (!isCurrent(id, message, chatId)) return false;
        try { await deps.save(); } finally { if (isCurrent(id, message, chatId)) deps.refresh(); }
        return true;
    }

    function cancelMessageEdit(messageId) {
        const id = Number(messageId);
        if (!messageAt(id)) return false;
        deps.setUiState(id, { editing: false, editText: null });
        if (deps.getEditingId() === id) deps.setEditingId(undefined);
        deps.refresh();
        return true;
    }

    async function copyMessage(messageId) {
        const message = messageAt(messageId);
        if (!message) return false;
        await deps.copyText(String(message.mes ?? ''));
        deps.notifyCopied();
        return true;
    }

    async function duplicateMessage(messageId) {
        const id = Number(messageId), source = messageAt(id);
        if (deps.isBlocked() || !source) return false;
        const chatId = deps.getChatId();
        const clone = structuredClone(source);
        clone.send_date = Date.now();
        clone.extra = { ...clone.extra, id: deps.createId() };
        const ui = deps.getUiState(id);
        clone.mes = String(ui?.editing ? ui.editText ?? '' : clone.mes ?? '').trim();
        deps.getChat().splice(id + 1, 0, clone);
        remapUi(index => index > id ? index + 1 : index);
        deps.refresh();
        try { await deps.save(); } finally { if (isCurrent(id + 1, clone, chatId)) deps.refresh(); }
        if (!isCurrent(id + 1, clone, chatId)) return false;
        await deps.emit('MESSAGE_UPDATED', id + 1);
        return true;
    }

    async function deleteRange(start, count, { taint = true } = {}) {
        const id = Number(start);
        if (deps.isBlocked() || !messageAt(id) || !Number.isInteger(count) || count < 1) return false;
        const chatId = deps.getChatId();
        const removed = deps.getChat().splice(id, count).length;
        remapUi(index => index < id ? index : index < id + removed ? undefined : index - removed);
        if (taint) deps.taint();
        deps.resetWindow();
        deps.refresh();
        deps.saveDebounced();
        await deps.emit('MESSAGE_DELETED', deps.getChat().length);
        if (deps.getChatId() === chatId) deps.refresh();
        return true;
    }

    async function deleteMessage(messageId, askConfirmation = false) {
        const id = Number(messageId), message = messageAt(id);
        if (deps.isBlocked() || !message) return false;
        const chatId = deps.getChatId();
        if (askConfirmation && !await deps.confirmDelete()) return false;
        if (!isCurrent(id, message, chatId)) return false;
        return deleteRange(id, 1);
    }

    async function moveMessage(sourceId, targetId) {
        const source = Number(sourceId), target = Number(targetId);
        if (deps.isBlocked() || deps.isGenerating() || Math.abs(source - target) !== 1 || !messageAt(source) || !messageAt(target)) return false;
        const chat = deps.getChat(), chatId = deps.getChatId(), message = chat[source];
        [chat[source], chat[target]] = [chat[target], chat[source]];
        remapUi(index => index === source ? target : index === target ? source : index);
        deps.refresh();
        try { await deps.save(); } finally { if (isCurrent(target, message, chatId)) deps.refresh(); }
        if (!isCurrent(target, message, chatId)) return false;
        await deps.emit('MESSAGE_UPDATED', source);
        return true;
    }

    // Compatibility callers can mutate non-text message fields without replacing a React row.
    function updateMessage(messageId, update) {
        const message = messageAt(messageId);
        if (!message) return false;
        update(message);
        deps.refresh();
        return true;
    }

    async function updateMessageFields(messageId, update) {
        const id = Number(messageId), message = messageAt(id), chatId = deps.getChatId();
        if (!message) return false;
        update(message);
        await deps.emit('MESSAGE_EDITED', id);
        if (!isCurrent(id, message, chatId)) return false;
        deps.refresh();
        await deps.emit('MESSAGE_UPDATED', id);
        if (!isCurrent(id, message, chatId)) return false;
        await deps.save();
        return true;
    }

    async function deleteMatching(predicate) {
        if (deps.isBlocked()) return 0;
        const chat = deps.getChat(), chatId = deps.getChatId();
        const removed = chat.map((message, index) => predicate(message, index));
        const count = removed.filter(Boolean).length;
        if (!count) return 0;
        for (let i = removed.length - 1; i >= 0; i--) if (removed[i]) chat.splice(i, 1);
        remapUi(index => removed[index] ? undefined : index - removed.slice(0, index).filter(Boolean).length);
        deps.resetWindow();
        deps.refresh();
        try {
            await deps.save();
            if (deps.getChatId() === chatId) await deps.emit('MESSAGE_DELETED', chat.length);
        } finally { if (deps.getChatId() === chatId) deps.refresh(); }
        return count;
    }

    async function deleteFrom(start) {
        const id = Number(start), chatId = deps.getChatId();
        if (deps.isBlocked() || !messageAt(id)) return false;
        const refreshBulk = deps.getBulkRefresh?.() ?? deps.refresh;
        deps.getChat().splice(id);
        remapUi(index => index < id ? index : undefined);
        if (deps.prepareBulkWindow) deps.prepareBulkWindow(id);
        deps.taint();
        deps.refresh();
        await deps.save();
        await deps.emit('MESSAGE_DELETED', id);
        if (deps.getChatId() === chatId) await refreshBulk();
        return true;
    }

    return {
        startMessageEdit, updateMessageEdit, commitMessageEdit, cancelMessageEdit,
        copyMessage, duplicateMessage, deleteMessage, deleteRange, moveMessage, updateMessage,
        updateMessageFields, deleteMatching, deleteFrom,
        ...createChatMessageReasoningCommands({ ...deps, commitMessageEdit, cancelMessageEdit }),
    };
}
