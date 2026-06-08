import { describe, expect, test } from '@jest/globals';

import {
    OPENAI_FALLBACK_SECRET_MARKER,
    buildFallbackOpenAIRequestOverrides,
    hasFallbackProviderSettings,
    isMainChatVisibleGeneration,
    isRecoverableGenerationFailure,
    normalizeFallbackBaseUrl,
} from '../public/scripts/chat-generation-auto-recovery.js';

describe('chat generation auto recovery helpers', () => {
    test('builds one-shot OpenAI-compatible fallback request overrides', () => {
        const overrides = buildFallbackOpenAIRequestOverrides({
            fallback_provider_base_url: ' https://fallback.example/v1/ ',
            fallback_provider_model: ' fallback-model ',
        });

        expect(overrides).toEqual({
            chatCompletionSource: 'openai',
            model: 'fallback-model',
            customUrl: 'https://fallback.example/v1',
            openaiSecretMarker: OPENAI_FALLBACK_SECRET_MARKER,
        });
    });

    test('requires enabled endpoint model and dedicated secret state before fallback is available', () => {
        const settings = {
            fallback_provider_enabled: true,
            fallback_provider_base_url: 'https://fallback.example/v1',
            fallback_provider_model: 'fallback-model',
        };

        expect(hasFallbackProviderSettings(settings, { api_key_openai_fallback: [{}] }, 'api_key_openai_fallback')).toBe(true);
        expect(hasFallbackProviderSettings({ ...settings, fallback_provider_enabled: false }, { api_key_openai_fallback: [{}] }, 'api_key_openai_fallback')).toBe(false);
        expect(hasFallbackProviderSettings({ ...settings, fallback_provider_base_url: '' }, { api_key_openai_fallback: [{}] }, 'api_key_openai_fallback')).toBe(false);
        expect(hasFallbackProviderSettings({ ...settings, fallback_provider_model: '' }, { api_key_openai_fallback: [{}] }, 'api_key_openai_fallback')).toBe(false);
        expect(hasFallbackProviderSettings(settings, {}, 'api_key_openai_fallback')).toBe(false);
    });

    test('normalizes fallback Base URL without mutating unrelated provider settings', () => {
        expect(normalizeFallbackBaseUrl('https://fallback.example/v1///')).toBe('https://fallback.example/v1');
        expect(normalizeFallbackBaseUrl('')).toBe('');
        expect(normalizeFallbackBaseUrl(null)).toBe('');
    });

    test.each([
        ['empty reply', { emptyReply: true }, true],
        ['network error', new TypeError('Failed to fetch'), true],
        ['provider response error', { error: { message: 'provider failed' } }, true],
        ['stream parser error', new SyntaxError('Unexpected token') , true],
        ['stream close error', new Error('stream connection closed before completion'), true],
        ['non-user abort', new DOMException('The operation was aborted', 'AbortError'), true],
        ['user stop', new Error('Generation was aborted.'), false],
        ['clicked stop', 'Clicked stop button', false],
        ['unsupported api', new Error('sendGenerationRequest: unsupported API: novel'), false],
        ['missing context', new Error('No character selected'), false],
    ])('classifies %s recoverability', (_name, failure, expected) => {
        expect(isRecoverableGenerationFailure(failure)).toBe(expected);
    });

    test.each([
        ['normal', true],
        ['regenerate', true],
        ['continue', true],
        ['swipe', true],
        ['quiet', false],
        ['impersonate', false],
    ])('classifies visible main chat generation type %s', (type, expected) => {
        expect(isMainChatVisibleGeneration({ type, mainApi: 'openai', dryRun: false, depth: 0 })).toBe(expected);
    });

    test('excludes non-main-chat and nested generation surfaces from auto recovery', () => {
        expect(isMainChatVisibleGeneration({ type: 'normal', mainApi: 'kobold', dryRun: false, depth: 0 })).toBe(false);
        expect(isMainChatVisibleGeneration({ type: 'normal', mainApi: 'openai', dryRun: true, depth: 0 })).toBe(false);
        expect(isMainChatVisibleGeneration({ type: 'normal', mainApi: 'openai', dryRun: false, depth: 1 })).toBe(false);
    });
});
