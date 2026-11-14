import { runGenerationEntry, runQuietGeneration, canRegenerateLastReply as canRegenerateFromState } from './generation-shared-state.js';
import { collectRegenerateTurn } from './chat-regenerate.js';

/** Format raw requests without owning shell state or changing the transport. */
export function buildRawGenerationPrompt(prompt, systemPrompt, prefill, substitute) {
    if (typeof prompt === 'string') {
        prompt = [{ role: 'user', content: prompt.trim() }];
    } else if (prompt.length === 0 && !systemPrompt) {
        throw Error('No messages provided');
    }
    prefill = substitute(prefill ?? '');
    for (const message of prompt) message.content = substitute(message.content ?? '');
    if (systemPrompt) prompt.unshift({ role: 'system', content: substitute(systemPrompt).trim() });
    if (prefill) prompt.push({ role: 'assistant', content: prefill });
    return prompt;
}

/** Caller/session ownership around the existing generation lifecycle and raw transport. */
export function createGenerationCallerService(ports) {
    let generationEntryPending = false;
    let regenerateRequestInFlight = false;
    let pendingRegenerateRestore = null;
    let originalResponseLength = -1;
    let lastApi = null;

    const TempResponseLength = {
        isCustomized: () => originalResponseLength > -1,
        save(api, length) {
            originalResponseLength = ports.getResponseLength(api);
            ports.setResponseLength(api, length);
            lastApi = api;
            console.log('[TempResponseLength] Saved original response length:', originalResponseLength);
        },
        restore(api) {
            if (originalResponseLength === -1) return;
            api ||= lastApi;
            ports.setResponseLength(api, originalResponseLength);
            console.log('[TempResponseLength] Restored original response length:', originalResponseLength);
            originalResponseLength = -1;
            lastApi = null;
        },
        setupEventHook(api) {
            const hook = () => { if (TempResponseLength.isCustomized()) TempResponseLength.restore(api); };
            ports.onceEvent(api === 'openai' ? ports.events.CHAT_COMPLETION_SETTINGS_READY : ports.events.GENERATE_AFTER_DATA, hook);
            return hook;
        },
        removeEventHook(api, hook) {
            ports.removeEventListener(api === 'openai' ? ports.events.CHAT_COMPLETION_SETTINGS_READY : ports.events.GENERATE_AFTER_DATA, hook);
        },
    };

    async function Generate(type, options = {}, dryRun = false) {
        return runGenerationEntry(type, options, dryRun, {
            greetingPending: ports.greetingPending,
            captureComposer: current => ({ ...current, composerSubmission: ports.getComposerSnapshot() }),
            envelope: (entryType, entryOptions, entryDryRun, regenerate) => ports.createEnvelope({ type: entryType, options: entryOptions, dryRun: entryDryRun, mainApi: ports.getMainApi(), kind: regenerate ? 'regenerate' : '' }),
            enter: ports.enterBootstrap,
            setPending: value => { generationEntryPending = value; },
            clearRestore: () => { pendingRegenerateRestore = null; },
            identity: ports.getIdentity, bootstrap: ports.ensureRuntime, execute: ports.execute,
            takeRestore: () => { const snapshot = pendingRegenerateRestore; pendingRegenerateRestore = null; return snapshot; },
            isStopped: ports.isUserStopped, restore: restoreRegenerateTurnTail,
            reportRestore: ports.reportRestore, endPipeline: ports.endPipeline, unblock: ports.unblock,
        });
    }

    async function generateQuietPrompt({ quietPrompt = '', quietToLoud = false, skipWIAN = false, quietImage = null, quietName = null, responseLength = null, jsonSchema = null, backgroundGeneration = false, removeReasoning = true, trimToSentence = false, onOwnedCompletion } = {}) {
        if (arguments.length > 0 && typeof arguments[0] !== 'object') {
            console.trace('generateQuietPrompt called with positional arguments. Please use an object instead.');
            [quietPrompt, quietToLoud, skipWIAN, quietImage, quietName, responseLength, jsonSchema] = arguments;
        }
        return runQuietGeneration({ quietPrompt, quietToLoud, skipWIAN, quietImage, quietName, responseLength, jsonSchema, backgroundGeneration, removeReasoning, trimToSentence, onOwnedCompletion }, {
            snapshot: (kind, loud, background) => ({ ...ports.createCommand({ kind, mainApi: ports.getMainApi(), quietPrompt: true, quietToLoud: loud, backgroundGeneration: background }), ...ports.createQuietContract({ quietToLoud: loud, backgroundGeneration: background }) }),
            remember: ports.rememberQuiet,
            saveLength: length => TempResponseLength.save(ports.getMainApi(), length),
            setupLengthHook: () => TempResponseLength.setupEventHook(ports.getMainApi()),
            isLengthCustomized: TempResponseLength.isCustomized,
            restoreLength: () => TempResponseLength.restore(ports.getMainApi()),
            removeLengthHook: hook => TempResponseLength.removeEventHook(ports.getMainApi(), hook),
            generate: options => Generate('quiet', options), trim: ports.trim, removeReasoning: ports.removeReasoning, isStopped: ports.isQuietStopped,
        });
    }

    async function generateRawData({ prompt = '', api = null, instructOverride = false, quietToLoud = false, systemPrompt = '', responseLength = null, prefill = '', jsonSchema = null } = {}) {
        const trace = { type: 'quiet', chatId: ports.getChatId() ?? null, charName: ports.getCharacterName() };
        if (!api) api = ports.getMainApi();
        const controller = new AbortController();
        const customized = typeof responseLength === 'number' && responseLength > 0;
        let hook = () => {};
        prompt = ports.createRawPrompt(prompt, api, instructOverride, quietToLoud, systemPrompt, prefill);
        const eventController = new AbortController();
        const abortHook = () => { controller.abort(new Error('Cancelled by stop event')); eventController.abort(new Error('Cancelled by extension')); };
        ports.onEvent(ports.events.GENERATION_STOPPED, abortHook);
        try {
            if (customized) TempResponseLength.save(api, responseLength);
            let generateData = {};
            if (typeof prompt === 'string') {
                const eventData = { prompt, dryRun: false };
                await ports.emitEvent(ports.events.GENERATE_AFTER_COMBINE_PROMPTS, eventData);
                prompt = eventData.prompt;
            }
            if (Array.isArray(prompt)) {
                const eventData = { chat: prompt, dryRun: false };
                await ports.emitEvent(ports.events.CHAT_COMPLETION_PROMPT_READY, eventData);
                prompt = eventData.chat;
            }
            eventController.signal.throwIfAborted();
            if (api === 'openai') { generateData = prompt; hook = TempResponseLength.setupEventHook(api); }
            const data = await ports.sendOpenAIRequest('quiet', generateData, controller.signal, { jsonSchema, trace });
            if (data.error) throw new Error(data.response);
            if (jsonSchema) return ports.extractJson(data, { mainApi: api, returnInvalidJson: jsonSchema.returnInvalid });
            return data;
        } finally {
            ports.removeEventListener(ports.events.GENERATION_STOPPED, abortHook);
            if (customized && TempResponseLength.isCustomized()) { TempResponseLength.restore(api); TempResponseLength.removeEventHook(api, hook); }
        }
    }

    async function generateRaw({ prompt = '', api = null, instructOverride = false, quietToLoud = false, systemPrompt = '', responseLength = null, trimNames = true, prefill = '', jsonSchema = null } = {}) {
        if (arguments.length > 0 && typeof arguments[0] !== 'object') {
            console.trace('generateRaw called with positional arguments. Please use an object instead.');
            [prompt, api, instructOverride, quietToLoud, systemPrompt, responseLength, trimNames, prefill, jsonSchema] = arguments;
        }
        const data = await generateRawData({ prompt, api, instructOverride, quietToLoud, systemPrompt, responseLength, prefill, jsonSchema });
        if (jsonSchema) return data;
        const message = ports.cleanMessage({ getMessage: ports.extractMessage(data, api), displayIncompleteSentences: true, trimNames, trimWrongNames: trimNames });
        if (!message) throw new Error('No message generated');
        return message;
    }

    function collect() { return collectRegenerateTurn(ports.getChat(), { chatId: ports.getChatId() ?? null, narratorType: ports.getNarratorType() }); }
    function removeRegenerateTurnTail(signal) {
        const snapshot = collect();
        if (snapshot.messages.length === 0) { pendingRegenerateRestore = null; return null; }
        const lifecycle = ports.getLifecycle();
        const chat = ports.getChat();
        const chatId = ports.getChatId() ?? null;
        return lifecycle.removeRegenerateTail(snapshot, {
            capture: () => lifecycle.captureContextGuard(ports.getAbortController()?.signal, signal),
            clearView: start => { if (ports.isReactOwner()) { for (let i = ports.getChat().length - 1; i >= start; i--) ports.clearMessageUi(i); ports.clearVisibleStart(ports.getChatId()); } },
            clearEditing: start => { if (ports.getEditId() !== undefined && ports.getEditId() >= start) ports.clearEditId(); },
            chat, markTainted: ports.markTainted,
            save: () => ports.saveDebounced(() => ports.getChat() === chat && (ports.getChatId() ?? null) === chatId),
            deleted: length => { void ports.emitEvent(ports.events.MESSAGE_DELETED, length); },
            render: startIndex => { void ports.redisplay({ startIndex }); },
            register: value => { pendingRegenerateRestore = value; },
        });
    }

    async function restoreRegenerateTurnTail(snapshot) {
        if (pendingRegenerateRestore === snapshot) pendingRegenerateRestore = null;
        if (!snapshot || !Array.isArray(snapshot.messages) || snapshot.messages.length === 0) return false;
        const preparation = ports.getLifecycle().prepareRegenerateRestore(snapshot, { chatId: ports.getChatId() ?? null, collect });
        if (preparation.kind === 'empty') return false;
        if (preparation.kind === 'stale') { console.warn('Regenerate restore skipped: chat changed during generation'); return false; }
        if (preparation.kind === 'changed') { console.warn('Regenerate restore skipped: chat tail changed shape'); return false; }
        const attemptTail = preparation.tail;
        return ports.getLifecycle().restoreRegenerateTurn(snapshot, {
            commit() {
                const chat = ports.getChat();
                if (ports.isReactOwner()) for (let i = chat.length - 1; i >= attemptTail.insertIndex; i--) ports.clearMessageUi(i);
                if (ports.getEditId() !== undefined && ports.getEditId() >= attemptTail.insertIndex) ports.clearEditId();
                const removed = chat.length - attemptTail.insertIndex;
                chat.length = attemptTail.insertIndex;
                if (removed > 0) void ports.emitEvent(ports.events.MESSAGE_DELETED, chat.length);
                chat.splice(snapshot.insertIndex, 0, ...snapshot.messages);
                ports.markTainted(); ports.clearVisibleStart(ports.getChatId());
            },
            save: ownsRestore => ports.saveConditional(ownsRestore),
            render: () => ports.redisplay({ startIndex: snapshot.insertIndex }),
            scroll: () => ports.scrollToBottom({ waitForFrame: true }),
        });
    }

    function canRegenerateLastReply() {
        return canRegenerateFromState({ busy: Boolean(ports.greetingPending() || ports.isSending() || regenerateRequestInFlight || generationEntryPending || ports.getEditId() !== undefined), connected: ports.isConnected(), hasCharacter: ports.hasCharacter(), chat: ports.getChat() });
    }
    async function regenerateLastReply() {
        if (!canRegenerateLastReply()) return false;
        regenerateRequestInFlight = true;
        try { await Generate('normal', { regenerate: true }); return true; }
        catch (error) { console.warn('Regenerate failed:', error?.message ?? error); return false; }
        finally { regenerateRequestInFlight = false; }
    }
    function stopGeneration() {
        const bootstrapStopped = ports.stopBootstrap();
        let stopped = false;
        const processor = ports.getStreamingProcessor();
        if (processor) { ports.rememberProcessorTerminal(processor, 'stopped'); processor.onStopStreaming(); stopped = true; }
        const controller = ports.getAbortController();
        if (controller) {
            controller.abort('Clicked stop button'); ports.hideStopButton();
            if (!stopped) ports.rememberVisibleTerminal('stopped', { activeMessageId: null, observedTokenCount: 0, observedChunkCount: 0 });
            stopped = true;
        }
        stopped ||= bootstrapStopped;
        if (stopped) void ports.mountMessageList();
        ports.emitEvent(ports.events.GENERATION_STOPPED);
        return stopped;
    }
    return { Generate, generateQuietPrompt, generateRawData, generateRaw, TempResponseLength, removeRegenerateTurnTail, restoreRegenerateTurnTail, canRegenerateLastReply, regenerateLastReply, stopGeneration,
        get generationEntryPending() { return generationEntryPending; }, get regenerateRequestInFlight() { return regenerateRequestInFlight; }, get pendingRegenerateRestore() { return pendingRegenerateRestore; } };
}
