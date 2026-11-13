import { eventSource, event_types } from './events.js';
import { TOKEN_PADDING, inject_ids } from './constants.js';
import { executeGenerationAttempts, createGenerationCommandPlan, createGenerationRequestEnvelope } from './chat-generation-command-service.js';
import * as generationCommandService from './chat-generation-command-service.js';
import {
    getGenerationFailureDecision,

    hasFallbackProviderForGeneration,
} from './chat-generation-lifecycle.js';
import { getWorldInfoPrompt } from './world-info-service.js';
import { getGenerationLifecycleService, requireGenerationShellContext } from './generation-shell-context.js';
import { getComposerSnapshot, clearComposerValue } from './main-chat-composer-service.js';
import { applyChatMemoryToCoreChat } from './chat-memory-service.js';
import {
    endPipelineRun,
    getPipelineTriggerTag,
    getPreviewPipelineTriggerTag,
    getRunnablePipeline,
    getPipelineStepMeta,
    getCurrentPipelineStep,
    isPipelineFallbackRound,
    preparePipelineRound,
    previewPipelineRequestShaping,
    resolvePipelineModel,
    resolvePreviewPipelineModel,
} from './reply-pipeline.js';
import { getChatCompletionModelFromSettings, isChatCompletionStreaming } from './openai-provider-capabilities.js';
import { getFallbackOpenAIModel } from './chat-generation-auto-recovery.js';
import { t } from './i18n.js';
import { assertPipelineResponseAllowed, getActivePipelineRunId, getPipelineRunState } from './reply-pipeline-core.js';
import { derivePreviewBudget, isUserStoppedGenerationError } from './generation-shared-state.js';

export { derivePreviewBudget } from './generation-shared-state.js';

function shell() {
    return requireGenerationShellContext();
}

/**
 * Whether a generation exception is a deliberate user stop rather than a
 * failure worth rolling a regenerate snapshot back for.
 * @param {Error|object} exception Error or response JSON
 * @returns {boolean}
 */
export function isUserStoppedGeneration(exception) {
    return isUserStoppedGenerationError(exception, Boolean(shell().state.abortController?.signal?.aborted));
}


const addChatsSeparator = (...args) => shell().addChatsSeparator(...args);
const cleanUpMessage = (...args) => shell().cleanUpMessage(...args);
const clearGenerationAttemptMessage = (...args) => shell().clearGenerationAttemptMessage(...args);
const clearGenerationAutoRecoveryStatus = (...args) => shell().clearGenerationAutoRecoveryStatus(...args);
const deactivateSendButtons = (...args) => shell().deactivateSendButtons(...args);
const deleteLastMessage = (...args) => shell().deleteLastMessage(...args);
const doChatInject = (...args) => shell().doChatInject(...args);
const extractImagesFromData = (...args) => shell().extractImagesFromData(...args);
const extractJsonFromData = (...args) => shell().extractJsonFromData(...args);
const extractMessageFromData = (...args) => shell().extractMessageFromData(...args);
const extractTitleFromData = (...args) => shell().extractTitleFromData(...args);
const flushWIInjections = (...args) => shell().flushWIInjections(...args);
const formatMessageHistoryItem = (...args) => shell().formatMessageHistoryItem(...args);
const getBiasStrings = (...args) => shell().getBiasStrings(...args);
const getCharacterCardFields = (...args) => shell().getCharacterCardFields(...args);
const getExtensionPrompt = (...args) => shell().getExtensionPrompt(...args);
const getExtensionPromptRoleByName = (...args) => shell().getExtensionPromptRoleByName(...args);
const getGenerationLifecycleStatusLabels = (...args) => shell().getGenerationLifecycleStatusLabels(...args);
const getMaxPromptTokens = (...args) => shell().getMaxPromptTokens(...args);
const isAssistantRecoveryMessageId = (...args) => shell().isAssistantRecoveryMessageId(...args);
const isStreamingEnabled = (...args) => shell().isStreamingEnabled(...args);

const pingServer = (...args) => shell().pingServer(...args);
const processCommands = (...args) => shell().processCommands(...args);
const rememberMainChatStreamingTransportProcessorTerminal = (...args) => shell().rememberMainChatStreamingTransportProcessorTerminal(...args);
const removeDepthPrompts = (...args) => shell().removeDepthPrompts(...args);
const removeMacros = (...args) => shell().removeMacros(...args);
const removeRegenerateTurnTail = (...args) => shell().removeRegenerateTurnTail(...args);
const restoreRegenerateTurnTail = (...args) => shell().restoreRegenerateTurnTail(...args);
const replaceAssistantRecoveryMessage = (...args) => shell().replaceAssistantRecoveryMessage(...args);
const saveChatConditional = (...args) => shell().saveChatConditional(...args);
const saveReply = (...args) => shell().saveReply(...args);
const scheduleMainChatMessageListPanelRefresh = (...args) => shell().scheduleMainChatMessageListPanelRefresh(...args);
const sendGenerationRequest = (...args) => shell().sendGenerationRequest(...args);
const sendMessageAsUser = (...args) => shell().sendMessageAsUser(...args);
const sendStreamingRequest = (...args) => shell().sendStreamingRequest(...args);
const setExtensionPrompt = (...args) => shell().setExtensionPrompt(...args);
const setGenerationProgress = (...args) => shell().setGenerationProgress(...args);
const setInContextMessages = (...args) => shell().setInContextMessages(...args);
const showGenerationAutoRecoveryStatus = (...args) => shell().showGenerationAutoRecoveryStatus(...args);
const showGenerationFailureRecovery = (...args) => shell().showGenerationFailureRecovery(...args);
const showStopButton = (...args) => shell().showStopButton(...args);
const substituteParams = (...args) => shell().substituteParams(...args);
const unblockGeneration = (...args) => shell().unblockGeneration(...args);
const unshallowCharacter = (...args) => shell().unshallowCharacter(...args);
const Generate = (...args) => shell().Generate(...args);
const addCopyToCodeBlocks = (...args) => shell().addCopyToCodeBlocks(...args);
const appendMediaToMessage = (...args) => shell().appendMediaToMessage(...args);
const getStoppingStrings = (...args) => shell().getStoppingStrings(...args);
const isReactMainChatOwner = (...args) => shell().isReactMainChatOwner(...args);
const mountReactMainChatMessageListPanel = (...args) => shell().mountReactMainChatMessageListPanel(...args);
const processImageAttachment = (...args) => shell().processImageAttachment(...args);
const scrollChatToBottom = (...args) => shell().scrollChatToBottom(...args);
const appendFileContent = (...args) => shell().appendFileContent(...args);
const extractReasoningFromData = (...args) => shell().extractReasoningFromData(...args);
const extractReasoningSignatureFromData = (...args) => shell().extractReasoningSignatureFromData(...args);
const getRegexedString = (...args) => shell().getRegexedString(...args);
const getTokenCountAsync = (...args) => shell().getTokenCountAsync(...args);
const hasPendingFileAttachment = (...args) => shell().hasPendingFileAttachment(...args);
const STREAMING_FPS = 30;

const sendSystemMessage = (...args) => shell().sendSystemMessage(...args);
const buildUserMessage = (...args) => shell().buildUserMessage(...args);
const buildChatCompletionRequest = (...args) => shell().buildChatCompletionRequest(...args);
const prepareOpenAIMessages = (...args) => shell().prepareOpenAIMessages(...args);
const renderStoryString = (...args) => shell().renderStoryString(...args);
const setOpenAIMessages = (...args) => shell().setOpenAIMessages(...args);
const countOccurrences = (...args) => shell().countOccurrences(...args);
const isOdd = (...args) => shell().isOdd(...args);
const delay = (...args) => shell().delay(...args);

export class GenerationStreamSession {
    #streamState;
    /**
     * Creates a new streaming processor.
     * @param {string} type Generation type
     * @param {boolean} forceName2 If true, force the use of name2
     * @param {Date} timeStarted Date when generation was started
     * @param {PromptReasoning} promptReasoning Prompt reasoning instance
     */
    constructor(type, forceName2, timeStarted, promptReasoning, ownsRun = () => true) {
        this.#streamState = getGenerationLifecycleService().createStreamState(timeStarted);
        // Keep the existing session API while the installed typed lifecycle owns the mutable stream data.
        for (const key of Object.keys(this.#streamState)) {
            Object.defineProperty(this, key, {
                enumerable: true,
                configurable: true,
                get: () => this.#streamState[key],
                set: value => { this.#streamState[key] = value; },
            });
        }
        /** @type {HTMLElement} */
        this.messageDom = null;
        /** @type {HTMLElement} */
        this.messageTextDom = null;
        /** @type {HTMLElement} */
        this.messageTimerDom = null;
        this.type = type;
        this.force_name2 = forceName2;
        this.ownsRun = ownsRun;
        this.generator = this.nullStreamingGeneration;
        // Initialize reasoning in its own handler
        this.reasoningHandler = new (shell().state.ReasoningHandler)(timeStarted);
        /** @type {PromptReasoning} */
        this.promptReasoning = promptReasoning;
    }

    /**
     * Initializes DOM elements for the current message.
     * @param {number} messageId Current message ID
     * @param {boolean?} continueOnReasoning If continuing on reasoning
     */
    async #checkDomElements(messageId) {
        if (isReactMainChatOwner()) {
            return;
        }

        if (this.messageDom && this.messageDom.getAttribute('mesid') !== String(messageId)) {
            this.messageDom = null;
            this.messageTextDom = null;
            this.messageTimerDom = null;
        }
        if (this.messageDom === null || this.messageTextDom === null) {
            this.messageDom = document.querySelector(`#chat .mes[mesid="${messageId}"]`);
            this.messageTextDom = this.messageDom?.querySelector('.mes_text');
            this.messageTimerDom = this.messageDom?.querySelector('.mes_timer');
        }
        this.reasoningHandler.updateDom(messageId);
    }

    #updateMessageBlockVisibility() {
        if (isReactMainChatOwner()) {
            return;
        }

        if (this.messageDom instanceof HTMLElement && Array.isArray(this.toolCalls) && this.toolCalls.length > 0) {
            const shouldHide = ['', '...'].includes(this.result) && !this.reasoningHandler.reasoning;
            this.messageDom.classList.toggle('displayNone', shouldHide);
        }
    }

    markUIGenStarted() {
        deactivateSendButtons();
    }

    markUIGenStopped() {
        unblockGeneration();
    }

    /** Browser effects for the installed typed stream message lifecycle. */
    #messagePorts() {
        return {
            getMessage: id => shell().state.chat[id],
            indexOfMessage: message => shell().state.chat.indexOf(message),
            saveInitial: (text, ownsRun) => saveReply({ type: this.type, getMessage: text, fromStreaming: true, ownsRun }),
            lastMessageId: () => shell().state.chat.length - 1,
            checkDom: id => this.#checkDomElements(id),
            updateVisibility: () => this.#updateMessageBlockVisibility(),
            clean: (text, isFinal, stoppingStrings) => cleanUpMessage({ getMessage: text, displayIncompleteSentences: !isFinal, stoppingStrings }),
            count: (text, token) => countOccurrences(text, token),
            isOdd: count => isOdd(count),
            startUI: () => this.markUIGenStarted(),
            stopUI: () => this.markUIGenStopped(),
            scroll: () => scrollChatToBottom({ waitForFrame: true }),
            isScrollLocked: () => shell().state.scrollLock,
            refresh: () => scheduleMainChatMessageListPanelRefresh(),
            mount: () => { void mountReactMainChatMessageListPanel(); },
            addCopyButtons: id => {
                const element = isReactMainChatOwner() ? null : shell().state.chatElement.find(`.mes[mesid="${id}"]`);
                if (element) addCopyToCodeBlocks(element);
            },
            processImages: (message, imageUrls, ownsRun) => processImageAttachment(message, { imageUrls, ownsRun }),
            renderImages: message => {
                if (!isReactMainChatOwner()) appendMediaToMessage(message, $(this.messageDom));
                else scheduleMainChatMessageListPanelRefresh();
            },
            emitReceived: (id, type) => eventSource.emit(event_types.MESSAGE_RECEIVED, id, type),
            emitRendered: (id, type) => eventSource.emit(event_types.CHARACTER_MESSAGE_RENDERED, id, type),
            saveChat: ownsRun => saveChatConditional(ownsRun),
            showFailure: id => showGenerationFailureRecovery(id),
        };
    }

    async onStartStreaming(text) {
        return getGenerationLifecycleService().startStreamMessage(this, this.#messagePorts(), text);
    }

    async onProgressStreaming(messageId, text, isFinal) {
        return getGenerationLifecycleService().progressStreamMessage(this, this.#messagePorts(), messageId, text, isFinal);
    }

    async finalizeIntermediaryMessage(messageId, text, { unlockUI = true }) {
        return getGenerationLifecycleService().finalizeStreamMessage(this, this.#messagePorts(), messageId, text, unlockUI);
    }

    async onFinishStreaming(messageId, text) {
        return getGenerationLifecycleService().finishStreamMessage(this, this.#messagePorts(), messageId, text);
    }

    async onErrorStreaming({ suppressRecovery = false } = {}) {
        return getGenerationLifecycleService().errorStreamMessage(this, this.#messagePorts(), suppressRecovery);
    }

    onStopStreaming() {
        getGenerationLifecycleService().stopStream(this.#streamState);
        rememberMainChatStreamingTransportProcessorTerminal(this, 'stopped');
        void mountReactMainChatMessageListPanel();
    }

    /**
     * @returns {AsyncGenerator<{ text: string, toolCalls: any[], state: any }, void, void>}
     */
    async* nullStreamingGeneration() {
        yield* [];
        throw new Error('Generation function for streaming is not hooked up');
    }

    async generate() {
        return getGenerationLifecycleService().generateStream(this, {
            delay: () => delay(1),
            resetScroll: () => { shell().state.scrollLock = false; },
            stoppingStrings: () => getStoppingStrings(shell().state.main_api),
            createStopwatch: () => new (shell().state.Stopwatch)(1000 / STREAMING_FPS),
            refresh: () => scheduleMainChatMessageListPanelRefresh(),
            emitToken: text => eventSource.emit(event_types.STREAM_TOKEN_RECEIVED, text),
            mount: () => { void mountReactMainChatMessageListPanel(); },
        });
    }
}

export function getCurrentGenerationContextIdentity() {
    return { chatId: shell().state.characters?.[shell().state.this_chid]?.chat ?? null, chatReference: shell().state.chat, contextRevision: getComposerSnapshot().contextRevision };
}

export async function executeGenerationRequestInShell(generationEnvelope) {
    const { type, options, dryRun } = generationEnvelope;
    const lifecycle = getGenerationLifecycleService();
    return lifecycle.run({
        foreground: generationCommandService.isForegroundGenerationEntry
            ? generationCommandService.isForegroundGenerationEntry(type, options, dryRun)
            : !(dryRun || options.depth || options.preview) && (type !== 'quiet' || (!options.backgroundGeneration && options.quietToLoud)),
        signal: options?.signal,
        execute: lease => executeOwnedGenerationRequestInShell(generationEnvelope, lease),
        onComplete: type === 'quiet' ? options?.onOwnedCompletion : undefined,
    });
}

async function executeOwnedGenerationRequestInShell(generationEnvelope, lease) {
    let {
        type,
        options,
        dryRun,
    } = generationEnvelope;
    let {
        automatic_trigger,
        force_name2,
        quiet_prompt,
        quietToLoud,
        skipWIAN,
        signal,
        quietImage,
        quietName,
        jsonSchema = null,
        depth = 0,
        preview = null,
    } = options;

    console.log('Generate entered');
    return getGenerationLifecycleService().runOwnedRequest({
        ownsRun: () => lease.owns(),
        prepare: async () => {
            const prepared = await getGenerationLifecycleService().prepareOwnedGeneration({
                type, dryRun, depth, preview, regenerate: options?.regenerate === true,
                signal, composerSubmission: options.composerSubmission, quietPrompt: quiet_prompt, automatic: automatic_trigger,
            }, {
                entry: {
                    getController: () => shell().state.abortController,
                    setController: controller => { shell().state.abortController = controller; },
                    getComposer: getComposerSnapshot,
                    setSignal: submissionSignal => lease.setSignal(submissionSignal),
                },
                promptContext: { globalPrompts: () => shell().state.extension_prompts, set: (...args) => setExtensionPrompt(...args) },
                identity: getCurrentGenerationContextIdentity,
                chat: () => shell().state.chat,
                currentComposer: getComposerSnapshot,
                ownsRun: () => lease.owns(),
                unblock: () => unblockGeneration(type),
                chatId: () => shell().state.characters?.[shell().state.this_chid]?.chat ?? null,
                characterName: () => shell().state.name2,
                start: () => { setGenerationProgress(0); shell().state.generation_started = new Date(); },
                preparation: (entry, promptContext, isStale) => ({
                    unshallow: () => unshallowCharacter(shell().state.this_chid),
                    emitStarted: () => eventSource.emit(event_types.GENERATION_STARTED, type, { automatic_trigger, force_name2, quiet_prompt, quietToLoud, skipWIAN, signal, quietImage, depth, regenerate: entry.isRegenerate, promptContext }, entry.dryRun),
                    commands: () => processCommands(entry.composerSubmission?.value ?? '', entry.composerSubmission),
                    emitAfterCommands: () => eventSource.emit(event_types.GENERATION_AFTER_COMMANDS, type, { automatic_trigger, force_name2, quiet_prompt, quietToLoud, skipWIAN, signal, quietImage, regenerate: entry.isRegenerate, promptContext }, entry.dryRun),
                    ping: pingServer, isStale, unblock: () => unblockGeneration(type),
                    serverUnreachable: () => {
                        toastr.error(t`Verify that the server is running and accessible.`, t`ST Server cannot be reached`);
                        throw new Error('Server unreachable');
                    },
                    markTainted: () => { shell().state.chat_metadata.tainted = true; },
                }),
                preflight: {
                    substitute: substituteParams,
                    hasBackendConnection: () => shell().state.online_status !== 'no_connection',
                    clearSending: () => { shell().state.is_send_press = false; },
                },
                composer: {
                    isSending: () => shell().state.is_send_press,
                    setSending: value => { shell().state.is_send_press = value; },
                    currentValue: () => getComposerSnapshot().value,
                    clear: expected => clearComposerValue({ expected }),
                    onBusy: () => console.warn('Regenerate skipped: a generation is already in flight'),
                },
                deactivate: deactivateSendButtons,
                remove: removeRegenerateTurnTail,
                bias: getBiasStrings,
                userInput: (isStale, entry) => ({
                    hasAttachment: hasPendingFileAttachment,
                    removeMacros,
                    emptyText: () => shell().state.oai_settings.send_if_empty,
                    sendSystem: bias => sendSystemMessage(shell().state.system_message_types.GENERIC, ' ', { bias }),
                    sendUser: (text, bias) => sendMessageAsUser(text, bias, null, false, undefined, { signal: entry.submissionSignal }),
                    buildUser: (text, bias) => buildUserMessage(text, bias),
                    isStale,
                }),
                isOpenAI: () => shell().state.main_api === 'openai',
                policy: {
                    canUseTools: () => shell().state.ToolManager.canPerformToolCalls(type),
                    recurseLimit: () => shell().state.ToolManager.RECURSE_LIMIT,
                    liveModel: resolvePipelineModel,
                    previewModel: model => resolvePreviewPipelineModel(model, 0),
                },
            });
            if (!prepared || prepared.kind === 'terminal') return prepared;
            return { kind: 'ready', state: prepared };
        },
        assemble: async prepared => {
            const { entry, promptContext, promptBias, policy } = prepared;
            const { isPreview } = entry;
            dryRun = entry.dryRun;
            quiet_prompt = prepared.quietPrompt;
            const previewPendingMessage = prepared.pending;
            const previewWarnings = prepared.warnings;
            const promptReasoning = new (shell().state.PromptReasoning)();
            const stages = await getGenerationLifecycleService().prepareRequestStages({
                type, dryRun, preview: isPreview, isOpenAI: shell().state.main_api === 'openai',
                hasPipelineMessages: Boolean(getPipelineRunState()?.messages), forceName: force_name2,
            }, {
                ownsRun: () => lease.owns(),
                continuation: () => getGenerationLifecycleService().preparePipelineContinuation({
                    ownsRun: () => lease.owns(),
                    prepare: () => prepareOpenAIMessages({ type, pipelineStepTag: getPipelineTriggerTag(type), pipelineStepModel: resolvePipelineModel(getChatCompletionModelFromSettings(shell().state.oai_settings)) }, false),
                }),
                base: () => getGenerationLifecycleService().prepareGenerationFoundation({
                    ownsRun: () => lease.owns(),
                    card: getCharacterCardFields,
                    clearDepth: () => removeDepthPrompts(promptContext.requestPrompts()),
                    depthSettings: () => ({
                        depth: shell().state.characters[shell().state.this_chid]?.data?.extensions?.depth_prompt?.depth,
                        role: shell().state.characters[shell().state.this_chid]?.data?.extensions?.depth_prompt?.role,
                        defaultDepth: shell().state.depth_prompt_depth_default,
                        defaultRole: shell().state.depth_prompt_role_default,
                    }),
                    resolveRole: getExtensionPromptRoleByName,
                    setDepth: (text, depth, role) => setExtensionPrompt(inject_ids.DEPTH_PROMPT, text, shell().state.extension_prompt_types.IN_CHAT, depth, false, role, null, promptContext.requestPrompts()),
                    historyInput: () => ({
                        chat: shell().state.chat, preview: isPreview, pending: previewPendingMessage,
                        canUseTools: shell().state.ToolManager.isToolCallingSupported(),
                        userPlacement: shell().state.regex_placement.USER_INPUT,
                        assistantPlacement: shell().state.regex_placement.AI_OUTPUT,
                        reasoningPlacement: shell().state.regex_placement.REASONING,
                    }),
                    historyPorts: {
                        substitute: substituteParams,
                        project: (items, chat) => applyChatMemoryToCoreChat(items, { chat, dryRun }),
                        regex: (message, placement, depth) => getRegexedString(message, placement, { isPrompt: true, depth }),
                        appendFile: appendFileContent,
                        addReasoning: (message, reasoning, duration) => promptReasoning.addToMessage(message, reasoning, false, duration),
                        reasoningLimitReached: () => promptReasoning.isLimitReached(),
                    },
                    maxTokens: getMaxPromptTokens,
                }),
                world: base => {
                    const { description, system, charDepthPrompt, creatorNotes, scenario } = base.card;
                    const coreChat = base.history.items;
                    console.log(`Core/all messages: ${coreChat.length}/${shell().state.chat.length}`);
                    return getGenerationLifecycleService().assembleWorldInfoStory({
                        messages: coreChat.map(item => item.mes), quietPrompt: quiet_prompt,
                        maxContext: base.maxTokens, dryRun, skipWIAN,
                        description, system, characterDepthPrompt: charDepthPrompt, creatorNotes, scenario,
                        character: shell().state.name2, user: shell().state.name1,
                    }, {
                        ownsRun: () => lease.owns(),
                        quiet: value => {
                            const promptMap = promptContext.requestPrompts();
                            setExtensionPrompt(inject_ids.QUIET_PROMPT, value, shell().state.extension_prompt_types.IN_PROMPT, 0, true, undefined, null, promptMap);
                            return (promptMap ?? shell().state.extension_prompts)[inject_ids.QUIET_PROMPT];
                        },
                        currentQuiet: () => (promptContext.requestPrompts() ?? shell().state.extension_prompts)[inject_ids.QUIET_PROMPT],
                        clearQuiet: () => setExtensionPrompt(inject_ids.QUIET_PROMPT, '', shell().state.extension_prompt_types.IN_PROMPT, 0, true, undefined, null, promptContext.requestPrompts()),
                        scan: (...args) => getWorldInfoPrompt(...args, { ownsRun: () => lease.owns(), promptMap: promptContext.scanPrompts() }),
                        flush: () => flushWIInjections(promptContext.requestPrompts()),
                        inject: (text, depth, role) => setExtensionPrompt(inject_ids.CUSTOM_WI_DEPTH_ROLE(depth, role), text, shell().state.extension_prompt_types.IN_CHAT, depth, false, role, null, promptContext.requestPrompts()),
                        anchor: kind => getExtensionPrompt(kind === 'before' ? shell().state.extension_prompt_types.BEFORE_PROMPT : shell().state.extension_prompt_types.IN_PROMPT, undefined, undefined, undefined, undefined, promptContext.requestPrompts()),
                        render: (params, options) => renderStoryString(params, { ...options, promptMap: promptContext.requestPrompts() }),
                        clearStory: () => setExtensionPrompt(inject_ids.STORY_STRING, '', shell().state.extension_prompt_types.IN_CHAT, 0, false, undefined, null, promptContext.requestPrompts()),
                    });
                },
                assemble: (base, worldStory, forceName) => {
                    const { description, system } = base.card;
                    const coreChat = base.history.items;
                    const { worldInfo, storyString } = worldStory;
                    return getGenerationLifecycleService().assemblePromptContent({
                        type, isOpenAI: shell().state.main_api === 'openai', dryRun, isPreview,
                        round: Number(preview?.round ?? 0), messages: coreChat, maxContext: base.maxTokens,
                        storyString, description, system, character: shell().state.name2, user: shell().state.name1,
                        worldInfo, beforeScenarioAnchor: worldStory.beforeScenarioAnchor, afterScenarioAnchor: worldStory.afterScenarioAnchor,
                        quietPrompt: quiet_prompt, quietToLoud, quietImage, forceName, promptBias, api: shell().state.main_api,
                    }, {
                        ownsRun: () => lease.owns(),
                        inject: messages => doChatInject(messages, promptContext.requestPrompts()),
                        format: formatMessageHistoryItem,
                        presetModel: () => getChatCompletionModelFromSettings(shell().state.oai_settings),
                        assemblyModel: policy.assemblyModel,
                        setMessages: setOpenAIMessages,
                        separator: addChatsSeparator,
                        countInitial: text => getTokenCountAsync(text, TOKEN_PADDING),
                        countHistory: text => getTokenCountAsync(text),
                        setContext: count => setInContextMessages(count, type),
                        setSending: () => { shell().state.is_send_press = true; },
                        before: data => eventSource.emit(event_types.GENERATE_BEFORE_COMBINE_PROMPTS, data, { promptContext }),
                        after: data => eventSource.emit(event_types.GENERATE_AFTER_COMBINE_PROMPTS, data, { promptContext }),
                        extensionPrompts: () => promptContext.requestPrompts() ?? shell().state.extension_prompts,
                        openAI: {
                            getRunnablePipeline,
                            getPresetModel: () => getChatCompletionModelFromSettings(shell().state.oai_settings),
                            previewTag: getPreviewPipelineTriggerTag,
                            previewModel: resolvePreviewPipelineModel,
                            liveModel: resolvePipelineModel,
                            liveTag: getPipelineTriggerTag,
                            prepare: prepareOpenAIMessages,
                        },
                        setOpenAIContext: () => setInContextMessages(shell().state.openai_messages_count, type),
                    });
                },
                publish: data => getGenerationLifecycleService().publishGenerationData(data, dryRun, {
                    ownsRun: () => lease.owns(),
                    emit: (value, isDryRun) => eventSource.emit(event_types.GENERATE_AFTER_DATA, value, isDryRun, { promptContext }),
                }),
                preview: (data, chatCompletion, summarized) => buildPreviewRequestResult({
                    type,
                    generateData: data,
                    chatCompletion,
                    round: Number(preview?.round ?? 0),
                    warnings: previewWarnings,
                    pendingMessage: previewPendingMessage,
                    summarized,
                    // The pending user message is the newest chatHistory entry;
                    // buildPreviewRequestResult resolves its identifier from the final
                    // assembled pool (depth injections can shift the numbering).
                    pendingEntryIdentifier: null,
                    ownsRun: () => lease.owns(),
                }),
            });
            return { stages, promptReasoning };
        },
        dispatch: async (prepared, assembly) => {
            const { entry, requestIdentity, requestTrace, regenerateSnapshot, policy } = prepared;
            const { submissionSignal } = entry;
            const { stages, promptReasoning } = assembly;
            const generate_data = stages.data;
            force_name2 = stages.forceName;
            async function finalizePipelineReply(input) {
                return getGenerationLifecycleService().finalizePipelineReply(input, {
                    ownsRun: () => lease.owns(),
                    chat: shell().state.chat,
                    clean: text => cleanUpMessage({ getMessage: text, displayIncompleteSentences: false, stoppingStrings: [] }),
                    formatTags: (invocations, text) => shell().state.ToolManager.formatPipelineTagMarkup(invocations, text),
                    regexOutput: text => getRegexedString(text, shell().state.regex_placement.AI_OUTPUT),
                    removeCardView: index => {
                        if (isReactMainChatOwner()) void mountReactMainChatMessageListPanel();
                        else shell().state.chatElement.find(`.mes[mesid="${index}"]`).remove();
                    },
                    emitDeleted: length => eventSource.emit(event_types.MESSAGE_DELETED, length),
                    saveReply: reply => saveReply(reply),
                    endPipeline: () => endPipelineRun(),
                    saveChat: ownsRun => saveChatConditional(ownsRun),
                    unblock: generationType => unblockGeneration(generationType),
                    clearProcessor: () => { shell().state.streamingProcessor = null; },
                    refresh: () => scheduleMainChatMessageListPanelRefresh(),
                });
            }

            const deleteRecoveryPlaceholder = async recovery => {
                const chat = shell().state.chat;
                if (recovery.hasIdentity && recovery.messageId !== chat.length - 1) {
                    throw new Error('Generation recovery message is no longer available.');
                }
                // deleteLastMessage removes the row synchronously before awaiting its event.
                // Retire this round's identity only when that exact row was removed.
                const pending = deleteLastMessage();
                if (recovery.hasIdentity && recovery.messageId === null) recovery.messageId = null;
                return await pending;
            };

            return getGenerationLifecycleService().runGenerationDispatch({
                type, depth, canPerformTools: policy.canPerformTools, pipeline: getPipelineRunState(),
                isOpenAI: shell().state.main_api === 'openai', command: generationEnvelope.command,
                trace: requestTrace, signal: submissionSignal, cancelSignal: signal, jsonSchema, quietToLoud,
            }, {
                ownsRun: () => lease.owns(),
                currentProcessor: () => shell().state.streamingProcessor,
                isOpenAI: () => shell().state.main_api === 'openai',
                isRecoveryMessage: isAssistantRecoveryMessageId,
                recoveryIdentityAt: id => shell().state.chat[id],
                recoveryIndexOf: message => shell().state.chat.indexOf(message),
                createRecoveryMessage: async () => {
                    const chat = shell().state.chat;
                    let message;
                    await saveReply({ type, getMessage: '', fromStreaming: true, ownsRun: () => lease.owns(), onMessageCreated: created => { message = created; } });
                    const messageId = message ? chat.indexOf(message) : -1;
                    if (!lease.owns() || shell().state.chat !== chat || messageId < 0) throw new Error('Generation recovery message is no longer available.');
                    return { messageId, identity: message };
                },
                getModel: () => shell().state.generatingAttemptModel,
                setModel: model => { shell().state.generatingAttemptModel = model; },
                continueGeneration: (generationType, nextDepth) => Generate(generationType, { automatic_trigger, force_name2, quiet_prompt, quietToLoud, skipWIAN, signal, quietImage, quietName, depth: nextDepth }, dryRun),
                transport: (dispatchState, recovery) => ({
                    presetModel: () => getChatCompletionModelFromSettings(shell().state.oai_settings),
                    fallbackModel: () => getFallbackOpenAIModel(shell().state.oai_settings),
                    pipelineModel: resolvePipelineModel,
                    setAttemptModel: model => { shell().state.generatingAttemptModel = model; },
                    canPerformTools: model => shell().state.ToolManager.canPerformToolCalls(dispatchState.type, shell().state.oai_settings, model),
                    recurseLimit: () => shell().state.ToolManager.RECURSE_LIMIT,

                    isOpenAIStreaming: (model, generationType) => isChatCompletionStreaming(shell().state.oai_settings, model, generationType),
                    isStreaming: isStreamingEnabled,
                    send: requestOptions => sendGenerationRequest(dispatchState.type, generate_data, requestOptions),
                    hasToolCalls: result => shell().state.ToolManager.hasToolCalls(result),
                    assertAllowed: () => assertPipelineResponseAllowed(1, { canPerformToolCalls: dispatchState.canPerformTools }),
                    isEmpty: result => getGenerationLifecycleService().isGenerationResultEmpty({ jsonSchema, result }, {
                        extract: extractMessageFromData,
                        clean: getMessage => cleanUpMessage({ getMessage, displayIncompleteSentences: false }),
                    }),

                    createStream: ({ intermediate, fallback }) => {
                        shell().state.streamingProcessor = getGenerationLifecycleService().initializeAttemptStream({
                            intermediate, fallback, recoveryMessageId: recovery.messageId,
                        }, () => new GenerationStreamSession(dispatchState.type, force_name2, shell().state.generation_started, promptReasoning,
                            () => dispatchState.ownsStream(dispatchState.processor) && (!recovery.hasIdentity || recovery.messageId !== null)));
                        if (recovery.hasIdentity) {
                            Object.defineProperty(shell().state.streamingProcessor, 'messageId', {
                                configurable: true, enumerable: true, get: () => recovery.messageId ?? -1, set: () => {},
                            });
                        }
                        return shell().state.streamingProcessor;
                    },
                    sendStream: requestOptions => sendStreamingRequest(dispatchState.type, generate_data, requestOptions),
                    setStreamGenerator: (generator, processor) => { processor.generator = generator; },
                    consumeStream: processor => processor.generate(),
                    streamAborted: processor => processor.abortController.signal.aborted && processor.isFinished,
                }),
                stream: (dispatchState, recovery, processor) => ({
                    ownsRun: () => dispatchState.ownsCleanup() && (!recovery.hasIdentity || recovery.messageId !== null),
                    clean: getMessage => cleanUpMessage({ getMessage, displayIncompleteSentences: false }),
                    assertAllowed: count => assertPipelineResponseAllowed(count, { canPerformToolCalls: dispatchState.canPerformTools }),
                    lastMessage: () => shell().state.chat[shell().state.chat.length - 1],
                    hasToolCalls: calls => shell().state.ToolManager.hasToolCalls(calls),
                    deleteLast: () => deleteRecoveryPlaceholder(recovery),
                    setModel: (id, model) => {
                        if (shell().state.chat[id]) {
                            shell().state.chat[id].extra ??= {};
                            shell().state.chat[id].extra.model = model;
                        }
                    },
                    finalizeIntermediary: (id, message) => processor.finalizeIntermediaryMessage(id, message, { unlockUI: false }),
                    invokeTools: (calls, options) => shell().state.ToolManager.invokeFunctionTools(calls, { ...options, ownsRun: () => dispatchState.ownsCleanup() && (!recovery.hasIdentity || recovery.messageId !== null) }),
                    showErrors: errors => shell().state.ToolManager.showToolCallError(errors),
                    endPipeline: endPipelineRun,
                    unblock: unblockGeneration,
                    clearProcessor: () => { shell().state.streamingProcessor = null; },
                    prepareRound: preparePipelineRound,
                    saveInvocations: invocations => shell().state.ToolManager.saveFunctionToolInvocations(invocations, { ownsRun: () => dispatchState.ownsCleanup() && (!recovery.hasIdentity || recovery.messageId !== null) }),
                    markComplete: current => rememberMainChatStreamingTransportProcessorTerminal(current, 'completed'),
                    finalizePipeline: finalizePipelineReply,
                    hasPipeline: () => Boolean(getPipelineRunState()),

                    finishMessage: (id, message) => processor.onFinishStreaming(id, message),
                    refresh: scheduleMainChatMessageListPanelRefresh,
                    clearRecovery: clearGenerationAutoRecoveryStatus,
                }),
                round: () => ({
                    plan: command => createGenerationCommandPlan(command, {
                        fallbackReady: hasFallbackProviderForGeneration({ settings: shell().state.oai_settings }),
                        statusLabels: getGenerationLifecycleStatusLabels(),
                    }),
                    activeRunId: getActivePipelineRunId,
                    meta: getPipelineStepMeta,
                    step: getCurrentPipelineStep,
                    isFallback: isPipelineFallbackRound,
                    execute: executeGenerationAttempts,
                    successfulMessageId: () => shell().state.chat.length - 1,
                    clearSuccessStatus: clearGenerationAutoRecoveryStatus,
                    processorMessageId: () => shell().state.streamingProcessor?.messageId,
                    decideFailure: getGenerationFailureDecision,
                    clearProcessor: () => { shell().state.streamingProcessor = null; },
                    clearMessage: clearGenerationAttemptMessage,
                    showStatus: showGenerationAutoRecoveryStatus,
                    deactivate: deactivateSendButtons,
                    showStop: showStopButton,
                    isRecoveryMessage: isAssistantRecoveryMessageId,
                    clearStatus: clearGenerationAutoRecoveryStatus,
                    showFailure: showGenerationFailureRecovery,
                }),
                response: (dispatchState, recovery) => ({
                    ownsRun: () => lease.owns() && (!recovery.hasIdentity || recovery.messageId !== null),

                    unblock: generationType => unblockGeneration(generationType),
                    showApiError: response => toastr.error(response, t`API Error`, { preventDuplicates: true }),
                    extractJson: (response, returnInvalidJson) => extractJsonFromData(response, { returnInvalidJson }),
                    extractMessage: response => extractMessageFromData(response),
                    extractTitle: response => extractTitleFromData(response),
                    extractReasoning: response => extractReasoningFromData(response),
                    extractImages: response => extractImagesFromData(response),
                    extractSignature: response => extractReasoningSignatureFromData(response),
                    clean: (message, displayIncompleteSentences) => cleanUpMessage({ getMessage: message, displayIncompleteSentences }),
                    cleanReasoning: reasoning => getRegexedString(reasoning, shell().state.regex_placement.REASONING),
                    hasRecoveryMessage: () => isAssistantRecoveryMessageId(recovery.messageId),
                    replaceRecovery: reply => replaceAssistantRecoveryMessage(recovery.messageId, reply),
                    clearRecoveryStatus: () => clearGenerationAutoRecoveryStatus(recovery.messageId),
                    saveReply: reply => saveReply(reply),
                    setType: value => { dispatchState.type = value; },
                    hasToolCalls: response => shell().state.ToolManager.hasToolCalls(response),
                    deleteLastMessage: () => deleteRecoveryPlaceholder(recovery),
                    invokeTools: (response, reasoningText, ownsRun) => shell().state.ToolManager.invokeFunctionTools(response, { reasoningText, ownsRun }),
                    showToolErrors: errors => shell().state.ToolManager.showToolCallError(errors),
                    preparePipeline: invocations => preparePipelineRound(invocations),
                    saveTools: (invocations, ownsRun) => shell().state.ToolManager.saveFunctionToolInvocations(invocations, { ownsRun }),
                    finalizePipeline: input => finalizePipelineReply(input),
                    logSave: () => console.debug('/api/chats/save called by /Generate'),
                    endPipeline: () => endPipelineRun(),
                    saveChat: ownsRun => saveChatConditional(ownsRun),
                    clearProcessor: () => { shell().state.streamingProcessor = null; },
                }),
                failure: dispatchState => ({
                    ownsRun: () => dispatchState.ownsCleanup(),
                    cleanupStopped: () => getGenerationLifecycleService().cleanupStoppedGeneration({
                        aborted: Boolean(signal?.aborted || submissionSignal?.aborted),
                        current: getCurrentGenerationContextIdentity(), expected: requestIdentity,
                        processor: shell().state.streamingProcessor, expectedProcessor: dispatchState.processor,
                        pipeline: getPipelineRunState(), expectedPipeline: dispatchState.pipeline,
                    }, {
                        endPipeline: endPipelineRun,
                        unblock: () => unblockGeneration(dispatchState.type),
                        clearProcessor: () => { shell().state.streamingProcessor = null; },
                    }),
                    reportError: message => toastr.error(message, t`Text generation error`, { timeOut: 10000, extendedTimeOut: 20000 }),
                    endPipeline: endPipelineRun,
                    hasRegenerateSnapshot: Boolean(regenerateSnapshot),
                    isUserStopped: isUserStoppedGeneration,
                    restore: () => restoreRegenerateTurnTail(regenerateSnapshot),
                    reportRestore: restored => {
                        if (restored) toastr.warning(t`Regeneration failed — the previous reply was restored.`, t`Regenerate`);
                        else toastr.error(t`Regeneration failed — the previous reply could not be restored.`, t`Regenerate`);
                    },
                    unblock: () => unblockGeneration(dispatchState.type),
                    log: error => console.log(error),
                    clearProcessor: () => { shell().state.streamingProcessor = null; },
                }),
            });
        },
    });
}
//MARK: Generate() ends


/**
 * Turns the assembled preview state into the final request body the send path
 * would POST — minus the fetch. Pipeline shaping is applied explicitly (the
 * CHAT_COMPLETION_SETTINGS_READY event is intentionally not emitted so
 * settings-mutating listeners stay inert).
 * @param {object} args
 * @param {string} args.type Generation type
 * @param {object} args.generateData {prompt: messages[]} assembled by prepareOpenAIMessages
 * @param {object} args.chatCompletion Assembled ChatCompletion instance
 * @param {number} args.round Pipeline round index to preview
 * @param {string[]} args.warnings Collected preview warnings
 * @param {object} args.pendingMessage Synthetic user message appended for the preview
 * @param {string|null} args.pendingEntryIdentifier chatHistory identifier of the pending entry
 * @param {object[]} [args.summarized] Turn-summary projection entries applied to this assembly
 * @returns {Promise<object>} Serializable preview result for the inspector UI
 */
async function buildPreviewRequestResult({ type, generateData, chatCompletion, round, warnings, pendingMessage, pendingEntryIdentifier = null, summarized = [], ownsRun }) {
    return getGenerationLifecycleService().buildPreviewResult({
        type, isOpenAI: shell().state.main_api === 'openai', data: generateData, round, warnings,
        pending: pendingMessage, pendingIdentifier: pendingEntryIdentifier, summarized, completion: chatCompletion,
    }, {
        ownsRun,
        previewModel: index => resolvePreviewPipelineModel(getChatCompletionModelFromSettings(shell().state.oai_settings), index),
        build: (messages, index, model) => buildChatCompletionRequest({ type, messages, model, emitSettingsReady: false }),
        shape: (body, index) => previewPipelineRequestShaping(body, { round: index }),
        canUseTools: model => shell().state.ToolManager.canPerformToolCalls(type, shell().state.oai_settings, model),
        responseTokens: () => Number(shell().state.oai_settings?.openai_max_tokens) || 0,
        maxPromptTokens: () => getMaxPromptTokens(),
        budget: (completion, contextTokens, responseTokens) => derivePreviewBudget({ chatCompletion: completion, contextTokens, responseTokens }),
    });
}

/**
 * Preview the request a normal generation would produce right now, without
 * sending it and without mutating chat shell().state. Runs the full assembly path of
 * executeGenerationRequestInShell and stops before the fetch.
 * @param {object} [options] Options
 * @param {number} [options.round] Pipeline round index to preview (0 = first step)
 * @returns {Promise<object>} Serializable preview result
 */
export async function previewNextGenerationRequest({ round = 0 } = {}) {
    await shell().ensureGenerationRuntime?.();
    return executeGenerationRequestInShell(createGenerationRequestEnvelope({
        type: 'normal',
        options: { preview: { round: Number(round) || 0 } },
        dryRun: true,
        mainApi: shell().state.main_api,
    }));
}

export function updateEditArrowClasses() {
    if (!(shell().state.this_edit_mes_id >= 0)) {
        return;
    }
    if (isReactMainChatOwner()) {
        return;
    }

    const message = shell().state.chatElement.children('.mes').filter(`.mes[mesid="${shell().state.this_edit_mes_id}"]`);

    const downButton = message.find('.mes_edit_down');
    const upButton = message.find('.mes_edit_up');
    const copyButton = message.find('.mes_edit_copy');
    const deleteButton = message.find('.mes_edit_delete');
    const lastId = Number(shell().state.chatElement.find('.mes').last().attr('mesid'));
    const firstId = Number(shell().state.chatElement.find('.mes').first().attr('mesid'));

    copyButton.removeClass('disabled');
    deleteButton.removeClass('disabled');

    // The last message cannot be moved down.
    downButton.toggleClass('disabled', lastId === Number(shell().state.this_edit_mes_id));
    // The first message cannot be moved up.
    upButton.toggleClass('disabled', firstId === Number(shell().state.this_edit_mes_id));
}

