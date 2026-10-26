import { translate } from './i18n.js';

/**
 * User-facing copy for the first-run setup screen.
 *
 * Resolved lazily so the strings follow the locale that is active when they are
 * read, never the locale that happened to be active while this module loaded.
 */

export function getSetupMessages() {
    return {
        handleRequired: translate('Enter your username'),
        passwordRequired: translate('Enter your password'),
        passwordMismatch: translate('The passwords do not match'),
        genericError: translate('Something went wrong. Try again later.'),
        userExists: translate('That username is already taken'),
        setupComplete: translate('Setup complete. Signing you in…'),
        missingFields: translate('Fill in the required fields'),
        passwordTooShort: translate('The password must be at least 8 characters long'),
        creating: translate('Creating…'),
        setting: translate('Applying…'),
        showPassword: translate('Show password'),
        hidePassword: translate('Hide password'),
    };
}

const serverErrorKeys = new Map([
    ['Setup already completed', 'setupAlreadyCompleted'],
    ['Missing required fields', 'missingFields'],
    ['Password must be at least 8 characters long', 'passwordTooShort'],
    ['Invalid handle', 'invalidHandle'],
    ['User already exists', 'userExists'],
]);

const serverErrorFallbacks = {
    setupAlreadyCompleted: () => translate('Setup is already complete. Sign in instead.'),
    invalidHandle: () => translate('The username format is invalid'),
};

/**
 * Returns user-facing copy for known setup API errors.
 * @param {unknown} message Server error message
 * @returns {string} Localized error message
 */
export function getSetupErrorMessage(message) {
    const messages = getSetupMessages();
    if (typeof message !== 'string') {
        return messages.genericError;
    }

    const key = serverErrorKeys.get(message);
    if (key) {
        return messages[key] ?? serverErrorFallbacks[key]();
    }
    return message || messages.genericError;
}

/**
 * Gets the next visible state for a setup password field and toggle button.
 * @param {string} currentType Current password input type
 * @returns {{type: string, iconClassName: string, ariaPressed: string, ariaLabel: string}}
 */
export function getSetupPasswordVisibilityState(currentType) {
    const messages = getSetupMessages();
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
