import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

import { testSetup } from './frontend/frontent-test-utils.js';

const characterName = 'Dev Character 001';
const avatarUrl = 'dev-character-001.png';
// The seeded card's `data.chat` points at the last seeded session file.
const chatFileName = 'Dev Character 001 Session 04';
const markerBefore = 'AlphaMarker';
const markerAfter = 'BetaMarker';

// Every case rewrites the same seeded card's description, so they cannot run
// concurrently inside this file.
test.describe.configure({ mode: 'serial' });

async function openCharacterLibrary(page) {
    const panelButton = page.locator('[data-react-workspace-shell-chrome] nav button[data-workspace-shell-panel-entry="characterLibrary"]');
    await panelButton.click({ timeout: 10_000 });
    await expect(panelButton).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
    await expect(page.locator('#right-nav-panel.openDrawer #rm_characters_block')).toBeVisible({ timeout: 10_000 });
}

async function fetchWithCsrf(page, url, body) {
    return await page.evaluate(async ({ targetUrl, requestBody }) => {
        const csrfPayload = await fetch('/csrf-token')
            .then(response => response.json())
            .catch(() => null);
        const csrfToken = csrfPayload?.token ?? csrfPayload?.data?.token ?? null;
        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
            },
            body: JSON.stringify(requestBody),
        });
        const text = await response.text();
        let json = null;
        try {
            json = text ? JSON.parse(text) : null;
        } catch {
            json = null;
        }
        return { ok: response.ok, status: response.status, text, json };
    }, { targetUrl: url, requestBody: body });
}

test.describe('character text replace', () => {
    test('previews and applies replacements across card fields and the current chat', async ({ page }) => {
        await testSetup.awaitST({ page });

        // Seed the current chat session's message text plus reasoning through
        // the canonical write path. The integrity slug is preserved so a later
        // non-forced client save (the reload after apply) doesn't mismatch.
        const existingChat = await fetchWithCsrf(page, '/api/chats/get', {
            ch_name: characterName,
            file_name: chatFileName,
            avatar_url: avatarUrl,
        });
        const integrity = existingChat.json?.[0]?.chat_metadata?.integrity ?? crypto.randomUUID();

        await testSetup.saveCharacterChat({
            page,
            characterName: avatarUrl.replace(/\.png$/i, ''),
            avatarUrl,
            fileName: chatFileName,
            chat: [
                { chat_metadata: { integrity }, user_name: 'unused', character_name: 'unused' },
                // A user message first: a chat that only contains the first
                // assistant message is treated as "untouched" and regenerated
                // from first_mes on the next character save, wiping the seed.
                {
                    name: 'User',
                    is_user: true,
                    is_system: false,
                    mes: `${markerBefore} asks a question.`,
                    send_date: new Date().toISOString(),
                    extra: {},
                },
                {
                    name: characterName,
                    is_user: false,
                    is_system: false,
                    mes: `${markerBefore} speaks plainly.`,
                    send_date: new Date().toISOString(),
                    extra: { reasoning: `${markerBefore} considers it.` },
                },
            ],
        });

        // Reload so the open session is re-read from canonical — selecting the
        // character with a stale in-memory chat would save it back over the
        // seeded content before it ever loads.
        await page.reload();
        await testSetup.awaitST({ page });

        await openCharacterLibrary(page);
        await page.getByRole('searchbox', { name: /Search characters|搜索角色/ }).fill(characterName);
        const characterRow = page.locator('#rm_print_characters_block .character_select').filter({ hasText: characterName }).first();
        await expect(characterRow).toBeVisible({ timeout: 15_000 });
        await characterRow.click();

        const authoring = page.locator('[data-react-authoring-owner="characterAuthoring"]');
        await expect(authoring).toBeVisible({ timeout: 15_000 });

        // Seed the card text through the UI itself so the React draft and the
        // canonical card stay in sync — an out-of-band edit would be clobbered
        // by the panel's persist-before-action save.
        const descriptionField = authoring.locator('[data-react-authoring-field="description"] textarea');

        const savedCard = page.waitForResponse(response =>
            response.url().includes('/api/characters/edit') && response.ok(),
        );
        await descriptionField.fill(`${markerBefore} lives here.`);
        await expect(descriptionField).toHaveValue(`${markerBefore} lives here.`);
        await savedCard;

        const trigger = authoring.getByRole('button', { name: '查找替换', exact: true });
        await trigger.click();
        const dialog = page.locator('dialog[aria-label="查找替换"]');
        await expect(dialog).toBeVisible({ timeout: 10_000 });

        await expect(dialog.getByRole('checkbox', { name: '角色字段' })).toBeChecked();
        await expect(dialog.getByRole('checkbox', { name: '世界书', exact: true })).not.toBeChecked();
        await expect(dialog.getByRole('checkbox', { name: '当前聊天' })).not.toBeChecked();

        await dialog.getByPlaceholder('要查找的文本').fill(markerBefore);
        await dialog.getByPlaceholder('替换文本（可为空）').fill(markerAfter);
        await dialog.getByRole('checkbox', { name: '当前聊天' }).check();

        await dialog.getByRole('button', { name: '预览', exact: true }).click();
        await expect(dialog.getByText('角色字段', { exact: true }).last()).toBeVisible({ timeout: 10_000 });
        await expect(dialog.getByText(/^当前聊天 · /)).toBeVisible();
        await expect(dialog.getByText(/「AlphaMarker」/).first()).toBeVisible();

        const descriptionMatch = dialog.getByRole('checkbox', { name: /data\.description/ });
        const applyButton = dialog.getByRole('button', { name: /^应用 \d+ 处替换$/ });
        const originalCount = Number((await applyButton.innerText()).match(/\d+/)?.[0]);
        await descriptionMatch.uncheck();
        await expect(applyButton).toHaveText(`应用 ${originalCount - 1} 处替换`);
        await descriptionMatch.check();

        await dialog.getByRole('button', { name: /^应用 .* 处替换$/ }).click();
        await dialog.getByRole('button', { name: /^确认 .* 处替换$/ }).click();
        await expect(dialog.getByText('✓ 角色卡已更新')).toBeVisible({ timeout: 15_000 });
        await expect(dialog.getByText('✓ 当前聊天已更新')).toBeVisible();

        let chatSaves = 0;
        await page.route('**/api/chats/save', async route => { chatSaves++; await route.continue(); });
        let releaseRead;
        const readBlocked = new Promise(resolve => { releaseRead = resolve; });
        let readStarted;
        const readReady = new Promise(resolve => { readStarted = resolve; });
        await page.route('**/api/chats/get', async route => {
            readStarted();
            await readBlocked;
            await route.fulfill({ status: 500 });
        });
        await page.evaluate(async () => {
            const { saveMetadataDebounced } = await import('/scripts/feature-settings.js');
            saveMetadataDebounced();
        });
        await dialog.getByRole('button', { name: '完成', exact: true }).click();
        await readReady;
        await page.waitForTimeout(1400);
        expect(chatSaves).toBe(0);
        releaseRead();
        await expect(dialog.getByText('无法重新读取聊天。请在关闭前重试。')).toBeVisible();
        await expect(page.locator('.mes_text').filter({ hasText: markerBefore }).first()).toBeVisible();
        expect(chatSaves).toBe(0);
        await page.unroute('**/api/chats/get');
        await page.route('**/api/characters/get', route => route.fulfill({ status: 500 }));
        await dialog.getByRole('button', { name: '完成', exact: true }).click();
        await expect(dialog.getByText('无法重新读取角色。请在关闭前重试。')).toBeVisible();
        await page.unroute('**/api/characters/get');
        await dialog.getByRole('button', { name: '完成', exact: true }).click();
        await expect(dialog).toBeHidden();

        // The authoring panel remounts with the replaced canonical card.
        await expect(descriptionField).toHaveValue(`${markerAfter} lives here.`, { timeout: 15_000 });

        // The current chat was reloaded from canonical and shows the replacement.
        await expect(page.locator('.mes_text').filter({ hasText: markerAfter }).first()).toBeVisible({ timeout: 15_000 });

        // Canonical truth check: reasoning was replaced too, header untouched.
        const chatPayload = await fetchWithCsrf(page, '/api/chats/get', {
            ch_name: characterName,
            file_name: chatFileName,
            avatar_url: avatarUrl,
        });
        expect(chatPayload.ok).toBe(true);
        const messages = chatPayload.json;
        expect(Array.isArray(messages)).toBe(true);
        const assistant = messages.find(message => !message.is_user && !message.is_system && message.mes);
        expect(assistant.mes).toContain(markerAfter);
        expect(assistant.extra.reasoning).toContain(markerAfter);
        expect(assistant.name).toBe(characterName);
    });
});

test('export stops on failed presave and advances the version after a successful presave', async ({ page }) => {
    await testSetup.awaitST({ page });
    await openCharacterLibrary(page);
    await page.getByRole('searchbox', { name: /Search characters|搜索角色/ }).fill(characterName);
    await page.locator('#rm_print_characters_block .character_select').filter({ hasText: characterName }).first().click();
    const authoring = page.locator('[data-react-authoring-owner="characterAuthoring"]');
    const description = authoring.locator('[data-react-authoring-field="description"] textarea');
    await expect(description).toBeVisible();
    const now = Date.now();
    await page.clock.install({ time: now });
    await page.clock.pauseAt(now + 1000);
    await description.fill('Export presave draft');
    await page.route('**/api/characters/edit', route => route.fulfill({ status: 500 }));
    const failed = page.waitForResponse(response => response.url().endsWith('/api/characters/edit'));
    await authoring.locator('[data-character-export-trigger]').click();
    expect((await failed).status()).toBe(500);
    await expect(page.locator('#export_format_popup')).toBeHidden();
    await page.unroute('**/api/characters/edit');
    const saved = page.waitForResponse(response => response.url().endsWith('/api/characters/edit'));
    await authoring.locator('[data-character-export-trigger]').click();
    expect((await saved).status()).toBe(200);
    await expect(page.locator('#export_format_popup')).toBeVisible();
    const extraWrites = [];
    const recordExtraWrites = request => {
        if (request.url().endsWith('/api/characters/edit')) extraWrites.push(request);
    };
    page.on('request', recordExtraWrites);
    const downloaded = page.waitForEvent('download');
    await page.locator('#export_format_popup .export_format[data-format="json"]').click();
    const download = await downloaded;
    const exported = JSON.parse(await readFile(await download.path(), 'utf8'));
    expect(exported.data.description).toBe('Export presave draft');
    page.off('request', recordExtraWrites);
    expect(extraWrites).toHaveLength(0);
    const nextSave = page.waitForResponse(response => response.url().endsWith('/api/characters/edit'));
    await description.fill('Edit after export');
    await page.clock.runFor(1000);
    expect((await nextSave).status()).toBe(200);
    const stored = await fetchWithCsrf(page, '/api/characters/get', { avatar_url: avatarUrl });
    expect(stored.json.data.description).toBe('Edit after export');
    await authoring.locator('[data-character-export-trigger]').click();
    await expect(page.locator('#export_format_popup')).toBeVisible();
    const secondDownload = page.waitForEvent('download');
    await page.locator('#export_format_popup .export_format[data-format="json"]').click();
    const secondExport = JSON.parse(await readFile(await (await secondDownload).path(), 'utf8'));
    expect(secondExport.data.description).toBe('Edit after export');
    await authoring.getByRole('button', { name: '查找替换', exact: true }).click();
    const dialog = page.locator('dialog[aria-label="查找替换"]');
    await dialog.getByPlaceholder('要查找的文本').fill('Edit after export');
    await dialog.getByPlaceholder('替换文本（可为空）').fill('Export verified');
    const previewSave = page.waitForResponse(response => response.url().endsWith('/api/characters/text-replace/preview'));
    await dialog.getByRole('button', { name: '预览', exact: true }).click();
    expect((await previewSave).status()).toBe(200);
    await expect(dialog.getByText(/「Edit after export」/).first()).toBeVisible();
});

test('autosave succeeds after cancelling card replacement that saved a pending edit', async ({ page }) => {
    await testSetup.awaitST({ page });
    await openCharacterLibrary(page);
    await page.getByRole('searchbox', { name: /Search characters|搜索角色/ }).fill(characterName);
    await page.locator('#rm_print_characters_block .character_select').filter({ hasText: characterName }).first().click();
    const authoring = page.locator('[data-react-authoring-owner="characterAuthoring"]');
    const description = authoring.locator('[data-react-authoring-field="description"] textarea');
    await expect(description).toBeVisible();
    const now = Date.now();
    await page.clock.install({ time: now });
    await page.clock.pauseAt(now + 1000);

    const waitForEdit = () => page.waitForResponse(response => new URL(response.url()).pathname === '/api/characters/edit');
    await description.fill('Saved before opening card replacement');
    await authoring.locator('button[aria-haspopup="menu"][title]').click();
    const presave = waitForEdit();
    await authoring.getByRole('menuitem', { name: /Replace \/ Update|替换 \/ 更新/ }).click();
    expect((await presave).status()).toBe(200);
    const dialog = page.locator('dialog[open]').filter({ hasText: /Replace Character|替换角色/ });
    await dialog.locator('.popup-button-cancel').click();
    await expect(dialog).toHaveCount(0);

    await description.fill('Saved after cancelling card replacement');
    const autosave = waitForEdit();
    await page.clock.runFor(1000);
    expect((await autosave).status()).toBe(200);
});

test('a committed projection failure advances the version without losing newer edits', async ({ page }) => {
    await testSetup.awaitST({ page });
    await openCharacterLibrary(page);
    await page.getByRole('searchbox', { name: /Search characters|搜索角色/ }).fill(characterName);
    await page.locator('#rm_print_characters_block .character_select').filter({ hasText: characterName }).first().click();
    const description = page.locator('[data-react-authoring-field="description"] textarea');
    await expect(description).toBeVisible();
    const now = Date.now();
    await page.clock.install({ time: now });
    await page.clock.pauseAt(now + 1000);
    let release;
    const blocked = new Promise(resolve => { release = resolve; });
    let started;
    const ready = new Promise(resolve => { started = resolve; });
    let count = 0;
    await page.route('**/api/characters/edit', async route => {
        if (++count !== 1) return route.continue();
        const response = await route.fetch();
        const saved = await response.json();
        started();
        await blocked;
        await route.fulfill({ status: 500, json: { error: 'projection_failed', authority_committed: true, canonical_card_version: saved.canonical_card_version } });
    });
    await description.fill('Committed before projection failure');
    await page.clock.runFor(1000);
    await ready;
    await description.fill('New edit during projection failure');
    const failed = page.waitForResponse(response => response.url().endsWith('/api/characters/edit') && response.status() === 500);
    release();
    await failed;
    await expect(description).toHaveValue('New edit during projection failure');
    await expect(page.locator('#toast-container')).toContainText(/兼容性投影失败|compatibility projection failed/);
    const nextSave = page.waitForResponse(response => response.url().endsWith('/api/characters/edit') && response.status() === 200);
    await page.clock.runFor(1000);
    expect((await nextSave).status()).toBe(200);
    await expect(description).toHaveValue('New edit during projection failure');
});

test('preview waits for in-flight autosave and uses its committed version', async ({ page }) => {
    await testSetup.awaitST({ page });
    await openCharacterLibrary(page);
    await page.getByRole('searchbox', { name: /Search characters|搜索角色/ }).fill(characterName);
    await page.locator('#rm_print_characters_block .character_select').filter({ hasText: characterName }).first().click();
    const authoring = page.locator('[data-react-authoring-owner="characterAuthoring"]');
    const description = authoring.locator('[data-react-authoring-field="description"] textarea');
    await expect(description).toBeVisible();
    const now = Date.now();
    await page.clock.install({ time: now });
    await page.clock.pauseAt(now + 1000);
    await description.fill('InFlightPreview draft');
    let release;
    const blocked = new Promise(resolve => { release = resolve; });
    let started;
    const ready = new Promise(resolve => { started = resolve; });
    let edits = 0;
    let secondRequest;
    await page.route('**/api/characters/edit', async route => {
        if (++edits === 1) { started(); await blocked; }
        else secondRequest = route.request();
        await route.continue();
    });
    await authoring.evaluate(element => {
        element.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }));
        [...element.querySelectorAll('button')].find(button => button.textContent.trim() === '查找替换')?.click();
    });
    await ready;
    const dialog = page.locator('dialog[aria-label="查找替换"]');
    await expect(dialog).toBeVisible();
    await dialog.getByPlaceholder('要查找的文本').fill('InFlightPreview');
    await dialog.getByPlaceholder('替换文本（可为空）').fill('Replaced');
    await dialog.getByRole('button', { name: '预览', exact: true }).click();
    const secondSave = page.waitForResponse(response => response.request() === secondRequest);
    release();
    expect((await secondSave).status()).toBe(200);
    await expect(dialog.getByText(/「InFlightPreview」/).first()).toBeVisible();
    expect(edits).toBe(2);
});

test('a failed preview still advances the saved draft for retry', async ({ page }) => {
    await testSetup.awaitST({ page });
    await openCharacterLibrary(page);
    await page.getByRole('searchbox', { name: /Search characters|搜索角色/ }).fill(characterName);
    await page.locator('#rm_print_characters_block .character_select').filter({ hasText: characterName }).first().click();
    const description = page.locator('[data-react-authoring-field="description"] textarea');
    await expect(description).toBeVisible();
    const now = Date.now();
    await page.clock.install({ time: now });
    await page.clock.pauseAt(now + 1000);
    await description.fill('RetryPreview draft');
    await page.getByRole('button', { name: '查找替换', exact: true }).click();
    const dialog = page.locator('dialog[aria-label="查找替换"]');
    await dialog.getByPlaceholder('要查找的文本').fill('RetryPreview');
    await dialog.getByPlaceholder('替换文本（可为空）').fill('RetrySuccess');
    await page.route('**/api/characters/text-replace/preview', route => route.fulfill({ status: 500 }));
    const failedPreview = page.waitForResponse(response => response.url().endsWith('/api/characters/text-replace/preview'));
    await dialog.getByRole('button', { name: '预览', exact: true }).click();
    expect((await failedPreview).status()).toBe(500);
    await page.unroute('**/api/characters/text-replace/preview');
    const retrySave = page.waitForResponse(response => response.url().endsWith('/api/characters/text-replace/preview'));
    await dialog.getByRole('button', { name: '预览', exact: true }).click();
    expect((await retrySave).status()).toBe(200);
    await expect(dialog.getByText(/「RetryPreview」/).first()).toBeVisible();
});

test('preview advances the draft version before apply and subsequent editing', async ({ page }) => {
    await testSetup.awaitST({ page });
    await openCharacterLibrary(page);
    await page.getByRole('searchbox', { name: /Search characters|搜索角色/ }).fill(characterName);
    await page.locator('#rm_print_characters_block .character_select').filter({ hasText: characterName }).first().click();
    const authoring = page.locator('[data-react-authoring-owner="characterAuthoring"]');
    const description = authoring.locator('[data-react-authoring-field="description"] textarea');
    await expect(description).toBeVisible();
    const now = Date.now();
    await page.clock.install({ time: now });
    await page.clock.pauseAt(now + 1000);
    await description.fill('VersionPreviewBefore draft');
    await authoring.getByRole('button', { name: '查找替换', exact: true }).click();
    const dialog = page.locator('dialog[aria-label="查找替换"]');
    await dialog.getByPlaceholder('要查找的文本').fill('VersionPreviewBefore');
    await dialog.getByPlaceholder('替换文本（可为空）').fill('VersionPreviewAfter');
    await dialog.getByRole('button', { name: '预览', exact: true }).click();
    await expect(dialog.getByText(/「VersionPreviewBefore」/).first()).toBeVisible();
    const applySave = page.waitForResponse(response => response.url().endsWith('/api/characters/text-replace/apply'));
    await dialog.getByRole('button', { name: /^应用 .* 处替换$/ }).click();
    await dialog.getByRole('button', { name: /^确认 .* 处替换$/ }).click();
    expect((await applySave).status()).toBe(200);
    await expect(dialog.getByText('✓ 角色卡已更新')).toBeVisible();
    await dialog.getByRole('button', { name: '完成', exact: true }).click();
    await expect(description).toHaveValue('VersionPreviewAfter draft');
    const nextSave = page.waitForResponse(response => response.url().endsWith('/api/characters/edit'));
    await description.fill('Normal edit after replacement');
    await page.clock.runFor(1000);
    expect((await nextSave).status()).toBe(200);
    const card = await fetchWithCsrf(page, '/api/characters/get', { avatar_url: avatarUrl });
    expect(card.json?.data?.description).toBe('Normal edit after replacement');
});

test('a pending autosave cannot overwrite an applied replacement while the dialog is open', async ({ page }) => {
    await testSetup.awaitST({ page });
    await openCharacterLibrary(page);
    await page.getByRole('searchbox', { name: /Search characters|搜索角色/ }).fill(characterName);
    await page.locator('#rm_print_characters_block .character_select').filter({ hasText: characterName }).first().click();
    const authoring = page.locator('[data-react-authoring-owner="characterAuthoring"]');
    const description = authoring.locator('[data-react-authoring-field="description"] textarea');
    await expect(description).toBeVisible();
    const now = Date.now();
    await page.clock.install({ time: now });
    await page.clock.pauseAt(now + 1000);
    await description.fill('TimerRaceBefore draft');
    await authoring.getByRole('button', { name: '查找替换', exact: true }).click();
    const dialog = page.locator('dialog[aria-label="查找替换"]');
    await dialog.getByPlaceholder('要查找的文本').fill('TimerRaceBefore');
    await dialog.getByPlaceholder('替换文本（可为空）').fill('TimerRaceAfter');
    await dialog.getByRole('button', { name: '预览', exact: true }).click();
    await expect(dialog.getByText(/「TimerRaceBefore」/).first()).toBeVisible();
    await dialog.getByRole('button', { name: /^应用 .* 处替换$/ }).click();
    await dialog.getByRole('button', { name: /^确认 .* 处替换$/ }).click();
    await expect(dialog.getByText('✓ 角色卡已更新')).toBeVisible();

    // Keyboard navigation must not reach the stale authoring controls behind
    // the result dialog, including Export, before canonical refresh on close.
    await dialog.getByRole('button', { name: '完成', exact: true }).focus();
    for (let i = 0; i < 12; i++) {
        await page.keyboard.press('Tab');
        expect(await dialog.evaluate(element => document.activeElement === document.body || element.contains(document.activeElement))).toBe(true);
    }

    // The old 900ms autosave timer was scheduled before opening the dialog.
    // Fire it only after apply has committed and before closing/remounting.
    const appliedCard = await fetchWithCsrf(page, '/api/characters/get', { avatar_url: avatarUrl });
    expect(appliedCard.json?.data?.description ?? appliedCard.json?.description).toBe('TimerRaceAfter draft');
    let lateSaves = 0;
    await page.route('**/api/characters/edit', async route => {
        lateSaves++;
        await route.continue();
    });
    await page.clock.runFor(1000);
    await expect.poll(async () => {
        const card = await fetchWithCsrf(page, '/api/characters/get', { avatar_url: avatarUrl });
        return card.json?.data?.description ?? card.json?.description;
    }).toBe('TimerRaceAfter draft');
    expect(lateSaves).toBe(0);
    await dialog.getByRole('button', { name: '完成', exact: true }).click();
    await expect(description).toHaveValue('TimerRaceAfter draft');
    const exportButton = authoring.locator('[data-character-export-trigger]');
    await exportButton.focus();
    await expect(exportButton).toBeFocused();
});

test('a failed canonical refresh keeps the dialog open so closing can be retried', async ({ page }) => {
    await testSetup.awaitST({ page });
    await openCharacterLibrary(page);
    await page.getByRole('searchbox', { name: /Search characters|搜索角色/ }).fill(characterName);
    await page.locator('#rm_print_characters_block .character_select').filter({ hasText: characterName }).first().click();
    const authoring = page.locator('[data-react-authoring-owner="characterAuthoring"]');
    const description = authoring.locator('[data-react-authoring-field="description"] textarea');
    await expect(description).toBeVisible();
    await description.fill('RefreshFailBefore draft');
    await authoring.getByRole('button', { name: '查找替换', exact: true }).click();
    const dialog = page.locator('dialog[aria-label="查找替换"]');
    await dialog.getByPlaceholder('要查找的文本').fill('RefreshFailBefore');
    await dialog.getByPlaceholder('替换文本（可为空）').fill('RefreshFailAfter');
    await dialog.getByRole('button', { name: '预览', exact: true }).click();
    await expect(dialog.getByText(/「RefreshFailBefore」/).first()).toBeVisible();
    await dialog.getByRole('button', { name: /^应用 .* 处替换$/ }).click();
    await dialog.getByRole('button', { name: /^确认 .* 处替换$/ }).click();
    await expect(dialog.getByText('✓ 角色卡已更新')).toBeVisible();

    // The write itself committed; only the post-apply read of the canonical
    // card fails. The dialog must stay open instead of closing on a draft that
    // still holds pre-replacement text.
    let failedRefresh = false;
    await page.route('**/api/characters/get', async route => {
        if (failedRefresh) {
            await route.fulfill({ status: 500, body: 'unavailable' });
            return;
        }
        await route.continue();
    });
    failedRefresh = true;
    await dialog.getByRole('button', { name: '完成', exact: true }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('无法重新读取角色。请在关闭前重试。')).toBeVisible();

    failedRefresh = false;
    await dialog.getByRole('button', { name: '完成', exact: true }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(description).toHaveValue('RefreshFailAfter draft', { timeout: 15_000 });
});

test('an unknown apply result does not release the protected draft', async ({ page }) => {
    await testSetup.awaitST({ page });
    await openCharacterLibrary(page);
    await page.getByRole('searchbox', { name: /Search characters|搜索角色/ }).fill(characterName);
    await page.locator('#rm_print_characters_block .character_select').filter({ hasText: characterName }).first().click();
    const description = page.locator('[data-react-authoring-field="description"] textarea');
    await description.fill('UnknownBefore draft');
    await page.getByRole('button', { name: '查找替换', exact: true }).click();
    const dialog = page.locator('dialog[aria-label="查找替换"]');
    await dialog.getByPlaceholder('要查找的文本').fill('UnknownBefore');
    await dialog.getByPlaceholder('替换文本（可为空）').fill('UnknownAfter');
    await dialog.getByRole('button', { name: '预览', exact: true }).click();
    await expect(dialog.getByText(/「UnknownBefore」/).first()).toBeVisible();
    await page.route('**/api/characters/text-replace/apply', route => route.abort());
    await page.route('**/api/character-replace-coordination/intents/status', route => route.fulfill({ status: 503 }));
    await dialog.getByRole('button', { name: /^应用 .* 处替换$/ }).click();
    await dialog.getByRole('button', { name: /^确认 .* 处替换$/ }).click();
    await dialog.getByRole('button', { name: '检查替换状态', exact: true }).click();
    await expect(dialog.getByRole('button', { name: '检查替换状态', exact: true })).toBeEnabled();
    await expect(dialog.getByRole('button', { name: /^应用 .* 处替换$/ })).toHaveCount(0);
});

test('pending chat and metadata are saved before the replacement request', async ({ page }) => {
    await testSetup.awaitST({ page });
    await openCharacterLibrary(page);
    await page.getByRole('searchbox', { name: /Search characters|搜索角色/ }).fill(characterName);
    await page.locator('#rm_print_characters_block .character_select').filter({ hasText: characterName }).first().click();
    const description = page.locator('[data-react-authoring-field="description"] textarea');
    await description.fill('FlushBefore draft');
    await page.getByRole('button', { name: '查找替换', exact: true }).click();
    const dialog = page.locator('dialog[aria-label="查找替换"]');
    await dialog.getByPlaceholder('要查找的文本').fill('FlushBefore');
    await dialog.getByPlaceholder('替换文本（可为空）').fill('FlushAfter');
    await dialog.getByRole('checkbox', { name: '当前聊天' }).check();
    await dialog.getByRole('button', { name: '预览', exact: true }).click();
    await expect(dialog.getByText(/「FlushBefore」/).first()).toBeVisible();
    const clockStart = Date.now();
    await page.clock.install({ time: clockStart });
    await page.clock.pauseAt(clockStart + 1000);
    const currentChatFile = await page.evaluate(async () => {
        const { getContext } = await import('/scripts/st-context.js');
        const context = getContext();
        context.chat[0].mes = 'Pending chat marker';
        context.chatMetadata.pendingTestMarker = 'Pending metadata marker';
        const { saveMetadataDebounced } = await import('/scripts/feature-settings.js');
        saveMetadataDebounced();
        return context.getCurrentChatId();
    });
    await page.clock.resume();
    const applyResponse = page.waitForResponse(response => response.url().includes('/api/characters/text-replace/apply'));
    await dialog.getByRole('button', { name: /^应用 .* 处替换$/ }).click();
    await dialog.getByRole('button', { name: /^确认 .* 处替换$/ }).click();
    const response = await applyResponse;
    expect(response.status()).toBe(409);
    expect(await response.json()).toMatchObject({ reason: 'preview_stale' });
    await expect(dialog.getByText('数据在预览后已变更，请重新预览再应用。')).toBeVisible();
    const saved = await fetchWithCsrf(page, '/api/chats/get', { ch_name: characterName, file_name: currentChatFile, avatar_url: avatarUrl });
    expect(saved.json?.[0]?.chat_metadata?.pendingTestMarker).toBe('Pending metadata marker');
    expect(saved.json?.[1]?.mes).toBe('Pending chat marker');
});

test('a lost apply response cannot let the old draft overwrite a committed replacement', async ({ page }) => {
    await testSetup.awaitST({ page });
    await openCharacterLibrary(page);
    await page.getByRole('searchbox', { name: /Search characters|搜索角色/ }).fill(characterName);
    await page.locator('#rm_print_characters_block .character_select').filter({ hasText: characterName }).first().click();
    const description = page.locator('[data-react-authoring-field="description"] textarea');
    await description.fill('LostBefore draft');
    await page.getByRole('button', { name: '查找替换', exact: true }).click();
    const dialog = page.locator('dialog[aria-label="查找替换"]');
    await dialog.getByPlaceholder('要查找的文本').fill('LostBefore');
    await dialog.getByPlaceholder('替换文本（可为空）').fill('LostAfter');
    await dialog.getByRole('button', { name: '预览', exact: true }).click();
    await expect(dialog.getByText(/「LostBefore」/).first()).toBeVisible();
    await page.route('**/api/characters/text-replace/apply', async route => {
        await route.fetch();
        await route.abort();
    });
    await dialog.getByRole('button', { name: /^应用 .* 处替换$/ }).click();
    await dialog.getByRole('button', { name: /^确认 .* 处替换$/ }).click();
    await dialog.getByRole('button', { name: '检查替换状态', exact: true }).click();
    await dialog.getByRole('button', { name: '完成', exact: true }).click();
    await expect(description).toHaveValue('LostAfter draft');
    await expect.poll(async () => (await fetchWithCsrf(page, '/api/characters/get', { avatar_url: avatarUrl })).json?.data?.description).toBe('LostAfter draft');
});

test('does not send apply when the coordination intent cannot become ready', async ({ page }) => {
    await testSetup.awaitST({ page });
    await openCharacterLibrary(page);
    await page.getByRole('searchbox', { name: /Search characters|搜索角色/ }).fill(characterName);
    await page.locator('#rm_print_characters_block .character_select').filter({ hasText: characterName }).first().click();
    await page.locator('[data-react-authoring-field="description"] textarea').fill('ReadyBefore draft');
    await page.getByRole('button', { name: '查找替换', exact: true }).click();
    const dialog = page.locator('dialog[aria-label="查找替换"]');
    await dialog.getByPlaceholder('要查找的文本').fill('ReadyBefore');
    await dialog.getByPlaceholder('替换文本（可为空）').fill('ReadyAfter');
    await dialog.getByRole('button', { name: '预览', exact: true }).click();
    let applies = 0;
    await page.route('**/api/characters/text-replace/apply', route => { applies++; return route.continue(); });
    await page.route('**/api/character-replace-coordination/intents/ready', route => route.fulfill({ status: 503 }));
    await dialog.getByRole('button', { name: '应用 1 处替换' }).click();
    expect(applies).toBe(0);
    await dialog.getByRole('button', { name: '确认 1 处替换' }).click();
    await expect(dialog.getByText('无法准备替换，未替换任何内容。')).toBeVisible();
    expect(applies).toBe(0);
});

for (const lostResponse of [false, true]) {
test(`reports partial replacement ${lostResponse ? 'after checking the original intent' : 'from the apply response'} and retries only remaining areas`, async ({ page }) => {
    await testSetup.awaitST({ page });
    const book = 'Replace Partial Book';
    const oldBook = { entries: { 0: { uid: 0, key: ['PartialBefore'], content: 'PartialBefore entry' } } };
    expect((await fetchWithCsrf(page, '/api/worldinfo/edit', { name: book, data: oldBook })).status).toBe(200);
    const current = await fetchWithCsrf(page, '/api/characters/get', { avatar_url: avatarUrl });
    expect((await fetchWithCsrf(page, '/api/characters/merge-attributes', {
        avatar: avatarUrl, expected_card_json: current.json.canonical_card_version,
        data: { extensions: { world: book } },
    })).status).toBe(200);
    await page.reload();
    await testSetup.awaitST({ page });
    await openCharacterLibrary(page);
    await page.getByRole('searchbox', { name: /Search characters|搜索角色/ }).fill(characterName);
    await page.locator('#rm_print_characters_block .character_select').filter({ hasText: characterName }).first().click();
    const description = page.locator('[data-react-authoring-field="description"] textarea');
    await description.fill('PartialBefore draft');
    await page.getByRole('button', { name: '查找替换', exact: true }).click();
    const dialog = page.locator('dialog[aria-label="查找替换"]');
    await dialog.getByPlaceholder('要查找的文本').fill('PartialBefore');
    await dialog.getByPlaceholder('替换文本（可为空）').fill('PartialAfter');
    await dialog.getByRole('checkbox', { name: '世界书', exact: true }).check();
    await dialog.getByRole('checkbox', { name: '当前聊天' }).check();
    await dialog.getByRole('button', { name: '预览', exact: true }).click();
    await expect(dialog.getByText(`世界书 · ${book}`)).toBeVisible();
    let applies = 0;
    await page.route('**/api/characters/text-replace/apply', async route => {
        const areas = route.request().postDataJSON().areas;
        if (++applies === 1) {
            expect(areas).toMatchObject({ card: true, worldBook: true, chats: 'current' });
            const request = route.request();
            const written = await page.request.post('/api/worldinfo/edit', {
                headers: { 'x-csrf-token': request.headers()['x-csrf-token'] },
                data: { name: book, data: { entries: { 0: { uid: 0, key: ['PartialAfter'], content: 'PartialAfter entry' } } } },
            });
            expect(written.ok()).toBe(true);
            if (lostResponse) {
                const sessionId = request.headers()['x-emberdesk-write-session'];
                const intentId = request.headers()['x-emberdesk-replace-intent'];
                await page.route('**/api/character-replace-coordination/intents/status', status => {
                    expect(status.request().postDataJSON()).toEqual({ sessionId, intentId });
                    return status.fulfill({ json: { intent: { status: 'finished', outcome: 'unknown_partial',
                        result: { areas: { worldBook: 'committed', card: 'not_committed', chat: 'not_attempted' } },
                    } } });
                });
                return route.abort();
            }
            await route.fulfill({ status: 409, json: {
                ok: false, reason: 'character_card_conflict', partial: true,
                applied: { worldBook: true, card: false, chat: false }, areas: { card: { status: 'failed' }, chats: { status: 'skipped' } },
            } });
        } else {
            expect(areas).toMatchObject({ card: true, worldBook: false });
            await route.continue();
        }
    });
    await dialog.getByRole('button', { name: /^应用 .* 处替换$/ }).click();
    await dialog.getByRole('button', { name: /^确认 .* 处替换$/ }).click();
    if (lostResponse) await dialog.getByRole('button', { name: '检查替换状态' }).click();
    await expect(dialog.getByText('✓ 世界书已更新')).toBeVisible();
    await expect(dialog.getByText(/角色卡写入失败/)).toBeVisible();
    await expect(dialog.getByText('当前聊天未执行替换')).toBeVisible();
    const refresh = page.waitForResponse(response => response.url().endsWith('/api/worldinfo/get') && response.request().postDataJSON().name === book);
    await dialog.getByRole('button', { name: '查看剩余范围' }).click();
    expect((await (await refresh).json()).entries[0].content).toBe('PartialAfter entry');
    await expect(dialog.getByRole('checkbox', { name: '世界书 ✓' })).toBeDisabled();
    const preview = page.waitForRequest(request => request.url().endsWith('/api/characters/text-replace/preview'));
    await dialog.getByRole('button', { name: '预览', exact: true }).click();
    expect((await preview).postDataJSON().areas).toMatchObject({ card: true, worldBook: false });
    await dialog.getByRole('button', { name: '应用 1 处替换' }).click();
    await dialog.getByRole('button', { name: '确认 1 处替换' }).click();
    await dialog.getByRole('button', { name: '完成', exact: true }).click();
    await expect(description).toHaveValue('PartialAfter draft');
    expect(applies).toBe(2);
});
}


test('cancelling the dialog keeps the unsaved draft', async ({ page }) => {
    await testSetup.awaitST({ page });
    await openCharacterLibrary(page);
    await page.getByRole('searchbox', { name: /Search characters|搜索角色/ }).fill(characterName);
    await page.locator('#rm_print_characters_block .character_select').filter({ hasText: characterName }).first().click();
    const authoring = page.locator('[data-react-authoring-owner="characterAuthoring"]');
    const description = authoring.locator('[data-react-authoring-field="description"] textarea');
    await expect(description).toBeVisible();
    await description.fill('CancelDraft draft');
    await authoring.getByRole('button', { name: '查找替换', exact: true }).click();
    const dialog = page.locator('dialog[aria-label="查找替换"]');
    await expect(dialog).toBeVisible();
    // Autosave is paused while the dialog is open; cancelling must not drop the
    // draft that the pause protected.
    await dialog.getByRole('button', { name: /^(Close|关闭)$/ }).click();
    await expect(dialog).toBeHidden();
    await expect(description).toHaveValue('CancelDraft draft');
    await expect.poll(async () => {
        const card = await fetchWithCsrf(page, '/api/characters/get', { avatar_url: avatarUrl });
        return card.json?.data?.description ?? card.json?.description;
    }).toBe('CancelDraft draft');
});

test('a concurrent card edit rejects the tool presave and keeps the draft', async ({ page }) => {
    await testSetup.awaitST({ page });
    await openCharacterLibrary(page);
    await page.getByRole('searchbox', { name: /Search characters|搜索角色/ }).fill(characterName);
    await page.locator('#rm_print_characters_block .character_select').filter({ hasText: characterName }).first().click();
    const description = page.locator('[data-react-authoring-field="description"] textarea');
    await expect(description).toBeVisible();
    const now = Date.now();
    await page.clock.install({ time: now });
    await page.clock.pauseAt(now + 1000);
    await description.fill('Local conflict draft');
    const snapshot = (await fetchWithCsrf(page, '/api/characters/get', { avatar_url: avatarUrl })).json;
    const external = await fetchWithCsrf(page, '/api/characters/edit', {
        avatar_url: avatarUrl, ch_name: characterName, description: 'Concurrent remote edit',
        json_data: snapshot.json_data, expected_card_json: snapshot.canonical_card_version,
    });
    expect(external.status).toBe(200);
    await page.getByRole('button', { name: '查找替换', exact: true }).click();
    const dialog = page.locator('dialog[aria-label="查找替换"]');
    await dialog.getByPlaceholder('要查找的文本').fill('Local');
    const conflict = page.waitForResponse(response => response.url().endsWith('/api/characters/edit'));
    await dialog.getByRole('button', { name: '预览', exact: true }).click();
    expect((await conflict).status()).toBe(409);
    await dialog.getByRole('button', { name: /^(Close|关闭)$/ }).click();
    await expect(description).toHaveValue('Local conflict draft');
    const autosaveConflict = page.waitForResponse(response => response.url().endsWith('/api/characters/edit'));
    await page.clock.runFor(1000);
    expect((await autosaveConflict).status()).toBe(409);
    await page.clock.runFor(100);
    await expect(page.getByText(/^(保存失败|Save failed)$/)).toBeVisible();
    await expect(page.locator('[data-react-authoring-owner="characterAuthoring"]')).not.toContainText(/下次修改时重试|next change retries/);
    await expect(page.locator('#toast-container')).toContainText(/重新加载前复制|copy your changes before reloading/);
    const stored = await fetchWithCsrf(page, '/api/characters/get', { avatar_url: avatarUrl });
    expect(stored.json?.data?.description).toBe('Concurrent remote edit');
});
