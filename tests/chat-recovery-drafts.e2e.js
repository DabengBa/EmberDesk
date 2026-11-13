import { test, expect } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';
import { readFile } from 'node:fs/promises';

test('a stale ordinary save preserves local edits for recovery after reload', async ({ page, context }) => {
    await testSetup.awaitST({ page });
    const second = await context.newPage();
    try {
        await second.goto('/');
        await testSetup.awaitST({ page: second });
        const select = tab => tab.evaluate(async () => {
            const state = window.SillyTavern.getContext();
            state.chatCompletionSettings.chat_memory_enabled = false;
            const index = state.characters.findIndex(character => character.name === 'Dev Character 045');
            await state.selectCharacterById(index);
            return { file: state.characters[index].chat, avatar: state.characters[index].avatar };
        });
        const target = await select(page);
        expect(await select(second)).toEqual(target);
        const save = (tab, text) => tab.evaluate(async message => {
            const state = window.SillyTavern.getContext();
            state.chat.push({ name: 'You', is_user: true, is_system: false, mes: message, send_date: Date.now() });
            return await (await import('/scripts/chat-ops-service.js')).saveChat();
        }, text);
        expect(await save(page, 'remote conflict winner 4836')).toBe(true);
        expect(await save(second, 'local conflict recovery 4836')).toBe(false);
        await expect(second.locator('#toast-container')).toContainText(/recovery drafts/i);
        await second.evaluate(() => window.SillyTavern.getContext().chat.push({ name: 'You', is_user: true, mes: 'later local edit 4836' }));
        await second.locator('#send_textarea').fill('later composer text 4836');
        await expect.poll(() => second.evaluate(async () => {
            const storage = (await import('/lib.js')).localforage.createInstance({ name: 'EmberDesk_ChatRecovery' });
            return JSON.stringify(await Promise.all((await storage.keys()).filter(key => key.startsWith('recovery-v1:')).map(key => storage.getItem(key))));
        }), { timeout: 7000 }).toContain('later composer text 4836');
        await second.reload();
        await testSetup.awaitST({ page: second });
        await select(second);
        await second.locator('#options_button').click();
        await second.locator('#option_select_chat').click();
        const draft = second.getByTestId('chat-recovery-drafts').locator('li').filter({ hasText: target.file }).first();
        await expect(draft).toBeVisible();
        const download = second.waitForEvent('download');
        await draft.getByRole('button', { name: /export/i }).click();
        const exported = JSON.parse(await readFile(await (await download).path(), 'utf8'));
        expect(JSON.stringify(exported.snapshot.messages)).toContain('local conflict recovery 4836');
        expect(JSON.stringify(exported.snapshot.messages)).toContain('later local edit 4836');
        expect(exported.snapshot.composer.value).toBe('later composer text 4836');
        const created = second.waitForResponse(response => response.url().endsWith('/api/chats/save') && response.request().postDataJSON().operationId === exported.id);
        await draft.getByRole('button', { name: /restore.*new/i }).click();
        const restored = await created;
        expect(restored.status()).toBe(200);
        expect(JSON.stringify(restored.request().postDataJSON().chat)).toContain('local conflict recovery 4836');
        const restoredChat = await second.evaluate(async ({ avatar, file }) => {
            const { getRequestHeaders } = await import('/script.js');
            const response = await fetch('/api/chats/get', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ avatar_url: avatar, file_name: file }) });
            return await response.json();
        }, { avatar: target.avatar, file: `Recovered-${exported.id}` });
        expect(JSON.stringify(restoredChat)).toContain('local conflict recovery 4836');
        expect(JSON.stringify(restoredChat)).toContain('later local edit 4836');
        const remote = await page.evaluate(async identity => {
            const { getRequestHeaders } = await import('/script.js');
            const response = await fetch('/api/chats/get', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ avatar_url: identity.avatar, file_name: identity.file }) });
            return await response.json();
        }, target);
        expect(JSON.stringify(remote)).toContain('remote conflict winner 4836');
        expect(JSON.stringify(remote)).not.toContain('local conflict recovery 4836');
    } finally { await second.close(); }
});

test('a delayed ordinary save conflict checkpoints edits before allowing a chat switch', async ({ page, context }) => {
    await testSetup.awaitST({ page });
    const second = await context.newPage();
    try {
        await second.goto('/');
        await testSetup.awaitST({ page: second });
        const select = (tab, characterName) => tab.evaluate(async name => {
            const state = window.SillyTavern.getContext();
            state.chatCompletionSettings.chat_memory_enabled = false;
            const index = state.characters.findIndex(character => character.name === name);
            await state.selectCharacterById(index);
            return { avatar: state.characters[index].avatar, file: state.characters[index].chat };
        }, characterName);
        const target = await select(page, 'Dev Character 043');
        expect(await select(second, 'Dev Character 043')).toEqual(target);
        await page.evaluate(async () => {
            window.SillyTavern.getContext().chat.push({ name: 'You', is_user: true, mes: 'remote winner 8264' });
            await (await import('/scripts/chat-ops-service.js')).saveChat();
        });

        let release, responseReady;
        const releaseResponse = new Promise(resolve => { release = resolve; });
        const ready = new Promise(resolve => { responseReady = resolve; });
        await second.route('**/api/chats/save', async route => {
            const response = await route.fetch();
            if (response.status() === 409) {
                responseReady();
                await releaseResponse;
            }
            await route.fulfill({ response });
        });

        await second.evaluate(async () => {
            const state = window.SillyTavern.getContext();
            state.chat.push({ name: 'You', is_user: true, mes: 'edit before conflict response 8264' });
            window.saveOutcome = (await import('/scripts/chat-ops-service.js')).saveChat();
        });
        await ready;
        await second.evaluate(() => {
            window.SillyTavern.getContext().chat.push({ name: 'You', is_user: true, mes: 'edit during delayed conflict 8264' });
        });
        await second.locator('#send_textarea').fill('composer during delayed conflict 8264');
        await second.evaluate(() => {
            const state = window.SillyTavern.getContext();
            const next = state.characters.findIndex(character => character.name === 'Dev Character 042');
            window.switchFinished = false;
            window.switchOutcome = state.selectCharacterById(next).then(() => 'switched', () => 'blocked').finally(() => { window.switchFinished = true; });
        });
        try {
            expect(await second.evaluate(() => window.switchOutcome)).toBe('blocked');
            expect(await second.evaluate(() => {
                const state = window.SillyTavern.getContext();
                return state.characters[state.characterId]?.avatar;
            })).toBe(target.avatar);
        } finally { release(); }

        expect(await second.evaluate(() => window.saveOutcome)).toBe(false);
        await select(second, 'Dev Character 042');
        expect(await second.evaluate(() => {
            const state = window.SillyTavern.getContext();
            return state.characters[state.characterId].name;
        })).toBe('Dev Character 042');
        const drafts = await second.evaluate(async () => {
            const storage = (await import('/lib.js')).localforage.createInstance({ name: 'EmberDesk_ChatRecovery' });
            return Promise.all((await storage.keys()).filter(key => key.startsWith('recovery-v1:')).map(key => storage.getItem(key)));
        });
        const draft = drafts.find(item => item.identity.avatar === target.avatar && item.identity.chat === target.file
            && JSON.stringify(item.snapshot.messages).includes('edit during delayed conflict 8264'));
        expect(draft).toBeTruthy();
        expect(JSON.stringify(draft.snapshot.messages)).toContain('edit before conflict response 8264');
        expect(JSON.stringify(draft.snapshot.messages)).toContain('edit during delayed conflict 8264');
        expect(draft.snapshot.composer.value).toBe('composer during delayed conflict 8264');
    } finally { await second.unroute('**/api/chats/save'); await second.close(); }
});

test('character library publication cannot discard edits while a save conflict is pending', async ({ page, context }) => {
    await testSetup.awaitST({ page });
    const other = await context.newPage();
    try {
        await other.goto('/');
        await testSetup.awaitST({ page: other });
        const select = tab => tab.evaluate(async () => {
            const state = window.SillyTavern.getContext();
            state.chatCompletionSettings.chat_memory_enabled = false;
            const index = state.characters.findIndex(character => character.name === 'Dev Character 040');
            await state.selectCharacterById(index);
            return { avatar: state.characters[index].avatar, chat: state.characters[index].chat };
        });
        const identity = await select(page);
        await select(other);
        await other.evaluate(async () => {
            window.SillyTavern.getContext().chat.push({ name: 'You', is_user: true, mes: 'library remote winner 1493' });
            await (await import('/scripts/chat-ops-service.js')).saveChat();
        });
        let release, ready;
        const gate = new Promise(resolve => { release = resolve; });
        const responseReady = new Promise(resolve => { ready = resolve; });
        await page.route('**/api/chats/save', async route => {
            const response = await route.fetch();
            if (response.status() === 409) { ready(); await gate; }
            await route.fulfill({ response });
        });
        await page.evaluate(async () => {
            const state = window.SillyTavern.getContext();
            state.chat.push({ name: 'You', is_user: true, mes: 'library edit before 1493' });
            window.librarySave = (await import('/scripts/chat-ops-service.js')).saveChat();
        });
        await responseReady;
        await page.evaluate(async () => {
            const state = window.SillyTavern.getContext();
            state.chat.push({ name: 'You', is_user: true, mes: 'library late edit 1493' });
            const snapshot = structuredClone(state.characters);
            snapshot.find(character => character.name === 'Dev Character 039').name += ' changed';
            window.libraryPublication = (await import('/script.js')).publishCharacterLibrarySnapshot(snapshot);
        });
        release();
        await page.evaluate(async () => { await window.librarySave; await window.libraryPublication; });
        const drafts = await page.evaluate(async () => {
            const storage = (await import('/lib.js')).localforage.createInstance({ name: 'EmberDesk_ChatRecovery' });
            return Promise.all((await storage.keys()).filter(key => key.startsWith('recovery-v1:')).map(key => storage.getItem(key)));
        });
        expect(drafts.some(draft => draft.identity.avatar === identity.avatar && draft.identity.chat === identity.chat
            && JSON.stringify(draft.snapshot.messages).includes('library late edit 1493'))).toBe(true);
    } finally {
        await page.unroute('**/api/chats/save');
        await other.close();
    }
});

test('an in-flight save blocks character creation, rename, and missing-library reload', async ({ page }) => {
    await testSetup.awaitST({ page });
    const identity = await page.evaluate(async () => {
        const state = window.SillyTavern.getContext();
        state.chatCompletionSettings.chat_memory_enabled = false;
        const index = state.characters.findIndex(character => character.name === 'Dev Character 035');
        await state.selectCharacterById(index);
        return state.characters[index].avatar;
    });
    let release, entered;
    const gate = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { entered = resolve; });
    let characterWrites = 0;
    await page.route('**/api/characters/{create,rename}', route => { characterWrites++; return route.continue(); });
    await page.route('**/api/chats/save', async route => {
        const response = await route.fetch();
        entered();
        await gate;
        await route.fulfill({ response });
    });
    try {
        await page.evaluate(async () => {
            window.SillyTavern.getContext().chat.push({ name: 'You', is_user: true, mes: 'pending transition edit 7284' });
            window.transitionSave = (await import('/scripts/chat-ops-service.js')).saveChat();
        });
        await started;
        const result = await page.evaluate(async avatar => {
            const state = window.SillyTavern.getContext();
            const lifecycle = await import('/scripts/character-lifecycle-service.js');
            const rename = await lifecycle.renameCharacter('Blocked rename 035', { silent: true, renameChats: false });
            const form = document.querySelector('#form_create');
            const originalMode = form.getAttribute('actiontype');
            form.setAttribute('actiontype', 'create');
            const create = await lifecycle.saveCharacterAuthoringFromPayload({ fields: { name: 'Blocked create 035' } });
            form.setAttribute('actiontype', originalMode);
            const library = await (await import('/script.js')).publishCharacterLibrarySnapshot(structuredClone(state.characters).filter(character => character.avatar !== avatar));
            return { rename, create: create.ok, library, current: state.characters[state.characterId]?.avatar, messages: state.chat.map(message => message.mes) };
        }, identity);
        expect(result.rename).toBe(false);
        expect(result.create).toBe(false);
        expect(result.library).toBe(false);
        expect(result.current).toBe(identity);
        expect(result.messages).toContain('pending transition edit 7284');
        expect(characterWrites).toBe(0);
    } finally {
        release();
        await page.evaluate(() => window.transitionSave);
        await page.unroute('**/api/chats/save');
        await page.unroute('**/api/characters/{create,rename}');
    }
});

test('a missing character library entry preserves an unconfirmed chat before reload', async ({ page }) => {
    await testSetup.awaitST({ page });
    const identity = await page.evaluate(async () => {
        const state = window.SillyTavern.getContext();
        state.chatCompletionSettings.chat_memory_enabled = false;
        const index = state.characters.findIndex(character => character.name === 'Dev Character 036');
        await state.selectCharacterById(index);
        return { avatar: state.characters[index].avatar, chat: state.characters[index].chat };
    });
    await page.route('**/api/chats/save', route => route.abort('failed'));
    await page.evaluate(() => window.SillyTavern.getContext().chat.push({ name: 'You', is_user: true, mes: 'missing character edit 7283' }));
    await page.locator('#send_textarea').fill('missing character composer 7283');
    expect(await page.evaluate(async () => (await import('/scripts/chat-ops-service.js')).saveChat())).toBe(false);
    await page.unroute('**/api/chats/save');
    await page.evaluate(async avatar => {
        const state = window.SillyTavern.getContext();
        window.missingLibrary = (await import('/script.js')).publishCharacterLibrarySnapshot(structuredClone(state.characters).filter(character => character.avatar !== avatar));
    }, identity.avatar);
    const dialog = page.locator('dialog[open]');
    await expect(dialog).toBeVisible();
    const navigation = page.waitForEvent('load');
    await dialog.locator('.popup-button-ok').click();
    await navigation;
    await testSetup.awaitST({ page });
    const drafts = await page.evaluate(async () => {
        const storage = (await import('/lib.js')).localforage.createInstance({ name: 'EmberDesk_ChatRecovery' });
        return Promise.all((await storage.keys()).filter(key => key.startsWith('recovery-v1:')).map(key => storage.getItem(key)));
    });
    const draft = drafts.find(item => item.identity.avatar === identity.avatar && item.identity.chat === identity.chat);
    expect(JSON.stringify(draft?.snapshot.messages)).toContain('missing character edit 7283');
    expect(draft?.snapshot.composer.value).toBe('missing character composer 7283');
});

for (const action of ['create', 'rename']) {
    test(`${action} preserves edits made after a confirmed save while the character request waits`, async ({ page }) => {
        await testSetup.awaitST({ page });
        const identity = await page.evaluate(async action => {
            const state = window.SillyTavern.getContext();
            state.chatCompletionSettings.chat_memory_enabled = false;
            const index = state.characters.findIndex(character => character.name === (action === 'create' ? 'Dev Character 032' : 'Dev Character 033'));
            await state.selectCharacterById(index);
            return { avatar: state.characters[index].avatar, chat: state.characters[index].chat };
        }, action);
        let release, entered;
        const gate = new Promise(resolve => { release = resolve; });
        const started = new Promise(resolve => { entered = resolve; });
        const endpoint = `**/api/characters/${action}`;
        await page.route(endpoint, async route => { entered(); await gate; await route.continue(); });
        try {
            await page.evaluate(async action => {
                const lifecycle = await import('/scripts/character-lifecycle-service.js');
                if (action === 'create') {
                    document.querySelector('#form_create').setAttribute('actiontype', 'create');
                    window.pendingCharacterTransition = lifecycle.saveCharacterAuthoringFromPayload({ fields: { name: 'Late create proof 032' } });
                } else {
                    window.pendingCharacterTransition = lifecycle.renameCharacter('Late rename proof 033', { silent: true, renameChats: false });
                }
            }, action);
            await started;
            expect(await page.evaluate(async () => (await import('/scripts/chat-ops-service.js')).saveChat())).toBe(true);
            await page.evaluate(() => window.SillyTavern.getContext().chat.push({ name: 'You', is_user: true, mes: 'late confirmed transition edit 8142' }));
            await page.locator('#send_textarea').fill('late transition composer 8142');
            release();
            await page.evaluate(() => window.pendingCharacterTransition);
            const result = await page.evaluate(async identity => {
                const state = window.SillyTavern.getContext();
                const storage = (await import('/lib.js')).localforage.createInstance({ name: 'EmberDesk_ChatRecovery' });
                const drafts = await Promise.all((await storage.keys()).filter(key => key.startsWith('recovery-v1:')).map(key => storage.getItem(key)));
                return { current: state.characters[state.characterId]?.avatar, messages: state.chat.map(item => item.mes), drafts: drafts.filter(item => item.identity.avatar === identity.avatar && item.identity.chat === identity.chat) };
            }, identity);
            const keptInPlace = result.current === identity.avatar && result.messages.includes('late confirmed transition edit 8142');
            const draft = result.drafts.find(item => JSON.stringify(item.snapshot.messages).includes('late confirmed transition edit 8142') && item.snapshot.composer.value === 'late transition composer 8142');
            expect(keptInPlace || Boolean(draft)).toBe(true);
        } finally {
            release();
            await page.unroute(endpoint);
        }
    });

    test(`${action} keeps the current session when a new save starts after server commit`, async ({ page }) => {
        await testSetup.awaitST({ page });
        const avatar = await page.evaluate(async action => {
            const state = window.SillyTavern.getContext();
            state.chatCompletionSettings.chat_memory_enabled = false;
            const index = state.characters.findIndex(character => character.name === (action === 'create' ? 'Dev Character 030' : 'Dev Character 031'));
            await state.selectCharacterById(index);
            return state.characters[index].avatar;
        }, action);
        let releaseCharacter, characterCommitted, releaseSave, saveStarted;
        const characterGate = new Promise(resolve => { releaseCharacter = resolve; });
        const committed = new Promise(resolve => { characterCommitted = resolve; });
        const saveGate = new Promise(resolve => { releaseSave = resolve; });
        const saving = new Promise(resolve => { saveStarted = resolve; });
        const endpoint = `**/api/characters/${action}`;
        await page.route(endpoint, async route => { const response = await route.fetch(); characterCommitted(); await characterGate; await route.fulfill({ response }); });
        await page.route('**/api/chats/save', async route => { saveStarted(); await saveGate; await route.continue(); });
        try {
            await page.evaluate(async action => {
                const lifecycle = await import('/scripts/character-lifecycle-service.js');
                if (action === 'create') {
                    document.querySelector('#form_create').setAttribute('actiontype', 'create');
                    window.pendingCharacterTransition = lifecycle.saveCharacterAuthoringFromPayload({ fields: { name: 'Committed create proof 030' } });
                } else window.pendingCharacterTransition = lifecycle.renameCharacter('Committed rename proof 031', { silent: true, renameChats: false });
            }, action);
            await committed;
            await page.evaluate(async () => {
                window.SillyTavern.getContext().chat.push({ name: 'You', is_user: true, mes: 'post commit pending save 8143' });
                window.transitionSave = (await import('/scripts/chat-ops-service.js')).saveChat();
            });
            await saving;
            releaseCharacter();
            await page.evaluate(() => window.pendingCharacterTransition);
            const current = await page.evaluate(() => {
                const state = window.SillyTavern.getContext();
                return { avatar: state.characters[state.characterId]?.avatar, messages: state.chat.map(item => item.mes) };
            });
            expect(current.avatar).toBe(avatar);
            expect(current.messages).toContain('post commit pending save 8143');
        } finally {
            releaseCharacter(); releaseSave();
            await page.evaluate(() => window.transitionSave);
            await page.unroute(endpoint);
            await page.unroute('**/api/chats/save');
        }
    });
}

test('creating a character preserves an unconfirmed chat save', async ({ page }) => {
    await testSetup.awaitST({ page });
    const identity = await page.evaluate(async () => {
        const state = window.SillyTavern.getContext();
        state.chatCompletionSettings.chat_memory_enabled = false;
        const index = state.characters.findIndex(character => character.name === 'Dev Character 037');
        await state.selectCharacterById(index);
        return { avatar: state.characters[index].avatar, chat: state.characters[index].chat };
    });
    await page.route('**/api/chats/save', route => route.abort('failed'));
    await page.evaluate(() => window.SillyTavern.getContext().chat.push({ name: 'You', is_user: true, mes: 'create unconfirmed edit 7282' }));
    await page.locator('#send_textarea').fill('create unconfirmed composer 7282');
    expect(await page.evaluate(async () => (await import('/scripts/chat-ops-service.js')).saveChat())).toBe(false);
    await page.unroute('**/api/chats/save');
    const created = await page.evaluate(async () => {
        document.querySelector('#form_create').setAttribute('actiontype', 'create');
        return (await import('/scripts/character-lifecycle-service.js')).saveCharacterAuthoringFromPayload({ fields: { name: 'Create recovery proof 037' } });
    });
    expect(created.ok).toBe(true);
    expect(await page.evaluate(() => {
        const state = window.SillyTavern.getContext();
        return state.characters[state.characterId]?.avatar;
    })).toBe(created.avatar);
    const drafts = await page.evaluate(async () => {
        const storage = (await import('/lib.js')).localforage.createInstance({ name: 'EmberDesk_ChatRecovery' });
        return Promise.all((await storage.keys()).filter(key => key.startsWith('recovery-v1:')).map(key => storage.getItem(key)));
    });
    const draft = drafts.find(item => item.identity.avatar === identity.avatar && item.identity.chat === identity.chat);
    expect(JSON.stringify(draft?.snapshot.messages)).toContain('create unconfirmed edit 7282');
    expect(draft?.snapshot.composer.value).toBe('create unconfirmed composer 7282');
});

test('renaming a character preserves an unconfirmed chat save', async ({ page }) => {
    await testSetup.awaitST({ page });
    const identity = await page.evaluate(async () => {
        const state = window.SillyTavern.getContext();
        state.chatCompletionSettings.chat_memory_enabled = false;
        const index = state.characters.findIndex(character => character.name === 'Dev Character 038');
        await state.selectCharacterById(index);
        return { avatar: state.characters[index].avatar, chat: state.characters[index].chat };
    });
    await page.route('**/api/chats/save', route => route.abort('failed'));
    await page.evaluate(() => window.SillyTavern.getContext().chat.push({ name: 'You', is_user: true, mes: 'rename unconfirmed edit 7281' }));
    await page.locator('#send_textarea').fill('rename unconfirmed composer 7281');
    expect(await page.evaluate(async () => (await import('/scripts/chat-ops-service.js')).saveChat())).toBe(false);
    await page.unroute('**/api/chats/save');
    expect(await page.evaluate(async () => (await import('/scripts/character-lifecycle-service.js')).renameCharacter('Rename recovery proof 038', { silent: true, renameChats: false }))).toBe(true);
    const drafts = await page.evaluate(async () => {
        const storage = (await import('/lib.js')).localforage.createInstance({ name: 'EmberDesk_ChatRecovery' });
        return Promise.all((await storage.keys()).filter(key => key.startsWith('recovery-v1:')).map(key => storage.getItem(key)));
    });
    const draft = drafts.find(item => item.identity.avatar === identity.avatar && item.identity.chat === identity.chat);
    expect(JSON.stringify(draft?.snapshot.messages)).toContain('rename unconfirmed edit 7281');
    expect(draft?.snapshot.composer.value).toBe('rename unconfirmed composer 7281');
});

test('an ambiguous ordinary save retains edits before switching chats', async ({ page }) => {
    await testSetup.awaitST({ page });
    const target = await page.evaluate(async () => {
        const state = window.SillyTavern.getContext();
        state.chatCompletionSettings.chat_memory_enabled = false;
        const index = state.characters.findIndex(character => character.name === 'Dev Character 041');
        await state.selectCharacterById(index);
        return { avatar: state.characters[index].avatar, chat: state.characters[index].chat };
    });
    await page.route('**/api/chats/save', route => route.abort('failed'));
    await page.evaluate(() => window.SillyTavern.getContext().chat.push({ name: 'You', is_user: true, mes: 'unconfirmed save edit 7912' }));
    await page.locator('#send_textarea').fill('unconfirmed composer 7912');
    expect(await page.evaluate(async () => (await import('/scripts/chat-ops-service.js')).saveChat())).toBe(false);
    await page.unroute('**/api/chats/save');
    await page.evaluate(async () => {
        const state = window.SillyTavern.getContext();
        await state.selectCharacterById(state.characters.findIndex(character => character.name === 'Dev Character 042'));
    });
    const drafts = await page.evaluate(async () => {
        const storage = (await import('/lib.js')).localforage.createInstance({ name: 'EmberDesk_ChatRecovery' });
        return Promise.all((await storage.keys()).filter(key => key.startsWith('recovery-v1:')).map(key => storage.getItem(key)));
    });
    const draft = drafts.find(item => item.identity.avatar === target.avatar && item.identity.chat === target.chat);
    expect(JSON.stringify(draft?.snapshot.messages)).toContain('unconfirmed save edit 7912');
    expect(draft?.snapshot.composer.value).toBe('unconfirmed composer 7912');
});

test('an injected integrity response preserves edits before the legacy reload dialog', async ({ page }) => {
    await testSetup.awaitST({ page });
    const identity = await page.evaluate(async () => {
        const state = window.SillyTavern.getContext();
        state.chatCompletionSettings.chat_memory_enabled = false;
        const index = state.characters.findIndex(character => character.name === 'Dev Character 040');
        await state.selectCharacterById(index);
        state.chat.push({ name: 'You', is_user: true, mes: 'integrity recovery message 3104' });
        return { avatar: state.characters[index].avatar, chat: state.characters[index].chat };
    });
    await page.locator('#send_textarea').fill('integrity recovery composer 3104');
    await page.route('**/api/chats/save', route => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'integrity' }) }));
    await page.evaluate(async () => { void (await import('/scripts/chat-ops-service.js')).saveChat(); });
    const dialog = page.locator('dialog[open]').filter({ hasText: /integrity|完整性/i });
    await expect(dialog).toBeVisible();
    const stored = await page.evaluate(async identity => {
        const storage = (await import('/lib.js')).localforage.createInstance({ name: 'EmberDesk_ChatRecovery' });
        const drafts = await Promise.all((await storage.keys()).filter(key => key.startsWith('recovery-v1:')).map(key => storage.getItem(key)));
        return drafts.find(draft => draft.identity.avatar === identity.avatar && draft.identity.chat === identity.chat);
    }, identity);
    expect(JSON.stringify(stored?.snapshot.messages)).toContain('integrity recovery message 3104');
    expect(stored?.snapshot.composer.value).toBe('integrity recovery composer 3104');
    await page.evaluate(() => window.SillyTavern.getContext().chat.push({ name: 'You', is_user: true, mes: 'integrity dialog late edit 3104' }));
    await page.unroute('**/api/chats/save');
    const reload = page.waitForEvent('load');
    await dialog.locator('.popup-button-ok').click();
    await reload;
    await testSetup.awaitST({ page });
    const afterReload = await page.evaluate(async id => {
        const storage = (await import('/lib.js')).localforage.createInstance({ name: 'EmberDesk_ChatRecovery' });
        const drafts = await Promise.all((await storage.keys()).filter(key => key.startsWith('recovery-v1:')).map(key => storage.getItem(key)));
        return drafts.find(draft => draft.id === id);
    }, stored.id);
    expect(JSON.stringify(afterReload?.snapshot.messages)).toContain('integrity recovery message 3104');
    expect(JSON.stringify(afterReload?.snapshot.messages)).toContain('integrity dialog late edit 3104');
    expect(afterReload?.snapshot.composer.value).toBe('integrity recovery composer 3104');
    await page.evaluate(async identity => {
        const state = window.SillyTavern.getContext();
        await state.selectCharacterById(state.characters.findIndex(character => character.avatar === identity.avatar));
    }, identity);
    await page.locator('#options_button').click();
    await page.locator('#option_select_chat').click();
    const draft = page.getByTestId('chat-recovery-drafts').locator('li').filter({ hasText: identity.chat }).first();
    await expect(draft).toBeVisible();
    await draft.getByRole('button', { name: /show unsent text/i }).click();
    await expect(draft.locator('textarea')).toHaveValue('integrity recovery composer 3104');
    const restored = page.waitForResponse(response => response.url().endsWith('/api/chats/save') && response.request().postDataJSON().operationId === stored.id);
    await draft.getByRole('button', { name: /restore.*new/i }).click();
    expect((await restored).status()).toBe(200);
});

test('an injected integrity response does not reload when the final checkpoint fails', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.evaluate(async () => {
        const state = window.SillyTavern.getContext();
        state.chatCompletionSettings.chat_memory_enabled = false;
        await state.selectCharacterById(state.characters.findIndex(character => character.name === 'Dev Character 042'));
        state.chat.push({ name: 'You', is_user: true, mes: 'integrity before dialog 3106' });
    });
    await page.route('**/api/chats/save', route => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'integrity' }) }));
    await page.evaluate(async () => { void (await import('/scripts/chat-ops-service.js')).saveChat(); });
    const dialog = page.locator('dialog[open]').filter({ hasText: /integrity|完整性/i });
    await expect(dialog).toBeVisible();
    await page.evaluate(() => {
        window.SillyTavern.getContext().chat.push({ name: 'You', is_user: true, mes: 'integrity final checkpoint failure 3106' });
        window.originalIntegrityRecoveryPut = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (value, key) {
            if (typeof key === 'string' && key.startsWith('recovery-v1:')) throw new DOMException('Storage full', 'QuotaExceededError');
            return window.originalIntegrityRecoveryPut.call(this, value, key);
        };
    });
    await dialog.locator('.popup-button-ok').click();
    await expect(page.locator('#toast-container')).toContainText(/do not refresh/i);
    expect(await page.evaluate(() => window.SillyTavern.getContext().chat.some(message => message.mes === 'integrity final checkpoint failure 3106'))).toBe(true);
    expect(await page.evaluate(async () => {
        try { await (await import('/scripts/chat-ops-service.js')).clearChat({ clearData: true }); return false; }
        catch { return true; }
    })).toBe(true);
});

test('an injected integrity response retains the explicit overwrite command', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.evaluate(async () => {
        const state = window.SillyTavern.getContext();
        state.chatCompletionSettings.chat_memory_enabled = false;
        await state.selectCharacterById(state.characters.findIndex(character => character.name === 'Dev Character 041'));
        state.chat.push({ name: 'You', is_user: true, mes: 'integrity overwrite message 3107' });
    });
    let requests = 0;
    await page.route('**/api/chats/save', route => {
        requests++;
        return requests === 1 ? route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'integrity' }) }) : route.continue();
    });
    await page.evaluate(async () => { void (await import('/scripts/chat-ops-service.js')).saveChat(); });
    const dialog = page.locator('dialog[open]').filter({ hasText: /integrity|完整性/i });
    await expect(dialog).toBeVisible();
    await dialog.locator('textarea, input').first().fill('OVERWRITE');
    const saved = page.waitForResponse(response => response.url().endsWith('/api/chats/save') && response.status() === 200);
    await dialog.locator('.popup-button-ok').click();
    const response = await saved;
    expect(response.request().postDataJSON().force).toBe(true);
    expect(requests).toBe(2);
});

test('an injected integrity response never reloads when recovery storage fails', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.evaluate(async () => {
        const state = window.SillyTavern.getContext();
        state.chatCompletionSettings.chat_memory_enabled = false;
        await state.selectCharacterById(state.characters.findIndex(character => character.name === 'Dev Character 043'));
        state.chat.push({ name: 'You', is_user: true, mes: 'integrity recovery storage failure 3105' });
        window.originalIntegrityRecoveryPut = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (value, key) {
            if (typeof key === 'string' && key.startsWith('recovery-v1:')) throw new DOMException('Storage full', 'QuotaExceededError');
            return window.originalIntegrityRecoveryPut.call(this, value, key);
        };
    });
    await page.locator('#send_textarea').fill('integrity storage failure composer 3105');
    await page.route('**/api/chats/save', route => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'integrity' }) }));
    expect(await page.evaluate(async () => (await import('/scripts/chat-ops-service.js')).saveChat())).toBe(false);
    await expect(page.locator('#toast-container')).toContainText(/do not refresh/i);
    await expect(page.locator('dialog[open]').filter({ hasText: /integrity|完整性/i })).toHaveCount(0);
    expect(await page.evaluate(() => window.SillyTavern.getContext().chat.some(message => message.mes === 'integrity recovery storage failure 3105'))).toBe(true);
    await expect(page.locator('#send_textarea')).toHaveValue('integrity storage failure composer 3105');
    expect(await page.evaluate(async () => {
        try { await (await import('/scripts/chat-ops-service.js')).clearChat({ clearData: true }); return false; }
        catch { return window.SillyTavern.getContext().chat.some(message => message.mes === 'integrity recovery storage failure 3105'); }
    })).toBe(true);
});

test('an unknown save outcome persists a recovery draft before it recommends reloading', async ({ page }) => {
    await testSetup.awaitST({ page });
    const identity = await page.evaluate(async () => {
        const state = window.SillyTavern.getContext();
        state.chatCompletionSettings.chat_memory_enabled = false;
        const index = state.characters.findIndex(character => character.name === 'Dev Character 040');
        await state.selectCharacterById(index);
        return { avatar: state.characters[index].avatar, chat: state.characters[index].chat };
    });
    let attempts = 0;
    await page.route('**/api/chats/save', route => { attempts++; return route.abort('failed'); });
    await page.evaluate(() => window.SillyTavern.getContext().chat.push({ name: 'You', is_user: true, mes: 'unknown outcome durable edit 6401' }));
    await page.locator('#send_textarea').fill('unknown outcome durable composer 6401');
    expect(await page.evaluate(async () => (await import('/scripts/chat-ops-service.js')).saveChat())).toBe(false);
    expect(attempts).toBe(2);
    await expect(page.locator('#toast-container')).toContainText(/saved.*recovery drafts/i);
    const stored = await page.evaluate(async identity => {
        const storage = (await import('/lib.js')).localforage.createInstance({ name: 'EmberDesk_ChatRecovery' });
        const drafts = await Promise.all((await storage.keys()).filter(key => key.startsWith('recovery-v1:')).map(key => storage.getItem(key)));
        return drafts.find(draft => draft.identity.avatar === identity.avatar && draft.identity.chat === identity.chat);
    }, identity);
    expect(JSON.stringify(stored?.snapshot.messages)).toContain('unknown outcome durable edit 6401');
    expect(stored?.snapshot.composer.value).toBe('unknown outcome durable composer 6401');

    await page.unroute('**/api/chats/save');
    await page.reload();
    await testSetup.awaitST({ page });
    await page.evaluate(async identity => {
        const state = window.SillyTavern.getContext();
        await state.selectCharacterById(state.characters.findIndex(character => character.avatar === identity.avatar));
    }, identity);
    await page.locator('#options_button').click();
    await page.locator('#option_select_chat').click();
    const draft = page.getByTestId('chat-recovery-drafts').locator('li').filter({ hasText: identity.chat }).first();
    await expect(draft).toBeVisible();
    await draft.getByRole('button', { name: /show unsent text/i }).click();
    await expect(draft.locator('textarea')).toHaveValue('unknown outcome durable composer 6401');
    const created = page.waitForResponse(response => response.url().endsWith('/api/chats/save') && response.request().postDataJSON().operationId === stored.id);
    await draft.getByRole('button', { name: /restore.*new/i }).click();
    const restored = await created;
    expect(restored.status()).toBe(200);
    const restoreRequest = restored.request().postDataJSON();
    expect(JSON.stringify(restoreRequest.chat)).toContain('unknown outcome durable edit 6401');
    const restoredChat = await page.evaluate(async ({ avatar, file }) => {
        const { getRequestHeaders } = await import('/script.js');
        const response = await fetch('/api/chats/get', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ avatar_url: avatar, file_name: file }) });
        return await response.json();
    }, { avatar: identity.avatar, file: restoreRequest.file_name });
    expect(JSON.stringify(restoredChat)).toContain('unknown outcome durable edit 6401');
});

test('an unknown save outcome does not advise reload when recovery storage fails', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.evaluate(async () => {
        const state = window.SillyTavern.getContext();
        state.chatCompletionSettings.chat_memory_enabled = false;
        await state.selectCharacterById(state.characters.findIndex(character => character.name === 'Dev Character 043'));
        window.originalRecoveryPut = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (value, key) {
            if (typeof key === 'string' && key.startsWith('recovery-v1:')) throw new DOMException('Storage full', 'QuotaExceededError');
            return window.originalRecoveryPut.call(this, value, key);
        };
    });
    await page.route('**/api/chats/save', route => route.abort('failed'));
    await page.evaluate(() => window.SillyTavern.getContext().chat.push({ name: 'You', is_user: true, mes: 'unknown storage failure memory edit 6402' }));
    await page.locator('#send_textarea').fill('unknown storage failure memory composer 6402');
    expect(await page.evaluate(async () => (await import('/scripts/chat-ops-service.js')).saveChat())).toBe(false);
    await expect(page.locator('#toast-container')).toContainText(/do not refresh/i);
    await expect(page.locator('#toast-container')).not.toContainText(/reload the page to prevent data loss/i);
    expect(await page.evaluate(() => window.SillyTavern.getContext().chat.some(message => message.mes === 'unknown storage failure memory edit 6402'))).toBe(true);
    await expect(page.locator('#send_textarea')).toHaveValue('unknown storage failure memory composer 6402');
    expect(await page.evaluate(async () => {
        try { await (await import('/scripts/chat-ops-service.js')).clearChat({ clearData: true }); return false; }
        catch { return window.SillyTavern.getContext().chat.some(message => message.mes === 'unknown storage failure memory edit 6402'); }
    })).toBe(true);
    await page.evaluate(() => { IDBObjectStore.prototype.put = window.originalRecoveryPut; });
    await page.unroute('**/api/chats/save');
    expect(await page.evaluate(async () => (await import('/scripts/chat-ops-service.js')).saveChat())).toBe(true);
    expect(await page.evaluate(async () => {
        const storage = (await import('/lib.js')).localforage.createInstance({ name: 'EmberDesk_ChatRecovery' });
        return JSON.stringify(await Promise.all((await storage.keys()).filter(key => key.startsWith('recovery-v1:')).map(key => storage.getItem(key))));
    })).toContain('unknown storage failure memory edit 6402');
});

test('a save conflict reports failed recovery storage and can retry after storage returns', async ({ page, context }) => {
    await testSetup.awaitST({ page });
    const second = await context.newPage();
    try {
        await second.goto('/');
        await testSetup.awaitST({ page: second });
        const select = tab => tab.evaluate(async () => {
            const state = window.SillyTavern.getContext();
            state.chatCompletionSettings.chat_memory_enabled = false;
            const index = state.characters.findIndex(character => character.name === 'Dev Character 044');
            await state.selectCharacterById(index);
        });
        await select(page);
        await select(second);
        await page.evaluate(async () => {
            window.SillyTavern.getContext().chat.push({ name: 'You', is_user: true, mes: 'remote winner 7741' });
            await (await import('/scripts/chat-ops-service.js')).saveChat();
        });
        await second.evaluate(() => {
            window.SillyTavern.getContext().chat.push({ name: 'You', is_user: true, mes: 'quota recovery 7741' });
            window.originalRecoveryPut = IDBObjectStore.prototype.put;
            IDBObjectStore.prototype.put = function (value, key) {
                if (typeof key === 'string' && key.startsWith('recovery-v1:')) throw new DOMException('Storage full', 'QuotaExceededError');
                return window.originalRecoveryPut.call(this, value, key);
            };
        });
        expect(await second.evaluate(async () => (await import('/scripts/chat-ops-service.js')).saveChat())).toBe(false);
        await expect(second.locator('#toast-container')).toContainText(/could not be saved to a recovery draft/i);
        expect(await second.evaluate(async () => {
            try { await (await import('/scripts/chat-ops-service.js')).clearChat({ clearData: true }); return false; }
            catch { return window.SillyTavern.getContext().chat.some(message => message.mes === 'quota recovery 7741'); }
        })).toBe(true);
        await second.evaluate(() => { IDBObjectStore.prototype.put = window.originalRecoveryPut; });
        expect(await second.evaluate(async () => (await import('/scripts/chat-ops-service.js')).saveChat())).toBe(false);
        await expect(second.locator('#toast-container')).toContainText(/recovery drafts/i);
        await expect.poll(() => second.evaluate(async () => {
            const storage = (await import('/lib.js')).localforage.createInstance({ name: 'EmberDesk_ChatRecovery' });
            return JSON.stringify(await Promise.all((await storage.keys()).filter(key => key.startsWith('recovery-v1:')).map(key => storage.getItem(key))));
        })).toContain('quota recovery 7741');
    } finally { await second.close(); }
});
test('one tab confirming deletion does not discard another tab when its checkpoint fails', async ({ page, context }) => {
    await testSetup.awaitST({ page });
    const second = await context.newPage();
    try {
        await second.goto('/');
        await testSetup.awaitST({ page: second });
        const select = tab => tab.evaluate(async () => {
            Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
            const state = window.SillyTavern.getContext();
            state.chatCompletionSettings.chat_memory_enabled = false;
            const index = state.characters.findIndex(character => character.name === 'Dev Character 046');
            await state.selectCharacterById(index);
            return state.characters[index].chat;
        });
        const file = await select(page);
        expect(await select(second)).toBe(file);
        let releaseFirst, releaseSecond, firstCommitted, secondCommitted;
        const firstHold = new Promise(resolve => { releaseFirst = resolve; });
        const secondHold = new Promise(resolve => { releaseSecond = resolve; });
        const firstReady = new Promise(resolve => { firstCommitted = resolve; });
        const secondReady = new Promise(resolve => { secondCommitted = resolve; });
        const requests = [];
        await context.route('**/api/chats/delete', async route => {
            requests.push(route.request().postDataJSON());
            const number = requests.length;
            const response = await route.fetch();
            expect(response.status()).toBe(200);
            if (number === 1) { firstCommitted(); await firstHold; }
            else { secondCommitted(); await secondHold; }
            await route.fulfill({ response });
        });
        const start = tab => tab.evaluate(name => {
            window.pendingDeleteTest = import('/scripts/dom-handlers.js').then(module => module.runHistoryRowCommand('deleteChat', name, { fromSlashCommand: true })).then(() => true, () => false);
        }, file);
        try {
            await start(page);
            await firstReady;
            await start(second);
            await secondReady;
            expect(requests[1]).toEqual(requests[0]);
            releaseFirst();
            expect(await page.evaluate(() => window.pendingDeleteTest)).toBe(true);
            await second.evaluate(() => {
                window.SillyTavern.getContext().chat[0].mes = 'second-tab late checkpoint 9256';
                window.originalRecoveryPut = IDBObjectStore.prototype.put;
                IDBObjectStore.prototype.put = function (value, key) {
                    if (typeof key === 'string' && key.startsWith('recovery-v1:')) throw new DOMException('Storage full', 'QuotaExceededError');
                    return window.originalRecoveryPut.call(this, value, key);
                };
            });
            releaseSecond();
            expect(await second.evaluate(() => window.pendingDeleteTest)).toBe(false);
            expect(await second.evaluate(() => window.SillyTavern.getContext().chat[0].mes)).toBe('second-tab late checkpoint 9256');
            await second.evaluate(async () => {
                IDBObjectStore.prototype.put = window.originalRecoveryPut;
                const state = window.SillyTavern.getContext();
                await state.selectCharacterById(state.characters.findIndex(character => character.name === 'Dev Character 047'));
            });
            const saved = await second.evaluate(async () => {
                const storage = (await import('/lib.js')).localforage.createInstance({ name: 'EmberDesk_ChatRecovery' });
                return Promise.all((await storage.keys()).filter(key => key.startsWith('recovery-v1:playwright-e2e:')).map(key => storage.getItem(key)));
            });
            const copies = saved.filter(draft => draft.identity.chat === file);
            expect(new Set(copies.map(draft => draft.id)).size).toBeGreaterThanOrEqual(2);
            expect(copies.some(draft => draft.snapshot.messages.some(message => message.mes === 'second-tab late checkpoint 9256'))).toBe(true);
        } finally { releaseFirst(); releaseSecond(); }
    } finally { await context.unroute('**/api/chats/delete'); await second.close(); }
});

test('two tabs without Web Locks replay one durable operation after a concurrent lost delete response', async ({ page, context }) => {
    await testSetup.awaitST({ page });
    const second = await context.newPage();
    try {
        await second.goto('/');
        await testSetup.awaitST({ page: second });
        const select = tab => tab.evaluate(async () => {
            Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
            const state = window.SillyTavern.getContext();
            state.chatCompletionSettings.chat_memory_enabled = false;
            const index = state.characters.findIndex(character => character.name === 'Dev Character 046');
            await state.selectCharacterById(index);
            return state.characters[index].chat;
        });
        const file = await select(page);
        expect(await select(second)).toBe(file);
        const requests = [];
        let release, committed;
        const hold = new Promise(resolve => { release = resolve; });
        const firstCommitted = new Promise(resolve => { committed = resolve; });
        await context.route('**/api/chats/delete', async route => {
            requests.push(route.request().postDataJSON());
            if (requests.length === 1) {
                const response = await route.fetch();
                expect(response.status()).toBe(200);
                committed();
                await hold;
                await route.abort('failed');
            } else if (requests.length === 2) await route.abort('failed');
            else await route.continue();
        });
        const start = tab => tab.evaluate(name => {
            window.pendingDeleteTest = import('/scripts/dom-handlers.js').then(module => module.runHistoryRowCommand('deleteChat', name, { fromSlashCommand: true })).then(() => true, () => false);
        }, file);
        await start(page);
        try {
            await firstCommitted;
            await start(second);
            await expect.poll(() => requests.length).toBe(2);
        } finally { release(); }
        expect(await page.evaluate(() => window.pendingDeleteTest)).toBe(false);
        expect(await second.evaluate(() => window.pendingDeleteTest)).toBe(false);
        expect(requests).toHaveLength(2);
        expect(requests[1]).toEqual(requests[0]);
        await start(second);
        expect(await second.evaluate(() => window.pendingDeleteTest)).toBe(true);
        expect(requests[2]).toEqual(requests[0]);
    } finally { await context.unroute('**/api/chats/delete'); await second.close(); }
});

test('two tabs protect a newer saved version from an older current-chat delete and retry', async ({ page, context }) => {
    await testSetup.awaitST({ page });
    const second = await context.newPage();
    try {
        await second.goto('/');
        await testSetup.awaitST({ page: second });
        const select = async tab => tab.evaluate(async () => {
            Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
            const state = window.SillyTavern.getContext();
            state.chatCompletionSettings.chat_memory_enabled = false;
            const index = state.characters.findIndex(character => character.name === 'Dev Character 046');
            await state.selectCharacterById(index);
            return { file: state.characters[index].chat, avatar: state.characters[index].avatar };
        });
        const first = await select(page);
        const other = await select(second);
        expect(other).toEqual(first);
        const saved = page.waitForResponse(response => response.url().endsWith('/api/chats/save'));
        await page.evaluate(async () => {
            window.SillyTavern.getContext().chat.push({ name: 'You', is_user: true, is_system: false, mes: 'newer-tab-saved-value', send_date: Date.now() });
            await (await import('/scripts/chat-ops-service.js')).saveChat();
        });
        expect((await saved).status()).toBe(200);
        const requests = [], statuses = [];
        await second.route('**/api/chats/delete', async route => {
            requests.push(route.request().postDataJSON());
            const response = await route.fetch();
            statuses.push(response.status());
            await route.fulfill({ response });
        });
        const remove = () => second.evaluate(async file => {
            try { await (await import('/scripts/dom-handlers.js')).runHistoryRowCommand('deleteChat', file, { fromSlashCommand: true }); return true; }
            catch { return false; }
        }, first.file);
        expect(await remove()).toBe(false);
        await expect(second.locator('#toast-container')).toContainText(/newer version/i);
        await expect(second.locator('#toast-container')).toContainText(/recovery drafts/i);
        expect(await remove()).toBe(false);
        expect(statuses).toEqual([409, 409]);
        expect(requests[1]).toEqual(requests[0]);
        const remote = await page.evaluate(async target => {
            const { getRequestHeaders } = await import('/script.js');
            const response = await fetch('/api/chats/get', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ avatar_url: target.avatar, file_name: target.file }) });
            return { status: response.status, body: await response.json() };
        }, first);
        expect(remote.status).toBe(200);
        expect(JSON.stringify(remote.body)).toContain('newer-tab-saved-value');
        // The user continues editing after the conflict, without switching or
        // retrying. A reload must not be needed to trigger durable protection.
        await second.evaluate(() => window.SillyTavern.getContext().chat.push({ name: 'You', is_user: true, mes: 'conflict late local 5349' }));
        await second.locator('#send_textarea').fill('conflict composer 5349');
        await expect.poll(() => second.evaluate(async () => {
            const storage = (await import('/lib.js')).localforage.createInstance({ name: 'EmberDesk_ChatRecovery' });
            const keys = (await storage.keys()).filter(key => key.startsWith('recovery-v1:'));
            return JSON.stringify(await Promise.all(keys.map(key => storage.getItem(key))));
        }), { timeout: 7000 }).toContain('conflict late local 5349');
        await expect.poll(() => second.evaluate(async () => {
            const storage = (await import('/lib.js')).localforage.createInstance({ name: 'EmberDesk_ChatRecovery' });
            const keys = (await storage.keys()).filter(key => key.startsWith('recovery-v1:'));
            return JSON.stringify(await Promise.all(keys.map(key => storage.getItem(key))));
        })).toContain('conflict composer 5349');
        await second.locator('#toast-container .toast').evaluateAll(toasts => toasts.forEach(toast => toast.click()));
        await second.locator('#options_button').click();
        await second.locator('#option_select_chat').click();
        const draft = second.getByTestId('chat-recovery-drafts').locator('li').filter({ hasText: first.file }).first();
        await expect(draft).toBeVisible();
        const downloaded = second.waitForEvent('download');
        await draft.getByRole('button', { name: /export/i }).click();
        const exported = JSON.parse(await readFile(await (await downloaded).path(), 'utf8'));
        expect(exported.snapshot.composer.value).toBe('conflict composer 5349');
        const created = second.waitForResponse(response => response.url().endsWith('/api/chats/save') && response.request().postDataJSON().operationId === exported.id);
        await draft.getByRole('button', { name: /restore.*new/i }).click();
        const restore = await created;
        expect(restore.status()).toBe(200);
        expect(JSON.stringify(restore.request().postDataJSON().chat)).toContain('conflict late local 5349');
    } finally { await second.close(); }
});

test('active chat deletion uses its loaded version and retains a recovery draft', async ({ page }) => {
    await testSetup.awaitST({ page });
    const deletes = [];
    await page.route('**/api/chats/delete', route => { deletes.push(route.request().postDataJSON()); return route.continue(); });
    const outcome = await page.evaluate(async () => {
        const context = window.SillyTavern.getContext();
        const index = context.characters.findIndex(character => character.name === 'Dev Character 046');
        await context.selectCharacterById(index);
        const name = context.characters[index].chat;
        context.chat.push({ name: 'You', is_user: true, mes: 'unsaved protected edit' });
        await (await import('/scripts/dom-handlers.js')).runHistoryRowCommand('deleteChat', name, { fromSlashCommand: true });
        return name;
    });
    expect(deletes).toHaveLength(1);
    expect(deletes[0]).toMatchObject({ chatfile: `${outcome}.jsonl`, version: expect.stringMatching(/^[0-9a-f]{32}$/), operationId: expect.any(String) });
    const drafts = await page.evaluate(async () => {
        const storage = (await import('/lib.js')).localforage.createInstance({ name: 'EmberDesk_ChatRecovery' });
        const keys = (await storage.keys()).filter(key => key.startsWith('recovery-v1:'));
        return Promise.all(keys.map(key => storage.getItem(key)));
    });
    expect(JSON.stringify(drafts)).toContain('unsaved protected edit');
});

test('current chat retries a committed lost response without reading a new version and checkpoints late edits', async ({ page }) => {
    await testSetup.awaitST({ page });
    const file = await page.evaluate(async () => {
        const context = window.SillyTavern.getContext();
        context.chatCompletionSettings.chat_memory_enabled = false;
        const index = context.characters.findIndex(character => character.name === 'Dev Character 046');
        await context.selectCharacterById(index);
        return context.characters[index].chat;
    });
    const requests = [];
    let gets = 0;
    await page.route('**/api/chats/get', route => { gets++; return route.continue(); });
    await page.route('**/api/chats/delete', async route => {
        requests.push(route.request().postDataJSON());
        if (requests.length === 1) { const response = await route.fetch(); expect(response.status()).toBe(200); await route.abort('failed'); }
        else await route.continue();
    });
    expect(await page.evaluate(async name => {
        try { await (await import('/scripts/dom-handlers.js')).runHistoryRowCommand('deleteChat', name, { fromSlashCommand: true }); return true; }
        catch { return false; }
    }, file)).toBe(false);
    expect(gets).toBe(0);
    await page.evaluate(() => { window.SillyTavern.getContext().chat[0].mes = 'late edit before same-session retry'; });
    await page.locator('#options_button').click();
    await page.locator('#option_select_chat').click();
    const pending = page.getByTestId('pending-history-deletions');
    await expect(pending).toContainText(file);
    await pending.getByRole('button', { name: /retry deletion/i }).click();
    await expect(pending).toHaveCount(0);
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
    const saved = await page.evaluate(async () => {
        const storage = (await import('/lib.js')).localforage.createInstance({ name: 'EmberDesk_ChatRecovery' });
        const keys = (await storage.keys()).filter(key => key.startsWith('recovery-v1:playwright-e2e:'));
        return Promise.all(keys.map(key => storage.getItem(key)));
    });
    expect(saved.some(draft => draft.identity.chat === file && draft.snapshot.messages.some(message => message.mes === 'late edit before same-session retry'))).toBe(true);
});

test('an old delete replay does not clear a newly loaded chat at the same name', async ({ page }) => {
    await testSetup.awaitST({ page });
    const target = await page.evaluate(async () => {
        const context = window.SillyTavern.getContext();
        const index = context.characters.findIndex(character => character.name === 'Dev Character 046');
        await context.selectCharacterById(index);
        return { avatar: context.characters[index].avatar, file: context.characters[index].chat };
    });
    const requests = [];
    await page.route('**/api/chats/delete', async route => {
        requests.push(route.request().postDataJSON());
        if (requests.length === 1) { const response = await route.fetch(); expect(response.status()).toBe(200); await route.abort('failed'); }
        else await route.continue();
    });
    await page.evaluate(async file => {
        try { await (await import('/scripts/dom-handlers.js')).runHistoryRowCommand('deleteChat', file, { fromSlashCommand: true }); } catch { /* response lost */ }
    }, target.file);
    const status = await page.evaluate(async ({ avatar, file }) => {
        const { getRequestHeaders } = await import('/script.js');
        const response = await fetch('/api/chats/save', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({
            avatar_url: avatar, file_name: file, create: true, operationId: 'new-incarnation-test',
            chat: [{ user_name: 'unused', character_name: 'unused', chat_metadata: {} }, { name: 'You', is_user: true, is_system: false, mes: 'new incarnation', send_date: Date.now() }],
        }) });
        return response.status;
    }, target);
    expect(status).toBe(200);
    await page.reload();
    await testSetup.awaitST({ page });
    await page.evaluate(async () => {
        const context = window.SillyTavern.getContext();
        await context.selectCharacterById(context.characters.findIndex(character => character.name === 'Dev Character 046'));
    });
    expect(await page.evaluate(() => window.SillyTavern.getContext().chat.some(message => message.mes === 'new incarnation'))).toBe(true);
    await page.locator('#options_button').click();
    await page.locator('#option_select_chat').click();
    const pending = page.getByTestId('pending-history-deletions');
    await expect(pending).toContainText(target.file);
    await pending.getByRole('button', { name: /retry deletion/i }).click();
    await expect(pending).toHaveCount(0);
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
    expect(await page.evaluate(() => window.SillyTavern.getContext().chat.some(message => message.mes === 'new incarnation'))).toBe(true);
    const readStatus = await page.evaluate(async ({ avatar, file }) => {
        const { getRequestHeaders } = await import('/script.js');
        return (await fetch('/api/chats/get', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ avatar_url: avatar, file_name: file }) })).status;
    }, target);
    expect(readStatus).toBe(200);
});

test('confirmed current deletion stays retryable if its final recovery checkpoint fails', async ({ page }) => {
    await testSetup.awaitST({ page });
    const file = await page.evaluate(async () => {
        const context = window.SillyTavern.getContext();
        const index = context.characters.findIndex(character => character.name === 'Dev Character 046');
        await context.selectCharacterById(index);
        return context.characters[index].chat;
    });
    const requests = [];
    await page.route('**/api/chats/delete', async route => {
        requests.push(route.request().postDataJSON());
        if (requests.length === 1) {
            const response = await route.fetch();
            expect(response.status()).toBe(200);
            await page.evaluate(() => {
                window.SillyTavern.getContext().chat[0].mes = 'late edit after deletion committed';
                window.originalRecoveryPut = IDBObjectStore.prototype.put;
                IDBObjectStore.prototype.put = function () { throw new DOMException('Storage full', 'QuotaExceededError'); };
            });
            await route.fulfill({ response });
        } else await route.continue();
    });
    const error = await page.evaluate(async name => {
        try { await (await import('/scripts/dom-handlers.js')).runHistoryRowCommand('deleteChat', name, { fromSlashCommand: true }); return 'unexpected success'; }
        catch (reason) { return reason.name; }
    }, file);
    expect(error).toBe('QuotaExceededError');
    expect(await page.evaluate(() => window.SillyTavern.getContext().chat[0].mes)).toBe('late edit after deletion committed');
    await page.evaluate(() => { IDBObjectStore.prototype.put = window.originalRecoveryPut; });
    await page.locator('#options_button').click();
    await page.locator('#option_select_chat').click();
    const pending = page.getByTestId('pending-history-deletions');
    await expect(pending).toContainText(file);
    await pending.getByRole('button', { name: /retry deletion/i }).click();
    await expect(pending).toHaveCount(0);
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
    const saved = await page.evaluate(async () => {
        const storage = (await import('/lib.js')).localforage.createInstance({ name: 'EmberDesk_ChatRecovery' });
        return Promise.all((await storage.keys()).filter(key => key.startsWith('recovery-v1:playwright-e2e:')).map(key => storage.getItem(key)));
    });
    expect(saved.some(draft => draft.identity.chat === file && draft.snapshot.messages.some(message => message.mes === 'late edit after deletion committed'))).toBe(true);
});

test('history UI delete command can retry a lost response after loader cleanup', async ({ page }) => {
    await testSetup.awaitST({ page });
    const file = await page.evaluate(async () => {
        const context = window.SillyTavern.getContext();
        const index = context.characters.findIndex(character => character.name === 'Dev Character 048');
        await context.selectCharacterById(index);
        const { getRequestHeaders } = await import('/script.js');
        const response = await fetch('/api/characters/chats', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ avatar_url: context.characters[index].avatar }) });
        const other = Object.values(await response.json()).find(chat => chat.file_name.replace(/\.jsonl$/, '') !== context.characters[index].chat);
        if (!other) throw new Error('A non-current chat is required');
        return other.file_name.replace(/\.jsonl$/, '');
    });
    const requests = [];
    await page.route('**/api/chats/delete', async route => {
        requests.push(route.request().postDataJSON());
        if (requests.length === 1) { const response = await route.fetch(); expect(response.status()).toBe(200); await route.abort('failed'); }
        else if (requests.length === 2) await route.abort('failed');
        else await route.continue();
    });
    const remove = () => page.evaluate(async name => {
        try { await (await import('/scripts/dom-handlers.js')).runHistoryRowCommand('deleteChat', name, { fromSlashCommand: true }); return true; }
        catch { return false; }
    }, file);
    expect(await remove()).toBe(false);
    await page.locator('#options_button').click();
    await page.locator('#option_select_chat').click();
    const pending = page.getByTestId('pending-history-deletions');
    await expect(pending).toContainText(file);
    await pending.getByRole('button', { name: /retry deletion/i }).click();
    await expect(pending.getByRole('alert')).toContainText(/still unconfirmed/i);
    await pending.getByRole('button', { name: /retry deletion/i }).click();
    await expect(pending).toHaveCount(0);
    expect(requests).toHaveLength(3);
    expect(requests[1]).toEqual(requests[0]);
    expect(requests[2]).toEqual(requests[0]);
});

test('non-current history delete retries a lost response with the same condition', async ({ page }) => {
    await testSetup.awaitST({ page });
    const file = await page.evaluate(async () => {
        const context = window.SillyTavern.getContext();
        const index = context.characters.findIndex(character => character.name === 'Dev Character 048');
        await context.selectCharacterById(index);
        const { getRequestHeaders } = await import('/script.js');
        const response = await fetch('/api/characters/chats', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ avatar_url: context.characters[index].avatar }) });
        const chats = Object.values(await response.json());
        const other = chats.find(chat => chat.file_name.replace(/\.jsonl$/, '') !== context.characters[index].chat);
        if (!other) throw new Error('A non-current chat is required');
        return other.file_name.replace(/\.jsonl$/, '');
    });
    const requests = [];
    await page.route('**/api/chats/delete', async route => {
        requests.push(route.request().postDataJSON());
        if (requests.length === 1) { const response = await route.fetch(); expect(response.status()).toBe(200); await route.abort('failed'); }
        else await route.continue();
    });
    const remove = () => page.evaluate(async name => {
        try {
            const context = window.SillyTavern.getContext();
            await (await import('/scripts/chat-ops-service.js')).deleteCharacterChatByName(context.characterId, name);
            return true;
        }
        catch { return false; }
    }, file);
    expect(await remove()).toBe(false);
    expect(await remove()).toBe(true);
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
    expect(requests[0].version).toMatch(/^[0-9a-f]{32}$/);
    expect(requests[0].operationId).toBeTruthy();
});

test('recovery UI hides another account and retries an ambiguous restore unchanged', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.evaluate(async () => {
        const context = window.SillyTavern.getContext();
        const index = context.characters.findIndex(character => character.name === 'Dev Character 047');
        await context.selectCharacterById(index);
        const storage = (await import('/lib.js')).localforage.createInstance({ name: 'EmberDesk_ChatRecovery' });
        const draft = { version: 1, id: 'ui-retry-draft', identity: { avatar: context.characters[index].avatar, chat: 'visible-draft' }, updatedAt: Date.now(), snapshot: { metadata: {}, messages: [{ name: 'Test', mes: 'recover me', is_user: true, is_system: false, send_date: Date.now() }] } };
        await storage.setItem('recovery-v1:playwright-e2e:ui-retry-draft', draft);
        await storage.setItem('recovery-v1:other-account:other-id', { ...draft, id: 'other-id', identity: { ...draft.identity, chat: 'private-other-account' } });
        await storage.setItem('delete-v1:other-account:other-avatar:private-delete', { done: false, request: { avatar_url: 'other-avatar', chatfile: 'private-delete.jsonl', version: 'other-version', operationId: 'other-operation' } });
        window.dispatchEvent(new Event('emberdesk:recovery-drafts-changed'));
    });
    const requests = [];
    await page.route('**/api/chats/save', async route => {
        const body = route.request().postDataJSON();
        if (body.operationId !== 'ui-retry-draft') return route.continue();
        requests.push(body);
        if (requests.length === 1) { const response = await route.fetch(); expect(response.status()).toBe(200); await route.abort('failed'); }
        else await route.continue();
    });
    await page.locator('#options_button').click();
    await page.locator('#option_select_chat').click();
    const drafts = page.getByTestId('chat-recovery-drafts');
    await expect(drafts).toContainText('visible-draft');
    await expect(drafts).not.toContainText('private-other-account');
    await expect(page.locator('#select_chat_popup')).not.toContainText('private-delete');
    const row = drafts.locator('li').filter({ hasText: 'visible-draft' });
    await row.getByRole('button', { name: /restore.*new/i }).click();
    await expect(drafts.getByRole('status')).toContainText(/local copy is unchanged/i);
    await expect(row.getByRole('button', { name: /export/i })).toBeEnabled();
    await row.getByRole('button', { name: /restore.*new/i }).click();
    await expect(drafts.getByRole('status')).toContainText('Recovered-ui-retry-draft');
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
});

test('recovery creates a separate chat and retains the local export', async ({ page }) => {
    await testSetup.awaitST({ page });
    const avatar = await page.evaluate(async () => {
        const context = window.SillyTavern.getContext();
        const index = context.characters.findIndex(character => character.name === 'Dev Character 047');
        await context.selectCharacterById(index);
        const avatar = context.characters[index].avatar;
        const storage = (await import('/lib.js')).localforage.createInstance({ name: 'EmberDesk_ChatRecovery' });
        await storage.setItem('recovery-v1:playwright-e2e:browser-restore-test', {
            version: 1, id: 'browser-restore-test', identity: { avatar, chat: 'original' }, updatedAt: Date.now(),
            snapshot: { metadata: {}, messages: [{ name: 'Test', mes: 'Recovered exact text', is_user: true, is_system: false, send_date: Date.now() }] },
        });
        window.dispatchEvent(new Event('emberdesk:recovery-drafts-changed'));
        return avatar;
    });
    await page.locator('#options_button').click();
    await page.locator('#option_select_chat').click();
    const drafts = page.getByTestId('chat-recovery-drafts');
    await expect(drafts).toContainText('original');
    const saved = page.waitForResponse(response => response.url().endsWith('/api/chats/save') && response.request().postDataJSON().operationId === 'browser-restore-test');
    await drafts.getByRole('button', { name: /restore.*new/i }).click();
    const response = await saved;
    expect(response.status()).toBe(200);
    expect(response.request().postDataJSON()).toMatchObject({ create: true, avatar_url: avatar, file_name: 'Recovered-browser-restore-test' });
    await expect(drafts).toContainText('Recovered-browser-restore-test');
    await expect(drafts.getByRole('button', { name: /export/i })).toBeVisible();
});

test('a deletion with a lost response leaves the late edit discoverable after switching chats and reloading', async ({ page }) => {

    test.setTimeout(120_000);
    await testSetup.awaitST({ page });


    const chat = await page.evaluate(async () => {
        const context = window.SillyTavern.getContext();
        context.chatCompletionSettings.chat_memory_enabled = false;
        const index = context.characters.findIndex(character => character.name === 'Dev Character 048');
        await context.selectCharacterById(index);
        return context.characters[index].chat;
    });
    let release, committed;
    const hold = new Promise(resolve => { release = resolve; });
    const deleted = new Promise(resolve => { committed = resolve; });
    await page.route('**/api/chats/delete', async route => {
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        committed();
        await hold;
        await route.abort('failed');
    });
    const deletion = page.evaluate(async file => {
        try { await (await import('/scripts/dom-handlers.js')).runHistoryRowCommand('deleteChat', file, { fromSlashCommand: true }); }
        catch { /* a lost response is expected */ }
    }, chat);
    try {
        await deleted;
        await page.evaluate(() => { window.SillyTavern.getContext().chat[0].mes = 'late recovery edit 82731'; });
    } finally {
        release();
        await deletion;
    }
    const row = page.locator('#chat .mes').first();
    await row.locator('.mes_edit').evaluate(element => element.click());
    await row.locator('.edit_textarea').fill('unsubmitted message editor 82731');
    await expect.poll(() => page.evaluate(async () => JSON.stringify([...(await import('/scripts/chat-ops-shell-context.js')).getChatOpsShellContext().state.mainChatMessageUiState]))).toContain('unsubmitted message editor 82731');
    await page.locator('#send_textarea').fill('unsubmitted composer 82731');
    await page.evaluate(async () => {
        const context = window.SillyTavern.getContext();
        const index = context.characters.findIndex(character => character.name === 'Dev Character 047');
        if (index < 0) throw new Error('Switch target missing');
        await context.selectCharacterById(index);
        if (String(window.SillyTavern.getContext().characterId) !== String(index)) throw new Error('Switch did not complete');
    });
    await page.reload();
    await testSetup.awaitST({ page });

    await page.evaluate(async () => {
        const context = window.SillyTavern.getContext();
        await context.selectCharacterById(context.characters.findIndex(character => character.name === 'Dev Character 048'));
    });
    await page.locator('#options_button').click();
    await page.locator('#option_select_chat').click();

    const drafts = page.getByTestId('chat-recovery-drafts');
    await expect(drafts).toContainText(chat);
    const download = page.waitForEvent('download');
    await drafts.getByRole('button', { name: /export/i }).first().click();
    const file = await download;
    const saved = JSON.parse(await readFile(await file.path(), 'utf8'));
    expect(saved.identity.chat).toBe(chat);
    expect(saved.snapshot.messages.some(message => message.mes === 'late recovery edit 82731')).toBe(true);
    expect(JSON.stringify(saved.snapshot.editor)).toContain('unsubmitted message editor 82731');
    expect(saved.snapshot.composer.value).toBe('unsubmitted composer 82731');
    const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/chats/save') && response.request().postDataJSON().operationId === saved.id);
    await drafts.getByRole('button', { name: /restore.*new/i }).first().click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    const request = response.request().postDataJSON();
    expect(request).toMatchObject({ create: true, file_name: `Recovered-${saved.id}` });
    expect(request.chat.some(message => message.mes === 'late recovery edit 82731')).toBe(true);
    const item = drafts.locator('li').filter({ hasText: chat }).first();
    await item.getByRole('button', { name: /show unsent text/i }).click();
    await expect(item.getByRole('textbox', { name: /composer draft/i })).toHaveValue('unsubmitted composer 82731');
    await expect(item.getByRole('textbox', { name: /message edit draft/i })).toHaveValue('unsubmitted message editor 82731');
});

test('storage failure prevents deleting the current chat', async ({ page }) => {
    await testSetup.awaitST({ page });
    const chat = await page.evaluate(async () => {
        const context = window.SillyTavern.getContext();
        const index = context.characters.findIndex(character => character.name === 'Dev Character 047');
        await context.selectCharacterById(index);
        IDBObjectStore.prototype.put = function () { throw new DOMException('Storage full', 'QuotaExceededError'); };
        return context.characters[index].chat;
    });
    let requests = 0;
    await page.route('**/api/chats/delete', route => { requests++; return route.continue(); });
    const outcome = await page.evaluate(async file => {
        try { await (await import('/scripts/dom-handlers.js')).runHistoryRowCommand('deleteChat', file, { fromSlashCommand: true }); return 'resolved'; }
        catch (error) { return error.name; }
    }, chat);
    expect(outcome).toBe('QuotaExceededError');
    expect(requests).toBe(0);
    expect(await page.evaluate(() => window.SillyTavern.getContext().chat.length)).toBeGreaterThan(0);
});

test('an IndexedDB deletion transaction failure leaves the recovery draft and sends nothing', async ({ page }) => {
    await testSetup.awaitST({ page });
    const file = await page.evaluate(async () => {
        const state = window.SillyTavern.getContext();
        const index = state.characters.findIndex(character => character.name === 'Dev Character 047');
        await state.selectCharacterById(index);
        Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
        const put = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (value, key) {
            if (String(key).startsWith('delete-v1:')) throw new DOMException('Storage full', 'QuotaExceededError');
            return put.call(this, value, key);
        };
        return state.characters[index].chat;
    });
    let requests = 0;
    await page.route('**/api/chats/delete', route => { requests++; return route.continue(); });
    const error = await page.evaluate(async name => {
        try { await (await import('/scripts/dom-handlers.js')).runHistoryRowCommand('deleteChat', name, { fromSlashCommand: true }); return ''; }
        catch (reason) { return reason.name; }
    }, file);
    expect(error).toBe('QuotaExceededError');
    expect(requests).toBe(0);
    expect(await page.evaluate(async () => {
        const storage = (await import('/lib.js')).localforage.createInstance({ name: 'EmberDesk_ChatRecovery' });
        return (await storage.keys()).filter(key => key.startsWith('recovery-v1:')).length;
    })).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.SillyTavern.getContext().chat.length)).toBeGreaterThan(0);
});

test('current deletion remains available without Web Locks', async ({ page }) => {
    await testSetup.awaitST({ page });
    const file = await page.evaluate(async () => {
        const state = window.SillyTavern.getContext();
        const index = state.characters.findIndex(character => character.name === 'Dev Character 047');
        await state.selectCharacterById(index);
        Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
        return state.characters[index].chat;
    });
    let requests = 0;
    await page.route('**/api/chats/delete', route => { requests++; return route.continue(); });
    const result = await page.evaluate(async name => {
        try { await (await import('/scripts/dom-handlers.js')).runHistoryRowCommand('deleteChat', name, { fromSlashCommand: true }); return 'ok'; }
        catch (reason) { return reason.message; }
    }, file);
    expect(result).toBe('ok');
    expect(requests).toBe(1);
});

test('a failed checkpoint leaves the selected session and late edit in memory', async ({ page }) => {
    await testSetup.awaitST({ page });
    const chat = await page.evaluate(async () => {
        const context = window.SillyTavern.getContext();
        const index = context.characters.findIndex(character => character.name === 'Dev Character 048');
        await context.selectCharacterById(index);
        return context.characters[index].chat;
    });
    await page.route('**/api/chats/delete', route => route.abort('failed'));
    await page.evaluate(async file => {
        try { await (await import('/scripts/dom-handlers.js')).runHistoryRowCommand('deleteChat', file, { fromSlashCommand: true }); } catch {}
        window.SillyTavern.getContext().chat[0].mes = 'unsaved late edit';
        IDBObjectStore.prototype.put = function () { throw new DOMException('Storage full', 'QuotaExceededError'); };
    }, chat);
    await expect.poll(() => page.evaluate(async () => (await import('/script.js')).isChatSaving)).toBe(false);
    const result = await page.evaluate(async () => {
        const context = window.SillyTavern.getContext();
        const original = context.characterId;
        let error = '';
        try { await context.selectCharacterById(context.characters.findIndex(character => character.name === 'Dev Character 047')); } catch (reason) { error = reason.name; }
        return { original, current: window.SillyTavern.getContext().characterId, text: context.chat[0]?.mes, error };
    });
    expect(result.error).toBe('QuotaExceededError');
    expect(result.current).toBe(result.original);
    expect(result.text).toBe('unsaved late edit');
});
