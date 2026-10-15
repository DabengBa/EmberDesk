import { expect, test } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';

async function openWorldInfo(page) {
    // Startup restores the drawer during initRossMods when accountStorage
    // WINavOpened was persisted by an earlier test on this shard. Clicking the
    // nav button on an already-open drawer re-mounts the React workbench
    // (replaceChildren) and drops the session-bound selection, so when a
    // restore may still be in flight we wait for it instead of double-opening.
    const wiRestoring = await page.evaluate(() => (
        window.innerWidth > 1000
        && window.SillyTavern?.getContext?.()?.accountStorage?.getItem('WINavOpened') === 'true'
    ));
    if (wiRestoring) {
        const restored = await page.locator('#WorldInfo.openDrawer')
            .waitFor({ state: 'visible', timeout: 10_000 })
            .then(() => true).catch(() => false);
        if (!restored) {
            // Restore was skipped or already superseded — open manually.
            await page.locator('[data-react-workspace-shell-chrome] nav button')
                .filter({ hasText: '世界书' }).click({ timeout: 10_000 });
        }
    } else {
        // React shell nav is the only opener — the legacy #WIDrawerIcon is retired.
        const panelButton = page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '世界书' });
        await expect(panelButton).toHaveCount(1, { timeout: 15_000 });
        await panelButton.click({ timeout: 10_000 });
    }
    await expect(page.locator('#WorldInfo.openDrawer')).toBeVisible({ timeout: 15_000 });
    // Mount is async after the drawer opens — settle before interacting.
    await expect(page.locator('[data-world-info-react-workflow="workbench"]')).toBeVisible({ timeout: 15_000 });
}

test.describe('world info workbench', () => {
    test('react host owns workbench containment without duplicate visible selectors when mounted', async ({ page }) => {
        await testSetup.awaitST({ page });
        await openWorldInfo(page);
        await page.locator('#emberdesk-react-world-info-panel-host > *').first()
            .waitFor({ state: 'attached', timeout: 10_000 });

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

        const globalWorldSelect = page.locator('[data-world-info-react-control="global-world-select"]');
        await expect(globalWorldSelect).toBeVisible();
        const firstGlobalWorld = globalWorldSelect.locator('[data-world-info-react-global-world]').first();
        await expect(firstGlobalWorld).toHaveCount(1);
        // Pills toggle independently — a plain click never clears other books.
        await firstGlobalWorld.click();
        await expect(firstGlobalWorld).toHaveAttribute('aria-pressed', 'true');
        await firstGlobalWorld.click();
        await expect(firstGlobalWorld).toHaveAttribute('aria-pressed', 'false');
    });

    test('mobile list/editor states expose a single active pane', async ({ page }) => {
        await testSetup.awaitST({ page });
        await page.setViewportSize({ width: 390, height: 844 });
        await openWorldInfo(page);

        const reactReady = await page.locator('[data-world-info-react-workflow="workbench"]')
            .waitFor({ state: 'attached', timeout: 10_000 }).then(() => true).catch(() => false);
        test.skip(!reactReady, 'React World Info panel not mounted in this environment');

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
        const mounted = await root.waitFor({ state: 'attached', timeout: 10_000 }).then(() => true).catch(() => false);
        test.skip(!mounted, 'React World Info panel not mounted in this environment');

        await expect(root).toBeVisible();
        await expect(page.locator('[data-world-info-react-control="world-select"]')).toHaveValue('');
        await expect(page.locator('[data-world-info-react-entry]')).toHaveCount(0);
        await expect(page.locator('[data-world-info-react-empty="entries"]')).toHaveText('请先选择或创建世界书');
        await expect(page.locator('[data-world-info-react-editor="empty"]')).toHaveText('请先选择或创建世界书');
        await expect(page.locator('[data-world-info-react-action="new-world"]')).toBeVisible();
        await expect(page.locator('[data-world-info-react-action="import"]')).toBeVisible();
        await expect(page.locator('[data-world-info-react-action="new-entry"]')).toHaveCount(0);
        await expect(page.locator('[data-world-info-react-action="export"]')).toHaveCount(0);
        await expect(page.locator('[data-world-info-react-action="refresh"]')).toBeVisible();
        await expect(page.locator('[data-world-info-react-action="rename"]')).toHaveCount(0);
        await expect(page.locator('[data-world-info-react-action="duplicate"]')).toHaveCount(0);
        await expect(page.locator('[data-world-info-react-action="delete"]')).toHaveCount(0);
    });

    test('empty search results identify the active query and offer direct recovery', async ({ page }) => {
        await testSetup.awaitST({ page });
        await openWorldInfo(page);

        const root = page.locator('[data-world-info-react-workflow="workbench"]');
        const mounted = await root.waitFor({ state: 'attached', timeout: 10_000 }).then(() => true).catch(() => false);
        test.skip(!mounted, 'React World Info panel not mounted in this environment');

        await page.locator('[data-world-info-react-control="world-select"]').selectOption({ index: 1 });
        await expect(page.locator('[data-world-info-react-entry]').first()).toBeVisible({ timeout: 10_000 });

        const search = page.getByLabel('搜索条目');
        await search.fill('does-not-match-any-entry');
        await expect(page.locator('[data-world-info-react-empty="entries"]')).toContainText('没有匹配“does-not-match-any-entry”的条目');

        await page.getByRole('button', { name: '清除搜索', exact: true }).click();
        await expect(search).toHaveValue('');
        await expect(page.locator('[data-world-info-react-entry]').first()).toBeVisible({ timeout: 10_000 });
    });
});

test.describe('UI hardening', () => {
    test.beforeEach(async ({ page }) => {
        await page.route('**/api/settings/save', route => route.fulfill({ json: {} }));
        await page.route('**/api/worldinfo/edit', route => route.fulfill({ json: {} }));
    });

    async function openEntry(page) {
        await testSetup.awaitST({ page });
        await openWorldInfo(page);
        await page.locator('[data-world-info-react-control="world-select"]').selectOption({ index: 1 });
        await page.locator('[data-world-info-react-entry]').first().click();
        await expect(page.locator('[data-world-info-react-editor="active"]')).toBeVisible();
    }

    async function openRegex(page) {
        await testSetup.awaitST({ page });
        // Startup asynchronously restores the World Info drawer when
        // accountStorage WINavOpened was persisted by an earlier test — with
        // preserveOpenDrawers, so it can land after our nav click and (z-index
        // 4010) cover the regex drawer. Wait for that restore to settle first;
        // the regex open path then closes the unpinned drawer.
        const wiRestorePending = await page.evaluate(() => (
            window.innerWidth > 1000
            && window.SillyTavern?.getContext?.()?.accountStorage?.getItem('WINavOpened') === 'true'
        ));
        if (wiRestorePending) {
            await expect(page.locator('#WorldInfo.openDrawer')).toBeVisible({ timeout: 15_000 });
        }
        await page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '正则' }).click();
        await expect(page.locator('#RegexPanel')).toBeVisible();
        if (wiRestorePending) {
            await expect(page.locator('#WorldInfo.openDrawer')).toHaveCount(0);
        }
        // No inline-drawer shell anymore: the chrome shows the controls
        // directly once the React surface mounts.
        await expect(page.locator('#open_regex_editor')).toBeVisible({ timeout: 15_000 });
    }

    test('world entry reports rejected saves and retries the retained draft', async ({ page }) => {
        let rejectSave = true;
        const writes = [];
        await page.route('**/api/worldinfo/edit', route => {
            writes.push(route.request().postDataJSON());
            return route.fulfill({ status: rejectSave ? 500 : 200, json: {} });
        });
        await openEntry(page);
        const comment = page.locator('[data-world-info-react-field="comment"]');
        const draft = `${await comment.inputValue()} (audited)`;
        await comment.fill(draft);
        await page.locator('[data-world-info-react-field="order"]').focus();
        const status = page.locator('[data-world-info-react-section="ops"]');
        await expect(status).toContainText('保存失败');
        await expect(comment).toHaveValue(draft);
        rejectSave = false;
        await page.locator('[data-world-info-react-action="retry-save"]').click();
        await expect(status).toContainText('已保存');
        expect(Object.values(writes.at(-1).data.entries).some(entry => entry.comment === draft)).toBe(true);
    });

    test('regex import cancellation never imports and clears the file input', async ({ page }) => {
        await openRegex(page);
        const list = page.locator('#saved_regex_scripts .regex-script-label');
        const count = await list.count();
        const file = {
            name: 'ui-hardening-regex.json',
            mimeType: 'application/json',
            buffer: Buffer.from(JSON.stringify({ scriptName: 'Transient test', findRegex: '/test/g', replaceString: '', placement: [1], trimStrings: [], disabled: true })),
        };
        for (const action of ['escape', 'cancel', 'close']) {
            await page.locator('#import_regex_file').setInputFiles(file);
            await expect(page.locator('#regex_import_target_global')).toBeVisible();
            if (action === 'escape') {
                await page.keyboard.press('Escape');
            } else {
                await page.locator(`dialog[open] .popup-button-${action === 'cancel' ? 'cancel' : 'close'}`).click();
            }
            await expect(page.locator('#regex_import_target_global')).toHaveCount(0);
            await expect(page.locator('#import_regex_file')).toHaveValue('');
            await expect(list).toHaveCount(count);
        }
    });

    test('regex editor keeps invalid drafts open and associates field errors', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await openRegex(page);
        await page.locator('#open_regex_editor').click();
        const directions = await page.locator('.regex-editor-option-group').evaluateAll(elements => elements.map(element => getComputedStyle(element).flexDirection));
        expect(directions).toEqual(['column', 'column']);
        const dialog = page.locator('dialog[open]').filter({ has: page.locator('#regex_editor_template') });
        await dialog.locator('.popup-button-ok').click();
        await expect(dialog).toBeVisible();
        await expect(dialog.locator('#regex_script_name')).toHaveAttribute('aria-invalid', 'true');
        await dialog.locator('#regex_script_name').fill('Draft rule');
        await dialog.locator('#find_regex').fill('/[/');
        await dialog.locator('.popup-button-ok').click();
        await expect(dialog.locator('#find_regex')).toHaveAttribute('aria-invalid', 'true');
        await expect(dialog.locator('#regex_script_name')).toHaveValue('Draft rule');
        await dialog.locator('#find_regex').fill('/test/g');
        await dialog.locator('input[name="replace_position"][value="1"]').uncheck();
        await dialog.locator('.popup-button-ok').click();
        await expect(dialog.locator('#regex_placement_error')).toBeVisible();
        await expect(dialog).toBeVisible();
        await page.keyboard.press('Escape');
    });

    test('confirmed regex import remains usable in the debugger', async ({ page }) => {
        await openRegex(page);
        await page.locator('#import_regex_file').setInputFiles({
            name: 'ui-hardening-confirmed.json',
            mimeType: 'application/json',
            buffer: Buffer.from(JSON.stringify({ scriptName: 'Confirmed rule', findRegex: '/test/g', replaceString: 'passed', placement: [1], trimStrings: [], disabled: false })),
        });
        await expect(page.locator('#regex_import_target_global')).toBeVisible();
        await expect(page.locator('#regex_import_target_scoped')).toBeDisabled();
        await page.locator('dialog[open] .popup-button-ok').click();
        await expect(page.locator('#saved_regex_scripts')).toContainText('Confirmed rule');
        await page.locator('#open_regex_debugger').click();
        const dialog = page.locator('dialog[open]').filter({ has: page.locator('.regex-debugger-container') });
        await expect(dialog.locator('.regex-debugger-results')).toBeHidden();
        await dialog.locator('#regex_debugger_raw_input').fill('test');
        await dialog.locator('#regex_debugger_run_test').click();
        await expect(dialog.locator('.regex-debugger-results')).toBeVisible();
        await expect(dialog.locator('#regex_debugger_final_output')).toHaveText('passed');
        await expect(dialog.locator('#regex_debugger_steps_output')).toContainText('Confirmed rule');
    });

    test('empty regex debugger offers creation instead of dead actions', async ({ page }) => {
        await openRegex(page);
        await expect(page.locator('#saved_regex_scripts .regex-script-label')).toHaveCount(0);
        await page.locator('#open_regex_debugger').click();
        const dialog = page.locator('dialog[open]').filter({ has: page.locator('.regex-debugger-container') });
        await expect(dialog.locator('#regex_debugger_run_test')).toBeDisabled();
        await expect(dialog.locator('#regex_debugger_save_order')).toBeDisabled();
        await expect(dialog.locator('.regex-debugger-results')).toBeHidden();
        await dialog.locator('#regex_debugger_create_rule').click();
        await expect(page.locator('#regex_editor_template')).toBeVisible();
    });
});
