import { expect, test } from '@playwright/test';

import { testSetup } from './frontend/frontent-test-utils.js';

test.describe('welcome screen shortcuts', () => {
    test('workspace character library shortcut opens the character drawer', async ({ page }) => {
        await testSetup.awaitST({ page });

        const characterLibraryButton = page
            .locator('[data-react-workspace-shell-chrome] nav button')
            .filter({ hasText: 'Character Library' });

        await expect(characterLibraryButton).toBeVisible({ timeout: 10_000 });
        await characterLibraryButton.click();
        await expect(characterLibraryButton).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });

        await expect(page.locator('#right-nav-panel')).toHaveClass(/openDrawer/, { timeout: 10_000 });
        await expect(page.locator('#right-nav-panel.openDrawer #rm_characters_block')).toBeVisible({ timeout: 10_000 });
        await expect(page.locator('#rm_print_characters_block .character_select[data-chid]').first()).toBeVisible({ timeout: 10_000 });
    });
});
