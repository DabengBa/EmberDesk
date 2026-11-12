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
        Popup: { show: { confirm: () => new Promise(resolve => { resolveConfirmation = resolve; }) } },
        t: (strings, ...values) => strings.reduce((text, part, index) => text + part + (values[index] ?? ''), ''),
    });
    const operation = ui.bulkDeleteWorldInfoEntries(['1']);
    current = false;
    resolveConfirmation(true);
    await expect(operation).resolves.toBe(false);
    expect(session.deleteEntries).not.toHaveBeenCalled();
});
