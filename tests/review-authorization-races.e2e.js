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
        return { revision: json.settings_revision, grants: JSON.parse(json.settings).power_user.external_media_allowed_overrides ?? [] };
    });
}
async function avatar(page) {
    return await page.evaluate(() => { const x = window.SillyTavern.getContext(); return x.characters[x.characterId].avatar; });
}

test('two tabs: stale unrelated settings save cannot restore a persisted revocation', async ({ page, context }) => {
    const name = AUTHORIZATION_FIXTURES.staleSettingsSave;
    await testSetup.awaitST({ page }); await select(page, name);
    const id = await avatar(page);
    if (!await permission(page).isChecked()) { await permission(page).check(); }
    await expect.poll(async () => (await saved(page)).grants.includes(id)).toBe(true);
    const other = await context.newPage();
    await testSetup.awaitST({ page: other }); await select(other, name);
    await expect(permission(other)).toBeChecked();
    await permission(page).uncheck();
    await expect.poll(async () => (await saved(page)).grants.includes(id)).toBe(false);
    const revoked = await saved(page);
    const statuses = [];
    other.on('response', r => { if (r.url().includes('/api/settings/save')) statuses.push(r.status()); });
    await other.evaluate(async () => { const { saveSettings } = await import('/script.js'); await saveSettings(); });
    const restored = await saved(page);
    console.log('REVIEW_RACE', JSON.stringify({ id, revoked, restored, statuses }));
    expect(statuses).toContain(409);
    expect(statuses).toContain(200);
    expect(restored.grants).not.toContain(id);
    await page.reload(); await testSetup.awaitST({ page }); await select(page, name);
    await expect(permission(page)).not.toBeChecked();
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
