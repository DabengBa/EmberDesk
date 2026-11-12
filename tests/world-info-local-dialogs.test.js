import { afterEach, expect, jest, test } from '@jest/globals';

jest.unstable_mockModule('../public/scripts/i18n.js', () => ({ translate: text => text }));

const t = (strings, ...values) => strings.reduce((text, part, index) => text + part + (values[index] ?? ''), '');
const originalFetch = globalThis.fetch;
const originalDocument = globalThis.document;
const originalToastr = globalThis.toastr;

afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.document = originalDocument;
    globalThis.toastr = originalToastr;
});

async function setup({ bound, deleteResult = true, responseOk = true }) {
    const { createWorldInfoBookUi } = await import('../public/scripts/world-info-book-ui.js');
    const { setWorldInfo } = await import('../public/scripts/world-info-state.js');
    const world_info = { charLore: [{ name: 'character', extraBooks: ['A'] }] };
    setWorldInfo(world_info);
    globalThis.toastr = { error: jest.fn() };
    globalThis.document = { getElementById: () => ({ checked: true }), querySelectorAll: () => [] };
    globalThis.fetch = jest.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ worldInfos: bound ? [{ name: 'A', entryCount: 1, boundCharacters: ['character'], deleteCandidateAvatars: [] }] : [] }) })
        .mockResolvedValueOnce({ ok: responseOk });
    class Popup {
        constructor(_content, _type, _input, options) { this.options = options; this.okButton = { classList: { add() {} } }; }
        async show() { this.options.onClosing?.(); return 1; }
    }
    const flush = jest.fn();
    const save = jest.fn();
    const remove = jest.fn().mockResolvedValue(deleteResult);
    const showLocalDialog = jest.fn().mockResolvedValue({ action: 'delete', values: { 'world-0': true, clearReferences: true } });
    const ui = createWorldInfoBookUi({
        getSelectedWorldInfoEditorName: () => 'A', getRequestHeaders: () => ({}), t,
        Popup, POPUP_TYPE: { CONFIRM: 1 }, POPUP_RESULT: { NEGATIVE: 0, CUSTOM1: 2 },
        PopupUtils: { BuildTextWithHeader: () => '' }, buildCascadeSectionHtml: () => '',
        captureCascadeChoices: () => ({ deleteWorlds: ['A'] }),
        showLocalDialog, flushDeletedWorldsFromUI: flush, saveSettingsDebounced: save, deleteWorldInfo: remove,
    });
    return { ui, world_info, flush, save, remove, showLocalDialog };
}

test('cascade HTTP failure does not flush or report deletion success', async () => {
    const { ui, flush, remove } = await setup({ bound: true, responseOk: false });
    expect(await ui.deleteCurrentWorldInfo()).toBe(false);
    expect(flush).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
});

test('ordinary deletion failure preserves auxiliary references and reports failure', async () => {
    const { ui, world_info, save } = await setup({ bound: false, deleteResult: false });
    expect(await ui.deleteCurrentWorldInfo()).toBe(false);
    expect(world_info.charLore[0].extraBooks).toEqual(['A']);
    expect(save).not.toHaveBeenCalled();
});

test('cascade selection, cancel and all preserve the chosen operations', async () => {
    const { ui, flush, remove, showLocalDialog } = await setup({ bound: true });
    showLocalDialog.mockResolvedValueOnce(null);
    expect(await ui.deleteCurrentWorldInfo()).toBe(false);
    expect(remove).not.toHaveBeenCalled();
    expect(flush).not.toHaveBeenCalled();
    globalThis.fetch.mockReset().mockResolvedValueOnce({ ok: true, json: async () => ({ worldInfos: [{ name: 'A', entryCount: 1, boundCharacters: ['character'], deleteCandidateAvatars: [] }, { name: 'B', entryCount: 2, boundCharacters: [], deleteCandidateAvatars: [] }] }) }).mockResolvedValueOnce({ ok: true });
    showLocalDialog.mockResolvedValueOnce({ action: 'all', values: { 'world-0': false, 'world-1': false, clearReferences: true } });
    expect(await ui.deleteCurrentWorldInfo()).toBe(true);
    expect(JSON.parse(globalThis.fetch.mock.calls[1][1].body)).toEqual({ worlds: ['A', 'B'], clear_references: true });
    expect(flush).toHaveBeenCalledWith(['A', 'B']);
    const request = showLocalDialog.mock.calls[1][0];
    expect(request.scope).toBe('world-info');
    expect(request.fields.filter(field => field.name.startsWith('world-')).map(field => field.value)).toEqual([true, true]);
});

test('ordinary successful deletion clears references after deletion succeeds', async () => {
    const { ui, world_info, remove, save } = await setup({ bound: false });
    remove.mockImplementation(async () => { expect(world_info.charLore[0].extraBooks).toEqual(['A']); return true; });
    expect(await ui.deleteCurrentWorldInfo()).toBe(true);
    expect(world_info.charLore).toEqual([]);
    expect(save).toHaveBeenCalledTimes(1);
});

test('dialog rejection propagates without deleting', async () => {
    const { ui, remove, showLocalDialog } = await setup({ bound: false });
    const error = new Error('dialog unavailable');
    showLocalDialog.mockRejectedValueOnce(error);
    await expect(ui.deleteCurrentWorldInfo()).rejects.toBe(error);
    expect(remove).not.toHaveBeenCalled();
});
