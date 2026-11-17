import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

// This isolated same-origin host proves the frame module itself, not the
// production workspace's React/controller/event-bus integration.
test('production frame module works in a parent without jQuery', async ({ page }) => {
    const moduleSource = await readFile(new URL('../public/scripts/frontend-frame.js', import.meta.url), 'utf8');
    let moduleRequests = 0;
    await page.route('**/__u001_frame_host__', route => route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html><head><title>Frame host</title></head><body><div class="mes" mesid="7"><div class="mes_text"><pre></pre></div></div></body></html>',
    }));
    await page.route('**/__u001_frame_module__.js', route => {
        moduleRequests += 1;
        return route.fulfill({ contentType: 'text/javascript', body: moduleSource });
    });
    await page.goto('/__u001_frame_host__');
    expect(await page.evaluate(() => [typeof window.$, typeof window.jQuery])).toEqual(['undefined', 'undefined']);

    const mounted = await page.evaluate(async () => {
        const frameModule = await import('/__u001_frame_module__.js');
        const listeners = new Map();
        const lifecycle = [];
        const eventSource = {
            on(name, handler) {
                if (!listeners.has(name)) listeners.set(name, new Set());
                listeners.get(name).add(handler);
            },
            removeListener(name, handler) {
                listeners.get(name)?.delete(handler);
            },
            emit(name, ...args) {
                for (const handler of listeners.get(name) ?? []) handler(...args);
            },
            count(name) {
                return listeners.get(name)?.size ?? 0;
            },
        };
        const root = document.querySelector('.mes_text');
        const source = '<html><body><div id="frame-content" style="height: 210px">Frame ready</div><script>window.frameReady = true;</script></body></html>';
        root.querySelector('pre').textContent = source;
        window.frameTest = { frameModule, root, source, eventSource, lifecycle };
        return frameModule.mountFrontendFrames(root, {
            messageId: '7',
            frameIdSeed: 'stable-7',
            eventSource,
            getContextSnapshot: frameId => ({ frameId, chatId: 'test-chat' }),
            emit: (name, frameId) => lifecycle.push({ name, frameId }),
        });
    });
    expect(moduleRequests).toBe(1);
    expect(mounted).toBe(1);
    const iframe = page.locator('.ed-frontend-frame iframe');
    await expect(iframe).toHaveCount(1);
    await expect.poll(() => iframe.evaluate(element => element.contentWindow?.frameReady === true)).toBe(true);
    await expect.poll(() => page.evaluate(() => window.frameTest.lifecycle.map(event => event.name))).toEqual([
        'frontend_frame_render_started', 'frontend_frame_render_ended',
    ]);

    const bridge = await iframe.evaluate(element => {
        const frame = element.contentWindow;
        const api = frame.EmberDeskFrame;
        const snapshot = api.getContext();
        frame.receivedEvents = [];
        frame.handler = payload => frame.receivedEvents.push(payload);
        return {
            globals: [typeof frame.$, typeof frame.jQuery, typeof frame.parent.$, typeof frame.parent.jQuery],
            frameId: api.frameId,
            messageId: api.messageId,
            snapshot,
            frozen: Object.isFrozen(snapshot),
            subscribed: api.on('message_received', frame.handler),
            rejected: api.on('not_an_allowed_event', frame.handler),
        };
    });
    expect(bridge).toEqual({
        globals: ['undefined', 'undefined', 'undefined', 'undefined'],
        frameId: 'ed-frame--stable-7--0',
        messageId: '7',
        snapshot: { frameId: 'ed-frame--stable-7--0', chatId: 'test-chat' },
        frozen: true,
        subscribed: true,
        rejected: false,
    });
    await page.evaluate(() => window.frameTest.eventSource.emit('message_received', 'first'));
    expect(await iframe.evaluate(element => element.contentWindow.receivedEvents)).toEqual(['first']);
    expect(await iframe.evaluate(element => element.contentWindow.EmberDeskFrame.off('message_received', element.contentWindow.handler))).toBe(true);
    await page.evaluate(() => window.frameTest.eventSource.emit('message_received', 'after-off'));
    expect(await iframe.evaluate(element => element.contentWindow.receivedEvents)).toEqual(['first']);
    expect(await page.evaluate(() => window.frameTest.eventSource.count('message_received'))).toBe(0);

    await expect.poll(() => iframe.evaluate(element => Number.parseFloat(element.style.height))).toBeGreaterThanOrEqual(210);
    const initialHeight = await iframe.evaluate(element => Number.parseFloat(element.style.height));
    await iframe.evaluate(element => {
        element.contentDocument.querySelector('#frame-content').style.height = '700px';
    });
    await expect.poll(() => iframe.evaluate(element => Number.parseFloat(element.style.height))).toBeGreaterThan(initialHeight);
    await expect.poll(() => iframe.evaluate(element => Number.parseFloat(element.style.height))).toBeGreaterThanOrEqual(700);

    expect(await iframe.evaluate(element => element.contentWindow.EmberDeskFrame.on('message_received', element.contentWindow.handler))).toBe(true);
    expect(await page.evaluate(() => window.frameTest.eventSource.count('message_received'))).toBe(1);
    const cleanup = await page.evaluate(() => {
        const { frameModule, root, source, eventSource } = window.frameTest;
        const detachedFrame = root.querySelector('iframe');
        frameModule.unmountFrontendFrames(root);
        eventSource.emit('message_received', 'after-unmount');
        const pre = root.querySelector('pre');
        return {
            listeners: eventSource.count('message_received'),
            iframeConnected: detachedFrame.isConnected,
            observerReleased: detachedFrame.__edHeightObserver === undefined,
            sourceRestored: pre?.textContent === source && pre.style.display !== 'none',
            slots: root.querySelectorAll('.ed-frontend-frame').length,
            globals: [typeof window.$, typeof window.jQuery],
        };
    });
    expect(cleanup).toEqual({
        listeners: 0,
        iframeConnected: false,
        observerReleased: true,
        sourceRestored: true,
        slots: 0,
        globals: ['undefined', 'undefined'],
    });
});
