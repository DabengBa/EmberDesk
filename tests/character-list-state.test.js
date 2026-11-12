import { describe, expect, jest, test } from '@jest/globals';
import { readFile } from 'node:fs/promises';

// The i18n engine imports power-user's browser-wide dependency graph only to
// register debug actions. Keep the real locale engine and data in this test.
jest.unstable_mockModule('../public/scripts/power-user.js', () => ({ registerDebugFunction: jest.fn() }));
const originalMutationObserver = globalThis.MutationObserver;
globalThis.MutationObserver = class { observe() {} };
const {
    syncBulkSelectionDomState,
    updateBulkDeleteButtonState,
} = await import('../public/scripts/character-list-state.js');
if (originalMutationObserver === undefined) delete globalThis.MutationObserver;
else globalThis.MutationObserver = originalMutationObserver;

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
    const checkboxAttributes = new Map();
    const checkbox = {
        checked: false,
        getAttribute: name => checkboxAttributes.get(name) ?? null,
        setAttribute: (name, value) => checkboxAttributes.set(name, String(value)),
        removeAttribute: name => checkboxAttributes.delete(name),
    };

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

async function withDocumentLanguage(language, callback) {
    const keys = ['document', 'Document', 'MutationObserver', 'CustomEvent', 'localStorage', 'fetch', '$'];
    const originals = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    try {
        globalThis.Document = class Document {};
        globalThis.document = Object.assign(new globalThis.Document(), { documentElement: { lang: language }, dispatchEvent() {} });
        globalThis.MutationObserver = class { observe() {} };
        globalThis.CustomEvent = class {};
        globalThis.localStorage = { getItem: key => key === 'language' ? language : null };
        globalThis.fetch = async url => {
            try {
                const data = await readFile(new URL(`../public/${url.replace(/^\.\//, '')}`, import.meta.url), 'utf8');
                return { ok: true, json: async () => JSON.parse(data) };
            } catch (error) {
                if (error.code !== 'ENOENT') throw error;
                return { ok: false };
            }
        };
        globalThis.$ = () => ({ find: () => ({ each() {} }) });
        await jest.isolateModulesAsync(async () => {
            const engine = await import('../public/scripts/i18n.js');
            const state = await import('../public/scripts/character-list-state.js');
            await engine.initLocales();
            callback(state);
        });
    } finally {
        for (const [key, descriptor] of originals) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else delete globalThis[key];
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
    test('updates count text and disables delete when no characters are selected', async () => {
        const selectedCount = createFakeButton();
        const deleteButton = createFakeButton();

        await withDocumentLanguage('en', ({ updateBulkSelectionCountState }) => {
            updateBulkSelectionCountState({ selectedCount, deleteButton }, 0);
        });

        expect(selectedCount.textContent).toBe('0 sel');
        expect(readAttribute(selectedCount, 'title')).toBe('0 characters selected');
        expect(readAttribute(selectedCount, 'aria-label')).toBe('0 characters selected');
        expect(deleteButton.classList.contains('disabled')).toBe(true);
        expect(readAttribute(deleteButton, 'aria-disabled')).toBe('true');
        expect(readAttribute(deleteButton, 'tabindex')).toBe('-1');
    });

    test('updates count text and enables delete when selection exists', async () => {
        const selectedCount = createFakeButton();
        const deleteButton = createFakeButton();

        await withDocumentLanguage('en', ({ updateBulkSelectionCountState }) => {
            updateBulkSelectionCountState({ selectedCount, deleteButton }, 2);
        });

        expect(selectedCount.textContent).toBe('2 sel');
        expect(readAttribute(selectedCount, 'title')).toBe('2 characters selected');
        expect(readAttribute(selectedCount, 'aria-label')).toBe('2 characters selected');
        expect(deleteButton.classList.contains('disabled')).toBe(false);
        expect(readAttribute(deleteButton, 'aria-disabled')).toBe('false');
        expect(readAttribute(deleteButton, 'tabindex')).toBe('0');
    });

    test('uses a compact Chinese count when the document locale is Chinese', async () => {
        await withDocumentLanguage('zh-cn', ({ getBulkSelectionShortCountText }) => {
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
        expect(readAttribute(alpha, 'aria-checked')).toBe('true');
        expect(alpha.checkbox.checked).toBe(true);
        expect(readAttribute(alpha.checkbox, 'aria-checked')).toBe('true');
        expect(beta.classList.contains('character_selected')).toBe(false);
        expect(readAttribute(beta, 'aria-selected')).toBe('false');
        expect(readAttribute(beta, 'aria-checked')).toBe('false');
        expect(beta.checkbox.checked).toBe(false);
        expect(readAttribute(beta.checkbox, 'aria-checked')).toBe('false');
        expect(gamma.classList.contains('character_selected')).toBe(true);
        expect(readAttribute(gamma, 'aria-selected')).toBe('true');
        expect(readAttribute(gamma, 'aria-checked')).toBe('true');
        expect(gamma.checkbox.checked).toBe(true);
        expect(readAttribute(gamma.checkbox, 'aria-checked')).toBe('true');
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
        expect(readAttribute(alpha, 'aria-checked')).toBe('false');
        expect(beta.classList.contains('character_selected')).toBe(false);
        expect(readAttribute(beta, 'aria-selected')).toBe('false');
        expect(readAttribute(beta, 'aria-checked')).toBe('false');
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
        expect(readAttribute(gamma, 'aria-checked')).toBe('true');
        expect(gamma.checkbox.checked).toBe(true);
        expect(readAttribute(gamma.checkbox, 'aria-checked')).toBe('true');
        expect(alpha.classList.contains('character_selected')).toBe(false);
        expect(readAttribute(alpha, 'aria-selected')).toBe('false');
        expect(readAttribute(alpha, 'aria-checked')).toBe('false');
        expect(alpha.checkbox.checked).toBe(false);
        expect(readAttribute(alpha.checkbox, 'aria-checked')).toBe('false');
        expect(beta.classList.contains('character_selected')).toBe(true);
        expect(readAttribute(beta, 'aria-selected')).toBe('true');
        expect(readAttribute(beta, 'aria-checked')).toBe('true');
        expect(beta.checkbox.checked).toBe(true);
        expect(readAttribute(beta.checkbox, 'aria-checked')).toBe('true');
    });
});
