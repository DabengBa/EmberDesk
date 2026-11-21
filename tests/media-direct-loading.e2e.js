import { test, expect } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';

test('external attachments and message HTML media retain direct loading without CSS authorization', async ({ page }) => {
    await testSetup.awaitST({ page });
    const requests = [];
    await page.route('https://direct-media.invalid/**', route => {
        requests.push(new URL(route.request().url()).pathname);
        return route.fulfill({ status: 200, contentType: 'application/octet-stream', body: '' });
    });
    const result = await page.evaluate(async () => {
        const { buildMainChatMessageRecord } = await import('/scripts/main-chat-store-projection.js');
        const { messageFormatting } = await import('/scripts/message-service.js');
        const message = { mes: 'body', extra: { inline_image: false, media_display: 'list', media: [
            { type: 'image', url: 'https://direct-media.invalid/attachment.png' },
            { type: 'video', url: 'https://direct-media.invalid/attachment.mp4' },
            { type: 'audio', url: 'https://direct-media.invalid/attachment.mp3' },
        ] } };
        const record = buildMainChatMessageRecord(message, { messageId: 0, formatMessage: x => x });
        const reactHost = document.createElement('div'); reactHost.innerHTML = record.render.mediaHtml; document.body.append(reactHost);
        try {
            const htmlHost = document.createElement('div'); htmlHost.className = 'mes_text';
            htmlHost.innerHTML = messageFormatting('<img src="https://direct-media.invalid/html.png">', '', true, false, -1);
            document.body.append(htmlHost);
            await new Promise(resolve => setTimeout(resolve, 800));
            return { react: record.render.mediaHtml, hidden: record.inlineMediaText, html: htmlHost.innerHTML };
        } finally { reactHost.remove(); }
    });
    for (const file of ['attachment.png', 'attachment.mp4', 'attachment.mp3']) {
        expect(result.react).toContain(file);

        expect(requests).toContain(`/${file}`);
    }
    expect(result.hidden).toBe(true);
    expect(result.html).toContain('https://direct-media.invalid/html.png');
    expect(requests).toContain('/html.png');
});
