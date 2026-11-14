import { expect, jest, test } from '@jest/globals';
import { createGenerationCallerService } from '../public/scripts/generation-caller-service.js';

async function fixture() {
    const shared = await import('../public/scripts/generation-shared-state.js');
    const env = {
        ...shared,
        greetingSelectionPending: false, main_api: 'openai', generationEntryPending: false,
        pendingRegenerateRestore: null,
        chat: [{ is_user: false, is_system: false, mes: 'reply', extra: { api: 'openai' } }], chatId: 'same', revision: 1,
        getComposerSnapshot: () => ({ value: 'draft', contextRevision: env.revision }),
        createGenerationRequestEnvelope: input => input,
        generationBootstrapAdmission: { enter: () => ({ signal: new AbortController().signal, release: jest.fn() }) },
        getCurrentGenerationContextIdentity: () => ({ chatId: env.chatId, chatReference: env.chat, contextRevision: env.revision }),
        ensureGenerationRuntime: jest.fn(async () => {}),
        executeGenerationRequestInShell: jest.fn(async () => {
            env.setSnapshot({ messages: ['old'] });
            throw new Error('transport failed');
        }),
        isUserStoppedGeneration: () => false,
        restoreRegenerateTurnTail: jest.fn(),
        toastr: { warning: jest.fn(), error: jest.fn() },
        t: strings => strings[0], endPipelineRun: jest.fn(), unblockGeneration: jest.fn(),
    };
    let nextSnapshot;
    const lifecycle = {
        removeRegenerateTail: (_snapshot, ports) => { ports.register(nextSnapshot); return nextSnapshot; },
        prepareRegenerateRestore: () => ({ kind: 'ready', tail: { insertIndex: 0 } }),
        restoreRegenerateTurn: snapshot => env.restoreRegenerateTurnTail(snapshot),
    };
    const service = createGenerationCallerService({
        greetingPending: () => env.greetingSelectionPending, getComposerSnapshot: () => env.getComposerSnapshot(),
        createEnvelope: input => env.createGenerationRequestEnvelope(input), getMainApi: () => env.main_api,
        enterBootstrap: () => env.generationBootstrapAdmission.enter(), getIdentity: () => env.getCurrentGenerationContextIdentity(),
        ensureRuntime: () => env.ensureGenerationRuntime(), execute: envelope => env.executeGenerationRequestInShell(envelope),
        isUserStopped: error => env.isUserStoppedGeneration(error),
        reportRestore: restored => restored ? env.toastr.warning() : env.toastr.error(),
        endPipeline: () => env.endPipelineRun(), unblock: (...args) => env.unblockGeneration(...args),
        getChat: () => env.chat, getChatId: () => env.chatId, getNarratorType: () => 'narrator', getLifecycle: () => lifecycle,
    });
    env.setSnapshot = snapshot => { nextSnapshot = snapshot; service.removeRegenerateTurnTail(); };
    Object.defineProperty(env, 'generationEntryPending', { get: () => service.generationEntryPending });
    Object.defineProperty(env, 'pendingRegenerateRestore', { get: () => service.pendingRegenerateRestore });
    const generate = service.Generate;
    return { env, generate };
}

test('real Generate does not clean up or notify a replacement chat after an awaited regenerate restore', async () => {
    const { env, generate } = await fixture();
    let resume;
    let entered;
    const restoring = new Promise(resolve => { entered = resolve; });
    env.restoreRegenerateTurnTail.mockImplementation(async () => {
        entered();
        await new Promise(resolve => { resume = resolve; });
        return false;
    });
    const request = generate('normal', { regenerate: true });
    const failure = request.catch(error => error);
    await restoring;
    env.chat = [];
    resume();
    expect(await failure).toEqual(new Error('transport failed'));
    expect(env.toastr.warning).not.toHaveBeenCalled();
    expect(env.toastr.error).not.toHaveBeenCalled();
    expect(env.endPipelineRun).not.toHaveBeenCalled();
    expect(env.unblockGeneration).not.toHaveBeenCalled();
});

test('real Generate restores and cleans up the matching chat on regenerate failure', async () => {
    const { env, generate } = await fixture();
    env.restoreRegenerateTurnTail.mockResolvedValue(true);
    await expect(generate('normal', { regenerate: true })).rejects.toThrow('transport failed');
    expect(env.restoreRegenerateTurnTail).toHaveBeenCalledWith({ messages: ['old'] });
    expect(env.toastr.warning).toHaveBeenCalledTimes(1);
    expect(env.endPipelineRun).toHaveBeenCalledTimes(1);
    expect(env.unblockGeneration).toHaveBeenCalledWith('normal');
    expect(env.generationEntryPending).toBe(false);
});

test('a stopped regenerate skips restore but still cleans up the original chat', async () => {
    const { env, generate } = await fixture();
    env.isUserStoppedGeneration = () => true;
    await expect(generate('normal', { regenerate: true })).rejects.toThrow('transport failed');
    expect(env.restoreRegenerateTurnTail).not.toHaveBeenCalled();
    expect(env.toastr.warning).not.toHaveBeenCalled();
    expect(env.toastr.error).not.toHaveBeenCalled();
    expect(env.endPipelineRun).toHaveBeenCalledTimes(1);
    expect(env.unblockGeneration).toHaveBeenCalledWith('normal');
});

test('a late failure from an old chat does not consume the newer regenerate snapshot', async () => {
    const { env, generate } = await fixture();
    let fail;
    let started;
    const executing = new Promise(resolve => { started = resolve; });
    env.executeGenerationRequestInShell.mockImplementation(async () => {
        started();
        await new Promise((resolve, reject) => { fail = reject; });
    });
    const request = generate('normal', { regenerate: true });
    const failure = request.catch(error => error);
    await executing;
    env.chat = [{ is_user: false, is_system: false, mes: 'new', extra: { api: 'openai' } }];
    const newerSnapshot = { messages: ['new chat reply'] };
    env.setSnapshot(newerSnapshot);
    fail(new Error('old failure'));
    expect(await failure).toEqual(new Error('old failure'));
    expect(env.pendingRegenerateRestore).toBe(newerSnapshot);
    expect(env.restoreRegenerateTurnTail).not.toHaveBeenCalled();
    expect(env.endPipelineRun).not.toHaveBeenCalled();
});

test.each([
    ['normal', {}, false, true],
    ['normal', { preview: {} }, false, false],
    ['quiet', {}, false, false],
    ['quiet', { backgroundGeneration: true }, false, false],
    ['quiet', { quietToLoud: true }, false, true],
    ['normal', { depth: 1 }, false, false],
    ['normal', {}, true, false],
])('real Generate preserves admission for %s %j dryRun=%s', async (type, options, dryRun, foreground) => {
    const { env, generate } = await fixture();
    env.generationBootstrapAdmission.enter = jest.fn(() => ({ signal: new AbortController().signal, release: jest.fn() }));
    env.executeGenerationRequestInShell.mockResolvedValue('result');
    await expect(generate(type, options, dryRun)).resolves.toBe('result');
    expect(env.generationBootstrapAdmission.enter).toHaveBeenCalledTimes(foreground ? 1 : 0);
    expect(env.executeGenerationRequestInShell).toHaveBeenCalledWith(expect.objectContaining({ type, dryRun }));
});

test('real Generate drops a stopped bootstrap or replacement chat before dispatch', async () => {
    const { env, generate } = await fixture();
    const controller = new AbortController();
    env.generationBootstrapAdmission.enter = () => ({ signal: controller.signal, release: jest.fn() });
    let resume;
    env.ensureGenerationRuntime.mockImplementation(() => new Promise(resolve => { resume = resolve; }));
    const stopped = generate('normal');
    controller.abort();
    resume();
    await expect(stopped).resolves.toBeUndefined();
    expect(env.executeGenerationRequestInShell).not.toHaveBeenCalled();
    expect(env.generationEntryPending).toBe(false);
    const switched = generate('normal');
    env.chat = [];
    resume();
    await expect(switched).resolves.toBeUndefined();
    expect(env.executeGenerationRequestInShell).not.toHaveBeenCalled();
});

test('entry owner is the same function in the synchronous facade and installed typed runtime', async () => {
    const shared = await import('../public/scripts/generation-shared-state.js');
    const runtime = await import('../public/scripts/generation-typed-runtime.js');
    expect(runtime.createGenerationLifecycleService(() => ({ chatId: 'chat' })).runGenerationEntry).toBe(shared.runGenerationEntry);
});

test('quiet orchestration is owned by the synchronous typed lifecycle', async () => {
    const shared = await import('../public/scripts/generation-shared-state.js');
    const runtime = await import('../public/scripts/generation-typed-runtime.js');
    expect(typeof shared.runQuietGeneration).toBe('function');
    expect(runtime.createGenerationLifecycleService(() => ({ chatId: 'chat' })).runQuietGeneration).toBe(shared.runQuietGeneration);
});

async function quietFixture() {
    const shared = await import('../public/scripts/generation-shared-state.js');
    const hook = () => {};
    const env = {
        ...shared, main_api: 'openai', console,
        createGenerationCommand: jest.fn(input => ({ commandKind: input.kind })),
        createQuietGenerationLifecycleContract: jest.fn(input => ({ background: input.backgroundGeneration })),
        rememberMainChatQuietTransportSnapshot: jest.fn(),
        trimToEndSentence: jest.fn(value => `trim(${value})`),
        removeReasoningFromString: jest.fn(value => `reason(${value})`),
        TempResponseLength: { save: jest.fn(), setupEventHook: jest.fn(() => hook), isCustomized: jest.fn(() => true), restore: jest.fn(), removeEventHook: jest.fn() },
        isMainChatQuietTransportStopException: error => error?.name === 'AbortError',
        Generate: jest.fn(),
    };
    const identity = { chatId: 'chat', chatReference: [], contextRevision: 1 };
    const service = createGenerationCallerService({
        getMainApi: () => env.main_api, createCommand: input => env.createGenerationCommand(input),
        createQuietContract: input => env.createQuietGenerationLifecycleContract(input), rememberQuiet: value => env.rememberMainChatQuietTransportSnapshot(value),
        getResponseLength: () => 100, setResponseLength: () => {}, onceEvent: () => {}, removeEventListener: () => {},
        events: { CHAT_COMPLETION_SETTINGS_READY: 'ready' },
        trim: value => env.trimToEndSentence(value), removeReasoning: value => env.removeReasoningFromString(value), isQuietStopped: error => env.isMainChatQuietTransportStopException(error),
        greetingPending: () => false, createEnvelope: input => input, enterBootstrap: () => ({ signal: new AbortController().signal, release() {} }),
        getIdentity: () => identity, ensureRuntime: async () => {}, execute: envelope => env.Generate(envelope.type, envelope.options),
    });
    env.TempResponseLength = service.TempResponseLength;
    jest.spyOn(env.TempResponseLength, 'save');
    jest.spyOn(env.TempResponseLength, 'restore');
    jest.spyOn(env.TempResponseLength, 'removeEventHook');
    // Keep the legacy fixture's observable event hook identity.
    jest.spyOn(env.TempResponseLength, 'setupEventHook').mockImplementation(() => hook);
    const generateQuietPrompt = service.generateQuietPrompt;
    return { env, generateQuietPrompt, hook };
}

test('real quiet entry transforms completion under its lease and restores temporary length', async () => {
    const { env, generateQuietPrompt, hook } = await quietFixture();
    const ownsRun = () => true;
    const publish = jest.fn(async () => {});
    env.Generate.mockImplementation(async (type, options) => {
        expect(type).toBe('quiet');
        expect(options.backgroundGeneration).toBe(true);
        await options.onOwnedCompletion('owned', ownsRun);
        return 'answer';
    });
    await expect(generateQuietPrompt({ quietPrompt: 'q', backgroundGeneration: true, responseLength: 42, trimToSentence: true, onOwnedCompletion: publish })).resolves.toBe('reason(trim(answer))');
    expect(publish).toHaveBeenCalledWith('reason(trim(owned))', ownsRun);
    expect(env.createGenerationCommand).toHaveBeenCalledWith(expect.objectContaining({ kind: 'backgroundGeneration' }));
    expect(env.rememberMainChatQuietTransportSnapshot.mock.calls.map(([snapshot]) => snapshot.phase)).toEqual(['running', 'completed']);
    expect(env.TempResponseLength.save).toHaveBeenCalledWith('openai', 42);
    expect(env.TempResponseLength.restore).toHaveBeenCalledWith('openai');
    expect(env.TempResponseLength.removeEventHook).toHaveBeenCalledWith('openai', hook);
});

test('real quiet entry records stop and always restores temporary length', async () => {
    const { env, generateQuietPrompt, hook } = await quietFixture();
    env.Generate.mockRejectedValue(Object.assign(new Error('stopped'), { name: 'AbortError' }));
    await expect(generateQuietPrompt({ quietToLoud: true, responseLength: 10 })).rejects.toThrow('stopped');
    expect(env.rememberMainChatQuietTransportSnapshot.mock.calls.map(([snapshot]) => [snapshot.phase, snapshot.error])).toEqual([['running', ''], ['stopped', '']]);
    expect(env.TempResponseLength.removeEventHook).toHaveBeenCalledWith('openai', hook);
});

test('real quiet entry preserves positional arguments and records transport errors', async () => {
    const { env, generateQuietPrompt } = await quietFixture();
    const trace = jest.spyOn(console, 'trace').mockImplementation(() => {});
    try {
        env.Generate.mockRejectedValue(new Error('offline'));
        await expect(generateQuietPrompt('question', true, true, 'image', 'name', 20, { schema: true })).rejects.toThrow('offline');
        expect(env.Generate).toHaveBeenCalledWith('quiet', expect.objectContaining({ quiet_prompt: 'question', quietToLoud: true, skipWIAN: true, quietImage: 'image', quietName: 'name', jsonSchema: { schema: true } }));
        expect(env.rememberMainChatQuietTransportSnapshot.mock.calls.at(-1)[0]).toEqual(expect.objectContaining({ phase: 'error', error: 'offline' }));
    } finally {
        trace.mockRestore();
    }
});
