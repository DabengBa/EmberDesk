import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { testSetup } from './frontend/frontent-test-utils.js';

test.describe.configure({ mode: 'serial' });
test.setTimeout(90_000);

async function post(page, path, body = {}) {
    return page.evaluate(async ({ path, body }) => {
        const { token } = await fetch('/csrf-token').then(response => response.json());
        const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token }, body: JSON.stringify(body) });
        return { ok: response.ok, status: response.status, data: await response.json().catch(() => null) };
    }, { path, body });
}

async function savedPreset(page, name) {
    const { data } = await post(page, '/api/settings/get');
    const index = data.openai_setting_names.indexOf(name);
    return index === -1 ? null : JSON.parse(data.openai_settings[index]);
}

async function openPrompt(page) {
    if (!await page.locator('#settings_preset_openai').isVisible()) {
        await page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '提示词' }).click();
    }
    await expect(page.locator('#settings_preset_openai')).toBeVisible();
}

async function openSettings(page) {
    await page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '设置' }).click();
    await expect(page.locator('#SettingsPanel')).toBeVisible();
}

async function confirmName(page, name) {
    const dialog = page.locator('dialog[open][data-local-dialog]');
    await dialog.locator('[data-local-focus="name"]').fill(name);
    await dialog.locator('[data-local-focus="save"]').click();
    await expect(dialog).toHaveCount(0);
}

async function presetMenu(page, selector) {
    await page.locator('.preset-menu-trigger').click();
    await page.locator(selector).click();
}

for (const entry of ['page', 'drawer']) {
    test(`${entry}: connection and test use the draft, expose failure and recover without saving`, async ({ page }) => {
        // Intercept every provider probe, including startup, so no real provider is contacted.
        let fail = false;
        const requests = [];
        let release;
        let hold = false;
        await page.route('**/api/backends/chat-completions/status', async route => {
            requests.push(route.request().postDataJSON());
            if (hold) await new Promise(resolve => { release = resolve; });
            await route.fulfill({ status: fail ? 503 : 200, json: fail ? { error: true } : { data: [{ id: 'discovered-not-selected' }] } });
        });
        await page.route('**/api/backends/chat-completions/generate', route => {
            requests.push(route.request().postDataJSON());
            return route.fulfill({ json: fail ? { error: true } : { choices: [{ message: { content: '' } }] } });
        });
        await testSetup.awaitST({ page });
        const initial = (await post(page, '/api/settings/get')).data;
        const initialSettings = JSON.parse(initial.settings);
        const committed = await page.evaluate(() => ({
            url: window.SillyTavern.getContext().chatCompletionSettings.custom_url,
            model: window.SillyTavern.getContext().chatCompletionSettings.openai_model,
        }));
        if (entry === 'page') await page.goto('/settings');
        else await openSettings(page);
        const surface = page.locator(`[data-settings-surface="${entry}"]`);
        await page.locator('#settings-providers-customUrl').fill('https://draft.invalid/custom-root');
        await page.locator('#settings-providers-openaiModel').fill('draft-model');
        const connect = page.locator('#provider-connect-button');
        const testButton = page.locator('#provider-test-button');
        hold = true;
        await connect.click();
        await expect.poll(() => Boolean(release)).toBe(true);
        await expect(connect).toBeDisabled();
        await expect(testButton).toBeDisabled();
        hold = false; release();
        await expect(surface.locator('.settings-status--success')).toBeVisible();
        expect(requests.at(-1)).toMatchObject({ custom_url: 'https://draft.invalid/custom-root' });
        await expect(page.locator('#settings-providers-openaiModel')).toHaveValue('draft-model');

        fail = true;
        await testButton.click();
        await expect(surface.getByRole('alert')).toBeVisible();
        await expect(surface.locator('.settings-status--success')).toHaveCount(0);
        expect(requests.at(-1)).toMatchObject({ model: 'draft-model', custom_url: 'https://draft.invalid/custom-root' });
        await expect(testButton).toBeEnabled();
        fail = false;
        await testButton.click();
        await expect(surface.locator('.settings-status--success')).toBeVisible();
        await expect(surface.getByRole('alert')).toHaveCount(0);
        const after = JSON.parse((await post(page, '/api/settings/get')).data.settings);
        expect(after.oai_settings.custom_url).toBe(initialSettings.oai_settings.custom_url);
        expect(after.oai_settings.openai_model).toBe(initialSettings.oai_settings.openai_model);
        if (entry === 'drawer') {
            expect(await page.evaluate(() => ({
                url: window.SillyTavern.getContext().chatCompletionSettings.custom_url,
                model: window.SillyTavern.getContext().chatCompletionSettings.openai_model,
            }))).toEqual(committed);
        }
    });
}

for (const overlapping of [false, true]) {
    test(`settings 409 ${overlapping ? 'keeps an overlapping draft for explicit reload' : 'rebases only local edits onto the remote preset'}`, async ({ page }) => {
        const draftModel = overlapping ? 'f4-overlapping-local-model-edit' : 'f4-local-model-edit';
        await page.route('**/api/backends/chat-completions/status', route => route.fulfill({ json: { data: [] } }));
        await testSetup.awaitST({ page });
        // Let startup's provider normalization finish its debounced write before
        // introducing the deliberate concurrent writer below.
        await expect.poll(async () => JSON.parse((await post(page, '/api/settings/get')).data.settings).main_api).toBe('openai');
        await openSettings(page);
        const modelField = page.locator('#settings-providers-openaiModel');
        await expect(modelField).toBeVisible();
        await modelField.fill(draftModel);
        const requests = [];
        const statuses = [];
        let concurrentSettings;
        page.on('response', response => {
            if (response.url().endsWith('/api/settings/save')) statuses.push(response.status());
        });
        await page.route('**/api/settings/save', async route => {
            requests.push(route.request().postDataJSON());
            if (requests.length === 1) {
                // Use real SQLite revisions, not a mocked 409. APIRequestContext
                // bypasses page routing, so these are the concurrent writer.
                const latestResponse = await route.fetch({ url: new URL('/api/settings/get', route.request().url()).href, postData: '{}' });
                const latest = await latestResponse.json();
                concurrentSettings = JSON.parse(latest.settings);
                concurrentSettings.oai_settings.preset_settings_openai = 'F4 concurrent preset';
                concurrentSettings.oai_settings.temp_openai = 1.77;
                concurrentSettings.oai_settings.f4_remote_unknown = { retained: true };
                if (overlapping) concurrentSettings.oai_settings.openai_model = 'f4-remote-model-edit';
                const concurrent = await route.fetch({ postData: JSON.stringify({ ...concurrentSettings, settings_revision: latest.settings_revision }) });
                expect(concurrent.ok()).toBe(true);
            }
            await route.continue();
        });
        const saveButton = page.locator('#SettingsPanel button[type="submit"]');
        await saveButton.click();
        if (overlapping) {
            await expect(page.locator('#SettingsPanel').getByRole('alert')).toContainText('当前草稿基于过期版本');
            await expect(page.getByRole('button', { name: '重新加载当前设置', exact: true })).toBeVisible();
            await expect(modelField).toHaveValue(draftModel);
            await expect(saveButton).toBeDisabled();
            await expect(page.locator('#SettingsPanel .settings-status--success')).toHaveCount(0);
            expect(requests).toHaveLength(1);
        } else {
            await expect(page.locator('#SettingsPanel .settings-status--success')).toBeVisible();
            expect(requests).toHaveLength(2);
            expect(requests[1].oai_settings).toMatchObject({ preset_settings_openai: 'F4 concurrent preset', temp_openai: 1.77, f4_remote_unknown: { retained: true }, openai_model: draftModel });
        }
        expect(statuses).toContain(409);
        const persisted = JSON.parse((await post(page, '/api/settings/get')).data.settings);
        expect(persisted.oai_settings).toMatchObject({ preset_settings_openai: 'F4 concurrent preset', temp_openai: 1.77, f4_remote_unknown: { retained: true }, openai_model: overlapping ? 'f4-remote-model-edit' : draftModel });
        if (!overlapping) {
            expect(await page.evaluate(() => window.SillyTavern.getContext().chatCompletionSettings.temp_openai)).toBe(1.77);
        }
    });
}
test('preset sensitive import and export preserve the selected choices', async ({ page }) => {
    await page.route('**/api/backends/chat-completions/status', route => route.fulfill({ json: { data: [] } }));
    await testSetup.awaitST({ page });
    await openPrompt(page);
    const name = 'F6 Sensitive Import';
    await post(page, '/api/presets/delete', { apiId: 'openai', name });
    const fixture = await page.evaluate(() => {
        const settings = window.SillyTavern.getContext().chatCompletionSettings;
        return { temperature: 0.63, custom_url: 'https://example.invalid/f6', prompts: settings.prompts, prompt_order: settings.prompt_order };
    });
    const input = page.locator('#openai_preset_import_file');
    const file = { name: `${name}.json`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) };
    const dialog = page.locator('dialog[open][data-local-dialog]');
    await input.setInputFiles(file);
    await dialog.locator('[data-local-focus="remove"]').click();
    await expect(page.locator('#settings_preset_openai')).toHaveValue(name);
    expect((await savedPreset(page, name)).custom_url || '').toBe('');

    await input.setInputFiles(file);
    await dialog.locator('[data-local-focus="keep"]').click();
    await dialog.locator('[data-local-focus="confirm"]').click();
    await expect.poll(async () => (await savedPreset(page, name))?.custom_url).toBe(fixture.custom_url);

    await presetMenu(page, '#export_oai_preset');
    await dialog.locator('[data-local-focus="keep"]').click();
    const firstDownload = page.waitForEvent('download');
    await page.keyboard.press('Escape');
    const withoutConnection = JSON.parse(await readFile(await (await firstDownload).path(), 'utf8'));
    expect(withoutConnection.custom_url).toBeUndefined();

    await presetMenu(page, '#export_oai_preset');
    await dialog.locator('[data-local-focus="keep"]').click();
    await dialog.locator('input[type="radio"][value="true"]').check();
    const secondDownload = page.waitForEvent('download');
    await dialog.locator('[data-local-focus="export"]').click();
    const withConnection = JSON.parse(await readFile(await (await secondDownload).path(), 'utf8'));
    expect(withConnection.custom_url).toBe(fixture.custom_url);
});

test('preset switching lets the user cancel, discard, or save unsaved changes', async ({ page }) => {
    await page.route('**/api/backends/chat-completions/status', route => route.fulfill({ json: { data: [] } }));
    await testSetup.awaitST({ page });
    await openPrompt(page);
    const names = ['F6 Switch First', 'F6 Switch Second'];
    for (const name of names) await post(page, '/api/presets/delete', { apiId: 'openai', name });
    const fixture = await page.evaluate(() => {
        const settings = window.SillyTavern.getContext().chatCompletionSettings;
        return { temperature: 0.71, prompts: settings.prompts, prompt_order: settings.prompt_order };
    });
    for (const name of names) {
        await page.locator('#openai_preset_import_file').setInputFiles({ name: `${name}.json`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });
        await expect(page.locator('#settings_preset_openai')).toHaveValue(name);
    }
    await page.locator('#ai_response_configuration > .inline-drawer > .inline-drawer-toggle').click();
    const temperature = page.locator('#temp_openai_counter');
    const select = page.locator('#settings_preset_openai');
    const dialog = page.locator('dialog[open][data-local-dialog]');
    await temperature.fill('0.81');
    await expect(page.locator('#update_oai_preset')).toHaveClass(/is-dirty/);
    await select.selectOption(names[0]);
    await dialog.locator('[data-local-focus="cancel"]').click();
    await expect(select).toHaveValue(names[1]);
    await expect(temperature).toHaveValue('0.81');
    await select.selectOption(names[0]);
    await dialog.locator('[data-local-focus="discard"]').click();
    await expect(select).toHaveValue(names[0]);
    expect((await savedPreset(page, names[1])).temperature).toBe(0.71);
    await temperature.fill('0.91');
    await expect(page.locator('#update_oai_preset')).toHaveClass(/is-dirty/);
    await select.selectOption(names[1]);
    await dialog.locator('[data-local-focus="save"]').click();
    await expect(select).toHaveValue(names[1]);
    await expect.poll(async () => (await savedPreset(page, names[0]))?.temperature).toBe(0.91);
});

test('preset form CRUD, failed writes, settings handoff and reload retain the full canonical document', async ({ page }) => {
    await page.route('**/api/backends/chat-completions/status', route => route.fulfill({ json: { data: [] } }));
    await testSetup.awaitST({ page });
    const source = 'F4 Browser Source';
    const created = 'F4 Browser New';
    const renamed = 'F4 Browser Renamed';
    for (const name of [source, created, renamed]) await post(page, '/api/presets/delete', { apiId: 'openai', name });
    await page.reload();
    await testSetup.awaitST({ page });
    await openPrompt(page);
    const fixture = await page.evaluate(() => {
        const settings = window.SillyTavern.getContext().chatCompletionSettings;
        return { chat_completion_source: 'vertexai', temperature: 0.73, openai_max_context: 32000, openai_max_tokens: 4000,
            prompts: settings.prompts, prompt_order: settings.prompt_order,
            extensions: { regex_scripts: [], f4_marker: 'keep' }, f4_extra: { retained: true } };
    });
    await page.locator('#openai_preset_import_file').setInputFiles({ name: `${source}.json`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });
    await expect(page.locator('#settings_preset_openai')).toHaveValue(source);
    await expect(page.locator('#temp_openai_counter')).toHaveValue('0.73');
    expect(await page.evaluate(() => window.SillyTavern.getContext().chatCompletionSettings.chat_completion_source)).toBe('openai');

    await page.locator('#new_oai_preset').click();
    await confirmName(page, created);
    await expect(page.locator('#settings_preset_openai')).toHaveValue(created);
    await page.locator('#ai_response_configuration > .inline-drawer > .inline-drawer-toggle').click();
    await page.locator('#temp_openai_counter').fill('0.82');
    await expect(page.locator('#temp_openai')).toHaveValue('0.82');
    await page.route('**/api/presets/save', route => route.fulfill({ status: 503, json: { error: 'unavailable' } }));
    await page.locator('#update_oai_preset').click();
    await expect(page.locator('#respective-presets-block [role="alert"]')).toContainText('Failed to save');
    expect((await savedPreset(page, created)).temperature).toBe(0.73);
    await page.unroute('**/api/presets/save');
    await page.locator('#update_oai_preset').click();
    await expect.poll(async () => (await savedPreset(page, created)).temperature).toBe(0.82);

    await openSettings(page);
    await page.locator('#settings-memory-keepTurns').fill('7');
    await page.locator('#SettingsPanel button[type="submit"]').click();
    await expect(page.locator('#SettingsPanel .settings-status--success')).toBeVisible();
    expect(await page.evaluate(() => window.SillyTavern.getContext().chatCompletionSettings.chat_memory_keep_turns)).toBe(7);
    expect(await page.evaluate(() => window.SillyTavern.getContext().chatCompletionSettings.preset_settings_openai)).toBe(created);
    expect(await page.evaluate(() => window.SillyTavern.getContext().chatCompletionSettings.temp_openai)).toBe(0.82);
    await page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '设置' }).click();
    await openPrompt(page);
    await page.locator('#update_oai_preset').click();
    await expect.poll(async () => (await savedPreset(page, created)).chat_memory_keep_turns).toBe(7);

    await page.locator('.preset-menu-trigger').click();
    await page.locator('.preset-popup-menu-item').filter({ hasText: /^(Rename|重命名)$/ }).click();
    await confirmName(page, renamed);
    await expect(page.locator('#settings_preset_openai')).toHaveValue(renamed);
    await expect.poll(async () => savedPreset(page, created)).toBeNull();
    const stored = await savedPreset(page, renamed);
    expect(stored).toMatchObject({ temperature: 0.82, chat_memory_keep_turns: 7, chat_completion_source: 'openai', extensions: fixture.extensions, f4_extra: fixture.f4_extra });
    expect(stored.prompts).toEqual(fixture.prompts);
    expect(stored.prompt_order).toEqual(fixture.prompt_order);

    await page.route('**/api/presets/delete', route => route.fulfill({ status: 503, json: { error: 'unavailable' } }));
    await presetMenu(page, '#delete_oai_preset');
    await page.locator('dialog[open][data-local-dialog] [data-local-focus="confirm"]').click();
    await expect(page.locator('#respective-presets-block [role="alert"]')).toContainText('Failed to delete');
    await expect(page.locator('#settings_preset_openai')).toHaveValue(renamed);
    expect(await savedPreset(page, renamed)).not.toBeNull();
    await page.unroute('**/api/presets/delete');

    // Wait for the existing debounced settings save before proving a cold reload.
    await expect.poll(async () => JSON.parse((await post(page, '/api/settings/get')).data.settings).oai_settings.preset_settings_openai).toBe(renamed);
    await page.reload();
    await testSetup.awaitST({ page });
    await openPrompt(page);
    await expect(page.locator('#settings_preset_openai')).toHaveValue(renamed);
    await expect(page.locator('#temp_openai_counter')).toHaveValue('0.82');
    await page.locator('#settings_preset_openai').selectOption(source);
    await expect(page.locator('#temp_openai_counter')).toHaveValue('0.73');
    await page.locator('#settings_preset_openai').selectOption(renamed);
    await presetMenu(page, '#delete_oai_preset');
    await page.locator('dialog[open][data-local-dialog] [data-local-focus="confirm"]').click();
    await expect.poll(async () => savedPreset(page, renamed)).toBeNull();
    await expect(page.locator('#settings_preset_openai option').filter({ hasText: renamed })).toHaveCount(0);
});
