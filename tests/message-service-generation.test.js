import { beforeEach, expect, jest, test } from '@jest/globals';
import { loadTsModule } from './helpers/load-ts-module.mjs';

const emit = jest.fn(async () => {});
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
const { saveReply } = await import('../public/scripts/message-service.js');
const { registerGenerationShellContext, installGenerationLifecycleService } = await import('../public/scripts/generation-shell-context.js');
const { GenerationStreamSession, getCurrentGenerationContextIdentity } = await import('../public/scripts/generation-service.js');
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
