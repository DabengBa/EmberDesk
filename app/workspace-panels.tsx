import { Component, Fragment, StrictMode, useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';

import {
    attachGlobalCompatibilityBridge,
    detachGlobalCompatibilityBridge,
} from './compat/global-compatibility-bridge.js';
import { translate, useTranslated } from './compat/i18n.js';
import type { RuntimePort } from './compat/runtime-port';
import type {
    AuthoringCommands,
    MainChatCommands,
    WorkspaceDockPanelKind,
    WorkspacePanelCommands,
    WorkspaceShellCommands,
    WorkspaceShellSlotKey,
    WorldInfoCommands,
} from './compat/workspace-commands';
import {
    getWorkspacePanelDockSnapshot,
    getWorkspaceShellChildSlot,
    recordWorkspacePanelDockIntent,
    recordWorkspacePanelDockClose,
    recordWorkspacePanelDockResult,
    recordWorkspacePanelMount,
    recordWorkspacePanelUnmount,
    recordWorkspacePanelUpdate,
    subscribeWorkspacePanelDock,
} from './stores/workspace-panel-store.js';
import {
    resetMainChatObservationStore,
    updateMainChatObservation,
} from './stores/main-chat-observation-store.js';
import { getMainChatStore } from './stores/main-chat-store';
import type {
    MainChatSnapshot,
} from './stores/main-chat-store';
export { mountLocalDialog } from './components/local-dialogs/LocalDialog';
export { createPopupRuntime } from './components/local-dialogs/PopupRuntime';
import { clearMainChatFailure, getMainChatFailure, showMainChatFailure } from '../public/scripts/main-chat-failure.js';

import {
    WorldInfoWorkbenchPanel,
    type WorldInfoWorkspacePanelState as WorldInfoWorkbenchPanelState,
} from './world-info-workbench';
import { SettingsSurface } from './components/settings/SettingsSurface';
import { ChatBackupsBrowser, type ChatBackupsCommands } from './components/chat-backups/ChatBackupsBrowser';

import { TagManagement } from './components/tags/TagManagement';
import { BulkTagEditor } from './components/tags/BulkTagEditor';
import type { BulkTagEditorRuntime, TagManagementRuntime } from './components/tags/types';

import { RegexEditor } from './components/regex/RegexEditor';
import { RegexSettingsPanel } from './components/regex/RegexSettingsPanel';
import { RegexDebugger } from './components/regex/RegexDebugger';
import { ToolBindingEditor } from './components/regex/ToolBindingEditor';
import { RegexImportTargetControl } from './components/regex/RegexImportTargetControl';
import { MacroBrowserPanel, type MacroBrowserProps } from './components/macros/MacroBrowser';
import { WorldInfoPanel } from './components/panels/WorldInfoPanel';
import { WorkspacePanelShell } from './components/panels/WorkspacePanelShell';
import { AuthoringWorkspacePanel } from './components/authoring/AuthoringWorkspacePanel';
import { MainChatMessageListWorkspacePanel } from './components/main-chat/MainChatMessageListWorkspacePanel';
import { WorkspacePanelChrome } from './components/panels/WorkspacePanelChrome';
import { ChatComposer, type ChatComposerProps } from './components/composer/ChatComposer';
import { CharacterPopup } from './components/character-popup/CharacterPopup';
import { RightNavPanel, type CharacterSortSelection } from './components/right-nav/RightNavPanel';
export { createWorkspaceDrawerService, updateCharacterSearchSort } from './lib/workspace-drawer-service';
export { createHistoryPanelController, createHistoryDisplayCommand, createExportPopupController, createExportPopupDismissal, projectHistoryChats, mergeAttachmentFiles } from './lib/history-panel-service';

import { AiConfigPanel } from './components/ai-config/AiConfigPanel';
export { createPresetService } from './lib/preset-service';
export { connectProvider, testProviderConnection } from './lib/provider-connection-service';
import type { PresetService } from './lib/preset-service';
import { PresetSaveButton } from './components/ai-config/PresetActionsMenu';
import { PromptInspectorButton, PromptManagerAddButton, PromptManagerList, type PromptPanelBridge } from './components/prompt-panel/PromptPanel';
import { PromptInspector, type PromptInspectorBridge } from './components/prompt-panel/PromptInspector';
import { WireLogPanel, type WireLogPanelBridge } from './components/wire-log/WireLogPanel';
import { ChatMemoryPanel } from './components/chat-memory/ChatMemoryPanel';
import type { ChatMemoryPanelBridge } from './components/chat-memory/types';
import { SelectChatPopup } from './components/select-chat/SelectChatPopup';
import {
    SelectChatList,
    LiveSelectChatList,
    type SelectChatListBridge,
    type SelectChatListState,
} from './components/select-chat/SelectChatList';
import { CharacterContextMenu } from './components/context-menu/CharacterContextMenu';
import { OptionsMenu } from './components/options-menu/OptionsMenu';
import { DialogueDelMesControls, DialoguePopupContent, DialoguePopupControls, DialoguePopupInput } from './components/dialogue-popups/DialoguePopups';
import { ExportFormatPopup } from './components/export-format/ExportFormatPopup';
import * as stylex from '@stylexjs/stylex';
import { workspaceShellStyles } from './styles/workspace-panels.styles.js';
import { Theme } from '@astryxdesign/core';
import { emberDeskTheme } from './lib/theme-tokens';
import '@astryxdesign/core/astryx.css';

export type WorkspacePanelKind = 'worldInfo' | 'mainChatMessageList' | 'characterAuthoring';
interface WorkspacePanelMount {
    root: Root;
    container: HTMLElement;
    kind: WorkspacePanelKind;
    runtime: RuntimePort;
    state?: unknown;
    commands?: WorkspacePanelBridge;
    revision?: number;
}

class MainChatErrorBoundary extends Component<{ host: HTMLElement; revision: number; children: ReactNode }, { failed: boolean; revision: number }> {
    state = { failed: false, revision: this.props.revision };


    static getDerivedStateFromError() { return { failed: true }; }

    static getDerivedStateFromProps(props: { revision: number }, state: { failed: boolean; revision: number }) {
        return props.revision !== state.revision ? { failed: false, revision: props.revision } : null;
    }

    componentDidCatch(error: Error) {
        console.error('React main chat render failed.', error);
        showMainChatFailure(this.props.host, translate('Could not load chat data. Try reloading the page.'));
    }

    render() { return this.state.failed ? null : this.props.children; }
}

class MainChatEffectBoundary extends Component<{ host: HTMLElement; revision: number; children: ReactNode }, { failed: boolean; revision: number }> {
    state = { failed: false, revision: this.props.revision };
    static getDerivedStateFromError() { return { failed: true }; }
    static getDerivedStateFromProps(props: { revision: number }, state: { failed: boolean; revision: number }) {
        return props.revision !== state.revision ? { failed: false, revision: props.revision } : null;
    }
    componentDidCatch(error: Error) {
        console.error('React main chat effect failed.', error);
        showMainChatFailure(this.props.host, translate('Could not load chat data. Try reloading the page.'));
    }
    render() { return this.state.failed ? null : this.props.children; }
}

function MainChatFailureOwner({ host, failure, revision }: { host: HTMLElement; failure: Element | null; revision: number }) {
    useEffect(() => {
        clearMainChatFailure(host, failure);
    }, [host, failure, revision]);
    return null;
}

interface WorkspacePanelMountOptions {
    runtime: RuntimePort;
    state?: unknown;
    commands?: WorkspacePanelBridge;
    mainChatFailure?: Element | null;
}

type WorkspacePanelDockStatus = 'idle' | 'disabled' | 'loading' | 'empty' | 'success' | 'error';

type WorkspacePanelBridge = WorkspacePanelCommands;

interface WorkspacePanelDockDispatchResult {
    locked?: boolean;
    mounted?: boolean;
    pinned?: boolean;
    reason?: string;
    status?: string;
}

interface WorkspacePanelDockSnapshot {
    activePanelKind: WorkspaceDockPanelKind | null;
    activePanelStatus: WorkspacePanelDockStatus;
    fallbackReason: string | null;
    lockedPanelKinds: WorkspaceDockPanelKind[];
    openPanelKinds: WorkspaceDockPanelKind[];
    pinnedPanelKinds: WorkspaceDockPanelKind[];
    updatedAt: number;
}

interface WorkspaceShellChromeMount {
    root: Root;
    container: HTMLElement;
    runtime: RuntimePort;
    state?: WorkspaceShellChromeState;
    commands?: WorkspaceShellCommands;
}

interface WorkspaceShellChromeMountOptions {
    runtime: RuntimePort;
    state?: WorkspaceShellChromeState;
    commands?: WorkspaceShellCommands;
}

interface WorkspaceShellChromeState {
    activeContext?: 'none' | 'assistant' | 'character';
    contextTitle?: string;
    status?: 'loading' | 'empty' | 'success' | 'error';
}

interface WorkspaceShellNavigationEntry {
    command: keyof WorkspaceShellCommands;
    icon: string;
    label: string;
    panelKind?: WorkspaceDockPanelKind;
    slotKey?: WorkspaceShellSlotKey;
}

type WorldInfoWorkspacePanelState = WorldInfoWorkbenchPanelState;

interface MainChatMessageListWorkspacePanelState {
    mainChatSnapshot?: MainChatSnapshot;
}

const queryClient = new QueryClient();
const mountedPanels = new Map<WorkspacePanelKind, WorkspacePanelMount>();
let mountedShellChrome: WorkspaceShellChromeMount | null = null;

interface SettingsPanelMount {
    root: Root;
    host: HTMLElement;
    runtime: RuntimePort;
    initialTab: string | null;
}

let mountedSettingsPanel: SettingsPanelMount | null = null;

function asMainChatMessageListState(state: unknown): MainChatMessageListWorkspacePanelState {
    if (!state || typeof state !== 'object') {
        return {};
    }

    const bridgeState = state as Record<string, unknown>;

    return {
        mainChatSnapshot: bridgeState.mainChatSnapshot as MainChatSnapshot | undefined,
    };
}

function workspacePanelStateQueryKey(kind: WorkspacePanelKind) {
    return ['workspace-panel', kind, 'bridge-state'] as const;
}

function WorkspacePanelPlaceholder({ kind }: { kind: WorkspacePanelKind }) {
    return (
        <WorkspacePanelShell
            kind={kind}
            title="Workspace panel"
            status="idle"
        >
            <div className="opacity50">
                {kind} is ready.
            </div>
        </WorkspacePanelShell>
    );
}

function asWorldInfoState(state: unknown): WorldInfoWorkspacePanelState {
    if (!state || typeof state !== 'object') {
        return {};
    }

    return state as WorldInfoWorkspacePanelState;
}

function WorldInfoWorkspacePanel({ state, commands }: { state?: unknown; commands: WorldInfoCommands }) {
    useTranslated('');
    const bridgeState = asWorldInfoState(state);
    return (
        <WorldInfoWorkbenchPanel
            state={state}
            commands={commands}
            shell={({ status, recoveryActions, children }) => (
                <WorkspacePanelShell
                    kind="worldInfo"
                    title={translate('World book')}
                    status={status}
                    actions={recoveryActions}
                    legacyBoundary="activation-import-regex-prompt-delete"
                    hideDiagnostics={true}
                    hideTitle={true}
                    slots={[
                        { id: 'global-selector', label: 'Global selector', ready: bridgeState.globalSelectorPresent },
                        { id: 'editor-selector', label: 'Editor selector', ready: Boolean(bridgeState.editorSelectorPresent && bridgeState.selectorsSeparated) },
                        { id: 'import-controls', label: 'Import controls', ready: bridgeState.importMenuPresent },
                        { id: 'legacy-editor', label: 'Legacy editor', ready: bridgeState.dropTargetPresent },
                    ]}
                >
                    {children}
                </WorkspacePanelShell>
            )}
        />
    );
}

function renderPanel(
    kind: WorkspacePanelKind,
    state: unknown,
    commands: WorkspacePanelBridge | undefined,
): ReactNode {
    switch (kind) {
        case 'worldInfo':
            return <WorldInfoWorkspacePanel state={state} commands={commands as WorldInfoCommands} />;
        case 'mainChatMessageList':
            return <MainChatMessageListWorkspacePanel commands={commands as MainChatCommands | undefined} />;
        case 'characterAuthoring':
            return <AuthoringWorkspacePanel kind="characterAuthoring" state={state} commands={commands as AuthoringCommands | undefined} />;
        default:
            return <WorkspacePanelPlaceholder kind={kind} />;
    }
}

function WorkspacePanelRoot({
    kind,
    commands,
}: {
    kind: WorkspacePanelKind;
    commands?: WorkspacePanelBridge;
}) {
    const { data: panelState } = useQuery({
        queryKey: workspacePanelStateQueryKey(kind),
        queryFn: async () => queryClient.getQueryData(workspacePanelStateQueryKey(kind)) ?? null,
        initialData: () => queryClient.getQueryData(workspacePanelStateQueryKey(kind)) ?? null,
        staleTime: Number.POSITIVE_INFINITY,
    });

    return renderPanel(kind, panelState, commands);
}

const workspaceShellNavigationEntries: WorkspaceShellNavigationEntry[] = [
    { command: 'openPromptManager', icon: 'fa-sliders', label: 'Prompt', panelKind: 'promptManager', slotKey: 'promptManager' },
    { command: 'openCharacterLibrary', icon: 'fa-address-book', label: 'Character library', panelKind: 'characterLibrary', slotKey: 'characterLibrary' },
    { command: 'openWorldInfo', icon: 'fa-book-atlas', label: 'World book', panelKind: 'worldInfo', slotKey: 'worldInfo' },
    { command: 'openRegex', icon: 'fa-code', label: 'Regex', panelKind: 'regex', slotKey: 'regex' },
    { command: 'openSettings', icon: 'fa-gear', label: 'Settings', panelKind: 'settings', slotKey: 'settings' },
];

function asWorkspacePanelDockDispatchResult(result: unknown): WorkspacePanelDockDispatchResult {
    if (!result || typeof result !== 'object') {
        return {};
    }

    return result as WorkspacePanelDockDispatchResult;
}

function getWorkspacePanelDockFallbackReason(result: unknown) {
    const dispatchResult = asWorkspacePanelDockDispatchResult(result);
    return typeof dispatchResult.reason === 'string' && dispatchResult.reason.trim()
        ? dispatchResult.reason
        : null;
}

function normalizeWorkspacePanelDockStatus(result: unknown) {
    const dispatchResult = asWorkspacePanelDockDispatchResult(result);
    if (dispatchResult.mounted === true || dispatchResult.status === 'mounted') {
        return 'success';
    }

    if (dispatchResult.status === 'disabled') {
        return 'disabled';
    }

    if (dispatchResult.status === 'fallback') {
        return dispatchResult.reason === 'feature-disabled' ? 'disabled' : 'error';
    }

    if (
        dispatchResult.status === 'loading'
        || dispatchResult.status === 'empty'
        || dispatchResult.status === 'success'
        || dispatchResult.status === 'error'
    ) {
        return dispatchResult.status;
    }

    return 'success';
}

function useWorkspacePanelDockSnapshot() {
    const [dockSnapshot, setDockSnapshot] = useState<WorkspacePanelDockSnapshot>(
        () => getWorkspacePanelDockSnapshot() as WorkspacePanelDockSnapshot,
    );

    useEffect(() => subscribeWorkspacePanelDock((nextSnapshot: WorkspacePanelDockSnapshot) => {
        setDockSnapshot(nextSnapshot);
    }), []);

    return dockSnapshot;
}

function executeWorkspaceShellNavigationCommand(
    commands: WorkspaceShellCommands | undefined,
    command: WorkspaceShellNavigationEntry['command'],
) {
    if (!commands) {
        return undefined;
    }

    switch (command) {
        case 'openCharacterLibrary':
            return commands.openCharacterLibrary();
        case 'openWorldInfo':
            return commands.openWorldInfo();
        case 'openSettings':
            return commands.openSettings();
        case 'openCharacterAuthoring':
            return commands.openCharacterAuthoring();
        case 'openRegex':
            return commands.openRegex();
        case 'openPromptManager':
            return commands.openPromptManager();
        case 'activateWorkspaceShellSlot':
        case 'deactivateWorkspaceShellSlot':
        case 'closeWorkspacePanel':
        case 'setWorkspaceShellSlotPinned':
            throw new Error(`Workspace shell command requires explicit arguments: ${command}`);
    }
}

function ReactWorkspaceShellChrome({
    state = {},
    commands,
    runtime: _runtime,
}: {
    state?: WorkspaceShellChromeState;
    commands?: WorkspaceShellCommands;
    runtime: RuntimePort;
}) {
    useTranslated('');
    const contextTitle = state.contextTitle?.trim() || 'Choose a character';
    const status = state.status ?? (state.activeContext === 'none' ? 'empty' : 'success');
    const dockSnapshot = useWorkspacePanelDockSnapshot();
    const panelDispatchSequenceRef = useRef(0);
    // A close intent queues a deferred unmount behind setTimeout; while it is
    // pending the dock snapshot still reports the panel as active, so a second
    // click in that window must mean "reopen" (supersede the close), not a
    // second close that would outlive the reopen.
    const pendingCloseIntentRef = useRef<string | null>(null);

    // Drawers can close without a nav dispatch (Escape, the chrome close
    // button, mutual exclusion when another drawer opens). The legacy shell
    // emits emberdesk:workspace-drawer-change from its open/close funnels;
    // reconcile the dock highlight so a closed drawer's entry does not stay
    // pressed.
    useEffect(() => {
        const reconcileDockWithDrawers = () => {
            const dock = getWorkspacePanelDockSnapshot();
            const active = dock.activePanelKind;
            if (!active) {
                return;
            }
            const entry = workspaceShellNavigationEntries.find(
                candidate => candidate.panelKind === active && candidate.slotKey,
            );
            if (!entry?.slotKey) {
                return;
            }
            const slot = getWorkspaceShellChildSlot(entry.slotKey);
            const drawer = document.querySelector(slot.mountTarget)?.closest('.drawer-content');
            if (drawer && !drawer.classList.contains('openDrawer')) {
                recordWorkspacePanelDockClose(active);
            }
        };
        window.addEventListener('emberdesk:workspace-drawer-change', reconcileDockWithDrawers);
        return () => window.removeEventListener('emberdesk:workspace-drawer-change', reconcileDockWithDrawers);
    }, []);

    const dispatchCommand = useCallback(async (entry: WorkspaceShellNavigationEntry) => {
        const dispatchSequence = panelDispatchSequenceRef.current + 1;
        if (entry.panelKind) {
            panelDispatchSequenceRef.current = dispatchSequence;
            recordWorkspacePanelDockIntent(entry.panelKind);
        }

        try {
            const result = entry.slotKey
                ? await commands?.activateWorkspaceShellSlot(entry.slotKey)
                : await executeWorkspaceShellNavigationCommand(commands, entry.command);
            if (entry.panelKind) {
                if (panelDispatchSequenceRef.current !== dispatchSequence) {
                    return;
                }
                recordWorkspacePanelDockResult(entry.panelKind, {
                    fallbackReason: getWorkspacePanelDockFallbackReason(result),
                    status: normalizeWorkspacePanelDockStatus(result),
                });
            }
        } catch (error) {
            if (entry.panelKind) {
                if (panelDispatchSequenceRef.current !== dispatchSequence) {
                    return;
                }
                recordWorkspacePanelDockResult(entry.panelKind, {
                    fallbackReason: 'action-failed',
                    status: 'error',
                });
            }
            console.warn('React workspace shell panel action failed.', error);
        }
    }, [commands]);

    const closePanel = useCallback(async (entry: WorkspaceShellNavigationEntry) => {
        if (!entry.panelKind) {
            return;
        }

        const dispatchSequence = panelDispatchSequenceRef.current + 1;
        panelDispatchSequenceRef.current = dispatchSequence;
        try {
            if (entry.slotKey) {
                await commands?.deactivateWorkspaceShellSlot(entry.slotKey);
            } else {
                await commands?.closeWorkspacePanel(entry.panelKind);
            }
            if (panelDispatchSequenceRef.current !== dispatchSequence) {
                return;
            }
            // A close guard (e.g. unsaved settings) may have refused the close;
            // the drawer is still open, so keep the dock highlight.
            const slot = entry.slotKey ? getWorkspaceShellChildSlot(entry.slotKey) : null;
            if (slot?.mountTarget
                && document.querySelector(slot.mountTarget)?.closest('.drawer-content')?.classList.contains('openDrawer')) {
                return;
            }
            recordWorkspacePanelDockClose(entry.panelKind);
        } catch (error) {
            if (panelDispatchSequenceRef.current !== dispatchSequence) {
                return;
            }
            recordWorkspacePanelDockResult(entry.panelKind, {
                fallbackReason: 'close-failed',
                status: 'error',
            });
            console.warn('React workspace shell panel close failed.', error);
        }
    }, [commands]);

    return (
        <header
            {...stylex.props(workspaceShellStyles.chrome)}
            data-react-workspace-shell-chrome="true"
            data-react-workspace-shell-chrome-status={status}
            data-react-workspace-shell-chrome-context={state.activeContext ?? 'none'}
            data-doc-id="feature.next_workspace_shell page.chat_workspace"
        >
            <section {...stylex.props(workspaceShellStyles.context)} aria-label="Current workspace context">
                <div {...stylex.props(workspaceShellStyles.title)}>{contextTitle}</div>
            </section>
            <nav {...stylex.props(workspaceShellStyles.nav)} aria-label={translate('Workspace navigation')}>
                {workspaceShellNavigationEntries.map(sourceEntry => {
                    const entry = { ...sourceEntry, label: translate(sourceEntry.label) };
                    const isPanelEntryActive = Boolean(entry.panelKind && dockSnapshot.activePanelKind === entry.panelKind);
                    const childSlot = entry.slotKey ? getWorkspaceShellChildSlot(entry.slotKey) : null;
                    // Drawer lock state is the .pinnedOpen class on the drawer
                    // host, restored by the legacy init pass from the NavLockOn /
                    // LNavLockOn storage seeds. The class changes without a React
                    // re-render, so the click guard re-reads it at click time.
                    const isDrawerPinned = () => Boolean(childSlot?.mountTarget
                        && document.querySelector(childSlot.mountTarget)?.closest('.drawer-content')?.classList.contains('pinnedOpen'));
                    const isPinned = isDrawerPinned();
                    const panelActionLabel = entry.panelKind
                        ? `${isPanelEntryActive && dockSnapshot.activePanelStatus !== 'error' && !isPinned ? 'Close' : 'Open'} ${entry.label}`
                        : entry.label;

                    return (
                        <Fragment key={entry.command}>
                            <button
                                type="button"
                                {...stylex.props(workspaceShellStyles.navButton, isPanelEntryActive ? workspaceShellStyles.navButtonActive : null)}
                                aria-label={panelActionLabel}
                                title={panelActionLabel}
                                aria-pressed={entry.panelKind ? isPanelEntryActive : undefined}
                                data-workspace-shell-panel-entry={entry.panelKind}
                                data-workspace-shell-panel-active={isPanelEntryActive ? 'true' : 'false'}
                                data-workspace-shell-child-slot={entry.slotKey}
                                data-workspace-shell-child-slot-owner={childSlot?.contentOwner}
                                onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    if (entry.panelKind
                                        && isPanelEntryActive
                                        && pendingCloseIntentRef.current !== entry.panelKind
                                        && dockSnapshot.activePanelStatus !== 'error'
                                        && !isDrawerPinned()) {
                                        pendingCloseIntentRef.current = entry.panelKind;
                                        window.setTimeout(() => {
                                            void closePanel(entry).finally(() => {
                                                if (pendingCloseIntentRef.current === entry.panelKind) {
                                                    pendingCloseIntentRef.current = null;
                                                }
                                            });
                                        }, 0);
                                        return;
                                    }
                                    window.setTimeout(() => {
                                        void dispatchCommand(entry);
                                    }, 0);
                                }}
                            >
                                <i className={`fa-solid ${entry.icon}`} aria-hidden="true" />
                                <span {...stylex.props(workspaceShellStyles.navButtonLabel)}>{entry.label}</span>
                            </button>
                        </Fragment>
                    );
                })}
            </nav>
        </header>
    );
}

function renderIntoShellChrome(mount: WorkspaceShellChromeMount) {
    mount.root.render(
        <StrictMode>
            <Theme theme={emberDeskTheme} mode="dark">
                <QueryClientProvider client={queryClient}>
                    <ReactWorkspaceShellChrome state={mount.state} commands={mount.commands} runtime={mount.runtime} />
                </QueryClientProvider>
            </Theme>
        </StrictMode>,
    );
}

function syncMainChatStoreSnapshot(state: unknown) {
    const mainChatSnapshot = asMainChatMessageListState(state).mainChatSnapshot;
    const mainChatStore = getMainChatStore();

    if (mainChatSnapshot) {
        mainChatStore.getState().replaceSnapshot(mainChatSnapshot);
        return;
    }

    mainChatStore.getState().reset();
}

function renderIntoPanel(mount: WorkspacePanelMount, mainChatFailure: Element | null = null) {
    if (mount.kind === 'mainChatMessageList') {
        syncMainChatStoreSnapshot(mount.state);
    }
    recordWorkspacePanelUpdate(mount.kind, mount.state ?? null, mount.commands);
    if (mount.kind === 'mainChatMessageList') {
        updateMainChatObservation(mount.state ?? {});
    }
    queryClient.setQueryData(workspacePanelStateQueryKey(mount.kind), mount.state ?? null);
    const panel = (
        <QueryClientProvider client={queryClient}>
            <WorkspacePanelRoot kind={mount.kind} commands={mount.commands} />
        </QueryClientProvider>
    );
    mount.root.render(
        <StrictMode>
            {mount.kind === 'mainChatMessageList'
                // Theme creates a DOM wrapper; the legacy #chat surface requires
                // message rows to remain its direct children. The shell chrome
                // Theme already establishes the document theme for this app.
                ? <MainChatErrorBoundary host={mount.container} revision={mount.revision ?? 0}>
                    {panel}
                    <MainChatEffectBoundary host={mount.container} revision={mount.revision ?? 0}>
                        <MainChatFailureOwner host={mount.container} failure={mainChatFailure} revision={mount.revision ?? 0} />
                    </MainChatEffectBoundary>
                </MainChatErrorBoundary>
                : <Theme theme={emberDeskTheme} mode="dark">{panel}</Theme>}
        </StrictMode>,
    );
}


/**
 * Settings drawer content host. The drawer chrome (title/pin/close) is shared
 * with the other top-center panels via WorkspacePanelChrome; Escape,
 * mutual-exclusion, pin refusal, and the unsaved-changes guard all run
 * through closeWorkspaceChildSlotHost in script.js. The dirty flag is
 * mirrored to globalThis.__emberDeskSettingsDirty for that close guard.
 */
function SettingsDrawerHost({
    initialTab,
    runtime,
}: {
    initialTab?: string | null;
    runtime: RuntimePort;
}) {
    useTranslated('');
    const handleSettingsDirtyChange = useCallback((dirty: boolean) => {
        (globalThis as Record<string, unknown>).__emberDeskSettingsDirty = dirty;
    }, []);

    return (
        <WorkspacePanelChrome
            title={translate('Settings')}
            icon="fa-solid fa-gear"
            grabberId="SettingsPanelheader"
        >
            <SettingsSurface
                variant="drawer"
                initialTab={initialTab}
                onDirtyStateChange={handleSettingsDirtyChange}
                runtime={runtime}
            />
        </WorkspacePanelChrome>
    );
}

function renderSettingsPanel(mount: SettingsPanelMount) {
    mount.root.render(
        <StrictMode>
            <Theme theme={emberDeskTheme} mode="dark">
                <QueryClientProvider client={queryClient}>
                    <SettingsDrawerHost
                        initialTab={mount.initialTab}
                        runtime={mount.runtime}
                    />
                </QueryClientProvider>
            </Theme>
        </StrictMode>,
    );
}

/**
 * Mounts the settings surface inside the #SettingsPanel drawer-content host.
 * The React root persists while the drawer toggles, so form state survives
 * close/reopen; the surface only re-renders when a new initialTab is passed.
 */
export function mountSettingsPanel(options: {
    runtime: RuntimePort;
    initialTab?: string | null;
}) {
    attachGlobalCompatibilityBridge();
    const initialTab = typeof options.initialTab === 'string' ? options.initialTab : null;
    if (mountedSettingsPanel) {
        mountedSettingsPanel.initialTab = initialTab;
        mountedSettingsPanel.runtime = options.runtime;
        renderSettingsPanel(mountedSettingsPanel);
        return { kind: 'settings', mounted: true, status: 'mounted' as const };
    }

    const drawer = document.getElementById('SettingsPanel');
    if (!(drawer instanceof HTMLElement)) {
        return { kind: 'settings', mounted: false, status: 'error' as const, reason: 'host-missing' as const };
    }
    const host = document.createElement('div');
    host.id = 'emberdesk-react-settings-panel-host';
    host.setAttribute('data-react-settings-panel-host', 'true');
    drawer.replaceChildren(host);

    mountedSettingsPanel = {
        root: createRoot(host),
        host,
        runtime: options.runtime,
        initialTab,
    };
    renderSettingsPanel(mountedSettingsPanel);
    return { kind: 'settings', mounted: true, status: 'mounted' as const };
}

export function unmountSettingsPanel() {
    if (!mountedSettingsPanel) {
        return;
    }
    mountedSettingsPanel.root.unmount();
    mountedSettingsPanel.host.remove();
    mountedSettingsPanel = null;
    (globalThis as Record<string, unknown>).__emberDeskSettingsDirty = false;
    if (mountedPanels.size === 0 && !mountedShellChrome) {
        detachGlobalCompatibilityBridge();
    }
}

export function mountWorkspacePanel(kind: WorkspacePanelKind, container: HTMLElement, options: WorkspacePanelMountOptions) {
    attachGlobalCompatibilityBridge();
    const mainChatFailure = kind === 'mainChatMessageList' ? (options.mainChatFailure === undefined ? getMainChatFailure(container) : options.mainChatFailure) : null;
    const existingPanel = mountedPanels.get(kind);
    if (existingPanel) {
        if (existingPanel.container !== container) {
            existingPanel.root.unmount();
            mountedPanels.delete(kind);
        } else {
            existingPanel.state = options.state;
            if (kind === 'mainChatMessageList') existingPanel.revision = (existingPanel.revision ?? 0) + 1;
            existingPanel.commands = options.commands;
            existingPanel.runtime = options.runtime;
            renderIntoPanel(existingPanel, mainChatFailure);
            return;
        }
    }

    const mount = {
        root: createRoot(container),
        container,
        kind,
        runtime: options.runtime,
        state: options.state,
        commands: options.commands,
    };
    mountedPanels.set(kind, mount);
    recordWorkspacePanelMount(kind, options.state ?? null, options.commands);
    renderIntoPanel(mount, mainChatFailure);
}

export function mountWorkspaceShellChrome(container: HTMLElement, options: WorkspaceShellChromeMountOptions) {
    attachGlobalCompatibilityBridge();
    if (mountedShellChrome) {
        if (mountedShellChrome.container !== container) {
            mountedShellChrome.root.unmount();
        } else {
            mountedShellChrome.state = options.state;
            mountedShellChrome.commands = options.commands;
            mountedShellChrome.runtime = options.runtime;
            renderIntoShellChrome(mountedShellChrome);
            return;
        }
    }

    mountedShellChrome = {
        root: createRoot(container),
        container,
        runtime: options.runtime,
        state: options.state,
        commands: options.commands,
    };
    renderIntoShellChrome(mountedShellChrome);
}

export function unmountWorkspaceShellChrome() {
    if (!mountedShellChrome) {
        return;
    }

    mountedShellChrome.root.unmount();
    mountedShellChrome = null;
    if (mountedPanels.size === 0) {
        detachGlobalCompatibilityBridge();
    }
}

export function updateWorkspacePanel(kind: WorkspacePanelKind, options: { state?: unknown } = {}) {
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
    recordWorkspacePanelUnmount(kind);
    if (kind === 'mainChatMessageList') {
        resetMainChatObservationStore();
    }
    if (mountedPanels.size === 0) {
        detachGlobalCompatibilityBridge();
    }
}

interface ChatBackupsMount {
    root: Root;
    host: HTMLElement;
    options: ChatBackupsMountOptions;
}

interface ChatBackupsMountOptions {
    buttonContainer: HTMLElement;
    listContainer: HTMLElement;
    commands: ChatBackupsCommands;
    /** Bump to force a list reload while the browser stays open. */
    refreshToken?: number;
}

let mountedChatBackups: ChatBackupsMount | null = null;

function renderChatBackupsBrowser(mount: ChatBackupsMount) {
    mount.root.render(
        <StrictMode>
            <Theme theme={emberDeskTheme} mode="dark">
                <ChatBackupsBrowser
                    buttonContainer={mount.options.buttonContainer}
                    listContainer={mount.options.listContainer}
                    commands={mount.options.commands}
                    refreshToken={mount.options.refreshToken ?? 0}
                />
            </Theme>
        </StrictMode>,
    );
}

export function mountChatBackupsBrowser(options: ChatBackupsMountOptions) {
    attachGlobalCompatibilityBridge();
    if (mountedChatBackups) {
        mountedChatBackups.options = options;
        renderChatBackupsBrowser(mountedChatBackups);
        return;
    }

    const host = document.createElement('div');
    host.id = 'emberdesk-react-chat-backups-host';
    host.setAttribute('data-react-chat-backups-host', 'true');
    host.style.display = 'none';
    document.body.appendChild(host);

    mountedChatBackups = {
        root: createRoot(host),
        host,
        options,
    };
    renderChatBackupsBrowser(mountedChatBackups);
}

export function unmountChatBackupsBrowser() {
    if (!mountedChatBackups) {
        return;
    }

    mountedChatBackups.root.unmount();
    mountedChatBackups.host.remove();
    mountedChatBackups = null;
    if (mountedPanels.size === 0 && !mountedShellChrome && !mountedSettingsPanel) {
        detachGlobalCompatibilityBridge();
    }
}

const mountedSmallPanels = new Map<HTMLElement, Root>();


function mountSmallPanel(container: HTMLElement, element: ReactElement) {
    attachGlobalCompatibilityBridge();
    if (mountedSmallPanels.has(container)) {
        return;
    }

    const root = createRoot(container);
    mountedSmallPanels.set(container, root);
    // Commit synchronously: adapters bind legacy handlers to the rendered
    // IDs immediately after the mount call returns.
    flushSync(() => root.render(
        <StrictMode>
            <Theme theme={emberDeskTheme} mode="dark">
                {element}
            </Theme>
        </StrictMode>,
    ));
}


/**
 * Mounts the Tag Management popup content inside the popup shell. React owns
 * markup and interactions; the tag runtime owns the model and persistence.
 * Without a runtime the host falls back to the legacy DOM rows appended by
 * tags.js, so the two owners never coexist.
 */
export function mountTagManagement(
    container: HTMLElement,
    options: { runtime?: TagManagementRuntime; bogusFolders?: boolean },
) {
    const { runtime, bogusFolders = true } = options;
    if (!runtime) {
        return () => { };
    }
    mountSmallPanel(container, <TagManagement runtime={runtime} bogusFolders={bogusFolders} />);
    return () => unmountSmallPanel(container);
}

/**
 * Mounts the bulk tag editor into the legacy bulk-edit popup body. The host
 * keeps the popup chrome; this component owns the tag editing surface.
 */
export function mountBulkTagEditor(
    container: HTMLElement,
    options: {
        runtime: BulkTagEditorRuntime;
        avatars?: Array<{ id: string; name: string; url: string; isFav: boolean }>;
        onClose?: () => void;
        onOpenTagManager?: () => void;
    },
) {
    mountSmallPanel(
        container,
        <BulkTagEditor
            runtime={options.runtime}
            avatars={options.avatars}
            onClose={options.onClose}
            onOpenTagManager={options.onOpenTagManager}
        />,
    );
    return () => unmountSmallPanel(container);
}

export function unmountSmallPanel(container: HTMLElement) {
    const root = mountedSmallPanels.get(container);
    mountedSmallPanels.delete(container);
    root?.unmount();
}

/**
 * Mounts the Regex Editor popup content inside the legacy popup shell.
 * The form is React-controlled; index.js supplies the draft and persistence.
 */
export function mountRegexEditor(
    container: HTMLElement,
    options: {
        initial?: import('./components/regex/regex-types').RegexScript | null;
        onRun?: (script: import('./components/regex/regex-types').RegexScript, input: string) => string;
        infoFor?: (script: import('./components/regex/regex-types').RegexScript) => string;
        onValidityChange?: (valid: boolean) => void;
        ref?: { current: import('./components/regex/regex-types').RegexEditorHandle | null };
    } = {},
) {
    mountSmallPanel(container, <RegexEditor {...options} />);
}

/**
 * Mounts the Regex settings drawer. The list, toolbar, presets and
 * authorization toggles are React-owned through the injected bridges.
 */
export { createPromptManagerDomain } from './lib/prompt-manager';
export { createPromptPanelService } from './lib/prompt-panel-service';
export { createAuxiliaryPanelController } from './lib/auxiliary-panel-service';
export { createToolBindingsService } from './lib/tool-bindings-service';

export function mountRegexSettings(
    container: HTMLElement,
    options: {
        list?: import('./components/regex/regex-list-types').RegexListBridge;
        toolbar?: import('./components/regex/regex-types').RegexToolbar;
        presets?: import('./components/regex/regex-types').RegexPresetController;
        toolBindings?: import('./components/regex/ToolBindingsPanel').ToolBindingsBridge;
    },
) {
    mountSmallPanel(container, <RegexSettingsPanel {...options} />);
}

/**
 * Mounts the Tool Binding editor popup chrome inside a caller-provided node.
 * public/scripts/tool-bindings.js fills values and owns persistence.
 */
export function mountToolBindingEditor(container: HTMLElement, options: import('./components/regex/ToolBindingEditor').ToolBindingEditorProps) {
    mountSmallPanel(container, <ToolBindingEditor {...options} />);
}

/**
 * Mounts the Regex Debugger popup. Groups, execution, ordering and step
 * rendering are driven by the injected command surface.
 */
export function mountRegexDebugger(
    container: HTMLElement,
    options: {
        getGroups?: () => import('./components/regex/regex-types').RegexDebugGroup[];
        reorder?: (key: string, ids: string[]) => Promise<'saved'>;
        runForDebug?: (
            groups: import('./components/regex/regex-types').RegexDebugGroup[],
            input: string,
            options: { displayMode: 'replace' | 'highlight'; renderMode: 'text' | 'message' },
        ) => import('./components/regex/regex-types').RegexDebugResult;
        openEditor?: (type: import('./components/regex/regex-list-types').RegexScriptType, id?: string) => void;
        commands?: { openStepsPopup(html: string): void; openFinalPopup(result: { text: string; html?: string }): void };
        ref?: { current: import('./components/regex/regex-types').RegexDebuggerHandle | null };
    } = {},
) {
    mountSmallPanel(container, <RegexDebugger {...options} />);
}

/**
 * Mounts the regex import target picker inside the legacy popup shell.
 */
export function mountRegexImportTarget(
    container: HTMLElement,
    options: {
        characterName?: string;
        presetName?: string;
        onChange?: (value: import('./components/regex/RegexImportTargetControl').RegexImportTargetValue) => void;
        ref?: { current: import('./components/regex/RegexImportTargetControl').RegexImportTargetHandle | null };
    },
) {
    mountSmallPanel(container, <RegexImportTargetControl {...options} />);
}

/**
 * Mounts the Macro documentation browser inside a caller-provided node
 * (e.g. inside a chat message). The adapter supplies live MacroDefinition
 * objects and the legacy detail/signature renderers as helpers.
 */
export function mountMacroBrowser(container: HTMLElement, props: MacroBrowserProps) {
    mountSmallPanel(container, <MacroBrowserPanel {...props} />);
}

/**
 * Mounts the World Info drawer markup. Presentation-only: world-info.js keeps
 * behavior ownership and fills dynamic containers (entry list, editor select).
 */
export function mountWorldInfoPanel(container: HTMLElement) {
    mountSmallPanel(container, <WorldInfoPanel />);
}

/**
 * Mounts the chat composer markup into #send_form. Synchronous commit:
 * script.js binds #send_but/#send_textarea handlers immediately after.
 */
export function mountChatComposer(container: HTMLElement, props: ChatComposerProps) {
    mountSmallPanel(container, <ChatComposer {...props} />);
}

/**
 * Mounts the Advanced Definitions popup markup into #character_popup.
 * The shell stays legacy-owned (display/opacity transitions); inner markup
 * is React-rendered before script.js binds #character_cross/#character_popup_ok.
 */
export function mountCharacterPopup(container: HTMLElement) {
    mountSmallPanel(container, <CharacterPopup />);
}

/**
 * Mounts the right navigation panel markup into #right-nav-panel.
 * Synchronous commit: script.js binds #form_create and toolbar buttons,
 * tags.js fills .rm_tag_filter, and the character list renders into
 * #rm_print_characters_block — all after this mount.
 */
export function mountRightNavPanel(container: HTMLElement, options: { onCharacterSortChange: (selection: CharacterSortSelection) => void }) {
    mountSmallPanel(container, <RightNavPanel onCharacterSortChange={options.onCharacterSortChange} />);
}

/**
 * Mounts the AI response configuration drawer into #left-nav-panel.
 * The outer markup preserves legacy IDs so openai.js bindings, the preset
 * manager, and settings_map wiring reactivate unchanged; the prompt list
 * inside #completion_prompt_manager uses the prompt bridge; preset fields and
 * actions use the typed service over the same live settings authority.
 */
export function mountPromptPanel(container: HTMLElement, bridge: PromptPanelBridge, presetService: PresetService) {
    mountSmallPanel(container, <AiConfigPanel presetService={presetService} promptList={<PromptManagerList bridge={bridge} />} presetSaveButton={(onSave, busy) => <PresetSaveButton bridge={bridge} onSave={onSave} disabled={busy} />} promptHeaderActions={<><PromptInspectorButton bridge={bridge} /><PromptManagerAddButton bridge={bridge} /></>} />);
}

let promptInspectorContainer: HTMLElement | null = null;

/**
 * Mounts the prompt-inspector overlay into a host div appended to <body> by
 * the legacy shell. The bridge produces preview snapshots; the component is
 * presentation-only.
 */
export function mountPromptInspector(container: HTMLElement, bridge: PromptInspectorBridge) {
    promptInspectorContainer = container;
    mountSmallPanel(container, <PromptInspector bridge={bridge} />);
}

export function unmountPromptInspector() {
    const container = promptInspectorContainer;
    promptInspectorContainer = null;
    if (!container) {
        return;
    }
    const root = mountedSmallPanels.get(container);
    mountedSmallPanels.delete(container);
    root?.unmount();
}

export function mountChatMemoryPanel(container: HTMLElement, bridge: ChatMemoryPanelBridge) {
    mountSmallPanel(container, <ChatMemoryPanel bridge={bridge} />);
}

export function unmountChatMemoryPanel(container: HTMLElement) {
    const root = mountedSmallPanels.get(container);
    mountedSmallPanels.delete(container);
    root?.unmount();
}

let wireLogPanelContainer: HTMLElement | null = null;

/**
 * Mounts the wire log overlay into a host div appended to <body>. Same shape
 * as the prompt inspector: the panel owns only dialog chrome, the browser
 * inside keeps the data access.
 */
export function mountWireLogPanel(container: HTMLElement, bridge: WireLogPanelBridge) {
    wireLogPanelContainer = container;
    mountSmallPanel(container, <WireLogPanel bridge={bridge} />);
}

export function unmountWireLogPanel() {
    const container = wireLogPanelContainer;
    wireLogPanelContainer = null;
    if (!container) {
        return;
    }
    const root = mountedSmallPanels.get(container);
    mountedSmallPanels.delete(container);
    root?.unmount();
}

/**
 * Mounts the past-chats popup header/list shell into #select_chat_popup.
 * The list rows inside #select_chat_div are React-owned via mountSelectChatList.
 */
export { createOptionsMenuController, importHistoryFiles, exportCharacter, createHistoryRenameCommand, deleteHistoryChat, exportHistoryChat, runHistoryMenuAction } from './lib/history-panel-service';
export { createChatRecoveryDrafts, createPendingChatRecovery, restoreChatRecoveryDraft, createConditionalHistoryDelete, createIndexedDbDeleteAtomic } from './lib/chat-recovery-drafts';

export function mountSelectChatPopup(container: HTMLElement, controller: ReturnType<typeof import('./lib/history-panel-service').createHistoryPanelController>, onSearch: (query: string) => void, onClose: () => void, onNewChat: () => void, onImportFile: (input: HTMLInputElement) => void, recovery?: import('./components/select-chat/SelectChatPopup').RecoveryDraftBridge) {
    mountSmallPanel(container, <SelectChatPopup controller={controller} onSearch={onSearch} onClose={onClose} onNewChat={onNewChat} onImportFile={onImportFile} recovery={recovery} />);
}

let selectChatListRoot: Root | null = null;
let selectChatListContainer: HTMLElement | null = null;
let selectChatListBridge: SelectChatListBridge | null = null;
let selectChatListState: SelectChatListState | null = null;

function renderSelectChatList() {
    if (!selectChatListContainer || !selectChatListBridge || !selectChatListState) {
        return;
    }
    if (!selectChatListContainer.isConnected) {
        // Popup shell replaces children on remount; drop the stale root.
        selectChatListRoot = null;
        selectChatListContainer = null;
        return;
    }
    selectChatListRoot ??= createRoot(selectChatListContainer);
    // Synchronous commit: delegated handlers and post-render measurements
    // (highlight scroll/flash) run immediately after this returns.
    flushSync(() => selectChatListRoot?.render(
        <StrictMode>
            <Theme theme={emberDeskTheme} mode="dark">
                {selectChatListBridge?.controller
                    ? <LiveSelectChatList controller={selectChatListBridge.controller} state={selectChatListState as SelectChatListState} bridge={selectChatListBridge} />
                    : <SelectChatList state={selectChatListState as SelectChatListState} bridge={selectChatListBridge as SelectChatListBridge} />}
            </Theme>
        </StrictMode>,
    ));
}

/**
 * Mounts or updates the React-owned chat list inside #select_chat_div.
 * displayChats (chat-ops-service) stays the fetch/sort orchestration and calls
 * this with projected row data. Returns false when the container is absent so
 * the caller can fail closed.
 */
export function mountSelectChatList(container: HTMLElement, bridge: SelectChatListBridge, state: SelectChatListState): boolean {
    if (!(container instanceof HTMLElement)) {
        return false;
    }
    attachGlobalCompatibilityBridge();
    selectChatListContainer = container;
    selectChatListBridge = bridge;
    selectChatListState = state;
    renderSelectChatList();
    return true;
}

export function updateSelectChatList(state: SelectChatListState): boolean {
    if (!selectChatListContainer?.isConnected) {
        return false;
    }
    selectChatListState = state;
    renderSelectChatList();
    return true;
}

/**
 * Mounts the character context menu items into #character_context_menu.
 * Must run before bulk-edit init binds CharacterContextMenu's click handlers.
 */
export function mountCharacterContextMenu(container: HTMLElement) {
    mountSmallPanel(container, <CharacterContextMenu />);
}

let optionsMenuRoot: Root | null = null;
let optionsMenuContainer: HTMLElement | null = null;
let optionsMenuState: { showBackToMain: boolean; canRegenerate: boolean } = { showBackToMain: false, canRegenerate: false };
let optionsMenuCommand: ((id: string) => void) | undefined;

function renderOptionsMenu() {
    if (!optionsMenuContainer?.isConnected) {
        return;
    }
    optionsMenuRoot ??= createRoot(optionsMenuContainer);
    flushSync(() => optionsMenuRoot?.render(
        <StrictMode>
            <Theme theme={emberDeskTheme} mode="dark">
                <OptionsMenu showBackToMain={optionsMenuState.showBackToMain} canRegenerate={optionsMenuState.canRegenerate} onCommand={optionsMenuCommand} />
            </Theme>
        </StrictMode>,
    ));
}

/**
 * Mounts the options popup items into #options. The shell keeps its
 * display:none + Popper positioning; item click bindings land after mount.
 * Item visibility/enabled state (branch "Back to parent", "Regenerate") is
 * state-driven via updateOptionsMenuState so legacy jQuery .show()/.hide()
 * calls are retired.
 */
export function mountOptionsMenu(container: HTMLElement, state?: { showBackToMain?: boolean; canRegenerate?: boolean }, onCommand?: (id: string) => void) {
    attachGlobalCompatibilityBridge();
    optionsMenuContainer = container;
    optionsMenuCommand = onCommand;
    optionsMenuState = { ...optionsMenuState, ...state };
    renderOptionsMenu();
}

export function updateOptionsMenuState(patch: Partial<typeof optionsMenuState>): boolean {
    if (!optionsMenuContainer?.isConnected) {
        return false;
    }
    optionsMenuState = { ...optionsMenuState, ...patch };
    renderOptionsMenu();
    return true;
}

/**
 * Mounts the export-format buttons into #export_format_popup. Clicks are
 * delegated at document level; mount only needs to precede user interaction.
 */
export function mountExportFormatPopup(container: HTMLElement, onExport?: (format: string) => void) {
    mountSmallPanel(container, <ExportFormatPopup onExport={onExport} />);
}

/**
 * Mounts the confirm-popup buttons into #dialogue_popup_controls. The popup
 * shell (text/input/holder) stays legacy; dom-handlers.js binds the buttons
 * by ID after mount.
 */
export function mountDialoguePopupControls(container: HTMLElement, commands?: { confirmDialoguePopup(): void; cancelDialoguePopup(): void }) {
    mountSmallPanel(container, <DialoguePopupControls commands={commands} />);
}

export function mountDialoguePopupInput(container: HTMLElement, controller: ReturnType<typeof import('./lib/dialogue-service').createDialogueController>) {
    mountSmallPanel(container, <DialoguePopupInput controller={controller} />);
}

export function mountDialoguePopupContent(container: HTMLElement, controller: ReturnType<typeof import('./lib/dialogue-service').createDialoguePresentationController>, renderContent: (content: unknown) => void) {
    mountSmallPanel(container, <DialoguePopupContent controller={controller} renderContent={renderContent} />);
}

export function openDialoguePresentation(controller: ReturnType<typeof import('./lib/dialogue-service').createDialoguePresentationController>, content: unknown) {
    flushSync(() => controller.open(content));
}

/**
 * Mounts the delete-messages confirm buttons into #dialogue_del_mes. The
 * container stays legacy; dom-handlers.js binds the buttons by ID after mount.
 */
export { createBulkDeleteController, createDialogueController, createDialoguePresentationController, getWorkspaceBulkDeleteController } from './lib/dialogue-service';

export function mountDialogueDelMesControls(container: HTMLElement, controller: ReturnType<typeof import('./lib/dialogue-service').createBulkDeleteController>, commands: { confirm(): void; cancel(): void }) {
    mountSmallPanel(container, <DialogueDelMesControls controller={controller} commands={commands} />);
}
