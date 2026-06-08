/**
 * Classifies generation controls without owning token append, row creation, or provider retry.
 * @param {object} input Streaming/generation state flags
 * @param {boolean} [input.isGenerating=false] Whether generation is active
 * @param {boolean} [input.hasStreamingProcessor=false] Whether a streaming processor exists
 * @param {boolean} [input.isStopped=false] Whether the current generation was stopped
 * @param {boolean} [input.isFinished=false] Whether the current generation completed
 * @param {boolean} [input.hasError=false] Whether generation ended in an error-like fallback
 * @returns {object} Control recovery decisions
 */
export function getStreamingControlState({
    isGenerating = false,
    hasStreamingProcessor = false,
    isStopped = false,
    isFinished = false,
    hasError = false,
} = {}) {
    if (hasError) {
        return createRecoverableState('error');
    }

    if (isStopped) {
        return createRecoverableState('stopped');
    }

    if (isFinished) {
        return createRecoverableState('completed');
    }

    if (isGenerating || hasStreamingProcessor) {
        return {
            state: 'streaming',
            composerDisabled: true,
            sendVisible: false,
            stopVisible: true,
            continueVisible: false,
            canRecoverInput: false,
        };
    }

    return {
        state: 'idle',
        composerDisabled: false,
        sendVisible: true,
        stopVisible: false,
        continueVisible: false,
        canRecoverInput: true,
    };
}

function createRecoverableState(state) {
    return {
        state,
        composerDisabled: false,
        sendVisible: true,
        stopVisible: false,
        continueVisible: true,
        canRecoverInput: true,
    };
}
