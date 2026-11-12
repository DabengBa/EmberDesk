import { getMessageUid } from './message-uid.js';

/** Resolve React row identities at invocation time; legacy commands remain positional. */
export function createChatMessageRowCommands({ commands, getChat, isCurrentChat }) {
    const resolve = uid => {
        if (!isCurrentChat() || typeof uid !== 'string' || !uid) return -1;
        return getChat().findIndex(message => getMessageUid(message) === uid);
    };
    const names = [
        'startMessageEdit', 'updateMessageEdit', 'commitMessageEdit', 'cancelMessageEdit',
        'copyMessage', 'duplicateMessage', 'setMessageReasoningOpen', 'copyMessageReasoning',
        'startMessageReasoningEdit', 'updateMessageReasoningEdit', 'commitMessageReasoningEdit',
        'cancelMessageReasoningEdit', 'deleteMessageReasoning',
    ];
    const rows = Object.fromEntries(names.map(name => [name, (uid, ...args) => {
        const index = resolve(uid);
        return index < 0 ? false : commands[name](index, ...args);
    }]));
    rows.deleteMessage = uid => {
        const index = resolve(uid);
        return index < 0 ? false : commands.deleteMessage(index, true);
    };
    rows.moveMessage = (uid, direction) => {
        const index = resolve(uid);
        if (index < 0 || !['up', 'down'].includes(direction)) return false;
        return commands.moveMessage(index, index + (direction === 'up' ? -1 : 1));
    };
    rows.resolveMessageUid = resolve;
    return rows;
}
