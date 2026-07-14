import { test, expect } from '@playwright/test';

const userHandle = process.env.PLAYWRIGHT_USER ?? 'playwright-e2e';
const userPassword = process.env.PLAYWRIGHT_PASSWORD ?? 'playwright';
const pngPixel = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
);

async function openWorkspace(page) {
    await page.goto('/');

    if (new URL(page.url()).pathname === '/login') {
        await page.getByPlaceholder('请输入用户名').first().fill(userHandle);
        await page.getByPlaceholder('请输入密码').fill(userPassword);
        await page.getByRole('button', { name: '登录' }).click();
        await page.waitForURL(url => new URL(url).pathname === '/');
    }

    await page.waitForFunction(
        'window.SillyTavern?.getContext && document.getElementById("preloader") === null',
        { timeout: 120_000 },
    );
}

async function openBackgroundLibrary(page) {
    if (!await page.locator('#Backgrounds').isVisible()) {
        await page.locator('#backgrounds-drawer-toggle').click();
    }
    await expect(page.locator('#Backgrounds')).toBeVisible();
    await expect(page.locator('#bg_menu_content .bg_example').first()).toBeVisible();
}

async function fetchPersistedSettings(page) {
    const payload = await page.evaluate(async () => {
        const response = await fetch('/api/settings/get', {
            method: 'POST',
            headers: window.SillyTavern.getContext().getRequestHeaders(),
            body: JSON.stringify({}),
            cache: 'no-cache',
        });
        return response.json();
    });
    return typeof payload.settings === 'string' ? JSON.parse(payload.settings) : payload.settings;
}

async function uploadActiveBackground(page, filename) {
    const item = page.locator(`#bg_menu_content .bg_example[bgfile="${filename}"]`);
    const uploadSettingsSave = page.waitForResponse((response) => {
        if (!response.url().endsWith('/api/settings/save') || response.request().method() !== 'POST') {
            return false;
        }
        try {
            return response.request().postDataJSON()?.background?.name === filename;
        } catch {
            return false;
        }
    });
    await page.locator('#add_bg_button').setInputFiles({
        name: filename,
        mimeType: 'image/png',
        buffer: pngPixel,
    });
    await expect(item).toBeVisible();
    await expect(item).toHaveClass(/selected-background/);
    expect((await uploadSettingsSave).ok()).toBe(true);
    expect((await fetchPersistedSettings(page)).background?.name).toBe(filename);
    return item;
}

test('persists the replacement before an active background disappears from the UI', async ({ page: initialPage, context }) => {
    let page = initialPage;
    const filename = `delete-persistence-${Date.now()}.png`;

    await openWorkspace(page);
    await openBackgroundLibrary(page);
    let item = await uploadActiveBackground(page, filename);

    await page.evaluate((backgroundName) => {
        globalThis.__backgroundRemoved = new Promise((resolve) => {
            const selector = `#bg_menu_content .bg_example[bgfile="${backgroundName}"]`;
            const observer = new MutationObserver(() => {
                if (!document.querySelector(selector)) {
                    observer.disconnect();
                    resolve();
                }
            });
            observer.observe(document.getElementById('bg_menu_content'), {
                childList: true,
                subtree: true,
            });
        });
    }, filename);

    await item.hover();
    await item.locator('[data-action="delete"]').click();
    await page.locator('.popup:visible .popup-button-ok').click();
    await page.evaluate(() => globalThis.__backgroundRemoved);

    await page.close();
    page = await context.newPage();
    const settingsResponse = page.waitForResponse(response =>
        response.url().endsWith('/api/settings/get') && response.request().method() === 'POST',
    );
    await page.goto('/');
    const settingsPayload = await (await settingsResponse).json();
    const settings = typeof settingsPayload.settings === 'string'
        ? JSON.parse(settingsPayload.settings)
        : settingsPayload.settings;

    expect(settings?.background?.name).not.toBe(filename);
    await openBackgroundLibrary(page);
    item = page.locator(`#bg_menu_content .bg_example[bgfile="${filename}"]`);
    await expect(item).toHaveCount(0);
});

test('persists the new identity before a renamed active background appears complete', async ({ page: initialPage, context }) => {
    let page = initialPage;
    const oldFilename = `rename-persistence-old-${Date.now()}.png`;
    const newBaseName = `rename-persistence-new-${Date.now()}`;
    const newFilename = `${newBaseName}.png`;

    await openWorkspace(page);
    await openBackgroundLibrary(page);
    const oldItem = await uploadActiveBackground(page, oldFilename);

    await oldItem.hover();
    await oldItem.locator('[data-action="edit"]').click();
    await page.locator('.popup:visible input.popup-input, .popup:visible textarea.popup-input').last().fill(newBaseName);
    await page.locator('.popup:visible .popup-button-ok').click();
    await expect(page.locator(`#bg_menu_content .bg_example[bgfile="${newFilename}"]`)).toBeVisible();

    await page.close();
    page = await context.newPage();
    await openWorkspace(page);

    expect((await fetchPersistedSettings(page)).background?.name).toBe(newFilename);
    await openBackgroundLibrary(page);
    await expect(page.locator(`#bg_menu_content .bg_example[bgfile="${oldFilename}"]`)).toHaveCount(0);
    await expect(page.locator(`#bg_menu_content .bg_example[bgfile="${newFilename}"]`)).toBeVisible();
});

test('clears the persisted selection when the final system background is deleted', async ({ page }) => {
    const filename = `final-background-${Date.now()}.png`;

    await openWorkspace(page);
    await openBackgroundLibrary(page);
    await uploadActiveBackground(page, filename);

    const otherFilenames = await page.locator(`#bg_menu_content .bg_example:not([bgfile="${filename}"])`).evaluateAll(items =>
        items.map(item => item.getAttribute('bgfile')).filter(Boolean),
    );
    for (const otherFilename of otherFilenames) {
        const item = page.locator(`#bg_menu_content .bg_example[bgfile="${otherFilename}"]`);
        await item.hover();
        await item.locator('[data-action="delete"]').click();
        await page.locator('.popup:visible .popup-button-ok').click();
        await expect(item).toHaveCount(0);
    }

    const finalItem = page.locator(`#bg_menu_content .bg_example[bgfile="${filename}"]`);
    await finalItem.hover();
    await finalItem.locator('[data-action="delete"]').click();
    await page.locator('.popup:visible .popup-button-ok').click();
    await expect(finalItem).toHaveCount(0);

    await expect(page.locator('#bg1')).toHaveCSS('background-image', 'none');
    const settings = await fetchPersistedSettings(page);
    expect(settings.background?.name).toBe('');
    expect(settings.background?.url).toBe('');
});
