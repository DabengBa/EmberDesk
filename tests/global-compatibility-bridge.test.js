import { describe, expect, jest, test } from '@jest/globals';

import {
    attachGlobalCompatibilityBridge,
    detachGlobalCompatibilityBridge,
    getGlobalCompatibilityBridgeSnapshot,
    resetGlobalCompatibilityBridgeForTests,
} from '../app/compat/global-compatibility-bridge.js';
import {
    recordWorkspacePanelDockResult,
    recordWorkspacePanelMount,
    recordWorkspacePanelUpdate,
    resetWorkspacePanelStore,
} from '../app/stores/workspace-panel-store.js';
import {
    resetMainChatObservationStore,
    updateMainChatObservation,
} from '../app/stores/main-chat-observation-store.js';

function createLegacyScope() {
    return {
        SillyTavern: { getContext: jest.fn(() => ({ chatId: 'legacy-chat' })) },
        eventSource: {
            on: jest.fn(),
            once: jest.fn(),
            emit: jest.fn(),
            emitAndWait: jest.fn(),
            makeFirst: jest.fn(),
            makeLast: jest.fn(),
            removeListener: jest.fn(),
        },
        event_types: {
            CHAT_LOADED: 'chat_loaded',
            MORE_MESSAGES_LOADED: 'more_messages_loaded',
        },
    };
}

describe('global compatibility bridge', () => {
    test('attaches readonly React store snapshots without replacing legacy exports', () => {
        resetWorkspacePanelStore();
        resetMainChatObservationStore();
        resetGlobalCompatibilityBridgeForTests();
        const legacyScope = createLegacyScope();
        const originalExports = {
            SillyTavern: legacyScope.SillyTavern,
            eventSource: legacyScope.eventSource,
            event_types: legacyScope.event_types,
        };

        const controller = attachGlobalCompatibilityBridge({ legacyScope });
        recordWorkspacePanelMount('worldInfo', { selectedWorldName: 'World A' }, { dispatchAction: () => undefined });
        updateMainChatObservation({
            chatId: 'chat-1',
            messageCount: 2,
            visibleMessageIds: ['0', 1],
            generationControl: { phase: 'streaming', activeMessageId: 1 },
            streamingTransport: { phase: 'streaming', activeMessageId: 1 },
        });

        expect(legacyScope.SillyTavern).toBe(originalExports.SillyTavern);
        expect(legacyScope.eventSource).toBe(originalExports.eventSource);
        expect(legacyScope.event_types).toBe(originalExports.event_types);
        expect(legacyScope.__emberDeskReactCompatibilityBridge).toBe(controller.bridge);
        expect(controller.bridge.getSnapshot()).toMatchObject({
            attached: true,
            legacy: {
                hasSillyTavern: true,
                hasEventSource: true,
                hasEventTypes: true,
            },
            mainChatObservation: {
                activeMessageId: 1,
                chatId: 'chat-1',
                messageCount: 2,
                visibleMessageIds: ['0', '1'],
            },
            workspacePanels: {
                worldInfo: {
                    bridgeAttached: true,
                    kind: 'worldInfo',
                    mountStatus: 'mounted',
                    state: { selectedWorldName: 'World A' },
                },
            },
        });

        expect(() => {
            controller.bridge.snapshot.workspacePanels = {};
        }).toThrow();

        controller.detach();
        expect(legacyScope.__emberDeskReactCompatibilityBridge).toBeUndefined();
    });

    test('publishes workspace panel dock ownership without exposing behavior internals', () => {
        resetWorkspacePanelStore();
        resetMainChatObservationStore();
        resetGlobalCompatibilityBridgeForTests();
        const legacyScope = createLegacyScope();

        const controller = attachGlobalCompatibilityBridge({ legacyScope });
        recordWorkspacePanelDockResult('extensionsHost', {
            fallbackReason: 'bundle-load-failed',
            pinned: true,
            status: 'error',
        });

        expect(controller.bridge.getSnapshot().workspacePanelDock).toMatchObject({
            activePanelKind: 'extensionsHost',
            activePanelStatus: 'error',
            fallbackReason: 'bundle-load-failed',
            lockedPanelKinds: [],
            openPanelKinds: ['extensionsHost'],
            pinnedPanelKinds: ['extensionsHost'],
        });

        controller.detach();
    });

    test('updates snapshots, double attaches cleanly, and detaches subscriptions', () => {
        resetWorkspacePanelStore();
        resetMainChatObservationStore();
        resetGlobalCompatibilityBridgeForTests();
        const legacyScope = createLegacyScope();

        const first = attachGlobalCompatibilityBridge({ legacyScope });
        const second = attachGlobalCompatibilityBridge({ legacyScope });
        expect(first).toBe(second);

        recordWorkspacePanelUpdate('mainChatMessageList', { chatId: 'chat-a', messageCount: 1 });
        expect(getGlobalCompatibilityBridgeSnapshot({ legacyScope }).workspacePanels.mainChatMessageList).toMatchObject({
            mountStatus: 'mounted',
            state: { chatId: 'chat-a', messageCount: 1 },
        });

        second.detach();
        recordWorkspacePanelUpdate('mainChatMessageList', { chatId: 'chat-b', messageCount: 2 });

        expect(legacyScope.__emberDeskReactCompatibilityBridge).toBeUndefined();
        expect(getGlobalCompatibilityBridgeSnapshot({ legacyScope })).toEqual({
            attached: false,
            legacy: {
                hasSillyTavern: true,
                hasEventSource: true,
                hasEventTypes: true,
            },
            mainChatObservation: null,
            workspacePanelDock: null,
            workspacePanels: {},
        });
    });

    test('fails closed when legacy globals are missing or invalid', () => {
        resetWorkspacePanelStore();
        resetMainChatObservationStore();
        resetGlobalCompatibilityBridgeForTests();
        const legacyScope = {
            SillyTavern: null,
            eventSource: { emit: jest.fn() },
            event_types: null,
        };

        const controller = attachGlobalCompatibilityBridge({ legacyScope });

        expect(legacyScope.SillyTavern).toBeNull();
        expect(legacyScope.eventSource).toEqual({ emit: expect.any(Function) });
        expect(legacyScope.event_types).toBeNull();
        expect(controller.bridge.getSnapshot()).toMatchObject({
            attached: true,
            legacy: {
                hasSillyTavern: false,
                hasEventSource: false,
                hasEventTypes: false,
            },
        });

        detachGlobalCompatibilityBridge({ legacyScope });
        expect(legacyScope.__emberDeskReactCompatibilityBridge).toBeUndefined();
    });

    test('sanitizes non-serializable panel state instead of breaking subscribers', () => {
        resetWorkspacePanelStore();
        resetMainChatObservationStore();
        resetGlobalCompatibilityBridgeForTests();
        const legacyScope = createLegacyScope();
        const domLikeNode = {
            nodeType: 1,
            ownerDocument: {},
            dataset: { row: '37' },
            getAttribute: jest.fn(),
        };
        domLikeNode.ownerDocument.defaultView = { HTMLElement: function HTMLElement() {} };

        const controller = attachGlobalCompatibilityBridge({ legacyScope });

        expect(() => {
            recordWorkspacePanelUpdate('mainChatMessageList', {
                chatId: 'chat-a',
                chatContainer: domLikeNode,
                messageNodes: [domLikeNode],
                dispatch: () => undefined,
            });
        }).not.toThrow();

        expect(controller.bridge.getSnapshot().workspacePanels.mainChatMessageList.state).toEqual({
            chatId: 'chat-a',
        });

        controller.detach();
    });

    test('keeps non-main-chat compatibility snapshots on a safe allowlist', () => {
        resetWorkspacePanelStore();
        resetMainChatObservationStore();
        resetGlobalCompatibilityBridgeForTests();
        const legacyScope = createLegacyScope();

        const controller = attachGlobalCompatibilityBridge({ legacyScope });
        recordWorkspacePanelUpdate('extensionsHost', {
            extrasApiControlsPresent: true,
            extrasApiUrl: 'http://127.0.0.1:5100',
            extrasApiKey: 'secret-key',
            extrasApiKeySet: true,
            extrasStatusText: 'Connected',
            mountPointStatuses: [{ id: 'regex', label: 'Regex', ready: true }],
        });

        expect(controller.bridge.getSnapshot().workspacePanels.extensionsHost.state).toEqual({
            extrasApiControlsPresent: true,
            extrasApiKeySet: true,
            extrasStatusText: 'Connected',
            mountPointStatuses: [{ id: 'regex', label: 'Regex', ready: true }],
        });

        controller.detach();
    });


    test('does not publish the bridge as a third-party public contract entry', async () => {
        const { frontendCompatibilityContract, assertInternalNamesExcludedFromPublicManifest } = await import('./helpers/frontend-compatibility-contract.js');
        expect(() => assertInternalNamesExcludedFromPublicManifest()).not.toThrow();
        expect(frontendCompatibilityContract.exclusions.publicNames).toContain('__emberDeskReactCompatibilityBridge');

        const publicFamilies = frontendCompatibilityContract.entries
            .filter(entry => entry.family !== 'internal-bridge')
            .map(entry => JSON.stringify(entry));
        for (const serialized of publicFamilies) {
            expect(serialized).not.toContain('__emberDeskReactCompatibilityBridge');
        }
    });

    test('attach and detach leave public SillyTavern and event exports identity-stable', () => {
        resetWorkspacePanelStore();
        resetMainChatObservationStore();
        resetGlobalCompatibilityBridgeForTests();
        const legacyScope = createLegacyScope();
        const originalSilly = legacyScope.SillyTavern;
        const originalEvents = legacyScope.eventSource;
        const originalTypes = legacyScope.event_types;

        attachGlobalCompatibilityBridge({ legacyScope });
        expect(legacyScope.SillyTavern).toBe(originalSilly);
        expect(legacyScope.eventSource).toBe(originalEvents);
        expect(legacyScope.event_types).toBe(originalTypes);
        expect(legacyScope.__emberDeskReactCompatibilityBridge).toEqual(expect.objectContaining({
            getSnapshot: expect.any(Function),
        }));

        detachGlobalCompatibilityBridge({ legacyScope });
        expect(legacyScope.SillyTavern).toBe(originalSilly);
        expect(legacyScope.eventSource).toBe(originalEvents);
        expect(legacyScope.event_types).toBe(originalTypes);
        expect(legacyScope.__emberDeskReactCompatibilityBridge).toBeUndefined();
    });

});
