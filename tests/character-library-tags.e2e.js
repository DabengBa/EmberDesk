import { expect, test } from '@playwright/test';

import { testSetup } from './frontend/frontent-test-utils.js';

test.setTimeout(120_000);
test.use({ actionTimeout: 10_000 });

async function openLibrary(page) {
    await page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '角色库' }).click();
    await expect(page.locator('#right-nav-panel.openDrawer #rm_characters_block')).toBeVisible();
}

async function openManager(page) {
    await page.locator('.character-tag-filter-picker').click();
    await page.locator('.character-tag-filter-popover').getByRole('button', { name: /Manage tags|管理标签/ }).click();
    await expect(page.locator('#tag_view_list')).toBeVisible();
}

async function createTag(page, name) {
    const manager = page.locator('#tag_view_list');
    const oldIds = await manager.locator('.tag_view_item').evaluateAll(rows => rows.map(row => row.id));
    await manager.locator('.tag_view_create').click();
    await expect.poll(async () => manager.locator('.tag_view_item').count()).toBe(oldIds.length + 1);
    const id = await manager.locator('.tag_view_item').evaluateAll((rows, previous) => rows.find(row => !previous.includes(row.id))?.id, oldIds);
    expect(id).toBeTruthy();
    const tagRow = manager.locator(`[data-tag-id="${id}"]`);
    await tagRow.locator('.tag_view_name').click();
    const input = tagRow.locator('input.tag_view_name');
    await input.fill(name);
    await input.press('Enter');
    await expect(tagRow.locator('.tag_view_name')).toHaveText(name);
    return id;
}

async function persistedTags(page) {
    return page.evaluate(async () => {
        const { getRequestHeaders } = await import('/script.js');
        const response = await fetch('/api/settings/get', { method: 'POST', headers: getRequestHeaders(), body: '{}' });
        if (!response.ok) throw new Error(`Settings read failed: ${response.status}`);
        return JSON.parse((await response.json()).settings);
    });
}

test('manages global tags, assigns them to characters, filters and persists a merge', async ({ page }, testInfo) => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const sourceName = `Source ${suffix}`;
    const targetName = `Target ${suffix}`;
    await testSetup.awaitST({ page });
    await openLibrary(page);
    await openManager(page);

    const sourceId = await createTag(page, sourceName);
    const targetId = await createTag(page, targetName);
    await expect.poll(async () => {
        const settings = await persistedTags(page);
        return [sourceId, targetId].map(id => {
            const tag = settings.tags.find(entry => entry.id === id);
            return tag && [tag.color, tag.color2];
        });
    }, { timeout: 10_000 }).toEqual([['', ''], ['', '']]);
    const sourceRow = page.locator(`#tag_view_list [data-tag-id="${sourceId}"]`);
    const sourceColor = sourceRow.locator('toolcool-color-picker.tag-color');
    await sourceColor.getByRole('button', { name: 'Select Color' }).click();
    await sourceColor.locator('input[data-type="hex"]').fill('336699');
    await expect.poll(async () => (await persistedTags(page)).tags.find(tag => tag.id === sourceId)?.color,
        { timeout: 15_000 }).toBe('rgba(51, 102, 153, 0.5)');
    await sourceRow.locator('.tag_view_color_picker[data-value="color"] .link_icon').click();
    await expect(sourceRow.locator('.tag_view_color_picker[data-value="color"] .link_icon')).toHaveCount(0);
    await expect.poll(async () => (await persistedTags(page)).tags.find(tag => tag.id === sourceId)?.color,
        { timeout: 15_000 }).toBe('');
    await page.locator('#tag_view_list').screenshot({ path: testInfo.outputPath('manager-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('#tag_view_list')).toBeVisible();
    await page.locator('#tag_view_list').screenshot({ path: testInfo.outputPath('manager-mobile.png') });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.keyboard.press('Escape');
    await expect(page.locator('#tag_view_list')).toHaveCount(0);

    await page.getByRole('searchbox', { name: /Search characters|搜索角色/ }).fill('Dev Character 00');
    const rows = page.locator('#rm_print_characters_block .character_select');
    const first = rows.filter({ hasText: 'Dev Character 001' }).first();
    const second = rows.filter({ hasText: 'Dev Character 002' }).first();
    await expect(first).toBeVisible();
    await expect(second).toBeVisible();
    const ids = [await first.getAttribute('data-chid'), await second.getAttribute('data-chid')];
    const avatars = await page.evaluate(characterIds => characterIds.map(id => window.SillyTavern.getContext().characters[Number(id)].avatar), ids);
    await page.getByRole('button', { name: /^(Bulk edit characters|批量编辑角色)$/ }).click();
    await first.click();
    await second.click();
    await expect(first).toHaveAttribute('aria-checked', 'true');
    await expect(second).toHaveAttribute('aria-checked', 'true');
    await first.click({ button: 'right' });
    await page.locator('#character_context_menu_tag').click();
    const bulk = page.locator('#bulk_tag_shadow_popup');
    await expect(bulk).toBeVisible();
    await expect(bulk.locator('#bulk_tags_avatars_block img')).toHaveCount(2);
    await bulk.locator('#bulkTagInput').fill(sourceName);
    await bulk.locator('#bulkTagInput').press('Enter');
    await expect(bulk.locator('#bulkTagList .tag_name').filter({ hasText: sourceName })).toBeVisible();
    await expect.poll(async () => {
        const settings = await persistedTags(page);
        return avatars.every(avatar => settings.tag_map?.[avatar]?.includes(sourceId));
    }, { timeout: 15_000 }).toBe(true);
    await bulk.locator('#bulk_tag_popup_remove_mutual').click();
    await page.locator('dialog[open] .popup-button-ok').click();
    await expect(bulk.locator('#bulkTagList .tag_name').filter({ hasText: sourceName })).toHaveCount(0);
    await expect.poll(async () => {
        const settings = await persistedTags(page);
        return avatars.every(avatar => !settings.tag_map?.[avatar]?.includes(sourceId));
    }, { timeout: 15_000 }).toBe(true);
    await bulk.locator('#bulkTagInput').fill(sourceName);
    await bulk.locator('#bulkTagInput').press('Enter');
    await expect(bulk.locator('#bulkTagList .tag_name').filter({ hasText: sourceName })).toBeVisible();
    await expect.poll(async () => {
        const settings = await persistedTags(page);
        return avatars.every(avatar => settings.tag_map?.[avatar]?.includes(sourceId));
    }, { timeout: 15_000 }).toBe(true);
    await bulk.locator('#bulk_tag_popup_reset').click();
    await page.locator('dialog[open] .popup-button-ok').click();
    await expect(bulk.locator('#bulkTagList .tag_name').filter({ hasText: sourceName })).toHaveCount(0);
    await expect.poll(async () => {
        const settings = await persistedTags(page);
        return avatars.every(avatar => (settings.tag_map?.[avatar] || []).length === 0);
    }, { timeout: 15_000 }).toBe(true);
    await bulk.locator('#bulkTagInput').fill(sourceName);
    await bulk.locator('#bulkTagInput').press('Enter');
    await expect.poll(async () => {
        const settings = await persistedTags(page);
        return avatars.every(avatar => settings.tag_map?.[avatar]?.includes(sourceId));
    }, { timeout: 15_000 }).toBe(true);
    await bulk.locator('#bulk_tag_popup_cancel').click();

    await page.locator('.character-tag-filter-picker').click();
    const filterRow = page.locator('.character-tag-filter-popover [role="option"]').filter({ hasText: sourceName });
    await filterRow.getByRole('button', { name: /Include|包含/ }).click();
    await expect(first).toBeVisible();
    await expect(second).toBeVisible();
    await expect(rows).toHaveCount(2);
    await page.locator('.character-tag-filter-picker').click();

    await openManager(page);
    await page.locator(`#tag_view_list [data-tag-id="${sourceId}"] .tag_delete`).click();
    const mergeSelect = page.locator('dialog[open] #merge_tag_select');
    await expect(mergeSelect).toHaveCount(1);
    await mergeSelect.selectOption(targetId);
    await page.locator('dialog[open]').filter({ has: page.locator('#merge_tag_select') }).locator('.popup-button-ok').click();
    await expect(page.locator(`#tag_view_list [data-tag-id="${sourceId}"]`)).toHaveCount(0);
    await expect.poll(async () => {
        const settings = await persistedTags(page);
        return !settings.tags.some(tag => tag.id === sourceId)
            && avatars.every(avatar => settings.tag_map?.[avatar]?.includes(targetId));
    }, { timeout: 15_000 }).toBe(true);
    await page.keyboard.press('Escape');
    await page.reload();
    await testSetup.awaitST({ page });
    const settings = await persistedTags(page);
    expect(settings.tags.some(tag => tag.id === targetId && tag.name === targetName)).toBe(true);
    expect(avatars.every(avatar => settings.tag_map?.[avatar]?.includes(targetId))).toBe(true);
    const target = settings.tags.find(tag => tag.id === targetId);
    expect([target.color, target.color2]).toEqual(['', '']);
});

test('creates the typed tag instead of silently selecting a partial match', async ({ page }) => {
    const partialName = `hero${crypto.randomUUID().slice(0, 8)}`;
    const longerName = `super${partialName}`;
    await testSetup.awaitST({ page });
    await openLibrary(page);
    await openManager(page);
    await createTag(page, longerName);
    await page.keyboard.press('Escape');

    await page.getByRole('searchbox', { name: /Search characters|搜索角色/ }).fill('Dev Character 001');
    const first = page.locator('#rm_print_characters_block .character_select').filter({ hasText: 'Dev Character 001' }).first();
    await expect(first).toBeVisible();
    await page.getByRole('button', { name: /^(Bulk edit characters|批量编辑角色)$/ }).click();
    await first.click();
    await first.click({ button: 'right' });
    await page.locator('#character_context_menu_tag').click();
    const bulk = page.locator('#bulk_tag_shadow_popup');
    const input = bulk.locator('#bulkTagInput');
    await input.fill(partialName);
    await expect(bulk.locator('#bulkTagSuggestion-create')).toContainText(partialName);
    await expect(bulk.getByRole('option', { name: longerName })).toBeVisible();
    await input.press('Enter');
    await expect(bulk.locator('#bulkTagList .tag_name').filter({ hasText: partialName })).toHaveText(partialName);
    await expect(bulk.locator('#bulkTagList .tag_name').filter({ hasText: longerName })).toHaveCount(0);

    await input.fill(partialName);
    await bulk.getByRole('option', { name: longerName }).click();
    await expect(bulk.locator('#bulkTagList .tag_name').filter({ hasText: longerName })).toHaveText(longerName);
});

test('updates current chat message tag attributes after bulk add and remove', async ({ page }) => {
    const name = `chat${crypto.randomUUID().slice(0, 8)}`;
    await testSetup.awaitST({ page });
    await page.evaluate(async () => {
        const context = window.SillyTavern.getContext();
        const id = context.characters.findIndex(character => character?.name === 'Dev Character 001');
        if (id < 0) throw new Error('Seeded character not found');
        await context.selectCharacterById(id);
        await context.openCharacterChat('Dev Character 001 Session 01');
    });
    const message = page.locator('#chat > .mes').filter({ has: page.locator('.avatar img[src*="dev-character-001.png"]') }).first();
    await expect(message).toBeVisible({ timeout: 15_000 });

    await openLibrary(page);
    await openManager(page);
    await createTag(page, name);
    await page.keyboard.press('Escape');
    await page.getByRole('searchbox', { name: /Search characters|搜索角色/ }).fill('Dev Character 001');
    const first = page.locator('#rm_print_characters_block .character_select').filter({ hasText: 'Dev Character 001' }).first();
    await expect(first).toBeVisible();
    await page.getByRole('button', { name: /^(Bulk edit characters|批量编辑角色)$/ }).click();
    await first.click();
    await first.click({ button: 'right' });
    await page.locator('#character_context_menu_tag').click();
    const bulk = page.locator('#bulk_tag_shadow_popup');
    await bulk.locator('#bulkTagInput').fill(name);
    await bulk.locator('#bulkTagInput').press('Enter');
    await expect(message).toHaveAttribute('data-char-tags', new RegExp(name));
    await expect(message).toHaveAttribute(`data-char-tag-${name}`, '');

    const selected = bulk.locator('#bulkTagList .tag').filter({ hasText: name });
    await expect(selected.locator('.tag_remove')).toBeVisible();
    await selected.locator('.tag_remove').click();
    await expect(message).not.toHaveAttribute('data-char-tags', new RegExp(name));
    await expect(message).not.toHaveAttribute(`data-char-tag-${name}`, '');
});
