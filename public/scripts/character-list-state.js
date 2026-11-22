import { translate } from './i18n.js';
import { getCharacterLibraryFetchErrorData, hasCharacterLibraryPayloadChanged, projectCharacterLibraryQueryAgainstDeletedAvatars } from './character-library-query-helpers.js';

/** Owns membership publication, refresh order, and realtime admission for the workspace list. */
export function createCharacterListLifecycle(deps) {
    const pendingDeletedCharacterAvatars = new Set();

    function projectCharacterLibraryCharactersAgainstPendingDeletes(queryCharacters) {
        const projection = projectCharacterLibraryQueryAgainstDeletedAvatars(
            queryCharacters,
            Array.from(pendingDeletedCharacterAvatars),
        );

        pendingDeletedCharacterAvatars.clear();
        for (const avatar of projection.pendingDeletedAvatars) {
            pendingDeletedCharacterAvatars.add(avatar);
        }

        return projection.characters;
    }

    function markPendingDeletion(avatars) {
        for (const avatar of avatars) {
            if (typeof avatar === 'string' && avatar.length > 0) pendingDeletedCharacterAvatars.add(avatar);
        }
    }

    async function publish(snapshot) {
        const characters = deps.getCharacters();
        const normalizedCharacters = projectCharacterLibraryCharactersAgainstPendingDeletes(snapshot);
        normalizedCharacters.forEach(deps.preserveLoadedCharacterChat);
        if (!hasCharacterLibraryPayloadChanged(characters, normalizedCharacters)) {
            return;
        }
        // Capture the active identity at the synchronous commit boundary, not when
        // the request began: the user may have completed another selection since.
        const previousAvatar = deps.getActiveAvatar();
        if (previousAvatar && !normalizedCharacters.some(character => character.avatar === previousAvatar)) {
            try {
                await deps.prepareChatTransition();
            } catch {
                return false;
            }
            if (deps.getActiveAvatar() !== previousAvatar) return publish(snapshot);
            await deps.warnMissingActive();
            if (deps.getActiveAvatar() !== previousAvatar) return publish(snapshot);
            try {
                await deps.prepareChatTransition();
            } catch {
                return false;
            }
            if (deps.getActiveAvatar() !== previousAvatar) return publish(snapshot);
            return deps.reload();
        }
        characters.splice(0, characters.length, ...normalizedCharacters);

        if (previousAvatar) {
            const newCharacterId = characters.findIndex(x => x.avatar === previousAvatar);
            if (newCharacterId >= 0) {
                deps.setCharacterId(newCharacterId);
                // Consumers that bind to character object identity must refresh
                // before an action can target the newly published objects.
                deps.publishSnapshotEvent();
                await deps.selectCharacterById(newCharacterId, { switchMenu: false });
            }
        } else {
            deps.publishSnapshotEvent();
        }

        // Membership changes (add/import/rename/delete fallback) reprint in
        // place: keep the current page and scroll offset so a single edit does
        // not yank the library back to page one. Page stays valid via the
        // clamp in renderCharacterListPage; navigation resets only happen on
        // the explicit select_rm_characters re-entry gesture.
        await deps.printCharacters(false);
    }

    let characterRefreshTail = Promise.resolve();

    function refresh({ reportStatus = false, required = false } = {}) {
        const refresh = characterRefreshTail.then(async () => {
            try {
                if (reportStatus && deps.isRealtimeRefreshBlocked()) return null;
                const snapshot = await deps.fetchSnapshot();
                // The user can enter bulk mode while the request is in flight.
                if (reportStatus && deps.isRealtimeRefreshBlocked()) return null;
                if (await publish(snapshot) === false) return reportStatus ? false : undefined;
                return reportStatus ? true : undefined;
            } catch (error) {
                console.error('Failed to fetch characters:', error);
                const errorData = getCharacterLibraryFetchErrorData(error);
                if (errorData?.overflow && !reportStatus) {
                    await deps.warnOverflow();
                }
                if (required) throw error;
                return reportStatus ? false : undefined;
            }
        });
        characterRefreshTail = refresh.catch(() => {});
        return refresh;
    }

    function startRealtime() {
        let source;
        let dirty = false;
        let running = false;
        let retry;
        let reconnect;
        let stopped = false;

        async function refreshRealtime() {
            if (running || stopped) return;
            running = true;
            try {
                while (dirty && !stopped) {
                    dirty = false;
                    const ok = await refresh({ reportStatus: true });
                    if (ok === null) {
                        dirty = true;
                        break;
                    }
                    if (!ok) {
                        dirty = true;
                        retry = setTimeout(() => { retry = undefined; void refreshRealtime(); }, 2000);
                        break;
                    }
                }
            } finally {
                running = false;
                if (dirty && !retry && !stopped && !deps.isRealtimeRefreshBlocked()) void refreshRealtime();
            }
        }

        function invalidate() {
            dirty = true;
            if (!retry) void refreshRealtime();
        }

        window.addEventListener('character-library-bulk-idle', () => {
            if (dirty && !retry && !deps.isRealtimeRefreshBlocked()) void refreshRealtime();
        });

        function connect() {
            stopped = false;
            const connection = new EventSource('/api/characters/events');
            source = connection;
            connection.addEventListener('ready', invalidate);
            connection.addEventListener('invalidate', invalidate);
            connection.addEventListener('error', () => {
                if (stopped || source !== connection || connection.readyState !== EventSource.CLOSED || reconnect) return;
                reconnect = setTimeout(() => {
                    reconnect = undefined;
                    if (!stopped) connect();
                }, 2000);
            });
        }

        window.addEventListener('pagehide', () => {
            stopped = true;
            source?.close();
            clearTimeout(retry);
            clearTimeout(reconnect);
            retry = undefined;
            reconnect = undefined;
        });
        window.addEventListener('pageshow', event => { if (event.persisted) connect(); });
        connect();
    }

    async function reconcileAfterDelete({ beforeSnapshot, deletedAvatars, deleteContext }) {
        removeCharactersFromState(deps.getCharacters(), deletedAvatars);
        const reconcileStartedAt = performance.now();
        const reconciled = await deps.reconcileAfterDelete({ beforeSnapshot, deletedAvatars, deleteContext });
        deps.markMetric('characterDeleteReconcileMs', performance.now() - reconcileStartedAt);
        if (!reconciled) {
            const printStartedAt = performance.now();
            // Fallback preserves the page and scroll just as incremental reconciliation does.
            await deps.printCharacters(false, { allowDuringCharacterDelete: true });
            deps.markMetric('characterPrintMs', performance.now() - printStartedAt);
        }
    }

    return { publish, refresh, startRealtime, markPendingDeletion, reconcileAfterDelete };
}

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

    selectedCount.textContent = getBulkSelectionShortCountText(count);
    selectedCount.setAttribute('title', `${count} characters selected`);
    selectedCount.setAttribute('aria-label', `${count} characters selected`);
}

/**
 * Returns the compact visible count used by the character-list toolbar.
 * Full semantics stay on title/aria-label because this label is intentionally short.
 *
 * @param {number} count
 * @returns {string}
 */
export function getBulkSelectionShortCountText(count) {
    return translate('${0} sel', null).replace('${0}', String(count));
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
        character.setAttribute('aria-checked', String(isSelected));
        if (checkbox) {
            checkbox.checked = isSelected;
            checkbox.setAttribute('aria-checked', String(isSelected));
        }
        if (isSelected) {
            visibleSelectedCount++;
        }
    }

    return visibleSelectedCount;
}
