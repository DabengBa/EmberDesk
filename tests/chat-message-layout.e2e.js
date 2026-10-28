import { test, expect } from '@playwright/test';

test.describe('chat message layout', () => {
    async function loadStaticChatLayout(page, { localStatusMarkup = '' } = {}) {
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
                        <article class="mes last_mes" is_user="false" is_system="false">
                            <section class="mes_block">
                                <div class="ch_name flex-container justifySpaceBetween">
                                    <div class="mes_buttons">
                                        <div title="Message Actions" class="mes_button extraMesButtonsHint fa-solid fa-ellipsis" role="button" aria-label="Message Actions" tabindex="0"></div>
                                        <div class="extraMesButtons">
                                            <div title="Copy" class="mes_button mes_copy fa-solid fa-copy" role="button" aria-label="Copy" tabindex="0"></div>
                                            <div title="Create branch" class="mes_button mes_create_branch fa-regular fa-code-branch" role="button" aria-label="Create branch" tabindex="0"></div>
                                        </div>
                                        <div title="Edit" class="mes_button mes_edit fa-solid fa-pencil" role="button" aria-label="Edit" tabindex="0"></div>
                                    </div>
                                </div>
                                <div class="mes_text">
                                    This message keeps normal text alignment while the message box is centered.
                                </div>
                            </section>
                        </article>
                    </main>
                    <form id="send_form">
                        ${localStatusMarkup}
                        <textarea id="send_textarea" aria-label="Send a message"></textarea>
                        <button id="send_but" type="button" aria-label="Send message">Send</button>
                        <button id="options_button" type="button" aria-label="Options">Options</button>
                        <button id="mes_stop" class="mes_stop" type="button" aria-label="Abort request">Stop</button>
                    </form>
                    <div id="options" style="display: block;"></div>
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
        await page.locator('.extraMesButtons').evaluate(element => {
                element.classList.add('visible');
                element.style.display = 'flex';
            });
        await expect(page.getByRole('button', { name: 'Copy' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Create branch' })).toBeVisible();
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

            await expect(page.locator('#options_button')).toBeVisible();

            const messageActions = page.getByRole('button', { name: 'Message Actions' });
            await expect(messageActions).toBeVisible();
            await messageActions.focus();
            await expect(messageActions).toBeFocused();

            await page.locator('.extraMesButtons').evaluate(element => {
                element.classList.add('visible');
                element.style.display = 'flex';
            });
            await expect(page.getByRole('button', { name: 'Copy' })).toBeVisible();
            await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
            await expect(page.getByRole('button', { name: 'Create branch' })).toBeVisible();

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

    test('keeps wrapped local recovery actions above the composer on a narrow phone viewport', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await loadStaticChatLayout(page, {
            localStatusMarkup: `
                <div class="react-main-chat-local-status" data-main-chat-local-status="error">
                    <span class="react-main-chat-local-status-dot" aria-hidden="true"></span>
                    <span>Generation failed</span>
                    <span class="react-main-chat-local-actions">
                        <button type="button" class="menu_button menu_button_icon">Retry generation</button>
                        <button type="button" class="menu_button menu_button_icon">Continue last message</button>
                    </span>
                </div>
            `,
        });

        const geometry = await page.evaluate(() => {
            const textarea = document.querySelector('#send_textarea');
            const button = document.querySelector('.react-main-chat-local-actions .menu_button');

            if (!(textarea instanceof HTMLElement) || !(button instanceof HTMLElement)) {
                return null;
            }

            const textareaRect = textarea.getBoundingClientRect();
            const buttonRect = button.getBoundingClientRect();
            const probeX = textareaRect.left + 20;
            const probeY = textareaRect.top + 2;
            const hit = document.elementFromPoint(probeX, probeY);

            return {
                overlapsTextarea: buttonRect.bottom > textareaRect.top && buttonRect.top < textareaRect.bottom,
                hitIsRecoveryButton: Boolean(hit?.closest?.('.react-main-chat-local-actions .menu_button')),
            };
        });

        expect(geometry).not.toBeNull();
        expect(geometry.overlapsTextarea).toBe(false);
        expect(geometry.hitIsRecoveryButton).toBe(false);
    });

    test('keeps the batch-selection highlight and the card corners visible on a selected turn row', async ({ page }) => {
        await page.goto('/style.css');
        await page.setContent(`
            <!doctype html>
            <html>
                <head>
                    <link rel="stylesheet" href="/style.css">
                    <style>
                        :root {
                            --SmartThemeQuoteColor: rgb(255, 0, 0);
                            --chat-bot-bubble-bg: rgb(0, 0, 255);
                            --SmartThemeBlurTintColor: rgb(0, 0, 0);
                            --chat-user-bubble-bg: rgb(0, 128, 0);
                        }
                    </style>
                </head>
                <body>
                    <main id="chat">
                        <div class="mes" mesid="0" is_user="true" data-turn-card="t0" data-turn-card-position="start">
                            <section class="mes_block"><div class="mes_text">first</div></section>
                        </div>
                        <div class="mes selected" mesid="1" is_user="false" data-turn-card="t0" data-turn-card-position="middle">
                            <section class="mes_block"><div class="mes_text">selected row</div></section>
                        </div>
                        <div class="mes" mesid="2" is_user="false" data-turn-card="t0" data-turn-card-position="end">
                            <section class="mes_block"><div class="mes_text">last</div></section>
                        </div>
                        <div class="turn-summary-row" data-turn-card="t1" data-turn-card-position="single">
                            <button type="button" class="turn-summary-pill">summary</button>
                        </div>
                    </main>
                </body>
            </html>
        `);

        const styles = await page.evaluate(() => {
            const read = (selector) => {
                const element = document.querySelector(selector);
                const computed = getComputedStyle(element);
                return {
                    background: computed.backgroundColor,
                    topLeft: computed.borderTopLeftRadius,
                    bottomLeft: computed.borderBottomLeftRadius,
                };
            };
            return {
                start: read('#chat > .mes[mesid="0"]'),
                selected: read('#chat > .mes[mesid="1"]'),
                end: read('#chat > .mes[mesid="2"]'),
                summary: read('#chat > .turn-summary-row'),
            };
        });

        // Chosen colours make the assertions readable: the card surface mixes
        // blue into black, the legacy selection mixes red into transparency.
        expect(styles.selected.background).not.toBe(styles.start.background);
        expect(styles.selected.background).toContain('0.2');
        expect(styles.end.background).toBe(styles.start.background);

        // A selected row must keep its card slot corner, not fall back to the
        // plain `.mes` 8px rounding on all four corners.
        expect(styles.start.topLeft).toBe('8px');
        expect(styles.start.bottomLeft).toBe('0px');
        expect(styles.end.bottomLeft).toBe('8px');
        expect(styles.end.topLeft).toBe('0px');
        expect(styles.selected.topLeft).toBe('0px');
        expect(styles.selected.bottomLeft).toBe('0px');
        expect(styles.summary.topLeft).toBe('8px');
        expect(styles.summary.bottomLeft).toBe('8px');

        // Hovering a selected row must not repaint the card surface over the
        // selection highlight.
        await page.locator('#chat > .mes[mesid="1"]').hover();
        const hoverBackground = await page.locator('#chat > .mes[mesid="1"]')
            .evaluate(element => getComputedStyle(element).backgroundColor);
        expect(hoverBackground).toBe(styles.selected.background);
    });
});
