import { expect, test } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';

test('a late runtime success cannot clear a conflict from another in-flight save', async ({ page }) => {
    test.setTimeout(120_000);
    await testSetup.awaitST({ page });
    await page.waitForTimeout(3_000);
    let release;
    const held = new Promise(resolve => { release = resolve; });
    let committed;
    const firstCommitted = new Promise(resolve => { committed = resolve; });
    let first = true;
    const statuses = [];
    await page.route('**/api/settings/save', async route => {
        const response = await route.fetch();
        statuses.push(response.status());
        if (first) {
            first = false;
            committed();
            await held;
        }
        await route.fulfill({ response });
    });

    const firstModel = `runtime-first-${Date.now()}`;
    const laterModel = `runtime-later-${Date.now()}`;
    await page.evaluate(async model => {
        const app = await import('/script.js');
        globalThis.SillyTavern.getContext().chatCompletionSettings.openai_model = model;
        window.__firstSettingsSave = app.saveSettings(0, { strict: true }).then(() => 'saved', error => error.message);
    }, firstModel);
    await firstCommitted;
    await page.evaluate(async model => {
        const app = await import('/script.js');
        globalThis.SillyTavern.getContext().chatCompletionSettings.openai_model = model;
        window.__secondSettingsSave = app.saveSettings(0, { strict: true }).then(() => 'saved', error => error.message);
    }, laterModel);
    await expect.poll(() => statuses).toEqual([200, 409]);
    expect(await page.evaluate(() => window.__secondSettingsSave)).toMatch(/conflict/i);
    const settingsButton = page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '设置' });
    const panel = page.locator('#SettingsPanel');
    await settingsButton.click();
    await expect(panel.getByTestId('runtime-settings-recovery')).toBeVisible();
    // Resolve the older successful request only after closing and reopening.
    release();
    expect(await page.evaluate(() => window.__firstSettingsSave)).toBe('saved');
    await expect(panel.getByTestId('runtime-settings-recovery')).toBeVisible();
    await expect.poll(() => page.evaluate(() => globalThis.SillyTavern.getContext().chatCompletionSettings.openai_model)).toBe(laterModel);
    await settingsButton.click();
    await expect(panel).toHaveClass(/closedDrawer/);
    await settingsButton.click();
    await expect(panel.getByTestId('runtime-settings-recovery')).toBeVisible();
    const retry = await page.evaluate(async () => {
        const app = await import('/script.js');
        try { await app.saveSettings(0, { strict: true }); return 'saved'; } catch (error) { return error.message; }
    });
    expect(retry).toMatch(/conflict/i);
    expect(statuses).toEqual([200, 409]);
    expect(await page.evaluate(async () => {
        const { getRequestHeaders } = await import('/scripts/request-context.js');
        return JSON.parse((await (await fetch('/api/settings/get', { method: 'POST', headers: getRequestHeaders(), body: '{}' })).json()).settings).oai_settings.openai_model;
    })).toBe(firstModel);
});

test('runtime save after a committed but delayed Settings response does not erase the Settings edit', async ({ page }) => {
    const statuses = [];
    page.on('response', response => {
        if (response.url().endsWith('/api/settings/save')) statuses.push(response.status());
    });
    await testSetup.awaitST({ page });
    await page.waitForTimeout(2500);
    const settingsButton = page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '设置' });
    await settingsButton.click();
    const panel = page.locator('#SettingsPanel');
    const field = panel.locator('#settings-providers-fallbackProviderModel');
    await expect(field).toBeVisible();
    let release, committed;
    const held = new Promise(resolve => { committed = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    let intercepted = false;
    await page.route('**/api/settings/save', async route => {
        if (intercepted) return route.continue();
        const response = await route.fetch();
        if (response.status() !== 200) return route.fulfill({ response });
        intercepted = true;
        committed();
        await gate;
        await route.fulfill({ response });
    });
    const draft = `saved-draft-${Date.now()}`;
    await field.fill(draft);
    await panel.locator('button[type="submit"]').click();
    await held;
    statuses.length = 0;
    const localModel = `unsaved-runtime-${Date.now()}`;
    const error = await page.evaluate(async value => {
        globalThis.SillyTavern.getContext().chatCompletionSettings.openai_model = value;
        const script = await import('/script.js');
        try { await script.saveSettings(0, { strict: true }); return null; }
        catch (error) { return error.message; }
    }, localModel);
    expect(error).toContain('revision conflict');
    expect(statuses).toContain(409);
    await expect.poll(async () => page.evaluate(async () => {
        const { getRequestHeaders } = await import('/scripts/request-context.js');
        const response = await fetch('/api/settings/get', { method: 'POST', headers: getRequestHeaders(), body: '{}' });
        return JSON.parse((await response.json()).settings).oai_settings.fallback_provider_model;
    })).toBe(draft);
    release();
    await expect(panel.locator('.settings-status--success')).toContainText(/form.*saved.*runtime.*unsaved|表单已保存.*运行时.*未保存/i);
    await expect.poll(() => page.evaluate(() => globalThis.SillyTavern.getContext().chatCompletionSettings.openai_model)).toBe(localModel);

    const writesBeforeRetry = statuses.length;
    const retryError = await page.evaluate(async () => {
        const script = await import('/script.js');
        try { await script.saveSettings(0, { strict: true }); return null; }
        catch (error) { return error.message; }
    });
    expect(retryError).toContain('runtime settings conflict');
    expect(statuses).toHaveLength(writesBeforeRetry);

    // A later Settings save must not silently absorb or overwrite the rejected
    // runtime edit after the delayed response advances the local revision.
    const recovery = panel.getByTestId('runtime-settings-recovery');
    await expect(recovery).toBeVisible();
    await field.fill(`${draft}-later`);
    await expect(recovery).toContainText(/does not include unsaved edits in this form|不包含此表单中未保存的编辑/i);
    await expect(recovery).toContainText(/before closing the form or reloading|关闭表单或重新加载前/i);
    const downloadPromise = page.waitForEvent('download');
    await recovery.getByRole('button', { name: /download runtime settings only|仅下载运行时设置/i }).click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const exported = JSON.parse(Buffer.concat(chunks).toString());
    expect(exported.oai_settings.openai_model).toBe(localModel);
    expect(exported.oai_settings.fallback_provider_model).not.toBe(`${draft}-later`);

    await panel.locator('button[type="submit"]').click();
    await expect(recovery).toBeVisible();
    await expect.poll(() => page.evaluate(() => globalThis.SillyTavern.getContext().chatCompletionSettings.openai_model)).toBe(localModel);
    await expect.poll(async () => page.evaluate(async () => {
        const { getRequestHeaders } = await import('/scripts/request-context.js');
        const response = await fetch('/api/settings/get', { method: 'POST', headers: getRequestHeaders(), body: '{}' });
        return JSON.parse((await response.json()).settings).oai_settings.fallback_provider_model;
    })).toBe(draft);
    page.once('dialog', dialog => dialog.dismiss());
    await settingsButton.click();
    await expect(panel).toHaveClass(/openDrawer/);
    await expect(field).toHaveValue(`${draft}-later`);
    page.once('dialog', dialog => dialog.accept());
    await settingsButton.click();
    await expect(panel).toHaveClass(/closedDrawer/);
    await settingsButton.click();
    await expect(recovery).toBeVisible();
    await expect(field).not.toHaveValue(`${draft}-later`);
    await expect.poll(() => page.evaluate(() => globalThis.SillyTavern.getContext().chatCompletionSettings.openai_model)).toBe(localModel);
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
