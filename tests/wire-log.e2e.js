import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { testSetup } from './frontend/frontent-test-utils.js';

const chatName = 'Dev Character 001 Session 01';

async function setup(page, upstream) {
    await testSetup.awaitST({ page });
    await page.evaluate(async ({ upstream, chatName }) => {
        const context = window.SillyTavern.getContext();
        const id = context.characters.findIndex(character => character?.name === 'Dev Character 001');
        await context.selectCharacterById(id);
        await context.openCharacterChat(chatName);
        Object.assign(context.chatCompletionSettings, {
            chat_completion_source: 'openai', openai_model: 'gpt-4o-mini',
            custom_url: upstream, stream_openai: false, n: 1, send_if_empty: '',
        });
        const script = await import('/script.js');
        script.changeMainAPI('openai');
        script.setOnlineStatus('Valid');
        script.activateSendButtons();
    }, { upstream, chatName });
}

async function api(page, path, body) {
    return page.evaluate(async ({ path, body }) => {
        const { getRequestHeaders } = await import('/scripts/request-context.js');
        const response = await fetch(`/api/wire-logs${path}`, {
            method: body ? 'POST' : 'GET', headers: getRequestHeaders(),
            ...(body ? { body: JSON.stringify(body) } : {}),
        });
        if (!response.ok) throw new Error(`wire logs ${response.status}: ${await response.text()}`);
        return response.json();
    }, { path, body });
}

async function openViewer(page) {
    await page.locator('#options_button').click();
    await page.locator('#option_wire_log').click();
    return page.getByRole('dialog', { name: '链路日志' });
}

test.describe('wire log real upstream boundary', () => {
    test.describe.configure({ mode: 'serial' });
    test.setTimeout(120_000);
    let server;
    let upstream;
    let requests;
    let streaming;

    test.beforeAll(async () => {
        requests = [];
        server = createServer(async (request, response) => {
            const chunks = [];
            for await (const chunk of request) chunks.push(chunk);
            const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
            requests.push(body);
            if (body.stream) {
                response.writeHead(200, { 'Content-Type': 'text/event-stream' });
                response.write('data: {"choices":[{"delta":{"content":"partial wire reply"}}]}\n\n');
                streaming = true;
                const timer = setInterval(() => response.write(': heartbeat\n\n'), 100);
                response.on('close', () => clearInterval(timer));
            } else {
                response.writeHead(200, { 'Content-Type': 'application/json' });
                response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'wire upstream reply' }, finish_reason: 'stop' }] }));
            }
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        upstream = `http://127.0.0.1:${server.address().port}/v1`;
    });
    test.afterAll(async () => {
        server?.closeAllConnections();
        await new Promise(resolve => server?.close(resolve));
    });

    test('real send → stored record → scoped/all viewer, copy/download/delete, persisted off, keyboard and mobile', async ({ page, context }) => {
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        await setup(page, upstream);
        await api(page, '/config', { enabled: true });
        await page.locator('#send_textarea').fill('Wire log browser proof');
        await page.locator('#send_but').click();
        await expect.poll(() => requests.length).toBeGreaterThan(0);
        let records;
        await expect.poll(async () => {
            records = await api(page, `?chatId=${encodeURIComponent(chatName)}`);
            return records.length;
        }).toBeGreaterThan(0);
        const record = await api(page, `/${encodeURIComponent(records[0].id)}`);
        expect(record.context.chatId).toBe(chatName);
        expect(record.request.body).toEqual(requests[0]);
        expect(requests[0]).not.toHaveProperty('_trace');
        await expect(page.locator('#mes_stop')).toBeHidden();
        await page.evaluate(async () => window.SillyTavern.getContext().openCharacterChat('Dev Character 001 Session 02'));
        await page.locator('#send_textarea').fill('Another conversation wire proof');
        await page.locator('#send_but').click();
        await expect.poll(async () => (await api(page, '?chatId=Dev%20Character%20001%20Session%2002')).length).toBe(1);
        await expect(page.locator('#mes_stop')).toBeHidden();
        await page.evaluate(async chatName => window.SillyTavern.getContext().openCharacterChat(chatName), chatName);

        const dialog = await openViewer(page);
        await expect(dialog).toBeVisible();
        await expect.poll(() => dialog.evaluate(node => node.contains(document.activeElement))).toBe(true);
        for (let i = 0; i < 25; i++) {
            await page.keyboard.press('Tab');
            expect(await dialog.evaluate(node => node.contains(document.activeElement))).toBe(true);
        }

        await dialog.getByRole('button', { name: '只看当前会话', exact: true }).click();
        await expect(dialog.getByText('全部会话', { exact: true })).toBeVisible();
        await expect(dialog.locator('button[aria-pressed]').filter({ hasText: 'gpt-4o-mini' })).toHaveCount(2);
        await dialog.locator('button[aria-pressed]').filter({ hasText: record.id }).click();
        await expect(dialog.locator('[data-wire-log-copy="record"]')).toBeVisible();
        await page.screenshot({ path: '/tmp/wire-log-desktop.png', fullPage: true });
        await dialog.locator('[data-wire-log-copy="record"]').click();
        expect(JSON.parse(await page.evaluate(() => navigator.clipboard.readText())).id).toBe(record.id);
        const downloadPromise = page.waitForEvent('download');
        await dialog.getByRole('button', { name: '下载 JSON', exact: true }).click();
        expect((await downloadPromise).suggestedFilename()).toContain('.json');
        await page.setViewportSize({ width: 390, height: 844 });
        await expect(dialog.locator('[data-wire-log-copy="reply"]')).toHaveCSS('white-space', 'nowrap');
        await page.screenshot({ path: '/tmp/wire-log-mobile-390.png', fullPage: true });
        expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
        await dialog.getByRole('button', { name: '删除', exact: true }).click();
        await expect.poll(async () => (await api(page, '?limit=100')).some(entry => entry.id === record.id)).toBe(false);
        await dialog.getByRole('button', { name: '关闭追踪', exact: true }).click();
        await expect(dialog.getByRole('button', { name: '开启追踪', exact: true })).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.locator('#options_button')).toBeFocused();
        await page.evaluate(async () => {
            const context = window.SillyTavern.getContext();
            context.saveSettingsDebounced();
            await new Promise(resolve => setTimeout(resolve, 1500));
        });
        await page.reload();
        await testSetup.awaitST({ page });
        expect((await api(page, '/config')).enabled).toBe(false);
    });

    test('stopping a real stream retains its partial trace in the original conversation', async ({ page }) => {
        await setup(page, upstream);
        await api(page, '/config', { enabled: true });
        await page.evaluate(() => { window.SillyTavern.getContext().chatCompletionSettings.stream_openai = true; });
        const before = new Set((await api(page, '?limit=100')).map(record => record.id));
        streaming = false;
        await page.locator('#send_textarea').fill('Wire log stop proof');
        await page.locator('#send_but').click();
        await expect.poll(() => streaming).toBe(true);
        await page.evaluate(async () => {
            await window.SillyTavern.getContext().openCharacterChat('Dev Character 001 Session 02');
        });
        await page.locator('#mes_stop').click();
        let stopped;
        await expect.poll(async () => {
            stopped = (await api(page, '?limit=100')).find(record => !before.has(record.id));
            return stopped?.status;
        }).toBe('error');
        const record = await api(page, `/${encodeURIComponent(stopped.id)}`);
        expect(record.context.chatId).toBe(chatName);
        expect(JSON.stringify(record.response)).toContain('partial wire reply');
    });
});
