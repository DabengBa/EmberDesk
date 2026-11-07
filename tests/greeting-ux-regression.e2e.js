import { expect, test } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';

async function setupGreeting(page) {
    await page.setViewportSize({ width: 390, height: 844 });
    await testSetup.awaitST({ page });
    const name = `Greeting UX ${crypto.randomUUID()}`;
    const card = { spec: 'chara_card_v2', spec_version: '2.0', data: {
        name, description: '', personality: '', scenario: '', first_mes: 'First greeting', mes_example: '',
        creator_notes: '', system_prompt: '', post_history_instructions: '', alternate_greetings: ['Second greeting'],
        tags: [], creator: 'Playwright', character_version: '1', extensions: {},
    } };
    await page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '角色库' }).click();
    await page.setInputFiles('#character_import_file', { name: 'greeting-ux.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(card)) });
    await expect(page.locator('.toast-success')).toContainText(name);
    await page.waitForFunction(characterName => window.SillyTavern.getContext().characters.some(character => character.name === characterName), name);
    const avatar = await page.evaluate(async characterName => {
        const context = window.SillyTavern.getContext();
        const id = context.characters.findIndex(character => character.name === characterName);
        const avatarUrl = context.characters[id].avatar;
        await context.selectCharacterById(id);
        return avatarUrl;
    }, name);
    const chatName = `${name} session`;
    await testSetup.saveCharacterChat({ page, characterName: name, avatarUrl: avatar, fileName: chatName, chat: [
        { user_name: 'User', character_name: name, chat_metadata: {} },
        { name, is_user: false, is_system: false, send_date: '2026-01-01', mes: 'First greeting' },
    ] });
    await page.evaluate(async fileName => {
        await window.SillyTavern.getContext().openCharacterChat(fileName);
        const { closeWorkspaceChildSlotHost } = await import('/script.js');
        closeWorkspaceChildSlotHost('right-nav-panel', { force: true });
        closeWorkspaceChildSlotHost('left-nav-panel', { force: true });
    }, chatName);
}

test('mobile greeting controls remain present during save, with localized names and an unwrapped new-chat action', async ({ page }) => {
    await setupGreeting(page);
    const picker = page.getByTestId('main-chat-greeting-picker');
    const next = picker.locator('button').nth(1);
    await expect(picker).toBeVisible();
    await page.evaluate(() => {
        window.greetingPickerRemovals = 0;
        new MutationObserver(records => {
            for (const record of records) for (const node of record.removedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE && (node.matches('[data-testid="main-chat-greeting-picker"]') || node.querySelector('[data-testid="main-chat-greeting-picker"]'))) window.greetingPickerRemovals++;
            }
        }).observe(document.body, { childList: true, subtree: true });

    });
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let started;
    const saving = new Promise(resolve => { started = resolve; });
    await page.route('**/api/chats/save', async route => { started(); await gate; await route.continue(); });
    try {
        await next.click();
        await saving;
        // Simulate a normal scheduled projection while the save is in flight.
        await page.evaluate(async () => (await import('/script.js')).scheduleMainChatMessageListPanelRefresh());
        await page.waitForTimeout(300);
        await expect(picker).toBeVisible({ timeout: 1000 });
        await expect(next).toBeDisabled();
        await expect.soft(picker.locator('button').first()).toHaveAccessibleName('上一个开场白');
        await expect.soft(next).toHaveAccessibleName('下一个开场白');
    } finally { release(); }
    await expect(picker).toContainText('2 / 2');
    await expect.soft.poll(() => page.evaluate(() => window.greetingPickerRemovals)).toBe(0);
    await page.unroute('**/api/chats/save');
    await page.locator('#options_button').click();
    await page.locator('#option_start_new_chat').click();
    const button = page.locator('.popup[open] .popup-button-ok');
    await expect(button).toHaveText('开始新聊天');
    const wraps = await button.evaluate(element => {
        const range = document.createRange();
        range.selectNodeContents(element);
        return range.getClientRects().length > 1;
    });
    expect.soft(wraps).toBe(false);
});


test('pending selection survives a changed greeting snapshot until the save settles', async ({ page }) => {
    await setupGreeting(page);
    const picker = page.getByTestId('main-chat-greeting-picker');
    await expect(picker).toBeVisible();
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let started;
    const saving = new Promise(resolve => { started = resolve; });
    await page.route('**/api/chats/save', async route => { started(); await gate; await route.continue(); });
    try {
        await picker.locator('button').nth(1).click();
        await saving;
        await page.evaluate(async () => {
            window.SillyTavern.getContext().chat[0].mes = 'Changed during save';
            (await import('/script.js')).scheduleMainChatMessageListPanelRefresh();
        });
        await expect(picker).toContainText('— / 2', { timeout: 2000 });
        await expect(picker.locator('button').nth(1)).toBeDisabled();
    } finally { release(); }
});


test('keyboard focus remains usable and the picker cannot open while a selection is pending', async ({ page }) => {
    await setupGreeting(page);
    const picker = page.getByTestId('main-chat-greeting-picker');
    const trigger = picker.locator('[data-greeting-picker-trigger]');
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let started;
    const saving = new Promise(resolve => { started = resolve; });
    await page.route('**/api/chats/save', async route => { started(); await gate; await route.continue(); });
    try {
        await trigger.focus();
        await page.keyboard.press('ArrowRight');
        await saving;
        await expect.soft(trigger).toBeDisabled();
        await trigger.evaluate(element => element.click());
        await expect.soft(page.locator('dialog[open]')).toHaveCount(0);
        await page.evaluate(async () => (await import('/script.js')).scheduleMainChatMessageListPanelRefresh());
        await page.waitForTimeout(300);
        await expect.soft(trigger).toBeFocused();
    } finally { release(); }
    await expect(picker).toContainText('2 / 2');
    await expect(trigger).toBeEnabled();
    await expect(trigger).toBeFocused();
});
