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
    test('sanitized respond and copy chips handle native and synthetic clicks once', async ({ page }) => {
        await testSetup.awaitST({ page });
        await expect(page.locator('#RegexPanel')).toHaveAttribute('data-tool-bindings-init', 'true');
        await page.evaluate(async () => {
            await window.SillyTavern.getContext().selectCharacterById(0);
            const { init } = await import('/scripts/tool-bindings.js');
            const { messageFormatting } = await import('/scripts/message-service.js');
            await init();
            await init();
            window.__toolChipCopies = [];
            Object.defineProperty(navigator, 'clipboard', {
                configurable: true,
                value: { writeText: async text => window.__toolChipCopies.push(text) },
            });
            const host = document.createElement('div');
            host.id = 'tool-chip-test-host';
            Object.assign(host.style, { position: 'fixed', top: '10px', left: '10px', zIndex: '999999', background: 'white' });
            host.innerHTML = messageFormatting('<div data-respond-option="" role="button" tabindex="0">▸ Pick the path</div><div data-copy-option="Copy this" role="button" tabindex="0">Copy</div>', '', true, false, -1);
            document.body.append(host);
        });
        const respond = page.locator('#tool-chip-test-host [data-respond-option]');
        const copy = page.locator('#tool-chip-test-host [data-copy-option]');
        await expect(respond).toHaveCount(1);
        await expect(copy).toHaveCount(1);
        await respond.click();
        await expect(page.locator('#send_textarea')).toHaveValue('Pick the path');
        await page.locator('#send_textarea').fill('');
        await page.evaluate(() => window.$('#tool-chip-test-host [data-respond-option]').trigger('click'));
        await expect(page.locator('#send_textarea')).toHaveValue('Pick the path');
        await copy.click();
        await page.evaluate(() => window.$('#tool-chip-test-host [data-copy-option]').trigger('click'));
        await expect.poll(() => page.evaluate(() => window.__toolChipCopies)).toEqual(['Copy this', 'Copy this']);
    });

    test('force call switch has the visible accessible name', async ({ page }) => {
        await testSetup.awaitST({ page });
        await page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '正则' }).first().click();
        await page.locator('#RegexPanel .wpc-tab').filter({ hasText: '工具绑定' }).click();
        const visibleText = (await page.locator('#RegexPanel label[for="tool_choice_required"] + span').textContent())?.trim();
        expect(visibleText).toBeTruthy();
        const checkbox = page.locator('#tool_choice_required');
        await expect(checkbox).toHaveAccessibleName(visibleText);
        const checked = await checkbox.isChecked();
        await checkbox.focus();
        await expect(checkbox).toBeFocused();
        await checkbox.press('Space');
        await expect(checkbox).toBeChecked({ checked: !checked });
        await checkbox.press('Space');
        await expect(checkbox).toBeChecked({ checked });
    });

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
        await page.locator('.popup-button-ok').click();
        await expect(page.locator('#tb_name')).toBeFocused();
        await expect(page.locator('#tb_name_error')).toBeVisible();
        await page.locator('#tb_name').fill('e2e_ui_tool');
        await page.locator('#tb_parameters').fill('{');
        await page.locator('.popup-button-ok').click();
        await expect(page.locator('#tb_parameters')).toBeFocused();
        await expect(page.locator('#tb_parameters_error')).toBeVisible();
        await page.locator('#tb_parameters').fill('{"type":"object","properties":{}}');
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

        // Duplicate names must remain in the editor, focused on the name.
        await page.locator('#open_tool_binding_editor').click();
        await page.locator('#tb_name').fill('e2e_ui_tool');
        await page.locator('.popup-button-ok').click();
        await expect(page.locator('#tb_name')).toBeFocused();
        await expect(page.locator('#tb_name_error')).toBeVisible();
        await page.locator('.popup-button-cancel').click();
        await expect(page.locator('#tool_binding_editor_template')).toHaveCount(0);

        const row = page.locator('#saved_tool_bindings .tool-binding-label').filter({ hasText: 'e2e_ui_tool' });
        await row.locator('.tool-binding-edit').click();
        await page.locator('#tb_display_name').fill('Cancelled edit');
        await page.locator('.popup-button-cancel').click();
        await expect(row).not.toContainText('Cancelled edit');
        await row.locator('.tool-binding-edit').click();
        await page.locator('#tb_display_name').fill('Edited tool');
        await page.locator('.popup-button-ok').click();
        await expect(row).toContainText('Edited tool');
        const enabled = row.locator('.tool-binding-enabled');
        await expect(enabled).toBeChecked();
        // The per-binding toggle must be keyboard-operable, not just clickable
        // through its decorative icon.
        await row.locator('.tool-binding-edit').focus();
        await page.keyboard.press('Shift+Tab');
        await expect(enabled).toBeFocused();
        await expect(enabled).toHaveAccessibleName(/Edited tool/);
        await expect.poll(() => enabled.locator('..').evaluate(label => getComputedStyle(label).outlineStyle)).not.toBe('none');
        await enabled.press('Space');
        await expect(enabled).not.toBeChecked();
        await enabled.press('Space');
        await expect(enabled).toBeChecked();
        await row.locator('.tool-binding-toggle-on').click();
        await expect(enabled).not.toBeChecked();
        await expect.poll(() => page.evaluate(() => window.SillyTavern.getContext().featureSettings.tool_bindings.find(binding => binding.name === 'e2e_ui_tool')?.enabled)).toBe(false);
        await expect.poll(() => page.evaluate(() => window.SillyTavern.getContext().ToolManager.tools.map(tool => tool.toFunctionOpenAI().function.name))).not.toContain('e2e_ui_tool');
        await row.locator('.tool-binding-toggle-off').click();
        await expect(enabled).toBeChecked();
        await expect.poll(() => page.evaluate(() => window.SillyTavern.getContext().featureSettings.tool_bindings.find(binding => binding.name === 'e2e_ui_tool')?.enabled)).toBe(true);
        await expect.poll(() => page.evaluate(() => window.SillyTavern.getContext().ToolManager.tools.map(tool => tool.toFunctionOpenAI().function.name))).toContain('e2e_ui_tool');

        // Verify the UI edit survives a real settings write and boot registration.
        await page.evaluate(async () => (await import('/script.js')).saveSettings());
        await page.reload();
        await testSetup.awaitST({ page });
        await page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '正则' }).first().click();
        await page.locator('#RegexPanel .wpc-tab').filter({ hasText: '工具绑定' }).click();
        await expect(row).toContainText('Edited tool');
        await expect(enabled).toBeChecked();
        await expect.poll(() => page.evaluate(() => window.SillyTavern.getContext().ToolManager.tools.map(tool => tool.toFunctionOpenAI().function.name))).toContain('e2e_ui_tool');
        await row.locator('.tool-binding-delete').click();
        await page.locator('.popup-button-cancel').click();
        await expect(row).toHaveCount(1);
        await row.locator('.tool-binding-delete').click();
        await page.locator('.popup-button-ok').click();
        await expect(row).toHaveCount(0);
        await expect.poll(() => page.evaluate(() => window.SillyTavern.getContext().ToolManager.tools.map(tool => tool.toFunctionOpenAI().function.name))).not.toContain('e2e_ui_tool');

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
            context.chatCompletionSettings.reply_pipeline = { enabled: true, steps: [] };
            await script.saveSettings();
        }, toolBinding);
        await page.reload();
        await testSetup.awaitST({ page });

        await expect.poll(async () => page.evaluate(() => {
            return window.SillyTavern.getContext().ToolManager.tools.map(tool => tool.toFunctionOpenAI().function.name);
        }), { timeout: 30_000 }).toContain('game_content');

        await installGenerateStub(page);
        await prepareOpenAiProvider(page);

        await page.locator('#send_textarea').fill('tool binding e2e message');
        await page.evaluate(() => {
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
        const userTurn = page.locator('#chat .mes[is_user="true"]').filter({ hasText: 'tool binding e2e message' }).last();
        const turnId = await userTurn.getAttribute('data-turn-card');
        expect(turnId).toBeTruthy();
        const turnCard = page.locator(`#chat .mes[data-turn-card="${turnId}"]`);
        const turnMembers = await turnCard.evaluateAll(rows => rows.map(row => ({
            id: row.getAttribute('mesid'),
            role: row.getAttribute('is_user') === 'true' ? 'user' : row.getAttribute('is_system') === 'true' ? 'system' : 'character',
            turnId: row.getAttribute('data-turn-card'),
            position: row.getAttribute('data-turn-card-position'),
            directChild: row.parentElement?.id === 'chat',
            bodyVisible: getComputedStyle(row.querySelector('.mes_text')).display !== 'none',
            surface: getComputedStyle(row).backgroundColor,
            topRadius: getComputedStyle(row).borderTopLeftRadius,
            bottomRadius: getComputedStyle(row).borderBottomLeftRadius,
        })));
        const placement = await page.locator('#chat .mes[is_system="true"]').filter({ has: page.locator('[data-tool-invocations]') }).last().evaluate(toolRow => {
            const followingRow = toolRow.nextElementSibling;
            return {
                remainsDirectMes: toolRow.parentElement?.id === 'chat',
                bodyVisible: getComputedStyle(toolRow.querySelector('.mes_text')).display !== 'none',
                sameTurnAsNext: toolRow.getAttribute('data-turn-card') === followingRow?.getAttribute('data-turn-card'),
            };
        });
        expect(turnMembers.some(member => member.role === 'user' && member.bodyVisible)).toBe(true);
        expect(turnMembers.some(member => member.role === 'character' && member.bodyVisible && member.turnId === turnMembers[0]?.turnId)).toBe(true);
        expect(turnMembers.every(member => member.directChild), JSON.stringify(turnMembers)).toBe(true);
        // One continuous surface: every row in the turn paints the same card
        // background, only the outer corners are rounded.
        expect(new Set(turnMembers.map(member => member.surface)).size, JSON.stringify(turnMembers)).toBe(1);
        expect(turnMembers[0].topRadius).toBe('8px');
        expect(turnMembers.at(-1).bottomRadius).toBe('8px');
        expect(placement).toEqual({
            remainsDirectMes: true,
            bodyVisible: true,
            sameTurnAsNext: true,
        });

        // Deleting the reply leaves the original user/tool rows in their turn
        // card, with the tool body still visible and no moved/duplicated HTML.
        const replyId = await page.locator('#chat .mes[data-turn-card]').filter({ hasText: 'FINAL_ANSWER_TEXT' }).last()
            .getAttribute('mesid');
        expect(replyId).toBeTruthy();
        await page.evaluate(async (id) => {
            const context = window.SillyTavern.getContext();
            context.powerUserSettings.confirm_message_delete = false;
            await context.deleteMessage(Number(id));
        }, replyId);
        const reverted = await page.locator('#chat .mes.toolCall').last().evaluate(toolRow => ({
            hasTurnCard: Boolean(toolRow.getAttribute('data-turn-card')),
            sourceBodyVisible: getComputedStyle(toolRow.querySelector('.mes_text')).display !== 'none',
            ownInvocations: Boolean(toolRow.querySelector('.mes_text [data-tool-invocations]')),
        }));
        expect(reverted).toEqual({
            hasTurnCard: true,
            sourceBodyVisible: true,
            ownInvocations: true,
        });

        // Flip the required flag — the next request must force a tool call.
        await page.evaluate(async () => {
            const script = await import('/script.js');
            window.SillyTavern.getContext().featureSettings.tool_choice_required = true;
            await script.saveSettings();
        });
        await page.locator('#send_textarea').fill('required e2e message');
        await page.evaluate(() => {
            window.SillyTavern.getContext()
                .generate('normal', { automatic_trigger: false })
                .catch(() => { });
        });
        await expect.poll(() => page.evaluate(() =>
            window.__emberdeskToolRequests?.some(request => request.tool_choice === 'required') ?? false,
        ), { timeout: 30_000 }).toBe(true);
    });

    test('pipeline toggle persists and controls the next request tool list', async ({ page }) => {
        await testSetup.awaitST({ page });
        await page.evaluate(async binding => {
            const context = window.SillyTavern.getContext();
            context.featureSettings.tool_bindings = [binding];
            context.chatCompletionSettings.reply_pipeline = { enabled: true, steps: [{ tool: binding.name }] };
            await (await import('/script.js')).saveSettings();
        }, toolBinding);
        await page.reload();
        await testSetup.awaitST({ page });
        await prepareOpenAiProvider(page);
        const toggle = page.locator('#completion_prompt_manager .prompt-panel-pipeline-head input[type="checkbox"]');
        await expect(toggle).toBeChecked();
        await toggle.uncheck();
        await page.evaluate(async () => (await import('/script.js')).saveSettings());
        await page.reload();
        await testSetup.awaitST({ page });
        await prepareOpenAiProvider(page);
        await expect(toggle).not.toBeChecked();
        const buildRequest = () => page.evaluate(async () => {
            const { buildChatCompletionRequest } = await import('/scripts/openai.js');
            return (await buildChatCompletionRequest({ type: 'normal', messages: [], model: 'gpt-4o-mini' })).generate_data;
        });
        const disabled = await buildRequest();
        expect(disabled.tools).toBeUndefined();
        expect(disabled.tool_choice).toBeUndefined();
        await toggle.check();
        const enabled = await buildRequest();
        expect(enabled.tools.some(tool => tool.function.name === 'game_content')).toBe(true);
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
        await page.locator('#send_textarea').fill('no tools expected');
        await page.evaluate(() => {
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
                    { tool: 'analyze', prompt: 'PLAN_FIRST', reasoning_effort: 'low', model: 'gpt-4.1-mini' },
                    { tool: 'review', prompt: 'RATE_PLAN', model: '' },
                    { tool: 'respond', prompt: 'WRITE_REPLY', model: 'gpt-4.1' },
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
                content: 'E2E_REVIEW_RUBRIC_TEXT MODEL={{model}}',
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
            // AI_OUTPUT regexes still run on the folded pipeline markup — this
            // one marks the &lt;review&gt; tag so we can assert write-time regex.
            context.featureSettings.regex = [{
                id: 'e2e_card_label',
                scriptName: 'E2E pipeline review mark',
                findRegex: '&lt;review&gt;',
                replaceString: '&lt;review&gt;[E2E-MARKED] ',
                trimStrings: [],
                placement: [2],
                disabled: false,
                markdownOnly: false,
                promptOnly: false,
                runOnEdit: false,
                substituteRegex: 0,
                minDepth: null,
                maxDepth: null,
            }];
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
            const context = window.SillyTavern.getContext();
            context.chatCompletionSettings.media_inlining = true;
            context.chat.push({ name: 'User', is_user: true, is_system: false, mes: 'media history proof',
                extra: { media: [{ type: 'image', url: 'data:image/png;base64,aGVsbG8=' }] } });
        });
        await page.locator('#send_textarea').fill('reply pipeline e2e message');
        const previews = await page.evaluate(async () => {
            const { previewNextGenerationRequest } = await import('/scripts/generation-service.js');
            const { getPipelineRunState } = await import('/scripts/reply-pipeline-core.js');
            const first = window.SillyTavern.getContext().chatCompletionSettings.reply_pipeline.steps[0];
            const model = first.model;
            first.model = 'gpt-3.5-turbo';
            const noVision = await previewNextGenerationRequest({ round: 0 });
            first.model = model;
            const before = structuredClone(getPipelineRunState());
            const second = window.SillyTavern.getContext().chatCompletionSettings.reply_pipeline.steps[1];
            const secondModel = second.model;
            second.model = 'gpt-4.1';
            const explicitSecond = await previewNextGenerationRequest({ round: 1 });
            second.model = secondModel;
            const results = [];
            for (const round of [0, 1, 2]) results.push(await previewNextGenerationRequest({ round }));
            return { results, noVision, explicitSecond, before, after: structuredClone(getPipelineRunState()), requests: window.__emberdeskToolRequests.length };
        });
        expect(previews.explicitSecond.request.model).toBe('gpt-4.1');
        expect(JSON.stringify(previews.explicitSecond.request.messages)).toContain('E2E_REVIEW_RUBRIC_TEXT MODEL=gpt-4.1');
        expect(previews.results.map(preview => preview.request.model)).toEqual(['gpt-4.1-mini', 'gpt-4o-mini', 'gpt-4.1']);
        expect(JSON.stringify(previews.results[1].request.messages)).toContain('E2E_REVIEW_RUBRIC_TEXT MODEL=gpt-4o-mini');
        expect(JSON.stringify(previews.noVision.request.messages)).not.toContain('data:image/png;base64,aGVsbG8=');
        expect(previews.results.map(preview => JSON.stringify(preview.request.messages).includes('data:image/png;base64,aGVsbG8='))).toEqual([true, true, true]);
        expect(previews.after).toEqual(previews.before);
        expect(previews.requests).toBe(0);

        await page.locator('#send_textarea').fill('reply pipeline e2e message');
        await page.evaluate(() => {
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
            window.SillyTavern.getContext().chat.some(message => String(message?.mes ?? '').includes('RESPOND_TEXT')),
        ), { timeout: 30_000 }).toBe(true);
        await page.evaluate(() => window.__emberdeskToolGeneration);

        const generationError = await page.evaluate(() => window.__emberdeskToolGenerationError);
        expect(generationError).toBeNull();

        const requests = await page.evaluate(() => window.__emberdeskToolRequests);
        const turnRequests = requests.filter(request => request.messages?.some(message => String(message?.content ?? '').includes('reply pipeline e2e message')));

        // Exactly three rounds: analyze → review → respond. No closing round.
        expect(turnRequests).toHaveLength(3);
        expect(turnRequests.map(request => request.model)).toEqual(['gpt-4.1-mini', 'gpt-4o-mini', 'gpt-4.1']);
        expect(JSON.stringify(turnRequests[1].messages)).toContain('E2E_REVIEW_RUBRIC_TEXT MODEL=gpt-4o-mini');
        expect(turnRequests.map(request => JSON.stringify(request.messages).includes('data:image/png;base64,aGVsbG8='))).toEqual([true, true, true]);
        expect(turnRequests[0].messages.some(message => String(message?.content ?? '').includes('[Reply pipeline 1/3]') && String(message?.content ?? '').includes('analyze'))).toBe(true);
        expect(turnRequests[1].messages.some(message => String(message?.content ?? '').includes('[Reply pipeline 2/3]') && String(message?.content ?? '').includes('review'))).toBe(true);
        expect(turnRequests[2].messages.some(message => String(message?.content ?? '').includes('[Reply pipeline 3/3]') && String(message?.content ?? '').includes('respond'))).toBe(true);
        expect(turnRequests[2].tools?.some(tool => tool?.function?.name === 'respond')).toBe(true);
        // Tools and all previously sent messages are an immutable run prefix.
        expect(turnRequests.map(request => (request.tools ?? []).map(tool => tool?.function?.name)))
            .toEqual(Array(3).fill(['analyze', 'review', 'respond']));
        for (let index = 1; index < turnRequests.length; index++) {
            const previous = turnRequests[index - 1].messages;
            expect(turnRequests[index].messages.slice(0, previous.length)).toEqual(previous);
        }

        // A prompt tagged 'pipeline:review' injects only on the review round;
        // the rubric is absent from the analyze and respond rounds.
        const hasRubric = request => request.messages.some(message => String(message?.content ?? '').includes('E2E_REVIEW_RUBRIC_TEXT'));
        expect(turnRequests.map(hasRubric)).toEqual([false, true, true]);

        // The analyze step's reasoning_effort overrides the base value for
        // its round only; later rounds keep the preset-level value.
        expect(turnRequests[0].reasoning_effort).toBe('low');
        expect(turnRequests[1].reasoning_effort).not.toBe('low');

        const chatState = await page.evaluate(() => {
            const chat = window.SillyTavern.getContext().chat;
            const reply = chat.at(-1);
            return {
                isSystem: !!reply?.is_system,
                mes: reply?.mes,
                model: reply?.extra?.model,
                run: reply?.extra?.reply_pipeline_run,
                step: reply?.extra?.reply_pipeline_step,
                steps: reply?.extra?.tool_invocations?.map(invocation => ({
                    step: invocation.pipeline?.stepId,
                    display: invocation.pipeline?.display,
                })),
                // The standalone progress card is folded away — nothing else
                // in the chat may still carry the run marker.
                orphanCards: chat.filter(message => message !== reply
                    && typeof message?.extra?.reply_pipeline_run === 'string').length,
            };
        });
        // The whole turn is ONE assistant message: steps are escaped
        // &lt;tool&gt;…&lt;/tool&gt; tag text leading `mes` — the tag names
        // display literally, the last tag carries the reply raw.
        expect(chatState.isSystem).toBe(false);
        expect(chatState.model).toBe('gpt-4.1');
        expect(chatState.mes).toContain('&lt;analyze&gt;');
        expect(chatState.mes).toContain('&lt;review&gt;[E2E-MARKED]');
        expect(chatState.mes).toContain('&lt;respond&gt;');
        expect(chatState.mes).not.toContain('data-pipeline-card');
        expect(chatState.mes.indexOf('&lt;analyze&gt;')).toBeLessThan(chatState.mes.indexOf('&lt;respond&gt;'));
        expect(chatState.mes.indexOf('RESPOND_TEXT')).toBeGreaterThan(chatState.mes.indexOf('&lt;respond&gt;'));
        expect(chatState.orphanCards).toBe(0);
        expect(chatState.run.startsWith('pipeline-')).toBe(true);
        expect(chatState.steps.map(step => step.step)).toEqual(['step-1', 'step-2', 'step-3']);
        expect(chatState.steps.map(step => step.display)).toEqual(['summary', 'summary', 'hidden']);

        // In the DOM the tag names show as literal text — the raw content is
        // directly readable without any regex.
        const replyRow = page.locator('#chat .mes').last();
        await expect(replyRow).toContainText('<analyze>', { timeout: 15_000 });
        await expect(replyRow).toContainText('<review>');
        await expect(replyRow).toContainText('<respond>');
        await expect(replyRow).toContainText('RESPOND_TEXT');
        const pipelineUser = page.locator('#chat > .mes[is_user="true"]').filter({ hasText: 'reply pipeline e2e message' }).last();
        const pipelineTurnId = await pipelineUser.getAttribute('data-turn-card');
        const pipelineTurnRows = page.locator(`#chat > .mes[data-turn-card="${pipelineTurnId}"]`);
        await expect(pipelineTurnRows).toHaveCount(2);
        expect(await replyRow.getAttribute('data-turn-card')).toBe(pipelineTurnId);
        expect(await pipelineTurnRows.evaluateAll(rows => rows.every(row => row.parentElement?.id === 'chat'))).toBe(true);

        // Option chips stay live inside the reply and remain clickable.
        const chips = replyRow.locator('[data-respond-option]');
        await expect(chips).toHaveCount(2);
        await page.evaluate(() => document.querySelector('#chat [data-respond-option]').click());
        await expect(page.locator('#send_textarea')).toHaveValue('Take the tea');

        // While still enabled, a later turn uses the current effective reply,
        // not the stale content captured in its real tool invocation.
        const storedInvocations = await page.evaluate(() => {
            const context = window.SillyTavern.getContext();
            context.chatCompletionSettings.chat_memory_enabled = false;
            const reply = context.chat.at(-1);
            reply.mes = reply.mes.replace('RESPOND_TEXT', 'EDITED_PIPELINE_REPLY');
            return structuredClone(reply.extra.tool_invocations);
        });
        await page.locator('#send_textarea').fill('enabled follow-up message');
        const enabledPreview = await page.evaluate(async () => {
            const { previewNextGenerationRequest } = await import('/scripts/generation-service.js');
            return await previewNextGenerationRequest();
        });
        await page.evaluate(() => {
            window.__emberdeskToolRequests = [];
            window.__emberdeskToolGeneration = window.SillyTavern.getContext().generate('normal', { automatic_trigger: false });
        });
        await page.evaluate(() => window.__emberdeskToolGeneration);
        const enabledRequests = await page.evaluate(() => window.__emberdeskToolRequests);
        expect(enabledRequests).toHaveLength(3);
        expect(enabledRequests[0].messages).toEqual(enabledPreview.request.messages);
        const historyCalls = enabledRequests[0].messages.flatMap(message => message.tool_calls ?? []);
        const storyCalls = historyCalls.filter(call => call.function.name === 'submit_story');
        const storyTexts = storyCalls.map(call => JSON.parse(call.function.arguments).content.trim());
        expect(storyTexts.filter(text => text === 'EDITED_PIPELINE_REPLY')).toHaveLength(1);
        expect(storyTexts.filter(text => text === 'reply pipeline e2e message')).toHaveLength(1);
        expect(historyCalls.every(call => call.function.name === 'submit_story')).toBe(true);
        expect(enabledRequests[0].messages.some(message => message.role === 'user' && message.content === 'enabled follow-up message')).toBe(true);
        const enabledWire = JSON.stringify(enabledRequests[0].messages);
        for (const text of ['ANALYZE_TEXT', 'REVIEW_TEXT', 'RESPOND_TEXT', 'data-respond-option']) expect(enabledWire).not.toContain(text);
        expect(await page.evaluate(() => window.SillyTavern.getContext().chat.find(message => message.mes.includes('EDITED_PIPELINE_REPLY')).extra.tool_invocations)).toEqual(storedInvocations);
        await expect(page.locator('#chat .mes').last()).toContainText('RESPOND_TEXT');

        // A later ordinary generation (pipeline disabled) must not carry stale
        // step prompts from the finished run.
        await page.locator('#send_textarea').fill('plain follow-up message');
        await page.evaluate(() => {
            window.__emberdeskToolRequests = [];
            window.SillyTavern.getContext().chatCompletionSettings.reply_pipeline.enabled = false;
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

        // The folded reply flattens into one plain assistant message on later
        // turns: no tool_calls, no tool results, the reply text exactly once —
        // and the card markup NEVER reaches the wire.
        const replayedToolCalls = followUp.messages.filter(message => Array.isArray(message?.tool_calls));
        const replayedToolResults = followUp.messages.filter(message => message?.role === 'tool');
        const replayedReply = followUp.messages.filter(message => message?.role === 'assistant'
            && typeof message?.content === 'string' && message.content.includes('RESPOND_TEXT'));
        expect(replayedToolCalls).toHaveLength(0);
        expect(replayedToolResults).toHaveLength(0);
        expect(replayedReply).toHaveLength(1);
        expect(replayedReply[0].content).not.toContain('<analyze');
        expect(replayedReply[0].content).not.toContain('<review');
        expect(replayedReply[0].content).not.toContain('<respond');
        expect(replayedReply[0].content).not.toContain('data-respond-option');
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
                    { tool: 'analyze', prompt: 'PLAN_FIRST', model: 'gpt-4.1-mini' },
                    { tool: 'respond', prompt: 'WRITE_REPLY', model: 'gpt-4.1' },
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

        await page.locator('#send_textarea').fill('reply pipeline e2e message');
        await page.evaluate(() => {
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
        expect(turnRequests.map(request => request.model)).toEqual(['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini']);
        expect(await page.evaluate(() => window.SillyTavern.getContext().chat.findLast(message => message.mes === 'FALLBACK_REPLY_TEXT')?.extra?.model)).toBe('gpt-4o-mini');
        const fallbackRequest = turnRequests[2];
        expect(fallbackRequest.tools).toEqual(turnRequests[0].tools);
        expect(fallbackRequest.tool_choice).toBe('none');
        expect(fallbackRequest.messages.some(message => String(message?.content ?? '').includes('Do not call any tools'))).toBe(true);
        // The fallback prompt replaces the step prompt — a numbered
        // "[Reply pipeline i/N]" instruction must not linger alongside it.
        expect(fallbackRequest.messages.slice(0, turnRequests[1].messages.length)).toEqual(turnRequests[1].messages);

        // The failed final-step card stays visible as evidence — its hidden
        // display must be lifted when the pipeline falls back, so the error is
        // not swallowed. The merged card reports summary and keeps both step
        // blocks visible.
        const lastRunCard = await page.evaluate(() => window.SillyTavern.getContext().chat
            .filter(message => Array.isArray(message?.extra?.tool_invocations)
                && typeof message?.extra?.reply_pipeline_run === 'string')
            .slice(-1)
            .map(message => ({
                display: message.extra.reply_pipeline_display,
                stepDisplays: message.extra.tool_invocations.map(invocation => invocation.pipeline?.display),
            })));
        expect(lastRunCard).toEqual([{ display: 'summary', stepDisplays: ['summary', 'summary'] }]);
        await expect(page.locator('#chat .mes:has([data-tool-invocation])').last()).not.toHaveClass(/replyPipelineHidden/);
    });
});

test.describe('reply pipeline step editor', () => {
    test('actual preset chooser refreshes same-id tool drafts without stale blur writes', async ({ page }) => {
        await testSetup.awaitST({ page });
        await expect(page.locator('html')).toHaveAttribute('data-reply-pipeline-init', 'true', { timeout: 15_000 });
        await page.evaluate(async () => {
            const { saveOpenAIPreset, applyOpenAIPreset, oai_settings } = await import('/scripts/openai.js');
            for (const [name, tool, model] of [['AutoBind A', 'preset_alpha', 'model-alpha'], ['AutoBind B', 'preset_beta', 'model-beta']]) {
                await saveOpenAIPreset(name, { ...oai_settings, reply_pipeline: {
                    enabled: true, steps: [{ tool, prompt: 'Reply', model }], final: tool,
                } }, false);
            }
            applyOpenAIPreset('AutoBind A');
        });
        const chooser = page.locator('#settings_preset_openai');
        const row = page.locator('.prompt-panel-pipeline .prompt-panel-item').first();
        await expect(row.locator('.prompt-panel-item-name-text')).toHaveText('preset_alpha');
        const input = row.locator('.prompt-panel-pipeline-tool');
        if (!await input.isVisible()) await row.locator('.prompt-panel-item-name').click();
        await input.fill('uncommitted_alpha');
        const previous = await page.evaluate(() => window.__emberDeskPromptPanelBridge.getState());
        // A programmatic chooser action dispatches the real change handler
        // without blurring the focused draft first.
        await chooser.selectOption({ label: 'AutoBind B' }, { force: true });
        await expect.poll(async () => (await row.locator('.prompt-panel-item-name-text').textContent()) === 'preset_beta' || await page.locator('.popup-button-cancel').isVisible()).toBe(true);
        if (await page.locator('.popup-button-cancel').isVisible()) await page.locator('.popup-button-cancel').click();
        await expect(row.locator('.prompt-panel-item-name-text')).toHaveText('preset_beta');
        await expect(input).toHaveValue('preset_beta');
        expect(await page.evaluate(() => window.SillyTavern.getContext().chatCompletionSettings.reply_pipeline.steps[0].model)).toBe('model-beta');
        await chooser.selectOption({ label: 'AutoBind A' }, { force: true });
        await expect(row.locator('.prompt-panel-item-name-text')).toHaveText('preset_alpha');
        expect(await page.evaluate(() => window.SillyTavern.getContext().chatCompletionSettings.reply_pipeline.steps[0].model)).toBe('model-alpha');
        await chooser.selectOption({ label: 'AutoBind B' }, { force: true });
        await expect(row.locator('.prompt-panel-item-name-text')).toHaveText('preset_beta');
        await page.evaluate(previous => {
            const bridge = window.__emberDeskPromptPanelBridge;
            const current = bridge.getState();
            // Late commits must not write across preset, row identity, or name changes.
            for (const expected of [
                { presetName: previous.presetName, ...previous.pipeline.steps[0] },
                { presetName: current.presetName, ...current.pipeline.steps[0], id: 'removed-step' },
                { presetName: current.presetName, ...current.pipeline.steps[0], tool: 'previous-name' },
            ]) bridge.commitPipelineStepTool(0, 'stale_write', expected);
        }, previous);
        await expect(input).toHaveValue('preset_beta');
        await input.focus();
        await input.press('Tab');
        expect(await page.evaluate(() => window.SillyTavern.getContext().chatCompletionSettings.reply_pipeline.steps[0].tool)).toBe('preset_beta');
        await input.fill('');
        await input.pressSequentially('beta_edited');
        expect(await page.evaluate(() => window.SillyTavern.getContext().featureSettings.tool_bindings.some(binding => binding.name.startsWith('beta_')))).toBe(false);
        await input.press('Enter');
        await expect(row.locator('.prompt-panel-item-name-text')).toHaveText('beta_edited');
    });

    test('auto binding commits once and repairs preset apply and cold reload', async ({ page }) => {
        page.on('pageerror', error => console.error('Pipeline browser error:', error.message));
        await testSetup.awaitST({ page });
        await expect(page.locator('html')).toHaveAttribute('data-reply-pipeline-init', 'true', { timeout: 15_000 });
        await page.evaluate(() => {
            const context = window.SillyTavern.getContext();
            context.featureSettings.tool_bindings = [];
            context.chatCompletionSettings.reply_pipeline = { enabled: true, steps: [] };
            window.__emberDeskPromptPanelBridge.addPipelineStep();
        });
        const input = page.locator('.prompt-panel-pipeline-tool');
        await input.pressSequentially('auto_reply');
        expect(await page.evaluate(() => window.SillyTavern.getContext().featureSettings.tool_bindings)).toEqual([]);
        await input.press('Enter');
        const inspect = () => page.evaluate(() => {
            const context = window.SillyTavern.getContext();
            return { names: context.featureSettings.tool_bindings.map(binding => binding.name),
                registry: context.ToolManager.tools.map(tool => tool.toFunctionOpenAI().function.name) };
        });
        expect(await inspect()).toMatchObject({ names: ['auto_reply'], registry: expect.arrayContaining(['auto_reply']) });
        const collision = await page.evaluate(async () => {
            const context = window.SillyTavern.getContext();
            context.ToolManager.registerFunctionTool({ name: 'code_only', description: 'original code tool',
                parameters: { type: 'object', properties: {} }, action: async () => 'original' });
            const original = context.ToolManager.tools.find(tool => tool.toFunctionOpenAI().function.name === 'code_only');
            const { syncPipelineToolBindings } = await import('/scripts/tool-bindings.js');
            syncPipelineToolBindings(['code_only'], { activate: true });
            return { preserved: context.ToolManager.tools.includes(original),
                placeholder: context.featureSettings.tool_bindings.some(binding => binding.name === 'code_only') };
        });
        expect(collision).toEqual({ preserved: true, placeholder: false });
        await page.evaluate(async () => {
            const context = window.SillyTavern.getContext();
            context.featureSettings.tool_bindings = [];
            const { eventSource, event_types } = await import('/scripts/events.js');
            await eventSource.emit(event_types.OAI_PRESET_CHANGED_AFTER);
            const { saveSettings } = await import('/script.js');
            await saveSettings();
        });
        expect((await inspect()).names).toEqual(['auto_reply']);
        await page.evaluate(async () => {
            window.SillyTavern.getContext().featureSettings.tool_bindings = [];
            const { saveSettings } = await import('/script.js');
            await saveSettings();
        });
        await page.reload();
        await testSetup.awaitST({ page });
        await expect(page.locator('html')).toHaveAttribute('data-reply-pipeline-init', 'true', { timeout: 15_000 });
        expect(await inspect()).toMatchObject({ names: ['auto_reply'], registry: expect.arrayContaining(['auto_reply']) });
    });

    test('prompt panel bottom renders one row per step and writes reply_pipeline', async ({ page }) => {
        await testSetup.awaitST({ page });

        await page.evaluate(() => {
            const context = window.SillyTavern.getContext();
            context.chatCompletionSettings.reply_pipeline = {
                enabled: true,
                steps: [
                    { tool: 'analyze', prompt: 'PLAN_FIRST', reasoning_effort: 'low', model: 'model-analyze' },
                    { tool: 'respond', prompt: 'WRITE_REPLY', model: 'model-respond' },
                ],
                final: 'respond',
            };
            // Any bridge mutation emits a state change so React re-renders the rows.
            window.__emberDeskPromptPanelBridge.setPipelineEnabled(true);
        });

        const rows = page.locator('#completion_prompt_manager .prompt-panel-pipeline .prompt-panel-item');
        await expect(rows).toHaveCount(2);
        await expect(rows.nth(0).locator('.prompt-panel-item-name-text')).toHaveText('analyze');
        await expect(rows.nth(1).locator('.prompt-panel-item-name-text')).toHaveText('respond');
        await expect(rows.nth(1)).toContainText('最终');

        // Collapsed rows expand to the same field editor as prompt entries.
        await rows.nth(0).locator('.prompt-panel-item-name').click();
        await expect(rows.nth(0).locator('.prompt-panel-pipeline-tool')).toHaveValue('analyze');
        await expect(rows.nth(0).locator('.prompt-panel-pipeline-instruction')).toHaveValue('PLAN_FIRST');

        // Adding a row appends a step (auto-expanded); typing writes straight
        // into oai_settings.
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

        // Reorder via the drag handle's keyboard path → execution order
        // changes; `final` follows the last row.
        await rows.nth(0).locator('.prompt-panel-drag-handle').press('ArrowDown');
        stored = await page.evaluate(() => window.SillyTavern.getContext().chatCompletionSettings.reply_pipeline);
        expect(stored.steps.map(step => step.tool)).toEqual(['respond', 'analyze', 'temp']);
        expect(stored.steps.map(step => step.model ?? '')).toEqual(['model-respond', 'model-analyze', '']);
        await page.evaluate(async () => { const { saveSettings } = await import('/script.js'); await saveSettings(); });
        await page.reload();
        await testSetup.awaitST({ page });
        await expect(rows).toHaveCount(3);
        stored = await page.evaluate(() => window.SillyTavern.getContext().chatCompletionSettings.reply_pipeline);
        expect(stored.steps.map(step => [step.tool, step.model ?? ''])).toEqual([['respond', 'model-respond'], ['analyze', 'model-analyze'], ['temp', '']]);

        // Delete a row via its expanded editor → the plan shrinks.
        await rows.nth(1).locator('.prompt-panel-item-name').click();
        await rows.nth(1).locator('.prompt-panel-item-editor .red_button').click();
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

    test('step model editor persists a free-form model through settings reload', async ({ page }) => {
        await testSetup.awaitST({ page });
        await page.evaluate(() => {
            window.SillyTavern.getContext().chatCompletionSettings.reply_pipeline = {
                enabled: true, steps: [{ tool: 'analyze', prompt: 'keep prompt', reasoning_effort: 'low' }],
            };
            window.__emberDeskPromptPanelBridge.setPipelineEnabled(true);
        });
        const row = page.locator('#completion_prompt_manager .prompt-panel-pipeline .prompt-panel-item').first();
        await row.locator('.prompt-panel-item-name').click();
        const model = row.getByRole('combobox', { name: 'Step model' });
        await model.fill('custom/model-v1');
        await page.evaluate(async () => { const { saveSettings } = await import('/script.js'); await saveSettings(); });
        await page.reload();
        await testSetup.awaitST({ page });
        const step = await page.evaluate(() => window.SillyTavern.getContext().chatCompletionSettings.reply_pipeline.steps[0]);
        expect(step).toMatchObject({ tool: 'analyze', prompt: 'keep prompt', reasoning_effort: 'low', model: 'custom/model-v1' });
        if (!(await model.isVisible())) await row.locator('.prompt-panel-item-name').click();
        await expect(model).toHaveValue('custom/model-v1');
    });
});
