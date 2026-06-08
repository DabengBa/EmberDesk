import { describe, test, expect, jest } from '@jest/globals';

class FakeClassList {
    constructor(classNames = []) {
        this.classes = new Set(classNames);
    }

    add(...classNames) {
        for (const className of classNames) {
            this.classes.add(className);
        }
    }

    remove(...classNames) {
        for (const className of classNames) {
            this.classes.delete(className);
        }
    }

    contains(className) {
        return this.classes.has(className);
    }
}

class FakeElement {
    constructor(classNames = []) {
        this.classList = new FakeClassList(classNames);
        this.children = [];
        this.parentElement = null;
        this.style = { display: '', opacity: '' };
        this.listeners = new Map();
    }

    appendChild(child) {
        child.parentElement = this;
        this.children.push(child);
        return child;
    }

    addEventListener(type, callback, options = {}) {
        if (options.signal?.aborted) {
            return;
        }

        const listeners = this.listeners.get(type) ?? [];
        listeners.push(callback);
        this.listeners.set(type, listeners);
        options.signal?.addEventListener('abort', () => {
            this.listeners.set(type, (this.listeners.get(type) ?? []).filter(listener => listener !== callback));
        }, { once: true });
    }

    dispatchClick(target) {
        const event = {
            target,
            preventDefault: jest.fn(),
            stopPropagation: jest.fn(),
        };

        for (const listener of this.listeners.get('click') ?? []) {
            listener(event);
        }

        return event;
    }

    matches(selector) {
        const selectors = selector.split(',').map(value => value.trim());
        return selectors.some(singleSelector => {
            const classNames = singleSelector.split('.').filter(Boolean);
            return classNames.length > 0 && classNames.every(className => this.classList.contains(className));
        });
    }

    closest(selector) {
        let current = this;
        while (current) {
            if (current.matches(selector)) {
                return current;
            }
            current = current.parentElement;
        }

        return null;
    }

    querySelector(selector) {
        return this.querySelectorAll(selector)[0] ?? null;
    }

    querySelectorAll(selector) {
        const matches = [];
        const visit = (element) => {
            for (const child of element.children) {
                if (child.matches(selector)) {
                    matches.push(child);
                }
                visit(child);
            }
        };

        visit(this);
        return matches;
    }
}

function createMessageActionsRoot() {
    const root = new FakeElement(['root']);
    const row = root.appendChild(new FakeElement(['mes_buttons']));
    const hint = row.appendChild(new FakeElement(['extraMesButtonsHint']));
    const buttons = row.appendChild(new FakeElement(['extraMesButtons']));
    const outside = root.appendChild(new FakeElement(['outside']));

    return { root, row, hint, buttons, outside };
}

async function importFreshControllerModule() {
    return import(`../public/scripts/chat-message-actions-controller.js?cacheBust=${Date.now()}-${Math.random()}`);
}

describe('chat message actions controller', () => {
    test('declares task-based action tiers for core, secondary, and danger actions', async () => {
        const { MESSAGE_ACTION_TIERS } = await importFreshControllerModule();

        expect(MESSAGE_ACTION_TIERS.highFrequency).toEqual(expect.arrayContaining([
            'extraMesButtonsHint',
            'mes_copy',
            'mes_edit',
        ]));
        expect(MESSAGE_ACTION_TIERS.secondary).toEqual(expect.arrayContaining([
            'mes_bookmark',
            'mes_swipe_picker',
            'mes_reasoning_copy',
            'mes_gallery',
        ]));
        expect(MESSAGE_ACTION_TIERS.danger).toEqual(expect.arrayContaining([
            'mes_edit_delete',
            'mes_reasoning_delete',
        ]));
        expect(MESSAGE_ACTION_TIERS.danger).not.toEqual(expect.arrayContaining(['mes_copy', 'mes_edit']));
    });

    test('opens the delegated extra message actions menu', async () => {
        const { createChatMessageActionsController } = await importFreshControllerModule();
        const { root, hint, buttons } = createMessageActionsRoot();
        const transitionElement = jest.fn((element, options) => options.complete?.call(element));

        const controller = createChatMessageActionsController(root, { transitionElement });
        controller.init();

        root.dispatchClick(hint);

        expect(hint.style.display).toBe('none');
        expect(buttons.classList.contains('visible')).toBe(true);
        expect(buttons.style.display).toBe('flex');
        expect(transitionElement).toHaveBeenCalledTimes(2);
    });

    test('does not bind duplicate delegated listeners after repeated init', async () => {
        const { createChatMessageActionsController } = await importFreshControllerModule();
        const { root, hint } = createMessageActionsRoot();
        const transitionElement = jest.fn((element, options) => options.complete?.call(element));

        const controller = createChatMessageActionsController(root, { transitionElement });
        controller.init();
        controller.init();

        root.dispatchClick(hint);

        expect(transitionElement).toHaveBeenCalledTimes(2);
    });

    test('closes visible extra actions on outside click unless expanded actions are enabled', async () => {
        const { createChatMessageActionsController } = await importFreshControllerModule();
        const { root, hint, buttons, outside } = createMessageActionsRoot();
        const transitionElement = jest.fn((element, options) => options.complete?.call(element));

        const controller = createChatMessageActionsController(root, { transitionElement });
        controller.init();

        root.dispatchClick(hint);
        root.dispatchClick(outside);

        expect(buttons.classList.contains('visible')).toBe(false);
        expect(buttons.style.display).toBe('none');
        expect(hint.style.display).toBe('');
    });

    test('leaves visible extra actions open when expanded actions are enabled', async () => {
        const { createChatMessageActionsController } = await importFreshControllerModule();
        const { root, hint, buttons, outside } = createMessageActionsRoot();
        const transitionElement = jest.fn((element, options) => options.complete?.call(element));

        const controller = createChatMessageActionsController(root, {
            getExpandMessageActions: () => true,
            transitionElement,
        });
        controller.init();

        root.dispatchClick(hint);
        root.dispatchClick(outside);

        expect(buttons.classList.contains('visible')).toBe(true);
        expect(buttons.style.display).toBe('flex');
    });

    test('cleanup removes delegated listeners', async () => {
        const { createChatMessageActionsController } = await importFreshControllerModule();
        const { root, hint, buttons } = createMessageActionsRoot();
        const transitionElement = jest.fn((element, options) => options.complete?.call(element));

        const controller = createChatMessageActionsController(root, { transitionElement });
        controller.init();
        controller.cleanup();

        root.dispatchClick(hint);

        expect(buttons.classList.contains('visible')).toBe(false);
        expect(transitionElement).not.toHaveBeenCalled();
    });

    test('can initialize again after cleanup with a fresh listener signal', async () => {
        const { createChatMessageActionsController } = await importFreshControllerModule();
        const { root, hint, buttons } = createMessageActionsRoot();
        const transitionElement = jest.fn((element, options) => options.complete?.call(element));

        const controller = createChatMessageActionsController(root, { transitionElement });
        controller.init();
        controller.cleanup();
        controller.init();

        root.dispatchClick(hint);

        expect(buttons.classList.contains('visible')).toBe(true);
        expect(transitionElement).toHaveBeenCalledTimes(2);
    });
});
