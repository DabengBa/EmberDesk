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
const longChatName = 'Dev Character 001 Long Rendering Proof';
const mobileLongChatName = 'Dev Character 001 Mobile Long Rendering Proof';
const reactMainChatMessageListEnabled = process.env.EMBERDESK_FEATURES_REACT_PANELS_MAINCHATMESSAGELIST === 'true';
const seededChatPath = path.join(userRoot, 'chats', chatFolder, `${seededChatName}.jsonl`);
const longChatPath = path.join(userRoot, 'chats', chatFolder, `${longChatName}.jsonl`);
const mobileLongChatPath = path.join(userRoot, 'chats', chatFolder, `${mobileLongChatName}.jsonl`);
const longChatLimit = 25;
const mobileViewports = [
    { name: 'narrow phone', width: 390, height: 844 },
    { name: 'wide mobile', width: 768, height: 1024 },
];

function normalizeMessageText(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

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
            mes: `Long rendering proof message ${String(index + 1).padStart(3, '0')} from ${isUser ? 'user' : characterName}.`,
            send_date: new Date(startedAt + index * 30000).toISOString(),
        }));
    }

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

async function selectCharacterByName(page, name) {
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
    await page.waitForFunction((characterNameToSelect) => {
        const context = window.SillyTavern.getContext();
        const character = context.characters[context.characterId];
        return character?.name === characterNameToSelect;
    }, name);
}

async function openChatAndMeasureFirstMessage(page, chatName) {
    const startedAt = await page.evaluate(() => performance.now());

    await page.evaluate(async (chatToOpen) => {
        const context = window.SillyTavern.getContext();
        await context.openCharacterChat(chatToOpen);
    }, chatName);

    await page.waitForFunction(() => {
        return Array.from(document.querySelectorAll('#chat > .mes[mesid] .mes_text'))
            .some(element => element.textContent.trim().length > 0);
    }, undefined, { timeout: 30_000 });

    return page.evaluate(start => performance.now() - start, startedAt);
}

async function expectMessageTextMatches(page, messageIndex, expectedText) {
    const messageRow = page.locator(`#chat > .mes[mesid="${messageIndex}"]`);
    const messageText = messageRow.locator('.mes_text');

    await expect(messageRow).toBeVisible();
    await expect(messageText).toBeVisible();

    const renderedText = await messageText.textContent();
    expect(normalizeMessageText(renderedText)).toBe(normalizeMessageText(expectedText));
}

async function expectMainChatMessageListHostState(page, expectedMessageCount) {
    const reactHost = page.locator('#chat > #emberdesk-react-main-chat-message-list-host');

    if (!reactMainChatMessageListEnabled) {
        await expect(reactHost).toHaveCount(0);
        return;
    }

    await expect(reactHost).toHaveCount(1);
    await expect(reactHost).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('#chat > [data-react-workspace-panel="mainChatMessageList"]')).toHaveCount(0);
    await expect(page.locator('#chat > .mes[mesid]')).toHaveCount(expectedMessageCount);
}

async function expectReactMessageActionState(page, messageId, expectations = {}) {
    if (!reactMainChatMessageListEnabled) {
        await expect(page.locator(`[data-main-chat-message-actions-row="${messageId}"]`)).toHaveCount(0);
        return;
    }

    const actionOwner = page.locator(`[data-main-chat-message-actions-row="${messageId}"]`);
    const ownerCount = await actionOwner.count();
    if (ownerCount !== 1) {
        const debugState = await page.evaluate((targetMessageId) => {
            const host = document.getElementById('emberdesk-react-main-chat-message-list-host');
            const controller = document.querySelector('[data-main-chat-message-list-controller="true"]');
            const row = document.querySelector(`#chat > .mes[mesid="${targetMessageId}"]`);
            const messageButtons = row?.querySelector('.mes_buttons');

            return {
                featureEnabled: Boolean(window.__emberDeskWorkspaceFeatures?.reactPanels?.mainChatMessageList),
                hostPresent: Boolean(host),
                hostChildElementCount: host?.childElementCount ?? 0,
                controllerDataset: controller instanceof HTMLElement ? { ...controller.dataset } : null,
                rowPresent: Boolean(row),
                messageButtonsPresent: Boolean(messageButtons),
                hintPresent: Boolean(messageButtons?.querySelector('.extraMesButtonsHint')),
                extraActionsPresent: Boolean(messageButtons?.querySelector('.extraMesButtons')),
                ownerCount: document.querySelectorAll(`[data-main-chat-message-actions-row="${targetMessageId}"]`).length,
            };
        }, String(messageId));

        throw new Error(`Missing action owner for row ${messageId}: ${JSON.stringify(debugState)}`);
    }

    await expect(actionOwner).toHaveAttribute('data-main-chat-message-actions-owner', 'react');
    if (expectations.expanded !== undefined) {
        await expect(actionOwner).toHaveAttribute('data-main-chat-message-actions-expanded', expectations.expanded ? 'true' : 'false');
    }

    const attributeExpectations = [
        ['data-main-chat-message-actions-available', expectations.availableIncludes ?? []],
        ['data-main-chat-message-actions-high-frequency', expectations.highFrequencyIncludes ?? []],
        ['data-main-chat-message-actions-secondary', expectations.secondaryIncludes ?? []],
        ['data-main-chat-message-actions-danger', expectations.dangerIncludes ?? []],
    ];

    for (const [attributeName, expectedValues] of attributeExpectations) {
        if (!expectedValues.length) {
            continue;
        }

        const actualValue = await actionOwner.getAttribute(attributeName);
        expect(actualValue).not.toBeNull();
        for (const expectedValue of expectedValues) {
            expect(actualValue).toContain(expectedValue);
        }
    }

    const childOrder = await page.evaluate((targetMessageId) => {
        const messageButtons = document.querySelector(`#chat > .mes[mesid="${targetMessageId}"] .mes_buttons`);
        if (!(messageButtons instanceof HTMLElement)) {
            return null;
        }

        return Array.from(messageButtons.children).map((child) => {
            if (!(child instanceof HTMLElement)) {
                return '';
            }

            if (child.dataset.mainChatMessageActionsOwner === 'react') {
                return 'react-owner';
            }

            return child.className;
        });
    }, String(messageId));

    expect(childOrder).not.toBeNull();
    const hintIndex = childOrder.findIndex(value => value.split(/\s+/).includes('extraMesButtonsHint'));
    const extraActionsIndex = childOrder.findIndex(value => value.split(/\s+/).includes('extraMesButtons'));
    const ownerIndex = childOrder.findIndex(value => value === 'react-owner');

    expect(hintIndex).toBeGreaterThanOrEqual(0);
    expect(extraActionsIndex).toBeGreaterThan(hintIndex);
    expect(ownerIndex).toBeGreaterThan(extraActionsIndex);
}

async function expectReactRichBodyState(page, messageId) {
    if (!reactMainChatMessageListEnabled) {
        await expect(page.locator(`[data-main-chat-rich-body-row="${messageId}"]`)).toHaveCount(0);
        return;
    }

    const richBodyOwner = page.locator(`[data-main-chat-rich-body-row="${messageId}"]`);
    const ownerCount = await richBodyOwner.count();
    if (ownerCount !== 1) {
        const debugState = await page.evaluate((targetMessageId) => {
            const host = document.getElementById('emberdesk-react-main-chat-message-list-host');
            const controller = document.querySelector('[data-main-chat-message-list-controller="true"]');
            const row = document.querySelector(`#chat > .mes[mesid="${targetMessageId}"]`);

            return {
                featureEnabled: Boolean(window.__emberDeskWorkspaceFeatures?.reactPanels?.mainChatMessageList),
                hostPresent: Boolean(host),
                hostChildElementCount: host?.childElementCount ?? 0,
                controllerDataset: controller instanceof HTMLElement ? { ...controller.dataset } : null,
                rowPresent: Boolean(row),
                rowBlockPresent: Boolean(row?.querySelector('.mes_block')),
                ownerCount: document.querySelectorAll(`[data-main-chat-rich-body-row="${targetMessageId}"]`).length,
            };
        }, String(messageId));

        throw new Error(`Missing rich body owner for row ${messageId}: ${JSON.stringify(debugState)}`);
    }

    await expect(richBodyOwner).toHaveAttribute('data-main-chat-rich-body-owner', 'react');
}

async function openCharacterChatWithTruncation(page, chatName, truncationLimit) {
    await page.evaluate(async ({ nextChatName, nextTruncationLimit }) => {
        const context = window.SillyTavern.getContext();
        context.powerUserSettings.chat_truncation = nextTruncationLimit;
        await context.openCharacterChat(nextChatName);
    }, { nextChatName: chatName, nextTruncationLimit: truncationLimit });
}

async function positionMessageRowNearViewportTop(page, messageId, topOffset = 120) {
    return page.evaluate(async ({ targetMessageId, viewportTopOffset }) => {
        const chatContainer = document.getElementById('chat');
        const anchorRow = document.querySelector(`#chat > .mes[mesid="${targetMessageId}"]`);
        if (!(chatContainer instanceof HTMLElement) || !(anchorRow instanceof HTMLElement)) {
            throw new Error(`Unable to position anchor row ${targetMessageId}`);
        }

        chatContainer.scrollTop = Math.max(anchorRow.offsetTop - viewportTopOffset, 0);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return anchorRow.getBoundingClientRect().top;
    }, { targetMessageId: String(messageId), viewportTopOffset: topOffset });
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

test.describe('chat message rendering', () => {
    // These flows mutate the same seeded character/chat files.
    test.describe.configure({ mode: 'serial' });

    test('renders seeded stored chat messages through the real app DOM', async ({ page }, testInfo) => {
        expect(fs.existsSync(seededChatPath)).toBe(true);
        createLongChatFixture(seededChatPath, longChatPath);

        const seededMessages = getChatMessages(seededChatPath);
        const userMessageIndex = seededMessages.findIndex(message => message.is_user);
        const characterMessageIndex = seededMessages.findIndex(message => !message.is_user && !message.is_system);

        expect(userMessageIndex).toBeGreaterThanOrEqual(0);
        expect(characterMessageIndex).toBeGreaterThanOrEqual(0);

        const consoleErrors = createConsoleErrorCollector(page);

        await testSetup.awaitST({ page });
        await selectCharacterByName(page, characterName);
        await page.evaluate((truncationLimit) => {
            const context = window.SillyTavern.getContext();
            context.powerUserSettings.chat_truncation = truncationLimit;
        }, seededMessages.length);

        const firstMessageVisibleMs = await openChatAndMeasureFirstMessage(page, seededChatName);
        testInfo.annotations.push({
            type: 'first-message-visible-ms',
            description: firstMessageVisibleMs.toFixed(1),
        });
        if (firstMessageVisibleMs > 1000) {
            testInfo.annotations.push({
                type: 'warning',
                description: `First stored chat message became visible after ${firstMessageVisibleMs.toFixed(1)}ms.`,
            });
        }

        const renderedMessages = page.locator('#chat > .mes[mesid]');
        await expect(renderedMessages).toHaveCount(seededMessages.length);
        await expectMainChatMessageListHostState(page, seededMessages.length);
        await expect(renderedMessages.first().locator('.mes_text')).toBeVisible();
        await expect(page.locator('#chat > .mes.last_mes')).toHaveCount(1);
        await expect(renderedMessages.last()).toHaveClass(/last_mes/);

        await expect(page.locator('#chat > .mes[is_user="true"][mesid]').first()).toBeVisible();
        await expect(page.locator('#chat > .mes[is_user="false"][is_system="false"][mesid]').first()).toBeVisible();
        await expectMessageTextMatches(page, userMessageIndex, seededMessages[userMessageIndex].mes);
        await expectMessageTextMatches(page, characterMessageIndex, seededMessages[characterMessageIndex].mes);

        const sampleRow = page.locator(`#chat > .mes[mesid="${characterMessageIndex}"]`);
        await expect(sampleRow).toHaveAttribute('is_user', 'false');
        await expect(sampleRow).toHaveAttribute('is_system', 'false');
        await expect(sampleRow.locator('.mes_block')).toHaveCount(1);
        await expect(sampleRow.locator('.mes_buttons')).toHaveCount(1);
        await expect(sampleRow.locator('.mes_reasoning_details')).toHaveCount(1);
        await expect(sampleRow.locator('.mes_reasoning')).toHaveCount(1);
        await expect(sampleRow.locator('.mes_media_wrapper')).toHaveCount(1);
        await expect(sampleRow.locator('.mes_file_wrapper')).toHaveCount(1);
        await expectReactRichBodyState(page, characterMessageIndex);
        await expect(sampleRow.locator('.swipe_left')).toHaveCount(1);
        await expect(sampleRow.locator('.swipe_right')).toHaveCount(1);

        const textAlign = await sampleRow.locator('.mes_text').evaluate(element => getComputedStyle(element).textAlign);
        expect(textAlign).not.toBe('center');

        const messageTextParentId = await sampleRow.locator('.mes_block .mes_text').evaluate(element => {
            return element.closest('.mes')?.getAttribute('mesid');
        });
        expect(messageTextParentId).toBe(String(characterMessageIndex));

        const actionRow = renderedMessages.last();
        await actionRow.hover();
        const messageActionsButton = actionRow.getByRole('button', { name: 'Message Actions' });
        await expect(messageActionsButton).toBeVisible();
        await expect(actionRow.getByRole('button', { name: 'Edit' })).toBeVisible();
        await messageActionsButton.focus();
        await expect(messageActionsButton).toBeFocused();
        const actionButtonBox = await messageActionsButton.boundingBox();
        expect(actionButtonBox?.width ?? 0).toBeGreaterThanOrEqual(16);
        expect(actionButtonBox?.height ?? 0).toBeGreaterThanOrEqual(16);
        const messageTextBox = await actionRow.locator('.mes_text').boundingBox();
        expect(actionButtonBox).not.toBeNull();
        expect(messageTextBox).not.toBeNull();
        const overlapsMessageText = actionButtonBox.x < messageTextBox.x + messageTextBox.width
            && actionButtonBox.x + actionButtonBox.width > messageTextBox.x
            && actionButtonBox.y < messageTextBox.y + messageTextBox.height
            && actionButtonBox.y + actionButtonBox.height > messageTextBox.y;
        expect(overlapsMessageText).toBe(false);
        await messageActionsButton.click();
        await expect(actionRow.getByRole('button', { name: 'Copy' })).toBeVisible();

        const longMessages = getChatMessages(longChatPath);
        await page.evaluate(async ({ chatName, truncationLimit }) => {
            const context = window.SillyTavern.getContext();
            context.powerUserSettings.chat_truncation = truncationLimit;
            await context.openCharacterChat(chatName);
        }, { chatName: longChatName, truncationLimit: longChatLimit });

        await expect(page.locator('#show_more_messages')).toBeVisible();
        await expect(page.locator('#chat > .mes[mesid]')).toHaveCount(longChatLimit);
        await expectMainChatMessageListHostState(page, longChatLimit);
        await expectReactRichBodyState(page, longMessages.length - 1);

        const firstRenderedLongMessageId = await page.locator('#chat > .mes[mesid]').first().getAttribute('mesid');
        expect(Number(firstRenderedLongMessageId)).toBe(longMessages.length - longChatLimit);

        const firstRenderedLongMessageIndex = Number(firstRenderedLongMessageId);
        await expectMessageTextMatches(page, firstRenderedLongMessageIndex, longMessages[firstRenderedLongMessageIndex].mes);
        await expectMessageTextMatches(page, longMessages.length - 1, longMessages.at(-1).mes);

        const anchorRow = page.locator(`#chat > .mes[mesid="${firstRenderedLongMessageIndex}"]`);
        await anchorRow.scrollIntoViewIfNeeded();
        const anchorTopBeforeLoadMore = await anchorRow.evaluate(element => element.getBoundingClientRect().top);
        const expectedFirstLoadedMessageIndex = longMessages.length - (longChatLimit * 2);

        await page.locator('#show_more_messages').click();
        await expect(page.locator('#chat > .mes[mesid]')).toHaveCount(longChatLimit * 2);
        await expectMainChatMessageListHostState(page, longChatLimit * 2);
        await expectReactRichBodyState(page, expectedFirstLoadedMessageIndex);
        await expect(page.locator('#jump_to_latest_message')).toHaveCount(0);

        const loadedMessageIds = await page.locator('#chat > .mes[mesid]').evaluateAll(elements => {
            return elements.map(element => Number(element.getAttribute('mesid')));
        });
        expect(loadedMessageIds[0]).toBe(expectedFirstLoadedMessageIndex);
        expect(loadedMessageIds.at(-1)).toBe(longMessages.length - 1);
        expect(loadedMessageIds).toContain(firstRenderedLongMessageIndex);

        await expect(page.locator('#show_more_messages')).toBeVisible();
        await expectMessageTextMatches(page, expectedFirstLoadedMessageIndex, longMessages[expectedFirstLoadedMessageIndex].mes);
        await expectMessageTextMatches(page, firstRenderedLongMessageIndex, longMessages[firstRenderedLongMessageIndex].mes);

        const anchorTopAfterLoadMore = await anchorRow.evaluate(element => element.getBoundingClientRect().top);
        expect(Math.abs(anchorTopAfterLoadMore - anchorTopBeforeLoadMore)).toBeLessThanOrEqual(8);

        const latestLongMessageRow = page.locator(`#chat > .mes[mesid="${longMessages.length - 1}"]`);
        await expect(latestLongMessageRow).toHaveCount(1);
        await latestLongMessageRow.scrollIntoViewIfNeeded();
        await expect(latestLongMessageRow).toBeVisible();
        await expectMessageTextMatches(page, longMessages.length - 1, longMessages.at(-1).mes);
        await expect(page.locator('#chat > .mes[mesid]')).toHaveCount(longChatLimit * 2);

        await openCharacterChatWithTruncation(page, seededChatName, seededMessages.length);
        await expect(page.locator('#chat > .mes[mesid]')).toHaveCount(seededMessages.length);
        expect(getUnexpectedConsoleErrors(consoleErrors)).toEqual([]);
    });

    test('keeps legacy message actions visible and only adds hidden React owners when the bridge is enabled', async ({ page }) => {
        expect(fs.existsSync(seededChatPath)).toBe(true);

        const seededMessages = getChatMessages(seededChatPath);
        const assistantMessageIndex = seededMessages.findIndex(message => !message.is_user && !message.is_system);

        expect(assistantMessageIndex).toBeGreaterThanOrEqual(0);

        const consoleErrors = createConsoleErrorCollector(page);

        await testSetup.awaitST({ page });
        await grantClipboardPermissions(page);
        await selectCharacterByName(page, characterName);
        await page.evaluate(({ truncationLimit }) => {
            const context = window.SillyTavern.getContext();
            context.powerUserSettings.chat_truncation = truncationLimit;
            context.powerUserSettings.confirm_message_delete = true;
        }, { truncationLimit: seededMessages.length });

        await openChatAndMeasureFirstMessage(page, seededChatName);

        const assistantRow = page.locator(`#chat > .mes[mesid="${assistantMessageIndex}"]`);
        await expect(assistantRow).toBeVisible();
        await expectReactMessageActionState(page, assistantMessageIndex, {
            expanded: false,
            availableIncludes: ['extraMesButtonsHint', 'mes_copy', 'mes_edit', 'mes_edit_delete'],
            highFrequencyIncludes: ['extraMesButtonsHint', 'mes_copy', 'mes_edit'],
            secondaryIncludes: ['mes_bookmark'],
            dangerIncludes: ['mes_edit_delete'],
        });

        await assistantRow.hover();
        const messageActionsButton = assistantRow.getByRole('button', { name: 'Message Actions' });
        await expect(messageActionsButton).toBeVisible();
        await messageActionsButton.click();
        await expectReactMessageActionState(page, assistantMessageIndex, {
            expanded: true,
            availableIncludes: ['extraMesButtonsHint', 'mes_copy', 'mes_edit', 'mes_edit_delete'],
            highFrequencyIncludes: ['extraMesButtonsHint', 'mes_copy', 'mes_edit'],
            secondaryIncludes: ['mes_bookmark'],
            dangerIncludes: ['mes_edit_delete'],
        });

        const copyButton = assistantRow.getByRole('button', { name: 'Copy' });
        await expect(copyButton).toBeVisible();
        await copyButton.click();
        await expectClipboardText(page, seededMessages[assistantMessageIndex].mes);

        const editButton = assistantRow.getByRole('button', { name: 'Edit' });
        await expect(editButton).toBeVisible();
        await editButton.click();

        const editTextarea = assistantRow.locator('.edit_textarea');
        await expect(editTextarea).toBeVisible();
        await expect(editTextarea).toHaveValue(seededMessages[assistantMessageIndex].mes);

        const renderedMessageCount = await page.locator('#chat > .mes[mesid]').count();
        await assistantRow.getByRole('button', { name: 'Delete this message' }).click();
        const deleteDialog = page.getByRole('dialog').filter({ hasText: 'Are you sure you want to delete this message?' });
        await expect(deleteDialog).toBeVisible();
        await expect(deleteDialog.getByRole('button', { name: 'Delete Message' })).toBeVisible();
        await expect(page.locator('#chat > .mes[mesid]')).toHaveCount(renderedMessageCount);
        await deleteDialog.getByRole('button', { name: 'Cancel' }).click();
        await expect(deleteDialog).toHaveCount(0);

        await assistantRow.locator('.mes_edit_cancel').click();
        await expect(editTextarea).toHaveCount(0);
        await expect(assistantRow.locator('.mes_text')).toContainText(seededMessages[assistantMessageIndex].mes);
        expect(getUnexpectedConsoleErrors(consoleErrors)).toEqual([]);
    });

    test('restores per-chat reading position when switching back to a long chat', async ({ page }) => {
        test.skip(!reactMainChatMessageListEnabled, 'scroll restore is only required behind the React main-chat flag');

        expect(fs.existsSync(seededChatPath)).toBe(true);
        createLongChatFixture(seededChatPath, longChatPath);

        const seededMessages = getChatMessages(seededChatPath);
        const longMessages = getChatMessages(longChatPath);
        const consoleErrors = createConsoleErrorCollector(page);
        const seededVisibleMessageCount = Math.min(seededMessages.length, longChatLimit);

        await testSetup.awaitST({ page });
        await selectCharacterByName(page, characterName);
        await openCharacterChatWithTruncation(page, seededChatName, longChatLimit);
        await expect(page.locator('#chat > .mes[mesid]')).toHaveCount(seededVisibleMessageCount);
        await openCharacterChatWithTruncation(page, longChatName, longChatLimit);

        await expect(page.locator('#chat > .mes[mesid]')).toHaveCount(longChatLimit);
        await expectMainChatMessageListHostState(page, longChatLimit);

        const anchorMessageId = longMessages.length - Math.ceil(longChatLimit / 2);
        const anchorRow = page.locator(`#chat > .mes[mesid="${anchorMessageId}"]`);
        const anchorTopBeforeSwitch = await positionMessageRowNearViewportTop(page, anchorMessageId);

        await openCharacterChatWithTruncation(page, seededChatName, longChatLimit);
        await expect(page.locator('#chat > .mes[mesid]')).toHaveCount(seededVisibleMessageCount);

        await openCharacterChatWithTruncation(page, longChatName, longChatLimit);
        await expect(page.locator(`#chat > .mes[mesid="${anchorMessageId}"]`)).toBeVisible();

        const anchorTopAfterSwitch = await anchorRow.evaluate(async (element) => {
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            return element.getBoundingClientRect().top;
        });

        expect(Math.abs(anchorTopAfterSwitch - anchorTopBeforeSwitch)).toBeLessThanOrEqual(12);
        await expect(page.locator('#jump_to_latest_message')).toHaveCount(0);
        expect(getUnexpectedConsoleErrors(consoleErrors)).toEqual([]);
    });

    test('keeps long-chat load-more reachable on mobile viewports', async ({ page }) => {
        expect(fs.existsSync(seededChatPath)).toBe(true);
        createLongChatFixture(seededChatPath, mobileLongChatPath);
        const longMessages = getChatMessages(mobileLongChatPath);

        const consoleErrors = createConsoleErrorCollector(page);
        await testSetup.awaitST({ page });
        await selectCharacterByName(page, characterName);

        for (const viewport of mobileViewports) {
            await page.setViewportSize({ width: viewport.width, height: viewport.height });
            await page.evaluate(async ({ chatName, truncationLimit }) => {
                const context = window.SillyTavern.getContext();
                context.powerUserSettings.chat_truncation = truncationLimit;
                await context.openCharacterChat(chatName);
            }, { chatName: mobileLongChatName, truncationLimit: longChatLimit });

            const composer = page.getByRole('textbox', { name: 'Chat message' });
            await expect(composer, `${viewport.name} composer`).toBeVisible();
            await composer.focus();
            await expect(composer, `${viewport.name} composer focus`).toBeFocused();
            await expect(page.locator('#show_more_messages'), `${viewport.name} load more`).toBeVisible();

            await page.locator('#show_more_messages').click();
            await expect(page.locator('#chat > .mes[mesid]'), `${viewport.name} rendered messages`).toHaveCount(longChatLimit * 2);
            await expectMainChatMessageListHostState(page, longChatLimit * 2);
            await expect(page.locator('#jump_to_latest_message'), `${viewport.name} jump to latest removed`).toHaveCount(0);
            await expect(page.locator('#show_more_messages'), `${viewport.name} load more remains`).toBeVisible();

            const loadMoreGeometry = await page.evaluate(() => {
                const loadMore = document.querySelector('#show_more_messages');
                const composerForm = document.querySelector('#send_form');

                if (!loadMore || !composerForm) {
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
            expect(loadMoreGeometry.bodyScrollWidth).toBeLessThanOrEqual(loadMoreGeometry.viewportWidth + 1);
            expect(loadMoreGeometry.overlapsComposer).toBe(false);
            expect(loadMoreGeometry.loadMoreHeight).toBeGreaterThanOrEqual(32);

            const latestLongMessageRow = page.locator(`#chat > .mes[mesid="${longMessages.length - 1}"]`);
            await latestLongMessageRow.scrollIntoViewIfNeeded();
            await expect(latestLongMessageRow, `${viewport.name} latest row`).toBeVisible();
            await expectMessageTextMatches(page, longMessages.length - 1, longMessages.at(-1).mes);
            const messageActions = latestLongMessageRow.getByRole('button', { name: 'Message Actions' });
            await expect(messageActions, `${viewport.name} message actions`).toBeVisible();
            const actionButtonBox = await messageActions.boundingBox();
            const messageTextBox = await latestLongMessageRow.locator('.mes_text').boundingBox();
            expect(actionButtonBox, `${viewport.name} action button box`).not.toBeNull();
            expect(messageTextBox, `${viewport.name} message text box`).not.toBeNull();
            const overlapsMessageText = actionButtonBox.x < messageTextBox.x + messageTextBox.width
                && actionButtonBox.x + actionButtonBox.width > messageTextBox.x
                && actionButtonBox.y < messageTextBox.y + messageTextBox.height
                && actionButtonBox.y + actionButtonBox.height > messageTextBox.y;
            expect(overlapsMessageText, `${viewport.name} action overlap`).toBe(false);
            await messageActions.click();
            await expect(latestLongMessageRow.getByRole('button', { name: 'Copy' }), `${viewport.name} copy action`).toBeVisible();
        }

        expect(getUnexpectedConsoleErrors(consoleErrors)).toEqual([]);
    });
});
