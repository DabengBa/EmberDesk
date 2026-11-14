import { expect, test } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';

test.setTimeout(60_000);

async function openWorldInfo(page) {
    await testSetup.awaitST({ page });
    const restoring = await page.evaluate(() => window.innerWidth > 1000
        && window.SillyTavern?.getContext?.()?.accountStorage?.getItem('WINavOpened') === 'true');
    if (restoring) await expect(page.locator('#WorldInfo.openDrawer')).toBeVisible({ timeout: 15_000 });
    else await page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '世界书' }).click();
    await expect(page.locator('#world_info')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#world_editor_select')).toHaveCount(1);
}

async function openPicker(page) {
    const picker = page.locator('#world_info details');
    if (await picker.getAttribute('open') === null) await picker.locator('summary').click();
    return page.locator('#world_info');
}

const editor = page => page.locator('[data-world-info-react-control="world-select"]');
const savedSettings = page => page.waitForResponse(response => response.url().endsWith('/api/settings/save') && response.request().method() === 'POST');
const longName = 'Selector Long ' + '世界书标题'.repeat(12);
const fixtureBooks = ['Selector Created', 'Selector Renamed', 'Selector Imported', '1', longName];

test.describe('World Info global selector', () => {
    test.afterEach(async ({ page }) => {
        if (page.isClosed()) return;
        await page.unroute('**/api/settings/get');
        const remaining = await page.evaluate(async names => {
            if (!window.SillyTavern?.getContext) return [];
            const wi = await import('/scripts/world-info.js');
            return names.filter(name => wi.world_names.includes(name));
        }, fixtureBooks);
        if (remaining.length === 0) return;
        const saved = savedSettings(page);
        await page.evaluate(async names => {
            const wi = await import('/scripts/world-info.js');
            for (const name of names) await wi.deleteWorldInfo(name);
            wi.setWorldInfoGlobalActiveNames([]);
        }, remaining);
        await saved;
    });

    test('keyboard selection, search, quick-open, remove and clear stay independent of editor selection and persist', async ({ page }) => {
        await openWorldInfo(page);
        const saved = savedSettings(page);
        await page.evaluate(async () => (await import('/scripts/world-info.js')).setWorldInfoGlobalActiveNames([]));
        await saved;
        await editor(page).selectOption('Dev World 12');
        const selector = page.locator('#world_info');
        const summary = selector.locator('summary');
        await summary.focus();
        await summary.press('Enter');
        const search = selector.locator('input[type="search"]');
        await expect(search).toBeVisible();
        await search.fill('Dev World 01');
        const first = selector.getByRole('checkbox', { name: 'Dev World 01', exact: true });
        await first.focus();
        await first.press('Space');
        await expect(first).toBeChecked();
        await expect(editor(page)).toHaveValue('Dev World 12');
        await search.fill('Dev World 02');
        const persist = savedSettings(page);
        await selector.getByRole('checkbox', { name: 'Dev World 02', exact: true }).check();
        await persist;
        await expect(selector.locator('.wi-global-chip')).toHaveCount(2);
        await expect(selector.locator('#wiGlobalCount')).toContainText('2');
        await selector.locator('.wi-global-chip-open').filter({ hasText: 'Dev World 01' }).click();
        await expect(editor(page)).toHaveValue('Dev World 01');
        await expect(page.locator('#world_editor_select')).toHaveValue('Dev World 01');
        await expect(selector.locator('.wi-global-chip')).toHaveCount(2);
        await page.reload();
        await openWorldInfo(page);
        await expect(selector.locator('.wi-global-chip')).toHaveCount(2);
        await selector.locator('.wi-global-chip').filter({ hasText: 'Dev World 01' }).locator('.wi-global-chip-remove').click();
        await expect(selector.locator('.wi-global-chip')).toHaveCount(1);
        await openPicker(page);
        await expect(selector.getByRole('checkbox', { name: 'Dev World 01', exact: true })).not.toBeChecked();
        const clearSaved = savedSettings(page);
        await selector.locator('.wi-global-clear').click();
        await clearSaved;
        await expect(selector.locator('.wi-global-chip')).toHaveCount(0);
        await expect(selector.locator('#wiGlobalCount')).toContainText('0');
        await expect(selector.getByRole('checkbox', { name: 'Dev World 02', exact: true })).not.toBeChecked();
        expect(await selector.evaluate(el => el.classList.contains('select2-hidden-accessible'))).toBe(false);
        await expect(page.locator('#world_info + .select2-container, #world_editor_select + .select2-container')).toHaveCount(0);
    });

    test('settings replay and explicit mirror change share the session; failed refresh preserves it and empty refresh is visible', async ({ page }) => {
        await openWorldInfo(page);
        await editor(page).selectOption('Dev World 12');
        const loads = [];
        page.on('request', request => {
            if (request.url().endsWith('/api/worldinfo/get') || request.url().endsWith('/api/settings/save')) loads.push(request.url());
        });
        const replay = await page.evaluate(async () => {
            const wi = await import('/scripts/world-info.js');
            const runtime = (await wi.getWorldInfoReactPanelState()).selectorRuntime;
            const settings = { world_info: ['Dev World 01'] };
            const data = { world_names: [...wi.world_names] };
            wi.setWorldInfoSettings({ ...settings }, data);
            const snapshot = runtime.getSnapshot();
            wi.setWorldInfoSettings({ ...settings }, data);
            return runtime.getSnapshot() === snapshot;
        });
        expect(replay).toBe(true);
        await expect(page.locator('#world_info .wi-global-chip-open')).toHaveText('Dev World 01');
        await expect(page.locator('#world_editor_select')).toHaveValue('Dev World 12');
        expect(loads).toEqual([]);
        await page.locator('#world_editor_select').evaluate(select => {
            select.value = 'Dev World 02';
            select.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await expect(editor(page)).toHaveValue('Dev World 02');
        await expect(page.locator('#world_info .wi-global-chip-open')).toHaveText('Dev World 01');
        await page.route('**/api/settings/get', route => route.fulfill({ status: 503, body: 'unavailable' }));
        expect(await page.evaluate(async () => {
            const wi = await import('/scripts/world-info.js');
            const runtime = (await wi.getWorldInfoReactPanelState()).selectorRuntime;
            const before = runtime.getSnapshot();
            return await wi.updateWorldInfoList() === false && before === runtime.getSnapshot();
        })).toBe(true);
        await expect(page.locator('#world_info .wi-global-chip-open')).toHaveText('Dev World 01');
        await page.unroute('**/api/settings/get');
        await page.route('**/api/settings/get', route => route.fulfill({ json: { world_names: [] } }));
        await page.evaluate(async () => (await import('/scripts/world-info.js')).updateWorldInfoList());
        const selector = await openPicker(page);
        await expect(selector.getByRole('checkbox')).toHaveCount(0);
        await expect(selector.locator('.wi-global-empty')).toBeVisible();
        await expect(selector.locator('#wiGlobalCount')).toContainText('0');
        await expect(page.locator('#world_editor_select')).toHaveValue('');
    });

    for (const failure of ['http', 'network']) {
    test(`create, rename, delete and import stay synchronized despite a ${failure} list refresh failure`, async ({ page }) => {
        await openWorldInfo(page);
        const reset = savedSettings(page);
        await page.evaluate(async () => (await import('/scripts/world-info.js')).setWorldInfoGlobalActiveNames([]));
        await reset;
        await page.locator('[data-world-info-react-action="new-world"]').click();
        await page.locator('dialog[data-local-dialog] [data-local-focus="name"]').fill('Selector Created');
        // Native keyboard submission keeps this test within the World Info
        // workflow, independent of the shell's outside-pointer drawer policy.
        await page.locator('dialog[data-local-dialog] [data-local-focus="name"]').press('Enter');
        await expect(editor(page)).toHaveValue('Selector Created');
        const selector = await openPicker(page);
        await selector.getByRole('checkbox', { name: 'Selector Created', exact: true }).check();
        await page.route('**/api/settings/get', route => failure === 'http'
            ? route.fulfill({ status: 503, body: 'unavailable' })
            : route.abort('failed'));
        await page.locator('[data-world-info-react-menu-trigger="book-actions"]').click();
        await page.locator('[data-world-info-react-action="rename"]').click();
        await page.locator('dialog[data-local-dialog] [data-local-focus="name"]').fill('Selector Renamed');
        await page.locator('dialog[data-local-dialog] [data-local-focus="name"]').press('Enter');
        await expect(editor(page)).toHaveValue('Selector Renamed');
        await expect(page.locator('#world_editor_select')).toHaveValue('Selector Renamed');
        await expect(selector.locator('.wi-global-chip-open')).toHaveText('Selector Renamed');
        await expect(page.locator('#world_editor_select option[value="Selector Created"]')).toHaveCount(0);
        await page.unroute('**/api/settings/get');
        await page.evaluate(async () => (await import('/scripts/world-info.js')).updateWorldInfoList());
        await expect(selector.locator('.wi-global-chip-open')).toHaveText('Selector Renamed');
        await expect(page.locator('#world_editor_select')).toHaveValue('Selector Renamed');
        await page.locator('[data-world-info-react-action="delete"]').click();
        await page.locator('dialog[data-local-dialog] [data-local-focus="delete"]').press('Enter');
        await expect(selector.locator('.wi-global-chip')).toHaveCount(0);
        await expect(page.locator('#world_editor_select option[value="Selector Renamed"]')).toHaveCount(0);
        const chooser = page.waitForEvent('filechooser');
        await page.locator('[data-world-info-react-action="import"]').click();
        await (await chooser).setFiles({ name: 'Selector Imported.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ entries: {} })) });
        await expect(page.locator('#world_editor_select option[value="Selector Imported"]')).toHaveCount(1);
        await openPicker(page);
        await selector.locator('input[type="search"]').fill('Selector Imported');
        await expect(selector.getByRole('checkbox', { name: 'Selector Imported', exact: true })).toBeVisible();
    });
    }

    test('numeric names, long names and no search matches work in a narrow viewport', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await openWorldInfo(page);
        await page.evaluate(async name => {
            const wi = await import('/scripts/world-info.js');
            for (const book of ['1', name]) {
                await wi.saveWorldInfo(book, { entries: {} }, true);
            }
            await wi.updateWorldInfoList();
            wi.setWorldInfoGlobalActiveNames(['1', name]);
        }, longName);
        const selector = page.locator('#world_info');
        await expect(selector.locator('.wi-global-chip')).toHaveCount(2);
        await selector.locator('.wi-global-chip-open').filter({ hasText: /^1$/ }).click();
        await expect(editor(page)).toHaveValue('1');
        await expect(page.locator('#world_editor_select')).toHaveValue('1');
        await expect(selector.locator('.wi-global-chip')).toHaveCount(2);
        const longChip = selector.locator('.wi-global-chip-open').filter({ hasText: longName });
        expect(await longChip.evaluate(el => el.getBoundingClientRect().height < 2 * parseFloat(getComputedStyle(el).fontSize))).toBe(true);
        await openPicker(page);
        await selector.locator('input[type="search"]').fill('no-world-book-matches-this-query');
        await expect(selector.locator('.wi-global-empty')).toBeVisible();
        await selector.locator('input[type="search"]').fill('Selector Long');
        await expect(selector.getByRole('checkbox', { name: longName, exact: true })).toBeChecked();
        expect(await selector.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
        await page.screenshot({ path: '.tmp/world-info-global-selector-mobile.png', fullPage: true });
        await selector.locator('.wi-global-chip').filter({ hasText: longName }).locator('.wi-global-chip-remove').click();
        await expect(selector.getByRole('checkbox', { name: longName, exact: true })).not.toBeChecked();
        await expect(selector.locator('#wiGlobalCount')).toContainText('1');
    });
});
