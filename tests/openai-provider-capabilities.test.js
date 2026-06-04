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

const SOURCES = {
    OPENAI: 'openai',
    CLAUDE: 'claude',
    MAKERSUITE: 'makersuite',
    VERTEXAI: 'vertexai',
};

function settings(overrides = {}) {
    return {
        chat_completion_source: SOURCES.OPENAI,
        openai_model: 'gpt-5.4',
        claude_model: 'claude-sonnet-4',
        google_model: 'gemini-2.5-pro',
        reasoning_effort: 'high',
        verbosity: 'auto',
        media_inlining: true,
        ...overrides,
    };
}

describe('OpenAI provider capability helpers', () => {
    test('resolves model descriptors with structured capability fields', () => {
        const descriptor = resolveChatCompletionModel(settings(), { mainApi: 'openai' });

        expect(descriptor).toEqual({
            source: SOURCES.OPENAI,
            model: 'gpt-5.4',
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
        expect(getChatCompletionModelFromSettings(settings({ chat_completion_source: SOURCES.OPENAI }))).toBe('gpt-5.4');
        expect(getChatCompletionModelFromSettings(settings({ chat_completion_source: SOURCES.CLAUDE }))).toBe('claude-sonnet-4');
        expect(getChatCompletionModelFromSettings(settings({ chat_completion_source: SOURCES.MAKERSUITE }))).toBe('gemini-2.5-pro');
        expect(getChatCompletionModelFromSettings(settings({ chat_completion_source: SOURCES.VERTEXAI }))).toBe('gemini-2.5-pro');
        expect(getChatCompletionModelFromSettings(settings({ chat_completion_source: 'unknown' }))).toBe('');
    });

    test('resolves current reasoning effort aliases and official OpenAI effort values', () => {
        expect(resolveReasoningEffort(settings({ reasoning_effort: 'auto' }), 'gpt-5.4')).toBeUndefined();
        expect(resolveReasoningEffort(settings({ reasoning_effort: 'min' }), 'gpt-5.4')).toBe('none');
        expect(resolveReasoningEffort(settings({ reasoning_effort: 'min' }), 'gpt-5')).toBe('min');
        expect(resolveReasoningEffort(settings({ reasoning_effort: 'min' }), 'gpt-4o')).toBe('low');
        expect(resolveReasoningEffort(settings({ reasoning_effort: 'max' }), 'gpt-5.4')).toBe('high');
        expect(resolveReasoningEffort(settings({ reasoning_effort: 'none' }), 'gpt-5.4')).toBe('none');
        expect(resolveReasoningEffort(settings({ reasoning_effort: 'minimal' }), 'gpt-5.4')).toBe('minimal');
        expect(resolveReasoningEffort(settings({ reasoning_effort: 'xhigh' }), 'gpt-5.4')).toBe('xhigh');
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
        expect(isVideoInliningSupportedForSettings(settings({ openai_model: 'gpt-5.4' }), { mainApi: 'openai' })).toBe(false);
    });

    test('keeps descriptor capabilities independent from the media inlining toggle', () => {
        const descriptor = resolveChatCompletionModel(settings({ media_inlining: false }), { mainApi: 'openai' });

        expect(descriptor.capabilities.vision).toBe(true);
        expect(isImageInliningSupportedForSettings(settings({ media_inlining: false }), { mainApi: 'openai' })).toBe(false);
    });
});
