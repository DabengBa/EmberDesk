import { test, expect } from '@playwright/test';

test.describe('chat message layout', () => {
    test('centers message boxes without centering message text', async ({ page }) => {
        await page.goto('/style.css');
        await page.setContent(`
            <!doctype html>
            <html>
                <head>
                    <link rel="stylesheet" href="/style.css">
                </head>
                <body>
                    <main id="chat">
                        <article class="mes" is_user="false" is_system="false">
                            <section class="mes_block">
                                <div class="mes_text">
                                    This message keeps normal text alignment while the message box is centered.
                                </div>
                            </section>
                        </article>
                    </main>
                </body>
            </html>
        `);

        const chat = page.locator('#chat');
        const messageBlock = chat.locator('.mes .mes_block').first();

        await expect(messageBlock).toBeVisible();

        const geometry = await page.evaluate(() => {
            const chatEl = document.querySelector('#chat');
            const blockEl = document.querySelector('#chat .mes .mes_block');

            if (!chatEl || !blockEl) {
                return null;
            }

            const chatRect = chatEl.getBoundingClientRect();
            const blockRect = blockEl.getBoundingClientRect();

            return {
                chatWidth: Math.round(chatRect.width),
                blockWidth: Math.round(blockRect.width),
                chatCenter: Math.round(chatRect.left + (chatRect.width / 2)),
                blockCenter: Math.round(blockRect.left + (blockRect.width / 2)),
                textAlign: getComputedStyle(blockEl).textAlign,
            };
        });

        expect(geometry).not.toBeNull();
        expect(geometry.blockWidth).toBeLessThan(geometry.chatWidth * 0.9);
        expect(Math.abs(geometry.blockCenter - geometry.chatCenter)).toBeLessThan(24);
        expect(geometry.textAlign).not.toBe('center');
    });
});
