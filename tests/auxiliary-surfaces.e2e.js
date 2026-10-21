import { expect, test } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';

test('prompt panel fills its container and aligns token columns at different widths', async ({ page }) => {
    await page.goto('/login');
    await page.setContent('<link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/react/login/assets/workspace-panels.css"><nav id="left-nav-panel" class="drawer-content fillLeft openDrawer"><div id="prompt-layout-host"></div></nav>');
    await page.evaluate(async () => {
        const { mountPromptPanel } = await import('/react/login/assets/workspace-panels.js');
        const prompt = {
            identifier: 'layout-prompt', name: 'A long prompt name for width regression', role: 'system',
            content: '内容', marker: false, system_prompt: false, forbid_overrides: false,
            injection_position: 0, injection_depth: 4, injection_order: 100, injection_trigger: [],
        };
        const state = { promptsById: { [prompt.identifier]: prompt }, order: [{ identifier: prompt.identifier, enabled: true }], tokenCounts: { [prompt.identifier]: 1234 }, presetDirty: false };
        mountPromptPanel(document.getElementById('prompt-layout-host'), {
            subscribe: () => () => {}, getState: () => state,
            setPromptEnabled() {}, movePrompt() {}, updatePrompt() {}, addPrompt() { return null; }, deletePrompt() {},
        });
    });
    await page.locator('.prompt-panel-item-name').click();
    for (const width of [340, 420, 560]) {
        await page.locator('#left-nav-panel').evaluate((panel, width) => panel.style.width = `${width}px`, width);
        await expect.poll(async () => page.evaluate(() => {
            const rect = selector => document.querySelector(selector).getBoundingClientRect();
            const host = document.querySelector('#completion_prompt_manager');
            const row = rect('.prompt-panel-item');
            return {
                hostGap: Math.abs(rect('#openai_settings').width - host.getBoundingClientRect().width),
                rowGap: Math.abs(row.width - host.getBoundingClientRect().width),
                tokensGap: Math.abs(rect('.prompt-panel-head-tokens').right - rect('.prompt-panel-tokens').right),
                fieldGap: Math.abs(rect('.prompt-panel-item-editor').width - rect('.prompt-panel-content').width),
                overflow: Math.max(0, host.scrollWidth - host.clientWidth),
            };
        })).toEqual({ hostGap: 0, rowGap: 0, tokensGap: 0, fieldGap: 0, overflow: 0 });
    }
});

test('prompt handles reorder across rows without changing enablement or editor state', async ({ page }) => {
    await page.goto('/login');
    await page.setContent('<link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/react/login/assets/workspace-panels.css"><nav id="left-nav-panel" class="drawer-content fillLeft openDrawer"><div id="prompt-drag-host"></div></nav>');
    await page.evaluate(async () => {
        const { mountPromptPanel } = await import('/react/login/assets/workspace-panels.js');
        const prompts = ['first', 'second', 'third', 'fourth'].map(identifier => ({
            identifier, name: identifier, role: 'system', content: `${identifier} content`,
            marker: identifier === 'fourth', system_prompt: false, forbid_overrides: false,
            injection_position: 0, injection_depth: 4, injection_order: 100, injection_trigger: [],
        }));
        let state = {
            promptsById: Object.fromEntries(prompts.map(prompt => [prompt.identifier, prompt])),
            order: prompts.map(prompt => ({ identifier: prompt.identifier, enabled: prompt.identifier !== 'second' })),
            tokenCounts: {},
            presetDirty: false,
        };
        const listeners = new Set();
        window.promptDragMoves = [];
        mountPromptPanel(document.getElementById('prompt-drag-host'), {
            subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
            getState: () => state,
            movePrompt(identifier, targetIndex) {
                const order = [...state.order];
                const index = order.findIndex(entry => entry.identifier === identifier);
                order.splice(targetIndex, 0, ...order.splice(index, 1));
                state = { ...state, order };
                window.promptDragMoves.push({ identifier, targetIndex });
                listeners.forEach(listener => listener());
            },
            setPromptEnabled() {}, updatePrompt() {}, addPrompt() { return null; }, deletePrompt() {},
        });
    });
    const rows = page.locator('.prompt-panel-item');
    const order = () => rows.evaluateAll(items => items.map(item => item.dataset.promptIdentifier));
    const row = identifier => page.locator(`.prompt-panel-item[data-prompt-identifier="${identifier}"]`);
    const drag = async (source, target, bottom) => {
        const handle = await row(source).getByRole('button', { name: `拖拽排序 ${source}`, exact: true }).boundingBox();
        const destination = await row(target).locator('.prompt-panel-item-row').boundingBox();
        await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
        await page.mouse.down();
        await page.mouse.move(destination.x + destination.width / 2, destination.y + (bottom ? destination.height - 2 : 2), { steps: 8 });
        await page.mouse.up();
    };
    await expect(page.locator('.prompt-panel-drag-handle')).toHaveCount(4);
    await expect(page.locator('.prompt-panel-move')).toHaveCount(0);
    await row('first').locator('.prompt-panel-item-name').click();
    await drag('first', 'third', true);
    await expect.poll(order).toEqual(['second', 'third', 'first', 'fourth']);
    await expect(row('first').locator('.prompt-panel-content')).toHaveValue('first content');
    await expect(row('second').locator('.prompt-panel-enabled')).not.toBeChecked();
    await row('first').locator('.prompt-panel-item-name').click();
    await drag('fourth', 'second', false);
    await expect.poll(order).toEqual(['fourth', 'second', 'third', 'first']);
    await expect.poll(() => page.evaluate(() => window.promptDragMoves)).toEqual([
        { identifier: 'first', targetIndex: 2 }, { identifier: 'fourth', targetIndex: 0 },
    ]);
    const handle = row('third').getByRole('button', { name: '拖拽排序 third', exact: true });
    await handle.press('ArrowUp');
    await expect.poll(order).toEqual(['fourth', 'third', 'second', 'first']);
    await expect(handle).toBeFocused();
    const origin = await handle.boundingBox();
    const target = await row('first').boundingBox();
    await page.mouse.move(origin.x + origin.width / 2, origin.y + origin.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x + target.width / 2, target.y + target.height - 2, { steps: 8 });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect.poll(order).toEqual(['fourth', 'third', 'second', 'first']);
    await expect(page.locator('.prompt-panel-item-dragging')).toHaveCount(0);
    await page.mouse.move(origin.x + origin.width / 2, origin.y + origin.height / 2);
    await page.mouse.down();
    await page.mouse.move(900, 100, { steps: 8 });
    await page.mouse.up();
    await expect.poll(order).toEqual(['fourth', 'third', 'second', 'first']);
    const touchHandle = await row('first').locator('.prompt-panel-drag-handle').boundingBox();
    const touchTarget = await row('fourth').boundingBox();
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touchHandle.x + touchHandle.width / 2, y: touchHandle.y + touchHandle.height / 2 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: touchTarget.x + touchTarget.width / 2, y: touchTarget.y + 2 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(order).toEqual(['first', 'fourth', 'third', 'second']);
    await session.detach();
});

test('prompt drag order persists in the real workspace after reload', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.evaluate(async () => {
        const context = window.SillyTavern.getContext();
        await context.selectCharacterById(context.characters.findIndex(character => character.name === 'Dev Character 001'));
    });
    const rows = page.locator('#completion_prompt_manager .prompt-panel-item');
    await expect(rows.first()).toBeVisible();
    const original = await rows.evaluateAll(items => items.map(item => item.dataset.promptIdentifier));
    expect(original.length).toBeGreaterThan(2);
    const expected = [...original.slice(1, 3), original[0], ...original.slice(3)];
    const handle = await rows.first().locator('.prompt-panel-drag-handle').boundingBox();
    const target = await rows.nth(2).locator('.prompt-panel-item-row').boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x + target.width / 2, target.y + target.height - 2, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => rows.evaluateAll(items => items.map(item => item.dataset.promptIdentifier))).toEqual(expected);
    // Waiting for any /api/settings/save response is racy: the character-select
    // save can still be in flight and satisfy it while the reorder POST has
    // not landed. Poll the persisted document instead — and re-nudge a save
    // each cycle, because parallel workers share this user's settings document and
    // a revision conflict can drop the drag's own write entirely.
    const persistedOrder = async () => {
        const csrfToken = await page.evaluate(async () => {
            const response = await fetch('/csrf-token');
            const data = await response.json().catch(() => ({}));
            return data?.token ?? data?.data?.token ?? null;
        });
        const result = await page.evaluate(async (token) => {
            const response = await fetch('/api/settings/get', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'X-CSRF-Token': token } : {}),
                },
                body: '{}',
            });
            const data = await response.json();
            const settings = typeof data.settings === 'string' ? JSON.parse(data.settings) : data.settings;
            const buckets = settings?.oai_settings?.prompt_order ?? [];
            return buckets.map(bucket => (bucket.order ?? []).map(entry => entry.identifier));
        }, csrfToken);
        return result;
    };
    await expect(async () => {
        await page.evaluate(() => window.SillyTavern?.getContext?.()?.saveSettingsDebounced?.());
        const matches = (await persistedOrder()).some(order => order.join(',') === expected.join(','));
        expect(matches).toBe(true);
    }).toPass({ timeout: 20_000 });
    await page.reload();
    await testSetup.awaitST({ page });
    await expect.poll(() => rows.evaluateAll(items => items.map(item => item.dataset.promptIdentifier))).toEqual(expected);
});

test('preset row actions show dirty state and guard preset switching', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.evaluate(async () => {
        const context = window.SillyTavern.getContext();
        await context.selectCharacterById(context.characters.findIndex(character => character.name === 'Dev Character 001'));
    });
    const saveButton = page.locator('#update_oai_preset');
    const select = page.locator('#settings_preset_openai');
    const selectedPreset = () => select.locator('option:checked').innerText();
    // Earlier tests may leave settings ahead of the preset body; saving restores a clean baseline.
    const baselineSave = page.waitForResponse(response => response.url().includes('/api/presets/save') && response.request().method() === 'POST');
    await saveButton.click();
    expect((await baselineSave).ok()).toBe(true);
    await expect(saveButton).not.toHaveClass(/is-dirty/, { timeout: 15_000 });
    await page.locator('#new_oai_preset').click();
    const nameInput = page.locator('dialog[open] .popup-input');
    await expect(nameInput).toBeVisible();
    await nameInput.fill('Aux Preset');
    await page.locator('dialog[open] .popup-button-ok').click();
    await expect.poll(selectedPreset).toBe('Aux Preset');
    await expect(saveButton).not.toHaveClass(/is-dirty/, { timeout: 15_000 });
    const otherPreset = await select.locator('option').evaluateAll(options => options.find(option => option.textContent !== 'Aux Preset')?.textContent);
    expect(otherPreset).toBeTruthy();
    await page.locator('#completion_prompt_manager .prompt-panel-item .prompt-panel-enabled').first().click();
    await expect(saveButton).toHaveClass(/is-dirty/, { timeout: 15_000 });
    await select.selectOption({ label: otherPreset });
    const dialog = page.locator('dialog[open]');
    await expect(dialog.getByRole('button', { name: '保存并切换', exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: '不保存并切换', exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await expect.poll(selectedPreset).toBe('Aux Preset');
    await select.selectOption({ label: otherPreset });
    await dialog.getByRole('button', { name: '不保存并切换', exact: true }).click();
    await expect.poll(selectedPreset).toBe(otherPreset);
    await expect(saveButton).not.toHaveClass(/is-dirty/, { timeout: 15_000 });
});

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
    test.beforeEach(async ({ page }) => {
        await testSetup.awaitST({ page });
        await page.evaluate(async () => {
            const { Popup } = await import('/scripts/popup.js');
            for (const popup of Popup.util.popups.slice()) await popup.completeCancelled();
            const context = window.SillyTavern.getContext();
            await context.selectCharacterById(context.characters.findIndex(character => character.name === 'Dev Character 001'));
        });
        await expect(page.locator('#chat .mes').first()).toBeVisible();
    });

    test('macro search announces no results and can recover without losing its label', async ({ page }) => {
        await openMacroBrowser(page);
        const search = page.getByRole('searchbox', { name: '搜索宏', exact: true });
        await search.fill('auxiliary-no-matching-macro-123456');
        await expect(page.locator('.macro-empty-state')).toContainText('没有匹配的宏。');
        await page.getByRole('button', { name: '清除搜索', exact: true }).click();
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
        await expect(page.locator('dialog[open]')).toContainText('修改会随输入即时应用。');
        await expanded.fill('Edited text');
        await expect(page.locator('#auxiliary-editor-source')).toHaveValue('Edited text');
        await page.getByRole('button', { name: '完成', exact: true }).click();
        await expect(expanded).toHaveCount(0);
    });

    test('avatar previews have a keyboard-reachable named close control', async ({ page }) => {
        await page.locator('#chat .mes .avatar img').first().click();
        const close = page.getByRole('button', { name: '关闭头像预览', exact: true });
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
        const right = page.getByRole('button', { name: '向右移动裁剪框', exact: true });
        await expect(right).toBeVisible();
        await expect.poll(() => page.evaluate(() => Boolean(window.auxiliaryCrop.cropData))).toBe(true);
        await page.getByRole('button', { name: '缩小裁剪框', exact: true }).click();
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
            // At ≤1000px an open drawer is a full-screen overlay; a mobile user
            // would close it before interacting with the chat underneath.
            const { closeWorkspaceChildSlotHost } = await import('/script.js');
            closeWorkspaceChildSlotHost('right-nav-panel', { force: true });
            closeWorkspaceChildSlotHost('left-nav-panel', { force: true });
        });
        await page.evaluate(async () => {
            const ctx = window.SillyTavern.getContext();
            const message = ctx.chat.find(message => !message.is_system);
            message.extra ||= {};
            message.extra.media = [{ type: 'image', url: '/img/ai4.png', title: 'Avatar preview fixture' }];
            const { printMessages } = await import('/script.js');
            await printMessages();
        });
        await page.locator('#chat .mes_img').first().click();
        const dialog = page.getByRole('dialog', { name: '媒体预览', exact: true });
        await expect(dialog).toBeVisible();
        await expect(dialog.locator('img.img_enlarged')).toHaveAttribute('alt', 'Avatar preview fixture');
        await dialog.getByRole('button', { name: '放大', exact: true }).click();
        await expect(dialog.getByRole('button', { name: '缩小', exact: true })).toBeVisible();
        await expect(dialog.getByRole('button', { name: '关闭弹出窗口', exact: true })).toBeVisible();
        await dialog.getByRole('button', { name: '关闭弹出窗口', exact: true }).click();
        await expect(dialog).toHaveCount(0);
    });

    test('instant media and style preferences explain their save behavior', async ({ page }) => {
        await page.locator('#character_open_media_overrides').evaluate(element => element.click());
        await expect(page.locator('dialog[open]')).toContainText('更改会立即生效。');
        await expect(page.getByRole('button', { name: '完成', exact: true })).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.locator('dialog[open]')).toHaveCount(0);
        await page.locator('#creators_note_styles_button').evaluate(element => element.click());
        await expect(page.locator('dialog[open]')).toContainText('更改会立即生效。');
        await expect(page.getByRole('button', { name: '完成', exact: true })).toBeVisible();
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
        const dialog = page.locator('dialog[open]').filter({ has: page.getByRole('textbox', { name: 'CSS 预览', exact: true }) });
        await expect(dialog).toBeVisible();
        await expect(dialog.locator('.popup-button-cancel')).toBeHidden();
        await expect(dialog.getByRole('button', { name: '仅应用到创作者注释', exact: true })).toBeVisible();
        await dialog.getByRole('button', { name: '应用到整个页面', exact: true }).click();
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
        const stop = dialog.getByRole('button', { name: '停止', exact: true });
        await expect(stop).toBeVisible();
        expect((await stop.boundingBox()).height).toBeGreaterThanOrEqual(44);
        await stop.focus();
        await stop.press('Enter');
        await expect(dialog).toHaveCount(0);
    });
});
