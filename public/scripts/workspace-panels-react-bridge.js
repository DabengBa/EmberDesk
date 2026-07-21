import {
    WORKSPACE_PANEL_MOUNT_FALLBACK_REASONS,
    createWorkspacePanelFallbackResult,
    createWorkspacePanelMountedResult,
} from './workspace-panel-mount-contract.js';

export const REACT_WORKSPACE_PANELS_ASSET_PATH = '/react/login/assets/workspace-panels.js';
const REACT_WORKSPACE_PANELS_ASSET_CACHE_KEY = Date.now().toString(36);

export function getReactWorkspacePanelsAssetPath() {
    const cacheKey = globalThis.__emberDeskReactWorkspacePanelsAssetCacheKey ??= REACT_WORKSPACE_PANELS_ASSET_CACHE_KEY;
    return `${REACT_WORKSPACE_PANELS_ASSET_PATH}?v=${encodeURIComponent(String(cacheKey))}`;
}

export function getDefaultWorkspaceReactFeatures() {
    return {
        reactPages: {
            settings: true,
        },
        reactPanels: {
            mainChatMessageList: true,
            worldInfo: true,
            backgroundLibrary: true,
            extensionsHost: true,
            characterAuthoring: true,
            groupAuthoring: false,
        },
    };
}

export function isReactWorkspacePanelEnabled(kind, features = getDefaultWorkspaceReactFeatures()) {
    return Boolean(features?.reactPanels?.[kind]);
}

export function createWorkspacePanelsModuleLoader(importModule = assetPath => import(assetPath)) {
    let modulePromise = null;

    return function loadWorkspacePanelsModule() {
        if (!modulePromise) {
            modulePromise = importModule(getReactWorkspacePanelsAssetPath()).catch(error => {
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

export async function unmountReactWorkspacePanel(kind, {
    loadModule = loadWorkspacePanelsModule,
    onError = (error, panelKind) => {
        console.warn(`React ${panelKind} workspace panel failed to unmount.`, error);
    },
} = {}) {
    try {
        const panelModule = await loadModule();
        panelModule.unmountWorkspacePanel?.(kind);
    } catch (error) {
        onError(error, kind);
    }
}

export async function mountReactWorkspaceShellChrome({
    container,
    state,
    bridge,
    loadModule = loadWorkspacePanelsModule,
    onError = (error, reason) => {
        const action = reason === 'mount-failed' ? 'mount' : 'load';
        console.error(`React workspace shell chrome failed to ${action}. The release build is invalid.`, error);
    },
}) {
    if (!container) {
        return { reason: 'missing-host', status: 'failed' };
    }

    let panelModule;
    try {
        panelModule = await loadModule();
    } catch (error) {
        onError(error, 'bundle-load-failed');
        return { reason: 'bundle-load-failed', status: 'failed' };
    }

    try {
        panelModule.mountWorkspaceShellChrome(container, { state, bridge });
        return { status: 'mounted' };
    } catch (error) {
        onError(error, 'mount-failed');
        return { reason: 'mount-failed', status: 'failed' };
    }
}

export async function mountReactSettingsOverlay({
    initialTab = null,
    panelKind = 'settings',
    onRequestClose,
    loadModule = loadWorkspacePanelsModule,
    onError = (error, reason) => {
        console.error(`React settings overlay failed to ${reason}.`, error);
    },
} = {}) {
    let panelModule;
    try {
        panelModule = await loadModule();
    } catch (error) {
        onError(error, 'bundle-load-failed');
        return { kind: 'settings', mounted: false, status: 'error', reason: 'bundle-load-failed' };
    }

    try {
        return panelModule.mountSettingsOverlay({ initialTab, panelKind, onRequestClose }) ?? {
            kind: 'settings',
            mounted: true,
            status: 'mounted',
        };
    } catch (error) {
        onError(error, 'mount-failed');
        return { kind: 'settings', mounted: false, status: 'error', reason: 'mount-failed' };
    }
}

export async function unmountReactSettingsOverlay({
    loadModule = loadWorkspacePanelsModule,
} = {}) {
    try {
        const panelModule = await loadModule();
        panelModule.unmountSettingsOverlay?.();
        return { kind: 'settings', mounted: false, status: 'success' };
    } catch (error) {
        console.warn('React settings overlay failed to unmount.', error);
        return { kind: 'settings', mounted: false, status: 'error', reason: 'unmount-failed' };
    }
}
