/**
 * Removes characters from the provided list in place using avatar keys.
 *
 * @param {Array<{avatar?: string}>} characters
 * @param {string[]} avatars
 * @returns {Array<object>}
 */
export function removeCharactersFromState(characters, avatars) {
    const avatarSet = new Set(avatars);
    const removed = [];

    for (let index = characters.length - 1; index >= 0; index--) {
        if (!avatarSet.has(characters[index]?.avatar)) {
            continue;
        }

        const [character] = characters.splice(index, 1);
        removed.unshift(character);
    }

    return removed;
}
