import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

let reactRoot: Root | null = null;
let mountContainer: HTMLElement | null = null;
let bridgeRef: CharacterLibraryPanelBridge | null = null;
let currentState: CharacterLibraryPanelState | null = null;
let toolbarRoot: Root | null = null;
let toolbarContainer: HTMLElement | null = null;
let toolbarBridgeRef: CharacterLibraryToolbarBridge | null = null;
let currentToolbarState: CharacterLibraryToolbarState | null = null;

const queryClient = new QueryClient();

function renderPanel() {
    if (!mountContainer || !bridgeRef || !currentState) {
        return;
    }

    reactRoot ??= createRoot(mountContainer);
    reactRoot.render(
        <StrictMode>
            <QueryClientProvider client={queryClient}>
                <CharacterLibraryPanel bridge={bridgeRef} state={currentState} />
            </QueryClientProvider>
        </StrictMode>,
    );
}

export function mountCharacterLibraryPanel(
    container: HTMLElement,
    bridge: CharacterLibraryPanelBridge,
    initialState: CharacterLibraryPanelState,
) {
    mountContainer = container;
    bridgeRef = bridge;
    currentState = initialState;
    renderPanel();
}

export function updateCharacterLibraryPanel(nextState: CharacterLibraryPanelState) {
    currentState = nextState;
    renderPanel();
}

function renderToolbar() {
    if (!toolbarContainer || !toolbarBridgeRef || !currentToolbarState) {
        return;
    }

    toolbarRoot ??= createRoot(toolbarContainer);
    toolbarRoot.render(
        <StrictMode>
            <QueryClientProvider client={queryClient}>
                <CharacterLibraryToolbar bridge={toolbarBridgeRef} state={currentToolbarState} />
            </QueryClientProvider>
        </StrictMode>,
    );
}

export function mountCharacterLibraryToolbar(
    container: HTMLElement,
    bridge: CharacterLibraryToolbarBridge,
    initialState: CharacterLibraryToolbarState,
) {
    toolbarContainer = container;
    toolbarBridgeRef = bridge;
    currentToolbarState = initialState;
    renderToolbar();
}

export function updateCharacterLibraryToolbar(nextState: CharacterLibraryToolbarState) {
    currentToolbarState = nextState;
    renderToolbar();
}

export function unmountCharacterLibraryPanel() {
    reactRoot?.unmount();
    toolbarRoot?.unmount();
    reactRoot = null;
    toolbarRoot = null;
    mountContainer = null;
    toolbarContainer = null;
    bridgeRef = null;
    toolbarBridgeRef = null;
    currentState = null;
    currentToolbarState = null;
}
