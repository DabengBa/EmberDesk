import { afterEach, expect, jest, test } from '@jest/globals';

const characters = [
    { avatar: 'a.png', name: 'A', data: { character_book: { name: 'A book', entries: [] } } },
    { avatar: 'b.png', name: 'B', data: { character_book: { name: 'B book', entries: [
        { id: 0, keys: ['lore'], content: 'depth lore', enabled: true, extensions: { position: 4, depth: 2, role: 1 } },
        { id: 1, keys: ['lore'], content: 'outlet lore', enabled: true, extensions: { position: 7 } },
    ] } } },
];
let reference;
const storage = { getItem: jest.fn(() => 'true'), setItem: jest.fn() };
jest.unstable_mockModule('../public/script.js', () => ({ characters, converter: {}, substituteParams: x => x }));
jest.unstable_mockModule('../public/scripts/util/AccountStorage.js', () => ({ accountStorage: storage }));
jest.unstable_mockModule('../public/scripts/popup.js', () => ({ callGenericPopup: jest.fn(), POPUP_RESULT: {}, POPUP_TYPE: {} }));
jest.unstable_mockModule('../public/scripts/tags.js', () => ({ tag_import_setting: {} }));
jest.unstable_mockModule('../public/scripts/extensions/regex/engine.js', () => ({ isScopedScriptsAllowed: jest.fn(), allowScopedScripts: jest.fn() }));
jest.unstable_mockModule('../public/scripts/world-info.js', () => ({ importEmbeddedWorldInfo: (...args) => reference.importEmbeddedWorldInfo(...args), world_names: [] }));
jest.unstable_mockModule('../public/scripts/world-info-state.js', () => ({ world_names: [] }));
const notifications = { info: jest.fn(), success: jest.fn(), error: jest.fn(), warning: jest.fn() };
jest.unstable_mockModule('../public/scripts/notifications.js', () => ({ default: notifications }));
jest.unstable_mockModule('../public/scripts/i18n.js', () => ({ translate: x => x, t: (s, ...v) => s.reduce((a, x, i) => a + x + (v[i] ?? ''), '') }));
const { createWorldInfoReferenceUi } = await import('../public/scripts/world-info-reference-ui.js');
const { applyImportChoices } = await import('../public/scripts/import-confirm-dialog.js');
const { convertCharacterBook } = await import('../public/scripts/world-info-converters.js');
const previousDocument = globalThis.document, previousDollar = globalThis.$;
afterEach(() => { globalThis.document = previousDocument; globalThis.$ = previousDollar; });

function fixture(control, persist = jest.fn(async () => {})) {
    const change = jest.fn();
    globalThis.document = { querySelector: () => control, querySelectorAll: () => [], getElementById: () => ({ value: '', dispatchEvent: change }) };
    let release;
    const saved = new Promise(resolve => { release = resolve; });
    const save = jest.fn(() => saved);
    reference = createWorldInfoReferenceUi({ characters, accountStorage: storage, saveWorldInfo: save,
        convertCharacterBook, updateWorldInfoList: jest.fn(), persistEmbeddedWorldLink: persist,
        getSanitizedFilename: async name => name.replaceAll('/', ''),
        t: (s, ...v) => s.reduce((a, x, i) => a + x + (v[i] ?? ''), '') });
    return { save, release, change, persist };
}

test('unified import persists the captured character even when the selected character changes', async () => {
    const control = { style: {} };
    const { save, release, persist } = fixture(control);
    expect(reference.checkEmbeddedWorld(0)).toBe(true);
    expect(control.style.display).not.toBe('none');
    expect(reference.checkEmbeddedWorld(-1)).toBe(false);
    // Exercise an existing numeric draft sentinel as the previous identity.
    control.worldInfoChid = -1;
    const pending = applyImportChoices(characters[1], { importWorldBook: true });
    await Promise.resolve();
    expect(save).toHaveBeenCalledWith('B book', expect.objectContaining({
        entries: {
            0: expect.objectContaining({ content: 'depth lore', position: 0, depth: 2, role: 1 }),
            1: expect.objectContaining({ content: 'outlet lore', position: 0 }),
        },
    }), true);
    expect(characters[1].data.character_book.entries.map(entry => entry.extensions.position)).toEqual([4, 7]);
    reference.checkEmbeddedWorld(0);
    expect(persist).not.toHaveBeenCalled();
    release();
    await pending;
    expect(persist).toHaveBeenCalledWith(characters[1], 'B book');
    expect(control.worldInfoChid).toBe(0);
    expect(save).toHaveBeenCalledTimes(1);
});

test('saved book with a failed character update is not reported as linked', async () => {
    notifications.success.mockClear();
    const { release } = fixture({ style: {}, worldInfoChid: 1 }, jest.fn(async () => { throw new Error('conflict'); }));
    const pending = reference.importEmbeddedWorldInfo(true);
    release();
    await pending;
    expect(notifications.warning).toHaveBeenCalled();
    expect(notifications.success).not.toHaveBeenCalled();
});

test('unified import works without a legacy import control', async () => {
    const { persist, release } = fixture(null);
    const pending = applyImportChoices(characters[1], { importWorldBook: true });
    release();
    await pending;
    expect(persist).toHaveBeenCalledWith(characters[1], 'B book');
});

test('embedded import uses the sanitized name for both the saved book and the character binding', async () => {
    const { persist, release, save } = fixture(null);
    const pending = reference.importEmbeddedWorldInfo(true, characters[0], { ...characters[0].data.character_book, name: 'A/B' });
    release();
    expect(await pending).toBe(true);
    expect(save).toHaveBeenCalledWith('AB', expect.anything(), true);
    expect(persist).toHaveBeenCalledWith(characters[0], 'AB');
});

test('unified import leaves a replacement control untouched', async () => {
    const first = { style: {}, worldInfoChid: 0 };
    const { release } = fixture(first);
    const pending = applyImportChoices(characters[1], { importWorldBook: true });
    const replacement = { style: {} };
    globalThis.document.querySelector = () => replacement;
    release();
    await pending;
    expect(replacement.worldInfoChid).toBeUndefined();
});
