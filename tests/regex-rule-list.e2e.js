import { expect, test } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';

// Serial: the suite shares the isolated user settings store (feature_settings.regex)
// between tests through the real save path.
test.describe.configure({ mode: 'serial' });

async function openRegex(page) {
    await testSetup.awaitST({ page });
    const wiRestorePending = await page.evaluate(() => (
        window.innerWidth > 1000
        && window.SillyTavern?.getContext?.()?.accountStorage?.getItem('WINavOpened') === 'true'
    ));
    if (wiRestorePending) {
        await expect(page.locator('#WorldInfo.openDrawer')).toBeVisible({ timeout: 15_000 });
    }
    await page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '正则' }).click();
    await expect(page.locator('#RegexPanel')).toBeVisible();
    if (wiRestorePending) {
        await expect(page.locator('#WorldInfo.openDrawer')).toHaveCount(0);
    }
    await expect(page.locator('#open_regex_editor')).toBeVisible({ timeout: 15_000 });
}

async function importGlobal(page, rules) {
    await importRules(page, rules, 'global');
}

async function importRules(page, rules, target) {
    await page.locator('#import_regex_file').setInputFiles({
        name: 'react-list-fixture.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(rules)),
    });
    await expect(page.locator(`#regex_import_target_${target}`)).toBeVisible();
    await page.locator(`#regex_import_target_${target}`).check();
    await page.locator('dialog[open] .popup-button-ok').click();
}

async function reopenRegex(page) {
    await testSetup.awaitST({ page });
    if (!await page.locator('#RegexPanel').isVisible().catch(() => false)) {
        await openRegex(page);
    }
    await expect(page.locator('#RegexPanel')).toBeVisible();
}

function rule(scriptName, extra = {}) {
    return { scriptName, findRegex: '/test/g', replaceString: '', placement: [1], trimStrings: [], disabled: false, ...extra };
}

const globalRows = page => page.locator('#saved_regex_scripts .regex-react-row');
const row = (page, name) => globalRows(page).filter({ hasText: name });
// Row action buttons carry translated titles in the real app; icon classes are
// the stable contract (toggle-on = enabled rule, toggle-off = disabled rule).
const action = (target, icon) => target.locator(`button:has(.fa-${icon})`);

test.describe('regex rule list', () => {
    test.beforeEach(async ({ page }) => {
        await openRegex(page);
        await importGlobal(page, [
            rule('React list alpha'),
            rule('React list beta', { disabled: true }),
        ]);
        await expect(globalRows(page)).toHaveCount(2);
    });

    test.afterEach(async ({ page }) => {
        // Remove the fixture rules through the React-owned bulk delete so the
        // shared settings store stays clean for the next test.
        await page.locator('#regex_bulk_edit').check();
        await page.locator('#bulk_select_all_toggle').click();
        await page.locator('#bulk_delete_regex').click();
        const dialog = page.locator('dialog[open]');
        await dialog.locator('.popup-button-ok').click();
        await expect(globalRows(page)).toHaveCount(0);
    });

    test('row toggle authorizes and persists through the real settings save', async ({ page }) => {
        const requests = [];
        await page.route('**/api/settings/save', route => {
            requests.push(route.request().postDataJSON());
            return route.continue();
        });


        await action(row(page, 'React list alpha'), 'toggle-on').click();
        await expect.poll(() => requests.length).toBeGreaterThan(0);
        await expect(page.locator('.regex-list-status-saved')).toContainText('(global)');
        const names = await globalRows(page).locator('.regex_script_name').allTextContents();
        expect(names).toEqual(['React list alpha', 'React list beta']);
        await expect(row(page, 'React list alpha')).toHaveClass(/regex-react-disabled/);
        const stored = await page.evaluate(() => window.SillyTavern.getContext().featureSettings.regex.map(script => [script.scriptName, script.disabled]));
        expect(stored).toContainEqual(['React list alpha', true]);
        // The disabled flag is persisted through the real settings save — it
        // survives a full reload, not just the in-memory store.
        await page.reload();
        await reopenRegex(page);
        await expect(row(page, 'React list alpha')).toHaveClass(/regex-react-disabled/);
    });

    test('debugger saves global order without a selected character', async ({ page }) => {
        await page.locator('#open_regex_debugger').click();
        await expect(page.locator('#regex_debugger_popup')).toBeVisible();
        await page.locator('#regex_debugger_save_order').click();
        await expect(page.locator('#regex_debugger_popup').getByText(/Order saved|顺序已保存/)).toBeVisible();
        await page.keyboard.press('Escape');
    });

    test('row toggle reports rejected saves against the bound target', async ({ page }) => {
        let reject = true;
        await page.route('**/api/settings/save', route => (
            reject ? route.fulfill({ status: 500, body: 'forced failure' }) : route.continue()
        ));
        await action(row(page, 'React list beta'), 'toggle-off').click();
        // The failure line carries the bound target label ("<scope> (global)");
        // the scope word is localized, the group key is not.
        await expect(page.locator('.regex-list-status-failure')).toContainText('(global)');
        // Strict persistence rolls back the failed in-memory change. The row
        // remains disabled, so the same action is available for a retry.
        await expect(row(page, 'React list beta')).toHaveClass(/regex-react-disabled/);
        reject = false;
        await action(row(page, 'React list beta'), 'toggle-off').click();
        await expect(page.locator('.regex-list-status-saved')).toContainText('(global)');
        await expect(page.locator('.regex-list-status-failure')).toHaveCount(0);
        await expect(row(page, 'React list beta')).not.toHaveClass(/regex-react-disabled/);
    });

    test('keyboard reorder saves the new live order', async ({ page }) => {
        await action(row(page, 'React list beta'), 'arrow-up').click();
        await expect(globalRows(page).first().locator('.regex_script_name')).toHaveText('React list beta');
        await expect.poll(async () => page.evaluate(() => (
            window.SillyTavern.getContext().featureSettings.regex.map(script => script.scriptName).filter(name => name.startsWith('React list'))
        ))).toEqual(['React list beta', 'React list alpha']);
        await page.reload();
        await reopenRegex(page);
        await expect(globalRows(page).first().locator('.regex_script_name')).toHaveText('React list beta');
    });

    test('scoped row toggle authorizes the bound character and survives reload', async ({ page }) => {
        const merges = [];
        await page.route('**/api/characters/merge-attributes', route => {
            merges.push(route.request().postDataJSON());
            return route.continue();
        });
        // The scoped target is only bound while a character is selected.
        const memoryEnabled = await page.evaluate(async () => {
            const context = window.SillyTavern.getContext();
            // The seeded chat otherwise starts unrelated background summary
            // writes without an API key, racing this test's chat reload.
            const previous = context.chatCompletionSettings.chat_memory_enabled;
            context.chatCompletionSettings.chat_memory_enabled = false;
            await context.selectCharacterById(context.characters.findIndex(character => character.name === 'Dev Character 001'));
            return previous;
        });
        try {
            await importRules(page, [rule('React list scoped', { disabled: true })], 'scoped');
            const scopedRows = page.locator('#saved_scoped_scripts .regex-react-row');
            const scopedRow = scopedRows.filter({ hasText: 'React list scoped' });
            await expect(scopedRow).toHaveCount(1);
            // A library refresh replaces the selected character object even when
            // its identity and scoped rules are unchanged. Exercise that real
            // publication boundary before invoking the visible row action.
            await page.evaluate(async () => {
                const context = window.SillyTavern.getContext();
                const next = structuredClone(context.characters);
                next[context.characterId].description += ' [refresh fixture]';
                const { publishCharacterLibrarySnapshot } = await import('/script.js');
                await publishCharacterLibrarySnapshot(next);
            });
            await action(scopedRow, 'toggle-off').click();
            // Enabling a scoped rule must write the character-bound list and then
            // authorize that character — both through real persistence calls.
            await expect(page.locator('.regex-list-status-saved')).toContainText('character:');
            await expect.poll(() => merges.length).toBeGreaterThan(0);
            await page.reload();
            // Character selection is runtime state — re-bind the same identity and
            // verify the enabled flag was persisted to that character's data.
            await testSetup.awaitST({ page });
            await page.evaluate(async () => {
                const context = window.SillyTavern.getContext();
                await context.selectCharacterById(context.characters.findIndex(character => character.name === 'Dev Character 001'));
            });
            await reopenRegex(page);
            await expect(page.locator('#saved_scoped_scripts .regex-react-row').filter({ hasText: 'React list scoped' })).not.toHaveClass(/regex-react-disabled/);
        } finally {
            // Scoped authorization saves settings, so restore the original
            // value even when an assertion fails in this serial suite.
            await page.evaluate(async previous => {
                window.SillyTavern.getContext().chatCompletionSettings.chat_memory_enabled = previous;
                const { saveSettingsStrict } = await import('/scripts/preset-manager.js');
                await saveSettingsStrict();
            }, memoryEnabled);
        }
    });

    test('bulk selection owns enable and delete without authorization', async ({ page }) => {
        await page.locator('#regex_bulk_edit').check();
        await row(page, 'React list beta').locator('.regex-react-select').check();
        await page.locator('#bulk_enable_regex').click();
        await expect(row(page, 'React list beta')).not.toHaveClass(/regex-react-disabled/);
        const stored = await page.evaluate(() => window.SillyTavern.getContext().featureSettings.regex.map(script => [script.scriptName, script.disabled]));
        expect(stored).toContainEqual(['React list beta', false]);
    });
});
