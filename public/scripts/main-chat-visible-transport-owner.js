const SUPPORTED_REACT_VISIBLE_GENERATION_KINDS = new Set([
    'submitComposer',
    'continueLast',
    'retryGeneration',
    'swipeLeft',
    'swipeRight',
]);

export function classifyMainChatVisibleTransportOwner({
    kind = '',
    mainApi = '',
    selectedGroup = false,
    dryRun = false,
    depth = 0,
} = {}) {
    if (mainApi !== 'openai') {
        return { owner: 'legacy', reason: 'unsupported-api' };
    }

    if (selectedGroup) {
        return { owner: 'legacy', reason: 'group-chat' };
    }

    if (dryRun) {
        return { owner: 'legacy', reason: 'dry-run' };
    }

    if (Number(depth) > 0) {
        return { owner: 'legacy', reason: 'nested-generation' };
    }

    if (!SUPPORTED_REACT_VISIBLE_GENERATION_KINDS.has(String(kind))) {
        return { owner: 'legacy', reason: 'unsupported-kind' };
    }

    return { owner: 'react', reason: 'supported-kind' };
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
