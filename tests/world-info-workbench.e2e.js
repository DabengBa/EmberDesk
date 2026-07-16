import { expect, test } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';

async function openWorldInfo(page) {
    const panelButton = page.locator('.react-workspace-shell-nav-button').filter({ hasText: 'World Info' });
    if (await panelButton.count()) {
        await panelButton.click({ timeout: 10_000 });
    } else {
        await page.locator('#WIDrawerIcon').click({ timeout: 10_000 });
    }
    await expect(page.locator('#WorldInfo.openDrawer')).toBeVisible({ timeout: 15_000 });
}

test.describe('world info workbench', () => {
    test('react host owns workbench containment without duplicate visible selectors when mounted', async ({ page }) => {
        await testSetup.awaitST({ page });
        await openWorldInfo(page);

        const diagnostics = await page.evaluate(() => {
            const holder = document.getElementById('wi-holder');
            const editor = document.getElementById('wiEditorPanel');
            const host = document.getElementById('emberdesk-react-world-info-panel-host');
            const owner = holder?.dataset.worldInfoVisibleOwner || 'legacy';
            const hostInsideHolder = Boolean(holder && host && holder.contains(host));
            const editorInsideHolder = Boolean(holder && editor && holder.contains(editor));
            const reactWorldSelect = document.querySelectorAll('[data-world-info-react-control="world-select"]');
            const reactSearch = document.querySelectorAll('[data-world-info-react-control="search"]');
            const legacyHidden = Array.from(holder?.children || []).filter((child) => (
                child instanceof HTMLElement
                && child.id !== 'emberdesk-react-world-info-panel-host'
                && child.dataset.legacyWorldInfoHiddenByReact === 'true'
            )).length;
            return {
                owner,
                hostInsideHolder,
                editorInsideHolder,
                reactMounted: Boolean(host && host.childElementCount > 0),
                reactWorldSelectCount: reactWorldSelect.length,
                reactSearchCount: reactSearch.length,
                legacyHiddenCount: legacyHidden,
                workbenchRoot: Boolean(document.querySelector('[data-world-info-react-workflow="workbench"]')),
            };
        });

        expect(diagnostics.editorInsideHolder).toBe(true);

        if (diagnostics.reactMounted) {
            expect(diagnostics.hostInsideHolder).toBe(true);
            expect(diagnostics.owner).toBe('react');
            expect(diagnostics.reactWorldSelectCount).toBe(1);
            expect(diagnostics.reactSearchCount).toBe(1);
            expect(diagnostics.legacyHiddenCount).toBeGreaterThan(0);
            expect(diagnostics.workbenchRoot).toBe(true);
            await expect(page.locator('[data-world-info-react-workflow="workbench"]')).toBeVisible();
            await expect(page.locator('[data-world-info-react-layout="split"]')).toBeVisible();
        } else {
            // Fail-closed path: legacy remains usable sole owner.
            expect(diagnostics.owner).toBe('legacy');
            await expect(page.locator('#world_editor_select, #world_popup')).toBeVisible();
        }
    });

    test('mobile list/editor states expose a single active pane', async ({ page }) => {
        await testSetup.awaitST({ page });
        await page.setViewportSize({ width: 390, height: 844 });
        await openWorldInfo(page);

        const reactReady = await page.locator('[data-world-info-react-workflow="workbench"]').count();
        test.skip(reactReady === 0, 'React World Info panel not mounted in this environment');

        const root = page.locator('[data-world-info-react-workflow="workbench"]');
        await expect(root).toHaveAttribute('data-world-info-react-mobile-view', 'list');
        await expect(page.locator('[data-world-info-react-pane="list"]')).toBeVisible();

        const firstEntry = page.locator('[data-world-info-react-entry]').first();
        if (await firstEntry.count()) {
            await firstEntry.click();
            await expect(root).toHaveAttribute('data-world-info-react-mobile-view', 'editor', { timeout: 10_000 });
            await expect(page.locator('[data-world-info-react-pane="editor"]')).toBeVisible();
            await page.locator('[data-world-info-react-action="back-to-list"]').click();
            await expect(root).toHaveAttribute('data-world-info-react-mobile-view', 'list', { timeout: 10_000 });
        }
    });
});
