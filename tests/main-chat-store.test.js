import { describe, expect, test } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const storePath = path.join(repoRoot, 'app', 'stores', 'main-chat-store.ts');

function runStoreProbe(source) {
    const script = `
        import { createMainChatStore } from ${JSON.stringify(storePath)};
        ${source}
    `;

    return JSON.parse(execFileSync(
        process.execPath,
        ['--experimental-strip-types', '--input-type=module', '--eval', script],
        {
            cwd: repoRoot,
            encoding: 'utf8',
        },
    ));
}

describe('main chat store', () => {
    test('defines a DOM-free browser state owner', () => {
        const source = fs.readFileSync(storePath, 'utf8');

        expect(source).toContain('messagesById');
        expect(source).toContain('orderedMessageIds');
        expect(source).toContain('composer');
        expect(source).toContain('generation');
        expect(source).toContain('slash');
        expect(source).toContain('window');
        expect(source).not.toMatch(/\bHTMLElement\b/);
        expect(source).not.toMatch(/\bquerySelector(?:All)?\b/);
        expect(source).not.toContain('globalThis.SillyTavern');
        expect(source).not.toContain('eventSource');
    });

    test('publishes immutable snapshots with ordered message records and window state', () => {
        const result = runStoreProbe(`
            const store = createMainChatStore();
            store.getState().replaceSnapshot({
                chatId: 'chat-1',
                messagesById: {
                    '0': {
                        id: '0',
                        role: 'user',
                        name: 'User',
                        content: 'hello',
                        timestamp: '2026-08-14T00:00:00.000Z',
                        state: 'finalized',
                    },
                    '1': {
                        id: '1',
                        role: 'character',
                        name: 'Assistant',
                        content: 'hi',
                        timestamp: '2026-08-14T00:00:01.000Z',
                        state: 'streaming',
                        actionsExpanded: true,
                        reasoningOpen: true,
                        reasoningEditing: true,
                        reasoningEditText: 'Draft reasoning',
                    },
                },
                orderedMessageIds: ['0', '1'],
                composer: {
                    value: 'next',
                    activeContext: 'character',
                    focused: true,
                    disabled: false,
                },
                generation: {
                    phase: 'streaming',
                    activeMessageId: '1',
                },
                streaming: {
                    phase: 'streaming',
                    activeMessageId: '1',
                    observedTokenCount: 4,
                },
                slash: {
                    active: false,
                    query: '',
                    autocompleteVisible: false,
                },
                window: {
                    visibleMessageIds: ['0', '1'],
                    anchorMessageId: '0',
                    showMoreVisible: false,
                    scrollTop: 12,
                    scrollHeight: 500,
                    clientHeight: 300,
                    scrollRestore: {
                        anchorMessageId: '1',
                        anchorViewportOffset: 96,
                        scrollTop: 240,
                        wasNearBottom: false,
                    },
                },
            });

            const snapshot = store.getState().getSnapshot();
            console.log(JSON.stringify({
                snapshot,
                frozen: {
                    root: Object.isFrozen(snapshot),
                    messages: Object.isFrozen(snapshot.messagesById),
                    firstMessage: Object.isFrozen(snapshot.messagesById['0']),
                    order: Object.isFrozen(snapshot.orderedMessageIds),
                    window: Object.isFrozen(snapshot.window),
                },
            }));
        `);

        expect(result.snapshot).toMatchObject({
            chatId: 'chat-1',
            orderedMessageIds: ['0', '1'],
            messagesById: {
                '0': expect.objectContaining({ role: 'user', content: 'hello' }),
                '1': expect.objectContaining({ role: 'character', state: 'streaming' }),
            },
            composer: expect.objectContaining({ value: 'next', activeContext: 'character' }),
            generation: { phase: 'streaming', activeMessageId: '1' },
            streaming: {
                phase: 'streaming',
                activeMessageId: '1',
                observedTokenCount: 4,
            },
            slash: expect.objectContaining({ active: false }),
            window: expect.objectContaining({
                visibleMessageIds: ['0', '1'],
                anchorMessageId: '0',
                scrollTop: 12,
                scrollRestore: {
                    anchorMessageId: '1',
                    anchorViewportOffset: 96,
                    scrollTop: 240,
                    wasNearBottom: false,
                },
            }),
        });
        expect(result.snapshot.messagesById['1'].actionsExpanded).toBe(true);
        expect(result.snapshot.messagesById['1']).toMatchObject({
            reasoningOpen: true,
            reasoningEditing: true,
            reasoningEditText: 'Draft reasoning',
        });
        expect(result.frozen).toEqual({
            root: true,
            messages: true,
            firstMessage: true,
            order: true,
            window: true,
        });
    });

    test('normalizes and freezes typed slash autocomplete state', () => {
        const result = runStoreProbe(`
            const store = createMainChatStore();
            store.getState().replaceSnapshot({
                slash: {
                    active: true,
                    query: '/ec',
                    autocompleteVisible: true,
                    replaceable: true,
                    detailsVisible: false,
                    detailsHtml: '',
                    options: [{
                        name: 'echo',
                        type: 'command',
                        typeIcon: '>',
                        selectable: true,
                        selected: true,
                    }],
                    executing: false,
                    paused: false,
                    aborted: false,
                    errorLabel: null,
                },
            });

            const slash = store.getState().getSnapshot().slash;
            console.log(JSON.stringify({
                slash,
                frozen: {
                    slash: Object.isFrozen(slash),
                    options: Object.isFrozen(slash.options),
                    option: Object.isFrozen(slash.options[0]),
                },
            }));
        `);

        expect(result.slash).toEqual({
            active: true,
            query: '/ec',
            autocompleteVisible: true,
            replaceable: true,
            detailsVisible: false,
            detailsHtml: '',
            options: [{
                name: 'echo',
                type: 'command',
                typeIcon: '>',
                selectable: true,
                selected: true,
            }],
            executing: false,
            paused: false,
            aborted: false,
            errorLabel: null,
        });
        expect(result.frozen).toEqual({
            slash: true,
            options: true,
            option: true,
        });
    });

    test('notifies subscribers once per replacement and can reset to an empty chat', () => {
        const result = runStoreProbe(`
            const store = createMainChatStore();
            let notifications = 0;
            const unsubscribe = store.subscribe(() => {
                notifications += 1;
            });

            store.getState().replaceSnapshot({
                chatId: 'chat-1',
                messagesById: {},
                orderedMessageIds: [],
            });
            const replaced = store.getState().getSnapshot();
            store.getState().reset();
            const reset = store.getState().getSnapshot();
            unsubscribe();

            console.log(JSON.stringify({
                notifications,
                replacedChatId: replaced.chatId,
                reset,
            }));
        `);

        expect(result.notifications).toBe(2);
        expect(result.replacedChatId).toBe('chat-1');
        expect(result.reset).toMatchObject({
            chatId: null,
            messagesById: {},
            orderedMessageIds: [],
            generation: { phase: 'idle', activeMessageId: null },
            streaming: { phase: 'idle', activeMessageId: null, observedTokenCount: 0 },
            window: {
                visibleMessageIds: [],
                anchorMessageId: null,
                showMoreVisible: false,
                scrollTop: 0,
                scrollHeight: 0,
                clientHeight: 0,
            },
        });
    });

    test('retains full message order when records are limited to the visible window', () => {
        const result = runStoreProbe(`
            const store = createMainChatStore();
            store.getState().replaceSnapshot({
                chatId: 'chat-1',
                messagesById: {
                    '2': {
                        id: '2',
                        role: 'character',
                        name: 'Assistant',
                        content: 'visible',
                        timestamp: '2026-08-14T00:00:02.000Z',
                        state: 'finalized',
                    },
                },
                orderedMessageIds: ['0', '1', '2'],
                window: {
                    visibleMessageIds: ['2'],
                },
            });

            console.log(JSON.stringify(store.getState().getSnapshot()));
        `);

        expect(result.orderedMessageIds).toEqual(['0', '1', '2']);
        expect(result.messagesById).toEqual({
            '2': expect.objectContaining({ content: 'visible' }),
        });
        expect(result.window.visibleMessageIds).toEqual(['2']);
    });

    test('is subscribed by the React main-chat panel instead of remaining an unused store', () => {
        const workspaceSource = fs.readFileSync(
            path.join(repoRoot, 'app', 'workspace-panels.tsx'),
            'utf8',
        );

        expect(workspaceSource).toContain('useSyncExternalStore');
        expect(workspaceSource).toContain("from './stores/main-chat-store'");
        expect(workspaceSource).toContain('function syncMainChatStoreSnapshot(state: unknown)');
        expect(workspaceSource).toContain('syncMainChatStoreSnapshot(mount.state);');
        expect(workspaceSource).toContain('mainChatStoreSnapshot.window.visibleMessageIds');
        expect(workspaceSource).toContain('mainChatStoreSnapshot.messagesById');
        expect(workspaceSource).toContain('<MainChatMessageRow');
        expect(workspaceSource).not.toContain('messageNodes');
        expect(workspaceSource).not.toContain('MainChatLegacyDomBridgeState');
    });
});
