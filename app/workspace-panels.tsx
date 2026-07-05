import { StrictMode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
    recordWorkspacePanelDockIntent,
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
import {
    deriveReactQuietTransportBridgeState,
    deriveReactVisibleTransportBridgeState,
} from '../public/scripts/main-chat-visible-transport-owner.js';
import {
    MAIN_CHAT_MESSAGE_ACTION_SNAPSHOT_SCHEMA,
    MAIN_CHAT_MESSAGE_ROW_SNAPSHOT_SCHEMA,
    MAIN_CHAT_RICH_BODY_SNAPSHOT_SCHEMA,
    MAIN_CHAT_VISIBLE_TRANSPORT_PATHS,
    MAIN_CHAT_VISIBLE_TRANSPORT_REASONS,
    MAIN_CHAT_VISIBLE_TRANSPORT_STATUSES,
} from '../public/scripts/main-chat-bridge-contract.js';

export type WorkspacePanelKind = 'worldInfo' | 'backgroundLibrary' | 'extensionsHost' | 'mainChatMessageList';
type WorkspaceDockPanelKind = 'characterLibrary' | 'worldInfo' | 'backgroundLibrary' | 'extensionsHost';

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
    activePanelStatus: 'idle' | 'disabled' | 'loading' | 'empty' | 'success' | 'error';
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
    contextSubtitle?: string;
    chatTitle?: string;
    messageCount?: number;
    temporaryChat?: boolean;
    status?: 'loading' | 'empty' | 'success' | 'error';
    statusLabel?: string;
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
    continueButton?: HTMLElement | null;
    regenerateButton?: HTMLElement | null;
    composerValue?: string;
    showMoreNode?: HTMLElement | null;
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
    state: 'finalized';
    eligible: true;
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
    state: 'finalized';
    eligible: true;
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
const mainChatMessageListScrollSnapshots = getMainChatMessageListScrollSnapshotStore();
const MAIN_CHAT_VIRTUAL_INDEX_ATTRIBUTE = 'data-main-chat-virtual-index';
const MAIN_CHAT_SCROLL_RESTORE_THRESHOLD_PX = 12;
const MAIN_CHAT_DEFAULT_ROW_HEIGHT_PX = 160;

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
    schema: z.literal(MAIN_CHAT_RICH_BODY_SNAPSHOT_SCHEMA),
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

const mainChatMessageRowSnapshotSchema = z.object({
    schema: z.literal(MAIN_CHAT_MESSAGE_ROW_SNAPSHOT_SCHEMA),
    messageId: z.string().min(1),
    state: z.literal('finalized'),
    eligible: z.literal(true),
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
    windowingOwner: 'legacy',
    phase7Candidate: '',
    fallback: 'legacy',
    loadMoreOwner: 'legacy',
    restoreOwner: 'legacy',
    renderedMessageIds: [],
    totalMessageCount: 0,
    showMoreVisible: false,
    anchorMessageId: null,
    scrollTop: 0,
    preservesDirectChildOrder: true,
    reason: 'unknown',
};

const mainChatRowLifecycleContractFallback: MainChatRowLifecycleContractState = {
    lifecycleOwner: 'legacy',
    phase7Candidate: '',
    fallback: 'legacy',
    editingOwner: 'legacy',
    streamingOwner: 'legacy',
    unsafeOwner: 'legacy',
    extensionMutatedOwner: 'legacy',
    hasEditingRows: false,
    hasStreamingRows: false,
    hasUnsafeRows: false,
    hasExtensionMutatedRows: false,
    reason: 'unknown',
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
        supportStatus: MAIN_CHAT_VISIBLE_TRANSPORT_STATUSES.REACT_OWNED,
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
        messageRow.dataset.mainChatMessageRow = String(runtime.activeMessageId ?? '');
        messageText.innerHTML = runtime.formattedMessageHtml ?? '';

        return () => {
            delete messageRow.dataset.mainChatActiveTransportOwner;
            if (!finalizedRowOwned) {
                delete messageRow.dataset.mainChatMessageRowOwner;
                delete messageRow.dataset.mainChatMessageRow;
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
        targets.reasoningDetails.open = snapshot.reasoningOpen ?? false;
        targets.reasoningNode.innerHTML = snapshot.reasoningHtml;
        targets.messageNode.innerHTML = snapshot.messageHtml;
        targets.mediaNode.innerHTML = snapshot.mediaHtml;
        targets.fileNode.innerHTML = snapshot.fileHtml;
        targets.biasNode.innerHTML = snapshot.biasHtml;

        return () => {
            delete targets.messageBlock.dataset.mainChatRichBodyOwner;
            delete targets.messageBlock.dataset.mainChatRichBodyRow;
        };
    }, [
        snapshot.biasHtml,
        snapshot.fileHtml,
        snapshot.mediaHtml,
        snapshot.messageHtml,
        snapshot.messageId,
        snapshot.reasoningHtml,
        snapshot.reasoningOpen,
        targets,
    ]);

    if (!targets) {
        return null;
    }

    return (
        <div hidden aria-hidden="true" />
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

        return () => {
            delete messageRow.dataset.mainChatMessageRowOwner;
            delete messageRow.dataset.mainChatMessageRow;
        };
    }, [messageRow, snapshot.messageId]);

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

    return {
        nonQrFormItems,
        leftSendForm,
        sendTextarea,
        rightSendForm,
        sendForm,
        sendButton,
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
        targets.continueButton?.addEventListener('click', handleContinueButtonClick, true);
        targets.regenerateButton?.addEventListener('click', handleRegenerateButtonClick, true);

        return () => {
            targets.sendTextarea.removeEventListener('input', syncComposerField);
            targets.sendTextarea.removeEventListener('keydown', handleTextareaKeyDown, true);
            targets.sendButton.removeEventListener('click', handleSendButtonClick, true);
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

    if (status === 'error' && generationControl.failureRetryVisible) {
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
                            {status}
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

function getWorldInfoPanelStatus(bridgeState: WorldInfoWorkspacePanelState): WorkspacePanelStatus {
    if (bridgeState.importBusy) {
        return 'loading';
    }

    if (!bridgeState.globalSelectorPresent && !bridgeState.editorSelectorPresent) {
        return bridgeState.importMenuPresent || bridgeState.refreshMenuPresent ? 'empty' : 'error';
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
    const recoveryActions: WorkspacePanelRecoveryAction[] = [];

    if (status === 'empty') {
        if (bridgeState.importMenuPresent) {
            recoveryActions.push({
                id: 'import-world',
                label: 'Import world',
                disabled: Boolean(bridgeState.importBusy),
                onClick: () => worldInfoActionMutation.mutate({ action: 'importWorld' }),
            });
        }
    }

    if ((status === 'empty' || status === 'error') && bridgeState.refreshMenuPresent) {
        recoveryActions.push({
            id: 'refresh-world',
            label: 'Refresh panel',
            disabled: !bridgeState.refreshMenuPresent,
            onClick: () => worldInfoActionMutation.mutate({ action: 'refreshWorld' }),
        });
    }

    return (
        <WorkspacePanelShell
            kind="worldInfo"
            title="World Info"
            status={status}
            actions={recoveryActions}
            legacyBoundary="activation-import-regex-prompt-delete"
            slots={[
                { id: 'global-selector', label: 'Global selector', ready: bridgeState.globalSelectorPresent },
                { id: 'editor-selector', label: 'Editor selector', ready: bridgeState.editorSelectorPresent && bridgeState.selectorsSeparated },
                { id: 'import-controls', label: 'Import controls', ready: bridgeState.importMenuPresent },
                { id: 'legacy-editor', label: 'Legacy editor', ready: bridgeState.dropTargetPresent },
            ]}
        >
            <div className="flex-container flexFlowColumn gap8" data-world-info-react-workflow="editor-import-export">
                <div className="flex-container flexwrap gap8 alignitemscenter">
                    <output>Selected: {selectedWorldName}</output>
                    <output>Worlds: {worldNames.length}</output>
                    <output>Entries: {bridgeState.entryCount ?? entrySummaries.length}</output>
                </div>
                <div className="flex-container flexwrap gap8 alignitemscenter">
                    <worldInfoForm.Field name="selectedWorldIndex">
                        {field => (
                            <select
                                className="text_pole textarea_compact"
                                data-world-info-react-control="world-select"
                                aria-label="World"
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
                    </worldInfoForm.Field>
                    <worldInfoForm.Field name="searchQuery">
                        {field => (
                            <input
                                className="text_pole textarea_compact"
                                type="search"
                                data-world-info-react-control="search"
                                aria-label="Search world info"
                                value={field.state.value}
                                onChange={event => {
                                    const searchQuery = event.target.value;
                                    field.handleChange(searchQuery);
                                    worldInfoActionMutation.mutate({ action: 'applySearchQuery', payload: { searchQuery } });
                                }}
                            />
                        )}
                    </worldInfoForm.Field>
                    <worldInfoForm.Field name="sortValue">
                        {field => (
                            <select
                                className="text_pole textarea_compact"
                                data-world-info-react-control="sort"
                                aria-label="Sort world info"
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
                    </worldInfoForm.Field>
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
                            className="menu_button workspace-panel-item-row workspace-panel-world-info-entry"
                            data-world-info-react-entry={entry.uid}
                            onClick={() => worldInfoActionMutation.mutate({ action: 'openEntry', payload: { uid: entry.uid } })}
                        >
                            <span className="workspace-panel-item-label">{entry.title}</span>
                            <span className="workspace-panel-item-status">{entry.disabled ? 'Disabled' : 'Edit'}</span>
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
                    className="menu_button workspace-panel-item-row workspace-panel-background-item"
                    data-background-library-react-item={item.id}
                    onClick={() => actionMutation.mutate({ action: 'selectBackground', payload: { id: item.id, source } })}
                >
                    <span className="workspace-panel-item-label">{item.title}</span>
                    <span className="workspace-panel-item-status">{item.locked ? 'Locked' : item.selected ? 'Selected' : item.animated ? 'Animated' : 'Select'}</span>
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
    const systemBackgrounds = bridgeState.systemBackgrounds ?? [];
    const chatBackgrounds = bridgeState.chatBackgrounds ?? [];
    const recoveryActions: WorkspacePanelRecoveryAction[] = [];

    useEffect(() => {
        backgroundLibraryForm.reset(formDefaults);
    }, [backgroundLibraryForm, formDefaults]);

    if (status === 'empty') {
        recoveryActions.push({
            id: 'upload-background',
            label: 'Upload background',
            onClick: () => backgroundLibraryActionMutation.mutate({ action: 'uploadBackground' }),
        });
    }

    if (status === 'empty' || status === 'error') {
        recoveryActions.push({
            id: 'refresh-backgrounds',
            label: 'Refresh panel',
            onClick: () => backgroundLibraryActionMutation.mutate({ action: 'refreshBackgrounds' }),
        });
    }

    return (
        <WorkspacePanelShell
            kind="backgroundLibrary"
            title="Backgrounds"
            status={status}
            actions={recoveryActions}
            legacyBoundary="upload-delete-rename-select-lock-slash"
            slots={[
                { id: 'global-gallery', label: 'Global gallery', ready: bridgeState.systemContainerPresent },
                { id: 'chat-gallery', label: 'Chat gallery', ready: bridgeState.chatContainerPresent },
                { id: 'background-actions', label: 'Background actions', ready: bridgeState.systemContainerPresent || bridgeState.chatContainerPresent },
            ]}
        >
            <div className="flex-container flexFlowColumn gap8" data-background-library-react-workflow="gallery-actions">
                <div className="flex-container flexwrap gap8 alignitemscenter">
                    <output>Folder view: {bridgeState.folderViewActive ? 'On' : 'Off'}</output>
                    <output>Locked: {bridgeState.lockedCount ?? 0}</output>
                    <output>Selected: {bridgeState.selectedCount ?? 0}</output>
                </div>
                <div className="flex-container flexwrap gap8 alignitemscenter">
                    <backgroundLibraryForm.Field name="filterQuery">
                        {field => (
                            <input
                                className="text_pole textarea_compact"
                                type="search"
                                data-background-library-react-control="filter"
                                aria-label="Filter backgrounds"
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
                                aria-label="Sort backgrounds"
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
                    </backgroundLibraryForm.Field>
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

    if (status === 'error') {
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
            </div>
        </WorkspacePanelShell>
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
    const [visibleTransportDecision, setVisibleTransportDecision] = useState<MainChatVisibleTransportDecisionState | null>(null);
    const visibleTransportGlobalExecutionInFlightRef = useRef(false);
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
    const executePreparedVisibleTransportRequest = useCallback(async (
        prepared: MainChatPreparedVisibleTransportRequest | undefined,
        payload: { kind: string; messageId?: number },
    ) => {
        try {
            const kind = String(payload.kind ?? '');
            if (!prepared || prepared.owner !== 'react' || !prepared.runAttempt || !prepared.handleFailure || !prepared.finalizeSuccess) {
                setReactVisibleTransportRuntime(null);
                return prepared;
            }

            const attempts = Array.isArray(prepared.attempts) ? prepared.attempts : [];
            setReactVisibleTransportRuntime({
                ...createMainChatVisibleTransportRuntime(kind),
                supportStatus: prepared.status ?? MAIN_CHAT_VISIBLE_TRANSPORT_STATUSES.REACT_OWNED,
                supportPath: prepared.path ?? MAIN_CHAT_VISIBLE_TRANSPORT_PATHS.STANDARD_OPENAI_VISIBLE_DIRECT_CHAT,
                supportReason: prepared.reason ?? MAIN_CHAT_VISIBLE_TRANSPORT_REASONS.SUPPORTED_KIND,
            });

            for (let attemptIndex = 0; attemptIndex < attempts.length; attemptIndex += 1) {
                const attempt = attempts[attemptIndex];
                const recoveryPhase = attempt.label === 'fallback' ? 'recoveringFallback' : 'recoveringPrimary';

                if (attemptIndex > 0) {
                    await prepared.prepareRetryAttempt?.(attempt, attemptIndex);
                    setReactVisibleTransportRuntime((current) => ({
                        ...(current ?? createMainChatVisibleTransportRuntime(kind)),
                        kind,
                        phase: recoveryPhase,
                        fromFallbackAttempt: attempt.fallbackProvider === true,
                        recoverable: true,
                        failureRetryVisible: false,
                        failureNoticeVisible: false,
                        recoveryStatusLabel: attempt.status || null,
                        errorLabel: null,
                        formattedMessageHtml: '',
                    }));
                }

                try {
                    const result = await prepared.runAttempt(attempt, attemptIndex, {
                        onMessageHtml: ({ messageId, formattedMessageHtml }) => {
                            setReactVisibleTransportRuntime((current) => ({
                                ...(current ?? createMainChatVisibleTransportRuntime(kind)),
                                kind,
                                phase: 'streaming',
                                activeMessageId: messageId,
                                formattedMessageHtml,
                            }));
                        },
                        onTransportState: (partial) => {
                            setReactVisibleTransportRuntime((current) => ({
                                ...(current ?? createMainChatVisibleTransportRuntime(kind)),
                                ...partial,
                                kind,
                                owner: 'react',
                            }));
                        },
                    });
                    setReactVisibleTransportRuntime((current) => current
                        ? {
                            ...current,
                            phase: 'completed',
                            recoveryStatusLabel: null,
                            errorLabel: null,
                            failureRetryVisible: false,
                            failureNoticeVisible: false,
                        }
                        : current);
                    return await prepared.finalizeSuccess(result);
                } catch (exception) {
                    const failure = await prepared.handleFailure(exception, attempt, attemptIndex);
                    if (failure.action === 'retry') {
                        continue;
                    }

                    const errorMessage = String((failure.exception as { message?: unknown })?.message ?? failure.exception ?? '');
                    const stopped = isReactVisibleTransportStopException(failure.exception);
                    setReactVisibleTransportRuntime((current) => current
                        ? {
                            ...current,
                            phase: stopped ? 'stopped' : 'error',
                            recoverable: !stopped,
                            recoveryStatusLabel: null,
                            errorLabel: stopped ? null : errorMessage,
                            failureRetryVisible: !stopped,
                            failureNoticeVisible: !stopped,
                            formattedMessageHtml: stopped ? current.formattedMessageHtml : '',
                        }
                        : current);
                    await prepared.finalizeError?.(failure.exception);
                    return failure.exception;
                }
            }

            return undefined;
        } finally {
            scheduleMainChatVisibleTransportRuntimeSettle(setReactVisibleTransportRuntime);
        }
    }, []);
    const visibleTransportMutation = useMutation({
        mutationFn: async (payload: { kind: string; messageId?: number }) => {
            const prepared = await bridge?.dispatchAction?.('prepareVisibleGeneration', payload) as MainChatPreparedVisibleTransportRequest | undefined;
            setVisibleTransportDecision(extractMainChatVisibleTransportDecision(prepared, String(payload.kind ?? '')));
            return await executePreparedVisibleTransportRequest(prepared, payload);
        },
        retry: false,
        onSettled: () => {
            scheduleMainChatVisibleTransportRuntimeSettle(setReactVisibleTransportRuntime);
        },
    });

    useEffect(() => {
        const scope = globalThis as typeof globalThis & {
            __emberDeskExecuteMainChatVisibleTransportRequest?: (
                prepared: MainChatPreparedVisibleTransportRequest,
            ) => Promise<unknown>;
        };

        scope.__emberDeskExecuteMainChatVisibleTransportRequest = async (prepared) => {
            if (visibleTransportGlobalExecutionInFlightRef.current) {
                return undefined;
            }

            visibleTransportGlobalExecutionInFlightRef.current = true;
            try {
                setVisibleTransportDecision(extractMainChatVisibleTransportDecision(prepared, String(prepared.kind ?? '')));
                return await executePreparedVisibleTransportRequest(prepared, {
                    kind: String(prepared.kind ?? ''),
                });
            } finally {
                visibleTransportGlobalExecutionInFlightRef.current = false;
            }
        };

        return () => {
            delete scope.__emberDeskExecuteMainChatVisibleTransportRequest;
        };
    }, [executePreparedVisibleTransportRequest]);

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
    const effectiveGenerationControl = buildReactOwnedMainChatGenerationControl(
        effectiveReactVisibleTransportRuntime,
        bridgeState.generationControl ?? mainChatGenerationControlFallback,
    );
    const effectiveStreamingTransport = buildReactOwnedMainChatStreamingTransport(
        effectiveReactVisibleTransportRuntime,
        bridgeState.streamingTransport ?? mainChatStreamingTransportFallback,
    );
    const visibleTransportBridgeState = deriveReactVisibleTransportBridgeState({
        runtime: effectiveReactVisibleTransportRuntime,
        decision: visibleTransportDecision,
        generationControl: effectiveGenerationControl,
        streamingTransport: effectiveStreamingTransport,
    });
    const quietTransportBridgeState = deriveReactQuietTransportBridgeState({
        runtime: bridgeState.quietTransport ?? mainChatQuietTransportFallback,
        contract: bridgeState.quietTransport ?? mainChatQuietTransportFallback,
    });
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
                data-main-chat-visible-transport-owner={visibleTransportBridgeState.visibleTransportOwner}
                data-main-chat-visible-transport-kind={visibleTransportBridgeState.visibleTransportKind}
                data-main-chat-visible-transport-status={visibleTransportBridgeState.visibleTransportStatus}
                data-main-chat-visible-transport-path={visibleTransportBridgeState.visibleTransportPath}
                data-main-chat-visible-transport-reason={visibleTransportBridgeState.visibleTransportReason}
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
                data-main-chat-quiet-transport-owner={quietTransportBridgeState.quietTransportOwner}
                data-main-chat-quiet-transport-kind={quietTransportBridgeState.quietTransportKind}
                data-main-chat-quiet-transport-status={quietTransportBridgeState.quietTransportStatus}
                data-main-chat-quiet-transport-path={quietTransportBridgeState.quietTransportPath}
                data-main-chat-quiet-transport-reason={quietTransportBridgeState.quietTransportReason}
                data-main-chat-quiet-transport-phase={quietTransportBridgeState.quietTransportPhase}
                data-main-chat-quiet-transport-error={quietTransportBridgeState.quietTransportError}
                data-main-chat-quiet-transport-auto-recover={quietTransportBridgeState.quietTransportAutoRecover ? 'true' : 'false'}
                data-main-chat-quiet-transport-streaming={quietTransportBridgeState.quietTransportUsesStreaming ? 'true' : 'false'}
                data-main-chat-quiet-transport-visible-row={quietTransportBridgeState.quietTransportBindsVisibleRow ? 'true' : 'false'}
                data-main-chat-quiet-transport-finalization={quietTransportBridgeState.quietTransportFinalization}
                data-main-chat-quiet-transport-rollback={quietTransportBridgeState.quietTransportRollback}
            />
            <MainChatMessageListRestoreController key={bridgeState.chatId || 'main-chat-empty'} state={bridgeState} bridge={bridge} />
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
    { action: 'openAIConfig', icon: 'fa-sliders', label: 'AI Config' },
    { action: 'openFormatting', icon: 'fa-font', label: 'Formatting' },
    { action: 'openCharacterLibrary', icon: 'fa-address-book', label: 'Character Library', panelKind: 'characterLibrary' },
    { action: 'openWorldInfo', icon: 'fa-book-atlas', label: 'World Info', panelKind: 'worldInfo' },
    { action: 'openBackgrounds', icon: 'fa-image', label: 'Backgrounds', panelKind: 'backgroundLibrary' },
    { action: 'openExtensions', icon: 'fa-cubes', label: 'Extensions', panelKind: 'extensionsHost' },
    { action: 'openSettings', icon: 'fa-gear', label: 'Settings' },
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
    const [dockSnapshot, setDockSnapshot] = useState<WorkspacePanelDockSnapshot>(() => getWorkspacePanelDockSnapshot());

    useEffect(() => subscribeWorkspacePanelDock((nextSnapshot: WorkspacePanelDockSnapshot) => {
        setDockSnapshot(nextSnapshot);
    }), []);

    return dockSnapshot;
}

function getWorkspaceShellContextLabel(state: WorkspaceShellChromeState) {
    if (state.activeContext === 'group') {
        return 'Group chat';
    }

    if (state.activeContext === 'character') {
        return 'Character chat';
    }

    if (state.activeContext === 'assistant') {
        return 'Assistant chat';
    }

    return 'No active chat';
}

function ReactWorkspaceShellChrome({
    state = {},
    bridge,
}: {
    state?: WorkspaceShellChromeState;
    bridge?: WorkspacePanelBridge;
}) {
    const contextTitle = state.contextTitle?.trim() || 'Choose a character';
    const contextSubtitle = state.contextSubtitle?.trim() || getWorkspaceShellContextLabel(state);
    const chatTitle = state.chatTitle?.trim() || 'No chat selected';
    const status = state.status ?? (state.activeContext === 'none' ? 'empty' : 'success');
    const statusLabel = state.statusLabel ?? (status === 'empty' ? 'Ready for a character' : 'Workspace ready');
    const messageCount = Number.isFinite(state.messageCount) ? state.messageCount : 0;
    const dockSnapshot = useWorkspacePanelDockSnapshot();
    const panelDispatchSequenceRef = useRef(0);

    const dispatchAction = useCallback(async (entry: WorkspaceShellNavigationEntry) => {
        const dispatchSequence = panelDispatchSequenceRef.current + 1;
        if (entry.panelKind) {
            panelDispatchSequenceRef.current = dispatchSequence;
            recordWorkspacePanelDockIntent(entry.panelKind);
        }

        try {
            const result = await bridge?.dispatchAction?.(entry.action);
            if (entry.panelKind) {
                if (panelDispatchSequenceRef.current !== dispatchSequence) {
                    return;
                }
                recordWorkspacePanelDockResult(entry.panelKind, {
                    fallbackReason: getWorkspacePanelDockFallbackReason(result),
                    locked: Boolean(asWorkspacePanelDockDispatchResult(result).locked),
                    pinned: Boolean(asWorkspacePanelDockDispatchResult(result).pinned),
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

    return (
        <header
            className="react-workspace-shell-chrome"
            data-react-workspace-shell-chrome="true"
            data-react-workspace-shell-chrome-status={status}
            data-react-workspace-shell-chrome-context={state.activeContext ?? 'none'}
            data-doc-id="feature.next_workspace_shell page.chat_workspace"
        >
            <section className="react-workspace-shell-context" aria-label="Current workspace context">
                <div className="react-workspace-shell-kicker">{contextSubtitle}</div>
                <div className="react-workspace-shell-title">{contextTitle}</div>
                <div className="react-workspace-shell-meta">
                    <span>{chatTitle}</span>
                    <span>{messageCount} messages</span>
                    {state.temporaryChat ? <span>Temporary chat</span> : null}
                </div>
            </section>
            <nav className="react-workspace-shell-nav" aria-label="Workspace navigation">
                {workspaceShellNavigationEntries.map(entry => {
                    const isPanelEntryActive = Boolean(entry.panelKind && dockSnapshot.activePanelKind === entry.panelKind);

                    return (
                        <button
                            key={entry.action}
                            type="button"
                            className="react-workspace-shell-nav-button"
                            aria-label={entry.label}
                            aria-pressed={entry.panelKind ? isPanelEntryActive : undefined}
                            data-workspace-shell-panel-entry={entry.panelKind}
                            data-workspace-shell-panel-active={isPanelEntryActive ? 'true' : 'false'}
                            onClick={() => {
                                void dispatchAction(entry);
                            }}
                        >
                            <i className={`fa-solid ${entry.icon}`} aria-hidden="true" />
                            <span>{entry.label}</span>
                        </button>
                    );
                })}
            </nav>
            <section className="react-workspace-shell-status" aria-live="polite">
                <span className="react-workspace-shell-status-dot" aria-hidden="true" />
                <span>{statusLabel}</span>
                {dockSnapshot.activePanelKind ? (
                    <span
                        className="react-workspace-panel-dock-status"
                        data-workspace-panel-dock-kind={dockSnapshot.activePanelKind}
                        data-workspace-panel-dock-status={dockSnapshot.activePanelStatus}
                    >
                        {dockSnapshot.activePanelKind}: {dockSnapshot.activePanelStatus}
                    </span>
                ) : null}
            </section>
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
