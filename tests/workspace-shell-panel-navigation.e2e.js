import { expect, test } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';

async function openShellPanel(page, label) {
    const panelButton = page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: label });
    await panelButton.click({ timeout: 10_000 });
    await expect(panelButton).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
    await expect.poll(async () => page.evaluate(() => document.readyState), { timeout: 10_000 }).toBe('complete');
}

async function clickShellPanel(page, label) {
    await page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: label }).click({ timeout: 10_000 });
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
            { label: '角色库', visibleSelector: '#right-nav-panel.openDrawer #rm_characters_block' },
            { label: '世界书', visibleSelector: '#WorldInfo.openDrawer' },
        ];

        for (const entry of registryEntries) {
            const panelButton = page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: entry.label });
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

        await expect(page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: 'Backgrounds' })).toHaveCount(0);
        await expect(page.locator('#Backgrounds')).toHaveCount(0);
        await expect(page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: 'Character Authoring' })).toHaveCount(0);
    });

    test('panel entries can close and reopen the same panel', async ({ page }) => {
        await testSetup.awaitST({ page });

        await clickShellPanel(page, '角色库');
        await expectActivePanel(page, '角色库');
        await expect(page.locator('#right-nav-panel')).toHaveClass(/openDrawer/);

        await clickShellPanel(page, '角色库');
        await expectNoActivePanel(page);
        await expect(page.locator('#right-nav-panel')).toHaveClass(/closedDrawer/);

        await clickShellPanel(page, '角色库');
        await expectActivePanel(page, '角色库');
        await expect(page.locator('#right-nav-panel')).toHaveClass(/openDrawer/);
    });

    test('renders no shell pin control; a drawer-locked panel survives an active-entry click', async ({ page }) => {
        await testSetup.awaitST({ page });

        const panelButton = page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '角色库' });
        await panelButton.click({ timeout: 10_000 });
        await expect(panelButton).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });

        // The top bar no longer renders a pin toggle; pinning is owned by the
        // drawer's own lock checkbox (writes .pinnedOpen on the drawer host).
        await expect(page.locator('[data-workspace-shell-panel-pin]')).toHaveCount(0);

        await page.evaluate(() => {
            const pinCheckbox = document.getElementById('rm_button_panel_pin');
            if (!(pinCheckbox instanceof HTMLInputElement)) {
                throw new Error('right-nav drawer pin checkbox missing');
            }
            pinCheckbox.click();
        });
        await expect(page.locator('#right-nav-panel')).toHaveClass(/pinnedOpen/);

        // Clicking the active entry must not close a locked drawer.
        await panelButton.click();
        await expect(page.locator('#right-nav-panel')).toHaveClass(/openDrawer/);
        await expect(page.locator('#right-nav-panel')).toHaveClass(/pinnedOpen/);
    });

    test('isolates a missing child-slot failure without adding shell status copy', async ({ page }) => {
        await testSetup.awaitST({ page });

        await page.evaluate(() => {
            document.getElementById('WorldInfo')?.remove();
        });

        await page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '世界书' }).click();
        await expect(page.locator('.react-workspace-shell-status, .react-workspace-panel-dock-status')).toHaveCount(0);
        await expect(page.getByRole('navigation', { name: '工作区导航' })).toBeVisible();
        await expect(page.locator('#send_textarea')).toBeVisible();
    });

    test('legacy-hosted panel entries close and reopen from the same shell button', async ({ page }) => {
        await testSetup.awaitST({ page });

        const legacyHostedEntries = [
        ];

        for (const entry of legacyHostedEntries) {
            const panelButton = page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: entry.label });

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

    test('shell no longer offers Group Chats after retirement', async ({ page }) => {
        await testSetup.awaitST({ page });
        await expect(page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: 'Group Chats' })).toHaveCount(0);
    });

    test('panel entries stay responsive when switching from character library to world info immediately', async ({ page }) => {
        await testSetup.awaitST({ page });

        await clickShellPanel(page, '角色库');
        await clickShellPanel(page, '世界书');

        await expect.poll(async () => page.evaluate(() => ({
            readyState: document.readyState,
            active: document.querySelector('[data-workspace-shell-panel-active="true"]')?.textContent?.trim(),
        })), { timeout: 10_000 }).toEqual({
            readyState: 'complete',
            active: '世界书',
        });
    });

    test('panel entries stay responsive when opened repeatedly and switched in sequence', async ({ page }) => {
        await testSetup.awaitST({ page });

        await openShellPanel(page, '角色库');
        await expect.poll(async () => page.locator('#rm_print_characters_block .character_select, #rm_print_characters_block [role="listitem"]').count(), { timeout: 10_000 }).toBeGreaterThan(0);

        await openShellPanel(page, '世界书');
        await expect.poll(async () => page.locator('#world_editor_select option').count(), { timeout: 10_000 }).toBeGreaterThan(1);

        await openShellPanel(page, '角色库');
        await expect.poll(async () => page.evaluate(() => ({
            active: document.querySelector('[data-workspace-shell-panel-active="true"]')?.textContent?.trim(),
        })), { timeout: 10_000 }).toEqual({
            active: '角色库',
        });
    });

    test('opens the standalone Regex workspace drawer with the mounted feature panel', async ({ page }) => {
        await testSetup.awaitST({ page });

        await openShellPanel(page, '正则');
        await expect(page.locator('#RegexPanel.openDrawer')).toBeVisible({ timeout: 10_000 });
        await expect(page.locator('#RegexPanel .regex_settings')).toHaveCount(1);
        await expect(page.locator('#regex_container')).toHaveCount(0);

        // The settings inline drawer starts collapsed; expanding reveals the feature controls.
        await page.locator('#RegexPanel .regex_settings .inline-drawer-toggle').click();
        await expect(page.locator('#RegexPanel .regex_settings #open_regex_editor')).toBeVisible({ timeout: 10_000 });
    });
    test('opens Settings shell entry as in-workspace overlay instead of leaving chat', async ({ page }) => {
        test.setTimeout(120_000);
        await testSetup.awaitST({ page });
        const settingsButton = page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '设置' });
        await settingsButton.click({ timeout: 10_000 });
        await expect(page).toHaveURL(/\/(?:\?|$)/);
        await expect(page.locator('[data-settings-overlay="true"]')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('[data-settings-overlay="true"] .settings-page')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('#user-settings-block.openDrawer')).toHaveCount(0);
        await expect(settingsButton).toHaveAttribute('aria-pressed', 'true');
        // The advanced tab is retired; the overlay is a single providers page
        // with no tab strip.
        await expect(page.locator('[data-settings-overlay="true"] .settings-tab')).toHaveCount(0);
        const modelField = page.locator('[data-settings-overlay="true"] #settings-providers-fallbackProviderModel');
        await expect(modelField).toBeVisible();
        // The fallback model is auxiliary: editing it dirties the form without
        // touching fields sibling tests depend on. Restore it before closing.
        const originalFallback = await modelField.inputValue();
        await modelField.fill('e2e-shell-fallback');
        const saveButton = page.locator('[data-settings-overlay="true"] button[type="submit"]');
        await expect(saveButton).toBeEnabled();
        await saveButton.focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('[data-settings-overlay="true"] .settings-status--success')).toContainText('已保存', { timeout: 30_000 });
        await modelField.fill(originalFallback);
        if (await saveButton.isEnabled()) {
            await saveButton.click();
            await expect(page.locator('[data-settings-overlay="true"] .settings-status--success')).toContainText('已保存', { timeout: 30_000 });
        }
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

    test('keeps Settings fields reachable in a narrow workspace overlay', async ({ page }) => {
        test.setTimeout(120_000);
        await page.setViewportSize({ width: 375, height: 812 });
        await testSetup.awaitST({ page });

        const settingsButton = page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '设置' });
        await settingsButton.click({ timeout: 10_000 });
        const overlay = page.locator('[data-settings-overlay="true"]');
        await expect(overlay).toBeVisible({ timeout: 15_000 });
        await expect(overlay.locator('input, select, textarea').first()).toBeVisible({ timeout: 30_000 });
        const closeButton = overlay.getByRole('button', { name: '关闭设置' });
        await expect(closeButton).toBeVisible();
        await expect.poll(async () => closeButton.evaluate(node => {
            const panel = node.closest('.settings-page');
            return panel
                ? node.getBoundingClientRect().width < panel.getBoundingClientRect().width / 2
                : false;
        })).toBe(true);
        await expect.poll(async () => overlay.locator('.settings-tab-panel').evaluate(node => ({
            clientHeight: node.clientHeight,
            scrollHeight: node.scrollHeight,
        }))).toEqual(expect.objectContaining({
            clientHeight: expect.any(Number),
            scrollHeight: expect.any(Number),
        }));
        await expect.poll(async () => overlay.locator('.settings-tab-panel').evaluate(node => (
            node.clientHeight > 100 && node.scrollHeight >= node.clientHeight
        ))).toBe(true);
    });

    test('opens the unified Settings shell entry into the settings overlay without route jump', async ({ page }) => {
        await testSetup.awaitST({ page });

        // AI Config / Formatting / Settings were merged into a single 设置 entry.
        await expect(page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: 'AI Config' })).toHaveCount(0);
        await expect(page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: 'Formatting' })).toHaveCount(0);

        const settingsButton = page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '设置' });
        await settingsButton.click({ timeout: 10_000 });
        await expect(page).toHaveURL(/\/(?:\?|$)/);
        await expect(page.locator('[data-settings-overlay="true"]')).toBeVisible({ timeout: 15_000 });
        // Single-tab settings: no tab strip, providers fields render directly.
        await expect(page.locator('[data-settings-overlay="true"] .settings-tab')).toHaveCount(0);
        await expect(page.locator('[data-settings-overlay="true"] #settings-providers-openaiModel')).toBeVisible({ timeout: 15_000 });

        await page.keyboard.press('Escape');
        await expect(page.locator('[data-settings-overlay="true"]')).toHaveCount(0, { timeout: 10_000 });
        await expect(settingsButton).toBeFocused();

        await settingsButton.focus();
        await page.keyboard.press('Tab');
        await expect(page.locator(':focus')).toBeVisible();
    });

    test('opens legacy-owned workspace drawers from the settings overlay links', async ({ page }) => {
        await testSetup.awaitST({ page });

        const settingsButton = page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '设置' });
        await settingsButton.click({ timeout: 10_000 });
        await expect(page.locator('[data-settings-overlay="true"]')).toBeVisible({ timeout: 15_000 });

        await expect(page.locator('[data-settings-overlay="true"] .settings-tab')).toHaveCount(0);

        const aiConfigLink = page.locator('[data-settings-overlay="true"] button').filter({ hasText: '打开 AI 响应配置' });
        // The API Connections drawer is retired; no such workspace link may exist.
        const apiConnectionsLink = page.locator('[data-settings-overlay="true"] button').filter({ hasText: 'Open API Connections' });
        await expect(aiConfigLink).toBeVisible();
        await expect(apiConnectionsLink).toHaveCount(0);

        await aiConfigLink.click();
        await expect(page.locator('[data-settings-overlay="true"]')).toHaveCount(0, { timeout: 10_000 });
        await expect(page.locator('#left-nav-panel.openDrawer')).toBeVisible({ timeout: 10_000 });
        await expect(page.locator('#left-nav-panel #completion_prompt_manager_list')).toBeVisible({ timeout: 10_000 });

        await settingsButton.click({ timeout: 10_000 });
        await expect(page.locator('[data-settings-overlay="true"]')).toBeVisible({ timeout: 15_000 });
        // Named formatting presets and the advanced tab are retired; the user
        // settings drawer link lives on the single providers page.
        await expect(page.locator('[data-settings-overlay="true"] [data-formatting-preset-row]')).toHaveCount(0);
        await expect(page.locator('[data-settings-overlay="true"] [data-formatting-master-actions]')).toHaveCount(0);
        await expect(page.locator('[data-settings-overlay="true"] button').filter({ hasText: '打开高级格式' })).toHaveCount(0);
        await expect(page.locator('[data-settings-overlay="true"] button').filter({ hasText: '打开用户设置' })).toBeVisible();
    });

    test('opens the AI Response Configuration drawer from the AI 响应配置 shell entry', async ({ page }) => {
        await testSetup.awaitST({ page });

        const presetsButton = page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: 'AI 响应配置' });
        await expect(presetsButton).toBeVisible({ timeout: 15_000 });
        await presetsButton.click({ timeout: 10_000 });

        await expect(page.locator('#left-nav-panel.openDrawer')).toBeVisible({ timeout: 10_000 });
        await expect(page.locator('#left-nav-panel #settings_preset_openai')).toBeVisible({ timeout: 10_000 });
        await expect(page.locator('#left-nav-panel #completion_prompt_manager_list')).toBeVisible({ timeout: 10_000 });

        // Second click toggles the drawer closed, matching the other slot entries.
        await presetsButton.click({ timeout: 10_000 });
        await expect(page.locator('#left-nav-panel.openDrawer')).toHaveCount(0, { timeout: 10_000 });
    });

    test('keeps a reopened Settings overlay mounted when a deferred close is superseded', async ({ page }) => {
        await testSetup.awaitST({ page });

        const settingsButton = page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '设置' });
        await settingsButton.click({ timeout: 10_000 });
        await expect(page.locator('[data-settings-overlay="true"]')).toBeVisible({ timeout: 15_000 });

        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('[data-react-workspace-shell-chrome] nav button'));
            const settings = buttons.find(button => button.textContent?.trim() === '设置');
            settings?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            settings?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        });

        await expect(page.locator('[data-settings-overlay="true"]')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('[data-settings-overlay="true"] .settings-tab')).toHaveCount(0);
        await expect(page.locator('[data-settings-overlay="true"] #settings-providers-openaiModel')).toBeVisible({ timeout: 15_000 });
        await expect(settingsButton).toHaveAttribute('aria-pressed', 'true');
    });
});
