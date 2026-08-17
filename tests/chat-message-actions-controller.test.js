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

    values() {
        return this.classes.values();
    }

    [Symbol.iterator]() {
        return this.classes.values();
    }
}

class FakeElement {
    constructor(classNames = []) {
        this.classList = new FakeClassList(classNames);
        this.children = [];
        this.parentElement = null;
        this.style = { display: '', opacity: '' };
        this.listeners = new Map();
        this.attributes = new Map();
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
            if (singleSelector.startsWith('[') && singleSelector.endsWith(']')) {
                const [rawName, rawValue] = singleSelector.slice(1, -1).split('=');
                const attributeName = rawName?.trim();
                if (!attributeName) {
                    return false;
                }

                if (rawValue === undefined) {
                    return this.attributes.has(attributeName);
                }

                const attributeValue = rawValue.trim().replace(/^["']|["']$/g, '');
                return this.getAttribute(attributeName) === attributeValue;
            }

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

    setAttribute(name, value) {
        this.attributes.set(name, String(value));
    }

    getAttribute(name) {
        return this.attributes.get(name) ?? null;
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

function createSnapshotMessageRow({ expanded = false } = {}) {
    const chatRoot = new FakeElement(['chat']);
    chatRoot.setAttribute('id', 'chat');
    const row = chatRoot.appendChild(new FakeElement(['mes']));
    row.setAttribute('mesid', '12');
    const swipeLeft = row.appendChild(new FakeElement(['swipe_left']));
    swipeLeft.setAttribute('role', 'button');
    const block = row.appendChild(new FakeElement(['mes_block']));
    const buttons = block.appendChild(new FakeElement(['mes_buttons']));
    const hint = buttons.appendChild(new FakeElement(['mes_button', 'extraMesButtonsHint']));
    hint.setAttribute('role', 'button');
    const extraButtons = buttons.appendChild(new FakeElement(['extraMesButtons']));
    if (expanded) {
        extraButtons.classList.add('visible');
    }

    for (const className of [
        'mes_copy',
        'mes_translate',
        'mes_edit_delete',
        'mes_reasoning_copy',
        'generation_failure_retry',
    ]) {
        const action = extraButtons.appendChild(new FakeElement(['mes_button', className]));
        action.setAttribute('role', 'button');
    }

    const bookmark = buttons.appendChild(new FakeElement(['mes_button', 'mes_bookmark']));
    bookmark.setAttribute('role', 'button');
    const edit = buttons.appendChild(new FakeElement(['mes_button', 'mes_edit']));
    edit.setAttribute('role', 'button');
    const swipeRight = row.appendChild(new FakeElement(['swipe_right']));
    swipeRight.setAttribute('role', 'button');

    return { chatRoot, row };
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

    test('builds a tier-aware action snapshot from the currently rendered row actions', async () => {
        const { buildMessageActionSnapshot } = await importFreshControllerModule();
        const { row } = createSnapshotMessageRow({ expanded: true });

        const snapshot = buildMessageActionSnapshot(row);

        expect(snapshot).toEqual({
            schema: 'mainChatMessageActionSnapshotSchema',
            messageId: '12',
            eligible: true,
            expanded: true,
            availableActions: expect.arrayContaining([
                'swipe_left',
                'extraMesButtonsHint',
                'mes_copy',
                'mes_translate',
                'mes_edit_delete',
                'mes_reasoning_copy',
                'generation_failure_retry',
                'mes_bookmark',
                'mes_edit',
                'swipe_right',
            ]),
            highFrequencyActions: ['extraMesButtonsHint', 'mes_copy', 'mes_edit'],
            secondaryActions: expect.arrayContaining(['mes_bookmark', 'mes_reasoning_copy', 'mes_translate']),
            dangerActions: ['mes_edit_delete'],
        });
    });

    test('treats hidden extra-actions hints as expanded when the delegated menu is open', async () => {
        const { buildMessageActionSnapshot } = await importFreshControllerModule();
        const { row } = createSnapshotMessageRow();
        const hint = row.querySelector('.extraMesButtonsHint');

        hint.style.display = 'none';

        const snapshot = buildMessageActionSnapshot(row);

        expect(snapshot?.expanded).toBe(true);
    });

    test('returns null when a message row cannot expose a safe action snapshot', async () => {
        const { buildMessageActionSnapshot } = await importFreshControllerModule();
        const invalidRow = new FakeElement(['mes']);

        expect(buildMessageActionSnapshot(invalidRow)).toBeNull();
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

    test('does not mutate React-owned message action output', async () => {
        const { createChatMessageActionsController } = await importFreshControllerModule();
        const root = new FakeElement(['root']);
        const messageRow = root.appendChild(new FakeElement(['mes']));
        messageRow.setAttribute('data-main-chat-message-row-owner', 'react');
        const buttons = messageRow.appendChild(new FakeElement(['mes_buttons']));
        const hint = buttons.appendChild(new FakeElement(['extraMesButtonsHint']));
        const extraButtons = buttons.appendChild(new FakeElement(['extraMesButtons']));
        const transitionElement = jest.fn((element, options) => options.complete?.call(element));

        const controller = createChatMessageActionsController(root, { transitionElement });
        controller.init();

        root.dispatchClick(hint);

        expect(hint.style.display).toBe('');
        expect(extraButtons.classList.contains('visible')).toBe(false);
        expect(extraButtons.style.display).toBe('');
        expect(transitionElement).not.toHaveBeenCalled();
    });

    test('reports state changes when the delegated extra message actions menu opens', async () => {
        const { createChatMessageActionsController } = await importFreshControllerModule();
        const { root, hint } = createMessageActionsRoot();
        const onStateChanged = jest.fn();
        const transitionElement = jest.fn((element, options) => options.complete?.call(element));

        const controller = createChatMessageActionsController(root, {
            onStateChanged,
            transitionElement,
        });
        controller.init();

        root.dispatchClick(hint);

        expect(onStateChanged).toHaveBeenCalledTimes(1);
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

    test('reports state changes when visible extra actions close on outside click', async () => {
        const { createChatMessageActionsController } = await importFreshControllerModule();
        const { root, hint, outside } = createMessageActionsRoot();
        const onStateChanged = jest.fn();
        const transitionElement = jest.fn((element, options) => options.complete?.call(element));

        const controller = createChatMessageActionsController(root, {
            onStateChanged,
            transitionElement,
        });
        controller.init();

        root.dispatchClick(hint);
        root.dispatchClick(outside);

        expect(onStateChanged).toHaveBeenCalledTimes(2);
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
