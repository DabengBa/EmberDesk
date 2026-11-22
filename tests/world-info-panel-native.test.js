import { expect, jest, test } from '@jest/globals';
import fs from 'node:fs';
jest.unstable_mockModule('../public/scripts/world-info-state.js', () => ({ world_names: [] }));
const { createWorldInfoPanelUi } = await import('../public/scripts/world-info-panel-ui.js');

test('panel menu and file picker retain keyboard, busy, reset and outside-click behavior without panel jQuery', async () => {
    class Element {
        constructor() { this.handlers = {}; this.style = {}; this.attrs = {}; this.classList = { toggle: jest.fn(), remove: jest.fn() }; this.focus = jest.fn(); this.click = jest.fn(() => this.fire('click')); }
        addEventListener(type, handler) { (this.handlers[type] ??= []).push(handler); }
        setAttribute(key, value) { this.attrs[key] = value; }
        querySelectorAll() { return [item]; }
        getClientRects() { return [1]; }
        fire(type, event = {}) { return Promise.all((this.handlers[type] ?? []).map(handler => handler.call(this, { target: this, currentTarget: this, stopPropagation: jest.fn(), preventDefault: jest.fn(), ...event }))); }
    }
    class Input extends Element {}
    const input = new Input(), item = new Element(), menu = new Element(), dropdown = new Element();
    dropdown.style.display = 'none';
    const world = new Element(), create = new Element(), importMenu = item;
    const nodes = { '#world_import_file': input, '#world_import_menu_item': importMenu, '#world_more_menu': menu, '#world_more_menu_dropdown': dropdown, '#WorldInfo': world, '#world_create_world': create };
    const doc = new Element(); doc.querySelector = selector => nodes[selector]; doc.querySelectorAll = () => [item]; doc.getElementById = () => null;
    const previous = { document: globalThis.document, HTMLInputElement: globalThis.HTMLInputElement, Element: globalThis.Element, $: globalThis.$ };
    globalThis.document = doc; globalThis.HTMLInputElement = Input; globalThis.Element = Element;
    globalThis.$ = value => {
        if (value !== '#world_button') throw new Error(`unexpected jQuery: ${value}`);
        return { on: jest.fn() };
    };
    let busy = true;
    const importFiles = jest.fn(async () => {});
    try {
        const init = createWorldInfoPanelUi({ addLongPressEvent: jest.fn(), isWorldInfoImportBusy: () => busy, importWorldInfoFiles: importFiles, DragAndDropHandler: class {}, t: strings => strings[0] });
        init(); init();
        await item.fire('click'); expect(input.click).not.toHaveBeenCalled();
        busy = false; await item.fire('click'); expect(input.click).toHaveBeenCalledTimes(1);
        input.files = [{ name: 'a.json' }]; input.value = 'a';
        await input.fire('change'); expect(importFiles).toHaveBeenCalledWith(input.files); expect(input.value).toBe('');
        await menu.fire('click'); expect(menu.attrs['aria-expanded']).toBe('true'); expect(item.focus).toHaveBeenCalled();
        await menu.fire('keydown', { key: 'Escape' }); expect(menu.attrs['aria-expanded']).toBe('false'); expect(menu.focus).toHaveBeenCalled();
        await menu.fire('keydown', { key: ' ' }); expect(menu.attrs['aria-expanded']).toBe('true');
        await item.fire('keydown', { key: 'Escape' }); expect(menu.attrs['aria-expanded']).toBe('false'); expect(menu.focus).toHaveBeenCalledTimes(2);
        await item.fire('keydown', { key: 'Enter' }); expect(input.click).toHaveBeenCalledTimes(2);
        await doc.fire('click', { target: { closest: () => null } }); expect(menu.attrs['aria-expanded']).toBe('false');
    } finally { Object.assign(globalThis, previous); }
});

test('chat lorebook delegation accepts dynamic nested clicks and management action native clicks once', () => {
    const listeners = {};
    const doc = {
        getElementById: () => null,
        addEventListener(type, handler) { (listeners[type] ??= []).push(handler); },
        querySelector(selector) { return selector === '.chat_lorebook_button' ? button : null; },
    };
    class Element {}
    const button = Object.assign(new Element(), { closest: selector => selector === '.chat_lorebook_button' ? button : null });

    button.click = () => listeners.click.forEach(handler => handler({ target: button, shiftKey: false, altKey: false }));
    const child = Object.assign(new Element(), { closest: selector => selector === '.chat_lorebook_button' ? button : null });
    const assign = jest.fn();
    const longPress = jest.fn();
    const previous = { document: globalThis.document, Element: globalThis.Element, $: globalThis.$ };
    globalThis.document = doc; globalThis.Element = Element;
    globalThis.$ = value => {
        if (value !== '#world_button') throw new Error(`unexpected jQuery: ${value}`);
        return { on: jest.fn() };
    };
    try {
        const init = createWorldInfoPanelUi({ addLongPressEvent: longPress, assignLorebookToChat: assign });
        init(); init();
        listeners.click.forEach(handler => handler({ target: child, shiftKey: true, altKey: false }));
        expect(assign).toHaveBeenCalledTimes(1);
        expect(assign.mock.calls[0][0].shiftKey).toBe(true);
        listeners.click.forEach(handler => handler({ target: { closest: () => null } }));
        expect(assign).toHaveBeenCalledTimes(1);
        longPress.mock.calls.find(([selector]) => selector === '.chat_lorebook_button')[1]();
        expect(assign).toHaveBeenLastCalledWith({ shiftKey: true, altKey: false });
        const source = fs.readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');
        const action = source.match(/case 'character_action_chat_lorebook':([\s\S]*?)\s*break;/)?.[1];
        expect(action).toBeDefined();
        new Function('document', action)(doc);
        expect(assign).toHaveBeenCalledTimes(3);
        expect(assign.mock.calls[2][0].shiftKey).toBe(false);
    } finally { Object.assign(globalThis, previous); }
});

test('world button reads current character identity and routes numeric draft sentinel to management', async () => {
    const control = { dataset: { chid: '0' }, value: 'world-action' };
    let click;
    const menuOrder = [];
    const button = { addEventListener: (_type, fn) => { click = fn; } };
    const dropdown = { set value(value) { menuOrder.push(value); }, dispatchEvent(event) { menuOrder.push(event.type); } };
    const doc = { getElementById: id => ({ world_button: button, set_character_world: control, 'char-management-dropdown': dropdown })[id], querySelector: () => null, addEventListener: jest.fn() };
    const previous = { document: globalThis.document, $: globalThis.$ };
    globalThis.document = doc;
    globalThis.$ = selector => {
        if (selector === '#world_button') return { on: (_type, fn) => { click = fn; } };
        if (selector === '#set_character_world') return { val: () => 'world-action' };
        if (selector === '#char-management-dropdown') return { val: value => { menuOrder.push(value); return { trigger: type => menuOrder.push(type) }; } };
        throw new Error(`unexpected jQuery: ${selector}`);
    };
    const edit = jest.fn(), embedded = jest.fn(() => false);
    const { world_names } = await import('../public/scripts/world-info-state.js');
    try {
        world_names.push('Alice lore');
        createWorldInfoPanelUi({ characters: [{ data: { extensions: { world: 'Alice lore' } } }, { data: { extensions: {} } }],
            checkEmbeddedWorld: embedded, openWorldInfoEditor: edit, addLongPressEvent: jest.fn() })();
        await click({ shiftKey: false, altKey: false });

        expect(edit).toHaveBeenCalledWith('Alice lore');
        control.dataset.chid = '-1';
        await click({ shiftKey: false, altKey: false });
        expect(menuOrder).toEqual(['world-action', 'change']);
        control.dataset.chid = '1';
        await click({ shiftKey: false, altKey: false });
        expect(embedded).toHaveBeenLastCalledWith('1');
        expect(menuOrder).toEqual(['world-action', 'change', 'world-action', 'change']);
    } finally { world_names.pop(); Object.assign(globalThis, previous); }
});

test('world button uses native click and bubbling management change', async () => {
    const callbacks = {};
    const option = { dataset: { chid: '-1' }, value: 'world-action' };
    const dropdown = { value: '', dispatchEvent: jest.fn() };
    const button = { addEventListener: (type, cb) => { callbacks[type] = cb; } };
    const previous = { document: globalThis.document, $: globalThis.$ };
    globalThis.document = { getElementById: id => ({ world_button: button, set_character_world: option, 'char-management-dropdown': dropdown })[id], querySelector: () => null, addEventListener: jest.fn() };
    globalThis.$ = () => { throw new Error('world button must not use jQuery'); };
    try {
        createWorldInfoPanelUi({ addLongPressEvent: jest.fn() })();
        await callbacks.click({ shiftKey: false, altKey: false });

        expect(dropdown.value).toBe('world-action');
        expect(dropdown.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'change', bubbles: true }));
    } finally { Object.assign(globalThis, previous); }
});

test('native management listener handles world action before resetting selection', async () => {
    const source = fs.readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');
    const start = source.indexOf("    document.getElementById('char-management-dropdown')?.addEventListener('change'");
    const end = source.indexOf('\n    });', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    let listener;
    const target = { selectedOptions: [{ id: 'set_character_world' }], selectedIndex: 2, addEventListener: (_type, fn) => { listener = fn; } };
    const popup = jest.fn(async () => { expect(target.selectedIndex).toBe(2); });
    new Function('document', 'openCharacterWorldPopup', source.slice(start, end + '\n    });'.length))({ getElementById: () => target }, popup);
    await listener({ target });
    expect(popup).toHaveBeenCalledTimes(1);
    expect(target.selectedIndex).toBe(0);
});
