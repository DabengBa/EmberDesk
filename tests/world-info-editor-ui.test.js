import { expect, jest, test } from '@jest/globals';

jest.unstable_mockModule('../public/scripts/i18n.js', () => ({ translate: text => text }));

test('bulk confirmation cannot delete entries after the editor selection changes', async () => {
    const { createWorldInfoEditorUi } = await import('../public/scripts/world-info-editor-ui.js');
    let resolveConfirmation;
    let current = true;
    const session = {
        getSelectedWorldName: () => 'A',
        captureSelectionGuard: () => () => current,
        deleteEntries: jest.fn(),
    };
    const ui = createWorldInfoEditorUi({
        getWorldInfoWorkbenchSession: () => session,
        showLocalDialog: () => new Promise(resolve => { resolveConfirmation = resolve; }),
        t: (strings, ...values) => strings.reduce((text, part, index) => text + part + (values[index] ?? ''), ''),
    });    const operation = ui.bulkDeleteWorldInfoEntries(['1']);
    current = false;
    resolveConfirmation({ action: 'delete', values: {} });
    await expect(operation).resolves.toBe(false);
    expect(session.deleteEntries).not.toHaveBeenCalled();
});

test('move and copy require a destination and retain action semantics', async () => {
    const { createWorldInfoEditorUi } = await import('../public/scripts/world-info-editor-ui.js');
    const { setWorldNames } = await import('../public/scripts/world-info-state.js');
    setWorldNames(['A', 'B']);
    const move = jest.fn().mockResolvedValue(true);
    const showLocalDialog = jest.fn();
    const ui = createWorldInfoEditorUi({
        getWorldInfoWorkbenchSession: () => ({ getSelectedWorldName: () => 'A' }),
        loadWorldInfo: async () => ({ entries: { '1': { comment: 'entry' } } }),
        showLocalDialog, moveWorldInfoEntry: move,
        t: (strings, ...values) => strings.reduce((text, part, index) => text + part + (values[index] ?? ''), ''),
    });
    try {
        showLocalDialog.mockResolvedValueOnce(null).mockResolvedValueOnce({ action: 'move', values: { target: '' } }).mockResolvedValueOnce({ action: 'copy', values: { target: 'B' } }).mockResolvedValueOnce({ action: 'move', values: { target: 'B' } });
        expect(await ui.promptMoveOrCopyWorldInfoEntry(1)).toBe(false);
        expect(await ui.promptMoveOrCopyWorldInfoEntry(1)).toBe(false);
        expect(move).not.toHaveBeenCalled();
        expect(await ui.promptMoveOrCopyWorldInfoEntry(1)).toBe(true);
        expect(await ui.promptMoveOrCopyWorldInfoEntry(1)).toBe(true);
        expect(move.mock.calls).toEqual([['A', 'B', '1', { deleteOriginal: false }], ['A', 'B', '1', { deleteOriginal: true }]]);
        const request = showLocalDialog.mock.calls[0][0];
        expect(request.scope).toBe('world-info');
        expect(request.fields[0].value).toBe('');
        expect(request.actions.slice(0, 2).map(action => action.required)).toEqual([['target'], ['target']]);
    } finally { setWorldNames([]); }
});
