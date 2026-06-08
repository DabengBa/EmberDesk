import { test, expect } from '@playwright/test';

import { testSetup } from './frontend/frontent-test-utils.js';

const characterName = 'Dev Character 001';
const mobileViewports = [
    { name: 'narrow phone', width: 390, height: 844 },
    { name: 'wide mobile', width: 768, height: 1024 },
];

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

async function installStreamingFetchStub(page, { chunks, delayMs = 40, keepOpenAfterChunks = false, failAfterChunks = false }) {
    await page.evaluate(({ streamChunks, streamDelayMs, keepStreamOpen, failAfterChunks }) => {
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

                        if (failAfterChunks) {
                            throw new Error('Deterministic provider failure');
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
    }, { streamChunks: chunks, streamDelayMs: delayMs, keepStreamOpen: keepOpenAfterChunks, failAfterChunks });
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

async function expectReachableControlGeometry(page, selector, label) {
    const geometry = await page.locator(selector).evaluate(element => {
        const rect = element.getBoundingClientRect();
        return {
            width: rect.width,
            height: rect.height,
            bodyScrollWidth: document.documentElement.scrollWidth,
            viewportWidth: window.innerWidth,
        };
    });

    expect(geometry.bodyScrollWidth, `${label} horizontal overflow`).toBeLessThanOrEqual(geometry.viewportWidth + 1);
    expect(geometry.width, `${label} width`).toBeGreaterThanOrEqual(24);
    expect(geometry.height, `${label} height`).toBeGreaterThanOrEqual(24);
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

    test('provider failure leaves a readable recovery path without duplicating rows', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterByName(page, characterName);
        await enableOpenAiStreaming(page);
        await installStreamingFetchStub(page, {
            chunks: ['Failure path partial text.'],
            delayMs: 35,
            failAfterChunks: true,
        });

        const rowCountBeforeGeneration = await page.locator('#chat > .mes[mesid]').count();
        await startGeneration(page, 'Start a deterministic provider failure proof.');
        await waitForGeneration(page, { allowAbort: true });

        const userRow = page.locator(`#chat > .mes[is_user="true"][mesid="${rowCountBeforeGeneration}"]`);
        await expect(userRow.locator('.mes_text')).toContainText('Start a deterministic provider failure proof.');

        const assistantRowsAfterFailure = page.locator(`#chat > .mes[is_user="false"][is_system="false"][mesid="${rowCountBeforeGeneration + 1}"]`);
        await expect(assistantRowsAfterFailure).toHaveCount(1);
        await expect(assistantRowsAfterFailure.locator('.mes_text')).toContainText('Failure path partial text.');

        const recovery = page.getByRole('button', { name: /Retry generation|Continue last message|Send message/ }).first();
        await expect(recovery).toBeVisible();
        await expect(assistantRowsAfterFailure.locator('.generation_failure_notice')).toContainText('Generation failed.');
        await page.locator('#send_textarea').fill('Follow-up after provider failure.');
        await expect(page.locator('#send_textarea')).toHaveValue('Follow-up after provider failure.');
        await expect(page.locator('body')).not.toHaveAttribute('data-generating', 'true');
        await expect.poll(async () => page.evaluate(() => window.SillyTavern.getContext().streamingProcessor === null)).toBe(true);
        await expect(page.locator(`#chat > .mes[mesid="${rowCountBeforeGeneration + 1}"]`)).toHaveCount(1);

        await installStreamingFetchStub(page, {
            chunks: ['Recovered retry text.'],
            delayMs: 35,
        });
        await recovery.click();
        await expect(assistantRowsAfterFailure.locator('.mes_text')).toContainText('Recovered retry text.');
        await waitForGeneration(page);
        await expect(userRow).toHaveCount(1);
        await expect(assistantRowsAfterFailure).toHaveCount(1);
        await expect(page.locator('#chat > .mes[is_user="true"]').filter({ hasText: 'Start a deterministic provider failure proof.' })).toHaveCount(1);
        const retryRequestCount = await page.evaluate(() => window.__emberdeskStreamingRequests.length);
        expect(retryRequestCount).toBe(1);
    });

    test('provider failure before first token still restores retry recovery', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterByName(page, characterName);
        await enableOpenAiStreaming(page);
        await installStreamingFetchStub(page, {
            chunks: [],
            delayMs: 35,
            failAfterChunks: true,
        });

        const rowCountBeforeGeneration = await page.locator('#chat > .mes[mesid]').count();
        await startGeneration(page, 'Start a deterministic pre-token provider failure proof.');
        await waitForGeneration(page);

        const userRow = page.locator(`#chat > .mes[is_user="true"][mesid="${rowCountBeforeGeneration}"]`);
        await expect(userRow.locator('.mes_text')).toContainText('Start a deterministic pre-token provider failure proof.');

        const failedRow = assistantRowForGeneration(page, rowCountBeforeGeneration);
        await expect(failedRow).toHaveCount(1);
        await expect(failedRow.locator('.generation_failure_notice')).toContainText('Generation failed.');
        await expect(failedRow.getByRole('button', { name: 'Retry generation' })).toBeVisible();
        await page.locator('#send_textarea').fill('Follow-up after pre-token provider failure.');
        await expect(page.locator('#send_textarea')).toHaveValue('Follow-up after pre-token provider failure.');
        await expect(page.locator('body')).not.toHaveAttribute('data-generating', 'true');
        await expect.poll(async () => page.evaluate(() => window.SillyTavern.getContext().streamingProcessor === null)).toBe(true);
    });

    test('keeps streaming stop and failure recovery reachable on mobile viewports', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterByName(page, characterName);
        await enableOpenAiStreaming(page);

        for (const viewport of mobileViewports) {
            await page.setViewportSize({ width: viewport.width, height: viewport.height });
            const composer = page.getByRole('textbox', { name: 'Chat message' });
            await expect(composer, `${viewport.name} composer`).toBeVisible();
            await composer.focus();
            await expect(composer, `${viewport.name} composer focus`).toBeFocused();

            await installStreamingFetchStub(page, {
                chunks: [`${viewport.name} stop proof.`],
                delayMs: 120,
                keepOpenAfterChunks: true,
            });
            let rowCountBeforeGeneration = await page.locator('#chat > .mes[mesid]').count();
            await startGeneration(page, `Start ${viewport.name} mobile stop proof.`);
            const streamingRow = assistantRowForGeneration(page, rowCountBeforeGeneration);
            await expect(streamingRow.locator('.mes_text'), `${viewport.name} streaming row`).toBeVisible();
            await expect(page.locator('#mes_stop'), `${viewport.name} stop`).toBeVisible();
            await expectReachableControlGeometry(page, '#mes_stop', `${viewport.name} stop`);
            await page.locator('#mes_stop').click();
            await waitForGeneration(page, { allowAbort: true });
            await expect(page.locator('body')).not.toHaveAttribute('data-generating', 'true');
            await expect(streamingRow, `${viewport.name} stopped row identity`).toHaveCount(1);

            await installStreamingFetchStub(page, {
                chunks: [`${viewport.name} failure recovery text.`],
                delayMs: 35,
                failAfterChunks: true,
            });
            rowCountBeforeGeneration = await page.locator('#chat > .mes[mesid]').count();
            await startGeneration(page, `Start ${viewport.name} mobile provider failure proof.`);
            await waitForGeneration(page, { allowAbort: true });

            const failedRow = assistantRowForGeneration(page, rowCountBeforeGeneration);
            await expect(failedRow.locator('.mes_text')).toContainText(`${viewport.name} failure recovery text.`);
            const retry = failedRow.getByRole('button', { name: 'Retry generation' });
            await expect(retry, `${viewport.name} retry`).toBeVisible();
            await retry.focus();
            await expect(retry, `${viewport.name} retry focus`).toBeFocused();
            await expectReachableControlGeometry(page, `#chat > .mes[mesid="${rowCountBeforeGeneration + 1}"] .generation_failure_retry`, `${viewport.name} retry`);
        }
    });
});
