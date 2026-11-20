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
jest.unstable_mockModule('../public/scripts/notifications.js', () => ({ default: { info: jest.fn(), success: jest.fn() } }));
jest.unstable_mockModule('../public/scripts/i18n.js', () => ({ translate: x => x, t: (s, ...v) => s.reduce((a, x, i) => a + x + (v[i] ?? ''), '') }));
const { createWorldInfoReferenceUi } = await import('../public/scripts/world-info-reference-ui.js');
const { applyImportChoices } = await import('../public/scripts/import-confirm-dialog.js');
const { convertCharacterBook } = await import('../public/scripts/world-info-converters.js');
const previousDocument = globalThis.document, previousDollar = globalThis.$;
afterEach(() => { globalThis.document = previousDocument; globalThis.$ = previousDollar; });

function fixture(control) {
    const change = jest.fn();
    globalThis.document = { querySelector: () => control, querySelectorAll: () => [], getElementById: () => ({ value: '', dispatchEvent: change }) };
    let release;
    const saved = new Promise(resolve => { release = resolve; });
    const save = jest.fn(() => saved);
    reference = createWorldInfoReferenceUi({ characters, accountStorage: storage, saveWorldInfo: save,
        convertCharacterBook, updateWorldInfoList: jest.fn(),
        t: (s, ...v) => s.reduce((a, x, i) => a + x + (v[i] ?? ''), '') });
    return { save, release, change };
}

test('unified import uses real embedded consumer, keeps captured character through await and restores previous sentinel', async () => {
    const control = { style: {} };
    const { save, release, change } = fixture(control);
    expect(reference.checkEmbeddedWorld(0)).toBe(true);
    expect(control.style.display).not.toBe('none');
    expect(reference.checkEmbeddedWorld(-1)).toBe(false);
    // Exercise an existing numeric draft sentinel as the previous identity.
    control.worldInfoChid = -1;
    const pending = applyImportChoices(characters[1], { importWorldBook: true });
    expect(save).toHaveBeenCalledWith('B book', expect.objectContaining({
        entries: {
            0: expect.objectContaining({ content: 'depth lore', position: 0, depth: 2, role: 1 }),
            1: expect.objectContaining({ content: 'outlet lore', position: 0 }),
        },
    }), true);
    expect(characters[1].data.character_book.entries.map(entry => entry.extensions.position)).toEqual([4, 7]);
    expect(control.worldInfoChid).toBe(1);
    reference.checkEmbeddedWorld(0);
    release();
    await pending;
    expect(change.mock.calls[0][0]).toMatchObject({ type: 'change', bubbles: true });
    expect(control.worldInfoChid).toBe(-1);
    await reference.importEmbeddedWorldInfo(true);
    expect(save).toHaveBeenCalledTimes(1);
});

test('undefined previous identity retains imported chid, matching jQuery undefined setter; missing control is a no-op', async () => {
    const control = { style: {} };
    const { save, release } = fixture(control);
    await reference.importEmbeddedWorldInfo(true);
    expect(save).not.toHaveBeenCalled();
    const pending = applyImportChoices(characters[0], { importWorldBook: true });
    release();
    await pending;
    expect(control.worldInfoChid).toBe(0);
    const missing = fixture(null);
    await applyImportChoices(characters[1], { importWorldBook: true });
    expect(missing.save).not.toHaveBeenCalled();
});

test('unified import restores identity on the current control if it was replaced while saving', async () => {
    const first = { style: {}, worldInfoChid: 0 };
    const { release } = fixture(first);
    const pending = applyImportChoices(characters[1], { importWorldBook: true });
    const replacement = { style: {} };
    globalThis.document.querySelector = () => replacement;
    release();
    await pending;
    expect(replacement.worldInfoChid).toBe(0);
});
