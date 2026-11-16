import { expect, jest, test } from '@jest/globals';

const callbacks = new Map();
jest.unstable_mockModule('../public/scripts/events.js', () => ({
    event_types: { CHARACTER_PAGE_LOADED: 'page' },
    eventSource: { on: (name, callback) => callbacks.set(name, callback) },
}));
jest.unstable_mockModule('../public/scripts/BulkEditOverlay.js', () => ({
    BulkEditOverlay: class { static containerId = 'rm_print_characters_block'; static characterClass = 'character_select'; },
    BulkEditOverlayState: { select: 'select', browse: 'browse' },
    CharacterContextMenu: class {},
}));

const { registerCharacterLifecycleShellContext } = await import('../public/scripts/character-lifecycle-shell-context.js');
const { initBulkEdit } = await import('../public/scripts/bulk-edit.js');

test('React bulk controls, page reload and selection work without jQuery', async () => {
    class Element extends EventTarget {
        constructor() { super(); this.dataset = {}; this.style = {}; this.classes = new Set(); this.classList = {
            add: name => this.classes.add(name), remove: name => this.classes.delete(name), contains: name => this.classes.has(name),
        }; }
        querySelector(selector) { return selector === '.bulk_select_checkbox:checked' && this.checked ? {} : null; }
        closest(selector) { return this.isCheckbox && selector === '.bulk_select_checkbox' ? this : null; }
    }
    const originalDocument = globalThis.document, originalHTMLElement = globalThis.HTMLElement, originalElement = globalThis.Element, originalDollar = globalThis.$;
    const container = new Element(); container.dataset.reactCharacterLibraryOwner = 'react';
    const row = new Element();
    const elements = Object.fromEntries(['bulkEditButton', 'bulkSelectAllButton', 'bulkDeleteButton', 'bulkSelectedCount'].map(id => [id, new Element()]));
    const doc = new Element();
    doc.getElementById = id => id === 'rm_print_characters_block' ? container : elements[id];
    doc.querySelectorAll = selector => selector === '.bulkEditOptionElement' ? [elements.bulkSelectedCount] : selector.includes('.character_select') ? [row] : [];
    globalThis.document = doc; globalThis.HTMLElement = Element; globalThis.Element = Element;
    globalThis.$ = () => { throw new Error('bulk React path must not use jQuery'); };
    const overlay = {
        state: 'browse', callbacks: [], addStateChangeCallback(fn) { this.callbacks.push(fn); },
        selectState() { if (this.state !== 'select') { this.state = 'select'; this.callbacks.forEach(fn => fn(this.state)); } },
        browseState() { if (this.state !== 'browse') { this.state = 'browse'; this.callbacks.forEach(fn => fn(this.state)); } },
        updateSelectedCount: jest.fn(), onPageLoad: jest.fn(),
        toggleSingleCharacter: jest.fn(element => { element.checked = !element.checked; }),
        handleContextMenuDelete: jest.fn(),
    };
    const sync = jest.fn();
    registerCharacterLifecycleShellContext({ state: { characterGroupOverlay: overlay }, syncReactCharacterLibraryToolbarState: sync });
    try {
        initBulkEdit();
        elements.bulkEditButton.dispatchEvent(new Event('click'));
        expect(container.classList.contains('bulk_select')).toBe(true);
        expect(elements.bulkSelectedCount.style.display).toBe('inline-flex');
        elements.bulkSelectAllButton.dispatchEvent(new Event('click'));
        expect(row.checked).toBe(true);
        elements.bulkSelectAllButton.dispatchEvent(new Event('click'));
        expect(row.checked).toBe(false);
        elements.bulkDeleteButton.classList.add('disabled');
        elements.bulkDeleteButton.dispatchEvent(new Event('click'));
        expect(overlay.handleContextMenuDelete).not.toHaveBeenCalled();
        elements.bulkDeleteButton.classList.remove('disabled');
        elements.bulkDeleteButton.dispatchEvent(new Event('click'));
        expect(overlay.handleContextMenuDelete).toHaveBeenCalledTimes(1);
        callbacks.get('page')(); callbacks.get('page')();
        expect(overlay.onPageLoad).toHaveBeenCalledTimes(2);
        const laterListener = jest.fn(); doc.addEventListener('click', laterListener);
        doc.isCheckbox = true; doc.dispatchEvent(new Event('click'));
        expect(laterListener).not.toHaveBeenCalled();
        doc.isCheckbox = false; doc.dispatchEvent(new Event('click'));
        expect(laterListener).toHaveBeenCalledTimes(1);
        elements.bulkEditButton.dispatchEvent(new Event('click'));
        expect(container.classList.contains('bulk_select')).toBe(false);
        expect(elements.bulkSelectedCount.style.display).toBe('none');
        doc.isCheckbox = true; doc.dispatchEvent(new Event('click'));
        expect(laterListener).toHaveBeenCalledTimes(2);
        expect(sync).toHaveBeenCalled();
    } finally {
        globalThis.document = originalDocument; globalThis.HTMLElement = originalHTMLElement; globalThis.Element = originalElement; globalThis.$ = originalDollar;
    }
});

test('legacy rows gain one checkbox per page refresh and are cleaned on exit', () => {
    class Element extends EventTarget {
        constructor() {
            super(); this.dataset = {}; this.style = {}; this.attributes = {}; this.children = []; this.classes = new Set();
            this.classList = { add: value => this.classes.add(value), remove: value => this.classes.delete(value), contains: value => this.classes.has(value) };
        }
        setAttribute(key, value) { this.attributes[key] = value; }
        removeAttribute(key) { delete this.attributes[key]; }
        querySelector(selector) { return selector === '.bulk_select_checkbox' ? this.children[0] || null : null; }
        prepend(child) { this.children.unshift(child); child.remove = () => { this.children = this.children.filter(item => item !== child); }; }
    }
    const original = { document: globalThis.document, HTMLElement: globalThis.HTMLElement, Element: globalThis.Element, $: globalThis.$ };
    const row = new Element(), folder = new Element(), container = new Element();
    const button = new Element();
    const doc = new Element();
    doc.createElement = () => new Element();
    doc.getElementById = id => id === 'rm_print_characters_block' ? container : id === 'bulkEditButton' ? button : null;
    doc.querySelectorAll = selector => {
        if (selector === '#rm_print_characters_block .character_select') return [row];
        if (selector === '#rm_print_characters_block.group_overlay_mode_select .bogus_folder_select') return [folder];
        if (selector === '.bulk_select_checkbox') return [...row.children];
        return [];
    };
    globalThis.document = doc; globalThis.HTMLElement = Element; globalThis.Element = Element;
    globalThis.$ = () => { throw new Error('legacy bulk path must not use jQuery'); };
    const overlay = {
        state: 'browse', callbacks: [], addStateChangeCallback(fn) { this.callbacks.push(fn); },
        selectState() { if (this.state !== 'select') { this.state = 'select'; this.callbacks.forEach(fn => fn(this.state)); } },
        browseState() { if (this.state !== 'browse') { this.state = 'browse'; this.callbacks.forEach(fn => fn(this.state)); } },
        updateSelectedCount: jest.fn(), onPageLoad: jest.fn(),
    };
    registerCharacterLifecycleShellContext({ state: { characterGroupOverlay: overlay }, syncReactCharacterLibraryToolbarState: jest.fn() });
    try {
        initBulkEdit(); button.dispatchEvent(new Event('click'));
        expect(row.children).toHaveLength(1);
        expect(row.children[0].attributes).toEqual({ 'aria-label': 'Select character for bulk edit', 'aria-checked': 'false', 'aria-describedby': 'bulkSelectionHint' });
        expect(row.attributes).toEqual({ role: 'checkbox', 'aria-selected': 'false', 'aria-checked': 'false', 'aria-describedby': 'bulkSelectionHint' });
        expect(folder.classList.contains('disabled')).toBe(true);
        callbacks.get('page')(); callbacks.get('page')();
        expect(row.children).toHaveLength(1);
        button.dispatchEvent(new Event('click'));
        expect(row.children).toHaveLength(0);
        expect(row.attributes).toEqual({});
        expect(folder.classList.contains('disabled')).toBe(false);
    } finally {
        globalThis.document = original.document; globalThis.HTMLElement = original.HTMLElement;
        globalThis.Element = original.Element; globalThis.$ = original.$;
    }
});
