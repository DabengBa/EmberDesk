import {
    MAIN_CHAT_VISIBLE_TRANSPORT_PATHS,
    MAIN_CHAT_VISIBLE_TRANSPORT_REASONS,
    MAIN_CHAT_VISIBLE_TRANSPORT_STATUSES,
    SUPPORTED_REACT_VISIBLE_GENERATION_KINDS,
} from './main-chat-bridge-contract.js';

const supportedReactVisibleGenerationKinds = new Set(SUPPORTED_REACT_VISIBLE_GENERATION_KINDS);

function createLegacyQuietTransportDecision({
    kind,
    path,
    reason,
} = {}) {
    return {
        owner: 'legacy',
        kind: String(kind ?? ''),
        status: MAIN_CHAT_VISIBLE_TRANSPORT_STATUSES.LEGACY_OWNED,
        path: String(path ?? ''),
        reason: String(reason ?? ''),
    };
}

export function classifyMainChatVisibleTransportSupport({
    kind = '',
    mainApi = '',
    selectedGroup = false,
    dryRun = false,
    depth = 0,
    quietPrompt = false,
    backgroundGeneration = false,
} = {}) {
    if (mainApi !== 'openai') {
        return {
            status: MAIN_CHAT_VISIBLE_TRANSPORT_STATUSES.LEGACY_FALLBACK,
            path: MAIN_CHAT_VISIBLE_TRANSPORT_PATHS.NON_OPENAI_PROVIDER,
            reason: MAIN_CHAT_VISIBLE_TRANSPORT_REASONS.UNSUPPORTED_API,
        };
    }

    if (selectedGroup) {
        return {
            status: MAIN_CHAT_VISIBLE_TRANSPORT_STATUSES.LEGACY_FALLBACK,
            path: MAIN_CHAT_VISIBLE_TRANSPORT_PATHS.GROUP_CHAT,
            reason: MAIN_CHAT_VISIBLE_TRANSPORT_REASONS.GROUP_CHAT,
        };
    }

    if (dryRun) {
        return {
            status: MAIN_CHAT_VISIBLE_TRANSPORT_STATUSES.LEGACY_FALLBACK,
            path: MAIN_CHAT_VISIBLE_TRANSPORT_PATHS.DRY_RUN,
            reason: MAIN_CHAT_VISIBLE_TRANSPORT_REASONS.DRY_RUN,
        };
    }

    if (Number(depth) > 0) {
        return {
            status: MAIN_CHAT_VISIBLE_TRANSPORT_STATUSES.LEGACY_FALLBACK,
            path: MAIN_CHAT_VISIBLE_TRANSPORT_PATHS.NESTED_VISIBLE_GENERATION,
            reason: MAIN_CHAT_VISIBLE_TRANSPORT_REASONS.NESTED_GENERATION,
        };
    }

    if (quietPrompt) {
        return {
            status: MAIN_CHAT_VISIBLE_TRANSPORT_STATUSES.LEGACY_FALLBACK,
            path: MAIN_CHAT_VISIBLE_TRANSPORT_PATHS.QUIET_GENERATION,
            reason: MAIN_CHAT_VISIBLE_TRANSPORT_REASONS.QUIET_GENERATION,
        };
    }

    if (backgroundGeneration) {
        return {
            status: MAIN_CHAT_VISIBLE_TRANSPORT_STATUSES.LEGACY_FALLBACK,
            path: MAIN_CHAT_VISIBLE_TRANSPORT_PATHS.BACKGROUND_GENERATION,
            reason: MAIN_CHAT_VISIBLE_TRANSPORT_REASONS.BACKGROUND_GENERATION,
        };
    }

    if (!supportedReactVisibleGenerationKinds.has(String(kind))) {
        return {
            status: MAIN_CHAT_VISIBLE_TRANSPORT_STATUSES.UNSUPPORTED_WITH_REASON,
            path: MAIN_CHAT_VISIBLE_TRANSPORT_PATHS.UNKNOWN_VISIBLE_GENERATION_KIND,
            reason: MAIN_CHAT_VISIBLE_TRANSPORT_REASONS.UNSUPPORTED_KIND,
        };
    }

    return {
        status: MAIN_CHAT_VISIBLE_TRANSPORT_STATUSES.REACT_OWNED,
        path: MAIN_CHAT_VISIBLE_TRANSPORT_PATHS.STANDARD_OPENAI_VISIBLE_DIRECT_CHAT,
        reason: MAIN_CHAT_VISIBLE_TRANSPORT_REASONS.SUPPORTED_KIND,
    };
}

export function createMainChatVisibleTransportDecision(input = {}) {
    const support = classifyMainChatVisibleTransportSupport(input);
    return {
        owner: support.status === MAIN_CHAT_VISIBLE_TRANSPORT_STATUSES.REACT_OWNED ? 'react' : 'legacy',
        kind: String(input?.kind ?? ''),
        status: support.status,
        path: support.path,
        reason: support.reason,
    };
}

export function createMainChatVisibleTransportFallbackDecision(decision = {}, { reason = 'legacy-executed' } = {}) {
    return {
        owner: 'legacy',
        kind: String(decision?.kind ?? ''),
        status: MAIN_CHAT_VISIBLE_TRANSPORT_STATUSES.LEGACY_FALLBACK,
        path: String(decision?.path ?? ''),
        reason,
    };
}

export function createMainChatQuietTransportDecision({
    quietToLoud = false,
    backgroundGeneration = false,
} = {}) {
    if (backgroundGeneration) {
        return createLegacyQuietTransportDecision({
            kind: 'backgroundGeneration',
            path: MAIN_CHAT_VISIBLE_TRANSPORT_PATHS.BACKGROUND_NON_VISIBLE_HELPER,
            reason: MAIN_CHAT_VISIBLE_TRANSPORT_REASONS.BACKGROUND_GENERATION,
        });
    }

    if (quietToLoud) {
        return createLegacyQuietTransportDecision({
            kind: 'quietToLoud',
            path: MAIN_CHAT_VISIBLE_TRANSPORT_PATHS.QUIET_TO_LOUD_NON_VISIBLE_HELPER,
            reason: MAIN_CHAT_VISIBLE_TRANSPORT_REASONS.QUIET_TO_LOUD,
        });
    }

    return createLegacyQuietTransportDecision({
        kind: 'quietPrompt',
        path: MAIN_CHAT_VISIBLE_TRANSPORT_PATHS.QUIET_NON_VISIBLE_HELPER,
        reason: MAIN_CHAT_VISIBLE_TRANSPORT_REASONS.QUIET_GENERATION,
    });
}

export function classifyMainChatVisibleTransportOwner(input = {}) {
    const support = createMainChatVisibleTransportDecision(input);
    return {
        owner: support.owner,
        reason: support.reason,
    };
}

/**
 * @param {{
 *   runtime?: Record<string, any> | null,
 *   decision?: Record<string, any> | null,
 *   contract?: Record<string, any> | null,
 * }} [input]
 */
export function deriveReactQuietTransportBridgeState({
    runtime = null,
    decision = null,
    contract = null,
} = {}) {
    return {
        quietTransportOwner: runtime?.owner ?? decision?.owner ?? 'legacy',
        quietTransportKind: runtime?.kind ?? decision?.kind ?? '',
        quietTransportStatus: runtime?.status ?? decision?.status ?? '',
        quietTransportPath: runtime?.path ?? decision?.path ?? '',
        quietTransportReason: runtime?.reason ?? decision?.reason ?? '',
        quietTransportPhase: runtime?.phase ?? 'idle',
        quietTransportError: runtime?.error ?? '',
        quietTransportAutoRecover: runtime?.autoRecover ?? contract?.autoRecover ?? false,
        quietTransportUsesStreaming: runtime?.usesStreamingTransport ?? contract?.usesStreamingTransport ?? false,
        quietTransportBindsVisibleRow: runtime?.bindsVisibleMessageRow ?? contract?.bindsVisibleMessageRow ?? false,
        quietTransportFinalization: runtime?.finalizationStrategy ?? contract?.finalizationStrategy ?? '',
        quietTransportRollback: runtime?.rollbackStrategy ?? contract?.rollbackStrategy ?? '',
    };
}

/**
 * @param {{
 *   runtime?: Record<string, any> | null,
 *   decision?: Record<string, any> | null,
 *   generationControl?: Record<string, any> | null,
 *   streamingTransport?: Record<string, any> | null,
 * }} [input]
 */
export function deriveReactVisibleTransportBridgeState({
    runtime = null,
    decision = null,
    generationControl = null,
    streamingTransport = null,
} = {}) {
    if (runtime && runtime.owner === 'react') {
        return {
            visibleTransportOwner: 'react',
            visibleTransportKind: runtime.kind ?? '',
            visibleTransportStatus: runtime.supportStatus ?? MAIN_CHAT_VISIBLE_TRANSPORT_STATUSES.REACT_OWNED,
            visibleTransportPath: runtime.supportPath ?? MAIN_CHAT_VISIBLE_TRANSPORT_PATHS.STANDARD_OPENAI_VISIBLE_DIRECT_CHAT,
            visibleTransportReason: runtime.supportReason ?? MAIN_CHAT_VISIBLE_TRANSPORT_REASONS.SUPPORTED_KIND,
            generationControlPhase: runtime.phase ?? 'idle',
            failureRetryVisible: runtime.failureRetryVisible === true,
            streamingPhase: runtime.phase ?? 'idle',
            activeMessageId: Number.isInteger(runtime.activeMessageId) ? runtime.activeMessageId : null,
            observedTokenCount: Number.isInteger(runtime.observedTokenCount) ? runtime.observedTokenCount : 0,
            fromFallbackAttempt: runtime.fromFallbackAttempt === true,
        };
    }

    return {
        visibleTransportOwner: decision?.owner ?? 'legacy',
        visibleTransportKind: decision?.kind ?? '',
        visibleTransportStatus: decision?.status ?? '',
        visibleTransportPath: decision?.path ?? '',
        visibleTransportReason: decision?.reason ?? '',
        generationControlPhase: generationControl?.phase ?? 'idle',
        failureRetryVisible: generationControl?.failureRetryVisible === true,
        streamingPhase: streamingTransport?.phase ?? 'idle',
        activeMessageId: Number.isInteger(streamingTransport?.activeMessageId) ? streamingTransport.activeMessageId : null,
        observedTokenCount: Number.isInteger(streamingTransport?.observedTokenCount) ? streamingTransport.observedTokenCount : 0,
        fromFallbackAttempt: streamingTransport?.fromFallbackAttempt === true,
    };
}
