import { test, expect } from '@playwright/test';

import { testSetup } from './frontend/frontent-test-utils.js';

const characterName = 'Dev Character 001';
const seededChatName = 'Dev Character 001 Session 01';
const reactMainChatMessageListEnabled = true;
const mobileViewports = [
    { name: 'narrow phone', width: 390, height: 844 },
    { name: 'wide mobile', width: 768, height: 1024 },
];

async function openCharacterLibrary(page) {
    const panelButton = page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '角色库' }).first();
    await expect(panelButton).toBeVisible({ timeout: 10_000 });
    await panelButton.click({ timeout: 10_000 });
    await expect(panelButton).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
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
    const greetingDialog = page.getByTestId('main-chat-greeting-picker').locator('dialog[open]');
    if (await greetingDialog.isVisible()) {
        await greetingDialog.getByRole('button', { name: '取消并关闭' }).click();
    }
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
            if (responseConfig.status) {
                return new Response(JSON.stringify({ error: { message: 'provider network failure' } }), { status: responseConfig.status, headers: { 'Content-Type': 'application/json' } });
            }
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
                                    delta: typeof chunk === 'string' ? { content: chunk } : chunk,
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
        context.chatCompletionSettings.stream_openai = streamEnabled;
        context.chatCompletionSettings.fallback_provider_model = '';
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
        // Four-field contract: a non-empty fallback model enables fallback and
        // the attempt reuses the primary URL and API key.
        context.chatCompletionSettings.fallback_provider_model = 'fallback-model';
    });
}

async function startGeneration(page, prompt) {
    await page.locator('#send_textarea').fill(prompt);
    await page.evaluate(() => {
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
    const lastMessageId = await page.locator('#chat .mes[mesid]').last().getAttribute('mesid');
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
        `#chat .mes[is_user="true"][mesid="${userMessageIdForGeneration(lastVisibleMessageIdBeforeGeneration)}"]`,
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
        `#chat .mes[is_user="false"][is_system="false"][mesid="${assistantMessageIdForGeneration(lastVisibleMessageIdBeforeGeneration)}"]`,
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
    if (!reactMainChatMessageListEnabled) {
        return;
    }

    const chat = page.locator('#chat');
    await expect(chat).toHaveCount(1);

    if (expectations.phase !== undefined) {
        const phases = Array.isArray(expectations.phase) ? expectations.phase : [expectations.phase];
        await expect.poll(async () => (
            await chat.getAttribute('data-main-chat-streaming-transport-phase')
        ) ?? '').toMatch(createExactValuePattern(phases));
    }

    if (expectations.tokenCountAtLeast !== undefined) {
        await expect.poll(async () => {
            const value = await chat.getAttribute('data-main-chat-streaming-transport-tokens');
            return Number(value ?? '-1');
        }).toBeGreaterThanOrEqual(expectations.tokenCountAtLeast);
    }

    if (expectations.generationPhase !== undefined) {
        const phases = Array.isArray(expectations.generationPhase) ? expectations.generationPhase : [expectations.generationPhase];
        await expect.poll(async () => (
            await chat.getAttribute('data-main-chat-generation-control-phase')
        ) ?? '').toMatch(createExactValuePattern(phases));
    }

    if (expectations.expectFallback !== undefined || expectations.messageId !== undefined) {
        if (expectations.messageId !== undefined) {
            await expect(chat).toHaveAttribute(
                'data-main-chat-streaming-transport-message-id',
                expectations.messageId === null ? '' : String(expectations.messageId),
            );
        }

        if (expectations.expectFallback !== undefined) {
            await expect(chat).toHaveAttribute('data-main-chat-streaming-transport-fallback', expectations.expectFallback ? 'true' : 'false');
        }
    }
}

async function expectMainChatTransportMarkersRetired(page) {
    if (!reactMainChatMessageListEnabled) {
        return;
    }

    const chat = page.locator('#chat');
    await expect(chat).toHaveCount(1);
    await expect(chat).not.toHaveAttribute('data-main-chat-visible-transport-owner', /.+/);
    await expect(chat).not.toHaveAttribute('data-main-chat-visible-transport-status', /.+/);
}

async function expectMainChatQuietTransportMarkersRetired(page) {
    if (!reactMainChatMessageListEnabled) {
        return;
    }

    const chat = page.locator('#chat');
    await expect(chat).toHaveCount(1);
    await expect(chat).not.toHaveAttribute('data-main-chat-quiet-transport-owner', /.+/);
    await expect(chat).not.toHaveAttribute('data-main-chat-quiet-transport-status', /.+/);
}

function createExactValuePattern(values) {
    return new RegExp(`^(?:${values.map(value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$`);
}

async function expectMainChatStreamingRendererStaysOnSameReactRow(page, messageId) {
    const row = page.locator(`#chat .mes[mesid="${messageId}"]`);
    await expect(row).toHaveCount(1);
    // React sole-owns the streaming/finalized row; must not remount as a second owner.
    await expect(row).toHaveAttribute('data-main-chat-message-row-owner', 'react');
    await expect(row).toHaveAttribute('data-main-chat-message-row', String(messageId));
    await expect(row).toHaveAttribute('data-main-chat-message-row-state', /^(?:streaming|finalized)$/);
}

async function expectMainChatComposerState(page, expectations = {}) {
    if (!reactMainChatMessageListEnabled) {
        return;
    }

    const chat = page.locator('#chat');
    await expect(chat).toHaveCount(1);

    if (expectations.length !== undefined) {
        await expect(chat).toHaveAttribute('data-main-chat-composer-length', String(expectations.length));
    }

    if (expectations.empty !== undefined) {
        await expect(chat).toHaveAttribute('data-main-chat-composer-empty', expectations.empty ? 'true' : 'false');
    }

    if (expectations.canSubmit !== undefined) {
        await expect(chat).toHaveAttribute('data-main-chat-composer-can-submit', expectations.canSubmit ? 'true' : 'false');
    }

    if (expectations.focused !== undefined) {
        await expect(chat).toHaveAttribute('data-main-chat-composer-focused', expectations.focused ? 'true' : 'false');
    }

    if (expectations.disabled !== undefined) {
        await expect(chat).toHaveAttribute('data-main-chat-composer-disabled', expectations.disabled ? 'true' : 'false');
    }

    if (expectations.generating !== undefined) {
        await expect(chat).toHaveAttribute('data-main-chat-composer-generating', expectations.generating ? 'true' : 'false');
    }

    if (expectations.context !== undefined) {
        await expect(chat).toHaveAttribute('data-main-chat-composer-context', expectations.context);
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
    if (!reactMainChatMessageListEnabled) {
        return;
    }

    const chat = page.locator('#chat');

    if (expectations.active !== undefined) {
        await expect(chat).toHaveAttribute('data-main-chat-slash-command-active', expectations.active ? 'true' : 'false');
    }

    if (expectations.queryLength !== undefined) {
        await expect(chat).toHaveAttribute('data-main-chat-slash-command-query-length', String(expectations.queryLength));
    }

    if (expectations.autocomplete !== undefined) {
        await expect(chat).toHaveAttribute('data-main-chat-slash-command-autocomplete', expectations.autocomplete ? 'visible' : 'hidden');
    }

    if (expectations.executing !== undefined) {
        await expect(chat).toHaveAttribute('data-main-chat-slash-command-executing', expectations.executing ? 'true' : 'false');
    }

    if (expectations.paused !== undefined) {
        await expect(chat).toHaveAttribute('data-main-chat-slash-command-paused', expectations.paused ? 'true' : 'false');
    }

    if (expectations.aborted !== undefined) {
        await expect(chat).toHaveAttribute('data-main-chat-slash-command-aborted', expectations.aborted ? 'true' : 'false');
    }

    if (expectations.error !== undefined) {
        await expect(chat).toHaveAttribute('data-main-chat-slash-command-error', expectations.error);
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

    test('stopped generation cannot consume a later World Info activation', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterInFreshChat(page, characterName);
        await enableOpenAiStreaming(page);
        await installStreamingFetchStub(page, { chunks: ['must not send'] });
        await page.evaluate(async () => {
            const state = await import('/scripts/world-info-state.js');
            const scanner = await import('/scripts/world-info-service.js');
            const { eventSource, event_types } = await import('/scripts/events.js');
            const book = 'attempt28-world-scan';
            state.setSelectedWorldInfo([book]);
            state.worldInfoCache.set(book, { entries: { 1: { uid: 1, order: 1, content: 'matched', key: ['race'], position: 0 } } });
            window.__worldScanEntered = false;
            window.__worldActivationPublished = false;
            window.__worldScanRelease = null;
            window.__worldScanListener = async () => {
                window.__worldScanEntered = true;
                await new Promise(resolve => { window.__worldScanRelease = resolve; });
            };
            window.__worldActivationListener = () => { window.__worldActivationPublished = true; };
            eventSource.on(event_types.WORLDINFO_SCAN_DONE, window.__worldScanListener);
            eventSource.on(event_types.WORLD_INFO_ACTIVATED, window.__worldActivationListener);
            window.__worldScanner = scanner;
        });
        await startGeneration(page, 'race');
        await expect.poll(() => page.evaluate(() => window.__worldScanEntered)).toBe(true);
        await page.evaluate(async () => {
            const script = await import('/script.js');
            script.stopGeneration();
            window.__worldScanner.WorldInfoBuffer.externalActivations.set('new.2', { uid: 2, world: 'new' });
            window.__worldScanRelease();
        });
        await waitForGeneration(page, { allowAbort: true });
        const outcome = await page.evaluate(async () => {
            const { eventSource, event_types } = await import('/scripts/events.js');
            const state = await import('/scripts/world-info-state.js');
            eventSource.removeListener(event_types.WORLDINFO_SCAN_DONE, window.__worldScanListener);
            eventSource.removeListener(event_types.WORLD_INFO_ACTIVATED, window.__worldActivationListener);
            state.setSelectedWorldInfo([]);
            const preserved = window.__worldScanner.WorldInfoBuffer.externalActivations.has('new.2');
            window.__worldScanner.WorldInfoBuffer.externalActivations.delete('new.2');
            return { preserved, published: window.__worldActivationPublished, requests: window.__emberdeskStreamingRequests.length };
        });
        expect(outcome).toEqual({ preserved: true, published: false, requests: 0 });
    });

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
        await expectMainChatStreamingRendererStaysOnSameReactRow(page, Number(messageId));
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
        await expect(page.locator(`#chat .mes[mesid="${messageId}"]`)).toHaveCount(1);
        await expect(page.locator(`#chat .mes[mesid="${messageId}"]`).getByRole('button', { name: '消息操作' })).toBeVisible();
        await expect(page.getByRole('button', { name: '中止请求' })).toBeHidden();
        await expectMainChatTransportMarkersRetired(page);

        const request = await page.evaluate(() => window.__emberdeskStreamingRequests.at(-1));
        expect(request.stream).toBe(true);
        expect(request.chat_completion_source).toBe('openai');
    });

    test('streams through an OpenAI-compatible custom endpoint', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterInFreshChat(page, characterName);
        await enableOpenAiStreaming(page);
        await page.evaluate(() => {
            const settings = window.SillyTavern.getContext().chatCompletionSettings;
            settings.custom_url = 'https://compatible.example/v1';
            settings.openai_model = 'compatible-model';
        });
        await installStreamingFetchStub(page, { chunks: ['Compatible endpoint reply.'] });
        const previousId = await getLastVisibleMessageId(page);
        await startGeneration(page, 'Use the compatible endpoint.');
        await expect(assistantRowForGeneration(page, previousId).locator('.mes_text')).toContainText('Compatible endpoint reply.');
        await waitForGeneration(page);
        const request = await page.evaluate(() => window.__emberdeskStreamingRequests.at(-1));
        expect(request.chat_completion_source).toBe('openai');
        expect(request.custom_url).toBe('https://compatible.example/v1');
        expect(request.model).toBe('compatible-model');
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
        await page.getByRole('button', { name: '中止请求' }).click({ timeout: 5_000 });
        await expect(page.getByRole('button', { name: '中止请求' })).toBeHidden();
        await expectMainChatStreamingTransportState(page, {
            phase: 'stopped',
            messageId: Number(messageId),
            expectFallback: false,
        });

        await expect(page.locator('#mes_stop')).toBeHidden();
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
        const stoppedRow = page.locator(`#chat .mes[mesid="${messageId}"]`);
        await expect(stoppedRow).toHaveCount(1);
        const stoppedText = await stoppedRow.locator('.mes_text').textContent();
        expect(String(stoppedText ?? '').trim().length).toBeGreaterThan(0);
        await expect(page.locator(`#chat .mes[mesid="${messageId}"]`)).toHaveCount(1);

        const abortCount = await page.evaluate(() => window.__emberdeskStreamingAbortCount);
        expect(abortCount).toBeGreaterThanOrEqual(1);
        const requestCount = await page.evaluate(() => window.__emberdeskStreamingRequests.length);
        const messageEvents = await page.evaluate(() => window.__emberdeskStreamingMessageEvents);
        const renderedEvents = await page.evaluate(() => window.__emberdeskStreamingRenderedEvents);
        expect(requestCount).toBe(1);
        expect(messageEvents).toHaveLength(0);
        expect(renderedEvents).toHaveLength(0);
    });

    test('composer F7 preserves selection and ignores Enter during IME composition', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterInFreshChat(page, characterName);
        await enableOpenAiStreaming(page);
        await installStreamingFetchStub(page, { chunks: ['IME proof complete.'] });
        const composer = page.locator('#send_textarea');
        await composer.fill('abcdef');
        await composer.evaluate(textarea => {
            textarea.setSelectionRange(1, 4, 'forward');
            textarea.dispatchEvent(new Event('select', { bubbles: true }));
        });
        await composer.pressSequentially('X');
        await expect(composer).toHaveValue('aXef');
        await expect.poll(() => page.evaluate(async () => {
            const { getComposerSnapshot } = await import('/scripts/main-chat-composer-service.js');
            const snapshot = getComposerSnapshot();
            return [snapshot.selectionStart, snapshot.selectionEnd];
        })).toEqual([2, 2]);

        await composer.dispatchEvent('compositionstart', { data: '' });
        await composer.fill('输入法确认');
        await composer.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 229, isComposing: true });
        await expect(composer).toHaveValue('输入法确认');
        expect(await page.evaluate(() => window.__emberdeskStreamingRequests.length)).toBe(0);
        await composer.dispatchEvent('compositionend', { data: '输入法确认' });
        await composer.press('Enter');
        await waitForVisibleSendButtonGeneration(page);
        await expect(page.locator('#chat .mes[is_user="true"]').filter({ hasText: '输入法确认' })).toHaveCount(1);
        expect(await page.evaluate(() => window.__emberdeskStreamingRequests.length)).toBe(1);
    });

    test('composer F7 submits captured text and preserves typing during an awaited start', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterInFreshChat(page, characterName);
        await enableOpenAiStreaming(page);
        await installStreamingFetchStub(page, { chunks: ['Captured submission complete.'] });
        await page.evaluate(async () => {
            const { eventSource, event_types } = await import('/scripts/events.js');
            const pause = () => {
                eventSource.removeListener(event_types.GENERATION_STARTED, pause);
                return new Promise(resolve => { window.__composerStartRelease = resolve; });
            };
            eventSource.on(event_types.GENERATION_STARTED, pause);
        });
        const composer = page.locator('#send_textarea');
        await composer.fill('The submitted text.');
        await page.locator('#send_but').click();
        await expect.poll(() => page.evaluate(() => typeof window.__composerStartRelease)).toBe('function');
        await composer.fill('The next draft.');
        await page.evaluate(() => window.__composerStartRelease());
        await waitForVisibleSendButtonGeneration(page);
        await expect(page.locator('#chat .mes[is_user="true"]').filter({ hasText: 'The submitted text.' })).toHaveCount(1);
        await expect(page.locator('#chat .mes[is_user="true"]').filter({ hasText: 'The next draft.' })).toHaveCount(0);
        await expect(composer).toHaveValue('The next draft.');
        expect(await page.evaluate(() => window.__emberdeskStreamingRequests.length)).toBe(1);
    });

    test('composer F7 restores separate drafts across actual chat switches', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterByName(page, characterName);
        const composer = page.locator('#send_textarea');
        await composer.fill('First chat draft.');
        await selectCharacterByName(page, 'Dev Character 002', 'Dev Character 002 Session 01');
        await expect(composer).toHaveValue('');
        await composer.fill('Second chat draft.');
        await selectCharacterByName(page, characterName);
        await expect(composer).toHaveValue('First chat draft.');
        await selectCharacterByName(page, 'Dev Character 002', 'Dev Character 002 Session 01');
        await expect(composer).toHaveValue('Second chat draft.');
    });

    test('composer F7 cancels an awaited submission after switching away and back', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterByName(page, characterName);
        await enableOpenAiStreaming(page);
        await installStreamingFetchStub(page, { chunks: ['Must not be requested.'] });
        await page.evaluate(async () => {
            const { eventSource, event_types } = await import('/scripts/events.js');
            const pause = () => {
                eventSource.removeListener(event_types.GENERATION_STARTED, pause);
                return new Promise(resolve => { window.__composerStartRelease = resolve; });
            };
            eventSource.on(event_types.GENERATION_STARTED, pause);
        });
        const composer = page.locator('#send_textarea');
        await composer.fill('An old submission.');
        await page.evaluate(async () => {
            const script = await import('/script.js');
            window.__staleComposerSubmission = script.sendTextareaMessage();
        });
        await expect.poll(() => page.evaluate(() => typeof window.__composerStartRelease)).toBe('function');
        expect(await page.evaluate(() => window.__emberdeskStreamingRequests.filter(request => request.type !== 'chat_memory').length)).toBe(0);
        await selectCharacterByName(page, 'Dev Character 002', 'Dev Character 002 Session 01');
        await composer.fill('Another chat draft.');
        await selectCharacterByName(page, characterName);
        await expect(composer).toHaveValue('An old submission.');
        const requestCountBeforeRelease = await page.evaluate(() => window.__emberdeskStreamingRequests.filter(request => request.type !== 'chat_memory').length);
        await page.evaluate(async () => {
            window.__composerStartRelease();
            await window.__staleComposerSubmission;
        });
        await expect(composer).toHaveValue('An old submission.');
        await expect(page.locator('#chat .mes[is_user="true"]').filter({ hasText: 'An old submission.' })).toHaveCount(0);
        expect(await page.evaluate(() => window.__emberdeskStreamingRequests.filter(request => request.type !== 'chat_memory').length)).toBe(requestCountBeforeRelease);
    });

    test('visible composer owner keeps newline, send, clear, and empty-submit behavior', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterInFreshChat(page, characterName);
        await enableOpenAiStreaming(page);
        await installStreamingFetchStub(page, {
            chunks: ['Composer proof complete.'],
            delayMs: 35,
        });

        const composer = page.locator('#send_textarea');
        const userRowCountBeforeSend = await page.locator('#chat .mes[is_user="true"]').count();

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
        await expect(page.locator('#chat .mes[is_user="true"]').filter({ hasText: 'Line one' })).toHaveCount(1);
        await expect(page.locator('#chat .mes[is_user="true"]').filter({ hasText: 'Line two' })).toHaveCount(1);
        await expect(page.locator('#chat .mes[is_user="true"]')).toHaveCount(userRowCountBeforeSend + 1);

        const userRowCountBeforeEmptyClick = await page.locator('#chat .mes[is_user="true"]').count();
        await page.locator('#send_but').click();
        await page.waitForTimeout(150);
        await expect(page.locator('#chat .mes[is_user="true"]')).toHaveCount(userRowCountBeforeEmptyClick);
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
        const composer = page.locator('#send_textarea');
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
        await expect(page.locator('#chat .mes[is_user="true"]').filter({ hasText: 'Serialized submit proof.' })).toHaveCount(1);
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
        const composer = page.locator('#send_textarea');
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
        await expectMainChatStreamingRendererStaysOnSameReactRow(page, assistantMessageId);
        await expect(streamingRow.locator('.mes_text')).toContainText('Unified composer transport.');

        await page.getByRole('button', { name: '中止请求' }).click({ timeout: 5_000 });
        await expect(page.getByRole('button', { name: '中止请求' })).toBeHidden();
        await expect(page.locator('body')).not.toHaveAttribute('data-generating', 'true');
        await expectMainChatTransportMarkersRetired(page);
    });

    test('composer bridge follows legacy disconnect sendability', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterInFreshChat(page, characterName);
        await enableOpenAiStreaming(page);

        const composer = page.locator('#send_textarea');
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

        await expect(page.locator('#send_but')).toBeHidden();
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
        // The stop button is shown during preparation too. Wait for the
        // transport itself so this test exercises an in-flight fetch abort.
        await expect.poll(() => page.evaluate(() => window.__emberdeskStreamingRequests.length)).toBe(1);
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
        expect(await page.evaluate(() => window.__emberdeskStreamingAbortCount)).toBe(1);
        await expect(page.locator('#chat .mes').filter({ hasText: 'This reply should never land because the request is aborted.' })).toHaveCount(0);
        await expect(page.locator('body')).not.toHaveAttribute('data-generating', 'true');
        await expect(page.getByRole('button', { name: 'Retry generation' })).toHaveCount(0);
    });

    test('quiet helper generation returns text without a visible row or transport-owner marker', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterInFreshChat(page, characterName);
        await enableOpenAiStreaming(page, { streamOpenAi: false });
        await installNonStreamingFetchStub(page, {
            content: 'Quiet helper reply.',
            delayMs: 200,
        });

        const messageCountBefore = await page.locator('#chat .mes[mesid]').count();
        await startQuietPromptGeneration(page, {
            quietPrompt: 'Return only a deterministic helper sentence.',
        });

        await expectMainChatQuietTransportMarkersRetired(page);

        await waitForGeneration(page);
        await expectMainChatQuietTransportMarkersRetired(page);
        await expect(page.locator('#chat .mes[mesid]')).toHaveCount(messageCountBefore);

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

        const messageCountBefore = await page.locator('#chat .mes[mesid]').count();
        await startQuietPromptGeneration(page, {
            quietPrompt: 'Choose one background title only.',
            backgroundGeneration: true,
        });

        await expectMainChatQuietTransportMarkersRetired(page);

        await waitForGeneration(page);
        await expectMainChatQuietTransportMarkersRetired(page);
        await expect(page.locator('#chat .mes[mesid]')).toHaveCount(messageCountBefore);

        const quietReply = await page.evaluate(() => window.__emberdeskStreamingGenerationResult);
        expect(quietReply).toBe('Beach sunset');
    });

    test('visible slash automation observes autocomplete, execution, pause, continue, and abort through the public generation adapter', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterInFreshChat(page, characterName);

        const composer = page.locator('#send_textarea');
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

    test('React slash details render dynamic help as sanitized HTML', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterInFreshChat(page, characterName);
        await page.evaluate(async () => {
            const { SlashCommandParser } = await import('/scripts/slash-commands/SlashCommandParser.js');
            const { SlashCommand } = await import('/scripts/slash-commands/SlashCommand.js');
            const { SlashCommandArgument } = await import('/scripts/slash-commands/SlashCommandArgument.js');
            const attack = '<img src="data:image/png;base64,AA==" onerror="window.__reactSlashHelpXss=1"><a href="javascript:alert(1)">unsafe link</a>';
            window.__reactSlashHelpXss = 0;
            SlashCommandParser.addCommandObject(SlashCommand.fromProps({
                name: 'secureproof',
                helpString: `<strong>Safe help</strong>${attack}`,
                unnamedArgumentList: [SlashCommandArgument.fromProps({ description: `<em>Safe argument</em>${attack}` })],
            }));
        });

        const composer = page.locator('#send_textarea');
        await composer.focus();
        await composer.pressSequentially('/securep');
        await expectMainChatSlashUiOwner(page, { visible: true });
        await composer.pressSequentially('roof');
        const details = page.locator('[data-main-chat-slash-ui-details="react"]');
        await expect(details).toContainText('Safe help');
        await expect(details).toContainText('Safe argument');
        await expect(details.locator('[onerror], a[href^="javascript:"]')).toHaveCount(0);
        expect(await page.evaluate(() => window.__reactSlashHelpXss)).toBe(0);
    });

    test('pipeline incompatible model never retries or reaches fallback provider', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterInFreshChat(page, characterName);
        await enableOpenAiStreaming(page);
        await enableFallbackProvider(page);
        await page.evaluate(async () => {
            const context = window.SillyTavern.getContext();
            context.featureSettings.tool_bindings = [{ id: 'terminal_test', name: 'analyze', enabled: true, description: 'analyze', parameters: { type: 'object', properties: {} }, actionBody: 'return "ok";' }];
            context.chatCompletionSettings.reply_pipeline = { enabled: true, steps: [{ tool: 'analyze', model: 'o1' }] };
            const { syncPipelineToolBindings } = await import('/scripts/tool-bindings.js');
            syncPipelineToolBindings(['analyze'], { activate: true });
        });
        await installStreamingFetchSequenceStub(page, { responses: [{ chunks: ['must not send'] }] });
        await startGeneration(page, 'Incompatible pipeline model proof');
        await page.evaluate(async () => { try { await window.__emberdeskStreamingGeneration; } catch { /* reported by generation */ } });
        expect(await page.evaluate(() => window.__emberdeskStreamingRequests)).toHaveLength(0);
        await expect(page.locator('#toast-container')).toContainText('does not support tools');
    });

    test('pipeline streaming recovery records the successful fallback model on the reused row', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterInFreshChat(page, characterName);
        await enableOpenAiStreaming(page);
        await enableFallbackProvider(page);
        await page.evaluate(async () => {
            const context = window.SillyTavern.getContext();
            context.featureSettings.tool_bindings = [{ id: 'recovery_test', name: 'analyze', enabled: true, description: 'analyze', parameters: { type: 'object', properties: {} }, actionBody: 'return "ok";' }];
            context.chatCompletionSettings.reply_pipeline = { enabled: true, steps: [{ tool: 'analyze', model: 'gpt-4.1-mini' }] };
            const { syncPipelineToolBindings } = await import('/scripts/tool-bindings.js');
            syncPipelineToolBindings(['analyze'], { activate: true });
        });

        await installStreamingFetchSequenceStub(page, { responses: [
            { chunks: ['discarded partial'], failAfterChunks: true },
            { chunks: [] },
            { chunks: ['successful fallback'] },
        ] });
        await startGeneration(page, 'Pipeline recovery model proof');
        await waitForGeneration(page);
        const actual = await page.evaluate(() => ({
            requests: window.__emberdeskStreamingRequests.map(request => request.model),
            reply: window.SillyTavern.getContext().chat.findLast(message => String(message.mes).includes('successful fallback')),
        }));
        expect(actual.requests).toEqual(['gpt-4.1-mini', 'gpt-4.1-mini', 'fallback-model']);
        expect(actual.reply?.extra?.model).toBe('fallback-model');
    });

    test('pipeline recovery keeps successful model on streamed text with tool call', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterInFreshChat(page, characterName);
        await enableOpenAiStreaming(page);
        await enableFallbackProvider(page);
        await page.evaluate(async () => {
            const context = window.SillyTavern.getContext();
            context.featureSettings.tool_bindings = [{ id: 'recovery_tool', name: 'analyze', enabled: true, description: 'analyze', parameters: { type: 'object', properties: {} }, actionBody: 'return "ok";' }];
            context.chatCompletionSettings.reply_pipeline = { enabled: true, steps: [{ tool: 'analyze', model: 'gpt-4.1-mini' }, { tool: 'analyze', model: 'gpt-4.1' }] };
            const { promptManager } = await import('/scripts/openai.js');
            const settings = context.chatCompletionSettings;
            settings.prompts.push({ identifier: 'attempt4_model', name: 'Attempt 4 model', role: 'system', content: 'ATTEMPT4 MODEL={{model}} {{setvar::attempt5_nested::{{model}}}}{{incvar::attempt5_count}}COUNT={{getvar::attempt5_count}} STORED={{getvar::attempt5_nested}} RANDOM={{random::alpha::beta::gamma}}', marker: false, system_prompt: false, injection_position: 0, injection_depth: 4, injection_order: 100, injection_trigger: ['pipeline:analyze'] });
            const { setLocalVariable } = await import('/scripts/variables.js');
            setLocalVariable('attempt5_count', 0);
            const characterId = promptManager.activeCharacter?.id ?? null;
            let order = settings.prompt_order.find(item => String(item.character_id) === String(characterId));
            if (!order) { order = { character_id: characterId, order: [] }; settings.prompt_order.push(order); }
            order.order.push({ identifier: 'attempt4_model', enabled: true });
            const { syncPipelineToolBindings } = await import('/scripts/tool-bindings.js');
            syncPipelineToolBindings(['analyze'], { activate: true });
            const { eventSource, event_types } = await import('/scripts/events.js');
            window.__attempt3Received = [];
            eventSource.on(event_types.MESSAGE_RECEIVED, id => {
                const message = context.chat[id];
                if (message?.mes?.includes('fallback intermediary')) window.__attempt3Received.push(structuredClone(message));
            });

        });
        await installStreamingFetchSequenceStub(page, { responses: [
            { chunks: ['discarded partial'], failAfterChunks: true },
            { chunks: [] },
            { chunks: ['fallback intermediary', { tool_calls: [{ index: 0, id: 'call_fallback', type: 'function', function: { name: 'analyze', arguments: '{}' } }] }] },
            { chunks: ['next step response'] },
        ] });
        await startGeneration(page, 'Pipeline fallback tool provenance');
        await waitForGeneration(page);
        const observed = await page.evaluate(async () => ({ requests: window.__emberdeskStreamingRequests, received: window.__attempt3Received, count: (await import('/scripts/variables.js')).getLocalVariable('attempt5_count'), nested: (await import('/scripts/variables.js')).getLocalVariable('attempt5_nested') }));
        expect(observed.requests.slice(0, 3).map(request => request.model)).toEqual(['gpt-4.1-mini', 'gpt-4.1-mini', 'fallback-model']);
        expect(JSON.stringify(observed.requests[0].messages)).toContain('ATTEMPT4 MODEL=gpt-4.1-mini');
        expect(JSON.stringify(observed.requests[2].messages)).toContain('ATTEMPT4 MODEL=gpt-4.1-mini');
        expect(JSON.stringify(observed.requests[0].messages)).toContain('COUNT=1');
        expect(JSON.stringify(observed.requests[2].messages)).toContain('COUNT=1');
        expect(Number(observed.count)).toBe(1);
        expect(observed.nested).toBe('gpt-4.1-mini');
        expect(JSON.stringify(observed.requests[0].messages)).toContain('STORED=gpt-4.1-mini');
        expect(JSON.stringify(observed.requests[2].messages)).toContain('STORED=gpt-4.1-mini');
        expect(JSON.stringify(observed.requests)).not.toContain('PIPELINE_MODEL_');
        const firstRandom = JSON.stringify(observed.requests[0].messages).match(/RANDOM=(alpha|beta|gamma)/)?.[1];
        expect(firstRandom).toBeTruthy();
        expect(JSON.stringify(observed.requests[2].messages)).toContain(`RANDOM=${firstRandom}`);
        expect(observed.received.length).toBeGreaterThan(0);
        expect(observed.received[0].extra.model).toBe('fallback-model');
    });

    test('ordinary streaming tool continuation failure recovers through the parent attempt', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterInFreshChat(page, characterName);
        await enableOpenAiStreaming(page);
        await enableFallbackProvider(page);
        await page.evaluate(async () => {
            const context = window.SillyTavern.getContext();
            context.chatCompletionSettings.reply_pipeline = { enabled: true, steps: [] };
            context.featureSettings.tool_bindings = [{ id: 'ordinary_tool', name: 'analyze', enabled: true, description: 'analyze', parameters: { type: 'object', properties: {} }, actionBody: 'return "ordinary tool result";' }];
            const { syncPipelineToolBindings } = await import('/scripts/tool-bindings.js');
            syncPipelineToolBindings(['analyze'], { activate: true });
        });
        await installStreamingFetchSequenceStub(page, { responses: [
            { chunks: [{ tool_calls: [{ index: 0, id: 'ordinary_call', type: 'function', function: { name: 'analyze', arguments: '{}' } }] }] },
            { status: 503 }, { chunks: ['ordinary recovered'] },
        ] });
        await startGeneration(page, 'ordinary tool continuation recovery');
        await waitForGeneration(page);
        const actual = await page.evaluate(() => ({ requests: window.__emberdeskStreamingRequests, chat: window.SillyTavern.getContext().chat }));
        expect(actual.requests).toHaveLength(3);
        expect(JSON.stringify(actual.chat)).toContain('ordinary recovered');
    });

    test('pipeline switches stream consumption across preset o1 and fallback recovery', async ({ page }) => {

        await testSetup.awaitST({ page });
        await selectCharacterInFreshChat(page, characterName);
        await enableOpenAiStreaming(page);
        await enableFallbackProvider(page);
        await page.evaluate(async () => {
            const context = window.SillyTavern.getContext();
            context.chatCompletionSettings.openai_model = 'o1';
            context.featureSettings.tool_bindings = [{ id: 'stream_modes', name: 'analyze', enabled: true, description: 'analyze', parameters: { type: 'object', properties: {} }, actionBody: 'return JSON.stringify({ ok: true });' }];
            context.chatCompletionSettings.reply_pipeline = { enabled: true, steps: [{ tool: 'analyze', model: 'gpt-4o-mini' }], final: 'analyze' };
            const { syncPipelineToolBindings } = await import('/scripts/tool-bindings.js');
            syncPipelineToolBindings(['analyze'], { activate: true });
        });
        await installStreamingFetchSequenceStub(page, { responses: [
            { chunks: [{ tool_calls: [{ index: 0, id: 'call_modes', type: 'function', function: { name: 'analyze', arguments: '{}' } }] }] },
            { status: 500 }, { status: 500 }, { chunks: ['streaming fallback succeeded'] },
        ] });
        await startGeneration(page, 'Pipeline cross mode recovery');
        await waitForGeneration(page);
        const actual = await page.evaluate(async () => ({ requests: window.__emberdeskStreamingRequests, chat: window.SillyTavern.getContext().chat, run: (await import('/scripts/reply-pipeline-core.js')).getPipelineRunState() }));

        expect(actual.requests.map(request => [request.model, request.stream])).toEqual([
            ['gpt-4o-mini', true], ['o1', false], ['o1', false], ['fallback-model', true],
        ]);
        expect(actual.chat.findLast(message => String(message.mes).includes('streaming fallback succeeded'))?.extra?.model).toBe('fallback-model');
        for (const request of actual.requests.slice(1)) {
            expect(JSON.stringify(request.messages)).toContain('call_modes');
            expect(JSON.stringify(request.messages)).toContain('{\\"ok\\":true}');
            expect(JSON.stringify(request.messages)).toContain('Do not call any tools');
        }
        expect(actual.requests[3].tool_choice).toBe('none');
        expect(actual.run).toBeNull();
    });

    test('pipeline retries the unfinished second step without replaying the completed tool', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterInFreshChat(page, characterName);
        await enableOpenAiStreaming(page);
        await enableFallbackProvider(page);
        await page.evaluate(async () => {
            const context = window.SillyTavern.getContext();
            context.featureSettings.tool_bindings = ['analyze', 'review'].map(name => ({ id: name, name, enabled: true, description: name, parameters: { type: 'object', properties: {} }, actionBody: name === 'analyze' ? 'window.__completedToolCount = (window.__completedToolCount || 0) + 1; return "FIRST_RESULT";' : 'return "FINAL_RESULT";' }));
            context.chatCompletionSettings.reply_pipeline = { enabled: true, enforce_mode: 'forced', steps: [{ tool: 'analyze', model: 'gpt-4.1-mini' }, { tool: 'review', model: 'gpt-4.1' }], final: 'review' };
            const { promptManager } = await import('/scripts/openai.js');
            const settings = context.chatCompletionSettings;
            const characterId = promptManager.activeCharacter?.id ?? null;
            let order = settings.prompt_order.find(item => String(item.character_id) === String(characterId));
            if (!order) { order = { character_id: characterId, order: [] }; settings.prompt_order.push(order); }
            for (const step of ['analyze', 'review']) {
                const identifier = `attempt4_${step}`;
                settings.prompts.push({ identifier, name: identifier, role: 'system', content: `STEP_${step} MODEL={{model}}`, marker: false, system_prompt: false, injection_position: 0, injection_depth: 4, injection_order: 100, injection_trigger: [`pipeline:${step}`] });
                order.order.push({ identifier, enabled: true });
            }
            const { syncPipelineToolBindings } = await import('/scripts/tool-bindings.js');
            syncPipelineToolBindings(['analyze', 'review'], { activate: true });
        });
        await installStreamingFetchSequenceStub(page, { responses: [
            { chunks: [{ tool_calls: [{ index: 0, id: 'call_first', type: 'function', function: { name: 'analyze', arguments: '{}' } }] }] },
            { status: 500 }, { status: 500 },
            { chunks: [{ tool_calls: [{ index: 0, id: 'call_second', type: 'function', function: { name: 'review', arguments: '{}' } }] }] },
        ] });
        await startGeneration(page, 'Pipeline second step recovery');
        await waitForGeneration(page);
        const actual = await page.evaluate(async () => ({ requests: window.__emberdeskStreamingRequests, count: window.__completedToolCount, chat: window.SillyTavern.getContext().chat, run: (await import('/scripts/reply-pipeline-core.js')).getPipelineRunState() }));
        expect(actual.requests.map(request => request.model)).toEqual(['gpt-4.1-mini', 'gpt-4.1', 'gpt-4.1', 'fallback-model']);
        expect(actual.count).toBe(1);
        for (const request of actual.requests.slice(1)) {
            expect(JSON.stringify(request.messages)).toContain('FIRST_RESULT');
            expect(JSON.stringify(request.messages)).toContain('STEP_analyze MODEL=gpt-4.1-mini');
            expect(request.tool_choice.function.name).toBe('review');
        }
        expect(JSON.stringify(actual.requests[1].messages)).toContain('STEP_review MODEL=gpt-4.1');
        expect(JSON.stringify(actual.requests[3].messages)).toContain('STEP_review MODEL=gpt-4.1');
        expect(JSON.stringify(actual.chat)).toContain('FINAL_RESULT');
        expect(actual.run).toBeNull();
    });

    test('pipeline clears its run after nested recovery is exhausted', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterInFreshChat(page, characterName);
        await enableOpenAiStreaming(page);
        await enableFallbackProvider(page);
        await page.evaluate(async () => {
            const context = window.SillyTavern.getContext();
            context.featureSettings.tool_bindings = [{ id: 'fail_close', name: 'analyze', enabled: true, description: 'analyze', parameters: { type: 'object', properties: {} }, actionBody: 'window.__completedToolCount = (window.__completedToolCount || 0) + 1; return JSON.stringify({ ok: true });' }];
            context.chatCompletionSettings.reply_pipeline = { enabled: true, steps: [{ tool: 'analyze', model: 'gpt-4o-mini' }], final: 'analyze' };
            const { syncPipelineToolBindings } = await import('/scripts/tool-bindings.js');
            syncPipelineToolBindings(['analyze'], { activate: true });
        });
        await installStreamingFetchSequenceStub(page, { responses: [
            { chunks: [{ tool_calls: [{ index: 0, id: 'call_once', type: 'function', function: { name: 'analyze', arguments: '{}' } }] }] },
            { status: 500 }, { status: 500 }, { status: 500 },
        ] });
        await startGeneration(page, 'Pipeline exhausted recovery');
        await waitForGeneration(page).catch(() => {});
        const actual = await page.evaluate(async () => ({ requests: window.__emberdeskStreamingRequests, count: window.__completedToolCount, run: (await import('/scripts/reply-pipeline-core.js')).getPipelineRunState() }));
        expect(actual.requests).toHaveLength(4);
        expect(actual.count).toBe(1);
        expect(actual.run).toBeNull();
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

        const userRows = page.locator('#chat .mes[is_user="true"]').filter({ hasText: 'Start a deterministic fallback recovery proof.' });
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
        expect(requests[2].model).toBe('fallback-model');
        // Model-only override: same endpoint and credential as the primary attempt.
        expect(requests[2].custom_url).toBe(requests[0].custom_url);
        expect(requests[2]).not.toHaveProperty('openai_secret_marker');
        expect(requests[2]).not.toHaveProperty('reverse_proxy');
        expect(requests[2]).not.toHaveProperty('proxy_password');

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

    test('parses fallback stream with fallback source after primary failures', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterInFreshChat(page, characterName);
        await enableOpenAiStreaming(page);
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
        expect(requests[0].chat_completion_source).toBe('openai');
        expect(requests[1].chat_completion_source).toBe('openai');
        expect(requests[2].chat_completion_source).toBe('openai');
        expect(requests[2].model).toBe('fallback-model');
        expect(requests[2].custom_url).toBe(requests[0].custom_url);
        expect(requests[2]).not.toHaveProperty('openai_secret_marker');
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
        await expect(page.locator('#chat .mes[is_user="false"][is_system="false"][mesid]').filter({ hasText: 'Unexpected retry.' })).toHaveCount(0);
        await expect(page.locator('.generation_auto_recovery_status')).toHaveCount(0);

        const requestCount = await page.evaluate(() => window.__emberdeskStreamingRequests.length);
        expect(requestCount).toBe(1);
    });

    test('provider failure leaves a readable recovery path without duplicating rows', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterInFreshChat(page, characterName);
        // Simulate a persisted setting left by an earlier fallback-enabled session.
        await enableFallbackProvider(page);
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

        const recovery = page.locator('#send_but');
        await expect(recovery).toBeVisible();
        await expect(assistantRowsAfterFailure.locator('.generation_failure_notice')).toContainText(/生成失败|Generation failed/);
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
            `#chat .mes[mesid="${assistantMessageIdForGeneration(lastVisibleMessageIdBeforeGeneration)}"]`,
        )).toHaveCount(1);
        const failedAttemptModels = await page.evaluate(() => window.__emberdeskStreamingRequests.map(request => request.model));
        expect(failedAttemptModels).toEqual(['gpt-4o-mini', 'gpt-4o-mini']);

        await installStreamingFetchStub(page, {
            chunks: ['Recovered ', 'retry text.'],
            delayMs: 120,
        });
        await recovery.click();
        await expectMainChatTransportMarkersRetired(page);
        const recoveredRow = assistantRowForGeneration(page, lastVisibleMessageIdBeforeGeneration + 2);
        await expect(recoveredRow.locator('.mes_text')).toContainText('Recovered retry text.');
        await expect(page.locator('body')).not.toHaveAttribute('data-generating', 'true');
        await expect.poll(async () => page.evaluate(() => window.SillyTavern.getContext().streamingProcessor === null)).toBe(true);
        await expect(userRow).toHaveCount(1);
        await expect(assistantRowsAfterFailure).toHaveCount(1);
        await expect(page.locator('#chat .mes[is_user="true"]').filter({ hasText: 'Start a deterministic provider failure proof.' })).toHaveCount(1);
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
            `#chat .mes[is_user="false"][is_system="false"][mesid="${assistantMessageIdForGeneration(lastVisibleMessageIdBeforeGeneration) + 1}"]`,
        );

        await expect(userRow.locator('.mes_text')).toContainText('Start a deterministic fallback recovery proof.');
        await expect(assistantRow).toHaveCount(1);
        await expect(assistantRow.locator('.mes_text')).toContainText('Fallback final reply.');
        await expect(assistantRow.locator('.mes_text')).not.toContainText('Primary partial text.');
        await expect(duplicateAssistantRow).toHaveCount(0);
        await expect(assistantRow.getByRole('button', { name: 'Retry generation' })).toBeHidden();

        const requestBodies = await page.evaluate(() => window.__emberdeskStreamingRequests);
        expect(requestBodies).toHaveLength(3);
        expect(requestBodies[0].chat_completion_source).toBe('openai');
        expect(requestBodies[1].chat_completion_source).toBe('openai');
        expect(requestBodies[2].model).toBe('fallback-model');
        expect(requestBodies[2].custom_url).toBe(requestBodies[0].custom_url);
        expect(requestBodies[2]).not.toHaveProperty('openai_secret_marker');
        expect(requestBodies[2]).not.toHaveProperty('reverse_proxy');
        expect(requestBodies[2]).not.toHaveProperty('proxy_password');

        const messageEvents = await page.evaluate(() => window.__emberdeskStreamingMessageEvents);
        const renderedEvents = await page.evaluate(() => window.__emberdeskStreamingRenderedEvents);
        expect(messageEvents).toHaveLength(1);
        expect(renderedEvents).toHaveLength(1);
        expect(messageEvents[0].messageId).toBe(assistantMessageIdForGeneration(lastVisibleMessageIdBeforeGeneration));
        expect(renderedEvents[0].messageId).toBe(assistantMessageIdForGeneration(lastVisibleMessageIdBeforeGeneration));
    });

    test('provider failure before first token still restores composer recovery', async ({ page }) => {
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
        await expect(failedRow.locator('.generation_failure_notice')).toContainText(/生成失败|Generation failed/);
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

    test('composer F7 keeps Enter as a newline on mobile', async ({ page }) => {
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'userAgent', {
                configurable: true,
                get: () => 'Mozilla/5.0 (Linux; Android 10; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
            });
        });
        await page.setViewportSize({ width: 390, height: 844 });
        await testSetup.awaitST({ page });
        await selectCharacterInFreshChat(page, characterName);
        await enableOpenAiStreaming(page);
        await installStreamingFetchStub(page, { chunks: ['Unexpected send.'] });
        const composer = page.locator('#send_textarea');
        await composer.fill('mobile draft');
        await composer.press('Enter');
        await expect(composer).toHaveValue('mobile draft\n');
        expect(await page.evaluate(() => window.__emberdeskStreamingRequests.length)).toBe(0);
    });

    test('keeps streaming stop and failure recovery reachable on mobile viewports', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterInFreshChat(page, characterName);
        await enableOpenAiStreaming(page);

        for (const viewport of mobileViewports) {
            await page.setViewportSize({ width: viewport.width, height: viewport.height });
            const composer = page.locator('#send_textarea');
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
            await expect(failedRow.locator('.generation_failure_notice')).toContainText(/生成失败|Generation failed/);
            const failedRequestCount = await page.evaluate(() => window.__emberdeskStreamingRequests.length);
            expect(failedRequestCount).toBe(2);
        }
    });
});
