import { test, expect } from '@playwright/test';

import { testSetup } from './frontend/frontent-test-utils.js';

test.setTimeout(120_000);

const toolBinding = {
    id: 'tb_e2e_game_content',
    enabled: true,
    name: 'game_content',
    displayName: 'Game Content',
    description: 'All output goes inside the content parameter.',
    parameters: {
        type: 'object',
        properties: { content: { type: 'string' } },
        required: ['content'],
    },
    actionBody: 'return JSON.stringify({ ok: true, echoed: args.content.length > 0 });',
    formatMessageBody: '',
    stealth: false,
};

async function prepareOpenAiProvider(page) {
    await page.evaluate(() => {
        const context = window.SillyTavern.getContext();
        context.chatCompletionSettings.chat_completion_source = 'openai';
        context.chatCompletionSettings.openai_model = 'gpt-4o-mini';
        // Non-streaming path: parseToolCalls handles choices[].message.tool_calls.
        context.chatCompletionSettings.stream_openai = false;
        context.chatCompletionSettings.n = 1;
    });
    await page.evaluate(async () => {
        const script = await import('/script.js');
        script.changeMainAPI('openai');
        script.setOnlineStatus('Valid');
        script.activateSendButtons();
    });
}

async function installGenerateStub(page) {
    await page.evaluate(() => {
        window.__emberdeskToolRequests = [];
        window.__emberdeskToolGenerationError = null;
        window.__emberdeskOriginalFetch ??= window.fetch.bind(window);

        window.fetch = async (input, init = {}) => {
            const url = typeof input === 'string' ? input : input.url;
            if (!String(url).endsWith('/api/backends/chat-completions/generate')) {
                return window.__emberdeskOriginalFetch(input, init);
            }

            const body = JSON.parse(String(init.body ?? '{}'));
            window.__emberdeskToolRequests.push(body);
            const messages = Array.isArray(body.messages) ? body.messages : [];
            // Route by request content, not arrival order — unrelated automatic
            // generations can fire around the one under test.
            const hasToolResult = messages.some(message => message?.role === 'tool');
            const isTargetTurn = messages.some(message => String(message?.content ?? '').includes('tool binding e2e message'));
            const payload = !hasToolResult && isTargetTurn
                ? {
                    choices: [{
                        index: 0,
                        message: {
                            role: 'assistant',
                            content: null,
                            tool_calls: [{
                                id: 'call_e2e_1',
                                type: 'function',
                                function: {
                                    name: 'game_content',
                                    arguments: JSON.stringify({ content: 'TOOL_PAYLOAD_CONTENT' }),
                                },
                            }],
                        },
                        finish_reason: 'tool_calls',
                    }],
                }
                : {
                    choices: [{
                        index: 0,
                        message: { role: 'assistant', content: 'FINAL_ANSWER_TEXT' },
                        finish_reason: 'stop',
                    }],
                };
            return new Response(JSON.stringify(payload), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        };
    });
}

/**
 * Stubs the generate endpoint for reply-pipeline turns: each round answers with
 * the next not-yet-called pipeline step as a tool call; requests without a step
 * prompt (or with every step already called) get a plain-text reply.
 */
async function installPipelineStub(page, { steps, closingText = 'PIPELINE_FINAL_REPLY' }) {
    await page.evaluate(({ steps, closingText }) => {
        window.__emberdeskToolRequests = [];
        window.__emberdeskToolGenerationError = null;
        window.__emberdeskOriginalFetch ??= window.fetch.bind(window);

        const toolCallPayload = (name, args) => ({
            choices: [{
                index: 0,
                message: {
                    role: 'assistant',
                    content: null,
                    tool_calls: [{
                        id: `call_e2e_${name}`,
                        type: 'function',
                        function: { name, arguments: JSON.stringify(args) },
                    }],
                },
                finish_reason: 'tool_calls',
            }],
        });

        window.fetch = async (input, init = {}) => {
            const url = typeof input === 'string' ? input : input.url;
            if (!String(url).endsWith('/api/backends/chat-completions/generate')) {
                return window.__emberdeskOriginalFetch(input, init);
            }

            const body = JSON.parse(String(init.body ?? '{}'));
            window.__emberdeskToolRequests.push(body);
            const messages = Array.isArray(body.messages) ? body.messages : [];
            const hasStepPrompt = messages.some(message => String(message?.content ?? '').includes('[Reply pipeline'));
            const calledNames = messages
                .filter(message => Array.isArray(message.tool_calls))
                .flatMap(message => message.tool_calls.map(toolCall => toolCall?.function?.name));
            const nextStep = steps.find(step => !calledNames.includes(step));

            let payload;
            if (!hasStepPrompt || !nextStep) {
                payload = {
                    choices: [{
                        index: 0,
                        message: { role: 'assistant', content: closingText },
                        finish_reason: 'stop',
                    }],
                };
            } else {
                const args = nextStep === 'respond'
                    ? { content: 'RESPOND_TEXT', options: ['Take the tea', 'Ask about the glade'] }
                    : { content: `${nextStep.toUpperCase()}_TEXT` };
                payload = toolCallPayload(nextStep, args);
            }

            return new Response(JSON.stringify(payload), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        };
    }, { steps, closingText });
}

// All tests share the seeded user's settings document, so they must not run
// concurrently — tool_bindings mutations would race each other.
test.describe.configure({ mode: 'serial' });

test.describe('tool bindings', () => {
    test('tools tab editor creates a persisted, registered binding', async ({ page }) => {
        await testSetup.awaitST({ page });

        // Open the regex drawer through the shell nav and switch to the tools tab.
        const navButton = page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '正则' }).first();
        await navButton.click({ timeout: 10_000 });
        await expect(page.locator('#RegexPanel.openDrawer')).toBeVisible({ timeout: 10_000 });
        await expect(page.locator('#RegexPanel #open_regex_editor')).toBeVisible({ timeout: 10_000 });

        await page.locator('#RegexPanel .wpc-tab').filter({ hasText: '工具绑定' }).click();
        await expect(page.locator('#RegexPanel #tool_bindings_tab_content')).toBeVisible();
        await expect(page.locator('#RegexPanel #regex_tab_content')).toBeHidden();

        // The delegated click handler lives in the deferred tool-bindings init.
        await expect(page.locator('#RegexPanel')).toHaveAttribute('data-tool-bindings-init', 'true', { timeout: 15_000 });
        await page.locator('#open_tool_binding_editor').click();
        await expect(page.locator('#tool_binding_editor_template')).toBeVisible({ timeout: 10_000 });
        await page.locator('#tb_name').fill('e2e_ui_tool');
        await page.locator('#tb_description').fill('created through the editor popup');
        await page.locator('#tb_action_body').fill('return { ok: true };');
        await page.locator('.popup-button-ok').click();
        await expect(page.locator('#tool_binding_editor_template')).toHaveCount(0);

        // The new binding renders in the list, persists in feature_settings,
        // and is registered with ToolManager.
        await expect(page.locator('#saved_tool_bindings')).toContainText('e2e_ui_tool');
        const stored = await page.evaluate(() => {
            return window.SillyTavern.getContext().featureSettings.tool_bindings.map(binding => binding.name);
        });
        expect(stored).toContain('e2e_ui_tool');
        const registered = await page.evaluate(() => {
            return window.SillyTavern.getContext().ToolManager.tools.map(tool => tool.toFunctionOpenAI().function.name);
        });
        expect(registered).toContain('e2e_ui_tool');

        // Switching back to the regex tab keeps the legacy controls functional.
        await page.locator('#RegexPanel .wpc-tab').filter({ hasText: /^正则$/ }).click();
        await expect(page.locator('#RegexPanel #open_regex_editor')).toBeVisible();
    });

    test('enabled binding registers at boot, travels in tools, and its result recurses', async ({ page }) => {
        await testSetup.awaitST({ page });

        // Persist through the real settings save path, then reload so the
        // SETTINGS_LOADED wiring performs registration exactly as at boot.
        await page.evaluate(async (binding) => {
            const script = await import('/script.js');
            const context = window.SillyTavern.getContext();
            context.featureSettings.tool_bindings = [binding];
            await script.saveSettings();
        }, toolBinding);
        await page.reload();
        await testSetup.awaitST({ page });

        await expect.poll(async () => page.evaluate(() => {
            return window.SillyTavern.getContext().ToolManager.tools.map(tool => tool.toFunctionOpenAI().function.name);
        }), { timeout: 30_000 }).toContain('game_content');

        await installGenerateStub(page);
        await prepareOpenAiProvider(page);

        await page.evaluate(() => {
            const textarea = document.querySelector('#send_textarea');
            textarea.value = 'tool binding e2e message';
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            window.__emberdeskToolGeneration = window.SillyTavern.getContext()
                .generate('normal', { automatic_trigger: false })
                .catch(error => {
                    window.__emberdeskToolGenerationError = String(error?.message ?? error);
                });
        });

        await expect.poll(() => page.evaluate(() => window.__emberdeskToolRequests?.length ?? 0), { timeout: 30_000 })
            .toBeGreaterThanOrEqual(2);
        const generationError = await page.evaluate(() => window.__emberdeskToolGenerationError);
        expect(generationError).toBeNull();

        const requests = await page.evaluate(() => window.__emberdeskToolRequests);

        // Locate our turn by the typed user message — earlier automatic
        // generations can interleave with the requests under test.
        const callRequest = requests.find(request => request.messages?.some(message => String(message?.content ?? '').includes('tool binding e2e message')));
        expect(callRequest).toBeTruthy();
        expect(callRequest.tools?.some(tool => tool?.function?.name === 'game_content')).toBe(true);
        expect(callRequest.tool_choice).toBe('auto');

        const recursionRequest = requests.find(request => request.messages?.some(message => message?.role === 'tool'));
        expect(recursionRequest).toBeTruthy();
        const toolMessage = recursionRequest.messages.find(message => message.role === 'tool');
        expect(String(toolMessage.content)).toContain('ok');

        // The assistant tool call precedes the tool result message.
        const toolCallMessage = recursionRequest.messages.find(message => Array.isArray(message.tool_calls));
        expect(toolCallMessage).toBeTruthy();

        // The final assistant reply is rendered into the chat.
        await expect(page.locator('#chat').last()).toContainText('FINAL_ANSWER_TEXT', { timeout: 15_000 });

        // Flip the required flag — the next request must force a tool call.
        await page.evaluate(async () => {
            const script = await import('/script.js');
            window.SillyTavern.getContext().featureSettings.tool_choice_required = true;
            await script.saveSettings();
        });
        await page.evaluate(() => {
            const textarea = document.querySelector('#send_textarea');
            textarea.value = 'required e2e message';
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            window.SillyTavern.getContext()
                .generate('normal', { automatic_trigger: false })
                .catch(() => { });
        });
        await expect.poll(() => page.evaluate(() =>
            window.__emberdeskToolRequests?.some(request => request.tool_choice === 'required') ?? false,
        ), { timeout: 30_000 }).toBe(true);
    });

    test('disabled binding is stored but not registered', async ({ page }) => {
        await testSetup.awaitST({ page });

        await page.evaluate(async (binding) => {
            const script = await import('/script.js');
            const context = window.SillyTavern.getContext();
            context.featureSettings.tool_bindings = [{ ...binding, enabled: false }];
            await script.saveSettings();
        }, toolBinding);
        await page.reload();
        await testSetup.awaitST({ page });
        await expect(page.locator('#RegexPanel')).toHaveAttribute('data-tool-bindings-init', 'true', { timeout: 30_000 });

        const names = await page.evaluate(() => {
            return window.SillyTavern.getContext().ToolManager.tools.map(tool => tool.toFunctionOpenAI().function.name);
        });
        expect(names).not.toContain('game_content');

        await installGenerateStub(page);
        await prepareOpenAiProvider(page);
        await page.evaluate(() => {
            const textarea = document.querySelector('#send_textarea');
            textarea.value = 'no tools expected';
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            window.__emberdeskToolGeneration = window.SillyTavern.getContext()
                .generate('normal', { automatic_trigger: false })
                .catch(error => {
                    window.__emberdeskToolGenerationError = String(error?.message ?? error);
                });
        });

        await expect.poll(() => page.evaluate(() => window.__emberdeskToolRequests?.length ?? 0), { timeout: 30_000 })
            .toBeGreaterThanOrEqual(1);
        const requests = await page.evaluate(() => window.__emberdeskToolRequests);
        const callRequest = requests.find(request => request.messages?.some(message => String(message?.content ?? '').includes('no tools expected')));
        expect(callRequest).toBeTruthy();
        expect(callRequest.tools ?? []).toEqual([]);
    });

    test('reply pipeline drives analyze → review → respond, hides the final card, and stops at the final step', async ({ page }) => {
        await testSetup.awaitST({ page });

        const pipelineBindings = ['analyze', 'review', 'respond'].map(name => ({
            id: `tb_e2e_pipeline_${name}`,
            enabled: true,
            name,
            displayName: name,
            description: `${name} step`,
            parameters: {
                type: 'object',
                properties: { content: { type: 'string' } },
                required: ['content'],
            },
            actionBody: name === 'respond'
                ? 'return String(args?.content ?? "");'
                : 'return JSON.stringify({ ok: true });',
            formatMessageBody: '',
            stealth: false,
        }));

        await page.evaluate(async (bindings) => {
            const script = await import('/script.js');
            const { promptManager } = await import('/scripts/openai.js');
            const context = window.SillyTavern.getContext();
            context.featureSettings.tool_bindings = bindings;
            context.chatCompletionSettings.reply_pipeline = {
                enabled: true,
                steps: [
                    { tool: 'analyze', prompt: 'PLAN_FIRST', reasoning_effort: 'low' },
                    { tool: 'review', prompt: 'RATE_PLAN' },
                    { tool: 'respond', prompt: 'WRITE_REPLY' },
                ],
                final: 'respond',
            };
            // A prompt tagged 'pipeline:review' must inject on the review round
            // only; base (all/normal) prompts keep firing on every round.
            const settings = context.chatCompletionSettings;
            if (!promptManager.activeCharacter && Array.isArray(context.characters) && context.characters.length) {
                await context.selectCharacterById(0);
            }
            const characterId = promptManager.activeCharacter?.id ?? null;
            settings.prompts = Array.isArray(settings.prompts) ? settings.prompts : [];
            settings.prompts.push({
                identifier: 'e2e_review_rubric',
                name: 'E2E Review Rubric',
                role: 'system',
                content: 'E2E_REVIEW_RUBRIC_TEXT',
                marker: false,
                system_prompt: false,
                injection_position: 0,
                injection_depth: 4,
                injection_order: 100,
                injection_trigger: ['pipeline:review'],
            });
            settings.prompt_order = Array.isArray(settings.prompt_order) ? settings.prompt_order : [];
            let bucket = settings.prompt_order.find(item => String(item.character_id) === String(characterId));
            if (!bucket) {
                bucket = { character_id: characterId, order: [] };
                settings.prompt_order.push(bucket);
            }
            bucket.order.push({ identifier: 'e2e_review_rubric', enabled: true });
            await script.saveSettings();
        }, pipelineBindings);
        await page.reload();
        await testSetup.awaitST({ page });
        await expect(page.locator('html')).toHaveAttribute('data-reply-pipeline-init', 'true', { timeout: 30_000 });

        // No re-injection: reply_pipeline must survive the settings reload and
        // stay in oai_settings via the preset/settings whitelist. If it were
        // dropped here the pipeline would never start and the run assertions
        // below would fail.
        await installPipelineStub(page, { steps: ['analyze', 'review', 'respond'] });
        await prepareOpenAiProvider(page);

        await page.evaluate(() => {
            const textarea = document.querySelector('#send_textarea');
            textarea.value = 'reply pipeline e2e message';
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            window.__emberdeskToolGeneration = window.SillyTavern.getContext()
                .generate('normal', { automatic_trigger: false })
                .catch(error => {
                    window.__emberdeskToolGenerationError = String(error?.message ?? error);
                });
        });

        await expect.poll(() => page.evaluate(() =>
            window.__emberdeskToolRequests?.some(request => request.messages?.some(message => message?.role === 'tool')) ?? false,
        ), { timeout: 30_000 }).toBe(true);
        await expect.poll(() => page.evaluate(() =>
            window.SillyTavern.getContext().chat.some(message => message?.mes === 'RESPOND_TEXT'),
        ), { timeout: 30_000 }).toBe(true);

        const generationError = await page.evaluate(() => window.__emberdeskToolGenerationError);
        expect(generationError).toBeNull();

        const requests = await page.evaluate(() => window.__emberdeskToolRequests);
        const turnRequests = requests.filter(request => request.messages?.some(message => String(message?.content ?? '').includes('reply pipeline e2e message')));

        // Exactly three rounds: analyze → review → respond. No closing round.
        expect(turnRequests).toHaveLength(3);
        expect(turnRequests[0].messages.some(message => String(message?.content ?? '').includes('[Reply pipeline 1/3]') && String(message?.content ?? '').includes('analyze'))).toBe(true);
        expect(turnRequests[1].messages.some(message => String(message?.content ?? '').includes('[Reply pipeline 2/3]') && String(message?.content ?? '').includes('review'))).toBe(true);
        expect(turnRequests[2].messages.some(message => String(message?.content ?? '').includes('[Reply pipeline 3/3]') && String(message?.content ?? '').includes('respond'))).toBe(true);
        expect(turnRequests[2].tools?.some(tool => tool?.function?.name === 'respond')).toBe(true);

        // A prompt tagged 'pipeline:review' injects only on the review round;
        // the rubric is absent from the analyze and respond rounds.
        const hasRubric = request => request.messages.some(message => String(message?.content ?? '').includes('E2E_REVIEW_RUBRIC_TEXT'));
        expect(turnRequests.map(hasRubric)).toEqual([false, true, false]);

        // The analyze step's reasoning_effort overrides the base value for
        // its round only; later rounds keep the preset-level value.
        expect(turnRequests[0].reasoning_effort).toBe('low');
        expect(turnRequests[1].reasoning_effort).not.toBe('low');

        const chatState = await page.evaluate(() => {
            const chat = window.SillyTavern.getContext().chat;
            return {
                lastMes: chat[chat.length - 1]?.mes,
                pipelineCards: chat
                    .filter(message => typeof message?.extra?.reply_pipeline_run === 'string'
                        && Array.isArray(message?.extra?.tool_invocations))
                    .slice(-3)
                    .map(message => ({
                        step: message.extra.reply_pipeline_step,
                        display: message.extra.reply_pipeline_display,
                        run: message.extra.reply_pipeline_run,
                    })),
            };
        });
        expect(chatState.lastMes).toBe('RESPOND_TEXT');
        expect(chatState.pipelineCards).toHaveLength(3);
        expect(chatState.pipelineCards.map(card => card.display)).toEqual(['summary', 'summary', 'hidden']);
        expect(chatState.pipelineCards.every(card => typeof card.run === 'string' && card.run.startsWith('pipeline-'))).toBe(true);

        // The hidden final card is present in the DOM but visually suppressed.
        await expect(page.locator('#chat .mes.replyPipelineHidden').last()).toHaveCount(1, { timeout: 15_000 });

        // Card internals are rendered through sanitize-proof data-* hooks
        // (MESSAGE_SANITIZE rewrites classes to custom-*, so class selectors
        // would silently miss inside mes content).
        await expect(page.locator('#chat [data-tool-invocations]')).toHaveCount(3);
        await expect(page.locator('#chat [data-tool-invocation]')).toHaveCount(3);
        const cardBorder = await page.evaluate(() => {
            const card = document.querySelector('#chat [data-tool-invocation]');
            return card ? getComputedStyle(card).borderTopWidth : null;
        });
        expect(Number.parseFloat(cardBorder)).toBeGreaterThan(0);

        // Option chips from the respond step's array param are in the hidden
        // final card; a programmatic click still reaches the delegation and
        // fills the composer.
        await expect(page.locator('#chat [data-respond-option]')).toHaveCount(2);
        await page.evaluate(() => document.querySelector('#chat [data-respond-option]').click());
        await expect(page.locator('#send_textarea')).toHaveValue('Take the tea');

        // A later ordinary generation (pipeline disabled) must not carry stale
        // step prompts from the finished run.
        await page.evaluate(() => {
            window.__emberdeskToolRequests = [];
            window.SillyTavern.getContext().chatCompletionSettings.reply_pipeline.enabled = false;
            const textarea = document.querySelector('#send_textarea');
            textarea.value = 'plain follow-up message';
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            window.SillyTavern.getContext()
                .generate('normal', { automatic_trigger: false })
                .catch(() => { });
        });
        await expect.poll(() => page.evaluate(() => window.__emberdeskToolRequests?.length ?? 0), { timeout: 30_000 })
            .toBeGreaterThanOrEqual(1);
        const followUp = await page.evaluate(() => window.__emberdeskToolRequests.find(request =>
            request.messages?.some(message => String(message?.content ?? '').includes('plain follow-up message'))));
        expect(followUp).toBeTruthy();
        expect(followUp.messages.some(message => String(message?.content ?? '').includes('[Reply pipeline'))).toBe(false);
    });

    test('reply pipeline falls back to a closing round without tools when the final result is unusable', async ({ page }) => {
        await testSetup.awaitST({ page });

        const pipelineBindings = ['analyze', 'respond'].map(name => ({
            id: `tb_e2e_fallback_${name}`,
            enabled: true,
            name,
            displayName: name,
            description: `${name} step`,
            parameters: {
                type: 'object',
                properties: { content: { type: 'string' } },
                required: ['content'],
            },
            // respond returns an ok-object: unusable as a reply → fallback round.
            actionBody: 'return JSON.stringify({ ok: true });',
            formatMessageBody: '',
            stealth: false,
        }));

        await page.evaluate(async (bindings) => {
            const script = await import('/script.js');
            const context = window.SillyTavern.getContext();
            context.featureSettings.tool_bindings = bindings;
            context.chatCompletionSettings.reply_pipeline = {
                enabled: true,
                steps: [
                    { tool: 'analyze', prompt: 'PLAN_FIRST' },
                    { tool: 'respond', prompt: 'WRITE_REPLY' },
                ],
                final: 'respond',
            };
            await script.saveSettings();
        }, pipelineBindings);
        await page.reload();
        await testSetup.awaitST({ page });
        await expect(page.locator('html')).toHaveAttribute('data-reply-pipeline-init', 'true', { timeout: 30_000 });

        await installPipelineStub(page, { steps: ['analyze', 'respond'], closingText: 'FALLBACK_REPLY_TEXT' });
        await prepareOpenAiProvider(page);

        await page.evaluate(() => {
            const textarea = document.querySelector('#send_textarea');
            textarea.value = 'reply pipeline e2e message';
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            window.__emberdeskToolGeneration = window.SillyTavern.getContext()
                .generate('normal', { automatic_trigger: false })
                .catch(error => {
                    window.__emberdeskToolGenerationError = String(error?.message ?? error);
                });
        });

        await expect.poll(() => page.evaluate(() =>
            window.SillyTavern.getContext().chat.some(message => message?.mes === 'FALLBACK_REPLY_TEXT'),
        ), { timeout: 30_000 }).toBe(true);

        const requests = await page.evaluate(() => window.__emberdeskToolRequests);
        const turnRequests = requests.filter(request => request.messages?.some(message => String(message?.content ?? '').includes('reply pipeline e2e message')));
        expect(turnRequests).toHaveLength(3);
        const fallbackRequest = turnRequests[2];
        expect(fallbackRequest.tools).toBeUndefined();
        expect(fallbackRequest.tool_choice).toBeUndefined();
        expect(fallbackRequest.messages.some(message => String(message?.content ?? '').includes('Do not call any tools'))).toBe(true);
        // The fallback prompt replaces the step prompt — a numbered
        // "[Reply pipeline i/N]" instruction must not linger alongside it.
        expect(fallbackRequest.messages.some(message => /\[Reply pipeline \d+\/\d+\]/.test(String(message?.content ?? '')))).toBe(false);

        // The failed final-step card stays visible as evidence — its hidden
        // display must be lifted when the pipeline falls back, so the error is
        // not swallowed. Scoped to this run's last two pipeline cards.
        const lastDisplays = await page.evaluate(() => window.SillyTavern.getContext().chat
            .filter(message => Array.isArray(message?.extra?.tool_invocations)
                && typeof message?.extra?.reply_pipeline_run === 'string')
            .slice(-2)
            .map(message => message.extra.reply_pipeline_display));
        expect(lastDisplays).toEqual(['summary', 'summary']);
        await expect(page.locator('#chat .mes:has([data-tool-invocation])').last()).not.toHaveClass(/replyPipelineHidden/);
    });
});

test.describe('reply pipeline step editor', () => {
    test('prompt panel bottom renders one row per step and writes reply_pipeline', async ({ page }) => {
        await testSetup.awaitST({ page });

        await page.evaluate(() => {
            const context = window.SillyTavern.getContext();
            context.chatCompletionSettings.reply_pipeline = {
                enabled: true,
                steps: [
                    { tool: 'analyze', prompt: 'PLAN_FIRST', reasoning_effort: 'low' },
                    { tool: 'respond', prompt: 'WRITE_REPLY' },
                ],
                final: 'respond',
            };
            // Any bridge mutation emits a state change so React re-renders the rows.
            window.__emberDeskPromptPanelBridge.setPipelineEnabled(true);
        });

        const rows = page.locator('#completion_prompt_manager .prompt-panel-pipeline-row');
        await expect(rows).toHaveCount(2);
        await expect(rows.nth(0).locator('.prompt-panel-pipeline-tool')).toHaveValue('analyze');
        await expect(rows.nth(0).locator('.prompt-panel-pipeline-instruction')).toHaveValue('PLAN_FIRST');
        await expect(rows.nth(1).locator('.prompt-panel-pipeline-tool')).toHaveValue('respond');
        await expect(rows.nth(1)).toContainText('最终');

        // Adding a row appends a step; typing writes straight into oai_settings.
        await page.locator('#completion_prompt_manager .prompt-panel-pipeline-head .menu_button').click();
        await expect(rows).toHaveCount(3);
        await rows.nth(2).locator('.prompt-panel-pipeline-tool').fill('temp');
        await rows.nth(2).locator('.prompt-panel-pipeline-instruction').fill('TEMP_PROMPT');

        let stored = await page.evaluate(() => window.SillyTavern.getContext().chatCompletionSettings.reply_pipeline);
        expect(stored.steps.map(step => step.tool)).toEqual(['analyze', 'respond', 'temp']);
        expect(stored.steps[2].prompt).toBe('TEMP_PROMPT');
        // The last row owns `final` (it produces the reply); advanced step
        // fields survive row edits.
        expect(stored.final).toBe('temp');
        expect(stored.steps[0].reasoning_effort).toBe('low');
        expect(stored.enabled).toBe(true);

        // Reorder rows → execution order changes; `final` follows the last row.
        await rows.nth(0).locator('button[aria-label*="下移"]').click();
        stored = await page.evaluate(() => window.SillyTavern.getContext().chatCompletionSettings.reply_pipeline);
        expect(stored.steps.map(step => step.tool)).toEqual(['respond', 'analyze', 'temp']);

        // Delete a row → the plan shrinks; last row still owns `final`.
        await rows.nth(1).locator('button[aria-label*="删除"]').click();
        stored = await page.evaluate(() => window.SillyTavern.getContext().chatCompletionSettings.reply_pipeline);
        expect(stored.steps.map(step => step.tool)).toEqual(['respond', 'temp']);
        expect(stored.final).toBe('temp');

        // Disabling the pipeline hides the per-step trigger checkboxes.
        await page.locator('#completion_prompt_manager .prompt-panel-pipeline-head input[type="checkbox"]').uncheck();
        stored = await page.evaluate(() => window.SillyTavern.getContext().chatCompletionSettings.reply_pipeline);
        expect(stored.enabled).toBe(false);
        const tags = await page.evaluate(() => window.__emberDeskPromptPanelBridge.getState().pipelineTriggerTags);
        expect(tags).toEqual([]);

        // Re-enable → trigger tags come back for the authored steps.
        await page.locator('#completion_prompt_manager .prompt-panel-pipeline-head input[type="checkbox"]').check();
        const tagsBack = await page.evaluate(() => window.__emberDeskPromptPanelBridge.getState().pipelineTriggerTags);
        expect(tagsBack).toEqual(['pipeline:respond', 'pipeline:temp']);
    });
});
