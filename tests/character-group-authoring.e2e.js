import { expect, test } from '@playwright/test';

import { testSetup } from './frontend/frontent-test-utils.js';

async function openShellPanel(page, label) {
    const panelButton = page.locator('.react-workspace-shell-nav-button').filter({ hasText: label });
    await panelButton.click({ timeout: 10_000 });
    await expect(panelButton).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
}

async function openCharacterLibrary(page) {
    await openShellPanel(page, 'Character Library');
    await expect(page.locator('#right-nav-panel.openDrawer #rm_characters_block')).toBeVisible({ timeout: 10_000 });
}

async function openGroupChats(page) {
    await openShellPanel(page, 'Group Chats');
    await expect(page.locator('#right-nav-panel.openDrawer #rm_group_chats_block')).toBeVisible({ timeout: 10_000 });
}

async function openGroupSelectionFromCharacterLibrary(page) {
    await openCharacterLibrary(page);
    await page.locator('[title*="Show only groups"], [aria-label*="Show only groups"]').first().click();
    await expect(page.locator('#rm_print_characters_block .group_select[data-grid]').first()).toBeVisible({ timeout: 10_000 });
}

async function expectLegacyGroupAuthoringHidden(page) {
    await expect.poll(async () => page.locator('#rm_group_chats_block > :not(.emberdesk-react-group-authoring-panel-host)').evaluateAll(elements => (
        elements.length > 0 && elements.every(element => element.hidden && element.getAttribute('aria-hidden') === 'true')
    )), { timeout: 5_000 }).toBe(true);
}

async function expectActionsWithinViewport(page, panel) {
    const box = await panel.locator('.react-authoring-panel-actions').boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
}

async function memberNameAt(memberRows, index) {
    const text = ((await memberRows.nth(index).locator('span').textContent()) || '').trim();
    return text.replace(/^\d+\.\s*/, '');
}

test.describe('character and group authoring', () => {
    test('create-mode authoring hides destructive delete actions', async ({ page }) => {
        await testSetup.awaitST({ page });

        await openShellPanel(page, 'Character Authoring');
        const characterCreatePanel = page.locator('[data-react-authoring-owner="characterAuthoring"]');
        await expect(characterCreatePanel).toBeVisible({ timeout: 10_000 });
        await expect(characterCreatePanel).toHaveAttribute('data-react-authoring-mode', 'create');
        await expect(characterCreatePanel.getByRole('button', { name: /Delete/ })).toHaveCount(0);
        await expect(page.locator('#form_create')).toBeHidden();

        await openGroupChats(page);
        const groupCreatePanel = page.locator('[data-react-authoring-owner="groupAuthoring"]');
        await expect(groupCreatePanel).toBeVisible({ timeout: 10_000 });
        await expect(groupCreatePanel).toHaveAttribute('data-react-authoring-mode', 'create');
        await expect(groupCreatePanel.getByRole('button', { name: /Delete/ })).toHaveCount(0);
        await expectLegacyGroupAuthoringHidden(page);
        await expectActionsWithinViewport(page, groupCreatePanel);
    });

    test('character authoring validates locally, preserves cancel, saves edits, and keeps legacy tool routes reachable', async ({ page }) => {
        await testSetup.awaitST({ page });

        await openCharacterLibrary(page);

        const firstCharacter = page.locator('#rm_print_characters_block .character_select[data-chid]').first();
        const originalName = (await firstCharacter.locator('.ch_name').textContent())?.trim() || 'Dev Character 001';
        await firstCharacter.click();
        await openShellPanel(page, 'Character Authoring');

        const authoringPanel = page.locator('[data-react-authoring-owner="characterAuthoring"]');
        await expect(authoringPanel).toBeVisible({ timeout: 10_000 });
        await expect(authoringPanel).toHaveAttribute('data-react-authoring-mode', 'edit');
        await expect(authoringPanel.locator('.react-authoring-danger-zone').getByRole('button', { name: /Delete/ })).toBeVisible();
        await expect(authoringPanel.locator('.react-authoring-panel-actions').getByRole('button', { name: /Delete/ })).toHaveCount(0);

        const nameInput = authoringPanel.locator('[data-react-authoring-field="name"] input');
        const descriptionInput = authoringPanel.locator('[data-react-authoring-field="description"] textarea');
        const firstMessageInput = authoringPanel.locator('[data-react-authoring-field="firstMessage"] textarea');
        const statusBadge = authoringPanel.locator('.react-authoring-panel-state');

        const originalDescription = await descriptionInput.inputValue();
        const originalFirstMessage = await firstMessageInput.inputValue();
        const updatedName = `${originalName} QA`;

        await nameInput.fill('   ');
        await authoringPanel.getByRole('button', { name: 'Save' }).click();
        await expect(authoringPanel.getByRole('alert')).toHaveText('Name is required');
        await expect(descriptionInput).toHaveValue(originalDescription);

        await nameInput.fill(updatedName);
        await descriptionInput.fill(`${originalDescription}\n\nEdited in Playwright.`);
        await expect(authoringPanel).toHaveAttribute('data-react-authoring-dirty', 'true');
        await expect(statusBadge).toHaveText(/Unsaved|Saving/);

        await authoringPanel.getByRole('button', { name: 'Cancel' }).click();
        await expect(nameInput).toHaveValue(originalName, { timeout: 10_000 });
        await expect(descriptionInput).toHaveValue(originalDescription);
        await expect(firstMessageInput).toHaveValue(originalFirstMessage);
        await expect(authoringPanel).toHaveAttribute('data-react-authoring-dirty', 'false');

        await nameInput.fill(updatedName);
        await descriptionInput.fill(`${originalDescription}\n\nEdited in Playwright.`);
        await authoringPanel.getByRole('button', { name: 'World Info' }).click();
        await expect(page.locator('.popup .character_world_info_selector, #dialogue_popup .character_world_info_selector')).toBeVisible({ timeout: 10_000 });
        await page.keyboard.press('Escape');
        await expect(authoringPanel).toBeVisible({ timeout: 10_000 });
        await expect(nameInput).toHaveValue(updatedName);

        await authoringPanel.getByRole('button', { name: 'Alternate Greetings' }).click();
        await expect(page.locator('.popup .alternate_greetings_list, #dialogue_popup .alternate_greetings_list')).toBeVisible({ timeout: 10_000 });
        await page.keyboard.press('Escape');
        await expect(authoringPanel).toBeVisible({ timeout: 10_000 });
        await expect(nameInput).toHaveValue(updatedName);

        await authoringPanel.getByRole('button', { name: 'Export' }).click();
        await expect(page.locator('#export_format_popup')).toBeVisible({ timeout: 10_000 });
        await page.keyboard.press('Escape');

        await authoringPanel.getByRole('button', { name: 'Save' }).click();
        await expect(authoringPanel).toHaveAttribute('data-react-authoring-dirty', 'false', { timeout: 10_000 });
        await expect(statusBadge).toHaveText(/Ready|Saving/);

        await page.reload({ waitUntil: 'domcontentloaded' });
        await testSetup.awaitST({ page });
        await openCharacterLibrary(page);
        await page.locator('#rm_print_characters_block .character_select[data-chid]').filter({ hasText: updatedName }).first().click();
        await openShellPanel(page, 'Character Authoring');
        const reloadedPanel = page.locator('[data-react-authoring-owner="characterAuthoring"]');
        await expect(reloadedPanel.locator('[data-react-authoring-field="name"] input')).toHaveValue(updatedName, { timeout: 10_000 });
        await expect(reloadedPanel.locator('[data-react-authoring-field="description"] textarea')).toHaveValue(`${originalDescription}\n\nEdited in Playwright.`);
    });

    test('group authoring supports non-drag member reorder and persists saved edits after reload', async ({ page }) => {
        await testSetup.awaitST({ page });

        await openGroupSelectionFromCharacterLibrary(page);
        await page.locator('#rm_print_characters_block .group_select[data-grid]').first().click();
        await openGroupChats(page);

        const authoringPanel = page.locator('[data-react-authoring-owner="groupAuthoring"]');
        await expect(authoringPanel).toBeVisible({ timeout: 10_000 });
        await expect(authoringPanel).toHaveAttribute('data-react-authoring-mode', 'edit');
        await expect(authoringPanel.locator('.react-authoring-danger-zone').getByRole('button', { name: /Delete/ })).toBeVisible();
        await expect(authoringPanel.locator('.react-authoring-panel-actions').getByRole('button', { name: /Delete/ })).toHaveCount(0);
        await expectLegacyGroupAuthoringHidden(page);

        const nameInput = authoringPanel.locator('[data-react-authoring-field="name"] input');
        const originalName = await nameInput.inputValue();
        const updatedName = `${originalName} QA`;

        const memberRows = authoringPanel.locator('.react-authoring-member-row');
        await expect(memberRows).toHaveCount(4);

        const firstMemberBefore = await memberNameAt(memberRows, 0);
        const secondMemberBefore = await memberNameAt(memberRows, 1);

        await memberRows.nth(1).getByRole('button', { name: /Move .* up/ }).click();
        await expect.poll(async () => memberNameAt(memberRows, 0), { timeout: 5_000 }).toBe(secondMemberBefore);
        await expect.poll(async () => memberNameAt(memberRows, 1), { timeout: 5_000 }).toBe(firstMemberBefore);

        await nameInput.fill(updatedName);
        await expect(authoringPanel).toHaveAttribute('data-react-authoring-dirty', 'true');
        await authoringPanel.getByRole('button', { name: 'Save' }).click();
        await expect(authoringPanel).toHaveAttribute('data-react-authoring-dirty', 'false', { timeout: 10_000 });

        await page.reload({ waitUntil: 'domcontentloaded' });
        await testSetup.awaitST({ page });
        await openGroupSelectionFromCharacterLibrary(page);
        await page.locator('#rm_print_characters_block .group_select[data-grid]').filter({ hasText: updatedName }).first().click();
        await openGroupChats(page);

        const reloadedPanel = page.locator('[data-react-authoring-owner="groupAuthoring"]');
        await expect(reloadedPanel.locator('[data-react-authoring-field="name"] input')).toHaveValue(updatedName, { timeout: 10_000 });
        const reloadedRows = reloadedPanel.locator('.react-authoring-member-row');
        await expect.poll(async () => memberNameAt(reloadedRows, 0), { timeout: 5_000 }).toBe(secondMemberBefore);
        await expect.poll(async () => memberNameAt(reloadedRows, 1), { timeout: 5_000 }).toBe(firstMemberBefore);
    });
});
