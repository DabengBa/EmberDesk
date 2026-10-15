import { describe, expect, test } from '@jest/globals';

import {
    createQuietGenerationLifecycleContract,
    createGenerationLifecyclePlan,
    getGenerationFailureDecision,
    getGenerationSuccessFinalization,
    hasFallbackProviderForGeneration,
} from '../public/scripts/chat-generation-lifecycle.js';

describe('chat generation lifecycle coordinator', () => {
    test('plans bounded visible main-chat attempts with fallback trace when fallback is ready', () => {
        const plan = createGenerationLifecyclePlan({
            type: 'normal',
            mainApi: 'openai',
            dryRun: false,
            depth: 0,
            fallbackReady: true,
            statusLabels: {
                primaryRetry: 'Retrying',
                fallback: 'Using fallback',
            },
        });

        expect(plan.shouldAutoRecover).toBe(true);
        expect(plan.attempts).toEqual([
            { label: 'primary', status: '', fallbackProvider: false },
            { label: 'primary_retry', status: 'Retrying', fallbackProvider: false },
            { label: 'fallback', status: 'Using fallback', fallbackProvider: true },
        ]);
        expect(plan.trace).toEqual([
            { index: 0, label: 'primary', fallbackProvider: false, recovery: false },
            { index: 1, label: 'primary_retry', fallbackProvider: false, recovery: true },
            { index: 2, label: 'fallback', fallbackProvider: true, recovery: true },
        ]);
    });

    test.each([
        ['quiet generation', { type: 'quiet', mainApi: 'openai', dryRun: false, depth: 0 }],
        ['nested generation', { type: 'normal', mainApi: 'openai', dryRun: false, depth: 1 }],
        ['dry run', { type: 'normal', mainApi: 'openai', dryRun: true, depth: 0 }],
        ['non OpenAI main API', { type: 'normal', mainApi: 'kobold', dryRun: false, depth: 0 }],
    ])('does not route %s through automatic recovery', (_name, input) => {
        const plan = createGenerationLifecyclePlan({
            ...input,
            fallbackReady: true,
            statusLabels: {
                primaryRetry: 'Retrying',
                fallback: 'Using fallback',
            },
        });

        expect(plan.shouldAutoRecover).toBe(false);
        expect(plan.attempts).toEqual([
            { label: 'primary', status: '', fallbackProvider: false },
        ]);
        expect(plan.trace).toEqual([
            { index: 0, label: 'primary', fallbackProvider: false, recovery: false },
        ]);
    });

    test('delegates fallback readiness to the configured fallback model only', () => {
        const settings = { fallback_provider_model: 'fallback-model' };

        expect(hasFallbackProviderForGeneration({ settings })).toBe(true);
        expect(hasFallbackProviderForGeneration({ settings: { fallback_provider_model: '' } })).toBe(false);
        expect(hasFallbackProviderForGeneration({ settings: {} })).toBe(false);
    });

    test('classifies recoverable intermediate failures as retry with baseline restore', () => {
        const decision = getGenerationFailureDecision({
            shouldAutoRecover: true,
            failure: new TypeError('Failed to fetch'),
            isIntermediateAttempt: true,
        });

        expect(decision).toEqual({
            action: 'retry',
            recoverable: true,
            shouldEnsureRecoveryMessage: true,
            shouldRestoreAttemptMessage: true,
            shouldShowFailureRecovery: false,
            shouldThrow: false,
        });
    });

    test('classifies recoverable final failures as manual recovery with baseline restore', () => {
        const decision = getGenerationFailureDecision({
            shouldAutoRecover: true,
            failure: new Error('stream connection closed before completion'),
            isIntermediateAttempt: false,
        });

        expect(decision).toEqual({
            action: 'final_recovery',
            recoverable: true,
            shouldEnsureRecoveryMessage: true,
            shouldRestoreAttemptMessage: true,
            shouldShowFailureRecovery: true,
            shouldThrow: true,
        });
    });

    test('does not recover user aborts or quiet-generation failures', () => {
        expect(getGenerationFailureDecision({
            shouldAutoRecover: true,
            failure: new Error('Generation was aborted.'),
            isIntermediateAttempt: true,
        })).toEqual({
            action: 'propagate',
            recoverable: false,
            shouldEnsureRecoveryMessage: false,
            shouldRestoreAttemptMessage: false,
            shouldShowFailureRecovery: false,
            shouldThrow: true,
        });

        expect(getGenerationFailureDecision({
            shouldAutoRecover: false,
            failure: new TypeError('Failed to fetch'),
            isIntermediateAttempt: true,
        })).toEqual({
            action: 'propagate',
            recoverable: false,
            shouldEnsureRecoveryMessage: false,
            shouldRestoreAttemptMessage: false,
            shouldShowFailureRecovery: false,
            shouldThrow: true,
        });
    });

    test('chooses success finalization without duplicating recovered assistant rows', () => {
        expect(getGenerationSuccessFinalization({
            hasActiveRecoveryMessage: true,
            originalType: 'normal',
            type: 'normal',
        })).toEqual({
            action: 'replace_recovery_message',
            type: 'normal',
        });

        expect(getGenerationSuccessFinalization({
            hasActiveRecoveryMessage: false,
            originalType: 'normal',
            type: 'normal',
        })).toEqual({
            action: 'save_reply',
            type: 'normal',
        });
    });

    test.each([
        [
            'quiet helper prompt',
            {},
            {
                requestFamily: 'quietPrompt',
                autoRecover: false,
                usesStreamingTransport: false,
                bindsVisibleMessageRow: false,
                finalizationStrategy: 'return-generated-text',
                rollbackStrategy: 'caller-owned',
            },
        ],
        [
            'quiet to loud helper prompt',
            { quietToLoud: true },
            {
                requestFamily: 'quietToLoud',
                autoRecover: false,
                usesStreamingTransport: false,
                bindsVisibleMessageRow: false,
                finalizationStrategy: 'return-generated-text',
                rollbackStrategy: 'caller-owned',
            },
        ],
        [
            'background helper prompt',
            { backgroundGeneration: true },
            {
                requestFamily: 'backgroundGeneration',
                autoRecover: false,
                usesStreamingTransport: false,
                bindsVisibleMessageRow: false,
                finalizationStrategy: 'return-generated-text',
                rollbackStrategy: 'caller-owned',
            },
        ],
    ])('describes explicit quiet/background lifecycle semantics for %s', (_name, input, expected) => {
        expect(createQuietGenerationLifecycleContract(input)).toEqual(expected);
    });
});
