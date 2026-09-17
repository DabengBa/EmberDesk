import { eventSource, event_types } from './events.js';
import { GENERATION_TYPE_TRIGGERS, OVERSWIPE_BEHAVIOR, SWIPE_DIRECTION, SWIPE_SOURCE, SWIPE_STATE, inject_ids } from './constants.js';
import { executeGenerationAttempts, createGenerationCommandPlan } from './chat-generation-command-service.js';
import {
    getGenerationFailureDecision,
    getGenerationSuccessFinalization,
    getGenerationAttemptBaseline as getLifecycleGenerationAttemptBaseline,
    hasFallbackProviderForGeneration,
} from './chat-generation-lifecycle.js';
import { getWorldInfoPrompt } from './world-info-service.js';
import { wi_anchor_position } from './world-info-domain.js';
import { world_info_include_names } from './world-info-state.js';
import { requireGenerationShellContext } from './generation-shell-context.js';

function shell() {
    return requireGenerationShellContext();
}

const state = new Proxy({}, {
    get: (_, key) => shell().state[key],
    set: (_, key, value) => {
        shell().state[key] = value;
        return true;
    },
    has: (_, key) => key in shell().state,
    ownKeys: () => Reflect.ownKeys(shell().state),
    getOwnPropertyDescriptor: (_, key) => Object.getOwnPropertyDescriptor(shell().state, key),
});

const addChatsSeparator = (...args) => shell().addChatsSeparator(...args);
const addPersonaDescriptionExtensionPrompt = (...args) => shell().addPersonaDescriptionExtensionPrompt(...args);
const baseChatReplace = (...args) => shell().baseChatReplace(...args);
const cleanUpMessage = (...args) => shell().cleanUpMessage(...args);
const clearGenerationAttemptMessage = (...args) => shell().clearGenerationAttemptMessage(...args);
const clearGenerationAutoRecoveryStatus = (...args) => shell().clearGenerationAutoRecoveryStatus(...args);
const createExistingMessageRecoveryBaseline = (...args) => shell().createExistingMessageRecoveryBaseline(...args);
const deactivateSendButtons = (...args) => shell().deactivateSendButtons(...args);
const deleteLastMessage = (...args) => shell().deleteLastMessage(...args);
const doChatInject = (...args) => shell().doChatInject(...args);
const extractImagesFromData = (...args) => shell().extractImagesFromData(...args);
const extractJsonFromData = (...args) => shell().extractJsonFromData(...args);
const extractMessageFromData = (...args) => shell().extractMessageFromData(...args);
const extractMultiSwipes = (...args) => shell().extractMultiSwipes(...args);
const extractTitleFromData = (...args) => shell().extractTitleFromData(...args);
const flushWIInjections = (...args) => shell().flushWIInjections(...args);
const formatMessageHistoryItem = (...args) => shell().formatMessageHistoryItem(...args);
const getAllExtensionPrompts = (...args) => shell().getAllExtensionPrompts(...args);
const getBiasStrings = (...args) => shell().getBiasStrings(...args);
const getCharacterCardFields = (...args) => shell().getCharacterCardFields(...args);
const getExtensionPrompt = (...args) => shell().getExtensionPrompt(...args);
const getExtensionPromptRoleByName = (...args) => shell().getExtensionPromptRoleByName(...args);
const getGenerationLifecycleStatusLabels = (...args) => shell().getGenerationLifecycleStatusLabels(...args);
const getMaxPromptTokens = (...args) => shell().getMaxPromptTokens(...args);
const getNextMessageId = (...args) => shell().getNextMessageId(...args);
const isAssistantRecoveryMessageId = (...args) => shell().isAssistantRecoveryMessageId(...args);
const isStreamingEnabled = (...args) => shell().isStreamingEnabled(...args);
const parseAndSaveLogprobs = (...args) => shell().parseAndSaveLogprobs(...args);
const parseMesExamples = (...args) => shell().parseMesExamples(...args);
const parseTokenCounts = (...args) => shell().parseTokenCounts(...args);
const pingServer = (...args) => shell().pingServer(...args);
const prepareGenerationRetrySwipe = (...args) => shell().prepareGenerationRetrySwipe(...args);
const processCommands = (...args) => shell().processCommands(...args);
const rememberMainChatStreamingTransportProcessorTerminal = (...args) => shell().rememberMainChatStreamingTransportProcessorTerminal(...args);
const removeDepthPrompts = (...args) => shell().removeDepthPrompts(...args);
const removeLastMessage = (...args) => shell().removeLastMessage(...args);
const removeMacros = (...args) => shell().removeMacros(...args);
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
const triggerAutoContinue = (...args) => shell().triggerAutoContinue(...args);
const unblockGeneration = (...args) => shell().unblockGeneration(...args);
const unshallowCharacter = (...args) => shell().unshallowCharacter(...args);
const Generate = (...args) => shell().Generate(...args);
const addCopyToCodeBlocks = (...args) => shell().addCopyToCodeBlocks(...args);
const appendMediaToMessage = (...args) => shell().appendMediaToMessage(...args);
const formatGenerationTimer = (...args) => shell().formatGenerationTimer(...args);
const getStoppingStrings = (...args) => shell().getStoppingStrings(...args);
const isReactMainChatOwner = (...args) => shell().isReactMainChatOwner(...args);
const messageFormatting = (...args) => shell().messageFormatting(...args);
const mountReactMainChatMessageListPanel = (...args) => shell().mountReactMainChatMessageListPanel(...args);
const processImageAttachment = (...args) => shell().processImageAttachment(...args);
const scrollChatToBottom = (...args) => shell().scrollChatToBottom(...args);
const appendFileContent = (...args) => shell().appendFileContent(...args);
const extractReasoningFromData = (...args) => shell().extractReasoningFromData(...args);
const extractReasoningSignatureFromData = (...args) => shell().extractReasoningSignatureFromData(...args);
const getCfgPrompt = (...args) => shell().getCfgPrompt(...args);
const getFriendlyTokenizerName = (...args) => shell().getFriendlyTokenizerName(...args);
const getGuidanceScale = (...args) => shell().getGuidanceScale(...args);
const getPresetManager = (...args) => shell().getPresetManager(...args);
const getRegexedString = (...args) => shell().getRegexedString(...args);
const getTokenCountAsync = (...args) => shell().getTokenCountAsync(...args);
const hasPendingFileAttachment = (...args) => shell().hasPendingFileAttachment(...args);
const sendSystemMessage = (...args) => shell().sendSystemMessage(...args);
const setFloatingPrompt = (...args) => shell().setFloatingPrompt(...args);
const collapseNewlines = (...args) => shell().collapseNewlines(...args);
const formatInstructModeChat = (...args) => shell().formatInstructModeChat(...args);
const formatInstructModeExamples = (...args) => shell().formatInstructModeExamples(...args);
const formatInstructModePrompt = (...args) => shell().formatInstructModePrompt(...args);
const formatInstructModeStoryString = (...args) => shell().formatInstructModeStoryString(...args);
const generatedTextFiltered = (...args) => shell().generatedTextFiltered(...args);
const playMessageSound = (...args) => shell().playMessageSound(...args);
const prepareOpenAIMessages = (...args) => shell().prepareOpenAIMessages(...args);
const renderStoryString = (...args) => shell().renderStoryString(...args);
const runGenerationInterceptors = (...args) => shell().runGenerationInterceptors(...args);
const setOpenAIMessageExamples = (...args) => shell().setOpenAIMessageExamples(...args);
const setOpenAIMessages = (...args) => shell().setOpenAIMessages(...args);
const shiftDownByOne = (...args) => shell().shiftDownByOne(...args);
const shiftUpByOne = (...args) => shell().shiftUpByOne(...args);
const parseReasoningInSwipes = (...args) => shell().parseReasoningInSwipes(...args);
const saveLogprobsForActiveMessage = (...args) => shell().saveLogprobsForActiveMessage(...args);
const applyStreamFadeIn = (...args) => shell().applyStreamFadeIn(...args);
const countOccurrences = (...args) => shell().countOccurrences(...args);
const isOdd = (...args) => shell().isOdd(...args);
const delay = (...args) => shell().delay(...args);
const deleteItemizedPromptForMessage = (...args) => shell().deleteItemizedPromptForMessage(...args);
const addOneMessage = (...args) => shell().addOneMessage(...args);
const cancelDebouncedChatSave = (...args) => shell().cancelDebouncedChatSave(...args);
const closeMessageEditor = (...args) => shell().closeMessageEditor(...args);
const isGenerating = (...args) => shell().isGenerating(...args);
const redisplayChat = (...args) => shell().redisplayChat(...args);
const reloadCurrentChat = (...args) => shell().reloadCurrentChat(...args);
const saveChatDebounced = (...args) => shell().saveChatDebounced(...args);
const clamp = (...args) => shell().clamp(...args);
const createTimeout = (...args) => shell().createTimeout(...args);
const shakeElement = (...args) => shell().shakeElement(...args);
const updateReasoningUI = (...args) => shell().updateReasoningUI(...args);
const t = (strings, ...values) => shell().t(strings, ...values);

export class GenerationStreamSession {
    /**
     * Creates a new streaming processor.
     * @param {string} type Generation type
     * @param {boolean} forceName2 If true, force the use of name2
     * @param {Date} timeStarted Date when generation was started
     * @param {string} continueMessage Previous message if the type is 'continue'
     * @param {PromptReasoning} promptReasoning Prompt reasoning instance
     */
    constructor(type, forceName2, timeStarted, continueMessage, promptReasoning) {
        this.result = '';
        this.messageId = -1;
        /** @type {HTMLElement} */
        this.messageDom = null;
        /** @type {HTMLElement} */
        this.messageTextDom = null;
        /** @type {HTMLElement} */
        this.messageTimerDom = null;
        /** @type {HTMLElement} */
        this.messageTokenCounterDom = null;
        /** @type {HTMLTextAreaElement} */
        this.sendTextarea = document.querySelector('#send_textarea');
        this.type = type;
        this.force_name2 = forceName2;
        this.isStopped = false;
        this.isFinished = false;
        this.generator = this.nullStreamingGeneration;
        this.abortController = new AbortController();
        this.firstMessageText = '...';
        this.timeStarted = timeStarted;
        /** @type {number?} */
        this.timeToFirstToken = null;
        this.createdAt = new Date();
        this.continueMessage = type === 'continue' ? continueMessage : '';
        this.swipes = [];
        /** @type {import('./logprobs.js').TokenLogprobs[]} */
        this.messageLogprobs = [];
        this.toolCalls = [];
        // Initialize reasoning in its own handler
        this.reasoningHandler = new state.ReasoningHandler(timeStarted);
        /** @type {PromptReasoning} */
        this.promptReasoning = promptReasoning;
        /** @type {string[]} */
        this.images = [];
        /** @type {string?} */
        this.reasoningSignature = null;
        this.suppressErrorRecovery = false;
        this.isFinalizing = false;
        this.observedTokenCount = 0;
        this.observedChunkCount = 0;
        this.fromFallbackAttempt = false;
    }

    /**
     * Initializes DOM elements for the current message.
     * @param {number} messageId Current message ID
     * @param {boolean?} continueOnReasoning If continuing on reasoning
     */
    async #checkDomElements(messageId, continueOnReasoning = null) {
        if (isReactMainChatOwner()) {
            if (continueOnReasoning) {
                await this.reasoningHandler.process(messageId, false, this.promptReasoning);
            }
            return;
        }

        if (this.messageDom === null || this.messageTextDom === null) {
            this.messageDom = document.querySelector(`#chat .mes[mesid="${messageId}"]`);
            this.messageTextDom = this.messageDom?.querySelector('.mes_text');
            this.messageTimerDom = this.messageDom?.querySelector('.mes_timer');
            this.messageTokenCounterDom = this.messageDom?.querySelector('.tokenCounterDisplay');
        }
        if (continueOnReasoning) {
            await this.reasoningHandler.process(messageId, false, this.promptReasoning);
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

    async onStartStreaming(text) {
        const continueOnReasoning = !!(this.type === 'continue' && this.promptReasoning.prefixReasoning);
        if (continueOnReasoning) {
            this.reasoningHandler.initContinue(this.promptReasoning);
        }

        let messageId = -1;

        if (this.type == 'impersonate') {
            this.sendTextarea.value = '';
            this.sendTextarea.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
            await saveReply({ type: this.type, getMessage: text, fromStreaming: true });
            messageId = state.chat.length - 1;
            await this.#checkDomElements(messageId, continueOnReasoning);
            this.markUIGenStarted();
        }
        hideSwipeButtons({ hideCounters: true });
        scrollChatToBottom({ waitForFrame: true });
        return messageId;
    }

    async onProgressStreaming(messageId, text, isFinal) {
        const isImpersonate = this.type == 'impersonate';
        const isContinue = this.type == 'continue';

        if (!isImpersonate && !isContinue && Array.isArray(this.swipes) && this.swipes.length > 0) {
            for (let i = 0; i < this.swipes.length; i++) {
                this.swipes[i] = cleanUpMessage({
                    getMessage: this.swipes[i],
                    isImpersonate: false,
                    isContinue: false,
                    displayIncompleteSentences: true,
                    stoppingStrings: this.stoppingStrings,
                });
            }
        }

        let processedText = cleanUpMessage({
            getMessage: text,
            isImpersonate: isImpersonate,
            isContinue: isContinue,
            displayIncompleteSentences: !isFinal,
            stoppingStrings: this.stoppingStrings,
        });

        const charsToBalance = ['*', '"', '```', '~~~'];
        for (const char of charsToBalance) {
            if (!isFinal && isOdd(countOccurrences(processedText, char))) {
                const separator = char.length > 1 ? '\n' : '';
                processedText = processedText.trimEnd() + separator + char;
            }
        }

        if (isImpersonate) {
            this.sendTextarea.value = processedText;
            this.sendTextarea.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
            const mesChanged = state.chat[messageId].mes !== processedText;
            await this.#checkDomElements(messageId);
            this.#updateMessageBlockVisibility();
            const currentTime = new Date();
            state.chat[messageId].mes = processedText;
            state.chat[messageId].gen_started = this.timeStarted;
            state.chat[messageId].gen_finished = currentTime;
            if (!state.chat[messageId].extra) {
                state.chat[messageId].extra = {};
            }
            state.chat[messageId].extra.time_to_first_token = this.timeToFirstToken;

            // Update reasoning
            await this.reasoningHandler.process(messageId, mesChanged, this.promptReasoning);
            processedText = state.chat[messageId].mes;

            // Token count update.
            const tokenCountText = this.reasoningHandler.reasoning + processedText;
            const currentTokenCount = isFinal && state.power_user.message_token_count_enabled ? await getTokenCountAsync(tokenCountText, 0) : 0;
            if (currentTokenCount) {
                state.chat[messageId].extra.token_count = currentTokenCount;
                if (this.messageTokenCounterDom instanceof HTMLElement) {
                    this.messageTokenCounterDom.textContent = `${currentTokenCount}t`;
                }
            }

            if ((this.type == 'swipe' || this.type === 'continue') && Array.isArray(state.chat[messageId].swipes)) {
                state.chat[messageId].swipes[state.chat[messageId].swipe_id] = processedText;
                state.chat[messageId].swipe_info[state.chat[messageId].swipe_id] = {
                    'send_date': state.chat[messageId].send_date,
                    'gen_started': state.chat[messageId].gen_started,
                    'gen_finished': state.chat[messageId].gen_finished,
                    'extra': structuredClone(state.chat[messageId].extra),
                };
            }

            if (!isReactMainChatOwner()) {
                const formattedText = messageFormatting(
                    processedText,
                    state.chat[messageId].name,
                    state.chat[messageId].is_system,
                    state.chat[messageId].is_user,
                    messageId,
                    {},
                    false,
                );
                if (this.messageTextDom instanceof HTMLElement) {
                    if (state.power_user.stream_fade_in) {
                        applyStreamFadeIn(this.messageTextDom, formattedText);
                    } else {
                        this.messageTextDom.innerHTML = formattedText;
                    }
                }

                const timePassed = formatGenerationTimer(this.timeStarted, currentTime, currentTokenCount, this.reasoningHandler.getDuration(), this.timeToFirstToken);
                if (this.messageTimerDom instanceof HTMLElement) {
                    this.messageTimerDom.textContent = timePassed.timerValue;
                    this.messageTimerDom.title = timePassed.timerTitle;
                }
            }

            this.setFirstSwipe(messageId);
            if (isReactMainChatOwner()) {
                scheduleMainChatMessageListPanelRefresh();
            }
        }

        if (!state.scrollLock) {
            scrollChatToBottom({ waitForFrame: true });
        }
    }

    /**
     * Finalizes an intermediary message after generation is complete, or a tool call is performed.
     * Performs essential message processing (code blocks, reasoning, swipes, attachments, events)
     * without the heavier finish operations (UI unlock - optional, auto-swipe, sound, save chat).
     * @param {number} messageId - The message ID to finalize.
     * @param {string} text - The message text.
     * @param {Object} options - Additional options for finalization.
     * @param {boolean} options.unlockUI - Whether to unlock the generation UI.
     */
    async finalizeIntermediaryMessage(messageId, text, { unlockUI = true }) {
        this.isFinalizing = true;
        void mountReactMainChatMessageListPanel();
        await this.onProgressStreaming(messageId, text, true);
        const messageElement = isReactMainChatOwner() ? null : state.chatElement.find(`.mes[mesid="${messageId}"]`);
        const message = state.chat[messageId];
        if (messageElement) {
            addCopyToCodeBlocks(messageElement);
        }

        await this.reasoningHandler.finish(messageId);

        if (Array.isArray(this.swipes) && this.swipes.length > 0) {
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
            const swipeInfoArray = Array(this.swipes.length).fill().map(() => structuredClone(swipeInfo));
            parseReasoningInSwipes(this.swipes, swipeInfoArray, message.extra?.reasoning_duration);
            message.swipes.push(...this.swipes);
            message.swipe_info.push(...swipeInfoArray);
        }

        syncMesToSwipe(messageId);
        saveLogprobsForActiveMessage(this.messageLogprobs.filter(Boolean), this.continueMessage);

        if (Array.isArray(this.images) && this.images.length > 0) {
            await processImageAttachment(message, { imageUrls: this.images });
            if (!isReactMainChatOwner()) {
                appendMediaToMessage(message, $(this.messageDom));
            } else {
                scheduleMainChatMessageListPanelRefresh();
            }
        }

        // Store reasoning signature for models that support multi-turn context
        if (this.reasoningSignature) {
            message.extra = message.extra || {};
            message.extra.reasoning_signature = this.reasoningSignature;
        }

        if (unlockUI) {
            this.markUIGenStopped();
        }

        if (this.type !== 'impersonate') {
            await eventSource.emit(event_types.MESSAGE_RECEIVED, this.messageId, this.type);
            await eventSource.emit(event_types.CHARACTER_MESSAGE_RENDERED, this.messageId, this.type);
        } else {
            await eventSource.emit(event_types.IMPERSONATE_READY, text);
        }

        updateSwipeCounter(messageId, { message, messageElement });
        this.isFinalizing = false;
        void mountReactMainChatMessageListPanel();
    }

    async onFinishStreaming(messageId, text) {
        await this.finalizeIntermediaryMessage(messageId, text, { unlockUI: true });

        const isAborted = this.abortController.signal.aborted;
        if (!isAborted && state.power_user.auto_swipe && generatedTextFiltered(text)) {
            return await swipe(null, SWIPE_DIRECTION.RIGHT, { source: SWIPE_SOURCE.AUTO_SWIPE, repeated: true, forceMesId: state.chat.length - 1 });
        }
        await saveChatConditional();

        playMessageSound();
    }

    async onErrorStreaming({ suppressRecovery = false } = {}) {
        this.isStopped = true;
        this.isFinalizing = false;

        if (this.messageId !== -1 && this.result) {
            await this.onProgressStreaming(this.messageId, this.continueMessage + this.result, true);
        }

        this.markUIGenStopped();
        if (suppressRecovery) {
            return;
        }

        showGenerationFailureRecovery(this.messageId);

        const noEmitTypes = ['swipe', 'impersonate', 'continue'];
        if (!noEmitTypes.includes(this.type)) {
            eventSource.emit(event_types.MESSAGE_RECEIVED, this.messageId, this.type);
            eventSource.emit(event_types.CHARACTER_MESSAGE_RENDERED, this.messageId, this.type);
        }
    }

    setFirstSwipe(messageId) {
        if (this.type !== 'swipe' && this.type !== 'impersonate') {
            if (Array.isArray(state.chat[messageId].swipes) && state.chat[messageId].swipes.length === 1 && state.chat[messageId].swipe_id === 0) {
                state.chat[messageId].swipes[0] = state.chat[messageId].mes;
                state.chat[messageId].swipe_info[0] = {
                    'send_date': state.chat[messageId].send_date,
                    'gen_started': state.chat[messageId].gen_started,
                    'gen_finished': state.chat[messageId].gen_finished,
                    'extra': structuredClone(state.chat[messageId].extra),
                };
            }
        }
    }

    onStopStreaming() {
        this.abortController.abort();
        this.isStopped = true;
        this.isFinalizing = false;
        this.isFinished = true;
        rememberMainChatStreamingTransportProcessorTerminal(this, 'stopped');
        void mountReactMainChatMessageListPanel();
    }

    /**
     * @returns {AsyncGenerator<{ text: string, swipes: string[], logprobs: import('./logprobs.js').TokenLogprobs, toolCalls: any[], state: any }, void, void>}
     */
    async* nullStreamingGeneration() {
        throw new Error('Generation function for streaming is not hooked up');
    }

    async generate() {
        if (this.messageId == -1) {
            this.messageId = await this.onStartStreaming(this.firstMessageText);
            await delay(1); // delay for message to be rendered
            state.scrollLock = false;
        }

        // Stopping strings are expensive to calculate, especially with macros enabled. To remove stopping strings
        // when streaming, we cache the result of getStoppingStrings instead of calling it once per token.
        const isImpersonate = this.type == 'impersonate';
        const isContinue = this.type == 'continue';
        this.stoppingStrings = getStoppingStrings(isImpersonate, isContinue, state.main_api);

        try {
            const sw = new state.Stopwatch(1000 / state.power_user.streaming_fps);
            const timestamps = [];
            for await (const { text, swipes, logprobs, toolCalls, state } of this.generator()) {
                const now = Date.now();
                timestamps.push(now);
                if (!this.timeToFirstToken) {
                    this.timeToFirstToken = now - this.createdAt.getTime();
                }
                if (this.isStopped || this.abortController.signal.aborted) {
                    return this.result;
                }

                this.toolCalls = toolCalls;
                this.result = text;
                this.swipes = Array.from(swipes ?? []);
                this.observedTokenCount += 1;
                this.observedChunkCount += 1;
                scheduleMainChatMessageListPanelRefresh();
                if (logprobs) {
                    this.messageLogprobs.push(...(Array.isArray(logprobs) ? logprobs : [logprobs]));
                }
                // Get the updated reasoning string into the handler
                this.reasoningHandler.updateReasoning(this.messageId, state?.reasoning);
                this.images = state?.images ?? [];
                this.reasoningSignature = state?.signature ?? null;
                await eventSource.emit(event_types.STREAM_TOKEN_RECEIVED, text);
                await sw.tick(async () => await this.onProgressStreaming(this.messageId, this.continueMessage + text));
            }
            const seconds = (timestamps[timestamps.length - 1] - timestamps[0]) / 1000;
            console.warn(`Stream stats: ${timestamps.length} tokens, ${seconds.toFixed(2)} seconds, rate: ${Number(timestamps.length / seconds).toFixed(2)} TPS`);
        } catch (err) {
            // in the case of a self-inflicted abort, we have already cleaned up
            if (!this.isFinished) {
                console.error(err);
                await this.onErrorStreaming({ suppressRecovery: this.suppressErrorRecovery });
            }
            return this.result;
        }

        this.isFinished = true;
        void mountReactMainChatMessageListPanel();
        return this.result;
    }
}

export async function executeGenerationRequestInShell(generationEnvelope) {
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
    } = options;
    console.log('Generate entered');
    setGenerationProgress(0);
    state.generation_started = new Date();

    // Prevent generation from shallow characters
    await unshallowCharacter(state.this_chid);

    // Occurs every time, even if the generation is aborted due to slash commands execution
    await eventSource.emit(event_types.GENERATION_STARTED, type, { automatic_trigger, force_name2, quiet_prompt, quietToLoud, skipWIAN, signal, quietImage }, dryRun);

    // Don't recreate abort controller if signal is passed
    if (!(state.abortController && signal)) {
        state.abortController = new AbortController();
    }

    // OpenAI doesn't need instruct mode. Use OAI main prompt instead.
    const isInstruct = state.power_user.instruct.enabled && state.main_api !== 'openai';
    const isImpersonate = type == 'impersonate';

    if (!(dryRun || depth || type == 'regenerate' || type == 'swipe' || type == 'quiet')) {
        const interruptedByCommand = await processCommands(String($('#send_textarea').val()));

        if (interruptedByCommand) {
            //$("#send_textarea").val('')[0].dispatchEvent(new Event('input', { bubbles:true }));
            unblockGeneration(type);
            return Promise.resolve();
        }
    }

    // Occurs only if the generation is not aborted due to slash commands execution
    await eventSource.emit(event_types.GENERATION_AFTER_COMMANDS, type, { automatic_trigger, force_name2, quiet_prompt, quietToLoud, skipWIAN, signal, quietImage }, dryRun);

    if (!dryRun) {
        // Ping server to make sure it is still alive
        const pingResult = await pingServer();

        if (!pingResult) {
            unblockGeneration(type);
            toastr.error(t`Verify that the server is running and accessible.`, t`ST Server cannot be reached`);
            throw new Error('Server unreachable');
        }

        // Hide swipes if not in a dry run.
        hideSwipeButtons();
        // If generated any message, set the flag to indicate it can't be recreated again.
        state.chat_metadata.tainted = true;
    }

    //#########QUIET PROMPT STUFF##############
    // process quiet prompt params
    if (quiet_prompt) {
        quiet_prompt = substituteParams(quiet_prompt);
    }

    const hasBackendConnection = state.online_status !== 'no_connection';

    // We can't do anything because we're not in a chat right now. (Unless it's a dry run, in which case we need to
    // assemble the prompt so we can count its tokens regardless of whether a chat is active.)
    if (!dryRun && !hasBackendConnection) {
        state.is_send_press = false;
        return Promise.resolve();
    }

    const lastMessage = state.chat[state.chat.length - 1];

    let textareaText;
    if (type !== 'regenerate' && type !== 'swipe' && type !== 'quiet' && !isImpersonate && !dryRun && !depth) {
        state.is_send_press = true;
        textareaText = String($('#send_textarea').val());
        $('#send_textarea').val('')[0].dispatchEvent(new Event('input', { bubbles: true }));
    } else {
        textareaText = '';
        if (state.chat.length && lastMessage.is_user) {
            //do nothing? why does this check exist?
        } else if (type !== 'quiet' && type !== 'swipe' && !isImpersonate && !dryRun && !depth && state.chat.length) {
            deleteItemizedPromptForMessage(state.chat.length - 1);
            state.chat.length = state.chat.length - 1;
            await removeLastMessage();
            await eventSource.emit(event_types.MESSAGE_DELETED, state.chat.length);
        }
    }

    const isContinue = type == 'continue';

    // Rewrite the generation timer to account for the time passed for all the continuations.
    if (isContinue && state.chat.length) {
        const prevFinished = lastMessage.gen_finished;
        const prevStarted = lastMessage.gen_started;

        if (prevFinished && prevStarted) {
            const timePassed = Number(prevFinished) - Number(prevStarted);
            state.generation_started = new Date(Date.now() - timePassed);
            lastMessage.gen_started = state.generation_started;
        }
    }

    if (!dryRun) {
        deactivateSendButtons();
    }

    let { messageBias, promptBias, isUserPromptBias } = getBiasStrings(textareaText, type);

    //*********************************
    //PRE FORMATING STRING
    //*********************************

    // These generation types should not attach pending files to the chat
    const noAttachTypes = [
        'regenerate',
        'swipe',
        'impersonate',
        'quiet',
        'continue',
    ];
    //for normal messages sent from user..
    if ((textareaText != '' || (hasPendingFileAttachment() && !noAttachTypes.includes(type))) && !automatic_trigger && type !== 'quiet' && !dryRun && !depth) {
        // If user message contains no text other than bias - send as a system message
        if (messageBias && !removeMacros(textareaText)) {
            sendSystemMessage(state.system_message_types.GENERIC, ' ', { bias: messageBias });
        } else {
            await sendMessageAsUser(textareaText, messageBias);
        }
    } else if (textareaText == '' && !automatic_trigger && !dryRun && [undefined, 'normal'].includes(type) && state.main_api == 'openai' && state.oai_settings.send_if_empty.trim().length > 0 && !depth) {
        // Use send_if_empty if set and the user message is empty. Only when sending messages normally
        await sendMessageAsUser(state.oai_settings.send_if_empty.trim(), messageBias);
    }

    let {
        description,
        personality,
        persona,
        scenario,
        mesExamples,
        system,
        jailbreak,
        charDepthPrompt,
        creatorNotes,
    } = getCharacterCardFields();

    // Depth prompt (character-specific A/N)
    removeDepthPrompts();
    const depthPromptText = charDepthPrompt || '';
    const depthPromptDepth = state.characters[state.this_chid]?.data?.extensions?.depth_prompt?.depth ?? state.depth_prompt_depth_default;
    const depthPromptRole = getExtensionPromptRoleByName(state.characters[state.this_chid]?.data?.extensions?.depth_prompt?.role ?? state.depth_prompt_role_default);
    setExtensionPrompt(inject_ids.DEPTH_PROMPT, depthPromptText, state.extension_prompt_types.IN_CHAT, depthPromptDepth, state.extension_settings.note.allowWIScan, depthPromptRole);

    // First message in fresh 1-on-1 chat reacts to user/character settings changes
    if (state.chat.length) {
        state.chat[0].mes = substituteParams(state.chat[0].mes);
    }

    // Collect messages with usable content
    const canUseTools = state.ToolManager.isToolCallingSupported();
    const canPerformToolCalls = !dryRun && state.ToolManager.canPerformToolCalls(type) && depth < state.ToolManager.RECURSE_LIMIT;
    let coreChat = state.chat.filter(x => !x.is_system || (canUseTools && Array.isArray(x.extra?.tool_invocations)));
    if (type === 'swipe') {
        coreChat.pop();
    }

    coreChat = await Promise.all(coreChat.map(async (/** @type {ChatMessage} */ chatItem, index) => {
        let message = chatItem.mes;
        let regexType = chatItem.is_user ? state.regex_placement.USER_INPUT : state.regex_placement.AI_OUTPUT;
        let options = { isPrompt: true, depth: (coreChat.length - index - (isContinue ? 2 : 1)) };

        let regexedMessage = getRegexedString(message, regexType, options);
        regexedMessage = await appendFileContent(chatItem, regexedMessage);

        const titles = [];
        if (chatItem?.extra?.append_title && chatItem?.extra?.title) {
            titles.push(chatItem.extra.title);
        }
        if (Array.isArray(chatItem?.extra?.media)) {
            for (const mediaItem of chatItem.extra.media) {
                if (mediaItem?.title && mediaItem?.append_title) {
                    titles.push(mediaItem.title);
                }
            }
        }
        if (titles.length > 0) {
            regexedMessage = `${regexedMessage}\n\n${titles.join('\n\n')}`;
        }

        return {
            ...chatItem,
            mes: regexedMessage,
            index,
        };
    }));

    const promptReasoning = new state.PromptReasoning();
    for (let i = coreChat.length - 1; i >= 0; i--) {
        const depth = coreChat.length - i - (isContinue ? 2 : 1);
        const isPrefix = isContinue && i === coreChat.length - 1;

        coreChat[i] = {
            ...coreChat[i],
            mes: promptReasoning.addToMessage(
                coreChat[i].mes,
                getRegexedString(
                    String(coreChat[i].extra?.reasoning ?? ''),
                    state.regex_placement.REASONING,
                    { isPrompt: true, depth: depth },
                ),
                isPrefix,
                coreChat[i].extra?.reasoning_duration,
            ),
        };
        if (promptReasoning.isLimitReached()) {
            break;
        }
    }

    // Determine token limit
    let this_max_context = getMaxPromptTokens();

    if (!dryRun) {
        console.debug('Running extension interceptors');
        const aborted = await runGenerationInterceptors(coreChat, this_max_context, type);

        if (aborted) {
            console.debug('Generation aborted by extension interceptors');
            unblockGeneration(type);
            return Promise.resolve();
        }
    } else {
        console.debug('Skipping extension interceptors for dry run');
    }

    // Fetches the combined prompt for both negative and positive prompts
    const cfgGuidanceScale = getGuidanceScale();
    const useCfgPrompt = cfgGuidanceScale && cfgGuidanceScale.value !== 1;

    // Adjust max context based on CFG prompt to prevent overfitting
    if (useCfgPrompt) {
        const negativePrompt = getCfgPrompt(cfgGuidanceScale, true, true)?.value || '';
        const positivePrompt = getCfgPrompt(cfgGuidanceScale, false, true)?.value || '';
        if (negativePrompt || positivePrompt) {
            const previousMaxContext = this_max_context;
            const [negativePromptTokenCount, positivePromptTokenCount] = await Promise.all([getTokenCountAsync(negativePrompt), getTokenCountAsync(positivePrompt)]);
            const decrement = Math.max(negativePromptTokenCount, positivePromptTokenCount);
            this_max_context -= decrement;
            console.log(`Max context reduced by ${decrement} tokens of CFG prompt (${previousMaxContext} -> ${this_max_context})`);
        }
    }

    console.log(`Core/all messages: ${coreChat.length}/${state.chat.length}`);

    if ((promptBias && !isUserPromptBias) || state.power_user.always_force_name2) {
        force_name2 = true;
    }

    if (isImpersonate) {
        force_name2 = false;
    }

    let mesExamplesArray = parseMesExamples(mesExamples, isInstruct);

    // Set non-WI AN
    setFloatingPrompt();

    // Add WI to prompt (and also inject WI to AN value via hijack)
    // Make quiet prompt available for WIAN
    setExtensionPrompt(inject_ids.QUIET_PROMPT, quiet_prompt || '', state.extension_prompt_types.IN_PROMPT, 0, true);
    const chatForWI = coreChat.map(x => world_info_include_names ? `${x.name}: ${x.mes}` : x.mes).reverse();
    /** @type {import('./world-info.js').WIGlobalScanData} */
    const globalScanData = {
        personaDescription: persona,
        characterDescription: description,
        characterPersonality: personality,
        characterDepthPrompt: charDepthPrompt,
        scenario: scenario,
        creatorNotes: creatorNotes,
        trigger: GENERATION_TYPE_TRIGGERS.includes(type) ? type : 'normal',
    };
    const { worldInfoString, worldInfoBefore, worldInfoAfter, worldInfoExamples, worldInfoDepth, outletEntries } = await getWorldInfoPrompt(chatForWI, this_max_context, dryRun, globalScanData);
    setExtensionPrompt(inject_ids.QUIET_PROMPT, '', state.extension_prompt_types.IN_PROMPT, 0, true);

    // Add message example WI
    for (const example of worldInfoExamples) {
        const exampleMessage = example.content;

        if (exampleMessage.length === 0) {
            continue;
        }

        const formattedExample = baseChatReplace(exampleMessage);
        const cleanedExample = parseMesExamples(formattedExample, isInstruct);

        // Insert depending on before or after position
        if (example.position === wi_anchor_position.before) {
            mesExamplesArray.unshift(...cleanedExample);
        } else {
            mesExamplesArray.push(...cleanedExample);
        }
    }

    // At this point, the raw message examples can be created
    const mesExamplesRawArray = [...mesExamplesArray];

    if (mesExamplesArray && isInstruct) {
        mesExamplesArray = formatInstructModeExamples(mesExamplesArray, state.name1, state.name2);
    }

    if (skipWIAN !== true) {
        console.log('skipWIAN not active, adding WIAN');
        // Add all depth WI entries to prompt
        flushWIInjections();
        if (Array.isArray(worldInfoDepth)) {
            worldInfoDepth.forEach((e) => {
                const joinedEntries = e.entries.join('\n');
                setExtensionPrompt(inject_ids.CUSTOM_WI_DEPTH_ROLE(e.depth, e.role), joinedEntries, state.extension_prompt_types.IN_CHAT, e.depth, false, e.role);
            });
        }
        if (outletEntries && typeof outletEntries === 'object' && Object.keys(outletEntries).length > 0) {
            Object.entries(outletEntries).forEach(([key, value]) => {
                setExtensionPrompt(inject_ids.CUSTOM_WI_OUTLET(key), value.join('\n'), state.extension_prompt_types.NONE, 0);
            });
        }
    } else {
        console.log('skipping WIAN');
    }

    // Add persona description to prompt
    addPersonaDescriptionExtensionPrompt();

    // Prepare the system prompt for Text Completion APIs
    if (state.main_api !== 'openai') {
        if (state.power_user.sysprompt.enabled) {
            system = state.power_user.prefer_character_prompt && system
                ? substituteParams(system, { original: state.power_user.sysprompt.content ?? '' })
                : baseChatReplace(state.power_user.sysprompt.content);
            system = isInstruct ? substituteParams(system, { original: state.power_user.sysprompt.content ?? '' }) : system;
        } else {
            // Nullify if it's not enabled
            system = '';
        }
    }

    // Collect before / after story string injections
    const beforeScenarioAnchor = await getExtensionPrompt(state.extension_prompt_types.BEFORE_PROMPT);
    const afterScenarioAnchor = await getExtensionPrompt(state.extension_prompt_types.IN_PROMPT);

    const storyStringParams = {
        description: description,
        personality: personality,
        persona: state.power_user.persona_description_position == state.persona_description_positions.IN_PROMPT ? persona : '',
        scenario: scenario,
        system: system,
        char: state.name2,
        user: state.name1,
        wiBefore: worldInfoBefore,
        wiAfter: worldInfoAfter,
        loreBefore: worldInfoBefore,
        loreAfter: worldInfoAfter,
        anchorBefore: beforeScenarioAnchor.trim(),
        anchorAfter: afterScenarioAnchor.trim(),
        mesExamples: mesExamplesArray.join(''),
        mesExamplesRaw: mesExamplesRawArray.join(''),
    };

    // Render the story string and combine with injections
    const storyString = renderStoryString(storyStringParams);
    let combinedStoryString = isInstruct ? formatInstructModeStoryString(storyString) : storyString;

    // Inject the story string as in-chat prompt (if needed)
    const applyStoryStringInject = state.main_api !== 'openai' && state.power_user.context.story_string_position === state.extension_prompt_types.IN_CHAT;
    if (applyStoryStringInject) {
        const depth = state.power_user.context.story_string_depth ?? 1;
        const role = state.power_user.context.story_string_role ?? state.extension_prompt_roles.SYSTEM;
        setExtensionPrompt(inject_ids.STORY_STRING, combinedStoryString, state.extension_prompt_types.IN_CHAT, depth, false, role);
        // Remove to prevent duplication
        combinedStoryString = '';
    } else {
        setExtensionPrompt(inject_ids.STORY_STRING, '', state.extension_prompt_types.IN_CHAT, 0);
    }

    // Story string rendered, safe to remove
    if (state.power_user.strip_examples) {
        mesExamplesArray = [];
    }

    // Inject all Depth prompts. Chat Completion does it separately
    let injectedIndices = [];
    if (state.main_api !== 'openai') {
        injectedIndices = await doChatInject(coreChat, isContinue);
    }

    if (state.main_api !== 'openai' && state.power_user.sysprompt.enabled) {
        jailbreak = state.power_user.prefer_character_jailbreak && jailbreak
            ? substituteParams(jailbreak, { original: state.power_user.sysprompt.post_history ?? '' })
            : baseChatReplace(state.power_user.sysprompt.post_history);

        // Only inject the jb if there is one
        if (jailbreak) {
            // When continuing generation of previous output, last user message precedes the message to continue
            if (isContinue) {
                coreChat.splice(coreChat.length - 1, 0, { mes: jailbreak, is_user: true });
            } else {
                // This operation will result in the injectedIndices indexes being off by one
                coreChat.push({ mes: jailbreak, is_user: true });
                // Add +1 to the elements to correct for the new PHI/Jailbreak message.
                injectedIndices.forEach(shiftUpByOne);
            }
        }
    }

    let chat2 = [];
    let continue_mag = '';
    let userMessageIndices = [];
    const lastUserMessageIndex = coreChat.findLastIndex(x => x.is_user);

    for (let i = coreChat.length - 1, j = 0; i >= 0; i--, j++) {
        if (state.main_api == 'openai') {
            chat2[i] = coreChat[j].mes;
            if (i === 0 && isContinue) {
                chat2[i] = chat2[i].slice(0, chat2[i].lastIndexOf(coreChat[j].mes) + coreChat[j].mes.length);
                continue_mag = coreChat[j].mes;
            }
            continue;
        }

        chat2[i] = formatMessageHistoryItem(coreChat[j], isInstruct, false);

        if (j === 0 && isInstruct) {
            // Reformat with the first output sequence (if any)
            chat2[i] = formatMessageHistoryItem(coreChat[j], isInstruct, state.force_output_sequence.FIRST);
        }

        if (lastUserMessageIndex >= 0 && j === lastUserMessageIndex && isInstruct && !isImpersonate) {
            // Reformat with the last input sequence (if any)
            chat2[i] = formatMessageHistoryItem(coreChat[j], isInstruct, state.force_output_sequence.LAST);
        }

        // Do not suffix the message for continuation
        if (i === 0 && isContinue) {
            // Pick something that's very unlikely to be in a message
            const FORMAT_TOKEN = '\u0000\ufffc\u0000\ufffd';

            if (isInstruct) {
                const originalMessage = String(coreChat[j].mes ?? '');
                coreChat[j].mes = originalMessage.replaceAll(FORMAT_TOKEN, '') + FORMAT_TOKEN;
                // Reformat with the last output sequence (if any)
                chat2[i] = formatMessageHistoryItem(coreChat[j], isInstruct, state.force_output_sequence.LAST);
                coreChat[j].mes = originalMessage;
            }

            chat2[i] = chat2[i].includes(FORMAT_TOKEN)
                ? chat2[i].slice(0, chat2[i].lastIndexOf(FORMAT_TOKEN))
                : chat2[i].slice(0, chat2[i].lastIndexOf(coreChat[j].mes) + coreChat[j].mes.length);
            continue_mag = coreChat[j].mes;
        }

        if (coreChat[j].is_user) {
            userMessageIndices.push(i);
        }
    }

    let addUserAlignment = isInstruct && state.power_user.instruct.user_alignment_message;
    let userAlignmentMessage = '';

    if (addUserAlignment) {
        const alignmentMessage = {
            name: state.name1,
            mes: substituteParams(state.power_user.instruct.user_alignment_message),
            is_user: true,
        };
        userAlignmentMessage = formatMessageHistoryItem(alignmentMessage, isInstruct, state.force_output_sequence.FIRST);
    }

    let oaiMessages = [];
    let oaiMessageExamples = [];

    if (state.main_api === 'openai') {
        oaiMessages = setOpenAIMessages(coreChat);
        oaiMessageExamples = setOpenAIMessageExamples(mesExamplesArray);
    }

    // hack for regeneration of the first message
    if (chat2.length == 0) {
        chat2.push('');
    }

    let examplesString = '';
    let chatString = addChatsSeparator('');
    let cyclePrompt = '';

    async function getMessagesTokenCount() {
        const encodeString = [
            combinedStoryString,
            examplesString,
            userAlignmentMessage,
            chatString,
            modifyLastPromptLine(''),
            cyclePrompt,
        ].join('').replace(/\r/gm, '');
        return getTokenCountAsync(encodeString, state.power_user.token_padding);
    }

    // Force pinned examples into the context
    let pinExmString;
    if (state.power_user.pin_examples) {
        pinExmString = examplesString = mesExamplesArray.join('');
    }

    // Only add the chat in context if past the greeting message
    if (isContinue && (chat2.length > 1 || state.main_api === 'openai')) {
        cyclePrompt = chat2.shift();
        // Adjust indices to account for the shift
        injectedIndices = injectedIndices.map(shiftDownByOne).filter(x => x >= 0);
        userMessageIndices = userMessageIndices.map(shiftDownByOne).filter(x => x >= 0);
    }

    // Collect enough messages to fill the context
    let arrMes = new Array(chat2.length);
    let tokenCount = await getMessagesTokenCount();
    let lastAddedIndex = 0;

    // Pre-allocate all injections first.
    // If it doesn't fit - user shot himself in the foot
    for (const index of injectedIndices) {
        // not needed for OAI prompting
        if (state.main_api == 'openai') {
            break;
        }

        const item = chat2[index];

        if (typeof item !== 'string') {
            continue;
        }

        tokenCount += await getTokenCountAsync(item.replace(/\r/gm, ''));
        if (tokenCount < this_max_context) {
            chatString = chatString + item;
            arrMes[index] = item;
            lastAddedIndex = Math.max(lastAddedIndex, index);
        } else {
            break;
        }
    }

    for (let i = 0; i < chat2.length; i++) {
        // not needed for OAI prompting
        if (state.main_api == 'openai') {
            break;
        }

        // Skip already injected messages
        if (arrMes[i] !== undefined) {
            continue;
        }

        const item = chat2[i];

        if (typeof item !== 'string') {
            continue;
        }

        tokenCount += await getTokenCountAsync(item.replace(/\r/gm, ''));
        if (tokenCount < this_max_context) {
            chatString = chatString + item;
            arrMes[i] = item;
            lastAddedIndex = Math.max(lastAddedIndex, i);
        } else {
            break;
        }
    }

    // Add user alignment message if last message is not a user message
    const stoppedAtUser = userMessageIndices.includes(lastAddedIndex);
    if (addUserAlignment && !stoppedAtUser) {
        tokenCount += await getTokenCountAsync(userAlignmentMessage.replace(/\r/gm, ''));
        chatString = userAlignmentMessage + chatString;
        arrMes.push(userAlignmentMessage);
        injectedIndices.push(arrMes.length - 1);
    }

    // Unsparse the array. Adjust injected indices
    const newArrMes = [];
    const newInjectedIndices = [];
    for (let i = 0; i < arrMes.length; i++) {
        if (arrMes[i] !== undefined) {
            newArrMes.push(arrMes[i]);
            if (injectedIndices.includes(i)) {
                newInjectedIndices.push(newArrMes.length - 1);
            }
        }
    }

    arrMes = newArrMes;
    injectedIndices = newInjectedIndices;

    if (state.main_api !== 'openai') {
        setInContextMessages(arrMes.length - injectedIndices.length, type);
    }

    // Estimate how many unpinned example messages fit in the context
    tokenCount = await getMessagesTokenCount();
    let count_exm_add = 0;
    if (!state.power_user.pin_examples) {
        for (let example of mesExamplesArray) {
            tokenCount += await getTokenCountAsync(example.replace(/\r/gm, ''));
            examplesString += example;
            if (tokenCount < this_max_context) {
                count_exm_add++;
            } else {
                break;
            }
        }
    }

    let mesSend = [];
    console.debug('calling runGenerate');

    if (isContinue) {
        // Coping mechanism for OAI spacing
        if (state.main_api === 'openai' && !cyclePrompt.endsWith(' ')) {
            cyclePrompt += state.oai_settings.continue_postfix;
            continue_mag += state.oai_settings.continue_postfix;
        }
    }

    const originalType = type;

    if (!dryRun) {
        state.is_send_press = true;
    }

    const existingMessageRecoveryBaseline = createExistingMessageRecoveryBaseline(type);
    const getGenerationAttemptBaseline = (messageId) => getLifecycleGenerationAttemptBaseline(messageId, existingMessageRecoveryBaseline);

    let generatedPromptCache = cyclePrompt || '';
    if (generatedPromptCache.length == 0 || type === 'continue') {
        console.debug('generating prompt');
        chatString = '';
        arrMes = arrMes.reverse();
        arrMes.forEach(function (item, i, arr) {
            // OAI doesn't need all of this
            if (state.main_api === 'openai') {
                return;
            }

            // Cohee: This removes a newline from the end of the last message in the context
            // Last prompt line will add a newline if it's not a continuation
            // In instruct mode it only removes it if wrap is enabled and it's not a quiet generation
            if (i === arrMes.length - 1 && type !== 'continue') {
                if (!isInstruct || (state.power_user.instruct.wrap && type !== 'quiet')) {
                    item = item.replace(/\n?$/, '');
                }
            }

            mesSend[mesSend.length] = { message: item, extensionPrompts: [] };
        });
    }

    let mesExmString = '';

    function setPromptString() {
        if (state.main_api == 'openai') {
            return;
        }

        console.debug('--setting Prompt string');
        mesExmString = pinExmString ?? mesExamplesArray.slice(0, count_exm_add).join('');

        if (mesSend.length) {
            mesSend[mesSend.length - 1].message = modifyLastPromptLine(mesSend[mesSend.length - 1].message);
        }
    }

    function modifyLastPromptLine(lastMesString) {
        //#########QUIET PROMPT STUFF PT2##############

        // Add quiet generation prompt at depth 0
        if (quiet_prompt && quiet_prompt.length) {
            // here name1 is forced for all quiet prompts..why?
            const name = state.name1;
            //checks if we are in instruct, if so, formats the chat as such, otherwise just adds the quiet prompt
            const quietAppend = isInstruct ? formatInstructModeChat(name, quiet_prompt, false, true, '', state.name1, state.name2, false) : `\n${quiet_prompt}`;

            //This begins to fix quietPrompts (particularly /sysgen) for instruct
            //previously instruct input sequence was being appended to the last chat message w/o '\n'
            //and no output sequence was added after the input's content.
            //TODO: respect output_sequence vs last_output_sequence settings
            //TODO: decide how to prompt this to clarify who is talking 'Narrator', 'System', etc.
            if (isInstruct) {
                lastMesString += quietAppend; // + power_user.instruct.output_sequence + '\n';
            } else {
                lastMesString += quietAppend;
            }


            // Ross: bailing out early prevents quiet prompts from respecting other instruct prompt toggles
            // for sysgen, SD, and summary this is desireable as it prevents the AI from responding as char..
            // but for idle prompting, we want the flexibility of the other prompt toggles, and to respect them as per settings in the extension
            // need a detection for what the quiet prompt is being asked for...

            // Bail out early?
            if (!isInstruct && !quietToLoud) {
                return lastMesString;
            }
        }


        // Get instruct mode line
        if (isInstruct && !isContinue) {
            const name = (quiet_prompt && !quietToLoud && !isImpersonate) ? (quietName ?? 'System') : (isImpersonate ? state.name1 : state.name2);
            const isQuiet = quiet_prompt && type == 'quiet';
            lastMesString += formatInstructModePrompt(name, isImpersonate, promptBias, state.name1, state.name2, isQuiet, quietToLoud);
        }

        // Get non-instruct impersonation line
        if (!isInstruct && isImpersonate && !isContinue) {
            const name = state.name1;
            if (!lastMesString.endsWith('\n')) {
                lastMesString += '\n';
            }
            lastMesString += name + ':';
        }

        // Add character's name
        // Force name append on continue (if not continuing on user message or first message)
        const isContinuingOnFirstMessage = state.chat.length === 1 && isContinue;
        if (!isInstruct && force_name2 && !isContinuingOnFirstMessage) {
            if (!lastMesString.endsWith('\n')) {
                lastMesString += '\n';
            }
            if (!isContinue || !(state.chat[state.chat.length - 1]?.is_user)) {
                lastMesString += `${state.name2}:`;
            }
        }

        return lastMesString;
    }

    async function checkPromptSize() {
        console.debug('---checking Prompt size');
        setPromptString();
        const jointMessages = mesSend.map((e) => `${e.extensionPrompts.join('')}${e.message}`).join('');
        const prompt = [
            combinedStoryString,
            mesExmString,
            addChatsSeparator(jointMessages),
            '\n',
            modifyLastPromptLine(''),
            generatedPromptCache,
        ].join('').replace(/\r/gm, '');
        let thisPromptContextSize = await getTokenCountAsync(prompt, state.power_user.token_padding);

        if (thisPromptContextSize > this_max_context) {        //if the prepared prompt is larger than the max context size...
            if (count_exm_add > 0) {                            // ..and we have example messages..
                count_exm_add--;                            // remove the example messages...
                await checkPromptSize();                            // and try agin...
            } else if (mesSend.length > 0) {                    // if the chat history is longer than 0
                mesSend.shift();                            // remove the first (oldest) chat entry..
                await checkPromptSize();                            // and check size again..
            } else {
                //end
                console.debug(`---mesSend.length = ${mesSend.length}`);
            }
        }
    }

    if (generatedPromptCache.length > 0 && state.main_api !== 'openai') {
        console.debug('---Generated Prompt Cache length: ' + generatedPromptCache.length);
        await checkPromptSize();
    } else {
        console.debug('---calling setPromptString ' + generatedPromptCache.length);
        setPromptString();
    }

    // For prompt bit itemization
    let mesSendString = '';

    async function getCombinedPrompt(isNegative) {
        // Only return if the guidance scale doesn't exist or the value is 1
        // Also don't return if constructing the neutral prompt
        if (isNegative && !useCfgPrompt) {
            return;
        }

        // OAI has its own prompt manager. No need to do anything here
        if (state.main_api === 'openai') {
            return '';
        }

        // Deep clone
        let finalMesSend = structuredClone(mesSend);

        if (useCfgPrompt) {
            const cfgPrompt = getCfgPrompt(cfgGuidanceScale, isNegative);
            if (cfgPrompt.value) {
                if (cfgPrompt.depth === 0) {
                    finalMesSend[finalMesSend.length - 1].message +=
                        /\s/.test(finalMesSend[finalMesSend.length - 1].message.slice(-1))
                            ? cfgPrompt.value
                            : ` ${cfgPrompt.value}`;
                } else {
                    // TODO: Make all extension prompts use an array/splice method
                    const lengthDiff = mesSend.length - cfgPrompt.depth;
                    const cfgDepth = lengthDiff >= 0 ? lengthDiff : 0;
                    const cfgMessage = finalMesSend[cfgDepth];
                    if (cfgMessage) {
                        if (!Array.isArray(finalMesSend[cfgDepth].extensionPrompts)) {
                            finalMesSend[cfgDepth].extensionPrompts = [];
                        }
                        finalMesSend[cfgDepth].extensionPrompts.push(`${cfgPrompt.value}\n`);
                    }
                }
            }
        }

        // Add prompt bias after everything else
        // Always run with continue
        if (!isInstruct && !isImpersonate) {
            if (promptBias.trim().length !== 0) {
                finalMesSend[finalMesSend.length - 1].message +=
                    /\s/.test(finalMesSend[finalMesSend.length - 1].message.slice(-1))
                        ? promptBias.trimStart()
                        : ` ${promptBias.trimStart()}`;
            }
        }

        // Flattens the multiple prompt objects to a string.
        const combine = () => {
            // Right now, everything is suffixed with a newline
            mesSendString = finalMesSend.map((e) => `${e.extensionPrompts.join('')}${e.message}`).join('');

            // add a custom dingus (if defined)
            mesSendString = addChatsSeparator(mesSendString);


            let combinedPrompt = [
                combinedStoryString,
                mesExmString,
                mesSendString,
                generatedPromptCache,
            ].join('').replace(/\r/gm, '');

            if (state.power_user.collapse_newlines) {
                combinedPrompt = collapseNewlines(combinedPrompt);
            }

            return combinedPrompt;
        };

        finalMesSend.forEach((item, i) => {
            item.injected = injectedIndices.includes(finalMesSend.length - i - 1);
        });

        let data = {
            api: state.main_api,
            combinedPrompt: null,
            description,
            personality,
            persona,
            scenario,
            char: state.name2,
            user: state.name1,
            worldInfoBefore,
            worldInfoAfter,
            beforeScenarioAnchor,
            afterScenarioAnchor,
            storyString,
            mesExmString,
            mesSendString,
            finalMesSend,
            generatedPromptCache,
            main: system,
            jailbreak,
        };

        // Before returning the combined prompt, give available context related information to all subscribers.
        await eventSource.emit(event_types.GENERATE_BEFORE_COMBINE_PROMPTS, data);

        // If one or multiple subscribers return a value, forfeit the responsibillity of flattening the context.
        return !data.combinedPrompt ? combine() : data.combinedPrompt;
    }

    let finalPrompt = await getCombinedPrompt(false);

    const eventData = { prompt: finalPrompt, dryRun: dryRun };
    await eventSource.emit(event_types.GENERATE_AFTER_COMBINE_PROMPTS, eventData);
    finalPrompt = eventData.prompt;

    let thisPromptBits = [];

    let generate_data;
    switch (state.main_api) {
        case 'openai': {
            let [prompt, counts] = await prepareOpenAIMessages({
                name2: state.name2,
                charDescription: description,
                charPersonality: personality,
                scenario: scenario,
                worldInfoBefore: worldInfoBefore,
                worldInfoAfter: worldInfoAfter,
                extensionPrompts: state.extension_prompts,
                bias: promptBias,
                type: type,
                quietPrompt: quiet_prompt,
                quietImage: quietImage,
                cyclePrompt: cyclePrompt,
                systemPromptOverride: system,
                jailbreakPromptOverride: jailbreak,
                messages: oaiMessages,
                messageExamples: oaiMessageExamples,
            }, dryRun);
            generate_data = { prompt: prompt };

            // TODO: move these side-effects somewhere else, so this switch-case solely sets generate_data
            // counts will return false if the user has not enabled the token breakdown feature
            if (counts) {
                parseTokenCounts(counts, thisPromptBits);
            }

            if (!dryRun) {
                setInContextMessages(state.openai_messages_count, type);
            }
            break;
        }
    }

    await eventSource.emit(event_types.GENERATE_AFTER_DATA, generate_data, dryRun);

    if (dryRun) {
        return Promise.resolve();
    }

    /**
     * Saves itemized prompt bits and calls streaming or non-streaming generation API.
     * @returns {Promise<void|*|Awaited<*>|String|{fromStream}|string|undefined|Object>}
     * @throws {Error|object} Error with message text, or Error with response JSON
     */
    let activeRecoveryMessageId = null;

    async function finishGenerating() {
        if (state.power_user.console_log_prompts) {
            console.log(generate_data.prompt);
        }

        console.debug('rungenerate calling API');

        showStopButton();

        //set array object for prompt token itemization of this message
        let currentArrayEntry = Number(thisPromptBits.length - 1);
        let additionalPromptStuff = {
            ...thisPromptBits[currentArrayEntry],
            rawPrompt: generate_data.prompt || generate_data.input,
            mesId: getNextMessageId(type),
            allAnchors: await getAllExtensionPrompts(),
            chatInjects: injectedIndices?.map(index => arrMes[arrMes.length - index - 1])?.join('') || '',
            summarizeString: (state.extension_prompts['1_memory']?.value || ''),
            authorsNoteString: (state.extension_prompts['2_floating_prompt']?.value || ''),
            smartContextString: (state.extension_prompts.chromadb?.value || ''),
            chatVectorsString: (state.extension_prompts['3_vectors']?.value || ''),
            dataBankVectorsString: (state.extension_prompts['4_vectors_data_bank']?.value || ''),
            worldInfoString: worldInfoString,
            storyString: storyString,
            beforeScenarioAnchor: beforeScenarioAnchor,
            afterScenarioAnchor: afterScenarioAnchor,
            examplesString: examplesString,
            mesSendString: mesSendString,
            generatedPromptCache: generatedPromptCache,
            promptBias: promptBias,
            finalPrompt: finalPrompt,
            charDescription: description,
            charPersonality: personality,
            scenarioText: scenario,
            this_max_context: this_max_context,
            padding: state.power_user.token_padding,
            main_api: state.main_api,
            instruction: state.main_api !== 'openai' && state.power_user.sysprompt.enabled ? substituteParams(state.power_user.prefer_character_prompt && system ? system : state.power_user.sysprompt.content) : '',
            userPersona: (state.power_user.persona_description_position == state.persona_description_positions.IN_PROMPT ? (persona || '') : ''),
            tokenizer: getFriendlyTokenizerName(state.main_api).tokenizerName || '',
            presetName: getPresetManager()?.getSelectedPresetName() || '',
            messagesCount: state.main_api !== 'openai' ? mesSend.length : oaiMessages.length,
            examplesCount: state.main_api !== 'openai' ? (pinExmString ? mesExamplesArray.length : count_exm_add) : oaiMessageExamples.length,
        };

        //console.log(additionalPromptStuff);
        const itemizedIndex = state.itemizedPrompts.findIndex((item) => item.mesId === additionalPromptStuff.mesId);

        if (itemizedIndex !== -1) {
            state.itemizedPrompts[itemizedIndex] = additionalPromptStuff;
        } else {
            state.itemizedPrompts.push(additionalPromptStuff);
        }

        console.debug(`pushed prompt bits to itemizedPrompts array. Length is now: ${state.itemizedPrompts.length}`);

        const lifecyclePlan = createGenerationCommandPlan(generationEnvelope.command, {
            fallbackReady: hasFallbackProviderForGeneration({
                settings: state.oai_settings,
                secretState: state.secret_state,
                fallbackSecretKey: state.SECRET_KEYS.OPENAI_FALLBACK,
            }),
            statusLabels: getGenerationLifecycleStatusLabels(),
        });
        const { shouldAutoRecover, attempts } = lifecyclePlan;
        const createEmptyReplyFailure = (messageId = null) => {
            const error = new Error('empty reply');
            error.emptyReply = true;
            error.messageId = messageId;
            return error;
        };

        const isEmptyGenerationResult = (result) => {
            if (jsonSchema) {
                return false;
            }

            if (result?.fromStream) {
                return String(result ?? '').trim().length === 0;
            }

            const text = cleanUpMessage({
                getMessage: extractMessageFromData(result),
                isImpersonate: isImpersonate,
                isContinue: isContinue,
                displayIncompleteSentences: false,
            });
            return String(text ?? '').trim().length === 0;
        };

        const ensureRecoveryMessage = async (candidateMessageId = null) => {
            if (isAssistantRecoveryMessageId(candidateMessageId)) {
                activeRecoveryMessageId = candidateMessageId;
                return activeRecoveryMessageId;
            }

            if (isAssistantRecoveryMessageId(activeRecoveryMessageId)) {
                return activeRecoveryMessageId;
            }

            await saveReply({ type, getMessage: '', fromStreaming: true });
            activeRecoveryMessageId = state.chat.length - 1;
            return activeRecoveryMessageId;
        };

        const runGenerationAttempt = async (attempt, attemptIndex) => {
            const isIntermediateAttempt = attemptIndex < attempts.length - 1;
            const requestOptions = {
                jsonSchema,
                fallbackProvider: attempt.fallbackProvider,
            };

            if (isStreamingEnabled() && type !== 'quiet') {
                const attemptContinueMessage = promptReasoning.removePrefix(continue_mag);
                state.streamingProcessor = new GenerationStreamSession(type, force_name2, state.generation_started, attemptContinueMessage, promptReasoning);
                state.streamingProcessor.suppressErrorRecovery = isIntermediateAttempt;
                state.streamingProcessor.fromFallbackAttempt = Boolean(attempt.fallbackProvider);
                if (activeRecoveryMessageId !== null && activeRecoveryMessageId >= 0) {
                    state.streamingProcessor.messageId = activeRecoveryMessageId;
                }
                if (isContinue) {
                    // Save reply does add cycle text to the prompt, so it's not needed here
                    state.streamingProcessor.firstMessageText = '';
                }

                state.streamingProcessor.generator = await sendStreamingRequest(type, generate_data, requestOptions);

                hideSwipeButtons();
                let getMessage = await state.streamingProcessor.generate();
                if (state.streamingProcessor.abortController.signal.aborted && state.streamingProcessor.isFinished) {
                    throw new Error('Generation was aborted.');
                }
                let messageChunk = cleanUpMessage({
                    getMessage: getMessage,
                    isImpersonate: isImpersonate,
                    isContinue: isContinue,
                    displayIncompleteSentences: false,
                });

                if (isContinue) {
                    getMessage = attemptContinueMessage + getMessage;
                }

                const isStreamFinished = state.streamingProcessor && !state.streamingProcessor.isStopped && state.streamingProcessor.isFinished;
                const isStreamWithToolCalls = state.streamingProcessor && Array.isArray(state.streamingProcessor.toolCalls) && state.streamingProcessor.toolCalls.length;
                if (canPerformToolCalls && isStreamFinished && isStreamWithToolCalls) {
                    const lastMessage = state.chat[state.chat.length - 1];
                    const hasToolCalls = state.ToolManager.hasToolCalls(state.streamingProcessor.toolCalls);
                    const shouldDeleteMessage = type !== 'swipe' && ['', '...'].includes(lastMessage?.mes) && !lastMessage?.extra?.reasoning && ['', '...'].includes(state.streamingProcessor?.result);
                    hasToolCalls && shouldDeleteMessage && await deleteLastMessage();
                    if (hasToolCalls && !shouldDeleteMessage) {
                        await state.streamingProcessor.finalizeIntermediaryMessage(state.streamingProcessor.messageId, getMessage, { unlockUI: false });
                    }
                    const invocationResult = await state.ToolManager.invokeFunctionTools(state.streamingProcessor.toolCalls, {
                        reasoningText: state.streamingProcessor.reasoningHandler.reasoning,
                    });
                    const shouldStopGeneration = (!invocationResult.invocations.length && shouldDeleteMessage) || invocationResult.stealthCalls.length;
                    if (hasToolCalls) {
                        if (shouldStopGeneration) {
                            if (Array.isArray(invocationResult.errors) && invocationResult.errors.length) {
                                state.ToolManager.showToolCallError(invocationResult.errors);
                            }
                            unblockGeneration(type);
                            state.streamingProcessor = null;
                            return;
                        }

                        state.streamingProcessor = null;
                        depth = depth + 1;
                        await state.ToolManager.saveFunctionToolInvocations(invocationResult.invocations);
                        return Generate('normal', { automatic_trigger, force_name2, quiet_prompt, quietToLoud, skipWIAN, signal, quietImage, quietName, depth }, dryRun);
                    }
                }

                if (isStreamFinished) {
                    const finishedMessageId = state.streamingProcessor.messageId;
                    if (!String(messageChunk ?? '').trim()) {
                        state.streamingProcessor = null;
                        throw createEmptyReplyFailure(finishedMessageId);
                    }

                    await state.streamingProcessor.onFinishStreaming(finishedMessageId, getMessage);
                    rememberMainChatStreamingTransportProcessorTerminal(state.streamingProcessor, 'completed');
                    scheduleMainChatMessageListPanelRefresh();
                    state.streamingProcessor = null;
                    clearGenerationAutoRecoveryStatus(finishedMessageId);
                    triggerAutoContinue(messageChunk, isImpersonate);
                    return Object.defineProperties(new String(getMessage), {
                        'messageChunk': { value: messageChunk },
                        'fromStream': { value: true },
                    });
                }

                const failedMessageId = state.streamingProcessor?.messageId;
                state.streamingProcessor = null;
                const streamError = new Error('stream connection closed before completion');
                streamError.messageId = failedMessageId;
                throw streamError;
            }

            const result = await sendGenerationRequest(type, generate_data, requestOptions);
            if (isEmptyGenerationResult(result)) {
                throw createEmptyReplyFailure(activeRecoveryMessageId);
            }
            return result;
        };

        const prepareRetryAttempt = async (attempt, attemptIndex) => {
            if (attemptIndex <= 0) {
                return;
            }

            await ensureRecoveryMessage(activeRecoveryMessageId);

            const retryBaseline = getGenerationAttemptBaseline(activeRecoveryMessageId);
            clearGenerationAttemptMessage(activeRecoveryMessageId, retryBaseline);
            prepareGenerationRetrySwipe(activeRecoveryMessageId, retryBaseline);
            showGenerationAutoRecoveryStatus(activeRecoveryMessageId, attempt.status, attempt.label === 'fallback' ? 'fallback' : 'primary');
            deactivateSendButtons();
            showStopButton();
        };

        const handleAttemptFailure = async (exception, attempt, attemptIndex) => {
            const isIntermediateAttempt = attemptIndex < attempts.length - 1;
            const candidateRecoveryMessageId = exception?.messageId ?? state.streamingProcessor?.messageId ?? activeRecoveryMessageId;
            const failureDecision = getGenerationFailureDecision({
                shouldAutoRecover,
                failure: exception,
                isIntermediateAttempt,
            });
            state.streamingProcessor = null;

            if (failureDecision.action !== 'retry') {
                if (failureDecision.shouldRestoreAttemptMessage) {
                    await ensureRecoveryMessage(candidateRecoveryMessageId);
                    clearGenerationAttemptMessage(activeRecoveryMessageId, getGenerationAttemptBaseline(activeRecoveryMessageId));
                } else if (isAssistantRecoveryMessageId(candidateRecoveryMessageId)) {
                    activeRecoveryMessageId = candidateRecoveryMessageId;
                }
                clearGenerationAutoRecoveryStatus(activeRecoveryMessageId);
                if (failureDecision.shouldShowFailureRecovery && isAssistantRecoveryMessageId(activeRecoveryMessageId)) {
                    showGenerationFailureRecovery(activeRecoveryMessageId);
                }
                return {
                    action: 'throw',
                    exception,
                    attempt,
                };
            }

            await ensureRecoveryMessage(candidateRecoveryMessageId);
            clearGenerationAttemptMessage(activeRecoveryMessageId, getGenerationAttemptBaseline(activeRecoveryMessageId));
            return {
                action: 'retry',
                exception,
                attempt,
            };
        };

        return executeGenerationAttempts({
            attempts,
            prepareRetryAttempt,
            runAttempt: async (attempt, attemptIndex) => {
                const result = await runGenerationAttempt(attempt, attemptIndex);
                clearGenerationAutoRecoveryStatus(activeRecoveryMessageId ?? state.chat.length - 1);
                return result;
            },
            handleFailure: handleAttemptFailure,
        });
    }

    try {
        const generationResult = await finishGenerating();
        return await onSuccess(generationResult);
    } catch (exception) {
        return onError(exception);
    }

    /**
     * Handles the successful response from the generation API.
     * @param data
     * @returns {Promise<String|{fromStream}|*|string|string|void|Awaited<*>|undefined>}
     * @throws {Error} Throws an error if the response data contains an error message
     */
    async function onSuccess(data) {
        if (!data) return;

        if (data?.fromStream) {
            return data;
        }

        let messageChunk = '';

        // if an error was returned in data, show it and throw it
        if (data.error) {
            unblockGeneration(type);

            if (data?.response) {
                toastr.error(data.response, t`API Error`, { preventDuplicates: true });
            }
            throw new Error(data?.response);
        }

        if (jsonSchema) {
            unblockGeneration(type);
            return extractJsonFromData(data, { returnInvalidJson: jsonSchema.returnInvalid ?? false });
        }

        //const getData = await response.json();
        let getMessage = extractMessageFromData(data);
        let title = extractTitleFromData(data);
        let reasoning = extractReasoningFromData(data);
        let imageUrls = extractImagesFromData(data);
        const reasoningSignature = extractReasoningSignatureFromData(data);

        const swipes = extractMultiSwipes(data, type);

        messageChunk = cleanUpMessage({
            getMessage: getMessage,
            isImpersonate: isImpersonate,
            isContinue: isContinue,
            displayIncompleteSentences: false,
        });


        reasoning = getRegexedString(reasoning, state.regex_placement.REASONING);

        if (state.power_user.trim_spaces) {
            reasoning = reasoning.trim();
        }

        if (isContinue) {
            continue_mag = promptReasoning.removePrefix(continue_mag);
            getMessage = continue_mag + getMessage;
        }

        //Formating
        const displayIncomplete = type === 'quiet' && !quietToLoud;
        getMessage = cleanUpMessage({
            getMessage: getMessage,
            isImpersonate: isImpersonate,
            isContinue: isContinue,
            displayIncompleteSentences: displayIncomplete,
        });

        if (isImpersonate) {
            $('#send_textarea').val(getMessage)[0].dispatchEvent(new Event('input', { bubbles: true }));
            await eventSource.emit(event_types.IMPERSONATE_READY, getMessage);
        } else if (type == 'quiet') {
            unblockGeneration(type);
            return getMessage;
        } else {
            // Without streaming we'll be having a full message on continuation. Treat it as a last chunk.
            const finalization = getGenerationSuccessFinalization({
                hasActiveRecoveryMessage: isAssistantRecoveryMessageId(activeRecoveryMessageId),
                originalType,
                type,
            });
            if (finalization.action === 'replace_recovery_message') {
                const recoveryBaseline = getGenerationAttemptBaseline(activeRecoveryMessageId);
                ({ type, getMessage } = await replaceAssistantRecoveryMessage(activeRecoveryMessageId, {
                    type,
                    getMessage,
                    title,
                    swipes,
                    reasoning,
                    imageUrls,
                    reasoningSignature,
                    recoverySwipeId: recoveryBaseline?.recoverySwipeId,
                }));
                clearGenerationAutoRecoveryStatus(activeRecoveryMessageId);
            } else {
                ({ type, getMessage } = await saveReply({ type: finalization.type, getMessage, title, swipes, reasoning, imageUrls, reasoningSignature }));
            }

            // This relies on `saveReply` having been called to add the message to the chat, so it must be last.
            parseAndSaveLogprobs(data, continue_mag);
        }

        if (canPerformToolCalls) {
            const hasToolCalls = state.ToolManager.hasToolCalls(data);
            const shouldDeleteMessage = type !== 'swipe' && ['', '...'].includes(getMessage) && !reasoning;
            hasToolCalls && shouldDeleteMessage && await deleteLastMessage();
            const invocationResult = await state.ToolManager.invokeFunctionTools(data, { reasoningText: reasoning });
            const shouldStopGeneration = (!invocationResult.invocations.length && shouldDeleteMessage) || invocationResult.stealthCalls.length;
            if (hasToolCalls) {
                if (shouldStopGeneration) {
                    if (Array.isArray(invocationResult.errors) && invocationResult.errors.length) {
                        state.ToolManager.showToolCallError(invocationResult.errors);
                    }
                    unblockGeneration(type);
                    return;
                }

                depth = depth + 1;
                await state.ToolManager.saveFunctionToolInvocations(invocationResult.invocations);
                return Generate('normal', { automatic_trigger, force_name2, quiet_prompt, quietToLoud, skipWIAN, signal, quietImage, quietName, depth }, dryRun);
            }
        }

        if (type !== 'quiet') {
            playMessageSound();
        }

        const isAborted = state.abortController && state.abortController.signal.aborted;
        if (!isAborted && state.power_user.auto_swipe && generatedTextFiltered(getMessage)) {
            state.is_send_press = false;
            return await swipe(null, SWIPE_DIRECTION.RIGHT, { source: SWIPE_SOURCE.AUTO_SWIPE, repeated: true, forceMesId: state.chat.length - 1 });
        }

        console.debug('/api/chats/save called by /Generate');
        await saveChatConditional();
        unblockGeneration(type);
        state.streamingProcessor = null;

        if (type !== 'quiet') {
            triggerAutoContinue(messageChunk, isImpersonate);
        }

        // Don't break the API chain that expects a single string in return
        return Object.defineProperty(new String(getMessage), 'messageChunk', { value: messageChunk });
    }

    /**
     * Exception handler for finishGenerating
     * @param {Error|object} exception Error or response JSON
     * @throws {Error|object} Re-throws the exception
     */
    function onError(exception) {
        // if the response JSON was thrown, show the error message
        if (typeof exception?.error?.message === 'string') {
            toastr.error(exception.error.message, t`Text generation error`, { timeOut: 10000, extendedTimeOut: 20000 });
        }

        unblockGeneration(type);
        console.log(exception);
        state.streamingProcessor = null;
        throw exception;
    }
}
//MARK: Generate() ends

/**
 * Handles the swipe event.
 * @param {SwipeEvent} event Event.
 * @param {SWIPE_DIRECTION} direction The direction to swipe.
 * @param {object} params Additional parameters.
 * @param {import('./constants.js').SWIPE_SOURCE} [params.source]  The source of the swipe event.
 * @param {boolean} [params.repeated] Is the swipe event repeated.
 * @param {ChatMessage} [params.message=chat[chat.length - 1]] The chat message to swipe.
 * @param {number} [params.forceMesId] The message id to swipe.
 * @param {number} [params.forceSwipeId] The target swipe_id. When out of range, it will be looped or clamped.
 * @param {number} [params.forceDuration] Overwrites the default swipe duration.
 */
export async function swipe(event, direction, {
    source,
    repeated,
    message = state.chat[state.chat.length - 1],
    forceMesId,
    forceSwipeId,
    forceDuration,
} = {}) {
    if (state.chat.length === 0) {
        console.warn('Swipe was called on an empty chat.');
        return;
    }

    let messageIndex;

    //Only set messageIndex if message exists because -1 is truthy.
    if (message) {
        messageIndex = state.chat.indexOf(message);
        if (messageIndex === -1 && typeof (forceMesId) != 'number') {
            console.error(`The message must exist in chat. ${message};`);
            return;
        }
    }

    const mesId = Number(
        forceMesId
        ?? messageIndex
        ?? (isReactMainChatOwner() ? NaN : event?.currentTarget?.closest('.mes')?.getAttribute('mesid'))
        ?? state.chat.length - 1,
    );

    if (isReactMainChatOwner()) {
        return runReactMainChatSwipe();
    }

    async function runReactMainChatSwipe() {
        const targetMessage = state.chat[mesId];
        if (!Number.isInteger(mesId) || mesId < 0 || !targetMessage) {
            return;
        }

        const bypassSwipeChecks = [
            SWIPE_SOURCE.DELETE,
            SWIPE_SOURCE.BACK,
            SWIPE_SOURCE.AUTO_SWIPE,
            SWIPE_SOURCE.SLASH_COMMAND,
            SWIPE_SOURCE.SWIPE_PICKER,
        ].includes(source);

        if (!bypassSwipeChecks) {
            if (isGenerating() && state.swipes && !state.swipesHidden && state.swipeState === SWIPE_STATE.NONE) {
                toastr.warning(t`Cannot swipe while generating. Stop the request and try again.`, t`Swipe aborted`);
                return;
            }
            if (!isSwipingAllowed() || !isMessageSwipeable(mesId, targetMessage)) {
                return;
            }
        }

        cancelDebouncedChatSave();
        ensureSwipes(targetMessage);
        syncMesToSwipe(mesId);

        const originalSwipeId = Number(targetMessage.swipe_id ?? 0);
        let newSwipeId = Number(forceSwipeId ?? originalSwipeId);
        const isRight = direction === SWIPE_DIRECTION.RIGHT;

        if (forceSwipeId == null) {
            newSwipeId += isRight ? 1 : -1;
        }

        if (!isRight && newSwipeId < 0) {
            newSwipeId = Math.max(0, targetMessage.swipes.length - 1);
        }

        if (isRight && newSwipeId >= targetMessage.swipes.length) {
            newSwipeId = targetMessage.swipes.length;
            targetMessage.swipe_id = newSwipeId;

            const overswipe = getOverswipeBehavior(mesId, targetMessage);
            if (overswipe === OVERSWIPE_BEHAVIOR.NONE) {
                targetMessage.swipe_id = originalSwipeId;
                showSwipeButtons();
                return;
            }
            if (overswipe === OVERSWIPE_BEHAVIOR.REGENERATE) {
                clearMessageData(targetMessage);
                await eventSource.emit(event_types.MESSAGE_SWIPED, mesId);
                if (!state.is_send_press) {
                    state.is_send_press = true;
                    return Generate('swipe');
                }
                return;
            }
            if (overswipe === OVERSWIPE_BEHAVIOR.LOOP || overswipe === OVERSWIPE_BEHAVIOR.PRISTINE_GREETING) {
                newSwipeId = 0;
            }
        }

        if (newSwipeId < 0 || newSwipeId >= targetMessage.swipes.length) {
            targetMessage.swipe_id = originalSwipeId;
            showSwipeButtons();
            return;
        }

        if (!syncSwipeToMes(mesId, newSwipeId, targetMessage)) {
            targetMessage.swipe_id = originalSwipeId;
            showSwipeButtons();
            return;
        }

        await eventSource.emit(event_types.MESSAGE_SWIPED, mesId);
        if (source !== SWIPE_SOURCE.BACK) {
            saveChatDebounced();
        }
        showSwipeButtons();
        void mountReactMainChatMessageListPanel();
    }

    if ([SWIPE_SOURCE.DELETE, SWIPE_SOURCE.BACK, SWIPE_SOURCE.AUTO_SWIPE, SWIPE_SOURCE.SLASH_COMMAND, SWIPE_SOURCE.SWIPE_PICKER].includes(source)) {
        console.info(`The ${direction} swipe source on message #${mesId} is ${source}, Most checks have been bypassed. `);
    } else {
        //Only show an error if swipes are not hidden and a message is generating.
        if (isGenerating() && (state.swipes && !state.swipesHidden && (state.swipeState === SWIPE_STATE.NONE))) {
            toastr.warning(t`Cannot swipe while generating. Stop the request and try again.`, t`Swipe aborted`);
            return;
        }
        //Only allow one concurrent swipe.
        if (!isSwipingAllowed()) {
            console.info('The swipe has been ignored messages cannot currently be swiped.');
            return;
        }
        if (!isMessageSwipeable(mesId, message)) {
            console.info(`Message #${mesId} cannot be swiped. ${message}`);
            return;
        }
    }

    // Cancel pending save to prevent accidental swipe_id overwrites.
    cancelDebouncedChatSave();

    state.swipeState = SWIPE_STATE.SWIPING;
    let generation;

    const thisMesDiv = state.chatElement.children('.mes').filter(`[mesid="${mesId}"]`);
    const thisMesText = thisMesDiv.find('.mes_block .mes_text');
    const thisMesDivHeight = thisMesDiv[0]?.scrollHeight;
    const thisMesTextHeight = thisMesText[0]?.scrollHeight;
    if (![thisMesDiv.length, thisMesText.length].every(num => num > 0)) {
        console.error(`Message #${mesId}'s DOM element is not valid.`);
        return;
    }
    const originalSwipeId = Number(state.chat[mesId]?.swipe_id ?? 0);
    let newSwipeId = Number(forceSwipeId ?? originalSwipeId);

    /**
     * Calculates the next swipe duration with how many swipes have been repeated.
     * @param {number} animation_duration
     * @returns {number} The adjusted swipe duration.
     */
    function getSwipeDuration(animation_duration) {
        const now = performance.now();
        const resetTime = state.animation_duration * 2 + 300;

        //Reset the counter if the last swipe was more than half a second ago.
        if (now - state.lastSwipeInfo.now >= resetTime || direction !== state.lastSwipeInfo.direction) state.recentSwipes = 0;
        state.recentSwipes++;
        state.lastSwipeInfo = { now, direction };

        //At 4 swipes, animation_duration will be halved.
        const sigmoid = 1 / (1 + Math.exp(state.recentSwipes - 4));

        return state.animation_duration * sigmoid;
    }

    const swipeDuration = forceDuration ?? getSwipeDuration(state.animation_duration);

    //The offscreen messages may be visible if the user resizes the viewport during a swipe.
    const thisMesDivWidth = thisMesDiv.width() + 30;
    let swipeRange = (direction === SWIPE_DIRECTION.RIGHT) ? -thisMesDivWidth : thisMesDivWidth;

    /**
     * Waits for the generation to end, reverts the swipe if swipe_id has not changed.
     * @param {boolean} revert Attept to revert the swipe without saving.
     */
    async function endSwipe(revert = false) {
        //Wait for the generation to end.
        try {
            //`mes_buttons` need to be hidden until the animation completes.
            if (generation) {
                document.body.dataset.swiping = 'true';
                await generation;
            }
        } catch (error) {
            console.warn(`Swipe failed, Swiping back. ${error}`);
        }

        //Clamp Id between swipes.
        let clampedId = clamp(state.chat[mesId].swipe_id, 0, Math.max(0, state.chat[mesId].swipes.length - 1));

        await updateSwipeCounter(mesId);
        //Fallback.
        if (mesId != state.chat.length - 1) {
            await updateSwipeCounter(state.chat.length - 1);
        }

        // If swipe_id has not changed, give the user feedback.
        if (clampedId == originalSwipeId && source != SWIPE_SOURCE.DELETE) {
            try {
                //Shake 700/140=5px
                shakeElement(thisMesDiv, -swipeRange / 140, state.animation_duration, 'ease-in');
                //Flash red.
                const flashTime = Math.max(state.animation_duration * 2, 100);
                await Promise.race([thisMesDiv.find('.swipes-counter').animate({ color: 'red' }, flashTime).animate({ color: '' }).promise(), createTimeout(flashTime * 4, `The shake animation did not end within ${flashTime * 4}ms`)].filter(Boolean));
            } catch (error) {
                console.warn(error);
            }
        }

        //If the id is not within bounds, Swipe back.
        if (state.chat[mesId]?.swipe_id !== clampedId || revert) {
            // Prevent recursion.
            if (source != SWIPE_SOURCE.BACK) {
                source = SWIPE_SOURCE.BACK;
                state.chat[mesId].swipe_id = clampedId;

                //Update the chat.
                await loadFromSwipeId(mesId, state.chat[mesId].swipe_id);
                await redisplayChat({ startIndex: mesId });
            } else {
                await state.Popup.show.confirm(
                    t`ERROR: <code>syncSwipeToMes</code> has failed to revert the failed ${direction} swipe on message #${mesId}.`,
                    t`<p>After you click OK, the chat will be reloaded to prevent data corruption.</p>`,
                    { okButton: 'OK', cancelButton: false },
                );
                console.trace(`Error! Recursion detected when reverting failed ${direction} swipe on message #${mesId}. Something has broken.`);
                await reloadCurrentChat();
            }
            //Out of bounds swipes should not be saved.
        } else if (source != SWIPE_SOURCE.BACK) {
            //Save the chat if swipe_id has changed.
            saveChatDebounced();
        }

        //Allow for another swipe.
        state.swipeState = SWIPE_STATE.NONE;
        delete document.body.dataset.swiping;
        showSwipeButtons();
    }

    async function standardSwipe(newSwipeId) {
        //If swipe_id has changed, or the source is being deleted.
        if (newSwipeId !== originalSwipeId || source == SWIPE_SOURCE.DELETE || source == SWIPE_SOURCE.BACK) {
            //Update the chat.
            await loadFromSwipeId(mesId, newSwipeId);
            //Transition to the new chat.
            await animateSwipe();
        }
        await endSwipe();
    }

    /**
     * Removes a message's extra and gen times.
     * @param {ChatMessage} message
     */
    function clearMessageData(message) {
        if (message.extra && typeof message.extra === 'object') {
            delete message.extra.memory;
            delete message.extra.display_text;
            delete message.extra.media;
            delete message.extra.inline_image;
            delete message.extra.files;
            delete message.extra.fileLength;
            delete message.extra.generationType;
            delete message.extra.negative;
            delete message.extra.title;
            delete message.extra.append_title;
        }
        delete message.gen_started;
        delete message.gen_finished;
    }

    /**
     * Sets the message to the newSwipeId and loads it.
     * @param {number} mesId
     * @param {number} newSwipeId
     */
    async function loadFromSwipeId(mesId, newSwipeId) {
        //Update the swipe_id.
        state.chat[mesId].swipe_id = newSwipeId;

        clearMessageData(state.chat[mesId]);

        //Load from swipes.
        if (syncSwipeToMes(mesId, newSwipeId) == false) {
            let errorMessage = t`When swiping ${direction} on message ${mesId}, syncSwipeToMes has returned false. Attempting to swipe back!`;
            toastr.error(errorMessage);

            state.chat[mesId].swipe_id = originalSwipeId;
            await endSwipe(true);
        }
        return true;
    }

    /**
     * Animates a swipe for all messages >= mesId.
     * @param {number} mesId
     * @param {object} params
     * @param {string} [params.xStart='opx']
     * @param {string} [params.xEnd='0px']
     * @param {number} [params.duration=animation_duration]
     * @param {string} [params.classes=''] Additional CSS classes to target during the swipe.
     * @param {boolean} [params.freeze=true] When true, do not remove the class from the animation, leaving it stuck at xEnd.
     * @returns {Promise<boolean|Function>} endSlide unfreezes the messages from xEnd.
     */
    async function animateSwipeTransition(mesId, { xStart = '0px', xEnd = '0px', duration = state.animation_duration, classes = '', freeze = false } = {}) {
        // If the animation_duration is zero, the 'animationend' promise will never resolve.
        //Skip the animation if it's faster than 50ms.
        if (duration <= 50) return;

        //Select MAXIMUM_ANIMATED messages after mesId. Ideally, only visible messages would be animated.
        const MAXIMUM_ANIMATED = 100;

        const messages = state.chatElement.children('.mes');
        const firstDisplayedMesId = Number(messages.first().attr('mesid'));

        const swipedMessagesDiv = messages.filter((index, div) => {
            // const messageId = Number($(div).attr('mesid')); //Slower.
            //This assumes the messages are in order and their Id's are accurate.
            const divMessageId = firstDisplayedMesId + index;

            return (divMessageId < mesId + MAXIMUM_ANIMATED && divMessageId >= mesId);
        });
        if (swipedMessagesDiv.length > 0) {
            let swipeClasses = '.mes_block, .mesAvatarWrapper';
            swipeClasses += classes;

            //Select only the target classes.
            const swipedElementsDiv = swipedMessagesDiv.children(swipeClasses);
            if (swipedElementsDiv.length > 0) {
                //This is a global variable, only one swipe transition can occur concurrently.
                document.documentElement.style.setProperty('--slide-mes-x-start', xStart);
                document.documentElement.style.setProperty('--slide-mes-x-end', xEnd);
                document.documentElement.style.setProperty('--slide-mes-x-duration', `${duration}ms`);

                //The class must be removed to unfreze previous slides.
                swipedElementsDiv.removeClass('slide');
                //CSS starts the animation.
                void swipedElementsDiv[0].offsetWidth;
                swipedElementsDiv.addClass('slide');

                const endSlide = () => {
                    //Remove the style when done.
                    swipedElementsDiv.removeClass('slide');

                    document.documentElement.style.setProperty('--slide-mes-x-start', '');
                    document.documentElement.style.setProperty('--slide-mes-x-end', '');
                    document.documentElement.style.setProperty('--slide-mes-duration', '');
                    return true;
                };
                //Wait for the animation's end. https://developer.mozilla.org/en-US/docs/Web/API/Animation/finished
                const animations = swipedElementsDiv[0]?.getAnimations() ?? [];
                const animation = animations.filter((a) => a instanceof globalThis.CSSAnimation && a.animationName == 'slide')[0];
                try {
                    await Promise.race([animation?.finished, createTimeout(duration * 2, `The ${duration}ms swipe animation has not ended after ${duration * 2}ms. It has been skipped.`)].filter(Boolean));
                } catch (error) {
                    console.warn(error);
                }

                //If not frozen, end the slide now.
                return freeze ? endSlide : endSlide();
            }
        }
        console.warn(`No animatable messages were found after message #${mesId}.`);
        return false;
    }

    function getMessageBottomHeight(thisMesDiv) {
        const thisMesRect = thisMesDiv[0].getBoundingClientRect();
        //Scroll position + Chat height = Bottom of chat height.
        const chatBottom = state.chatElement.scrollTop() - state.chatElement.height();
        //Message offset from viewport top + height = Bottom of message offset.
        const messageBottom = thisMesRect.top + thisMesDiv.height();
        // Bottom of chat + Bottom of message offset = target scroll position.
        const scrollHeight = (chatBottom + messageBottom);
        return scrollHeight;
    }

    function expandNewMessage(thisMesDiv) {
        //Only scroll if the view is not near the bottom.
        const is_animation_scroll = (state.chatElement.scrollTop() >= (state.chatElement.prop('scrollHeight') - state.chatElement.outerHeight()) - 10);

        let new_height = thisMesDivHeight - (thisMesTextHeight - thisMesText[0].scrollHeight);
        if (new_height < 103) new_height = 103;

        //Keep the swipe buttons at the same height when scrolling is finished.

        //Expand new message.
        thisMesDiv.animate({ height: new_height + 'px' }, {
            duration: 0, //used to be 100 //Disabled on Cohee's request. https://github.com/SillyTavern/SillyTavern/pull/4610/files#r2408731744
            queue: false,
            progress: function (animation, progress, remainingMs) {
                if (is_animation_scroll) state.chatElement.scrollTop(getMessageBottomHeight(thisMesDiv));
            },
            complete: function () {
                thisMesDiv.css('height', 'auto');
                //Correct height auto offset.
                if (is_animation_scroll) state.chatElement.scrollTop(getMessageBottomHeight(thisMesDiv));
            },
        });
    }

    /**
     * Anime a swipe, optionally running a generation.
     * @param {boolean} run_generate
     * @param {boolean} [skipSwipeOut=false]
     */
    async function animateSwipe(run_generate = false, skipSwipeOut = false) {
        if (!skipSwipeOut) {
            //Swipe out.
            await animateSwipeTransition(mesId, { xEnd: `${swipeRange}px`, duration: swipeDuration });
        }


        if (run_generate) {
            await updateSwipeCounter(mesId);
            //shows "..." while generating
            thisMesDiv.find('.mes_text').html('...');
            // resets the timer
            thisMesDiv.find('.mes_timer').html('');
            thisMesDiv.find('.tokenCounterDisplay').text('');
            updateReasoningUI(thisMesDiv, { reset: true });
        } else {
            //console.log('showing previously generated swipe candidate, or "..."');
            //console.log('onclick right swipe calling addOneMessage');

            //Only scroll when swiping the last message.
            const scroll = (mesId == state.chat.length - 1);
            //The swipe buttons will be refreshed in endSwipe(), refreshing them now will cause flickering.
            addOneMessage(state.chat[mesId], { type: 'swipe', forceId: mesId, scroll: scroll, showSwipes: false });

            if (state.power_user.message_token_count_enabled) {
                if (!state.chat[mesId].extra) {
                    state.chat[mesId].extra = {};
                }

                const tokenCountText = (state.chat[mesId]?.extra?.reasoning || '') + state.chat[mesId].mes;
                const tokenCount = await getTokenCountAsync(tokenCountText, 0);
                state.chat[mesId].extra.token_count = tokenCount;
                thisMesDiv.find('.tokenCounterDisplay').text(`${tokenCount}t`);
            }
        }

        //Animate expanding to the new message height.
        thisMesDiv.css('height', thisMesDivHeight);
        expandNewMessage(thisMesDiv);

        if (run_generate) {
            appendMediaToMessage(state.chat[mesId], thisMesDiv);
        }

        await eventSource.emit(event_types.MESSAGE_SWIPED, (mesId));

        if (run_generate && !state.is_send_press) {
            state.is_send_press = true;
            generation = Generate('swipe');
        }

        //Swipe in from the opposite side.
        await animateSwipeTransition(mesId, { xStart: `${-swipeRange}px`, xEnd: `${0}px`, duration: swipeDuration });
    }

    if (mesId === Number(state.this_edit_mes_id)) {
        closeMessageEditor();
    }
    if (isStreamingEnabled() && state.streamingProcessor) {
        state.streamingProcessor.onStopStreaming();
    }

    //If the swipe is not being deleted.
    if (source != SWIPE_SOURCE.DELETE && source != SWIPE_SOURCE.BACK) {
        // Make sure ad-hoc changes to extras are saved before swiping away
        syncMesToSwipe(mesId);

        if (state.chat[mesId].swipe_id === undefined) {              // if there is no swipe-message in the last spot of the chat array
            state.chat[mesId].swipe_id = 0;                        // set it to id 0
            state.chat[mesId].swipes = [];                         // empty the array
            state.chat[mesId].swipe_info = [];
            state.chat[mesId].swipes[0] = state.chat[mesId].mes;  //assign swipe array with last chat[mesId] from chat
            state.chat[mesId].swipe_info[0] = {
                'send_date': state.chat[mesId].send_date,
                'gen_started': state.chat[mesId].gen_started,
                'gen_finished': state.chat[mesId].gen_finished,
                'extra': structuredClone(state.chat[mesId].extra),
            };
        }
        // If the user is holding down the key and we're at the last or first swipe, don't do anything.
        let isLastSwipe = (direction === SWIPE_DIRECTION.RIGHT) ? (state.chat[mesId].swipe_id === Math.max(0, state.chat[mesId].swipes.length - 1)) : state.chat[mesId].swipe_id === 0;
        if (source === SWIPE_SOURCE.KEYBOARD && repeated && isLastSwipe) {
            await endSwipe();
            return;
        }
    } else if (source == SWIPE_SOURCE.DELETE || source == SWIPE_SOURCE.BACK) {
        //If the swipe is being deleted or reverted.
        await standardSwipe(newSwipeId);
        return;
    }

    //If swiping left.
    if (direction === SWIPE_DIRECTION.LEFT) {
        if (forceSwipeId == null) newSwipeId--;
        //Loop to last swipe if negative.
        if (newSwipeId < 0) {
            newSwipeId = Math.max(0, state.chat[mesId].swipes.length - 1);
        }
        //Limit swipe_id to swipes.
        if (newSwipeId > state.chat[mesId].swipes.length - 1) {
            toastr.warning(`The swipe_id for message #${mesId} was ${newSwipeId}. It has been reset to ${state.chat[mesId].swipes.length - 1}.`);
            state.chat[mesId].swipe_id = state.chat[mesId].swipes.length - 1;
            await endSwipe();
            return;
        }
        await standardSwipe(newSwipeId);
        return;
    } else if (direction === SWIPE_DIRECTION.RIGHT) {
        //If swiping right.
        // make new slot in array
        if (forceSwipeId == null) newSwipeId++;

        //Minimum of zero.
        if (newSwipeId < 0) {
            toastr.warning(`The swipe_id for message #${mesId} was ${newSwipeId}. It has been reset to zero.`);
            state.chat[mesId].swipe_id = 0;
            await endSwipe();
            return;
        }

        //If overswiping.
        if (newSwipeId >= state.chat[mesId].swipes.length) {
            newSwipeId = state.chat[mesId].swipes.length;

            //Update the swipe_id.
            state.chat[mesId].swipe_id = newSwipeId;

            const overswipe = getOverswipeBehavior(mesId);

            //Cancel the generation.
            if (overswipe == OVERSWIPE_BEHAVIOR.NONE) {
                //Cancel swipe.
                state.chat[mesId].swipe_id = originalSwipeId;
                await endSwipe();
                return;
            } else if (overswipe == OVERSWIPE_BEHAVIOR.REGENERATE) {
                //Regenerate the message
                clearMessageData(state.chat[mesId]);
                let run_generate = true;
                //Generate.
                await animateSwipe(run_generate);
                await endSwipe();
                return;
            } else if (overswipe == OVERSWIPE_BEHAVIOR.LOOP || overswipe == OVERSWIPE_BEHAVIOR.PRISTINE_GREETING) {
                // Loop to the first swipe.
                newSwipeId = 0;
            }
        }
        await standardSwipe(newSwipeId);
        return;
    }
}

const setMainChatMessageUiFlag = (...args) => shell().setMainChatMessageUiFlag(...args);
const canOpenSwipePickerForMessage = (...args) => shell().canOpenSwipePickerForMessage(...args);
const canJumpToSwipeForMessage = (...args) => shell().canJumpToSwipeForMessage(...args);

/**
 * Creates a message's `swipes`, `swipe_id` and `swipe_info` if necessary.
 * @param {ChatMessage} message
 * @returns {boolean} true if the message was updated.
 */
export function ensureSwipes(message) {
    let updated = false;

    if (!message || typeof message !== 'object') {
        console.trace(`[ensureSwipes] failed. '${message}' is not an object.`);
        return updated;
    }

    //Small system messages and user messages should not have swipes.
    if (message?.is_user || message?.extra?.isSmallSys) {
        return updated;
    }

    if (!Array.isArray(message.swipes)) {
        message.swipes = [message.mes ?? ''];
        updated = true;
    }

    if (typeof message.swipe_id !== 'number') {
        message.swipe_id = 0;
        updated = true;
    }

    /** @type {() => SwipeInfo} */
    const createSwipeInfo = () => ({
        send_date: message.send_date,
        gen_started: message.gen_started,
        gen_finished: message.gen_finished,
        extra: {},
    });

    if (!Array.isArray(message.swipe_info)) {
        message.swipe_info = message.swipes.map(_ => createSwipeInfo());
        updated = true;
    }

    for (let i = 0; i < message.swipes.length; i++) {
        if (typeof message.swipes[i] !== 'string') {
            updated = true;
            console.warn('The message had a swipe that is not a string. It has has been set to \'\'.', message);
            message.swipes[i] = '';
        }
        if (!message.swipe_info[i] || typeof message.swipe_info[i] !== 'object') {
            updated = true;
            console.warn('The message had missing or invalid swipe_info for a swipe. It has been backfilled.', message);
            message.swipe_info[i] = createSwipeInfo();
        }
    }

    return updated;
}

/**
 * Syncs the current message and all its data into the swipe data at the given message ID (or the last message if no ID is given).
 *
 * If the swipe data is invalid in some way, this function will exit out without doing anything.
 * @param {number?} [messageId=null] - The ID of the message to sync with the swipe data. If no ID is given, the last message is used.
 * @returns {boolean} Whether the message was successfully synced
 */
export function syncMesToSwipe(messageId = null) {
    if (!state.chat.length) {
        return false;
    }

    const targetMessageId = messageId ?? state.chat.length - 1;
    if (targetMessageId >= state.chat.length || targetMessageId < 0) {
        console.warn(`[syncMesToSwipe] Invalid message ID: ${messageId}`);
        return false;
    }

    const targetMessage = state.chat[targetMessageId];
    if (!targetMessage) {
        return false;
    }

    // No swipe data there yet, exit out
    if (typeof targetMessage.swipe_id !== 'number') {
        return false;
    }
    // If swipes structure is invalid, exit out (for now?)
    if (!Array.isArray(targetMessage.swipe_info) || !Array.isArray(targetMessage.swipes)) {
        return false;
    }
    // If the swipe is not present yet, exit out (will likely be copied later)
    // "" is falsy. An empty string is a valid message.
    if (typeof targetMessage.swipes[targetMessage.swipe_id] !== 'string' || !targetMessage.swipe_info[targetMessage.swipe_id]) {
        return false;
    }

    const targetSwipeInfo = targetMessage.swipe_info[targetMessage.swipe_id];
    if (typeof targetSwipeInfo !== 'object') {
        return false;
    }

    // Only sync swipes if the chat is not pristine, so that macros in the greeting can resolve again on swipe
    if (state.chat_metadata.tainted || state.chat.length > 1) {
        targetMessage.swipes[targetMessage.swipe_id] = targetMessage.mes;
    }

    targetSwipeInfo.send_date = targetMessage.send_date;
    targetSwipeInfo.gen_started = targetMessage.gen_started;
    targetSwipeInfo.gen_finished = targetMessage.gen_finished;
    targetSwipeInfo.extra = structuredClone(targetMessage.extra);

    return true;
}

/**
 * Syncs swipe data back to the message data at the given message ID (or the last message if no ID is given).
 * If the swipe ID is not provided, the current swipe ID in the message object is used.
 *
 * If the swipe data is invalid in some way, this function will exit out without doing anything.
 * @param {number?} [messageId=null] - The ID of the message to sync with the swipe data. If no ID is given, the last message is used.
 * @param {number?} [swipeId=null] - The ID of the swipe to sync. If no ID is given, the current swipe ID in the message object is used.
 * @param {ChatMessage?} [targetMessage=null] - The message object to sync instead of resolving one from `chat`.
 * @returns {boolean} Whether the swipe data was successfully synced to the message
 */
export function syncSwipeToMes(messageId = null, swipeId = null, targetMessage = null) {
    if (!targetMessage && !state.chat.length) {
        return false;
    }

    if (!targetMessage) {
        const targetMessageId = messageId ?? state.chat.length - 1;
        if (targetMessageId >= state.chat.length || targetMessageId < 0) {
            console.warn(`[syncSwipeToMes] Invalid message ID: ${messageId}`);
            return false;
        }

        targetMessage = state.chat[targetMessageId];
    }

    if (!targetMessage) {
        return false;
    }

    if (swipeId !== null) {
        if (isNaN(swipeId) || swipeId < 0) {
            console.warn(`[syncSwipeToMes] Invalid swipe ID: ${swipeId}`);
            return false;
        }
        targetMessage.swipe_id = swipeId;
    }

    // No swipe data there yet, exit out
    if (typeof targetMessage.swipe_id !== 'number') {
        return false;
    }
    // If swipes structure is invalid, exit out
    if (!Array.isArray(targetMessage.swipes)) {
        return false;
    }

    // Backfill swipe_info if missing.
    if (!Array.isArray(targetMessage.swipe_info)) {
        targetMessage.swipe_info = targetMessage.swipes.map(_ => ({
            send_date: targetMessage.send_date,
            gen_started: void 0,
            gen_finished: void 0,
            extra: {},
        }));
    }

    const targetSwipeId = targetMessage.swipe_id;
    if (typeof targetMessage.swipes[targetSwipeId] !== 'string') {
        console.warn(`[syncSwipeToMes] Invalid swipe ID: ${targetSwipeId}`);
        return false;
    }

    const targetSwipeInfo = targetMessage?.swipe_info?.[targetSwipeId];
    if (typeof targetSwipeInfo !== 'object') {
        console.warn(`[syncSwipeToMes] Invalid swipe info: ${targetSwipeId}`);
    }

    targetMessage.mes = targetMessage.swipes[targetSwipeId];
    targetMessage.send_date = targetSwipeInfo?.send_date;
    targetMessage.gen_started = targetSwipeInfo?.gen_started;
    targetMessage.gen_finished = targetSwipeInfo?.gen_finished;
    targetMessage.extra = structuredClone(targetSwipeInfo?.extra) ?? {};

    return true;
}

/**
 * Update the swipe counter for mesId.
 * By default, the swipe counter's opacity will appear greyed out. The opacity is changed with CSS.
 * @param {Number} mesId
 * @param {object} [options] Options
 * @param {ChatMessage} [options.message=undefined] Swipe numbers from this message will be used instead of mesId.
 * @param {JQuery<HTMLElement>} [options.messageElement=undefined] Target Element. Passing in the message's element will save a DOM query.
 */
export async function updateSwipeCounter(mesId, { message = undefined, messageElement = undefined } = {}) {
    message ??= state.chat[mesId];

    //If the message does not have swipes, create them.
    if (ensureSwipes(message)) {
        syncMesToSwipe(mesId);
    }

    if (isReactMainChatOwner()) {
        scheduleMainChatMessageListPanelRefresh();
        return;
    }

    messageElement ??= state.chatElement.children('.mes').filter(`[mesid="${mesId}"]`);

    const swipeCounterText = formatSwipeCounter((message?.swipe_id + 1), message?.swipes?.length);
    const swipeCounter = messageElement.find('.swipes-counter');
    const swipePickerButton = messageElement.find('.mes_swipe_picker');
    const canOpenSwipePicker = canOpenSwipePickerForMessage(mesId);
    const canJumpToSwipe = canJumpToSwipeForMessage(mesId);

    swipeCounter
        .text(swipeCounterText)
        .prop('hidden', false)
        .toggleClass('swipe-picker-enabled', canOpenSwipePicker)
        .toggleClass(state.INTERACTABLE_CONTROL_CLASS, canOpenSwipePicker)
        .attr('role', canOpenSwipePicker ? 'button' : null)
        .attr('title', canJumpToSwipe ? t`Click to jump to a swipe` : canOpenSwipePicker ? t`Click to view swipe history` : null);
    swipePickerButton.toggle(canOpenSwipePicker);

    if (!canOpenSwipePicker) {
        swipeCounter.removeAttr('tabindex');
    }
}

/**
 * Returns true if messages are generally swipeable.
 * @returns {boolean}
 */
export function isSwipingAllowed() {
    return (
        //Swipe cannot be called on an empty chat.
        state.chat.length !== 0 &&
        //The swipes setting must be enabled, and swipes can't be hidden.
        state.swipes && !state.swipesHidden &&
        //Cannot swipe while generating.
        !isGenerating() &&
        //If mid-swipe, the message cannot be swiped.
        state.swipeState === SWIPE_STATE.NONE
    );
}

/**
 * Returns true if the message is swipeable.
 * This does not check if messages are generally swipeable. See isSwipingAllowed().
 * This does not check if the swipes exist or are valid.
 * @param {number} messageId The message Id to check.
 * @param {ChatMessage} [message=undefined] If undefined, then the message checks will be skipped.
 * @returns {boolean}
 */
export function isMessageSwipeable(messageId, message = undefined) {
    message ??= state.chat[messageId];

    //If the message does not have swipes, create them.
    if (ensureSwipes(message)) {
        syncMesToSwipe(messageId);
    }

    if (
        //Only messages below the currently edited message can be swiped, if it's not mid-swipe edit.
        ((messageId > (state.this_edit_mes_id ?? -1)) && (state.swipeState != SWIPE_STATE.EDITING)) &&

        //If the message is the last message, and it exists.
        (messageId == state.chat.length - 1) &&
        (message &&
            //Small system messages cannot be swiped.
            !(message?.extra?.isSmallSys) &&
            //Some messages, like the welcome screen, are not swipeable.
            !(message?.extra?.swipeable === false) &&
            //User messages are not swipeable.
            !message.is_user
        )
    ) {
        // The message is swipeable.
        return true;
    } else {
        // The message is not swipeable.
        return false;
    }
}

/**
 * Returns the message's behavior when swiped past it's last branch.
 * This does not check if the message can currently be swiped. See isMessageSwipeable().
 * This does not check if messages are generally swipeable. See isSwipingAllowed().
 * This does not check if the swipes exist or are valid.
 * @param {number} messageId The message Id to check.
 * @param {ChatMessage} [message=undefined] If defined, this will be used instead of chat[messageId].
 * @returns {OVERSWIPE_BEHAVIOR}
 */
export function getOverswipeBehavior(messageId, message = undefined) {
    message ??= state.chat[messageId];

    const isPristine = !state.chat_metadata?.tainted;
    const isGreeting = messageId === 0;

    //Do not override explicitly set overswipe_behavior.
    if (typeof message?.extra?.overswipe_behavior == 'string') return message.extra.overswipe_behavior;
    //Some messages, like the welcome screen, are not swipeable.
    else if (message?.extra?.swipeable === false) return OVERSWIPE_BEHAVIOR.NONE;
    //Small System messages can't be swiped.
    else if (message?.extra?.isSmallSys) return OVERSWIPE_BEHAVIOR.NONE;
    //The first message in a priistine chat will loop. It's chevrons will always be visible https://github.com/SillyTavern/SillyTavern/pull/4712#issuecomment-3557893373
    else if (isGreeting && isPristine) return OVERSWIPE_BEHAVIOR.PRISTINE_GREETING;
    //Non-user and non-prompt hidden messages will regenerate.
    else if (!message?.is_user && !message?.is_system) return OVERSWIPE_BEHAVIOR.REGENERATE;
    //By default, all other messages will loop. Their swipe chevrons will only be shown if there is more than one swipe.
    else { return OVERSWIPE_BEHAVIOR.LOOP; }
}

/**
 * Refreshes all swipe buttons and updates their swipe counters.
 * This has been optimized for bulk updates by minimizing DOM queries.
 * @param {boolean} updateCounters When true, the swipe counters will also be updated. Typically redundant because addOneMessage updates the counters.
 * @param {boolean} fade By default, the chevrons fade in and out.
 * @returns
 */
export function refreshSwipeButtons(updateCounters = false, fade = true) {
    //Never show swipe buttons on an empty chat.
    if (state.chat?.length === 0) return false;

    //If swipes are disabled or hidden, hide all swipe buttons.
    if (!isSwipingAllowed()) {
        $('body').addClass('hideAllSwipeButtons');
        return;
        //Don't hide all swipe buttons.
    } else {
        //CSS will hide all messages.
        $('body').removeClass('hideAllSwipeButtons');
    }

    if (isReactMainChatOwner()) {
        if (updateCounters) {
            scheduleMainChatMessageListPanelRefresh();
        }
        return;
    }

    //Non-messages can appear in chat. '.mes' is required.
    const messageElements = state.chatElement.children('.mes[mesid]');

    const firstDisplayedMesId = Number(messageElements.first().attr('mesid'));

    //Group each message.
    messageElements.each((index, div) => {
        //This assumes the messages are in order and their Id's are accurate.
        const messageId = firstDisplayedMesId + index;
        //Number($(div).attr('mesid')); Would not misscount due to a missing div, but is much slower.

        const message = state.chat[messageId];

        //Chevrons should not fade-in during printMessages. //https://github.com/SillyTavern/SillyTavern/pull/4712#issuecomment-3539315919
        div.classList.toggle('fade', fade);

        if (isMessageSwipeable(messageId, message)) {
            //If a right swipe would trigger a generation or loop to the first swipe.
            const isLastSwipe = (message?.swipes?.length ?? 1) - 1 <= (message?.swipe_id ?? 0);
            const hasSwipes = (message?.swipes?.length > 1);
            const overswipe = getOverswipeBehavior(messageId, message);
            const swipePickerButton = $(div).find('.mes_swipe_picker');
            const canOpenSwipePicker = canOpenSwipePickerForMessage(messageId);

            // Chevrons should always be shown on pristine greetings: https://github.com/SillyTavern/SillyTavern/pull/4712#issuecomment-3557893373
            const pristineGreeting = overswipe == OVERSWIPE_BEHAVIOR.PRISTINE_GREETING;

            //The swipe button will be shown if an overswipe would trigger REGENERATE or EDIT_GENERATE.
            const isOverswipeable = isLastSwipe &&
                overswipe == OVERSWIPE_BEHAVIOR.REGENERATE ||
                overswipe == OVERSWIPE_BEHAVIOR.EDIT_GENERATE;

            div.classList.toggle('last_swipe', isOverswipeable);

            //If there's only one swipe, the left arrow should not be shown.
            div.classList.toggle('swipes_visible', hasSwipes || pristineGreeting);
            swipePickerButton.toggle(canOpenSwipePicker);

            //updateSwipeCounter does not need to be awaited, It can run a bit later.
            if (updateCounters) updateSwipeCounter(messageId, { message, messageElement: $(div) });
        } else {
            //Hide all messages that are not swipeable.
            div.classList.remove('swipes_visible', 'last_swipe');
            $(div).find('.mes_swipe_picker').toggle(canOpenSwipePickerForMessage(messageId));
        }
    });
}

/**
 * This function is misleadingly named. It allows generation then refreshes the swipe buttons and counters.
 */
export function showSwipeButtons() {
    state.swipesHidden = false;
    if (isReactMainChatOwner()) {
        setMainChatMessageUiFlag('swipeCounterHidden', false);
    }
    refreshSwipeButtons();
}

/**
 * This function is misleadingly named. It blocks generation then refreshes the swipe buttons and counters.
 * @param {object} [options] Options
 * @param {boolean} [options.hideCounters=false] Also hide the swipes counter.
 */
export function hideSwipeButtons({ hideCounters = false } = {}) {
    state.swipesHidden = true;
    if (isReactMainChatOwner()) {
        if (hideCounters) {
            setMainChatMessageUiFlag('swipeCounterHidden', true, state.chat.length - 1);
        }
        refreshSwipeButtons();
        return;
    }

    refreshSwipeButtons();

    if (hideCounters === true) {
        state.chatElement.find('.last_mes .swipes-counter').prop('hidden', true);
    }
}

/**
 * Deletes a swipe from the chat.
 *
 * @param {number?} [swipeId = null] - The ID of the swipe to delete. If not provided, the current swipe will be deleted.
 * @param {number?} [messageId = chat.length - 1] - The ID of the message to delete from. If not provided, the last message will be targeted.
 * @returns {Promise<number>|undefined} - The ID of the new swipe after deletion.
 */
export async function deleteSwipe(swipeId = null, messageId = state.chat.length - 1) {
    if (swipeId != null) {
        swipeId = Number(swipeId);
        if (!Number.isInteger(swipeId) || swipeId < 0) {
            toastr.warning(t`Invalid swipe ID.`);
            return;
        }
    }

    const message = state.chat[messageId];
    if (!message || !Array.isArray(message.swipes) || !message.swipes.length) {
        toastr.warning(t`No messages to delete swipes from.`);
        return;
    }

    if (message.swipes.length <= 1) {
        toastr.warning(t`Can't delete the last swipe.`);
        return;
    }

    swipeId = Number(swipeId ?? message.swipe_id);
    const currentSwipeId = clamp(Number(message.swipe_id ?? 0), 0, message.swipes.length - 1);

    if (swipeId < 0 || swipeId >= message.swipes.length) {
        toastr.warning(t`Invalid swipe ID: ${swipeId + 1}`);
        return;
    }

    message.swipes.splice(swipeId, 1);

    if (Array.isArray(message.swipe_info) && message.swipe_info.length) {
        message.swipe_info.splice(swipeId, 1);
    }

    let newSwipeId;
    if (swipeId < currentSwipeId) {
        newSwipeId = currentSwipeId - 1;
    } else if (swipeId > currentSwipeId) {
        newSwipeId = currentSwipeId;
    } else {
        // Select the next swipe, or the one before if it was the last one.
        newSwipeId = Math.min(swipeId, message.swipes.length - 1);
    }

    state.chat_metadata.tainted = true;

    messageId = Number(messageId);
    swipeId = Number(swipeId);
    message.swipe_id = newSwipeId;
    await eventSource.emit(event_types.MESSAGE_SWIPE_DELETED, { messageId, swipeId, newSwipeId });

    if (swipeId === currentSwipeId) {
        const direction = (swipeId <= newSwipeId) ? SWIPE_DIRECTION.RIGHT : SWIPE_DIRECTION.LEFT;
        // Animate swipe and swap displayed message when the currently visible swipe was deleted.
        await swipe(null, direction, { source: SWIPE_SOURCE.DELETE, repeated: false, forceMesId: messageId, forceSwipeId: newSwipeId });
    } else {
        await updateSwipeCounter(messageId);
        if (messageId !== state.chat.length - 1) {
            await updateSwipeCounter(state.chat.length - 1);
        }
        refreshSwipeButtons();
        saveChatDebounced();
    }

    await saveChatConditional();

    return newSwipeId;
}

export function updateEditArrowClasses() {
    if (!(state.this_edit_mes_id >= 0)) {
        return;
    }
    if (isReactMainChatOwner()) {
        return;
    }

    const message = state.chatElement.children('.mes').filter(`.mes[mesid="${state.this_edit_mes_id}"]`);

    const downButton = message.find('.mes_edit_down');
    const upButton = message.find('.mes_edit_up');
    const copyButton = message.find('.mes_edit_copy');
    const deleteButton = message.find('.mes_edit_delete');
    const lastId = Number(state.chatElement.find('.mes').last().attr('mesid'));
    const firstId = Number(state.chatElement.find('.mes').first().attr('mesid'));

    copyButton.removeClass('disabled');
    deleteButton.removeClass('disabled');

    // The last message cannot be moved down.
    downButton.toggleClass('disabled', lastId === Number(state.this_edit_mes_id));
    // The first message cannot be moved up.
    upButton.toggleClass('disabled', firstId === Number(state.this_edit_mes_id));
}

/**
 * Formats a counter for a swipe view.
 * @param {number} current The current number of items.
 * @param {number} total The total number of items.
 * @returns {string} The formatted counter.
 */
function formatSwipeCounter(current, total) {
    if (isNaN(current) && isNaN(total)) {
        return '';
    }
    return `${!isNaN(current) ? current : '?'}\u200b/\u200b${!isNaN(total) ? total : '?'}`;
}

