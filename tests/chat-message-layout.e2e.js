import { test, expect } from '@playwright/test';

test.describe('chat message layout', () => {
    test('centers message boxes without centering message text', async ({ page }) => {
        await page.goto('/style.css');
        await page.setContent(`
            <!doctype html>
            <html>
                <head>
                    <link rel="stylesheet" href="/style.css">
                    <link rel="stylesheet" href="/css/toggle-dependent.css">
                </head>
                <body>
                    <main id="chat">
                        <article class="mes last_mes swipes_visible last_swipe" is_user="false" is_system="false" bookmark_link="checkpoint">
                            <div class="swipe_left fa-solid fa-chevron-left" role="button" aria-label="Previous swipe" tabindex="0"></div>
                            <section class="mes_block">
                                <div class="ch_name flex-container justifySpaceBetween">
                                    <div class="mes_buttons">
                                        <div title="Message Actions" class="mes_button extraMesButtonsHint fa-solid fa-ellipsis" role="button" aria-label="Message Actions" tabindex="0"></div>
                                        <div class="extraMesButtons">
                                            <div title="Copy" class="mes_button mes_copy fa-solid fa-copy" role="button" aria-label="Copy" tabindex="0"></div>
                                        </div>
                                        <div class="mes_button mes_bookmark fa-solid fa-flag" role="button" aria-label="Open checkpoint chat" tabindex="0"></div>
                                        <div title="Edit" class="mes_button mes_edit fa-solid fa-pencil" role="button" aria-label="Edit" tabindex="0"></div>
                                    </div>
                                </div>
                                <div class="mes_text">
                                    This message keeps normal text alignment while the message box is centered.
                                </div>
                            </section>
                            <div class="swipe_right fa-solid fa-chevron-right" role="button" aria-label="Next swipe" tabindex="0"></div>
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

        const messageActions = page.getByRole('button', { name: 'Message Actions' });
        await expect(messageActions).toBeVisible();
        await page.locator('body').evaluate(element => element.classList.add('expandMessageActions'));
        await expect(page.getByRole('button', { name: 'Copy' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Open checkpoint chat' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Previous swipe' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Next swipe' })).toBeVisible();
    });
});
