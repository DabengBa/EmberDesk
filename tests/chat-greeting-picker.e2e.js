import { expect, test } from '@playwright/test';

import { testSetup } from './frontend/frontent-test-utils.js';

async function readStoredState(page, avatar, chatName) {
    return page.evaluate(async ({ avatarUrl, fileName }) => {
        const { token } = await fetch('/csrf-token').then(response => response.json());
        const post = async (url, body) => {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
                body: JSON.stringify(body),
            });
            if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
            return response.json();
        };
        // These two fields are derived chat statistics, not character-card data.
        const card = await post('/api/characters/get', { avatar_url: avatarUrl });
        delete card.chat_size;
        delete card.date_last_chat;
        return {
            card,
            chat: await post('/api/chats/get', { avatar_url: avatarUrl, file_name: fileName }),
        };
    }, { avatarUrl: avatar, fileName: chatName });
}

// Run in the standard isolated server lane, never against a user's server:
// PLAYWRIGHT_REUSE_SERVER=0 PLAYWRIGHT_PORT=8017 pnpm --dir tests run test:e2e chat-greeting-picker.e2e.js --workers=1
test('loaded character chat previews greetings without writes, persists a selection, and leaves the card untouched', async ({ page }, testInfo) => {

    await testSetup.awaitST({ page });

    const name = `Greeting picker ${crypto.randomUUID()}`;
    const chatName = `${name} session`;
    const main = 'MAIN_GREETING: welcome to the observatory.';
    const alternates = [
        `ALTERNATE_ONE: ${'The observatory waits in silence. '.repeat(8)}MIDNIGHT_BEACON marks the telescope. ${'The stars shine overhead. '.repeat(8)}`,
        'ALTERNATE_TWO: the midnight train has arrived.',
    ];
    const card = {
        spec: 'chara_card_v2',
        spec_version: '2.0',
        data: {
            name, description: 'Greeting picker browser fixture', personality: '', scenario: '',
            first_mes: main, mes_example: '', creator_notes: '', system_prompt: '',
            post_history_instructions: '', alternate_greetings: alternates, tags: [],
            creator: 'Playwright', character_version: '1', extensions: {},
        },
    };

    await page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '角色库' }).click();
    await page.setInputFiles('#character_import_file', {
        name: 'greeting-picker.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(card)),
    });
    await expect(page.locator('.toast-success')).toContainText(name);
    const avatar = await page.evaluate(async characterName => {
        const context = window.SillyTavern.getContext();
        const id = context.characters.findIndex(character => character.name === characterName);
        if (id < 0) throw new Error(`Imported character missing: ${characterName}`);
        await context.selectCharacterById(id);
        return context.characters[id].avatar;
    }, name);
    await testSetup.saveCharacterChat({
        page, characterName: name, avatarUrl: avatar, fileName: chatName,
        chat: [
            { user_name: 'User', character_name: name, chat_metadata: {} },
            { name, is_user: false, is_system: false, send_date: '2026-01-01', mes: main },
        ],
    });
    await page.evaluate(async fileName => window.SillyTavern.getContext().openCharacterChat(fileName), chatName);
    const picker = page.getByTestId('main-chat-greeting-picker');
    const trigger = picker.locator('[data-greeting-picker-trigger]');
    const previousGreeting = picker.getByRole('button', { name: /上一个开场白|Previous greeting/ });
    const nextGreeting = picker.getByRole('button', { name: /下一个开场白|Next greeting/ });
    await expect(trigger).toBeVisible();
    await expect(trigger).toBeEnabled();
    const message = page.locator('#chat .mes[mesid="0"] .mes_text');
    await expect(message).toContainText(main);
    const before = await readStoredState(page, avatar, chatName);
    const writes = [];
    page.on('request', request => {
        if (/\/api\/(?:chats\/save|characters\/(?:edit|merge-attributes|edit-attribute))$/.test(new URL(request.url()).pathname)) {
            writes.push(request.url());
        }
    });

    const saveGreetingWith = async action => {
        const saved = page.waitForResponse(response => response.url().endsWith('/api/chats/save') && response.request().method() === 'POST');
        await action();
        expect((await saved).ok()).toBe(true);
    };

    await saveGreetingWith(() => nextGreeting.click());
    await expect(message).toContainText(alternates[0]);
    await expect(trigger).toContainText('2 / 3');
    await saveGreetingWith(async () => {
        await trigger.focus();
        await page.keyboard.press('ArrowRight');
    });
    await expect(message).toContainText(alternates[1]);
    await expect(trigger).toContainText('3 / 3');
    await saveGreetingWith(async () => page.keyboard.press('ArrowLeft'));
    await expect(message).toContainText(alternates[0]);
    await saveGreetingWith(async () => page.keyboard.press('ArrowLeft'));
    await expect(message).toContainText(main);
    await expect(trigger).toContainText('1 / 3');
    expect(await readStoredState(page, avatar, chatName)).toEqual(before);
    writes.length = 0;

    await trigger.click();
    const dialog = page.getByRole('dialog', { name: /选择开场白|Choose a greeting/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('[aria-label="开场白列表"]').getByRole('button')).toHaveCount(3);
    const secondAlternate = dialog.getByRole('button').filter({ hasText: alternates[1] });
    await secondAlternate.click();
    await expect(dialog.locator('article')).toContainText(alternates[1]);
    await expect(message).toContainText(main);
    await page.screenshot({ path: testInfo.outputPath('greeting-preview.png') });
    expect(await readStoredState(page, avatar, chatName)).toEqual(before);
    expect(writes).toEqual([]);
    // Escape from the search field cancels preview without selecting anything.
    await dialog.getByRole('searchbox').focus();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    expect(await readStoredState(page, avatar, chatName)).toEqual(before);
    expect(writes).toEqual([]);

    // Make generation otherwise eligible so an offline provider cannot hide a
    // missing pending-selection guard. Never let a regression contact a provider.
    await page.evaluate(async () => {
        const script = await import('/script.js');
        const context = window.SillyTavern.getContext();
        context.chatCompletionSettings.chat_completion_source = 'openai';
        context.chatCompletionSettings.openai_model = 'gpt-4o-mini';
        script.changeMainAPI('openai');
        script.setOnlineStatus('Valid');
        script.activateSendButtons();
    });
    const generationRequests = [];
    await page.route('**/api/backends/chat-completions/generate', async route => {
        generationRequests.push(route.request().postDataJSON());
        await route.fulfill({ status: 500, json: { error: { message: 'Unexpected generation while selecting a greeting' } } });
    });
    let releaseSave;
    const saveGate = new Promise(resolve => { releaseSave = resolve; });
    let observeSave;
    const saveStarted = new Promise(resolve => { observeSave = resolve; });
    await page.route('**/api/chats/save', async route => {
        observeSave(route.request().postDataJSON());
        await saveGate;
        await route.continue();
    });

    await trigger.click();
    const saved = page.waitForResponse(response => response.url().endsWith('/api/chats/save') && response.request().method() === 'POST');
    try {
        await dialog.getByRole('button').filter({ hasText: alternates[1] }).click();
        // Choosing an option only changes the preview. The explicit action is
        // the sole commit boundary, including when the native dialog stays mounted.
        expect(await readStoredState(page, avatar, chatName)).toEqual(before);
        expect(writes).toEqual([]);
        await dialog.getByRole('button', { name: /使用.*开场白/ }).click();
        const submitted = await saveStarted;

        expect(submitted.chat[0].chat_metadata.greeting).toEqual({ index: 2, text: alternates[1] });
        const pendingMessages = await page.evaluate(() => structuredClone(window.SillyTavern.getContext().chat));
        await page.locator('#send_textarea').evaluate(element => {
            element.value = 'MUST_NOT_SEND_WHILE_GREETING_SAVES';
            element.dispatchEvent(new Event('input', { bubbles: true }));
        });
        // Dispatch the real controls even if an overlay or disabled presentation
        // would otherwise prevent pointer input; the coordinator must guard too.
        await page.locator('#chat .mes[mesid="0"] .mes_edit').evaluate(element => element.click());
        await page.locator('#send_but').evaluate(element => element.click());
        await page.evaluate(async () => {
            await window.SillyTavern.getContext().generate('continue');
        });
        await expect(page.locator('#chat .edit_textarea')).toHaveCount(0);
        expect(await page.evaluate(() => window.SillyTavern.getContext().chat)).toEqual(pendingMessages);
        await expect(page.locator('#send_textarea')).toHaveValue('MUST_NOT_SEND_WHILE_GREETING_SAVES');
        expect(generationRequests).toEqual([]);
        expect(await readStoredState(page, avatar, chatName)).toEqual(before);
    } finally {
        releaseSave();
    }
    expect((await saved).ok()).toBe(true);

    await page.unroute('**/api/chats/save');
    await expect(dialog).toBeHidden();
    await expect(message).toContainText(alternates[1]);
    const selected = await readStoredState(page, avatar, chatName);
    expect(selected.card).toEqual(before.card);
    expect(selected.chat.slice(1)).toHaveLength(1);
    expect(selected.chat[1].mes).toBe(alternates[1]);
    expect(selected.chat[0].chat_metadata.greeting).toEqual({ index: 2, text: alternates[1] });

    await page.reload();
    await testSetup.awaitST({ page });
    await page.evaluate(async ({ avatarUrl, fileName }) => {
        const context = window.SillyTavern.getContext();
        const id = context.characters.findIndex(character => character.avatar === avatarUrl);
        if (id < 0) throw new Error(`Reloaded character missing: ${avatarUrl}`);
        await context.selectCharacterById(id);
        await context.openCharacterChat(fileName);
    }, { avatarUrl: avatar, fileName: chatName });
    await expect(message).toContainText(alternates[1]);
    await expect(trigger).toContainText('3 / 3');
    await trigger.click();
    await expect(dialog.getByRole('button', { pressed: true })).toContainText(alternates[1]);
    await page.screenshot({ path: testInfo.outputPath('greeting-restored.png') });
    expect((await readStoredState(page, avatar, chatName)).card).toEqual(before.card);

    // Character selection opens its drawer. On mobile it covers the entire
    // chat, so close it before testing pointer interaction with the picker.
    await page.evaluate(async () => {
        const { closeWorkspaceChildSlotHost } = await import('/script.js');
        closeWorkspaceChildSlotHost('right-nav-panel', { force: true });
        closeWorkspaceChildSlotHost('left-nav-panel', { force: true });
    });
    await page.setViewportSize({ width: 390, height: 844 });

    const search = dialog.getByRole('searchbox', { name: '搜索开场白' });
    const candidates = dialog.locator('[aria-label="开场白列表"]').getByRole('button');
    const confirm = dialog.getByRole('button', { name: /使用.*开场白/ });
    const audit = expect.configure({ soft: true, timeout: 500 });
    // Soft assertions collect every audit regression in this shared journey,
    // rather than hiding later failures behind the first stale preview.
    for (const button of [trigger, ...await dialog.locator('button:not([aria-pressed])').all()]) {
        await audit(button, 'Picker buttons retain the legacy menu_button styling hook').toHaveClass(/\bmenu_button\b/);
    }
    const bodyColor = await dialog.evaluate(element => getComputedStyle(element).color);
    await expect(confirm).toHaveCSS('color', bodyColor);
    await confirm.hover();
    await expect(confirm).toHaveCSS('color', bodyColor);
    for (const control of [trigger, search, ...await dialog.getByRole('button').all()]) {
        await audit.poll(async () => (await control.boundingBox())?.width ?? 0,
            { message: 'Mobile touch target width at 390px' }).toBeGreaterThanOrEqual(44);
        await audit.poll(async () => (await control.boundingBox())?.height ?? 0,
            { message: 'Mobile touch target height at 390px' }).toBeGreaterThanOrEqual(44);
    }
    await search.fill('ALTERNATE_ONE');
    await expect(candidates).toHaveCount(1);
    await expect(candidates).toContainText('ALTERNATE_ONE');
    await audit(candidates).toHaveAttribute('aria-pressed', 'true');
    await audit(dialog.locator('article')).toContainText(alternates[0]);
    await audit(confirm).toBeEnabled();
    await search.fill('MIDNIGHT_BEACON');
    await expect(candidates).toHaveCount(1);
    // The match is well beyond the first 100 characters: the list summary,
    // not only the full preview, must expose why this candidate matched.
    await audit(candidates).toContainText('MIDNIGHT_BEACON');
    await audit(dialog.locator('article')).toContainText(alternates[0]);
    await page.screenshot({ path: testInfo.outputPath('greeting-mobile-search.png') });
    await search.fill('NO_SUCH_GREETING');
    await expect(candidates).toHaveCount(0);
    await expect(dialog.getByRole('status')).toContainText('没有找到匹配的开场白');
    await audit(confirm).toBeDisabled();
    await audit(dialog.getByRole('button', { pressed: true })).toHaveCount(0);
    for (const text of [main, ...alternates]) {
        await audit(dialog.locator('article')).not.toContainText(text);
    }
    await page.screenshot({ path: testInfo.outputPath('greeting-mobile-empty.png') });
    await search.fill('');
    await expect(candidates).toHaveCount(3);
    await audit(confirm).toBeEnabled();
    await candidates.filter({ hasText: 'ALTERNATE_ONE' }).click();
    await expect(dialog.locator('article')).toContainText(alternates[0]);
    const beforeFailure = await readStoredState(page, avatar, chatName);
    let releaseFailure;
    const failureGate = new Promise(resolve => { releaseFailure = resolve; });
    let observeFailure;
    const failureStarted = new Promise(resolve => { observeFailure = resolve; });
    const failSave = async route => {
        observeFailure();
        await failureGate;
        await route.fulfill({ status: 500, json: { error: 'Greeting save failed for browser regression proof' } });
    };
    await page.route('**/api/chats/save', failSave, { times: 1 });
    try {
        await dialog.getByRole('button', { name: /使用.*开场白/ }).click();
        await failureStarted;

        // A normal snapshot refresh while the save is pending must not unmount
        // the native dialog or lose its top-layer/focus containment state.
        await page.evaluate(async () => {
            const script = await import('/script.js');
            script.setOnlineStatus('Valid');
        });
    } finally {
        releaseFailure();
    }
    await expect(dialog.getByRole('alert')).toContainText('未能使用该开场白');
    await expect(dialog.getByRole('alert')).toHaveCSS('color', bodyColor);

    await expect(dialog).toBeVisible();
    await expect(page.locator('dialog:modal').filter({ has: page.getByRole('heading', { name: '选择开场白', exact: true }) })).toHaveCount(1);
    await page.locator('#send_textarea').evaluate(element => element.focus());
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
    await expect(message).toContainText(alternates[1]);
    expect(await readStoredState(page, avatar, chatName)).toEqual(beforeFailure);
    await page.screenshot({ path: testInfo.outputPath('greeting-mobile-save-failed.png') });

    await page.keyboard.press('Escape');

    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();

    expect(await readStoredState(page, avatar, chatName)).toEqual(beforeFailure);

    await trigger.click();

    await expect(dialog).toBeVisible();
    await candidates.filter({ hasText: 'ALTERNATE_ONE' }).click();


    await page.unroute('**/api/chats/save', failSave);

    const retrySaved = page.waitForResponse(response => response.url().endsWith('/api/chats/save') && response.request().method() === 'POST');
    await dialog.getByRole('button', { name: /使用.*开场白/ }).click();

    expect((await retrySaved).ok()).toBe(true);

    await expect(dialog).toBeHidden();
    await expect(message).toContainText(alternates[0]);
    const retried = await readStoredState(page, avatar, chatName);
    expect(retried.chat[1].mes).toBe(alternates[0]);
    expect(retried.chat[0].chat_metadata.greeting).toEqual({ index: 1, text: alternates[0] });
    expect(retried.card).toEqual(before.card);

    // A user turn starts the conversation permanently: saving and reloading
    // must not offer to replace its opening message again.
    await page.evaluate(async () => {
        const script = await import('/script.js');
        await script.sendMessageAsUser('STARTED_CONVERSATION');
        await window.SillyTavern.getContext().saveChat();
        await window.SillyTavern.getContext().reloadCurrentChat();
    });
    await expect(page.locator('#chat')).toContainText('STARTED_CONVERSATION');
    await expect(picker).toBeHidden();
    const started = await readStoredState(page, avatar, chatName);
    expect(started.chat[0].chat_metadata.tainted).toBe(true);
    expect(started.card).toEqual(before.card);
    await page.screenshot({ path: testInfo.outputPath('greeting-mobile-started.png') });
});
