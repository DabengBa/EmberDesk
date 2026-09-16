import { expect, test } from '@playwright/test';

import { testSetup } from './frontend/frontent-test-utils.js';

/**
 * Runtime proof for the retired group-chat context surface.
 * The seeded environment still contains historical `groups/` and `group chats/`
 * files on disk, so an empty runtime surface is a behavioral guarantee, not an
 * artifact of missing data.
 */
test.describe('retired group-chat context runtime', () => {
    test('SillyTavern.getContext() exposes character-only state and 410 rejecting group stubs', async ({ page }) => {
        test.setTimeout(180_000);

        await testSetup.awaitST({ page });

        const retiredShape = await page.evaluate(async () => {
            const context = globalThis.SillyTavern?.getContext?.();
            const settle = async (fn) => {
                try {
                    const value = await fn();
                    return { rejected: false, value };
                } catch (error) {
                    return {
                        rejected: true,
                        name: error?.name,
                        message: error?.message,
                        code: error?.code,
                        error: error?.error,
                        status: error?.status,
                    };
                }
            };

            return {
                groups: context?.groups,
                groupId: context?.groupId,
                openGroupChat: await settle(() => context.openGroupChat('group-id', 'chat-id')),
                unshallowGroupMembers: await settle(() => context.unshallowGroupMembers()),
            };
        });

        expect(retiredShape.groups).toEqual([]);
        expect(retiredShape.groupId).toBeNull();
        for (const operation of [retiredShape.openGroupChat, retiredShape.unshallowGroupMembers]) {
            expect(operation).toMatchObject({
                rejected: true,
                message: 'Group chat functionality has been removed from EmberDesk.',
                code: 'group_chat_feature_removed',
                error: 'group_chat_feature_removed',
                status: 410,
            });
        }

        const characterId = await page.evaluate(async () => {
            const context = globalThis.SillyTavern?.getContext?.();
            const id = Array.isArray(context?.characters)
                ? context.characters.findIndex(character => character?.name === 'Dev Character 001')
                : -1;
            if (id >= 0 && typeof context.selectCharacterById === 'function') {
                await context.selectCharacterById(id);
            }
            return id;
        });
        expect(characterId).toBeGreaterThanOrEqual(0);
        await page.locator('#chat > .mes[mesid]').first().waitFor({ state: 'attached', timeout: 15_000 }).catch(() => undefined);

        const characterChatState = await page.evaluate((id) => {
            const context = globalThis.SillyTavern?.getContext?.();
            return {
                groups: context?.groups,
                groupId: context?.groupId,
                characterId: context?.characterId,
                name2: context?.name2,
                chatId: context?.chatId,
                expectedChatId: context?.characters?.[id]?.chat,
                chatIsArray: Array.isArray(context?.chat),
                chatLength: context?.chat?.length ?? -1,
            };
        }, characterId);

        expect(characterChatState.groups).toEqual([]);
        expect(characterChatState.groupId).toBeNull();
        expect(characterChatState.characterId).toBe(String(characterId));
        expect(characterChatState.name2).toBe('Dev Character 001');
        expect(characterChatState.chatId).toBe(characterChatState.expectedChatId);
        expect(typeof characterChatState.chatId).toBe('string');
        expect(characterChatState.chatId.length).toBeGreaterThan(0);
        expect(characterChatState.chatIsArray).toBe(true);
        expect(characterChatState.chatLength).toBeGreaterThan(0);
    });
});
