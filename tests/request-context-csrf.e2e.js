import { expect, test } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';

test('production request context sends session CSRF for JSON and FormData and rejects bad tokens', async ({ page }) => {
    await testSetup.awaitST({ page });

    const requests = [];
    page.on('request', request => {
        if (request.url().endsWith('/api/files/sanitize-filename')) requests.push(request);
    });

    const result = await page.evaluate(async () => {
        const { loadCsrfToken, getRequestHeaders } = await import('/scripts/request-context.js');
        await loadCsrfToken();
        const jsonHeaders = getRequestHeaders();
        const formHeaders = getRequestHeaders({ omitContentType: true });
        const form = new FormData();
        form.append('fileName', 'form-name.txt');
        const json = await fetch('/api/files/sanitize-filename', {
            method: 'POST', headers: jsonHeaders, body: JSON.stringify({ fileName: 'json-name.txt' }),
        });
        const multipart = await fetch('/api/files/sanitize-filename', {
            method: 'POST', headers: formHeaders, body: form,
        });
        const missing = await fetch('/api/files/sanitize-filename', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileName: 'json-name.txt' }),
        });
        const invalid = await fetch('/api/files/sanitize-filename', {
            method: 'POST', headers: { ...jsonHeaders, 'X-CSRF-Token': 'invalid-token' }, body: JSON.stringify({ fileName: 'json-name.txt' }),
        });
        return {
            tokenPresent: typeof jsonHeaders['X-CSRF-Token'] === 'string' && jsonHeaders['X-CSRF-Token'].length > 0,
            sameToken: jsonHeaders['X-CSRF-Token'] === formHeaders['X-CSRF-Token'],
            jsonContentType: jsonHeaders['Content-Type'],
            formHasContentType: Object.hasOwn(formHeaders, 'Content-Type'),
            jsonStatus: json.status, jsonBody: await json.json(),
            formStatus: multipart.status, formBody: await multipart.json(),
            missingStatus: missing.status, missingBody: await missing.json(),
            invalidStatus: invalid.status, invalidBody: await invalid.json(),
        };
    });

    expect(result).toEqual({
        tokenPresent: true, sameToken: true, jsonContentType: 'application/json', formHasContentType: false,
        jsonStatus: 200, jsonBody: { fileName: 'json-name.txt' },
        formStatus: 200, formBody: { fileName: 'form-name.txt' },
        // The CSRF middleware rejects both; the app's final error handler maps
        // its ForbiddenError to this generic 500 response for API routes.
        missingStatus: 500, missingBody: { error: 'Internal Server Error' },
        invalidStatus: 500, invalidBody: { error: 'Internal Server Error' },
    });
    expect(requests).toHaveLength(4);
    const [json, multipart] = await Promise.all(requests.slice(0, 2).map(request => request.allHeaders()));
    expect(json['x-csrf-token']).toBeTruthy();
    expect(multipart['x-csrf-token']).toBe(json['x-csrf-token']);
    expect(json['content-type']).toBe('application/json');
    expect(multipart['content-type']).toMatch(/^multipart\/form-data; boundary=.+/);
});

test('workspace initialization stops and reports a CSRF token load failure', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.route('**/csrf-token', route => route.fulfill({ status: 503, contentType: 'text/plain', body: 'unavailable' }), { times: 1 });

    await page.reload();
    const startup = page.locator('#sheld > #workspace-startup');
    await expect(startup.getByRole('alert')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('#form_sheld')).toHaveAttribute('inert', '');
    expect(await page.evaluate(() => window.__emberDeskStartup.appReadyAtMs ?? null)).toBeNull();
    const reload = startup.getByRole('button', { name: /Reload|重新加载/ });
    const labelLineCount = await reload.evaluate(button => {
        const label = document.createRange();
        label.selectNodeContents(button);
        return label.getClientRects().length;
    });
    expect(labelLineCount).toBe(1);
    await reload.click();
    await expect.poll(() => page.evaluate(() => window.__emberDeskStartup?.appReadyAtMs)).toEqual(expect.any(Number));
});
