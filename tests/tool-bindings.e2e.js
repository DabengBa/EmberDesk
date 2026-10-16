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
});
