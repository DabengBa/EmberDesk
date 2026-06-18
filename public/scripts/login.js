import { initAccessibility } from './a11y.js';
import {
    loginMessages,
    getLoginErrorMessage,
    buildHomeRedirectUrl,
    getPasswordVisibilityState,
    getRecoveryStep,
    formatLockoutMessage,
} from './login-shared.js';

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

export {
    loginMessages,
    getLoginErrorMessage,
    buildHomeRedirectUrl,
    getPasswordVisibilityState,
    getRecoveryStep,
    formatLockoutMessage,
};

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
 * Hides the error message in the specified error block.
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
    const credentialFields = [elements.handle, elements.password];

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

        hideLoginError();
    }

    function hideLoginError() {
        hideError(elements.errorMessage, credentialFields);
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
                hideLoginError();
                setFormEnabled(true);
            } else {
                showError(elements.errorMessage, formatLockoutMessage(remaining));
            }
        }, 1000);
    }

    async function performLogin(handle, password) {
        hideLoginError();
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
                showError(elements.errorMessage, getLoginErrorMessage(errorData.error), { shake: true });
                return;
            }

            const data = await response.json();
            if (data.handle) {
                redirectToHome();
            }
        } catch (error) {
            elements.loginButton.textContent = originalText;
            setFormEnabled(true);
            showError(elements.errorMessage, String(error), { shake: true });
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
                showError(elements.recoveryError, getLoginErrorMessage(errorData.error), { shake: true });
                return;
            }

            elements.recoveryStep1.style.display = 'none';
            elements.recoveryStep2.style.display = 'block';
            elements.recoverHandle.disabled = true;
        } catch (error) {
            showError(elements.recoveryError, String(error), { shake: true });
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
                showError(elements.recoveryError, getLoginErrorMessage(errorData.error), { shake: true });
                return;
            }

            showLogin();
        } catch (error) {
            showError(elements.recoveryError, String(error), { shake: true });
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
        hideLoginError();
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
                showError(elements.errorMessage, loginMessages.handleRequired, { shake: true, field: elements.handle });
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
                showError(elements.recoveryError, loginMessages.handleRequired, { shake: true });
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
                showError(elements.recoveryError, loginMessages.codeRequired, { shake: true });
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
