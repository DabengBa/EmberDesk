import { getConfigValue } from './util.js';

/**
 * Whether the React setup page is enabled.
 * Reuses the existing shared React auth app build served for /login.
 * @returns {boolean}
 */
export function isReactSetupEnabled() {
    return getConfigValue('features.react.pages.setup', false, 'boolean');
}
