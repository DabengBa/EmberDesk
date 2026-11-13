import { test, expect } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';

test('rich message fragments reject executable HTML while preserving unchanged mounted children', async ({ page }) => {
    await page.route('**/main-chat-html-safety', route => route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html><body><div id="sheld"><div id="chat"></div></div></body></html>',
    }));
    await page.goto('/main-chat-html-safety');
    await page.evaluate(async () => {
        const panels = await import('/react/login/assets/workspace-panels.js');
        window.renderSafetyRow = (name, messageHtml) => panels.mountWorkspacePanel('mainChatMessageList', document.getElementById('chat'), {
            state: { mainChatSnapshot: { orderedMessageIds: ['0'], messagesById: { '0': {
                id: '0', name, content: 'test', render: {
                    messageHtml,
                    mediaHtml: '<img class="mes_img" src="x" onerror="window.__unsafe=1"><a href="javascript:window.__unsafe=2">bad</a>',
                    fileHtml: '<div class="mes_file_name">notes.txt</div>',
                },
            } } } }, commands: {}, runtime: {},
        });

        window.renderSafetyRow('first', '<div data-message-style-scope="x"><style>.safe {color:rgb(1, 2, 3)}</style><b class="safe">formatted</b><img src="x" onerror="window.__unsafe=3"><button class="menu_button">Action</button><a href="https://example.com" target="_blank" rel="noopener">link</a></div>');
    });
    const body = page.locator('.mes[mesid="0"] .mes_text');
    await expect(body.locator('b.safe')).toHaveText('formatted');
    await expect(body.locator('b.safe')).toHaveCSS('color', 'rgb(1, 2, 3)');
    await expect(body.locator('style')).toHaveCount(1);
    await expect(body.locator('button.menu_button')).toHaveText('Action');
    await expect(body.locator('a')).toHaveAttribute('target', '_blank');
    await expect(body.locator('a')).toHaveAttribute('rel', /\bnoopener\b/);
    await expect(page.locator('.mes_media_wrapper .mes_img')).not.toHaveAttribute('onerror');
    await expect(body.locator('img')).not.toHaveAttribute('onerror');
    await expect(page.locator('.mes_media_wrapper a')).not.toHaveAttribute('href', /javascript:/i);
    expect(await page.evaluate(() => window.__unsafe)).toBeUndefined();
    await body.evaluate(node => { window.__kept = document.createElement('span'); window.__kept.textContent = 'mounted'; node.append(window.__kept); });
    await page.evaluate(() => window.renderSafetyRow('changed name', '<div data-message-style-scope="x"><style>.safe {color:rgb(1, 2, 3)}</style><b class="safe">formatted</b><img src="x" onerror="window.__unsafe=3"><button class="menu_button">Action</button><a href="https://example.com" target="_blank" rel="noopener">link</a></div>'));
    await expect.poll(() => body.evaluate(node => node.contains(window.__kept))).toBe(true);
    await page.evaluate(() => window.renderSafetyRow('changed name', '<p>updated</p>'));
    await expect(body).toHaveText('updated');
    expect(await body.evaluate(node => node.contains(window.__kept))).toBe(false);
});

test('real formatter and attachment output survives every mounted rich-body branch', async ({ page }) => {
    await testSetup.awaitST({ page });
    const requests = [];
    await page.route('https://row-policy.invalid/**', route => {
        requests.push(route.request().url());
        return route.abort();
    });
    const expected = await page.evaluate(async () => {
        const { messageFormatting } = await import('/scripts/message-service.js');
        const { buildChatMessageRichBodyRender } = await import('/scripts/chat-message-render-service.js');
        const panels = await import('/react/login/assets/workspace-panels.js');
        const message = {
            name: 'System', is_system: true, is_user: false,
            mes: '<style>.probe{color:rgb(1,2,3);background-image:url(https://row-policy.invalid/blocked)}</style><div class="probe">formatted</div><button class="menu_button">system action</button><a href="https://example.com">link</a><details open><summary>details</summary><em>content</em></details><svg viewBox="0 0 8 8"><circle cx="4" cy="4" r="2"></circle></svg><div data-example="custom" style="color:rgb(7,8,9)">inline</div>',
            extra: {
                uses_system_ui: true,
                reasoning: '<span class="thought">reasoning</span>', bias: '<b class="bias">bias</b>',
                media: [
                    { type: 'image', url: '/img/ai4.png', title: 'image' },
                    { type: 'video', url: '/media/test.mp4', title: 'video' },
                    { type: 'audio', url: '/media/test.mp3', title: 'audio' },
                ],
                files: [{ name: 'notes.txt', size: 2048 }],
            },
        };
        const render = buildChatMessageRichBodyRender(message, { messageId: 999, formatMessage: messageFormatting });
        const host = document.createElement('div'); host.id = 'rich-body-compat'; document.body.append(host);
        panels.mountWorkspacePanel('mainChatMessageList', host, {
            state: { mainChatSnapshot: { orderedMessageIds: ['999'], messagesById: { '999': {
                id: '999', name: message.name, content: message.mes, render,
            } } } }, commands: {}, runtime: {},
        });
        // The former innerHTML assignment parsed these already-formatted strings directly.
        // Template parsing remains inert, so comparison does not issue extra requests.
        return Object.fromEntries(['messageHtml', 'reasoningHtml', 'mediaHtml', 'fileHtml', 'biasHtml'].map(key => {
            const template = document.createElement('template'); template.innerHTML = render[key];
            return [key, template.innerHTML];
        }));
    });
    const row = page.locator('#rich-body-compat .mes[mesid="999"]');
    const branches = { messageHtml: '.mes_text', reasoningHtml: '.mes_reasoning', mediaHtml: '.mes_media_wrapper', fileHtml: '.mes_file_wrapper', biasHtml: '.mes_bias' };
    for (const [key, selector] of Object.entries(branches)) {
        await expect.poll(() => row.locator(selector).evaluate((node, original) => {
            const clone = node.cloneNode(true);
            const template = document.createElement('template'); template.innerHTML = original;
            const before = template.content.querySelectorAll('*');
            const after = clone.querySelectorAll('*');
            // Workspace accessibility enhancement adds these after insertion in both implementations.
            after.forEach((element, index) => {
                const prior = before[index];
                if (!prior?.classList.contains('interactable')) element.classList.remove('interactable');
                for (const attr of ['tabindex', 'role']) {
                    if (!prior?.hasAttribute(attr)) element.removeAttribute(attr);
                }
            });
            return clone.innerHTML;
        }, expected[key])).toBe(expected[key]);
    }
    await expect(row.locator('.mes_text .custom-probe')).toHaveCSS('color', 'rgb(1, 2, 3)');
    await expect(row.locator('.mes_text button.menu_button')).toHaveText('system action');
    await expect(row.locator('.mes_text details[open] summary')).toHaveText('details');
    await expect(row.locator('.mes_text svg circle')).toHaveAttribute('r', '2');
    await expect(row.locator('.mes_text [data-example="custom"]')).toHaveCSS('color', 'rgb(7, 8, 9)');
    await expect(row.locator('.mes_reasoning .custom-thought')).toHaveText('reasoning');
    await expect(row.locator('.mes_bias .custom-bias')).toHaveText('bias');
    await expect(row.locator('.mes_media_wrapper img.mes_img')).toHaveCount(1);
    await expect(row.locator('.mes_media_wrapper video.mes_video')).toHaveCount(1);
    await expect(row.locator('.mes_media_wrapper audio.mes_audio')).toHaveCount(1);
    await expect(row.locator('.mes_file_wrapper .mes_file_name')).toHaveText('notes.txt');
    await page.waitForTimeout(500);
    expect(requests).toEqual([]);
});

test('mounted rows preserve character CSS authorization and gallery controls', async ({ page }) => {
    await testSetup.awaitST({ page });
    const requests = [];
    await page.route('https://row-resources.invalid/**', route => {
        requests.push(new URL(route.request().url()).pathname);
        return route.abort();
    });
    await page.evaluate(async () => {
        const { messageFormatting } = await import('/scripts/message-service.js');
        const { buildChatMessageRichBodyRender } = await import('/scripts/chat-message-render-service.js');
        const { getMessageShellContext, registerMessageShellContext } = await import('/scripts/message-shell-context.js');
        const panels = await import('/react/login/assets/workspace-panels.js');
        const original = getMessageShellContext();
        const messagesById = {};
        try {
            for (const [id, avatar, path] of [['996', 'blocked.png', 'blocked'], ['997', 'allowed.png', 'allowed']]) {
                registerMessageShellContext({ ...original, state: { ...original.state, characters: [{ avatar, canonical_id: 'role-id' }], this_chid: 0, power_user: { ...original.state.power_user, external_media_allowed_overrides: ['allowed.png'], external_media_authorization_canonical_ids: { 'allowed.png': 'role-id' } } } });
                const message = { name: 'System', is_system: true, mes: `<style>.probe{background-image:url(https://row-resources.invalid/${path});color:rgb(4,5,6)}</style><div class="probe">${path}</div>`, extra: { media: [
                    { type: 'image', url: '/img/ai4.png', title: 'first' },
                    { type: 'image', url: '/img/ai4.png', title: 'second' },
                ], media_display: 'gallery', media_index: 1 } };
                messagesById[id] = { id, name: message.name, content: message.mes, render: buildChatMessageRichBodyRender(message, { messageId: Number(id), formatMessage: messageFormatting }) };
            }
        } finally { registerMessageShellContext(original); }
        const host = document.createElement('div'); host.id = 'resource-compat'; document.body.append(host);
        panels.mountWorkspacePanel('mainChatMessageList', host, { state: { mainChatSnapshot: { orderedMessageIds: ['996', '997'], messagesById } }, commands: {}, runtime: {} });
    });
    const blocked = page.locator('#resource-compat .mes[mesid="996"]');
    const allowed = page.locator('#resource-compat .mes[mesid="997"]');
    await expect(blocked.locator('.custom-probe')).toHaveCSS('color', 'rgb(4, 5, 6)');
    await expect(allowed.locator('.custom-probe')).toHaveCSS('color', 'rgb(4, 5, 6)');
    await expect(allowed.locator('.mes_img_swipe_counter')).toHaveText('2/2');
    await expect(allowed.locator('.mes_img_swipe_left')).toHaveAttribute('role', 'button');
    await expect(allowed.locator('img.mes_img')).toHaveAttribute('title', 'second');
    await expect.poll(() => requests).toContain('/allowed');
    expect(requests).not.toContain('/blocked');
});
