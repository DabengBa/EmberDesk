import { isolatedCharacterLibraryTest, expect } from './helpers/isolated-character-library-test.js';
import { testSetup } from './frontend/frontent-test-utils.js';

const test = isolatedCharacterLibraryTest({ lazy: true });

const editor = '[data-react-authoring-owner="characterAuthoring"]';
const description = `${editor} [data-react-authoring-field="description"] textarea`;
const authoringName = `${editor} [data-react-authoring-field="name"] input`;
const avatar = n => `dev-character-${String(n).padStart(3, '0')}.png`;
const name = n => `Dev Character ${String(n).padStart(3, '0')}`;

async function clickCharacter(page, n) {
    await page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '角色库' }).first().click();
    await page.locator('#emberdesk-react-character-search').fill(name(n));
    await page.locator('#rm_print_characters_block .character_select').filter({ hasText: name(n) }).first().click();
}

async function state(page) {
    return page.evaluate(() => {
        const c = window.SillyTavern.getContext();
        const character = c.characters[c.characterId];
        return {
            avatar: character?.avatar, name: c.name2, chatId: c.getCurrentChatId(),
            description: character?.description,
            messages: c.chat.map(m => ({ name: m.name, mes: m.mes })),
            hiddenSubmitAvatar: document.querySelector('#avatar_url_pole')?.value,
            authoringName: document.querySelector('[data-react-authoring-owner="characterAuthoring"] [data-react-authoring-field="name"] input')?.value,
            draft: document.querySelector('[data-react-authoring-owner="characterAuthoring"] [data-react-authoring-field="description"] textarea')?.value,
        };
    });
}

async function settled(page, n) {
    await expect.poll(async () => (await state(page)).avatar).toBe(avatar(n));
    await expect.poll(async () => (await state(page)).name).toBe(name(n));
    await expect.poll(async () => (await state(page)).hiddenSubmitAvatar).toBe(avatar(n));
    await expect(page.locator(authoringName)).toBeVisible();
    await expect(page.locator(authoringName)).toHaveValue(name(n));
    await expect(page.locator(description)).toBeVisible();
    await expect.poll(async () => (await state(page)).messages.length).toBeGreaterThan(0);
    await expect(page.locator('#chat .mes').first()).toBeVisible();
}

async function api(page, url, body) {
    return page.evaluate(async ({ url, body }) => {
        const { getRequestHeaders } = await import('/scripts/request-context.js');
        const response = await fetch(url, { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify(body) });
        if (!response.ok) throw new Error(`${url}: ${response.status}`);
        return response.text();
    }, { url, body });
}

// Hold a real response already obtained from the isolated server, not a
// delayed request that could accidentally read the newer value on release.
async function hold(page, path, matches = () => true, transform = x => x) {
    let release;
    let entered;
    let used = false;
    const seen = new Promise(resolve => { entered = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    const events = [];
    const pattern = `**${path}`;
    const handler = async route => {
        if (used || !matches(route.request())) return route.continue();
        used = true;
        const response = await route.fetch({ timeout: 10_000 });
        const payload = await response.json();
        events.push('response-captured');
        entered({ request: route.request().postData(), payload });
        await gate;
        events.push('response-released');
        await route.fulfill({ response, json: transform(payload) });
    };
    await page.route(pattern, handler);
    return {
        events, release,
        async wait() { let timer; try { return await Promise.race([seen, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Gate not reached: ${path}`)), 12_000); })]); } finally { clearTimeout(timer); } },
        async cleanup() { release(); await page.unroute(pattern, handler); },
    };
}

async function startRefresh(page) {
    await page.evaluate(() => { window.u011Refresh = window.SillyTavern.getContext().getCharacters(); });
}
async function finishRefresh(page) {
    await page.evaluate(() => window.u011Refresh);
}
async function evidence(testInfo, value) {
    console.log('U011 observation', JSON.stringify(value));
    await testInfo.attach('observation', { body: JSON.stringify(value, null, 2), contentType: 'application/json' });
}

test('a refresh started on A must not undo a completed UI selection of B', async ({ page }, testInfo) => {
    await testSetup.awaitST({ page });
    await clickCharacter(page, 1);
    await settled(page, 1);
    const gate = await hold(page, '/api/characters/all', () => true, list => list.map(c => c.avatar === avatar(3) ? { ...c, name: `${c.name} changed` } : c));
    try {
        await startRefresh(page);
        await gate.wait();
        const bRequest = page.waitForRequest(request => request.url().endsWith('/api/chats/get') && request.postDataJSON()?.avatar_url === avatar(2));
        await clickCharacter(page, 2);
        const expectedChatId = (await bRequest).postDataJSON().file_name;
        expect(expectedChatId).toBeTruthy();
        await settled(page, 2);
        const before = await state(page);
        expect(before.chatId).toBe(expectedChatId);
        gate.events.push('B-chat-and-editor-ready');
        gate.release();
        await finishRefresh(page);
        gate.events.push('refresh-complete');
        const after = await state(page);
        await evidence(testInfo, { events: gate.events, expectedChatId, before, after });
        expect.soft(after.avatar).toBe(avatar(2));
        expect.soft(after.name).toBe(name(2));
        expect.soft(after.hiddenSubmitAvatar).toBe(avatar(2));
        expect.soft(after.chatId).toBe(expectedChatId);
        expect.soft(after.authoringName).toBe(name(2));
        await expect.soft(page.locator(authoringName)).toBeVisible();
        expect.soft(after.messages).toEqual(before.messages);
    } finally { await gate.cleanup(); }
});

test('a reordered refresh during B chat loading keeps B chat and editor aligned', async ({ page }, testInfo) => {
    await testSetup.awaitST({ page });
    await clickCharacter(page, 1);
    await settled(page, 1);
    const gate = await hold(page, '/api/chats/get', request => request.postDataJSON().avatar_url === avatar(2));
    const reorder = async route => {
        const response = await route.fetch();
        await route.fulfill({ response, json: (await response.json()).reverse() });
    };
    try {
        await clickCharacter(page, 2);
        const held = await gate.wait();
        const expectedChatId = JSON.parse(held.request).file_name;
        expect(expectedChatId).toBeTruthy();
        await page.route('**/api/characters/all', reorder);
        await startRefresh(page);
        await finishRefresh(page);
        gate.events.push('reordered-refresh-complete');
        const during = await state(page);
        gate.release();
        await settled(page, 2);
        const after = await state(page);
        await evidence(testInfo, { events: gate.events, request: held.request, expectedChatId, during, after });
        expect(after.avatar).toBe(avatar(2));
        expect(after.hiddenSubmitAvatar).toBe(avatar(2));
        expect(after.chatId).toBe(expectedChatId);
        expect(after.authoringName).toBe(name(2));
        await expect(page.locator(authoringName)).toBeVisible();
        expect(after.messages).toEqual(held.payload.slice(1).map(m => ({ name: m.name, mes: m.mes })));
    } finally { await gate.cleanup(); await page.unroute('**/api/characters/all', reorder); }
});

test('U013 ordinary detail loading writes the response and reports success', async ({ page }) => {
    await testSetup.awaitST({ page });
    const result = await page.evaluate(async target => {
        const app = await import('/script.js');
        const chars = window.SillyTavern.getContext().characters;
        const before = chars.find(c => c.avatar === target);
        const beforeShallow = before?.shallow;
        const ok = await app.getOneCharacter(target);
        const after = chars.find(c => c.avatar === target);
        return { beforeShallow, ok, replaced: before !== after, afterShallow: Boolean(after?.shallow), avatar: after?.avatar };
    }, avatar(11));
    expect(result).toEqual({ beforeShallow: true, ok: true, replaced: true, afterShallow: false, avatar: avatar(11) });
});

test('U013 replaced still-shallow target discards old detail and reports failure', async ({ page }) => {
    await testSetup.awaitST({ page });
    const target = avatar(10);
    const gate = await hold(page, '/api/characters/get', request => request.postDataJSON().avatar_url === target);
    try {
        await page.evaluate(async target => {
            const app = await import('/script.js');
            window.u013Detail = app.getOneCharacter(target);
        }, target);
        await gate.wait();
        const published = await page.evaluate(async target => {
            const app = await import('/script.js');
            const chars = window.SillyTavern.getContext().characters;
            const before = chars.find(c => c.avatar === target);
            const snapshot = structuredClone(chars);
            const next = snapshot.find(c => c.avatar === target);
            next.description = 'U013 replacement still shallow';
            next.shallow = true;
            await app.publishCharacterLibrarySnapshot(snapshot);
            window.u013Published = chars.find(c => c.avatar === target);
            return { wasShallow: before.shallow, replaced: before !== window.u013Published, shallow: window.u013Published.shallow };
        }, target);
        expect(published).toEqual({ wasShallow: true, replaced: true, shallow: true });
        gate.release();
        const result = await page.evaluate(async target => {
            const ok = await window.u013Detail;
            const current = window.SillyTavern.getContext().characters.find(c => c.avatar === target);
            return { ok, same: current === window.u013Published, shallow: current.shallow, description: current.description };
        }, target);
        expect(result).toEqual({ ok: false, same: true, shallow: true, description: 'U013 replacement still shallow' });
    } finally { await gate.cleanup(); }
});

test('a captured shallow detail response must not overwrite a newer published detail', async ({ page }, testInfo) => {
    await testSetup.awaitST({ page });
    const shallow = await page.evaluate(a => window.SillyTavern.getContext().characters.find(c => c.avatar === a)?.shallow, avatar(4));
    expect(shallow, 'The isolated server must serve shallow characters').toBe(true);
    const gate = await hold(page, '/api/characters/get', request => request.postDataJSON().avatar_url === avatar(4));
    try {
        await clickCharacter(page, 4);
        const held = await gate.wait();
        const updated = 'U011 newer server description';
        await api(page, '/api/characters/edit-attribute', { avatar_url: avatar(4), ch_name: name(4), field: 'description', value: updated });
        gate.events.push('new-description-committed');
        await startRefresh(page);
        await finishRefresh(page);
        const published = await state(page);
        expect(published.description).toBe(updated);
        gate.events.push('new-description-published');
        gate.release();
        await settled(page, 4);
        const after = await state(page);
        await evidence(testInfo, { events: gate.events, oldDescription: held.payload.description, published, after });
        expect.soft(after.description).toBe(updated);
        expect.soft(after.draft).toBe(updated);
    } finally { await gate.cleanup(); }
});

async function selectAThenB(page) {
    await testSetup.awaitST({ page });
    await clickCharacter(page, 1);
    await settled(page, 1);
}

async function completeB(page) {
    const chat = page.waitForRequest(request => request.url().endsWith('/api/chats/get') && request.postDataJSON()?.avatar_url === avatar(2));
    await clickCharacter(page, 2);
    const chatId = (await chat).postDataJSON().file_name;
    await settled(page, 2);
    const before = await state(page);
    expect(before.chatId).toBe(chatId);
    return before;
}

async function assertBStillSelected(page, before) {
    const after = await state(page);
    expect(after.avatar).toBe(avatar(2));
    expect(after.chatId).toBe(before.chatId);
    expect(after.name).toBe(name(2));
    expect(after.authoringName).toBe(name(2));
    await expect(page.locator(authoringName)).toBeVisible();
    expect(after.hiddenSubmitAvatar).toBe(avatar(2));
    expect(after.messages).toEqual(before.messages);
    await expect(page.locator('#chat .mes').first()).toBeVisible();
}

// When the old implementation opens its missing-A dialog, dismiss it so the
// red test terminates without leaving a pending refresh behind.
async function completionOrMissingDialog(page, promiseName) {
    const result = await Promise.race([
        page.evaluate(key => window[key].then(() => 'completed'), promiseName),
        page.locator('dialog[open]').waitFor({ state: 'visible', timeout: 10_000 }).then(() => 'dialog'),
    ]);
    if (result === 'dialog') {
        const message = await page.locator('dialog[open]').innerText();
        console.log('Unexpected missing-character dialog:', message);
        await page.locator('dialog[open] .popup-button-ok').click();
    }
    return result;
}

test('U012 completed B survives a refresh removing A and changing B index', async ({ page }, testInfo) => {
    await selectAThenB(page);
    const gate = await hold(page, '/api/characters/all', () => true, list => list.filter(c => c.avatar !== avatar(1)).reverse());
    try {
        await startRefresh(page);
        const captured = await gate.wait();
        const oldIndex = captured.payload.findIndex(c => c.avatar === avatar(2));
        const newIndex = captured.payload.filter(c => c.avatar !== avatar(1)).reverse().findIndex(c => c.avatar === avatar(2));
        expect(newIndex).not.toBe(oldIndex);
        const before = await completeB(page);
        gate.release();
        const outcome = await completionOrMissingDialog(page, 'u011Refresh');
        await evidence(testInfo, { oldIndex, newIndex, before, outcome });
        expect(outcome, 'old A must not trigger a missing-character reload').toBe('completed');
        await assertBStillSelected(page, before);
    } finally { await gate.cleanup(); }
});

test('U012 standalone publication uses completed B rather than an old A argument', async ({ page }, testInfo) => {
    await selectAThenB(page);
    const before = await completeB(page);
    await page.evaluate(async oldAvatar => {
        const app = await import('/script.js');
        const snapshot = structuredClone(window.SillyTavern.getContext().characters).filter(c => c.avatar !== oldAvatar).reverse();
        window.u012Publish = app.publishCharacterLibrarySnapshot(snapshot, { previousAvatar: oldAvatar });
    }, avatar(1));
    const outcome = await completionOrMissingDialog(page, 'u012Publish');
    await evidence(testInfo, { before, outcome });
    expect(outcome, 'standalone publication must not use stale A').toBe('completed');
    await assertBStillSelected(page, before);
});

test('U012 missing current B still warns and reloads even when old A remains', async ({ page }) => {
    await selectAThenB(page);
    await completeB(page);
    await page.evaluate(async ({ a, b }) => {
        const app = await import('/script.js');
        const snapshot = structuredClone(window.SillyTavern.getContext().characters).filter(c => c.avatar !== b).reverse();
        window.u012Missing = app.publishCharacterLibrarySnapshot(snapshot, { previousAvatar: a });
    }, { a: avatar(1), b: avatar(2) });
    const dialog = page.locator('dialog[open]');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    const navigation = page.waitForEvent('load', { timeout: 15_000 });
    await dialog.locator('.popup-button-ok').click();
    await navigation;
});

test('U014 normal shallow selection loads real detail and chat', async ({ page }, testInfo) => {
    await testSetup.awaitST({ page });
    const target = avatar(7);
    expect(await page.evaluate(a => window.SillyTavern.getContext().characters.find(c => c.avatar === a)?.shallow, target)).toBe(true);
    const detail = page.waitForResponse(r => r.url().endsWith('/api/characters/get') && r.request().postDataJSON()?.avatar_url === target);
    const chat = page.waitForResponse(r => r.url().endsWith('/api/chats/get') && r.request().postDataJSON()?.avatar_url === target);
    await clickCharacter(page, 7);
    const detailResponse = await detail;
    const detailData = await detailResponse.json();
    const chatResponse = await chat;
    const chatPayload = await chatResponse.json();
    await settled(page, 7);
    const actual = await state(page);
    const shallow = await page.evaluate(a => Boolean(window.SillyTavern.getContext().characters.find(c => c.avatar === a)?.shallow), target);
    const observation = { detailStatus: detailResponse.status(), chatStatus: chatResponse.status(), chatRequest: chatResponse.request().postDataJSON(), detailDescription: detailData.description, chatMessageCount: chatPayload.length - 1, actual, shallow };
    await testInfo.attach('u014-control', { body: JSON.stringify(observation, null, 2), contentType: 'application/json' });
    expect(detailResponse.ok()).toBe(true);
    expect(chatResponse.ok()).toBe(true);
    expect(shallow).toBe(false);
    expect(actual.description).toBe(detailData.description);
    expect(actual.draft).toBe(detailData.description);
    expect(actual.chatId).toBe(observation.chatRequest.file_name);
    expect(actual.messages).toEqual(chatPayload.slice(1).map(({ name, mes }) => ({ name, mes })));
    console.log('U014 control', JSON.stringify({ detailStatus: observation.detailStatus, chatStatus: observation.chatStatus, chatRequest: observation.chatRequest, chatMessageCount: observation.chatMessageCount, shallow, avatar: actual.avatar, chatId: actual.chatId, authoringName: actual.authoringName, hiddenSubmitAvatar: actual.hiddenSubmitAvatar, descriptionMatchesDetail: actual.draft === detailData.description }));
});

test('U014 observe selected shallow replacement while detail responses are in flight', async ({ page }, testInfo) => {
    await testSetup.awaitST({ page });
    const target = avatar(8);
    const pending = [];
    const handler = async route => {
        if (route.request().postDataJSON()?.avatar_url !== target) return route.continue();
        const response = await route.fetch({ timeout: 10_000 });
        const payload = await response.json();
        let release;
        const gate = new Promise(resolve => { release = resolve; });
        pending.push({ release, payload, status: response.status() });
        await gate;
        await route.fulfill({ response, json: payload });
    };
    await page.route('**/api/characters/get', handler);
    try {
        expect(await page.evaluate(a => window.SillyTavern.getContext().characters.find(c => c.avatar === a)?.shallow, target)).toBe(true);
        const chat = page.waitForResponse(r => r.url().endsWith('/api/chats/get') && r.request().postDataJSON()?.avatar_url === target, { timeout: 15_000 });
        await clickCharacter(page, 8);
        await expect.poll(() => pending.length).toBe(1);
        const published = await page.evaluate(async ({ target, trigger }) => {
            const app = await import('/script.js');
            const chars = window.SillyTavern.getContext().characters;
            const before = chars.find(c => c.avatar === target);
            const snapshot = structuredClone(chars);
            snapshot.find(c => c.avatar === trigger).name += ' U014 snapshot change';
            window.u014Publish = app.publishCharacterLibrarySnapshot(snapshot);
            const after = chars.find(c => c.avatar === target);
            window.u014Published = after;
            return { replaced: before !== after, shallow: after?.shallow, avatar: after?.avatar, sameArray: chars === window.SillyTavern.getContext().characters, character: structuredClone(after) };
        }, { target, trigger: avatar(9) });
        expect(published).toMatchObject({ replaced: true, shallow: true, avatar: target, sameArray: true });
        await expect.poll(() => pending.length).toBe(2);
        pending[0].release();
        const chatResponse = await chat;
        const chatPayload = await chatResponse.json();
        await settled(page, 8);
        const actual = await state(page);
        const targetState = await page.evaluate(a => {
            const current = window.SillyTavern.getContext().characters.find(c => c.avatar === a);
            return { sameAsPublished: current === window.u014Published, shallow: current?.shallow, description: current?.description };
        }, target);
        const fields = ['description', 'personality', 'scenario', 'first_mes', 'mes_example'];
        const fieldComparison = Object.fromEntries(fields.map(key => [key, { shallowPresent: Object.hasOwn(published.character, key), detailPresent: Object.hasOwn(pending[0].payload, key), equal: published.character[key] === pending[0].payload[key] }]));
        const observation = { published, detailStatus: pending[0].status, detail: pending[0].payload, fieldComparison, secondDetailHeld: pending.length, chatStatus: chatResponse.status(), chatRequest: chatResponse.request().postDataJSON(), chatMessageCount: chatPayload.length - 1, targetState, actual };
        expect(chatResponse.ok()).toBe(true);
        expect(actual.chatId).toBe(observation.chatRequest.file_name);
        expect(actual.messages).toEqual(chatPayload.slice(1).map(({ name, mes }) => ({ name, mes })));
        expect(targetState.sameAsPublished).toBe(true);
        expect(targetState.shallow).toBe(true);
        pending[1].release();
        await page.evaluate(() => window.u014Publish);
        observation.afterSecondDetail = await page.evaluate(a => {
            const current = window.SillyTavern.getContext().characters.find(c => c.avatar === a);
            return { shallow: Boolean(current?.shallow), sameAsPublished: current === window.u014Published };
        }, target);
        observation.final = await state(page);
        await testInfo.attach('u014-race', { body: JSON.stringify(observation, null, 2), contentType: 'application/json' });
        console.log('U014 summary', JSON.stringify({ published: { replaced: published.replaced, shallow: published.shallow, sameArray: published.sameArray }, fieldComparison, chatStatus: observation.chatStatus, chatRequest: observation.chatRequest, chatMessageCount: observation.chatMessageCount, intermediate: { shallow: targetState.shallow, sameAsPublished: targetState.sameAsPublished, avatar: actual.avatar, name: actual.name, chatId: actual.chatId, authoringName: actual.authoringName, hiddenSubmitAvatar: actual.hiddenSubmitAvatar, descriptionMatchesDetail: actual.draft === pending[0].payload.description }, afterSecondDetail: observation.afterSecondDetail }));
    } finally {
        for (const item of pending) item.release();
        await page.evaluate(() => window.u014Publish).catch(() => {});
        await page.unroute('**/api/characters/get', handler, { behavior: 'wait' });
    }
});

test('refresh while a React description autosave is held preserves draft and save target', async ({ page }, testInfo) => {
    await testSetup.awaitST({ page });
    await clickCharacter(page, 5);
    await settled(page, 5);
    let release;
    let captured;
    const gate = new Promise(resolve => { release = resolve; });
    const seen = new Promise(resolve => { captured = resolve; });
    const saves = [];
    const handler = async route => { saves.push(route.request().postData()); captured(); await gate; await route.continue(); };
    await page.route('**/api/characters/edit', handler);
    try {
        const draft = 'U011 unsent React description';
        await page.locator(description).fill(draft);
        await Promise.race([seen, page.waitForTimeout(10_000).then(() => { throw new Error('Autosave was not captured'); })]);
        await api(page, '/api/characters/edit-attribute', { avatar_url: avatar(6), ch_name: name(6), field: 'description', value: 'U011 refresh trigger' });
        await startRefresh(page);
        await finishRefresh(page);
        const during = await state(page);
        release();
        await expect.poll(async () => JSON.parse(await api(page, '/api/characters/get', { avatar_url: avatar(5) })).description).toBe(draft);
        const saved = JSON.parse(await api(page, '/api/characters/get', { avatar_url: avatar(5) }));
        await evidence(testInfo, { events: ['autosave-held', 'changed-refresh-complete', 'save-released-and-verified'], during, saves, savedDescription: saved.description });
        expect(during.avatar).toBe(avatar(5));
        expect(during.hiddenSubmitAvatar).toBe(avatar(5));
        expect(during.draft).toBe(draft);
        expect(saves.length).toBeGreaterThan(0);
        expect(saves[0]).toContain(avatar(5));
        expect(saves[0]).toContain(draft);
    } finally { release(); await page.unroute('**/api/characters/edit', handler); }
});
