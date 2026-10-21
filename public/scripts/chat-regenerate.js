/**
 * Framework-neutral "regenerate the current turn" logic.
 *
 * "Current turn" = the generated tail after the last user message. A
 * regenerate removes ONLY generated artifacts from that tail — assistant
 * replies, tool/pipeline cards, generation recovery rows — then re-runs
 * normal generation against the same context. Manually inserted rows
 * (slash-command assistant/narrator notes, generic system notices) stop the
 * scan so user-authored content is never silently deleted.
 *
 * UI/DOM/state mutation lives in the callers (script.js / generation-service);
 * this module only decides which indexes belong to the turn.
 */

const DEFAULT_NARRATOR_TYPE = 'narrator';
const MANUAL_API = 'manual';

/**
 * @param {object} message Chat message candidate
 * @param {object} [options] Options
 * @param {string} [options.narratorType] extra.type marker for narrator rows
 * @returns {boolean} Whether the message is a generated artifact the
 *          regenerate tail-removal may discard.
 */
export function isRegenerateRemovableMessage(message, { narratorType = DEFAULT_NARRATOR_TYPE } = {}) {
    if (!message || typeof message !== 'object') {
        return false;
    }
    if (message.is_user) {
        return false;
    }
    if (message.is_system) {
        // Only tool/pipeline cards are disposable; other system rows are
        // user-visible notes placed on purpose.
        return Array.isArray(message.extra?.tool_invocations);
    }
    if (message.extra?.type === narratorType || message.extra?.api === MANUAL_API) {
        return false;
    }
    return true;
}

/**
 * Finds the first index of the current turn's removable tail, scanning back
 * from the end. Stops at the last user message or the first non-removable
 * (user-authored/system) message.
 * @param {object[]} chat Chat history
 * @param {object} [options] Options (see isRegenerateRemovableMessage)
 * @returns {number} Index where the removable tail begins. Equals chat.length
 *          when the last message is a user message or nothing is removable
 *          (both mean "generate a fresh reply without deleting anything").
 */
export function findRegenerateTurnStart(chat, options = {}) {
    let start = Array.isArray(chat) ? chat.length : 0;
    while (start > 0 && isRegenerateRemovableMessage(chat[start - 1], options)) {
        start -= 1;
    }
    return start;
}

/**
 * Snapshots the current turn's removable tail for a regenerate. The snapshot
 * is deep — later mutation of the chat must not corrupt the restore copy.
 * @param {object[]} chat Chat history
 * @param {object} [options] Options
 * @param {string|null} [options.chatId] Chat identifier captured for restore-time validation
 * @param {string} [options.narratorType] extra.type marker for narrator rows
 * @returns {{ chatId: string|null, insertIndex: number, messages: object[] }}
 */
export function collectRegenerateTurn(chat, { chatId = null, narratorType = DEFAULT_NARRATOR_TYPE } = {}) {
    const insertIndex = findRegenerateTurnStart(chat, { narratorType });
    const messages = Array.isArray(chat)
        ? chat.slice(insertIndex).map(message => structuredClone(message))
        : [];
    return { chatId: chatId ?? null, insertIndex, messages };
}
