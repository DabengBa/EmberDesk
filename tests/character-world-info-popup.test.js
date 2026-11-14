import { beforeEach, expect, jest, test } from '@jest/globals';

const mount = jest.fn();
const load = jest.fn(async () => ({ mountCharacterWorldInfoEditor: mount }));
jest.unstable_mockModule('../public/scripts/workspace-panels-react-bridge.js', () => ({ loadWorkspacePanelsModule: load }));
jest.unstable_mockModule('../public/scripts/events.js', () => ({ eventSource: { emit: jest.fn() }, event_types: {} }));
jest.unstable_mockModule('../public/scripts/character-authoring.js', () => ({ buildCharacterAuthoringFormData: jest.fn(), getCharacterAuthoringWriteUrl: jest.fn() }));
jest.unstable_mockModule('../public/scripts/character-list-state.js', () => ({ getCharacterDeleteCandidates: jest.fn(), shouldRefreshCharacterAfterEdit: jest.fn() }));
jest.unstable_mockModule('../public/scripts/request-context.js', () => ({ getRequestHeaders: jest.fn() }));
jest.unstable_mockModule('../public/scripts/world-info-state.js', () => ({ world_info: {}, world_names: [], selected_world_info: [] }));

const { registerCharacterLifecycleShellContext } = await import('../public/scripts/character-lifecycle-shell-context.js');
const { openCharacterWorldPopup } = await import('../public/scripts/character-lifecycle-service.js');
let state, shell, props, finish, cleanup, draftIdentity;

beforeEach(() => {
    const character = { avatar: 'alice.png', data: { name: 'Alice', extensions: { world: '1' } } };
    state = { menu_type: 'edit', this_chid: 0, characters: [character], create_save: {}, world_names: ['1', 'Lore'], world_info: { charLore: [{ name: 'alice', extraBooks: ['Lore'] }] } };
    draftIdentity = {};
    cleanup = jest.fn();
    mount.mockReset().mockImplementation((_host, options) => { props = options; return cleanup; });
    load.mockReset().mockImplementation(async () => ({ mountCharacterWorldInfoEditor: mount }));
    shell = {
        state, getCurrentCharacterAuthoringMode: () => state.menu_type === 'create' ? 'create' : 'edit',
        getCurrentCharacterAuthoringSource: () => state.characters[state.this_chid],
        getCharacterWorldDraftIdentity: () => draftIdentity,
        getCharaFilename: () => 'alice', unshallowCharacter: jest.fn(async () => {}),
        charUpdatePrimaryWorld: jest.fn(async () => {}), charSetAuxWorlds: jest.fn(),
        Popup: class { async show() { await new Promise(resolve => { finish = resolve; }); } }, POPUP_TYPE: { TEXT: 1 },
    };
    registerCharacterLifecycleShellContext(shell);
    const legacy = { data: () => 0, clone() { return this; }, find() { return this; }, text() { return this; }, append() { return this; }, on() { return this; } };
    globalThis.$ = () => legacy;
    globalThis.Option = class {};
    globalThis.document = { createElement: () => ({}) };
    globalThis.toastr = { error: jest.fn() };
});

async function opened() {
    const result = openCharacterWorldPopup();
    for (let i = 0; i < 8 && !props; i++) await Promise.resolve();
    return result;
}

test('uses names and original filename for immediate primary and auxiliary writes, then unmounts', async () => {
    props = undefined;
    const result = opened();
    for (let i = 0; i < 8 && !props; i++) await Promise.resolve();
    expect(props.primaryWorld).toBe('1');
    expect(props.auxWorlds).toEqual(['Lore']);
    await props.onPrimaryChange('Lore');
    await props.onAuxChange(['1']);
    expect(shell.charUpdatePrimaryWorld).toHaveBeenCalledWith('Lore');
    expect(shell.charSetAuxWorlds).toHaveBeenCalledWith('alice', ['1']);
    finish();
    await result;
    expect(cleanup).toHaveBeenCalledTimes(1);
});

test('rejects delayed commands after character or create draft changes', async () => {
    props = undefined;
    let result = opened();
    for (let i = 0; i < 8 && !props; i++) await Promise.resolve();
    state.characters[0] = { avatar: 'other.png' };
    await expect(props.onPrimaryChange('Lore')).rejects.toThrow();
    await expect(props.onAuxChange(['1'])).rejects.toThrow();
    expect(shell.charUpdatePrimaryWorld).not.toHaveBeenCalled();
    expect(shell.charSetAuxWorlds).not.toHaveBeenCalled();
    finish(); await result;
    state.menu_type = 'create'; props = undefined;
    result = opened();
    for (let i = 0; i < 8 && !props; i++) await Promise.resolve();
    draftIdentity = {};
    await expect(props.onAuxChange(['1'])).rejects.toThrow();
    expect(shell.charSetAuxWorlds).not.toHaveBeenCalled();
    finish(); await result;
});

test('accepts a refreshed card for the same character and editor session', async () => {
    props = undefined;
    const result = opened();
    for (let i = 0; i < 8 && !props; i++) await Promise.resolve();
    state.characters[0] = structuredClone(state.characters[0]);
    await expect(props.onPrimaryChange('Lore')).resolves.toBeUndefined();
    state.characters[0] = structuredClone(state.characters[0]);
    await expect(props.onAuxChange(['1'])).resolves.toBeUndefined();
    expect(shell.charUpdatePrimaryWorld).toHaveBeenCalledWith('Lore');
    expect(shell.charSetAuxWorlds).toHaveBeenCalledWith('alice', ['1']);
    draftIdentity = {};
    await expect(props.onAuxChange(['Lore'])).rejects.toThrow('Character changed');
    expect(shell.charSetAuxWorlds).toHaveBeenCalledTimes(1);
    finish(); await result;
});

test('does not mount when the selected character changes during unshallow', async () => {
    props = undefined;
    let resolve;
    shell.unshallowCharacter.mockImplementation(() => new Promise(r => { resolve = r; }));
    const result = openCharacterWorldPopup();
    state.characters[0] = { avatar: 'other.png' };
    resolve();
    await result;
    expect(mount).not.toHaveBeenCalled();
    expect(toastr.error).toHaveBeenCalled();
});

test('does not mount if the selected character changes while the module loads', async () => {
    props = undefined;
    let resolve;
    load.mockImplementation(() => new Promise(r => { resolve = r; }));
    const result = openCharacterWorldPopup();
    for (let i = 0; i < 8 && !resolve; i++) await Promise.resolve();
    state.characters[0] = { avatar: 'other.png' };
    resolve({ mountCharacterWorldInfoEditor: mount });
    await result;
    expect(mount).not.toHaveBeenCalled();
    expect(toastr.error).toHaveBeenCalled();
});

test('reports a missing create identity instead of accepting an untracked draft', async () => {
    state.menu_type = 'create';
    delete shell.getCharacterWorldDraftIdentity;
    await expect(openCharacterWorldPopup()).resolves.toBeUndefined();
    expect(mount).not.toHaveBeenCalled();
    expect(toastr.error).toHaveBeenCalled();
});

test('rejects an unavailable create identity and a switch during primary save', async () => {
    state.menu_type = 'create';
    draftIdentity = null;
    await openCharacterWorldPopup();
    expect(mount).not.toHaveBeenCalled();
    expect(toastr.error).toHaveBeenCalled();

    state.menu_type = 'edit';
    let resolve;
    shell.charUpdatePrimaryWorld.mockImplementation(() => new Promise(r => { resolve = r; }));
    props = undefined;
    const result = opened();
    for (let i = 0; i < 8 && !props; i++) await Promise.resolve();
    const saving = props.onPrimaryChange('Lore');
    state.this_chid = 1;
    resolve();
    await expect(saving).rejects.toThrow('Character changed');
    finish(); await result;
});

test('unmounts and reports errors when popup display fails', async () => {
    shell.Popup = class { async show() { throw new Error('display failed'); } };
    await openCharacterWorldPopup();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(toastr.error).toHaveBeenCalledWith('display failed');
});

test('primary completion does not repaint a newly opened session of the same character', async () => {
    const { createWorldInfoBookCommands } = await import('../public/scripts/world-info-book-commands.js');
    globalThis.$ = () => ({ val: () => '' });
    let resolve;
    const paint = jest.fn();
    const commands = createWorldInfoBookCommands({
        characters: state.characters, getCurrentShellCharacterId: () => 0,
        getCurrentShellMenuType: () => 'edit', getCharacterWorldDraftIdentity: () => draftIdentity,
        createOrEditCharacter: () => new Promise(done => { resolve = done; }),
        setWorldInfoButtonClass: paint,
    });
    const saving = commands.charUpdatePrimaryWorld('Lore');
    draftIdentity = {};
    resolve();
    await saving;
    expect(paint).not.toHaveBeenCalled();
});

test('delegates actual command owner semantics for embedded primary and debounced auxiliary changes', async () => {
    const { createWorldInfoBookCommands } = await import('../public/scripts/world-info-book-commands.js');
    const { world_info } = await import('../public/scripts/world-info-state.js');
    Object.assign(world_info, state.world_info);
    state.world_info = world_info;
    const values = { '#character_world': 'Lore', '#character_json_data': JSON.stringify({ data: { character_book: { entries: [] } } }) };
    globalThis.$ = selector => selector === '#set_character_world' ? { data: () => 0 } : {
        val(value) { if (value !== undefined) values[selector] = value; return values[selector]; },
    };
    toastr.info = jest.fn();
    const saveCharacter = jest.fn(async () => {});
    const saveSettings = jest.fn();
    const commands = createWorldInfoBookCommands({
        getCurrentShellMenuType: () => state.menu_type, create_save: state.create_save,
        createOrEditCharacter: saveCharacter, setWorldInfoButtonClass: jest.fn(),
        saveSettingsDebounced: saveSettings, normalizeArray: values => [...new Set(values)],
        t: strings => strings.join(''),
    });
    shell.charUpdatePrimaryWorld = commands.charUpdatePrimaryWorld;
    shell.charSetAuxWorlds = commands.charSetAuxWorlds;
    props = undefined;
    const result = opened();
    for (let i = 0; i < 8 && !props; i++) await Promise.resolve();
    await props.onPrimaryChange('');
    expect(JSON.parse(values['#character_json_data']).data.character_book).toBeUndefined();
    expect(saveCharacter).toHaveBeenCalledTimes(1);
    await props.onAuxChange(['1']);
    expect(state.world_info.charLore).toEqual([{ name: 'alice', extraBooks: ['1'] }]);
    expect(saveSettings).toHaveBeenCalledTimes(1);
    finish(); await result;
});
