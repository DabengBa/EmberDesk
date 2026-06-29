import { isReactPageEnabled } from './react-feature-flags.js';

/**
 * Whether the React setup page is enabled.
 * Reuses the existing shared React auth app build served for /login.
 * @returns {boolean}
 */
export function isReactSetupEnabled() {
    return isReactPageEnabled('setup');
}
