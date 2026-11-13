import { test, expect } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';

async function prepare(page, message = 'U004 pending deletion recovery proof') {
    await testSetup.awaitST({ page });
    return page.evaluate(async message => {
        const context = window.SillyTavern.getContext();
        context.chatCompletionSettings.chat_memory_enabled = false;
        const index = context.characters.findIndex(character => character.name === 'Dev Character 048');
        await context.selectCharacterById(index);
        const character = context.characters[index];
        context.chat[0].mes = message;
        const { saveChatDebounced } = await import('/scripts/chat-ops-service.js');
        saveChatDebounced();
        return { name: character.chat, avatar: character.avatar, characterName: character.name };
    }, message);
}

async function remove(page, name) {
    return page.evaluate(async file => {
        try {
            const { runHistoryRowCommand } = await import('/scripts/dom-handlers.js');
            await runHistoryRowCommand('deleteChat', file, { fromSlashCommand: true });
            return 'resolved';
        } catch { return 'rejected'; }
    }, name);
}

async function containsMessage(page, chat, message) {
    return page.evaluate(async ({ chat, message }) => {
        const { getRequestHeaders } = await import('/script.js');
        const response = await fetch('/api/chats/get', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ ch_name: chat.characterName, file_name: chat.name, avatar_url: chat.avatar }) });
        if (!response.ok) return false;
        const messages = await response.json();
        return Array.isArray(messages) && messages.some(item => item.mes === message);
    }, { chat, message });
}

async function readChat(page, chat) {
    return page.evaluate(async chat => {
        const { getRequestHeaders } = await import('/script.js');
        const response = await fetch('/api/chats/get', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ ch_name: chat.characterName, file_name: chat.name, avatar_url: chat.avatar }) });
        return { status: response.status, body: await response.json() };
    }, chat);
}

test('a background edit during an ambiguous deletion is preserved without resurrecting the deleted chat', async ({ page }) => {
    const chat = await prepare(page);
    let release;
    let committed;
    const held = new Promise(resolve => { release = resolve; });
    const deleted = new Promise(resolve => { committed = resolve; });
    await page.route('**/api/chats/delete', async route => {
        const response = await route.fetch();
        expect(response.ok()).toBe(true);
        committed();
        await held;
        await route.abort('failed');
    });
    const deleting = remove(page, chat.name);
    await deleted;
    await page.evaluate(async () => {
        window.SillyTavern.getContext().chat[0].mes = 'U004 late edit retained 314159';
        (await import('/scripts/chat-ops-service.js')).saveChatDebounced();
    });
    release();
    expect(await deleting).toBe('rejected');
    await expect.poll(() => page.evaluate(async () => {
        const storage = (await import('/lib.js')).localforage.createInstance({ name: 'EmberDesk_ChatRecovery' });
        const keys = (await storage.keys()).filter(key => key.startsWith('recovery-v1:playwright-e2e:'));
        return JSON.stringify(await Promise.all(keys.map(key => storage.getItem(key))));
    })).toContain('U004 late edit retained 314159');
    expect(await containsMessage(page, chat, 'U004 late edit retained 314159')).toBe(false);
});

test('an unconfirmed deletion retains the unsaved edit in recovery rather than saving over an unknown outcome', async ({ page }) => {
    const message = `offline pending edit ${Date.now()}`;
    const chat = await prepare(page, message);
    const original = await readChat(page, chat);
    expect(original.status).toBe(200);
    expect(JSON.stringify(original.body)).not.toContain(message);
    let deletes = 0;
    await page.route('**/api/chats/delete', route => { deletes++; return route.abort('failed'); });
    expect(await remove(page, chat.name)).toBe('rejected');
    expect(deletes).toBe(1);
    // A transport error cannot establish whether the server committed the delete.
    // The version owner deliberately blocks further saves rather than resurrect it.
    expect(await page.evaluate(() => window.SillyTavern.getContext().chat[0].mes)).toBe(message);
    const drafts = await page.evaluate(async () => {
        const storage = (await import('/lib.js')).localforage.createInstance({ name: 'EmberDesk_ChatRecovery' });
        const keys = (await storage.keys()).filter(key => key.startsWith('recovery-v1:playwright-e2e:'));
        return Promise.all(keys.map(key => storage.getItem(key)));
    });
    const draft = drafts.find(item => item.identity.avatar === chat.avatar && item.identity.chat === chat.name && item.snapshot.messages.some(entry => entry.mes === message));
    expect(draft).toBeTruthy();
    // Allow the actual debounced save to fire; verify the entire original chat,
    // not merely absence of one string or a failed GET.
    await page.waitForTimeout(await page.evaluate(async () => (await import('/script.js')).DEFAULT_SAVE_EDIT_TIMEOUT + 300));
    expect(await readChat(page, chat)).toEqual(original);
    await page.reload();
    await testSetup.awaitST({ page });
    await page.evaluate(async () => {
        const state = window.SillyTavern.getContext();
        await state.selectCharacterById(state.characters.findIndex(character => character.name === 'Dev Character 048'));
    });
    await page.locator('#options_button').click();
    await page.locator('#option_select_chat').click();
    const section = page.getByTestId('chat-recovery-drafts');
    await expect(section).toContainText(chat.name);
    const response = page.waitForResponse(result => result.url().endsWith('/api/chats/save') && result.request().postDataJSON().operationId === draft.id);
    await section.getByRole('button', { name: /restore.*new/i }).first().click();
    const restored = await response;
    expect(restored.status()).toBe(200);
    expect(restored.request().postDataJSON()).toMatchObject({ create: true, file_name: `Recovered-${draft.id}` });
    const copy = await readChat(page, { ...chat, name: `Recovered-${draft.id}` });
    expect(copy.status).toBe(200);
    expect(copy.body.some(entry => entry.mes === message)).toBe(true);
    expect(await readChat(page, chat)).toEqual(original);
});
