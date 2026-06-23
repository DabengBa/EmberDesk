import { describe, expect, test } from '@jest/globals';

import {
    createQuietGenerationLifecycleContract,
    createGenerationLifecyclePlan,
    getGenerationAttemptBaseline,
    getGenerationFailureDecision,
    getGenerationRecoveryBaselineSwipeId,
    getGenerationRecoveryRetrySwipeId,
    getGenerationRecoverySuccessReasoningState,
    getGenerationRecoverySuccessSwipeId,
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

    test('delegates fallback readiness to existing fallback settings rules', () => {
        const settings = {
            fallback_provider_enabled: true,
            fallback_provider_base_url: 'https://fallback.example/v1',
            fallback_provider_model: 'fallback-model',
        };

        expect(hasFallbackProviderForGeneration({
            settings,
            secretState: { api_key_openai_fallback: [{}] },
            fallbackSecretKey: 'api_key_openai_fallback',
        })).toBe(true);
        expect(hasFallbackProviderForGeneration({
            settings: { ...settings, fallback_provider_base_url: '' },
            secretState: { api_key_openai_fallback: [{}] },
            fallbackSecretKey: 'api_key_openai_fallback',
        })).toBe(false);
    });

    test('matches existing-message baselines only for the current recovery message id', () => {
        const baseline = {
            messageId: 7,
            mes: 'original assistant text',
            swipes: ['original assistant text'],
        };

        expect(getGenerationAttemptBaseline(7, baseline)).toBe(baseline);
        expect(getGenerationAttemptBaseline(8, baseline)).toBeNull();
        expect(getGenerationAttemptBaseline(7, null)).toBeNull();
    });

    test('clamps recovery baselines to an existing swipe before final failure restore', () => {
        expect(getGenerationRecoveryBaselineSwipeId({
            type: 'swipe',
            swipeId: 3,
            swipeCount: 3,
        })).toBe(2);

        expect(getGenerationRecoveryBaselineSwipeId({
            type: 'continue',
            swipeId: 1,
            swipeCount: 3,
        })).toBe(1);

        expect(getGenerationRecoveryBaselineSwipeId({
            type: 'normal',
            swipeId: 3,
            swipeCount: 3,
        })).toBe(3);
    });

    test('keeps recovered continue on the active swipe while allowing recovered swipe to append one slot', () => {
        expect(getGenerationRecoverySuccessSwipeId({
            type: 'continue',
            swipeId: 1,
            swipeCount: 3,
        })).toBe(1);

        expect(getGenerationRecoverySuccessSwipeId({
            type: 'swipe',
            swipeId: 3,
            swipeCount: 3,
        })).toBe(3);

        expect(getGenerationRecoverySuccessSwipeId({
            type: 'swipe',
            swipeId: 2,
            swipeCount: 3,
            recoverySwipeId: 3,
        })).toBe(3);

        expect(getGenerationRecoverySuccessSwipeId({
            type: 'normal',
            swipeId: 0,
            swipeCount: 1,
        })).toBeNull();
    });

    test('restores recovered swipe retries to the intended append slot after baseline cleanup', () => {
        expect(getGenerationRecoveryRetrySwipeId({
            type: 'swipe',
            swipeId: 0,
            swipeCount: 1,
            recoverySwipeId: 1,
        })).toBe(1);

        expect(getGenerationRecoveryRetrySwipeId({
            type: 'continue',
            swipeId: 0,
            swipeCount: 1,
            recoverySwipeId: 1,
        })).toBe(0);
    });

    test('preserves existing reasoning state when recovered continue replaces the active message', () => {
        expect(getGenerationRecoverySuccessReasoningState({
            type: 'continue',
            existingReasoning: 'Original reasoning. ',
            existingReasoningDuration: 4200,
            reasoning: 'Continuation reasoning.',
        })).toEqual({
            reasoning: 'Original reasoning. Continuation reasoning.',
            reasoningDuration: 4200,
        });

        expect(getGenerationRecoverySuccessReasoningState({
            type: 'swipe',
            existingReasoning: 'Original reasoning.',
            existingReasoningDuration: 4200,
            reasoning: 'Replacement reasoning.',
        })).toEqual({
            reasoning: 'Replacement reasoning.',
            reasoningDuration: null,
        });
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
            originalType: 'continue',
            type: 'continue',
        })).toEqual({
            action: 'save_reply',
            type: 'appendFinal',
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
