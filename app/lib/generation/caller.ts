import { runGenerationEntry, runQuietGeneration, createStopGeneration, createTemporaryResponseLength, canRegenerateLastReply as canRegenerateFromState } from './shared-state';
import { collectRegenerateTurn } from '../../../public/scripts/chat-regenerate.js';
import type { createGenerationLifecycleService } from './attempt-executor';

export { buildRawGenerationPrompt } from './shared-state';

type ChatMessage = import('./shared-state').RegenerateMessage;
type Snapshot = ReturnType<typeof import('./shared-state').collectRegenerateTurn> & { ownsRestore?: () => boolean };
type Lifecycle = ReturnType<typeof createGenerationLifecycleService>;
type GenerationOptions = { preview?: unknown; regenerate?: boolean; depth?: number; backgroundGeneration?: boolean; quietToLoud?: boolean; signal?: AbortSignal; [key: string]: unknown };
type Schema = { returnInvalid?: boolean; [key: string]: unknown };
type Prompt = string | { role: string; content?: string | null }[];
type QuietInput = { quietPrompt?: string | null; quietToLoud?: boolean | null; skipWIAN?: boolean | null; quietImage?: string | null; quietName?: string | null; responseLength?: number | null; jsonSchema?: object | null; backgroundGeneration?: boolean | null; removeReasoning?: boolean; trimToSentence?: boolean; onOwnedCompletion?: (result: string, ownsRun: () => boolean) => Promise<void> };
type RawInput = { prompt?: Prompt; api?: string | null; instructOverride?: boolean; quietToLoud?: boolean; systemPrompt?: string; responseLength?: number | null; prefill?: string; jsonSchema?: Schema | null; trimNames?: boolean };

/** Dynamic transport payloads are supplied by extensions and provider implementations. */
export interface GenerationCallerPorts {
    events: { GENERATION_STOPPED: string; GENERATE_AFTER_COMBINE_PROMPTS: string; CHAT_COMPLETION_PROMPT_READY: string; MESSAGE_DELETED: string; CHAT_COMPLETION_SETTINGS_READY: string; GENERATE_AFTER_DATA: string };
    greetingPending(): boolean;
    getComposerSnapshot(): unknown;
    createEnvelope(input: { type: string; options: GenerationOptions; dryRun: boolean; mainApi: string; kind: string }): unknown;
    enterBootstrap(): { signal: AbortSignal; release(): void } | null;
    getIdentity(): { chatId: unknown; chatReference: unknown; contextRevision: unknown };
    ensureRuntime(): Promise<void>;
    execute(envelope: any): Promise<string>;
    isUserStopped(error: unknown): boolean;
    reportRestore(restored: boolean): void;
    endPipeline(): void;
    unblock(type: string): void;
    getMainApi(): string;
    createCommand(input: Record<string, unknown>): Record<string, unknown>;
    createQuietContract(input: Record<string, unknown>): Record<string, unknown>;
    rememberQuiet(snapshot: Record<string, unknown>): void;
    trim(value: string): string;
    removeReasoning(value: string): string;
    isQuietStopped(error: unknown): boolean;
    getResponseLength(api: string): number;
    setResponseLength(api: string | null, length: number): void;
    onceEvent(event: string, hook: () => void): void;
    onEvent(event: string, hook: () => void): void;
    removeEventListener(event: string, hook: () => void): void;
    emitEvent(event: string, ...args: any[]): unknown;
    getChatId(): string | null | undefined;
    getCharacterName(): string;
    createRawPrompt(prompt: Prompt, api: string, instruct: boolean, quiet: boolean, system: string, prefill: string): Prompt;
    sendOpenAIRequest(type: string, data: unknown, signal: AbortSignal, options: { jsonSchema: Schema | null; trace: object }): Promise<any>;
    extractJson(data: any, options: { mainApi: string; returnInvalidJson?: boolean }): any;
    extractMessage(data: any, api: string | null): unknown;
    cleanMessage(input: { getMessage: unknown; displayIncompleteSentences: boolean; trimNames: boolean; trimWrongNames: boolean }): string;
    getChat(): ChatMessage[];
    getNarratorType(): string;
    getLifecycle(): Lifecycle;
    getAbortController(): AbortController | null | undefined;
    clearMessageUi(index: number): void;
    clearVisibleStart(chatId: string | null | undefined): void;
    getEditId(): number | undefined;
    clearEditId(): void;
    markTainted(): void;
    saveDebounced(ownsChat: () => boolean): void;
    saveConditional(ownsRestore: () => boolean): Promise<unknown>;
    redisplay(options: { startIndex: number }): Promise<unknown>;
    scrollToBottom(options: { waitForFrame: boolean }): void;
    isSending(): boolean;
    isConnected(): boolean;
    hasCharacter(): boolean;
    stopBootstrap(): boolean;
    getStreamingProcessor(): { onStopStreaming(): void } | null | undefined;
    rememberProcessorTerminal(processor: { onStopStreaming(): void }, terminal: string): void;
    hideStopButton(): void;
    rememberVisibleTerminal(terminal: string, state: { activeMessageId: null; observedTokenCount: number; observedChunkCount: number }): void;
    mountMessageList(): unknown;
}

/** Caller/session ownership around the existing generation lifecycle and raw transport. */
export function createGenerationCallerService(ports: GenerationCallerPorts) {
    let generationEntryPending = false;
    let regenerateRequestInFlight = false;
    let pendingRegenerateRestore: Snapshot | null = null;
    const TempResponseLength = createTemporaryResponseLength(ports);

    async function Generate(type: string, options: GenerationOptions = {}, dryRun = false) {
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

    async function generateQuietPrompt({ quietPrompt = '', quietToLoud = false, skipWIAN = false, quietImage = null, quietName = null, responseLength = null, jsonSchema = null, backgroundGeneration = false, removeReasoning = true, trimToSentence = false, onOwnedCompletion }: QuietInput = {}) {
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
            generate: options => Generate('quiet', options) as Promise<string>, trim: ports.trim, removeReasoning: ports.removeReasoning, isStopped: ports.isQuietStopped,
        });
    }

    async function generateRawData({ prompt = '', api = null, instructOverride = false, quietToLoud = false, systemPrompt = '', responseLength = null, prefill = '', jsonSchema = null }: RawInput = {}) {
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

    async function generateRaw({ prompt = '', api = null, instructOverride = false, quietToLoud = false, systemPrompt = '', responseLength = null, trimNames = true, prefill = '', jsonSchema = null }: RawInput = {}) {
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

    function collect() { return (collectRegenerateTurn as typeof import('./shared-state').collectRegenerateTurn)(ports.getChat(), { chatId: ports.getChatId() ?? null, narratorType: ports.getNarratorType() }); }
    function removeRegenerateTurnTail(signal?: AbortSignal) {
        const snapshot = collect();
        if (snapshot.messages.length === 0) { pendingRegenerateRestore = null; return null; }
        const lifecycle = ports.getLifecycle();
        const chat = ports.getChat();
        const chatId = ports.getChatId() ?? null;
        return lifecycle.removeRegenerateTail(snapshot, {
            capture: () => lifecycle.captureContextGuard(ports.getAbortController()?.signal, signal),
            clearView: start => { for (let i = ports.getChat().length - 1; i >= start; i--) ports.clearMessageUi(i); ports.clearVisibleStart(ports.getChatId()); },
            clearEditing: start => { if (ports.getEditId() !== undefined && ports.getEditId()! >= start) ports.clearEditId(); },
            chat, markTainted: ports.markTainted,
            save: () => ports.saveDebounced(() => ports.getChat() === chat && (ports.getChatId() ?? null) === chatId),
            deleted: length => { void ports.emitEvent(ports.events.MESSAGE_DELETED, length); },
            render: startIndex => { void ports.redisplay({ startIndex }); },
            register: value => { pendingRegenerateRestore = value; },
        });
    }

    async function restoreRegenerateTurnTail(snapshot: Snapshot | null) {
        if (pendingRegenerateRestore === snapshot) pendingRegenerateRestore = null;
        if (!snapshot || !Array.isArray(snapshot.messages) || snapshot.messages.length === 0) return false;
        const preparation = ports.getLifecycle().prepareRegenerateRestore(snapshot, { chatId: ports.getChatId() ?? null, collect });
        if (preparation.kind === 'empty') return false;
        if (preparation.kind === 'stale') { console.warn('Regenerate restore skipped: chat changed during generation'); return false; }
        if (preparation.kind === 'changed') { console.warn('Regenerate restore skipped: chat tail changed shape'); return false; }
        const attemptTail = (preparation as { kind: 'ready'; tail: Snapshot }).tail;
        return ports.getLifecycle().restoreRegenerateTurn(snapshot as Snapshot & { ownsRestore: () => boolean }, {
            commit() {
                const chat = ports.getChat();
                for (let i = chat.length - 1; i >= attemptTail.insertIndex; i--) ports.clearMessageUi(i);
                if (ports.getEditId() !== undefined && ports.getEditId()! >= attemptTail.insertIndex) ports.clearEditId();
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
        try { await Generate('normal', { regenerate: true }); return true; } catch (error) {
            console.warn('Regenerate failed:', (error as { message?: unknown } | null)?.message ?? error); return false;
        } finally { regenerateRequestInFlight = false; }
    }
    const stopGeneration = createStopGeneration(ports);
    return { Generate, generateQuietPrompt, generateRawData, generateRaw, TempResponseLength, removeRegenerateTurnTail, restoreRegenerateTurnTail, canRegenerateLastReply, regenerateLastReply, stopGeneration,
        get generationEntryPending() { return generationEntryPending; }, get regenerateRequestInFlight() { return regenerateRequestInFlight; }, get pendingRegenerateRestore() { return pendingRegenerateRestore; } };
}
