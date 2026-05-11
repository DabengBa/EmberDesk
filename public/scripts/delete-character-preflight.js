/**
 * Performs the delete-only chat close preflight.
 * It preserves the save/generation safety gates and low-level cleanup,
 * but intentionally skips the heavier chat transition work that would
 * trigger welcome-screen hydration before the delete request.
 *
 * @param {object} dependencies
 * @param {() => boolean} dependencies.isGenerationInProgress
 * @param {() => void} [dependencies.onGenerationBlocked]
 * @param {() => Promise<void>} dependencies.waitForPendingChatSave
 * @param {() => Promise<void>} dependencies.clearCurrentChat
 * @param {() => void} dependencies.resetSelectedGroup
 * @param {() => void} dependencies.resetSelectionState
 * @param {() => void} [dependencies.selectCharactersView]
 * @param {() => void} [dependencies.suppressWelcomeScreen]
 * @param {() => Promise<void>} [dependencies.emitChatChanged]
 * @returns {Promise<boolean>}
 */
export async function runDeleteCharacterClosePreflight({
    isGenerationInProgress,
    onGenerationBlocked,
    waitForPendingChatSave,
    clearCurrentChat,
    resetSelectedGroup,
    resetSelectionState,
    selectCharactersView,
    suppressWelcomeScreen,
    emitChatChanged,
}) {
    if (isGenerationInProgress()) {
        onGenerationBlocked?.();
        return false;
    }

    await waitForPendingChatSave();
    await clearCurrentChat();
    resetSelectedGroup();
    resetSelectionState();
    selectCharactersView?.();
    suppressWelcomeScreen?.();
    await emitChatChanged?.();
    return true;
}
