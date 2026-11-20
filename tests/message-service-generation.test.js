import { beforeEach, expect, jest, test } from '@jest/globals';
import { loadTsModule } from './helpers/load-ts-module.mjs';
import { readFileSync } from 'node:fs';

const emit = jest.fn(async () => {});
const notificationInfo = jest.fn();
jest.unstable_mockModule('../public/scripts/notifications.js', () => ({ default: { info: notificationInfo } }));
jest.unstable_mockModule('../public/scripts/events.js', () => ({ eventSource: { emit }, event_types: { MESSAGE_RECEIVED: 'received', CHARACTER_MESSAGE_RENDERED: 'rendered' } }));
jest.unstable_mockModule('../public/scripts/chat-message-render-descriptor.js', () => ({ buildChatMessageRenderDescriptor: jest.fn(), buildChatMessageRowPopulation: jest.fn() }));
jest.unstable_mockModule('../public/scripts/chat-message-render-service.js', () => ({ buildChatMessageRichBodyRender: jest.fn() }));
jest.unstable_mockModule('../public/scripts/frontend-frame.js', () => ({ isFrontendContent: jest.fn() }));
jest.unstable_mockModule('../public/scripts/external-media-policy.js', () => ({ isCharacterExternalMediaAllowed: jest.fn() }));
jest.unstable_mockModule('../public/scripts/message-css-policy.js', () => ({ filterMessageInlineStyles: jest.fn() }));
jest.unstable_mockModule('../public/scripts/utils.js', () => ({ uuidv4: () => 'id' }));
jest.unstable_mockModule('../public/scripts/world-info-service.js', () => ({ getWorldInfoPrompt: jest.fn() }));
jest.unstable_mockModule('../public/scripts/chat-memory-service.js', () => ({ applyChatMemoryToCoreChat: jest.fn() }));
jest.unstable_mockModule('../public/scripts/i18n.js', () => ({ t: strings => strings[0] }));
jest.unstable_mockModule('../public/scripts/openai.js', () => ({ oai_settings: {} }));
jest.unstable_mockModule('../public/scripts/feature-settings.js', () => ({ feature_settings: { tool_bindings: [] } }));
jest.unstable_mockModule('../public/scripts/tool-bindings.js', () => ({ syncPipelineToolBindings: jest.fn() }));
const { registerMessageShellContext } = await import('../public/scripts/message-shell-context.js');
const { addCopyToCodeBlocks, addOneMessage, appendMediaToMessage, saveReply } = await import('../public/scripts/message-service.js');
const { createUserMessageService } = await import('../public/scripts/user-message-service.js');
const { registerGenerationShellContext, installGenerationLifecycleService } = await import('../public/scripts/generation-shell-context.js');
const { GenerationStreamSession, getCurrentGenerationContextIdentity, updateEditArrowClasses } = await import('../public/scripts/generation-service.js');
const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
installGenerationLifecycleService(createGenerationLifecycleService(getCurrentGenerationContextIdentity));

let state, saveBase64AsFile, saveImageToMessage, mount;
beforeEach(() => {
    emit.mockReset().mockResolvedValue(undefined);
    state = { chat: [], name2: 'Assistant' };
    saveBase64AsFile = jest.fn();
    saveImageToMessage = jest.fn();
    mount = jest.fn();
    globalThis.$ = jest.fn(() => ({}));
    globalThis.requestAnimationFrame = jest.fn(() => 1);
    globalThis.cancelAnimationFrame = jest.fn();
    registerMessageShellContext({ state, getGeneratingApi: () => 'api', getGeneratingModel: () => 'model', getMessageTimeStamp: () => 'now',
        onlyUnique: () => true, isDataURL: value => value.startsWith('data:'), saveBase64AsFile, saveImageToMessage,
        isReactMainChatOwner: () => true, mountReactMainChatMessageListPanel: mount });
});

test('React user message pipeline saves, emits, and renders without requesting a jQuery return value', async () => {
    const calls = [];
    globalThis.$ = () => { throw Error('React message insertion must not use jQuery'); };
    const service = createUserMessageService({
        getChat: () => state.chat,
        getComposerSnapshot: () => ({ contextKey: 'chat', contextRevision: 1 }),
        regexUserInput: text => text, timestamp: () => 'now', substitute: text => text,
        uuid: () => 'new-message', removeMacros: text => text,
        populateAttachment: async () => { calls.push('attachment'); },
        taint: () => { calls.push('taint'); }, save: async () => { calls.push('save'); },
        emitSent: async id => { calls.push(`sent:${id}`); },
        emitRendered: async id => { calls.push(`rendered:${id}`); },
        addMessage: addOneMessage,
    });
    const message = await service.sendMessageAsUser('hello', '', null, false, 'User');
    expect(state.chat).toEqual([message]);
    expect(calls).toEqual(['attachment', 'taint', 'save', 'sent:0', 'rendered:0']);
    expect(mount).toHaveBeenCalledTimes(1);
    expect(globalThis.requestAnimationFrame).toHaveBeenCalledTimes(1);
});

test('React addOneMessage returns no legacy collection and respects scroll opt-out', () => {
    globalThis.$ = () => { throw Error('React message insertion must not use jQuery'); };
    const message = { mes: 'hello' };
    state.chat.push(message);
    expect(addOneMessage(message, { scroll: false })).toBeUndefined();
    expect(mount).toHaveBeenCalledTimes(1);
    expect(globalThis.requestAnimationFrame).not.toHaveBeenCalled();
});

test('React message insertion scrolls a native chat root when the animation frame runs', () => {
    globalThis.$ = () => { throw Error('React message insertion must not use jQuery'); };
    const root = { nodeType: 1, scrollHeight: 375, scrollTop: 0 };
    state.chatElement = root;
    const message = { mes: 'hello' };
    state.chat.push(message);
    addOneMessage(message);
    expect(mount).toHaveBeenCalledTimes(1);
    globalThis.requestAnimationFrame.mock.calls.at(-1)[0]();
    expect(root.scrollTop).toBe(375);
});

test('legacy edit controls honor first and last visible message without jQuery collection methods', () => {
    const makeRow = id => {
        const buttons = Object.fromEntries(['down', 'up', 'copy', 'delete'].map(name => {
            const classes = new Set(['disabled']);
            return [`.mes_edit_${name}`, { classes, classList: { remove: value => classes.delete(value), toggle: (value, enabled) => enabled ? classes.add(value) : classes.delete(value) } }];
        }));
        return { matches: selector => selector === '.mes', getAttribute: () => String(id), querySelectorAll: selector => selector.split(', ').flatMap(part => buttons[part] ? [buttons[part]] : []), buttons };
    };
    const rows = [makeRow(3), makeRow(4), makeRow(5)];
    const root = { children: rows, querySelectorAll: selector => selector === '.mes' ? rows : [] };
    state.chatElement = root;
    state.this_edit_mes_id = 3;
    registerGenerationShellContext({ state, isReactMainChatOwner: () => false });
    updateEditArrowClasses();
    expect(rows[0].buttons['.mes_edit_up'].classes.has('disabled')).toBe(true);
    expect(rows[0].buttons['.mes_edit_down'].classes.has('disabled')).toBe(false);
    expect(rows[0].buttons['.mes_edit_copy'].classes.has('disabled')).toBe(false);
    expect(rows[0].buttons['.mes_edit_delete'].classes.has('disabled')).toBe(false);
    state.this_edit_mes_id = 5;
    updateEditArrowClasses();
    expect(rows[2].buttons['.mes_edit_up'].classes.has('disabled')).toBe(false);
    expect(rows[2].buttons['.mes_edit_down'].classes.has('disabled')).toBe(true);
    state.chatElement = root;
    state.this_edit_mes_id = 4;
    updateEditArrowClasses();
    expect(rows[1].buttons['.mes_edit_up'].classes.has('disabled')).toBe(false);
    expect(rows[1].buttons['.mes_edit_down'].classes.has('disabled')).toBe(false);
});

test('edit control update leaves React-owned rows alone', () => {
    state.this_edit_mes_id = 0;
    state.chatElement = { get children() { throw Error('React owner must not touch rows'); } };
    registerGenerationShellContext({ state, isReactMainChatOwner: () => true });
    expect(() => updateEditArrowClasses()).not.toThrow();
});

test('native message preview adds copy action without requiring jQuery', async () => {
    const listeners = {};
    const button = { classList: { add: jest.fn() }, addEventListener: (type, listener) => { listeners[type] = listener; } };
    const code = { textContent: 'const value = 1;', closest: () => ({ textContent: 'const value = 1;' }), appendChild: jest.fn() };
    const root = { querySelectorAll: jest.fn(() => [code]) };
    const copyText = jest.fn(async () => {});

    state.hljs = { highlightElement: jest.fn() };
    registerMessageShellContext({ state, copyText, t: strings => strings[0] });
    globalThis.$ = () => { throw new Error('jQuery must not be used for a native preview'); };
    globalThis.document = { createElement: jest.fn(() => button) };

    try {
        addCopyToCodeBlocks(root);
        expect(root.querySelectorAll).toHaveBeenCalledWith('pre code');
        expect(state.hljs.highlightElement).toHaveBeenCalledWith(code);
        expect(code.appendChild).toHaveBeenCalledWith(button);
        const stopPropagation = jest.fn();
        listeners.click({ stopPropagation });
        expect(stopPropagation).toHaveBeenCalled();
        await listeners.pointerup();
        expect(copyText).toHaveBeenCalledWith('const value = 1;');
        expect(notificationInfo).toHaveBeenCalled();
    } finally {
        delete globalThis.document;
    }
});

test('revisiting a code block does not add a second copy button', () => {
    let added;
    const button = { classList: { add: jest.fn() }, addEventListener: jest.fn() };
    const code = { textContent: 'code', closest: () => ({ textContent: 'code' }),
        querySelector: selector => selector === '.code-copy' ? added : null,
        appendChild: child => { added = child; } };
    state.hljs = { highlightElement: jest.fn() };
    globalThis.document = { createElement: jest.fn(() => button) };
    try {
        const root = { querySelectorAll: () => [code] };
        addCopyToCodeBlocks(root);
        addCopyToCodeBlocks(root);
        expect(globalThis.document.createElement).toHaveBeenCalledTimes(1);
        expect(state.hljs.highlightElement).toHaveBeenCalledTimes(1);
    } finally { delete globalThis.document; }
});

test('copy remains usable while lazy highlighting is pending and after load failure', async () => {
    let reject;
    const pending = new Promise((resolve, fail) => { reject = fail; });
    const listeners = {};
    const button = { classList: { add: jest.fn() }, addEventListener: (type, listener) => { listeners[type] = listener; } };
    const code = { className: 'language-rust', parentNode: { className: '' }, dataset: {}, textContent: 'fn main() {}',
        closest: () => ({ textContent: 'fn main() {}' }), appendChild: jest.fn() };
    const copyText = jest.fn(async () => {});
    state.hljs = { getLanguage: () => false, highlightElement: jest.fn(), loadAllLanguages: () => pending };
    registerMessageShellContext({ state, copyText, t: strings => strings[0] });
    globalThis.document = { createElement: () => button };
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
        addCopyToCodeBlocks({ querySelectorAll: () => [code] });
        await listeners.pointerup();
        expect(copyText).toHaveBeenCalledWith('fn main() {}');
        reject(Error('offline'));
        await Promise.resolve();
        await Promise.resolve();
        await listeners.pointerup();
        expect(copyText).toHaveBeenCalledTimes(2);
        expect(warn).toHaveBeenCalled();
    } finally { warn.mockRestore(); delete globalThis.document; }
});

test('native message row highlights code blocks once in document order without jQuery traversal', () => {
    const code = position => ({ position, closest: () => ({ textContent: 'code' }), appendChild: jest.fn(),
        compareDocumentPosition(other) { return this.position < other.position ? 4 : 2; } });
    const first = code(1), second = code(2);
    const row = { querySelectorAll: selector => selector === 'pre code' ? [first, second] : [] };
    const button = { classList: { add: jest.fn() }, addEventListener: jest.fn() };
    state.hljs = { highlightElement: jest.fn() };
    globalThis.$ = () => { throw Error('native row must not be wrapped'); };
    globalThis.document = { createElement: () => button };
    try {
        addCopyToCodeBlocks(row);
        expect(state.hljs.highlightElement.mock.calls).toEqual([[first], [second]]);
        expect(first.appendChild).toHaveBeenCalledWith(button);
        expect(second.appendChild).toHaveBeenCalledWith(button);
    } finally {
        delete globalThis.document;
    }
});

test('empty or disconnected native message rows preserve call order without jQuery', () => {
    const first = { closest: () => null, appendChild: jest.fn(), compareDocumentPosition: () => 1 };
    const second = { closest: () => null, appendChild: jest.fn(), compareDocumentPosition: () => 1 };
    const button = { classList: { add: jest.fn() }, addEventListener: jest.fn() };
    state.hljs = { highlightElement: jest.fn() };
    globalThis.$ = () => { throw Error('must not use jQuery'); };
    globalThis.document = { createElement: () => button };
    try {
        addCopyToCodeBlocks(null);
        addCopyToCodeBlocks({ querySelectorAll: () => [second] });
        addCopyToCodeBlocks({ querySelectorAll: () => [first] });
        expect(state.hljs.highlightElement.mock.calls).toEqual([[second], [first]]);
    } finally {
        delete globalThis.document;
    }
});

test('React swipe reaches the real media service without a global jQuery binding', async () => {
    const source = readFileSync(new URL('../public/scripts/chats.js', import.meta.url), 'utf8');
    const code = source.slice(source.indexOf('async function onImageSwiped('), source.indexOf('\nlet openAttachmentPicker'));
    const refresh = jest.fn();
    const save = jest.fn(async () => {});
    const row = { querySelector: () => null };
    const message = { extra: { media: [{ url: 'a' }, { url: 'b' }], media_index: 0 } };
    state.chat = [message];
    registerMessageShellContext({ state, isReactMainChatOwner: () => true, scheduleMainChatMessageListPanelRefresh: refresh });
    const event = jest.fn(async () => {});
    const env = { chat: state.chat, getMediaIndex: () => 0, getMediaDisplay: () => 'gallery',
        MEDIA_DISPLAY: { GALLERY: 'gallery' }, SWIPE_DIRECTION: { LEFT: 'left', RIGHT: 'right' },
        eventSource: { emit: event }, event_types: { IMAGE_SWIPED: 'image_swiped' },
        saveChatConditional: save, appendMediaToMessage, console: { warn: jest.fn() } };
    const swipe = new Function(...Object.keys(env), `${code}; return onImageSwiped;`)(...Object.values(env));
    const previousJQuery = globalThis.$;
    delete globalThis.$;
    try {
        await swipe(0, row, 'right');
        expect(event).toHaveBeenCalledWith('image_swiped', { message, element: row, direction: 'right' });
        expect(message.extra.media_index).toBe(1);
        expect(save).toHaveBeenCalledTimes(1);
        expect(refresh).toHaveBeenCalledTimes(1);
    } finally {
        globalThis.$ = previousJQuery;
    }
});

test('media refresh accepts a native message row for React and the legacy template path', () => {
    const fileWrapper = { replaceChildren: jest.fn() };
    const mediaWrapper = { replaceChildren: jest.fn() };
    const row = { nodeType: 1, removeAttribute: jest.fn(), querySelectorAll: selector => ({ '.mes_file_wrapper': [fileWrapper], '.mes_media_wrapper': [mediaWrapper] })[selector] ?? [] };
    const refresh = jest.fn();
    registerMessageShellContext({ state, isReactMainChatOwner: () => true, scheduleMainChatMessageListPanelRefresh: refresh });
    globalThis.$ = () => { throw Error('React media refresh must not wrap the row'); };
    appendMediaToMessage({ extra: {} }, row);
    expect(refresh).toHaveBeenCalledTimes(1);

    globalThis.$ = jest.fn(() => { throw Error('legacy media refresh must not wrap the row'); });
    registerMessageShellContext({ state, isReactMainChatOwner: () => false });
    appendMediaToMessage({ extra: {} }, row);
    expect(globalThis.$).not.toHaveBeenCalled();
    expect(fileWrapper.replaceChildren).toHaveBeenCalledTimes(1);
    expect(mediaWrapper.replaceChildren).toHaveBeenCalledTimes(1);
});

test('late image conversion after chat switch neither attaches nor publishes a reply', async () => {
    let release;
    saveBase64AsFile.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const oldChat = state.chat;
    let owned = true;
    const pending = saveReply({ type: 'normal', getMessage: 'old reply', imageUrls: ['data:image/png;base64,YQ=='], ownsRun: () => owned });
    owned = false;
    const newChat = [{ mes: 'new chat' }];
    state.chat = newChat;
    release('/image.png');
    await pending;
    expect(oldChat).toEqual([]);
    expect(newChat).toEqual([{ mes: 'new chat' }]);
    expect(saveImageToMessage).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
    expect(mount).not.toHaveBeenCalled();
});

test('stop during MESSAGE_RECEIVED prevents stale rendering and rendered event', async () => {
    let release;
    emit.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    let owned = true;
    const pending = saveReply({ type: 'normal', getMessage: 'reply', ownsRun: () => owned });
    await Promise.resolve();
    expect(emit).toHaveBeenCalledWith('received', 0, 'normal');
    owned = false;
    release();
    await pending;
    expect(mount).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledTimes(1);
});

test('owned reply publishes normally in event order', async () => {
    await expect(saveReply({ type: 'normal', getMessage: ' hello ', ownsRun: () => true })).resolves.toEqual({ type: 'normal', getMessage: 'hello' });
    expect(state.chat).toHaveLength(1);
    expect(state.chat[0].mes).toBe('hello');
    expect(emit.mock.calls).toEqual([['received', 0, 'normal'], ['rendered', 0, 'normal']]);
    expect(mount).toHaveBeenCalledTimes(1);
});

test('streaming reply attaches image and renders without non-stream events', async () => {
    saveBase64AsFile.mockResolvedValue('/image.png');
    await saveReply({ type: 'normal', getMessage: '...', fromStreaming: true, imageUrls: ['data:image/png;base64,YQ=='], ownsRun: () => true });
    expect(saveImageToMessage).toHaveBeenCalledWith({ image: '/image.png', inline: true }, state.chat[0]);
    expect(mount).toHaveBeenCalledTimes(1);
    expect(emit).not.toHaveBeenCalled();
});

test('saveReply exposes the exact committed message to recovery without changing its return value', async () => {
    const onMessageCreated = jest.fn();
    await expect(saveReply({ type: 'normal', getMessage: '', fromStreaming: true, onMessageCreated })).resolves.toEqual({ type: 'normal', getMessage: '' });
    expect(onMessageCreated).toHaveBeenCalledWith(state.chat[0]);
});

test('real stream session passes live ownership to real saveReply', async () => {
    state.ReasoningHandler = class {};
    registerGenerationShellContext({ state, saveReply });
    let owned = true;
    const session = new GenerationStreamSession('normal', false, new Date(), null, () => owned);
    const pending = session.onStartStreaming('...');
    owned = false;
    await expect(pending).resolves.toBe(-1);
    expect(state.chat).toEqual([]);
    expect(mount).not.toHaveBeenCalled();
});

test('recovery replacement does not mutate the prior message when image conversion loses ownership', async () => {
    const { replaceGenerationRecoveryMessage } = await import('../public/scripts/message-service.js');
    const original = { mes: 'original', extra: { media: ['existing'] } };
    state.chat.push(original);
    let release;
    saveBase64AsFile.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    let owned = true;
    const render = jest.fn();
    const pending = replaceGenerationRecoveryMessage(0, { type: 'normal', getMessage: 'recovered', imageUrls: ['data:image/png;base64,YQ=='], ownsRun: () => owned, render });
    owned = false;
    release('/image.png');
    await pending;
    expect(original).toEqual({ mes: 'original', extra: { media: ['existing'] } });
    expect(render).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
});

test('recovery replacement stops after received event if ownership is lost', async () => {
    const { replaceGenerationRecoveryMessage } = await import('../public/scripts/message-service.js');
    state.chat.push({ mes: 'original', extra: {} });
    let release;
    emit.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    let owned = true;
    const pending = replaceGenerationRecoveryMessage(0, { type: 'normal', getMessage: 'recovered', ownsRun: () => owned, render: jest.fn() });
    await new Promise(resolve => setImmediate(resolve));
    owned = false;
    release();
    await pending;
    expect(emit.mock.calls).toEqual([['received', 0, 'normal']]);
});

test('owned recovery replacement updates the existing message and emits in order', async () => {
    const { replaceGenerationRecoveryMessage } = await import('../public/scripts/message-service.js');
    const message = { mes: 'original', extra: {} };
    state.chat.push(message);
    const render = jest.fn();
    const result = await replaceGenerationRecoveryMessage(0, { type: 'normal', getMessage: 'recovered', ownsRun: () => true, render });
    expect(result).toEqual({ type: 'normal', getMessage: 'recovered' });
    expect(state.chat[0]).toBe(message);
    expect(message.mes).toBe('recovered');
    expect(render).toHaveBeenCalledWith(message, 0);
    expect(emit.mock.calls).toEqual([['received', 0, 'normal'], ['rendered', 0, 'normal']]);
});
