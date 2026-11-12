import { expect, jest, test } from '@jest/globals';

jest.unstable_mockModule('../public/scripts/i18n.js', () => ({ translate: text => text }));

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
    const previous = { fetch: globalThis.fetch, FormData: globalThis.FormData, toastr: globalThis.toastr };
    const post = jest.fn();
    let resolveDelete;
    const deleteWorldInfo = jest.fn(() => new Promise(resolve => { resolveDelete = resolve; }));
    globalThis.fetch = post;
    globalThis.FormData = class { append() {} };
    globalThis.toastr = { info: jest.fn(), warning: jest.fn(), error: jest.fn(), success: jest.fn() };
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
        expect(globalThis.toastr.error).toHaveBeenCalled();
    } finally {
        Object.assign(globalThis, previous);
    }
});
