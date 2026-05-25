import { test, expect } from '@playwright/test';

test.describe('chat message layout', () => {
    test('centers message boxes without centering message text', async ({ page }) => {
        await page.goto('/');
        await page.waitForFunction('document.getElementById("preloader") === null', { timeout: 0 });

        if (page.url().includes('/login')) {
            const loginCard = page.locator('#loginCard');
            await loginCard.getByLabel('用户名').fill('default-user');
            await loginCard.getByRole('textbox', { name: '密码' }).fill('test123');
            await loginCard.getByRole('button', { name: '登录' }).click();
        }

        const chat = page.locator('#chat');
        const messageBlock = chat.locator('.mes .mes_block').first();

        await expect(page).toHaveURL(/\/$/);
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
