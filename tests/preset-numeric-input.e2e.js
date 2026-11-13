import { expect, test } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';

for (const [name, viewport, userAgent] of [
    ['mobile', { width: 390, height: 844 }, 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'],
    ['desktop', { width: 1280, height: 900 }, undefined],
]) {
    test.describe(name + ' numeric error layout', () => {
        test.use({ viewport, ...(userAgent ? { userAgent, isMobile: true, hasTouch: true } : {}) });
        test('unit stays aligned and error appears below without shrinking the input', async ({ page }) => {
            await openControls(page);
            for (const id of ['openai_max_context', 'openai_max_tokens']) {
                const input = page.locator('#' + id);
                await input.scrollIntoViewIfNeeded();
                const before = await input.boundingBox();
                const beforeUnit = await input.locator('xpath=..').boundingBox();
                await input.fill('');
                await input.blur();
                await expect(input).toHaveAttribute('aria-invalid', 'true');
                const alert = page.locator('#' + await input.getAttribute('aria-describedby'));
                await expect(alert).toBeVisible();
                const after = await input.boundingBox();
                const error = await alert.boundingBox();
                expect(after.width).toBeGreaterThanOrEqual(before.width - 1);
                expect(error.y).toBeGreaterThanOrEqual(after.y + after.height - 1);
                const unit = input.locator('xpath=..');
                await expect(unit).toHaveClass(/input-with-unit/);
                await expect(unit).toHaveAttribute('data-unit', 'k');
                const unitBox = await unit.boundingBox();
                expect(Math.abs(unitBox.height - beforeUnit.height)).toBeLessThan(2);
                await input.fill(id === 'openai_max_context' ? '32' : '1');
            }
        });
    });
}

async function openControls(page) {
    test.setTimeout(90_000);
    await page.route('**/api/backends/chat-completions/status', route => route.fulfill({ json: { data: [] } }));
    await testSetup.awaitST({ page });
    if (!await page.locator('#settings_preset_openai').isVisible()) {
        await page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '提示词' }).click();
    }
    await page.locator('#ai_response_configuration > .inline-drawer > .inline-drawer-toggle').click();
}

test('numeric preset counters permit sequential decimal, negative and cleared editing', async ({ page }) => {
    await openControls(page);
    const temp = page.locator('#temp_openai_counter');
    await temp.click();
    await temp.press('ControlOrMeta+A');
    await temp.pressSequentially('0.73');
    await expect(temp).toHaveValue('0.73');
    await expect(page.locator('#temp_openai')).toHaveValue('0.73');
    await temp.press('ControlOrMeta+A');
    await temp.press('Backspace');
    await expect(temp).toHaveValue('');
    await temp.pressSequentially('1.25');
    await expect(temp).toHaveValue('1.25');
    const penalty = page.locator('#freq_pen_openai');
    await penalty.click();
    await penalty.press('ControlOrMeta+A');
    await penalty.pressSequentially('-0.45');
    await expect(penalty).toHaveValue('-0.45');
    await expect.poll(() => page.evaluate(() => window.SillyTavern.getContext().chatCompletionSettings.freq_pen_openai)).toBe(-0.45);
    const context = page.locator('#openai_max_context');
    await context.click();
    await context.press('ControlOrMeta+A');
    await context.pressSequentially('32');
    await expect(context).toHaveValue('32');
    await expect.poll(() => page.evaluate(() => window.SillyTavern.getContext().chatCompletionSettings.openai_max_context)).toBe(32000);
    await context.press('ControlOrMeta+A');
    await context.press('Backspace');
    await context.blur();
    await expect(context).toHaveValue('');
    await expect(context).toHaveAttribute('aria-invalid', 'true');
    await expect.poll(() => page.evaluate(() => window.SillyTavern.getContext().chatCompletionSettings.openai_max_context)).toBe(32000);
    await context.click();
    await context.press('ControlOrMeta+A');
    await context.pressSequentially('0.5');
    await expect(context).toHaveValue('0.5');
    await expect.poll(() => page.evaluate(() => window.SillyTavern.getContext().chatCompletionSettings.openai_max_context)).toBe(500);
    await page.locator('#temp_openai').fill('0.5');
    await expect(temp).toHaveValue('0.5');
    await page.evaluate(async () => {
        const { getOpenAIPresetService } = await import('/scripts/openai.js');
        const service = getOpenAIPresetService();
        await service.save('Numeric typing fixture', { temperature: 0.91 });
        await service.select('Numeric typing fixture');
    });
    await expect(temp).toHaveValue('0.91');
});

test('numeric controls expose native bounds and keyboard stepping', async ({ page }) => {
    await openControls(page);
    const temp = page.locator('#temp_openai_counter');
    await expect(temp).toHaveRole('spinbutton');
    await expect(temp).toHaveAttribute('min', '0');
    await expect(temp).toHaveAttribute('max', '2');
    await expect(temp).toHaveAttribute('step', '0.01');
    for (const [id, min, max, step] of [
        ['openai_max_context', '0.5', null, '0.5'],
        ['openai_max_tokens', '0.1', '128', '0.1'],
        ['top_p_openai_counter', '0', '1', '0.01'],
        ['freq_pen_openai', '-2', '2', '0.01'],
        ['pres_pen_openai', '-2', '2', '0.01'],
    ]) {
        const input = page.locator(`#${id}`);
        await expect(input).toHaveRole('spinbutton');
        await expect(input).toHaveAttribute('min', min);
        if (max !== null) await expect(input).toHaveAttribute('max', max);
        await expect(input).toHaveAttribute('step', step);
    }
    await temp.fill('0.5');
    await temp.press('ArrowUp');
    await expect(temp).toHaveValue('0.51');
    await temp.press('ArrowDown');
    await expect(temp).toHaveValue('0.5');
    await expect(page.locator('#openai_max_context')).toHaveAttribute('step', '0.5');
});

test('React inline drawer responds once to keyboard and mouse with the compatibility event', async ({ page }) => {
    await openControls(page);
    const header = page.locator('#ai_response_configuration > .inline-drawer > .inline-drawer-toggle');
    const content = page.locator('#ai_response_configuration > .inline-drawer > .inline-drawer-content');
    await expect(header).toHaveAttribute('aria-expanded', 'true');
    await content.evaluate(element => {
        window.inlineDrawerEvents = 0;
        element.parentElement.addEventListener('inline-drawer-toggle', () => window.inlineDrawerEvents++);
    });
    await header.focus();
    await page.keyboard.press('Enter');
    await expect(header).toHaveAttribute('aria-expanded', 'false');
    await expect(content).not.toBeVisible();
    await page.keyboard.press('Space');
    await expect(header).toHaveAttribute('aria-expanded', 'true');
    await expect(content).toBeVisible();
    await header.click();
    await expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(await page.evaluate(() => window.inlineDrawerEvents)).toBe(3);
});

test('focused numeric wheel emits once and clears a corrected invalid draft', async ({ page }) => {
    await openControls(page);
    const temp = page.locator('#temp_openai_counter');
    await temp.fill('3');
    await temp.blur();
    await expect(temp).toHaveAttribute('aria-invalid', 'true');
    // A wheel step from the out-of-range draft clamps to the valid maximum.
    await temp.evaluate(element => {
        window.wheelInputEvents = 0;
        element.addEventListener('input', () => window.wheelInputEvents++);
    });
    await temp.focus();
    await temp.hover();
    await page.mouse.wheel(0, 100);
    await expect(temp).toHaveValue('2');
    await expect(temp).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#temp_openai_counter-error')).toHaveCount(0);
    await expect(page.locator('#temp_openai')).toHaveValue('2');
    await expect.poll(() => page.evaluate(() => window.SillyTavern.getContext().chatCompletionSettings.temp_openai)).toBe(2);
    expect(await page.evaluate(() => window.wheelInputEvents)).toBe(1);
});

test('invalid numeric draft remains visible and reports an error without changing live value', async ({ page }) => {
    await openControls(page);
    const temp = page.locator('#temp_openai_counter');
    await temp.fill('0.5');
    await temp.fill('3');
    await temp.blur();
    await expect(temp).toHaveValue('3');
    await expect(temp).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator(`#${await temp.getAttribute('aria-describedby')}`)).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.SillyTavern.getContext().chatCompletionSettings.temp_openai)).toBe(0.5);
    await temp.fill('0.6');
    await expect(temp).not.toHaveAttribute('aria-invalid', 'true');
    await temp.press('ControlOrMeta+A');
    await temp.pressSequentially('-');
    await temp.blur();
    await expect(temp).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator(`#${await temp.getAttribute('aria-describedby')}`)).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.SillyTavern.getContext().chatCompletionSettings.temp_openai)).toBe(0.6);
    await page.locator('#update_oai_preset').click();
    await expect(temp).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator(`#${await temp.getAttribute('aria-describedby')}`)).toBeVisible();
});
