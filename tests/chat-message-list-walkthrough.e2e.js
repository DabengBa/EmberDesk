import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect } from '@playwright/test';

import { testSetup } from './frontend/frontent-test-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:8000';
const dataRoot = path.resolve(repoRoot, process.env.PLAYWRIGHT_DATA_ROOT ?? '.tmp/playwright-e2e-data');
const userHandle = process.env.PLAYWRIGHT_USER ?? 'playwright-e2e';
const userRoot = path.join(dataRoot, userHandle);
const characterName = 'Dev Character 001';
const chatFolder = 'dev-character-001';
const seededChatName = 'Dev Character 001 Session 01';
const alternateChatName = 'Dev Character 001 Session 02';
const longChatName = 'Dev Character 001 Long Walkthrough Proof';
const reasoningChatName = 'Dev Character 001 Reasoning Walkthrough';
const reactMainChatMessageListEnabled = process.env.EMBERDESK_FEATURES_REACT_PANELS_MAINCHATMESSAGELIST === 'true';
const seededChatPath = path.join(userRoot, 'chats', chatFolder, `${seededChatName}.jsonl`);
const longChatPath = path.join(userRoot, 'chats', chatFolder, `${longChatName}.jsonl`);
const reasoningChatPath = path.join(userRoot, 'chats', chatFolder, `${reasoningChatName}.jsonl`);
const longChatLimit = 25;
const mobileViewports = [
    { name: 'narrow phone', width: 390, height: 844 },
    { name: 'wide mobile', width: 768, height: 1024 },
];

function readChatJsonl(filePath) {
    return fs.readFileSync(filePath, 'utf8')
        .split(/\r?\n/)
        .filter(Boolean)
        .map(line => JSON.parse(line));
}

function getChatMessages(filePath) {
    return readChatJsonl(filePath).slice(1);
}

function createLongChatFixture(sourceFilePath, targetFilePath, messageCount = 130) {
    const [header] = readChatJsonl(sourceFilePath);
    const startedAt = Date.UTC(2026, 5, 6, 8, 0, 0);
    const lines = [JSON.stringify(header)];

    for (let index = 0; index < messageCount; index++) {
        const isUser = index % 2 === 0;
        lines.push(JSON.stringify({
            name: isUser ? 'User' : characterName,
            is_user: isUser,
            is_system: false,
            mes: `Long walkthrough message ${String(index + 1).padStart(3, '0')} from ${isUser ? 'user' : characterName}.`,
            send_date: new Date(startedAt + index * 30000).toISOString(),
        }));
    }

    fs.writeFileSync(targetFilePath, `${lines.join('\n')}\n`, 'utf8');
}

function createReasoningChatFixture(sourceFilePath, targetFilePath) {
    const [header] = readChatJsonl(sourceFilePath);
    const startedAt = Date.UTC(2026, 5, 7, 9, 0, 0);
    const messages = [
        {
            name: 'User',
            is_user: true,
            is_system: false,
            mes: 'Walk me through your analysis before answering.',
            send_date: new Date(startedAt).toISOString(),
        },
        {
            name: characterName,
            is_user: false,
            is_system: false,
            mes: 'Visible answer after the first reasoning block.',
            send_date: new Date(startedAt + 30000).toISOString(),
            gen_started: new Date(startedAt + 25000).toISOString(),
            gen_finished: new Date(startedAt + 30000).toISOString(),
            extra: {
                reasoning: 'First reasoning block.\nCheck the visible answer boundary before finalizing.',
                reasoning_duration: 4200,
                reasoning_type: 'model',
            },
        },
        {
            name: 'User',
            is_user: true,
            is_system: false,
            mes: 'Do it again and keep the rationale editable.',
            send_date: new Date(startedAt + 60000).toISOString(),
        },
        {
            name: characterName,
            is_user: false,
            is_system: false,
            mes: 'Second visible answer with a separate reasoning block.',
            send_date: new Date(startedAt + 90000).toISOString(),
            gen_started: new Date(startedAt + 85000).toISOString(),
            gen_finished: new Date(startedAt + 90000).toISOString(),
            extra: {
                reasoning: 'Second reasoning block.\nThis one proves collapse-all and cancel-edit behavior.',
                reasoning_duration: 3900,
                reasoning_type: 'model',
            },
        },
    ];

    const lines = [JSON.stringify(header), ...messages.map(message => JSON.stringify(message))];
    fs.writeFileSync(targetFilePath, `${lines.join('\n')}\n`, 'utf8');
}

function createConsoleErrorCollector(page) {
    const errors = [];

    page.on('console', (message) => {
        if (message.type() !== 'error') {
            return;
        }

        errors.push({
            text: message.text(),
            location: message.location(),
        });
    });

    return errors;
}

function getUnexpectedConsoleErrors(errors) {
    return errors.filter((error) => {
        const url = error.location?.url ?? '';
        const isSeedPersonaThumbnail404 = error.text.includes('Failed to load resource')
            && url.includes('/thumbnail?type=persona&file=user-default.png');

        return !isSeedPersonaThumbnail404;
    });
}

async function setChatTruncation(page, truncationLimit) {
    await page.evaluate((nextTruncationLimit) => {
        window.SillyTavern.getContext().powerUserSettings.chat_truncation = nextTruncationLimit;
    }, truncationLimit);
}

async function openCharacterManagement(page) {
    const characterList = page.locator('#rm_characters_block');

    if (await characterList.isVisible()) {
        return;
    }

    const panelButton = page.locator('.react-workspace-shell-nav-button').filter({ hasText: 'Character Library' });
    if (await panelButton.isVisible()) {
        await panelButton.click({ timeout: 10_000 });
        await expect(panelButton).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
    } else {
        await page.locator('.mes .drawer-opener[data-target="rightNavHolder"]').filter({ hasText: /Character Management|角色管理/ }).first().click();
    }
    await expect(page.locator('#right-nav-panel.openDrawer #rm_characters_block')).toBeVisible({ timeout: 10_000 });
}

async function closeCharacterAuthoringAfterSelection(page) {
    const authoringPanel = page.locator('[data-react-authoring-owner="characterAuthoring"]');
    if (!await authoringPanel.isVisible()) {
        return;
    }

    const activePanelButton = page.locator('.react-workspace-shell-nav-button[aria-pressed="true"]').first();
    await expect(activePanelButton).toBeVisible();
    await activePanelButton.click();
    await expect(authoringPanel).toBeHidden();
}

async function selectCharacterFromVisibleList(page, name) {
    await openCharacterManagement(page);
    const characterCard = page.locator('#rm_print_characters_block .character_select').filter({ hasText: name }).first();
    await expect(characterCard).toBeVisible();
    await characterCard.click();
    await expect.poll(async () => page.evaluate((characterName) => {
        const context = window.SillyTavern.getContext();
        return context.characters[context.characterId]?.name === characterName;
    }, name)).toBe(true);
    await closeCharacterAuthoringAfterSelection(page);
    await expect(page.locator('#options_button')).toBeVisible();
}

async function openPastChatsPopup(page) {
    await page.locator('#options_button').click();
    await expect(page.locator('#option_select_chat')).toBeVisible();
    await page.locator('#option_select_chat').click();
    await expect(page.locator('#shadow_select_chat_popup')).toBeVisible();
    await expect(page.locator('#select_chat_popup')).toBeVisible();
    await expect(page.locator('#select_chat_search')).toBeVisible();
}

async function closePastChatsPopup(page) {
    await page.locator('#select_chat_cross').click();
    await expect(page.locator('#shadow_select_chat_popup')).toBeHidden();
}

async function selectPastChatByVisibleName(page, chatName) {
    const search = page.locator('#select_chat_search');
    await search.fill(chatName);
    const chatRow = page.locator('#select_chat_div .select_chat_block').filter({ hasText: chatName }).first();
    await expect(chatRow).toBeVisible();
    await chatRow.click();
    await expect(page.locator('#shadow_select_chat_popup')).toBeHidden();
}

async function openPastChat(page, chatName) {
    await openPastChatsPopup(page);
    await selectPastChatByVisibleName(page, chatName);
    await expect(page.locator('#chat > .mes[mesid] .mes_text').first()).toBeVisible();
}

async function openPastChatSearchThenClose(page, searchText) {
    await openPastChatsPopup(page);
    await page.locator('#select_chat_search').fill(searchText);
    await expect(page.locator('#select_chat_div .select_chat_block').first()).toBeVisible();
    await closePastChatsPopup(page);
}

async function openMessageActions(page, messageId) {
    const row = page.locator(`#chat > .mes[mesid="${messageId}"]`);
    await expect(row).toBeVisible();
    await row.hover();
    const hint = row.getByRole('button', { name: 'Message Actions' });
    await expect(hint).toBeVisible();
    await hint.click();
    await expect(row.getByRole('button', { name: 'Copy' })).toBeVisible();
    return row;
}

async function grantClipboardPermissions(page) {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE_URL });
}

function normalizeMultilineText(value) {
    return String(value)
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .join('\n')
        .trim();
}

async function expectClipboardText(page, expectedText) {
    await expect.poll(async () => {
        const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
        return normalizeMultilineText(clipboardText);
    }).toBe(normalizeMultilineText(expectedText));
}

async function getRelativeRowTop(page, messageId) {
    return page.evaluate((targetMessageId) => {
        const chatContainer = document.getElementById('chat');
        const row = document.querySelector(`#chat > .mes[mesid="${targetMessageId}"]`);
        if (!(chatContainer instanceof HTMLElement) || !(row instanceof HTMLElement)) {
            return null;
        }

        const chatRect = chatContainer.getBoundingClientRect();
        const rowRect = row.getBoundingClientRect();
        return rowRect.top - chatRect.top;
    }, String(messageId));
}

async function wheelRowNearViewportTop(page, messageId, targetTop = 140) {
    const chat = page.locator('#chat');
    await expect(chat).toBeVisible();
    const chatBox = await chat.boundingBox();
    if (!chatBox) {
        throw new Error('Chat container bounding box is unavailable.');
    }

    await page.mouse.move(chatBox.x + Math.min(chatBox.width / 2, 80), chatBox.y + Math.min(chatBox.height / 2, 120));

    for (let attempt = 0; attempt < 20; attempt++) {
        const relativeTop = await getRelativeRowTop(page, messageId);
        if (relativeTop === null) {
            throw new Error(`Unable to measure row ${messageId} during wheel positioning.`);
        }

        const delta = relativeTop - targetTop;
        if (Math.abs(delta) <= 12) {
            return relativeTop;
        }

        const wheelDelta = Math.max(Math.min(delta, 360), -360);
        await page.mouse.wheel(0, wheelDelta);
        await page.waitForTimeout(60);
    }

    throw new Error(`Unable to move row ${messageId} near ${targetTop}px from the top of the chat viewport.`);
}

async function expectMainChatHostPresent(page, expectedMessageCount) {
    const reactHost = page.locator('#chat > #emberdesk-react-main-chat-message-list-host');

    if (!reactMainChatMessageListEnabled) {
        await expect(reactHost).toHaveCount(0);
        return;
    }

    await expect(reactHost).toHaveCount(1);
    await expect(reactHost).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('#chat > .mes[mesid]')).toHaveCount(expectedMessageCount);
}

test.describe('main chat message list walkthrough', () => {
    test.describe.configure({ mode: 'serial' });

    test.beforeEach(async () => {
        expect(fs.existsSync(seededChatPath)).toBe(true);
        createLongChatFixture(seededChatPath, longChatPath);
        createReasoningChatFixture(seededChatPath, reasoningChatPath);
    });

    test('sprint 1 walkthrough reaches stored messages, message actions, and long-chat load more through visible UI', async ({ page }) => {
        const consoleErrors = createConsoleErrorCollector(page);
        const seededMessages = getChatMessages(seededChatPath);
        const longMessages = getChatMessages(longChatPath);
        const assistantMessageIndex = seededMessages.findIndex(message => !message.is_user && !message.is_system);

        expect(assistantMessageIndex).toBeGreaterThanOrEqual(0);

        await testSetup.awaitST({ page });
        await grantClipboardPermissions(page);
        await selectCharacterFromVisibleList(page, characterName);

        await openPastChatSearchThenClose(page, 'Session');
        await setChatTruncation(page, seededMessages.length);
        await openPastChat(page, seededChatName);

        await expect(page.locator('#chat > .mes[mesid]')).toHaveCount(seededMessages.length);
        await expectMainChatHostPresent(page, seededMessages.length);
        const assistantRow = page.locator(`#chat > .mes[mesid="${assistantMessageIndex}"]`);
        await expect(assistantRow.locator('.swipe_left')).toHaveCount(1);
        await expect(assistantRow.locator('.swipe_right')).toHaveCount(1);

        const actionRow = await openMessageActions(page, seededMessages.length - 1);
        await expect(actionRow.getByRole('button', { name: 'Edit' })).toBeVisible();
        await actionRow.getByRole('button', { name: 'Copy' }).click();
        await expectClipboardText(page, seededMessages.at(-1).mes);
        await page.locator('#send_textarea').click();
        await expect(actionRow.getByRole('button', { name: 'Copy' })).toBeHidden();

        await setChatTruncation(page, longChatLimit);
        await openPastChat(page, longChatName);
        await expect(page.locator('#show_more_messages')).toBeVisible();
        await expect(page.locator('#chat > .mes[mesid]')).toHaveCount(longChatLimit);
        await page.locator('#show_more_messages').evaluate(element => element.click());
        await expect(page.locator('#chat > .mes[mesid]')).toHaveCount(longChatLimit * 2);
        await expectMainChatHostPresent(page, longChatLimit * 2);
        await expect(page.locator('#jump_to_latest_message')).toHaveCount(0);
        await expect(page.locator(`#chat > .mes[mesid="${longMessages.length - 1}"] .mes_text`)).toContainText(longMessages.at(-1).mes);

        expect(getUnexpectedConsoleErrors(consoleErrors)).toEqual([]);
    });

    test('chat history search explains a zero-match result and lets the user recover', async ({ page }) => {
        const consoleErrors = createConsoleErrorCollector(page);

        await testSetup.awaitST({ page });
        await selectCharacterFromVisibleList(page, characterName);
        await openPastChatsPopup(page);

        const search = page.locator('#select_chat_search');
        const noMatches = page.locator('#select_chat_empty');
        await search.fill('walkthrough query with no matching chat');
        await expect(page.locator('#select_chat_div .select_chat_block')).toHaveCount(0);
        await expect(noMatches).toBeVisible();
        await expect(noMatches).toContainText('No chats match your search.');

        const clearSearchButton = noMatches.getByRole('button', { name: 'Clear search' });
        await expect(clearSearchButton).toHaveCSS('white-space', 'nowrap');
        await clearSearchButton.click();
        await expect(search).toHaveValue('');
        await expect(page.locator('#select_chat_div .select_chat_block').first()).toBeVisible();

        expect(getUnexpectedConsoleErrors(consoleErrors)).toEqual([]);
    });

    test('sprint 2 walkthrough reaches reasoning copy edit cancel and collapse-all through visible UI', async ({ page }) => {
        const consoleErrors = createConsoleErrorCollector(page);

        await testSetup.awaitST({ page });
        await grantClipboardPermissions(page);
        await setChatTruncation(page, 50);
        await selectCharacterFromVisibleList(page, characterName);
        await openPastChat(page, reasoningChatName);

        const firstReasoningRow = page.locator('#chat > .mes[mesid="1"]');
        const secondReasoningRow = page.locator('#chat > .mes[mesid="3"]');
        const firstReasoningDetails = firstReasoningRow.locator('.mes_reasoning_details');
        const secondReasoningDetails = secondReasoningRow.locator('.mes_reasoning_details');

        await expect(firstReasoningRow.locator('.mes_text')).toContainText('Visible answer after the first reasoning block.');
        await expect(secondReasoningRow.locator('.mes_text')).toContainText('Second visible answer with a separate reasoning block.');
        await expect(firstReasoningRow.locator('.mes_reasoning')).toHaveText(/First reasoning block\./);
        await expect(secondReasoningRow.locator('.mes_reasoning')).toHaveText(/Second reasoning block\./);
        await expect(firstReasoningRow.locator('.mes_block .mes_text')).toHaveCount(1);

        await firstReasoningRow.locator('.mes_reasoning_header').click();
        await expect(firstReasoningDetails).toHaveAttribute('open', '');
        await firstReasoningRow.locator('.mes_reasoning_copy').click();
        await expectClipboardText(page, 'First reasoning block.\nCheck the visible answer boundary before finalizing.');

        await firstReasoningRow.locator('.mes_reasoning_edit').click();
        const reasoningTextarea = firstReasoningRow.locator('.reasoning_edit_textarea');
        await expect(reasoningTextarea).toBeVisible();
        await expect(reasoningTextarea).toHaveValue(/First reasoning block\./);
        await reasoningTextarea.fill('Edited reasoning should disappear after cancel.');
        await firstReasoningRow.locator('.mes_reasoning_edit_cancel').click();
        await expect(reasoningTextarea).toHaveCount(0);
        await expect(firstReasoningRow.locator('.mes_reasoning')).toHaveText(/First reasoning block\./);

        await secondReasoningRow.locator('.mes_reasoning_header').click();
        await expect(secondReasoningDetails).toHaveAttribute('open', '');
        await secondReasoningRow.locator('.mes_reasoning_close_all').click();
        await expect(page.locator('.mes_reasoning_details[open]')).toHaveCount(0);

        expect(getUnexpectedConsoleErrors(consoleErrors)).toEqual([]);
    });

    test('sprint 3 walkthrough restores a reading position after a visible chat switch and keeps mobile load more reachable', async ({ page }) => {
        test.skip(!reactMainChatMessageListEnabled, 'scroll restore is only required behind the React main-chat flag');

        const consoleErrors = createConsoleErrorCollector(page);
        const longMessages = getChatMessages(longChatPath);
        const anchorMessageId = longMessages.length - longChatLimit - Math.ceil(longChatLimit / 2);

        await testSetup.awaitST({ page });
        await setChatTruncation(page, longChatLimit);
        await selectCharacterFromVisibleList(page, characterName);

        await openPastChat(page, longChatName);
        await expect(page.locator('#show_more_messages')).toBeVisible();
        await expect(page.locator('#show_more_messages')).toHaveAttribute('data-main-chat-load-more-owner', 'react');
        await page.locator('#show_more_messages').evaluate(element => element.click());
        await expect(page.locator('#chat > .mes[mesid]')).toHaveCount(longChatLimit * 2);

        const anchorTopBeforeSwitch = await wheelRowNearViewportTop(page, anchorMessageId);
        await openPastChat(page, alternateChatName);
        await expect(page.locator('#chat > .mes[mesid] .mes_text').first()).toBeVisible();

        await openPastChat(page, longChatName);
        await expect(page.locator('#chat > .mes[mesid]')).toHaveCount(longChatLimit * 2);
        await expect.poll(async () => {
            const anchorTopAfterSwitch = await getRelativeRowTop(page, anchorMessageId);
            if (anchorTopAfterSwitch === null) {
                return Number.POSITIVE_INFINITY;
            }

            return Math.abs(anchorTopAfterSwitch - anchorTopBeforeSwitch);
        }).toBeLessThanOrEqual(12);
        await expect(page.locator('#jump_to_latest_message')).toHaveCount(0);

        for (const viewport of mobileViewports) {
            await page.setViewportSize({ width: viewport.width, height: viewport.height });
            await openPastChat(page, alternateChatName);
            await openPastChat(page, longChatName);

            const composer = page.getByRole('textbox', { name: 'Chat message' });
            await expect(composer, `${viewport.name} composer`).toBeVisible();
            await expect.poll(async () => {
                return page.locator('#chat > .mes[mesid]').count();
            }, {
                message: `${viewport.name} restored expanded history window`,
            }).toBeGreaterThanOrEqual(longChatLimit * 2);
            const renderedMessageCountBeforeLoadMore = await page.locator('#chat > .mes[mesid]').count();
            await expect(page.locator('#show_more_messages'), `${viewport.name} load more`).toBeVisible();
            await expect(page.locator('#show_more_messages'), `${viewport.name} react load-more owner`).toHaveAttribute('data-main-chat-load-more-owner', 'react');
            // Element-owned click avoids mobile drawer/composer intercept on the hit-target.
            await page.locator('#show_more_messages').evaluate(element => element.click());
            const expectedRenderedMessageCount = Math.min(renderedMessageCountBeforeLoadMore + longChatLimit, longMessages.length);
            await expect(page.locator('#chat > .mes[mesid]'), `${viewport.name} rendered messages`).toHaveCount(expectedRenderedMessageCount);
            await expectMainChatHostPresent(page, expectedRenderedMessageCount);
            await expect(page.locator('#jump_to_latest_message'), `${viewport.name} jump to latest removed`).toHaveCount(0);

            const loadMoreGeometry = await page.evaluate(() => {
                const loadMore = document.querySelector('#show_more_messages');
                const composerForm = document.querySelector('#send_form');

                if (!(loadMore instanceof HTMLElement) || !(composerForm instanceof HTMLElement)) {
                    return null;
                }

                const loadMoreRect = loadMore.getBoundingClientRect();
                const formRect = composerForm.getBoundingClientRect();
                const overlapsComposer = loadMoreRect.left < formRect.right
                    && loadMoreRect.right > formRect.left
                    && loadMoreRect.top < formRect.bottom
                    && loadMoreRect.bottom > formRect.top;

                return {
                    bodyScrollWidth: document.documentElement.scrollWidth,
                    viewportWidth: window.innerWidth,
                    overlapsComposer,
                    loadMoreHeight: loadMoreRect.height,
                };
            });

            expect(loadMoreGeometry, viewport.name).not.toBeNull();
            expect(loadMoreGeometry.bodyScrollWidth, `${viewport.name} horizontal overflow`).toBeLessThanOrEqual(loadMoreGeometry.viewportWidth + 1);
            expect(loadMoreGeometry.overlapsComposer, `${viewport.name} overlaps composer`).toBe(false);
            expect(loadMoreGeometry.loadMoreHeight, `${viewport.name} load more height`).toBeGreaterThanOrEqual(32);
        }

        expect(getUnexpectedConsoleErrors(consoleErrors)).toEqual([]);
    });
});
