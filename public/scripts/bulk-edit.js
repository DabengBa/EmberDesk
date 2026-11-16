import { requireCharacterLifecycleShellContext } from './character-lifecycle-shell-context.js';

const overlay = () => requireCharacterLifecycleShellContext().state.characterGroupOverlay;
const syncReactCharacterLibraryToolbarState = () => requireCharacterLifecycleShellContext().syncReactCharacterLibraryToolbarState();

function isReactCharacterLibraryOwner() {
    return document.getElementById('rm_print_characters_block')?.dataset.reactCharacterLibraryOwner === 'react';
}
import { BulkEditOverlay, BulkEditOverlayState, CharacterContextMenu } from './BulkEditOverlay.js';
import { event_types, eventSource } from './events.js';

let is_bulk_edit = false;

function guardBulkCheckboxClick(event) {
    if (event.target instanceof Element && event.target.closest('.bulk_select_checkbox')) {
        event.stopImmediatePropagation();
    }
}

const enableBulkEdit = () => {
    enableBulkSelect();
    overlay().selectState();
    // show the bulk edit option buttons
    document.querySelectorAll('.bulkEditOptionElement').forEach(element => {
        if (element.id !== 'bulkSelectedCount') element.style.display = '';
    });
    const selectedCount = document.getElementById('bulkSelectedCount');
    if (selectedCount) selectedCount.style.display = 'inline-flex';
    is_bulk_edit = true;
    overlay().updateSelectedCount(0);
    void syncReactCharacterLibraryToolbarState();
};

const disableBulkEdit = () => {
    disableBulkSelect();
    overlay().browseState();
    // hide the bulk edit option buttons
    document.querySelectorAll('.bulkEditOptionElement').forEach(element => { element.style.display = 'none'; });
    is_bulk_edit = false;
    overlay().updateSelectedCount(0);
    void syncReactCharacterLibraryToolbarState();
};

const toggleBulkEditMode = (isBulkEdit) => {
    if (isBulkEdit) {
        disableBulkEdit();
    } else {
        enableBulkEdit();
    }
};

/**
 * Toggles bulk edit mode on/off when the edit button is clicked.
 */
function onEditButtonClick() {
    console.log('Edit button clicked');
    toggleBulkEditMode(is_bulk_edit);
}

/**
 * Toggles the select state of all characters in bulk edit mode to selected. If all are selected, they'll be deselected.
 */
function onSelectAllButtonClick() {
    console.log('Bulk select all button clicked');
    const characters = Array.from(document.querySelectorAll('#' + BulkEditOverlay.containerId + ' .' + BulkEditOverlay.characterClass));
    let atLeastOneSelected = false;
    for (const character of characters) {
        const checked = Boolean(character.querySelector('.bulk_select_checkbox:checked'));
        if (!checked && character instanceof HTMLElement) {
            overlay().toggleSingleCharacter(character);
            atLeastOneSelected = true;
        }
    }

    if (!atLeastOneSelected) {
        // If none was selected, trigger click on all to deselect all of them
        for (const character of characters) {
            const checked = Boolean(character.querySelector('.bulk_select_checkbox:checked'));
            if (checked && character instanceof HTMLElement) {
                overlay().toggleSingleCharacter(character);
            }
        }
    }
}

/**
 * Deletes all characters that have been selected via the bulk checkboxes.
 */
async function onDeleteButtonClick() {
    console.log('Delete button clicked');
    if (document.getElementById('bulkDeleteButton')?.classList.contains('disabled')) {
        return;
    }

    // Reuse the overlay's delete flow; it also no-ops when selection is empty.
    await overlay().handleContextMenuDelete();
}

/**
 * Enables bulk selection by adding a checkbox next to each character.
 */
function enableBulkSelect() {
    // The React character library owns row markup and renders its own bulk
    // checkboxes from the bulkMode store snapshot; only the container class and
    // delegated click guard remain relevant here.
    if (!isReactCharacterLibraryOwner()) {
        document.querySelectorAll('#rm_print_characters_block .character_select').forEach(el => {
            // Prevent checkbox from adding multiple times (because of stage change callback)
            if (el.querySelector('.bulk_select_checkbox')) {
                return;
            }
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'bulk_select_checkbox';
            checkbox.setAttribute('aria-label', 'Select character for bulk edit');
            checkbox.setAttribute('aria-checked', 'false');
            checkbox.setAttribute('aria-describedby', 'bulkSelectionHint');
            el.setAttribute('role', 'checkbox');
            el.setAttribute('aria-selected', 'false');
            el.setAttribute('aria-checked', 'false');
            el.setAttribute('aria-describedby', 'bulkSelectionHint');
            el.prepend(checkbox);
        });
        document.querySelectorAll('#rm_print_characters_block.group_overlay_mode_select .bogus_folder_select')
            .forEach(element => element.classList.add('disabled'));
    }

    document.getElementById('rm_print_characters_block')?.classList.add('bulk_select');
    // We also need to disable the default click event for the character_select divs
    document.removeEventListener('click', guardBulkCheckboxClick);
    document.addEventListener('click', guardBulkCheckboxClick);
}

/**
 * Disables bulk selection by removing the checkboxes.
 */
function disableBulkSelect() {
    if (!isReactCharacterLibraryOwner()) {
        document.querySelectorAll('.bulk_select_checkbox').forEach(element => element.remove());
        document.querySelectorAll('#rm_print_characters_block .character_select').forEach(element => {
            for (const attribute of ['role', 'aria-selected', 'aria-checked', 'aria-describedby']) element.removeAttribute(attribute);
        });
        document.querySelectorAll('#rm_print_characters_block.group_overlay_mode_select .bogus_folder_select')
            .forEach(element => element.classList.remove('disabled'));
    }
    document.getElementById('rm_print_characters_block')?.classList.remove('bulk_select');
    document.removeEventListener('click', guardBulkCheckboxClick);
}

/**
 * Entry point that runs on page load.
 */
export function initBulkEdit() {
    overlay().addStateChangeCallback((state) => {
        if (state === BulkEditOverlayState.select) enableBulkEdit();
        if (state === BulkEditOverlayState.browse) disableBulkEdit();
    });

    document.getElementById('bulkEditButton')?.addEventListener('click', onEditButtonClick);
    document.getElementById('bulkSelectAllButton')?.addEventListener('click', onSelectAllButtonClick);
    document.getElementById('bulkDeleteButton')?.addEventListener('click', onDeleteButtonClick);

    const characterContextMenu = new CharacterContextMenu(overlay());
    eventSource.on(event_types.CHARACTER_PAGE_LOADED, () => {
        if (is_bulk_edit) {
            enableBulkSelect();
        }
        overlay().onPageLoad();
        void syncReactCharacterLibraryToolbarState();
    });
    console.debug('Character context menu initialized', characterContextMenu);
}
