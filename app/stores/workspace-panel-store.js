import { createStore } from 'zustand/vanilla';

export const WORKSPACE_PANEL_KINDS = Object.freeze([
    'worldInfo',
    'backgroundLibrary',
    'extensionsHost',
    'mainChatMessageList',
]);

const SUPPORTED_PANEL_KINDS = new Set(WORKSPACE_PANEL_KINDS);

function assertWorkspacePanelKind(kind) {
    if (!SUPPORTED_PANEL_KINDS.has(kind)) {
        throw new Error(`Unsupported workspace panel kind: ${String(kind)}`);
    }
}

function createDefaultPanelSnapshot(kind) {
    return {
        bridgeAttached: false,
        kind,
        mountStatus: 'unmounted',
        state: null,
        updatedAt: 0,
    };
}

function createInitialWorkspacePanelState() {
    return {
        panels: Object.fromEntries(WORKSPACE_PANEL_KINDS.map(kind => [kind, createDefaultPanelSnapshot(kind)])),
    };
}

const workspacePanelStore = createStore(() => createInitialWorkspacePanelState());

export function getWorkspacePanelStore() {
    return workspacePanelStore;
}

export function resetWorkspacePanelStore() {
    workspacePanelStore.setState(createInitialWorkspacePanelState(), true);
}

export function getWorkspacePanelSnapshot(kind) {
    assertWorkspacePanelKind(kind);
    return workspacePanelStore.getState().panels[kind];
}

function setWorkspacePanelSnapshot(kind, snapshot) {
    assertWorkspacePanelKind(kind);
    workspacePanelStore.setState(currentState => ({
        panels: {
            ...currentState.panels,
            [kind]: snapshot,
        },
    }));
}

/**
 * @param {string} kind
 * @param {unknown} [state]
 * @param {unknown} [bridge]
 */
export function recordWorkspacePanelMount(kind, state = null, bridge = null) {
    assertWorkspacePanelKind(kind);
    setWorkspacePanelSnapshot(kind, {
        bridgeAttached: Boolean(bridge),
        kind,
        mountStatus: 'mounted',
        state: state ?? null,
        updatedAt: Date.now(),
    });
}

/**
 * @param {string} kind
 * @param {unknown} [state]
 * @param {unknown} [bridge]
 */
export function recordWorkspacePanelUpdate(kind, state = null, bridge = undefined) {
    const previousSnapshot = getWorkspacePanelSnapshot(kind);
    setWorkspacePanelSnapshot(kind, {
        bridgeAttached: bridge === undefined ? previousSnapshot.bridgeAttached : Boolean(bridge),
        kind,
        mountStatus: 'mounted',
        state: state ?? null,
        updatedAt: Date.now(),
    });
}

export function recordWorkspacePanelUnmount(kind) {
    assertWorkspacePanelKind(kind);
    setWorkspacePanelSnapshot(kind, createDefaultPanelSnapshot(kind));
}

export function subscribeWorkspacePanel(kind, listener) {
    assertWorkspacePanelKind(kind);
    let previousSnapshot = getWorkspacePanelSnapshot(kind);
    return workspacePanelStore.subscribe(currentState => {
        const nextSnapshot = currentState.panels[kind];
        if (nextSnapshot === previousSnapshot) {
            return;
        }
        previousSnapshot = nextSnapshot;
        listener(nextSnapshot);
    });
}
