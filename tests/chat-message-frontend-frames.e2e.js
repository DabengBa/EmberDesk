import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect } from '@playwright/test';

import { testSetup } from './frontend/frontent-test-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const dataRoot = path.resolve(repoRoot, process.env.PLAYWRIGHT_DATA_ROOT ?? '.tmp/playwright-e2e-data');
const userHandle = process.env.PLAYWRIGHT_USER ?? 'playwright-e2e';
const userRoot = path.join(dataRoot, userHandle);
const characterName = 'Dev Character 001';
const chatFolder = 'dev-character-001';
const frontendChatName = 'Dev Character 001 Frontend Frames Proof';
const frontendChatPath = path.join(userRoot, 'chats', chatFolder, `${frontendChatName}.jsonl`);

const FRAME_DOCUMENT_ONE = [
    '<!DOCTYPE html>',
    '<html>',
    '<body>',
    '<div id="ed-e2e-app" style="min-height: 50vh">FRAME CONTENT ONE</div>',
    '<script>window.__e2eMarker = 42;</scr' + 'ipt>',
    '</body>',
    '</html>',
].join('\n');

const FRAME_DOCUMENT_TWO = [
    '<!DOCTYPE html>',
    '<html>',
    '<body>',
    '<div id="ed-e2e-app-two">FRAME CONTENT TWO</div>',
    '</body>',
    '</html>',
].join('\n');

function createFrontendFramesFixture() {
    const header = JSON.stringify({
        chat_metadata: { integrity: 'frontend-frames-proof' },
        user_name: 'unused',
        character_name: 'unused',
    });
    const messages = [
        { name: 'User', is_user: true, is_system: false, mes: 'Frontend frames proof seed.' },
        {
            name: characterName,
            is_user: false,
            is_system: false,
            mes: ['Before the frame.', '', '```html', FRAME_DOCUMENT_ONE, '```', '', 'After the frame.'].join('\n'),
        },
        {
            name: characterName,
            is_user: false,
            is_system: false,
            mes: ['A regular code block stays untouched:', '', '```js', 'const answer = 42;', '```'].join('\n'),
        },
        {
            name: characterName,
            is_user: false,
            is_system: false,
            mes: ['```html', FRAME_DOCUMENT_TWO, '```'].join('\n'),
        },
    ];
    const lines = [header, ...messages.map((message, index) => JSON.stringify({
        send_date: new Date(Date.UTC(2026, 5, 7, 9, index)).toISOString(),
        ...message,
    }))];
    fs.mkdirSync(path.dirname(frontendChatPath), { recursive: true });
    fs.writeFileSync(frontendChatPath, `${lines.join('\n')}\n`, 'utf8');
}

async function openCharacterLibrary(page) {
    const panelButton = page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: 'Character Library' }).first();
    await expect(panelButton).toBeVisible({ timeout: 10_000 });
    await panelButton.click({ timeout: 10_000 });
    await expect(page.locator('#right-nav-panel.openDrawer #rm_characters_block')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#rm_print_characters_block .character_select[data-chid]').first()).toBeVisible({ timeout: 10_000 });
}

async function closeCharacterAuthoringAfterSelection(page) {
    const authoringPanel = page.locator('[data-react-authoring-owner="characterAuthoring"]');
    if (!await authoringPanel.isVisible()) {
        return;
    }
    const activePanelButton = page.locator('[data-react-workspace-shell-chrome] nav button[aria-pressed="true"]').first();
    await expect(activePanelButton).toBeVisible();
    await activePanelButton.click();
    await expect(authoringPanel).toBeHidden();
}

async function selectCharacterByName(page, name) {
    await openCharacterLibrary(page);
    const selectedName = await page.evaluate(async (characterNameToSelect) => {
        const context = window.SillyTavern.getContext();
        const characterId = context.characters.findIndex(character => character?.name === characterNameToSelect);
        if (characterId < 0) {
            throw new Error(`Seeded character not found: ${characterNameToSelect}`);
        }
        await context.selectCharacterById(characterId);
        return context.characters[characterId].name;
    }, name);
    expect(selectedName).toBe(name);
    await page.waitForFunction((characterNameToSelect) => {
        const context = window.SillyTavern.getContext();
        return context.characters[context.characterId]?.name === characterNameToSelect;
    }, name);
    await closeCharacterAuthoringAfterSelection(page);
}

async function openFrontendChat(page) {
    await page.evaluate(async (chatToOpen) => {
        const context = window.SillyTavern.getContext();
        await context.openCharacterChat(chatToOpen);
    }, frontendChatName);
    await page.waitForFunction((chatName) => {
        const context = window.SillyTavern.getContext();
        return context.characters[context.characterId]?.chat === chatName
            && document.querySelectorAll('#chat .mes[mesid]').length === 4;
    }, frontendChatName, { timeout: 30_000 });
}

async function setFrontendFramesSettings(page, patch) {
    await page.evaluate(async (settingsPatch) => {
        const context = window.SillyTavern.getContext();
        context.powerUserSettings.frontend_frames = {
            ...context.powerUserSettings.frontend_frames,
            ...settingsPatch,
        };
        context.saveSettingsDebounced();
    }, patch);
}

test.describe('chat message frontend frames', () => {
    test.beforeEach(async () => {
        createFrontendFramesFixture();
    });

    test('renders complete HTML documents as live same-origin frames', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterByName(page, characterName);
        await openFrontendChat(page);

        const slots = page.locator('.ed-frontend-frame');
        await expect(slots).toHaveCount(2, { timeout: 15_000 });
        await expect(page.locator('.mes[mesid="1"] .ed-frontend-frame')).toHaveCount(1);
        await expect(page.locator('.mes[mesid="3"] .ed-frontend-frame')).toHaveCount(1);
        // The plain js code block must not be framed.
        await expect(page.locator('.mes[mesid="2"] .ed-frontend-frame')).toHaveCount(0);

        const firstFrame = page.locator('.mes[mesid="1"] iframe.ed-frontend-frame__iframe');
        await expect(firstFrame).toHaveAttribute('title', 'ed-frame--1--0');

        const frameFacts = await page.evaluate(() => {
            const iframe = document.querySelector('.mes[mesid="1"] iframe');
            const frameWindow = iframe?.contentWindow;
            return {
                hasSrcdoc: typeof iframe?.srcdoc === 'string' && iframe.srcdoc.includes('ed-e2e-app'),
                marker: frameWindow?.__e2eMarker,
                frameId: frameWindow?.EmberDeskFrame?.frameId,
                messageId: frameWindow?.EmberDeskFrame?.messageId,
                appExists: Boolean(frameWindow?.document?.querySelector('#ed-e2e-app')),
                lodashCopied: typeof frameWindow?._ === 'function',
            };
        });
        expect(frameFacts).toEqual({
            hasSrcdoc: true,
            marker: 42,
            frameId: 'ed-frame--1--0',
            messageId: '1',
            appExists: true,
            lodashCopied: true,
        });

        // Auto-height: the predefine script sizes the iframe to its content.
        await expect.poll(async () => page.evaluate(() => {
            const iframe = document.querySelector('.mes[mesid="1"] iframe');
            return iframe?.style.height ?? '';
        }), { timeout: 15_000 }).toMatch(/^\d+px$/);

        // min-height: 50vh is rewritten against the parent viewport variable.
        const rewrittenHeight = await page.evaluate(() => {
            const iframe = document.querySelector('.mes[mesid="1"] iframe');
            const app = iframe?.contentWindow?.document?.querySelector('#ed-e2e-app');
            return app ? Math.round(app.getBoundingClientRect().height) : 0;
        });
        const viewportHeight = await page.evaluate(() => window.innerHeight);
        expect(Math.abs(rewrittenHeight - viewportHeight * 0.5)).toBeLessThan(8);
    });

    test('collapses the source block behind a view-source toggle', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterByName(page, characterName);
        await openFrontendChat(page);

        const slot = page.locator('.mes[mesid="1"] .ed-frontend-frame');
        await expect(slot).toHaveCount(1, { timeout: 15_000 });
        const sourcePre = slot.locator('pre');
        const toggle = slot.locator('.ed-frontend-frame__toggle');

        await expect(sourcePre).toBeHidden();
        await expect(toggle).toHaveAttribute('aria-expanded', 'false');
        await toggle.click();
        await expect(sourcePre).toBeVisible();
        await expect(toggle).toHaveAttribute('aria-expanded', 'true');
        await toggle.click();
        await expect(sourcePre).toBeHidden();
    });

    test('honours the render-depth window without re-executing older frames', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterByName(page, characterName);
        await openFrontendChat(page);
        await expect(page.locator('.ed-frontend-frame')).toHaveCount(2, { timeout: 15_000 });

        await setFrontendFramesSettings(page, { depth: 1 });

        // Only the newest floor (mesid=3) keeps its frame; mesid=1 unwraps.
        await expect(page.locator('.ed-frontend-frame')).toHaveCount(1, { timeout: 15_000 });
        await expect(page.locator('.mes[mesid="3"] .ed-frontend-frame')).toHaveCount(1);
        await expect(page.locator('.mes[mesid="1"] .ed-frontend-frame')).toHaveCount(0);
        await expect(page.locator('.mes[mesid="1"] .mes_text pre')).toBeVisible();

        await setFrontendFramesSettings(page, { depth: 0 });
        await expect(page.locator('.ed-frontend-frame')).toHaveCount(2, { timeout: 15_000 });
    });

    test('enabled=false unmounts all frames and restores code blocks', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterByName(page, characterName);
        await openFrontendChat(page);
        await expect(page.locator('.ed-frontend-frame')).toHaveCount(2, { timeout: 15_000 });

        await setFrontendFramesSettings(page, { enabled: false });

        await expect(page.locator('.ed-frontend-frame')).toHaveCount(0, { timeout: 15_000 });
        await expect(page.locator('.mes[mesid="1"] .mes_text pre')).toBeVisible();
        await expect(page.locator('.mes[mesid="3"] .mes_text pre')).toBeVisible();

        await setFrontendFramesSettings(page, { enabled: true });
        await expect(page.locator('.ed-frontend-frame')).toHaveCount(2, { timeout: 15_000 });
    });

    test('removes frames when their message is deleted', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterByName(page, characterName);
        await openFrontendChat(page);
        await expect(page.locator('.ed-frontend-frame')).toHaveCount(2, { timeout: 15_000 });

        await page.evaluate(async () => {
            const context = window.SillyTavern.getContext();
            context.powerUserSettings.confirm_message_delete = false;
            await context.deleteMessage(3);
        });

        await expect(page.locator('.mes[mesid="3"]')).toHaveCount(0, { timeout: 15_000 });
        await expect(page.locator('.ed-frontend-frame')).toHaveCount(1, { timeout: 15_000 });
        await expect(page.locator('.mes[mesid="1"] .ed-frontend-frame')).toHaveCount(1);
    });
});
