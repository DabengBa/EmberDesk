import { expect, test } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';

test('real chat load, consecutive saves and branch creation use the conditional protocol', async ({ page }) => {
    await testSetup.awaitST({ page });
    const result = await page.evaluate(async () => {
        const context = window.SillyTavern.getContext();
        const index = context.characters.findIndex(character => character?.name === 'Dev Character 001');
        if (index < 0) throw new Error('Seed character unavailable');
        await context.selectCharacterById(index);
        await context.openCharacterChat('Dev Character 001 Session 01');
        const script = await import('/script.js');
        const branch = await import('/scripts/chat-branch.js');
        const ops = await import('/scripts/chat-ops-service.js');
        const first = await script.saveChat();
        const second = await script.saveChat();
        const name = await branch.createBranch(0);
        const renamed = await ops.renameCharacterChat({ characterId: index, oldFileName: 'Dev Character 001 Session 01', newFileName: 'Protocol renamed', loader: false });
        return { first, second, name, renamed, count: context.chat.length };
    });
    expect(result.first).toBe(true);
    expect(result.second).toBe(true);
    expect(result.count).toBeGreaterThan(0);
    expect(result.name).toBeTruthy();
    expect(result.renamed).toBe(true);
});
