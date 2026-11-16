import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

// Component-level DOM double: real browser/dialog and real jQuery integration are
// separately owned by the coordinator's browser validation.
class Element {
    constructor(tag = 'div') {
        this.tagName = tag.toUpperCase();
        this.nodeType = 1;
        this.children = [];
        this.parentNode = null;
        this.attributes = {};
        this.style = {};
        this.listeners = {};
        this.className = '';
        this.textContent = '';
        this.innerHTML = '';
        this.classList = {
            add: (...names) => { this.className = [...new Set([...this.className.split(' ').filter(Boolean), ...names])].join(' '); },
            contains: name => this.className.split(' ').includes(name),
        };
    }
    setAttribute(name, value) { this.attributes[name] = String(value); if (name === 'id') this.id = String(value); }
    append(...nodes) { for (const node of nodes) { node.remove(); node.parentNode = this; this.children.push(node); } }
    replaceChildren(...nodes) { for (const child of [...this.children]) child.remove(); this.append(...nodes); }
    prepend(...nodes) { for (const node of nodes.reverse()) { node.remove(); node.parentNode = this; this.children.unshift(node); } }
    remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; }
    contains(node) { return this === node || this.children.some(child => child.contains(node)); }
    addEventListener(type, callback) { (this.listeners[type] ??= []).push(callback); }
    dispatch(type, event = {}) {
        const e = { target: this, stopPropagation() { this.stopped = true; }, ...event };
        for (const callback of this.listeners[type] ?? []) callback(e);
        if (!e.stopped && this.parentNode) this.parentNode.dispatch(type, e);
    }
    querySelector(selector) {
        for (const child of this.children) {
            if (selector.startsWith('.') && child.classList.contains(selector.slice(1))) return child;
            const found = child.querySelector(selector);
            if (found) return found;
        }
        return null;
    }
}

const originalDocument = globalThis.document;
const originalJQuery = globalThis.jQuery;
const fakeJQuery = element => ({ 0: element, length: element ? 1 : 0, jquery: 'test' });
let notifications;
let sanitize;

beforeEach(async () => {
    jest.useFakeTimers();
    const body = new Element('body');
    globalThis.document = {
        body,
        activeElement: null,
        createElement: tag => new Element(tag),
        getElementById: id => {
            const find = element => element.id === id ? element : element.children.map(find).find(Boolean);
            return find(body) ?? null;
        },
        querySelector: selector => selector === 'body' ? body : null,
    };
    globalThis.jQuery = fakeJQuery;
    jest.resetModules();
    sanitize = jest.fn(input => {
        const fragment = new Element('fragment');
        fragment.textContent = `sanitized: ${input}`;
        return fragment;
    });
    jest.unstable_mockModule('../public/lib.js', () => ({ DOMPurify: { sanitize } }));
    notifications = (await import('../public/scripts/notifications.js')).default;
    notifications.options = { showDuration: 0, hideDuration: 0 };
});

afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
    if (originalJQuery === undefined) delete globalThis.jQuery; else globalThis.jQuery = originalJQuery;
});

describe('native notifications compatibility', () => {
    test('routes both HTML strings through the sanitizer, including global false', () => {
        notifications.options.escapeHtml = false;
        const message = '<img src=x onerror=alert(1)><b>message</b>';
        const title = '<svg onload=alert(2)></svg><u>title</u>';
        const toast = notifications.info(message, title, { timeOut: 0 });
        expect(sanitize).toHaveBeenCalledWith(message, { RETURN_DOM_FRAGMENT: true });
        expect(sanitize).toHaveBeenCalledWith(title, { RETURN_DOM_FRAGMENT: true });
        expect(toast[0].querySelector('.toast-message').children[0].textContent).toBe(`sanitized: ${message}`);
        expect(toast[0].querySelector('.toast-title').children[0].textContent).toBe(`sanitized: ${title}`);
    });

    test('exposes a notification API and escapes strings by default, with explicit trusted HTML', () => {
        expect(notifications).toBeDefined();
        const safe = notifications.info('<img src=x onerror=bad()>', '<b>title</b>', { timeOut: 0 });
        expect(safe[0].querySelector('.toast-message').textContent).toBe('<img src=x onerror=bad()>');
        expect(safe[0].querySelector('.toast-title').textContent).toBe('<b>title</b>');
        const trusted = notifications.success('<b>ok</b>', '', { escapeHtml: false, timeOut: 0 });
        expect(trusted[0].querySelector('.toast-message').children[0].textContent).toBe('sanitized: <b>ok</b>');
    });

    test('preserves supplied DOM and listeners, sticky progress, and force clear with focus', () => {
        const button = globalThis.document.createElement('button');
        const clicked = jest.fn();
        button.addEventListener('click', clicked);
        const toast = notifications.info(fakeJQuery(button), 'Loading', { timeOut: 0, extendedTimeOut: 0, tapToDismiss: false, progressBar: true });
        expect(toast[0].querySelector('.toast-message').children[0]).toBe(button);
        expect(toast[0].querySelector('.toast-progress')).not.toBeNull();
        button.dispatch('click');
        expect(clicked).toHaveBeenCalledTimes(1);
        jest.advanceTimersByTime(20000);
        expect(toast[0].parentNode).not.toBeNull();
        globalThis.document.activeElement = button;
        notifications.clear(toast);
        expect(toast[0].parentNode).not.toBeNull();
        notifications.clear(toast, { force: true });
        expect(toast[0].parentNode).toBeNull();
    });

    test('click and close callbacks dismiss once; close does not invoke onclick', () => {
        const onclick = jest.fn(); const onCloseClick = jest.fn(); const onHidden = jest.fn();
        const clicked = notifications.warning('retry', '', { timeOut: 0, onclick, onHidden });
        clicked[0].dispatch('click');
        expect(onclick).toHaveBeenCalledTimes(1);
        expect(onHidden).toHaveBeenCalledTimes(1);
        expect(clicked[0].parentNode).toBeNull();
        const closed = notifications.error('error', '', { timeOut: 0, closeButton: true, onclick, onCloseClick, onHidden });
        closed[0].querySelector('.toast-close-button').dispatch('click');
        expect(onCloseClick).toHaveBeenCalledTimes(1);
        expect(onclick).toHaveBeenCalledTimes(1);
        expect(onHidden).toHaveBeenCalledTimes(2);
        expect(closed[0].parentNode).toBeNull();
    });

    test('click dismisses a focused toast but preserves a focused descendant', () => {
        const self = notifications.info('focused toast', '', { timeOut: 0 });
        globalThis.document.activeElement = self[0];
        self[0].dispatch('click');
        expect(self[0].parentNode).toBeNull();

        const input = globalThis.document.createElement('input');
        const containing = notifications.info(input, '', { timeOut: 0 });
        globalThis.document.activeElement = input;
        input.dispatch('click');
        expect(containing[0].parentNode).not.toBeNull();
        notifications.clear(containing);
        expect(containing[0].parentNode).not.toBeNull();
        notifications.clear(containing, { force: true });
        expect(containing[0].parentNode).toBeNull();
    });

    test('clearing a stale or empty specified handle does not clear other notifications', () => {
        const stale = notifications.info('A', '', { timeOut: 0 });
        notifications.clear(stale);
        const active = notifications.info('B', '', { timeOut: 0 });
        notifications.clear(stale);
        expect(active[0].parentNode).not.toBeNull();
        notifications.clear(fakeJQuery(null));
        expect(active[0].parentNode).not.toBeNull();
        notifications.clear(undefined);
        expect(active[0].parentNode).toBeNull();
    });

    test('publishes visibility with options and reuses a container moved inside a dialog', () => {
        const subscriber = jest.fn();
        notifications.subscribe(subscriber);
        const dialog = globalThis.document.createElement('dialog');
        globalThis.document.body.append(dialog);
        const container = globalThis.document.createElement('div');
        container.setAttribute('id', 'toast-container');
        dialog.append(container);
        const toast = notifications.info('hello', '', { timeOut: 10 });
        expect(toast[0].parentNode).toBe(container);
        expect(notifications.getContainer(undefined, false)[0]).toBe(container);
        expect(subscriber.mock.calls[0][0]).toMatchObject({ state: 'visible', options: { timeOut: 10 } });
        jest.advanceTimersByTime(10);
        expect(subscriber.mock.calls[1][0].state).toBe('hidden');
    });

    test('prevents consecutive duplicates and clear(undefined) clears all unfocused toasts', () => {
        const first = notifications.info('same', '', { timeOut: 0, preventDuplicates: true });
        expect(notifications.info('same', '', { timeOut: 0, preventDuplicates: true })).toBeUndefined();
        const other = notifications.info('other', '', { timeOut: 0 });
        notifications.clear(undefined);
        expect(first[0].parentNode).toBeNull();
        expect(other[0].parentNode).toBeNull();
    });

    test('hover pauses a timeout and the extended timeout starts on leave', () => {
        const hidden = jest.fn();
        const toast = notifications.info('timed', '', { timeOut: 100, extendedTimeOut: 80, progressBar: true, onHidden: hidden });
        jest.advanceTimersByTime(50);
        expect(Number.parseFloat(toast[0].querySelector('.toast-progress').style.width)).toBeLessThanOrEqual(50);
        toast[0].dispatch('mouseenter');
        jest.advanceTimersByTime(1000);
        expect(toast[0].parentNode).not.toBeNull();
        toast[0].dispatch('mouseleave');
        jest.advanceTimersByTime(79);
        expect(toast[0].parentNode).not.toBeNull();
        jest.advanceTimersByTime(1);
        expect(toast[0].parentNode).toBeNull();
        expect(hidden).toHaveBeenCalledTimes(1);
    });

    test('supports global options, per-toast overrides, and both insertion orders', () => {
        notifications.options = { newestOnTop: false, timeOut: 0, positionClass: 'toast-top-center', showDuration: 0, hideDuration: 0 };
        const first = notifications.success('first');
        const second = notifications.error('second');
        const newest = notifications.warning('newest', '', { newestOnTop: true });
        const container = notifications.getContainer(undefined, false)[0];
        expect(container.className).toBe('toast-top-center');
        expect(container.children).toEqual([newest[0], first[0], second[0]]);
        expect(first[0].attributes['aria-live']).toBe('polite');
        expect(second[0].attributes['aria-live']).toBe('assertive');
    });

    test('fades with configured durations and publishes lifecycle after animation completes', () => {
        const lifecycle = [];
        notifications.subscribe(event => lifecycle.push(event.state));
        const toast = notifications.info('animated', '', {
            timeOut: 0, showDuration: 250, hideDuration: 180, showEasing: 'linear', hideEasing: 'linear',
            onShown: () => lifecycle.push('shown'), onHidden: () => lifecycle.push('onHidden'),
        });
        expect(lifecycle).toEqual(['visible']);
        expect(toast[0].style.transition).toContain('250ms linear');
        jest.advanceTimersByTime(249);
        expect(lifecycle).toEqual(['visible']);
        jest.advanceTimersByTime(1);
        expect(lifecycle).toEqual(['visible', 'shown']);
        toast[0].dispatch('click');
        expect(toast[0].parentNode).not.toBeNull();
        expect(toast[0].style.transition).toContain('180ms linear');
        jest.advanceTimersByTime(179);
        expect(lifecycle).toEqual(['visible', 'shown']);
        jest.advanceTimersByTime(1);
        expect(toast[0].parentNode).toBeNull();
        expect(lifecycle).toEqual(['visible', 'shown', 'onHidden', 'hidden']);
    });

    test('queues dismissal during fade-in, respects close overrides and clears without hidden callback', () => {
        const lifecycle = [];
        const toast = notifications.info('animated', '', {
            timeOut: 0, closeButton: true, showDuration: 100, hideDuration: 200, closeDuration: 50,
            onShown: () => lifecycle.push('shown'), onHidden: () => lifecycle.push('hidden'),
        });
        toast[0].querySelector('.toast-close-button').dispatch('click');
        jest.advanceTimersByTime(99);
        expect(lifecycle).toEqual([]);
        jest.advanceTimersByTime(1);
        expect(lifecycle).toEqual(['shown']);
        jest.advanceTimersByTime(49);
        expect(toast[0].parentNode).not.toBeNull();
        jest.advanceTimersByTime(1);
        expect(lifecycle).toEqual(['shown', 'hidden']);
        expect(toast[0].parentNode).toBeNull();

        const cleared = notifications.info('clear', '', { timeOut: 0, hideDuration: 80, onHidden: () => lifecycle.push('unexpected') });
        notifications.clear(cleared);
        expect(cleared[0].parentNode).not.toBeNull();
        jest.advanceTimersByTime(80);
        expect(cleared[0].parentNode).toBeNull();
        expect(lifecycle).toEqual(['shown', 'hidden']);
    });

    test('timeout waits for fade-in before fading out; remove cancels pending callbacks', () => {
        const events = [];
        const timed = notifications.info('timed', '', {
            timeOut: 30, showDuration: 100, hideDuration: 80,
            onShown: () => events.push('shown'), onHidden: () => events.push('hidden'),
        });
        jest.advanceTimersByTime(100);
        expect(events).toEqual(['shown']);
        expect(timed[0].parentNode).not.toBeNull();
        jest.advanceTimersByTime(80);
        expect(events).toEqual(['shown', 'hidden']);
        expect(timed[0].parentNode).toBeNull();

        const removed = notifications.info('removed', '', {
            timeOut: 0, showDuration: 100, onShown: () => events.push('unexpected'),
        });
        notifications.remove(removed);
        jest.advanceTimersByTime(100);
        expect(removed[0].parentNode).toBeNull();
        expect(events).toEqual(['shown', 'hidden']);
    });
});
