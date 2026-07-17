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
    const expectedStatuses = Array.isArray(status) ? status : [status];
    await expect.poll(async () => page.evaluate(() => ({
        active: document.querySelector('[data-workspace-shell-panel-active="true"]')?.textContent?.trim() ?? null,
        status: document.querySelector('.react-workspace-panel-dock-status')?.textContent?.trim() ?? null,
    })), { timeout: 10_000 }).toEqual(expect.objectContaining({ active: label }));
    await expect.poll(async () => page.evaluate(() => (
        document.querySelector('.react-workspace-panel-dock-status')?.textContent?.trim() ?? null
    )), { timeout: 10_000 }).toBeOneOf(expectedStatuses);
}

expect.extend({
    toBeOneOf(received, expectedValues) {
        const pass = expectedValues.includes(received);
        return {
            pass,
            message: () => `expected ${this.utils.printReceived(received)} to be one of ${this.utils.printExpected(expectedValues)}`,
        };
    },
});

function readyOrLegacyStatus(label) {
    return [`${label} ready`, `${label} using legacy panel`];
}

async function expectNoActivePanel(page) {
    await expect.poll(async () => page.evaluate(() => ({
        activeCount: document.querySelectorAll('[data-workspace-shell-panel-active="true"]').length,
        status: document.querySelector('.react-workspace-panel-dock-status')?.textContent?.trim() ?? null,
    })), { timeout: 10_000 }).toEqual({ activeCount: 0, status: null });
}

async function expectShellPanelVisible(page, entry) {
    await expectActivePanel(page, entry.label, entry.status ?? readyOrLegacyStatus(entry.label));
    await expect(page.locator(entry.visibleSelector)).toBeVisible({ timeout: 10_000 });
}

test.describe('workspace shell panel navigation', () => {
    test('all registry entries expose unified pressed state and short ready status', async ({ page }) => {
        test.setTimeout(120_000);
        await testSetup.awaitST({ page });

        const registryEntries = [
            { label: 'Character Library', visibleSelector: '#right-nav-panel.openDrawer #rm_characters_block' },
            { label: 'World Info', visibleSelector: '#WorldInfo.openDrawer' },
            { label: 'Backgrounds', visibleSelector: '#Backgrounds.openDrawer' },
            { label: 'Extensions', visibleSelector: '#rm_extensions_block.openDrawer' },
            { label: 'Group Chats', visibleSelector: '#right-nav-panel.openDrawer #rm_group_chats_block' },
            { label: 'Character Authoring', visibleSelector: '#right-nav-panel.openDrawer #rm_ch_create_block' },
        ];

        for (const entry of registryEntries) {
            const panelButton = page.locator('.react-workspace-shell-nav-button').filter({ hasText: entry.label });
            await panelButton.focus();
            await expect(panelButton).toBeFocused();

            await clickShellPanel(page, entry.label);
            await expect(panelButton).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
            await expectActivePanel(page, entry.label, entry.status ?? readyOrLegacyStatus(entry.label));
            await expect(page.locator(entry.visibleSelector)).toBeVisible({ timeout: 15_000 });

            await clickShellPanel(page, entry.label);
            await expect(panelButton).toHaveAttribute('aria-pressed', 'false', { timeout: 15_000 });
            await expectNoActivePanel(page);
        }
    });

    test('panel entries can close and reopen the same panel', async ({ page }) => {
        await testSetup.awaitST({ page });

        await clickShellPanel(page, 'Character Library');
        await expectActivePanel(page, 'Character Library', readyOrLegacyStatus('Character Library'));
        await expect(page.locator('#right-nav-panel')).toHaveClass(/openDrawer/);

        await clickShellPanel(page, 'Character Library');
        await expectNoActivePanel(page);
        await expect(page.locator('#right-nav-panel')).toHaveClass(/closedDrawer/);

        await clickShellPanel(page, 'Character Library');
        await expectActivePanel(page, 'Character Library', readyOrLegacyStatus('Character Library'));
        await expect(page.locator('#right-nav-panel')).toHaveClass(/openDrawer/);
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

    test('legacy-hosted panel switching preserves legacy form values', async ({ page }) => {
        test.setTimeout(90_000);
        await testSetup.awaitST({ page });

        // AI Config / Formatting are React /settings routes, not drawer form hosts.
        // Keep this case on remaining same-route drawer panels and verify drawer state survives switches.
        await openShellPanel(page, 'Group Chats');
        await expect(page.locator('#right-nav-panel.openDrawer #rm_group_chats_block')).toBeVisible({ timeout: 15_000 });
        const groupName = page.locator('#rm_group_chats_block #group_name, #rm_group_chats_block input').first();
        if (await groupName.count()) {
            await groupName.fill('shell-preserve-group');
        }

        await openShellPanel(page, 'Extensions');
        await expect(page.locator('#rm_extensions_block.openDrawer')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('#extensions_settings')).toBeAttached();

        await openShellPanel(page, 'Group Chats');
        await expect(page.locator('#right-nav-panel.openDrawer #rm_group_chats_block')).toBeVisible({ timeout: 15_000 });
        if (await groupName.count()) {
            await expect(groupName).toHaveValue('shell-preserve-group');
        }
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
            status: expect.stringMatching(/^World Info (ready|using legacy panel)$/),
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
            status: expect.stringMatching(/^Character Library (ready|using legacy panel)$/),
        });
    });
    test('navigates Settings shell entry to /settings instead of opening legacy drawers', async ({ page }) => {
        await testSetup.awaitST({ page });
        await Promise.all([
            page.waitForURL(/\/settings(?:\?|$)/, { timeout: 15_000 }),
            page.locator('.react-workspace-shell-nav-button').filter({ hasText: 'Settings' }).click({ timeout: 10_000 }),
        ]);
        await expect(page).toHaveURL(/\/settings(?:\?|$)/);
        await expect(page.locator('main.settings-page')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('#user-settings-block.openDrawer')).toHaveCount(0);
    });

    test('navigates AI Config and Formatting shell entries into React settings tabs', async ({ page }) => {
        await testSetup.awaitST({ page });

        await Promise.all([
            page.waitForURL(/\/settings\?tab=providers(?:&|$)/, { timeout: 15_000 }),
            page.locator('.react-workspace-shell-nav-button').filter({ hasText: 'AI Config' }).click({ timeout: 10_000 }),
        ]);
        await expect(page).toHaveURL(/tab=providers/);

        await page.goto('/');
        await testSetup.awaitST({ page });
        await Promise.all([
            page.waitForURL(/\/settings\?tab=advanced(?:&|$)/, { timeout: 15_000 }),
            page.locator('.react-workspace-shell-nav-button').filter({ hasText: 'Formatting' }).click({ timeout: 10_000 }),
        ]);
        await expect(page).toHaveURL(/tab=advanced/);
    });
});
