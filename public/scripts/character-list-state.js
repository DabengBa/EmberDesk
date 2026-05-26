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

/**
 * Checks whether a character edit response should refresh the local character list entry.
 *
 * @param {Array<{avatar?: string}>} characters
 * @param {FormDataEntryValue|null} avatar
 * @returns {boolean}
 */
export function shouldRefreshCharacterAfterEdit(characters, avatar) {
    return typeof avatar === 'string'
        && avatar.length > 0
        && characters.some(character => character?.avatar === avatar);
}

/**
 * Updates the delete affordance for character bulk edit selection.
 *
 * @param {HTMLElement|null} deleteButton
 * @param {boolean} hasSelection
 * @param {{focus?: Function}|null} [fallbackFocusElement]
 * @returns {void}
 */
export function updateBulkDeleteButtonState(deleteButton, hasSelection, fallbackFocusElement = null) {
    if (!deleteButton) {
        return;
    }

    const isDisabled = !hasSelection;
    deleteButton.classList.toggle('disabled', isDisabled);
    deleteButton.setAttribute('aria-disabled', String(isDisabled));

    if (isDisabled) {
        deleteButton.setAttribute('tabindex', '-1');
        if (globalThis.document?.activeElement === deleteButton) {
            deleteButton.blur();
            fallbackFocusElement?.focus?.();
        }
        return;
    }

    deleteButton.setAttribute('tabindex', '0');
}

/**
 * Updates the visible bulk selection count and any actions tied to that count.
 *
 * @param {object} options
 * @param {HTMLElement|null} options.selectedCount
 * @param {HTMLElement|null} options.deleteButton
 * @param {HTMLElement|null} [options.fallbackFocusElement]
 * @param {number} count
 * @returns {void}
 */
export function updateBulkSelectionCountState({ selectedCount, deleteButton, fallbackFocusElement = null }, count) {
    updateBulkDeleteButtonState(deleteButton, count > 0, fallbackFocusElement);

    if (!selectedCount) {
        return;
    }

    selectedCount.textContent = `${count} selected`;
    selectedCount.setAttribute('title', `${count} characters selected`);
    selectedCount.setAttribute('aria-label', `${count} characters selected`);
}

/**
 * Synchronizes visible character rows with the persisted bulk selection model.
 * Hidden filtered-out rows stay selected in the model, but visible rows always
 * reflect the current model after sorting, filtering, or pagination redraws.
 *
 * @param {object} options
 * @param {{getElementsByClassName: Function}|null} options.container
 * @param {number[]} options.selectedCharacterIds
 * @param {string} [options.characterClass]
 * @param {string} [options.selectedClass]
 * @param {string} [options.checkboxClass]
 * @returns {number} Number of visible rows restored as selected
 */
export function syncBulkSelectionDomState({
    container,
    selectedCharacterIds,
    characterClass = 'character_select',
    selectedClass = 'character_selected',
    checkboxClass = 'bulk_select_checkbox',
}) {
    if (!container) {
        return 0;
    }

    const selectedIdSet = new Set(selectedCharacterIds.map(id => Number(id)));
    let visibleSelectedCount = 0;

    for (const character of container.getElementsByClassName(characterClass)) {
        const characterId = Number(character.getAttribute('data-chid'));
        const isSelected = selectedIdSet.has(characterId);
        const checkbox = character.querySelector('.' + checkboxClass);

        character.classList.toggle(selectedClass, isSelected);
        character.setAttribute('aria-selected', String(isSelected));
        if (checkbox) {
            checkbox.checked = isSelected;
        }
        if (isSelected) {
            visibleSelectedCount++;
        }
    }

    return visibleSelectedCount;
}
