import { describe, expect, test } from '@jest/globals';

import {
    createMainChatQuietTransportDecision,
    createMainChatVisibleTransportDecision,
    createMainChatVisibleTransportFallbackDecision,
    deriveReactQuietTransportBridgeState,
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

    test.each([
        [
            'standard openai direct-chat submit',
            { kind: 'submitComposer', mainApi: 'openai' },
            { owner: 'react', kind: 'submitComposer', status: 'react-owned', path: 'standard-openai-visible-direct-chat', reason: 'supported-kind' },
        ],
        [
            'non-openai provider',
            { kind: 'submitComposer', mainApi: 'kobold' },
            { owner: 'legacy', kind: 'submitComposer', status: 'legacy-fallback', path: 'non-openai-provider', reason: 'unsupported-api' },
        ],
        [
            'group chat',
            { kind: 'submitComposer', mainApi: 'openai', selectedGroup: true },
            { owner: 'legacy', kind: 'submitComposer', status: 'legacy-fallback', path: 'group-chat', reason: 'group-chat' },
        ],
        [
            'dry run',
            { kind: 'submitComposer', mainApi: 'openai', dryRun: true },
            { owner: 'legacy', kind: 'submitComposer', status: 'legacy-fallback', path: 'dry-run', reason: 'dry-run' },
        ],
        [
            'nested visible generation',
            { kind: 'submitComposer', mainApi: 'openai', depth: 1 },
            { owner: 'legacy', kind: 'submitComposer', status: 'legacy-fallback', path: 'nested-visible-generation', reason: 'nested-generation' },
        ],
    ])('creates a full visible transport decision for %s', (_name, input, expected) => {
        expect(createMainChatVisibleTransportDecision(input)).toEqual(expected);
    });

    test('normalizes a supported decision into an explicit legacy fallback when React transport cannot execute it', () => {
        expect(createMainChatVisibleTransportFallbackDecision(
            createMainChatVisibleTransportDecision({ kind: 'submitComposer', mainApi: 'openai' }),
        )).toEqual({
            owner: 'legacy',
            kind: 'submitComposer',
            status: 'legacy-fallback',
            path: 'standard-openai-visible-direct-chat',
            reason: 'legacy-executed',
        });
    });

    test('derives React-owned controller bridge state while a visible request is active', () => {
        expect(deriveReactVisibleTransportBridgeState({
            runtime: {
                owner: 'react',
                kind: 'submitComposer',
                supportStatus: 'react-owned',
                supportPath: 'standard-openai-visible-direct-chat',
                supportReason: 'supported-kind',
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
            visibleTransportKind: 'submitComposer',
            visibleTransportStatus: 'react-owned',
            visibleTransportPath: 'standard-openai-visible-direct-chat',
            visibleTransportReason: 'supported-kind',
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
            decision: {
                owner: 'legacy',
                kind: 'submitComposer',
                status: 'legacy-fallback',
                path: 'non-openai-provider',
                reason: 'unsupported-api',
            },
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
            visibleTransportKind: 'submitComposer',
            visibleTransportStatus: 'legacy-fallback',
            visibleTransportPath: 'non-openai-provider',
            visibleTransportReason: 'unsupported-api',
            generationControlPhase: 'error',
            failureRetryVisible: true,
            streamingPhase: 'error',
            activeMessageId: 9,
            observedTokenCount: 0,
            fromFallbackAttempt: true,
        });
    });

    test.each([
        [
            'quiet helper prompt',
            {},
            { owner: 'legacy', kind: 'quietPrompt', status: 'legacy-owned', path: 'quiet-non-visible-helper', reason: 'quiet-generation' },
        ],
        [
            'quiet to loud helper prompt',
            { quietToLoud: true },
            { owner: 'legacy', kind: 'quietToLoud', status: 'legacy-owned', path: 'quiet-to-loud-non-visible-helper', reason: 'quiet-to-loud' },
        ],
        [
            'background helper prompt',
            { backgroundGeneration: true },
            { owner: 'legacy', kind: 'backgroundGeneration', status: 'legacy-owned', path: 'background-non-visible-helper', reason: 'background-generation' },
        ],
    ])('creates an explicit quiet/background decision for %s', (_name, input, expected) => {
        expect(createMainChatQuietTransportDecision(input)).toEqual(expected);
    });

    test('derives a quiet/background bridge state from the explicit legacy owner contract', () => {
        expect(deriveReactQuietTransportBridgeState({
            runtime: null,
            decision: createMainChatQuietTransportDecision({ backgroundGeneration: true }),
            contract: {
                autoRecover: false,
                usesStreamingTransport: false,
                bindsVisibleMessageRow: false,
                finalizationStrategy: 'return-generated-text',
                rollbackStrategy: 'caller-owned',
            },
        })).toEqual({
            quietTransportOwner: 'legacy',
            quietTransportKind: 'backgroundGeneration',
            quietTransportStatus: 'legacy-owned',
            quietTransportPath: 'background-non-visible-helper',
            quietTransportReason: 'background-generation',
            quietTransportPhase: 'idle',
            quietTransportError: '',
            quietTransportAutoRecover: false,
            quietTransportUsesStreaming: false,
            quietTransportBindsVisibleRow: false,
            quietTransportFinalization: 'return-generated-text',
            quietTransportRollback: 'caller-owned',
        });
    });
});
