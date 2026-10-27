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

// Wide-desktop first runs seed both side drawers open+locked; tests that
// exercise the open→close toggle contract must unpin and close them first so
// the shell starts from a deterministic state.
// accountStorage changes flush to the server through saveSettingsDebounced's
// trailing debounce — the local key can read correct while the server copy is
// still stale. Poll the persisted settings until the write lands before
// asserting across a reload.
async function waitForPersistedAccountStorage(page, key, expected) {
    const csrfToken = await page.evaluate(async () => {
        const response = await fetch('/csrf-token');
        const data = await response.json().catch(() => ({}));
        return data?.token ?? data?.data?.token ?? null;
    });
    await expect.poll(async () => {
        return page.evaluate(async ({ token, storageKey }) => {
            const response = await fetch('/api/settings/get', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'X-CSRF-Token': token } : {}),
                },
                body: '{}',
            });
            const data = await response.json();
            const settings = typeof data.settings === 'string' ? JSON.parse(data.settings) : data.settings;
            return settings?.accountStorage?.[storageKey] ?? null;
        }, { token: csrfToken, storageKey: key });
    }, { timeout: 15_000 }).toBe(expected);
}

async function resetSeededSideDrawers(page) {
    await page.evaluate(() => {
        for (const id of ['left-nav-panel', 'right-nav-panel']) {
            document.getElementById(id)?.classList.remove('pinnedOpen');
        }
    });
    for (const label of ['提示词', '角色库']) {
        const button = page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: label });
        if (await button.getAttribute('aria-pressed') === 'true') {
            await clickShellPanel(page, label);
            await expect(button).toHaveAttribute('aria-pressed', 'false', { timeout: 15_000 });
        }
    }
}

test.describe('workspace shell panel navigation', () => {
    test('primary registry entries expose unified pressed state without redundant status copy', async ({ page }) => {
        test.setTimeout(120_000);
        await testSetup.awaitST({ page });
        await resetSeededSideDrawers(page);

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
        await resetSeededSideDrawers(page);

        await clickShellPanel(page, '角色库');
        await expectActivePanel(page, '角色库');
        await expect(page.locator('#right-nav-panel')).toHaveClass(/openDrawer/);

        await clickShellPanel(page, '角色库');
        await expectNoActivePanel(page);
    });

    test('clicking outside a drawer persists the closed state across reload', async ({ page }) => {
        await testSetup.awaitST({ page });
        await resetSeededSideDrawers(page);

        await clickShellPanel(page, '正则');
        await expect(page.locator('#RegexPanel')).toHaveClass(/openDrawer/, { timeout: 15_000 });

        // Clicking elsewhere in the app autocloses the drawer; the close must
        // persist — a stale "opened" key used to resurrect it on every reload.
        await page.locator('#send_textarea').click();
        await expect(page.locator('#RegexPanel')).toHaveClass(/closedDrawer/, { timeout: 15_000 });
        await expect.poll(async () => page.evaluate(async () => {
            const { accountStorage } = await import('/scripts/util/AccountStorage.js');
            return accountStorage.getItem('RegexNavOpened');
        })).toBe('false');

        // accountStorage writes flush via a 1s trailing debounce; reloading
        // before the save lands would resurrect the last persisted state.
        await waitForPersistedAccountStorage(page, 'RegexNavOpened', 'false');
        await waitForPersistedAccountStorage(page, 'NavOpened', 'false');

        await page.reload();
        await testSetup.awaitST({ page });
        await expect(page.locator('#RegexPanel')).toHaveClass(/closedDrawer/, { timeout: 15_000 });
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

        // No pin toggles render anywhere; lock state is the .pinnedOpen class
        // on the drawer host (seeded by the init pass / persisted storage).
        await expect(page.locator('[data-workspace-shell-panel-pin]')).toHaveCount(0);
        await expect(page.locator('#rm_button_panel_pin, #lm_button_panel_pin, .wpc-pin-input')).toHaveCount(0);

        await page.evaluate(() => {
            document.getElementById('right-nav-panel')?.classList.add('pinnedOpen');
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

        // The regex drawer shares the top-center chrome (title row only — no
        // pin/close controls) and shows the feature controls directly — no
        // nested inline-drawer shell.
        await expect(page.locator('#RegexPanel .workspace-panel-chrome .wpc-header')).toHaveCount(1);
        await expect(page.locator('#RegexPanel .workspace-panel-chrome .wpc-pin-input, #RegexPanel .wpc-close')).toHaveCount(0);
        await expect(page.locator('#RegexPanel .regex_settings #open_regex_editor')).toBeVisible({ timeout: 10_000 });
    });
    test('opens Settings shell entry as an in-workspace drawer instead of leaving chat', async ({ page }) => {
        test.setTimeout(120_000);
        await testSetup.awaitST({ page });
        const settingsButton = page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '设置' });
        await settingsButton.click({ timeout: 10_000 });
        await expect(page).toHaveURL(/\/(?:\?|$)/);
        await expect(page.locator('#SettingsPanel.openDrawer')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('#SettingsPanel [data-settings-surface="drawer"]')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('#user-settings-block.openDrawer')).toHaveCount(0);
        await expect(settingsButton).toHaveAttribute('aria-pressed', 'true');
        // The advanced tab is retired; the drawer hosts a single providers page
        // with no tab strip.
        await expect(page.locator('#SettingsPanel .settings-tab')).toHaveCount(0);
        const modelField = page.locator('#SettingsPanel #settings-providers-fallbackProviderModel');
        await expect(modelField).toBeVisible();
        const maxTokens = page.locator('#SettingsPanel #settings-memory-maxTokens');
        await expect(maxTokens).toHaveValue('400');
        await expect(maxTokens).toHaveAttribute('step', '1');
        expect(await maxTokens.evaluate(input => input.validity.valid)).toBe(true);
        await expect(page.locator('#SettingsPanel form')).not.toHaveAttribute('novalidate', '');
        // The fallback model is auxiliary: editing it dirties the form without
        // touching fields sibling tests depend on. Restore it before closing.
        const originalFallback = await modelField.inputValue();
        const saveButton = page.locator('#SettingsPanel button[type="submit"]');
        const success = page.locator('#SettingsPanel .settings-status--success');
        const conflict = page.getByText(/本地草稿仍保留/);
        // Drawer state is persisted by the legacy settings writer, which can
        // advance the revision while this test edits the React form. Preserve
        // the conflict contract: reload and reapply the draft rather than
        // expecting a stale revision to save successfully.
        async function saveModel(value, requireSuccess = false) {
            for (let attempt = 0; attempt < 5; attempt++) {
                if (attempt > 0 && await modelField.inputValue() === value) {
                    const persisted = await page.evaluate(async () => {
                        const csrfResponse = await fetch('/csrf-token');
                        const csrf = await csrfResponse.json();
                        const response = await fetch('/api/settings/get', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf.token ?? csrf.data?.token },
                            body: '{}',
                        });
                        if (!response.ok) throw new Error('Could not verify saved settings');
                        const data = await response.json();
                        const settings = typeof data.settings === 'string' ? JSON.parse(data.settings) : data.settings;
                        return settings?.oai_settings?.fallback_provider_model ?? '';
                    });
                    expect(persisted).toBe(value);
                    expect(requireSuccess, 'The initial edit must produce a save success').toBe(false);
                    return;
                }
                await modelField.fill(value);
                await expect(saveButton).toBeEnabled();
                await saveButton.focus();
                await page.keyboard.press('Enter');
                await expect(success.or(conflict).first()).toBeVisible({ timeout: 30_000 });
                if (await success.isVisible()) {
                    await expect(success).toContainText('已保存');
                    return;
                }
                await page.getByRole('button', { name: '重新加载当前设置', exact: true }).click();
                await expect(conflict).toHaveCount(0);
            }
            throw new Error('Settings save repeatedly conflicted');
        }
        await saveModel(`e2e-shell-fallback-${Date.now()}`, true);
        await expect(maxTokens).toHaveValue('400');
        await saveModel(originalFallback);
        await page.keyboard.press('Escape');
        await expect(page.locator('#SettingsPanel')).toHaveClass(/closedDrawer/, { timeout: 15_000 });
        await expect(settingsButton).toHaveAttribute('aria-pressed', 'false', { timeout: 15_000 });

        await settingsButton.click({ timeout: 10_000 });
        await expect(page.locator('#SettingsPanel.openDrawer')).toBeVisible({ timeout: 15_000 });
        await settingsButton.click({ timeout: 10_000 });
        await expect(page.locator('#SettingsPanel')).toHaveClass(/closedDrawer/, { timeout: 15_000 });
        await expect(settingsButton).toHaveAttribute('aria-pressed', 'false');
        await expect(page.locator('#send_textarea')).toBeVisible();
    });

    test('keeps Settings fields reachable in a narrow workspace drawer', async ({ page }) => {
        test.setTimeout(120_000);
        await page.setViewportSize({ width: 375, height: 812 });
        await testSetup.awaitST({ page });

        const settingsButton = page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '设置' });
        await settingsButton.click({ timeout: 10_000 });
        const drawer = page.locator('#SettingsPanel.openDrawer');
        await expect(drawer).toBeVisible({ timeout: 15_000 });
        await expect(drawer.locator('input, select, textarea').first()).toBeVisible({ timeout: 30_000 });
        const titleRow = drawer.locator('.wpc-title');
        await expect(titleRow).toBeVisible();
        await expect.poll(async () => titleRow.evaluate(node => {
            const panel = node.closest('.drawer-content');
            return panel
                ? node.getBoundingClientRect().width < panel.getBoundingClientRect().width / 2
                : false;
        })).toBe(true);
        await expect.poll(async () => drawer.locator('.settings-tab-panel').evaluate(node => ({
            clientHeight: node.clientHeight,
            scrollHeight: node.scrollHeight,
        }))).toEqual(expect.objectContaining({
            clientHeight: expect.any(Number),
            scrollHeight: expect.any(Number),
        }));
        await expect.poll(async () => drawer.locator('.settings-tab-panel').evaluate(node => (
            node.clientHeight > 100 && node.scrollHeight >= node.clientHeight
        ))).toBe(true);
    });

    test('opens the unified Settings shell entry into the settings drawer without route jump', async ({ page }) => {
        await testSetup.awaitST({ page });

        // AI Config / Formatting / Settings were merged into a single 设置 entry.
        await expect(page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: 'AI Config' })).toHaveCount(0);
        await expect(page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: 'Formatting' })).toHaveCount(0);

        const settingsButton = page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '设置' });
        await settingsButton.click({ timeout: 10_000 });
        await expect(page).toHaveURL(/\/(?:\?|$)/);
        await expect(page.locator('#SettingsPanel.openDrawer')).toBeVisible({ timeout: 15_000 });
        // Single-tab settings: no tab strip, providers fields render directly.
        await expect(page.locator('#SettingsPanel .settings-tab')).toHaveCount(0);
        await expect(page.locator('#SettingsPanel #settings-providers-openaiModel')).toBeVisible({ timeout: 15_000 });

        await page.keyboard.press('Escape');
        await expect(page.locator('#SettingsPanel')).toHaveClass(/closedDrawer/, { timeout: 10_000 });

        await settingsButton.focus();
        await page.keyboard.press('Tab');
        await expect(page.locator(':focus')).toBeVisible();
    });

    test('hosts the merged message-rendering fields inside the settings drawer', async ({ page }) => {
        await testSetup.awaitST({ page });

        const settingsButton = page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '设置' });
        await settingsButton.click({ timeout: 10_000 });
        await expect(page.locator('#SettingsPanel.openDrawer')).toBeVisible({ timeout: 15_000 });

        await expect(page.locator('#SettingsPanel .settings-tab')).toHaveCount(0);

        // The user-settings drawer is gone entirely — no host, no link out.
        await expect(page.locator('#user-settings-block, #user-settings-button')).toHaveCount(0);
        const aiConfigLink = page.locator('#SettingsPanel button').filter({ hasText: '打开 AI 响应配置' });
        const apiConnectionsLink = page.locator('#SettingsPanel button').filter({ hasText: 'Open API Connections' });
        await expect(aiConfigLink).toHaveCount(0);
        await expect(apiConnectionsLink).toHaveCount(0);

        // The Frontend Frames fields render inline as React form fields.
        await expect(page.locator('#SettingsPanel')).toContainText('消息渲染设置');
        const framesToggle = page.locator('#settings-rendering-frontendFramesEnabled');
        await expect(framesToggle).toBeVisible();
        await expect(page.locator('#settings-rendering-frontendFramesDepth')).toBeVisible();
        await expect(page.locator('#settings-rendering-frontendFramesCollapseCodeBlock')).toBeVisible();
        // The render-while-streaming toggle is retired with the streaming
        // preview; the field must not linger as an inert option.
        await expect(page.locator('#settings-rendering-frontendFramesAllowStreaming')).toHaveCount(0);
        await expect(page.locator('#SettingsPanel')).not.toContainText('流式期间渲染');

        // The two code-block labels are translated, so a Chinese UI never falls
        // back to the English source text inside the merged fields.
        await expect(page.locator('#SettingsPanel')).toContainText('折叠普通代码块');
        await expect(page.locator('#settings-rendering-frontendFramesCollapseCodeBlock')).toContainText('普通代码块');

        // Toggling a merged field dirties the form through the normal save flow:
        // the save button enables and the dirty-close guard intercepts Escape —
        // auto-dismissed confirms refuse the close, so the drawer stays open.
        const saveButton = page.locator('#SettingsPanel button[type="submit"]');
        await expect(saveButton).toBeDisabled();
        await framesToggle.click();
        await expect(saveButton).toBeEnabled({ timeout: 10_000 });
        await page.keyboard.press('Escape');
        await expect(page.locator('#SettingsPanel.openDrawer')).toBeVisible();

        // Named formatting presets and the advanced tab are retired.
        await expect(page.locator('#SettingsPanel [data-formatting-preset-row]')).toHaveCount(0);
        await expect(page.locator('#SettingsPanel [data-formatting-master-actions]')).toHaveCount(0);
        await expect(page.locator('#SettingsPanel button').filter({ hasText: '打开高级格式' })).toHaveCount(0);
    });

    test('exposes no retired AI Response Configuration shell entry', async ({ page }) => {
        await testSetup.awaitST({ page });

        const presetsButton = page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: 'AI 响应配置' });
        await expect(presetsButton).toHaveCount(0);
        // #left-nav-panel survives as the live prompt-manager drawer host.
        await expect(page.locator('#left-nav-panel')).toHaveCount(1);
    });

    test('keeps a reopened Settings drawer mounted when a deferred close is superseded', async ({ page }) => {
        await testSetup.awaitST({ page });

        const settingsButton = page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '设置' });
        await settingsButton.click({ timeout: 10_000 });
        await expect(page.locator('#SettingsPanel.openDrawer')).toBeVisible({ timeout: 15_000 });

        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('[data-react-workspace-shell-chrome] nav button'));
            const settings = buttons.find(button => button.textContent?.trim() === '设置');
            settings?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            settings?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        });

        await expect(page.locator('#SettingsPanel.openDrawer')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('#SettingsPanel .settings-tab')).toHaveCount(0);
        await expect(page.locator('#SettingsPanel #settings-providers-openaiModel')).toBeVisible({ timeout: 15_000 });
        await expect(settingsButton).toHaveAttribute('aria-pressed', 'true');
    });
});
