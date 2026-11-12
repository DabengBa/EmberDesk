import { isolatedCharacterLibraryTest, expect } from './helpers/isolated-character-library-test.js';
import { testSetup } from './frontend/frontent-test-utils.js';

const test = isolatedCharacterLibraryTest({ lazy: false });

test('refresh retains the active avatar when the array order changes', async ({ page }) => {
    await testSetup.awaitST({ page });
    const result = await page.evaluate(async () => {
        const app = await import('/script.js');
        const shell = (await import('/scripts/character-lifecycle-shell-context.js')).requireCharacterLifecycleShellContext();
        const characters = shell.state.characters;
        const avatar = characters[0].avatar;
        app.setCharacterId(0);
        const originalFetch = window.fetch;
        const payload = structuredClone(characters).reverse();
        window.fetch = (input, init) => input === '/api/characters/all'
            ? Promise.resolve(new Response(JSON.stringify(payload), { status: 200 }))
            : originalFetch(input, init);
        try {
            await app.getCharacters();
            return { avatar, selected: characters[shell.state.this_chid]?.avatar, index: shell.state.this_chid };
        } finally {
            window.fetch = originalFetch;
        }
    });
    expect(result.selected).toBe(result.avatar);
    expect(Number(result.index)).toBe(47);
});

test('a deletion while a refresh is in flight is projected on publication', async ({ page }) => {
    await testSetup.awaitST({ page });
    const result = await page.evaluate(async () => {
        const app = await import('/script.js');
        const shell = (await import('/scripts/character-lifecycle-shell-context.js')).requireCharacterLifecycleShellContext();
        const characters = shell.state.characters;
        const original = structuredClone(characters);
        const avatar = original[0].avatar;
        const originalFetch = window.fetch;
        let release;
        window.fetch = (input, init) => input === '/api/characters/all'
            ? new Promise(resolve => { release = () => resolve(new Response(JSON.stringify(original), { status: 200 })); })
            : originalFetch(input, init);
        try {
            const refresh = app.getCharacters();
            await shell.removeCharacterFromUI([avatar]);
            const absentBefore = !characters.some(character => character.avatar === avatar);
            release();
            await refresh;
            return { absentBefore, absentAfter: !characters.some(character => character.avatar === avatar), count: characters.length };
        } finally {
            window.fetch = originalFetch;
        }
    });
    expect(result).toEqual({ absentBefore: true, absentAfter: true, count: 47 });
});

test('overflow shows the established warning and keeps the current array', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.evaluate(async () => {
        const app = await import('/script.js');
        const reference = window.SillyTavern.getContext().characters;
        const originalFetch = window.fetch;
        window.fetch = (input, init) => input === '/api/characters/all'
            ? Promise.resolve(new Response(JSON.stringify({ overflow: true }), { status: 500 }))
            : originalFetch(input, init);
        window.u008Refresh = app.getCharacters().then(() => ({ same: reference === window.SillyTavern.getContext().characters, count: reference.length })).finally(() => { window.fetch = originalFetch; });
    });
    const dialog = page.locator('dialog[open]');
    await expect(dialog).toContainText(/performance\.lazyLoadCharacters/);
    await dialog.locator('.popup-button-ok').click();
    expect(await page.evaluate(() => window.u008Refresh)).toEqual({ same: true, count: 48 });
});

test('the existing character refresh retains its observable read and publication behavior', async ({ page }) => {
    // This contract counts explicit reads; realtime delivery has separate coverage.
    await page.route('**/api/characters/events', route => route.fulfill({ status: 204 }));
    const eventsResponse = page.waitForResponse('**/api/characters/events');
    await testSetup.awaitST({ page });
    expect((await eventsResponse).status()).toBe(204);
    await page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '角色库' }).first().click();
    await expect(page.locator('#right-nav-panel.openDrawer #rm_characters_block')).toBeVisible();

    const result = await page.evaluate(async () => {
        const app = await import('/script.js');
        const context = window.SillyTavern.getContext();
        const reference = context.characters;
        const originalFetch = window.fetch;
        const original = structuredClone(reference);
        let payload = structuredClone(original);
        let status = 200;
        let requests = 0;
        window.fetch = async (input, init) => {
            if (typeof input === 'string' && input === '/api/characters/all') {
                requests++;
                return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
            }
            return originalFetch(input, init);
        };
        try {
            const first = reference[0];
            const unchangedIdentity = first;
            await app.getCharacters();
            const unchanged = reference[0] === unchangedIdentity;
            status = 503;
            payload = { error: 'unavailable' };
            await app.getCharacters();
            const errorRetains = reference[0] === unchangedIdentity && reference.length === original.length;
            status = 200;
            payload = structuredClone(original);
            payload[0].name = 'U008 updated name';
            await app.getCharacters();
            const updated = reference[0].name;
            const sameArray = reference === context.characters;
            payload = [];
            await app.getCharacters();
            const empty = reference.length;
            payload = original;
            await app.getCharacters();
            return { unchanged, errorRetains, updated, sameArray, empty, restored: reference.length, count: original.length, requests };
        } finally {
            window.fetch = originalFetch;
        }
    });
    expect(result).toEqual({ unchanged: true, errorRetains: true, updated: 'U008 updated name', sameArray: true, empty: 0, restored: result.count, count: 48, requests: 5 });
});

test('standalone read does not consume pending deletion or publish; publication projects current state', async ({ page }) => {
    // Preserve the simulated publication until its UI assertion completes.
    await page.route('**/api/characters/events', route => route.fulfill({ status: 204 }));
    const eventsResponse = page.waitForResponse('**/api/characters/events');
    await testSetup.awaitST({ page });
    expect((await eventsResponse).status()).toBe(204);
    await page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '角色库' }).first().click();
    const result = await page.evaluate(async () => {
        const app = await import('/script.js');
        const shell = (await import('/scripts/character-lifecycle-shell-context.js')).requireCharacterLifecycleShellContext();
        const characters = shell.state.characters;
        const original = structuredClone(characters);
        const avatar = original[0].avatar;
        await shell.removeCharacterFromUI([avatar]);
        const before = JSON.stringify(characters);
        const selection = shell.state.this_chid;
        const ui = document.querySelector('#rm_print_characters_block').innerHTML;
        const originalFetch = window.fetch;
        window.fetch = (input, init) => input === '/api/characters/all'
            ? Promise.resolve(new Response(JSON.stringify(original.slice(1)), { status: 200 }))
            : originalFetch(input, init);
        try {
            const read = await app.fetchAllCharactersDataOnly();
            const unchanged = before === JSON.stringify(characters) && selection === shell.state.this_chid
                && ui === document.querySelector('#rm_print_characters_block').innerHTML;
            // If the standalone read had consumed pending deletes, this stale
            // snapshot would incorrectly resurrect the deleted avatar.
            original[1].name = 'U008 published character';
            await app.publishCharacterLibrarySnapshot(original, { previousAvatar: null });
            return { readCount: read.length, unchanged, absent: !characters.some(c => c.avatar === avatar), count: characters.length, name: characters[0].name };
        } finally {
            window.fetch = originalFetch;
        }
    });
    expect(result).toEqual({ readCount: 47, unchanged: true, absent: true, count: 47, name: 'U008 published character' });
    await expect(page.locator('#rm_print_characters_block')).toContainText('U008 published character');
});

test('a pending delete added while standalone read is in flight is applied at publication', async ({ page }) => {
    await testSetup.awaitST({ page });
    const result = await page.evaluate(async () => {
        const app = await import('/script.js');
        const shell = (await import('/scripts/character-lifecycle-shell-context.js')).requireCharacterLifecycleShellContext();
        const characters = shell.state.characters;
        const original = structuredClone(characters);
        const avatar = original[0].avatar;
        const originalFetch = window.fetch;
        let release;
        window.fetch = (input, init) => input === '/api/characters/all'
            ? new Promise(resolve => { release = () => resolve(new Response(JSON.stringify(original), { status: 200 })); })
            : originalFetch(input, init);
        try {
            const pendingRead = app.fetchAllCharactersDataOnly();
            await shell.removeCharacterFromUI([avatar]);
            release();
            const snapshot = await pendingRead;
            const readIncludesDeleted = snapshot.some(c => c.avatar === avatar);
            const absentBefore = !characters.some(c => c.avatar === avatar);
            await app.publishCharacterLibrarySnapshot(snapshot, { previousAvatar: null });
            return { readIncludesDeleted, absentBefore, absentAfter: !characters.some(c => c.avatar === avatar) };
        } finally {
            window.fetch = originalFetch;
        }
    });
    expect(result).toEqual({ readIncludesDeleted: true, absentBefore: true, absentAfter: true });
});

test('the duplicate caller returns only after the new character is published', async ({ page }) => {
    await testSetup.awaitST({ page });
    const result = await page.evaluate(async () => {
        const app = await import('/script.js');
        const shell = (await import('/scripts/character-lifecycle-shell-context.js')).requireCharacterLifecycleShellContext();
        const source = shell.state.characters[0].avatar;
        const avatar = await app.duplicateCharacter({ avatar: source, silent: true });
        return { avatar, found: shell.state.characters.some(character => character.avatar === avatar) };
    });
    expect(result.avatar).toBeTruthy();
    expect(result.found).toBe(true);
});
