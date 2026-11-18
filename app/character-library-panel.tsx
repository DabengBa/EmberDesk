import { StrictMode } from 'react';
import { createWorkspacePortalMount, type WorkspacePortalMount } from './compat/workspace-portals';
import {
    CharacterLibraryPanel,
    type CharacterLibraryPanelBridge,
    type CharacterLibraryPanelState,
} from './components/character-library/CharacterLibraryPanel';
import {
    CharacterLibraryToolbar,
    type CharacterLibraryToolbarBridge,
} from './components/character-library/CharacterLibraryToolbar';
import type { CharacterLibraryToolbarState } from './lib/character-library-helpers';
import { Theme } from '@astryxdesign/core';
import { emberDeskTheme } from './lib/theme-tokens';
import '@astryxdesign/core/astryx.css';

let panelPortal: WorkspacePortalMount | null = null;
let mountContainer: HTMLElement | null = null;
let bridgeRef: CharacterLibraryPanelBridge | null = null;
let currentState: CharacterLibraryPanelState | null = null;
let toolbarPortal: WorkspacePortalMount | null = null;
let toolbarContainer: HTMLElement | null = null;
let toolbarBridgeRef: CharacterLibraryToolbarBridge | null = null;
let currentToolbarState: CharacterLibraryToolbarState | null = null;

function renderPanel() {
    if (!mountContainer || !bridgeRef || !currentState) {
        return;
    }

    panelPortal ??= createWorkspacePortalMount(mountContainer);
    panelPortal.render(
        <StrictMode>
            <Theme theme={emberDeskTheme} mode="dark">
                <CharacterLibraryPanel bridge={bridgeRef} state={currentState} />
            </Theme>
        </StrictMode>,
    );
}

export function mountCharacterLibraryPanel(
    container: HTMLElement,
    bridge: CharacterLibraryPanelBridge,
    initialState: CharacterLibraryPanelState,
) {
    if (mountContainer !== container) {
        panelPortal?.unmount();
        panelPortal = null;
    }
    mountContainer = container;
    bridgeRef = bridge;
    currentState = initialState;
    renderPanel();
}

export function updateCharacterLibraryPanel(nextState: CharacterLibraryPanelState) {
    if (!panelPortal?.isMounted()) return;
    currentState = nextState;
    renderPanel();
}

function renderToolbar() {
    if (!toolbarContainer || !toolbarBridgeRef || !currentToolbarState) {
        return;
    }

    toolbarPortal ??= createWorkspacePortalMount(toolbarContainer);
    toolbarPortal.render(
        <StrictMode>
            <Theme theme={emberDeskTheme} mode="dark">
                <CharacterLibraryToolbar bridge={toolbarBridgeRef} state={currentToolbarState} />
            </Theme>
        </StrictMode>,
    );
}

export function mountCharacterLibraryToolbar(
    container: HTMLElement,
    bridge: CharacterLibraryToolbarBridge,
    initialState: CharacterLibraryToolbarState,
) {
    if (toolbarContainer !== container) {
        toolbarPortal?.unmount();
        toolbarPortal = null;
    }
    toolbarContainer = container;
    toolbarBridgeRef = bridge;
    currentToolbarState = initialState;
    renderToolbar();
}

export function updateCharacterLibraryToolbar(nextState: CharacterLibraryToolbarState) {
    if (!toolbarPortal?.isMounted()) return;
    currentToolbarState = nextState;
    renderToolbar();
}

export function unmountCharacterLibraryPanel() {
    panelPortal?.unmount();
    toolbarPortal?.unmount();
    panelPortal = null;
    toolbarPortal = null;
    mountContainer = null;
    toolbarContainer = null;
    bridgeRef = null;
    toolbarBridgeRef = null;
    currentState = null;
    currentToolbarState = null;
}
