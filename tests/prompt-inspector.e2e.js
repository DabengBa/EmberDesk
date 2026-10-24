import { test, expect } from '@playwright/test';

import { testSetup } from './frontend/frontent-test-utils.js';

const characterName = 'Dev Character 001';
const seededChatName = 'Dev Character 001 Session 01';
const PROBE_TEXT = 'Preview parity probe 42.';

async function openCharacterLibrary(page) {
    const panelButton = page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '角色库' }).first();
    await expect(panelButton).toBeVisible({ timeout: 10_000 });
    await panelButton.click({ timeout: 10_000 });
    await expect(panelButton).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
    await expect(page.locator('#rm_print_characters_block .character_select[data-chid]').first()).toBeVisible({ timeout: 10_000 });
}

async function selectCharacterInSeededChat(page) {
    await openCharacterLibrary(page);
    await page.evaluate(async ({ name, chatName }) => {
        const context = window.SillyTavern.getContext();
        const characterId = context.characters.findIndex(character => character?.name === name);
        if (characterId < 0) {
            throw new Error(`Seeded character not found: ${name}`);
        }
        await context.selectCharacterById(characterId);
        await context.openCharacterChat(chatName);
    }, { name: characterName, chatName: seededChatName });
}

async function enableOpenAiBackend(page) {
    await page.evaluate(() => {
        const context = window.SillyTavern.getContext();
        context.chatCompletionSettings.chat_completion_source = 'openai';
        context.chatCompletionSettings.openai_model = 'gpt-4o-mini';
        context.chatCompletionSettings.stream_openai = false;
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

/** Intercepts the generate endpoint, records bodies, replies with a fixed completion. */
async function installGenerateStub(page) {
    await page.evaluate(() => {
        window.__promptInspectorRequests = [];
        window.__promptInspectorOriginalFetch ??= window.fetch.bind(window);
        window.fetch = async (input, init = {}) => {
            const url = typeof input === 'string' ? input : input.url;
            if (!String(url).endsWith('/api/backends/chat-completions/generate')) {
                return window.__promptInspectorOriginalFetch(input, init);
            }
            window.__promptInspectorRequests.push(JSON.parse(String(init.body ?? '{}')));
            return new Response(JSON.stringify({
                choices: [{ message: { content: 'stub reply' } }],
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        };
    });
}

async function runPreview(page, round = 0) {
    return await page.evaluate(async (pipelineRound) => {
        const mod = await import('/scripts/generation-service.js');
        return await mod.previewNextGenerationRequest({ round: pipelineRound });
    }, round);
}

test.describe('prompt inspector (request preview)', () => {
    test.setTimeout(120_000);

    test('assembles the pending request body without sending it or mutating chat', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterInSeededChat(page);
        await enableOpenAiBackend(page);
        await installGenerateStub(page);

        const chatLengthBefore = await page.evaluate(() => window.SillyTavern.getContext().chat.length);
        await page.locator('#send_textarea').fill(PROBE_TEXT);

        const preview = await runPreview(page);

        expect(preview.kind).toBe('prompt-preview');
        expect(Array.isArray(preview.request.messages)).toBe(true);
        expect(preview.request.messages.length).toBeGreaterThan(0);
        expect(preview.request.type).toBe('normal');
        expect(preview.model).toBe('gpt-4o-mini');
        // The pending composer text lands inside chatHistory as the newest entry.
        const pending = preview.entries.find(entry => entry.identifier === preview.pendingEntryIdentifier);
        expect(pending).toBeTruthy();
        expect(String(pending.content)).toContain(PROBE_TEXT);
        expect(preview.pendingMessage.mes).toContain(PROBE_TEXT);
        // No request was sent and nothing was committed.
        expect(await page.evaluate(() => window.__promptInspectorRequests.length)).toBe(0);
        expect(await page.evaluate(() => window.SillyTavern.getContext().chat.length)).toBe(chatLengthBefore);
        await expect(page.locator('#send_textarea')).toHaveValue(PROBE_TEXT);
    });

    test('preview request body matches the body a real send produces', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterInSeededChat(page);
        await enableOpenAiBackend(page);
        await installGenerateStub(page);

        await page.locator('#send_textarea').fill(PROBE_TEXT);
        const preview = await runPreview(page);
        expect(preview.kind).toBe('prompt-preview');

        await page.locator('#send_but').click();
        await expect.poll(async () => page.evaluate(() => window.__promptInspectorRequests.length), { timeout: 20_000 }).toBe(1);

        const [realRequest] = await page.evaluate(() => window.__promptInspectorRequests);
        // Identical assembly path ⇒ identical wire body.
        const { _trace, ...providerRequest } = realRequest;
        expect(_trace.chatId).toBe(seededChatName);
        expect(preview.request).toEqual(providerRequest);
    });

    test('opens from the prompt drawer and lists assembled messages', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterInSeededChat(page);
        await enableOpenAiBackend(page);
        await installGenerateStub(page);

        await page.locator('#send_textarea').fill(PROBE_TEXT);

        const panelButton = page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '提示词' }).first();
        await panelButton.click({ timeout: 10_000 });
        await expect(panelButton).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });

        await page.locator('button', { hasText: '查看 Prompt' }).first().click({ timeout: 10_000 });

        const overlay = page.locator('.prompt-inspector-overlay');
        await expect(overlay).toBeVisible({ timeout: 15_000 });
        await expect(overlay.locator('.prompt-inspector-badge-preview')).toContainText('预览（未发送）');
        await expect(overlay.locator('.prompt-inspector-item').first()).toBeVisible({ timeout: 15_000 });
        await expect(overlay.locator('.prompt-inspector-badge-pending')).toBeVisible();
        await expect(overlay.locator('.prompt-inspector-param', { hasText: 'temperature' })).toHaveCount(1);

        // The overlay must not have triggered a request.
        expect(await page.evaluate(() => window.__promptInspectorRequests.length)).toBe(0);

        await page.keyboard.press('Escape');
        await expect(overlay).toHaveCount(0);
    });

    test('flattens pipeline tool cards into plain chat history on the wire', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterInSeededChat(page);
        await enableOpenAiBackend(page);
        await installGenerateStub(page);

        // Enable one binding so isToolCallingSupported() reports true — the
        // replay branch only runs under canUseTools.
        await page.evaluate(async () => {
            const { feature_settings } = await import('/scripts/feature-settings.js');
            feature_settings.tool_bindings = [{ name: 'get_weather', enabled: true }];
        });

        // Seed three card shapes at the tail of the chat:
        //  1. non-pipeline tool card (keeps structured replay)
        //  2. bare mid-pipeline card (is_system, all-pipeline invocations)
        //  3. merged pipeline card (assistant reply carrying invocations)
        await page.evaluate(() => {
            const context = window.SillyTavern.getContext();
            const pipelineInvocation = (id, name, parameters, result, stepIndex) => ({
                id, name, parameters, result, error: false, signature: null, reasoning: null,
                pipeline: { runId: 'run-e2e', stepId: name, stepIndex, display: 'summary' },
            });
            context.chat.push(
                {
                    name: 'Seraphina', is_user: false, is_system: true, send_date: Date.now(),
                    mes: '<div>weather card</div>',
                    extra: {
                        isSmallSys: true,
                        tool_invocations: [{ id: 'call_np1', name: 'get_weather', parameters: '{"city":"eldoria"}', result: '{"temp":20}', error: false }],
                    },
                },
                {
                    name: 'Seraphina', is_user: false, is_system: true, send_date: Date.now(),
                    mes: '&lt;analyze&gt;BARE_ANALYSIS_TEXT&lt;/analyze&gt;',
                    extra: {
                        isSmallSys: true,
                        reply_pipeline_run: 'run-bare',
                        tool_invocations: [pipelineInvocation('call_b1', 'analyze', '{"content":"BARE_ANALYSIS_TEXT"}', '{"ok":true}', 0)],
                    },
                },
                {
                    name: 'Seraphina', is_user: false, is_system: false, send_date: Date.now(),
                    mes: '&lt;analyze&gt;ANALYSIS_SCRATCH&lt;/analyze&gt;\n&lt;respond&gt;PIPELINE_REPLY_TEXT&lt;/respond&gt;',
                    extra: {
                        reply_pipeline_run: 'run-e2e',
                        tool_invocations: [
                            pipelineInvocation('call_p1', 'analyze', '{"content":"ANALYSIS_SCRATCH"}', '{"ok":true}', 0),
                            pipelineInvocation('call_p2', 'respond', '{"content":"PIPELINE_REPLY_TEXT"}', 'PIPELINE_REPLY_TEXT', 1),
                        ],
                    },
                },
            );
        });

        const preview = await runPreview(page);
        expect(preview.kind).toBe('prompt-preview');
        const messages = preview.request.messages;
        const wire = JSON.stringify(messages);

        // Pipeline cards flatten: no tool_call/tool messages for their ids.
        for (const toolCallId of ['call_p1', 'call_p2', 'call_b1']) {
            expect(wire).not.toContain(toolCallId);
        }
        expect(messages.filter(m => m.role === 'tool' && String(m.tool_call_id ?? '').startsWith('call_p'))).toHaveLength(0);
        const assistantToolCalls = messages.flatMap(m => Array.isArray(m.tool_calls) ? m.tool_calls : []);
        expect(assistantToolCalls.map(call => call?.function?.name)).not.toEqual(expect.arrayContaining(['analyze', 'respond']));

        // The reply survives exactly once as a plain assistant message; the
        // scratchpad of earlier steps is gone from the wire entirely.
        const replyMessages = messages.filter(m => String(m.content ?? '').includes('PIPELINE_REPLY_TEXT'));
        expect(replyMessages).toHaveLength(1);
        expect(replyMessages[0].role).toBe('assistant');
        expect(wire).not.toContain('ANALYSIS_SCRATCH');

        // The bare card flattens to its last step's text.
        const bareMessages = messages.filter(m => String(m.content ?? '').includes('BARE_ANALYSIS_TEXT'));
        expect(bareMessages).toHaveLength(1);
        expect(bareMessages[0].role).toBe('assistant');

        // Non-pipeline tool cards keep the structured replay.
        expect(messages.some(m => m.role === 'tool' && m.tool_call_id === 'call_np1')).toBe(true);
        expect(assistantToolCalls.map(call => call?.function?.name)).toEqual(expect.arrayContaining(['get_weather']));

        expect(await page.evaluate(() => window.__promptInspectorRequests.length)).toBe(0);
    });
});
