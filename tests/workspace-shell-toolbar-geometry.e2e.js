import { expect, test } from '@playwright/test';
import { openWorkspacePanelFixture } from './helpers/workspace-panel-fixture.js';

for (const viewport of [
    { width: 1440, height: 900, label: 'wide desktop' },
    { width: 390, height: 844, label: 'narrow mobile' },
]) {
    test(`workspace toolbar stays outside chat and drawer bounds at ${viewport.label}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await openWorkspacePanelFixture(page, `
                <div id="top-settings-holder">
                    <div id="rightNavHolder" class="drawer"><nav id="right-nav-panel" class="drawer-content openDrawer fillRight"></nav></div>
                </div>
                <div id="emberdesk-react-workspace-shell-chrome-host"></div>
                <div id="sheld"><div id="chat"></div><div id="send_form"></div></div>
        `);
        await page.evaluate(async () => {
            const module = await (await import('/scripts/workspace-panels-react-bridge.js')).loadWorkspacePanelsModule();
            const runtime = {
                getSnapshot: () => ({ chat: { id: null, characterId: null, title: '' }, generation: { phase: 'idle' }, provider: { status: 'idle' } }),
                subscribe: () => () => {},
                commands: {},
            };
            module.mountWorkspaceShellChrome(document.getElementById('emberdesk-react-workspace-shell-chrome-host'), {
                runtime,
                state: { activeContext: 'assistant', contextTitle: 'Toolbar geometry', status: 'success' },
                commands: {},
            });
        });
        await expect(page.locator('[data-react-workspace-shell-chrome] nav')).toBeVisible();
        await expect.poll(() => page.locator('#right-nav-panel').evaluate(element => getComputedStyle(element).transform))
            .toBe('matrix(1, 0, 0, 1, 0, 0)');

        const geometry = await page.evaluate(() => {
            const rect = (selector) => {
                const element = document.querySelector(selector);
                if (!element) return null;
                const { x, y, right, bottom, width, height } = element.getBoundingClientRect();
                return { x, y, right, bottom, width, height };
            };
            const intersects = (first, second) => Boolean(first && second
                && first.left < second.right && first.right > second.left
                && first.top < second.bottom && first.bottom > second.top);
            const nav = document.querySelector('[data-react-workspace-shell-chrome] nav').getBoundingClientRect();
            const chat = document.querySelector('#chat').getBoundingClientRect();
            const openDrawer = document.querySelector('#right-nav-panel.openDrawer').getBoundingClientRect();
            const toEdges = box => ({ left: box.left, top: box.top, right: box.right, bottom: box.bottom });
            return {
                host: rect('#emberdesk-react-workspace-shell-chrome-host'),
                chrome: rect('[data-react-workspace-shell-chrome]'),
                nav: rect('[data-react-workspace-shell-chrome] nav'),
                chat: rect('#chat'),
                drawer: rect('#right-nav-panel.openDrawer'),
                navOverlapsChat: intersects(toEdges(nav), toEdges(chat)),
                navOverlapsDrawer: intersects(toEdges(nav), toEdges(openDrawer)),
            };
        });

        expect(geometry.host.height).toBe(42);
        expect(geometry.nav.bottom).toBeLessThanOrEqual(geometry.chat.y);
        expect(geometry.navOverlapsChat, JSON.stringify(geometry)).toBe(false);
        expect(geometry.navOverlapsDrawer, JSON.stringify(geometry)).toBe(false);
    });
}
