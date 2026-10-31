import { expect, test } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';

async function readCard(page, avatar) {
    return page.evaluate(async avatarUrl => {
        const { token } = await fetch('/csrf-token').then(response => response.json());
        const response = await fetch('/api/characters/get', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
            body: JSON.stringify({ avatar_url: avatarUrl }),
        });
        if (!response.ok) throw new Error(`Character get failed: ${response.status}`);
        return response.json();
    }, avatar);
}

test('character authoring manages many tags in a scoped panel', async ({ page }) => {
    await testSetup.awaitST({ page });
    const id = crypto.randomUUID();
    const name = `Tag manager ${id}`;
    const tags = Array.from({ length: 24 }, (_, index) => `Tag ${String(index + 1).padStart(2, '0')}`);
    tags.push('Sister', 'Scenario');
    const card = {
        spec: 'chara_card_v2', spec_version: '2.0',
        data: {
            name, description: 'Tag manager fixture', personality: '', scenario: '',
            first_mes: 'Hello.', mes_example: '', creator_notes: '', system_prompt: '',
            post_history_instructions: '', alternate_greetings: [], tags,
            creator: 'Playwright', character_version: '1', extensions: {},
        },
    };

    await page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '角色库' }).click();
    await page.locator('#character_import_file').setInputFiles({
        name: 'tag-manager.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(card)),
    });
    await page.getByRole('button', { name: /全部导入|Import all/ }).click();
    await expect(page.locator('.toast-success')).toContainText(name);
    const avatar = await page.evaluate(characterName => {
        const character = window.SillyTavern.getContext().characters.find(item => item.name === characterName);
        if (!character) throw new Error(`Imported character missing: ${characterName}`);
        return character.avatar;
    }, name);

    await page.locator('.character_select').filter({ hasText: name }).first().click();
    const authoring = page.locator('[data-react-authoring-owner="characterAuthoring"]');
    await expect(authoring).toBeVisible();
    await authoring.getByRole('button', { name: /Manage tags|管理标签/ }).click();

    const dialog = page.getByRole('dialog', { name: /Tags|标签/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('26 tags', { exact: true })).toBeVisible();
    const desktopViewport = page.viewportSize();
    await page.setViewportSize({ width: 390, height: 844 });

    const addButton = dialog.getByRole('button', { name: /Add|添加/ });
    const removeSelectedButton = dialog.getByRole('button', { name: /Remove selected|删除所选/ });
    await expect(addButton).toHaveCSS('white-space', 'nowrap');
    await expect(removeSelectedButton).toHaveCSS('white-space', 'nowrap');
    await expect.poll(async () => dialog.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        return bounds.top >= 0 && bounds.bottom <= window.innerHeight;
    })).toBe(true);
    if (desktopViewport) await page.setViewportSize(desktopViewport);
    await dialog.getByRole('searchbox').fill('sist');
    await expect(dialog.getByText('Sister', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Scenario', { exact: true })).toHaveCount(0);
    await dialog.getByRole('searchbox').fill('');
    await dialog.getByRole('button', { name: /Remove tag Tag 01|移除标签 Tag 01/ }).click();

    await dialog.getByRole('checkbox', { name: 'Sister' }).check();
    await dialog.getByRole('checkbox', { name: 'Scenario' }).check();
    await dialog.getByRole('button', { name: /Remove selected|删除所选/ }).click();
    await dialog.getByRole('textbox', { name: /Add tag|添加标签/ }).fill('New tag');
    await dialog.getByRole('button', { name: /Add|添加/ }).click();

    await expect.poll(async () => (await readCard(page, avatar)).data?.tags).toEqual([
        ...tags.slice(1, 24), 'New tag',
    ]);
    await expect(authoring.getByRole('button', { name: /Manage tags|管理标签/ })).toContainText('24');
});
