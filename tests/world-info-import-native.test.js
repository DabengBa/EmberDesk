import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('import busy state updates native controls and clears its toast', () => {
    const source = readFileSync(new URL('../public/scripts/world-info-import-ui.js', import.meta.url), 'utf8');
    const from = source.indexOf('    let worldInfoImportBusy');
    const to = source.indexOf('    function formatWorldInfoEntryCount', from);
    const icon = { classList: { remove: jest.fn(), add: jest.fn() } };
    const input = {};
    const menu = { querySelector: () => icon, classList: { toggle: jest.fn() }, setAttribute: jest.fn() };
    const toastr = { info: jest.fn(() => ({})), clear: jest.fn() };
    const helper = runInNewContext(`(() => { ${source.slice(from, to)}; return setWorldImportBusy; })()`, {
        document: { querySelector: selector => selector === '#world_import_file' ? input : menu },
        toastr, t: strings => strings[0],
    });    helper(true);
    expect(input.disabled).toBe(true);
    expect(menu.classList.toggle).toHaveBeenCalledWith('disabled', true);
    expect(menu.setAttribute).toHaveBeenCalledWith('aria-disabled', 'true');
    expect(icon.classList.add).toHaveBeenCalledWith('fa-spinner', 'fa-spin');
    helper(false);
    expect(input.disabled).toBe(false);
    expect(icon.classList.add).toHaveBeenCalledWith('fa-file-import');
    expect(toastr.clear).toHaveBeenCalledTimes(1);
});

test('batch progress updates the notification node and cancellation without jQuery methods', async () => {
    const source = readFileSync(new URL('../public/scripts/world-info-import-ui.js', import.meta.url), 'utf8');
    const from = source.indexOf('    function updateWorldInfoBatchProgress');
    const to = source.indexOf('    async function showWorldInfoBatchConflictPopup', from);
    const button = { addEventListener: jest.fn((_event, handler) => { button.handler = handler; }) };
    const message = { setAttribute: jest.fn() }, title = {}, progress = { style: {} };
    const node = { querySelector: selector => ({ '.toast-title': title, '.toast-message': message, '.toast-progress': progress, '.world-info-batch-cancel': button })[selector] };
    const setHtml = jest.fn();
    const make = runInNewContext(`(() => { let worldInfoImportToast = [node]; ${source.slice(from, to)}; return updateWorldInfoBatchProgress; })()`, {
        node, setNotificationHtml: setHtml, buildWorldInfoBatchProgressHtml: () => 'safe html', t: strings => strings[0],
        showLocalDialog: async () => ({ action: 'stop' }),
    });
    const state = {};
    make(state, 0, 2, { name: 'a.json' });
    expect(title.textContent).toBe('Importing World Info');
    expect(setHtml).toHaveBeenCalledWith(message, 'safe html');
    expect(progress.style.width).toBe('50%');
    await button.handler({ currentTarget: button });
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe('Cancelling...');
    expect(state.cancelRequested).toBe(true);
    expect(state.cancelPromptOpen).toBe(false);
});

test('batch progress also accepts a native notification handle', async () => {
    const source = readFileSync(new URL('../public/scripts/world-info-import-ui.js', import.meta.url), 'utf8');
    const from = source.indexOf('    function updateWorldInfoBatchProgress');
    const to = source.indexOf('    async function showWorldInfoBatchConflictPopup', from);
    const button = { addEventListener: jest.fn((_event, handler) => { button.handler = handler; }) };
    const message = { setAttribute: jest.fn() }, title = {}, progress = { style: {} };
    const node = { nodeType: 1, querySelector: selector => ({ '.toast-title': title, '.toast-message': message, '.toast-progress': progress, '.world-info-batch-cancel': button })[selector] };
    const setHtml = jest.fn();
    const make = runInNewContext(`(() => { let worldInfoImportToast = node; ${source.slice(from, to)}; return updateWorldInfoBatchProgress; })()`, {
        node, setNotificationHtml: setHtml, buildWorldInfoBatchProgressHtml: () => 'content', t: strings => strings[0],
        showLocalDialog: async () => ({ action: 'stop' }),
    });
    const state = {};
    make(state, 1, 2, { name: 'b.json' });
    expect(setHtml).toHaveBeenCalledWith(message, 'content');
    expect(progress.style.width).toBe('100%');
    await button.handler({ currentTarget: button });
    expect(state.cancelRequested).toBe(true);
});
