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
    const panelButton = page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '角色库' }).first();
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
        // Frame ids are derived from the stable message uid, not the array index.
        await expect(firstFrame).toHaveAttribute('title', /^ed-frame--[\w-]+--0$/);

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
            frameId: expect.stringMatching(/^ed-frame--[\w-]+--0$/),
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

    test('shows only the card without a frontend source control', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterByName(page, characterName);
        await openFrontendChat(page);

        const slot = page.locator('.mes[mesid="1"] .ed-frontend-frame');
        await expect(slot).toHaveCount(1, { timeout: 15_000 });
        const sourcePre = slot.locator('pre');
        const toggle = slot.locator('.ed-frontend-frame__toggle');

        await expect(sourcePre).toBeHidden();
        await expect(toggle).toHaveCount(0);
        await expect(slot.locator('iframe')).toBeVisible();
    });

    test('preserves ordinary code collapse and restores card sources on teardown', async ({ page }) => {
        const facts = await page.evaluate(async (html) => {
            const frames = await import('/scripts/frontend-frame.js');
            const row = document.createElement('div');
            row.innerHTML = '<div class="mes_text"></div>';
            document.body.append(row);
            const text = row.firstElementChild;
            const source = document.createElement('pre');
            source.textContent = html;
            const second = document.createElement('pre');
            second.textContent = '<html><body>second card</body></html>';
            const plain = document.createElement('pre');
            plain.textContent = 'const answer = 42;';
            text.append(source, second, plain);
            try {
                // Ordinary code folding is independent of frontend cards.
                const mounted = frames.mountFrontendFrames(text, { settings: { collapse_code_block: 'all' } });
                const toggle = text.querySelector('.ed-code-collapse-toggle');
                const ordinaryCollapsed = plain.style.display === 'none';
                toggle.click();
                const ordinaryExpanded = plain.style.display === '';
                const cardSourcesHidden = source.closest('.ed-frontend-frame').querySelector('pre').style.display === 'none'
                    && second.closest('.ed-frontend-frame').querySelector('pre').style.display === 'none';
                frames.unmountFrontendFrames(text);
                const inlineRestored = source.style.display === ''
                    && second.style.display === ''
                    && !text.querySelector('button, iframe');
                // The streaming preview is retired: no module entry point can
                // mount a frame while a row is still receiving tokens.
                const retiredRuntime = ['mountStreamingFrames', 'unmountStreamingFrames', 'findClosedFrontendDocuments', 'FRONTEND_STREAM_HOST_CLASS']
                    .filter(name => name in frames);
                return { mounted, ordinaryCollapsed, ordinaryExpanded, cardSourcesHidden, inlineRestored, retiredRuntime };
            } finally {
                frames.unmountFrontendFrames(text);
                row.remove();
            }
        }, FRAME_DOCUMENT_ONE);
        expect(facts).toEqual({
            mounted: 2,
            ordinaryCollapsed: true,
            ordinaryExpanded: true,
            cardSourcesHidden: true,
            inlineRestored: true,
            retiredRuntime: [],
        });
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

    test('deleting an earlier message keeps surviving frames mounted and sized', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterByName(page, characterName);
        await openFrontendChat(page);
        await expect(page.locator('.ed-frontend-frame iframe')).toHaveCount(2, { timeout: 15_000 });

        // Mark the live iframe + .mes_text elements, then hook srcdoc so any
        // reassignment is counted. Element identity survives because React keys
        // are uid-stable and StaticHtml skips same-string innerHTML writes.
        const before = await page.evaluate(() => {
            window.__e2eSrcdocSets = 0;
            const proto = HTMLIFrameElement.prototype;
            const descriptor = Object.getOwnPropertyDescriptor(proto, 'srcdoc');
            Object.defineProperty(proto, 'srcdoc', {
                configurable: true,
                enumerable: true,
                get: descriptor.get,
                set(value) {
                    window.__e2eSrcdocSets += 1;
                    return descriptor.set.call(this, value);
                },
            });
            const frames = [...document.querySelectorAll('.mes .ed-frontend-frame iframe')];
            frames.forEach((frame, index) => { frame.__e2eMark = `f${index}`; });
            const mesTexts = [...document.querySelectorAll('#chat .mes .mes_text')];
            mesTexts.forEach((el, index) => { el.__e2eMark = `t${index}`; });
            return {
                frameMarks: frames.map(frame => frame.__e2eMark),
                heights: frames.map(frame => frame.style.height),
            };
        });
        expect(before.frameMarks).toEqual(['f0', 'f1']);
        before.heights.forEach(height => expect(height).toMatch(/^\d+px$/));

        await page.evaluate(async () => {
            const context = window.SillyTavern.getContext();
            context.powerUserSettings.confirm_message_delete = false;
            await context.deleteMessage(0);
        });

        await expect(page.locator('#chat .mes[mesid]')).toHaveCount(3, { timeout: 15_000 });
        await expect(page.locator('.ed-frontend-frame iframe')).toHaveCount(2, { timeout: 15_000 });

        const after = await page.evaluate(() => {
            const frames = [...document.querySelectorAll('.mes .ed-frontend-frame iframe')];
            return {
                srcdocSets: window.__e2eSrcdocSets,
                frameMarks: frames.map(frame => frame.__e2eMark ?? 'RECREATED'),
                heights: frames.map(frame => frame.style.height),
                mesTextMarks: [...document.querySelectorAll('#chat .mes .mes_text')]
                    .map(el => el.__e2eMark ?? 'REWRITTEN'),
            };
        });

        expect(after.srcdocSets).toBe(0);
        expect(after.frameMarks).toEqual(['f0', 'f1']);
        expect(after.heights).toEqual(before.heights);
        // Surviving rows keep their .mes_text nodes; only the deleted row's mark is gone.
        expect(after.mesTextMarks).toEqual(['t1', 't2', 't3']);
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
        expect(snapshot?.frameId).toMatch(/^ed-frame--[\w-]+--0$/);
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
            window.__ED_FRAME_API__.on(frameWindow.EmberDeskFrame.frameId, 'message_received', handler);
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

async function installStreamingFetchStub(page, { chunks, delayMs = 150, keepStreamOpen = true }) {
    await page.evaluate(({ streamChunks, streamDelayMs, holdStreamOpen }) => {
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
                        if (holdStreamOpen) {
                            // Keep the stream open: the row stays in `streaming`
                            // state until the test aborts the generation.
                            await new Promise(resolve => {
                                if (init.signal?.aborted) {
                                    resolve();
                                    return;
                                }
                                init.signal?.addEventListener('abort', resolve, { once: true });
                            });
                            return;
                        }
                        // Natural completion: the provider terminator ends the
                        // generation without an abort.
                        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                        controller.close();
                    } finally {
                        try { controller.close(); } catch { /* already closed */ }
                    }
                },
            });
            return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
        };
    }, { streamChunks: chunks, streamDelayMs: delayMs, holdStreamOpen: keepStreamOpen });
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
    await page.getByRole('button', { name: '中止请求' }).click({ timeout: 10_000 });
    await settleGeneration(page);
}

async function startFreshGeneratingChat(page) {
    await testSetup.awaitST({ page });
    await selectCharacterByName(page, characterName);
    await page.evaluate(async () => {
        const script = await import('/script.js');
        await script.doNewChat({ deleteCurrentChat: false });
        await script.eventSource.emit(script.event_types.CHAT_LOADED, { detail: { source: 'e2e-fresh-chat' } });
    });
    await enableOpenAiStreaming(page);
}

async function settleGeneration(page) {
    await expect.poll(() => page.evaluate(() => window.SillyTavern.getContext().streamingProcessor === null), { timeout: 20_000 }).toBe(true);
    // Bounded wait — the generate() promise may already be settled.
    await page.evaluate(() => Promise.race([
        window.__edStreamGeneration,
        new Promise(resolve => setTimeout(() => resolve('timeout-ok'), 3000)),
    ]));
}

function streamingCardSource(page) {
    return page.locator('#chat .mes.last_mes .mes_text pre').filter({ hasText: 'stream-live' });
}

test.describe('chat message frontend frames — streaming', () => {
    for (const [format, documentHtml] of [
        ['LF', STREAMING_FRAME_DOC],
        ['entity', STREAMING_FRAME_DOC.replace('</body>', '<p>&amp;</p></body>')],
        ['Tab', STREAMING_FRAME_DOC.replace('<div', '\t<div')],
        ['CRLF', STREAMING_FRAME_DOC.replaceAll('\n', '\r\n')],
    ]) {
        test(`keeps the streaming row source-only after the fence closes, then aborts into a card (${format})`, async ({ page }) => {
            await startFreshGeneratingChat(page);
            // A stale `allow_streaming: true` from a stored document must not
            // resurrect the retired preview.
            await setFrontendFramesSettings(page, { allow_streaming: true });
            await installStreamingFetchStub(page, {
                chunks: [
                    'Here is the card.\n\n    <html><body>Indented example, not a card</body></html>\n\n',
                    '```html\n' + documentHtml,
                    '\n```',
                    '\n\nAfter one.',
                    ' After two.',
                ],
                delayMs: 250,
            });
            await startGeneration(page, 'render a frame');

            // Fence still open mid-stream: source visible, no frame anywhere.
            await expect(streamingCardSource(page)).toBeVisible({ timeout: 15_000 });
            await expect(page.locator('#chat .mes.last_mes .mes_text iframe')).toHaveCount(0);
            await expect(page.locator('.ed-frontend-stream')).toHaveCount(0);

            // Fence now closed but the row is still receiving tokens: the
            // source stays visible and no frame may exist.
            await expect(page.locator('#chat .mes.last_mes .mes_text')).toContainText('After two.', { timeout: 15_000 });
            await expect(streamingCardSource(page)).toBeVisible();
            await expect(page.locator('#chat .mes.last_mes .mes_text iframe')).toHaveCount(0);
            await expect(page.locator('.ed-frontend-stream')).toHaveCount(0);
            await page.waitForTimeout(600);
            await expect(streamingCardSource(page)).toBeVisible();
            await expect(page.locator('#chat .mes.last_mes .mes_text iframe')).toHaveCount(0);

            // Abort finalizes the row: the finished card mounts and its source hides.
            await stopAndFinalize(page);
            await expect(page.locator('#chat .mes.last_mes .mes_text .ed-frontend-frame iframe')).toHaveCount(2, { timeout: 15_000 });
            await expect(streamingCardSource(page)).toBeHidden();
        });
    }

    test('natural completion finalizes the card without ever rendering a streaming preview', async ({ page }) => {
        await startFreshGeneratingChat(page);
        await setFrontendFramesSettings(page, { allow_streaming: true });
        await installStreamingFetchStub(page, {
            chunks: ['```html\n' + STREAMING_FRAME_DOC, '\n```', '\n\nDone.'],
            delayMs: 250,
            keepStreamOpen: false,
        });
        await startGeneration(page, 'render a frame');

        await expect(streamingCardSource(page)).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('#chat .mes.last_mes .mes_text iframe')).toHaveCount(0);
        await expect(page.locator('.ed-frontend-stream')).toHaveCount(0);

        await settleGeneration(page);
        await expect(page.locator('#chat .mes.last_mes .mes_text .ed-frontend-frame iframe')).toHaveCount(1, { timeout: 15_000 });
        await expect(streamingCardSource(page)).toBeHidden();
    });
});
