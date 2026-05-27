import { describe, expect, jest, test } from '@jest/globals';

import {
    getBulkSelectionShortCountText,
    syncBulkSelectionDomState,
    updateBulkDeleteButtonState,
    updateBulkSelectionCountState,
} from '../public/scripts/character-list-state.js';

/* global globalThis */

function createFakeButton() {
    const classes = new Set();
    const attributes = new Map();

    return {
        blur: jest.fn(),
        classList: {
            contains: className => classes.has(className),
            toggle: (className, enabled) => {
                if (enabled) {
                    classes.add(className);
                } else {
                    classes.delete(className);
                }
            },
        },
        getAttribute: name => attributes.get(name) ?? null,
        setAttribute: (name, value) => attributes.set(name, String(value)),
        removeAttribute: name => attributes.delete(name),
    };
}

function readAttribute(element, name) {
    return element.getAttribute(name);
}

function createFakeCharacterRow(characterId) {
    const classes = new Set();
    const attributes = new Map([['data-chid', String(characterId)]]);
    const checkbox = { checked: false };

    return {
        checkbox,
        classList: {
            contains: className => classes.has(className),
            toggle: (className, enabled) => {
                if (enabled) {
                    classes.add(className);
                } else {
                    classes.delete(className);
                }
            },
        },
        getAttribute: name => attributes.get(name) ?? null,
        setAttribute: (name, value) => attributes.set(name, String(value)),
        querySelector: selector => selector === '.bulk_select_checkbox' ? checkbox : null,
    };
}

function withDocumentLanguage(language, callback) {
    const originalDocument = globalThis.document;

    globalThis.document = { documentElement: { lang: language } };

    try {
        return callback();
    } finally {
        if (originalDocument === undefined) {
            delete globalThis.document;
        } else {
            globalThis.document = originalDocument;
        }
    }
}

function createFakeCharacterContainer(rows) {
    return {
        getElementsByClassName: className => className === 'character_select' ? rows : [],
    };
}

describe('updateBulkDeleteButtonState', () => {
    test('disables bulk delete, removes it from tab order, and moves focus away', () => {
        const deleteButton = createFakeButton();
        const fallbackFocusElement = { focus: jest.fn() };
        const previousDocument = globalThis.document;
        globalThis.document = { activeElement: deleteButton };

        try {
            updateBulkDeleteButtonState(deleteButton, false, fallbackFocusElement);
        } finally {
            globalThis.document = previousDocument;
        }

        expect(deleteButton.classList.contains('disabled')).toBe(true);
        expect(readAttribute(deleteButton, 'aria-disabled')).toBe('true');
        expect(readAttribute(deleteButton, 'tabindex')).toBe('-1');
        expect(deleteButton.blur).toHaveBeenCalledTimes(1);
        expect(fallbackFocusElement.focus).toHaveBeenCalledTimes(1);
    });

    test('enables bulk delete and restores keyboard reachability', () => {
        const deleteButton = createFakeButton();
        const fallbackFocusElement = { focus: jest.fn() };
        deleteButton.classList.toggle('disabled', true);
        deleteButton.setAttribute('aria-disabled', 'true');
        deleteButton.setAttribute('tabindex', '-1');

        updateBulkDeleteButtonState(deleteButton, true, fallbackFocusElement);

        expect(deleteButton.classList.contains('disabled')).toBe(false);
        expect(readAttribute(deleteButton, 'aria-disabled')).toBe('false');
        expect(readAttribute(deleteButton, 'tabindex')).toBe('0');
        expect(deleteButton.blur).not.toHaveBeenCalled();
        expect(fallbackFocusElement.focus).not.toHaveBeenCalled();
    });

    test('tolerates a missing delete button', () => {
        expect(() => updateBulkDeleteButtonState(null, false)).not.toThrow();
    });
});

describe('updateBulkSelectionCountState', () => {
    test('updates count text and disables delete when no characters are selected', () => {
        const selectedCount = createFakeButton();
        const deleteButton = createFakeButton();

        withDocumentLanguage('en', () => {
            updateBulkSelectionCountState({ selectedCount, deleteButton }, 0);
        });

        expect(selectedCount.textContent).toBe('0 sel');
        expect(readAttribute(selectedCount, 'title')).toBe('0 characters selected');
        expect(readAttribute(selectedCount, 'aria-label')).toBe('0 characters selected');
        expect(deleteButton.classList.contains('disabled')).toBe(true);
        expect(readAttribute(deleteButton, 'aria-disabled')).toBe('true');
        expect(readAttribute(deleteButton, 'tabindex')).toBe('-1');
    });

    test('updates count text and enables delete when selection exists', () => {
        const selectedCount = createFakeButton();
        const deleteButton = createFakeButton();

        withDocumentLanguage('en', () => {
            updateBulkSelectionCountState({ selectedCount, deleteButton }, 2);
        });

        expect(selectedCount.textContent).toBe('2 sel');
        expect(readAttribute(selectedCount, 'title')).toBe('2 characters selected');
        expect(readAttribute(selectedCount, 'aria-label')).toBe('2 characters selected');
        expect(deleteButton.classList.contains('disabled')).toBe(false);
        expect(readAttribute(deleteButton, 'aria-disabled')).toBe('false');
        expect(readAttribute(deleteButton, 'tabindex')).toBe('0');
    });

    test('uses a compact Chinese count when the document locale is Chinese', () => {
        withDocumentLanguage('zh-cn', () => {
            expect(getBulkSelectionShortCountText(3)).toBe('3个');
        });
    });
});

describe('syncBulkSelectionDomState', () => {
    test('restores visible selected rows after filtering or sorting reprints the list', () => {
        const alpha = createFakeCharacterRow(0);
        const beta = createFakeCharacterRow(1);
        const gamma = createFakeCharacterRow(2);
        const container = createFakeCharacterContainer([alpha, beta, gamma]);

        const visibleSelectedCount = syncBulkSelectionDomState({
            container,
            selectedCharacterIds: [0, 2],
        });

        expect(visibleSelectedCount).toBe(2);
        expect(alpha.classList.contains('character_selected')).toBe(true);
        expect(readAttribute(alpha, 'aria-selected')).toBe('true');
        expect(alpha.checkbox.checked).toBe(true);
        expect(beta.classList.contains('character_selected')).toBe(false);
        expect(readAttribute(beta, 'aria-selected')).toBe('false');
        expect(beta.checkbox.checked).toBe(false);
        expect(gamma.classList.contains('character_selected')).toBe(true);
        expect(readAttribute(gamma, 'aria-selected')).toBe('true');
        expect(gamma.checkbox.checked).toBe(true);
    });

    test('keeps hidden selected characters in the model while clearing unselected visible rows', () => {
        const alpha = createFakeCharacterRow(0);
        const beta = createFakeCharacterRow(1);
        const container = createFakeCharacterContainer([alpha, beta]);

        const visibleSelectedCount = syncBulkSelectionDomState({
            container,
            selectedCharacterIds: [2],
        });

        expect(visibleSelectedCount).toBe(0);
        expect(alpha.classList.contains('character_selected')).toBe(false);
        expect(readAttribute(alpha, 'aria-selected')).toBe('false');
        expect(beta.classList.contains('character_selected')).toBe(false);
        expect(readAttribute(beta, 'aria-selected')).toBe('false');
    });

    test('restores visible selection by data-chid after rows move on the page', () => {
        const gamma = createFakeCharacterRow(2);
        const alpha = createFakeCharacterRow(0);
        const beta = createFakeCharacterRow(1);
        const container = createFakeCharacterContainer([gamma, alpha, beta]);

        const visibleSelectedCount = syncBulkSelectionDomState({
            container,
            selectedCharacterIds: [2, 1],
        });

        expect(visibleSelectedCount).toBe(2);
        expect(gamma.classList.contains('character_selected')).toBe(true);
        expect(readAttribute(gamma, 'aria-selected')).toBe('true');
        expect(gamma.checkbox.checked).toBe(true);
        expect(alpha.classList.contains('character_selected')).toBe(false);
        expect(readAttribute(alpha, 'aria-selected')).toBe('false');
        expect(alpha.checkbox.checked).toBe(false);
        expect(beta.classList.contains('character_selected')).toBe(true);
        expect(readAttribute(beta, 'aria-selected')).toBe('true');
        expect(beta.checkbox.checked).toBe(true);
    });
});
