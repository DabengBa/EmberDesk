/**
 * Resolves current character ids to stable avatar keys.
 *
 * @param {Array<{avatar?: string}>} characters
 * @param {number[]} characterIds
 * @returns {string[]}
 */
export function resolveCharacterAvatarsByIds(characters, characterIds) {
    return characterIds
        .map(id => characters[id]?.avatar)
        .filter(avatar => typeof avatar === 'string' && avatar.length > 0);
}

/**
 * Resolves avatar keys to delete candidates while preserving explicit keys
 * that are no longer present in the local character list.
 *
 * @param {Array<{avatar?: string}>} characters
 * @param {string[]} avatars
 * @returns {{avatar: string, character: object|null, index: number}[]}
 */
export function getCharacterDeleteCandidates(characters, avatars) {
    return avatars
        .filter(avatar => typeof avatar === 'string' && avatar.length > 0)
        .map(avatar => {
            const index = characters.findIndex(character => character?.avatar === avatar);
            return {
                avatar,
                character: index === -1 ? null : characters[index],
                index,
            };
        });
}

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
