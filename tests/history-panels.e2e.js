import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { testSetup } from './frontend/frontent-test-utils.js';

async function openCharacterHistory(page, characterName = 'Dev Character 001') {
    await testSetup.awaitST({ page });
    await page.evaluate(async (name) => {
        const context = window.SillyTavern.getContext();
        await context.selectCharacterById(context.characters.findIndex(character => character.name === name));
    }, characterName);
    await page.locator('#options_button').click();
    await page.locator('#option_select_chat').click();
    await expect(page.locator('#select_chat_div .select_chat_block').first()).toBeVisible();
}

for (const action of ['search', 'close', 'close and reopen']) {
    test(`a delayed public history load cannot overwrite ${action}`, async ({ page }) => {
        await openCharacterHistory(page);
        let release;
        let received;
        const held = new Promise(resolve => { received = resolve; });
        const gate = new Promise(resolve => { release = resolve; });
        await page.route('**/api/chats/search', async route => {
            const { query } = route.request().postDataJSON();
            if (query === 'delayed compat') {
                received();
                await gate;
                await route.fulfill({ json: [{ file_name: 'stale compat', last_mes: '2026-01-01T00:00:00Z' }] });
            } else {
                await route.fulfill({ json: [{ file_name: 'current result', last_mes: '2026-01-01T00:00:00Z' }] });
            }
        });
        try {
            await page.evaluate(() => {
                window.__historyCompatTest = import('/scripts/chat-ops-service.js').then(({ displayChats }) => {
                    const context = window.SillyTavern.getContext();
                    return displayChats('delayed compat', context.chatId, '', context.characters[context.characterId].avatar, []);
                });
            });
            await held;
            if (action === 'search') {
                await page.locator('#select_chat_search').fill('current search');
                await expect.poll(() => page.evaluate(() => globalThis.__emberDeskSelectChatListBridge.controller.getSnapshot().items[0]?.fileName)).toBe('current result');
            } else {
                await page.locator('#select_chat_cross').click();
                await expect(page.locator('#shadow_select_chat_popup')).toBeHidden();
                if (action === 'close and reopen') {
                    await page.locator('#options_button').click();
                    await page.locator('#option_select_chat').click();
                    await expect(page.locator('#select_chat_div .select_chat_block[file_name="current result"]')).toBeVisible();
                }
            }
            release();
            await page.evaluate(() => window.__historyCompatTest);
            if (action === 'close') {
                await expect(page.locator('#shadow_select_chat_popup')).toBeHidden();
                expect(await page.evaluate(() => globalThis.__emberDeskSelectChatListBridge.controller.getSnapshot().open)).toBe(false);
                return;
            }
            await expect(page.locator('#select_chat_div .select_chat_block[file_name="current result"]')).toBeVisible();
            await expect(page.locator('#select_chat_div .select_chat_block[file_name="stale compat"]')).toHaveCount(0);
            expect(await page.evaluate(() => globalThis.__emberDeskSelectChatListBridge.controller.getSnapshot().searchQuery)).toBe(action === 'search' ? 'current search' : '');
        } finally {
            release();
        }
    });
}

test('attachment picker merges files through native and synthetic menu clicks', async ({ page }) => {
    await testSetup.awaitST({ page });
    const first = fileURLToPath(new URL('./package.json', import.meta.url));
    const second = fileURLToPath(new URL('./history-panels.e2e.js', import.meta.url));
    await page.locator('#options_button').click();
    let chooser = page.waitForEvent('filechooser');
    await page.locator('#attachFile').click();
    await (await chooser).setFiles(first);
    await expect(page.locator('#file_form .file_name')).toHaveText('package.json');
    await page.locator('#options_button').click();
    chooser = page.waitForEvent('filechooser');
    await page.evaluate(() => window.$('#attachFile').trigger('click'));
    await (await chooser).setFiles([first, second]);
    await expect.poll(() => page.locator('#file_form_input').evaluate(input => Array.from(input.files, file => file.name))).toEqual(['package.json', 'history-panels.e2e.js']);
    await expect(page.locator('#file_form .file_name')).toContainText('2');
});

test('legacy message rows select the requested delete range', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.evaluate(async () => {
        const context = window.SillyTavern.getContext();
        context.chatCompletionSettings.chat_memory_enabled = false;
        await context.selectCharacterById(context.characters.findIndex(character => character.name === 'Dev Character 001'));
    });
    expect(await page.evaluate(() => window.SillyTavern.getContext().chat.length)).toBeGreaterThanOrEqual(3);
    await page.locator('#options_button').click();
    await page.locator('#option_delete_mes').click();
    await expect(page.locator('#dialogue_del_mes')).toBeVisible();
    await page.evaluate(() => {
        const host = document.createElement('div');
        host.id = 'u004-legacy-rows';
        Object.assign(host.style, { position: 'fixed', top: '10px', left: '10px', zIndex: '999999', background: 'white' });
        for (let index = 0; index < 3; index++) {
            const row = document.createElement('div');
            row.className = 'mes';
            row.setAttribute('mesid', String(index));
            row.innerHTML = `<input class="del_checkbox" type="checkbox" style="display:inline-block"><span>row ${index}</span>`;
            host.append(row);
        }
        document.body.prepend(host);
    });
    const rows = page.locator('#u004-legacy-rows .mes');
    expect(await page.evaluate(() => ({
        active: globalThis.__emberDeskBulkDeleteController.getSnapshot().active,
        visible: window.$('#u004-legacy-rows .del_checkbox').first().is(':visible'),
    }))).toEqual({ active: true, visible: true });
    await rows.nth(1).locator('span').click();
    await expect(rows.nth(0)).not.toHaveClass(/selected/);
    await expect(rows.nth(1)).toHaveClass(/selected/);
    await expect(rows.nth(2)).toHaveClass(/selected/);
    await expect(rows.nth(1).locator('.del_checkbox')).toBeChecked();
    await expect(rows.nth(2).locator('.del_checkbox')).toBeChecked();
    await expect(page.locator('#dialogue_del_mes_ok')).toBeEnabled();
    await page.locator('#dialogue_del_mes_cancel').click();
});

test('public history highlights a requested row after the list has been scrolled', async ({ page }) => {
    await openCharacterHistory(page);
    await page.route('**/api/chats/search', route => route.fulfill({ json: Array.from({ length: 35 }, (_, index) => ({
        file_name: `Scroll proof ${String(index).padStart(2, '0')}`,
        file_size: '1 KB', message_count: 1, preview_message: 'A chat', last_mes: '2026-01-01T00:00:00Z',
    })) }));
    const display = async (highlightNames) => page.evaluate(async names => {
        const { displayChats } = await import('/scripts/chat-ops-service.js');
        const context = window.SillyTavern.getContext();
        await displayChats('', context.chatId, '', context.characters[context.characterId].avatar, names);
    }, highlightNames);
    await display([]);
    const container = page.locator('#select_chat_div');
    await expect(container.locator('.select_chat_block')).toHaveCount(35);
    await container.evaluate(element => { element.scrollTop = 300; });
    expect(await container.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await display(['Scroll proof 25']);
    const target = container.locator('.select_chat_block').filter({ has: page.locator('.select_chat_block_filename', { hasText: 'Scroll proof 25' }) });
    await expect(target).toHaveCount(1);
    await expect.poll(() => target.evaluate(element => {
        const rect = element.getBoundingClientRect();
        const containerRect = document.querySelector('#select_chat_div').getBoundingClientRect();
        return rect.top >= containerRect.top - 1 && rect.bottom <= containerRect.bottom + 1;
    })).toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    await container.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await expect.poll(() => container.locator('.select_chat_block').last().evaluate(element => {
        const rect = element.getBoundingClientRect();
        const popup = element.closest('#select_chat_popup').getBoundingClientRect();
        return rect.bottom <= popup.bottom && rect.bottom <= innerHeight;
    })).toBe(true);
});

test('history rows render the selected character thumbnail lazily', async ({ page }) => {
    await openCharacterHistory(page);
    const avatar = page.locator('#select_chat_div .select_chat_block .avatar img').first();
    await expect(avatar).toHaveAttribute('loading', 'lazy');
    await expect(avatar).toHaveAttribute('decoding', 'async');
    const identity = await page.evaluate(() => {
        const context = window.SillyTavern.getContext();
        return context.characters[context.characterId].avatar;
    });
    const src = await avatar.getAttribute('src');
    const url = new URL(src, page.url());
    expect(url.pathname).toBe('/thumbnail');
    expect(url.searchParams.get('type')).toBe('avatar');
    expect(url.searchParams.get('file')).toBe(identity);
});

test('public history display renders and highlights a requested row', async ({ page }) => {
    await openCharacterHistory(page);
    const name = await page.locator('#select_chat_div .select_chat_block').first().getAttribute('file_name');
    await page.evaluate(async name => {
        const { displayChats } = await import('/scripts/chat-ops-service.js');
        const context = window.SillyTavern.getContext();
        await displayChats('', context.chatId, '', context.characters[context.characterId].avatar, [name]);
    }, name);
    await expect(page.locator('#select_chat_div .select_chat_block').first()).toHaveAttribute('file_name', name);
    await expect.poll(() => page.locator('#select_chat_div .select_chat_block_wrapper').first().evaluate(row => row.className)).toContain('flash');
});

test('options returns from a branch to its parent with native and synthetic clicks', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.evaluate(async () => {
        const context = window.SillyTavern.getContext();
        context.chatCompletionSettings.chat_memory_enabled = false;
        await context.selectCharacterById(context.characters.findIndex(character => character.name === 'Dev Character 003'));
    });
    const parent = await page.evaluate(() => window.SillyTavern.getContext().chatId);
    for (const synthetic of [false, true]) {
        await page.evaluate(async () => { await (await import('/scripts/chat-branch.js')).branchChat(0); });
        await expect.poll(() => page.evaluate(() => window.SillyTavern.getContext().chatId)).not.toBe(parent);
        await page.locator('#options_button').click();
        await expect(page.locator('#option_back_to_main')).toBeVisible();
        if (synthetic) await page.evaluate(() => window.$('#option_back_to_main').trigger('click'));
        else await page.locator('#option_back_to_main').click();
        await expect.poll(() => page.evaluate(() => window.SillyTavern.getContext().chatId)).toBe(parent);
    }
});

test('history renames a chat through the real endpoint and retains the new name after reload', async ({ page }) => {

    await testSetup.awaitST({ page });
    await page.evaluate(() => { window.SillyTavern.getContext().chatCompletionSettings.chat_memory_enabled = false; });
    await openCharacterHistory(page, 'Dev Character 002');
    const row = page.locator('#select_chat_div .select_chat_block:not([highlight="true"])').first();
    await expect(row).toBeVisible();
    const oldName = await row.getAttribute('file_name');
    const newName = 'U004 Rename Browser Proof';
    await row.getByRole('button', { name: '重命名聊天文件' }).click();
    const dialog = page.getByRole('dialog', { name: '输入聊天的新名称：' });
    await dialog.getByRole('textbox').fill(newName);
    const result = page.waitForResponse(response => response.url().includes('/api/chats/rename') && response.request().method() === 'POST');
    await dialog.getByRole('button', { name: '重命名聊天', exact: true }).click();
    const response = await result;
    expect(response.ok()).toBe(true);
    expect(await response.json()).toMatchObject({ ok: true, sanitizedFileName: newName });
    await expect(page.locator(`.select_chat_block[file_name="${newName}"]`)).toBeVisible();
    await page.reload();
    await testSetup.awaitST({ page });
    await page.evaluate(() => { window.SillyTavern.getContext().chatCompletionSettings.chat_memory_enabled = false; });
    await openCharacterHistory(page, 'Dev Character 002');
    await expect(page.locator(`.select_chat_block[file_name="${newName}"]`)).toBeVisible();
    await expect.poll(() => page.locator('.select_chat_block').evaluateAll((rows, previous) => rows.some(row => row.getAttribute('file_name') === previous), oldName)).toBe(false);
});

test('slash delchat deletes the selected chat through the real endpoint', async ({ page }) => {
    await openCharacterHistory(page, 'Dev Character 002');

    const name = await page.evaluate(() => window.SillyTavern.getContext().chatId);
    await expect(page.locator('.select_chat_block[highlight="true"]')).toHaveAttribute('file_name', name);
    await page.locator('#select_chat_cross').click();
    await page.evaluate(() => {
        const stale = document.createElement('div');
        stale.className = 'select_chat_block';
        stale.setAttribute('highlight', 'true');
        stale.setAttribute('file_name', 'stale unrelated row');
        document.body.prepend(stale);
    });
    const deleted = page.waitForResponse(response => response.url().includes('/api/chats/delete') && response.request().method() === 'POST');
    const result = page.evaluate(async () => {
        const { executeSlashCommandsOnChatInput } = await import('/scripts/slash-commands.js');
        return executeSlashCommandsOnChatInput('/delchat', { clearChatInput: false });
    });
    const response = await deleted;
    expect(response.ok()).toBe(true);
    expect(response.request().postDataJSON().chatfile).toBe(`${name}.jsonl`);
    await result;
    await page.locator('#options_button').click();
    const refreshed = page.waitForResponse(response => response.url().includes('/api/chats/search') && response.request().method() === 'POST');
    await page.locator('#option_select_chat').click();
    const searchResponse = await refreshed;
    const searchData = await searchResponse.json();
    const diagnostic = `deleted=${JSON.stringify(name)}, search=${JSON.stringify(searchData)}, current=${JSON.stringify(await page.evaluate(() => window.SillyTavern.getContext().chatId))}`;
    await expect.poll(() => page.locator('#select_chat_div .select_chat_block').evaluateAll((rows, target) => rows.some(row => row.getAttribute('file_name') === target), name), { message: diagnostic }).toBe(false);
    await expect(page.locator('#shadow_popup')).toBeHidden();
});

test('slash deletion waits for the real delete response before resolving and reopening history', async ({ page }) => {
    await openCharacterHistory(page, 'Dev Character 003');

    const name = await page.evaluate(() => window.SillyTavern.getContext().chatId);
    const traffic = [];
    page.on('request', request => {
        if (/\/api\/(chats|characters)\/(save|get|chats|delete|search)/.test(request.url())) {
            let body = {};
            try { body = request.postDataJSON(); } catch { /* compressed or absent body */ }
            traffic.push({ url: request.url(), chatfile: body?.chatfile, file_name: body?.file_name });
        }
    });
    await expect(page.locator('#select_chat_div .select_chat_block[highlight="true"]')).toHaveAttribute('file_name', name);
    await page.locator('#select_chat_cross').click();
    let release;
    const held = new Promise(resolve => { release = resolve; });
    let deletedOnServer;
    const serverDeleted = new Promise(resolve => { deletedOnServer = resolve; });
    await page.route('**/api/chats/delete', async route => {
        const response = await route.fetch();
        expect(response.ok()).toBe(true);
        expect(route.request().postDataJSON().chatfile).toBe(`${name}.jsonl`);
        deletedOnServer();
        await held;
        await route.fulfill({ response });
    });

    await page.evaluate(() => {
        window.__u004SlashDone = false;
        void import('/scripts/slash-commands.js').then(({ executeSlashCommandsOnChatInput }) =>
            executeSlashCommandsOnChatInput('/delchat', { clearChatInput: false })).then(() => { window.__u004SlashDone = true; });
    });
    await serverDeleted;
    expect(await page.evaluate(() => window.__u004SlashDone)).toBe(false);
    await page.evaluate(async () => {
        window.SillyTavern.getContext().chat[0].mes = 'slash pending delete late edit proof';
        const { saveChatConditional } = await import('/scripts/chat-ops-service.js');
        window.__backgroundSave = saveChatConditional();
    });
    await page.waitForTimeout(200);
    release();
    expect(await page.evaluate(() => window.__backgroundSave)).toBe(false);
    await expect.poll(() => page.evaluate(() => window.__u004SlashDone)).toBe(true);
    await expect(page.locator('#toast-container .toast-error')).toHaveCount(0);
    expect(await page.evaluate(() => window.SillyTavern.getContext().chatId)).not.toBe(name);
    await expect.poll(() => page.evaluate(async () => {
        const storage = (await import('/lib.js')).localforage.createInstance({ name: 'EmberDesk_ChatRecovery' });
        const keys = (await storage.keys()).filter(key => key.startsWith('recovery-v1:playwright-e2e:'));
        return JSON.stringify(await Promise.all(keys.map(key => storage.getItem(key))));
    })).toContain('slash pending delete late edit proof');
    await page.locator('#options_button').click();
    const refreshed = page.waitForResponse(response => response.url().includes('/api/chats/search') && response.request().method() === 'POST');
    await page.locator('#option_select_chat').click();
    const response = await refreshed;
    expect(response.ok()).toBe(true);
    const data = await response.json();
    const diagnostic = `deleted=${JSON.stringify(name)} current=${JSON.stringify(await page.evaluate(() => window.SillyTavern.getContext().chatId))} search=${JSON.stringify(Object.values(data).map(row => row.file_name))} traffic=${JSON.stringify(traffic)}`;
    expect(Object.values(data).some(row => row.file_name === name || row.file_name === `${name}.jsonl`), diagnostic).toBe(false);
    await expect.poll(() => page.locator('#select_chat_div .select_chat_block').evaluateAll((rows, target) => rows.some(row => row.getAttribute('file_name') === target), name)).toBe(false);
});

test('slash delchat retains the rendered row when refreshing history fails', async ({ page }) => {
    await openCharacterHistory(page, 'Dev Character 003');
    const name = await page.evaluate(() => window.SillyTavern.getContext().chatId);
    await expect(page.locator('#select_chat_div .select_chat_block[highlight="true"]')).toHaveAttribute('file_name', name);
    await page.locator('#select_chat_cross').click();
    await page.route('**/api/chats/search', route => route.fulfill({ status: 503, body: 'unavailable' }));
    const deleted = page.waitForResponse(response => response.url().includes('/api/chats/delete') && response.request().method() === 'POST');
    const result = page.evaluate(async () => {
        const { executeSlashCommandsOnChatInput } = await import('/scripts/slash-commands.js');
        return executeSlashCommandsOnChatInput('/delchat', { clearChatInput: false });
    });
    const response = await deleted;
    expect(response.ok()).toBe(true);
    expect(response.request().postDataJSON().chatfile).toBe(`${name}.jsonl`);
    await result;
});

test('slash delchat does not delete when the refreshed history has no selected row', async ({ page }) => {
    await openCharacterHistory(page, 'Dev Character 001');
    await page.locator('#select_chat_cross').click();
    await page.route('**/api/chats/search', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    let deletes = 0;
    page.on('request', request => { if (request.url().includes('/api/chats/delete')) deletes++; });
    await page.evaluate(async () => {
        const { executeSlashCommandsOnChatInput } = await import('/scripts/slash-commands.js');
        await executeSlashCommandsOnChatInput('/delchat', { clearChatInput: false });
    });
    expect(deletes).toBe(0);
    await expect(page.locator('#select_chat_div .select_chat_block')).toHaveCount(0);
    await expect(page.locator('#toast-container .toast-error')).toBeVisible();
});


test('workspace bundle loading failure leaves startup on the splash screen', async ({ page }) => {
    await testSetup.awaitST({ page });
    let requests = 0;
    await page.route('**/react/login/assets/workspace-panels.js?*', route => { requests++; return route.abort('failed'); });
    await page.reload();
    await expect.poll(() => requests).toBeGreaterThan(0);
    await expect(page.getByText('Initializing…')).toBeVisible();
    await expect(page.locator('#preloader')).toHaveCount(1);
    await page.unroute('**/react/login/assets/workspace-panels.js?*');
    await page.reload();
    await testSetup.awaitST({ page });
    await expect(page.locator('#preloader')).toHaveCount(0);
});

test('history imports a supported JSON chat through the real endpoint', async ({ page }) => {
    await openCharacterHistory(page, 'Dev Character 002');
    const response = page.waitForResponse(r => r.url().includes('/api/chats/import') && r.request().method() === 'POST');
    await page.locator('#chat_import_file').setInputFiles({
        name: 'ooba.JSON', mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify({ data_visible: [['attempt16 JSON user', 'attempt16 JSON reply']] })),
    });
    const result = await (await response).json();
    expect(result.res).toBe(true);
    expect(result.fileNames).toHaveLength(1);
    await expect(page.locator('#chat_import_file')).toHaveValue('');
    await expect.poll(() => page.locator('#select_chat_div .select_chat_block').evaluateAll((rows, name) => rows.some(row => row.getAttribute('file_name') === name.replace(/\.jsonl$/, '')), result.fileNames[0])).toBe(true);
    const imported = page.locator('#select_chat_div .select_chat_block').filter({ hasText: 'attempt16 JSON reply' });
    await expect(imported).toBeVisible();
});

test('history imports multiple files sequentially and skips unsupported extensions', async ({ page }) => {
    await openCharacterHistory(page);
    const requests = [];
    await page.route('**/api/chats/import', async route => {
        const body = route.request().postDataBuffer().toString('utf8');
        requests.push(body);
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ res: true, fileNames: [] }) });
    });
    await page.locator('#chat_import_file').setInputFiles([
        { name: 'one.JSON', mimeType: 'application/json', buffer: Buffer.from('{"one":1}') },
        { name: 'ignored.txt', mimeType: 'text/plain', buffer: Buffer.from('ignored') },
        { name: 'two.JSONL', mimeType: 'application/json', buffer: Buffer.from('{"two":2}') },
    ]);
    await expect.poll(() => requests.length).toBe(2);
    await expect(page.locator('#chat_import_file')).toHaveValue('');
    expect(requests[0]).toMatch(/filename="one\.JSON"/);
    expect(requests[0]).toMatch(/name="file_type"\r\n\r\njson\r\n/);
    expect(requests[1]).toMatch(/filename="two\.JSONL"/);
    expect(requests[1]).toMatch(/name="file_type"\r\n\r\njsonl\r\n/);
    const ids = requests.map(body => body.match(/name="operationId"\r\n\r\n([^\r]+)/)?.[1]);
    expect(ids.every(id => /^[A-Za-z0-9_-]{1,128}$/.test(id))).toBe(true);
    expect(ids[0]).not.toBe(ids[1]);
    expect(requests.join('')).not.toContain('ignored.txt');
    await expect(page.locator('#toast-container .toast-warning')).toBeVisible();
});

test('history import handles HTTP failure as an empty result and clears the file input', async ({ page }) => {
    await openCharacterHistory(page);
    let requests = 0;
    await page.route('**/api/chats/import', async route => {
        requests++;
        await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":true}' });
    });
    await page.locator('#chat_import_file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
    await expect.poll(() => requests).toBe(2);
    await expect(page.locator('#chat_import_file')).toHaveValue('');
    await expect(page.locator('#toast-container .toast-success')).toHaveCount(0);
    await expect(page.locator('#toast-container .toast-error')).toContainText('click to retry');
});

test('history import network rejection reports failures and continues independent files', async ({ page }) => {
    await openCharacterHistory(page);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let requests = 0;
    await page.route('**/api/chats/import', async route => {
        requests++;
        await route.abort('failed');
    });
    await page.locator('#chat_import_file').setInputFiles([
        { name: 'fails.json', mimeType: 'application/json', buffer: Buffer.from('{}') },
        { name: 'unreached.jsonl', mimeType: 'application/json', buffer: Buffer.from('{}') },
    ]);
    await expect.poll(() => requests).toBe(4);
    await expect(page.locator('#chat_import_file')).toHaveValue('');
    await expect(page.locator('#toast-container .toast-error')).toHaveCount(2);
    expect(errors).toEqual([]);
});

test('history import retries a committed upload with the same operation id', async ({ page }) => {
    await openCharacterHistory(page, 'Dev Character 002');
    const ids = [];
    await page.route('**/api/chats/import', async route => {
        const body = route.request().postDataBuffer().toString('utf8');
        ids.push(body.match(/name="operationId"\r\n\r\n([^\r]+)/)?.[1]);
        if (ids.length === 1) {
            const response = await route.fetch();
            expect((await response.json()).res).toBe(true);
            await route.abort('failed');
        } else {
            await route.continue();
        }
    });
    await page.locator('#chat_import_file').setInputFiles({
        name: 'retry.json', mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify({ data_visible: [['retry user', 'retry unique reply']] })),
    });
    await expect.poll(() => ids.length).toBe(2);
    expect(ids[0]).toMatch(/^[A-Za-z0-9_-]{1,128}$/);
    expect(ids[1]).toBe(ids[0]);
    await expect(page.locator('#select_chat_div .select_chat_block').filter({ hasText: 'retry unique reply' })).toHaveCount(1);
});

test('partial import failure offers a retry with the same operation id', async ({ page }) => {
    await openCharacterHistory(page);
    const ids = [];
    await page.route('**/api/chats/import', async route => {
        ids.push(route.request().postDataBuffer().toString('utf8').match(/name="operationId"\r\n\r\n([^\r]+)/)?.[1]);
        const body = ids.length === 1
            ? { error: 'chat_conflict', completed: ['first.jsonl'] }
            : { res: true, fileNames: ['first.jsonl', 'second.jsonl'] };
        await route.fulfill({ status: ids.length === 1 ? 409 : 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.locator('#chat_import_file').setInputFiles({ name: 'multi.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
    const warning = page.locator('#toast-container .toast-error');
    await expect(warning).toContainText('1 chat(s) confirmed imported');
    await expect(warning).toContainText('multi.json');
    await page.locator('#select_chat_cross').click();
    await warning.click();
    await expect.poll(() => ids.length).toBe(2);
    expect(ids[1]).toBe(ids[0]);
    await expect(page.locator('#toast-container .toast-success')).toContainText('2 chat(s)');
});

test('history drop invokes the import command without a synthetic change event', async ({ page }) => {
    await openCharacterHistory(page);
    const bodies = [];
    await page.route('**/api/chats/import', async route => {
        bodies.push(route.request().postDataBuffer().toString('utf8'));
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ res: true, fileNames: [] }) });
    });
    await page.evaluate(() => {
        window.__historySyntheticChanges = 0;
        window.$('#chat_import_file').on('change.attempt16', event => {
            if (event.isTrigger) window.__historySyntheticChanges++;
        });
        const transfer = new DataTransfer();
        transfer.items.add(new File(['{"data_visible":[]}'], 'dropped.json', { type: 'application/json' }));
        document.querySelector('#select_chat_popup').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    });
    await expect.poll(() => bodies.length).toBe(1);
    await expect(page.locator('#chat_import_file')).toHaveValue('');
    expect(bodies[0]).toMatch(/filename="dropped\.json"/);
    expect(await page.evaluate(() => window.__historySyntheticChanges)).toBe(0);
});

test('history import accepts a synthetic change for compatibility', async ({ page }) => {
    await openCharacterHistory(page);
    const bodies = [];
    await page.route('**/api/chats/import', async route => {
        bodies.push(route.request().postDataBuffer().toString('utf8'));
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ res: true, fileNames: [] }) });
    });
    await page.evaluate(() => {
        const transfer = new DataTransfer();
        transfer.items.add(new File(['{}'], 'synthetic.json', { type: 'application/json' }));
        const input = document.querySelector('#chat_import_file');
        input.files = transfer.files;
        window.$(input).trigger('change');
    });
    await expect.poll(() => bodies.length).toBe(1);
    await expect(page.locator('#chat_import_file')).toHaveValue('');
    expect(bodies[0]).toMatch(/filename="synthetic\.json"/);
});

test('options synthetic click toggles exactly once', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.evaluate(() => window.$('#options_button').trigger('click'));
    await expect(page.locator('#options')).toBeVisible();
    await expect(page.locator('#options_button')).toHaveAttribute('aria-expanded', 'true');
    await page.evaluate(() => window.$('#options_button').trigger('click'));
    await expect(page.locator('#options')).toBeHidden();
    await expect(page.locator('#options_button')).toHaveAttribute('aria-expanded', 'false');
});

test('history synthetic import click opens a single chooser', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.evaluate(async () => {
        const context = window.SillyTavern.getContext();
        await context.selectCharacterById(context.characters.findIndex(character => character.name === 'Dev Character 001'));
    });
    await page.locator('#options_button').click();
    await page.locator('#option_select_chat').click();
    let choosers = 0;
    page.on('filechooser', () => { choosers++; });
    const chooser = page.waitForEvent('filechooser');
    await page.evaluate(() => window.$('#chat_import_button').trigger('click'));
    await chooser;
    await page.waitForTimeout(100);
    expect(choosers).toBe(1);
});

test('options menu closes on outside click and Escape restores focus', async ({ page }) => {
    await testSetup.awaitST({ page });
    const button = page.locator('#options_button');
    const menu = page.locator('#options');
    await button.click();
    await expect(menu).toBeVisible();
    await page.mouse.click(2, 2);
    await expect(menu).toBeHidden();
    await button.click();
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(button).toBeFocused();
});

test('history closes with Escape and restores focus to options', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.evaluate(async () => {
        const context = window.SillyTavern.getContext();
        await context.selectCharacterById(context.characters.findIndex(character => character.name === 'Dev Character 001'));
    });
    await page.locator('#options_button').click();
    await page.locator('#option_select_chat').click();
    await expect(page.locator('#shadow_select_chat_popup')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#shadow_select_chat_popup')).toBeHidden();
    await expect(page.locator('#options_button')).toBeFocused();
});

test('history synthetic jQuery close stays compatible', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.evaluate(async () => {
        const context = window.SillyTavern.getContext();
        await context.selectCharacterById(context.characters.findIndex(character => character.name === 'Dev Character 001'));
    });
    await page.locator('#options_button').click();
    await page.locator('#option_select_chat').click();
    await expect(page.locator('#shadow_select_chat_popup')).toBeVisible();
    await page.evaluate(() => window.$('#select_chat_cross').trigger('click'));
    await expect(page.locator('#shadow_select_chat_popup')).toBeHidden();
    await expect(page.locator('#options_button')).toBeFocused();
});

test('history backdrop interaction preserves current close behavior', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.evaluate(async () => {
        const context = window.SillyTavern.getContext();
        await context.selectCharacterById(context.characters.findIndex(character => character.name === 'Dev Character 001'));
    });
    await page.locator('#options_button').click();
    await page.locator('#option_select_chat').click();
    const dialog = page.locator('#shadow_select_chat_popup');
    await expect(dialog).toBeVisible();
    await page.mouse.click(2, 2);
    await expect(dialog).toBeVisible();
    await page.locator('#select_chat_cross').click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('#options_button')).toBeFocused();
});

test('legacy presentation fallback remains usable without the mounted presentation', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.evaluate(async () => {
        const { callPopup } = await import('/script.js');
        window.__savedPresentation = window.__emberDeskDialoguePresentation;
        window.__emberDeskDialoguePresentation = undefined;
        window.__fallbackResult = 'pending';
        callPopup('<b id="fallback-proof">Fallback</b>', 'confirm').then(value => { window.__fallbackResult = value; });
    });
    await expect(page.locator('#fallback-proof')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => window.__fallbackResult)).toBe(false);
    await expect(page.locator('#shadow_popup')).toBeHidden();
    await page.evaluate(() => { window.__emberDeskDialoguePresentation = window.__savedPresentation; });
});

test('the exported context dialogue adapter resolves without its controller bridge', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.evaluate(() => {
        window.__savedDialogueController = window.__emberDeskDialogueController;
        window.__emberDeskDialogueController = undefined;
        window.__contextDialogueResult = 'pending';
        window.SillyTavern.getContext().callPopup('Compatibility confirmation', 'confirm').then(value => { window.__contextDialogueResult = value; });
    });
    await expect(page.locator('#shadow_popup')).toBeVisible();
    await page.locator('#dialogue_popup_ok').click();
    await expect.poll(() => page.evaluate(() => window.__contextDialogueResult)).toBe(true);
    await expect(page.locator('#shadow_popup')).toBeHidden();
    await page.evaluate(() => {
        window.__contextDialogueResult = 'pending';
        window.SillyTavern.getContext().callPopup('Type a value', 'input', 'initial').then(value => { window.__contextDialogueResult = value; });
    });
    await page.locator('#dialogue_popup_input').fill('edited');
    await page.locator('#dialogue_popup_ok').click();
    await expect.poll(() => page.evaluate(() => window.__contextDialogueResult)).toBe('edited');
    await page.evaluate(() => { window.__emberDeskDialogueController = window.__savedDialogueController; });
});

test('dialogue input receives focus and Escape cancels', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.evaluate(async () => {
        const { callPopup } = await import('/script.js');
        window.__escapeResult = 'pending';
        callPopup('Type a value', 'input', 'initial').then(value => { window.__escapeResult = value; });
    });
    await expect(page.locator('#dialogue_popup_input')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => window.__escapeResult)).toBe(false);
    await expect(page.locator('#shadow_popup')).toBeHidden();
});

test('character export popup dismisses on Escape and outside pointer', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '角色库' }).click();
    await page.locator('#emberdesk-react-character-search').fill('Dev Character 001');
    await page.locator('#rm_print_characters_block .character_select').filter({ hasText: 'Dev Character 001' }).first().click();
    const trigger = page.locator('[data-react-authoring-owner="characterAuthoring"] [data-character-export-trigger]');
    const popup = page.locator('#export_format_popup');
    await trigger.click();
    await expect(popup).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(popup).toBeHidden();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(popup).toBeVisible();
    await page.mouse.click(2, 2);
    await expect(popup).toBeHidden();
});

test('character JSON export produces an actual download', async ({ page }) => {
    await testSetup.awaitST({ page });
    const panelButton = page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '角色库' });
    await panelButton.click();
    await expect(panelButton).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#emberdesk-react-character-search').fill('Dev Character 001');
    const row = page.locator('#rm_print_characters_block .character_select').filter({ hasText: 'Dev Character 001' }).first();
    await row.click();
    const authoring = page.locator('[data-react-authoring-owner="characterAuthoring"]');
    await expect(authoring).toBeVisible();
    await authoring.locator('[data-character-export-trigger]').click();
    const popup = page.locator('#export_format_popup');
    await expect(popup).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await popup.locator('.export_format[data-format="json"]').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.json$/);
    expect(await download.failure()).toBeNull();
    const content = JSON.parse(await readFile(await download.path(), 'utf8'));
    expect(content.data?.name ?? content.name).toBe('Dev Character 001');
});

test('character export reports an HTTP failure without starting a download', async ({ page }) => {
    await testSetup.awaitST({ page });
    const panelButton = page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '角色库' });
    await panelButton.click();
    await page.locator('#emberdesk-react-character-search').fill('Dev Character 001');
    await page.locator('#rm_print_characters_block .character_select').filter({ hasText: 'Dev Character 001' }).first().click();
    const authoring = page.locator('[data-react-authoring-owner="characterAuthoring"]');
    await expect(authoring).toBeVisible();
    await page.route('**/api/characters/export', route => route.fulfill({ status: 503, body: 'unavailable' }));
    let downloads = 0;
    page.on('download', () => { downloads++; });
    await authoring.locator('[data-character-export-trigger]').click();
    const response = page.waitForResponse(r => r.url().includes('/api/characters/export') && r.request().method() === 'POST');
    await page.locator('#export_format_popup .export_format[data-format="json"]').click();
    expect((await response).status()).toBe(503);
    await expect(page.locator('#toast-container .toast-error')).toBeVisible();
    expect(downloads).toBe(0);
});

test('history import opens a native file picker and imports an exported JSONL chat', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.evaluate(async () => {
        const context = window.SillyTavern.getContext();
        await context.selectCharacterById(context.characters.findIndex(character => character.name === 'Dev Character 001'));
    });
    await page.locator('#options_button').click();
    await page.locator('#option_select_chat').click();
    const row = page.locator('#select_chat_div .select_chat_block').first();
    await expect(row).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await row.locator('.exportRawChatButton').click();
    const download = await downloadPromise;
    const contents = await readFile(await download.path());
    const chooserPromise = page.waitForEvent('filechooser');
    await page.locator('#chat_import_button').click();
    const chooser = await chooserPromise;
    const responsePromise = page.waitForResponse(response => response.url().includes('/api/chats/import') && response.request().method() === 'POST');
    await chooser.setFiles({ name: 'roundtrip.jsonl', mimeType: 'application/json', buffer: contents });
    expect((await responsePromise).ok()).toBe(true);
    await expect(page.locator('#chat_import_file')).toHaveValue('');
});

test('history JSONL export produces an actual download', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.evaluate(async () => {
        const context = window.SillyTavern.getContext();
        await context.selectCharacterById(context.characters.findIndex(character => character.name === 'Dev Character 001'));
    });
    await page.locator('#options_button').click();
    await page.locator('#option_select_chat').click();
    const row = page.locator('#select_chat_div .select_chat_block').first();
    await expect(row).toBeVisible();
    const fileName = await row.getAttribute('file_name');
    const downloadPromise = page.waitForEvent('download');
    await row.locator('.exportRawChatButton').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(`${fileName}.jsonl`);
    expect(await download.failure()).toBeNull();
    const content = await readFile(await download.path(), 'utf8');
    expect(content.trim().split('\n').length).toBeGreaterThan(0);
    expect(() => JSON.parse(content.trim().split('\n')[0])).not.toThrow();
});

test('history delete confirms and reopens after a delete request', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.evaluate(async () => {
        const context = window.SillyTavern.getContext();
        await context.selectCharacterById(context.characters.findIndex(character => character.name === 'Dev Character 001'));
    });
    await page.locator('#options_button').click();
    await page.locator('#option_select_chat').click();
    const row = page.locator('#select_chat_div .select_chat_block').first();
    await expect(row).toBeVisible();
    const filename = await row.getAttribute('file_name');
    let requests = 0;
    await page.route('**/api/chats/delete', async route => { requests++; await route.fulfill({ status: 503 }); });
    await row.locator('.PastChat_cross').click();
    const confirm = page.locator('dialog[open]').filter({ has: page.locator('.chat-file-name') });
    await expect(confirm.locator('.chat-file-name')).toHaveText(filename);
    await confirm.locator('.popup-button-cancel').click();
    expect(requests).toBe(0);
    await row.locator('.PastChat_cross').click();
    await confirm.locator('.popup-button-ok').click();
    await expect.poll(() => requests).toBe(1);
    await expect(page.locator('#shadow_select_chat_popup')).toBeHidden();
    await expect(page.locator('#shadow_select_chat_popup')).toBeVisible({ timeout: 6000 });
});

test('dialogue content preserves HTML, DOM and jQuery inputs across a close and reopen', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.evaluate(async () => {
        const { callPopup } = await import('/script.js');
        window.__dialogueResults = [];
        callPopup('<strong id="dialogue-html-proof">HTML</strong>', 'confirm').then(value => window.__dialogueResults.push(value));
    });
    await expect(page.locator('#dialogue-html-proof')).toHaveText('HTML');
    await page.evaluate(async () => {
        const { callPopup } = await import('/script.js');
        document.querySelector('#dialogue_popup_cancel').click();
        const node = document.createElement('button');
        node.id = 'dialogue-node-proof';
        node.textContent = 'DOM';
        node.addEventListener('click', () => { window.__dialogueNodeClicked = true; });
        window.__dialogueNode = node;
        callPopup(node, 'confirm').then(value => window.__dialogueResults.push(value));
    });
    await expect(page.locator('#shadow_popup')).toBeVisible();
    await expect(page.locator('#dialogue-node-proof')).toBeVisible();
    await page.locator('#dialogue-node-proof').click();
    expect(await page.evaluate(() => document.querySelector('#dialogue-node-proof') === window.__dialogueNode && window.__dialogueNodeClicked)).toBe(true);
    await page.waitForTimeout(700);
    await expect(page.locator('#shadow_popup')).toBeVisible();
    await page.evaluate(async () => {
        const { callPopup } = await import('/script.js');
        document.querySelector('#dialogue_popup_ok').click();
        const node = document.createElement('span');
        node.id = 'dialogue-jquery-proof';
        node.textContent = 'jQuery';
        window.__dialogueJqueryNode = node;
        callPopup(window.$(node), 'confirm').then(value => window.__dialogueResults.push(value));
    });
    await expect(page.locator('#dialogue-jquery-proof')).toHaveText('jQuery');
    expect(await page.evaluate(() => document.querySelector('#dialogue-jquery-proof') === window.__dialogueJqueryNode)).toBe(true);
    await page.locator('#dialogue_popup_cancel').click();
    await expect.poll(() => page.evaluate(() => window.__dialogueResults)).toEqual([false, true, false]);
    await expect(page.locator('#shadow_popup')).toBeHidden();
});

test('synthetic dialogue buttons resolve the mounted controller', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.evaluate(async () => {
        const { callPopup } = await import('/script.js');
        window.__syntheticDialogueResult = 'pending';
        callPopup('Confirm', 'confirm').then(value => { window.__syntheticDialogueResult = value; });
    });
    await expect(page.locator('#dialogue_popup_ok')).toBeVisible();
    await page.evaluate(() => window.$('#dialogue_popup_ok').trigger('click'));
    await expect.poll(() => page.evaluate(() => window.__syntheticDialogueResult)).toBe(true);

    await page.evaluate(async () => {
        const { callPopup } = await import('/script.js');
        window.__syntheticDialogueResult = 'pending';
        callPopup('Confirm', 'confirm').then(value => { window.__syntheticDialogueResult = value; });
    });
    await expect(page.locator('#dialogue_popup_cancel')).toBeVisible();
    await page.evaluate(() => window.$('#dialogue_popup_cancel').trigger('click'));
    await expect.poll(() => page.evaluate(() => window.__syntheticDialogueResult)).toBe(false);
});

test('legacy popup commands resolve typed input and cancel results', async ({ page }) => {
    await testSetup.awaitST({ page });

    await page.evaluate(async () => {
        const { callPopup } = await import('/script.js');
        window.__dialogueTestResult = 'pending';
        callPopup('Type a value', 'input', 'initial').then(value => { window.__dialogueTestResult = value; });
    });
    await expect(page.locator('#dialogue_popup_input')).toBeVisible();
    await page.locator('#dialogue_popup_input').fill('edited');
    await page.locator('#dialogue_popup_ok').click();
    await expect.poll(() => page.evaluate(() => window.__dialogueTestResult)).toBe('edited');
    await page.evaluate(async () => {
        const { callPopup } = await import('/script.js');
        window.__dialogueTestResult = 'pending';
        callPopup('Confirm', 'confirm').then(value => { window.__dialogueTestResult = value; });
    });
    await page.locator('#dialogue_popup_cancel').click();
    await expect.poll(() => page.evaluate(() => window.__dialogueTestResult)).toBe(false);
});

test('history search owns its input and recovers from no matches', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.evaluate(async () => {
        const context = window.SillyTavern.getContext();
        await context.selectCharacterById(context.characters.findIndex(character => character.name === 'Dev Character 001'));
    });
    await page.locator('#options_button').click();
    await page.locator('#option_select_chat').click();
    await expect(page.locator('#shadow_select_chat_popup')).toBeVisible();
    const search = page.locator('#select_chat_search');
    await search.fill('no-match-u004-34567');
    await expect(page.locator('#select_chat_empty')).toBeVisible();
    await page.locator('#select_chat_empty button').click();
    await expect(search).toHaveValue('');
    const firstRow = page.locator('#select_chat_div .select_chat_block').first();
    await expect(firstRow).toBeVisible();
    const fileName = await firstRow.getAttribute('file_name');
    await page.evaluate(async name => {
        const { displayPastChats } = await import('/script.js');
        await displayPastChats([name]);
    }, fileName);
    await expect(firstRow.locator('..')).toHaveClass(/\bflash\b/);
    await page.locator('#select_chat_cross').click();
    await expect(page.locator('#shadow_select_chat_popup')).toBeHidden();
});

test('history new chat action creates a chat and closes the popup', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.evaluate(async () => {
        const context = window.SillyTavern.getContext();
        await context.selectCharacterById(context.characters.findIndex(character => character.name === 'Dev Character 001'));
    });
    const before = await page.evaluate(() => window.SillyTavern.getContext().chatId);
    await page.locator('#options_button').click();
    await page.locator('#option_select_chat').click();
    await expect(page.locator('#shadow_select_chat_popup')).toBeVisible();
    await page.locator('#newChatFromManageScreenButton').click();
    await expect(page.locator('#shadow_select_chat_popup')).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.SillyTavern.getContext().chatId)).not.toBe(before);
});

test('history synthetic new chat command stays compatible', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.evaluate(async () => {
        const context = window.SillyTavern.getContext();
        await context.selectCharacterById(context.characters.findIndex(character => character.name === 'Dev Character 002'));
    });
    const before = await page.evaluate(() => window.SillyTavern.getContext().chatId);
    await page.locator('#options_button').click();
    await page.locator('#option_select_chat').click();
    await expect(page.locator('#shadow_select_chat_popup')).toBeVisible();
    await page.evaluate(() => window.$('#newChatFromManageScreenButton').trigger('click'));
    await expect(page.locator('#shadow_select_chat_popup')).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.SillyTavern.getContext().chatId)).not.toBe(before);
});
