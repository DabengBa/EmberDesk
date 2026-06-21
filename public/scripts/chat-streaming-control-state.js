/**
 * Classifies generation controls without owning token append, row creation, or provider retry.
 * @param {object} input Streaming/generation state flags
 * @param {boolean} [input.isGenerating=false] Whether generation is active
 * @param {boolean} [input.hasStreamingProcessor=false] Whether a streaming processor exists
 * @param {boolean} [input.isStopped=false] Whether the current generation was stopped
 * @param {boolean} [input.isFinished=false] Whether the current generation completed
 * @param {boolean} [input.hasError=false] Whether generation ended in an error-like fallback
 * @param {boolean} [input.isRecovering=false] Whether automatic recovery is active
 * @param {'primary'|'fallback'} [input.recoveryStage='primary'] Recovery attempt stage
 * @param {number|null} [input.activeMessageId=null] Message row associated with the control state
 * @param {string|null} [input.recoveryStatusLabel=null] Visible recovery status copy
 * @param {boolean} [input.failureRetryVisible=false] Whether final retry is visible
 * @param {boolean} [input.failureNoticeVisible=false] Whether final failure notice is visible
 * @param {'hidden'|'legacy'} [input.continueSurface='legacy'] Observed legacy continue surface
 * @returns {object} Control recovery decisions
 *
 * Priority is intentionally fail-closed for the bridge: recovery wins over
 * final failure UI, then error, stopped, completed, streaming, and idle.
 */
export function getStreamingControlState({
    isGenerating = false,
    hasStreamingProcessor = false,
    isStopped = false,
    isFinished = false,
    hasError = false,
    isRecovering = false,
    recoveryStage = 'primary',
    activeMessageId = null,
    recoveryStatusLabel = null,
    failureRetryVisible = false,
    failureNoticeVisible = false,
    continueSurface = 'legacy',
} = {}) {
    const observedContinueSurface = continueSurface === 'legacy' ? 'legacy' : 'hidden';
    const metadata = {
        activeMessageId: Number.isInteger(activeMessageId) && activeMessageId >= 0 ? activeMessageId : null,
        recoveryStatusLabel: typeof recoveryStatusLabel === 'string' && recoveryStatusLabel ? recoveryStatusLabel : null,
        failureRetryVisible: Boolean(failureRetryVisible),
        failureNoticeVisible: Boolean(failureNoticeVisible),
    };

    if (isRecovering) {
        return {
            state: 'recovering',
            phase: recoveryStage === 'fallback' ? 'recoveringFallback' : 'recoveringPrimary',
            composerDisabled: true,
            sendVisible: false,
            stopVisible: Boolean(isGenerating || hasStreamingProcessor),
            continueVisible: false,
            continueSurface: 'hidden',
            canRecoverInput: false,
            ...metadata,
            failureRetryVisible: false,
            failureNoticeVisible: false,
        };
    }

    if (hasError) {
        return createRecoverableState('error', metadata, observedContinueSurface);
    }

    if (isStopped) {
        return createRecoverableState('stopped', metadata, observedContinueSurface);
    }

    if (isFinished) {
        return createRecoverableState('completed', metadata, observedContinueSurface);
    }

    if (isGenerating || hasStreamingProcessor) {
        return {
            state: 'streaming',
            phase: 'streaming',
            composerDisabled: true,
            sendVisible: false,
            stopVisible: true,
            continueVisible: false,
            continueSurface: 'hidden',
            canRecoverInput: false,
            ...metadata,
        };
    }

    return {
        state: 'idle',
        phase: 'idle',
        composerDisabled: false,
        sendVisible: true,
        stopVisible: false,
        continueVisible: false,
        continueSurface: 'hidden',
        canRecoverInput: true,
        ...metadata,
    };
}

function createRecoverableState(state, metadata, continueSurface) {
    return {
        state,
        phase: state,
        composerDisabled: false,
        sendVisible: true,
        stopVisible: false,
        continueVisible: continueSurface === 'legacy',
        continueSurface,
        canRecoverInput: true,
        ...metadata,
    };
}
