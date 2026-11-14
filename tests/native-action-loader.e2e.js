/* global window, document */
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const publicRoot = fileURLToPath(new URL('../public/', import.meta.url));
test.beforeEach(async ({ page }) => {
    await page.route('http://loader.test/**', async route => {
        const path = new URL(route.request().url()).pathname;
        const mocks = {
            '/': '<!doctype html><div id="preloader"></div>',
            '/script.js': 'export function stopGeneration() {}',
            '/scripts/i18n.js': 'export const t = parts => parts[0];',
            '/scripts/popup.js': `
                export const POPUP_RESULT = { AFFIRMATIVE: 1, CANCELLED: 0 };
                export const POPUP_TYPE = { DISPLAY: 1 };
                export class Popup {
                    constructor(content) {
                        this.dlg = document.createElement('div');
                        this.closeButton = document.createElement('button');
                        this.dlg.append(content, this.closeButton);
                        window.popup = this;
                    }
                    show() { document.body.append(this.dlg); }
                    complete(result) {
                        window.completedWith = result;
                        return new Promise(resolve => { window.finishPopup = () => { this.dlg.remove(); resolve(); }; });
                    }
                }
            `,
        };
        const body = mocks[path] ?? await fs.readFile(`${publicRoot}${path.slice(1)}`, 'utf8');
        await route.fulfill({ status: 200, contentType: path === '/' ? 'text/html' : 'application/javascript', body });
    });
    await page.goto('http://loader.test/');
    await page.addScriptTag({ path: `${publicRoot}lib/jquery-3.5.1.min.js` });
    await page.addScriptTag({ path: `${publicRoot}lib/jquery.transit.min.js` });
    await page.evaluate(async () => {
        const original = window.jQuery.cssHooks.filter.set;
        window.filterHookCalls = [];
        window.jQuery.cssHooks.filter.set = function (element, value) {
            window.filterHookCalls.push(value);
            return original.apply(this, arguments);
        };
        window.actionLoader = await import('/scripts/action-loader.js');
    });
});


test.describe('action loader native filter', () => {
    test('last handle animates, bypasses the filter hook, and waits for transition and Popup completion', async ({ page }) => {
        const state = await page.evaluate(async () => {
            const options = { toastMode: 'none', message: 'Loading' };
            const first = window.actionLoader.showActionLoader(options);
            const last = window.actionLoader.showActionLoader(options);
            const element = document.querySelector('#loader');
            document.querySelector('#load-spinner').style.transitionDuration = '0.2s';
            await first.hide();
            const afterFirst = { attached: element.isConnected, filter: element.style.filter, completed: window.completedWith };
            let resolved = false;
            const hiding = last.hide().then(() => { resolved = true; });
            const during = { attached: element.isConnected, filter: element.style.filter, opacity: element.style.opacity,
                hooks: [...window.filterHookCalls], completed: window.completedWith, resolved };
            element.dispatchEvent(new Event('transitionend', { bubbles: true }));
            await new Promise(resolve => setTimeout(resolve, 0));
            const afterTransition = { attached: element.isConnected, preloader: !!document.querySelector('#preloader'),
                completed: window.completedWith, resolved };
            window.finishPopup();
            await hiding;
            return { afterFirst, during, afterTransition, resolved, popupAttached: window.popup.dlg.isConnected };
        });
        expect(state.afterFirst).toEqual({ attached: true, filter: '', completed: undefined });
        expect(state.during).toEqual({ attached: true, filter: 'blur(15px)', opacity: '0', hooks: [], completed: undefined, resolved: false });
        expect(state.afterTransition).toEqual({ attached: false, preloader: false, completed: 1, resolved: false });
        expect(state.resolved).toBe(true);
        expect(state.popupAttached).toBe(false);
    });

    test('falls back after 500ms when no transition event arrives', async ({ page }) => {
        const state = await page.evaluate(async () => {
            const handle = window.actionLoader.showActionLoader({ toastMode: 'none' });
            const element = document.querySelector('#loader');
            document.querySelector('#load-spinner').style.transitionDuration = '0.2s';
            const hiding = handle.hide();
            await new Promise(resolve => setTimeout(resolve, 350));
            const before = element.isConnected;
            await new Promise(resolve => setTimeout(resolve, 250));
            const after = element.isConnected;
            const completed = window.completedWith;
            window.finishPopup();
            await hiding;
            return { before, after, completed, hooks: window.filterHookCalls };
        });
        expect(state).toEqual({ before: true, after: false, completed: 1, hooks: [] });
    });

    for (const [label, duration, mode] of [
        ['immediate', '0.2s', 'immediate'],
        ['zero duration (including reduced motion)', '0s', 'auto'],
    ]) {
        test(`${label} removes the loader immediately and stop calls only onStop`, async ({ page }) => {
            const state = await page.evaluate(async ({ duration, mode }) => {
                const calls = [];
                const handle = window.actionLoader.showActionLoader({ toastMode: 'none', overlayHideMode: mode,
                    onStop: () => calls.push('stop'), onHide: () => calls.push('hide') });
                const element = document.querySelector('#loader');
                document.querySelector('#load-spinner').style.transitionDuration = duration;
                const stopping = handle.stop();
                await new Promise(resolve => setTimeout(resolve, 0));
                const beforeCompletion = { attached: element.isConnected, filter: element.style.filter, opacity: element.style.opacity,
                    preloader: !!document.querySelector('#preloader'), completed: window.completedWith, hooks: window.filterHookCalls };
                window.finishPopup();
                await stopping;
                return { beforeCompletion, calls };
            }, { duration, mode });
            expect(state.beforeCompletion).toEqual({ attached: false, filter: 'blur(15px)', opacity: '0', preloader: false, completed: 1, hooks: [] });
            expect(state.calls).toEqual(['stop']);
        });
    }
});
