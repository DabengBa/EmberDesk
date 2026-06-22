import { describe, expect, test } from '@jest/globals';

import {
    classifyMainChatVisibleTransportOwner,
    deriveReactVisibleTransportBridgeState,
} from '../public/scripts/main-chat-visible-transport-owner.js';

describe('main chat visible transport owner', () => {
    test.each([
        ['submit composer', { kind: 'submitComposer', mainApi: 'openai' }, { owner: 'react', reason: 'supported-kind' }],
        ['continue last', { kind: 'continueLast', mainApi: 'openai' }, { owner: 'react', reason: 'supported-kind' }],
        ['retry generation', { kind: 'retryGeneration', mainApi: 'openai' }, { owner: 'legacy', reason: 'unsupported-kind' }],
        ['swipe left', { kind: 'swipeLeft', mainApi: 'openai' }, { owner: 'legacy', reason: 'unsupported-kind' }],
        ['swipe right', { kind: 'swipeRight', mainApi: 'openai' }, { owner: 'legacy', reason: 'unsupported-kind' }],
        ['non-openai api', { kind: 'submitComposer', mainApi: 'kobold' }, { owner: 'legacy', reason: 'unsupported-api' }],
        ['group chat', { kind: 'submitComposer', mainApi: 'openai', selectedGroup: true }, { owner: 'legacy', reason: 'group-chat' }],
        ['dry run', { kind: 'submitComposer', mainApi: 'openai', dryRun: true }, { owner: 'legacy', reason: 'dry-run' }],
        ['nested depth', { kind: 'submitComposer', mainApi: 'openai', depth: 1 }, { owner: 'legacy', reason: 'nested-generation' }],
    ])('classifies %s boundary', (_name, input, expected) => {
        expect(classifyMainChatVisibleTransportOwner(input)).toEqual(expected);
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
