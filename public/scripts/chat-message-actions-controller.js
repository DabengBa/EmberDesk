import { cancelOpacity, transitionOpacity } from './chat-ui-motion.js';

export const MESSAGE_ACTION_TIERS = Object.freeze({
    highFrequency: ['extraMesButtonsHint', 'mes_copy', 'mes_edit'],
    secondary: ['mes_reasoning_copy', 'mes_translate', 'mes_narrate', 'mes_hide'],
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
    // The "always expand message actions" setting is retired; actions open via
    // the hint menu only. Kept as a stable dependency-override seam for tests.
    return false;
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
    const extraButtons = Array.from(messageRow.querySelectorAll('.extraMesButtons'));
    const hiddenHints = Array.from(messageRow.querySelectorAll('.extraMesButtonsHint'));
    const expanded = Boolean(
        getExpandMessageActions()
        || extraButtons.some(button => button.classList?.contains?.('visible') || button.style?.display === 'flex')
        || hiddenHints.some(hint => hint.style?.display === 'none'),
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


function findExtraButtonsForHint(hint) {
    return hint.closest?.('.mes_buttons')?.querySelector?.(EXTRA_ACTIONS_SELECTOR)
        ?? hint.parentElement?.querySelector?.(EXTRA_ACTIONS_SELECTOR)
        ?? null;
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
 * @param {() => void} [dependencyOverrides.onReactOwnedOutsideClick] React state-owner close callback
 * @returns {{init: () => void, cleanup: () => void, openExtraActions: (hint: Element) => void, closeExtraActions: () => void}}
 */
export function createChatMessageActionsController(root = globalThis.document, dependencyOverrides = {}) {
    if (!root) {
        throw new Error('Chat message actions controller requires a root');
    }

    const dependencies = {
        getExpandMessageActions: () => false,
        transitionElement: transitionOpacity,
        animationDuration: 0,
        animationEasing: 'linear',
        onStateChanged: () => {},
        onReactOwnedOutsideClick: () => {},
        ...dependencyOverrides,
    };
    let abortController = null;
    let initialized = false;
    let epoch = 0;
    const versions = new WeakMap();
    const animated = new Set();
    const pendingHints = new Set();

    function isLegacyElement(element) {
        return root.contains?.(element) !== false && !element.closest?.('[data-main-chat-message-row-owner="react"]');
    }

    function invalidate(element) {
        versions.set(element, (versions.get(element) ?? 0) + 1);
        cancelOpacity(element);
        animated.delete(element);
    }

    function transitionElement(element, options) {
        invalidate(element);
        const version = versions.get(element);
        const currentEpoch = epoch;
        animated.add(element);
        dependencies.transitionElement(element, {
            duration: dependencies.animationDuration,
            easing: dependencies.animationEasing,
            ...options,
            isCurrent: () => currentEpoch === epoch && versions.get(element) === version && isLegacyElement(element),
            complete() {
                if (currentEpoch !== epoch || versions.get(element) !== version || !isLegacyElement(element)) return;
                animated.delete(element);
                options.complete?.call(element);
            },
            settled() {
                if (versions.get(element) !== version) return;
                animated.delete(element);
                pendingHints.delete(element);
            },
        });
    }

    function openExtraActions(hint) {
        const buttons = findExtraButtonsForHint(hint);

        if (!buttons || hint.closest?.('[data-main-chat-message-row-owner="react"]')) {
            return;
        }

        invalidate(buttons);
        pendingHints.add(hint);
        transitionElement(hint, {
            opacity: 0,
            complete() {
                pendingHints.delete(hint);
                if (!isLegacyElement(buttons) || findExtraButtonsForHint(hint) !== buttons) return;
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
        for (const hint of pendingHints) {
            invalidate(hint);
            if (isLegacyElement(hint)) hint.style.opacity = '';
        }
        pendingHints.clear();
        const visibleButtons = Array.from(root.querySelectorAll?.(EXTRA_ACTIONS_OPEN_SELECTOR) ?? [])
            .filter(button => !button.closest?.('[data-main-chat-message-row-owner="react"]'));

        if (visibleButtons.length === 0) {
            return;
        }

        const hiddenHints = Array.from(root.querySelectorAll?.(EXTRA_ACTIONS_HINT_SELECTOR) ?? [])
            .filter(hint => (
                hint.style.display === 'none'
                && !hint.closest?.('[data-main-chat-message-row-owner="react"]')
            ));
        let remainingVisibleButtons = visibleButtons.length;

        for (const buttons of visibleButtons) {
            transitionElement(buttons, {
                opacity: 0,
                complete() {
                    buttons.style.display = 'none';
                    buttons.classList.remove('visible');

                    for (const hint of hiddenHints) {
                        if (!isLegacyElement(hint)) continue;
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
        if (target?.closest?.('[data-main-chat-message-row-owner="react"]')) {
            return;
        }

        const hint = target?.closest?.(EXTRA_ACTIONS_HINT_SELECTOR);

        if (hint) {
            openExtraActions(hint);
            return;
        }

        if (dependencies.getExpandMessageActions()) {
            return;
        }

        if (!target?.closest?.(EXTRA_ACTIONS_CLICK_AREA_SELECTOR)) {
            if (event.isTrusted === false) {
                return;
            }

            dependencies.onReactOwnedOutsideClick();
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
            epoch++;
            for (const element of animated) invalidate(element);
            pendingHints.clear();
            abortController?.abort();
            abortController = null;
            initialized = false;
        },
        openExtraActions,
        closeExtraActions,
    };
}
