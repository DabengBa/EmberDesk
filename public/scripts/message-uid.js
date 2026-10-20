/**
 * Session-scoped message identity for React row keys and frame ownership.
 *
 * Message objects in `chat[]` keep their object identity across splice,
 * reorder, and in-place edits (mes/extra mutation), so a WeakMap gives every
 * message a stable uid for the lifetime of the loaded chat without touching
 * the persisted data model. Indices remain the command-addressing surface;
 * uids are rendering identity only.
 */

const messageUids = new WeakMap();
let uidCounter = 0;

/**
 * Returns a session-stable uid for a chat message object.
 * @param {unknown} message Stored chat message
 * @returns {string} Stable uid, or '' for non-object input
 */
export function getMessageUid(message) {
    if (!message || typeof message !== 'object') {
        return '';
    }

    let uid = messageUids.get(message);
    if (!uid) {
        uid = `m${(uidCounter++).toString(36)}x${Math.random().toString(36).slice(2, 10)}`;
        messageUids.set(message, uid);
    }
    return uid;
}
