'use strict';

import {
    characterGroupOverlay,
    characters,
    getCharacters,
    default_avatar,
    getThumbnailUrl,
    deleteCharacter,
    stopGeneration,
    is_send_press,
    this_chid,
    name2,
    neutralCharacterName,
    syncReactCharacterLibraryToolbarState,
} from '../script.js';

import { eventSource, event_types } from './events.js';
import { getRequestHeaders } from './request-context.js';
import { favsToHotswap } from './RossAscends-mods.js';
import { loader } from './action-loader.js';
import { POPUP_TYPE, POPUP_RESULT, Popup } from './popup.js';
import { buildCascadeSectionHtml, captureCascadeChoices } from './world-cascade-dialog.js';
import { waitUntilCondition } from './utils.js';
import { debounce_timeout } from './constants.js';
import { createBulkTagEditorRuntime, openCharacterTagManager } from './tags.js';
import { loadWorkspacePanelsModule } from './workspace-panels-react-bridge.js';
import { t } from './i18n.js';

/**
 * Static object representing the actions of the
 * character context menu override.
 */
class CharacterContextMenu {
    /**
     * The overlay instance, captured on construction for Escape handling.
     * @type {BulkEditOverlay?}
     */
    static #overlay = null;

    /**
     * Element focused before the menu opened, for focus restoration.
     * @type {HTMLElement?}
     */
    static #lastFocus = null;

    /**
     * Keyboard support while the menu is open: Escape closes, arrows move.
     * @param {KeyboardEvent} event
     */
    static #onKeydown = (event) => {
        const contextMenu = document.getElementById(BulkEditOverlay.contextMenuId);
        if (!contextMenu || contextMenu.classList.contains('hidden')) {
            return;
        }

        // A modal layer above the menu (native popup or bulk tag popup) owns Escape.
        if (document.querySelector('dialog[open], #bulk_tag_shadow_popup')) {
            return;
        }

        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            CharacterContextMenu.#overlay?.closeContextMenu();
            return;
        }

        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
            return;
        }

        const buttons = [...contextMenu.querySelectorAll('button')];
        if (!buttons.length) {
            return;
        }

        event.preventDefault();
        const currentIndex = buttons.indexOf(document.activeElement);
        const step = event.key === 'ArrowDown' ? 1 : -1;
        const nextIndex = currentIndex === -1
            ? (step === 1 ? 0 : buttons.length - 1)
            : (currentIndex + step + buttons.length) % buttons.length;
        buttons[nextIndex].focus();
    };

    /**
     * Tag one or more characters,
     * opens a popup.
     *
     * @param {Array<number>} selectedCharacters
     */
    static tag = (selectedCharacters) => {
        characterGroupOverlay.bulkTagPopupHandler.show(selectedCharacters);
    };

    /**
     * Duplicate one or more characters
     *
     * @param {number} characterId
     * @returns {Promise<any>}
     */
    static duplicate = async (characterId) => {
        const character = CharacterContextMenu.#getCharacter(characterId);
        const body = { avatar_url: character.avatar };

        const result = await fetch('/api/characters/duplicate', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify(body),
        });

        if (!result.ok) {
            throw new Error('Character not duplicated');
        }

        const data = await result.json();
        await eventSource.emit(event_types.CHARACTER_DUPLICATED, { oldAvatar: body.avatar_url, newAvatar: data.path });
    };

    /**
     * Favorite a character. The list refresh after the bulk operation owns
     * the visible favorite state; the original numeric row may have moved.
     *
     * @param {number} characterId
     * @returns {Promise<void>}
     */
    static favorite = async (characterId) => {
        const character = CharacterContextMenu.#getCharacter(characterId);
        const newFavState = !character.data.extensions.fav;

        const data = {
            name: character.name,
            avatar: character.avatar,
            data: {
                extensions: {
                    fav: newFavState,
                },
            },
            fav: newFavState,
        };

        const mergeResponse = await fetch('/api/characters/merge-attributes', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify(data),
        });

        if (!mergeResponse.ok) {
            mergeResponse.json().then(json => toastr.error(`Character not saved. Error: ${json.message}. Field: ${json.error}`));
            return;
        }
        const current = characters.find(item => item?.avatar === data.avatar);
        if (current) {
            current.fav = newFavState;
            current.data.extensions.fav = newFavState;
            void syncReactCharacterLibraryToolbarState();
        }
    };

    /**
     * Delete one or more characters,
     * opens a popup.
     *
     * @param {string|string[]} characterKey
     * @param {boolean} [deleteChats]
     * @returns {Promise<void>}
     */
    static delete = async (characterKey, deleteChats = false) => {
        await deleteCharacter(characterKey, { deleteChats: deleteChats });
    };

    static #getCharacter = (characterId) => characters[characterId] ?? null;

    /**
     * Show the context menu at the given position
     *
     * @param positionX
     * @param positionY
     */
    static show = (positionX, positionY) => {
        let contextMenu = document.getElementById(BulkEditOverlay.contextMenuId);
        contextMenu.style.left = `${positionX}px`;
        contextMenu.style.top = `${positionY}px`;

        document.getElementById(BulkEditOverlay.contextMenuId).classList.remove('hidden');

        // Adjust position if context menu is outside of viewport
        const boundingRect = contextMenu.getBoundingClientRect();
        if (boundingRect.right > window.innerWidth) {
            contextMenu.style.left = `${positionX - (boundingRect.right - window.innerWidth)}px`;
        }
        if (boundingRect.bottom > window.innerHeight) {
            contextMenu.style.top = `${positionY - (boundingRect.bottom - window.innerHeight)}px`;
        }

        CharacterContextMenu.#lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        document.addEventListener('keydown', CharacterContextMenu.#onKeydown, true);
        contextMenu.querySelector('button')?.focus();
    };

    /**
     * Hide the context menu
     */
    static hide = () => {
        const contextMenu = document.getElementById(BulkEditOverlay.contextMenuId);
        contextMenu.classList.add('hidden');
        document.removeEventListener('keydown', CharacterContextMenu.#onKeydown, true);
        if (contextMenu.contains(document.activeElement)) {
            CharacterContextMenu.#lastFocus?.focus();
        }
    };

    /**
     * Sets up the context menu for the given overlay
     *
     * @param characterGroupOverlay
     */
    constructor(characterGroupOverlay) {
        CharacterContextMenu.#overlay = characterGroupOverlay;
        const contextMenuItems = [
            { id: 'character_context_menu_favorite', callback: characterGroupOverlay.handleContextMenuFavorite },
            { id: 'character_context_menu_duplicate', callback: characterGroupOverlay.handleContextMenuDuplicate },
            { id: 'character_context_menu_delete', callback: characterGroupOverlay.handleContextMenuDelete },
            { id: 'character_context_menu_tag', callback: characterGroupOverlay.handleContextMenuTag },
        ];

        contextMenuItems.forEach(contextMenuItem => document.getElementById(contextMenuItem.id).addEventListener('click', contextMenuItem.callback));
    }
}

/**
 * Represents a tag control not bound to a single character
 */
class BulkTagPopupHandler {
    #previousFocus = null;
    #escapeListener = null;
    #popup = null;
    #cleanup = null;
    #generation = 0;
    #pendingTagActions = 0;

    get isBusy() {
        return this.#popup !== null || this.#pendingTagActions > 0;
    }

    /**
     * Wraps a tag command so refresh stays blocked while it runs and idle is
     * reported when it settles. A confirmation dialog can outlive the popup,
     * so the counter keeps refresh blocked after hide() until the command
     * finishes.
     *
     * @param {function(...any): any} command
     * @returns {function(...any): any}
     */
    #trackCommand(command) {
        return (...args) => {
            this.#pendingTagActions++;
            let settled = false;
            const settle = () => {
                if (settled) return;
                settled = true;
                this.#pendingTagActions = Math.max(0, this.#pendingTagActions - 1);
                window.dispatchEvent(new Event('character-library-bulk-idle'));
            };
            let result;
            try {
                result = command(...args);
            } catch (error) {
                settle();
                throw error;
            }
            if (result && typeof result.then === 'function') {
                return result.finally(settle);
            }
            settle();
            return result;
        };
    }

    /**
     * Keeps the runtime's snapshot/subscription but tracks every command.
     *
     * @param {object} runtime
     * @returns {object}
     */
    #trackRuntime(runtime) {
        const commands = Object.fromEntries(Object.entries(runtime.commands).map(([key, command]) => [key, this.#trackCommand(command)]));
        return { ...runtime, commands };
    }

    /** @param {number[]} characterIds */
    async show(characterIds) {
        const selected = characterIds.map(id => ({ id, character: characters[id] })).filter(entry => entry.character?.avatar);
        if (!selected.length) return;
        this.hide();
        const generation = ++this.#generation;
        const avatarKeys = selected.map(entry => entry.character.avatar);
        const avatars = selected.map(({ id, character }) => ({
            id: String(id), name: character.name, isFav: Boolean(character.data?.extensions?.fav),
            url: character.avatar === 'none' ? default_avatar : getThumbnailUrl('avatar', character.avatar),
        }));
        this.#previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const popup = document.createElement('div');
        popup.id = 'bulk_tag_shadow_popup';
        const body = document.createElement('div');
        body.id = 'bulk_tag_popup';
        body.className = 'wider_dialogue_popup';
        body.setAttribute('role', 'dialog');
        body.setAttribute('aria-modal', 'true');
        body.setAttribute('aria-labelledby', 'bulk_tag_popup_title');
        popup.append(body);
        document.body.append(popup);
        this.#popup = popup;
        this.#escapeListener = event => {
            if (event.key === 'Escape' && !document.querySelector('dialog[open]')) {
                event.stopPropagation();
                this.hide();
            }
        };
        document.addEventListener('keydown', this.#escapeListener);
        try {
            const panels = await loadWorkspacePanelsModule();
            if (generation !== this.#generation || this.#popup !== popup) return;
            this.#cleanup = panels.mountBulkTagEditor(body, {
                runtime: this.#trackRuntime(createBulkTagEditorRuntime(avatarKeys)),
                avatars,
                onClose: () => this.hide(),
                onOpenTagManager: () => void openCharacterTagManager(),
            });
            body.querySelector('#bulkTagInput')?.focus();
        } catch (error) {
            console.error('Failed to open bulk tag editor', error);
            toastr.error(t`Could not open tag editor.`);
            this.hide();
        }
    }

    hide() {
        ++this.#generation;
        if (this.#escapeListener) document.removeEventListener('keydown', this.#escapeListener);
        this.#escapeListener = null;
        const hadFocus = this.#popup?.contains(document.activeElement);
        this.#cleanup?.();
        this.#cleanup = null;
        this.#popup?.remove();
        this.#popup = null;
        if (hadFocus) this.#previousFocus?.focus();
        this.#previousFocus = null;
        // Pending tag commands may still be waiting on a confirmation; the
        // handler reports idle again when they settle.
        window.dispatchEvent(new Event('character-library-bulk-idle'));
    }
}


class BulkEditOverlayState {
    /**
     *
     * @type {number}
     */
    static browse = 0;

    /**
     *
     * @type {number}
     */
    static select = 1;
}

/**
 * Implement a SingletonPattern, allowing access to the group overlay instance
 * from everywhere via (new CharacterGroupOverlay())
 *
 * @type {Readonly<BulkEditOverlay>}
 */
let bulkEditOverlayInstance = null;

class BulkEditOverlay {
    static containerId = 'rm_print_characters_block';
    static contextMenuId = 'character_context_menu';
    static characterClass = 'character_select';
    static bogusFolderClass = 'bogus_folder_select';
    static selectModeClass = 'group_overlay_mode_select';
    static selectedClass = 'character_selected';
    static legacySelectedClass = 'bulk_select_checkbox';
    static bulkSelectedCountId = 'bulkSelectedCount';
    static bulkDeleteButtonId = 'bulkDeleteButton';

    static longPressDelay = 2500;

    #state = BulkEditOverlayState.browse;
    #pendingState = BulkEditOverlayState.browse;
    #longPress = false;
    #stateChangeCallbacks = [];
    #selectedCharacters = [];
    #bulkTagPopupHandler = new BulkTagPopupHandler();

    /**
     * @typedef {object} LastSelected - An object noting the last selected character and its state.
     * @property {number} [characterId] - The character id of the last selected character.
     * @property {boolean} [select] - The selected state of the last selected character. <c>true</c> if it was selected, <c>false</c> if it was deselected.
     */

    /**
     * @type {LastSelected} - An object noting the last selected character and its state.
     */
    lastSelected = { characterId: undefined, select: undefined };

    /**
     * Locks other pointer actions when the context menu is open
     *
     * @type {boolean}
     */
    #contextMenuOpen = false;

    /**
     * Whether the next character select should be skipped
     *
     * @type {boolean}
     */
    #cancelNextToggle = false;

    /**
     * Resolved lazily: #rm_print_characters_block is React-mounted after
     * module eval, so a constructor capture would freeze null.
     * @type HTMLElement
     */
    get container() {
        return document.getElementById(BulkEditOverlay.containerId);
    }

    get state() {
        return this.#state;
    }

    set state(newState) {
        if (this.#pendingState === newState) return;

        this.#pendingState = newState;
        eventSource.emit(event_types.CHARACTER_GROUP_OVERLAY_STATE_CHANGE_BEFORE, newState)
            .then(() => {
                if (this.#pendingState !== newState) return;
                this.#state = newState;
                eventSource.emit(event_types.CHARACTER_GROUP_OVERLAY_STATE_CHANGE_AFTER, this.state);
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new Event('character-library-bulk-idle'));
                }
            });
    }

    get isRealtimeRefreshBlocked() {
        return this.#state === BulkEditOverlayState.select
            || this.#pendingState === BulkEditOverlayState.select
            || this.#bulkTagPopupHandler.isBusy;
    }

    get isLongPress() {
        return this.#longPress;
    }

    set isLongPress(longPress) {
        this.#longPress = longPress;
    }

    get stateChangeCallbacks() {
        return this.#stateChangeCallbacks;
    }

    /**
     *
     * @returns {number[]}
     */
    get selectedCharacters() {
        return this.#selectedCharacters;
    }

    /**
     * The instance of the bulk tag popup handler that handles tagging of all selected characters
     *
     * @returns {BulkTagPopupHandler}
     */
    get bulkTagPopupHandler() {
        return this.#bulkTagPopupHandler;
    }

    constructor() {
        if (bulkEditOverlayInstance instanceof BulkEditOverlay)
            return bulkEditOverlayInstance;

        eventSource.on(event_types.CHARACTER_GROUP_OVERLAY_STATE_CHANGE_AFTER, this.handleStateChange);
        bulkEditOverlayInstance = Object.freeze(this);
    }

    /**
     * Set the overlay to browse mode
     */
    browseState = () => this.state = BulkEditOverlayState.browse;

    /**
     * Set the overlay to select mode
     */
    selectState = () => this.state = BulkEditOverlayState.select;

    /**
     * Set up a Sortable grid for the loaded page
     */
    onPageLoad = () => {
        if (this.state !== BulkEditOverlayState.select) {
            this.browseState();
        }

        const elements = this.#getEnabledElements();
        elements.forEach(element => element.addEventListener('touchstart', this.handleHold));
        elements.forEach(element => element.addEventListener('mousedown', this.handleHold));
        elements.forEach(element => element.addEventListener('contextmenu', this.handleDefaultContextMenu));

        elements.forEach(element => element.addEventListener('touchend', this.handleLongPressEnd));
        elements.forEach(element => element.addEventListener('mouseup', this.handleLongPressEnd));
        elements.forEach(element => element.addEventListener('dragend', this.handleLongPressEnd));
        elements.forEach(element => element.addEventListener('touchmove', this.handleLongPressEnd));

        if (this.state === BulkEditOverlayState.select) {
            this.#disableClickEventsForCharacters();
            this.updateSelectedCount();
        }

        // Cohee: It only triggers when clicking on a margin between the elements?
        // Feel free to fix or remove this, I'm not sure how to.
        //this.container.addEventListener('click', this.handleCancelClick);
    };

    /**
     * Handle state changes
     *
     *
     */
    handleStateChange = () => {
        switch (this.state) {
            case BulkEditOverlayState.browse:
                this.container.classList.remove(BulkEditOverlay.selectModeClass);
                this.#contextMenuOpen = false;
                this.#enableClickEventsForCharacters();
                this.clearSelectedCharacters();
                this.disableContextMenu();
                this.#disableBulkEditButtonHighlight();
                CharacterContextMenu.hide();
                break;
            case BulkEditOverlayState.select:
                this.container.classList.add(BulkEditOverlay.selectModeClass);
                this.#disableClickEventsForCharacters();
                this.enableContextMenu();
                this.#enableBulkEditButtonHighlight();
                break;
        }

        this.stateChangeCallbacks.forEach(callback => callback(this.state));
    };

    /**
     * Block the browsers native context menu and
     * set a click event to hide the custom context menu.
     */
    enableContextMenu = () => {
        this.container.addEventListener('contextmenu', this.handleContextMenuShow);
        document.addEventListener('click', this.handleContextMenuHide);
    };

    /**
     * Remove event listeners, allowing the native browser context
     * menu to be opened.
     */
    disableContextMenu = () => {
        this.container.removeEventListener('contextmenu', this.handleContextMenuShow);
        document.removeEventListener('click', this.handleContextMenuHide);
    };

    handleDefaultContextMenu = (event) => {
        if (this.isLongPress) {
            event.preventDefault();
            event.stopPropagation();
            return false;
        }
    };

    /**
     * Opens menu on long-press.
     *
     * @param event - Pointer event
     */
    handleHold = (event) => {
        if (0 !== event.button && event.type !== 'touchstart') return;
        if (this.#contextMenuOpen) {
            this.#contextMenuOpen = false;
            this.#cancelNextToggle = true;
            CharacterContextMenu.hide();
            return;
        }

        let cancel = false;

        const cancelHold = (_event) => cancel = true;
        this.container.addEventListener('mouseup', cancelHold);
        this.container.addEventListener('touchend', cancelHold);

        this.isLongPress = true;

        setTimeout(() => {
            if (this.isLongPress && !cancel) {
                if (this.state === BulkEditOverlayState.browse) {
                    this.selectState();
                } else if (this.state === BulkEditOverlayState.select) {
                    this.#contextMenuOpen = true;
                    const [x, y] = this.#getContextMenuPosition(event);
                    CharacterContextMenu.show(x, y);
                }
            }

            this.container.removeEventListener('mouseup', cancelHold);
            this.container.removeEventListener('touchend', cancelHold);
        }, BulkEditOverlay.longPressDelay);
    };

    handleLongPressEnd = (event) => {
        this.isLongPress = false;
        if (this.#contextMenuOpen) event.stopPropagation();
    };

    handleCancelClick = () => {
        if (false === this.#contextMenuOpen) this.state = BulkEditOverlayState.browse;
        this.#contextMenuOpen = false;
    };

    /**
     * Returns the position of the mouse/touch location
     *
     * @param event
     * @returns {(boolean|number|*)[]}
     */
    #getContextMenuPosition = (event) => [
        event.clientX || event.touches[0].clientX,
        event.clientY || event.touches[0].clientY,
    ];

    #enableClickEventsForCharacters = () => this.#getEnabledElements().forEach(element => element.removeEventListener('click', this.toggleCharacterSelected));

    #disableClickEventsForCharacters = () => this.#getEnabledElements().forEach(element => element.addEventListener('click', this.toggleCharacterSelected));

    #enableBulkEditButtonHighlight = () => document.getElementById('bulkEditButton').classList.add('bulk_edit_overlay_active');

    #disableBulkEditButtonHighlight = () => document.getElementById('bulkEditButton').classList.remove('bulk_edit_overlay_active');

    #getEnabledElements = () => [...this.container.getElementsByClassName(BulkEditOverlay.characterClass)];

    toggleCharacterSelected = event => {
        event.stopPropagation();

        const character = event.currentTarget;

        if (!this.#contextMenuOpen && !this.#cancelNextToggle) {
            if (event.shiftKey) {
                // Shift click might have selected text that we don't want to. Unselect it.
                document.getSelection().removeAllRanges();

                this.handleShiftClick(character);
            } else {
                this.toggleSingleCharacter(character);
            }
        }

        this.#cancelNextToggle = false;
    };

    /**
     * When shift click was held down, this function handles the multi select of characters in a single click.
     *
     * If the last clicked character was deselected, and the current one was deselected too, it will deselect all currently selected characters between those two.
     * If the last clicked character was selected, and the current one was selected too, it will select all currently not selected characters between those two.
     * If the states do not match, nothing will happen.
     *
     * @param {HTMLElement} currentCharacter - The html element of the currently toggled character
     */
    handleShiftClick = (currentCharacter) => {
        const characterId = Number(currentCharacter.getAttribute('data-chid'));
        const select = !this.selectedCharacters.includes(characterId);

        if (this.lastSelected.characterId >= 0 && this.lastSelected.select !== undefined) {
            // Only if select state and the last select state match we execute the range select
            if (select === this.lastSelected.select) {
                this.toggleCharactersInRange(currentCharacter, select);
            }
        }
    };

    /**
     * Toggles the selection of a given characters
     *
     * @param {HTMLElement} character - The html element of a character
     * @param {object} param1 - Optional params
     * @param {boolean} [param1.markState] - Whether the toggle of this character should be remembered as the last done toggle
     */
    toggleSingleCharacter = (character, { markState = true } = {}) => {
        const characterId = Number(character.getAttribute('data-chid'));

        const select = !this.selectedCharacters.includes(characterId);
        if (select) {
            this.#selectedCharacters.push(characterId);
        } else {
            this.#selectedCharacters = this.#selectedCharacters.filter(item => characterId !== item);
        }

        this.updateSelectedCount();

        if (markState) {
            this.lastSelected.characterId = characterId;
            this.lastSelected.select = select;
        }
    };

    /**
     * Updates the selected count element with the current count
     *
     * @param {number} [countOverride] - optional override for a manual number to set
     */
    updateSelectedCount = () => {
        void syncReactCharacterLibraryToolbarState();
    };

    /**
     * Toggles the selection of characters in a given range.
     * The range is provided by the given character and the last selected one remembered in the selection state.
     *
     * @param {HTMLElement} currentCharacter - The html element of the currently toggled character
     * @param {boolean} select - <c>true</c> if the characters in the range are to be selected, <c>false</c> if deselected
     */
    toggleCharactersInRange = (currentCharacter, select) => {
        const currentCharacterId = Number(currentCharacter.getAttribute('data-chid'));
        const characters = Array.from(document.querySelectorAll('#' + BulkEditOverlay.containerId + ' .' + BulkEditOverlay.characterClass));

        const startIndex = characters.findIndex(c => Number(c.getAttribute('data-chid')) === Number(this.lastSelected.characterId));
        const endIndex = characters.findIndex(c => Number(c.getAttribute('data-chid')) === currentCharacterId);

        for (let i = Math.min(startIndex, endIndex); i <= Math.max(startIndex, endIndex); i++) {
            const character = characters[i];
            const characterId = Number(character.getAttribute('data-chid'));
            const isCharacterSelected = this.selectedCharacters.includes(characterId);

            // Only toggle the character if it wasn't on the state we have are toggling towards.
            // Also doing a weird type check, because typescript checker doesn't like the return of 'querySelectorAll'.
            if ((select && !isCharacterSelected || !select && isCharacterSelected) && character instanceof HTMLElement) {
                this.toggleSingleCharacter(character, { markState: currentCharacterId == characterId });
            }
        }
    };

    handleContextMenuShow = (event) => {
        event.preventDefault();
        const [x, y] = this.#getContextMenuPosition(event);
        CharacterContextMenu.show(x, y);
        this.#contextMenuOpen = true;
    };

    handleContextMenuHide = (event) => {
        let contextMenu = document.getElementById(BulkEditOverlay.contextMenuId);
        if (false === contextMenu.contains(event.target)) {
            this.closeContextMenu();
        }
    };

    /**
     * Closes the context menu and clears the open flag.
     * Used by click-outside and by the menu's own Escape handling.
     */
    closeContextMenu = () => {
        CharacterContextMenu.hide();
        this.#contextMenuOpen = false;
    };

    /**
     * Concurrently handle character favorite requests.
     *
     * @returns {Promise<void>}
     */
    handleContextMenuFavorite = async () => {
        const promises = [];

        for (const characterId of this.selectedCharacters) {
            promises.push(CharacterContextMenu.favorite(characterId));
        }

        await Promise.allSettled(promises);
        await getCharacters();
        await favsToHotswap();
        this.browseState();
    };

    /**
     * Concurrently handle character duplicate requests.
     *
     * @returns {Promise<number>}
     */
    handleContextMenuDuplicate = () => Promise.all(this.selectedCharacters.map(async characterId => CharacterContextMenu.duplicate(characterId)))
        .then(() => getCharacters())
        .then(() => this.browseState());

    /**
     * Builds the unified delete confirmation dialog HTML.
     *
     * @param {object} options
     * @param {number} options.count - Number of characters to delete
     * @param {string} options.nameTagsHtml - Pre-rendered character name tag HTML
     * @param {boolean} options.isTempChat - Whether the user is in a temporary chat
     * @param {string|null} options.cascadeHtml - World info cascade section HTML, or null
     * @returns {string}
     */
    static #buildUnifiedDeleteDialogHtml = ({ count, nameTagsHtml, isTempChat, cascadeHtml }) => {
        let html = `
            <h3>${t`Delete ${count} characters?`}</h3>
            <div class="delete-dialog-names">${nameTagsHtml}</div>
            <label class="delete-dialog-option" for="del_char_checkbox">
                <input type="checkbox" id="del_char_checkbox" checked />
                <span>${t`Also delete the chat files`}</span>
            </label>`;

        if (isTempChat) {
            html += `
            <div class="delete-dialog-info">
                <span>${t`temporary chat — unsaved messages will be lost`}</span>
            </div>`;
        }

        if (cascadeHtml) {
            html += cascadeHtml;
        }

        return html;
    };

    /**
     * Stops generation and waits for the send state to clear.
     *
     * @returns {Promise<boolean>} Whether generation was stopped
     */
    static #stopGenerationAndWait = async () => {
        if (is_send_press === false) return false;
        stopGeneration();
        try {
            await waitUntilCondition(() => is_send_press === false, debounce_timeout.extended, 10);
        } catch {
            // Timeout — proceed anyway, the toastr in closeCurrentChatForDelete is non-blocking
        }
        return true;
    };

    /**
     * Shows a unified delete confirmation dialog with character names,
     * inline info banners, and optional world info cascade section.
     *
     * @returns {Promise<void>}
     */
    handleContextMenuDelete = async () => {
        const snapshot = this.selectedCharacters
            .map(id => characters[id])
            .filter(character => typeof character?.avatar === 'string' && character.avatar.length > 0)
            .map(character => ({ avatar: character.avatar, name: character.name }));
        const avatarList = snapshot.map(character => character.avatar);
        const count = avatarList.length;
        if (count === 0) {
            return;
        }

        // 1. Detect state before showing dialog
        const inTempChat = this_chid === undefined && name2 === neutralCharacterName;

        // 2. Pre-fetch world info data (does NOT close chat or change state)
        let worldInfos = [];
        try {
            const resp = await fetch('/api/characters/delete-preflight', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({ avatars: avatarList }),
                cache: 'no-cache',
            });
            if (resp.ok) {
                const data = await resp.json();
                worldInfos = data.worldInfos ?? [];
            }
        } catch {
            // Preflight failure — degrade to dialog without world info section
        }

        // 3. Build dialog HTML
        const nameTagsHtml = snapshot
            .map(character => character.name)
            .filter(Boolean)
            .map(name => {
                const escaped = name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                return `<span class="tag">${escaped}</span>`;
            })
            .join('');
        const cascadeHtml = buildCascadeSectionHtml(worldInfos);
        const dialogHtml = BulkEditOverlay.#buildUnifiedDeleteDialogHtml({
            count,
            nameTagsHtml,
            isTempChat: inTempChat,
            cascadeHtml,
        });

        // 4. Configure popup
        let deleteChats = false;
        let capturedCascade = { deleteWorlds: [], clearWorldReferences: false };
        const hasWorldInfos = worldInfos.length > 0;

        const popup = new Popup(dialogHtml, POPUP_TYPE.CONFIRM, '', {
            okButton: t`Delete`,
            wider: true,
            leftAlign: true,
            defaultResult: POPUP_RESULT.NEGATIVE,
            customButtons: hasWorldInfos
                ? [{ text: t`Delete All`, result: POPUP_RESULT.CUSTOM1, classes: ['popup-button-danger'] }]
                : [],
            onClosing: () => {
                deleteChats = !!document.getElementById('del_char_checkbox')?.checked;
                capturedCascade = captureCascadeChoices();
                return true;
            },
            onOpen: (p) => {
                if (!hasWorldInfos) return;
                const btn = p.dlg.querySelector('[data-result="' + POPUP_RESULT.CUSTOM1 + '"]');
                if (btn) {
                    btn.addEventListener('click', () => {
                        const chatCb = document.getElementById('del_char_checkbox');
                        if (chatCb) chatCb.checked = true;
                        document.querySelectorAll('.world-cascade-checkbox').forEach((cb) => { cb.checked = true; });
                        p.complete(POPUP_RESULT.AFFIRMATIVE);
                    });
                }
            },
        });

        const result = await popup.show();
        if (!result) return;

        // 5. Execute deletion
        const loaderHandle = loader.show({
            slug: 'bulk-delete',
            title: t`Bulk Delete`,
            message: t`Deleting ${count} character(s)…`,
            toastMode: loader.ToastMode.STATIC,
        });

        try {
            await BulkEditOverlay.#stopGenerationAndWait();
            await deleteCharacter(avatarList, {
                deleteChats,
                deleteWorlds: capturedCascade.deleteWorlds,
                clearWorldReferences: capturedCascade.clearWorldReferences,
                temporaryChatAcknowledged: inTempChat,
                deleteContext: { source: 'bulk', selectedCount: count },
            });
            toastr.success(t`Deleted ${count} character(s)`);
        } finally {
            loaderHandle.hide();
            this.browseState();
        }
    };

    /**
     * Attaches and opens the tag menu
     */
    handleContextMenuTag = () => {
        CharacterContextMenu.tag(this.selectedCharacters);
        this.browseState();
    };

    addStateChangeCallback = callback => this.stateChangeCallbacks.push(callback);

    /**
     * Clears internal character storage and
     * removes visual highlight.
     */
    clearSelectedCharacters = () => {
        this.selectedCharacters.length = 0;
        void syncReactCharacterLibraryToolbarState();
    };
}

export { BulkEditOverlayState, CharacterContextMenu, BulkEditOverlay };
