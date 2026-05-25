import { initAccessibility } from './a11y.js';

export const setupMessages = {
    handleRequired: '请输入用户名',
    passwordRequired: '请输入密码',
    passwordMismatch: '两次密码不一致',
    genericError: '发生错误，请稍后重试',
    userExists: '该用户名已被占用',
    setupComplete: '设置完成，正在进入...',
    missingFields: '请填写必填项',
    creating: '创建中...',
    setting: '设置中...',
    showPassword: '显示密码',
    hidePassword: '隐藏密码',
};

const serverErrorMessages = new Map([
    ['Setup already completed', '设置已完成，请直接登录。'],
    ['Missing required fields', setupMessages.missingFields],
    ['Invalid handle', '用户名格式不正确'],
    ['User already exists', setupMessages.userExists],
]);

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

/**
 * Returns user-facing Chinese copy for known setup API errors.
 * @param {unknown} message Server error message
 * @returns {string} Localized error message
 */
export function getSetupErrorMessage(message) {
    if (typeof message !== 'string') {
        return setupMessages.genericError;
    }

    return serverErrorMessages.get(message) || message || setupMessages.genericError;
}

/**
 * Gets the next visible state for a setup password field and toggle button.
 * @param {string} currentType Current password input type
 * @returns {{type: string, iconClassName: string, ariaPressed: string, ariaLabel: string}}
 */
export function getSetupPasswordVisibilityState(currentType) {
    if (currentType === 'password') {
        return {
            type: 'text',
            iconClassName: 'fa-solid fa-eye-slash',
            ariaPressed: 'true',
            ariaLabel: setupMessages.hidePassword,
        };
    }

    return {
        type: 'password',
        iconClassName: 'fa-solid fa-eye',
        ariaPressed: 'false',
        ariaLabel: setupMessages.showPassword,
    };
}

/**
 * Builds the setup request body for the selected setup mode.
 * @param {'fresh'|'set-password'} mode Setup mode
 * @param {{handle: string, name: string, password: string}} data Form data
 * @returns {{handle?: string, name?: string, password: string}}
 */
export function buildSetupRequestBody(mode, data) {
    const body = { password: data.password };
    if (mode === 'fresh') {
        body.handle = data.handle;
        body.name = data.name;
    }
    return body;
}

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
 * @param {boolean} [shake=false] Whether to apply shake animation
 */
function showError(errorBlock, message, shake = false) {
    errorBlock.textContent = message;
    errorBlock.classList.add('login-error--visible');
    if (shake) {
        errorBlock.classList.remove('login-error--shake');
        void errorBlock.offsetWidth;
        errorBlock.classList.add('login-error--shake');
    }
}

/**
 * Hides the setup error message.
 * @param {HTMLElement} errorBlock The error block element
 */
function hideError(errorBlock) {
    errorBlock.textContent = '';
    errorBlock.classList.remove('login-error--visible', 'login-error--shake');
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

    async function performSetup(formData) {
        hideError(elements.errorMessage);
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

                showError(elements.errorMessage, getSetupErrorMessage(errorData.error), true);
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
            showError(elements.errorMessage, String(error), true);
        }
    }

    async function init() {
        dependencies.initAccessibility();
        csrfToken = await getCsrfToken();

        const mode = await getSetupMode();
        if (mode === 'set-password') {
            applySetPasswordMode();
        }

        elements.setupForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const formData = getFormData();

            if (setupMode === 'fresh' && !formData.handle) {
                showError(elements.errorMessage, setupMessages.handleRequired, true);
                return;
            }
            if (!formData.password) {
                showError(elements.errorMessage, setupMessages.passwordRequired, true);
                return;
            }
            if (formData.password !== formData.confirmPassword) {
                showError(elements.errorMessage, setupMessages.passwordMismatch, true);
                return;
            }

            await performSetup(formData);
        }, listenerOptions);

        const hideOnInput = () => hideError(elements.errorMessage);
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
