/** The attempt loop is transport-agnostic; each pipeline round supplies its own attempts. */
import { canRegenerateLastReply, collectRegenerateTurn, derivePreviewBudget, findRegenerateTurnStart, isRegenerateRemovableMessage, isUserStoppedGenerationError, prepareGenerationEnvelope, runGenerationEntry, runQuietGeneration } from './shared-state';

export interface GenerationAttemptInput<Attempt, Result> {
    attempts?: readonly Attempt[];
    prepareRetryAttempt?: (attempt: Attempt, index: number) => Promise<unknown>;
    runAttempt: (attempt: Attempt, index: number) => Promise<Result>;
    handleFailure: (exception: unknown, attempt: Attempt, index: number) => Promise<{ action?: string; exception?: unknown } | null | undefined>;
    signal?: AbortSignal;
    isCancelled?: () => boolean;
}

export interface GenerationContextIdentity {
    chatId: unknown;
    chatReference?: unknown;
    contextRevision: number;
}

export interface GenerationSubmissionState {
    composerSubmission: { contextKey: unknown; contextRevision: number } | null;
    dryRun: boolean;
    submittedChat: unknown;
    currentChat: unknown;
    current: { contextKey: unknown; contextRevision: number } | null;
    ownsRun: boolean;
    submissionAborted: boolean;
    externalAborted: boolean;
}

export interface PromptHistoryInput {
    messages: Array<string | undefined>;
    injectedIndices: number[];
    initialTokens: number;
    maxContext: number;
    isOpenAI: boolean;
}

/** Reserve injected history first, then fill the context in original priority order. */
async function selectPromptHistory(input: PromptHistoryInput, count: (text: string) => Promise<number>): Promise<{ messages: string[]; injectedIndices: number[] }> {
    const selected: Array<string | undefined> = Array.from({ length: input.messages.length });
    let tokens = input.initialTokens;
    if (!input.isOpenAI) {
        for (const index of input.injectedIndices) {
            const item = input.messages[index];
            if (typeof item !== 'string') continue;
            tokens += await count(item.replace(/\r/gm, ''));
            if (!(tokens < input.maxContext)) break;
            selected[index] = item;
        }
        for (let index = 0; index < input.messages.length; index++) {
            if (selected[index] !== undefined) continue;
            const item = input.messages[index];
            if (typeof item !== 'string') continue;
            tokens += await count(item.replace(/\r/gm, ''));
            if (!(tokens < input.maxContext)) break;
            selected[index] = item;
        }
    }
    const messages: string[] = [];
    const injectedIndices: number[] = [];
    for (let index = 0; index < selected.length; index++) {
        const item = selected[index];
        if (item !== undefined) {
            messages.push(item);
            if (input.injectedIndices.includes(index)) injectedIndices.push(messages.length - 1);
        }
    }
    return { messages, injectedIndices };
}

export interface OpenAIRequestInput<Request> {
    type: string;
    isPreview: boolean;
    round: number;
    dryRun: boolean;
    request: Request;
}

export interface OpenAIRequestPorts<Request, Step, Prompt, Completion> {
    getRunnablePipeline(): { steps: Step[] } | null | undefined;
    getPresetModel(): string;
    previewTag(round: number): unknown;
    previewModel(model: string, round: number): string;
    liveModel(model: string): string;
    liveTag(type: string): unknown;
    prepare(request: Request & {
        assemblyModel: string | null;
        pipelineStepModel: string | null;
        pipelineStepTag: unknown;
        pipelinePreviewBase: { step: Step; total: number; tag: unknown; model: string } | null;
        pipelineHistory: boolean;
    }, dryRun: boolean, options: { squash: true | null; bookkeep: boolean }): Promise<readonly [Prompt, unknown, Completion?]>;
}

/** Assemble the request using the existing prompt manager, with pipeline preview budget policy. */
async function assembleOpenAIRequest<Request, Step, Prompt, Completion>(input: OpenAIRequestInput<Request>, ports: OpenAIRequestPorts<Request, Step, Prompt, Completion>) {
    const { type, isPreview, round, dryRun } = input;
    const pipeline = isPreview && type === 'normal' ? ports.getRunnablePipeline() : null;
    const pipelinePreviewBase = pipeline ? {
        step: pipeline.steps[0], total: pipeline.steps.length,
        tag: ports.previewTag(0), model: ports.previewModel(ports.getPresetModel(), 0),
    } : null;
    const [prompt, , chatCompletion] = await ports.prepare({
        ...input.request,
        assemblyModel: isPreview ? ports.previewModel(ports.getPresetModel(), 0) : type === 'normal' ? ports.liveModel(ports.getPresetModel()) : null,
        pipelineStepModel: isPreview ? ports.previewModel(ports.getPresetModel(), round) : type === 'normal' ? ports.liveModel(ports.getPresetModel()) : null,
        pipelineStepTag: isPreview ? ports.previewTag(round) : ports.liveTag(type),
        pipelinePreviewBase,
        pipelineHistory: isPreview && !!ports.previewTag(0),
    }, dryRun, { squash: isPreview ? true : null, bookkeep: !isPreview });
    return { generateData: { prompt }, chatCompletion: chatCompletion ?? null };
}

async function preparePipelineContinuation<Prompt>(ports: {
    ownsRun(): boolean; prepare(): Promise<readonly [Prompt, ...unknown[]]>;
}): Promise<{ prompt: Prompt } | null> {
    if (!ports.ownsRun()) return null;
    const [prompt] = await ports.prepare();
    return ports.ownsRun() ? { prompt } : null;
}

async function publishGenerationData<Data>(data: Data, dryRun: boolean, ports: {
    ownsRun(): boolean; emit(data: Data, dryRun: boolean): Promise<unknown>;
}): Promise<boolean> {
    if (!ports.ownsRun()) return false;
    await ports.emit(data, dryRun);
    return ports.ownsRun();
}

function isSubmissionStale(input: GenerationSubmissionState): boolean {
    const submitted = input.composerSubmission;
    if (!submitted || input.dryRun) return !input.ownsRun;
    return input.currentChat !== input.submittedChat || input.current?.contextKey !== submitted.contextKey
        || input.current?.contextRevision !== submitted.contextRevision || input.submissionAborted || input.externalAborted;
}

function cancelStaleSubmission(input: GenerationSubmissionState, unblock: () => void): boolean {
    const stale = isSubmissionStale(input);
    if (stale && input.composerSubmission && !input.dryRun) unblock();
    return stale;
}

function createRequestEntry<Submission>(input: {
    type: string; dryRun: boolean; depth: number; preview: unknown; regenerate: boolean;
    signal?: AbortSignal; composerSubmission?: Submission;
}, ports: {
    getController(): AbortController | null | undefined; setController(controller: AbortController): void;
    getComposer(): Submission; setSignal(signal: AbortSignal | undefined): void;
}) {
    const isPreview = Boolean(input.preview && typeof input.preview === 'object');
    const dryRun = isPreview || input.dryRun;
    const isRegenerate = input.regenerate === true && input.type === 'normal' && !input.depth && !dryRun;
    const composerSubmission = input.type !== 'quiet' && !input.depth && !isRegenerate && (!dryRun || isPreview)
        ? input.composerSubmission ?? ports.getComposer() : null;
    let controller = ports.getController();
    if (!isPreview && !(controller && input.signal)) {
        controller = new AbortController();
        ports.setController(controller);
    }
    const submissionSignal = controller?.signal;
    ports.setSignal(submissionSignal);
    const executeCommands = input.type !== 'quiet' && !input.depth && !dryRun && !isRegenerate;
    return { isPreview, dryRun, isRegenerate, composerSubmission, submissionSignal, executeCommands };
}

function prepareComposer<Submission extends { value: string }>(input: {
    type: string; depth: number; dryRun: boolean; preview: boolean; regenerate: boolean; submission: Submission | null;
}, ports: {
    isSending(): boolean; setSending(value: boolean): void; currentValue(): string;
    clear(submission: Submission): void; onBusy(): void;
}): { text: string } | null {
    if (input.regenerate) {
        if (ports.isSending()) { ports.onBusy(); return null; }
        ports.setSending(true);
        return { text: '' };
    }
    if (input.type !== 'quiet' && !input.depth && (!input.dryRun || input.preview)) {
        if (!input.preview) ports.setSending(true);
        const submission = input.submission!;
        const text = submission.value;
        if (!input.preview && ports.currentValue() === text) ports.clear(submission);
        return { text };
    }
    return { text: '' };
}

/** Own quiet substitution and the connection gate before request assembly begins. */
function prepareGenerationPreflight(input: { quietPrompt: string | null | undefined; dryRun: boolean }, ports: {
    substitute(value: string): string;
    hasBackendConnection(): boolean;
    clearSending(): void;
}): { quietPrompt: string | null | undefined } | null {
    const quietPrompt = input.quietPrompt ? ports.substitute(input.quietPrompt) : input.quietPrompt;
    if (!input.dryRun && !ports.hasBackendConnection()) {
        ports.clearSending();
        return null;
    }
    return { quietPrompt };
}

/** Decide whether the real regenerate path may remove a turn and return its snapshot. */
function prepareRegeneration<Snapshot>(input: { isRegenerate: boolean; dryRun: boolean; signal?: AbortSignal }, ports: {
    remove(signal?: AbortSignal): Snapshot | null;
}): Snapshot | null {
    if (!input.isRegenerate || input.dryRun) return null;
    return ports.remove(input.signal);
}

/** Commit the selected generated tail synchronously before starting regeneration. */
function removeRegenerateTail<Snapshot extends { insertIndex: number; ownsRestore?: () => boolean }>(snapshot: Snapshot, ports: {
    capture(): () => boolean;
    clearView(index: number): void;
    clearEditing(index: number): void;
    chat: unknown[];
    markTainted(): void;
    save(): void;
    deleted(length: number): void;
    render(index: number): void;
    register(snapshot: Snapshot): void;
}): Snapshot {
    snapshot.ownsRestore = ports.capture();
    ports.clearView(snapshot.insertIndex);
    ports.clearEditing(snapshot.insertIndex);
    ports.chat.length = snapshot.insertIndex;
    ports.markTainted();
    ports.save();
    ports.deleted(ports.chat.length);
    ports.render(snapshot.insertIndex);
    ports.register(snapshot);
    return snapshot;
}

function prepareRegenerateRestore<Tail extends { insertIndex: number }>(
    snapshot: { messages?: unknown; ownsRestore?: () => boolean; chatId: string | null; insertIndex: number } | null,
    ports: { chatId: string | null; collect(): Tail },
): { kind: 'empty' | 'stale' | 'changed' } | { kind: 'ready'; tail: Tail } {
    if (!snapshot || !Array.isArray(snapshot.messages) || snapshot.messages.length === 0) return { kind: 'empty' };
    if (typeof snapshot.ownsRestore !== 'function' || !snapshot.ownsRestore() || ports.chatId !== snapshot.chatId) return { kind: 'stale' };
    const tail = ports.collect();
    return tail.insertIndex === snapshot.insertIndex ? { kind: 'ready', tail } : { kind: 'changed' };
}

export interface GenerationTransportAttempt<Trace, Schema, Fallback> {
    type: string;
    isOpenAI: boolean;
    canPerformTools?: boolean;
    depth?: number;
    attempt: { fallbackProvider: Fallback };
    index: number;
    attemptCount: number;
    jsonSchema: Schema;
    trace: Trace;
}

export interface GenerationTransportContext<Trace, Schema, Fallback> {
    attemptModel: string;
    intermediate: boolean;
    fallback: boolean;
    requestOptions: { jsonSchema: Schema; fallbackProvider: Fallback; model: string; trace: Trace };
}

export interface GenerationTransportPorts<Trace, Schema, Fallback, Response, StreamResult, Generator, StreamText, Processor> {
    ownsRun(): boolean;
    presetModel(): string;
    fallbackModel(): string | null;
    pipelineModel(model: string, options: { fallbackModel: string | null }): string;
    setAttemptModel(model: string): void;
    canPerformTools(model: string): boolean;
    recurseLimit?(): number;
    setCanPerformTools(value: boolean): void;
    isOpenAIStreaming(model: string, type: string): boolean;
    isStreaming(): boolean;
    createStream(context: GenerationTransportContext<Trace, Schema, Fallback>): Processor;
    ownsStream?(processor: Processor): boolean;
    sendStream(options: GenerationTransportContext<Trace, Schema, Fallback>['requestOptions']): Promise<Generator>;
    setStreamGenerator(generator: Generator, processor: Processor): void;
    consumeStream(processor: Processor): Promise<StreamText>;
    streamAborted(processor: Processor): boolean;
    finishStream(context: GenerationTransportContext<Trace, Schema, Fallback>, text: StreamText, processor: Processor): Promise<StreamResult>;
    send(options: GenerationTransportContext<Trace, Schema, Fallback>['requestOptions']): Promise<Response>;
    hasToolCalls(response: Response): boolean;
    assertAllowed(): void;
    isEmpty(response: Response): boolean;
    emptyFailure(): Error;
}

/** Select and run the existing provider transport for one bounded recovery attempt. */
async function runTransportAttempt<Trace, Schema, Fallback, Response, StreamResult, Generator, StreamText, Processor>(input: GenerationTransportAttempt<Trace, Schema, Fallback>, ports: GenerationTransportPorts<Trace, Schema, Fallback, Response, StreamResult, Generator, StreamText, Processor>): Promise<Response | StreamResult> {
    const presetModel = ports.presetModel();
    const fallbackModel = input.attempt.fallbackProvider ? ports.fallbackModel() : null;
    const attemptModel = input.type === 'normal' ? ports.pipelineModel(presetModel, { fallbackModel }) : (fallbackModel || presetModel);
    ports.setAttemptModel(attemptModel);
    const canPerformTools = input.isOpenAI
        ? ports.canPerformTools(attemptModel) && (input.depth ?? 0) < (ports.recurseLimit?.() ?? Infinity)
        : !!input.canPerformTools;
    if (input.isOpenAI) ports.setCanPerformTools(canPerformTools);
    const requestOptions = { jsonSchema: input.jsonSchema, fallbackProvider: input.attempt.fallbackProvider, model: attemptModel, trace: input.trace };
    const streaming = input.isOpenAI ? ports.isOpenAIStreaming(attemptModel, input.type) : ports.isStreaming() && input.type !== 'quiet';
    if (streaming) {
        const context = { attemptModel, intermediate: input.index < input.attemptCount - 1, fallback: Boolean(input.attempt.fallbackProvider), requestOptions };
        const processor = ports.createStream(context);
        const generator = await ports.sendStream(requestOptions);
        if (!ports.ownsRun() || ports.ownsStream?.(processor) === false) throw new Error('Generation was aborted.');
        ports.setStreamGenerator(generator, processor);
        const text = await ports.consumeStream(processor);
        if (!ports.ownsRun() || ports.ownsStream?.(processor) === false || ports.streamAborted(processor)) throw new Error('Generation was aborted.');
        return ports.finishStream(context, text, processor);
    }
    const result = await ports.send(requestOptions);
    if (!ports.ownsRun()) throw new Error('Generation was aborted.');
    if (!canPerformTools && ports.hasToolCalls(result)) ports.assertAllowed();
    if (!(canPerformTools && ports.hasToolCalls(result)) && ports.isEmpty(result)) throw ports.emptyFailure();
    return result;
}

export interface GenerationLease {
    readonly runId: number;
    owns(): boolean;
    setSignal(signal: AbortSignal | undefined): void;
    cancel(): void;
}

export interface GenerationRunInput<Result> {
    foreground: boolean;
    signal?: AbortSignal;
    execute: (lease: GenerationLease) => Promise<Result>;
    onComplete?: (result: NonNullable<Result>, ownsRun: () => boolean) => Promise<void>;
}

export interface RegenerateRestorePorts {
    commit(): void;
    save(ownsRestore: () => boolean): Promise<unknown>;
    render(): Promise<unknown>;
    scroll(): void;
}

/** Mutable stream data has one owner; the browser session only exposes its compatibility properties. */
export interface OwnedGenerationStreamState {
    result: string;
    messageId: number;
    isStopped: boolean;
    isFinished: boolean;
    abortController: AbortController;
    firstMessageText: string;
    timeStarted: Date;
    timeToFirstToken: number | null;
    createdAt: Date;
    toolCalls: unknown[];
    images: string[];
    reasoningSignature: string | null;
    suppressErrorRecovery: boolean;
    isFinalizing: boolean;
    observedTokenCount: number;
    observedChunkCount: number;
    fromFallbackAttempt: boolean;
}

function createStreamState(timeStarted: Date): OwnedGenerationStreamState {
    return {
        result: '', messageId: -1, isStopped: false, isFinished: false,
        abortController: new AbortController(), firstMessageText: '...', timeStarted,
        timeToFirstToken: null, createdAt: new Date(), toolCalls: [], images: [],
        reasoningSignature: null, suppressErrorRecovery: false, isFinalizing: false,
        observedTokenCount: 0, observedChunkCount: 0, fromFallbackAttempt: false,
    };
}

/** Initialize an attempt's stream with the recovery row owned by its pipeline round. */
function initializeAttemptStream<Stream extends { suppressErrorRecovery: boolean; fromFallbackAttempt: boolean; messageId: number }>(
    input: { intermediate: boolean; fallback: boolean; recoveryMessageId: number | null }, create: () => Stream,
): Stream {
    const stream = create();
    stream.suppressErrorRecovery = input.intermediate;
    stream.fromFallbackAttempt = input.fallback;
    if (input.recoveryMessageId !== null && input.recoveryMessageId >= 0) stream.messageId = input.recoveryMessageId;
    return stream;
}

function stopStream(stream: OwnedGenerationStreamState): void {
    stream.abortController.abort();
    stream.isStopped = true;
    stream.isFinalizing = false;
    stream.isFinished = true;
}

export interface RecoveryStatePorts {
    ownsRun(): boolean;
    isRecoveryMessage(id: number | null): boolean;
    createMessage(): Promise<number | { messageId: number; identity: object }>;
    identityAt?(id: number): object | undefined;
    indexOfIdentity?(identity: object): number;
}

/** Mutable dispatch data belongs to the request, not the shared shell. */
function createDispatchState<Processor, Pipeline>(input: {
    type: string; depth: number; canPerformTools: boolean; pipeline: Pipeline;
}, ports: { ownsRun(): boolean; currentProcessor(): Processor | null | undefined }) {
    return {
        type: input.type,
        depth: input.depth,
        canPerformTools: input.canPerformTools,
        pipeline: input.pipeline,
        processor: null as Processor | null,
        nextDepth(): number { return ++this.depth; },
        ownsStream(processor: Processor): boolean {
            return processor != null && ports.ownsRun() && this.processor === processor && ports.currentProcessor() === processor;
        },
        ownsCleanup(): boolean {
            const current = ports.currentProcessor();
            return ports.ownsRun() && (!this.processor || !current || current === this.processor);
        },
        cancelled(): boolean { return !this.ownsCleanup(); },
    };
}

/** A pipeline round owns one recovery row through all its bounded attempts. */
function createRecoveryState(ports: RecoveryStatePorts) {
    let identity: object | undefined;
    let storedId: number | null = null;
    return {
        get messageId(): number | null {
            if (!identity || !ports.indexOfIdentity) return storedId;
            const index = ports.indexOfIdentity(identity);
            return index < 0 ? null : index;
        },
        set messageId(id: number | null) {
            storedId = id;
            identity = id === null ? undefined : ports.identityAt?.(id);
        },
        get hasIdentity(): boolean { return Boolean(identity); },
        async ensure(candidate: number | null = null): Promise<number | null> {
            if (!ports.ownsRun()) return null;
            if (identity) {
                const current = this.messageId;
                if (current === null) throw new Error('Generation recovery message is no longer available.');
                return current;
            }
            if (ports.isRecoveryMessage(candidate)) {
                this.messageId = candidate;
                return this.messageId;
            }
            if (ports.isRecoveryMessage(this.messageId)) return this.messageId;
            const created = await ports.createMessage();
            if (!ports.ownsRun()) return null;
            if (typeof created === 'number') this.messageId = created;
            else { storedId = created.messageId; identity = created.identity; }
            if (this.messageId === null) throw new Error('Generation recovery message is no longer available.');
            return this.messageId;
        },
    };
}

export interface AttemptRecoveryPorts<Attempt> {
    recovery: { messageId: number | null; readonly hasIdentity?: boolean; ensure(candidate: number | null): Promise<unknown> };
    ownsRun(): boolean;
    processorMessageId(): number | null | undefined;
    decideFailure(input: { shouldAutoRecover: boolean; failure: unknown; isIntermediateAttempt: boolean }): { action: string; shouldRestoreAttemptMessage?: boolean; shouldShowFailureRecovery?: boolean };
    clearProcessor(): void;
    clearMessage(id: number | null): void;
    showStatus(id: number | null, status: string, kind: 'fallback' | 'primary'): void;
    deactivate(): void;
    showStop(): void;
    isRecoveryMessage(id: number | null): boolean;
    clearStatus(id: number | null): void;
    showFailure(id: number | null): void;
}

/** Each pipeline round retains its own recovery row across retries. */
function createAttemptRecoveryController<Attempt extends { status: string; label: string }>(input: { shouldAutoRecover: boolean; attemptCount: number }, ports: AttemptRecoveryPorts<Attempt>) {
    const { recovery } = ports;
    async function ensure(candidate: number | null) {
        await recovery.ensure(candidate);
        if (!ports.ownsRun()) throw new Error('Generation was aborted.');
    }
    return {
        async prepareRetryAttempt(attempt: Attempt, index: number): Promise<void> {
            if (index <= 0) return;
            await ensure(recovery.messageId);
            ports.clearMessage(recovery.messageId);
            ports.showStatus(recovery.messageId, attempt.status, attempt.label === 'fallback' ? 'fallback' : 'primary');
            ports.deactivate();
            ports.showStop();
        },
        async handleAttemptFailure(exception: unknown, attempt: Attempt, index: number): Promise<{ action: 'retry' | 'throw'; exception: unknown; attempt: Attempt }> {
            if (recovery.hasIdentity && recovery.messageId === null) throw new Error('Generation recovery message is no longer available.');
            const errorMessageId = typeof exception === 'object' && exception !== null && 'messageId' in exception ? (exception as { messageId?: number | null }).messageId : null;
            const candidate = errorMessageId ?? ports.processorMessageId() ?? recovery.messageId;
            const decision = ports.decideFailure({ shouldAutoRecover: input.shouldAutoRecover, failure: exception, isIntermediateAttempt: index < input.attemptCount - 1 });
            ports.clearProcessor();
            if (decision.action !== 'retry') {
                if (decision.shouldRestoreAttemptMessage) {
                    await ensure(candidate);
                    ports.clearMessage(recovery.messageId);
                } else if (!recovery.hasIdentity && ports.isRecoveryMessage(candidate)) {
                    recovery.messageId = candidate;
                }
                ports.clearStatus(recovery.messageId);
                if (decision.shouldShowFailureRecovery && ports.isRecoveryMessage(recovery.messageId)) ports.showFailure(recovery.messageId);
                return { action: 'throw', exception, attempt };
            }
            await ensure(candidate);
            ports.clearMessage(recovery.messageId);
            return { action: 'retry', exception, attempt };
        },
    };
}

/** Coordinate a round's bounded attempts and recovery row through the installed executor. */
async function runRecoveryAttempts<Attempt extends { status: string; label: string }, Result>(input: {
    attempts: readonly Attempt[]; shouldAutoRecover: boolean; signal?: AbortSignal;
}, ports: AttemptRecoveryPorts<Attempt> & {
    isCancelled(): boolean; execute(input: GenerationAttemptInput<Attempt, Result>): Promise<Result>;
    run(attempt: Attempt, index: number): Promise<Result>; successfulMessageId(): number;
    clearSuccessStatus(id: number): void;
}): Promise<Result> {
    const controller = createAttemptRecoveryController({ shouldAutoRecover: input.shouldAutoRecover, attemptCount: input.attempts.length }, ports);
    return ports.execute({
        attempts: input.attempts, signal: input.signal, isCancelled: ports.isCancelled,
        prepareRetryAttempt: controller.prepareRetryAttempt,
        async runAttempt(attempt, index) {
            const result = await ports.run(attempt, index);
            if (!ports.ownsRun()) throw new Error('Generation was aborted.');
            if (ports.recovery.hasIdentity && ports.recovery.messageId === null) throw new Error('Generation recovery message is no longer available.');
            ports.clearSuccessStatus(ports.recovery.messageId ?? ports.successfulMessageId());
            return result;
        },
        handleFailure: controller.handleAttemptFailure,
    });
}

/** A stopped run may clean up only the exact state it captured. */
function cleanupStoppedGeneration(input: {
    aborted: boolean; expected: GenerationContextIdentity; current: GenerationContextIdentity;
    processor: unknown; expectedProcessor: unknown; pipeline: unknown; expectedPipeline: unknown;
}, ports: { endPipeline(): void; unblock(): void; clearProcessor(): void }): boolean {
    if (!input.aborted || input.current.chatId !== input.expected.chatId
        || input.current.chatReference !== input.expected.chatReference || input.current.contextRevision !== input.expected.contextRevision
        || input.processor !== input.expectedProcessor || input.pipeline !== input.expectedPipeline) return false;
    ports.endPipeline();
    ports.unblock();
    ports.clearProcessor();
    return true;
}

const previewPromptOwners = new WeakMap<Record<string, unknown>, Map<string, PreviewPromptChange>>();
const absentPrompt = Symbol('absent prompt');
type PromptValue = unknown | typeof absentPrompt;
interface PreviewPromptChange { value: PromptValue; previous: PromptValue; parent?: PreviewPromptChange; finished: boolean; properties: PreviewProperties | null }
interface PreviewProperties { nodes: Map<object, PropertyDescriptorMap>; safe: boolean }

// Track nested plain data without invoking accessors; unknown mutable objects are
// conservatively retained rather than erased when the preview is released.
function previewPromptProperties(value: unknown): PreviewProperties | null {
    if (!value || typeof value !== 'object') return null;
    const nodes = new Map<object, PropertyDescriptorMap>();
    const pending: object[] = [value];
    try {
        while (pending.length) {
            const object = pending.pop()!;
            if (nodes.has(object)) continue;
            const prototype = Object.getPrototypeOf(object);
            if (prototype !== Object.prototype && prototype !== null && prototype !== Array.prototype) return { nodes, safe: false };
            if (nodes.size >= 10000) return { nodes, safe: false };
            const properties = Object.getOwnPropertyDescriptors(object);
            nodes.set(object, properties);
            for (const key of Reflect.ownKeys(properties)) {
                const descriptor = Reflect.get(properties, key) as PropertyDescriptor;
                if (descriptor.get || descriptor.set) return { nodes, safe: false };
                if (descriptor.value && typeof descriptor.value === 'object') pending.push(descriptor.value);
            }
        }
        return { nodes, safe: true };
    } catch {
        return { nodes, safe: false };
    }
}

function previewPromptPropertiesMatch(value: unknown, expected: PreviewProperties | null): boolean {
    if (!expected) return true;
    if (!expected.safe || !value || typeof value !== 'object') return false;
    try {
        for (const [object, properties] of expected.nodes) {
            const current = Object.getOwnPropertyDescriptors(object);
            const keys = Reflect.ownKeys(properties);
            if (keys.length !== Reflect.ownKeys(current).length) return false;
            if (!keys.every(key => {
                const a = Reflect.get(properties, key) as PropertyDescriptor | undefined;
                const b = Reflect.get(current, key) as PropertyDescriptor | undefined;
                return !!a && !!b && Object.is(a.value, b.value) && a.get === b.get && a.set === b.set
                    && a.enumerable === b.enumerable && a.configurable === b.configurable && a.writable === b.writable;
            })) return false;
        }
        return true;
    } catch { return false; }
}

/** Track synchronous preview writes and avoid rolling back changed prompt objects. */
async function withPreviewPromptSnapshot<Result>(ports: {
    prompts(): Record<string, unknown>; execute(scope: { mutate<T>(work: () => T): T }): Promise<Result>; ownsRun?: () => boolean;
}): Promise<Result> {
    const changes: Array<{ prompts: Record<string, unknown>; key: string; record: PreviewPromptChange }> = [];
    const read = (prompts: Record<string, unknown>, key: string): PromptValue => Object.hasOwn(prompts, key) ? prompts[key] : absentPrompt;
    const scope = {
        mutate<T>(work: () => T): T {
            const prompts = ports.prompts();
            const before = { ...prompts };
            try { return work(); } finally {
                let owners = previewPromptOwners.get(prompts);
                if (!owners) { owners = new Map(); previewPromptOwners.set(prompts, owners); }
                for (const key of new Set([...Object.keys(before), ...Object.keys(prompts)])) {
                    const previous = read(before, key);
                    const value = read(prompts, key);
                    if (previous === value) continue;
                    const priorOwner = owners.get(key);
                    const record: PreviewPromptChange = { value, previous, parent: priorOwner?.value === previous ? priorOwner : undefined, finished: false, properties: previewPromptProperties(value) };
                    owners.set(key, record);
                    changes.push({ prompts, key, record });
                }
            }
        },
    };
    try {
        return await ports.execute(scope);
    } finally {
        for (const { prompts, key, record } of changes.reverse()) {
            record.finished = true;
            const owners = previewPromptOwners.get(prompts)!;
            if (owners.get(key) !== record) continue;
            if (read(prompts, key) !== record.value || !previewPromptPropertiesMatch(record.value, record.properties)) {
                owners.delete(key);
                continue;
            }
            let previous = record.previous;
            let parent = record.parent;
            while (parent?.finished) { previous = parent.previous; parent = parent.parent; }
            if (previous === absentPrompt) delete prompts[key];
            else prompts[key] = previous;
            if (parent) owners.set(key, parent);
            else owners.delete(key);
        }
    }
}

export interface CompletedStreamProcessor<ToolCalls> {
    isStopped: boolean;
    isFinished: boolean;
    toolCalls: ToolCalls;
    result: string;
    messageId: number;
    reasoningHandler: { reasoning: string };
    reasoningSignature: string | null;
}

export interface StreamAttemptPorts<ToolCalls, Invocation, Step, Meta, Result> {
    ownsRun(): boolean;
    clean(text: string): string;
    assertAllowed(count: number): void;
    lastMessage(): { mes?: string; extra?: { reasoning?: unknown } } | undefined;
    hasToolCalls(calls: ToolCalls): boolean;
    deleteLast(): Promise<unknown>;
    setModel(messageId: number, model: string): void;
    finalizeIntermediary(messageId: number, text: string): Promise<unknown>;
    invokeTools(calls: ToolCalls, options: { reasoningText: string; assistantMessage: { role: 'assistant'; content: string | null; reasoning?: string; signature?: string } }): Promise<{ invocations: Invocation[]; stealthCalls: unknown[]; errors?: unknown[] }>;
    showErrors(errors: unknown[]): void;
    endPipeline(): void;
    unblock(type: string): void;
    clearProcessor(): void;
    prepareRound(invocations: Invocation[]): { action: string; text: string; step: Step; meta: Meta } | null | undefined;
    saveInvocations(invocations: Invocation[]): Promise<unknown>;
    markComplete(processor: CompletedStreamProcessor<ToolCalls>): void;
    finalizePipeline(input: { type: string; text: string; step: Step; meta: Meta; reasoning: string; reasoningSignature: string | null; fromStream: true }): Promise<Result>;
    hasPipeline(): boolean;
    continueGeneration(): Promise<Result>;
    emptyFailure(messageId: number): Error;
    finishMessage(messageId: number, text: string): Promise<unknown>;
    refresh(): void;
    clearRecovery(messageId: number): void;
}

/** Own the stream's tool round and completion decisions, with shell effects injected. */
async function finishStreamAttempt<ToolCalls, Invocation, Step, Meta, Result>(input: { type: string; isOpenAI: boolean; canPerformTools: boolean; attemptModel: string; text: string; processor: CompletedStreamProcessor<ToolCalls> }, ports: StreamAttemptPorts<ToolCalls, Invocation, Step, Meta, Result>): Promise<Result | { pipelineContinuation: true } | String | undefined> {
    const { processor, text, type, attemptModel } = input;
    const check = () => { if (!ports.ownsRun()) throw new Error('Generation was aborted.'); };
    check();
    const messageChunk = ports.clean(text);
    check();
    const finished = !processor.isStopped && processor.isFinished;
    const calls = processor.toolCalls;
    const withCalls = Array.isArray(calls) && calls.length > 0;
    if (!input.canPerformTools && finished) {
        const count = Array.isArray(calls) ? calls.reduce((total: number, group: unknown) => total + (Array.isArray(group) ? group.length : 0), 0) : 0;
        ports.assertAllowed(count);
    }
    if (input.canPerformTools && finished && withCalls) {
        const last = ports.lastMessage();
        const hasCalls = ports.hasToolCalls(calls);
        const shouldDelete = (last?.mes === '' || last?.mes === '...') && !last?.extra?.reasoning && ['', '...'].includes(processor.result);
        if (hasCalls && shouldDelete) await ports.deleteLast();
        check();
        if (hasCalls && !shouldDelete) {
            if (ports.hasPipeline()) ports.setModel(processor.messageId, attemptModel);
            await ports.finalizeIntermediary(processor.messageId, text);
            check();
        }
        const reasoningText = processor.reasoningHandler.reasoning;
        const signature = processor.reasoningSignature;
        const result = await ports.invokeTools(calls, {
            reasoningText,
            assistantMessage: { role: 'assistant', content: text || null, ...(reasoningText ? { reasoning: reasoningText } : {}), ...(signature ? { signature } : {}) },
        });
        check();
        const shouldStop = (!result.invocations.length && shouldDelete) || result.stealthCalls.length > 0;
        if (hasCalls) {
            if (shouldStop) {
                if (Array.isArray(result.errors) && result.errors.length) ports.showErrors(result.errors);
                ports.endPipeline(); ports.unblock(type); ports.clearProcessor();
                return;
            }
            const reasoning = processor.reasoningHandler.reasoning;
            const reasoningSignature = processor.reasoningSignature;
            const decision = ports.prepareRound(result.invocations);
            ports.clearProcessor();
            await ports.saveInvocations(result.invocations);
            check();
            if (decision?.action === 'final') {
                ports.markComplete(processor);
                return ports.finalizePipeline({ type, text: decision.text, step: decision.step, meta: decision.meta, reasoning, reasoningSignature, fromStream: true });
            }
            if (ports.hasPipeline()) return { pipelineContinuation: true };
            return ports.continueGeneration();
        }
    }
    if (finished) {
        const id = processor.messageId;
        if (!String(messageChunk ?? '').trim()) { ports.clearProcessor(); throw ports.emptyFailure(id); }
        if (input.isOpenAI && attemptModel) ports.setModel(id, attemptModel);
        await ports.finishMessage(id, text);
        check();
        ports.markComplete(processor); ports.refresh(); ports.clearProcessor(); ports.clearRecovery(id); ports.endPipeline();
        return Object.defineProperties(new String(text), { messageChunk: { value: messageChunk }, fromStream: { value: true } });
    }
    ports.clearProcessor();
    const error: Error & { messageId?: number } = new Error('stream connection closed before completion');
    error.messageId = processor.messageId;
    throw error;
}

/** Keep overlapping request scopes from restoring a stale model over a newer scope. */
function createRequestScopeRunner() {
    type Scope = { previous: unknown; parent: Scope | null; ownsRun: () => boolean };
    let top: Scope | null = null;
    return async function runRequestScope<Model, Response, Result>(ports: {
        getModel(): Model; setModel(model: Model): void; ownsRun?(): boolean;
        execute(): Promise<Response>; success(response: Response): Promise<Result>; failure(error: unknown): Result | Promise<Result>;
    }): Promise<Result> {
        const scope: Scope = { previous: ports.getModel(), parent: top, ownsRun: ports.ownsRun ?? (() => true) };
        top = scope;
        try {
            return await ports.success(await ports.execute());
        } catch (error) {
            return ports.failure(error);
        } finally {
            if (top === scope) {
                let previous = scope.previous;
                let parent = scope.parent;
                while (parent && !parent.ownsRun()) {
                    previous = parent.previous;
                    parent = parent.parent;
                }
                top = parent;
                ports.setModel(previous as Model);
            } else {
                let child: Scope | null = top;
                while (child && child.parent !== scope) child = child.parent;
                if (child) {
                    child.previous = scope.previous;
                    child.parent = scope.parent;
                }
            }
        }
    };
}

/** Decide whether a transport reply should trigger the existing empty-reply recovery. */
function isGenerationResultEmpty<Result>(input: { jsonSchema: unknown; result: Result }, ports: {
    extract(result: Result): string; clean(message: string): string;
}): boolean {
    if (input.jsonSchema) return false;
    if ((input.result as { fromStream?: boolean } | null)?.fromStream) {
        return String(input.result ?? '').trim().length === 0;
    }
    return String(ports.clean(ports.extract(input.result)) ?? '').trim().length === 0;
}

/** Decide request eligibility and pipeline model selection before prompt assembly. */
function preparePromptPolicy(input: {
    preview: boolean; isOpenAI: boolean; dryRun: boolean; type: string; depth: number; warnings: string[];
}, ports: { canUseTools(): boolean; recurseLimit(): number; liveModel(model: string): string; previewModel(model: string): string }) {
    if (input.preview && !input.isOpenAI) {
        return { terminal: { kind: 'prompt-preview-empty', reason: 'unsupported-api', warnings: input.warnings } } as const;
    }
    const canPerformTools = !input.dryRun && ports.canUseTools() && input.depth < ports.recurseLimit();
    const assemblyModel = (model: string) => input.preview ? ports.previewModel(model) : input.type === 'normal' ? ports.liveModel(model) : model;
    return { canPerformTools, assemblyModel } as const;
}

/** Select and execute the actual prompt/continuation stages before dispatch. */
async function prepareRequestStages<Data, Completion, Summary, Base extends { history: { summarized: Summary } }, World, Preview>(input: {
    type: string; dryRun: boolean; preview: boolean; isOpenAI: boolean; hasPipelineMessages: boolean; forceName: boolean;
}, ports: {
    ownsRun(): boolean;
    continuation(): Promise<Data | null | undefined>;
    base(): Promise<Base | null | undefined>;
    world(base: Base): Promise<World | null | undefined>;
    assemble(base: Base, world: World, forceName: boolean): Promise<{ generateData: Data; chatCompletion: Completion } | null | undefined>;
    publish(data: Data): Promise<boolean>;
    preview(data: Data, completion: Completion | null, summarized: Summary | never[]): Promise<Preview>;
}): Promise<{ kind: 'dispatch'; data: Data; forceName: boolean } | { kind: 'terminal'; value: Preview | undefined } | null> {
    if (!ports.ownsRun()) return null;
    let data: Data;
    let completion: Completion | null = null;
    let summarized: Summary | never[] = [];
    let forceName = input.forceName;
    if (!input.dryRun && input.type === 'normal' && input.isOpenAI && input.hasPipelineMessages) {
        const continuation = await ports.continuation();
        if (!continuation || !ports.ownsRun()) return null;
        data = continuation;
    } else {
        const base = await ports.base();
        if (!base || !ports.ownsRun()) return null;
        summarized = base.history.summarized;
        forceName = true;
        const world = await ports.world(base);
        if (!world || !ports.ownsRun()) return null;
        const assembled = await ports.assemble(base, world, forceName);
        if (!assembled || !ports.ownsRun()) return null;
        data = assembled.generateData;
        completion = assembled.chatCompletion;
    }
    if (!(await ports.publish(data)) || !ports.ownsRun()) return null;
    if (input.preview) return { kind: 'terminal', value: await ports.preview(data, completion, summarized) };
    if (input.dryRun) return { kind: 'terminal', value: undefined };
    return { kind: 'dispatch', data, forceName };
}

/** Plan retries per pipeline round and attribute requests to the current step. */
function prepareAttemptPlan<Command extends { depth: number; capabilities: { autoRecover: boolean } }, Plan>(input: {
    type: string; depth: number; isOpenAI: boolean; hasPipeline: boolean; command: Command;
    trace: { pipelineRun?: unknown; pipelineStep?: unknown };
}, ports: {
    plan(command: Command): Plan; activeRunId(): unknown;
    meta(): { runId: unknown } | null; step(): { tool: unknown } | null; isFallback(): boolean;
}): Plan {
    const continuation = input.depth > 0 && input.type === 'normal' && input.isOpenAI && input.hasPipeline;
    const command = continuation ? { ...input.command, depth: 0, capabilities: { ...input.command.capabilities, autoRecover: true } } : input.command;
    const result = ports.plan(command);
    const meta = input.type === 'normal' ? ports.meta() : null;
    const step = meta ? ports.step() : null;
    if (input.type === 'normal') {
        const active = ports.activeRunId();
        if (active) input.trace.pipelineRun = active;
    }
    if (meta && step) {
        input.trace.pipelineRun = meta.runId;
        if (!ports.isFallback()) input.trace.pipelineStep = step.tool;
    }
    return result;
}

/** Plan and execute one pipeline round, including its bounded recovery attempts. */
async function executeGenerationRound<Command extends { depth: number; capabilities: { autoRecover: boolean } }, Attempt extends { status: string; label: string }, Result>(input: {
    type: string; depth: number; isOpenAI: boolean; hasPipeline: boolean; command: Command;
    trace: { pipelineRun?: unknown; pipelineStep?: unknown }; signal?: AbortSignal;
}, ports: AttemptRecoveryPorts<Attempt> & {
    plan(command: Command): { attempts: readonly Attempt[]; shouldAutoRecover: boolean };
    activeRunId(): unknown; meta(): { runId: unknown } | null; step(): { tool: unknown } | null; isFallback(): boolean;
    isCancelled(): boolean; execute(input: GenerationAttemptInput<Attempt, Result>): Promise<Result>;
    run(attempt: Attempt, index: number, count: number): Promise<Result>;
    successfulMessageId(): number; clearSuccessStatus(id: number): void;
}): Promise<Result> {
    ports.showStop();
    const { attempts, shouldAutoRecover } = prepareAttemptPlan(input, ports);
    return runRecoveryAttempts({ attempts, shouldAutoRecover, signal: input.signal }, {
        ...ports,
        run: (attempt, index) => ports.run(attempt, index, attempts.length),
    });
}

interface PreviewMessage { role?: string; tool_calls?: unknown }
interface PreviewCompletion {
    getChatEntries?(): Array<{ identifier?: unknown }>;
    getDroppedEntries?(): unknown[];
}

/** Build the inspector result from the same assembled messages without dispatching. */
async function buildPreviewResult<Body extends { model?: unknown }, Pipeline extends { fallback?: boolean }, Budget>(input: {
    type: string; isOpenAI: boolean; data: { prompt?: PreviewMessage[] } | null; round: number;
    warnings: string[]; pending: { name?: unknown; mes?: unknown } | null; pendingIdentifier: string | null;
    summarized: unknown; completion: PreviewCompletion | null;
}, ports: {
    ownsRun(): boolean; previewModel(round: number): string;
    build(messages: PreviewMessage[], round: number, model: string | null): Promise<{ generate_data: Body; stream: boolean }>;
    shape(body: Body, round: number): Pipeline | null;
    canUseTools(model: Body['model']): boolean;
    responseTokens(): number; maxPromptTokens(): number;
    budget(completion: PreviewCompletion | null, contextTokens: number, responseTokens: number): { budget: Budget; warning: string | null };
}) {
    if (!ports.ownsRun()) return null;
    const messages = input.data?.prompt;
    if (!Array.isArray(messages)) return { kind: 'prompt-preview-empty', reason: input.isOpenAI ? 'no-active-character' : 'unsupported-api', warnings: input.warnings };
    const model = input.type === 'normal' ? ports.previewModel(input.round) : null;
    const { generate_data: requestBody, stream } = await ports.build(messages, input.round, model);
    if (!ports.ownsRun()) return null;
    const pipeline = ports.shape(requestBody, input.round);
    if (pipeline && !pipeline.fallback && !ports.canUseTools(requestBody.model)) {
        throw new Error(`Reply pipeline: model ${requestBody.model} does not support tools in this provider.`);
    }
    const responseTokens = ports.responseTokens();
    const { budget, warning } = ports.budget(input.completion, ports.maxPromptTokens() + responseTokens, responseTokens);
    const warnings = warning ? [...input.warnings, warning] : input.warnings;
    const entries = input.completion?.getChatEntries?.() ?? [];
    let maxHistoryIndex = 0;
    for (const entry of entries) {
        const match = /^chatHistory-(\d+)$/.exec(String(entry?.identifier ?? ''));
        if (match) maxHistoryIndex = Math.max(maxHistoryIndex, Number(match[1]));
    }
    return {
        kind: 'prompt-preview', type: input.type, model: requestBody?.model ?? null, stream, request: requestBody,
        entries, dropped: input.completion?.getDroppedEntries?.() ?? [],
        summarized: Array.isArray(input.summarized) ? input.summarized : [], budget, pipeline, warnings,
        pendingMessage: input.pending ? { name: input.pending.name ?? null, mes: input.pending.mes ?? '' } : null,
        pendingEntryIdentifier: input.pending && maxHistoryIndex > 0 ? `chatHistory-${maxHistoryIndex}` : input.pendingIdentifier,
        messagesInContext: messages.filter(message => !message?.tool_calls && ['user', 'assistant', 'tool'].includes(message?.role ?? '')).length,
    };
}

/** Apply failure effects only while this request still owns them. */
async function failGeneration(error: unknown, ports: {
    ownsRun(): boolean; cleanupStopped(): void; reportError(message: string): void;
    endPipeline(): void; hasRegenerateSnapshot: boolean; isUserStopped(error: unknown): boolean; restore(): Promise<boolean>;
    reportRestore(restored: boolean): void; unblock(): void; log(error: unknown): void; clearProcessor(): void;
}): Promise<never> {
    if (!ports.ownsRun()) {
        ports.cleanupStopped();
        throw error;
    }
    const detail = error as { error?: { message?: unknown }; message?: unknown } | null | undefined;
    if (typeof detail?.error?.message === 'string') ports.reportError(detail.error.message);
    else if (String(detail?.message ?? '').startsWith('Reply pipeline:')) ports.reportError(String(detail?.message));
    ports.endPipeline();
    if (ports.hasRegenerateSnapshot && !ports.isUserStopped(error)) {
        const restored = await ports.restore();
        if (!ports.ownsRun()) throw error;
        ports.reportRestore(restored);
    }
    ports.unblock();
    ports.log(error);
    ports.clearProcessor();
    throw error;
}

export interface WorldInfoStoryInput {
    messages: string[]; quietPrompt: string | null | undefined; maxContext: number; dryRun: boolean; skipWIAN: boolean;
    description: string; system: string; characterDepthPrompt: string; creatorNotes: string; scenario: string;
    character: string; user: string;
}

export interface WorldInfoStoryPorts<WorldInfo> {
    quiet(value: string): unknown;
    ownsRun?(): boolean;
    currentQuiet?(): unknown;
    clearQuiet?(token: unknown): void;
    scan(messages: string[], maxContext: number, dryRun: boolean, global: { characterDescription: string; characterDepthPrompt: string; creatorNotes: string; scenario: string; trigger: 'normal' }): Promise<{ worldInfo: WorldInfo; worldInfoBefore: string; worldInfoAfter: string; worldInfoDepth?: { entries: string[]; depth: number; role: number | string }[] }>;
    flush(): void;
    inject(text: string, depth: number, role: number | string): void;
    anchor(kind: 'before' | 'after'): Promise<string>;
    render(params: { description: string; system: string; char: string; user: string; wiBefore: string; wiAfter: string; loreBefore: string; loreAfter: string; anchorBefore: string; anchorAfter: string; scenario: string; mesExamples: string; mesExamplesRaw: string }): string;
    clearStory(): void;
}

/** Use the existing World Info scanner and extension prompt ports to assemble story context. */
async function assembleWorldInfoStory<WorldInfo>(input: WorldInfoStoryInput, ports: WorldInfoStoryPorts<WorldInfo>): Promise<{ worldInfo: WorldInfo; storyString: string; beforeScenarioAnchor: string; afterScenarioAnchor: string } | null> {
    if (ports.ownsRun && !ports.ownsRun()) return null;
    const quietToken = ports.quiet(input.quietPrompt || '');
    const { worldInfo, worldInfoBefore, worldInfoAfter, worldInfoDepth } = await ports.scan([...input.messages].reverse(), input.maxContext, input.dryRun, {
        characterDescription: input.description, characterDepthPrompt: input.characterDepthPrompt,
        creatorNotes: input.creatorNotes, scenario: input.scenario, trigger: 'normal',
    });
    if (ports.ownsRun && !ports.ownsRun()) {
        if (!ports.currentQuiet || ports.currentQuiet() === quietToken) ports.clearQuiet?.(quietToken);
        return null;
    }
    ports.quiet('');
    if (ports.ownsRun && !ports.ownsRun()) return null;
    if (input.skipWIAN !== true) {
        ports.flush();
        if (ports.ownsRun && !ports.ownsRun()) return null;
        if (Array.isArray(worldInfoDepth)) {
            for (const entry of worldInfoDepth) {
                ports.inject(entry.entries.join('\n'), entry.depth, entry.role);
                if (ports.ownsRun && !ports.ownsRun()) return null;
            }
        }
    }
    const before = await ports.anchor('before');
    if (ports.ownsRun && !ports.ownsRun()) return null;
    const after = await ports.anchor('after');
    if (ports.ownsRun && !ports.ownsRun()) return null;
    const storyString = ports.render({
        description: input.description, system: input.system, char: input.character, user: input.user,
        wiBefore: worldInfoBefore, wiAfter: worldInfoAfter, loreBefore: worldInfoBefore, loreAfter: worldInfoAfter,
        anchorBefore: before.trim(), anchorAfter: after.trim(), scenario: input.scenario, mesExamples: '', mesExamplesRaw: '',
    });
    if (ports.ownsRun && !ports.ownsRun()) return null;
    ports.clearStory();
    return { worldInfo, storyString, beforeScenarioAnchor: before, afterScenarioAnchor: after };
}

/** Send the user input or create the side-effect-free preview mirror. */
async function assembleUserInput<Message>(input: {
    text: string; type: string | undefined; bias: string; automatic: boolean; dryRun: boolean;
    depth: number; regenerate: boolean; preview: boolean; isOpenAI: boolean;
}, ports: {
    hasAttachment(): boolean; removeMacros(text: string): string; emptyText(): string;
    sendSystem(bias: string): void; sendUser(text: string, bias: string): Promise<unknown>;
    buildUser(text: string, bias: string): Promise<Message>; isStale(): boolean;
}): Promise<{ pending: Message | null; warnings: string[] } | null> {
    const { text, type, bias, automatic, dryRun, depth, regenerate, preview, isOpenAI } = input;
    if ((text !== '' || (ports.hasAttachment() && type !== 'quiet')) && !automatic && type !== 'quiet' && !dryRun && !depth && !regenerate) {
        if (bias && !ports.removeMacros(text)) ports.sendSystem(bias);
        else await ports.sendUser(text, bias);
    } else if (text === '' && !automatic && !dryRun && !regenerate && (type === undefined || type === 'normal') && isOpenAI && ports.emptyText().trim().length > 0 && !depth) {
        await ports.sendUser(ports.emptyText().trim(), bias);
    }
    if (ports.isStale()) return null;
    const warnings: string[] = [];
    let pending: Message | null = null;
    if (preview) {
        const wantsUser = (text !== '' || ports.hasAttachment()) && !automatic && type !== 'quiet';
        const wantsEmpty = !wantsUser && text === '' && !automatic && type === 'normal' && isOpenAI && ports.emptyText().trim().length > 0;
        if (text.trim().startsWith('/')) warnings.push('slash-command');
        if (ports.hasAttachment()) warnings.push('pending-attachment');
        if (wantsUser) {
            if (bias && !ports.removeMacros(text)) warnings.push('bias-only-system');
            else pending = await ports.buildUser(text, bias);
        } else if (wantsEmpty) pending = await ports.buildUser(ports.emptyText().trim(), bias);
    }
    return { pending, warnings };
}

/** Own the ordering and cancellation checkpoints before a request can touch the composer. */
async function prepareGenerationEntry(input: { dryRun: boolean; executeCommands: boolean }, ports: {
    unshallow(): Promise<unknown>; emitStarted(): Promise<unknown>; commands(): Promise<unknown>;
    emitAfterCommands(): Promise<unknown>; ping(): Promise<boolean>; isStale(): boolean;
    unblock(): void; serverUnreachable(): never; markTainted(): void;
}): Promise<boolean> {
    await ports.unshallow();
    if (ports.isStale()) return false;
    await ports.emitStarted();
    if (ports.isStale()) return false;
    if (input.executeCommands) {
        const interrupted = await ports.commands();
        if (ports.isStale()) return false;
        if (interrupted) {
            ports.unblock();
            return false;
        }
    }
    await ports.emitAfterCommands();
    if (ports.isStale()) return false;
    if (!input.dryRun) {
        const pingResult = await ports.ping();
        if (ports.isStale()) return false;
        if (!pingResult) {
            ports.unblock();
            ports.serverUnreachable();
        }
        ports.markTainted();
    }
    return true;
}

interface CorePromptMessage { mes: string; is_user?: boolean }
/** Copy data-only prompt graphs without invoking getters or cloning callback functions. */
function clonePromptData(value: unknown, seen = new WeakMap<object, object>()): unknown {
    if (value === null || typeof value !== 'object') return value;
    const prototype = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) return value;
    const existing = seen.get(value);
    if (existing) return existing;
    const copy: object = Array.isArray(value) ? [] : Object.create(prototype);
    seen.set(value, copy);
    for (const key of Reflect.ownKeys(value)) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
        if ('value' in descriptor) descriptor.value = clonePromptData(descriptor.value, seen);
        Object.defineProperty(copy, key, descriptor);
    }
    return copy;
}
/** Explicit listener writes belong to this request; legacy writes remain global. */
function createPromptContext(ports: {
    globalPrompts(): Record<string, unknown>;
    isolated?: boolean;
    set(key: string, value: unknown, position: number, depth: number, scan: boolean | undefined, role: number | undefined, filter: (() => boolean | Promise<boolean>) | null | undefined, target: Record<string, unknown>): void;
}) {
    const local: Record<string, unknown> = Object.create(null);
    let isolatedPrompts: Record<string, unknown> | undefined;
    function snapshotPrompts(): Record<string, unknown> {
        const descriptors: PropertyDescriptorMap = Object.create(null);
        for (const source of [ports.globalPrompts(), local]) {
            for (const key of Reflect.ownKeys(source)) {
                const descriptor = Object.getOwnPropertyDescriptor(source, key)!;
                if (!descriptor.enumerable) continue;
                descriptor.configurable = true;
                if ('value' in descriptor) descriptor.writable = true;
                Object.defineProperty(descriptors, key, { value: descriptor, configurable: true, enumerable: true, writable: true });
            }
        }
        return clonePromptData(Object.defineProperties({}, descriptors)) as Record<string, unknown>;
    }
    return {
        setWorldInfoScanPrompt(key: string, value: unknown, position: number, depth: number, scan?: boolean, role?: number, filter?: (() => boolean | Promise<boolean>) | null): void {
            ports.set(key, value, position, depth, scan, role, filter, isolatedPrompts ?? local);
        },
        requestPrompts(): Record<string, unknown> | undefined {
            if (!ports.isolated) return undefined;
            if (!isolatedPrompts) isolatedPrompts = snapshotPrompts();
            return isolatedPrompts;
        },
        scanPrompts(): Record<string, unknown> | undefined {
            if (ports.isolated) {
                if (!isolatedPrompts) isolatedPrompts = snapshotPrompts();
                return isolatedPrompts;
            }
            return Object.keys(local).length ? { ...ports.globalPrompts(), ...local } : undefined;
        },
    };
}
async function prepareGenerationBase<Card, History>(ports: {
    ownsRun(): boolean;
    card(): Card;
    depth(card: Card): void;
    history(): Promise<History | null>;
    maxTokens(): number;
}): Promise<{ card: Card; history: History; maxTokens: number } | null> {
    if (!ports.ownsRun()) return null;
    const card = ports.card();
    if (!ports.ownsRun()) return null;
    ports.depth(card);
    if (!ports.ownsRun()) return null;
    const history = await ports.history();
    if (history === null || !ports.ownsRun()) return null;
    return { card, history, maxTokens: ports.maxTokens() };
}

/** Own the character depth policy and the history preparation used by a request. */
async function prepareGenerationFoundation<Card extends { charDepthPrompt?: string | null }, Message extends PromptHistoryMessage, Summary, Placement, Role>(ports: {
    ownsRun(): boolean;
    card(): Card;
    clearDepth(): void;
    depthSettings(): { depth?: number | null; role?: string | null; defaultDepth: number; defaultRole: string };
    resolveRole(role: string): Role;
    setDepth(text: string, depth: number, role: Role): void;
    historyInput(): Parameters<typeof assemblePromptHistory<Message, Summary, Placement>>[0];
    historyPorts: Omit<Parameters<typeof assemblePromptHistory<Message, Summary, Placement>>[1], 'ownsRun'>;
    maxTokens(): number;
}) {
    return prepareGenerationBase({
        ownsRun: ports.ownsRun,
        card: ports.card,
        depth: card => {
            ports.clearDepth();
            if (!ports.ownsRun()) return;
            const settings = ports.depthSettings();
            const role = ports.resolveRole(settings.role ?? settings.defaultRole);
            if (!ports.ownsRun()) return;
            ports.setDepth(card.charDepthPrompt || '', settings.depth ?? settings.defaultDepth, role);
        },
        history: () => assemblePromptHistory(ports.historyInput(), { ...ports.historyPorts, ownsRun: ports.ownsRun }),
        maxTokens: ports.maxTokens,
    });
}

interface OwnedSubmission { value: string; contextKey: unknown; contextRevision: number }
type OwnedEntry<Submission extends OwnedSubmission> = ReturnType<typeof createRequestEntry<Submission>>;
type OwnedPromptContext = ReturnType<typeof createPromptContext>;

/** Own request admission, composer/input preparation and the transition to prompt assembly. */
async function prepareOwnedGeneration<Submission extends OwnedSubmission, Message, Snapshot, Identity>(input: {
    type: string; dryRun: boolean; depth: number; preview: unknown; regenerate: boolean;
    signal?: AbortSignal; composerSubmission?: Submission; quietPrompt?: string | null; automatic?: boolean;
}, ports: {
    entry: Parameters<typeof createRequestEntry<Submission>>[1];
    promptContext: Omit<Parameters<typeof createPromptContext>[0], 'isolated'>;
    identity(): Identity; chat(): unknown; currentComposer(): Submission; ownsRun(): boolean;
    unblock(): void; characterName(): unknown; chatId(): unknown; start(): void;
    preparation(entry: OwnedEntry<Submission>, context: OwnedPromptContext, stale: () => boolean): Parameters<typeof prepareGenerationEntry>[1];
    preflight: Parameters<typeof prepareGenerationPreflight>[1];
    composer: Parameters<typeof prepareComposer<Submission>>[1];
    deactivate(): void; remove(signal?: AbortSignal): Snapshot | null;
    bias(text: string, type: string): { messageBias: string; promptBias: string };
    userInput(stale: () => boolean, entry: OwnedEntry<Submission>): Parameters<typeof assembleUserInput<Message>>[1];
    isOpenAI(): boolean;
    policy: Parameters<typeof preparePromptPolicy>[1];
}): Promise<{ kind: 'ready'; entry: OwnedEntry<Submission>; promptContext: OwnedPromptContext; requestIdentity: Identity;
    requestTrace: { type: string; chatId: unknown; charName: unknown; regenerate: boolean };
    quietPrompt: string | null | undefined; regenerateSnapshot: Snapshot | null; promptBias: string;
    pending: Message | null; warnings: string[]; policy: Extract<ReturnType<typeof preparePromptPolicy>, { canPerformTools: boolean }>;
} | { kind: 'terminal'; value: unknown } | null> {
    const entry = createRequestEntry(input, ports.entry);
    const promptContext = createPromptContext({ ...ports.promptContext, isolated: entry.isPreview });
    const requestIdentity = ports.identity();
    const submittedChat = ports.chat();
    const stale = () => {
        const isComposer = Boolean(entry.composerSubmission && !entry.dryRun);
        return cancelStaleSubmission({
            composerSubmission: entry.composerSubmission, dryRun: entry.dryRun, submittedChat,
            currentChat: ports.chat(), current: isComposer ? ports.currentComposer() : null,
            ownsRun: isComposer ? true : ports.ownsRun(), submissionAborted: Boolean(entry.submissionSignal?.aborted),
            externalAborted: Boolean(input.signal?.aborted),
        }, ports.unblock);
    };
    const requestTrace = { type: input.type, chatId: ports.chatId(), charName: ports.characterName(), regenerate: entry.isRegenerate };
    if (!entry.isPreview) ports.start();
    if (!(await prepareGenerationEntry({ dryRun: entry.dryRun, executeCommands: entry.executeCommands }, ports.preparation(entry, promptContext, stale)))) return null;
    const preflight = prepareGenerationPreflight({ quietPrompt: input.quietPrompt, dryRun: entry.dryRun }, ports.preflight);
    if (!preflight) return null;
    const composer = prepareComposer({ type: input.type, depth: input.depth, dryRun: entry.dryRun, preview: entry.isPreview, regenerate: entry.isRegenerate, submission: entry.composerSubmission }, ports.composer);
    if (!composer) return null;
    if (!entry.dryRun) ports.deactivate();
    const regenerateSnapshot = prepareRegeneration({ isRegenerate: entry.isRegenerate, dryRun: entry.dryRun, signal: input.signal }, { remove: ports.remove });
    const { messageBias, promptBias } = ports.bias(composer.text, input.type);
    const userInput = await assembleUserInput({
        text: composer.text, type: input.type, bias: messageBias, automatic: Boolean(input.automatic), dryRun: entry.dryRun,
        depth: input.depth, regenerate: entry.isRegenerate, preview: entry.isPreview, isOpenAI: ports.isOpenAI(),
    }, ports.userInput(stale, entry));
    if (!userInput || stale()) return null;
    const policy = preparePromptPolicy({ preview: entry.isPreview, isOpenAI: ports.isOpenAI(), dryRun: entry.dryRun, type: input.type, depth: input.depth, warnings: userInput.warnings }, ports.policy);
    if ('terminal' in policy) return { kind: 'terminal', value: policy.terminal };
    return { kind: 'ready', entry, promptContext, requestIdentity, requestTrace, quietPrompt: preflight.quietPrompt,
        regenerateSnapshot, promptBias, pending: userInput.pending, warnings: userInput.warnings, policy };
}

/** Execute the actual request phases in order while retaining one typed request state. */
async function runOwnedRequest<State, Assembly extends { stages: { kind: 'terminal'; value: unknown } | { kind: 'dispatch' } | null }, Result>(ports: {
    ownsRun(): boolean;
    prepare(): Promise<{ kind: 'ready'; state: State } | { kind: 'terminal'; value: unknown } | null>;
    assemble(state: State): Promise<Assembly>;
    dispatch(state: State, assembly: Assembly): Promise<Result>;
}): Promise<Result | unknown> {
    const prepared = await ports.prepare();
    if (!prepared) return;
    if (prepared.kind === 'terminal') return prepared.value;
    if (!ports.ownsRun()) return;
    const assembly = await ports.assemble(prepared.state);
    if (!assembly.stages || !ports.ownsRun()) return;
    if (assembly.stages.kind === 'terminal') return assembly.stages.value;
    return ports.dispatch(prepared.state, assembly);
}

async function assembleRequestPrompt<History, Prepared, Messages, Data, Completion>(input: {
    isOpenAI: boolean; dryRun: boolean;
}, ports: {
    ownsRun(): boolean;
    formatHistory(): Promise<History>;
    makeOpenAIMessages(): Messages;
    prepareText(history: History): Promise<Prepared>;
    combine(prepared: Prepared): Promise<string>;
    afterCombine(prompt: string): Promise<string>;
    assembleOpenAI(messages: Messages): Promise<{ generateData: Data; chatCompletion: Completion }>;
    setOpenAIContext(): void;
}): Promise<{ prompt: string; generateData: Data | undefined; chatCompletion: Completion | null } | null> {
    if (!ports.ownsRun()) return null;
    const history = await ports.formatHistory();
    if (!ports.ownsRun()) return null;
    const openAIMessages = input.isOpenAI ? ports.makeOpenAIMessages() : undefined;
    const prepared = await ports.prepareText(history);
    if (!ports.ownsRun()) return null;
    const combined = await ports.combine(prepared);
    if (!ports.ownsRun()) return null;
    const prompt = await ports.afterCombine(combined);
    if (!ports.ownsRun()) return null;
    if (!input.isOpenAI) return { prompt, generateData: undefined, chatCompletion: null };
    const result = await ports.assembleOpenAI(openAIMessages as Messages);
    if (!ports.ownsRun()) return null;
    if (!input.dryRun) ports.setOpenAIContext();
    return { prompt, generateData: result.generateData, chatCompletion: result.chatCompletion };
}

interface PromptContentInput<Message, WorldInfo, Image> {
    type: string; isOpenAI: boolean; dryRun: boolean; isPreview: boolean; round: number;
    messages: Message[]; maxContext: number; storyString: string; description: string; system: string;
    character: string; user: string; worldInfo: WorldInfo; beforeScenarioAnchor: string; afterScenarioAnchor: string;
    quietPrompt: string; quietToLoud: boolean; quietImage: Image; forceName: boolean; promptBias: string;
    api: string;
}

interface PromptContentRequest<Messages, WorldInfo, PromptMap, Image> {
    name2: string; charDescription: string; worldInfo: WorldInfo; extensionPrompts: PromptMap;
    bias: string; type: string; quietPrompt: string; quietImage: Image; messages: Messages;
}

/** Own prompt history, text composition and OpenAI request construction as one request stage. */
async function assemblePromptContent<Message extends CorePromptMessage, WorldInfo, PromptMap, Image, Messages, Step, Prompt, Completion>(
    input: PromptContentInput<Message, WorldInfo, Image>,
    ports: {
        ownsRun(): boolean; inject(messages: Message[]): Promise<number[]>; format(message: Message): string;
        presetModel(): string; assemblyModel(model: string): string; setMessages(messages: Message[], model: string): Messages;
        separator(text: string): string; countInitial(text: string): Promise<number>; countHistory(text: string): Promise<number>;
        setContext(count: number): void; setSending(): void;
        before(data: CombinedPromptEvent<WorldInfo>): Promise<unknown>;
        after(data: { prompt: string; dryRun: boolean }): Promise<unknown>;
        extensionPrompts(): PromptMap;
        openAI: OpenAIRequestPorts<PromptContentRequest<Messages, WorldInfo, PromptMap, Image>, Step, Prompt, Completion>;
        setOpenAIContext(): void;
    },
) {
    return assembleRequestPrompt({ isOpenAI: input.isOpenAI, dryRun: input.dryRun }, {
        ownsRun: ports.ownsRun,
        formatHistory: () => formatPromptHistory(input.messages, input.isOpenAI, { inject: ports.inject, format: ports.format }),
        makeOpenAIMessages: () => ports.setMessages(input.messages, ports.assemblyModel(ports.presetModel())),
        prepareText: history => prepareTextPrompt({
            history: history.messages, injectedIndices: history.injectedIndices, story: input.storyString,
            maxContext: input.maxContext, isOpenAI: input.isOpenAI, dryRun: input.dryRun,
            tail: { quiet: input.quietPrompt, quietToLoud: input.quietToLoud, forceName: input.forceName, character: input.character },
        }, {
            separator: ports.separator, countInitial: ports.countInitial, countHistory: ports.countHistory,
            setContext: ports.setContext, setSending: ports.setSending, ownsRun: ports.ownsRun,
        }),
        combine: prepared => prepared ? combinePrompt({
            isOpenAI: input.isOpenAI, messages: prepared.messages, promptBias: input.promptBias,
            injectedIndices: prepared.injectedIndices, storyString: input.storyString, combinedStoryString: input.storyString,
            exampleString: '', generatedPromptCache: '', api: input.api, description: input.description,
            character: input.character, user: input.user, worldInfo: input.worldInfo,
            beforeScenarioAnchor: input.beforeScenarioAnchor, afterScenarioAnchor: input.afterScenarioAnchor, system: input.system,
        }, { before: ports.before, separator: ports.separator }) : Promise.resolve(''),
        afterCombine: async prompt => {
            const data = { prompt, dryRun: input.dryRun };
            await ports.after(data);
            return data.prompt;
        },
        assembleOpenAI: messages => assembleOpenAIRequest({
            type: input.type, isPreview: input.isPreview, round: input.round, dryRun: input.dryRun,
            request: { name2: input.character, charDescription: input.description, worldInfo: input.worldInfo,
                extensionPrompts: ports.extensionPrompts(), bias: input.promptBias, type: input.type,
                quietPrompt: input.quietPrompt, quietImage: input.quietImage, messages },
        }, ports.openAI),
        setOpenAIContext: ports.setOpenAIContext,
    });
}
async function formatPromptHistory<Message extends CorePromptMessage>(messages: Message[], isOpenAI: boolean, ports: {
    inject(messages: Message[]): Promise<number[]>; format(message: Message): string;
}): Promise<{ messages: string[]; userIndices: number[]; injectedIndices: number[] }> {
    const injectedIndices = isOpenAI ? [] : await ports.inject(messages);
    const result: string[] = [];
    const userIndices: number[] = [];
    for (let i = messages.length - 1, j = 0; i >= 0; i--, j++) {
        const item = messages[j];
        result[i] = isOpenAI ? item.mes : ports.format(item);
        if (!isOpenAI && item.is_user) userIndices.push(i);
    }
    return { messages: result, userIndices, injectedIndices };
}

interface PromptSegment { message: string; extensionPrompts: string[]; injected?: boolean }
interface PromptTail { quiet: string; quietToLoud: boolean; forceName: boolean; character: string }
function modifyLastPromptLine(last: string, input: PromptTail): string {
    if (input.quiet && input.quiet.length) {
        last += `\n${input.quiet}`;
        if (!input.quietToLoud) return last;
    }
    if (input.forceName) {
        if (!last.endsWith('\n')) last += '\n';
        last += `${input.character}:`;
    }
    return last;
}
function buildTextPromptMessages(messages: string[], isOpenAI: boolean): PromptSegment[] {
    if (isOpenAI) return [];
    const chronological = [...messages].reverse();
    const result = chronological.map((message, index) => ({
        message: index === chronological.length - 1 ? message.replace(/\n?$/, '') : message,
        extensionPrompts: [] as string[],
    }));
    return result;
}

async function prepareTextPrompt(input: {
    history: string[]; injectedIndices: number[]; story: string; maxContext: number;
    isOpenAI: boolean; dryRun: boolean; tail: PromptTail;
}, ports: {
    separator(text: string): string; countInitial(text: string): Promise<number>;
    countHistory(text: string): Promise<number>; setContext(count: number): void; setSending(): void;
    ownsRun?(): boolean;
}): Promise<{ messages: PromptSegment[]; injectedIndices: number[] } | null> {
    if (ports.ownsRun && !ports.ownsRun()) return null;
    const history = input.history.length ? input.history : [''];
    const initialText = [input.story, '', ports.separator(''), modifyLastPromptLine('', input.tail)].join('').replace(/\r/gm, '');
    const initialTokens = await ports.countInitial(initialText);
    if (ports.ownsRun && !ports.ownsRun()) return null;
    const selected = await selectPromptHistory({
        messages: history, injectedIndices: input.injectedIndices,
        initialTokens, maxContext: input.maxContext, isOpenAI: input.isOpenAI,
    }, ports.countHistory);
    if (ports.ownsRun && !ports.ownsRun()) return null;
    if (!input.isOpenAI) ports.setContext(selected.messages.length - selected.injectedIndices.length);
    if (!input.dryRun) ports.setSending();
    const messages = buildTextPromptMessages(selected.messages, input.isOpenAI);
    if (!input.isOpenAI && messages.length) {
        const last = messages[messages.length - 1];
        last.message = modifyLastPromptLine(last.message, input.tail);
    }
    return { messages, injectedIndices: selected.injectedIndices };
}
interface CombinedPromptInput<WorldInfo> {
    isOpenAI: boolean; messages: PromptSegment[]; promptBias: string; injectedIndices: number[];
    storyString: string; combinedStoryString: string; exampleString: string; generatedPromptCache: string;
    api: string; description: string; character: string; user: string; worldInfo: WorldInfo;
    beforeScenarioAnchor: string; afterScenarioAnchor: string; system: string;
}
interface CombinedPromptEvent<WorldInfo> {
    api: string; combinedPrompt: string | null; description: string; char: string; user: string; worldInfo: WorldInfo;
    beforeScenarioAnchor: string; afterScenarioAnchor: string; storyString: string; mesExmString: string;
    mesSendString: string; finalMesSend: PromptSegment[]; generatedPromptCache: string; main: string;
}
/** Combine the legacy text prompt while preserving the mutable extension event contract. */
async function combinePrompt<WorldInfo>(input: CombinedPromptInput<WorldInfo>, ports: {
    before(data: CombinedPromptEvent<WorldInfo>): Promise<unknown>; separator(text: string): string;
}): Promise<string> {
    if (input.isOpenAI) return '';
    const finalMesSend = structuredClone(input.messages);
    if (input.promptBias.trim().length !== 0) {
        const last = finalMesSend[finalMesSend.length - 1];
        last.message += /\s/.test(last.message.slice(-1)) ? input.promptBias.trimStart() : ` ${input.promptBias.trimStart()}`;
    }
    finalMesSend.forEach((item, index) => { item.injected = input.injectedIndices.includes(finalMesSend.length - index - 1); });
    const data: CombinedPromptEvent<WorldInfo> = {
        api: input.api, combinedPrompt: null, description: input.description, char: input.character, user: input.user,
        worldInfo: input.worldInfo, beforeScenarioAnchor: input.beforeScenarioAnchor, afterScenarioAnchor: input.afterScenarioAnchor,
        storyString: input.storyString, mesExmString: input.exampleString, mesSendString: '', finalMesSend,
        generatedPromptCache: input.generatedPromptCache, main: input.system,
    };
    await ports.before(data);
    if (data.combinedPrompt) return data.combinedPrompt;
    const messages = ports.separator(finalMesSend.map(item => `${item.extensionPrompts.join('')}${item.message}`).join(''));
    return [input.combinedStoryString, input.exampleString, messages, input.generatedPromptCache].join('').replace(/\r/gm, '');
}

export interface PromptHistoryMessage {
    mes: string;
    is_user?: boolean;
    is_system?: boolean;
    extra?: { tool_invocations?: unknown; reasoning?: unknown; reasoning_duration?: number; title?: string; append_title?: boolean; media?: { title?: string; append_title?: boolean }[] };
}

async function assemblePromptHistory<Message extends PromptHistoryMessage, Summary, Placement>(input: {
    chat: Message[]; preview: boolean; pending?: Message | null; canUseTools: boolean;
    userPlacement: Placement; assistantPlacement: Placement; reasoningPlacement: Placement;
}, ports: {
    ownsRun?(): boolean;
    substitute(message: string): string;
    project(messages: Message[], chat: Message[]): { items: Message[]; summarized: Summary };
    regex(message: string, placement: Placement, depth: number): string;
    appendFile(message: Message, text: string): Promise<string>;
    addReasoning(message: string, reasoning: string, duration: number | undefined): string;
    reasoningLimitReached(): boolean;
}): Promise<{ items: (Message & { index: number })[]; summarized: Summary } | null> {
    if (ports.ownsRun && !ports.ownsRun()) return null;
    const chat = input.preview ? (input.pending ? [...input.chat, input.pending] : input.chat.slice()) : input.chat;
    if (chat.length) {
        if (input.preview) chat[0] = { ...chat[0], mes: ports.substitute(chat[0].mes) };
        else chat[0].mes = ports.substitute(chat[0].mes);
    }
    const filtered = chat.filter(item => !item.is_system || (input.canUseTools && Array.isArray(item.extra?.tool_invocations)));
    const projection = ports.project(filtered, chat);
    const source = projection.items;
    const items = await Promise.all(source.map(async (item, index) => {
        let message = ports.regex(item.mes, item.is_user ? input.userPlacement : input.assistantPlacement, source.length - index - 1);
        message = await ports.appendFile(item, message);
        const titles: string[] = [];
        if (item.extra?.append_title && item.extra.title) titles.push(item.extra.title);
        if (Array.isArray(item.extra?.media)) {
            for (const media of item.extra.media) if (media.title && media.append_title) titles.push(media.title);
        }
        if (titles.length) message = `${message}\n\n${titles.join('\n\n')}`;
        return { ...item, mes: message, index };
    }));
    if (ports.ownsRun && !ports.ownsRun()) return null;
    for (let i = items.length - 1; i >= 0; i--) {
        if (ports.ownsRun && !ports.ownsRun()) return null;
        const item = items[i];
        const reasoning = ports.regex(String(item.extra?.reasoning ?? ''), input.reasoningPlacement, items.length - i - 1);
        items[i] = { ...item, mes: ports.addReasoning(item.mes, reasoning, item.extra?.reasoning_duration) };
        if (ports.ownsRun && !ports.ownsRun()) return null;
        if (ports.reasoningLimitReached()) break;
    }
    return { items, summarized: projection.summarized };
}

export interface StreamMessage {
    mes: string;
    gen_started?: Date;
    gen_finished?: Date;
    extra?: { time_to_first_token?: number | null; reasoning_signature?: string | null; [key: string]: unknown };
}

/** Browser and persistence effects used by the typed stream message lifecycle. */
export interface StreamMessagePorts {
    getMessage(messageId: number): StreamMessage | undefined;
    indexOfMessage?(message: StreamMessage): number;
    saveInitial(text: string, ownsRun: () => boolean): Promise<unknown>;
    lastMessageId(): number;
    checkDom(messageId: number): Promise<void>;
    updateVisibility(): void;
    clean(text: string, isFinal: boolean, stoppingStrings: string[]): string;
    count(text: string, token: string): number;
    isOdd(count: number): boolean;
    startUI(): void;
    stopUI(): void;
    scroll(): void;
    isScrollLocked(): boolean;
    refresh(): void;
    mount(): void;
    addCopyButtons(messageId: number): void;
    processImages(message: StreamMessage, images: string[], ownsRun: () => boolean): Promise<unknown>;
    renderImages(message: StreamMessage): void;
    emitReceived(messageId: number, type: string): Promise<unknown>;
    emitRendered(messageId: number, type: string): Promise<unknown>;
    saveChat(ownsRun: () => boolean): Promise<unknown>;
    showFailure(messageId: number): void;
}

export interface StreamMessageSession {
    type: string;
    messageId: number;
    result: string;
    timeStarted: Date;
    timeToFirstToken: number | null;
    stoppingStrings: string[];
    images: string[];
    reasoningSignature: string | null;
    isFinalizing: boolean;
    isStopped: boolean;
    abortController: AbortController;
    ownsRun(): boolean;
    reasoningHandler: { process(messageId: number, changed: boolean, prompt: unknown): Promise<unknown>; finish(messageId: number): Promise<unknown> };
    promptReasoning: unknown;
    onProgressStreaming(messageId: number, text: string, isFinal: boolean): Promise<void>;
    finalizeIntermediaryMessage(messageId: number, text: string, options: { unlockUI: boolean }): Promise<void>;
}

const ownsStream = (session: StreamMessageSession): boolean => session.ownsRun() && !session.abortController.signal.aborted;

/** Rebind only while the same object remains in the chat; never spin indefinitely. */
async function syncStreamMessage<T>(session: StreamMessageSession, ports: StreamMessagePorts, message: StreamMessage, initialId: number, checkInitial: boolean, onStable: (messageId: number) => T): Promise<{ messageId: number; value: T } | null> {
    let messageId = initialId;
    for (let checks = 0; checks < 8; checks++) {
        if (!ownsStream(session)) return null;
        if (ports.getMessage(messageId) !== message) {
            messageId = ports.indexOfMessage?.(message) ?? -1;
            if (messageId < 0 || ports.getMessage(messageId) !== message) return null;
            checkInitial = true;
        }
        if (checkInitial) {
            await ports.checkDom(messageId);
            if (!ownsStream(session)) return null;
            if (ports.getMessage(messageId) !== message) continue;
        }
        if (session.messageId === initialId) session.messageId = messageId;
        // Run the indexed operation before yielding again: another microtask could move the row.
        return { messageId, value: onStable(messageId) };
    }
    if (!ownsStream(session)) return null;
    const currentId = ports.indexOfMessage?.(message) ?? -1;
    if (currentId < 0 || ports.getMessage(currentId) !== message) return null;
    throw new Error('Stream message kept moving during DOM synchronization.');
}

async function startStreamMessage(session: StreamMessageSession, ports: StreamMessagePorts, text: string): Promise<number> {
    if (!ownsStream(session)) return -1;
    await ports.saveInitial(text, () => ownsStream(session));
    if (!ownsStream(session)) return -1;
    const messageId = ports.lastMessageId();
    await ports.checkDom(messageId);
    if (!ownsStream(session)) return -1;
    ports.startUI();
    ports.scroll();
    return messageId;
}

async function progressStreamMessage(session: StreamMessageSession, ports: StreamMessagePorts, messageId: number, text: string, isFinal: boolean): Promise<void> {
    if (!ownsStream(session)) return;
    const initial = ports.getMessage(messageId);
    if (!initial) return;
    let processed = ports.clean(text, isFinal, session.stoppingStrings);
    for (const token of ['*', '"', '```', '~~~']) {
        if (!isFinal && ports.isOdd(ports.count(processed, token))) {
            processed = processed.trimEnd() + (token.length > 1 ? '\n' : '') + token;
        }
    }
    const changed = ports.getMessage(messageId)!.mes !== processed;
    const update = await syncStreamMessage(session, ports, initial, messageId, true, currentId => {
        ports.updateVisibility();
        initial.mes = processed;
        initial.gen_started = session.timeStarted;
        initial.gen_finished = new Date();
        initial.extra ??= {};
        initial.extra.time_to_first_token = session.timeToFirstToken;
        return session.reasoningHandler.process(currentId, changed, session.promptReasoning);
    });
    if (!update) return;
    messageId = update.messageId;
    await update.value;
    if (!ownsStream(session) || ports.getMessage(messageId) !== initial) return;
    ports.refresh();
    if (!ports.isScrollLocked()) ports.scroll();
}

async function finalizeStreamMessage(session: StreamMessageSession, ports: StreamMessagePorts, messageId: number, text: string, unlockUI: boolean): Promise<void> {
    const original = ports.getMessage(messageId);
    const findMessage = () => {
        if (!original || !ownsStream(session)) return false;
        if (ports.getMessage(messageId) === original) return messageId;
        const currentId = ports.indexOfMessage?.(original) ?? -1;
        if (currentId < 0 || ports.getMessage(currentId) !== original) return false;
        return currentId;
    };
    const ownsMessage = () => findMessage() !== false;
    const syncMessage = async <T>(onStable: (id: number) => T) => {
        if (!original) return false;
        return await syncStreamMessage(session, ports, original, messageId, false, id => {
            messageId = id;
            return onStable(id);
        });
    };
    if (!ownsMessage()) return;
    session.isFinalizing = true;
    try {
        ports.mount();
        await session.onProgressStreaming(messageId, text, true);
        const message = original!;
        const reasoning = await syncMessage(id => {
            ports.addCopyButtons(id);
            return session.reasoningHandler.finish(id);
        });
        if (!reasoning) return;
        await reasoning.value;
        let hasImages = false;
        if (Array.isArray(session.images) && session.images.length > 0) {
            const images = await syncMessage(() => ports.processImages(message, session.images, ownsMessage));
            if (!images) return;
            await images.value;
            hasImages = true;
        }
        const received = await syncMessage(id => {
            if (hasImages) ports.renderImages(message);
            if (session.reasoningSignature) {
                message.extra ??= {};
                message.extra.reasoning_signature = session.reasoningSignature;
            }
            if (unlockUI) ports.stopUI();
            return ports.emitReceived(id, session.type);
        });
        if (!received) return;
        await received.value;
        const rendered = await syncMessage(id => ports.emitRendered(id, session.type));
        if (!rendered) return;
        await rendered.value;
        ports.mount();
    } finally {
        session.isFinalizing = false;
    }
}

async function finishStreamMessage(session: StreamMessageSession, ports: StreamMessagePorts, messageId: number, text: string): Promise<void> {
    await session.finalizeIntermediaryMessage(messageId, text, { unlockUI: true });
    if (session.isStopped || !ownsStream(session)) return;
    await ports.saveChat(() => !session.isStopped && ownsStream(session));
}

async function errorStreamMessage(session: StreamMessageSession, ports: StreamMessagePorts, suppressRecovery: boolean): Promise<void> {
    session.isStopped = true;
    session.isFinalizing = false;
    if (session.messageId !== -1 && session.result) await session.onProgressStreaming(session.messageId, session.result, true);
    if (!session.ownsRun()) return;
    ports.stopUI();
    if (suppressRecovery) return;
    ports.showFailure(session.messageId);
    void ports.emitReceived(session.messageId, session.type);
    void ports.emitRendered(session.messageId, session.type);
}

export interface GenerationResponseReply {
    type: string;
    getMessage: string;
    title: string | undefined;
    reasoning: string;
    imageUrls: string[] | null;
    reasoningSignature: string | null;
    ownsRun: () => boolean;
}

export interface PipelineFinalInput {
    type: string;
    text: string;
    step?: { id?: string; tool?: string } | null;
    meta?: { runId?: string | null } | null;
    reasoning?: string;
    reasoningSignature?: string | null;
    title?: string;
    imageUrls?: string[] | null;
    fromStream?: boolean;
}

export interface PipelineFinalPorts {
    ownsRun(): boolean;
    chat: Array<{ extra?: { tool_invocations?: Array<{ name?: string }>; reply_pipeline_run?: string | null; reply_pipeline_step?: string | null; [key: string]: unknown } }>;
    clean(text: string): string;
    formatTags(invocations: Array<{ name?: string }>, text: string): string;
    regexOutput(text: string): string;
    removeCardView(index: number): void;
    emitDeleted(length: number): Promise<unknown>;
    saveReply(reply: GenerationResponseReply): Promise<{ getMessage: string }>;
    endPipeline(): void;
    saveChat(ownsRun: () => boolean): Promise<unknown>;
    unblock(type: string): void;
    clearProcessor(): void;
    refresh(): void;
}

/** Commit a final-direct pipeline reply by folding the run's progress card into it. */
async function finalizePipelineReply(input: PipelineFinalInput, ports: PipelineFinalPorts): Promise<String | undefined> {
    if (!ports.ownsRun()) return;
    const { type, text, step, meta, fromStream = false, reasoning = '', reasoningSignature = null, title, imageUrls = null } = input;
    const cleaned = ports.clean(text);
    const runId = meta?.runId ?? null;
    let tagMarkup = '';
    let mergedInvocations: Array<{ name?: string }> | null = null;
    if (runId) {
        let cardIndex = -1;
        for (let index = ports.chat.length - 1; index >= 0; index--) {
            const message = ports.chat[index];
            if (Array.isArray(message?.extra?.tool_invocations) && message.extra.reply_pipeline_run === runId) {
                cardIndex = index;
                break;
            }
        }
        if (cardIndex >= 0) {
            mergedInvocations = ports.chat[cardIndex].extra!.tool_invocations!;
            const replyIsTagged = mergedInvocations.at(-1)?.name === step?.tool;
            tagMarkup = ports.formatTags(mergedInvocations, replyIsTagged ? cleaned : '');
            if (!replyIsTagged) tagMarkup = `${tagMarkup}\n${cleaned}`;
            tagMarkup = ports.regexOutput(tagMarkup);
            if (!ports.ownsRun()) return;
            ports.chat.splice(cardIndex, 1);
            ports.removeCardView(cardIndex);
            await ports.emitDeleted(ports.chat.length);
        }
    }
    if (!ports.ownsRun()) return;
    const saved = await ports.saveReply({ type, getMessage: tagMarkup || cleaned, reasoning, reasoningSignature, title, imageUrls, ownsRun: () => ports.ownsRun() });
    if (!ports.ownsRun()) return;
    const savedMessage = ports.chat.at(-1);
    if (savedMessage?.extra) {
        savedMessage.extra.reply_pipeline_run = runId;
        savedMessage.extra.reply_pipeline_step = step?.id ?? null;
        if (mergedInvocations) savedMessage.extra.tool_invocations = mergedInvocations;
    }
    ports.endPipeline();
    await ports.saveChat(() => ports.ownsRun());
    if (!ports.ownsRun()) return;
    ports.unblock(type);
    ports.clearProcessor();
    ports.refresh();
    return Object.defineProperties(new String(saved.getMessage), {
        messageChunk: { value: cleaned },
        ...(fromStream ? { fromStream: { value: true } } : {}),
    });
}

export interface GenerationResponsePorts {
    ownsRun(): boolean;
    continuePipeline(): Promise<unknown>;
    continueAfterTools(): Promise<unknown>;
    unblock(type: string): void;
    showApiError(response: unknown): void;
    extractJson(data: unknown, returnInvalid: boolean): unknown;
    extractMessage(data: unknown): string;
    extractTitle(data: unknown): string | undefined;
    extractReasoning(data: unknown): string;
    extractImages(data: unknown): string[] | null;
    extractSignature(data: unknown): string | null;
    clean(text: string, displayIncomplete: boolean): string;
    cleanReasoning(reasoning: string): string;
    hasRecoveryMessage(): boolean;
    replaceRecovery(reply: GenerationResponseReply): Promise<{ type: string; getMessage: string } | null | undefined>;
    clearRecoveryStatus(): void;
    saveReply(reply: GenerationResponseReply): Promise<{ type: string; getMessage: string }>;
    setType(type: string): void;
    hasToolCalls(data: unknown): boolean;
    deleteLastMessage(): Promise<unknown>;
    invokeTools(data: unknown, reasoning: string, ownsRun: () => boolean): Promise<{ invocations: unknown[]; stealthCalls: unknown[]; errors?: unknown[] }>;
    showToolErrors(errors: unknown[]): void;
    preparePipeline(invocations: unknown[]): { action: string; text: string; step: unknown; meta: unknown } | null | undefined;
    saveTools(invocations: unknown[], ownsRun: () => boolean): Promise<unknown>;
    finalizePipeline(input: { type: string; text: string; step: unknown; meta: unknown; reasoning: string; reasoningSignature: string | null; title: string | undefined; imageUrls: string[] | null }): Promise<unknown>;
    logSave(): void;
    endPipeline(): void;
    saveChat(ownsRun: () => boolean): Promise<unknown>;
    clearProcessor(): void;
}

export interface GenerationResponseInput {
    data: unknown;
    type: string;
    quietToLoud?: boolean;
    jsonSchema?: { returnInvalid?: boolean } | null;
    canPerformToolCalls: boolean;
}

/** Own successful generation response handling, retaining transport and browser work as ports. */
async function completeGenerationResponse(input: GenerationResponseInput, ports: GenerationResponsePorts): Promise<unknown> {
    const { data, quietToLoud, jsonSchema, canPerformToolCalls } = input;
    let { type } = input;
    if (!data || !ports.ownsRun()) return;
    const response = data as { pipelineContinuation?: boolean; fromStream?: boolean; error?: unknown; response?: string };
    if (response.pipelineContinuation) return ports.continuePipeline();
    if (response.fromStream) return data;
    if (response.error) {
        ports.unblock(type);
        if (response.response) ports.showApiError(response.response);
        throw new Error(response.response);
    }
    if (jsonSchema) {
        ports.unblock(type);
        return ports.extractJson(data, jsonSchema.returnInvalid ?? false);
    }
    let getMessage = ports.extractMessage(data);
    const title = ports.extractTitle(data);
    let reasoning = ports.extractReasoning(data);
    const imageUrls = ports.extractImages(data);
    const reasoningSignature = ports.extractSignature(data);
    const messageChunk = ports.clean(getMessage, false);
    reasoning = ports.cleanReasoning(reasoning).trim();
    getMessage = ports.clean(getMessage, type === 'quiet' && !quietToLoud);
    if (!ports.ownsRun()) return;
    if (type === 'quiet') {
        ports.unblock(type);
        return getMessage;
    }
    const reply: GenerationResponseReply = { type, getMessage, title, reasoning, imageUrls, reasoningSignature, ownsRun: () => ports.ownsRun() };
    if (ports.hasRecoveryMessage()) {
        const replacement = await ports.replaceRecovery(reply);
        if (!ports.ownsRun() || !replacement) return;
        ({ type, getMessage } = replacement);
        ports.setType(type);
        ports.clearRecoveryStatus();
    } else {
        ({ type, getMessage } = await ports.saveReply(reply));
        if (!ports.ownsRun()) return;
        ports.setType(type);
    }
    if (!ports.ownsRun()) return;
    if (canPerformToolCalls) {
        const hasToolCalls = ports.hasToolCalls(data);
        const shouldDeleteMessage = ['', '...'].includes(getMessage) && !reasoning;
        if (hasToolCalls && shouldDeleteMessage) await ports.deleteLastMessage();
        if (!ports.ownsRun()) return;
        const invocation = await ports.invokeTools(data, reasoning, () => ports.ownsRun());
        if (!ports.ownsRun()) return;
        const shouldStop = (!invocation.invocations.length && shouldDeleteMessage) || invocation.stealthCalls.length;
        if (hasToolCalls) {
            if (shouldStop) {
                if (Array.isArray(invocation.errors) && invocation.errors.length) ports.showToolErrors(invocation.errors);
                ports.endPipeline();
                ports.unblock(type);
                return;
            }
            const decision = ports.preparePipeline(invocation.invocations);
            await ports.saveTools(invocation.invocations, () => ports.ownsRun());
            if (!ports.ownsRun()) return;
            if (decision?.action === 'final') {
                return ports.finalizePipeline({ type, text: decision.text, step: decision.step, meta: decision.meta, reasoning, reasoningSignature, title, imageUrls });
            }
            return ports.continueAfterTools();
        }
    }
    ports.logSave();
    ports.endPipeline();
    await ports.saveChat(() => ports.ownsRun());
    if (!ports.ownsRun()) return;
    ports.unblock(type);
    ports.clearProcessor();
    return Object.defineProperty(new String(getMessage), 'messageChunk', { value: messageChunk });
}

export interface GenerationStreamState {
    result: string;
    messageId: number;
    firstMessageText: string;
    isStopped: boolean;
    isFinished: boolean;
    suppressErrorRecovery: boolean;
    abortController: AbortController;
    ownsRun(): boolean;
    createdAt: Date;
    timeToFirstToken: number | null;
    toolCalls: unknown[];
    images: string[];
    reasoningSignature: string | null;
    observedTokenCount: number;
    observedChunkCount: number;
    stoppingStrings: string[];
    reasoningHandler: { updateReasoning(messageId: number, reasoning: unknown): void };
    generator(): AsyncGenerator<{ text: string; toolCalls: unknown[]; state?: { reasoning?: unknown; images?: string[]; signature?: string | null } }>;
    onStartStreaming(text: string): Promise<number>;
    onProgressStreaming(messageId: number, text: string): Promise<void>;
    onErrorStreaming(options: { suppressRecovery: boolean }): Promise<void>;
}

export interface GenerationStreamPorts {
    delay(): Promise<void>;
    resetScroll(): void;
    stoppingStrings(): string[];
    createStopwatch(): { tick(callback: () => Promise<void>): Promise<void> };
    refresh(): void;
    emitToken(text: string): Promise<unknown>;
    mount(): void;
}

/** Own the actual stream iteration while browser UI and transport remain ports. */
async function generateStream(session: GenerationStreamState, ports: GenerationStreamPorts): Promise<string> {
    const stopped = () => session.isStopped || session.abortController.signal.aborted || !session.ownsRun();
    if (session.messageId === -1) {
        session.messageId = await session.onStartStreaming(session.firstMessageText);
        await ports.delay();
        if (stopped()) return session.result;
        ports.resetScroll();
    }
    if (stopped()) return session.result;
    session.stoppingStrings = ports.stoppingStrings();
    try {
        const stopwatch = ports.createStopwatch();
        const timestamps: number[] = [];
        for await (const { text, toolCalls, state } of session.generator()) {
            const now = Date.now();
            timestamps.push(now);
            if (!session.timeToFirstToken) session.timeToFirstToken = now - session.createdAt.getTime();
            if (stopped()) return session.result;
            session.toolCalls = toolCalls;
            session.result = text;
            session.observedTokenCount += 1;
            session.observedChunkCount += 1;
            ports.refresh();
            session.reasoningHandler.updateReasoning(session.messageId, state?.reasoning);
            session.images = state?.images ?? [];
            session.reasoningSignature = state?.signature ?? null;
            await ports.emitToken(text);
            if (stopped()) return session.result;
            await stopwatch.tick(async () => await session.onProgressStreaming(session.messageId, text));
            if (stopped()) return session.result;
        }
        const seconds = (timestamps[timestamps.length - 1] - timestamps[0]) / 1000;
        console.warn(`Stream stats: ${timestamps.length} tokens, ${seconds.toFixed(2)} seconds, rate: ${Number(timestamps.length / seconds).toFixed(2)} TPS`);
    } catch (err: unknown) {
        if (!session.isFinished) {
            console.error(err);
            await session.onErrorStreaming({ suppressRecovery: session.suppressErrorRecovery });
        }
        return session.result;
    }
    session.isFinished = true;
    ports.mount();
    return session.result;
}

/** Owns run admission and live identity until execution and its awaited saves complete. */
export function createGenerationLifecycleService(readIdentity: () => GenerationContextIdentity) {
    const runRequestScope = createRequestScopeRunner();
    let nextId = 0;
    let foregroundId: number | null = null;
    const active = new Set<number>();
    const restoredSnapshots = new WeakSet<object>();

    /** Own one round's mutable dispatch state and connect its transport, stream, recovery and response. */
    async function runGenerationDispatch<
        Command extends { depth: number; capabilities: { autoRecover: boolean } },
        Attempt extends { status: string; label: string; fallbackProvider: Fallback },
        Fallback, Trace extends { pipelineRun?: unknown; pipelineStep?: unknown },
        Schema extends GenerationResponseInput['jsonSchema'],
        Processor extends CompletedStreamProcessor<unknown>, Pipeline,
    >(input: {
        type: string; depth: number; canPerformTools: boolean; pipeline: Pipeline; isOpenAI: boolean;
        command: Command; trace: Trace; jsonSchema: Schema; quietToLoud?: boolean; signal?: AbortSignal; cancelSignal?: AbortSignal;
    }, ports: {
        ownsRun(): boolean; currentProcessor(): Processor | null | undefined; isOpenAI?(): boolean;
        isRecoveryMessage(id: number | null): boolean; createRecoveryMessage(): Promise<number | { messageId: number; identity: object }>;
        recoveryIdentityAt?(id: number): object | undefined; recoveryIndexOf?(identity: object): number;
        getModel(): string | null; setModel(model: string | null): void;
        continueGeneration(type: string, depth: number): Promise<unknown>;
        round(state: ReturnType<typeof createDispatchState<Processor, Pipeline>>, recovery: ReturnType<typeof createRecoveryState>): Omit<Parameters<typeof executeGenerationRound<Command, Attempt, unknown>>[1], 'recovery' | 'ownsRun' | 'isCancelled' | 'run'>;
        transport(state: ReturnType<typeof createDispatchState<Processor, Pipeline>>, recovery: ReturnType<typeof createRecoveryState>): Omit<GenerationTransportPorts<Trace, Schema, Fallback, unknown, unknown, unknown, string, Processor>, 'ownsRun' | 'setCanPerformTools' | 'ownsStream' | 'finishStream' | 'emptyFailure'>;
        stream(state: ReturnType<typeof createDispatchState<Processor, Pipeline>>, recovery: ReturnType<typeof createRecoveryState>, processor: Processor): Omit<StreamAttemptPorts<unknown, unknown, unknown, unknown, unknown>, 'continueGeneration' | 'emptyFailure'>;
        response(state: ReturnType<typeof createDispatchState<Processor, Pipeline>>, recovery: ReturnType<typeof createRecoveryState>): Omit<GenerationResponsePorts, 'continuePipeline' | 'continueAfterTools'>;
        failure(state: ReturnType<typeof createDispatchState<Processor, Pipeline>>, recovery: ReturnType<typeof createRecoveryState>): Parameters<typeof failGeneration>[1];
    }): Promise<unknown> {
        const state = createDispatchState(input, ports);
        const recovery = createRecoveryState({ ownsRun: ports.ownsRun, isRecoveryMessage: ports.isRecoveryMessage, createMessage: ports.createRecoveryMessage,
            identityAt: ports.recoveryIdentityAt, indexOfIdentity: ports.recoveryIndexOf });
        const emptyFailure = (messageId: number | null) => {
            const error: Error & { emptyReply: boolean; messageId: number | null } = Object.assign(new Error('empty reply'), { emptyReply: true, messageId });
            return error;
        };
        const continueAfterTools = () => ports.continueGeneration('normal', state.nextDepth());
        const round = ports.round(state, recovery);
        const transport = ports.transport(state, recovery);
        return runRequestScope({
            getModel: ports.getModel, setModel: ports.setModel, ownsRun: ports.ownsRun,
            execute: () => executeGenerationRound({ ...input, type: state.type, depth: state.depth, hasPipeline: Boolean(state.pipeline) }, {
                ...round, recovery, ownsRun: ports.ownsRun,
                isCancelled: () => Boolean(input.cancelSignal?.aborted) || state.cancelled(),
                run: (attempt, index, attemptCount) => runTransportAttempt({
                    type: state.type, depth: state.depth, canPerformTools: state.canPerformTools, isOpenAI: ports.isOpenAI?.() ?? input.isOpenAI,
                    attempt, index, attemptCount, jsonSchema: input.jsonSchema, trace: input.trace,
                }, {
                    ...transport, ownsRun: ports.ownsRun,
                    emptyFailure: () => emptyFailure(recovery.messageId),
                    setCanPerformTools: value => { state.canPerformTools = value; },
                    createStream: context => { const processor = transport.createStream(context); state.processor = processor; return processor; },
                    ownsStream: processor => state.ownsStream(processor),
                    finishStream: (context, text, processor) => finishStreamAttempt({
                        type: state.type, isOpenAI: ports.isOpenAI?.() ?? input.isOpenAI, canPerformTools: state.canPerformTools,
                        attemptModel: context.attemptModel, text, processor,
                    }, { ...ports.stream(state, recovery, processor), continueGeneration: continueAfterTools, emptyFailure }),
                }),
            }),
            success: data => completeGenerationResponse({ data, type: state.type, quietToLoud: input.quietToLoud,
                jsonSchema: input.jsonSchema, canPerformToolCalls: state.canPerformTools }, { ...ports.response(state, recovery),
                    continuePipeline: () => ports.continueGeneration('normal', state.depth + 1), continueAfterTools }),
            failure: error => failGeneration(error, ports.failure(state, recovery)),
        });
    }

    /** Capture the target for work that can outlive the run's error boundary. */
    function captureContextGuard(...signals: Array<AbortSignal | undefined>): () => boolean {
        const target = readIdentity();
        let invalid = false;
        return () => {
            const current = readIdentity();
            if (current.chatId !== target.chatId || current.chatReference !== target.chatReference
                || current.contextRevision !== target.contextRevision || signals.some(signal => signal?.aborted)) invalid = true;
            return !invalid;
        };
    }

    async function restoreRegenerateTurn(snapshot: { ownsRestore: () => boolean }, ports: RegenerateRestorePorts): Promise<boolean> {
        if (restoredSnapshots.has(snapshot) || !snapshot.ownsRestore()) return false;
        restoredSnapshots.add(snapshot);
        ports.commit();
        await ports.save(snapshot.ownsRestore);
        if (!snapshot.ownsRestore()) return false;
        await ports.render();
        if (!snapshot.ownsRestore()) return false;
        ports.scroll();
        return true;
    }

    async function run<Result>({ foreground, signal, execute, onComplete }: GenerationRunInput<Result>): Promise<Result | undefined> {
        if (foreground && foregroundId !== null) return undefined;
        const runId = ++nextId;
        const target = readIdentity();
        let runSignal: AbortSignal | undefined;
        let cancelled = false;
        active.add(runId);
        if (foreground) foregroundId = runId;
        const lease: GenerationLease = {
            runId,
            owns: () => {
                const current = readIdentity();
                if (current.chatId !== target.chatId || current.chatReference !== target.chatReference
                    || current.contextRevision !== target.contextRevision || signal?.aborted || runSignal?.aborted) {
                    cancelled = true;
                }
                return active.has(runId) && !cancelled;
            },
            setSignal: value => { runSignal = value; },
            cancel: () => { cancelled = true; },
        };
        try {
            const result = await execute(lease);
            if (result != null && lease.owns() && onComplete) await onComplete(result, () => lease.owns());
            return result;
        } finally {
            active.delete(runId);
            if (foregroundId === runId) foregroundId = null;
        }
    }
    return { run, runGenerationDispatch, captureContextGuard, restoreRegenerateTurn, generateStream, isSubmissionStale, cancelStaleSubmission, createStreamState, initializeAttemptStream, stopStream, createDispatchState, createRecoveryState, createAttemptRecoveryController, prepareGenerationEnvelope, derivePreviewBudget, runGenerationEntry, runQuietGeneration, prepareOwnedGeneration, runOwnedRequest,
        canRegenerateLastReply, collectRegenerateTurn, findRegenerateTurnStart, isRegenerateRemovableMessage, isUserStoppedGenerationError, prepareGenerationPreflight, prepareRegeneration, removeRegenerateTail, prepareRegenerateRestore, startStreamMessage, progressStreamMessage, finalizeStreamMessage, finishStreamMessage, errorStreamMessage, completeGenerationResponse, finalizePipelineReply, selectPromptHistory, assembleOpenAIRequest, preparePipelineContinuation, publishGenerationData, runTransportAttempt, finishStreamAttempt, assemblePromptHistory, assembleWorldInfoStory, assembleUserInput, createRequestEntry, createPromptContext, prepareComposer, prepareGenerationEntry, prepareGenerationBase, prepareGenerationFoundation, prepareRequestStages, preparePromptPolicy, prepareAttemptPlan, executeGenerationRound, runRecoveryAttempts, cleanupStoppedGeneration, withPreviewPromptSnapshot, buildPreviewResult, assembleRequestPrompt, assemblePromptContent, formatPromptHistory, modifyLastPromptLine, buildTextPromptMessages, prepareTextPrompt, combinePrompt, runRequestScope, failGeneration, isGenerationResultEmpty };
}

export async function executeGenerationAttempts<Attempt, Result>({
    attempts = [],
    prepareRetryAttempt = async () => {},
    runAttempt,
    handleFailure,
    signal,
    isCancelled = () => false,
}: GenerationAttemptInput<Attempt, Result>): Promise<Result> {
    if (typeof runAttempt !== 'function' || typeof handleFailure !== 'function') {
        throw new TypeError('Generation attempt runner requires runAttempt and handleFailure callbacks.');
    }
    const checkCancelled = () => {
        if (signal?.aborted || isCancelled()) throw new Error('Generation was aborted.');
    };
    let lastException: unknown = null;
    for (let index = 0; index < attempts.length; index += 1) {
        const attempt = attempts[index];
        checkCancelled();
        await prepareRetryAttempt(attempt, index);
        checkCancelled();
        try {
            const result = await runAttempt(attempt, index);
            checkCancelled();
            return result;
        } catch (exception: unknown) {
            checkCancelled();
            lastException = exception;
            const failure = await handleFailure(exception, attempt, index);
            checkCancelled();
            if (failure?.action !== 'retry') throw failure?.exception ?? exception;
        }
    }
    throw lastException ?? new Error('Generation command has no executable attempts.');
}
