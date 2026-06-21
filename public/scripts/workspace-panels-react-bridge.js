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
    onError = (error, panelKind) => console.warn(`React ${panelKind} workspace panel failed to load. Falling back to legacy panel.`, error),
}) {
    if (!isReactWorkspacePanelEnabled(kind, features) || !container) {
        return false;
    }

    try {
        const panelModule = await loadModule();
        panelModule.mountWorkspacePanel(kind, container, { state, bridge });
        return true;
    } catch (error) {
        onError(error, kind);
        return false;
    }
}
