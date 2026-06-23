const SUPPORTED_REACT_VISIBLE_GENERATION_KINDS = new Set([
    'submitComposer',
    'continueLast',
    'retryGeneration',
    'swipeLeft',
    'swipeRight',
]);

function createLegacyQuietTransportDecision({
    kind,
    path,
    reason,
} = {}) {
    return {
        owner: 'legacy',
        kind: String(kind ?? ''),
        status: 'legacy-owned',
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
        return { status: 'legacy-fallback', path: 'non-openai-provider', reason: 'unsupported-api' };
    }

    if (selectedGroup) {
        return { status: 'legacy-fallback', path: 'group-chat', reason: 'group-chat' };
    }

    if (dryRun) {
        return { status: 'legacy-fallback', path: 'dry-run', reason: 'dry-run' };
    }

    if (Number(depth) > 0) {
        return { status: 'legacy-fallback', path: 'nested-visible-generation', reason: 'nested-generation' };
    }

    if (quietPrompt) {
        return { status: 'legacy-fallback', path: 'quiet-generation', reason: 'quiet-generation' };
    }

    if (backgroundGeneration) {
        return { status: 'legacy-fallback', path: 'background-generation', reason: 'background-generation' };
    }

    if (!SUPPORTED_REACT_VISIBLE_GENERATION_KINDS.has(String(kind))) {
        return { status: 'unsupported-with-reason', path: 'unknown-visible-generation-kind', reason: 'unsupported-kind' };
    }

    return { status: 'react-owned', path: 'standard-openai-visible-direct-chat', reason: 'supported-kind' };
}

export function createMainChatVisibleTransportDecision(input = {}) {
    const support = classifyMainChatVisibleTransportSupport(input);
    return {
        owner: support.status === 'react-owned' ? 'react' : 'legacy',
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
        status: 'legacy-fallback',
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
            path: 'background-non-visible-helper',
            reason: 'background-generation',
        });
    }

    if (quietToLoud) {
        return createLegacyQuietTransportDecision({
            kind: 'quietToLoud',
            path: 'quiet-to-loud-non-visible-helper',
            reason: 'quiet-to-loud',
        });
    }

    return createLegacyQuietTransportDecision({
        kind: 'quietPrompt',
        path: 'quiet-non-visible-helper',
        reason: 'quiet-generation',
    });
}

export function classifyMainChatVisibleTransportOwner(input = {}) {
    const support = createMainChatVisibleTransportDecision(input);
    return {
        owner: support.owner,
        reason: support.reason,
    };
}

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
            visibleTransportStatus: runtime.supportStatus ?? 'react-owned',
            visibleTransportPath: runtime.supportPath ?? 'standard-openai-visible-direct-chat',
            visibleTransportReason: runtime.supportReason ?? 'supported-kind',
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
