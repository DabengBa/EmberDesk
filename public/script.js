import {
    showdown,
    moment,
    DOMPurify,
    hljs,
    Handlebars,
    SVGInject,
    Popper,
    initLibraryShims,
    default as libs,
    lodash,
} from './lib.js';

import { humanizedDateTime, favsToHotswap, getMessageTimeStamp, dragElement, isMobile, initRossMods } from './scripts/RossAscends-mods.js';
import { applyResetChatState } from './scripts/chat-state-reset.js';

import {
    getWorldInfoSettings,
    setWorldInfoSettings,
    importEmbeddedWorldInfo,
    checkEmbeddedWorld,
    charSetAuxWorlds,
    charUpdatePrimaryWorld,
    flushDeletedWorldsFromUI,
    world_info,
    world_names,
    setWorldInfoButtonClass,
    initWorldInfo,
    mountWorldInfoPanel,
    rehydrateWorldInfoPanel,
    selectWorldInfoEditorIndex,
    applyWorldInfoSearchQuery,
    applyWorldInfoSortOption,
    setWorldInfoGlobalActiveNames,
    createWorldInfoEntryFromEditor,
    promptToCreateWorldInfo,
    requestWorldInfoImportSelection,
    exportCurrentWorldInfo,
    renameCurrentWorldInfo,
    duplicateCurrentWorldInfo,
    deleteCurrentWorldInfo,
    refreshCurrentWorldInfoEditor,
    openWorldInfoEntryByUid,
    selectWorldInfoWorkbenchEntry,
    updateWorldInfoWorkbenchEntryFields,
    getWorldInfoWorkbenchFacadeSnapshot,
    getWorldInfoReactPanelState,
    backfillWorldInfoMemosFromWorkbench,
    promptApplyWorldInfoCurrentSorting,
    bulkDeleteWorldInfoEntries,
    bulkSetWorldInfoEntriesEnabled,
    promptMoveOrCopyWorldInfoEntry,
} from './scripts/world-info.js';
import { scanImportedCharacter, showUnifiedImportConfirm, applyImportChoices, buildSkipAllChoices } from './scripts/import-confirm-dialog.js';

import {
    collapseNewlines,
    loadPowerUserSettings,
    playMessageSound,
    fixMarkdown,
    power_user,
    persona_description_positions,
    loadMovingUIState,
    getCustomStoppingStrings,
    renderStoryString,
    mountAdvancedFormattingPanel,
    sortEntitiesList,
    registerDebugFunction,
    flushEphemeralStoppingStrings,
    resetMovableStyles,
    forceCharacterEditorTokenize,
    applyPowerUserSettings,
    generatedTextFiltered,
    applyStylePins,
    mountPowerUserPanel,
} from './scripts/power-user.js';

import {
    setOpenAIMessageExamples,
    setOpenAIMessages,
    setupChatCompletionPromptManager,
    prepareOpenAIMessages,
    sendOpenAIRequest,
    loadOpenAISettings,
    oai_settings,
    openai_messages_count,
    chat_completion_sources,
    getChatCompletionModel,
    initOpenAI,
    mountPromptManagerPopup,
} from './scripts/openai.js';

import {
    initBranchUI,
    showBranchChatButtons,
} from './scripts/chat-branch.js';

import {
    debounce,
    delay,
    trimToEndSentence,
    countOccurrences,
    isOdd,
    sortMoments,
    timestampToMoment,
    download,
    isDataURL,
    getCharaFilename,
    waitUntilCondition,
    escapeRegex,
    resetScrollHeight,
    onlyUnique,
    getBase64Async,
    humanFileSize,
    Stopwatch,
    isValidUrl,
    ensureImageFormatSupported,
    flashHighlight,
    toggleDrawer,
    isElementInViewport,
    copyText,
    escapeHtml,
    saveBase64AsFile,
    uuidv4,
    equalsIgnoreCaseAndAccents,
    importFromExternalUrl,
    shiftUpByOne,
    shiftDownByOne,
    canUseNegativeLookbehind,
    trimSpaces,
    clamp,
    shakeElement,
    createTimeout,
    cancelDebounce,
} from './scripts/utils.js';
import { debounce_timeout, IGNORE_SYMBOL, inject_ids, MEDIA_SOURCE, MEDIA_TYPE, SCROLL_BEHAVIOR, SWIPE_DIRECTION, SWIPE_STATE } from './scripts/constants.js';

import {
    cancelDebouncedMetadataSave,
    extension_settings,
    initCoreFeatureExtensions,
    initExtensions,
    runGenerationInterceptors,
    setDeferredExtensionLoader,
    toggleExtensionsHostNotifyUpdates,
    openExtensionsHostManager,
    openExtensionsHostInstaller,
    retryDeferredExtensionsHostLoad,
    updateExtensionsHostApiUrl,
    updateExtensionsHostApiKey,
    connectExtensionsHostApi,
    setExtensionsHostAutoconnectEnabled,
    getExtensionHostSession,
    getDeferredExtensionLoaderState,
    ensureExtensionCompatibilitySlots,
    getExtrasConnectionStatus,
    hasExtensionLoadErrors,
} from './scripts/extensions.js';
import {
    EXTENSION_COMPATIBILITY_SLOTS,
    getExtensionCompatibilitySlotManager,
} from './scripts/extension-compatibility-slots.js';
import { COMMENT_NAME_DEFAULT, CONNECT_API_MAP, executeSlashCommandsOnChatInput, getMainChatSlashCommandAutoCompleteState, initDefaultSlashCommands, initSlashCommandAutoComplete, isExecutingCommandsFromChatInput, pauseScriptExecution, selectMainChatSlashCommandOption, setMainChatSlashCommandReactOwnerEnabled, stopScriptExecution, UNIQUE_APIS } from './scripts/slash-commands.js';
import { initMacroAutoComplete } from './scripts/autocomplete/MacroAutoComplete.js';
import {
    tag_map,
    tags,
    filterByTagState,
    isBogusFolder,
    isBogusFolderOpen,
    chooseBogusFolder,
    loadTagsSettings,
    printTagFilters,
    createCharacterTagFilterViewState,
    cycleCharacterTagFilterState,
    runCharacterTagFilterAction,
    expandCharacterTagFilterList,
    getTagKeyForEntity,
    printTagList,
    createTagMapFromList,
    renameTagKey,
    importTags,
    tag_filter_type,
    compareTagsForSort,
    initTags,
    applyTagsOnCharacterSelect,
    tag_import_setting,
    applyCharacterTagsToMessageDivs,
} from './scripts/tags.js';
import { initSecrets, readSecretState, secret_state, SECRET_KEYS } from './scripts/secrets.js';
import {
    createQuietGenerationLifecycleContract,
    getGenerationRecoveryBaselineSwipeId,
    getGenerationRecoveryRetrySwipeId,
    getGenerationRecoverySuccessReasoningState,
    getGenerationRecoverySuccessSwipeId,
} from './scripts/chat-generation-lifecycle.js';
import {
    createGenerationCommand,
    createGenerationRequestEnvelope,
} from './scripts/chat-generation-command-service.js';
import { markdownExclusionExt } from './scripts/showdown-exclusion.js';
import { markdownUnderscoreExt } from './scripts/showdown-underscore.js';

import { registerPromptManagerMigration } from './scripts/PromptManager.js';
import { getRegexedString, regex_placement } from './scripts/extensions/regex/engine.js';
import { FILTER_STATES, FILTER_TYPES, FilterHelper, isFilterState } from './scripts/filters.js';
import { initLocales, t, translate } from './scripts/i18n.js';
import { getFriendlyTokenizerName, getTokenCount, getTokenCountAsync, initTokenizers, saveTokenCache } from './scripts/tokenizers.js';
import {
    user_avatar,
    getUserAvatars,
    getUserAvatar,
    setUserAvatar,
    initPersonas,
    mountPersonaManagementPanel,
    setPersonaDescription,
    initUserAvatar,
    updatePersonaConnectionsAvatarList,
    isPersonaPanelOpen,
} from './scripts/personas.js';
import { loader } from './scripts/action-loader.js';
import { createSingleFlightTask, resolvePersistedCurrentVersion, resolveStartupSettingsPlan } from './scripts/startup-helpers.js';
import { ensurePanel, registerPanelHook } from './scripts/deferred-panels.js';
import { getCharacterCardTagId } from './scripts/deferred-panel-replays.js';
import { BulkEditOverlay } from './scripts/BulkEditOverlay.js';
import { appendFileContent, hasPendingFileAttachment, populateFileAttachment, decodeStyleTags, encodeStyleTags, isExternalMediaAllowed, preserveNeutralChat, restoreNeutralChat, formatCreatorNotes, initChatUtilities, addDOMPurifyHooks } from './scripts/chats.js';
import { getPresetManager, initPresetManager } from './scripts/preset-manager.js';
import { evaluateMacros, getLastMessageId, initMacros } from './scripts/macros.js';
import { currentUser, setUserControls } from './scripts/user.js';
import { POPUP_RESULT, POPUP_TYPE, Popup, callGenericPopup, fixToastrForDialogs } from './scripts/popup.js';
import { renderTemplate, renderTemplateAsync } from './scripts/templates.js';
import { initCustomSelectedSamplers, validateDisabledSamplers } from './scripts/samplerSelect.js';
import { DragAndDropHandler } from './scripts/dragdrop.js';
import { INTERACTABLE_CONTROL_CLASS, initKeyboard } from './scripts/keyboard.js';
import { buildCascadeSectionHtml, showDeleteConfirmWithCascade, showWorldInfoCascadeDialog } from './scripts/world-cascade-dialog.js';
import { initDynamicStyles } from './scripts/dynamic-styles.js';
import { initInputMarkdown } from './scripts/input-md-formatting.js';
import { AbortReason } from './scripts/util/AbortReason.js';
import { initSystemPrompts } from './scripts/sysprompt.js';
import { registerExtensionSlashCommands as initExtensionSlashCommands } from './scripts/extensions-slashcommands.js';
import {
    buildMainChatRowLifecycleContract,
    buildMainChatWindowingContract,
} from './scripts/chat-message-render-descriptor.js';
import {
    buildMainChatSnapshotFromLegacyChat,
} from './scripts/main-chat-store-projection.js';
import { getStreamingControlState } from './scripts/chat-streaming-control-state.js';
import { getMainChatComposerState } from './scripts/main-chat-composer-state.js';
import { getMainChatSlashCommandState } from './scripts/main-chat-slash-command-state.js';
import { getMainChatStreamingTransportState } from './scripts/main-chat-streaming-transport-state.js';
import { createChatMessageActionsController } from './scripts/chat-message-actions-controller.js';
import { ToolManager } from './scripts/tool-calling.js';
import { addShowdownPatch } from './scripts/util/showdown-patch.js';
import { applyBrowserFixes } from './scripts/browser-fixes.js';
import { initServerHistory } from './scripts/server-history.js';
import { initSettingsSearch } from './scripts/setting-search.js';
import { initBulkEdit } from './scripts/bulk-edit.js';
import { getContext } from './scripts/st-context.js';
import { extractReasoningFromData, extractReasoningSignatureFromData, initReasoning, parseReasoningInSwipes, PromptReasoning, ReasoningHandler, removeReasoningFromString, updateReasoningUI } from './scripts/reasoning.js';
import { accountStorage } from './scripts/util/AccountStorage.js';
import { initDataMaid } from './scripts/data-maid.js';

import { getSystemMessageByType, initSystemMessages, SAFETY_CHAT, sendSystemMessage, system_message_types, system_messages } from './scripts/system-messages.js';
import { event_types, eventSource } from './scripts/events.js';
import { initAccessibility } from './scripts/a11y.js';
import { applyStreamFadeIn } from './scripts/util/stream-fadein.js';
import { initDomHandlers, bindLegacyShellHandlers } from './scripts/dom-handlers.js';
import { AudioPlayer } from './scripts/audio-player.js';
import { SimpleMutex } from './scripts/util/SimpleMutex.js';
import { MacroEnvBuilder } from './scripts/macros/engine/MacroEnvBuilder.js';
import { MacroEngine } from './scripts/macros/engine/MacroEngine.js';
import { addChatBackupsBrowser } from './scripts/chat-backups.js';
import { onboardingExperimentalMacroEngine } from './scripts/macros/engine/MacroDiagnostics.js';
import { compressRequest, setRequestCompressionConfig } from './scripts/request-compression.js';
import { canJumpToSwipeForMessage, canOpenSwipePickerForMessage, initSwipePicker } from './scripts/swipe-picker.js';
import {
    createCharacterAuthoringDraft,
    createCharacterAuthoringDraftFromCreateState,
    getCharacterAuthoringDirtyFields,
} from './scripts/character-authoring.js';
import { mountWorkspacePanelHost, createWorkspacePanelCommandPort, createWorkspacePanelStateChangeHandler, initWorkspacePanelDrawerBridge } from './scripts/workspace-panel-host-controller.js';
import { registerWorldInfoShellContext } from './scripts/world-info-shell-context.js';
import {
    executeGenerationRequestInShell,
    swipe,
    deleteSwipe,
    ensureSwipes,
    getOverswipeBehavior,
    hideSwipeButtons,
    isMessageSwipeable,
    isSwipingAllowed,
    refreshSwipeButtons,
    showSwipeButtons,
    syncMesToSwipe,
    syncSwipeToMes,
    updateEditArrowClasses,
    updateSwipeCounter,
} from './scripts/generation-service.js';
import {
    createOrEditCharacter,
    deleteCharacter,
    openCharacterWorldPopup,
    renameCharacter,
    saveCharacterAuthoringFromPayload,
    select_selected_character,
} from './scripts/character-lifecycle-service.js';
import {
    addCopyToCodeBlocks,
    addOneMessage,
    appendMediaToMessage,
    cleanUpMessage,
    createModelIcon,
    ensureMessageMediaIsArray,
    formatCharacterAvatar,
    formatGenerationTimer,
    getCharacterAvatar,
    getMediaDisplay,
    getMediaIndex,
    getMessageTextHTML,
    messageFormatting,
    processImageAttachment,
    saveReply,
    scrollChatToBottom,
    updateMessageBlock,
    updateMessageElement,
} from './scripts/message-service.js';
import { registerMessageShellContext } from './scripts/message-shell-context.js';
import { registerDomHandlersShellContext } from './scripts/dom-handlers-shell-context.js';
export { swipe };
export {
    clearChat,
    closeCurrentChatForDelete,
    deleteCharacterChatByName,
    displayChats,
    getChat,
    getPastCharacterChats,
    loadEarlierChatMessages,
    openCharacterChat,
    printMessages,
    renameCharacterChat,
    renamePastChats,
    saveChat,
    saveChatConditional,
    saveChatDebounced,
};
export {
    createOrEditCharacter,
    deleteCharacter,
    renameCharacter,
    select_selected_character,
};
export {
    deleteSwipe,
    ensureSwipes,
    getOverswipeBehavior,
    hideSwipeButtons,
    isMessageSwipeable,
    isSwipingAllowed,
    refreshSwipeButtons,
    showSwipeButtons,
    syncMesToSwipe,
    syncSwipeToMes,
    updateEditArrowClasses,
    updateSwipeCounter,
};
export {
    addCopyToCodeBlocks,
    addOneMessage,
    appendMediaToMessage,
    cleanUpMessage,
    createModelIcon,
    ensureMessageMediaIsArray,
    formatCharacterAvatar,
    getCharacterAvatar,
    getMediaDisplay,
    getMediaIndex,
    getMessageTextHTML,
    messageFormatting,
    scrollChatToBottom,
    updateMessageBlock,
    updateMessageElement,
    saveReply,
};
import { registerGenerationShellContext } from './scripts/generation-shell-context.js';
import { registerCharacterLifecycleShellContext } from './scripts/character-lifecycle-shell-context.js';
import {
    clearChat,
    closeCurrentChatForDelete,
    deleteCharacterChatByName,
    displayChats,
    getChat,
    getPastCharacterChats,
    loadEarlierChatMessages,
    openCharacterChat,
    printMessages,
    renameCharacterChat,
    renamePastChats,
    saveChat,
    saveChatConditional,
    saveChatDebounced,
} from './scripts/chat-ops-service.js';
import { registerChatOpsShellContext } from './scripts/chat-ops-shell-context.js';
import { removeCharactersFromState } from './scripts/character-list-state.js';
import {
    CHARACTER_LIST_PAGE_SIZE_OPTIONS,
    createCharacterBulkDeletePagePlan,
    createCharacterDeleteReconcilePlan,
    createCharacterListEntitySnapshot,
    createCharacterListPageRenderPlan,
    getCharacterListPageEntities,
    getCharacterListPaginationRangeLabel,
    shouldSuppressCharacterDeleteListReprintState,
} from './scripts/character-list-render-state.js';
import {
    getCharacterLibraryFetchErrorData,
    hasCharacterLibraryPayloadChanged,
    parseCharacterLibraryFetchResponse,
    projectCharacterLibraryQueryAgainstDeletedAvatars,
} from './scripts/character-library-query-helpers.js';
import { ensureReactPanelStylesheet, mountReactWorkspaceShellChrome, mountReactSettingsOverlay, unmountReactSettingsOverlay, loadWorkspacePanelsModule } from './scripts/workspace-panels-react-bridge.js';
import { getRequestHeaders, installAjaxCsrfPrefilter, loadCsrfToken } from './scripts/request-context.js';
import { installPublicBrowserApi } from './scripts/public-api.js';
import { createReactRuntimeProvider } from './scripts/react-runtime-provider.js';

// Retired Author's Note slot key. The feature is gone, but the slot remains the
// injection vehicle for World Info AN-position entries and persona TOP_AN/BOTTOM_AN.
const NOTE_MODULE_NAME = '2_floating_prompt';
const metadata_keys = {
    prompt: 'note_prompt',
    interval: 'note_interval',
    depth: 'note_depth',
    position: 'note_position',
    role: 'note_role',
};

// API OBJECT FOR EXTERNAL WIRING
installPublicBrowserApi({ libs, getContext });

const reactRuntimePort = createReactRuntimeProvider({
    getContext,
    eventSource,
    eventTypes: event_types,
    commands: {
        submitMessage: async (input) => {
            const textarea = document.getElementById('send_textarea');
            if (!(textarea instanceof HTMLTextAreaElement)) {
                throw new Error('Main chat composer is unavailable');
            }
            textarea.value = String(input ?? '');
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            return mainChatVisibleGenerationMutex.update();
        },
        stopGeneration: () => stopGeneration(),
        retryMessage: messageId => executeMainChatVisibleGenerationAction({
            kind: 'retryGeneration',
            messageId: Number(messageId),
        }),
        loadEarlier: anchorId => {
            const numericAnchorId = Number(anchorId);
            return loadEarlierChatMessages(
                Number.isInteger(numericAnchorId) && numericAnchorId >= 0 ? numericAnchorId : null,
            );
        },
        saveSettings: (settings) => {
            const context = getContext();
            const mappings = [
                ['chatCompletionSettings', 'oai_settings'],
                ['powerUserSettings', 'power_user'],
                ['extensionSettings', 'extension_settings'],
            ];

            for (const [runtimeKey, settingsKey] of mappings) {
                const runtimeSettings = context?.[runtimeKey];
                const savedSettings = settings?.[settingsKey];
                if (
                    runtimeSettings
                    && typeof runtimeSettings === 'object'
                    && savedSettings
                    && typeof savedSettings === 'object'
                ) {
                    Object.assign(runtimeSettings, savedSettings);
                }
            }
        },
        // Drawer-content host id (e.g. 'left-nav-panel', 'AdvancedFormatting').
        // Settings overlay links use this to reach legacy-owned surfaces that
        // still live inside workspace drawers. The allowlist keeps the command
        // from turning into generic "open any element by id" DOM access.
        openWorkspaceDrawer: hostId => {
            const normalizedHostId = String(hostId ?? '');
            if (!WORKSPACE_DRAWER_COMMAND_HOST_IDS.has(normalizedHostId)) {
                console.warn('openWorkspaceDrawer rejected unknown drawer host id.', normalizedHostId);
                return;
            }
            openWorkspaceChildSlotHostImmediate(normalizedHostId);
        },
    },
});

if (globalThis.location?.pathname === '/' && globalThis.location?.search.includes('emberdesk_perf_hooks=1')) {
    globalThis.__emberDeskPerf = {
        deleteCharacter,
        getPastCharacterChats,
        measureCharacterSearchForPerf,
        openCharacterLibraryForPerf: openWorkspaceShellCharacterLibrary,
        resetCharacterLibraryPanelForPerf,
        printCharacters,
    };
}

export function getWorkspaceReactFeatures() {
    return {
        reactPages: {
            settings: true,
        },
        reactPanels: {
            mainChatMessageList: true,
            worldInfo: true,
            extensionsHost: true,
            characterAuthoring: true,
        },
    };
}

registerWorldInfoShellContext({
    saveSettings: () => saveSettings(),
    substituteParams: (value) => substituteParams(value),
    getRequestHeaders: (options) => getRequestHeaders(options),
    getChatMetadata: () => chat_metadata,
    getCurrentCharacterId: () => this_chid,
    getCharacters: () => characters,
    saveCharacterDebounced: () => saveCharacterDebounced(),
    getMenuType: () => menu_type,
    eventSource,
    eventTypes: event_types,
    getExtensionPromptByName: (promptName) => getExtensionPromptByName(promptName),
    saveMetadata: () => saveMetadata(),
    getCurrentChatId: () => getCurrentChatId(),
    get extensionPromptRoles() { return extension_prompt_roles; },
    getCreateSave: () => create_save,
    createOrEditCharacter: () => createOrEditCharacter(),
    getName1: () => name1,
    getOneCharacter: (avatar) => getOneCharacter(avatar),
    selectSelectedCharacter: (chid, options) => select_selected_character(chid, options),
    getCharaFilename: (chid, options) => getCharaFilename(chid, options),
    getTagKeyForEntity: (entityId) => getTagKeyForEntity(entityId),
    getTokenCountAsync: (text, padding) => getTokenCountAsync(text, padding),
    getRegexedString: (content, placement, options) => getRegexedString(content, placement, options),
    regexPlacement: regex_placement,
    getExtensionContext: () => getContext(),
    get powerUserSettings() { return power_user; },
    extensionSettings: extension_settings,
    toastr,
    authorsNoteModuleName: NOTE_MODULE_NAME,
    authorsNoteMetadataKeys: metadata_keys,
    showWarningToast: (message, title) => toastr.warning(message, title),
    openWorldInfoPanel: () => openWorkspaceShellWorldInfo(),
});

registerGenerationShellContext({
    state: {
        get INTERACTABLE_CONTROL_CLASS() { return INTERACTABLE_CONTROL_CLASS; },
        get chat() { return chat; },
        get chat_metadata() { return chat_metadata; },
        get characters() { return characters; },
        get chatElement() { return chatElement; },
        get this_chid() { return this_chid; },
        get main_api() { return main_api; },
        get name1() { return name1; },
        get name2() { return name2; },
        get online_status() { return online_status; },
        get settings() { return settings; },
        get extension_prompt_roles() { return extension_prompt_roles; },
        get extension_prompt_types() { return extension_prompt_types; },
        get extension_prompts() { return extension_prompts; },
        get depth_prompt_depth_default() { return depth_prompt_depth_default; },
        get depth_prompt_role_default() { return depth_prompt_role_default; },
        get power_user() { return power_user; },
        get oai_settings() { return oai_settings; },
        get openai_messages_count() { return openai_messages_count; },
        get extension_settings() { return extension_settings; },
        get itemizedPrompts() { return itemizedPrompts; },
        get secret_state() { return secret_state; },
        get persona_description_positions() { return persona_description_positions; },
        get regex_placement() { return regex_placement; },
        get system_message_types() { return system_message_types; },
        get SECRET_KEYS() { return SECRET_KEYS; },
        get ToolManager() { return ToolManager; },
        get PromptReasoning() { return PromptReasoning; },
        get ReasoningHandler() { return ReasoningHandler; },
        get Stopwatch() { return Stopwatch; },
        get abortController() { return abortController; },
        set abortController(value) { abortController = value; },
        get scrollLock() { return scrollLock; },
        set scrollLock(value) { scrollLock = value; },
        get streamingProcessor() { return streamingProcessor; },
        set streamingProcessor(value) { streamingProcessor = value; },
        get is_send_press() { return is_send_press; },
        set is_send_press(value) { is_send_press = value; },
        get generation_started() { return generation_started; },
        set generation_started(value) { generation_started = value; },
        get animation_duration() { return animation_duration; },
        get lastSwipeInfo() { return lastSwipeInfo; },
        set lastSwipeInfo(value) { lastSwipeInfo = value; },
        get recentSwipes() { return recentSwipes; },
        set recentSwipes(value) { recentSwipes = value; },
        get swipeState() { return swipeState; },
        set swipeState(value) { swipeState = value; },
        get Popup() { return Popup; },
        get swipes() { return swipes; },
        get swipesHidden() { return swipesHidden; },
        set swipesHidden(value) { swipesHidden = value; },
        get this_edit_mes_id() { return this_edit_mes_id; },
    },
    addChatsSeparator: (...args) => addChatsSeparator(...args),
    addPersonaDescriptionExtensionPrompt: (...args) => addPersonaDescriptionExtensionPrompt(...args),
    baseChatReplace: (...args) => baseChatReplace(...args),
    cleanUpMessage: (...args) => cleanUpMessage(...args),
    clearGenerationAttemptMessage: (...args) => clearGenerationAttemptMessage(...args),
    clearGenerationAutoRecoveryStatus: (...args) => clearGenerationAutoRecoveryStatus(...args),
    createExistingMessageRecoveryBaseline: (...args) => createExistingMessageRecoveryBaseline(...args),
    deactivateSendButtons: (...args) => deactivateSendButtons(...args),
    deleteLastMessage: (...args) => deleteLastMessage(...args),
    doChatInject: (...args) => doChatInject(...args),
    extractImagesFromData: (...args) => extractImagesFromData(...args),
    extractJsonFromData: (...args) => extractJsonFromData(...args),
    extractMessageFromData: (...args) => extractMessageFromData(...args),
    extractMultiSwipes: (...args) => extractMultiSwipes(...args),
    extractTitleFromData: (...args) => extractTitleFromData(...args),
    flushWIInjections: (...args) => flushWIInjections(...args),
    formatMessageHistoryItem: (...args) => formatMessageHistoryItem(...args),
    getAllExtensionPrompts: (...args) => getAllExtensionPrompts(...args),
    getBiasStrings: (...args) => getBiasStrings(...args),
    getCharacterCardFields: (...args) => getCharacterCardFields(...args),
    getExtensionPrompt: (...args) => getExtensionPrompt(...args),
    getExtensionPromptRoleByName: (...args) => getExtensionPromptRoleByName(...args),
    getGenerationLifecycleStatusLabels: (...args) => getGenerationLifecycleStatusLabels(...args),
    getMaxPromptTokens: (...args) => getMaxPromptTokens(...args),
    getNextMessageId: (...args) => getNextMessageId(...args),
    hideSwipeButtons: (...args) => hideSwipeButtons(...args),
    isAssistantRecoveryMessageId: (...args) => isAssistantRecoveryMessageId(...args),
    isStreamingEnabled: (...args) => isStreamingEnabled(...args),
    parseMesExamples: (...args) => parseMesExamples(...args),
    pingServer: (...args) => pingServer(...args),
    prepareGenerationRetrySwipe: (...args) => prepareGenerationRetrySwipe(...args),
    processCommands: (...args) => processCommands(...args),
    rememberMainChatStreamingTransportProcessorTerminal: (...args) => rememberMainChatStreamingTransportProcessorTerminal(...args),
    removeDepthPrompts: (...args) => removeDepthPrompts(...args),
    removeLastMessage: (...args) => removeLastMessage(...args),
    removeMacros: (...args) => removeMacros(...args),
    replaceAssistantRecoveryMessage: (...args) => replaceAssistantRecoveryMessage(...args),
    saveChatConditional: (...args) => saveChatConditional(...args),
    saveReply: (...args) => saveReply(...args),
    scheduleMainChatMessageListPanelRefresh: (...args) => scheduleMainChatMessageListPanelRefresh(...args),
    sendGenerationRequest: (...args) => sendGenerationRequest(...args),
    sendMessageAsUser: (...args) => sendMessageAsUser(...args),
    sendStreamingRequest: (...args) => sendStreamingRequest(...args),
    setExtensionPrompt: (...args) => setExtensionPrompt(...args),
    setGenerationProgress: (...args) => setGenerationProgress(...args),
    setInContextMessages: (...args) => setInContextMessages(...args),
    showGenerationAutoRecoveryStatus: (...args) => showGenerationAutoRecoveryStatus(...args),
    showGenerationFailureRecovery: (...args) => showGenerationFailureRecovery(...args),
    showStopButton: (...args) => showStopButton(...args),
    substituteParams: (...args) => substituteParams(...args),
    swipe: (...args) => swipe(...args),
    triggerAutoContinue: (...args) => triggerAutoContinue(...args),
    unblockGeneration: (...args) => unblockGeneration(...args),
    unshallowCharacter: (...args) => unshallowCharacter(...args),
    addCopyToCodeBlocks: (...args) => addCopyToCodeBlocks(...args),
    appendMediaToMessage: (...args) => appendMediaToMessage(...args),
    formatGenerationTimer: (...args) => formatGenerationTimer(...args),
    getStoppingStrings: (...args) => getStoppingStrings(...args),
    isReactMainChatOwner: (...args) => isReactMainChatOwner(...args),
    messageFormatting: (...args) => messageFormatting(...args),
    mountReactMainChatMessageListPanel: (...args) => mountReactMainChatMessageListPanel(...args),
    processImageAttachment: (...args) => processImageAttachment(...args),
    scrollChatToBottom: (...args) => scrollChatToBottom(...args),
    syncMesToSwipe: (...args) => syncMesToSwipe(...args),
    updateSwipeCounter: (...args) => updateSwipeCounter(...args),
    appendFileContent: (...args) => appendFileContent(...args),
    extractReasoningFromData: (...args) => extractReasoningFromData(...args),
    extractReasoningSignatureFromData: (...args) => extractReasoningSignatureFromData(...args),
    getFriendlyTokenizerName: (...args) => getFriendlyTokenizerName(...args),
    getPresetManager: (...args) => getPresetManager(...args),
    getRegexedString: (...args) => getRegexedString(...args),
    getTokenCountAsync: (...args) => getTokenCountAsync(...args),
    hasPendingFileAttachment: (...args) => hasPendingFileAttachment(...args),
    sendSystemMessage: (...args) => sendSystemMessage(...args),
    collapseNewlines: (...args) => collapseNewlines(...args),
    generatedTextFiltered: (...args) => generatedTextFiltered(...args),
    playMessageSound: (...args) => playMessageSound(...args),
    prepareOpenAIMessages: (...args) => prepareOpenAIMessages(...args),
    renderStoryString: (...args) => renderStoryString(...args),
    runGenerationInterceptors: (...args) => runGenerationInterceptors(...args),
    setOpenAIMessageExamples: (...args) => setOpenAIMessageExamples(...args),
    setOpenAIMessages: (...args) => setOpenAIMessages(...args),
    shiftDownByOne: (...args) => shiftDownByOne(...args),
    shiftUpByOne: (...args) => shiftUpByOne(...args),
    parseReasoningInSwipes: (...args) => parseReasoningInSwipes(...args),
    applyStreamFadeIn: (...args) => applyStreamFadeIn(...args),
    countOccurrences: (...args) => countOccurrences(...args),
    isOdd: (...args) => isOdd(...args),
    delay: (...args) => delay(...args),
    Generate: (...args) => Generate(...args),
    addOneMessage: (...args) => addOneMessage(...args),
    cancelDebouncedChatSave: (...args) => cancelDebouncedChatSave(...args),
    closeMessageEditor: (...args) => closeMessageEditor(...args),
    ensureSwipes: (...args) => ensureSwipes(...args),
    getOverswipeBehavior: (...args) => getOverswipeBehavior(...args),
    isGenerating: (...args) => isGenerating(...args),
    isMessageSwipeable: (...args) => isMessageSwipeable(...args),
    isSwipingAllowed: (...args) => isSwipingAllowed(...args),
    redisplayChat: (...args) => redisplayChat(...args),
    reloadCurrentChat: (...args) => reloadCurrentChat(...args),
    saveChatDebounced: (...args) => saveChatDebounced(...args),
    showSwipeButtons: (...args) => showSwipeButtons(...args),
    syncSwipeToMes: (...args) => syncSwipeToMes(...args),
    clamp: (...args) => clamp(...args),
    createTimeout: (...args) => createTimeout(...args),
    shakeElement: (...args) => shakeElement(...args),
    updateReasoningUI: (...args) => updateReasoningUI(...args),
    get t() { return t; },
    setMainChatMessageUiFlag: (...args) => setMainChatMessageUiFlag(...args),
    canOpenSwipePickerForMessage: (...args) => canOpenSwipePickerForMessage(...args),
    canJumpToSwipeForMessage: (...args) => canJumpToSwipeForMessage(...args),
});
registerChatOpsShellContext({
    state: {
        set chat_metadata(value) { chat_metadata = value; },
        set extension_prompts(value) { extension_prompts = value; },
        set selected_button(value) { selected_button = value; },
        set this_edit_mes_id(value) { this_edit_mes_id = value; },
        get characters() { return characters; },
        get chat() { return chat; },
        get chatElement() { return chatElement; },
        get chat_metadata() { return chat_metadata; },
        get extension_prompts() { return extension_prompts; },
        get is_delete_mode() { return is_delete_mode; },
        get is_send_press() { return is_send_press; },
        get mainChatMessageUiState() { return mainChatMessageUiState; },
        get mainChatVisibleStartIndices() { return mainChatVisibleStartIndices; },
        get name2() { return name2; },
        get neutralCharacterName() { return neutralCharacterName; },
        get selected_button() { return selected_button; },
        get this_chid() { return this_chid; },
        get this_edit_mes_id() { return this_edit_mes_id; },
        get DEFAULT_SAVE_EDIT_TIMEOUT() { return DEFAULT_SAVE_EDIT_TIMEOUT; },
        get power_user() { return power_user; },
        get itemizedPrompts() { return itemizedPrompts; },
        get loader() { return loader; },
        get system_message_types() { return system_message_types; },
        get chatSaveTimeout() { return chatSaveTimeout; },
        set chatSaveTimeout(value) { chatSaveTimeout = value; },
        get isChatSaving() { return isChatSaving; },
        set isChatSaving(value) { isChatSaving = value; },
        get mainChatMessageRenderGeneration() { return mainChatMessageRenderGeneration; },
        set mainChatMessageRenderGeneration(value) { mainChatMessageRenderGeneration = value; },
        get reactMainChatProjectionCleared() { return reactMainChatProjectionCleared; },
        set reactMainChatProjectionCleared(value) { reactMainChatProjectionCleared = value; },
    },
    applyStylePins: (...args) => applyStylePins(...args),
    callGenericPopup: (...args) => callGenericPopup(...args),
    cancelDebouncedChatSave: (...args) => cancelDebouncedChatSave(...args),
    cancelDebouncedMetadataSave: (...args) => cancelDebouncedMetadataSave(...args),
    clamp: (...args) => clamp(...args),
    closeMessageEditor: (...args) => closeMessageEditor(...args),
    compressRequest: (...args) => compressRequest(...args),
    consumeMainChatMessageListScrollRestore: (...args) => consumeMainChatMessageListScrollRestore(...args),
    delay: (...args) => delay(...args),
    deleteMainChatMessageListScrollSnapshot: (...args) => deleteMainChatMessageListScrollSnapshot(...args),
    equalsIgnoreCaseAndAccents: (...args) => equalsIgnoreCaseAndAccents(...args),
    flashHighlight: (...args) => flashHighlight(...args),
    getChatResult: (...args) => getChatResult(...args),
    getCurrentChatId: (...args) => getCurrentChatId(...args),
    getLastMessageId: (...args) => getLastMessageId(...args),
    getMainChatReactVisibleWindow: (...args) => getMainChatReactVisibleWindow(...args),
    hasMainChatMessageListScrollRestore: (...args) => hasMainChatMessageListScrollRestore(...args),
    humanizedDateTime: (...args) => humanizedDateTime(...args),
    isElementInViewport: (...args) => isElementInViewport(...args),
    isReactMainChatOwner: (...args) => isReactMainChatOwner(...args),
    mountReactMainChatMessageListPanel: (...args) => mountReactMainChatMessageListPanel(...args),
    persistMainChatMessageListScrollSnapshotBeforeClear: (...args) => persistMainChatMessageListScrollSnapshotBeforeClear(...args),
    queueMainChatMessageListScrollRestore: (...args) => queueMainChatMessageListScrollRestore(...args),
    redisplayChat: (...args) => redisplayChat(...args),
    renderSelectChatListReact: (...args) => renderSelectChatListReact(...args),
    saveTokenCache: (...args) => saveTokenCache(...args),
    scrollOnMediaLoad: (...args) => scrollOnMediaLoad(...args),
    select_rm_characters: (...args) => select_rm_characters(...args),
    setActiveCharacter: (...args) => setActiveCharacter(...args),
    setCharacterId: (...args) => setCharacterId(...args),
    setCharacterName: (...args) => setCharacterName(...args),
    sortMoments: (...args) => sortMoments(...args),
    t: (...args) => t(...args),
    timestampToMoment: (...args) => timestampToMoment(...args),
    unshallowCharacter: (...args) => unshallowCharacter(...args),
    updateRemoteChatName: (...args) => updateRemoteChatName(...args),
    uuidv4: (...args) => uuidv4(...args),
    waitUntilCondition: (...args) => waitUntilCondition(...args),
    get Popup() { return Popup; },
    get POPUP_TYPE() { return POPUP_TYPE; },
});

registerCharacterLifecycleShellContext({
    state: {
        get world_info() { return world_info; },
        get world_names() { return world_names; },
        get characters() { return characters; },
        get chat() { return chat; },
        get chat_metadata() { return chat_metadata; },
        get create_save() { return create_save; },
        get default_avatar() { return default_avatar; },
        get depth_prompt_depth_default() { return depth_prompt_depth_default; },
        get depth_prompt_role_default() { return depth_prompt_role_default; },
        get fav_ch_checked() { return fav_ch_checked; },
        get is_send_press() { return is_send_press; },
        get menu_type() { return menu_type; },
        get name2() { return name2; },
        get neutralCharacterName() { return neutralCharacterName; },
        get settingsReady() { return settingsReady; },
        get this_chid() { return this_chid; },
        get accountStorage() { return accountStorage; },
        get extension_settings() { return extension_settings; },
        get favsToHotswap() { return favsToHotswap; },
        get tag_map() { return tag_map; },
        get tags() { return tags; },
        get active_character() { return active_character; },
        set active_character(value) { active_character = value; },
        get crop_data() { return crop_data; },
        set crop_data(value) { crop_data = value; },
        get isCharacterDeleteReconcileInProgress() { return isCharacterDeleteReconcileInProgress; },
        set isCharacterDeleteReconcileInProgress(value) { isCharacterDeleteReconcileInProgress = value; },
        get characterDeleteReconcileGeneration() { return characterDeleteReconcileGeneration; },
        set characterDeleteReconcileGeneration(value) { characterDeleteReconcileGeneration = value; },
    },
    t: (...args) => t(...args),
    applyCharacterAuthoringSaveModel: (...args) => applyCharacterAuthoringSaveModel(...args),
    cancelDebounce: (...args) => cancelDebounce(...args),
    clearChat: (...args) => clearChat(...args),
    closeCurrentChatForDelete: (...args) => closeCurrentChatForDelete(...args),
    createTagMapFromList: (...args) => createTagMapFromList(...args),
    delay: (...args) => delay(...args),
    ensureImageFormatSupported: (...args) => ensureImageFormatSupported(...args),
    formatCreatorNotes: (...args) => formatCreatorNotes(...args),
    getCharaFilename: (...args) => getCharaFilename(...args),
    getCharacterSource: (...args) => getCharacterSource(...args),
    getCharacters: (...args) => getCharacters(...args),
    getCurrentCharacterAuthoringMode: (...args) => getCurrentCharacterAuthoringMode(...args),
    getCurrentCharacterAuthoringSource: (...args) => getCurrentCharacterAuthoringSource(...args),
    getFirstMessage: (...args) => getFirstMessage(...args),
    getOneCharacter: (...args) => getOneCharacter(...args),
    getPastCharacterChats: (...args) => getPastCharacterChats(...args),
    getThumbnailUrl: (...args) => getThumbnailUrl(...args),
    isExternalMediaAllowed: (...args) => isExternalMediaAllowed(...args),
    isMobile: (...args) => isMobile(...args),
    markPerfInteractionMetric: (...args) => markPerfInteractionMetric(...args),
    printMessages: (...args) => printMessages(...args),
    queueReactCharacterAuthoringRemount: (...args) => queueReactCharacterAuthoringRemount(...args),
    reloadCurrentChat: (...args) => reloadCurrentChat(...args),
    removeCharacterFromUI: (...args) => removeCharacterFromUI(...args),
    renamePastChats: (...args) => renamePastChats(...args),
    renameTagKey: (...args) => renameTagKey(...args),
    saveCharacterDebounced: (...args) => saveCharacterDebounced(...args),
    saveChatConditional: (...args) => saveChatConditional(...args),
    saveSettingsDebounced: (...args) => saveSettingsDebounced(...args),
    selectCharacterById: (...args) => selectCharacterById(...args),
    select_rm_characters: (...args) => select_rm_characters(...args),
    select_rm_create: (...args) => select_rm_create(...args),
    select_rm_info: (...args) => select_rm_info(...args),
    setCharacterId: (...args) => setCharacterId(...args),
    setMenuType: (...args) => setMenuType(...args),
    setTemporaryChatStatus: (...args) => setTemporaryChatStatus(...args),
    timestampToMoment: (...args) => timestampToMoment(...args),
    unshallowCharacter: (...args) => unshallowCharacter(...args),
    updateFavButtonState: (...args) => updateFavButtonState(...args),
    callGenericPopup: (...args) => callGenericPopup(...args),
    charSetAuxWorlds: (...args) => charSetAuxWorlds(...args),
    charUpdatePrimaryWorld: (...args) => charUpdatePrimaryWorld(...args),
    checkEmbeddedWorld: (...args) => checkEmbeddedWorld(...args),
    flushDeletedWorldsFromUI: (...args) => flushDeletedWorldsFromUI(...args),
    setWorldInfoButtonClass: (...args) => setWorldInfoButtonClass(...args),
    showWorldInfoCascadeDialog: (...args) => showWorldInfoCascadeDialog(...args),
    get Popup() { return Popup; },
    get POPUP_RESULT() { return POPUP_RESULT; },
    get POPUP_TYPE() { return POPUP_TYPE; },
});

registerMessageShellContext({
    state: {
        get chat() { return chat; },
        get chat_metadata() { return chat_metadata; },
        get characters() { return characters; },
        get chatElement() { return chatElement; },
        get converter() { return converter; },
        get default_avatar() { return default_avatar; },
        get generation_started() { return generation_started; },
        get main_api() { return main_api; },
        get mesForShowdownParse() { return mesForShowdownParse; },
        set mesForShowdownParse(value) { mesForShowdownParse = value; },
        get messageTemplate() { return messageTemplate; },
        get name1() { return name1; },
        get name2() { return name2; },
        get swipes() { return swipes; },
        get systemUserName() { return systemUserName; },
        get system_avatar() { return system_avatar; },
        get this_chid() { return this_chid; },
        get itemizedPrompts() { return itemizedPrompts; },
        get user_avatar() { return user_avatar; },
        get power_user() { return power_user; },
        get COMMENT_NAME_DEFAULT() { return COMMENT_NAME_DEFAULT; },
        get PromptReasoning() { return PromptReasoning; },
        get DOMPurify() { return DOMPurify; },
        get SVGInject() { return SVGInject; },
        get hljs() { return hljs; },
        get moment() { return moment; },
        get AudioPlayer() { return AudioPlayer; },
        get regex_placement() { return regex_placement; },
    },
    getRegexedString: (...args) => getRegexedString(...args),
    t: (strings, ...values) => t(strings, ...values),
    applyCharacterTagsToMessageDivs: (...args) => applyCharacterTagsToMessageDivs(...args),
    canUseNegativeLookbehind: (...args) => canUseNegativeLookbehind(...args),
    collapseNewlines: (...args) => collapseNewlines(...args),
    copyText: (...args) => copyText(...args),
    decodeStyleTags: (...args) => decodeStyleTags(...args),
    delay: (...args) => delay(...args),
    encodeStyleTags: (...args) => encodeStyleTags(...args),
    escapeHtml: (...args) => escapeHtml(...args),
    escapeRegex: (...args) => escapeRegex(...args),
    fixMarkdown: (...args) => fixMarkdown(...args),
    getGeneratingApi: (...args) => getGeneratingApi(...args),
    getGeneratingModel: (...args) => getGeneratingModel(...args),
    getMessageTimeStamp: (...args) => getMessageTimeStamp(...args),
    getStoppingStrings: (...args) => getStoppingStrings(...args),
    getThumbnailUrl: (...args) => getThumbnailUrl(...args),
    getTokenCountAsync: (...args) => getTokenCountAsync(...args),
    humanFileSize: (...args) => humanFileSize(...args),
    isDataURL: (...args) => isDataURL(...args),
    isReactMainChatOwner: (...args) => isReactMainChatOwner(...args),
    mountReactMainChatMessageListPanel: (...args) => mountReactMainChatMessageListPanel(...args),
    onlyUnique: (...args) => onlyUnique(...args),
    parseReasoningInSwipes: (...args) => parseReasoningInSwipes(...args),
    refreshSwipeButtons: (...args) => refreshSwipeButtons(...args),
    saveBase64AsFile: (...args) => saveBase64AsFile(...args),
    saveImageToMessage: (...args) => saveImageToMessage(...args),
    scheduleMainChatMessageListPanelRefresh: (...args) => scheduleMainChatMessageListPanelRefresh(...args),
    substituteParams: (...args) => substituteParams(...args),
    timestampToMoment: (...args) => timestampToMoment(...args),
    trimToEndSentence: (...args) => trimToEndSentence(...args),
    updateEditArrowClasses: (...args) => updateEditArrowClasses(...args),
    updateReasoningUI: (...args) => updateReasoningUI(...args),
    updateSwipeCounter: (...args) => updateSwipeCounter(...args),
});
registerDomHandlersShellContext({
    state: {
        get amount_gen() { return amount_gen; },
        set amount_gen(value) { amount_gen = value; },
        get animation_duration() { return animation_duration; },
        get animation_easing() { return animation_easing; },
        get characters() { return characters; },
        get charDragDropHandler() { return charDragDropHandler; },
        set charDragDropHandler(value) { charDragDropHandler = value; },
        get chat() { return chat; },
        get chatDragDropHandler() { return chatDragDropHandler; },
        set chatDragDropHandler(value) { chatDragDropHandler = value; },
        get chatElement() { return chatElement; },
        get chat_metadata() { return chat_metadata; },
        get create_save() { return create_save; },
        get css_send_form_display() { return css_send_form_display; },
        get dialogueCloseStop() { return dialogueCloseStop; },
        set dialogueCloseStop(value) { dialogueCloseStop = value; },
        get dialogueResolve() { return dialogueResolve; },
        set dialogueResolve(value) { dialogueResolve = value; },
        get DragAndDropHandler() { return DragAndDropHandler; },
        get fav_ch_checked() { return fav_ch_checked; },
        get is_advanced_char_open() { return is_advanced_char_open; },
        set is_advanced_char_open(value) { is_advanced_char_open = value; },
        get isChatSaving() { return isChatSaving; },
        get is_delete_mode() { return is_delete_mode; },
        set is_delete_mode(value) { is_delete_mode = value; },
        get isExportPopupOpen() { return isExportPopupOpen; },
        get is_send_press() { return is_send_press; },
        set is_send_press(value) { is_send_press = value; },
        get loader() { return loader; },
        get mainChatMessageActionsController() { return mainChatMessageActionsController; },
        set mainChatMessageActionsController(value) { mainChatMessageActionsController = value; },
        get max_context() { return max_context; },
        set max_context(value) { max_context = value; },
        get menu_type() { return menu_type; },
        get name1() { return name1; },
        get name2() { return name2; },
        get neutralCharacterName() { return neutralCharacterName; },
        get Popup() { return Popup; },
        get POPUP_RESULT() { return POPUP_RESULT; },
        get popup_type() { return popup_type; },
        set popup_type(value) { popup_type = value; },
        get POPUP_TYPE() { return POPUP_TYPE; },
        get power_user() { return power_user; },
        get scrollLock() { return scrollLock; },
        set scrollLock(value) { scrollLock = value; },
        get selected_button() { return selected_button; },
        set selected_button(value) { selected_button = value; },
        get SimpleMutex() { return SimpleMutex; },
        get streamingProcessor() { return streamingProcessor; },
        get swipes() { return swipes; },
        set swipes(value) { swipes = value; },
        get swipeState() { return swipeState; },
        get tag_import_setting() { return tag_import_setting; },
        get this_chid() { return this_chid; },
        get this_del_mes() { return this_del_mes; },
        set this_del_mes(value) { this_del_mes = value; },
        get this_edit_mes_id() { return this_edit_mes_id; },
    },
    bootstrapWorkspace: (...args) => bootstrapWorkspace(...args),
    buildCascadeSectionHtml: (...args) => buildCascadeSectionHtml(...args),
    buildTemporaryChatDeleteWarningHtml: (...args) => buildTemporaryChatDeleteWarningHtml(...args),
    callGenericPopup: (...args) => callGenericPopup(...args),
    cancelStatusCheck: (...args) => cancelStatusCheck(...args),
    cancelTtsPlay: (...args) => cancelTtsPlay(...args),
    chooseBogusFolder: (...args) => chooseBogusFolder(...args),
    closeCharacterExportPopup: (...args) => closeCharacterExportPopup(...args),
    closeCurrentChat: (...args) => closeCurrentChat(...args),
    closeMessageEditor: (...args) => closeMessageEditor(...args),
    copyText: (...args) => copyText(...args),
    createChatMessageActionsController: (...args) => createChatMessageActionsController(...args),
    createOrEditCharacter: (...args) => createOrEditCharacter(...args),
    debounce: (...args) => debounce(...args),
    delay: (...args) => delay(...args),
    delChat: (...args) => delChat(...args),
    deleteCharacter: (...args) => deleteCharacter(...args),
    deleteMessage: (...args) => deleteMessage(...args),
    displayPastChats: (...args) => displayPastChats(...args),
    doCharListDisplaySwitch: (...args) => doCharListDisplaySwitch(...args),
    doDrawerOpenClick: (...args) => doDrawerOpenClick(...args),
    doNavbarIconClick: (...args) => doNavbarIconClick(...args),
    doNewChat: (...args) => doNewChat(...args),
    download: (...args) => download(...args),
    dragElement: (...args) => dragElement(...args),
    duplicateCharacter: (...args) => duplicateCharacter(...args),
    formatCreatorNotes: (...args) => formatCreatorNotes(...args),
    Generate: (...args) => Generate(...args),
    getCharacterDeleteDialogTitle: (...args) => getCharacterDeleteDialogTitle(...args),
    getCharacters: (...args) => getCharacters(...args),
    getCharacterSource: (...args) => getCharacterSource(...args),
    getOptionsPopper: (...args) => getOptionsPopper(...args),
    getRequestHeaders: (...args) => getRequestHeaders(...args),
    getUserAvatar: (...args) => getUserAvatar(...args),
    handleUnifiedImport: (...args) => handleUnifiedImport(...args),
    hideSwipeButtons: (...args) => hideSwipeButtons(...args),
    importCharacter: (...args) => importCharacter(...args),
    importCharacterChat: (...args) => importCharacterChat(...args),
    importEmbeddedWorldInfo: (...args) => importEmbeddedWorldInfo(...args),
    importFromExternalUrl: (...args) => importFromExternalUrl(...args),
    importFromURL: (...args) => importFromURL(...args),
    importTags: (...args) => importTags(...args),
    initCharacterSearch: (...args) => initCharacterSearch(...args),
    isDataURL: (...args) => isDataURL(...args),
    isReactMainChatOwner: (...args) => isReactMainChatOwner(...args),
    isValidUrl: (...args) => isValidUrl(...args),
    loadEarlierChatMessages: (...args) => loadEarlierChatMessages(...args),
    loadMovingUIState: (...args) => loadMovingUIState(...args),
    messageEdit: (...args) => messageEdit(...args),
    messageEditAuto: (...args) => messageEditAuto(...args),
    messageEditCancel: (...args) => messageEditCancel(...args),
    messageEditDone: (...args) => messageEditDone(...args),
    messageEditMove: (...args) => messageEditMove(...args),
    mountAiConfigPanel: (...args) => mountAiConfigPanel(...args),
    mountApiConnectionsPanel: (...args) => mountApiConnectionsPanel(...args),
    mountCharacterContextMenu: (...args) => mountCharacterContextMenu(...args),
    mountCharacterPopup: (...args) => mountCharacterPopup(...args),
    mountChatComposer: (...args) => mountChatComposer(...args),
    mountDialogueDelMesControls: (...args) => mountDialogueDelMesControls(...args),
    mountDialoguePopupControls: (...args) => mountDialoguePopupControls(...args),
    mountOnboardingActions: (...args) => mountOnboardingActions(...args),
    mountExportFormatPopup: (...args) => mountExportFormatPopup(...args),
    mountOptionsMenu: (...args) => mountOptionsMenu(...args),
    mountReactMainChatMessageListPanel: (...args) => mountReactMainChatMessageListPanel(...args),
    mountReactWorkspaceShellChromeHost: (...args) => mountReactWorkspaceShellChromeHost(...args),
    mountRightNavPanel: (...args) => mountRightNavPanel(...args),
    mountSelectChatPopup: (...args) => mountSelectChatPopup(...args),
    newAssistantChat: (...args) => newAssistantChat(...args),
    openAlternateGreetings: (...args) => openAlternateGreetings(...args),
    openCharacterChat: (...args) => openCharacterChat(...args),
    openCharacterWorldPopup: (...args) => openCharacterWorldPopup(...args),
    openMessageDelete: (...args) => openMessageDelete(...args),
    pauseScriptExecution: (...args) => pauseScriptExecution(...args),
    processDroppedFiles: (...args) => processDroppedFiles(...args),
    queueReactCharacterAuthoringRemount: (...args) => queueReactCharacterAuthoringRemount(...args),
    read_avatar_load: (...args) => read_avatar_load(...args),
    renameCharacter: (...args) => renameCharacter(...args),
    renameChat: (...args) => renameChat(...args),
    renderTemplateAsync: (...args) => renderTemplateAsync(...args),
    resetMovableStyles: (...args) => resetMovableStyles(...args),
    resetScrollHeight: (...args) => resetScrollHeight(...args),
    runMainChatVisibleMessageActionsShellAction: (...args) => runMainChatVisibleMessageActionsShellAction(...args),
    saveCharacterDebounced: (...args) => saveCharacterDebounced(...args),
    saveChatConditional: (...args) => saveChatConditional(...args),
    saveSettingsDebounced: (...args) => saveSettingsDebounced(...args),
    selectCharacterById: (...args) => selectCharacterById(...args),
    selectImportedChar: (...args) => selectImportedChar(...args),
    selectRightMenuWithAnimation: (...args) => selectRightMenuWithAnimation(...args),
    select_rm_characters: (...args) => select_rm_characters(...args),
    select_rm_create: (...args) => select_rm_create(...args),
    select_selected_character: (...args) => select_selected_character(...args),
    sendTextareaMessage: (...args) => sendTextareaMessage(...args),
    setCharacterSettingsOverrides: (...args) => setCharacterSettingsOverrides(...args),
    setMainChatMessageUiState: (...args) => setMainChatMessageUiState(...args),
    showBranchChatButtons: (...args) => showBranchChatButtons(...args),
    showDeleteConfirmWithCascade: (...args) => showDeleteConfirmWithCascade(...args),
    showSwipeButtons: (...args) => showSwipeButtons(...args),
    stopGeneration: (...args) => stopGeneration(...args),
    stopScriptExecution: (...args) => stopScriptExecution(...args),
    t: (strings, ...values) => t(strings, ...values),
    toggleCharacterExportPopup: (...args) => toggleCharacterExportPopup(...args),
    getVisibleCharacterExportTrigger: (...args) => getVisibleCharacterExportTrigger(...args),
    toggleDrawer: (...args) => toggleDrawer(...args),
    translate: (...args) => translate(...args),
    updateCharacterRow: (...args) => updateCharacterRow(...args),
    updateCharListGridToggleLabel: (...args) => updateCharListGridToggleLabel(...args),
    updateFavButtonState: (...args) => updateFavButtonState(...args),
    updateViewMessageIds: (...args) => updateViewMessageIds(...args),
    waitUntilCondition: (...args) => waitUntilCondition(...args),
});


export function isReactCharacterLibraryPanelEnabled() {
    // Character Library is React sole-owner; feature flag is retired.
    return true;
}

const WORLD_INFO_REACT_HOST_ID = 'emberdesk-react-world-info-panel-host';
const EXTENSIONS_HOST_REACT_HOST_ID = 'emberdesk-react-extensions-host-panel-host';
const CHARACTER_AUTHORING_REACT_HOST_ID = 'emberdesk-react-character-authoring-panel-host';
const WORKSPACE_SHELL_CHROME_HOST_ID = 'emberdesk-react-workspace-shell-chrome-host';
const MAIN_CHAT_SCROLL_RESTORE_THRESHOLD_PX = 12;
const STREAMING_TRANSPORT_TERMINAL_PHASES = new Set(['stopped', 'completed', 'error']);
const REACT_CHARACTER_LIBRARY_PANEL_ASSET_PATH = '/react/login/assets/character-library-panel.js';
const REACT_CHARACTER_LIBRARY_PANEL_ASSET_CACHE_KEY = Date.now().toString(36);
const REACT_CHARACTER_LIBRARY_TOOLBAR_HOST_ID = 'emberdesk-react-character-library-toolbar';
let reactCharacterLibraryPanelModulePromise = null;
let reactCharacterLibraryPanelMounted = false;
let reactCharacterLibraryToolbarMounted = false;
const characterLibraryToolbarState = {
    searchQuery: '',
    sortValue: '0:::',
    hasSearchQuery: false,
    hasSortValue: false,
};
let mainChatMessageListBridgeObserversBound = false;
let mainChatMessageListBridgeRefreshFrame = 0;
let mainChatMessageListBridgeSendFormObserver = null;
let mainChatMessageListBridgeFormShellObserver = null;
let mainChatMessageListBridgeBodyObserver = null;
let mainChatMessageActionsController = null;
let mainChatMessageListPendingRestoreChatId = null;
let mainChatMessageListScrollRestoreScheduledChatId = null;
let mainChatMessageRenderGeneration = 0;
let mainChatComposerCommandBindings = null;
let mainChatComposerFocusRestoreRequested = false;
let reactMainChatProjectionCleared = false;
const mainChatVisibleStartIndices = new Map();
const mainChatVisibleGenerationMutex = new SimpleMutex(sendTextareaMessage);
const mainChatMessageUiState = new Map();

function getReactCharacterLibraryPanelAssetPath() {
    const cacheKey = globalThis.__emberDeskReactCharacterLibraryPanelAssetCacheKey ??= REACT_CHARACTER_LIBRARY_PANEL_ASSET_CACHE_KEY;
    return `${REACT_CHARACTER_LIBRARY_PANEL_ASSET_PATH}?v=${encodeURIComponent(String(cacheKey))}`;
}

function ensureWorkspaceShellChromeHost() {
    let host = document.getElementById(WORKSPACE_SHELL_CHROME_HOST_ID);
    if (host) {
        return host;
    }

    host = document.createElement('div');
    host.id = WORKSPACE_SHELL_CHROME_HOST_ID;
    host.setAttribute('data-doc-id', 'feature.next_workspace_shell page.chat_workspace');
    const sheld = document.getElementById('sheld');
    if (sheld?.parentElement) {
        sheld.parentElement.insertBefore(host, sheld);
    } else {
        document.body.prepend(host);
    }
    return host;
}

function getWorkspaceShellActiveContext() {
    if (this_chid !== undefined) {
        return 'character';
    }

    return typeof name2 === 'string' && name2.trim() ? 'assistant' : 'none';
}

function getWorkspaceShellChromeState() {
    const activeContext = getWorkspaceShellActiveContext();
    const character = this_chid !== undefined ? characters[this_chid] : null;
    const contextTitle = activeContext === 'character'
        ? (character?.name || name2 || 'Character')
        : activeContext === 'assistant'
            ? 'EmberDesk'
            : '';

    return {
        activeContext,
        contextTitle,
        status: activeContext === 'none' ? 'empty' : 'success',
    };
}

const WORKSPACE_DRAWER_OPENED_STORAGE_KEYS = {
    'right-nav-panel': 'NavOpened',
    'left-nav-panel': 'LNavOpened',
    WorldInfo: 'WINavOpened',
};

// Drawer-content host ids reachable through the openWorkspaceDrawer runtime
// command. These are the legacy-owned surfaces the Settings overlay links to.
const WORKSPACE_DRAWER_COMMAND_HOST_IDS = new Set([
    'left-nav-panel',
    'rm_api_block',
    'AdvancedFormatting',
    'user-settings-block',
    'PersonaManagement',
    'RegexPanel',
]);

export async function openWorkspaceChildSlotHost(hostId) {
    const drawer = document.getElementById(hostId);
    if (!(drawer instanceof HTMLElement)) {
        return;
    }

    openWorkspaceChildSlotHostImmediate(hostId);
}

export function closeWorkspaceChildSlotHost(hostId, { force = false } = {}) {
    const drawer = document.getElementById(hostId);
    if (!(drawer instanceof HTMLElement) || (!force && drawer.classList.contains('pinnedOpen'))) {
        return false;
    }

    if (force) {
        drawer.classList.remove('pinnedOpen');
    }
    drawer.classList.remove('openDrawer');
    drawer.classList.add('closedDrawer');
    const storageKey = WORKSPACE_DRAWER_OPENED_STORAGE_KEYS[hostId];
    if (storageKey) {
        accountStorage.setItem(storageKey, 'false');
    }
    return true;
}

function openWorkspaceChildSlotHostImmediate(hostId) {
    const drawer = document.getElementById(hostId);
    if (!(drawer instanceof HTMLElement)) {
        return;
    }

    document.querySelectorAll('.openDrawer:not(.pinnedOpen)').forEach(openDrawer => {
        if (openDrawer !== drawer) {
            openDrawer.classList.remove('openDrawer');
            openDrawer.classList.add('closedDrawer');
        }
    });

    drawer.classList.add('openDrawer');
    drawer.classList.remove('closedDrawer');
    drawer.style.opacity = '1';
    const storageKey = WORKSPACE_DRAWER_OPENED_STORAGE_KEYS[hostId];
    if (storageKey) {
        accountStorage.setItem(storageKey, 'true');
    }
}

function showWorkspaceChildSlotContent(selectedMenuId) {
    const normalizedMenuId = String(selectedMenuId ?? '').replace('#', '');
    const displayModes = {
        rm_api_block: 'grid',
        rm_characters_block: 'flex',
    };

    const reactAuthoringOwnsPanel = normalizedMenuId === 'rm_ch_create_block'
        && Boolean(getWorkspaceReactFeatures()?.reactPanels?.characterAuthoring);
    $('#result_info').toggle(normalizedMenuId === 'rm_ch_create_block' && !reactAuthoringOwnsPanel);
    $('#rm_button_selected_ch h2').toggle(!reactAuthoringOwnsPanel);
    document.querySelectorAll('#right-nav-panel .right_menu').forEach(menu => {
        if (!(menu instanceof HTMLElement)) {
            return;
        }

        if (normalizedMenuId === menu.id) {
            menu.style.display = displayModes[menu.id] ?? 'block';
            menu.style.opacity = '1';
        } else {
            menu.style.display = 'none';
        }
    });
}

async function ensureWorkspaceShellDeferredPanel(panelId) {
    try {
        await ensurePanel(panelId);
    } catch (error) {
        console.warn('React workspace shell could not preload deferred panel.', panelId, error);
    }
}

function waitForWorkspaceShellPanelOpenTask() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

function getWorkspaceChildSlotHostId(slotKey) {
    return {
        characterLibrary: 'right-nav-panel',
        worldInfo: 'WorldInfo',
        extensionsHost: 'rm_extensions_block',
        characterAuthoring: 'right-nav-panel',
        aiConfigDrawer: 'left-nav-panel',
        regex: 'RegexPanel',
    }[slotKey];
}

function deactivateWorkspaceChildSlotByKind(slotKey, options = {}) {
    const hostId = getWorkspaceChildSlotHostId(slotKey);
    const closed = hostId ? closeWorkspaceChildSlotHost(hostId, options) : false;
    return {
        kind: slotKey,
        mounted: false,
        status: closed ? 'closed' : 'idle',
    };
}

function createWorkspaceShellPanelResult(kind, resultOrMounted) {
    if (resultOrMounted && typeof resultOrMounted === 'object') {
        return resultOrMounted;
    }

    return resultOrMounted
        ? { kind, mounted: true, status: 'mounted' }
        : { kind, mounted: false, reason: 'feature-disabled', status: 'fallback' };
}

async function openWorkspaceShellCharacterLibrary() {
    openWorkspaceChildSlotHostImmediate('right-nav-panel');
    if (menu_type !== 'characters') {
        selected_button = 'characters';
        setMenuType('characters');
        showWorkspaceChildSlotContent('rm_characters_block');
    }

    return createWorkspaceShellPanelResult('characterLibrary', isReactCharacterLibraryPanelEnabled());
}

async function openWorkspaceShellCharacterAuthoring() {
    openWorkspaceChildSlotHostImmediate('right-nav-panel');
    const hasSelectedCharacter = this_chid !== undefined && characters[this_chid];
    selected_button = hasSelectedCharacter ? 'character_edit' : 'create';
    setMenuType(hasSelectedCharacter ? 'character_edit' : 'create');
    if (hasSelectedCharacter) {
        select_selected_character(this_chid, { switchMenu: false });
    } else {
        select_rm_create({ switchMenu: false });
    }
    showWorkspaceChildSlotContent('rm_ch_create_block');
    return createWorkspaceShellPanelResult('characterAuthoring', await mountReactCharacterAuthoringPanel());
}

async function activateWorkspaceShellSlot(slotKey) {
    switch (slotKey) {
        case 'characterLibrary':
            return openWorkspaceShellCharacterLibrary();
        case 'worldInfo':
            return openWorkspaceShellWorldInfo();
        case 'extensionsHost':
            return openWorkspaceShellExtensions();
        case 'characterAuthoring':
            return openWorkspaceShellCharacterAuthoring();
        case 'aiConfigDrawer':
            return openWorkspaceShellAiConfigDrawer();
        case 'regex':
            return openWorkspaceShellRegex();
        default:
            throw new Error(`Unsupported workspace shell slot: ${String(slotKey)}`);
    }
}

function deactivateWorkspaceShellSlot(slotKey) {
    const kind = {
        characterLibrary: 'characterLibrary',
        worldInfo: 'worldInfo',
        extensionsHost: 'extensionsHost',
        characterAuthoring: 'characterAuthoring',
        aiConfigDrawer: 'aiConfigDrawer',
        regex: 'regex',
    }[slotKey];

    if (!kind) {
        throw new Error(`Unsupported workspace shell slot: ${String(slotKey)}`);
    }

    return deactivateWorkspaceChildSlotByKind(slotKey, { force: true });
}

function setWorkspaceShellSlotPinned(slotKey, pinned) {
    const kind = slotKey;
    const drawerId = getWorkspaceChildSlotHostId(slotKey);
    const drawer = drawerId ? document.getElementById(drawerId) : null;

    if (!(drawer instanceof HTMLElement)) {
        throw new Error(`Workspace shell slot has no mount target: ${String(slotKey)}`);
    }

    drawer.classList.toggle('pinnedOpen', Boolean(pinned));
    return { kind, mounted: true, status: 'mounted' };
}


let workspaceSettingsOverlayPanelKind = 'settings';
let workspaceSettingsOverlayCloseGeneration = 0;

async function openWorkspaceSettingsOverlay({ tab = null, panelKind = 'settings' } = {}) {
    // A new open invalidates any deferred close queued by a previous shell click.
    workspaceSettingsOverlayCloseGeneration += 1;
    workspaceSettingsOverlayPanelKind = panelKind;
    const result = await mountReactSettingsOverlay({
        initialTab: tab,
        panelKind,
        runtime: reactRuntimePort,
        onRequestClose: () => {
            void closeWorkspaceSettingsOverlay();
        },
    });
    return createWorkspaceShellPanelResult(panelKind, {
        kind: panelKind,
        mounted: result?.mounted !== false,
        status: result?.status === 'error' ? 'error' : 'success',
        reason: result?.reason,
    });
}

async function closeWorkspaceSettingsOverlay(reservedGeneration = null) {
    const panelKind = workspaceSettingsOverlayPanelKind || 'settings';
    const closeGeneration = Number.isInteger(reservedGeneration)
        ? reservedGeneration
        : workspaceSettingsOverlayCloseGeneration + 1;
    workspaceSettingsOverlayCloseGeneration = Math.max(workspaceSettingsOverlayCloseGeneration, closeGeneration);
    // Defer unmount so the originating click/keyboard event can finish cleanly.
    await new Promise(resolve => {
        window.setTimeout(() => {
            if (closeGeneration !== workspaceSettingsOverlayCloseGeneration) {
                resolve();
                return;
            }
            void unmountReactSettingsOverlay().finally(resolve);
        }, 0);
    });
    return createWorkspaceShellPanelResult(panelKind, {
        kind: panelKind,
        mounted: false,
        status: 'success',
    });
}

export async function openWorkspaceShellWorldInfo() {
    await waitForWorkspaceShellPanelOpenTask();
    // React sole-owner: open drawer and mount workbench; deferred body is hidden activation-rules DOM only.
    await openWorkspaceChildSlotHost('WorldInfo');
    await waitForWorkspaceShellPanelOpenTask();
    const worldInfoMount = await mountReactWorldInfoPanel();
    void ensureWorkspaceShellDeferredPanel('world-info-body');
    return createWorkspaceShellPanelResult('worldInfo', worldInfoMount);
}

async function openWorkspaceShellExtensions() {
    await waitForWorkspaceShellPanelOpenTask();
    await openWorkspaceChildSlotHost('rm_extensions_block');
    await waitForWorkspaceShellPanelOpenTask();
    return createWorkspaceShellPanelResult('extensionsHost', await mountReactExtensionsHostPanel());
}

async function openWorkspaceShellRegex() {
    await waitForWorkspaceShellPanelOpenTask();
    // React-owned regex workbench mounts at startup via the regex feature init;
    // opening the slot only needs to reveal the drawer.
    await openWorkspaceChildSlotHost('RegexPanel');
    await waitForWorkspaceShellPanelOpenTask();
    return createWorkspaceShellPanelResult('regex', {
        kind: 'regex',
        mounted: true,
        status: 'success',
    });
}

async function openWorkspaceShellAiConfigDrawer() {
    await waitForWorkspaceShellPanelOpenTask();
    // Legacy-owned drawer: AI Response Configuration (chat completion preset
    // row, sampling controls, Prompt Manager). React markup inside was mounted
    // by the mountAiConfigPanel startup stage; nothing else needs mounting here.
    await openWorkspaceChildSlotHost('left-nav-panel');
    await waitForWorkspaceShellPanelOpenTask();
    return createWorkspaceShellPanelResult('aiConfigDrawer', {
        kind: 'aiConfigDrawer',
        mounted: true,
        status: 'success',
    });
}

async function closeWorkspacePanel(kind) {
    if (kind === 'settings' || kind === 'aiConfig' || kind === 'advancedFormatting') {
        // Reserve the close generation before awaiting; a superseding reopen
        // must always observe a higher generation or the deferred unmount
        // would unmount the freshly mounted overlay.
        workspaceSettingsOverlayCloseGeneration += 1;
        const reservedGeneration = workspaceSettingsOverlayCloseGeneration;
        await waitForWorkspaceShellPanelOpenTask();
        return closeWorkspaceSettingsOverlay(reservedGeneration);
    }
    await waitForWorkspaceShellPanelOpenTask();
    return createWorkspaceShellPanelResult(kind, { kind, mounted: false, status: 'success' });
}

function getWorkspaceShellCommands() {
    return {
        activateWorkspaceShellSlot,
        deactivateWorkspaceShellSlot,
        setWorkspaceShellSlotPinned,
        openAIConfig: () => openWorkspaceSettingsOverlay({ tab: 'providers', panelKind: 'aiConfig' }),
        openFormatting: () => openWorkspaceSettingsOverlay({ tab: 'advanced', panelKind: 'advancedFormatting' }),
        openCharacterLibrary: openWorkspaceShellCharacterLibrary,
        openWorldInfo: openWorkspaceShellWorldInfo,
        openExtensions: openWorkspaceShellExtensions,
        openSettings: () => openWorkspaceSettingsOverlay({ tab: null, panelKind: 'settings' }),
        closeWorkspacePanel,
        openCharacterAuthoring: openWorkspaceShellCharacterAuthoring,
        openAIConfigDrawer: openWorkspaceShellAiConfigDrawer,
        openRegex: openWorkspaceShellRegex,
    };
}

async function mountReactWorkspaceShellChromeHost() {
    const host = ensureWorkspaceShellChromeHost();
    host.dataset.reactWorkspaceShellChromeStatus = 'loading';
    host.setAttribute('data-react-workspace-shell-chrome-status', 'loading');

    const result = await mountReactWorkspaceShellChrome({
        container: host,
        state: getWorkspaceShellChromeState(),
        commands: getWorkspaceShellCommands(),
        runtime: reactRuntimePort,
        features: getWorkspaceReactFeatures(),
    });

    host.dataset.reactWorkspaceShellChromeStatus = result.status;
    host.setAttribute('data-react-workspace-shell-chrome-status', result.status);

    return result;
}

function getMainChatMessageListScrollSnapshotStore() {
    if (!(globalThis.__emberDeskMainChatMessageListScrollSnapshots instanceof Map)) {
        globalThis.__emberDeskMainChatMessageListScrollSnapshots = new Map();
    }

    return globalThis.__emberDeskMainChatMessageListScrollSnapshots;
}

function deleteMainChatMessageListScrollSnapshot(chatId) {
    const normalizedChatId = typeof chatId === 'string' ? chatId.trim() : '';
    if (!normalizedChatId) {
        return;
    }

    getMainChatMessageListScrollSnapshotStore().delete(normalizedChatId);
}

function queueMainChatMessageListScrollRestore(chatId) {
    const normalizedChatId = typeof chatId === 'string' ? chatId.trim() : '';

    if (!getWorkspaceReactFeatures()?.reactPanels?.mainChatMessageList || !normalizedChatId) {
        mainChatMessageListPendingRestoreChatId = null;
        return;
    }

    mainChatMessageListPendingRestoreChatId = getMainChatMessageListScrollSnapshotStore().has(normalizedChatId)
        ? normalizedChatId
        : null;
}

function consumeMainChatMessageListScrollRestore(chatId = getCurrentChatId()) {
    const normalizedChatId = typeof chatId === 'string' ? chatId.trim() : '';
    const shouldRestore = normalizedChatId !== '' && mainChatMessageListPendingRestoreChatId === normalizedChatId;

    if (shouldRestore) {
        mainChatMessageListPendingRestoreChatId = null;
    }

    return shouldRestore;
}

function hasMainChatMessageListScrollRestore(chatId = getCurrentChatId()) {
    const normalizedChatId = typeof chatId === 'string' ? chatId.trim() : '';
    return normalizedChatId !== ''
        && mainChatMessageListPendingRestoreChatId === normalizedChatId
        && getMainChatMessageListScrollSnapshotStore().has(normalizedChatId);
}

function getMainChatMessageListScrollRestoreSnapshot(chatId = getCurrentChatId()) {
    const normalizedChatId = typeof chatId === 'string' ? chatId.trim() : '';
    if (!hasMainChatMessageListScrollRestore(normalizedChatId)) {
        return null;
    }

    const snapshot = getMainChatMessageListScrollSnapshotStore().get(normalizedChatId);
    if (!snapshot || typeof snapshot !== 'object') {
        return null;
    }

    const anchorMessageId = typeof snapshot.anchorMessageId === 'string'
        ? snapshot.anchorMessageId.trim()
        : '';
    const anchorViewportOffset = Number(snapshot.anchorViewportOffset);
    const scrollTop = Number(snapshot.scrollOffset);
    if (!anchorMessageId || !Number.isFinite(anchorViewportOffset) || !Number.isFinite(scrollTop)) {
        return null;
    }

    return {
        anchorMessageId,
        anchorViewportOffset,
        scrollTop: Math.max(scrollTop, 0),
        wasNearBottom: snapshot.wasNearBottom === true,
    };
}

function scheduleMainChatMessageListScrollRestore(chatId = getCurrentChatId()) {
    const normalizedChatId = typeof chatId === 'string' ? chatId.trim() : '';
    const restore = getMainChatMessageListScrollRestoreSnapshot(normalizedChatId);
    if (!restore || mainChatMessageListScrollRestoreScheduledChatId === normalizedChatId) {
        return;
    }

    mainChatMessageListScrollRestoreScheduledChatId = normalizedChatId;
    let attempts = 0;
    const applyRestore = () => {
        if (getCurrentChatId() !== normalizedChatId || !hasMainChatMessageListScrollRestore(normalizedChatId)) {
            mainChatMessageListScrollRestoreScheduledChatId = null;
            return;
        }

        const chatContainer = document.getElementById('chat');
        const messageRows = getMainChatRenderableMessageRows(chatContainer);
        const anchorRow = messageRows.find(row => row.getAttribute('mesid') === restore.anchorMessageId);
        if (!(chatContainer instanceof HTMLElement) || messageRows.length === 0) {
            attempts += 1;
            if (attempts < 8) {
                requestAnimationFrame(applyRestore);
                return;
            }

            mainChatMessageListScrollRestoreScheduledChatId = null;
            return;
        }

        if (anchorRow) {
            const chatRect = chatContainer.getBoundingClientRect();
            const anchorViewportOffset = anchorRow.getBoundingClientRect().top - chatRect.top;
            chatContainer.scrollTop = Math.max(
                chatContainer.scrollTop + anchorViewportOffset - restore.anchorViewportOffset,
                0,
            );
        } else {
            chatContainer.scrollTop = restore.scrollTop;
        }

        deleteMainChatMessageListScrollSnapshot(normalizedChatId);
        mainChatMessageListPendingRestoreChatId = null;
        mainChatMessageListScrollRestoreScheduledChatId = null;
    };

    requestAnimationFrame(applyRestore);
}

function getMainChatRenderableMessageRows(chatContainer) {
    if (!(chatContainer instanceof HTMLElement)) {
        return [];
    }

    // Message rows render nested inside the React island wrapper, so they are
    // descendants rather than direct children of #chat.
    return Array.from(chatContainer.querySelectorAll('.mes[mesid]'))
        .filter((node) => node.closest('#chat') === chatContainer);
}

function getMainChatDistanceFromEnd(chatContainer) {
    return Math.max(chatContainer.scrollHeight - (chatContainer.scrollTop + chatContainer.clientHeight), 0);
}

export function scheduleMainChatMessageListPanelRefresh() {
    if (mainChatMessageListBridgeRefreshFrame !== 0) {
        return;
    }

    mainChatMessageListBridgeRefreshFrame = requestAnimationFrame(() => {
        mainChatMessageListBridgeRefreshFrame = 0;
        void mountReactMainChatMessageListPanel();
    });
}

function getMainChatMessageUiStateById() {
    return Object.fromEntries(
        Array.from(mainChatMessageUiState.entries(), ([messageId, state]) => [
            messageId,
            { ...state },
        ]),
    );
}

function shiftMainChatMessageUiStateAfterSplice(startIndex, delta) {
    const normalizedStartIndex = Number(startIndex);
    const normalizedDelta = Number(delta);
    if (!Number.isInteger(normalizedStartIndex) || !Number.isInteger(normalizedDelta) || normalizedDelta === 0) {
        return;
    }

    const nextState = new Map();
    for (const [key, state] of mainChatMessageUiState.entries()) {
        const messageId = Number(key);
        if (!Number.isInteger(messageId) || messageId < normalizedStartIndex) {
            nextState.set(key, state);
            continue;
        }

        const nextMessageId = messageId + normalizedDelta;
        if (nextMessageId >= 0) {
            nextState.set(String(nextMessageId), state);
        }
    }

    mainChatMessageUiState.clear();
    for (const [key, state] of nextState.entries()) {
        mainChatMessageUiState.set(key, state);
    }
}

function setMainChatMessageUiState(messageId, patch) {
    const normalizedMessageId = Number(messageId);
    if (!Number.isInteger(normalizedMessageId) || normalizedMessageId < 0 || !patch || typeof patch !== 'object') {
        return;
    }

    const key = String(normalizedMessageId);
    const current = mainChatMessageUiState.get(key) ?? {};
    const next = { ...current, ...patch };
    const hasVisibleState = next.recoveryStatus
        || next.failureNoticeVisible
        || next.failureRetryVisible
        || next.emptyReplyRegenerateVisible
        || next.actionsExpanded
        || next.editing
        || typeof next.reasoningOpen === 'boolean'
        || next.reasoningEditing
        || next.lastInContext
        || next.swipeCounterHidden;
    if (!hasVisibleState) {
        mainChatMessageUiState.delete(key);
    } else {
        mainChatMessageUiState.set(key, next);
    }
    scheduleMainChatMessageListPanelRefresh();
}

function setMainChatMessageUiFlag(flag, enabled, messageId = null) {
    const normalizedMessageId = messageId === null || messageId === undefined
        ? null
        : Number(messageId);
    let changed = false;

    for (const [key, state] of mainChatMessageUiState.entries()) {
        if (normalizedMessageId !== null && key !== String(normalizedMessageId)) {
            continue;
        }

        if (enabled) {
            if (state[flag] === true) {
                continue;
            }
            mainChatMessageUiState.set(key, { ...state, [flag]: true });
            changed = true;
            continue;
        }

        if (state[flag] !== true) {
            continue;
        }
        const next = { ...state };
        delete next[flag];
        const hasVisibleState = next.recoveryStatus
            || next.failureNoticeVisible
            || next.failureRetryVisible
            || next.emptyReplyRegenerateVisible
            || next.actionsExpanded
            || next.editing
            || typeof next.reasoningOpen === 'boolean'
            || next.reasoningEditing
            || next.lastInContext
            || next.swipeCounterHidden;
        if (hasVisibleState) {
            mainChatMessageUiState.set(key, next);
        } else {
            mainChatMessageUiState.delete(key);
        }
        changed = true;
    }

    if (enabled && normalizedMessageId !== null) {
        const key = String(normalizedMessageId);
        const state = mainChatMessageUiState.get(key);
        if (!state || state[flag] !== true) {
            mainChatMessageUiState.set(key, { ...state, [flag]: true });
            changed = true;
        }
    }

    if (changed) {
        scheduleMainChatMessageListPanelRefresh();
    }
}

function clearMainChatMessageUiState(messageId) {
    const key = String(Number(messageId));
    if (mainChatMessageUiState.delete(key)) {
        scheduleMainChatMessageListPanelRefresh();
    }
}

function setMainChatMessageActionsExpanded(messageId, expanded) {
    if (expanded) {
        setMainChatMessageUiFlag('actionsExpanded', false);
        setMainChatMessageUiState(messageId, { actionsExpanded: true });
        return;
    }

    setMainChatMessageUiFlag('actionsExpanded', false);
}

function getMainChatRecoveryUiState() {
    let recovery = null;
    let failure = null;

    for (const [messageId, state] of mainChatMessageUiState.entries()) {
        if (state.recoveryStatus) {
            recovery = {
                messageId: Number(messageId),
                status: state.recoveryStatus,
                stage: state.recoveryStage === 'fallback' ? 'fallback' : 'primary',
            };
        }
        if (state.failureNoticeVisible || state.failureRetryVisible) {
            failure = {
                messageId: Number(messageId),
                noticeVisible: state.failureNoticeVisible === true,
                retryVisible: state.failureRetryVisible === true,
            };
        }
    }

    return { recovery, failure };
}

function isMainChatGenerationControlElementVisible(element) {
    if (!(element instanceof HTMLElement)) {
        return false;
    }

    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
}

function getMainChatGenerationControlMessageId(element) {
    const candidateRow = element instanceof HTMLElement ? element.closest('.mes[mesid]') : null;
    const messageRow = candidateRow?.closest('#chat') ? candidateRow : null;
    const messageId = Number(messageRow?.getAttribute('mesid'));
    return Number.isInteger(messageId) && messageId >= 0 ? messageId : null;
}

function getMainChatComposerActiveContext() {
    if (this_chid !== undefined) {
        return 'character';
    }

    return typeof name2 === 'string' && name2.trim() ? 'assistant' : 'none';
}

function getMainChatComposerBridgeState() {
    const textarea = document.getElementById('send_textarea');
    const sendButton = document.getElementById('send_but');
    const activeContext = getMainChatComposerActiveContext();
    const valueLength = textarea instanceof HTMLTextAreaElement ? textarea.value.length : 0;
    const hasBackendConnection = online_status !== 'no_connection';
    const isGenerating = document.body.dataset.generating === 'true';
    const isDisabled = textarea?.disabled === true || sendButton?.disabled === true || !hasBackendConnection;

    return getMainChatComposerState({
        valueLength: valueLength,
        hasValue: valueLength > 0,
        canSubmit: valueLength > 0 && hasBackendConnection && !isDisabled && !isGenerating && activeContext !== 'none',
        isFocused: document.activeElement === textarea,
        isDisabled: isDisabled,
        isGenerating: isGenerating,
        activeContext: getMainChatComposerActiveContext(),
    });
}

function getMainChatGenerationControlBridgeState() {
    const reactOwner = isReactMainChatOwner();
    const recoveryUi = reactOwner ? getMainChatRecoveryUiState() : null;
    const recoveryStatus = reactOwner ? null : document.querySelector('#chat > .mes .generation_auto_recovery_status');
    const recoveryStatusText = reactOwner ? recoveryUi?.recovery?.status ?? '' : recoveryStatus?.textContent?.trim() ?? '';
    const failureRetry = reactOwner ? null : document.querySelector('#chat > .mes .generation_failure_retry');
    const failureNotice = reactOwner ? null : document.querySelector('#chat > .mes .generation_failure_notice');
    const hasFailure = reactOwner
        ? Boolean(recoveryUi?.failure?.noticeVisible || recoveryUi?.failure?.retryVisible)
        : Boolean(failureNotice || failureRetry);
    const continueSurface = isMainChatGenerationControlElementVisible(document.getElementById('mes_continue')) ? 'legacy' : 'hidden';
    const shouldPreferStoppedTerminal = shouldPreferStoppedMainChatTerminalSnapshot(
        hasFailure ? 'error' : streamingProcessor?.isStopped ? 'stopped' : null,
    );
    const activeMessageId = (reactOwner ? recoveryUi?.recovery?.messageId : getMainChatGenerationControlMessageId(recoveryStatus))
        ?? (reactOwner ? recoveryUi?.failure?.messageId : getMainChatGenerationControlMessageId(failureRetry))
        ?? (Number.isInteger(streamingProcessor?.messageId) && streamingProcessor.messageId >= 0 ? streamingProcessor.messageId : null);

    return {
        ...getStreamingControlState({
            isGenerating: document.body.dataset.generating === 'true',
            hasStreamingProcessor: Boolean(streamingProcessor && !streamingProcessor.isStopped && !streamingProcessor.isFinished),
            isStopped: shouldPreferStoppedTerminal || Boolean(streamingProcessor?.isStopped),
            isFinished: Boolean(streamingProcessor?.isFinished),
            hasError: !shouldPreferStoppedTerminal && hasFailure,
            isRecovering: reactOwner ? Boolean(recoveryUi?.recovery) : Boolean(recoveryStatus),
            recoveryStage: reactOwner
                ? recoveryUi?.recovery?.stage ?? 'primary'
                : recoveryStatus?.dataset?.recoveryStage === 'fallback' ? 'fallback' : 'primary',
            activeMessageId,
            recoveryStatusLabel: recoveryStatusText || null,
            failureRetryVisible: reactOwner
                ? recoveryUi?.failure?.retryVisible === true
                : isMainChatGenerationControlElementVisible(failureRetry),
            failureNoticeVisible: reactOwner
                ? recoveryUi?.failure?.noticeVisible === true
                : Boolean(failureNotice),
            continueSurface,
        }),
    };
}

function getMainChatSlashCommandBridgeState() {
    const textarea = document.getElementById('send_textarea');
    const formShell = document.getElementById('form_sheld');
    const hasError = formShell?.classList.contains('script_error') === true;
    const autoCompleteState = getMainChatSlashCommandAutoCompleteState();

    return getMainChatSlashCommandState({
        text: textarea?.value ?? '',
        autocompleteVisible: autoCompleteState.visible === true,
        isExecuting: Boolean(isExecutingCommandsFromChatInput || formShell?.classList.contains('isExecutingCommandsFromChatInput')),
        isPaused: formShell?.classList.contains('script_paused') === true,
        isAborted: formShell?.classList.contains('script_aborted') === true,
        hasError: hasError,
        errorLabel: hasError ? 'error' : null,
    });
}

function getMainChatSlashUiBridgeState() {
    const autoCompleteState = getMainChatSlashCommandAutoCompleteState();

    return {
        active: Boolean(autoCompleteState.active),
        visible: Boolean(autoCompleteState.visible),
        replaceable: Boolean(autoCompleteState.replaceable),
        detailsVisible: Boolean(autoCompleteState.detailsVisible),
        selectedIndex: Number.isInteger(autoCompleteState.selectedIndex) ? autoCompleteState.selectedIndex : -1,
        detailsHtml: typeof autoCompleteState.detailsHtml === 'string' ? autoCompleteState.detailsHtml : '',
        options: Array.isArray(autoCompleteState.options)
            ? autoCompleteState.options.map(option => ({
                name: String(option?.name ?? ''),
                type: String(option?.type ?? ''),
                typeIcon: String(option?.typeIcon ?? ''),
                selectable: option?.selectable !== false,
                selected: option?.selected === true,
            }))
            : [],
    };
}

function getMainChatStreamingTransportStore() {
    if (!globalThis.__emberDeskMainChatStreamingTransportStore || typeof globalThis.__emberDeskMainChatStreamingTransportStore !== 'object') {
        globalThis.__emberDeskMainChatStreamingTransportStore = {
            latestTerminalSnapshot: null,
            preferStoppedTerminal: false,
        };
    }

    return globalThis.__emberDeskMainChatStreamingTransportStore;
}

function getMainChatQuietTransportStore() {
    if (!globalThis.__emberDeskMainChatQuietTransportStore || typeof globalThis.__emberDeskMainChatQuietTransportStore !== 'object') {
        globalThis.__emberDeskMainChatQuietTransportStore = {
            latestSnapshot: null,
        };
    }

    return globalThis.__emberDeskMainChatQuietTransportStore;
}

function rememberMainChatQuietTransportSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
        return;
    }

    const store = getMainChatQuietTransportStore();
    store.latestSnapshot = structuredClone(snapshot);
    scheduleMainChatMessageListPanelRefresh();
}

function getMainChatQuietTransportBridgeState() {
    const snapshot = getMainChatQuietTransportStore().latestSnapshot;
    if (snapshot && typeof snapshot === 'object') {
        return snapshot;
    }

    return {
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
}

function isMainChatQuietTransportStopException(exception) {
    const errorName = typeof exception?.name === 'string' ? exception.name : '';
    const errorMessage = typeof exception?.message === 'string' ? exception.message : String(exception ?? '');
    return errorName === 'AbortError' || /generation was aborted/i.test(errorMessage);
}

function resetMainChatStreamingTransportTerminalSnapshot() {
    const store = getMainChatStreamingTransportStore();
    store.latestTerminalSnapshot = null;
    store.preferStoppedTerminal = false;
}

function rememberMainChatStreamingTransportTerminalSnapshot(snapshot) {
    if (!snapshot || !STREAMING_TRANSPORT_TERMINAL_PHASES.has(snapshot.phase)) {
        return;
    }

    const store = getMainChatStreamingTransportStore();
    store.latestTerminalSnapshot = structuredClone(snapshot);
    store.preferStoppedTerminal = snapshot.phase === 'stopped';
}

function rememberMainChatStreamingTransportProcessorTerminal(processor, phase) {
    if (!processor || !STREAMING_TRANSPORT_TERMINAL_PHASES.has(phase)) {
        return;
    }

    rememberMainChatStreamingTransportTerminalSnapshot(getMainChatStreamingTransportState({
        phase,
        activeMessageId: Number.isInteger(processor.messageId) && processor.messageId >= 0 ? processor.messageId : null,
        observedTokenCount: processor.observedTokenCount ?? 0,
        observedChunkCount: processor.observedChunkCount ?? 0,
        fromFallbackAttempt: Boolean(processor.fromFallbackAttempt),
        recoverable: phase !== 'completed',
    }));
}

function rememberMainChatStreamingTransportVisibleTerminal(phase, {
    activeMessageId,
    observedTokenCount,
    observedChunkCount,
} = {}) {
    if (!STREAMING_TRANSPORT_TERMINAL_PHASES.has(phase)) {
        return;
    }

    const reactOwner = isReactMainChatOwner();
    const assistantMessageId = reactOwner
        ? chat.findLastIndex(message => !message?.is_user && !message?.is_system)
        : null;
    const assistantRow = reactOwner
        ? null
        : Array.from(document.querySelectorAll('#chat > .mes[is_user="false"][is_system="false"][mesid]')).at(-1);
    const messageId = reactOwner
        ? assistantMessageId
        : Number(assistantRow?.getAttribute('mesid'));
    const messageText = reactOwner
        ? String(chat[assistantMessageId]?.mes ?? '').trim()
        : assistantRow?.querySelector('.mes_text')?.textContent?.trim() ?? '';
    const normalizedMessageId = activeMessageId === null
        ? null
        : Number.isInteger(activeMessageId) && activeMessageId >= 0
            ? activeMessageId
            : Number.isInteger(messageId) && messageId >= 0
                ? messageId
                : null;
    const normalizedObservedTokenCount = Number.isInteger(observedTokenCount) && observedTokenCount >= 0
        ? observedTokenCount
        : messageText && messageText !== '...' ? 1 : 0;
    const normalizedObservedChunkCount = Number.isInteger(observedChunkCount) && observedChunkCount >= 0
        ? observedChunkCount
        : messageText && messageText !== '...' ? 1 : 0;

    rememberMainChatStreamingTransportTerminalSnapshot(getMainChatStreamingTransportState({
        phase,
        activeMessageId: normalizedMessageId,
        observedTokenCount: normalizedObservedTokenCount,
        observedChunkCount: normalizedObservedChunkCount,
        recoverable: phase !== 'completed',
    }));
}

function shouldPreferStoppedMainChatTerminalSnapshot(currentPhase = null) {
    const store = getMainChatStreamingTransportStore();
    const latestTerminalSnapshot = store.latestTerminalSnapshot;

    if (store.preferStoppedTerminal !== true || latestTerminalSnapshot?.phase !== 'stopped') {
        return false;
    }

    if (streamingProcessor && !streamingProcessor.isStopped && !streamingProcessor.isFinished) {
        return false;
    }

    return currentPhase === 'error' || currentPhase === 'stopped' || currentPhase === null;
}

function getMainChatStreamingTransportBridgeState() {
    const reactOwner = isReactMainChatOwner();
    const recoveryUi = reactOwner ? getMainChatRecoveryUiState() : null;
    const recoveryStatus = reactOwner ? null : document.querySelector('#chat > .mes .generation_auto_recovery_status');
    const failureRetry = reactOwner ? null : document.querySelector('#chat > .mes .generation_failure_retry');
    const failureNotice = reactOwner ? null : document.querySelector('#chat > .mes .generation_failure_notice');
    const hasFailure = reactOwner
        ? Boolean(recoveryUi?.failure?.noticeVisible || recoveryUi?.failure?.retryVisible)
        : Boolean(failureNotice || failureRetry);
    const activeMessageId = (reactOwner ? recoveryUi?.recovery?.messageId : getMainChatGenerationControlMessageId(recoveryStatus))
        ?? (reactOwner ? recoveryUi?.failure?.messageId : getMainChatGenerationControlMessageId(failureRetry))
        ?? getMainChatGenerationControlMessageId(failureNotice)
        ?? (Number.isInteger(streamingProcessor?.messageId) && streamingProcessor.messageId >= 0 ? streamingProcessor.messageId : null);
    const hasActiveStreamingProcessor = Boolean(streamingProcessor && !streamingProcessor.isStopped && !streamingProcessor.isFinished);
    const snapshot = getMainChatStreamingTransportState({
        isGenerating: document.body.dataset.generating === 'true',
        hasStreamingProcessor: hasActiveStreamingProcessor,
        isFinalizing: Boolean(streamingProcessor?.isFinalizing),
        isStopped: Boolean(streamingProcessor?.isStopped),
        isFinished: Boolean(streamingProcessor?.isFinished),
        hasError: hasFailure,
        activeMessageId,
        observedTokenCount: streamingProcessor?.observedTokenCount ?? 0,
        observedChunkCount: streamingProcessor?.observedChunkCount ?? 0,
        fromFallbackAttempt: Boolean(streamingProcessor?.fromFallbackAttempt || (reactOwner
            ? recoveryUi?.recovery?.stage === 'fallback'
            : recoveryStatus?.dataset?.recoveryStage === 'fallback')),
        recoverable: hasFailure || (reactOwner ? Boolean(recoveryUi?.recovery) : Boolean(recoveryStatus)),
        errorLabel: reactOwner ? null : failureNotice?.textContent?.trim() || null,
    });
    const store = getMainChatStreamingTransportStore();
    const shouldPreferStoppedTerminal = shouldPreferStoppedMainChatTerminalSnapshot(snapshot.phase);

    if (shouldPreferStoppedTerminal) {
        return store.latestTerminalSnapshot ?? snapshot;
    }

    if (snapshot.phase === 'stopped' && store.preferStoppedTerminal !== true) {
        return snapshot;
    }

    if (STREAMING_TRANSPORT_TERMINAL_PHASES.has(snapshot.phase)) {
        rememberMainChatStreamingTransportTerminalSnapshot(snapshot);
        return snapshot;
    }

    if (snapshot.phase === 'idle' || (snapshot.phase === 'connecting' && !hasActiveStreamingProcessor)) {
        return store.latestTerminalSnapshot ?? snapshot;
    }

    resetMainChatStreamingTransportTerminalSnapshot();
    return snapshot;
}

function bindMainChatMessageListBridgeObservers() {
    if (mainChatMessageListBridgeObserversBound) {
        return;
    }

    const sendTextarea = document.getElementById('send_textarea');
    const sendForm = document.getElementById('send_form');
    const formShell = document.getElementById('form_sheld');

    if (sendTextarea instanceof HTMLTextAreaElement) {
        sendTextarea.addEventListener('input', scheduleMainChatMessageListPanelRefresh);
        sendTextarea.addEventListener('focus', scheduleMainChatMessageListPanelRefresh);
        sendTextarea.addEventListener('focusin', scheduleMainChatMessageListPanelRefresh);
        sendTextarea.addEventListener('blur', scheduleMainChatMessageListPanelRefresh);
        sendTextarea.addEventListener('focusout', scheduleMainChatMessageListPanelRefresh);
        sendTextarea.addEventListener('click', scheduleMainChatMessageListPanelRefresh);
        sendTextarea.addEventListener('keydown', scheduleMainChatMessageListPanelRefresh);
        sendTextarea.addEventListener('keyup', scheduleMainChatMessageListPanelRefresh);
    }

    if (sendForm instanceof HTMLElement) {
        mainChatMessageListBridgeSendFormObserver = new MutationObserver(() => {
            scheduleMainChatMessageListPanelRefresh();
        });
        mainChatMessageListBridgeSendFormObserver.observe(sendForm, {
            attributes: true,
            childList: true,
            subtree: true,
            attributeFilter: ['class', 'style', 'hidden', 'aria-hidden'],
        });
    }

    if (formShell instanceof HTMLElement) {
        mainChatMessageListBridgeFormShellObserver = new MutationObserver(() => {
            scheduleMainChatMessageListPanelRefresh();
        });
        mainChatMessageListBridgeFormShellObserver.observe(formShell, {
            attributes: true,
            attributeFilter: ['class', 'style', 'hidden', 'aria-hidden'],
        });
    }

    if (document.body instanceof HTMLBodyElement) {
        mainChatMessageListBridgeBodyObserver = new MutationObserver(() => {
            scheduleMainChatMessageListPanelRefresh();
        });
        mainChatMessageListBridgeBodyObserver.observe(document.body, {
            attributes: true,
            attributeFilter: ['data-generating'],
        });
    }

    mainChatMessageListBridgeObserversBound = true;
    scheduleMainChatMessageListPanelRefresh();
}

function getMainChatVisibleAnchorRow(chatContainer, messageRows) {
    const chatRect = chatContainer.getBoundingClientRect();
    const firstVisibleRow = messageRows.find((node) => {
        const rowRect = node.getBoundingClientRect();
        return rowRect.bottom > chatRect.top && rowRect.top < chatRect.bottom;
    });

    return firstVisibleRow ?? messageRows[0] ?? null;
}

function persistMainChatMessageListScrollSnapshotBeforeClear(chatId = getCurrentChatId()) {
    if (!getWorkspaceReactFeatures()?.reactPanels?.mainChatMessageList) {
        return;
    }

    const normalizedChatId = typeof chatId === 'string' ? chatId.trim() : '';
    const chatContainer = document.getElementById('chat');
    if (!normalizedChatId || !(chatContainer instanceof HTMLElement)) {
        return;
    }

    const messageRows = getMainChatRenderableMessageRows(chatContainer);
    if (messageRows.length === 0) {
        return;
    }

    const anchorRow = getMainChatVisibleAnchorRow(chatContainer, messageRows);
    const anchorMessageId = anchorRow?.getAttribute('mesid') ?? '';
    const scrollOffset = chatContainer.scrollTop;
    if (!anchorMessageId || !Number.isFinite(scrollOffset)) {
        return;
    }

    const chatRect = chatContainer.getBoundingClientRect();
    const anchorViewportOffset = anchorRow.getBoundingClientRect().top - chatRect.top;

    getMainChatMessageListScrollSnapshotStore().set(normalizedChatId, {
        chatId: normalizedChatId,
        anchorMessageId,
        anchorViewportOffset,
        scrollOffset,
        measurements: [],
        firstRenderedMessageId: messageRows[0]?.getAttribute('mesid') ?? '',
        lastRenderedMessageId: messageRows.at(-1)?.getAttribute('mesid') ?? '',
        visibleMessageCount: messageRows.length,
        wasNearBottom: getMainChatDistanceFromEnd(chatContainer) <= MAIN_CHAT_SCROLL_RESTORE_THRESHOLD_PX,
    });
}

function ensureWorldInfoReactHost() {
    const workbench = document.getElementById('wi-holder');
    const editorPanel = document.getElementById('wiEditorPanel');
    const hostParent = workbench || editorPanel;
    if (!hostParent) {
        return null;
    }

    let host = document.getElementById(WORLD_INFO_REACT_HOST_ID);
    if (host) {
        if (host.parentElement !== hostParent) {
            hostParent.prepend(host);
        }
        return host;
    }

    host = document.createElement('div');
    host.id = WORLD_INFO_REACT_HOST_ID;
    host.className = 'emberdesk-react-world-info-panel-host';
    host.setAttribute('data-doc-id', 'feature.world_info_panel');
    hostParent.prepend(host);

    return host;
}

function hideLegacyWorldInfoWorkbench(hidden, { revealGlobalPanel = false } = {}) {
    const workbench = document.getElementById('wi-holder');
    const host = document.getElementById(WORLD_INFO_REACT_HOST_ID);
    if (!(workbench instanceof HTMLElement)) {
        return;
    }

    Array.from(workbench.children).forEach((child) => {
        if (!(child instanceof HTMLElement) || child === host) {
            return;
        }

        const isGlobalPanel = child.id === 'wiGlobalPanel';
        const shouldHide = hidden && !(revealGlobalPanel && isGlobalPanel);
        child.hidden = shouldHide;
        child.setAttribute('aria-hidden', shouldHide ? 'true' : 'false');
        if (shouldHide) {
            child.setAttribute('inert', '');
        } else {
            child.removeAttribute('inert');
        }
        child.dataset.legacyWorldInfoHiddenByReact = shouldHide ? 'true' : 'false';
    });

    workbench.classList.toggle('wi-workbench-react-owned', hidden);
    workbench.dataset.worldInfoVisibleOwner = hidden ? 'react' : 'legacy';
    workbench.dataset.worldInfoActivationRulesOpen = hidden && revealGlobalPanel ? 'true' : 'false';

    if (hidden && revealGlobalPanel) {
        const globalPanel = document.getElementById('wiGlobalPanel');
        const multiSelector = document.getElementById('WIMultiSelector');
        const sectionHeader = globalPanel?.querySelector?.('.wi-section-header');
        // Keep React as the sole global-activation summary owner; only rules controls surface.
        for (const node of [multiSelector, sectionHeader]) {
            if (!(node instanceof HTMLElement)) continue;
            node.hidden = true;
            node.setAttribute('aria-hidden', 'true');
            node.setAttribute('inert', '');
            node.dataset.legacyWorldInfoHiddenByReact = 'true';
        }
        const rulesToggle = document.querySelector('#wiGlobalPanel .wi-settings-toggle');
        const rulesContent = document.querySelector('#wiGlobalPanel .wi-global-rules-content');
        if (rulesContent instanceof HTMLElement) {
            // Prefer opening the rules drawer when it is collapsed.
            const isCollapsed = rulesContent.hidden
                || rulesContent.style.display === 'none'
                || rulesContent.classList.contains('displayNone')
                || !rulesContent.classList.contains('openInlineDrawer');
            if (isCollapsed) {
                rulesToggle?.dispatchEvent(new Event('click', { bubbles: true }));
            }
        }
    }
}

function setWorldInfoActivationRulesVisible(open) {
    const workbench = document.getElementById('wi-holder');
    const reactOwned = workbench?.dataset.worldInfoVisibleOwner === 'react';
    if (!reactOwned) {
        return false;
    }
    hideLegacyWorldInfoWorkbench(true, { revealGlobalPanel: Boolean(open) });
    return true;
}

function ensureCharacterAuthoringReactHost() {
    const characterPanel = document.getElementById('rm_ch_create_block');
    if (!characterPanel) {
        return null;
    }

    let host = document.getElementById(CHARACTER_AUTHORING_REACT_HOST_ID);
    if (host) {
        return host;
    }

    host = document.createElement('div');
    host.id = CHARACTER_AUTHORING_REACT_HOST_ID;
    host.className = 'emberdesk-react-authoring-panel-host emberdesk-react-character-authoring-panel-host';
    characterPanel.prepend(host);
    return host;
}

function getCurrentCharacterAuthoringMode() {
    return $('#form_create').attr('actiontype') === 'editcharacter' ? 'edit' : 'create';
}

function getCurrentCharacterAuthoringSource() {
    return getCurrentCharacterAuthoringMode() === 'edit' && this_chid !== undefined && characters[this_chid]
        ? characters[this_chid]
        : null;
}

function hideLegacyCharacterAuthoringEditor(hidden) {
    const form = document.getElementById('form_create');
    if (!(form instanceof HTMLElement)) {
        return;
    }

    form.hidden = hidden;
    form.setAttribute('aria-hidden', hidden ? 'true' : 'false');
    form.dataset.legacyCharacterAuthoringHiddenByReact = hidden ? 'true' : 'false';
}

function getCharacterAuthoringReactBridgeState(stateOverrides = {}) {
    const mode = getCurrentCharacterAuthoringMode();
    const sourceCharacter = getCurrentCharacterAuthoringSource();
    const sourceDraft = mode === 'edit'
        ? createCharacterAuthoringDraft(sourceCharacter ?? {}, { mode })
        : createCharacterAuthoringDraftFromCreateState(create_save, { mode });
    const draft = stateOverrides?.draft && typeof stateOverrides.draft === 'object'
        ? createCharacterAuthoringDraft(stateOverrides.draft, { mode })
        : sourceDraft;
    const title = draft.name.trim() || String($('#character_popup-button-h3').text() || '').trim();

    return {
        mode,
        title: title || (mode === 'edit' ? 'Character Authoring' : 'New Character'),
        subtitle: 'Character draft',
        dirty: getCharacterAuthoringDirtyFields(sourceDraft, draft).length > 0,
        draft,
        avatarUrl: draft.avatar ? getThumbnailUrl('avatar', draft.avatar) : '',
        tokenSummary: {
            total: String($('#result_info_total_tokens').text() || '').trim(),
            permanent: String($('#result_info_permanent_tokens').text() || '').trim(),
        },
        unsupportedFields: Array.isArray(draft.unsupportedFields) ? [...draft.unsupportedFields] : [],
        managementActions: getCharacterManagementDropdownActions(),
    };
}

/**
 * Projects the live #char-management-dropdown options (including extension-injected
 * entries) into the React "More" action menu. The hidden select stays the
 * compatibility host; this only reads its options.
 */
function getCharacterManagementDropdownActions() {
    const dropdown = document.getElementById('char-management-dropdown');
    if (!(dropdown instanceof HTMLSelectElement)) {
        return [];
    }
    return Array.from(dropdown.options)
        // React owns the advanced fields; projecting the legacy advanced
        // editor would expose a second visible editing surface for them.
        .filter(option => option instanceof HTMLOptionElement && option.id && option.id !== 'character_action_advanced')
        .map(option => ({
            id: option.id,
            label: option.textContent?.trim() || option.id,
            danger: option.classList.contains('red_button'),
            editAction: option.classList.contains('character-detail-edit-action'),
        }));
}

function setAuthoringInputValue(selector, value) {
    const element = $(selector);
    element.val(value ?? '');
    element.trigger('input');
}

function applyCharacterAuthoringSaveModel(saveModel = {}, { submit: _submit = true } = {}) {
    const fields = saveModel.fields || {};
    const extensions = saveModel.extensions || {};
    setAuthoringInputValue('#character_name_pole', fields.name);
    setAuthoringInputValue('#avatar_url_pole', fields.avatar);
    setAuthoringInputValue('#description_textarea', fields.description);
    setAuthoringInputValue('#personality_textarea', fields.personality);
    setAuthoringInputValue('#scenario_pole', fields.scenario);
    setAuthoringInputValue('#firstmessage_textarea', fields.first_mes);
    setAuthoringInputValue('#mes_example_textarea', fields.mes_example);
    setAuthoringInputValue('#creator_notes_textarea', fields.creator_notes);
    setAuthoringInputValue('#system_prompt_textarea', fields.system_prompt);
    setAuthoringInputValue('#post_history_instructions_textarea', fields.post_history_instructions);
    setAuthoringInputValue('#creator_textarea', fields.creator);
    setAuthoringInputValue('#character_version_textarea', fields.character_version);
    setAuthoringInputValue('#tags_textarea', Array.isArray(fields.tags) ? fields.tags.join(', ') : '');
    setAuthoringInputValue('#depth_prompt_prompt', extensions.depth_prompt?.prompt);
    setAuthoringInputValue('#depth_prompt_depth', extensions.depth_prompt?.depth);
    setAuthoringInputValue('#depth_prompt_role', extensions.depth_prompt?.role);
    updateFavButtonState(Boolean(fields.fav));
    create_save.world = String(extensions.world || '');
    create_save.alternate_greetings = Array.isArray(fields.alternate_greetings) ? [...fields.alternate_greetings] : [];
    create_save.extensions = {
        ...(create_save.extensions && typeof create_save.extensions === 'object' ? create_save.extensions : {}),
        world: String(extensions.world || ''),
        depth_prompt: extensions.depth_prompt || {},
    };

    // Direct API save owns writes; submit flag is ignored.
}

/**
 * Makes the pending React draft visible to a legacy action. In edit mode the
 * draft is persisted outright (returns true) so that actions which read or
 * mutate the server-side card — rename, export, duplicate, lore import — work
 * on current data, and a fresh remount won't regress them. On failure the
 * draft is only mirrored into the hidden form as before.
 */
async function persistAuthoringDraftBeforeLegacyAction(payload) {
    if (!(payload?.fields || payload?.extensions)) {
        return false;
    }
    if (getCurrentCharacterAuthoringMode() !== 'edit') {
        applyCharacterAuthoringSaveModel(payload, { submit: false });
        return false;
    }
    try {
        await saveCharacterAuthoringFromPayload(payload);
        return true;
    } catch {
        applyCharacterAuthoringSaveModel(payload, { submit: false });
        return false;
    }
}

function syncAuthoringDraftFromPopups(draft) {
    if (!draft || typeof draft !== 'object') {
        return draft;
    }
    const editMode = getCurrentCharacterAuthoringMode() === 'edit';
    const sourceCharacter = editMode ? getCurrentCharacterAuthoringSource() : null;
    // The greetings popup mutates characters[chid].data.alternate_greetings in edit
    // mode and create_save.alternate_greetings in create mode.
    const greetingSource = editMode
        ? sourceCharacter?.data?.alternate_greetings ?? create_save.alternate_greetings
        : create_save.alternate_greetings;
    draft.alternateGreetings = Array.isArray(greetingSource) ? [...greetingSource] : [];
    // charUpdatePrimaryWorld mirrors the latest selection into #character_world.
    const worldValue = String($('#character_world').val() ?? '')
        || String(editMode ? sourceCharacter?.data?.extensions?.world ?? '' : create_save.world ?? '');
    draft.characterWorld = worldValue;
    return draft;
}

async function reopenCharacterAuthoringAfterLegacyPopup(draft) {
    await mountReactCharacterAuthoringPanel({ draft });
}

function queueReactCharacterAuthoringRemount() {
    window.setTimeout(() => {
        void mountReactCharacterAuthoringPanel();
    }, 0);
}

function queueReactWorldInfoRemount() {
    if (document.getElementById('WorldInfo')?.classList.contains('openDrawer')) {
        window.setTimeout(() => void mountReactWorldInfoPanel(), 0);
    }
}

eventSource.on(event_types.WORLDINFO_SETTINGS_UPDATED, () => {
    queueReactWorldInfoRemount();
});

function getCharacterAuthoringReactCommands() {
    return createWorkspacePanelCommandPort({
        commands: {
            saveCharacterAuthoring: payload => saveCharacterAuthoringFromPayload(payload),
            cancelAuthoring: () => {
                if (getCurrentCharacterAuthoringMode() === 'edit' && this_chid !== undefined) {
                    select_selected_character(this_chid, { switchMenu: false });
                } else {
                    select_rm_create({ switchMenu: false });
                }
                return false;
            },
            deleteAuthoring: () => {
                $('#delete_button').trigger('click');
                return false;
            },
            duplicateAuthoring: async payload => {
                // Duplicate reads the saved card — persist pending edits first.
                await persistAuthoringDraftBeforeLegacyAction(payload);
                $('#dupe_button').trigger('click');
                return false;
            },
            exportAuthoring: async payload => {
                // Export reads the saved card — persist pending edits first.
                await persistAuthoringDraftBeforeLegacyAction(payload);
                toggleCharacterExportPopup(getVisibleCharacterExportTrigger());
                return false;
            },
            openWorldInfo: async payload => {
                applyCharacterAuthoringSaveModel(payload, { submit: false });
                // Popups operate on cloned templates + create_save/characters[chid].data
                // and read the form via FormData — all fine while #form_create stays
                // hidden. Unhiding would flash the legacy editor under the React panel.
                await openCharacterWorldPopup();
                // The popup writes back to legacy stores; pull them into the React
                // draft so the remount doesn't lose popup edits.
                syncAuthoringDraftFromPopups(payload?.draft);
                await reopenCharacterAuthoringAfterLegacyPopup(payload?.draft);
                return false;
            },
            openAlternateGreetings: async payload => {
                applyCharacterAuthoringSaveModel(payload, { submit: false });
                await openAlternateGreetings();
                syncAuthoringDraftFromPopups(payload?.draft);
                await reopenCharacterAuthoringAfterLegacyPopup(payload?.draft);
                return false;
            },
            runManagementAction: async payload => {
                const actionId = String(payload?.actionId ?? '');
                if (!actionId) {
                    return false;
                }
                // Push the draft into the hidden form so legacy actions read current
                // values. In edit mode, persist it outright first: actions like rename
                // or lore import mutate characters[chid] server-side, and remounting
                // the stale draft afterwards would let the next autosave overwrite
                // the action's result.
                const draftPersisted = await persistAuthoringDraftBeforeLegacyAction(payload);
                const dropdown = document.getElementById('char-management-dropdown');
                const option = dropdown?.querySelector?.(`option[id="${CSS.escape(actionId)}"]`);
                if (option instanceof HTMLOptionElement) {
                    option.selected = true;
                    $('#char-management-dropdown').trigger('change');
                    // Let the synchronous prefix of the legacy change handler settle.
                    await delay(0);
                }
                // Fresh remount when the draft was persisted: picks up both the saved
                // edits and whatever the management action mutated. On pre-save
                // failure keep the live draft so unsaved edits survive the action.
                await reopenCharacterAuthoringAfterLegacyPopup(draftPersisted ? undefined : payload?.draft);
                return false;
            },
        },
        shouldRemount(commandResult, commandName) {
            // Edit-mode saves rebase the React session client-side; remounting on
            // every autosave would reset the draft baseline, collapse the advanced
            // section, and close the field editor mid-typing. Create-mode saves must
            // still remount so the panel flips into edit mode on the new card.
            if (commandName === 'saveCharacterAuthoring') {
                return commandResult?.mode !== 'edit';
            }
            return commandResult !== false;
        },
        shouldRemountOnError() {
            // Keep the React draft available for an actionable retry.
            return false;
        },
        remount: () => {
            hideLegacyCharacterAuthoringEditor(true);
            void mountReactCharacterAuthoringPanel();
        },
    });
}

async function mountReactCharacterAuthoringPanel(stateOverrides = undefined) {
    const result = await mountWorkspacePanelHost({
        kind: 'characterAuthoring',
        ensureContainer: ensureCharacterAuthoringReactHost,
        getState: (overrides) => getCharacterAuthoringReactBridgeState(overrides),
        commands: getCharacterAuthoringReactCommands(),
        runtime: reactRuntimePort,
        features: getWorkspaceReactFeatures(),
        stateOverrides,
        onDisabled() {
            // Sole-owner surface: never re-enable legacy form as product fallback.
            hideLegacyCharacterAuthoringEditor(true);
        },
    });

    // Always hide legacy form; React is the only editable owner.
    hideLegacyCharacterAuthoringEditor(true);
    if (result?.mounted) {
        // The gates in selectRightMenuWithAnimation/showWorkspaceChildSlotContent run
        // before the async mount settles, so the legacy tab title must be hidden here too.
        $('#rm_button_selected_ch h2').hide();
    } else {
        const host = ensureCharacterAuthoringReactHost();
        if (host && !host.querySelector('[data-react-authoring-build-error]')) {
            host.innerHTML = '<div class="react-authoring-panel" data-react-authoring-build-error="true" role="alert">Character Authoring React build is missing or failed to mount. Redeploy the workspace-panels bundle.</div>';
        }
    }
    return result;
}

function getWorldInfoReactWorldNames(editorSelector) {
    if (!(editorSelector instanceof HTMLSelectElement)) {
        return [];
    }

    return Array.from(editorSelector.options)
        .filter(option => option.value !== '')
        .map(option => ({
            value: option.value,
            label: option.textContent?.trim() || option.label || option.value,
            selected: option.selected,
        }));
}

function getWorldInfoReactSelectedWorldName(editorSelector) {
    if (!(editorSelector instanceof HTMLSelectElement) || editorSelector.value === '') {
        return '';
    }

    return editorSelector.selectedOptions[0]?.textContent?.trim() ?? '';
}

function getWorldInfoReactSortOptions(worldInfoSortOrder) {
    if (!(worldInfoSortOrder instanceof HTMLSelectElement)) {
        return [];
    }

    return Array.from(worldInfoSortOrder.options).map(option => ({
        value: option.value,
        label: option.textContent?.trim() || option.label || option.value,
        hidden: option.hidden,
    }));
}

function getWorldInfoReactEntrySummaries() {
    return Array.from(document.querySelectorAll('#world_popup_entries_list .world_entry')).map((entry, index) => {
        const titleInput = entry.querySelector('textarea[name="comment"], input[name="comment"]');
        const title = titleInput instanceof HTMLInputElement || titleInput instanceof HTMLTextAreaElement
            ? titleInput.value || titleInput.placeholder
            : entry.textContent?.trim();

        return {
            uid: entry.getAttribute('uid') ?? String(index),
            title: title?.trim() || `Entry ${index + 1}`,
            disabled: entry.querySelector('[name="entryKillSwitch"]')?.getAttribute('aria-pressed') === 'false',
        };
    });
}

function getWorldInfoReactBridgeState(facadeSnapshot = null) {
    const globalSelector = document.getElementById('world_info');
    const editorSelector = /** @type {HTMLSelectElement|null} */ (document.getElementById('world_editor_select'));
    const importMenuItem = document.getElementById('world_import_menu_item');
    const importFileInput = /** @type {HTMLInputElement|null} */ (document.getElementById('world_import_file'));
    const worldPopup = document.getElementById('world_popup');
    const worldInfoSearch = /** @type {HTMLInputElement|null} */ (document.getElementById('world_info_search'));
    const worldInfoSortOrder = /** @type {HTMLSelectElement|null} */ (document.getElementById('world_info_sort_order'));
    const createEntryButton = document.getElementById('world_create_button');
    const facadeEntrySummaries = Array.isArray(facadeSnapshot?.entrySummaries)
        ? facadeSnapshot.entrySummaries
        : null;
    const entrySummaries = facadeEntrySummaries ?? getWorldInfoReactEntrySummaries();
    const globalActiveNames = Array.isArray(facadeSnapshot?.globalActiveNames)
        ? facadeSnapshot.globalActiveNames
        : [];

    return {
        globalSelectorPresent: Boolean(globalSelector),
        editorSelectorPresent: Boolean(editorSelector),
        selectorsSeparated: Boolean(globalSelector && editorSelector && globalSelector !== editorSelector),
        importMenuPresent: Boolean(importMenuItem),
        importBusy: importMenuItem?.getAttribute('aria-disabled') === 'true' || importFileInput?.disabled === true,
        dropTargetPresent: Boolean(worldPopup),
        worldNames: getWorldInfoReactWorldNames(editorSelector),
        selectedWorldName: getWorldInfoReactSelectedWorldName(editorSelector) || facadeSnapshot?.editorWorldName || '',
        selectedWorldIndex: editorSelector?.value ?? '',
        entryCount: facadeSnapshot?.entryCount ?? entrySummaries.length,
        entrySummaries,
        searchQuery: worldInfoSearch?.value ?? '',
        sortValue: worldInfoSortOrder?.value ?? '',
        sortOptions: getWorldInfoReactSortOptions(worldInfoSortOrder),
        canCreateEntry: createEntryButton?.getAttribute('aria-disabled') !== 'true',
        exportMenuPresent: Boolean(document.getElementById('world_export_menu_item')),
        createWorldMenuPresent: Boolean(document.getElementById('world_create_world')),
        refreshMenuPresent: Boolean(document.getElementById('world_refresh')),
        globalActiveNames,
        globalActiveCount: facadeSnapshot?.globalActiveCount ?? globalActiveNames.length,
        selectedEntryUid: facadeSnapshot?.selectedEntryUid ?? '',
        selectedEntry: facadeSnapshot?.selectedEntry ?? null,
        hasEditorWorld: facadeSnapshot?.hasEditorWorld ?? Boolean(editorSelector?.value),
        renameMenuPresent: Boolean(document.getElementById('world_rename_menu_item')),
        duplicateMenuPresent: Boolean(document.getElementById('world_duplicate_menu_item')),
        deleteMenuPresent: Boolean(document.getElementById('world_delete_menu_item')),
    };
}

async function getWorldInfoReactBridgeStateAsync() {
    try {
        if (typeof getWorldInfoReactPanelState === 'function') {
            return await getWorldInfoReactPanelState();
        }
        const facadeSnapshot = await getWorldInfoWorkbenchFacadeSnapshot();
        return getWorldInfoReactBridgeState(facadeSnapshot);
    } catch (error) {
        console.warn('World Info workbench service state failed; using DOM fallback.', error);
        return getWorldInfoReactBridgeState(null);
    }
}

function getWorldInfoReactCommands() {
    return createWorkspacePanelCommandPort({
        commands: {
            selectWorld: worldIndex => selectWorldInfoEditorIndex(worldIndex),
            applySearchQuery: searchQuery => applyWorldInfoSearchQuery(searchQuery),
            applySortOption: sortValue => applyWorldInfoSortOption(sortValue),
            setGlobalWorlds: names => setWorldInfoGlobalActiveNames(names),
            createEntry: () => createWorldInfoEntryFromEditor(),
            createWorld: () => promptToCreateWorldInfo(),
            importWorld: () => requestWorldInfoImportSelection(),
            exportWorld: () => exportCurrentWorldInfo(),
            renameWorld: () => renameCurrentWorldInfo(),
            duplicateWorld: () => duplicateCurrentWorldInfo(),
            deleteWorld: () => deleteCurrentWorldInfo(),
            refreshWorld: () => refreshCurrentWorldInfoEditor(),
            openEntry: uid => selectWorldInfoWorkbenchEntry(uid),
            expandLegacyEntry: uid => openWorldInfoEntryByUid(uid),
            updateEntryFields: (uid, fields) => updateWorldInfoWorkbenchEntryFields(uid, fields),
            clearSelectedEntry: () => selectWorldInfoWorkbenchEntry(''),
            toggleActivationRules: open => setWorldInfoActivationRulesVisible(open),
            backfillMemos: () => backfillWorldInfoMemosFromWorkbench(),
            applyCurrentSorting: () => promptApplyWorldInfoCurrentSorting(),
            bulkDeleteEntries: uids => bulkDeleteWorldInfoEntries(uids),
            bulkSetEntriesEnabled: (uids, enabled) => bulkSetWorldInfoEntriesEnabled(uids, enabled),
            moveOrCopyEntry: uid => promptMoveOrCopyWorldInfoEntry(uid),
        },
        shouldRemount(_result, commandName) {
            // Field edits keep local draft focus; activation toggle is DOM-only under React owner.
            return commandName !== 'updateEntryFields' && commandName !== 'toggleActivationRules';
        },
        remount: () => {
            void mountReactWorldInfoPanel();
        },
    });
}

async function mountReactWorldInfoPanel() {
    const result = await mountWorkspacePanelHost({
        kind: 'worldInfo',
        ensureContainer: ensureWorldInfoReactHost,
        getState: () => getWorldInfoReactBridgeStateAsync(),
        commands: getWorldInfoReactCommands(),
        runtime: reactRuntimePort,
        features: getWorkspaceReactFeatures(),
        onDisabled() {
            // Sole-owner: never re-enable the legacy workbench editor.
            hideLegacyWorldInfoWorkbench(true);
        },
    });

    // Sole-owner: React host owns the workbench; legacy editor stays hidden/inert.
    hideLegacyWorldInfoWorkbench(true, {
        revealGlobalPanel: Boolean(
            document.getElementById('wi-holder')?.dataset?.worldInfoActivationRulesOpen === 'true',
        ),
    });
    return result;
}

function ensureMainChatMessageListReactHost() {
    const chatContainer = document.getElementById('chat');
    if (!chatContainer) {
        return null;
    }

    chatContainer.dataset.reactMainChatOwner = 'react';
    const sendForm = document.getElementById('send_form');
    const nonQrFormItems = document.getElementById('nonQRFormItems');
    if (sendForm instanceof HTMLElement) {
        sendForm.dataset.mainChatComposerOwner = 'react';
    }
    if (nonQrFormItems instanceof HTMLElement) {
        nonQrFormItems.dataset.mainChatComposerOwner = 'react';
    }
    bindMainChatReactComposerCommandPort();
    return chatContainer;
}

function bindMainChatReactComposerCommandPort() {
    if (mainChatComposerCommandBindings) {
        return;
    }

    const sendTextarea = document.getElementById('send_textarea');
    const sendButton = document.getElementById('send_but');
    const stopButton = document.getElementById('mes_stop');
    const continueButton = document.getElementById('mes_continue');
    const regenerateButton = document.getElementById('option_regenerate');

    if (!(sendTextarea instanceof HTMLTextAreaElement) || !(sendButton instanceof HTMLElement)) {
        return;
    }

    const isGenerationFocusTarget = target => {
        return [sendButton, stopButton, continueButton, regenerateButton].some(control => (
            control instanceof HTMLElement
            && (target === control || control.contains(target))
        ));
    };
    const restoreComposerFocusIfRequested = () => {
        if (!mainChatComposerFocusRestoreRequested || document.activeElement === sendTextarea) {
            return;
        }

        if (isGenerationFocusTarget(document.activeElement) || document.activeElement === document.body) {
            sendTextarea.focus({ preventScroll: true });
        }
    };
    const dispatchGeneration = (kind) => {
        void Promise.resolve(
            getMainChatMessageListReactCommands().triggerVisibleGeneration({ kind }),
        ).finally(restoreComposerFocusIfRequested);
    };
    const stopVisibleGeneration = () => {
        void Promise.resolve(
            getMainChatMessageListReactCommands().stopVisibleGeneration(),
        ).finally(restoreComposerFocusIfRequested);
    };
    const isSlashInputOwnedByLegacy = () => {
        const slashState = getMainChatSlashCommandBridgeState();
        return slashState.active || slashState.autocompleteVisible;
    };
    const handleTextareaKeyDown = event => {
        if (
            event.defaultPrevented
            || event.isComposing
            || event.key !== 'Enter'
            || event.shiftKey
            || event.ctrlKey
            || event.altKey
            || event.metaKey
            || isSlashInputOwnedByLegacy()
        ) {
            return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();
        event.stopPropagation();
        dispatchGeneration('submitComposer');
    };
    const handleSendButtonClick = event => {
        event.preventDefault();
        event.stopImmediatePropagation();
        event.stopPropagation();
        dispatchGeneration('submitComposer');
    };
    const handleStopButtonClick = event => {
        event.preventDefault();
        event.stopImmediatePropagation();
        event.stopPropagation();
        stopVisibleGeneration();
    };
    const handleContinueButtonClick = event => {
        event.preventDefault();
        event.stopImmediatePropagation();
        event.stopPropagation();
        dispatchGeneration('continueLast');
    };
    const handleRegenerateButtonClick = event => {
        event.preventDefault();
        event.stopImmediatePropagation();
        event.stopPropagation();
        dispatchGeneration('retryGeneration');
    };
    const handleComposerFocus = () => {
        mainChatComposerFocusRestoreRequested = true;
        scheduleMainChatMessageListPanelRefresh();
    };
    const handleDocumentFocusIn = event => {
        const target = event.target;
        if (target === sendTextarea || sendTextarea.contains(target)) {
            mainChatComposerFocusRestoreRequested = true;
        } else if (!isGenerationFocusTarget(target)) {
            mainChatComposerFocusRestoreRequested = false;
        }
    };

    sendTextarea.addEventListener('keydown', handleTextareaKeyDown, true);
    sendTextarea.addEventListener('focus', handleComposerFocus, true);
    sendButton.addEventListener('click', handleSendButtonClick, true);
    stopButton?.addEventListener('click', handleStopButtonClick, true);
    continueButton?.addEventListener('click', handleContinueButtonClick, true);
    regenerateButton?.addEventListener('click', handleRegenerateButtonClick, true);
    document.addEventListener('focusin', handleDocumentFocusIn, true);

    mainChatComposerCommandBindings = () => {
        sendTextarea.removeEventListener('keydown', handleTextareaKeyDown, true);
        sendTextarea.removeEventListener('focus', handleComposerFocus, true);
        sendButton.removeEventListener('click', handleSendButtonClick, true);
        stopButton?.removeEventListener('click', handleStopButtonClick, true);
        continueButton?.removeEventListener('click', handleContinueButtonClick, true);
        regenerateButton?.removeEventListener('click', handleRegenerateButtonClick, true);
        document.removeEventListener('focusin', handleDocumentFocusIn, true);
        mainChatComposerFocusRestoreRequested = false;
    };
}

function cleanupMainChatMessageListReactHost() {
    mainChatComposerCommandBindings?.();
    mainChatComposerCommandBindings = null;
    mainChatComposerFocusRestoreRequested = false;
    setMainChatSlashCommandReactOwnerEnabled(false);
    const chatContainer = document.getElementById('chat');
    if (chatContainer) {
        delete chatContainer.dataset.reactMainChatOwner;
        for (const key of [
            'mainChatStreamingTransportPhase',
            'mainChatStreamingTransportTokens',
            'mainChatStreamingTransportMessageId',
            'mainChatStreamingTransportFallback',
            'mainChatGenerationControlPhase',
            'mainChatComposerLength',
            'mainChatComposerEmpty',
            'mainChatComposerCanSubmit',
            'mainChatComposerFocused',
            'mainChatComposerDisabled',
            'mainChatComposerGenerating',
            'mainChatComposerContext',
            'mainChatSlashCommandActive',
            'mainChatSlashCommandQueryLength',
            'mainChatSlashCommandAutocomplete',
            'mainChatSlashCommandExecuting',
            'mainChatSlashCommandPaused',
            'mainChatSlashCommandAborted',
            'mainChatSlashCommandError',
        ]) {
            delete chatContainer.dataset[key];
        }
    }
    document.getElementById('send_form')?.removeAttribute('data-main-chat-composer-owner');
    document.getElementById('nonQRFormItems')?.removeAttribute('data-main-chat-composer-owner');
}

function isReactMainChatOwner() {
    return document.getElementById('chat')?.dataset.reactMainChatOwner === 'react';
}

async function runMainChatVisibleGenerationAction({ kind, messageId } = {}) {
    switch (kind) {
        case 'submitComposer':
            await sendTextareaMessage();
            break;
        case 'continueLast':
            document.getElementById('option_continue')?.click();
            break;
        case 'retryGeneration':
            document.getElementById('option_regenerate')?.click();
            break;
        case 'swipeLeft':
            if (Number.isInteger(messageId) && messageId >= 0) {
                await swipe(null, SWIPE_DIRECTION.LEFT, { repeated: false, forceMesId: messageId });
            }
            break;
        case 'swipeRight':
            if (Number.isInteger(messageId) && messageId >= 0) {
                await swipe(null, SWIPE_DIRECTION.RIGHT, { repeated: false, forceMesId: messageId });
            }
            break;
        default:
            console.warn('Unknown main-chat visible generation action', kind);
    }
}

async function executeMainChatVisibleGenerationAction({ kind, messageId } = {}) {
    switch (kind) {
        case 'submitComposer':
            return await sendTextareaMessage();
        case 'continueLast':
            return await Generate('continue');
        case 'retryGeneration':
            return await Generate('regenerate');
        case 'swipeLeft':
            if (Number.isInteger(messageId) && messageId >= 0) {
                return await swipe(null, SWIPE_DIRECTION.LEFT, {
                    repeated: false,
                    forceMesId: messageId,
                });
            }
            return undefined;
        case 'swipeRight':
            if (Number.isInteger(messageId) && messageId >= 0) {
                return await swipe(null, SWIPE_DIRECTION.RIGHT, {
                    repeated: false,
                    forceMesId: messageId,
                });
            }
            return undefined;
        default:
            return await runMainChatVisibleGenerationAction({ kind, messageId });
    }
}

function runMainChatVisibleMessageActionsShellAction({ kind, messageId } = {}) {
    switch (kind) {
        case 'open': {
            if (!Number.isInteger(messageId) || messageId < 0) {
                return;
            }
            setMainChatMessageActionsExpanded(messageId, true);
            break;
        }
        case 'close':
            setMainChatMessageActionsExpanded(null, false);
            break;
        default:
            console.warn('Unknown main-chat visible message actions shell action', kind);
    }
}

function getMainChatReactVisibleWindow(projectedChat) {
    const totalMessageCount = Array.isArray(projectedChat) ? projectedChat.length : 0;
    if (totalMessageCount === 0) {
        return {
            visibleMessageIds: [],
            showMoreVisible: false,
        };
    }

    const configuredLimit = Number(power_user?.chat_truncation);
    const defaultStartIndex = Number.isInteger(configuredLimit) && configuredLimit > 0
        ? Math.max(totalMessageCount - configuredLimit, 0)
        : 0;
    const savedStartIndex = mainChatVisibleStartIndices.get(getCurrentChatId());
    const requestedStartIndex = Number.isInteger(savedStartIndex)
        ? savedStartIndex
        : defaultStartIndex;
    const startIndex = Math.min(Math.max(requestedStartIndex, 0), totalMessageCount);

    return {
        visibleMessageIds: Array.from(
            { length: totalMessageCount - startIndex },
            (_value, offset) => String(startIndex + offset),
        ),
        showMoreVisible: startIndex > 0,
    };
}

function syncMainChatRuntimeDiagnostics(chatContainer, {
    generationControl,
    composer,
    slashCommand,
    streamingTransport,
} = {}) {
    if (!(chatContainer instanceof HTMLElement)) {
        return;
    }

    const diagnostics = {
        mainChatStreamingTransportPhase: streamingTransport?.phase ?? 'idle',
        mainChatStreamingTransportTokens: streamingTransport?.observedTokenCount ?? 0,
        mainChatStreamingTransportMessageId: streamingTransport?.activeMessageId ?? '',
        mainChatStreamingTransportFallback: streamingTransport?.fromFallbackAttempt === true,
        mainChatGenerationControlPhase: generationControl?.phase ?? 'idle',
        mainChatComposerLength: composer?.valueLength ?? 0,
        mainChatComposerEmpty: composer?.isEmpty === true,
        mainChatComposerCanSubmit: composer?.canSubmit === true,
        mainChatComposerFocused: composer?.isFocused === true,
        mainChatComposerDisabled: composer?.isDisabled === true,
        mainChatComposerGenerating: composer?.isGenerating === true,
        mainChatComposerContext: composer?.activeContext ?? 'none',
        mainChatSlashCommandActive: slashCommand?.active === true,
        mainChatSlashCommandQueryLength: slashCommand?.queryLength ?? 0,
        mainChatSlashCommandAutocomplete: slashCommand?.autocompleteVisible === true ? 'visible' : 'hidden',
        mainChatSlashCommandExecuting: slashCommand?.executing === true,
        mainChatSlashCommandPaused: slashCommand?.paused === true,
        mainChatSlashCommandAborted: slashCommand?.aborted === true,
        mainChatSlashCommandError: slashCommand?.errorLabel ?? '',
    };

    for (const [key, value] of Object.entries(diagnostics)) {
        chatContainer.dataset[key] = String(value);
    }
}

function getMainChatMessageListReactBridgeState() {
    const chatContainer = document.getElementById('chat');
    const generationControl = getMainChatGenerationControlBridgeState();
    const composer = getMainChatComposerBridgeState();
    const slashCommand = getMainChatSlashCommandBridgeState();
    const slashUi = getMainChatSlashUiBridgeState();
    const streamingTransport = getMainChatStreamingTransportBridgeState();
    const composerElement = document.getElementById('send_textarea');
    const projectedChat = reactMainChatProjectionCleared ? [] : chat;
    const visibleWindow = getMainChatReactVisibleWindow(projectedChat);
    const visibleMessageIds = visibleWindow.visibleMessageIds;
    syncMainChatRuntimeDiagnostics(chatContainer, {
        generationControl,
        composer,
        slashCommand,
        streamingTransport,
    });
    const mainChatSnapshot = buildMainChatSnapshotFromLegacyChat({
        chatId: getCurrentChatId(),
        chat: projectedChat,
        pristineChat: !chat_metadata?.tainted,
        formatMessage: messageFormatting,
        timestampForMessage: message => {
            const momentDate = timestampToMoment(message?.send_date);
            return momentDate.isValid() ? momentDate.format('LL LT') : '';
        },
        avatarUrlForMessage: message => {
            if (message?.force_avatar) {
                return message.force_avatar;
            }
            if (message?.is_user) {
                return getThumbnailUrl('persona', user_avatar);
            }
            if (this_chid === undefined) {
                return system_avatar;
            }
            const character = characters[this_chid];
            return character?.avatar && character.avatar !== 'none'
                ? getThumbnailUrl('avatar', character.avatar)
                : default_avatar;
        },
        timestampTitleForMessage: message => `${message?.extra?.api ? `${message.extra.api} - ` : ''}${message?.extra?.model ?? ''}`,
        timerForMessage: message => formatGenerationTimer(
            message?.gen_started,
            message?.gen_finished,
            message?.extra?.token_count,
            message?.extra?.reasoning_duration,
            message?.extra?.time_to_first_token,
        ),
        mediaDisplayForMessage: message => getMediaDisplay(message),
        hasItemizedPromptForMessage: (message, messageId) => Array.isArray(itemizedPrompts)
            && itemizedPrompts.some(prompt => Number(prompt?.mesId) === Number(messageId)),
        swipePickerForMessage: messageId => ({
            canOpen: canOpenSwipePickerForMessage(messageId),
            canJump: canJumpToSwipeForMessage(messageId),
        }),
        modelIconEnabled: power_user.timestamp_model_icon === true,
        visibleMessageIds,
        composer: {
            value: composerElement instanceof HTMLTextAreaElement ? composerElement.value : '',
            activeContext: composer.activeContext,
            focused: composer.isFocused,
            disabled: composer.isDisabled,
        },
        generation: {
            phase: generationControl.phase,
            activeMessageId: generationControl.activeMessageId === null
                ? null
                : String(generationControl.activeMessageId),
        },
        streaming: {
            phase: streamingTransport.phase,
            activeMessageId: streamingTransport.activeMessageId === null
                ? null
                : String(streamingTransport.activeMessageId),
            observedTokenCount: streamingTransport.observedTokenCount,
        },
        slash: {
            active: slashCommand.active,
            replaceable: slashUi.replaceable,
            detailsVisible: slashUi.detailsVisible,
            detailsHtml: slashUi.detailsHtml,
            options: slashUi.options,
            autocompleteVisible: slashCommand.autocompleteVisible,
            executing: slashCommand.executing,
            paused: slashCommand.paused,
            aborted: slashCommand.aborted,
            errorLabel: slashCommand.errorLabel,
        },
        messageUiById: getMainChatMessageUiStateById(),
        window: {
            visibleMessageIds,
            anchorMessageId: visibleMessageIds[0] ?? null,
            showMoreVisible: visibleWindow.showMoreVisible,
            scrollTop: chatContainer?.scrollTop ?? 0,
            scrollHeight: chatContainer?.scrollHeight ?? 0,
            clientHeight: chatContainer?.clientHeight ?? 0,
            scrollRestore: getMainChatMessageListScrollRestoreSnapshot(),
        },
    });
    return {
        chatId: getCurrentChatId(),
        hasChatContainer: Boolean(chatContainer),
        messageCount: mainChatSnapshot.orderedMessageIds.length,
        firstMessageId: visibleMessageIds[0] ?? '',
        lastMessageId: visibleMessageIds.at(-1) ?? '',
        showMoreVisible: visibleWindow.showMoreVisible,
        visibleMessageIds,
        scrollTop: chatContainer?.scrollTop ?? 0,
        scrollHeight: chatContainer?.scrollHeight ?? 0,
        clientHeight: chatContainer?.clientHeight ?? 0,
        generationControl,
        composer,
        slashCommand,
        slashUi,
        streamingTransport,
        quietTransport: getMainChatQuietTransportBridgeState(),
        windowingContract: buildMainChatWindowingContract({
            renderedMessageIds: visibleMessageIds,
            totalMessageCount: Array.isArray(projectedChat) ? projectedChat.length : 0,
            showMoreVisible: visibleWindow.showMoreVisible,
            anchorMessageId: visibleMessageIds[0] ?? null,
            scrollTop: chatContainer?.scrollTop ?? 0,
        }),
        rowLifecycleContract: buildMainChatRowLifecycleContract({
            hasEditingRows: mainChatSnapshot.orderedMessageIds.some(messageId => mainChatSnapshot.messagesById[messageId]?.state === 'editing'),
            hasStreamingRows: mainChatSnapshot.orderedMessageIds.some(messageId => mainChatSnapshot.messagesById[messageId]?.state === 'streaming'),
            hasUnsafeRows: false,
            hasExtensionMutatedRows: mainChatSnapshot.orderedMessageIds.some(messageId => mainChatSnapshot.messagesById[messageId]?.state === 'extension-mutated'),
        }),
        mainChatSnapshot,
    };
}

function getMainChatMessageListReactCommands() {
    return createWorkspacePanelCommandPort({
        commands: {
            openCharacterLibrary: async () => {
                await openWorkspaceShellCharacterLibrary();
                return true;
            },
            loadMoreMessages: messagesToLoad => loadEarlierChatMessages(
                Number.isInteger(Number(messagesToLoad)) ? Number(messagesToLoad) : null,
            ),
            loadMoreUntilMessage: async anchorMessageId => {
                if (!anchorMessageId) {
                    return true;
                }

                let visibleWindow = getMainChatReactVisibleWindow(reactMainChatProjectionCleared ? [] : chat);
                while (
                    !visibleWindow.visibleMessageIds.includes(String(anchorMessageId))
                    && visibleWindow.showMoreVisible
                ) {
                    await loadEarlierChatMessages();
                    visibleWindow = getMainChatReactVisibleWindow(reactMainChatProjectionCleared ? [] : chat);
                }
                return true;
            },
            setSlashVisibleOwner: enabled => {
                setMainChatSlashCommandReactOwnerEnabled(enabled);
                return false;
            },
            selectSlashAutocompleteOption: index => selectMainChatSlashCommandOption(index),
            startMessageEdit: messageId => startMainChatMessageEdit(messageId),
            updateMessageEdit: (messageId, text) => updateMainChatMessageEdit(messageId, text),
            commitMessageEdit: messageId => commitMainChatMessageEdit(messageId),
            cancelMessageEdit: messageId => cancelMainChatMessageEdit(messageId),
            setMessageReasoningOpen: (messageId, open) => setMainChatMessageReasoningOpen(messageId, open),
            copyMessageReasoning: messageId => copyMainChatMessageReasoning(messageId),
            startMessageReasoningEdit: messageId => startMainChatMessageReasoningEdit(messageId),
            updateMessageReasoningEdit: (messageId, text) => updateMainChatMessageReasoningEdit(messageId, text),
            commitMessageReasoningEdit: messageId => commitMainChatMessageReasoningEdit(messageId),
            cancelMessageReasoningEdit: messageId => cancelMainChatMessageReasoningEdit(messageId),
            deleteMessageReasoning: messageId => deleteMainChatMessageReasoning(messageId),
            collapseAllMessageReasoning: () => collapseAllMainChatMessageReasoning(),
            copyMessage: messageId => copyMainChatMessage(messageId),
            duplicateMessage: messageId => duplicateMainChatMessage(messageId),
            deleteMessage: messageId => deleteMessage(
                messageId,
                undefined,
                power_user.confirm_message_delete === true,
            ),
            moveMessage: (messageId, direction) => messageEditMove(
                messageId,
                direction === 'up' ? messageId - 1 : messageId + 1,
            ),
            triggerVisibleGeneration: command => {
                const kind = String(command?.kind ?? '');
                if (kind === 'submitComposer') {
                    return mainChatVisibleGenerationMutex.update();
                }

                return executeMainChatVisibleGenerationAction({
                    kind,
                    messageId: Number.isInteger(command?.messageId) && command.messageId >= 0 ? command.messageId : undefined,
                });
            },
            stopVisibleGeneration: () => {
                stopGeneration();
                return true;
            },
            toggleMessageActionsShell: command => {
                runMainChatVisibleMessageActionsShellAction({
                    kind: String(command?.kind ?? ''),
                    messageId: Number.isInteger(command?.messageId) && command.messageId >= 0 ? command.messageId : undefined,
                });
                return false;
            },
        },
        shouldRemount(actionResult, commandName) {
            return actionResult !== false
                && !['copyMessage', 'duplicateMessage', 'deleteMessage', 'updateMessageEdit'].includes(commandName);
        },
        remount: () => {
            void mountReactMainChatMessageListPanel();
        },
    });
}

async function mountReactMainChatMessageListPanel() {
    const result = await mountWorkspacePanelHost({
        kind: 'mainChatMessageList',
        ensureContainer: ensureMainChatMessageListReactHost,
        getState: () => getMainChatMessageListReactBridgeState(),
        commands: getMainChatMessageListReactCommands(),
        runtime: reactRuntimePort,
        features: getWorkspaceReactFeatures(),
        onDisabled() {
            cleanupMainChatMessageListReactHost();
        },
    });
    if (result?.mounted) {
        scheduleMainChatMessageListScrollRestore();
    }
    return result;
}

function ensureExtensionsHostReactHost() {
    const extensionsPanel = document.getElementById('rm_extensions_block');
    if (!extensionsPanel) {
        return null;
    }

    let host = document.getElementById(EXTENSIONS_HOST_REACT_HOST_ID);
    if (host) {
        return host;
    }

    host = document.createElement('div');
    host.id = EXTENSIONS_HOST_REACT_HOST_ID;
    host.className = 'emberdesk-react-extensions-host-panel-host';

    const extensionsBlock = extensionsPanel.querySelector(':scope > .extensions_block');
    if (extensionsBlock?.parentElement === extensionsPanel) {
        extensionsPanel.insertBefore(host, extensionsBlock);
    } else {
        extensionsPanel.prepend(host);
    }

    return host;
}

function getExtensionsHostReactBridgeState(stateOverrides = {}) {
    const extensionsSettings = document.getElementById('extensions_settings');
    const extensionsSettings2 = document.getElementById('extensions_settings2');
    const deferredPlaceholder = document.getElementById('extensions_startup_loading');
    const session = typeof getExtensionHostSession === 'function' ? getExtensionHostSession() : null;
    const sessionSnapshot = session && typeof session.getHostStateSnapshot === 'function'
        ? session.getHostStateSnapshot()
        : null;
    const deferredState = stateOverrides.deferredState
        ?? sessionSnapshot?.deferredState
        ?? (typeof getDeferredExtensionLoaderState === 'function' ? getDeferredExtensionLoaderState() : 'idle');
    const extrasStatus = typeof getExtrasConnectionStatus === 'function'
        ? getExtrasConnectionStatus()
        : { text: '', className: '' };

    return {
        extensionsSettingsPresent: Boolean(extensionsSettings),
        extensionsSettings2Present: Boolean(extensionsSettings2),
        // Extras controls are React-owned; the service layer is always reachable.
        extrasApiControlsPresent: true,
        manageButtonPresent: true,
        installButtonPresent: true,
        extensionsUiDisabled: extensionsHostControlsDisabled,
        hasExtensionLoadErrors: hasExtensionLoadErrors(),
        notifyUpdatesEnabled: extension_settings.notifyUpdates === true,
        extrasApiUrl: extension_settings.apiUrl ?? '',
        extrasApiKeySet: Boolean(extension_settings.apiKey),
        autoconnectEnabled: extension_settings.autoConnect === true,
        extrasStatusText: extrasStatus.text || '',
        extrasStatusClassName: extrasStatus.className || '',
        mountPointStatuses: getExtensionsHostReactMountPointStatuses(),
        deferredState,
        deferredPlaceholderPresent: Boolean(deferredPlaceholder),
        // Session snapshot remains available for lifecycle-owned fields above.
        sessionDeferredState: sessionSnapshot?.deferredState ?? null,
        slotGeneration: getExtensionCompatibilitySlotManager()?.getGeneration?.() ?? 0,
    };
}

function getExtensionsHostReactMountPointStatuses() {
    const manager = getExtensionCompatibilitySlotManager();
    if (manager) {
        return manager.getStatus().map(status => ({
            id: status.id,
            label: status.label,
            ready: status.ready,
        }));
    }
    return EXTENSION_COMPATIBILITY_SLOTS.map(slot => ({
        id: slot.id,
        label: slot.label,
        ready: Boolean(document.getElementById(slot.id)),
    }));
}

function getExtensionsHostReactCommands() {
    return createWorkspacePanelCommandPort({
        commands: {
            toggleNotifyUpdates: () => toggleExtensionsHostNotifyUpdates(),
            openManageExtensions: () => openExtensionsHostManager(),
            openInstallExtension: () => openExtensionsHostInstaller(),
            updateExtrasApiUrl: url => {
                updateExtensionsHostApiUrl(url);
                return false;
            },
            updateExtrasApiKey: apiKey => {
                updateExtensionsHostApiKey(apiKey);
                return false;
            },
            connectExtrasApi: () => connectExtensionsHostApi(),
            toggleAutoconnect: enabled => setExtensionsHostAutoconnectEnabled(
                enabled ?? !extension_settings.autoConnect,
            ),
            ensureExtensionCompatibilitySlots: owner => ensureExtensionCompatibilitySlots({ owner }),
            retryDeferredExtensions: () => retryDeferredExtensionsHostLoad(),
        },
        shouldRemount(actionResult, commandName) {
            // The React layout effect maintains compatibility slots on every mount.
            // Remounting that maintenance action would create an endless mount loop.
            return commandName !== 'ensureExtensionCompatibilitySlots' && actionResult !== false;
        },
        remount: () => {
            void mountReactExtensionsHostPanel();
        },
    });
}

async function mountReactExtensionsHostPanel(stateOverrides = {}) {
    const result = await mountWorkspacePanelHost({
        kind: 'extensionsHost',
        ensureContainer: ensureExtensionsHostReactHost,
        getState: overrides => getExtensionsHostReactBridgeState(overrides ?? stateOverrides),
        commands: getExtensionsHostReactCommands(),
        runtime: reactRuntimePort,
        features: getWorkspaceReactFeatures(),
        stateOverrides,
    });
    if (result?.mounted) {
        ensureExtensionCompatibilitySlots({ owner: 'react-extensions-host' });
    }
    return result;
}
const handleReactExtensionsHostStateChange = createWorkspacePanelStateChangeHandler((stateOverrides) => {
    void mountReactExtensionsHostPanel(stateOverrides);
});

function initReactExtensionsHostBridge() {
    initWorkspacePanelDrawerBridge({
        removeEventTarget: document,
        addEventTarget: document,
        eventName: 'emberdesk:extensions-host-state-change',
        stateChangeHandler: handleReactExtensionsHostStateChange,
        remount(stateOverrides) {
            void mountReactExtensionsHostPanel(stateOverrides);
        },
    });
}

function getCharacterLibrarySortOptionValue(option, index) {
    const field = option?.dataset?.field ?? '';
    const order = option?.dataset?.order ?? '';
    const rule = option?.dataset?.rule ?? '';
    return `${index}:${field}:${order}:${rule}`;
}

function getCharacterLibrarySortOptions() {
    return Array.from(document.querySelectorAll('#character_sort_order option')).map((option, index) => ({
        value: getCharacterLibrarySortOptionValue(option, index),
        label: option.textContent ?? '',
        hidden: option.hidden,
    }));
}

function getSelectedCharacterLibrarySortValue() {
    const selector = /** @type {HTMLSelectElement|null} */ (document.getElementById('character_sort_order'));
    if (!selector) {
        return '0:::';
    }

    const selectedOption = selector.selectedOptions?.[0] ?? selector.options?.[selector.selectedIndex] ?? selector.options?.[0];
    const selectedIndex = Array.from(selector.options).indexOf(selectedOption);
    return getCharacterLibrarySortOptionValue(selectedOption, Math.max(selectedIndex, 0));
}

function updateCharacterLibraryToolbarOwnerState({ searchQuery, sortValue } = {}) {
    if (searchQuery !== undefined) {
        characterLibraryToolbarState.searchQuery = String(searchQuery ?? '');
        characterLibraryToolbarState.hasSearchQuery = true;
    }

    if (sortValue !== undefined) {
        characterLibraryToolbarState.sortValue = String(sortValue ?? '0:::');
        characterLibraryToolbarState.hasSortValue = true;
    }
}

function getCharacterLibraryToolbarSearchQuery() {
    if (!characterLibraryToolbarState.hasSearchQuery) {
        updateCharacterLibraryToolbarOwnerState({
            searchQuery: entitiesFilter.getFilterData(FILTER_TYPES.SEARCH),
        });
    }

    return characterLibraryToolbarState.searchQuery;
}

function getCharacterLibraryToolbarSortValue() {
    if (!characterLibraryToolbarState.hasSortValue) {
        updateCharacterLibraryToolbarOwnerState({
            sortValue: getSelectedCharacterLibrarySortValue(),
        });
    }

    return characterLibraryToolbarState.sortValue;
}

function ensureReactCharacterLibraryToolbarHost() {
    const charListFixedTop = document.getElementById('charListFixedTop');
    if (!charListFixedTop) {
        return null;
    }

    let host = document.getElementById(REACT_CHARACTER_LIBRARY_TOOLBAR_HOST_ID);
    if (host) {
        return host;
    }

    host = document.createElement('div');
    host.id = REACT_CHARACTER_LIBRARY_TOOLBAR_HOST_ID;
    charListFixedTop.prepend(host);
    return host;
}

function hideLegacyCharacterLibraryToolbarChrome() {
    document.getElementById('rm_characters_block')?.classList.add('react-character-library-toolbar-active');
}

/**
 * Keeps legacy compatibility surfaces on the character-library toolbar alive after
 * the React toolbar took over the visible controls:
 * - paginationjs string/numeric method calls on #rm_print_characters_pagination
 *   (extensions, character lookup jumps) route through the plugin's event
 *   dispatch into the React page pipeline;
 * - the retired #rm_button_search Find toggle focuses the React search input.
 */
function ensureCharacterLibraryToolbarCompatBridges() {
    const $paginationHost = $('#rm_print_characters_pagination');
    if (!$paginationHost.length) {
        return;
    }
    if (!$paginationHost.data('pagination')) {
        const compatData = { initialized: true };
        Object.defineProperties(compatData, {
            model: {
                get: () => ({
                    pageNumber: getCharacterListCurrentPage(),
                    pageSize: getCharacterListCurrentPageSize(),
                    totalNumber: Number(currentCharacterListEntitySnapshot?.total) || 0,
                    disabled: false,
                }),
            },
            currentPageData: {
                get: () => currentCharacterListPageEntities,
            },
        });
        $paginationHost.data('pagination', compatData);
    }
    $paginationHost
        .off('.reactLibraryPaginationCompat')
        .on('pagination:go.reactLibraryPaginationCompat', (_event, page) => {
            void requestCharacterListPage(Number(Array.isArray(page) ? page[0] : page) || 1);
        })
        .on('pagination:previous.reactLibraryPaginationCompat', () => {
            void requestCharacterListPage(getCharacterListCurrentPage() - 1);
        })
        .on('pagination:next.reactLibraryPaginationCompat', () => {
            void requestCharacterListPage(getCharacterListCurrentPage() + 1);
        })
        .on('pagination:first.reactLibraryPaginationCompat', () => {
            void requestCharacterListPage(1);
        })
        .on('pagination:last.reactLibraryPaginationCompat', () => {
            const total = Number(currentCharacterListEntitySnapshot?.total) || 0;
            void requestCharacterListPage(Math.max(Math.ceil(total / getCharacterListCurrentPageSize()), 1));
        });

    $(document)
        .off('click.reactLibraryToolbarCompat', '#rm_button_search')
        .on('click.reactLibraryToolbarCompat', '#rm_button_search', () => {
            document.getElementById('emberdesk-react-character-search')?.focus();
        });
}

function getReactCharacterLibraryPanelBridge() {
    return globalThis.__emberDeskCharacterLibraryPanelBridge ??= {
        onSelectCharacter(id) {
            void selectCharacterById(Number(id));
        },
        onOpenFolder(id) {
            chooseBogusFolder($('#rm_print_characters_block'), String(id));
        },
        onBackFolder() {
            chooseBogusFolder($('#rm_print_characters_block'), 'back');
        },
        onClearFilters() {
            $('#character_search_bar').val('').trigger('input');
            $('.rm_tag_filter .clearAllFilters').trigger('click');
        },
        onBulkToggleCharacter(id, checked) {
            const row = document.getElementById(`CharID${id}`) || document.querySelector(`.character_select[data-chid="${CSS.escape(String(id))}"]`);
            if (!(row instanceof HTMLElement) || !characterGroupOverlay) {
                return;
            }
            const isSelected = characterGroupOverlay.selectedCharacters?.some?.(value => String(value) === String(id))
                || row.classList.contains('character_selected');
            if (Boolean(checked) !== Boolean(isSelected)) {
                characterGroupOverlay.toggleSingleCharacter(row);
            }
            void syncReactCharacterLibraryToolbarState();
        },
        clickLegacyAction(actionId) {
            document.getElementById(actionId)?.click();
        },
        applySearchQuery(searchQuery) {
            const input = $('#character_search_bar');
            const normalizedQuery = String(searchQuery ?? '');
            updateCharacterLibraryToolbarOwnerState({ searchQuery: normalizedQuery });
            if (String(input.val() ?? '') === normalizedQuery) {
                return;
            }

            input.val(normalizedQuery).trigger('input');
        },
        applySortOption(sortValue) {
            const selector = /** @type {HTMLSelectElement|null} */ (document.getElementById('character_sort_order'));
            if (!selector) {
                return;
            }

            const [indexToken] = String(sortValue).split(':');
            const optionIndex = Number(indexToken);
            if (!Number.isFinite(optionIndex) || optionIndex < 0 || optionIndex >= selector.options.length) {
                return;
            }

            updateCharacterLibraryToolbarOwnerState({
                sortValue: getCharacterLibrarySortOptionValue(selector.options[optionIndex], optionIndex),
            });
            selector.selectedIndex = optionIndex;
            $('#character_sort_order').trigger('change');
        },
        toggleGrid() {
            doCharListDisplaySwitch();
        },
        toggleBulkEdit() {
            if (!characterGroupOverlay) {
                return;
            }
            if ($('#rm_print_characters_block').hasClass('bulk_select')) {
                characterGroupOverlay.browseState();
            } else {
                characterGroupOverlay.selectState();
            }
        },
        selectAllInBulkMode() {
            if (!characterGroupOverlay) {
                return;
            }
            const selectedCharacterIds = Array.isArray(characterGroupOverlay.selectedCharacters)
                ? characterGroupOverlay.selectedCharacters
                : [];
            const pageCharacterIds = currentCharacterListPageEntities
                .filter(entity => entity?.type === 'character')
                .map(entity => Number(entity.id))
                .filter(Number.isFinite);
            if (pageCharacterIds.length === 0) {
                return;
            }

            const isSelected = (id) => selectedCharacterIds.some(selectedId => String(selectedId) === String(id));
            const hasUnselectedCharacter = pageCharacterIds.some(id => !isSelected(id));
            if (hasUnselectedCharacter) {
                for (const id of pageCharacterIds) {
                    if (!isSelected(id)) {
                        selectedCharacterIds.push(id);
                    }
                }
            } else {
                const pageCharacterIdSet = new Set(pageCharacterIds);
                const retainedCharacterIds = selectedCharacterIds.filter(id => !pageCharacterIdSet.has(Number(id)));
                selectedCharacterIds.splice(0, selectedCharacterIds.length, ...retainedCharacterIds);
            }
            characterGroupOverlay.updateSelectedCount();
            void syncReactCharacterLibraryToolbarState();
        },
        deleteSelectedInBulkMode() {
            if (characterGroupOverlay?.selectedCharacters?.length) {
                void characterGroupOverlay.handleContextMenuDelete();
            }
        },
        setCharacterListPage(page) {
            void requestCharacterListPage(page);
        },
        setCharacterListPageSize(pageSize) {
            const nextSize = Math.max(Number(pageSize) || per_page_default, 1);
            if (!CHARACTER_LIST_PAGE_SIZE_OPTIONS.includes(nextSize)) {
                return;
            }
            accountStorage.setItem('Characters_PerPage', String(nextSize));
            void requestCharacterListPage(1);
        },
        cycleTagFilter(tagId) {
            cycleCharacterTagFilterState(String(tagId), entitiesFilter);
            void syncReactCharacterLibraryToolbarState();
        },
        runTagFilterAction(tagId) {
            runCharacterTagFilterAction(String(tagId), entitiesFilter);
            void syncReactCharacterLibraryToolbarState();
        },
        expandTagFilterList() {
            expandCharacterTagFilterList();
            void syncReactCharacterLibraryToolbarState();
        },
    };
}

async function loadReactCharacterLibraryPanelModule() {
    if (!reactCharacterLibraryPanelModulePromise) {
        ensureReactPanelStylesheet('/react/login/assets/character-library-panel.css');
        reactCharacterLibraryPanelModulePromise = import(getReactCharacterLibraryPanelAssetPath()).catch(error => {
            reactCharacterLibraryPanelModulePromise = null;
            throw error;
        });
    }

    return reactCharacterLibraryPanelModulePromise;
}

function getCharacterLibraryEntityTags(entityId) {
    const tagKey = getTagKeyForEntity(entityId);
    if (tagKey == null || !Array.isArray(tag_map[tagKey])) {
        return [];
    }

    return tag_map[tagKey]
        .map(id => tags.find(tag => tag.id === id))
        .filter(Boolean)
        .sort(compareTagsForSort)
        .map(tag => ({
            id: getCharacterCardTagId(tag.id),
            name: String(tag.name ?? ''),
            hiddenOnCard: Boolean(tag.is_hidden_on_character_card),
            forceVisible: isBogusFolder(tag) || Boolean(tag.filter_state && !isFilterState(tag.filter_state, FILTER_STATES.UNDEFINED)),
        }));
}

function enrichCharacterLibraryPageEntities(pageEntities) {
    return (Array.isArray(pageEntities) ? pageEntities : []).map(entity => {
        if (entity?.type === 'tag' && entity.item) {
            const folderType = entity.item.folder_type;
            return {
                ...entity,
                folderIconClass: folderType ? undefined : 'fa-folder',
                folderColor: entity.item.color,
                folderColor2: entity.item.color2,
            };
        }
        if (entity?.type === 'character' && entity.item) {
            const item = entity.item;
            let avatarUrl = default_avatar;
            if (item.avatar && item.avatar !== 'none') {
                try {
                    avatarUrl = getThumbnailUrl('avatar', item.avatar);
                } catch {
                    avatarUrl = item.avatar;
                }
            }
            return {
                ...entity,
                item: {
                    ...item,
                    avatarUrl,
                },
                tags: getCharacterLibraryEntityTags(entity.id),
                auxFieldName: power_user.aux_field || 'character_version',
                showAvatarUrl: Boolean(power_user.show_card_avatar_urls),
            };
        }
        return entity;
    });
}

function createCharacterLibraryPanelStateSnapshot({ listElement, pageEntities, renderPlan, currentPage, pageSize, totalCount = null }) {
    const bulkMode = $('#rm_print_characters_block').hasClass('bulk_select');
    const selectedCharacterIds = Array.isArray(characterGroupOverlay?.selectedCharacters)
        ? characterGroupOverlay.selectedCharacters.slice()
        : [];
    const resolvedTotalCount = Number.isFinite(totalCount) ? Number(totalCount) : pageEntities.length;
    return {
        currentPage,
        pageSize,
        pageEntities: enrichCharacterLibraryPageEntities(pageEntities),
        pagination: {
            currentPage,
            pageSize,
            totalCount: resolvedTotalCount,
            pageSizeOptions: [...CHARACTER_LIST_PAGE_SIZE_OPTIONS],
            label: getCharacterListPaginationRangeLabel({ currentPage, totalNumber: resolvedTotalCount, pageSize }),
        },
        paginationElement: document.getElementById('rm_print_characters_pagination'),
        renderPlan: {
            ...renderPlan,
            emptyText: renderPlan.showEmptyBlock ? ((entitiesFilter?.hasAnyFilter?.() ? 'No matching characters' : 'Here be dragons')) : undefined,
            emptyMessage: renderPlan.showEmptyBlock
                ? (entitiesFilter?.hasAnyFilter?.()
                    ? (entitiesFilter.getFilterData?.(FILTER_TYPES.SEARCH)
                        ? 'Clear search or filters to show the full list.'
                        : 'Clear filters to show the full list.')
                    : 'There are no items to display.')
                : undefined,
            showClearFilters: Boolean(renderPlan.showEmptyBlock && entitiesFilter?.hasAnyFilter?.()),
        },
        estimatedRowHeight: power_user.charListGrid ? 144 : 72,
        scrollElement: listElement,
        isGrid: Boolean(power_user.charListGrid),
        bulkMode,
        selectedCharacterIds,
        activeCharacterId: this_chid,
    };
}

function createCharacterLibraryToolbarStateSnapshot() {
    return {
        searchQuery: getCharacterLibraryToolbarSearchQuery(),
        sortValue: getCharacterLibraryToolbarSortValue(),
        sortOptions: getCharacterLibrarySortOptions(),
        isGrid: Boolean(power_user.charListGrid),
        isBulkEdit: $('#rm_print_characters_block').hasClass('bulk_select'),
        bulkSelectedCount: characterGroupOverlay?.selectedCharacters?.length ?? 0,
        tagControlsElement: document.querySelector('#charListFixedTop .rm_tag_controls'),
        tagFilters: createCharacterTagFilterViewState(entitiesFilter),
        extensionButtonsElement: document.getElementById('rm_buttons_container'),
    };
}

async function mountReactCharacterLibraryPanel(state) {
    const listElement = state.scrollElement;
    if (!listElement) {
        return false;
    }

    const panelBridge = getReactCharacterLibraryPanelBridge();

    try {
        const panelModule = await loadReactCharacterLibraryPanelModule();
        if (!reactCharacterLibraryPanelMounted) {
            listElement.replaceChildren();
            panelModule.mountCharacterLibraryPanel(listElement, panelBridge, state);
            reactCharacterLibraryPanelMounted = true;
            listElement.dataset.reactCharacterLibraryOwner = 'react';
            return true;
        }

        panelModule.updateCharacterLibraryPanel(state);
        return true;
    } catch (error) {
        console.error('React character library panel failed to load. Legacy list fallback is retired.', error);
        reactCharacterLibraryPanelMounted = false;
        delete listElement.dataset.reactCharacterLibraryOwner;
        listElement.replaceChildren();
        const errorBlock = document.createElement('div');
        errorBlock.className = 'character_list_empty empty_block';
        errorBlock.textContent = 'Character Library React build is missing. Run pnpm run build:react:character-library.';
        listElement.appendChild(errorBlock);
        return false;
    }
}

async function mountReactCharacterLibraryToolbar(state = createCharacterLibraryToolbarStateSnapshot()) {
    const host = ensureReactCharacterLibraryToolbarHost();
    if (!host) {
        return false;
    }

    hideLegacyCharacterLibraryToolbarChrome();
    ensureCharacterLibraryToolbarCompatBridges();

    try {
        const panelModule = await loadReactCharacterLibraryPanelModule();
        const toolbarBridge = getReactCharacterLibraryPanelBridge();
        if (!reactCharacterLibraryToolbarMounted) {
            panelModule.mountCharacterLibraryToolbar(host, toolbarBridge, state);
            reactCharacterLibraryToolbarMounted = true;
            return true;
        }

        panelModule.updateCharacterLibraryToolbar(state);
        return true;
    } catch (error) {
        console.error('React character library toolbar failed to load. Legacy toolbar fallback is retired.', error);
        reactCharacterLibraryToolbarMounted = false;
        return false;
    }
}

export async function syncReactCharacterLibraryToolbarState() {
    let toolbarOk = false;
    try {
        toolbarOk = reactCharacterLibraryToolbarMounted
            ? await mountReactCharacterLibraryToolbar(createCharacterLibraryToolbarStateSnapshot())
            : false;
    } catch (error) {
        console.warn('React character library toolbar sync failed.', error);
    }

    // Keep React list rows in sync with bulk selection / active character without full printCharacters.
    if (reactCharacterLibraryPanelMounted) {
        const listElement = document.getElementById('rm_print_characters_block');
        if (listElement) {
            try {
                const pageEntities = Array.isArray(currentCharacterListPageEntities)
                    ? currentCharacterListPageEntities
                    : [];
                await mountReactCharacterLibraryPanel(createCharacterLibraryPanelStateSnapshot({
                    listElement,
                    pageEntities,
                    renderPlan: createCharacterListPageRenderPlan({
                        pageEntities,
                        includeBackBlock: Boolean(power_user?.bogus_folders && typeof isBogusFolderOpen === 'function' && isBogusFolderOpen()),
                        totalCharacters: Array.isArray(characters) ? characters.length : 0,
                        hasActiveFilter: Boolean(entitiesFilter?.hasAnyFilter?.()),
                    }),
                    currentPage: getCharacterListCurrentPage(),
                    pageSize: getCharacterListCurrentPageSize(),
                    totalCount: currentCharacterListEntitySnapshot?.total,
                }));
            } catch (error) {
                console.warn('React character library panel sync failed.', error);
            }
        }
    }

    return toolbarOk;
}

async function renderCharacterListPageReact(state) {
    await mountReactCharacterLibraryToolbar(createCharacterLibraryToolbarStateSnapshot());
    return mountReactCharacterLibraryPanel(state);
}

async function resetCharacterLibraryPanelForPerf() {
    const listElement = document.getElementById('rm_print_characters_block');
    if (!listElement) {
        throw new Error('Character list element is unavailable.');
    }

    const panelModule = await loadReactCharacterLibraryPanelModule();
    panelModule.unmountCharacterLibraryPanel();
    reactCharacterLibraryPanelMounted = false;
    reactCharacterLibraryToolbarMounted = false;
}

function getPerfInteractionTrace() {
    return globalThis.__emberDeskPerf?.interactionTrace ?? null;
}

function markPerfInteractionMetric(name, value) {
    const trace = getPerfInteractionTrace();
    if (!trace || typeof value !== 'number' || !Number.isFinite(value)) {
        return;
    }

    trace.metrics[name] = Math.round(value * 100) / 100;
}

const startupProfile = globalThis.__emberDeskStartup ??= {
    stages: [],
    marks: [],
};
startupProfile.scriptModuleStartMs = roundStartupTime(performance.now());
markStartup('script:module-start');

function roundStartupTime(value) {
    return Math.round(value * 100) / 100;
}

function markStartup(name, details = {}) {
    startupProfile.marks.push({
        name,
        timeMs: roundStartupTime(performance.now()),
        ...details,
    });
}

function pushStartupStage(name, startTimeMs, endTimeMs, error = null) {
    startupProfile.stages.push({
        name,
        startTimeMs: roundStartupTime(startTimeMs),
        endTimeMs: roundStartupTime(endTimeMs),
        durationMs: roundStartupTime(endTimeMs - startTimeMs),
        error,
    });
}

async function measureStartupStage(name, fn) {
    const startTimeMs = performance.now();

    try {
        const result = await fn();
        pushStartupStage(name, startTimeMs, performance.now());
        return result;
    } catch (error) {
        pushStartupStage(name, startTimeMs, performance.now(), String(error?.message ?? error));
        throw error;
    }
}

export {
    user_avatar,
    setUserAvatar,
    getUserAvatars,
    getUserAvatar,
    isOdd,
    countOccurrences,
    renderTemplate,
    itemizedPrompts,
    UNIQUE_APIS,
    CONNECT_API_MAP,
    system_messages,
    system_message_types,
    sendSystemMessage,
    getSystemMessageByType,
    event_types,
    eventSource,
    /** @deprecated Use setCharacterSettingsOverrides instead. */
    setCharacterSettingsOverrides as setScenarioOverride,
    /** @deprecated Use appendMediaToMessage instead. */
    appendMediaToMessage as appendImageToMessage,
    /** @deprecated Use getMaxPromptTokens instead. */
    getMaxPromptTokens as getMaxContextSize,
};

/**
 * Wait for page to load before continuing the app initialization.
 */
const waitForLoadStartedAtMs = performance.now();
await new Promise((resolve) => {
    if (document.readyState === 'complete') {
        resolve();
    } else {
        window.addEventListener('load', resolve);
    }
});
pushStartupStage('awaitWindowLoad', waitForLoadStartedAtMs, performance.now());
markStartup('window:load-ready');

// Configure toast library:
toastr.options = {
    positionClass: 'toast-top-center',
    closeButton: false,
    progressBar: false,
    showDuration: 250,
    hideDuration: 250,
    timeOut: 4000,
    extendedTimeOut: 10000,
    showEasing: 'linear',
    hideEasing: 'linear',
    showMethod: 'fadeIn',
    hideMethod: 'fadeOut',
    escapeHtml: true,
    onHidden: function () {
        // If we have any dialog still open, the last "hidden" toastr will remove the toastr-container. We need to keep it alive inside the dialog though
        // so the toasts still show up inside there.
        fixToastrForDialogs();
    },
};

// Run once during startup
toastr.subscribe(function (args) {
    if (args.state !== 'visible') {
        return;
    }

    const $container = toastr.getContainer(args.options, false);
    if (!$container || !$container.length) {
        return;
    }

    // toastr has already inserted the element at this point
    const $toast = args.options.newestOnTop
        ? $container.children().first()
        : $container.children().last();

    // Meaning of "clickable":
    // Interactable unless tapToDismiss was explicitly false
    const isInteractable = args.options.tapToDismiss !== false;
    $toast.toggleClass('interactable', isInteractable);
    if (isInteractable) {
        $toast.attr('title', t`Tap to close`);
    } else {
        $toast.removeAttr('title');
        $toast.addClass('toast-non-interactable');
    }
});

export const characterGroupOverlay = new BulkEditOverlay();

// Markdown converter
export let mesForShowdownParse; //intended to be used as a context to compare showdown strings against
/** @type {import('showdown').Converter} */
export let converter;

// array for prompt token calculations

export const systemUserName = 'EmberDesk System';
export const neutralCharacterName = 'Assistant';
let default_user_name = 'User';
export let name1 = default_user_name;
export let name2 = systemUserName;
/** @type {ChatMessage[]} */
export let chat = [];

/**
 * @type {import('./scripts/constants.js').SWIPE_STATE}
 */
export let swipeState = SWIPE_STATE.NONE;
let chatSaveTimeout;
let importFlashTimeout;
export let isChatSaving = false;
let firstRun = false;
export let settingsReady = false;
let currentVersion = '0.0.0';
export let displayVersion = 'EmberDesk';
let deferredExtensionTask = null;
const deferredVersionTask = createSingleFlightTask(() => measureStartupStage('deferred.getClientVersion', () => getClientVersion()));

let generation_started = new Date();
/** @type {Character[]} */
export let characters = [];
const pendingDeletedCharacterAvatars = new Set();
/**
 * Stringified index of a currently chosen entity in the characters array.
 * @type {string|undefined} Yes, we hate it as much as you do.
 */
export let this_chid;
let saveCharactersPage = 0;
export const default_avatar = 'img/ai4.png';
export const system_avatar = 'img/five.png';
export const comment_avatar = 'img/quill.png';
export const default_user_avatar = 'img/user-default.png';
export let CLIENT_VERSION = 'EmberDesk:UNKNOWN:dev'; // For Horde header
let optionsPopper = null;
function getOptionsPopper() {
    if (!optionsPopper) {
        const button = document.getElementById('options_button');
        const menu = document.getElementById('options');
        if (!button || !menu) {
            return null;
        }
        optionsPopper = Popper.createPopper(button, menu, { placement: 'top-start' });
    }
    return optionsPopper;
}
// Lazy: #export_button is React-mounted after module eval.
let exportPopper = null;
function getExportPopper() {
    if (!exportPopper) {
        const button = document.getElementById('export_button');
        const popup = document.getElementById('export_format_popup');
        if (!button || !popup) {
            return null;
        }
        exportPopper = Popper.createPopper(button, popup, { placement: 'left' });
    }
    return exportPopper;
}
let isExportPopupOpen = false;
let exportPopupTrigger = null;

function updateCharacterExportPopupPosition() {
    getExportPopper()?.update();
}

function closeCharacterExportPopup({ restoreFocus = true } = {}) {
    const exportPopup = document.getElementById('export_format_popup');
    if (!(exportPopup instanceof HTMLElement)) {
        return;
    }

    $(exportPopup).hide();
    isExportPopupOpen = false;
    updateCharacterExportPopupPosition();

    if (restoreFocus && exportPopupTrigger instanceof HTMLElement && document.contains(exportPopupTrigger)) {
        exportPopupTrigger.focus();
    }
}

function toggleCharacterExportPopup(referenceElement = document.getElementById('export_button')) {
    const exportPopup = document.getElementById('export_format_popup');
    if (!(referenceElement instanceof HTMLElement) || !(exportPopup instanceof HTMLElement)) {
        return;
    }

    exportPopper?.destroy();
    exportPopper = Popper.createPopper(referenceElement, exportPopup, {
        placement: 'left',
    });

    isExportPopupOpen = !isExportPopupOpen;
    exportPopupTrigger = referenceElement;

    if (!isExportPopupOpen) {
        closeCharacterExportPopup();
        return;
    }

    $(exportPopup).show();
    updateCharacterExportPopupPosition();
    exportPopup.querySelector('.export_format')?.focus();
}

function getVisibleCharacterExportTrigger() {
    const authoringPanel = document.querySelector('[data-react-authoring-owner="characterAuthoring"]');
    const reactExportButton = [...(authoringPanel?.querySelectorAll('button') ?? [])]
        .find(button => button.textContent?.trim() === 'Export');

    return reactExportButton instanceof HTMLElement
        ? reactExportButton
        : document.getElementById('export_button');
}

// Saved here for performance reasons
const messageTemplate = $('#message_template .mes');
export const chatElement = $('#chat');

let dialogueResolve = null;
let dialogueCloseStop = false;
/** @type {ChatMetadata} */
// Retired: prompt itemization storage kept as an inert array for the extension-facing shell contract.
const itemizedPrompts = [];

export let chat_metadata = {};

// Chat metadata is deliberately retained as-is; only the active visual override is read here.
eventSource.on(event_types.CHAT_CHANGED, applyActiveBackground);
/** @type {GenerationStreamSession} */
export let streamingProcessor = null;
let crop_data = undefined;
let is_delete_mode = false;
let isCharacterDeleteReconcileInProgress = false;
let characterDeleteReconcileGeneration = 0;
let currentCharacterListPageEntities = [];
let currentCharacterListEntitySnapshot = null;
let fav_ch_checked = false;
let scrollLock = false;
export let abortStatusCheck = new AbortController();
export let charDragDropHandler = null;
export let chatDragDropHandler = null;

/** @type {debounce_timeout} The debounce timeout used for chat/settings save. debounce_timeout.long: 1.000 ms */
export const DEFAULT_SAVE_EDIT_TIMEOUT = debounce_timeout.relaxed;
/** @type {debounce_timeout} The debounce timeout used for printing. debounce_timeout.quick: 100 ms */
export const DEFAULT_PRINT_TIMEOUT = debounce_timeout.quick;

export const saveSettingsDebounced = debounce((loopCounter = 0) => saveSettings(loopCounter), DEFAULT_SAVE_EDIT_TIMEOUT);
export const saveCharacterDebounced = debounce(() => $('#create_button').trigger('click'), DEFAULT_SAVE_EDIT_TIMEOUT);

/**
 * Prints the character list in a debounced fashion without blocking, with a delay of 100 milliseconds.
 * Use this function instead of a direct `printCharacters()` whenever the reprinting of the character list is not the primary focus.
 *
 * The printing will also always reprint all filter options of the global list, to keep them up to date.
 */
export const printCharactersDebounced = debounce(() => { printCharacters(false); }, DEFAULT_PRINT_TIMEOUT);

function shouldSuppressCharacterDeleteListReprint(startedAtGeneration, { allowDuringDelete = false } = {}) {
    return shouldSuppressCharacterDeleteListReprintState({
        startedAtGeneration,
        currentGeneration: characterDeleteReconcileGeneration,
        isDeleteInProgress: isCharacterDeleteReconcileInProgress,
        allowDuringDelete,
    });
}

/**
 * @enum {number} Extension prompt types
 */
export const extension_prompt_types = {
    NONE: -1,
    IN_PROMPT: 0,
    IN_CHAT: 1,
    BEFORE_PROMPT: 2,
};

/**
 * @enum {number} Extension prompt roles
 */
export const extension_prompt_roles = {
    SYSTEM: 0,
    USER: 1,
    ASSISTANT: 2,
};

export const MAX_INJECTION_DEPTH = 10000;

async function getClientVersion() {
    try {
        const response = await fetch('/version');
        const data = await response.json();
        CLIENT_VERSION = data.agent;
        displayVersion = `EmberDesk ${data.pkgVersion}`;
        currentVersion = data.pkgVersion;

        if (data.gitRevision && data.gitBranch) {
            displayVersion += ` '${data.gitBranch}' (${data.gitRevision})`;
        }

        $('#version_display').text(displayVersion);
    } catch (err) {
        console.error('Couldn\'t get client version', err);
    }
}

function configureDeferredStartupTasks() {
    deferredExtensionTask = null;
    setDeferredExtensionLoader(null);

    deferredExtensionTask = createSingleFlightTask(async () => {
        try {
            await deferredVersionTask.ensure();

            await measureStartupStage('deferred.coreFeatureInit', async () => {
                await initCoreFeatureExtensions();
            });

            setDeferredExtensionLoader(null);
        } catch (error) {
            if (error && typeof error === 'object') {
                error.__emberDeskDeferredExtensionToastShown = true;
            }

            setDeferredExtensionLoader(() => deferredExtensionTask.ensure(), { state: 'failed' });
            toastr.error(
                t`Extensions could not be loaded right now. Open the extensions panel to retry.`,
                t`Extensions failed to load`,
            );
            throw error;
        }
    });

    setDeferredExtensionLoader(() => deferredExtensionTask.ensure());
}

function startDeferredStartupTasks() {
    void deferredVersionTask.ensure().catch(error => console.error('Deferred client version startup failed.', error));

    if (deferredExtensionTask) {
        void deferredExtensionTask.ensure().catch(error => console.error('Deferred extension startup failed.', error));
    }

    // Idle warmup for deferred panels after APP_READY
    requestIdleCallback(() => {
        ensurePanel('world-info-body').catch(() => {});
    });
}

/**
 * Replay stored startup settings into a deferred panel's DOM after it loads.
 */
function _replayWorldInfoSettings() {
    initWorldInfo();
    rehydrateWorldInfoPanel({ resetEmptyEditor: false });
    void mountReactMainChatMessageListPanel();
}


export function reloadMarkdownProcessor() {
    converter = new showdown.Converter({
        emoji: true,
        literalMidWordUnderscores: true,
        parseImgDimensions: true,
        tables: true,
        underline: true,
        simpleLineBreaks: true,
        strikethrough: true,
        disableForced4SpacesIndentedSublists: true,
        extensions: [markdownUnderscoreExt()],
    });

    // Inject the dinkus extension after creating the converter
    // Maybe move this into power_user init?
    converter.addExtension(markdownExclusionExt(), 'exclusion');

    return converter;
}

export function getCurrentChatId() {
    if (this_chid !== undefined) {
        return characters[this_chid]?.chat;
    }
}

export const depth_prompt_depth_default = 4;
export const depth_prompt_role_default = 'system';
const per_page_default = 50;

var is_advanced_char_open = false;

/**
 * The type of the right menu
 * @typedef {'characters' | 'character_edit' | 'create' | '' } MenuType
 */

/**
 * The type of the right menu that is currently open
 * @type {MenuType}
 */
export let menu_type = '';

export let selected_button = ''; //which button pressed

//create pole save
export let create_save = {
    name: '',
    description: '',
    creator_notes: '',
    post_history_instructions: '',
    character_version: '',
    system_prompt: '',
    tags: '',
    creator: '',
    personality: '',
    first_message: '',
    /** @type {FileList|null} */
    avatar: null,
    scenario: '',
    mes_example: '',
    world: '',
    alternate_greetings: [],
    depth_prompt_prompt: '',
    depth_prompt_depth: depth_prompt_depth_default,
    depth_prompt_role: depth_prompt_role_default,
    extensions: {},
    extra_books: [],
};

//animation right menu
export const ANIMATION_DURATION_DEFAULT = 125;
export let animation_duration = ANIMATION_DURATION_DEFAULT;
export let animation_easing = 'ease-in-out';
let popup_type = '';
let chat_file_for_del = '';
export let online_status = 'no_connection';

export let is_send_press = false; //Send generation
export const isGenerating = () => is_send_press;

let this_del_mes = -1;

/** @type {string} */
let this_edit_mes_chname = '';
/** @type {number|undefined} */
let this_edit_mes_id = undefined;

//settings
export let settings;
/** @type {number|null} Canonical settings document revision from last /get, when provided. */
let settingsDocumentRevision = null;

const DEFAULT_BACKGROUND_SETTINGS = Object.freeze({
    name: '__transparent.png',
    url: 'url("backgrounds/__transparent.png")',
    fitting: 'classic',
    animation: false,
});

/**
 * Keeps the persisted active background contract separate from retired gallery settings.
 * @param {object|null|undefined} backgroundSettings
 * @returns {{name: string, url: string, fitting: string, animation: boolean}}
 */
export function normalizeBackgroundSettings(backgroundSettings) {
    const source = backgroundSettings && typeof backgroundSettings === 'object' ? backgroundSettings : null;
    if (!source || typeof source.name !== 'string' || !source.name || typeof source.url !== 'string' || !source.url) {
        return { ...DEFAULT_BACKGROUND_SETTINGS };
    }

    return {
        name: source.name,
        url: source.url,
        fitting: typeof source.fitting === 'string' && source.fitting ? source.fitting : 'classic',
        animation: typeof source.animation === 'boolean' ? source.animation : false,
    };
}

export let background_settings = { ...DEFAULT_BACKGROUND_SETTINGS };

export function resolveActiveBackgroundUrl(metadata, globalUrl) {
    return metadata?.custom_background || globalUrl || DEFAULT_BACKGROUND_SETTINGS.url;
}

function setFittingClass(fitting) {
    const backgrounds = $('#bg1');
    for (const option of ['cover', 'contain', 'stretch', 'center']) {
        backgrounds.toggleClass(option, option === fitting);
    }
}

export function applyActiveBackground() {
    $('#bg1').css('background-image', resolveActiveBackgroundUrl(chat_metadata, background_settings.url));
}

export function loadBackgroundSettings(settings) {
    background_settings = normalizeBackgroundSettings(settings?.background);
    setFittingClass(background_settings.fitting);
    applyActiveBackground();
}

export let amount_gen = 80; //default max length of AI generated responses
export let max_context = 2048;

/** User preference for swipeable messages */
let swipes = true;
/** Forcefully hide swipes. */
export let swipesHidden = false;
/** @type {{ now: number, direction: string }} */
export let lastSwipeInfo = { now: performance.now(), direction: SWIPE_DIRECTION.RIGHT };
export let recentSwipes = 0;

export let extension_prompts = {};

export let main_api;// = "kobold";
let abortController = new AbortController();

//css
var css_send_form_display = $('<div id=send_form></div>').css('display');

export { getRequestHeaders } from './scripts/request-context.js';


/** The tag of the active character. (NOT the id) */
export let active_character = '';

export const entitiesFilter = new FilterHelper(printCharactersDebounced);

export function getSlideToggleOptions() {
    return {
        miliseconds: animation_duration * 1.5,
        transitionFunction: animation_duration > 0 ? 'ease-in-out' : 'step-start',
    };
}

installAjaxCsrfPrefilter();

/**
 * Pings the STserver to check if it is reachable.
 * @returns {Promise<boolean>} True if the server is reachable, false otherwise.
 */
export async function pingServer() {
    try {
        const result = await fetch('api/ping', {
            method: 'POST',
            headers: getRequestHeaders({ omitContentType: true }),
        });

        if (!result.ok) {
            return false;
        }

        return true;
    } catch (error) {
        console.error('Error pinging server', error);
        return false;
    }
}

//MARK: bootstrapWorkspace
async function bootstrapWorkspace() {
    markStartup('bootstrapWorkspace:start');
    try {
        await measureStartupStage('csrfToken', async () => {
            await loadCsrfToken();
        });
    } catch {
        toastr.error(t`Couldn't get CSRF token. Please refresh the page.`, t`Error`, { timeOut: 0, extendedTimeOut: 0, preventDuplicates: true });
        throw new Error('Initialization failed');
    }

    const initLoaderOverlay = loader.createOverlay();
    initLoaderOverlay.classList.add('splash-screen');

    const splashLogo = document.createElement('img');
    splashLogo.src = '/img/logo.png';
    splashLogo.alt = 'EmberDesk';
    splashLogo.className = 'splash-logo';
    splashLogo.ariaLabel = 'EmberDesk Logo';

    const splashMessage = document.createElement('h2');
    splashMessage.className = 'splash-message';
    splashMessage.textContent = t`Initializing…`;
    splashMessage.dataset.i18n = 'Initializing…';

    initLoaderOverlay.prepend(splashLogo);
    initLoaderOverlay.appendChild(splashMessage);

    const initLoaderHandle = loader.show({
        slug: 'app-init',
        toastMode: loader.ToastMode.NONE,
        overlayContent: initLoaderOverlay,
        overlayHideMode: 'immediate',
    });

    await measureStartupStage('bootstrapUi', () => Promise.resolve().then(() => {
        registerPromptManagerMigration();
        initDomHandlers();
        initStandaloneMode();
        initLibraryShims();
        addShowdownPatch(showdown);
        addDOMPurifyHooks();
        reloadMarkdownProcessor();
        applyBrowserFixes();
    }));
    await measureStartupStage('mountApiConnectionsPanel', () => mountApiConnectionsPanel());
    await measureStartupStage('mountAiConfigPanel', () => mountAiConfigPanel());
    await measureStartupStage('mountCharacterPopup', () => mountCharacterPopup());
    await measureStartupStage('mountRightNavPanel', () => mountRightNavPanel());
    await measureStartupStage('mountSelectChatPopup', () => mountSelectChatPopup());
    await measureStartupStage('mountCharacterContextMenu', () => mountCharacterContextMenu());
    await measureStartupStage('mountOptionsMenu', () => mountOptionsMenu());
    await measureStartupStage('mountExportFormatPopup', () => mountExportFormatPopup());
    await measureStartupStage('mountDialoguePopupControls', () => mountDialoguePopupControls());
    await measureStartupStage('mountDialogueDelMesControls', () => mountDialogueDelMesControls());
    await measureStartupStage('mountOnboardingActions', () => mountOnboardingActions());
    await measureStartupStage('initSecrets', () => initSecrets());
    await measureStartupStage('readSecretState', () => readSecretState());
    await measureStartupStage('initLocales', () => initLocales());
    await measureStartupStage('registerCoreModules', () => Promise.resolve().then(() => {
        initChatUtilities();
        initDefaultSlashCommands();
        initOpenAI();
        initSystemPrompts();
    }));
    await measureStartupStage('initExtensions', () => initExtensions());
    initReactExtensionsHostBridge();
    await measureStartupStage('registerExtensionSlashCommands', () => Promise.resolve().then(() => {
        initExtensionSlashCommands();
        ToolManager.initToolSlashCommands();
    }));
    await measureStartupStage('initPresetManager', () => initPresetManager());
    await measureStartupStage('initSystemMessages', () => initSystemMessages());
    await measureStartupStage('mountPersonaManagement', () => mountPersonaManagementPanel());
    await measureStartupStage('mountPowerUserPanel', () => mountPowerUserPanel());
    await measureStartupStage('mountConfigDrawers', () => Promise.all([
        mountAdvancedFormattingPanel(),
        mountPromptManagerPopup(),
        mountWorldInfoPanel(),
    ]));
    await getSettings(initLoaderHandle);
    await measureStartupStage('bindPostSettingsUi', () => Promise.resolve().then(() => {
        initKeyboard();
        initDynamicStyles();
        initTags();
        initBranchUI();
    }));
    await measureStartupStage('getUserAvatars', () => getUserAvatars(true, user_avatar));
    await measureStartupStage('getCharacters', () => getCharacters());
    await measureStartupStage('initTokenizers', () => initTokenizers());
    await measureStartupStage('hydrateFeatureModules', async () => {
        await initPersonas();
        await initSlashCommandAutoComplete();
        bindMainChatMessageListBridgeObservers();
        initMacroAutoComplete();
        // Register deferred panel hooks before initWorldInfo so they capture any needed state
        registerPanelHook('world-info-body', _replayWorldInfoSettings);
        initWorldInfo();
        initRossMods();
        initInputMarkdown();
        initServerHistory();
        initSettingsSearch();
        initBulkEdit();
        initReasoning();
    });
    await measureStartupStage('lateFeatureInit', () => Promise.resolve().then(() => {
        initCustomSelectedSamplers();
        initDataMaid();
        initAccessibility();
        initSwipePicker();
        addDebugFunctions();
    }));
    await measureStartupStage('emitAppInitialized', () => eventSource.emit(event_types.APP_INITIALIZED));
    markStartup('app:initialized');
    await measureStartupStage('hideInitLoader', () => initLoaderHandle.hide());
    await measureStartupStage('fixViewport', () => fixViewport());
    await measureStartupStage('mountReactWorkspaceShellChrome', () => mountReactWorkspaceShellChromeHost());
    await measureStartupStage('emitAppReady', () => eventSource.emit(event_types.APP_READY));
    startupProfile.appReadyAtMs = roundStartupTime(performance.now());
    markStartup('app:ready');
    queueMicrotask(startDeferredStartupTasks);
}

async function fixViewport() {
    document.body.style.position = 'absolute';
    await delay(1);
    document.body.style.position = '';
}

function initStandaloneMode() {
    const isPwaMode = window.matchMedia('(display-mode: standalone)').matches;
    if (isPwaMode) {
        $('body').addClass('PWA');
    }
}

export function cancelStatusCheck(reason = 'Manually cancelled status check') {
    abortStatusCheck?.abort(new AbortReason(reason));
    abortStatusCheck = new AbortController();
    setOnlineStatus('no_connection');
}

export function displayOnlineStatus() {
    const sendTextareaHint = $('#send_textarea_hint');

    if (online_status == 'no_connection') {
        $('.online_status_indicator').removeClass('success');
        $('.online_status_text').text(translate('No connection...', 'api_no_connection'));
        sendTextareaHint.text(t`Type /? for commands. Send requires an API connection.`);
    } else {
        $('.online_status_indicator').addClass('success');
        $('.online_status_text').text(online_status);
        sendTextareaHint.text(t`Type /? for commands.`);
    }
}

/**
 * Sets the duration of JS animations.
 * @param {number} ms Duration in milliseconds. Resets to default if null.
 */
export function setAnimationDuration(ms = null) {
    animation_duration = ms ?? ANIMATION_DURATION_DEFAULT;
    // Set CSS variable to document
    document.documentElement.style.setProperty('--animation-duration', `${animation_duration}ms`);
}

/**
 * Sets the currently active character
 * @param {object|number|string} [entityOrKey] - An entity with id property (character or tag), or directly an id or tag key. If not provided, the active character is reset to `null`.
 */
export function setActiveCharacter(entityOrKey) {
    active_character = entityOrKey ? getTagKeyForEntity(entityOrKey) : null;
}

export function startStatusLoading() {
    $('.api_loading').show();
    $('.api_button').addClass('disabled');
}

export function stopStatusLoading() {
    $('.api_loading').hide();
    $('.api_button').removeClass('disabled');
}

export function resultCheckStatus() {
    displayOnlineStatus();
    stopStatusLoading();
}

/**
 * Switches the currently selected character to the one with the given ID. (character index, not the character key!)
 *
 * If the character ID doesn't exist or if the chat is being saved, this function does nothing.
 * If the character is different from the currently selected one, it will clear the chat and reset the selected character.
 * @param {number} id The ID of the character to switch to.
 * @param {object} [options] Options for the switch.
 * @param {boolean} [options.switchMenu=true] Whether to switch the right menu to the character edit menu if the character is already selected.
 * @returns {Promise<void>} A promise that resolves when the character is switched.
 */
export async function selectCharacterById(id, { switchMenu = true } = {}) {
    if (characters[id] === undefined) {
        return;
    }

    if (isChatSaving) {
        toastr.info(t`Please wait until the chat is saved before switching characters.`, t`Your chat is still saving...`);
        return;
    }

    if (String(this_chid) !== String(id)) {
        //if clicked on a different character from what was currently selected
        if (!is_send_press) {
            persistMainChatMessageListScrollSnapshotBeforeClear();
            setCharacterId(undefined);
            setCharacterName('');
            await clearChat({ clearData: true });
            cancelTtsPlay();
            this_edit_mes_id = undefined;
            selected_button = 'character_edit';
            setCharacterId(id);
            chat_metadata = {};
            await getChat();
        }
    } else {
        //if clicked on character that was already selected
        if (switchMenu) {
            selected_button = 'character_edit';
        }
        await unshallowCharacter(this_chid);
        select_selected_character(this_chid, { switchMenu });
    }
}

/**
 * Patches a visible character row in place for a narrow set of safe metadata updates.
 * Returns true if patched, false if the row is not visible or conditions are not met.
 * @param {string|number} chid Character index
 * @param {object} patch Patch object with optional fields: fav, avatar, avatarTitle, description, tags, auxField
 * @returns {boolean}
 */
export function updateCharacterRow(chid, patch) {
    const $row = $(`#CharID${chid}`);
    if (!$row.length) return false;

    // Only patch in unfiltered main list, no bogus-folder drilldown
    if (entitiesFilter.hasAnyFilter()) return false;
    if (power_user.bogus_folders && isBogusFolderOpen()) return false;

    if ('fav' in patch) {
        const isFav = patch.fav || patch.fav === 'true';
        $row.toggleClass('is_fav', isFav);
        $row.find('.ch_fav').val(String(isFav));
    }
    if ('avatar' in patch) {
        let src = default_avatar;
        if (patch.avatar !== 'none') {
            src = getThumbnailUrl('avatar', patch.avatar);
        }
        $row.find('.avatar img').attr('src', src).attr('alt', patch.name || $row.find('.ch_name').text());
        $row.find('.avatar').attr('title', patch.avatarTitle || `[Character] ${$row.find('.ch_name').text()}\nFile: ${patch.avatar}`);
    }
    if ('description' in patch) {
        const $desc = $row.find('.ch_description');
        if (patch.description) {
            $desc.text(patch.description).show();
        } else {
            $desc.hide();
        }
    }
    if ('tags' in patch) {
        // Fall back to full tag re-render via printTagList for the row's tag container
        printTagList($row.find('.tags'), { forEntityOrKey: chid, tagOptions: { isCharacterList: true } });
    }
    if ('auxField' in patch) {
        const $ver = $row.find('.character_version');
        if (patch.auxField) {
            $ver.text(patch.auxField).show();
        } else {
            $ver.hide();
        }
    }

    favsToHotswap();
    updatePersonaConnectionsAvatarList();
    return true;
}

/**
 * Prints the global character list, optionally doing a full refresh of the list
 * Use this function whenever the reprinting of the character list is the primary focus, otherwise using `printCharactersDebounced` is preferred for a cleaner, non-blocking experience.
 *
 * The printing will also always reprint all filter options of the global list, to keep them up to date.
 *
 * @param {boolean} fullRefresh - If true, the list is fully refreshed and the navigation is being reset
 */
export async function printCharacters(fullRefresh = false, { allowDuringCharacterDelete = false } = {}) {
    const deleteReconcileGenerationAtStart = characterDeleteReconcileGeneration;
    if (shouldSuppressCharacterDeleteListReprint(deleteReconcileGenerationAtStart, { allowDuringDelete: allowDuringCharacterDelete })) {
        return;
    }

    if (fullRefresh) {
        saveCharactersPage = 0;
        await delay(1);
    }

    // Before printing the personas, we check if we should enable/disable search sorting
    verifyCharactersSearchSortRule();

    // We are actually always reprinting filters, as it "doesn't hurt", and this way they are always up to date
    printTagFilters(tag_filter_type.character);

    // Keep character editing filters in sync before rendering the list.
    applyTagsOnCharacterSelect();

    const entitySnapshot = createCharacterListEntitySnapshot(getEntitiesList({ doFilter: true }));
    currentCharacterListEntitySnapshot = entitySnapshot;
    await renderCharacterListPage(entitySnapshot, {
        deleteReconcileGeneration: deleteReconcileGenerationAtStart,
        allowDuringDelete: allowDuringCharacterDelete,
        resetScroll: fullRefresh,
    });

    favsToHotswap();
    updatePersonaConnectionsAvatarList();
    // React owns the tag chips; printTagFilters above is guarded off, so refresh
    // the toolbar projection here to keep chips in sync on every reprint.
    void syncReactCharacterLibraryToolbarState();
}

/**
 * Re-renders the current page from the last entity snapshot (or a fresh one),
 * after applying a requested page change. Used by the React pager through the
 * character-library bridge.
 * @param {number} page - 1-based page number requested by the pager
 * @returns {Promise<boolean>} Whether the page rendered
 */
async function requestCharacterListPage(page) {
    if (Number.isFinite(Number(page))) {
        saveCharactersPage = Math.max(Number(page), 1);
    }
    const entitySnapshot = currentCharacterListEntitySnapshot ?? createCharacterListEntitySnapshot(getEntitiesList({ doFilter: true }));
    currentCharacterListEntitySnapshot = entitySnapshot;
    return renderCharacterListPage(entitySnapshot);
}

/**
 * Slices the entity snapshot at the persisted page state and hands the page
 * plan to the React character-library panel. The pagination control inside
 * #rm_print_characters_pagination is React-owned; this is the single path that
 * turns entity data + page state into a rendered page.
 * @param {object} entitySnapshot - Full filtered entity snapshot
 * @param {{requestedPage?: number, deleteReconcileGeneration?: number|null, allowDuringDelete?: boolean, resetScroll?: boolean}} options
 * @returns {Promise<boolean>} Whether the page rendered
 */
async function renderCharacterListPage(entitySnapshot, { requestedPage = undefined, deleteReconcileGeneration = null, allowDuringDelete = false, resetScroll = false } = {}) {
    if (deleteReconcileGeneration !== null && shouldSuppressCharacterDeleteListReprint(deleteReconcileGeneration, { allowDuringDelete })) {
        return false;
    }
    const listElement = document.getElementById('rm_print_characters_block');
    if (!listElement) {
        console.error('Character list container #rm_print_characters_block is missing.');
        return false;
    }

    const pageSize = getCharacterListCurrentPageSize();
    const totalCount = Number(entitySnapshot?.total ?? entitySnapshot?.entities?.length) || 0;
    const totalPages = Math.max(Math.ceil(totalCount / pageSize), 1);
    const currentPage = Math.min(Math.max(Number(requestedPage) || Number(saveCharactersPage) || 1, 1), totalPages);
    saveCharactersPage = currentPage;
    const pageEntities = getCharacterListPageEntities(entitySnapshot, currentPage, pageSize);
    const renderPlan = createCharacterListPageRenderPlan({
        pageEntities,
        includeBackBlock: power_user.bogus_folders && isBogusFolderOpen(),
        totalCharacters: characters.length,
        hasActiveFilter: entitiesFilter.hasAnyFilter(),
    });

    const rendered = await renderCharacterListPageReact(createCharacterLibraryPanelStateSnapshot({
        listElement,
        pageEntities,
        renderPlan,
        currentPage,
        pageSize,
        totalCount,
    }));
    if (!rendered) {
        return false;
    }

    currentCharacterListPageEntities = pageEntities;
    if (resetScroll) {
        listElement.scrollTop = 0;
    }
    await eventSource.emit(event_types.CHARACTER_PAGE_LOADED);
    return true;
}

function getCharacterListCurrentPage() {
    return Math.max(Number(saveCharactersPage) || 1, 1);
}

function getCharacterListCurrentPageSize() {
    return Math.max(Number(accountStorage.getItem('Characters_PerPage')) || per_page_default, 1);
}

async function reconcileCharacterListAfterDelete(options) {
    const { beforeSnapshot, deletedAvatars, deleteContext = null } = options;

    try {
        const listElement = document.getElementById('rm_print_characters_block');
        if (!listElement) {
            return false;
        }

        const currentPage = getCharacterListCurrentPage();
        const pageSize = getCharacterListCurrentPageSize();
        const afterSnapshot = createCharacterListEntitySnapshot(getEntitiesList({ doFilter: true }));
        const hasActiveFilter = entitiesFilter.hasAnyFilter();
        const isBulkEdit = $('#rm_print_characters_block').hasClass('bulk_select');
        const isBulkDeleteContext = deleteContext?.source === 'bulk';
        const isBogusFolderOpenNow = power_user.bogus_folders && isBogusFolderOpen();
        const plan = isBulkDeleteContext
            ? createCharacterBulkDeletePagePlan({
                afterSnapshot,
                deletedAvatars,
                currentPage,
                pageSize,
                hasActiveFilter,
                isBogusFolderOpen: isBogusFolderOpenNow,
                isPrintPending: false,
            })
            : createCharacterDeleteReconcilePlan({
                beforeSnapshot,
                afterSnapshot,
                deletedAvatars,
                currentPage,
                pageSize,
                hasActiveFilter,
                isBulkEdit: isBulkEdit && !isBulkDeleteContext,
                isBogusFolderOpen: isBogusFolderOpenNow,
                isPrintPending: false,
            });

        if (plan.mode !== 'incremental') {
            return false;
        }
        if (!isBulkDeleteContext && Number(plan.currentPage) !== Number(currentPage)) {
            return false;
        }

        currentCharacterListEntitySnapshot = afterSnapshot;
        const rendered = await renderCharacterListPage(afterSnapshot, { requestedPage: plan.currentPage });
        if (!rendered) {
            return false;
        }
        favsToHotswap();
        updatePersonaConnectionsAvatarList();
        return true;
    } catch (error) {
        console.warn('Character delete incremental reconcile failed; falling back to full refresh.', error);
        return false;
    }
}

/** Checks the state of the current search, and adds/removes the search sorting option accordingly */
function verifyCharactersSearchSortRule() {
    const searchTerm = entitiesFilter.getFilterData(FILTER_TYPES.SEARCH);
    const searchOption = $('#character_sort_order option[data-field="search"]');
    const selector = $('#character_sort_order');
    const isHidden = searchOption.attr('hidden') !== undefined;

    // If we have a search term, we are displaying the sorting option for it
    if (searchTerm && isHidden) {
        searchOption.removeAttr('hidden');
        searchOption.prop('selected', true);
        flashHighlight(selector);
    }
    // If search got cleared, we make sure to hide the option and go back to the one before
    if (!searchTerm && !isHidden) {
        searchOption.attr('hidden', '');
        $(`#character_sort_order option[data-order="${power_user.sort_order}"][data-field="${power_user.sort_field}"]`).prop('selected', true);
    }

    updateCharacterLibraryToolbarOwnerState({ sortValue: getSelectedCharacterLibrarySortValue() });
    void syncReactCharacterLibraryToolbarState();
}

/**
 * @typedef {object} Entity - Object representing a display entity
 * @property {Character|import('./scripts/tags.js').Tag|*} item - The item
 * @property {string|number} id - The id
 * @property {'character'|'tag'} type - The type of this entity (character, tag)
 * @property {Entity[]?} [entities=null] - An optional list of entities relevant for this item
 * @property {number?} [hidden=null] - An optional number representing how many hidden entities this entity contains
 * @property {boolean?} [isUseless=null] - Specifies if the entity is useless (not relevant, but should still be displayed for consistency) and should be displayed greyed out
 */

/**
 * Converts the given character to its entity representation
 *
 * @param {Character} character - The character
 * @param {string|number} id - The id of this character
 * @returns {Entity} The entity for this character
 */
export function characterToEntity(character, id) {
    return { item: character, id, type: 'character' };
}

/**
 * Converts the given tag to its entity representation
 *
 * @param {import('./scripts/tags.js').Tag} tag - The tag
 * @returns {Entity} The entity for this tag
 */
export function tagToEntity(tag) {
    return { item: structuredClone(tag), id: tag.id, type: 'tag', entities: [] };
}

/**
 * Builds the full list of all entities available
 *
 * They will be correctly marked and filtered.
 *
 * @param {object} param0 - Optional parameters
 * @param {boolean} [param0.doFilter] - Whether this entity list should already be filtered based on the global filters
 * @param {boolean} [param0.doSort] - Whether the entity list should be sorted when returned
 * @returns {Entity[]} All entities
 */
export function getEntitiesList({ doFilter = false, doSort = true } = {}) {
    let entities = [
        ...characters.map((item, index) => characterToEntity(item, index)),
        // Group chat retirement: do not surface group entities in the library list.
        ...(power_user.bogus_folders ? tags.filter(isBogusFolder).sort(compareTagsForSort).map(item => tagToEntity(item)) : []),
    ];

    // We need to do multiple filter runs in a specific order, otherwise different settings might override each other
    // and screw up tags and search filter, sub lists or similar.
    // The specific filters are written inside the "filterByTagState" method and its different parameters.
    // Generally what we do is the following:
    //   1. First swipe over the list to remove the most obvious things
    //   2. Build sub entity lists for all folders, filtering them similarly to the second swipe
    //   3. We do the last run, where global filters are applied, and the search filters last

    // First run filters, that will hide what should never be displayed
    if (doFilter) {
        entities = filterByTagState(entities);
    }

    // Run over all entities between first and second filter to save some states
    for (const entity of entities) {
        // For folders, we remember the sub entities so they can be displayed later, even if they might be filtered
        // Those sub entities should be filtered and have the search filters applied too
        if (entity.type === 'tag') {
            let subEntities = filterByTagState(entities, { subForEntity: entity, filterHidden: false });
            const subCount = subEntities.length;
            subEntities = filterByTagState(entities, { subForEntity: entity });
            if (doFilter) {
                // sub entities filter "hacked" because folder filter should not be applied there, so even in "only folders" mode characters show up
                subEntities = entitiesFilter.applyFilters(subEntities, { clearScoreCache: false, tempOverrides: { [FILTER_TYPES.FOLDER]: FILTER_STATES.UNDEFINED }, clearFuzzySearchCaches: false });
            }
            if (doSort) {
                sortEntitiesList(subEntities, false);
            }
            entity.entities = subEntities;
            entity.hidden = subCount - subEntities.length;
        }
    }

    // Second run filters, hiding whatever should be filtered later
    if (doFilter) {
        const beforeFinalEntities = filterByTagState(entities, { globalDisplayFilters: true });
        entities = entitiesFilter.applyFilters(beforeFinalEntities, { clearFuzzySearchCaches: false });

        // Magic for folder filter. If that one is enabled, and no folders are display anymore, we remove that filter to actually show the characters.
        if (isFilterState(entitiesFilter.getFilterData(FILTER_TYPES.FOLDER), FILTER_STATES.SELECTED) && entities.filter(x => x.type == 'tag').length == 0) {
            entities = entitiesFilter.applyFilters(beforeFinalEntities, { tempOverrides: { [FILTER_TYPES.FOLDER]: FILTER_STATES.UNDEFINED }, clearFuzzySearchCaches: false });
        }
    }

    // Final step, updating some properties after the last filter run
    const nonTagEntitiesCount = entities.filter(entity => entity.type !== 'tag').length;
    for (const entity of entities) {
        if (entity.type === 'tag') {
            if (entity.entities?.length == nonTagEntitiesCount) entity.isUseless = true;
        }
    }

    // Sort before returning if requested
    if (doSort) {
        sortEntitiesList(entities, false);
    }
    entitiesFilter.clearFuzzySearchCaches();
    return entities;
}

export async function getOneCharacter(avatarUrl) {
    const response = await fetch('/api/characters/get', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({
            avatar_url: avatarUrl,
        }),
    });

    if (response.ok) {
        const getData = await response.json();
        getData.name = DOMPurify.sanitize(getData.name);
        getData.chat = String(getData.chat);

        const indexOf = characters.findIndex(x => x.avatar === avatarUrl);

        if (indexOf !== -1) {
            characters[indexOf] = getData;
        } else {
            toastr.error(t`Character ${avatarUrl} not found in the list`, t`Error`, { timeOut: 5000, preventDuplicates: true });
        }
    }
}

export function getCharacterSource(chId = this_chid) {
    const character = characters[chId];

    if (!character) {
        return '';
    }

    const chubId = characters[chId]?.data?.extensions?.chub?.full_path;

    if (chubId) {
        return `https://chub.ai/characters/${chubId}`;
    }

    const pygmalionId = characters[chId]?.data?.extensions?.pygmalion_id;

    if (pygmalionId) {
        return `https://pygmalion.chat/${pygmalionId}`;
    }

    const githubRepo = characters[chId]?.data?.extensions?.github_repo;

    if (githubRepo) {
        return `https://github.com/${githubRepo}`;
    }

    const sourceUrl = characters[chId]?.data?.extensions?.source_url;

    if (sourceUrl) {
        return sourceUrl;
    }

    const risuId = characters[chId]?.data?.extensions?.risuai?.source;

    if (Array.isArray(risuId) && risuId.length && typeof risuId[0] === 'string' && risuId[0].startsWith('risurealm:')) {
        const realmId = risuId[0].split(':')[1];
        return `https://realm.risuai.net/character/${realmId}`;
    }

    const perchanceSlug = characters[chId]?.data?.extensions?.perchance_data?.slug;

    if (perchanceSlug) {
        return `https://perchance.org/ai-character-chat?data=${perchanceSlug}`;
    }

    return '';
}

function normalizeCharacterListPayload(payload) {
    if (!Array.isArray(payload)) {
        return [];
    }

    return payload.map(character => {
        const normalizedCharacter = structuredClone(character);
        normalizedCharacter.name = DOMPurify.sanitize(normalizedCharacter.name);

        if (!normalizedCharacter.chat) {
            normalizedCharacter.chat = `${normalizedCharacter.name} - ${humanizedDateTime()}`;
        }

        normalizedCharacter.chat = String(normalizedCharacter.chat);
        return normalizedCharacter;
    });
}

async function fetchAllCharactersDataOnly() {
    const response = await fetch('/api/characters/all', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({}),
    });

    return normalizeCharacterListPayload(await parseCharacterLibraryFetchResponse(response));
}

function projectCharacterLibraryCharactersAgainstPendingDeletes(queryCharacters) {
    const projection = projectCharacterLibraryQueryAgainstDeletedAvatars(
        queryCharacters,
        Array.from(pendingDeletedCharacterAvatars),
    );

    pendingDeletedCharacterAvatars.clear();
    for (const avatar of projection.pendingDeletedAvatars) {
        pendingDeletedCharacterAvatars.add(avatar);
    }

    return projection.characters;
}

export async function getCharacters() {
    try {
        const previousAvatar = this_chid !== undefined ? characters[this_chid]?.avatar : null;
        const normalizedCharacters = projectCharacterLibraryCharactersAgainstPendingDeletes(
            await fetchAllCharactersDataOnly(),
        );
        if (!hasCharacterLibraryPayloadChanged(characters, normalizedCharacters)) {
            return;
        }
        characters.splice(0, characters.length, ...normalizedCharacters);

        if (previousAvatar) {
            const newCharacterId = characters.findIndex(x => x.avatar === previousAvatar);
            if (newCharacterId >= 0) {
                setCharacterId(newCharacterId);
                await selectCharacterById(newCharacterId, { switchMenu: false });
            } else {
                await Popup.show.text(t`ERROR: The active character is no longer available.`, t`The page will be refreshed to prevent data loss. Press "OK" to continue.`);
                return location.reload();
            }
        }

        await printCharacters(true);
    } catch (error) {
        console.error('Failed to fetch characters:', error);
        const errorData = getCharacterLibraryFetchErrorData(error);
        if (errorData?.overflow) {
            await Popup.show.text(t`Character data length limit reached`, t`To resolve this, set "performance.lazyLoadCharacters" to "true" in config.yaml and restart the server.`);
        }
    }
}

async function delChat(chatfile) {
    const response = await fetch('/api/chats/delete', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({
            chatfile: chatfile,
            avatar_url: characters[this_chid].avatar,
        }),
    });
    if (response.ok === true) {
        // choose another chat if current was deleted
        const name = chatfile.replace('.jsonl', '');
        if (name === characters[this_chid].chat) {
            chat_metadata = {};
            await replaceCurrentChat();
        }
        await eventSource.emit(event_types.CHAT_DELETED, name);
    }
}


export async function replaceCurrentChat() {
    await clearChat({ clearData: true });

    const chatsResponse = await fetch('/api/characters/chats', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ avatar_url: characters[this_chid].avatar }),
    });

    if (chatsResponse.ok) {
        const chats = Object.values(await chatsResponse.json());
        chats.sort((a, b) => sortMoments(timestampToMoment(a.last_mes), timestampToMoment(b.last_mes)));

        if (chats.length && typeof chats[0] === 'object') {
            // pick existing chat
            characters[this_chid].chat = chats[0].file_name.replace('.jsonl', '');
            $('#selected_chat_pole').val(characters[this_chid].chat);
            saveCharacterDebounced();
            await getChat();
        } else {
            // start new chat
            characters[this_chid].chat = `${name2} - ${humanizedDateTime()}`;
            $('#selected_chat_pole').val(characters[this_chid].chat);
            saveCharacterDebounced();
            await getChat();
        }
    }
}


/**
 * Compatibility alias for callers that still name load-earlier as showMoreMessages.
 * React windowing owns the policy; this delegates to loadEarlierChatMessages.
 * @param {number|null} [messagesToLoad=null]
 * @returns {Promise<void>}
 */
export async function showMoreMessages(messagesToLoad = null) {
    return loadEarlierChatMessages(messagesToLoad);
}

function clearGenerationAutoRecoveryStatus(messageId) {
    if (isReactMainChatOwner()) {
        setMainChatMessageUiState(messageId, {
            recoveryStatus: null,
            recoveryStage: null,
            failureNoticeVisible: false,
            failureRetryVisible: false,
        });
        return;
    }

    const messageElement = chatElement.find(`.mes[mesid="${messageId}"]`);
    messageElement.find('.generation_auto_recovery_status').remove();
    messageElement.find('.generation_failure_retry').toggle(true);
    void mountReactMainChatMessageListPanel();
}

function showGenerationAutoRecoveryStatus(messageId, status, recoveryStage = 'primary') {
    if (isReactMainChatOwner()) {
        setMainChatMessageUiState(messageId, {
            recoveryStatus: String(status ?? ''),
            recoveryStage: recoveryStage === 'fallback' ? 'fallback' : 'primary',
            failureNoticeVisible: false,
            failureRetryVisible: false,
        });
        return;
    }

    const messageElement = chatElement.find(`.mes[mesid="${messageId}"]`);
    if (!messageElement.length) {
        return;
    }

    messageElement.find('.generation_auto_recovery_status').remove();
    const statusRow = $('<div class="generation_auto_recovery_status"></div>');
    statusRow.attr('role', 'status');
    statusRow.attr('aria-live', 'polite');
    statusRow.attr('data-recovery-stage', recoveryStage === 'fallback' ? 'fallback' : 'primary');
    statusRow.append($('<i class="fa-solid fa-circle-notch"></i>'));
    statusRow.append($('<span></span>').text(status));
    messageElement.find('.mes_text').after(statusRow);
    messageElement.find('.generation_failure_retry').toggle(false);
    void mountReactMainChatMessageListPanel();
}

function clearGenerationAttemptMessage(messageId, baseline = null) {
    const message = chat[messageId];
    const hasBaseline = baseline?.messageId === messageId;
    if (message && !message.is_user && !message.is_system) {
        message.mes = hasBaseline ? baseline.mes : '';
        if (hasBaseline) {
            if (Array.isArray(baseline.swipes)) {
                message.swipes = structuredClone(baseline.swipes);
            }
            if (baseline.swipe_id !== undefined) {
                message.swipe_id = baseline.swipe_id;
            }
            if (Array.isArray(baseline.swipe_info)) {
                message.swipe_info = structuredClone(baseline.swipe_info);
            }
            if (baseline.extra && typeof baseline.extra === 'object') {
                message.extra = structuredClone(baseline.extra);
            }
        } else if (Array.isArray(message.swipes)) {
            message.swipes = [''];
            message.swipe_id = 0;
            message.swipe_info = [{
                send_date: message.send_date,
                gen_started: message.gen_started,
                gen_finished: message.gen_finished,
                extra: structuredClone(message.extra ?? {}),
            }];
        }
        if (!hasBaseline && message.extra) {
            delete message.extra.reasoning;
            delete message.extra.reasoning_duration;
            delete message.extra.token_count;
            delete message.extra.time_to_first_token;
        }
        syncMesToSwipe(messageId);
    }

    if (isReactMainChatOwner()) {
        clearMainChatMessageUiState(messageId);
        void mountReactMainChatMessageListPanel();
        return;
    }

    const messageElement = chatElement.find(`.mes[mesid="${messageId}"]`);
    if (hasBaseline && message) {
        updateMessageElement(message, {
            messageId,
            messageElement,
            adjustMediaScroll: SCROLL_BEHAVIOR.ADJUST,
        });
    } else {
        messageElement.find('.mes_text').empty();
        messageElement.find('.mes_reasoning').empty();
    }
    messageElement.find('.generation_failure_notice').remove();
    messageElement.find('.generation_failure_retry').remove();
    void mountReactMainChatMessageListPanel();
}

function isAssistantRecoveryMessageId(messageId) {
    const message = chat[messageId];
    return typeof messageId === 'number' && messageId >= 0 && message && !message.is_user && !message.is_system;
}

function createExistingMessageRecoveryBaseline(type) {
    if (!['continue', 'swipe'].includes(type)) {
        return null;
    }

    const messageId = chat.length - 1;
    if (!isAssistantRecoveryMessageId(messageId)) {
        return null;
    }

    const message = chat[messageId];
    const swipes = Array.isArray(message.swipes) ? structuredClone(message.swipes) : null;
    const recoverySwipeId = message.swipe_id;
    return {
        type,
        messageId,
        mes: String(message.mes ?? ''),
        swipes,
        recoverySwipeId,
        swipe_id: getGenerationRecoveryBaselineSwipeId({
            type,
            swipeId: recoverySwipeId,
            swipeCount: swipes?.length ?? 0,
        }),
        swipe_info: Array.isArray(message.swipe_info) ? structuredClone(message.swipe_info) : null,
        extra: message.extra && typeof message.extra === 'object' ? structuredClone(message.extra) : null,
    };
}

function prepareGenerationRetrySwipe(messageId, baseline = null) {
    const message = chat[messageId];
    if (!message || baseline?.messageId !== messageId) {
        return;
    }

    const retrySwipeId = getGenerationRecoveryRetrySwipeId({
        type: baseline.type,
        swipeId: message.swipe_id,
        recoverySwipeId: baseline.recoverySwipeId,
        swipeCount: Array.isArray(message.swipes) ? message.swipes.length : 0,
    });

    if (typeof retrySwipeId === 'number') {
        message.swipe_id = retrySwipeId;
    }
}

async function replaceAssistantRecoveryMessage(messageId, { type, getMessage, title = '', swipes = [], reasoning = '', imageUrls = [], reasoningSignature = null, recoverySwipeId = undefined }) {
    if (!isAssistantRecoveryMessageId(messageId)) {
        return null;
    }

    const message = chat[messageId];
    const generationFinished = new Date();
    message.title = title;
    message.mes = getMessage;
    message.gen_started = generation_started;
    message.gen_finished = generationFinished;
    message.send_date = getMessageTimeStamp();
    message.extra = message.extra || {};
    const reasoningState = getGenerationRecoverySuccessReasoningState({
        type,
        existingReasoning: message.extra.reasoning,
        existingReasoningDuration: message.extra.reasoning_duration,
        reasoning,
    });
    message.extra.api = getGeneratingApi();
    message.extra.model = getGeneratingModel();
    message.extra.reasoning = reasoningState.reasoning;
    message.extra.reasoning_duration = reasoningState.reasoningDuration;
    message.extra.reasoning_signature = reasoningSignature;
    await processImageAttachment(message, { imageUrls });

    if (power_user.message_token_count_enabled) {
        const tokenCountText = (reasoningState.reasoning || '') + message.mes;
        message.extra.token_count = await getTokenCountAsync(tokenCountText, 0);
    }

    if (!isReactMainChatOwner()) {
        updateMessageElement(message, {
            messageId,
            messageElement: chatElement.find(`.mes[mesid="${messageId}"]`),
            adjustMediaScroll: SCROLL_BEHAVIOR.ADJUST,
        });
    }

    syncMesToSwipe(messageId);
    if (isReactMainChatOwner()) {
        scheduleMainChatMessageListPanelRefresh();
    }
    const swipeInfo = {
        send_date: message.send_date,
        gen_started: message.gen_started,
        gen_finished: message.gen_finished,
        extra: structuredClone(message.extra ?? {}),
    };
    const successSwipeId = getGenerationRecoverySuccessSwipeId({
        type,
        swipeId: message.swipe_id,
        recoverySwipeId,
        swipeCount: Array.isArray(message.swipes) ? message.swipes.length : 0,
    });

    if (successSwipeId === null || !Array.isArray(message.swipes)) {
        message.swipe_id = 0;
        message.swipes = [message.mes];
        message.swipe_info = [swipeInfo];
    } else {
        message.swipe_id = successSwipeId;
        if (!Array.isArray(message.swipe_info)) {
            message.swipe_info = [];
        }
        message.swipes[successSwipeId] = message.mes;
        message.swipe_info[successSwipeId] = swipeInfo;
    }

    if (Array.isArray(swipes) && swipes.length > 0) {
        const swipeInfoExtra = structuredClone(message.extra ?? {});
        delete swipeInfoExtra.token_count;
        delete swipeInfoExtra.reasoning;
        delete swipeInfoExtra.reasoning_duration;
        const swipeInfo = {
            send_date: message.send_date,
            gen_started: message.gen_started,
            gen_finished: message.gen_finished,
            extra: swipeInfoExtra,
        };
        const swipeInfoArray = Array(swipes.length).fill().map(() => structuredClone(swipeInfo));
        parseReasoningInSwipes(swipes, swipeInfoArray, message.extra?.reasoning_duration);
        message.swipes.push(...swipes);
        message.swipe_info.push(...swipeInfoArray);
    }

    await eventSource.emit(event_types.MESSAGE_RECEIVED, messageId, type);
    await eventSource.emit(event_types.CHARACTER_MESSAGE_RENDERED, messageId, type);
    return { type, getMessage };
}

function getGenerationLifecycleStatusLabels() {
    return {
        primaryRetry: t`正在重试`,
        fallback: t`正在使用备用服务商`,
    };
}

function showGenerationFailureRecovery(messageId, isRecovering = false) {
    if (isReactMainChatOwner()) {
        setMainChatMessageUiState(messageId, {
            recoveryStatus: null,
            recoveryStage: null,
            failureNoticeVisible: true,
            failureRetryVisible: !isRecovering,
        });
        return;
    }

    const messageElement = chatElement.find(`.mes[mesid="${messageId}"]`);

    if (!messageElement.length || messageElement.find('.generation_failure_retry').length) {
        messageElement.find('.generation_failure_retry').toggle(!isRecovering);
        void mountReactMainChatMessageListPanel();
        return;
    }

    const notice = $('<div class="generation_failure_notice" role="status" data-i18n="Generation failed. You can retry this response or keep chatting.">Generation failed. You can retry this response or keep chatting.</div>');
    const retryButton = $('<div class="mes_button generation_failure_retry fa-solid fa-rotate-right" role="button" tabindex="0" title="Retry generation" aria-label="Retry generation" data-i18n="[title]Retry generation;[aria-label]Retry generation"></div>');
    messageElement.find('.mes_text').after(notice);
    messageElement.find('.mes_buttons').append(retryButton);
    messageElement.find('.generation_failure_retry').toggle(!isRecovering);
    void mountReactMainChatMessageListPanel();
}

/**
 * Visually updates all chat messages including and after index by removing them, then adding them.
 * @param {object} [options] Options
 * @param {ChatMessage[]} [options.targetChat=chat] All messages in chat before startIndex will remain unchanged.
 * @param {Number} [options.startIndex=0] Everything including and after startIndex will be replaced.
 * @param {Boolean} [options.fade=true] When false, the swipe chevrons will not fade in.
 */
export async function redisplayChat({ targetChat = chat, startIndex = 0, fade = true } = {}) {
    if (isReactMainChatOwner()) {
        void mountReactMainChatMessageListPanel();
        return;
    }

    const messageElements = chatElement.find('.mes');
    messageElements.removeClass('last_mes');

    //Remove messages after index.
    messageElements.filter(`.mes[mesid="${startIndex}"]`).nextAll('.mes').addBack().remove();

    const t1 = performance.now();

    const messages = targetChat.slice(startIndex);

    if (messages.length > 0) {
        const newMessageElements = messages.map((message, offset) => {
            const i = startIndex + offset;
            const messageElement = updateMessageElement(message, { messageId: i });

            return messageElement[0];
        });

        //The last_mes has been removed, add it to the new last message.
        newMessageElements.at(-1).classList.add('last_mes');

        //Append to chat in one DOM update.
        chatElement.append(newMessageElements);

        applyCharacterTagsToMessageDivs({ mesIds: lodash.range(startIndex, targetChat.length, 1) });
    }

    refreshSwipeButtons(false, fade);
    applyStylePins();
    updateEditArrowClasses();

    console.info(`Rendered ${targetChat.length - startIndex} messages in ${((performance.now() - t1) / 1000).toFixed(3)} seconds.`);
}

export function scrollOnMediaLoad(renderGeneration = mainChatMessageRenderGeneration) {
    if (renderGeneration !== mainChatMessageRenderGeneration) {
        return;
    }

    const started = Date.now();
    const media = chatElement.find('.mes_block img, .mes_block video, .mes_block audio').toArray();
    let mediaLoaded = 0;

    for (const currentElement of media) {
        if (currentElement instanceof HTMLImageElement) {
            if (currentElement.complete) {
                incrementAndCheck();
            } else {
                currentElement.addEventListener('load', incrementAndCheck);
                currentElement.addEventListener('error', incrementAndCheck);
            }
        }
        if (currentElement instanceof HTMLMediaElement) {
            if (currentElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                incrementAndCheck();
            } else {
                currentElement.addEventListener('loadeddata', incrementAndCheck);
                currentElement.addEventListener('error', incrementAndCheck);
            }
        }
    }

    function incrementAndCheck() {
        const MAX_DELAY = 1000; // 1 second
        if ((Date.now() - started) > MAX_DELAY) {
            return;
        }
        if (renderGeneration !== mainChatMessageRenderGeneration) {
            return;
        }
        mediaLoaded++;
        if (mediaLoaded === media.length) {
            scrollChatToBottom({ waitForFrame: true });
        }
    }
}

/**
 * Cancels the debounced chat save if it is currently pending.
 */
export function cancelDebouncedChatSave() {
    if (chatSaveTimeout) {
        console.debug('Debounced chat save cancelled');
        clearTimeout(chatSaveTimeout);
        chatSaveTimeout = null;
    }
}


export async function deleteLastMessage() {
    const deletedMessageId = chat.length - 1;
    chat.length = chat.length - 1;
    if (isReactMainChatOwner()) {
        clearMainChatMessageUiState(deletedMessageId);
        if (this_edit_mes_id === deletedMessageId) {
            this_edit_mes_id = undefined;
        }
        mainChatVisibleStartIndices.delete(getCurrentChatId());
        saveChatDebounced();
        await eventSource.emit(event_types.MESSAGE_DELETED, chat.length);
        void mountReactMainChatMessageListPanel();
        return;
    }
    chatElement.children('.mes').last().remove();
    await eventSource.emit(event_types.MESSAGE_DELETED, chat.length);
}

/**
 * Deletes a message from the chat by its ID, optionally asking for confirmation.
 * @param {number} id The ID of the message to delete.
 * @param {number} [swipeDeletionIndex] Deletes the swipe with that index.
 * @param {boolean} [askConfirmation=false] Whether to ask for confirmation before deleting.
 */
export async function deleteMessage(id, swipeDeletionIndex = undefined, askConfirmation = false) {
    const canDeleteSwipe = swipeDeletionIndex !== undefined && swipeDeletionIndex !== null;
    if (canDeleteSwipe) {
        if (swipeDeletionIndex < 0) {
            throw new Error('Swipe index cannot be negative');
        }
        if (!Array.isArray(chat[id].swipes)) {
            throw new Error('Message has no swipes to delete');
        }
        if (chat[id].swipes.length <= swipeDeletionIndex) {
            throw new Error('Swipe index out of bounds');
        }
    }

    let deleteOnlySwipe = canDeleteSwipe;
    if (askConfirmation) {
        const result = await callGenericPopup(t`Are you sure you want to delete this message?`, POPUP_TYPE.CONFIRM, null, {
            okButton: canDeleteSwipe ? t`Delete Swipe` : t`Delete Message`,
            cancelButton: 'Cancel',
            customButtons: canDeleteSwipe ? [t`Delete Message`] : null,
        });
        if (!result) {
            return;
        }
        deleteOnlySwipe = canDeleteSwipe && result === POPUP_RESULT.AFFIRMATIVE; // Default button, not the custom one
    }

    if (deleteOnlySwipe) {
        await deleteSwipe(swipeDeletionIndex, id);
        return;
    }

    if (isReactMainChatOwner()) {
        chat.splice(id, 1);
        shiftMainChatMessageUiStateAfterSplice(id, -1);
        chat_metadata.tainted = true;
        if (this_edit_mes_id === id) {
            this_edit_mes_id = undefined;
        }
        mainChatVisibleStartIndices.delete(getCurrentChatId());
        saveChatDebounced();
        await eventSource.emit(event_types.MESSAGE_DELETED, chat.length);
        void mountReactMainChatMessageListPanel();
        return;
    }

    const minId = getFirstDisplayedMessageId();
    const messageElement = chatElement.find(`.mes[mesid="${id}"]`);
    if (messageElement.length === 0) {
        return;
    }

    chat.splice(id, 1);
    messageElement.remove();

    chat_metadata.tainted = true;

    const startIndex = [0, minId].includes(id) ? id : null;
    updateViewMessageIds(startIndex);
    saveChatDebounced();

    if (this_edit_mes_id === id) {
        this_edit_mes_id = undefined;
    }

    refreshSwipeButtons();

    await eventSource.emit(event_types.MESSAGE_DELETED, chat.length);
}

export const reloadChatMutex = new SimpleMutex(reloadCurrentChatUnsafe);
export const reloadCurrentChat = reloadChatMutex.update.bind(reloadChatMutex);

/**
 * Reloads the current chat unsafely, without mutex protection.
 * Use `reloadCurrentChat` instead to ensure thread safety.
 * @returns {Promise<void>} A promise that resolves when the chat is reloaded.
 */
export async function reloadCurrentChatUnsafe() {
    preserveNeutralChat();
    await clearChat({ clearData: true });

    if (this_chid !== undefined) {
        await getChat();
    } else {
        resetChatState();
        restoreNeutralChat();
        await getCharacters();
        await printMessages();
        await eventSource.emit(event_types.CHAT_CHANGED, getCurrentChatId());
    }

    refreshSwipeButtons();
}

/**
 * Send the message currently typed into the chat box.
 */
export async function sendTextareaMessage() {
    // don't proceed during swipeGenerate()
    if (swipeState == SWIPE_STATE.EDITING) {
        toastr.warning(t`Confirm the edit to start a generation.`, t`You cannot send a message during a swipe-edit.`);
        return;
    }
    if (swipeState !== SWIPE_STATE.NONE) return; // don't proceed if mid-swipe.
    if (is_send_press) return;
    if (isExecutingCommandsFromChatInput) return;

    hideSwipeButtons(); //Swipe buttons must be hidden now, otherwise concurrent generations are possible.

    let generateType = 'normal';
    // "Continue on send" is activated when the user hits "send" (or presses enter) on an empty chat box, and the last
    // message was sent from a character (not the user or the system).
    const textareaText = String($('#send_textarea').val());
    const lastMessage = chat[chat.length - 1];
    if (power_user.continue_on_send &&
        !hasPendingFileAttachment() &&
        !textareaText &&
        chat.length &&
        !lastMessage.is_user &&
        !lastMessage.is_system
    ) {
        generateType = 'continue';
    }

    if (textareaText && this_chid === undefined && name2 !== neutralCharacterName) {
        await newAssistantChat({ temporary: false });
    }

    let generation = await Generate(generateType);
    showSwipeButtons();
    return generation;
}


/**
 * @deprecated Function is not needed anymore, as the new signature of substituteParams is more flexible.
 *
 * Substitutes {{macro}} parameters in a string.
 * @returns {string} The string with substituted parameters.
 */
export function substituteParamsExtended(content, additionalMacro = {}, postProcessFn = (x) => x) {
    return substituteParams(content, { dynamicMacros: additionalMacro, postProcessFn });
}

/**
 * Substitutes {{macro}} parameters in a string.
 * @param {string} content - The string to substitute parameters in.
 * @param {string} [_name1] - The name of the user. Uses global name1 if not provided.
 * @param {string} [_name2] - The name of the character. Uses global name2 if not provided.
 * @param {string} [_original] - The original message for {{original}} substitution.
 * @param {string} [_group] - The group members list for {{group}} substitution.
 * @param {boolean} [_replaceCharacterCard] - Whether to replace character card macros.
 * @param {Record<string,any>} [additionalMacro] - Additional environment variables for substitution.
 * @param {(x: string) => string} [postProcessFn] - Post-processing function for each substituted macro.
 * @returns {string} The string with substituted parameters.
 */
export function substituteParamsLegacy(content, _name1, _name2, _original, _group, _replaceCharacterCard = true, additionalMacro = {}, postProcessFn = (x) => x) {
    if (!content) {
        return '';
    }

    // If experimental macro engine is enabled, use it. This code will be cleaned up in the future.
    if (power_user?.experimental_macro_engine) {
        return substituteParams(content, {
            name1Override: _name1,
            name2Override: _name2,
            original: _original,
            groupOverride: _group,
            replaceCharacterCard: _replaceCharacterCard ?? true,
            dynamicMacros: additionalMacro ?? {},
            postProcessFn: postProcessFn ?? ((x) => x),
        });
    }

    // Try to roughly detect experimental macro features to show the onboarding if needed.
    // This does not have to be 100% accurate, only best effort what we can quickly check.
    // Only do this if the warning wasn't shown yet, to prevent needless regex checks.
    if (accountStorage.getItem('slash_command_experimental_engine_warning_shown') !== 'true') {
        let feature = /** @type {string|null} */ (null);
        if (/{{\s*if/.test(content)) feature = '{{if}} macro';
        else if (/{{\s*\//.test(content)) feature = 'scoped macro';
        else if (/{{\s*[!?~#/]/.test(content)) feature = 'macro flags';
        else if (/{{\s*[.$]/.test(content)) feature = 'variable shorthands';
        else if (/\{\{(?:(?!\}\}).)*\{\{(?=[\s\S]*?\}\}[\s\S]*?\}\})/.test(content)) feature = 'nested macro';
        else if (/{{(?:greeting|charFirstMessage)(?:::\d+)?}}/i.test(content)) feature = 'greeting macro';

        if (feature) void onboardingExperimentalMacroEngine(feature);
    }

    const environment = {};

    if (typeof _original === 'string') {
        let originalSubstituted = false;
        environment.original = () => {
            if (originalSubstituted) {
                return '';
            }

            originalSubstituted = true;
            return _original;
        };
    }

    const getGroupValue = (includeMuted) => {
        void includeMuted;
        return typeof _group === 'string' ? _group : (_name2 ?? name2);
    };

    const getNotCharValue = () => _name1 ?? name1;

    if (_replaceCharacterCard) {
        const fields = getCharacterCardFields();
        environment.charPrompt = fields.system || '';
        environment.charInstruction = environment.charJailbreak = fields.jailbreak || '';
        environment.description = fields.description || '';
        environment.personality = fields.personality || '';
        environment.scenario = fields.scenario || '';
        environment.persona = fields.persona || '';
        environment.mesExamples = () => {
            const mesExamplesArray = parseMesExamples(fields.mesExamples);
            return mesExamplesArray.join('');
        };
        environment.mesExamplesRaw = fields.mesExamples || '';
        environment.charVersion = fields.version || '';
        environment.char_version = fields.version || '';
        environment.charDepthPrompt = fields.charDepthPrompt || '';
        environment.creatorNotes = fields.creatorNotes || '';
    }

    // Must be substituted last so that they're replaced inside {{description}}
    environment.user = _name1 ?? name1;
    environment.char = _name2 ?? name2;
    environment.group = environment.charIfNotGroup = getGroupValue(true);
    environment.groupNotMuted = getGroupValue(false);
    environment.notChar = getNotCharValue();
    environment.model = getGeneratingModel();

    if (additionalMacro && typeof additionalMacro === 'object') {
        Object.assign(environment, additionalMacro);
    }

    return evaluateMacros(content, environment, postProcessFn);
}

/** @typedef {import('./scripts/macros/engine/MacroRegistry.js').MacroHandler} MacroHandler */

/**
 * Substitutes {{macros}} in a string using the new macro engine.
 *
 * This will replace all registered macros and dynamic additional macros as environment context.
 *
 * @param {string} content - The string to substitute parameters in.
 * @param {Object} [options={}] - Options for the substitution.
 * @param {string} [options.name1Override] - The name of the user. Uses global name1 if not provided.
 * @param {string} [options.name2Override] - The name of the character. Uses global name2 if not provided.
 * @param {string} [options.original] - The original message for {{original}} substitution.
 * @param {string} [options.groupOverride] - The group members list for {{group}} substitution.
 * @param {boolean} [options.replaceCharacterCard=true] - Whether to replace character card macros.
 * @param {Record<string, import('./scripts/macros/engine/MacroEnv.types.js').DynamicMacroValue>} [options.dynamicMacros={}] - Additional environment variables as dynamic macros for substitution. Registered as macro functions.
 * @param {(x: string) => string} [options.postProcessFn=(x) => x] - Post-processing function for each substituted macro.
 * @returns {string} The string with substituted parameters.
 */
export function substituteParams(content, options = {}) {
    if (!content) return '';

    if (typeof content !== 'string') {
        console.warn('substituteParams: content will be coerced to string', content);
        content = String(content);
    }

    // Handle legacy signature calls to substituteParams
    // We'll simply re-route them to a temporary legacy function. In the future, we'll remove this and cleanly build the options object ourselves.
    const isOptionsObject = options && typeof options === 'object' && !Array.isArray(options);
    if (!isOptionsObject) {
        return substituteParamsLegacy.call(this, ...arguments);
    }

    // Keep the new macro engine behind a feature switch for now
    if (!power_user?.experimental_macro_engine) {
        return substituteParamsLegacy(content, options.name1Override, options.name2Override, options.original, options.groupOverride, options.replaceCharacterCard, options.dynamicMacros, options.postProcessFn);
    }

    const ctx = /** @type {import('./scripts/macros/engine/MacroEnvBuilder.js').MacroEnvRawContext} */ ({
        content,
        name1Override: options.name1Override,
        name2Override: options.name2Override,
        original: options.original,
        groupOverride: options.groupOverride,
        replaceCharacterCard: options.replaceCharacterCard ?? true,
        dynamicMacros: options.dynamicMacros ?? {},
        postProcessFn: options.postProcessFn ?? ((x) => x),
    });

    const env = MacroEnvBuilder.buildFromRawEnv(ctx);
    const result = MacroEngine.evaluate(content, env);
    return result;
}


/**
 * Gets stopping sequences for the prompt.
 * @param {boolean} _isImpersonate A request is made to impersonate a user
 * @param {boolean} _isContinue A request is made to continue the message
 * @param {string} [_api] Optional API name to get API-specific stopping sequences for
 * @returns {string[]} Array of stopping strings
 */
export function getStoppingStrings(_isImpersonate, _isContinue, _api = main_api) {
    return getCustomStoppingStrings();
}

/**
 * Background generation based on the provided prompt.
 * @typedef {object} GenerateQuietPromptParams
 * @prop {string} [quietPrompt] Instruction prompt for the AI
 * @prop {boolean} [quietToLoud] Whether the message should be sent in a foreground (loud) or background (quiet) mode
 * @prop {boolean} [skipWIAN] Whether to skip addition of World Info and Author's Note into the prompt
 * @prop {string} [quietImage] Image to use for the quiet prompt
 * @prop {string} [quietName] Name to use for the quiet prompt (defaults to "System:")
 * @prop {number} [responseLength] Maximum response length. If unset, the global default value is used.
 * @prop {object} [jsonSchema] JSON schema to use for the structured generation. Usually requires a special instruction.
 * @prop {boolean} [backgroundGeneration] Whether this quiet request is acting as a background helper flow.
 * @prop {boolean} [removeReasoning] Parses and removes the reasoning block according to reasoning format preferences
 * @prop {boolean} [trimToSentence] Whether to trim the response to the last complete sentence
 * @param {GenerateQuietPromptParams} params Parameters for the quiet prompt generation
 * @returns {Promise<string>} Generated text. If using structured output, will contain a serialized JSON object.
 */
export async function generateQuietPrompt({ quietPrompt = '', quietToLoud = false, skipWIAN = false, quietImage = null, quietName = null, responseLength = null, jsonSchema = null, backgroundGeneration = false, removeReasoning = true, trimToSentence = false } = {}) {
    if (arguments.length > 0 && typeof arguments[0] !== 'object') {
        console.trace('generateQuietPrompt called with positional arguments. Please use an object instead.');
        [quietPrompt, quietToLoud, skipWIAN, quietImage, quietName, responseLength, jsonSchema] = arguments;
    }

    const responseLengthCustomized = typeof responseLength === 'number' && responseLength > 0;
    const quietTransportDecision = createGenerationCommand({
        kind: backgroundGeneration ? 'backgroundGeneration' : quietToLoud ? 'quietToLoud' : 'quietPrompt',
        mainApi: main_api,
        quietPrompt: true,
        quietToLoud: quietToLoud ?? false,
        backgroundGeneration: backgroundGeneration ?? false,
    });
    const quietTransportContract = createQuietGenerationLifecycleContract({
        quietToLoud: quietToLoud ?? false,
        backgroundGeneration: backgroundGeneration ?? false,
    });
    const quietTransportSnapshot = {
        ...quietTransportDecision,
        ...quietTransportContract,
        error: '',
    };
    let eventHook = () => { };
    try {
        /** @type {GenerateOptions} */
        const generateOptions = {
            quiet_prompt: quietPrompt ?? '',
            quietToLoud: quietToLoud ?? false,
            backgroundGeneration: backgroundGeneration ?? false,
            skipWIAN: skipWIAN ?? false,
            force_name2: true,
            quietImage: quietImage ?? null,
            quietName: quietName ?? null,
            jsonSchema: jsonSchema ?? null,
        };
        rememberMainChatQuietTransportSnapshot({
            ...quietTransportSnapshot,
            phase: 'running',
        });
        if (responseLengthCustomized) {
            TempResponseLength.save(main_api, responseLength);
            eventHook = TempResponseLength.setupEventHook(main_api);
        }
        let result = await Generate('quiet', generateOptions);
        result = trimToSentence ? trimToEndSentence(result) : result;
        result = removeReasoning ? removeReasoningFromString(result) : result;
        rememberMainChatQuietTransportSnapshot({
            ...quietTransportSnapshot,
            phase: 'completed',
        });
        return result;
    } catch (error) {
        rememberMainChatQuietTransportSnapshot({
            ...quietTransportSnapshot,
            phase: isMainChatQuietTransportStopException(error) ? 'stopped' : 'error',
            error: isMainChatQuietTransportStopException(error)
                ? ''
                : String(error?.message ?? error ?? ''),
        });
        throw error;
    } finally {
        if (responseLengthCustomized && TempResponseLength.isCustomized()) {
            TempResponseLength.restore(main_api);
            TempResponseLength.removeEventHook(main_api, eventHook);
        }
    }
}

/**
 * Executes slash commands and returns the new text and whether the generation was interrupted.
 * @param {string} message Text to be sent
 * @returns {Promise<boolean>} Whether the message sending was interrupted
 */
export async function processCommands(message) {
    if (!message || !message.trim().startsWith('/')) {
        return false;
    }
    await executeSlashCommandsOnChatInput(message, {
        clearChatInput: true,
    });
    return true;
}

/**
 * Extracts the contents of bias macros from a message.
 * @param {string} message Message text
 * @returns {string} Message bias extracted from the message (or an empty string if not found)
 */
export function extractMessageBias(message) {
    if (!message) {
        return '';
    }

    try {
        const biasHandlebars = Handlebars.create();
        const biasMatches = [];
        biasHandlebars.registerHelper('bias', function (text) {
            biasMatches.push(text);
            return '';
        });
        const template = biasHandlebars.compile(message);
        template({});

        if (biasMatches && biasMatches.length > 0) {
            return ` ${biasMatches.join(' ')}`;
        }

        return '';
    } catch {
        return '';
    }
}

function addPersonaDescriptionExtensionPrompt() {
    const INJECT_TAG = 'PERSONA_DESCRIPTION';
    setExtensionPrompt(INJECT_TAG, '', extension_prompt_types.IN_PROMPT, 0);

    if (!power_user.persona_description || power_user.persona_description_position === persona_description_positions.NONE) {
        return;
    }

    const promptPositions = [persona_description_positions.BOTTOM_AN, persona_description_positions.TOP_AN];

    if (promptPositions.includes(power_user.persona_description_position)) {
        const originalAN = extension_prompts[NOTE_MODULE_NAME]?.value ?? '';
        const ANWithDesc = power_user.persona_description_position === persona_description_positions.TOP_AN
            ? `${power_user.persona_description}\n${originalAN}`
            : `${originalAN}\n${power_user.persona_description}`;

        setExtensionPrompt(NOTE_MODULE_NAME, ANWithDesc, chat_metadata[metadata_keys.position] ?? extension_prompt_types.IN_CHAT, chat_metadata[metadata_keys.depth] ?? 4, extension_settings.note?.allowWIScan ?? false, chat_metadata[metadata_keys.role] ?? extension_prompt_roles.SYSTEM);
    }

    if (power_user.persona_description_position === persona_description_positions.AT_DEPTH) {
        setExtensionPrompt(INJECT_TAG, power_user.persona_description, extension_prompt_types.IN_CHAT, power_user.persona_description_depth, true, power_user.persona_description_role);
    }
}

/**
 * Returns all extension prompts combined.
 * @returns {Promise<string>} Combined extension prompts
 */
async function getAllExtensionPrompts() {
    const values = [];

    for (const prompt of Object.values(extension_prompts)) {
        const value = prompt?.value?.trim();

        if (!value) {
            continue;
        }

        const hasFilter = typeof prompt.filter === 'function';
        if (hasFilter && !await prompt.filter()) {
            continue;
        }

        values.push(value);
    }

    return substituteParams(values.join('\n'));
}

/**
 * Wrapper to fetch extension prompts by module name
 * @param {string} moduleName Module name
 * @returns {Promise<string>} Extension prompt
 */
export async function getExtensionPromptByName(moduleName) {
    if (!moduleName) {
        return '';
    }

    const prompt = extension_prompts[moduleName];

    if (!prompt) {
        return '';
    }

    const hasFilter = typeof prompt.filter === 'function';

    if (hasFilter && !await prompt.filter()) {
        return '';
    }

    return substituteParams(prompt.value);
}

/**
 * Gets the maximum depth of extension prompts.
 * @returns {number} Maximum depth of extension prompts
 */
export function getExtensionPromptMaxDepth() {
    return MAX_INJECTION_DEPTH;
    /*
    const prompts = Object.values(extension_prompts);
    const maxDepth = Math.max(...prompts.map(x => x.depth ?? 0));
    // Clamp to 1 <= depth <= MAX_INJECTION_DEPTH
    return Math.max(Math.min(maxDepth, MAX_INJECTION_DEPTH), 1);
    */
}

/**
 * Returns the extension prompt for the given position, depth, and role.
 * If multiple prompts are found, they are joined with a separator.
 * @param {number} [position] Position of the prompt
 * @param {number} [depth] Depth of the prompt
 * @param {string} [separator] Separator for joining multiple prompts
 * @param {number} [role] Role of the prompt
 * @param {boolean} [wrap] Wrap start and end with a separator
 * @returns {Promise<string>} Extension prompt
 */
export async function getExtensionPrompt(position = extension_prompt_types.IN_PROMPT, depth = undefined, separator = '\n', role = undefined, wrap = true) {
    const filterByFunction = async (prompt) => {
        const hasFilter = typeof prompt.filter === 'function';
        if (hasFilter && !await prompt.filter()) {
            return false;
        }
        return true;
    };
    const promptPromises = Object.keys(extension_prompts)
        .sort()
        .map((x) => extension_prompts[x])
        .filter(x => x.position == position && x.value)
        .filter(x => depth === undefined || x.depth === undefined || x.depth === depth)
        .filter(x => role === undefined || x.role === undefined || x.role === role)
        .filter(filterByFunction);
    const prompts = await Promise.all(promptPromises);

    let values = prompts.map(x => x.value.trim()).join(separator);
    if (wrap && values.length && !values.startsWith(separator)) {
        values = separator + values;
    }
    if (wrap && values.length && !values.endsWith(separator)) {
        values = values + separator;
    }
    if (values.length) {
        values = substituteParams(values);
    }
    return values;
}

/**
 * Base chat replacement function for character card fields.
 * 1. Substitutes macros using substituteParams.
 * 2. Collapses newlines if enabled in power user settings.
 * 3. Removes carriage return characters.
 * @param {string} value Input string
 * @param {string?} name1Override Override for name1
 * @param {string?} name2Override Override for name2
 * @returns {string} Processed string
 */
export function baseChatReplace(value, name1Override = null, name2Override = null) {
    if (typeof value === 'string' && value.length > 0) {
        value = substituteParams(value, { name1Override, name2Override, replaceCharacterCard: false });

        if (power_user.collapse_newlines) {
            value = collapseNewlines(value);
        }

        value = value.replace(/\r/g, '');
    }
    return value;
}

/**
 * @typedef {Object} CharacterCardFields
 * @property {string} system System prompt
 * @property {string} mesExamples Message examples
 * @property {string} description Description
 * @property {string} personality Personality
 * @property {string} persona Persona
 * @property {string} scenario Scenario
 * @property {string} jailbreak Jailbreak instructions
 * @property {string} version Character version
 * @property {string} charDepthPrompt Character depth note
 * @property {string} creatorNotes Character creator notes
 * @property {string} firstMessage Character first message / greeting
 * @property {string[]} alternateGreetings Character alternate greetings
 */

/**
 * Helper to create an object with lazy, memoized getters from a map of field resolvers.
 * @param {Record<string, () => string|string[]>} resolvers Map of field names to resolver functions
 * @returns {CharacterCardFields} Object with lazy getters
 */
export function createLazyFields(resolvers) {
    const result = /** @type {CharacterCardFields} */ ({});
    for (const [key, resolver] of Object.entries(resolvers)) {
        let cached;
        let resolved = false;
        Object.defineProperty(result, key, {
            get() {
                if (!resolved) {
                    cached = resolver();
                    resolved = true;
                }
                return cached;
            },
            enumerable: true,
            configurable: true,
        });
    }
    return result;
}

/**
 * Returns the character card fields for the current character as lazy getters.
 * Each field is only processed (baseChatReplace) when first accessed.
 * @param {Object} [options={}]
 * @param {number} [options.chid] Optional character index
 * @returns {CharacterCardFields} Character card fields with lazy evaluation
 */
export function getCharacterCardFieldsLazy({ chid = undefined } = {}) {
    const currentChid = chid ?? this_chid;
    const character = characters[currentChid];

    const resolvers = {
        persona: () => baseChatReplace(power_user.persona_description?.trim()),
        system: () => {
            if (!character) return '';
            const systemPrompt = chat_metadata.system_prompt || character.data?.system_prompt || '';
            return power_user.prefer_character_prompt ? baseChatReplace(systemPrompt.trim()) : '';
        },
        jailbreak: () => {
            if (!character) return '';
            return power_user.prefer_character_jailbreak ? baseChatReplace(character.data?.post_history_instructions?.trim()) : '';
        },
        version: () => character?.data?.character_version ?? '',
        charDepthPrompt: () => {
            if (!character) return '';
            return baseChatReplace(character.data?.extensions?.depth_prompt?.prompt?.trim());
        },
        creatorNotes: () => {
            if (!character) return '';
            return baseChatReplace(character.data?.creator_notes?.trim());
        },
        description: () => {
            if (!character) return '';
            return baseChatReplace(character.description?.trim());
        },
        personality: () => {
            if (!character) return '';
            return baseChatReplace(character.personality?.trim());
        },
        scenario: () => {
            if (!character) return '';
            const scenarioText = chat_metadata.scenario || character.scenario || '';
            return baseChatReplace(scenarioText.trim());
        },
        mesExamples: () => {
            if (!character) return '';
            const exampleDialog = chat_metadata.mes_example || character.mes_example || '';
            return baseChatReplace(exampleDialog.trim());
        },
        firstMessage: () => {
            if (!character) return '';
            const firstMes = character.first_mes?.trim() || '';
            return baseChatReplace(firstMes);
        },
        alternateGreetings: () => {
            if (!character) return [];
            const altGreetings = character.data?.alternate_greetings;
            if (!Array.isArray(altGreetings)) return [];
            return altGreetings.map(greeting => baseChatReplace(greeting?.trim()));
        },
    };

    return createLazyFields(resolvers);
}

/**
 * Returns the character card fields for the current character.
 * @param {Object} [options={}]
 * @param {number} [options.chid] Optional character index
 * @returns {CharacterCardFields} Character card fields
 */
export function getCharacterCardFields({ chid = undefined } = {}) {
    const lazy = getCharacterCardFieldsLazy({ chid });

    // Resolve all lazy fields into a plain object
    return {
        system: lazy.system,
        mesExamples: lazy.mesExamples,
        description: lazy.description,
        personality: lazy.personality,
        persona: lazy.persona,
        scenario: lazy.scenario,
        jailbreak: lazy.jailbreak,
        version: lazy.version,
        charDepthPrompt: lazy.charDepthPrompt,
        creatorNotes: lazy.creatorNotes,
        firstMessage: lazy.firstMessage,
        alternateGreetings: lazy.alternateGreetings,
    };
}

/**
 * Parses an examples string.
 * @param {string} examplesStr
 * @returns {string[]} Examples array with block heading
 */
export function parseMesExamples(examplesStr) {
    if (!examplesStr || examplesStr.length === 0 || examplesStr === '<START>') {
        return [];
    }

    if (!examplesStr.startsWith('<START>')) {
        examplesStr = '<START>\n' + examplesStr.trim();
    }

    const blockHeading = '<START>\n';
    const splitExamples = examplesStr.split(/<START>/gi).slice(1).map(block => `${blockHeading}${block.trim()}\n`);

    return splitExamples;
}

export function isStreamingEnabled() {
    return (
        main_api == 'openai' &&
        oai_settings.stream_openai &&
        !(oai_settings.chat_completion_source == chat_completion_sources.OPENAI && ['o1-2024-12-17', 'o1'].includes(oai_settings.openai_model))
    );
}

function showStopButton() {
    $('#mes_stop').css({ 'display': 'flex' });
}

function hideStopButton() {
    // prevent NOOP, because hideStopButton() gets called multiple times
    if ($('#mes_stop').css('display') !== 'none') {
        $('#mes_stop').css({ 'display': 'none' });
        eventSource.emit(event_types.GENERATION_ENDED, chat.length);
    }
}


/**
 * Constructs a prompt to be used for either Text Completion or Chat Completion. Input is format-agnostic.
 * @param {string | object[]} prompt Input prompt. Can be a string or an array of chat-style messages, i.e. [{role: '', content: ''}, ...]
 * @param {string} api API to use.
 * @param {boolean} instructOverride Deprecated no-op kept for positional-call compatibility (instruct mode retired).
 * @param {boolean} quietToLoud true to generate a message in system mode, false to generate a message in character mode
 * @param {string} [systemPrompt] System prompt to use.
 * @param {string} [prefill] Prefill for the prompt.
 * @returns {string | object[]} Prompt ready for use in generation. If using TC, this will be a string. If using CC, this will be an array of chat-style messages.
 */
export function createRawPrompt(prompt, api, instructOverride, quietToLoud, systemPrompt, prefill) {
    // If the prompt was given as a string, convert to a message-style object assuming user role
    if (typeof prompt === 'string') {
        const message = { role: 'user', content: prompt.trim() };
        prompt = [message];
    } else {  // checks for message-style object
        if (prompt.length === 0 && !systemPrompt) throw Error('No messages provided');
    }

    // Substitute the prefill if provided
    prefill = substituteParams(prefill ?? '');

    // Format each message in the prompt, accounting for the provided roles
    for (const message of prompt) {
        message.content = substituteParams(message.content ?? '');
    }

    // prepend system prompt, if provided
    if (systemPrompt) {
        systemPrompt = substituteParams(systemPrompt).trim();
        prompt.unshift({ role: 'system', content: systemPrompt });
    }

    // with Chat Completion, the prefill is an additional assistant message at the end.
    if (prefill) {
        prompt.push({ role: 'assistant', content: prefill });
    }

    return prompt;
}

/**
 * @typedef {object} GenerateRawParams
 * @prop {string | object[]} [prompt] Prompt to generate a message from. Can be a string or an array of chat-style messages, i.e. [{role: '', content: ''}, ...]
 * @prop {string} [api] API to use. Main API is used if not specified.
 * @prop {boolean} [instructOverride] Deprecated no-op kept for compatibility (instruct mode retired).
 * @prop {boolean} [quietToLoud] true to generate a message in system mode, false to generate a message in character mode
 * @prop {string} [systemPrompt] System prompt to use.
 * @prop {number} [responseLength] Maximum response length. If unset, the global default value is used.
 * @prop {boolean} [trimNames] Whether to allow trimming "{{user}}:" and "{{char}}:" from the response.
 * @prop {string} [prefill] An optional prefill for the prompt.
 * @prop {JsonSchema} [jsonSchema] JSON schema to use for the structured generation. Usually requires a special instruction.
 */

/**
 * Generates a raw data object using the provided prompt.
 * This used to be part of `generateRaw`, but separating it out allows extensions to access other data such as reasoning message.
 * @param {GenerateRawParams} params Parameters for generating a message
 * @returns {Promise<object | string>} Raw API response data, or a JSON string extracted from the response when `jsonSchema` is provided.
 */
export async function generateRawData({ prompt = '', api = null, instructOverride = false, quietToLoud = false, systemPrompt = '', responseLength = null, prefill = '', jsonSchema = null } = {}) {
    if (!api) {
        api = main_api;
    }

    const abortController = new AbortController();
    const responseLengthCustomized = typeof responseLength === 'number' && responseLength > 0;
    let eventHook = () => { };

    // construct final prompt from the input. Can either be a string or an array of chat-style messages.
    prompt = createRawPrompt(prompt, api, instructOverride, quietToLoud, systemPrompt, prefill);

    // Allow extensions to stop generation before it happens
    const eventAbortController = new AbortController();
    const abortHook = () => {
        abortController.abort(new Error('Cancelled by stop event'));
        eventAbortController.abort(new Error('Cancelled by extension'));
    };
    eventSource.on(event_types.GENERATION_STOPPED, abortHook);

    try {
        if (responseLengthCustomized) {
            TempResponseLength.save(api, responseLength);
        }
        /** @type {object|any[]} */
        let generateData = {};

        // Allow extensions to modify the prompt before generation
        // 1. for text completion
        if (typeof prompt === 'string') {
            const eventData = { prompt: prompt, dryRun: false };
            await eventSource.emit(event_types.GENERATE_AFTER_COMBINE_PROMPTS, eventData);
            prompt = eventData.prompt;
        }
        // 2. for chat completion
        if (Array.isArray(prompt)) {
            const eventData = { chat: prompt, dryRun: false };
            await eventSource.emit(event_types.CHAT_COMPLETION_PROMPT_READY, eventData);
            prompt = eventData.chat;
        }

        // Check if the generation was aborted during the event
        eventAbortController.signal.throwIfAborted();

        switch (api) {
            case 'openai': {
                generateData = prompt;  // generateData is just the chat message object
                eventHook = TempResponseLength.setupEventHook(api);
            } break;
        }

        const data = await sendOpenAIRequest('quiet', generateData, abortController.signal, { jsonSchema });

        // should only happen for text completions
        // other frontend paths do not return data if calling the backend fails,
        // they throw things instead
        if (data.error) {
            throw new Error(data.response);
        }

        if (jsonSchema) {
            return extractJsonFromData(data, { mainApi: api, returnInvalidJson: jsonSchema.returnInvalid });
        }

        return data;
    } finally {
        eventSource.removeListener(event_types.GENERATION_STOPPED, abortHook);
        if (responseLengthCustomized && TempResponseLength.isCustomized()) {
            TempResponseLength.restore(api);
            TempResponseLength.removeEventHook(api, eventHook);
        }
    }
}

/**
 * Generates a message using the provided prompt.
 * If the prompt is an array of chat-style messages and not using chat completion, it will be converted to a text prompt.
 * @param {GenerateRawParams} params Parameters for generating a message
 * @returns {Promise<string>} Generated output: a cleaned-up message string when `jsonSchema` is not provided, or an extracted JSON string conforming to `jsonSchema` when it is.
 */
export async function generateRaw({ prompt = '', api = null, instructOverride = false, quietToLoud = false, systemPrompt = '', responseLength = null, trimNames = true, prefill = '', jsonSchema = null } = {}) {
    if (arguments.length > 0 && typeof arguments[0] !== 'object') {
        console.trace('generateRaw called with positional arguments. Please use an object instead.');
        [prompt, api, instructOverride, quietToLoud, systemPrompt, responseLength, trimNames, prefill, jsonSchema] = arguments;
    }

    const data = await generateRawData({ prompt, api, instructOverride, quietToLoud, systemPrompt, responseLength, prefill, jsonSchema });

    // JSON string (matching the provided schema) will already be extracted.
    if (jsonSchema) {
        return data;
    }

    // format result, exclude user prompt bias
    const message = cleanUpMessage({
        getMessage: extractMessageFromData(data, api),
        isImpersonate: false,
        isContinue: false,
        displayIncompleteSentences: true,
        includeUserPromptBias: false,
        trimNames: trimNames,
        trimWrongNames: trimNames,
    });

    if (!message) {
        throw new Error('No message generated');
    }

    return message;
}

class TempResponseLength {
    static #originalResponseLength = -1;
    static #lastApi = null;

    static isCustomized() {
        return this.#originalResponseLength > -1;
    }

    /**
     * Save the current response length for the specified API.
     * @param {string} api API identifier
     * @param {number} responseLength New response length
     */
    static save(api, responseLength) {
        if (api === 'openai') {
            this.#originalResponseLength = oai_settings.openai_max_tokens;
            oai_settings.openai_max_tokens = responseLength;
        } else {
            this.#originalResponseLength = amount_gen;
            amount_gen = responseLength;
        }

        this.#lastApi = api;
        console.log('[TempResponseLength] Saved original response length:', TempResponseLength.#originalResponseLength);
    }

    /**
     * Restore the original response length for the specified API.
     * @param {string|null} api API identifier
     * @returns {void}
     */
    static restore(api) {
        if (this.#originalResponseLength === -1) {
            return;
        }
        if (!api && this.#lastApi) {
            api = this.#lastApi;
        }
        if (api === 'openai') {
            oai_settings.openai_max_tokens = this.#originalResponseLength;
        } else {
            amount_gen = this.#originalResponseLength;
        }

        console.log('[TempResponseLength] Restored original response length:', this.#originalResponseLength);
        this.#originalResponseLength = -1;
        this.#lastApi = null;
    }

    /**
     * Sets up an event hook to restore the original response length when the event is emitted.
     * @param {string} api API identifier
     * @returns {function(): void} Event hook function
     */
    static setupEventHook(api) {
        const eventHook = () => {
            if (this.isCustomized()) {
                this.restore(api);
            }
        };

        switch (api) {
            case 'openai':
                eventSource.once(event_types.CHAT_COMPLETION_SETTINGS_READY, eventHook);
                break;
            default:
                eventSource.once(event_types.GENERATE_AFTER_DATA, eventHook);
                break;
        }

        return eventHook;
    }

    /**
     * Removes the event hook for the specified API.
     * @param {string} api API identifier
     * @param {function(): void} eventHook Previously set up event hook
     */
    static removeEventHook(api, eventHook) {
        switch (api) {
            case 'openai':
                eventSource.removeListener(event_types.CHAT_COMPLETION_SETTINGS_READY, eventHook);
                break;
            default:
                eventSource.removeListener(event_types.GENERATE_AFTER_DATA, eventHook);
                break;
        }
    }
}

/**
 * Removes last message from the chat DOM.
 * @returns {Promise<void>} Resolves when the message is removed.
 */
function removeLastMessage() {
    return new Promise((resolve) => {
        const lastMes = chatElement.children('.mes').last();
        if (lastMes.length === 0) {
            return resolve();
        }
        lastMes.hide(animation_duration, function () {
            $(this).remove();
            resolve();
        });
    });
}

/**
 * @typedef {object} JsonSchema
 * @property {string} name Name of the schema.
 * @property {object} value JSON schema value.
 * @property {string} [description] Description of the schema.
 * @property {boolean} [strict] If true, the schema will be used in strict mode, meaning that only the fields defined in the schema will be allowed.
 * @property {boolean} [returnInvalid] If true, a string that can't be parsed as a JSON will be returned as is, instead of an empty object.
 *
 * @typedef {object} GenerateOptions
 * @property {boolean} [automatic_trigger] If the generation was triggered automatically.
 * @property {boolean} [force_name2] If a char name should be forced to add to the prompt's last line (Text Completion, non-Instruct only).
 * @property {string} [quiet_prompt] A system instruction to use for the quiet prompt.
 * @property {boolean} [quietToLoud] Whether the system instruction should be sent in background (quiet) or a foreground (loud) mode.
 * @property {boolean} [skipWIAN] Skip adding World Info and Author's Note to the prompt.
 * @property {AbortSignal} [signal] Abort signal to cancel the generation. If not provided, will create a new AbortController.
 * @property {string} [quietImage] Image URL to use for the quiet prompt (defaults to empty string)
 * @property {string} [quietName] Name to use for the quiet prompt (defaults to "System:")
 * @property {number} [depth] Recursion depth for the generation. Used to prevent infinite loops in tool calls.
 * @property {JsonSchema} [jsonSchema] JSON schema to use for the structured generation. Usually requires a special instruction.
 */

/**
 * MARK:Generate()
 * Runs a generation using the current chat context.
 * @param {string} type Generation type
 * @param {GenerateOptions} options Generation options
 * @param {boolean} dryRun Whether to actually generate a message or just assemble the prompt
 * @returns {Promise<any>} Returns a promise that resolves when the text is done generating.
 */
export async function Generate(type, options = {}, dryRun = false) {
    const generationEnvelope = createGenerationRequestEnvelope({
        type,
        options,
        dryRun,
        mainApi: main_api,
    });
    return executeGenerationRequestInShell(generationEnvelope);
}

//MARK: Generate() ends

/**
 * Stops the generation and any streaming if it is currently running.
 */
export function stopGeneration() {
    let stopped = false;
    if (streamingProcessor) {
        rememberMainChatStreamingTransportProcessorTerminal(streamingProcessor, 'stopped');
        streamingProcessor.onStopStreaming();
        stopped = true;
    }
    if (abortController) {
        abortController.abort('Clicked stop button');
        hideStopButton();
        if (!stopped) {
            rememberMainChatStreamingTransportVisibleTerminal('stopped', {
                activeMessageId: null,
                observedTokenCount: 0,
                observedChunkCount: 0,
            });
        }
        stopped = true;
    }
    if (stopped) {
        void mountReactMainChatMessageListPanel();
    }
    eventSource.emit(event_types.GENERATION_STOPPED);
    return stopped;
}

/**
 * Injects extension prompts into chat messages.
 * @param {object[]} messages Array of chat messages
 * @param {boolean} isContinue Whether the generation is a continuation. If true, the extension prompts of depth 0 are injected at position 1.
 * @returns {Promise<number[]>} Array of indices where the extension prompts were injected
 */
async function doChatInject(messages, isContinue) {
    const injectedMessages = [];
    let totalInsertedMessages = 0;
    messages.reverse();

    const maxDepth = getExtensionPromptMaxDepth();
    for (let i = 0; i <= maxDepth; i++) {
        // Order of priority (most important go lower)
        const roles = [extension_prompt_roles.SYSTEM, extension_prompt_roles.USER, extension_prompt_roles.ASSISTANT];
        const names = {
            [extension_prompt_roles.SYSTEM]: '',
            [extension_prompt_roles.USER]: name1,
            [extension_prompt_roles.ASSISTANT]: name2,
        };
        const roleMessages = [];
        const separator = '\n';
        const wrap = false;

        for (const role of roles) {
            const extensionPrompt = String(await getExtensionPrompt(extension_prompt_types.IN_CHAT, i, separator, role, wrap)).trimStart();
            const isNarrator = role === extension_prompt_roles.SYSTEM;
            const isUser = role === extension_prompt_roles.USER;
            const name = names[role];

            if (extensionPrompt) {
                roleMessages.push({
                    name: name,
                    is_user: isUser,
                    mes: extensionPrompt,
                    extra: {
                        type: isNarrator ? system_message_types.NARRATOR : null,
                    },
                });
            }
        }

        if (roleMessages.length) {
            const depth = isContinue && i === 0 ? 1 : i;
            const injectIdx = Math.min(depth + totalInsertedMessages, messages.length);
            messages.splice(injectIdx, 0, ...roleMessages);
            totalInsertedMessages += roleMessages.length;
            injectedMessages.push(...roleMessages);
        }
    }

    const injectedIndices = injectedMessages.map(msg => messages.indexOf(msg));
    messages.reverse();
    return injectedIndices;
}

function flushWIInjections() {
    const depthPrefix = inject_ids.CUSTOM_WI_DEPTH;
    const outletPrefix = inject_ids.CUSTOM_WI_OUTLET('');

    for (const key of Object.keys(extension_prompts)) {
        if (key.startsWith(depthPrefix) || key.startsWith(outletPrefix)) {
            delete extension_prompts[key];
        }
    }
}

/**
 * Unblocks the UI after a generation is complete.
 * @param {string} [type] Generation type (optional)
 */
function unblockGeneration(type) {
    // Don't unblock if a parallel stream is still running
    if (type === 'quiet' && streamingProcessor && !streamingProcessor.isFinished) {
        return;
    }

    is_send_press = false;
    activateSendButtons();
    setGenerationProgress(0);
    flushEphemeralStoppingStrings();
    flushWIInjections();
}

export function getNextMessageId(type) {
    return type == 'swipe' ? chat.length - 1 : chat.length;
}

/**
 * Determines if the message should be auto-continued.
 * @param {string} messageChunk Current message chunk
 * @param {boolean} isImpersonate Is the user impersonation
 * @returns {boolean} Whether the message should be auto-continued
 */
export function shouldAutoContinue(messageChunk, isImpersonate) {
    if (!power_user.auto_continue.enabled) {
        console.debug('Auto-continue is disabled by user.');
        return false;
    }

    if (typeof messageChunk !== 'string') {
        console.debug('Not triggering auto-continue because message chunk is not a string');
        return false;
    }

    if (isImpersonate) {
        console.log('Continue for impersonation is not implemented yet');
        return false;
    }

    if (is_send_press) {
        console.debug('Auto-continue is disabled because a message is currently being sent.');
        return false;
    }

    if (abortController && abortController.signal.aborted) {
        console.debug('Auto-continue is not triggered because the generation was stopped.');
        return false;
    }

    if (power_user.auto_continue.target_length <= 0) {
        console.log('Auto-continue target length is 0, not triggering auto-continue');
        return false;
    }

    if (main_api === 'openai' && !power_user.auto_continue.allow_chat_completions) {
        console.log('Auto-continue for OpenAI is disabled by user.');
        return false;
    }

    const textareaText = String($('#send_textarea').val());
    const USABLE_LENGTH = 5;

    if (textareaText.length > 0) {
        console.log('Not triggering auto-continue because user input is not empty');
        return false;
    }

    if (messageChunk.trim().length > USABLE_LENGTH && chat.length) {
        const lastMessage = chat[chat.length - 1];
        const messageLength = getTokenCount(lastMessage.mes);
        const shouldAutoContinue = messageLength < power_user.auto_continue.target_length;

        if (shouldAutoContinue) {
            console.log(`Triggering auto-continue. Message tokens: ${messageLength}. Target tokens: ${power_user.auto_continue.target_length}. Message chunk: ${messageChunk}`);
            return true;
        } else {
            console.log(`Not triggering auto-continue. Message tokens: ${messageLength}. Target tokens: ${power_user.auto_continue.target_length}`);
            return false;
        }
    } else {
        console.log('Last generated chunk was empty, not triggering auto-continue');
        return false;
    }
}

/**
 * Triggers auto-continue if the message meets the criteria.
 * @param {string} messageChunk Current message chunk
 * @param {boolean} isImpersonate Is the user impersonation
 */
export function triggerAutoContinue(messageChunk, isImpersonate) {
    if (shouldAutoContinue(messageChunk, isImpersonate)) {
        $('#option_continue').trigger('click');
    }
}

export function getBiasStrings(textareaText, type) {
    if (type == 'impersonate' || type == 'continue') {
        return { messageBias: '', promptBias: '', isUserPromptBias: false };
    }

    let promptBias = '';
    let messageBias = extractMessageBias(textareaText);

    // If user input is not provided, retrieve the bias of the most recent relevant message
    if (!textareaText) {
        for (let i = chat.length - 1; i >= 0; i--) {
            const mes = chat[i];
            if (type === 'swipe' && chat.length - 1 === i) {
                continue;
            }
            if (mes && (mes.is_user || mes.is_system || mes.extra?.type === system_message_types.NARRATOR)) {
                if (mes.extra?.bias?.trim()?.length > 0) {
                    promptBias = mes.extra.bias;
                }
                break;
            }
        }
    }

    promptBias = messageBias || promptBias || power_user.user_prompt_bias || '';
    const isUserPromptBias = promptBias === power_user.user_prompt_bias;

    // Substitute params for everything
    messageBias = substituteParams(messageBias);
    promptBias = substituteParams(promptBias);

    return { messageBias, promptBias, isUserPromptBias };
}

/**
 * @param {Object} chatItem Message history item.
 */
function formatMessageHistoryItem(chatItem) {
    const isNarratorType = chatItem?.extra?.type === system_message_types.NARRATOR;
    const characterName = chatItem?.name ? chatItem.name : name2;
    const itemName = chatItem.is_user ? chatItem.name : characterName;
    const shouldPrependName = !isNarratorType;

    // If this symbol flag is set, completely ignore the message.
    // This can be used to hide messages without affecting the number of messages in the chat.
    if (chatItem.extra?.[IGNORE_SYMBOL]) {
        return '';
    }

    // Don't include a name if it's empty
    let textResult = chatItem?.name && shouldPrependName ? `${itemName}: ${chatItem.mes}\n` : `${chatItem.mes}\n`;

    return textResult;
}

/**
 * Removes all {{macros}} from a string.
 * @param {string} str String to remove macros from.
 * @returns {string} String with macros removed.
 */
export function removeMacros(str) {
    return (str ?? '').replace(/\{\{[\s\S]*?\}\}/gm, '').trim();
}

/**
 * Inserts a user message into the chat history.
 * @param {string} messageText Message text.
 * @param {string} messageBias Message bias.
 * @param {number} [insertAt] Optional index to insert the message at.
 * @param {boolean} [compact] Send as a compact display message.
 * @param {string} [name] Name of the user sending the message. Defaults to name1.
 * @param {string} [avatar] Avatar of the user sending the message. Defaults to user_avatar.
 * @returns {Promise<any>} A promise that resolves to the message when it is inserted.
 */
export async function sendMessageAsUser(messageText, messageBias, insertAt = null, compact = false, name = name1, avatar = user_avatar) {
    messageText = getRegexedString(messageText, regex_placement.USER_INPUT);

    const message = {
        name: name,
        is_user: true,
        is_system: false,
        send_date: getMessageTimeStamp(),
        mes: substituteParams(messageText),
        extra: {
            isSmallSys: compact,
        },
    };

    if (power_user.message_token_count_enabled) {
        message.extra.token_count = await getTokenCountAsync(message.mes, 0);
    }

    // Lock user avatar to a persona.
    if (avatar in power_user.personas) {
        message.force_avatar = getThumbnailUrl('persona', avatar);
    }

    if (messageBias) {
        message.extra.bias = messageBias;
        message.mes = removeMacros(message.mes);
    }

    await populateFileAttachment(message);

    chat_metadata.tainted = true;

    if (typeof insertAt === 'number' && insertAt >= 0 && insertAt <= chat.length) {
        chat.splice(insertAt, 0, message);
        await saveChatConditional();
        await eventSource.emit(event_types.MESSAGE_SENT, insertAt);
        await reloadCurrentChat();
        await eventSource.emit(event_types.USER_MESSAGE_RENDERED, insertAt);
    } else {
        chat.push(message);
        await saveChatConditional();
        const chat_id = (chat.length - 1);
        await eventSource.emit(event_types.MESSAGE_SENT, chat_id);
        addOneMessage(message);
        await eventSource.emit(event_types.USER_MESSAGE_RENDERED, chat_id);
    }

    return message;
}

/**
 * Gets the maximum context token limit (the full context window size before subtracting response length).
 * @returns {number} The maximum context token limit for the current API.
 */
export function getMaxContextTokens() {
    if (main_api == 'openai') {
        return oai_settings.openai_max_context;
    }
    return max_context;
}

/**
 * Gets the maximum response token limit (the max generation/reply length).
 * @returns {number} The maximum response token limit for the current API.
 */
export function getMaxResponseTokens() {
    if (main_api == 'openai') {
        return oai_settings.openai_max_tokens;
    }
    return amount_gen;
}

/**
 * Gets the maximum usable prompt size for the current API.
 * @param {number|null} overrideResponseLength Optional override for the response length.
 * @returns {number} Maximum usable prompt size.
 */
export function getMaxPromptTokens(overrideResponseLength = null) {
    if (typeof overrideResponseLength !== 'number' || overrideResponseLength <= 0 || isNaN(overrideResponseLength)) {
        overrideResponseLength = null;
    }

    return getMaxContextTokens() - (overrideResponseLength || getMaxResponseTokens());
}


function addChatsSeparator(mesSendString) {
    if (power_user.context.chat_start) {
        return substituteParams(power_user.context.chat_start + '\n') + mesSendString;
    } else {
        return mesSendString;
    }
}

/**
 * Duplicates a character.
 * @param {object} [options={}] - Options
 * @param {string} [options.avatar] - Avatar key of the character to duplicate. Uses current character if not provided.
 * @param {boolean} [options.silent=false] - Whether to skip the confirmation popup
 * @returns {Promise<string>} The avatar key of the duplicated character, or empty string if cancelled/failed
 */
export async function duplicateCharacter({ avatar = null, silent = false } = {}) {
    // Determine the character to duplicate
    let targetAvatar;
    if (avatar) {
        const character = characters.find(c => c.avatar === avatar);
        if (!character) {
            toastr.warning(t`Character not found: ${avatar}`);
            return '';
        }
        targetAvatar = avatar;
    } else {
        if (this_chid === undefined || !characters[this_chid]) {
            toastr.warning(t`You must first select a character to duplicate!`);
            return '';
        }
        targetAvatar = characters[this_chid].avatar;
    }

    // Show confirmation unless silent
    if (!silent) {
        const confirmMessage = $(await renderTemplateAsync('duplicateConfirm'));
        const confirm = await callGenericPopup(confirmMessage, POPUP_TYPE.CONFIRM);

        if (!confirm) {
            console.log('User cancelled duplication');
            return '';
        }
    }

    const body = { avatar_url: targetAvatar };
    const response = await fetch('/api/characters/duplicate', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        toastr.error(t`Failed to duplicate character`);
        return '';
    }

    toastr.success(t`Character Duplicated`);
    const data = await response.json();
    await eventSource.emit(event_types.CHARACTER_DUPLICATED, { oldAvatar: targetAvatar, newAvatar: data.path });
    await getCharacters();

    return data.path;
}

function setInContextMessages(msgInContextCount, type) {
    if (isReactMainChatOwner()) {
        if (type === 'swipe' || type === 'regenerate' || type === 'continue') {
            msgInContextCount++;
        }

        const lastMessageId = Math.max(0, chat.length - msgInContextCount);
        chat_metadata.lastInContextMessageId = lastMessageId;
        setMainChatMessageUiFlag('lastInContext', false);
        setMainChatMessageUiState(lastMessageId, { lastInContext: true });
        return;
    }

    chatElement.find('.mes').removeClass('lastInContext');

    if (type === 'swipe' || type === 'regenerate' || type === 'continue') {
        msgInContextCount++;
    }

    const lastMessageBlock = chatElement.find('.mes:not([is_system="true"]), .mes.toolCall').eq(-msgInContextCount);
    lastMessageBlock.addClass('lastInContext');

    if (lastMessageBlock.length === 0) {
        const firstMessageId = getFirstDisplayedMessageId();
        chatElement.find(`.mes[mesid="${firstMessageId}"]`).addClass('lastInContext');
    }

    // Update last id to chat. No metadata save on purpose, gets hopefully saved via another call
    const lastMessageId = Math.max(0, chat.length - msgInContextCount);
    chat_metadata.lastInContextMessageId = lastMessageId;
}

/**
 * @typedef {object} AdditionalRequestOptions
 * @property {JsonSchema} [jsonSchema]
 */

/**
 * Sends a non-streaming request to the API.
 * @param {string} type Generation type
 * @param {object} data Generation data
 * @param {AdditionalRequestOptions} [options] Additional options for the generation request
 * @returns {Promise<object>} Response data from the API
 * @throws {Error|object}
 */
export async function sendGenerationRequest(type, data, options = {}) {
    if (main_api === 'openai') {
        return await sendOpenAIRequest(type, data.prompt, abortController.signal, options);
    }

    throw new Error(`sendGenerationRequest: unsupported API: ${main_api}`);
}

/**
 * Sends a streaming request to the API.
 * @param {string} type Generation type
 * @param {object} data Generation data
 * @param {AdditionalRequestOptions} [options] Additional options for the generation request
 * @returns {Promise<any>} Streaming generator
 */
export async function sendStreamingRequest(type, data, options = {}) {
    if (abortController?.signal?.aborted) {
        throw new Error('Generation was aborted.');
    }

    switch (main_api) {
        case 'openai':
            return await sendOpenAIRequest(type, data.prompt, streamingProcessor.abortController.signal, options);
        default:
            throw new Error('Streaming is enabled, but the current API does not support streaming.');
    }
}

function extractTitleFromData(_data) {
    return undefined;
}

/**
 * Extracts the image from the response data.
 * @param {object} data Response data
 * @param {object} [options] Extraction options
 * @param {string} [options.mainApi] Main API to use
 * @param {string} [options.chatCompletionSource] Chat completion source
 * @returns {string[]} Extracted images or empty array
 */
function extractImagesFromData(data, { mainApi = null, chatCompletionSource: _chatCompletionSource = null } = {}) {
    switch (mainApi ?? main_api) {
        case 'openai': {
            // Data-shape-driven: OpenAI-compatible endpoints may return Gemini-style
            // responseContent parts with inline media.
            const inlineData = data?.responseContent?.parts?.filter(x => x.inlineData && !x.thought)?.map(x => x.inlineData);
            if (Array.isArray(inlineData) && inlineData.length > 0) {
                return inlineData.map(x => `data:${x.mimeType};base64,${x.data}`).filter(isDataURL);
            }
        } break;
    }

    return [];
}

/**
 * Extracts the message from the response data.
 * @param {object} data Response data
 * @param {string} activeApi If it's set, ignores active API
 * @returns {string} Extracted message
 */
export function extractMessageFromData(data, activeApi = null) {
    function getResult() {
        if (typeof data === 'string') {
            return data;
        }

        switch (activeApi ?? main_api) {
            case 'openai':
                return data?.content?.filter(p => p.type === 'text')?.map(p => p.text)?.join('\n\n') ?? data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? data?.text ?? data?.message?.content?.[0]?.text ?? data?.message?.tool_plan ?? '';
            default:
                return '';
        }
    }

    const result = getResult();
    return Array.isArray(result) ? result.map(x => x.text).filter(x => x).join('') : result;
}

/**
 * Extracts JSON from the response data.
 * @param {object} data Response data
 * @param {object} [options] Extraction options
 * @param {string} [options.mainApi] Main API to use
 * @param {string} [options.chatCompletionSource] Chat completion source
 * @param {boolean} [options.returnInvalidJson=false] Whether to return the raw JSON string even if it fails to parse
 * @returns {string} Extracted JSON string from the response data
 */
export function extractJsonFromData(data, { mainApi = null, chatCompletionSource = null, returnInvalidJson = false } = {}) {
    mainApi = mainApi ?? main_api;
    chatCompletionSource = chatCompletionSource ?? oai_settings.chat_completion_source;

    const tryParse = (/** @type {string} */ value) => {
        try {
            return JSON.parse(value);
        } catch (e) {
            console.debug('Failed to parse content as JSON.', e);
        }
    };

    let result = {};

    switch (mainApi) {
        case 'openai': {
            const text = extractMessageFromData(data, mainApi);
            switch (chatCompletionSource) {
                case chat_completion_sources.PERPLEXITY:
                    result = tryParse(removeReasoningFromString(text));
                    if (!result && returnInvalidJson) {
                        return text;
                    }
                    break;
                case chat_completion_sources.DEEPSEEK:
                case chat_completion_sources.AI21:
                case chat_completion_sources.GROQ:
                case chat_completion_sources.POLLINATIONS:
                case chat_completion_sources.AIMLAPI:
                case chat_completion_sources.OPENAI:
                case chat_completion_sources.MISTRALAI:
                case chat_completion_sources.CUSTOM:
                case chat_completion_sources.COHERE:
                case chat_completion_sources.XAI:
                case chat_completion_sources.ELECTRONHUB:
                case chat_completion_sources.CHUTES:
                case chat_completion_sources.AZURE_OPENAI:
                case chat_completion_sources.ZAI:
                default:
                    result = tryParse(text);
                    if (!result && returnInvalidJson) {
                        return text;
                    }
                    break;
            }
        } break;
    }

    return JSON.stringify(result ?? {});
}

/**
 * Extracts multiswipe swipes from the response data.
 * @param {Object} data Response data
 * @param {string} type Type of generation
 * @returns {string[]} Array of extra swipes
 */
function extractMultiSwipes(data, type) {
    const swipes = [];

    if (!data) {
        return swipes;
    }

    if (type === 'continue' || type === 'impersonate' || type === 'quiet') {
        return swipes;
    }

    if (main_api === 'openai') {
        if (!Array.isArray(data.choices)) {
            return swipes;
        }

        const multiSwipeCount = data.choices.length - 1;

        if (multiSwipeCount <= 0) {
            return swipes;
        }

        for (let i = 1; i < data.choices.length; i++) {
            const text = data?.choices[i]?.message?.content ?? data?.choices[i]?.text ?? '';
            swipes.push(text);
        }
    }

    const cleanedSwipes = swipes.map(text => cleanUpMessage({
        getMessage: text,
        isImpersonate: false,
        isContinue: false,
        displayIncompleteSentences: false,
    }));

    return cleanedSwipes;
}


/**
 * Saves the image to the message object.
 * @param {ParsedImage} img Image object
 * @param {ChatMessage} mes Chat message object
 * @typedef {{ image?: string, title?: string, inline?: boolean }} ParsedImage
 */
function saveImageToMessage(img, mes) {
    if (mes && img.image) {
        if (!mes.extra || typeof mes.extra !== 'object') {
            mes.extra = {};
        }
        if (!Array.isArray(mes.extra.media)) {
            mes.extra.media = [];
        }
        mes.extra.media.push({ url: img.image, type: MEDIA_TYPE.IMAGE, title: img.title, source: MEDIA_SOURCE.API });
        mes.extra.inline_image = img.inline;
    }
}

export function getGeneratingApi() {
    switch (main_api) {
        case 'openai':
            return oai_settings.chat_completion_source || 'openai';
        default:
            return main_api;
    }
}

export function getGeneratingModel(_mes) {
    let model = '';
    switch (main_api) {
        case 'openai':
            model = getChatCompletionModel();
            break;
    }
    return model;
}

/**
 * A function mainly used to switch 'generating' state - setting it to false and activating the buttons again
 */
export function activateSendButtons() {
    is_send_press = false;
    applyGenerationControlState(getStreamingControlState({ isFinished: true }));
    showSwipeButtons();
}

/**
 * A function mainly used to switch 'generating' state - setting it to true and deactivating the buttons
 */
export function deactivateSendButtons() {
    applyGenerationControlState(getStreamingControlState({ isGenerating: true, hasStreamingProcessor: Boolean(streamingProcessor) }));
    hideSwipeButtons();
}

function applyGenerationControlState(controlState) {
    if (controlState.stopVisible) {
        if (document.body.dataset.generating !== 'true') {
            resetMainChatStreamingTransportTerminalSnapshot();
        }
        showStopButton();
    } else {
        hideStopButton();
    }

    if (controlState.state === 'streaming') {
        document.body.dataset.generating = 'true';
    } else {
        delete document.body.dataset.generating;
    }

    void mountReactMainChatMessageListPanel();
}

export function resetChatState() {
    resetChatStateWithOptions();
}

function resetChatStateWithOptions({ clearCharacters = true } = {}) {
    name2 = applyResetChatState({
        currentCharacterId: this_chid,
        neutralCharacterName,
        systemUserName,
        chat,
        safetyChat: SAFETY_CHAT,
        characters,
        setCharacterId,
        clearCharacters,
    });

    chat_metadata = {};
}

/** @param {'characters' | 'character_edit' | 'create'} value */
export function setMenuType(value) {
    menu_type = value;
    // Allow custom CSS to see which menu type is active
    document.getElementById('right-nav-panel').dataset.menuType = menu_type;
}

export function setExternalAbortController(controller) {
    abortController = controller;
}

/**
 * Sets a character array index.
 * @param {number|string|undefined} value
 */
export function setCharacterId(value) {
    switch (typeof value) {
        case 'bigint':
        case 'number':
            this_chid = String(value);
            break;
        case 'string':
            this_chid = !isNaN(parseInt(value)) ? value : undefined;
            break;
        case 'object':
            this_chid = characters.indexOf(value) !== -1 ? String(characters.indexOf(value)) : undefined;
            break;
        case 'undefined':
            this_chid = undefined;
            break;
        default:
            console.error('Invalid character ID type:', value);
            break;
    }
}

export function setCharacterName(value) {
    name2 = value;
    syncTemporaryChatStatus();
}

function setTemporaryChatStatus(isTemporary) {
    const status = $('#temporary_chat_status');
    status.prop('hidden', !isTemporary);
    status.attr('aria-hidden', String(!isTemporary));
}

function syncTemporaryChatStatus() {
    setTemporaryChatStatus(this_chid === undefined && name2 === neutralCharacterName);
}

/**
 * Sets the API connection status of the application
 * @param {string|'no_connection'} value Connection status value
 */
export function setOnlineStatus(value) {
    const previousStatus = online_status;
    online_status = value;
    displayOnlineStatus();
    void mountReactMainChatMessageListPanel();
    if (previousStatus !== online_status) {
        eventSource.emitAndWait(event_types.ONLINE_STATUS_CHANGED, online_status);
    }
}

export function setEditedMessageId(value) {
    this_edit_mes_id = value;
}

export function setSendButtonState(value) {
    is_send_press = value;
}


/**
 * Processes the avatar image from the input element, allowing the user to crop it if necessary.
 * @param {HTMLInputElement} input - The input element containing the avatar file.
 * @returns {Promise<void>}
 */
async function read_avatar_load(input) {
    if (input.files && input.files[0]) {
        if (selected_button == 'create') {
            create_save.avatar = input.files;
        }

        crop_data = undefined;
        const file = input.files[0];
        const fileData = await getBase64Async(file);

        if (!power_user.never_resize_avatars) {
            const dlg = new Popup('Set the crop position of the avatar image', POPUP_TYPE.CROP, '', { cropImage: fileData });
            const croppedImage = await dlg.show();

            if (!croppedImage) {
                return;
            }

            crop_data = dlg.cropData;
            $('#avatar_load_preview').attr('src', String(croppedImage));
        } else {
            $('#avatar_load_preview').attr('src', fileData);
        }

        if (menu_type == 'create') {
            return;
        }

        await createOrEditCharacter();

        const formData = new FormData(/** @type {HTMLFormElement} */($('#form_create').get(0)));
        const avatarKey = formData.get('avatar_url').toString();

        // Bust cache for the avatar thumbnail and character image
        const thumbnailUrl = getThumbnailUrl('avatar', avatarKey);
        await fetch(thumbnailUrl, { method: 'GET', cache: 'reload' });
        await fetch(`/characters/${avatarKey}`, { method: 'GET', cache: 'reload' });

        // Refresh all visible avatar images that use this thumbnail URL
        // This handles messages, character list, and any other place using the thumbnail
        const avatarImages = document.querySelectorAll(`img[src^="${thumbnailUrl}"]`);
        for (const img of avatarImages) {
            if (img instanceof HTMLImageElement) {
                const originalSrc = img.src;
                img.src = '';
                img.src = originalSrc;
            }
        }
        console.debug(`Refreshed ${avatarImages.length} avatar images for ${avatarKey}`);

        console.log('Avatar refreshed');
    }
}

/**
 * Gets the URL for a thumbnail of a specific type and file.
 * @param {import('../src/endpoints/thumbnails.js').ThumbnailType} type The type of the thumbnail to get
 * @param {string} file The file name or path for which to get the thumbnail URL
 * @param {boolean} [t=false] Whether to add a cache-busting timestamp to the URL
 * @returns {string} The URL for the thumbnail
 */
export function getThumbnailUrl(type, file, t = false) {
    return `/thumbnail?type=${type}&file=${encodeURIComponent(file)}${t ? `&t=${Date.now()}` : ''}`;
}

export function buildAvatarList(block, entities, { templateId = 'inline_avatar_template', empty = true, interactable = false, highlightFavs = true } = {}) {
    if (empty) {
        block.empty();
    }

    for (const entity of entities) {
        const id = entity.id;

        // Populate the template
        const avatarTemplate = $(`#${templateId} .avatar`).clone();

        let this_avatar = default_avatar;
        if (entity.item.avatar !== undefined && entity.item.avatar != 'none') {
            this_avatar = getThumbnailUrl('avatar', entity.item.avatar);
        }

        avatarTemplate.attr('data-type', entity.type);
        avatarTemplate.attr('data-chid', id);
        avatarTemplate.find('img').attr('src', this_avatar).attr('alt', entity.item.name);
        avatarTemplate.attr('title', `[Character] ${entity.item.name}\nFile: ${entity.item.avatar}`);
        if (highlightFavs) {
            avatarTemplate.toggleClass('is_fav', entity.item.fav || entity.item.fav == 'true');
            avatarTemplate.find('.ch_fav').val(entity.item.fav);
        }

        if (entity.type === 'persona') {
            avatarTemplate.attr({ 'data-pid': id, 'data-chid': null });
            avatarTemplate.find('img').attr('src', getThumbnailUrl('persona', entity.item.avatar));
            avatarTemplate.attr('title', `[Persona] ${entity.item.name}\nFile: ${entity.item.avatar}`);
        }

        if (interactable) {
            avatarTemplate.addClass(INTERACTABLE_CONTROL_CLASS);
            avatarTemplate.toggleClass('character_select', entity.type === 'character');
        }

        block.append(avatarTemplate);
    }
}

/**
 * Loads all the data of a shallow character.
 * @param {string|undefined} characterId Array index
 * @returns {Promise<void>} Promise that resolves when the character is unshallowed
 */
export async function unshallowCharacter(characterId) {
    if (characterId === undefined) {
        console.debug('Undefined character cannot be unshallowed');
        return;
    }

    /** @type {Character} */
    const character = characters[characterId];
    if (!character) {
        console.debug('Character not found:', characterId);
        return;
    }

    // Character is not shallow
    if (!character.shallow) {
        return;
    }

    const avatar = character.avatar;
    if (!avatar) {
        console.debug('Character has no avatar field:', characterId);
        return;
    }

    await getOneCharacter(avatar);
}

async function getChatResult() {
    name2 = characters[this_chid].name;
    let freshChat = false;
    if (chat.length === 0) {
        const message = getFirstMessage();
        if (message.mes) {
            chat.push(message);
            freshChat = true;
        }
        // Make sure the chat appears on the server
        await saveChatConditional();
    }
    await printMessages();
    select_selected_character(this_chid);

    await eventSource.emit(event_types.CHAT_CHANGED, (getCurrentChatId()));
    if (freshChat) await eventSource.emit(event_types.CHAT_CREATED);

    if (chat.length === 1) {
        const chat_id = (chat.length - 1);
        await eventSource.emit(event_types.MESSAGE_RECEIVED, chat_id, 'first_message');
        await eventSource.emit(event_types.CHARACTER_MESSAGE_RENDERED, chat_id, 'first_message');
    }
}

function getFirstMessage() {
    const firstMes = characters[this_chid]?.first_mes || '';
    const alternateGreetings = characters[this_chid]?.data?.alternate_greetings;

    const message = {
        name: name2,
        is_user: false,
        is_system: false,
        send_date: getMessageTimeStamp(),
        mes: getRegexedString(firstMes, regex_placement.AI_OUTPUT),
        extra: {},
    };

    if (Array.isArray(alternateGreetings) && alternateGreetings.length > 0) {
        const swipes = [message.mes, ...(alternateGreetings.map(greeting => getRegexedString(greeting, regex_placement.AI_OUTPUT)))];

        if (!message.mes) {
            swipes.shift();
            message.mes = swipes[0];
        }

        message.swipe_id = 0;
        message.swipes = swipes;
        message.swipe_info = swipes.map(_ => ({
            send_date: message.send_date,
            gen_started: void 0,
            gen_finished: void 0,
            extra: {},
        }));
    }

    return message;
}

////////// OPTIMZED MAIN API CHANGE FUNCTION ////////////

export function changeMainAPI(api = null) {
    const selectedVal = api ?? main_api ?? 'openai';
    const apiElements = {
        'openai': {
            apiStreaming: $('#NULL_SELECTOR'),
            apiSettings: $('#openai_settings'),
            apiConnector: $('#api_connection_form'),
            apiPresets: $('#openai_api-presets'),
            apiRanges: $('#range_block_openai'),
        },
    };
    //console.log('--- apiElements--- ');
    //console.log(apiElements);

    //first, disable everything so the old elements stop showing
    for (const apiName in apiElements) {
        const apiObj = apiElements[apiName];
        //do not hide items to then proceed to immediately show them.
        if (selectedVal === apiName) {
            continue;
        }
        apiObj.apiSettings.css('display', 'none');
        apiObj.apiConnector.css('display', 'none');
        apiObj.apiRanges.css('display', 'none');
        apiObj.apiPresets.css('display', 'none');
        apiObj.apiStreaming.css('display', 'none');
    }

    //then, find and enable the active item.
    //This is split out of the loop so that different apis can share settings divs
    let activeItem = apiElements[selectedVal];

    activeItem.apiStreaming.css('display', 'block');
    activeItem.apiSettings.css('display', 'block');
    activeItem.apiConnector.css('display', 'block');
    activeItem.apiRanges.css('display', 'block');
    activeItem.apiPresets.css('display', 'block');

    if (selectedVal === 'openai') {
        activeItem.apiPresets.css('display', 'flex');
    }

    main_api = selectedVal;
    setOnlineStatus('no_connection');
    validateDisabledSamplers();
    setupChatCompletionPromptManager(oai_settings);
    forceCharacterEditorTokenize();
}

export function setUserName(value, { toastPersonaNameChange = true } = {}) {
    name1 = value;
    if (name1 === undefined || name1 == '')
        name1 = default_user_name;
    console.log(`User name changed to ${name1}`);
    $('#your_name').text(name1);
    if (toastPersonaNameChange && power_user.persona_show_notifications && !isPersonaPanelOpen()) {
        toastr.success(t`Your messages will now be sent as ${name1}`, t`Persona Changed`);
    }
    saveSettingsDebounced();
}

async function doOnboarding(avatarId) {
    const userName = currentUser?.name
        ? String(currentUser.name).replace('\n', ' ')
        : null;

    if (userName) {
        setUserName(userName);
        power_user.personas[avatarId] = userName;
        power_user.persona_descriptions[avatarId] = {
            description: '',
            position: persona_description_positions.IN_PROMPT,
        };
        return;
    }

    const template = $('#onboarding_template .onboarding');
    let inputName = await callGenericPopup(template, POPUP_TYPE.INPUT, name1, { wider: true, cancelButton: false });

    if (inputName) {
        inputName = String(inputName).replace('\n', ' ');
        setUserName(inputName);
        power_user.personas[avatarId] = inputName;
        power_user.persona_descriptions[avatarId] = {
            description: '',
            position: persona_description_positions.IN_PROMPT,
        };
    }
}

function reloadLoop() {
    const MAX_RELOADS = 5;
    let reloads = Number(sessionStorage.getItem('reloads') || 0);
    if (reloads < MAX_RELOADS) {
        reloads++;
        sessionStorage.setItem('reloads', String(reloads));
        window.location.reload();
    }
}

//MARK: getSettings()
///////////////////////////////////////////
async function fetchStartupSettings() {
    const response = await fetch('/api/settings/get', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({}),
        cache: 'no-cache',
    });

    if (!response.ok) {
        reloadLoop();
        toastr.error(t`Settings could not be loaded after multiple attempts. Please try again later.`);
        throw new Error('Error getting settings');
    }

    return response.json();
}

let extensionsHostControlsDisabled = false;

function applyDeferredExtensionBootstrapState({ disableUi }) {
    extensionsHostControlsDisabled = Boolean(disableUi);
    document.dispatchEvent(new CustomEvent('emberdesk:extensions-host-state-change'));
}

async function applyStartupSettingsCore(data, initLoaderHandle = null) {
    const settingsPlan = resolveStartupSettingsPlan({ data });

    if (settingsPlan.hasSettings && settingsPlan.settings) {
        settings = settingsPlan.settings;
        if (Number.isFinite(Number(data?.settings_revision))) {
            settingsDocumentRevision = Number(data.settings_revision);
        }
        if (settings.username !== undefined && settings.username !== '') {
            name1 = settings.username;
            $('#your_name').text(name1);
        }

        accountStorage.init(settings?.accountStorage);
        await setUserControls(data.enable_accounts);
        setRequestCompressionConfig(data.request_compression);

        // Allow subscribers to mutate settings
        await eventSource.emit(event_types.SETTINGS_LOADED_BEFORE, settings);

        //Load AI model config settings
        amount_gen = settings.amount_gen;
        if (settings.max_context !== undefined)
            max_context = parseInt(settings.max_context);

        swipes = settings.swipes !== undefined ? !!settings.swipes : true;  // enable swipes by default
        $('#swipes-checkbox').prop('checked', swipes); /// swipecode
        refreshSwipeButtons();

        // OpenAI
        loadOpenAISettings(data, settings.oai_settings ?? settings);

        // Load power user settings
        await loadPowerUserSettings(settings, data);

        // Apply theme toggles from power user settings
        applyPowerUserSettings();

        // Load character tags
        loadTagsSettings(settings);

        // Load the active background without restoring the retired gallery.
        loadBackgroundSettings(settings);

        // Allow subscribers to mutate settings
        await eventSource.emit(event_types.SETTINGS_LOADED_AFTER, settings);

        // Set context size after loading power user (may override the max value)
        $('#max_context').val(max_context);
        $('#max_context_counter').val(max_context);

        $('#amount_gen').val(amount_gen);
        $('#amount_gen_counter').val(amount_gen);

        //Load which API we are using
        if (settings.main_api == undefined) {
            settings.main_api = 'openai';
        }

        if (['poe', 'kobold', 'koboldhorde', 'novel', 'textgenerationwebui'].includes(settings.main_api)) {
            settings.main_api = 'openai';
        }

        main_api = settings.main_api;
        changeMainAPI('openai');

        //Load User's Name and Avatar
        initUserAvatar(settings.user_avatar);
        setPersonaDescription();

        // Load the active character
        active_character = settings.active_character;

        setWorldInfoSettings(settings.world_info_settings ?? settings, data);

        selected_button = settings.selected_button;

        // TODO: Move me into bootstrapWorkspace when experimental toggle is removed
        // power_user.experimental_macro_engine
        initMacros();

        Object.assign(extension_settings, (settings.extension_settings ?? {}));
        applyDeferredExtensionBootstrapState({
            disableUi: settingsPlan.extensionPlan.disableUi,
        });

        firstRun = !!settings.firstRun;

        if (firstRun) {
            await initLoaderHandle?.hide();
            await doOnboarding(user_avatar);
            firstRun = false;
        }
    }

    configureDeferredStartupTasks();
    await validateDisabledSamplers();
    settingsReady = true;
    await eventSource.emit(event_types.SETTINGS_LOADED);

    return settingsPlan;
}

export async function getSettings(initLoaderHandle = null) {
    return measureStartupStage('getSettings', async () => {
        const data = await measureStartupStage('getSettings.fetch', () => fetchStartupSettings());
        return measureStartupStage('getSettings.applyCore', () => applyStartupSettingsCore(data, initLoaderHandle));
    });
}

//MARK: saveSettings()
export async function saveSettings(loopCounter = 0) {
    if (!settingsReady) {
        console.warn('Settings not ready, scheduling another save');
        saveSettingsDebounced();
        return;
    }

    const MAX_RETRIES = 3;
    if (TempResponseLength.isCustomized()) {
        if (loopCounter < MAX_RETRIES) {
            console.warn('Response length is currently being overridden, scheduling another save');
            saveSettingsDebounced(++loopCounter);
            return;
        }
        console.error('Response length is currently being overridden, but the save loop has reached the maximum number of retries');
        TempResponseLength.restore(null);
    }

    if (currentVersion === '0.0.0') {
        try {
            await deferredVersionTask.ensure();
        } catch (error) {
            console.warn('Saving settings before client version resolved.', error);
        }
    }

    const persistedCurrentVersion = resolvePersistedCurrentVersion({
        currentVersion,
        settingsVersion: settings?.currentVersion ?? null,
    });

    const payload = {
        firstRun: firstRun,
        accountStorage: accountStorage.getState(),
        currentVersion: persistedCurrentVersion ?? undefined,
        username: name1,
        active_character: active_character,
        user_avatar: user_avatar,
        amount_gen: amount_gen,
        max_context: max_context,
        main_api: main_api,
        world_info_settings: getWorldInfoSettings(),
        swipes: swipes,
        power_user: power_user,
        extension_settings: extension_settings,
        tags: tags,
        tag_map: tag_map,
        oai_settings: oai_settings,
        background: background_settings,
        ...(settingsDocumentRevision != null ? { settings_revision: settingsDocumentRevision } : {}),
    };

    try {
        const saveSettingsRequest = await compressRequest({
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify(payload),
            cache: 'no-cache',
        });
        const result = await fetch('/api/settings/save', saveSettingsRequest);

        if (!result.ok) {
            if (result.status === 409) {
                try {
                    const conflict = await result.json();
                    if (Number.isFinite(Number(conflict?.settings_revision))) {
                        settingsDocumentRevision = Number(conflict.settings_revision);
                    }
                } catch {
                    // ignore parse failures
                }
                toastr.warning(t`Settings were updated elsewhere. Reload to pick up the latest settings before saving again.`, t`Settings conflict`);
                throw new Error('Failed to save settings: revision conflict');
            }
            throw new Error(`Failed to save settings: ${result.statusText}`);
        }

        try {
            const saveResult = await result.json();
            if (Number.isFinite(Number(saveResult?.settings_revision))) {
                settingsDocumentRevision = Number(saveResult.settings_revision);
            }
        } catch {
            // older file-backed responses may not be JSON objects
        }

        // Do not persist the protocol field into the in-memory settings document.
        const documentPayload = { ...payload };
        delete documentPayload.settings_revision;
        settings = documentPayload;
        await eventSource.emit(event_types.SETTINGS_UPDATED);
    } catch (error) {
        console.error('Error saving settings:', error);
        toastr.error(t`Check the server connection and reload the page to prevent data loss.`, t`Settings could not be saved`);
    }
}

/**
 * Sets the generation parameters from a preset object.
 * @param {{ genamt?: number, max_length?: number }} preset Preset object
 */
export function setGenerationParamsFromPreset(preset) {
    if (preset.genamt !== undefined) {
        amount_gen = preset.genamt;
        $('#amount_gen').val(amount_gen);
        $('#amount_gen_counter').val(amount_gen);
    }

    if (preset.max_length !== undefined) {
        max_context = preset.max_length;
        $('#max_context').val(max_context);
        $('#max_context_counter').val(max_context);
    }
}

function applyMessageEditText(messageId, inputText) {
    const mes = chat[messageId];
    if (!mes) {
        return null;
    }

    let text = String(inputText ?? '');
    mes.extra ??= {};

    let regexPlacement;
    if (mes?.is_user) {
        regexPlacement = regex_placement.USER_INPUT;
    } else if (mes.extra?.type === 'narrator') {
        regexPlacement = regex_placement.SLASH_COMMAND;
    } else {
        regexPlacement = regex_placement.AI_OUTPUT;
    }

    // Ignore character override if sent as system
    text = getRegexedString(
        text,
        regexPlacement,
        {
            characterOverride: mes.extra?.type === 'narrator' ? undefined : mes.name,
            isEdit: true,
        },
    );


    if (power_user.trim_spaces) {
        text = text.trim();
    }

    const bias = substituteParams(extractMessageBias(text));
    text = substituteParams(text);
    if (bias) {
        text = removeMacros(text);
    }
    mes.mes = text;
    if (mes.swipe_id !== undefined) {
        ensureSwipes(mes);
        mes.swipes[mes.swipe_id] = text;
    }

    if (mes?.is_system || mes?.is_user || mes.extra?.type === system_message_types.NARRATOR) {
        mes.extra.bias = bias ?? null;
    } else {
        mes.extra.bias = null;
    }

    chat_metadata.tainted = true;

    return { text, mes, bias };
}

// Common code for message editor done and auto-save
function updateMessage(div) {
    const mesBlock = div.closest('.mes_block');
    const mesElement = div.closest('.mes');
    const messageId = Number(mesElement.attr('mesid'));
    const text = mesBlock.find('.edit_textarea').val()
        ?? mesBlock.find('.mes_text').text();
    const updated = applyMessageEditText(messageId, text);
    return { mesBlock, ...updated };
}

function openMessageDelete(fromSlashCommand) {
    closeMessageEditor();
    hideSwipeButtons();
    if (fromSlashCommand || !is_send_press) {
        $('#dialogue_del_mes').css('display', 'block');
        $('#send_form').css('display', 'none');
        $('.del_checkbox').each(function () {
            const checkbox = $(this);
            const row = checkbox.closest('.mes');
            checkbox.css('display', 'grid');
            row.find('.for_checkbox').first().css('display', 'none');
        });
    } else {
        console.debug(`
            ERR -- could not enter del mode
            this_chid: ${this_chid}
            is_send_press: ${is_send_press}`);
    }
    this_del_mes = -1;
    is_delete_mode = true;
}

function messageEditAuto(div) {
    const { mesBlock, text, mes, bias } = updateMessage(div);

    mesBlock.find('.mes_text').val('');
    mesBlock.find('.mes_text').val(messageFormatting(
        text,
        this_edit_mes_chname,
        mes.is_system,
        mes.is_user,
        this_edit_mes_id,
        {},
        false,
    ));
    mesBlock.find('.mes_bias').empty();
    mesBlock.find('.mes_bias').append(messageFormatting(bias, '', false, false, -1, {}, false));
    saveChatDebounced();
}

function startMainChatMessageEdit(messageId) {
    const normalizedMessageId = Number(messageId);
    const message = chat[normalizedMessageId];
    if (!Number.isInteger(normalizedMessageId) || normalizedMessageId < 0 || !message) {
        return false;
    }

    this_edit_mes_id = normalizedMessageId;
    this_edit_mes_chname = message.name || (message.is_user ? name1 : name2);
    setMainChatMessageUiState(normalizedMessageId, {
        editing: true,
        editText: trimSpaces(message.mes || ''),
    });
    return true;
}

function updateMainChatMessageEdit(messageId, text) {
    const normalizedMessageId = Number(messageId);
    if (!Number.isInteger(normalizedMessageId) || normalizedMessageId < 0 || !chat[normalizedMessageId]) {
        return false;
    }

    setMainChatMessageUiState(normalizedMessageId, {
        editing: true,
        editText: String(text ?? ''),
    });
    return true;
}

async function duplicateMainChatMessage(messageId) {
    const normalizedMessageId = Number(messageId);
    const sourceMessage = chat[normalizedMessageId];
    if (!Number.isInteger(normalizedMessageId) || normalizedMessageId < 0 || !sourceMessage) {
        return false;
    }

    const editState = mainChatMessageUiState.get(String(normalizedMessageId));
    const clone = structuredClone(sourceMessage);
    clone.send_date = Date.now();
    if (editState?.editing && typeof editState.editText === 'string') {
        clone.mes = editState.editText;
    }
    if (power_user.trim_spaces) {
        clone.mes = String(clone.mes ?? '').trim();
    }

    chat.splice(normalizedMessageId + 1, 0, clone);
    shiftMainChatMessageUiStateAfterSplice(normalizedMessageId + 1, 1);
    await saveChatConditional();
    void mountReactMainChatMessageListPanel();
    return true;
}

async function copyMainChatMessage(messageId) {
    const normalizedMessageId = Number(messageId);
    const sourceMessage = chat[normalizedMessageId];
    if (!Number.isInteger(normalizedMessageId) || normalizedMessageId < 0 || !sourceMessage) {
        return false;
    }

    await copyText(String(sourceMessage.mes ?? ''));
    toastr.info('Copied!', '', { timeOut: 2000 });
    return true;
}

async function commitMainChatMessageEdit(messageId) {
    const normalizedMessageId = Number(messageId);
    const editState = mainChatMessageUiState.get(String(normalizedMessageId));
    if (!editState?.editing) {
        return false;
    }

    const updated = applyMessageEditText(normalizedMessageId, editState.editText);
    if (!updated) {
        return false;
    }

    await eventSource.emit(event_types.MESSAGE_EDITED, normalizedMessageId);
    setMainChatMessageUiState(normalizedMessageId, {
        editing: false,
        editText: null,
    });
    if (this_edit_mes_id === normalizedMessageId) {
        this_edit_mes_id = undefined;
    }
    await eventSource.emit(event_types.MESSAGE_UPDATED, normalizedMessageId);
    await saveChatConditional();
    showSwipeButtons();
    void mountReactMainChatMessageListPanel();
    return true;
}

async function cancelMainChatMessageEdit(messageId) {
    const normalizedMessageId = Number(messageId);
    if (!Number.isInteger(normalizedMessageId) || normalizedMessageId < 0) {
        return false;
    }

    setMainChatMessageUiState(normalizedMessageId, {
        editing: false,
        editText: null,
    });
    if (this_edit_mes_id === normalizedMessageId) {
        this_edit_mes_id = undefined;
    }
    showSwipeButtons();
    void mountReactMainChatMessageListPanel();
    return true;
}

function setMainChatMessageReasoningOpen(messageId, open) {
    const normalizedMessageId = Number(messageId);
    const message = chat[normalizedMessageId];
    if (!Number.isInteger(normalizedMessageId) || normalizedMessageId < 0 || !message) {
        return false;
    }

    const hasReasoning = typeof message?.extra?.reasoning === 'string' && message.extra.reasoning !== '';
    const isEditing = mainChatMessageUiState.get(String(normalizedMessageId))?.reasoningEditing === true;
    if (!hasReasoning && !isEditing) {
        return false;
    }

    setMainChatMessageUiState(normalizedMessageId, { reasoningOpen: open === true });
    return true;
}

async function copyMainChatMessageReasoning(messageId) {
    const normalizedMessageId = Number(messageId);
    const message = chat[normalizedMessageId];
    const reasoning = typeof message?.extra?.reasoning === 'string' ? message.extra.reasoning : '';
    if (!Number.isInteger(normalizedMessageId) || normalizedMessageId < 0 || !reasoning) {
        return false;
    }

    await copyText(reasoning);
    toastr.info('Copied!', '', { timeOut: 2000 });
    return true;
}

function startMainChatMessageReasoningEdit(messageId) {
    const normalizedMessageId = Number(messageId);
    const message = chat[normalizedMessageId];
    if (!Number.isInteger(normalizedMessageId) || normalizedMessageId < 0 || !message) {
        return false;
    }

    setMainChatMessageUiState(normalizedMessageId, {
        reasoningOpen: true,
        reasoningEditing: true,
        reasoningEditText: typeof message?.extra?.reasoning === 'string' ? message.extra.reasoning : '',
    });
    return true;
}

function updateMainChatMessageReasoningEdit(messageId, text) {
    const normalizedMessageId = Number(messageId);
    const message = chat[normalizedMessageId];
    if (!Number.isInteger(normalizedMessageId) || normalizedMessageId < 0 || !message) {
        return false;
    }

    const reasoningEditText = String(text ?? '');
    setMainChatMessageUiState(normalizedMessageId, {
        reasoningOpen: true,
        reasoningEditing: true,
        reasoningEditText,
    });
    if (power_user.auto_save_msg_edits) {
        message.extra ??= {};
        message.extra.reasoning = getRegexedString(
            reasoningEditText,
            regex_placement.REASONING,
            { isEdit: true },
        );
        message.extra.reasoning_type = message.extra.reasoning_type ? 'edited' : 'manual';
        saveChatDebounced();
    }
    return true;
}

async function commitMainChatMessageReasoningEdit(messageId) {
    const normalizedMessageId = Number(messageId);
    const message = chat[normalizedMessageId];
    const uiState = mainChatMessageUiState.get(String(normalizedMessageId));
    if (!Number.isInteger(normalizedMessageId) || normalizedMessageId < 0 || !message || !uiState?.reasoningEditing) {
        return false;
    }

    const reasoning = getRegexedString(
        substituteParams(String(uiState.reasoningEditText ?? '')),
        regex_placement.REASONING,
        { isEdit: true },
    );
    setMainChatMessageUiState(normalizedMessageId, {
        reasoningOpen: reasoning !== '',
        reasoningEditing: false,
        reasoningEditText: null,
    });
    if (reasoning === String(message?.extra?.reasoning ?? '')) {
        return true;
    }

    message.extra ??= {};
    message.extra.reasoning = reasoning;
    message.extra.reasoning_type = message.extra.reasoning_type ? 'edited' : 'manual';
    await saveChatConditional();
    await eventSource.emit(event_types.MESSAGE_REASONING_EDITED, normalizedMessageId);
    if (mainChatMessageUiState.get(String(normalizedMessageId))?.editing) {
        await commitMainChatMessageEdit(normalizedMessageId);
        return true;
    }

    void mountReactMainChatMessageListPanel();
    return true;
}

async function cancelMainChatMessageReasoningEdit(messageId) {
    const normalizedMessageId = Number(messageId);
    if (!Number.isInteger(normalizedMessageId) || normalizedMessageId < 0) {
        return false;
    }

    const uiState = mainChatMessageUiState.get(String(normalizedMessageId));
    const hasReasoning = typeof chat[normalizedMessageId]?.extra?.reasoning === 'string'
        && chat[normalizedMessageId].extra.reasoning !== '';
    setMainChatMessageUiState(normalizedMessageId, {
        reasoningOpen: hasReasoning && uiState?.reasoningOpen === true,
        reasoningEditing: false,
        reasoningEditText: null,
    });
    if (uiState?.editing) {
        return cancelMainChatMessageEdit(normalizedMessageId);
    }

    void mountReactMainChatMessageListPanel();
    return true;
}

async function deleteMainChatMessageReasoning(messageId) {
    const normalizedMessageId = Number(messageId);
    const message = chat[normalizedMessageId];
    if (!Number.isInteger(normalizedMessageId) || normalizedMessageId < 0 || !message?.extra) {
        return false;
    }

    const confirmed = await Popup.show.confirm(
        'Remove Reasoning',
        'Are you sure you want to clear the reasoning?<br />Visible message contents will stay intact.',
    );
    if (!confirmed) {
        return false;
    }

    message.extra.reasoning = '';
    delete message.extra.reasoning_type;
    delete message.extra.reasoning_duration;
    setMainChatMessageUiState(normalizedMessageId, {
        reasoningOpen: false,
        reasoningEditing: false,
        reasoningEditText: null,
    });
    await saveChatConditional();
    await eventSource.emit(event_types.MESSAGE_REASONING_DELETED, normalizedMessageId);
    void mountReactMainChatMessageListPanel();
    return true;
}

function collapseAllMainChatMessageReasoning() {
    let changed = false;
    for (let messageId = 0; messageId < chat.length; messageId++) {
        const message = chat[messageId];
        if (typeof message?.extra?.reasoning !== 'string' || message.extra.reasoning === '') {
            continue;
        }
        setMainChatMessageUiState(messageId, { reasoningOpen: false });
        changed = true;
    }
    return changed;
}

/**
 * Create the message edit UI.
 * @param {number} editMessageId The ID of the message to edit
 */
export async function messageEdit(editMessageId) {
    const editMessage = chat[editMessageId];
    if (!editMessage) {
        console.warn(`Message with id ${editMessageId} not found in chat array.`);
        return;
    }

    if (isReactMainChatOwner()) {
        startMainChatMessageEdit(editMessageId);
        return;
    }

    const messageElement = chatElement.find(`.mes[mesid="${editMessageId}"]`);
    if (messageElement.length === 0) {
        console.warn(`Message element with id ${editMessageId} not found in DOM.`);
        return;
    }

    this_edit_mes_id = editMessageId;
    this_edit_mes_chname = editMessage.name || (editMessage.is_user ? name1 : name2);

    refreshSwipeButtons();

    const chatScrollPosition = chatElement.scrollTop();
    const messageBlock = messageElement.find('.mes_block');
    const messageText = messageBlock.find('.mes_text');

    messageText.empty();
    messageBlock.find('.mes_buttons').css('display', 'none');
    messageBlock.find('.mes_edit_buttons').css('display', 'inline-flex');

    // Also edit reasoning, if it exists
    const reasoningEdit = messageBlock.find('.mes_reasoning_edit:visible');
    if (reasoningEdit.length > 0) {
        reasoningEdit.trigger('click');
    }

    const editTextArea = document.createElement('textarea');
    editTextArea.id = 'curEditTextarea';
    editTextArea.className = 'edit_textarea mdHotkeys';
    editTextArea.dataset.macros = '';
    messageText.append(editTextArea);

    const text = trimSpaces(editMessage.mes || '');
    const $editTextArea = $(editTextArea);
    $editTextArea.val(text);

    const cssAutofit = CSS.supports('field-sizing', 'content');
    if (!cssAutofit) {
        $editTextArea.height(0);
        $editTextArea.height(editTextArea.scrollHeight);
    }

    $editTextArea.trigger('focus');

    // Sets the cursor at the end of the text
    editTextArea.setSelectionRange(text.length, text.length);

    if (Number(this_edit_mes_id) === chat.length - 1) {
        chatElement.scrollTop(chatScrollPosition);
    }

    updateEditArrowClasses();
    scheduleMainChatMessageListPanelRefresh();
}

/**
 * Close the open message editor.
 * This deletes the user's unsaved changes.
 * @param {number} [messageId=this_edit_mes_id]
 */
async function messageEditCancel(messageId = this_edit_mes_id) {
    if (isReactMainChatOwner()) {
        return cancelMainChatMessageEdit(messageId);
    }

    let text = chat[messageId].mes;
    let thisMesDiv;
    // If this is the button then select it's parent. Otherwise, select by messageId.
    if (this?.classList?.contains('mes_edit_cancel')) {
        thisMesDiv = $(this).closest('.mes');
    } else {
        thisMesDiv = chatElement.children('.mes').filter(`[mesid="${messageId}"]`);
    }

    const thisMesBlock = thisMesDiv.find('.mes_block');
    thisMesBlock.find('.mes_text').empty();
    thisMesDiv.find('.mes_edit_buttons').css('display', 'none');
    thisMesBlock.find('.mes_buttons').css('display', '');
    thisMesBlock.find('.mes_text')
        .append(messageFormatting(
            text,
            this_edit_mes_chname,
            chat[messageId].is_system,
            chat[messageId].is_user,
            messageId,
            {},
            false,
        ));
    appendMediaToMessage(chat[messageId], thisMesDiv);
    addCopyToCodeBlocks(thisMesDiv);

    const reasoningEditDone = thisMesBlock.find('.mes_reasoning_edit_cancel:visible');
    if (reasoningEditDone.length > 0) {
        reasoningEditDone.trigger('click');
    }

    await eventSource.emit(event_types.MESSAGE_UPDATED, messageId);
    if (messageId == this_edit_mes_id) {
        this_edit_mes_id = undefined;
    } else {
        console.warn(`The message editor was closed on message #${messageId} while #${this_edit_mes_id} is being edited.`);
    }

    showSwipeButtons();
    void mountReactMainChatMessageListPanel();
}

/**
 * Swaps chat[sourceId] with chat[targetId]. They must be adjacent.
 * @param {number} sourceId Index of the message to move
 * @param {number} targetId Index of the target message
 * @returns {Promise<boolean>} True if the messages were moved, false otherwise
 */
async function messageEditMove(sourceId, targetId) {
    if (is_send_press) {
        console.warn(`The message #${sourceId} was not moved to #${targetId} because a generation is in progress.`);
        return false;
    }

    if (Math.abs(sourceId - targetId) !== 1) {
        console.error(`Message #${sourceId} and #${targetId} are not adjacent.`);
        return false;
    }

    if (isReactMainChatOwner()) {
        if (!chat[sourceId] || !chat[targetId]) {
            console.error(`Message #${sourceId} or #${targetId} was not found.`);
            return false;
        }

        [chat[sourceId], chat[targetId]] = [chat[targetId], chat[sourceId]];

        if (this_edit_mes_id === sourceId) {
            this_edit_mes_id = targetId;
        }

        await saveChatConditional();
        void mountReactMainChatMessageListPanel();
        return true;
    }

    const targetMessageDiv = chatElement.find(`.mes[mesid="${targetId}"]`);
    const sourceMessageDiv = chatElement.find(`.mes[mesid="${sourceId}"]`);

    if (sourceMessageDiv.length === 0 || targetMessageDiv.length === 0) {
        console.error(`Message #${sourceId} or #${targetId} were not found.`);
        return false;
    }

    if (sourceId <= targetId) {
        sourceMessageDiv.insertAfter(targetMessageDiv);
    } else {
        sourceMessageDiv.insertBefore(targetMessageDiv);
    }

    //Swap Ids.
    targetMessageDiv.attr('mesid', sourceId);
    sourceMessageDiv.attr('mesid', targetId);

    // Swap chat array entries.
    [chat[sourceId], chat[targetId]] = [chat[targetId], chat[sourceId]];

    // Update edited message id
    if (this_edit_mes_id === sourceId) {
        this_edit_mes_id = targetId;
    }

    updateViewMessageIds();
    refreshSwipeButtons();
    await saveChatConditional();
    return true;
}

async function messageEditDone(div) {
    if (isReactMainChatOwner()) {
        return commitMainChatMessageEdit(this_edit_mes_id);
    }

    if (!(this_edit_mes_id >= 0)) {
        console.trace('this_edit_mes_id cannot be blank when calling messageEditDone.');
        return;
    }

    let { mesBlock, text, mes, bias } = updateMessage(div);

    await eventSource.emit(event_types.MESSAGE_EDITED, this_edit_mes_id);
    text = chat[this_edit_mes_id]?.mes ?? text;
    mesBlock.find('.mes_text').empty();
    mesBlock.find('.mes_edit_buttons').css('display', 'none');
    mesBlock.find('.mes_buttons').css('display', '');
    mesBlock.find('.mes_text').append(
        messageFormatting(
            text,
            this_edit_mes_chname,
            mes.is_system,
            mes.is_user,
            this_edit_mes_id,
            {},
            false,
        ),
    );
    mesBlock.find('.mes_bias').empty();
    mesBlock.find('.mes_bias').append(messageFormatting(bias, '', false, false, -1, {}, false));
    appendMediaToMessage(mes, div.closest('.mes'));
    addCopyToCodeBlocks(div.closest('.mes'));

    const reasoningEditDone = mesBlock.find('.mes_reasoning_edit_done:visible');
    if (reasoningEditDone.length > 0) {
        reasoningEditDone.trigger('click');
    }

    await eventSource.emit(event_types.MESSAGE_UPDATED, this_edit_mes_id);
    this_edit_mes_id = undefined;
    await saveChatConditional();
    showSwipeButtons();
    void mountReactMainChatMessageListPanel();
}

/**
 * Fetches the contents of character chat files.
 *
 * The group argument remains for extension compatibility, but retired group
 * callers must not issue requests to the retired endpoint.
 */
export async function getChatsFromFiles(data, isGroupChat) {
    if (isGroupChat) {
        return {};
    }

    const context = getContext();
    const chatDict = {};
    const chatList = Object.values(data).sort((a, b) => a.file_name.localeCompare(b.file_name)).reverse();
    await Promise.all(chatList.map(async ({ file_name }) => {
        try {
            const chatResponse = await fetch('/api/chats/get', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({
                    ch_name: characters[context.characterId].name,
                    file_name: file_name.replace('.jsonl', ''),
                    avatar_url: characters[context.characterId].avatar,
                }),
                cache: 'no-cache',
            });
            if (!chatResponse.ok) {
                return;
            }
            const currentChat = await chatResponse.json();
            currentChat.shift();
            chatDict[file_name] = currentChat;
        } catch (error) {
            console.error(error);
        }
    }));
    return chatDict;
}


/**
 * Helper for `displayPastChats`, to make the same info consistently available for other functions
 */
export function getCurrentChatDetails() {
    if (!characters[this_chid]) {
        return { sessionName: '', group: null, characterName: '', avatarImgURL: '' };
    }

    return {
        sessionName: characters[this_chid].chat,
        group: null,
        characterName: characters[this_chid].name,
        avatarImgURL: getThumbnailUrl('avatar', characters[this_chid].avatar),
    };
}

export async function displayPastChats(hightlightNames = []) {
    // React owns #select_chat_div contents; re-render replaces rows, no manual empty().
    $('#select_chat_search').val('').off('input');

    const chatDetails = getCurrentChatDetails();
    const currentChat = chatDetails.sessionName;
    const displayName = chatDetails.characterName;
    const avatarImg = chatDetails.avatarImgURL;
    await displayChats('', currentChat, displayName, avatarImg, hightlightNames);

    const debouncedDisplay = debounce((searchQuery) => {
        displayChats(searchQuery, currentChat, displayName, avatarImg, []);
    });

    // Define the search input listener
    $('#select_chat_search').off('input').on('input', function () {
        const searchQuery = $(this).val();
        debouncedDisplay(searchQuery);
    });

    // UX convenience: Focus the search field when the Manage Chat Files view opens.
    setTimeout(function () {
        const textSearchElement = $('#select_chat_search');
        textSearchElement.trigger('click').trigger('focus').trigger('select');
    }, 200);

    addChatBackupsBrowser();
}

export function selectRightMenuWithAnimation(selectedMenuId) {
    const displayModes = {
        'rm_api_block': 'grid',
        'rm_characters_block': 'flex',
    };
    const reactAuthoringOwnsPanel = selectedMenuId === 'rm_ch_create_block'
        && Boolean(getWorkspaceReactFeatures()?.reactPanels?.characterAuthoring);
    $('#result_info').toggle(selectedMenuId === 'rm_ch_create_block' && !reactAuthoringOwnsPanel);
    $('#rm_button_selected_ch h2').toggle(!reactAuthoringOwnsPanel);
    document.querySelectorAll('#right-nav-panel .right_menu').forEach((menu) => {
        $(menu).css('display', 'none');

        if (selectedMenuId && selectedMenuId.replace('#', '') === menu.id) {
            const mode = displayModes[menu.id] ?? 'block';
            $(menu).css('display', mode);
            $(menu).css('opacity', 0.0);
            $(menu).transition({
                opacity: 1.0,
                duration: animation_duration,
                easing: animation_easing,
                complete: function () { },
            });
        }
    });
}

export function select_rm_info(type, charId, previousCharId = null) {
    if (!type) {
        toastr.error(t`Invalid process (no 'type')`);
        return;
    }
    const displayName = String(charId).replace('.png', '');

    if (type === 'char_delete') {
        toastr.warning(t`Character Deleted: ${displayName}`);
    }
    if (type === 'char_create') {
        toastr.success(t`Character Created: ${displayName}`);
    }
    if (type === 'char_import') {
        toastr.success(t`Character Imported: ${displayName}`);
    }

    selectRightMenuWithAnimation('rm_characters_block');

    // Set a timeout so multiple flashes don't overlap
    clearTimeout(importFlashTimeout);
    importFlashTimeout = setTimeout(function () {
        if (type === 'char_import' || type === 'char_create' || type === 'char_import_no_toast') {
            // Find the page at which the character is located
            const avatarFileName = charId;
            const charData = getEntitiesList({ doFilter: true });
            const charIndex = charData.findIndex((x) => x?.item?.avatar?.startsWith(avatarFileName));

            if (charIndex === -1) {
                console.log(`Could not find character ${charId} in the list`);
                return;
            }

            try {
                const perPage = Number(accountStorage.getItem('Characters_PerPage')) || per_page_default;
                const page = Math.floor(charIndex / perPage) + 1;
                const selector = `#rm_print_characters_block [title*="${avatarFileName}"]`;
                // Rebuild the page entities via the React pager path and refresh the cached snapshot,
                // so the waitUntilCondition poll sees the row once rendering completes.
                currentCharacterListEntitySnapshot = createCharacterListEntitySnapshot(charData);
                void requestCharacterListPage(page);

                waitUntilCondition(() => document.querySelector(selector) !== null).then(() => {
                    const element = $(selector).parent();

                    if (element.length === 0) {
                        console.log(`Could not find element for character ${charId}`);
                        return;
                    }

                    const scrollOffset = element.offset().top - element.parent().offset().top;
                    element.parent().scrollTop(scrollOffset);
                    flashHighlight(element, 5000);
                });
            } catch (e) {
                console.error(e);
            }
        }
    }, 250);

    if (previousCharId) {
        const newId = characters.findIndex((x) => x.avatar == previousCharId);
        if (newId >= 0) {
            setCharacterId(newId);
        }
    }
}


/**
 * Selects the right menu for creating a new character.
 * @param {object} [options] Options for the switch
 * @param {boolean} [options.switchMenu=true] Whether to switch the menu
 */
function select_rm_create({ switchMenu = true } = {}) {
    if (switchMenu) {
        setMenuType('create');
    }

    //console.log('select_rm_Create() -- selected button: '+selected_button);
    if (selected_button == 'create' && create_save.avatar) {
        const addAvatarInput = /** @type {HTMLInputElement} */ ($('#add_avatar_button').get(0));
        addAvatarInput.files = create_save.avatar;
        read_avatar_load(addAvatarInput);
    }

    if (switchMenu) {
        selectRightMenuWithAnimation('rm_ch_create_block');
    }

    $('#set_chat_character_settings').hide();
    $('#delete_button_div').css('display', 'none');
    $('#delete_button').css('display', 'none');
    $('#export_button').css('display', 'none');
    $('#world_button').css('display', 'none');
    $('#create_button_label').css('display', '');
    $('#create_button').attr('value', 'Create');
    $('#dupe_button').hide();
    $('#char_connections_button').hide();
    $('.character-detail-edit-action').hide();

    //create text poles
    $('#rm_button_back').css('display', '');
    $('#character_import_button').css('display', '');
    $('#character_popup-button-h3').text('Create character');
    $('#character_name_pole').val(create_save.name);
    $('#description_textarea').val(create_save.description);
    $('#character_world').val(create_save.world);
    $('#creator_notes_textarea').val(create_save.creator_notes);
    $('#creator_notes_spoiler').html(formatCreatorNotes(create_save.creator_notes, ''));
    $('#post_history_instructions_textarea').val(create_save.post_history_instructions);
    $('#system_prompt_textarea').val(create_save.system_prompt);
    $('#tags_textarea').val(create_save.tags);
    $('#creator_textarea').val(create_save.creator);
    $('#character_version_textarea').val(create_save.character_version);
    $('#personality_textarea').val(create_save.personality);
    $('#firstmessage_textarea').val(create_save.first_message);
    $('#scenario_pole').val(create_save.scenario);
    $('#depth_prompt_prompt').val(create_save.depth_prompt_prompt);
    $('#depth_prompt_depth').val(create_save.depth_prompt_depth);
    $('#depth_prompt_role').val(create_save.depth_prompt_role);
    $('#mes_example_textarea').val(create_save.mes_example);
    $('#character_json_data').val('');
    $('#avatar_div').css('display', 'flex');
    $('#avatar_load_preview').attr('src', default_avatar);
    $('#renameCharButton').css('display', 'none');
    $('#name_div').removeClass('displayNone');
    $('#name_div').addClass('displayBlock');
    $('.open_alternate_greetings').data('chid', -1);
    $('#set_character_world').data('chid', -1);
    setWorldInfoButtonClass(undefined, !!create_save.world);
    updateFavButtonState(false);
    checkEmbeddedWorld();

    $('#form_create').attr('actiontype', 'createcharacter');
    $('.form_create_bottom_buttons_block .chat_lorebook_button').hide();
    $('#character_open_media_overrides').hide();
}

function select_rm_characters() {
    const doFullRefresh = menu_type === 'characters';
    setMenuType('characters');
    selectRightMenuWithAnimation('rm_characters_block');
    printCharacters(doFullRefresh);
}

/**
 * Sets a prompt injection to insert custom text into any outgoing prompt. For use in UI extensions.
 * @param {string} key Prompt injection id.
 * @param {string} value Prompt injection value.
 * @param {number} position Insertion position. 0 is after story string, 1 is in-chat with custom depth.
 * @param {number} depth Insertion depth. 0 represets the last message in context. Expected values up to MAX_INJECTION_DEPTH.
 * @param {number} role Extension prompt role. Defaults to SYSTEM.
 * @param {boolean} scan Should the prompt be included in the world info scan.
 * @param {(function(): Promise<boolean>|boolean)} filter Filter function to determine if the prompt should be injected.
 */
export function setExtensionPrompt(key, value, position, depth, scan = false, role = extension_prompt_roles.SYSTEM, filter = null) {
    extension_prompts[key] = {
        value: String(value),
        position: Number(position),
        depth: Number(depth),
        scan: !!scan,
        role: Number(role ?? extension_prompt_roles.SYSTEM),
        filter: filter,
    };
}

/**
 * Gets a enum value of the extension prompt role by its name.
 * @param {string} roleName The name of the extension prompt role.
 * @returns {number} The role id of the extension prompt.
 */
export function getExtensionPromptRoleByName(roleName) {
    // If the role is already a valid number, return it
    if (typeof roleName === 'number' && Object.values(extension_prompt_roles).includes(roleName)) {
        return roleName;
    }

    switch (roleName) {
        case 'system':
            return extension_prompt_roles.SYSTEM;
        case 'user':
            return extension_prompt_roles.USER;
        case 'assistant':
            return extension_prompt_roles.ASSISTANT;
    }

    // Skill issue?
    return extension_prompt_roles.SYSTEM;
}

/**
 * Removes all char A/N prompt injections from the chat.
 * Clears character depth prompts before applying the current prompt.
 */
export function removeDepthPrompts() {
    for (const key of Object.keys(extension_prompts)) {
        if (key.startsWith(inject_ids.DEPTH_PROMPT)) {
            delete extension_prompts[key];
        }
    }
}

/**
 * Adds or updates the metadata for the currently active chat.
 * @param {Object} newValues An object with collection of new values to be added into the metadata.
 * @param {boolean} reset Should a metadata be reset by this call.
 */
export function updateChatMetadata(newValues, reset) {
    chat_metadata = reset ? { ...newValues } : { ...chat_metadata, ...newValues };
}


/**
 * Updates the state of the favorite button based on the provided state.
 * @param {boolean} state Whether the favorite button should be on or off.
 */
function updateFavButtonState(state) {
    // Update global state of the flag
    // TODO: This is bad and needs to be refactored.
    fav_ch_checked = state;
    $('#fav_checkbox').prop('checked', state);
    $('#favorite_button').toggleClass('fav_on', state);
    $('#favorite_button').toggleClass('fav_off', !state);
}

export async function setCharacterSettingsOverrides() {
    if (this_chid === undefined || !characters[this_chid]) {
        console.warn('setCharacterSettingsOverrides() -- no selected character');
        return;
    }

    const scenarioOverrideValue = chat_metadata.scenario || '';
    const exampleMessagesValue = chat_metadata.mes_example || '';
    const systemPromptValue = chat_metadata.system_prompt || '';
    const $template = $(await renderTemplateAsync('scenarioOverride'));
    const pendingChanges = {
        scenario: scenarioOverrideValue,
        examples: exampleMessagesValue,
        system_prompt: systemPromptValue,
    };

    // Keep edits local until the popup is closed/confirmed
    const $scenario = $template.find('.chat_scenario');
    $scenario.val(scenarioOverrideValue).on('input', function () {
        pendingChanges.scenario = String($(this).val());
    });
    const $examples = $template.find('.chat_examples');
    $examples.val(exampleMessagesValue).on('input', function () {
        pendingChanges.examples = String($(this).val());
    });
    const $systemPrompt = $template.find('.chat_system_prompt');
    $systemPrompt.val(systemPromptValue).on('input', function () {
        pendingChanges.system_prompt = String($(this).val());
    });

    $template.find('.remove_scenario_override').on('click', async function () {
        const confirm = await Popup.show.confirm(t`Are you sure you want to remove all overrides?`, t`This action cannot be undone.`);
        if (!confirm) {
            return;
        }

        $scenario.val('');
        pendingChanges.scenario = '';
        $examples.val('');
        pendingChanges.examples = '';
        $systemPrompt.val('');
        pendingChanges.system_prompt = '';
    });

    // Wait for popup close/confirm.
    await callGenericPopup($template, POPUP_TYPE.TEXT, '', {
        wide: true,
        large: true,
        allowVerticalScrolling: true,
    });

    chat_metadata.scenario = pendingChanges.scenario;
    chat_metadata.mes_example = pendingChanges.examples;
    chat_metadata.system_prompt = pendingChanges.system_prompt;
    await saveMetadata();
}

/**
 * Displays a blocking popup with a given text and type.
 * @param {JQuery<HTMLElement>|string|Element} text - Text to display in the popup.
 * @param {string} type
 * @param {string} inputValue - Value to set the input to.
 * @param {PopupOptions} options - Options for the popup.
 * @typedef {{okButton?: string, rows?: number, wide?: boolean, wider?: boolean, large?: boolean, allowHorizontalScrolling?: boolean, allowVerticalScrolling?: boolean, cropAspect?: number }} PopupOptions - Options for the popup.
 * @returns {Promise<any>} A promise that resolves when the popup is closed.
 * @deprecated Use `callGenericPopup` instead.
 */
export function callPopup(text, type, inputValue = '', { okButton, rows, wide, wider, large, allowHorizontalScrolling, allowVerticalScrolling, cropAspect: _cropAspect } = {}) {
    function getOkButtonText() {
        if (['text', 'char_not_selected'].includes(popup_type)) {
            $dialoguePopupCancel.css('display', 'none');
            return okButton ?? t`Ok`;
        } else if (['delete_extension'].includes(popup_type)) {
            return okButton ?? t`Ok`;
        } else if (['new_chat', 'confirm'].includes(popup_type)) {
            return okButton ?? t`Yes`;
        } else if (['input'].includes(popup_type)) {
            return okButton ?? t`Save`;
        }
        return okButton ?? t`Delete`;
    }

    dialogueCloseStop = true;
    if (type) {
        popup_type = type;
    }

    const $dialoguePopup = $('#dialogue_popup');
    const $dialoguePopupCancel = $('#dialogue_popup_cancel');
    const $dialoguePopupOk = $('#dialogue_popup_ok');
    const $dialoguePopupInput = $('#dialogue_popup_input');
    const $dialoguePopupText = $('#dialogue_popup_text');
    const $shadowPopup = $('#shadow_popup');

    $dialoguePopup.toggleClass('wide_dialogue_popup', !!wide)
        .toggleClass('wider_dialogue_popup', !!wider)
        .toggleClass('large_dialogue_popup', !!large)
        .toggleClass('horizontal_scrolling_dialogue_popup', !!allowHorizontalScrolling)
        .toggleClass('vertical_scrolling_dialogue_popup', !!allowVerticalScrolling);

    $dialoguePopupCancel.css('display', 'inline-block');
    // Write into the adapter label span so the React-rendered button keeps its
    // children; fall back to the whole button when the mount is absent.
    const $okLabel = $dialoguePopupOk.find('.dialogue-popup-btn-label').first();
    if ($okLabel.length) {
        $okLabel.text(getOkButtonText());
    } else {
        $dialoguePopupOk.text(getOkButtonText());
    }
    $dialoguePopupInput.toggle(popup_type === 'input').val(inputValue).attr('rows', rows ?? 1);
    $dialoguePopupText.empty().append(text);
    $shadowPopup.css('display', 'block');

    if (popup_type == 'input') {
        $dialoguePopupInput.trigger('focus');
    }

    $shadowPopup.transition({
        opacity: 1,
        duration: animation_duration,
        easing: animation_easing,
    });

    return new Promise((resolve) => {
        dialogueResolve = resolve;
    });
}


export async function saveMetadata() {
    return await saveChatConditional();
}

/**
 * Saves the chat to the server.
 * @param {FormData} formData Form data to send to the server.
 * @param {object} [options={}] Options for the import
 * @returns {Promise<string[]>} List of imported file names.
 */
export async function importCharacterChat(formData, { refresh = true } = {}) {
    const fetchResult = await fetch('/api/chats/import', {
        method: 'POST',
        body: formData,
        headers: getRequestHeaders({ omitContentType: true }),
        cache: 'no-cache',
    });

    if (fetchResult.ok) {
        const data = await fetchResult.json();
        if (data.res && refresh) {
            await displayPastChats();
        }
        return data?.fileNames || [];
    }

    return [];
}

export function updateViewMessageIds(startIndex = null) {
    const minId = startIndex ?? getFirstDisplayedMessageId();

    chatElement.find('.mes').each(function (index, element) {
        $(element).attr('mesid', minId + index);
        $(element).find('.mesIDDisplay').text(`#${minId + index}`);
    });

    chatElement.find('.mes').removeClass('last_mes');
    chatElement.find('.mes').last().addClass('last_mes');

    updateEditArrowClasses();
}

export function getFirstDisplayedMessageId() {
    const allIds = Array.from(document.querySelectorAll('#chat .mes')).map(el => Number(el.getAttribute('mesid'))).filter(x => !isNaN(x));
    const minId = Math.min(...allIds);
    return minId;
}

/**
 * Closes the message editor.
 * @param {'message'|'reasoning'|'all'} what What to close. Default is 'all'.
 */
export function closeMessageEditor(what = 'all') {
    if (what === 'message' || what === 'all') {
        if (this_edit_mes_id >= 0) {
            if (isReactMainChatOwner()) {
                void cancelMainChatMessageEdit(this_edit_mes_id);
            } else {
                chatElement.find(`.mes[mesid="${this_edit_mes_id}"] .mes_edit_cancel`).trigger('click');
            }
        }
    }
    if (what === 'reasoning' || what === 'all') {
        document.querySelectorAll('.reasoning_edit_textarea').forEach((el) => {
            const cancelButton = el.closest('.mes')?.querySelector('.mes_reasoning_edit_cancel');
            if (cancelButton instanceof HTMLElement) {
                cancelButton.click();
            }
        });
    }
}

export function setGenerationProgress(progress) {
    if (!progress) {
        $('#send_textarea').css({ 'background': '', 'transition': '' });
    } else {
        $('#send_textarea').css({
            'background': `linear-gradient(90deg, color-mix(in srgb, var(--success-green) 84%, transparent) ${progress}%, transparent ${progress}%)`,
            'transition': '0.25s ease-in-out',
        });
    }
}

export function cancelTtsPlay() {
    if ('speechSynthesis' in window) {
        speechSynthesis.cancel();
    }
}

function updateAlternateGreetingsHintVisibility(root) {
    const numberOfGreetings = root.find('.alternate_greetings_list .alternate_greeting').length;
    $(root).find('.alternate_grettings_hint').toggle(numberOfGreetings == 0);
}

async function openAlternateGreetings() {
    const chid = $('.open_alternate_greetings').data('chid');

    if (menu_type != 'create' && chid === undefined) {
        toastr.error('Does not have an Id for this character in editor menu.');
        return;
    } else if (menu_type !== 'create') {
        await unshallowCharacter(String(chid));
    } else {
        // If the character does not have alternate greetings, create an empty array
        if (characters[chid] && !Array.isArray(characters[chid].data.alternate_greetings)) {
            characters[chid].data.alternate_greetings = [];
        }
    }

    const template = $('#alternate_greetings_template .alternate_grettings').clone();
    const getArray = () => menu_type == 'create' ? create_save.alternate_greetings : characters[chid].data.alternate_greetings;
    const popup = new Popup(template, POPUP_TYPE.TEXT, '', {
        wide: true,
        large: true,
        allowVerticalScrolling: true,
        onClose: async () => {
            if (menu_type !== 'create') {
                await createOrEditCharacter();
            }
        },
    });

    for (let index = 0; index < getArray().length; index++) {
        addAlternateGreeting(template, getArray()[index], index, getArray, popup);
    }

    template.find('.add_alternate_greeting').on('click', function () {
        const array = getArray();
        const index = array.length;
        array.push('');
        addAlternateGreeting(template, '', index, getArray, popup);
        updateAlternateGreetingsHintVisibility(template);
        const list = template.find('.alternate_greetings_list');
        list.scrollTop(list.prop('scrollHeight'));
    });

    popup.show();
    updateAlternateGreetingsHintVisibility(template);
}

/**
 * Adds an alternate greeting to the template.
 * @param {JQuery<HTMLElement>} template
 * @param {string} greeting
 * @param {number} index
 * @param {() => any[]} getArray
 * @param {Popup} popup
 */
function addAlternateGreeting(template, greeting, index, getArray, popup) {
    const greetingBlock = $('#alternate_greeting_form_template .alternate_greeting').clone();
    greetingBlock.attr('data-index', index);
    greetingBlock.find('.alternate_greeting_text')
        .attr('id', `alternate_greeting_${index}`)
        .on('input', async function () {
            const value = $(this).val();
            const array = getArray();
            array[index] = value;
        }).val(greeting);
    greetingBlock.find('.editor_maximize').attr('data-for', `alternate_greeting_${index}`);
    greetingBlock.find('.greeting_index').text(index + 1);
    greetingBlock.find('.delete_alternate_greeting').on('click', async function (event) {
        event.preventDefault();
        event.stopPropagation();

        const confirm = await callGenericPopup(t`Are you sure you want to delete this alternate greeting?`, POPUP_TYPE.CONFIRM);
        if (!confirm) {
            return;
        }

        const array = getArray();
        array.splice(index, 1);

        // We need to reopen the popup to update the index numbers
        await popup.complete(POPUP_RESULT.AFFIRMATIVE);
        openAlternateGreetings();
    });
    greetingBlock.find('.move_up_alternate_greeting').on('click', function (event) {
        handleMoveAlternateGreeting(event, -1);
    });
    greetingBlock.find('.move_down_alternate_greeting').on('click', function (event) {
        handleMoveAlternateGreeting(event, 1);
    });

    /**
     * Handles moving an alternate greeting up or down in the list.
     * @param {JQuery.ClickEvent} event - The click event
     * @param {number} direction - Direction to move: -1 for up, 1 for down
     */
    function handleMoveAlternateGreeting(event, direction) {
        event.preventDefault();
        event.stopPropagation();

        const array = getArray();
        const index = Number(greetingBlock.attr('data-index'));
        const newIndex = index + direction;

        // Check bounds
        if (direction === -1 && index <= 0) {
            return;
        }
        if (direction === 1 && index >= array.length - 1) {
            return;
        }

        // Swap the greetings
        [array[index], array[newIndex]] = [array[newIndex], array[index]];

        // Update current greeting
        greetingBlock.find('.alternate_greeting_text').val(array[index]);

        // Update adjacent greeting
        const adjacentGreetingBlock = template.find(`.alternate_greeting[data-index="${newIndex}"]`);
        adjacentGreetingBlock.find('.alternate_greeting_text').val(array[newIndex]);
    }

    template.find('.alternate_greetings_list').append(greetingBlock);
}


/**
 * @deprecated Use `swipe` instead.
 * Handles the swipe to the left event.
 * @param {SwipeEvent} [event] Event.
 * @param {object} params Additional parameters.
 * @param {import('./scripts/constants.js').SWIPE_SOURCE} [params.source]  The source of the swipe event.
 * @param {boolean} [params.repeated] Is the swipe event repeated.
 * @param {object} [params.message] The chat message to swipe.
 */
export async function swipe_left(event, { source, repeated, message } = {}) {
    await swipe.call(this, event, SWIPE_DIRECTION.LEFT, { source: source, repeated: repeated, message: message });
}

/**
 * @deprecated Use `swipe` instead.
 * Handles the swipe to the right event.
 * @param {SwipeEvent} [event] Event.
 * @param {object} params Additional parameters.
 * @param {import('./scripts/constants.js').SWIPE_SOURCE} [params.source] The source of the swipe event.
 * @param {boolean} [params.repeated] Is the swipe event repeated.
 * @param {object} [params.message] The chat message to swipe.
 */
//MARK: swipe_right
export async function swipe_right(event = null, { source, repeated, message } = {}) {
    await swipe.call(this, event, SWIPE_DIRECTION.RIGHT, { source: source, repeated: repeated, message: message });
}

/**
 * Imports supported files dropped into the app window.
 * @param {File[]} files Array of files to process
 * @param {Map<File, string>} [data] Extra data to pass to the import function
 * @returns {Promise<void>}
 */
export async function processDroppedFiles(files, data = new Map()) {
    const allowedMimeTypes = [
        'application/json',
        'image/png',
        'application/yaml',
        'application/x-yaml',
        'text/yaml',
        'text/x-yaml',
    ];

    const allowedExtensions = [
        'charx',
        'byaf',
    ];

    const avatarFileNames = [];
    for (const file of files) {
        const extension = file.name.split('.').pop().toLowerCase();
        if (allowedMimeTypes.some(x => file.type.startsWith(x)) || allowedExtensions.includes(extension)) {
            const preservedName = data instanceof Map && data.get(file);
            const avatarFileName = await importCharacter(file, { preserveFileName: preservedName });
            if (avatarFileName !== undefined) {
                avatarFileNames.push(avatarFileName);
            }
        } else {
            toastr.warning(t`Unsupported file type: ` + file.name);
        }
    }

    if (avatarFileNames.length > 0) {
        await handleUnifiedImport(avatarFileNames);
        selectImportedChar(avatarFileNames[avatarFileNames.length - 1]);
    }
}

/**
 * Imports tags for the given characters
 * @param {string[]} avatarFileNames character avatar filenames whose tags are to import
 * @param {object} [options]
 * @param {import('./scripts/tags.js').tag_import_setting} [options.importSetting] Override tag import setting
 */
async function importCharactersTags(avatarFileNames, { importSetting = null } = {}) {
    await getCharacters();
    const effectiveSetting = importSetting ?? power_user.tag_import_setting;
    if (effectiveSetting === tag_import_setting.NONE) return;
    for (let i = 0; i < avatarFileNames.length; i++) {
        const importedCharacter = characters.find(character => character.avatar === avatarFileNames[i]);
        await importTags(importedCharacter, { importSetting: effectiveSetting });
    }
}

/**
 * Show unified import confirmation dialog and apply choices for imported characters.
 * @param {string[]} avatarFileNames character avatar filenames
 */
async function handleUnifiedImport(avatarFileNames) {
    await getCharacters();

    const scanResults = avatarFileNames.map(av => {
        const ch = characters.find(c => c.avatar === av);
        if (!ch) {
            console.warn(`[unified-import] Character not found after refresh: ${av}`);
            return null;
        }
        return scanImportedCharacter(ch);
    }).filter(Boolean);

    let tagImportSetting = null;
    if (scanResults.some(r => r.hasAnyContent)) {
        const importChoices = await showUnifiedImportConfirm(scanResults);
        const effectiveChoices = importChoices ?? buildSkipAllChoices();
        for (const result of scanResults) {
            const ch = characters.find(c => c.avatar === result.avatar);
            if (ch) {
                try {
                    await applyImportChoices(ch, effectiveChoices);
                } catch (e) {
                    console.error(`[unified-import] Failed to apply choices for ${result.avatar}`, e);
                }
            }
        }
        tagImportSetting = effectiveChoices.tagImportSetting;
    }
    await importCharactersTags(avatarFileNames, { importSetting: tagImportSetting });
}

/**
 * Selects the given imported char
 * @param {string} charId char to select
 */
function selectImportedChar(charId) {
    let oldSelectedChar = null;
    if (this_chid !== undefined) {
        oldSelectedChar = characters[this_chid].avatar;
    }
    select_rm_info('char_import_no_toast', charId, oldSelectedChar);
}

/**
 * Imports a character from a file.
 * @param {File} file File to import
 * @param {object} [options] - Options
 * @param {string} [options.preserveFileName] Whether to preserve original file name
 * @param {Boolean} [options.importTags=false] Whether to import tags
 * @returns {Promise<string>}
 */
async function importCharacter(file, { preserveFileName = '', importTags = false } = {}) {
    if (is_send_press) {
        toastr.error(t`Cannot import characters while generating. Stop the request and try again.`, t`Import aborted`);
        throw new Error('Cannot import character while generating');
    }

    const ext = file.name.match(/\.(\w+)$/);
    if (!ext || !(['json', 'png', 'yaml', 'yml', 'charx', 'byaf'].includes(ext[1].toLowerCase()))) {
        return;
    }

    const exists = preserveFileName ? characters.find(character => character.avatar === preserveFileName) : undefined;

    const format = ext[1].toLowerCase();
    $('#character_import_file_type').val(format);
    const formData = new FormData();
    formData.append('avatar', file);
    formData.append('file_type', format);
    formData.append('user_name', name1);
    if (preserveFileName) formData.append('preserved_name', preserveFileName);

    try {
        const result = await fetch('/api/characters/import', {
            method: 'POST',
            body: formData,
            headers: getRequestHeaders({ omitContentType: true }),
            cache: 'no-cache',
        });

        if (!result.ok) {
            throw new Error(`Failed to import character: ${result.statusText}`);
        }

        const data = await result.json();

        if (data.error) {
            throw new Error(`Server returned an error: ${data.error}`);
        }

        if (data.file_name !== undefined) {
            let avatarFileName = `${data.file_name}.png`;

            // Refresh existing thumbnail
            if (exists && this_chid !== undefined) {
                await fetch(getThumbnailUrl('avatar', avatarFileName), { cache: 'reload' });
            }

            $('#character_search_bar').val('').trigger('input');

            if (exists) {
                toastr.success(t`Character Replaced: ${String(data.file_name).replace('.png', '')}`);
            } else {
                toastr.success(t`Character Created: ${String(data.file_name).replace('.png', '')}`);
            }
            if (importTags) {
                await importCharactersTags([avatarFileName]);
                selectImportedChar(data.file_name);
            }
            return avatarFileName;
        }
    } catch (error) {
        console.error('Error importing character', error);
        toastr.error(t`The file is likely invalid or corrupted.`, t`Could not import character`);
    }
}

async function importFromURL(items, files) {
    for (const item of items) {
        if (item.type === 'text/uri-list') {
            const uriList = await new Promise((resolve) => {
                item.getAsString((uriList) => { resolve(uriList); });
            });
            const uris = uriList.split('\n').filter(uri => uri.trim() !== '');
            try {
                for (const uri of uris) {
                    const request = await fetch(uri);
                    const data = await request.blob();
                    const fileName = request.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || uri.split('/').pop() || 'file.png';
                    const file = new File([data], fileName, { type: data.type });
                    files.push(file);
                }
            } catch (error) {
                console.error('Failed to import from URL', error);
            }
        }
    }
}

export async function doNewChat({ deleteCurrentChat = false } = {}) {
    // Make a new chat for the selected character.
    if (this_chid === undefined || menu_type == 'create') {
        return;
    }

    //Fix it; New chat doesn't create while open create character menu
    await waitUntilCondition(() => !isChatSaving, debounce_timeout.extended, 10);
    await clearChat({ clearData: true });

    chat_file_for_del = getCurrentChatDetails()?.sessionName;

    // Make it easier to find in backups
    if (deleteCurrentChat) {
        await saveChatConditional();
    }

    chat_metadata = {};
    characters[this_chid].chat = `${name2} - ${humanizedDateTime()}`;
    $('#selected_chat_pole').val(characters[this_chid].chat);
    await getChat();
    await createOrEditCharacter(new CustomEvent('newChat'));
    if (deleteCurrentChat) await delChat(chat_file_for_del + '.jsonl');
}


/**
 * Renames the currently selected chat.
 * @param {string} oldFileName Old name of the chat (no JSONL extension)
 * @param {string} newName New name for the chat (no JSONL extension)
 */
export async function renameChat(oldFileName, newName) {
    return await renameCharacterChat({
        characterId: this_chid,
        oldFileName: oldFileName,
        newFileName: newName,
        loader: true,
    });
}

/**
 * Closes the current chat, clearing all associated data and resetting the UI.
 * If a message generation is in progress, it prompts the user to stop it first.
 * @returns {Promise<boolean>} True if the chat was successfully closed, false otherwise.
 */
export async function closeCurrentChat() {
    if (is_send_press == false) {
        await waitUntilCondition(() => !isChatSaving, debounce_timeout.extended, 10);
        await clearChat({ clearData: true });
        setCharacterId(undefined);
        setCharacterName('');
        setActiveCharacter(null);
        this_edit_mes_id = undefined;
        chat_metadata = {};
        selected_button = 'characters';
        $('#rm_button_selected_ch').children('h2').text('');
        select_rm_characters();
        await eventSource.emit(event_types.CHAT_CHANGED, getCurrentChatId());
        return true;
    } else {
        toastr.info(t`Please stop the message generation first.`);
        return false;
    }
}

/**
 * Forces the update of the chat name for a remote character.
 * @param {string|number} characterId Character ID to update chat name for
 * @param {string} newName New name for the chat
 * @returns {Promise<void>}
 */
export async function updateRemoteChatName(characterId, newName) {
    const character = characters[characterId];
    if (!character) {
        console.warn(`Character not found for ID: ${characterId}`);
        return;
    }
    character.chat = newName;
    const mergeRequest = {
        avatar: character.avatar,
        chat: newName,
    };
    const mergeResponse = await fetch('/api/characters/merge-attributes', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify(mergeRequest),
    });
    if (!mergeResponse.ok) {
        console.error('Failed to save extension field', mergeResponse.statusText);
    }
}


function doCharListDisplaySwitch() {
    power_user.charListGrid = !power_user.charListGrid;
    document.body.classList.toggle('charListGrid', power_user.charListGrid);
    updateCharListGridToggleLabel();
    saveSettingsDebounced();
    void syncReactCharacterLibraryToolbarState();
}

function updateCharListGridToggleLabel() {
    const toggle = $('#charListGridToggle');
    const label = toggle.find('.character-list-action-label');
    const key = power_user.charListGrid ? 'Character Toolbar List' : 'Character Toolbar Grid';
    const nextLabel = power_user.charListGrid ? translate('List', key) : translate('Grid', key);
    label.attr('data-i18n', key).text(nextLabel);
}

/**
 * Function to handle the deletion of a character, given a specific popup type and character ID.
 * If popup type equals "del_ch", it will proceed with deletion otherwise it will exit the function.
 * It fetches the delete character route, sending necessary parameters, and in case of success,
 * it proceeds to delete character from UI and saves settings.
 * In case of error during the fetch request, it logs the error details.
 *
 * @param {string} this_chid - The character ID to be deleted.
 * @param {boolean} delete_chats - Whether to delete chats or not.
 */
export async function handleDeleteCharacter(this_chid, delete_chats) {
    if (!characters[this_chid]) {
        return;
    }

    await deleteCharacter(characters[this_chid].avatar, { deleteChats: delete_chats });
}


function buildTemporaryChatDeleteWarningHtml() {
    return `
        <div class="delete-dialog-info">
            <span>${t`temporary chat — unsaved messages will be lost`}</span>
        </div>`;
}

function getCharacterDeleteDialogTitle(characterName) {
    const safeCharacterName = escapeHtml(characterName || t`this character`);
    return t`Delete character "${safeCharacterName}"?`;
}

/**
 * Function to delete a character from UI after character deletion API success.
 * It manages necessary UI changes such as closing advanced editing popup, unsetting
 * panel, removing deleted characters from the in-memory list, and reprinting the list.
 * It also ensures to save the settings after all the operations.
 */
async function removeCharacterFromUI(deletedAvatars = [], { deleteContext = null } = {}) {
    const refreshStartedAt = performance.now();
    const beforeDeleteSnapshot = createCharacterListEntitySnapshot(getEntitiesList({ doFilter: true }));
    deletedAvatars
        .filter(avatar => typeof avatar === 'string' && avatar.length > 0)
        .forEach(avatar => pendingDeletedCharacterAvatars.add(avatar));
    cancelDebounce(printCharactersDebounced);
    preserveNeutralChat();
    await clearChat();
    $('#character_cross').trigger('click');
    resetChatStateWithOptions({ clearCharacters: false });
    $(document.getElementById('rm_button_selected_ch')).children('h2').text('');
    restoreNeutralChat();
    removeCharactersFromState(characters, deletedAvatars);
    const reconcileStartedAt = performance.now();
    const reconciled = await reconcileCharacterListAfterDelete({
        beforeSnapshot: beforeDeleteSnapshot,
        deletedAvatars,
        deleteContext,
    });
    markPerfInteractionMetric('characterDeleteReconcileMs', performance.now() - reconcileStartedAt);
    if (!reconciled) {
        const printCharactersStartedAt = performance.now();
        await printCharacters(true, { allowDuringCharacterDelete: true });
        markPerfInteractionMetric('characterPrintMs', performance.now() - printCharactersStartedAt);
    }
    await printMessages();
    saveSettingsDebounced();
    await eventSource.emit(event_types.CHAT_CHANGED, getCurrentChatId());
    markPerfInteractionMetric('removeCharacterFromUIMs', performance.now() - refreshStartedAt);
}

/**
 * Creates a new assistant chat.
 * @param {object} params - Parameters for the new assistant chat
 * @param {boolean} [params.temporary=false] Deprecated: retained for caller compatibility; assistant chats are always temporary
 * @returns {Promise<void>} - A promise that resolves when the new assistant chat is created
 */
export async function newAssistantChat({ temporary: _temporary = false } = {}) {
    await clearChat();
    chat.splice(0, chat.length);
    chat_metadata = {};
    setCharacterName(neutralCharacterName);
    setTemporaryChatStatus(true);
    sendSystemMessage(system_message_types.ASSISTANT_NOTE);
}

/**
 * Event handler to open a navbar drawer when a drawer open button is clicked.
 * Handles click events on .drawer-opener elements.
 * Opens the drawer associated with the clicked button according to the data-target attribute.
 * @returns {void}
 */
function doDrawerOpenClick() {
    const targetDrawerID = $(this).attr('data-target');
    const drawer = document.getElementById(String(targetDrawerID ?? ''));
    const drawerContent = drawer?.querySelector(':scope > .drawer-content');
    if (!(drawerContent instanceof HTMLElement)
        || drawerContent.classList.contains('openDrawer')
        || drawer?.classList.contains('resizing')) {
        return;
    }
    openWorkspaceChildSlotHostImmediate(drawerContent.id);
}

/**
 * Event handler to open or close a navbar drawer when a navbar icon is clicked.
 * Handles click events on .drawer-toggle elements.
 * @returns {Promise<void>}
 */
export async function doNavbarIconClick() {
    const icon = $(this).find('.drawer-icon');
    const drawer = $(this).parent().find('.drawer-content');
    const drawerWasOpenAlready = $(this).parent().find('.drawer-content').hasClass('openDrawer');
    const targetDrawerID = $(this).parent().find('.drawer-content').attr('id');
    const isOpeningWorldInfoDrawer = targetDrawerID === 'WorldInfo' && !drawerWasOpenAlready;

    if (!drawerWasOpenAlready) {
        const $worldInfoBlockingDrawers = $('#right-nav-panel.openDrawer:not(.pinnedOpen)').not(drawer);
        const $worldInfoBlockingIcons = $('#rm_button_panel_pin_div .openIcon:not(.drawerPinnedOpen)');
        const $openDrawers = isOpeningWorldInfoDrawer
            ? $('.openDrawer').not(drawer).not($worldInfoBlockingDrawers).not('.pinnedOpen').add($worldInfoBlockingDrawers)
            : $('.openDrawer:not(.pinnedOpen)');
        const $openIcons = isOpeningWorldInfoDrawer
            ? $('.openIcon').not($worldInfoBlockingIcons).not('.drawerPinnedOpen').add($worldInfoBlockingIcons)
            : $('.openIcon:not(.drawerPinnedOpen)');
        for (const iconEl of $openIcons) {
            $(iconEl).toggleClass('closedIcon openIcon');
        }
        for (const el of $openDrawers) {
            $(el).toggleClass('closedDrawer openDrawer');
        }
        if ($openDrawers.length && animation_duration) {
            await delay(animation_duration);
        }
        icon.toggleClass('openIcon closedIcon');
        drawer.toggleClass('openDrawer closedDrawer');

        if (targetDrawerID === 'right-nav-panel') {
            favsToHotswap();
            $('#rm_print_characters_block').trigger('scroll');
        }

        // Set the height of "autoSetHeight" textareas within the drawer to their scroll height
        if (!CSS.supports('field-sizing', 'content')) {
            const textareas = $(this).closest('.drawer').find('.drawer-content textarea.autoSetHeight');
            for (const textarea of textareas) {
                await resetScrollHeight($(textarea));
            }
        }
    } else if (drawerWasOpenAlready) {
        icon.toggleClass('closedIcon openIcon');
        drawer.toggleClass('closedDrawer openDrawer');
    }
}

function addDebugFunctions() {
    const doBackfill = async () => {
        for (const message of chat) {
            // System messages are not counted
            if (message.is_system) {
                continue;
            }

            if (!message.extra) {
                message.extra = {};
            }

            const tokenCountText = (message?.extra?.reasoning || '') + message.mes;
            message.extra.token_count = await getTokenCountAsync(tokenCountText, 0);
        }

        await saveChatConditional();
        await reloadCurrentChat();
    };

    registerDebugFunction('forceOnboarding', 'Force onboarding', 'Forces the onboarding process to restart.', async () => {
        firstRun = true;
        await saveSettings();
        location.reload();
    });

    registerDebugFunction('backfillTokenCounts', 'Backfill token counters',
        `Recalculates token counts of all messages in the current chat to refresh the counters.
        Useful when you switch between models that have different tokenizers.
        This is a visual change only. Your chat will be reloaded.`, doBackfill);

    registerDebugFunction('generationTest', 'Send a generation request', 'Generates text using the currently selected API.', async () => {
        const text = prompt('Input text:', 'Hello');
        toastr.info('Working on it...');
        const message = await generateRaw({ prompt: text });
        alert(message);
    });
    registerDebugFunction('toggleEventTracing', 'Toggle event tracing', 'Useful to see what triggered a certain event.', () => {
        localStorage.setItem('eventTracing', localStorage.getItem('eventTracing') === 'true' ? 'false' : 'true');
        toastr.info('Event tracing is now ' + (localStorage.getItem('eventTracing') === 'true' ? 'enabled' : 'disabled'));
    });

    registerDebugFunction('toggleRegenerateWarning', 'Toggle Ctrl+Enter regeneration confirmation', 'Toggle the warning when regenerating a message with a Ctrl+Enter hotkey.', () => {
        accountStorage.setItem('RegenerateWithCtrlEnter', accountStorage.getItem('RegenerateWithCtrlEnter') === 'true' ? 'false' : 'true');
        toastr.info('Regenerate warning is now ' + (accountStorage.getItem('RegenerateWithCtrlEnter') === 'true' ? 'disabled' : 'enabled'));
    });

    registerDebugFunction('copySetup', 'Copy ST setup to clipboard [WIP]', 'Useful data when reporting bugs', async () => {
        const getContextContents = getContext();
        const getSettingsContents = settings;
        //console.log(getSettingsContents);
        const logMessage = `
\`\`\`
API: ${getSettingsContents.main_api}
API Type: ${getSettingsContents[getSettingsContents.main_api + '_settings'].type}
API server: ${getSettingsContents.api_server}
Model: ${getContextContents.onlineStatus}
API Settings: ${JSON.stringify(getSettingsContents[getSettingsContents.main_api + '_settings'], null, 2)}
\`\`\`
    `;

        //console.log(getSettingsContents)
        //console.log(logMessage);

        try {
            await copyText(logMessage);
            toastr.info('Your ST API setup data has been copied to the clipboard.');
        } catch (error) {
            toastr.error('Failed to copy ST Setup to clipboard:', error);
        }
    });
}

function initCharacterSearch() {
    const debouncedCharacterSearch = debounce((searchQuery) => {
        entitiesFilter.setFilterData(FILTER_TYPES.SEARCH, searchQuery);
        setCharacterSearchBusy(false);
    });

    const searchForm = $('#form_character_search_form');
    const searchInput = $('#character_search_bar');
    const searchButton = $('#rm_button_search');
    const searchStatus = $('#character_search_status');

    const storageKey = 'characterSearchFormVisible';

    function setCharacterSearchBusy(isBusy) {
        searchInput.attr('aria-busy', String(isBusy));
        searchStatus.prop('hidden', !isBusy);
    }

    searchInput.on('input', function () {
        const searchQuery = String($(this).val());
        updateCharacterLibraryToolbarOwnerState({ searchQuery });
        void syncReactCharacterLibraryToolbarState();
        setCharacterSearchBusy(true);
        debouncedCharacterSearch(searchQuery);
    });

    searchButton.on('click', function () {
        const newVisibility = !searchForm.is(':visible');
        searchForm.toggle(newVisibility);
        searchButton.toggleClass('active', newVisibility);
        accountStorage.setItem(storageKey, String(newVisibility));
        if (newVisibility) {
            searchInput.trigger('focus');
        }
    });

    eventSource.on(event_types.APP_READY, () => {
        const isVisible = accountStorage.getItem(storageKey) === 'true';
        searchForm.toggle(isVisible);
        searchButton.toggleClass('active', isVisible);
    });
}

async function measureCharacterSearchForPerf(query) {
    const listElement = document.querySelector('#rm_print_characters_block');
    if (!listElement) {
        throw new Error('Character list element is unavailable.');
    }

    const searchInputs = $('#character_search_bar');
    const visibleSearchInput = searchInputs.filter(':visible').first();
    const searchInput = visibleSearchInput.length ? visibleSearchInput : searchInputs.first();
    const searchStatus = $('#character_search_status');
    const normalizedQuery = String(query ?? '');
    const startedAt = performance.now();
    const pageLoadedPromise = new Promise(resolve => {
        let settled = false;
        const listener = () => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timer);
            eventSource.removeListener(event_types.CHARACTER_PAGE_LOADED, listener);
            resolve(performance.now());
        };
        const timer = setTimeout(() => {
            if (settled) {
                return;
            }
            settled = true;
            eventSource.removeListener(event_types.CHARACTER_PAGE_LOADED, listener);
            resolve(null);
        }, 5000);
        eventSource.on(event_types.CHARACTER_PAGE_LOADED, listener);
    });

    searchInput.val(normalizedQuery);
    searchInput.attr('aria-busy', 'true');
    searchStatus.prop('hidden', false);

    entitiesFilter.setFilterData(FILTER_TYPES.SEARCH, normalizedQuery, true);
    await printCharacters(false);
    const pageLoadedAt = await pageLoadedPromise;

    searchInput.attr('aria-busy', 'false');
    searchStatus.prop('hidden', true);
    const busyClearedAt = performance.now();

    return {
        browserMs: performance.now() - startedAt,
        path: null,
        serverTiming: null,
        payload: {
            query: normalizedQuery,
            renderedCharacterCount: listElement.querySelectorAll('.character_select').length,
            busyCleared: true,
            pageLoaded: pageLoadedAt !== null,
            metrics: {
                filterInputToBusyClearMs: busyClearedAt - startedAt,
                filterInputToPageLoadedMs: pageLoadedAt === null ? null : pageLoadedAt - startedAt,
            },
        },
    };
}

/**
 * Mounts the React-owned chat composer markup into #send_form.
 * Must complete before the DOM-ready binding block: send_but/send_textarea/
 * options_button handlers attach to the preserved element IDs.
 */
async function mountChatComposer() {
    const sendForm = document.getElementById('send_form');
    if (!sendForm) {
        console.warn('send_form container not found');
        return;
    }
    if (sendForm.dataset.reactComposerMounted === 'true') {
        return;
    }

    const host = document.createElement('div');
    host.id = 'emberdesk-react-composer-host';
    host.className = 'wide100p';
    sendForm.replaceChildren(host);

    try {
        const module = await loadWorkspacePanelsModule();
        module.mountChatComposer(host);
        sendForm.dataset.reactComposerMounted = 'true';
    } catch (error) {
        console.error('Failed to mount chat composer:', error);
    }
}

/**
 * Mounts the React-owned API Connections drawer markup into #rm_api_block.
 * Must complete before initOpenAI (registerCoreModules stage): api_button_openai,
 * model selects, and secret-field inputs are bound from the preserved IDs.
 */
async function mountApiConnectionsPanel() {
    const drawerContent = document.getElementById('rm_api_block');
    if (!drawerContent) {
        console.warn('API connections drawer not found');
        return;
    }
    if (drawerContent.dataset.reactApiPanelMounted === 'true') {
        return;
    }

    const host = document.createElement('div');
    host.id = 'emberdesk-react-api-connections-host';
    drawerContent.replaceChildren(host);

    try {
        const module = await loadWorkspacePanelsModule();
        module.mountApiConnectionsPanel(host);
        drawerContent.dataset.reactApiPanelMounted = 'true';
    } catch (error) {
        console.error('Failed to mount api connections panel:', error);
    }
}

/**
 * Mounts the React-owned AI Response Configuration markup into #left-nav-panel.
 * Must complete before initOpenAI (registerCoreModules stage) and getSettings:
 * preset controls, sampling fields, and prompt textareas are bound by ID.
 */
async function mountAiConfigPanel() {
    const drawerContent = document.getElementById('left-nav-panel');
    if (!drawerContent) {
        console.warn('AI config drawer not found');
        return;
    }
    if (drawerContent.dataset.reactAiConfigMounted === 'true') {
        return;
    }

    const host = document.createElement('div');
    host.id = 'emberdesk-react-ai-config-host';
    drawerContent.replaceChildren(host);

    try {
        const module = await loadWorkspacePanelsModule();
        module.mountAiConfigPanel(host);
        drawerContent.dataset.reactAiConfigMounted = 'true';
    } catch (error) {
        console.error('Failed to mount ai config panel:', error);
    }
}

/**
 * Mounts the React-owned Advanced Definitions markup into #character_popup.
 * The popup shell stays legacy (display/opacity transitions); inner markup must
 * exist before the ready-callback binds #character_cross/#character_popup_ok
 * and before openai.js reads the textarea fields.
 */
async function mountCharacterPopup() {
    const popup = document.getElementById('character_popup');
    if (!popup) {
        console.warn('Character popup not found');
        return;
    }
    if (popup.dataset.reactCharacterPopupMounted === 'true') {
        return;
    }

    const host = document.createElement('div');
    host.id = 'emberdesk-react-character-popup-host';
    popup.replaceChildren(host);

    try {
        const module = await loadWorkspacePanelsModule();
        module.mountCharacterPopup(host);
        popup.dataset.reactCharacterPopupMounted = 'true';
    } catch (error) {
        console.error('Failed to mount character popup:', error);
    }
}

/**
 * Mounts the React-owned right navigation markup into #right-nav-panel.
 * The <nav> shell stays legacy (drawer open/close). Inner markup must exist
 * before initRossMods (panel pin, rm_button_create, rm_ch_create_block
 * bindings), tags.js filter init, and the form_create submit binding.
 */
async function mountRightNavPanel() {
    const panel = document.getElementById('right-nav-panel');
    if (!panel) {
        console.warn('Right nav panel not found');
        return;
    }
    if (panel.dataset.reactRightNavMounted === 'true') {
        return;
    }

    const host = document.createElement('div');
    host.id = 'emberdesk-react-right-nav-host';
    panel.replaceChildren(host);

    try {
        const module = await loadWorkspacePanelsModule();
        module.mountRightNavPanel(host);
        panel.dataset.reactRightNavMounted = 'true';
    } catch (error) {
        console.error('Failed to mount right nav panel:', error);
    }
}

/**
 * Renders the React-owned chat rows inside #select_chat_div. Called by
 * displayChats (chat-ops-service) with projected row data; rows replicate the
 * #past_chat_template contract so delegated handlers keep working.
 * @param {{searchQuery: string, currentChat: string, avatarImg: string, items: object[]}} state
 * @returns {Promise<boolean>} Whether the list rendered
 */
async function renderSelectChatListReact(state) {
    const container = document.getElementById('select_chat_div');
    if (!(container instanceof HTMLElement)) {
        return false;
    }
    try {
        const module = await loadWorkspacePanelsModule();
        const bridge = getReactSelectChatListBridge();
        const mounted = module.mountSelectChatList(container, bridge, state);
        if (!mounted) {
            return false;
        }
        container.dataset.reactSelectChatListOwner = 'react';
        return true;
    } catch (error) {
        console.error('Failed to render React select-chat list:', error);
        return false;
    }
}

function getReactSelectChatListBridge() {
    return globalThis.__emberDeskSelectChatListBridge ??= {
        clearSearch() {
            $('#select_chat_search').val('').trigger('input').trigger('focus');
        },
    };
}

/**
 * Mounts the React-owned past-chats popup markup into #select_chat_popup.
 * #shadow_select_chat_popup stays the display-toggled shell; the inner header
 * buttons (chat_import_button/newChatFromManageScreenButton/select_chat_cross)
 * are bound by the ready callback after startup stages complete.
 */
async function mountSelectChatPopup() {
    const popup = document.getElementById('select_chat_popup');
    if (!popup) {
        console.warn('Select chat popup not found');
        return;
    }
    if (popup.dataset.reactSelectChatMounted === 'true') {
        return;
    }

    const host = document.createElement('div');
    host.id = 'emberdesk-react-select-chat-host';
    popup.replaceChildren(host);

    try {
        const module = await loadWorkspacePanelsModule();
        module.mountSelectChatPopup(host);
        popup.dataset.reactSelectChatMounted = 'true';
    } catch (error) {
        console.error('Failed to mount select chat popup:', error);
    }
}

/**
 * Mounts the React-owned character context menu items into
 * #character_context_menu. The shell's hidden class and positioning stay
 * legacy; item buttons must exist before bulk-edit's CharacterContextMenu
 * constructor binds them.
 */
async function mountCharacterContextMenu() {
    const menu = document.getElementById('character_context_menu');
    if (!menu) {
        console.warn('Character context menu not found');
        return;
    }
    if (menu.dataset.reactContextMenuMounted === 'true') {
        return;
    }

    const host = document.createElement('div');
    host.id = 'emberdesk-react-character-context-menu-host';
    menu.replaceChildren(host);

    try {
        const module = await loadWorkspacePanelsModule();
        module.mountCharacterContextMenu(host);
        menu.dataset.reactContextMenuMounted = 'true';
    } catch (error) {
        console.error('Failed to mount character context menu:', error);
    }
}

/**
 * Mounts the React-owned options popup items into #options. The shell keeps
 * display:none and Popper positioning (options_button -> options popper is
 * lazy-initialized). Item bindings happen in the ready callback below.
 */
async function mountOptionsMenu() {
    const popup = document.getElementById('options');
    if (!popup) {
        console.warn('Options popup not found');
        return;
    }
    if (popup.dataset.reactOptionsMenuMounted === 'true') {
        return;
    }

    const host = document.createElement('div');
    host.id = 'emberdesk-react-options-menu-host';
    popup.replaceChildren(host);

    try {
        const module = await loadWorkspacePanelsModule();
        optionsMenuModuleRef = module;
        module.mountOptionsMenu(host, { showBackToMain: Boolean(chat_metadata?.main_chat) });
        popup.dataset.reactOptionsMenuMounted = 'true';
    } catch (error) {
        console.error('Failed to mount options menu:', error);
    }
}

let optionsMenuModuleRef = null;

/**
 * Projects branch-chat visibility into the React options menu. Returns false
 * when the React menu is not mounted so callers can keep the jQuery fallback.
 * @param {boolean} show - Whether "Back to parent chat" should be visible
 */
export function setOptionsMenuBranchVisibility(show) {
    return Boolean(optionsMenuModuleRef?.updateOptionsMenuState?.({ showBackToMain: Boolean(show) }));
}

/**
 * Mounts the export-format popup buttons into #export_format_popup.
 * The shell stays the Popper target; clicks are document-delegated.
 */
async function mountExportFormatPopup() {
    const popup = document.getElementById('export_format_popup');
    if (!popup) {
        console.warn('Export format popup not found');
        return;
    }
    if (popup.dataset.reactExportFormatMounted === 'true') {
        return;
    }

    const host = document.createElement('div');
    host.id = 'emberdesk-react-export-format-host';
    popup.replaceChildren(host);

    try {
        const module = await loadWorkspacePanelsModule();
        module.mountExportFormatPopup(host);
        popup.dataset.reactExportFormatMounted = 'true';
    } catch (error) {
        console.error('Failed to mount export format popup:', error);
    }
}

/**
 * Mounts the confirm-popup buttons into #dialogue_popup_controls. The popup
 * shell stays legacy markup; dom-handlers.js binds the buttons by ID.
 */
async function mountDialoguePopupControls() {
    const controls = document.getElementById('dialogue_popup_controls');
    if (!controls) {
        console.warn('Dialogue popup controls not found');
        return;
    }
    if (controls.dataset.reactDialoguePopupMounted === 'true') {
        return;
    }

    const host = document.createElement('div');
    host.id = 'emberdesk-react-dialogue-popup-host';
    controls.replaceChildren(host);

    try {
        const module = await loadWorkspacePanelsModule();
        module.mountDialoguePopupControls(host);
        controls.dataset.reactDialoguePopupMounted = 'true';
    } catch (error) {
        console.error('Failed to mount dialogue popup controls:', error);
    }
}

/**
 * Mounts the delete-messages confirm buttons into #dialogue_del_mes. The
 * container stays legacy; dom-handlers.js binds the buttons by ID.
 */
async function mountDialogueDelMesControls() {
    const container = document.getElementById('dialogue_del_mes');
    if (!container) {
        console.warn('Dialogue delete-message controls not found');
        return;
    }
    if (container.dataset.reactDialogueDelMesMounted === 'true') {
        return;
    }

    const host = document.createElement('div');
    host.id = 'emberdesk-react-dialogue-del-mes-host';
    container.replaceChildren(host);

    try {
        const module = await loadWorkspacePanelsModule();
        module.mountDialogueDelMesControls(host);
        container.dataset.reactDialogueDelMesMounted = 'true';
    } catch (error) {
        console.error('Failed to mount dialogue delete-message controls:', error);
    }
}

/**
 * Mounts the onboarding action buttons into their host spans inside
 * #onboarding_template. The .onboarding markup is moved — not cloned — into
 * the onboarding popup on first run, carrying the mounted hosts along.
 */
async function mountOnboardingActions() {
    const hosts = document.querySelectorAll('#onboarding_template [data-onboarding-host]');
    if (!hosts.length) {
        return;
    }
    let module = null;
    for (const host of hosts) {
        if (host.dataset.reactOnboardingMounted === 'true') {
            continue;
        }
        if (!module) {
            try {
                module = await loadWorkspacePanelsModule();
            } catch (error) {
                console.error('Failed to load workspace panels module:', error);
                return;
            }
        }
        const which = host.dataset.onboardingHost;
        if (which !== 'import' && which !== 'library') {
            continue;
        }
        try {
            module.mountOnboardingAction(host, which);
            host.dataset.reactOnboardingMounted = 'true';
        } catch (error) {
            console.error(`Failed to mount onboarding action ${which}:`, error);
        }
    }
}

// MARK: DOM Handlers Start
jQuery(async function () {
    await bindLegacyShellHandlers();
});
