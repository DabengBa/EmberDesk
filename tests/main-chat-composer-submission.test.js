import { beforeEach, expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const events = { emit: jest.fn(async () => {}) };
jest.unstable_mockModule('../public/scripts/events.js', () => ({ eventSource: events, event_types: { GENERATION_STARTED: 'started', GENERATION_AFTER_COMMANDS: 'commands' } }));
jest.unstable_mockModule('../public/scripts/world-info-service.js', () => ({ getWorldInfoPrompt: jest.fn() }));
jest.unstable_mockModule('../public/scripts/chat-memory-service.js', () => ({ applyChatMemoryToCoreChat: jest.fn() }));
jest.unstable_mockModule('../public/scripts/i18n.js', () => ({ t: strings => strings[0] }));
jest.unstable_mockModule('../public/scripts/openai.js', () => ({ oai_settings: {} }));
jest.unstable_mockModule('../public/scripts/feature-settings.js', () => ({ feature_settings: { tool_bindings: [] } }));
jest.unstable_mockModule('../public/scripts/tool-bindings.js', () => ({ syncPipelineToolBindings: jest.fn() }));
const composer = await import('../public/scripts/main-chat-composer-service.js');
const { registerGenerationShellContext } = await import('../public/scripts/generation-shell-context.js');
const { executeGenerationRequestInShell } = await import('../public/scripts/generation-service.js');

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

test('explicit submission survives an assembly await without consuming later typing', async () => {
    context.unshallowCharacter.mockImplementation(async () => composer.setComposerValue('new draft'));
    await expect(generate()).rejects.toThrow('user-message-boundary');
    expect(context.processCommands).toHaveBeenCalledWith('submitted text', submission);
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

test('stop during the first await does not recreate a live request', async () => {
    context.unshallowCharacter.mockImplementation(async () => context.state.abortController?.abort());
    await generate();
    expect(context.processCommands).not.toHaveBeenCalled();
    expect(context.sendMessageAsUser).not.toHaveBeenCalled();
    expect(composer.getComposerValue()).toBe('submitted text');
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
