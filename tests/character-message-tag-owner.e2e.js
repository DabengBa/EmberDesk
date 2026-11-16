import { expect, test } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';

test.setTimeout(120_000);

test('React message tags follow displayed avatars, live edits, and chat switches', async ({ page }) => {
    await testSetup.awaitST({ page });
    const names = { first: `owner-a-${crypto.randomUUID().slice(0, 8)}`, second: `owner-b-${crypto.randomUUID().slice(0, 8)}` };
    const fixture = await page.evaluate(async names => {
        const context = window.SillyTavern.getContext();
        const first = context.characters.find(c => c.name === 'Dev Character 001');
        const second = context.characters.find(c => c.name === 'Dev Character 002');
        if (!first || !second) throw new Error('Seeded characters missing');
        const tags = await import('/scripts/tags.js');
        const management = tags.createTagManagementRuntime();
        const firstTag = management.commands.createTag(names.first);
        const secondTag = management.commands.createTag(names.second);
        tags.createBulkTagEditorRuntime([first.avatar]).commands.addTag(firstTag);
        tags.createBulkTagEditorRuntime([second.avatar]).commands.addTag(secondTag);
        await context.selectCharacterById(context.characters.indexOf(first));
        await context.openCharacterChat('Dev Character 001 Session 01');
        return { firstAvatar: first.avatar, secondAvatar: second.avatar, firstTag, secondTag };
    }, names);

    // The forced-avatar message is persisted on chat switches. Work on a
    // disposable canonical copy so other specs keep their seeded transcript.
    const originalChat = await page.evaluate(async avatar => {
        const { token } = await fetch('/csrf-token').then(response => response.json());
        const response = await fetch('/api/chats/get', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
            body: JSON.stringify({ avatar_url: avatar, file_name: 'Dev Character 001 Session 01' }),
        });
        if (!response.ok) throw new Error(`Reading seeded chat failed: ${response.status}`);
        return response.json();
    }, fixture.firstAvatar);
    expect(Array.isArray(originalChat)).toBe(true);
    const ownerChat = `tag-owner-${crypto.randomUUID()}`;
    await testSetup.saveCharacterChat({ page, characterName: 'Dev Character 001', avatarUrl: fixture.firstAvatar, fileName: ownerChat, chat: originalChat });
    await page.evaluate(async fileName => window.SillyTavern.getContext().openCharacterChat(fileName), ownerChat);

    await expect(page.locator('#chat')).toHaveAttribute('data-react-main-chat-owner', 'react');
    const ordinary = page.locator('#chat .mes').filter({ has: page.locator(`.avatar img[src*="${fixture.firstAvatar}"]`) }).first();
    await expect(ordinary).toHaveAttribute('data-main-chat-message-row-owner', 'react');
    await expect(ordinary).toHaveAttribute(`data-char-tag-${names.first}`, '');
    await ordinary.evaluate(row => { window.__tagOwnerOrdinary = row; });
    const liveName = `${names.first}-live`;
    const liveId = await page.evaluate(async ({ avatar, name }) => {
        const tags = await import('/scripts/tags.js');
        const id = tags.createTagManagementRuntime().commands.createTag(name);
        tags.createBulkTagEditorRuntime([avatar]).commands.addTag(id);
        return id;
    }, { avatar: fixture.firstAvatar, name: liveName });
    await expect(ordinary).toHaveAttribute(`data-char-tag-${liveName}`, '');
    expect(await ordinary.evaluate(row => row === window.__tagOwnerOrdinary)).toBe(true);
    await page.evaluate(async ({ avatar, id }) => (await import('/scripts/tags.js')).createBulkTagEditorRuntime([avatar]).commands.removeTag(id), { avatar: fixture.firstAvatar, id: liveId });
    await expect(ordinary).not.toHaveAttribute(`data-char-tag-${liveName}`, '');
    expect(await ordinary.evaluate(row => row === window.__tagOwnerOrdinary)).toBe(true);

    const forcedId = await page.evaluate(avatar => {
        const context = window.SillyTavern.getContext();
        const message = { name: 'Forced avatar', is_user: false, mes: 'forced avatar fixture', send_date: new Date().toISOString(), force_avatar: `/thumbnail?type=avatar&file=${encodeURIComponent(avatar)}` };
        const id = context.chat.length;
        context.chat.push(message);
        context.addOneMessage(message, { scroll: false });
        return id;
    }, fixture.secondAvatar);
    const forced = page.locator(`#chat .mes[mesid="${forcedId}"]`);
    await expect(forced.locator('.avatar img')).toHaveAttribute('src', new RegExp(fixture.secondAvatar.replace('.', '\\.')));
    await expect.poll(() => forced.locator('.avatar img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    await expect(forced).toHaveAttribute(`data-char-tag-${names.second}`, '');
    await expect(forced).not.toHaveAttribute(`data-char-tag-${names.first}`, '');
    await forced.evaluate(row => { window.__tagOwnerForced = row; });

    const renamed = `${names.second}-renamed`;
    await page.evaluate(async ({ id, renamed }) => (await import('/scripts/tags.js')).createTagManagementRuntime().commands.renameTag(id, renamed), { id: fixture.secondTag, renamed });
    await expect(forced).toHaveAttribute(`data-char-tag-${renamed}`, '');
    await expect(forced).not.toHaveAttribute(`data-char-tag-${names.second}`, '');
    expect(await forced.evaluate(row => row === window.__tagOwnerForced)).toBe(true);
    expect(await ordinary.evaluate(row => row === window.__tagOwnerOrdinary)).toBe(true);

    await page.evaluate(async ({ avatar, id }) => (await import('/scripts/tags.js')).createBulkTagEditorRuntime([avatar]).commands.removeTag(id), { avatar: fixture.secondAvatar, id: fixture.secondTag });
    await expect(forced).not.toHaveAttribute(`data-char-tag-${renamed}`, '');
    await expect(forced).not.toHaveAttribute('data-char-tags', new RegExp(renamed));
    expect(await forced.evaluate(row => row === window.__tagOwnerForced)).toBe(true);

    await page.evaluate(async () => window.SillyTavern.getContext().openCharacterChat('Dev Character 001 Session 02'));
    await expect.poll(() => page.evaluate(() => {
        const context = window.SillyTavern.getContext();
        return context.characters[context.characterId]?.chat;
    })).toBe('Dev Character 001 Session 02');
    await expect(page.locator('#chat .mes').filter({ has: page.locator(`.avatar img[src*="${fixture.firstAvatar}"]`) }).first()).toHaveAttribute(`data-char-tag-${names.first}`, '');
    await page.evaluate(async () => {
        const context = window.SillyTavern.getContext();
        await context.selectCharacterById(context.characters.findIndex(c => c.name === 'Dev Character 002'));
        await context.openCharacterChat('Dev Character 002 Session 01');
    });
    await expect.poll(() => page.evaluate(() => {
        const context = window.SillyTavern.getContext();
        return [context.characters[context.characterId]?.name, context.characters[context.characterId]?.chat];
    })).toEqual(['Dev Character 002', 'Dev Character 002 Session 01']);
    const secondRow = page.locator('#chat .mes').filter({ has: page.locator(`.avatar img[src*="${fixture.secondAvatar}"]`) }).first();
    await expect(secondRow).toHaveAttribute('data-main-chat-message-row-owner', 'react');
    await expect(secondRow).not.toHaveAttribute(`data-char-tag-${names.first}`, '');
    await page.evaluate(async ({ avatar, id }) => (await import('/scripts/tags.js')).createBulkTagEditorRuntime([avatar]).commands.addTag(id), { avatar: fixture.secondAvatar, id: fixture.secondTag });
    await expect(secondRow).toHaveAttribute(`data-char-tag-${renamed}`, '');
    await secondRow.evaluate(row => { window.__tagOwnerSecond = row; });
    await page.evaluate(async id => { window.__deleteTag = (await import('/scripts/tags.js')).createTagManagementRuntime().commands.deleteTag(id); }, fixture.secondTag);
    await page.locator('dialog[open]').filter({ has: page.locator('#merge_tag_select') }).locator('.popup-button-ok').click();
    await page.evaluate(() => window.__deleteTag);
    await expect(secondRow).not.toHaveAttribute(`data-char-tag-${renamed}`, '');
    await expect(secondRow).not.toHaveAttribute('data-char-tags', new RegExp(renamed));
    expect(await secondRow.evaluate(row => row === window.__tagOwnerSecond)).toBe(true);
    const seededAfter = await page.evaluate(async avatar => {
        const { token } = await fetch('/csrf-token').then(response => response.json());
        const response = await fetch('/api/chats/get', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
            body: JSON.stringify({ avatar_url: avatar, file_name: 'Dev Character 001 Session 01' }),
        });
        if (!response.ok) throw new Error(`Reading seeded chat failed: ${response.status}`);
        return response.json();
    }, fixture.firstAvatar);
    expect(seededAfter.some(message => message.mes === 'forced avatar fixture')).toBe(false);
});
