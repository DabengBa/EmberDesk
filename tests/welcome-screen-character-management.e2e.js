import { expect, test } from '@playwright/test';

import { testSetup } from './frontend/frontent-test-utils.js';

test.describe('welcome screen shortcuts', () => {
    test('welcome screen character management shortcut opens the character drawer', async ({ page }) => {
        await testSetup.awaitST({ page });

        const welcomeCharacterManagementButton = page
            .locator('.mes .drawer-opener[data-target="rightNavHolder"]')
            .filter({ hasText: /Character Management|角色管理/ })
            .first();

        await expect(welcomeCharacterManagementButton).toBeVisible({ timeout: 10_000 });
        await welcomeCharacterManagementButton.click();

        await expect(page.locator('#right-nav-panel')).toHaveClass(/openDrawer/, { timeout: 10_000 });
        await expect(page.locator('#right-nav-panel.openDrawer #rm_characters_block')).toBeVisible({ timeout: 10_000 });
        await expect(page.locator('#rm_print_characters_block .character_select[data-chid]').first()).toBeVisible({ timeout: 10_000 });
    });
});
