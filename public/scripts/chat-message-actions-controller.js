export const MESSAGE_ACTION_TIERS = Object.freeze({
    highFrequency: ['extraMesButtonsHint', 'mes_copy', 'mes_edit'],
    secondary: ['mes_bookmark', 'mes_swipe_picker', 'mes_reasoning_copy', 'mes_gallery', 'mes_translate', 'mes_narrate', 'mes_hide'],
    danger: ['mes_edit_delete', 'mes_reasoning_delete'],
});

const EXTRA_ACTIONS_HINT_SELECTOR = '.extraMesButtonsHint';
const EXTRA_ACTIONS_SELECTOR = '.extraMesButtons';
const EXTRA_ACTIONS_OPEN_SELECTOR = '.extraMesButtons.visible';
const EXTRA_ACTIONS_CLICK_AREA_SELECTOR = '.extraMesButtons, .extraMesButtonsHint';

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
