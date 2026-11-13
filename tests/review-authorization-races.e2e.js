import { test, expect } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';
import { AUTHORIZATION_FIXTURES } from './helpers/authorization-fixtures.js';
import { selectCharacterFromLibrary } from './helpers/character-selection.js';

test.setTimeout(30000);

test('browser ignores a failed older grant after a newer revoke', async ({ page }) => {
    await testSetup.awaitST({ page });
    const grants = await page.evaluate(async () => {
        const { setCharacterExternalMediaAuthorization } = await import('/scripts/character-external-media-authorization.js');
        const settings = { external_media_allowed_overrides: [] };
        let reject;
        const pending = new Promise((_, fail) => { reject = fail; });
        const options = { settings, characterId: 'race.png', getCurrentCharacterId: () => 'race.png', refresh: async () => {} };
        const first = setCharacterExternalMediaAuthorization({ ...options, allowed: true, save: () => pending });
        await setCharacterExternalMediaAuthorization({ ...options, allowed: false, save: async () => {} });
        reject(new Error('offline'));
        await first;
        return settings.external_media_allowed_overrides;
    });
    expect(grants).toEqual([]);
});

const permission = page => page.locator('[data-react-authoring-owner="characterAuthoring"]').getByRole('checkbox', { name: /允许此角色的消息 CSS 加载外部资源|Allow external CSS resources/ });
async function select(page, name) {
    await selectCharacterFromLibrary(page, name);
    await expect(permission(page)).toBeVisible();
}
async function saved(page) {
    return await page.evaluate(async () => {
        const { getRequestHeaders } = await import('/scripts/request-context.js');
        const res = await fetch('/api/settings/get', { method: 'POST', headers: getRequestHeaders(), body: '{}' });
        const json = await res.json();
        const settings = JSON.parse(json.settings);
        return { revision: json.settings_revision, grants: settings.power_user.external_media_allowed_overrides ?? [], model: settings.oai_settings.openai_model };
    });
}
async function avatar(page) {
    return await page.evaluate(() => { const x = window.SillyTavern.getContext(); return x.characters[x.characterId].avatar; });
}

test('two tabs: stale unrelated settings save cannot restore a persisted revocation', async ({ page, context }) => {
    const name = AUTHORIZATION_FIXTURES.staleSettingsSave;
    await testSetup.awaitST({ page }); await select(page, name);
    await page.waitForTimeout(2500);
    const id = await avatar(page);
    if (!await permission(page).isChecked()) { await permission(page).check(); }
    await expect.poll(async () => (await saved(page)).grants.includes(id)).toBe(true);
    await page.waitForTimeout(2500);
    const other = await context.newPage();
    await testSetup.awaitST({ page: other });
    await other.waitForTimeout(2500);
    await expect.poll(() => other.evaluate(id => window.SillyTavern.getContext().powerUserSettings.external_media_allowed_overrides.includes(id), id)).toBe(true);
    await permission(page).uncheck();
    await expect.poll(async () => (await saved(page)).grants.includes(id)).toBe(false);
    const statuses = [];
    other.on('response', r => { if (r.url().includes('/api/settings/save')) statuses.push(r.status()); });
    const unsavedModel = `authorization-recovery-${Date.now()}`;
    const error = await other.evaluate(async value => {
        window.SillyTavern.getContext().chatCompletionSettings.openai_model = value;
        const { saveSettings } = await import('/script.js');
        try { await saveSettings(0, { strict: true }); return null; } catch (error) { return error.message; }
    }, unsavedModel);
    const restored = await saved(page);
    expect(error).toContain('revision conflict');
    expect(statuses).toContain(409);
    expect(statuses).not.toContain(200);
    expect(restored.grants).not.toContain(id);
    expect(restored.model).not.toBe(unsavedModel);
    await expect(other.locator('#toast-container')).toContainText(/Settings conflict|设置冲突/);
    await expect.poll(() => other.evaluate(() => window.SillyTavern.getContext().chatCompletionSettings.openai_model)).toBe(unsavedModel);
    const writesBeforeRetry = statuses.length;
    const retryError = await other.evaluate(async () => {
        const { saveSettings } = await import('/script.js');
        try { await saveSettings(0, { strict: true }); return null; } catch (error) { return error.message; }
    });
    expect(retryError).toContain('runtime settings conflict');
    expect(statuses).toHaveLength(writesBeforeRetry);
    await other.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '设置' }).click();
    const recovery = other.locator('#SettingsPanel').getByTestId('runtime-settings-recovery');
    await expect(recovery).toBeVisible();
    await expect(recovery).toContainText(/saving is paused|已暂停保存/i);
    await expect(other.locator('#SettingsPanel .settings-status--success')).toHaveCount(0);
    const downloadPromise = other.waitForEvent('download');
    await recovery.getByRole('button', { name: /download runtime settings only|仅下载运行时设置/i }).click();
    const download = await downloadPromise;
    const chunks = [];
    for await (const chunk of await download.createReadStream()) chunks.push(chunk);
    const exported = JSON.parse(Buffer.concat(chunks).toString());
    expect(exported.oai_settings.openai_model).toBe(unsavedModel);
    await page.close();
    await other.reload(); await testSetup.awaitST({ page: other });
    expect((await saved(other)).grants).not.toContain(id);
    await other.waitForTimeout(2500);
    await other.evaluate(async value => {
        window.SillyTavern.getContext().chatCompletionSettings.openai_model = value;
        const { saveSettings } = await import('/script.js');
        await saveSettings(0, { strict: true });
    }, exported.oai_settings.openai_model);
    await expect.poll(async () => (await saved(other)).model).toBe(unsavedModel);
    expect((await saved(other)).grants).not.toContain(id);
    await other.reload(); await testSetup.awaitST({ page: other }); await select(other, name);
    await expect(permission(other)).not.toBeChecked();
    await other.close();
});

test('fast navigation after revoke preserves it', async ({ page }) => {
    const name = AUTHORIZATION_FIXTURES.immediateReload;
    await testSetup.awaitST({ page }); await select(page, name);
    const id = await avatar(page);
    if (!await permission(page).isChecked()) await permission(page).check();
    await expect.poll(async () => (await saved(page)).grants.includes(id)).toBe(true);
    await permission(page).uncheck();
    await page.reload(); await testSetup.awaitST({ page }); await select(page, name);
    const after = await saved(page);
    console.log('REVIEW_RELOAD', JSON.stringify({ id, after, checked: await permission(page).isChecked() }));
    expect(after.grants).not.toContain(id);
    await expect(permission(page)).not.toBeChecked();
});

test('failed authorization request restores the checkbox and persisted grant', async ({ page }) => {
    const name = AUTHORIZATION_FIXTURES.failedAuthorizationRollback;
    await testSetup.awaitST({ page }); await select(page, name);
    const id = await avatar(page);
    if (!await permission(page).isChecked()) await permission(page).check();
    await expect.poll(async () => (await saved(page)).grants.includes(id)).toBe(true);
    await page.route('**/api/settings/character-css-authorization', route => route.fulfill({ status: 503, body: 'failed' }));
    await permission(page).uncheck();
    await expect(permission(page)).toBeChecked();
    expect((await saved(page)).grants).toContain(id);
    await expect(page.locator('#toast-container')).toContainText(/Settings could not be saved|无法保存|设置/);
});
