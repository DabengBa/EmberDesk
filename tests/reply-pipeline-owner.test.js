import { expect, jest, test } from '@jest/globals';
import { loadTsModule } from './helpers/load-ts-module.mjs';

const worldInfo = jest.fn(() => { throw new Error('WI must not be re-evaluated'); });
const attempts = jest.fn(async () => undefined);
jest.unstable_mockModule('../public/scripts/world-info-service.js', () => ({ getWorldInfoPrompt: worldInfo }));
jest.unstable_mockModule('../public/scripts/main-chat-composer-service.js', () => ({ getComposerValue: jest.fn(), getComposerSnapshot: jest.fn(() => ({ value: '', contextKey: null, revision: 0 })), clearComposerValue: jest.fn() }));
jest.unstable_mockModule('../public/scripts/chat-memory-service.js', () => ({ applyChatMemoryToCoreChat: jest.fn() }));
jest.unstable_mockModule('../public/scripts/chat-generation-command-service.js', () => ({
    executeGenerationAttempts: attempts, createGenerationCommandPlan: () => ({ attempts: [] }), createGenerationRequestEnvelope: jest.fn(),
}));
jest.unstable_mockModule('../public/scripts/i18n.js', () => ({ t: strings => strings[0] }));
jest.unstable_mockModule('../public/scripts/openai.js', () => ({ oai_settings: { reply_pipeline: { enabled: true, steps: [{ tool: 'analyze' }] } } }));

jest.unstable_mockModule('../public/scripts/feature-settings.js', () => ({ feature_settings: { tool_bindings: [{ name: 'analyze', enabled: true }] } }));
jest.unstable_mockModule('../public/scripts/tool-bindings.js', () => ({ syncPipelineToolBindings: jest.fn() }));
const { registerGenerationShellContext, installGenerationLifecycleService } = await import('../public/scripts/generation-shell-context.js');
const { getPipelineRunState } = await import('../public/scripts/reply-pipeline-core.js');
const runtime = await import('../public/scripts/reply-pipeline.js');
const { executeGenerationRequestInShell, getCurrentGenerationContextIdentity, GenerationStreamSession } = await import('../public/scripts/generation-service.js');
const { eventSource, event_types } = await import('../public/scripts/events.js');
const { createGenerationLifecycleService, executeGenerationAttempts } = await loadTsModule('app/lib/generation/attempt-executor.ts');
installGenerationLifecycleService(createGenerationLifecycleService(getCurrentGenerationContextIdentity));
globalThis.localStorage = { getItem: () => null };

function setup() {
    runtime.endPipelineRun(); runtime.beginPipelineRun();
    const run = getPipelineRunState();
    run.messages = [{ role: 'user', content: 'once-captured base' }];
    const base = jest.fn(() => { throw new Error('base assembly must not run'); });
    const prepare = jest.fn(async () => [structuredClone(run.messages)]);
    const context = { state: {
        main_api: 'openai', online_status: 'connected', characters: [], chat: [], chat_metadata: {},
        PromptReasoning: class {},
        ToolManager: { canPerformToolCalls: () => true, RECURSE_LIMIT: 10 }, oai_settings: { send_if_empty: '' },
    }, getBiasStrings: () => ({ messageBias: '', promptBias: '' }), pingServer: async () => true,
    getCharacterCardFields: base, substituteParams: base, prepareOpenAIMessages: prepare };
    registerGenerationShellContext(new Proxy(context, { get: (obj, key) => obj[key] ?? jest.fn() }));
    return { base, prepare, context };
}

test('existing owner continuation bypasses every base WI/macro/card assembly entry', async () => {
    const { base, prepare } = setup();
    await executeGenerationRequestInShell({ type: 'normal', options: { depth: 1 }, dryRun: false, command: {} });
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(base).not.toHaveBeenCalled();
    expect(worldInfo).not.toHaveBeenCalled();
});

test('stopping during continuation prompt assembly prevents the request dispatch', async () => {
    const { prepare } = setup();
    const controller = new AbortController();
    let release;
    let signalEntered;
    const entered = new Promise(resolve => { signalEntered = resolve; });

    const wait = new Promise(resolve => { release = resolve; });
    prepare.mockImplementationOnce(async () => { signalEntered(); await wait; return [[]]; });
    attempts.mockClear();
    const pending = executeGenerationRequestInShell({ type: 'normal', options: { depth: 1, signal: controller.signal }, dryRun: false, command: {} });
    await Promise.race([entered, pending.then(() => { throw new Error('Request ended before continuation preparation'); })]);
    controller.abort();
    release();
    await pending;
    expect(attempts).not.toHaveBeenCalled();
});

test('retry clears its own recovery row when another message arrives during row creation', async () => {
    const { context } = setup();
    context.state.chat.push({ mes: 'existing' });
    context.isAssistantRecoveryMessageId = id => Boolean(context.state.chat[id]?.recovery);
    context.clearGenerationAttemptMessage = jest.fn(id => { context.state.chat[id].mes = ''; });
    context.saveReply = jest.fn(async ({ onMessageCreated }) => {
        const recovery = { mes: 'recovery', recovery: true };
        context.state.chat.push(recovery);
        onMessageCreated?.(recovery);
        await Promise.resolve();
        context.state.chat.push({ mes: 'another message' });
    });
    attempts.mockImplementationOnce(async ({ prepareRetryAttempt }) => {
        await prepareRetryAttempt({ status: 'retry', label: 'primary' }, 1);
        throw new Error('end test');
    });
    globalThis.toastr = { error: jest.fn() };
    try {
        await executeGenerationRequestInShell({ type: 'normal', options: { depth: 1 }, dryRun: false, command: {} }).catch(() => {});
        expect(context.clearGenerationAttemptMessage).toHaveBeenCalledWith(1);
        expect(context.state.chat[2].mes).toBe('another message');
    } finally {
        runtime.endPipelineRun();
    }
});

test('retry does not clear an unrelated message if its recovery row disappeared', async () => {
    const { context } = setup();
    context.state.chat.push({ mes: 'existing' });
    context.isAssistantRecoveryMessageId = id => Boolean(context.state.chat[id]?.recovery);
    context.clearGenerationAttemptMessage = jest.fn();
    context.saveReply = jest.fn(async ({ onMessageCreated }) => {
        const recovery = { mes: 'recovery', recovery: true };
        context.state.chat.push(recovery);
        onMessageCreated?.(recovery);
        await Promise.resolve();
        context.state.chat.splice(1, 1, { mes: 'another message' });
    });
    attempts.mockImplementationOnce(async ({ prepareRetryAttempt }) => {
        await prepareRetryAttempt({ status: 'retry', label: 'primary' }, 1);
    });
    globalThis.toastr = { error: jest.fn() };
    try {
        await expect(executeGenerationRequestInShell({ type: 'normal', options: { depth: 1 }, dryRun: false, command: {} }))
            .rejects.toThrow('Generation recovery message is no longer available.');
        expect(context.clearGenerationAttemptMessage).not.toHaveBeenCalled();
        expect(context.state.chat[1].mes).toBe('another message');
    } finally {
        runtime.endPipelineRun();
    }
});

test.each(['insert', 'reorder', 'delete'])('retry never clears another row after recovery row %s', async change => {
    const { context } = setup();
    const original = { mes: 'existing', assistant: true };
    const other = { mes: 'unrelated', assistant: true };
    const recovery = { mes: 'recovery', assistant: true };
    context.state.chat.push(original, other);
    context.isAssistantRecoveryMessageId = id => Boolean(context.state.chat[id]?.assistant);
    context.clearGenerationAttemptMessage = jest.fn(id => { context.state.chat[id].mes = ''; });
    context.saveReply = jest.fn(async ({ onMessageCreated }) => {
        context.state.chat.push(recovery);
        onMessageCreated(recovery);
    });
    attempts.mockImplementationOnce(async ({ prepareRetryAttempt }) => {
        await prepareRetryAttempt({ status: 'retry', label: 'primary' }, 1);
        recovery.mes = 'retry text';
        if (change === 'insert') context.state.chat.unshift({ mes: 'inserted', assistant: true });
        if (change === 'reorder') context.state.chat.splice(0, 3, recovery, original, other);
        if (change === 'delete') context.state.chat.splice(context.state.chat.indexOf(recovery), 1);
        await prepareRetryAttempt({ status: 'fallback', label: 'fallback' }, 2);
        throw new Error('end test');
    });
    globalThis.toastr = { error: jest.fn() };
    try {
        const error = await executeGenerationRequestInShell({ type: 'normal', options: { depth: 1 }, dryRun: false, command: {} }).catch(value => value);
        expect(other.mes).toBe('unrelated');
        expect(original.mes).toBe('existing');
        if (change === 'delete') expect(error.message).toMatch(/recovery message.*no longer available/i);
        else expect(recovery.mes).toBe('');
    } finally {
        runtime.endPipelineRun();
    }
});

test.each(['before', 'during', 'delete', 'final', 'multiple', 'multiple-final', 'multiple-real', 'unstable', 'unstable-real'])('fallback stream preserves its target when row changes %s progress', async timing => {
    const { context } = setup();
    const other = { mes: 'unrelated', assistant: true };
    const third = { mes: 'another unrelated row', assistant: true };
    const recovery = { mes: 'recovery', assistant: true };
    context.state.chat.push(other);
    if (timing === 'multiple-real') context.state.chat.push(third);
    const reasoningIds = [];
    context.state.ReasoningHandler = class { updateReasoning() {} async process(id) { reasoningIds.push(id); } async finish() {} };
    context.state.Stopwatch = class { async tick(callback) { await callback(); } };
    context.state.generation_started = new Date();
    context.state.scrollLock = true;
    context.state.oai_settings = { send_if_empty: '', stream_openai: true, chat_completion_source: 'openai', openai_model: 'model' };
    let moving = false;
    let moveCount = 0;
    context.isReactMainChatOwner = () => {
        if (moving && (timing !== 'multiple-real' || moveCount < 2)) {
            if (timing === 'multiple-real') {
                context.state.chat.splice(context.state.chat.indexOf(recovery), 1);
                context.state.chat.splice(moveCount, 0, recovery);
            } else context.state.chat.unshift({ mes: 'moving', assistant: true });
            moveCount++;
        }
        return true;
    };
    context.isAssistantRecoveryMessageId = id => Boolean(context.state.chat[id]?.assistant);
    context.saveReply = jest.fn(async ({ onMessageCreated }) => { context.state.chat.push(recovery); onMessageCreated(recovery); });
    context.clearGenerationAttemptMessage = jest.fn(id => { context.state.chat[id].mes = ''; });
    context.sendStreamingRequest = async () => () => {};
    if (timing.endsWith('-real')) context.sendStreamingRequest = async () => async function* () {
        moving = true;
        yield { text: 'fallback token', toolCalls: [], state: {} };
    };
    context.cleanUpMessage = ({ getMessage }) => getMessage;
    context.countOccurrences = () => 0;
    context.isOdd = () => false;
    context.unblockGeneration = jest.fn();
    const received = jest.fn();
    const rendered = jest.fn();
    eventSource.on(event_types.MESSAGE_RECEIVED, received);
    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, rendered);
    let processor;
    let progressText;
    const progress = GenerationStreamSession.prototype.onProgressStreaming;
    const finalMove = jest.spyOn(GenerationStreamSession.prototype, 'onProgressStreaming').mockImplementation(function (...args) {
        const pending = progress.apply(this, args);
        if ((timing === 'final' || timing === 'multiple-final') && args[2]) {
            context.state.chat.unshift({ mes: 'inserted', assistant: true });
            if (timing === 'multiple-final') queueMicrotask(() => context.state.chat.unshift({ mes: 'inserted again', assistant: true }));
        }
        return pending;
    });
    const consume = timing.endsWith('-real') ? null : jest.spyOn(GenerationStreamSession.prototype, 'generate').mockImplementation(async function () {
        processor = this;
        if (timing === 'before') context.state.chat.unshift({ mes: 'inserted', assistant: true });
        moving = timing === 'unstable';
        const pending = this.onProgressStreaming(this.messageId, 'fallback token', false);
        if (timing === 'during' || timing === 'multiple') context.state.chat.unshift({ mes: 'inserted', assistant: true });
        if (timing === 'multiple') queueMicrotask(() => context.state.chat.unshift({ mes: 'inserted again', assistant: true }));
        if (timing === 'delete') context.state.chat.splice(context.state.chat.indexOf(recovery), 1);
        try { await pending; } finally { moving = false; }
        progressText = recovery.mes;
        this.result = 'fallback token';
        this.isFinished = true;
        return 'fallback token';
    });
    attempts.mockImplementationOnce(async ({ prepareRetryAttempt, runAttempt }) => {
        await prepareRetryAttempt({ status: 'fallback', label: 'fallback' }, 1);
        return runAttempt({ fallbackProvider: true, status: 'fallback', label: 'fallback' }, 1);
    });
    globalThis.toastr = { error: jest.fn() };
    try {
        const request = executeGenerationRequestInShell({ type: 'normal', options: { depth: 1 }, dryRun: false, command: {} });
        if (timing === 'delete') await expect(request).rejects.toThrow('Generation was aborted.');
        else if (timing === 'unstable' || timing === 'unstable-real') await expect(request).rejects.toThrow('Stream message kept moving during DOM synchronization.');
        else await request;
        expect(other.mes).toBe('unrelated');
        expect(recovery.mes).toBe(timing === 'delete' || timing.startsWith('unstable') ? '' : 'fallback token');
        if (timing === 'unstable') expect(moveCount).toBe(8);
        if (timing === 'unstable-real') expect(moveCount).toBeLessThanOrEqual(16);
        if (timing === 'multiple-real') {
            expect(moveCount).toBe(2);
            expect(third.mes).toBe('another unrelated row');
            expect(reasoningIds).toContain(1);
            expect(received).toHaveBeenCalledWith(1, 'normal');
            expect(rendered).toHaveBeenCalledWith(1, 'normal');
        }
        if (timing === 'multiple') expect(progressText).toBe('fallback token');
        if (timing === 'final' || timing === 'multiple-final') {
            expect(processor.isFinalizing).toBe(false);
            expect(context.unblockGeneration).toHaveBeenCalled();
            expect(received).toHaveBeenCalledWith(timing === 'final' ? 2 : 3, 'normal');
            expect(rendered).toHaveBeenCalledWith(timing === 'final' ? 2 : 3, 'normal');
        }
    } finally {
        moving = false;
        consume?.mockRestore();
        finalMove.mockRestore();
        eventSource.removeListener(event_types.MESSAGE_RECEIVED, received);
        eventSource.removeListener(event_types.CHARACTER_MESSAGE_RENDERED, rendered);
        runtime.endPipelineRun();
    }
});

test.each(['insert', 'delete'])('non-stream recovery does not replace the wrong row after %s', async change => {
    const { context } = setup();
    const other = { mes: 'unrelated', assistant: true };
    const recovery = { mes: 'recovery', assistant: true };
    context.state.chat.push(other);
    context.state.ToolManager.hasToolCalls = () => false;
    context.state.ToolManager.canPerformToolCalls = () => false;
    context.state.regex_placement = { REASONING: 1 };
    context.isAssistantRecoveryMessageId = id => Boolean(context.state.chat[id]?.assistant);
    context.saveReply = jest.fn(async ({ onMessageCreated }) => { context.state.chat.push(recovery); onMessageCreated(recovery); });
    context.clearGenerationAttemptMessage = jest.fn(id => { context.state.chat[id].mes = ''; });
    context.extractMessageFromData = () => 'final reply';
    context.extractReasoningFromData = () => '';
    context.getRegexedString = value => value;
    context.cleanUpMessage = ({ getMessage }) => getMessage;
    context.replaceAssistantRecoveryMessage = jest.fn(async (id, reply) => {
        context.state.chat[id].mes = reply.getMessage;
        return { type: reply.type, getMessage: reply.getMessage };
    });
    attempts.mockImplementationOnce(async ({ prepareRetryAttempt }) => {
        await prepareRetryAttempt({ status: 'fallback', label: 'fallback' }, 1);
        if (change === 'insert') context.state.chat.unshift({ mes: 'inserted', assistant: true });
        else context.state.chat.splice(context.state.chat.indexOf(recovery), 1);
        return { response: 'success' };
    });
    globalThis.toastr = { error: jest.fn() };
    try {
        await executeGenerationRequestInShell({ type: 'normal', options: { depth: 1 }, dryRun: false, command: {} });
        expect(other.mes).toBe('unrelated');
        if (change === 'insert') {
            expect(context.replaceAssistantRecoveryMessage).toHaveBeenCalledWith(2, expect.objectContaining({ getMessage: 'final reply' }));
            expect(recovery.mes).toBe('final reply');
        } else {
            expect(context.replaceAssistantRecoveryMessage).not.toHaveBeenCalled();
            expect(context.saveReply).toHaveBeenCalledTimes(1);
        }
    } finally {
        runtime.endPipelineRun();
    }
});

test('stopping during the generation data event prevents request dispatch', async () => {
    setup();
    const controller = new AbortController();
    let release;
    let signalEntered;
    const entered = new Promise(resolve => { signalEntered = resolve; });

    const wait = new Promise(resolve => { release = resolve; });
    const listener = async () => { signalEntered(); await wait; };
    eventSource.on(event_types.GENERATE_AFTER_DATA, listener);
    attempts.mockClear();
    try {
        const pending = executeGenerationRequestInShell({ type: 'normal', options: { depth: 1, signal: controller.signal }, dryRun: false, command: {} });
        await Promise.race([entered, pending.then(() => { throw new Error('Request ended before the generation data event'); })]);
        controller.abort();
        release();
        await pending;
        expect(attempts).not.toHaveBeenCalled();
    } finally {
        eventSource.removeListener(event_types.GENERATE_AFTER_DATA, listener);
    }
});

test('a replaced processor cannot publish an old token while its stream is being consumed', async () => {
    const { context } = setup();
    context.state.chat.push({ mes: 'current' });
    context.state.ReasoningHandler = class { async process() {} };
    context.state.generation_started = new Date();
    context.state.scrollLock = true;
    context.state.oai_settings = { send_if_empty: '', stream_openai: true, chat_completion_source: 'openai', openai_model: 'model' };
    context.isReactMainChatOwner = () => true;
    context.sendStreamingRequest = async () => () => {};
    context.cleanUpMessage = ({ getMessage }) => getMessage;
    context.countOccurrences = () => 0;
    context.isOdd = () => false;
    let release, entered;
    const started = new Promise(resolve => { entered = resolve; });
    const wait = new Promise(resolve => { release = resolve; });
    const consume = jest.spyOn(GenerationStreamSession.prototype, 'generate').mockImplementation(async function () {
        entered();
        await wait;
        await this.onProgressStreaming(0, 'old token', false);
        return 'old token';
    });
    attempts.mockImplementationOnce(input => executeGenerationAttempts({ ...input, attempts: [{ fallbackProvider: false, status: '', label: 'primary' }] }));
    globalThis.toastr = { error: jest.fn() };
    try {
        const pending = executeGenerationRequestInShell({ type: 'normal', options: { depth: 1 }, dryRun: false, command: {} }).catch(error => error);
        await Promise.race([started, pending.then(error => { throw error; })]);
        const replacement = { owner: 'new stream' };
        context.state.streamingProcessor = replacement;
        release();
        await pending;
        expect(context.state.chat[0].mes).toBe('current');
        expect(context.state.streamingProcessor).toBe(replacement);
    } finally {
        consume.mockRestore();
        runtime.endPipelineRun();
    }
});

test('a delayed stream response cannot attach its generator to a replacement processor', async () => {
    const { context } = setup();
    context.state.ReasoningHandler = class {};
    context.state.generation_started = new Date();
    context.state.oai_settings = { send_if_empty: '', stream_openai: true, chat_completion_source: 'openai', openai_model: 'model' };
    let release, entered;
    const started = new Promise(resolve => { entered = resolve; });
    const response = new Promise(resolve => { release = resolve; });
    context.sendStreamingRequest = () => { entered(); return response; };
    const consume = jest.spyOn(GenerationStreamSession.prototype, 'generate').mockRejectedValue(new Error('end test'));
    attempts.mockImplementationOnce(({ runAttempt }) => runAttempt({ fallbackProvider: false }, 0));
    globalThis.toastr = { error: jest.fn() };
    try {
        const pending = executeGenerationRequestInShell({ type: 'normal', options: { depth: 1 }, dryRun: false, command: {} }).catch(error => error);
        await Promise.race([started, pending.then(error => { throw error; })]);
        const original = context.state.streamingProcessor;
        const initialGenerator = original.generator;
        const replacement = { generator: 'new generator', generate: jest.fn(async () => 'new') };
        context.state.streamingProcessor = replacement;
        const oldGenerator = () => {};
        release(oldGenerator);
        await pending;
        expect(replacement.generator).toBe('new generator');
        expect(replacement.generate).not.toHaveBeenCalled();
        expect(original.generator).toBe(initialGenerator);
        expect(consume).not.toHaveBeenCalled();
        expect(context.state.streamingProcessor).toBe(replacement);
        expect(getPipelineRunState()).not.toBeNull();
    } finally {
        consume.mockRestore();
        runtime.endPipelineRun();
    }
});

test('a cleared processor still permits failure cleanup of its pipeline', async () => {
    const { context } = setup();
    context.state.ReasoningHandler = class {};
    context.state.generation_started = new Date();
    context.state.oai_settings = { send_if_empty: '', stream_openai: true, chat_completion_source: 'openai', openai_model: 'model' };
    let release, entered;
    const started = new Promise(resolve => { entered = resolve; });
    const response = new Promise(resolve => { release = resolve; });
    context.sendStreamingRequest = () => { entered(); return response; };
    attempts.mockImplementationOnce(({ runAttempt }) => runAttempt({ fallbackProvider: false }, 0));
    globalThis.toastr = { error: jest.fn() };
    const pending = executeGenerationRequestInShell({ type: 'normal', options: { depth: 1 }, dryRun: false, command: {} }).catch(error => error);
    await Promise.race([started, pending.then(error => { throw error; })]);
    context.state.streamingProcessor = null;
    release(() => {});
    expect((await pending).message).toBe('Generation was aborted.');
    expect(getPipelineRunState()).toBeNull();
});

test.each(['Reply pipeline: invalid tool batch', 'Generation was aborted.'])('existing owner cleans up failed/aborted run: %s', async message => {
    const { context } = setup();
    context.unblockGeneration = jest.fn();
    globalThis.toastr = { error: jest.fn() };
    attempts.mockRejectedValueOnce(new Error(message));
    await expect(executeGenerationRequestInShell({ type: 'normal', options: { depth: 1 }, dryRun: false, command: {} })).rejects.toThrow(message);
    expect(getPipelineRunState()).toBeNull();
    expect(context.state.streamingProcessor).toBeNull();
    expect(context.unblockGeneration).toHaveBeenCalled();
    if (message.startsWith('Reply pipeline:')) expect(globalThis.toastr.error).toHaveBeenCalled();
});

test('a late failure from a stopped run does not clear a newer pipeline or stream', async () => {
    const { context } = setup();
    context.unblockGeneration = jest.fn();
    globalThis.toastr = { error: jest.fn() };
    const controller = new AbortController();
    let rejectAttempt;
    let entered;
    const started = new Promise(resolve => { entered = resolve; });
    attempts.mockImplementationOnce(() => new Promise((resolve, reject) => { rejectAttempt = reject; entered(); }));
    const pending = executeGenerationRequestInShell({ type: 'normal', options: { depth: 1, signal: controller.signal }, dryRun: false, command: {} });
    const rejection = pending.catch(error => error);
    await started;
    controller.abort();
    runtime.endPipelineRun();
    runtime.beginPipelineRun();
    const newRun = getPipelineRunState();
    const newProcessor = { owner: 'new run' };
    context.state.streamingProcessor = newProcessor;
    rejectAttempt(new Error('late failure'));
    expect((await rejection).message).toBe('late failure');
    expect(getPipelineRunState()).toBe(newRun);
    expect(context.state.streamingProcessor).toBe(newProcessor);
    expect(context.unblockGeneration).not.toHaveBeenCalled();
    runtime.endPipelineRun();
});

test('a stopped run still releases its own unchanged pipeline and UI', async () => {
    const { context } = setup();
    context.state.streamingProcessor = null;
    context.unblockGeneration = jest.fn();
    const controller = new AbortController();
    let rejectAttempt;
    let entered;
    const started = new Promise(resolve => { entered = resolve; });
    attempts.mockImplementationOnce(() => new Promise((resolve, reject) => { rejectAttempt = reject; entered(); }));
    const pending = executeGenerationRequestInShell({ type: 'normal', options: { depth: 1, signal: controller.signal }, dryRun: false, command: {} });
    const rejection = pending.catch(error => error);
    await started;
    controller.abort();
    rejectAttempt(new Error('stopped'));
    expect((await rejection).message).toBe('stopped');
    expect(getPipelineRunState()).toBeNull();
    expect(context.state.streamingProcessor).toBeNull();
    expect(context.unblockGeneration).toHaveBeenCalled();
});

test.each(['old-first', 'new-first'])('overlapping stopped and new requests restore the correct model: %s', async order => {
    const { context } = setup();
    context.state.generatingAttemptModel = null;
    context.unblockGeneration = jest.fn();
    globalThis.toastr = { error: jest.fn() };
    const controller = new AbortController();
    let rejectOld, rejectNew, enterOld, enterNew;
    const oldStarted = new Promise(resolve => { enterOld = resolve; });
    const newStarted = new Promise(resolve => { enterNew = resolve; });
    attempts.mockImplementationOnce(() => new Promise((resolve, reject) => {
        context.state.generatingAttemptModel = 'old-model'; rejectOld = reject; enterOld();
    })).mockImplementationOnce(() => new Promise((resolve, reject) => {
        context.state.generatingAttemptModel = 'new-model'; rejectNew = reject; enterNew();
    }));
    const old = executeGenerationRequestInShell({ type: 'normal', options: { depth: 1, signal: controller.signal }, dryRun: false, command: {} }).catch(error => error);
    await oldStarted;
    controller.abort();
    const newer = executeGenerationRequestInShell({ type: 'normal', options: { depth: 1 }, dryRun: false, command: {} }).catch(error => error);
    await newStarted;
    if (order === 'old-first') {
        rejectOld(new Error('old stopped'));
        await old;
        expect(context.state.generatingAttemptModel).toBe('new-model');
        rejectNew(new Error('new failed'));
        await newer;
    } else {
        rejectNew(new Error('new failed'));
        await newer;
        expect(context.state.generatingAttemptModel).toBeNull();
        rejectOld(new Error('old stopped'));
        await old;
    }
    expect(context.state.generatingAttemptModel).toBeNull();
});
