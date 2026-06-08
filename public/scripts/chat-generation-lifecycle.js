import {
    hasFallbackProviderSettings,
    isMainChatVisibleGeneration,
    isRecoverableGenerationFailure,
} from './chat-generation-auto-recovery.js';

const PRIMARY_ATTEMPT = Object.freeze({
    label: 'primary',
    status: '',
    fallbackProvider: false,
});

function cloneAttempt(attempt) {
    return { ...attempt };
}

function createAttemptTrace(attempts) {
    return attempts.map((attempt, index) => ({
        index,
        label: attempt.label,
        fallbackProvider: Boolean(attempt.fallbackProvider),
        recovery: index > 0,
    }));
}

export function hasFallbackProviderForGeneration({ settings, secretState, fallbackSecretKey } = {}) {
    return hasFallbackProviderSettings(settings, secretState, fallbackSecretKey);
}

export function buildGenerationLifecycleAttempts({ fallbackReady = false, statusLabels = {} } = {}) {
    const attempts = [
        cloneAttempt(PRIMARY_ATTEMPT),
        {
            label: 'primary_retry',
            status: statusLabels.primaryRetry ?? '',
            fallbackProvider: false,
        },
    ];

    if (fallbackReady) {
        attempts.push({
            label: 'fallback',
            status: statusLabels.fallback ?? '',
            fallbackProvider: true,
        });
    }

    return attempts;
}

export function createGenerationLifecyclePlan({
    type,
    mainApi,
    dryRun = false,
    depth = 0,
    fallbackReady = false,
    statusLabels = {},
} = {}) {
    const shouldAutoRecover = isMainChatVisibleGeneration({ type, mainApi, dryRun, depth });
    const attempts = shouldAutoRecover
        ? buildGenerationLifecycleAttempts({ fallbackReady, statusLabels })
        : [cloneAttempt(PRIMARY_ATTEMPT)];

    return {
        shouldAutoRecover,
        attempts,
        trace: createAttemptTrace(attempts),
    };
}

export function getGenerationAttemptBaseline(messageId, baseline) {
    return baseline?.messageId === messageId ? baseline : null;
}

export function getGenerationFailureDecision({
    shouldAutoRecover = false,
    failure,
    isIntermediateAttempt = false,
} = {}) {
    const recoverable = Boolean(shouldAutoRecover && isRecoverableGenerationFailure(failure));

    if (recoverable && isIntermediateAttempt) {
        return {
            action: 'retry',
            recoverable,
            shouldEnsureRecoveryMessage: true,
            shouldRestoreAttemptMessage: true,
            shouldShowFailureRecovery: false,
            shouldThrow: false,
        };
    }

    if (recoverable) {
        return {
            action: 'final_recovery',
            recoverable,
            shouldEnsureRecoveryMessage: true,
            shouldRestoreAttemptMessage: true,
            shouldShowFailureRecovery: true,
            shouldThrow: true,
        };
    }

    return {
        action: 'propagate',
        recoverable,
        shouldEnsureRecoveryMessage: false,
        shouldRestoreAttemptMessage: false,
        shouldShowFailureRecovery: false,
        shouldThrow: true,
    };
}

export function getGenerationSuccessFinalization({
    hasActiveRecoveryMessage = false,
    originalType,
    type,
} = {}) {
    if (hasActiveRecoveryMessage) {
        return {
            action: 'replace_recovery_message',
            type,
        };
    }

    return {
        action: 'save_reply',
        type: originalType === 'continue' ? 'appendFinal' : type,
    };
}
