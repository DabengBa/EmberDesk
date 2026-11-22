import toastr from '../../../public/scripts/notifications.js';
import { TOKEN_PADDING, inject_ids } from '../../../public/scripts/constants.js';
import { executeGenerationAttempts, createGenerationCommandPlan, createGenerationRequestEnvelope } from '../../../public/scripts/chat-generation-command-service.js';
import * as generationCommandService from '../../../public/scripts/chat-generation-command-service.js';
import {
    getGenerationFailureDecision,

    hasFallbackProviderForGeneration,
} from '../../../public/scripts/chat-generation-lifecycle.js';
import { getWorldInfoPrompt } from '../../../public/scripts/world-info-service.js';
import { getGenerationLifecycleService as getLegacyGenerationLifecycleService, requireGenerationShellContext } from '../../../public/scripts/generation-shell-context.js';
import type { createGenerationLifecycleService, OwnedGenerationStreamState, StreamMessagePorts, GenerationLease, PipelineFinalInput } from './attempt-executor';
import { getComposerSnapshot, clearComposerValue } from '../../../public/scripts/main-chat-composer-service.js';
import { applyChatMemoryToCoreChat } from '../../../public/scripts/chat-memory-service.js';
import {
    endPipelineRun,
    getPipelineTriggerTag,
    getPreviewPipelineTriggerTag,
    getRunnablePipeline,
    getPipelineStepMeta,
    getCurrentPipelineStep,
    isPipelineFallbackRound,
    preparePipelineRound,
    pipelineTextInvocations,
    previewPipelineRequestShaping,
    resolvePipelineModel,
    resolvePreviewPipelineModel,
} from '../../../public/scripts/reply-pipeline.js';
import { getChatCompletionModelFromSettings, isChatCompletionStreaming } from '../../../public/scripts/openai-provider-capabilities.js';
import { getFallbackOpenAIModel } from '../../../public/scripts/chat-generation-auto-recovery.js';
import { t } from '../../../public/scripts/i18n.js';
import { assertPipelineResponseAllowed, getActivePipelineRunId, getPipelineRunState } from '../../../public/scripts/reply-pipeline-core.js';
import { derivePreviewBudget, isUserStoppedGenerationError } from './shared-state';

export { derivePreviewBudget } from './shared-state';

function shell() {
    return requireGenerationShellContext();
}

// The lifecycle is installed from the typed workspace bundle through a legacy JS registry.
function getGenerationLifecycleService(): ReturnType<typeof createGenerationLifecycleService> {
    return getLegacyGenerationLifecycleService() as ReturnType<typeof createGenerationLifecycleService>;
}

// Generation options are populated by the legacy shell and provider extensions.
type ShellEnvelope = Omit<ReturnType<typeof import('./shared-state').createGenerationRequestEnvelope>, 'options'> & { options: any };

/**
 * Whether a generation exception is a deliberate user stop rather than a
 * failure worth rolling a regenerate snapshot back for.
 * @param {Error|object} exception Error or response JSON
 * @returns {boolean}
 */
export function isUserStoppedGeneration(exception: unknown) {
    return isUserStoppedGenerationError(exception, Boolean(shell().state.abortController?.signal?.aborted));
}


const addChatsSeparator = (...args: any[]) => shell().addChatsSeparator(...args);
const cleanUpMessage = (...args: any[]) => shell().cleanUpMessage(...args);
const clearGenerationAttemptMessage = (...args: any[]) => shell().clearGenerationAttemptMessage(...args);
const clearGenerationAutoRecoveryStatus = (...args: any[]) => shell().clearGenerationAutoRecoveryStatus(...args);
const deactivateSendButtons = (...args: any[]) => shell().deactivateSendButtons(...args);
const deleteLastMessage = (...args: any[]) => shell().deleteLastMessage(...args);
const doChatInject = (...args: any[]) => shell().doChatInject(...args);
const extractImagesFromData = (...args: any[]) => shell().extractImagesFromData(...args);
const extractJsonFromData = (...args: any[]) => shell().extractJsonFromData(...args);
const extractMessageFromData = (...args: any[]) => shell().extractMessageFromData(...args);
const extractTitleFromData = (...args: any[]) => shell().extractTitleFromData(...args);
const flushWIInjections = (...args: any[]) => shell().flushWIInjections(...args);
const formatMessageHistoryItem = (...args: any[]) => shell().formatMessageHistoryItem(...args);
const getBiasStrings = (...args: any[]) => shell().getBiasStrings(...args);
const getCharacterCardFields = (...args: any[]) => shell().getCharacterCardFields(...args);
const getExtensionPrompt = (...args: any[]) => shell().getExtensionPrompt(...args);
const getExtensionPromptRoleByName = (...args: any[]) => shell().getExtensionPromptRoleByName(...args);
const getGenerationLifecycleStatusLabels = (...args: any[]) => shell().getGenerationLifecycleStatusLabels(...args);
const getMaxPromptTokens = (...args: any[]) => shell().getMaxPromptTokens(...args);
const isAssistantRecoveryMessageId = (...args: any[]) => shell().isAssistantRecoveryMessageId(...args);
const isStreamingEnabled = (...args: any[]) => shell().isStreamingEnabled(...args);

const pingServer = (...args: any[]) => shell().pingServer(...args);
const rememberMainChatStreamingTransportProcessorTerminal = (...args: any[]) => shell().rememberMainChatStreamingTransportProcessorTerminal(...args);
const removeDepthPrompts = (...args: any[]) => shell().removeDepthPrompts(...args);
const removeMacros = (...args: any[]) => shell().removeMacros(...args);
const removeRegenerateTurnTail = (...args: any[]) => shell().removeRegenerateTurnTail(...args);
const restoreRegenerateTurnTail = (...args: any[]) => shell().restoreRegenerateTurnTail(...args);
const replaceAssistantRecoveryMessage = (...args: any[]) => shell().replaceAssistantRecoveryMessage(...args);
const saveChatConditional = (...args: any[]) => shell().saveChatConditional(...args);
const saveReply = (...args: any[]) => shell().saveReply(...args);
const scheduleMainChatMessageListPanelRefresh = (...args: any[]) => shell().scheduleMainChatMessageListPanelRefresh(...args);
const sendGenerationRequest = (...args: any[]) => shell().sendGenerationRequest(...args);
const sendMessageAsUser = (...args: any[]) => shell().sendMessageAsUser(...args);
const sendStreamingRequest = (...args: any[]) => shell().sendStreamingRequest(...args);
const setExtensionPrompt = (...args: any[]) => shell().setExtensionPrompt(...args);
const setGenerationProgress = (...args: any[]) => shell().setGenerationProgress(...args);
const setInContextMessages = (...args: any[]) => shell().setInContextMessages(...args);
const showGenerationAutoRecoveryStatus = (...args: any[]) => shell().showGenerationAutoRecoveryStatus(...args);
const showGenerationFailureRecovery = (...args: any[]) => shell().showGenerationFailureRecovery(...args);
const showStopButton = (...args: any[]) => shell().showStopButton(...args);
const substituteParams = (...args: any[]) => shell().substituteParams(...args);
const unblockGeneration = (...args: any[]) => shell().unblockGeneration(...args);
const unshallowCharacter = (...args: any[]) => shell().unshallowCharacter(...args);
const Generate = (...args: any[]) => shell().Generate(...args);

const getStoppingStrings = (...args: any[]) => shell().getStoppingStrings(...args);

const mountReactMainChatMessageListPanel = (...args: any[]) => shell().mountReactMainChatMessageListPanel(...args);
const processImageAttachment = (...args: any[]) => shell().processImageAttachment(...args);
const scrollChatToBottom = (...args: any[]) => shell().scrollChatToBottom(...args);
const appendFileContent = (...args: any[]) => shell().appendFileContent(...args);
const extractReasoningFromData = (...args: any[]) => shell().extractReasoningFromData(...args);
const extractReasoningSignatureFromData = (...args: any[]) => shell().extractReasoningSignatureFromData(...args);
const getRegexedString = (...args: any[]) => shell().getRegexedString(...args);
const getTokenCountAsync = (...args: any[]) => shell().getTokenCountAsync(...args);
const hasPendingFileAttachment = (...args: any[]) => shell().hasPendingFileAttachment(...args);
const STREAMING_FPS = 30;

const sendSystemMessage = (...args: any[]) => shell().sendSystemMessage(...args);
const buildUserMessage = (...args: any[]) => shell().buildUserMessage(...args);
const buildChatCompletionRequest = (...args: any[]) => shell().buildChatCompletionRequest(...args);
const prepareOpenAIMessages = (...args: any[]) => shell().prepareOpenAIMessages(...args);
const renderStoryString = (...args: any[]) => shell().renderStoryString(...args);
const setOpenAIMessages = (...args: any[]) => shell().setOpenAIMessages(...args);
const countOccurrences = (...args: any[]) => shell().countOccurrences(...args);
const isOdd = (...args: any[]) => shell().isOdd(...args);
const delay = (...args: any[]) => shell().delay(...args);

export interface GenerationStreamSession extends OwnedGenerationStreamState {}
export class GenerationStreamSession {
    #streamState;
    declare messageDom: HTMLElement | null;
    declare messageTextDom: HTMLElement | null;
    declare messageTimerDom: HTMLElement | null;
    declare type: string;
    declare force_name2: boolean;
    declare ownsRun: () => boolean;
    declare generator: () => AsyncGenerator<{ text: string; toolCalls: unknown[]; state?: { reasoning?: unknown; images?: string[]; signature?: string | null } }>;
    declare reasoningHandler: { process(messageId: number, changed: boolean, prompt: unknown): Promise<unknown>; finish(messageId: number): Promise<unknown>; updateReasoning(messageId: number, reasoning: unknown): void };
    declare promptReasoning: unknown;
    declare stoppingStrings: string[];
    /**
     * Creates a new streaming processor.
     * @param {string} type Generation type
     * @param {boolean} forceName2 If true, force the use of name2
     * @param {Date} timeStarted Date when generation was started
     * @param {PromptReasoning} promptReasoning Prompt reasoning instance
     */
    constructor(type: string, forceName2: boolean, timeStarted: Date, promptReasoning: unknown, ownsRun = () => true) {
        this.#streamState = getGenerationLifecycleService().createStreamState(timeStarted);
        // Keep the existing session API while the installed typed lifecycle owns the mutable stream data.
        for (const key of Object.keys(this.#streamState) as Array<keyof OwnedGenerationStreamState>) {
            Object.defineProperty(this, key, {
                enumerable: true,
                configurable: true,
                get: () => this.#streamState[key],
                set: value => { (this.#streamState as any)[key] = value; },
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


    markUIGenStarted() {
        deactivateSendButtons();
    }

    markUIGenStopped() {
        unblockGeneration();
    }

    /** Browser effects for the installed typed stream message lifecycle. */
    #messagePorts(): StreamMessagePorts {
        return {
            getMessage: id => shell().state.chat[id],
            indexOfMessage: message => shell().state.chat.indexOf(message),
            saveInitial: (text, ownsRun) => saveReply({ type: this.type, getMessage: text, fromStreaming: true, ownsRun }),
            lastMessageId: () => shell().state.chat.length - 1,
            checkDom: async () => {},
            updateVisibility: () => {},
            clean: (text, isFinal, stoppingStrings) => cleanUpMessage({ getMessage: text, displayIncompleteSentences: !isFinal, stoppingStrings }),
            count: (text, token) => countOccurrences(text, token),
            isOdd: count => isOdd(count),
            startUI: () => this.markUIGenStarted(),
            stopUI: () => this.markUIGenStopped(),
            scroll: () => scrollChatToBottom({ waitForFrame: true }),
            isScrollLocked: () => shell().state.scrollLock,
            refresh: () => scheduleMainChatMessageListPanelRefresh(),
            mount: () => { void mountReactMainChatMessageListPanel(); },
            addCopyButtons: () => {},
            processImages: (message, imageUrls, ownsRun) => processImageAttachment(message, { imageUrls, ownsRun }),
            renderImages: () => scheduleMainChatMessageListPanelRefresh(),
            emitReceived: (id, type) => shell().emitGenerationEvent('MESSAGE_RECEIVED', id, type),
            emitRendered: (id, type) => shell().emitGenerationEvent('CHARACTER_MESSAGE_RENDERED', id, type),
            saveChat: ownsRun => saveChatConditional(ownsRun),
            showFailure: id => showGenerationFailureRecovery(id),
        };
    }

    async onStartStreaming(text: string) {
        return getGenerationLifecycleService().startStreamMessage(this, this.#messagePorts(), text);
    }

    async onProgressStreaming(messageId: number, text: string, isFinal?: boolean) {
        return getGenerationLifecycleService().progressStreamMessage(this, this.#messagePorts(), messageId, text, isFinal as boolean);
    }

    async finalizeIntermediaryMessage(messageId: number, text: string, { unlockUI = true }: { unlockUI?: boolean }) {
        return getGenerationLifecycleService().finalizeStreamMessage(this, this.#messagePorts(), messageId, text, unlockUI);
    }

    async onFinishStreaming(messageId: number, text: string) {
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
            emitToken: text => shell().emitGenerationEvent('STREAM_TOKEN_RECEIVED', text),
            mount: () => { void mountReactMainChatMessageListPanel(); },
        });
    }
}

export function getCurrentGenerationContextIdentity() {
    return { chatId: shell().state.characters?.[shell().state.this_chid]?.chat ?? null, chatReference: shell().state.chat, contextRevision: getComposerSnapshot().contextRevision };
}

export async function executeGenerationRequestInShell(generationEnvelope: ShellEnvelope) {
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

async function executeOwnedGenerationRequestInShell(generationEnvelope: ShellEnvelope, lease: GenerationLease) {
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
                    emitStarted: () => shell().emitGenerationEvent('GENERATION_STARTED', type, { automatic_trigger, force_name2, quiet_prompt, quietToLoud, skipWIAN, signal, quietImage, depth, regenerate: entry.isRegenerate, promptContext }, entry.dryRun),
                    commands: async () => false,
                    emitAfterCommands: () => shell().emitGenerationEvent('GENERATION_AFTER_COMMANDS', type, { automatic_trigger, force_name2, quiet_prompt, quietToLoud, skipWIAN, signal, quietImage, regenerate: entry.isRegenerate, promptContext }, entry.dryRun),
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
                        scan: (...args) => (getWorldInfoPrompt as (...args: any[]) => Promise<any>)(...args, { ownsRun: () => lease.owns(), promptMap: promptContext.scanPrompts() }),
                        flush: () => flushWIInjections(promptContext.requestPrompts()),
                        inject: (text, depth, role) => setExtensionPrompt(inject_ids.CUSTOM_WI_DEPTH_ROLE(depth, role), text, shell().state.extension_prompt_types.IN_CHAT, depth, false, role, null, promptContext.requestPrompts()),
                        anchor: kind => getExtensionPrompt(kind === 'before' ? shell().state.extension_prompt_types.BEFORE_PROMPT : shell().state.extension_prompt_types.IN_PROMPT, undefined, undefined, undefined, undefined, promptContext.requestPrompts()),
                        render: (params, options?: object) => renderStoryString(params, { ...options, promptMap: promptContext.requestPrompts() }),
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
                        before: data => shell().emitGenerationEvent('GENERATE_BEFORE_COMBINE_PROMPTS', data, { promptContext }),
                        after: data => shell().emitGenerationEvent('GENERATE_AFTER_COMBINE_PROMPTS', data, { promptContext }),
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
                    emit: (value, isDryRun) => shell().emitGenerationEvent('GENERATE_AFTER_DATA', value, isDryRun, { promptContext }),
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
            const { stages: stageResult, promptReasoning } = assembly;
            // runOwnedRequest dispatches only after it has excluded terminal/null stages.
            const stages = stageResult as Extract<NonNullable<typeof stageResult>, { kind: 'dispatch' }>;
            const generate_data = stages.data;
            force_name2 = stages.forceName;
            async function finalizePipelineReply(input: PipelineFinalInput) {
                return getGenerationLifecycleService().finalizePipelineReply(input, {
                    ownsRun: () => lease.owns(),
                    chat: shell().state.chat,
                    clean: text => cleanUpMessage({ getMessage: text, displayIncompleteSentences: false, stoppingStrings: [] }),
                    formatTags: (invocations, text) => shell().state.ToolManager.formatPipelineTagMarkup(invocations, text),
                    regexOutput: text => getRegexedString(text, shell().state.regex_placement.AI_OUTPUT),
                    removeCardView: () => { void mountReactMainChatMessageListPanel(); },
                    emitDeleted: length => shell().emitGenerationEvent('MESSAGE_DELETED', length),
                    saveReply: reply => saveReply(reply),
                    endPipeline: () => endPipelineRun(),
                    saveChat: ownsRun => saveChatConditional(ownsRun),
                    unblock: generationType => unblockGeneration(generationType),
                    clearProcessor: () => { shell().state.streamingProcessor = null; },
                    refresh: () => scheduleMainChatMessageListPanelRefresh(),
                });
            }

            const deleteRecoveryPlaceholder = async (recovery: { hasIdentity: boolean; messageId: number | null }) => {
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
                trace: requestTrace as typeof requestTrace & { pipelineRun?: unknown; pipelineStep?: unknown }, signal: submissionSignal, cancelSignal: signal, jsonSchema, quietToLoud,
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
                    await saveReply({ type, getMessage: '', fromStreaming: true, ownsRun: () => lease.owns(), onMessageCreated: (created: object) => { message = created; } });
                    const messageId = message ? chat.indexOf(message) : -1;
                    if (!lease.owns() || shell().state.chat !== chat || messageId < 0) throw new Error('Generation recovery message is no longer available.');
                    return { messageId, identity: message as unknown as object };
                },
                getModel: () => shell().state.generatingAttemptModel,
                setModel: model => { shell().state.generatingAttemptModel = model; },
                continueGeneration: (generationType, nextDepth) => Generate(generationType, { automatic_trigger, force_name2, quiet_prompt, quietToLoud, skipWIAN, signal, quietImage, quietName, depth: nextDepth }, dryRun),
                transport: (dispatchState, recovery) => ({
                    presetModel: () => getChatCompletionModelFromSettings(shell().state.oai_settings),
                    fallbackModel: () => getFallbackOpenAIModel(shell().state.oai_settings),
                    pipelineModel: resolvePipelineModel as (model: string, options: { fallbackModel: string | null }) => string,
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
                    textInvocations: (text, reasoning, assistant) => dispatchState.type === 'normal' ? (pipelineTextInvocations as (text: string, reasoning: string, assistant: unknown) => any)(text, reasoning, assistant) : null,
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
                    prepareRound: preparePipelineRound as (invocations: unknown[]) => any,
                    saveInvocations: invocations => shell().state.ToolManager.saveFunctionToolInvocations(invocations, { ownsRun: () => dispatchState.ownsCleanup() && (!recovery.hasIdentity || recovery.messageId !== null) }),
                    markComplete: current => rememberMainChatStreamingTransportProcessorTerminal(current, 'completed'),
                    finalizePipeline: finalizePipelineReply as (input: any) => Promise<unknown>,
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
                    step: getCurrentPipelineStep as () => { tool: unknown } | null,
                    isFallback: isPipelineFallbackRound,
                    execute: executeGenerationAttempts,
                    successfulMessageId: () => shell().state.chat.length - 1,
                    clearSuccessStatus: clearGenerationAutoRecoveryStatus,
                    processorMessageId: () => shell().state.streamingProcessor?.messageId,
                    decideFailure: input => getGenerationFailureDecision({ ...input, shouldAutoRecover: input.shouldAutoRecover && !isUserStoppedGeneration(input.failure) }),
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
                    hasPipeline: () => Boolean(getPipelineRunState()),
                    textInvocations: (text, reasoning, assistant) => dispatchState.type === 'normal' ? (pipelineTextInvocations as (text: string, reasoning: string, assistant: unknown) => any)(text, reasoning, assistant) : null,
                    deleteLastMessage: () => deleteRecoveryPlaceholder(recovery),
                    invokeTools: (response, reasoningText, ownsRun) => shell().state.ToolManager.invokeFunctionTools(response, { reasoningText, ownsRun }),
                    showToolErrors: errors => shell().state.ToolManager.showToolCallError(errors),
                    preparePipeline: invocations => (preparePipelineRound as (invocations: unknown[]) => any)(invocations),
                    saveTools: (invocations, ownsRun) => shell().state.ToolManager.saveFunctionToolInvocations(invocations, { ownsRun }),
                    finalizePipeline: input => finalizePipelineReply(input as PipelineFinalInput),
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
async function buildPreviewRequestResult({ type, generateData, chatCompletion, round, warnings, pendingMessage, pendingEntryIdentifier = null, summarized = [], ownsRun }: {
    type: string; generateData: any; chatCompletion: any; round: number; warnings: string[];
    pendingMessage: any; pendingEntryIdentifier?: string | null; summarized?: unknown; ownsRun: () => boolean;
}) {
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
        budget: (completion, contextTokens, responseTokens) => derivePreviewBudget({ chatCompletion: completion as Parameters<typeof derivePreviewBudget>[0]['chatCompletion'], contextTokens, responseTokens }),
    });
}

/** Preview the next normal request without sending it. */
export async function previewNextGenerationRequest({ round = 0 } = {}) {
    await shell().ensureGenerationRuntime?.();
    return executeGenerationRequestInShell(createGenerationRequestEnvelope({
        type: 'normal',
        options: { preview: { round: Number(round) || 0 } },
        dryRun: true,
        mainApi: shell().state.main_api,
    }) as ShellEnvelope);
}

export function updateEditArrowClasses() {
}

