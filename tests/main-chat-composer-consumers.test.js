import { describe, expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

jest.unstable_mockModule('../public/scripts/utils.js', () => ({ debounce: fn => fn, escapeRegex: value => value }));
jest.unstable_mockModule('../public/lib.js', () => ({ DOMPurify: { sanitize: jest.fn() } }));

const { AutoComplete } = await import('../public/scripts/autocomplete/AutoComplete.js');

function element() {
    const listeners = {};
    return {
        listeners,
        classList: { add() {}, remove() {} },
        append() {},
        addEventListener(name, listener) { listeners[name] = listener; },
        dispatchEvent: jest.fn(),
        value: '/old', selectionStart: 4, selectionEnd: 4,
    };
}

function setup(adapter) {
    globalThis.document = { createElement: element };
    globalThis.window = { addEventListener() {} };
    const textarea = element();
    const ac = new AutoComplete(textarea, () => true, async () => null, false, adapter);
    return { ac, textarea };
}

describe('main chat composer consumers', () => {
    test('autocomplete adapter replaces via state, not the textarea or synthetic input', async () => {
        const set = jest.fn();
        const adapter = { getSnapshot: () => ({ value: '/old', selectionStart: 4 }), subscribe: jest.fn(), set };
        const { ac, textarea } = setup(adapter);
        ac.text = '/old';
        ac.isReplaceable = true;
        ac.parserResult = { start: 1, name: 'old' };
        ac.selectedItem = { value: 'new', replacer: 'new' };
        ac.show = jest.fn();
        await ac.select();
        expect(set).toHaveBeenCalledWith('/new', { expected: adapter.getSnapshot(), selectionStart: 4, selectionEnd: 4 });
        expect(textarea.value).toBe('/old');
        expect(textarea.dispatchEvent).not.toHaveBeenCalled();
        expect(adapter.subscribe).toHaveBeenCalled();
    });
});


test.each(['edit', 'switch-back'])('delayed chat focus handles %s correctly', async change => {
    const service = await import(`../public/scripts/main-chat-composer-service.js?focus=${Math.random()}`);
    service.setComposerDraftContext('a');
    const source = readFileSync(new URL('../public/scripts/chat-ops-service.js', import.meta.url), 'utf8');
    const start = source.indexOf('const focusContext = getComposerSnapshot().contextKey;');
    const end = source.indexOf('\n        });', source.indexOf('delay(debounce_timeout.short).then(() => {', start)) + '\n        });'.length;
    let release;
    const wait = new Promise(resolve => { release = resolve; });
    const oldFocus = jest.fn();
    const schedule = new Function('delay', 'debounce_timeout', '$', 'document', 'getComposerSnapshot', 'subscribeComposerState', 'requestComposerFocus', source.slice(start, end));
    schedule(() => wait, { short: 1 }, () => ({ is: () => false, trigger: oldFocus }), { activeElement: null }, service.getComposerSnapshot, service.subscribeComposerState, service.requestComposerFocus);
    if (change === 'switch-back') {
        service.setComposerDraftContext('b');
        service.setComposerDraftContext('a');
    } else service.setComposerValue('edited');
    release();
    await wait;
    await Promise.resolve();
    expect(oldFocus).not.toHaveBeenCalled();
    expect(service.getComposerSnapshot().focusRequest).toBe(change === 'edit' ? 1 : 0);
});
describe('main chat composer composition and macro', () => {
    test.each([{ isComposing: true }, { keyCode: 229 }, { serviceComposing: true }])('autocomplete ignores Enter during composition: %j', async flags => {
        const adapter = { getSnapshot: () => ({ composing: flags.serviceComposing }), subscribe() {}, set() {} };
        const { ac } = setup(adapter);
        ac.isActive = true;
        ac.isReplaceable = true;
        ac.selectedItem = { value: 'new', name: 'new', isSelectable: true };
        ac.name = 'old';
        ac.select = jest.fn();
        const event = { key: 'Enter', ...flags, preventDefault: jest.fn(), stopImmediatePropagation: jest.fn() };
        await ac.handleKeyDown(event);
        expect(ac.select).not.toHaveBeenCalled();
        expect(event.preventDefault).not.toHaveBeenCalled();
    });

    test('input macro reads composer state without accessing document', () => {
        const source = readFileSync(new URL('../public/scripts/macros/definitions/core-macros.js', import.meta.url), 'utf8');
        const definition = source.match(/MacroRegistry\.registerMacro\('input', \{([\s\S]*?)\n    \}\);/)[1];
        let macro;
        const register = new Function('MacroRegistry', 'MacroCategory', 'getComposerValue', 'document', `MacroRegistry.registerMacro('input', {${definition}\n});`);
        register({ registerMacro: (_name, value) => { macro = value; } }, { UTILITY: 'utility' }, () => 'state value', { querySelector: () => { throw new Error('unexpected DOM read'); } });
        expect(macro.handler()).toBe('state value');
    });
});

test('native autocomplete remains DOM-based for non-composer textareas', async () => {
    const { ac, textarea } = setup(null);
    ac.text = '/old';
    ac.isReplaceable = true;
    ac.parserResult = { start: 1, name: 'old' };
    ac.selectedItem = { value: 'new', replacer: 'new' };
    ac.show = jest.fn();
    await ac.select();
    expect(textarea.value).toBe('/new');
    expect(textarea.selectionStart).toBe(4);
    expect(textarea.dispatchEvent).toHaveBeenCalledTimes(1);
});

test('composer state notification drives autocomplete without a native input event', () => {
    let listener;
    let value = '';
    const { ac, textarea } = setup({ getSnapshot: () => ({ value, selectionStart: value.length }), subscribe: fn => { listener = fn; }, set() {} });
    ac.show = jest.fn();
    value = '/help';
    listener();
    expect(ac.show).toHaveBeenCalledWith(true, false);
    expect(textarea.listeners.input).toBeUndefined();
});

test('autocomplete consumes Enter before it can submit', async () => {
    const { ac } = setup({ getSnapshot: () => ({ composing: false }), subscribe() {}, set() {} });
    ac.isActive = true;
    ac.isReplaceable = true;
    ac.selectedItem = { value: 'new', name: 'new', isSelectable: true };
    ac.name = 'old';
    ac.select = jest.fn();
    const event = { key: 'Enter', preventDefault: jest.fn(), stopImmediatePropagation: jest.fn() };
    await ac.handleKeyDown(event);
    expect(ac.select).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(1);
});


test('selection-only state changes still refresh autocomplete on arrow keyup', async () => {
    let listener;
    let selectionStart = 4;
    const { ac } = setup({ getSnapshot: () => ({ value: '/old', selectionStart }), subscribe: fn => { listener = fn; }, set() {} });
    ac.text = '/old';
    ac.selectionStart = 4;
    ac.show = jest.fn();
    let keyup;
    globalThis.window.addEventListener = (_name, callback) => { keyup = callback; };
    const pending = ac.handleKeyDown({ key: 'ArrowLeft' });
    selectionStart = 3;
    listener();
    keyup();
    await pending;
    expect(ac.show).toHaveBeenCalledTimes(1);
});

test('an old asynchronous autocomplete result cannot replace the newer parser result', async () => {
    let value = '/old';
    const { ac, textarea } = setup({ getSnapshot: () => ({ value, selectionStart: value.length, revision: value === '/old' ? 1 : 2, contextKey: 'a' }), subscribe() {}, set() {} });
    document.activeElement = textarea;
    let resolveOld, resolveNew;
    ac.getNameAt = text => new Promise(resolve => { if (text === '/old') resolveOld = resolve; else resolveNew = resolve; });
    ac.hide = jest.fn();
    const old = ac.show();
    value = '/new';
    const newer = ac.show();
    resolveNew(null);
    await newer;
    resolveOld({ start: 1, name: 'old', optionList: [], getSecondaryNameAt: () => null });
    await old;
    expect(ac.parserResult).toBeNull();
});
