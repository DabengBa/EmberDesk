import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { buildRawGenerationPrompt, createGenerationCallerService } from '../public/scripts/generation-caller-service.js';

const source = readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');

function shellFixture() {
    const listeners = new Map();
    const state = {
        AbortController, console, buildRawGenerationPrompt, createGenerationCallerService,
        event_types: { GENERATION_STOPPED: 'stop', CHAT_COMPLETION_PROMPT_READY: 'prompt', CHAT_COMPLETION_SETTINGS_READY: 'settings' },
        eventSource: {
            on: (key, handler) => listeners.set(key, handler), once: (key, handler) => listeners.set(key, handler),
            removeListener: (key, handler) => { if (listeners.get(key) === handler) listeners.delete(key); },
            emit: jest.fn(async key => listeners.get(key)?.()),
        },
        main_api: 'openai', name2: 'Alice', oai_settings: { openai_max_tokens: 200 }, amount_gen: 80,
        getCurrentChatId: () => 'chat-a', substituteParams: text => text.replaceAll('{{char}}', 'Alice'),
        sendOpenAIRequest: jest.fn(async () => ({ text: 'reply' })),
        generationBootstrapAdmission: { stop: () => false }, streamingProcessor: null, abortController: null,
        mountReactMainChatMessageListPanel: jest.fn(),
    };
    const start = source.indexOf('const generationCaller = createGenerationCallerService({');
    const end = source.indexOf('//MARK: Generate() ends', start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const service = runInNewContext(`${source.slice(start, end)}; generationCaller;`, state);
    state.generationCaller = service;
    const wrappers = {};
    for (const name of ['generateRawData', 'createRawPrompt', 'stopGeneration']) {
        const match = source.match(new RegExp(`export (?:async )?function ${name}\\([^\\n]*\\) \\{\\n[\\s\\S]*?\\n}`));
        expect(match).not.toBeNull();
        wrappers[name] = runInNewContext(`(${match[0].replace('export ', '')})`, state);
    }
    return { state, service, wrappers, listeners };
}

test('the production raw wrapper uses the single caller and live shell ports', async () => {
    const { state, wrappers, service, listeners } = shellFixture();
    state.name2 = 'Bob';
    state.getCurrentChatId = () => 'chat-b';
    await wrappers.generateRawData({ prompt: '{{char}}', responseLength: 12 });
    expect(state.sendOpenAIRequest).toHaveBeenCalledTimes(1);
    expect(state.sendOpenAIRequest.mock.calls[0][1]).toEqual([{ role: 'user', content: 'Alice' }]);
    expect(state.sendOpenAIRequest.mock.calls[0][3].trace).toEqual({ type: 'quiet', chatId: 'chat-b', charName: 'Bob' });
    expect(state.oai_settings.openai_max_tokens).toBe(200);
    expect(service.TempResponseLength.isCustomized()).toBe(false);
    expect(listeners.size).toBe(0);
});

test('the production stop wrapper stays synchronous before a React bundle is available', () => {
    const { state, wrappers } = shellFixture();
    const controller = new AbortController();
    state.abortController = controller;
    state.hideStopButton = jest.fn();
    state.rememberMainChatStreamingTransportVisibleTerminal = jest.fn();
    expect(wrappers.stopGeneration()).toBe(true);
    expect(controller.signal.aborted).toBe(true);
    expect(state.mountReactMainChatMessageListPanel).toHaveBeenCalledTimes(1);
});

test('raw prompt construction preserves substitution, array identity and compatibility arguments', () => {
    const { wrappers } = shellFixture();
    const prompt = [{ role: 'user', content: '{{char}}' }];
    expect(wrappers.createRawPrompt(prompt, 'openai', true, true, ' system ', '{{char}}')).toBe(prompt);
    expect(prompt).toEqual([{ role: 'system', content: 'system' }, { role: 'user', content: 'Alice' }, { role: 'assistant', content: 'Alice' }]);
    expect(wrappers.createRawPrompt('  hello  ', 'openai')).toEqual([{ role: 'user', content: 'hello' }]);
    expect(() => wrappers.createRawPrompt([], 'openai')).toThrow('No messages provided');
});
