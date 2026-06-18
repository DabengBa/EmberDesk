import { getConfigValue } from './util.js';

/**
 * Whether the React settings page is enabled.
 * Reuses the existing shared React app build served for /login and /setup.
 * @returns {boolean}
 */
export function isReactSettingsEnabled() {
    return getConfigValue('features.react.pages.settings', false, 'boolean');
}
