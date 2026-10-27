import { expect, test } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';

/**
 * Proves the card's bound-book action opens THAT book in the focused World Info
 * editor (selected book), not the general panel and not the world-binding popup.
 * Also proves the action is disabled when nothing valid is bound.
 */
test('character authoring opens the bound world book directly and disables the action without one', async ({ page }) => {
    await testSetup.awaitST({ page });
    const id = crypto.randomUUID();
    const name = `Bound World ${id}`;
    const book = 'Dev World 02';
    const card = {
        spec: 'chara_card_v2', spec_version: '2.0',
        data: {
            name, description: 'Bound world fixture', personality: '', scenario: '',
            first_mes: 'Hello.', mes_example: '', creator_notes: '', system_prompt: '',
            post_history_instructions: '', alternate_greetings: [], tags: [],
            creator: 'Playwright', character_version: '1',
            extensions: { world: book },
        },
    };

    await page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '角色库' }).click();
    await page.setInputFiles('#character_import_file', {
        name: 'bound-world.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(card)),
    });
    // The card links an existing book, so the import options dialog offers to
    // overwrite it. Skip that side import — only the card binding matters here.
    await Promise.race([
        page.locator('.toast-success').filter({ hasText: name }).waitFor({ timeout: 20_000 }).catch(() => null),
        page.locator('#import_opt_world').waitFor({ timeout: 20_000 }).catch(() => null),
    ]);
    if (await page.locator('#import_opt_world').isVisible().catch(() => false)) {
        await page.locator('.popup-button-cancel').filter({ hasText: '全部跳过' }).click();
    }
    await expect(page.locator('.toast-success')).toContainText(name, { timeout: 20_000 });
    await page.locator('.character_select').filter({ hasText: name }).first().click();
    const authoring = page.locator('[data-react-authoring-owner="characterAuthoring"]');
    await expect(authoring).toBeVisible();

    const worldField = authoring.locator('[data-react-authoring-field="characterWorld"]');
    await expect(worldField.locator('input')).toHaveValue(book);
    const openBound = worldField.locator('[data-react-authoring-action="openBoundWorldInfo"]');
    await expect(openBound).toBeEnabled();

    // Removing or dangling the binding disables the action instead of falling
    // back to the general World Info panel.
    await worldField.locator('input').fill('');
    await expect(openBound).toBeDisabled();
    await worldField.locator('input').fill('No Such Book');
    await expect(openBound).toBeDisabled();
    await worldField.locator('input').fill(book);
    await expect(openBound).toBeEnabled();

    await openBound.click();

    // The focused book editor opened on the bound book...
    await expect(page.locator('#WorldInfo.openDrawer')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-world-info-react-control="world-select"] option:checked')).toHaveText(book);
    const editorWorldName = await page.evaluate(() => {
        const snapshot = window.SillyTavern?.getContext?.()?.worldInfo?.facadeSnapshot;
        return snapshot?.editorWorldName ?? null;
    });
    if (editorWorldName !== null) {
        expect(editorWorldName).toBe(book);
    }
    // ...and the binding popup did NOT open.
    await expect(page.locator('dialog[open]').filter({ has: page.locator('.character_world_info_selector') }))
        .toHaveCount(0);
});
