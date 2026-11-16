export function isChatShortcutModalOpen(document) {
    if (document.querySelector('dialog[open]')) return true;
    const visible = element => Boolean(element?.getClientRects().length);
    return Array.from(document.querySelectorAll('[role="dialog"][aria-modal="true"]')).some(visible)
        || ['character_popup', 'shadow_select_chat_popup', 'dialogue_popup'].some(id => visible(document.getElementById(id)));
}

/** Dispatch chat shortcuts using projected state; the caller owns DOM focus and modal checks. */
export function dispatchChatEditShortcut({ event, snapshot, commands, modalOpen = false, composerAtStart = false }) {
    if (modalOpen || event.defaultPrevented || event.isComposing || event.keyCode === 229
        || event.repeat || event.shiftKey || event.altKey || event.metaKey) return false;

    const commit = event.key === 'Enter' && event.ctrlKey;
    const cancel = event.key === 'Escape' && !event.ctrlKey;
    const editing = snapshot.orderedMessageIds.map(id => snapshot.messagesById[id])
        .filter(message => message?.editing || message?.reasoningEditing);
    if (commit || cancel) {
        if (editing.length > 0) {
            const message = editing.find(item => item.editing) ?? editing[0];
            const command = message.editing
                ? (commit ? commands?.commitMessageEdit : commands?.cancelMessageEdit)
                : (commit ? commands?.commitMessageReasoningEdit : commands?.cancelMessageReasoningEdit);
            if (!message.uid || !command) return false;
            event.preventDefault();
            void command(message.uid);
            return true;
        }
        if (cancel && ['connecting', 'streaming', 'recovering', 'recoveringPrimary', 'recoveringFallback'].includes(snapshot.generation?.phase) && commands?.stopVisibleGeneration) {
            event.preventDefault();
            void commands.stopVisibleGeneration();
            return true;
        }
        return false;
    }

    // Focus and input updates can precede the projected React snapshot by a frame.
    // The caller has already verified the live composer's focus and selection.
    const liveComposer = event.target?.id === 'send_textarea' && typeof event.target.value === 'string' ? event.target : null;
    const composerFocused = liveComposer ? composerAtStart : snapshot.composer?.focused;
    const composerValue = liveComposer ? liveComposer.value : snapshot.composer?.value;
    if (event.key !== 'ArrowUp' || editing.length || !composerAtStart || !composerFocused || composerValue !== '') return false;
    const target = event.ctrlKey ? snapshot.lastUserMessageTarget : snapshot.lastMessageTarget;
    const editable = event.ctrlKey ? snapshot.lastUserMessageEditable : snapshot.lastMessageEditable;
    if (!target || editable === false || !commands?.loadMoreUntilMessage || !commands?.startMessageEdit) return false;
    event.preventDefault();
    Promise.resolve(commands.loadMoreUntilMessage(target.id)).then(result => {
        if (result !== false) return commands.startMessageEdit(target.uid);
    }).catch(error => console.error('Could not start message editing from shortcut', error));
    return true;
}
