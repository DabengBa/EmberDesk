import { initAccessibility } from './a11y.js';

let csrfToken = '';
let lockoutTimer = null;

/**
 * Gets a CSRF token from the server.
 * @returns {Promise<string>} CSRF token
 */
async function getCsrfToken() {
    const response = await fetch('/csrf-token');
    const data = await response.json();
    return data.token;
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
        // Force reflow to restart animation
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
 * Sets the login form enabled/disabled state.
 * @param {boolean} enabled Whether the form should be enabled
 */
function setFormEnabled(enabled) {
    const handle = document.getElementById('handle');
    const password = document.getElementById('password');
    const loginBtn = document.getElementById('loginButton');

    handle.disabled = !enabled;
    password.disabled = !enabled;
    loginBtn.disabled = !enabled;
}

/**
 * Starts a lockout countdown timer.
 * @param {number} seconds Number of seconds to count down
 */
function startLockoutCountdown(seconds) {
    const errorBlock = document.getElementById('errorMessage');
    setFormEnabled(false);

    let remaining = seconds;
    showError(errorBlock, `Account locked. Try again in ${remaining} seconds.`);

    lockoutTimer = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
            clearInterval(lockoutTimer);
            lockoutTimer = null;
            hideError(errorBlock);
            setFormEnabled(true);
        } else {
            showError(errorBlock, `Account locked. Try again in ${remaining} seconds.`);
        }
    }, 1000);
}

/**
 * Attempts to log in the user.
 * @param {string} handle User's handle
 * @param {string} password User's password
 * @returns {Promise<void>}
 */
async function performLogin(handle, password) {
    const errorBlock = document.getElementById('errorMessage');
    hideError(errorBlock);
    setFormEnabled(false);

    const loginBtn = document.getElementById('loginButton');
    const originalText = loginBtn.textContent;
    loginBtn.textContent = 'Signing in…';

    try {
        const response = await fetch('/api/users/login', {
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
                loginBtn.textContent = originalText;
                startLockoutCountdown(retryAfter);
                return;
            }

            loginBtn.textContent = originalText;
            setFormEnabled(true);
            return showError(errorBlock, errorData.error || 'An error occurred', true);
        }

        const data = await response.json();
        if (data.handle) {
            redirectToHome();
        }
    } catch (error) {
        loginBtn.textContent = originalText;
        setFormEnabled(true);
        showError(errorBlock, String(error), true);
    }
}

/**
 * Requests a recovery code for the user.
 * @param {string} handle User handle
 * @returns {Promise<void>}
 */
async function sendRecoveryPart1(handle) {
    const errorBlock = document.getElementById('recoveryError');
    hideError(errorBlock);

    try {
        const response = await fetch('/api/users/recover-step1', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken,
            },
            body: JSON.stringify({ handle }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            return showError(errorBlock, errorData.error || 'An error occurred', true);
        }

        document.getElementById('recoveryStep1').style.display = 'none';
        document.getElementById('recoveryStep2').style.display = 'block';
        document.getElementById('recoverHandle').disabled = true;
    } catch (error) {
        showError(errorBlock, String(error), true);
    }
}

/**
 * Sets a new password for the user using the recovery code.
 * @param {string} handle User handle
 * @param {string} code Recovery code
 * @param {string} newPassword New password
 * @returns {Promise<void>}
 */
async function sendRecoveryPart2(handle, code, newPassword) {
    const errorBlock = document.getElementById('recoveryError');
    hideError(errorBlock);

    try {
        const response = await fetch('/api/users/recover-step2', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken,
            },
            body: JSON.stringify({ handle, code, newPassword }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            return showError(errorBlock, errorData.error || 'An error occurred', true);
        }

        await performLogin(handle, newPassword || '');
    } catch (error) {
        showError(errorBlock, String(error), true);
    }
}

/**
 * Redirects to the home page, preserving query string except noauto.
 */
function redirectToHome() {
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.delete('noauto');
    currentUrl.pathname = '/';
    window.location.href = currentUrl.toString();
}

/**
 * Switches from login card to recovery card.
 */
function showRecovery() {
    document.getElementById('loginCard').style.display = 'none';
    document.getElementById('recoveryCard').style.display = 'block';
    document.getElementById('recoveryStep1').style.display = 'block';
    document.getElementById('recoveryStep2').style.display = 'none';
    document.getElementById('recoverHandle').disabled = false;
    document.getElementById('recoverHandle').value = document.getElementById('handle').value;
    hideError(document.getElementById('recoveryError'));
}

/**
 * Switches from recovery card back to login card.
 */
function showLogin() {
    document.getElementById('recoveryCard').style.display = 'none';
    document.getElementById('loginCard').style.display = 'block';
    hideError(document.getElementById('errorMessage'));
}

/**
 * Toggles password visibility.
 */
function togglePasswordVisibility() {
    const input = document.getElementById('password');
    const btn = document.getElementById('passwordToggle');
    const icon = btn.querySelector('i');

    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fa-solid fa-eye-slash';
        btn.setAttribute('aria-pressed', 'true');
        btn.setAttribute('aria-label', 'Hide password');
    } else {
        input.type = 'password';
        icon.className = 'fa-solid fa-eye';
        btn.setAttribute('aria-pressed', 'false');
        btn.setAttribute('aria-label', 'Show password');
    }
}

(async function () {
    initAccessibility();

    csrfToken = await getCsrfToken();

    // Login form submit
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const handle = String($('#handle').val()).trim();
        const password = String($('#password').val());
        if (!handle) {
            return showError(document.getElementById('errorMessage'), 'Handle is required', true);
        }
        await performLogin(handle, password);
    });

    // Password toggle
    document.getElementById('passwordToggle').addEventListener('click', togglePasswordVisibility);

    // Forgot password
    document.getElementById('forgotLink').addEventListener('click', (e) => {
        e.preventDefault();
        showRecovery();
    });

    // Recovery form submit
    document.getElementById('recoveryForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const handle = String($('#recoverHandle').val()).trim();

        if (!handle) {
            return showError(document.getElementById('recoveryError'), 'Handle is required', true);
        }

        // Step 1 is visible → send code
        if (document.getElementById('recoveryStep1').style.display !== 'none') {
            await sendRecoveryPart1(handle);
            return;
        }

        // Step 2 is visible → reset password
        const code = String($('#recoveryCode').val()).trim();
        const newPassword = String($('#newPassword').val());
        if (!code) {
            return showError(document.getElementById('recoveryError'), 'Recovery code is required', true);
        }
        await sendRecoveryPart2(handle, code, newPassword);
    });

    // Cancel recovery
    document.getElementById('cancelRecovery').addEventListener('click', (e) => {
        e.preventDefault();
        showLogin();
    });

    // Enter key from inputs triggers form submit (handled by form submit event)
})();
