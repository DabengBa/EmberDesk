import { expect, test } from '@playwright/test';

test.describe('built-in vector retirement', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/login');
        await page.locator('#handle').fill(process.env.PLAYWRIGHT_USER ?? 'playwright-e2e');
        await page.getByRole('textbox', { name: '密码' }).fill(process.env.PLAYWRIGHT_PASSWORD ?? 'playwright');
        await page.getByRole('button', { name: '登录' }).click();
        await page.waitForFunction('document.getElementById("preloader") === null', { timeout: 0 });
    });

    test('keeps Data Bank available while retired vector callers receive 410', async ({ page }) => {
        await expect(page.locator('#vectors_container')).toHaveCount(0);
        await expect(page.locator('select[name="entryStateSelector"] option[value="vectorized"]')).toHaveCount(0);
        await expect(page.locator('#extensionsMenuButton')).toBeVisible();
        await page.locator('#extensionsMenuButton').click();
        await expect(page.locator('#manageAttachments')).toBeVisible();
        await expect(page.locator('body')).not.toContainText('Vector Storage');

        const response = await page.evaluate(async () => {
            const csrf = await fetch('/csrf-token').then(response => response.json());
            const result = await fetch('/api/vector/query', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-csrf-token': csrf.token,
                },
                body: '{}',
            });

            return {
                status: result.status,
                body: await result.json(),
            };
        });

        expect(response.status).toBe(410);
        expect(response.body).toEqual({
            error: 'vector_feature_removed',
            message: 'Built-in vector functionality has been removed from EmberDesk.',
        });
    });
});
