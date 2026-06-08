import { describe, expect, test } from '@jest/globals';

async function importFreshDescriptorModule() {
    return import(`../public/scripts/chat-message-render-descriptor.js?cacheBust=${Date.now()}-${Math.random()}`);
}

function createMessage(overrides = {}) {
    return {
        name: 'Assistant',
        mes: 'Hello',
        is_user: false,
        is_system: false,
        swipe_id: 0,
        send_date: '2026-06-08T00:00:00.000Z',
        extra: {},
        ...overrides,
    };
}

describe('chat message render descriptor', () => {
    test('describes stable identity and role attributes for a character message', async () => {
        const { buildChatMessageRenderDescriptor } = await importFreshDescriptorModule();

        const descriptor = buildChatMessageRenderDescriptor(createMessage({
            name: 'Ember',
            swipe_id: 2,
            extra: {
                bookmark_link: 'checkpoint',
                type: 'narrator',
                token_count: 42,
            },
        }), {
            messageId: 7,
            timestamp: 'June 8, 2026 8:00 AM',
        });

        expect(descriptor).toEqual(expect.objectContaining({
            messageId: 7,
            role: 'character',
            state: 'complete',
            attributes: {
                mesid: 7,
                swipeid: 2,
                ch_name: 'Ember',
                is_user: false,
                is_system: false,
                bookmark_link: 'checkpoint',
                force_avatar: false,
                timestamp: 'June 8, 2026 8:00 AM',
                type: 'narrator',
            },
            display: expect.objectContaining({
                name: 'Ember',
                tokenCount: 42,
                bookmarkLink: 'checkpoint',
            }),
        }));
    });

    test('classifies user and system message roles without touching DOM', async () => {
        const { buildChatMessageRenderDescriptor } = await importFreshDescriptorModule();

        expect(buildChatMessageRenderDescriptor(createMessage({
            name: 'User',
            is_user: true,
            force_avatar: 'personas/user.png',
        }), { messageId: 1 })).toEqual(expect.objectContaining({
            role: 'user',
            attributes: expect.objectContaining({
                is_user: true,
                is_system: false,
                force_avatar: true,
            }),
            flags: expect.objectContaining({
                hasForcedAvatar: true,
            }),
        }));

        expect(buildChatMessageRenderDescriptor(createMessage({
            name: 'System',
            is_system: true,
        }), { messageId: 2 })).toEqual(expect.objectContaining({
            role: 'system',
            attributes: expect.objectContaining({
                is_user: false,
                is_system: true,
            }),
        }));
    });

    test('reports explicit state and content flags only when the message data supports them', async () => {
        const { buildChatMessageRenderDescriptor } = await importFreshDescriptorModule();

        expect(buildChatMessageRenderDescriptor(createMessage({
            extra: {
                reasoning: 'thinking',
                image: 'image.png',
                file: { name: 'notes.txt' },
                edited: true,
            },
        }), { messageId: 3 })).toEqual(expect.objectContaining({
            state: 'edited',
            flags: expect.objectContaining({
                hasReasoning: true,
                hasMedia: true,
                hasAttachment: true,
                isEdited: true,
                isError: false,
                isStopped: false,
            }),
        }));

        expect(buildChatMessageRenderDescriptor(createMessage({
            extra: {
                error: 'Provider failed',
                stopped: true,
            },
        }), { messageId: 4 })).toEqual(expect.objectContaining({
            state: 'error',
            flags: expect.objectContaining({
                isError: true,
                isStopped: true,
            }),
        }));

        expect(buildChatMessageRenderDescriptor(createMessage(), { messageId: 5 })).toEqual(expect.objectContaining({
            state: 'complete',
            flags: expect.objectContaining({
                isEdited: false,
                isError: false,
                isStopped: false,
            }),
        }));
    });

    test('marks current small system and tool-call classes without creating visible UI copy', async () => {
        const { buildChatMessageRenderDescriptor } = await importFreshDescriptorModule();

        const descriptor = buildChatMessageRenderDescriptor(createMessage({
            extra: {
                isSmallSys: true,
                tool_invocations: [{ id: 'tool-1' }],
                display_text: 'Rendered alternate text',
                bias: 'bias note',
            },
        }), { messageId: 6 });

        expect(descriptor.classes).toEqual({
            smallSysMes: true,
            toolCall: true,
        });
        expect(descriptor.flags).toEqual(expect.objectContaining({
            hasDisplayText: true,
            hasBias: true,
        }));
        expect(JSON.stringify(descriptor)).not.toContain('loading');
        expect(JSON.stringify(descriptor)).not.toContain('retry');
    });
});
