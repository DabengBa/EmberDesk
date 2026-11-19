import { expect, test } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';

test('character authoring keeps compact tools in reach and aligns the world book controls', async ({ page }, testInfo) => {
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

    const drawer = page.locator('#right-nav-panel');
    const scroll = drawer.locator('.scrollableInner');
    const tools = [
        panel.getByRole('button', { name: /^(删除|Delete)$/ }),
        panel.getByRole('button', { name: /^(世界书|World Info)$/ }),
        panel.getByRole('button', { name: /^(导出|Export)$/ }),
        panel.getByRole('button', { name: /^(查找替换|Find and replace)$/ }),
        panel.locator('button[aria-haspopup="menu"][title]'),
    ];
    const more = tools.at(-1);
    const advanced = panel.getByRole('button', { name: /^(高级|Advanced)$/ });
    const permission = panel.getByRole('checkbox', { name: /允许此角色的消息 CSS 加载外部资源|Allow external CSS resources/ });
    await expect.soft(permission).toHaveCount(0);
    await expect.soft(panel.getByText(/^(角色卡内容|Card content)$/)).toHaveCount(0);
    await expect.soft(panel.getByText(/^(暂无标签|No tags)$/)).toHaveCount(0);

    for (const width of [522, 320]) {
        await page.setViewportSize({ width, height: 640 });
        await scroll.evaluate(element => { element.scrollTop = 0; });
        await expect.poll(async () => (await drawer.boundingBox()).width).toBe(width);
        for (const button of tools) await expect(button).toHaveCount(1);
        const buttons = await Promise.all(tools.map(button => button.boundingBox()));
        const nameBox = await panel.locator('[data-react-authoring-field="name"] input').boundingBox();
        const panelBox = await panel.boundingBox();
        expect.soft(Math.max(...buttons.map(box => box.y + box.height)), `tools above identity at ${width}px`).toBeLessThanOrEqual(nameBox.y);
        expect.soft(buttons.every(box => box.x >= panelBox.x && box.x + box.width <= panelBox.x + panelBox.width), `tools within panel at ${width}px`).toBe(true);
        if (width === 522) expect.soft(Math.max(...buttons.map(box => box.y)) - Math.min(...buttons.map(box => box.y))).toBeLessThan(3);

        const layout = await panel.evaluate(element => {
            const nameInput = element.querySelector('[data-react-authoring-field="name"] input');
            const status = element.querySelector('[aria-live="polite"]');
            const tags = element.querySelector('button[data-react-authoring-field="tags"]');
            const identity = nameInput.closest('[data-react-authoring-field="name"]').parentElement;
            const world = element.querySelector('[data-react-authoring-field="characterWorld"]');
            const primary = world.querySelector('select');
            const auxiliary = world.querySelector('select[aria-label*="auxiliary" i], select[aria-label*="附属书"]');
            const openBook = world.querySelector('[data-react-authoring-action="openBoundWorldInfo"]');
            const box = node => node.getBoundingClientRect();
            return {
                statusAfterName: box(status).top >= box(nameInput).bottom - 1 && box(status).left >= box(nameInput).left - 1,
                tagsInIdentity: identity.contains(tags),
                worldSameRow: Math.abs(box(primary).top - box(auxiliary).top),
                worldSameHeight: Math.abs(box(primary).height - box(auxiliary).height),
                openSameRow: Math.abs(box(primary).top - box(openBook).top),
                overflow: element.scrollWidth > element.clientWidth,
            };
        });
        expect.soft(layout.statusAfterName, `status near identity at ${width}px`).toBe(true);
        expect.soft(layout.tagsInIdentity).toBe(true);
        expect.soft(layout.worldSameRow, `world controls aligned at ${width}px`).toBeLessThan(3);
        expect.soft(layout.worldSameHeight).toBeLessThan(3);
        expect.soft(layout.openSameRow).toBeLessThan(3);
        expect.soft(layout.overflow).toBe(false);
        const screenshot = testInfo.outputPath(`authoring-${width}px.png`);
        await page.screenshot({ path: screenshot });
        await testInfo.attach(`authoring-${width}px`, { path: screenshot, contentType: 'image/png' });

        await advanced.click();
        await expect(panel.locator('#character-authoring-advanced-body').getByRole('checkbox', { name: /允许此角色的消息 CSS 加载外部资源|Allow external CSS resources/ })).toBeVisible();

        await expect.poll(() => scroll.evaluate(element => {
            element.scrollTop = element.scrollHeight;
            return element.scrollTop;
        })).toBeGreaterThan(100);
        const scrollBox = await scroll.boundingBox();
        const trigger = await more.boundingBox();
        expect.soft(trigger.y).toBeGreaterThanOrEqual(scrollBox.y - 1);
        expect.soft(trigger.y - scrollBox.y).toBeLessThan(65);
        await more.press('Enter');
        const menu = panel.getByRole('menu');
        await expect(menu.getByRole('menuitem').first()).toBeFocused();
        const menuBox = await menu.boundingBox();
        expect.soft(menuBox.y).toBeGreaterThanOrEqual(trigger.y + trigger.height);
        expect.soft(menuBox.y + menuBox.height).toBeLessThanOrEqual(Math.min(640, scrollBox.y + scrollBox.height));
        expect.soft(menuBox.x).toBeGreaterThanOrEqual(panelBox.x);
        await page.keyboard.press('Escape');
        await expect(menu).toHaveCount(0);
        await expect(more).toBeFocused();
        await advanced.click();
    }

    const binding = panel.locator('[data-react-authoring-field="characterWorld"] select').first();
    const saved = page.waitForResponse(response => new URL(response.url()).pathname === '/api/characters/edit' && response.ok());
    await binding.selectOption('Dev World 01');
    await saved;
    await tools[0].click();
    const dialog = page.locator('dialog[open]').filter({ has: page.locator('#del_char_checkbox') });
    await expect(dialog.locator('#del_char_checkbox')).toBeChecked();
    const worldCheckbox = dialog.locator('.world-cascade-checkbox');
    await expect(worldCheckbox).toHaveCount(1);
    await expect(worldCheckbox).not.toBeChecked();
    await dialog.locator('.popup-button-cancel').click();
    await expect(dialog).toHaveCount(0);
    await expect(panel.locator('[data-react-authoring-field="name"] input')).toHaveValue(name);
});

test('create keeps its submit action separate from the upper character tools', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '角色库' }).click();
    await page.getByRole('button', { name: /^(新建角色|Create New Character)$/ }).click();
    const panel = page.locator('[data-react-authoring-owner="characterAuthoring"][data-react-authoring-mode="create"]');
    const toolbar = panel.getByRole('group', { name: /^(角色操作|Character actions)$/ });
    await expect(toolbar.getByRole('button', { name: /^(世界书|World Info)$/ })).toBeVisible();
    await expect(toolbar.locator('button[aria-haspopup="menu"]')).toBeVisible();
    await expect(panel.getByRole('button', { name: /^(删除|Delete|导出|Export|查找替换|Find and replace)$/ })).toHaveCount(0);
    const create = panel.getByRole('button', { name: /^(创建|Create)$/ });
    await expect(toolbar.getByRole('button', { name: /^(创建|Create)$/ })).toHaveCount(0);
    const name = `Created ${crypto.randomUUID()}`;
    await panel.locator('[data-react-authoring-field="name"] input').fill(name);
    const saved = page.waitForResponse(response => new URL(response.url()).pathname === '/api/characters/create' && response.ok());
    await create.click();
    await saved;
    await expect(page.locator('[data-react-authoring-mode="edit"] [data-react-authoring-field="name"] input')).toHaveValue(name);
});
