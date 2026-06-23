const SUPPORTED_REACT_VISIBLE_GENERATION_KINDS = new Set([
    'submitComposer',
    'continueLast',
    'retryGeneration',
    'swipeLeft',
    'swipeRight',
]);

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

export function classifyMainChatVisibleTransportOwner(input = {}) {
    const support = classifyMainChatVisibleTransportSupport(input);
    return {
        owner: support.status === 'react-owned' ? 'react' : 'legacy',
        reason: support.reason,
    };
}

export function deriveReactVisibleTransportBridgeState({
    runtime = null,
    generationControl = null,
    streamingTransport = null,
} = {}) {
    if (runtime && runtime.owner === 'react') {
        return {
            visibleTransportOwner: 'react',
            generationControlPhase: runtime.phase ?? 'idle',
            failureRetryVisible: runtime.failureRetryVisible === true,
            streamingPhase: runtime.phase ?? 'idle',
            activeMessageId: Number.isInteger(runtime.activeMessageId) ? runtime.activeMessageId : null,
            observedTokenCount: Number.isInteger(runtime.observedTokenCount) ? runtime.observedTokenCount : 0,
            fromFallbackAttempt: runtime.fromFallbackAttempt === true,
        };
    }

    return {
        visibleTransportOwner: 'legacy',
        generationControlPhase: generationControl?.phase ?? 'idle',
        failureRetryVisible: generationControl?.failureRetryVisible === true,
        streamingPhase: streamingTransport?.phase ?? 'idle',
        activeMessageId: Number.isInteger(streamingTransport?.activeMessageId) ? streamingTransport.activeMessageId : null,
        observedTokenCount: Number.isInteger(streamingTransport?.observedTokenCount) ? streamingTransport.observedTokenCount : 0,
        fromFallbackAttempt: streamingTransport?.fromFallbackAttempt === true,
    };
}
