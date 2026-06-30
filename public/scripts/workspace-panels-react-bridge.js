import {
    WORKSPACE_PANEL_MOUNT_FALLBACK_REASONS,
    createWorkspacePanelFallbackResult,
    createWorkspacePanelMountedResult,
} from './workspace-panel-mount-contract.js';

export const REACT_WORKSPACE_PANELS_ASSET_PATH = '/react/login/assets/workspace-panels.js';

export function getDefaultWorkspaceReactFeatures() {
    return {
        reactPanels: {
            characterLibrary: false,
            mainChatMessageList: false,
            worldInfo: false,
            backgroundLibrary: false,
            extensionsHost: false,
        },
    };
}

export function isReactWorkspacePanelEnabled(kind, features = globalThis.__emberDeskWorkspaceFeatures ?? getDefaultWorkspaceReactFeatures()) {
    return Boolean(features?.reactPanels?.[kind]);
}

export function createWorkspacePanelsModuleLoader(importModule = assetPath => import(assetPath)) {
    let modulePromise = null;

    return function loadWorkspacePanelsModule() {
        if (!modulePromise) {
            modulePromise = importModule(REACT_WORKSPACE_PANELS_ASSET_PATH).catch(error => {
                modulePromise = null;
                throw error;
            });
        }

        return modulePromise;
    };
}

export const loadWorkspacePanelsModule = createWorkspacePanelsModuleLoader();

export async function mountReactWorkspacePanel({
    kind,
    container,
    state,
    bridge,
    features,
    loadModule = loadWorkspacePanelsModule,
    onError = (error, panelKind, reason) => {
        const action = reason === WORKSPACE_PANEL_MOUNT_FALLBACK_REASONS.MOUNT_FAILED ? 'mount' : 'load';
        console.warn(`React ${panelKind} workspace panel failed to ${action}. Falling back to legacy panel.`, error);
    },
}) {
    if (!isReactWorkspacePanelEnabled(kind, features)) {
        return createWorkspacePanelFallbackResult(kind, WORKSPACE_PANEL_MOUNT_FALLBACK_REASONS.FEATURE_DISABLED);
    }

    if (!container) {
        return createWorkspacePanelFallbackResult(kind, WORKSPACE_PANEL_MOUNT_FALLBACK_REASONS.MISSING_CONTAINER);
    }

    let panelModule;
    try {
        panelModule = await loadModule();
    } catch (error) {
        onError(error, kind, WORKSPACE_PANEL_MOUNT_FALLBACK_REASONS.BUNDLE_LOAD_FAILED);
        return createWorkspacePanelFallbackResult(kind, WORKSPACE_PANEL_MOUNT_FALLBACK_REASONS.BUNDLE_LOAD_FAILED);
    }

    try {
        panelModule.mountWorkspacePanel(kind, container, { state, bridge });
        return createWorkspacePanelMountedResult(kind);
    } catch (error) {
        onError(error, kind, WORKSPACE_PANEL_MOUNT_FALLBACK_REASONS.MOUNT_FAILED);
        return createWorkspacePanelFallbackResult(kind, WORKSPACE_PANEL_MOUNT_FALLBACK_REASONS.MOUNT_FAILED);
    }
}
