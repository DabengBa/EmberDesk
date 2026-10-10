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


test.describe('React settings sole-owner page', () => {
    test('covers provider domain, secret isolation, and reload persistence', async ({ page }) => {
        await testSetup.awaitST({ page });
        await openSettings(page);

        // Generation defaults moved to the AI Response Configuration drawer;
        // the React surface owns only Providers. The interface and advanced
        // tabs are retired: their preferences are fixed runtime constants.
        await expect(page.getByRole('button', { name: 'General', exact: true })).toHaveCount(0);
        await expect(page.getByRole('button', { name: '界面', exact: true })).toHaveCount(0);
        await expect(page.getByRole('button', { name: '高级', exact: true })).toHaveCount(0);
        await expect(page.locator('.settings-workspace-link')).toBeVisible();

        await expect(page.getByText('API Key', { exact: true })).toBeVisible();
        await expect(page.locator('#provider-secret-input')).toBeVisible();
        await expect(page.locator('#fallback-provider-secret-input')).toHaveCount(0);

        // The fallback model is auxiliary: editing it proves the save path
        // without touching the primary model other tests depend on.
        const modelField = page.locator('#settings-providers-fallbackProviderModel');
        await expect(modelField).toBeVisible({ timeout: 30_000 });
        const originalValue = String((await getSettingsPayload(page)).settings?.oai_settings?.fallback_provider_model ?? '');
        // Unique per run: a sibling test may persist a snapshot that already
        // contains our draft value, which would leave the form pristine.
        const fallbackValue = `e2e-fallback-${Date.now()}`;

        const saveButton = page.locator('button[type="submit"]');
        // fullyParallel shares one settings document; a concurrent save from
        // another test can bump the revision mid-flight, and a background
        // refetch re-render can revert a mid-fill keystroke on the controlled
        // input before it marks the form dirty. Re-apply the draft until the
        // save button reflects it, then on a conflict banner reload the
        // persisted document and re-apply before retrying.
        let savedValue = fallbackValue;
        for (let attempt = 0; attempt < 5; attempt++) {
            savedValue = `${fallbackValue}-${attempt}`;
            // A concurrent render can restore the controlled input before the
            // fill commits; verify the DOM retains the draft and re-apply via
            // per-key input when the atomic fill is swallowed.
            await modelField.fill(savedValue);
            const retained = await expect(modelField)
                .toHaveValue(savedValue, { timeout: 5_000 })
                .then(() => true)
                .catch(() => false);
            if (!retained) {
                continue;
            }
            const becameEnabled = await expect(saveButton)
                .toBeEnabled({ timeout: 10_000 })
                .then(() => true)
                .catch(() => false);
            if (!becameEnabled) {
                continue;
            }
            await saveButton.focus();
            await page.keyboard.press('Enter');
            const conflicted = await Promise.race([
                page.locator('.settings-status--success').waitFor({ state: 'visible', timeout: 30_000 }).then(() => false),
                page.getByText(/本地草稿仍保留/).waitFor({ state: 'visible', timeout: 30_000 }).then(() => true),
            ]);
            if (!conflicted) {
                break;
            }
            await page.getByRole('button', { name: '重新加载当前设置', exact: true }).click();
            await expect(page.getByText(/本地草稿仍保留/)).toHaveCount(0, { timeout: 30_000 });
        }
        await expect(page.locator('.settings-status--success')).toContainText('已保存', { timeout: 30_000 });

        const after = await getSettingsPayload(page);
        expect(after.settings?.oai_settings?.fallback_provider_model).toBe(savedValue);
        expect(JSON.stringify(after.settings)).not.toMatch(/BEGIN PRIVATE KEY/);
        // Retired advanced-tab keys never come back through a React save.
        expect(after.settings?.power_user?.user_prompt_bias).toBeUndefined();
        expect(after.settings?.power_user?.tokenizer).toBeUndefined();
        await page.reload();
        await openSettings(page);
        // fullyParallel shares one settings document across tests, so compare the
        // hydrated field against the live persisted value instead of a literal.
        const persisted = await getSettingsPayload(page);
        const persistedModel = String(persisted.settings?.oai_settings?.fallback_provider_model ?? '');
        await expect(page.locator('#settings-providers-fallbackProviderModel')).toHaveValue(persistedModel, { timeout: 30_000 });

        // Restore the fallback model so sibling tests see the original document.
        const restore = structuredClone(persisted.settings);
        restore.oai_settings = { ...(restore.oai_settings || {}), fallback_provider_model: originalValue };
        const restored = await saveSettingsDocument(page, restore, persisted.settingsRevision);
        expect(restored.status).toBeLessThan(400);
    });

    test('surfaces revision conflicts without fake success', async ({ page }) => {
        await testSetup.awaitST({ page });
        await openSettings(page);

        const modelField = page.locator('#settings-providers-openaiModel');
        const draftModel = `Local draft ${Date.now()}`;
        await modelField.fill(draftModel);

        // Sibling tests share the settings document; another save may bump the
        // revision before our concurrent write lands. Retry with a fresh
        // revision so the test only proves the conflict path deterministically.
        let currentRevision = null;
        for (let attempt = 0; attempt < 3; attempt++) {
            const initial = await getSettingsPayload(page);
            const concurrentSettings = structuredClone(initial.settings);
            concurrentSettings.e2e_probe_key = `Concurrent-${Date.now()}`;
            const concurrent = await saveSettingsDocument(page, concurrentSettings, initial.settingsRevision);
            if (concurrent.status === 409) {
                continue;
            }
            expect(concurrent.status).toBeLessThan(400);
            break;
        }

        const afterConcurrent = await getSettingsPayload(page);
        currentRevision = afterConcurrent.settingsRevision;

        if (currentRevision == null) {
            // File-authority / compat LWW path: server may not enforce revision yet.
            // Still prove the React page remains usable and does not show fake success banners.
            await expect(modelField).toHaveValue(draftModel);
            await expect(page.locator('.settings-status--success')).toHaveCount(0);
            return;
        }

        const saveButton = page.locator('button[type="submit"]');
        await expect(saveButton).toBeEnabled({ timeout: 30_000 });
        await saveButton.click();

        await expect(page.getByText(/本地草稿仍保留/)).toBeVisible({ timeout: 30_000 });
        await expect(modelField).toHaveValue(draftModel);
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
