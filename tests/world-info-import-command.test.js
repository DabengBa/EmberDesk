import { expect, jest, test } from '@jest/globals';

jest.unstable_mockModule('../public/scripts/i18n.js', () => ({ translate: text => text }));
const notifications = { info: jest.fn(), warning: jest.fn(), error: jest.fn(), success: jest.fn() };
jest.unstable_mockModule('../public/scripts/notifications.js', () => ({ default: notifications, setNotificationHtml: jest.fn() }));

test('batch cancellation leaves the remaining files unprocessed in selection order', async () => {
    const { runWorldInfoImportQueue } = await import('../public/scripts/world-info-import-command.js');
    const files = [{ name: 'one.json' }, { name: 'two.json' }, { name: 'three.json' }];
    const state = { cancelRequested: false };
    const imported = [];
    const results = await runWorldInfoImportQueue({
        queue: files, state, conflictChoice: 'confirm', conflicts: [],
        waitForCancelPrompt: async () => {}, progress: () => {},
        importFile: async file => {
            imported.push(file.name);
            state.cancelRequested = true;
            return { status: 'success', fileName: file.name };
        },
    });

    expect(imported).toEqual(['one.json']);
    expect(results.map(result => [result.fileName, result.reason ?? null])).toEqual([
        ['one.json', null], ['two.json', 'cancelled-remaining'], ['three.json', 'cancelled-remaining'],
    ]);
});

test('batch orchestration recovers from conflict prescan failure and releases busy state', async () => {
    const { runWorldInfoBatchImport } = await import('../public/scripts/world-info-import-command.js');
    const file = { name: 'one.json' };
    const busy = [];
    const warn = jest.fn();
    const results = await runWorldInfoBatchImport([file], {
        prepare: () => ({ selectedFiles: [file], queue: [file], unsupportedFiles: [], overflowFiles: [], skippedResults: [] }),
        isBusy: () => false, setBusy: value => busy.push(value),
        findConflicts: async () => { throw new Error('prescan'); }, warnPrescan: warn,
        chooseConflicts: async () => 'confirm', waitForCancelPrompt: async () => {}, progress: () => {},
        importFile: async () => ({ status: 'success', fileName: file.name }),
        summarize: () => ({}), showSummary: () => {}, notifySuccess: () => {},
    });
    expect(results).toMatchObject([{ status: 'success' }]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(busy).toEqual([true, false]);
});

test('format detection and conversion are owned by the import command', async () => {
    const { detectWorldInfoImportMetadata } = await import('../public/scripts/world-info-import-command.js');
    expect(detectWorldInfoImportMetadata({ entries: { 1: {} } })).toMatchObject({ formatLabel: 'World Info JSON', entryCount: 1, unsupported: false });
    expect(detectWorldInfoImportMetadata({ unrelated: true }).unsupported).toBe(true);
});

test('import acquires the shared owner before overwrite preparation or posting', async () => {
    const { runWorldInfoFileImport } = await import('../public/scripts/world-info-import-command.js');
    const run = jest.fn(async (_names, _operation, blocked) => blocked);
    const prepare = jest.fn();
    const post = jest.fn();
    const result = await runWorldInfoFileImport({ name: 'book.json', size: 1 }, {}, {
        parseJsonFile: async () => ({ entries: {} }), getWorldInfoImportBaseName: () => 'book',
        getSanitizedFilename: async name => name, prepareWorldInfoImportOverwrite: prepare,
        runDestructiveOperation: run, fetch: post, FormData: class { append() {} },
        toastr: {}, t: (s, ...v) => String.raw({ raw: s }, ...v),
    });
    expect(result.status).toBe('cancelled');
    expect(run).toHaveBeenCalledWith(['book'], expect.any(Function), expect.objectContaining({ status: 'cancelled' }));
    expect(prepare).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
});


test('overwrite keeps the session locked from deletion through failed import and releases it', async () => {
    const { runWorldInfoFileImport } = await import('../public/scripts/world-info-import-command.js');
    const { createWorldInfoWorkbenchSession } = await import('../public/scripts/world-info-workbench-service.js');
    const session = createWorldInfoWorkbenchSession({ worldNames: ['book'], loadWorldInfo: async () => ({ entries: {} }) });
    await session.selectWorldName('book');
    const states = [];
    session.setOperationListener(value => states.push(value));
    let release, started;
    const posted = new Promise(resolve => { started = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    const pending = runWorldInfoFileImport({ name: 'book.json', size: 1 }, {}, {
        parseJsonFile: async () => ({ entries: {} }), getWorldInfoImportBaseName: () => 'book',
        getSanitizedFilename: async name => name, prepareWorldInfoImportOverwrite: async () => 'deleted',
        runDestructiveOperation: session.runDestructiveOperation,
        fetch: async () => { started(); await gate; return { ok: false, status: 503 }; },
        getRequestHeaders: () => ({}), FormData: class { append() {} },
        toastr: { error: jest.fn() }, t: (s, ...v) => String.raw({ raw: s }, ...v),
    });
    await posted;
    expect(states.at(-1)).toBe(true);
    expect(await session.runDestructiveOperation(['book'], async () => true)).toBe(false);
    release();
    expect((await pending).status).toBe('failed');
    expect(states.at(-1)).toBe(false);
    expect(await session.runDestructiveOperation(['book'], async () => true)).toBe(true);
});

test('single import cancellation never posts and 413 reports a failed result', async () => {
    const { runWorldInfoFileImport } = await import('../public/scripts/world-info-import-command.js');
    const file = { name: 'book.json', size: 1 };
    const post = jest.fn(async () => ({ ok: false, status: 413, statusText: 'too large' }));
    const error = jest.fn();
    const deps = {
        parseJsonFile: async () => ({ entries: {} }), getWorldInfoImportBaseName: () => 'book',
        getSanitizedFilename: async name => name, prepareWorldInfoImportOverwrite: async () => false,
        fetch: post, getRequestHeaders: () => ({}), FormData: class { append() {} },
        toastr: { error, info: jest.fn(), success: jest.fn() }, t: (parts, ...values) => String.raw({ raw: parts }, ...values),
    };
    expect(await runWorldInfoFileImport(file, {}, deps)).toMatchObject({ status: 'cancelled' });
    expect(post).not.toHaveBeenCalled();
    deps.prepareWorldInfoImportOverwrite = async () => true;
    expect(await runWorldInfoFileImport(file, {}, deps)).toMatchObject({ status: 'failed' });
    expect(post).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('File is too large'));
});

test('owner cancellation stops a batch after the current file without opening the next', async () => {
    const { runWorldInfoImportQueue } = await import('../public/scripts/world-info-import-command.js');
    const owner = new AbortController();
    const files = [{ name: 'one.json' }, { name: 'two.json' }];
    const imported = [];
    const results = await runWorldInfoImportQueue({
        queue: files, state: { cancelRequested: false }, conflictChoice: 'confirm', conflicts: [], signal: owner.signal,
        waitForCancelPrompt: async () => {}, progress: () => {},
        importFile: async file => { imported.push(file.name); owner.abort(); return { status: 'cancelled', fileName: file.name }; },
    });
    expect(imported).toEqual(['one.json']);
    expect(results[1]).toMatchObject({ fileName: 'two.json', unprocessed: true });
});

test.each(['confirm', 'overwrite'])('World Info %s waits for deletion and stops on deletion failure', async mode => {
    const { createWorldInfoImportUi } = await import('../public/scripts/world-info-import-ui.js');
    const previous = { fetch: globalThis.fetch, FormData: globalThis.FormData };
    const post = jest.fn();
    let resolveDelete;
    const deleteWorldInfo = jest.fn(() => new Promise(resolve => { resolveDelete = resolve; }));
    globalThis.fetch = post;
    globalThis.FormData = class { append() {} };
    notifications.error.mockClear();
    const t = (parts, ...values) => String.raw({ raw: parts }, ...values);
    const ui = createWorldInfoImportUi({
        getWorldNames: () => ['book'], deleteWorldInfo, getSanitizedFilename: async name => name,
        equalsIgnoreCaseAndAccents: (a, b) => a === b, parseJsonFile: async () => ({ entries: {} }),
        getRequestHeaders: () => ({}), t, translate: text => text, escapeHtml: text => text,
        showLocalDialog: async () => ({ action: 'overwrite', values: {} }),
        checkOverwriteExistingData: async (_type, _names, _name, options) => options.confirm({ title: 'Import', typeLabel: 'World Info', existing: 'book' }),
    });
    try {
        const result = ui.importWorldInfo({ name: 'book.json', size: 1 }, { overwriteMode: mode });
        await new Promise(resolve => setImmediate(resolve));
        expect(deleteWorldInfo).toHaveBeenCalledWith('book');
        expect(post).not.toHaveBeenCalled();
        resolveDelete(false);
        expect(await result).toMatchObject({ status: 'failed' });
        expect(post).not.toHaveBeenCalled();
        expect(notifications.error).toHaveBeenCalled();
    } finally {
        Object.assign(globalThis, previous);
    }
});
