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

async function expectActivePanel(page, label, status) {
    await expect.poll(async () => page.evaluate(() => ({
        active: document.querySelector('[data-workspace-shell-panel-active="true"]')?.textContent?.trim() ?? null,
        status: document.querySelector('.react-workspace-panel-dock-status')?.textContent?.trim() ?? null,
    })), { timeout: 10_000 }).toEqual({ active: label, status });
}

async function expectNoActivePanel(page) {
    await expect.poll(async () => page.evaluate(() => ({
        activeCount: document.querySelectorAll('[data-workspace-shell-panel-active="true"]').length,
        status: document.querySelector('.react-workspace-panel-dock-status')?.textContent?.trim() ?? null,
    })), { timeout: 10_000 }).toEqual({ activeCount: 0, status: null });
}

test.describe('workspace shell panel navigation', () => {
    test('all registry entries expose unified pressed state and short ready status', async ({ page }) => {
        await testSetup.awaitST({ page });

        const registryEntries = [
            { label: 'AI Config', visibleSelector: '#left-nav-panel.openDrawer' },
            { label: 'Formatting', visibleSelector: '#AdvancedFormatting.openDrawer' },
            { label: 'Character Library', visibleSelector: '#right-nav-panel.openDrawer #rm_characters_block' },
            { label: 'World Info', visibleSelector: '#WorldInfo.openDrawer' },
            { label: 'Backgrounds', visibleSelector: '#Backgrounds.openDrawer' },
            { label: 'Extensions', visibleSelector: '#rm_extensions_block.openDrawer' },
            { label: 'Settings', visibleSelector: '#user-settings-block.openDrawer' },
            { label: 'Group Chats', visibleSelector: '#right-nav-panel.openDrawer #rm_group_chats_block' },
            { label: 'Character Authoring', visibleSelector: '#right-nav-panel.openDrawer #rm_ch_create_block' },
        ];

        for (const entry of registryEntries) {
            const panelButton = page.locator('.react-workspace-shell-nav-button').filter({ hasText: entry.label });
            await panelButton.focus();
            await expect(panelButton).toBeFocused();

            await clickShellPanel(page, entry.label);
            await expect(panelButton).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
            await expectActivePanel(page, entry.label, `${entry.label} ready`);
            await expect(page.locator(entry.visibleSelector)).toBeVisible({ timeout: 10_000 });

            await clickShellPanel(page, entry.label);
            await expect(panelButton).toHaveAttribute('aria-pressed', 'false', { timeout: 10_000 });
            await expectNoActivePanel(page);
        }
    });

    test('panel entries can close and reopen the same panel', async ({ page }) => {
        await testSetup.awaitST({ page });

        await clickShellPanel(page, 'Character Library');
        await expectActivePanel(page, 'Character Library', 'Character Library ready');
        await expect(page.locator('#right-nav-panel')).toHaveClass(/openDrawer/);

        await clickShellPanel(page, 'Character Library');
        await expectNoActivePanel(page);
        await expect(page.locator('#right-nav-panel')).toHaveClass(/closedDrawer/);

        await clickShellPanel(page, 'Character Library');
        await expectActivePanel(page, 'Character Library', 'Character Library ready');
        await expect(page.locator('#right-nav-panel')).toHaveClass(/openDrawer/);
    });

    test('panel entries stay responsive when switching from character library to world info immediately', async ({ page }) => {
        await testSetup.awaitST({ page });

        await clickShellPanel(page, 'Character Library');
        await clickShellPanel(page, 'World Info');

        await expect.poll(async () => page.evaluate(() => ({
            readyState: document.readyState,
            active: document.querySelector('[data-workspace-shell-panel-active="true"]')?.textContent?.trim(),
            status: document.querySelector('.react-workspace-panel-dock-status')?.textContent?.trim(),
        })), { timeout: 10_000 }).toEqual({
            readyState: 'complete',
            active: 'World Info',
            status: 'World Info ready',
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
            status: document.querySelector('.react-workspace-panel-dock-status')?.textContent?.trim(),
        })), { timeout: 10_000 }).toEqual({
            active: 'Character Library',
            status: 'Character Library ready',
        });
    });
});
