import { describe, expect, test } from '@jest/globals';

async function importFreshControlStateModule() {
    return import(`../public/scripts/chat-streaming-control-state.js?cacheBust=${Date.now()}-${Math.random()}`);
}

describe('chat streaming control state', () => {
    test.each([
        ['idle', { isGenerating: false }, {
            state: 'idle',
            composerDisabled: false,
            sendVisible: true,
            stopVisible: false,
            continueVisible: false,
            canRecoverInput: true,
        }],
        ['streaming', { isGenerating: true, hasStreamingProcessor: true }, {
            state: 'streaming',
            composerDisabled: true,
            sendVisible: false,
            stopVisible: true,
            continueVisible: false,
            canRecoverInput: false,
        }],
        ['stopped', { isStopped: true }, {
            state: 'stopped',
            composerDisabled: false,
            sendVisible: true,
            stopVisible: false,
            continueVisible: true,
            canRecoverInput: true,
        }],
        ['completed', { isFinished: true }, {
            state: 'completed',
            composerDisabled: false,
            sendVisible: true,
            stopVisible: false,
            continueVisible: true,
            canRecoverInput: true,
        }],
        ['error', { hasError: true }, {
            state: 'error',
            composerDisabled: false,
            sendVisible: true,
            stopVisible: false,
            continueVisible: true,
            canRecoverInput: true,
        }],
    ])('classifies %s control recovery without token or provider decisions', async (_name, input, expected) => {
        const { getStreamingControlState } = await importFreshControlStateModule();

        expect(getStreamingControlState(input)).toEqual(expected);
    });
});
