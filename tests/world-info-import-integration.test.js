import { expect, jest, test } from '@jest/globals';

const button = { addEventListener: jest.fn((_event, handler) => { button.handler = handler; }) };
const message = { setAttribute: jest.fn() };
const toastNode = { querySelector: selector => ({ '.toast-message': message, '.toast-title': {}, '.toast-progress': { style: {} }, '.world-info-batch-cancel': button })[selector] };
const toast = [toastNode];
const notify = { info: jest.fn(() => toast), clear: jest.fn(), warning: jest.fn(), success: jest.fn(), error: jest.fn() };
jest.unstable_mockModule('../public/scripts/notifications.js', () => ({ default: notify, setNotificationHtml: jest.fn() }));
jest.unstable_mockModule('../public/scripts/i18n.js', () => ({ translate: text => text }));
const { createWorldInfoImportUi } = await import('../public/scripts/world-info-import-ui.js');

test('batch import uses native progress cancellation while the in-flight file completes', async () => {
    const input = {}, icon = { classList: { add: jest.fn(), remove: jest.fn() } };
    const menu = { querySelector: () => icon, classList: { toggle: jest.fn() }, setAttribute: jest.fn() };
    const saved = { document: globalThis.document, fetch: globalThis.fetch, FormData: globalThis.FormData };
    globalThis.document = { querySelector: selector => selector === '#world_import_file' ? input : menu };
    globalThis.FormData = class { append() {} };
    let resolveFetch, onFetch;
    const fetchStarted = new Promise(resolve => { onFetch = resolve; });
    globalThis.fetch = jest.fn(() => { onFetch(); return new Promise(resolve => { resolveFetch = resolve; }); });
    const release = jest.fn(), refresh = jest.fn(async () => {}), select = jest.fn(async () => {});
    let names = [];
    const ui = createWorldInfoImportUi({
        getWorldNames: () => names, getSanitizedFilename: name => name,
        equalsIgnoreCaseAndAccents: (a, b) => a === b,
        beginLocalDialogOperation: () => ({ signal: new AbortController().signal, release }),
        parseJsonFile: async () => ({ entries: {} }), getRequestHeaders: () => ({}),
        updateWorldInfoList: refresh, selectWorldInfoEditorName: select,
        showLocalDialog: async () => ({ action: 'stop' }),
        eventSource: { emit: jest.fn() }, event_types: { WORLDINFO_SETTINGS_UPDATED: 'updated' },
        t: (parts, ...args) => parts.reduce((s, part, i) => s + part + (args[i] ?? ''), ''),
        translate: value => value, escapeHtml: value => value,
    });
    try {
        const files = [{ name: 'first.json', size: 1 }, { name: 'second.json', size: 1 }];
        const operation = ui.importWorldInfoFiles(files);
        await fetchStarted;
        expect(input.disabled).toBe(true);
        expect(ui.isWorldInfoImportBusy()).toBe(true);
        await button.handler({ currentTarget: button });
        names = ['first'];
        resolveFetch({ ok: true, json: async () => ({ name: 'first' }) });
        const results = await operation;
        expect(results.map(result => result.status)).toEqual(['success', 'skipped']);
        expect(results[1]).toMatchObject({ unprocessed: true, reason: 'cancelled-remaining' });
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
        expect(refresh).toHaveBeenCalledTimes(1);
        expect(select).toHaveBeenCalledWith('first');
        expect(input.disabled).toBe(false);
        expect(release).toHaveBeenCalledTimes(1);
    } finally { Object.assign(globalThis, saved); }
});
