import { expect, test } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';

test.setTimeout(90_000);

async function setup(page, entry) {
    let saved = true;
    let holdProvider = false;
    let releaseProvider;
    let holdSecret = false;
    let releaseSecret;
    await page.route('**/api/backends/chat-completions/{status,generate}', async route => {
        if (holdProvider) await new Promise(resolve => { releaseProvider = resolve; });
        await route.fulfill({ status: holdProvider ? 503 : 200, json: holdProvider ? { error: true } : { data: [] } });
    });
    await testSetup.awaitST({ page });
    await page.route('**/api/secrets/read', route => route.fulfill({ json: saved ? { api_key_openai: true } : {} }));
    await page.route('**/api/secrets/{write,delete}', async route => {
        if (holdSecret) await new Promise(resolve => { releaseSecret = resolve; });
        saved = route.request().url().endsWith('/write');
        await route.fulfill({ json: { id: 'fixture-id' } });
    });
    if (entry === 'page') await page.goto('/settings?tab=providers');
    else await page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '设置' }).click();
    const surface = page.locator(`[data-settings-surface="${entry}"]`);
    const url = surface.locator('#settings-providers-customUrl');
    await expect(url).toBeVisible();
    await url.fill('https://fixture.invalid/v1');
    await surface.locator('#settings-providers-openaiModel').fill('fixture-model');
    return {
        surface, url,
        model: surface.locator('#settings-providers-openaiModel'),
        key: surface.locator('#provider-secret-input'),
        save: surface.getByRole('button', { name: /^(Save key|保存 Key)$/ }),
        clear: surface.getByRole('button', { name: /^(Clear key|清除 Key)$/ }),
        connect: surface.locator('#provider-connect-button'),
        testButton: surface.locator('#provider-test-button'),
        holdProvider: () => { holdProvider = true; },
        releaseProvider: () => releaseProvider(),
        providerWaiting: () => Boolean(releaseProvider),
        holdSecret: () => { holdSecret = true; },
        releaseSecret: () => releaseSecret(),
        secretWaiting: () => Boolean(releaseSecret),
    };
}

for (const entry of ['page', 'drawer']) {
    test(`${entry}: missing credentials are visible and neither action sends a request`, async ({ page }) => {
        await page.route('**/api/backends/chat-completions/{status,generate}', route => route.fulfill({ json: { data: [] } }));
        await page.route('**/api/secrets/read', route => route.fulfill({ json: {} }));
        await testSetup.awaitST({ page });
        if (entry === 'page') await page.goto('/settings?tab=providers');
        else await page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '设置' }).click();
        const surface = page.locator(`[data-settings-surface="${entry}"]`);
        await surface.locator('#settings-providers-customUrl').fill('');
        await surface.locator('#settings-providers-openaiModel').fill('fixture-model');
        let requests = 0;
        page.on('request', request => {
            if (/\/api\/backends\/chat-completions\/(status|generate)$/.test(new URL(request.url()).pathname)) requests++;
        });
        for (const id of ['provider-connect-button', 'provider-test-button']) {
            await surface.locator(`#${id}`).click();
            await expect(surface.getByRole('alert')).toContainText(/请先保存 API key|Save an API key/);
        }
        expect(requests).toBe(0);
    });

    test(`${entry}: replacing and clearing a saved key invalidates connection feedback`, async ({ page }) => {
        const f = await setup(page, entry);
        await f.connect.click();
        await expect(f.surface.getByText('online', { exact: true })).toBeVisible();
        await f.key.fill('isolated-fake-key');
        await f.save.click();
        await expect(f.key).toHaveValue('');
        await expect(f.surface.getByText('online', { exact: true })).toHaveCount(0);
        await f.connect.click();
        await expect(f.surface.getByText('online', { exact: true })).toBeVisible();
        await f.clear.click();
        await expect(f.surface.getByText('online', { exact: true })).toHaveCount(0);
    });

    for (const field of ['url', 'model']) {
        test(`${entry}: obsolete ${field} failure is not shown`, async ({ page }) => {
            const f = await setup(page, entry);
            f.holdProvider();
            await f.connect.click();
            await expect.poll(f.providerWaiting).toBe(true);
            await f[field].fill(field === 'url' ? 'https://new.invalid/v1' : 'new-model');
            f.releaseProvider();
            await expect(f.connect).toBeEnabled();
            await expect(f.surface.getByRole('alert')).toHaveCount(0);
        });
    }

    test(`${entry}: key mutation and connection actions are serialized in both directions`, async ({ page }) => {
        const f = await setup(page, entry);
        f.holdProvider();
        await f.connect.click();
        await expect.poll(f.providerWaiting).toBe(true);
        await expect(f.key).toBeDisabled();
        await expect(f.save).toBeDisabled();
        await expect(f.clear).toBeDisabled();
        f.releaseProvider();
        await expect(f.connect).toBeEnabled();
        await f.key.fill('isolated-fake-key');
        f.holdSecret();
        await f.save.click();
        await expect.poll(f.secretWaiting).toBe(true);
        await expect(f.connect).toBeDisabled();
        await expect(f.testButton).toBeDisabled();
        f.releaseSecret();
        await expect(f.connect).toBeEnabled();
    });
}
