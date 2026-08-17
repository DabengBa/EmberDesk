import { createStore, type StoreApi } from 'zustand/vanilla';

export type MainChatMessageRole = 'user' | 'character' | 'system';
export type MainChatMessageState = 'finalized' | 'editing' | 'streaming' | 'extension-mutated' | 'error';
export type MainChatRecoveryStage = 'primary' | 'fallback';
export type MainChatContext = 'character' | 'assistant' | 'none';
export type MainChatGenerationPhase = 'idle' | 'connecting' | 'streaming' | 'recovering' | 'recoveringPrimary' | 'recoveringFallback' | 'stopped' | 'completed' | 'error';
export type MainChatStreamingPhase = 'idle' | 'connecting' | 'streaming' | 'finalizing' | 'stopped' | 'completed' | 'error';

export interface MainChatSlashOption {
    readonly name: string;
    readonly type: string;
    readonly typeIcon: string;
    readonly selectable: boolean;
    readonly selected: boolean;
}

export interface MainChatMessageRender {
    readonly messageHtml?: string;
    readonly reasoningHtml?: string;
    readonly mediaHtml?: string;
    readonly fileHtml?: string;
    readonly biasHtml?: string;
}

export interface MainChatMessageRecord {
    readonly id: string;
    readonly role: MainChatMessageRole;
    readonly name: string;
    readonly content: string;
    readonly timestamp: string;
    readonly timestampTitle: string;
    readonly avatarUrl: string;
    readonly title: string;
    readonly tokenCount: number | null;
    readonly bookmarkLink: string;
    readonly reasoningOpen: boolean;
    readonly reasoningEditing: boolean;
    readonly reasoningEditText: string;
    readonly rootClassNames: readonly string[];
    readonly state: MainChatMessageState;
    readonly recoveryStatus: string | null;
    readonly recoveryStage: MainChatRecoveryStage | null;
    readonly failureNoticeVisible: boolean;
    readonly failureRetryVisible: boolean;
    readonly emptyReplyRegenerateVisible: boolean;
    readonly actionsExpanded: boolean;
    readonly editing: boolean;
    readonly editText: string;
    readonly lastInContext: boolean;
    readonly swipeCounterHidden: boolean;
    readonly swipeIndex: number;
    readonly swipeCount: number;
    readonly swipesVisible: boolean;
    readonly lastSwipe: boolean;
    readonly render?: MainChatMessageRender;
}

export interface MainChatComposerSnapshot {
    readonly value: string;
    readonly activeContext: MainChatContext;
    readonly focused: boolean;
    readonly disabled: boolean;
}

export interface MainChatGenerationSnapshot {
    readonly phase: MainChatGenerationPhase;
    readonly activeMessageId: string | null;
}

export interface MainChatStreamingSnapshot {
    readonly phase: MainChatStreamingPhase;
    readonly activeMessageId: string | null;
    readonly observedTokenCount: number;
}

export interface MainChatSlashSnapshot {
    readonly active: boolean;
    readonly query: string;
    readonly autocompleteVisible: boolean;
    readonly replaceable: boolean;
    readonly detailsVisible: boolean;
    readonly detailsHtml: string;
    readonly options: readonly MainChatSlashOption[];
    readonly executing: boolean;
    readonly paused: boolean;
    readonly aborted: boolean;
    readonly errorLabel: string | null;
}

export interface MainChatScrollRestoreSnapshot {
    readonly anchorMessageId: string;
    readonly anchorViewportOffset: number;
    readonly scrollTop: number;
    readonly wasNearBottom: boolean;
}

export interface MainChatWindowSnapshot {
    readonly visibleMessageIds: readonly string[];
    readonly anchorMessageId: string | null;
    readonly showMoreVisible: boolean;
    readonly scrollTop: number;
    readonly scrollHeight: number;
    readonly clientHeight: number;
    readonly scrollRestore: MainChatScrollRestoreSnapshot | null;
}

export type MainChatWindowSnapshotInput = Partial<Omit<MainChatWindowSnapshot, 'scrollRestore'>> & {
    scrollRestore?: Partial<MainChatScrollRestoreSnapshot> | null;
};

export interface MainChatSnapshot {
    readonly chatId: string | null;
    readonly messagesById: Readonly<Record<string, MainChatMessageRecord>>;
    readonly orderedMessageIds: readonly string[];
    readonly composer: MainChatComposerSnapshot;
    readonly generation: MainChatGenerationSnapshot;
    readonly streaming: MainChatStreamingSnapshot;
    readonly slash: MainChatSlashSnapshot;
    readonly window: MainChatWindowSnapshot;
}

export type MainChatSnapshotInput = Partial<{
    chatId: unknown;
    messagesById: Record<string, Partial<MainChatMessageRecord> & { id?: unknown }>;
    orderedMessageIds: readonly unknown[];
    composer: Partial<MainChatComposerSnapshot>;
    generation: Partial<MainChatGenerationSnapshot>;
    streaming: Partial<MainChatStreamingSnapshot>;
    slash: Partial<MainChatSlashSnapshot>;
    window: MainChatWindowSnapshotInput;
}>;

export interface MainChatStoreState {
    readonly snapshot: MainChatSnapshot;
    readonly getSnapshot: () => MainChatSnapshot;
    readonly replaceSnapshot: (snapshot: MainChatSnapshotInput) => void;
    readonly reset: () => void;
}

const EMPTY_SNAPSHOT_INPUT: MainChatSnapshotInput = Object.freeze({});

function normalizeString(value: unknown, fallback = '') {
    return typeof value === 'string' ? value : fallback;
}

function normalizeNullableString(value: unknown) {
    const normalized = normalizeString(value).trim();
    return normalized || null;
}

function normalizeNonNegativeNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function normalizeFiniteNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function normalizeNonNegativeInteger(value: unknown) {
    const normalized = normalizeNonNegativeNumber(value);
    return Number.isInteger(normalized) ? normalized : 0;
}

function normalizeMessageRole(value: unknown): MainChatMessageRole {
    return value === 'user' || value === 'system' ? value : 'character';
}

function normalizeMessageState(value: unknown): MainChatMessageState {
    return value === 'editing'
        || value === 'streaming'
        || value === 'extension-mutated'
        || value === 'error'
        ? value
        : 'finalized';
}

function normalizeContext(value: unknown): MainChatContext {
    return value === 'character' || value === 'assistant' ? value : 'none';
}

function normalizeGenerationPhase(value: unknown): MainChatGenerationPhase {
    return value === 'connecting'
        || value === 'streaming'
        || value === 'recovering'
        || value === 'recoveringPrimary'
        || value === 'recoveringFallback'
        || value === 'stopped'
        || value === 'completed'
        || value === 'error'
        ? value
        : 'idle';
}

function normalizeStreamingPhase(value: unknown): MainChatStreamingPhase {
    return value === 'connecting'
        || value === 'streaming'
        || value === 'finalizing'
        || value === 'stopped'
        || value === 'completed'
        || value === 'error'
        ? value
        : 'idle';
}

function normalizeIdList(value: unknown, validIds?: ReadonlySet<string>) {
    if (!Array.isArray(value)) {
        return [];
    }

    const seen = new Set<string>();
    const ids: string[] = [];
    for (const item of value) {
        const id = normalizeNullableString(item);
        if (!id || seen.has(id) || (validIds && !validIds.has(id))) {
            continue;
        }
        seen.add(id);
        ids.push(id);
    }
    return ids;
}

function deepFreeze<T>(value: T): T {
    if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
        return value;
    }

    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
        deepFreeze(child);
    }
    return value;
}

function normalizeMessageRender(value: unknown): MainChatMessageRender | undefined {
    if (!value || typeof value !== 'object') {
        return undefined;
    }

    const render = value as Record<string, unknown>;
    return {
        ...(typeof render.messageHtml === 'string' ? { messageHtml: render.messageHtml } : {}),
        ...(typeof render.reasoningHtml === 'string' ? { reasoningHtml: render.reasoningHtml } : {}),
        ...(typeof render.mediaHtml === 'string' ? { mediaHtml: render.mediaHtml } : {}),
        ...(typeof render.fileHtml === 'string' ? { fileHtml: render.fileHtml } : {}),
        ...(typeof render.biasHtml === 'string' ? { biasHtml: render.biasHtml } : {}),
    };
}

function normalizeStringList(value: unknown) {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.filter((item): item is string => typeof item === 'string');
}

function normalizeSlashOptions(value: unknown) {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .filter(item => item && typeof item === 'object' && !Array.isArray(item))
        .map(item => {
            const option = item as Record<string, unknown>;
            return {
                name: normalizeString(option.name),
                type: normalizeString(option.type),
                typeIcon: normalizeString(option.typeIcon),
                selectable: option.selectable !== false,
                selected: option.selected === true,
            };
        })
        .filter(option => option.name !== '');
}

function normalizeMessages(value: unknown) {
    const messagesById: Record<string, MainChatMessageRecord> = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return messagesById;
    }

    for (const [key, rawMessage] of Object.entries(value as Record<string, unknown>)) {
        if (!rawMessage || typeof rawMessage !== 'object' || Array.isArray(rawMessage)) {
            continue;
        }

        const message = rawMessage as Record<string, unknown>;
        const id = normalizeNullableString(message.id) ?? normalizeNullableString(key);
        if (!id) {
            continue;
        }

        const render = normalizeMessageRender(message.render);
        messagesById[id] = {
            id,
            role: normalizeMessageRole(message.role),
            name: normalizeString(message.name),
            content: normalizeString(message.content),
            timestamp: normalizeString(message.timestamp),
            timestampTitle: normalizeString(message.timestampTitle),
            avatarUrl: normalizeString(message.avatarUrl),
            title: normalizeString(message.title),
            tokenCount: typeof message.tokenCount === 'number' && Number.isFinite(message.tokenCount)
                ? message.tokenCount
                : null,
            bookmarkLink: normalizeString(message.bookmarkLink),
            reasoningOpen: message.reasoningOpen === true,
            reasoningEditing: message.reasoningEditing === true,
            reasoningEditText: normalizeString(message.reasoningEditText),
            rootClassNames: normalizeStringList(message.rootClassNames),
            state: normalizeMessageState(message.state),
            recoveryStatus: normalizeNullableString(message.recoveryStatus),
            recoveryStage: message.recoveryStage === 'fallback' ? 'fallback' : message.recoveryStage === 'primary' ? 'primary' : null,
            failureNoticeVisible: message.failureNoticeVisible === true,
            failureRetryVisible: message.failureRetryVisible === true,
            emptyReplyRegenerateVisible: message.emptyReplyRegenerateVisible === true,
            actionsExpanded: message.actionsExpanded === true,
            editing: message.editing === true,
            editText: normalizeString(message.editText),
            lastInContext: message.lastInContext === true,
            swipeCounterHidden: message.swipeCounterHidden === true,
            swipeIndex: normalizeNonNegativeInteger(message.swipeIndex),
            swipeCount: normalizeNonNegativeInteger(message.swipeCount),
            swipesVisible: message.swipesVisible === true,
            lastSwipe: message.lastSwipe === true,
            ...(render && Object.keys(render).length > 0 ? { render } : {}),
        };
    }

    return messagesById;
}

function normalizeSnapshot(input: MainChatSnapshotInput = {}) {
    const messagesById = normalizeMessages(input.messagesById);
    const orderedMessageIds = normalizeIdList(input.orderedMessageIds);
    const completeOrderedMessageIds = orderedMessageIds.length > 0
        ? orderedMessageIds
        : Object.keys(messagesById);
    const knownMessageIds = new Set(completeOrderedMessageIds);

    const composer = input.composer ?? {};
    const generation = input.generation ?? {};
    const streaming = input.streaming ?? {};
    const slash = input.slash ?? {};
    const window = input.window ?? {};
    const scrollRestore = window.scrollRestore;

    return deepFreeze({
        chatId: normalizeNullableString(input.chatId),
        messagesById,
        orderedMessageIds: completeOrderedMessageIds,
        composer: {
            value: normalizeString(composer.value),
            activeContext: normalizeContext(composer.activeContext),
            focused: composer.focused === true,
            disabled: composer.disabled === true,
        },
        generation: {
            phase: normalizeGenerationPhase(generation.phase),
            activeMessageId: normalizeNullableString(generation.activeMessageId),
        },
        streaming: {
            phase: normalizeStreamingPhase(streaming.phase),
            activeMessageId: normalizeNullableString(streaming.activeMessageId),
            observedTokenCount: normalizeNonNegativeNumber(streaming.observedTokenCount),
        },
        slash: {
            active: slash.active === true,
            query: normalizeString(slash.query),
            autocompleteVisible: slash.autocompleteVisible === true,
            replaceable: slash.replaceable === true,
            detailsVisible: slash.detailsVisible === true,
            detailsHtml: normalizeString(slash.detailsHtml),
            options: normalizeSlashOptions(slash.options),
            executing: slash.executing === true,
            paused: slash.paused === true,
            aborted: slash.aborted === true,
            errorLabel: normalizeNullableString(slash.errorLabel),
        },
        window: {
            visibleMessageIds: normalizeIdList(window.visibleMessageIds, knownMessageIds),
            anchorMessageId: normalizeNullableString(window.anchorMessageId),
            showMoreVisible: window.showMoreVisible === true,
            scrollTop: normalizeNonNegativeNumber(window.scrollTop),
            scrollHeight: normalizeNonNegativeNumber(window.scrollHeight),
            clientHeight: normalizeNonNegativeNumber(window.clientHeight),
            scrollRestore: scrollRestore && typeof scrollRestore === 'object'
                ? (() => {
                    const anchorMessageId = normalizeNullableString(scrollRestore.anchorMessageId);
                    return anchorMessageId
                        ? {
                            anchorMessageId,
                            anchorViewportOffset: normalizeFiniteNumber(scrollRestore.anchorViewportOffset),
                            scrollTop: normalizeNonNegativeNumber(scrollRestore.scrollTop),
                            wasNearBottom: scrollRestore.wasNearBottom === true,
                        }
                        : null;
                })()
                : null,
        },
    }) as MainChatSnapshot;
}

export function createMainChatStore(initialSnapshot: MainChatSnapshotInput = {}): StoreApi<MainChatStoreState> {
    let store: StoreApi<MainChatStoreState>;

    const replaceSnapshot = (snapshot: MainChatSnapshotInput) => {
        store.setState({
            snapshot: normalizeSnapshot(snapshot),
        });
    };

    const reset = () => {
        replaceSnapshot(EMPTY_SNAPSHOT_INPUT);
    };

    store = createStore<MainChatStoreState>(() => ({
        snapshot: normalizeSnapshot(initialSnapshot),
        getSnapshot: () => store.getState().snapshot,
        replaceSnapshot,
        reset,
    }));

    return store;
}

const mainChatStore = createMainChatStore();

export function getMainChatStore() {
    return mainChatStore;
}

export function getMainChatSnapshot() {
    return mainChatStore.getState().snapshot;
}

export function replaceMainChatSnapshot(snapshot: MainChatSnapshotInput) {
    mainChatStore.getState().replaceSnapshot(snapshot);
}

export function resetMainChatStore() {
    mainChatStore.getState().reset();
}

export function subscribeMainChatStore(listener: () => void) {
    return mainChatStore.subscribe(listener);
}
