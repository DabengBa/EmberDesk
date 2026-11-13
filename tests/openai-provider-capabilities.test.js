import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, jest, test } from '@jest/globals';
import { loadTsModule } from './helpers/load-ts-module.mjs';

import {
    getChatCompletionModelFromSettings,
    isAudioInliningSupportedForSettings,
    isImageInliningSupportedForSettings,
    isVideoInliningSupportedForSettings,
    resolveChatCompletionModel,
    resolveReasoningEffort,
    resolveVerbosity,
    isChatCompletionStreaming,
} from '../public/scripts/openai-provider-capabilities.js';
import { getFallbackProviderStatus } from '../public/scripts/provider-secret-field-state.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const SOURCES = {
    OPENAI: 'openai',
};

test('stream mode follows the actual attempt model, not the preset model', () => {
    const preset = settings({ openai_model: 'o1', stream_openai: true });
    expect(isChatCompletionStreaming(preset, 'gpt-4o-mini', 'normal')).toBe(true);
    expect(isChatCompletionStreaming(preset, 'o1', 'normal')).toBe(false);
    expect(isChatCompletionStreaming(preset, 'gpt-4o-mini', 'quiet')).toBe(false);
});

function settings(overrides = {}) {
    return {
        chat_completion_source: SOURCES.OPENAI,
        openai_model: 'gpt-5.2',
        reasoning_effort: 'high',
        verbosity: 'auto',
        media_inlining: true,
        ...overrides,
    };
}

describe('OpenAI provider capability helpers', () => {
    test('keeps the fallback model field persistent under the four-field contract', () => {
        const source = fs.readFileSync(path.join(repoRoot, 'public/scripts/openai.js'), 'utf8');

        // The field survives in the preset map (NULL_SELECTOR: no drawer input
        // exists anymore; the React Providers tab owns the control).
        expect(source).toContain("fallback_provider_model: ['#NULL_SELECTOR', 'fallback_provider_model', false, false]");
        expect(source).toContain("fallback_provider_model: ''");

        // Retired two-endpoint fields keep no bindings, defaults, or send-path use.
        // (The load-time migration still reads the legacy literals to clean them.)
        for (const retired of [
            "fallback_provider_enabled: ['#",
            "fallback_provider_base_url: ['#",
            'fallback_provider_enabled: false',
            "fallback_provider_base_url: ''",
            'fallback_provider_api_key',
            'oai_settings.proxy_password',
            'oai_settings.reverse_proxy',
            'oai_settings.custom_include_body',
            'oai_settings.custom_exclude_body',
            'oai_settings.custom_include_headers',
            'oai_settings.bind_preset_to_connection',
            'syncProxies',
            'validateReverseProxy',
        ]) {
            expect(source).not.toContain(retired);
        }
        // The retired reverse_proxy URL still folds into custom_url during load-time cleanup.
        expect(source).toContain('settings.custom_url = settings.reverse_proxy;');
        expect(source).toContain("delete settings[key]");
    });

    test('marks fallback ready from the model alone; the primary key covers it', () => {
        const source = fs.readFileSync(path.join(repoRoot, 'public/scripts/openai.js'), 'utf8');

        expect(getFallbackProviderStatus({
            fallback_provider_model: 'fallback-model',
        })).toMatchObject({ state: 'ready', ready: true });
        expect(getFallbackProviderStatus({
            fallback_provider_model: '   ',
        })).toMatchObject({ state: 'disabled', ready: false });
        expect(getFallbackProviderStatus({})).toMatchObject({ state: 'disabled', ready: false });

        // Fallback reuses the primary secret; no dedicated key handling remains.
        expect(source).not.toContain('SECRET_KEYS.OPENAI_FALLBACK');
        expect(source).not.toContain('openai_secret_marker');
    });

    test('builds fallback requests as a model-only override on the primary connection', () => {
        const source = fs.readFileSync(path.join(repoRoot, 'public/scripts/openai.js'), 'utf8');

        expect(source).toContain('requestSettings.openai_model = getFallbackOpenAIModel(oai_settings);');
        expect(source).not.toContain('buildFallbackOpenAIRequestOverrides');
        expect(source).not.toContain('openai_secret_marker');
        expect(source).not.toContain('requestSettings.reverse_proxy');
        expect(source).not.toContain('requestSettings.proxy_password');
        expect(source).not.toContain('requestSettings.custom_url =');
    });

    test('rejects a connection without credentials before issuing a request', async () => {
        const { connectProvider } = await loadTsModule('app/lib/provider-connection-service.ts');
        const dependencies = { fetch: jest.fn(), requestHeaders: jest.fn() };
        await expect(connectProvider({ customUrl: '', openaiModel: 'model', hasSavedSecret: false }, dependencies))
            .rejects.toThrow('Save an API key or configure a custom endpoint URL first.');
        expect(dependencies.fetch).not.toHaveBeenCalled();
        expect(dependencies.requestHeaders).not.toHaveBeenCalled();
    });

    test('rejects missing test credentials and model before issuing a request', async () => {
        const { testProviderConnection } = await loadTsModule('app/lib/provider-connection-service.ts');
        const dependencies = { fetch: jest.fn(), requestHeaders: jest.fn() };
        await expect(testProviderConnection({ customUrl: '', openaiModel: 'model', hasSavedSecret: false }, dependencies))
            .rejects.toThrow('Save an API key or configure a custom endpoint URL first.');
        await expect(testProviderConnection({ customUrl: '', openaiModel: ' ', hasSavedSecret: true }, dependencies))
            .rejects.toThrow('Fill in the primary model before testing.');
        expect(dependencies.fetch).not.toHaveBeenCalled();
        expect(dependencies.requestHeaders).not.toHaveBeenCalled();
    });

    test('bounds test requests to 15 seconds, aborts and cleans up the timer', async () => {
        const { testProviderConnection } = await loadTsModule('app/lib/provider-connection-service.ts');
        jest.useFakeTimers();
        try {
            const fetch = jest.fn((_url, { signal }) => new Promise((_resolve, reject) => {
                signal.addEventListener('abort', () => reject(new Error('private details')));
            }));
            const pending = testProviderConnection(
                { customUrl: 'https://example.invalid', openaiModel: 'model', hasSavedSecret: false },
                { fetch, requestHeaders: () => ({}) },
            );
            const result = expect(pending).rejects.toThrow('API connection test timed out.');
            await jest.advanceTimersByTimeAsync(14999);
            expect(fetch).toHaveBeenCalledTimes(1);
            expect(fetch.mock.calls[0][1].signal.aborted).toBe(false);
            await jest.advanceTimersByTimeAsync(1);
            await result;
            expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
            expect(jest.getTimerCount()).toBe(0);
        } finally {
            jest.useRealTimers();
        }
    });

    test('resolves model descriptors with structured capability fields', () => {
        const descriptor = resolveChatCompletionModel(settings(), { mainApi: 'openai' });

        expect(descriptor).toEqual({
            source: SOURCES.OPENAI,
            model: 'gpt-5.2',
            capabilities: {
                vision: true,
                video: false,
                audio: false,
                reasoning: true,
            },
        });

        expect(Object.keys(descriptor.capabilities)).toEqual(['vision', 'video', 'audio', 'reasoning']);
    });

    test('keeps provider-specific model selection compatible with current settings', () => {
        expect(getChatCompletionModelFromSettings(settings({ chat_completion_source: SOURCES.OPENAI }))).toBe('gpt-5.2');
        expect(getChatCompletionModelFromSettings(settings({ chat_completion_source: 'makersuite' }))).toBe('');
        expect(getChatCompletionModelFromSettings(settings({ chat_completion_source: 'unknown' }))).toBe('');
    });

    test('resolves current reasoning effort aliases and official OpenAI effort values', () => {
        expect(resolveReasoningEffort(settings({ reasoning_effort: 'auto' }), 'gpt-5.2')).toBeUndefined();
        expect(resolveReasoningEffort(settings({ reasoning_effort: 'min' }), 'gpt-5.5-2026-04-23')).toBe('none');
        expect(resolveReasoningEffort(settings({ reasoning_effort: 'min' }), 'gpt-5')).toBe('min');
        expect(resolveReasoningEffort(settings({ reasoning_effort: 'min' }), 'gpt-4o')).toBe('low');
        expect(resolveReasoningEffort(settings({ reasoning_effort: 'max' }), 'gpt-5.2')).toBe('high');
        expect(resolveReasoningEffort(settings({ reasoning_effort: 'none' }), 'gpt-5.2')).toBe('none');
        expect(resolveReasoningEffort(settings({ reasoning_effort: 'minimal' }), 'gpt-5.2')).toBe('minimal');
        expect(resolveReasoningEffort(settings({ reasoning_effort: 'xhigh' }), 'gpt-5.2')).toBe('xhigh');
    });

    test('passes through unknown-source reasoning effort behavior', () => {
        expect(resolveReasoningEffort(settings({
            chat_completion_source: 'legacy-source',
            reasoning_effort: 'medium',
        }))).toBe('medium');
    });

    test('resolves verbosity without changing auto omission behavior', () => {
        expect(resolveVerbosity(settings({ verbosity: 'auto' }))).toBeUndefined();
        expect(resolveVerbosity(settings({ verbosity: 'low' }))).toBe('low');
        expect(resolveVerbosity(settings({ verbosity: 'high' }))).toBe('high');
    });

    test('keeps media support split by type and gated by main api and setting', () => {
        const geminiViaOpenAi = settings({ openai_model: 'gemini-2.5-pro' });
        expect(isImageInliningSupportedForSettings(geminiViaOpenAi, { mainApi: 'openai' })).toBe(true);
        expect(isVideoInliningSupportedForSettings(geminiViaOpenAi, { mainApi: 'openai' })).toBe(false);
        expect(isAudioInliningSupportedForSettings(geminiViaOpenAi, { mainApi: 'openai' })).toBe(true);

        expect(isImageInliningSupportedForSettings(settings({ media_inlining: false }), { mainApi: 'openai' })).toBe(false);
        expect(isImageInliningSupportedForSettings(settings(), { mainApi: 'kobold' })).toBe(false);
        expect(isAudioInliningSupportedForSettings(settings({ openai_model: 'gpt-4o-mini-audio' }), { mainApi: 'openai' })).toBe(true);
        expect(isVideoInliningSupportedForSettings(settings({ openai_model: 'gpt-5.2' }), { mainApi: 'openai' })).toBe(false);
    });

    test('keeps descriptor capabilities independent from the media inlining toggle', () => {
        const descriptor = resolveChatCompletionModel(settings({ media_inlining: false }), { mainApi: 'openai' });

        expect(descriptor.capabilities.vision).toBe(true);
        expect(isImageInliningSupportedForSettings(settings({ media_inlining: false }), { mainApi: 'openai' })).toBe(false);
    });

    test('excludes OpenAI image models blocked by the current vision rule', () => {
        for (const openai_model of ['gpt-4-turbo-preview', 'o1-mini', 'o3-mini']) {
            const descriptor = resolveChatCompletionModel(settings({ openai_model }), { mainApi: 'openai' });

            expect(descriptor.capabilities.vision).toBe(false);
            expect(isImageInliningSupportedForSettings(settings({ openai_model }), { mainApi: 'openai' })).toBe(false);
        }
    });
});
