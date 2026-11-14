import { expect, jest, test } from '@jest/globals';
import { createGenerationCallerService } from '../public/scripts/generation-caller-service.js';

function fixture() {
    const listeners = new Map();
    const calls = [];
    let length = 200;
    let prompt = [{ role: 'user', content: 'hello' }];
    const events = { GENERATION_STOPPED: 'stop', CHAT_COMPLETION_SETTINGS_READY: 'settings', GENERATE_AFTER_DATA: 'data', GENERATE_AFTER_COMBINE_PROMPTS: 'combine', CHAT_COMPLETION_PROMPT_READY: 'prompt', MESSAGE_DELETED: 'deleted' };
    const ports = {
        events, getChatId: () => 'chat', getCharacterName: () => 'char', getMainApi: () => 'openai',
        getResponseLength: () => length, setResponseLength: (_api, value) => { length = value; },
        createRawPrompt: () => prompt,
        onEvent: (event, hook) => listeners.set(event, hook), onceEvent: (event, hook) => listeners.set(event, hook),
        removeEventListener: (event, hook) => { if (listeners.get(event) === hook) listeners.delete(event); },
        emitEvent: jest.fn(async (event, data) => { calls.push(event); if (event === 'prompt') data.chat.push({ role: 'system', content: 'added' }); listeners.get(event)?.(); }),
        sendOpenAIRequest: jest.fn(async () => ({ text: 'reply' })), extractJson: jest.fn(() => '{"ok":true}'),
        extractMessage: data => data.text, cleanMessage: input => input.getMessage,
        stopBootstrap: () => false, getStreamingProcessor: () => null, getAbortController: () => null,
        mountMessageList: jest.fn(),
    };
    return { ports, service: createGenerationCallerService(ports), calls, listeners, getLength: () => length, setPrompt: value => { prompt = value; } };
}

test('raw awaits prompt event, sends mutated chat once, and restores length and listeners', async () => {
    const f = fixture();
    let resume;
    const event = f.ports.emitEvent;
    f.ports.emitEvent = jest.fn(async (...args) => { await event(...args); if (args[0] === 'prompt') await new Promise(resolve => { resume = resolve; }); });
    const pending = f.service.generateRawData({ responseLength: 12 });
    await Promise.resolve();
    expect(f.getLength()).toBe(12);
    expect(f.ports.sendOpenAIRequest).not.toHaveBeenCalled();
    resume();
    await expect(pending).resolves.toEqual({ text: 'reply' });
    expect(f.ports.sendOpenAIRequest).toHaveBeenCalledTimes(1);
    expect(f.ports.sendOpenAIRequest.mock.calls[0][1]).toHaveLength(2);
    expect(f.getLength()).toBe(200);
    expect(f.listeners.size).toBe(0);
});

test('stop during raw prompt event cancels dispatch and cleans up', async () => {
    const f = fixture();
    let resume;
    f.ports.emitEvent = jest.fn(async event => { if (event === 'prompt') await new Promise(resolve => { resume = resolve; }); else f.listeners.get(event)?.(); });
    const pending = f.service.generateRawData({ responseLength: 8 });
    const rejection = expect(pending).rejects.toThrow('Cancelled by extension');
    expect(f.service.stopGeneration()).toBe(false);
    resume();
    await rejection;
    expect(f.ports.sendOpenAIRequest).not.toHaveBeenCalled();
    expect(f.getLength()).toBe(200);
    expect(f.listeners.size).toBe(0);
});

test('raw text event, JSON extraction and raw formatting preserve their contracts', async () => {
    const f = fixture();
    f.setPrompt('prompt');
    await expect(f.service.generateRawData({ jsonSchema: { returnInvalid: true } })).resolves.toBe('{"ok":true}');
    expect(f.calls).toEqual(['combine']);
    expect(f.ports.extractJson).toHaveBeenCalledWith({ text: 'reply' }, { mainApi: 'openai', returnInvalidJson: true });
    await expect(f.service.generateRaw()).resolves.toBe('reply');
    f.ports.sendOpenAIRequest.mockResolvedValueOnce({ error: true, response: 'bad' });
    await expect(f.service.generateRawData()).rejects.toThrow('bad');
});

test('stop remains synchronous, stops stream and controller, then emits stop', () => {
    const f = fixture();
    const processor = { onStopStreaming: jest.fn() };
    const controller = new AbortController();
    f.ports.getStreamingProcessor = () => processor;
    f.ports.getAbortController = () => controller;
    f.ports.rememberProcessorTerminal = jest.fn();
    f.ports.hideStopButton = jest.fn();
    expect(f.service.stopGeneration()).toBe(true);
    expect(controller.signal.aborted).toBe(true);
    expect(processor.onStopStreaming).toHaveBeenCalledTimes(1);
    expect(f.ports.rememberProcessorTerminal).toHaveBeenCalledWith(processor, 'stopped');
    expect(f.ports.mountMessageList).toHaveBeenCalledTimes(1);
    expect(f.calls).toEqual(['stop']);
});

test('regenerate and entry gates stay owned until the live request finishes', async () => {
    const f = fixture();
    let release;
    let started;
    const executing = new Promise(resolve => { started = resolve; });
    const chat = [{ is_user: true, is_system: false, mes: 'question' }];
    const identity = { chatId: 'chat', chatReference: chat, contextRevision: 1 };
    Object.assign(f.ports, {
        greetingPending: () => false, isSending: () => false, getEditId: () => undefined,
        isConnected: () => true, hasCharacter: () => true, getChat: () => chat,
        getComposerSnapshot: () => ({ value: 'draft' }), createEnvelope: input => input,
        enterBootstrap: () => ({ signal: new AbortController().signal, release() {} }),
        getIdentity: () => identity, ensureRuntime: async () => {},
        execute: async () => { started(); await new Promise(resolve => { release = resolve; }); },
    });
    expect(f.service.canRegenerateLastReply()).toBe(true);
    const first = f.service.regenerateLastReply();
    await executing;
    expect(f.service.generationEntryPending).toBe(true);
    expect(f.service.regenerateRequestInFlight).toBe(true);
    expect(f.service.canRegenerateLastReply()).toBe(false);
    await expect(f.service.regenerateLastReply()).resolves.toBe(false);
    release();
    await expect(first).resolves.toBe(true);
    expect(f.service.generationEntryPending).toBe(false);
    expect(f.service.regenerateRequestInFlight).toBe(false);
});
