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

    test('embedded character_book imports as the Eldoria world book on character select', async ({ page }) => {
        await testSetup.awaitST({ page });

        const libraryButton = page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '角色库' });
        await libraryButton.click({ timeout: 10_000 });
        await expect(page.locator('#right-nav-panel')).toHaveClass(/openDrawer/, { timeout: 15_000 });
        await expect(page.locator('#character_import_file')).toBeAttached({ timeout: 15_000 });
        await page.setInputFiles('#character_import_file', OFFICIAL_CARD);
        await expect(page.locator('.toast-success')).toContainText('Seraphina', { timeout: 15_000 });

        // Selecting the character surfaces the embedded-lorebook confirm; the
        // popup opens on selection, so dispatch the click without hit-testing.
        await page.locator('.character_select').filter({ hasText: 'Seraphina' }).first().dispatchEvent('click');
        const confirmOk = page.locator('.popup-button-ok').filter({ hasText: /yes|是/i }).first();
        await expect(confirmOk).toBeVisible({ timeout: 15_000 });
        await confirmOk.click();

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
            const linked = await page.evaluate(async ({ token }) => {
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
                return match?.data?.extensions?.world ?? match?.extensions?.world ?? null;
            }, { token: csrfToken });
            return linked;
        }, { timeout: 15_000 }).toBe('Eldoria');
    });
});
