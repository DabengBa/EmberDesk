/**
 * Applies the shared chat-state reset mechanics used when leaving the current chat.
 *
 * @param {object} options
 * @param {string|undefined} options.currentCharacterId
 * @param {string} options.neutralCharacterName
 * @param {string} options.systemUserName
 * @param {Array<object>} options.chat
 * @param {Array<object>} options.safetyChat
 * @param {Array<object>} options.characters
 * @param {(value: undefined) => void} options.setCharacterId
 * @param {boolean} [options.clearCharacters=true]
 * @returns {string}
 */
export function applyResetChatState({
    currentCharacterId,
    neutralCharacterName,
    systemUserName,
    chat,
    safetyChat,
    characters,
    setCharacterId,
    clearCharacters = true,
}) {
    const nextCharacterName = (currentCharacterId === undefined && neutralCharacterName) ? neutralCharacterName : systemUserName;

    setCharacterId(undefined);
    chat.splice(0, chat.length, ...safetyChat);

    if (clearCharacters) {
        characters.length = 0;
    }

    return nextCharacterName;
}
