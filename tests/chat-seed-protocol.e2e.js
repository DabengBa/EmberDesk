import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';

test('chat seeding creates, updates, and does not overwrite a concurrent save', async ({ page }) => {
    await testSetup.awaitST({ page });
    const fileName = `protocol-seed-${randomUUID()}`;
    const seed = message => testSetup.saveCharacterChat({
        page, characterName: 'Dev Character 001', avatarUrl: 'dev-character-001.png', fileName,
        chat: [{ chat_metadata: {} }, { name: 'User', is_user: true, mes: message }],
    });
    await seed('created');
    await seed('updated');

    await page.route('**/api/chats/save', async route => {
        const original = route.request().postDataJSON();
        const concurrent = { ...original, operationId: randomUUID(), chat: [{ chat_metadata: {} }, { name: 'User', is_user: true, mes: 'concurrent' }] };
        const response = await route.fetch({ postData: JSON.stringify(concurrent) });
        expect(response.status()).toBe(200);
        await route.continue();
    }, { times: 1 });
    await expect(seed('stale')).rejects.toThrow(/HTTP 409/);

    const result = await page.evaluate(async file => {
        const token = (await (await fetch('/csrf-token')).json()).token;
        const response = await fetch('/api/chats/get', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
            body: JSON.stringify({ avatar_url: 'dev-character-001.png', file_name: file }),
        });
        return response.json();
    }, fileName);
    expect(result[1].mes).toBe('concurrent');
});
