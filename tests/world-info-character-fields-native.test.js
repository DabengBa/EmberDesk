import { afterEach, expect, jest, test } from '@jest/globals';

jest.unstable_mockModule('../public/scripts/notifications.js', () => ({ default: { info: jest.fn(), success: jest.fn() } }));
jest.unstable_mockModule('../public/scripts/i18n.js', () => ({ translate: text => text }));
const { createWorldInfoBookCommands } = await import('../public/scripts/world-info-book-commands.js');
const { createWorldInfoBookSync } = await import('../public/scripts/world-info-book-sync.js');
const { createWorldInfoReferenceUi } = await import('../public/scripts/world-info-reference-ui.js');
const state = await import('../public/scripts/world-info-state.js');
const original = { document: globalThis.document, $: globalThis.$, fetch: globalThis.fetch };
afterEach(() => { Object.assign(globalThis, original); state.setWorldNames([]); state.setSelectedWorldInfo([]); });

function fields(world = 'A', json = '{"data":{"character_book":{"entries":[]}}}') {
    const changes = [];
    const characterWorld = { value: world, dispatchEvent: event => { changes.push([event.type, event.bubbles, characterWorld.value]); return true; } };
    const characterJson = { value: json };
    globalThis.document = {
        getElementById: id => ({ character_world: characterWorld, character_json_data: characterJson })[id] ?? null,
        querySelector: selector => ({ '#character_world': characterWorld, '#character_json_data': characterJson })[selector] ?? null,
        querySelectorAll: () => [],
    };
    globalThis.$ = () => { throw new Error('character fields must not use jQuery'); };
    return { characterWorld, characterJson, changes };
}

test('primary unlink updates hidden fields before saving and strips embedded book without change', async () => {
    const f = fields();
    const save = jest.fn(async () => { expect(f.characterWorld.value).toBe(''); expect(JSON.parse(f.characterJson.value).data.character_book).toBeUndefined(); });
    const paint = jest.fn();
    const commands = createWorldInfoBookCommands({ getCurrentShellCharacterId: () => 0, characters: [{ avatar: 'a' }],
        getCurrentShellMenuType: () => 'edit', createOrEditCharacter: save, setWorldInfoButtonClass: paint, t: s => s.join('') });
    await commands.charUpdatePrimaryWorld('');
    expect(save).toHaveBeenCalledTimes(1);
    expect(paint).toHaveBeenCalledWith(undefined, false);
    expect(f.changes).toEqual([]);
});

test('draft selection updates create state without save; malformed JSON still saves', async () => {
    const f = fields('A', 'not JSON');
    let menu = 'create';
    const draft = {}, save = jest.fn(async () => {}), paint = jest.fn();
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
        const commands = createWorldInfoBookCommands({ getCurrentShellCharacterId: () => 0, characters: [{ avatar: 'a' }],
            getCurrentShellMenuType: () => menu, create_save: draft, createOrEditCharacter: save, setWorldInfoButtonClass: paint });
        await commands.charUpdatePrimaryWorld('B');
        expect(draft.world).toBe('B'); expect(f.characterWorld.value).toBe('B'); expect(save).not.toHaveBeenCalled();
        menu = 'edit';
        await commands.charUpdatePrimaryWorld('');
        expect(f.characterJson.value).toBe('not JSON'); expect(save).toHaveBeenCalledTimes(1);
        expect(error).toHaveBeenCalledWith('Failed to parse character JSON data.');
    } finally { error.mockRestore(); }
});

test('missing character fields are no-ops and undefined clears the field like jQuery val', async () => {
    fields();
    globalThis.document.getElementById = () => null;
    const save = jest.fn(async () => {});
    const commands = createWorldInfoBookCommands({ getCurrentShellMenuType: () => 'edit', createOrEditCharacter: save, setWorldInfoButtonClass: jest.fn() });
    await commands.charUpdatePrimaryWorld('Book');
    expect(save).toHaveBeenCalledTimes(1);
    const f = fields('A');
    await commands.charUpdatePrimaryWorld(undefined);
    expect(f.characterWorld.value).toBe('');
});

test('deleting linked book clears field with bubbling change before character save', async () => {
    const f = fields();
    state.setWorldNames(['A']); state.setSelectedWorldInfo([]);
    const session = { setWorldNames() {}, setSelectedWorldInfo() {} };
    const save = jest.fn(() => expect(f.changes).toEqual([['change', true, '']]));
    const sync = createWorldInfoBookSync({ getSelectedWorldInfoEditorName: () => '', getWorldInfoWorkbenchSession: () => session,
        setWorldInfoButtonClass: jest.fn(), getCurrentShellMenuType: () => 'edit', saveCharacterDebounced: save, getRequestHeaders: () => ({}) });
    globalThis.fetch = jest.fn(async () => ({ ok: false }));
    await sync.flushDeletedWorldsFromUI(['A']);
    expect(save).toHaveBeenCalledTimes(1);
});

test('embedded import persists its binding without relying on a hidden field event', async () => {
    const f = fields('');
    const control = { style: {}, worldInfoChid: 0 };
    const lookup = globalThis.document.querySelector;
    globalThis.document.querySelector = selector => selector === '#import_character_info' ? control : lookup(selector);
    const save = jest.fn(async () => { expect(f.changes).toEqual([]); });
    const character = { name: 'A', avatar: 'a', data: { character_book: { name: 'Book' } } };
    const persist = jest.fn(async () => { expect(save).toHaveBeenCalledTimes(1); });
    const ui = createWorldInfoReferenceUi({ characters: [character], persistEmbeddedWorldLink: persist,
        accountStorage: { getItem: () => 'true' }, saveWorldInfo: save, convertCharacterBook: book => book, getSanitizedFilename: async name => name,
        updateWorldInfoList: async () => {}, t: s => s.join('') });
    await ui.importEmbeddedWorldInfo(true);
    expect(persist).toHaveBeenCalledWith(character, 'Book');
    expect(f.changes).toEqual([]);
});
