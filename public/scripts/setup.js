import { initAccessibility } from './a11y.js';
import {
    buildSetupRequestBody,
    getSetupErrorMessage,
    getSetupPasswordVisibilityState,
    setupMessages,
} from './setup-shared.js';

export {
    buildSetupRequestBody,
    getSetupErrorMessage,
    getSetupPasswordVisibilityState,
    setupMessages,
} from './setup-shared.js';

const requiredElementIds = [
    'setupCard',
    'setupForm',
    'setup-title',
    'handleField',
    'nameField',
    'handle',
    'name',
    'password',
    'confirmPassword',
    'passwordToggle',
    'confirmPasswordToggle',
    'setupButton',
    'errorMessage',
];

const defaultDependencies = {
    fetch: (...args) => fetch(...args),
    redirect: (href) => {
        window.location.href = href;
    },
    initAccessibility,
};

function getRequiredElement(root, id) {
    const element = root.getElementById?.(id) ?? root.querySelector?.(`#${id}`);
    if (!element) {
        throw new Error(`Missing setup page element: #${id}`);
    }
    return element;
}

function collectElements(root) {
    return Object.fromEntries(requiredElementIds.map(id => [id, getRequiredElement(root, id)]));
}

/**
 * Displays an error message in the setup error block.
 * @param {HTMLElement} errorBlock The error block element
 * @param {string} message Error message to display
 * @param {object} [options] Display options
 * @param {boolean} [options.shake=false] Whether to apply shake animation
 * @param {HTMLElement|null} [options.field=null] Field associated with the error
 */
function showError(errorBlock, message, { shake = false, field = null } = {}) {
    errorBlock.textContent = message;
    errorBlock.classList.add('login-error--visible');
    errorBlock.setAttribute('tabindex', '-1');
    if (field) {
        field.setAttribute('aria-invalid', 'true');
        field.setAttribute('aria-describedby', errorBlock.id);
    }
    if (shake) {
        errorBlock.classList.remove('login-error--shake');
        void errorBlock.offsetWidth;
        errorBlock.classList.add('login-error--shake');
    }
    if (document.activeElement !== errorBlock) {
        errorBlock.focus();
    }
}

/**
 * Hides the setup error message.
 * @param {HTMLElement} errorBlock The error block element
 * @param {HTMLElement[]} [fields=[]] Fields associated with the error
 */
function hideError(errorBlock, fields = []) {
    errorBlock.textContent = '';
    errorBlock.classList.remove('login-error--visible', 'login-error--shake');
    errorBlock.removeAttribute('tabindex');
    for (const field of fields) {
        field.removeAttribute('aria-invalid');
        field.removeAttribute('aria-describedby');
    }
}

/**
 * Creates a page-owned setup controller.
 * @param {Document|HTMLElement} root Root containing setup page elements
 * @param {Partial<typeof defaultDependencies>} [dependencyOverrides] Runtime dependency overrides
 * @returns {{init: () => Promise<void>, cleanup: () => void}}
 */
export function createSetupController(root = document, dependencyOverrides = {}) {
    const dependencies = { ...defaultDependencies, ...dependencyOverrides };
    const elements = collectElements(root);
    const abortController = new AbortController();
    const listenerOptions = { signal: abortController.signal };
    let csrfToken = '';
    /** @type {'fresh'|'set-password'} */
    let setupMode = 'fresh';
    const setupFields = [elements.handle, elements.password, elements.confirmPassword];

    function setFormEnabled(enabled) {
        const shouldDisable = !enabled;
        if (setupMode === 'fresh') {
            elements.handle.disabled = shouldDisable;
            elements.name.disabled = shouldDisable;
        }
        elements.password.disabled = shouldDisable;
        elements.confirmPassword.disabled = shouldDisable;
        elements.setupButton.disabled = shouldDisable;
    }

    async function getCsrfToken() {
        const response = await dependencies.fetch('/csrf-token');
        const data = await response.json();
        return data.token;
    }

    async function getSetupMode() {
        try {
            const response = await dependencies.fetch('/api/users/setup-mode');
            if (response.ok) {
                const data = await response.json();
                if (data.mode === 'complete') {
                    return 'complete';
                }
                return data.mode === 'set-password' ? 'set-password' : 'fresh';
            }
        } catch {
            // Fallback to fresh mode when setup-mode cannot be read.
        }
        return 'fresh';
    }

    function applySetPasswordMode() {
        setupMode = 'set-password';
        elements['setup-title'].textContent = '设置密码';
        elements.handleField.classList.add('setup-hidden');
        elements.nameField.classList.add('setup-hidden');
        elements.setupButton.textContent = '设置密码并登录';
    }

    function getFormData() {
        return {
            handle: setupMode === 'fresh' ? elements.handle.value.trim() : '',
            name: setupMode === 'fresh' ? elements.name.value.trim() : '',
            password: elements.password.value,
            confirmPassword: elements.confirmPassword.value,
        };
    }

    function togglePasswordVisibility(input, button) {
        const icon = button.querySelector('i');
        const nextState = getSetupPasswordVisibilityState(input.type);

        input.type = nextState.type;
        if (icon) {
            icon.className = nextState.iconClassName;
        }
        button.setAttribute('aria-pressed', nextState.ariaPressed);
        button.setAttribute('aria-label', nextState.ariaLabel);
    }

    function getSetupErrorField(message) {
        if (setupMode === 'fresh' && (message === 'Invalid handle' || message === 'User already exists')) {
            return elements.handle;
        }

        return null;
    }

    async function performSetup(formData) {
        hideError(elements.errorMessage, setupFields);
        setFormEnabled(false);

        const originalText = elements.setupButton.textContent;
        elements.setupButton.textContent = setupMode === 'set-password' ? setupMessages.setting : setupMessages.creating;

        try {
            const response = await dependencies.fetch('/api/users/setup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken,
                },
                body: JSON.stringify(buildSetupRequestBody(setupMode, formData)),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                elements.setupButton.textContent = originalText;
                setFormEnabled(true);

                if (response.status === 403 && errorData.error === 'Setup already completed') {
                    dependencies.redirect('/login');
                    return;
                }

                showError(elements.errorMessage, getSetupErrorMessage(errorData.error), {
                    shake: true,
                    field: getSetupErrorField(errorData.error),
                });
                return;
            }

            const data = await response.json();
            if (data.handle) {
                elements.setupButton.textContent = setupMessages.setupComplete;
                dependencies.redirect('/');
            }
        } catch (error) {
            elements.setupButton.textContent = originalText;
            setFormEnabled(true);
            showError(elements.errorMessage, String(error), { shake: true });
        }
    }

    async function init() {
        dependencies.initAccessibility();
        csrfToken = await getCsrfToken();

        const mode = await getSetupMode();
        if (mode === 'complete') {
            dependencies.redirect('/login');
            return;
        }

        if (mode === 'set-password') {
            applySetPasswordMode();
        }

        elements.setupForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const formData = getFormData();

            if (setupMode === 'fresh' && !formData.handle) {
                showError(elements.errorMessage, setupMessages.handleRequired, { shake: true, field: elements.handle });
                return;
            }
            if (!formData.password) {
                showError(elements.errorMessage, setupMessages.passwordRequired, { shake: true, field: elements.password });
                return;
            }
            if (formData.password !== formData.confirmPassword) {
                showError(elements.errorMessage, setupMessages.passwordMismatch, { shake: true, field: elements.confirmPassword });
                return;
            }

            await performSetup(formData);
        }, listenerOptions);

        const hideOnInput = () => hideError(elements.errorMessage, setupFields);
        elements.handle.addEventListener('input', hideOnInput, listenerOptions);
        elements.password.addEventListener('input', hideOnInput, listenerOptions);
        elements.confirmPassword.addEventListener('input', hideOnInput, listenerOptions);

        elements.passwordToggle.addEventListener('click', () => {
            togglePasswordVisibility(elements.password, elements.passwordToggle);
        }, listenerOptions);
        elements.confirmPasswordToggle.addEventListener('click', () => {
            togglePasswordVisibility(elements.confirmPassword, elements.confirmPasswordToggle);
        }, listenerOptions);
    }

    function cleanup() {
        abortController.abort();
    }

    return { init, cleanup };
}

/**
 * Initializes the setup page.
 * @param {Document|HTMLElement} [root] Root containing setup page elements
 * @param {Partial<typeof defaultDependencies>} [dependencies] Runtime dependency overrides
 * @returns {Promise<() => void>} Cleanup function
 */
export async function initSetupPage(root = document, dependencies = {}) {
    const controller = createSetupController(root, dependencies);
    await controller.init();
    return controller.cleanup;
}

if (!globalThis.EMBERDESK_SETUP_TEST_MODE) {
    await initSetupPage(document);
}
