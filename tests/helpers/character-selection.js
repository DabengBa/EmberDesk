import { expect } from '@playwright/test';

/**
 * Shared character selection helpers for E2E tests.
 *
 * A library row click goes through React -> bridge.onSelectCharacter ->
 * `selectCharacterById`, which silently returns while a chat is saving or the
 * previous character's chat is still loading (only a toast is shown). A single
 * click during that window is therefore a no-op, so tests that switch
 * characters back-to-back must retry until the workspace context really moves.
 */

export const characterLibraryNav = page =>
    page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '角色库' });

export const characterRows = page =>
    page.locator('#rm_print_characters_block .character_select');

export const workspaceContext = page =>
    page.locator('[data-react-workspace-shell-chrome] [aria-label="Current workspace context"]');

export async function openCharacterLibrary(page) {
    await characterLibraryNav(page).click();
    await expect(characterRows(page).first()).toBeVisible();
}

export async function selectCharacterFromLibrary(page, name) {
    const row = characterRows(page).filter({ hasText: name }).first();
    await expect(async () => {
        // Selecting a character closes the library panel; a dropped click leaves
        // it open, so reopen only when the rows are not mounted anymore.
        if (!await characterRows(page).first().isVisible()) {
            await openCharacterLibrary(page);
        }
        await row.click();
        await expect(workspaceContext(page)).toContainText(name, { timeout: 3000 });
    }).toPass({ timeout: 20_000 });
}
