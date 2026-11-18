import { expect, test } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';

test('runtime saves wait for an in-flight runtime save and use its committed revision', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.waitForTimeout(2500);
    const { held, release, statuses } = await holdFirstSettingsResponse(page);
    await startRuntimeSave(page, 'first-runtime-model');
    await held;
    try {
        await startRuntimeSave(page, 'second-runtime-model', '__laterSettingsSave');
    } finally {
        release();
    }
    expect(await page.evaluate(() => Promise.all([window.__settingsSave, window.__laterSettingsSave]))).toEqual(['saved', 'saved']);
    expect(statuses).toEqual([200, 200]);
    expect((await readStoredSettings(page)).openai_model).toBe('second-runtime-model');
});

test('a delayed Settings form response does not cause a same-tab runtime conflict', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.waitForTimeout(2500);
    await page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '设置' }).click();
    const panel = page.locator('#SettingsPanel');
    const field = panel.locator('#settings-providers-fallbackProviderModel');
    await expect(field).toBeVisible();
    const { held, release, statuses } = await holdFirstSettingsResponse(page);
    await field.fill('same-tab-form-model');
    await panel.locator('button[type="submit"]').click();
    await held;
    try {
        await startRuntimeSave(page, 'same-tab-runtime-model');
        // In the buggy path, the runtime POST reaches the server while the
        // previous response is still held and returns 409.
        const result = await page.evaluate(() => Promise.race([
            window.__settingsSave,
            new Promise(resolve => setTimeout(() => resolve('waiting'), 1000)),
        ]));
        expect(result).toBe('waiting');
    } finally {
        release();
    }
    expect(await page.evaluate(() => window.__settingsSave)).toBe('saved');
    await expect(panel.locator('.settings-status--success')).toBeVisible();
    await expect(panel.getByTestId('runtime-settings-recovery')).toHaveCount(0);
    await expect(page.locator('#toast-container').getByText(/Settings conflict|设置冲突/)).toHaveCount(0);
    await startRuntimeSave(page, 'follow-up-runtime-model');
    expect(await page.evaluate(() => window.__settingsSave)).toBe('saved');
    // Settings may also trigger a debounced runtime save; it must not conflict either.
    expect(statuses.length).toBeGreaterThanOrEqual(3);
    expect(new Set(statuses)).toEqual(new Set([200]));
    expect(await readStoredSettings(page)).toMatchObject({
        fallback_provider_model: 'same-tab-form-model',
        openai_model: 'follow-up-runtime-model',
    });
});

async function holdFirstSettingsResponse(page) {
    let release, committed;
    const held = new Promise(resolve => { committed = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    const statuses = [];
    await page.route('**/api/settings/save', async route => {
        const response = await route.fetch();
        statuses.push(response.status());
        if (statuses.length === 1) {
            committed();
            await gate;
        }
        await route.fulfill({ response });
    });
    return { held, release, statuses };
}

async function startRuntimeSave(page, model, key = '__settingsSave') {
    await page.evaluate(async ({ model, key }) => {
        const script = await import('/script.js');
        globalThis.SillyTavern.getContext().chatCompletionSettings.openai_model = model;
        window[key] = script.saveSettings(0, { strict: true }).then(() => 'saved', error => error.message);
    }, { model, key });
}

async function readStoredSettings(page) {
    return page.evaluate(async () => {
        const { getRequestHeaders } = await import('/scripts/request-context.js');
        const response = await fetch('/api/settings/get', { method: 'POST', headers: getRequestHeaders(), body: '{}' });
        return JSON.parse((await response.json()).settings).oai_settings;
    });
}

test('a delayed runtime change is not overwritten by an earlier Settings response', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.waitForTimeout(2500); // Let startup's unrelated debounced settings writes settle.
    await page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '设置' }).click();
    const panel = page.locator('#SettingsPanel');
    const field = panel.locator('#settings-providers-fallbackProviderModel');
    await expect(field).toBeVisible();

    let release;
    let committed;
    const held = new Promise(resolve => { committed = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    let intercepted = false;
    await page.route('**/api/settings/save', async route => {
        if (intercepted) return route.continue();
        const response = await route.fetch();
        if (response.status() !== 200) return route.fulfill({ response });
        intercepted = true;
        committed(response.status());
        await gate;
        await route.fulfill({ response });
    });
    await field.fill(`settings-draft-${Date.now()}`);
    await panel.locator('button[type="submit"]').click();
    expect(await held).toBe(200);
    const changed = `late-runtime-model-${Date.now()}`;
    await page.evaluate(async value => {
        const context = globalThis.SillyTavern.getContext();
        context.chatCompletionSettings.openai_model = value;
        const script = await import('/script.js');
        script.saveSettingsDebounced();
    }, changed);
    release();
    await expect(panel.locator('.settings-status--success')).toBeVisible();
    await expect.poll(() => page.evaluate(() => globalThis.SillyTavern.getContext().chatCompletionSettings.openai_model)).toBe(changed);
    await expect.poll(async () => page.evaluate(async () => {
        const { getRequestHeaders } = await import('/scripts/request-context.js');
        const response = await fetch('/api/settings/get', { method: 'POST', headers: getRequestHeaders(), body: '{}' });
        const data = await response.json();
        return JSON.parse(data.settings).oai_settings.openai_model;
    }), { timeout: 15000 }).toBe(changed);
});
