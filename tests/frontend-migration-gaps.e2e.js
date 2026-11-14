import { expect, test } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';

test.setTimeout(90_000);

async function selectCharacter(page, name) {
    return page.evaluate(async name => {
        const context = window.SillyTavern.getContext();
        context.chatCompletionSettings.chat_memory_enabled = false;
        const index = context.characters.findIndex(character => character.name === name);
        if (index < 0) throw new Error(`Missing seeded character ${name}`);
        await context.selectCharacterById(index);
        return { id: String(index), avatar: context.characters[index].avatar, chat: context.characters[index].chat };
    }, name);
}

async function renameCurrentChat(page, name) {
    expect(await page.evaluate(async newFileName => {
        const context = window.SillyTavern.getContext();
        const { renameCharacterChat } = await import('/scripts/chat-ops-service.js');
        return renameCharacterChat({ characterId: String(context.characterId), oldFileName: context.characters[context.characterId].chat, newFileName, loader: false });
    }, name)).toBe(true);
}

test('same-name drafts stay scoped to avatar through rename', async ({ page }) => {
    await testSetup.awaitST({ page });
    const shared = 'Shared migration drafts';
    await selectCharacter(page, 'Dev Character 041');
    await renameCurrentChat(page, shared);
    await page.locator('#send_textarea').fill('Alice draft');
    await selectCharacter(page, 'Dev Character 042');
    await renameCurrentChat(page, shared);
    await expect(page.locator('#send_textarea')).toHaveValue('');
    await page.locator('#send_textarea').fill('Bob draft');
    await renameCurrentChat(page, 'Renamed migration draft');
    await expect(page.locator('#send_textarea')).toHaveValue('Bob draft');
    await selectCharacter(page, 'Dev Character 041');
    await expect(page.locator('#send_textarea')).toHaveValue('Alice draft');
    await selectCharacter(page, 'Dev Character 042');
    await expect(page.locator('#send_textarea')).toHaveValue('Bob draft');
    await page.evaluate(async () => (await import('/scripts/chat-ops-service.js')).closeCurrentChatForDelete());
    await expect(page.locator('#send_textarea')).toHaveValue('');
    await selectCharacter(page, 'Dev Character 041');
    await expect(page.locator('#send_textarea')).toHaveValue('Alice draft');
});

test('chat shortcuts use message commands and preserve input priority', async ({ page }) => {
    await testSetup.awaitST({ page });
    await selectCharacter(page, 'Dev Character 043');
    await page.evaluate(async () => {
        const context = window.SillyTavern.getContext();
        context.chat.splice(0, context.chat.length,
            { name: 'You', is_user: true, is_system: false, mes: 'Earlier user message', send_date: Date.now() },
            ...Array.from({ length: 80 }, (_, index) => ({ name: 'Assistant', is_user: false, is_system: false, mes: `Assistant message ${index}`, send_date: Date.now() })));
        await (await import('/scripts/chat-ops-service.js')).printMessages();
    });
    const composer = page.locator('#send_textarea');
    const editor = page.locator('#curEditTextarea');
    await composer.fill('keep selection');
    await composer.evaluate(element => element.setSelectionRange(0, 4));
    await composer.press('ArrowUp');
    await expect(editor).toHaveCount(0);
    await composer.fill('');
    await composer.press('ArrowUp');
    await expect(editor).toHaveValue('Assistant message 79');
    await editor.fill('Committed through command');
    await editor.dispatchEvent('keydown', { key: 'Enter', ctrlKey: true, isComposing: true, bubbles: true });
    await expect(editor).toHaveCount(1);
    await editor.press('Control+Enter');
    await expect(editor).toHaveCount(0);
    await expect(page.locator('#chat .mes').last()).toContainText('Committed through command');
    expect(await page.evaluate(() => window.SillyTavern.getContext().chat.length)).toBe(81);
    await composer.press('Control+ArrowUp');
    await expect(editor).toHaveValue('Earlier user message');
    await editor.fill('Cancel this edit');
    await page.evaluate(async () => {
        const { Popup, POPUP_TYPE } = await import('/scripts/popup.js');
        window.shortcutPopup = new Popup('<h3>Shortcut modal</h3>', POPUP_TYPE.INPUT, 'modal value');
        window.shortcutPopupResult = window.shortcutPopup.show();
    });
    await page.locator('dialog[data-react-popup] .popup-input').press('Control+Enter');
    expect(await page.evaluate(() => window.shortcutPopupResult)).toBe('modal value');
    await expect(editor).toHaveCount(1);
    await editor.press('Escape');
    await expect(editor).toHaveCount(0);
    expect(await page.evaluate(() => window.SillyTavern.getContext().chat[0].mes)).toBe('Earlier user message');
});

test('Popup bridge keeps async confirm, nested cancel and focus', async ({ page }) => {
    await testSetup.awaitST({ page });
    const opener = page.locator('#send_textarea');
    await opener.focus();
    await page.evaluate(async () => {
        const { Popup, POPUP_TYPE } = await import('/scripts/popup.js');
        window.popupEvents = [];
        window.outerPopup = new Popup('<h3>Outer confirmation</h3>', POPUP_TYPE.CONFIRM, '', {
            customInputs: [{ id: 'popup-check', label: 'Remember selection', defaultState: true }],
            onClosing: async popup => {
                window.popupEvents.push(['closing', popup.result, popup.inputResults.get('popup-check')]);
                return new Promise(resolve => { window.resolvePopupClose = resolve; });
            },
            onClose: () => { window.popupEvents.push(['closed']); },
        });
        // Existing consumers access these references before showing the dialog.
        window.outerPopup.dlg.dataset.consumerReference = 'ready';
        window.outerPopupResult = window.outerPopup.show();
    });
    const outer = page.locator('dialog[data-consumer-reference="ready"]');
    await expect(outer).toBeVisible();
    await expect(outer.locator('.popup-button-ok')).toBeFocused();
    await outer.locator('.popup-button-ok').click();
    await outer.locator('.popup-button-ok').click();
    expect(await page.evaluate(() => window.popupEvents)).toEqual([['closing', 1, true]]);
    await page.evaluate(() => window.resolvePopupClose(false));
    await expect(outer).toBeVisible();
    await page.evaluate(async () => {
        const { Popup, POPUP_TYPE } = await import('/scripts/popup.js');
        window.innerPopup = new Popup('<h3>Inner input</h3>', POPUP_TYPE.INPUT, 'inner');
        window.innerPopupResult = window.innerPopup.show();
    });
    const inner = page.locator('dialog[data-react-popup]').last();
    await expect(inner.locator('.popup-input')).toBeFocused();
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => window.innerPopupResult)).toBeNull();
    await expect(outer.locator('.popup-button-ok')).toBeFocused();
    await outer.locator('.popup-button-ok').click();
    await page.evaluate(() => window.resolvePopupClose(true));
    expect(await page.evaluate(() => window.outerPopupResult)).toBe(1);
    expect(await page.evaluate(() => window.popupEvents)).toEqual([['closing', 1, true], ['closing', 1, true], ['closed']]);
    await expect(page.locator('[data-react-popup-host]')).toHaveCount(0);
    await expect(opener).toBeFocused();
});

test('Popup crop keeps image selection and confirmed result', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.evaluate(async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 240; canvas.height = 240;
        const context = canvas.getContext('2d');
        context.fillStyle = '#ef782f'; context.fillRect(0, 0, 240, 240);
        const { Popup, POPUP_TYPE } = await import('/scripts/popup.js');
        window.cropPopup = new Popup('<h3>Crop image</h3>', POPUP_TYPE.CROP, '', { cropImage: canvas.toDataURL(), cropAspect: 1 });
        window.cropPopupResult = window.cropPopup.show();
    });
    const dialog = page.locator('dialog[data-react-popup]');
    await expect(dialog.locator('.cropper-container')).toBeVisible();
    await expect(dialog.locator('.popup-button-ok')).toBeEnabled();
    const before = await page.evaluate(() => ({ ...window.cropPopup.cropData }));
    await dialog.getByRole('button', { name: /^(Shrink crop|缩小裁剪框)$/ }).click();
    await expect.poll(() => page.evaluate(() => window.cropPopup.cropData.width)).toBeLessThan(before.width);
    await dialog.locator('.popup-button-ok').click();
    expect(await page.evaluate(() => window.cropPopupResult)).toMatch(/^data:image\/jpeg;base64,/);
    expect(await page.evaluate(() => window.cropPopup.cropData.want_resize)).toBe(true);
    await expect(page.locator('[data-react-popup-host]')).toHaveCount(0);
    // Character lore bindings now use React controls in the same popup runtime.
    await selectCharacter(page, 'Dev Character 044');
    await page.evaluate(async () => {
        const context = window.SillyTavern.getContext();
        window.$('#set_character_world').data('chid', context.characterId);
        window.lorebookPopup = (await import('/scripts/character-lifecycle-service.js')).openCharacterWorldPopup();
    });
    await expect(page.locator('dialog[data-react-popup]').getByRole('searchbox')).toBeVisible();
    await expect(page.locator('dialog[data-react-popup] .select2-container')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.lorebookPopup);
    await expect(page.locator('[data-react-popup-host]')).toHaveCount(0);
});
