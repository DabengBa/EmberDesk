import { describe, expect, test } from '@jest/globals';

import {
    getFallbackOpenAIModel,
    hasFallbackProviderSettings,
    isMainChatVisibleGeneration,
    isRecoverableGenerationFailure,
} from '../public/scripts/chat-generation-auto-recovery.js';

describe('chat generation auto recovery helpers', () => {
    test('fallback readiness depends only on a non-empty fallback model', () => {
        expect(getFallbackOpenAIModel({ fallback_provider_model: ' fallback-model ' })).toBe('fallback-model');
        expect(getFallbackOpenAIModel({})).toBe('');
        expect(getFallbackOpenAIModel(null)).toBe('');

        expect(hasFallbackProviderSettings({ fallback_provider_model: 'fallback-model' })).toBe(true);
        expect(hasFallbackProviderSettings({ fallback_provider_model: '   ' })).toBe(false);
        expect(hasFallbackProviderSettings({})).toBe(false);
        // Legacy keys no longer gate fallback: the same URL and key apply to both models.
        expect(hasFallbackProviderSettings({
            fallback_provider_model: 'fallback-model',
            fallback_provider_enabled: false,
            fallback_provider_base_url: '',
        })).toBe(true);
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
