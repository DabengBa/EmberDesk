import { test, expect } from '@playwright/test';

import { testSetup } from './frontend/frontent-test-utils.js';

const characterName = 'Dev Character 001';
const chatFolder = 'dev-character-001';
const frontendChatName = () => `Frontend Frames ${test.info().title.replace(/\W+/g, ' ')}`;

const FRAME_DOCUMENT_ONE = [
    '<!DOCTYPE html>',
    '<html>',
    '<body>',
    '<div id="ed-e2e-app" style="min-height: 50vh">FRAME CONTENT ONE</div>',
    '<style>#ed-e2e-app { background-color: rgb(18, 52, 86); }</style>',
    '<script>document.querySelector("#ed-e2e-app").dataset.marker = "42";</scr' + 'ipt>',
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
        fileName: frontendChatName(),
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
    const name = frontendChatName();
    await page.evaluate(async (chatToOpen) => {
        const context = window.SillyTavern.getContext();
        await context.openCharacterChat(chatToOpen);
    }, name);
    await page.waitForFunction((chatName) => {
        const context = window.SillyTavern.getContext();
        return context.characters[context.characterId]?.chat === chatName
            && document.querySelectorAll('#chat .mes[mesid]').length === 4;
    }, name, { timeout: 30_000 });
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

    test('renders complete HTML documents as live isolated frames', async ({ page }) => {
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

        await expect(firstFrame).toHaveAttribute('sandbox', 'allow-scripts');
        expect(await firstFrame.evaluate(iframe => iframe.contentDocument)).toBeNull();
        const app = firstFrame.contentFrame().locator('#ed-e2e-app');
        await expect(app).toHaveText('FRAME CONTENT ONE');
        await expect(app).toHaveAttribute('data-marker', '42');
        await expect(app).toHaveCSS('background-color', 'rgb(18, 52, 86)');
    });

    test('discloses the original fenced HTML as text', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterByName(page, characterName);
        await openFrontendChat(page);

        const slot = page.locator('.mes[mesid="1"] .ed-frontend-frame');
        await expect(slot).toHaveCount(1, { timeout: 15_000 });
        const sourcePre = slot.locator('pre');

        await expect(sourcePre).toBeHidden();
        await expect(slot.locator('iframe')).toBeVisible();
        await slot.locator('summary').click();
        await expect(sourcePre).toBeVisible();
        expect((await sourcePre.textContent()).trimEnd()).toBe(FRAME_DOCUMENT_ONE);
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
                const cardSourcesHidden = !source.closest('.ed-frontend-frame details').open
                    && !second.closest('.ed-frontend-frame details').open;
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
                heights: frames.map(frame => getComputedStyle(frame).height),
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
                heights: frames.map(frame => getComputedStyle(frame).height),
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
        const finishStream = new Promise(resolve => { window.__edFinishStream = resolve; });
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
                        await finishStream;
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

        await page.evaluate(() => window.__edFinishStream());
        await settleGeneration(page);
        await expect(page.locator('#chat .mes.last_mes .mes_text .ed-frontend-frame iframe')).toHaveCount(1, { timeout: 15_000 });
        await expect(streamingCardSource(page)).toBeHidden();
    });
});
