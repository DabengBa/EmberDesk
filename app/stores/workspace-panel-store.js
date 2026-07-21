import { createStore } from 'zustand/vanilla';

export const WORKSPACE_PANEL_KINDS = Object.freeze([
    'worldInfo',
    'backgroundLibrary',
    'extensionsHost',
    'mainChatMessageList',
    'characterAuthoring',
]);

export const WORKSPACE_PANEL_DOCK_KINDS = Object.freeze([
    'aiConfig',
    'advancedFormatting',
    'characterLibrary',
    'worldInfo',
    'backgroundLibrary',
    'extensionsHost',
    'settings',
    'characterAuthoring',
]);

/**
 * Legacy DOM may remain a feature-local content or compatibility host while the
 * React shell owns navigation and lifecycle. These contracts deliberately omit
 * drawer/open/pinned selectors: those are no longer shell state inputs.
 */
export const WORKSPACE_SHELL_CHILD_SLOTS = Object.freeze({
    characterLibrary: Object.freeze({
        accessibleName: 'Character Library',
        allowedCapabilities: Object.freeze(['selectCharacter', 'refreshLibrary']),
        contentOwner: 'character-library',
        mountTarget: '#rm_print_characters_block',
    }),
    worldInfo: Object.freeze({
        accessibleName: 'World Info',
        allowedCapabilities: Object.freeze(['refreshWorldInfo', 'openWorldEditor']),
        contentOwner: 'world-info-workbench',
        mountTarget: '#WorldInfo',
    }),
    backgroundLibrary: Object.freeze({
        accessibleName: 'Backgrounds',
        allowedCapabilities: Object.freeze(['refreshBackgrounds', 'selectBackground']),
        contentOwner: 'background-library',
        mountTarget: '#Backgrounds',
    }),
    extensionsHost: Object.freeze({
        accessibleName: 'Extensions',
        allowedCapabilities: Object.freeze(['manageExtensions', 'refreshExtensions']),
        contentOwner: 'extensions-host',
        mountTarget: '#rm_extensions_block',
    }),
    characterAuthoring: Object.freeze({
        accessibleName: 'Character Authoring',
        allowedCapabilities: Object.freeze(['editCharacter']),
        contentOwner: 'character-authoring',
        mountTarget: '#rm_ch_create_block',
    }),
    mainChat: Object.freeze({
        accessibleName: 'Main Chat',
        allowedCapabilities: Object.freeze(['loadMoreMessages', 'submitComposer']),
        contentOwner: 'main-chat',
        mountTarget: '#chat, #send_form, #nonQRFormItems',
    }),
});

const SUPPORTED_PANEL_KINDS = new Set(WORKSPACE_PANEL_KINDS);
const SUPPORTED_PANEL_DOCK_KINDS = new Set(WORKSPACE_PANEL_DOCK_KINDS);
const SUPPORTED_WORKSPACE_SHELL_CHILD_SLOT_KEYS = new Set(Object.keys(WORKSPACE_SHELL_CHILD_SLOTS));

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

export function getWorkspaceShellChildSlot(slotKey) {
    if (!SUPPORTED_WORKSPACE_SHELL_CHILD_SLOT_KEYS.has(slotKey)) {
        throw new Error(`Unsupported workspace shell child slot: ${String(slotKey)}`);
    }

    return WORKSPACE_SHELL_CHILD_SLOTS[slotKey];
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
 * React shell owns the pinned state and projects it to the child slot only
 * after the store transition succeeds.
 * @param {string} kind
 * @param {boolean} pinned
 */
export function recordWorkspacePanelDockPin(kind, pinned) {
    assertWorkspacePanelDockKind(kind);
    const currentDock = getWorkspacePanelDockSnapshot();
    setWorkspacePanelDockSnapshot(kind, {
        fallbackReason: currentDock.activePanelKind === kind ? currentDock.fallbackReason : null,
        locked: pinned,
        pinned,
        status: currentDock.activePanelKind === kind ? currentDock.activePanelStatus : 'success',
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
