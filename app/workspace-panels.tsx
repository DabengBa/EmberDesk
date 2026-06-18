import { StrictMode, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export type WorkspacePanelKind = 'worldInfo' | 'backgroundLibrary' | 'extensionsHost';

interface WorkspacePanelMount {
    root: Root;
    container: HTMLElement;
    kind: WorkspacePanelKind;
    state?: unknown;
}

interface WorkspacePanelMountOptions {
    state?: unknown;
}

interface WorldInfoWorkspacePanelState {
    globalSelectorPresent?: boolean;
    editorSelectorPresent?: boolean;
    selectorsSeparated?: boolean;
    importMenuPresent?: boolean;
    importBusy?: boolean;
    dropTargetPresent?: boolean;
}

interface BackgroundLibraryWorkspacePanelState {
    status?: 'disabled' | 'loading' | 'empty' | 'success' | 'error';
    showLoading?: boolean;
    showEmpty?: boolean;
    showError?: boolean;
    systemContainerPresent?: boolean;
    chatContainerPresent?: boolean;
    systemItemCount?: number;
    chatItemCount?: number;
    refreshQueued?: boolean;
}

interface ExtensionsHostWorkspacePanelState {
    extensionsSettingsPresent?: boolean;
    extensionsSettings2Present?: boolean;
    regexContainerPresent?: boolean;
    extensionsMenuButtonPresent?: boolean;
    extensionsMenuPresent?: boolean;
    extrasApiControlsPresent?: boolean;
    manageButtonPresent?: boolean;
    installButtonPresent?: boolean;
    deferredState?: 'idle' | 'loading' | 'failed';
    deferredPlaceholderPresent?: boolean;
}

const queryClient = new QueryClient();
const mountedPanels = new Map<WorkspacePanelKind, WorkspacePanelMount>();

function WorkspacePanelPlaceholder({ kind }: { kind: WorkspacePanelKind }) {
    return (
        <section className="emberdesk-react-workspace-panel" data-react-workspace-panel={kind}>
            <div className="flex-container flexFlowColumn gap8">
                <div className="title_restorable">React workspace panel host</div>
                <div className="opacity50">
                    {kind} is ready for its legacy bridge.
                </div>
            </div>
        </section>
    );
}

function asWorldInfoState(state: unknown): WorldInfoWorkspacePanelState {
    if (!state || typeof state !== 'object') {
        return {};
    }

    return state as WorldInfoWorkspacePanelState;
}

function asBackgroundLibraryState(state: unknown): BackgroundLibraryWorkspacePanelState {
    if (!state || typeof state !== 'object') {
        return {};
    }

    return state as BackgroundLibraryWorkspacePanelState;
}

function asExtensionsHostState(state: unknown): ExtensionsHostWorkspacePanelState {
    if (!state || typeof state !== 'object') {
        return {};
    }

    return state as ExtensionsHostWorkspacePanelState;
}

function BridgeStateRow({
    stateId,
    label,
    ready,
    busy = false,
}: {
    stateId: string;
    label: string;
    ready: boolean;
    busy?: boolean;
}) {
    const status = busy ? 'Busy' : ready ? 'Ready' : 'Missing';

    return (
        <div className="flex-container justifyspacebetween alignitemscenter gap8" data-world-info-bridge-state={stateId}>
            <span>{label}</span>
            <span className={ready ? 'success' : 'warning'}>{status}</span>
        </div>
    );
}

function WorldInfoWorkspacePanel({ state }: { state?: unknown }) {
    const bridgeState = asWorldInfoState(state);

    return (
        <section
            className="emberdesk-react-workspace-panel"
            data-react-workspace-panel="worldInfo"
            data-world-info-legacy-boundary="activation-import-regex-prompt-delete"
        >
            <div className="flex-container flexFlowColumn gap8">
                <div className="title_restorable">World Info</div>
                <BridgeStateRow
                    stateId="global-selector"
                    label="Global"
                    ready={Boolean(bridgeState.globalSelectorPresent)}
                />
                <BridgeStateRow
                    stateId="editor-selector"
                    label="Editor"
                    ready={Boolean(bridgeState.editorSelectorPresent && bridgeState.selectorsSeparated)}
                />
                <BridgeStateRow
                    stateId="import"
                    label="Import"
                    ready={Boolean(bridgeState.importMenuPresent)}
                    busy={Boolean(bridgeState.importBusy)}
                />
                <BridgeStateRow
                    stateId="drop-target"
                    label="Drop area"
                    ready={Boolean(bridgeState.dropTargetPresent)}
                />
            </div>
        </section>
    );
}

function BackgroundLibraryWorkspacePanel({ state }: { state?: unknown }) {
    const bridgeState = asBackgroundLibraryState(state);
    const statusLabel = bridgeState.showLoading
        ? 'Loading'
        : bridgeState.showError
            ? 'Error'
            : bridgeState.showEmpty
                ? 'Empty'
                : bridgeState.status === 'success'
                    ? 'Ready'
                    : 'Idle';

    return (
        <section
            className="emberdesk-react-workspace-panel"
            data-react-workspace-panel="backgroundLibrary"
            data-background-library-legacy-boundary="upload-delete-rename-select-lock-slash"
        >
            <div className="flex-container flexFlowColumn gap8">
                <div className="title_restorable">Backgrounds</div>
                <div className="flex-container justifyspacebetween alignitemscenter gap8" data-background-library-bridge-state="status">
                    <span>Status</span>
                    <span className={bridgeState.showError ? 'warning' : 'success'}>{statusLabel}</span>
                </div>
                <div className="flex-container justifyspacebetween alignitemscenter gap8" data-background-library-bridge-state="global-gallery">
                    <span>Global</span>
                    <span>{bridgeState.systemContainerPresent ? bridgeState.systemItemCount ?? 0 : 'Missing'}</span>
                </div>
                <div className="flex-container justifyspacebetween alignitemscenter gap8" data-background-library-bridge-state="chat-gallery">
                    <span>Chat</span>
                    <span>{bridgeState.chatContainerPresent ? bridgeState.chatItemCount ?? 0 : 'Missing'}</span>
                </div>
            </div>
        </section>
    );
}

function ExtensionsHostStateRow({
    stateId,
    label,
    ready,
}: {
    stateId: string;
    label: string;
    ready: boolean;
}) {
    return (
        <div className="flex-container justifyspacebetween alignitemscenter gap8" data-extensions-host-bridge-state={stateId}>
            <span>{label}</span>
            <span className={ready ? 'success' : 'warning'}>{ready ? 'Ready' : 'Missing'}</span>
        </div>
    );
}

function ExtensionsHostWorkspacePanel({ state }: { state?: unknown }) {
    const bridgeState = asExtensionsHostState(state);
    const loaderLabel = bridgeState.deferredState === 'failed'
        ? 'Failed'
        : bridgeState.deferredState === 'loading'
            ? 'Loading'
            : 'Ready';

    return (
        <section
            className="emberdesk-react-workspace-panel"
            data-react-workspace-panel="extensionsHost"
            data-extensions-host-legacy-boundary="mount-points-loader-wand-regex-aliases"
        >
            <div className="flex-container flexFlowColumn gap8">
                <div className="title_restorable">Extensions</div>
                <ExtensionsHostStateRow
                    stateId="extensions-settings"
                    label="Settings column"
                    ready={Boolean(bridgeState.extensionsSettingsPresent)}
                />
                <ExtensionsHostStateRow
                    stateId="extensions-settings2"
                    label="Settings column 2"
                    ready={Boolean(bridgeState.extensionsSettings2Present)}
                />
                <ExtensionsHostStateRow
                    stateId="regex-container"
                    label="Regex"
                    ready={Boolean(bridgeState.regexContainerPresent)}
                />
                <ExtensionsHostStateRow
                    stateId="wand-menu"
                    label="Wand menu"
                    ready={Boolean(bridgeState.extensionsMenuButtonPresent && bridgeState.extensionsMenuPresent)}
                />
                <ExtensionsHostStateRow
                    stateId="extras-api"
                    label="Extras API"
                    ready={Boolean(bridgeState.extrasApiControlsPresent)}
                />
                <div className="flex-container justifyspacebetween alignitemscenter gap8" data-extensions-host-bridge-state="loader">
                    <span>Loader</span>
                    <span className={bridgeState.deferredState === 'failed' ? 'warning' : 'success'}>{loaderLabel}</span>
                </div>
            </div>
        </section>
    );
}

function renderPanel(kind: WorkspacePanelKind, state?: unknown): ReactNode {
    switch (kind) {
        case 'worldInfo':
            return <WorldInfoWorkspacePanel state={state} />;
        case 'backgroundLibrary':
            return <BackgroundLibraryWorkspacePanel state={state} />;
        case 'extensionsHost':
            return <ExtensionsHostWorkspacePanel state={state} />;
        default:
            return <WorkspacePanelPlaceholder kind={kind} />;
    }
}

function renderIntoPanel(mount: WorkspacePanelMount) {
    mount.root.render(
        <StrictMode>
            <QueryClientProvider client={queryClient}>
                {renderPanel(mount.kind, mount.state)}
            </QueryClientProvider>
        </StrictMode>,
    );
}

export function mountWorkspacePanel(kind: WorkspacePanelKind, container: HTMLElement, options: WorkspacePanelMountOptions = {}) {
    const existingPanel = mountedPanels.get(kind);
    if (existingPanel) {
        if (existingPanel.container !== container) {
            existingPanel.root.unmount();
            mountedPanels.delete(kind);
        } else {
            existingPanel.state = options.state;
            renderIntoPanel(existingPanel);
            return;
        }
    }

    const mount = {
        root: createRoot(container),
        container,
        kind,
        state: options.state,
    };
    mountedPanels.set(kind, mount);
    renderIntoPanel(mount);
}

export function updateWorkspacePanel(kind: WorkspacePanelKind, options: WorkspacePanelMountOptions = {}) {
    const mount = mountedPanels.get(kind);
    if (!mount) {
        return;
    }

    if ('state' in options) {
        mount.state = options.state;
    }
    renderIntoPanel(mount);
}

export function unmountWorkspacePanel(kind: WorkspacePanelKind) {
    const mount = mountedPanels.get(kind);
    if (!mount) {
        return;
    }

    mount.root.unmount();
    mountedPanels.delete(kind);
}
