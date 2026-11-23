import { expect, test } from '@playwright/test';

const credentials = {
    handle: process.env.PLAYWRIGHT_USER ?? 'playwright-e2e',
    password: process.env.PLAYWRIGHT_PASSWORD ?? 'playwright',
};

async function signIn(request) {
    const csrf = await request.get('/csrf-token');
    expect(csrf.ok()).toBe(true);
    const { token } = await csrf.json();
    const options = { data: credentials, headers: { 'x-csrf-token': token } };
    expect((await request.post('/api/users/login', options)).ok()).toBe(true);
}

test('Express gates the shared React document and redirects the retired workspace entry', async ({ request }) => {
    const denied = await request.get('/?chat=example&tab=prompt', { maxRedirects: 0 });
    expect(denied.status()).toBe(302);
    expect(denied.headers().location).toBe('/login?chat=example&tab=prompt');

    const noToken = await request.post('/api/users/login', { data: credentials });
    expect(noToken.ok()).toBe(false);
    expect((await request.get('/', { maxRedirects: 0 })).headers().location).toBe('/login');

    const retired = await request.get('/index.html?chat=example', { maxRedirects: 0 });
    expect(retired.status()).toBe(302);
    expect(retired.headers().location).toBe('/?chat=example');

    await signIn(request);
    const workspace = await request.get('/?chat=example', { maxRedirects: 0 });
    const settings = await request.get('/settings', { maxRedirects: 0 });
    expect(workspace.status()).toBe(200);
    expect(settings.status()).toBe(200);
    const document = await workspace.text();
    expect(document).toContain('<div id="root"></div>');
    expect(document).toBe(await settings.text());
    expect((await request.get('/not-a-workspace-route', { maxRedirects: 0 })).status()).toBe(404);
});

test('the authenticated React workspace commits native hosts before starting the runtime once', async ({ page }) => {
    await signIn(page.request);
    const scriptLoads = [];
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', request => {
        if (new URL(request.url()).pathname === '/script.js') scriptLoads.push(request.url());
    });
    let hostsAtNativeRequest;
    await page.route(url => url.pathname === '/script.js', async route => {
        hostsAtNativeRequest ??= await page.evaluate(() => ({
            chat: Boolean(document.querySelector('#root #sheld > #chat')),
            composer: Boolean(document.querySelector('#root #form_sheld > #send_form')),
            worldInfo: Boolean(document.querySelector('#root #top-settings-holder #WorldInfo')),
            template: Boolean(document.querySelector('#root #generic_draggable_template')?.content.querySelector('.draggable .dragTitle')),
        }));
        await route.continue();
    });

    await page.goto('/');
    await expect(page).toHaveURL(/\/$/);
    await expect.poll(() => hostsAtNativeRequest).toEqual({
        chat: true, composer: true, worldInfo: true, template: true,
    });
    try {
        await expect(page.getByRole('button', { name: /Character Library|角色库/ })).toBeVisible({ timeout: 15_000 });
        await expect.poll(() => page.evaluate(() => window.__emberDeskStartup?.appReadyAtMs)).toEqual(expect.any(Number));
    } catch (error) {
        throw new Error(`Workspace failed to start; native entry requests: ${scriptLoads.length}; browser errors: ${errors.join('\n')}`, { cause: error });
    }
    expect(scriptLoads).toHaveLength(1);
    expect(await page.evaluate(async () => {
        const { getContext } = await import('/scripts/st-context.js');
        return { globalsInstalled: 'SillyTavern' in window, charactersAvailable: Array.isArray(getContext().characters) };
    })).toEqual({ globalsInstalled: false, charactersAvailable: true });
});

for (const iosFirefox of [false, true]) {
    test(`startup viewport workaround ${iosFirefox ? 'runs for iOS Firefox' : 'does not run for desktop Chromium'}`, async ({ page }) => {
        await signIn(page.request);
        await page.addInitScript(useIosFirefox => {
            if (useIosFirefox) {
                Object.defineProperty(navigator, 'userAgent', {
                    value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/131.0 Mobile/15E148 Safari/605.1.15',
                });
            }
            window.__usedAbsoluteBodyPosition = false;
            new MutationObserver(records => {
                for (const record of records) {
                    if (record.target === document.body && record.oldValue?.includes('position: absolute')) {
                        window.__usedAbsoluteBodyPosition = true;
                    }
                }
            }).observe(document, { subtree: true, attributes: true, attributeFilter: ['style'], attributeOldValue: true });
        }, iosFirefox);

        await page.goto('/');
        await expect.poll(() => page.evaluate(() => window.__emberDeskStartup?.appReadyAtMs)).toEqual(expect.any(Number));
        expect(await page.evaluate(() => [window.__usedAbsoluteBodyPosition, document.body.style.position])).toEqual([iosFirefox, '']);
    });
}

test('shows the workspace frame without admitting composer input while settings are held', async ({ page }, testInfo) => {
    await signIn(page.request);
    const held = Promise.withResolvers();
    const release = Promise.withResolvers();
    await page.route('**/api/settings/get', async route => {
        held.resolve();
        await release.promise;
        await route.continue();
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    try {
        await held.promise;
        await expect(page.locator('#sheld > #workspace-startup')).toBeVisible({ timeout: 3_000 });
        await expect(page.locator('#preloader, #loader')).toHaveCount(0);
        await expect(page.locator('#form_sheld')).toHaveAttribute('inert', '');
        const pending = await page.evaluate(async () => {
            const { eventSource, event_types } = await import('/script.js');
            window.__readyEvents = 0;
            eventSource.on(event_types.APP_READY, () => {
                window.__readyEvents++;
                window.__composerInertAtReady = document.querySelector('#form_sheld').inert;
            });
            const composer = document.querySelector('#send_textarea');
            composer.focus();
            return { focused: document.activeElement === composer, ready: window.__emberDeskStartup.appReadyAtMs ?? null };
        });
        expect(pending).toEqual({ focused: false, ready: null });
        await page.screenshot({ path: testInfo.outputPath('settings-held.png') });
        const originalViewport = page.viewportSize();
        await page.setViewportSize({ width: 329, height: 580 });
        await expect(page.locator('#sheld > #workspace-startup')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(329);
        await page.screenshot({ path: testInfo.outputPath('settings-held-narrow.png') });
        await page.setViewportSize(originalViewport);
    } finally {
        release.resolve();
    }
    await expect(page.locator('#workspace-startup')).toBeHidden();
    await expect(page.locator('#send_textarea')).toBeEditable();
    expect(await page.evaluate(() => [window.__readyEvents, window.__composerInertAtReady])).toEqual([1, false]);
    await page.screenshot({ path: testInfo.outputPath('ready.png') });
});

test('retains a message update made before the main chat owner mounts', async ({ page }) => {
    await signIn(page.request);
    const held = Promise.withResolvers();
    const release = Promise.withResolvers();
    await page.route('**/api/settings/get', async route => {
        held.resolve();
        await release.promise;
        await route.continue();
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    let pending;
    try {
        await held.promise;
        pending = await page.evaluate(async () => {
            const { chat, updateMessageBlock } = await import('/script.js');
            const owner = document.querySelector('#chat').dataset.reactMainChatOwner ?? null;
            chat.push({ name: 'Bootstrap', mes: 'before update', is_user: true, is_system: false });
            const index = chat.length - 1;
            updateMessageBlock(index, { name: 'Bootstrap', mes: 'bootstrap update', is_user: true, is_system: false }, { rerenderMessage: false });
            return { owner, message: chat[index].mes };
        });
    } finally {
        release.resolve();
    }
    expect(pending.owner).toBeNull();
    expect(pending.message).toBe('bootstrap update');
    await expect(page.locator('#chat')).toHaveAttribute('data-react-main-chat-owner', 'react');
    await expect(page.locator('#chat')).toContainText('bootstrap update');
});

test('workspace reaches APP_READY before an unrelated image finishes loading', async ({ page }) => {
    await signIn(page.request);
    const held = Promise.withResolvers();
    const release = Promise.withResolvers();
    await page.route('**/startup-proof-delayed-image.svg', async route => {
        held.resolve();
        await release.promise;
        await route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg"/>' });
    });
    await page.route(url => url.pathname === '/', async route => {
        const response = await route.fetch();
        const body = (await response.text()).replace('</body>', '<img src="/startup-proof-delayed-image.svg" hidden></body>');
        await route.fulfill({ response, body });
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    try {
        await held.promise;
        await expect.poll(() => page.evaluate(() => window.__emberDeskStartup?.appReadyAtMs), { timeout: 5_000 })
            .toEqual(expect.any(Number));
        expect(await page.evaluate(() => document.readyState)).not.toBe('complete');
        await expect(page.locator('#send_textarea')).toBeEditable();
    } finally {
        release.resolve();
    }
});
