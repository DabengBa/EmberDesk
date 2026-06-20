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
});
