import { StrictMode, useEffect, useMemo, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useMutation } from '@tanstack/react-query';
import { useForm } from '@tanstack/react-form';
import { z } from 'zod';

export type WorkspacePanelKind = 'worldInfo' | 'backgroundLibrary' | 'extensionsHost' | 'mainChatMessageList';

interface WorkspacePanelMount {
    root: Root;
    container: HTMLElement;
    kind: WorkspacePanelKind;
    state?: unknown;
    bridge?: WorkspacePanelBridge;
}

interface WorkspacePanelMountOptions {
    state?: unknown;
    bridge?: WorkspacePanelBridge;
}

type WorkspacePanelStatus = 'idle' | 'loading' | 'empty' | 'success' | 'error';

interface WorkspacePanelBridge {
    dispatchAction?: (action: string, payload?: Record<string, unknown>) => Promise<void> | void;
}

interface WorkspacePanelLegacySlot {
    id: string;
    label: string;
    ready?: boolean;
}

interface WorkspacePanelActionMutation {
    mutate(options: { action: string; payload?: Record<string, unknown> }): void;
}

interface WorldInfoWorkspacePanelState {
    globalSelectorPresent?: boolean;
    editorSelectorPresent?: boolean;
    selectorsSeparated?: boolean;
    importMenuPresent?: boolean;
    importBusy?: boolean;
    dropTargetPresent?: boolean;
    worldNames?: WorldInfoReactWorldOption[];
    selectedWorldName?: string;
    selectedWorldIndex?: string;
    entryCount?: number;
    entrySummaries?: WorldInfoReactEntrySummary[];
    searchQuery?: string;
    sortValue?: string;
    sortOptions?: WorldInfoReactSortOption[];
    canCreateEntry?: boolean;
    exportMenuPresent?: boolean;
    createWorldMenuPresent?: boolean;
    refreshMenuPresent?: boolean;
}

interface WorldInfoReactWorldOption {
    value: string;
    label: string;
    selected?: boolean;
}

interface WorldInfoReactSortOption {
    value: string;
    label: string;
    hidden?: boolean;
}

interface WorldInfoReactEntrySummary {
    uid: string;
    title: string;
    disabled?: boolean;
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
    systemBackgrounds?: BackgroundLibraryReactGalleryItem[];
    chatBackgrounds?: BackgroundLibraryReactGalleryItem[];
    filterQuery?: string;
    sortValue?: string;
    folderViewActive?: boolean;
    lockedCount?: number;
    selectedCount?: number;
}

interface BackgroundLibraryReactGalleryItem {
    id: string;
    title: string;
    url?: string;
    isCustom?: boolean;
    animated?: boolean;
    selected?: boolean;
    locked?: boolean;
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
    notifyUpdatesEnabled?: boolean;
    extrasApiUrl?: string;
    extrasApiKeySet?: boolean;
    autoconnectEnabled?: boolean;
    extrasStatusText?: string;
    mountPointStatuses?: ExtensionsHostReactMountPointStatus[];
    deferredState?: 'idle' | 'loading' | 'failed';
    deferredPlaceholderPresent?: boolean;
}

interface ExtensionsHostReactMountPointStatus {
    id: string;
    label: string;
    ready?: boolean;
}

interface MainChatMessageListWorkspacePanelState {
    hasChatContainer?: boolean;
    messageCount?: number;
    firstMessageId?: string;
    lastMessageId?: string;
    showMoreVisible?: boolean;
    visibleMessageIds?: string[];
    chatContainer?: HTMLElement | null;
    host?: HTMLElement | null;
    messageNodes?: HTMLElement[];
    richBodySnapshots?: MainChatRichBodySnapshot[];
    showMoreNode?: HTMLElement | null;
}

interface MainChatRichBodySnapshot {
    schema: 'mainChatRichBodySnapshotSchema';
    messageId: string;
    state: 'finalized';
    eligible: true;
    messageHtml: string;
    reasoningHtml: string;
    reasoningOpen?: boolean;
    mediaHtml: string;
    fileHtml: string;
    biasHtml: string;
}

const queryClient = new QueryClient();
const mountedPanels = new Map<WorkspacePanelKind, WorkspacePanelMount>();

const worldInfoPanelFormSchema = z.object({
    selectedWorldIndex: z.string(),
    searchQuery: z.string(),
    sortValue: z.string(),
});

const backgroundLibraryPanelFormSchema = z.object({
    filterQuery: z.string(),
    sortValue: z.string(),
});

const extensionsHostPanelFormSchema = z.object({
    extrasApiUrl: z.string(),
    extrasApiKey: z.string(),
});

const mainChatRichBodySnapshotSchema = z.object({
    schema: z.literal('mainChatRichBodySnapshotSchema'),
    messageId: z.string().min(1),
    state: z.literal('finalized'),
    eligible: z.literal(true),
    messageHtml: z.string(),
    reasoningHtml: z.string(),
    reasoningOpen: z.boolean().optional(),
    mediaHtml: z.string(),
    fileHtml: z.string(),
    biasHtml: z.string(),
});

function buildWorldInfoPanelFormDefaults(state: WorldInfoWorkspacePanelState) {
    return {
        selectedWorldIndex: state.selectedWorldIndex ?? '',
        searchQuery: state.searchQuery ?? '',
        sortValue: state.sortValue ?? '',
    };
}

function buildBackgroundLibraryPanelFormDefaults(state: BackgroundLibraryWorkspacePanelState) {
    return {
        filterQuery: state.filterQuery ?? '',
        sortValue: state.sortValue ?? '',
    };
}

function buildExtensionsHostPanelFormDefaults(state: ExtensionsHostWorkspacePanelState) {
    return {
        extrasApiUrl: state.extrasApiUrl ?? '',
        extrasApiKey: '',
    };
}

function asMainChatMessageListState(state: unknown): MainChatMessageListWorkspacePanelState {
    if (!state || typeof state !== 'object') {
        return {};
    }

    const bridgeState = state as MainChatMessageListWorkspacePanelState;
    const richBodySnapshots = z.array(mainChatRichBodySnapshotSchema).safeParse(bridgeState.richBodySnapshots ?? []);

    return {
        ...bridgeState,
        richBodySnapshots: richBodySnapshots.success ? richBodySnapshots.data : [],
    };
}

function getMainChatRichBodyRowTargets(messageRow: HTMLElement) {
    const messageBlock = messageRow.querySelector('.mes_block');
    const reasoningDetails = messageRow.querySelector('.mes_reasoning_details');
    const reasoningNode = messageRow.querySelector('.mes_reasoning');
    const messageNode = messageRow.querySelector('.mes_text');
    const mediaNode = messageRow.querySelector('.mes_media_wrapper');
    const fileNode = messageRow.querySelector('.mes_file_wrapper');
    const biasNode = messageRow.querySelector('.mes_bias');

    if (
        !(messageBlock instanceof HTMLElement)
        || !(reasoningDetails instanceof HTMLDetailsElement)
        || !(reasoningNode instanceof HTMLElement)
        || !(messageNode instanceof HTMLElement)
        || !(mediaNode instanceof HTMLElement)
        || !(fileNode instanceof HTMLElement)
        || !(biasNode instanceof HTMLElement)
    ) {
        return null;
    }

    return {
        messageBlock,
        reasoningDetails,
        reasoningNode,
        messageNode,
        mediaNode,
        fileNode,
        biasNode,
    };
}

function canReactOwnMainChatRichBody(messageRow: HTMLElement | undefined, snapshot: MainChatRichBodySnapshot) {
    if (
        !(messageRow instanceof HTMLElement)
        || !messageRow.isConnected
        || messageRow.parentElement?.id !== 'chat'
        || messageRow.getAttribute('mesid') !== snapshot.messageId
    ) {
        return false;
    }

    return Boolean(getMainChatRichBodyRowTargets(messageRow));
}

function workspacePanelStateQueryKey(kind: WorkspacePanelKind) {
    return ['workspace-panel', kind, 'bridge-state'] as const;
}

function WorkspacePanelShell({
    kind,
    title,
    status,
    legacyBoundary,
    slots = [],
    children,
}: {
    kind: WorkspacePanelKind;
    title: string;
    status: WorkspacePanelStatus;
    legacyBoundary?: string;
    slots?: WorkspacePanelLegacySlot[];
    children: ReactNode;
}) {
    const boundaryAttributes = legacyBoundary ? {
        [`data-${kind.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}-legacy-boundary`]: legacyBoundary,
    } : {};

    return (
        <section
            className="emberdesk-react-workspace-panel"
            data-react-workspace-panel={kind}
            data-react-workspace-panel-shell={kind}
            data-workspace-panel-status={status}
            {...boundaryAttributes}
        >
            <div className="flex-container flexFlowColumn gap8">
                <div className="flex-container justifyspacebetween alignitemscenter gap8">
                    <div className="title_restorable">{title}</div>
                    <span
                        className={status === 'error' ? 'warning' : 'success'}
                        data-workspace-panel-status={status}
                    >
                        {status}
                    </span>
                </div>
                {children}
                {slots.length > 0 ? (
                    <div className="flex-container flexFlowColumn gap4" data-workspace-legacy-slots={kind}>
                        {slots.map(slot => {
                            const protectedSlot = slot.id === 'extensions-settings'
                                || slot.id === 'extensions-settings2'
                                || slot.id === 'regex-container'
                                || slot.id === 'extensions-menu-button'
                                || slot.id === 'extensions-menu';

                            return (
                                <div
                                    key={slot.id}
                                    className={protectedSlot ? 'workspace-panel-legacy-slot workspace-panel-legacy-slot-protected' : 'workspace-panel-legacy-slot'}
                                    data-workspace-legacy-slot={slot.id}
                                    data-workspace-legacy-slot-ready={slot.ready ? 'true' : 'false'}
                                >
                                    <span>{slot.label}</span>
                                    <span className={slot.ready ? 'success' : 'warning'}>{slot.ready ? 'Ready' : 'Legacy'}</span>
                                </div>
                            );
                        })}
                    </div>
                ) : null}
            </div>
        </section>
    );
}

function WorkspacePanelPlaceholder({ kind }: { kind: WorkspacePanelKind }) {
    return (
        <WorkspacePanelShell
            kind={kind}
            title="React workspace panel host"
            status="idle"
        >
                <div className="opacity50">
                    {kind} is ready for its legacy bridge.
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

function getWorldInfoPanelStatus(bridgeState: WorldInfoWorkspacePanelState): WorkspacePanelStatus {
    if (bridgeState.importBusy) {
        return 'loading';
    }

    if (!bridgeState.globalSelectorPresent && !bridgeState.editorSelectorPresent && !bridgeState.importMenuPresent) {
        return 'empty';
    }

    if (bridgeState.globalSelectorPresent && bridgeState.editorSelectorPresent && bridgeState.selectorsSeparated) {
        return 'success';
    }

    return 'error';
}

function getBackgroundLibraryPanelStatus(bridgeState: BackgroundLibraryWorkspacePanelState): WorkspacePanelStatus {
    if (bridgeState.showLoading || bridgeState.status === 'loading') {
        return 'loading';
    }

    if (bridgeState.showError || bridgeState.status === 'error') {
        return 'error';
    }

    if (bridgeState.showEmpty || bridgeState.status === 'empty') {
        return 'empty';
    }

    if (bridgeState.status === 'success') {
        return 'success';
    }

    return 'idle';
}

function getExtensionsHostPanelStatus(bridgeState: ExtensionsHostWorkspacePanelState): WorkspacePanelStatus {
    if (bridgeState.deferredState === 'loading') {
        return 'loading';
    }

    if (bridgeState.deferredState === 'failed') {
        return 'error';
    }

    if (
        bridgeState.extensionsSettingsPresent
        || bridgeState.extensionsSettings2Present
        || bridgeState.regexContainerPresent
        || bridgeState.extrasApiControlsPresent
    ) {
        return 'success';
    }

    return 'empty';
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

function WorldInfoWorkspacePanel({ state, bridge }: { state?: unknown; bridge?: WorkspacePanelBridge }) {
    const bridgeState = asWorldInfoState(state);
    const status = getWorldInfoPanelStatus(bridgeState);
    const formDefaults = useMemo(() => buildWorldInfoPanelFormDefaults(bridgeState), [bridgeState]);
    const worldInfoForm = useForm({
        defaultValues: formDefaults,
        validators: {
            onChange: worldInfoPanelFormSchema,
        },
    });
    const worldInfoActionMutation = useMutation({
        mutationFn: async ({ action, payload }: { action: string; payload?: Record<string, unknown> }) => {
            await bridge?.dispatchAction?.(action, payload);
        },
        retry: false,
    });

    useEffect(() => {
        worldInfoForm.reset(formDefaults);
    }, [formDefaults, worldInfoForm]);

    const worldNames = bridgeState.worldNames ?? [];
    const sortOptions = bridgeState.sortOptions ?? [];
    const entrySummaries = bridgeState.entrySummaries ?? [];
    const selectedWorldName = bridgeState.selectedWorldName || 'No world selected';

    return (
        <WorkspacePanelShell
            kind="worldInfo"
            title="World Info"
            status={status}
            legacyBoundary="activation-import-regex-prompt-delete"
            slots={[
                { id: 'global-selector', label: 'Global selector', ready: bridgeState.globalSelectorPresent },
                { id: 'editor-selector', label: 'Editor selector', ready: bridgeState.editorSelectorPresent && bridgeState.selectorsSeparated },
                { id: 'import-controls', label: 'Import controls', ready: bridgeState.importMenuPresent },
                { id: 'legacy-editor', label: 'Legacy editor', ready: bridgeState.dropTargetPresent },
            ]}
        >
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
                <div className="flex-container flexFlowColumn gap8" data-world-info-react-workflow="editor-import-export">
                    <div className="flex-container flexwrap gap8 alignitemscenter">
                        <span role="status">Selected: {selectedWorldName}</span>
                        <span role="status">Worlds: {worldNames.length}</span>
                        <span role="status">Entries: {bridgeState.entryCount ?? entrySummaries.length}</span>
                    </div>
                    <div className="flex-container flexwrap gap8 alignitemscenter">
                        <worldInfoForm.Field
                            name="selectedWorldIndex"
                            children={field => (
                                <select
                                    className="text_pole textarea_compact"
                                    data-world-info-react-control="world-select"
                                    value={field.state.value}
                                    onChange={event => {
                                        const worldIndex = event.target.value;
                                        field.handleChange(worldIndex);
                                        worldInfoActionMutation.mutate({ action: 'selectWorld', payload: { worldIndex } });
                                    }}
                                >
                                    <option value="">--- Pick to Edit ---</option>
                                    {worldNames.map(world => (
                                        <option key={world.value} value={world.value}>
                                            {world.label}
                                        </option>
                                    ))}
                                </select>
                            )}
                        />
                        <worldInfoForm.Field
                            name="searchQuery"
                            children={field => (
                                <input
                                    className="text_pole textarea_compact"
                                    type="search"
                                    data-world-info-react-control="search"
                                    value={field.state.value}
                                    onChange={event => {
                                        const searchQuery = event.target.value;
                                        field.handleChange(searchQuery);
                                        worldInfoActionMutation.mutate({ action: 'applySearchQuery', payload: { searchQuery } });
                                    }}
                                />
                            )}
                        />
                        <worldInfoForm.Field
                            name="sortValue"
                            children={field => (
                                <select
                                    className="text_pole textarea_compact"
                                    data-world-info-react-control="sort"
                                    value={field.state.value}
                                    onChange={event => {
                                        const sortValue = event.target.value;
                                        field.handleChange(sortValue);
                                        worldInfoActionMutation.mutate({ action: 'applySortOption', payload: { sortValue } });
                                    }}
                                >
                                    {sortOptions.map(option => (
                                        <option key={option.value} value={option.value} hidden={option.hidden}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            )}
                        />
                    </div>
                    <div className="flex-container flexwrap gap8 alignitemscenter">
                        <button
                            type="button"
                            className="menu_button"
                            data-world-info-react-action="new-world"
                            onClick={() => worldInfoActionMutation.mutate({ action: 'createWorld' })}
                            disabled={!bridgeState.createWorldMenuPresent}
                        >
                            New World
                        </button>
                        <button
                            type="button"
                            className="menu_button"
                            data-world-info-react-action="new-entry"
                            onClick={() => worldInfoActionMutation.mutate({ action: 'createEntry' })}
                            disabled={!bridgeState.canCreateEntry}
                        >
                            New Entry
                        </button>
                        <button
                            type="button"
                            className="menu_button"
                            data-world-info-react-action="import"
                            onClick={() => worldInfoActionMutation.mutate({ action: 'importWorld' })}
                            disabled={Boolean(bridgeState.importBusy)}
                        >
                            Import
                        </button>
                        <button
                            type="button"
                            className="menu_button"
                            data-world-info-react-action="export"
                            onClick={() => worldInfoActionMutation.mutate({ action: 'exportWorld' })}
                            disabled={!bridgeState.exportMenuPresent || !bridgeState.selectedWorldName}
                        >
                            Export
                        </button>
                        <button
                            type="button"
                            className="menu_button"
                            data-world-info-react-action="refresh"
                            onClick={() => worldInfoActionMutation.mutate({ action: 'refreshWorld' })}
                            disabled={!bridgeState.refreshMenuPresent}
                        >
                            Refresh
                        </button>
                    </div>
                    <div className="flex-container flexFlowColumn gap4" data-world-info-react-entries>
                        {entrySummaries.length > 0 ? entrySummaries.map(entry => (
                            <button
                                key={entry.uid}
                                type="button"
                                className="menu_button justifyspacebetween"
                                data-world-info-react-entry={entry.uid}
                                onClick={() => worldInfoActionMutation.mutate({ action: 'openEntry', payload: { uid: entry.uid } })}
                            >
                                <span>{entry.title}</span>
                                <span>{entry.disabled ? 'Disabled' : 'Edit'}</span>
                            </button>
                        )) : (
                            <span className="opacity50">No visible entries</span>
                        )}
                    </div>
                </div>
        </WorkspacePanelShell>
    );
}

function BackgroundGallery({
    source,
    items,
    actionMutation,
}: {
    source: 'global' | 'chat';
    items: BackgroundLibraryReactGalleryItem[];
    actionMutation: WorkspacePanelActionMutation;
}) {
    return (
        <div className="flex-container flexFlowColumn gap4" data-background-library-react-gallery={source}>
            <div className="flex-container justifyspacebetween alignitemscenter gap8">
                <span>{source === 'global' ? 'Global' : 'Chat'}</span>
                <span>{items.length}</span>
            </div>
            {items.length > 0 ? items.map(item => (
                <button
                    key={`${source}:${item.id}`}
                    type="button"
                    className="menu_button justifyspacebetween"
                    data-background-library-react-item={item.id}
                    onClick={() => actionMutation.mutate({ action: 'selectBackground', payload: { id: item.id, source } })}
                >
                    <span>{item.title}</span>
                    <span>{item.locked ? 'Locked' : item.selected ? 'Selected' : item.animated ? 'Animated' : 'Select'}</span>
                </button>
            )) : (
                <span className="opacity50">No backgrounds</span>
            )}
        </div>
    );
}

function BackgroundLibraryWorkspacePanel({ state, bridge }: { state?: unknown; bridge?: WorkspacePanelBridge }) {
    const bridgeState = asBackgroundLibraryState(state);
    const status = getBackgroundLibraryPanelStatus(bridgeState);
    const formDefaults = useMemo(() => buildBackgroundLibraryPanelFormDefaults(bridgeState), [bridgeState]);
    const backgroundLibraryForm = useForm({
        defaultValues: formDefaults,
        validators: {
            onChange: backgroundLibraryPanelFormSchema,
        },
    });
    const backgroundLibraryActionMutation = useMutation({
        mutationFn: async ({ action, payload }: { action: string; payload?: Record<string, unknown> }) => {
            await bridge?.dispatchAction?.(action, payload);
        },
        retry: false,
    });
    const statusLabel = bridgeState.showLoading
        ? 'Loading'
        : bridgeState.showError
            ? 'Error'
            : bridgeState.showEmpty
                ? 'Empty'
                : bridgeState.status === 'success'
                        ? 'Ready'
                        : 'Idle';
    const systemBackgrounds = bridgeState.systemBackgrounds ?? [];
    const chatBackgrounds = bridgeState.chatBackgrounds ?? [];

    useEffect(() => {
        backgroundLibraryForm.reset(formDefaults);
    }, [backgroundLibraryForm, formDefaults]);

    return (
        <WorkspacePanelShell
            kind="backgroundLibrary"
            title="Backgrounds"
            status={status}
            legacyBoundary="upload-delete-rename-select-lock-slash"
            slots={[
                { id: 'global-gallery', label: 'Global gallery', ready: bridgeState.systemContainerPresent },
                { id: 'chat-gallery', label: 'Chat gallery', ready: bridgeState.chatContainerPresent },
                { id: 'background-actions', label: 'Background actions', ready: bridgeState.systemContainerPresent || bridgeState.chatContainerPresent },
            ]}
        >
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
                <div className="flex-container flexFlowColumn gap8" data-background-library-react-workflow="gallery-actions">
                    <div className="flex-container flexwrap gap8 alignitemscenter">
                        <span role="status">Folder view: {bridgeState.folderViewActive ? 'On' : 'Off'}</span>
                        <span role="status">Locked: {bridgeState.lockedCount ?? 0}</span>
                        <span role="status">Selected: {bridgeState.selectedCount ?? 0}</span>
                    </div>
                    <div className="flex-container flexwrap gap8 alignitemscenter">
                        <backgroundLibraryForm.Field
                            name="filterQuery"
                            children={field => (
                                <input
                                    className="text_pole textarea_compact"
                                    type="search"
                                    data-background-library-react-control="filter"
                                    value={field.state.value}
                                    onChange={event => {
                                        const filterQuery = event.target.value;
                                        field.handleChange(filterQuery);
                                        backgroundLibraryActionMutation.mutate({ action: 'applyBackgroundFilter', payload: { filterQuery } });
                                    }}
                                />
                            )}
                        />
                        <backgroundLibraryForm.Field
                            name="sortValue"
                            children={field => (
                                <select
                                    className="text_pole textarea_compact"
                                    data-background-library-react-control="sort"
                                    value={field.state.value}
                                    onChange={event => {
                                        const sortValue = event.target.value;
                                        field.handleChange(sortValue);
                                        backgroundLibraryActionMutation.mutate({ action: 'applyBackgroundSort', payload: { sortValue } });
                                    }}
                                >
                                    <option value="az">A-Z</option>
                                    <option value="za">Z-A</option>
                                    <option value="newest">Newest</option>
                                    <option value="oldest">Oldest</option>
                                </select>
                            )}
                        />
                    </div>
                    <div className="flex-container flexwrap gap8 alignitemscenter">
                        <button
                            type="button"
                            className="menu_button"
                            data-background-library-react-action="upload"
                            onClick={() => backgroundLibraryActionMutation.mutate({ action: 'uploadBackground' })}
                        >
                            Upload
                        </button>
                        <button
                            type="button"
                            className="menu_button"
                            data-background-library-react-action="lock"
                            onClick={() => backgroundLibraryActionMutation.mutate({ action: 'lockBackground' })}
                        >
                            Lock
                        </button>
                        <button
                            type="button"
                            className="menu_button"
                            data-background-library-react-action="unlock"
                            onClick={() => backgroundLibraryActionMutation.mutate({ action: 'unlockBackground' })}
                        >
                            Unlock
                        </button>
                        <button
                            type="button"
                            className="menu_button"
                            data-background-library-react-action="auto"
                            onClick={() => backgroundLibraryActionMutation.mutate({ action: 'autoBackground' })}
                        >
                            Auto
                        </button>
                        <button
                            type="button"
                            className="menu_button"
                            data-background-library-react-action="refresh"
                            onClick={() => backgroundLibraryActionMutation.mutate({ action: 'refreshBackgrounds' })}
                        >
                            Refresh
                        </button>
                    </div>
                    <BackgroundGallery source="global" items={systemBackgrounds} actionMutation={backgroundLibraryActionMutation} />
                    <BackgroundGallery source="chat" items={chatBackgrounds} actionMutation={backgroundLibraryActionMutation} />
                </div>
        </WorkspacePanelShell>
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

function ExtensionsHostWorkspacePanel({ state, bridge }: { state?: unknown; bridge?: WorkspacePanelBridge }) {
    const bridgeState = asExtensionsHostState(state);
    const status = getExtensionsHostPanelStatus(bridgeState);
    const formDefaults = useMemo(() => buildExtensionsHostPanelFormDefaults(bridgeState), [bridgeState]);
    const extensionsHostForm = useForm({
        defaultValues: formDefaults,
        validators: {
            onChange: extensionsHostPanelFormSchema,
        },
    });
    const extensionsHostActionMutation = useMutation({
        mutationFn: async ({ action, payload }: { action: string; payload?: Record<string, unknown> }) => {
            await bridge?.dispatchAction?.(action, payload);
        },
        retry: false,
    });
    const loaderLabel = bridgeState.deferredState === 'failed'
        ? 'Failed'
        : bridgeState.deferredState === 'loading'
            ? 'Loading'
            : 'Ready';
    const mountPointStatuses = bridgeState.mountPointStatuses?.length
        ? bridgeState.mountPointStatuses
        : [
            { id: 'extensions_settings', label: 'Settings column', ready: bridgeState.extensionsSettingsPresent },
            { id: 'extensions_settings2', label: 'Settings column 2', ready: bridgeState.extensionsSettings2Present },
            { id: 'regex_container', label: 'Regex container', ready: bridgeState.regexContainerPresent },
            { id: 'extensionsMenuButton', label: 'Wand button', ready: bridgeState.extensionsMenuButtonPresent },
            { id: 'extensionsMenu', label: 'Wand menu', ready: bridgeState.extensionsMenuPresent },
        ];

    useEffect(() => {
        extensionsHostForm.reset(formDefaults);
    }, [extensionsHostForm, formDefaults]);

    return (
        <WorkspacePanelShell
            kind="extensionsHost"
            title="Extensions"
            status={status}
            legacyBoundary="mount-points-loader-wand-regex-aliases"
            slots={[
                { id: 'extensions-settings', label: 'Settings column', ready: bridgeState.extensionsSettingsPresent },
                { id: 'extensions-settings2', label: 'Settings column 2', ready: bridgeState.extensionsSettings2Present },
                { id: 'regex-container', label: 'Regex container', ready: bridgeState.regexContainerPresent },
                { id: 'extensions-menu-button', label: 'Wand button', ready: bridgeState.extensionsMenuButtonPresent },
                { id: 'extensions-menu', label: 'Wand menu', ready: bridgeState.extensionsMenuPresent },
                { id: 'extras-api', label: 'Extras API', ready: bridgeState.extrasApiControlsPresent },
            ]}
        >
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
                <div className="flex-container flexFlowColumn gap8" data-extensions-host-react-workflow="host-actions">
                    <div className="flex-container flexwrap gap8 alignitemscenter">
                        <label className="checkbox_label flexNoGap">
                            <input
                                type="checkbox"
                                data-extensions-host-react-control="notify-updates"
                                checked={Boolean(bridgeState.notifyUpdatesEnabled)}
                                onChange={() => extensionsHostActionMutation.mutate({ action: 'toggleNotifyUpdates' })}
                            />
                            Notify updates
                        </label>
                        <button
                            type="button"
                            className="menu_button"
                            data-extensions-host-react-action="manage"
                            onClick={() => extensionsHostActionMutation.mutate({ action: 'openManageExtensions' })}
                            disabled={!bridgeState.manageButtonPresent}
                        >
                            Manage
                        </button>
                        <button
                            type="button"
                            className="menu_button"
                            data-extensions-host-react-action="install"
                            onClick={() => extensionsHostActionMutation.mutate({ action: 'openInstallExtension' })}
                            disabled={!bridgeState.installButtonPresent}
                        >
                            Install
                        </button>
                    </div>
                    <div className="flex-container flexwrap gap8 alignitemscenter">
                        <extensionsHostForm.Field
                            name="extrasApiUrl"
                            children={field => (
                                <input
                                    className="text_pole textarea_compact"
                                    type="url"
                                    data-extensions-host-react-control="extras-url"
                                    value={field.state.value}
                                    onChange={event => {
                                        const url = event.target.value;
                                        field.handleChange(url);
                                        extensionsHostActionMutation.mutate({ action: 'updateExtrasApiUrl', payload: { url } });
                                    }}
                                />
                            )}
                        />
                        <extensionsHostForm.Field
                            name="extrasApiKey"
                            children={field => (
                                <input
                                    className="text_pole textarea_compact"
                                    type="password"
                                    data-extensions-host-react-control="extras-api-key"
                                    placeholder={bridgeState.extrasApiKeySet ? 'Saved key' : 'Extras API key'}
                                    value={field.state.value}
                                    onChange={event => {
                                        const apiKey = event.target.value;
                                        field.handleChange(apiKey);
                                        extensionsHostActionMutation.mutate({ action: 'updateExtrasApiKey', payload: { apiKey } });
                                    }}
                                />
                            )}
                        />
                    </div>
                    <div className="flex-container flexwrap gap8 alignitemscenter">
                        <label className="checkbox_label flexNoGap">
                            <input
                                type="checkbox"
                                data-extensions-host-react-control="autoconnect"
                                checked={Boolean(bridgeState.autoconnectEnabled)}
                                onChange={() => extensionsHostActionMutation.mutate({ action: 'toggleAutoconnect' })}
                                disabled={!bridgeState.extrasApiControlsPresent}
                            />
                            Auto-connect
                        </label>
                        <button
                            type="button"
                            className="menu_button"
                            data-extensions-host-react-action="connect"
                            onClick={() => extensionsHostActionMutation.mutate({ action: 'connectExtrasApi' })}
                            disabled={!bridgeState.extrasApiControlsPresent}
                        >
                            Connect
                        </button>
                        <span role="status">{bridgeState.extrasStatusText || 'Not connected...'}</span>
                    </div>
                    <div className="flex-container flexFlowColumn gap4" data-extensions-host-react-mount-points>
                        {mountPointStatuses.map(mountPoint => (
                            <div
                                key={mountPoint.id}
                                className="flex-container justifyspacebetween alignitemscenter gap8"
                                data-extensions-host-react-mount-point={mountPoint.id}
                            >
                                <span>{mountPoint.label}</span>
                                <span className={mountPoint.ready ? 'success' : 'warning'}>{mountPoint.ready ? 'Ready' : 'Missing'}</span>
                            </div>
                        ))}
                    </div>
                </div>
        </WorkspacePanelShell>
    );
}

function MainChatMessageListWorkspacePanel({ state }: { state?: unknown }) {
    const bridgeState = asMainChatMessageListState(state);
    const messageRowMap = useMemo(() => {
        const rows = new Map<string, HTMLElement>();

        for (const messageRow of bridgeState.messageNodes ?? []) {
            if (!(messageRow instanceof HTMLElement)) {
                continue;
            }

            const messageId = messageRow.getAttribute('mesid');
            if (!messageId) {
                continue;
            }

            rows.set(messageId, messageRow);
        }

        return rows;
    }, [bridgeState.messageNodes]);
    const ownedRichBodySnapshots = useMemo(() => {
        return (bridgeState.richBodySnapshots ?? []).filter(snapshot => canReactOwnMainChatRichBody(
            messageRowMap.get(snapshot.messageId),
            snapshot,
        ));
    }, [bridgeState.richBodySnapshots, messageRowMap]);

    useEffect(() => {
        syncMainChatMessageListDom(
            bridgeState.chatContainer ?? null,
            bridgeState.host ?? null,
            bridgeState.messageNodes ?? [],
            bridgeState.showMoreNode ?? null,
        );
    }, [bridgeState]);

    return (
        <>
            <div
                hidden
                data-main-chat-message-list-controller="true"
                data-main-chat-message-list-status={bridgeState.hasChatContainer ? 'ready' : 'missing'}
            />
            {ownedRichBodySnapshots.map(snapshot => {
                const messageRow = messageRowMap.get(snapshot.messageId);
                const targets = messageRow ? getMainChatRichBodyRowTargets(messageRow) : null;
                if (!targets) {
                    return null;
                }

                return createPortal(
                    <div
                        hidden
                        aria-hidden="true"
                        data-main-chat-rich-body-owner="react"
                        data-main-chat-rich-body-row={snapshot.messageId}
                    />,
                    targets.messageBlock,
                    `main-chat-rich-body-owner-${snapshot.messageId}`,
                );
            })}
        </>
    );
}

function syncMainChatMessageListDom(
    chatContainer: HTMLElement | null,
    host: HTMLElement | null,
    messageNodes: HTMLElement[],
    showMoreNode: HTMLElement | null,
) {
    if (!(chatContainer instanceof HTMLElement) || !(host instanceof HTMLElement) || host.parentElement !== chatContainer) {
        return;
    }

    host.hidden = true;
    host.setAttribute('aria-hidden', 'true');

    if (chatContainer.firstChild !== host) {
        chatContainer.insertBefore(host, chatContainer.firstChild);
    }

    let insertAfter: ChildNode = host;
    const orderedNodes = [];

    if (showMoreNode instanceof HTMLElement && showMoreNode.parentElement === chatContainer) {
        orderedNodes.push(showMoreNode);
    }

    for (const node of messageNodes) {
        if (!(node instanceof HTMLElement) || node.parentElement !== chatContainer) {
            continue;
        }

        orderedNodes.push(node);
    }

    for (const node of orderedNodes) {
        if (insertAfter.nextSibling !== node) {
            chatContainer.insertBefore(node, insertAfter.nextSibling);
        }

        insertAfter = node;
    }
}

function renderPanel(kind: WorkspacePanelKind, state?: unknown, bridge?: WorkspacePanelBridge): ReactNode {
    switch (kind) {
        case 'worldInfo':
            return <WorldInfoWorkspacePanel state={state} bridge={bridge} />;
        case 'backgroundLibrary':
            return <BackgroundLibraryWorkspacePanel state={state} bridge={bridge} />;
        case 'extensionsHost':
            return <ExtensionsHostWorkspacePanel state={state} bridge={bridge} />;
        case 'mainChatMessageList':
            return <MainChatMessageListWorkspacePanel state={state} />;
        default:
            return <WorkspacePanelPlaceholder kind={kind} />;
    }
}

function WorkspacePanelRoot({ kind, bridge }: { kind: WorkspacePanelKind; bridge?: WorkspacePanelBridge }) {
    const stateQuery = useQuery({
        queryKey: workspacePanelStateQueryKey(kind),
        queryFn: async () => queryClient.getQueryData(workspacePanelStateQueryKey(kind)) ?? null,
        initialData: () => queryClient.getQueryData(workspacePanelStateQueryKey(kind)) ?? null,
        staleTime: Number.POSITIVE_INFINITY,
    });

    return renderPanel(kind, stateQuery.data, bridge);
}

function renderIntoPanel(mount: WorkspacePanelMount) {
    queryClient.setQueryData(workspacePanelStateQueryKey(mount.kind), mount.state ?? null);
    mount.root.render(
        <StrictMode>
            <QueryClientProvider client={queryClient}>
                <WorkspacePanelRoot kind={mount.kind} bridge={mount.bridge} />
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
            existingPanel.bridge = options.bridge;
            renderIntoPanel(existingPanel);
            return;
        }
    }

    const mount = {
        root: createRoot(container),
        container,
        kind,
        state: options.state,
        bridge: options.bridge,
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
