/* global document, window */
import { expect, test } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';

test.setTimeout(90_000);
test.beforeEach(({ page }) => {
    page.on('pageerror', error => console.error('browser pageerror:', error.message));
});

test('startup uses the native singleton without requesting the legacy toastr script', async ({ page }) => {
    const legacyRequests = [];
    const startupErrors = [];
    page.on('request', request => {
        if (new URL(request.url()).pathname === '/lib/toastr.min.js') legacyRequests.push(request.url());
    });
    page.on('pageerror', error => startupErrors.push(error.message));
    await testSetup.awaitST({ page });
    const singleton = await page.evaluate(async () => {
        const initialToastr = window.toastr;
        const initialBridge = window.emberDeskNotifications;
        const notifications = (await import('/scripts/notifications.js')).default;
        return initialToastr === undefined && initialBridge === notifications
            && typeof notifications.info === 'function';
    });
    expect(singleton).toBe(true);
    expect(startupErrors).toEqual([]);
    expect(legacyRequests).toEqual([]);
});

test('batch progress updates sanitize translated HTML and keep the cancel action', async ({ page }) => {
    await testSetup.awaitST({ page });
    const result = await page.evaluate(async () => {
        const { createWorldInfoImportUi } = await import('/scripts/world-info-import-ui.js');
        const notifications = (await import('/scripts/notifications.js')).default;
        notifications.remove();
        window.progressAttack = 0;
        let release;
        let parsing = 0;
        let cancelled = 0;
        const t = (parts, ...values) => {
            const text = parts.reduce((sum, part, i) => sum + part + (values[i] ?? ''), '');
            return text.startsWith('Checking import target') ? `${text}<img src=x onerror="window.progressAttack++">` : text;
        };
        const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[c]);
        const ui = createWorldInfoImportUi({
            getWorldNames: () => [], getSanitizedFilename: name => name, escapeHtml, t,
            beginLocalDialogOperation: () => ({ signal: new AbortController().signal, release() {} }),
            parseJsonFile: () => { parsing++; return new Promise(resolve => { release = resolve; }); },
            showLocalDialog: async () => { cancelled++; return { action: 'stop' }; },
        });
        const pending = ui.importWorldInfoFiles([new File(['{}'], 'one.json'), new File(['{}'], 'two.json')]);
        while (parsing < 1) await new Promise(requestAnimationFrame);
        release(null);
        while (parsing < 2) await new Promise(requestAnimationFrame);
        const toast = document.querySelector('#toast-container .toast-message[role=status]');
        const button = toast.querySelector('.world-info-batch-cancel');
        button.click();
        await new Promise(resolve => setTimeout(resolve, 250));
        const result = { attack: window.progressAttack, dangerous: toast.querySelectorAll('[onerror]').length, secondFile: toast.textContent.includes('two.json'), cancelled };
        release(null);
        await pending;
        notifications.remove();
        return result;
    });
    expect(result).toEqual({ attack: 0, dangerous: 0, secondFile: true, cancelled: 1 });
});

test('HTML notifications sanitize attacker markup in message and title while retaining safe UI', async ({ page }) => {
    await testSetup.awaitST({ page });
    const result = await page.evaluate(async () => {
        const notifications = (await import('/scripts/notifications.js')).default;
        notifications.remove();
        window.notificationAttack = 0;
        const toast = notifications.info(
            '<b>safe</b><button class="world-info-batch-cancel" type="button" aria-label="Cancel">Cancel</button><img src=x onerror="window.notificationAttack++"><svg onload="window.notificationAttack++"></svg><a href="javascript:window.notificationAttack++">link</a>',
            '<u>title</u><img src=x onerror="window.notificationAttack++">',
            { escapeHtml: false, timeOut: 0, tapToDismiss: false },
        );
        const button = toast.querySelector('button');
        let clicked = 0;
        button?.addEventListener('click', () => clicked++);
        button?.click();
        await new Promise(resolve => setTimeout(resolve, 250));
        const result = {
            attack: window.notificationAttack,
            dangerous: toast.querySelectorAll('[onerror], [onload], [href^="javascript:"]').length,
            bold: toast.querySelector('.toast-message b')?.textContent,
            title: toast.querySelector('.toast-title u')?.textContent,
            button: button?.getAttribute('aria-label'), clicked,
        };
        notifications.remove();
        return result;
    });
    expect(result).toEqual({ attack: 0, dangerous: 0, bold: 'safe', title: 'title', button: 'Cancel', clicked: 1 });
});

test('the application uses the native notification singleton and preserves content and handles', async ({ page }) => {
    await testSetup.awaitST({ page });
    const result = await page.evaluate(async () => {
        const notifications = (await import('/scripts/notifications.js')).default;
        const shared = window.emberDeskNotifications === notifications && window.toastr === undefined;
        notifications.clear();
        const safe = notifications.info('<img src=x onerror="window.toastXss=1">', '<b>title</b>', { timeOut: 0 });
        const escaped = !safe.querySelector('.toast-message img') && safe.querySelector('.toast-message').textContent.includes('<img');
        const html = notifications.success('<b>trusted</b>', '', { timeOut: 0, escapeHtml: false });
        const bold = html.querySelector('.toast-message b');
        const trusted = bold.textContent;
        bold.textContent = 'updated';
        bold.setAttribute('data-status', 'done');
        bold.style.color = 'red';
        const updated = html.querySelector('[data-status=done]').textContent;
        let clicked = 0;
        const button = document.createElement('button');
        button.textContent = 'original listener';
        button.addEventListener('click', () => clicked++);
        const node = notifications.info(button, '', { timeOut: 0, extendedTimeOut: 0, tapToDismiss: false });
        button.click();
        const connected = button.isConnected;
        notifications.clear(node, { force: true });
        while (button.isConnected) await new Promise(requestAnimationFrame);
        const cleared = !button.isConnected;
        notifications.clear();
        return { shared, escaped, trusted, updated, clicked, connected, cleared, xss: window.toastXss };
    });
    expect(result).toEqual({ shared: true, escaped: true, trusted: 'trusted', updated: 'updated', clicked: 1, connected: true, cleared: true, xss: undefined });
});

test('a notification made focusable by the application subscriber and keyboard observer dismisses on mouse click', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.evaluate(async () => {
        const notifications = (await import('/scripts/notifications.js')).default;
        notifications.clear();
        window.toastHadFocusOnClick = false;
        notifications.info('focusable click dismissal', '', {
            timeOut: 0,
            onclick: event => { window.toastHadFocusOnClick = document.activeElement === event.currentTarget; },
        });
    });
    const toast = page.locator('#toast-container .toast').filter({ hasText: 'focusable click dismissal' });
    await expect(toast).toHaveClass(/\binteractable\b/);
    await expect(toast).toHaveAttribute('tabindex', '0');
    await toast.click();
    expect(await page.evaluate(() => window.toastHadFocusOnClick)).toBe(true);
    await expect(toast).toHaveCount(0);
});

test('the real action loader stop button uses its DOM listener and clears the persistent notification', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.evaluate(async () => {
        const { showActionLoader } = await import('/scripts/action-loader.js');
        window.loaderStopped = 0;
        window.loader = showActionLoader({ blocking: false, message: 'real loader', onStop: () => window.loaderStopped++ });
    });
    const toast = page.locator('#toast-container .toast').filter({ hasText: 'real loader' });
    await expect(toast).toBeVisible();
    await toast.locator('.action-loader-stop').click();
    await expect(toast).toHaveCount(0);
    expect(await page.evaluate(() => window.loaderStopped)).toBe(1);
});

test('persistent notifications expose the shared container and publish click lifecycle events', async ({ page }) => {
    await testSetup.awaitST({ page });
    const initial = await page.evaluate(async () => {
        const notifications = (await import('/scripts/notifications.js')).default;
        notifications.clear();
        window.notificationEvents = [];
        window.notificationClicks = 0;
        window.notificationHidden = 0;
        notifications.subscribe(event => window.notificationEvents.push(event.state));
        const toast = notifications.info('click me', '', {
            timeOut: 0, extendedTimeOut: 0,
            onclick: () => window.notificationClicks++,
            onHidden: () => window.notificationHidden++,
        });
        return {
            sameBridge: window.emberDeskNotifications === notifications,
            inContainer: notifications.getContainer({}, false).contains(toast),
        };
    });
    expect(initial).toEqual({ sameBridge: true, inContainer: true });
    const toast = page.locator('#toast-container .toast').filter({ hasText: 'click me' });
    await expect(toast).toBeVisible();
    // Persistence is a temporal contract; wait briefly before checking again.
    // eslint-disable-next-line playwright/no-wait-for-timeout
    await page.waitForTimeout(200);
    await expect(toast).toBeVisible();
    await toast.click();
    await expect(toast).toHaveCount(0);
    expect(await page.evaluate(() => ({ events: window.notificationEvents, clicks: window.notificationClicks, hidden: window.notificationHidden })))
        .toEqual({ events: ['visible', 'hidden'], clicks: 1, hidden: 1 });
});

test('notifications remain in the real modal after clearing the last toast', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.evaluate(async () => {
        const { fixToastrForDialogs } = await import('/scripts/popup.js');
        const notifications = (await import('/scripts/notifications.js')).default;
        notifications.clear();
        const dialog = document.createElement('dialog');
        dialog.id = 'notification-test-dialog';
        document.body.append(dialog);
        dialog.showModal();
        fixToastrForDialogs();
        const first = notifications.info('first', '', { timeOut: 0 });
        notifications.clear(first, { force: true });
        notifications.info('inside modal', '', { timeOut: 0, closeButton: true });
    });
    const dialog = page.locator('#notification-test-dialog');
    const toast = dialog.locator('#toast-container .toast').filter({ hasText: 'inside modal' });
    await expect(toast).toBeVisible();
    await expect(toast).toContainText('inside modal');
    await toast.locator('.toast-close-button').click();
    await expect(toast).toHaveCount(0);
});

test('the configured fades visibly animate and lifecycle callbacks follow the animations', async ({ page }) => {
    await testSetup.awaitST({ page });
    const result = await page.evaluate(async () => {
        const notifications = (await import('/scripts/notifications.js')).default;
        notifications.remove();
        const events = [];
        notifications.subscribe(event => events.push(event.state));
        const start = performance.now();
        let shownAt;
        let hiddenAt;
        const toast = notifications.info('fade proof', '', {
            timeOut: 0,
            onShown: () => { shownAt = performance.now() - start; events.push('shown'); },
            onHidden: () => { hiddenAt = performance.now(); events.push('onHidden'); },
        });
        const sampleAfter = async ms => {
            const end = performance.now() + ms;
            while (performance.now() < end) await new Promise(requestAnimationFrame);
            return Number.parseFloat(getComputedStyle(toast).opacity);
        };
        const fadeIn = await sampleAfter(100);
        while (shownAt === undefined) await new Promise(requestAnimationFrame);
        const atShown = Number.parseFloat(getComputedStyle(toast).opacity);
        const hideStart = performance.now();
        toast.click();
        const fadeOut = await sampleAfter(100);
        const connectedDuringHide = toast.isConnected;
        while (hiddenAt === undefined) await new Promise(requestAnimationFrame);
        return {
            showDuration: notifications.options.showDuration,
            hideDuration: notifications.options.hideDuration,
            showEasing: notifications.options.showEasing,
            hideEasing: notifications.options.hideEasing,
            fadeIn, atShown, fadeOut, connectedDuringHide, shownAt,
            hideElapsed: hiddenAt - hideStart, connectedAfterHide: toast.isConnected, events,
        };
    });
    expect(result).toMatchObject({
        showDuration: 250, hideDuration: 250, showEasing: 'linear', hideEasing: 'linear',
        connectedDuringHide: true, connectedAfterHide: false, events: ['visible', 'shown', 'onHidden', 'hidden'],
    });
    expect(result.fadeIn).toBeGreaterThan(0);
    expect(result.fadeIn).toBeLessThan(result.atShown);
    expect(result.fadeOut).toBeGreaterThan(0);
    expect(result.fadeOut).toBeLessThan(result.atShown);
    expect(result.shownAt).toBeGreaterThanOrEqual(240);
    expect(result.hideElapsed).toBeGreaterThanOrEqual(240);
});
