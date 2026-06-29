import { isReactPageEnabled } from './react-feature-flags.js';

export const REACT_LOGIN_BASE_PATH = '/react/login/';

/**
 * Whether the React login page is enabled.
 * @returns {boolean}
 */
export function isReactLoginEnabled() {
    return isReactPageEnabled('login');
}
