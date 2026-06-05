export const BACKGROUND_STARTUP_LOADING_ID = 'bg_startup_loading';

const SYSTEM_BACKGROUND_CONTAINER_ID = 'bg_menu_content';
const LOADING_INDICATOR_CLASSES = ['wide100p', 'textAlignCenter', 'marginTop10'];

/**
 * @param {{disabled?: boolean, isLoading?: boolean, itemCount?: number, error?: unknown}} state
 * @returns {{status: 'disabled' | 'loading' | 'empty' | 'success' | 'error', showLoading: boolean, showEmpty: boolean, showError: boolean}}
 */
export function getBackgroundPanelState({ disabled = false, isLoading = false, itemCount = 0, error = null } = {}) {
    if (disabled) {
        return { status: 'disabled', showLoading: false, showEmpty: false, showError: false };
    }

    if (error) {
        return { status: 'error', showLoading: false, showEmpty: false, showError: true };
    }

    if (isLoading) {
        return { status: 'loading', showLoading: true, showEmpty: false, showError: false };
    }

    if (itemCount === 0) {
        return { status: 'empty', showLoading: false, showEmpty: true, showError: false };
    }

    return { status: 'success', showLoading: false, showEmpty: false, showError: false };
}

/**
 * @param {Document | HTMLElement} root
 * @param {string} id
 * @returns {HTMLElement | null}
 */
function findElementById(root, id) {
    if (typeof root.getElementById === 'function') {
        return root.getElementById(id);
    }

    if (typeof root.querySelector === 'function') {
        return root.querySelector(`#${id}`);
    }

    return null;
}

/**
 * @param {HTMLElement} container
 * @param {string} loadingText
 * @returns {HTMLElement}
 */
function createLoadingIndicator(container, loadingText) {
    const document = container.ownerDocument;
    const indicator = document.createElement('div');
    indicator.id = BACKGROUND_STARTUP_LOADING_ID;
    indicator.classList.add(...LOADING_INDICATOR_CLASSES);

    const icon = document.createElement('i');
    icon.classList.add('fa-solid', 'fa-spinner', 'fa-spin');
    indicator.appendChild(icon);

    const label = document.createElement('span');
    label.textContent = loadingText;
    indicator.appendChild(label);

    return indicator;
}

/**
 * @param {Document | HTMLElement} root
 * @param {{loadingText?: string}} dependencies
 */
export function createBackgroundPanelController(root = globalThis.document, dependencies = {}) {
    if (!root) {
        throw new Error('Background panel controller requires a root');
    }

    const container = findElementById(root, SYSTEM_BACKGROUND_CONTAINER_ID);
    if (!container) {
        throw new Error('Background panel controller requires #bg_menu_content');
    }

    const loadingText = dependencies.loadingText ?? 'Loading backgrounds...';

    function getLoadingIndicator() {
        return container.querySelector(`#${BACKGROUND_STARTUP_LOADING_ID}`);
    }

    return {
        container,
        setLoading(isLoading) {
            const existingIndicator = getLoadingIndicator();
            if (isLoading) {
                if (!existingIndicator) {
                    container.prepend(createLoadingIndicator(container, loadingText));
                }

                return;
            }

            existingIndicator?.remove();
        },
        getState: getBackgroundPanelState,
        cleanup() {
            this.setLoading(false);
        },
    };
}

/**
 * Replaces a background panel controller when its container changed.
 * @param {object} options
 * @param {ReturnType<typeof createBackgroundPanelController> | null} [options.currentController]
 * @param {Document | HTMLElement} options.root
 * @param {HTMLElement} options.container
 * @param {string} options.loadingText
 * @returns {ReturnType<typeof createBackgroundPanelController>}
 */
export function replaceBackgroundPanelController({
    currentController = null,
    root,
    container,
    loadingText,
}) {
    if (currentController?.container === container) {
        return currentController;
    }

    currentController?.cleanup?.();
    return createBackgroundPanelController(root, { loadingText });
}
