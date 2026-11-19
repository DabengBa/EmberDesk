import { createServer } from 'node:http';
import { test as base, expect } from '@playwright/test';

import { testSetup } from './frontend/frontent-test-utils.js';

const characterName = 'Dev Character 001';
const seededChatName = 'Dev Character 001 Session 01';

const test = base.extend({
    characterModel: async ({ page }, use) => {
        const requests = [];
        let model;
        try {
            await use(async (responses, { streamOpenAi = false, temporary = false } = {}) => {
                model = createServer(async (req, res) => {
                    if (req.method === 'GET' && req.url === '/v1/models') {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ data: [{ id: 'gpt-4o-mini' }] }));
                        return;
                    }
                    if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
                        res.writeHead(404).end();
                        return;
                    }
                    let body = '';
                    for await (const chunk of req) body += chunk;
                    const step = responses[requests.length];
                    requests.push(JSON.parse(body));
                    if (!step || step.status) {
                        res.writeHead(step?.status ?? 500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: { message: 'provider boom' } }));

                    } else if (step.tool) {
                        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
                        const tool_calls = [{ index: 0, id: `call-${requests.length}`, function: { name: step.tool, arguments: JSON.stringify({ content: step.content }) } }];
                        res.end(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls } }] })}\n\ndata: [DONE]\n\n`);
                    } else if (step.holdOpen || step.stream) {
                        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
                        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: step.content } }] })}\n\n`);
                        if (!step.holdOpen) res.end('data: [DONE]\n\n');
                    } else {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ choices: [{ message: { content: step.content } }] }));
                    }
                });
                await new Promise(resolve => model.listen(0, '127.0.0.1', resolve));
                await testSetup.awaitST({ page });
                if (!temporary) await selectCharacterInFreshChat(page, characterName);
                await enableOpenAi(page, { streamOpenAi });
                await page.evaluate(endpoint => {
                    Object.assign(window.SillyTavern.getContext().chatCompletionSettings, {
                        custom_url: endpoint, reply_pipeline: { enabled: false },
                    });
                }, `http://127.0.0.1:${model.address().port}/v1`);
                if (!temporary) await page.getByRole('button', { name: '取消并关闭' }).click();
                return requests;
            });
        } finally {
            if (model) {
                model.closeAllConnections();
                await new Promise(resolve => model.close(resolve));
            }
        }
    },
});

async function openCharacterLibrary(page) {
    const panelButton = page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '角色库' }).first();
    await expect(panelButton).toBeVisible({ timeout: 10_000 });
    await panelButton.click({ timeout: 10_000 });
    await expect(panelButton).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
    await expect(page.locator('#right-nav-panel.openDrawer #rm_characters_block')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#rm_print_characters_block .character_select[data-chid]').first()).toBeVisible({ timeout: 10_000 });
}

async function selectCharacterInFreshChat(page, name) {
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
    await page.evaluate(async (nextChatName) => {
        const context = window.SillyTavern.getContext();
        await context.openCharacterChat(nextChatName);
    }, seededChatName);
    await page.evaluate(async () => {
        const script = await import('/script.js');
        await script.doNewChat({ deleteCurrentChat: false });
        await script.eventSource.emit(script.event_types.CHAT_LOADED, { detail: { source: 'e2e-fresh-chat' } });
    });
}

async function enableOpenAi(page, { streamOpenAi = false } = {}) {
    await page.evaluate(({ streamEnabled }) => {
        const context = window.SillyTavern.getContext();
        context.powerUserSettings.stream_fade_in = false;
        context.powerUserSettings.streaming_fps = 60;
        context.chatCompletionSettings.chat_completion_source = 'openai';
        context.chatCompletionSettings.openai_model = 'gpt-4o-mini';
        context.chatCompletionSettings.stream_openai = streamEnabled;
        context.chatCompletionSettings.n = 1;
        context.chatCompletionSettings.send_if_empty = '';
    }, { streamEnabled: streamOpenAi });
    await page.evaluate(async () => {
        const script = await import('/script.js');
        script.changeMainAPI('openai');
        script.setOnlineStatus('Valid');
        script.activateSendButtons();
    });
}

async function chooseRegenerate(page) {
    await page.locator('#options_button').click();
    const item = page.locator('#option_regenerate');
    await expect(item).toBeVisible({ timeout: 5_000 });
    await expect(item).toBeEnabled({ timeout: 5_000 });
    await item.click();
}

async function startCharacterRun(page, action, trigger) {
    const created = page.waitForResponse(response => response.url().endsWith('/generation/create')
        && response.request().postDataJSON()?.action === action);
    await trigger();
    const response = await created;
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()).id;
}

function regenerateCharacter(page) {
    return startCharacterRun(page, 'regenerate', () => chooseRegenerate(page));
}

async function expectRunStatus(page, id, status) {
    await expect.poll(async () => {
        const response = await page.request.get(`/api/chats/generation/${id}`);
        return (await response.json()).status;
    }).toBe(status);
}

async function sendCharacterMessage(page, text, reply) {
    const id = await startCharacterRun(page, 'send', async () => {
        await page.locator('#send_textarea').fill(text);
        await page.locator('#send_but').click();
    });
    await expectRunStatus(page, id, 'completed');
    await expect.poll(() => lastMessageText(page)).toBe(reply);
}

/**
 * Waits for an in-flight generation to fully settle — every end path
 * (success, failed-and-restored, user-abort) clears is_send_press and the
 * streaming processor.
 */
async function waitForRegenerateSettled(page) {
    await expect.poll(async () => page.evaluate(async () => {
        const script = await import('/script.js');
        return script.isGenerating() === false
            && window.SillyTavern.getContext().streamingProcessor === null;
    }), { timeout: 30_000 }).toBe(true);
}

async function lastMessageText(page) {
    return page.evaluate(() => {
        const script = window.SillyTavern.getContext();
        return String(script.chat.at(-1)?.mes ?? '');
    });
}

async function chatSnapshot(page) {
    return page.evaluate(() => {
        const context = window.SillyTavern.getContext();
        return context.chat.map(message => ({
            is_user: Boolean(message.is_user),
            is_system: Boolean(message.is_system),
            mes: String(message.mes ?? ''),
            toolInvocations: Array.isArray(message.extra?.tool_invocations),
        }));
    });
}

test('continues the saved role reply through the React options menu', async ({ page, characterModel }) => {
    const requests = await characterModel([
        { content: 'ORIGINAL_REPLY' },
        { content: 'CONTINUATION' },
        { status: 500 },
    ]);
    const options = page.locator('#options_button');
    const item = page.locator('#option_continue');
    await options.click();
    await expect(item).toBeVisible();
    await expect(item).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(options).toHaveAttribute('aria-expanded', 'false');

    await sendCharacterMessage(page, 'continue this story', 'ORIGINAL_REPLY');
    const before = await chatSnapshot(page);
    await page.locator('#send_textarea').fill('unsent draft');

    const continueReply = async () => {
        await options.click();
        await expect(item).toBeVisible({ timeout: 5_000 });
        await expect(item).toBeEnabled();
        return startCharacterRun(page, 'continue', () => item.click());
    };
    const created = page.waitForRequest(request => request.url().endsWith('/generation/create')
        && request.postDataJSON()?.action === 'continue');
    await expectRunStatus(page, await continueReply(), 'completed');
    expect((await created).postDataJSON()).toMatchObject({
        avatar_url: expect.any(String), file_name: expect.any(String), version: expect.any(String),
    });
    await expect.poll(() => lastMessageText(page)).toMatch(/^ORIGINAL_REPLY\s*CONTINUATION$/);
    const after = await chatSnapshot(page);
    expect(after.slice(0, -1)).toEqual(before.slice(0, -1));
    expect(after).toHaveLength(before.length);
    expect(JSON.stringify(requests[1].messages)).toContain('ORIGINAL_REPLY');
    expect(JSON.stringify(requests[1].messages)).not.toContain('unsent draft');
    await expect(page.locator('#send_textarea')).toHaveValue('unsent draft');

    await waitForRegenerateSettled(page);
    await expectRunStatus(page, await continueReply(), 'failed');
    await expect(page.getByText('generation_failed', { exact: true })).toBeVisible();
    expect(await chatSnapshot(page)).toEqual(after);
    expect(requests).toHaveLength(3);
});

async function startTemporaryChat(page) {
    await page.locator('#options_button').click();
    await page.locator('#option_start_new_chat').click();
}

test('temporary assistant regenerates with a browser action and cancels visibly when the step POST fails', async ({ page, characterModel }) => {
    const requests = await characterModel([
        { tool: 'custom', content: 'browser input' }, { tool: 'last', content: 'INITIAL_TEMPORARY_REPLY' },
        { tool: 'custom', content: 'fail action' }, { tool: 'last', content: 'REGENERATED_TEMPORARY_REPLY' },
        { tool: 'custom', content: 'fail reply' },
        { content: ' CONTINUED_TEMPORARY_REPLY' },
    ], { temporary: true, streamOpenAi: true });
    await page.evaluate(async () => {
        const { feature_settings } = await import('/scripts/feature-settings.js');
        feature_settings.tool_bindings = [{ name: 'custom', enabled: true,
            actionBody: 'if (args.content === "fail action") throw new Error("controlled action failure"); return "browser:" + args.content;' }];
        window.SillyTavern.getContext().chatCompletionSettings.reply_pipeline = { enabled: true, steps: [{ tool: 'custom' }, { tool: 'last' }] };
    });
    const writes = [];
    page.on('request', request => {
        if (/\/api\/(?:backends\/chat-completions\/generate|chats\/save)$/.test(request.url())) writes.push(request.url());
    });
    await startTemporaryChat(page);
    const composer = page.locator('#send_textarea');
    await composer.fill('temporary pipeline question');
    await page.locator('#file_form_input').setInputFiles({ name: 'temporary.txt', mimeType: 'text/plain', buffer: Buffer.from('TEMPORARY_ATTACHMENT') });
    const send = await startCharacterRun(page, 'send', () => page.locator('#send_but').click());
    await expectRunStatus(page, send, 'completed');
    await expect.poll(() => lastMessageText(page)).toContain('INITIAL_TEMPORARY_REPLY');
    expect(requests[1].messages).toContainEqual(expect.objectContaining({ role: 'tool', content: 'browser:browser input' }));
    await composer.fill('untouched draft');
    const regenerated = await regenerateCharacter(page);
    await expectRunStatus(page, regenerated, 'completed');
    await expect.poll(() => lastMessageText(page)).toContain('REGENERATED_TEMPORARY_REPLY');
    const regeneratedReply = await lastMessageText(page);
    expect(JSON.stringify(requests[2].messages)).toContain('TEMPORARY_ATTACHMENT');
    expect(JSON.stringify(requests[2].messages)).not.toContain('INITIAL_TEMPORARY_REPLY');
    expect(requests[3].messages).toContainEqual(expect.objectContaining({ role: 'tool', content: '{"ok":false,"error":"controlled action failure"}' }));

    const stepRoute = '**/generation/*/step';
    await page.route(stepRoute, route => route.fulfill({ status: 503, json: { error: 'controlled_step_reply_failure' } }));
    const cancelled = await regenerateCharacter(page);
    await expect(page.getByText('controlled_step_reply_failure', { exact: true })).toBeVisible();
    await expectRunStatus(page, cancelled, 'cancelled');
    await expect(page.locator('body')).not.toHaveAttribute('data-workspace-generation-running');
    expect(await lastMessageText(page)).toBe(regeneratedReply);
    expect(requests).toHaveLength(5);
    await page.unroute(stepRoute);

    const continued = await startCharacterRun(page, 'continue', async () => {
        await page.locator('#options_button').click();
        await page.locator('#option_continue').click();
    });
    await expectRunStatus(page, continued, 'completed');
    await expect.poll(() => lastMessageText(page)).toBe(`${regeneratedReply} CONTINUED_TEMPORARY_REPLY`);
    expect(requests[5].tool_choice).toBeUndefined();
    expect((await chatSnapshot(page)).filter(message => message.is_user)).toHaveLength(1);
    await expect(composer).toHaveValue('untouched draft');
    expect(writes).toEqual([]);
});

test('leaving a temporary assistant before create arrives prevents the model from starting', async ({ page, characterModel }) => {
    const requests = await characterModel([{ content: 'UNEXPECTED_REPLY' }], { temporary: true });
    await startTemporaryChat(page);
    const arrived = Promise.withResolvers();
    const release = Promise.withResolvers();
    await page.route('**/generation/create', async route => {
        arrived.resolve(route.request().postDataJSON());
        await release.promise;
        await route.continue();
    });
    const created = page.waitForResponse(response => response.url().endsWith('/generation/create'));
    await page.locator('#send_textarea').fill('leave before create');
    await page.locator('#send_but').click();
    const { requestId } = await arrived.promise;
    try {
        const cancellation = page.waitForResponse(response => response.url().endsWith('/generation/cancel'));
        await startTemporaryChat(page);
        const response = await cancellation;
        expect(response.status()).toBe(204);
        expect(response.request().postDataJSON()).toEqual({ temporary: true, requestId });
    } finally {
        release.resolve();
    }
    expect(await (await created).json()).toMatchObject({ status: 'cancelled', temporary: true });
    expect(requests).toEqual([]);
    expect((await chatSnapshot(page)).filter(message => !message.is_system)).toEqual([]);
});

test('navigating away from a running temporary assistant cancels the shared run', async ({ page, characterModel }) => {
    await characterModel([{ content: 'TEMPORARY_STREAM', holdOpen: true }], { temporary: true, streamOpenAi: true });
    await startTemporaryChat(page);
    await page.locator('#send_textarea').fill('leave while streaming');
    const id = await startCharacterRun(page, 'send', () => page.locator('#send_but').click());
    await expect(page.locator('#chat')).toContainText('TEMPORARY_STREAM');
    await expectRunStatus(page, id, 'running');
    await page.goto('about:blank');
    await expectRunStatus(page, id, 'cancelled');
});

test.describe('chat regenerate', () => {
    test.describe.configure({ mode: 'serial' });

    test('replaces the whole generated turn and never touches the composer or the user message', async ({ page, characterModel }) => {
        const requests = await characterModel([
            { content: 'ORIGINAL_REPLY' },
            { content: 'REGENERATED_REPLY' },
        ]);

        await sendCharacterMessage(page, 'first question', 'ORIGINAL_REPLY');
        let snapshot = await chatSnapshot(page);
        expect(snapshot.at(-1).mes).toContain('ORIGINAL_REPLY');
        const baseLength = snapshot.length;

        // Persist a same-turn pipeline/tool card and second reply so regeneration reads them from the canonical chat.
        await page.evaluate(async () => {
            const context = window.SillyTavern.getContext();
            const toolCard = {
                is_user: false,
                is_system: true,
                name: 'pipeline',
                send_date: '2024-01-01',
                mes: 'pipeline card',
                extra: { tool_invocations: [{ name: 'analyze', arguments: '{}', result: 'old-analysis' }] },
            };
            const assistantReply = {
                is_user: false,
                is_system: false,
                name: '',
                send_date: '2024-01-01',
                mes: 'SECOND_OLD_REPLY',
                extra: { api: 'openai', model: 'gpt-4o-mini' },
            };
            context.chat.push(toolCard, assistantReply);
            if (!await context.saveChat()) throw new Error('Could not save the same-turn fixture');
        });

        // An unsent composer draft must survive regeneration untouched.
        await page.locator('#send_textarea').fill('unsent draft text');
        await expect(page.locator('#send_textarea')).toHaveValue('unsent draft text');

        await expectRunStatus(page, await regenerateCharacter(page), 'completed');
        await expect.poll(() => lastMessageText(page)).toBe('REGENERATED_REPLY');

        // The tool card and BOTH old replies are gone; exactly one new reply sits
        // at the end — no extra user message was added.
        snapshot = await chatSnapshot(page);
        expect(snapshot).toHaveLength(baseLength);
        expect(snapshot.filter(m => m.is_user)).toHaveLength(1);
        expect(snapshot.find(m => m.is_user).mes).toBe('first question');
        expect(snapshot.filter(m => m.toolInvocations)).toHaveLength(0);
        expect(snapshot.at(-1).is_user).toBe(false);
        expect(snapshot.at(-1).mes).toContain('REGENERATED_REPLY');
        expect(snapshot.at(-1).mes).not.toContain('SECOND_OLD_REPLY');
        expect(snapshot.at(-1).mes).not.toContain('ORIGINAL_REPLY');

        // The request went out with the same user context but without any of
        // the removed turn's content.
        const request = requests.at(-1);
        const wire = JSON.stringify(request.messages);
        expect(wire).toContain('first question');
        expect(wire).not.toContain('SECOND_OLD_REPLY');
        expect(wire).not.toContain('ORIGINAL_REPLY');
        expect(wire).not.toContain('old-analysis');
        expect(request.messages.filter(m => m.role === 'tool')).toHaveLength(0);

        // Composer draft preserved.
        const draft = await page.evaluate(() => document.querySelector('#send_textarea')?.value ?? '');
        expect(draft).toBe('unsent draft text');
    });

    test('generates a reply when the last message is a user message', async ({ page, characterModel }) => {
        const requests = await characterModel([
            { content: 'FIRST_REPLY' },
            { content: 'FOLLOWUP_REPLY' },
        ]);

        await sendCharacterMessage(page, 'first question', 'FIRST_REPLY');
        await page.evaluate(async () => {
            const script = await import('/script.js');
            await script.sendMessageAsUser('second question');
        });

        await expectRunStatus(page, await regenerateCharacter(page), 'completed');
        await expect.poll(() => lastMessageText(page)).toBe('FOLLOWUP_REPLY');

        const snapshot = await chatSnapshot(page);
        expect(snapshot.filter(m => m.is_user)).toHaveLength(2);
        expect(snapshot.at(-1).is_user).toBe(false);
        expect(snapshot.at(-1).mes).toContain('FOLLOWUP_REPLY');

        const request = requests.at(-1);
        const wire = JSON.stringify(request.messages);
        expect(wire).toContain('second question');
        expect(wire).toContain('FIRST_REPLY');
    });

    test('preserves the previous reply when server regeneration fails outright', async ({ page, characterModel }) => {
        const requests = await characterModel([{ content: 'KEEP_ME_REPLY' }, { status: 500 }]);

        await sendCharacterMessage(page, 'first question', 'KEEP_ME_REPLY');
        const snapshotBefore = await chatSnapshot(page);
        expect(snapshotBefore.at(-1).mes).toContain('KEEP_ME_REPLY');

        await expectRunStatus(page, await regenerateCharacter(page), 'failed');
        await expect(page.getByText('generation_failed', { exact: true })).toBeVisible();

        // A failed server run never commits its replacement turn.
        const snapshotAfter = await chatSnapshot(page);
        expect(snapshotAfter).toEqual(snapshotBefore);
        expect(requests).toHaveLength(2);
    });

    test('keeps the saved reply after stopping a server regeneration', async ({ page }) => {

        let attempts = 0;
        let firstPrompt;
        const model = createServer(async (req, res) => {
            let body = '';
            for await (const chunk of req) body += chunk;
            if (!body.includes('first question')) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ data: [{ id: 'gpt-4o-mini' }], choices: [{ message: { content: 'ready' } }] }));
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/event-stream' });
            const text = ++attempts === 1 ? 'OLD_REPLY' : 'PARTIAL_NEW_';
            if (attempts === 1) firstPrompt = body;
            res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
            if (attempts === 1) res.end('data: [DONE]\n\n');
        });
        await new Promise(resolve => model.listen(0, '127.0.0.1', resolve));
        try {
            await testSetup.awaitST({ page });
            await selectCharacterInFreshChat(page, characterName);
            await enableOpenAi(page, { streamOpenAi: true });
            const chatName = await page.evaluate(async endpoint => {
                const context = window.SillyTavern.getContext();
                Object.assign(context.chatCompletionSettings, { custom_url: endpoint, reply_pipeline: { enabled: false } });
                const script = await import('/script.js');
                const book = await fetch('/api/worldinfo/edit', {
                    method: 'POST', headers: script.getRequestHeaders(), body: JSON.stringify({ name: 'Runtime handoff', data: { entries: {
                        1: { uid: 1, key: ['no match'], content: 'Original world marker', order: 100, position: 0 },
                        2: { uid: 2, key: ['runtime-scan-key'], content: 'Browser scan lore marker', order: 90, position: 0 },
                        3: { uid: 3, key: ['excluded-scan-key'], content: 'Filtered lore marker', order: 80, position: 0 },
                    } } }),
                });
                if (!book.ok) throw new Error(`World fixture failed: ${book.status}`);
                const { setWorldInfoGlobalActiveNames, updateWorldInfoList } = await import('/scripts/world-info.js');
                await updateWorldInfoList();
                const selected = setWorldInfoGlobalActiveNames(['Runtime handoff']);
                if (!selected.includes('Runtime handoff')) throw new Error('World fixture was not selected');
                // The UI commits this setting on a debounce; persist it with the endpoint fixture now.
                const { world_info } = await import('/scripts/world-info-state.js');
                world_info.globalSelect = selected;
                await script.saveSettings(0, { strict: true });
                const { setComposerValue } = await import('/scripts/main-chat-composer-service.js');
                setComposerValue('first question');
                script.setExtensionPrompt('handoff-scan', 'runtime-scan-key', 0, 0, true, 0, async () => true);
                script.setExtensionPrompt('handoff-filtered', 'excluded-scan-key', 0, 0, true, 0, async () => false);
                await script.eventSource.emit(script.event_types.WORLDINFO_FORCE_ACTIVATE, [
                    { world: 'Runtime handoff', uid: 1, content: 'Browser temporary lore marker', order: 100, position: 0 },
                ]);
                return context.characters[context.characterId].chat;
            }, `http://127.0.0.1:${model.address().port}/v1`);
            await page.getByRole('button', { name: '取消并关闭' }).click();
            await page.locator('#file_form_input').setInputFiles({ name: 'read-me.txt', mimeType: 'text/plain', buffer: Buffer.from('Managed browser attachment marker') });
            const drawer = page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '提示词' }).first();
            await drawer.click();
            const preview = page.waitForResponse(response => response.url().endsWith('/generation/preview'));
            await page.getByRole('button', { name: '查看 Prompt' }).first().click();
            const previewPrompt = JSON.stringify((await (await preview).json()).messages);
            expect(previewPrompt).toContain('Managed browser attachment marker');
            expect(await page.locator('#file_form_input').evaluate(input => input.files.length)).toBe(1);
            expect(previewPrompt).toContain('Browser temporary lore marker');
            expect(previewPrompt).toContain('Browser scan lore marker');
            expect(previewPrompt).not.toMatch(/Original world marker|Filtered lore marker/);
            await page.keyboard.press('Escape');
            await page.evaluate(async () => (await import('/script.js')).sendTextareaMessage());
            await expect.poll(() => lastMessageText(page)).toBe('OLD_REPLY');
            expect(JSON.stringify(JSON.parse(firstPrompt).messages)).toBe(previewPrompt);
            expect(firstPrompt).toContain('Managed browser attachment marker');
            expect(firstPrompt).toContain('Browser temporary lore marker');
            expect(firstPrompt).toContain('Browser scan lore marker');
            expect(firstPrompt).not.toMatch(/Original world marker|Filtered lore marker/);
            expect(await page.evaluate(() => window.SillyTavern.getContext().chat.find(row => row.is_user)?.extra?.files))
                .toEqual([expect.objectContaining({ name: 'read-me.txt' })]);
            await page.evaluate(async () => (await import('/script.js')).regenerateLastReply());
            await expect(page.getByText('PARTIAL_NEW_', { exact: true })).toBeVisible();
            await expect(page.locator('#mes_stop')).toBeVisible();
            await expect(page.locator('#send_but')).toBeHidden();
            const openChat = name => page.evaluate(chat => window.SillyTavern.getContext().openCharacterChat(chat), name);
            await openChat(seededChatName);
            await expect(page.getByText('PARTIAL_NEW_', { exact: true })).toHaveCount(0);
            await openChat(chatName);
            await expect(page.getByText('PARTIAL_NEW_', { exact: true })).toBeVisible();
            await page.reload();
            await testSetup.awaitST({ page });
            await page.evaluate(async ({ name, chat }) => {
                const context = window.SillyTavern.getContext();
                await context.selectCharacterById(context.characters.findIndex(card => card.name === name));
                await context.openCharacterChat(chat);
            }, { name: characterName, chat: chatName });
            await expect(page.getByText('PARTIAL_NEW_', { exact: true })).toBeVisible();
            const cancellation = page.waitForResponse(response => response.url().endsWith('/cancel') && response.request().method() === 'POST');
            await page.locator('#mes_stop').click();
            expect((await (await cancellation).json()).status).toBe('cancelled');
            await expect(page.getByText('PARTIAL_NEW_', { exact: true })).toHaveCount(0);
            await expect(page.locator('#mes_stop')).toBeHidden();
            await expect(page.locator('#send_but')).toBeVisible();
            expect(await lastMessageText(page)).toBe('OLD_REPLY');
            expect((await chatSnapshot(page)).filter(row => row.mes === 'OLD_REPLY')).toHaveLength(1);
            expect(attempts).toBe(2);
        } finally {
            model.closeAllConnections();
            await new Promise(resolve => model.close(resolve));
        }
    });

    test('reconciles a stale chat load against the current version from terminal discovery without looping', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterInFreshChat(page, characterName);
        await enableOpenAi(page);
        await page.getByRole('button', { name: '取消并关闭' }).click();
        const staleReply = 'OLD_SNAPSHOT';
        const savedReply = 'COMMITTED_WHILE_AWAY';
        let reads = 0;
        let discoveries = 0;
        let keepServingStale = false;
        const isSeededChat = request => request.postDataJSON().file_name === seededChatName;
        await page.route('**/api/chats/get', async route => {
            if (!isSeededChat(route.request())) return route.continue();
            const stale = ++reads === 1 || keepServingStale;
            await route.fulfill({ headers: { 'X-Chat-Version': stale ? 'old-chat' : 'current-chat' }, json: [
                { chat_metadata: { integrity: 'discovery-race' } },
                { name: characterName, mes: stale ? staleReply : savedReply },
            ] });
        });
        await page.route('**/api/chats/generation/find', async route => {
            if (!isSeededChat(route.request())) return route.continue();
            discoveries++;
            await route.fulfill({ json: { id: 'historical-run', status: 'completed', version: 'old-chat', chatVersion: 'current-chat' } });
        });
        const open = () => page.evaluate(async chat => window.SillyTavern.getContext().openCharacterChat(chat), seededChatName);
        await open();
        await expect(page.getByText(savedReply, { exact: true })).toBeVisible();
        await expect.poll(() => discoveries).toBe(2);
        expect(reads).toBe(2);

        keepServingStale = true;
        await open();
        await expect.poll(() => discoveries).toBe(4);
        // Observe the follow-up discovery long enough for an erroneous third read.
        await expect(page.waitForRequest(request => request.url().endsWith('/api/chats/get') && isSeededChat(request), { timeout: 500 }))
            .rejects.toThrow('Timeout 500ms exceeded');
        expect(reads).toBe(4);
        await expect(page.getByText(staleReply, { exact: true })).toBeVisible();
    });

    test('persists newly edited generation parameters before preview and send', async ({ page }) => {
        await testSetup.awaitST({ page });
        await selectCharacterInFreshChat(page, characterName);
        await enableOpenAi(page);
        await page.getByRole('button', { name: '取消并关闭' }).click();
        await page.evaluate(async () => (await import('/script.js')).saveSettings(0, { strict: true }));
        const events = [];
        await page.route('**/api/settings/save', async route => {
            const response = await route.fetch();
            events.push(response.ok() ? 'settings committed' : 'settings failed');
            await route.fulfill({ response });
        });
        await page.route('**/api/chats/generation/preview', async route => {
            events.push('preview requested');
            await route.continue();
        });
        await page.route('**/api/chats/generation/create', async route => {
            events.push('create requested');
            await route.fulfill({ status: 202, json: { id: 'settings-proof', status: 'cancelled' } });
        });
        const drawer = page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '提示词' }).first();
        await drawer.click();
        const preview = page.waitForResponse(response => response.url().endsWith('/generation/preview'));
        await page.evaluate(async () => {
            const { getOpenAIPresetService } = await import('/scripts/openai.js');
            getOpenAIPresetService().setField('openai_max_tokens', 700);
            Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === '查看 Prompt').click();
        });
        const previewResponse = await preview;
        const previewEvents = events.splice(0);
        const previewTokens = (await previewResponse.json()).budget?.responseTokens;
        await page.keyboard.press('Escape');

        await page.evaluate(async () => {
            const { getOpenAIPresetService } = await import('/scripts/openai.js');
            const { setComposerValue } = await import('/scripts/main-chat-composer-service.js');
            const script = await import('/script.js');
            getOpenAIPresetService().setField('openai_max_tokens', 900);
            setComposerValue('Use the new settings immediately');
            await script.sendTextareaMessage();
        });
        expect({ previewEvents, previewTokens, sendEvents: events }).toEqual({
            previewEvents: ['settings committed', 'preview requested'], previewTokens: 700,
            sendEvents: ['settings committed', 'create requested'],
        });
    });

    test('resumes a custom server Pipeline step in the browser after reload', async ({ page }) => {
        const rounds = [];
        const finishLastStep = Promise.withResolvers();
        const model = createServer(async (req, res) => {
            let body = '';
            for await (const chunk of req) body += chunk;
            const data = JSON.parse(body || '{}');
            const name = data.tool_choice?.function?.name;
            if (!name) {
                res.end(JSON.stringify({ data: [{ id: 'gpt-4o-mini' }], choices: [{ message: { content: 'ready' } }] }));
                return;
            }
            rounds.push(data);
            if (name === 'last_step') await finishLastStep.promise;
            res.writeHead(200, { 'Content-Type': 'text/event-stream' });
            res.end(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: `call-${name}`, function: { name, arguments: JSON.stringify({ content: `output-${name}`, ...(name === 'last_step' ? { options: ['Next <place>'] } : {}) }) } }] } }] })}\n\ndata: [DONE]\n\n`);
        });
        await new Promise(resolve => model.listen(0, '127.0.0.1', resolve));
        try {
            await testSetup.awaitST({ page });
            await selectCharacterInFreshChat(page, characterName);
            await enableOpenAi(page, { streamOpenAi: true });
            const chatName = await page.evaluate(async endpoint => {
                const context = window.SillyTavern.getContext();
                Object.assign(context.chatCompletionSettings, { custom_url: endpoint, reply_pipeline: { enabled: true, steps: [{ tool: 'custom_step' }, { tool: 'last_step' }] } });
                const { feature_settings } = await import('/scripts/feature-settings.js');
                feature_settings.tool_bindings = [{ name: 'custom_step', enabled: true,
                    actionBody: 'localStorage.setItem("pipeline-runs", String(Number(localStorage.getItem("pipeline-runs")) + 1)); return "browser:" + args.content;' }];
                const script = await import('/script.js');
                await script.saveSettings(0, { strict: true });
                return context.characters[context.characterId].chat;
            }, `http://127.0.0.1:${model.address().port}/v1`);
            await page.getByRole('button', { name: '取消并关闭' }).click();
            const events = /\/generation\/[^/]+\/events$/;
            await page.route(events, route => route.abort());
            await page.evaluate(async () => {
                (await import('/scripts/main-chat-composer-service.js')).setComposerValue('pipeline question');
                await (await import('/script.js')).sendTextareaMessage();
            });
            await expect.poll(() => rounds.length).toBe(1);
            expect(await page.evaluate(() => localStorage.getItem('pipeline-runs'))).toBeNull();
            await page.unroute(events);
            const reopenChat = async () => {
                await page.reload();
                await testSetup.awaitST({ page });
                await page.evaluate(async ({ name, chat }) => {
                    const context = window.SillyTavern.getContext();
                    await context.selectCharacterById(context.characters.findIndex(card => card.name === name));
                    await context.openCharacterChat(chat);
                }, { name: characterName, chat: chatName });
            };
            await reopenChat();
            const liveCard = page.locator('#chat [data-pipeline-run]');
            const summary = liveCard.locator(':scope > summary');
            await summary.click({ timeout: 5000 });
            await expect(liveCard.locator('[data-pipeline-step="custom_step"] [data-tool-invocation-name]')).toBeVisible();
            expect(await page.evaluate(() => window.SillyTavern.getContext().chat.some(row => row.extra?.reply_pipeline_run))).toBe(false);
            await reopenChat();
            await expect(summary).toHaveText('Tool calls: custom_step');
            finishLastStep.resolve();
            await expect.poll(() => lastMessageText(page)).toContain('output-last_step');
            await expect(liveCard).toHaveCount(0);
            const chip = page.getByRole('button', { name: '▸ Next <place>' });
            await expect(chip).toBeVisible();
            await chip.click();
            await expect(page.locator('#send_textarea')).toHaveValue('Next <place>');
            expect(await page.evaluate(() => localStorage.getItem('pipeline-runs'))).toBe('1');
            expect(rounds).toHaveLength(2);
            expect(rounds[1].messages).toContainEqual(expect.objectContaining({ role: 'tool', content: 'browser:output-custom_step' }));
            expect((await chatSnapshot(page)).filter(row => row.mes.includes('output-last_step'))).toHaveLength(1);
        } finally {
            finishLastStep.resolve();
            model.closeAllConnections();
            await new Promise(resolve => model.close(resolve));
        }
    });

    test('disables the menu item while a generation is in flight', async ({ page, characterModel }) => {
        await characterModel([
            { content: 'OLD_REPLY' },
            { content: 'REGENERATING_PARTIAL', holdOpen: true },
        ], { streamOpenAi: true });

        await sendCharacterMessage(page, 'first question', 'OLD_REPLY');

        const run = await regenerateCharacter(page);
        await expect(page.getByText('REGENERATING_PARTIAL', { exact: true })).toBeVisible();
        await expectRunStatus(page, run, 'running');

        await page.locator('#options_button').click();
        const item = page.locator('#option_regenerate');
        await expect(item).toBeVisible();
        await expect(item).toBeDisabled();

        // Toggle the menu closed without using the Escape shortcut, which can also stop generation.
        await page.locator('#options_button').click();
        await expect(page.locator('#options')).toBeHidden();
        await page.locator('#mes_stop').click();
        await expectRunStatus(page, run, 'cancelled');
        await expect(page.getByText('REGENERATING_PARTIAL', { exact: true })).toHaveCount(0);
        await expect(page.locator('#mes_stop')).toBeHidden();
        expect(await lastMessageText(page)).toBe('OLD_REPLY');
    });

    test('sends the configured empty composer text through server generation', async ({ page, characterModel }) => {
        const requests = await characterModel([{ content: 'EMPTY_COMPOSER_REPLY' }]);
        await page.evaluate(() => {
            window.SillyTavern.getContext().chatCompletionSettings.send_if_empty = '  SENTINEL_EMPTY_TEXT  ';
        });
        const browserRequests = [];
        page.on('request', request => {
            if (request.url().endsWith('/api/backends/chat-completions/generate')) browserRequests.push(request.url());
        });

        await expect(page.locator('#send_textarea')).toHaveValue('');
        await page.locator('#send_but').click();
        await expect.poll(() => lastMessageText(page)).toBe('EMPTY_COMPOSER_REPLY');
        expect(browserRequests).toEqual([]);
        expect(requests).toHaveLength(1);
        expect(requests[0].messages).toContainEqual(expect.objectContaining({ role: 'user', content: 'SENTINEL_EMPTY_TEXT' }));
        expect((await chatSnapshot(page)).filter(message => message.is_user).map(message => message.mes)).toEqual(['SENTINEL_EMPTY_TEXT']);
    });

    test('never fires send_if_empty and never adds a synthetic user message', async ({ page, characterModel }) => {
        const requests = await characterModel([
            { content: 'ORIGINAL_REPLY' },
            { content: 'REGENERATED_REPLY' },
        ]);

        await sendCharacterMessage(page, 'first question', 'ORIGINAL_REPLY');
        const baseSnapshot = await chatSnapshot(page);

        // A configured send_if_empty must not leak into a regenerate — the
        // composer is not part of this flow at all.
        await page.evaluate(() => {
            window.SillyTavern.getContext().chatCompletionSettings.send_if_empty = 'SENTINEL_EMPTY_TEXT';
        });

        await expectRunStatus(page, await regenerateCharacter(page), 'completed');
        await expect.poll(() => lastMessageText(page)).toBe('REGENERATED_REPLY');

        const snapshot = await chatSnapshot(page);
        expect(snapshot).toHaveLength(baseSnapshot.length);
        expect(snapshot.filter(m => m.is_user)).toHaveLength(baseSnapshot.filter(m => m.is_user).length);
        expect(snapshot.every(m => !m.mes.includes('SENTINEL_EMPTY_TEXT'))).toBe(true);
        expect(snapshot.at(-1).mes).toContain('REGENERATED_REPLY');

        const request = requests.at(-1);
        expect(JSON.stringify(request.messages)).not.toContain('SENTINEL_EMPTY_TEXT');
    });

    test('leaves a pending file attachment untouched', async ({ page, characterModel }) => {
        const requests = await characterModel([
            { content: 'ORIGINAL_REPLY' },
            { content: 'REGENERATED_REPLY' },
        ]);

        await sendCharacterMessage(page, 'first question', 'ORIGINAL_REPLY');
        const baseSnapshot = await chatSnapshot(page);

        // Stage a pending attachment in the send form — regenerate must not
        // materialize it into a user message or consume it.
        await page.evaluate(() => {
            const transfer = new DataTransfer();
            transfer.items.add(new File(['PENDING_ATTACHMENT_BODY'], 'pending-note.txt', { type: 'text/plain' }));
            const input = document.getElementById('file_form_input');
            input.files = transfer.files;
        });
        expect(await page.evaluate(() => {
            const input = document.getElementById('file_form_input');
            return input.files.length;
        })).toBe(1);

        await expectRunStatus(page, await regenerateCharacter(page), 'completed');
        await expect.poll(() => lastMessageText(page)).toBe('REGENERATED_REPLY');

        const snapshot = await chatSnapshot(page);
        expect(snapshot).toHaveLength(baseSnapshot.length);
        expect(snapshot.filter(m => m.is_user)).toHaveLength(baseSnapshot.filter(m => m.is_user).length);
        expect(snapshot.at(-1).mes).toContain('REGENERATED_REPLY');

        // Still staged — regenerate did not silently drop or attach the file.
        expect(await page.evaluate(() => {
            const input = document.getElementById('file_form_input');
            return input.files.length;
        })).toBe(1);

        const request = requests.at(-1);
        const wire = JSON.stringify(request.messages);
        expect(wire).not.toContain('pending-note.txt');
        expect(wire).not.toContain('PENDING_ATTACHMENT_BODY');
    });

    test('uses server generation in the assistant scratch chat and preserves the reply on failure', async ({ page, characterModel }) => {
        const requests = await characterModel([
            { content: 'SCRATCH_REPLY', stream: true },
            { content: 'SCRATCH_PARTIAL', holdOpen: true },
            { status: 500 },
            { content: 'SCRATCH_REPLACEMENT', stream: true },
        ], { temporary: true, streamOpenAi: true });
        const unrelatedRequests = [];
        page.on('request', request => {
            if (/\/api\/(?:backends\/chat-completions\/generate|chats\/save)$/.test(request.url())) unrelatedRequests.push(request.url());
        });
        await page.locator('#send_textarea').fill('scratch question');
        const drawer = page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '提示词' }).first();
        await drawer.click();
        const preview = page.waitForResponse(response => response.url().endsWith('/generation/preview'));
        await page.getByRole('button', { name: '查看 Prompt' }).first().click();
        const { messages } = await (await preview).json();
        expect(messages).toContainEqual(expect.objectContaining({ role: 'user', content: 'scratch question' }));
        await page.keyboard.press('Escape');
        await expectRunStatus(page, await startCharacterRun(page, 'send', () => page.locator('#send_but').click()), 'completed');
        await expect(page.locator('#chat').getByText('SCRATCH_REPLY', { exact: true })).toBeVisible();
        expect(requests[0].messages).toEqual(messages);
        await expect(page.locator('#send_textarea')).toHaveValue('');
        const snapshotBefore = await chatSnapshot(page);
        expect(snapshotBefore.at(-1).mes).toContain('SCRATCH_REPLY');

        const stopped = await regenerateCharacter(page);
        await expect(page.locator('#chat').getByText('SCRATCH_PARTIAL', { exact: true })).toBeVisible();
        await page.locator('#mes_stop').click();
        await expectRunStatus(page, stopped, 'cancelled');
        await expect(page.locator('#chat').getByText('SCRATCH_PARTIAL', { exact: true })).toHaveCount(0);
        expect(await chatSnapshot(page)).toEqual(snapshotBefore);

        await expectRunStatus(page, await regenerateCharacter(page), 'failed');
        await expect(page.locator('body')).not.toHaveAttribute('data-workspace-generation-running', '');

        const snapshotAfter = await chatSnapshot(page);
        expect(snapshotAfter).toHaveLength(snapshotBefore.length);
        expect(snapshotAfter.at(-1).mes).toContain('SCRATCH_REPLY');
        await expectRunStatus(page, await regenerateCharacter(page), 'completed');
        await expect(page.locator('#chat').getByText('SCRATCH_REPLACEMENT', { exact: true })).toBeVisible();
        const replacement = await chatSnapshot(page);
        expect(replacement.slice(0, -1)).toEqual(snapshotBefore.slice(0, -1));
        expect(replacement.at(-1).mes).toBe('SCRATCH_REPLACEMENT');
        expect(requests).toHaveLength(4);
        expect(unrelatedRequests).toEqual([]);
        await page.reload();
        await expect(page.locator('#send_textarea')).toBeVisible();
        await expect(page.locator('#chat').getByText('SCRATCH_REPLACEMENT', { exact: true })).toHaveCount(0);
    });

    test('reports unavailable while editing, offline, or without an active chat', async ({ page, characterModel }) => {
        await characterModel([{ content: 'REPLY' }]);
        await sendCharacterMessage(page, 'first question', 'REPLY');

        const canRegenerate = () => page.evaluate(async () => {
            const script = await import('/script.js');
            return script.canRegenerateLastReply();
        });
        expect(await canRegenerate()).toBe(true);

        // Message edit mode disables it.
        await page.evaluate(async () => {
            const script = await import('/script.js');
            script.setEditedMessageId(0);
        });
        expect(await canRegenerate()).toBe(false);
        await page.evaluate(async () => {
            const script = await import('/script.js');
            script.setEditedMessageId(undefined);
        });
        expect(await canRegenerate()).toBe(true);

        // A disconnected provider disables it.
        await page.evaluate(async () => {
            const script = await import('/script.js');
            script.setOnlineStatus('no_connection');
        });
        expect(await canRegenerate()).toBe(false);
        await page.evaluate(async () => {
            const script = await import('/script.js');
            script.setOnlineStatus('Valid');
        });
        expect(await canRegenerate()).toBe(true);

        // No active chat (nothing selected, empty history) disables it.
        await page.evaluate(async () => {
            const script = await import('/script.js');
            await script.closeCurrentChat();
        });
        expect(await canRegenerate()).toBe(false);
    });
});
