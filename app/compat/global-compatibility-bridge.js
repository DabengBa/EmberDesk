import {
    WORKSPACE_PANEL_KINDS,
    getWorkspacePanelDockSnapshot,
    getWorkspacePanelSnapshot,
    subscribeWorkspacePanelDock,
    subscribeWorkspacePanel,
} from '../stores/workspace-panel-store.js';
import {
    getMainChatObservationSnapshot,
    subscribeMainChatObservation,
} from '../stores/main-chat-observation-store.js';

const DEFAULT_BRIDGE_KEY = '__emberDeskReactCompatibilityBridge';
const OMIT_SERIALIZED_VALUE = Symbol('omitSerializedValue');
const activeBridges = new WeakMap();

function hasEventSourceContract(value) {
    return Boolean(
        value
        && typeof value.on === 'function'
        && typeof value.once === 'function'
        && typeof value.emit === 'function'
        && typeof value.emitAndWait === 'function'
        && typeof value.makeFirst === 'function'
        && typeof value.makeLast === 'function'
        && typeof value.removeListener === 'function',
    );
}

function isDomLike(value) {
    return Boolean(
        value
        && typeof value === 'object'
        && (value.nodeType === 1 || value.nodeType === 9)
        && ('ownerDocument' in value || 'dataset' in value || typeof value.getAttribute === 'function'),
    );
}

function cloneJsonSafe(value, seen = new WeakSet()) {
    if (value === null || value === undefined) {
        return value;
    }

    if (typeof value === 'function' || typeof value === 'symbol') {
        return OMIT_SERIALIZED_VALUE;
    }

    if (typeof value !== 'object') {
        return value;
    }

    if (isDomLike(value)) {
        return '[non-serializable]';
    }

    if (seen.has(value)) {
        return '[circular]';
    }
    seen.add(value);

    if (Array.isArray(value)) {
        return value
            .map(item => cloneJsonSafe(item, seen))
            .filter(item => item !== OMIT_SERIALIZED_VALUE);
    }

    return Object.fromEntries(Object.entries(value)
        .map(([key, item]) => [key, cloneJsonSafe(item, seen)])
        .filter(([, item]) => item !== OMIT_SERIALIZED_VALUE && item !== undefined));
}

function freezeSnapshot(snapshot) {
    return Object.freeze({
        ...snapshot,
        legacy: Object.freeze({ ...snapshot.legacy }),
        mainChatObservation: snapshot.mainChatObservation === null
            ? null
            : Object.freeze({ ...snapshot.mainChatObservation }),
        workspacePanelDock: snapshot.workspacePanelDock === null
            ? null
            : Object.freeze({
                ...snapshot.workspacePanelDock,
                lockedPanelKinds: Object.freeze([...(snapshot.workspacePanelDock.lockedPanelKinds ?? [])]),
                openPanelKinds: Object.freeze([...(snapshot.workspacePanelDock.openPanelKinds ?? [])]),
                pinnedPanelKinds: Object.freeze([...(snapshot.workspacePanelDock.pinnedPanelKinds ?? [])]),
            }),
        workspacePanels: Object.freeze(Object.fromEntries(
            Object.entries(snapshot.workspacePanels).map(([kind, panelSnapshot]) => [
                kind,
                Object.freeze({
                    ...panelSnapshot,
                    state: cloneJsonSafe(panelSnapshot.state),
                }),
            ]),
        )),
    });
}

function sanitizeWorkspacePanelState(kind, state) {
    if (!state || typeof state !== 'object') {
        return cloneJsonSafe(state);
    }

    if (kind === 'worldInfo') {
        return cloneJsonSafe({
            globalSelectorPresent: state.globalSelectorPresent,
            editorSelectorPresent: state.editorSelectorPresent,
            selectorsSeparated: state.selectorsSeparated,
            importMenuPresent: state.importMenuPresent,
            importBusy: state.importBusy,
            dropTargetPresent: state.dropTargetPresent,
            worldNames: state.worldNames,
            selectedWorldName: state.selectedWorldName,
            selectedWorldIndex: state.selectedWorldIndex,
            entryCount: state.entryCount,
            entrySummaries: state.entrySummaries,
            searchQuery: state.searchQuery,
            sortValue: state.sortValue,
            sortOptions: state.sortOptions,
            canCreateEntry: state.canCreateEntry,
            exportMenuPresent: state.exportMenuPresent,
            createWorldMenuPresent: state.createWorldMenuPresent,
            refreshMenuPresent: state.refreshMenuPresent,
        });
    }

    if (kind === 'backgroundLibrary') {
        return cloneJsonSafe({
            status: state.status,
            showLoading: state.showLoading,
            showEmpty: state.showEmpty,
            showError: state.showError,
            systemContainerPresent: state.systemContainerPresent,
            chatContainerPresent: state.chatContainerPresent,
            systemItemCount: state.systemItemCount,
            chatItemCount: state.chatItemCount,
            refreshQueued: state.refreshQueued,
            systemBackgrounds: state.systemBackgrounds,
            chatBackgrounds: state.chatBackgrounds,
            filterQuery: state.filterQuery,
            sortValue: state.sortValue,
            folderViewActive: state.folderViewActive,
            lockedCount: state.lockedCount,
            selectedCount: state.selectedCount,
        });
    }

    if (kind === 'extensionsHost') {
        return cloneJsonSafe({
            extensionsSettingsPresent: state.extensionsSettingsPresent,
            extensionsSettings2Present: state.extensionsSettings2Present,
            regexContainerPresent: state.regexContainerPresent,
            extensionsMenuButtonPresent: state.extensionsMenuButtonPresent,
            extensionsMenuPresent: state.extensionsMenuPresent,
            extrasApiControlsPresent: state.extrasApiControlsPresent,
            manageButtonPresent: state.manageButtonPresent,
            installButtonPresent: state.installButtonPresent,
            notifyUpdatesEnabled: state.notifyUpdatesEnabled,
            extrasApiKeySet: state.extrasApiKeySet,
            extrasStatusText: state.extrasStatusText,
            mountPointStatuses: state.mountPointStatuses,
            deferredState: state.deferredState,
            deferredPlaceholderPresent: state.deferredPlaceholderPresent,
        });
    }

    if (kind === 'mainChatMessageList') {
        return cloneJsonSafe({
            chatId: state.chatId,
            messageCount: state.messageCount,
            visibleMessageIds: state.visibleMessageIds,
            generationControl: state.generationControl
                ? {
                    phase: state.generationControl.phase,
                    activeMessageId: state.generationControl.activeMessageId,
                    failureRetryVisible: state.generationControl.failureRetryVisible,
                    failureNoticeVisible: state.generationControl.failureNoticeVisible,
                }
                : undefined,
            streamingTransport: state.streamingTransport
                ? {
                    phase: state.streamingTransport.phase,
                    activeMessageId: state.streamingTransport.activeMessageId,
                    observedTokenCount: state.streamingTransport.observedTokenCount,
                    observedChunkCount: state.streamingTransport.observedChunkCount,
                    fromFallbackAttempt: state.streamingTransport.fromFallbackAttempt,
                }
                : undefined,
            composer: state.composer
                ? {
                    valueLength: state.composer.valueLength,
                    canSubmit: state.composer.canSubmit,
                    isDisabled: state.composer.isDisabled,
                    isGenerating: state.composer.isGenerating,
                    activeContext: state.composer.activeContext,
                }
                : undefined,
            slashCommand: state.slashCommand
                ? {
                    active: state.slashCommand.active,
                    queryLength: state.slashCommand.queryLength,
                    autocompleteVisible: state.slashCommand.autocompleteVisible,
                    executing: state.slashCommand.executing,
                    paused: state.slashCommand.paused,
                    aborted: state.slashCommand.aborted,
                }
                : undefined,
        });
    }

    return {};
}

function cloneWorkspacePanelSnapshot(kind, panelSnapshot) {
    return {
        ...panelSnapshot,
        state: sanitizeWorkspacePanelState(kind, panelSnapshot.state),
    };
}

function createDetachedSnapshot(legacyScope) {
    return freezeSnapshot({
        attached: false,
        legacy: {
            hasSillyTavern: Boolean(legacyScope?.SillyTavern),
            hasEventSource: hasEventSourceContract(legacyScope?.eventSource),
            hasEventTypes: Boolean(legacyScope?.event_types && typeof legacyScope.event_types === 'object'),
        },
        mainChatObservation: null,
        workspacePanelDock: null,
        workspacePanels: {},
    });
}

function createAttachedSnapshot(legacyScope) {
    return freezeSnapshot({
        attached: true,
        legacy: {
            hasSillyTavern: Boolean(legacyScope?.SillyTavern),
            hasEventSource: hasEventSourceContract(legacyScope?.eventSource),
            hasEventTypes: Boolean(legacyScope?.event_types && typeof legacyScope.event_types === 'object'),
        },
        mainChatObservation: cloneJsonSafe(getMainChatObservationSnapshot()),
        workspacePanelDock: cloneJsonSafe(getWorkspacePanelDockSnapshot()),
        workspacePanels: Object.fromEntries(
            WORKSPACE_PANEL_KINDS.map(kind => [kind, cloneWorkspacePanelSnapshot(kind, getWorkspacePanelSnapshot(kind))]),
        ),
    });
}

function createBridgeController({ legacyScope, bridgeKey }) {
    let snapshot = createAttachedSnapshot(legacyScope);
    const refreshSnapshot = () => {
        snapshot = createAttachedSnapshot(legacyScope);
        bridge.snapshot = snapshot;
    };
    const unsubscribers = [
        subscribeMainChatObservation(refreshSnapshot),
        subscribeWorkspacePanelDock(refreshSnapshot),
        ...WORKSPACE_PANEL_KINDS.map(kind => subscribeWorkspacePanel(kind, refreshSnapshot)),
    ];
    const bridge = {
        get snapshot() {
            return snapshot;
        },
        set snapshot(nextSnapshot) {
            snapshot = nextSnapshot;
        },
        getSnapshot() {
            return snapshot;
        },
    };
    const controller = {
        bridge,
        detach() {
            for (const unsubscribe of unsubscribers.splice(0)) {
                unsubscribe();
            }
            if (legacyScope?.[bridgeKey] === bridge) {
                delete legacyScope[bridgeKey];
            }
            activeBridges.delete(legacyScope);
        },
    };

    legacyScope[bridgeKey] = bridge;
    return controller;
}

export function attachGlobalCompatibilityBridge({
    legacyScope = globalThis,
    bridgeKey = DEFAULT_BRIDGE_KEY,
} = {}) {
    if (!legacyScope || typeof legacyScope !== 'object') {
        return {
            bridge: {
                snapshot: createDetachedSnapshot(null),
                getSnapshot() {
                    return this.snapshot;
                },
            },
            detach() {},
        };
    }

    const existing = activeBridges.get(legacyScope);
    if (existing) {
        return existing;
    }

    const controller = createBridgeController({ legacyScope, bridgeKey });
    activeBridges.set(legacyScope, controller);
    return controller;
}

export function detachGlobalCompatibilityBridge({
    legacyScope = globalThis,
} = {}) {
    activeBridges.get(legacyScope)?.detach();
}

export function getGlobalCompatibilityBridgeSnapshot({
    legacyScope = globalThis,
} = {}) {
    return activeBridges.get(legacyScope)?.bridge.getSnapshot() ?? createDetachedSnapshot(legacyScope);
}

export function resetGlobalCompatibilityBridgeForTests() {
    detachGlobalCompatibilityBridge({ legacyScope: globalThis });
}
