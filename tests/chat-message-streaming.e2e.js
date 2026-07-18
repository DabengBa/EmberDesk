import { test, expect } from '@playwright/test';

import { testSetup } from './frontend/frontent-test-utils.js';

const characterName = 'Dev Character 001';
const seededChatName = 'Dev Character 001 Session 01';
const reactMainChatMessageListEnabled = process.env.EMBERDESK_FEATURES_REACT_PANELS_MAINCHATMESSAGELIST === 'true';
const mobileViewports = [
    { name: 'narrow phone', width: 390, height: 844 },
    { name: 'wide mobile', width: 768, height: 1024 },
];

async function openCharacterLibrary(page) {
    const panelButton = page.locator('.react-workspace-shell-nav-button').filter({ hasText: 'Character Library' });
    await panelButton.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
    if (await panelButton.isVisible()) {
        await panelButton.click({ timeout: 10_000 });
        await expect(panelButton).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
    } else {
        await page.locator('.mes .drawer-opener[data-target="rightNavHolder"]').filter({ hasText: /Character Management|角色管理/ }).first().click();
    }
    await expect(page.locator('#right-nav-panel.openDrawer #rm_characters_block')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#rm_print_characters_block .character_select[data-chid]').first()).toBeVisible({ timeout: 10_000 });
}

async function selectCharacterByName(page, name, chatName = seededChatName) {
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
    if (chatName) {
        await page.evaluate(async (nextChatName) => {
            const context = window.SillyTavern.getContext();
            await context.openCharacterChat(nextChatName);
        }, chatName);
    }
}

async function selectCharacterInFreshChat(page, name) {
    await selectCharacterByName(page, name);
    await page.evaluate(async () => {
        const script = await import('/script.js');
        await script.doNewChat({ deleteCurrentChat: false });
        await script.eventSource.emit(script.event_types.CHAT_LOADED, { detail: { source: 'e2e-fresh-chat' } });
    });
    await resetStreamingTestGlobals(page);
}

async function resetStreamingTestGlobals(page) {
    await page.evaluate(() => {
        window.__emberdeskStreamingGeneration = null;
        window.__emberdeskStreamingGenerationResult = null;
        window.__emberdeskStreamingGenerationError = null;
        window.__emberdeskStreamingRequests = [];
        window.__emberdeskStreamingAbortCount = 0;
        window.__emberdeskStreamingMessageEvents = [];
        window.__emberdeskStreamingRenderedEvents = [];
        window.__emberdeskStreamingRecoveryStatuses = [];
    });
}

async function installStreamingFetchStub(page, { chunks, delayMs = 40, keepOpenAfterChunks = false, failAfterChunks = false }) {
    const responses = [{ chunks, delayMs, keepOpenAfterChunks, failAfterChunks }];
    await installStreamingFetchSequenceStub(page, { responses });
}

async function installStreamingFetchSequenceStub(page, { responses }) {
    await page.evaluate(({ streamResponses }) => {
        window.__emberdeskStreamingGeneration = null;
        window.__emberdeskStreamingGenerationResult = null;
        window.__emberdeskStreamingGenerationError = null;
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

async function installNonStreamingFetchStub(page, { content, delayMs = 200 }) {
    await page.evaluate(({ responseContent, responseDelayMs }) => {
        window.__emberdeskStreamingGeneration = null;
        window.__emberdeskStreamingGenerationResult = null;
        window.__emberdeskStreamingGenerationError = null;
        window.__emberdeskStreamingRequests = [];
        window.__emberdeskStreamingAbortCount = 0;
        window.__emberdeskStreamingOriginalFetch ??= window.fetch.bind(window);

        window.fetch = async (input, init = {}) => {
            const url = typeof input === 'string' ? input : input.url;
            if (!String(url).endsWith('/api/backends/chat-completions/generate')) {
                return window.__emberdeskStreamingOriginalFetch(input, init);
            }

            window.__emberdeskStreamingRequests.push(JSON.parse(String(init.body ?? '{}')));

            return await new Promise((resolve, reject) => {
                let settled = false;
                const finish = (callback) => {
                    if (settled) {
                        return;
                    }
                    settled = true;
                    init.signal?.removeEventListener('abort', abort);
                    callback();
                };
                const abort = () => finish(() => {
                    window.__emberdeskStreamingAbortCount += 1;
                    reject(new DOMException('Aborted', 'AbortError'));
                });
                const timer = window.setTimeout(() => finish(() => {
                    resolve(new Response(JSON.stringify({
                        choices: [{ message: { content: responseContent } }],
                    }), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    }));
                }), responseDelayMs);

                init.signal?.addEventListener('abort', abort, { once: true });
                if (init.signal?.aborted) {
                    window.clearTimeout(timer);
                    abort();
                }
            });
        };
    }, { responseContent: content, responseDelayMs: delayMs });
}

async function enableOpenAiStreaming(page, { chatCompletionSource = 'openai', streamOpenAi = true } = {}) {
    await page.evaluate(({ source, streamEnabled }) => {
        const context = window.SillyTavern.getContext();
        context.powerUserSettings.stream_fade_in = false;
        context.powerUserSettings.streaming_fps = 60;
        context.chatCompletionSettings.chat_completion_source = source;
        context.chatCompletionSettings.openai_model = 'gpt-4o-mini';
        context.chatCompletionSettings.claude_model = 'claude-sonnet-4-5';
        context.chatCompletionSettings.stream_openai = streamEnabled;
        context.chatCompletionSettings.n = 1;
        context.chatCompletionSettings.send_if_empty = '';
    }, { source: chatCompletionSource, streamEnabled: streamOpenAi });
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

async function startQuietPromptGeneration(page, options = {}) {
    await page.evaluate((payload) => {
        const context = window.SillyTavern.getContext();
        window.__emberdeskStreamingGeneration = context.generateQuietPrompt(payload)
            .then(result => {
                window.__emberdeskStreamingGenerationResult = String(result ?? '');
                return result;
            })
            .catch(error => {
                window.__emberdeskStreamingGenerationError = String(error?.message ?? error);
                throw error;
            });
    }, options);
}

async function startRightSwipeGeneration(page, messageId) {
    await page.locator(`#chat > .mes[mesid="${messageId}"] .swipe_right`).click();
}

async function triggerStopGeneration(page, { throughDom = false } = {}) {
    if (throughDom) {
        return page.evaluate(() => {
            const stopButton = document.getElementById('mes_stop');
            if (!(stopButton instanceof HTMLElement)) {
                return false;
            }
            stopButton.click();
            return true;
        });
    }

    return page.evaluate(async () => {
        const script = await import('/script.js');
        return script.stopGeneration();
    });
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

    await expect.poll(async () => page.evaluate(() => window.SillyTavern.getContext().streamingProcessor === null)).toBe(true);
}

async function waitForVisibleSendButtonGeneration(page) {
    await expect(page.locator('body')).toHaveAttribute('data-generating', 'true');
    await expect(page.locator('body')).not.toHaveAttribute('data-generating', 'true');
}

async function getLastVisibleMessageId(page) {
    const lastMessageId = await page.locator('#chat > .mes[mesid]').last().getAttribute('mesid');
    return Number(lastMessageId ?? '-1');
}

function userMessageIdForGeneration(lastVisibleMessageIdBeforeGeneration) {
    return lastVisibleMessageIdBeforeGeneration + 1;
}

function assistantMessageIdForGeneration(lastVisibleMessageIdBeforeGeneration) {
    return lastVisibleMessageIdBeforeGeneration + 2;
}

function userRowForGeneration(page, lastVisibleMessageIdBeforeGeneration) {
    return page.locator(
        `#chat > .mes[is_user="true"][mesid="${userMessageIdForGeneration(lastVisibleMessageIdBeforeGeneration)}"]`,
    );
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

function assistantRowForGeneration(page, lastVisibleMessageIdBeforeGeneration) {
    return page.locator(
        `#chat > .mes[is_user="false"][is_system="false"][mesid="${assistantMessageIdForGeneration(lastVisibleMessageIdBeforeGeneration)}"]`,
    );
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
            await expect(controller).toHaveAttribute(
                'data-main-chat-streaming-transport-message-id',
                expectations.messageId === null ? '' : String(expectations.messageId),
            );
        }

        if (expectations.expectFallback !== undefined) {
            await expect(controller).toHaveAttribute('data-main-chat-streaming-transport-fallback', expectations.expectFallback ? 'true' : 'false');
        }
    }
}

async function expectMainChatTransportMarkersRetired(page) {
    const controller = page.locator('[data-main-chat-message-list-controller="true"]');

    if (!reactMainChatMessageListEnabled) {
        await expect(controller).toHaveCount(0);
        return;
    }

    await expect(controller).toHaveCount(1);
    await expect(controller).not.toHaveAttribute('data-main-chat-visible-transport-owner', /.+/);
    await expect(controller).not.toHaveAttribute('data-main-chat-visible-transport-status', /.+/);
}

async function expectMainChatQuietTransportMarkersRetired(page) {
    const controller = page.locator('[data-main-chat-message-list-controller="true"]');

    if (!reactMainChatMessageListEnabled) {
        await expect(controller).toHaveCount(0);
        return;
    }

    await expect(controller).toHaveCount(1);
    await expect(controller).not.toHaveAttribute('data-main-chat-quiet-transport-owner', /.+/);
    await expect(controller).not.toHaveAttribute('data-main-chat-quiet-transport-status', /.+/);
}

function createExactValuePattern(values) {
    return new RegExp(`^(?:${values.map(value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$`);
}

async function expectMainChatStreamingRendererStaysLegacy(page, messageId) {
    const row = page.locator(`#chat > .mes[mesid="${messageId}"]`);
    await expect(row).toHaveCount(1);
    await expect(row).not.toHaveAttribute('data-main-chat-message-row-owner', 'react');
    await expect(row).not.toHaveAttribute('data-main-chat-message-row', String(messageId));
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

async function expectMainChatComposerVisibleOwner(page, expectedOwned) {
    const sendForm = page.locator('#send_form');
    const nonQrFormItems = page.locator('#nonQRFormItems');

    await expect(sendForm).toHaveCount(1);
    await expect(nonQrFormItems).toHaveCount(1);

    if (!reactMainChatMessageListEnabled || !expectedOwned) {
        await expect(sendForm).not.toHaveAttribute('data-main-chat-composer-owner', 'react');
        await expect(nonQrFormItems).not.toHaveAttribute('data-main-chat-composer-owner', 'react');
        return;
    }

    await expect(sendForm).toHaveAttribute('data-main-chat-composer-owner', 'react');
    await expect(nonQrFormItems).toHaveAttribute('data-main-chat-composer-owner', 'react');
    await expect(page.locator('#send_textarea')).toHaveCount(1);
    await expect(page.locator('#send_but')).toHaveCount(1);
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

async function expectMainChatSlashUiOwner(page, expectations = {}) {
    const reactAutocomplete = page.locator('.autoComplete-wrap[data-main-chat-slash-ui-owner="react"]');
    const reactDetails = page.locator('[data-main-chat-slash-ui-details="react"]');
    const legacyAutocomplete = page.locator('.autoComplete-wrap:not([data-main-chat-slash-ui-owner="react"])');
    const legacyDetails = page.locator('.autoComplete-detailsWrap:not([data-main-chat-slash-ui-details="react"])');

    if (!reactMainChatMessageListEnabled) {
        await expect(reactAutocomplete).toHaveCount(0);
        await expect(reactDetails).toHaveCount(0);
        return;
    }

    if (expectations.visible !== undefined) {
        if (expectations.visible) {
            await expect(reactAutocomplete).toHaveCount(1);
            await expect(reactAutocomplete).toBeVisible();

            if (expectations.legacyHidden !== false) {
                await expect(legacyAutocomplete).toHaveCount(1);
                await expect(legacyAutocomplete).toHaveAttribute('aria-hidden', 'true');
            }
        } else {
            await expect(reactAutocomplete).toHaveCount(0);
        }
    }

    if (expectations.statusText !== undefined) {
        if (expectations.statusText) {
            await expect(reactDetails).toHaveCount(1);
            await expect(reactDetails).toContainText(expectations.statusText);

            if (expectations.legacyHidden !== false) {
                await expect(legacyDetails).toHaveCount(1);
                await expect(legacyDetails).toHaveAttribute('aria-hidden', 'true');
            }
        } else {
            await expect(reactDetails).toHaveCount(0);
        }
    }
}

test.describe('chat message streaming', () => {
    test.describe.configure({ mode: 'serial' });

    test('streams partial content into a stable message row and finalizes it', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterInFreshChat(page, characterName);
        await enableOpenAiStreaming(page);
        await installStreamingFetchStub(page, {
            chunks: ['Streaming ', 'proof ', 'complete.'],
            delayMs: 120,
        });

        const lastVisibleMessageIdBeforeGeneration = await getLastVisibleMessageId(page);
        await startGeneration(page, 'Start a deterministic streaming proof.');

        const streamingRow = assistantRowForGeneration(page, lastVisibleMessageIdBeforeGeneration);
        await expect(streamingRow.locator('.mes_text')).toContainText('Streaming');
        const messageId = await streamingRow.getAttribute('mesid');
        await expectMainChatStreamingRendererStaysLegacy(page, Number(messageId));
        await expectMainChatStreamingTransportState(page, {
            tokenCountAtLeast: 1,
            messageId: Number(messageId),
            expectFallback: false,
        });
        await expectMainChatTransportMarkersRetired(page);

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
        await expectMainChatTransportMarkersRetired(page);

        const request = await page.evaluate(() => window.__emberdeskStreamingRequests.at(-1));
        expect(request.stream).toBe(true);
        expect(request.chat_completion_source).toBe('openai');
    });

    test('stop restores controls without duplicating the streaming row', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterInFreshChat(page, characterName);
        await enableOpenAiStreaming(page);
        await installMessageEventCounters(page);
        await installStreamingFetchStub(page, {
            chunks: ['Partial stop proof.'],
            delayMs: 120,
            keepOpenAfterChunks: true,
        });

        const lastVisibleMessageIdBeforeGeneration = await getLastVisibleMessageId(page);
        await startGeneration(page, 'Start a deterministic streaming stop proof.');

        const streamingRow = assistantRowForGeneration(page, lastVisibleMessageIdBeforeGeneration);
        await expect(streamingRow.locator('.mes_text')).toBeVisible();
        const messageId = await streamingRow.getAttribute('mesid');
        const textBeforeStop = await streamingRow.locator('.mes_text').textContent();
        expect(String(textBeforeStop ?? '').trim().length).toBeGreaterThan(0);
        await expect.poll(async () => page.evaluate(() => window.SillyTavern.getContext().streamingProcessor?.observedTokenCount ?? 0))
            .toBeGreaterThanOrEqual(1);
        await expectMainChatStreamingTransportState(page, {
            phase: ['streaming', 'completed'],
            generationPhase: ['streaming', 'completed', 'idle'],
            tokenCountAtLeast: 1,
            messageId: Number(messageId),
            expectFallback: false,
        });

        await expect(page.locator('#mes_stop')).toBeVisible();
        await page.getByRole('button', { name: 'Abort request' }).click({ timeout: 5_000 });
        await expect(page.getByRole('button', { name: 'Abort request' })).not.toBeVisible();
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

    test('visible composer owner keeps newline, send, clear, and empty-submit behavior', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterInFreshChat(page, characterName);
        await enableOpenAiStreaming(page);
        await installStreamingFetchStub(page, {
            chunks: ['Composer proof complete.'],
            delayMs: 35,
        });

        const composer = page.getByRole('textbox', { name: 'Chat message' });
        const userRowCountBeforeSend = await page.locator('#chat > .mes[is_user="true"]').count();

        await composer.click();
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
        await expectMainChatComposerVisibleOwner(page, true);

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
        await expectMainChatComposerVisibleOwner(page, true);
        await expectMainChatComposerState(page, {
            length: 0,
            empty: true,
            canSubmit: false,
            context: 'character',
        });

        await waitForVisibleSendButtonGeneration(page);
        await expectMainChatComposerVisibleOwner(page, true);
        await expect(composer).toBeFocused();
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
        await expectMainChatComposerVisibleOwner(page, true);
        await expectMainChatComposerState(page, {
            length: 0,
            empty: true,
            canSubmit: false,
            focused: true,
            generating: false,
            context: 'character',
        });
    });

    test('visible composer owner serializes rapid submit clicks into one request', async ({ page }) => {
        test.skip(!reactMainChatMessageListEnabled, 'rapid submit regression requires the React composer');

        await testSetup.awaitST({ page });
        await selectCharacterInFreshChat(page, characterName);
        await enableOpenAiStreaming(page, { streamOpenAi: false });
        await installNonStreamingFetchStub(page, {
            content: 'Serialized submit proof complete.',
            delayMs: 350,
        });

        const lastVisibleMessageIdBeforeGeneration = await getLastVisibleMessageId(page);
        const composer = page.getByRole('textbox', { name: 'Chat message' });
        await composer.focus();
        await composer.pressSequentially('Serialized submit proof.');
        await expectMainChatComposerVisibleOwner(page, true);
        await expectMainChatComposerState(page, {
            length: 'Serialized submit proof.'.length,
            empty: false,
            canSubmit: true,
            focused: true,
            generating: false,
            context: 'character',
        });

        await page.evaluate(() => {
            const sendButton = document.querySelector('#send_but');
            if (!(sendButton instanceof HTMLElement)) {
                throw new Error('Visible composer send button not found');
            }

            sendButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            sendButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        });

        await expect(composer).toHaveValue('');
        await expect.poll(async () => page.evaluate(() => window.__emberdeskStreamingRequests.length)).toBe(1);
        await expect(assistantRowForGeneration(page, lastVisibleMessageIdBeforeGeneration).locator('.mes_text')).toContainText('Serialized submit proof complete.');
        await expectMainChatComposerVisibleOwner(page, true);
        await expect(page.locator('#chat > .mes[is_user="true"]').filter({ hasText: 'Serialized submit proof.' })).toHaveCount(1);
    });

    test('visible composer dispatches a service-owned request while the streaming renderer retains its row', async ({ page }) => {
        test.skip(!reactMainChatMessageListEnabled, 'React composer proof requires the main-chat message-list panel flag');

        await testSetup.awaitST({ page });
        await selectCharacterInFreshChat(page, characterName);
        await enableOpenAiStreaming(page);
        await installStreamingFetchStub(page, {
            chunks: ['Unified ', 'composer transport.'],
            delayMs: 120,
            keepOpenAfterChunks: true,
        });

        const lastVisibleMessageIdBeforeGeneration = await getLastVisibleMessageId(page);
        const composer = page.getByRole('textbox', { name: 'Chat message' });
        await composer.focus();
        await composer.pressSequentially('Unified composer transport proof.');
        await page.locator('#send_but').click();

        const assistantMessageId = assistantMessageIdForGeneration(lastVisibleMessageIdBeforeGeneration);
        const streamingRow = assistantRowForGeneration(page, lastVisibleMessageIdBeforeGeneration);
        await expectMainChatTransportMarkersRetired(page);
        await expectMainChatStreamingTransportState(page, {
            phase: 'streaming',
            generationPhase: 'streaming',
            tokenCountAtLeast: 1,
            messageId: assistantMessageId,
            expectFallback: false,
        });
        await expectMainChatStreamingRendererStaysLegacy(page, assistantMessageId);
        await expect(streamingRow.locator('.mes_text')).toContainText('Unified composer transport.');

        await page.getByRole('button', { name: 'Abort request' }).click({ timeout: 5_000 });
        await expect(page.getByRole('button', { name: 'Abort request' })).not.toBeVisible();
        await expect(page.locator('body')).not.toHaveAttribute('data-generating', 'true');
        await expectMainChatTransportMarkersRetired(page);
    });

    test('composer bridge follows legacy disconnect sendability', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterInFreshChat(page, characterName);
        await enableOpenAiStreaming(page);

        const composer = page.getByRole('textbox', { name: 'Chat message' });
        await composer.focus();
        await composer.pressSequentially('Disconnect sendability proof.');
        await expectMainChatComposerState(page, {
            length: 'Disconnect sendability proof.'.length,
            empty: false,
            canSubmit: true,
            focused: true,
            generating: false,
            context: 'character',
        });
        await expectMainChatComposerVisibleOwner(page, true);

        await page.evaluate(async () => {
            const script = await import('/script.js');
            script.setOnlineStatus('no_connection');
        });

        await expect(page.locator('#send_but')).not.toBeVisible();
        await expectMainChatComposerState(page, {
            length: 'Disconnect sendability proof.'.length,
            empty: false,
            canSubmit: false,
            focused: true,
            generating: false,
            context: 'character',
        });
        await expectMainChatComposerVisibleOwner(page, true);
    });

    test('visible continue dispatches a service-owned request while the streaming renderer retains its row', async ({ page }) => {
        test.skip(!reactMainChatMessageListEnabled, 'React composer proof requires the main-chat message-list panel flag');

        await testSetup.awaitST({ page });
        await selectCharacterInFreshChat(page, characterName);
        await enableOpenAiStreaming(page);
        await installStreamingFetchStub(page, {
            chunks: ['Continue baseline.'],
            delayMs: 35,
        });

        const lastVisibleMessageIdBeforeSeedGeneration = await getLastVisibleMessageId(page);
        await startGeneration(page, 'Create an assistant row for visible continue transport.');
        await waitForGeneration(page);
        await page.evaluate(async () => {
            const { power_user } = await import('/scripts/power-user.js');
            power_user.quick_continue = true;
            const continueButton = document.getElementById('mes_continue');
            if (continueButton instanceof HTMLElement) {
                continueButton.classList.remove('displayNone');
                continueButton.style.display = '';
            }
        });

        const continuedMessageId = assistantMessageIdForGeneration(lastVisibleMessageIdBeforeSeedGeneration);
        await installStreamingFetchStub(page, {
            chunks: [' Continued ', 'via the unified service.'],
            delayMs: 120,
            keepOpenAfterChunks: true,
        });

        await expect(page.locator('#mes_continue')).toBeVisible();
        await page.locator('#mes_continue').click();

        const continuedRow = page.locator(`#chat > .mes[mesid="${continuedMessageId}"]`);
        await expectMainChatTransportMarkersRetired(page);
        await expectMainChatStreamingTransportState(page, {
            phase: 'streaming',
            generationPhase: 'streaming',
            tokenCountAtLeast: 1,
            messageId: continuedMessageId,
            expectFallback: false,
        });
        await expectMainChatStreamingRendererStaysLegacy(page, continuedMessageId);
        await expect(continuedRow.locator('.mes_text')).toContainText('Continued via the unified service.');

        const stopped = await triggerStopGeneration(page, { throughDom: true });
        expect(stopped).toBe(true);
        await expect(page.locator('body')).not.toHaveAttribute('data-generating', 'true');
        await expectMainChatTransportMarkersRetired(page);
    });

    test('visible regenerate dispatches a service-owned request and reuses one assistant row', async ({ page }) => {
        test.skip(!reactMainChatMessageListEnabled, 'React composer proof requires the main-chat message-list panel flag');

        await testSetup.awaitST({ page });
        await selectCharacterInFreshChat(page, characterName);
        await enableOpenAiStreaming(page);
        await installStreamingFetchStub(page, {
            chunks: ['Seed assistant row.'],
            delayMs: 35,
        });

        const lastVisibleMessageIdBeforeSeedGeneration = await getLastVisibleMessageId(page);
        await startGeneration(page, 'Create an assistant row for visible regenerate transport.');
        await waitForGeneration(page);

        const regeneratedMessageId = assistantMessageIdForGeneration(lastVisibleMessageIdBeforeSeedGeneration);
        await installStreamingFetchStub(page, {
            chunks: ['Unified regenerate result.'],
            delayMs: 120,
        });

        await page.evaluate(() => {
            const regenerateButton = document.getElementById('option_regenerate');
            if (regenerateButton instanceof HTMLElement) {
                regenerateButton.classList.remove('displayNone');
                regenerateButton.style.display = '';
                regenerateButton.click();
            }
        });

        const regeneratedRow = page.locator(`#chat > .mes[mesid="${regeneratedMessageId}"]`);
        await expectMainChatTransportMarkersRetired(page);
        await expectMainChatStreamingTransportState(page, {
            phase: ['streaming', 'completed'],
            generationPhase: ['streaming', 'completed', 'idle'],
            tokenCountAtLeast: 1,
            messageId: regeneratedMessageId,
            expectFallback: false,
        });
        await expect(regeneratedRow.locator('.mes_text')).toContainText('Unified regenerate result.');
        await waitForGeneration(page);
        await expect(regeneratedRow).toHaveCount(1);
        await expectMainChatTransportMarkersRetired(page);
    });

    test('non-streaming stop does not reuse the previous assistant message id in transport state', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterInFreshChat(page, characterName);
        await enableOpenAiStreaming(page);
        await installStreamingFetchStub(page, {
            chunks: ['Previous assistant response.'],
            delayMs: 35,
        });

        const lastVisibleMessageIdBeforeSeedGeneration = await getLastVisibleMessageId(page);
        await startGeneration(page, 'Create an assistant row before the stop proof.');
        await waitForGeneration(page);

        const seededAssistantRow = assistantRowForGeneration(page, lastVisibleMessageIdBeforeSeedGeneration);
        const previousAssistantMessageId = Number(await seededAssistantRow.getAttribute('mesid'));
        expect(previousAssistantMessageId).toBeGreaterThanOrEqual(0);

        await enableOpenAiStreaming(page, { streamOpenAi: false });
        await installNonStreamingFetchStub(page, {
            content: 'This reply should never land because the request is aborted.',
            delayMs: 1500,
        });

        await startGeneration(page, 'Abort a non-streaming request before any assistant row is created.');
        await expect(page.locator('#mes_stop')).toBeVisible();
        const stopped = await triggerStopGeneration(page);
        expect(stopped).toBe(true);

        await expectMainChatStreamingTransportState(page, {
            phase: 'stopped',
            generationPhase: 'stopped',
            messageId: null,
            expectFallback: false,
        });

        const abortedMessage = await page.evaluate(async () => {
            try {
                await window.__emberdeskStreamingGeneration;
                return window.__emberdeskStreamingGenerationResult ?? null;
            } catch (error) {
                return String(error?.message ?? error);
            }
        });
        expect(String(abortedMessage ?? '')).toMatch(/Aborted|Generation was aborted/i);
        await expect(page.locator('body')).not.toHaveAttribute('data-generating', 'true');
        await expect(page.getByRole('button', { name: 'Retry generation' })).toHaveCount(1);
    });

    test('quiet helper generation returns text without a visible row or transport-owner marker', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterInFreshChat(page, characterName);
        await enableOpenAiStreaming(page, { streamOpenAi: false });
        await installNonStreamingFetchStub(page, {
            content: 'Quiet helper reply.',
            delayMs: 200,
        });

        const messageCountBefore = await page.locator('#chat > .mes[mesid]').count();
        await startQuietPromptGeneration(page, {
            quietPrompt: 'Return only a deterministic helper sentence.',
        });

        await expectMainChatQuietTransportMarkersRetired(page);

        await waitForGeneration(page);
        await expectMainChatQuietTransportMarkersRetired(page);
        await expect(page.locator('#chat > .mes[mesid]')).toHaveCount(messageCountBefore);

        const quietReply = await page.evaluate(() => window.__emberdeskStreamingGenerationResult);
        expect(quietReply).toBe('Quiet helper reply.');
    });

    test('background helper generation returns text without a visible row or transport-owner marker', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterInFreshChat(page, characterName);
        await enableOpenAiStreaming(page, { streamOpenAi: false });
        await installNonStreamingFetchStub(page, {
            content: 'Beach sunset',
            delayMs: 200,
        });

        const messageCountBefore = await page.locator('#chat > .mes[mesid]').count();
        await startQuietPromptGeneration(page, {
            quietPrompt: 'Choose one background title only.',
            backgroundGeneration: true,
        });

        await expectMainChatQuietTransportMarkersRetired(page);

        await waitForGeneration(page);
        await expectMainChatQuietTransportMarkersRetired(page);
        await expect(page.locator('#chat > .mes[mesid]')).toHaveCount(messageCountBefore);

        const quietReply = await page.evaluate(() => window.__emberdeskStreamingGenerationResult);
        expect(quietReply).toBe('Beach sunset');
    });

    test('visible slash automation observes autocomplete, execution, pause, continue, and abort through the public generation adapter', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterInFreshChat(page, characterName);

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
        await expectMainChatSlashUiOwner(page, { visible: true });

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
        await expectMainChatSlashUiOwner(page, { visible: false, statusText: '' });

        const scriptText = '/delay 1500 | /delay 1500 | /echo ready';
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
        await expectMainChatSlashUiOwner(page, { statusText: 'Paused' });

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
        await expectMainChatSlashUiOwner(page, { statusText: 'Aborted' });

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
        await selectCharacterInFreshChat(page, characterName);
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

        const lastVisibleMessageIdBeforeGeneration = await getLastVisibleMessageId(page);
        await startGeneration(page, 'Start a deterministic fallback recovery proof.');
        const assistantRow = assistantRowForGeneration(page, lastVisibleMessageIdBeforeGeneration);
        await expectMainChatStreamingTransportState(page, {
            phase: ['streaming', 'completed'],
            generationPhase: ['recoveringFallback', 'completed', 'idle'],
            tokenCountAtLeast: 1,
            messageId: assistantMessageIdForGeneration(lastVisibleMessageIdBeforeGeneration),
            expectFallback: true,
        });

        await expect(assistantRow.locator('.mes_text')).toContainText('Fallback recovery complete.');
        await waitForGeneration(page);
        await expectMainChatStreamingTransportState(page, {
            phase: 'completed',
            generationPhase: ['completed', 'idle'],
            tokenCountAtLeast: 1,
            messageId: assistantMessageIdForGeneration(lastVisibleMessageIdBeforeGeneration),
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
        expect(finalEvents.message).toEqual([{
            messageId: assistantMessageIdForGeneration(lastVisibleMessageIdBeforeGeneration),
            type: 'normal',
        }]);
        expect(finalEvents.rendered).toEqual([{
            messageId: assistantMessageIdForGeneration(lastVisibleMessageIdBeforeGeneration),
            type: 'normal',
        }]);
    });

    test('parses fallback stream with fallback source when primary source has a different stream shape', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterInFreshChat(page, characterName);
        await enableOpenAiStreaming(page, { chatCompletionSource: 'claude' });
        await enableFallbackProvider(page);
        await installStreamingFetchSequenceStub(page, {
            responses: [
                { chunks: [], delayMs: 30, failAfterChunks: true },
                { chunks: [], delayMs: 30, failAfterChunks: true },
                { chunks: ['Fallback OpenAI stream parsed.'], delayMs: 30 },
            ],
        });

        const lastVisibleMessageIdBeforeGeneration = await getLastVisibleMessageId(page);
        await startGeneration(page, 'Start a fallback parser proof.');
        const assistantRow = assistantRowForGeneration(page, lastVisibleMessageIdBeforeGeneration);

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
        await selectCharacterInFreshChat(page, characterName);
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

        const stopped = await triggerStopGeneration(page, { throughDom: true });
        expect(stopped).toBe(true);
        await waitForGeneration(page, { allowAbort: true });
        await expect(page.locator('#chat > .mes[is_user="false"][is_system="false"][mesid]').filter({ hasText: 'Unexpected retry.' })).toHaveCount(0);
        await expect(page.locator('.generation_auto_recovery_status')).toHaveCount(0);

        const requestCount = await page.evaluate(() => window.__emberdeskStreamingRequests.length);
        expect(requestCount).toBe(1);
    });

    test('provider failure leaves a readable recovery path without duplicating rows', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterInFreshChat(page, characterName);
        await enableOpenAiStreaming(page);
        await installStreamingFetchStub(page, {
            chunks: ['Failure path partial text.'],
            delayMs: 35,
            failAfterChunks: true,
        });

        const lastVisibleMessageIdBeforeGeneration = await getLastVisibleMessageId(page);
        await startGeneration(page, 'Start a deterministic provider failure proof.');
        await waitForGeneration(page, { allowFailure: true });
        await expectMainChatStreamingTransportState(page, {
            phase: 'error',
            generationPhase: 'error',
            messageId: assistantMessageIdForGeneration(lastVisibleMessageIdBeforeGeneration),
            expectFallback: false,
        });

        const userRow = userRowForGeneration(page, lastVisibleMessageIdBeforeGeneration);
        await expect(userRow.locator('.mes_text')).toContainText('Start a deterministic provider failure proof.');

        const assistantRowsAfterFailure = assistantRowForGeneration(page, lastVisibleMessageIdBeforeGeneration);
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
        await expect(page.locator(
            `#chat > .mes[mesid="${assistantMessageIdForGeneration(lastVisibleMessageIdBeforeGeneration)}"]`,
        )).toHaveCount(1);
        const failedAttemptRequestCount = await page.evaluate(() => window.__emberdeskStreamingRequests.length);
        expect(failedAttemptRequestCount).toBe(2);

        await installStreamingFetchStub(page, {
            chunks: ['Recovered ', 'retry text.'],
            delayMs: 120,
        });
        await recovery.click();
        await expectMainChatTransportMarkersRetired(page);
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
        await selectCharacterInFreshChat(page, characterName);
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

        const lastVisibleMessageIdBeforeGeneration = await getLastVisibleMessageId(page);
        await startGeneration(page, 'Start a deterministic fallback recovery proof.');
        await waitForGeneration(page);

        const userRow = userRowForGeneration(page, lastVisibleMessageIdBeforeGeneration);
        const assistantRow = assistantRowForGeneration(page, lastVisibleMessageIdBeforeGeneration);
        const duplicateAssistantRow = page.locator(
            `#chat > .mes[is_user="false"][is_system="false"][mesid="${assistantMessageIdForGeneration(lastVisibleMessageIdBeforeGeneration) + 1}"]`,
        );

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
        expect(messageEvents[0].messageId).toBe(assistantMessageIdForGeneration(lastVisibleMessageIdBeforeGeneration));
        expect(renderedEvents[0].messageId).toBe(assistantMessageIdForGeneration(lastVisibleMessageIdBeforeGeneration));
    });

    test('recovered overswipe appends a new swipe without replacing the existing swipe', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterInFreshChat(page, characterName);
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

        const lastVisibleMessageIdBeforeGeneration = await getLastVisibleMessageId(page);
        await startGeneration(page, 'Create an assistant row for overswipe recovery.');
        await waitForGeneration(page);
        const messageId = assistantMessageIdForGeneration(lastVisibleMessageIdBeforeGeneration);

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
        await expectMainChatTransportMarkersRetired(page);
        await expectMainChatStreamingTransportState(page, {
            phase: ['streaming', 'recoveringPrimary', 'recoveringFallback', 'completed'],
            generationPhase: ['streaming', 'recoveringPrimary', 'recoveringFallback', 'completed', 'idle'],
            tokenCountAtLeast: 1,
            messageId,
            expectFallback: true,
        });
        await expectMainChatStreamingTransportState(page, {
            phase: ['completed', 'idle'],
            generationPhase: ['completed', 'idle'],
            messageId,
            expectFallback: true,
        });
        await expect.poll(async () => page.evaluate((targetMessageId) => {
            const message = window.SillyTavern.getContext().chat[targetMessageId];
            return {
                text: String(message?.mes ?? ''),
                swipeId: message?.swipe_id ?? null,
                swipes: Array.isArray(message?.swipes) ? [...message.swipes] : [],
            };
        }, messageId)).toEqual({
            text: 'Recovered overswipe text.',
            swipeId: 1,
            swipes: ['Original swipe baseline.', 'Recovered overswipe text.'],
        });

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
        await selectCharacterInFreshChat(page, characterName);
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
        await selectCharacterInFreshChat(page, characterName);
        await enableOpenAiStreaming(page);
        await installStreamingFetchStub(page, {
            chunks: [],
            delayMs: 35,
            failAfterChunks: true,
        });

        const lastVisibleMessageIdBeforeGeneration = await getLastVisibleMessageId(page);
        await startGeneration(page, 'Start a deterministic pre-token provider failure proof.');
        await waitForGeneration(page, { allowFailure: true });

        const userRow = userRowForGeneration(page, lastVisibleMessageIdBeforeGeneration);
        await expect(userRow.locator('.mes_text')).toContainText('Start a deterministic pre-token provider failure proof.');

        const failedRow = assistantRowForGeneration(page, lastVisibleMessageIdBeforeGeneration);
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
        await selectCharacterInFreshChat(page, characterName);
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
            let lastVisibleMessageIdBeforeGeneration = await getLastVisibleMessageId(page);
            await startGeneration(page, `Start ${viewport.name} mobile stop proof.`);
            const streamingRow = assistantRowForGeneration(page, lastVisibleMessageIdBeforeGeneration);
            await expect(streamingRow.locator('.mes_text'), `${viewport.name} streaming row`).toBeVisible();
            await expect(page.locator('#mes_stop'), `${viewport.name} stop`).toBeVisible();
            await expectReachableControlGeometry(page, '#mes_stop', `${viewport.name} stop`);
            const stopped = await triggerStopGeneration(page, { throughDom: true });
            expect(stopped, `${viewport.name} stop trigger`).toBe(true);
            await waitForGeneration(page, { allowAbort: true });
            await expect(page.locator('body')).not.toHaveAttribute('data-generating', 'true');
            await expect(streamingRow, `${viewport.name} stopped row identity`).toHaveCount(1);

            await installStreamingFetchStub(page, {
                chunks: [`${viewport.name} failure recovery text.`],
                delayMs: 35,
                failAfterChunks: true,
            });
            lastVisibleMessageIdBeforeGeneration = await getLastVisibleMessageId(page);
            await startGeneration(page, `Start ${viewport.name} mobile provider failure proof.`);
            await waitForGeneration(page, { allowFailure: true });

            const failedRow = assistantRowForGeneration(page, lastVisibleMessageIdBeforeGeneration);
            await expect(failedRow.locator('.mes_text')).not.toContainText(`${viewport.name} failure recovery text.`);
            const retry = failedRow.getByRole('button', { name: 'Retry generation' });
            await expect(retry, `${viewport.name} retry`).toBeVisible();
            await retry.focus();
            await expect(retry, `${viewport.name} retry focus`).toBeFocused();
            await expectReachableControlGeometry(
                page,
                `#chat > .mes[mesid="${assistantMessageIdForGeneration(lastVisibleMessageIdBeforeGeneration)}"] .generation_failure_retry`,
                `${viewport.name} retry`,
            );
            const failedRequestCount = await page.evaluate(() => window.__emberdeskStreamingRequests.length);
            expect(failedRequestCount).toBe(2);
        }
    });
});
