import { expect, test } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';

test('startup background fitting and dialogue close preserve the entry DOM contract', async ({ page }) => {
    await testSetup.awaitST({ page });
    const background = page.locator('#bg1');
    await page.evaluate(async () => {
        const script = await import('/script.js');
        script.loadBackgroundSettings({ background: { name: 'fixture', url: 'url("img/__transparent.png")', fitting: 'contain' } });
    });
    await expect(background).toHaveClass(/\bcontain\b/);
    await expect(background).not.toHaveClass(/\bcover\b/);

    const shadow = page.locator('#shadow_popup');
    const popup = page.locator('#dialogue_popup');
    for (const kind of ['cancel', 'confirm']) {
        await page.evaluate(async () => {
            const script = await import('/script.js');
            window.thirteenthDialogue = script.callPopup('Entry dialogue fixture', 'confirm', '', { large: true, wide: true });
        });
        await expect(shadow).toBeVisible();
        await expect(popup).toHaveClass(/\blarge_dialogue_popup\b/);
        await expect(popup).toHaveClass(/\bwide_dialogue_popup\b/);
        await page.locator(`#dialogue_popup_${kind === 'confirm' ? 'ok' : 'cancel'}`).click();
        await expect(shadow).toBeHidden();
        await expect(popup).not.toHaveClass(/\blarge_dialogue_popup\b/);
        if (kind === 'confirm') await expect(popup).not.toHaveClass(/\bwide_dialogue_popup\b/);
        else await expect(popup).toHaveClass(/\bwide_dialogue_popup\b/);
        expect(await page.evaluate(() => window.thirteenthDialogue)).toBe(kind === 'confirm');
    }
});

for (const standalone of [true, false]) {
    test(`workspace startup reflects standalone mode ${standalone} on the body`, async ({ page }) => {
        await testSetup.awaitST({ page });
        await page.addInitScript(enabled => {
            const matchMedia = window.matchMedia.bind(window);
            window.matchMedia = query => {
                const result = matchMedia(query);
                if (query === '(display-mode: standalone)') {
                    Object.defineProperty(result, 'matches', { value: enabled });
                }
                return result;
            };
        }, standalone);
        await page.reload();
        await testSetup.awaitST({ page });
        if (standalone) {
            await expect(page.locator('body')).toHaveClass(/\bPWA\b/);
        } else {
            await expect(page.locator('body')).not.toHaveClass(/\bPWA\b/);
        }
    });
}
