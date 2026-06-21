export const MESSAGE_ACTION_TIERS = Object.freeze({
    highFrequency: ['extraMesButtonsHint', 'mes_copy', 'mes_edit'],
    secondary: ['mes_bookmark', 'mes_swipe_picker', 'mes_reasoning_copy', 'mes_gallery', 'mes_translate', 'mes_narrate', 'mes_hide'],
    danger: ['mes_edit_delete', 'mes_reasoning_delete'],
});

const EXTRA_ACTIONS_HINT_SELECTOR = '.extraMesButtonsHint';
const EXTRA_ACTIONS_SELECTOR = '.extraMesButtons';
const EXTRA_ACTIONS_OPEN_SELECTOR = '.extraMesButtons.visible';
const EXTRA_ACTIONS_CLICK_AREA_SELECTOR = '.extraMesButtons, .extraMesButtonsHint';
const MESSAGE_ACTION_SNAPSHOT_SCHEMA = 'mainChatMessageActionSnapshotSchema';
const GENERIC_MESSAGE_ACTION_CLASSES = new Set([
    'mes_button',
    'menu_button',
    'edit_button',
    'right_menu_button',
    'interactable',
    'displayNone',
]);

function getDefaultExpandMessageActionsState() {
    return globalThis.document?.body?.classList?.contains?.('expandMessageActions') === true;
}

function isElementLike(value) {
    return Boolean(
        value
        && typeof value === 'object'
        && typeof value.querySelectorAll === 'function'
        && typeof value.getAttribute === 'function',
    );
}

function getMessageActionNameFromClassList(classList) {
    for (const className of classList ?? []) {
        if (!className || GENERIC_MESSAGE_ACTION_CLASSES.has(className) || className.startsWith('fa-')) {
            continue;
        }

        if (
            className === 'extraMesButtonsHint'
            || className === 'swipe_left'
            || className === 'swipe_right'
            || className === 'generation_failure_retry'
            || className.startsWith('sd_')
        ) {
            return className;
        }

        if (className.startsWith('mes_')) {
            return className;
        }
    }

    return null;
}

function getVisibleMessageActionNames(messageRow) {
    const availableActions = [];
    const seenActions = new Set();
    const actionNodes = Array.from(messageRow.querySelectorAll?.('[role="button"]') ?? []);

    for (const actionNode of actionNodes) {
        const actionName = getMessageActionNameFromClassList(actionNode.classList);
        if (!actionName || seenActions.has(actionName)) {
            continue;
        }

        seenActions.add(actionName);
        availableActions.push(actionName);
    }

    return availableActions;
}

/**
 * Builds a DOM-derived message-action snapshot without changing legacy ownership.
 * @param {Element} messageRow Message row candidate
 * @param {object} [dependencyOverrides] Runtime dependency overrides
 * @param {() => boolean} [dependencyOverrides.getExpandMessageActions] Reads expanded action setting
 * @returns {object|null}
 */
export function buildMessageActionSnapshot(messageRow, dependencyOverrides = {}) {
    if (!isElementLike(messageRow)) {
        return null;
    }

    const messageId = String(messageRow.getAttribute('mesid') ?? '').trim();
    if (!messageId || !messageRow.querySelector?.('.mes_buttons')) {
        return null;
    }

    const getExpandMessageActions = dependencyOverrides.getExpandMessageActions ?? getDefaultExpandMessageActionsState;
    const availableActions = getVisibleMessageActionNames(messageRow);
    const extraButtons = messageRow.querySelector('.extraMesButtons');
    const expanded = Boolean(
        getExpandMessageActions()
        || extraButtons?.classList?.contains?.('visible')
        || messageRow.querySelector('.extraMesButtonsHint')?.style?.display === 'none',
    );

    return {
        schema: MESSAGE_ACTION_SNAPSHOT_SCHEMA,
        messageId,
        eligible: true,
        expanded,
        availableActions,
        highFrequencyActions: MESSAGE_ACTION_TIERS.highFrequency.filter(actionName => availableActions.includes(actionName)),
        secondaryActions: MESSAGE_ACTION_TIERS.secondary.filter(actionName => availableActions.includes(actionName)),
        dangerActions: MESSAGE_ACTION_TIERS.danger.filter(actionName => availableActions.includes(actionName)),
    };
}

function defaultTransitionElement(element, options) {
    const transition = globalThis.$?.(element)?.transition;

    if (typeof transition === 'function') {
        globalThis.$(element).transition(options);
        return;
    }

    if (options.opacity !== undefined) {
        element.style.opacity = String(options.opacity);
    }
    options.complete?.call(element);
}

function findExtraButtonsForHint(hint) {
    return hint.parentElement?.querySelector?.(EXTRA_ACTIONS_SELECTOR) ?? null;
}

/**
 * Creates a root-scoped controller for low-risk message action menu affordances.
 * @param {Document|HTMLElement} root Event root
 * @param {object} [dependencyOverrides] Runtime dependency overrides
 * @param {() => boolean} [dependencyOverrides.getExpandMessageActions] Reads expanded action setting
 * @param {(element: Element, options: object) => void} [dependencyOverrides.transitionElement] Transition adapter
 * @param {number} [dependencyOverrides.animationDuration] Transition duration
 * @param {string} [dependencyOverrides.animationEasing] Transition easing
 * @param {() => void} [dependencyOverrides.onStateChanged] Bridge callback after DOM state changes
 * @returns {{init: () => void, cleanup: () => void, openExtraActions: (hint: Element) => void, closeExtraActions: () => void}}
 */
export function createChatMessageActionsController(root = globalThis.document, dependencyOverrides = {}) {
    if (!root) {
        throw new Error('Chat message actions controller requires a root');
    }

    const dependencies = {
        getExpandMessageActions: () => false,
        transitionElement: defaultTransitionElement,
        animationDuration: 0,
        animationEasing: 'linear',
        onStateChanged: () => {},
        ...dependencyOverrides,
    };
    let abortController = null;
    let initialized = false;

    function transitionElement(element, options) {
        dependencies.transitionElement(element, {
            duration: dependencies.animationDuration,
            easing: dependencies.animationEasing,
            ...options,
        });
    }

    function openExtraActions(hint) {
        const buttons = findExtraButtonsForHint(hint);

        if (!buttons) {
            return;
        }

        transitionElement(hint, {
            opacity: 0,
            complete() {
                hint.style.display = 'none';
                buttons.classList.add('visible');
                buttons.style.opacity = '0';
                buttons.style.display = 'flex';
                transitionElement(buttons, { opacity: 1 });
                dependencies.onStateChanged();
            },
        });
    }

    function closeExtraActions() {
        const visibleButtons = Array.from(root.querySelectorAll?.(EXTRA_ACTIONS_OPEN_SELECTOR) ?? []);

        if (visibleButtons.length === 0) {
            return;
        }

        const hiddenHints = Array.from(root.querySelectorAll?.(EXTRA_ACTIONS_HINT_SELECTOR) ?? [])
            .filter(hint => hint.style.display === 'none');
        let remainingVisibleButtons = visibleButtons.length;

        for (const buttons of visibleButtons) {
            transitionElement(buttons, {
                opacity: 0,
                complete() {
                    buttons.style.display = 'none';
                    buttons.classList.remove('visible');

                    for (const hint of hiddenHints) {
                        hint.style.display = '';
                        transitionElement(hint, {
                            opacity: 0.3,
                            complete() {
                                hint.style.opacity = '';
                            },
                        });
                    }

                    remainingVisibleButtons -= 1;
                    if (remainingVisibleButtons === 0) {
                        dependencies.onStateChanged();
                    }
                },
            });
        }
    }

    function handleClick(event) {
        const target = event.target;
        const hint = target?.closest?.(EXTRA_ACTIONS_HINT_SELECTOR);

        if (hint) {
            openExtraActions(hint);
            return;
        }

        if (dependencies.getExpandMessageActions()) {
            return;
        }

        if (!target?.closest?.(EXTRA_ACTIONS_CLICK_AREA_SELECTOR)) {
            closeExtraActions();
        }
    }

    return {
        init() {
            if (initialized) {
                return;
            }

            abortController = new AbortController();
            root.addEventListener('click', handleClick, { signal: abortController.signal });
            initialized = true;
        },
        cleanup() {
            abortController?.abort();
            abortController = null;
            initialized = false;
        },
        openExtraActions,
        closeExtraActions,
    };
}
