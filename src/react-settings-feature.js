import { isReactPageEnabled } from './react-feature-flags.js';

/**
 * Whether the React settings page is enabled.
 * Reuses the existing shared React app build served for /login and /setup.
 * @returns {boolean}
 */
export function isReactSettingsEnabled() {
    return isReactPageEnabled('settings');
}
