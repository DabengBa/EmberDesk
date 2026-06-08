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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const SOURCES = {
    OPENAI: 'openai',
    CLAUDE: 'claude',
    MAKERSUITE: 'makersuite',
    VERTEXAI: 'vertexai',
};

function settings(overrides = {}) {
    return {
        chat_completion_source: SOURCES.OPENAI,
        openai_model: 'gpt-5.2',
        claude_model: 'claude-sonnet-4',
        google_model: 'gemini-2.5-pro',
        reasoning_effort: 'high',
        verbosity: 'auto',
        media_inlining: true,
        ...overrides,
    };
}

describe('OpenAI provider capability helpers', () => {
    test('keeps fallback provider endpoint settings persistent but outside connection profiles', () => {
        const source = fs.readFileSync(path.join(repoRoot, 'public/scripts/openai.js'), 'utf8');

        expect(source).toContain("fallback_provider_enabled: ['#fallback_provider_enabled', 'fallback_provider_enabled', true, false]");
        expect(source).toContain("fallback_provider_base_url: ['#fallback_provider_base_url', 'fallback_provider_base_url', false, false]");
        expect(source).toContain("fallback_provider_model: ['#fallback_provider_model', 'fallback_provider_model', false, false]");
        expect(source).toContain('fallback_provider_enabled: false');
        expect(source).toContain("fallback_provider_base_url: ''");
        expect(source).toContain("fallback_provider_model: ''");
        expect(source).toContain('function updateFallbackProviderStatus()');
        expect(source).toContain("$('#fallback_provider_enabled').on('change',");
        expect(source).toContain("$('#fallback_provider_base_url').on('input',");
        expect(source).toContain("$('#fallback_provider_model').on('input',");
        expect(source).not.toContain('fallback_provider_api_key:');
    });

    test('requires the dedicated fallback secret before showing fallback provider as ready', () => {
        const source = fs.readFileSync(path.join(repoRoot, 'public/scripts/openai.js'), 'utf8');

        expect(source).toContain('hasFallbackProviderSettings');
        expect(source).toContain('hasFallbackProviderSettings(oai_settings, secret_state, SECRET_KEYS.OPENAI_FALLBACK)');
        expect(source).toContain('await writeSecret(SECRET_KEYS.OPENAI_FALLBACK, value);');
        expect(source).toContain('await deleteSecret(SECRET_KEYS.OPENAI_FALLBACK);');
        expect(source).toMatch(/await writeSecret\(SECRET_KEYS\.OPENAI_FALLBACK, value\);[\s\S]*?updateFallbackProviderStatus\(\);/);
        expect(source).toMatch(/await deleteSecret\(SECRET_KEYS\.OPENAI_FALLBACK\);[\s\S]*?updateFallbackProviderStatus\(\);/);
    });

    test('builds fallback request payloads without mutating or inheriting primary connection settings', () => {
        const source = fs.readFileSync(path.join(repoRoot, 'public/scripts/openai.js'), 'utf8');

        expect(source).toContain('buildFallbackOpenAIRequestOverrides(oai_settings)');
        expect(source).toContain('requestSettings.chat_completion_source = fallbackOverrides.chatCompletionSource;');
        expect(source).toContain('requestSettings.openai_model = fallbackOverrides.model;');
        expect(source).toContain('requestSettings.custom_url = fallbackOverrides.customUrl;');
        expect(source).toContain("requestSettings.reverse_proxy = '';");
        expect(source).toContain("requestSettings.proxy_password = '';");
        expect(source).toContain('generate_data.openai_secret_marker = fallbackOverrides.openaiSecretMarker;');
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
        expect(getChatCompletionModelFromSettings(settings({ chat_completion_source: SOURCES.CLAUDE }))).toBe('claude-sonnet-4');
        expect(getChatCompletionModelFromSettings(settings({ chat_completion_source: SOURCES.MAKERSUITE }))).toBe('gemini-2.5-pro');
        expect(getChatCompletionModelFromSettings(settings({ chat_completion_source: SOURCES.VERTEXAI }))).toBe('gemini-2.5-pro');
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

    test('passes through non-OpenAI reasoning effort behavior', () => {
        expect(resolveReasoningEffort(settings({
            chat_completion_source: SOURCES.CLAUDE,
            reasoning_effort: 'medium',
        }))).toBe('medium');
    });

    test('resolves verbosity without changing auto omission behavior', () => {
        expect(resolveVerbosity(settings({ verbosity: 'auto' }))).toBeUndefined();
        expect(resolveVerbosity(settings({ verbosity: 'low' }))).toBe('low');
        expect(resolveVerbosity(settings({ verbosity: 'high' }))).toBe('high');
    });

    test('keeps media support split by type and gated by main api and setting', () => {
        const google = settings({ chat_completion_source: SOURCES.MAKERSUITE, google_model: 'gemini-2.5-pro' });
        expect(isImageInliningSupportedForSettings(google, { mainApi: 'openai' })).toBe(true);
        expect(isVideoInliningSupportedForSettings(google, { mainApi: 'openai' })).toBe(true);
        expect(isAudioInliningSupportedForSettings(google, { mainApi: 'openai' })).toBe(true);

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
