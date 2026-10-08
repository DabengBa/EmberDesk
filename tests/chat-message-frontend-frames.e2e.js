import { test, expect } from '@playwright/test';

import { testSetup } from './frontend/frontent-test-utils.js';

const characterName = 'Dev Character 001';
const chatFolder = 'dev-character-001';
const frontendChatName = 'Dev Character 001 Frontend Frames Proof';

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

function buildFrontendFramesChat() {
    const header = {
        chat_metadata: { integrity: 'frontend-frames-proof' },
        user_name: 'unused',
        character_name: 'unused',
    };
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
    return [header, ...messages.map((message, index) => ({
        send_date: new Date(Date.UTC(2026, 5, 7, 9, index)).toISOString(),
        ...message,
    }))];
}

async function seedFrontendChat(page) {
    await testSetup.saveCharacterChat({
        page,
        characterName,
        avatarUrl: `${chatFolder}.png`,
        fileName: frontendChatName,
        chat: buildFrontendFramesChat(),
    });
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
        // In-memory patch + direct emit: the tests exercise the frame
        // mount/unmount controller, not settings persistence. A real save
        // would leak `enabled:false` into the shared user settings document
        // and flake parallel tests opening chats in the same window.
        await context.eventSource.emit('settings_updated');
    }, patch);
}

test.describe('chat message frontend frames', () => {
    test.beforeEach(async ({ page }) => {
        await testSetup.awaitST({ page });
        await seedFrontendChat(page);
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

    test('bridges whitelisted events and a frozen getContext snapshot into frames', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterByName(page, characterName);
        await openFrontendChat(page);
        await expect(page.locator('.mes[mesid="1"] .ed-frontend-frame iframe')).toHaveCount(1, { timeout: 15_000 });

        const snapshot = await page.evaluate(() => {
            const frameWindow = document.querySelector('.mes[mesid="1"] iframe')?.contentWindow;
            const ctx = frameWindow?.EmberDeskFrame?.getContext?.();
            return ctx ? {
                frameId: ctx.frameId,
                messageId: ctx.messageId,
                userName: ctx.userName,
                characterName: ctx.characterName,
                frozen: Object.isFrozen(ctx),
            } : null;
        });
        expect(snapshot?.frameId).toBe('ed-frame--1--0');
        expect(snapshot?.messageId).toBe('1');
        expect(typeof snapshot?.userName).toBe('string');
        expect(snapshot?.frozen).toBe(true);

        // Whitelisted subscription delivers; non-whitelisted refused; off()
        // unsubscribes. Run in one evaluate — the frame's contentWindow object
        // identity can drift between evaluates when the row re-commits.
        const bridged = await page.evaluate(async () => {
            window.__bridgeDeliveries = [];
            const handler = payload => window.__bridgeDeliveries.push(payload);
            const emit = (payload) => window.SillyTavern.getContext().eventSource.emit('message_received', payload);
            const frameWindow = document.querySelector('.mes[mesid="1"] iframe').contentWindow;
            const accepted = frameWindow.EmberDeskFrame.on('message_received', handler);
            const rejected = frameWindow.EmberDeskFrame.on('not_a_real_event', () => {});
            await emit({ e2e: 1 });
            const afterOn = window.__bridgeDeliveries.length;
            frameWindow.EmberDeskFrame.off('message_received', handler);
            await emit({ e2e: 2 });
            const afterOff = window.__bridgeDeliveries.length;
            // Host-side re-subscribe through the same registry the frame uses.
            window.__ED_FRAME_API__.on('ed-frame--1--0', 'message_received', handler);
            await emit({ e2e: 3 });
            return { accepted, rejected, afterOn, afterOff, afterRe: window.__bridgeDeliveries.length };
        });
        expect(bridged).toEqual({ accepted: true, rejected: false, afterOn: 1, afterOff: 1, afterRe: 2 });

        // Host-side dispose on unmount: disable → emit → no further delivery.
        await setFrontendFramesSettings(page, { enabled: false });
        await expect(page.locator('.ed-frontend-frame')).toHaveCount(0, { timeout: 15_000 });
        await page.evaluate(() => window.SillyTavern.getContext().eventSource.emit('message_received', { e2e: 4 }));
        await page.waitForTimeout(300);
        expect(await page.evaluate(() => window.__bridgeDeliveries.length)).toBe(2);
    });
});

const STREAMING_FRAME_DOC = [
    '<!DOCTYPE html>',
    '<html>',
    '<body>',
    '<div id="stream-live">STREAM LIVE</div>',
    '</body>',
    '</html>',
].join('\n');

async function enableOpenAiStreaming(page) {
    await page.evaluate(() => {
        const context = window.SillyTavern.getContext();
        context.powerUserSettings.stream_fade_in = false;
        context.powerUserSettings.streaming_fps = 60;
        context.chatCompletionSettings.chat_completion_source = 'openai';
        context.chatCompletionSettings.openai_model = 'gpt-4o-mini';
        context.chatCompletionSettings.stream_openai = true;
        context.chatCompletionSettings.n = 1;
        context.chatCompletionSettings.send_if_empty = '';
    });
    await page.evaluate(async () => {
        const script = await import('/script.js');
        script.changeMainAPI('openai');
        script.setOnlineStatus('Valid');
        script.activateSendButtons();
    });
}

async function installStreamingFetchStub(page, { chunks, delayMs = 150 }) {
    await page.evaluate(({ streamChunks, streamDelayMs }) => {
        window.__edStreamGeneration = null;
        window.__edStreamOriginalFetch ??= window.fetch.bind(window);
        window.fetch = async (input, init = {}) => {
            const url = typeof input === 'string' ? input : input.url;
            if (!String(url).endsWith('/api/backends/chat-completions/generate')) {
                return window.__edStreamOriginalFetch(input, init);
            }
            const encoder = new TextEncoder();
            const body = new ReadableStream({
                async start(controller) {
                    try {
                        for (const chunk of streamChunks) {
                            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                                choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }],
                            })}\n\n`));
                            await new Promise(resolve => setTimeout(resolve, streamDelayMs));
                        }
                        // Keep the stream open: the row stays in `streaming`
                        // state until the test aborts the generation.
                        await new Promise(resolve => {
                            if (init.signal?.aborted) {
                                resolve();
                                return;
                            }
                            init.signal?.addEventListener('abort', resolve, { once: true });
                        });
                    } finally {
                        try { controller.close(); } catch { /* already closed */ }
                    }
                },
            });
            return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
        };
    }, { streamChunks: chunks, streamDelayMs: delayMs });
}

async function startGeneration(page, prompt) {
    await page.evaluate((messageText) => {
        const textarea = document.querySelector('#send_textarea');
        textarea.value = messageText;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        const context = window.SillyTavern.getContext();
        window.__edStreamGeneration = context.generate('normal', { automatic_trigger: false })
            .catch(() => 'aborted');
    }, prompt);
}

async function stopAndFinalize(page) {
    await page.getByRole('button', { name: 'Abort request' }).click({ timeout: 10_000 });
    await expect.poll(() => page.evaluate(() => window.SillyTavern.getContext().streamingProcessor === null), { timeout: 15_000 }).toBe(true);
    // Bounded wait — the generate() promise may already be settled.
    await page.evaluate(() => Promise.race([
        window.__edStreamGeneration,
        new Promise(resolve => setTimeout(() => resolve('timeout-ok'), 3000)),
    ]));
}

test.describe('chat message frontend frames — streaming', () => {
    test('mounts closed-fence frames mid-stream and hands off to inline mount on finalize', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterByName(page, characterName);
        await page.evaluate(async () => {
            const script = await import('/script.js');
            await script.doNewChat({ deleteCurrentChat: false });
            await script.eventSource.emit(script.event_types.CHAT_LOADED, { detail: { source: 'e2e-fresh-chat' } });
        });
        await enableOpenAiStreaming(page);
        await setFrontendFramesSettings(page, { allow_streaming: true });
        await installStreamingFetchStub(page, {
            chunks: [
                'Here is the card.\n\n',
                '```html\n' + STREAMING_FRAME_DOC,
                '\n```',
                '\n\nAfter one.',
                ' After two.',
            ],
            delayMs: 250,
        });
        await startGeneration(page, 'render a frame');

        // While streaming: frame lives in the sibling stream host, NOT in .mes_text.
        const streamFrame = page.locator('#chat .mes .ed-frontend-stream iframe.ed-frontend-frame__iframe');
        await expect(streamFrame).toHaveCount(1, { timeout: 15_000 });
        await expect.poll(() => page.evaluate(() =>
            document.querySelector('.ed-frontend-stream iframe')?.contentWindow?.document?.querySelector('#stream-live')?.textContent,
        ), { timeout: 15_000 }).toBe('STREAM LIVE');
        await expect(page.locator('#chat .mes .mes_text .ed-frontend-frame')).toHaveCount(0);

        // The iframe survives later token commits (no flicker remount).
        await page.evaluate(() => {
            document.querySelector('.ed-frontend-stream iframe').contentWindow.__persist = 'kept';
        });
        await page.waitForTimeout(600);
        expect(await page.evaluate(() =>
            document.querySelector('.ed-frontend-stream iframe')?.contentWindow?.__persist,
        )).toBe('kept');

        // Abort → row finalizes → stream host removed, inline mount takes over.
        await stopAndFinalize(page);
        await expect(page.locator('.ed-frontend-stream')).toHaveCount(0, { timeout: 15_000 });
        await expect(page.locator('#chat .mes .mes_text .ed-frontend-frame iframe')).toHaveCount(1, { timeout: 15_000 });
    });

    test('allow_streaming=false keeps streaming text as plain code until finalize', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterByName(page, characterName);
        await page.evaluate(async () => {
            const script = await import('/script.js');
            await script.doNewChat({ deleteCurrentChat: false });
            await script.eventSource.emit(script.event_types.CHAT_LOADED, { detail: { source: 'e2e-fresh-chat' } });
        });
        await enableOpenAiStreaming(page);
        await setFrontendFramesSettings(page, { allow_streaming: false });
        await installStreamingFetchStub(page, {
            chunks: ['```html\n' + STREAMING_FRAME_DOC, '\n```', '\n\nDone.'],
            delayMs: 250,
        });
        await startGeneration(page, 'render a frame');

        await page.waitForTimeout(900);
        await expect(page.locator('.ed-frontend-stream')).toHaveCount(0);
        await expect(page.locator('#chat .mes .mes_text iframe')).toHaveCount(0);

        await stopAndFinalize(page);
        await expect(page.locator('#chat .mes .mes_text .ed-frontend-frame iframe')).toHaveCount(1, { timeout: 15_000 });
    });
});
