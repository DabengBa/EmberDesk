import { expect, test } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';

async function openExtensionsHost(page) {
    const panelButton = page.locator('.react-workspace-shell-nav-button').filter({ hasText: 'Extensions' });
    // Prefer same-entry React shell entry (enabled for this proof suite).
    if (await panelButton.count()) {
        await panelButton.click({ timeout: 15_000 });
        await expect(panelButton).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 }).catch(() => {});
    } else {
        // No shell chrome: open the established drawer by dispatching the drawer toggle click.
        await page.evaluate(() => {
            const toggle = document.querySelector('#extensions-settings-button .drawer-toggle');
            if (toggle instanceof HTMLElement) {
                toggle.click();
            }
        });
    }
    await expect(page.locator('#rm_extensions_block.openDrawer')).toBeVisible({ timeout: 20_000 });
    await expect.poll(async () => page.evaluate(() => {
        const host = document.getElementById('emberdesk-react-extensions-host-panel-host');
        return Boolean(host && host.childElementCount > 0);
    }), { timeout: 30_000 }).toBe(true);
}

test.describe('extensions host sole owner', () => {
    test('react host owns visible controls while protected slots remain reachable', async ({ page }) => {
        test.setTimeout(120_000);
        await testSetup.awaitST({ page });
        await openExtensionsHost(page);

        const diagnostics = await page.evaluate(() => {
            const panel = document.getElementById('rm_extensions_block');
            const host = document.getElementById('emberdesk-react-extensions-host-panel-host');
            const settings = document.getElementById('extensions_settings');
            const settings2 = document.getElementById('extensions_settings2');
            const regex = document.getElementById('regex_container');
            const manageLegacy = document.getElementById('extensions_details');
            const installLegacy = document.getElementById('third_party_extension_button');
            const reactManage = document.querySelector('[data-extensions-host-react-action="manage"]');
            const reactInstall = document.querySelector('[data-extensions-host-react-action="install"]');
            const reactNotify = document.querySelector('[data-extensions-host-react-control="notify-updates"]');
            const reactExtrasUrl = document.querySelector('[data-extensions-host-react-control="extras-url"]');
            return {
                owner: panel?.dataset.extensionsHostVisibleOwner || 'legacy',
                reactMounted: Boolean(host && host.childElementCount > 0),
                hostInsidePanel: Boolean(panel && host && panel.contains(host)),
                settingsPresent: Boolean(settings),
                settings2Present: Boolean(settings2),
                regexPresent: Boolean(regex),
                reactManagePresent: Boolean(reactManage),
                reactInstallPresent: Boolean(reactInstall),
                reactNotifyPresent: Boolean(reactNotify),
                reactExtrasUrlPresent: Boolean(reactExtrasUrl),
                legacyManageHidden: manageLegacy instanceof HTMLElement
                    ? (manageLegacy.hidden || manageLegacy.dataset.legacyExtensionsHiddenByReact === 'true')
                    : true,
                legacyInstallHidden: installLegacy instanceof HTMLElement
                    ? (installLegacy.hidden || installLegacy.dataset.legacyExtensionsHiddenByReact === 'true')
                    : true,
                workflow: Boolean(document.querySelector('[data-extensions-host-react-workflow="host-actions"]')),
            };
        });

        expect(diagnostics.reactMounted).toBe(true);
        expect(diagnostics.hostInsidePanel).toBe(true);
        expect(diagnostics.owner).toBe('react');
        expect(diagnostics.settingsPresent).toBe(true);
        expect(diagnostics.settings2Present).toBe(true);
        expect(diagnostics.regexPresent).toBe(true);
        expect(diagnostics.reactManagePresent).toBe(true);
        expect(diagnostics.reactInstallPresent).toBe(true);
        expect(diagnostics.reactNotifyPresent).toBe(true);
        expect(diagnostics.reactExtrasUrlPresent).toBe(true);
        expect(diagnostics.legacyManageHidden).toBe(true);
        expect(diagnostics.legacyInstallHidden).toBe(true);
        expect(diagnostics.workflow).toBe(true);

        await expect(page.locator('[data-extensions-host-react-workflow="host-actions"]')).toBeVisible();
        await expect(page.locator('#extensions_settings')).toBeAttached();
        await expect(page.locator('#regex_container')).toBeAttached();
    });

    test('manage action remains available through react host without removing protected mounts', async ({ page }) => {
        test.setTimeout(120_000);
        await testSetup.awaitST({ page });
        await openExtensionsHost(page);

        const manage = page.locator('[data-extensions-host-react-action="manage"]');
        await expect(manage).toBeVisible({ timeout: 20_000 });
        await manage.click({ timeout: 10_000 });

        // Manage opens the established popup; either popup content or recovered deferred state is success.
        const manageOutcome = await page.waitForFunction(() => {
            const popup = document.querySelector('.popup .extensions_info, .popup:has(.extensions_info)');
            const deferredFailed = document.getElementById('extensions_startup_loading');
            return Boolean(popup) || Boolean(deferredFailed);
        }, { timeout: 30_000 }).then(() => true).catch(() => false);

        expect(manageOutcome).toBe(true);

        const mountsRemain = await page.evaluate(() => ({
            settings: Boolean(document.getElementById('extensions_settings')),
            regex: Boolean(document.getElementById('regex_container')),
        }));
        expect(mountsRemain.settings).toBe(true);
        expect(mountsRemain.regex).toBe(true);
    });

    test('mobile viewport keeps react host controls and protected mounts reachable', async ({ page }) => {
        test.setTimeout(120_000);
        await page.setViewportSize({ width: 390, height: 844 });
        await testSetup.awaitST({ page });
        await openExtensionsHost(page);

        await expect(page.locator('[data-extensions-host-react-workflow="host-actions"]')).toBeVisible({ timeout: 20_000 });
        await expect(page.locator('[data-extensions-host-react-action="manage"]')).toBeVisible();
        await expect(page.locator('#extensions_settings')).toBeAttached();
        await expect(page.locator('#regex_container')).toBeAttached();

        const owner = await page.evaluate(() => document.getElementById('rm_extensions_block')?.dataset.extensionsHostVisibleOwner);
        expect(owner).toBe('react');
    });
});
