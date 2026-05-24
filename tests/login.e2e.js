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

    test('supports password toggle and recovery validation without leaving the page', async ({ page }) => {
        await page.goto('/login');

        const loginCard = page.locator('#loginCard');
        const passwordInput = loginCard.getByRole('textbox', { name: '密码' });
        const passwordToggle = loginCard.getByRole('button', { name: '显示密码' });

        await expect(passwordInput).toHaveAttribute('type', 'password');
        await passwordInput.fill('visible-secret');
        await passwordToggle.click();
        await expect(passwordInput).toHaveAttribute('type', 'text');
        await expect(loginCard.getByRole('button', { name: '隐藏密码' })).toHaveAttribute('aria-pressed', 'true');

        await loginCard.getByRole('button', { name: '隐藏密码' }).click();
        await expect(passwordInput).toHaveAttribute('type', 'password');
        await expect(passwordInput).toHaveValue('visible-secret');

        await loginCard.getByRole('link', { name: '忘记密码？' }).click();

        const recoveryCard = page.locator('#recoveryCard');
        await recoveryCard.getByLabel('用户名').fill('');
        await recoveryCard.getByRole('button', { name: '发送恢复码' }).click();
        await expect(recoveryCard.getByRole('alert')).toHaveText('请输入用户名');

        await recoveryCard.getByLabel('用户名').fill('default-user');
        await page.route('/api/users/recover-step1', async route => {
            await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
        });
        await recoveryCard.getByRole('button', { name: '发送恢复码' }).click();
        await expect(recoveryCard.getByLabel('恢复码')).toBeVisible();

        await recoveryCard.getByRole('button', { name: '重置密码' }).click();
        await expect(recoveryCard.getByRole('alert')).toHaveText('请输入恢复码');

        await page.route('/api/users/recover-step2', async route => {
            await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
        });
        await recoveryCard.getByLabel('恢复码').fill('123456');
        await recoveryCard.getByLabel('新密码').fill('new-password');
        await recoveryCard.getByRole('button', { name: '重置密码' }).click();
        await expect(loginCard).toBeVisible();
        await expect(recoveryCard).toBeHidden();

        await loginCard.getByRole('link', { name: '忘记密码？' }).click();
        await recoveryCard.getByRole('link', { name: '返回登录' }).click();
        await expect(loginCard).toBeVisible();
        await expect(recoveryCard).toBeHidden();
    });
});
