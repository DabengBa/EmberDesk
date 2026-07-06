import { createStore } from 'zustand/vanilla';

export const WORKSPACE_PANEL_KINDS = Object.freeze([
    'worldInfo',
    'backgroundLibrary',
    'extensionsHost',
    'mainChatMessageList',
]);

export const WORKSPACE_PANEL_DOCK_KINDS = Object.freeze([
    'aiConfig',
    'advancedFormatting',
    'characterLibrary',
    'worldInfo',
    'backgroundLibrary',
    'extensionsHost',
    'settings',
    'groupChats',
    'characterAuthoring',
]);

const SUPPORTED_PANEL_KINDS = new Set(WORKSPACE_PANEL_KINDS);
const SUPPORTED_PANEL_DOCK_KINDS = new Set(WORKSPACE_PANEL_DOCK_KINDS);

const WORKSPACE_PANEL_DOCK_STATUSES = new Set([
    'idle',
    'disabled',
    'loading',
    'empty',
    'success',
    'error',
]);

function assertWorkspacePanelKind(kind) {
    if (!SUPPORTED_PANEL_KINDS.has(kind)) {
        throw new Error(`Unsupported workspace panel kind: ${String(kind)}`);
    }
}

function assertWorkspacePanelDockKind(kind) {
    if (!SUPPORTED_PANEL_DOCK_KINDS.has(kind)) {
        throw new Error(`Unsupported workspace dock panel kind: ${String(kind)}`);
    }
}

function assertWorkspacePanelDockStatus(status) {
    if (!WORKSPACE_PANEL_DOCK_STATUSES.has(status)) {
        throw new Error(`Unsupported workspace dock panel status: ${String(status)}`);
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

function createDefaultDockSnapshot() {
    return {
        activePanelKind: null,
        activePanelStatus: 'idle',
        fallbackReason: null,
        lockedPanelKinds: [],
        openPanelKinds: [],
        pinnedPanelKinds: [],
        updatedAt: 0,
    };
}

function createInitialWorkspacePanelState() {
    return {
        dock: createDefaultDockSnapshot(),
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

export function getWorkspacePanelDockSnapshot() {
    return workspacePanelStore.getState().dock;
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

function rememberPanelKind(panelKinds, kind, shouldRemember) {
    if (!shouldRemember) {
        return panelKinds;
    }

    return panelKinds.includes(kind) ? panelKinds : [...panelKinds, kind];
}

function reconcilePanelKindPresence(panelKinds, kind, shouldRemember) {
    const nextPanelKinds = panelKinds.filter(panelKind => panelKind !== kind);
    return shouldRemember ? [...nextPanelKinds, kind] : nextPanelKinds;
}

function setWorkspacePanelDockSnapshot(kind, {
    fallbackReason = null,
    locked,
    pinned,
    status,
}) {
    assertWorkspacePanelDockKind(kind);
    assertWorkspacePanelDockStatus(status);
    workspacePanelStore.setState(currentState => {
        const shouldKeepLocked = locked ?? currentState.dock.lockedPanelKinds.includes(kind);
        const shouldKeepPinned = pinned ?? currentState.dock.pinnedPanelKinds.includes(kind);

        return {
            dock: {
                activePanelKind: kind,
                activePanelStatus: status,
                fallbackReason,
                lockedPanelKinds: reconcilePanelKindPresence(currentState.dock.lockedPanelKinds, kind, shouldKeepLocked),
                openPanelKinds: rememberPanelKind(currentState.dock.openPanelKinds, kind, true),
                pinnedPanelKinds: reconcilePanelKindPresence(currentState.dock.pinnedPanelKinds, kind, shouldKeepPinned),
                updatedAt: Date.now(),
            },
        };
    });
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

/**
 * @param {string} kind
 * @param {{locked?: boolean, pinned?: boolean}} [options]
 */
export function recordWorkspacePanelDockIntent(kind, options = {}) {
    setWorkspacePanelDockSnapshot(kind, {
        fallbackReason: null,
        locked: options.locked,
        pinned: options.pinned,
        status: 'loading',
    });
}

/**
 * @param {string} kind
 * @param {{fallbackReason?: string | null, locked?: boolean, pinned?: boolean, status?: string}} [result]
 */
export function recordWorkspacePanelDockResult(kind, result = {}) {
    setWorkspacePanelDockSnapshot(kind, {
        fallbackReason: result.fallbackReason ?? null,
        locked: result.locked,
        pinned: result.pinned,
        status: result.status ?? 'success',
    });
}

/**
 * @param {string} kind
 * @param {{locked?: boolean, pinned?: boolean, status?: string}} [result]
 */
export function recordWorkspacePanelDockClose(kind, result = {}) {
    assertWorkspacePanelDockKind(kind);
    const shouldStayOpen = result.locked === true || result.pinned === true;
    if (shouldStayOpen) {
        setWorkspacePanelDockSnapshot(kind, {
            fallbackReason: null,
            locked: result.locked,
            pinned: result.pinned,
            status: result.status ?? 'success',
        });
        return;
    }

    workspacePanelStore.setState(currentState => ({
        dock: {
            ...currentState.dock,
            activePanelKind: currentState.dock.activePanelKind === kind ? null : currentState.dock.activePanelKind,
            activePanelStatus: currentState.dock.activePanelKind === kind ? 'idle' : currentState.dock.activePanelStatus,
            fallbackReason: currentState.dock.activePanelKind === kind ? null : currentState.dock.fallbackReason,
            openPanelKinds: currentState.dock.openPanelKinds.filter(panelKind => panelKind !== kind),
            updatedAt: Date.now(),
        },
    }));
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

export function subscribeWorkspacePanelDock(listener) {
    let previousSnapshot = getWorkspacePanelDockSnapshot();
    return workspacePanelStore.subscribe(currentState => {
        const nextSnapshot = currentState.dock;
        if (nextSnapshot === previousSnapshot) {
            return;
        }
        previousSnapshot = nextSnapshot;
        listener(nextSnapshot);
    });
}
