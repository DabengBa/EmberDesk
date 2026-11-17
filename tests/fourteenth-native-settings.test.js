import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from '@jest/globals';

const source = name => readFileSync(new URL(`../public/scripts/${name}`, import.meta.url), 'utf8');
function extract(text, signature) {
    const start = text.indexOf(signature);
    assert.notEqual(start, -1);
    const end = text.indexOf('\n}', start) + 2;
    return text.slice(start, end).replace('export ', '');
}

test('token counting caches, invalidates and updates totals without jQuery', async () => {
    const ross = source('RossAscends-mods.js');
    const power = source('power-user.js');
    const input = { value: 'hello', dataset: {} };
    const counter = { dataset: { tokenCounter: 'input', tokenPermanent: 'true' }, textContent: '' };
    const classes = { toggle(name, value) { this[name] = value; } };
    const nodes = { input, result_info_total_tokens: {}, result_info_permanent_tokens: {}, result_info_text: { classList: classes }, chartokenwarning: { style: {} } };
    let calls = 0;
    const document = { querySelectorAll: () => [counter], getElementById: id => nodes[id] ?? null };
    const ctx = { document, Date, counterNonce: 0, getStringHash: value => value.length, menu_type: 'create', getTokenCountAsync: async () => { calls++; return 3; }, main_api: 'other', max_context: 2048, oai_settings: {} };
    const count = runInNewContext(`(${extract(ross, 'export async function RA_CountCharTokens()')})`, ctx);
    await count(); await count();
    assert.equal(calls, 1); assert.equal(counter.textContent, '3');
    assert.equal(nodes.result_info_total_tokens.textContent, '3');
    assert.equal(nodes.result_info_permanent_tokens.textContent, '3');
    const force = runInNewContext(`(${extract(power, 'export function forceCharacterEditorTokenize()')})`, { document, Event });
    force(); await count(); assert.equal(calls, 2);
});

test('settings modules contain no jQuery dependency', () => {
    for (const file of ['RossAscends-mods.js', 'power-user.js', 'feature-settings.js']) {
        assert.doesNotMatch(source(file), /\bjQuery\s*[.(]|\$\s*\(/, file);
    }
});

test('native drag moves from the header, clamps on style mutation and unbinds on reinitialization', () => {
    const ross = source('RossAscends-mods.js');
    const emitter = () => ({ listeners: {}, addEventListener(type, fn) { (this.listeners[type] ??= new Set()).add(fn); }, removeEventListener(type, fn) { this.listeners[type]?.delete(fn); }, fire(type, event) { for (const fn of this.listeners[type] ?? []) fn(event); } });
    const doc = emitter(); const header = emitter(); const element = emitter();
    Object.assign(element, { id: 'panel', style: { width: '100px', height: '100px', top: '10px', left: '10px' }, offsetWidth: 100, classList: { contains: () => false }, setAttribute(name, value) { this[name] = value; }, getBoundingClientRect() { return { left: 10, top: 10, right: 110, bottom: 110 }; } });
    doc.getElementById = () => header;
    let observer;
    class MutationObserver { constructor(fn) { this.fn = fn; observer = this; } observe() {} disconnect() {} }
    const emitted = [];
    const drag = runInNewContext(`(${extract(ross, 'export function dragElement(element)')})`, {
        document: doc, window: { innerWidth: 200, innerHeight: 200, scrollX: 0, scrollY: 0 }, MutationObserver,
        getComputedStyle: target => target.style, dragCleanups: new WeakMap(), isVisible: () => true,
        isMobile: () => false, eventSource: { emit(...args) { emitted.push(args); } },
    });
    drag(element); drag(element);
    assert.equal(header.listeners.mousedown.size, 1);
    header.fire('mousedown', { target: { classList: { contains: () => true } }, clientX: 10, clientY: 10, preventDefault() {} });
    doc.fire('mousemove', { clientX: 30, clientY: 35, preventDefault() {} });
    assert.equal(element.style.left, '30px'); assert.equal(element.style.top, '35px');
    element.style.left = '180px'; observer.fn([{ target: element }]);
    assert.equal(element.style.left, '99px');
    doc.fire('mouseup', {}); assert.equal(element['data-dragged'], 'false');
    assert.equal(doc.listeners.mousemove.size, 0);
    element.fire('mousedown', { clientX: 105, clientY: 105 });
    observer.fn([{ target: element }]);
    element.fire('mouseup', {});
    assert.deepEqual(emitted, [['resizeUI', 'panel']]);
});

test('reduced motion updates native classes and duration', () => {
    const power = source('power-user.js');
    const classes = { toggle(name, value) { this[name] = value; } };
    let duration;
    const apply = runInNewContext(`(${extract(power, 'function switchReducedMotion()')})`, {
        window: { matchMedia: () => ({ matches: true }) }, document: { body: { classList: classes } },
        setAnimationDuration: value => { duration = value; }, ANIMATION_DURATION_DEFAULT: 200,
    });
    apply(); assert.equal(duration, 0); assert.equal(classes['reduced-motion'], true);
});

test('Escape honors React preventDefault and otherwise reaches drawer handlers in order', async () => {
    const ross = source('RossAscends-mods.js');
    const handlers = {};
    const win = { innerWidth: 1200, addEventListener: (type, fn) => { handlers[`window:${type}`] = fn; } };
    const doc = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: (type, fn) => { handlers[`document:${type}`] = fn; } };
    const seen = [];
    const init = runInNewContext(`(${extract(ross, 'export function initRossMods(')})`, {
        document: doc, window: win, RA_checkOnlineStatus() {}, eventSource: { on() {} }, event_types: {},
        power_user: { auto_connect: false }, isMobile: () => false, OpenNavPanels() {}, subscribeComposerValue() {},
        restoreUserInput() {}, countTokensDebounced() {}, saveUserInputDebounced() {},
        Popup: { util: { isPopupOpen: () => false } }, isVisible: () => false,
    });
    init({ drawerService: { initializePins() {}, handleEscape: name => { seen.push(name); return name === 'world'; } } });
    await handlers['window:keydown']({ key: 'Escape', defaultPrevented: true });
    assert.deepEqual(seen, []);
    await handlers['window:keydown']({ key: 'Escape', defaultPrevented: false });
    assert.deepEqual(seen, ['primary', 'world']);
});
