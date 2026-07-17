import {
    isReactPageEnabled,
    isReactShellTakeoverEnabled,
    isReactShellTakeoverStrictModeEnabled,
    isReactWorkspacePanelEnabled,
} from './react-feature-flags.js';

export const WORKSPACE_REACT_FEATURES_GLOBAL = '__emberDeskWorkspaceFeatures';

export function isReactWorldInfoPanelEnabled() {
    // World Info is React sole-owner; product flag is retired.
    return true;
}

export function isReactMainChatMessageListPanelEnabled() {
    return isReactWorkspacePanelEnabled('mainChatMessageList');
}

export function isReactBackgroundLibraryPanelEnabled() {
    // Background Library is React sole-owner; product flag is retired.
    return true;
}

export function isReactExtensionsHostPanelEnabled() {
    // Extensions Host is React sole-owner for visible host controls; product flag is retired.
    return true;
}

export function isReactCharacterAuthoringPanelEnabled() {
    // Character Authoring is React sole-owner; product flag is retired.
    return true;
}

export function isReactGroupAuthoringPanelEnabled() {
    // Group Authoring is React sole-owner; product flag is retired.
    return true;
}

/**
 * Resolve the feature payload that the legacy workspace shell can read at startup.
 * @returns {{reactPages: {settings: boolean}, reactPanels: {mainChatMessageList: boolean, worldInfo: boolean, backgroundLibrary: boolean, extensionsHost: boolean, characterAuthoring: boolean, groupAuthoring: boolean}, reactShell: {takeover: boolean, strict: boolean}}}
 */
export function getWorkspaceReactFeatures() {
    return {
        reactPages: {
            settings: true,
        },
        reactPanels: {
            mainChatMessageList: isReactMainChatMessageListPanelEnabled(),
            worldInfo: isReactWorldInfoPanelEnabled(),
            backgroundLibrary: isReactBackgroundLibraryPanelEnabled(),
            extensionsHost: isReactExtensionsHostPanelEnabled(),
            characterAuthoring: isReactCharacterAuthoringPanelEnabled(),
            groupAuthoring: isReactGroupAuthoringPanelEnabled(),
        },
        reactShell: {
            strict: isReactShellTakeoverStrictModeEnabled(),
            takeover: isReactShellTakeoverEnabled(),
        },
    };
}

/**
 * Serialize the workspace feature payload for inline HTML bootstrapping.
 * @param {{reactPages?: {settings?: boolean}, reactPanels: {mainChatMessageList?: boolean, worldInfo?: boolean, backgroundLibrary?: boolean, extensionsHost?: boolean, characterAuthoring?: boolean, groupAuthoring?: boolean}, reactShell?: {strict?: boolean, takeover?: boolean}}} workspaceReactFeatures
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
 * @param {{reactPages?: {settings?: boolean}, reactPanels: {mainChatMessageList?: boolean, worldInfo?: boolean, backgroundLibrary?: boolean, extensionsHost?: boolean, characterAuthoring?: boolean, groupAuthoring?: boolean}, reactShell?: {strict?: boolean, takeover?: boolean}}} workspaceReactFeatures
 * @returns {string}
 */
export function buildWorkspaceReactFeaturesScript(workspaceReactFeatures) {
    const serializedFeatures = serializeWorkspaceReactFeatures(workspaceReactFeatures);
    return `<script>window.${WORKSPACE_REACT_FEATURES_GLOBAL} = ${serializedFeatures};</script>`;
}

/**
 * Inject the workspace React feature payload into the workspace HTML shell.
 * @param {string} html
 * @param {{reactPages?: {settings?: boolean}, reactPanels: {mainChatMessageList?: boolean, worldInfo?: boolean, backgroundLibrary?: boolean, extensionsHost?: boolean, characterAuthoring?: boolean, groupAuthoring?: boolean}, reactShell?: {strict?: boolean, takeover?: boolean}}} workspaceReactFeatures
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
