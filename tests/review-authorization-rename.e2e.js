import { test, expect } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';
import { AUTHORIZATION_FIXTURES, seededAvatar } from './helpers/authorization-fixtures.js';
import { selectCharacterFromLibrary } from './helpers/character-selection.js';


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
        return { revision: json.settings_revision, power_user: JSON.parse(json.settings).power_user };
    });
}

test('delayed rename snapshot cannot overwrite a newer revoke', async ({ page }) => {
    await testSetup.awaitST({ page });
    await select(page, 'Dev Character 048');
    if (!await permission(page).isChecked()) await permission(page).check();
    const canonicalId = await page.evaluate(() => { const x = window.SillyTavern.getContext(); return x.characters[x.characterId].canonical_id; });
    let release, ready;
    const gate = new Promise(resolve => { release = resolve; });
    const responseReady = new Promise(resolve => { ready = resolve; });
    await page.route('**/api/characters/rename', async route => {
        const response = await route.fetch();
        const body = await response.json();
        ready(body);
        await gate;
        await route.fulfill({ response });
    });
    await page.evaluate(async () => {
        const { renameCharacter } = await import('/scripts/character-lifecycle-service.js');
        window.pendingRename = renameCharacter('Review delayed rename 048', { silent: true, renameChats: false });
    });
    const renamed = await responseReady;
    const revoke = await page.evaluate(async ({ avatar, canonicalId }) => {
        const { getRequestHeaders } = await import('/scripts/request-context.js');
        const response = await fetch('/api/settings/character-css-authorization', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ characterId: avatar, canonicalId, allowed: false }) });
        const result = await response.json();
        const { requireCharacterLifecycleShellContext } = await import('/scripts/character-lifecycle-shell-context.js');
        const state = requireCharacterLifecycleShellContext().state;
        state.settingsDocumentRevision = result.settings_revision;
        for (const key of ['external_media_allowed_overrides', 'external_media_forbidden_overrides']) {
            if (Object.hasOwn(result.power_user, key)) state.power_user[key] = result.power_user[key];
            else delete state.power_user[key];
        }
        return result.settings_revision;
    }, { avatar: renamed.avatar, canonicalId });
    expect(revoke).toBeGreaterThan(renamed.settings_revision);
    release();
    expect(await page.evaluate(() => window.pendingRename)).toBe(true);
    const local = await page.evaluate(async () => {
        const { requireCharacterLifecycleShellContext } = await import('/scripts/character-lifecycle-shell-context.js');
        const state = requireCharacterLifecycleShellContext().state;
        return { revision: state.settingsDocumentRevision, grants: state.power_user.external_media_allowed_overrides ?? [] };
    });
    expect(local.revision).toBeGreaterThanOrEqual(revoke);
    expect(local.grants).not.toContain(renamed.avatar);
});

test('rename atomically moves the grant even if later settings writes fail', async ({ page }) => {
    const source = AUTHORIZATION_FIXTURES.renameSource;
    const target = AUTHORIZATION_FIXTURES.renameTarget;
    const sourceAvatar = seededAvatar(source);
    await testSetup.awaitST({ page });
    await select(page, source);
    const old = await page.evaluate(() => { const x = window.SillyTavern.getContext(); return x.characters[x.characterId].avatar; });
    expect(old).toBe(sourceAvatar);
    if (!await permission(page).isChecked()) await permission(page).check();
    await expect.poll(async () => (await saved(page)).power_user.external_media_allowed_overrides?.includes(old)).toBe(true);
    const canonicalId = await page.evaluate(() => { const x = window.SillyTavern.getContext(); return x.characters[x.characterId].canonical_id; });
    expect(canonicalId).toBeTruthy();

    await page.route('**/api/settings/save', route => route.abort());
    const renamed = await page.evaluate(async newName => {
        const { renameCharacter } = await import('/scripts/character-lifecycle-service.js');
        return await renameCharacter(newName, { silent: true, renameChats: false });
    }, `Review Renamed ${source.slice(-3)}`);
    expect(renamed).toBe(true);
    await expect(permission(page)).toBeChecked();
    await page.waitForTimeout(1400);
    const afterFailedSave = await saved(page);
    await page.unroute('**/api/settings/save');
    await page.reload(); await testSetup.awaitST({ page }); await select(page, target);
    const unrelatedOld = await page.evaluate(() => { const x = window.SillyTavern.getContext(); return x.characters[x.characterId].avatar; });
    // Reuse the freed avatar key: the old grant must not resurface at it.
    const changed = await page.evaluate(async reusedName => {
        const { renameCharacter } = await import('/scripts/character-lifecycle-service.js');
        return await renameCharacter(reusedName, { silent: true, renameChats: false });
    }, sourceAvatar.replace(/\.png$/, ''));
    expect(changed).toBe(true);
    const newState = await page.evaluate(async () => {
        const x = window.SillyTavern.getContext(); const avatar = x.characters[x.characterId].avatar;
        const { isCharacterExternalMediaAllowed } = await import('/scripts/external-media-policy.js');
        const { power_user } = await import('/scripts/power-user.js');
        return { avatar, allowed: isCharacterExternalMediaAllowed(power_user, avatar, x.characters[x.characterId].canonical_id), grants: power_user.external_media_allowed_overrides };
    });
    console.log('REVIEW_LIFECYCLE', JSON.stringify({ old, unrelatedOld, afterFailedSave: afterFailedSave.power_user.external_media_allowed_overrides, newState }));
    expect(newState.avatar).toBe(old); expect(newState.allowed).toBe(false);
    const delayedStatus = await page.evaluate(async ({ old, canonicalId }) => {
        const { getRequestHeaders } = await import('/scripts/request-context.js');
        const response = await fetch('/api/settings/character-css-authorization', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ characterId: old, canonicalId, allowed: true }) });
        return response.status;
    }, { old, canonicalId });
    expect(delayedStatus).toBe(404);
    expect((await saved(page)).power_user.external_media_allowed_overrides ?? []).not.toContain(old);
});
