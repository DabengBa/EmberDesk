import { test, expect } from '@playwright/test';

import { testSetup } from './frontend/frontent-test-utils.js';

const characterName = 'Dev Character 001';
const seededChatName = 'Dev Character 001 Session 01';

async function openCharacterLibrary(page) {
    const panelButton = page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '角色库' }).first();
    await expect(panelButton).toBeVisible({ timeout: 10_000 });
    await panelButton.click({ timeout: 10_000 });
    await expect(panelButton).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
    await expect(page.locator('#right-nav-panel.openDrawer #rm_characters_block')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#rm_print_characters_block .character_select[data-chid]').first()).toBeVisible({ timeout: 10_000 });
}

async function selectCharacterInFreshChat(page, name) {
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
    await page.evaluate(async (nextChatName) => {
        const context = window.SillyTavern.getContext();
        await context.openCharacterChat(nextChatName);
    }, seededChatName);
    await page.evaluate(async () => {
        const script = await import('/script.js');
        await script.doNewChat({ deleteCurrentChat: false });
        await script.eventSource.emit(script.event_types.CHAT_LOADED, { detail: { source: 'e2e-fresh-chat' } });
    });
}

async function enableOpenAi(page, { streamOpenAi = false } = {}) {
    await page.evaluate(({ streamEnabled }) => {
        const context = window.SillyTavern.getContext();
        context.powerUserSettings.stream_fade_in = false;
        context.powerUserSettings.streaming_fps = 60;
        context.chatCompletionSettings.chat_completion_source = 'openai';
        context.chatCompletionSettings.openai_model = 'gpt-4o-mini';
        context.chatCompletionSettings.stream_openai = streamEnabled;
        context.chatCompletionSettings.n = 1;
        context.chatCompletionSettings.send_if_empty = '';
    }, { streamEnabled: streamOpenAi });
    await page.evaluate(async () => {
        const script = await import('/script.js');
        script.changeMainAPI('openai');
        script.setOnlineStatus('Valid');
        script.activateSendButtons();
    });
}

/**
 * Intercepts /api/backends/chat-completions/generate with a per-request
 * response sequence. Each entry: { content } for a JSON reply,
 * { status, error } for an HTTP failure, { chunks, keepOpenAfterChunks } for
 * a streaming response.
 */
async function installGenerationStub(page, { responses }) {
    await page.evaluate(({ sequence }) => {
        window.__emberdeskRegenerateRequests = [];
        window.__emberdeskRegenerateOriginalFetch ??= window.fetch.bind(window);

        window.fetch = async (input, init = {}) => {
            const url = typeof input === 'string' ? input : input.url;
            if (!String(url).endsWith('/api/backends/chat-completions/generate')) {
                return window.__emberdeskRegenerateOriginalFetch(input, init);
            }

            const requestBody = JSON.parse(String(init.body ?? '{}'));
            window.__emberdeskRegenerateRequests.push(requestBody);
            const config = sequence[Math.min(window.__emberdeskRegenerateRequests.length - 1, sequence.length - 1)] ?? {};

            if (config.status && config.status !== 200) {
                return new Response(JSON.stringify(config.error ?? { error: { message: 'provider boom' } }), {
                    status: config.status,
                    headers: { 'Content-Type': 'application/json' },
                });
            }

            if (Array.isArray(config.chunks) || (requestBody.stream && config.content !== undefined)) {
                const encoder = new TextEncoder();
                const chunks = config.chunks ?? [config.content];
                const body = new ReadableStream({
                    async start(controller) {
                        const abort = () => {
                            try {
                                controller.error(new DOMException('Aborted', 'AbortError'));
                            } catch {
                                // The stream may already be closed.
                            }
                        };
                        init.signal?.addEventListener('abort', abort, { once: true });
                        try {
                            for (const chunk of chunks) {
                                if (init.signal?.aborted) {
                                    abort();
                                    return;
                                }
                                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                                    choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }],
                                })}\n\n`));
                                await new Promise(resolve => setTimeout(resolve, config.delayMs ?? 40));
                            }
                            if (config.keepOpenAfterChunks) {
                                await new Promise(resolve => {
                                    if (init.signal?.aborted) {
                                        resolve();
                                        return;
                                    }
                                    init.signal?.addEventListener('abort', resolve, { once: true });
                                });
                                return;
                            }
                            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                            controller.close();
                        } finally {
                            init.signal?.removeEventListener('abort', abort);
                        }
                    },
                });
                return new Response(body, {
                    status: 200,
                    headers: { 'Content-Type': 'text/event-stream' },
                });
            }

            await new Promise(resolve => setTimeout(resolve, config.delayMs ?? 60));
            return new Response(JSON.stringify({
                choices: [{ message: { content: config.content ?? 'generated' } }],
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        };
    }, { sequence: responses });
}

async function sendUserAndGenerate(page, text) {
    await page.evaluate(async (messageText) => {
        const script = await import('/script.js');
        const context = window.SillyTavern.getContext();
        await script.sendMessageAsUser(messageText);
        window.__emberdeskRegeneratePending = context.generate('normal', { automatic_trigger: false })
            .catch(error => {
                window.__emberdeskRegenerateError = String(error?.message ?? error);
                throw error;
            });
    }, text);
    await waitForGenerationDone(page);
}

async function waitForGenerationDone(page, { allowFailure = false, allowAbort = false } = {}) {
    await page.evaluate(async ({ acceptFailure, acceptAbort }) => {
        try {
            await window.__emberdeskRegeneratePending;
        } catch (error) {
            const message = String(error?.message ?? error);
            const ok = (acceptFailure && message.length > 0)
                || (acceptAbort && message.includes('Generation was aborted'));
            if (!ok) {
                throw error;
            }
        }
        window.__emberdeskRegeneratePending = null;
    }, { acceptFailure: allowFailure, acceptAbort: allowAbort });
    await expect(page.locator('body')).not.toHaveAttribute('data-generating', 'true');
    await expect.poll(async () => page.evaluate(() => window.SillyTavern.getContext().streamingProcessor === null)).toBe(true);
}

/**
 * Clicks the real options-menu "Regenerate" entry and waits until the
 * fire-and-forget generation it dispatched actually reached the fetch stub.
 * The delegated menu handler voids the promise, so there is nothing to await
 * directly — the request counter only increments once generation is in
 * flight (by then is_send_press is set).
 */
async function clickRegenerateMenuItem(page) {
    const baseline = await page.evaluate(() => window.__emberdeskRegenerateRequests?.length ?? 0);
    await page.locator('#options_button').click();
    const item = page.locator('#option_regenerate');
    await expect(item).toBeVisible({ timeout: 5_000 });
    await expect(item).toBeEnabled({ timeout: 5_000 });
    await item.click();
    await expect.poll(
        async () => page.evaluate(n => window.__emberdeskRegenerateRequests.length > n, baseline),
        { timeout: 15_000 },
    ).toBe(true);
}

/**
 * Waits for an in-flight generation to fully settle — every end path
 * (success, failed-and-restored, user-abort) clears is_send_press and the
 * streaming processor.
 */
async function waitForRegenerateSettled(page) {
    await expect.poll(async () => page.evaluate(async () => {
        const script = await import('/script.js');
        return script.isGenerating() === false
            && window.SillyTavern.getContext().streamingProcessor === null;
    }), { timeout: 30_000 }).toBe(true);
}

async function lastMessageText(page) {
    return page.evaluate(() => {
        const script = window.SillyTavern.getContext();
        return String(script.chat.at(-1)?.mes ?? '');
    });
}

async function chatSnapshot(page) {
    return page.evaluate(() => {
        const context = window.SillyTavern.getContext();
        return context.chat.map(message => ({
            is_user: Boolean(message.is_user),
            is_system: Boolean(message.is_system),
            mes: String(message.mes ?? ''),
            toolInvocations: Array.isArray(message.extra?.tool_invocations),
        }));
    });
}

test.describe('chat regenerate', () => {
    test.describe.configure({ mode: 'serial' });

    test('replaces the whole generated turn and never touches the composer or the user message', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterInFreshChat(page, characterName);
        await enableOpenAi(page);
        await installGenerationStub(page, {
            responses: [
                { content: 'ORIGINAL_REPLY' },
                { content: 'REGENERATED_REPLY' },
            ],
        });

        await sendUserAndGenerate(page, 'first question');
        let snapshot = await chatSnapshot(page);
        expect(snapshot.at(-1).mes).toContain('ORIGINAL_REPLY');
        const baseLength = snapshot.length;

        // Same-turn pipeline/tool card: injected like a mid-run artifact.
        await page.evaluate(() => {
            const context = window.SillyTavern.getContext();
            const toolCard = {
                is_user: false,
                is_system: true,
                name: 'pipeline',
                send_date: '2024-01-01',
                mes: 'pipeline card',
                extra: { tool_invocations: [{ name: 'analyze', arguments: '{}', result: 'old-analysis' }] },
            };
            const assistantReply = {
                is_user: false,
                is_system: false,
                name: '',
                send_date: '2024-01-01',
                mes: 'SECOND_OLD_REPLY',
                extra: { api: 'openai', model: 'gpt-4o-mini' },
            };
            context.chat.push(toolCard, assistantReply);
        });

        // An unsent composer draft must survive regeneration untouched.
        await page.evaluate(() => {
            const textarea = document.querySelector('#send_textarea');
            textarea.value = 'unsent draft text';
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
        });

        await clickRegenerateMenuItem(page);
        await waitForRegenerateSettled(page);

        // The tool card and BOTH old replies are gone; exactly one new reply sits
        // at the end — no extra user message was added.
        snapshot = await chatSnapshot(page);
        expect(snapshot).toHaveLength(baseLength);
        expect(snapshot.filter(m => m.is_user)).toHaveLength(1);
        expect(snapshot.filter(m => m.toolInvocations)).toHaveLength(0);
        expect(snapshot.at(-1).is_user).toBe(false);
        expect(snapshot.at(-1).mes).toContain('REGENERATED_REPLY');
        expect(snapshot.at(-1).mes).not.toContain('SECOND_OLD_REPLY');
        expect(snapshot.at(-1).mes).not.toContain('ORIGINAL_REPLY');

        // The request went out with the same user context but without any of
        // the removed turn's content.
        const request = await page.evaluate(() => window.__emberdeskRegenerateRequests.at(-1));
        const wire = JSON.stringify(request.messages);
        expect(wire).toContain('first question');
        expect(wire).not.toContain('SECOND_OLD_REPLY');
        expect(wire).not.toContain('ORIGINAL_REPLY');
        expect(wire).not.toContain('old-analysis');
        expect(request.messages.filter(m => m.role === 'tool')).toHaveLength(0);

        // Composer draft preserved.
        const draft = await page.evaluate(() => document.querySelector('#send_textarea')?.value ?? '');
        expect(draft).toBe('unsent draft text');
    });

    test('generates a reply when the last message is a user message', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterInFreshChat(page, characterName);
        await enableOpenAi(page);
        await installGenerationStub(page, {
            responses: [
                { content: 'FIRST_REPLY' },
                { content: 'FOLLOWUP_REPLY' },
            ],
        });

        await sendUserAndGenerate(page, 'first question');
        await page.evaluate(async () => {
            const script = await import('/script.js');
            await script.sendMessageAsUser('second question');
        });

        await clickRegenerateMenuItem(page);
        await waitForRegenerateSettled(page);

        const snapshot = await chatSnapshot(page);
        expect(snapshot.filter(m => m.is_user)).toHaveLength(2);
        expect(snapshot.at(-1).is_user).toBe(false);
        expect(snapshot.at(-1).mes).toContain('FOLLOWUP_REPLY');

        const request = await page.evaluate(() => window.__emberdeskRegenerateRequests.at(-1));
        const wire = JSON.stringify(request.messages);
        expect(wire).toContain('second question');
        expect(wire).toContain('FIRST_REPLY');
    });

    test('restores the previous reply when regeneration fails outright', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterInFreshChat(page, characterName);
        await enableOpenAi(page);
        await installGenerationStub(page, {
            responses: [
                { content: 'KEEP_ME_REPLY' },
                { status: 500 },
                { status: 500 },
                { status: 500 },
            ],
        });

        await sendUserAndGenerate(page, 'first question');
        const snapshotBefore = await chatSnapshot(page);
        expect(snapshotBefore.at(-1).mes).toContain('KEEP_ME_REPLY');

        await clickRegenerateMenuItem(page);
        await waitForRegenerateSettled(page);

        // All retry attempts failed → the old turn is back verbatim, and the
        // failure attempt left no extra rows behind.
        const snapshotAfter = await chatSnapshot(page);
        expect(snapshotAfter).toHaveLength(snapshotBefore.length);
        expect(snapshotAfter.at(-1).mes).toContain('KEEP_ME_REPLY');
        expect(snapshotAfter.filter(m => m.is_user)).toHaveLength(snapshotBefore.filter(m => m.is_user).length);

        // Bounded recovery attempted more than the single primary request.
        const requestCount = await page.evaluate(() => window.__emberdeskRegenerateRequests.length);
        expect(requestCount).toBeGreaterThanOrEqual(2);
    });

    test('keeps the partial new reply when the user stops mid-stream', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterInFreshChat(page, characterName);
        await enableOpenAi(page, { streamOpenAi: true });
        await installGenerationStub(page, {
            responses: [
                { content: 'OLD_REPLY' },
                // Two chunks: the streaming FPS throttle drops the first
                // progress write when it lands inside the tick interval, so
                // a single-chunk stream would never paint its partial text.
                { chunks: ['PART1_', 'PARTIAL_NEW_'], keepOpenAfterChunks: true, delayMs: 120 },
            ],
        });

        await sendUserAndGenerate(page, 'first question');
        expect(await lastMessageText(page)).toContain('OLD_REPLY');

        await clickRegenerateMenuItem(page);
        // Wait for the partial chunk to render, then click stop.
        await expect.poll(async () => {
            const text = await lastMessageText(page);
            return text.includes('PARTIAL_NEW_');
        }).toBe(true);
        await page.evaluate(async () => {
            const script = await import('/script.js');
            script.stopGeneration();
        });
        await waitForRegenerateSettled(page);

        const text = await lastMessageText(page);
        expect(text).toContain('PARTIAL_NEW_');
        expect(text).not.toContain('OLD_REPLY');
    });

    test('disables the menu item while a generation is in flight', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterInFreshChat(page, characterName);
        await enableOpenAi(page, { streamOpenAi: true });
        await installGenerationStub(page, {
            responses: [
                { content: 'OLD_REPLY' },
                { chunks: ['hang'], keepOpenAfterChunks: true, delayMs: 40 },
            ],
        });

        await sendUserAndGenerate(page, 'first question');

        await clickRegenerateMenuItem(page);
        await expect(page.locator('body')).toHaveAttribute('data-generating', 'true');

        await page.locator('#options_button').click();
        const item = page.locator('#option_regenerate');
        await expect(item).toBeVisible();
        const disabled = await item.evaluate(element => (
            element.disabled === true
            || element.getAttribute('aria-disabled') === 'true'
            || element.hasAttribute('disabled')
        ));
        expect(disabled).toBe(true);

        // Clean up: stop the in-flight generation.
        await page.keyboard.press('Escape');
        await page.evaluate(async () => {
            const script = await import('/script.js');
            script.stopGeneration();
        });
        await waitForRegenerateSettled(page);
    });

    test('never fires send_if_empty and never adds a synthetic user message', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterInFreshChat(page, characterName);
        await enableOpenAi(page);
        await installGenerationStub(page, {
            responses: [
                { content: 'ORIGINAL_REPLY' },
                { content: 'REGENERATED_REPLY' },
            ],
        });

        await sendUserAndGenerate(page, 'first question');
        const baseSnapshot = await chatSnapshot(page);

        // A configured send_if_empty must not leak into a regenerate — the
        // composer is not part of this flow at all.
        await page.evaluate(() => {
            window.SillyTavern.getContext().chatCompletionSettings.send_if_empty = 'SENTINEL_EMPTY_TEXT';
        });

        await clickRegenerateMenuItem(page);
        await waitForRegenerateSettled(page);

        const snapshot = await chatSnapshot(page);
        expect(snapshot).toHaveLength(baseSnapshot.length);
        expect(snapshot.filter(m => m.is_user)).toHaveLength(baseSnapshot.filter(m => m.is_user).length);
        expect(snapshot.every(m => !m.mes.includes('SENTINEL_EMPTY_TEXT'))).toBe(true);
        expect(snapshot.at(-1).mes).toContain('REGENERATED_REPLY');

        const request = await page.evaluate(() => window.__emberdeskRegenerateRequests.at(-1));
        expect(JSON.stringify(request.messages)).not.toContain('SENTINEL_EMPTY_TEXT');
    });

    test('leaves a pending file attachment untouched', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterInFreshChat(page, characterName);
        await enableOpenAi(page);
        await installGenerationStub(page, {
            responses: [
                { content: 'ORIGINAL_REPLY' },
                { content: 'REGENERATED_REPLY' },
            ],
        });

        await sendUserAndGenerate(page, 'first question');
        const baseSnapshot = await chatSnapshot(page);

        // Stage a pending attachment in the send form — regenerate must not
        // materialize it into a user message or consume it.
        await page.evaluate(() => {
            const transfer = new DataTransfer();
            transfer.items.add(new File(['PENDING_ATTACHMENT_BODY'], 'pending-note.txt', { type: 'text/plain' }));
            const input = document.getElementById('file_form_input');
            input.files = transfer.files;
        });
        expect(await page.evaluate(() => {
            const input = document.getElementById('file_form_input');
            return input.files.length;
        })).toBe(1);

        await clickRegenerateMenuItem(page);
        await waitForRegenerateSettled(page);

        const snapshot = await chatSnapshot(page);
        expect(snapshot).toHaveLength(baseSnapshot.length);
        expect(snapshot.filter(m => m.is_user)).toHaveLength(baseSnapshot.filter(m => m.is_user).length);
        expect(snapshot.at(-1).mes).toContain('REGENERATED_REPLY');

        // Still staged — regenerate did not silently drop or attach the file.
        expect(await page.evaluate(() => {
            const input = document.getElementById('file_form_input');
            return input.files.length;
        })).toBe(1);

        const request = await page.evaluate(() => window.__emberdeskRegenerateRequests.at(-1));
        const wire = JSON.stringify(request.messages);
        expect(wire).not.toContain('pending-note.txt');
        expect(wire).not.toContain('PENDING_ATTACHMENT_BODY');
    });

    test('restores the previous reply in the assistant scratch chat (no chat id)', async ({ page }) => {
        await testSetup.awaitST({ page });
        await enableOpenAi(page);
        await installGenerationStub(page, {
            responses: [
                { content: 'SCRATCH_REPLY' },
                { status: 500 },
                { status: 500 },
                { status: 500 },
            ],
        });

        // Assistant scratch chat: this_chid stays undefined, so the snapshot's
        // chatId normalizes to null — the restore guard used to compare the
        // raw undefined against null and always skip, losing the old reply.
        await page.evaluate(async () => {
            const script = await import('/script.js');
            await script.newAssistantChat();
        });
        await sendUserAndGenerate(page, 'scratch question');
        const snapshotBefore = await chatSnapshot(page);
        expect(snapshotBefore.at(-1).mes).toContain('SCRATCH_REPLY');

        await clickRegenerateMenuItem(page);
        await waitForRegenerateSettled(page);

        const snapshotAfter = await chatSnapshot(page);
        expect(snapshotAfter).toHaveLength(snapshotBefore.length);
        expect(snapshotAfter.at(-1).mes).toContain('SCRATCH_REPLY');
    });

    test('reports unavailable while editing, offline, or without an active chat', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterInFreshChat(page, characterName);
        await enableOpenAi(page);
        await installGenerationStub(page, {
            responses: [{ content: 'REPLY' }],
        });

        await sendUserAndGenerate(page, 'first question');

        const canRegenerate = () => page.evaluate(async () => {
            const script = await import('/script.js');
            return script.canRegenerateLastReply();
        });
        expect(await canRegenerate()).toBe(true);

        // Message edit mode disables it.
        await page.evaluate(async () => {
            const script = await import('/script.js');
            script.setEditedMessageId(0);
        });
        expect(await canRegenerate()).toBe(false);
        await page.evaluate(async () => {
            const script = await import('/script.js');
            script.setEditedMessageId(undefined);
        });
        expect(await canRegenerate()).toBe(true);

        // A disconnected provider disables it.
        await page.evaluate(async () => {
            const script = await import('/script.js');
            script.setOnlineStatus('no_connection');
        });
        expect(await canRegenerate()).toBe(false);
        await page.evaluate(async () => {
            const script = await import('/script.js');
            script.setOnlineStatus('Valid');
        });
        expect(await canRegenerate()).toBe(true);

        // No active chat (nothing selected, empty history) disables it.
        await page.evaluate(async () => {
            const script = await import('/script.js');
            await script.closeCurrentChat();
        });
        expect(await canRegenerate()).toBe(false);
    });
});
