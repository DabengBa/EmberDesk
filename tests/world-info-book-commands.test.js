import { expect, jest, test } from '@jest/globals';

jest.unstable_mockModule('../public/scripts/i18n.js', () => ({ translate: text => text }));

test('moving an entry keeps target-first save order and uses live book names', async () => {
    const { createWorldInfoBookCommands } = await import('../public/scripts/world-info-book-commands.js');
    const { setWorldNames } = await import('../public/scripts/world-info-state.js');
    const previousToastr = globalThis.toastr;
    globalThis.toastr = { success: jest.fn(), error: jest.fn() };
    const saves = [];
    const books = { A: { entries: { 1: { uid: 1, comment: 'entry' } } }, B: { entries: {} } };
    const commands = createWorldInfoBookCommands({
        t: (strings, ...values) => strings.reduce((text, part, index) => text + part + (values[index] ?? ''), ''),
        loadWorldInfo: async name => structuredClone(books[name]),
        saveWorldInfo: async (name, data) => saves.push([name, structuredClone(data)]),
        deleteWIOriginalDataValue: jest.fn(),
        getSelectedWorldInfoEditorName: () => '',
    });
    try {
        setWorldNames(['A', 'B']);
        expect(await commands.moveWorldInfoEntry('A', 'B', 1)).toBe(true);
        expect(saves.map(([name]) => name)).toEqual(['B', 'A']);
        expect(saves[0][1].entries[0]).toMatchObject({ uid: 0, comment: 'entry' });
        expect(saves[1][1].entries).toEqual({});
        setWorldNames(['A']);
        expect(await commands.moveWorldInfoEntry('A', 'B', 1)).toBe(false);
        expect(saves).toHaveLength(2);
    } finally {
        globalThis.toastr = previousToastr;
        setWorldNames([]);
    }
});

test.each([true, false])('creating an existing book waits for deletion and handles deletion success=%s', async success => {
    const { createWorldInfoBookCommands } = await import('../public/scripts/world-info-book-commands.js');
    const { setWorldNames } = await import('../public/scripts/world-info-state.js');
    const originalFetch = globalThis.fetch;
    const originalToastr = globalThis.toastr;
    let finishDelete;
    globalThis.fetch = jest.fn(() => new Promise(resolve => { finishDelete = resolve; }));
    globalThis.toastr = { error: jest.fn() };
    const save = jest.fn();
    const commands = createWorldInfoBookCommands({
        t: (strings, ...values) => strings.reduce((text, part, index) => text + part + (values[index] ?? ''), ''),
        getSanitizedFilename: async name => name, getRequestHeaders: () => ({}), equalsIgnoreCaseAndAccents: (left, right) => left.toLowerCase() === right.toLowerCase(),
        showLocalDialog: async () => ({ action: 'overwrite' }),
        checkOverwriteExistingData: async (_type, _names, _name, options) => {
            const confirmed = await options.confirm({ title: 'Create', typeLabel: 'World Info', existing: 'A' });
            if (confirmed) options.deleteAction?.('A');
            return confirmed;
        },
        saveWorldInfo: save, flushDeletedWorldsFromUI: jest.fn(), updateWorldInfoList: jest.fn(),
        selectWorldInfoEditorName: jest.fn(), hideWorldEditor: jest.fn(),
    });
    try {
        setWorldNames(['A']);
        const pending = commands.createNewWorldInfo('A', { interactive: true });
        await new Promise(resolve => setImmediate(resolve));
        expect(finishDelete).toBeDefined();
        expect(save).not.toHaveBeenCalled();
        finishDelete({ ok: success });
        expect(await pending).toBe(success);
        expect(save).toHaveBeenCalledTimes(success ? 1 : 0);
        expect(globalThis.toastr.error).toHaveBeenCalledTimes(success ? 0 : 1);
    } finally {
        globalThis.fetch = originalFetch;
        globalThis.toastr = originalToastr;
        setWorldNames([]);
    }
});

test.each(['http', 'network'])('rename reports the saved copy and keeps references when the original delete fails: %s', async failure => {
    const { createWorldInfoBookCommands } = await import('../public/scripts/world-info-book-commands.js');
    const { setWorldInfo, setWorldNames } = await import('../public/scripts/world-info-state.js');
    const originalFetch = globalThis.fetch;
    const originalToastr = globalThis.toastr;
    const settings = { charLore: [{ name: 'character', extraBooks: ['A'] }] };
    const saveSettingsDebounced = jest.fn();
    globalThis.fetch = failure === 'http' ? jest.fn().mockResolvedValue({ ok: false }) : jest.fn().mockRejectedValue(new Error('network failure'));
    globalThis.toastr = { error: jest.fn() };
    const commands = createWorldInfoBookCommands({
        t: (strings, ...values) => strings.reduce((text, part, index) => text + part + (values[index] ?? ''), ''),
        showLocalDialog: async () => ({ action: 'rename', values: { name: 'B' } }),
        equalsIgnoreCaseAndAccents: (left, right) => left === right,
        saveWorldInfo: jest.fn(), getRequestHeaders: () => ({}), flushDeletedWorldsFromUI: jest.fn(),
        characters: [], saveSettingsDebounced,
    });
    try {
        setWorldNames(['A']);
        setWorldInfo(settings);
        expect(await commands.renameWorldInfo('A', { entries: {} })).toBe(false);
        expect(settings.charLore[0].extraBooks).toEqual(['A']);
        expect(saveSettingsDebounced).not.toHaveBeenCalled();
        expect(globalThis.toastr.error).toHaveBeenCalledWith('The new World Info was saved, but the original could not be deleted.');
    } finally {
        globalThis.fetch = originalFetch;
        globalThis.toastr = originalToastr;
        setWorldNames([]);
        setWorldInfo({});
    }
});
