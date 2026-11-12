import { expect, test } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';

test.setTimeout(90_000);

test('preset new uses a React-owned local dialog', async ({ page }) => {
    await page.route('**/api/backends/chat-completions/status', route => route.fulfill({ json: { data: [] } }));
    await testSetup.awaitST({ page });
    await page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '提示词' }).click();
    await page.locator('#new_oai_preset').click();
    await expect(page.locator('dialog[open]')).toBeVisible();
    await expect(page.locator('dialog[open][data-local-dialog]')).toBeVisible({ timeout: 3_000 });
});

test('bridge opens, confirms and cleans up a modal', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.locator('[data-react-workspace-shell-chrome] nav button').first().focus();
    const opener = page.locator('[data-react-workspace-shell-chrome] nav button').first();
    await page.evaluate(async () => {
        const { showLocalDialog } = await import('/scripts/local-dialogs.js');
        window.localDialogResult = showLocalDialog({ title: 'Example', fields: [{ type: 'text', name: 'name', label: 'Name', value: 'initial' }], actions: [{ id: 'ok', label: 'Confirm', variant: 'primary', required: ['name'] }, { id: 'cancel', label: 'Cancel' }], initialFocus: 'name' });
    });
    const dialog = page.locator('dialog[open][data-local-dialog]');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Name')).toBeFocused();
    await dialog.getByLabel('Name').fill('changed');
    await dialog.locator('[data-local-focus="ok"]').click();
    expect(await page.evaluate(() => window.localDialogResult)).toEqual({ action: 'ok', values: { name: 'changed' } });
    await expect(page.locator('[data-local-dialog-host]')).toHaveCount(0);
    await expect(opener).toBeFocused();
});

test('disclosure 10/11 boundary, plain text and keyboard focus', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.evaluate(async () => {
        const { showLocalDialog } = await import('/scripts/local-dialogs.js');
        const items = Array.from({ length: 11 }, (_, index) => `Conflict ${index + 1} <b>plain</b>`);
        window.openDisclosure = count => {
            window.disclosureState = 'pending';
            window.disclosureResult = showLocalDialog({ title: 'Conflicts', list: { items: items.slice(0, count), moreLabel: '<b>More</b>' }, actions: [{ id: 'ok', label: 'Confirm' }] }).then(result => { window.disclosureState = 'settled'; return result; });
        };
        window.openDisclosure(10);
    });
    const dialog = page.locator('dialog[open][data-local-dialog]');
    await expect(dialog.locator('li')).toHaveCount(10);
    await expect(dialog.locator('li').first()).toHaveText('Conflict 1 <b>plain</b>');
    await expect(dialog.locator('b')).toHaveCount(0);
    await expect(dialog.locator('details')).toHaveCount(0);
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => window.disclosureResult)).toBeNull();

    await page.evaluate(() => window.openDisclosure(11));
    const summary = dialog.locator('summary');
    const details = dialog.locator('details');
    const action = dialog.locator('[data-local-focus="ok"]');
    await expect(action).toBeFocused();
    await expect(summary).toHaveText('<b>More</b>');
    await expect(dialog.locator('li:visible')).toHaveCount(10);
    await page.keyboard.press('Tab');
    await expect(summary).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(action).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(summary).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(details).toHaveAttribute('open', '');
    await expect(dialog.locator('li:visible')).toHaveCount(11);
    expect(await dialog.locator('li').allTextContents()).toEqual(Array.from({ length: 11 }, (_, index) => `Conflict ${index + 1} <b>plain</b>`));
    await expect(dialog.locator('li').last()).toHaveText('Conflict 11 <b>plain</b>');
    expect(await page.evaluate(() => window.disclosureState)).toBe('pending');
    await page.keyboard.press('Space');
    await expect(details).not.toHaveAttribute('open', '');
    await expect(dialog.locator('li:visible')).toHaveCount(10);
    expect(await page.evaluate(() => window.disclosureState)).toBe('pending');
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => window.disclosureResult)).toBeNull();
    await expect(page.locator('[data-local-dialog-host]')).toHaveCount(0);
});

test('disclosure preserves field results and scope cancellation', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.evaluate(async () => {
        const { showLocalDialog } = await import('/scripts/local-dialogs.js');
        window.openWithField = () => showLocalDialog({ title: 'Fields', scope: 'world-info', list: { items: Array.from({ length: 11 }, (_, i) => String(i)), moreLabel: 'More' }, fields: [{ type: 'text', name: 'name', label: 'Name', value: 'original' }], closeAction: 'closed', actions: [{ id: 'ok', label: 'Confirm' }] });
        window.firstDisclosure = window.openWithField();
    });
    await expect(page.getByLabel('Name')).toBeFocused();
    await page.getByLabel('Name').fill('changed');
    await page.locator('dialog[data-local-dialog] [data-local-focus="ok"]').click();
    expect(await page.evaluate(() => window.firstDisclosure)).toEqual({ action: 'ok', values: { name: 'changed' } });
    await page.evaluate(() => { window.secondDisclosure = window.openWithField(); });
    await expect(page.getByLabel('Name')).toBeFocused();
    await page.evaluate(async () => (await import('/scripts/local-dialogs.js')).disposeLocalDialogs('world-info'));
    expect(await page.evaluate(() => window.secondDisclosure)).toBeNull();
    await expect(page.locator('[data-local-dialog-host]')).toHaveCount(0);
});

test('double click settles once and removes the dialog', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.evaluate(async () => {
        const { showLocalDialog } = await import('/scripts/local-dialogs.js');
        window.doubleResult = showLocalDialog({ title: 'Double', actions: [{ id: 'ok', label: 'OK' }] });
    });
    await page.locator('[data-local-dialog] [data-local-focus="ok"]').dblclick();
    expect(await page.evaluate(() => window.doubleResult)).toEqual({ action: 'ok', values: {} });
    await expect(page.locator('[data-local-dialog-host]')).toHaveCount(0);
});

test('a new dialog accepts a quick independent click at the same position', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.evaluate(async () => {
        const { showLocalDialog } = await import('/scripts/local-dialogs.js');
        window.both = (async () => {
            const first = await showLocalDialog({ title: 'First', actions: [{ id: 'ok', label: 'OK' }] });
            const second = await showLocalDialog({ title: 'Second', actions: [{ id: 'ok', label: 'OK' }] });
            return [first, second];
        })();
    });
    await page.locator('[data-local-dialog] [data-local-focus="ok"]').click();
    await expect(page.locator('dialog[data-local-dialog] h2')).toHaveText('Second');
    await page.locator('[data-local-dialog] [data-local-focus="ok"]').click();
    await expect(page.locator('dialog[data-local-dialog]')).toHaveCount(0, { timeout: 3000 });
    expect(await page.evaluate(() => window.both)).toEqual([{ action: 'ok', values: {} }, { action: 'ok', values: {} }]);
});

test('a double click cannot confirm the next dialog', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.evaluate(async () => {
        const { showLocalDialog } = await import('/scripts/local-dialogs.js');
        window.both = (async () => {
            await showLocalDialog({ title: 'First', actions: [{ id: 'ok', label: 'OK' }] });
            return showLocalDialog({ title: 'Second', actions: [{ id: 'ok', label: 'OK' }] });
        })();
    });
    await page.locator('[data-local-dialog] [data-local-focus="ok"]').dblclick({ delay: 120 });
    await expect(page.locator('dialog[data-local-dialog] h2')).toHaveText('Second');
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => window.both)).toBeNull();
});

test('double click does not activate the control behind a dismissed dialog', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.evaluate(async () => {
        const { showLocalDialog } = await import('/scripts/local-dialogs.js');
        const behind = document.createElement('button');
        behind.textContent = 'Behind';
        behind.dataset.dialogBehind = '';
        Object.assign(behind.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', zIndex: '999999' });
        behind.addEventListener('click', event => { (window.behindClicks ??= []).push(event.detail); });
        document.body.append(behind);
        behind.focus();
        window.doubleResult = showLocalDialog({ title: 'Confirm', actions: [{ id: 'ok', label: 'OK' }] });
    });
    await page.locator('[data-local-dialog] [data-local-focus="ok"]').dblclick({ delay: 120 });
    expect(await page.evaluate(() => window.doubleResult)).toEqual({ action: 'ok', values: {} });
    expect(await page.evaluate(() => window.behindClicks ?? [])).toEqual([]);
    await expect(page.locator('[data-dialog-behind]')).toBeFocused();
});

test('nested dialogs trap keyboard focus, escape closes only the top and restores focus', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.evaluate(async () => {
        const { showLocalDialog } = await import('/scripts/local-dialogs.js');
        window.first = showLocalDialog({ title: 'Outer', actions: [{ id: 'outer', label: 'Outer action' }] });
    });
    const outer = page.locator('dialog[data-local-dialog]').first();
    await expect(outer).toBeVisible();
    await outer.locator('[data-local-focus="outer"]').focus();
    await page.evaluate(async () => {
        const { showLocalDialog } = await import('/scripts/local-dialogs.js');
        window.second = showLocalDialog({ title: 'Inner', fields: [{ type: 'text', name: 'value', label: 'Value' }], actions: [{ id: 'inner', label: 'Inner action' }], initialFocus: 'value', closeAction: 'closed' });
    });
    const inner = page.locator('dialog[data-local-dialog]').last();
    await expect(inner.getByLabel('Value')).toBeFocused();
    for (const key of ['Tab', 'Tab', 'Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab']) {
        await page.keyboard.press(key);
        expect(await inner.evaluate(element => element.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => window.second)).toEqual({ action: 'closed', values: { value: '' } });
    await expect(page.locator('dialog[open][data-local-dialog]')).toHaveCount(1);
    await expect(outer.locator('[data-local-focus="outer"]')).toBeFocused();
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => window.first)).toBeNull();
    await expect(page.locator('[data-local-dialog-host]')).toHaveCount(0);
});

test('Enter confirms multiple text fields with the visible default select value', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.evaluate(async () => {
        const { showLocalDialog } = await import('/scripts/local-dialogs.js');
        window.enterResult = showLocalDialog({ title: 'Enter', initialFocus: 'first', fields: [
            { type: 'text', name: 'first', label: 'First', value: 'one' },
            { type: 'text', name: 'second', label: 'Second', value: 'two' },
            { type: 'select', name: 'select', label: 'Select', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] },
        ], actions: [{ id: 'save', label: 'Save', required: ['select'] }] });
    });
    await expect(page.locator('[data-local-focus="select"]')).toHaveValue('a');
    await expect(page.locator('[data-local-focus="save"]')).toBeEnabled();
    await page.locator('[data-local-focus="first"]').press('Enter');
    await expect(page.locator('[data-local-dialog-host]')).toHaveCount(0);
    expect(await page.evaluate(() => window.enterResult)).toEqual({ action: 'save', values: { first: 'one', second: 'two', select: 'a' } });
});

test('fields, required constraints, scope disposal and abort settle correctly', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.evaluate(async () => {
        const { showLocalDialog } = await import('/scripts/local-dialogs.js');
        window.dialogs = [showLocalDialog({ title: 'Fields', scope: 'world-info', initialFocus: 'choice', fields: [
            { type: 'select', name: 'choice', label: 'Choice', value: 'a', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] },
            { type: 'radio', name: 'radio', label: 'Radio', options: [{ value: 'x', label: 'X' }, { value: 'y', label: 'Y' }] },
            { type: 'checkbox', name: 'check', label: 'Check' },
        ], actions: [{ id: 'ok', label: 'Save', required: ['radio', 'check'] }] }),
        showLocalDialog({ title: 'Presets', scope: 'presets', closeAction: 'closed', actions: [{ id: 'ok', label: 'OK' }] })];
    });
    await expect(page.locator('dialog[open][data-local-dialog]')).toHaveCount(2);
    await page.evaluate(async () => (await import('/scripts/local-dialogs.js')).disposeLocalDialogs('presets'));
    expect(await page.evaluate(() => window.dialogs[1])).toBeNull();
    const dialog = page.locator('dialog[open][data-local-dialog]');
    await expect(dialog.locator('[data-local-focus="ok"]')).toBeDisabled();
    await dialog.getByLabel('Choice').selectOption('b');
    await dialog.getByLabel('Y').check();
    await dialog.getByLabel('Check').check();
    await dialog.locator('[data-local-focus="ok"]').click();
    expect(await page.evaluate(() => window.dialogs[0])).toEqual({ action: 'ok', values: { choice: 'b', radio: 'y', check: true } });
    expect(await page.evaluate(async () => {
        const { showLocalDialog } = await import('/scripts/local-dialogs.js');
        const controller = new AbortController(); controller.abort();
        return showLocalDialog({ title: 'Aborted', actions: [], signal: controller.signal, closeAction: 'closed' });
    })).toBeNull();
    await expect(page.locator('[data-local-dialog-host]')).toHaveCount(0);
});

test('real panel unmounts cancel only their scoped requests', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '提示词' }).click();
    if (!await page.locator('[data-world-info-react-workflow="workbench"]').isVisible()) {
        await page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '世界书' }).click();
    }
    await expect(page.locator('[data-world-info-react-workflow="workbench"]')).toBeVisible();
    await page.evaluate(async () => {
        const { showLocalDialog } = await import('/scripts/local-dialogs.js');
        window.world = showLocalDialog({ title: 'World', scope: 'world-info', closeAction: 'closed', actions: [] });
        window.preset = showLocalDialog({ title: 'Preset', scope: 'presets', closeAction: 'closed', actions: [] });
    });
    await expect(page.locator('dialog[open][data-local-dialog]')).toHaveCount(2);
    await page.evaluate(async () => {
        const { loadWorkspacePanelsModule } = await import('/scripts/workspace-panels-react-bridge.js');
        const { showLocalDialog } = await import('/scripts/local-dialogs.js');
        (await loadWorkspacePanelsModule()).unmountWorkspacePanel('worldInfo');
        window.nextWorld = showLocalDialog({ title: 'New world panel', scope: 'world-info', actions: [{ id: 'done', label: 'Done' }] });
    });
    expect(await page.evaluate(() => window.world)).toBeNull();
    await expect(page.locator('dialog[open][data-local-dialog]')).toHaveCount(2);
    await page.locator('dialog[open][data-local-dialog]').last().locator('[data-local-focus="done"]').click();
    expect((await page.evaluate(() => window.nextWorld)).action).toBe('done');
    await page.evaluate(async () => {
        const { loadWorkspacePanelsModule } = await import('/scripts/workspace-panels-react-bridge.js');
        (await loadWorkspacePanelsModule()).unmountChatMemoryPanel(document.querySelector('#emberdesk-react-prompt-panel-host'));
    });
    expect(await page.evaluate(() => window.preset)).toBeNull();
    await expect(page.locator('[data-local-dialog-host]')).toHaveCount(0);
});

test('mounted abort and pagehide cancel once without closeAction', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.evaluate(async () => {
        const { showLocalDialog } = await import('/scripts/local-dialogs.js');
        window.controller = new AbortController();
        window.one = showLocalDialog({ title: 'One', signal: window.controller.signal, closeAction: 'closed', actions: [] });
        window.two = showLocalDialog({ title: 'Two', closeAction: 'closed', actions: [] });
    });
    await expect(page.locator('dialog[open][data-local-dialog]')).toHaveCount(2);
    await page.evaluate(() => window.controller.abort());
    expect(await page.evaluate(() => window.one)).toBeNull();
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
    expect(await page.evaluate(() => window.two)).toBeNull();
    await expect(page.locator('[data-local-dialog-host]')).toHaveCount(0);
});

test('narrow long plain text stays within viewport', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 500 });
    await testSetup.awaitST({ page });
    await page.evaluate(async () => {
        const { showLocalDialog } = await import('/scripts/local-dialogs.js');
        window.result = showLocalDialog({ title: '<b>Title</b>', message: 'LongUnbroken'.repeat(200), actions: [{ id: 'done', label: 'Done' }] });
    });
    const dialog = page.locator('dialog[open][data-local-dialog]');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('b')).toHaveCount(0);
    expect(await dialog.evaluate(element => ({ width: element.getBoundingClientRect().width, scroll: element.scrollWidth, client: element.clientWidth }))).toEqual(expect.objectContaining({ width: expect.any(Number) }));
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth && element.getBoundingClientRect().right <= innerWidth)).toBe(true);
    await page.screenshot({ path: '../.tmp/f6-local-popups_20261112/units/U001/evidence/narrow.png' });
    await dialog.locator('[data-local-focus="done"]').click();
    expect((await page.evaluate(() => window.result)).action).toBe('done');
});

test('showModal failure rejects without a leaked host', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.evaluate(async () => {
        const { showLocalDialog } = await import('/scripts/local-dialogs.js');
        const original = HTMLDialogElement.prototype.showModal;
        HTMLDialogElement.prototype.showModal = function () { throw new Error('showModal failed'); };
        window.outcome = 'pending';
        showLocalDialog({ title: 'Fail mount', actions: [] }).then(() => { window.outcome = 'resolved'; }, () => { window.outcome = 'rejected'; }).finally(() => { HTMLDialogElement.prototype.showModal = original; });
    });
    await expect.poll(() => page.evaluate(() => window.outcome), { timeout: 5_000 }).toBe('rejected');
    await expect(page.locator('[data-local-dialog-host]')).toHaveCount(0);
});

test('bundle loading failure rejects and abort while loading resolves null', async ({ page }) => {
    await page.goto('/robots.txt');
    let release;
    await page.route('**/react/login/assets/workspace-panels.js?*', async route => {
        await new Promise(resolve => { release = resolve; });
        await route.abort();
    });
    await page.evaluate(async () => {
        const { showLocalDialog } = await import('/scripts/local-dialogs.js');
        window.controller = new AbortController();
        window.aborted = showLocalDialog({ title: 'Pending', actions: [], signal: window.controller.signal });
        window.failed = showLocalDialog({ title: 'Fail', actions: [] }).then(() => 'resolved', error => error instanceof Error ? 'rejected' : 'unexpected');
    });
    await expect.poll(() => Boolean(release)).toBe(true);
    await page.evaluate(() => window.controller.abort());
    expect(await page.evaluate(() => window.aborted)).toBeNull();
    release();
    expect(await page.evaluate(() => window.failed)).toBe('rejected');
    await expect(page.locator('[data-local-dialog-host]')).toHaveCount(0);
});
