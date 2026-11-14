import { expect, jest, test } from '@jest/globals';

jest.unstable_mockModule('../public/scripts/i18n.js', () => ({ translate: text => text }));

test('rename restores the active slot through the state command, retaining other edits while awaiting deletion', async () => {
    const { createWorldInfoBookCommands } = await import('../public/scripts/world-info-book-commands.js');
    const state = await import('../public/scripts/world-info-state.js');
    const previousFetch = globalThis.fetch;
    const setGlobal = jest.fn(state.setSelectedWorldInfo);
    const selectEditor = jest.fn();
    state.setWorldInfo({});
    state.setWorldNames(['Before', 'A', 'After', 'Concurrent']);
    state.setSelectedWorldInfo(['Before', 'A', 'After']);
    globalThis.fetch = jest.fn(async () => ({ ok: true }));
    const commands = createWorldInfoBookCommands({
        t: (strings, ...values) => strings.reduce((text, part, index) => text + part + (values[index] ?? ''), ''),
        showLocalDialog: async () => ({ action: 'rename', values: { name: 'B' } }),
        equalsIgnoreCaseAndAccents: (left, right) => left === right,
        saveWorldInfo: jest.fn(), getRequestHeaders: () => ({}), characters: [],
        flushDeletedWorldsFromUI: async () => {
            state.setWorldNames(['Before', 'B', 'After', 'Concurrent']);
            state.setSelectedWorldInfo(['Before', 'After', 'Concurrent']);
        },
        setWorldInfoGlobalActiveNames: setGlobal, selectWorldInfoEditorName: selectEditor,
    });
    try {
        expect(await commands.renameWorldInfo('A', { entries: {} })).toBe(true);
        expect(setGlobal).toHaveBeenCalledWith(['Before', 'B', 'After', 'Concurrent']);
        expect(selectEditor).toHaveBeenCalledWith('B');
    } finally {
        globalThis.fetch = previousFetch;
        state.setWorldNames([]);
        state.setSelectedWorldInfo([]);
    }
});

test.each(['http', 'network'])('confirmed rename preserves activation and editor when the optional list refresh fails: %s', async failure => {
    const { createWorldInfoBookCommands } = await import('../public/scripts/world-info-book-commands.js');
    const { createWorldInfoBookSync } = await import('../public/scripts/world-info-book-sync.js');
    const { createWorldInfoWorkbenchSession, createWorldInfoWorkbenchCommands } = await import('../public/scripts/world-info-workbench-service.js');
    const { createWorldInfoEditorComposition } = await import('../public/scripts/world-info-editor-composition.js');
    const state = await import('../public/scripts/world-info-state.js');
    const previousFetch = globalThis.fetch, previousDollar = globalThis.$, previousToastr = globalThis.toastr;
    const serverNames = new Set(['Before', 'A', 'After', 'Concurrent']);
    let recovered = false;
    const saves = [];
    const saveSettings = () => saves.push([...state.selected_world_info]);
    const emitUpdated = jest.fn();
    state.setWorldInfo({});
    state.setWorldNames([...serverNames]);
    state.setSelectedWorldInfo(['Before', 'A', 'After']);
    const getSession = createWorldInfoEditorComposition({
        getWorldNames: () => state.world_names, getSelectedWorldInfo: () => state.selected_world_info,
        createSession: createWorldInfoWorkbenchSession,
        getSessionOptions: () => ({ loadWorldInfo: async name => serverNames.has(name) ? { entries: {} } : null }),
    });
    const globalCommands = createWorldInfoWorkbenchCommands({
        getWorldNames: () => state.world_names, getSelectedNames: () => state.selected_world_info,
        setSelectedNames: state.setSelectedWorldInfo, getSession, save: saveSettings, emitUpdated,
    });
    const sync = createWorldInfoBookSync({
        getRequestHeaders: () => ({}), getSelectedWorldInfoEditorName: () => getSession().getSelectedWorldName(),
        getWorldInfoWorkbenchSession: getSession, hideWorldEditor: () => getSession().selectWorldName(''),
        saveSettingsDebounced: saveSettings,
    });
    globalThis.$ = selector => { expect(selector).toBe('#character_world'); return { val: () => '' }; };
    globalThis.toastr = { error: jest.fn() };
    globalThis.fetch = jest.fn(async (url, options) => {
        if (url === '/api/worldinfo/delete') {
            serverNames.delete(JSON.parse(options.body).name);
            return { ok: true };
        }
        expect(url).toBe('/api/settings/get');
        if (!recovered) {
            // A concurrent activation must survive the rename's awaited I/O.
            state.setSelectedWorldInfo([...state.selected_world_info, 'Concurrent']);
            if (failure === 'network') throw new Error('offline');
            return { ok: false, status: 503 };
        }
        return { ok: true, json: async () => ({ world_names: [...serverNames] }) };
    });
    const commands = createWorldInfoBookCommands({
        t: (strings, ...values) => strings.reduce((text, part, index) => text + part + (values[index] ?? ''), ''),
        showLocalDialog: async () => ({ action: 'rename', values: { name: 'B' } }),
        equalsIgnoreCaseAndAccents: (left, right) => left === right,
        saveWorldInfo: async name => { serverNames.add(name); }, getRequestHeaders: () => ({}), characters: [],
        flushDeletedWorldsFromUI: sync.flushDeletedWorldsFromUI,
        setWorldInfoGlobalActiveNames: globalCommands.setGlobalActiveNames,
        selectWorldInfoEditorName: name => getSession().selectWorldName(name),
    });
    try {
        await getSession().selectWorldName('A');
        expect(await commands.renameWorldInfo('A', { entries: {} })).toBe(true);
        expect([...serverNames]).not.toContain('A');
        expect(state.world_names).toContain('B');
        expect(getSession().getSelectorSnapshot()).toEqual({
            worldNames: state.world_names,
            globalActiveNames: ['Before', 'B', 'After', 'Concurrent'], editorWorldName: 'B',
        });
        expect(saves.at(-1)).toEqual(['Before', 'B', 'After', 'Concurrent']);
        expect(emitUpdated).toHaveBeenCalledTimes(1);
        expect(globalThis.toastr.error).not.toHaveBeenCalled();
        recovered = true;
        expect(await sync.updateWorldInfoList()).toBe(true);
        expect(getSession().getSelectorSnapshot().globalActiveNames).toEqual(['Before', 'B', 'After', 'Concurrent']);
        expect(getSession().getSelectedWorldName()).toBe('B');
    } finally {
        globalThis.fetch = previousFetch; globalThis.$ = previousDollar; globalThis.toastr = previousToastr;
        state.setWorldNames([]); state.setSelectedWorldInfo([]);
    }
});

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

test('renaming a named book saves the new identity without mutating the original data', async () => {
    const { createWorldInfoBookCommands } = await import('../public/scripts/world-info-book-commands.js');
    const { setWorldNames } = await import('../public/scripts/world-info-state.js');
    const previousFetch = globalThis.fetch;
    const previousToastr = globalThis.toastr;
    const saveWorldInfo = jest.fn();
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: false });
    globalThis.toastr = { error: jest.fn() };
    const commands = createWorldInfoBookCommands({
        t: (strings, ...values) => strings.reduce((text, part, index) => text + part + (values[index] ?? ''), ''),
        showLocalDialog: async () => ({ action: 'rename', values: { name: 'B' } }),
        equalsIgnoreCaseAndAccents: (left, right) => left === right,
        saveWorldInfo, getRequestHeaders: () => ({}),
    });
    const original = { name: 'A', entries: {} };
    try {
        setWorldNames(['A']);
        expect(await commands.renameWorldInfo('A', original)).toBe(false);
        expect(saveWorldInfo).toHaveBeenCalledWith('B', { name: 'B', entries: {} }, true);
        expect(original.name).toBe('A');
    } finally {
        globalThis.fetch = previousFetch;
        globalThis.toastr = previousToastr;
        setWorldNames([]);
    }
});
