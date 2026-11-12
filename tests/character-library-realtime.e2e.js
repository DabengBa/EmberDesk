import { isolatedCharacterLibraryTest, expect } from './helpers/isolated-character-library-test.js';
import { testSetup } from './frontend/frontent-test-utils.js';

const test = isolatedCharacterLibraryTest({ lazy: false });

async function edit(page, number, field, value) {
    const padded = String(number).padStart(3, '0');
    await page.evaluate(async ({ padded, field, value }) => {
        const { getRequestHeaders } = await import('/scripts/request-context.js');
        const response = await fetch('/api/characters/edit-attribute', {
            method: 'POST', headers: getRequestHeaders(),
            body: JSON.stringify({ avatar_url: `dev-character-${padded}.png`, ch_name: `Dev Character ${padded}`, field, value }),
        });
        if (!response.ok) throw new Error(`edit failed: ${response.status} ${await response.text()}`);
    }, { padded, field, value });
}

test('U016 remote deletion cannot change a bulk target or reset folder filtering and name sorting', async ({ page, context }) => {
    let characterReads = 0;
    page.on('request', request => {
        if (request.url().endsWith('/api/characters/all')) characterReads++;
    });
    await page.addInitScript(() => {
        window.u016Invalidations = 0;
        const NativeEventSource = window.EventSource;
        window.EventSource = class extends NativeEventSource {
            constructor(...args) {
                super(...args);
                if (String(args[0]).includes('/api/characters/events')) {
                    this.addEventListener('invalidate', () => window.u016Invalidations++);
                }
            }
        };
    });
    await testSetup.awaitST({ page });
    const other = await context.newPage();
    try {
        await testSetup.awaitST({ page: other });
        await page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '角色库' }).first().click();
        await page.evaluate(async () => {
            const { tags, tag_map } = await import('/scripts/tags.js');
            const { FILTER_TYPES } = await import('/scripts/filters.js');
            const { entitiesFilter } = await import('/script.js');
            const { power_user } = await import('/scripts/power-user.js');
            const { printCharacters } = await import('/script.js');
            tags.push({ id: 'u016-folder', name: 'U016 Folder', folder_type: 'CLOSED' });
            for (let number = 1; number <= 48; number++) {
                tag_map[`dev-character-${String(number).padStart(3, '0')}.png`] = ['u016-folder'];
            }
            entitiesFilter.setFilterData(FILTER_TYPES.TAG, { selected: ['u016-folder'], excluded: [] }, true);
            Object.assign(power_user, { sort_field: 'name', sort_order: 'asc', sort_rule: 'string' });
            await printCharacters(false);
        });
        await page.getByRole('button', { name: /批量编辑角色|Bulk edit characters/ }).click();
        const row = page.locator('#rm_print_characters_block .character_select').filter({ hasText: 'Dev Character 047' });
        await expect(row.locator('.bulk_select_checkbox')).toHaveCount(1);
        await row.click();
        await expect(row).toHaveAttribute('aria-checked', 'true');
        const selected = () => page.evaluate(async () => {
            const { characterGroupOverlay, characters } = await import('/script.js');
            return characterGroupOverlay.selectedCharacters.map(id => characters[id]?.avatar);
        });
        expect(await selected()).toEqual(['dev-character-047.png']);
        const readsBeforeRemoteChanges = characterReads;
        const before = await page.evaluate(() => window.u016Invalidations);
        await other.evaluate(async () => {
            const { getRequestHeaders } = await import('/scripts/request-context.js');
            const response = await fetch('/api/characters/delete', {
                method: 'POST', headers: getRequestHeaders(),
                body: JSON.stringify({ avatar_url: 'dev-character-046.png', delete_chats: false }),
            });
            if (!response.ok) throw new Error(`delete failed: ${response.status} ${await response.text()}`);
            const renameResponse = await fetch('/api/characters/edit-attribute', {
                method: 'POST', headers: getRequestHeaders(),
                body: JSON.stringify({ avatar_url: 'dev-character-045.png', ch_name: 'Dev Character 045', field: 'name', value: 'ZZZ U016' }),
            });
            if (!renameResponse.ok) throw new Error(`rename failed: ${renameResponse.status} ${await renameResponse.text()}`);
        });
        await expect.poll(() => page.evaluate(() => window.u016Invalidations), { timeout: 12_000 }).toBeGreaterThan(before);
        await page.waitForTimeout(2500);
        expect(characterReads).toBe(readsBeforeRemoteChanges);
        expect(await selected()).toEqual(['dev-character-047.png']);
        await expect(row).toHaveAttribute('aria-checked', 'true');
        await page.getByRole('button', { name: /批量删除角色|Bulk delete characters/ }).click();
        const dialog = page.locator('dialog[open]');
        await expect(dialog).toContainText('Dev Character 047');
        await expect(dialog).not.toContainText('Dev Character 048');
        await dialog.locator('.popup-button-ok').click();
        await expect.poll(() => page.evaluate(() => window.SillyTavern.getContext().characters.some(c => c.avatar === 'dev-character-047.png')), { timeout: 15_000 }).toBe(false);
        expect(await page.evaluate(() => window.SillyTavern.getContext().characters.some(c => c.avatar === 'dev-character-045.png'))).toBe(true);
        await expect.poll(() => page.evaluate(() => window.SillyTavern.getContext().characters.some(c => c.avatar === 'dev-character-046.png')), { timeout: 15_000 }).toBe(false);
        await expect.poll(() => page.evaluate(() => window.SillyTavern.getContext().characters.find(c => c.avatar === 'dev-character-045.png')?.name), { timeout: 15_000 }).toBe('ZZZ U016');
        const visibleNames = await page.locator('#rm_print_characters_block .character_select .ch_name').allTextContents();
        expect(visibleNames[0]).toContain('Dev Character 001');
        expect(visibleNames.at(-1)).toContain('ZZZ U016');
        expect(visibleNames).toHaveLength(46);
        const selectedFolders = await page.evaluate(async () => {
            const { entitiesFilter } = await import('/script.js');
            const { FILTER_TYPES } = await import('/scripts/filters.js');
            return entitiesFilter.getFilterData(FILTER_TYPES.TAG).selected;
        });
        expect(selectedFolders).toEqual(['u016-folder']);
    } finally {
        await other.close();
    }
});

test('U016 tag confirmation keeps its target after the tag popup closes', async ({ page, context }) => {
    await page.addInitScript(() => {
        window.u016TagInvalidations = 0;
        const NativeEventSource = window.EventSource;
        window.EventSource = class extends NativeEventSource {
            constructor(...args) {
                super(...args);
                if (String(args[0]).includes('/api/characters/events')) {
                    this.addEventListener('invalidate', () => window.u016TagInvalidations++);
                }
            }
        };
    });
    await testSetup.awaitST({ page });
    const other = await context.newPage();
    try {
        await testSetup.awaitST({ page: other });
        await page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '角色库' }).first().click();
        await page.locator('#emberdesk-react-character-search').fill('Dev Character 00');
        await page.evaluate(async () => {
            const { tags, tag_map } = await import('/scripts/tags.js');
            tags.push({ id: 'u016-tag', name: 'U016 Tag' });
            tag_map['dev-character-005.png'] = ['u016-tag'];
            tag_map['dev-character-006.png'] = ['u016-tag'];
        });
        await page.getByRole('button', { name: /批量编辑角色|Bulk edit characters/ }).click();
        const row = page.locator('#rm_print_characters_block .character_select').filter({ hasText: 'Dev Character 005' });
        await expect(row.locator('.bulk_select_checkbox')).toHaveCount(1);
        await row.click();
        await row.click({ button: 'right' });
        await page.locator('#character_context_menu_tag').click();
        await expect(page.locator('#bulk_tag_shadow_popup')).toBeVisible();
        await page.locator('#bulk_tag_popup_reset').click();
        const confirm = page.locator('dialog[open]');
        await expect(confirm).toBeVisible();
        const before = await page.evaluate(() => window.u016TagInvalidations);
        await other.evaluate(async () => {
            const { getRequestHeaders } = await import('/scripts/request-context.js');
            const response = await fetch('/api/characters/delete', {
                method: 'POST', headers: getRequestHeaders(),
                body: JSON.stringify({ avatar_url: 'dev-character-044.png', delete_chats: false }),
            });
            if (!response.ok) throw new Error(`delete failed: ${response.status}`);
        });
        await expect.poll(() => page.evaluate(() => window.u016TagInvalidations), { timeout: 12_000 }).toBeGreaterThan(before);
        // Exercise the real close handler even while the native confirmation is open.
        await page.evaluate(async () => (await import('/script.js')).characterGroupOverlay.bulkTagPopupHandler.hide());
        await expect(page.locator('#bulk_tag_shadow_popup')).toHaveCount(0);
        await page.waitForTimeout(2500);
        expect(await page.evaluate(() => window.SillyTavern.getContext().characters.some(c => c.avatar === 'dev-character-044.png'))).toBe(true);
        await confirm.locator('.popup-button-ok').click();
        await expect.poll(() => page.evaluate(async () => {
            const { tag_map } = await import('/scripts/tags.js');
            return tag_map['dev-character-005.png'];
        })).toEqual([]);
        expect(await page.evaluate(async () => (await import('/scripts/tags.js')).tag_map['dev-character-006.png'])).toEqual(['u016-tag']);
        await expect.poll(() => page.evaluate(() => window.SillyTavern.getContext().characters.some(c => c.avatar === 'dev-character-044.png')), { timeout: 15_000 }).toBe(false);
    } finally {
        await other.close();
    }
});

test('real reconnect, trailing invalidation, failed read recovery and quiet polling', async ({ page, context }) => {
    test.setTimeout(160_000);
    await page.addInitScript(() => {
        window.u015Events = [];
        const NativeEventSource = window.EventSource;
        window.EventSource = class extends NativeEventSource {
            constructor(...args) {
                super(...args);
                if (String(args[0]).includes('/api/characters/events')) {
                    for (const type of ['ready', 'invalidate', 'error']) this.addEventListener(type, () => window.u015Events.push(type));
                }
            }
        };
    });
    let reads = 0;
    page.on('request', request => { if (request.url().endsWith('/api/characters/all')) reads++; });
    await testSetup.awaitST({ page });
    const other = await context.newPage();
    const cdp = await context.newCDPSession(page);
    let release;
    let gateHandler;
    try {
        await testSetup.awaitST({ page: other });
        await expect.poll(() => page.evaluate(() => window.u015Events.filter(x => x === 'ready').length)).toBeGreaterThan(0);
        await cdp.send('Network.enable');
        await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
        // Existing EventSource streams can survive the offline toggle until
        // the server rotates the stream. Wait for the real disconnection.
        await expect.poll(() => page.evaluate(() => window.u015Events.includes('error')), { timeout: 75_000 }).toBe(true);
        const readies = await page.evaluate(() => window.u015Events.filter(x => x === 'ready').length);
        await edit(other, 2, 'description', 'U015 disconnected update');
        await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
        await expect.poll(() => page.evaluate(() => window.u015Events.filter(x => x === 'ready').length), { timeout: 15_000 }).toBeGreaterThan(readies);
        const description = n => page.evaluate(n => window.SillyTavern.getContext().characters.find(c => c.avatar === `dev-character-${String(n).padStart(3, '0')}.png`)?.description, n);
        await expect.poll(() => description(2), { timeout: 15_000 }).toBe('U015 disconnected update');

        let entered;
        const held = new Promise(resolve => { entered = resolve; });
        const gate = new Promise(resolve => { release = resolve; });
        let used = false;
        gateHandler = async route => {
            if (used) return route.continue();
            used = true;
            const response = await route.fetch();
            const body = await response.body();
            entered();
            await gate;
            await route.fulfill({ response, body });
        };
        await page.route('**/api/characters/all', gateHandler);
        await edit(other, 3, 'description', 'U015 first');
        await Promise.race([held, new Promise((_, reject) => setTimeout(() => reject(new Error('no invalidation read')), 12_000))]);
        const previousInvalidations = await page.evaluate(() => window.u015Events.filter(x => x === 'invalidate').length);
        await edit(other, 3, 'description', 'U015 trailing');
        await expect.poll(() => page.evaluate(() => window.u015Events.filter(x => x === 'invalidate').length), { timeout: 12_000 }).toBeGreaterThan(previousInvalidations);
        release();
        await expect.poll(() => description(3), { timeout: 15_000 }).toBe('U015 trailing');
        await page.unroute('**/api/characters/all', gateHandler);
        gateHandler = undefined;

        let failed = false;
        const failOnce = async route => {
            if (failed) return route.continue();
            failed = true;
            await route.fulfill({ status: 503, body: 'unavailable' });
        };
        await page.route('**/api/characters/all', failOnce);
        await edit(other, 4, 'description', 'U015 recovery');
        await expect.poll(() => failed, { timeout: 12_000 }).toBe(true);
        expect(await description(4)).not.toBe('U015 recovery');
        await expect.poll(() => description(4), { timeout: 15_000 }).toBe('U015 recovery');
        await page.unroute('**/api/characters/all', failOnce);
        await page.waitForTimeout(2500);
        const beforeQuiet = reads;
        await page.waitForTimeout(4500);
        expect(reads).toBe(beforeQuiet);
        console.log('U015 observed events', JSON.stringify(await page.evaluate(() => window.u015Events)), 'reads', reads);
    } finally {
        release?.();
        if (gateHandler) await page.unroute('**/api/characters/all', gateHandler);
        await cdp.detach();
        await other.close();
    }
});
test('automatic updates preserve tag and folder selection and re-sort matching roles', async ({ page, context }) => {
    await testSetup.awaitST({ page });
    const other = await context.newPage();
    try {
        await testSetup.awaitST({ page: other });
        await page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '角色库' }).first().click();
        await page.evaluate(async () => {
            const app = await import('/script.js');
            const { tags, tag_map } = await import('/scripts/tags.js');
            const { FILTER_TYPES } = await import('/scripts/filters.js');
            const { power_user } = await import('/scripts/power-user.js');
            tags.push({ id: 'u015-folder', name: 'U015 Folder', folder_type: 'CLOSED' });
            tag_map['dev-character-005.png'] = ['u015-folder'];
            tag_map['dev-character-006.png'] = ['u015-folder'];
            app.entitiesFilter.setFilterData(FILTER_TYPES.TAG, { selected: ['u015-folder'], excluded: [] }, true);
            Object.assign(power_user, { sort_field: 'name', sort_order: 'asc', sort_rule: 'string' });
            await app.printCharacters(false);
        });
        const rows = page.locator('#rm_print_characters_block .character_select');
        await expect(rows).toHaveCount(2);
        await expect(rows.nth(0)).toContainText('Dev Character 005');
        await expect(rows.nth(1)).toContainText('Dev Character 006');
        await edit(other, 6, 'name', 'A U015 sorted role');
        await expect(rows.nth(0)).toContainText('A U015 sorted role', { timeout: 12_000 });
        await expect(rows.nth(1)).toContainText('Dev Character 005');
        await expect(rows).toHaveCount(2);
        const selected = await page.evaluate(async () => {
            const { entitiesFilter } = await import('/script.js');
            const { FILTER_TYPES } = await import('/scripts/filters.js');
            return entitiesFilter.getFilterData(FILTER_TYPES.TAG).selected;
        });
        expect(selected).toEqual(['u015-folder']);
    } finally {
        await other.close();
    }
});
test('another page changes the filtered character list without manual refresh', async ({ page, context }) => {
    await testSetup.awaitST({ page });
    const other = await context.newPage();
    try {
        await testSetup.awaitST({ page: other });
        await page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '角色库' }).first().click();
        const search = page.locator('#emberdesk-react-character-search');
        await search.fill('U015 named character');
        await expect(page.locator('#rm_print_characters_block .character_select')).toHaveCount(0);
        await other.evaluate(async () => {
            const { getRequestHeaders } = await import('/scripts/request-context.js');
            const response = await fetch('/api/characters/edit-attribute', {
                method: 'POST', headers: getRequestHeaders(),
                body: JSON.stringify({ avatar_url: 'dev-character-001.png', ch_name: 'Dev Character 001', field: 'name', value: 'U015 named character' }),
            });
            if (!response.ok) throw new Error(`edit failed: ${response.status} ${await response.text()}`);
        });
        await expect(page.locator('#rm_print_characters_block .character_select').filter({ hasText: 'U015 named character' })).toHaveCount(1, { timeout: 8000 });
        await expect(search).toHaveValue('U015 named character');
    } finally {
        await other.close();
    }
});

test('terminal SSE response reconnects and catches up after a write', async ({ page, context }) => {
    await page.addInitScript(() => {
        window.u015Terminal = { states: [], readies: 0, instances: 0 };
        const NativeEventSource = window.EventSource;
        window.EventSource = class extends NativeEventSource {
            constructor(...args) {
                super(...args);
                if (String(args[0]).includes('/api/characters/events')) {
                    window.u015Terminal.instances++;
                    this.addEventListener('error', () => window.u015Terminal.states.push(this.readyState));
                    this.addEventListener('ready', () => window.u015Terminal.readies++);
                }
            }
        };
    });
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let requests = 0;
    const handler = async route => {
        requests++;
        if (requests === 1) return route.fulfill({ status: 503, body: 'temporarily unavailable' });
        await gate;
        return route.continue();
    };
    await page.route('**/api/characters/events', handler);
    const other = await context.newPage();
    try {
        await testSetup.awaitST({ page });
        await expect.poll(() => page.evaluate(() => window.u015Terminal.states)).toContain(2);
        await testSetup.awaitST({ page: other });
        await edit(other, 9, 'description', 'U015 terminal catchup');
        release();
        await expect.poll(() => page.evaluate(() => window.u015Terminal.readies), { timeout: 12_000 }).toBeGreaterThan(0);
        await expect.poll(() => page.evaluate(() => window.SillyTavern.getContext().characters.find(c => c.avatar === 'dev-character-009.png')?.description), { timeout: 12_000 }).toBe('U015 terminal catchup');
        expect(await page.evaluate(() => window.u015Terminal.instances)).toBe(2);
    } finally {
        release();
        await page.unroute('**/api/characters/events', handler);
        await other.close();
    }
});

test('background overflow stays silent while explicit refresh warns and waits', async ({ page, context }) => {
    await testSetup.awaitST({ page });
    const other = await context.newPage();
    let requests = 0;
    const handler = async route => {
        requests++;
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ overflow: true }) });
    };
    try {
        await testSetup.awaitST({ page: other });
        await page.route('**/api/characters/all', handler);
        await edit(other, 10, 'description', 'U015 overflow recovery');
        await expect.poll(() => requests, { timeout: 12_000 }).toBeGreaterThanOrEqual(2);
        await expect(page.locator('dialog[open]')).toHaveCount(0);
        await page.evaluate(async () => {
            const { getCharacters } = await import('/script.js');
            window.u015ExplicitDone = false;
            window.u015Explicit = getCharacters().then(() => { window.u015ExplicitDone = true; });
        });
        const dialog = page.locator('dialog[open]');
        await expect(dialog).toContainText(/performance\.lazyLoadCharacters/);
        expect(await page.evaluate(() => window.u015ExplicitDone)).toBe(false);
        await dialog.locator('.popup-button-ok').click();
        await page.evaluate(() => window.u015Explicit);
        await page.unroute('**/api/characters/all', handler);
        await expect.poll(() => page.evaluate(() => window.SillyTavern.getContext().characters.find(c => c.avatar === 'dev-character-010.png')?.description), { timeout: 12_000 }).toBe('U015 overflow recovery');
    } finally {
        await page.unroute('**/api/characters/all', handler);
        await other.close();
    }
});
test('unfiltered role changes are re-sorted by the current name order', async ({ page, context }) => {
    await testSetup.awaitST({ page });
    const other = await context.newPage();
    try {
        await testSetup.awaitST({ page: other });
        await page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '角色库' }).first().click();
        await page.evaluate(async () => {
            const { power_user } = await import('/scripts/power-user.js');
            const app = await import('/script.js');
            Object.assign(power_user, { sort_field: 'name', sort_order: 'asc', sort_rule: 'string' });
            await app.printCharacters(false);
        });
        const order = () => page.evaluate(async () => {
            const { getEntitiesList } = await import('/script.js');
            return getEntitiesList({ doFilter: true, doSort: true })
                .filter(row => row.type === 'character' && ['dev-character-007.png', 'dev-character-008.png'].includes(row.item.avatar))
                .map(row => row.item.avatar);
        });
        expect(await order()).toEqual(['dev-character-007.png', 'dev-character-008.png']);
        await edit(other, 8, 'name', 'A U015 unfiltered');
        await expect.poll(order, { timeout: 12_000 }).toEqual(['dev-character-008.png', 'dev-character-007.png']);
        await expect(page.locator('#rm_print_characters_block .character_select').filter({ hasText: 'A U015 unfiltered' })).toHaveCount(1);
    } finally {
        await other.close();
    }
});
