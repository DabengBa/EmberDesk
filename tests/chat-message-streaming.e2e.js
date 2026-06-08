import { test, expect } from '@playwright/test';

import { testSetup } from './frontend/frontent-test-utils.js';

const characterName = 'Dev Character 001';

async function selectCharacterByName(page, name) {
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
}

async function installStreamingFetchStub(page, { chunks, delayMs = 40, keepOpenAfterChunks = false }) {
    await page.evaluate(({ streamChunks, streamDelayMs, keepStreamOpen }) => {
        window.__emberdeskStreamingRequests = [];
        window.__emberdeskStreamingAbortCount = 0;
        window.__emberdeskStreamingOriginalFetch ??= window.fetch.bind(window);

        window.fetch = async (input, init = {}) => {
            const url = typeof input === 'string' ? input : input.url;
            if (!String(url).endsWith('/api/backends/chat-completions/generate')) {
                return window.__emberdeskStreamingOriginalFetch(input, init);
            }

            window.__emberdeskStreamingRequests.push(JSON.parse(String(init.body ?? '{}')));

            const encoder = new TextEncoder();
            const body = new ReadableStream({
                async start(controller) {
                    const abort = () => {
                        window.__emberdeskStreamingAbortCount += 1;
                        try {
                            controller.error(new DOMException('Aborted', 'AbortError'));
                        } catch {
                            // The stream may already be closed.
                        }
                    };

                    init.signal?.addEventListener('abort', abort, { once: true });

                    try {
                        for (const chunk of streamChunks) {
                            if (init.signal?.aborted) {
                                abort();
                                return;
                            }
                            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                                choices: [{
                                    index: 0,
                                    delta: { content: chunk },
                                    finish_reason: null,
                                }],
                            })}\n\n`));
                            await new Promise(resolve => setTimeout(resolve, streamDelayMs));
                        }

                        if (keepStreamOpen) {
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
        };
    }, { streamChunks: chunks, streamDelayMs: delayMs, keepStreamOpen: keepOpenAfterChunks });
}

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

async function startGeneration(page, prompt) {
    await page.evaluate((messageText) => {
        const textarea = document.querySelector('#send_textarea');
        textarea.value = messageText;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        const context = window.SillyTavern.getContext();
        window.__emberdeskStreamingGeneration = context.generate('normal', { automatic_trigger: false })
            .then(result => {
                window.__emberdeskStreamingGenerationResult = String(result ?? '');
                return result;
            })
            .catch(error => {
                window.__emberdeskStreamingGenerationError = String(error?.message ?? error);
                throw error;
            });
    }, prompt);
}

async function waitForGeneration(page, { allowAbort = false } = {}) {
    await page.evaluate(async ({ acceptAbort }) => {
        try {
            await window.__emberdeskStreamingGeneration;
        } catch (error) {
            const message = String(error?.message ?? error);
            if (!acceptAbort || !message.includes('Generation was aborted')) {
                throw error;
            }
        }
    }, { acceptAbort: allowAbort });
}

function lastAssistantRow(page) {
    return page.locator('#chat > .mes[is_user="false"][is_system="false"][mesid]').last();
}

function assistantRowForGeneration(page, rowCountBeforeGeneration) {
    return page.locator(`#chat > .mes[is_user="false"][is_system="false"][mesid="${rowCountBeforeGeneration + 1}"]`);
}

test.describe('chat message streaming', () => {
    test.describe.configure({ mode: 'serial' });

    test('streams partial content into a stable message row and finalizes it', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterByName(page, characterName);
        await enableOpenAiStreaming(page);
        await installStreamingFetchStub(page, {
            chunks: ['Streaming ', 'proof ', 'complete.'],
            delayMs: 35,
        });

        const rowCountBeforeGeneration = await page.locator('#chat > .mes[mesid]').count();
        await startGeneration(page, 'Start a deterministic streaming proof.');

        const streamingRow = assistantRowForGeneration(page, rowCountBeforeGeneration);
        await expect(streamingRow.locator('.mes_text')).toContainText('Streaming');
        const messageId = await streamingRow.getAttribute('mesid');

        await expect(streamingRow.locator('.mes_text')).toContainText('Streaming proof complete.');
        await waitForGeneration(page);
        await expect(page.locator(`#chat > .mes[mesid="${messageId}"]`)).toHaveCount(1);
        await expect(page.locator(`#chat > .mes[mesid="${messageId}"]`).getByRole('button', { name: 'Message Actions' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Abort request' })).not.toBeVisible();

        const request = await page.evaluate(() => window.__emberdeskStreamingRequests.at(-1));
        expect(request.stream).toBe(true);
        expect(request.chat_completion_source).toBe('openai');
    });

    test('stop restores controls without duplicating the streaming row', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterByName(page, characterName);
        await enableOpenAiStreaming(page);
        await installStreamingFetchStub(page, {
            chunks: ['Partial stop proof.'],
            delayMs: 120,
            keepOpenAfterChunks: true,
        });

        const rowCountBeforeGeneration = await page.locator('#chat > .mes[mesid]').count();
        await startGeneration(page, 'Start a deterministic streaming stop proof.');

        const streamingRow = assistantRowForGeneration(page, rowCountBeforeGeneration);
        await expect(streamingRow.locator('.mes_text')).toBeVisible();
        const messageId = await streamingRow.getAttribute('mesid');
        const textBeforeStop = await streamingRow.locator('.mes_text').textContent();
        expect(String(textBeforeStop ?? '').trim().length).toBeGreaterThan(0);

        await expect(page.locator('#mes_stop')).toBeVisible();
        await page.locator('#mes_stop').click();

        await expect(page.locator('#mes_stop')).not.toBeVisible();
        await waitForGeneration(page, { allowAbort: true });
        await expect(page.locator('body')).not.toHaveAttribute('data-generating', 'true');
        await page.locator('#send_textarea').fill('Follow-up after stop.');
        await expect(page.locator('#send_textarea')).toHaveValue('Follow-up after stop.');
        const stoppedRow = page.locator(`#chat > .mes[mesid="${messageId}"]`);
        await expect(stoppedRow).toHaveCount(1);
        const stoppedText = await stoppedRow.locator('.mes_text').textContent();
        expect(String(stoppedText ?? '').trim().length).toBeGreaterThan(0);
        await expect(page.locator(`#chat > .mes[mesid="${messageId}"]`)).toHaveCount(1);

        const abortCount = await page.evaluate(() => window.__emberdeskStreamingAbortCount);
        expect(abortCount).toBeGreaterThanOrEqual(1);
    });
});
