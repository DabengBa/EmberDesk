import { describe, expect, jest, test } from '@jest/globals';

import {
    createReactRuntimeProvider,
} from '../public/scripts/react-runtime-provider.js';

describe('React runtime provider', () => {
    test('defers context reads until a consumer requests a snapshot', () => {
        const getContext = jest.fn(() => ({
            chatId: 'chat-1',
            characterId: 3,
            name2: 'Assistant',
        }));
        const runtime = createReactRuntimeProvider({
            getContext,
            eventSource: {
                on: jest.fn(),
                removeListener: jest.fn(),
            },
            eventTypes: {},
            commands: {
                submitMessage: () => undefined,
                stopGeneration: () => undefined,
                retryMessage: () => undefined,
                loadEarlier: () => undefined,
                saveSettings: () => undefined,
            },
        });

        expect(getContext).not.toHaveBeenCalled();
        expect(runtime.getSnapshot()).toEqual(expect.objectContaining({
            chat: expect.objectContaining({ id: 'chat-1' }),
        }));
        expect(getContext).toHaveBeenCalledTimes(1);
    });

    test('projects a frozen context snapshot and forwards named commands', async () => {
        const context = {
            chatId: 'chat-1',
            characterId: 3,
            name2: 'Assistant',
        };
        const commands = {
            submitMessage: jest.fn(),
            stopGeneration: jest.fn(),
            retryMessage: jest.fn(),
            loadEarlier: jest.fn(),
            saveSettings: jest.fn(),
        };
        const eventSource = {
            on: jest.fn(),
            removeListener: jest.fn(),
        };
        const runtime = createReactRuntimeProvider({
            getContext: () => context,
            eventSource,
            eventTypes: {
                CHAT_CHANGED: 'chat_changed',
                SETTINGS_UPDATED: 'settings_updated',
                GENERATION_STARTED: 'generation_started',
                GENERATION_STOPPED: 'generation_stopped',
                GENERATION_ENDED: 'generation_ended',
            },
            commands,
        });

        const snapshot = runtime.getSnapshot();
        expect(snapshot).toEqual({
            chat: {
                id: 'chat-1',
                characterId: '3',
                title: 'Assistant',
            },
            generation: {
                phase: 'idle',
            },
        });
        expect(Object.isFrozen(snapshot)).toBe(true);
        expect(Object.isFrozen(snapshot.chat)).toBe(true);
        expect(() => {
            snapshot.chat.id = 'mutated';
        }).toThrow();

        await runtime.commands.submitMessage('hello');
        runtime.commands.stopGeneration();
        await runtime.commands.retryMessage('4');
        await runtime.commands.loadEarlier('2');
        await runtime.commands.saveSettings({ oai_settings: { temperature: 0.7 } });

        expect(commands.submitMessage).toHaveBeenCalledWith('hello');
        expect(commands.stopGeneration).toHaveBeenCalledTimes(1);
        expect(commands.retryMessage).toHaveBeenCalledWith('4');
        expect(commands.loadEarlier).toHaveBeenCalledWith('2');
        expect(commands.saveSettings).toHaveBeenCalledWith({ oai_settings: { temperature: 0.7 } });
    });

    test('subscribes only to named lifecycle events and detaches them', () => {
        const listeners = new Map();
        const eventSource = {
            on: jest.fn((eventName, listener) => listeners.set(eventName, listener)),
            removeListener: jest.fn((eventName, listener) => listeners.delete(eventName, listener)),
        };
        const runtime = createReactRuntimeProvider({
            getContext: () => ({}),
            eventSource,
            eventTypes: {
                CHAT_CHANGED: 'chat_changed',
                SETTINGS_UPDATED: 'settings_updated',
                GENERATION_STARTED: 'generation_started',
                GENERATION_STOPPED: 'generation_stopped',
                GENERATION_ENDED: 'generation_ended',
            },
            commands: {
                submitMessage: () => undefined,
                stopGeneration: () => undefined,
                retryMessage: () => undefined,
                loadEarlier: () => undefined,
                saveSettings: () => undefined,
            },
        });
        const listener = jest.fn();

        const unsubscribe = runtime.subscribe(listener);

        expect(eventSource.on).toHaveBeenCalledTimes(5);
        expect([...listeners.keys()]).toEqual([
            'chat_changed',
            'settings_updated',
            'generation_started',
            'generation_stopped',
            'generation_ended',
        ]);
        listeners.get('chat_changed')();
        expect(listener).toHaveBeenCalledTimes(1);

        unsubscribe();
        expect(eventSource.removeListener).toHaveBeenCalledTimes(5);
        expect(listeners.size).toBe(0);
    });

    test('caches snapshots until a named lifecycle event refreshes the runtime state', () => {
        const context = {
            chatId: 'chat-1',
            characterId: 3,
            name2: 'Assistant',
        };
        const listeners = new Map();
        const eventSource = {
            on: jest.fn((eventName, listener) => listeners.set(eventName, listener)),
            removeListener: jest.fn((eventName, listener) => listeners.delete(eventName, listener)),
        };
        const runtime = createReactRuntimeProvider({
            getContext: () => context,
            eventSource,
            eventTypes: {
                CHAT_CHANGED: 'chat_changed',
                SETTINGS_UPDATED: 'settings_updated',
                GENERATION_STARTED: 'generation_started',
                GENERATION_STOPPED: 'generation_stopped',
                GENERATION_ENDED: 'generation_ended',
            },
            commands: {
                submitMessage: () => undefined,
                stopGeneration: () => undefined,
                retryMessage: () => undefined,
                loadEarlier: () => undefined,
                saveSettings: () => undefined,
            },
        });
        const initialSnapshot = runtime.getSnapshot();
        const listener = jest.fn();

        expect(runtime.getSnapshot()).toBe(initialSnapshot);

        const unsubscribe = runtime.subscribe(listener);
        context.chatId = 'chat-2';
        listeners.get('chat_changed')();

        expect(listener).toHaveBeenCalledTimes(1);
        expect(runtime.getSnapshot()).toEqual(expect.objectContaining({
            chat: expect.objectContaining({ id: 'chat-2' }),
        }));
        expect(runtime.getSnapshot()).not.toBe(initialSnapshot);

        unsubscribe();
    });
});
