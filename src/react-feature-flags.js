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
    return getConfigValue(`features.react.panels.${panelName}`, false, 'boolean');
}
