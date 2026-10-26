import { translate } from './i18n.js';

/**
 * User-facing copy for the login screen.
 *
 * Resolved lazily so the strings follow the locale that is active when they are
 * read, never the locale that happened to be active while this module loaded.
 */

export function getLoginMessages() {
    return {
        handleRequired: translate('Enter your username'),
        codeRequired: translate('Enter your recovery code'),
        genericError: translate('Something went wrong. Try again later.'),
        incorrectCredentials: translate('Incorrect username or password'),
        userDisabled: translate('This account is disabled'),
        userNotFound: translate('No such user'),
        incorrectCode: translate('Incorrect recovery code'),
        missingFields: translate('Fill in the required fields'),
        tooManyLoginAttempts: translate('Too many attempts. Try again later or reset your password.'),
        tooManyRecoveryAttempts: translate('Too many attempts. Try again later or contact your admin.'),
        passwordTooShort: translate('The password must be at least 8 characters long'),
        signingIn: translate('Signing in…'),
        showPassword: translate('Show password'),
        hidePassword: translate('Hide password'),
    };
}

const serverErrorKeys = new Map([
    ['Incorrect credentials', 'incorrectCredentials'],
    ['User is disabled', 'userDisabled'],
    ['User not found', 'userNotFound'],
    ['Incorrect code', 'incorrectCode'],
    ['Missing required fields', 'missingFields'],
    ['Password must be at least 8 characters long', 'passwordTooShort'],
    ['Too many attempts. Try again later or recover your password.', 'tooManyLoginAttempts'],
    ['Too many attempts. Try again later or contact your admin.', 'tooManyRecoveryAttempts'],
]);

/**
 * Returns user-facing copy for known auth API errors.
 * @param {unknown} message Server error message
 * @returns {string} Localized error message
 */
export function getLoginErrorMessage(message) {
    const messages = getLoginMessages();
    if (typeof message !== 'string') {
        return messages.genericError;
    }

    const key = serverErrorKeys.get(message);
    return (key ? messages[key] : message) || messages.genericError;
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
    const messages = getLoginMessages();
    if (currentType === 'password') {
        return {
            type: 'text',
            iconClassName: 'fa-solid fa-eye-slash',
            ariaPressed: 'true',
            ariaLabel: messages.hidePassword,
        };
    }

    return {
        type: 'password',
        iconClassName: 'fa-solid fa-eye',
        ariaPressed: 'false',
        ariaLabel: messages.showPassword,
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
    return translate('Account locked. Try again in ${0} seconds.').replace('${0}', String(remaining));
}
