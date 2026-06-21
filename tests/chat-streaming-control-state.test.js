import { describe, expect, test } from '@jest/globals';

async function importFreshControlStateModule() {
    return import(`../public/scripts/chat-streaming-control-state.js?cacheBust=${Date.now()}-${Math.random()}`);
}

describe('chat streaming control state', () => {
    test.each([
        ['idle', { isGenerating: false }, {
            state: 'idle',
            phase: 'idle',
            composerDisabled: false,
            sendVisible: true,
            stopVisible: false,
            continueVisible: false,
            continueSurface: 'hidden',
            canRecoverInput: true,
            activeMessageId: null,
            recoveryStatusLabel: null,
            failureRetryVisible: false,
            failureNoticeVisible: false,
        }],
        ['streaming', { isGenerating: true, hasStreamingProcessor: true }, {
            state: 'streaming',
            phase: 'streaming',
            composerDisabled: true,
            sendVisible: false,
            stopVisible: true,
            continueVisible: false,
            continueSurface: 'hidden',
            canRecoverInput: false,
            activeMessageId: null,
            recoveryStatusLabel: null,
            failureRetryVisible: false,
            failureNoticeVisible: false,
        }],
        ['primary recovery', { isRecovering: true, isGenerating: true, recoveryStage: 'primary', recoveryStatusLabel: '正在重试', activeMessageId: 2 }, {
            state: 'recovering',
            phase: 'recoveringPrimary',
            composerDisabled: true,
            sendVisible: false,
            stopVisible: true,
            continueVisible: false,
            continueSurface: 'hidden',
            canRecoverInput: false,
            activeMessageId: 2,
            recoveryStatusLabel: '正在重试',
            failureRetryVisible: false,
            failureNoticeVisible: false,
        }],
        ['fallback recovery', { isRecovering: true, hasStreamingProcessor: true, recoveryStage: 'fallback', recoveryStatusLabel: '正在使用备用服务商', activeMessageId: 3 }, {
            state: 'recovering',
            phase: 'recoveringFallback',
            composerDisabled: true,
            sendVisible: false,
            stopVisible: true,
            continueVisible: false,
            continueSurface: 'hidden',
            canRecoverInput: false,
            activeMessageId: 3,
            recoveryStatusLabel: '正在使用备用服务商',
            failureRetryVisible: false,
            failureNoticeVisible: false,
        }],
        ['stopped', { isStopped: true }, {
            state: 'stopped',
            phase: 'stopped',
            composerDisabled: false,
            sendVisible: true,
            stopVisible: false,
            continueVisible: true,
            continueSurface: 'legacy',
            canRecoverInput: true,
            activeMessageId: null,
            recoveryStatusLabel: null,
            failureRetryVisible: false,
            failureNoticeVisible: false,
        }],
        ['completed', { isFinished: true }, {
            state: 'completed',
            phase: 'completed',
            composerDisabled: false,
            sendVisible: true,
            stopVisible: false,
            continueVisible: true,
            continueSurface: 'legacy',
            canRecoverInput: true,
            activeMessageId: null,
            recoveryStatusLabel: null,
            failureRetryVisible: false,
            failureNoticeVisible: false,
        }],
        ['error', { hasError: true, activeMessageId: 4, failureRetryVisible: true, failureNoticeVisible: true }, {
            state: 'error',
            phase: 'error',
            composerDisabled: false,
            sendVisible: true,
            stopVisible: false,
            continueVisible: true,
            continueSurface: 'legacy',
            canRecoverInput: true,
            activeMessageId: 4,
            recoveryStatusLabel: null,
            failureRetryVisible: true,
            failureNoticeVisible: true,
        }],
    ])('classifies %s control recovery without token or provider decisions', async (_name, input, expected) => {
        const { getStreamingControlState } = await importFreshControlStateModule();

        expect(getStreamingControlState(input)).toEqual(expected);
    });

    test('does not model provider pause or resume states', async () => {
        const { getStreamingControlState } = await importFreshControlStateModule();

        const controlState = getStreamingControlState({ isGenerating: true, isPaused: true });

        expect(controlState.phase).toBe('streaming');
        expect(controlState).not.toHaveProperty('pauseVisible');
        expect(controlState).not.toHaveProperty('resumeVisible');
    });

    test('prioritizes recovery over final failure UI while recovery is active', async () => {
        const { getStreamingControlState } = await importFreshControlStateModule();

        const controlState = getStreamingControlState({
            isRecovering: true,
            hasError: true,
            recoveryStage: 'fallback',
            activeMessageId: 7,
            recoveryStatusLabel: '正在使用备用服务商',
            failureRetryVisible: true,
            failureNoticeVisible: true,
        });

        expect(controlState).toMatchObject({
            state: 'recovering',
            phase: 'recoveringFallback',
            activeMessageId: 7,
            recoveryStatusLabel: '正在使用备用服务商',
            failureRetryVisible: false,
            failureNoticeVisible: false,
        });
    });

    test('normalizes unsafe bridge metadata without throwing', async () => {
        const { getStreamingControlState } = await importFreshControlStateModule();

        expect(getStreamingControlState({
            isRecovering: true,
            recoveryStage: 'unexpected',
            activeMessageId: '3',
            recoveryStatusLabel: '',
            failureRetryVisible: 'yes',
            failureNoticeVisible: 1,
        })).toMatchObject({
            phase: 'recoveringPrimary',
            activeMessageId: null,
            recoveryStatusLabel: null,
            failureRetryVisible: false,
            failureNoticeVisible: false,
        });

        expect(getStreamingControlState({
            hasError: true,
            activeMessageId: -1,
            recoveryStatusLabel: 42,
            failureRetryVisible: 'yes',
            failureNoticeVisible: 1,
        })).toMatchObject({
            phase: 'error',
            activeMessageId: null,
            recoveryStatusLabel: null,
            failureRetryVisible: true,
            failureNoticeVisible: true,
        });
    });

    test('derives continue visibility from the observed legacy continue surface', async () => {
        const { getStreamingControlState } = await importFreshControlStateModule();

        expect(getStreamingControlState({ hasError: true, continueSurface: 'hidden' })).toMatchObject({
            state: 'error',
            continueVisible: false,
            continueSurface: 'hidden',
        });

        expect(getStreamingControlState({ hasError: true, continueSurface: 'legacy' })).toMatchObject({
            state: 'error',
            continueVisible: true,
            continueSurface: 'legacy',
        });
    });
});

async function importFreshTransportStateModule() {
    return import(`../public/scripts/main-chat-streaming-transport-state.js?cacheBust=${Date.now()}-${Math.random()}`);
}

describe('main chat streaming transport bridge state', () => {
    test.each([
        ['idle', {}, {
            phase: 'idle',
            activeMessageId: null,
            hasStreamingProcessor: false,
            observedTokenCount: 0,
            observedChunkCount: 0,
            fromFallbackAttempt: false,
            recoverable: false,
            errorLabel: null,
        }],
        ['connecting', { isGenerating: true, hasStreamingProcessor: true, activeMessageId: 2 }, {
            phase: 'connecting',
            activeMessageId: 2,
            hasStreamingProcessor: true,
            observedTokenCount: 0,
            observedChunkCount: 0,
            fromFallbackAttempt: false,
            recoverable: false,
            errorLabel: null,
        }],
        ['streaming', { hasStreamingProcessor: true, activeMessageId: 3, observedTokenCount: 12, observedChunkCount: 4 }, {
            phase: 'streaming',
            activeMessageId: 3,
            hasStreamingProcessor: true,
            observedTokenCount: 12,
            observedChunkCount: 4,
            fromFallbackAttempt: false,
            recoverable: false,
            errorLabel: null,
        }],
        ['finalizing', { isFinalizing: true, activeMessageId: 4, observedTokenCount: 3 }, {
            phase: 'finalizing',
            activeMessageId: 4,
            hasStreamingProcessor: false,
            observedTokenCount: 3,
            observedChunkCount: 0,
            fromFallbackAttempt: false,
            recoverable: false,
            errorLabel: null,
        }],
        ['stopped', { isStopped: true, activeMessageId: 5, observedTokenCount: 2, recoverable: true }, {
            phase: 'stopped',
            activeMessageId: 5,
            hasStreamingProcessor: false,
            observedTokenCount: 2,
            observedChunkCount: 0,
            fromFallbackAttempt: false,
            recoverable: true,
            errorLabel: null,
        }],
        ['completed', { isFinished: true, activeMessageId: 6, observedTokenCount: 9 }, {
            phase: 'completed',
            activeMessageId: 6,
            hasStreamingProcessor: false,
            observedTokenCount: 9,
            observedChunkCount: 0,
            fromFallbackAttempt: false,
            recoverable: false,
            errorLabel: null,
        }],
        ['error', { hasError: true, activeMessageId: 7, fromFallbackAttempt: true, recoverable: true, errorLabel: 'empty reply' }, {
            phase: 'error',
            activeMessageId: 7,
            hasStreamingProcessor: false,
            observedTokenCount: 0,
            observedChunkCount: 0,
            fromFallbackAttempt: true,
            recoverable: true,
            errorLabel: 'empty reply',
        }],
    ])('classifies %s streaming transport state', async (_name, input, expected) => {
        const { getMainChatStreamingTransportState } = await importFreshTransportStateModule();

        expect(getMainChatStreamingTransportState(input)).toEqual(expected);
    });

    test('normalizes unsafe bridge metadata without exposing provider or token owner state', async () => {
        const { getMainChatStreamingTransportState } = await importFreshTransportStateModule();

        const transportState = getMainChatStreamingTransportState({
            isGenerating: true,
            activeMessageId: '4',
            observedTokenCount: -3,
            observedChunkCount: 1.5,
            fromFallbackAttempt: 'yes',
            recoverable: 1,
            errorLabel: '',
            providerRequest: { url: '/api/generate' },
            tokenBuffer: 'secret prompt text',
        });

        expect(transportState).toEqual({
            phase: 'connecting',
            activeMessageId: null,
            hasStreamingProcessor: false,
            observedTokenCount: 0,
            observedChunkCount: 0,
            fromFallbackAttempt: true,
            recoverable: true,
            errorLabel: null,
        });
        expect(transportState).not.toHaveProperty('providerRequest');
        expect(transportState).not.toHaveProperty('tokenBuffer');
    });
});
