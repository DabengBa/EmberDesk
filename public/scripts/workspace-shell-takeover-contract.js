export const WORKSPACE_SHELL_TAKEOVER_STATUSES = Object.freeze({
    DISABLED: 'disabled',
    FAILED: 'failed',
    READY: 'ready',
    ROLLBACK: 'rollback',
});

export const WORKSPACE_SHELL_TAKEOVER_FAILURE_REASONS = Object.freeze({
    BUNDLE_LOAD_FAILED: 'bundle-load-failed',
    FEATURE_DISABLED: 'feature-disabled',
    INVALID_PAYLOAD: 'invalid-payload',
    MISSING_HOST: 'missing-host',
    MOUNT_FAILED: 'mount-failed',
    ROLLBACK_REQUESTED: 'rollback-requested',
});

export function isWorkspaceShellTakeoverPayloadValid(features = globalThis.__emberDeskWorkspaceFeatures ?? {}) {
    return (features?.reactShell?.strict === undefined || typeof features.reactShell.strict === 'boolean')
        && (features?.reactShell?.takeover === undefined || typeof features.reactShell.takeover === 'boolean');
}

export function isReactWorkspaceShellTakeoverEnabled(features = globalThis.__emberDeskWorkspaceFeatures ?? {}) {
    return Boolean(features?.reactShell?.takeover);
}

export function isReactWorkspaceShellTakeoverStrictModeEnabled(features = globalThis.__emberDeskWorkspaceFeatures ?? {}) {
    return Boolean(features?.reactShell?.strict);
}

export function createWorkspaceShellTakeoverDisabledResult() {
    return {
        reason: WORKSPACE_SHELL_TAKEOVER_FAILURE_REASONS.FEATURE_DISABLED,
        status: WORKSPACE_SHELL_TAKEOVER_STATUSES.DISABLED,
        takeover: false,
    };
}

export function createWorkspaceShellTakeoverReadyResult() {
    return {
        status: WORKSPACE_SHELL_TAKEOVER_STATUSES.READY,
        takeover: true,
    };
}

export function createWorkspaceShellTakeoverRollbackResult() {
    return {
        reason: WORKSPACE_SHELL_TAKEOVER_FAILURE_REASONS.ROLLBACK_REQUESTED,
        status: WORKSPACE_SHELL_TAKEOVER_STATUSES.ROLLBACK,
        takeover: false,
    };
}

export function createWorkspaceShellTakeoverFailedResult(reason) {
    return {
        reason,
        status: WORKSPACE_SHELL_TAKEOVER_STATUSES.FAILED,
        takeover: false,
    };
}

export function throwWorkspaceShellTakeoverFailure(reason) {
    throw new Error(`React workspace shell takeover required but failed: ${reason}`);
}

export function decideWorkspaceShellTakeover({
    failureReason,
    features = globalThis.__emberDeskWorkspaceFeatures ?? {},
    hasHost,
    rollback = false,
    strict = isReactWorkspaceShellTakeoverStrictModeEnabled(features),
}) {
    if (rollback) {
        return createWorkspaceShellTakeoverRollbackResult();
    }

    if (!isWorkspaceShellTakeoverPayloadValid(features)) {
        if (strict) {
            throwWorkspaceShellTakeoverFailure(WORKSPACE_SHELL_TAKEOVER_FAILURE_REASONS.INVALID_PAYLOAD);
        }

        return createWorkspaceShellTakeoverFailedResult(WORKSPACE_SHELL_TAKEOVER_FAILURE_REASONS.INVALID_PAYLOAD);
    }

    if (!isReactWorkspaceShellTakeoverEnabled(features)) {
        return createWorkspaceShellTakeoverDisabledResult();
    }

    if (failureReason) {
        if (strict) {
            throwWorkspaceShellTakeoverFailure(failureReason);
        }

        return createWorkspaceShellTakeoverFailedResult(failureReason);
    }

    if (hasHost) {
        return createWorkspaceShellTakeoverReadyResult();
    }

    if (strict) {
        throwWorkspaceShellTakeoverFailure(WORKSPACE_SHELL_TAKEOVER_FAILURE_REASONS.MISSING_HOST);
    }

    return createWorkspaceShellTakeoverFailedResult(WORKSPACE_SHELL_TAKEOVER_FAILURE_REASONS.MISSING_HOST);
}
