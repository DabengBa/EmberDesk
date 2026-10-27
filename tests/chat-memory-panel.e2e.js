import { test, expect } from '@playwright/test';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import stylex from '@stylexjs/unplugin/vite';
import { fileURLToPath } from 'node:url';

let server;
let url;
test.beforeAll(async () => {
    const root = fileURLToPath(new URL('..', import.meta.url));
    server = await createServer({ configFile: false, root, plugins: [react(), stylex()], resolve: { alias: { '@': `${root}/app` } }, server: { host: '127.0.0.1', port: 0 } });
    await server.listen();
    url = `http://127.0.0.1:${server.httpServer.address().port}/tests/helpers/chat-memory-panel.html`;
});
test.afterAll(async () => { await server?.close(); });
test.beforeEach(async ({ page }) => { await page.goto(url); await page.getByRole('button', { name: '打开记忆' }).click(); });

test('shows read-only summaries, eligibility and errors for stable-key actions', async ({ page }) => {
    await expect(page.getByRole('dialog', { name: '对话记忆' })).toBeVisible();
    await expect(page.getByText('旧摘要 <b>只读</b>')).toBeVisible();
    await expect(page.getByRole('button', { name: '重试' })).toHaveCount(1);
    await expect(page.getByRole('button', { name: '重新总结' }).nth(1)).toBeDisabled();
    await page.getByRole('button', { name: '重试' }).click();
    await expect(page.getByRole('alert')).toContainText('未保存');
    expect(await page.evaluate(() => window.panelTest.calls)).toEqual([['retry', 'turn-1']]);
    await page.getByRole('button', { name: '钉住原文' }).first().click();
    expect(await page.evaluate(() => window.panelTest.calls.at(-1))).toEqual(['pin', 'turn-1', true]);
});

test('distinguishes inheritance from equal overrides and resets with null', async ({ page }) => {
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await expect(page.getByLabel('最近保留完整轮数')).toHaveValue('5');
    const row = page.getByTestId('setting-keepTurns');
    await expect(row).toContainText('当前会话覆盖');
    await row.getByRole('button', { name: '恢复默认' }).click();
    await expect(page.getByRole('alert')).toContainText('未保存');
    expect(await page.evaluate(() => window.panelTest.calls.at(-1))).toEqual(['settings', { keepTurns: null }]);
    await page.getByLabel('最近保留完整轮数').fill('8');
    await page.getByRole('button', { name: '应用设置' }).click();
    expect(await page.evaluate(() => window.panelTest.calls.at(-1))).toEqual(['settings', { keepTurns: 8 }]);
    await page.getByRole('button', { name: '历史', exact: true }).click();
    await expect(page.getByText('save_failed', { exact: false }).first()).toBeVisible();
});

test('closes on Escape, backdrop and chat teardown, restores focus and unsubscribes', async ({ page }) => {
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '打开记忆' })).toBeFocused();
    expect(await page.evaluate(() => window.panelTest.listenerCount())).toBe(0);
    await page.getByRole('button', { name: '打开记忆' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.mouse.click(2, 2);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: '打开记忆' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.evaluate(() => window.panelTest.switchChat());
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.evaluate(() => window.panelTest.listenerCount())).toBe(0);
});

test('fits narrow viewports and keeps keyboard focus inside', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.getByRole('button', { name: '关闭对话记忆' }).focus();
    await page.keyboard.press('Shift+Tab');
    expect(await dialog.evaluate(node => node.contains(document.activeElement))).toBe(true);
    await page.getByRole('button', { name: '设置', exact: true }).click();
    expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath('memory-mobile.png') });
});

test('applies enabled overrides, resets inheritance and never announces unproven save success', async ({ page }) => {
    await page.evaluate(() => window.panelTest.setFailure(false));
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByLabel('历史会话总结', { exact: true }).uncheck();
    await page.getByRole('button', { name: '应用设置' }).click();
    expect(await page.evaluate(() => window.panelTest.calls.at(-1))).toEqual(['settings', { enabled: false }]);
    await expect(page.getByText('记忆已关闭', { exact: false })).toBeVisible();
    await expect(page.getByTestId('setting-enabled')).toContainText('当前会话覆盖');
    await page.getByTestId('setting-keepTurns').getByRole('button', { name: '恢复默认' }).click();
    await expect(page.getByTestId('setting-keepTurns')).toContainText('继承全局设置');
    await expect(page.getByText('保存成功', { exact: false })).toHaveCount(0);
});

test('shows thrown errors without inventing a persistence outcome', async ({ page }) => {
    await page.evaluate(() => window.panelTest.setThrow());
    await page.getByRole('button', { name: '重新总结' }).first().click();
    await expect(page.getByRole('alert')).toContainText('network_failure');
    await expect(page.getByRole('alert')).not.toContainText('未保存');
    expect(await page.evaluate(() => window.panelTest.calls.at(-1))).toEqual(['regenerate', 'turn-1']);
});

test('blocks duplicate actions while waiting and safely closes an active operation', async ({ page }) => {
    await page.evaluate(() => window.panelTest.setHold());
    await page.getByRole('button', { name: '重新总结' }).first().click();
    await expect(page.getByRole('status')).toContainText('正在处理');
    await expect(page.getByRole('button', { name: '重试' })).toBeDisabled();
    await expect(page.getByRole('button', { name: '钉住原文' }).first()).toBeDisabled();
    await page.getByRole('button', { name: '关闭对话记忆' }).click();
    await page.evaluate(() => window.panelTest.release());
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.evaluate(() => window.panelTest.listenerCount())).toBe(0);
});

test('resetting one field keeps all other unapplied edits', async ({ page }) => {
    await page.evaluate(() => window.panelTest.setFailure(false));
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByLabel('最近保留完整轮数').fill('8');
    await page.getByLabel('每轮摘要最大输出 Token').fill('700');
    await page.getByLabel('总结提示词', { exact: true }).fill('尚未应用的提示词');
    await page.getByTestId('setting-keepTurns').getByRole('button', { name: '恢复默认' }).click();
    await expect(page.getByLabel('最近保留完整轮数')).toHaveValue('5');
    await expect(page.getByLabel('每轮摘要最大输出 Token')).toHaveValue('700');
    await expect(page.getByLabel('总结提示词', { exact: true })).toHaveValue('尚未应用的提示词');
    await page.getByRole('button', { name: '应用设置' }).click();
    expect(await page.evaluate(() => window.panelTest.calls.at(-1))).toEqual(['settings', { maxTokens: 700, prompt: '尚未应用的提示词' }]);
});

for (const method of ['button', 'Escape', 'backdrop']) {
    test(`dirty close via ${method} asks before discarding and cancellation keeps the draft`, async ({ page }) => {
        await page.getByRole('button', { name: '设置', exact: true }).click();
        await page.getByLabel('最近保留完整轮数').fill('8');
        const close = async () => {
            if (method === 'button') await page.getByRole('button', { name: '关闭对话记忆' }).click();
            else if (method === 'Escape') await page.keyboard.press('Escape');
            else await page.mouse.click(2, 2);
        };
        const messages = [];
        page.once('dialog', async dialog => { messages.push(dialog.message()); await dialog.dismiss(); });
        await close();
        expect(messages).toHaveLength(1);
        expect(messages[0]).toContain('尚未应用');
        await expect(page.getByRole('dialog', { name: '对话记忆' })).toBeVisible();
        await expect(page.getByLabel('最近保留完整轮数')).toHaveValue('8');
        expect(await page.evaluate(() => window.panelTest.calls)).toEqual([]);
        page.once('dialog', dialog => dialog.accept());
        await close();
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(page.getByRole('button', { name: '打开记忆' })).toBeFocused();
        await expect(page.getByRole('alert')).toHaveCount(0);
    });
}

test('forced chat switch reports discarded edits and never carries a draft into the next chat', async ({ page }) => {
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByLabel('最近保留完整轮数').fill('8');
    await page.evaluate(() => window.panelTest.forceSwitchChat());
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('alert')).toContainText('未应用的设置草稿已丢弃');
    expect(await page.evaluate(() => window.panelTest.calls)).toEqual([]);
    expect(await page.evaluate(() => window.panelTest.listenerCount())).toBe(0);
    await page.getByRole('button', { name: '打开记忆' }).click();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await expect(page.getByLabel('最近保留完整轮数')).toHaveValue('12');
    await expect(page.getByRole('button', { name: '应用设置' })).toBeDisabled();
});

test('failed single-field reset preserves every draft and null-session teardown reports the loss', async ({ page }) => {
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByLabel('最近保留完整轮数').fill('8');
    await page.getByLabel('每轮摘要最大输出 Token').fill('700');
    await page.getByTestId('setting-keepTurns').getByRole('button', { name: '恢复默认' }).click();
    await expect(page.getByRole('alert')).toContainText('未保存');
    await expect(page.getByLabel('最近保留完整轮数')).toHaveValue('8');
    await expect(page.getByLabel('每轮摘要最大输出 Token')).toHaveValue('700');
    await page.evaluate(() => window.panelTest.switchChat());
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('alert')).toContainText('未应用的设置草稿已丢弃');
});

test('applied settings close without a discard warning or confirmation', async ({ page }) => {
    await page.evaluate(() => window.panelTest.setFailure(false));
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByLabel('最近保留完整轮数').fill('8');
    await page.getByRole('button', { name: '应用设置' }).click();
    await expect(page.getByRole('button', { name: '应用设置' })).toBeDisabled();
    const messages = [];
    page.on('dialog', async dialog => { messages.push(dialog.message()); await dialog.dismiss(); });
    await page.getByRole('button', { name: '关闭对话记忆' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(messages).toEqual([]);
    await expect(page.getByRole('alert')).toHaveCount(0);
});
