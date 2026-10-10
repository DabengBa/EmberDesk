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
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken,
            },
            body: '{}',
        });
        const data = await response.json();
        const settings = typeof data.settings === 'string' ? JSON.parse(data.settings) : data.settings;
        return {
            status: response.status,
            settings,
            settingsRevision: data.settings_revision ?? settings?.settings_revision ?? null,
        };
    }, csrf);
}

async function saveSettingsDocument(page, settings, settingsRevision) {
    const csrf = await ensureCsrf(page);
    return page.evaluate(async ({ csrfToken, nextSettings, revision }) => {
        const body = {
            ...nextSettings,
            ...(revision != null ? { settings_revision: revision } : {}),
        };
        const response = await fetch('/api/settings/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken,
            },
            body: JSON.stringify(body),
        });
        const text = await response.text();
        let json = null;
        try {
            json = text ? JSON.parse(text) : null;
        } catch {
            json = null;
        }
        return { status: response.status, json, text };
    }, { csrfToken: csrf, nextSettings: settings, revision: settingsRevision });
}

async function openSettings(page) {
    await page.goto('/settings');
    await expect(page.locator('.settings-page')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('heading', { name: '设置' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('正在加载当前设置...')).toHaveCount(0, { timeout: 60_000 });
}

async function selectTab(page, label) {
    await page.getByRole('button', { name: label, exact: true }).click();
}

test.describe('React settings sole-owner page', () => {
    test('covers provider/ui/advanced domains, secret isolation, and reload persistence', async ({ page }) => {
        await testSetup.awaitST({ page });
        await openSettings(page);

        // Generation defaults moved to the AI Response Configuration drawer;
        // the React surface owns only Providers and Advanced. The interface tab
        // is retired: its preferences are fixed runtime constants.
        await expect(page.getByRole('button', { name: 'General', exact: true })).toHaveCount(0);
        await expect(page.getByRole('button', { name: '服务', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: '界面', exact: true })).toHaveCount(0);
        await expect(page.getByRole('button', { name: '高级', exact: true })).toBeVisible();
        await expect(page.locator('.settings-workspace-link')).toBeVisible();

        await selectTab(page, '服务');
        await expect(page.getByText('API Key', { exact: true })).toBeVisible();
        await expect(page.locator('#provider-secret-input')).toBeVisible();
        await expect(page.locator('#fallback-provider-secret-input')).toHaveCount(0);

        await selectTab(page, '高级');
        await expect(page.getByRole('heading', { name: /提示词|模板|高级控件/ })).toBeVisible({ timeout: 15_000 });

        const biasField = page.getByRole('textbox', { name: /用户提示偏移/ });
        await expect(biasField).toBeVisible({ timeout: 30_000 });
        await biasField.fill('e2e-bias');

        const saveButton = page.locator('button[type="submit"]');
        // fullyParallel shares one settings document; a concurrent save from
        // another test can bump the revision mid-flight. On a conflict banner,
        // reload the persisted document and re-apply the draft before retrying.
        for (let attempt = 0; attempt < 3; attempt++) {
            await expect(saveButton).toBeEnabled({ timeout: 30_000 });
            await saveButton.click();
            const conflicted = await Promise.race([
                page.locator('.settings-status--success').waitFor({ state: 'visible', timeout: 30_000 }).then(() => false),
                page.getByText(/本地草稿仍保留/).waitFor({ state: 'visible', timeout: 30_000 }).then(() => true),
            ]);
            if (!conflicted) {
                break;
            }
            await page.getByRole('button', { name: '重新加载当前设置', exact: true }).click();
            await expect(page.getByText(/本地草稿仍保留/)).toHaveCount(0, { timeout: 30_000 });
            await biasField.fill('e2e-bias');
        }
        await expect(page.locator('.settings-status--success')).toContainText('已保存', { timeout: 30_000 });

        const after = await getSettingsPayload(page);
        expect(after.settings?.power_user?.user_prompt_bias).toBe('e2e-bias');
        expect(JSON.stringify(after.settings)).not.toMatch(/BEGIN PRIVATE KEY/);
        await page.reload();
        await openSettings(page);
        await selectTab(page, '高级');
        // fullyParallel shares one settings document across tests, so compare the
        // hydrated field against the live persisted value instead of a literal.
        const persisted = await getSettingsPayload(page);
        const persistedBias = String(persisted.settings?.power_user?.user_prompt_bias ?? '');
        await expect(page.getByRole('textbox', { name: /用户提示偏移/ })).toHaveValue(persistedBias, { timeout: 30_000 });
    });

    test('surfaces revision conflicts without fake success', async ({ page }) => {
        await testSetup.awaitST({ page });
        await openSettings(page);

        await selectTab(page, '高级');
        const biasField = page.getByRole('textbox', { name: /用户提示偏移/ });
        const draftBias = `Local draft ${Date.now()}`;
        await biasField.fill(draftBias);

        const initial = await getSettingsPayload(page);
        const concurrentSettings = structuredClone(initial.settings);
        concurrentSettings.power_user = {
            ...(concurrentSettings.power_user || {}),
            custom_css: `/* Concurrent-${Date.now()} */`,
        };
        const concurrent = await saveSettingsDocument(page, concurrentSettings, initial.settingsRevision);
        expect(concurrent.status).toBeLessThan(400);

        const afterConcurrent = await getSettingsPayload(page);
        const currentRevision = afterConcurrent.settingsRevision;

        if (currentRevision == null) {
            // File-authority / compat LWW path: server may not enforce revision yet.
            // Still prove the React page remains usable and does not show fake success banners.
            await expect(biasField).toHaveValue(draftBias);
            await expect(page.locator('.settings-status--success')).toHaveCount(0);
            return;
        }

        const saveButton = page.locator('button[type="submit"]');
        await expect(saveButton).toBeEnabled({ timeout: 30_000 });
        await saveButton.click();

        await expect(page.getByText(/本地草稿仍保留/)).toBeVisible({ timeout: 30_000 });
        await expect(biasField).toHaveValue(draftBias);
        await expect(page.getByRole('button', { name: '重新加载当前设置', exact: true })).toBeVisible();
        await expect(saveButton).toBeDisabled();
    });

    test('desktop and mobile viewports keep save controls reachable', async ({ page }) => {
        await testSetup.awaitST({ page });
        for (const viewport of [
            { width: 1280, height: 800 },
            { width: 390, height: 844 },
        ]) {
            await page.setViewportSize(viewport);
            await openSettings(page);
            await expect(page.locator('.settings-page')).toBeVisible();
            await expect(page.locator('button[type="submit"]')).toBeVisible();
            await expect(page.locator('.settings-workspace-link')).toBeVisible();
            await page.keyboard.press('Tab');
            await expect(page.locator(':focus')).toBeVisible();
        }
    });
});
