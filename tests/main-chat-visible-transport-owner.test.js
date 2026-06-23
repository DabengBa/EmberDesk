import { describe, expect, test } from '@jest/globals';

import {
    classifyMainChatVisibleTransportOwner,
    classifyMainChatVisibleTransportSupport,
    deriveReactVisibleTransportBridgeState,
} from '../public/scripts/main-chat-visible-transport-owner.js';

describe('main chat visible transport owner', () => {
    test.each([
        ['submit composer', { kind: 'submitComposer', mainApi: 'openai' }, { owner: 'react', reason: 'supported-kind' }],
        ['continue last', { kind: 'continueLast', mainApi: 'openai' }, { owner: 'react', reason: 'supported-kind' }],
        ['retry generation', { kind: 'retryGeneration', mainApi: 'openai' }, { owner: 'react', reason: 'supported-kind' }],
        ['swipe left', { kind: 'swipeLeft', mainApi: 'openai' }, { owner: 'react', reason: 'supported-kind' }],
        ['swipe right', { kind: 'swipeRight', mainApi: 'openai' }, { owner: 'react', reason: 'supported-kind' }],
        ['non-openai api', { kind: 'submitComposer', mainApi: 'kobold' }, { owner: 'legacy', reason: 'unsupported-api' }],
        ['group chat', { kind: 'submitComposer', mainApi: 'openai', selectedGroup: true }, { owner: 'legacy', reason: 'group-chat' }],
        ['dry run', { kind: 'submitComposer', mainApi: 'openai', dryRun: true }, { owner: 'legacy', reason: 'dry-run' }],
        ['nested depth', { kind: 'submitComposer', mainApi: 'openai', depth: 1 }, { owner: 'legacy', reason: 'nested-generation' }],
    ])('classifies %s boundary', (_name, input, expected) => {
        expect(classifyMainChatVisibleTransportOwner(input)).toEqual(expected);
    });

    test.each([
        [
            'standard openai direct-chat submit',
            { kind: 'submitComposer', mainApi: 'openai' },
            { status: 'react-owned', path: 'standard-openai-visible-direct-chat', reason: 'supported-kind' },
        ],
        [
            'non-openai provider',
            { kind: 'submitComposer', mainApi: 'kobold' },
            { status: 'legacy-fallback', path: 'non-openai-provider', reason: 'unsupported-api' },
        ],
        [
            'group chat',
            { kind: 'submitComposer', mainApi: 'openai', selectedGroup: true },
            { status: 'legacy-fallback', path: 'group-chat', reason: 'group-chat' },
        ],
        [
            'dry run',
            { kind: 'submitComposer', mainApi: 'openai', dryRun: true },
            { status: 'legacy-fallback', path: 'dry-run', reason: 'dry-run' },
        ],
        [
            'nested visible generation',
            { kind: 'submitComposer', mainApi: 'openai', depth: 1 },
            { status: 'legacy-fallback', path: 'nested-visible-generation', reason: 'nested-generation' },
        ],
        [
            'quiet generation',
            { kind: 'submitComposer', mainApi: 'openai', quietPrompt: true },
            { status: 'legacy-fallback', path: 'quiet-generation', reason: 'quiet-generation' },
        ],
        [
            'background generation',
            { kind: 'submitComposer', mainApi: 'openai', backgroundGeneration: true },
            { status: 'legacy-fallback', path: 'background-generation', reason: 'background-generation' },
        ],
        [
            'unknown visible generation kind',
            { kind: 'rerollEverything', mainApi: 'openai' },
            { status: 'unsupported-with-reason', path: 'unknown-visible-generation-kind', reason: 'unsupported-kind' },
        ],
    ])('returns support matrix entry for %s', (_name, input, expected) => {
        expect(classifyMainChatVisibleTransportSupport(input)).toMatchObject(expected);
    });

    test('derives React-owned controller bridge state while a visible request is active', () => {
        expect(deriveReactVisibleTransportBridgeState({
            runtime: {
                owner: 'react',
                kind: 'submitComposer',
                phase: 'streaming',
                activeMessageId: 12,
                observedTokenCount: 7,
                observedChunkCount: 3,
                fromFallbackAttempt: false,
                recoverable: false,
                errorLabel: null,
            },
        })).toEqual({
            visibleTransportOwner: 'react',
            generationControlPhase: 'streaming',
            failureRetryVisible: false,
            streamingPhase: 'streaming',
            activeMessageId: 12,
            observedTokenCount: 7,
            fromFallbackAttempt: false,
        });
    });

    test('falls back to legacy bridge state when no React-owned visible request is active', () => {
        expect(deriveReactVisibleTransportBridgeState({
            runtime: null,
            generationControl: {
                phase: 'error',
                failureRetryVisible: true,
            },
            streamingTransport: {
                phase: 'error',
                activeMessageId: 9,
                observedTokenCount: 0,
                fromFallbackAttempt: true,
            },
        })).toEqual({
            visibleTransportOwner: 'legacy',
            generationControlPhase: 'error',
            failureRetryVisible: true,
            streamingPhase: 'error',
            activeMessageId: 9,
            observedTokenCount: 0,
            fromFallbackAttempt: true,
        });
    });
});
