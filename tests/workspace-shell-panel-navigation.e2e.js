import { expect, test } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';

async function openShellPanel(page, label) {
    const panelButton = page.locator('.react-workspace-shell-nav-button').filter({ hasText: label });
    await panelButton.click({ timeout: 10_000 });
    await expect(panelButton).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
    await expect.poll(async () => page.evaluate(() => document.readyState), { timeout: 10_000 }).toBe('complete');
}

async function clickShellPanel(page, label) {
    await page.locator('.react-workspace-shell-nav-button').filter({ hasText: label }).click({ timeout: 10_000 });
}

async function expectActivePanel(page, label) {
    await expect.poll(async () => page.evaluate(() => ({
        active: document.querySelector('[data-workspace-shell-panel-active="true"]')?.textContent?.trim() ?? null,
    })), { timeout: 10_000 }).toEqual({ active: label });
}

async function expectNoActivePanel(page) {
    await expect.poll(async () => page.evaluate(() => ({
        activeCount: document.querySelectorAll('[data-workspace-shell-panel-active="true"]').length,
        statusCount: document.querySelectorAll('.react-workspace-panel-dock-status').length,
    })), { timeout: 10_000 }).toEqual({ activeCount: 0, statusCount: 0 });
}

async function expectShellPanelVisible(page, entry) {
    await expectActivePanel(page, entry.label);
    await expect(page.locator(entry.visibleSelector)).toBeVisible({ timeout: 10_000 });
}

test.describe('workspace shell panel navigation', () => {
    test('primary registry entries expose unified pressed state without redundant status copy', async ({ page }) => {
        test.setTimeout(120_000);
        await testSetup.awaitST({ page });

        const registryEntries = [
            { label: 'Character Library', visibleSelector: '#right-nav-panel.openDrawer #rm_characters_block' },
            { label: 'World Info', visibleSelector: '#WorldInfo.openDrawer' },
            { label: 'Backgrounds', visibleSelector: '#Backgrounds.openDrawer' },
            { label: 'Extensions', visibleSelector: '#rm_extensions_block.openDrawer' },
            { label: 'Group Chats', visibleSelector: '#right-nav-panel.openDrawer #rm_group_chats_block' },
        ];

        for (const entry of registryEntries) {
            const panelButton = page.locator('.react-workspace-shell-nav-button').filter({ hasText: entry.label });
            await panelButton.focus();
            await expect(panelButton).toBeFocused();

            await clickShellPanel(page, entry.label);
            await expect(panelButton).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
            await expectActivePanel(page, entry.label);
            await expect(page.locator(entry.visibleSelector)).toBeVisible({ timeout: 15_000 });

            await clickShellPanel(page, entry.label);
            await expect(panelButton).toHaveAttribute('aria-pressed', 'false', { timeout: 15_000 });
            await expectNoActivePanel(page);
        }

        await expect(page.locator('.react-workspace-shell-nav-button').filter({ hasText: 'Character Authoring' })).toHaveCount(0);
    });

    test('panel entries can close and reopen the same panel', async ({ page }) => {
        await testSetup.awaitST({ page });

        await clickShellPanel(page, 'Character Library');
        await expectActivePanel(page, 'Character Library');
        await expect(page.locator('#right-nav-panel')).toHaveClass(/openDrawer/);

        await clickShellPanel(page, 'Character Library');
        await expectNoActivePanel(page);
        await expect(page.locator('#right-nav-panel')).toHaveClass(/closedDrawer/);

        await clickShellPanel(page, 'Character Library');
        await expectActivePanel(page, 'Character Library');
        await expect(page.locator('#right-nav-panel')).toHaveClass(/openDrawer/);
    });

    test('React shell owns a slot pin through refocus, unpin, and close', async ({ page }) => {
        await testSetup.awaitST({ page });

        const panelButton = page.locator('.react-workspace-shell-nav-button').filter({ hasText: 'Character Library' });
        await panelButton.click({ timeout: 10_000 });
        await expect(panelButton).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });

        const pinButton = page.locator('[data-workspace-shell-panel-pin="characterLibrary"]');
        await expect(pinButton).toBeVisible({ timeout: 10_000 });
        await pinButton.click();
        await expect(pinButton).toHaveAttribute('aria-pressed', 'true');

        await panelButton.click();
        await expect(panelButton).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('#right-nav-panel')).toHaveClass(/openDrawer/);

        await pinButton.click();
        await expect(pinButton).toHaveAttribute('aria-pressed', 'false');
        await panelButton.click();
        await expect(panelButton).toHaveAttribute('aria-pressed', 'false', { timeout: 10_000 });
        await expect(page.locator('#right-nav-panel')).toHaveClass(/closedDrawer/);
    });

    test('isolates a missing child-slot failure without adding shell status copy', async ({ page }) => {
        await testSetup.awaitST({ page });

        await page.evaluate(() => {
            document.getElementById('WorldInfo')?.remove();
        });

        await page.locator('.react-workspace-shell-nav-button').filter({ hasText: 'World Info' }).click();
        await expect(page.locator('.react-workspace-shell-status, .react-workspace-panel-dock-status')).toHaveCount(0);
        await expect(page.locator('.react-workspace-shell-nav')).toBeVisible();
        await expect(page.locator('#send_textarea')).toBeVisible();
    });

    test('legacy-hosted panel entries close and reopen from the same shell button', async ({ page }) => {
        await testSetup.awaitST({ page });

        const legacyHostedEntries = [
            { label: 'Group Chats', visibleSelector: '#right-nav-panel.openDrawer #rm_group_chats_block' },
        ];

        for (const entry of legacyHostedEntries) {
            const panelButton = page.locator('.react-workspace-shell-nav-button').filter({ hasText: entry.label });

            await clickShellPanel(page, entry.label);
            await expect(panelButton).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
            await expectShellPanelVisible(page, entry);

            await clickShellPanel(page, entry.label);
            await expect(panelButton).toHaveAttribute('aria-pressed', 'false', { timeout: 10_000 });
            await expectNoActivePanel(page);

            await clickShellPanel(page, entry.label);
            await expect(panelButton).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
            await expectShellPanelVisible(page, entry);
        }
    });

    test('slot switching preserves visible React group-authoring form values', async ({ page }) => {
        test.setTimeout(90_000);
        await testSetup.awaitST({ page });

        await openShellPanel(page, 'Character Library');
        await page.locator('[title*="Show only groups"], [aria-label*="Show only groups"]').first().click();
        const group = page.locator('#rm_print_characters_block .group_select[data-grid]').first();
        await expect(group).toBeVisible({ timeout: 15_000 });
        await group.click();

        await openShellPanel(page, 'Group Chats');
        await expect(page.locator('#right-nav-panel.openDrawer #rm_group_chats_block')).toBeVisible({ timeout: 15_000 });
        const groupAuthoringPanel = page.locator('[data-react-authoring-owner="groupAuthoring"]');
        await expect(groupAuthoringPanel).toBeVisible({ timeout: 15_000 });
        await expect(groupAuthoringPanel).toHaveAttribute('data-react-authoring-mode', 'edit');
        const groupName = groupAuthoringPanel.locator('[data-react-authoring-field="name"] input');
        const selectedGroupName = await groupName.inputValue();
        expect(selectedGroupName).not.toBe('');

        await openShellPanel(page, 'Extensions');
        await expect(page.locator('#rm_extensions_block.openDrawer')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('#extensions_settings')).toBeAttached();

        await openShellPanel(page, 'Group Chats');
        await expect(page.locator('#right-nav-panel.openDrawer #rm_group_chats_block')).toBeVisible({ timeout: 15_000 });
        await expect(groupName).toHaveValue(selectedGroupName);
    });

    test('panel entries stay responsive when switching from character library to world info immediately', async ({ page }) => {
        await testSetup.awaitST({ page });

        await clickShellPanel(page, 'Character Library');
        await clickShellPanel(page, 'World Info');

        await expect.poll(async () => page.evaluate(() => ({
            readyState: document.readyState,
            active: document.querySelector('[data-workspace-shell-panel-active="true"]')?.textContent?.trim(),
        })), { timeout: 10_000 }).toEqual({
            readyState: 'complete',
            active: 'World Info',
        });
    });

    test('panel entries stay responsive when opened repeatedly and switched in sequence', async ({ page }) => {
        await testSetup.awaitST({ page });

        await openShellPanel(page, 'Character Library');
        await expect.poll(async () => page.locator('#rm_print_characters_block .character_select, #rm_print_characters_block [role="listitem"]').count(), { timeout: 10_000 }).toBeGreaterThan(0);

        await openShellPanel(page, 'World Info');
        await expect.poll(async () => page.locator('#world_editor_select option').count(), { timeout: 10_000 }).toBeGreaterThan(1);

        await openShellPanel(page, 'Backgrounds');
        await expect.poll(async () => page.locator('#Backgrounds .bg_example, #Backgrounds .background-item, #Backgrounds [data-background-id]').count(), { timeout: 10_000 }).toBeGreaterThan(0);

        await openShellPanel(page, 'Extensions');
        await expect.poll(async () => page.locator('#extensions_settings, #extensions_settings2, #regex_container, #extensionsMenu').count(), { timeout: 10_000 }).toBe(4);

        await openShellPanel(page, 'Character Library');
        await expect.poll(async () => page.evaluate(() => ({
            active: document.querySelector('[data-workspace-shell-panel-active="true"]')?.textContent?.trim(),
        })), { timeout: 10_000 }).toEqual({
            active: 'Character Library',
        });
    });
    test('opens Settings shell entry as in-workspace overlay instead of leaving chat', async ({ page }) => {
        test.setTimeout(120_000);
        await testSetup.awaitST({ page });
        const settingsButton = page.locator('.react-workspace-shell-nav-button').filter({ hasText: 'Settings' });
        await settingsButton.click({ timeout: 10_000 });
        await expect(page).toHaveURL(/\/(?:\?|$)/);
        await expect(page.locator('[data-settings-overlay="true"]')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('[data-settings-overlay="true"] .settings-page')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('#user-settings-block.openDrawer')).toHaveCount(0);
        await expect(settingsButton).toHaveAttribute('aria-pressed', 'true');
        const userInterfaceTab = page.locator('[data-settings-overlay="true"] .settings-tab').filter({ hasText: 'User Interface' });
        await userInterfaceTab.click();
        await expect(userInterfaceTab).toHaveAttribute('data-active', 'true');
        const confirmDeleteToggle = page.locator('[data-settings-overlay="true"] #settings-userInterface-confirmMessageDelete');
        await expect(confirmDeleteToggle).toBeVisible();
        const shouldConfirmDelete = !(await confirmDeleteToggle.isChecked());
        await confirmDeleteToggle.focus();
        await page.keyboard.press('Space');
        await expect(confirmDeleteToggle).toHaveJSProperty('checked', shouldConfirmDelete);
        const saveButton = page.locator('[data-settings-overlay="true"] button[type="submit"]');
        await expect(saveButton).toBeEnabled();
        await saveButton.focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('[data-settings-overlay="true"] .settings-status--success')).toContainText('Saved', { timeout: 30_000 });
        await page.keyboard.press('Escape');
        await expect(page.locator('[data-settings-overlay="true"]')).toHaveCount(0, { timeout: 15_000 });
        await expect(settingsButton).toBeFocused();
        await expect(settingsButton).toHaveAttribute('aria-pressed', 'false');

        await settingsButton.click({ timeout: 10_000 });
        await expect(page.locator('[data-settings-overlay="true"]')).toBeVisible({ timeout: 15_000 });
        await settingsButton.click({ timeout: 10_000 });
        await expect(page.locator('[data-settings-overlay="true"]')).toHaveCount(0, { timeout: 15_000 });
        await expect(settingsButton).toHaveAttribute('aria-pressed', 'false');
        await expect(page.locator('#send_textarea')).toBeVisible();
    });

    test('opens AI Config and Formatting shell entries into overlay tabs without route jump', async ({ page }) => {
        await testSetup.awaitST({ page });

        const aiConfigButton = page.locator('.react-workspace-shell-nav-button').filter({ hasText: 'AI Config' });
        await aiConfigButton.click({ timeout: 10_000 });
        await expect(page).toHaveURL(/\/(?:\?|$)/);
        await expect(page.locator('[data-settings-overlay="true"]')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('[data-settings-overlay="true"] .settings-tab[data-active="true"]')).toHaveText(/Providers/i);

        await page.keyboard.press('Escape');
        await expect(page.locator('[data-settings-overlay="true"]')).toHaveCount(0, { timeout: 10_000 });
        await expect(aiConfigButton).toBeFocused();

        const formattingButton = page.locator('.react-workspace-shell-nav-button').filter({ hasText: 'Formatting' });
        await formattingButton.click({ timeout: 10_000 });
        await expect(page).toHaveURL(/\/(?:\?|$)/);
        await expect(page.locator('[data-settings-overlay="true"]')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('[data-settings-overlay="true"] .settings-tab[data-active="true"]')).toHaveText(/Advanced/i);

        await aiConfigButton.focus();
        await page.keyboard.press('Tab');
        await expect(page.locator('[data-settings-overlay="true"] :focus')).toBeVisible();
    });

    test('keeps a reopened Settings overlay mounted when a deferred close is superseded', async ({ page }) => {
        await testSetup.awaitST({ page });

        const settingsButton = page.locator('.react-workspace-shell-nav-button').filter({ hasText: 'Settings' });
        const aiConfigButton = page.locator('.react-workspace-shell-nav-button').filter({ hasText: 'AI Config' });
        await settingsButton.click({ timeout: 10_000 });
        await expect(page.locator('[data-settings-overlay="true"]')).toBeVisible({ timeout: 15_000 });

        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('.react-workspace-shell-nav-button'));
            const settings = buttons.find(button => button.textContent?.trim() === 'Settings');
            const aiConfig = buttons.find(button => button.textContent?.trim() === 'AI Config');
            settings?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            aiConfig?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        });

        await expect(page.locator('[data-settings-overlay="true"]')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('[data-settings-overlay="true"] .settings-tab[data-active="true"]')).toHaveText(/Providers/i);
        await expect(aiConfigButton).toHaveAttribute('aria-pressed', 'true');
    });
});
