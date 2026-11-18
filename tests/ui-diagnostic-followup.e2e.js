import { test, expect } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';
import { openWorkspacePanelFixture } from './helpers/workspace-panel-fixture.js';

test('bulk message checkbox selects a deletion range with Space', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.evaluate(async () => {
        const context = window.SillyTavern.getContext();
        context.chatCompletionSettings.chat_memory_enabled = false;
        await context.selectCharacterById(context.characters.findIndex(character => character.name === 'Dev Character 001'));
        await context.openCharacterChat('Dev Character 001 Session 01');
    });
    await page.getByRole('button', { name: /Chat options|聊天选项/ }).click();
    await page.getByRole('button', { name: '删除消息' }).click();
    const checkbox = page.locator('#chat .mes .del_checkbox').first();
    await expect(checkbox).toBeVisible();
    await expect(checkbox).toHaveAttribute('aria-label', /Select message|选择消息/);
    await checkbox.focus();
    await checkbox.press('Space');
    await expect(checkbox).toBeChecked();
    // Selecting the same boundary again retains the range, just as a mouse
    // click does. Select a later boundary to shrink it instead.
    await checkbox.press('Space');
    await expect(checkbox).toBeChecked();
    const last = page.locator('#chat .mes .del_checkbox').last();
    await expect(page.locator('#chat .mes .del_checkbox').count()).resolves.toBeGreaterThan(1);
    await last.focus();
    await last.press('Space');
    await expect(last).toBeChecked();
    await expect(checkbox).not.toBeChecked();
});

test('tool editor controller uses latest draft and is cleared on unmount', async ({ page }) => {
    await openWorkspacePanelFixture(page);
    await page.evaluate(async () => {
        const workspace = await (await import('/scripts/workspace-panels-react-bridge.js')).loadWorkspacePanelsModule();
        window.editorWorkspace = workspace;
        window.editorController = { submit: () => null };
        const host = document.createElement('div');
        host.id = 'host';
        workspace.mountToolBindingEditor(host, { existing: null, bindings: [], controller: window.editorController });
        if (!host.querySelector('#tb_name')) throw new Error('Detached mount must be synchronous');
        document.body.append(host);
    });
    await page.locator('#tb_name').fill('first_name');
    await expect.poll(() => page.evaluate(() => window.editorController.submit()?.name)).toBe('first_name');
    await page.locator('#tb_name').fill('latest_name');
    await expect.poll(() => page.evaluate(() => window.editorController.submit()?.name)).toBe('latest_name');
    await page.evaluate(() => window.editorWorkspace.unmountSmallPanel(document.getElementById('host')));
    expect(await page.evaluate(() => window.editorController.submit())).toBeNull();
});

test('tool editor releases its controller when the connected host is removed', async ({ page }) => {
    await openWorkspacePanelFixture(page, '<div id="host"><span id="native-child"></span></div>');
    await page.evaluate(async () => {
        const workspace = await (await import('/scripts/workspace-panels-react-bridge.js')).loadWorkspacePanelsModule();
        window.editorController = { submit: () => null };
        window.editorHost = document.getElementById('host');
        workspace.mountToolBindingEditor(window.editorHost, { existing: null, bindings: [], controller: window.editorController });
    });
    await page.locator('#tb_name').fill('owned_draft');
    await expect.poll(() => page.evaluate(() => window.editorController.submit()?.name)).toBe('owned_draft');
    await page.locator('#host').evaluate(host => host.remove());
    await expect.poll(() => page.evaluate(() => ({
        draft: window.editorController.submit(),
        reactChild: Boolean(window.editorHost.querySelector('#tb_name')),
        nativeChild: Boolean(window.editorHost.querySelector('#native-child')),
    }))).toEqual({ draft: null, reactChild: false, nativeChild: true });
});
