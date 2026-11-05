import { test, expect } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';

test('failure notice fits the real mobile workspace without covering the composer', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await testSetup.awaitST({ page });
    await expect(page.locator('#chat')).toBeVisible();
    const boxes = await page.evaluate(async () => {
        const failure = await import('/scripts/main-chat-failure.js');
        failure.showMainChatFailure(document.getElementById('chat'), 'Could not load chat data. Try reloading the page.');
        const rect = selector => {
            const r = document.querySelector(selector).getBoundingClientRect();
            return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height };
        };
        return { alert: rect('[data-react-main-chat-build-error]'), chat: rect('#chat'), composer: rect('#send_form'), width: innerWidth, height: innerHeight };
    });
    expect(boxes.alert.left).toBeGreaterThanOrEqual(0);
    expect(boxes.alert.right).toBeLessThanOrEqual(boxes.width);
    expect(boxes.alert.top).toBeGreaterThanOrEqual(0);
    expect(boxes.alert.bottom).toBeLessThanOrEqual(boxes.height);
    expect(boxes.alert.bottom).toBeLessThanOrEqual(boxes.chat.top + 1);
    expect(boxes.chat.height).toBeGreaterThan(0);
    expect(boxes.chat.bottom).toBeLessThanOrEqual(boxes.composer.top + 1);
});

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) test(`mount failure notice stays visible while a long chat scrolls (${viewport.width}px)`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.route('**/chat-failure-scroll', route => route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html><head><link rel="stylesheet" href="/style.css"></head><body><div id="sheld" style="height:400px;display:flex;flex-direction:column"><div id="chat" style="min-height:0"><div style="min-height:1500px">Messages</div></div><div id="form_sheld"></div></div></body></html>',
    }));
    await page.goto('/chat-failure-scroll');
    await page.evaluate(async () => {
        const failure = await import('/scripts/main-chat-failure.js');
        window.testFailure = failure;
        failure.showMainChatFailure(document.getElementById('chat'), 'Chat failed');
    });
    const alert = page.locator('[data-react-main-chat-build-error]');
    for (const position of [0, 1000]) {
        await page.locator('#chat').evaluate((node, value) => { node.scrollTop = value; }, position);
        if (position) expect(await page.locator('#chat').evaluate(node => node.scrollTop)).toBeGreaterThan(0);
        await expect(alert).toBeInViewport();
    }
    await page.evaluate(() => window.testFailure.clearMainChatFailure(document.getElementById('chat')));
    await expect(alert).toHaveCount(0);
});

test('main chat reports a React effect failure and clears it after a successful commit', async ({ page }) => {
    await page.route('**/chat-failure-test', route => route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html><body><div id="sheld"><div id="chat"></div><div id="form_sheld"></div></div></body></html>',
    }));
    await page.goto('/chat-failure-test');
    await page.evaluate(async () => {
        const panels = await import('/react/login/assets/workspace-panels.js');
        window.testPanels = panels;
        const commands = new Proxy({}, { get(_target, key) {
            if (key === 'setSlashVisibleOwner') throw new Error('injected effect failure');
            return () => {};
        } });
        panels.mountWorkspacePanel('mainChatMessageList', document.getElementById('chat'), { state: {}, commands, runtime: {} });
    });
    const alert = page.locator('[data-react-main-chat-build-error]');
    await expect(alert).toBeVisible();
    await expect(alert).toHaveAttribute('role', 'alert');
    expect(await alert.evaluate(node => node.parentElement.id)).toBe('sheld');
    await page.evaluate(() => {
        window.testPanels.mountWorkspacePanel('mainChatMessageList', document.getElementById('chat'), {
            state: { mainChatSnapshot: { orderedMessageIds: ['0'], messagesById: { '0': { id: '0', content: 'Recovered message', render: { messageHtml: 'Recovered message' } } } } }, commands: { setSlashVisibleOwner: () => {} }, runtime: {},
        });
    });
    await expect(alert).toHaveCount(0);
    await expect(page.locator('#chat > .mes[mesid="0"] .mes_text')).toContainText('Recovered message');
});

test('an earlier React commit cannot clear a later snapshot failure', async ({ page }) => {
    await page.route('**/chat-failure-race', route => route.fulfill({ contentType: 'text/html', body: '<div id="sheld"><div id="chat"></div></div>' }));
    await page.goto('/chat-failure-race');
    await page.evaluate(async () => {
        const panels = await import('/react/login/assets/workspace-panels.js');
        const failure = await import('/scripts/main-chat-failure.js');
        const host = document.getElementById('chat');
        window.testPanels = panels;
        panels.mountWorkspacePanel('mainChatMessageList', host, { state: {}, commands: { setSlashVisibleOwner: () => {} }, runtime: {} });

        failure.showMainChatFailure(host, 'Later snapshot failure');
    });
    await page.waitForTimeout(250);
    await expect(page.locator('[data-react-main-chat-build-error]')).toHaveText('Later snapshot failure');
    await page.evaluate(() => window.testPanels.mountWorkspacePanel('mainChatMessageList', document.getElementById('chat'), {
        state: { mainChatSnapshot: { orderedMessageIds: ['0'], messagesById: { '0': { id: '0', content: 'Race recovered', render: { messageHtml: 'Race recovered' } } } } },
        commands: { setSlashVisibleOwner: () => {} }, runtime: {},
    }));
    await expect(page.locator('[data-react-main-chat-build-error]')).toHaveCount(0);
    await expect(page.locator('#chat > .mes[mesid="0"] .mes_text')).toContainText('Race recovered');
});

test('a pending host snapshot cannot clear a newer host failure', async ({ page }) => {
    await page.route('**/chat-host-race', route => route.fulfill({ contentType: 'text/html', body: '<div id="sheld"><div id="chat"></div></div>' }));
    await page.goto('/chat-host-race');
    await page.evaluate(async () => {
        const { mountWorkspacePanelHost } = await import('/scripts/workspace-panel-host-controller.js');
        const { showMainChatFailure } = await import('/scripts/main-chat-failure.js');
        const host = document.getElementById('chat');
        const features = { reactPanels: { mainChatMessageList: true } };
        const mount = async getState => {
            const result = await mountWorkspacePanelHost({ kind: 'mainChatMessageList', features, ensureContainer: () => host, getState, commands: { setSlashVisibleOwner: () => {} }, runtime: {} });
            if (!result.mounted) showMainChatFailure(host, 'Snapshot B failed');
            return result;
        };
        const state = { mainChatSnapshot: { orderedMessageIds: ['0'], messagesById: { '0': { id: '0', render: { messageHtml: 'Recovered C' } } } } };
        window.mountC = () => mount(() => state);
        window.pendingA = mount(() => new Promise(resolve => { window.releaseA = () => resolve(state); }));
        await mount(() => { throw new Error('injected snapshot B'); });
        window.releaseA();
        await window.pendingA;
    });
    await page.waitForTimeout(250);
    await expect(page.locator('[data-react-main-chat-build-error]')).toHaveText('Snapshot B failed');
    await page.evaluate(() => window.mountC());
    await expect(page.locator('[data-react-main-chat-build-error]')).toHaveCount(0);
    await expect(page.locator('#chat > .mes[mesid="0"] .mes_text')).toContainText('Recovered C');
});

test('a pending bridge bundle cannot clear a newer host failure', async ({ page }) => {
    let releaseBundle;
    let bundleRequested;
    const requested = new Promise(resolve => { bundleRequested = resolve; });
    const gate = new Promise(resolve => { releaseBundle = resolve; });
    await page.route('**/workspace-panels.js*', async route => { bundleRequested(); await gate; await route.continue(); });
    await page.route('**/chat-bridge-race', route => route.fulfill({ contentType: 'text/html', body: '<div id="sheld"><div id="chat"></div></div>' }));
    await page.goto('/chat-bridge-race');
    await page.evaluate(async () => {
        const { mountWorkspacePanelHost } = await import('/scripts/workspace-panel-host-controller.js');
        const { showMainChatFailure } = await import('/scripts/main-chat-failure.js');
        const host = document.getElementById('chat');
        const features = { reactPanels: { mainChatMessageList: true } };
        const state = { mainChatSnapshot: { orderedMessageIds: ['0'], messagesById: { '0': { id: '0', render: { messageHtml: 'Recovered C' } } } } };
        const mount = async getState => {
            const result = await mountWorkspacePanelHost({ kind: 'mainChatMessageList', features, ensureContainer: () => host, getState, commands: { setSlashVisibleOwner: () => {} }, runtime: {} });
            if (!result.mounted) showMainChatFailure(host, 'Snapshot B failed');
            return result;
        };
        window.mountC = () => mount(() => state);
        window.failB = () => mount(() => { throw new Error('injected snapshot B'); });
        window.pendingA = mount(() => state);
    });
    await requested;
    await page.evaluate(() => window.failB());
    await expect(page.locator('[data-react-main-chat-build-error]')).toHaveText('Snapshot B failed');
    releaseBundle();
    await page.evaluate(() => window.pendingA);
    await page.waitForTimeout(250);
    await expect(page.locator('[data-react-main-chat-build-error]')).toHaveText('Snapshot B failed');
    await page.evaluate(() => window.mountC());
    await expect(page.locator('[data-react-main-chat-build-error]')).toHaveCount(0);
    await expect(page.locator('#chat > .mes[mesid="0"] .mes_text')).toContainText('Recovered C');
});
