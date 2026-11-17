import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, jest, test } from '@jest/globals';
import { parseI18nAttributeSpecs } from '../public/scripts/i18n-data.js';

function load(name, context, exports) {
    const source = readFileSync(new URL(`../public/scripts/${name}.js`, import.meta.url), 'utf8')
        .replace(/^import[\s\S]*?;\s*$/gm, '')
        .replace(/\bexport\s+/g, '');
    return runInNewContext(`${source}\n;({ ${exports} })`, context);
}

test('session timer starts once at DOM ready and pings only a loaded user', async () => {
    const listeners = {}, timers = [], deferred = [], fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ handle: 'alice' }) });
    const context = { document: { readyState: 'loading', addEventListener: (name, fn) => { listeners[name] = fn; } },
        setInterval: (fn, ms) => timers.push([fn, ms]), setTimeout: fn => deferred.push(fn), fetch, getRequestHeaders: () => ({}), console };
    const user = load('user', context, 'setUserControls');
    expect(timers).toHaveLength(0);
    listeners.DOMContentLoaded();
    expect(timers).toHaveLength(0);
    deferred[0]();
    expect(timers).toHaveLength(1);
    expect(timers[0][1]).toBe(600000);
    await timers[0][0]();
    expect(fetch).not.toHaveBeenCalled();
    await user.setUserControls(true);
    await timers[0][0]();
    expect(fetch).toHaveBeenLastCalledWith('/api/ping?extend=1', expect.objectContaining({ method: 'POST' }));
});

test('session timer starts when module loads after DOM ready', () => {
    const setInterval = jest.fn(), deferred = [];
    load('user', { document: { readyState: 'complete' }, setInterval, setTimeout: fn => deferred.push(fn), console }, 'setUserControls');
    expect(setInterval).not.toHaveBeenCalled();
    deferred[0]();
    expect(setInterval).toHaveBeenCalledTimes(1);
});

test('drawer binding replaces same namespace per element without affecting other namespaces', () => {
    const handlers = new Set();
    const element = { addEventListener: (type, fn) => handlers.add(fn), removeEventListener: (type, fn) => handlers.delete(fn) };
    const document = { querySelectorAll: () => [element] };
    const { initWorkspacePanelDrawerBridge } = load('workspace-panel-host-controller', { document }, 'initWorkspacePanelDrawerBridge');
    const first = jest.fn(), second = jest.fn(), other = jest.fn();
    const init = (drawerNamespace, remount) => initWorkspacePanelDrawerBridge({ drawerSelector: '.drawer', drawerNamespace, remount });
    init('one', first); init('two', other); init('one', second);
    for (const handler of handlers) handler();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
    expect(other).toHaveBeenCalledTimes(2);
});

test('action loader uses native toast nodes and retains independent handles', async () => {
    const children = [];
    const document = { createElement: () => ({ dataset: {}, appendChild(node) { children.push(node); }, setAttribute() {}, addEventListener() {} }) };
    const info = jest.fn(() => ({ nodeType: 1 })), clear = jest.fn();
    const context = { document, toastr: { info, clear }, t: strings => strings[0], console };
    const { showActionLoader } = load('action-loader', context, 'showActionLoader');
    const first = showActionLoader({ blocking: false, message: 'first' });
    const second = showActionLoader({ blocking: false, message: 'second' });
    expect(info.mock.calls[0][0].dataset.loaderId).toBe(first.id);
    await first.hide();
    expect(clear).toHaveBeenCalledWith(info.mock.results[0].value, { force: true });
    expect(second.isActive).toBe(true);
    await second.hide();
});

test.each(['transitionend', 'timeout'])('blocking loaders share overlay until the last hides (%s)', async completion => {
    const listeners = new Map(), timers = new Map();
    let timerId = 0, popup;
    class HTMLElement {
        constructor() { this.dataset = {}; this.style = {}; }
        appendChild() {}
        setAttribute() {}
        removeAttribute() {}
        addEventListener(name, fn) { listeners.set(name, fn); }
        removeEventListener(name, fn) { if (listeners.get(name) === fn) listeners.delete(name); }
        remove() { this.removed = true; }
    }
    const overlay = new HTMLElement(), spinner = new HTMLElement(), preloader = new HTMLElement();
    const document = { createElement: () => new HTMLElement(), getElementById: id => ({ loader: overlay, 'load-spinner': spinner, preloader })[id] };
    class Popup {
        constructor() { popup = this; this.dlg = new HTMLElement(); this.closeButton = new HTMLElement(); this.complete = jest.fn().mockResolvedValue(); }
        show() {}
    }
    const context = { document, HTMLElement, Popup, POPUP_TYPE: { DISPLAY: 1 }, POPUP_RESULT: { AFFIRMATIVE: 1 },
        toastr: { info: () => new HTMLElement(), clear: jest.fn() }, t: strings => strings[0], console,
        shouldAnimateOverlayHide: () => true, getComputedStyle: () => ({ transitionDuration: '1s' }),
        setTimeout: fn => { const id = ++timerId; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id) };
    const { showActionLoader } = load('action-loader', context, 'showActionLoader');
    const first = showActionLoader(), second = showActionLoader();
    await first.hide();
    expect(popup.complete).not.toHaveBeenCalled();
    const pending = second.hide();
    expect(overlay.style.opacity).toBe('0');
    if (completion === 'timeout') [...timers.values()][0](); else listeners.get(completion)();
    await pending;
    expect(overlay.removed).toBe(true);
    expect(preloader.removed).toBe(true);
    expect(popup.complete).toHaveBeenCalledTimes(1);
    for (const name of ['transitionend', 'webkitTransitionEnd', 'oTransitionEnd', 'MSTransitionEnd']) expect(listeners.has(name)).toBe(false);
    expect(timers.size).toBe(0);
});

test('locale application translates documents and markup and emits document event', async () => {
    const translated = [], events = [], observer = { observe: jest.fn() };
    class Document { constructor() { this.documentElement = {}; this.body = { innerHTML: 'translated markup' }; } querySelectorAll() { return [this.element]; } dispatchEvent(e) { events.push(e.type); } }
    const document = new Document(); document.element = { getAttribute: () => 'key' };
    const parsed = new Document(); parsed.element = { getAttribute: () => 'key' };
    const context = { Document, document, DOMParser: class { parseFromString() { return parsed; } },
        CustomEvent: class { constructor(type) { this.type = type; } }, MutationObserver: class { constructor() { return observer; } },
        readStoredUiLocale: () => 'en', resolveUiLocale: x => x, UI_LOCALE_STORAGE_KEY: 'language',
        localStorage: { getItem: () => null }, fetch: async () => ({ ok: false }), console,
        applyI18nTranslations: (el) => translated.push(el), registerDebugFunction() {} };
    const { initLocales, applyLocale } = load('i18n', context, 'initLocales, applyLocale');
    await initLocales();
    expect(translated).toContain(document.element);
    expect(events).toEqual(['i18n:applied']);
    expect(applyLocale('<p data-i18n="key">x</p>')).toBe('translated markup');
    expect(translated).toContain(parsed.element);
    expect(events).toEqual(['i18n:applied']);
});

test('missing translation debug report reads native text and attribute fallbacks', async () => {
    const functions = {}, table = jest.fn();
    const element = { textContent: ' Text fallback ', getAttribute: name => ({ 'data-i18n': '[title][placeholder]Missing;Text missing', placeholder: 'Hint' })[name] ?? null,
        hasAttribute: name => name === 'placeholder' };
    class Document { constructor() { this.documentElement = {}; } querySelectorAll() { return [element]; } dispatchEvent() {} }
    const context = { Document, document: new Document(), MutationObserver: class { observe() {} }, CustomEvent: class {},
        readStoredUiLocale: () => 'en', UI_LOCALE_STORAGE_KEY: 'language', localStorage: { getItem: () => null },
        fetch: async () => ({ ok: true, json: async () => ({}) }),
        console: { log() {}, warn() {}, table }, applyI18nTranslations() {}, parseI18nAttributeSpecs,
        registerDebugFunction: (name, _label, _description, fn) => { functions[name] = fn; }, toastr: { success() {} } };
    const { initLocales } = load('i18n', context, 'initLocales');
    await initLocales();
    await functions.getMissingTranslations();
    const rows = table.mock.calls[0][0];
    expect(rows.map(({ key, value }) => [key, value])).toEqual([
        ['[title][placeholder]Missing', 'Hint'], ['Text missing', 'Text fallback'],
        ['[title][placeholder]Missing', 'Hint'], ['Text missing', 'Text fallback'],
    ]);
});
