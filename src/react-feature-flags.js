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
    if (panelName === 'characterAuthoring' || panelName === 'groupAuthoring' || panelName === 'worldInfo') {
        // Sole-owner panels; product flags retired.
        return true;
    }
    return getConfigValue(`features.react.panels.${panelName}`, false, 'boolean');
}
