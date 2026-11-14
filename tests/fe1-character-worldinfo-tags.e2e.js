import { isolatedCharacterLibraryTest, expect } from './helpers/isolated-character-library-test.js';
import { testSetup } from './frontend/frontent-test-utils.js';

const test = isolatedCharacterLibraryTest({ lazy: false });
const authoring = '[data-react-authoring-owner="characterAuthoring"]';
const cardName = n => `Dev Character ${String(n).padStart(3, '0')}`;
const avatar = n => `dev-character-${String(n).padStart(3, '0')}.png`;

test.beforeEach(async ({ page }) => {
    await page.route('**/api/settings/get', async route => {
        const response = await route.fetch();
        const payload = await response.json();
        const settings = JSON.parse(payload.settings);
        settings.oai_settings.chat_memory_enabled = false;
        await route.fulfill({ response, json: { ...payload, settings: JSON.stringify(settings) } });
    });
    await page.route('**/api/characters/events', route => route.fulfill({ status: 204 }));
    await testSetup.awaitST({ page });
    await page.evaluate(async () => {
        const worlds = await import('/scripts/world-info.js');
        for (const name of ['012', 'FE1 Archive', 'FE1 Atlas']) await worlds.saveWorldInfo(name, { entries: {} }, true);
        await worlds.updateWorldInfoList();
    });
});

async function selectCharacter(page, n) {
    await page.evaluate(async name => {
        const context = window.SillyTavern.getContext();
        const id = context.characters.findIndex(character => character.name === name);
        if (id < 0) throw new Error(`Missing character: ${name}`);
        await context.selectCharacterById(String(id));
    }, cardName(n));
    await expect(page.locator(`${authoring} [data-react-authoring-field="name"] input`)).toHaveValue(cardName(n));
    await expect.poll(() => page.evaluate(() => window.SillyTavern.getContext().chat.length)).toBeGreaterThan(0);
}

async function readCard(page, n) {
    return page.evaluate(async avatarUrl => {
        const { getRequestHeaders } = await import('/scripts/request-context.js');
        const response = await fetch('/api/characters/get', {
            method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ avatar_url: avatarUrl }),
        });
        if (!response.ok) throw new Error(`Character read: ${response.status}`);
        return response.json();
    }, avatar(n));
}

async function openWorlds(page) {
    await page.locator(authoring).getByRole('button', { name: /^(World Info|世界书)$/ }).click();
    const dialog = page.locator('dialog[data-react-popup]');
    await expect(dialog.getByRole('searchbox')).toBeVisible();
    await expect(dialog.locator('.select2-container')).toHaveCount(0);
    return dialog;
}

async function expectCheckboxRowAligned(dialog, name) {
    await expect.poll(() => dialog.getByRole('checkbox', { name, exact: true }).evaluate(input => {
        const checkbox = input.getBoundingClientRect();
        const label = input.closest('label').getBoundingClientRect();
        return Math.abs(checkbox.y + checkbox.height / 2 - label.y - label.height / 2);
    })).toBeLessThanOrEqual(2);
}

test('character lorebooks support named primary, searchable auxiliaries, clear and mobile focus', async ({ page }, testInfo) => {
    await selectCharacter(page, 1);
    const opener = page.locator(authoring).getByRole('button', { name: /^(World Info|世界书)$/ });
    let dialog = await openWorlds(page);
    await expectCheckboxRowAligned(dialog, 'FE1 Atlas');
    // A normal refresh replaces the cached card without changing the editor session.
    expect(await page.evaluate(async avatarUrl => {
        const { getOneCharacter } = await import('/script.js');
        return getOneCharacter(avatarUrl);
    }, avatar(1))).toBe(true);
    await dialog.getByRole('searchbox').fill('012');
    await dialog.locator('select').selectOption('012');
    await expect(dialog.getByRole('status')).toHaveCount(0);
    await expect.poll(async () => (await readCard(page, 1)).data?.extensions?.world).toBe('012');
    await dialog.getByRole('searchbox').fill('Archive');
    await expect(dialog.getByRole('checkbox', { name: 'FE1 Atlas', exact: true })).toHaveCount(0);
    await dialog.getByRole('checkbox', { name: 'FE1 Archive', exact: true }).check();
    await expect(dialog.getByRole('checkbox', { name: 'FE1 Archive', exact: true })).toBeChecked();
    await expect.poll(async () => (await dialog.getByRole('button', { name: 'Clear additional Lorebooks' }).boundingBox()).height).toBeLessThanOrEqual(50);
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[data-react-popup]')).toHaveCount(0);
    await expect(opener).toBeFocused();

    dialog = await openWorlds(page);
    await expect(dialog.locator('select')).toHaveValue('012');
    await expect(dialog.getByRole('checkbox', { name: 'FE1 Archive', exact: true })).toBeChecked();
    await dialog.getByRole('button', { name: 'Clear additional Lorebooks' }).click();
    await expect(dialog.getByRole('checkbox', { name: 'FE1 Archive', exact: true })).not.toBeChecked();
    await dialog.locator('select').selectOption('');
    await expect.poll(async () => (await readCard(page, 1)).data?.extensions?.world ?? '').toBe('');
    await page.setViewportSize({ width: 390, height: 844 });
    await dialog.getByRole('searchbox').fill('Atlas');
    await expect(dialog.getByRole('checkbox', { name: 'FE1 Atlas', exact: true })).toBeVisible();
    await expectCheckboxRowAligned(dialog, 'FE1 Atlas');
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    const mobileScreenshot = testInfo.outputPath('character-lorebooks-mobile.png');
    await page.screenshot({ path: mobileScreenshot });
    await testInfo.attach('character-lorebooks-mobile', { path: mobileScreenshot, contentType: 'image/png' });
    // A focused native search input consumes the first Escape to clear itself.
    await page.keyboard.press('Escape');
    await expect(dialog.getByRole('searchbox')).toHaveValue('');
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[data-react-popup]')).toHaveCount(0);
});

test('a primary save completed after selecting B cannot mutate B or reopen A', async ({ page }) => {
    await selectCharacter(page, 2);
    const dialog = await openWorlds(page);
    let release;
    let observed = false;
    const gate = new Promise(resolve => { release = resolve; });
    const handler = async route => {
        const response = await route.fetch();
        observed = true;
        await gate;
        await route.fulfill({ response });
    };
    await page.route('**/api/characters/edit*', handler);
    try {
        await dialog.locator('select').selectOption('FE1 Atlas');
        await expect.poll(() => observed).toBe(true);
        await selectCharacter(page, 3);
        const before = await page.evaluate(() => window.SillyTavern.getContext().chat.map(message => message.mes));
        release();
        await expect(dialog.getByRole('alert')).toContainText('Character changed');
        await dialog.getByRole('checkbox', { name: 'FE1 Archive', exact: true }).click();
        await expect(dialog.getByRole('alert')).toContainText('Character changed');
        await expect(dialog.getByRole('checkbox', { name: 'FE1 Archive', exact: true })).not.toBeChecked();
        expect((await readCard(page, 3)).data?.extensions?.world ?? '').not.toBe('FE1 Atlas');
        expect(await page.evaluate(() => window.SillyTavern.getContext().chat.map(message => message.mes))).toEqual(before);
        await page.keyboard.press('Escape');
        await expect(page.locator('dialog[data-react-popup]')).toHaveCount(0);
        await expect(page.locator(`${authoring} [data-react-authoring-field="name"] input`)).toHaveValue(cardName(3));
    } finally { release(); await page.unroute('**/api/characters/edit*', handler); }
});

test('an old create dialog cannot write into a reentered create draft', async ({ page }) => {
    await selectCharacter(page, 4);
    await page.evaluate(async () => {
        const shell = (await import('/scripts/character-lifecycle-shell-context.js')).requireCharacterLifecycleShellContext();
        shell.select_rm_create();
    });
    // Use the same public popup command as the authoring action; the create
    // draft has no avatar and must be guarded by its existing session identity.
    await page.evaluate(() => { window.fe1CreatePopup = import('/scripts/character-lifecycle-service.js').then(module => module.openCharacterWorldPopup()); });
    const dialog = page.locator('dialog[data-react-popup]');
    await expect(dialog.getByRole('searchbox')).toBeVisible();
    await selectCharacter(page, 5);
    await page.evaluate(async () => {
        const shell = (await import('/scripts/character-lifecycle-shell-context.js')).requireCharacterLifecycleShellContext();
        shell.select_rm_create();
    });
    const before = await page.evaluate(async () => {
        const { state } = (await import('/scripts/character-lifecycle-shell-context.js')).requireCharacterLifecycleShellContext();
        return { world: state.create_save.world, books: state.create_save.extra_books ?? [] };
    });
    await dialog.getByRole('checkbox', { name: 'FE1 Archive', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('Character changed');
    await expect(dialog.getByRole('checkbox', { name: 'FE1 Archive', exact: true })).not.toBeChecked();
    expect(await page.evaluate(async () => {
        const { state } = (await import('/scripts/character-lifecycle-shell-context.js')).requireCharacterLifecycleShellContext();
        return { world: state.create_save.world, books: state.create_save.extra_books ?? [] };
    })).toEqual(before);
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.fe1CreatePopup);
});
