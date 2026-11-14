import { expect, test } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';

test('prompt edited in the drawer is saved to the preset and survives reload', async ({ page }) => {
    test.setTimeout(120_000);
    await page.route('**/api/backends/chat-completions/status', route => route.fulfill({ json: { data: [] } }));
    await testSetup.awaitST({ page });
    await page.evaluate(async () => {
        const context = window.SillyTavern.getContext();
        await context.selectCharacterById(context.characters.findIndex(character => character.name === 'Dev Character 001'));
    });

    async function openPromptDrawer() {
        if (!await page.locator('#settings_preset_openai').isVisible()) {
            await page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '提示词' }).click();
        }
        await expect(page.locator('#settings_preset_openai')).toBeVisible();
    }
    async function readStored() {
        return page.evaluate(async () => {
            const { getRequestHeaders } = await import('/scripts/request-context.js');
            const response = await fetch('/api/settings/get', { method: 'POST', headers: getRequestHeaders(), body: '{}' });
            if (!response.ok) throw new Error(`settings read failed: ${response.status}`);
            const data = await response.json();
            return { settings: JSON.parse(data.settings), names: data.openai_setting_names, presets: data.openai_settings };
        });
    }

    await openPromptDrawer();
    const presetName = 'Browser Prompt Persistence';
    await page.locator('#new_oai_preset').click();
    const dialog = page.locator('dialog[open][data-local-dialog]');
    await dialog.locator('[data-local-focus="name"]').fill(presetName);
    await dialog.locator('[data-local-focus="save"]').click();
    await expect(page.locator('#settings_preset_openai')).toHaveValue(presetName);

    await page.locator('#ai-config-prompt-title .prompt-panel-add-btn').last().click({ timeout: 15_000 });
    const editor = page.locator('#completion_prompt_manager .prompt-panel-item-expanded');
    await expect(editor).toHaveCount(1);
    await expect(editor.locator('.prompt-panel-field input[type="text"]').first()).toBeVisible();
    const identifier = await editor.getAttribute('data-prompt-identifier');
    expect(identifier).toBeTruthy();
    const name = 'Browser persistence prompt';
    const content = 'Persisted UI prompt: {{user}} and a second line.\nReload proof.';
    await editor.locator('.prompt-panel-field input[type="text"]').first().fill(name);
    await editor.locator('textarea.prompt-panel-content').fill(content);
    await expect(editor.locator('.prompt-panel-item-name-text')).toHaveText(name);

    await expect.poll(async () => {
        const { settings } = await readStored();
        return settings.oai_settings.prompts.find(prompt => prompt.identifier === identifier)?.content;
    }, { timeout: 20_000 }).toBe(content);
    const save = page.waitForResponse(response => response.url().includes('/api/presets/save') && response.request().method() === 'POST');
    await page.locator('#update_oai_preset').click();
    expect((await save).ok()).toBe(true);
    await expect.poll(async () => {
        const { names, presets } = await readStored();
        const index = names.indexOf(presetName);
        return index < 0 ? null : JSON.parse(presets[index]).prompts.find(prompt => prompt.identifier === identifier);
    }, { timeout: 20_000 }).toMatchObject({ identifier, name, content });

    await page.reload();
    await testSetup.awaitST({ page });
    await openPromptDrawer();
    await expect(page.locator('#settings_preset_openai')).toHaveValue(presetName);
    const row = page.locator('#completion_prompt_manager .prompt-panel-item').filter({ has: page.locator('.prompt-panel-item-name-text', { hasText: name }) });
    await expect(row).toHaveAttribute('data-prompt-identifier', identifier);
    if (!await row.locator('textarea.prompt-panel-content').isVisible()) {
        await row.locator('.prompt-panel-item-name').click();
    }
    await expect(row.locator('textarea.prompt-panel-content')).toHaveValue(content);
    await expect(row.locator('.prompt-panel-field input[type="text"]').first()).toHaveValue(name);
});
