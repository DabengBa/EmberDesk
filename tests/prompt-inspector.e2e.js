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
        const { getContext } = await import('/scripts/st-context.js');
        const context = getContext();
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
    await page.evaluate(async () => {
        const { getContext } = await import('/scripts/st-context.js');
        const context = getContext();
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
async function installGenerateStub(page, { story = false } = {}) {
    await page.evaluate(({ story }) => {
        window.__promptInspectorRequests = [];
        window.__promptInspectorOriginalFetch ??= window.fetch.bind(window);
        window.fetch = async (input, init = {}) => {
            const url = typeof input === 'string' ? input : input.url;
            if (!String(url).endsWith('/api/backends/chat-completions/generate')) {
                return window.__promptInspectorOriginalFetch(input, init);
            }
            const body = JSON.parse(String(init.body ?? '{}'));
            window.__promptInspectorRequests.push(body);
            const pipeline = story;
            return new Response(JSON.stringify({
                choices: [{ index: 0, finish_reason: pipeline ? 'tool_calls' : 'stop', message: pipeline
                    ? { role: 'assistant', content: null, tool_calls: [{ id: 'call_preview_live', type: 'function', function: { name: body.tool_choice.function.name, arguments: JSON.stringify({ content: 'stub reply' }) } }] }
                    : { content: 'stub reply' } }],
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        };
    }, { story });
}

async function runPreview(page, round = 0) {
    return await page.evaluate(async (pipelineRound) => {
        const mod = await import('/react/login/workspace/generation-service.js');
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
            const generation = await import('/react/login/workspace/generation-service.js');
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

        const chatLengthBefore = await page.evaluate(async () => (await import('/scripts/st-context.js')).getContext().chat.length);
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
        expect(await page.evaluate(async () => (await import('/scripts/st-context.js')).getContext().chat.length)).toBe(chatLengthBefore);
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

    test('previews a conditional pipeline fallback without sending it', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterInSeededChat(page);
        await enableOpenAiBackend(page);
        await installGenerateStub(page);
        await page.evaluate(async () => {
            const { getContext } = await import('/scripts/st-context.js');
            const { feature_settings } = await import('/scripts/feature-settings.js');
            feature_settings.tool_bindings = [{ name: 'submit_story', enabled: true }];
            const settings = getContext().chatCompletionSettings;
            settings.openai_max_context = 65536;
            settings.openai_max_tokens = 1024;
            settings.reply_pipeline = { enabled: true, steps: [{ tool: 'submit_story' }] };
            const { reloadUserToolBindings } = await import('/scripts/tool-bindings.js');
            reloadUserToolBindings();
        });
        await page.locator('#send_textarea').fill(PROBE_TEXT);
        await page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '提示词' }).first().click();
        const open = page.getByRole('button', { name: '查看 Prompt' });
        const overlay = page.getByRole('dialog', { name: 'Prompt 预览' });
        const rounds = overlay.getByRole('combobox', { name: '管线轮次' });
        const first = '轮次 1/1 · submit_story';
        const fallback = '兜底请求（仅当末步无可用回复时）';

        await open.click();
        await expect(rounds.locator('option:checked')).toHaveText(first, { timeout: 15_000 });
        await rounds.selectOption({ label: fallback });
        await expect(overlay.locator('.prompt-inspector-pipeline-note')).toContainText('不发送工具');
        await expect(overlay.getByText('预览（未发送）', { exact: true })).toBeVisible();
        // Compare against native intrinsic sizing, including the dropdown arrow.
        const { actual, intrinsic } = await rounds.evaluate(select => {
            const probe = select.cloneNode(true);
            Object.assign(probe.style, { position: 'absolute', visibility: 'hidden', maxWidth: 'none', width: 'max-content' });
            select.parentElement.append(probe);
            try {
                return { actual: select.offsetWidth, intrinsic: probe.offsetWidth };
            } finally {
                probe.remove();
            }
        });
        expect(actual).toBeGreaterThanOrEqual(intrinsic);

        await page.keyboard.press('Escape');
        await expect(overlay).toHaveCount(0);
        await open.click();
        await expect(rounds.locator('option:checked')).toHaveText(first, { timeout: 15_000 });
        expect(await page.evaluate(() => window.__promptInspectorRequests.length)).toBe(0);
    });

    test('reads the preview as a single column without changing the request', async ({ page, context }) => {
        await testSetup.awaitST({ page });
        await selectCharacterInSeededChat(page);
        await installGenerateStub(page);
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        await page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '提示词' }).first().click();
        const open = page.getByRole('button', { name: '查看 Prompt' });
        const dialog = page.getByRole('dialog', { name: 'Prompt 预览' });
        await open.click();
        await expect(dialog).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        const call = id => ({ role: 'assistant', tool_calls: [{ id, type: 'function', function: { name: 'story_preset', arguments: JSON.stringify({ kind: 'system', content: 'First line\n\nHidden river', name: 'Lore' }) } }] });
        const pair = (key, name, args) => {
            const id = `story_${key.repeat(24)}`;
            return [{ role: 'assistant', tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] },
                { role: 'tool', content: 'OK', tool_call_id: id }];
        };
        const id = `story_${'a'.repeat(24)}`;
        const request = {
            model: 'rpg', max_tokens: 64000,
            tools: [{ type: 'function', function: { name: 'submit_story', parameters: { type: 'object' } } }],
            messages: [call(id), { role: 'tool', content: 'OK', tool_call_id: id },
                call(`story_${'b'.repeat(24)}`), { role: 'tool', content: 'OK', tool_call_id: 'different-id' },
                ...pair('c', 'story_history', { content: '船长在午夜失踪。' }),
                ...pair('d', 'submit_story', { kind: 'user', content: '我走下钟楼石阶。' }),
                ...pair('e', 'submit_story', { kind: 'assistant', content: '石阶尽头有一扇铁门。' }),
                ...pair('f', 'story_continuation_input', { kind: 'user', content: '我听听门后有没有动静。' }),
                ...pair('g', 'submit_story', { content: 'Ordinary tool call' }),
                { role: 'system', content: '[Reply pipeline 1/1] Readable step. Year 2026.' }],
        };
        await page.evaluate(request => {
            const rounds = [{ index: 0, id: 'story', tool: 'submit_story', display: 'summary' }];
            let fallbackPreviews = 0;
            window.__emberDeskPromptInspectorBridge.preview = async (round = 0) => ({
                kind: 'prompt-preview', model: 'rpg',
                pipeline: { round, total: 1, fallback: round === 1, step: round === 0 ? rounds[0] : null, rounds },
                request: round === 0 ? request : { model: `fallback-probe-${++fallbackPreviews}`, messages: [] },
                budget: { context: 200000, response: 64000, remaining: 132369, used: 3631 },
                entries: [], dropped: [], summarized: [], warnings: [],
            });
        }, request);
        await open.click();
        await expect(dialog.getByRole('heading', { name: '查看 Prompt' })).toBeVisible();
        await expect(dialog.getByRole('heading', { name: /请求顺序/ })).toBeVisible();
        await expect(dialog.locator('.prompt-inspector-item').first()).toBeVisible();
        await expect(dialog.locator('.prompt-inspector-budget')).toHaveCount(0);
        const details = dialog.getByText('请求详情', { exact: true });
        const rows = dialog.locator('.prompt-inspector-item');
        for (const [indices, label, content] of [
            ['#4–#5', '历史摘要', '船长在午夜失踪。'],
            ['#6–#7', '玩家 · 历史原文', '我走下钟楼石阶。'],
            ['#8–#9', 'AI 回复 · 历史原文', '石阶尽头有一扇铁门。'],
            ['#10–#11', '本次输入', '我听听门后有没有动静。'],
        ]) {
            const row = rows.filter({ has: page.getByRole('button', { name: `${indices} ${label}`, exact: true }) });
            await expect(row.locator('.prompt-inspector-item-preview')).toHaveText(content);
        }
        await expect(rows).toHaveCount(10);
        await expect(rows.nth(7)).toContainText('#12');
        await expect(rows.nth(8).locator('.prompt-inspector-item-preview')).toHaveText('OK');
        await expect(rows.first()).toContainText('#0–#1');
        await expect(rows.first()).toContainText('Lore');
        await expect(rows.nth(1)).toContainText('#2');
        await expect(rows.nth(2)).toContainText('#3');
        await expect(rows.last().locator('.prompt-inspector-item-content')).toContainText('Readable step.');
        for (const width of [1220, 390]) {
            await page.setViewportSize({ width, height: 850 });
            await expect(details).toBeVisible();
            const summary = await details.boundingBox();
            const firstRow = await rows.first().boundingBox();
            expect(summary.y + summary.height).toBeLessThan(firstRow.y);
            expect(await dialog.evaluate(node => node.scrollWidth)).toBeLessThanOrEqual(await dialog.evaluate(node => node.clientWidth));
        }
        const param = dialog.getByText('64000', { exact: true });
        await expect(param).toBeHidden();
        await details.click();
        await expect(param).toBeVisible();
        await expect(dialog.getByRole('button', { name: /submit_story/ })).toBeVisible();
        await details.click();
        const search = dialog.getByRole('searchbox', { name: '搜索消息' });
        await search.fill('story_history');
        await expect(rows).toHaveCount(1);
        await expect(rows.first().locator('.prompt-inspector-item-content')).toHaveText(/船长在午夜失踪。.*story_history.*#5.*OK/s);
        await search.fill('#7');
        await expect(rows).toHaveCount(1);
        await expect(rows.first().locator('.prompt-inspector-item-content')).toHaveText(/我走下钟楼石阶。.*submit_story.*#7.*OK/s);
        await search.fill('HIDDEN RIVER');
        await expect(rows).toHaveCount(2); // The unmatched call remains searchable, but is not grouped.
        await search.fill('story_preset');
        await expect(rows).toHaveCount(2);
        await search.fill('2026');
        await expect(rows).toHaveCount(1);
        await expect(rows.first()).toContainText('Year 2026.');
        await search.fill('#1');
        await expect(rows).toHaveCount(1);
        await expect(rows.first().locator('.prompt-inspector-item-content')).toContainText('Hidden river');
        await expect(rows.first().locator('.prompt-inspector-item-content')).not.toContainText('arguments');
        await dialog.getByRole('button', { name: '原始 JSON' }).click();
        const raw = dialog.locator('.prompt-inspector-raw');
        const json = JSON.stringify(request, null, 2);
        expect(await raw.textContent()).toBe(json);
        await dialog.getByRole('button', { name: '复制 JSON' }).click();
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(json);
        await dialog.getByRole('combobox', { name: '管线轮次' }).selectOption('1');
        await expect(raw).toContainText('fallback-probe-1');
        await dialog.getByRole('button', { name: '刷新' }).click();
        await expect(raw).toContainText('fallback-probe-2');
        expect(await page.evaluate(() => window.__promptInspectorRequests.length)).toBe(0);
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
        await installGenerateStub(page, { story: true });

        // A runnable pipeline enables history projection; its configured tool
        // remains distinct from synthetic historical submit_story records.
        await page.evaluate(async () => {
            const { getContext } = await import('/scripts/st-context.js');
            const { feature_settings } = await import('/scripts/feature-settings.js');
            feature_settings.tool_bindings = [{ name: 'get_weather', enabled: true }];
            const settings = getContext().chatCompletionSettings;
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
        await page.evaluate(async () => {
            const { getContext } = await import('/scripts/st-context.js');
            const context = getContext();
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
        const before = await page.evaluate(async () => structuredClone((await import('/scripts/st-context.js')).getContext().chat));
        const budgetSettings = async () => await page.evaluate(async () => {
            const { getContext } = await import('/scripts/st-context.js');
            const { promptManager } = await import('/scripts/openai.js');
            const settings = getContext().chatCompletionSettings;
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
        const receiptIndexes = [];
        for (const call of submissions) {
            const index = messages.findIndex(message => message.tool_calls?.some(item => item.id === call.id)) + 1;
            expect(messages[index]).toEqual({ role: 'tool', content: 'OK', tool_call_id: call.id });
            receiptIndexes.push(index);
        }
        expect(messages.some(message => message.role === 'user' && message.content.includes('CURRENT_USER_TEXT'))).toBe(true);
        expect(wire.match(/PIPELINE_REPLY_TEXT/g)).toHaveLength(1);
        expect(wire).not.toContain('ANALYSIS_SCRATCH');
        expect(wire).not.toContain('BARE_ANALYSIS_TEXT');

        // Non-pipeline tool cards keep the structured replay.
        expect(messages.find(m => m.role === 'tool' && m.tool_call_id === 'call_np1')?.content).toBe('{"temp":20}');
        expect(assistantToolCalls.map(call => call?.function?.name)).toEqual(expect.arrayContaining(['get_weather']));

        await page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '提示词' }).first().click();
        const open = page.locator('button', { hasText: '查看 Prompt' }).first();
        const overlay = page.locator('.prompt-inspector-overlay');
        const rows = overlay.locator('.prompt-inspector-item');
        await open.click();
        await expect(rows.first()).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(overlay).toHaveCount(0);

        // The fixture seeds browser-only history; use its real browser preview.
        await page.evaluate(async () => {
            const { previewNextGenerationRequest } = await import('/react/login/workspace/generation-service.js');
            window.__emberDeskPromptInspectorBridge.preview = (round = 0) => previewNextGenerationRequest({ round });
        });
        await open.click();
        await expect(rows).toHaveCount(messages.length);
        for (const index of receiptIndexes) {
            const content = rows.nth(index).locator('.prompt-inspector-item-preview');
            await expect(content).toBeVisible();
            await expect(content).toHaveText('OK');
        }
        await page.keyboard.press('Escape');
        await expect(overlay).toHaveCount(0);

        expect(await page.evaluate(() => window.__promptInspectorRequests.length)).toBe(0);
        expect(await page.evaluate(async () => (await import('/scripts/st-context.js')).getContext().chat)).toEqual(before);
        const closingPreview = await runPreview(page, 1);
        expect(closingPreview.request.messages.flatMap(message => message.tool_calls ?? [])).toEqual(assistantToolCalls);
        expect(await budgetSettings()).toEqual(settingsBeforePreview);

        await page.evaluate(async () => (await import('/scripts/st-context.js')).getContext().generate('normal'));
        expect(await budgetSettings()).toEqual(settingsBeforePreview);
        expect(await page.evaluate(() => window.__promptInspectorRequests.length)).toBe(1);
        const [live] = await page.evaluate(() => window.__promptInspectorRequests);
        expect(live.tools.map(tool => tool.function.name)).toEqual(['get_weather']);
        // Compare what actually travels over JSON: undefined object fields are omitted.
        expect(live.messages).toEqual(JSON.parse(JSON.stringify(messages)));
    });
});
