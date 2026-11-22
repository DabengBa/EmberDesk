import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';

const OFFICIAL_CARD = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'default',
    'content',
    'default_Seraphina.png',
);

async function fetchCharacterByAvatarUrl(page, avatarUrl) {
    const csrfToken = await page.evaluate(async () => {
        const response = await fetch('/csrf-token');
        const data = await response.json().catch(() => ({}));
        return data?.token ?? data?.data?.token ?? null;
    });
    return page.evaluate(async ({ avatar, token }) => {
        const response = await fetch('/api/characters/get', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'X-CSRF-Token': token } : {}),
            },
            body: JSON.stringify({ avatar_url: avatar }),
        });
        const text = await response.text();
        return { ok: response.ok, status: response.status, text };
    }, { avatar: avatarUrl, token: csrfToken });
}

test.describe('official SillyTavern character card import', () => {
    test('file replacement keeps the original target after switching characters', async ({ page }) => {
        await testSetup.awaitST({ page });
        const select = name => page.evaluate(async name => {
            const { getContext } = await import('/scripts/st-context.js');
            const context = getContext();
            context.chatCompletionSettings.chat_memory_enabled = false;
            const id = context.characters.findIndex(item => item.name === name);
            await context.selectCharacterById(id);
            return getContext().characters[getContext().characterId]?.name;
        }, name);
        await expect.poll(() => select('Dev Character 046')).toBe('Dev Character 046');
        const target = 'dev-character-046.png';
        await page.locator('#char-management-dropdown').evaluate(dropdown => {
            dropdown.querySelector('#replace_update').selected = true;
            dropdown.dispatchEvent(new Event('change', { bubbles: true }));
        });
        const dialog = page.locator('dialog[data-react-popup][open]');
        const picker = page.waitForEvent('filechooser', { timeout: 10000 });
        await dialog.locator('button[data-result="1002"]').click();
        const chooser = await picker;
        await expect.poll(() => select('Dev Character 047')).toBe('Dev Character 047');
        const saved = page.waitForResponse(response => new URL(response.url()).pathname === '/api/characters/import');
        const replacementName = 'Replacement target fixture';
        await chooser.setFiles({
            name: 'replacement.json', mimeType: 'application/json',
            buffer: Buffer.from(JSON.stringify({
                spec: 'chara_card_v2', spec_version: '2.0',
                data: { name: replacementName, description: 'Replacement proof', personality: '', scenario: '', first_mes: '', mes_example: '', extensions: {} },
            })),
        });
        expect((await saved).ok()).toBe(true);
        await expect.poll(async () => JSON.parse((await fetchCharacterByAvatarUrl(page, target)).text).name).toBe(replacementName);
        await expect.poll(() => page.evaluate(async () => {
            const { getContext } = await import('/scripts/st-context.js');
            const context = getContext();
            return context.characters[context.characterId]?.avatar;
        })).toBe('dev-character-047.png');
    });

    test('imports the bundled Seraphina card through the library file input', async ({ page }) => {
        await testSetup.awaitST({ page });

        const libraryButton = page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '角色库' });
        await libraryButton.click({ timeout: 10_000 });
        await expect(page.locator('#right-nav-panel')).toHaveClass(/openDrawer/, { timeout: 15_000 });
        await expect(page.locator('#character_import_file')).toBeAttached({ timeout: 15_000 });

        await page.setInputFiles('#character_import_file', OFFICIAL_CARD);

        // Import reports success through the shared toast pipeline.
        await expect(page.locator('.toast-success')).toContainText('Seraphina', { timeout: 15_000 });

        // The imported character appears in the library grid.
        const seraphinaTile = page.locator('.character_select').filter({ hasText: 'Seraphina' }).first();
        await expect(seraphinaTile).toBeVisible({ timeout: 15_000 });
    });

    test('imported card round-trips the official v2 payload through the character API', async ({ page }) => {
        await testSetup.awaitST({ page });
        await page.setInputFiles('#character_import_file', OFFICIAL_CARD);
        await expect(page.locator('.toast-success')).toContainText('Seraphina', { timeout: 15_000 });

        // Locate the imported avatar filename via the characters API.
        let avatarUrl = null;
        const csrfToken = await page.evaluate(async () => {
            const response = await fetch('/csrf-token');
            const data = await response.json().catch(() => ({}));
            return data?.token ?? data?.data?.token ?? null;
        });
        await expect.poll(async () => {
            avatarUrl = await page.evaluate(async ({ token }) => {
                const response = await fetch('/api/characters/all', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { 'X-CSRF-Token': token } : {}),
                    },
                    body: '{}',
                });
                const characters = await response.json();
                const match = (Array.isArray(characters) ? characters : []).find(c => c?.name === 'Seraphina');
                return match?.avatar ?? null;
            }, { token: csrfToken });
            return avatarUrl;
        }, { timeout: 15_000 }).not.toBeNull();

        const fetched = await fetchCharacterByAvatarUrl(page, String(avatarUrl));
        expect(fetched.ok).toBe(true);
        const character = JSON.parse(fetched.text);
        const cardData = character.data ?? character;
        expect(character.name).toBe('Seraphina');
        expect(cardData.creator).toBe('OtisAlejandro');
        expect(character.description).toContain('Seraphina\'s Personality');
        expect(character.first_mes).toContain('You wake with a start');
    });

    test('unified card import saves the embedded Eldoria world book', async ({ page }) => {
        await testSetup.awaitST({ page });

        const libraryButton = page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '角色库' });
        await libraryButton.click({ timeout: 10_000 });
        await expect(page.locator('#right-nav-panel')).toHaveClass(/openDrawer/, { timeout: 15_000 });
        await expect(page.locator('#character_import_file')).toBeAttached({ timeout: 15_000 });
        const imported = page.waitForResponse(response => new URL(response.url()).pathname === '/api/characters/import' && response.ok());
        await page.setInputFiles('#character_import_file', OFFICIAL_CARD);
        const { file_name: filename } = await (await imported).json();
        const avatar = `${filename}.png`;
        await expect(page.locator('.toast-success')).toContainText('Seraphina', { timeout: 15_000 });

        await page.getByRole('button', { name: /全部导入|Import all/ }).click();

        // The embedded book lands as a world book named after its card data.
        let eldoria = null;
        const csrfToken = await page.evaluate(async () => {
            const response = await fetch('/csrf-token');
            const data = await response.json().catch(() => ({}));
            return data?.token ?? data?.data?.token ?? null;
        });
        await expect.poll(async () => {
            eldoria = await page.evaluate(async ({ token }) => {
                const response = await fetch('/api/worldinfo/get', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { 'X-CSRF-Token': token } : {}),
                    },
                    body: JSON.stringify({ name: 'Eldoria' }),
                });
                return response.json();
            }, { token: csrfToken });
            return Object.keys(eldoria?.entries ?? {}).length;
        }, { timeout: 15_000 }).toBe(4);

        const entries = Object.values(eldoria.entries);
        expect(entries.map(entry => entry.comment)).toEqual(['eldoria', 'shadowfang', 'glade', 'power']);
        expect(entries.every(entry => entry.content?.length > 0)).toBe(true);

        // The character records the linked world book in extensions.world.
        await expect.poll(async () => {
            const { text } = await fetchCharacterByAvatarUrl(page, avatar);
            return JSON.parse(text)?.data?.extensions?.world;
        }, { timeout: 15_000 }).toBe('Eldoria');
    });
});
