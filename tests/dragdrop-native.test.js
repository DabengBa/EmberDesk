import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { DragAndDropHandler } from '../public/scripts/dragdrop.js';

// Component-level DOM double: dispatch bubbles to the real production handler.
class Node {
    constructor(id = '') {
        this.id = id;
        this.parentElement = null;
        this.children = [];
        this.listeners = new Map();
        const classes = new Set();
        this.classList = { add: (...names) => names.forEach(name => classes.add(name)), remove: (...names) => names.forEach(name => classes.delete(name)), contains: name => classes.has(name) };
    }
    append(child) { child.parentElement = this; this.children.push(child); return child; }
    matches(selector) { return selector === 'body' ? this.id === 'body' : selector === `#${this.id}`; }
    addEventListener(type, handler) { const list = this.listeners.get(type) ?? []; list.push(handler); this.listeners.set(type, list); }
    removeEventListener(type, handler) { this.listeners.set(type, (this.listeners.get(type) ?? []).filter(item => item !== handler)); }
    dispatch(type, dataTransfer = { files: [], items: [] }) {
        const event = { type, target: this, dataTransfer, defaultPrevented: false, stopped: false, immediateStopped: false,
            preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; },
            stopImmediatePropagation() { this.stopped = true; this.immediateStopped = true; } };
        for (let node = this; node; node = node.parentElement) {
            event.currentTarget = node;
            for (const listener of [...(node.listeners.get(type) ?? [])]) { listener(event); if (event.immediateStopped) break; }
            if (event.stopped) break;
        }
        return event;
    }
}

let body;
const oldDocument = globalThis.document;
const oldDollar = globalThis.$;
beforeEach(() => {
    jest.useFakeTimers();
    body = new Node('body');
    globalThis.document = { body, querySelectorAll: selector => {
        const found = [];
        function visit(node) { if (node.matches(selector)) found.push(node); node.children.forEach(visit); }
        visit(body); return found;
    } };
    globalThis.$ = () => { throw new Error('dragdrop must not require jQuery'); };
});
afterEach(() => {
    jest.clearAllTimers(); jest.useRealTimers();
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
    if (oldDollar === undefined) delete globalThis.$; else globalThis.$ = oldDollar;
});

test('delegated targets take priority over body, preserve real files and legacy originalEvent, including dynamic descendants', () => {
    const fallback = jest.fn(); const chat = jest.fn(); const wi = jest.fn();
    const bodyHandler = new DragAndDropHandler('body', fallback, { noAnimation: true });
    const chatHandler = new DragAndDropHandler('#select_chat_popup', chat);
    const wiHandler = new DragAndDropHandler('#world_popup', wi);
    const popup = body.append(new Node('select_chat_popup')); const child = popup.append(new Node('child'));
    const transfer = { files: [{ name: 'chat.json' }], items: ['url'] };
    const event = child.dispatch('drop', transfer);
    expect(event.defaultPrevented).toBe(true); expect(event.stopped).toBe(true);
    expect(chat).toHaveBeenCalledTimes(1); expect(chat.mock.calls[0][0]).toEqual(transfer.files);
    expect(chat.mock.calls[0][1].originalEvent).toBe(event);
    expect(chat.mock.calls[0][1].currentTarget).toBe(popup);
    expect(fallback).not.toHaveBeenCalled(); expect(wi).not.toHaveBeenCalled();
    const wiPopup = body.append(new Node('world_popup'));
    wiPopup.dispatch('drop', transfer); expect(wi).toHaveBeenCalledTimes(1);
    body.dispatch('drop', { files: [], items: ['url'] });
    expect(fallback.mock.calls[0][1].originalEvent.dataTransfer.items).toEqual(['url']);
    bodyHandler.destroy(); chatHandler.destroy(); wiHandler.destroy();
});

test('drag styling and debounced leave, destroy and repeat init stop and restart without duplicate callbacks', () => {
    const popup = body.append(new Node('form_sheld')); const callback = jest.fn();
    const handler = new DragAndDropHandler('#form_sheld', callback, { noAnimation: true });
    expect(popup.classList.contains('drop_target')).toBe(true);
    expect(popup.classList.contains('no_animation')).toBe(true);
    popup.dispatch('dragover'); expect(popup.classList.contains('dragover')).toBe(true);
    popup.dispatch('dragleave'); jest.advanceTimersByTime(10000);
    expect(popup.classList.contains('dragover')).toBe(false);
    popup.dispatch('dragover'); popup.dispatch('drop', { files: ['file'], items: [] });
    expect(popup.classList.contains('dragover')).toBe(false);
    expect(callback).toHaveBeenCalledTimes(1);
    handler.destroy(); handler.destroy(); popup.dispatch('drop');
    expect(callback).toHaveBeenCalledTimes(1);
    expect(popup.classList.contains('drop_target')).toBe(false);
    expect(popup.classList.contains('no_animation')).toBe(false);
    handler.init(); handler.init(); popup.dispatch('drop');
    expect(callback).toHaveBeenCalledTimes(2);
    handler.destroy();
});

test('nearest nested delegated target wins; multiple handlers at that target run in registration order', () => {
    const outer = body.append(new Node('world_popup')); const inner = outer.append(new Node('select_chat_popup'));
    const calls = [];
    const handlers = [new DragAndDropHandler('body', () => calls.push('body')), new DragAndDropHandler('#world_popup', () => calls.push('outer')), new DragAndDropHandler('#select_chat_popup', () => calls.push('inner1')), new DragAndDropHandler('#select_chat_popup', () => calls.push('inner2'))];
    inner.dispatch('drop'); expect(calls).toEqual(['inner1', 'inner2']);
    handlers.forEach(handler => handler.destroy());
});

test('stopImmediatePropagation in one drop callback prevents later handlers for that same target', () => {
    const target = body.append(new Node('world_popup')); const calls = [];
    const first = new DragAndDropHandler('#world_popup', (_, event) => { calls.push('first'); event.stopImmediatePropagation(); });
    const second = new DragAndDropHandler('#world_popup', () => calls.push('second'));
    body.addEventListener('drop', () => calls.push('later body listener'));
    target.dispatch('drop');
    expect(calls).toEqual(['first']);
    first.destroy(); second.destroy();
});

test('destroy clears a pending leave before restart and leaves other selectors operational', () => {
    const firstTarget = body.append(new Node('world_popup')); const secondTarget = body.append(new Node('form_sheld'));
    const firstCallback = jest.fn(); const secondCallback = jest.fn();
    const first = new DragAndDropHandler('#world_popup', firstCallback);
    const second = new DragAndDropHandler('#form_sheld', secondCallback);
    firstTarget.dispatch('dragover'); firstTarget.dispatch('dragleave'); first.destroy();
    expect(firstTarget.classList.contains('dragover')).toBe(false);
    firstTarget.dispatch('drop'); expect(firstCallback).not.toHaveBeenCalled();
    secondTarget.dispatch('drop'); expect(secondCallback).toHaveBeenCalledTimes(1);
    first.init(); firstTarget.dispatch('dragover'); jest.advanceTimersByTime(10000);
    expect(firstTarget.classList.contains('dragover')).toBe(true);
    firstTarget.dispatch('drop'); expect(firstCallback).toHaveBeenCalledTimes(1);
    first.destroy(); second.destroy();
});

test('destroy preserves styling owned by another active handler on the same target', () => {
    const target = body.append(new Node('world_popup'));
    const first = new DragAndDropHandler('#world_popup', () => {}, { noAnimation: true });
    const second = new DragAndDropHandler('#world_popup', () => {}, { noAnimation: true });
    target.dispatch('dragover'); first.destroy(); first.destroy();
    expect(target.classList.contains('drop_target')).toBe(true);
    expect(target.classList.contains('no_animation')).toBe(true);
    expect(target.classList.contains('dragover')).toBe(true);
    second.destroy();
    expect(target.classList.contains('drop_target')).toBe(false);
    expect(target.classList.contains('no_animation')).toBe(false);
    expect(target.classList.contains('dragover')).toBe(false);
});
