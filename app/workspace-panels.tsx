import { Fragment, StrictMode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useMutation } from '@tanstack/react-query';
import { useForm } from '@tanstack/react-form';
import { measureElement, useVirtualizer, type VirtualItem, type Virtualizer } from '@tanstack/react-virtual';
import { z } from 'zod';

import {
    attachGlobalCompatibilityBridge,
    detachGlobalCompatibilityBridge,
} from './compat/global-compatibility-bridge.js';
import {
    getWorkspacePanelDockSnapshot,
    getWorkspaceShellChildSlot,
    recordWorkspacePanelDockIntent,
    recordWorkspacePanelDockClose,
    recordWorkspacePanelDockPin,
    recordWorkspacePanelDockResult,
    recordWorkspacePanelMount,
    recordWorkspacePanelUnmount,
    recordWorkspacePanelUpdate,
    subscribeWorkspacePanelDock,
    WORKSPACE_SHELL_CHILD_SLOTS,
} from './stores/workspace-panel-store.js';
import {
    resetMainChatObservationStore,
    updateMainChatObservation,
} from './stores/main-chat-observation-store.js';
import {
    MAIN_CHAT_MESSAGE_ACTION_SNAPSHOT_SCHEMA,
    MAIN_CHAT_MESSAGE_ROW_SNAPSHOT_SCHEMA,
    MAIN_CHAT_RICH_BODY_SNAPSHOT_SCHEMA,
    MAIN_CHAT_VISIBLE_TRANSPORT_PATHS,
    MAIN_CHAT_VISIBLE_TRANSPORT_REASONS,
    MAIN_CHAT_VISIBLE_TRANSPORT_STATUSES,
} from '../public/scripts/main-chat-bridge-contract.js';
import {
    createCharacterAuthoringSession,
    shouldApplyCharacterAuthoringSaveResult,
} from '../public/scripts/character-authoring.js';

// Group chat retirement: group authoring helpers are no longer product-owned.
function createGroupAuthoringSession(..._args: any[]): any {
    throw new Error('group_chat_feature_removed');
}
import {
    WorldInfoWorkbenchPanel,
    buildWorldInfoPanelFormDefaults as buildWorldInfoWorkbenchFormDefaults,
    getWorldInfoPanelStatus as getWorldInfoWorkbenchPanelStatus,
    type WorldInfoWorkspacePanelState as WorldInfoWorkbenchPanelState,
    type WorldInfoReactEntrySummary as WorldInfoWorkbenchEntrySummary,
    type WorldInfoReactSortOption as WorldInfoWorkbenchSortOption,
    type WorldInfoReactWorldOption as WorldInfoWorkbenchWorldOption,
} from './world-info-workbench';
import { SettingsSurface } from './components/settings/SettingsSurface';
import './styles/settings-surface.css';

export type WorkspacePanelKind = 'worldInfo' | 'backgroundLibrary' | 'extensionsHost' | 'mainChatMessageList' | 'characterAuthoring';
type WorkspaceDockPanelKind =
    | 'aiConfig'
    | 'advancedFormatting'
    | 'characterLibrary'
    | 'worldInfo'
    | 'backgroundLibrary'
    | 'extensionsHost'
    | 'settings'
    | 'characterAuthoring';

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
type WorkspacePanelDockStatus = 'idle' | 'disabled' | 'loading' | 'empty' | 'success' | 'error';
type MainChatLayoutStatus = 'loading' | 'empty' | 'success' | 'streaming' | 'recovering' | 'error';

interface WorkspacePanelBridge {
    dispatchAction?: (action: string, payload?: Record<string, unknown>) => Promise<unknown> | unknown;
}

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
    state?: WorkspaceShellChromeState;
    bridge?: WorkspacePanelBridge;
}

interface WorkspaceShellChromeMountOptions {
    state?: WorkspaceShellChromeState;
    bridge?: WorkspacePanelBridge;
}

interface WorkspaceShellChromeState {
    activeContext?: 'none' | 'assistant' | 'character' | 'group';
    contextTitle?: string;
    status?: 'loading' | 'empty' | 'success' | 'error';
}

interface WorkspacePanelLegacySlot {
    id: string;
    label: string;
    ready?: boolean;
}

interface WorkspacePanelRecoveryAction {
    id: string;
    label: string;
    disabled?: boolean;
    onClick: () => void;
}

interface WorkspacePanelActionMutation {
    mutate(options: { action: string; payload?: Record<string, unknown> }): void;
}

interface WorkspaceShellNavigationEntry {
    action: string;
    icon: string;
    label: string;
    panelKind?: WorkspaceDockPanelKind;
    slotKey?: keyof typeof WORKSPACE_SHELL_CHILD_SLOTS;
}

type WorldInfoWorkspacePanelState = WorldInfoWorkbenchPanelState;
type WorldInfoReactWorldOption = WorldInfoWorkbenchWorldOption;
type WorldInfoReactSortOption = WorldInfoWorkbenchSortOption;
type WorldInfoReactEntrySummary = WorldInfoWorkbenchEntrySummary;

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
    activeFolderId?: string | null;
    folders?: Array<{ id: string; name: string; thumbnailFile?: string }>;
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
    chatId?: string;
    hasChatContainer?: boolean;
    messageCount?: number;
    firstMessageId?: string;
    lastMessageId?: string;
    showMoreVisible?: boolean;
    visibleMessageIds?: string[];
    scrollTop?: number;
    scrollHeight?: number;
    clientHeight?: number;
    generationControl?: MainChatGenerationControlState;
    composer?: MainChatComposerState;
    slashCommand?: MainChatSlashCommandState;
    streamingTransport?: MainChatStreamingTransportState;
    quietTransport?: MainChatQuietTransportState;
    windowingContract?: MainChatWindowingContractState;
    rowLifecycleContract?: MainChatRowLifecycleContractState;
    chatContainer?: HTMLElement | null;
    host?: HTMLElement | null;
    messageNodes?: HTMLElement[];
    messageRowSnapshots?: MainChatMessageRowSnapshot[];
    richBodySnapshots?: MainChatRichBodySnapshot[];
    messageActionSnapshots?: MainChatMessageActionSnapshot[];
    slashUi?: MainChatSlashUiState;
    formShell?: HTMLElement | null;
    sendForm?: HTMLElement | null;
    nonQrFormItems?: HTMLElement | null;
    leftSendForm?: HTMLElement | null;
    rightSendForm?: HTMLElement | null;
    sendTextarea?: HTMLTextAreaElement | null;
    sendButton?: HTMLElement | null;
    stopButton?: HTMLElement | null;
    continueButton?: HTMLElement | null;
    regenerateButton?: HTMLElement | null;
    composerValue?: string;
    showMoreNode?: HTMLElement | null;
}

interface AuthoringWorkspacePanelState {
    mode?: 'create' | 'edit';
    title?: string;
    subtitle?: string;
    dirty?: boolean;
    unsupportedFields?: string[];
    draft?: Record<string, unknown>;
    candidates?: AuthoringCandidateState[];
    tagOptions?: AuthoringCandidateState[];
}

interface AuthoringCandidateState {
    id: string;
    label: string;
}

interface MainChatGenerationControlState {
    state: 'idle' | 'streaming' | 'recovering' | 'stopped' | 'completed' | 'error';
    phase: 'idle' | 'streaming' | 'recoveringPrimary' | 'recoveringFallback' | 'stopped' | 'completed' | 'error';
    composerDisabled: boolean;
    sendVisible: boolean;
    stopVisible: boolean;
    continueVisible: boolean;
    continueSurface: 'hidden' | 'legacy';
    canRecoverInput: boolean;
    activeMessageId: number | null;
    recoveryStatusLabel: string | null;
    failureRetryVisible: boolean;
    failureNoticeVisible: boolean;
}

interface MainChatStreamingTransportState {
    phase: 'idle' | 'connecting' | 'streaming' | 'finalizing' | 'stopped' | 'completed' | 'error';
    activeMessageId: number | null;
    hasStreamingProcessor: boolean;
    observedTokenCount: number;
    observedChunkCount: number;
    fromFallbackAttempt: boolean;
    recoverable: boolean;
    errorLabel: string | null;
}

interface MainChatQuietTransportState {
    owner: 'legacy';
    kind: string;
    status: string;
    path: string;
    reason: string;
    phase: 'idle' | 'running' | 'stopped' | 'completed' | 'error';
    error: string;
    autoRecover: boolean;
    usesStreamingTransport: boolean;
    bindsVisibleMessageRow: boolean;
    finalizationStrategy: string;
    rollbackStrategy: string;
}

interface MainChatWindowingContractState {
    windowingOwner: string;
    phase7Candidate: string;
    fallback: string;
    loadMoreOwner: string;
    restoreOwner: string;
    renderedMessageIds: string[];
    totalMessageCount: number;
    showMoreVisible: boolean;
    anchorMessageId: string | null;
    scrollTop: number;
    preservesDirectChildOrder: boolean;
    reason: string;
}

interface MainChatRowLifecycleContractState {
    lifecycleOwner: string;
    phase7Candidate: string;
    fallback: string;
    editingOwner: string;
    streamingOwner: string;
    unsafeOwner: string;
    extensionMutatedOwner: string;
    hasEditingRows: boolean;
    hasStreamingRows: boolean;
    hasUnsafeRows: boolean;
    hasExtensionMutatedRows: boolean;
    reason: string;
}

interface MainChatComposerState {
    valueLength: number;
    isEmpty: boolean;
    canSubmit: boolean;
    isFocused: boolean;
    isDisabled: boolean;
    isGenerating: boolean;
    activeContext: 'character' | 'group' | 'assistant' | 'none';
}

interface MainChatSlashCommandState {
    active: boolean;
    queryLength: number;
    autocompleteVisible: boolean;
    executing: boolean;
    paused: boolean;
    aborted: boolean;
    errorLabel: string | null;
}

interface MainChatSlashUiOptionState {
    name: string;
    type: string;
    typeIcon: string;
    selectable: boolean;
    selected: boolean;
}

interface MainChatSlashUiState {
    active: boolean;
    visible: boolean;
    replaceable: boolean;
    detailsVisible: boolean;
    selectedIndex: number;
    detailsHtml: string;
    options: MainChatSlashUiOptionState[];
}

interface MainChatVisibleTransportAttempt {
    label: string;
    status: string;
    fallbackProvider: boolean;
}

interface MainChatVisibleTransportRuntimeState {
    owner: 'react';
    kind: string;
    supportStatus: string;
    supportPath: string;
    supportReason: string;
    phase: MainChatGenerationControlState['phase'] | MainChatStreamingTransportState['phase'];
    activeMessageId: number | null;
    observedTokenCount: number;
    observedChunkCount: number;
    fromFallbackAttempt: boolean;
    recoverable: boolean;
    failureRetryVisible: boolean;
    failureNoticeVisible: boolean;
    recoveryStatusLabel: string | null;
    errorLabel: string | null;
    formattedMessageHtml: string;
}

interface MainChatVisibleTransportDecisionState {
    owner: 'react' | 'legacy';
    kind: string;
    status: string;
    path: string;
    reason: string;
}

interface MainChatVisibleTransportHooks {
    onMessageHtml?: (payload: { messageId: number; formattedMessageHtml: string }) => void;
    onTransportState?: (payload: Partial<MainChatVisibleTransportRuntimeState>) => void;
}

interface MainChatPreparedVisibleTransportRequest {
    owner: 'react' | 'legacy';
    kind?: string;
    status?: string;
    path?: string;
    reason?: string;
    attempts?: MainChatVisibleTransportAttempt[];
    prepareRetryAttempt?: (attempt: MainChatVisibleTransportAttempt, attemptIndex: number) => Promise<void>;
    runAttempt?: (
        attempt: MainChatVisibleTransportAttempt,
        attemptIndex: number,
        hooks?: MainChatVisibleTransportHooks,
    ) => Promise<unknown>;
    handleFailure?: (
        exception: unknown,
        attempt: MainChatVisibleTransportAttempt,
        attemptIndex: number,
    ) => Promise<{ action: 'retry' | 'throw'; exception: unknown }>;
    finalizeSuccess?: (result: unknown) => Promise<unknown>;
    finalizeError?: (exception: unknown) => Promise<unknown> | unknown;
}

interface MainChatRichBodySnapshot {
    schema: typeof MAIN_CHAT_RICH_BODY_SNAPSHOT_SCHEMA;
    messageId: string;
    state: 'finalized' | 'editing' | 'streaming' | 'extension-mutated';
    eligible: true;
    preserveLiveContent?: boolean;
    messageHtml: string;
    reasoningHtml: string;
    reasoningOpen?: boolean;
    mediaHtml: string;
    fileHtml: string;
    biasHtml: string;
}

interface MainChatMessageRowSnapshot {
    schema: typeof MAIN_CHAT_MESSAGE_ROW_SNAPSHOT_SCHEMA;
    messageId: string;
    state: 'finalized' | 'editing' | 'streaming' | 'extension-mutated';
    eligible: true;
    preserveLiveContent?: boolean;
    role: 'user' | 'character' | 'system';
    rootClassNames: string[];
    displayName: string;
    timestampText: string;
    timestampTitle: string;
    messageHtml: string;
    reasoningHtml: string;
    reasoningOpen?: boolean;
    mediaHtml: string;
    fileHtml: string;
    biasHtml: string;
    actionShellEligible: boolean;
    swipeShellEligible: boolean;
}

interface MainChatMessageActionSnapshot {
    schema: typeof MAIN_CHAT_MESSAGE_ACTION_SNAPSHOT_SCHEMA;
    messageId: string;
    eligible: true;
    expanded: boolean;
    availableActions: string[];
    highFrequencyActions: string[];
    secondaryActions: string[];
    dangerActions: string[];
}

interface MainChatMessageListScrollSnapshot {
    chatId: string;
    anchorMessageId: string;
    anchorViewportOffset?: number;
    scrollOffset: number;
    measurements: VirtualItem[];
    firstRenderedMessageId: string;
    lastRenderedMessageId: string;
    visibleMessageCount: number;
    wasNearBottom: boolean;
}

function getMainChatMessageListScrollSnapshotStore() {
    const scope = globalThis as typeof globalThis & {
        __emberDeskMainChatMessageListScrollSnapshots?: Map<string, MainChatMessageListScrollSnapshot>;
    };

    if (!scope.__emberDeskMainChatMessageListScrollSnapshots) {
        scope.__emberDeskMainChatMessageListScrollSnapshots = new Map<string, MainChatMessageListScrollSnapshot>();
    }

    return scope.__emberDeskMainChatMessageListScrollSnapshots;
}

const queryClient = new QueryClient();
const mountedPanels = new Map<WorkspacePanelKind, WorkspacePanelMount>();
let mountedShellChrome: WorkspaceShellChromeMount | null = null;

interface SettingsOverlayMount {
    root: Root;
    host: HTMLElement;
    backdrop: HTMLElement;
    dialog: HTMLElement;
    returnFocusTo: HTMLElement | null;
    initialTab: string | null;
    panelKind: WorkspaceDockPanelKind;
    onRequestClose?: () => void;
}

let mountedSettingsOverlay: SettingsOverlayMount | null = null;

const mainChatMessageListScrollSnapshots = getMainChatMessageListScrollSnapshotStore();
const MAIN_CHAT_VIRTUAL_INDEX_ATTRIBUTE = 'data-main-chat-virtual-index';
const MAIN_CHAT_SCROLL_RESTORE_THRESHOLD_PX = 12;
const MAIN_CHAT_DEFAULT_ROW_HEIGHT_PX = 160;


const backgroundLibraryPanelFormSchema = z.object({
    filterQuery: z.string(),
    sortValue: z.string(),
});

const extensionsHostPanelFormSchema = z.object({
    extrasApiUrl: z.string(),
    extrasApiKey: z.string(),
});

const mainChatRichBodySnapshotSchema = z.object({
    schema: z.literal(MAIN_CHAT_RICH_BODY_SNAPSHOT_SCHEMA),
    messageId: z.string().min(1),
    state: z.enum(['finalized', 'editing', 'streaming', 'extension-mutated']),
    eligible: z.literal(true),
    preserveLiveContent: z.boolean().optional(),
    messageHtml: z.string(),
    reasoningHtml: z.string(),
    reasoningOpen: z.boolean().optional(),
    mediaHtml: z.string(),
    fileHtml: z.string(),
    biasHtml: z.string(),
});

const mainChatMessageRowSnapshotSchema = z.object({
    schema: z.literal(MAIN_CHAT_MESSAGE_ROW_SNAPSHOT_SCHEMA),
    messageId: z.string().min(1),
    state: z.enum(['finalized', 'editing', 'streaming', 'extension-mutated']),
    eligible: z.literal(true),
    preserveLiveContent: z.boolean().optional(),
    role: z.enum(['user', 'character', 'system']),
    rootClassNames: z.array(z.string()),
    displayName: z.string(),
    timestampText: z.string(),
    timestampTitle: z.string(),
    messageHtml: z.string(),
    reasoningHtml: z.string(),
    reasoningOpen: z.boolean().optional(),
    mediaHtml: z.string(),
    fileHtml: z.string(),
    biasHtml: z.string(),
    actionShellEligible: z.boolean(),
    swipeShellEligible: z.boolean(),
});

const mainChatMessageActionSnapshotSchema = z.object({
    schema: z.literal(MAIN_CHAT_MESSAGE_ACTION_SNAPSHOT_SCHEMA),
    messageId: z.string().min(1),
    eligible: z.literal(true),
    expanded: z.boolean(),
    availableActions: z.array(z.string()),
    highFrequencyActions: z.array(z.string()),
    secondaryActions: z.array(z.string()),
    dangerActions: z.array(z.string()),
});

const mainChatGenerationControlSchema = z.object({
    state: z.enum(['idle', 'streaming', 'recovering', 'stopped', 'completed', 'error']),
    phase: z.enum(['idle', 'streaming', 'recoveringPrimary', 'recoveringFallback', 'stopped', 'completed', 'error']),
    composerDisabled: z.boolean(),
    sendVisible: z.boolean(),
    stopVisible: z.boolean(),
    continueVisible: z.boolean(),
    continueSurface: z.enum(['hidden', 'legacy']),
    canRecoverInput: z.boolean(),
    activeMessageId: z.number().int().nonnegative().nullable(),
    recoveryStatusLabel: z.string().nullable(),
    failureRetryVisible: z.boolean(),
    failureNoticeVisible: z.boolean(),
});

const mainChatComposerSchema = z.object({
    valueLength: z.number().int().nonnegative(),
    isEmpty: z.boolean(),
    canSubmit: z.boolean(),
    isFocused: z.boolean(),
    isDisabled: z.boolean(),
    isGenerating: z.boolean(),
    activeContext: z.enum(['character', 'group', 'assistant', 'none']),
});

const mainChatSlashCommandSchema = z.object({
    active: z.boolean(),
    queryLength: z.number().int().nonnegative(),
    autocompleteVisible: z.boolean(),
    executing: z.boolean(),
    paused: z.boolean(),
    aborted: z.boolean(),
    errorLabel: z.string().nullable(),
});

const mainChatSlashUiOptionSchema = z.object({
    name: z.string(),
    type: z.string(),
    typeIcon: z.string(),
    selectable: z.boolean(),
    selected: z.boolean(),
});

const mainChatSlashUiSchema = z.object({
    active: z.boolean(),
    visible: z.boolean(),
    replaceable: z.boolean(),
    detailsVisible: z.boolean(),
    selectedIndex: z.number().int(),
    detailsHtml: z.string(),
    options: z.array(mainChatSlashUiOptionSchema),
});

const mainChatStreamingTransportSchema = z.object({
    phase: z.enum(['idle', 'connecting', 'streaming', 'finalizing', 'stopped', 'completed', 'error']),
    activeMessageId: z.number().int().nonnegative().nullable(),
    hasStreamingProcessor: z.boolean(),
    observedTokenCount: z.number().int().nonnegative(),
    observedChunkCount: z.number().int().nonnegative(),
    fromFallbackAttempt: z.boolean(),
    recoverable: z.boolean(),
    errorLabel: z.string().nullable(),
});

const mainChatQuietTransportSchema = z.object({
    owner: z.literal('legacy'),
    kind: z.string(),
    status: z.string(),
    path: z.string(),
    reason: z.string(),
    phase: z.enum(['idle', 'running', 'stopped', 'completed', 'error']),
    error: z.string(),
    autoRecover: z.boolean(),
    usesStreamingTransport: z.boolean(),
    bindsVisibleMessageRow: z.boolean(),
    finalizationStrategy: z.string(),
    rollbackStrategy: z.string(),
});

const mainChatWindowingContractSchema = z.object({
    windowingOwner: z.string(),
    phase7Candidate: z.string(),
    fallback: z.string(),
    loadMoreOwner: z.string(),
    restoreOwner: z.string(),
    renderedMessageIds: z.array(z.string()),
    totalMessageCount: z.number().int().nonnegative(),
    showMoreVisible: z.boolean(),
    anchorMessageId: z.string().nullable(),
    scrollTop: z.number().nonnegative(),
    preservesDirectChildOrder: z.boolean(),
    reason: z.string(),
});

const mainChatRowLifecycleContractSchema = z.object({
    lifecycleOwner: z.string(),
    phase7Candidate: z.string(),
    fallback: z.string(),
    editingOwner: z.string(),
    streamingOwner: z.string(),
    unsafeOwner: z.string(),
    extensionMutatedOwner: z.string(),
    hasEditingRows: z.boolean(),
    hasStreamingRows: z.boolean(),
    hasUnsafeRows: z.boolean(),
    hasExtensionMutatedRows: z.boolean(),
    reason: z.string(),
});

const mainChatGenerationControlFallback: MainChatGenerationControlState = {
    state: 'idle',
    phase: 'idle',
    composerDisabled: false,
    sendVisible: true,
    stopVisible: false,
    continueVisible: false,
    continueSurface: 'hidden',
    canRecoverInput: true,
    activeMessageId: null,
    recoveryStatusLabel: null,
    failureRetryVisible: false,
    failureNoticeVisible: false,
};

const mainChatComposerFallback: MainChatComposerState = {
    valueLength: 0,
    isEmpty: true,
    canSubmit: false,
    isFocused: false,
    isDisabled: false,
    isGenerating: false,
    activeContext: 'none',
};

const mainChatSlashCommandFallback: MainChatSlashCommandState = {
    active: false,
    queryLength: 0,
    autocompleteVisible: false,
    executing: false,
    paused: false,
    aborted: false,
    errorLabel: null,
};

const mainChatSlashUiFallback: MainChatSlashUiState = {
    active: false,
    visible: false,
    replaceable: false,
    detailsVisible: false,
    selectedIndex: -1,
    detailsHtml: '',
    options: [],
};

const mainChatStreamingTransportFallback: MainChatStreamingTransportState = {
    phase: 'idle',
    activeMessageId: null,
    hasStreamingProcessor: false,
    observedTokenCount: 0,
    observedChunkCount: 0,
    fromFallbackAttempt: false,
    recoverable: false,
    errorLabel: null,
};

const mainChatQuietTransportFallback: MainChatQuietTransportState = {
    owner: 'legacy',
    kind: '',
    status: '',
    path: '',
    reason: '',
    phase: 'idle',
    error: '',
    autoRecover: false,
    usesStreamingTransport: false,
    bindsVisibleMessageRow: false,
    finalizationStrategy: '',
    rollbackStrategy: '',
};

const mainChatWindowingContractFallback: MainChatWindowingContractState = {
    windowingOwner: 'react-message-list-controller',
    phase7Candidate: 'react-windowing-owner',
    fallback: 'not-needed',
    loadMoreOwner: 'react',
    restoreOwner: 'react',
    renderedMessageIds: [],
    totalMessageCount: 0,
    showMoreVisible: false,
    anchorMessageId: null,
    scrollTop: 0,
    preservesDirectChildOrder: true,
    reason: 'full-chat-window',
};

const mainChatRowLifecycleContractFallback: MainChatRowLifecycleContractState = {
    lifecycleOwner: 'react-message-list-controller',
    phase7Candidate: 'react-row-lifecycle-owner',
    fallback: 'not-needed',
    editingOwner: 'react',
    streamingOwner: 'react',
    unsafeOwner: 'not-needed',
    extensionMutatedOwner: 'react',
    hasEditingRows: false,
    hasStreamingRows: false,
    hasUnsafeRows: false,
    hasExtensionMutatedRows: false,
    reason: 'react-row-lifecycle-sole-owner',
};

const mainChatMessageListStateSchema = z.object({
    chatId: z.string().optional(),
    hasChatContainer: z.boolean().optional(),
    messageCount: z.number().int().nonnegative().optional(),
    firstMessageId: z.string().optional(),
    lastMessageId: z.string().optional(),
    showMoreVisible: z.boolean().optional(),
    visibleMessageIds: z.array(z.string()).optional(),
    scrollTop: z.number().nonnegative().optional(),
    scrollHeight: z.number().nonnegative().optional(),
    clientHeight: z.number().nonnegative().optional(),
});

function getMainChatRenderableMessageNodes(chatContainer: HTMLElement | null) {
    if (!(chatContainer instanceof HTMLElement)) {
        return [];
    }

    return Array.from(chatContainer.querySelectorAll<HTMLElement>(':scope > .mes[mesid]'))
        .filter((node) => node.parentElement === chatContainer);
}

function syncMainChatVirtualIndexes(messageNodes: HTMLElement[]) {
    let nextIndex = 0;
    for (const node of messageNodes) {
        node.setAttribute(MAIN_CHAT_VIRTUAL_INDEX_ATTRIBUTE, String(nextIndex));
        nextIndex += 1;
    }
}

function getMainChatEstimatedRowHeight(snapshot?: MainChatMessageListScrollSnapshot | null) {
    const measuredItems = snapshot?.measurements ?? [];
    if (measuredItems.length === 0) {
        return MAIN_CHAT_DEFAULT_ROW_HEIGHT_PX;
    }

    const totalHeight = measuredItems.reduce((sum, item) => sum + Math.max(item.size, 0), 0);
    return Math.max(Math.round(totalHeight / measuredItems.length), 1);
}

function getMainChatMessageId(messageRow: HTMLElement | null | undefined) {
    return messageRow?.getAttribute('mesid') ?? '';
}

function getActiveMainChatId() {
    const chatId = globalThis.SillyTavern?.getContext?.()?.chatId;
    return typeof chatId === 'string' ? chatId.trim() : null;
}

function getMainChatDistanceFromEnd(chatContainer: HTMLElement) {
    return Math.max(chatContainer.scrollHeight - (chatContainer.scrollTop + chatContainer.clientHeight), 0);
}

function getMainChatVisibleAnchorRow(chatContainer: HTMLElement, messageNodes: HTMLElement[]) {
    const chatRect = chatContainer.getBoundingClientRect();
    const firstVisibleRow = messageNodes.find((node) => {
        const rowRect = node.getBoundingClientRect();
        return rowRect.bottom > chatRect.top && rowRect.top < chatRect.bottom;
    });

    return firstVisibleRow ?? messageNodes[0] ?? null;
}

function shouldRestoreExpandedMainChatWindow(snapshot: MainChatMessageListScrollSnapshot, currentFirstMessageId: string) {
    const snapshotFirstMessageIndex = Number(snapshot.firstRenderedMessageId);
    const currentFirstMessageIndex = Number(currentFirstMessageId);

    if (!Number.isInteger(snapshotFirstMessageIndex) || !Number.isInteger(currentFirstMessageIndex)) {
        return false;
    }

    return snapshotFirstMessageIndex < currentFirstMessageIndex;
}

function persistMainChatMessageListScrollSnapshot(
    state: MainChatMessageListWorkspacePanelState,
    virtualizer: Virtualizer<HTMLElement, HTMLElement>,
) {
    const chatId = state.chatId?.trim();
    if (!chatId) {
        return;
    }

    const activeChatId = getActiveMainChatId();
    if (activeChatId !== null && activeChatId !== chatId) {
        return;
    }

    const chatContainer = state.chatContainer;
    if (!(chatContainer instanceof HTMLElement)) {
        return;
    }

    const messageNodes = getMainChatRenderableMessageNodes(chatContainer);
    if (messageNodes.length === 0) {
        return;
    }

    syncMainChatVirtualIndexes(messageNodes);
    const anchorRow = getMainChatVisibleAnchorRow(chatContainer, messageNodes);
    const anchorMessageId = getMainChatMessageId(anchorRow);
    const scrollOffset = chatContainer.scrollTop;
    if (!anchorMessageId || !Number.isFinite(scrollOffset)) {
        return;
    }

    const chatRect = chatContainer.getBoundingClientRect();
    const anchorViewportOffset = anchorRow instanceof HTMLElement
        ? anchorRow.getBoundingClientRect().top - chatRect.top
        : 0;

    mainChatMessageListScrollSnapshots.set(chatId, {
        chatId,
        anchorMessageId,
        anchorViewportOffset,
        scrollOffset,
        measurements: virtualizer.takeSnapshot(),
        firstRenderedMessageId: getMainChatMessageId(messageNodes[0]),
        lastRenderedMessageId: getMainChatMessageId(messageNodes.at(-1)),
        visibleMessageCount: messageNodes.length,
        wasNearBottom: getMainChatDistanceFromEnd(chatContainer) <= MAIN_CHAT_SCROLL_RESTORE_THRESHOLD_PX,
    });
}

function buildWorldInfoPanelFormDefaults(state: WorldInfoWorkspacePanelState) {
    return buildWorldInfoWorkbenchFormDefaults(state);
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
    const parsedBridgeState = mainChatMessageListStateSchema.safeParse(bridgeState);
    const messageRowSnapshots = z.array(mainChatMessageRowSnapshotSchema).safeParse(bridgeState.messageRowSnapshots ?? []);
    const richBodySnapshots = z.array(mainChatRichBodySnapshotSchema).safeParse(bridgeState.richBodySnapshots ?? []);
    const messageActionSnapshots = z.array(mainChatMessageActionSnapshotSchema).safeParse(bridgeState.messageActionSnapshots ?? []);
    const generationControl = mainChatGenerationControlSchema.safeParse(bridgeState.generationControl);
    const composer = mainChatComposerSchema.safeParse(bridgeState.composer);
    const slashCommand = mainChatSlashCommandSchema.safeParse(bridgeState.slashCommand);
    const slashUi = mainChatSlashUiSchema.safeParse(bridgeState.slashUi);
    const streamingTransport = mainChatStreamingTransportSchema.safeParse(bridgeState.streamingTransport);
    const quietTransport = mainChatQuietTransportSchema.safeParse(bridgeState.quietTransport);
    const windowingContract = mainChatWindowingContractSchema.safeParse(bridgeState.windowingContract);
    const rowLifecycleContract = mainChatRowLifecycleContractSchema.safeParse(bridgeState.rowLifecycleContract);

    return {
        ...bridgeState,
        ...(parsedBridgeState.success ? parsedBridgeState.data : {}),
        messageRowSnapshots: messageRowSnapshots.success ? messageRowSnapshots.data : [],
        richBodySnapshots: richBodySnapshots.success ? richBodySnapshots.data : [],
        messageActionSnapshots: messageActionSnapshots.success ? messageActionSnapshots.data : [],
        generationControl: generationControl.success ? generationControl.data : mainChatGenerationControlFallback,
        composer: composer.success ? composer.data : mainChatComposerFallback,
        slashCommand: slashCommand.success ? slashCommand.data : mainChatSlashCommandFallback,
        slashUi: slashUi.success ? slashUi.data : mainChatSlashUiFallback,
        streamingTransport: streamingTransport.success ? streamingTransport.data : mainChatStreamingTransportFallback,
        quietTransport: quietTransport.success ? quietTransport.data : mainChatQuietTransportFallback,
        windowingContract: windowingContract.success ? windowingContract.data : mainChatWindowingContractFallback,
        rowLifecycleContract: rowLifecycleContract.success ? rowLifecycleContract.data : mainChatRowLifecycleContractFallback,
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

function getMainChatMessageActionsRowTargets(messageRow: HTMLElement) {
    const messageButtons = messageRow.querySelector('.mes_buttons');
    const extraActionsHint = getMainChatMessageActionChild(messageButtons, 'extraMesButtonsHint');
    const extraActions = getMainChatMessageActionChild(messageButtons, 'extraMesButtons');
    const bookmarkButton = getMainChatMessageActionChild(messageButtons, 'mes_bookmark');
    const editButton = getMainChatMessageActionChild(messageButtons, 'mes_edit');
    const retryButton = getMainChatMessageActionChild(messageButtons, 'generation_failure_retry');

    if (
        !(messageButtons instanceof HTMLElement)
        || !(extraActionsHint instanceof HTMLElement)
        || !(extraActions instanceof HTMLElement)
    ) {
        return null;
    }

    return {
        messageButtons,
        extraActionsHint,
        extraActions,
        bookmarkButton,
        editButton,
        retryButton,
    };
}

function getMainChatMessageActionChild(messageButtons: Element | null | undefined, className: string) {
    if (!(messageButtons instanceof HTMLElement)) {
        return null;
    }

    const directChild = messageButtons.querySelector(`:scope > .${className}`);
    if (directChild instanceof HTMLElement) {
        return directChild;
    }

    const slotChild = messageButtons.querySelector(`:scope > [data-existing-dom-slot="${className}"] > .${className}`);
    if (slotChild instanceof HTMLElement) {
        return slotChild;
    }

    const descendant = messageButtons.querySelector(`.${className}`);
    return descendant instanceof HTMLElement ? descendant : null;
}

function canReactOwnMainChatMessageActions(messageRow: HTMLElement | undefined, snapshot: MainChatMessageActionSnapshot) {
    if (
        !(messageRow instanceof HTMLElement)
        || !messageRow.isConnected
        || messageRow.parentElement?.id !== 'chat'
        || messageRow.getAttribute('mesid') !== snapshot.messageId
    ) {
        return false;
    }

    return Boolean(getMainChatMessageActionsRowTargets(messageRow));
}

function getMainChatMessageRowStructureTarget(messageRow: HTMLElement, className: string) {
    const directChild = messageRow.querySelector(`:scope > .${className}`);
    if (directChild instanceof HTMLElement) {
        return directChild;
    }

    const slotChild = messageRow.querySelector(`[data-main-chat-message-row-slot="${className}"] > .${className}`);
    if (slotChild instanceof HTMLElement) {
        return slotChild;
    }

    const descendant = messageRow.querySelector(`.${className}`);
    return descendant instanceof HTMLElement ? descendant : null;
}

function getMainChatMessageRowTargets(messageRow: HTMLElement) {
    const checkboxShell = getMainChatMessageRowStructureTarget(messageRow, 'for_checkbox');
    const deleteCheckbox = messageRow.querySelector(':scope > .del_checkbox, .del_checkbox');
    const avatarWrapper = getMainChatMessageRowStructureTarget(messageRow, 'mesAvatarWrapper');
    const swipeLeft = getMainChatMessageRowStructureTarget(messageRow, 'swipe_left');
    const messageBlock = messageRow.querySelector(':scope > .mes_block') ?? messageRow.querySelector('.mes_block');
    const swipeRightBlock = getMainChatMessageRowStructureTarget(messageRow, 'swipeRightBlock');
    const swipeRight = swipeRightBlock?.querySelector('.swipe_right');
    const swipeCounter = swipeRightBlock?.querySelector('.swipes-counter');
    const messageEditButtons = messageBlock?.querySelector('.mes_edit_buttons');
    const richBodyTargets = getMainChatRichBodyRowTargets(messageRow);
    const actionTargets = getMainChatMessageActionsRowTargets(messageRow);

    if (
        !(checkboxShell instanceof HTMLElement)
        || !(deleteCheckbox instanceof HTMLInputElement)
        || !(avatarWrapper instanceof HTMLElement)
        || !(swipeLeft instanceof HTMLElement)
        || !(messageBlock instanceof HTMLElement)
        || !(swipeRightBlock instanceof HTMLElement)
        || !(swipeRight instanceof HTMLElement)
        || !(swipeCounter instanceof HTMLElement)
        || !(messageEditButtons instanceof HTMLElement)
        || !richBodyTargets
        || !actionTargets
    ) {
        return null;
    }

    return {
        checkboxShell,
        deleteCheckbox,
        avatarWrapper,
        swipeLeft,
        messageBlock,
        swipeRightBlock,
        swipeRight,
        swipeCounter,
        messageEditButtons,
    };
}

function canReactOwnMainChatMessageRow(messageRow: HTMLElement | undefined, snapshot: MainChatMessageRowSnapshot) {
    if (
        !(messageRow instanceof HTMLElement)
        || !messageRow.isConnected
        || messageRow.parentElement?.id !== 'chat'
        || messageRow.getAttribute('mesid') !== snapshot.messageId
    ) {
        return false;
    }

    return Boolean(getMainChatMessageRowTargets(messageRow));
}

function MainChatMessageRowSlot({
    row,
    node,
    slot,
}: {
    row: HTMLElement;
    node: HTMLElement;
    slot: string;
}) {
    const hostRef = useRef<HTMLDivElement | null>(null);

    useLayoutEffect(() => {
        const host = hostRef.current;
        if (!(host instanceof HTMLElement) || !(node instanceof HTMLElement)) {
            return;
        }

        if (node.parentElement !== host) {
            host.appendChild(node);
        }

        return () => {
            if (node.parentElement === host && row.isConnected) {
                row.insertBefore(node, host);
            }
        };
    }, [node, row]);

    return <div ref={hostRef} data-main-chat-message-row-slot={slot} style={{ display: 'contents' }} />;
}

function ExistingDomNodeSlot({
    node,
    slot,
    displayContents = true,
}: {
    node: HTMLElement | HTMLInputElement;
    slot: string;
    displayContents?: boolean;
}) {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const previousParentRef = useRef<ParentNode | null>(null);
    const previousSiblingRef = useRef<ChildNode | null>(null);

    useLayoutEffect(() => {
        const host = hostRef.current;
        if (!(host instanceof HTMLElement)) {
            return;
        }

        if (node.parentElement !== host) {
            previousParentRef.current = node.parentNode;
            previousSiblingRef.current = node.nextSibling;
            host.appendChild(node);
        }

        return () => {
            if (node.parentElement !== host) {
                return;
            }

            const previousParent = previousParentRef.current;
            const previousSibling = previousSiblingRef.current;
            if (previousParent && 'insertBefore' in previousParent) {
                previousParent.insertBefore(node, previousSibling);
            }
        };
    }, [node]);

    return (
        <div
            ref={hostRef}
            data-existing-dom-slot={slot}
            style={displayContents
                ? { display: 'contents' }
                : { display: 'inline-flex', alignItems: 'center', flex: '0 0 auto' }}
        />
    );
}

function createMainChatVisibleTransportRuntime(kind: string): MainChatVisibleTransportRuntimeState {
    return {
        owner: 'react',
        kind,
        supportStatus: MAIN_CHAT_VISIBLE_TRANSPORT_STATUSES.SERVICE_OWNED,
        supportPath: MAIN_CHAT_VISIBLE_TRANSPORT_PATHS.STANDARD_OPENAI_VISIBLE_DIRECT_CHAT,
        supportReason: MAIN_CHAT_VISIBLE_TRANSPORT_REASONS.SUPPORTED_KIND,
        phase: 'connecting',
        activeMessageId: null,
        observedTokenCount: 0,
        observedChunkCount: 0,
        fromFallbackAttempt: false,
        recoverable: false,
        failureRetryVisible: false,
        failureNoticeVisible: false,
        recoveryStatusLabel: null,
        errorLabel: null,
        formattedMessageHtml: '',
    };
}

function extractMainChatVisibleTransportDecision(
    prepared: MainChatPreparedVisibleTransportRequest | undefined,
    kind: string,
): MainChatVisibleTransportDecisionState {
    return {
        owner: prepared?.owner === 'react' ? 'react' : 'legacy',
        kind: String(prepared?.kind ?? kind ?? ''),
        status: String(prepared?.status ?? ''),
        path: String(prepared?.path ?? ''),
        reason: String(prepared?.reason ?? ''),
    };
}

function shouldClearReactVisibleTransportRuntimeAfterSettle(
    runtime: MainChatVisibleTransportRuntimeState | null,
): boolean {
    if (!runtime || runtime.owner !== 'react') {
        return false;
    }

    return runtime.phase === 'completed' || runtime.phase === 'stopped' || runtime.phase === 'error';
}

function scheduleMainChatVisibleTransportRuntimeSettle(
    setRuntime: React.Dispatch<React.SetStateAction<MainChatVisibleTransportRuntimeState | null>>,
) {
    window.setTimeout(() => {
        setRuntime((current) => (
            shouldClearReactVisibleTransportRuntimeAfterSettle(current) ? null : current
        ));
    }, 0);
}

function isReactVisibleTransportStopException(exception: unknown): boolean {
    const errorName = String((exception as { name?: unknown })?.name ?? '');
    const errorMessage = String((exception as { message?: unknown })?.message ?? exception ?? '');
    return errorName === 'AbortError' || /generation was aborted/i.test(errorMessage);
}

function buildReactOwnedMainChatGenerationControl(
    runtime: MainChatVisibleTransportRuntimeState | null,
    fallback: MainChatGenerationControlState,
): MainChatGenerationControlState {
    if (!runtime || runtime.owner !== 'react') {
        return fallback;
    }

    const isRecovering = runtime.phase === 'recoveringPrimary' || runtime.phase === 'recoveringFallback';
    const isStreaming = runtime.phase === 'connecting' || runtime.phase === 'streaming' || runtime.phase === 'finalizing';
    const isError = runtime.phase === 'error';
    const isStopped = runtime.phase === 'stopped';
    const isCompleted = runtime.phase === 'completed';

    return {
        state: isRecovering
            ? 'recovering'
            : isStreaming
                ? 'streaming'
                : isError
                    ? 'error'
                    : isStopped
                        ? 'stopped'
                        : isCompleted
                            ? 'completed'
                            : 'idle',
        phase: runtime.phase === 'connecting' || runtime.phase === 'finalizing'
            ? 'streaming'
            : runtime.phase === 'idle'
                ? 'idle'
                : runtime.phase,
        composerDisabled: isStreaming || isRecovering,
        sendVisible: !isStreaming && !isRecovering,
        stopVisible: isStreaming || isRecovering,
        continueVisible: isError || isStopped || isCompleted,
        continueSurface: isError || isStopped || isCompleted ? 'legacy' : 'hidden',
        canRecoverInput: !isStreaming && !isRecovering,
        activeMessageId: runtime.activeMessageId,
        recoveryStatusLabel: runtime.recoveryStatusLabel,
        failureRetryVisible: runtime.failureRetryVisible,
        failureNoticeVisible: runtime.failureNoticeVisible,
    };
}

function buildReactOwnedMainChatStreamingTransport(
    runtime: MainChatVisibleTransportRuntimeState | null,
    fallback: MainChatStreamingTransportState,
): MainChatStreamingTransportState {
    if (!runtime || runtime.owner !== 'react') {
        return fallback;
    }

    return {
        phase: runtime.phase === 'recoveringPrimary' || runtime.phase === 'recoveringFallback'
            ? 'connecting'
            : runtime.phase,
        activeMessageId: runtime.activeMessageId,
        hasStreamingProcessor: runtime.phase === 'connecting' || runtime.phase === 'streaming' || runtime.phase === 'finalizing',
        observedTokenCount: runtime.observedTokenCount,
        observedChunkCount: runtime.observedChunkCount,
        fromFallbackAttempt: runtime.fromFallbackAttempt,
        recoverable: runtime.recoverable,
        errorLabel: runtime.errorLabel,
    };
}

function getMainChatActiveRuntimeMessageRow(
    messageRowMap: Map<string, HTMLElement>,
    activeMessageId: number | null | undefined,
): HTMLElement | null {
    if (activeMessageId === null || activeMessageId === undefined) {
        return null;
    }

    const mappedRow = messageRowMap.get(String(activeMessageId));
    if (mappedRow instanceof HTMLElement) {
        return mappedRow;
    }

    const liveRow = document.querySelector(`#chat > .mes[mesid="${activeMessageId}"]`);
    return liveRow instanceof HTMLElement ? liveRow : null;
}

function MainChatActiveTransportRowOwnerPortal({
    runtime,
    messageRow,
    finalizedRowOwned,
}: {
    runtime: MainChatVisibleTransportRuntimeState;
    messageRow: HTMLElement;
    finalizedRowOwned: boolean;
}) {
    useLayoutEffect(() => {
        if (!(messageRow instanceof HTMLElement)) {
            return;
        }

        const messageText = messageRow.querySelector('.mes_text');
        if (!(messageText instanceof HTMLElement)) {
            return;
        }

        messageRow.dataset.mainChatActiveTransportOwner = 'react';
        messageRow.dataset.mainChatMessageRowOwner = 'react';
        messageRow.dataset.mainChatMessageRowState = 'streaming';
        messageRow.dataset.mainChatMessageRowPreserveLive = 'true';
        messageRow.dataset.mainChatMessageRow = String(runtime.activeMessageId ?? '');

        // Never clobber extension-owned streaming/render mutations during token updates.
        const liveExtensionMutation = Boolean(
            messageRow.querySelector('.mes_streaming, .TH-streaming')
            || messageText.querySelector('.TH-render'),
        );
        const nextHtml = runtime.formattedMessageHtml ?? '';
        if (!liveExtensionMutation && messageText.innerHTML !== nextHtml) {
            messageText.innerHTML = nextHtml;
        }

        return () => {
            delete messageRow.dataset.mainChatActiveTransportOwner;
            if (!finalizedRowOwned) {
                delete messageRow.dataset.mainChatMessageRowOwner;
                delete messageRow.dataset.mainChatMessageRow;
                delete messageRow.dataset.mainChatMessageRowState;
                delete messageRow.dataset.mainChatMessageRowPreserveLive;
            }
        };
    }, [finalizedRowOwned, messageRow, runtime.activeMessageId, runtime.formattedMessageHtml]);

    return null;
}

function MainChatRichBodyOwnerPortal({
    messageRow,
    snapshot,
}: {
    messageRow: HTMLElement;
    snapshot: MainChatRichBodySnapshot;
}) {
    const targets = getMainChatRichBodyRowTargets(messageRow);

    useLayoutEffect(() => {
        if (!targets) {
            return;
        }

        targets.messageBlock.dataset.mainChatRichBodyOwner = 'react';
        targets.messageBlock.dataset.mainChatRichBodyRow = snapshot.messageId;
        targets.messageBlock.dataset.mainChatRichBodyState = snapshot.state;
        targets.messageBlock.dataset.mainChatRichBodyPreserveLive = snapshot.preserveLiveContent ? 'true' : 'false';

        // Stable imperative mutation hosts for third-party extensions (JS-Slash-Runner .TH-*).
        // Host identity survives React ownership updates; content is replaced only when
        // preserveLiveContent is false (finalized, non-extension rows).
        const mutationHosts = [
            targets.messageNode,
            targets.reasoningNode,
            targets.mediaNode,
            targets.fileNode,
            targets.biasNode,
        ];
        for (const host of mutationHosts) {
            host.dataset.mainChatMutationZone = 'true';
            host.dataset.mainChatMutationZoneRow = snapshot.messageId;
            host.dataset.mainChatMutationZoneState = snapshot.state;
        }
        targets.messageNode.dataset.mainChatMutationZoneKind = 'mes_text';
        targets.reasoningNode.dataset.mainChatMutationZoneKind = 'mes_reasoning';
        targets.mediaNode.dataset.mainChatMutationZoneKind = 'mes_media_wrapper';
        targets.fileNode.dataset.mainChatMutationZoneKind = 'mes_file_wrapper';
        targets.biasNode.dataset.mainChatMutationZoneKind = 'mes_bias';

        // Editing/streaming/extension-mutated rows keep live DOM (edit textarea, stream tokens, TH mutations).
        // Also re-check live markers so a stale finalized snapshot cannot wipe extension mutations.
        // React still owns the shell markers so the row is not remounted as a second lifecycle owner.
        // Skip identical HTML rewrites: snapshot HTML is captured from the same live nodes, and
        // reassigning innerHTML destroys code-copy listeners, media element identity, and AudioPlayer.
        const liveExtensionMutation = Boolean(
            messageRow.querySelector('.mes_streaming, .TH-streaming')
            || targets.messageNode.querySelector('.TH-render')
            || messageRow.querySelector('.edit_textarea, .reasoning_edit_textarea'),
        );
        if (!snapshot.preserveLiveContent && !liveExtensionMutation) {
            if (targets.reasoningDetails.open !== Boolean(snapshot.reasoningOpen)) {
                targets.reasoningDetails.open = snapshot.reasoningOpen ?? false;
            }
            if (targets.reasoningNode.innerHTML !== snapshot.reasoningHtml) {
                targets.reasoningNode.innerHTML = snapshot.reasoningHtml;
            }
            if (targets.messageNode.innerHTML !== snapshot.messageHtml) {
                targets.messageNode.innerHTML = snapshot.messageHtml;
            }
            if (targets.mediaNode.innerHTML !== snapshot.mediaHtml) {
                targets.mediaNode.innerHTML = snapshot.mediaHtml;
            }
            if (targets.fileNode.innerHTML !== snapshot.fileHtml) {
                targets.fileNode.innerHTML = snapshot.fileHtml;
            }
            if (targets.biasNode.innerHTML !== snapshot.biasHtml) {
                targets.biasNode.innerHTML = snapshot.biasHtml;
            }
        }

        return () => {
            delete targets.messageBlock.dataset.mainChatRichBodyOwner;
            delete targets.messageBlock.dataset.mainChatRichBodyRow;
            delete targets.messageBlock.dataset.mainChatRichBodyState;
            delete targets.messageBlock.dataset.mainChatRichBodyPreserveLive;
            for (const host of mutationHosts) {
                delete host.dataset.mainChatMutationZone;
                delete host.dataset.mainChatMutationZoneRow;
                delete host.dataset.mainChatMutationZoneState;
                delete host.dataset.mainChatMutationZoneKind;
            }
        };
    }, [
        snapshot.biasHtml,
        snapshot.fileHtml,
        snapshot.mediaHtml,
        snapshot.messageHtml,
        snapshot.messageId,
        snapshot.preserveLiveContent,
        snapshot.reasoningHtml,
        snapshot.reasoningOpen,
        snapshot.state,
        targets,
    ]);

    if (!targets) {
        return null;
    }

    return (
        <div hidden aria-hidden="true" data-main-chat-rich-body-mutation-zone="true" />
    );
}

function MainChatMessageRowOwnerPortal({
    messageRow,
    snapshot,
    bridge,
}: {
    messageRow: HTMLElement;
    snapshot: MainChatMessageRowSnapshot;
    bridge?: WorkspacePanelBridge;
}) {
    const targets = getMainChatMessageRowTargets(messageRow);

    useLayoutEffect(() => {
        messageRow.dataset.mainChatMessageRowOwner = 'react';
        messageRow.dataset.mainChatMessageRow = snapshot.messageId;
        messageRow.dataset.mainChatMessageRowState = snapshot.state;
        messageRow.dataset.mainChatMessageRowPreserveLive = snapshot.preserveLiveContent ? 'true' : 'false';

        return () => {
            delete messageRow.dataset.mainChatMessageRowOwner;
            delete messageRow.dataset.mainChatMessageRow;
            delete messageRow.dataset.mainChatMessageRowState;
            delete messageRow.dataset.mainChatMessageRowPreserveLive;
        };
    }, [messageRow, snapshot.messageId, snapshot.preserveLiveContent, snapshot.state]);

    useLayoutEffect(() => {
        if (!targets || !snapshot.swipeShellEligible) {
            return;
        }

        const triggerSwipe = (kind: 'swipeLeft' | 'swipeRight') => (event: MouseEvent) => {
            event.preventDefault();
            event.stopImmediatePropagation();
            event.stopPropagation();
            void bridge?.dispatchAction?.('triggerVisibleGeneration', {
                kind,
                messageId: Number(snapshot.messageId),
            });
        };

        const handleSwipeLeftClick = triggerSwipe('swipeLeft');
        const handleSwipeRightClick = triggerSwipe('swipeRight');
        targets.swipeLeft.addEventListener('click', handleSwipeLeftClick, true);
        targets.swipeRight.addEventListener('click', handleSwipeRightClick, true);

        return () => {
            targets.swipeLeft.removeEventListener('click', handleSwipeLeftClick, true);
            targets.swipeRight.removeEventListener('click', handleSwipeRightClick, true);
        };
    }, [bridge, snapshot.messageId, snapshot.swipeShellEligible, targets]);

    if (!targets) {
        return null;
    }

    return (
        <>
            <MainChatMessageRowSlot row={messageRow} node={targets.checkboxShell} slot="for_checkbox" />
            <MainChatMessageRowSlot row={messageRow} node={targets.deleteCheckbox} slot="del_checkbox" />
            <MainChatMessageRowSlot row={messageRow} node={targets.avatarWrapper} slot="mesAvatarWrapper" />
            <MainChatMessageRowSlot row={messageRow} node={targets.swipeLeft} slot="swipe_left" />
            <MainChatMessageRowSlot row={messageRow} node={targets.messageBlock} slot="mes_block" />
            <MainChatMessageRowSlot row={messageRow} node={targets.swipeRightBlock} slot="swipeRightBlock" />
        </>
    );
}

function MainChatMessageActionsOwnerPortal({
    messageRow,
    snapshot,
    bridge,
}: {
    messageRow: HTMLElement;
    snapshot: MainChatMessageActionSnapshot;
    bridge?: WorkspacePanelBridge;
}) {
    const targets = getMainChatMessageActionsRowTargets(messageRow);

    useLayoutEffect(() => {
        if (!targets) {
            return;
        }

        const openMessageActions = () => {
            void bridge?.dispatchAction?.('toggleMessageActionsShell', {
                kind: 'open',
                messageId: Number(snapshot.messageId),
            });
        };
        const handleHintClick = (event: MouseEvent) => {
            event.preventDefault();
            event.stopImmediatePropagation();
            event.stopPropagation();
            openMessageActions();
        };
        const handleHintKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Enter' && event.key !== ' ') {
                return;
            }

            event.preventDefault();
            event.stopImmediatePropagation();
            event.stopPropagation();
            openMessageActions();
        };
        const handleRetryClick = (event: MouseEvent) => {
            event.preventDefault();
            event.stopImmediatePropagation();
            event.stopPropagation();
            void bridge?.dispatchAction?.('triggerVisibleGeneration', {
                kind: 'retryGeneration',
                messageId: Number(snapshot.messageId),
            });
        };
        const handleRetryKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Enter' && event.key !== ' ') {
                return;
            }

            event.preventDefault();
            event.stopImmediatePropagation();
            event.stopPropagation();
            void bridge?.dispatchAction?.('triggerVisibleGeneration', {
                kind: 'retryGeneration',
                messageId: Number(snapshot.messageId),
            });
        };

        const { messageButtons } = targets;
        messageButtons.dataset.mainChatMessageActionsOwner = 'react';
        messageButtons.dataset.mainChatMessageActionsRow = snapshot.messageId;
        targets.extraActionsHint.addEventListener('click', handleHintClick, true);
        targets.extraActionsHint.addEventListener('keydown', handleHintKeyDown, true);
        targets.retryButton?.addEventListener('click', handleRetryClick, true);
        targets.retryButton?.addEventListener('keydown', handleRetryKeyDown, true);

        return () => {
            targets.extraActionsHint.removeEventListener('click', handleHintClick, true);
            targets.extraActionsHint.removeEventListener('keydown', handleHintKeyDown, true);
            targets.retryButton?.removeEventListener('click', handleRetryClick, true);
            targets.retryButton?.removeEventListener('keydown', handleRetryKeyDown, true);
            delete messageButtons.dataset.mainChatMessageActionsOwner;
            delete messageButtons.dataset.mainChatMessageActionsRow;
        };
    }, [bridge, snapshot.messageId, targets]);

    useLayoutEffect(() => {
        if (!targets) {
            return;
        }

        const { messageButtons } = targets;
        messageButtons.dataset.mainChatMessageActionsExpanded = snapshot.expanded ? 'true' : 'false';
        messageButtons.dataset.mainChatMessageActionsAvailable = snapshot.availableActions.join('|');
        messageButtons.dataset.mainChatMessageActionsHighFrequency = snapshot.highFrequencyActions.join('|');
        messageButtons.dataset.mainChatMessageActionsSecondary = snapshot.secondaryActions.join('|');
        messageButtons.dataset.mainChatMessageActionsDanger = snapshot.dangerActions.join('|');
    }, [
        snapshot.expanded,
        snapshot.availableActions,
        snapshot.highFrequencyActions,
        snapshot.secondaryActions,
        snapshot.dangerActions,
        targets,
    ]);

    if (!targets) {
        return null;
    }

    return (
        <>
            <ExistingDomNodeSlot node={targets.extraActionsHint} slot="extraMesButtonsHint" displayContents={false} />
            <ExistingDomNodeSlot node={targets.extraActions} slot="extraMesButtons" displayContents={false} />
            {targets.bookmarkButton instanceof HTMLElement ? (
                <ExistingDomNodeSlot node={targets.bookmarkButton} slot="mes_bookmark" displayContents={false} />
            ) : null}
            {targets.editButton instanceof HTMLElement ? (
                <ExistingDomNodeSlot node={targets.editButton} slot="mes_edit" displayContents={false} />
            ) : null}
            {targets.retryButton instanceof HTMLElement ? (
                <ExistingDomNodeSlot node={targets.retryButton} slot="generation_failure_retry" displayContents={false} />
            ) : null}
        </>
    );
}

function getMainChatComposerTargets(state: MainChatMessageListWorkspacePanelState) {
    const nonQrFormItems = state.nonQrFormItems;
    const leftSendForm = state.leftSendForm;
    const sendTextarea = state.sendTextarea;
    const rightSendForm = state.rightSendForm;
    const sendForm = state.sendForm;
    const sendButton = state.sendButton;

    if (
        !(nonQrFormItems instanceof HTMLElement)
        || !(leftSendForm instanceof HTMLElement)
        || !(sendTextarea instanceof HTMLTextAreaElement)
        || !(rightSendForm instanceof HTMLElement)
        || !(sendForm instanceof HTMLElement)
        || !(sendButton instanceof HTMLElement)
    ) {
        return null;
    }

    const continueButton = state.continueButton instanceof HTMLElement ? state.continueButton : null;
    const regenerateButton = state.regenerateButton instanceof HTMLElement ? state.regenerateButton : null;
    const stopButton = state.stopButton instanceof HTMLElement ? state.stopButton : null;

    return {
        nonQrFormItems,
        leftSendForm,
        sendTextarea,
        rightSendForm,
        sendForm,
        sendButton,
        stopButton,
        continueButton,
        regenerateButton,
    };
}

function MainChatComposerOwnerPortal({
    state,
    bridge,
    onVisibleGeneration,
}: {
    state: MainChatMessageListWorkspacePanelState;
    bridge?: WorkspacePanelBridge;
    onVisibleGeneration?: (payload: Record<string, unknown>) => Promise<void>;
}) {
    const targets = getMainChatComposerTargets(state);
    const formDefaults = useMemo(() => ({ value: state.composerValue ?? '' }), [state.composerValue]);
    const composerActionInFlightRef = useRef(false);
    const composerForm = useForm({
        defaultValues: formDefaults,
        validators: {
            onChange: z.object({
                value: z.string(),
            }),
        },
    });

    useEffect(() => {
        composerForm.reset(formDefaults);
    }, [composerForm, formDefaults]);

    const runSerializedComposerAction = useCallback(async (payload: Record<string, unknown>) => {
        if (composerActionInFlightRef.current) {
            return;
        }

        composerActionInFlightRef.current = true;
        try {
            if (onVisibleGeneration) {
                await onVisibleGeneration(payload);
                return;
            }

            await bridge?.dispatchAction?.('triggerVisibleGeneration', payload);
        } finally {
            composerActionInFlightRef.current = false;
        }
    }, [bridge, onVisibleGeneration]);

    useLayoutEffect(() => {
        if (!targets) {
            return;
        }

        targets.sendForm.dataset.mainChatComposerOwner = 'react';
        targets.nonQrFormItems.dataset.mainChatComposerOwner = 'react';

        return () => {
            delete targets.sendForm.dataset.mainChatComposerOwner;
            delete targets.nonQrFormItems.dataset.mainChatComposerOwner;
        };
    }, [targets]);

    useEffect(() => {
        void bridge?.dispatchAction?.('setSlashVisibleOwner', { enabled: Boolean(targets) });

        return () => {
            void bridge?.dispatchAction?.('setSlashVisibleOwner', { enabled: false });
        };
    }, [bridge, targets]);

    useLayoutEffect(() => {
        if (!targets) {
            return;
        }

        const restoreComposerFocus = () => {
            if (!state.composer?.isFocused) {
                return;
            }

            targets.sendTextarea.focus();
        };
        const syncComposerField = () => {
            composerForm.setFieldValue('value', targets.sendTextarea.value);
        };
        const handleTextareaKeyDown = (event: KeyboardEvent) => {
            if (
                event.defaultPrevented
                || event.isComposing
                || event.key !== 'Enter'
                || event.shiftKey
                || event.ctrlKey
                || event.altKey
                || event.metaKey
            ) {
                return;
            }

            if (state.slashUi?.visible || state.slashCommand?.autocompleteVisible) {
                return;
            }

            event.preventDefault();
            event.stopImmediatePropagation();
            event.stopPropagation();
            void runSerializedComposerAction({ kind: 'submitComposer' });
        };
        const handleSendButtonClick = (event: MouseEvent) => {
            event.preventDefault();
            event.stopImmediatePropagation();
            event.stopPropagation();
            restoreComposerFocus();
            void runSerializedComposerAction({ kind: 'submitComposer' });
        };
        const handleStopButtonClick = (event: MouseEvent) => {
            event.preventDefault();
            event.stopImmediatePropagation();
            event.stopPropagation();
            window.setTimeout(() => {
                void bridge?.dispatchAction?.('stopVisibleGeneration');
            }, 0);
        };
        const handleContinueButtonClick = (event: MouseEvent) => {
            event.preventDefault();
            event.stopImmediatePropagation();
            event.stopPropagation();
            restoreComposerFocus();
            void runSerializedComposerAction({ kind: 'continueLast' });
        };
        const handleRegenerateButtonClick = (event: MouseEvent) => {
            event.preventDefault();
            event.stopImmediatePropagation();
            event.stopPropagation();
            restoreComposerFocus();
            void bridge?.dispatchAction?.('triggerVisibleGeneration', { kind: 'retryGeneration' });
        };

        syncComposerField();
        targets.sendTextarea.addEventListener('input', syncComposerField);
        targets.sendTextarea.addEventListener('keydown', handleTextareaKeyDown, true);
        targets.sendButton.addEventListener('click', handleSendButtonClick, true);
        targets.stopButton?.addEventListener('click', handleStopButtonClick, true);
        targets.continueButton?.addEventListener('click', handleContinueButtonClick, true);
        targets.regenerateButton?.addEventListener('click', handleRegenerateButtonClick, true);

        return () => {
            targets.sendTextarea.removeEventListener('input', syncComposerField);
            targets.sendTextarea.removeEventListener('keydown', handleTextareaKeyDown, true);
            targets.sendButton.removeEventListener('click', handleSendButtonClick, true);
            targets.stopButton?.removeEventListener('click', handleStopButtonClick, true);
            targets.continueButton?.removeEventListener('click', handleContinueButtonClick, true);
            targets.regenerateButton?.removeEventListener('click', handleRegenerateButtonClick, true);
        };
    }, [bridge, composerForm, runSerializedComposerAction, state.slashCommand?.autocompleteVisible, state.slashUi?.visible, targets]);

    if (!targets) {
        return null;
    }

    return createPortal(
        <>
            <ExistingDomNodeSlot node={targets.leftSendForm} slot="leftSendForm" />
            <ExistingDomNodeSlot node={targets.rightSendForm} slot="rightSendForm" />
        </>,
        targets.nonQrFormItems,
        'main-chat-composer-owner',
    );
}

function MainChatSlashUiPortal({
    state,
    bridge,
}: {
    state: MainChatMessageListWorkspacePanelState;
    bridge?: WorkspacePanelBridge;
}) {
    const targets = getMainChatComposerTargets(state);
    const slashUi = state.slashUi ?? mainChatSlashUiFallback;
    const slashStatus = state.slashCommand ?? mainChatSlashCommandFallback;
    const slashSelectionMutation = useMutation({
        mutationFn: async ({ index }: { index: number }) => {
            await bridge?.dispatchAction?.('selectSlashAutocompleteOption', { index });
        },
        retry: false,
    });
    const shouldShowStatus = Boolean(slashStatus.paused || slashStatus.aborted || slashStatus.errorLabel);
    const shouldShowDetails = Boolean(slashUi.detailsVisible && slashUi.detailsHtml);
    const shouldShowVisibleUi = Boolean(slashUi.visible && slashUi.options.length > 0);

    if (!targets || (!shouldShowVisibleUi && !shouldShowStatus && !shouldShowDetails)) {
        return null;
    }

    return createPortal(
        <>
            {shouldShowVisibleUi ? (
                <div
                    className="autoComplete-wrap"
                    data-main-chat-slash-ui-owner="react"
                    style={{ left: '0', right: '0', bottom: '100%' }}
                >
                    <ul className="autoComplete">
                        {slashUi.options.map((option, index) => (
                            <li
                                key={`${option.name}-${index}`}
                                className={`item${option.selected ? ' selected' : ''}${option.selectable ? '' : ' not-selectable'}`}
                                data-option-type={option.type}
                                data-main-chat-slash-option={option.name}
                                onPointerDown={(event) => {
                                    event.preventDefault();
                                    if (!option.selectable) {
                                        return;
                                    }
                                    slashSelectionMutation.mutate({ index });
                                }}
                            >
                                <span className="type monospace">{option.typeIcon || ' '}</span>
                                <span className="specs">
                                    <span className="name monospace">/{option.name}</span>
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}
            {shouldShowStatus || shouldShowDetails ? (
                <div
                    className="autoComplete-detailsWrap full"
                    data-main-chat-slash-ui-details="react"
                    style={{ left: '0', right: '0', bottom: '100%' }}
                >
                    <div className="autoComplete-details">
                        {shouldShowStatus ? (
                            <output>
                                {slashStatus.errorLabel
                                    ? `Error: ${slashStatus.errorLabel}`
                                    : slashStatus.aborted
                                        ? 'Aborted'
                                        : slashStatus.paused
                                            ? 'Paused'
                                            : ''}
                            </output>
                        ) : null}
                        {shouldShowDetails ? (
                            <div dangerouslySetInnerHTML={{ __html: slashUi.detailsHtml }} />
                        ) : null}
                    </div>
                </div>
            ) : null}
        </>,
        targets.nonQrFormItems,
        'main-chat-slash-ui-owner',
    );
}

function getMainChatLocalStatus(
    state: MainChatMessageListWorkspacePanelState,
    generationControl: MainChatGenerationControlState,
): MainChatLayoutStatus {
    if (!state.hasChatContainer) {
        return 'loading';
    }

    if (generationControl.state === 'error' || generationControl.failureNoticeVisible || generationControl.failureRetryVisible) {
        return 'error';
    }

    if (generationControl.state === 'recovering') {
        return 'recovering';
    }

    if (generationControl.state === 'streaming') {
        return 'streaming';
    }

    if ((state.messageCount ?? 0) === 0) {
        return 'empty';
    }

    return 'success';
}

function getMainChatLocalStatusLabel(status: MainChatLayoutStatus, generationControl: MainChatGenerationControlState) {
    if (generationControl.recoveryStatusLabel) {
        return generationControl.recoveryStatusLabel;
    }

    switch (status) {
        case 'loading':
            return 'Preparing chat layout';
        case 'empty':
            return 'Open a character or start a chat';
        case 'streaming':
            return 'Generating response';
        case 'recovering':
            return 'Recovering generation';
        case 'error':
            return 'Generation needs attention';
        case 'success':
        default:
            return 'Chat ready';
    }
}

function MainChatLayoutStatusPortal({
    state,
    status,
    label,
    bridge,
    generationControl,
}: {
    state: MainChatMessageListWorkspacePanelState;
    status: MainChatLayoutStatus;
    label: string;
    bridge?: WorkspacePanelBridge;
    generationControl: MainChatGenerationControlState;
}) {
    const sendForm = state.sendForm;
    const shouldShow = status !== 'success';
    const actions: WorkspacePanelRecoveryAction[] = [];
    const hasMessageRetryAction = Boolean(
        state.chatContainer?.querySelector('.generation_failure_retry'),
    );

    if (!(sendForm instanceof HTMLElement) || !shouldShow) {
        return null;
    }

    if (status === 'empty') {
        actions.push({
            id: 'open-character-library',
            label: 'Open character library',
            onClick: () => {
                void bridge?.dispatchAction?.('openCharacterLibrary');
            },
        });
    }

    if (status === 'error' && generationControl.failureRetryVisible && !hasMessageRetryAction) {
        actions.push({
            id: 'retry-generation',
            label: 'Retry generation',
            onClick: () => {
                void bridge?.dispatchAction?.('triggerVisibleGeneration', { kind: 'retryGeneration' });
            },
        });
    }

    if (status === 'error' && generationControl.continueVisible) {
        actions.push({
            id: 'continue-last-message',
            label: 'Continue last message',
            onClick: () => {
                void bridge?.dispatchAction?.('triggerVisibleGeneration', { kind: 'continueLast' });
            },
        });
    }

    return createPortal(
        <div
            className="react-main-chat-local-status"
            data-main-chat-local-status={status}
            role={status === 'error' ? 'alert' : 'status'}
            aria-live={status === 'error' ? 'assertive' : 'polite'}
        >
            <span className="react-main-chat-local-status-dot" aria-hidden="true" />
            <span>{label}</span>
            {actions.length > 0 ? (
                <span className="react-main-chat-local-actions">
                    {actions.map(action => (
                        <button
                            key={action.id}
                            type="button"
                            className="menu_button menu_button_icon"
                            data-main-chat-local-action={action.id}
                            onClick={action.onClick}
                            disabled={action.disabled}
                        >
                            {action.label}
                        </button>
                    ))}
                </span>
            ) : null}
        </div>,
        sendForm,
        'main-chat-layout-local-status',
    );
}

function workspacePanelStateQueryKey(kind: WorkspacePanelKind) {
    return ['workspace-panel', kind, 'bridge-state'] as const;
}

function WorkspacePanelShell({
    kind,
    title,
    status,
    actions = [],
    legacyBoundary,
    slots = [],
    children,
}: {
    kind: WorkspacePanelKind;
    title: string;
    status: WorkspacePanelStatus;
    actions?: WorkspacePanelRecoveryAction[];
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
                    {status === 'loading' || status === 'error' ? (
                        <span
                            className="workspace-panel-status-badge"
                            data-workspace-panel-status={status}
                        >
                            {getWorkspacePanelVisibleStatusLabel(status)}
                        </span>
                    ) : null}
                </div>
                {actions.length > 0 ? (
                    <div
                        className="workspace-panel-recovery"
                        data-workspace-panel-recovery-state={status}
                    >
                        <div className="workspace-panel-recovery-actions">
                            {actions.map(action => (
                                <button
                                    key={action.id}
                                    type="button"
                                    className="menu_button menu_button_icon"
                                    data-workspace-panel-recovery-action={action.id}
                                    onClick={action.onClick}
                                    disabled={action.disabled}
                                >
                                    {action.label}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : null}
                {children}
                {slots.length > 0 || status !== 'idle' ? (
                    <details className="workspace-panel-diagnostics" data-workspace-panel-diagnostics={kind}>
                        <summary>Diagnostics</summary>
                        <div className="flex-container flexFlowColumn gap4">
                            <div className="flex-container justifyspacebetween alignitemscenter gap8">
                                <span>Status</span>
                                <span className="workspace-panel-status-badge" data-workspace-panel-status={status}>{status}</span>
                            </div>
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
                                                <span
                                                    className="workspace-panel-legacy-slot-status"
                                                    data-workspace-panel-legacy-ready={slot.ready ? 'true' : 'false'}
                                                >
                                                    {slot.ready ? 'Ready' : 'Legacy'}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : null}
                        </div>
                    </details>
                ) : null}
            </div>
        </section>
    );
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

function asAuthoringState(state: unknown): AuthoringWorkspacePanelState {
    if (!state || typeof state !== 'object') {
        return {};
    }

    return state as AuthoringWorkspacePanelState;
}

function AuthoringWorkspacePanel({
    kind,
    state,
    bridge,
}: {
    kind: 'characterAuthoring' | 'groupAuthoring';
    state?: unknown;
    bridge?: WorkspacePanelBridge;
}) {
    const bridgeState = asAuthoringState(state);
    const title = bridgeState.title ?? (kind === 'characterAuthoring' ? 'Character Authoring' : 'Group Authoring');
    const subtitle = bridgeState.subtitle ?? (kind === 'characterAuthoring'
        ? 'React owner for character drafts'
        : 'React owner for group drafts');
    const unsupportedFields = Array.isArray(bridgeState.unsupportedFields) ? bridgeState.unsupportedFields : [];
    const initialSession = useMemo(() => kind === 'characterAuthoring'
        ? createCharacterAuthoringSession(bridgeState.draft ?? {}, { mode: bridgeState.mode ?? 'create' })
        : createGroupAuthoringSession(bridgeState.draft ?? {}, { mode: bridgeState.mode ?? 'create' }), [bridgeState.draft, bridgeState.mode, kind]);
    const [authoringSession, setAuthoringSession] = useState(initialSession);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const saveGenerationRef = useRef(0);
    const authoringActionMutation = useMutation({
        mutationFn: async ({ action, payload }: { action: string; payload?: Record<string, unknown> }) => {
            return await bridge?.dispatchAction?.(action, payload);
        },
        retry: false,
    });

    useEffect(() => {
        saveGenerationRef.current += 1;
        setAuthoringSession(initialSession);
        setFieldErrors({});
    }, [initialSession]);

    const updateDraft = useCallback((patch: Record<string, unknown>) => {
        setAuthoringSession(currentSession => currentSession.update(patch));
        setFieldErrors({});
    }, []);

    const submitDraft = useCallback(() => {
        const submitResult = authoringSession.submit();
        if (!submitResult.ok) {
            setFieldErrors((submitResult.fieldErrors ?? {}) as Record<string, string>);
            return;
        }

        setFieldErrors({});
        if (typeof submitResult.action !== 'string') {
            return;
        }
        const saveGeneration = saveGenerationRef.current;
        const submittedDraft = authoringSession.draft;
        authoringActionMutation.mutateAsync({ action: submitResult.action, payload: submitResult.payload })
            .then((result) => {
                const ok = !(result && typeof result === 'object' && 'ok' in (result as Record<string, unknown>)
                    && (result as { ok?: boolean }).ok === false);
                if (!shouldApplyCharacterAuthoringSaveResult({
                    generation: saveGeneration,
                    activeGeneration: saveGenerationRef.current,
                    ok,
                })) {
                    return;
                }
                setAuthoringSession(() => kind === 'characterAuthoring'
                    ? createCharacterAuthoringSession(submittedDraft, { mode: bridgeState.mode ?? 'create' })
                    : createGroupAuthoringSession(submittedDraft, { mode: bridgeState.mode ?? 'create' }));
            })
            .catch(() => {
                // Mutation state carries the failed status; keep the dirty draft intact for retry.
            });
    }, [authoringActionMutation, authoringSession, bridgeState.mode, kind]);

    const cancelDraft = useCallback(() => {
        saveGenerationRef.current += 1;
        setAuthoringSession(currentSession => currentSession.cancel());
        setFieldErrors({});
        authoringActionMutation.mutate({ action: 'cancelAuthoring', payload: { kind } });
    }, [authoringActionMutation, kind]);

    const draft = authoringSession.draft as Record<string, unknown>;
    const statusLabel = authoringActionMutation.isPending ? 'Saving' : authoringSession.dirty ? 'Unsaved' : 'Ready';
    const stringDraft = (key: string) => (typeof draft[key] === 'string' ? draft[key] as string : '');
    const nameValue = stringDraft('name');
    const descriptionValue = stringDraft('description');
    const firstMessageValue = stringDraft('firstMessage');
    const tagsText = Array.isArray(draft.tags)
        ? draft.tags.filter((tag): tag is string => typeof tag === 'string').join(', ')
        : '';
    const alternateGreetingsText = Array.isArray(draft.alternateGreetings)
        ? draft.alternateGreetings.filter((item): item is string => typeof item === 'string').join('\n')
        : '';
    const depthPrompt = draft.depthPrompt && typeof draft.depthPrompt === 'object'
        ? draft.depthPrompt as { prompt?: string; depth?: number | null; role?: string | number | null }
        : { prompt: '', depth: null, role: 'system' };
    const talkativenessValue = draft.talkativeness == null || draft.talkativeness === ''
        ? ''
        : String(draft.talkativeness);
    const members = Array.isArray(draft.members) ? draft.members.filter((member): member is string => typeof member === 'string') : [];
    const candidates = Array.isArray(bridgeState.candidates)
        ? bridgeState.candidates.filter(candidate => candidate && typeof candidate.id === 'string' && typeof candidate.label === 'string')
        : [];
    const groupTagIds = Array.isArray(draft.tagIds)
        ? draft.tagIds.filter((tagId): tagId is string => typeof tagId === 'string')
        : [];
    const groupTagOptions = Array.isArray(bridgeState.tagOptions)
        ? bridgeState.tagOptions.filter(tag => tag && typeof tag.id === 'string' && typeof tag.label === 'string')
        : [];
    const characterToolPayload = kind === 'characterAuthoring' ? authoringSession.submit() : null;
    const characterActionPayload = characterToolPayload && characterToolPayload.ok ? characterToolPayload.payload : undefined;
    const characterToolActionPayload = characterActionPayload ? { ...characterActionPayload, draft } : undefined;
    const isCreateMode = (bridgeState.mode ?? 'create') === 'create';
    const isActionPending = authoringActionMutation.isPending;
    const updateGroupSession = (
        update: (session: ReturnType<typeof createGroupAuthoringSession>) => ReturnType<typeof createGroupAuthoringSession>,
    ) => {
        setAuthoringSession(currentSession => update(
            currentSession as ReturnType<typeof createGroupAuthoringSession>,
        ));
        setFieldErrors({});
    };

    return (
        <WorkspacePanelShell
            kind={kind}
            title={title}
            status={authoringActionMutation.isError ? 'error' : 'success'}
        >
            <section
                className="react-authoring-panel"
                data-doc-id={kind === 'characterAuthoring'
                    ? 'feature.character_library_panel term.character_card page.chat_workspace'
                    : 'feature.group_authoring page.chat_workspace'}
                data-react-authoring-owner={kind}
                data-react-authoring-mode={bridgeState.mode ?? 'create'}
                data-react-authoring-dirty={authoringSession.dirty ? 'true' : 'false'}
            >
                <header className="react-authoring-panel-header">
                    <div>
                        <div className="react-authoring-panel-kicker">{bridgeState.mode === 'edit' ? 'Editing' : 'Creating'}</div>
                        <h3>{title}</h3>
                        <p>{subtitle}</p>
                    </div>
                    <span className="react-authoring-panel-state" aria-live="polite">
                        {statusLabel}
                    </span>
                </header>
                {unsupportedFields.length > 0 ? (
                    <div className="react-authoring-panel-warning" role="status">
                        Unsupported extension fields are preserved server-side and not edited here: {unsupportedFields.join(', ')}
                    </div>
                ) : null}
                <div className="react-authoring-panel-actions" aria-label={`${title} actions`}>
                    <button type="button" className="menu_button react-authoring-save" disabled={isActionPending} onClick={submitDraft}>Save</button>
                    <button type="button" className="menu_button react-authoring-secondary-action" disabled={isActionPending} onClick={cancelDraft}>Cancel</button>
                    {kind === 'characterAuthoring' ? (
                        <>
                            <button
                                type="button"
                                className="menu_button react-authoring-tool-action"
                                disabled={isActionPending}
                                onClick={() => authoringActionMutation.mutate({ action: 'openWorldInfo', payload: characterToolActionPayload })}
                            >
                                World Info
                            </button>
                            <button
                                type="button"
                                className="menu_button react-authoring-tool-action"
                                disabled={isActionPending}
                                onClick={() => authoringActionMutation.mutate({ action: 'openAlternateGreetings', payload: characterToolActionPayload })}
                            >
                                Alternate Greetings
                            </button>
                            <button type="button" className="menu_button react-authoring-tool-action" disabled={isActionPending} onClick={() => authoringActionMutation.mutate({ action: 'duplicateAuthoring', payload: { kind } })}>Duplicate</button>
                            <button type="button" className="menu_button react-authoring-tool-action" disabled={isActionPending} onClick={() => authoringActionMutation.mutate({ action: 'exportAuthoring', payload: characterActionPayload })}>Export</button>
                        </>
                    ) : null}
                </div>
                <fieldset
                    className="react-authoring-fields"
                    disabled={isActionPending}
                    style={{ border: 0, margin: 0, minWidth: 0, padding: 0 }}
                >
                    <label className="react-authoring-field" data-react-authoring-field="name">
                        <span>Name</span>
                        <input
                            className="text_pole"
                            value={nameValue}
                            aria-invalid={fieldErrors.name ? 'true' : 'false'}
                            onChange={(event) => updateDraft({ name: event.target.value })}
                        />
                        {fieldErrors.name ? <small role="alert">{fieldErrors.name}</small> : null}
                    </label>
                    {kind === 'characterAuthoring' ? (
                        <>
                            <label className="react-authoring-field" data-react-authoring-field="avatar">
                                <span>Avatar</span>
                                <input
                                    className="text_pole"
                                    value={stringDraft('avatar')}
                                    onChange={(event) => updateDraft({ avatar: event.target.value })}
                                    placeholder="Avatar filename"
                                />
                                <input
                                    type="file"
                                    accept="image/*"
                                    aria-label="Upload character avatar"
                                    onChange={(event) => {
                                        const file = event.target.files?.[0];
                                        const legacyInput = document.getElementById('add_avatar_button');
                                        if (file && legacyInput instanceof HTMLInputElement) {
                                            const transfer = new DataTransfer();
                                            transfer.items.add(file);
                                            legacyInput.files = transfer.files;
                                        }
                                        if (file) {
                                            updateDraft({ avatar: file.name });
                                        }
                                    }}
                                />
                            </label>
                            <label className="react-authoring-field" data-react-authoring-field="favorite">
                                <span>Favorite</span>
                                <input
                                    type="checkbox"
                                    checked={Boolean(draft.favorite)}
                                    onChange={(event) => updateDraft({ favorite: event.target.checked })}
                                />
                            </label>
                            <label className="react-authoring-field" data-react-authoring-field="description">
                                <span>Description</span>
                                <textarea
                                    className="text_pole"
                                    rows={5}
                                    value={descriptionValue}
                                    onChange={(event) => updateDraft({ description: event.target.value })}
                                />
                            </label>
                            <label className="react-authoring-field" data-react-authoring-field="firstMessage">
                                <span>First message</span>
                                <textarea
                                    className="text_pole"
                                    rows={4}
                                    value={firstMessageValue}
                                    onChange={(event) => updateDraft({ firstMessage: event.target.value })}
                                />
                            </label>
                            <label className="react-authoring-field" data-react-authoring-field="alternateGreetings">
                                <span>Alternate greetings</span>
                                <textarea
                                    className="text_pole"
                                    rows={3}
                                    value={alternateGreetingsText}
                                    onChange={(event) => updateDraft({
                                        alternateGreetings: event.target.value
                                            .split('\n')
                                            .map(line => line.trimEnd())
                                            .filter((line, index, lines) => line.length > 0 || index < lines.length - 1),
                                    })}
                                    placeholder="One greeting per line"
                                />
                            </label>
                            <label className="react-authoring-field" data-react-authoring-field="personality">
                                <span>Personality</span>
                                <textarea
                                    className="text_pole"
                                    rows={3}
                                    value={stringDraft('personality')}
                                    onChange={(event) => updateDraft({ personality: event.target.value })}
                                />
                            </label>
                            <label className="react-authoring-field" data-react-authoring-field="scenario">
                                <span>Scenario</span>
                                <textarea
                                    className="text_pole"
                                    rows={3}
                                    value={stringDraft('scenario')}
                                    onChange={(event) => updateDraft({ scenario: event.target.value })}
                                />
                            </label>
                            <label className="react-authoring-field" data-react-authoring-field="exampleMessages">
                                <span>Example messages</span>
                                <textarea
                                    className="text_pole"
                                    rows={4}
                                    value={stringDraft('exampleMessages')}
                                    onChange={(event) => updateDraft({ exampleMessages: event.target.value })}
                                />
                            </label>
                            <label className="react-authoring-field" data-react-authoring-field="systemPrompt">
                                <span>System prompt</span>
                                <textarea
                                    className="text_pole"
                                    rows={3}
                                    value={stringDraft('systemPrompt')}
                                    onChange={(event) => updateDraft({ systemPrompt: event.target.value })}
                                />
                            </label>
                            <label className="react-authoring-field" data-react-authoring-field="postHistoryInstructions">
                                <span>Post-history instructions</span>
                                <textarea
                                    className="text_pole"
                                    rows={3}
                                    value={stringDraft('postHistoryInstructions')}
                                    onChange={(event) => updateDraft({ postHistoryInstructions: event.target.value })}
                                />
                            </label>
                            <label className="react-authoring-field" data-react-authoring-field="creatorNotes">
                                <span>Creator notes</span>
                                <textarea
                                    className="text_pole"
                                    rows={3}
                                    value={stringDraft('creatorNotes')}
                                    onChange={(event) => updateDraft({ creatorNotes: event.target.value })}
                                />
                            </label>
                            <label className="react-authoring-field" data-react-authoring-field="creator">
                                <span>Creator</span>
                                <input
                                    className="text_pole"
                                    value={stringDraft('creator')}
                                    onChange={(event) => updateDraft({ creator: event.target.value })}
                                />
                            </label>
                            <label className="react-authoring-field" data-react-authoring-field="characterVersion">
                                <span>Character version</span>
                                <input
                                    className="text_pole"
                                    value={stringDraft('characterVersion')}
                                    onChange={(event) => updateDraft({ characterVersion: event.target.value })}
                                />
                            </label>
                            <label className="react-authoring-field" data-react-authoring-field="tags">
                                <span>Tags</span>
                                <input
                                    className="text_pole"
                                    value={tagsText}
                                    onChange={(event) => updateDraft({
                                        tags: event.target.value
                                            .split(',')
                                            .map(tag => tag.trim())
                                            .filter(Boolean),
                                    })}
                                    placeholder="Comma-separated tags"
                                />
                            </label>
                            <label className="react-authoring-field" data-react-authoring-field="characterWorld">
                                <span>World Info</span>
                                <input
                                    className="text_pole"
                                    value={stringDraft('characterWorld')}
                                    onChange={(event) => updateDraft({ characterWorld: event.target.value })}
                                    placeholder="Linked world file name"
                                />
                            </label>
                            <label className="react-authoring-field" data-react-authoring-field="talkativeness">
                                <span>Talkativeness</span>
                                <input
                                    className="text_pole"
                                    type="number"
                                    min={0}
                                    max={1}
                                    step={0.05}
                                    value={talkativenessValue}
                                    onChange={(event) => updateDraft({
                                        talkativeness: event.target.value === '' ? null : Number(event.target.value),
                                    })}
                                />
                            </label>
                            <label className="react-authoring-field" data-react-authoring-field="depthPrompt.prompt">
                                <span>Depth prompt</span>
                                <textarea
                                    className="text_pole"
                                    rows={3}
                                    value={depthPrompt.prompt}
                                    onChange={(event) => updateDraft({
                                        depthPrompt: { ...depthPrompt, prompt: event.target.value },
                                    })}
                                />
                            </label>
                            <label className="react-authoring-field" data-react-authoring-field="depthPrompt.depth">
                                <span>Depth</span>
                                <input
                                    className="text_pole"
                                    type="number"
                                    min={0}
                                    value={depthPrompt.depth ?? ''}
                                    onChange={(event) => updateDraft({
                                        depthPrompt: {
                                            ...depthPrompt,
                                            depth: event.target.value === '' ? null : Number(event.target.value),
                                        },
                                    })}
                                />
                            </label>
                            <label className="react-authoring-field" data-react-authoring-field="depthPrompt.role">
                                <span>Depth role</span>
                                <select
                                    className="text_pole"
                                    value={String(depthPrompt.role ?? 'system')}
                                    onChange={(event) => updateDraft({
                                        depthPrompt: { ...depthPrompt, role: event.target.value },
                                    })}
                                >
                                    <option value="system">System</option>
                                    <option value="user">User</option>
                                    <option value="assistant">Assistant</option>
                                </select>
                            </label>
                        </>
                    ) : (
                        <>
                            <label className="react-authoring-field" data-react-authoring-field="avatar">
                                <span>Avatar URL</span>
                                <input
                                    className="text_pole"
                                    value={stringDraft('avatarUrl')}
                                    onChange={(event) => updateDraft({ avatarUrl: event.target.value })}
                                />
                            </label>
                            <label className="react-authoring-field" data-react-authoring-field="groupFavorite">
                                <span>Favorite</span>
                                <input
                                    type="checkbox"
                                    checked={Boolean(draft.favorite)}
                                    onChange={(event) => updateDraft({ favorite: event.target.checked })}
                                />
                            </label>
                            <label className="react-authoring-field" data-react-authoring-field="allowSelfResponses">
                                <span>Allow self responses</span>
                                <input
                                    type="checkbox"
                                    checked={Boolean(draft.allowSelfResponses)}
                                    onChange={(event) => updateDraft({ allowSelfResponses: event.target.checked })}
                                />
                            </label>
                            <label className="react-authoring-field" data-react-authoring-field="hideMutedSprites">
                                <span>Hide muted sprites</span>
                                <input
                                    type="checkbox"
                                    checked={Boolean(draft.hideMutedSprites)}
                                    onChange={(event) => updateDraft({ hideMutedSprites: event.target.checked })}
                                />
                            </label>
                            <label className="react-authoring-field" data-react-authoring-field="activationStrategy">
                                <span>Activation strategy</span>
                                <select
                                    className="text_pole"
                                    value={String(draft.activationStrategy ?? 0)}
                                    onChange={(event) => updateDraft({ activationStrategy: Number(event.target.value) })}
                                >
                                    <option value="0">Natural</option>
                                    <option value="1">List</option>
                                    <option value="2">Manual</option>
                                    <option value="3">Pooled</option>
                                </select>
                            </label>
                            <label className="react-authoring-field" data-react-authoring-field="generationMode">
                                <span>Generation mode</span>
                                <select
                                    className="text_pole"
                                    value={String(draft.generationMode ?? 0)}
                                    onChange={(event) => updateDraft({ generationMode: Number(event.target.value) })}
                                >
                                    <option value="0">Swap</option>
                                    <option value="1">Append</option>
                                    <option value="2">Append disabled</option>
                                </select>
                            </label>
                            <label className="react-authoring-field" data-react-authoring-field="autoModeDelay">
                                <span>Auto mode delay</span>
                                <input
                                    className="text_pole"
                                    type="number"
                                    min={1}
                                    value={Number(draft.autoModeDelay ?? 5)}
                                    onChange={(event) => updateDraft({ autoModeDelay: Number(event.target.value) })}
                                />
                            </label>
                            <label className="react-authoring-field" data-react-authoring-field="joinPrefix">
                                <span>Join prefix</span>
                                <textarea
                                    className="text_pole"
                                    rows={2}
                                    value={stringDraft('joinPrefix')}
                                    onChange={(event) => updateDraft({ joinPrefix: event.target.value })}
                                />
                            </label>
                            <label className="react-authoring-field" data-react-authoring-field="joinSuffix">
                                <span>Join suffix</span>
                                <textarea
                                    className="text_pole"
                                    rows={2}
                                    value={stringDraft('joinSuffix')}
                                    onChange={(event) => updateDraft({ joinSuffix: event.target.value })}
                                />
                            </label>
                            <section className="react-authoring-tags" data-react-authoring-field="groupTags">
                                <div className="react-authoring-section-title">Tags</div>
                                <div className="react-authoring-candidates">
                                    {groupTagOptions.map(tag => (
                                        <button
                                            key={tag.id}
                                            type="button"
                                            className="menu_button"
                                            aria-pressed={groupTagIds.includes(tag.id)}
                                            onClick={() => updateGroupSession(currentSession => currentSession.update({
                                                tagIds: groupTagIds.includes(tag.id)
                                                    ? groupTagIds.filter(tagId => tagId !== tag.id)
                                                    : [...groupTagIds, tag.id],
                                            }))}
                                        >
                                            {groupTagIds.includes(tag.id) ? 'Remove' : 'Add'} {tag.label}
                                        </button>
                                    ))}
                                </div>
                            </section>
                        <section className="react-authoring-members" data-react-authoring-members>
                            <div className="react-authoring-section-title">Members</div>
                            {fieldErrors.members ? <small role="alert">{fieldErrors.members}</small> : null}
                            {members.map((member, index) => (
                                <div className="react-authoring-member-row" key={member}>
                                    <span>{index + 1}. {member}</span>
                                    <button
                                        type="button"
                                        className="menu_button"
                                        data-react-authoring-action="remove-member"
                                        aria-label={`Remove ${member}`}
                                        onClick={() => updateGroupSession(currentSession => currentSession.removeMember(member))}
                                    >
                                        Remove
                                    </button>
                                    <button
                                        type="button"
                                        className="menu_button"
                                        data-react-authoring-action="move-up"
                                        aria-label={`Move ${member} up`}
                                        disabled={index === 0}
                                        onClick={() => updateGroupSession(currentSession => currentSession.moveMember(member, 'up'))}
                                    >
                                        Move up
                                    </button>
                                    <button
                                        type="button"
                                        className="menu_button"
                                        data-react-authoring-action="move-down"
                                        aria-label={`Move ${member} down`}
                                        disabled={index === members.length - 1}
                                        onClick={() => updateGroupSession(currentSession => currentSession.moveMember(member, 'down'))}
                                    >
                                        Move down
                                    </button>
                                </div>
                            ))}
                            <div className="react-authoring-candidates" data-react-authoring-candidates>
                                <div className="react-authoring-section-title">Add members</div>
                                {candidates.length > 0 ? candidates.map(candidate => (
                                    <button
                                        key={candidate.id}
                                        type="button"
                                        className="menu_button react-authoring-candidate"
                                        data-react-authoring-action="add-member"
                                        onClick={() => updateGroupSession(currentSession => currentSession.addMember(candidate.id))}
                                    >
                                        Add {candidate.label}
                                    </button>
                                )) : (
                                    <small>No available candidates</small>
                                )}
                            </div>
                        </section>
                        </>
                    )}
                </fieldset>
                {!isCreateMode ? (
                    <div className="react-authoring-danger-zone">
                        <button type="button" className="menu_button red_button" disabled={isActionPending} onClick={() => authoringActionMutation.mutate({ action: 'deleteAuthoring', payload: { kind } })}>Delete</button>
                    </div>
                ) : null}
            </section>
        </WorkspacePanelShell>
    );
}

function getWorldInfoPanelStatus(bridgeState: WorldInfoWorkspacePanelState): WorkspacePanelStatus {
    return getWorldInfoWorkbenchPanelStatus(bridgeState);
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

function WorldInfoWorkspacePanel({ state, bridge }: { state?: unknown; bridge?: WorkspacePanelBridge }) {
    const bridgeState = asWorldInfoState(state);
    return (
        <WorldInfoWorkbenchPanel
            state={state}
            bridge={bridge}
            shell={({ status, recoveryActions, children }) => (
                <WorkspacePanelShell
                    kind="worldInfo"
                    title="世界书"
                    status={status}
                    actions={recoveryActions}
                    legacyBoundary="activation-import-regex-prompt-delete"
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
                <span>{source === 'global' ? '全局背景' : '聊天背景'}</span>
                <span>{items.length}</span>
            </div>
            {items.length > 0 ? items.map(item => (
                <div
                    key={`${source}:${item.id}`}
                    className="workspace-panel-background-item"
                    data-background-library-react-item={item.id}
                >
                    <div
                        className="workspace-panel-background-preview"
                        style={{ backgroundImage: item.url }}
                        aria-hidden="true"
                    />
                    <div className="workspace-panel-background-details">
                        <button
                            type="button"
                            className="menu_button workspace-panel-item-row"
                            data-background-library-react-item-select={item.id}
                            onClick={() => actionMutation.mutate({ action: 'selectBackground', payload: { id: item.id, source } })}
                        >
                            <span className="workspace-panel-item-label">{item.title}</span>
                            <span className="workspace-panel-item-status">{item.locked ? '已锁定' : item.selected ? '已选择' : item.animated ? '动态背景' : '选择'}</span>
                        </button>
                        <div className="flex-container flexwrap gap4">
                            <button
                                type="button"
                                className="menu_button"
                                data-background-library-react-item-action="rename"
                                onClick={() => {
                                    const nextName = globalThis.prompt?.(`重命名 ${item.title}`, item.title);
                                    if (!nextName) {
                                        return;
                                    }
                                    actionMutation.mutate({
                                        action: 'renameBackground',
                                        payload: { id: item.id, nextName, source },
                                    });
                                }}
                            >
                                重命名
                            </button>
                            <button
                                type="button"
                                className="menu_button red_button"
                                data-background-library-react-item-action="delete"
                                onClick={() => {
                                    const confirmed = globalThis.confirm?.(`删除 ${item.title}？`);
                                    if (!confirmed) {
                                        return;
                                    }
                                    actionMutation.mutate({
                                        action: 'deleteBackground',
                                        payload: { id: item.id, source, deleteFromServer: source === 'chat' },
                                    });
                                }}
                            >
                                删除
                            </button>
                        </div>
                    </div>
                </div>
            )) : (
                <span className="opacity50">暂无背景</span>
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
    const systemBackgrounds = bridgeState.systemBackgrounds ?? [];
    const chatBackgrounds = bridgeState.chatBackgrounds ?? [];
    const recoveryActions: WorkspacePanelRecoveryAction[] = [];

    useEffect(() => {
        backgroundLibraryForm.reset(formDefaults);
    }, [backgroundLibraryForm, formDefaults]);

    if (status === 'empty') {
        recoveryActions.push({
            id: 'upload-background',
            label: '上传背景',
            onClick: () => backgroundLibraryActionMutation.mutate({
                action: 'uploadBackground',
                payload: { source: 'global' },
            }),
        });
    }

    if (status === 'empty' || status === 'error') {
        recoveryActions.push({
            id: 'refresh-backgrounds',
            label: '刷新面板',
            onClick: () => backgroundLibraryActionMutation.mutate({ action: 'refreshBackgrounds' }),
        });
    }

    return (
        <WorkspacePanelShell
            kind="backgroundLibrary"
            title="背景"
            status={status}
            actions={recoveryActions}
            legacyBoundary="service-owned-catalog-actions"
            slots={[
                { id: 'global-gallery', label: 'Global gallery', ready: bridgeState.systemContainerPresent },
                { id: 'chat-gallery', label: 'Chat gallery', ready: bridgeState.chatContainerPresent },
                { id: 'background-actions', label: 'Background actions', ready: bridgeState.systemContainerPresent || bridgeState.chatContainerPresent },
            ]}
        >
            <div className="flex-container flexFlowColumn gap8" data-background-library-react-workflow="gallery-actions">
                <div className="flex-container flexwrap gap8 alignitemscenter">
                    <output>文件夹视图：{bridgeState.folderViewActive ? '开' : '关'}</output>
                    {bridgeState.folderViewActive ? (
                        <button
                            type="button"
                            className="menu_button"
                            data-background-library-react-action="exit-folder"
                            onClick={() => backgroundLibraryActionMutation.mutate({ action: 'exitFolder' })}
                        >
                            返回文件夹
                        </button>
                    ) : null}
                    <output>已锁定：{bridgeState.lockedCount ?? 0}</output>
                    <output>已选择：{bridgeState.selectedCount ?? 0}</output>
                </div>
                <div className="flex-container flexwrap gap8 alignitemscenter">
                    <backgroundLibraryForm.Field name="filterQuery">
                        {field => (
                            <input
                                className="text_pole textarea_compact"
                                type="search"
                                data-background-library-react-control="filter"
                                aria-label="搜索背景"
                                placeholder="搜索背景"
                                value={field.state.value}
                                onChange={event => {
                                    const filterQuery = event.target.value;
                                    field.handleChange(filterQuery);
                                    backgroundLibraryActionMutation.mutate({ action: 'applyBackgroundFilter', payload: { filterQuery } });
                                }}
                            />
                        )}
                    </backgroundLibraryForm.Field>
                    <backgroundLibraryForm.Field name="sortValue">
                        {field => (
                            <select
                                className="text_pole textarea_compact"
                                data-background-library-react-control="sort"
                                aria-label="背景排序"
                                value={field.state.value}
                                onChange={event => {
                                    const sortValue = event.target.value;
                                    field.handleChange(sortValue);
                                    backgroundLibraryActionMutation.mutate({ action: 'applyBackgroundSort', payload: { sortValue } });
                                }}
                            >
                                <option value="az">A-Z</option>
                                <option value="za">Z-A</option>
                                <option value="newest">最新</option>
                                <option value="oldest">最旧</option>
                            </select>
                        )}
                    </backgroundLibraryForm.Field>
                </div>
                <div className="flex-container flexwrap gap8 alignitemscenter workspace-panel-background-actions">
                    <button
                        type="button"
                        className="menu_button"
                        data-background-library-react-action="upload-global"
                        onClick={() => backgroundLibraryActionMutation.mutate({
                            action: 'uploadBackground',
                            payload: { source: 'global' },
                        })}
                    >
                            上传全局背景
                    </button>
                    <button
                        type="button"
                        className="menu_button"
                        data-background-library-react-action="upload-chat"
                        onClick={() => backgroundLibraryActionMutation.mutate({
                            action: 'uploadBackground',
                            payload: { source: 'chat' },
                        })}
                    >
                            上传聊天背景
                    </button>
                    <button
                        type="button"
                        className="menu_button"
                        data-background-library-react-action="lock"
                        onClick={() => backgroundLibraryActionMutation.mutate({ action: 'lockBackground' })}
                    >
                            锁定
                    </button>
                    <button
                        type="button"
                        className="menu_button"
                        data-background-library-react-action="unlock"
                        onClick={() => backgroundLibraryActionMutation.mutate({ action: 'unlockBackground' })}
                    >
                            解锁
                    </button>
                    <button
                        type="button"
                        className="menu_button"
                        data-background-library-react-action="auto"
                        onClick={() => backgroundLibraryActionMutation.mutate({ action: 'autoBackground' })}
                    >
                            自动选择
                    </button>
                    <button
                        type="button"
                        className="menu_button"
                        data-background-library-react-action="refresh"
                        onClick={() => backgroundLibraryActionMutation.mutate({ action: 'refreshBackgrounds' })}
                    >
                            刷新
                    </button>
                </div>
                {!bridgeState.folderViewActive && Array.isArray(bridgeState.folders) && bridgeState.folders.length > 0 ? (
                    <div className="flex-container flexFlowColumn gap4" data-background-library-react-folders="root">
                        <span>文件夹</span>
                        {bridgeState.folders.map(folder => (
                            <button
                                key={folder.id}
                                type="button"
                                className="menu_button workspace-panel-item-row"
                                data-background-library-react-folder={folder.id}
                                onClick={() => backgroundLibraryActionMutation.mutate({
                                    action: 'enterFolder',
                                    payload: { folderId: folder.id },
                                })}
                            >
                                <span className="workspace-panel-item-label">{folder.name}</span>
                            </button>
                        ))}
                    </div>
                ) : null}
                <BackgroundGallery source="global" items={systemBackgrounds} actionMutation={backgroundLibraryActionMutation} />
                <BackgroundGallery source="chat" items={chatBackgrounds} actionMutation={backgroundLibraryActionMutation} />
            </div>
        </WorkspacePanelShell>
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
    useEffect(() => {
        extensionsHostForm.reset(formDefaults);
    }, [extensionsHostForm, formDefaults]);
    // Claim stable compatibility slots outside the React tree so unmount does not
    // destroy extension content. Re-entry keeps the same DOM nodes and children.
    useLayoutEffect(() => {
        void bridge?.dispatchAction?.('ensureExtensionCompatibilitySlots', {
            owner: 'react-extensions-host',
        });
    }, [bridge]);
    const recoveryActions: WorkspacePanelRecoveryAction[] = [];

    if (status === 'empty') {
        recoveryActions.push({
            id: 'install-extension',
            label: 'Install extension',
            disabled: !bridgeState.installButtonPresent,
            onClick: () => extensionsHostActionMutation.mutate({ action: 'openInstallExtension' }),
        });
    }

    if (status === 'empty' || status === 'error') {
        recoveryActions.push({
            id: 'open-manage-extensions',
            label: 'Open manage',
            disabled: !bridgeState.manageButtonPresent,
            onClick: () => extensionsHostActionMutation.mutate({ action: 'openManageExtensions' }),
        });
    }

    if (status === 'error' || bridgeState.deferredState === 'failed') {
        recoveryActions.push({
            id: 'retry-deferred-extensions',
            label: 'Retry extensions',
            onClick: () => extensionsHostActionMutation.mutate({ action: 'retryDeferredExtensions' }),
        });
        recoveryActions.push({
            id: 'connect-extras-api',
            label: 'Retry connection',
            disabled: !bridgeState.extrasApiControlsPresent,
            onClick: () => extensionsHostActionMutation.mutate({ action: 'connectExtrasApi' }),
        });
    }

    return (
        <WorkspacePanelShell
            kind="extensionsHost"
            title="Extensions"
            status={status}
            actions={recoveryActions}
            legacyBoundary="react-owned-slots-lifecycle"
            slots={[
                { id: 'extensions-settings', label: 'Settings column', ready: bridgeState.extensionsSettingsPresent },
                { id: 'extensions-settings2', label: 'Settings column 2', ready: bridgeState.extensionsSettings2Present },
                { id: 'regex-container', label: 'Regex container', ready: bridgeState.regexContainerPresent },
                { id: 'extensions-menu-button', label: 'Wand button', ready: bridgeState.extensionsMenuButtonPresent },
                { id: 'extensions-menu', label: 'Wand menu', ready: bridgeState.extensionsMenuPresent },
                { id: 'extras-api', label: 'Extras API', ready: bridgeState.extrasApiControlsPresent },
            ]}
        >
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
                    <extensionsHostForm.Field name="extrasApiUrl">
                        {field => (
                            <input
                                className="text_pole textarea_compact"
                                type="url"
                                data-extensions-host-react-control="extras-url"
                                aria-label="Extras API URL"
                                value={field.state.value}
                                onChange={event => {
                                    const url = event.target.value;
                                    field.handleChange(url);
                                    extensionsHostActionMutation.mutate({ action: 'updateExtrasApiUrl', payload: { url } });
                                }}
                            />
                        )}
                    </extensionsHostForm.Field>
                    <extensionsHostForm.Field name="extrasApiKey">
                        {field => (
                            <input
                                className="text_pole textarea_compact"
                                type="password"
                                data-extensions-host-react-control="extras-api-key"
                                aria-label="Extras API key"
                                placeholder={bridgeState.extrasApiKeySet ? 'Saved key' : 'Extras API key'}
                                value={field.state.value}
                                onChange={event => {
                                    const apiKey = event.target.value;
                                    field.handleChange(apiKey);
                                    extensionsHostActionMutation.mutate({ action: 'updateExtrasApiKey', payload: { apiKey } });
                                }}
                            />
                        )}
                    </extensionsHostForm.Field>
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
                    <output>{bridgeState.extrasStatusText || 'Not connected...'}</output>
                </div>
                {/* Protected mount IDs remain in established drawer DOM under React lifecycle
                    (ensureExtensionCompatibilitySlots). Do not render empty React placeholders
                    for those IDs — reparenting into React would destroy extension content on unmount. */}
                <div
                    className="flex-container flexFlowColumn gap8"
                    data-extensions-host-react-workflow="compatibility-slots"
                    data-extensions-host-compat-owner="react-lifecycle"
                    aria-hidden="true"
                />
            </div>
        </WorkspacePanelShell>
    );
}

function MainChatShowMoreOwnerPortal({
    showMoreNode,
    bridge,
}: {
    showMoreNode: HTMLElement | null | undefined;
    bridge?: WorkspacePanelBridge;
}) {
    useLayoutEffect(() => {
        if (!(showMoreNode instanceof HTMLElement) || !showMoreNode.isConnected) {
            return;
        }

        const handleClick = (event: MouseEvent) => {
            event.preventDefault();
            event.stopImmediatePropagation();
            event.stopPropagation();
            void bridge?.dispatchAction?.('loadMoreMessages', {});
        };

        showMoreNode.dataset.mainChatWindowingOwner = 'react';
        showMoreNode.dataset.mainChatLoadMoreOwner = 'react';
        showMoreNode.addEventListener('click', handleClick, true);

        return () => {
            showMoreNode.removeEventListener('click', handleClick, true);
            delete showMoreNode.dataset.mainChatWindowingOwner;
            delete showMoreNode.dataset.mainChatLoadMoreOwner;
        };
    }, [bridge, showMoreNode]);

    if (!(showMoreNode instanceof HTMLElement)) {
        return null;
    }

    return (
        <div hidden aria-hidden="true" data-main-chat-show-more-owner="react" />
    );
}

function MainChatMessageListRestoreController({
    state,
    bridge,
}: {
    state: MainChatMessageListWorkspacePanelState;
    bridge?: WorkspacePanelBridge;
}) {
    const chatContainerRef = useRef<HTMLElement | null>(state.chatContainer ?? null);
    const stateRef = useRef(state);
    const bridgeRef = useRef(bridge);
    const initialSnapshotRef = useRef<MainChatMessageListScrollSnapshot | null>(
        state.chatId ? mainChatMessageListScrollSnapshots.get(state.chatId) ?? null : null,
    );
    const previousFirstMessageIdRef = useRef(state.firstMessageId ?? '');
    const previousMessageCountRef = useRef(state.messageCount ?? 0);
    const expandedHistoryWindowRequestedRef = useRef(false);
    const restoreAttemptedRef = useRef(false);
    const messageIds = state.visibleMessageIds ?? [];
    const isPrependingHistoryWindow = Boolean(
        previousFirstMessageIdRef.current
        && state.firstMessageId
        && previousFirstMessageIdRef.current !== state.firstMessageId
        && (state.messageCount ?? 0) > previousMessageCountRef.current,
    );
    const shouldAnchorPrependedHistoryWindow = expandedHistoryWindowRequestedRef.current && isPrependingHistoryWindow;

    useLayoutEffect(() => {
        syncMainChatVirtualIndexes(state.messageNodes ?? []);
    }, [state.messageNodes, state.visibleMessageIds]);

    const virtualizer = useVirtualizer<HTMLElement, HTMLElement>({
        count: messageIds.length,
        enabled: Boolean(state.chatId && state.chatContainer instanceof HTMLElement && messageIds.length > 0),
        getScrollElement: () => chatContainerRef.current,
        estimateSize: () => getMainChatEstimatedRowHeight(initialSnapshotRef.current),
        getItemKey: (index) => messageIds[index] ?? index,
        indexAttribute: MAIN_CHAT_VIRTUAL_INDEX_ATTRIBUTE,
        measureElement,
        initialOffset: state.scrollTop ?? 0,
        initialMeasurementsCache: initialSnapshotRef.current?.measurements ?? [],
        anchorTo: shouldAnchorPrependedHistoryWindow ? 'start' : 'end',
        scrollEndThreshold: MAIN_CHAT_SCROLL_RESTORE_THRESHOLD_PX,
        overscan: 0,
        useFlushSync: false,
        onChange: (instance, sync) => {
            if (!sync) {
                persistMainChatMessageListScrollSnapshot(stateRef.current, instance);
            }
        },
    });
    virtualizer.shouldAdjustScrollPositionOnItemSizeChange = () => false;

    useLayoutEffect(() => {
        stateRef.current = state;
        chatContainerRef.current = state.chatContainer ?? null;
        bridgeRef.current = bridge;
    }, [bridge, state]);

    useEffect(() => {
        previousFirstMessageIdRef.current = state.firstMessageId ?? '';
        previousMessageCountRef.current = state.messageCount ?? 0;
    }, [state.firstMessageId, state.messageCount]);

    useLayoutEffect(() => {
        const chatContainer = state.chatContainer;
        if (!(chatContainer instanceof HTMLElement)) {
            return;
        }

        let frameId = 0;
        const persistOnNextFrame = () => {
            if (frameId !== 0) {
                return;
            }

            frameId = requestAnimationFrame(() => {
                frameId = 0;
                persistMainChatMessageListScrollSnapshot(stateRef.current, virtualizer);
            });
        };

        chatContainer.addEventListener('scroll', persistOnNextFrame, { passive: true });
        return () => {
            if (frameId !== 0) {
                cancelAnimationFrame(frameId);
            }
            chatContainer.removeEventListener('scroll', persistOnNextFrame);
        };
    }, [state.chatContainer, virtualizer]);

    useEffect(() => {
        let cancelled = false;

        const waitForPaint = async () => {
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        };

        const measureRenderedRows = () => {
            const chatContainer = stateRef.current.chatContainer;
            if (!(chatContainer instanceof HTMLElement)) {
                return [];
            }

            const messageNodes = getMainChatRenderableMessageNodes(chatContainer);
            virtualizer.measureElement(null);
            syncMainChatVirtualIndexes(messageNodes);
            for (const messageNode of messageNodes) {
                virtualizer.measureElement(messageNode);
            }
            virtualizer.measure();
            return messageNodes;
        };

        const restoreSnapshot = async () => {
            const chatId = state.chatId?.trim();
            const chatContainer = state.chatContainer;
            if (!chatId || !(chatContainer instanceof HTMLElement)) {
                return;
            }

            await waitForPaint();
            if (cancelled) {
                return;
            }

            let messageNodes = measureRenderedRows();
            if (restoreAttemptedRef.current) {
                persistMainChatMessageListScrollSnapshot(stateRef.current, virtualizer);
                return;
            }

            const snapshot = initialSnapshotRef.current;
            if (!snapshot) {
                persistMainChatMessageListScrollSnapshot(stateRef.current, virtualizer);
                return;
            }

            const currentFirstMessageId = getMainChatMessageId(messageNodes[0]);
            if (
                shouldRestoreExpandedMainChatWindow(snapshot, currentFirstMessageId)
                && !expandedHistoryWindowRequestedRef.current
            ) {
                expandedHistoryWindowRequestedRef.current = true;
                await bridgeRef.current?.dispatchAction?.('loadMoreUntilMessage', {
                    anchorMessageId: snapshot.firstRenderedMessageId || snapshot.anchorMessageId,
                });
                return;
            }

            restoreAttemptedRef.current = true;
            // Read the snapshot captured at mount so early virtualizer measurement
            // cannot overwrite the restore target for this chat re-entry.
            const anchorRow = messageNodes.find((node) => getMainChatMessageId(node) === snapshot.anchorMessageId);
            if (!anchorRow) {
                mainChatMessageListScrollSnapshots.delete(chatId);
                persistMainChatMessageListScrollSnapshot(stateRef.current, virtualizer);
                return;
            }

            if (snapshot.wasNearBottom) {
                chatContainer.scrollTop = chatContainer.scrollHeight;
            } else {
                const chatRect = chatContainer.getBoundingClientRect();
                const currentAnchorViewportOffset = anchorRow.getBoundingClientRect().top - chatRect.top;
                const anchorViewportOffset = Number.isFinite(snapshot.anchorViewportOffset)
                    ? Number(snapshot.anchorViewportOffset)
                    : null;
                const targetScrollTop = anchorViewportOffset === null
                    ? snapshot.scrollOffset
                    : Math.max(chatContainer.scrollTop + currentAnchorViewportOffset - anchorViewportOffset, 0);
                chatContainer.scrollTop = targetScrollTop;
            }

            await waitForPaint();
            if (!cancelled) {
                persistMainChatMessageListScrollSnapshot(stateRef.current, virtualizer);
            }
        };

        void restoreSnapshot();
        return () => {
            cancelled = true;
        };
    }, [state.chatContainer, state.chatId, state.firstMessageId, state.lastMessageId, state.messageCount, virtualizer]);

    return null;
}

function MainChatMessageListWorkspacePanel({ state, bridge }: { state?: unknown; bridge?: WorkspacePanelBridge }) {
    const bridgeState = asMainChatMessageListState(state);
    const [reactVisibleTransportRuntime, setReactVisibleTransportRuntime] = useState<MainChatVisibleTransportRuntimeState | null>(null);
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
    const ownedMessageRowSnapshots = useMemo(() => {
        return (bridgeState.messageRowSnapshots ?? []).filter(snapshot => canReactOwnMainChatMessageRow(
            messageRowMap.get(snapshot.messageId),
            snapshot,
        ));
    }, [bridgeState.messageRowSnapshots, messageRowMap]);
    const ownedMessageRowIds = useMemo(() => {
        return new Set(ownedMessageRowSnapshots.map(snapshot => snapshot.messageId));
    }, [ownedMessageRowSnapshots]);
    const ownedRichBodySnapshots = useMemo(() => {
        return (bridgeState.richBodySnapshots ?? []).filter(snapshot => canReactOwnMainChatRichBody(
            messageRowMap.get(snapshot.messageId),
            snapshot,
        ));
    }, [bridgeState.richBodySnapshots, messageRowMap]);
    const ownedActionSnapshots = useMemo(() => {
        return (bridgeState.messageActionSnapshots ?? []).filter(snapshot => (
            canReactOwnMainChatMessageActions(
                messageRowMap.get(snapshot.messageId),
                snapshot,
            )
        ));
    }, [bridgeState.messageActionSnapshots, messageRowMap]);
    const visibleTransportMutation = useMutation({
        mutationFn: async (payload: { kind: string; messageId?: number }) => {
            return await bridge?.dispatchAction?.('triggerVisibleGeneration', payload);
        },
        retry: false,
        onSettled: () => {
            scheduleMainChatVisibleTransportRuntimeSettle(setReactVisibleTransportRuntime);
        },
    });

    const rawActiveRuntimeMessageRow = getMainChatActiveRuntimeMessageRow(
        messageRowMap,
        reactVisibleTransportRuntime?.activeMessageId,
    );
    const shouldIgnoreVisibleTransportRuntime = Boolean(
        reactVisibleTransportRuntime?.activeMessageId !== null
        && reactVisibleTransportRuntime?.activeMessageId !== undefined
        && ![
            'connecting',
            'streaming',
            'finalizing',
            'recoveringPrimary',
            'recoveringFallback',
        ].includes(String(reactVisibleTransportRuntime.phase ?? ''))
        && !(rawActiveRuntimeMessageRow instanceof HTMLElement),
    );
    const effectiveReactVisibleTransportRuntime = shouldIgnoreVisibleTransportRuntime
        ? null
        : reactVisibleTransportRuntime;
    const activeRuntimeMessageRow = shouldIgnoreVisibleTransportRuntime ? null : rawActiveRuntimeMessageRow;
    const activeRuntimeMessageId = effectiveReactVisibleTransportRuntime?.activeMessageId;
    const effectiveGenerationControl = buildReactOwnedMainChatGenerationControl(
        effectiveReactVisibleTransportRuntime,
        bridgeState.generationControl ?? mainChatGenerationControlFallback,
    );
    const effectiveStreamingTransport = buildReactOwnedMainChatStreamingTransport(
        effectiveReactVisibleTransportRuntime,
        bridgeState.streamingTransport ?? mainChatStreamingTransportFallback,
    );
    const mainChatLocalStatus = getMainChatLocalStatus(bridgeState, effectiveGenerationControl);
    const mainChatLocalStatusLabel = getMainChatLocalStatusLabel(mainChatLocalStatus, effectiveGenerationControl);

    useEffect(() => {
        syncMainChatMessageListDom(
            bridgeState.chatContainer ?? null,
            bridgeState.host ?? null,
            bridgeState.messageNodes ?? [],
            bridgeState.showMoreNode ?? null,
        );
    }, [bridgeState]);

    useLayoutEffect(() => {
        return syncMainChatLayoutShellDom(
            bridgeState,
            mainChatLocalStatus,
            mainChatLocalStatusLabel,
        );
    }, [bridgeState, mainChatLocalStatus, mainChatLocalStatusLabel]);

    return (
        <>
            <div
                hidden
                data-main-chat-message-list-controller="true"
                data-main-chat-message-list-status={bridgeState.hasChatContainer ? 'ready' : 'missing'}
                data-main-chat-layout-owner="react"
                data-main-chat-layout-status={bridgeState.hasChatContainer ? 'success' : 'loading'}
                data-main-chat-local-status={mainChatLocalStatus}
                data-main-chat-local-status-label={mainChatLocalStatusLabel}
                data-main-chat-generation-control-phase={effectiveGenerationControl.phase ?? 'idle'}
                data-main-chat-generation-control-retry={effectiveGenerationControl.failureRetryVisible ? 'visible' : 'hidden'}
                data-main-chat-composer-length={bridgeState.composer?.valueLength ?? 0}
                data-main-chat-composer-empty={bridgeState.composer?.isEmpty ? 'true' : 'false'}
                data-main-chat-composer-can-submit={bridgeState.composer?.canSubmit ? 'true' : 'false'}
                data-main-chat-composer-focused={bridgeState.composer?.isFocused ? 'true' : 'false'}
                data-main-chat-composer-disabled={bridgeState.composer?.isDisabled ? 'true' : 'false'}
                data-main-chat-composer-generating={bridgeState.composer?.isGenerating ? 'true' : 'false'}
                data-main-chat-composer-context={bridgeState.composer?.activeContext ?? 'none'}
                data-main-chat-slash-command-active={bridgeState.slashCommand?.active ? 'true' : 'false'}
                data-main-chat-slash-command-query-length={bridgeState.slashCommand?.queryLength ?? 0}
                data-main-chat-slash-command-autocomplete={bridgeState.slashCommand?.autocompleteVisible ? 'visible' : 'hidden'}
                data-main-chat-slash-command-executing={bridgeState.slashCommand?.executing ? 'true' : 'false'}
                data-main-chat-slash-command-paused={bridgeState.slashCommand?.paused ? 'true' : 'false'}
                data-main-chat-slash-command-aborted={bridgeState.slashCommand?.aborted ? 'true' : 'false'}
                data-main-chat-slash-command-error={bridgeState.slashCommand?.errorLabel ?? ''}
                data-main-chat-streaming-transport-phase={effectiveStreamingTransport.phase ?? 'idle'}
                data-main-chat-streaming-transport-tokens={effectiveStreamingTransport.observedTokenCount ?? 0}
                data-main-chat-streaming-transport-message-id={effectiveStreamingTransport.activeMessageId ?? ''}
                data-main-chat-streaming-transport-fallback={effectiveStreamingTransport.fromFallbackAttempt ? 'true' : 'false'}
                data-main-chat-windowing-owner={bridgeState.windowingContract?.windowingOwner ?? 'legacy'}
                data-main-chat-windowing-load-more-owner={bridgeState.windowingContract?.loadMoreOwner ?? 'legacy'}
                data-main-chat-windowing-restore-owner={bridgeState.windowingContract?.restoreOwner ?? 'legacy'}
                data-main-chat-windowing-fallback={bridgeState.windowingContract?.fallback ?? 'legacy'}
                data-main-chat-windowing-reason={bridgeState.windowingContract?.reason ?? 'unknown'}
                data-main-chat-row-lifecycle-owner={bridgeState.rowLifecycleContract?.lifecycleOwner ?? 'legacy'}
                data-main-chat-row-lifecycle-editing-owner={bridgeState.rowLifecycleContract?.editingOwner ?? 'legacy'}
                data-main-chat-row-lifecycle-streaming-owner={bridgeState.rowLifecycleContract?.streamingOwner ?? 'legacy'}
                data-main-chat-row-lifecycle-unsafe-owner={bridgeState.rowLifecycleContract?.unsafeOwner ?? 'legacy'}
                data-main-chat-row-lifecycle-extension-owner={bridgeState.rowLifecycleContract?.extensionMutatedOwner ?? 'legacy'}
            />
            <MainChatMessageListRestoreController key={bridgeState.chatId || 'main-chat-empty'} state={bridgeState} bridge={bridge} />
            <MainChatShowMoreOwnerPortal showMoreNode={bridgeState.showMoreNode} bridge={bridge} />
            <MainChatComposerOwnerPortal
                state={bridgeState}
                bridge={bridge}
                onVisibleGeneration={async (payload) => {
                    if (visibleTransportMutation.isPending) {
                        return;
                    }

                    const messageId = Number(payload.messageId);
                    await visibleTransportMutation.mutateAsync({
                        kind: String(payload.kind ?? ''),
                        messageId: Number.isInteger(messageId) && messageId >= 0 ? messageId : undefined,
                    });
                }}
            />
            <MainChatLayoutStatusPortal
                state={bridgeState}
                status={mainChatLocalStatus}
                label={mainChatLocalStatusLabel}
                bridge={bridge}
                generationControl={effectiveGenerationControl}
            />
            <MainChatSlashUiPortal state={bridgeState} bridge={bridge} />
            {effectiveReactVisibleTransportRuntime && activeRuntimeMessageRow instanceof HTMLElement ? (
                <MainChatActiveTransportRowOwnerPortal
                    runtime={effectiveReactVisibleTransportRuntime}
                    messageRow={activeRuntimeMessageRow}
                    finalizedRowOwned={ownedMessageRowIds.has(String(effectiveReactVisibleTransportRuntime.activeMessageId ?? ''))}
                />
            ) : null}
            {ownedMessageRowSnapshots.map(snapshot => {
                const messageRow = messageRowMap.get(snapshot.messageId);
                if (!(messageRow instanceof HTMLElement)) {
                    return null;
                }

                return createPortal(
                    <MainChatMessageRowOwnerPortal messageRow={messageRow} snapshot={snapshot} bridge={bridge} />,
                    messageRow,
                    `main-chat-message-row-owner-${snapshot.messageId}`,
                );
            })}
            {ownedRichBodySnapshots.map(snapshot => {
                if (snapshot.messageId === String(activeRuntimeMessageId ?? '')) {
                    return null;
                }

                const messageRow = messageRowMap.get(snapshot.messageId);
                if (!(messageRow instanceof HTMLElement)) {
                    return null;
                }

                return createPortal(
                    <MainChatRichBodyOwnerPortal messageRow={messageRow} snapshot={snapshot} />,
                    messageRow.querySelector('.mes_block') as HTMLElement,
                    `main-chat-rich-body-owner-${snapshot.messageId}`,
                );
            })}
            {ownedActionSnapshots.map(snapshot => {
                const messageRow = messageRowMap.get(snapshot.messageId);
                const targets = messageRow instanceof HTMLElement ? getMainChatMessageActionsRowTargets(messageRow) : null;
                if (!(messageRow instanceof HTMLElement) || !targets) {
                    return null;
                }

                return createPortal(
                    <MainChatMessageActionsOwnerPortal messageRow={messageRow} snapshot={snapshot} bridge={bridge} />,
                    targets.messageButtons,
                    `main-chat-message-actions-owner-${snapshot.messageId}`,
                );
            })}
        </>
    );
}

function syncMainChatMessageListDom(
    chatContainer: HTMLElement | null,
    host: HTMLElement | null,
    _messageNodes: HTMLElement[],
    _showMoreNode: HTMLElement | null,
) {
    if (!(chatContainer instanceof HTMLElement) || !(host instanceof HTMLElement) || host.parentElement !== chatContainer) {
        return;
    }

    host.hidden = true;
    host.setAttribute('aria-hidden', 'true');

    if (chatContainer.firstChild !== host) {
        chatContainer.insertBefore(host, chatContainer.firstChild);
    }
}

function syncMainChatLayoutShellDom(
    state: MainChatMessageListWorkspacePanelState,
    status: MainChatLayoutStatus,
    label: string,
) {
    const chatContainer = state.chatContainer;
    const sendForm = state.sendForm;
    const nonQrFormItems = state.nonQrFormItems;
    const layoutTargets: HTMLElement[] = [];

    if (chatContainer instanceof HTMLElement) {
        chatContainer.dataset.mainChatLayoutOwner = 'react';
        chatContainer.dataset.mainChatLayoutStatus = state.hasChatContainer ? 'success' : 'loading';
        chatContainer.dataset.mainChatLocalStatus = status;
        chatContainer.dataset.mainChatLocalStatusLabel = label;
        layoutTargets.push(chatContainer);
    }

    if (sendForm instanceof HTMLElement) {
        sendForm.dataset.mainChatLayoutOwner = 'react';
        sendForm.dataset.mainChatLayoutStatus = state.hasChatContainer ? 'success' : 'loading';
        sendForm.dataset.mainChatLocalStatus = status;
        sendForm.dataset.mainChatLocalStatusLabel = label;
        layoutTargets.push(sendForm);
    }

    if (nonQrFormItems instanceof HTMLElement) {
        nonQrFormItems.dataset.mainChatLayoutOwner = 'react';
        nonQrFormItems.dataset.mainChatLayoutStatus = state.hasChatContainer ? 'success' : 'loading';
        nonQrFormItems.dataset.mainChatLocalStatus = status;
        nonQrFormItems.dataset.mainChatLocalStatusLabel = label;
        layoutTargets.push(nonQrFormItems);
    }

    return () => {
        for (const target of layoutTargets) {
            delete target.dataset.mainChatLayoutOwner;
            delete target.dataset.mainChatLayoutStatus;
            delete target.dataset.mainChatLocalStatus;
            delete target.dataset.mainChatLocalStatusLabel;
        }
    };
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
            return <MainChatMessageListWorkspacePanel state={state} bridge={bridge} />;
        case 'characterAuthoring':
            return <AuthoringWorkspacePanel kind="characterAuthoring" state={state} bridge={bridge} />;
        default:
            return <WorkspacePanelPlaceholder kind={kind} />;
    }
}

function WorkspacePanelRoot({ kind, bridge }: { kind: WorkspacePanelKind; bridge?: WorkspacePanelBridge }) {
    const { data: panelState } = useQuery({
        queryKey: workspacePanelStateQueryKey(kind),
        queryFn: async () => queryClient.getQueryData(workspacePanelStateQueryKey(kind)) ?? null,
        initialData: () => queryClient.getQueryData(workspacePanelStateQueryKey(kind)) ?? null,
        staleTime: Number.POSITIVE_INFINITY,
    });

    return renderPanel(kind, panelState, bridge);
}

const workspaceShellNavigationEntries: WorkspaceShellNavigationEntry[] = [
    { action: 'openAIConfig', icon: 'fa-sliders', label: 'AI Config', panelKind: 'aiConfig' },
    { action: 'openFormatting', icon: 'fa-font', label: 'Formatting', panelKind: 'advancedFormatting' },
    { action: 'openCharacterLibrary', icon: 'fa-address-book', label: 'Character Library', panelKind: 'characterLibrary', slotKey: 'characterLibrary' },
    { action: 'openWorldInfo', icon: 'fa-book-atlas', label: 'World Info', panelKind: 'worldInfo', slotKey: 'worldInfo' },
    { action: 'openBackgrounds', icon: 'fa-image', label: 'Backgrounds', panelKind: 'backgroundLibrary', slotKey: 'backgroundLibrary' },
    { action: 'openExtensions', icon: 'fa-cubes', label: 'Extensions', panelKind: 'extensionsHost', slotKey: 'extensionsHost' },
    { action: 'openSettings', icon: 'fa-gear', label: 'Settings', panelKind: 'settings' },
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

function getWorkspacePanelVisibleStatusLabel(status: WorkspacePanelStatus) {
    switch (status) {
        case 'loading':
            return 'opening';
        case 'empty':
            return 'needs setup';
        case 'error':
            return 'needs attention';
        case 'idle':
            return 'idle';
        case 'success':
        default:
            return 'ready';
    }
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

function ReactWorkspaceShellChrome({
    state = {},
    bridge,
}: {
    state?: WorkspaceShellChromeState;
    bridge?: WorkspacePanelBridge;
}) {
    const contextTitle = state.contextTitle?.trim() || 'Choose a character';
    const status = state.status ?? (state.activeContext === 'none' ? 'empty' : 'success');
    const dockSnapshot = useWorkspacePanelDockSnapshot();
    const panelDispatchSequenceRef = useRef(0);

    const dispatchAction = useCallback(async (entry: WorkspaceShellNavigationEntry) => {
        const dispatchSequence = panelDispatchSequenceRef.current + 1;
        if (entry.panelKind) {
            panelDispatchSequenceRef.current = dispatchSequence;
            recordWorkspacePanelDockIntent(entry.panelKind);
        }

        try {
            const result = entry.slotKey
                ? await bridge?.dispatchAction?.('activateWorkspaceShellSlot', { slotKey: entry.slotKey })
                : await bridge?.dispatchAction?.(entry.action);
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
    }, [bridge]);

    const closePanel = useCallback(async (entry: WorkspaceShellNavigationEntry) => {
        if (!entry.panelKind) {
            return;
        }

        const dispatchSequence = panelDispatchSequenceRef.current + 1;
        panelDispatchSequenceRef.current = dispatchSequence;
        try {
            if (entry.slotKey) {
                await bridge?.dispatchAction?.('deactivateWorkspaceShellSlot', { slotKey: entry.slotKey });
            } else {
                await bridge?.dispatchAction?.('closeWorkspacePanel', { kind: entry.panelKind });
            }
            if (panelDispatchSequenceRef.current !== dispatchSequence) {
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
    }, [bridge]);

    const togglePanelPin = useCallback(async (entry: WorkspaceShellNavigationEntry, isPinned: boolean) => {
        if (!entry.panelKind || !entry.slotKey) {
            return;
        }

        try {
            await bridge?.dispatchAction?.('setWorkspaceShellSlotPinned', {
                pinned: !isPinned,
                slotKey: entry.slotKey,
            });
            recordWorkspacePanelDockPin(entry.panelKind, !isPinned);
        } catch (error) {
            recordWorkspacePanelDockResult(entry.panelKind, {
                fallbackReason: 'pin-failed',
                status: 'error',
            });
            console.warn('React workspace shell panel pin failed.', error);
        }
    }, [bridge]);

    return (
        <header
            className="react-workspace-shell-chrome"
            data-react-workspace-shell-chrome="true"
            data-react-workspace-shell-chrome-status={status}
            data-react-workspace-shell-chrome-context={state.activeContext ?? 'none'}
            data-doc-id="feature.next_workspace_shell page.chat_workspace"
        >
            <section className="react-workspace-shell-context" aria-label="Current workspace context">
                <div className="react-workspace-shell-title">{contextTitle}</div>
            </section>
            <nav className="react-workspace-shell-nav" aria-label="Workspace navigation">
                {workspaceShellNavigationEntries.map(entry => {
                    const isPanelEntryActive = Boolean(entry.panelKind && dockSnapshot.activePanelKind === entry.panelKind);
                    const isPinned = Boolean(entry.panelKind && dockSnapshot.pinnedPanelKinds.includes(entry.panelKind));
                    const panelActionLabel = entry.panelKind
                        ? `${isPanelEntryActive && dockSnapshot.activePanelStatus !== 'error' && !isPinned ? 'Close' : 'Open'} ${entry.label}`
                        : entry.label;
                    const childSlot = entry.slotKey ? getWorkspaceShellChildSlot(entry.slotKey) : null;

                    return (
                        <Fragment key={entry.action}>
                            <button
                                type="button"
                                className="react-workspace-shell-nav-button"
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
                                    if (entry.panelKind && isPanelEntryActive && dockSnapshot.activePanelStatus !== 'error' && !isPinned) {
                                        window.setTimeout(() => {
                                            void closePanel(entry);
                                        }, 0);
                                        return;
                                    }
                                    window.setTimeout(() => {
                                        void dispatchAction(entry);
                                    }, 0);
                                }}
                            >
                                <i className={`fa-solid ${entry.icon}`} aria-hidden="true" />
                                <span>{entry.label}</span>
                            </button>
                            {entry.panelKind && entry.slotKey && isPanelEntryActive ? (
                                <button
                                    type="button"
                                    className="react-workspace-shell-pin-button"
                                    aria-label={`${isPinned ? 'Unpin' : 'Pin'} ${entry.label}`}
                                    aria-pressed={isPinned}
                                    data-workspace-shell-panel-pin={entry.panelKind}
                                    onClick={() => {
                                        void togglePanelPin(entry, isPinned);
                                    }}
                                >
                                    <i className="fa-solid fa-thumbtack" aria-hidden="true" />
                                </button>
                            ) : null}
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
            <QueryClientProvider client={queryClient}>
                <ReactWorkspaceShellChrome state={mount.state} bridge={mount.bridge} />
            </QueryClientProvider>
        </StrictMode>,
    );
}

function renderIntoPanel(mount: WorkspacePanelMount) {
    recordWorkspacePanelUpdate(mount.kind, mount.state ?? null, mount.bridge);
    if (mount.kind === 'mainChatMessageList') {
        updateMainChatObservation(mount.state ?? {});
    }
    queryClient.setQueryData(workspacePanelStateQueryKey(mount.kind), mount.state ?? null);
    mount.root.render(
        <StrictMode>
            <QueryClientProvider client={queryClient}>
                <WorkspacePanelRoot kind={mount.kind} bridge={mount.bridge} />
            </QueryClientProvider>
        </StrictMode>,
    );
}


function SettingsOverlayHost({
    initialTab,
    panelKind,
    onRequestClose,
}: {
    initialTab?: string | null;
    panelKind: WorkspaceDockPanelKind;
    onRequestClose?: () => void;
}) {
    const handleClose = useCallback(() => {
        recordWorkspacePanelDockClose(panelKind);
        onRequestClose?.();
    }, [onRequestClose, panelKind]);

    useEffect(() => {
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const host = document.getElementById('emberdesk-react-settings-overlay-host');
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                handleClose();
                return;
            }
            if (event.key !== 'Tab' || !host) {
                return;
            }
            const dialog = host.querySelector<HTMLElement>('[data-settings-overlay="true"]');
            if (!dialog) {
                return;
            }
            const focusable = Array.from(
                dialog.querySelectorAll<HTMLElement>(
                    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
                ),
            ).filter(node => !node.hasAttribute('disabled') && node.getAttribute('aria-hidden') !== 'true');
            if (focusable.length === 0) {
                return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            const active = document.activeElement as HTMLElement | null;
            if (!active || !dialog.contains(active)) {
                event.preventDefault();
                (event.shiftKey ? last : first).focus();
            } else if (event.shiftKey && active === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && active === last) {
                event.preventDefault();
                first.focus();
            }
        };
        window.addEventListener('keydown', onKeyDown, true);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', onKeyDown, true);
        };
    }, [handleClose]);

    return (
        <>
            <div
                className="settings-overlay-backdrop"
                data-settings-overlay-backdrop="true"
                onClick={() => handleClose()}
            />
            <div
                className="settings-overlay"
                data-settings-overlay="true"
                role="dialog"
                aria-modal="true"
                aria-label="Settings"
                tabIndex={-1}
                data-doc-id="page.settings feature.next_workspace_shell"
            >
                <SettingsSurface
                    variant="overlay"
                    initialTab={initialTab}
                    onRequestClose={handleClose}
                />
            </div>
        </>
    );
}

function renderSettingsOverlay(mount: SettingsOverlayMount) {
    mount.root.render(
        <StrictMode>
            <QueryClientProvider client={queryClient}>
                <SettingsOverlayHost
                    initialTab={mount.initialTab}
                    panelKind={mount.panelKind}
                    onRequestClose={mount.onRequestClose}
                />
            </QueryClientProvider>
        </StrictMode>,
    );
}

export function mountSettingsOverlay(options: {
    initialTab?: string | null;
    panelKind?: WorkspaceDockPanelKind;
    onRequestClose?: () => void;
} = {}) {
    attachGlobalCompatibilityBridge();
    const initialTab = typeof options.initialTab === 'string' ? options.initialTab : null;
    const panelKind: WorkspaceDockPanelKind =
        options.panelKind === 'aiConfig' || options.panelKind === 'advancedFormatting'
            ? options.panelKind
            : 'settings';
    if (mountedSettingsOverlay) {
        mountedSettingsOverlay.initialTab = initialTab;
        mountedSettingsOverlay.panelKind = panelKind;
        mountedSettingsOverlay.onRequestClose = options.onRequestClose;
        renderSettingsOverlay(mountedSettingsOverlay);
        return { kind: panelKind, mounted: true, status: 'mounted' as const };
    }

    const activeElement = document.activeElement;
    const returnFocusTo = activeElement instanceof HTMLElement ? activeElement : null;
    const host = document.createElement('div');
    host.id = 'emberdesk-react-settings-overlay-host';
    host.setAttribute('data-react-settings-overlay-host', 'true');
    document.body.appendChild(host);

    mountedSettingsOverlay = {
        root: createRoot(host),
        host,
        backdrop: host,
        dialog: host,
        returnFocusTo,
        initialTab,
        panelKind,
        onRequestClose: options.onRequestClose,
    };
    renderSettingsOverlay(mountedSettingsOverlay);
    queueMicrotask(() => {
        const dialog = host.querySelector<HTMLElement>('[data-settings-overlay="true"]');
        dialog?.focus();
    });
    return { kind: panelKind, mounted: true, status: 'mounted' as const };
}

export function unmountSettingsOverlay() {
    if (!mountedSettingsOverlay) {
        return;
    }
    const { host, returnFocusTo, root } = mountedSettingsOverlay;
    root.unmount();
    host.remove();
    mountedSettingsOverlay = null;
    if (returnFocusTo?.isConnected) {
        returnFocusTo.focus({ preventScroll: true });
    }
    if (mountedPanels.size === 0 && !mountedShellChrome) {
        detachGlobalCompatibilityBridge();
    }
}

export function mountWorkspacePanel(kind: WorkspacePanelKind, container: HTMLElement, options: WorkspacePanelMountOptions = {}) {
    attachGlobalCompatibilityBridge();
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
    recordWorkspacePanelMount(kind, options.state ?? null, options.bridge);
    renderIntoPanel(mount);
}

export function mountWorkspaceShellChrome(container: HTMLElement, options: WorkspaceShellChromeMountOptions = {}) {
    attachGlobalCompatibilityBridge();
    if (mountedShellChrome) {
        if (mountedShellChrome.container !== container) {
            mountedShellChrome.root.unmount();
        } else {
            mountedShellChrome.state = options.state;
            mountedShellChrome.bridge = options.bridge;
            renderIntoShellChrome(mountedShellChrome);
            return;
        }
    }

    mountedShellChrome = {
        root: createRoot(container),
        container,
        state: options.state,
        bridge: options.bridge,
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
    recordWorkspacePanelUnmount(kind);
    if (kind === 'mainChatMessageList') {
        resetMainChatObservationStore();
    }
    if (mountedPanels.size === 0) {
        detachGlobalCompatibilityBridge();
    }
}
