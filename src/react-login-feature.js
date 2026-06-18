import { getConfigValue } from './util.js';

export const REACT_LOGIN_BASE_PATH = '/react/login/';

/**
 * Whether the React login page is enabled.
 * @returns {boolean}
 */
export function isReactLoginEnabled() {
    return getConfigValue('features.react.pages.login', false, 'boolean');
}
