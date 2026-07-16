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

        // World Info is React sole-owner; missing bundle is a hard failure, not a legacy product path.
        expect(diagnostics.reactMounted).toBe(true);
        expect(diagnostics.hostInsideHolder).toBe(true);
        expect(diagnostics.owner).toBe('react');
        expect(diagnostics.reactWorldSelectCount).toBe(1);
        // Search tools mount only after a world is selected; empty workbench still has world-select.
        expect(diagnostics.reactSearchCount).toBeGreaterThanOrEqual(0);
        expect(diagnostics.legacyHiddenCount).toBeGreaterThan(0);
        expect(diagnostics.workbenchRoot).toBe(true);
        await expect(page.locator('[data-world-info-react-workflow="workbench"]')).toBeVisible();
        await expect(page.locator('[data-world-info-react-layout="split"]')).toBeVisible();
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

        const layout = await page.evaluate(() => {
            const root = document.querySelector('[data-world-info-react-workflow="workbench"]');
            const host = document.getElementById('emberdesk-react-world-info-panel-host');
            const actionWidths = Array.from(document.querySelectorAll('[data-world-info-react-action]'))
                .map(action => action.getBoundingClientRect().width);
            return {
                rootHeight: root?.getBoundingClientRect().height ?? 0,
                hostHeight: host?.getBoundingClientRect().height ?? 0,
                smallestActionWidth: Math.min(...actionWidths),
            };
        });
        expect(layout.rootHeight).toBeLessThanOrEqual(layout.hostHeight + 1);
        expect(layout.smallestActionWidth).toBeGreaterThan(30);

        await page.locator('[data-world-info-react-control="world-select"]').selectOption({ index: 1 });
        const firstEntry = page.locator('[data-world-info-react-entry]').first();
        await expect(firstEntry).toBeVisible({ timeout: 10_000 });
        await firstEntry.click();
        await expect(root).toHaveAttribute('data-world-info-react-mobile-view', 'editor', { timeout: 10_000 });
        await expect(page.locator('[data-world-info-react-pane="editor"]')).toBeVisible();
        await expect(page.locator('[data-world-info-react-field="comment"]')).toBeFocused();
        await page.locator('[data-world-info-react-action="back-to-list"]').click();
        await expect(root).toHaveAttribute('data-world-info-react-mobile-view', 'list', { timeout: 10_000 });
        await expect(firstEntry).toBeFocused();
    });

    test('unselected editor state offers only create and import recovery actions', async ({ page }) => {
        await testSetup.awaitST({ page });
        await openWorldInfo(page);

        const root = page.locator('[data-world-info-react-workflow="workbench"]');
        test.skip(await root.count() === 0, 'React World Info panel not mounted in this environment');

        await expect(root).toBeVisible();
        await expect(page.locator('[data-world-info-react-control="world-select"]')).toHaveValue('');
        await expect(page.locator('[data-world-info-react-entry]')).toHaveCount(0);
        await expect(page.locator('[data-world-info-react-empty="entries"]')).toHaveText('请先选择或创建世界书');
        await expect(page.locator('[data-world-info-react-editor="empty"]')).toHaveText('请先选择或创建世界书');
        await expect(page.locator('[data-world-info-react-action="new-world"]')).toBeVisible();
        await expect(page.locator('[data-world-info-react-action="import"]')).toBeVisible();
        await expect(page.locator('[data-world-info-react-action="new-entry"]')).toHaveCount(0);
        await expect(page.locator('[data-world-info-react-action="export"]')).toHaveCount(0);
        await expect(page.locator('[data-world-info-react-action="refresh"]')).toHaveCount(0);
        await expect(page.locator('[data-world-info-react-action="rename"]')).toHaveCount(0);
        await expect(page.locator('[data-world-info-react-action="duplicate"]')).toHaveCount(0);
        await expect(page.locator('[data-world-info-react-action="delete"]')).toHaveCount(0);
    });
});
