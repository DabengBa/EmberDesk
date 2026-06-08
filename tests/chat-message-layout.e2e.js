import { test, expect } from '@playwright/test';

test.describe('chat message layout', () => {
    async function loadStaticChatLayout(page) {
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
                    <form id="send_form">
                        <textarea id="send_textarea" aria-label="Send a message"></textarea>
                        <button id="send_but" type="button" aria-label="Send message">Send</button>
                        <button id="mes_stop" class="mes_stop" type="button" aria-label="Abort request">Stop</button>
                        <button id="mes_continue" type="button" aria-label="Continue last message">Continue</button>
                    </form>
                </body>
            </html>
        `);
    }

    test('centers message boxes without centering message text', async ({ page }) => {
        await loadStaticChatLayout(page);

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

    for (const viewport of [
        { name: 'narrow phone', width: 390, height: 844 },
        { name: 'wide mobile', width: 768, height: 1024 },
    ]) {
        test(`keeps core chat controls reachable on a ${viewport.name} viewport`, async ({ page }) => {
            await page.setViewportSize({ width: viewport.width, height: viewport.height });
            await loadStaticChatLayout(page);

            await expect(page.getByRole('textbox', { name: 'Send a message' })).toBeVisible();
            await expect(page.getByRole('button', { name: 'Send message' })).toBeVisible();
            await expect(page.getByRole('button', { name: 'Continue last message' })).toBeVisible();

            const messageActions = page.getByRole('button', { name: 'Message Actions' });
            await expect(messageActions).toBeVisible();
            await messageActions.focus();
            await expect(messageActions).toBeFocused();

            await page.locator('body').evaluate(element => element.classList.add('expandMessageActions'));
            await expect(page.getByRole('button', { name: 'Copy' })).toBeVisible();
            await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
            await expect(page.getByRole('button', { name: 'Open checkpoint chat' })).toBeVisible();
            await expect(page.getByRole('button', { name: 'Previous swipe' })).toBeVisible();
            await expect(page.getByRole('button', { name: 'Next swipe' })).toBeVisible();

            const geometry = await page.evaluate(() => {
                const text = document.querySelector('.mes_text');
                const buttons = document.querySelector('.mes_buttons');
                const form = document.querySelector('#send_form');

                if (!text || !buttons || !form) {
                    return null;
                }

                const textRect = text.getBoundingClientRect();
                const buttonsRect = buttons.getBoundingClientRect();
                const formRect = form.getBoundingClientRect();
                const overlapsText = buttonsRect.left < textRect.right
                    && buttonsRect.right > textRect.left
                    && buttonsRect.top < textRect.bottom
                    && buttonsRect.bottom > textRect.top;

                return {
                    bodyScrollWidth: document.documentElement.scrollWidth,
                    viewportWidth: window.innerWidth,
                    overlapsText,
                    textBottom: textRect.bottom,
                    formTop: formRect.top,
                };
            });

            expect(geometry).not.toBeNull();
            expect(geometry.bodyScrollWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);
            expect(geometry.overlapsText).toBe(false);
            expect(geometry.textBottom).toBeLessThan(geometry.formTop);
        });
    }
});
