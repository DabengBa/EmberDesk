import { beforeEach, expect, jest, test } from '@jest/globals';
import fs from 'node:fs';

jest.unstable_mockModule('../public/scripts/notifications.js', () => ({ default: new Proxy({}, { get: (_target, key) => globalThis.toastr?.[key] }) }));

const emit = jest.fn(async () => {});
jest.unstable_mockModule('../public/scripts/events.js', () => ({ eventSource: { emit }, event_types: { CHARACTER_DUPLICATED: 'duplicated', CHARACTER_EDITOR_OPENED: 'editor-opened' } }));
jest.unstable_mockModule('../public/scripts/character-authoring.js', () => ({ buildCharacterAuthoringFormData: jest.fn(), getCharacterAuthoringWriteUrl: jest.fn() }));
jest.unstable_mockModule('../public/scripts/character-list-state.js', () => ({ getCharacterDeleteCandidates: jest.fn(), shouldRefreshCharacterAfterEdit: jest.fn() }));
jest.unstable_mockModule('../public/scripts/request-context.js', () => ({ getRequestHeaders: () => ({ 'Content-Type': 'application/json' }) }));
jest.unstable_mockModule('../public/scripts/workspace-panels-react-bridge.js', () => ({ loadWorkspacePanelsModule: jest.fn() }));
jest.unstable_mockModule('../public/scripts/utils.js', () => ({ escapeHtml: value => value, waitUntilCondition: jest.fn() }));
jest.unstable_mockModule('../public/scripts/world-cascade-dialog.js', () => ({ buildCascadeSectionHtml: jest.fn(), showDeleteConfirmWithCascade: jest.fn() }));
const { registerCharacterLifecycleShellContext } = await import('../public/scripts/character-lifecycle-shell-context.js');
const { selectCharacterById, duplicateCharacter, select_selected_character, runCharacterNavigation } = await import('../public/scripts/character-lifecycle-service.js');
let state, shell, order;
beforeEach(() => {
    order = [];
    state = { characters: [{ avatar: 'alice.png' }, { avatar: 'bob.png' }], this_chid: '0', chat_metadata: { old: true }, this_edit_mes_id: 4, is_send_press: false, isChatSaving: false };
    shell = {
        state, t: strings => strings.join(''), POPUP_TYPE: { CONFIRM: 1 },
        persistMainChatMessageListScrollSnapshotBeforeClear: () => order.push('scroll'),
        clearChat: jest.fn(async options => { expect(options).toEqual({ clearData: true }); order.push('clear'); }),
        setCharacterId: id => { state.this_chid = id; order.push(['id', id]); },
        setCharacterName: name => order.push(['name', name]), cancelTtsPlay: () => order.push('tts'),
        getChat: jest.fn(async () => { order.push('chat'); expect(state.this_chid).toBe('1'); expect(state.chat_metadata).toEqual({}); }),
        closeWorkspaceChildSlotHost: jest.fn(), renderTemplateAsync: jest.fn(async () => 'Confirm'),
        callGenericPopup: jest.fn(async () => true), getCharacters: jest.fn(async () => order.push('refresh')),
    };
    registerCharacterLifecycleShellContext(shell);
    emit.mockReset().mockImplementation(async (...args) => { order.push(['event', ...args]); });
    globalThis.toastr = { warning: jest.fn(), error: jest.fn(), success: jest.fn(), info: jest.fn() };
    globalThis.window = { matchMedia: () => ({ matches: true }) };
    globalThis.document = { createElement: () => ({ innerHTML: '' }) };
    globalThis.$ = value => value;
    globalThis.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ path: 'copy.png' }) }));
});

test('selection keeps scroll, clear, state and chat-load order under the lifecycle owner', async () => {
    await selectCharacterById('1');
    expect(order).toEqual(['scroll', 'clear', ['id', undefined], ['name', ''], 'tts', ['id', '1'], 'chat']);
    expect(state.this_edit_mes_id).toBeUndefined();
    expect(state.selected_button).toBe('character_edit');
    expect(shell.closeWorkspaceChildSlotHost).toHaveBeenCalledWith('right-nav-panel');
});

test('new navigation selects and requests authoring before clearing the heading and tag draft', () => {
    shell.select_rm_create = () => order.push(`select:${state.selected_button}`);
    shell.queueReactCharacterAuthoringRemount = () => order.push('remount');
    shell.clearDraftCharacterTags = () => order.push('tags');
    globalThis.document.getElementById = id => id === 'rm_button_selected_ch' ? {
        querySelectorAll: () => [{ set textContent(value) { order.push(`heading:${value}`); } }],
    } : null;
    runCharacterNavigation('create');
    expect(order).toEqual(['select:create', 'remount', 'heading:', 'tags']);
});

test.each(['present', 'deleted', 'unset'])('current navigation selects or falls back and clears search with a bubbling input (%s)', condition => {
    const previousInput = globalThis.HTMLInputElement;
    class Input extends EventTarget { value = 'Alice'; }
    globalThis.HTMLInputElement = Input;
    const search = new Input();
    const input = jest.fn(() => order.push(['input', search.value]));
    search.addEventListener('input', input);
    state.this_chid = condition === 'present' ? '0' : condition === 'deleted' ? '99' : undefined;
    state.accountStorage = { setItem: jest.fn((...args) => order.push(['preference', ...args])) };
    Object.assign(shell, {
        select_rm_characters: jest.fn(() => order.push(['list', state.selected_button])),
        select_rm_create: jest.fn(() => order.push(['editor', state.selected_button])),
        setMenuType: jest.fn(), queueReactCharacterAuthoringRemount: jest.fn(),
        setTemporaryChatStatus: jest.fn(), updateFavButtonState: jest.fn(),
        timestampToMoment: () => ({ toISOString: () => '' }), formatCreatorNotes: () => '',
        getThumbnailUrl: () => '', setWorldInfoButtonClass: jest.fn(), checkEmbeddedWorld: jest.fn(),
        getCharacterSource: () => null, saveSettingsDebounced: jest.fn(),
    });
    globalThis.document = { getElementById: id => id === 'character_search_bar' ? search : null, querySelectorAll: () => [] };
    try {
        runCharacterNavigation('current');
        expect(state.selected_button).toBe(condition === 'present' ? 'character_edit' : 'characters');
        if (condition === 'present') {
            expect(shell.select_rm_create).toHaveBeenCalledTimes(1);
            expect(shell.queueReactCharacterAuthoringRemount).toHaveBeenCalledTimes(1);
            expect(emit).toHaveBeenCalledWith('editor-opened', '0');
            expect(shell.select_rm_characters).not.toHaveBeenCalled();
        } else {
            expect(shell.select_rm_characters).toHaveBeenCalledTimes(1);
            expect(shell.select_rm_create).not.toHaveBeenCalled();
        }
        expect(search.value).toBe('');
        expect(input).toHaveBeenCalledTimes(1);
        expect(input.mock.calls[0][0]).toMatchObject({ type: 'input', bubbles: true });
        expect(order.at(-2)).toEqual(['input', '']);
        expect(order.at(-1)).toEqual(['preference', 'SelectedNavTab', 'rm_button_selected_ch']);
        runCharacterNavigation('current');
        expect(input).toHaveBeenCalledTimes(1);
    } finally {
        if (previousInput === undefined) delete globalThis.HTMLInputElement;
        else globalThis.HTMLInputElement = previousInput;
    }
});

test.each([['characters', true], ['back', false]])('%s navigation opens the list with its own preference semantics', (action, storesPreference) => {
    shell.select_rm_characters = jest.fn(() => order.push(state.selected_button));
    state.accountStorage = { setItem: jest.fn() };
    runCharacterNavigation(action);
    expect(order).toEqual(['characters']);
    if (storesPreference) expect(state.accountStorage.setItem).toHaveBeenCalledWith('SelectedNavTab', 'rm_button_characters');
    else expect(state.accountStorage.setItem).not.toHaveBeenCalled();
});

test.each(['missing', 'saving', 'generating'])('selection leaves state untouched while %s', async condition => {
    state.isChatSaving = condition === 'saving';
    state.is_send_press = condition === 'generating';
    await selectCharacterById(condition === 'missing' ? '99' : '1');
    expect(order).toEqual([]);
    expect(state.this_chid).toBe('0');
});

test('confirmed duplication retains the original avatar across a selection change and emits before refresh', async () => {
    shell.callGenericPopup.mockImplementation(async () => { state.this_chid = '1'; return true; });
    expect(await duplicateCharacter()).toBe('copy.png');
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ avatar_url: 'alice.png' });
    expect(order).toEqual([['event', 'duplicated', { oldAvatar: 'alice.png', newAvatar: 'copy.png' }], 'refresh']);
});

test('silent duplication skips confirmation and failed requests do not emit or refresh', async () => {
    fetch.mockResolvedValue({ ok: false });
    expect(await duplicateCharacter({ avatar: 'bob.png', silent: true })).toBe('');
    expect(shell.callGenericPopup).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
    expect(shell.getCharacters).not.toHaveBeenCalled();
    expect(toastr.error).toHaveBeenCalled();
});

test('cancelled or missing duplication never sends a request', async () => {
    shell.callGenericPopup.mockResolvedValue(false);
    expect(await duplicateCharacter()).toBe('');
    expect(await duplicateCharacter({ avatar: 'missing.png' })).toBe('');
    expect(fetch).not.toHaveBeenCalled();
});

test('duplication confirmation uses a native popup element and preserves cancellation', async () => {
    const oldDocument = globalThis.document, oldDollar = globalThis.$;
    const host = { innerHTML: '' };
    globalThis.document = { createElement: jest.fn(() => host) };
    globalThis.$ = () => { throw new Error('duplication confirmation must not use jQuery'); };
    shell.renderTemplateAsync.mockResolvedValue('<div>Confirm</div>');
    shell.callGenericPopup.mockResolvedValue(false);
    try {
        expect(await duplicateCharacter()).toBe('');
        expect(host.innerHTML).toBe('<div>Confirm</div>');
        expect(shell.callGenericPopup).toHaveBeenCalledWith(host, 1);
        expect(fetch).not.toHaveBeenCalled();
        expect(emit).not.toHaveBeenCalled();
    } finally { globalThis.document = oldDocument; globalThis.$ = oldDollar; }
});

test('selecting a character refreshes the React-owned active row and authoring mirrors without mutating rows', async () => {
    const { transformWithOxc } = await import('vite');
    const source = fs.readFileSync(new URL('../app/lib/character-library-row-helpers.ts', import.meta.url), 'utf8');
    const compiled = await transformWithOxc(source, 'character-library-row-helpers.ts');
    const { projectCharacterEntityToRowModel, buildCharacterRowClassName } = await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString('base64')}`);
    const projections = [];
    Object.assign(state.characters[0], {
        name: 'Alice', description: 'Biography', avatar: 'alice.png', first_mes: 'Hello',
        chat: null, create_date: 'original', json_data: '{"a":1}', scenario: undefined,
        data: { creator_notes: 'Notes', tags: ['one', 'two'], extensions: { world: 'Lore', depth_prompt: { depth: 0, role: 0 } } },
    });
    Object.assign(shell, {
        setTemporaryChatStatus: jest.fn(), select_rm_create: jest.fn(),
        updateFavButtonState: jest.fn(), timestampToMoment: () => ({ toISOString: () => 'iso-date' }),
        formatCreatorNotes: jest.fn(notes => `<p>${notes}</p>`), getThumbnailUrl: () => '/alice.png',
        setWorldInfoButtonClass: jest.fn(), checkEmbeddedWorld: jest.fn(),
        getCharacterSource: () => 'local', saveSettingsDebounced: jest.fn(),
        syncReactCharacterLibraryToolbarState: jest.fn(() => {
            projections.push(state.characters.map((item, id) => {
                const row = projectCharacterEntityToRowModel({ type: 'character', id, item }, { activeCharacterId: state.this_chid });
                return buildCharacterRowClassName({ isFav: row.isFav, isActive: row.isActive }).includes(' is_active');
            }));
        }),
    });
    const ids = ['add_avatar_button', 'character_name_pole', 'description_textarea', 'creator_notes_textarea',
        'character_version_textarea', 'system_prompt_textarea', 'post_history_instructions_textarea', 'tags_textarea',
        'creator_textarea', 'firstmessage_textarea', 'scenario_pole', 'depth_prompt_prompt', 'depth_prompt_depth',
        'depth_prompt_role', 'selected_chat_pole', 'create_date_pole', 'avatar_url_pole', 'chat_import_avatar_url',
        'chat_import_character_name', 'character_json_data'];
    const elements = Object.fromEntries(ids.map(id => [id, { value: 'unchanged' }]));
    elements.rm_print_characters_block = { dataset: { reactCharacterLibraryOwner: 'react' }, querySelectorAll: () => { throw new Error('React rows must not be mutated'); } };
    const world = { dataset: {} }; elements.set_character_world = world;
    for (const id of ['delete_button', 'export_button', 'world_button', 'rm_button_back', 'create_button_label', 'renameCharButton']) {
        elements[id] = { style: {} };
    }
    elements.create_button = { setAttribute(name, value) { this[name] = value; } };
    elements['character_popup-button-h3'] = { textContent: '' };
    const legacyHeading = { textContent: '' };
    elements.rm_button_selected_ch = { querySelectorAll: () => [legacyHeading] };
    elements.avatar_load_preview = { setAttribute(name, value) { this[name] = value; } };
    elements.creator_notes_spoiler = { innerHTML: 'old notes' };
    elements.character_world = { value: 'previous', dispatchEvent: jest.fn() };
    elements.name_div = { classList: { add: jest.fn(), remove: jest.fn() } };
    elements.form_create = { setAttribute: jest.fn() };
    elements.character_source = { setAttribute: jest.fn(), removeAttribute: jest.fn() };
    const nativeSelectors = ['delete_button', 'export_button', 'world_button', 'rm_button_back', 'create_button',
        'create_button_label', 'renameCharButton', 'character_popup-button-h3', 'rm_button_selected_ch', 'avatar_load_preview',
        'name_div', 'form_create', 'character_source', 'creator_notes_spoiler', 'character_world'];
    const greetingControls = [{ dataset: {} }, { dataset: {} }];
    const editAction = { style: { display: 'none' }, nodeName: 'OPTION', isConnected: true };
    const duplicate = { style: { display: 'none' }, nodeName: 'BUTTON', isConnected: true };
    const settings = { style: { display: 'none' }, nodeName: 'OPTION', isConnected: true };
    const chatLore = { style: { display: 'none' }, nodeName: 'BUTTON', isConnected: true };
    const visibility = { '#dupe_button': [duplicate], '.character-detail-edit-action': [editAction], '#set_chat_character_settings': [settings], '.form_create_bottom_buttons_block .chat_lorebook_button': [chatLore] };
    const ownerDocument = { defaultView: { getComputedStyle: element => ({ display: element.style.display || (element === editAction ? 'none' : 'inline-block') }) }, body: { appendChild: node => node, removeChild: () => {} }, createElement: tag => ({ nodeName: tag, style: {} }) };
    for (const element of [editAction, duplicate, settings, chatLore]) element.ownerDocument = ownerDocument;
    globalThis.document = {
        getElementById: id => elements[id] ?? null,
        querySelectorAll: selector => selector === '.open_alternate_greetings' ? greetingControls : visibility[selector] ?? [],
    };
    const chain = new Proxy({}, { get: (_target, prop) => prop === 'data' ? () => chain : () => chain });
    globalThis.$ = selector => {
        if (selector.includes('character_select') || selector.startsWith('#CharID')) throw new Error('React row must not use jQuery');
        if (selector === '.open_alternate_greetings') throw new Error('greeting identity must not use jQuery');
        if (selector in visibility) throw new Error('selection visibility must not use jQuery');
        if ([...ids, ...nativeSelectors].some(id => selector === `#${id}`)) throw new Error(`authoring mirror uses jQuery: ${selector}`);
        return chain;
    };
    select_selected_character('0', { switchMenu: false });
    expect(duplicate.style.display).toBe('');
    expect(settings.style.display).toBe('');
    expect(editAction.style.display).toBe('inline-block');
    expect(chatLore.style.display).toBe('');
    expect(shell.syncReactCharacterLibraryToolbarState).toHaveBeenCalledTimes(1);
    expect(projections).toEqual([[true, false]]);
    expect(elements.character_name_pole.value).toBe('Alice');
    expect(elements.description_textarea.value).toBe('Biography');
    expect(elements.tags_textarea.value).toBe('one, two');
    expect(elements.scenario_pole.value).toBe('');
    expect(elements.selected_chat_pole.value).toBe('');
    expect(String(elements.depth_prompt_depth.value)).toBe('0');
    expect(elements.create_date_pole.value).toBe('iso-date');
    expect(elements.character_json_data.value).toBe('{"a":1}');
    expect(elements.creator_notes_spoiler.innerHTML).toBe('<p>Notes</p>');
    expect(shell.formatCreatorNotes).toHaveBeenCalledWith('Notes', 'alice.png');
    expect(elements.character_world.value).toBe('Lore');
    expect(elements.character_world.dispatchEvent).not.toHaveBeenCalled();
    expect(elements.delete_button.style.display).toBe('flex');
    expect(elements.rm_button_back.style.display).toBe('none');
    expect(elements.create_button.value).toBe('Save');
    expect(legacyHeading.textContent).toBe('Alice');
    expect(elements['character_popup-button-h3'].textContent).toBe('Alice');
    expect(elements.avatar_load_preview.src).toBe('/alice.png');
    expect(elements.name_div.classList.remove).toHaveBeenCalledWith('displayBlock');
    expect(elements.name_div.classList.add).toHaveBeenCalledWith('displayNone');
    expect(elements.form_create.setAttribute).toHaveBeenCalledWith('actiontype', 'editcharacter');
    expect(elements.character_source.removeAttribute).toHaveBeenCalledWith('disabled');
    shell.getCharacterSource = () => null;
    state.characters[0].data.extensions.world = null;
    state.characters[0].data.creator_notes = '';
    state.characters[0].creatorcomment = 'Legacy notes';
    select_selected_character('0', { switchMenu: false });
    expect(elements.character_world.value).toBe('');
    expect(elements.character_world.dispatchEvent).not.toHaveBeenCalled();
    expect(shell.formatCreatorNotes).toHaveBeenLastCalledWith('Legacy notes', 'alice.png');
    expect(elements.creator_notes_spoiler.innerHTML).toBe('<p>Legacy notes</p>');
    expect(elements.character_source.setAttribute).toHaveBeenCalledWith('disabled', 'disabled');
    expect(world.dataset.chid).toBe('0');
    expect(greetingControls.map(control => control.dataset.chid)).toEqual(['0', '0']);
    expect(shell.setWorldInfoButtonClass).toHaveBeenCalledWith('0');
    state.this_chid = '1';
    select_selected_character('1', { switchMenu: false });
    expect(greetingControls.map(control => control.dataset.chid)).toEqual(['1', '1']);
    expect(projections.at(-1)).toEqual([false, true]);
    const count = projections.length;
    expect(select_selected_character('99', { switchMenu: false })).toBe(false);
    expect(projections).toHaveLength(count);
    elements.rm_print_characters_block.dataset.reactCharacterLibraryOwner = '';
    const classes = initial => ({ values: new Set(initial), add(name) { this.values.add(name); }, remove(name) { this.values.delete(name); } });
    const row0 = { classList: classes(['character_select']) }, row1 = { classList: classes(['character_select', 'is_active']) };
    elements.rm_print_characters_block.querySelectorAll = selector => selector === '.character_select' ? [row0, row1] : [];
    elements.CharID0 = row0;
    globalThis.$ = () => { throw new Error('non-React selection rows must not use jQuery'); };
    select_selected_character('0', { switchMenu: false });
    expect(row0.classList.values.has('is_active')).toBe(true);
    expect(row1.classList.values.has('is_active')).toBe(false);
    expect(projections).toHaveLength(count);
});
