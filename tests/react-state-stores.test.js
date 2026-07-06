import { describe, expect, jest, test } from '@jest/globals';

import {
    getWorkspacePanelDockSnapshot,
    getWorkspacePanelSnapshot,
    recordWorkspacePanelDockIntent,
    recordWorkspacePanelDockClose,
    recordWorkspacePanelDockResult,
    recordWorkspacePanelMount,
    recordWorkspacePanelUnmount,
    recordWorkspacePanelUpdate,
    resetWorkspacePanelStore,
    subscribeWorkspacePanelDock,
    subscribeWorkspacePanel,
    WORKSPACE_PANEL_DOCK_KINDS,
} from '../app/stores/workspace-panel-store.js';
import {
    getMainChatObservationSnapshot,
    resetMainChatObservationStore,
    subscribeMainChatObservation,
    updateMainChatObservation,
} from '../app/stores/main-chat-observation-store.js';

describe('React state stores', () => {
    test('declares every primary workspace shell panel as a dock kind', () => {
        expect(WORKSPACE_PANEL_DOCK_KINDS).toEqual([
            'aiConfig',
            'advancedFormatting',
            'characterLibrary',
            'worldInfo',
            'backgroundLibrary',
            'extensionsHost',
            'settings',
            'groupChats',
            'characterAuthoring',
        ]);
    });

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

    test('records transient workspace panel dock state for shell coordination', () => {
        resetWorkspacePanelStore();
        const listener = jest.fn();
        const unsubscribe = subscribeWorkspacePanelDock(listener);

        expect(getWorkspacePanelDockSnapshot()).toEqual({
            activePanelKind: null,
            activePanelStatus: 'idle',
            fallbackReason: null,
            lockedPanelKinds: [],
            openPanelKinds: [],
            pinnedPanelKinds: [],
            updatedAt: 0,
        });

        recordWorkspacePanelDockIntent('characterLibrary', { locked: true });

        expect(getWorkspacePanelDockSnapshot()).toMatchObject({
            activePanelKind: 'characterLibrary',
            activePanelStatus: 'loading',
            fallbackReason: null,
            lockedPanelKinds: ['characterLibrary'],
            openPanelKinds: ['characterLibrary'],
            pinnedPanelKinds: [],
        });
        expect(listener).toHaveBeenCalledTimes(1);

        recordWorkspacePanelDockResult('worldInfo', {
            fallbackReason: 'feature-disabled',
            pinned: true,
            status: 'disabled',
        });

        expect(getWorkspacePanelDockSnapshot()).toMatchObject({
            activePanelKind: 'worldInfo',
            activePanelStatus: 'disabled',
            fallbackReason: 'feature-disabled',
            lockedPanelKinds: ['characterLibrary'],
            openPanelKinds: ['characterLibrary', 'worldInfo'],
            pinnedPanelKinds: ['worldInfo'],
        });
        expect(listener).toHaveBeenCalledTimes(2);

        recordWorkspacePanelDockResult('worldInfo', {
            status: 'success',
            pinned: false,
        });
        expect(getWorkspacePanelDockSnapshot()).toMatchObject({
            activePanelKind: 'worldInfo',
            activePanelStatus: 'success',
            lockedPanelKinds: ['characterLibrary'],
            pinnedPanelKinds: [],
        });
        expect(listener).toHaveBeenCalledTimes(3);

        expect(() => recordWorkspacePanelDockIntent('mainChatMessageList')).toThrow('Unsupported workspace dock panel kind');

        unsubscribe();
    });

    test('keeps existing pinned and locked dock hints while refocusing a panel', () => {
        resetWorkspacePanelStore();

        recordWorkspacePanelDockResult('worldInfo', {
            locked: true,
            pinned: true,
            status: 'success',
        });
        recordWorkspacePanelDockIntent('worldInfo');

        expect(getWorkspacePanelDockSnapshot()).toMatchObject({
            activePanelKind: 'worldInfo',
            activePanelStatus: 'loading',
            lockedPanelKinds: ['worldInfo'],
            pinnedPanelKinds: ['worldInfo'],
        });

        recordWorkspacePanelDockResult('worldInfo', {
            fallbackReason: 'action-failed',
            status: 'error',
        });

        expect(getWorkspacePanelDockSnapshot()).toMatchObject({
            activePanelKind: 'worldInfo',
            activePanelStatus: 'error',
            fallbackReason: 'action-failed',
            lockedPanelKinds: ['worldInfo'],
            pinnedPanelKinds: ['worldInfo'],
        });

        recordWorkspacePanelDockResult('worldInfo', {
            locked: false,
            pinned: false,
            status: 'success',
        });

        expect(getWorkspacePanelDockSnapshot()).toMatchObject({
            activePanelKind: 'worldInfo',
            activePanelStatus: 'success',
            lockedPanelKinds: [],
            pinnedPanelKinds: [],
        });
    });

    test('clears active dock state when closing the active panel', () => {
        resetWorkspacePanelStore();

        recordWorkspacePanelDockResult('characterLibrary', {
            status: 'success',
        });
        recordWorkspacePanelDockClose('characterLibrary');

        expect(getWorkspacePanelDockSnapshot()).toMatchObject({
            activePanelKind: null,
            activePanelStatus: 'idle',
            fallbackReason: null,
            openPanelKinds: [],
        });
    });

    test('keeps active dock state when close result reports a pinned panel stayed visible', () => {
        resetWorkspacePanelStore();

        recordWorkspacePanelDockResult('characterLibrary', {
            locked: true,
            pinned: true,
            status: 'success',
        });
        recordWorkspacePanelDockClose('characterLibrary', {
            locked: true,
            pinned: true,
            status: 'success',
        });

        expect(getWorkspacePanelDockSnapshot()).toMatchObject({
            activePanelKind: 'characterLibrary',
            activePanelStatus: 'success',
            lockedPanelKinds: ['characterLibrary'],
            openPanelKinds: ['characterLibrary'],
            pinnedPanelKinds: ['characterLibrary'],
        });
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
