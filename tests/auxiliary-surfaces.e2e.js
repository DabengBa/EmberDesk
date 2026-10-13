import { expect, test } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';

async function openOnboarding(page) {
    await page.evaluate(async () => {
        const { Popup, POPUP_TYPE } = await import('/scripts/popup.js');
        const content = document.querySelector('#onboarding_template .onboarding');
        new Popup(content, POPUP_TYPE.TEXT, '', { wider: true }).show();
    });
}

async function openMacroBrowser(page) {
    await page.evaluate(async () => {
        const { Popup, POPUP_TYPE } = await import('/scripts/popup.js');
        const { MacroBrowser } = await import('/scripts/macros/engine/MacroBrowser.js');
        const host = document.createElement('div');
        await new MacroBrowser().renderInto(host);
        new Popup(host, POPUP_TYPE.TEXT, '', { wider: true, large: true }).show();
    });
}

test.describe('auxiliary workspace surfaces', () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await page.addInitScript(language => localStorage.setItem('language', language), testInfo.title.includes('Chinese') ? 'zh-cn' : 'en');
        await testSetup.awaitST({ page });
        await page.evaluate(async () => {
            const { Popup } = await import('/scripts/popup.js');
            for (const popup of Popup.util.popups.slice()) await popup.completeCancelled();
            const context = window.SillyTavern.getContext();
            await context.selectCharacterById(context.characters.findIndex(character => character.name === 'Dev Character 001'));
        });
        await expect(page.locator('#chat .mes').first()).toBeVisible();
    });

    test('onboarding labels language and opens the actual character library', async ({ page }) => {
        await openOnboarding(page);
        await expect(page.getByLabel('Language', { exact: true })).toBeVisible();
        await expect(page.locator('.onboarding a[href=""]')).toHaveCount(0);
        await page.locator('dialog[open] .open_characters_library').click();
        await expect(page.locator('dialog[open] .onboarding')).toHaveCount(0);
        await expect(page.locator('#right-nav-panel')).toHaveClass(/openDrawer/);
        await expect(page.locator('#rm_print_characters_block')).toBeVisible();
    });

    test('macro search announces no results and can recover without losing its label', async ({ page }) => {
        await openMacroBrowser(page);
        const search = page.getByRole('searchbox', { name: 'Search macros', exact: true });
        await search.fill('auxiliary-no-matching-macro-123456');
        await expect(page.locator('.macro-empty-state')).toContainText('No macros match your search');
        await page.getByRole('button', { name: 'Clear search', exact: true }).click();
        await expect(search).toHaveValue('');
        await expect(page.locator('.macro-item:visible').first()).toBeVisible();
        await expect(search).toBeFocused();
    });

    test('macro selection remains readable, exposes state, and stacks on narrow containers', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await openMacroBrowser(page);
        const item = page.locator('.macro-item:visible').first();
        await item.click();
        await page.mouse.move(0, 0);
        await expect(item).toHaveAttribute('aria-pressed', 'true');
        const layout = await page.evaluate(() => {
            const list = document.querySelector('.macro-list-panel').getBoundingClientRect();
            const details = document.querySelector('.macro-details-panel').getBoundingClientRect();
            const row = document.querySelector('.macro-item.selected');
            const foreground = getComputedStyle(row.querySelector('.macro-desc-preview'));
            const background = getComputedStyle(row);
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 1;
            const context = canvas.getContext('2d');
            const luminance = color => {
                context.clearRect(0, 0, 1, 1);
                context.fillStyle = color;
                context.fillRect(0, 0, 1, 1);
                return Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3)
                    .map(value => value / 255)
                    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
                    .reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index], 0);
            };
            const textLuminance = luminance(foreground.color);
            const backgroundLuminance = luminance(background.backgroundColor);
            const contrast = (Math.max(textLuminance, backgroundLuminance) + 0.05) / (Math.min(textLuminance, backgroundLuminance) + 0.05);
            return { listBottom: list.bottom, detailsTop: details.top, opacity: foreground.opacity, background: background.backgroundColor, contrast, rowDisplay: background.display };
        });
        expect(layout.detailsTop).toBeGreaterThanOrEqual(layout.listBottom);
        expect(layout.opacity).toBe('1');
        expect(layout.background).not.toBe('rgb(225, 138, 36)');
        expect(layout.contrast).toBeGreaterThanOrEqual(4.5);
        expect(layout.rowDisplay).toBe('grid');
    });

    test('Chinese macro labels and empty states remain translated after selection', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await openMacroBrowser(page);
        const search = page.getByRole('searchbox', { name: '搜索宏', exact: true });
        await expect(search).toBeVisible();
        await page.locator('.macro-item:visible').first().click();
        await expect(page.getByRole('region', { name: '宏详情', exact: true })).toContainText('说明');
        await search.fill('auxiliary-no-matching-macro-123456');
        await expect(page.locator('.macro-empty-state')).toContainText('没有匹配的宏。');
        await page.getByRole('button', { name: '清除搜索', exact: true }).click();
        await expect(search).toBeFocused();
    });

    test('expanded editors retain their field name, focus, and immediate-write explanation', async ({ page }) => {
        await page.evaluate(() => {
            const field = document.createElement('textarea');
            field.id = 'auxiliary-editor-source';
            field.setAttribute('aria-label', 'Character Description');
            field.value = 'Original text';
            const button = document.createElement('button');
            button.className = 'editor_maximize';
            button.dataset.for = field.id;
            button.textContent = 'Expand test editor';
            document.body.append(field, button);
            button.click();
        });
        const expanded = page.locator('dialog[open] .maximized_textarea');
        await expect(expanded).toHaveAccessibleName('Character Description');
        await expect(expanded).toBeFocused();
        await expect(page.locator('dialog[open]')).toContainText('Changes apply as you type');
        await expanded.fill('Edited text');
        await expect(page.locator('#auxiliary-editor-source')).toHaveValue('Edited text');
        await page.getByRole('button', { name: 'Done', exact: true }).click();
        await expect(expanded).toHaveCount(0);
    });

    test('avatar previews have a keyboard-reachable named close control', async ({ page }) => {
        await page.locator('#chat .mes .avatar img').first().click();
        const close = page.getByRole('button', { name: 'Close avatar preview', exact: true });
        await expect(close).toBeVisible();
        await expect(close).toBeFocused();
        await expect(page.locator('.zoomed_avatar:not(.template_element) img').last()).toHaveAttribute('alt', /.+/);
        await close.press('Enter');
        await expect(page.locator('.zoomed_avatar[forChar]')).toHaveCount(0);
    });

    test('crop controls adjust the selection without pointer dragging', async ({ page }) => {
        await page.evaluate(async () => {
            const { Popup, POPUP_TYPE } = await import('/scripts/popup.js');
            window.auxiliaryCrop = new Popup('<h3>Crop avatar</h3>', POPUP_TYPE.CROP, '', { cropImage: '/img/ai4.png' });
            window.auxiliaryCrop.show();
        });
        const right = page.getByRole('button', { name: 'Move crop right', exact: true });
        await expect(right).toBeVisible();
        await expect.poll(() => page.evaluate(() => Boolean(window.auxiliaryCrop.cropData))).toBe(true);
        await page.getByRole('button', { name: 'Shrink crop', exact: true }).click();
        const before = await page.evaluate(() => ({ ...window.auxiliaryCrop.cropData }));
        await right.focus();
        await right.press('Enter');
        await expect.poll(() => page.evaluate(() => window.auxiliaryCrop.cropData.x)).toBeGreaterThan(before.x);
        await page.keyboard.press('Escape');
        await expect(page.locator('dialog[open]')).toHaveCount(0);
    });

    test('long text dialogs scroll their body while keeping actions reachable', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.evaluate(async () => {
            const { Popup } = await import('/scripts/popup.js');
            Popup.show.text('Error details', Array.from({ length: 60 }, (_, i) => `<p>Diagnostic line ${i}</p>`).join(''));
        });
        const content = page.locator('dialog[open] .popup-content');
        await expect(content).toHaveCSS('overflow-y', 'auto');
        await content.evaluate(element => { element.scrollTop = element.scrollHeight; });
        await expect(content.getByText('Diagnostic line 59', { exact: true })).toBeInViewport();
        await expect(page.locator('dialog[open] .popup-button-ok')).toBeInViewport();
    });

    test('media preview keeps named zoom and close actions available after zooming', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.evaluate(async () => {
            const ctx = window.SillyTavern.getContext();
            const message = ctx.chat.find(message => !message.is_system);
            message.extra ||= {};
            message.extra.media = [{ type: 'image', url: '/img/ai4.png', title: 'Avatar preview fixture' }];
            const { printMessages } = await import('/script.js');
            await printMessages();
        });
        await page.locator('#chat .mes_img').first().click();
        const dialog = page.getByRole('dialog', { name: 'Media preview', exact: true });
        await expect(dialog).toBeVisible();
        await expect(dialog.locator('img.img_enlarged')).toHaveAttribute('alt', 'Avatar preview fixture');
        await dialog.getByRole('button', { name: 'Zoom in', exact: true }).click();
        await expect(dialog.getByRole('button', { name: 'Zoom out', exact: true })).toBeVisible();
        await expect(dialog.getByRole('button', { name: 'Close popup', exact: true })).toBeVisible();
        await dialog.getByRole('button', { name: 'Close popup', exact: true }).click();
        await expect(dialog).toHaveCount(0);
    });

    test('instant media and style preferences explain their save behavior', async ({ page }) => {
        await page.locator('#character_open_media_overrides').evaluate(element => element.click());
        await expect(page.locator('dialog[open]')).toContainText('Changes apply immediately');
        await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.locator('dialog[open]')).toHaveCount(0);
        await page.locator('#creators_note_styles_button').evaluate(element => element.click());
        await expect(page.locator('dialog[open]')).toContainText('Changes apply immediately');
        await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeVisible();
    });

    test('first-time style authorization uses explicit scope actions rather than cancel', async ({ page }) => {
        await page.evaluate(async () => {
            const context = window.SillyTavern.getContext();
            const character = context.characters[context.characterId];
            character.data.creator_notes = '<style>.auxiliary-style-fixture { color: inherit; }</style>';
            const { accountStorage } = await import('/scripts/util/AccountStorage.js');
            accountStorage.removeItem(`AllowGlobalStyles-${character.avatar}`);
            const { eventSource, event_types } = await import('/scripts/events.js');
            setTimeout(() => { window.auxiliaryStyleCheck = eventSource.emit(event_types.CHAT_CHANGED); }, 0);
            return true;
        });
        const dialog = page.locator('dialog[open]').filter({ has: page.getByRole('textbox', { name: 'CSS preview', exact: true }) });
        await expect(dialog).toBeVisible();
        await expect(dialog.locator('.popup-button-cancel')).toBeHidden();
        await expect(dialog.getByRole('button', { name: 'Just to Creator\'s Notes', exact: true })).toBeVisible();
        await dialog.getByRole('button', { name: 'Apply to the entire app', exact: true }).click();
        await expect(dialog).toHaveCount(0);
        expect(await page.evaluate(async () => {
            const context = window.SillyTavern.getContext();
            const { accountStorage } = await import('/scripts/util/AccountStorage.js');
            return accountStorage.getItem(`AllowGlobalStyles-${context.characters[context.characterId].avatar}`);
        })).toBe('true');
    });

    test('loading overlays announce the task and expose a native cancel control', async ({ page }) => {
        await page.evaluate(async () => {
            const { showActionLoader } = await import('/scripts/action-loader.js');
            window.auxiliaryLoader = showActionLoader({ message: 'Loading auxiliary fixture', onStop: () => {} });
        });
        const dialog = page.getByRole('dialog', { name: 'Loading auxiliary fixture', exact: true });
        await expect(dialog).toHaveAttribute('aria-busy', 'true');
        const stop = dialog.getByRole('button', { name: 'Stop', exact: true });
        await expect(stop).toBeVisible();
        expect((await stop.boundingBox()).height).toBeGreaterThanOrEqual(44);
        await stop.focus();
        await stop.press('Enter');
        await expect(dialog).toHaveCount(0);
    });
});
