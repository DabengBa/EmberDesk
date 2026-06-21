const STREAMING_TRANSPORT_PHASES = new Set([
    'idle',
    'connecting',
    'streaming',
    'finalizing',
    'stopped',
    'completed',
    'error',
]);

/**
 * Classifies streaming transport observation facts for the React main-chat bridge.
 *
 * This helper deliberately reports bridge metadata only. It must not own provider
 * requests, token append, retry routing, or visible DOM.
 *
 * @param {object} input
 * @param {'idle'|'connecting'|'streaming'|'finalizing'|'stopped'|'completed'|'error'} [input.phase]
 * @param {boolean} [input.isGenerating=false]
 * @param {boolean} [input.hasStreamingProcessor=false]
 * @param {boolean} [input.isFinalizing=false]
 * @param {boolean} [input.isStopped=false]
 * @param {boolean} [input.isFinished=false]
 * @param {boolean} [input.hasError=false]
 * @param {number|null} [input.activeMessageId=null]
 * @param {number} [input.observedTokenCount=0]
 * @param {number} [input.observedChunkCount=0]
 * @param {boolean} [input.fromFallbackAttempt=false]
 * @param {boolean} [input.recoverable=false]
 * @param {string|null} [input.errorLabel=null]
 * @returns {object}
 */
export function getMainChatStreamingTransportState({
    phase = null,
    isGenerating = false,
    hasStreamingProcessor = false,
    isFinalizing = false,
    isStopped = false,
    isFinished = false,
    hasError = false,
    activeMessageId = null,
    observedTokenCount = 0,
    observedChunkCount = 0,
    fromFallbackAttempt = false,
    recoverable = false,
    errorLabel = null,
} = {}) {
    const normalizedTokenCount = normalizeCount(observedTokenCount);
    const normalizedChunkCount = normalizeCount(observedChunkCount);
    const normalizedPhase = normalizePhase(phase, {
        isGenerating,
        hasStreamingProcessor,
        isFinalizing,
        isStopped,
        isFinished,
        hasError,
        observedTokenCount: normalizedTokenCount,
        observedChunkCount: normalizedChunkCount,
    });

    return {
        phase: normalizedPhase,
        activeMessageId: Number.isInteger(activeMessageId) && activeMessageId >= 0 ? activeMessageId : null,
        hasStreamingProcessor: Boolean(hasStreamingProcessor),
        observedTokenCount: normalizedTokenCount,
        observedChunkCount: normalizedChunkCount,
        fromFallbackAttempt: Boolean(fromFallbackAttempt),
        recoverable: Boolean(recoverable),
        errorLabel: typeof errorLabel === 'string' && errorLabel.trim() ? errorLabel.trim() : null,
    };
}

function normalizePhase(phase, {
    isGenerating,
    hasStreamingProcessor,
    isFinalizing,
    isStopped,
    isFinished,
    hasError,
    observedTokenCount,
    observedChunkCount,
}) {
    if (STREAMING_TRANSPORT_PHASES.has(phase)) {
        return phase;
    }

    if (hasError) {
        return 'error';
    }

    if (isStopped) {
        return 'stopped';
    }

    if (isFinalizing) {
        return 'finalizing';
    }

    if (isFinished) {
        return 'completed';
    }

    if (observedTokenCount > 0 || observedChunkCount > 0) {
        return 'streaming';
    }

    if (isGenerating || hasStreamingProcessor) {
        return 'connecting';
    }

    return 'idle';
}

function normalizeCount(value) {
    return Number.isInteger(value) && value >= 0 ? value : 0;
}
