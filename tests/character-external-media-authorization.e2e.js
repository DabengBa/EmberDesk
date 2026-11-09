import { expect, test } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';
import { AUTHORIZATION_FIXTURES } from './helpers/authorization-fixtures.js';
import { selectCharacterFromLibrary } from './helpers/character-selection.js';

test('character media permission survives reopening and stays scoped when switching characters', async ({ page }) => {
    const primary = AUTHORIZATION_FIXTURES.scopedAuthorization;
    const other = AUTHORIZATION_FIXTURES.scopedAuthorizationOther;
    await testSetup.awaitST({ page });
    const permission = page.locator('[data-react-authoring-owner="characterAuthoring"]').getByRole('checkbox', { name: /允许此角色的消息 CSS 加载外部资源|Allow external CSS resources/ });
    const selectCharacter = async name => {
        await selectCharacterFromLibrary(page, name);
        await expect(permission).toBeVisible();
    };
    await selectCharacter(primary);
    await expect(permission).not.toBeChecked();
    const grantedSave = page.waitForResponse(response => response.url().includes('/api/settings/character-css-authorization') && response.ok());
    await permission.check();
    await grantedSave;
    await selectCharacter(other);
    await expect(permission).not.toBeChecked();
    await selectCharacter(primary);
    await expect(permission).toBeChecked();
    await expect.poll(async () => page.evaluate(async () => {
        const { power_user } = await import('/scripts/power-user.js');
        const { characters, characterId } = window.SillyTavern.getContext();
        return power_user.external_media_allowed_overrides?.includes(characters[characterId]?.avatar);
    })).toBe(true);
    const revokedSave = page.waitForResponse(response => response.url().includes('/api/settings/character-css-authorization') && response.ok());
    await permission.uncheck();
    await revokedSave;
    await expect(permission).not.toBeChecked();
    await page.reload();
    await testSetup.awaitST({ page });
    await selectCharacter(primary);
    await expect(permission).not.toBeChecked();
});
