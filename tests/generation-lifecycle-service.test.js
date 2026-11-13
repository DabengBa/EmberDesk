import { beforeAll, expect, jest, test } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { loadTsModule } from './helpers/load-ts-module.mjs';

test.each(['pipeline', 'tools'])('typed dispatch selects %s continuation depth', async mode => {
    const { createGenerationLifecycleService, executeGenerationAttempts } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'chat' }));
    const continueGeneration = jest.fn(async (type, depth) => `${type}:${depth}`);
    const result = await lifecycle.runGenerationDispatch({ type: 'normal', depth: 2, canPerformTools: mode === 'tools', pipeline: {}, isOpenAI: true, command: { depth: 2, capabilities: { autoRecover: false } }, trace: {}, jsonSchema: null }, {
        ownsRun: () => true, currentProcessor: () => null, isRecoveryMessage: () => false, createRecoveryMessage: async () => 0,
        getModel: () => null, setModel: () => {}, continueGeneration,
        round: () => ({ showStop: () => {}, plan: () => ({ attempts: [{ label: 'primary', status: '', fallbackProvider: false }], shouldAutoRecover: false }),
            activeRunId: () => null, meta: () => null, step: () => null, isFallback: () => false, execute: executeGenerationAttempts,
            successfulMessageId: () => 0, clearSuccessStatus: () => {} }),
        transport: () => ({ presetModel: () => 'model', fallbackModel: () => null, pipelineModel: model => model,
            setAttemptModel: () => {}, canPerformTools: () => mode === 'tools', isOpenAIStreaming: () => false, isStreaming: () => false,
            send: async () => mode === 'pipeline' ? { pipelineContinuation: true } : { message: 'answer' }, hasToolCalls: () => mode === 'tools', assertAllowed: () => {}, isEmpty: () => false }),
        stream: () => ({}), response: () => responsePorts({ hasToolCalls: () => mode === 'tools', invokeTools: async () => ({ invocations: [{ id: 'tool' }], stealthCalls: [], errors: [] }) }),
        failure: () => ({ ownsRun: () => true, reportError: () => {}, endPipeline: () => {}, isUserStopped: () => false, unblock: () => {}, log: () => {}, clearProcessor: () => {} }),
    });
    expect(result).toBe('normal:3');
    expect(continueGeneration).toHaveBeenCalledWith('normal', 3);
});

test('typed dispatch tags an empty transport reply for the recovery classifier', async () => {
    const { createGenerationLifecycleService, executeGenerationAttempts } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'chat' }));
    let classified;
    const pending = lifecycle.runGenerationDispatch({ type: 'normal', depth: 0, canPerformTools: false, pipeline: null, isOpenAI: true, command: { depth: 0, capabilities: { autoRecover: false } }, trace: {}, jsonSchema: null }, {
        ownsRun: () => true, currentProcessor: () => null, isRecoveryMessage: () => false, createRecoveryMessage: async () => 0,
        getModel: () => null, setModel: () => {}, continueGeneration: jest.fn(),
        round: () => ({ showStop: () => {}, plan: () => ({ attempts: [{ label: 'primary', status: '', fallbackProvider: false }], shouldAutoRecover: false }),
            activeRunId: () => null, meta: () => null, step: () => null, isFallback: () => false, execute: executeGenerationAttempts,
            successfulMessageId: () => 0, clearSuccessStatus: () => {}, processorMessageId: () => null,
            decideFailure: ({ failure }) => { classified = failure; return { action: 'throw' }; }, isRecoveryMessage: () => false, clearProcessor: () => {}, clearStatus: () => {}, showFailure: () => {} }),
        transport: () => ({ presetModel: () => 'model', fallbackModel: () => null, pipelineModel: model => model,
            setAttemptModel: () => {}, canPerformTools: () => false, isOpenAIStreaming: () => false, isStreaming: () => false,
            send: async () => ({}), hasToolCalls: () => false, assertAllowed: () => {}, isEmpty: () => true }),
        stream: () => ({}), response: () => responsePorts(),
        failure: () => ({ ownsRun: () => true, reportError: () => {}, endPipeline: () => {}, isUserStopped: () => false, unblock: () => {}, log: () => {}, clearProcessor: () => {} }),
    });
    await expect(pending).rejects.toThrow('empty reply');
    expect(classified).toMatchObject({ message: 'empty reply', emptyReply: true, messageId: null });
});

test('dispatch owns the same retry, stream and response state through a fallback round', async () => {
    const { createGenerationLifecycleService, executeGenerationAttempts } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'chat' }));
    const events = [];
    let current = null;
    const processor = { isStopped: false, isFinished: true, toolCalls: [], result: 'answer', messageId: 7, reasoningHandler: { reasoning: '' }, reasoningSignature: null };
    const attempts = [{ label: 'primary', status: '', fallbackProvider: false }, { label: 'fallback', status: 'retry', fallbackProvider: true }];
    const result = await lifecycle.runGenerationDispatch({ type: 'normal', depth: 0, canPerformTools: false, pipeline: null, isOpenAI: true, command: { depth: 0, capabilities: { autoRecover: true } }, trace: {}, jsonSchema: null }, {
        ownsRun: () => true, currentProcessor: () => current, isRecoveryMessage: id => id === 3,
        createRecoveryMessage: async () => { events.push('row'); return 3; },
        getModel: () => 'original', setModel: model => events.push(`model:${model}`),
        round: () => ({
            showStop: () => events.push('stop'), plan: () => ({ attempts, shouldAutoRecover: true }),
            activeRunId: () => null, meta: () => null, step: () => null, isFallback: () => false,
            execute: executeGenerationAttempts, successfulMessageId: () => 7, clearSuccessStatus: id => events.push(`success:${id}`),
            processorMessageId: () => null, decideFailure: () => ({ action: 'retry' }), clearProcessor: () => { current = null; },
            clearMessage: id => events.push(`clear:${id}`), showStatus: (_id, _status, kind) => events.push(kind),
            deactivate: () => {}, isRecoveryMessage: id => id === 3, clearStatus: () => {}, showFailure: () => {},
        }),
        transport: () => ({
            presetModel: () => 'primary', fallbackModel: () => 'backup', pipelineModel: (model, { fallbackModel }) => fallbackModel || model,
            setAttemptModel: model => events.push(`attempt:${model}`), canPerformTools: () => false,
            isOpenAIStreaming: () => true, isStreaming: () => true,
            createStream: () => { current = processor; return processor; },
            sendStream: async options => { if (!options.fallbackProvider) throw new Error('retry'); return 'generator'; },
            setStreamGenerator: () => {}, consumeStream: async () => 'answer', streamAborted: () => false,
            send: async () => null, hasToolCalls: () => false, assertAllowed: () => {}, isEmpty: () => false, emptyFailure: () => new Error('empty'),
        }),
        stream: () => ({ ownsRun: () => true, clean: text => text, assertAllowed: () => {}, setModel: () => {},
            finishMessage: async () => events.push('finish'), markComplete: () => {}, refresh: () => {},
            clearProcessor: () => { current = null; }, clearRecovery: () => {}, endPipeline: () => events.push('end') }),
        response: () => ({ ownsRun: () => true }),
        failure: () => ({ ownsRun: () => true, reportError: () => {}, endPipeline: () => {}, hasRegenerateSnapshot: false,
            isUserStopped: () => false, unblock: () => {}, log: () => {}, clearProcessor: () => {} }),
    });
    expect(String(result)).toBe('answer');
    expect(events).toEqual(['stop', 'attempt:primary', 'row', 'clear:3', 'clear:3', 'fallback', 'stop', 'attempt:backup', 'finish', 'end', 'success:3', 'model:original']);
});

test('synchronous stop policy recognizes abort signals and legacy stop errors', async () => {
    const { isUserStoppedGenerationError } = await loadTsModule('app/lib/generation/shared-state.ts');
    expect(isUserStoppedGenerationError(new Error('provider unavailable'), true)).toBe(true);
    expect(isUserStoppedGenerationError(new Error('Generation was aborted.'), false)).toBe(true);
    expect(isUserStoppedGenerationError({ message: 'Clicked Stop Button' }, false)).toBe(true);
    expect(isUserStoppedGenerationError(new Error('provider unavailable'), false)).toBe(false);
    expect(isUserStoppedGenerationError(null, false)).toBe(false);
});

test('foundation owns character depth defaults, history processing and cancellation ordering', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'a', contextRevision: 1 }));
    let owned = true;
    const events = [];
    const ports = {
        ownsRun: () => owned,
        card: () => ({ charDepthPrompt: 'character prompt' }),
        clearDepth: () => events.push('clear'),
        depthSettings: () => ({ depth: 0, role: 'system', defaultDepth: 4, defaultRole: 'assistant' }),
        resolveRole: role => `resolved:${role}`,
        setDepth: (text, depth, role) => events.push([text, depth, role]),
        historyInput: () => ({ chat: [{ mes: 'hello' }], preview: true, canUseTools: false, userPlacement: 'user', assistantPlacement: 'ai', reasoningPlacement: 'reason' }),
        historyPorts: {
            substitute: text => text,
            project: items => ({ items, summarized: [] }),
            regex: text => text,
            appendFile: async (_item, text) => text,
            addReasoning: text => text,
            reasoningLimitReached: () => false,
        },
        maxTokens: () => 1000,
    };
    const result = await lifecycle.prepareGenerationFoundation(ports);
    expect(events).toEqual(['clear', ['character prompt', 0, 'resolved:system']]);
    expect(result).toMatchObject({ card: { charDepthPrompt: 'character prompt' }, history: { items: [{ mes: 'hello', index: 0 }] }, maxTokens: 1000 });
    ports.clearDepth = () => { owned = false; };
    events.length = 0;
    expect(await lifecycle.prepareGenerationFoundation(ports)).toBeNull();
    expect(events).toEqual([]);
});

test('base preparation does not install depth prompts if reading the card loses ownership', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'chat' }));
    let owned = true;
    const depth = jest.fn();
    const history = jest.fn();
    const result = await lifecycle.prepareGenerationBase({
        ownsRun: () => owned,
        card: () => { owned = false; return { charDepthPrompt: 'stale' }; },
        depth,
        history,
        maxTokens: () => 100,
    });
    expect(result).toBeNull();
    expect(depth).not.toHaveBeenCalled();
    expect(history).not.toHaveBeenCalled();
});

test('history preparation abandons reasoning when a file read finishes after cancellation', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'chat' }));
    let owned = true;
    let enter, release;
    const entered = new Promise(resolve => { enter = resolve; });
    const waiting = new Promise(resolve => { release = resolve; });
    const addReasoning = jest.fn(message => message);
    const request = lifecycle.assemblePromptHistory({ chat: [{ mes: 'hello' }], preview: true, canUseTools: false, userPlacement: 'user', assistantPlacement: 'assistant', reasoningPlacement: 'reasoning' }, {
        ownsRun: () => owned,
        substitute: text => text,
        project: items => ({ items, summarized: [] }),
        regex: text => text,
        appendFile: async (_item, text) => { enter(); await waiting; return text; },
        addReasoning,
        reasoningLimitReached: () => false,
    });
    await entered;
    owned = false;
    release();
    await expect(request).resolves.toBeNull();
    expect(addReasoning).not.toHaveBeenCalled();
});

test('stream completion does not attribute a message after cleaning loses ownership', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'chat' }));
    let owned = true;
    const setModel = jest.fn();
    const finishMessage = jest.fn();
    const processor = { isStopped: false, isFinished: true, toolCalls: [], result: 'reply', messageId: 2, reasoningHandler: { reasoning: '' }, reasoningSignature: null };
    await expect(lifecycle.finishStreamAttempt({ type: 'normal', isOpenAI: true, canPerformTools: true, attemptModel: 'model', text: 'reply', processor }, {
        ownsRun: () => owned,
        clean: text => { owned = false; return text; },
        setModel,
        finishMessage,
    })).rejects.toThrow('Generation was aborted.');
    expect(setModel).not.toHaveBeenCalled();
    expect(finishMessage).not.toHaveBeenCalled();
});

test('dispatch state keeps tool depth and stream ownership local to each request', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'chat' }));
    let processor = null;
    let owned = true;
    const make = () => lifecycle.createDispatchState({ type: 'normal', depth: 1, canPerformTools: true, pipeline: {} }, {
        ownsRun: () => owned, currentProcessor: () => processor,
    });
    const first = make();
    const second = make();
    first.nextDepth();
    first.canPerformTools = false;
    expect([first.depth, second.depth, first.canPerformTools, second.canPerformTools]).toEqual([2, 1, false, true]);
    const original = {};
    processor = original;
    first.processor = original;
    expect(first.ownsStream(original)).toBe(true);
    processor = {};
    expect(first.ownsStream(original)).toBe(false);
    expect(first.cancelled()).toBe(true);
    expect(first.ownsCleanup()).toBe(false);
    processor = null;
    expect(first.ownsCleanup()).toBe(true);
    owned = false;
    expect(first.ownsCleanup()).toBe(false);
});

test('installed request owner sequences preparation, assembly and dispatch with the same state', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'chat', contextRevision: 0 }));
    const state = { promptContext: {} };
    const calls = [];
    const result = await lifecycle.runOwnedRequest({
        ownsRun: () => true,
        prepare: async () => { calls.push('prepare'); return { kind: 'ready', state }; },
        assemble: async current => { expect(current).toBe(state); calls.push('assemble'); return { stages: { kind: 'dispatch' } }; },
        dispatch: async current => { expect(current).toBe(state); calls.push('dispatch'); return 'reply'; },
    });
    expect(result).toBe('reply');
    expect(calls).toEqual(['prepare', 'assemble', 'dispatch']);
});

test('installed request owner suppresses a late assembly result after ownership is lost', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'chat', contextRevision: 0 }));
    let owned = true;
    const dispatch = jest.fn();
    const result = await lifecycle.runOwnedRequest({
        ownsRun: () => owned,
        prepare: async () => ({ kind: 'ready', state: {} }),
        assemble: async () => { owned = false; return { stages: { kind: 'terminal', value: 'stale' } }; },
        dispatch,
    });
    expect(result).toBeUndefined();
    expect(dispatch).not.toHaveBeenCalled();
});

test('isolated prompt snapshot does not invoke a top-level accessor', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'chat' }));
    const getter = jest.fn(() => ({ value: 'computed' }));
    const global = {};
    Object.defineProperty(global, 'dynamic', { get: getter, enumerable: true, configurable: true });
    const context = lifecycle.createPromptContext({ globalPrompts: () => global, isolated: true, set() {} });
    const snapshot = context.requestPrompts();
    expect(getter).not.toHaveBeenCalled();
    expect(Object.getOwnPropertyDescriptor(snapshot, 'dynamic').get).toBe(getter);
});

test('prompt snapshots let scoped entries override accessors and retain opaque references', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'chat' }));
    const getter = jest.fn(() => 'global');
    const opaque = new Date(123);
    const global = { opaque };
    Object.defineProperty(global, 'shared', { get: getter, enumerable: true });
    const context = lifecycle.createPromptContext({
        globalPrompts: () => global, isolated: true,
        set: (key, value, _position, _depth, _scan, _role, _filter, target) => { target[key] = value; },
    });
    context.setWorldInfoScanPrompt('shared', 'local', 1, 0);
    const snapshot = context.scanPrompts();
    expect(getter).not.toHaveBeenCalled();
    expect(snapshot.shared).toBe('local');
    expect(snapshot.opaque).toBe(opaque);
});

test('isolated prompt data preserves aliases, cycles, functions and accessors without invoking getters', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'chat' }));
    const getter = jest.fn(() => 'computed');
    const shared = { list: [{ value: 'original' }] };
    shared.self = shared;
    const prompt = { value: 'text', first: shared, second: shared, filter: () => true };
    Object.defineProperty(prompt, 'computed', { get: getter, enumerable: true });
    const global = { entry: prompt };
    const context = lifecycle.createPromptContext({ globalPrompts: () => global, isolated: true, set() {} });
    const copy = context.requestPrompts().entry;
    expect(getter).not.toHaveBeenCalled();
    expect(copy.first).not.toBe(shared);
    expect(copy.first).toBe(copy.second);
    expect(copy.first.self).toBe(copy.first);
    expect(copy.filter).toBe(prompt.filter);
    expect(Object.getOwnPropertyDescriptor(copy, 'computed').get).toBe(getter);
    shared.list[0].value = 'global change';
    expect(copy.first.list[0].value).toBe('original');
    copy.first.list.push('preview change');
    expect(shared.list).toEqual([{ value: 'global change' }]);
});

test('the unscoped prompt setter sees identical writes from an async listener and an unrelated writer', async () => {
    const { EventEmitter } = await import('../public/lib/eventemitter.js');
    const source = readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');
    const start = source.indexOf('export function setExtensionPrompt(');
    const end = source.indexOf('\n/**', start);
    expect(start).toBeGreaterThanOrEqual(0);
    const buildSetter = new Function('extension_prompts', 'extension_prompt_roles', `${source.slice(start, end).replace('export function', 'function')}\nreturn setExtensionPrompt;`);
    const previousStorage = globalThis.localStorage;
    globalThis.localStorage = { getItem: () => null };
    try {
        const run = async listenerWrites => {
            const prompts = {};
            const setPrompt = buildSetter(prompts, { SYSTEM: 0 });
            const writes = [];
            const write = (...args) => { writes.push(args); setPrompt(...args); };
            const emitter = new EventEmitter();
            let entered, release;
            const started = new Promise(resolve => { entered = resolve; });
            const waiting = new Promise(resolve => { release = resolve; });
            emitter.on('generation_started', async () => {
                entered();
                await waiting;
                if (listenerWrites) write('same-key', 'same-value', 1, 0, true);
            });
            const event = emitter.emit('generation_started');
            await started;
            if (!listenerWrites) write('same-key', 'same-value', 1, 0, true);
            release();
            await event;
            return { writes, prompts };
        };
        const listener = await run(true);
        const unrelated = await run(false);
        expect(listener).toEqual(unrelated);
        expect(listener.prompts['same-key'].value).toBe('same-value');
    } finally {
        if (previousStorage === undefined) delete globalThis.localStorage;
        else globalThis.localStorage = previousStorage;
    }
});

test('an awaited generation event listener can run a nested background request', async () => {
    const { EventEmitter } = await import('../public/lib/eventemitter.js');
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'chat', contextRevision: 1 }));
    const emitter = new EventEmitter();
    const previousStorage = globalThis.localStorage;
    globalThis.localStorage = { getItem: () => null };
    const order = [];
    try {
        emitter.on('generation_started', async () => {
            order.push('listener-start');
            const result = await lifecycle.run({ foreground: false, execute: async () => {
                order.push('background');
                return 'background result';
            } });
            order.push(result);
        });
        const result = await lifecycle.run({ foreground: true, execute: async () => {
            order.push('foreground-start');
            await emitter.emit('generation_started');
            order.push('foreground-end');
            return 'done';
        } });
        expect(result).toBe('done');
        expect(order).toEqual(['foreground-start', 'listener-start', 'background', 'background result', 'foreground-end']);
    } finally {
        if (previousStorage === undefined) delete globalThis.localStorage;
        else globalThis.localStorage = previousStorage;
    }
});

test('foreground and background generation can remain active simultaneously', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'chat', contextRevision: 1 }));
    let release;
    const waiting = new Promise(resolve => { release = resolve; });
    const events = [];
    const foreground = lifecycle.run({ foreground: true, execute: async () => {
        events.push('foreground-start');
        await waiting;
        events.push('foreground-end');
    } });
    const background = lifecycle.run({ foreground: false, execute: async () => {
        events.push('background-start');
        return 'background result';
    } });
    try {
        expect(await background).toBe('background result');
        expect(events).toEqual(['foreground-start', 'background-start']);
    } finally {
        release();
        await foreground;
    }
});

test('typed stale-submission policy unblocks only a stale live composer', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'chat' }));
    const unblock = jest.fn();
    const submitted = { contextKey: 'chat', contextRevision: 1 };
    const chat = [];
    const input = { composerSubmission: submitted, dryRun: false, submittedChat: chat, currentChat: chat,
        current: submitted, ownsRun: true, submissionAborted: false, externalAborted: false };
    expect(lifecycle.cancelStaleSubmission(input, unblock)).toBe(false);
    expect(lifecycle.cancelStaleSubmission({ ...input, currentChat: [] }, unblock)).toBe(true);
    expect(unblock).toHaveBeenCalledTimes(1);
    expect(lifecycle.cancelStaleSubmission({ ...input, dryRun: true, ownsRun: false }, unblock)).toBe(true);
    expect(lifecycle.cancelStaleSubmission({ ...input, composerSubmission: null, ownsRun: false }, unblock)).toBe(true);
    expect(unblock).toHaveBeenCalledTimes(1);
});

test.each([
    ['normal', false, 0, false, false, true],
    ['quiet', false, 0, false, false, false],
    ['normal', true, 0, false, false, false],
    ['normal', false, 1, false, false, false],
    ['normal', false, 0, true, false, false],
    ['normal', false, 0, false, true, false],
])('typed request entry selects command execution for %s dry=%s depth=%s regenerate=%s preview=%s', async (type, dryRun, depth, regenerate, preview, expected) => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'chat' }));
    const entry = lifecycle.createRequestEntry({ type, dryRun, depth, regenerate, preview: preview ? {} : null }, {
        getController: () => null, setController: () => {}, getComposer: () => ({ value: 'draft' }), setSignal: () => {},
    });
    expect(entry.executeCommands).toBe(expected);
});

test('typed prompt policy owns preview support, tool eligibility, and assembly model selection', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'chat' }));
    const canUse = jest.fn(() => true);
    const model = jest.fn(value => `live:${value}`);
    const previewModel = jest.fn(value => `preview:${value}`);
    const ports = { canUseTools: canUse, recurseLimit: () => 3, liveModel: model, previewModel };
    expect(lifecycle.preparePromptPolicy({ preview: true, isOpenAI: false, dryRun: true, type: 'normal', depth: 0, warnings: ['w'] }, ports))
        .toEqual({ terminal: { kind: 'prompt-preview-empty', reason: 'unsupported-api', warnings: ['w'] } });
    expect(canUse).not.toHaveBeenCalled();
    const normal = lifecycle.preparePromptPolicy({ preview: false, isOpenAI: true, dryRun: false, type: 'normal', depth: 2, warnings: [] }, ports);
    expect(normal.canPerformTools).toBe(true);
    expect(normal.assemblyModel('preset')).toBe('live:preset');
    const quiet = lifecycle.preparePromptPolicy({ preview: false, isOpenAI: true, dryRun: false, type: 'quiet', depth: 3, warnings: [] }, ports);
    expect(quiet.canPerformTools).toBe(false);
    expect(quiet.assemblyModel('preset')).toBe('preset');
    const preview = lifecycle.preparePromptPolicy({ preview: true, isOpenAI: true, dryRun: true, type: 'normal', depth: 0, warnings: [] }, ports);
    expect(preview.canPerformTools).toBe(false);
    expect(preview.assemblyModel('preset')).toBe('preview:preset');
});

jest.unstable_mockModule('../public/scripts/events.js', () => ({ eventSource: { emit: jest.fn(async () => {}) }, event_types: {} }));
jest.unstable_mockModule('../public/scripts/world-info-service.js', () => ({ getWorldInfoPrompt: jest.fn() }));
jest.unstable_mockModule('../public/scripts/chat-memory-service.js', () => ({ applyChatMemoryToCoreChat: jest.fn() }));
jest.unstable_mockModule('../public/scripts/i18n.js', () => ({ t: strings => strings[0] }));
jest.unstable_mockModule('../public/scripts/openai.js', () => ({ oai_settings: {} }));
jest.unstable_mockModule('../public/scripts/feature-settings.js', () => ({ feature_settings: { tool_bindings: [] } }));
jest.unstable_mockModule('../public/scripts/tool-bindings.js', () => ({ syncPipelineToolBindings: jest.fn() }));

const { registerGenerationShellContext, installGenerationLifecycleService } = await import('../public/scripts/generation-shell-context.js');
const { GenerationStreamSession, executeGenerationRequestInShell, getCurrentGenerationContextIdentity } = await import('../public/scripts/generation-service.js');
let installedLifecycle;
beforeAll(async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    installedLifecycle = createGenerationLifecycleService(getCurrentGenerationContextIdentity);
    installGenerationLifecycleService(installedLifecycle);
});

test('typed shared state exposes live bindings and restores nested model scopes', async () => {
    const state = await loadTsModule('app/lib/generation/shared-state.ts');
    const controller = new AbortController();
    const processor = { isStopped: false };
    state.setAbortController(controller);
    state.setStreamingProcessor(processor);
    state.setSending(true);
    expect(state.abortController).toBe(controller);
    expect(state.streamingProcessor).toBe(processor);
    expect(state.is_send_press).toBe(true);
    expect(state.withGeneratingModel('outer', () => {
        expect(state.generatingAttemptModel).toBe('outer');
        expect(() => state.withGeneratingModel('inner', () => {
            expect(state.generatingAttemptModel).toBe('inner');
            throw new Error('nested');
        })).toThrow('nested');
        return state.generatingAttemptModel;
    })).toBe('outer');
    expect(state.generatingAttemptModel).toBeNull();
});

test('served generation artifacts match the typed sources', () => {
    expect(() => execFileSync(process.execPath, ['scripts/build-generation-state.mjs', '--check'], {
        cwd: new URL('..', import.meta.url), stdio: 'pipe',
    })).not.toThrow();
});

test('shell entry requires the installed typed lifecycle and does not create a fallback', async () => {
    const shell = await import('../public/scripts/generation-shell-context.js?uninitialized-test');
    expect(() => shell.getGenerationLifecycleService(() => ({ chatId: 'a' })))
        .toThrow('Generation lifecycle service is not installed.');
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'a' }));
    shell.installGenerationLifecycleService(lifecycle);
    expect(shell.getGenerationLifecycleService()).toBe(lifecycle);
});

test('runtime bootstrap loads one typed lifecycle and attempt executor before concurrent generation', async () => {
    const { createGenerationRuntimeBootstrap } = await import('../public/scripts/generation-shell-context.js');
    const runtime = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const installLifecycle = jest.fn();
    const installAttempt = jest.fn();
    const load = jest.fn(async () => runtime);
    const bootstrap = createGenerationRuntimeBootstrap({ load, readIdentity: () => ({ chatId: 'a', contextRevision: 1 }), installLifecycle, installAttempt });

    await Promise.all([bootstrap(), bootstrap()]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(installLifecycle).toHaveBeenCalledTimes(1);
    expect(installAttempt).toHaveBeenCalledWith(runtime.executeGenerationAttempts);
    const service = installLifecycle.mock.calls[0][0];
    await expect(service.run({ foreground: true, execute: async lease => lease.owns() })).resolves.toBe(true);
});

test('foreground bootstrap admission rejects duplicates and a stop invalidates its pending entry', async () => {
    const { createGenerationBootstrapAdmission } = await import('../public/scripts/generation-shell-context.js');
    const admission = createGenerationBootstrapAdmission();
    const first = admission.enter();
    expect(admission.enter()).toBeNull();
    expect(first.signal.aborted).toBe(false);
    expect(admission.stop()).toBe(true);
    expect(first.signal.aborted).toBe(true);
    first.release();
    const second = admission.enter();
    expect(second).not.toBeNull();
    first.release();
    expect(admission.enter()).toBeNull();
    second.release();
});

test('typed request entry owns preview, regenerate, submission and cancellation setup', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'a', contextRevision: 1 }));
    const existing = new AbortController();
    const snapshot = { value: 'draft', contextKey: 'a', contextRevision: 1 };
    const ports = { getController: jest.fn(() => existing), setController: jest.fn(), getComposer: jest.fn(() => snapshot), setSignal: jest.fn() };
    const preview = lifecycle.createRequestEntry({ type: 'normal', dryRun: false, depth: 0, preview: {}, regenerate: true, signal: undefined, composerSubmission: undefined }, ports);
    expect(preview).toEqual(expect.objectContaining({ isPreview: true, dryRun: true, isRegenerate: false, composerSubmission: snapshot, submissionSignal: existing.signal }));
    expect(ports.setController).not.toHaveBeenCalled();
    const regenerate = lifecycle.createRequestEntry({ type: 'normal', dryRun: false, depth: 0, preview: null, regenerate: true, signal: undefined, composerSubmission: snapshot }, ports);
    expect(regenerate.isRegenerate).toBe(true);
    expect(regenerate.composerSubmission).toBeNull();
    expect(ports.setController).toHaveBeenCalledTimes(1);
    expect(ports.setSignal).toHaveBeenLastCalledWith(regenerate.submissionSignal);
    expect(regenerate.submissionSignal).not.toBe(existing.signal);
    const nested = lifecycle.createRequestEntry({ type: 'quiet', dryRun: false, depth: 1, preview: null, regenerate: true, signal: existing.signal, composerSubmission: snapshot }, ports);
    expect(nested.isRegenerate).toBe(false);
    expect(nested.composerSubmission).toBeNull();
    expect(nested.submissionSignal).toBe(existing.signal);
});

test('typed composer admission preserves draft edits and prevents concurrent regenerate', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'a', contextRevision: 1 }));
    const submitted = { value: 'original' };
    const ports = { isSending: jest.fn(() => false), setSending: jest.fn(), currentValue: jest.fn(() => 'new draft'), clear: jest.fn(), onBusy: jest.fn() };
    const input = { type: 'normal', depth: 0, dryRun: false, preview: false, regenerate: false, submission: submitted };
    expect(lifecycle.prepareComposer(input, ports)).toEqual({ text: 'original' });
    expect(ports.clear).not.toHaveBeenCalled();
    ports.currentValue.mockReturnValue('original');
    lifecycle.prepareComposer(input, ports);
    expect(ports.clear).toHaveBeenCalledWith(submitted);
    ports.setSending.mockClear(); ports.clear.mockClear();
    expect(lifecycle.prepareComposer({ ...input, dryRun: true, preview: true }, ports)).toEqual({ text: 'original' });
    expect(ports.setSending).not.toHaveBeenCalled();
    expect(ports.clear).not.toHaveBeenCalled();
    ports.isSending.mockReturnValue(true);
    expect(lifecycle.prepareComposer({ ...input, regenerate: true }, ports)).toBeNull();
    expect(ports.onBusy).toHaveBeenCalledTimes(1);
    ports.isSending.mockReturnValue(false);
    expect(lifecycle.prepareComposer({ ...input, regenerate: true }, ports)).toEqual({ text: '' });
    expect(ports.setSending).toHaveBeenCalledWith(true);
});

test('typed transport attempt applies the tool recursion limit after model capability', async () => {
    const ports = {
        ownsRun: () => true, presetModel: () => 'model', pipelineModel: model => model,
        setAttemptModel: jest.fn(), canPerformTools: jest.fn(() => true), recurseLimit: () => 2, setCanPerformTools: jest.fn(),
        isOpenAIStreaming: () => false, send: async () => 'reply', hasToolCalls: () => false, isEmpty: () => false,
    };
    const input = { type: 'normal', isOpenAI: true, attempt: { fallbackProvider: false }, index: 0, attemptCount: 1, jsonSchema: null, trace: {}, depth: 2 };
    await installedLifecycle.runTransportAttempt(input, ports);
    expect(ports.setCanPerformTools).toHaveBeenLastCalledWith(false);
    await installedLifecycle.runTransportAttempt({ ...input, depth: 1 }, ports);
    expect(ports.setCanPerformTools).toHaveBeenLastCalledWith(true);
});

test.each([
    [true, false, 7, { suppressErrorRecovery: true, fromFallbackAttempt: false, messageId: 7 }],
    [false, true, null, { suppressErrorRecovery: false, fromFallbackAttempt: true, messageId: -1 }],
    [false, false, -1, { suppressErrorRecovery: false, fromFallbackAttempt: false, messageId: -1 }],
])('typed stream initialization applies retry and recovery policy', (intermediate, fallback, recoveryMessageId, expected) => {
    const processor = { suppressErrorRecovery: false, fromFallbackAttempt: false, messageId: -1 };
    const create = jest.fn(() => processor);
    expect(installedLifecycle.initializeAttemptStream({ intermediate, fallback, recoveryMessageId }, create)).toBe(processor);
    expect(create).toHaveBeenCalledTimes(1);
    expect(processor).toEqual(expected);
});

test('typed transport attempt selects fallback pipeline model and preserves streaming request metadata', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'a', contextRevision: 1 }));
    const ports = {
        ownsRun: () => true, presetModel: () => 'primary', fallbackModel: () => 'backup',
        pipelineModel: (model, options) => `${model}:${options.fallbackModel}`,
        setAttemptModel: jest.fn(), canPerformTools: jest.fn(() => true), setCanPerformTools: jest.fn(),
        isOpenAIStreaming: jest.fn(() => true), isStreaming: jest.fn(),
        createStream: jest.fn(), sendStream: jest.fn(async () => 'generator'), setStreamGenerator: jest.fn(),
        consumeStream: jest.fn(async () => 'text'), streamAborted: () => false,
        finishStream: jest.fn(async (context) => context), send: jest.fn(), hasToolCalls: jest.fn(),
        assertAllowed: jest.fn(), isEmpty: jest.fn(), emptyFailure: jest.fn(),
    };
    const trace = { pipelineRun: 'run' };
    const result = await lifecycle.runTransportAttempt({ type: 'normal', isOpenAI: true, attempt: { fallbackProvider: true }, index: 1, attemptCount: 3, jsonSchema: null, trace }, ports);
    expect(ports.setAttemptModel).toHaveBeenCalledWith('primary:backup');
    expect(ports.isOpenAIStreaming).toHaveBeenCalledWith('primary:backup', 'normal');
    expect(ports.setCanPerformTools).toHaveBeenCalledWith(true);
    expect(ports.createStream).toHaveBeenCalledWith({ attemptModel: 'primary:backup', intermediate: true, fallback: true, requestOptions: { jsonSchema: null, fallbackProvider: true, model: 'primary:backup', trace } });
    expect(ports.setStreamGenerator).toHaveBeenCalledWith('generator', undefined);
    expect(ports.finishStream).toHaveBeenCalledWith(expect.objectContaining({ attemptModel: 'primary:backup' }), 'text', undefined);
    expect(result.attemptModel).toBe('primary:backup');
    expect(ports.send).not.toHaveBeenCalled();
});

test('non-OpenAI transport streams normal messages but not quiet requests', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'a', contextRevision: 1 }));
    const ports = {
        ownsRun: () => true, presetModel: () => 'model', pipelineModel: model => model,
        setAttemptModel: jest.fn(), isStreaming: jest.fn(() => true), createStream: jest.fn(),
        sendStream: jest.fn(async () => 'generator'), setStreamGenerator: jest.fn(),
        consumeStream: jest.fn(async () => 'stream'), streamAborted: () => false,
        finishStream: jest.fn(async () => 'stream-result'), send: jest.fn(async () => 'quiet-result'),
        hasToolCalls: () => false, isEmpty: () => false,
    };
    const input = { type: 'normal', isOpenAI: false, canPerformTools: false, attempt: { fallbackProvider: false }, index: 0, attemptCount: 1, jsonSchema: null, trace: {} };
    await expect(lifecycle.runTransportAttempt(input, ports)).resolves.toBe('stream-result');
    await expect(lifecycle.runTransportAttempt({ ...input, type: 'quiet' }, ports)).resolves.toBe('quiet-result');
    expect(ports.sendStream).toHaveBeenCalledTimes(1);
    expect(ports.send).toHaveBeenCalledTimes(1);
});

test('typed transport attempt protects nonstream late results and keeps quiet empty-reply and tool rules', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'a', contextRevision: 1 }));
    let owned = true;
    const ports = {
        ownsRun: () => owned, presetModel: () => 'primary', fallbackModel: () => 'backup', pipelineModel: jest.fn(),
        setAttemptModel: jest.fn(), canPerformTools: jest.fn(), setCanPerformTools: jest.fn(),
        isOpenAIStreaming: jest.fn(), isStreaming: () => true, createStream: jest.fn(),
        send: jest.fn(async () => { owned = false; return { text: 'late' }; }), hasToolCalls: jest.fn(() => false),
        assertAllowed: jest.fn(), isEmpty: jest.fn(() => false), emptyFailure: () => new Error('empty reply'),
    };
    const input = { type: 'quiet', isOpenAI: false, canPerformTools: false, attempt: { fallbackProvider: false }, index: 0, attemptCount: 1, jsonSchema: null, trace: {} };
    await expect(lifecycle.runTransportAttempt(input, ports)).rejects.toThrow('Generation was aborted.');
    expect(ports.hasToolCalls).not.toHaveBeenCalled();
    expect(ports.createStream).not.toHaveBeenCalled();
    owned = true;
    ports.send.mockResolvedValueOnce({ text: '' });
    ports.isEmpty.mockReturnValueOnce(true);
    await expect(lifecycle.runTransportAttempt(input, ports)).rejects.toThrow('empty reply');
    expect(ports.setAttemptModel).toHaveBeenLastCalledWith('primary');
});

test('typed transport attempt never assigns a late stream generator after ownership is lost', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'a', contextRevision: 1 }));
    let owned = true;
    const ports = {
        ownsRun: () => owned, presetModel: () => 'primary', fallbackModel: () => null, pipelineModel: model => model,
        setAttemptModel: jest.fn(), canPerformTools: () => false, setCanPerformTools: jest.fn(),
        isOpenAIStreaming: () => true, createStream: jest.fn(),
        sendStream: jest.fn(async () => { owned = false; return 'late generator'; }),
        setStreamGenerator: jest.fn(), consumeStream: jest.fn(), finishStream: jest.fn(),
    };
    await expect(lifecycle.runTransportAttempt({ type: 'normal', isOpenAI: true, attempt: { fallbackProvider: false }, index: 0, attemptCount: 1, jsonSchema: null, trace: {} }, ports)).rejects.toThrow('Generation was aborted.');
    expect(ports.setStreamGenerator).not.toHaveBeenCalled();
    expect(ports.consumeStream).not.toHaveBeenCalled();
});
test('typed retry controller reuses recovery row and stops when ownership is lost during preparation', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'a', contextRevision: 1 }));
    let owned = true;
    const recovery = { messageId: 7, ensure: jest.fn(async () => {}) };
    const ports = { recovery, ownsRun: () => owned, clearMessage: jest.fn(), showStatus: jest.fn(), deactivate: jest.fn(), showStop: jest.fn(), clearProcessor: jest.fn(), processorMessageId: () => null, decideFailure: jest.fn(), isRecoveryMessage: () => true, clearStatus: jest.fn(), showFailure: jest.fn() };
    const controller = lifecycle.createAttemptRecoveryController({ shouldAutoRecover: true, attemptCount: 3 }, ports);
    await controller.prepareRetryAttempt({ status: 'retrying', label: 'fallback' }, 1);
    expect(ports.clearMessage).toHaveBeenCalledWith(7);
    expect(ports.showStatus).toHaveBeenCalledWith(7, 'retrying', 'fallback');
    recovery.ensure.mockImplementationOnce(async () => { owned = false; });
    await expect(controller.prepareRetryAttempt({ status: 'retrying', label: 'primary' }, 2)).rejects.toThrow('Generation was aborted.');
    expect(ports.clearMessage).toHaveBeenCalledTimes(1);
});

test('typed retry controller applies final failure decision using the current recovery row', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'a', contextRevision: 1 }));
    const recovery = { messageId: null, ensure: jest.fn(async id => { recovery.messageId = id; }) };
    const ports = { recovery, ownsRun: () => true, clearMessage: jest.fn(), showStatus: jest.fn(), deactivate: jest.fn(), showStop: jest.fn(), clearProcessor: jest.fn(), processorMessageId: () => 3, decideFailure: jest.fn(() => ({ action: 'throw', shouldRestoreAttemptMessage: true, shouldShowFailureRecovery: true })), isRecoveryMessage: id => id === 3, clearStatus: jest.fn(), showFailure: jest.fn() };
    const controller = lifecycle.createAttemptRecoveryController({ shouldAutoRecover: true, attemptCount: 2 }, ports);
    const error = new Error('failure');
    const attempt = { status: 'failed', label: 'fallback' };
    await expect(controller.handleAttemptFailure(error, attempt, 1)).resolves.toEqual({ action: 'throw', exception: error, attempt });
    expect(recovery.ensure).toHaveBeenCalledWith(3);
    expect(ports.clearMessage).toHaveBeenCalledWith(3);
    expect(ports.showFailure).toHaveBeenCalledWith(3);
});

test('typed request scope restores the previous attempt model on success and failure', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'a', contextRevision: 1 }));
    let currentModel = 'outer';
    const ports = {
        getModel: () => currentModel,
        setModel: model => { currentModel = model; },
        execute: jest.fn(async () => { currentModel = 'inner'; return 'response'; }),
        success: jest.fn(async value => `${value}:${currentModel}`),
        failure: jest.fn(error => `failure:${error.message}:${currentModel}`),
    };
    await expect(lifecycle.runRequestScope(ports)).resolves.toBe('response:inner');
    expect(currentModel).toBe('outer');
    ports.execute.mockImplementationOnce(async () => { currentModel = 'fallback'; throw new Error('network'); });
    await expect(lifecycle.runRequestScope(ports)).resolves.toBe('failure:network:fallback');
    expect(currentModel).toBe('outer');
    ports.success.mockRejectedValueOnce(new Error('completion'));
    await expect(lifecycle.runRequestScope(ports)).resolves.toBe('failure:completion:inner');
    expect(currentModel).toBe('outer');
});

test('nested request scopes restore the enclosing model and then its baseline', async () => {
    let model = 'baseline';
    const makePorts = (execute) => ({
        getModel: () => model, setModel: value => { model = value; },
        execute, success: async result => result, failure: error => { throw error; },
    });
    await installedLifecycle.runRequestScope(makePorts(async () => {
        model = 'outer';
        await installedLifecycle.runRequestScope(makePorts(async () => { model = 'inner'; }));
        expect(model).toBe('outer');
    }));
    expect(model).toBe('baseline');
});

test('typed empty-result policy preserves schema, streaming and cleaned response behavior', () => {
    const ports = { extract: jest.fn(value => value.text), clean: jest.fn(value => value.trim()) };
    expect(installedLifecycle.isGenerationResultEmpty({ jsonSchema: {}, result: {} }, ports)).toBe(false);
    expect(installedLifecycle.isGenerationResultEmpty({ jsonSchema: null, result: Object.assign(new String('  '), { fromStream: true }) }, ports)).toBe(true);
    expect(ports.extract).not.toHaveBeenCalled();
    expect(installedLifecycle.isGenerationResultEmpty({ jsonSchema: null, result: { text: ' answer ' } }, ports)).toBe(false);
    expect(installedLifecycle.isGenerationResultEmpty({ jsonSchema: null, result: { text: '  ' } }, ports)).toBe(true);
});

test('typed request stages own continuation, base assembly, preview and cancellation boundaries', async () => {
    const calls = [];
    let owns = true;
    const ports = {
        ownsRun: () => owns,
        continuation: async () => { calls.push('continuation'); return { prompt: ['frozen'] }; },
        base: async () => { calls.push('base'); return { history: { summarized: ['summary'] } }; },
        world: async () => { calls.push('world'); return { story: 'story' }; },
        assemble: async (base, world, forceName) => { calls.push(['assemble', world.story, forceName]); return { generateData: { prompt: ['fresh'] }, chatCompletion: 'completion' }; },
        publish: async data => { calls.push(['publish', data.prompt]); return true; },
        preview: async (data, completion, summarized) => ({ data, completion, summarized }),
    };
    const continuation = await installedLifecycle.prepareRequestStages({ type: 'normal', dryRun: false, preview: false, isOpenAI: true, hasPipelineMessages: true, forceName: false }, ports);
    expect(continuation).toEqual({ kind: 'dispatch', data: { prompt: ['frozen'] }, forceName: false });
    expect(calls).toEqual(['continuation', ['publish', ['frozen']]]);
    calls.length = 0;
    const preview = await installedLifecycle.prepareRequestStages({ type: 'normal', dryRun: true, preview: true, isOpenAI: true, hasPipelineMessages: true, forceName: false }, ports);
    expect(preview).toEqual({ kind: 'terminal', value: { data: { prompt: ['fresh'] }, completion: 'completion', summarized: ['summary'] } });
    expect(calls).toEqual(['base', 'world', ['assemble', 'story', true], ['publish', ['fresh']]]);
    calls.length = 0;
    ports.world = async () => { calls.push('world'); owns = false; return { story: 'late' }; };
    expect(await installedLifecycle.prepareRequestStages({ type: 'normal', dryRun: false, preview: false, isOpenAI: true, hasPipelineMessages: false, forceName: false }, ports)).toBeNull();
    expect(calls).toEqual(['base', 'world']);
});

test('typed preview owner shapes a side-effect-free request and identifies the pending history entry', async () => {
    const entries = [{ identifier: 'chatHistory-2' }, { identifier: 'chatHistory-6' }];
    const ports = {
        ownsRun: () => true,
        previewModel: jest.fn(index => `pipeline-model-${index}`),
        build: jest.fn(async () => ({ generate_data: { model: 'chosen' }, stream: true })),
        shape: jest.fn(() => ({ fallback: false })), canUseTools: () => true,
        responseTokens: () => 20, maxPromptTokens: () => 80,
        budget: jest.fn(() => ({ budget: { remaining: -1 }, warning: 'budget-exceeded' })),
    };
    const input = { type: 'normal', isOpenAI: true, data: { prompt: [{ role: 'user' }, { role: 'assistant', tool_calls: [{}] }] }, round: 1, warnings: ['initial'], pending: { name: 'User', mes: 'hello' }, pendingIdentifier: null, summarized: ['summary'], completion: { getChatEntries: () => entries, getDroppedEntries: () => ['dropped'] } };
    const result = await installedLifecycle.buildPreviewResult(input, ports);
    expect(result).toMatchObject({ kind: 'prompt-preview', model: 'chosen', stream: true, warnings: ['initial', 'budget-exceeded'], pendingEntryIdentifier: 'chatHistory-6', messagesInContext: 1, summarized: ['summary'] });
    expect(ports.build).toHaveBeenCalledWith(input.data.prompt, 1, 'pipeline-model-1');
    await installedLifecycle.buildPreviewResult({ ...input, type: 'quiet' }, ports);
    expect(ports.build).toHaveBeenLastCalledWith(input.data.prompt, 1, null);
    expect(ports.previewModel).toHaveBeenCalledTimes(1);
    expect(ports.budget).toHaveBeenCalledWith(input.completion, 100, 20);
    expect(await installedLifecycle.buildPreviewResult({ ...input, data: null }, ports)).toEqual({ kind: 'prompt-preview-empty', reason: 'no-active-character', warnings: ['initial'] });

    expect(await installedLifecycle.buildPreviewResult({ ...input, data: null, isOpenAI: false }, ports)).toEqual({ kind: 'prompt-preview-empty', reason: 'unsupported-api', warnings: ['initial'] });
    ports.canUseTools = () => false;
    await expect(installedLifecycle.buildPreviewResult(input, ports)).rejects.toThrow('Reply pipeline: model chosen does not support tools in this provider.');
    ports.shape = () => ({ fallback: true });
    expect((await installedLifecycle.buildPreviewResult(input, ports)).pipeline).toEqual({ fallback: true });
});

test('preview request assembly losing ownership while awaiting build does not inspect the new context', async () => {
    let owns = true;
    let release;
    const waiting = new Promise(resolve => { release = resolve; });
    const ports = {
        ownsRun: () => owns, previewModel: () => 'model',
        build: async () => { await waiting; return { generate_data: { model: 'model' }, stream: false }; },
        shape: jest.fn(() => ({ fallback: false })), canUseTools: jest.fn(() => true),
        responseTokens: () => 20, maxPromptTokens: () => 80, budget: () => ({ budget: null, warning: null }),
    };
    const pending = installedLifecycle.buildPreviewResult({ type: 'normal', isOpenAI: true, data: { prompt: [] }, round: 0, warnings: [], pending: null, pendingIdentifier: null, summarized: [], completion: null }, ports);
    owns = false;
    release();
    await expect(pending).resolves.toBeNull();
    expect(ports.shape).not.toHaveBeenCalled();
    expect(ports.canUseTools).not.toHaveBeenCalled();
});

test('typed attempt planning confines continuation recovery to its round and records pipeline provenance', () => {
    const command = { depth: 3, capabilities: { autoRecover: false, other: true } };
    const trace = {};
    const plan = jest.fn(value => ({ command: value }));
    const ports = { plan, activeRunId: () => 'active', meta: () => ({ runId: 'meta-run' }), step: () => ({ tool: 'search' }), isFallback: () => false };
    expect(installedLifecycle.prepareAttemptPlan({ type: 'normal', depth: 3, isOpenAI: true, hasPipeline: true, command, trace }, ports)).toEqual({ command: { depth: 0, capabilities: { autoRecover: true, other: true } } });
    expect(command).toEqual({ depth: 3, capabilities: { autoRecover: false, other: true } });
    expect(trace).toEqual({ pipelineRun: 'meta-run', pipelineStep: 'search' });
    const fallbackTrace = {};
    ports.isFallback = () => true;
    installedLifecycle.prepareAttemptPlan({ type: 'normal', depth: 0, isOpenAI: true, hasPipeline: true, command, trace: fallbackTrace }, ports);
    expect(plan).toHaveBeenLastCalledWith(command);
    expect(fallbackTrace).toEqual({ pipelineRun: 'meta-run' });
});

test('typed retry orchestration retains one recovery row and clears status only after an owned success', async () => {
    const { executeGenerationAttempts } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const attempts = [{ label: 'primary', status: '' }, { label: 'fallback', status: 'retrying' }];
    const events = [];
    const recovery = { messageId: null, ensure: jest.fn(async () => { recovery.messageId = 7; }) };
    const result = await installedLifecycle.runRecoveryAttempts({ attempts, shouldAutoRecover: true }, {
        recovery, ownsRun: () => true, isCancelled: () => false,
        execute: executeGenerationAttempts,
        run: async (_, index) => { events.push(`run:${index}`); if (!index) throw new Error('temporary'); return 'reply'; },
        successfulMessageId: () => 99, clearSuccessStatus: id => events.push(`success:${id}`),
        processorMessageId: () => null, decideFailure: () => ({ action: 'retry' }),
        clearProcessor: () => events.push('processor'), clearMessage: id => events.push(`clear:${id}`),
        showStatus: (id, status, kind) => events.push(`${id}:${status}:${kind}`), deactivate: () => {}, showStop: () => {},
        isRecoveryMessage: id => id === 7, clearStatus: () => {}, showFailure: () => {},
    });
    expect(result).toBe('reply');
    expect(events).toEqual(['run:0', 'processor', 'clear:7', 'clear:7', '7:retrying:fallback', 'run:1', 'success:7']);
});

test('generation round plans each pipeline retry and uses its own attempt count and recovery row', async () => {
    const { executeGenerationAttempts } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const events = [];
    const attempts = [{ label: 'primary', status: '' }, { label: 'fallback', status: 'retrying' }];
    const recovery = { messageId: null, ensure: async () => { recovery.messageId = 4; } };
    const command = { depth: 2, capabilities: { autoRecover: false } };
    const result = await installedLifecycle.executeGenerationRound({
        type: 'normal', depth: 2, isOpenAI: true, hasPipeline: true, command, trace: {},
    }, {
        showStop: () => events.push('stop'),
        plan: actual => { events.push(`plan:${actual.depth}:${actual.capabilities.autoRecover}`); return { attempts, shouldAutoRecover: true }; },
        activeRunId: () => 'run', meta: () => null, step: () => null, isFallback: () => false,
        recovery, ownsRun: () => true, isCancelled: () => false, execute: executeGenerationAttempts,
        run: async (_, index, count) => { events.push(`attempt:${index}/${count}`); if (!index) throw new Error('retry'); return 'reply'; },
        successfulMessageId: () => 8, clearSuccessStatus: id => events.push(`success:${id}`),
        processorMessageId: () => null, decideFailure: () => ({ action: 'retry' }),
        clearProcessor: () => {}, clearMessage: () => {}, showStatus: () => {}, deactivate: () => {},
        isRecoveryMessage: id => id === 4, clearStatus: () => {}, showFailure: () => {},
    });
    expect(result).toBe('reply');
    expect(events).toEqual(['stop', 'plan:0:true', 'attempt:0/2', 'stop', 'attempt:1/2', 'success:4']);
    expect(command).toEqual({ depth: 2, capabilities: { autoRecover: false } });
});

test('typed stopped cleanup only touches the captured chat, processor and pipeline', () => {
    const chat = {}, processor = {}, pipeline = {};
    const identity = { chatId: 'a', chatReference: chat, contextRevision: 3 };
    const input = { aborted: true, expected: identity, current: { ...identity }, processor, expectedProcessor: processor, pipeline, expectedPipeline: pipeline };
    const effects = [];
    const ports = { endPipeline: () => effects.push('pipeline'), unblock: () => effects.push('unblock'), clearProcessor: () => effects.push('processor') };
    expect(installedLifecycle.cleanupStoppedGeneration(input, ports)).toBe(true);
    expect(effects).toEqual(['pipeline', 'unblock', 'processor']);
    effects.length = 0;
    for (const changed of [{ aborted: false }, { current: { ...identity, chatReference: {} } }, { current: { ...identity, contextRevision: 4 } }, { processor: {} }, { pipeline: {} }]) {
        expect(installedLifecycle.cleanupStoppedGeneration({ ...input, ...changed }, ports)).toBe(false);
    }
    expect(effects).toEqual([]);
});

test('late retry success cannot clear another run recovery status', async () => {
    const { executeGenerationAttempts } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    let owns = true;
    const clear = jest.fn();
    const recovery = { messageId: 7, ensure: jest.fn() };
    await expect(installedLifecycle.runRecoveryAttempts({ attempts: [{ label: 'primary', status: '' }], shouldAutoRecover: true }, {
        recovery, ownsRun: () => owns, isCancelled: () => !owns, execute: executeGenerationAttempts,
        run: async () => { owns = false; return 'late'; },
        successfulMessageId: () => 99, clearSuccessStatus: clear,
        processorMessageId: () => null, decideFailure: jest.fn(), clearProcessor: jest.fn(),
        clearMessage: jest.fn(), showStatus: jest.fn(), deactivate: jest.fn(), showStop: jest.fn(),
        isRecoveryMessage: () => false, clearStatus: jest.fn(), showFailure: jest.fn(),
    })).rejects.toThrow('Generation was aborted.');
    expect(clear).not.toHaveBeenCalled();
});

test('typed preview scope restores prompt keys on success and failure without replacing the map', async () => {
    const prompts = { existing: { value: 'original' } };
    const original = prompts.existing;
    const run = async scope => { scope.mutate(() => { prompts.existing = { value: 'temporary' }; prompts.preview = {}; delete prompts.existing; }); return 'preview'; };
    expect(await installedLifecycle.withPreviewPromptSnapshot({ prompts: () => prompts, execute: run })).toBe('preview');
    expect(prompts).toEqual({ existing: original });
    await expect(installedLifecycle.withPreviewPromptSnapshot({ prompts: () => prompts, execute: async scope => { scope.mutate(() => { prompts.other = {}; }); throw new Error('preview failed'); } })).rejects.toThrow('preview failed');
    expect(prompts).toEqual({ existing: original });
});

test('preview ownership handles cyclic arrays and conservatively retains unknown mutable values', async () => {
    const prompts = {};
    await installedLifecycle.withPreviewPromptSnapshot({ prompts: () => prompts, execute: async scope => {
        const cyclic = { list: [] };
        cyclic.list.push(cyclic);
        scope.mutate(() => { prompts.cyclic = cyclic; prompts.unknown = { date: new Date() }; });
    } });
    expect(prompts.cyclic).toBeUndefined();
    expect(prompts.unknown.date).toBeInstanceOf(Date);
});

test.each(['first', 'second'])('overlapping previews restore the original prompt when %s finishes first', async first => {
    const prompts = { shared: { value: 'original' } };
    let releaseOne, releaseTwo;
    const waitOne = new Promise(resolve => { releaseOne = resolve; });
    const waitTwo = new Promise(resolve => { releaseTwo = resolve; });
    const one = installedLifecycle.withPreviewPromptSnapshot({ prompts: () => prompts, execute: async scope => {
        scope.mutate(() => { prompts.shared = { value: 'first' }; });
        await waitOne;
    } });
    const two = installedLifecycle.withPreviewPromptSnapshot({ prompts: () => prompts, execute: async scope => {
        scope.mutate(() => { prompts.shared = { value: 'second' }; });
        await waitTwo;
    } });
    if (first === 'first') {
        releaseOne(); await one;
        expect(prompts.shared.value).toBe('second');
        releaseTwo(); await two;
    } else {
        releaseTwo(); await two;
        expect(prompts.shared.value).toBe('first');
        releaseOne(); await one;
    }
    expect(prompts.shared.value).toBe('original');
});

test('typed generation preflight owns quiet substitution and offline early exit', () => {
    expect(installedLifecycle.prepareGenerationPreflight).toBeDefined();
    const substitute = jest.fn(value => `${value}:substituted`);
    const clearSending = jest.fn();
    expect(installedLifecycle.prepareGenerationPreflight({ quietPrompt: 'quiet', dryRun: false }, {
        substitute, hasBackendConnection: () => true, clearSending,
    })).toEqual({ quietPrompt: 'quiet:substituted' });
    expect(substitute).toHaveBeenCalledWith('quiet');
    expect(installedLifecycle.prepareGenerationPreflight({ quietPrompt: 'quiet', dryRun: false }, {
        substitute, hasBackendConnection: () => false, clearSending,
    })).toBeNull();
    expect(clearSending).toHaveBeenCalledTimes(1);
    expect(installedLifecycle.prepareGenerationPreflight({ quietPrompt: null, dryRun: true }, {
        substitute, hasBackendConnection: () => false, clearSending,
    })).toEqual({ quietPrompt: null });
});

test('typed regeneration preflight owns the real-vs-dry-run removal decision', () => {
    expect(installedLifecycle.prepareRegeneration).toBeDefined();
    const remove = jest.fn(() => ({ insertIndex: 2 }));
    expect(installedLifecycle.prepareRegeneration({ isRegenerate: false, dryRun: false }, { remove })).toBeNull();
    expect(installedLifecycle.prepareRegeneration({ isRegenerate: true, dryRun: true }, { remove })).toBeNull();
    expect(remove).not.toHaveBeenCalled();
    expect(installedLifecycle.prepareRegeneration({ isRegenerate: true, dryRun: false, signal: 'signal' }, { remove })).toEqual({ insertIndex: 2 });
    expect(remove).toHaveBeenCalledWith('signal');
});

test('typed regenerate restore preparation validates ownership and the current tail', () => {
    const collect = jest.fn(() => ({ insertIndex: 2 }));
    const snapshot = { chatId: 'chat', insertIndex: 2, messages: [{}], ownsRestore: () => true };
    expect(installedLifecycle.prepareRegenerateRestore(null, { chatId: 'chat', collect })).toEqual({ kind: 'empty' });
    expect(installedLifecycle.prepareRegenerateRestore(snapshot, { chatId: 'other', collect })).toEqual({ kind: 'stale' });
    expect(collect).not.toHaveBeenCalled();
    expect(installedLifecycle.prepareRegenerateRestore(snapshot, { chatId: 'chat', collect })).toEqual({ kind: 'ready', tail: { insertIndex: 2 } });
    collect.mockReturnValue({ insertIndex: 1 });
    expect(installedLifecycle.prepareRegenerateRestore(snapshot, { chatId: 'chat', collect })).toEqual({ kind: 'changed' });
});

test('preview snapshot does not restore into a chat that changed while preview was waiting', async () => {
    let identity = { chatId: 'chat-1', chatReference: {}, contextRevision: 1 };
    const readIdentity = () => identity;
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(readIdentity);
    const ownsRun = lifecycle.captureContextGuard();
    const prompts = { existing: { value: 'chat-1' } };
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const preview = lifecycle.withPreviewPromptSnapshot({
        prompts: () => prompts,
        ownsRun,
        execute: async scope => {
            scope.mutate(() => { prompts.preview = { value: 'temporary' }; });
            await pending;
        },
    });
    await Promise.resolve();
    identity = { chatId: 'chat-2', chatReference: {}, contextRevision: 1 };
    prompts.existing = { value: 'chat-2' };
    release();
    await preview;
    expect(prompts).toEqual({ existing: { value: 'chat-2' } });
});

test('preview propagates errors after ownership changes and preserves new prompt keys', async () => {
    let owned = true;
    const prompts = { original: { value: 'old' } };
    const error = new Error('preview failed');
    await expect(installedLifecycle.withPreviewPromptSnapshot({
        prompts: () => prompts, ownsRun: () => owned,
        execute: async () => { owned = false; prompts.newPrompt = { value: 'new' }; throw error; },
    })).rejects.toBe(error);
    expect(prompts.newPrompt).toEqual({ value: 'new' });
});

test('typed failure owner stops cleanup when ownership changes during regenerate restore', async () => {
    let owns = true;
    const error = new Error('provider');
    const ports = {
        ownsRun: () => owns, cleanupStopped: jest.fn(), reportError: jest.fn(), endPipeline: jest.fn(),
        hasRegenerateSnapshot: true, isUserStopped: () => false,
        restore: async () => { owns = false; return true; },
        reportRestore: jest.fn(), unblock: jest.fn(), log: jest.fn(), clearProcessor: jest.fn(),
    };
    await expect(installedLifecycle.failGeneration(error, ports)).rejects.toBe(error);
    expect(ports.reportRestore).not.toHaveBeenCalled();
    expect(ports.unblock).not.toHaveBeenCalled();
    expect(ports.clearProcessor).not.toHaveBeenCalled();
});

test.each([
    [{ error: { message: 'provider failed' } }, 'provider failed'],
    [new Error('Reply pipeline: invalid response'), 'Reply pipeline: invalid response'],
    [new Error('network failed'), null],
])('typed failure owner classifies visible errors and regenerate restoration', async (error, message) => {
    const ports = {
        ownsRun: () => true, cleanupStopped: jest.fn(), reportError: jest.fn(), endPipeline: jest.fn(),
        hasRegenerateSnapshot: true, isUserStopped: () => false, restore: jest.fn(async () => true),
        reportRestore: jest.fn(), unblock: jest.fn(), log: jest.fn(), clearProcessor: jest.fn(),
    };
    await expect(installedLifecycle.failGeneration(error, ports)).rejects.toBe(error);
    if (message) expect(ports.reportError).toHaveBeenCalledWith(message);
    else expect(ports.reportError).not.toHaveBeenCalled();
    expect(ports.restore).toHaveBeenCalledTimes(1);
    expect(ports.reportRestore).toHaveBeenCalledWith(true);
});

test('typed failure owner never restores a stopped regenerate', async () => {
    const error = new Error('stopped');
    const ports = { ownsRun: () => true, cleanupStopped: jest.fn(), reportError: jest.fn(), endPipeline: jest.fn(), hasRegenerateSnapshot: true, isUserStopped: () => true, restore: jest.fn(), reportRestore: jest.fn(), unblock: jest.fn(), log: jest.fn(), clearProcessor: jest.fn() };
    await expect(installedLifecycle.failGeneration(error, ports)).rejects.toBe(error);
    expect(ports.restore).not.toHaveBeenCalled();
});

test('typed world-info and story assembly keeps scan order, quiet injection and depth policy', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'a', contextRevision: 1 }));
    const calls = [];
    const ports = {
        quiet: value => calls.push(['quiet', value]),
        scan: async (...args) => { calls.push(['scan', ...args]); return { worldInfo: 'wi', worldInfoBefore: 'before', worldInfoAfter: 'after', worldInfoDepth: [{ depth: 3, role: 'system', entries: ['one', 'two'] }] }; },
        flush: () => calls.push(['flush']),
        inject: (...args) => calls.push(['inject', ...args]),
        anchor: async kind => { calls.push(['anchor', kind]); return ` ${kind} `; },
        render: params => { calls.push(['render', params]); return 'story'; },
        clearStory: () => calls.push(['clearStory']),
    };
    const input = { messages: ['older', 'newer'], quietPrompt: 'quiet', maxContext: 100, dryRun: true, skipWIAN: false, description: 'description', system: 'system', characterDepthPrompt: 'depth', creatorNotes: 'notes', scenario: 'scenario', character: 'char', user: 'user' };
    const result = await lifecycle.assembleWorldInfoStory(input, ports);
    expect(result).toEqual({ worldInfo: 'wi', storyString: 'story', beforeScenarioAnchor: ' before ', afterScenarioAnchor: ' after ' });
    expect(calls.slice(0, 4)).toEqual([
        ['quiet', 'quiet'],
        ['scan', ['newer', 'older'], 100, true, { characterDescription: 'description', characterDepthPrompt: 'depth', creatorNotes: 'notes', scenario: 'scenario', trigger: 'normal' }],
        ['quiet', ''], ['flush'],
    ]);
    expect(calls).toContainEqual(['inject', 'one\ntwo', 3, 'system']);
    expect(calls).toContainEqual(['render', expect.objectContaining({ wiBefore: 'before', loreBefore: 'before', wiAfter: 'after', loreAfter: 'after', anchorBefore: 'before', anchorAfter: 'after', char: 'char', user: 'user' })]);
    calls.length = 0;
    await lifecycle.assembleWorldInfoStory({ ...input, skipWIAN: true }, ports);
    expect(calls.some(([kind]) => kind === 'flush' || kind === 'inject')).toBe(false);
});

test('world-info owner preserves a newer quiet prompt after a stale scan', async () => {
    let owns = true;
    let prompt = { value: 'old' };
    const ports = {
        ownsRun: () => owns,
        quiet: () => prompt,
        currentQuiet: () => prompt,
        clearQuiet: jest.fn(() => { prompt = null; }),
        scan: async () => { prompt = { value: 'new' }; owns = false; return { worldInfo: 'wi', worldInfoBefore: '', worldInfoAfter: '', worldInfoDepth: [] }; },
        flush: jest.fn(), inject: jest.fn(), anchor: jest.fn(async () => ''), render: jest.fn(), clearStory: jest.fn(),
    };
    const input = { messages: [], quietPrompt: 'quiet', maxContext: 100, dryRun: false, skipWIAN: false, description: '', system: '', characterDepthPrompt: '', creatorNotes: '', scenario: '', character: '', user: '' };
    expect(await installedLifecycle.assembleWorldInfoStory(input, ports)).toBeNull();
    expect(prompt).toEqual({ value: 'new' });
    expect(ports.clearQuiet).not.toHaveBeenCalled();
});

test('world-info scan cannot write prompts after generation ownership is lost', async () => {
    let owns = true;
    const ports = {
        ownsRun: () => owns,
        quiet: jest.fn(() => 'token'), clearQuiet: jest.fn(),
        scan: async () => { owns = false; return { worldInfo: 'wi', worldInfoBefore: '', worldInfoAfter: '', worldInfoDepth: [] }; },
        flush: jest.fn(), inject: jest.fn(), anchor: jest.fn(async () => ''), render: jest.fn(), clearStory: jest.fn(),
    };
    const input = { messages: [], quietPrompt: 'quiet', maxContext: 100, dryRun: false, skipWIAN: false, description: '', system: '', characterDepthPrompt: '', creatorNotes: '', scenario: '', character: '', user: '' };
    expect(await installedLifecycle.assembleWorldInfoStory(input, ports)).toBeNull();
    expect(ports.quiet).toHaveBeenCalledTimes(1);
    expect(ports.clearQuiet).toHaveBeenCalledWith('token');
    expect(ports.flush).not.toHaveBeenCalled();
    expect(ports.anchor).not.toHaveBeenCalled();
    expect(ports.clearStory).not.toHaveBeenCalled();
});

test('story rendering cannot clear a replacement prompt after ownership changes', async () => {
    let owns = true;
    const prompts = { story: 'old' };
    const ports = {
        ownsRun: () => owns, quiet: () => {},
        scan: async () => ({ worldInfo: 'wi', worldInfoBefore: '', worldInfoAfter: '', worldInfoDepth: [] }),
        flush: () => {}, inject: () => {}, anchor: async () => '',
        render: () => { prompts.story = 'new chat story'; owns = false; return 'stale story'; },
        clearStory: () => { prompts.story = ''; },
    };
    const input = { messages: [], quietPrompt: '', maxContext: 100, dryRun: false, skipWIAN: false, description: '', system: '', characterDepthPrompt: '', creatorNotes: '', scenario: '', character: '', user: '' };
    expect(await installedLifecycle.assembleWorldInfoStory(input, ports)).toBeNull();
    expect(prompts.story).toBe('new chat story');
});

test('typed prompt assembly stops before later stages when history formatting loses ownership', async () => {
    let owns = true;
    const ports = {
        ownsRun: () => owns,
        formatHistory: jest.fn(async () => { owns = false; return 'history'; }),
        makeOpenAIMessages: jest.fn(), prepareText: jest.fn(), combine: jest.fn(), afterCombine: jest.fn(),
        assembleOpenAI: jest.fn(), setOpenAIContext: jest.fn(),
    };
    expect(await installedLifecycle.assembleRequestPrompt({ isOpenAI: true, dryRun: false }, ports)).toBeNull();
    expect(ports.makeOpenAIMessages).not.toHaveBeenCalled();
    expect(ports.prepareText).not.toHaveBeenCalled();
    expect(ports.afterCombine).not.toHaveBeenCalled();
    expect(ports.assembleOpenAI).not.toHaveBeenCalled();
});

test('base prompt preparation stops after history loading loses ownership', async () => {
    let owns = true;
    const order = [];
    const ports = {
        ownsRun: () => owns,
        card: () => { order.push('card'); return { depth: 'original' }; },
        depth: card => order.push(`depth:${card.depth}`),
        history: async () => { order.push('history'); owns = false; return { items: [], summarized: [] }; },
        maxTokens: () => { order.push('maxTokens'); return 100; },
    };
    expect(await installedLifecycle.prepareGenerationBase(ports)).toBeNull();
    expect(order).toEqual(['card', 'depth:original', 'history']);
});

test('base prompt preparation preserves successful ordering and data', async () => {
    const order = [];
    const result = await installedLifecycle.prepareGenerationBase({
        ownsRun: () => true,
        card: () => { order.push('card'); return { depth: 'character' }; },
        depth: card => order.push(`depth:${card.depth}`),
        history: async () => { order.push('history'); return { items: ['message'], summarized: [] }; },
        maxTokens: () => { order.push('maxTokens'); return 500; },
    });
    expect(order).toEqual(['card', 'depth:character', 'history', 'maxTokens']);
    expect(result).toEqual({ card: { depth: 'character' }, history: { items: ['message'], summarized: [] }, maxTokens: 500 });
});

test('text prompt token counting does not update UI state after ownership is lost', async () => {
    let owns = true;
    const ports = {
        ownsRun: () => owns,
        separator: text => text,
        countInitial: async () => { owns = false; return 1; },
        countHistory: jest.fn(async () => 1), setContext: jest.fn(), setSending: jest.fn(),
    };
    const input = { history: ['hello'], injectedIndices: [], story: '', maxContext: 100, isOpenAI: false, dryRun: false, tail: { quiet: '', quietToLoud: false, forceName: false, character: '' } };
    expect(await installedLifecycle.prepareTextPrompt(input, ports)).toBeNull();
    expect(ports.countHistory).not.toHaveBeenCalled();
    expect(ports.setContext).not.toHaveBeenCalled();
    expect(ports.setSending).not.toHaveBeenCalled();
});

test('text prompt history counting does not publish counts after ownership is lost', async () => {
    let owns = true;
    const ports = {
        ownsRun: () => owns, separator: text => text, countInitial: async () => 1,
        countHistory: async () => { owns = false; return 1; }, setContext: jest.fn(), setSending: jest.fn(),
    };
    const input = { history: ['hello'], injectedIndices: [], story: '', maxContext: 100, isOpenAI: false, dryRun: false, tail: { quiet: '', quietToLoud: false, forceName: false, character: '' } };
    expect(await installedLifecycle.prepareTextPrompt(input, ports)).toBeNull();
    expect(ports.setContext).not.toHaveBeenCalled();
    expect(ports.setSending).not.toHaveBeenCalled();
});

test('typed prompt assembly retains ordering and mutable event result for OpenAI and text', async () => {
    const calls = [];
    const ports = {
        ownsRun: () => true,
        formatHistory: async () => { calls.push('history'); return 'history'; },
        makeOpenAIMessages: () => { calls.push('messages'); return 'messages'; },
        prepareText: async history => { calls.push(`prepare:${history}`); return 'prepared'; },
        combine: async prepared => { calls.push(`combine:${prepared}`); return 'prompt'; },
        afterCombine: async prompt => { calls.push(`event:${prompt}`); return 'edited'; },
        assembleOpenAI: async messages => { calls.push(`openai:${messages}`); return { generateData: 'data', chatCompletion: 'completion' }; },
        setOpenAIContext: () => calls.push('context'),
    };
    expect(await installedLifecycle.assembleRequestPrompt({ isOpenAI: true, dryRun: false }, ports)).toEqual({ prompt: 'edited', generateData: 'data', chatCompletion: 'completion' });
    expect(calls).toEqual(['history', 'messages', 'prepare:history', 'combine:prepared', 'event:prompt', 'openai:messages', 'context']);
    calls.length = 0;
    expect(await installedLifecycle.assembleRequestPrompt({ isOpenAI: false, dryRun: false }, ports)).toEqual({ prompt: 'edited', generateData: undefined, chatCompletion: null });
    expect(calls).toEqual(['history', 'prepare:history', 'combine:prepared', 'event:prompt']);
});

test('prompt content owner assembles preview OpenAI inputs through the ordered stages', async () => {
    const events = [];
    const input = {
        type: 'normal', isOpenAI: true, dryRun: true, isPreview: true, round: 1,
        messages: [{ mes: 'history', is_user: true }], maxContext: 100, storyString: 'story',
        description: 'description', system: 'system', character: 'character', user: 'user',
        worldInfo: 'world', beforeScenarioAnchor: 'before', afterScenarioAnchor: 'after',
        quietPrompt: 'quiet', quietToLoud: false, quietImage: null, forceName: false,
        promptBias: '', api: 'openai',
    };
    const ports = {
        ownsRun: () => true, inject: async () => [], format: item => item.mes,
        presetModel: () => 'preset', assemblyModel: model => `assembly:${model}`,
        setMessages: (messages, model) => { events.push(`messages:${model}`); return messages; },
        separator: text => text, countInitial: async () => 1, countHistory: async () => 1,
        setContext: jest.fn(), setSending: jest.fn(),
        before: async () => {}, after: async data => { events.push('after'); data.prompt = 'edited'; }, extensionPrompts: () => ({ local: 'value' }),
        openAI: {
            getRunnablePipeline: () => null, getPresetModel: () => 'preset', previewTag: round => `tag:${round}`,
            previewModel: (model, round) => `${model}:${round}`, liveModel: model => model,
            liveTag: () => 'live', prepare: async (request, dryRun, options) => {
                events.push('prepare');
                expect(request).toMatchObject({ extensionPrompts: { local: 'value' }, quietPrompt: 'quiet', pipelineStepModel: 'preset:1', pipelineStepTag: 'tag:1' });
                expect(dryRun).toBe(true);
                expect(options).toEqual({ squash: true, bookkeep: false });
                return ['assembled', null, 'completion'];
            },
        },
        setOpenAIContext: jest.fn(),
    };
    expect(await installedLifecycle.assemblePromptContent(input, ports)).toEqual({ prompt: 'edited', generateData: { prompt: 'assembled' }, chatCompletion: 'completion' });
    expect(events).toEqual(['messages:assembly:preset', 'after', 'prepare']);
    expect(ports.setSending).not.toHaveBeenCalled();
    expect(ports.setOpenAIContext).not.toHaveBeenCalled();
});

test('prompt content owner stops after a cancelled combine event before assembling or updating context', async () => {
    let owns = true;
    const prepare = jest.fn();
    const setOpenAIContext = jest.fn();
    const result = await installedLifecycle.assemblePromptContent({
        type: 'normal', isOpenAI: true, dryRun: false, isPreview: false, round: 0,
        messages: [{ mes: 'hello', is_user: true }], maxContext: 100, storyString: '',
        description: '', system: '', character: '', user: '', worldInfo: {}, beforeScenarioAnchor: '', afterScenarioAnchor: '',
        quietPrompt: '', quietToLoud: false, quietImage: null, forceName: false, promptBias: '', api: 'openai',
    }, {
        ownsRun: () => owns, inject: async () => [], format: item => item.mes,
        presetModel: () => 'preset', assemblyModel: model => model, setMessages: messages => messages,
        separator: text => text, countInitial: async () => 1, countHistory: async () => 1,
        setContext: () => {}, setSending: () => {}, before: async () => {},
        after: async () => { owns = false; }, extensionPrompts: () => ({}),
        openAI: { getRunnablePipeline: () => null, getPresetModel: () => 'preset', previewTag: () => '', previewModel: model => model,
            liveModel: model => model, liveTag: () => '', prepare },
        setOpenAIContext,
    });
    expect(result).toBeNull();
    expect(prepare).not.toHaveBeenCalled();
    expect(setOpenAIContext).not.toHaveBeenCalled();
});
test('typed user input assembly preserves send, preview, bias-only and empty replacement policy', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'a', contextRevision: 1 }));
    const ports = {
        hasAttachment: jest.fn(() => false), removeMacros: text => text.replace(/\{\{bias\}\}/g, ''), emptyText: () => ' fallback ',
        sendSystem: jest.fn(), sendUser: jest.fn(async () => {}), buildUser: jest.fn(async (text, bias) => ({ mes: text, bias })), isStale: () => false,
    };
    const input = { text: 'hello', type: 'normal', bias: '', automatic: false, dryRun: false, depth: 0, regenerate: false, preview: false, isOpenAI: true };
    expect(await lifecycle.assembleUserInput(input, ports)).toEqual({ pending: null, warnings: [] });
    expect(ports.sendUser).toHaveBeenCalledWith('hello', '');
    ports.sendUser.mockClear();
    await lifecycle.assembleUserInput({ ...input, text: '', bias: 'b' }, ports);
    expect(ports.sendUser).toHaveBeenCalledWith('fallback', 'b');
    ports.sendUser.mockClear();
    await lifecycle.assembleUserInput({ ...input, text: '{{bias}}', bias: 'b' }, ports);
    expect(ports.sendSystem).toHaveBeenCalledWith('b');
    expect(ports.sendUser).not.toHaveBeenCalled();
    ports.hasAttachment.mockReturnValue(true);
    const preview = await lifecycle.assembleUserInput({ ...input, text: '/hello', dryRun: true, preview: true }, ports);
    expect(preview).toEqual({ pending: { mes: '/hello', bias: '' }, warnings: ['pending-attachment'] });
    expect(ports.sendUser).not.toHaveBeenCalled();
    const biasPreview = await lifecycle.assembleUserInput({ ...input, text: '{{bias}}', bias: 'b', dryRun: true, preview: true }, ports);
    expect(biasPreview).toEqual({ pending: null, warnings: ['pending-attachment', 'bias-only-system'] });
    ports.hasAttachment.mockReturnValue(false);
    const emptyPreview = await lifecycle.assembleUserInput({ ...input, text: '', dryRun: true, preview: true }, ports);
    expect(emptyPreview.pending).toEqual({ mes: 'fallback', bias: '' });
    ports.sendUser.mockClear();
    await lifecycle.assembleUserInput({ ...input, type: 'quiet' }, ports);
    await lifecycle.assembleUserInput({ ...input, depth: 1 }, ports);
    await lifecycle.assembleUserInput({ ...input, regenerate: true }, ports);
    expect(ports.sendUser).not.toHaveBeenCalled();
    ports.isStale = () => true;
    ports.buildUser.mockClear();
    expect(await lifecycle.assembleUserInput({ ...input, preview: true, dryRun: true }, ports)).toBeNull();
    expect(ports.buildUser).not.toHaveBeenCalled();
});

test('typed message-history formatting preserves OpenAI indexing and text user alignment', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'a', contextRevision: 1 }));
    const messages = [{ mes: 'old', is_user: true }, { mes: 'new', is_user: false }];
    const inject = jest.fn(async () => [2]);
    const format = jest.fn(item => `formatted:${item.mes}`);
    await expect(lifecycle.formatPromptHistory(messages, false, { inject, format })).resolves.toEqual({
        messages: ['formatted:new', 'formatted:old'], userIndices: [1], injectedIndices: [2],
    });
    expect(inject).toHaveBeenCalledWith(messages);
    inject.mockClear(); format.mockClear();
    await expect(lifecycle.formatPromptHistory(messages, true, { inject, format })).resolves.toEqual({
        messages: ['new', 'old'], userIndices: [], injectedIndices: [],
    });
    expect(inject).not.toHaveBeenCalled();
    expect(format).not.toHaveBeenCalled();
});

test('typed legacy prompt text builds chronological turns and applies quiet/name tail', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'a', contextRevision: 1 }));
    const messages = lifecycle.buildTextPromptMessages(['newer', 'older\n'], false);
    expect(messages).toEqual([
        { message: 'older\n', extensionPrompts: [] },
        { message: 'newer', extensionPrompts: [] },
    ]);
    expect(lifecycle.modifyLastPromptLine('newer', { quiet: 'brief', quietToLoud: true, forceName: true, character: 'Bot' })).toBe('newer\nbrief\nBot:');
    expect(lifecycle.modifyLastPromptLine('newer', { quiet: 'brief', quietToLoud: false, forceName: true, character: 'Bot' })).toBe('newer\nbrief');
    expect(lifecycle.buildTextPromptMessages(['newer'], true)).toEqual([]);

    expect(lifecycle.modifyLastPromptLine('hello\n', { quiet: '', quietToLoud: false, forceName: true, character: 'Bot' })).toBe('hello\nBot:');
});

test('typed non-OpenAI prompt combination exposes untrimmed anchors and respects event override', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'a', contextRevision: 1 }));
    const messages = [{ message: 'older\n', extensionPrompts: ['ext:'] }, { message: 'newer', extensionPrompts: [] }];
    const before = jest.fn(async data => {
        expect(data.beforeScenarioAnchor).toBe(' raw before ');
        expect(data.afterScenarioAnchor).toBe(' raw after ');
        // The legacy event is emitted before message flattening.
        expect(data.mesSendString).toBe('');
        expect(data.finalMesSend).toEqual([
            { message: 'older\n', extensionPrompts: ['ext:'], injected: false },
            { message: 'newer bias', extensionPrompts: [], injected: true },
        ]);
    });
    const input = { isOpenAI: false, messages, promptBias: ' bias', injectedIndices: [0], storyString: 'story', combinedStoryString: 'story\r', exampleString: '', generatedPromptCache: '', api: 'text', description: 'desc', character: 'char', user: 'user', worldInfo: 'wi', beforeScenarioAnchor: ' raw before ', afterScenarioAnchor: ' raw after ', system: 'system' };
    const ports = { before, separator: text => `[${text}]` };
    await expect(lifecycle.combinePrompt(input, ports)).resolves.toBe('story[ext:older\nnewer bias]');
    expect(messages[1].message).toBe('newer');
    before.mockImplementationOnce(async data => { data.combinedPrompt = 'override'; });
    await expect(lifecycle.combinePrompt(input, ports)).resolves.toBe('override');
    before.mockClear();
    await expect(lifecycle.combinePrompt({ ...input, isOpenAI: true }, ports)).resolves.toBe('');
    expect(before).not.toHaveBeenCalled();
});

test('typed prompt history assembly filters, projects, decorates and reasons in order', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'a', contextRevision: 1 }));
    const chat = [{ mes: 'first', is_user: true }, { mes: 'hidden', is_system: true }, { mes: 'answer', extra: { reasoning: 'think', title: 'doc', append_title: true } }];
    const reasoning = jest.fn((message, value) => `${message}[${value}]`);
    const ports = { substitute: s => s.toUpperCase(), project: items => ({ items, summarized: ['summary'] }), regex: (s, placement, depth) => `${placement}:${depth}:${s}`, appendFile: async (_item, text) => `${text}:file`, addReasoning: reasoning, reasoningLimitReached: () => false };
    const result = await lifecycle.assemblePromptHistory({ chat, preview: true, pending: { mes: 'pending', is_user: true }, canUseTools: false, userPlacement: 'user', assistantPlacement: 'ai', reasoningPlacement: 'reason' }, ports);
    expect(chat[0].mes).toBe('first');
    expect(result.summarized).toEqual(['summary']);
    expect(result.items.map(item => item.mes)).toEqual(['user:2:FIRST:file[reason:2:]', 'ai:1:answer:file\n\ndoc[reason:1:think]', 'user:0:pending:file[reason:0:]']);
    expect(reasoning).toHaveBeenCalledTimes(3);
});

test('typed streaming completion removes provisional pipeline prose instead of assigning it a model', async () => {
    const processor = { isStopped: false, isFinished: true, toolCalls: [[{}]], result: 'working', messageId: 2, reasoningHandler: { reasoning: '' }, reasoningSignature: null };
    const setModel = jest.fn();
    const ports = { ownsRun: () => true, clean: text => text, lastMessage: () => ({ mes: 'working' }), hasToolCalls: () => true, setModel, deleteLast: jest.fn(async () => {}), finalizeIntermediary: jest.fn(async () => {}), invokeTools: async () => ({ invocations: [], stealthCalls: [{}] }), endPipeline: jest.fn(), unblock: jest.fn(), clearProcessor: jest.fn(), hasPipeline: () => false };
    await installedLifecycle.finishStreamAttempt({ type: 'normal', isOpenAI: true, canPerformTools: true, attemptModel: 'm', text: 'working', processor }, ports);
    expect(setModel).not.toHaveBeenCalled();
    ports.hasPipeline = () => true;
    await installedLifecycle.finishStreamAttempt({ type: 'normal', isOpenAI: true, canPerformTools: true, attemptModel: 'm', text: 'working', processor }, ports);
    expect(setModel).not.toHaveBeenCalled();
    expect(ports.deleteLast).toHaveBeenCalledTimes(1);
    expect(ports.finalizeIntermediary).toHaveBeenCalledTimes(1);
});

test('typed streaming tool completion saves one round and finalizes its pipeline result', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'a', contextRevision: 1 }));
    const processor = { isStopped: false, isFinished: true, toolCalls: [[{ id: 'call' }]], result: 'working', messageId: 2, reasoningHandler: { reasoning: 'thought' }, reasoningSignature: 'sig' };
    const ports = { ownsRun: () => true, clean: text => text, assertAllowed: jest.fn(), lastMessage: () => ({ mes: 'working' }), hasToolCalls: () => true, deleteLast: jest.fn(), setModel: jest.fn(), finalizeIntermediary: jest.fn(async () => {}), invokeTools: jest.fn(async () => ({ invocations: [{ id: 'tool' }], stealthCalls: [], errors: [] })), showErrors: jest.fn(), endPipeline: jest.fn(), unblock: jest.fn(), clearProcessor: jest.fn(), prepareRound: jest.fn(() => ({ action: 'final', text: 'done', step: 'step', meta: 'meta' })), saveInvocations: jest.fn(async () => {}), markComplete: jest.fn(), finalizePipeline: jest.fn(async input => input), hasPipeline: () => true, continueGeneration: jest.fn(), emptyFailure: jest.fn(), finishMessage: jest.fn(), refresh: jest.fn(), clearRecovery: jest.fn() };
    const result = await lifecycle.finishStreamAttempt({ type: 'normal', isOpenAI: true, canPerformTools: true, attemptModel: 'm', text: 'working', processor }, ports);
    expect(ports.invokeTools).toHaveBeenCalledWith(processor.toolCalls, {
        reasoningText: 'thought', assistantMessage: { role: 'assistant', content: 'working', reasoning: 'thought', signature: 'sig' },
    });
    expect(ports.saveInvocations).toHaveBeenCalledTimes(1);
    expect(ports.finalizePipeline).toHaveBeenCalledWith(expect.objectContaining({ text: 'done', reasoning: 'thought', reasoningSignature: 'sig', fromStream: true }));
    expect(result.text).toBe('done');
    expect(ports.continueGeneration).not.toHaveBeenCalled();
});

test('typed streaming tool completion formats empty assistant content without optional reasoning fields', async () => {
    const processor = { isStopped: false, isFinished: true, toolCalls: [[{}]], result: '...', messageId: 1, reasoningHandler: { reasoning: '' }, reasoningSignature: null };
    const invokeTools = jest.fn(async () => ({ invocations: [], stealthCalls: [], errors: [] }));
    const ports = { ownsRun: () => true, clean: text => text, lastMessage: () => ({ mes: '...' }), hasToolCalls: () => true, hasPipeline: () => false, deleteLast: async () => {}, invokeTools, endPipeline: jest.fn(), unblock: jest.fn(), clearProcessor: jest.fn() };
    await installedLifecycle.finishStreamAttempt({ type: 'normal', isOpenAI: true, canPerformTools: true, attemptModel: 'm', text: '', processor }, ports);
    expect(invokeTools).toHaveBeenCalledWith(processor.toolCalls, { reasoningText: '', assistantMessage: { role: 'assistant', content: null } });
});

test('typed streaming tool completion cannot publish a final round after ownership is lost while saving', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'a', contextRevision: 1 }));
    let owned = true;
    const processor = { isStopped: false, isFinished: true, toolCalls: [[{}]], result: 'working', messageId: 2, reasoningHandler: { reasoning: '' }, reasoningSignature: null };
    const ports = { ownsRun: () => owned, clean: text => text, lastMessage: () => ({ mes: 'working' }), hasToolCalls: () => true, hasPipeline: () => true, deleteLast: async () => {}, finalizeIntermediary: async () => {}, setModel: jest.fn(), invokeTools: async () => ({ invocations: [{}], stealthCalls: [], errors: [] }), prepareRound: () => ({ action: 'final', text: 'done' }), clearProcessor: jest.fn(), saveInvocations: async () => { owned = false; }, finalizePipeline: jest.fn(), markComplete: jest.fn() };
    await expect(lifecycle.finishStreamAttempt({ type: 'normal', isOpenAI: true, canPerformTools: true, attemptModel: 'm', text: 'working', processor }, ports)).rejects.toThrow('Generation was aborted.');
    expect(ports.finalizePipeline).not.toHaveBeenCalled();
    expect(ports.markComplete).not.toHaveBeenCalled();
});

test('typed lifecycle classifies a composer submission using its original context and cancellation', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'a', contextRevision: 1 }));
    const chat = [];
    const submitted = { contextKey: 'a', contextRevision: 1 };
    const input = { composerSubmission: submitted, dryRun: false, submittedChat: chat, currentChat: chat,
        current: { ...submitted }, ownsRun: true, submissionAborted: false, externalAborted: false };
    expect(lifecycle.isSubmissionStale(input)).toBe(false);
    expect(lifecycle.isSubmissionStale({ ...input, currentChat: [] })).toBe(true);
    expect(lifecycle.isSubmissionStale({ ...input, current: { ...submitted, contextRevision: 2 } })).toBe(true);
    expect(lifecycle.isSubmissionStale({ ...input, submissionAborted: true })).toBe(true);
    expect(lifecycle.isSubmissionStale({ ...input, externalAborted: true })).toBe(true);
    expect(lifecycle.isSubmissionStale({ ...input, composerSubmission: null, ownsRun: false })).toBe(true);
    expect(lifecycle.isSubmissionStale({ ...input, dryRun: true, ownsRun: true, currentChat: [] })).toBe(false);
});

test('typed lifecycle executes one foreground run and releases ownership on completion', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    let release;
    const waiting = new Promise(resolve => { release = resolve; });
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'chat-a', contextRevision: 1 }));
    const first = lifecycle.run({ foreground: true, execute: async lease => { await waiting; return lease.owns(); } });
    const duplicate = jest.fn(async () => 'duplicate');
    await expect(lifecycle.run({ foreground: true, execute: duplicate })).resolves.toBeUndefined();
    expect(duplicate).not.toHaveBeenCalled();
    release();
    await expect(first).resolves.toBe(true);
    await expect(lifecycle.run({ foreground: true, execute: async () => 'next' })).resolves.toBe('next');
});

test('typed lifecycle invalidates a queued save when context or cancellation changes', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    let context = { chatId: 'chat-a', contextRevision: 1 };
    let release;
    const waiting = new Promise(resolve => { release = resolve; });


    const save = jest.fn();
    const controller = new AbortController();
    const lifecycle = createGenerationLifecycleService(() => context);
    const pending = lifecycle.run({ foreground: true, signal: controller.signal, execute: async lease => {
        await waiting;
        if (lease.owns()) save();
    } });
    context = { chatId: 'chat-a', contextRevision: 2 };
    controller.abort();
    release();
    await pending;
    expect(save).not.toHaveBeenCalled();
});

test('typed leases distinguish chat identity, revision, stop, and independent background runs', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const chat = [];
    let context = { chatId: 'a', chatReference: chat, contextRevision: 1 };
    const lifecycle = createGenerationLifecycleService(() => context);
    await lifecycle.run({ foreground: true, execute: async foreground => {
        await lifecycle.run({ foreground: false, execute: async background => {
            expect(foreground.owns()).toBe(true);
            expect(background.owns()).toBe(true);
            context = { ...context, chatId: 'b' };
            expect(foreground.owns()).toBe(false);
            expect(background.owns()).toBe(false);
            context = { ...context, chatId: 'a', contextRevision: 2 };
            expect(foreground.owns()).toBe(false);
            context = { ...context, contextRevision: 1 };
            background.cancel();
            expect(background.owns()).toBe(false);
            expect(foreground.owns()).toBe(false);
        } });
    } });
});

test('typed attempt executor blocks recovery when stop races transport rejection', async () => {
    const { executeGenerationAttempts } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    let rejectTransport;
    const transport = new Promise((_resolve, reject) => { rejectTransport = reject; });
    const controller = new AbortController();
    const recover = jest.fn(async () => ({ action: 'retry' }));
    const pending = executeGenerationAttempts({ attempts: [{}, {}], signal: controller.signal, runAttempt: () => transport, handleFailure: recover });
    await new Promise(resolve => setImmediate(resolve));
    controller.abort();
    rejectTransport(new Error('network'));
    await expect(pending).rejects.toThrow('Generation was aborted.');
    expect(recover).not.toHaveBeenCalled();
});

test('typed execution rejects a transport result when its owning chat changes', async () => {
    const { createGenerationLifecycleService, executeGenerationAttempts } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    let context = { chatId: 'a', contextRevision: 1 };
    const lifecycle = createGenerationLifecycleService(() => context);
    let release;
    const pendingTransport = new Promise(resolve => { release = resolve; });
    const publish = jest.fn();
    const pending = lifecycle.run({ foreground: true, execute: async lease => {
        const result = await executeGenerationAttempts({
            attempts: [{}], runAttempt: () => pendingTransport, handleFailure: async () => ({ action: 'retry' }),
            isCancelled: () => !lease.owns(),
        });
        publish(result);
    } });
    await new Promise(resolve => setImmediate(resolve));
    context = { chatId: 'b', contextRevision: 2 };
    release('stale');
    await expect(pending).rejects.toThrow('Generation was aborted.');
    expect(publish).not.toHaveBeenCalled();
});

test('typed recovery state reuses the current row and does not adopt a row after ownership is lost', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'a', contextRevision: 1 }));
    let owned = true;
    let release;
    const wait = new Promise(resolve => { release = resolve; });
    const createMessage = jest.fn(async () => { await wait; return 4; });
    const recovery = lifecycle.createRecoveryState({ ownsRun: () => owned, isRecoveryMessage: id => id === 2 || id === 4, createMessage });
    expect(await recovery.ensure(2)).toBe(2);
    expect(await recovery.ensure(null)).toBe(2);
    expect(createMessage).not.toHaveBeenCalled();
    recovery.messageId = null;
    const pending = recovery.ensure(null);
    owned = false;
    release();
    await expect(pending).resolves.toBeNull();
    expect(recovery.messageId).toBeNull();
    await expect(recovery.ensure(2)).resolves.toBeNull();
    expect(recovery.messageId).toBeNull();
});

test('typed response owner finalizes a non-stream reply and does not publish after ownership is lost', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'a', contextRevision: 1 }));
    let owns = true;
    let release;
    const waiting = new Promise(resolve => { release = resolve; });
    const ports = {
        ownsRun: () => owns,
        extractMessage: () => ' answer ', extractTitle: () => undefined,
        extractReasoning: () => ' thought ', extractImages: () => [], extractSignature: () => null,
        clean: text => text.trim(), cleanReasoning: text => text,
        hasRecoveryMessage: () => false,
        saveReply: jest.fn(async reply => { await waiting; return reply; }),
        setType: jest.fn(),
        endPipeline: jest.fn(), saveChat: jest.fn(), unblock: jest.fn(), clearProcessor: jest.fn(),
    };
    const pending = lifecycle.completeGenerationResponse({ data: { choices: [] }, type: 'normal', canPerformToolCalls: false }, ports);
    await Promise.resolve();
    expect(ports.saveReply).toHaveBeenCalledWith(expect.objectContaining({ getMessage: 'answer', reasoning: 'thought' }));
    owns = false;
    release();
    await expect(pending).resolves.toBeUndefined();
    expect(ports.setType).not.toHaveBeenCalled();
    expect(ports.endPipeline).not.toHaveBeenCalled();
    expect(ports.saveChat).not.toHaveBeenCalled();
});

function responsePorts(overrides = {}) {
    return {
        ownsRun: () => true,
        continuePipeline: jest.fn(async () => 'pipeline continuation'),
        continueAfterTools: jest.fn(async () => 'tool continuation'),
        unblock: jest.fn(), showApiError: jest.fn(), extractJson: jest.fn(() => '{"ok":true}'),
        extractMessage: () => ' answer ', extractTitle: () => undefined,
        extractReasoning: () => ' thought ', extractImages: () => [], extractSignature: () => 'sig',
        clean: text => text.trim(), cleanReasoning: text => text,
        hasRecoveryMessage: () => false, replaceRecovery: jest.fn(async reply => reply),
        clearRecoveryStatus: jest.fn(), saveReply: jest.fn(async reply => reply), setType: jest.fn(),
        hasToolCalls: () => false, deleteLastMessage: jest.fn(async () => {}),
        invokeTools: jest.fn(async () => ({ invocations: [], stealthCalls: [], errors: [] })),
        showToolErrors: jest.fn(), preparePipeline: jest.fn(), saveTools: jest.fn(async () => {}),
        finalizePipeline: jest.fn(async () => 'final pipeline reply'), logSave: jest.fn(),
        endPipeline: jest.fn(), saveChat: jest.fn(async predicate => predicate()), clearProcessor: jest.fn(),
        ...overrides,
    };
}

test('typed request assembly freezes preview history at the first pipeline round while shaping the requested round', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'a', contextRevision: 1 }));
    const prepare = jest.fn(async (request, dryRun, options) => [[request.pipelineStepModel], null, { request, dryRun, options }]);
    const ports = {
        getRunnablePipeline: () => ({ steps: [{ id: 'first' }, { id: 'last' }] }),
        getPresetModel: () => 'model',
        previewTag: round => `tag-${round}`, previewModel: (model, round) => `${model}-${round}`,
        liveModel: model => `${model}-live`, liveTag: type => `live-${type}`, prepare,
    };
    const result = await lifecycle.assembleOpenAIRequest({ type: 'normal', isPreview: true, round: 1, dryRun: true, presetModel: 'model', request: { messages: ['history'] } }, ports);
    expect(prepare).toHaveBeenCalledWith(expect.objectContaining({
        messages: ['history'], assemblyModel: 'model-0', pipelineStepModel: 'model-1', pipelineStepTag: 'tag-1',
        pipelinePreviewBase: { step: { id: 'first' }, total: 2, tag: 'tag-0', model: 'model-0' }, pipelineHistory: true,
    }), true, { squash: true, bookkeep: false });
    expect(result.generateData).toEqual({ prompt: ['model-1'] });
    expect(result.chatCompletion.options.bookkeep).toBe(false);
});

test('typed request assembly preserves live normal and quiet pipeline model and bookkeeping policy', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'a', contextRevision: 1 }));
    const ports = { getRunnablePipeline: jest.fn(), getPresetModel: jest.fn(() => 'base'), previewTag: jest.fn(), previewModel: jest.fn(), liveModel: model => `${model}-live`, liveTag: type => `tag-${type}`, prepare: jest.fn(async () => ['prompt', null, null]) };
    await lifecycle.assembleOpenAIRequest({ type: 'normal', isPreview: false, round: 0, dryRun: false, presetModel: 'base', request: {} }, ports);
    expect(ports.prepare).toHaveBeenLastCalledWith(expect.objectContaining({ assemblyModel: 'base-live', pipelineStepModel: 'base-live', pipelineStepTag: 'tag-normal', pipelinePreviewBase: null, pipelineHistory: false }), false, { squash: null, bookkeep: true });
    ports.getPresetModel.mockClear();
    await lifecycle.assembleOpenAIRequest({ type: 'quiet', isPreview: false, round: 0, dryRun: false, presetModel: 'base', request: {} }, ports);
    expect(ports.prepare).toHaveBeenLastCalledWith(expect.objectContaining({ assemblyModel: null, pipelineStepModel: null, pipelineStepTag: 'tag-quiet' }), false, { squash: null, bookkeep: true });
    expect(ports.getRunnablePipeline).not.toHaveBeenCalled();
    expect(ports.getPresetModel).not.toHaveBeenCalled();
});

test('typed prompt assembly reserves injected history before filling the remaining strict token budget', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'a', contextRevision: 1 }));
    const counted = jest.fn(async text => text.length);
    const result = await lifecycle.selectPromptHistory({
        messages: ['aa', 'bbb', 'cc', 'dddd'], injectedIndices: [2], initialTokens: 1, maxContext: 7, isOpenAI: false,
    }, counted);
    expect(counted.mock.calls.map(([text]) => text)).toEqual(['cc', 'aa', 'bbb']);
    expect(result).toEqual({ messages: ['aa', 'cc'], injectedIndices: [1] });
});

test('typed prompt history leaves OpenAI assembly to its existing prompt manager', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'a', contextRevision: 1 }));
    const counted = jest.fn();
    const result = await lifecycle.selectPromptHistory({ messages: ['a'], injectedIndices: [0], initialTokens: 0, maxContext: 10, isOpenAI: true }, counted);
    expect(result).toEqual({ messages: [], injectedIndices: [] });
    expect(counted).not.toHaveBeenCalled();
});

test('typed pipeline finalization folds the run card into its final reply and persists it once', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'a', contextRevision: 1 }));
    const invocations = [{ name: 'final-tool' }];
    const chat = [{ mes: 'old' }, { extra: { reply_pipeline_run: 'run-1', tool_invocations: invocations } }];
    const ports = {
        ownsRun: () => true, chat,
        clean: text => text.trim(), formatTags: jest.fn((_calls, text) => `<final-tool>${text}</final-tool>`),
        regexOutput: text => text, removeCardView: jest.fn(), emitDeleted: jest.fn(async () => {}),
        saveReply: jest.fn(async reply => { chat.push({ mes: reply.getMessage, extra: {} }); return reply; }),
        endPipeline: jest.fn(), saveChat: jest.fn(async owns => owns()), unblock: jest.fn(),
        clearProcessor: jest.fn(), refresh: jest.fn(),
    };
    const result = await lifecycle.finalizePipelineReply({ type: 'normal', text: ' answer ', step: { id: 'step-1', tool: 'final-tool' }, meta: { runId: 'run-1' }, fromStream: true }, ports);
    expect(String(result)).toBe('<final-tool>answer</final-tool>');
    expect(result.messageChunk).toBe('answer');
    expect(result.fromStream).toBe(true);
    expect(chat).toHaveLength(2);
    expect(chat[1].extra).toEqual({ reply_pipeline_run: 'run-1', reply_pipeline_step: 'step-1', tool_invocations: invocations });
    expect(ports.removeCardView).toHaveBeenCalledWith(1);
    expect(ports.emitDeleted).toHaveBeenCalledWith(1);
    expect(ports.saveChat).toHaveBeenCalledTimes(1);
});

test('typed pipeline finalization appends an untagged final reply and stops after a stale queued save', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'a', contextRevision: 1 }));
    let owns = true;
    let release;
    const wait = new Promise(resolve => { release = resolve; });
    const chat = [{ extra: { reply_pipeline_run: 'run-1', tool_invocations: [{ name: 'previous' }] } }];
    const ports = {
        ownsRun: () => owns, chat, clean: text => text, formatTags: jest.fn(() => '<previous></previous>'), regexOutput: text => text,
        removeCardView: jest.fn(), emitDeleted: jest.fn(async () => {}),
        saveReply: jest.fn(async reply => { chat.push({ extra: {} }); return reply; }), endPipeline: jest.fn(),
        saveChat: jest.fn(async predicate => { await wait; expect(predicate()).toBe(false); }),
        unblock: jest.fn(), clearProcessor: jest.fn(), refresh: jest.fn(),
    };
    const pending = lifecycle.finalizePipelineReply({ type: 'normal', text: 'answer', step: { tool: 'last' }, meta: { runId: 'run-1' } }, ports);
    await new Promise(resolve => setImmediate(resolve));
    expect(ports.saveReply).toHaveBeenCalledWith(expect.objectContaining({ getMessage: '<previous></previous>\nanswer' }));
    owns = false;
    release();
    await expect(pending).resolves.toBeUndefined();
    expect(ports.unblock).not.toHaveBeenCalled();
    expect(ports.clearProcessor).not.toHaveBeenCalled();
    expect(ports.refresh).not.toHaveBeenCalled();
});

test('typed pipeline finalization stops after a deletion listener invalidates ownership', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'a', contextRevision: 1 }));
    let owns = true;
    const ports = {
        ownsRun: () => owns,
        chat: [{ extra: { reply_pipeline_run: 'run-1', tool_invocations: [{ name: 'tool' }] } }],
        clean: text => text, formatTags: () => '<tool>answer</tool>', regexOutput: text => text,
        removeCardView: jest.fn(), emitDeleted: jest.fn(async () => { owns = false; }),
        saveReply: jest.fn(), endPipeline: jest.fn(), saveChat: jest.fn(), unblock: jest.fn(), clearProcessor: jest.fn(), refresh: jest.fn(),
    };
    await expect(lifecycle.finalizePipelineReply({ type: 'normal', text: 'answer', step: { tool: 'tool' }, meta: { runId: 'run-1' } }, ports)).resolves.toBeUndefined();
    expect(ports.saveReply).not.toHaveBeenCalled();
    expect(ports.saveChat).not.toHaveBeenCalled();
});

test('typed response owner preserves visible, quiet, streamed and schema return contracts', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'a', contextRevision: 1 }));
    const ports = responsePorts();
    const data = { choices: [] };
    const result = await lifecycle.completeGenerationResponse({ data, type: 'normal', canPerformToolCalls: false }, ports);
    expect(String(result)).toBe('answer');
    expect(result.messageChunk).toBe('answer');
    expect(ports.saveReply).toHaveBeenCalledWith(expect.objectContaining({ getMessage: 'answer', reasoning: 'thought', reasoningSignature: 'sig' }));
    expect(ports.saveChat).toHaveBeenCalledTimes(1);
    expect(ports.unblock).toHaveBeenCalledWith('normal');

    const quiet = responsePorts();
    expect(await lifecycle.completeGenerationResponse({ data, type: 'quiet', canPerformToolCalls: false }, quiet)).toBe('answer');
    expect(quiet.saveReply).not.toHaveBeenCalled();
    expect(quiet.saveChat).not.toHaveBeenCalled();
    expect(quiet.unblock).toHaveBeenCalledWith('quiet');

    const stream = Object.assign(new String('stream'), { fromStream: true });
    expect(await lifecycle.completeGenerationResponse({ data: stream, type: 'normal', canPerformToolCalls: false }, responsePorts())).toBe(stream);
    const schema = responsePorts();
    expect(await lifecycle.completeGenerationResponse({ data, type: 'normal', jsonSchema: { returnInvalid: true }, canPerformToolCalls: false }, schema)).toBe('{"ok":true}');
    expect(schema.extractJson).toHaveBeenCalledWith(data, true);
    expect(schema.saveReply).not.toHaveBeenCalled();
});

test('typed response owner does not unblock or clear the new run after ownership is lost during a queued save', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'a', contextRevision: 1 }));
    let owns = true;
    let release;
    const wait = new Promise(resolve => { release = resolve; });
    const committed = jest.fn();
    const ports = responsePorts({
        ownsRun: () => owns,
        saveChat: jest.fn(async predicate => { await wait; if (predicate()) committed(); }),
    });
    const pending = lifecycle.completeGenerationResponse({ data: { choices: [] }, type: 'normal', canPerformToolCalls: false }, ports);
    await new Promise(resolve => setImmediate(resolve));
    expect(ports.saveChat).toHaveBeenCalledTimes(1);
    owns = false;
    release();
    await expect(pending).resolves.toBeUndefined();
    expect(committed).not.toHaveBeenCalled();
    expect(ports.unblock).not.toHaveBeenCalled();
    expect(ports.clearProcessor).not.toHaveBeenCalled();
});

test('typed response owner reuses recovery and commits a final tool pipeline round once', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'a', contextRevision: 1 }));
    const invocations = [{ name: 'lookup' }];
    const decision = { action: 'final', text: 'tool answer', step: { id: 's1' }, meta: { runId: 'run' } };
    const ports = responsePorts({
        hasRecoveryMessage: () => true, hasToolCalls: () => true,
        invokeTools: jest.fn(async () => ({ invocations, stealthCalls: [], errors: [] })),
        preparePipeline: jest.fn(() => decision),
    });
    expect(await lifecycle.completeGenerationResponse({ data: { choices: [] }, type: 'normal', canPerformToolCalls: true }, ports)).toBe('final pipeline reply');
    expect(ports.replaceRecovery).toHaveBeenCalledTimes(1);
    expect(ports.saveReply).not.toHaveBeenCalled();
    expect(ports.clearRecoveryStatus).toHaveBeenCalledTimes(1);
    expect(ports.saveTools).toHaveBeenCalledWith(invocations, expect.any(Function));
    expect(ports.finalizePipeline).toHaveBeenCalledWith(expect.objectContaining({ text: 'tool answer', step: decision.step, meta: decision.meta }));
    expect(ports.continueAfterTools).not.toHaveBeenCalled();
    expect(ports.saveChat).not.toHaveBeenCalled();
});

test('typed attempt executor retains the bounded attempt order and result', async () => {
    const { executeGenerationAttempts } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const seen = [];
    const result = await executeGenerationAttempts({
        attempts: ['primary', 'retry', 'fallback'],
        prepareRetryAttempt: async attempt => { seen.push(`prepare:${attempt}`); },
        runAttempt: async attempt => { seen.push(`run:${attempt}`); if (attempt !== 'fallback') throw Error('network'); return 'answer'; },
        handleFailure: async () => ({ action: 'retry' }),
    });
    expect(result).toBe('answer');
    expect(seen).toEqual(['prepare:primary', 'run:primary', 'prepare:retry', 'run:retry', 'prepare:fallback', 'run:fallback']);
});

test('the actual stream session reads and writes its single typed state owner', () => {
    registerGenerationShellContext({ state: { ReasoningHandler: class {} } });
    const create = jest.spyOn(installedLifecycle, 'createStreamState');
    try {
        const session = new GenerationStreamSession('normal', false, new Date(), null);
        const ownedState = create.mock.results[0].value;
        expect(session.result).toBe('');
        session.result = 'first';
        session.observedChunkCount = 4;
        expect(ownedState.result).toBe('first');
        expect(ownedState.observedChunkCount).toBe(4);
        ownedState.messageId = 7;
        ownedState.isStopped = true;
        expect(session.messageId).toBe(7);
        expect(session.isStopped).toBe(true);
        const another = new GenerationStreamSession('normal', false, new Date(), null);
        expect(another.result).toBe('');
        expect(another.isStopped).toBe(false);
    } finally {
        create.mockRestore();
    }
});

test('the real stream session delegates start, progress and finalization to the installed typed owner', async () => {
    const chat = [{ mes: '...' }];
    const save = jest.fn(async predicate => predicate());
    registerGenerationShellContext({
        state: { chat, scrollLock: true, ReasoningHandler: class { async process() {} async finish() {} } },
        saveReply: jest.fn(async () => {}), saveChatConditional: save,
        isReactMainChatOwner: () => true, cleanUpMessage: ({ getMessage }) => getMessage,
        countOccurrences: () => 0, isOdd: () => false,
        deactivateSendButtons: jest.fn(), unblockGeneration: jest.fn(), scrollChatToBottom: jest.fn(),
        mountReactMainChatMessageListPanel: jest.fn(), scheduleMainChatMessageListPanelRefresh: jest.fn(),
    });

    const start = jest.spyOn(installedLifecycle, 'startStreamMessage');
    const progress = jest.spyOn(installedLifecycle, 'progressStreamMessage');
    const finalize = jest.spyOn(installedLifecycle, 'finalizeStreamMessage');
    const finish = jest.spyOn(installedLifecycle, 'finishStreamMessage');
    try {
        const session = new GenerationStreamSession('normal', false, new Date(), null);
        session.messageId = await session.onStartStreaming('...');
        await session.onProgressStreaming(0, 'answer', false);
        await session.onFinishStreaming(0, 'answer');
        expect(chat[0].mes).toBe('answer');
        expect(save).toHaveBeenCalledTimes(1);
        expect(start).toHaveBeenCalledTimes(1);
        expect(progress).toHaveBeenCalledTimes(2);
        expect(finalize).toHaveBeenCalledTimes(1);
        expect(finish).toHaveBeenCalledTimes(1);
    } finally {
        start.mockRestore(); progress.mockRestore(); finalize.mockRestore(); finish.mockRestore();
    }
});

test('typed stream progress balances incomplete formatting but final text is left unbalanced', async () => {
    const chat = [{ mes: '' }];
    registerGenerationShellContext({
        state: { chat, scrollLock: true, ReasoningHandler: class { async process() {} } },
        isReactMainChatOwner: () => true, cleanUpMessage: ({ getMessage }) => getMessage,
        countOccurrences: (text, token) => text.split(token).length - 1,
        isOdd: count => count % 2 === 1,
        scheduleMainChatMessageListPanelRefresh: jest.fn(),
    });
    const session = new GenerationStreamSession('normal', false, new Date(), null);
    await session.onProgressStreaming(0, '```js', false);
    expect(chat[0].mes).toBe('```js\n```');
    await session.onProgressStreaming(0, '```js', true);
    expect(chat[0].mes).toBe('```js');
});

test('a completed stream saves while its session remains active', async () => {
    const save = jest.fn(async shouldSave => shouldSave());
    registerGenerationShellContext({ state: { ReasoningHandler: class {} }, saveChatConditional: save });
    const session = new GenerationStreamSession('normal', false, new Date(), null);
    session.finalizeIntermediaryMessage = jest.fn(async () => {});
    await session.onFinishStreaming(0, 'response');
    expect(save).toHaveBeenCalledTimes(1);
    expect(await save.mock.results[0].value).toBe(true);
});

test('stopping while the stream finalizer awaits prevents a late save', async () => {
    let release;
    const waiting = new Promise(resolve => { release = resolve; });
    const save = jest.fn(async () => true);
    const context = {
        state: { ReasoningHandler: class {} },
        saveChatConditional: save,
        rememberMainChatStreamingTransportProcessorTerminal: jest.fn(),
        mountReactMainChatMessageListPanel: jest.fn(),
    };
    registerGenerationShellContext(context);
    const session = new GenerationStreamSession('normal', false, new Date(), null);
    session.finalizeIntermediaryMessage = jest.fn(async () => waiting);
    const pending = session.onFinishStreaming(0, 'response');
    session.onStopStreaming();
    release();
    await pending;
    expect(save).not.toHaveBeenCalled();
});

test('a save queued behind the save lock is invalidated by stop', async () => {
    let release;
    const waiting = new Promise(resolve => { release = resolve; });
    const committed = jest.fn();
    const save = jest.fn(async shouldSave => {
        await waiting;
        if (typeof shouldSave !== 'function' || shouldSave()) committed();
    });
    const context = {
        state: { ReasoningHandler: class {} },
        saveChatConditional: save,
        rememberMainChatStreamingTransportProcessorTerminal: jest.fn(),
        mountReactMainChatMessageListPanel: jest.fn(),
    };
    registerGenerationShellContext(context);
    const session = new GenerationStreamSession('normal', false, new Date(), null);
    session.finalizeIntermediaryMessage = jest.fn(async () => {});
    const pending = session.onFinishStreaming(0, 'response');
    await Promise.resolve();
    expect(save).toHaveBeenCalledTimes(1);
    session.onStopStreaming();
    release();
    await pending;
    expect(committed).not.toHaveBeenCalled();
});

test('a stream whose owning chat changes while finalizing does not save', async () => {
    let release;
    let owns = true;
    const waiting = new Promise(resolve => { release = resolve; });
    const save = jest.fn(async () => true);
    registerGenerationShellContext({ state: { ReasoningHandler: class {} }, saveChatConditional: save });
    const session = new GenerationStreamSession('normal', false, new Date(), null, () => owns);
    session.finalizeIntermediaryMessage = jest.fn(async () => waiting);
    const pending = session.onFinishStreaming(0, 'response');
    owns = false;
    release();
    await pending;
    expect(save).not.toHaveBeenCalled();
});

test('a stream save queued behind the lock checks live run ownership', async () => {
    let release;
    let owns = true;
    const waiting = new Promise(resolve => { release = resolve; });
    const committed = jest.fn();
    const save = jest.fn(async predicate => { await waiting; if (predicate()) committed(); });
    registerGenerationShellContext({ state: { ReasoningHandler: class {} }, saveChatConditional: save });
    const session = new GenerationStreamSession('normal', false, new Date(), null, () => owns);
    session.finalizeIntermediaryMessage = jest.fn(async () => {});
    const pending = session.onFinishStreaming(0, 'response');
    await Promise.resolve();
    owns = false;
    release();
    await pending;
    expect(committed).not.toHaveBeenCalled();
});

test('a stream progress callback cannot write to the replacement chat after an await', async () => {
    let owns = true;
    const oldChat = [{ mes: 'old' }];
    const replacement = [{ mes: 'new chat' }];
    const context = {
        state: { chat: oldChat, ReasoningHandler: class { async process() {} }, scrollLock: true },
        cleanUpMessage: ({ getMessage }) => getMessage,
        countOccurrences: () => 0,
        isOdd: () => false,
        isReactMainChatOwner: () => true,
        scheduleMainChatMessageListPanelRefresh: jest.fn(),
    };
    registerGenerationShellContext(context);
    const session = new GenerationStreamSession('normal', false, new Date(), null, () => owns);
    const pending = session.onProgressStreaming(0, 'stale text', false);
    context.state.chat = replacement;
    owns = false;
    await pending;
    expect(replacement[0].mes).toBe('new chat');
    expect(context.scheduleMainChatMessageListPanelRefresh).not.toHaveBeenCalled();
});

test('stopping while a stream starts prevents late UI activation', async () => {
    let release;
    const waiting = new Promise(resolve => { release = resolve; });
    const deactivateSendButtons = jest.fn();
    registerGenerationShellContext({
        state: { chat: [{ mes: '...' }], ReasoningHandler: class {} },
        saveReply: jest.fn(() => waiting), deactivateSendButtons,
        rememberMainChatStreamingTransportProcessorTerminal: jest.fn(),
        mountReactMainChatMessageListPanel: jest.fn(),
        isReactMainChatOwner: () => true,
        scrollChatToBottom: jest.fn(),
    });
    const session = new GenerationStreamSession('normal', false, new Date(), null);
    const pending = session.onStartStreaming('...');
    session.onStopStreaming();
    release();
    await pending;
    expect(deactivateSendButtons).not.toHaveBeenCalled();
});

test('stopping during stream progress prevents a late message update', async () => {
    const chat = [{ mes: 'before stop' }];
    const refresh = jest.fn();
    registerGenerationShellContext({
        state: { chat, ReasoningHandler: class { async process() {} }, scrollLock: true },
        cleanUpMessage: ({ getMessage }) => getMessage,
        countOccurrences: () => 0, isOdd: () => false,
        isReactMainChatOwner: () => true,
        scheduleMainChatMessageListPanelRefresh: refresh,
        rememberMainChatStreamingTransportProcessorTerminal: jest.fn(),
        mountReactMainChatMessageListPanel: jest.fn(),
    });
    const session = new GenerationStreamSession('normal', false, new Date(), null);
    const pending = session.onProgressStreaming(0, 'late text', false);
    session.onStopStreaming();
    await pending;
    expect(chat[0].mes).toBe('before stop');
    expect(refresh).not.toHaveBeenCalled();
});

test('stopping while reasoning finalizes prevents late completion events', async () => {
    let release;
    let finishStarted;
    const started = new Promise(resolve => { finishStarted = resolve; });
    const waiting = new Promise(resolve => { release = resolve; });
    const unblockGeneration = jest.fn();
    registerGenerationShellContext({
        state: { chat: [{ mes: 'text' }], ReasoningHandler: class { async finish() { finishStarted(); await waiting; } } },
        isReactMainChatOwner: () => true,
        unblockGeneration,
        rememberMainChatStreamingTransportProcessorTerminal: jest.fn(),
        mountReactMainChatMessageListPanel: jest.fn(),
    });
    const { eventSource } = await import('../public/scripts/events.js');
    eventSource.emit.mockClear();
    const session = new GenerationStreamSession('normal', false, new Date(), null);
    session.onProgressStreaming = jest.fn(async () => {});
    const pending = session.finalizeIntermediaryMessage(0, 'text', { unlockUI: true });
    await started;
    session.onStopStreaming();
    release();
    await pending;
    expect(unblockGeneration).not.toHaveBeenCalled();
    expect(eventSource.emit).not.toHaveBeenCalled();
});

test('the generation shell entry executes through the installed typed lifecycle', async () => {
    const runtime = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const { createGenerationRuntimeBootstrap } = await import('../public/scripts/generation-shell-context.js');
    const { installGenerationAttemptExecutor } = await import('../public/scripts/chat-generation-command-service.js');
    const { getComposerSnapshot } = await import('../public/scripts/main-chat-composer-service.js');
    let release;
    const waiting = new Promise(resolve => { release = resolve; });
    const unshallowCharacter = jest.fn(() => waiting);
    const context = {
        state: { chat: [], this_chid: 0 },
        setGenerationProgress: jest.fn(), unshallowCharacter, unblockGeneration: jest.fn(),
    };
    registerGenerationShellContext(context);
    const bootstrap = createGenerationRuntimeBootstrap({
        load: async () => runtime,
        readIdentity: getCurrentGenerationContextIdentity,
        installLifecycle: service => expect(typeof service.run).toBe('function'),
        installAttempt: installGenerationAttemptExecutor,
    });
    await bootstrap();
    const controller = new AbortController();
    const envelope = { type: 'normal', options: { signal: controller.signal, composerSubmission: getComposerSnapshot() }, dryRun: false };
    const pending = executeGenerationRequestInShell(envelope);
    await expect(executeGenerationRequestInShell(envelope)).resolves.toBeUndefined();
    expect(unshallowCharacter).toHaveBeenCalledTimes(1);
    controller.abort();
    release();
    await expect(pending).resolves.toBeUndefined();
});

test('a stopped quiet request does not continue preparation after character loading', async () => {
    let release;
    const waiting = new Promise(resolve => { release = resolve; });
    const pingServer = jest.fn(async () => true);
    registerGenerationShellContext({
        state: { chat: [], this_chid: 0, chat_metadata: {}, online_status: 'no_connection' },
        setGenerationProgress: jest.fn(), unshallowCharacter: () => waiting,
        unblockGeneration: jest.fn(), pingServer,
    });
    const controller = new AbortController();
    const pending = executeGenerationRequestInShell({ type: 'quiet', options: { signal: controller.signal }, dryRun: false });
    controller.abort();
    release();
    await expect(pending).resolves.toBeUndefined();
    expect(pingServer).not.toHaveBeenCalled();
});

test('the installed typed lifecycle owns stream execution and preserves token order', async () => {
    const { getGenerationLifecycleService } = await import('../public/scripts/generation-shell-context.js');
    expect(typeof getGenerationLifecycleService().generateStream).toBe('function');
    const seen = [];
    const context = {
        state: { ReasoningHandler: class { updateReasoning(_id, value) { seen.push(`reasoning:${value}`); } },
            Stopwatch: class { async tick(fn) { await fn(); } }, scrollLock: true, main_api: 'openai' },
        delay: async () => {}, getStoppingStrings: () => [],
        scheduleMainChatMessageListPanelRefresh: () => seen.push('refresh'),
        mountReactMainChatMessageListPanel: async () => {},
    };
    registerGenerationShellContext(context);
    const session = new GenerationStreamSession('normal', false, new Date(), null);
    session.onStartStreaming = async () => 0;
    session.onProgressStreaming = async (_id, text) => seen.push(`progress:${text}`);
    session.generator = async function* () { yield { text: 'one', toolCalls: [], state: { reasoning: 'r' } }; };
    await expect(session.generate()).resolves.toBe('one');
    expect(seen).toEqual(['refresh', 'reasoning:r', 'progress:one']);
    expect(session.observedTokenCount).toBe(1);
    expect(session.isFinished).toBe(true);
    expect(context.state.scrollLock).toBe(false);
});

test('stopping during stream startup delay does not reset scroll or start token processing', async () => {
    let release;
    let delayStarted;
    const waiting = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { delayStarted = resolve; });
    const context = {
        state: { ReasoningHandler: class {}, scrollLock: true },
        delay: () => { delayStarted(); return waiting; },
        rememberMainChatStreamingTransportProcessorTerminal: jest.fn(),
        mountReactMainChatMessageListPanel: jest.fn(),
        getStoppingStrings: jest.fn(),
    };
    registerGenerationShellContext(context);
    const session = new GenerationStreamSession('normal', false, new Date(), null);
    session.onStartStreaming = async () => 0;
    const pending = session.generate();
    await started;
    session.onStopStreaming();
    release();
    await expect(pending).resolves.toBe('');
    expect(context.state.scrollLock).toBe(true);
    expect(context.getStoppingStrings).not.toHaveBeenCalled();
});

test('typed stream stops before scheduling progress when a token listener cancels', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'a', contextRevision: 1 }));
    const controller = new AbortController();
    const progress = jest.fn(async () => {});
    const tick = jest.fn(async fn => fn());
    const mount = jest.fn();
    const session = {
        result: '', messageId: 0, firstMessageText: '', isStopped: false, isFinished: false,
        abortController: controller, ownsRun: () => true, createdAt: new Date(), timeToFirstToken: null,
        toolCalls: [], images: [], reasoningSignature: null, observedTokenCount: 0, observedChunkCount: 0,
        reasoningHandler: { updateReasoning: jest.fn() }, onProgressStreaming: progress,
        generator: async function* () { yield { text: 'partial', toolCalls: [] }; },
    };
    const ports = {
        stoppingStrings: () => [], createStopwatch: () => ({ tick }), refresh: jest.fn(),
        emitToken: async () => { controller.abort(); }, mount,
    };
    await expect(lifecycle.generateStream(session, ports)).resolves.toBe('partial');
    expect(tick).not.toHaveBeenCalled();
    expect(progress).not.toHaveBeenCalled();
    expect(mount).not.toHaveBeenCalled();
    expect(session.isFinished).toBe(false);
});

test('typed prompt preparation keeps token budget and send state in order', async () => {
    const calls = [];
    const result = await installedLifecycle.prepareTextPrompt({
        history: ['new', 'old'], injectedIndices: [1], story: 'story', maxContext: 100,
        isOpenAI: false, dryRun: false, tail: { quiet: '', quietToLoud: false, forceName: true, character: 'Ada' },
    }, {
        separator: text => `|${text}|`,
        countInitial: async text => { calls.push(['initial', text]); return 1; },
        countHistory: async text => { calls.push(['history', text]); return 1; },
        setContext: count => calls.push(['context', count]),
        setSending: () => calls.push(['sending']),
    });
    expect(calls).toEqual([['initial', 'story||\nAda:'], ['history', 'old'], ['history', 'new'], ['context', 1], ['sending']]);
    expect(result).toEqual({ messages: [{ message: 'old', extensionPrompts: [] }, { message: 'new\nAda:', extensionPrompts: [] }], injectedIndices: [1] });
});
