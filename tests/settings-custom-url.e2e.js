import { expect, test } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';

test.setTimeout(120_000);

async function ensureCsrf(page) {
    const csrf = await page.evaluate(async () => {
        const response = await fetch('/csrf-token');
        const data = await response.json().catch(() => ({}));
        return data?.token ?? data?.data?.token ?? null;
    });
    expect(csrf).toBeTruthy();
    return csrf;
}

async function getSettingsPayload(page) {
    const csrf = await ensureCsrf(page);
    return page.evaluate(async (csrfToken) => {
        const response = await fetch('/api/settings/get', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
            body: '{}',
        });
        const data = await response.json();
        const settings = typeof data.settings === 'string' ? JSON.parse(data.settings) : data.settings;
        return { status: response.status, settings };
    }, csrf);
}

async function openSettings(page) {
    await page.goto('/settings');
    await expect(page.locator('.settings-page')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('正在加载当前设置...')).toHaveCount(0, { timeout: 60_000 });
}

test.describe('custom_url /v1 round-trip', () => {
    test('UI saves the URL verbatim with and without /v1', async ({ page }) => {
        await testSetup.awaitST({ page });
        const urlWithV1 = 'https://gptl.tanyaleoallen.cloud/v1';
        const urlNoV1 = 'https://gptl.tanyaleoallen.cloud';
        await openSettings(page);

        const urlField = page.locator('#settings-providers-customUrl');
        const originalUrl = await urlField.inputValue();
        const modelField = page.locator('#settings-providers-openaiModel');
        const originalModel = await modelField.inputValue();
        const saveButton = page.getByRole('button', { name: '保存设置' });
        const successToast = page.locator('.settings-status--success');

        await urlField.fill(urlWithV1);
        await modelField.fill('rpg');
        await saveButton.click();
        await expect(successToast).toContainText('已保存', { timeout: 30_000 });
        expect((await getSettingsPayload(page)).settings.oai_settings.custom_url).toBe(urlWithV1);

        await urlField.fill(urlNoV1);
        await saveButton.click();
        await expect(successToast).toContainText('已保存', { timeout: 30_000 });
        expect((await getSettingsPayload(page)).settings.oai_settings.custom_url).toBe(urlNoV1);

        // This suite shares a server-side settings document with later browser
        // tests. Do not leave its real external endpoint and test model active.
        await urlField.fill(originalUrl);
        await modelField.fill(originalModel);
        await saveButton.click();
        await expect.poll(async () => (await getSettingsPayload(page)).settings.oai_settings.custom_url).toBe(originalUrl);
        expect((await getSettingsPayload(page)).settings.oai_settings.openai_model).toBe(originalModel);
    });
});
