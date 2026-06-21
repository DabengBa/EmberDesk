import { isReactCharacterLibraryEnabled } from './react-character-library-feature.js';
import { getConfigValue } from './util.js';

export const WORKSPACE_REACT_FEATURES_GLOBAL = '__emberDeskWorkspaceFeatures';

function isReactWorkspacePanelEnabled(panelName) {
    return getConfigValue(`features.react.panels.${panelName}`, false, 'boolean');
}

export function isReactWorldInfoPanelEnabled() {
    return isReactWorkspacePanelEnabled('worldInfo');
}

export function isReactMainChatMessageListPanelEnabled() {
    return isReactWorkspacePanelEnabled('mainChatMessageList');
}

export function isReactBackgroundLibraryPanelEnabled() {
    return isReactWorkspacePanelEnabled('backgroundLibrary');
}

export function isReactExtensionsHostPanelEnabled() {
    return isReactWorkspacePanelEnabled('extensionsHost');
}

/**
 * Resolve the feature payload that the legacy workspace shell can read at startup.
 * @returns {{reactPanels: {characterLibrary: boolean, mainChatMessageList: boolean, worldInfo: boolean, backgroundLibrary: boolean, extensionsHost: boolean}}}
 */
export function getWorkspaceReactFeatures() {
    return {
        reactPanels: {
            characterLibrary: isReactCharacterLibraryEnabled(),
            mainChatMessageList: isReactMainChatMessageListPanelEnabled(),
            worldInfo: isReactWorldInfoPanelEnabled(),
            backgroundLibrary: isReactBackgroundLibraryPanelEnabled(),
            extensionsHost: isReactExtensionsHostPanelEnabled(),
        },
    };
}

/**
 * Serialize the workspace feature payload for inline HTML bootstrapping.
 * @param {{reactPanels: {characterLibrary: boolean, mainChatMessageList?: boolean, worldInfo?: boolean, backgroundLibrary?: boolean, extensionsHost?: boolean}}} workspaceReactFeatures
 * @returns {string}
 */
export function serializeWorkspaceReactFeatures(workspaceReactFeatures) {
    return JSON.stringify(workspaceReactFeatures)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026');
}

/**
 * Build an inline script that exposes workspace React features to the legacy shell.
 * @param {{reactPanels: {characterLibrary: boolean, mainChatMessageList?: boolean, worldInfo?: boolean, backgroundLibrary?: boolean, extensionsHost?: boolean}}} workspaceReactFeatures
 * @returns {string}
 */
export function buildWorkspaceReactFeaturesScript(workspaceReactFeatures) {
    const serializedFeatures = serializeWorkspaceReactFeatures(workspaceReactFeatures);
    return `<script>window.${WORKSPACE_REACT_FEATURES_GLOBAL} = ${serializedFeatures};</script>`;
}

/**
 * Inject the workspace React feature payload into the workspace HTML shell.
 * @param {string} html
 * @param {{reactPanels: {characterLibrary: boolean, mainChatMessageList?: boolean, worldInfo?: boolean, backgroundLibrary?: boolean, extensionsHost?: boolean}}} workspaceReactFeatures
 * @returns {string}
 */
export function injectWorkspaceReactFeatures(html, workspaceReactFeatures = getWorkspaceReactFeatures()) {
    if (typeof html !== 'string' || html.length === 0) {
        return html;
    }

    if (html.includes(`window.${WORKSPACE_REACT_FEATURES_GLOBAL}`)) {
        return html;
    }

    const bootstrapScript = buildWorkspaceReactFeaturesScript(workspaceReactFeatures);
    if (/<\/head>/i.test(html)) {
        return html.replace(/<\/head>/i, `${bootstrapScript}\n</head>`);
    }

    return `${bootstrapScript}\n${html}`;
}
