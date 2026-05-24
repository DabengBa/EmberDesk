import { initAccessibility } from './a11y.js';

export const loginMessages = {
    handleRequired: '请输入用户名',
    codeRequired: '请输入恢复码',
    genericError: '发生错误，请稍后重试',
    incorrectCredentials: '账号或密码不正确',
    userDisabled: '此账号已被禁用',
    userNotFound: '未找到该用户',
    incorrectCode: '恢复码不正确',
    missingFields: '请填写必填项',
    tooManyLoginAttempts: '尝试次数过多，请稍后重试或重置密码。',
    tooManyRecoveryAttempts: '尝试次数过多，请稍后重试或联系管理员。',
    signingIn: '登录中...',
    showPassword: '显示密码',
    hidePassword: '隐藏密码',
};

const serverErrorMessages = new Map([
    ['Incorrect credentials', loginMessages.incorrectCredentials],
    ['User is disabled', loginMessages.userDisabled],
    ['User not found', loginMessages.userNotFound],
    ['Incorrect code', loginMessages.incorrectCode],
    ['Missing required fields', loginMessages.missingFields],
    ['Too many attempts. Try again later or recover your password.', loginMessages.tooManyLoginAttempts],
    ['Too many attempts. Try again later or contact your admin.', loginMessages.tooManyRecoveryAttempts],
]);

const requiredElementIds = [
    'loginCard',
    'loginForm',
    'handle',
    'password',
    'passwordToggle',
    'loginButton',
    'errorMessage',
    'forgotLink',
    'recoveryCard',
    'recoveryForm',
    'recoverHandle',
    'recoveryStep1',
    'recoveryStep2',
    'recoveryCode',
    'newPassword',
    'recoveryError',
    'cancelRecovery',
];

const defaultDependencies = {
    fetch: (...args) => fetch(...args),
    getLocationHref: () => window.location.href,
    redirect: (href) => {
        window.location.href = href;
    },
    setInterval: (...args) => setInterval(...args),
    clearInterval: (...args) => clearInterval(...args),
    initAccessibility,
};

/**
 * Returns user-facing Chinese copy for known auth API errors.
 * @param {unknown} message Server error message
 * @returns {string} Localized error message
 */
export function getLoginErrorMessage(message) {
    if (typeof message !== 'string') {
        return loginMessages.genericError;
    }

    return serverErrorMessages.get(message) || message || loginMessages.genericError;
}

/**
 * Builds the post-login home URL, preserving all query params except noauto.
 * @param {string} href Current location href
 * @returns {string} Redirect href
 */
export function buildHomeRedirectUrl(href) {
    const currentUrl = new URL(href);
    currentUrl.searchParams.delete('noauto');
    currentUrl.pathname = '/';
    return currentUrl.toString();
}

/**
 * Gets the next visible state for the password field and toggle button.
 * @param {string} currentType Current password input type
 * @returns {{type: string, iconClassName: string, ariaPressed: string, ariaLabel: string}}
 */
export function getPasswordVisibilityState(currentType) {
    if (currentType === 'password') {
        return {
            type: 'text',
            iconClassName: 'fa-solid fa-eye-slash',
            ariaPressed: 'true',
            ariaLabel: loginMessages.hidePassword,
        };
    }

    return {
        type: 'password',
        iconClassName: 'fa-solid fa-eye',
        ariaPressed: 'false',
        ariaLabel: loginMessages.showPassword,
    };
}

/**
 * Determines which recovery step is active.
 * @param {{step1Display: string, step2Display: string}} state Recovery section display state
 * @returns {1|2}
 */
export function getRecoveryStep(state) {
    return state.step1Display === 'none' && state.step2Display !== 'none' ? 2 : 1;
}

/**
 * Formats the login lockout countdown copy.
 * @param {number} remaining Seconds remaining
 * @returns {string}
 */
export function formatLockoutMessage(remaining) {
    return `账号已锁定，请在 ${remaining} 秒后重试。`;
}

function getRequiredElement(root, id) {
    const element = root.getElementById?.(id) ?? root.querySelector?.(`#${id}`);
    if (!element) {
        throw new Error(`Missing login page element: #${id}`);
    }
    return element;
}

function collectElements(root) {
    return Object.fromEntries(requiredElementIds.map(id => [id, getRequiredElement(root, id)]));
}

/**
 * Displays an error message in the specified error block.
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
 * Hides the error message in the specified error block.
 * @param {HTMLElement} errorBlock The error block element
 */
function hideError(errorBlock) {
    errorBlock.textContent = '';
    errorBlock.classList.remove('login-error--visible', 'login-error--shake');
}

/**
 * Creates a page-owned login controller.
 * @param {Document|HTMLElement} root Root containing login page elements
 * @param {Partial<typeof defaultDependencies>} [dependencyOverrides] Runtime dependency overrides
 * @returns {{init: () => Promise<void>, cleanup: () => void}}
 */
export function createLoginController(root = document, dependencyOverrides = {}) {
    const dependencies = { ...defaultDependencies, ...dependencyOverrides };
    const elements = collectElements(root);
    const abortController = new AbortController();
    const listenerOptions = { signal: abortController.signal };
    let csrfToken = '';
    let lockoutTimer = null;

    function setFormEnabled(enabled) {
        elements.handle.disabled = !enabled;
        elements.password.disabled = !enabled;
        elements.loginButton.disabled = !enabled;
    }

    function clearLockoutTimer() {
        if (!lockoutTimer) {
            return;
        }
        dependencies.clearInterval(lockoutTimer);
        lockoutTimer = null;
    }

    function hideLoginErrorAfterCredentialChange() {
        if (lockoutTimer) {
            return;
        }

        hideError(elements.errorMessage);
    }

    async function getCsrfToken() {
        const response = await dependencies.fetch('/csrf-token');
        const data = await response.json();
        return data.token;
    }

    function redirectToHome() {
        dependencies.redirect(buildHomeRedirectUrl(dependencies.getLocationHref()));
    }

    function startLockoutCountdown(seconds) {
        setFormEnabled(false);

        let remaining = seconds;
        showError(elements.errorMessage, formatLockoutMessage(remaining));

        clearLockoutTimer();
        lockoutTimer = dependencies.setInterval(() => {
            remaining--;
            if (remaining <= 0) {
                clearLockoutTimer();
                hideError(elements.errorMessage);
                setFormEnabled(true);
            } else {
                showError(elements.errorMessage, formatLockoutMessage(remaining));
            }
        }, 1000);
    }

    async function performLogin(handle, password) {
        hideError(elements.errorMessage);
        setFormEnabled(false);

        const originalText = elements.loginButton.textContent;
        elements.loginButton.textContent = loginMessages.signingIn;

        try {
            const response = await dependencies.fetch('/api/users/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken,
                },
                body: JSON.stringify({ handle, password }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));

                if (response.status === 429) {
                    const retryAfter = parseInt(response.headers.get('Retry-After') || '60', 10);
                    elements.loginButton.textContent = originalText;
                    startLockoutCountdown(retryAfter);
                    return;
                }

                elements.loginButton.textContent = originalText;
                setFormEnabled(true);
                showError(elements.errorMessage, getLoginErrorMessage(errorData.error), true);
                return;
            }

            const data = await response.json();
            if (data.handle) {
                redirectToHome();
            }
        } catch (error) {
            elements.loginButton.textContent = originalText;
            setFormEnabled(true);
            showError(elements.errorMessage, String(error), true);
        }
    }

    async function sendRecoveryPart1(handle) {
        hideError(elements.recoveryError);

        try {
            const response = await dependencies.fetch('/api/users/recover-step1', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken,
                },
                body: JSON.stringify({ handle }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                showError(elements.recoveryError, getLoginErrorMessage(errorData.error), true);
                return;
            }

            elements.recoveryStep1.style.display = 'none';
            elements.recoveryStep2.style.display = 'block';
            elements.recoverHandle.disabled = true;
        } catch (error) {
            showError(elements.recoveryError, String(error), true);
        }
    }

    async function sendRecoveryPart2(handle, code, newPassword) {
        hideError(elements.recoveryError);

        try {
            const response = await dependencies.fetch('/api/users/recover-step2', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken,
                },
                body: JSON.stringify({ handle, code, newPassword }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                showError(elements.recoveryError, getLoginErrorMessage(errorData.error), true);
                return;
            }

            showLogin();
        } catch (error) {
            showError(elements.recoveryError, String(error), true);
        }
    }

    function showRecovery() {
        elements.loginCard.style.display = 'none';
        elements.recoveryCard.style.display = 'block';
        elements.recoveryStep1.style.display = 'block';
        elements.recoveryStep2.style.display = 'none';
        elements.recoverHandle.disabled = false;
        elements.recoverHandle.value = elements.handle.value;
        hideError(elements.recoveryError);
    }

    function showLogin() {
        elements.recoveryCard.style.display = 'none';
        elements.loginCard.style.display = 'block';
        hideError(elements.errorMessage);
    }

    function togglePasswordVisibility() {
        const icon = elements.passwordToggle.querySelector('i');
        const nextState = getPasswordVisibilityState(elements.password.type);

        elements.password.type = nextState.type;
        if (icon) {
            icon.className = nextState.iconClassName;
        }
        elements.passwordToggle.setAttribute('aria-pressed', nextState.ariaPressed);
        elements.passwordToggle.setAttribute('aria-label', nextState.ariaLabel);
    }

    async function init() {
        dependencies.initAccessibility();
        csrfToken = await getCsrfToken();

        elements.loginForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const handle = elements.handle.value.trim();
            const password = elements.password.value;
            if (!handle) {
                showError(elements.errorMessage, loginMessages.handleRequired, true);
                return;
            }
            await performLogin(handle, password);
        }, listenerOptions);

        elements.handle.addEventListener('input', hideLoginErrorAfterCredentialChange, listenerOptions);
        elements.password.addEventListener('input', hideLoginErrorAfterCredentialChange, listenerOptions);

        elements.passwordToggle.addEventListener('click', togglePasswordVisibility, listenerOptions);

        elements.forgotLink.addEventListener('click', (event) => {
            event.preventDefault();
            showRecovery();
        }, listenerOptions);

        elements.recoveryForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const handle = elements.recoverHandle.value.trim();

            if (!handle) {
                showError(elements.recoveryError, loginMessages.handleRequired, true);
                return;
            }

            const step = getRecoveryStep({
                step1Display: elements.recoveryStep1.style.display,
                step2Display: elements.recoveryStep2.style.display,
            });

            if (step === 1) {
                await sendRecoveryPart1(handle);
                return;
            }

            const code = elements.recoveryCode.value.trim();
            const newPassword = elements.newPassword.value;
            if (!code) {
                showError(elements.recoveryError, loginMessages.codeRequired, true);
                return;
            }
            await sendRecoveryPart2(handle, code, newPassword);
        }, listenerOptions);

        elements.cancelRecovery.addEventListener('click', (event) => {
            event.preventDefault();
            showLogin();
        }, listenerOptions);
    }

    function cleanup() {
        abortController.abort();
        clearLockoutTimer();
    }

    return { init, cleanup };
}

/**
 * Initializes the login page.
 * @param {Document|HTMLElement} [root] Root containing login page elements
 * @param {Partial<typeof defaultDependencies>} [dependencies] Runtime dependency overrides
 * @returns {Promise<() => void>} Cleanup function
 */
export async function initLoginPage(root = document, dependencies = {}) {
    const controller = createLoginController(root, dependencies);
    await controller.init();
    return controller.cleanup;
}

if (!globalThis.EMBERDESK_LOGIN_TEST_MODE) {
    await initLoginPage(document);
}
