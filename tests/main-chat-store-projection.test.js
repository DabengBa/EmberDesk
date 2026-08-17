import { describe, expect, test, jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    buildMainChatMessageRecord,
    buildMainChatSnapshotFromLegacyChat,
} from '../public/scripts/main-chat-store-projection.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectionPath = path.join(repoRoot, 'public', 'scripts', 'main-chat-store-projection.js');

function createFormatMessage() {
    return (text, _name, _isSystem, _isUser, messageId, _sanitizerOverrides = {}, isReasoning = false) => {
        const prefix = isReasoning ? 'reasoning' : 'message';
        return `<p data-message-id="${messageId}" data-kind="${prefix}">${String(text ?? '')}</p>`;
    };
}

describe('main chat store projection', () => {
    test('is a DOM-free projection boundary', () => {
        const source = fs.readFileSync(projectionPath, 'utf8');

        expect(source).toContain('buildChatMessageRichBodyRender');
        expect(source).toContain('messagesById');
        expect(source).not.toMatch(/\bHTMLElement\b/);
        expect(source).not.toMatch(/\bquerySelector(?:All)?\b/);
        expect(source).not.toContain('innerHTML');
        expect(source).not.toContain('globalThis.SillyTavern');
        expect(source).not.toContain('eventSource');
    });

    test('builds a typed message record from stored chat data without message DOM', () => {
        const record = buildMainChatMessageRecord({
            name: 'Assistant',
            mes: 'Hello **world**',
            is_user: false,
            is_system: false,
            send_date: '2026-08-14T00:00:01.000Z',
            extra: {
                reasoning: 'thinking',
                media: [{ type: 'image', url: '/files/image.png', title: 'Image' }],
            },
        }, {
            messageId: 4,
            timestamp: 'August 14, 2026 12:00 AM',
            formatMessage: createFormatMessage(),
        });

        expect(record).toEqual(expect.objectContaining({
            id: '4',
            role: 'character',
            name: 'Assistant',
            content: 'Hello **world**',
            timestamp: 'August 14, 2026 12:00 AM',
            state: 'finalized',
            rootClassNames: expect.arrayContaining(['reasoning']),
            render: expect.objectContaining({
                messageHtml: expect.stringContaining('Hello **world**'),
                reasoningHtml: expect.stringContaining('thinking'),
                mediaHtml: expect.stringContaining('/files/image.png'),
            }),
        }));
        expect(JSON.stringify(record)).not.toContain('HTMLElement');
    });

    test('projects full chat order with rich records limited to the visible window', () => {
        const snapshot = buildMainChatSnapshotFromLegacyChat({
            chatId: 'chat-1',
            chat: [
                { name: 'User', mes: 'hello', is_user: true, is_system: false, extra: {} },
                { name: 'Assistant', mes: 'hi', is_user: false, is_system: false, extra: {} },
            ],
            formatMessage: jest.fn(createFormatMessage()),
            timestampForMessage: (_message, messageId) => `timestamp-${messageId}`,
            visibleMessageIds: ['1'],
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
                observedTokenCount: 3,
            },
            slash: {
                active: true,
                query: '/he',
                autocompleteVisible: true,
                replaceable: true,
                detailsVisible: true,
                detailsHtml: '<p>Help</p>',
                options: [{
                    name: 'help',
                    type: 'command',
                    typeIcon: '?',
                    selectable: true,
                    selected: true,
                }],
                executing: false,
                paused: false,
                aborted: false,
                errorLabel: null,
            },
            window: {
                visibleMessageIds: ['1'],
                anchorMessageId: '1',
                showMoreVisible: true,
                scrollTop: 10,
                scrollHeight: 400,
                clientHeight: 200,
                scrollRestore: {
                    anchorMessageId: '1',
                    anchorViewportOffset: 120,
                    scrollTop: 300,
                    wasNearBottom: false,
                },
            },
        });

        expect(snapshot).toEqual(expect.objectContaining({
            chatId: 'chat-1',
            orderedMessageIds: ['0', '1'],
            messagesById: expect.objectContaining({
                '1': expect.objectContaining({ id: '1', role: 'character', timestamp: 'timestamp-1' }),
            }),
            composer: expect.objectContaining({ value: 'next', activeContext: 'character' }),
            generation: { phase: 'streaming', activeMessageId: '1' },
            streaming: { phase: 'streaming', activeMessageId: '1', observedTokenCount: 3 },
            slash: expect.objectContaining({
                active: true,
                query: '/he',
                replaceable: true,
                detailsVisible: true,
                detailsHtml: '<p>Help</p>',
                options: [{
                    name: 'help',
                    type: 'command',
                    typeIcon: '?',
                    selectable: true,
                    selected: true,
                }],
            }),
            window: expect.objectContaining({
                visibleMessageIds: ['1'],
                anchorMessageId: '1',
                showMoreVisible: true,
                scrollRestore: expect.objectContaining({
                    anchorMessageId: '1',
                    anchorViewportOffset: 120,
                    scrollTop: 300,
                    wasNearBottom: false,
                }),
            }),
        }));
        expect(snapshot.messagesById).not.toHaveProperty('0');
    });

    test('keeps full chat ordering while avoiding formatting hidden records', () => {
        const formatMessage = jest.fn(createFormatMessage());
        const snapshot = buildMainChatSnapshotFromLegacyChat({
            chat: [
                { name: 'User', mes: 'older', is_user: true, is_system: false, extra: {} },
                { name: 'Assistant', mes: 'visible-1', is_user: false, is_system: false, extra: {} },
                { name: 'Assistant', mes: 'visible-2', is_user: false, is_system: false, extra: {} },
            ],
            formatMessage,
            visibleMessageIds: ['1', '2'],
            window: {
                visibleMessageIds: ['1', '2'],
            },
        });

        expect(snapshot.orderedMessageIds).toEqual(['0', '1', '2']);
        expect(Object.keys(snapshot.messagesById)).toEqual(['1', '2']);
        expect(snapshot.window.visibleMessageIds).toEqual(['1', '2']);
        expect(formatMessage).toHaveBeenCalledTimes(2);
    });

    test('projects transient message controls from data instead of message DOM', () => {
        const snapshot = buildMainChatSnapshotFromLegacyChat({
            chat: [{
                name: 'Assistant',
                mes: '',
                is_user: false,
                is_system: false,
                swipe_id: 1,
                swipes: ['first', 'second'],
                extra: {},
            }],
            formatMessage: createFormatMessage(),
            visibleMessageIds: ['0'],
            messageUiById: {
                '0': {
                    recoveryStatus: '正在使用备用服务商',
                    recoveryStage: 'fallback',
                    failureNoticeVisible: true,
                    failureRetryVisible: false,
                    emptyReplyRegenerateVisible: true,
                    actionsExpanded: true,
                },
            },
        });

        expect(snapshot.messagesById['0']).toEqual(expect.objectContaining({
            recoveryStatus: '正在使用备用服务商',
            recoveryStage: 'fallback',
            failureNoticeVisible: true,
            failureRetryVisible: false,
            emptyReplyRegenerateVisible: true,
            actionsExpanded: true,
            swipeIndex: 1,
            swipeCount: 2,
            swipesVisible: true,
            lastSwipe: true,
        }));
    });

    test('projects the React editing lifecycle state from transient edit ownership', () => {
        const snapshot = buildMainChatSnapshotFromLegacyChat({
            chat: [{
                name: 'Assistant',
                mes: 'Editable response',
                is_user: false,
                is_system: false,
                extra: {},
            }],
            formatMessage: createFormatMessage(),
            visibleMessageIds: ['0'],
            messageUiById: {
                '0': {
                    editing: true,
                    editText: 'Draft response',
                },
            },
        });

        expect(snapshot.messagesById['0']).toEqual(expect.objectContaining({
            state: 'editing',
            editing: true,
            editText: 'Draft response',
        }));
    });

    test('projects controlled reasoning state from transient UI ownership instead of message DOM', () => {
        const snapshot = buildMainChatSnapshotFromLegacyChat({
            chat: [{
                name: 'Assistant',
                mes: 'Visible response',
                is_user: false,
                is_system: false,
                extra: {
                    reasoning: 'Stored reasoning',
                },
            }],
            formatMessage: createFormatMessage(),
            visibleMessageIds: ['0'],
            messageUiById: {
                '0': {
                    reasoningOpen: true,
                    reasoningEditing: true,
                    reasoningEditText: 'Draft reasoning',
                },
            },
        });

        expect(snapshot.messagesById['0']).toEqual(expect.objectContaining({
            reasoningOpen: true,
            reasoningEditing: true,
            reasoningEditText: 'Draft reasoning',
            rootClassNames: expect.arrayContaining(['reasoning']),
        }));
    });

    test('is connected to the main-chat composition root as a data snapshot', () => {
        const scriptSource = fs.readFileSync(path.join(repoRoot, 'public', 'script.js'), 'utf8');

        expect(scriptSource).toContain("from './scripts/main-chat-store-projection.js';");
        expect(scriptSource).toContain('const mainChatSnapshot = buildMainChatSnapshotFromLegacyChat({');
        expect(scriptSource).toContain('mainChatSnapshot,');
        expect(scriptSource).toContain('chat,');
        expect(scriptSource).toContain('formatMessage: messageFormatting,');
    });
});
