import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

const source = `<!doctype html><html><head><style></style></head><body>
<div id="frame-content" style="height: 1800px">Frame ready</div>
<p id="frame-tail">Card end</p>
<div id="viewport-content" style="min-height: 100vh" hidden></div>
<script>
try { parent.document.body.dataset.frameWrite = 'changed'; } catch {}
try { parent.SillyTavern.marker = 'changed'; } catch {}
document.querySelector('#frame-content').dataset.script = 'ran';
document.querySelector('#frame-content').dataset.bridge = typeof window.EmberDeskFrame;
document.querySelector('#frame-content').dataset.jquery = typeof window.jQuery;
</script></body></html>`;

for (const useBlobUrl of [false, true]) {
    test(`fits an isolated card to its changing content (legacy blob preference: ${useBlobUrl})`, async ({ page }) => {
        const [moduleSource, css] = await Promise.all([
            readFile(new URL('../public/scripts/frontend-frame.js', import.meta.url), 'utf8'),
            readFile(new URL('../public/css/toggle-dependent.css', import.meta.url), 'utf8'),
        ]);
        await page.route('**/__frame_host__', route => route.fulfill({
            contentType: 'text/html',
            body: `<!doctype html><html><head><style>${css}</style></head><body data-frame-write="untouched"><div class="mes" mesid="7"><div class="mes_text"><pre></pre></div></div></body></html>`,
        }));
        await page.route('**/__frame_module__.js', route => route.fulfill({
            contentType: 'text/javascript', body: moduleSource,
        }));
        await page.goto('/__frame_host__');
        const mounted = await page.evaluate(async ({ source, useBlobUrl }) => {
            const frameModule = await import('/__frame_module__.js');
            window.SillyTavern = { marker: 'untouched' };
            window.jQuery = function parentJQuery() {};
            const root = document.querySelector('.mes_text');
            root.querySelector('pre').textContent = source;
            const lifecycle = [];
            const ctx = {
                messageId: '7',
                frameIdSeed: 'stable-7',
                settings: { use_blob_url: useBlobUrl },
                emit: (name, frameId) => lifecycle.push([name, frameId]),
            };
            window.frameTest = { frameModule, root, ctx, lifecycle };
            return frameModule.mountFrontendFrames(root, ctx);
        }, { source, useBlobUrl });
        expect(mounted).toBe(1);

        const iframe = page.locator('.ed-frontend-frame iframe');
        const frame = iframe.contentFrame();
        await expect(frame.locator('#frame-content')).toHaveAttribute('data-script', 'ran');
        await expect(page.locator('body')).toHaveAttribute('data-frame-write', 'untouched');
        expect(await page.evaluate(() => window.SillyTavern.marker)).toBe('untouched');
        await expect(iframe).toHaveAttribute('sandbox', 'allow-scripts');
        expect(await iframe.getAttribute('src')).toBeNull();
        expect(await iframe.evaluate(element => element.contentDocument)).toBeNull();
        await expect(frame.locator('#frame-content')).toHaveAttribute('data-bridge', 'undefined');
        await expect(frame.locator('#frame-content')).toHaveAttribute('data-jquery', 'undefined');
        expect(await page.evaluate(() => typeof window.__ED_FRAME_API__)).toBe('undefined');

        await expect.poll(() => page.evaluate(() => window.frameTest.lifecycle)).toEqual([
            ['frontend_frame_render_started', 'ed-frame--stable-7--0'],
            ['frontend_frame_render_ended', 'ed-frame--stable-7--0'],
        ]);
        expect(await page.evaluate(() => {
            const { frameModule, root, ctx } = window.frameTest;
            return frameModule.mountFrontendFrames(root, ctx);
        })).toBe(0);

        const tail = frame.locator('#frame-tail');
        const height = () => iframe.evaluate(element => element.offsetHeight);
        const contentHeight = () => tail.evaluate(element => Math.ceil(element.ownerDocument.documentElement.getBoundingClientRect().height));
        await expect.poll(async () => await height() - await contentHeight()).toBe(0);
        await expect(tail).not.toBeInViewport();
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await expect(tail).toBeInViewport();
        expect(await tail.evaluate(element => element.ownerDocument.defaultView.scrollY)).toBe(0);

        const content = frame.locator('#frame-content');
        // CSSOM changes don't generate DOM mutation records.
        await content.evaluate(element => element.ownerDocument.styleSheets[0].insertRule('#frame-content { height: 90px !important; }'));
        await expect.poll(async () => await height() - await contentHeight()).toBe(0);
        await content.evaluate(element => element.ownerDocument.styleSheets[0].deleteRule(0));
        await expect.poll(async () => await height() - await contentHeight()).toBe(0);

        const resizeContent = px => content.evaluate((element, value) => { element.style.height = `${value}px`; }, px);
        for (const px of [40, 450, 30]) {
            await resizeContent(px);
            await expect.poll(async () => await height() - await contentHeight()).toBe(0);
        }
        const shortHeight = await height();
        await frame.locator('#viewport-content').evaluate(element => { element.hidden = false; });
        await expect.poll(height).toBeGreaterThan(shortHeight);
        const viewportHeight = await height();
        // A 100vh element plus margins must not repeatedly grow with its iframe.
        await iframe.evaluate(() => new Promise(resolve => {
            let frames = 10;
            function tick() { if (--frames) requestAnimationFrame(tick); else resolve(); }
            requestAnimationFrame(tick);
        }));
        expect(await height()).toBe(viewportHeight);

        await frame.locator('#viewport-content').evaluate(element => { element.hidden = true; });
        await content.evaluate(element => {
            element.style.overflowY = 'auto';
            const inner = element.ownerDocument.createElement('div');
            inner.style.height = '500px';
            element.append(inner);
        });
        await expect.poll(height).toBe(shortHeight);
        expect(await content.evaluate(element => {
            element.scrollTop = 100;
            return element.scrollTop;
        })).toBe(100);

        await expect(page.locator('.mes_text').locator('details, summary, pre')).toHaveCount(0);

        await page.evaluate(() => {
            const { frameModule, root } = window.frameTest;
            frameModule.unmountFrontendFrames(root);
        });
        await expect(iframe).toHaveCount(0);
        const restored = page.locator('.mes_text > pre');
        await expect(restored).toBeVisible();
        expect(await restored.textContent()).toBe(source);
    });
}
