import { expect, test } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';

const names = ['Layout proof A', 'Layout proof B', `Layout proof C ${'Very long name '.repeat(12)}`];
const notes = ['', 'Short notes', `Long creator notes\n${'with more detail '.repeat(30)}`];

for (const width of [1280, 320]) {
    test(`aligns the character library at ${width}px`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 800 });
        await page.route('**/api/characters/all', async route => {
            const response = await route.fetch();
            const cards = await response.json();
            for (const [index, name] of names.entries()) {
                const card = cards.find(item => item.avatar === `dev-character-00${index + 1}.png`);
                card.name = name;
                card.data.name = name;
                card.data.creator_notes = notes[index];
            }
            await route.fulfill({ response, json: cards });
        });
        await testSetup.awaitST({ page });
        await page.evaluate(async () => {
            const { printCharacters } = await import('/script.js');
            const { tags, tag_map: tagMap } = await import('/scripts/tags.js');
            const layoutTags = Array.from({ length: 10 }, (_, index) => ({
                id: `layout-proof-${index}`, name: `A long layout tag ${index}`,
            }));
            tags.push(...layoutTags);
            [0, 1, 10].forEach((count, index) => {
                tagMap[`dev-character-00${index + 1}.png`] = layoutTags.slice(0, count).map(tag => tag.id);
            });
            await printCharacters(true);
        });
        await page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '角色库' }).click();
        const search = page.locator('#emberdesk-react-character-search');
        await search.fill('Layout proof');

        const toolbar = page.locator('.emberdesk-react-character-library-toolbar');
        const create = toolbar.locator('button').filter({ has: page.locator('.fa-plus') });
        await expect.soft(create.locator('.character-list-action-label')).toHaveText(/^(新建|New)$/);
        for (const icon of ['fa-file-arrow-up', 'fa-link', 'fa-list-check']) {
            const button = toolbar.locator('button').filter({ has: page.locator(`.${icon}`) });
            await expect(button).toBeVisible();
            await expect(button).toHaveAccessibleName(/\S/);
            expect.soft((await button.textContent()).trim()).toBe('');
        }
        const controlBounds = await toolbar.evaluate(element => {
            const bounds = element.getBoundingClientRect();
            return [...element.querySelectorAll('button, input, select, [role="button"]')]
                .map(control => control.getBoundingClientRect())
                .filter(box => box.width && box.height)
                .map(box => box.left >= bounds.left - 1 && box.right <= bounds.right + 1);
        });
        expect.soft(controlBounds.every(Boolean)).toBe(true);

        const pagination = page.locator('#rm_print_characters_pagination');
        const pageSize = pagination.locator('.J-paginationjs-size-select');
        await expect(pageSize).toBeVisible();
        await expect.soft(pagination.locator('.paginationjs-pages')).toBeHidden();

        const rows = page.locator('#rm_print_characters_block .character_select');
        await expect(rows).toHaveCount(3);
        const layouts = [];
        for (const [index, name] of names.entries()) {
            const row = rows.filter({ has: page.locator('.ch_name', { hasText: name }) });
            await expect(row.locator('.ch_name')).toHaveText(name);
            await expect(row.locator('.ch_description')).toHaveText(notes[index].replace(/\s+/g, ' ').trim());
            const tags = row.locator('.tags_inline .tag');
            if (index === 0) await expect(tags).toHaveCount(0);
            else {
                await expect(tags.first()).toHaveText('A long layout tag 0');
                await expect(row.locator('.tags_inline')).toHaveAttribute('title', /A long layout tag 0/);
            }
            layouts.push(await row.evaluate(card => {
                const bounds = card.getBoundingClientRect();
                const slots = ['.character_name_block', '.ch_description', '.tags_inline'].map(selector => {
                    const slot = card.querySelector(selector).getBoundingClientRect();
                    return { top: Math.round(slot.top - bounds.top), height: Math.round(slot.height) };
                });
                const ellipsis = ['.ch_name', '.ch_description'].map(selector => {
                    const line = card.querySelector(selector);
                    return line.scrollWidth > line.clientWidth && getComputedStyle(line).textOverflow === 'ellipsis';
                });
                const tagBox = card.querySelector('.tags_inline');
                return { height: Math.round(bounds.height), slots, ellipsis, tagOverflow: tagBox.scrollHeight > tagBox.clientHeight + 1 };
            }));
        }
        for (const layout of layouts) {
            expect.soft(layout.height).toBe(layouts[0].height);
            expect.soft(layout.slots).toEqual(layouts[0].slots);
            expect.soft(layout.tagOverflow).toBe(false);
        }
        expect.soft(layouts[0].slots.every(slot => slot.height > 0)).toBe(true);
        expect.soft(layouts[2].ellipsis).toEqual([true, true]);
        await page.locator('#rm_characters_block').screenshot({ path: testInfo.outputPath('character-library.png') });

        if (width === 1280) {
            const originalSize = await pageSize.inputValue();
            await search.clear();
            try {
                await pageSize.selectOption('10');
                await expect(pagination.locator('.paginationjs-first')).toHaveClass(/disabled/);
                const next = pagination.locator('.paginationjs-next a');
                await expect(next).toBeVisible();
                await next.click();
                await expect(pagination.locator('.paginationjs-nav')).toHaveText(/^11/);
            } finally {
                await pageSize.selectOption(originalSize);
            }
        }
    });
}
