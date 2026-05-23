import { test, expect } from '@playwright/test';

test.describe('login page', () => {
    test('uses Chinese auth copy and clears stale login errors after credential edits', async ({ page }) => {
        await page.goto('/login');

        const loginCard = page.locator('#loginCard');

        await expect(page.getByRole('heading', { name: 'EmberDesk' })).toBeVisible();
        await expect(loginCard.getByLabel('用户名')).toBeVisible();
        await expect(loginCard.getByRole('textbox', { name: '密码' })).toBeVisible();
        await expect(loginCard.getByRole('button', { name: '登录' })).toBeVisible();
        await expect(loginCard.getByRole('link', { name: '忘记密码？' })).toBeVisible();

        await loginCard.getByLabel('用户名').fill('default-user');
        await loginCard.getByRole('textbox', { name: '密码' }).fill('wrongpass');
        await loginCard.getByRole('button', { name: '登录' }).click();
        await expect(loginCard.getByRole('alert')).toHaveText('账号或密码不正确');

        await loginCard.getByRole('textbox', { name: '密码' }).fill('test123');
        await expect(loginCard.getByRole('alert')).toBeHidden();

        await loginCard.getByRole('link', { name: '忘记密码？' }).click();

        const recoveryCard = page.locator('#recoveryCard');
        await expect(recoveryCard.getByRole('heading', { name: '重置密码' })).toBeVisible();
        await expect(recoveryCard.getByLabel('用户名')).toBeVisible();
        await expect(recoveryCard.getByRole('button', { name: '发送恢复码' })).toBeVisible();
        await expect(recoveryCard.getByRole('link', { name: '返回登录' })).toBeVisible();
    });
});
