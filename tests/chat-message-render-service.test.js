import { describe, expect, test, jest } from '@jest/globals';

async function importFreshRenderService() {
    return import(`../public/scripts/chat-message-render-service.js?cacheBust=${Date.now()}-${Math.random()}`);
}

function createMessage(overrides = {}) {
    return {
        name: 'Assistant',
        mes: 'Hello **world**',
        is_user: false,
        is_system: false,
        swipe_id: 0,
        send_date: '2026-06-08T00:00:00.000Z',
        extra: {},
        ...overrides,
    };
}

function createFormatMessage() {
    return (text, _name, _isSystem, _isUser, _messageId, _sanitizerOverrides = {}, isReasoning = false) => {
        const prefix = isReasoning ? 'reasoning:' : 'mes:';
        return `<p data-formatted="${prefix}">${String(text ?? '')}</p>`;
    };
}

describe('chat message render service', () => {
    test('builds rich-body HTML for stored character messages without touching DOM', async () => {
        const {
            buildChatMessageRichBodyRender,
            RENDER_SERVICE_OWNER,
        } = await importFreshRenderService();

        const documentCreateElement = globalThis.document?.createElement;
        const createElementSpy = documentCreateElement
            ? jest.spyOn(globalThis.document, 'createElement')
            : null;

        const result = buildChatMessageRichBodyRender(createMessage({
            mes: 'Hello **world**',
            extra: {
                reasoning: 'thinking hard',
                bias: 'bias note',
                token_count: 12,
            },
        }), {
            messageId: 3,
            formatMessage: createFormatMessage(),
            mediaDisplay: 'list',
        });

        expect(result.owner).toBe(RENDER_SERVICE_OWNER);
        expect(result.messageHtml).toContain('data-formatted="mes:"');
        expect(result.messageHtml).toContain('Hello **world**');
        expect(result.reasoningHtml).toContain('data-formatted="reasoning:"');
        expect(result.reasoningHtml).toContain('thinking hard');
        expect(result.biasHtml).toContain('data-formatted="mes:"');
        expect(result.biasHtml).toContain('bias note');
        expect(result.mediaHtml).toBe('');
        expect(result.fileHtml).toBe('');
        expect(result.flags).toEqual(expect.objectContaining({
            hasReasoning: true,
            hasBias: true,
            hasMedia: false,
            hasAttachment: false,
            hideMessageText: false,
        }));
        expect(result.mediaDisplay).toBe('list');

        if (createElementSpy) {
            expect(createElementSpy).not.toHaveBeenCalled();
            createElementSpy.mockRestore();
        }
    });

    test('formats system and user message bodies through the same service path', async () => {
        const { buildChatMessageRichBodyRender } = await importFreshRenderService();
        const formatMessage = jest.fn(createFormatMessage());

        const systemResult = buildChatMessageRichBodyRender(createMessage({
            name: 'System',
            is_system: true,
            mes: 'system line',
        }), {
            messageId: 0,
            formatMessage,
        });
        expect(systemResult.messageHtml).toContain('system line');
        expect(formatMessage).toHaveBeenCalledWith(
            'system line',
            'System',
            true,
            false,
            0,
            {},
            false,
        );

        const userResult = buildChatMessageRichBodyRender(createMessage({
            name: 'User',
            is_user: true,
            mes: 'user line',
            extra: { display_text: 'rendered user' },
        }), {
            messageId: 1,
            formatMessage,
        });
        expect(userResult.messageHtml).toContain('rendered user');
        expect(formatMessage).toHaveBeenCalledWith(
            'rendered user',
            'User',
            false,
            true,
            1,
            {},
            false,
        );
    });

    test('builds media and file HTML strings that preserve protected selectors', async () => {
        const { buildChatMessageRichBodyRender } = await importFreshRenderService();

        const result = buildChatMessageRichBodyRender(createMessage({
            mes: 'see attachments',
            extra: {
                media: [
                    { type: 'image', url: '/user/files/a.png', title: 'Alpha' },
                    { type: 'video', url: '/user/files/b.mp4', title: 'Beta' },
                    { type: 'audio', url: '/user/files/c.mp3', title: 'Gamma' },
                ],
                media_display: 'list',
                files: [
                    { name: 'notes.txt', size: 2048 },
                ],
                inline_image: false,
            },
        }), {
            messageId: 9,
            formatMessage: createFormatMessage(),
            mediaDisplay: 'list',
        });

        expect(result.flags.hasMedia).toBe(true);
        expect(result.flags.hasAttachment).toBe(true);
        expect(result.flags.hideMessageText).toBe(true);
        expect(result.mediaDisplay).toBe('list');

        expect(result.mediaHtml).toContain('mes_img_container');
        expect(result.mediaHtml).toContain('mes_img');
        expect(result.mediaHtml).toContain('/user/files/a.png');
        expect(result.mediaHtml).toContain('title="Alpha"');
        expect(result.mediaHtml).toContain('mes_video_container');
        expect(result.mediaHtml).toContain('/user/files/b.mp4');
        expect(result.mediaHtml).toContain('mes_audio_container');
        expect(result.mediaHtml).toContain('/user/files/c.mp3');

        expect(result.fileHtml).toContain('mes_file_container');
        expect(result.fileHtml).toContain('mes_file_name');
        expect(result.fileHtml).toContain('notes.txt');
        expect(result.fileHtml).toContain('mes_file_size');
        expect(result.fileHtml).toContain('2.0 KiB');
    });

    test('builds gallery media HTML with swipe controls for the selected index', async () => {
        const { buildChatMessageRichBodyRender } = await importFreshRenderService();

        const result = buildChatMessageRichBodyRender(createMessage({
            extra: {
                media: [
                    { type: 'image', url: '/user/files/1.png', title: 'One' },
                    { type: 'image', url: '/user/files/2.png', title: 'Two' },
                ],
                media_display: 'gallery',
                media_index: 1,
            },
        }), {
            messageId: 4,
            formatMessage: createFormatMessage(),
            mediaDisplay: 'gallery',
            mediaIndex: 1,
        });

        expect(result.mediaDisplay).toBe('gallery');
        expect(result.mediaHtml).toContain('img_swipes');
        expect(result.mediaHtml).toContain('mes_img_swipes');
        expect(result.mediaHtml).toContain('2/2');
        expect(result.mediaHtml).toContain('/user/files/2.png');
        expect(result.mediaHtml).not.toContain('/user/files/1.png');
    });

    test('passes system-ui sanitizer overrides and empty reasoning when absent', async () => {
        const { buildChatMessageRichBodyRender } = await importFreshRenderService();
        const formatMessage = jest.fn(createFormatMessage());

        const result = buildChatMessageRichBodyRender(createMessage({
            mes: 'unsafe',
            extra: {
                uses_system_ui: true,
            },
        }), {
            messageId: 2,
            formatMessage,
        });

        expect(result.reasoningHtml).toBe('');
        expect(result.biasHtml).toBe('');
        expect(formatMessage).toHaveBeenCalledWith(
            'unsafe',
            'Assistant',
            false,
            false,
            2,
            { MESSAGE_ALLOW_SYSTEM_UI: true },
            false,
        );
    });

    test('JSON of render result never claims DOM insertion ownership', async () => {
        const { buildChatMessageRichBodyRender } = await importFreshRenderService();

        const result = buildChatMessageRichBodyRender(createMessage({
            extra: {
                reasoning: 'r',
                bias: 'b',
                media: [{ type: 'image', url: '/x.png' }],
                files: [{ name: 'a.txt', size: 10 }],
            },
        }), {
            messageId: 5,
            formatMessage: createFormatMessage(),
        });

        const serialized = JSON.stringify(result);
        expect(serialized).not.toContain('"legacy"');
        expect(serialized).not.toContain('document');
        expect(serialized).not.toContain('innerHTML');
        expect(result.insertsDom).toBe(false);
    });
});
