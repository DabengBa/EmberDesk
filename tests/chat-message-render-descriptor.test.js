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

        // Canonical media array (post-migration) must set hasMedia without legacy image fields.
        expect(buildChatMessageRenderDescriptor(createMessage({
            extra: {
                media: [{ type: 'image', url: 'canonical.png' }],
            },
        }), { messageId: 31 })).toEqual(expect.objectContaining({
            flags: expect.objectContaining({
                hasMedia: true,
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

    test('builds deterministic row population decisions without message body HTML', async () => {
        const {
            buildChatMessageRenderDescriptor,
            buildChatMessageRowPopulation,
        } = await importFreshDescriptorModule();

        const descriptor = buildChatMessageRenderDescriptor(createMessage({
            name: 'Ember',
            title: 'Pinned response',
            extra: {
                api: 'openai',
                model: 'gpt-4o-mini',
                token_count: 17,
                bookmark_link: 'checkpoint',
            },
        }), {
            messageId: 8,
            timestamp: 'June 8, 2026 8:00 AM',
        });

        const population = buildChatMessageRowPopulation(descriptor, {
            avatarImg: '/thumbnail?type=avatar&file=ember.png',
            messageTitle: 'Pinned response',
            timestampTitle: 'openai - gpt-4o-mini',
            timerValue: '1.2s',
            timerTitle: 'Generation queued',
        });

        expect(population).toEqual({
            attributes: descriptor.attributes,
            avatarSrc: '/thumbnail?type=avatar&file=ember.png',
            displayName: 'Ember',
            timestampText: 'June 8, 2026 8:00 AM',
            timestampTitle: 'openai - gpt-4o-mini',
            messageIdText: '#8',
            tokenCountText: '17t',
            messageTitle: 'Pinned response',
            timer: {
                value: '1.2s',
                title: 'Generation queued',
            },
            bookmarkLink: 'checkpoint',
            classes: descriptor.classes,
        });
        expect(JSON.stringify(population)).not.toContain('mes_text');
        expect(JSON.stringify(population)).not.toContain('<p>');
    });

    test('classifies renderer ownership for safe, editing, streaming, unsafe, and extension-mutated rows', async () => {
        const {
            buildChatMessageRenderDescriptor,
            classifyChatMessageRendererContract,
            buildMainChatRowLifecycleContract,
        } = await importFreshDescriptorModule();

        buildChatMessageRenderDescriptor(createMessage(), { messageId: 9 });
        expect(classifyChatMessageRendererContract({
            rowState: 'finalized',
            hasMesText: true,
            hasProtectedReasoning: true,
            extensionMutated: false,
        })).toEqual(expect.objectContaining({
            rendererOwner: 'react',
            phase7Candidate: 'react-rich-body-owner',
            fallback: 'not-needed',
            reason: 'safe-finalized-row',
            preserveLiveContent: false,
            protectedSurfaces: {
                mesText: true,
                reasoning: true,
            },
        }));

        expect(classifyChatMessageRendererContract({
            rowState: 'editing',
            hasMesText: true,
        })).toEqual(expect.objectContaining({
            rendererOwner: 'react',
            phase7Candidate: 'react-rich-body-owner',
            fallback: 'preserve-editing-live-content',
            reason: 'editing-row',
            preserveLiveContent: true,
        }));

        expect(classifyChatMessageRendererContract({
            rowState: 'streaming',
            hasMesText: true,
        })).toEqual(expect.objectContaining({
            rendererOwner: 'react',
            phase7Candidate: 'react-rich-body-owner',
            fallback: 'preserve-streaming-live-content',
            reason: 'streaming-row',
            preserveLiveContent: true,
        }));

        expect(classifyChatMessageRendererContract({
            rowState: 'finalized',
            hasMesText: false,
        })).toEqual(expect.objectContaining({
            rendererOwner: 'unsupported',
            phase7Candidate: 'unsupported-with-reason',
            fallback: 'unsupported-row-structure',
            reason: 'missing-mes-text',
        }));

        expect(classifyChatMessageRendererContract({
            rowState: 'finalized',
            hasMesText: true,
            extensionMutated: true,
        })).toEqual(expect.objectContaining({
            rendererOwner: 'react',
            phase7Candidate: 'react-rich-body-owner',
            fallback: 'preserve-extension-mutation-zone',
            reason: 'extension-mutated-row',
            preserveLiveContent: true,
        }));

        expect(buildMainChatRowLifecycleContract({
            hasEditingRows: true,
            hasStreamingRows: true,
            hasUnsafeRows: true,
            hasExtensionMutatedRows: true,
        })).toEqual({
            lifecycleOwner: 'react-message-list-controller',
            phase7Candidate: 'react-row-lifecycle-owner',
            fallback: 'unsupported-unsafe-row-structure',
            editingOwner: 'react',
            streamingOwner: 'react',
            unsafeOwner: 'unsupported',
            extensionMutatedOwner: 'react',
            hasEditingRows: true,
            hasStreamingRows: true,
            hasUnsafeRows: true,
            hasExtensionMutatedRows: true,
            reason: 'react-row-lifecycle-sole-owner',
        });
    });

    test('describes long-chat windowing contract with React as sole windowing and load-more owner', async () => {
        const { buildMainChatWindowingContract } = await importFreshDescriptorModule();

        expect(buildMainChatWindowingContract({
            renderedMessageIds: ['20', '21', '22'],
            totalMessageCount: 120,
            showMoreVisible: true,
            anchorMessageId: '21',
            scrollTop: 240,
        })).toEqual({
            windowingOwner: 'react-message-list-controller',
            phase7Candidate: 'react-windowing-owner',
            fallback: 'not-needed',
            loadMoreOwner: 'react',
            restoreOwner: 'react',
            renderedMessageIds: ['20', '21', '22'],
            totalMessageCount: 120,
            showMoreVisible: true,
            anchorMessageId: '21',
            scrollTop: 240,
            preservesDirectChildOrder: true,
            reason: 'long-chat-window',
        });

        expect(buildMainChatWindowingContract({
            renderedMessageIds: ['1', '2'],
            totalMessageCount: 2,
            showMoreVisible: false,
        })).toEqual(expect.objectContaining({
            windowingOwner: 'react-message-list-controller',
            phase7Candidate: 'react-windowing-owner',
            loadMoreOwner: 'not-needed',
            restoreOwner: 'react',
            fallback: 'not-needed',
            reason: 'full-chat-window',
        }));
    });
});
