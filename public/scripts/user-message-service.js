/** User-message construction and the guarded attachment/save/publication sequence. */
export function createUserMessageService(deps) {
    async function buildUserMessage(messageText, messageBias, { compact = false, name } = {}) {
        messageText = deps.regexUserInput(messageText);
        const message = {
            name,
            is_user: true,
            is_system: false,
            send_date: deps.timestamp(),
            mes: deps.substitute(messageText),
            extra: { id: deps.uuid(), isSmallSys: compact },
        };
        if (messageBias) {
            message.extra.bias = messageBias;
            message.mes = deps.removeMacros(message.mes);
        }
        return message;
    }

    async function sendMessageAsUser(messageText, messageBias, insertAt = null, compact = false, name, { signal } = {}) {
        const submittedChat = deps.getChat();
        const { contextKey, contextRevision } = deps.getComposerSnapshot();
        const isCurrent = () => {
            const current = deps.getComposerSnapshot();
            return deps.getChat() === submittedChat && current.contextKey === contextKey && current.contextRevision === contextRevision && !signal?.aborted;
        };
        const message = await buildUserMessage(messageText, messageBias, { compact, name });
        if (!isCurrent()) return;
        await deps.populateAttachment(message, isCurrent);
        if (!isCurrent()) return;
        deps.taint();
        if (typeof insertAt === 'number' && insertAt >= 0 && insertAt <= submittedChat.length) {
            submittedChat.splice(insertAt, 0, message);
            await deps.save(isCurrent);
            if (!isCurrent()) return message;
            await deps.emitSent(insertAt);
            if (!isCurrent()) return message;
            await deps.reload();
            if (!isCurrent()) return message;
            await deps.emitRendered(insertAt);
        } else {
            submittedChat.push(message);
            await deps.save(isCurrent);
            if (!isCurrent()) return message;
            const chatId = submittedChat.length - 1;
            await deps.emitSent(chatId);
            if (!isCurrent()) return message;
            deps.addMessage(message);
            await deps.emitRendered(chatId);
        }
        return message;
    }

    return { buildUserMessage, sendMessageAsUser };
}
