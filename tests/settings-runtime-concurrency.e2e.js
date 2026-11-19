import { expect, test } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';

test('overlapping runtime fields are resolved in Settings against the values shown', async ({ page, context }) => {
    await testSetup.awaitST({ page });
    const other = await context.newPage();
    await testSetup.awaitST({ page: other });
    await Promise.all([page, other].map(tab => tab.waitForTimeout(2500)));
    await saveModels(page, 'first-window', 'first-fallback', 500);
    await expect(saveModels(other, 'my-model', 'my-fallback', 700)).rejects.toThrow('revision conflict');
    const notice = other.locator('#toast-container').getByText(/Settings conflict|设置冲突/);
    await expect(notice).toBeVisible();

    await other.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '设置' }).click();
    const recovery = other.locator('#SettingsPanel').getByTestId('runtime-settings-recovery');
    const model = recovery.getByTestId('settings-conflict-oai_settings.openai_model');
    const fallback = recovery.getByTestId('settings-conflict-oai_settings.fallback_provider_model');
    await expect(model).toContainText('first-window');
    await expect(model).toContainText('my-model');
    const maxResponse = recovery.getByTestId('settings-conflict-oai_settings.openai_max_tokens');
    await expect(maxResponse.locator('legend')).toHaveText(/Max Response|最大回复/);
    await expect(maxResponse).toContainText('0.5k');
    await expect(recovery.locator('fieldset')).toHaveCount(3);
    const downloadPromise = other.waitForEvent('download');
    await recovery.getByRole('button', { name: /download runtime settings only|仅下载运行时设置/i }).click();
    const download = await downloadPromise;
    const chunks = [];
    for await (const chunk of await download.createReadStream()) chunks.push(chunk);
    expect(JSON.parse(Buffer.concat(chunks).toString()).oai_settings).toMatchObject({ openai_model: 'my-model', fallback_provider_model: 'my-fallback' });
    await model.getByRole('radio', { name: /Use mine|用我的/ }).check();
    await fallback.getByRole('radio', { name: /Use saved|用已保存的/ }).check();
    await maxResponse.getByRole('radio', { name: /Use saved|用已保存的/ }).check();

    await saveModels(page, 'newer-window', 'first-fallback');
    const apply = recovery.getByRole('button', { name: /Apply choices|应用选择/ });
    await apply.click();
    await expect(model).toContainText('newer-window');
    await expect(recovery.getByRole('status')).toHaveText(/Choose again|重新选择/);
    await expect(apply).toBeDisabled();
    await expect(fallback.getByRole('radio', { name: /Use saved|用已保存的/ })).toBeChecked();
    expect((await readStoredSettings(page)).openai_model).toBe('newer-window');

    await model.getByRole('radio', { name: /Use mine|用我的/ }).check();
    await apply.click();
    await expect(recovery).toHaveCount(0);
    await expect(notice).toHaveCount(0);
    expect(await readStoredSettings(other)).toMatchObject({ openai_model: 'my-model', fallback_provider_model: 'first-fallback' });
    expect(await other.evaluate(() => window.SillyTavern.getContext().chatCompletionSettings.fallback_provider_model)).toBe('first-fallback');
    await startRuntimeSave(other, 'after-resolution');
    expect(await other.evaluate(() => window.__settingsSave)).toBe('saved');
});

function saveModels(page, model, fallback, maxResponse) {
    return page.evaluate(async ({ model, fallback, maxResponse }) => {
        const { saveSettings } = await import('/script.js');
        const settings = window.SillyTavern.getContext().chatCompletionSettings;
        settings.openai_model = model;
        settings.fallback_provider_model = fallback;
        if (maxResponse !== undefined) settings.openai_max_tokens = maxResponse;
        await saveSettings(0, { strict: true });
    }, { model, fallback, maxResponse });
}

test('two open workspaces save different settings without overwriting each other', async ({ page, context }) => {
    await testSetup.awaitST({ page });
    const other = await context.newPage();
    await testSetup.awaitST({ page: other });
    await startRuntimeSave(page, 'model-from-first-window');
    expect(await page.evaluate(() => window.__settingsSave)).toBe('saved');

    await other.evaluate(async () => {
        const { saveSettings } = await import('/script.js');
        const settings = window.SillyTavern.getContext().chatCompletionSettings;
        settings.fallback_provider_model = 'model-from-second-window';
        await saveSettings(0, { strict: true });
        // The second tab still has the old active model in memory. A later
        // unrelated runtime save must not write it back.
        settings.temperature = 0.42;
        await saveSettings(0, { strict: true });
    });
    expect(await readStoredSettings(page)).toMatchObject({
        openai_model: 'model-from-first-window',
        fallback_provider_model: 'model-from-second-window',
        temperature: 0.42,
    });
    await expect(other.locator('#toast-container').getByText(/Settings conflict|设置冲突/)).toHaveCount(0);
});

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

test('a Settings form save preserves an already pending runtime edit', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '设置' }).click();
    const panel = page.locator('#SettingsPanel');
    const field = panel.locator('#settings-providers-fallbackProviderModel');
    await field.fill('from-form');
    await page.evaluate(() => {
        globalThis.SillyTavern.getContext().chatCompletionSettings.openai_model = 'pending-runtime';
    });
    await panel.locator('button[type="submit"]').click();
    await expect(panel.locator('.settings-status--success')).toBeVisible();
    await page.evaluate(async () => (await import('/script.js')).saveSettings(0, { strict: true }));
    expect(await readStoredSettings(page)).toMatchObject({ openai_model: 'pending-runtime', fallback_provider_model: 'from-form' });
});

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
