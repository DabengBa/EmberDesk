import { beforeEach, expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { loadTsModule } from './helpers/load-ts-module.mjs';

const events = { emit: jest.fn(async () => {}) };
jest.unstable_mockModule('../public/scripts/events.js', () => ({ eventSource: events, event_types: { GENERATION_STARTED: 'started', GENERATION_AFTER_COMMANDS: 'commands' } }));
jest.unstable_mockModule('../public/scripts/world-info-service.js', () => ({ getWorldInfoPrompt: jest.fn() }));
jest.unstable_mockModule('../public/scripts/chat-memory-service.js', () => ({ applyChatMemoryToCoreChat: jest.fn() }));
jest.unstable_mockModule('../public/scripts/i18n.js', () => ({ t: strings => strings[0] }));
jest.unstable_mockModule('../public/scripts/openai.js', () => ({ oai_settings: {} }));
jest.unstable_mockModule('../public/scripts/feature-settings.js', () => ({ feature_settings: { tool_bindings: [] } }));
jest.unstable_mockModule('../public/scripts/tool-bindings.js', () => ({ syncPipelineToolBindings: jest.fn() }));
const composer = await import('../public/scripts/main-chat-composer-service.js');
const { registerGenerationShellContext, installGenerationLifecycleService } = await import('../public/scripts/generation-shell-context.js');
const { executeGenerationRequestInShell, previewNextGenerationRequest, GenerationStreamSession, getCurrentGenerationContextIdentity } = await import('../public/scripts/generation-service.js');
const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
installGenerationLifecycleService(createGenerationLifecycleService(getCurrentGenerationContextIdentity));

let context;
let submission;
beforeEach(() => {
    events.emit.mockReset().mockResolvedValue(undefined);
    composer.setComposerDraftContext('submission-chat');
    composer.setComposerValue('submitted text');
    submission = composer.getComposerSnapshot();
    context = {
        state: { main_api: 'openai', online_status: 'connected', characters: [], chat: [], chat_metadata: {}, name2: 'Original', oai_settings: { send_if_empty: '' } },
        processCommands: jest.fn(async () => false),
        unshallowCharacter: jest.fn(async () => {}),
        pingServer: async () => true,
        getBiasStrings: () => ({ messageBias: '', promptBias: '' }),
        hasPendingFileAttachment: () => false,
        // Stop at the user-message boundary; no model or downstream assembly is needed.
        sendMessageAsUser: jest.fn(async () => { throw new Error('user-message-boundary'); }),
        unblockGeneration: jest.fn(),
    };
    registerGenerationShellContext(new Proxy(context, { get: (obj, key) => obj[key] ?? jest.fn() }));
});

function generate() {
    return executeGenerationRequestInShell({ type: 'normal', options: { composerSubmission: submission }, dryRun: false });
}

test('stopping while a preview user message is being built discards the stale preview', async () => {
    context.state.main_api = 'unsupported';
    const controller = new AbortController();
    let enter, release;
    const entered = new Promise(resolve => { enter = resolve; });
    const waiting = new Promise(resolve => { release = resolve; });
    context.buildUserMessage = jest.fn(async () => { enter(); await waiting; return { mes: 'pending' }; });
    const pending = executeGenerationRequestInShell({ type: 'normal', options: { preview: {}, signal: controller.signal }, dryRun: true });
    await Promise.race([entered, pending.then(() => { throw new Error('preview ended before user-message preparation'); })]);
    controller.abort();
    release();
    await expect(pending).resolves.toBeUndefined();
});

test('preview preparation does not invoke a global prompt accessor while writing its private depth prompt', async () => {
    const { getWorldInfoPrompt } = await import('../public/scripts/world-info-service.js');
    const { applyChatMemoryToCoreChat } = await import('../public/scripts/chat-memory-service.js');
    const getter = jest.fn(() => ({ value: 'external' }));
    const prompts = {};
    Object.defineProperty(prompts, 'external', { enumerable: true, configurable: true, get: getter });
    getWorldInfoPrompt.mockImplementationOnce(async () => { throw new Error('scan-boundary'); });
    applyChatMemoryToCoreChat.mockImplementation(items => ({ items, summarized: [] }));
    Object.assign(context.state, {
        extension_prompts: prompts, extension_prompt_types: { IN_CHAT: 1, IN_PROMPT: 2 },
        regex_placement: { USER_INPUT: 1, AI_OUTPUT: 2, REASONING: 3 }, PromptReasoning: class {},
        ToolManager: { canPerformToolCalls: () => false, isToolCallingSupported: () => false, RECURSE_LIMIT: 10 },
    });
    context.getCharacterCardFields = () => ({});
    context.getExtensionPromptRoleByName = () => 0;
    context.setExtensionPrompt = (key, value, _position, _depth, _scan, _role, _filter, map = prompts) => { map[key] = { value }; };
    context.substituteParams = value => value;
    await expect(previewNextGenerationRequest()).rejects.toThrow('scan-boundary');
    expect(getter).not.toHaveBeenCalled();
});

test('preview scanner cannot mutate inherited nested prompt data in the global map', async () => {
    const { getWorldInfoPrompt } = await import('../public/scripts/world-info-service.js');
    const { applyChatMemoryToCoreChat } = await import('../public/scripts/chat-memory-service.js');
    const entry = { value: 'global', metadata: { labels: ['original'] }, filter: () => true };
    entry.metadata.self = entry.metadata;
    getWorldInfoPrompt.mockImplementationOnce(async (...args) => {
        const copy = args.at(-1).promptMap.inherited;
        expect(copy.filter).toBe(entry.filter);
        expect(copy.metadata.self).toBe(copy.metadata);
        copy.metadata.labels.push('preview-only');
        throw new Error('scan-boundary');
    });
    applyChatMemoryToCoreChat.mockImplementation(items => ({ items, summarized: [] }));
    Object.assign(context.state, {
        extension_prompts: { inherited: entry }, extension_prompt_types: { IN_CHAT: 1, IN_PROMPT: 2 },
        regex_placement: { USER_INPUT: 1, AI_OUTPUT: 2, REASONING: 3 }, PromptReasoning: class {},
        ToolManager: { canPerformToolCalls: () => false, isToolCallingSupported: () => false, RECURSE_LIMIT: 10 },
    });
    context.getCharacterCardFields = () => ({});
    context.getExtensionPromptRoleByName = () => 0;
    context.setExtensionPrompt = (key, value, _position, _depth, _scan, _role, _filter, map = context.state.extension_prompts) => { map[key] = { value }; };
    context.substituteParams = value => value;
    await expect(previewNextGenerationRequest()).rejects.toThrow('scan-boundary');
    expect(entry.metadata.labels).toEqual(['original']);
});

test('a scoped async generation listener contributes to preview World Info without a global write', async () => {
    const { getWorldInfoPrompt } = await import('../public/scripts/world-info-service.js');
    const { applyChatMemoryToCoreChat } = await import('../public/scripts/chat-memory-service.js');
    let seen;
    events.emit.mockImplementation(async (type, _generationType, options) => {
        if (type === 'started') {
            await Promise.resolve();
            options.promptContext.setWorldInfoScanPrompt('scoped-listener', 'scoped trigger', 1, 0, true);
        }
    });
    getWorldInfoPrompt.mockImplementationOnce(async (...args) => {
        seen = args.at(-1)?.promptMap;
        throw new Error('scan-boundary');
    });
    applyChatMemoryToCoreChat.mockImplementation(items => ({ items, summarized: [] }));
    Object.assign(context.state, {
        extension_prompts: {}, extension_prompt_types: { IN_CHAT: 1, IN_PROMPT: 2 },
        regex_placement: { USER_INPUT: 1, AI_OUTPUT: 2, REASONING: 3 }, PromptReasoning: class {},
        ToolManager: { canPerformToolCalls: () => false, isToolCallingSupported: () => false, RECURSE_LIMIT: 10 },
    });
    context.getCharacterCardFields = () => ({});
    context.getExtensionPromptRoleByName = () => 0;
    context.setExtensionPrompt = (key, value, _position, _depth, scan, _role, _filter, promptMap = context.state.extension_prompts) => { promptMap[key] = { value, scan }; };
    context.substituteParams = value => value;
    await expect(previewNextGenerationRequest()).rejects.toThrow('scan-boundary');
    expect(seen['scoped-listener']).toEqual({ value: 'scoped trigger', scan: true });
    expect(context.state.extension_prompts['scoped-listener']).toBeUndefined();
});

test('a nested background request from an async preview listener keeps request maps separate', async () => {
    const { getWorldInfoPrompt } = await import('../public/scripts/world-info-service.js');
    const { applyChatMemoryToCoreChat } = await import('../public/scripts/chat-memory-service.js');
    const seen = [];
    let nested = false;
    events.emit.mockImplementation(async (type, _generationType, options) => {
        if (type !== 'started') return;
        await Promise.resolve();
        options.promptContext.setWorldInfoScanPrompt('request-id', nested ? 'inner' : 'outer', 1, 0, true);
        if (!nested) {
            nested = true;
            await expect(executeGenerationRequestInShell({ type: 'quiet', options: { backgroundGeneration: true, depth: 1 }, dryRun: false })).rejects.toThrow('scan-boundary');
        }
    });
    getWorldInfoPrompt.mockImplementation(async (...args) => {
        seen.push(args.at(-1).promptMap['request-id'].value);
        throw new Error('scan-boundary');
    });
    applyChatMemoryToCoreChat.mockImplementation(items => ({ items, summarized: [] }));
    Object.assign(context.state, {
        extension_prompts: {}, extension_prompt_types: { IN_CHAT: 1, IN_PROMPT: 2 },
        regex_placement: { USER_INPUT: 1, AI_OUTPUT: 2, REASONING: 3 }, PromptReasoning: class {},
        ToolManager: { canPerformToolCalls: () => false, isToolCallingSupported: () => false, RECURSE_LIMIT: 10 },
    });
    context.getCharacterCardFields = () => ({});
    context.getExtensionPromptRoleByName = () => 0;
    context.setExtensionPrompt = (key, value, _position, _depth, scan, _role, _filter, promptMap = context.state.extension_prompts) => { promptMap[key] = { value, scan }; };
    context.substituteParams = value => value;
    await expect(previewNextGenerationRequest()).rejects.toThrow('scan-boundary');
    expect(seen).toEqual(['inner', 'outer']);
    expect(context.state.extension_prompts['request-id']).toBeUndefined();
});

test('legacy asynchronous generation listener prompt reaches preview scan', async () => {
    const { getWorldInfoPrompt } = await import('../public/scripts/world-info-service.js');
    const { applyChatMemoryToCoreChat } = await import('../public/scripts/chat-memory-service.js');
    let seen;
    events.emit.mockImplementation(async type => {
        if (type === 'started') {
            await Promise.resolve();
            context.setExtensionPrompt('legacy-listener', 'listener value', 1, 0, true);
        }
    });
    getWorldInfoPrompt.mockImplementationOnce(async (...args) => {
        seen = args.at(-1)?.promptMap ?? context.state.extension_prompts;
        throw new Error('scan-boundary');
    });
    applyChatMemoryToCoreChat.mockImplementation(items => ({ items, summarized: [] }));
    Object.assign(context.state, {
        extension_prompts: {}, extension_prompt_types: { IN_CHAT: 1, IN_PROMPT: 2 },
        regex_placement: { USER_INPUT: 1, AI_OUTPUT: 2, REASONING: 3 }, PromptReasoning: class {},
        ToolManager: { canPerformToolCalls: () => false, isToolCallingSupported: () => false, RECURSE_LIMIT: 10 },
    });
    context.getCharacterCardFields = () => ({});
    context.getExtensionPromptRoleByName = () => 0;
    context.setExtensionPrompt = (key, value, _position, _depth, _scan, _role, _filter, promptMap = context.state.extension_prompts) => { promptMap[key] = { value }; };
    context.substituteParams = value => value;
    await expect(previewNextGenerationRequest()).rejects.toThrow('scan-boundary');
    expect(seen['legacy-listener']?.value).toBe('listener value');
});

test.each(['same chat', 'replacement chat'])('preview request prompts are isolated from concurrent consumers in %s', async mode => {
    const { getWorldInfoPrompt } = await import('../public/scripts/world-info-service.js');
    const { applyChatMemoryToCoreChat } = await import('../public/scripts/chat-memory-service.js');
    let release, enter, observedByScan;
    const entered = new Promise(resolve => { enter = resolve; });
    const waiting = new Promise(resolve => { release = resolve; });
    getWorldInfoPrompt.mockImplementationOnce(async (...args) => {
        observedByScan = args.at(-1)?.promptMap ?? context.state.extension_prompts;
        enter();
        await waiting;
        throw new Error('scan-boundary');
    });
    applyChatMemoryToCoreChat.mockImplementation(items => ({ items, summarized: [] }));
    Object.assign(context.state, {
        extension_prompts: {}, extension_prompt_types: { IN_CHAT: 1, IN_PROMPT: 2 },
        regex_placement: { USER_INPUT: 1, AI_OUTPUT: 2, REASONING: 3 }, PromptReasoning: class {},
        ToolManager: { canPerformToolCalls: () => false, isToolCallingSupported: () => false, RECURSE_LIMIT: 10 },
    });
    context.getCharacterCardFields = () => ({ charDepthPrompt: 'preview-private' });
    context.getExtensionPromptRoleByName = () => 0;
    context.setExtensionPrompt = (key, value, _position, _depth, _scan, _role, _filter, promptMap = context.state.extension_prompts) => { promptMap[key] = { value }; };
    context.substituteParams = value => value;
    events.emit.mockImplementation(async type => {
        if (type === 'started') {
            await Promise.resolve();
            context.setExtensionPrompt('listener', 'listener-owned', 1, 0, true);
        }
    });
    const outcome = previewNextGenerationRequest().catch(error => error);
    await Promise.race([entered, outcome.then(error => { throw error ?? new Error('preview ended before scan'); })]);
    if (mode === 'replacement chat') context.state.chat = [];
    const concurrentDepth = context.state.extension_prompts.DEPTH_PROMPT?.value;
    const listenerValue = observedByScan.listener?.value;
    context.state.extension_prompts.concurrent = { value: 'other request' };
    release();
    expect((await outcome).message).toBe('scan-boundary');
    expect(listenerValue).toBe('listener-owned');
    expect(context.state.extension_prompts.concurrent?.value).toBe('other request');
    expect(concurrentDepth).toBeUndefined();
});

test('real chat injection uses its request map without exposing it to the global caller', async () => {
    const source = readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');
    const start = source.indexOf('async function doChatInject(');
    const end = source.indexOf('\n/**', start);
    const globalPrompts = { DEPTH_PROMPT: { value: 'global', position: 1, depth: 0, role: 0 } };
    const localPrompts = { DEPTH_PROMPT: { value: 'preview', position: 1, depth: 0, role: 0 } };
    const getPrompt = async (_position, _depth, _separator, role, _wrap, map) => role === 0 ? map.DEPTH_PROMPT.value : '';
    const inject = new Function('extension_prompts', 'getExtensionPromptMaxDepth', 'getExtensionPrompt',
        'extension_prompt_roles', 'extension_prompt_types', 'name1', 'name2', 'system_message_types',
        `${source.slice(start, end)}\nreturn doChatInject;`)(
        globalPrompts, () => 0, getPrompt, { SYSTEM: 0, USER: 1, ASSISTANT: 2 }, { IN_CHAT: 1 }, 'user', 'char', { NARRATOR: 'narrator' },
    );
    const preview = [{ mes: 'hello' }];
    const live = [{ mes: 'hello' }];
    await Promise.all([inject(preview, localPrompts), inject(live)]);
    expect(preview.map(message => message.mes)).toContain('preview');
    expect(live.map(message => message.mes)).toContain('global');
    expect(live.map(message => message.mes)).not.toContain('preview');
});

test('preview depth prompt is not visible to concurrent consumers before cleanup', async () => {
    const { getWorldInfoPrompt } = await import('../public/scripts/world-info-service.js');
    const { applyChatMemoryToCoreChat } = await import('../public/scripts/chat-memory-service.js');
    let release, enter;
    const entered = new Promise(resolve => { enter = resolve; });
    const waiting = new Promise(resolve => { release = resolve; });
    getWorldInfoPrompt.mockImplementationOnce(async () => { enter(); await waiting; throw new Error('scan-boundary'); });
    applyChatMemoryToCoreChat.mockImplementation(items => ({ items, summarized: [] }));
    Object.assign(context.state, {
        extension_prompts: {}, extension_prompt_types: { IN_CHAT: 1, IN_PROMPT: 2 },
        regex_placement: { USER_INPUT: 1, AI_OUTPUT: 2, REASONING: 3 }, PromptReasoning: class {},
        ToolManager: { canPerformToolCalls: () => false, isToolCallingSupported: () => false, RECURSE_LIMIT: 10 },
    });
    context.getCharacterCardFields = () => ({ charDepthPrompt: 'preview-only depth' });
    context.getExtensionPromptRoleByName = () => 0;
    context.setExtensionPrompt = (key, value, _position, _depth, _scan, _role, _filter, promptMap = context.state.extension_prompts) => { promptMap[key] = { value }; };
    context.substituteParams = value => value;
    const outcome = previewNextGenerationRequest().catch(error => error);
    await Promise.race([entered, outcome.then(error => { throw error ?? new Error('preview ended before scan'); })]);
    const observed = context.state.extension_prompts.DEPTH_PROMPT?.value;
    release();
    expect((await outcome).message).toBe('scan-boundary');
    expect(observed).toBeUndefined();
    expect(context.state.extension_prompts.DEPTH_PROMPT).toBeUndefined();
});

test.each([
    ['same chat', false], ['same chat', true], ['replacement chat', false], ['replacement chat', true],
    ['same chat', 'mutated'], ['replacement chat', 'mutated'],
    ['same chat', 'nested'], ['replacement chat', 'nested'],
])('preview preserves concurrent prompts and removes its temporary keys in %s (depth replaced=%s)', async (mode, replaceDepth) => {
    const { getWorldInfoPrompt } = await import('../public/scripts/world-info-service.js');
    const { applyChatMemoryToCoreChat } = await import('../public/scripts/chat-memory-service.js');
    let release, enter;
    const entered = new Promise(resolve => { enter = resolve; });
    const waiting = new Promise(resolve => { release = resolve; });
    getWorldInfoPrompt.mockImplementationOnce(async () => {
        enter();
        await waiting;
        throw new Error('stop-at-world-info-boundary');
    });
    applyChatMemoryToCoreChat.mockImplementation(items => ({ items, summarized: [] }));
    Object.assign(context.state, {
        extension_prompts: { external: { value: 'before' } },
        extension_prompt_types: { IN_CHAT: 1, IN_PROMPT: 2 },
        regex_placement: { USER_INPUT: 1, AI_OUTPUT: 2, REASONING: 3 },
        PromptReasoning: class {},
        ToolManager: { canPerformToolCalls: () => false, isToolCallingSupported: () => false, RECURSE_LIMIT: 10 },
    });
    context.getCharacterCardFields = () => ({ charDepthPrompt: 'preview depth' });
    context.getExtensionPromptRoleByName = () => 0;
    context.setExtensionPrompt = (key, value, _position, _depth, _scan, _role, _filter, promptMap = context.state.extension_prompts) => { promptMap[key] = { value }; };
    context.substituteParams = value => value;
    const pending = previewNextGenerationRequest();
    const outcome = pending.catch(error => error);
    await Promise.race([entered, outcome.then(error => { throw error ?? new Error('preview ended before scan'); })]);
    context.state.extension_prompts.external = { value: 'concurrent' };
    context.state.extension_prompts.newExternal = { value: 'concurrent new' };
    if (replaceDepth === 'mutated') {
        context.state.extension_prompts.DEPTH_PROMPT = { value: 'before' };
        context.state.extension_prompts.DEPTH_PROMPT.value = 'concurrent depth';
    } else if (replaceDepth === 'nested') {
        context.state.extension_prompts.DEPTH_PROMPT = { value: 'external depth', metadata: { owner: 'before' } };
        context.state.extension_prompts.DEPTH_PROMPT.metadata.owner = 'concurrent';
    }
    else if (replaceDepth) context.state.extension_prompts.DEPTH_PROMPT = { value: 'concurrent depth' };
    if (mode === 'replacement chat') context.state.chat = [];
    release();
    expect((await outcome).message).toBe('stop-at-world-info-boundary');
    expect(context.state.extension_prompts).toEqual({
        external: { value: 'concurrent' }, newExternal: { value: 'concurrent new' },
        ...(replaceDepth === 'nested' ? { DEPTH_PROMPT: { value: 'external depth', metadata: { owner: 'concurrent' } } }
            : replaceDepth ? { DEPTH_PROMPT: { value: 'concurrent depth' } } : {}),
    });
});

test('a preview waiting on character loading does not restore prompts over a replacement chat', async () => {
    let release;
    let entered;
    const waiting = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { entered = resolve; });
    context.state.extension_prompts = { chatPrompt: { value: 'old' } };
    context.unshallowCharacter.mockImplementation(async () => { entered(); await waiting; });
    const preview = previewNextGenerationRequest();
    await started;
    context.state.chat = [];
    context.state.extension_prompts.chatPrompt = { value: 'new' };
    context.state.extension_prompts.newPrompt = { value: 'new' };
    release();
    await preview;
    expect(context.state.extension_prompts).toEqual({ chatPrompt: { value: 'new' }, newPrompt: { value: 'new' } });
});

test('offline generation clears the sending flag without submitting a message', async () => {
    context.state.online_status = 'no_connection';
    context.state.is_send_press = true;
    await generate();
    expect(context.state.is_send_press).toBe(false);
    expect(context.sendMessageAsUser).not.toHaveBeenCalled();
});

test('slash-prefixed text is submitted as an ordinary user message', async () => {
    composer.setComposerValue('/echo text');
    submission = composer.getComposerSnapshot();
    context.processCommands.mockResolvedValue(true);
    await expect(generate()).rejects.toThrow('user-message-boundary');
    expect(context.sendMessageAsUser.mock.calls[0][0]).toBe('/echo text');
    expect(context.processCommands).not.toHaveBeenCalled();
    expect(events.emit.mock.calls.slice(0, 2).map(([name]) => name)).toEqual(['started', 'commands']);
});

test('explicit submission survives an assembly await without consuming later typing', async () => {
    context.unshallowCharacter.mockImplementation(async () => composer.setComposerValue('new draft'));
    await expect(generate()).rejects.toThrow('user-message-boundary');
    expect(context.processCommands).not.toHaveBeenCalled();
    expect(context.sendMessageAsUser.mock.calls[0][0]).toBe('submitted text');
    expect(composer.getComposerValue()).toBe('new draft');
});

test('unchanged submitted draft is consumed exactly once', async () => {
    await expect(generate()).rejects.toThrow('user-message-boundary');
    expect(context.sendMessageAsUser).toHaveBeenCalledTimes(1);
    expect(composer.getComposerValue()).toBe('');
});

test('switching away and back during assembly cancels the old submission', async () => {
    context.unshallowCharacter.mockImplementation(async () => {
        composer.setComposerDraftContext('other-chat');
        composer.setComposerValue('other draft');
        composer.setComposerDraftContext('submission-chat');
        // Real chat loading mutates the same array, including on a return to A.
        context.state.chat.splice(0, context.state.chat.length);
    });
    await generate();
    expect(context.sendMessageAsUser).not.toHaveBeenCalled();
    expect(composer.getComposerValue()).toBe('submitted text');
});

test('attachment completion after switching away and back cannot append the old message', async () => {
    const source = readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');
    const start = source.indexOf('export async function sendMessageAsUser(');
    const end = source.indexOf('\n/**\n * Gets the maximum context token limit', start);
    let release;
    const wait = new Promise(resolve => { release = resolve; });
    const chat = [];
    const run = new Function('chat', 'chat_metadata', 'name1', 'getComposerSnapshot', 'buildUserMessage', 'populateFileAttachment',
        'saveChatConditional', 'eventSource', 'event_types', 'reloadCurrentChat', 'addOneMessage',
        `${source.slice(start, end).replace('export async', 'async')}\nreturn sendMessageAsUser;`)(
        chat, {}, 'user', composer.getComposerSnapshot, async () => ({ mes: 'old' }), async () => wait,
        async () => {}, { emit: async () => {} }, {}, async () => {}, () => {},
    );
    const pending = run('old', '');
    await Promise.resolve();
    composer.setComposerDraftContext('other-chat');
    composer.setComposerDraftContext('submission-chat');
    chat.splice(0, chat.length);
    release();
    await pending;
    expect(chat).toEqual([]);
});

test.each([['switch', null], ['stop', null], ['switch', 0], ['stop', 0]])('queued user message save is cancelled after %s (insertAt=%s)', async (action, insertAt) => {
    const source = readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');
    const start = source.indexOf('export async function sendMessageAsUser(');
    const end = source.indexOf('\n/**\n * Gets the maximum context token limit', start);
    let release;
    let queued;
    const waiting = new Promise(resolve => { release = resolve; });
    const entered = new Promise(resolve => { queued = resolve; });
    const saved = [];
    const chat = [];
    const controller = new AbortController();
    const save = async (predicate = () => true) => {
        queued();
        await waiting;
        if (predicate()) saved.push([...chat]);
    };
    const run = new Function('chat', 'chat_metadata', 'name1', 'getComposerSnapshot', 'buildUserMessage', 'populateFileAttachment',
        'saveChatConditional', 'eventSource', 'event_types', 'reloadCurrentChat', 'addOneMessage',
        `${source.slice(start, end).replace('export async', 'async')}\nreturn sendMessageAsUser;`)(
        chat, {}, 'user', composer.getComposerSnapshot, async () => ({ mes: 'old' }), async () => {},
        save, { emit: async () => {} }, {}, async () => {}, () => {},
    );
    const pending = run('old', '', insertAt, false, 'user', { signal: controller.signal });
    await entered;
    if (action === 'switch') {
        composer.setComposerDraftContext('other-chat');
        chat.splice(0, chat.length, { mes: 'new chat' });
    } else controller.abort();
    release();
    await pending;
    expect(saved).toEqual([]);
});

test.each([null, 0])('current user message is saved and published (insertAt=%s)', async insertAt => {
    const source = readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');
    const start = source.indexOf('export async function sendMessageAsUser(');
    const end = source.indexOf('\n/**\n * Gets the maximum context token limit', start);
    const chat = [];
    const saved = [];
    const emit = jest.fn(async () => {});
    const run = new Function('chat', 'chat_metadata', 'name1', 'getComposerSnapshot', 'buildUserMessage', 'populateFileAttachment',
        'saveChatConditional', 'eventSource', 'event_types', 'reloadCurrentChat', 'addOneMessage',
        `${source.slice(start, end).replace('export async', 'async')}\nreturn sendMessageAsUser;`)(
        chat, {}, 'user', composer.getComposerSnapshot, async () => ({ mes: 'hello' }), async () => {},
        async predicate => { if (predicate()) saved.push([...chat]); }, { emit },
        { MESSAGE_SENT: 'sent', USER_MESSAGE_RENDERED: 'rendered' }, async () => {}, () => {},
    );
    await run('hello', '', insertAt);
    expect(saved).toEqual([[{ mes: 'hello' }]]);
    expect(emit.mock.calls.map(([name]) => name)).toEqual(['sent', 'rendered']);
});

test('stop during the first await does not recreate a live request', async () => {
    context.unshallowCharacter.mockImplementation(async () => context.state.abortController?.abort());
    await generate();
    expect(context.processCommands).not.toHaveBeenCalled();
    expect(context.sendMessageAsUser).not.toHaveBeenCalled();
    expect(composer.getComposerValue()).toBe('submitted text');
});


test.each([false, true])('streaming updates React state without writing legacy message HTML (owner=%s)', async owner => {
    class Element {}
    const previousElement = globalThis.HTMLElement;
    const previousDocument = globalThis.document;
    const text = Object.assign(new Element(), { innerHTML: 'original' });
    const row = Object.assign(new Element(), { querySelector: selector => selector === '.mes_text' ? text : null });
    globalThis.HTMLElement = Element;
    globalThis.document = { querySelector: () => row };
    context.state.chat = [{ mes: '', name: 'Assistant', extra: {} }];
    context.state.scrollLock = true;
    context.state.ReasoningHandler = class {
        updateDom() {}
        async process() {}
        getDuration() { return 0; }
    };
    context.cleanUpMessage = ({ getMessage }) => getMessage;
    context.countOccurrences = () => 0;
    context.isOdd = () => false;
    context.isReactMainChatOwner = () => owner;
    context.messageFormatting = jest.fn(() => '<img src=x onerror=alert(1)>');
    context.formatGenerationTimer = () => ({ timerValue: '', timerTitle: '' });
    context.scheduleMainChatMessageListPanelRefresh = jest.fn();
    try {
        const session = new GenerationStreamSession('normal', false, new Date(), null);
        await session.onProgressStreaming(0, 'streamed text', true);
        expect(context.state.chat[0].mes).toBe('streamed text');
        expect(text.innerHTML).toBe('original');
        expect(context.messageFormatting).not.toHaveBeenCalled();
        expect(context.scheduleMainChatMessageListPanelRefresh).toHaveBeenCalled();
    } finally {
        globalThis.HTMLElement = previousElement;
        globalThis.document = previousDocument;
    }
});

const chatsSource = readFileSync(new URL('../public/scripts/chats.js', import.meta.url), 'utf8');
const attachmentSource = chatsSource.slice(chatsSource.indexOf('export async function populateFileAttachment'), chatsSource.indexOf('\n/**\n * Uploads file to the server.'));
function attachmentHarness() {
    class Input {}
    const original = { name: 'original.png', type: 'image/png', size: 10 };
    const input = Object.assign(new Input(), { files: [original] });
    const reset = jest.fn();
    let release;
    const read = new Promise(resolve => { release = resolve; });
    const save = jest.fn(async () => '/old.png');
    const env = {
        document: { getElementById: () => input }, HTMLInputElement: Input,
        getStringHash: () => 'test', getBase64Async: () => read, getFileExtension: () => 'png',
        MEDIA_TYPE: { getFromMime: () => 'image' }, MEDIA_SOURCE: { UPLOAD: 'upload' },
        saveBase64AsFile: save, name2: 'Original character', $: () => ({ trigger: reset }),
        toastr: { error: jest.fn() }, t: strings => strings[0], console,
    };
    const run = new Function(...Object.keys(env), `${attachmentSource.replace('export ', '')}; return populateFileAttachment;`)(...Object.values(env));
    return { input, original, reset, save, release, run };
}

test('upload completion leaves a replacement attachment selected', async () => {
    const h = attachmentHarness();
    const pending = h.run({}, 'file_form_input', { isCurrent: () => true });
    h.input.files = [{ name: 'new.png' }];
    h.release('data:image/png;base64,YQ==');
    await pending;
    expect(h.save).toHaveBeenCalledWith('YQ==', 'Original character', expect.any(String), 'png');
    expect(h.reset).not.toHaveBeenCalled();
});

test('upload completion after chat switch leaves the attachment form intact', async () => {
    const h = attachmentHarness();
    let current = true;
    const pending = h.run({}, 'file_form_input', { isCurrent: () => current });
    current = false;
    h.release('data:image/png;base64,YQ==');
    await pending;
    expect(h.reset).not.toHaveBeenCalled();
});

test('upload resets the exact attachment selection it consumed', async () => {
    const h = attachmentHarness();
    const pending = h.run({}, 'file_form_input', { isCurrent: () => true });
    h.release('data:image/png;base64,YQ==');
    await pending;
    expect(h.reset).toHaveBeenCalledTimes(1);
});
