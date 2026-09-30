import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from '@jest/globals';

import {
    getChatCompletionModelFromSettings,
    isAudioInliningSupportedForSettings,
    isImageInliningSupportedForSettings,
    isVideoInliningSupportedForSettings,
    resolveChatCompletionModel,
    resolveReasoningEffort,
    resolveVerbosity,
} from '../public/scripts/openai-provider-capabilities.js';
import { getFallbackProviderStatus } from '../public/scripts/provider-secret-field-state.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const SOURCES = {
    OPENAI: 'openai',
};

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

        expect(source).toContain("fallback_provider_model: ['#fallback_provider_model', 'fallback_provider_model', false, false]");
        expect(source).toContain("fallback_provider_model: ''");
        expect(source).toContain('function updateFallbackProviderStatus()');
        expect(source).toContain("$('#fallback_provider_model').on('input',");

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

        expect(source).toContain('getFallbackProviderStatus(oai_settings)');
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

    test('keeps missing provider API key feedback visible before connection attempts', () => {
        const source = fs.readFileSync(path.join(repoRoot, 'public/scripts/openai.js'), 'utf8');

        expect(source).toContain('No secret key saved for ${oai_settings.chat_completion_source}');
        expect(source).toContain('toastr.warning(t`Enter or save an API key before connecting.`);');
    });

    test('keeps missing provider credentials visible before test requests', () => {
        const source = fs.readFileSync(path.join(repoRoot, 'public/scripts/openai.js'), 'utf8');

        expect(source).toContain('function isProviderCredentialMissing()');
        expect(source).toContain('if (isProviderCredentialMissing())');
        expect(source).toContain('toastr.warning(t`Enter or save provider credentials before testing the connection.`);');
    });

    test('keeps API test requests visibly loading until they settle', () => {
        const source = fs.readFileSync(path.join(repoRoot, 'public/scripts/openai.js'), 'utf8');
        const testConnectionBody = source.match(/async function testApiConnection\(\) \{[\s\S]*?\n\}/)?.[0] ?? '';

        expect(source).toContain('const API_TEST_REQUEST_TIMEOUT_MS = 15000;');
        expect(testConnectionBody).toContain('startStatusLoading();');
        expect(testConnectionBody).toContain('new AbortController()');
        expect(testConnectionBody).toContain('API connection test timed out');
        expect(testConnectionBody).toContain('} finally {');
        expect(testConnectionBody).toContain('clearTimeout(timeout);');
        expect(testConnectionBody).toContain('resultCheckStatus();');
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
