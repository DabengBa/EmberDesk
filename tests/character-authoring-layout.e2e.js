import { expect, test } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';

test('character authoring keeps identity, empty fields and permission aligned', async ({ page }) => {
    await testSetup.awaitST({ page });
    const name = `Layout ${crypto.randomUUID()}`;
    const card = {
        spec: 'chara_card_v2', spec_version: '2.0',
        data: {
            name, description: '', personality: '', scenario: '', first_mes: '', mes_example: '',
            creator_notes: '', system_prompt: '', post_history_instructions: '', alternate_greetings: [],
            tags: [], creator: '', character_version: '', extensions: {},
        },
    };
    await page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '角色库' }).click();
    await page.locator('#character_import_file').setInputFiles({
        name: 'layout.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(card)),
    });
    await expect(page.locator('.toast-success')).toContainText(name);
    await page.locator('.character_select').filter({ hasText: name }).first().click();
    const panel = page.locator('[data-react-authoring-owner="characterAuthoring"]');
    await expect(panel).toBeVisible();

    for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 844 });
        const layout = await panel.evaluate(element => {
            const nameInput = element.querySelector('[data-react-authoring-field="name"] input');
            const status = element.querySelector('[aria-live="polite"]');
            const tags = element.querySelector('[data-react-authoring-field="tags"] button');
            const empty = tags.querySelector('span span');
            const world = element.querySelector('[data-react-authoring-field="characterWorld"]');
            const primary = world.querySelector('select');
            const auxiliary = world.querySelector('select[aria-label*="auxiliary" i], select[aria-label*="附属书"]');
            const check = element.querySelector('input[type="checkbox"]');
            const text = document.createRange();
            text.selectNodeContents(check.parentElement.lastChild);
            const box = node => node.getBoundingClientRect();
            return {
                statusAfterName: box(status).top >= box(nameInput).bottom - 1 && box(status).left >= box(nameInput).left - 1,
                emptyLeft: box(empty).left - box(tags).left,
                worldLeft: Math.abs(box(primary).left - box(auxiliary).left),
                checkboxTextLeft: text.getBoundingClientRect().left - box(check).right,
                checkboxTextTop: Math.abs(text.getBoundingClientRect().top - box(check).top),
                overflow: element.scrollWidth > element.clientWidth,
            };
        });
        expect.soft(layout.statusAfterName, `status near identity at ${width}px`).toBe(true);
        expect.soft(layout.emptyLeft, `empty tags aligned left at ${width}px`).toBeLessThan(16);
        expect.soft(layout.worldLeft, `world controls aligned at ${width}px`).toBeLessThan(3);
        expect.soft(layout.checkboxTextLeft, `checkbox precedes label at ${width}px`).toBeGreaterThanOrEqual(0);
        expect.soft(layout.checkboxTextLeft).toBeLessThan(16);
        expect.soft(layout.checkboxTextTop).toBeLessThan(10);
        expect.soft(layout.overflow).toBe(false);
    }
});
