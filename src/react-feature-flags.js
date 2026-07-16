import { getConfigValue } from './util.js';

/**
 * Resolve a React page feature flag.
 * @param {string} pageName
 * @returns {boolean}
 */
export function isReactPageEnabled(pageName) {
    return getConfigValue(`features.react.pages.${pageName}`, false, 'boolean');
}

/**
 * Resolve a React workspace panel feature flag.
 * @param {string} panelName
 * @returns {boolean}
 */
export function isReactWorkspacePanelEnabled(panelName) {
    if (panelName === 'characterAuthoring' || panelName === 'groupAuthoring') {
        // Sole-owner authoring panels; product flags retired.
        return true;
    }
    return getConfigValue(`features.react.panels.${panelName}`, false, 'boolean');
}

/**
 * Resolve whether the same-entry React workspace shell takeover foundation is enabled.
 * @returns {boolean}
 */
export function isReactShellTakeoverEnabled() {
    return getConfigValue('features.react.shell.takeover', false, 'boolean');
}

/**
 * Resolve whether shell takeover failures should abort instead of using the legacy safety net.
 * @returns {boolean}
 */
export function isReactShellTakeoverStrictModeEnabled() {
    return isReactShellTakeoverEnabled() && (
        process.env.CI === 'true'
        || process.env.NODE_ENV === 'development'
        || process.env.NODE_ENV === 'test'
    );
}
