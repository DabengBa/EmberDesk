import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect } from '@playwright/test';

import { testSetup } from './frontend/frontent-test-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const dataRoot = path.resolve(repoRoot, process.env.PLAYWRIGHT_DATA_ROOT ?? '.tmp/playwright-e2e-data');
const userHandle = process.env.PLAYWRIGHT_USER ?? 'playwright-e2e';
const userRoot = path.join(dataRoot, userHandle);
const characterName = 'Dev Character 001';
const chatFolder = 'dev-character-001';
const seededChatName = 'Dev Character 001 Session 01';
const longChatName = 'Dev Character 001 Long Rendering Proof';
const seededChatPath = path.join(userRoot, 'chats', chatFolder, `${seededChatName}.jsonl`);
const longChatPath = path.join(userRoot, 'chats', chatFolder, `${longChatName}.jsonl`);
const longChatLimit = 25;

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

test.describe('chat message rendering', () => {
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

        const firstRenderedLongMessageId = await page.locator('#chat > .mes[mesid]').first().getAttribute('mesid');
        expect(Number(firstRenderedLongMessageId)).toBe(longMessages.length - longChatLimit);

        const firstRenderedLongMessageIndex = Number(firstRenderedLongMessageId);
        await expectMessageTextMatches(page, firstRenderedLongMessageIndex, longMessages[firstRenderedLongMessageIndex].mes);
        await expectMessageTextMatches(page, longMessages.length - 1, longMessages.at(-1).mes);

        const anchorRow = page.locator(`#chat > .mes[mesid="${firstRenderedLongMessageIndex}"]`);
        await anchorRow.scrollIntoViewIfNeeded();
        const anchorTopBeforeLoadMore = await anchorRow.evaluate(element => element.getBoundingClientRect().top);

        await page.locator('#show_more_messages').click();
        await expect(page.locator('#chat > .mes[mesid]')).toHaveCount(longChatLimit * 2);

        const expectedFirstLoadedMessageIndex = longMessages.length - (longChatLimit * 2);
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
        await latestLongMessageRow.scrollIntoViewIfNeeded();
        await expect(latestLongMessageRow).toBeVisible();
        await expectMessageTextMatches(page, longMessages.length - 1, longMessages.at(-1).mes);
        expect(getUnexpectedConsoleErrors(consoleErrors)).toEqual([]);
    });
});
