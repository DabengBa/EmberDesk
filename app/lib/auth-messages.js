import { translate } from '@/compat/i18n.js';

/**
 * Shared login/setup copy.
 *
 * The English strings are both the copy and the translation keys; the
 * Simplified Chinese text lives in `public/locales/zh-cn.json`. Translation
 * goes through the compat bridge so these module-level maps (used by Zod
 * schemas and TanStack Query helpers) never touch the legacy shell directly —
 * the standalone /login and /setup bundles must stay free of `public/script.js`
 * and `public/scripts/power-user.js`.
 */

export const loginMessages = {
    get handleRequired() { return translate('Please enter a username'); },
    get codeRequired() { return translate('Please enter a recovery code'); },
    get genericError() { return translate('An error occurred. Please try again later.'); },
    get incorrectCredentials() { return translate('Incorrect username or password'); },
    get userDisabled() { return translate('This account is disabled'); },
    get userNotFound() { return translate('User not found'); },
    get incorrectCode() { return translate('Incorrect recovery code'); },
    get missingFields() { return translate('Please fill in the required fields'); },
    get tooManyLoginAttempts() { return translate('Too many attempts. Try again later or reset your password.'); },
    get tooManyRecoveryAttempts() { return translate('Too many attempts. Try again later or contact your administrator.'); },
    get passwordTooShort() { return translate('Password must be at least 8 characters long'); },
    get signingIn() { return translate('Signing in...'); },
    get showPassword() { return translate('Show password'); },
    get hidePassword() { return translate('Hide password'); },
};

/** Server error text → translation key for the same message. */
export const loginServerErrors = new Map([
    ['Incorrect credentials', 'Incorrect username or password'],
    ['User is disabled', 'This account is disabled'],
    ['User not found', 'User not found'],
    ['Incorrect code', 'Incorrect recovery code'],
    ['Missing required fields', 'Please fill in the required fields'],
    ['Password must be at least 8 characters long', 'Password must be at least 8 characters long'],
    ['Too many attempts. Try again later or recover your password.', 'Too many attempts. Try again later or reset your password.'],
    ['Too many attempts. Try again later or contact your admin.', 'Too many attempts. Try again later or contact your administrator.'],
]);

/**
 * Returns user-facing copy for known auth API errors.
 * @param {unknown} message Server error message
 * @returns {string} Localized error message
 */
export function getLoginErrorMessage(message) {
    if (typeof message !== 'string') {
        return loginMessages.genericError;
    }

    return loginServerErrors.has(message) ? translate(loginServerErrors.get(message)) : (message || loginMessages.genericError);
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
    const template = translate('Account locked. Try again in ${0} seconds.');
    return template.replace('${0}', String(remaining));
}

export const setupMessages = {
    get handleRequired() { return translate('Please enter a username'); },
    get passwordRequired() { return translate('Please enter a password'); },
    get passwordMismatch() { return translate('The passwords do not match'); },
    get genericError() { return translate('An error occurred. Please try again later.'); },
    get userExists() { return translate('This username is already taken'); },
    get setupComplete() { return translate('Setup complete. Signing you in...'); },
    get missingFields() { return translate('Please fill in the required fields'); },
    get passwordTooShort() { return translate('Password must be at least 8 characters long'); },
    get creating() { return translate('Creating...'); },
    get setting() { return translate('Setting up...'); },
    get showPassword() { return translate('Show password'); },
    get hidePassword() { return translate('Hide password'); },
};

/** Server error text → translation key for the same message. */
export const setupServerErrors = new Map([
    ['Setup already completed', 'Setup is already complete. Please sign in.'],
    ['Missing required fields', 'Please fill in the required fields'],
    ['Password must be at least 8 characters long', 'Password must be at least 8 characters long'],
    ['Invalid handle', 'The username format is invalid'],
    ['User already exists', 'This username is already taken'],
]);

/**
 * Returns user-facing copy for known setup API errors.
 * @param {unknown} message Server error message
 * @returns {string}
 */
export function getSetupErrorMessage(message) {
    if (typeof message !== 'string') {
        return setupMessages.genericError;
    }

    return setupServerErrors.has(message) ? translate(setupServerErrors.get(message)) : (message || setupMessages.genericError);
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
