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
