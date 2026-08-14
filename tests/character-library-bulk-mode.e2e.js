import { expect, test } from '@playwright/test';

import { testSetup } from './frontend/frontent-test-utils.js';

const characterName = 'Dev Character 001';

async function openCharacterLibrary(page) {
    const panelButton = page.locator('.react-workspace-shell-nav-button').filter({ hasText: 'Character Library' });
    await panelButton.click({ timeout: 10_000 });
    await expect(panelButton).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
    await expect(page.locator('#right-nav-panel.openDrawer #rm_characters_block')).toBeVisible({ timeout: 10_000 });
}

test.describe('character library bulk mode', () => {
    test('keeps consecutive character rows visually compact', async ({ page }) => {
        await testSetup.awaitST({ page });
        await openCharacterLibrary(page);

        const characterRows = page.locator('#rm_print_characters_block .character_select');
        await expect(characterRows.nth(1)).toBeVisible({ timeout: 15_000 });

        const firstRowBox = await characterRows.nth(0).boundingBox();
        const secondRowBox = await characterRows.nth(1).boundingBox();
        expect(firstRowBox).not.toBeNull();
        expect(secondRowBox).not.toBeNull();
        expect(secondRowBox.y - firstRowBox.y).toBeLessThanOrEqual(firstRowBox.height + 28);
    });

    test('keeps a filtered React character row visible after exiting bulk mode', async ({ page }) => {
        await testSetup.awaitST({ page });
        await openCharacterLibrary(page);

        await page.getByRole('searchbox', { name: 'Search characters' }).fill(characterName);
        const characterRow = page.locator('#rm_print_characters_block .character_select').filter({ hasText: characterName }).first();
        await expect(characterRow).toBeVisible({ timeout: 15_000 });

        const bulkToggle = page.getByRole('button', { name: 'Bulk edit characters', exact: true });
        await bulkToggle.click();
        await expect(characterRow).toHaveAttribute('role', 'checkbox');
        await characterRow.click();
        await expect(characterRow).toHaveAttribute('aria-checked', 'true');

        await bulkToggle.click();
        await expect(characterRow).toHaveAttribute('role', 'button');
        await expect(characterRow).toBeVisible({ timeout: 15_000 });
    });

    test('anchors the character export format popup to the visible React action', async ({ page }) => {
        await testSetup.awaitST({ page });
        await openCharacterLibrary(page);

        await page.getByRole('searchbox', { name: 'Search characters' }).fill(characterName);
        const characterRow = page.locator('#rm_print_characters_block .character_select').filter({ hasText: characterName }).first();
        await expect(characterRow).toBeVisible({ timeout: 15_000 });
        await characterRow.click();

        const authoring = page.locator('[data-react-authoring-owner="characterAuthoring"]');
        try {
            await expect(authoring).toBeVisible({ timeout: 15_000 });
        } catch {
            await expect(page.locator('#rm_print_characters_block .character_select.is_active').filter({ hasText: characterName })).toBeVisible();
            await page.locator('#rm_print_characters_block .character_select.is_active').filter({ hasText: characterName }).click();
            await expect(authoring).toBeVisible({ timeout: 15_000 });
        }

        const exportTrigger = authoring.getByRole('button', { name: 'Export', exact: true });
        await exportTrigger.click();
        const popup = page.locator('#export_format_popup');
        await expect(popup).toBeVisible({ timeout: 10_000 });

        const triggerBox = await exportTrigger.boundingBox();
        const popupBox = await popup.boundingBox();
        expect(triggerBox).not.toBeNull();
        expect(popupBox).not.toBeNull();
        expect(popupBox.x).toBeGreaterThan(triggerBox.x - popupBox.width - 100);

        await page.keyboard.press('Escape');
        await expect(popup).toBeHidden();
        await expect(exportTrigger).toBeFocused();
    });
});
