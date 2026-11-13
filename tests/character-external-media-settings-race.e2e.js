import { expect, test } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';
import { AUTHORIZATION_FIXTURES } from './helpers/authorization-fixtures.js';
import { selectCharacterFromLibrary } from './helpers/character-selection.js';

test('a delayed Settings response cannot restore a revoked external media grant', async ({ page }) => {
    await testSetup.awaitST({ page });
    await selectCharacterFromLibrary(page, AUTHORIZATION_FIXTURES.delayedSettingsResponse);
    const checkbox = page.locator('[data-react-authoring-owner="characterAuthoring"]').getByRole('checkbox', { name: /允许此角色的消息 CSS 加载外部资源|Allow external CSS resources/ });
    await expect(checkbox).toBeVisible();
    if (!await checkbox.isChecked()) await checkbox.check();
    const avatar = await page.evaluate(() => {
        const context = window.SillyTavern.getContext();
        return context.characters[context.characterId].avatar;
    });
    const persistedSettings = () => page.evaluate(async () => {
        const { getRequestHeaders } = await import('/scripts/request-context.js');
        const response = await fetch('/api/settings/get', { method: 'POST', headers: getRequestHeaders(), body: '{}' });
        if (!response.ok) throw new Error(`settings get failed: ${response.status}`);
        return JSON.parse((await response.json()).settings);
    });
    await expect.poll(async () => (await persistedSettings()).power_user.external_media_allowed_overrides).toContain(avatar);
    await page.waitForTimeout(2500);
    await page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '设置' }).click();
    const panel = page.locator('#SettingsPanel');
    const field = panel.locator('#settings-providers-fallbackProviderModel');
    await expect(field).toBeVisible();

    let release;
    let committed;
    const gate = new Promise(resolve => { release = resolve; });
    const held = new Promise(resolve => { committed = resolve; });
    let intercepted = false;
    await page.route('**/api/settings/save', async route => {
        if (intercepted) return route.continue();
        intercepted = true;
        const body = route.request().postDataJSON();
        const response = await route.fetch();
        committed({ status: response.status(), grants: body.power_user?.external_media_allowed_overrides });
        await gate;
        await route.fulfill({ response });
    });
    const value = `external-media-race-${Date.now()}`;
    await field.fill(value);
    await panel.locator('button[type="submit"]').click();
    const saved = await held;
    expect(saved.status).toBe(200);
    expect(saved.grants).toContain(avatar);

    const revoke = page.waitForResponse(response => response.url().includes('/api/settings/character-css-authorization') && response.ok());
    await checkbox.evaluate(element => element.click());
    await revoke;
    await expect.poll(async () => (await persistedSettings()).power_user.external_media_allowed_overrides).not.toContain(avatar);
    release();
    await expect(panel.locator('.settings-status--success')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.SillyTavern.getContext().powerUserSettings.external_media_allowed_overrides)).not.toContain(avatar);
    expect((await persistedSettings()).power_user.external_media_allowed_overrides).not.toContain(avatar);
    expect((await persistedSettings()).oai_settings.fallback_provider_model).toBe(value);
    await page.reload();
    await testSetup.awaitST({ page });
    await selectCharacterFromLibrary(page, AUTHORIZATION_FIXTURES.delayedSettingsResponse);
    await expect(checkbox).not.toBeChecked();
});
