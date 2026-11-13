/* eslint-disable */
// Generated from app/lib/generation/attempt-executor.ts; run pnpm run build:generation-state.
/** The attempt loop is transport-agnostic; each pipeline round supplies its own attempts. */
import { canRegenerateLastReply, collectRegenerateTurn, derivePreviewBudget, findRegenerateTurnStart, isRegenerateRemovableMessage, isUserStoppedGenerationError, prepareGenerationEnvelope, runGenerationEntry, runQuietGeneration } from './generation-shared-state.js';



































/** Reserve injected history first, then fill the context in original priority order. */
async function selectPromptHistory(input                    , count                                   )                                                             {
    const selected                            = Array.from({ length: input.messages.length });
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
    const messages           = [];
    const injectedIndices           = [];
    for (let index = 0; index < selected.length; index++) {
        const item = selected[index];
        if (item !== undefined) {
            messages.push(item);
            if (input.injectedIndices.includes(index)) injectedIndices.push(messages.length - 1);
        }
    }
    return { messages, injectedIndices };
}

























/** Assemble the request using the existing prompt manager, with pipeline preview budget policy. */
async function assembleOpenAIRequest                                   (input                             , ports                                                       ) {
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

async function preparePipelineContinuation        (ports

 )                                     {
    if (!ports.ownsRun()) return null;
    const [prompt] = await ports.prepare();
    return ports.ownsRun() ? { prompt } : null;
}

async function publishGenerationData      (data      , dryRun         , ports

 )                   {
    if (!ports.ownsRun()) return false;
    await ports.emit(data, dryRun);
    return ports.ownsRun();
}

function isSubmissionStale(input                           )          {
    const submitted = input.composerSubmission;
    if (!submitted || input.dryRun) return !input.ownsRun;
    return input.currentChat !== input.submittedChat || input.current?.contextKey !== submitted.contextKey
        || input.current?.contextRevision !== submitted.contextRevision || input.submissionAborted || input.externalAborted;
}

function cancelStaleSubmission(input                           , unblock            )          {
    const stale = isSubmissionStale(input);
    if (stale && input.composerSubmission && !input.dryRun) unblock();
    return stale;
}

function createRequestEntry            (input


 , ports


 ) {
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

function prepareComposer                                      (input

 , ports


 )                          {
    if (input.regenerate) {
        if (ports.isSending()) { ports.onBusy(); return null; }
        ports.setSending(true);
        return { text: '' };
    }
    if (input.type !== 'quiet' && !input.depth && (!input.dryRun || input.preview)) {
        if (!input.preview) ports.setSending(true);
        const submission = input.submission ;
        const text = submission.value;
        if (!input.preview && ports.currentValue() === text) ports.clear(submission);
        return { text };
    }
    return { text: '' };
}

/** Own quiet substitution and the connection gate before request assembly begins. */
function prepareGenerationPreflight(input                                                             , ports



 )                                                    {
    const quietPrompt = input.quietPrompt ? ports.substitute(input.quietPrompt) : input.quietPrompt;
    if (!input.dryRun && !ports.hasBackendConnection()) {
        ports.clearSending();
        return null;
    }
    return { quietPrompt };
}

/** Decide whether the real regenerate path may remove a turn and return its snapshot. */
function prepareRegeneration          (input                                                                  , ports

 )                  {
    if (!input.isRegenerate || input.dryRun) return null;
    return ports.remove(input.signal);
}

/** Commit the selected generated tail synchronously before starting regeneration. */
function removeRegenerateTail                                                                       (snapshot          , ports









 )           {
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

function prepareRegenerateRestore                                      (
    snapshot                                                                                                        ,
    ports                                            ,
)                                                                          {
    if (!snapshot || !Array.isArray(snapshot.messages) || snapshot.messages.length === 0) return { kind: 'empty' };
    if (typeof snapshot.ownsRestore !== 'function' || !snapshot.ownsRestore() || ports.chatId !== snapshot.chatId) return { kind: 'stale' };
    const tail = ports.collect();
    return tail.insertIndex === snapshot.insertIndex ? { kind: 'ready', tail } : { kind: 'changed' };
}













































/** Select and run the existing provider transport for one bounded recovery attempt. */
async function runTransportAttempt                                                                                   (input                                                     , ports                                                                                                             )                                   {
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






















/** Mutable stream data has one owner; the browser session only exposes its compatibility properties. */




















function createStreamState(timeStarted      )                             {
    return {
        result: '', messageId: -1, isStopped: false, isFinished: false,
        abortController: new AbortController(), firstMessageText: '...', timeStarted,
        timeToFirstToken: null, createdAt: new Date(), toolCalls: [], images: [],
        reasoningSignature: null, suppressErrorRecovery: false, isFinalizing: false,
        observedTokenCount: 0, observedChunkCount: 0, fromFallbackAttempt: false,
    };
}

/** Initialize an attempt's stream with the recovery row owned by its pipeline round. */
function initializeAttemptStream                                                                                                    (
    input                                                                                , create              ,
)         {
    const stream = create();
    stream.suppressErrorRecovery = input.intermediate;
    stream.fromFallbackAttempt = input.fallback;
    if (input.recoveryMessageId !== null && input.recoveryMessageId >= 0) stream.messageId = input.recoveryMessageId;
    return stream;
}

function stopStream(stream                            )       {
    stream.abortController.abort();
    stream.isStopped = true;
    stream.isFinalizing = false;
    stream.isFinished = true;
}









/** Mutable dispatch data belongs to the request, not the shared shell. */
function createDispatchState                     (input

 , ports                                                                          ) {
    return {
        type: input.type,
        depth: input.depth,
        canPerformTools: input.canPerformTools,
        pipeline: input.pipeline,
        processor: null                    ,
        nextDepth()         { return ++this.depth; },
        ownsStream(processor           )          {
            return processor != null && ports.ownsRun() && this.processor === processor && ports.currentProcessor() === processor;
        },
        ownsCleanup()          {
            const current = ports.currentProcessor();
            return ports.ownsRun() && (!this.processor || !current || current === this.processor);
        },
        cancelled()          { return !this.ownsCleanup(); },
    };
}

/** A pipeline round owns one recovery row through all its bounded attempts. */
function createRecoveryState(ports                    ) {
    let identity                    ;
    let storedId                = null;
    return {
        get messageId()                {
            if (!identity || !ports.indexOfIdentity) return storedId;
            const index = ports.indexOfIdentity(identity);
            return index < 0 ? null : index;
        },
        set messageId(id               ) {
            storedId = id;
            identity = id === null ? undefined : ports.identityAt?.(id);
        },
        get hasIdentity()          { return Boolean(identity); },
        async ensure(candidate                = null)                         {
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
















/** Each pipeline round retains its own recovery row across retries. */
function createAttemptRecoveryController                                                   (input                                                      , ports                               ) {
    const { recovery } = ports;
    async function ensure(candidate               ) {
        await recovery.ensure(candidate);
        if (!ports.ownsRun()) throw new Error('Generation was aborted.');
    }
    return {
        async prepareRetryAttempt(attempt         , index        )                {
            if (index <= 0) return;
            await ensure(recovery.messageId);
            ports.clearMessage(recovery.messageId);
            ports.showStatus(recovery.messageId, attempt.status, attempt.label === 'fallback' ? 'fallback' : 'primary');
            ports.deactivate();
            ports.showStop();
        },
        async handleAttemptFailure(exception         , attempt         , index        )                                                                               {
            if (recovery.hasIdentity && recovery.messageId === null) throw new Error('Generation recovery message is no longer available.');
            const errorMessageId = typeof exception === 'object' && exception !== null && 'messageId' in exception ? (exception                                 ).messageId : null;
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
async function runRecoveryAttempts                                                           (input

 , ports



 )                  {
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
function cleanupStoppedGeneration(input


 , ports                                                                  )          {
    if (!input.aborted || input.current.chatId !== input.expected.chatId
        || input.current.chatReference !== input.expected.chatReference || input.current.contextRevision !== input.expected.contextRevision
        || input.processor !== input.expectedProcessor || input.pipeline !== input.expectedPipeline) return false;
    ports.endPipeline();
    ports.unblock();
    ports.clearProcessor();
    return true;
}

const previewPromptOwners = new WeakMap                                                           ();
const absentPrompt = Symbol('absent prompt');




// Track nested plain data without invoking accessors; unknown mutable objects are
// conservatively retained rather than erased when the preview is released.
function previewPromptProperties(value         )                           {
    if (!value || typeof value !== 'object') return null;
    const nodes = new Map                               ();
    const pending           = [value];
    try {
        while (pending.length) {
            const object = pending.pop() ;
            if (nodes.has(object)) continue;
            const prototype = Object.getPrototypeOf(object);
            if (prototype !== Object.prototype && prototype !== null && prototype !== Array.prototype) return { nodes, safe: false };
            if (nodes.size >= 10000) return { nodes, safe: false };
            const properties = Object.getOwnPropertyDescriptors(object);
            nodes.set(object, properties);
            for (const key of Reflect.ownKeys(properties)) {
                const descriptor = Reflect.get(properties, key)                      ;
                if (descriptor.get || descriptor.set) return { nodes, safe: false };
                if (descriptor.value && typeof descriptor.value === 'object') pending.push(descriptor.value);
            }
        }
        return { nodes, safe: true };
    } catch {
        return { nodes, safe: false };
    }
}

function previewPromptPropertiesMatch(value         , expected                          )          {
    if (!expected) return true;
    if (!expected.safe || !value || typeof value !== 'object') return false;
    try {
        for (const [object, properties] of expected.nodes) {
            const current = Object.getOwnPropertyDescriptors(object);
            const keys = Reflect.ownKeys(properties);
            if (keys.length !== Reflect.ownKeys(current).length) return false;
            if (!keys.every(key => {
                const a = Reflect.get(properties, key)                                  ;
                const b = Reflect.get(current, key)                                  ;
                return !!a && !!b && Object.is(a.value, b.value) && a.get === b.get && a.set === b.set
                    && a.enumerable === b.enumerable && a.configurable === b.configurable && a.writable === b.writable;
            })) return false;
        }
        return true;
    } catch { return false; }
}

/** Track synchronous preview writes and avoid rolling back changed prompt objects. */
async function withPreviewPromptSnapshot        (ports

 )                  {
    const changes                                                                                        = [];
    const read = (prompts                         , key        )              => Object.hasOwn(prompts, key) ? prompts[key] : absentPrompt;
    const scope = {
        mutate   (work         )    {
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
                    const record                      = { value, previous, parent: priorOwner?.value === previous ? priorOwner : undefined, finished: false, properties: previewPromptProperties(value) };
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
            const owners = previewPromptOwners.get(prompts) ;
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





































/** Own the stream's tool round and completion decisions, with shell effects injected. */
async function finishStreamAttempt                                           (input                                                                                                                                                   , ports                                                               )                                                                        {
    const { processor, text, type, attemptModel } = input;
    const check = () => { if (!ports.ownsRun()) throw new Error('Generation was aborted.'); };
    check();
    const messageChunk = ports.clean(text);
    check();
    const finished = !processor.isStopped && processor.isFinished;
    const calls = processor.toolCalls;
    const withCalls = Array.isArray(calls) && calls.length > 0;
    if (!input.canPerformTools && finished) {
        const count = Array.isArray(calls) ? calls.reduce((total        , group         ) => total + (Array.isArray(group) ? group.length : 0), 0) : 0;
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
    const error                                 = new Error('stream connection closed before completion');
    error.messageId = processor.messageId;
    throw error;
}

/** Keep overlapping request scopes from restoring a stale model over a newer scope. */
function createRequestScopeRunner() {

    let top               = null;
    return async function runRequestScope                         (ports


     )                  {
        const scope        = { previous: ports.getModel(), parent: top, ownsRun: ports.ownsRun ?? (() => true) };
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
                ports.setModel(previous         );
            } else {
                let child               = top;
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
function isGenerationResultEmpty        (input                                         , ports

 )          {
    if (input.jsonSchema) return false;
    if ((input.result                                   )?.fromStream) {
        return String(input.result ?? '').trim().length === 0;
    }
    return String(ports.clean(ports.extract(input.result)) ?? '').trim().length === 0;
}

/** Decide request eligibility and pipeline model selection before prompt assembly. */
function preparePromptPolicy(input

 , ports                                                                                                                           ) {
    if (input.preview && !input.isOpenAI) {
        return { terminal: { kind: 'prompt-preview-empty', reason: 'unsupported-api', warnings: input.warnings } }         ;
    }
    const canPerformTools = !input.dryRun && ports.canUseTools() && input.depth < ports.recurseLimit();
    const assemblyModel = (model        ) => input.preview ? ports.previewModel(model) : input.type === 'normal' ? ports.liveModel(model) : model;
    return { canPerformTools, assemblyModel }         ;
}

/** Select and execute the actual prompt/continuation stages before dispatch. */
async function prepareRequestStages                                                                                              (input

 , ports







 )                                                                                                                          {
    if (!ports.ownsRun()) return null;
    let data      ;
    let completion                    = null;
    let summarized                    = [];
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
function prepareAttemptPlan                                                                                 (input


 , ports


 )       {
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
async function executeGenerationRound                                                                                                                                      (input


 , ports





 )                  {
    ports.showStop();
    const { attempts, shouldAutoRecover } = prepareAttemptPlan(input, ports);
    return runRecoveryAttempts({ attempts, shouldAutoRecover, signal: input.signal }, {
        ...ports,
        run: (attempt, index) => ports.run(attempt, index, attempts.length),
    });
}







/** Build the inspector result from the same assembled messages without dispatching. */
async function buildPreviewResult                                                                                   (input



 , ports






 ) {
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
async function failGeneration(error         , ports



 )                 {
    if (!ports.ownsRun()) {
        ports.cleanupStopped();
        throw error;
    }
    const detail = error                                                                           ;
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




















/** Use the existing World Info scanner and extension prompt ports to assemble story context. */
async function assembleWorldInfoStory           (input                     , ports                                )                                                                                                                           {
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
async function assembleUserInput         (input


 , ports



 )                                                                  {
    const { text, type, bias, automatic, dryRun, depth, regenerate, preview, isOpenAI } = input;
    if ((text !== '' || (ports.hasAttachment() && type !== 'quiet')) && !automatic && type !== 'quiet' && !dryRun && !depth && !regenerate) {
        if (bias && !ports.removeMacros(text)) ports.sendSystem(bias);
        else await ports.sendUser(text, bias);
    } else if (text === '' && !automatic && !dryRun && !regenerate && (type === undefined || type === 'normal') && isOpenAI && ports.emptyText().trim().length > 0 && !depth) {
        await ports.sendUser(ports.emptyText().trim(), bias);
    }
    if (ports.isStale()) return null;
    const warnings           = [];
    let pending                 = null;
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
async function prepareGenerationEntry(input                                               , ports



 )                   {
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


/** Copy data-only prompt graphs without invoking getters or cloning callback functions. */
function clonePromptData(value         , seen = new WeakMap                ())          {
    if (value === null || typeof value !== 'object') return value;
    const prototype = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) return value;
    const existing = seen.get(value);
    if (existing) return existing;
    const copy         = Array.isArray(value) ? [] : Object.create(prototype);
    seen.set(value, copy);
    for (const key of Reflect.ownKeys(value)) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key) ;
        if ('value' in descriptor) descriptor.value = clonePromptData(descriptor.value, seen);
        Object.defineProperty(copy, key, descriptor);
    }
    return copy;
}
/** Explicit listener writes belong to this request; legacy writes remain global. */
function createPromptContext(ports



 ) {
    const local                          = Object.create(null);
    let isolatedPrompts                                     ;
    function snapshotPrompts()                          {
        const descriptors                        = Object.create(null);
        for (const source of [ports.globalPrompts(), local]) {
            for (const key of Reflect.ownKeys(source)) {
                const descriptor = Object.getOwnPropertyDescriptor(source, key) ;
                if (!descriptor.enumerable) continue;
                descriptor.configurable = true;
                if ('value' in descriptor) descriptor.writable = true;
                Object.defineProperty(descriptors, key, { value: descriptor, configurable: true, enumerable: true, writable: true });
            }
        }
        return clonePromptData(Object.defineProperties({}, descriptors))                           ;
    }
    return {
        setWorldInfoScanPrompt(key        , value         , position        , depth        , scan          , role         , filter                                            )       {
            ports.set(key, value, position, depth, scan, role, filter, isolatedPrompts ?? local);
        },
        requestPrompts()                                      {
            if (!ports.isolated) return undefined;
            if (!isolatedPrompts) isolatedPrompts = snapshotPrompts();
            return isolatedPrompts;
        },
        scanPrompts()                                      {
            if (ports.isolated) {
                if (!isolatedPrompts) isolatedPrompts = snapshotPrompts();
                return isolatedPrompts;
            }
            return Object.keys(local).length ? { ...ports.globalPrompts(), ...local } : undefined;
        },
    };
}
async function prepareGenerationBase               (ports





 )                                                                      {
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
async function prepareGenerationFoundation                                                                                                                  (ports









 ) {
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





/** Own request admission, composer/input preparation and the transition to prompt assembly. */
async function prepareOwnedGeneration                                                                 (input


 , ports












 )



                                                 {
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
async function runOwnedRequest                                                                                                                (ports




 )                            {
    const prepared = await ports.prepare();
    if (!prepared) return;
    if (prepared.kind === 'terminal') return prepared.value;
    if (!ports.ownsRun()) return;
    const assembly = await ports.assemble(prepared.state);
    if (!assembly.stages || !ports.ownsRun()) return;
    if (assembly.stages.kind === 'terminal') return assembly.stages.value;
    return ports.dispatch(prepared.state, assembly);
}

async function assembleRequestPrompt                                               (input

 , ports








 )                                                                                                        {
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
    const result = await ports.assembleOpenAI(openAIMessages            );
    if (!ports.ownsRun()) return null;
    if (!input.dryRun) ports.setOpenAIContext();
    return { prompt, generateData: result.generateData, chatCompletion: result.chatCompletion };
}














/** Own prompt history, text composition and OpenAI request construction as one request stage. */
async function assemblePromptContent                                                                                                    (
    input                                               ,
    ports









     ,
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
async function formatPromptHistory                                   (messages           , isOpenAI         , ports

 )                                                                                    {
    const injectedIndices = isOpenAI ? [] : await ports.inject(messages);
    const result           = [];
    const userIndices           = [];
    for (let i = messages.length - 1, j = 0; i >= 0; i--, j++) {
        const item = messages[j];
        result[i] = isOpenAI ? item.mes : ports.format(item);
        if (!isOpenAI && item.is_user) userIndices.push(i);
    }
    return { messages: result, userIndices, injectedIndices };
}



function modifyLastPromptLine(last        , input            )         {
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
function buildTextPromptMessages(messages          , isOpenAI         )                  {
    if (isOpenAI) return [];
    const chronological = [...messages].reverse();
    const result = chronological.map((message, index) => ({
        message: index === chronological.length - 1 ? message.replace(/\n?$/, '') : message,
        extensionPrompts: []            ,
    }));
    return result;
}

async function prepareTextPrompt(input


 , ports



 )                                                                           {
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











/** Combine the legacy text prompt while preserving the mutable extension event contract. */
async function combinePrompt           (input                                , ports

 )                  {
    if (input.isOpenAI) return '';
    const finalMesSend = structuredClone(input.messages);
    if (input.promptBias.trim().length !== 0) {
        const last = finalMesSend[finalMesSend.length - 1];
        last.message += /\s/.test(last.message.slice(-1)) ? input.promptBias.trimStart() : ` ${input.promptBias.trimStart()}`;
    }
    finalMesSend.forEach((item, index) => { item.injected = input.injectedIndices.includes(finalMesSend.length - index - 1); });
    const data                                 = {
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








async function assemblePromptHistory                                                          (input


 , ports







 )                                                                                  {
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
        const titles           = [];
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








/** Browser and persistence effects used by the typed stream message lifecycle. */












































const ownsStream = (session                      )          => session.ownsRun() && !session.abortController.signal.aborted;

/** Rebind only while the same object remains in the chat; never spin indefinitely. */
async function syncStreamMessage   (session                      , ports                    , message               , initialId        , checkInitial         , onStable                          )                                                  {
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

async function startStreamMessage(session                      , ports                    , text        )                  {
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

async function progressStreamMessage(session                      , ports                    , messageId        , text        , isFinal         )                {
    if (!ownsStream(session)) return;
    const initial = ports.getMessage(messageId);
    if (!initial) return;
    let processed = ports.clean(text, isFinal, session.stoppingStrings);
    for (const token of ['*', '"', '```', '~~~']) {
        if (!isFinal && ports.isOdd(ports.count(processed, token))) {
            processed = processed.trimEnd() + (token.length > 1 ? '\n' : '') + token;
        }
    }
    const changed = ports.getMessage(messageId) .mes !== processed;
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

async function finalizeStreamMessage(session                      , ports                    , messageId        , text        , unlockUI         )                {
    const original = ports.getMessage(messageId);
    const findMessage = () => {
        if (!original || !ownsStream(session)) return false;
        if (ports.getMessage(messageId) === original) return messageId;
        const currentId = ports.indexOfMessage?.(original) ?? -1;
        if (currentId < 0 || ports.getMessage(currentId) !== original) return false;
        return currentId;
    };
    const ownsMessage = () => findMessage() !== false;
    const syncMessage = async    (onStable                   ) => {
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
        const message = original ;
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

async function finishStreamMessage(session                      , ports                    , messageId        , text        )                {
    await session.finalizeIntermediaryMessage(messageId, text, { unlockUI: true });
    if (session.isStopped || !ownsStream(session)) return;
    await ports.saveChat(() => !session.isStopped && ownsStream(session));
}

async function errorStreamMessage(session                      , ports                    , suppressRecovery         )                {
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







































/** Commit a final-direct pipeline reply by folding the run's progress card into it. */
async function finalizePipelineReply(input                    , ports                    )                              {
    if (!ports.ownsRun()) return;
    const { type, text, step, meta, fromStream = false, reasoning = '', reasoningSignature = null, title, imageUrls = null } = input;
    const cleaned = ports.clean(text);
    const runId = meta?.runId ?? null;
    let tagMarkup = '';
    let mergedInvocations                                  = null;
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
            mergedInvocations = ports.chat[cardIndex].extra .tool_invocations ;
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









































/** Own successful generation response handling, retaining transport and browser work as ports. */
async function completeGenerationResponse(input                         , ports                         )                   {
    const { data, quietToLoud, jsonSchema, canPerformToolCalls } = input;
    let { type } = input;
    if (!data || !ports.ownsRun()) return;
    const response = data                                                                                                ;
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
    const reply                          = { type, getMessage, title, reasoning, imageUrls, reasoningSignature, ownsRun: () => ports.ownsRun() };
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



































/** Own the actual stream iteration while browser UI and transport remain ports. */
async function generateStream(session                       , ports                       )                  {
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
        const timestamps           = [];
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
    } catch (err         ) {
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
export function createGenerationLifecycleService(readIdentity                                 ) {
    const runRequestScope = createRequestScopeRunner();
    let nextId = 0;
    let foregroundId                = null;
    const active = new Set        ();
    const restoredSnapshots = new WeakSet        ();

    /** Own one round's mutable dispatch state and connect its transport, stream, recovery and response. */
    async function runGenerationDispatch





     (input


     , ports










     )                   {
        const state = createDispatchState(input, ports);
        const recovery = createRecoveryState({ ownsRun: ports.ownsRun, isRecoveryMessage: ports.isRecoveryMessage, createMessage: ports.createRecoveryMessage,
            identityAt: ports.recoveryIdentityAt, indexOfIdentity: ports.recoveryIndexOf });
        const emptyFailure = (messageId               ) => {
            const error                                                            = Object.assign(new Error('empty reply'), { emptyReply: true, messageId });
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
    function captureContextGuard(...signals                                )                {
        const target = readIdentity();
        let invalid = false;
        return () => {
            const current = readIdentity();
            if (current.chatId !== target.chatId || current.chatReference !== target.chatReference
                || current.contextRevision !== target.contextRevision || signals.some(signal => signal?.aborted)) invalid = true;
            return !invalid;
        };
    }

    async function restoreRegenerateTurn(snapshot                                , ports                        )                   {
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

    async function run        ({ foreground, signal, execute, onComplete }                            )                              {
        if (foreground && foregroundId !== null) return undefined;
        const runId = ++nextId;
        const target = readIdentity();
        let runSignal                         ;
        let cancelled = false;
        active.add(runId);
        if (foreground) foregroundId = runId;
        const lease                  = {
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

export async function executeGenerationAttempts                 ({
    attempts = [],
    prepareRetryAttempt = async () => {},
    runAttempt,
    handleFailure,
    signal,
    isCancelled = () => false,
}                                         )                  {
    if (typeof runAttempt !== 'function' || typeof handleFailure !== 'function') {
        throw new TypeError('Generation attempt runner requires runAttempt and handleFailure callbacks.');
    }
    const checkCancelled = () => {
        if (signal?.aborted || isCancelled()) throw new Error('Generation was aborted.');
    };
    let lastException          = null;
    for (let index = 0; index < attempts.length; index += 1) {
        const attempt = attempts[index];
        checkCancelled();
        await prepareRetryAttempt(attempt, index);
        checkCancelled();
        try {
            const result = await runAttempt(attempt, index);
            checkCancelled();
            return result;
        } catch (exception         ) {
            checkCancelled();
            lastException = exception;
            const failure = await handleFailure(exception, attempt, index);
            checkCancelled();
            if (failure?.action !== 'retry') throw failure?.exception ?? exception;
        }
    }
    throw lastException ?? new Error('Generation command has no executable attempts.');
}
