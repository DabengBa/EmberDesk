import { expect, test } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';

test('new regex-transformed greeting retains its authored identity without guessing legacy chats', async ({ page }) => {
    await testSetup.awaitST({ page });
    const name = `Greeting identity ${crypto.randomUUID()}`;
    const main = 'IDENTITY_MAIN';
    const alternate = 'IDENTITY_ALTERNATE';
    const card = { spec: 'chara_card_v2', spec_version: '2.0', data: {
        name, description: '', personality: '', scenario: '', first_mes: main, mes_example: '',
        creator_notes: '', system_prompt: '', post_history_instructions: '', alternate_greetings: ['', alternate],
        tags: [], creator: 'Playwright', character_version: '1', extensions: {},
    } };
    await page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '角色库' }).click();
    await page.setInputFiles('#character_import_file', { name: 'identity.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(card)) });
    await expect(page.locator('.toast-success')).toContainText(name);
    await page.waitForFunction(characterName => window.SillyTavern.getContext().characters.some(character => character.name === characterName), name);
    const avatar = await page.evaluate(async characterName => {
        const context = window.SillyTavern.getContext();
        context.featureSettings.regex = [{ id: 'identity-regex', scriptName: 'identity', findRegex: 'IDENTITY_MAIN', replaceString: 'TRANSFORMED_MAIN', trimStrings: [], placement: [2], disabled: false, markdownOnly: false, promptOnly: false, runOnEdit: false, substituteRegex: 0, minDepth: null, maxDepth: null }];
        const id = context.characters.findIndex(character => character.name === characterName);
        await context.selectCharacterById(id);
        return context.characters[id].avatar;
    }, name);
    const legacy = `${name} legacy`;
    await testSetup.saveCharacterChat({ page, characterName: name, avatarUrl: avatar, fileName: legacy, chat: [
        { user_name: 'User', character_name: name, chat_metadata: {} },
        { name, is_user: false, is_system: false, send_date: '2026-01-01', mes: 'TRANSFORMED_MAIN' },
    ] });
    await page.evaluate(fileName => window.SillyTavern.getContext().openCharacterChat(fileName), legacy);
    const picker = page.getByTestId('main-chat-greeting-picker');
    await expect(picker).toContainText('— / 2');

    await page.evaluate(async () => (await import('/script.js')).doNewChat());
    const dialog = page.getByRole('dialog', { name: /选择开场白|Choose a greeting/ });
    await expect(dialog).toBeVisible();
    await expect(page.locator('#chat')).toContainText('TRANSFORMED_MAIN');
    await expect(picker).toContainText('1 / 2');
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.SillyTavern.getContext().reloadCurrentChat());
    await expect(picker).toContainText('1 / 2');
    await picker.getByRole('button', { name: /下一个开场白|Next greeting/ }).click();
    await expect(picker).toContainText('2 / 2');
    await expect(page.locator('#chat')).toContainText(alternate);
    expect(await page.evaluate(() => window.SillyTavern.getContext().chatMetadata.greeting.index)).toBe(2);
});
