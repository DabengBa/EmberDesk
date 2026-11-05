import { expect, test } from '@playwright/test';

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

        await dialog.getByPlaceholder('要查找的文本').fill(markerBefore);
        await dialog.getByPlaceholder('替换文本（可为空）').fill(markerAfter);
        await dialog.getByRole('checkbox', { name: '当前聊天' }).check();

        await dialog.getByRole('button', { name: '预览', exact: true }).click();
        // Scope labels share text with the match-group titles — the group title
        // is the last occurrence inside the preview block.
        await expect(dialog.getByText('角色字段', { exact: true }).last()).toBeVisible({ timeout: 10_000 });
        await expect(dialog.getByText('当前聊天', { exact: true }).last()).toBeVisible();
        await expect(dialog.getByText(/「AlphaMarker」/).first()).toBeVisible();

        page.on('dialog', confirm => void confirm.accept());
        await dialog.getByRole('button', { name: /^应用 .* 处替换$/ }).click();
        await expect(dialog.getByText('✓ 角色卡已更新')).toBeVisible({ timeout: 15_000 });
        await expect(dialog.getByText('✓ 当前聊天已更新')).toBeVisible();

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
    page.once('dialog', confirm => void confirm.accept());
    await dialog.getByRole('button', { name: /^应用 .* 处替换$/ }).click();
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
    page.once('dialog', confirm => void confirm.accept());
    await dialog.getByRole('button', { name: /^应用 .* 处替换$/ }).click();
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
