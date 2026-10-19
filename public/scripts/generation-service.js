import { eventSource, event_types } from './events.js';
import { TOKEN_PADDING, inject_ids } from './constants.js';
import { executeGenerationAttempts, createGenerationCommandPlan } from './chat-generation-command-service.js';
import {
    getGenerationFailureDecision,
    getGenerationSuccessFinalization,
    hasFallbackProviderForGeneration,
} from './chat-generation-lifecycle.js';
import { getWorldInfoPrompt } from './world-info-service.js';
import { requireGenerationShellContext } from './generation-shell-context.js';
import { getComposerValue, clearComposerValue } from './main-chat-composer-service.js';
import { endPipelineRun, getPipelineTriggerTag, preparePipelineRound } from './reply-pipeline.js';
import { t } from './i18n.js';

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
const getRegexedString = (...args) => shell().getRegexedString(...args);
const getTokenCountAsync = (...args) => shell().getTokenCountAsync(...args);
const hasPendingFileAttachment = (...args) => shell().hasPendingFileAttachment(...args);
const STREAMING_FPS = 30;

const sendSystemMessage = (...args) => shell().sendSystemMessage(...args);
const prepareOpenAIMessages = (...args) => shell().prepareOpenAIMessages(...args);
const renderStoryString = (...args) => shell().renderStoryString(...args);
const setOpenAIMessages = (...args) => shell().setOpenAIMessages(...args);
const countOccurrences = (...args) => shell().countOccurrences(...args);
const isOdd = (...args) => shell().isOdd(...args);
const delay = (...args) => shell().delay(...args);

export class GenerationStreamSession {
    /**
     * Creates a new streaming processor.
     * @param {string} type Generation type
     * @param {boolean} forceName2 If true, force the use of name2
     * @param {Date} timeStarted Date when generation was started
     * @param {PromptReasoning} promptReasoning Prompt reasoning instance
     */
    constructor(type, forceName2, timeStarted, promptReasoning) {
        this.result = '';
        this.messageId = -1;
        /** @type {HTMLElement} */
        this.messageDom = null;
        /** @type {HTMLElement} */
        this.messageTextDom = null;
        /** @type {HTMLElement} */
        this.messageTimerDom = null;
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
    async #checkDomElements(messageId) {
        if (isReactMainChatOwner()) {
            return;
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

    async onStartStreaming(text) {
        await saveReply({ type: this.type, getMessage: text, fromStreaming: true });
        const messageId = state.chat.length - 1;
        await this.#checkDomElements(messageId);
        this.markUIGenStarted();
        scrollChatToBottom({ waitForFrame: true });
        return messageId;
    }

    async onProgressStreaming(messageId, text, isFinal) {
        let processedText = cleanUpMessage({
            getMessage: text,
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
                this.messageTextDom.innerHTML = formattedText;
            }

            const timePassed = formatGenerationTimer(this.timeStarted, currentTime, 0, this.reasoningHandler.getDuration(), this.timeToFirstToken);
            if (this.messageTimerDom instanceof HTMLElement) {
                this.messageTimerDom.textContent = timePassed.timerValue;
                this.messageTimerDom.title = timePassed.timerTitle;
            }
        } else {
            scheduleMainChatMessageListPanelRefresh();
        }

        if (!state.scrollLock) {
            scrollChatToBottom({ waitForFrame: true });
        }
    }

    /**
     * Finalizes an intermediary message after generation is complete, or a tool call is performed.
     * Performs essential message processing (code blocks, reasoning, attachments, events)
     * without the heavier finish operations (UI unlock - optional, sound, save chat).
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

        await eventSource.emit(event_types.MESSAGE_RECEIVED, this.messageId, this.type);
        await eventSource.emit(event_types.CHARACTER_MESSAGE_RENDERED, this.messageId, this.type);

        this.isFinalizing = false;
        void mountReactMainChatMessageListPanel();
    }

    async onFinishStreaming(messageId, text) {
        await this.finalizeIntermediaryMessage(messageId, text, { unlockUI: true });

        await saveChatConditional();
    }

    async onErrorStreaming({ suppressRecovery = false } = {}) {
        this.isStopped = true;
        this.isFinalizing = false;

        if (this.messageId !== -1 && this.result) {
            await this.onProgressStreaming(this.messageId, this.result, true);
        }

        this.markUIGenStopped();
        if (suppressRecovery) {
            return;
        }

        showGenerationFailureRecovery(this.messageId);

        eventSource.emit(event_types.MESSAGE_RECEIVED, this.messageId, this.type);
        eventSource.emit(event_types.CHARACTER_MESSAGE_RENDERED, this.messageId, this.type);
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
     * @returns {AsyncGenerator<{ text: string, toolCalls: any[], state: any }, void, void>}
     */
    async* nullStreamingGeneration() {
        yield* [];
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
        this.stoppingStrings = getStoppingStrings(state.main_api);

        try {
            const sw = new state.Stopwatch(1000 / STREAMING_FPS);
            const timestamps = [];
            for await (const { text, toolCalls, state } of this.generator()) {
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
                this.observedTokenCount += 1;
                this.observedChunkCount += 1;
                scheduleMainChatMessageListPanelRefresh();
                // Get the updated reasoning string into the handler
                this.reasoningHandler.updateReasoning(this.messageId, state?.reasoning);
                this.images = state?.images ?? [];
                this.reasoningSignature = state?.signature ?? null;
                await eventSource.emit(event_types.STREAM_TOKEN_RECEIVED, text);
                await sw.tick(async () => await this.onProgressStreaming(this.messageId, text));
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
    await eventSource.emit(event_types.GENERATION_STARTED, type, { automatic_trigger, force_name2, quiet_prompt, quietToLoud, skipWIAN, signal, quietImage, depth }, dryRun);

    // Don't recreate abort controller if signal is passed
    if (!(state.abortController && signal)) {
        state.abortController = new AbortController();
    }

    if (!(dryRun || depth || type == 'quiet')) {
        const interruptedByCommand = await processCommands(getComposerValue());

        if (interruptedByCommand) {
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

    let textareaText;
    if (type !== 'quiet' && !dryRun && !depth) {
        state.is_send_press = true;
        textareaText = getComposerValue();
        clearComposerValue();
    } else {
        textareaText = '';
    }

    if (!dryRun) {
        deactivateSendButtons();
    }

    let { messageBias, promptBias } = getBiasStrings(textareaText, type);

    //*********************************
    //PRE FORMATING STRING
    //*********************************

    // Quiet background requests should not attach pending files to the chat
    const noAttachTypes = [
        'quiet',
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
        system,
        charDepthPrompt,
        creatorNotes,
        scenario,
    } = getCharacterCardFields();

    // Depth prompt (character-specific A/N)
    removeDepthPrompts();
    const depthPromptText = charDepthPrompt || '';
    const depthPromptDepth = state.characters[state.this_chid]?.data?.extensions?.depth_prompt?.depth ?? state.depth_prompt_depth_default;
    const depthPromptRole = getExtensionPromptRoleByName(state.characters[state.this_chid]?.data?.extensions?.depth_prompt?.role ?? state.depth_prompt_role_default);
    setExtensionPrompt(inject_ids.DEPTH_PROMPT, depthPromptText, state.extension_prompt_types.IN_CHAT, depthPromptDepth, false, depthPromptRole);

    // First message in fresh 1-on-1 chat reacts to user/character settings changes
    if (state.chat.length) {
        state.chat[0].mes = substituteParams(state.chat[0].mes);
    }

    // Collect messages with usable content
    const canUseTools = state.ToolManager.isToolCallingSupported();
    const canPerformToolCalls = !dryRun && state.ToolManager.canPerformToolCalls(type) && depth < state.ToolManager.RECURSE_LIMIT;
    let coreChat = state.chat.filter(x => !x.is_system || (canUseTools && Array.isArray(x.extra?.tool_invocations)));

    coreChat = await Promise.all(coreChat.map(async (/** @type {ChatMessage} */ chatItem, index) => {
        let message = chatItem.mes;
        let regexType = chatItem.is_user ? state.regex_placement.USER_INPUT : state.regex_placement.AI_OUTPUT;
        let options = { isPrompt: true, depth: (coreChat.length - index - 1) };

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
        const depth = coreChat.length - i - 1;

        coreChat[i] = {
            ...coreChat[i],
            mes: promptReasoning.addToMessage(
                coreChat[i].mes,
                getRegexedString(
                    String(coreChat[i].extra?.reasoning ?? ''),
                    state.regex_placement.REASONING,
                    { isPrompt: true, depth: depth },
                ),
                false,
                coreChat[i].extra?.reasoning_duration,
            ),
        };
        if (promptReasoning.isLimitReached()) {
            break;
        }
    }

    // Determine token limit
    let this_max_context = getMaxPromptTokens();


    console.log(`Core/all messages: ${coreChat.length}/${state.chat.length}`);

    force_name2 = true;

    // Add WI to prompt (and also inject WI to AN value via hijack)
    // Make quiet prompt available for WIAN
    setExtensionPrompt(inject_ids.QUIET_PROMPT, quiet_prompt || '', state.extension_prompt_types.IN_PROMPT, 0, true);
    const chatForWI = coreChat.map(x => x.mes).reverse();
    /** @type {import('./world-info.js').WIGlobalScanData} */
    const globalScanData = {
        characterDescription: description,
        characterDepthPrompt: charDepthPrompt,
        creatorNotes: creatorNotes,
        scenario: scenario,
        trigger: 'normal',
    };
    const { worldInfo, worldInfoBefore, worldInfoAfter, worldInfoDepth } = await getWorldInfoPrompt(chatForWI, this_max_context, dryRun, globalScanData);
    setExtensionPrompt(inject_ids.QUIET_PROMPT, '', state.extension_prompt_types.IN_PROMPT, 0, true);

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
    } else {
        console.log('skipping WIAN');
    }

    // Collect before / after story string injections
    const beforeScenarioAnchor = await getExtensionPrompt(state.extension_prompt_types.BEFORE_PROMPT);
    const afterScenarioAnchor = await getExtensionPrompt(state.extension_prompt_types.IN_PROMPT);

    const storyStringParams = {
        description: description,
        system: system,
        char: state.name2,
        user: state.name1,
        wiBefore: worldInfoBefore,
        wiAfter: worldInfoAfter,
        loreBefore: worldInfoBefore,
        loreAfter: worldInfoAfter,
        anchorBefore: beforeScenarioAnchor.trim(),
        anchorAfter: afterScenarioAnchor.trim(),
        scenario: scenario,
        mesExamples: '',
        mesExamplesRaw: '',
    };

    // Render the story string and combine with injections
    const storyString = renderStoryString(storyStringParams);
    let combinedStoryString = storyString;

    setExtensionPrompt(inject_ids.STORY_STRING, '', state.extension_prompt_types.IN_CHAT, 0);


    // Inject all Depth prompts. Chat Completion does it separately
    let injectedIndices = [];
    if (state.main_api !== 'openai') {
        injectedIndices = await doChatInject(coreChat);
    }

    let chat2 = [];
    let userMessageIndices = [];
    for (let i = coreChat.length - 1, j = 0; i >= 0; i--, j++) {
        if (state.main_api == 'openai') {
            chat2[i] = coreChat[j].mes;
            continue;
        }

        chat2[i] = formatMessageHistoryItem(coreChat[j]);

        if (coreChat[j].is_user) {
            userMessageIndices.push(i);
        }
    }

    const userAlignmentMessage = '';

    let oaiMessages = [];

    if (state.main_api === 'openai') {
        oaiMessages = setOpenAIMessages(coreChat);
    }

    // hack for regeneration of the first message
    if (chat2.length == 0) {
        chat2.push('');
    }

    let chatString = addChatsSeparator('');

    async function getMessagesTokenCount() {
        const encodeString = [
            combinedStoryString,
            userAlignmentMessage,
            chatString,
            modifyLastPromptLine(''),
        ].join('').replace(/\r/gm, '');
        return getTokenCountAsync(encodeString, TOKEN_PADDING);
    }

    // Collect enough messages to fill the context
    let arrMes = Array.from({ length: chat2.length });
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

    let mesSend = [];
    console.debug('calling runGenerate');

    if (!dryRun) {
        state.is_send_press = true;
    }

    let generatedPromptCache = '';
    if (generatedPromptCache.length == 0) {
        console.debug('generating prompt');
        chatString = '';
        arrMes = arrMes.reverse();
        arrMes.forEach(function (item, i, _arr) {
            // OAI doesn't need all of this
            if (state.main_api === 'openai') {
                return;
            }

            // Cohee: This removes a newline from the end of the last message in the context
            // Last prompt line will add a newline if it's not a continuation
            if (i === arrMes.length - 1) {
                item = item.replace(/\n?$/, '');
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

        if (mesSend.length) {
            mesSend[mesSend.length - 1].message = modifyLastPromptLine(mesSend[mesSend.length - 1].message);
        }
    }

    function modifyLastPromptLine(lastMesString) {
        //#########QUIET PROMPT STUFF PT2##############

        // Add quiet generation prompt at depth 0
        if (quiet_prompt && quiet_prompt.length) {
            const quietAppend = `\n${quiet_prompt}`;
            lastMesString += quietAppend;


            // Ross: bailing out early prevents quiet prompts from respecting other instruct prompt toggles
            // for sysgen, SD, and summary this is desireable as it prevents the AI from responding as char..
            // but for idle prompting, we want the flexibility of the other prompt toggles, and to respect them as per settings in the extension
            // need a detection for what the quiet prompt is being asked for...

            // Bail out early?
            if (!quietToLoud) {
                return lastMesString;
            }
        }


        // Add character's name
        if (force_name2) {
            if (!lastMesString.endsWith('\n')) {
                lastMesString += '\n';
            }
            lastMesString += `${state.name2}:`;
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
        let thisPromptContextSize = await getTokenCountAsync(prompt, TOKEN_PADDING);

        if (thisPromptContextSize > this_max_context) {        //if the prepared prompt is larger than the max context size...
            if (mesSend.length > 0) {                    // if the chat history is longer than 0
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

    let mesSendString = '';

    async function getCombinedPrompt() {
        // OAI has its own prompt manager. No need to do anything here
        if (state.main_api === 'openai') {
            return '';
        }

        // Deep clone
        let finalMesSend = structuredClone(mesSend);

        // Add prompt bias after everything else
        if (promptBias.trim().length !== 0) {
            finalMesSend[finalMesSend.length - 1].message +=
                /\s/.test(finalMesSend[finalMesSend.length - 1].message.slice(-1))
                    ? promptBias.trimStart()
                    : ` ${promptBias.trimStart()}`;
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

            return combinedPrompt;
        };

        finalMesSend.forEach((item, i) => {
            item.injected = injectedIndices.includes(finalMesSend.length - i - 1);
        });

        let data = {
            api: state.main_api,
            combinedPrompt: null,
            description,
            char: state.name2,
            user: state.name1,
            worldInfo,
            beforeScenarioAnchor,
            afterScenarioAnchor,
            storyString,
            mesExmString,
            mesSendString,
            finalMesSend,
            generatedPromptCache,
            main: system,
        };

        // Before returning the combined prompt, give available context related information to all subscribers.
        await eventSource.emit(event_types.GENERATE_BEFORE_COMBINE_PROMPTS, data);

        // If one or multiple subscribers return a value, forfeit the responsibillity of flattening the context.
        return !data.combinedPrompt ? combine() : data.combinedPrompt;
    }

    let finalPrompt = await getCombinedPrompt();

    const eventData = { prompt: finalPrompt, dryRun: dryRun };
    await eventSource.emit(event_types.GENERATE_AFTER_COMBINE_PROMPTS, eventData);
    finalPrompt = eventData.prompt;

    let generate_data;
    switch (state.main_api) {
        case 'openai': {
            let [prompt] = await prepareOpenAIMessages({
                name2: state.name2,
                charDescription: description,
                worldInfo: worldInfo,
                extensionPrompts: state.extension_prompts,
                bias: promptBias,
                type: type,
                quietPrompt: quiet_prompt,
                quietImage: quietImage,
                messages: oaiMessages,
                pipelineStepTag: getPipelineTriggerTag(type),
            }, dryRun);
            generate_data = { prompt: prompt };

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
     * Calls the streaming or non-streaming generation API.
     * @returns {Promise<void|*|Awaited<*>|String|{fromStream}|string|undefined|Object>}
     * @throws {Error|object} Error with message text, or Error with response JSON
     */
    let activeRecoveryMessageId = null;

    /**
     * Final-direct path: the completed pipeline step's result IS the reply.
     * Writes the assistant message, mirrors the normal generation tail, and
     * returns the same String shape the API chain expects.
     */
    async function finalizePipelineReply({ type, text, step, meta, reasoning = '', reasoningSignature = null, title = '', imageUrls = null, fromStream = false }) {
        // Tool results are already authored content: skip stopping-string
        // trimming (it silently truncates) but keep the AI_OUTPUT regex pass.
        const cleaned = cleanUpMessage({
            getMessage: text,
            displayIncompleteSentences: false,
            stoppingStrings: [],
        });

        // Fold the run's progress card into the reply: its invocations move onto
        // the assistant message and its (already regex-styled) markup is appended
        // to `mes`, so one turn renders as ONE message. Prompt assembly strips
        // the trailing <section data-pipeline-card> before sending.
        const runId = meta?.runId ?? null;
        let cardMarkup = '';
        let mergedInvocations = null;
        if (runId) {
            const cardIndex = state.chat.findLastIndex(message => Array.isArray(message?.extra?.tool_invocations)
                && message.extra?.reply_pipeline_run === runId);
            if (cardIndex >= 0) {
                const cardMessage = state.chat[cardIndex];
                cardMarkup = cardMessage.mes ?? '';
                mergedInvocations = cardMessage.extra.tool_invocations;
                state.chat.splice(cardIndex, 1);
                if (isReactMainChatOwner()) {
                    void mountReactMainChatMessageListPanel();
                } else {
                    state.chatElement.find(`.mes[mesid="${cardIndex}"]`).remove();
                }
                await eventSource.emit(event_types.MESSAGE_DELETED, state.chat.length);
            }
        }

        const finalText = cardMarkup ? `${cleaned}\n${cardMarkup}` : cleaned;
        const saved = await saveReply({ type, getMessage: finalText, reasoning, reasoningSignature, title, imageUrls });
        const savedMessage = state.chat[state.chat.length - 1];
        if (savedMessage?.extra) {
            savedMessage.extra.reply_pipeline_run = runId;
            savedMessage.extra.reply_pipeline_step = step?.id ?? null;
            if (mergedInvocations) {
                savedMessage.extra.tool_invocations = mergedInvocations;
            }
        }
        endPipelineRun();
        await saveChatConditional();
        unblockGeneration(type);
        state.streamingProcessor = null;
        scheduleMainChatMessageListPanelRefresh();
        return Object.defineProperties(new String(saved.getMessage), {
            'messageChunk': { value: cleaned },
            ...(fromStream ? { 'fromStream': { value: true } } : {}),
        });
    }

    async function finishGenerating() {
        console.debug('rungenerate calling API');

        showStopButton();

        const lifecyclePlan = createGenerationCommandPlan(generationEnvelope.command, {
            fallbackReady: hasFallbackProviderForGeneration({
                settings: state.oai_settings,
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
                state.streamingProcessor = new GenerationStreamSession(type, force_name2, state.generation_started, promptReasoning);
                state.streamingProcessor.suppressErrorRecovery = isIntermediateAttempt;
                state.streamingProcessor.fromFallbackAttempt = Boolean(attempt.fallbackProvider);
                if (activeRecoveryMessageId !== null && activeRecoveryMessageId >= 0) {
                    state.streamingProcessor.messageId = activeRecoveryMessageId;
                }

                state.streamingProcessor.generator = await sendStreamingRequest(type, generate_data, requestOptions);

                let getMessage = await state.streamingProcessor.generate();
                if (state.streamingProcessor.abortController.signal.aborted && state.streamingProcessor.isFinished) {
                    throw new Error('Generation was aborted.');
                }
                let messageChunk = cleanUpMessage({
                    getMessage: getMessage,
                    displayIncompleteSentences: false,
                });

                const isStreamFinished = state.streamingProcessor && !state.streamingProcessor.isStopped && state.streamingProcessor.isFinished;
                const isStreamWithToolCalls = state.streamingProcessor && Array.isArray(state.streamingProcessor.toolCalls) && state.streamingProcessor.toolCalls.length;
                if (canPerformToolCalls && isStreamFinished && isStreamWithToolCalls) {
                    const lastMessage = state.chat[state.chat.length - 1];
                    const hasToolCalls = state.ToolManager.hasToolCalls(state.streamingProcessor.toolCalls);
                    const shouldDeleteMessage = ['', '...'].includes(lastMessage?.mes) && !lastMessage?.extra?.reasoning && ['', '...'].includes(state.streamingProcessor?.result);
                    if (hasToolCalls && shouldDeleteMessage) await deleteLastMessage();
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
                            endPipelineRun();
                            unblockGeneration(type);
                            state.streamingProcessor = null;
                            return;
                        }

                        const pipelineProcessor = state.streamingProcessor;
                        const pipelineReasoning = pipelineProcessor.reasoningHandler.reasoning;
                        const pipelineReasoningSignature = pipelineProcessor.reasoningSignature;
                        const pipelineDecision = preparePipelineRound(invocationResult.invocations);
                        state.streamingProcessor = null;
                        await state.ToolManager.saveFunctionToolInvocations(invocationResult.invocations);
                        if (pipelineDecision?.action === 'final') {
                            rememberMainChatStreamingTransportProcessorTerminal(pipelineProcessor, 'completed');
                            return await finalizePipelineReply({
                                type,
                                text: pipelineDecision.text,
                                step: pipelineDecision.step,
                                meta: pipelineDecision.meta,
                                reasoning: pipelineReasoning,
                                reasoningSignature: pipelineReasoningSignature,
                                fromStream: true,
                            });
                        }
                        depth = depth + 1;
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
                    // A run reaching this tail ended without tool calls:
                    // fallback completion or mid-run abandonment.
                    endPipelineRun();
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
            const carriesToolCalls = canPerformToolCalls && state.ToolManager.hasToolCalls(result);
            if (!carriesToolCalls && isEmptyGenerationResult(result)) {
                throw createEmptyReplyFailure(activeRecoveryMessageId);
            }
            return result;
        };

        const prepareRetryAttempt = async (attempt, attemptIndex) => {
            if (attemptIndex <= 0) {
                return;
            }

            await ensureRecoveryMessage(activeRecoveryMessageId);

            clearGenerationAttemptMessage(activeRecoveryMessageId);
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
                    clearGenerationAttemptMessage(activeRecoveryMessageId);
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
            clearGenerationAttemptMessage(activeRecoveryMessageId);
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

        messageChunk = cleanUpMessage({
            getMessage: getMessage,
            displayIncompleteSentences: false,
        });


        reasoning = getRegexedString(reasoning, state.regex_placement.REASONING);

        reasoning = reasoning.trim();

        //Formating
        const displayIncomplete = type === 'quiet' && !quietToLoud;
        getMessage = cleanUpMessage({
            getMessage: getMessage,
            displayIncompleteSentences: displayIncomplete,
        });

        if (type == 'quiet') {
            unblockGeneration(type);
            return getMessage;
        } else {
            const finalization = getGenerationSuccessFinalization({
                hasActiveRecoveryMessage: isAssistantRecoveryMessageId(activeRecoveryMessageId),
                type,
            });
            if (finalization.action === 'replace_recovery_message') {
                ({ type, getMessage } = await replaceAssistantRecoveryMessage(activeRecoveryMessageId, {
                    type,
                    getMessage,
                    title,
                    reasoning,
                    imageUrls,
                    reasoningSignature,
                }));
                clearGenerationAutoRecoveryStatus(activeRecoveryMessageId);
            } else {
                ({ type, getMessage } = await saveReply({ type: finalization.type, getMessage, title, reasoning, imageUrls, reasoningSignature }));
            }
        }

        if (canPerformToolCalls) {
            const hasToolCalls = state.ToolManager.hasToolCalls(data);
            const shouldDeleteMessage = ['', '...'].includes(getMessage) && !reasoning;
            if (hasToolCalls && shouldDeleteMessage) await deleteLastMessage();
            const invocationResult = await state.ToolManager.invokeFunctionTools(data, { reasoningText: reasoning });
            const shouldStopGeneration = (!invocationResult.invocations.length && shouldDeleteMessage) || invocationResult.stealthCalls.length;
            if (hasToolCalls) {
                if (shouldStopGeneration) {
                    if (Array.isArray(invocationResult.errors) && invocationResult.errors.length) {
                        state.ToolManager.showToolCallError(invocationResult.errors);
                    }
                    endPipelineRun();
                    unblockGeneration(type);
                    return;
                }

                const pipelineDecision = preparePipelineRound(invocationResult.invocations);
                await state.ToolManager.saveFunctionToolInvocations(invocationResult.invocations);
                if (pipelineDecision?.action === 'final') {
                    return await finalizePipelineReply({
                        type,
                        text: pipelineDecision.text,
                        step: pipelineDecision.step,
                        meta: pipelineDecision.meta,
                        reasoning,
                        reasoningSignature,
                        title,
                        imageUrls,
                    });
                }
                depth = depth + 1;
                return Generate('normal', { automatic_trigger, force_name2, quiet_prompt, quietToLoud, skipWIAN, signal, quietImage, quietName, depth }, dryRun);
            }
        }

        console.debug('/api/chats/save called by /Generate');
        // Reaching the normal tail means no tool calls were processed: the run
        // ended via fallback completion or mid-run abandonment.
        endPipelineRun();
        await saveChatConditional();
        unblockGeneration(type);
        state.streamingProcessor = null;

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

        endPipelineRun();
        unblockGeneration(type);
        console.log(exception);
        state.streamingProcessor = null;
        throw exception;
    }
}
//MARK: Generate() ends

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

