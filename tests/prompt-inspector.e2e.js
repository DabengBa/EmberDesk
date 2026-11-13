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
        // Keep unrelated background summarization from sending during a preview.
        context.chatCompletionSettings.chat_memory_enabled = false;
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

    test('preview World Info and OpenAI assembly remain isolated from concurrent background generation', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterInSeededChat(page);
        await enableOpenAiBackend(page);
        await installGenerateStub(page);
        await page.locator('#send_textarea').fill('isolation browser probe');
        await page.evaluate(async () => {
            const script = await import('/script.js');
            const state = await import('/scripts/world-info-state.js');
            const { eventSource, event_types } = await import('/scripts/events.js');
            const book = 'attempt44-isolation';
            state.setSelectedWorldInfo([book]);
            state.worldInfoCache.set(book, { entries: { 1: { uid: 1, order: 1, content: 'PREVIEW_WORLD_ACTIVATED', key: ['preview_unique_trigger'], position: 0 } } });
            window.__attempt44Entered = false;
            window.__attempt45FilterCalls = 0;
            window.__attempt45Filter = async () => { window.__attempt45FilterCalls++; return true; };
            window.__attempt44Start = async (_type, options, dryRun) => {
                await Promise.resolve();
                if (dryRun) {
                    script.setExtensionPrompt('attempt44_legacy', 'LEGACY_GLOBAL', 1, 0, false, undefined, window.__attempt45Filter);
                    options.promptContext.setWorldInfoScanPrompt('attempt44_local', 'preview_unique_trigger', 1, 0, true);
                }
            };
            window.__attempt44Scan = async args => {
                if (args.new.successful.some(entry => entry.content === 'PREVIEW_WORLD_ACTIVATED')) {
                    window.__attempt44Entered = true;
                    await new Promise(resolve => { window.__attempt44Release = resolve; });
                    // Even an awaited legacy listener has no implicit request attribution.
                    script.setExtensionPrompt('attempt44_late_listener', 'LATE_LISTENER_GLOBAL', 1, 0, false);
                }
            };
            eventSource.on(event_types.GENERATION_STARTED, window.__attempt44Start);
            eventSource.on(event_types.WORLDINFO_SCAN_DONE, window.__attempt44Scan);
            const generation = await import('/scripts/generation-service.js');
            window.__attempt44Preview = generation.previewNextGenerationRequest();
        });
        await expect.poll(() => page.evaluate(() => window.__attempt44Entered), { timeout: 20_000 }).toBe(true);
        const background = await page.evaluate(async () => {
            const script = await import('/script.js');
            const localVisible = Object.hasOwn(script.extension_prompts, 'attempt44_local');
            const legacy = script.extension_prompts.attempt44_legacy?.value;
            // A contextless write after preview's map was captured remains global.
            script.setExtensionPrompt('attempt44_late_global', 'LATE_GLOBAL_ONLY', 1, 0, false);
            const result = await script.generateQuietPrompt({ quietPrompt: 'background probe', backgroundGeneration: true });
            return { localVisible, legacy, result };
        });
        expect(background).toEqual({ localVisible: false, legacy: 'LEGACY_GLOBAL', result: 'stub reply' });
        const requests = await page.evaluate(() => window.__promptInspectorRequests);
        expect(requests).toHaveLength(1);
        expect(JSON.stringify(requests[0].messages)).not.toContain('PREVIEW_WORLD_ACTIVATED');
        expect(JSON.stringify(requests[0].messages)).toContain('LATE_GLOBAL_ONLY');
        expect(JSON.stringify(requests[0].messages)).toContain('LEGACY_GLOBAL');
        const backgroundFilterCalls = await page.evaluate(() => window.__attempt45FilterCalls);
        expect(backgroundFilterCalls).toBeGreaterThan(0);
        await page.evaluate(() => window.__attempt44Release());
        const preview = await page.evaluate(() => window.__attempt44Preview);
        expect(JSON.stringify(preview.request.messages)).toContain('PREVIEW_WORLD_ACTIVATED');
        expect(JSON.stringify(preview.request.messages)).toContain('LEGACY_GLOBAL');
        expect(await page.evaluate(() => window.__attempt45FilterCalls)).toBeGreaterThan(backgroundFilterCalls);
        expect(JSON.stringify(preview.request.messages)).toContain('preview_unique_trigger');
        expect(JSON.stringify(preview.request.messages)).not.toContain('LATE_GLOBAL_ONLY');
        expect(JSON.stringify(preview.request.messages)).not.toContain('LATE_LISTENER_GLOBAL');
        expect(await page.evaluate(async () => (await import('/script.js')).extension_prompts.attempt44_late_listener?.value)).toBe('LATE_LISTENER_GLOBAL');
        expect(await page.evaluate(() => window.__promptInspectorRequests.length)).toBe(1);
        await page.evaluate(async () => {
            const script = await import('/script.js');
            const state = await import('/scripts/world-info-state.js');
            const { eventSource, event_types } = await import('/scripts/events.js');
            eventSource.removeListener(event_types.GENERATION_STARTED, window.__attempt44Start);
            eventSource.removeListener(event_types.WORLDINFO_SCAN_DONE, window.__attempt44Scan);
            delete script.extension_prompts.attempt44_legacy;
            delete script.extension_prompts.attempt44_late_global;
            delete script.extension_prompts.attempt44_late_listener;
            state.setSelectedWorldInfo([]);
        });
    });

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
        await page.locator('button', { hasText: '查看 Prompt' }).first().click();
        await expect(overlay).toBeVisible();
        await expect(overlay.locator('.prompt-inspector-item').first()).toBeVisible({ timeout: 15_000 });
        expect(await page.evaluate(() => window.__promptInspectorRequests.length)).toBe(0);
        await page.keyboard.press('Escape');
        await expect(overlay).toHaveCount(0);
    });

    test('closing and reopening during a delayed preview ignores the old result', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterInSeededChat(page);
        await enableOpenAiBackend(page);
        await installGenerateStub(page);
        await page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '提示词' }).first().click();
        const open = page.locator('button', { hasText: '查看 Prompt' }).first();
        const overlay = page.locator('.prompt-inspector-overlay');
        await open.click();
        await expect(overlay.locator('.prompt-inspector-item').first()).toBeVisible({ timeout: 15_000 });
        await page.keyboard.press('Escape');
        await expect(overlay).toHaveCount(0);
        await page.evaluate(() => {
            let calls = 0;
            window.__emberDeskPromptInspectorBridge.preview = () => {
                if (++calls === 1) return new Promise(resolve => { window.__resolveOldInspectorPreview = resolve; });
                return Promise.resolve({ kind: 'prompt-preview-empty', reason: 'CURRENT PREVIEW RESULT', warnings: [] });
            };
        });
        await open.click();
        await expect(overlay).toBeVisible();
        await expect.poll(() => page.evaluate(() => typeof window.__resolveOldInspectorPreview)).toBe('function');
        await page.keyboard.press('Escape');
        await expect(overlay).toHaveCount(0);
        await open.click();
        await expect(overlay).toContainText('CURRENT PREVIEW RESULT');
        await page.evaluate(() => window.__resolveOldInspectorPreview({ kind: 'prompt-preview-empty', reason: 'STALE PREVIEW RESULT', warnings: [] }));
        await expect(overlay).toContainText('CURRENT PREVIEW RESULT');
        await expect(overlay).not.toContainText('STALE PREVIEW RESULT');
        expect(await page.evaluate(() => window.__promptInspectorRequests.length)).toBe(0);
        await page.keyboard.press('Escape');
        await expect(overlay).toHaveCount(0);
    });

    test('projects pipeline history as paired story submissions in preview and live requests', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterInSeededChat(page);
        await enableOpenAiBackend(page);
        await installGenerateStub(page);

        // A runnable pipeline enables history projection; its configured tool
        // remains distinct from synthetic historical submit_story records.
        await page.evaluate(async () => {
            const { feature_settings } = await import('/scripts/feature-settings.js');
            feature_settings.tool_bindings = [{ name: 'get_weather', enabled: true }];
            const settings = window.SillyTavern.getContext().chatCompletionSettings;
            // Exercise a deterministic history budget boundary independently of earlier sends.
            settings.openai_max_context = 2048;
            settings.reply_pipeline = { enabled: true, steps: [{ tool: 'get_weather' }] };
            settings.chat_memory_enabled = false;
            const { reloadUserToolBindings } = await import('/scripts/tool-bindings.js');
            reloadUserToolBindings();
        });

        // Seed three card shapes at the tail of the chat:
        //  1. non-pipeline tool card (keeps structured replay)
        //  2. bare mid-pipeline card (is_system, all-pipeline invocations)
        //  3. merged pipeline card (assistant reply carrying invocations)
        await page.evaluate(() => {
            const context = window.SillyTavern.getContext();
            context.chat.splice(1);
            for (let index = 0; index < 120; index++) {
                context.chat.push({ name: index % 2 ? 'Seraphina' : 'User', is_user: index % 2 === 0, is_system: false, mes: `Historical turn ${index}: the explorer crossed the valley and remembered the story.`, extra: {} });
            }
            const pipelineInvocation = (id, name, parameters, result, stepIndex) => ({
                id, name, parameters, result, error: false, signature: null, reasoning: null,
                pipeline: { runId: 'run-e2e', stepId: name, stepIndex, display: 'summary' },
            });
            context.chat.push(
                { name: 'User', is_user: true, is_system: false, mes: 'OLD_USER_TEXT', extra: {} },
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

        await page.locator('#send_textarea').fill('CURRENT_USER_TEXT');
        const before = await page.evaluate(() => structuredClone(window.SillyTavern.getContext().chat));
        const budgetSettings = async () => await page.evaluate(async () => {
            const { promptManager } = await import('/scripts/openai.js');
            const settings = window.SillyTavern.getContext().chatCompletionSettings;
            const snapshot = value => ({
                context: value.openai_max_context,
                completion: value.openai_max_tokens,
                model: value.openai_model,
                source: value.chat_completion_source,
                pipeline: structuredClone(value.reply_pipeline),
            });
            return { settings: snapshot(settings), manager: snapshot(promptManager.serviceSettings) };
        });
        const settingsBeforePreview = await budgetSettings();
        expect(settingsBeforePreview.settings.context).toBe(2048);
        const preview = await runPreview(page);
        expect(preview.kind).toBe('prompt-preview');
        const messages = preview.request.messages;
        const wire = JSON.stringify(messages);

        // Real old pipeline executions are not replayed as historical submissions.
        for (const toolCallId of ['call_p1', 'call_p2', 'call_b1']) {
            expect(wire).not.toContain(toolCallId);
        }
        expect(messages.filter(m => m.role === 'tool' && String(m.tool_call_id ?? '').startsWith('call_p'))).toHaveLength(0);
        const assistantToolCalls = messages.flatMap(m => Array.isArray(m.tool_calls) ? m.tool_calls : []);
        expect(assistantToolCalls.map(call => call?.function?.name)).not.toEqual(expect.arrayContaining(['analyze', 'respond']));

        const submissions = assistantToolCalls.filter(call => call.function.name === 'submit_story');
        const submittedTexts = submissions.map(call => JSON.parse(call.function.arguments).content.trim());
        expect(submittedTexts.filter(text => text === 'PIPELINE_REPLY_TEXT')).toHaveLength(1);
        expect(submittedTexts.filter(text => text === 'OLD_USER_TEXT')).toHaveLength(1);
        for (const call of submissions) {
            const index = messages.findIndex(message => message.tool_calls?.some(item => item.id === call.id));
            expect(messages[index + 1]).toEqual({ role: 'tool', content: '已收到。', tool_call_id: call.id });
        }
        expect(messages.some(message => message.role === 'user' && message.content.includes('CURRENT_USER_TEXT'))).toBe(true);
        expect(wire.match(/PIPELINE_REPLY_TEXT/g)).toHaveLength(1);
        expect(wire).not.toContain('ANALYSIS_SCRATCH');
        expect(wire).not.toContain('BARE_ANALYSIS_TEXT');

        // Non-pipeline tool cards keep the structured replay.
        expect(messages.some(m => m.role === 'tool' && m.tool_call_id === 'call_np1')).toBe(true);
        expect(assistantToolCalls.map(call => call?.function?.name)).toEqual(expect.arrayContaining(['get_weather']));

        expect(await page.evaluate(() => window.__promptInspectorRequests.length)).toBe(0);
        expect(await page.evaluate(() => window.SillyTavern.getContext().chat)).toEqual(before);
        const closingPreview = await runPreview(page, 1);
        expect(closingPreview.request.messages.flatMap(message => message.tool_calls ?? [])).toEqual(assistantToolCalls);
        expect(await budgetSettings()).toEqual(settingsBeforePreview);

        await page.evaluate(async () => window.SillyTavern.getContext().generate('normal'));
        expect(await budgetSettings()).toEqual(settingsBeforePreview);
        expect(await page.evaluate(() => window.__promptInspectorRequests.length)).toBe(1);
        const [live] = await page.evaluate(() => window.__promptInspectorRequests);
        // Compare what actually travels over JSON: undefined object fields are omitted.
        expect(live.messages).toEqual(JSON.parse(JSON.stringify(messages)));
    });
});
