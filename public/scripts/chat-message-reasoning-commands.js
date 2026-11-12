/** Message reasoning commands operate on the authoritative chat and transient UI state. */
export function createChatMessageReasoningCommands(deps) {
    const messageAt = id => {
        const index = Number(id);
        return Number.isInteger(index) && index >= 0 ? deps.getChat()[index] : undefined;
    };
    const isCurrent = (id, message, chatId) => deps.getChatId() === chatId && messageAt(id) === message;
    const patchUi = (id, patch) => {
        deps.setUiState(id, patch);
        deps.refresh();
    };

    function setMessageReasoningOpen(messageId, open) {
        const id = Number(messageId);
        const message = messageAt(id);
        const ui = deps.getUiState(id);
        if (!message || (typeof open !== 'boolean' && !message.extra?.reasoning && !ui?.reasoningEditing)) return false;
        const current = typeof ui?.reasoningOpen === 'boolean' ? ui.reasoningOpen : message.extra?.reasoning_open === true;
        patchUi(id, { reasoningOpen: typeof open === 'boolean' ? open : !current });
        return true;
    }

    async function copyMessageReasoning(messageId) {
        const reasoning = messageAt(messageId)?.extra?.reasoning;
        if (typeof reasoning !== 'string' || !reasoning) return false;
        await deps.copyText(reasoning);
        deps.notifyCopied();
        return true;
    }

    function startMessageReasoningEdit(messageId) {
        const id = Number(messageId);
        const message = messageAt(id);
        if (deps.isBlocked() || !message) return false;
        patchUi(id, { reasoningOpen: true, reasoningEditing: true, reasoningEditText: String(message.extra?.reasoning ?? '') });
        return true;
    }

    function updateMessageReasoningEdit(messageId, text) {
        const id = Number(messageId);
        if (!messageAt(id)) return false;
        patchUi(id, { reasoningOpen: true, reasoningEditing: true, reasoningEditText: String(text ?? '') });
        return true;
    }

    async function setMessageReasoning(messageId, text, { applyRegex = true } = {}) {
        const id = Number(messageId);
        const message = messageAt(id);
        if (!message) return false;
        const chatId = deps.getChatId();
        const reasoning = applyRegex ? deps.processReasoning(String(text ?? '')) : String(text ?? '');
        if (!message.extra || typeof message.extra !== 'object') message.extra = {};
        message.extra.reasoning = reasoning;
        message.extra.reasoning_type = applyRegex && message.extra.reasoning_type ? 'edited' : 'manual';
        try {
            await deps.save();
        } finally {
            if (isCurrent(id, message, chatId)) deps.refresh();
        }
        return isCurrent(id, message, chatId);
    }

    async function commitMessageReasoningEdit(messageId) {
        const id = Number(messageId);
        const message = messageAt(id);
        const ui = deps.getUiState(id);
        if (!message || !ui?.reasoningEditing) return false;
        const chatId = deps.getChatId();
        const reasoning = deps.processReasoning(String(ui.reasoningEditText ?? ''));
        patchUi(id, { reasoningOpen: reasoning !== '', reasoningEditing: false, reasoningEditText: null });
        if (reasoning === String(message.extra?.reasoning ?? '')) return true;
        if (!message.extra || typeof message.extra !== 'object') message.extra = {};
        message.extra.reasoning = reasoning;
        message.extra.reasoning_type = message.extra.reasoning_type ? 'edited' : 'manual';
        try {
            await deps.save();
        } finally {
            if (isCurrent(id, message, chatId)) deps.refresh();
        }
        if (!isCurrent(id, message, chatId)) return false;
        await deps.emit('MESSAGE_REASONING_EDITED', id);
        if (!isCurrent(id, message, chatId)) return false;
        if (deps.getUiState(id)?.editing) await deps.commitMessageEdit(id);
        return true;
    }

    async function cancelMessageReasoningEdit(messageId) {
        const id = Number(messageId);
        const message = messageAt(id);
        if (!message) return false;
        const ui = deps.getUiState(id);
        patchUi(id, { reasoningOpen: !!message.extra?.reasoning && ui?.reasoningOpen === true, reasoningEditing: false, reasoningEditText: null });
        if (ui?.editing) return deps.cancelMessageEdit(id);
        return true;
    }

    async function deleteMessageReasoning(messageId) {
        const id = Number(messageId);
        const message = messageAt(id);
        if (!message?.extra) return false;
        const chatId = deps.getChatId();
        if (!await deps.confirmReasoningDelete() || !isCurrent(id, message, chatId)) return false;
        message.extra.reasoning = '';
        delete message.extra.reasoning_type;
        delete message.extra.reasoning_duration;
        patchUi(id, { reasoningOpen: false, reasoningEditing: false, reasoningEditText: null });
        try {
            await deps.save();
        } finally {
            if (isCurrent(id, message, chatId)) deps.refresh();
        }
        if (!isCurrent(id, message, chatId)) return false;
        await deps.emit('MESSAGE_REASONING_DELETED', id);
        return true;
    }

    function collapseAllMessageReasoning() {
        let changed = false;
        deps.getChat().forEach((message, id) => {
            if (message?.extra?.reasoning || deps.getUiState(id)?.reasoningEditing) {
                deps.setUiState(id, { reasoningOpen: false });
                changed = true;
            }
        });
        if (changed) deps.refresh();
        return changed;
    }

    return { setMessageReasoningOpen, copyMessageReasoning, startMessageReasoningEdit, updateMessageReasoningEdit, commitMessageReasoningEdit, cancelMessageReasoningEdit, deleteMessageReasoning, collapseAllMessageReasoning, setMessageReasoning };
}
