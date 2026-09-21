/**
 * Performs the delete-only chat close preflight.
 * It preserves the save/generation safety gates and low-level cleanup,
 * but intentionally skips the heavier chat transition work before the
 * delete request.
 *
 * @param {object} dependencies
 * @param {() => boolean} dependencies.isGenerationInProgress
 * @param {() => void} [dependencies.onGenerationBlocked]
 * @param {() => Promise<void>} dependencies.waitForPendingChatSave
 * @param {() => Promise<void>} dependencies.clearCurrentChat
 * @param {() => void} dependencies.resetSelectionState
 * @param {() => void} [dependencies.selectCharactersView]
 * @param {() => Promise<void>} [dependencies.emitChatChanged]
 * @returns {Promise<boolean>}
 */
export async function runDeleteCharacterClosePreflight({
    isGenerationInProgress,
    onGenerationBlocked,
    waitForPendingChatSave,
    clearCurrentChat,
    resetSelectionState,
    selectCharactersView,
    emitChatChanged,
}) {
    if (isGenerationInProgress()) {
        onGenerationBlocked?.();
        return false;
    }

    await waitForPendingChatSave();
    await clearCurrentChat();
    resetSelectionState();
    selectCharactersView?.();
    await emitChatChanged?.();
    return true;
}
