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

test('character authoring keeps management usable without extension notice or greeting preview', async ({ page }) => {
    await testSetup.awaitST({ page });
    const id = crypto.randomUUID();
    const name = `Authoring ${id}`;
    const book = 'Dev World 01';
    const greeting = 'A distinct alternate greeting for the authoring journey.';
    const card = {
        spec: 'chara_card_v2', spec_version: '2.0',
        data: {
            name, description: 'Isolated authoring fixture', personality: '', scenario: '',
            first_mes: 'Hello.', mes_example: '', creator_notes: '', system_prompt: '',
            post_history_instructions: '', alternate_greetings: [greeting], tags: [],
            creator: 'Playwright', character_version: '1',
            extensions: { fixture_extension: { retained: true } },
        },
    };

    await page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '角色库' }).click();
    await page.setInputFiles('#character_import_file', {
        name: 'authoring.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(card)),
    });
    await expect(page.locator('.toast-success')).toContainText(name);
    const avatar = await page.evaluate(characterName => {
        const character = window.SillyTavern.getContext().characters.find(item => item.name === characterName);
        if (!character) throw new Error(`Imported character missing: ${characterName}`);
        return character.avatar;
    }, name);
    await page.locator('.character_select').filter({ hasText: name }).first().click();
    const authoring = page.locator('[data-react-authoring-owner="characterAuthoring"]');
    await expect(authoring).toBeVisible();
    await authoring.locator('[data-react-authoring-field="characterWorld"] select').selectOption(book);
    await expect.poll(async () => (await readCard(page, avatar)).data?.extensions?.world).toBe(book);
    await expect(authoring.locator('[data-react-authoring-field="characterWorld"] select')).toHaveValue(book);

    // Soft assertions keep the rest of this journey observable on the old UI.
    await expect.soft(authoring.getByText(/保存时会保留扩展数据|Extension data preserved on save/)).toHaveCount(0);
    const greetings = authoring.locator('[data-react-authoring-field="alternateGreetings"]');
    await expect.soft(greetings.getByText(greeting, { exact: true })).toHaveCount(0);
    await greetings.getByRole('button', { name: /管理开场白|Manage greetings/ }).click();
    const greetingDialog = page.locator('dialog[open]').filter({ has: page.locator('.alternate_greetings_list') });
    await expect(greetingDialog.locator('.alternate_greeting_text')).toHaveValue(greeting);
    const updated = `${greeting} Updated.`;
    await greetingDialog.locator('.alternate_greeting_text').fill(updated);
    await greetingDialog.locator('.popup-button-ok').click();
    await expect(greetingDialog).toBeHidden();
    await greetings.getByRole('button', { name: /管理开场白|Manage greetings/ }).click();
    await expect(greetingDialog.locator('.alternate_greeting_text')).toHaveValue(updated);
    await greetingDialog.locator('.popup-button-cancel').click();
    await expect.soft.poll(async () => {
        const data = (await readCard(page, avatar)).data;
        return { world: data?.extensions?.world, greetings: data?.alternate_greetings, extension: data?.extensions?.fixture_extension };
    }).toEqual({ world: book, greetings: [updated], extension: { retained: true } });
    await expect.soft(authoring.locator('[data-react-authoring-field="characterWorld"] select')).toHaveValue(book);
    await authoring.locator('[data-react-authoring-action="openBoundWorldInfo"]').click({ timeout: 5_000 });

    const worldSelect = page.locator('[data-world-info-react-control="world-select"]');
    await expect(worldSelect).toBeVisible();
    await expect(worldSelect).toHaveValue(book);
    await expect(page.locator('[data-world-info-react-entry]').filter({ hasText: 'Dev World 01 entry 1' })).toBeVisible();
});
