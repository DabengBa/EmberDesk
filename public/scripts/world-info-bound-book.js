/**
 * Resolves a character card's bound World Info book to a book that can be
 * opened in the focused editor. Shared by the React authoring panel (to decide
 * whether the "open bound book" action is available) and the authoring bridge
 * command, so both agree on exactly one book name.
 *
 * @param {unknown} boundName the card's bound book name (`extensions.world`)
 * @param {string[]|undefined|null} worldNames available world book file names
 * @returns {string} the openable book name, or '' when there is nothing valid
 */
export function resolveBoundWorldInfoBookName(boundName, worldNames) {
    const name = typeof boundName === 'string' ? boundName.trim() : '';
    if (!name || !Array.isArray(worldNames)) {
        return '';
    }
    return worldNames.includes(name) ? name : '';
}

/**
 * Opens the card's bound World Info book in the focused editor. There is no
 * fallback: when the binding is absent or dangling nothing opens at all.
 *
 * @param {object} options
 * @param {unknown} options.boundName the card's bound book name
 * @param {string[]|undefined|null} options.worldNames available book names
 * @param {(worldName: string) => unknown} options.openEditor focused book opener
 * @returns {Promise<string>} the opened book name, or '' when nothing opened
 */
export async function openBoundWorldInfoBook({ boundName, worldNames, openEditor }) {
    const worldName = resolveBoundWorldInfoBookName(boundName, worldNames);
    if (!worldName) {
        return '';
    }
    await openEditor(worldName);
    return worldName;
}
