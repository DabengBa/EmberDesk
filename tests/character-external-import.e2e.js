import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';

const officialCard = fileURLToPath(new URL('../default/content/default_Seraphina.png', import.meta.url));

test('imports a mixed batch, keeps existing confirmation prompts, and retries only the edited failure', async ({ page }) => {
    await testSetup.awaitST({ page });
    const inputs = [];
    const cardUrl = 'https://chub.ai/characters/example/seraphina';
    let releaseCard;
    const cardReady = new Promise(resolve => { releaseCard = resolve; });
    await page.route(/\/api\/content\/import(?:URL|UUID)$/, async route => {
        const { url } = route.request().postDataJSON();
        inputs.push([new URL(route.request().url()).pathname, url]);
        if (url === cardUrl) {
            await cardReady;
            await route.fulfill({ path: officialCard, contentType: 'image/png', headers: {
                'X-Custom-Content-Type': 'character', 'Content-Disposition': 'attachment; filename="seraphina.png"',
            } });
        } else if (url === 'example/broken') {
            await route.fulfill({ body: 'not a character card', contentType: 'application/json', headers: {
                'X-Custom-Content-Type': 'character', 'Content-Disposition': 'attachment; filename="broken.json"',
            } });
        } else if (url === 'example/unavailable') {
            await route.fulfill({ status: 404 });
        } else {
            const name = url === 'example/fixed' ? 'External Retry Proof' : 'External Batch Proof';
            await route.fulfill({ json: { entries: { 0: { uid: 0, key: ['proof'], content: 'Imported' } } }, headers: {
                'X-Custom-Content-Type': 'lorebook', 'Content-Disposition': `attachment; filename="${name}.json"`,
            } });
        }
    });
    await page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '角色库' }).click();
    await page.getByRole('button', { name: '从外部 URL 导入内容' }).click();
    const dialog = page.getByRole('dialog', { name: '链接导入' });
    const textarea = dialog.getByRole('textbox', { name: '链接或 ID' });
    await expect(textarea).toBeFocused();
    await expect(dialog).not.toContainText(/支持的来源|Perchance|Ctrl\+Enter/);
    await expect(dialog.getByRole('button', { name: '导入', exact: true })).toBeDisabled();
    await textarea.fill(`  ${cardUrl}\n\n lorebooks/example/batch\nlorebooks/example/batch\nexample/broken\nexample/unavailable `);
    const cardSave = page.waitForResponse(response => new URL(response.url()).pathname === '/api/characters/import' && response.ok());
    await textarea.press('Control+Enter');
    try {
        await expect(dialog.getByRole('status')).toHaveText('正在导入…');
        await page.keyboard.press('Escape');
        await page.keyboard.press('Escape');
    } finally {
        releaseCard();
    }
    expect((await (await cardSave).json()).file_name).toBeTruthy();

    const skipExtras = page.locator('dialog[open] .popup-button-cancel').filter({ hasText: '全部跳过' });
    await expect(skipExtras).toBeVisible();
    await skipExtras.click();
    const confirm = page.locator('dialog[data-local-dialog][open]');
    await expect(confirm.getByRole('button', { name: '取消' })).toBeVisible();
    await confirm.getByRole('button', { name: '取消' }).click();

    const row = (name) => dialog.getByRole('listitem').filter({ hasText: name });
    await expect(row(cardUrl)).toContainText('角色已导入');
    await expect(row('lorebooks/example/batch').filter({ hasText: '世界书已导入' })).toHaveCount(1);
    await expect(row('lorebooks/example/batch').filter({ hasText: '已跳过' })).toHaveCount(1);
    await expect(row('example/broken')).toContainText('导入失败');
    await expect(row('example/unavailable')).toContainText('导入失败');
    await expect(page.getByText('Custom content import failed', { exact: true })).toHaveCount(0);
    await dialog.getByRole('button', { name: '修改并重试' }).click();
    await expect(textarea).toHaveValue('example/broken\nexample/unavailable');
    await expect(textarea).toBeFocused();
    await textarea.fill('example/fixed');
    await textarea.press('Meta+Enter');
    await expect(row('example/fixed')).toContainText('世界书已导入');
    await expect(row(cardUrl)).toContainText('角色已导入');
    await expect(row('example/broken')).toHaveCount(0);
    expect(inputs).toEqual([
        ['/api/content/importURL', cardUrl], ['/api/content/importUUID', 'lorebooks/example/batch'],
        ['/api/content/importUUID', 'lorebooks/example/batch'], ['/api/content/importUUID', 'example/broken'],
        ['/api/content/importUUID', 'example/unavailable'],
        ['/api/content/importUUID', 'example/fixed'],
    ]);
    await dialog.getByRole('button', { name: '完成' }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole('button', { name: '从外部 URL 导入内容' }).click();
    await expect(textarea).toHaveValue('');
    await textarea.press('Escape');
    await expect(dialog).toHaveCount(0);
    const savedBook = await page.evaluate(async () => {
        const { token } = await (await fetch('/csrf-token')).json();
        const response = await fetch('/api/worldinfo/get', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
            body: JSON.stringify({ name: 'External Batch Proof' }),
        });
        return response.json();
    });
    expect(savedBook.entries['0'].content).toBe('Imported');
});
