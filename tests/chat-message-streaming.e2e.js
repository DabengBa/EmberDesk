import { test, expect } from '@playwright/test';

import { testSetup } from './frontend/frontent-test-utils.js';

const characterName = 'Dev Character 001';
const reactMainChatMessageListEnabled = process.env.EMBERDESK_FEATURES_REACT_PANELS_MAINCHATMESSAGELIST === 'true';
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
    const responses = [{ chunks, delayMs, keepOpenAfterChunks, failAfterChunks }];
    await installStreamingFetchSequenceStub(page, { responses });
}

async function installStreamingFetchSequenceStub(page, { responses }) {
    await page.evaluate(({ streamResponses }) => {
        window.__emberdeskStreamingRequests = [];
        window.__emberdeskStreamingAbortCount = 0;
        window.__emberdeskStreamingOriginalFetch ??= window.fetch.bind(window);

        window.fetch = async (input, init = {}) => {
            const url = typeof input === 'string' ? input : input.url;
            if (!String(url).endsWith('/api/backends/chat-completions/generate')) {
                return window.__emberdeskStreamingOriginalFetch(input, init);
            }

            window.__emberdeskStreamingRequests.push(JSON.parse(String(init.body ?? '{}')));
            const responseConfig = streamResponses[Math.min(window.__emberdeskStreamingRequests.length - 1, streamResponses.length - 1)] ?? {};
            const streamChunks = responseConfig.chunks ?? [];
            const streamDelayMs = responseConfig.delayMs ?? 40;
            const keepStreamOpen = Boolean(responseConfig.keepOpenAfterChunks);
            const shouldFailAfterChunks = Boolean(responseConfig.failAfterChunks);

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

                        if (shouldFailAfterChunks) {
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
    }, { streamResponses: responses });
}

async function enableOpenAiStreaming(page, { chatCompletionSource = 'openai' } = {}) {
    await page.evaluate(({ source }) => {
        const context = window.SillyTavern.getContext();
        context.powerUserSettings.stream_fade_in = false;
        context.powerUserSettings.streaming_fps = 60;
        context.chatCompletionSettings.chat_completion_source = source;
        context.chatCompletionSettings.openai_model = 'gpt-4o-mini';
        context.chatCompletionSettings.claude_model = 'claude-sonnet-4-5';
        context.chatCompletionSettings.stream_openai = true;
        context.chatCompletionSettings.n = 1;
        context.chatCompletionSettings.send_if_empty = '';
    }, { source: chatCompletionSource });
    await page.evaluate(async () => {
        const script = await import('/script.js');
        script.changeMainAPI('openai');
        script.setOnlineStatus('Valid');
        script.activateSendButtons();
    });
}

async function enableFallbackProvider(page) {
    await page.evaluate(async () => {
        const context = window.SillyTavern.getContext();
        context.chatCompletionSettings.fallback_provider_enabled = true;
        context.chatCompletionSettings.fallback_provider_base_url = 'https://fallback.example/v1';
        context.chatCompletionSettings.fallback_provider_model = 'fallback-model';
        const secrets = await import('/scripts/secrets.js');
        secrets.secret_state[secrets.SECRET_KEYS.OPENAI_FALLBACK] = true;
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

async function startContinueGeneration(page) {
    await page.evaluate(() => {
        const context = window.SillyTavern.getContext();
        window.__emberdeskStreamingGeneration = context.generate('continue', { automatic_trigger: false })
            .then(result => {
                window.__emberdeskStreamingGenerationResult = String(result ?? '');
                return result;
            })
            .catch(error => {
                window.__emberdeskStreamingGenerationError = String(error?.message ?? error);
                throw error;
            });
    });
}

async function startRightSwipeGeneration(page, messageId) {
    await page.evaluate(async (targetMessageId) => {
        const script = await import('/script.js');
        const { SWIPE_DIRECTION } = await import('/scripts/constants.js');
        window.__emberdeskStreamingGeneration = script.swipe(null, SWIPE_DIRECTION.RIGHT, { forceMesId: targetMessageId })
            .then(result => {
                window.__emberdeskStreamingGenerationResult = String(result ?? '');
                return result;
            })
            .catch(error => {
                window.__emberdeskStreamingGenerationError = String(error?.message ?? error);
                throw error;
            });
    }, messageId);
}

async function waitForGeneration(page, { allowAbort = false, allowFailure = false } = {}) {
    await page.evaluate(async ({ acceptAbort, acceptFailure }) => {
        try {
            await window.__emberdeskStreamingGeneration;
        } catch (error) {
            const message = String(error?.message ?? error);
            const acceptedAbort = acceptAbort && message.includes('Generation was aborted');
            const acceptedFailure = acceptFailure && (
                message.includes('stream connection closed before completion')
                || message.includes('empty reply')
            );
            if (!acceptedAbort && !acceptedFailure) {
                throw error;
            }
        }
    }, { acceptAbort: allowAbort, acceptFailure: allowFailure });
}

async function waitForSlashCommandExecution(page) {
    return page.evaluate(async () => {
        await window.__emberdeskSlashExecutionPromise;
        return {
            result: window.__emberdeskSlashExecutionResult ?? null,
            error: window.__emberdeskSlashExecutionError ?? null,
        };
    });
}

async function installMessageEventCounters(page) {
    await page.evaluate(async () => {
        const script = await import('/script.js');
        const context = window.SillyTavern.getContext();
        window.__emberdeskStreamingMessageEvents = [];
        window.__emberdeskStreamingRenderedEvents = [];
        context.eventSource.on(script.event_types.MESSAGE_RECEIVED, (messageId, type) => {
            window.__emberdeskStreamingMessageEvents.push({ messageId, type });
        });
        context.eventSource.on(script.event_types.CHARACTER_MESSAGE_RENDERED, (messageId, type) => {
            window.__emberdeskStreamingRenderedEvents.push({ messageId, type });
        });
    });
}

async function installRecoveryStatusRecorder(page) {
    await page.evaluate(() => {
        window.__emberdeskStreamingRecoveryStatuses = [];
        const recordStatuses = () => {
            for (const element of document.querySelectorAll('.generation_auto_recovery_status')) {
                const text = String(element.textContent ?? '').trim();
                if (text && !window.__emberdeskStreamingRecoveryStatuses.includes(text)) {
                    window.__emberdeskStreamingRecoveryStatuses.push(text);
                }
            }
        };
        window.__emberdeskStreamingRecoveryStatusObserver?.disconnect?.();
        window.__emberdeskStreamingRecoveryStatusObserver = new MutationObserver(recordStatuses);
        window.__emberdeskStreamingRecoveryStatusObserver.observe(document.querySelector('#chat'), {
            childList: true,
            subtree: true,
            characterData: true,
        });
        recordStatuses();
    });
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

async function expectMainChatStreamingTransportState(page, expectations = {}) {
    const controller = page.locator('[data-main-chat-message-list-controller="true"]');

    if (!reactMainChatMessageListEnabled) {
        await expect(controller).toHaveCount(0);
        return;
    }

    await expect(controller).toHaveCount(1);

    if (expectations.phase !== undefined) {
        const phases = Array.isArray(expectations.phase) ? expectations.phase : [expectations.phase];
        await expect.poll(async () => (
            await controller.getAttribute('data-main-chat-streaming-transport-phase')
        ) ?? '').toMatch(createExactValuePattern(phases));
    }

    if (expectations.tokenCountAtLeast !== undefined) {
        await expect.poll(async () => {
            const value = await controller.getAttribute('data-main-chat-streaming-transport-tokens');
            return Number(value ?? '-1');
        }).toBeGreaterThanOrEqual(expectations.tokenCountAtLeast);
    }

    if (expectations.generationPhase !== undefined) {
        const phases = Array.isArray(expectations.generationPhase) ? expectations.generationPhase : [expectations.generationPhase];
        await expect.poll(async () => (
            await controller.getAttribute('data-main-chat-generation-control-phase')
        ) ?? '').toMatch(createExactValuePattern(phases));
    }

    if (expectations.expectFallback !== undefined || expectations.messageId !== undefined) {
        if (expectations.messageId !== undefined) {
            await expect(controller).toHaveAttribute('data-main-chat-streaming-transport-message-id', String(expectations.messageId));
        }

        if (expectations.expectFallback !== undefined) {
            await expect(controller).toHaveAttribute('data-main-chat-streaming-transport-fallback', expectations.expectFallback ? 'true' : 'false');
        }
    }
}

function createExactValuePattern(values) {
    return new RegExp(`^(?:${values.map(value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$`);
}

async function expectMainChatComposerState(page, expectations = {}) {
    const controller = page.locator('[data-main-chat-message-list-controller="true"]');

    if (!reactMainChatMessageListEnabled) {
        await expect(controller).toHaveCount(0);
        return;
    }

    await expect(controller).toHaveCount(1);

    if (expectations.length !== undefined) {
        await expect(controller).toHaveAttribute('data-main-chat-composer-length', String(expectations.length));
    }

    if (expectations.empty !== undefined) {
        await expect(controller).toHaveAttribute('data-main-chat-composer-empty', expectations.empty ? 'true' : 'false');
    }

    if (expectations.canSubmit !== undefined) {
        await expect(controller).toHaveAttribute('data-main-chat-composer-can-submit', expectations.canSubmit ? 'true' : 'false');
    }

    if (expectations.focused !== undefined) {
        await expect(controller).toHaveAttribute('data-main-chat-composer-focused', expectations.focused ? 'true' : 'false');
    }

    if (expectations.disabled !== undefined) {
        await expect(controller).toHaveAttribute('data-main-chat-composer-disabled', expectations.disabled ? 'true' : 'false');
    }

    if (expectations.generating !== undefined) {
        await expect(controller).toHaveAttribute('data-main-chat-composer-generating', expectations.generating ? 'true' : 'false');
    }

    if (expectations.context !== undefined) {
        await expect(controller).toHaveAttribute('data-main-chat-composer-context', expectations.context);
    }
}

async function expectMainChatSlashCommandState(page, expectations = {}) {
    const controller = page.locator('[data-main-chat-message-list-controller="true"]');

    if (!reactMainChatMessageListEnabled) {
        await expect(controller).toHaveCount(0);
        return;
    }

    await expect(controller).toHaveCount(1);

    if (expectations.active !== undefined) {
        await expect(controller).toHaveAttribute('data-main-chat-slash-command-active', expectations.active ? 'true' : 'false');
    }

    if (expectations.queryLength !== undefined) {
        await expect(controller).toHaveAttribute('data-main-chat-slash-command-query-length', String(expectations.queryLength));
    }

    if (expectations.autocomplete !== undefined) {
        await expect(controller).toHaveAttribute('data-main-chat-slash-command-autocomplete', expectations.autocomplete ? 'visible' : 'hidden');
    }

    if (expectations.executing !== undefined) {
        await expect(controller).toHaveAttribute('data-main-chat-slash-command-executing', expectations.executing ? 'true' : 'false');
    }

    if (expectations.paused !== undefined) {
        await expect(controller).toHaveAttribute('data-main-chat-slash-command-paused', expectations.paused ? 'true' : 'false');
    }

    if (expectations.aborted !== undefined) {
        await expect(controller).toHaveAttribute('data-main-chat-slash-command-aborted', expectations.aborted ? 'true' : 'false');
    }

    if (expectations.error !== undefined) {
        await expect(controller).toHaveAttribute('data-main-chat-slash-command-error', expectations.error);
    }
}

test.describe('chat message streaming', () => {
    test.describe.configure({ mode: 'serial' });

    test('streams partial content into a stable message row and finalizes it', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterByName(page, characterName);
        await enableOpenAiStreaming(page);
        await installStreamingFetchStub(page, {
            chunks: ['Streaming ', 'proof ', 'complete.'],
            delayMs: 120,
        });

        const rowCountBeforeGeneration = await page.locator('#chat > .mes[mesid]').count();
        await startGeneration(page, 'Start a deterministic streaming proof.');

        const streamingRow = assistantRowForGeneration(page, rowCountBeforeGeneration);
        await expect(streamingRow.locator('.mes_text')).toContainText('Streaming');
        const messageId = await streamingRow.getAttribute('mesid');
        await expectMainChatStreamingTransportState(page, {
            tokenCountAtLeast: 1,
            messageId: Number(messageId),
            expectFallback: false,
        });

        await expect(streamingRow.locator('.mes_text')).toContainText('Streaming proof complete.');
        await waitForGeneration(page);
        await expectMainChatStreamingTransportState(page, {
            phase: 'completed',
            generationPhase: ['completed', 'idle'],
            tokenCountAtLeast: 1,
            messageId: Number(messageId),
            expectFallback: false,
        });
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
        await installMessageEventCounters(page);
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
        await expectMainChatStreamingTransportState(page, {
            phase: 'streaming',
            generationPhase: 'streaming',
            tokenCountAtLeast: 1,
            messageId: Number(messageId),
            expectFallback: false,
        });

        await expect(page.locator('#mes_stop')).toBeVisible();
        await expect.poll(async () => page.evaluate(() => window.SillyTavern.getContext().streamingProcessor?.observedTokenCount ?? 0))
            .toBeGreaterThanOrEqual(1);
        const stopped = await page.evaluate(async () => {
            const script = await import('/script.js');
            return script.stopGeneration();
        });
        expect(stopped).toBe(true);
        await expectMainChatStreamingTransportState(page, {
            phase: 'stopped',
            messageId: Number(messageId),
            expectFallback: false,
        });

        await expect(page.locator('#mes_stop')).not.toBeVisible();
        await waitForGeneration(page, { allowAbort: true });
        await expectMainChatStreamingTransportState(page, {
            phase: ['stopped', 'idle'],
            generationPhase: ['stopped', 'idle'],
            tokenCountAtLeast: 1,
            messageId: Number(messageId),
            expectFallback: false,
        });
        await expect(page.locator('body')).not.toHaveAttribute('data-generating', 'true');
        await page.locator('#send_textarea').fill('Follow-up after stop.');
        await expect(page.locator('#send_textarea')).toHaveValue('Follow-up after stop.');
        await expectMainChatComposerState(page, {
            length: 'Follow-up after stop.'.length,
            empty: false,
            canSubmit: true,
            focused: true,
            generating: false,
            context: 'character',
        });
        const stoppedRow = page.locator(`#chat > .mes[mesid="${messageId}"]`);
        await expect(stoppedRow).toHaveCount(1);
        const stoppedText = await stoppedRow.locator('.mes_text').textContent();
        expect(String(stoppedText ?? '').trim().length).toBeGreaterThan(0);
        await expect(page.locator(`#chat > .mes[mesid="${messageId}"]`)).toHaveCount(1);

        const abortCount = await page.evaluate(() => window.__emberdeskStreamingAbortCount);
        expect(abortCount).toBeGreaterThanOrEqual(1);
        const requestCount = await page.evaluate(() => window.__emberdeskStreamingRequests.length);
        const messageEvents = await page.evaluate(() => window.__emberdeskStreamingMessageEvents);
        const renderedEvents = await page.evaluate(() => window.__emberdeskStreamingRenderedEvents);
        expect(requestCount).toBe(1);
        expect(messageEvents).toHaveLength(0);
        expect(renderedEvents).toHaveLength(0);
    });

    test('composer keeps newline, send, clear, and empty-submit behavior legacy-owned', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterByName(page, characterName);
        await enableOpenAiStreaming(page);
        await installStreamingFetchStub(page, {
            chunks: ['Composer proof complete.'],
            delayMs: 35,
        });

        const composer = page.getByRole('textbox', { name: 'Chat message' });
        const userRowCountBeforeSend = await page.locator('#chat > .mes[is_user="true"]').count();

        await composer.focus();
        await expect(composer).toBeFocused();
        await expectMainChatComposerState(page, {
            length: 0,
            empty: true,
            canSubmit: false,
            focused: true,
            disabled: false,
            generating: false,
            context: 'character',
        });

        await composer.pressSequentially('Line one');
        await composer.press('Shift+Enter');
        await composer.pressSequentially('Line two');
        await expect(composer).toHaveValue('Line one\nLine two');
        await expectMainChatComposerState(page, {
            length: 'Line one\nLine two'.length,
            empty: false,
            canSubmit: true,
            focused: true,
            context: 'character',
        });

        await page.locator('#send_but').click();
        await expect(composer).toHaveValue('');
        await expectMainChatComposerState(page, {
            length: 0,
            empty: true,
            canSubmit: false,
            generating: true,
            context: 'character',
        });

        await waitForGeneration(page);
        await expectMainChatComposerState(page, {
            length: 0,
            empty: true,
            canSubmit: false,
            focused: true,
            generating: false,
            context: 'character',
        });
        await expect(page.locator('#chat > .mes[is_user="true"]').filter({ hasText: 'Line one' })).toHaveCount(1);
        await expect(page.locator('#chat > .mes[is_user="true"]').filter({ hasText: 'Line two' })).toHaveCount(1);
        await expect(page.locator('#chat > .mes[is_user="true"]')).toHaveCount(userRowCountBeforeSend + 1);

        const userRowCountBeforeEmptyClick = await page.locator('#chat > .mes[is_user="true"]').count();
        await page.locator('#send_but').click();
        await page.waitForTimeout(150);
        await expect(page.locator('#chat > .mes[is_user="true"]')).toHaveCount(userRowCountBeforeEmptyClick);
        await expectMainChatComposerState(page, {
            length: 0,
            empty: true,
            canSubmit: false,
            focused: true,
            generating: false,
            context: 'character',
        });
    });

    test('slash-command bridge observes autocomplete, execution, pause, continue, and abort without owning the executor', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterByName(page, characterName);

        await page.evaluate(async () => {
            const { power_user } = await import('/scripts/power-user.js');
            const { AUTOCOMPLETE_STATE } = await import('/scripts/autocomplete/AutoComplete.js');
            power_user.stscript.autocomplete.state = AUTOCOMPLETE_STATE.ALWAYS;
        });

        const composer = page.getByRole('textbox', { name: 'Chat message' });
        await composer.focus();
        await composer.pressSequentially('/e');
        await expectMainChatSlashCommandState(page, {
            active: true,
            queryLength: 1,
            autocomplete: true,
            executing: false,
            paused: false,
            aborted: false,
            error: '',
        });

        await composer.fill('normal text');
        await expectMainChatSlashCommandState(page, {
            active: false,
            queryLength: 0,
            autocomplete: false,
            executing: false,
            paused: false,
            aborted: false,
            error: '',
        });

        const scriptText = '/delay 400 | /delay 400 | /echo ready';
        await composer.fill(scriptText);
        await page.evaluate(async (text) => {
            const { executeSlashCommandsOnChatInput } = await import('/scripts/slash-commands.js');
            window.__emberdeskSlashExecutionResult = null;
            window.__emberdeskSlashExecutionError = null;
            window.__emberdeskSlashExecutionPromise = executeSlashCommandsOnChatInput(text, { clearChatInput: false })
                .then(result => {
                    window.__emberdeskSlashExecutionResult = {
                        isError: Boolean(result?.isError),
                        isAborted: Boolean(result?.isAborted),
                        errorMessage: result?.errorMessage ?? null,
                        abortReason: result?.abortReason ?? null,
                    };
                    return result;
                })
                .catch(error => {
                    window.__emberdeskSlashExecutionError = String(error?.message ?? error);
                    throw error;
                });
        }, scriptText);

        await expectMainChatSlashCommandState(page, {
            active: true,
            queryLength: 5,
            executing: true,
            paused: false,
            aborted: false,
            error: '',
        });

        await page.evaluate(async () => {
            const { pauseScriptExecution } = await import('/scripts/slash-commands.js');
            pauseScriptExecution();
        });
        await expectMainChatSlashCommandState(page, {
            active: true,
            queryLength: 5,
            executing: true,
            paused: true,
            aborted: false,
            error: '',
        });

        await page.evaluate(async () => {
            const { pauseScriptExecution } = await import('/scripts/slash-commands.js');
            pauseScriptExecution();
        });
        await expectMainChatSlashCommandState(page, {
            active: true,
            queryLength: 5,
            executing: true,
            paused: false,
            aborted: false,
            error: '',
        });

        await page.evaluate(async () => {
            const { stopScriptExecution } = await import('/scripts/slash-commands.js');
            stopScriptExecution();
        });
        await waitForSlashCommandExecution(page);
        await expectMainChatSlashCommandState(page, {
            active: true,
            queryLength: 5,
            executing: false,
            paused: false,
            aborted: true,
            error: '',
        });

        const slashExecution = await page.evaluate(() => window.__emberdeskSlashExecutionResult);
        expect(slashExecution).toEqual(expect.objectContaining({
            isError: false,
            isAborted: true,
        }));

        await composer.fill('back to normal text');
        await expectMainChatSlashCommandState(page, {
            active: false,
            queryLength: 0,
            autocomplete: false,
            executing: false,
            paused: false,
            aborted: true,
            error: '',
        });
        await page.waitForTimeout(1300);
        await expectMainChatSlashCommandState(page, {
            active: false,
            queryLength: 0,
            autocomplete: false,
            executing: false,
            paused: false,
            aborted: false,
            error: '',
        });
    });

    test('auto retries primary failures once, switches to fallback, and keeps one assistant row', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterByName(page, characterName);
        await enableOpenAiStreaming(page);
        await enableFallbackProvider(page);
        await installMessageEventCounters(page);
        await installRecoveryStatusRecorder(page);
        await installStreamingFetchSequenceStub(page, {
            responses: [
                { chunks: ['Discarded primary partial.'], delayMs: 50, failAfterChunks: true },
                { chunks: [], delayMs: 50 },
                { chunks: ['Fallback recovery complete.'], delayMs: 50 },
            ],
        });

        const rowCountBeforeGeneration = await page.locator('#chat > .mes[mesid]').count();
        await startGeneration(page, 'Start a deterministic fallback recovery proof.');
        const assistantRow = assistantRowForGeneration(page, rowCountBeforeGeneration);
        await expectMainChatStreamingTransportState(page, {
            phase: ['streaming', 'completed'],
            generationPhase: ['recoveringFallback', 'completed', 'idle'],
            tokenCountAtLeast: 1,
            messageId: rowCountBeforeGeneration + 1,
            expectFallback: true,
        });

        await expect(assistantRow.locator('.mes_text')).toContainText('Fallback recovery complete.');
        await waitForGeneration(page);
        await expectMainChatStreamingTransportState(page, {
            phase: 'completed',
            generationPhase: ['completed', 'idle'],
            tokenCountAtLeast: 1,
            messageId: rowCountBeforeGeneration + 1,
            expectFallback: true,
        });
        const statusHistory = await page.evaluate(() => window.__emberdeskStreamingRecoveryStatuses);
        expect(statusHistory).toContain('正在重试');
        expect(statusHistory).toContain('正在使用备用服务商');

        const userRows = page.locator('#chat > .mes[is_user="true"]').filter({ hasText: 'Start a deterministic fallback recovery proof.' });
        await expect(userRows).toHaveCount(1);
        await expect(assistantRow).toHaveCount(1);
        await expect(assistantRow.locator('.mes_text')).not.toContainText('Discarded primary partial.');
        await expect(assistantRow.locator('.generation_auto_recovery_status')).toHaveCount(0);
        await expect(assistantRow.getByRole('button', { name: 'Retry generation' })).toHaveCount(0);

        const requests = await page.evaluate(() => window.__emberdeskStreamingRequests);
        expect(requests).toHaveLength(3);
        expect(requests[0].chat_completion_source).toBe('openai');
        expect(requests[1].chat_completion_source).toBe('openai');
        expect(requests[2].chat_completion_source).toBe('openai');
        expect(requests[2].custom_url).toBe('https://fallback.example/v1');
        expect(requests[2].model).toBe('fallback-model');
        expect(requests[2].openai_secret_marker).toBe('openai_fallback_provider');
        expect(requests[2].reverse_proxy ?? '').toBe('');
        expect(requests[2].proxy_password ?? '').toBe('');

        const finalEvents = await page.evaluate(() => ({
            message: window.__emberdeskStreamingMessageEvents,
            rendered: window.__emberdeskStreamingRenderedEvents,
        }));
        expect(finalEvents.message).toEqual([{ messageId: rowCountBeforeGeneration + 1, type: 'normal' }]);
        expect(finalEvents.rendered).toEqual([{ messageId: rowCountBeforeGeneration + 1, type: 'normal' }]);
    });

    test('parses fallback stream with fallback source when primary source has a different stream shape', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterByName(page, characterName);
        await enableOpenAiStreaming(page, { chatCompletionSource: 'claude' });
        await enableFallbackProvider(page);
        await installStreamingFetchSequenceStub(page, {
            responses: [
                { chunks: [], delayMs: 30, failAfterChunks: true },
                { chunks: [], delayMs: 30, failAfterChunks: true },
                { chunks: ['Fallback OpenAI stream parsed.'], delayMs: 30 },
            ],
        });

        const rowCountBeforeGeneration = await page.locator('#chat > .mes[mesid]').count();
        await startGeneration(page, 'Start a fallback parser proof.');
        const assistantRow = assistantRowForGeneration(page, rowCountBeforeGeneration);

        await expect(assistantRow.locator('.mes_text')).toContainText('Fallback OpenAI stream parsed.');
        await waitForGeneration(page);

        const requests = await page.evaluate(() => window.__emberdeskStreamingRequests);
        expect(requests).toHaveLength(3);
        expect(requests[0].chat_completion_source).toBe('claude');
        expect(requests[1].chat_completion_source).toBe('claude');
        expect(requests[2].chat_completion_source).toBe('openai');
        expect(requests[2].openai_secret_marker).toBe('openai_fallback_provider');
    });

    test('stop does not enter the auto recovery chain', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterByName(page, characterName);
        await enableOpenAiStreaming(page);
        await enableFallbackProvider(page);
        await installStreamingFetchSequenceStub(page, {
            responses: [
                { chunks: ['Partial stop with fallback configured.'], delayMs: 120, keepOpenAfterChunks: true },
                { chunks: ['Unexpected retry.'], delayMs: 20 },
            ],
        });

        await startGeneration(page, 'Start a stop without retry proof.');
        await expect(page.locator('#mes_stop')).toBeVisible();
        await expect.poll(async () => page.evaluate(() => window.__emberdeskStreamingRequests.length)).toBe(1);

        await page.locator('#mes_stop').click();
        await waitForGeneration(page, { allowAbort: true });
        await expect(page.locator('#chat > .mes[is_user="false"][is_system="false"][mesid]').filter({ hasText: 'Unexpected retry.' })).toHaveCount(0);
        await expect(page.locator('.generation_auto_recovery_status')).toHaveCount(0);

        const requestCount = await page.evaluate(() => window.__emberdeskStreamingRequests.length);
        expect(requestCount).toBe(1);
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
        await waitForGeneration(page, { allowFailure: true });
        await expectMainChatStreamingTransportState(page, {
            phase: 'error',
            generationPhase: 'error',
            messageId: rowCountBeforeGeneration + 1,
            expectFallback: false,
        });

        const userRow = page.locator(`#chat > .mes[is_user="true"][mesid="${rowCountBeforeGeneration}"]`);
        await expect(userRow.locator('.mes_text')).toContainText('Start a deterministic provider failure proof.');

        const assistantRowsAfterFailure = page.locator(`#chat > .mes[is_user="false"][is_system="false"][mesid="${rowCountBeforeGeneration + 1}"]`);
        await expect(assistantRowsAfterFailure).toHaveCount(1);
        await expect(assistantRowsAfterFailure.locator('.mes_text')).not.toContainText('Failure path partial text.');

        const recovery = page.getByRole('button', { name: /Retry generation|Continue last message|Send message/ }).first();
        await expect(recovery).toBeVisible();
        await expect(assistantRowsAfterFailure.locator('.generation_failure_notice')).toContainText('Generation failed.');
        await page.locator('#send_textarea').fill('Follow-up after provider failure.');
        await expect(page.locator('#send_textarea')).toHaveValue('Follow-up after provider failure.');
        await expect(page.locator('body')).not.toHaveAttribute('data-generating', 'true');
        await expect.poll(async () => page.evaluate(() => window.SillyTavern.getContext().streamingProcessor === null)).toBe(true);
        await expectMainChatComposerState(page, {
            length: 'Follow-up after provider failure.'.length,
            empty: false,
            canSubmit: true,
            focused: true,
            generating: false,
            context: 'character',
        });
        await expect(page.locator(`#chat > .mes[mesid="${rowCountBeforeGeneration + 1}"]`)).toHaveCount(1);
        const failedAttemptRequestCount = await page.evaluate(() => window.__emberdeskStreamingRequests.length);
        expect(failedAttemptRequestCount).toBe(2);

        await installStreamingFetchStub(page, {
            chunks: ['Recovered retry text.'],
            delayMs: 35,
        });
        await recovery.click();
        await expect(assistantRowsAfterFailure.locator('.mes_text')).toContainText('Recovered retry text.');
        await expect(page.locator('body')).not.toHaveAttribute('data-generating', 'true');
        await expect.poll(async () => page.evaluate(() => window.SillyTavern.getContext().streamingProcessor === null)).toBe(true);
        await expect(userRow).toHaveCount(1);
        await expect(assistantRowsAfterFailure).toHaveCount(1);
        await expect(page.locator('#chat > .mes[is_user="true"]').filter({ hasText: 'Start a deterministic provider failure proof.' })).toHaveCount(1);
        const retryRequestCount = await page.evaluate(() => window.__emberdeskStreamingRequests.length);
        expect(retryRequestCount).toBe(1);
    });

    test('primary failure retries then fallback success reuses the same assistant row and clears partial text', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterByName(page, characterName);
        await enableOpenAiStreaming(page);
        await enableFallbackProvider(page);
        await installMessageEventCounters(page);
        await installStreamingFetchSequenceStub(page, {
            responses: [
                { chunks: ['Primary partial text.'], delayMs: 30, failAfterChunks: true },
                { chunks: [], delayMs: 30 },
                { chunks: ['Fallback final reply.'], delayMs: 30 },
            ],
        });

        const rowCountBeforeGeneration = await page.locator('#chat > .mes[mesid]').count();
        await startGeneration(page, 'Start a deterministic fallback recovery proof.');
        await waitForGeneration(page);

        const userRow = page.locator(`#chat > .mes[is_user="true"][mesid="${rowCountBeforeGeneration}"]`);
        const assistantRow = assistantRowForGeneration(page, rowCountBeforeGeneration);
        const duplicateAssistantRow = page.locator(`#chat > .mes[is_user="false"][is_system="false"][mesid="${rowCountBeforeGeneration + 2}"]`);

        await expect(userRow.locator('.mes_text')).toContainText('Start a deterministic fallback recovery proof.');
        await expect(assistantRow).toHaveCount(1);
        await expect(assistantRow.locator('.mes_text')).toContainText('Fallback final reply.');
        await expect(assistantRow.locator('.mes_text')).not.toContainText('Primary partial text.');
        await expect(duplicateAssistantRow).toHaveCount(0);
        await expect(assistantRow.getByRole('button', { name: 'Retry generation' })).not.toBeVisible();

        const requestBodies = await page.evaluate(() => window.__emberdeskStreamingRequests);
        expect(requestBodies).toHaveLength(3);
        expect(requestBodies[0].chat_completion_source).toBe('openai');
        expect(requestBodies[1].chat_completion_source).toBe('openai');
        expect(requestBodies[2].openai_secret_marker).toBe('openai_fallback_provider');
        expect(requestBodies[2].custom_url).toBe('https://fallback.example/v1');
        expect(requestBodies[2].model).toBe('fallback-model');
        expect(requestBodies[2]).not.toHaveProperty('reverse_proxy');
        expect(requestBodies[2]).not.toHaveProperty('proxy_password');

        const messageEvents = await page.evaluate(() => window.__emberdeskStreamingMessageEvents);
        const renderedEvents = await page.evaluate(() => window.__emberdeskStreamingRenderedEvents);
        expect(messageEvents).toHaveLength(1);
        expect(renderedEvents).toHaveLength(1);
        expect(messageEvents[0].messageId).toBe(rowCountBeforeGeneration + 1);
        expect(renderedEvents[0].messageId).toBe(rowCountBeforeGeneration + 1);
    });

    test('recovered overswipe appends a new swipe without replacing the existing swipe', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterByName(page, characterName);
        await enableOpenAiStreaming(page);
        await enableFallbackProvider(page);
        await installStreamingFetchSequenceStub(page, {
            responses: [
                { chunks: ['Original swipe baseline.'], delayMs: 30 },
                { chunks: ['Discarded overswipe partial.'], delayMs: 30, failAfterChunks: true },
                { chunks: [], delayMs: 30, failAfterChunks: true },
                { chunks: ['Recovered overswipe text.'], delayMs: 30 },
            ],
        });

        const rowCountBeforeGeneration = await page.locator('#chat > .mes[mesid]').count();
        await startGeneration(page, 'Create an assistant row for overswipe recovery.');
        await waitForGeneration(page);
        const messageId = rowCountBeforeGeneration + 1;

        const beforeSwipe = await page.evaluate((targetMessageId) => {
            const message = window.SillyTavern.getContext().chat[targetMessageId];
            return {
                swipeId: message.swipe_id,
                swipes: [...message.swipes],
            };
        }, messageId);
        expect(beforeSwipe.swipeId).toBe(0);
        expect(beforeSwipe.swipes).toEqual(['Original swipe baseline.']);

        await startRightSwipeGeneration(page, messageId);
        await waitForGeneration(page);

        const afterSwipe = await page.evaluate((targetMessageId) => {
            const message = window.SillyTavern.getContext().chat[targetMessageId];
            return {
                text: message.mes,
                swipeId: message.swipe_id,
                swipes: [...message.swipes],
            };
        }, messageId);
        expect(afterSwipe.text).toContain('Recovered overswipe text.');
        expect(afterSwipe.swipeId).toBe(1);
        expect(afterSwipe.swipes).toEqual(['Original swipe baseline.', 'Recovered overswipe text.']);
        expect(afterSwipe.swipes[0]).not.toContain('Discarded overswipe partial.');

        const requests = await page.evaluate(() => window.__emberdeskStreamingRequests);
        expect(requests).toHaveLength(4);
        expect(requests[3].openai_secret_marker).toBe('openai_fallback_provider');
    });

    test('continue auto recovery final failure preserves the original assistant message', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterByName(page, characterName);
        await enableOpenAiStreaming(page);
        await enableFallbackProvider(page);
        await installStreamingFetchSequenceStub(page, {
            responses: [
                { chunks: ['Discarded continue partial.'], delayMs: 30, failAfterChunks: true },
                { chunks: [], delayMs: 30 },
                { chunks: [], delayMs: 30 },
            ],
        });

        const original = await page.evaluate(() => {
            const context = window.SillyTavern.getContext();
            const messageId = context.chat.length - 1;
            return {
                messageId,
                text: String(context.chat[messageId]?.mes ?? ''),
            };
        });
        expect(original.text.trim().length).toBeGreaterThan(0);

        await startContinueGeneration(page);
        await waitForGeneration(page, { allowFailure: true });

        const restored = await page.evaluate((messageId) => {
            const context = window.SillyTavern.getContext();
            return String(context.chat[messageId]?.mes ?? '');
        }, original.messageId);
        expect(restored).toBe(original.text);

        const continuedRow = page.locator(`#chat > .mes[mesid="${original.messageId}"]`);
        await expect(continuedRow).toHaveCount(1);
        await expect(continuedRow.locator('.mes_text')).not.toContainText('Discarded continue partial.');
        await expect(continuedRow.getByRole('button', { name: 'Retry generation' })).toBeVisible();
        const requestCount = await page.evaluate(() => window.__emberdeskStreamingRequests.length);
        expect(requestCount).toBe(3);
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
        await waitForGeneration(page, { allowFailure: true });

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
        await expectMainChatComposerState(page, {
            length: 'Follow-up after pre-token provider failure.'.length,
            empty: false,
            canSubmit: true,
            focused: true,
            generating: false,
            context: 'character',
        });
        const failedRequestCount = await page.evaluate(() => window.__emberdeskStreamingRequests.length);
        expect(failedRequestCount).toBe(2);
    });

    test('keeps streaming stop and failure recovery reachable on mobile viewports', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterByName(page, characterName);
        await enableOpenAiStreaming(page);

        for (const viewport of mobileViewports) {
            await page.setViewportSize({ width: viewport.width, height: viewport.height });
            const composer = page.getByRole('textbox', { name: 'Chat message' });
            await expect(composer, `${viewport.name} composer`).toBeVisible();
            await expectReachableControlGeometry(page, '#send_textarea', `${viewport.name} composer`);
            await composer.focus();
            await expect(composer, `${viewport.name} composer focus`).toBeFocused();
            await expectMainChatComposerState(page, {
                length: 0,
                empty: true,
                canSubmit: false,
                focused: true,
                generating: false,
                context: 'character',
            });

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
            await waitForGeneration(page, { allowFailure: true });

            const failedRow = assistantRowForGeneration(page, rowCountBeforeGeneration);
            await expect(failedRow.locator('.mes_text')).not.toContainText(`${viewport.name} failure recovery text.`);
            const retry = failedRow.getByRole('button', { name: 'Retry generation' });
            await expect(retry, `${viewport.name} retry`).toBeVisible();
            await retry.focus();
            await expect(retry, `${viewport.name} retry focus`).toBeFocused();
            await expectReachableControlGeometry(page, `#chat > .mes[mesid="${rowCountBeforeGeneration + 1}"] .generation_failure_retry`, `${viewport.name} retry`);
            const failedRequestCount = await page.evaluate(() => window.__emberdeskStreamingRequests.length);
            expect(failedRequestCount).toBe(2);
        }
    });
});
