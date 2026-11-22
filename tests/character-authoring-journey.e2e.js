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

test('saves a character edit from the debounced compatibility path', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '角色库' }).click();
    await page.locator('#rm_print_characters_block .character_select').filter({ hasText: 'Dev Character 002' }).first().click();
    await expect(page.locator('[data-react-authoring-owner="characterAuthoring"]')).toBeVisible();

    const saved = page.waitForResponse(response => new URL(response.url()).pathname === '/api/characters/edit', { timeout: 8000 });
    await page.evaluate(() => document.getElementById('favorite_button').click());
    expect((await saved).ok()).toBe(true);
});

test('bulk deletion waits for an in-flight character save', async ({ page }) => {
    let release;
    let intercepted;
    const held = new Promise(resolve => { intercepted = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    let deleteSent = false;
    await page.route('**/api/characters/edit', async route => {
        intercepted();
        await gate;
        await route.continue();
    });
    page.on('request', request => {
        if (request.url().endsWith('/api/characters/delete')) deleteSent = true;
    });
    try {
        await testSetup.awaitST({ page });
        // Delete a disposable copy, not the seed used by other specs in this lane.
        const duplicateAvatar = await page.evaluate(async () => {
            const original = window.SillyTavern.getContext().characters.find(character => character.name === 'Dev Character 002');
            if (!original) throw new Error('Seed character for bulk-delete fixture is missing');
            const { token } = await fetch('/csrf-token').then(response => response.json());
            const response = await fetch('/api/characters/duplicate', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
                body: JSON.stringify({ avatar_url: original.avatar }),
            });
            if (!response.ok) throw new Error(`Duplicate fixture failed: ${response.status}`);
            const result = await response.json();
            if (!result.path) throw new Error('Duplicate fixture did not return an avatar');
            return result.path;
        });
        await expect.poll(() => page.evaluate(avatar => window.SillyTavern.getContext().characters.some(character => character.avatar === avatar), duplicateAvatar), { timeout: 15_000 }).toBe(true);
        const library = page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '角色库' });
        await library.click();
        const row = page.locator('#rm_print_characters_block .character_select').filter({ has: page.locator('.avatar').filter({ has: page.locator(`img[src*="${duplicateAvatar}"]`) }) });
        await row.click();
        await page.locator('[data-react-authoring-owner="characterAuthoring"] [data-react-authoring-field="description"] textarea').fill('Pending save');
        await held;
        await library.click();
        await page.getByRole('button', { name: /批量编辑角色|Bulk edit characters/ }).click();
        await row.click();
        await page.getByRole('button', { name: /批量删除角色|Bulk delete characters/ }).click();
        await page.locator('dialog[open] .popup-button-ok').click();
        await new Promise(resolve => setTimeout(resolve, 1500));
        expect(deleteSent).toBe(false);
        release();
        await expect(row).toHaveCount(0);
        await expect(page.locator('#toast-container').locator('.toast-error')).toHaveCount(0);
        expect(deleteSent).toBe(true);
        await expect.poll(() => page.evaluate(() => window.SillyTavern.getContext().characters.some(character => character.name === 'Dev Character 002'))).toBe(true);
    } finally {
        release();
    }
});

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
    // The server's import toast precedes asynchronous library publication.
    await expect.poll(() => page.evaluate(characterName => window.SillyTavern.getContext().characters.some(item => item.name === characterName), name), { timeout: 15_000 }).toBe(true);
    const avatar = await page.evaluate(characterName => {
        const character = window.SillyTavern.getContext().characters.find(item => item.name === characterName);
        if (!character) throw new Error(`Imported character missing: ${characterName}`);
        return character.avatar;
    }, name);
    await page.locator('.character_select').filter({ hasText: name }).first().click();
    const authoring = page.locator('[data-react-authoring-owner="characterAuthoring"]');
    await expect(authoring).toBeVisible();
    const worldSelectControl = authoring.locator('[data-react-authoring-field="characterWorld"]').getByRole('combobox', { name: /绑定的世界书文件|Bound World Info file/ });
    await worldSelectControl.selectOption(book);
    await expect.poll(async () => (await readCard(page, avatar)).data?.extensions?.world).toBe(book);
    await expect(worldSelectControl).toHaveValue(book);

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
    await expect.soft(worldSelectControl).toHaveValue(book);
    await authoring.locator('[data-react-authoring-action="openBoundWorldInfo"]').click({ timeout: 5_000 });

    const worldSelect = page.locator('[data-world-info-react-control="world-select"]');
    await expect(worldSelect).toBeVisible();
    await expect(worldSelect).toHaveValue(book);
    await expect(page.locator('[data-world-info-react-entry]').filter({ hasText: 'Dev World 01 entry 1' })).toBeVisible();
});
