import { test, expect } from '@playwright/test';

import { testSetup } from './frontend/frontent-test-utils.js';

// The e2e lane seeds 48 "Dev Character NNN" characters. Both scenarios run in
// one test because parallel tests share the same backend data root, so
// absolute row counts must not be asserted across tests.
const SEEDED_AVATAR = 'dev-character-001.png';
const PAGE_SIZE = 10;

async function openCharacterLibrary(page) {
    const panelButton = page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '角色库' }).first();
    await expect(panelButton).toBeVisible({ timeout: 10_000 });
    await panelButton.click({ timeout: 10_000 });
    await expect(page.locator('#right-nav-panel.openDrawer #rm_characters_block')).toBeVisible({ timeout: 10_000 });
}

async function postCharacterApi(page, url, body) {
    const result = await page.evaluate(async ({ url: apiUrl, body: apiBody }) => {
        const csrfPayload = await fetch('/csrf-token').then(response => response.json()).catch(() => null);
        const csrfToken = csrfPayload?.token ?? csrfPayload?.data?.token ?? null;
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
            },
            body: JSON.stringify(apiBody),
        });
        return { ok: response.ok, status: response.status, text: await response.text() };
    }, { url, body });
    if (!result.ok) {
        throw new Error(`${url} failed: HTTP ${result.status} ${result.text}`);
    }
    return result.text;
}

async function setCharacterPageSize(page, pageSize) {
    const sizeSelect = page.locator('#rm_print_characters_pagination select.J-paginationjs-size-select');
    await expect(sizeSelect).toBeVisible({ timeout: 10_000 });
    await sizeSelect.selectOption(String(pageSize));
}

test('data-change reprints keep the character library scroll position and current page', async ({ page }) => {
    await testSetup.awaitST({ page });
    await openCharacterLibrary(page);
    await setCharacterPageSize(page, 50);

    const rows = page.locator('#rm_print_characters_block .character_select');
    const initialRowCount = await rows.count();
    expect(initialRowCount).toBeGreaterThan(0);

    // --- Scenario A: add/import-style reprint preserves scroll offset ---
    // The actual scroll container for the character list is the right-nav
    // panel, not the inner list element (which grows to fit its content).
    const scrollBefore = await page.evaluate(() => {
        const panel = document.getElementById('right-nav-panel');
        panel.scrollTop = 400;
        return panel.scrollTop;
    });
    expect(scrollBefore).toBeGreaterThan(0);

    // Same data-change path used by create/import/rename flows.
    await postCharacterApi(page, '/api/characters/duplicate', { avatar_url: SEEDED_AVATAR });
    await page.evaluate(() => window.SillyTavern.getContext().getCharacters());
    await expect(rows).toHaveCount(initialRowCount + 1, { timeout: 15_000 });

    const scrollAfter = await page.evaluate(() => document.getElementById('right-nav-panel').scrollTop);
    expect(Math.abs(scrollAfter - scrollBefore)).toBeLessThanOrEqual(4);

    // --- Scenario B: filtered delete reprint preserves the current page ---
    // An active filter forces the fallback reprint branch, which previously
    // reset the list to page one.
    const searchInput = page.locator('#emberdesk-react-character-search');
    await expect(searchInput).toBeVisible({ timeout: 10_000 });
    await searchInput.fill('Dev Character 0');
    await setCharacterPageSize(page, PAGE_SIZE);

    // Row count only reflects the current page; the filtered entity total is
    // in the pagination range label ("1-10 / 49").
    const filteredTotal = await page.evaluate(() => {
        const label = document.querySelector('#rm_print_characters_pagination')?.textContent ?? '';
        const match = label.match(/\/\s*(\d+)/);
        return match ? Number(match[1]) : 0;
    });
    expect(filteredTotal).toBeGreaterThan(PAGE_SIZE);
    const lastPage = Math.ceil(filteredTotal / PAGE_SIZE);
    const lastPageRows = filteredTotal - (lastPage - 1) * PAGE_SIZE;

    for (let i = 1; i < lastPage; i++) {
        await page.locator('#rm_print_characters_pagination .paginationjs-next').click();
    }
    await expect(rows).toHaveCount(lastPageRows, { timeout: 15_000 });

    const deletedAvatar = await page.evaluate(() => {
        const rendered = document.querySelectorAll('#rm_print_characters_block .character_select');
        const chid = rendered[rendered.length - 1].getAttribute('data-chid');
        return window.SillyTavern.getContext().characters[Number(chid)]?.avatar;
    });
    expect(deletedAvatar).toBeTruthy();

    await postCharacterApi(page, '/api/characters/delete', { avatar_url: deletedAvatar, delete_chats: false });
    await page.evaluate(() => window.SillyTavern.getContext().getCharacters());

    // One character removed: the last page now holds lastPageRows - 1 rows.
    // A reprint that reset saveCharactersPage to one would render PAGE_SIZE.
    await expect(rows).toHaveCount(lastPageRows - 1, { timeout: 15_000 });
});
