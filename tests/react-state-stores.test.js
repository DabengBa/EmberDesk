import { describe, expect, jest, test } from '@jest/globals';

import {
    getWorkspacePanelSnapshot,
    recordWorkspacePanelMount,
    recordWorkspacePanelUnmount,
    recordWorkspacePanelUpdate,
    resetWorkspacePanelStore,
    subscribeWorkspacePanel,
} from '../app/stores/workspace-panel-store.js';
import {
    getMainChatObservationSnapshot,
    resetMainChatObservationStore,
    subscribeMainChatObservation,
    updateMainChatObservation,
} from '../app/stores/main-chat-observation-store.js';

describe('React state stores', () => {
    test('records workspace panel lifecycle without requiring DOM globals', () => {
        resetWorkspacePanelStore();
        const listener = jest.fn();
        const unsubscribe = subscribeWorkspacePanel('worldInfo', listener);

        expect(getWorkspacePanelSnapshot('worldInfo')).toEqual({
            bridgeAttached: false,
            kind: 'worldInfo',
            mountStatus: 'unmounted',
            state: null,
            updatedAt: 0,
        });

        recordWorkspacePanelMount('worldInfo', { selectedWorldName: 'World A' }, { dispatchAction: () => undefined });

        expect(getWorkspacePanelSnapshot('worldInfo')).toMatchObject({
            bridgeAttached: true,
            kind: 'worldInfo',
            mountStatus: 'mounted',
            state: { selectedWorldName: 'World A' },
        });
        expect(listener).toHaveBeenCalledTimes(1);

        recordWorkspacePanelUpdate('worldInfo', { selectedWorldName: 'World B' });
        expect(getWorkspacePanelSnapshot('worldInfo')).toMatchObject({
            state: { selectedWorldName: 'World B' },
            mountStatus: 'mounted',
        });
        expect(listener).toHaveBeenCalledTimes(2);

        recordWorkspacePanelUnmount('worldInfo');
        expect(getWorkspacePanelSnapshot('worldInfo')).toEqual({
            bridgeAttached: false,
            kind: 'worldInfo',
            mountStatus: 'unmounted',
            state: null,
            updatedAt: 0,
        });

        unsubscribe();
    });

    test('rejects unsupported workspace panel kinds instead of inventing state', () => {
        resetWorkspacePanelStore();

        expect(() => getWorkspacePanelSnapshot('unknownPanel')).toThrow('Unsupported workspace panel kind');
        expect(() => recordWorkspacePanelMount('unknownPanel', {})).toThrow('Unsupported workspace panel kind');
    });

    test('records sanitized main-chat observation snapshots and resets safely', () => {
        resetMainChatObservationStore();
        const listener = jest.fn();
        const unsubscribe = subscribeMainChatObservation(listener);

        expect(getMainChatObservationSnapshot()).toEqual({
            activeMessageId: null,
            chatId: null,
            generationPhase: 'idle',
            messageCount: 0,
            streamingPhase: 'idle',
            updatedAt: 0,
            visibleMessageIds: [],
        });

        updateMainChatObservation({
            chatId: 'chat-1',
            messageCount: 3,
            visibleMessageIds: ['1', 2, null, '3'],
            generationControl: { phase: 'streaming', activeMessageId: 2 },
            streamingTransport: { phase: 'streaming', activeMessageId: 2 },
        });

        expect(getMainChatObservationSnapshot()).toMatchObject({
            activeMessageId: 2,
            chatId: 'chat-1',
            generationPhase: 'streaming',
            messageCount: 3,
            streamingPhase: 'streaming',
            visibleMessageIds: ['1', '2', '3'],
        });
        expect(listener).toHaveBeenCalledTimes(1);

        resetMainChatObservationStore();
        expect(getMainChatObservationSnapshot()).toEqual({
            activeMessageId: null,
            chatId: null,
            generationPhase: 'idle',
            messageCount: 0,
            streamingPhase: 'idle',
            updatedAt: 0,
            visibleMessageIds: [],
        });

        unsubscribe();
    });
});
