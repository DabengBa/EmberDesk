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
        await expect(page.locator('#preloader')).toHaveCount(0);
    } catch (error) {
        throw new Error(`Workspace failed to start; native entry requests: ${scriptLoads.length}; browser errors: ${errors.join('\n')}`, { cause: error });
    }
    expect(scriptLoads).toHaveLength(1);
});
