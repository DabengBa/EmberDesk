import { test, expect } from '@playwright/test';

const userHandle = process.env.PLAYWRIGHT_USER ?? 'playwright-e2e';
const userPassword = process.env.PLAYWRIGHT_PASSWORD ?? 'playwright';
const pngPixel = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
);

test.describe.configure({ mode: 'serial' });

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
        const panelButton = page.locator('.react-workspace-shell-nav-button').filter({ hasText: 'Backgrounds' });
        await panelButton.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
        if (await panelButton.isVisible()) {
            await panelButton.click({ timeout: 10_000 });
            await expect(panelButton).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
        } else {
            await page.locator('#backgrounds-drawer-toggle').click({ timeout: 10_000 });
        }
    }
    await expect(page.locator('#Backgrounds.openDrawer')).toBeVisible();
    const reactHost = page.locator('#emberdesk-react-background-library-panel-host');
    const legacyItem = page.locator('#bg_menu_content .bg_example').first();
    // React is sole visible owner; legacy gallery may remain as hidden compatibility DOM.
    if (await reactHost.count()) {
        await expect(reactHost).toBeVisible();
        await expect(page.locator('[data-background-library-react-gallery="global"]')).toBeVisible();
    } else {
        await expect(legacyItem).toBeVisible();
    }
}

function backgroundItem(page, filename) {
    const reactItem = page.locator(`[data-background-library-react-item="${filename}"]`);
    const legacyItem = page.locator(`#bg_menu_content .bg_example[bgfile="${filename}"]`);
    return {
        async expectVisible() {
            if (await reactItem.count()) {
                await expect(reactItem).toBeVisible();
                return;
            }
            await expect(legacyItem).toBeVisible();
        },
        async expectMissing() {
            if (await reactItem.count()) {
                await expect(reactItem).toHaveCount(0);
                return;
            }
            await expect(legacyItem).toHaveCount(0);
        },
        async select() {
            if (await reactItem.count()) {
                await reactItem.locator('[data-background-library-react-item-select]').click();
                return;
            }
            await legacyItem.click();
        },
        async rename(nextBaseName) {
            if (await reactItem.count()) {
                page.once('dialog', async dialog => {
                    await dialog.accept(nextBaseName);
                });
                await reactItem.locator('[data-background-library-react-item-action="rename"]').click();
                return;
            }
            await legacyItem.hover();
            await legacyItem.locator('[data-action="edit"]').click();
            await page.locator('.popup:visible input.popup-input, .popup:visible textarea.popup-input').last().fill(nextBaseName);
            await page.locator('.popup:visible .popup-button-ok').click();
        },
        async delete() {
            if (await reactItem.count()) {
                page.once('dialog', async dialog => {
                    await dialog.accept();
                });
                await reactItem.locator('[data-background-library-react-item-action="delete"]').click();
                return;
            }
            await legacyItem.hover();
            await legacyItem.locator('[data-action="delete"]').click();
            await page.locator('.popup:visible .popup-button-ok').click();
        },
        async expectSelected() {
            if (await reactItem.count()) {
                await expect(reactItem.locator('.workspace-panel-item-status')).toContainText(/Selected|Locked/);
                return;
            }
            await expect(legacyItem).toHaveClass(/selected-background/);
        },
        locator: reactItem.or(legacyItem),
    };
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
    const item = backgroundItem(page, filename);
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
    await item.expectVisible();
    await item.expectSelected();
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

    await item.delete();
    await item.expectMissing();

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
    await backgroundItem(page, filename).expectMissing();
});

test('persists the new identity before a renamed active background appears complete', async ({ page: initialPage, context }) => {
    let page = initialPage;
    const oldFilename = `rename-persistence-old-${Date.now()}.png`;
    const newBaseName = `rename-persistence-new-${Date.now()}`;
    const newFilename = `${newBaseName}.png`;

    await openWorkspace(page);
    await openBackgroundLibrary(page);
    const oldItem = await uploadActiveBackground(page, oldFilename);

    await oldItem.rename(newBaseName);
    await backgroundItem(page, newFilename).expectVisible();

    await page.close();
    page = await context.newPage();
    await openWorkspace(page);

    expect((await fetchPersistedSettings(page)).background?.name).toBe(newFilename);
    await openBackgroundLibrary(page);
    await backgroundItem(page, oldFilename).expectMissing();
    const renamedItem = backgroundItem(page, newFilename);
    await renamedItem.expectVisible();

    const transparentItem = backgroundItem(page, '__transparent.png');
    await transparentItem.select();
    await expect.poll(async () => (await fetchPersistedSettings(page)).background?.name).toBe('__transparent.png');

    await renamedItem.delete();
    await renamedItem.expectMissing();
});

test('clears the persisted selection when no replacement background is visible', async ({ page }) => {
    const filename = `final-background-${Date.now()}.png`;

    await openWorkspace(page);
    await openBackgroundLibrary(page);
    await uploadActiveBackground(page, filename);

    // Force the active background to be the only remaining system catalog entry.
    await page.evaluate(async (backgroundName) => {
        const headers = window.SillyTavern.getContext().getRequestHeaders();
        const all = await (await fetch('/api/backgrounds/all', {
            method: 'POST',
            headers,
            body: JSON.stringify({}),
        })).json();
        const others = (all.images || [])
            .map(item => item.filename)
            .filter(name => name && name !== backgroundName);
        for (const other of others) {
            await fetch('/api/backgrounds/delete', {
                method: 'POST',
                headers,
                body: JSON.stringify({ bg: other }),
            });
        }
    }, filename);
    await page.locator('[data-background-library-react-action="refresh"]').click();
    await expect.poll(async () => {
        return page.locator('[data-background-library-react-gallery="global"] [data-background-library-react-item]').count();
    }).toBe(1);

    const finalItem = backgroundItem(page, filename);
    await finalItem.expectVisible();
    await finalItem.delete();
    await finalItem.expectMissing();

    await expect(page.locator('#bg1')).toHaveCSS('background-image', 'none');
    const settings = await fetchPersistedSettings(page);
    expect(settings.background?.name).toBe('');
    expect(settings.background?.url).toBe('');
});
