/**
 * Framework-neutral Main Chat generation command matrix and lifecycle planning.
 *
 * Owns request-kind classification, capability contracts, and attempt planning for
 * every visible and non-visible generation family. Does not assemble provider
 * payloads, call network endpoints, or touch DOM.
 */

import {
    createGenerationLifecyclePlan,
    createQuietGenerationLifecycleContract,
    getGenerationFailureDecision,
    getGenerationSuccessFinalization,
} from './chat-generation-lifecycle.js';

export const GENERATION_SERVICE_OWNER = 'generation-service';

/** Visible React composer / message-action command kinds. */
export const GENERATION_VISIBLE_COMMAND_KINDS = Object.freeze([
    'submitComposer',
    'continueLast',
    'retryGeneration',
    'swipeLeft',
    'swipeRight',
]);

/** Non-visible automation / helper command kinds. */
export const GENERATION_NON_VISIBLE_COMMAND_KINDS = Object.freeze([
    'quietPrompt',
    'quietToLoud',
    'backgroundGeneration',
]);

export const GENERATION_COMMAND_KINDS = Object.freeze([
    ...GENERATION_VISIBLE_COMMAND_KINDS,
    ...GENERATION_NON_VISIBLE_COMMAND_KINDS,
]);

export const GENERATION_COMMAND_VISIBILITY = Object.freeze({
    VISIBLE: 'visible',
    NON_VISIBLE: 'non-visible',
});

export const GENERATION_COMMAND_STATUSES = Object.freeze({
    SERVICE_OWNED: 'service-owned',
    UNSUPPORTED_WITH_REASON: 'unsupported-with-reason',
});

export const GENERATION_COMMAND_PATHS = Object.freeze({
    STANDARD_OPENAI_VISIBLE_DIRECT_CHAT: 'standard-openai-visible-direct-chat',
    NON_OPENAI_PROVIDER: 'non-openai-provider',
    GROUP_CHAT: 'group-chat',
    DRY_RUN: 'dry-run',
    NESTED_VISIBLE_GENERATION: 'nested-visible-generation',
    QUIET_GENERATION: 'quiet-generation',
    BACKGROUND_GENERATION: 'background-generation',
    QUIET_NON_VISIBLE_HELPER: 'quiet-non-visible-helper',
    QUIET_TO_LOUD_NON_VISIBLE_HELPER: 'quiet-to-loud-non-visible-helper',
    BACKGROUND_NON_VISIBLE_HELPER: 'background-non-visible-helper',
    UNKNOWN_GENERATION_KIND: 'unknown-generation-kind',
});

export const GENERATION_COMMAND_REASONS = Object.freeze({
    SUPPORTED_KIND: 'supported-kind',
    NON_OPENAI_PROVIDER: 'non-openai-provider',
    GROUP_CHAT: 'group-chat',
    DRY_RUN: 'dry-run',
    NESTED_GENERATION: 'nested-generation',
    QUIET_GENERATION: 'quiet-generation',
    BACKGROUND_GENERATION: 'background-generation',
    QUIET_TO_LOUD: 'quiet-to-loud',
    UNSUPPORTED_KIND: 'unsupported-kind',
});

const visibleKindSet = new Set(GENERATION_VISIBLE_COMMAND_KINDS);
const nonVisibleKindSet = new Set(GENERATION_NON_VISIBLE_COMMAND_KINDS);
const allKindSet = new Set(GENERATION_COMMAND_KINDS);

/**
 * Map the public shell generation type to the stable command vocabulary.
 * Existing callers may continue using Generate(type, options); the service
 * normalizes those names before routing or lifecycle decisions.
 *
 * @param {string} type
 * @param {object} [options]
 * @returns {string}
 */
export function mapLegacyGenerationTypeToCommandKind(type, options = {}) {
    switch (String(type ?? '')) {
        case 'continue':
            return 'continueLast';
        case 'regenerate':
            return 'retryGeneration';
        case 'swipe':
            return options.swipeDirection === 'left' ? 'swipeLeft' : 'swipeRight';
        case 'quiet':
            if (options.backgroundGeneration) {
                return 'backgroundGeneration';
            }
            return options.quietToLoud ? 'quietToLoud' : 'quietPrompt';
        case 'normal':
        default:
            return 'submitComposer';
    }
}

/**
 * Map public command kind to the Generate()/lifecycle `type` used for recovery baselines.
 * @param {string} kind
 * @returns {string}
 */
export function mapGenerationCommandKindToLifecycleType(kind) {
    switch (String(kind ?? '')) {
        case 'continueLast':
            return 'continue';
        case 'retryGeneration':
            return 'regenerate';
        case 'swipeLeft':
        case 'swipeRight':
            return 'swipe';
        case 'quietPrompt':
        case 'quietToLoud':
        case 'backgroundGeneration':
            return 'quiet';
        case 'submitComposer':
        default:
            return 'normal';
    }
}

/**
 * @param {string} kind
 * @returns {'visible'|'non-visible'|''}
 */
export function getGenerationCommandVisibility(kind) {
    const normalized = String(kind ?? '');
    if (visibleKindSet.has(normalized)) {
        return GENERATION_COMMAND_VISIBILITY.VISIBLE;
    }
    if (nonVisibleKindSet.has(normalized)) {
        return GENERATION_COMMAND_VISIBILITY.NON_VISIBLE;
    }
    return '';
}

/**
 * Build capability contract for a classified command.
 * @param {object} input
 */
export function buildGenerationCommandCapabilities({
    kind = '',
    mainApi = '',
    selectedGroup = false,
    dryRun = false,
    depth = 0,
    quietPrompt = false,
    quietToLoud = false,
    backgroundGeneration = false,
} = {}) {
    const visibility = getGenerationCommandVisibility(kind);
    const isNonVisible = visibility === GENERATION_COMMAND_VISIBILITY.NON_VISIBLE
        || quietPrompt
        || quietToLoud
        || backgroundGeneration
        || String(kind).startsWith('quiet')
        || kind === 'backgroundGeneration';

    if (isNonVisible) {
        const quietContract = createQuietGenerationLifecycleContract({
            quietToLoud: quietToLoud || kind === 'quietToLoud',
            backgroundGeneration: backgroundGeneration || kind === 'backgroundGeneration',
        });
        return {
            visibility: GENERATION_COMMAND_VISIBILITY.NON_VISIBLE,
            autoRecover: false,
            usesStreamingTransport: false,
            bindsVisibleMessageRow: false,
            producesVisibleRow: false,
            returnsGeneratedText: true,
            finalizationStrategy: quietContract.finalizationStrategy,
            rollbackStrategy: quietContract.rollbackStrategy,
            allowsNestedDepth: true,
            allowsDryRun: true,
            allowsGroup: true,
            allowsNonOpenAI: true,
        };
    }

    const nested = Number(depth) > 0;
    const isDryRun = dryRun === true;
    // Bounded auto-recovery stays limited to visible top-level OpenAI-compatible generations.
    // Nested, dry-run, quiet/background, and non-OpenAI remain single-attempt (R4/R5).
    const autoRecover = mainApi === 'openai' && !isDryRun && !nested;

    return {
        visibility: GENERATION_COMMAND_VISIBILITY.VISIBLE,
        autoRecover,
        usesStreamingTransport: !isDryRun,
        bindsVisibleMessageRow: !isDryRun && !nested,
        producesVisibleRow: !isDryRun,
        returnsGeneratedText: isDryRun || nested,
        finalizationStrategy: isDryRun || nested ? 'return-without-persisting-error-row' : 'save-or-replace-message-row',
        rollbackStrategy: autoRecover ? 'lifecycle-baseline' : 'caller-owned',
        allowsNestedDepth: true,
        allowsDryRun: true,
        allowsGroup: true,
        allowsNonOpenAI: true,
        selectedGroup: Boolean(selectedGroup),
        mainApi: String(mainApi ?? ''),
        dryRun: isDryRun,
        depth: Number(depth) || 0,
    };
}

/**
 * Classify any generation request into an explicit service-owned command.
 * Never returns a legacy transport owner or unsupported→legacy branch (R1).
 *
 * @param {object} input
 */
export function createGenerationCommand({
    kind = '',
    mainApi = '',
    selectedGroup = false,
    dryRun = false,
    depth = 0,
    quietPrompt = false,
    quietToLoud = false,
    backgroundGeneration = false,
} = {}) {
    const normalizedKind = String(kind ?? '');
    let effectiveKind = normalizedKind;

    // Allow callers that only set quiet/background flags without a dedicated kind.
    if (!allKindSet.has(effectiveKind)) {
        if (backgroundGeneration) {
            effectiveKind = 'backgroundGeneration';
        } else if (quietToLoud) {
            effectiveKind = 'quietToLoud';
        } else if (quietPrompt) {
            effectiveKind = 'quietPrompt';
        }
    }

    if (!allKindSet.has(effectiveKind)) {
        return {
            owner: GENERATION_SERVICE_OWNER,
            kind: normalizedKind,
            lifecycleType: mapGenerationCommandKindToLifecycleType(normalizedKind),
            visibility: '',
            status: GENERATION_COMMAND_STATUSES.UNSUPPORTED_WITH_REASON,
            path: GENERATION_COMMAND_PATHS.UNKNOWN_GENERATION_KIND,
            reason: GENERATION_COMMAND_REASONS.UNSUPPORTED_KIND,
            mainApi: String(mainApi ?? ''),
            selectedGroup: Boolean(selectedGroup),
            dryRun: Boolean(dryRun),
            depth: Number(depth) || 0,
            capabilities: {
                visibility: '',
                autoRecover: false,
                usesStreamingTransport: false,
                bindsVisibleMessageRow: false,
                producesVisibleRow: false,
                returnsGeneratedText: false,
                finalizationStrategy: 'reject',
                rollbackStrategy: 'caller-owned',
                allowsNestedDepth: false,
                allowsDryRun: false,
                allowsGroup: false,
                allowsNonOpenAI: false,
            },
            // Explicit rejection — never route unknown kinds through a legacy owner.
            executable: false,
        };
    }

    const visibility = getGenerationCommandVisibility(effectiveKind);
    const isQuietFamily = visibility === GENERATION_COMMAND_VISIBILITY.NON_VISIBLE;
    let path = GENERATION_COMMAND_PATHS.STANDARD_OPENAI_VISIBLE_DIRECT_CHAT;
    let reason = GENERATION_COMMAND_REASONS.SUPPORTED_KIND;

    if (isQuietFamily) {
        if (effectiveKind === 'backgroundGeneration' || backgroundGeneration) {
            path = GENERATION_COMMAND_PATHS.BACKGROUND_NON_VISIBLE_HELPER;
            reason = GENERATION_COMMAND_REASONS.BACKGROUND_GENERATION;
        } else if (effectiveKind === 'quietToLoud' || quietToLoud) {
            path = GENERATION_COMMAND_PATHS.QUIET_TO_LOUD_NON_VISIBLE_HELPER;
            reason = GENERATION_COMMAND_REASONS.QUIET_TO_LOUD;
        } else {
            path = GENERATION_COMMAND_PATHS.QUIET_NON_VISIBLE_HELPER;
            reason = GENERATION_COMMAND_REASONS.QUIET_GENERATION;
        }
    } else if (quietPrompt || quietToLoud) {
        path = GENERATION_COMMAND_PATHS.QUIET_GENERATION;
        reason = GENERATION_COMMAND_REASONS.QUIET_GENERATION;
    } else if (backgroundGeneration) {
        path = GENERATION_COMMAND_PATHS.BACKGROUND_GENERATION;
        reason = GENERATION_COMMAND_REASONS.BACKGROUND_GENERATION;
    } else if (Number(depth) > 0) {
        path = GENERATION_COMMAND_PATHS.NESTED_VISIBLE_GENERATION;
        reason = GENERATION_COMMAND_REASONS.NESTED_GENERATION;
    } else if (dryRun) {
        path = GENERATION_COMMAND_PATHS.DRY_RUN;
        reason = GENERATION_COMMAND_REASONS.DRY_RUN;
    } else if (selectedGroup) {
        path = GENERATION_COMMAND_PATHS.GROUP_CHAT;
        reason = GENERATION_COMMAND_REASONS.GROUP_CHAT;
    } else if (mainApi && mainApi !== 'openai') {
        path = GENERATION_COMMAND_PATHS.NON_OPENAI_PROVIDER;
        reason = GENERATION_COMMAND_REASONS.NON_OPENAI_PROVIDER;
    }

    const capabilities = buildGenerationCommandCapabilities({
        kind: effectiveKind,
        mainApi,
        selectedGroup,
        dryRun,
        depth,
        quietPrompt: quietPrompt || isQuietFamily,
        quietToLoud: quietToLoud || effectiveKind === 'quietToLoud',
        backgroundGeneration: backgroundGeneration || effectiveKind === 'backgroundGeneration',
    });

    return {
        owner: GENERATION_SERVICE_OWNER,
        kind: effectiveKind,
        lifecycleType: mapGenerationCommandKindToLifecycleType(effectiveKind),
        visibility: capabilities.visibility,
        status: GENERATION_COMMAND_STATUSES.SERVICE_OWNED,
        path,
        reason,
        mainApi: String(mainApi ?? ''),
        selectedGroup: Boolean(selectedGroup),
        dryRun: Boolean(dryRun),
        depth: Number(depth) || 0,
        capabilities,
        executable: true,
    };
}

/**
 * Preserve shell/provider inputs in an opaque envelope while adding the stable
 * service command used for routing and lifecycle ownership.
 *
 * @param {object} input
 * @returns {object}
 */
export function createGenerationRequestEnvelope({
    type = 'normal',
    options = {},
    dryRun = false,
    mainApi = '',
    selectedGroup = false,
    kind = '',
} = {}) {
    const effectiveKind = kind || mapLegacyGenerationTypeToCommandKind(type, options);
    const depth = Number(options?.depth) || 0;
    const command = createGenerationCommand({
        kind: effectiveKind,
        mainApi,
        selectedGroup,
        dryRun,
        depth,
        quietPrompt: type === 'quiet',
        quietToLoud: options?.quietToLoud === true,
        backgroundGeneration: options?.backgroundGeneration === true,
    });

    return {
        owner: GENERATION_SERVICE_OWNER,
        type: String(type ?? 'normal'),
        kind: effectiveKind,
        options,
        dryRun: Boolean(dryRun),
        mainApi: String(mainApi ?? ''),
        selectedGroup: Boolean(selectedGroup),
        command,
    };
}

/**
 * Create a lifecycle plan for a generation command.
 * Quiet/background/dry-run/nested/non-OpenAI stay single-attempt; visible OpenAI gets bounded recovery.
 *
 * @param {object} commandOrInput - result of createGenerationCommand or raw input fields
 * @param {{ fallbackReady?: boolean, statusLabels?: object }} [options]
 */
export function createGenerationCommandPlan(commandOrInput = {}, options = {}) {
    const command = commandOrInput?.owner === GENERATION_SERVICE_OWNER
        ? commandOrInput
        : createGenerationCommand(commandOrInput);

    const { fallbackReady = false, statusLabels = {} } = options;
    const lifecyclePlan = createGenerationLifecyclePlan({
        type: command.lifecycleType,
        mainApi: command.mainApi,
        dryRun: command.dryRun,
        depth: command.depth,
        fallbackReady,
        statusLabels,
    });

    // Capability contract is authoritative for auto-recovery (keeps group visible OpenAI eligible
    // when lifecycle helpers already allow it; quiet/non-visible force single attempt).
    const shouldAutoRecover = Boolean(command.capabilities?.autoRecover && lifecyclePlan.shouldAutoRecover);
    const attempts = shouldAutoRecover
        ? lifecyclePlan.attempts
        : [{ label: 'primary', status: '', fallbackProvider: false }];
    const trace = attempts.map((attempt, index) => ({
        index,
        label: attempt.label,
        fallbackProvider: Boolean(attempt.fallbackProvider),
        recovery: index > 0,
    }));

    return {
        command,
        owner: GENERATION_SERVICE_OWNER,
        shouldAutoRecover,
        attempts,
        trace,
        baselineStrategy: command.capabilities?.rollbackStrategy ?? 'caller-owned',
        finalizationStrategy: command.capabilities?.finalizationStrategy ?? 'save-or-replace-message-row',
        producesVisibleRow: Boolean(command.capabilities?.producesVisibleRow),
        usesStreamingTransport: Boolean(command.capabilities?.usesStreamingTransport),
    };
}

/**
 * Execute a planned generation attempt sequence without knowing about DOM,
 * provider payloads, React, or the browser shell.
 *
 * @param {object} input
 * @returns {Promise<unknown>}
 */
export async function executeGenerationAttempts({
    attempts = [],
    prepareRetryAttempt = async () => {},
    runAttempt,
    handleFailure,
} = {}) {
    if (typeof runAttempt !== 'function' || typeof handleFailure !== 'function') {
        throw new TypeError('Generation attempt runner requires runAttempt and handleFailure callbacks.');
    }

    let lastException = null;
    for (let attemptIndex = 0; attemptIndex < attempts.length; attemptIndex += 1) {
        const attempt = attempts[attemptIndex];
        await prepareRetryAttempt(attempt, attemptIndex);

        try {
            return await runAttempt(attempt, attemptIndex);
        } catch (exception) {
            lastException = exception;
            const failure = await handleFailure(exception, attempt, attemptIndex);
            if (failure?.action !== 'retry') {
                throw failure?.exception ?? exception;
            }
        }
    }

    throw lastException ?? new Error('Generation command has no executable attempts.');
}

/**
 * Pure success/failure/abort outcome simulation used by unit matrix proof (PM).
 * Does not perform network I/O.
 *
 * @param {object} plan - createGenerationCommandPlan result
 * @param {{ outcome: 'success'|'failure'|'abort', attemptIndex?: number, failure?: unknown, hasActiveRecoveryMessage?: boolean }} scenario
 */
export function simulateGenerationCommandOutcome(plan, scenario = {}) {
    const {
        outcome = 'success',
        attemptIndex = 0,
        failure = null,
        hasActiveRecoveryMessage = false,
    } = scenario;
    const attempts = Array.isArray(plan?.attempts) ? plan.attempts : [];
    const attempt = attempts[attemptIndex] ?? attempts[0] ?? { label: 'primary', status: '', fallbackProvider: false };
    const isLastAttempt = attemptIndex >= attempts.length - 1;

    if (outcome === 'success') {
        const finalization = getGenerationSuccessFinalization({
            hasActiveRecoveryMessage,
            originalType: plan?.command?.lifecycleType,
            type: plan?.command?.lifecycleType,
        });
        return {
            owner: GENERATION_SERVICE_OWNER,
            outcome: 'success',
            attempt,
            attemptIndex,
            shouldAutoRecover: Boolean(plan?.shouldAutoRecover),
            producesVisibleRow: Boolean(plan?.producesVisibleRow),
            finalization,
            failureDecision: null,
        };
    }

    const effectiveFailure = outcome === 'abort'
        ? (failure ?? new Error('Generation was aborted.'))
        : (failure ?? new TypeError('Failed to fetch'));

    const failureDecision = getGenerationFailureDecision({
        shouldAutoRecover: Boolean(plan?.shouldAutoRecover),
        failure: effectiveFailure,
        isIntermediateAttempt: !isLastAttempt,
    });

    return {
        owner: GENERATION_SERVICE_OWNER,
        outcome,
        attempt,
        attemptIndex,
        shouldAutoRecover: Boolean(plan?.shouldAutoRecover),
        producesVisibleRow: Boolean(plan?.producesVisibleRow),
        finalization: null,
        failureDecision,
        nextAttemptIndex: failureDecision.action === 'retry' ? attemptIndex + 1 : null,
    };
}
