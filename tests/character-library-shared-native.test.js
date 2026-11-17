import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');
function extract(start, end, context) {
    const from = source.indexOf(start), to = source.indexOf(end, from);
    expect(from).toBeGreaterThanOrEqual(0); expect(to).toBeGreaterThan(from);
    return runInNewContext(`(${source.slice(from, to).replace(/\/\*\*[\s\S]*?\*\/\s*$/, '')})`, context);
}

test('React bulk toggle follows the live list class without jQuery', () => {
    let active = false;
    let list = { classList: { contains: name => name === 'bulk_select' && active } };
    const overlay = { browseState: jest.fn(), selectState: jest.fn() };
    const context = { globalThis: {}, document: { getElementById: () => list }, characterGroupOverlay: overlay,
        $: () => { throw new Error('bulk toggle must not use jQuery'); } };
    const bridge = extract('function getReactCharacterLibraryPanelBridge()', 'async function loadReactCharacterLibraryPanelModule()', context)();
    bridge.toggleBulkEdit(); expect(overlay.selectState).toHaveBeenCalledTimes(1);
    active = true; bridge.toggleBulkEdit(); expect(overlay.browseState).toHaveBeenCalledTimes(1);
    list = null; bridge.toggleBulkEdit(); expect(overlay.selectState).toHaveBeenCalledTimes(2);
    context.characterGroupOverlay = null; bridge.toggleBulkEdit(); expect(overlay.browseState).toHaveBeenCalledTimes(1);
});

test('real favorite mirror updates selected and draft states without jQuery or input events', () => {
    const checkbox = new EventTarget(); checkbox.checked = false;
    const classes = new Set();
    const button = { classList: { toggle: (name, ...args) => (args.length ? args[0] : !classes.has(name)) ? classes.add(name) : classes.delete(name) } };
    const change = jest.fn(); checkbox.addEventListener('change', change);
    const context = { fav_ch_checked: false, document: { getElementById: id => id === 'fav_checkbox' ? checkbox : id === 'favorite_button' ? button : null },
        $: () => { throw new Error('favorite mirror must not use jQuery'); } };
    const update = extract('function updateFavButtonState(', 'export async function setCharacterSettingsOverrides()', context);
    update(true); expect(context.fav_ch_checked).toBe(true); expect(checkbox.checked).toBe(true);
    expect(classes.has('fav_on')).toBe(true); expect(classes.has('fav_off')).toBe(false);
    update(false); expect(context.fav_ch_checked).toBe(false); expect(checkbox.checked).toBe(false);
    expect(classes.has('fav_on')).toBe(false); expect(classes.has('fav_off')).toBe(true); expect(change).not.toHaveBeenCalled();
    update('true'); expect(context.fav_ch_checked).toBe('true'); expect(checkbox.checked).toBe(true);
    expect(classes.has('fav_on')).toBe(true); expect(classes.has('fav_off')).toBe(false);
    context.document.getElementById = () => null; update(true); expect(context.fav_ch_checked).toBe(true);
});

test('created character navigation scrolls and highlights its React row without jQuery', async () => {
    let timer; const list = { scrollTop: 0, getBoundingClientRect: () => ({ top: 60 }) };
    const row = { parentElement: list, getBoundingClientRect: () => ({ top: 180 }) };
    const hit = { parentElement: row }, flash = jest.fn(), request = jest.fn();
    const context = { document: { querySelector: () => hit, querySelectorAll: () => [hit] },
        $: () => { throw new Error('created character highlight must not use jQuery'); },
        toastr: { success: jest.fn(), warning: jest.fn(), error: jest.fn() }, t: x => x.join(''),
        selectRightMenuWithAnimation: jest.fn(), clearTimeout: jest.fn(), setTimeout: fn => { timer = fn; return 1; }, importFlashTimeout: null,
        getEntitiesList: () => [{ item: { avatar: 'alice.png' } }], accountStorage: { getItem: () => '10' }, per_page_default: 10,
        createCharacterListEntitySnapshot: x => x, currentCharacterListEntitySnapshot: null, requestCharacterListPage: request,
        waitUntilCondition: async fn => fn(), flashHighlight: flash, console };
    const info = extract('function select_rm_info(', 'function select_rm_create(', context);
    info('char_create', 'alice.png'); timer(); await Promise.resolve();
    expect(request).toHaveBeenCalledWith(1); expect(list.scrollTop).toBe(120); expect(flash).toHaveBeenCalledWith(row, 5000);
});

test('create mode restores authoring mirrors and presentation without jQuery or field events', () => {
    const ids = ['delete_button_div', 'delete_button', 'export_button', 'world_button', 'create_button_label', 'create_button', 'rm_button_back', 'character_import_button', 'character_popup-button-h3', 'character_name_pole', 'description_textarea', 'character_world', 'creator_notes_textarea', 'creator_notes_spoiler', 'post_history_instructions_textarea', 'system_prompt_textarea', 'tags_textarea', 'creator_textarea', 'character_version_textarea', 'firstmessage_textarea', 'scenario_pole', 'depth_prompt_prompt', 'depth_prompt_depth', 'depth_prompt_role', 'character_json_data', 'avatar_div', 'avatar_load_preview', 'renameCharButton', 'name_div', 'form_create', 'set_character_world'];
    const elements = Object.fromEntries(ids.map(id => [id, Object.assign(new EventTarget(), { value: 'old', style: {}, dataset: {}, attributes: {}, classList: { add: jest.fn(), remove: jest.fn() }, setAttribute(key, value) { this.attributes[key] = String(value); } })]));
    const change = jest.fn(); for (const el of Object.values(elements)) { el.addEventListener('input', change); el.addEventListener('change', change); }
    const context = { document: { getElementById: id => elements[id] ?? null, querySelectorAll: () => [] },
        $: () => { throw new Error('create mirrors must not use jQuery'); }, selected_button: '',
        create_save: { name: 'Alice', description: undefined, world: 'W', creator_notes: 'notes', tags: ['a', 'b'], depth_prompt_depth: 0 },
        default_avatar: 'default.png', formatCreatorNotes: notes => `<b>${notes}</b>`, DOMPurify: { sanitize: html => html }, setCharacterSelectionVisibility: jest.fn(),
        setWorldInfoButtonClass: jest.fn(), updateFavButtonState: jest.fn(), checkEmbeddedWorld: jest.fn() };
    extract('function select_rm_create(', 'function select_rm_characters(', context)({ switchMenu: false });
    expect(elements.character_name_pole.value).toBe('Alice'); expect(elements.description_textarea.value).toBe('');
    expect(elements.tags_textarea.value).toBe('a,b'); expect(elements.depth_prompt_depth.value).toBe('0');
    expect(elements.character_world.value).toBe('W'); expect(elements.creator_notes_spoiler.innerHTML).toBe('<b>notes</b>');
    expect(elements.delete_button.style.display).toBe('none'); expect(elements.avatar_div.style.display).toBe('flex');
    expect(elements.avatar_load_preview.attributes.src).toBe('default.png'); expect(elements.form_create.attributes.actiontype).toBe('createcharacter');
    expect(elements.name_div.classList.remove).toHaveBeenCalledWith('displayNone'); expect(elements.name_div.classList.add).toHaveBeenCalledWith('displayBlock');
    expect(change).not.toHaveBeenCalled();
});

test('toolbar compatibility focuses search once after repeated mounts using native delegation', () => {
    const listeners = new Set(); const focus = jest.fn();
    const document = { getElementById: id => id === 'emberdesk-react-character-search' ? { focus } : null,
        addEventListener: (type, fn) => { if (type === 'click') listeners.add(fn); },
        removeEventListener: (type, fn) => { if (type === 'click') listeners.delete(fn); } };
    const context = { document, characterLibrarySearchCompatHandler: null,
        $: () => { throw new Error('toolbar mount must not use jQuery pagination'); }, globalThis: {},
        requestCharacterListPage: jest.fn(), per_page_default: 10, CHARACTER_LIST_PAGE_SIZE_OPTIONS: [10, 25], accountStorage: { setItem: jest.fn() } };
    const ensure = extract('function ensureCharacterLibraryToolbarCompatBridges()', 'function getReactCharacterLibraryPanelBridge()', context);
    ensure(); ensure(); expect(listeners.size).toBe(1);
    for (const listener of listeners) listener({ target: { closest: selector => selector === '#rm_button_search' ? {} : null } });
    expect(focus).toHaveBeenCalledTimes(1);
    for (const listener of listeners) listener({ target: { closest: () => null } });
    expect(focus).toHaveBeenCalledTimes(1);
    const bridge = extract('function getReactCharacterLibraryPanelBridge()', 'async function loadReactCharacterLibraryPanelModule()', context)();
    bridge.setCharacterListPage(3); bridge.setCharacterListPageSize(25); bridge.setCharacterListPageSize(999);
    expect(context.requestCharacterListPage.mock.calls).toEqual([[3], [1]]);
    expect(context.accountStorage.setItem).toHaveBeenCalledWith('Characters_PerPage', '25');
});

test('React search bridge feeds the actual input handler and debounce without jQuery input access', () => {
    class Input extends EventTarget { constructor() { super(); this.value = ''; this.attributes = {}; } setAttribute(key, value) { this.attributes[key] = value; } }
    const input = new Input(), status = { hidden: true };
    const noop = { on: jest.fn(), toggle: jest.fn(), toggleClass: jest.fn() };
    let pending;
    const filter = { setFilterData: jest.fn() }, owner = jest.fn(), sync = jest.fn();
    const context = { globalThis: {}, HTMLInputElement: Input, Event, document: { getElementById: id => id === 'character_search_bar' ? input : id === 'character_search_status' ? status : null },
        $: selector => { if (selector === '#character_search_bar' || selector === '#character_search_status') throw new Error('React search input must not use jQuery'); return noop; },
        debounce: fn => value => { pending = () => fn(value); }, entitiesFilter: filter, FILTER_TYPES: { SEARCH: 'search' },
        updateCharacterLibraryToolbarOwnerState: owner, syncReactCharacterLibraryToolbarState: sync,
        eventSource: { on: jest.fn() }, event_types: { APP_READY: 'ready' } };
    extract('function initCharacterSearch()', 'async function measureCharacterSearchForPerf(', context)();
    const bridge = extract('function getReactCharacterLibraryPanelBridge()', 'async function loadReactCharacterLibraryPanelModule()', context)();
    bridge.applySearchQuery('alice'); expect(owner).toHaveBeenCalledWith({ searchQuery: 'alice' });
    expect(input.attributes['aria-busy']).toBe('true'); expect(status.hidden).toBe(false); expect(sync).toHaveBeenCalledTimes(1);
    expect(filter.setFilterData).not.toHaveBeenCalled(); pending(); expect(filter.setFilterData).toHaveBeenCalledWith('search', 'alice');
    expect(input.attributes['aria-busy']).toBe('false'); expect(status.hidden).toBe(true);
    bridge.applySearchQuery('alice'); expect(sync).toHaveBeenCalledTimes(1);
});

test('legacy search button and APP_READY retain visibility, storage and focus ordering without jQuery', () => {
    const calls = [], button = new EventTarget(), classes = new Set();
    button.classList = { toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name) };
    const form = { offsetWidth: 0, offsetHeight: 0, getClientRects: () => [] };
    const input = new EventTarget(); input.focus = () => calls.push('legacy-focus');
    const reactInput = { focus: () => calls.push('react-focus') };
    const listeners = {}, saved = new Map([['characterSearchFormVisible', 'true']]);
    const doc = { getElementById: id => ({ form_character_search_form: form, rm_button_search: button, character_search_bar: input, 'emberdesk-react-character-search': reactInput })[id] ?? null,
        addEventListener: (type, fn) => { listeners[type] = fn; }, removeEventListener: jest.fn() };
    button.closest = selector => selector === '#rm_button_search' ? button : null;
    const ready = {};
    const context = { document: doc, characterLibrarySearchCompatHandler: null, debounce: fn => fn,
        entitiesFilter: {}, FILTER_TYPES: {}, updateCharacterLibraryToolbarOwnerState: jest.fn(), syncReactCharacterLibraryToolbarState: jest.fn(),
        eventSource: { on: (name, fn) => { ready[name] = fn; } }, event_types: { APP_READY: 'ready' },
        accountStorage: { getItem: key => saved.get(key), setItem: (key, value) => { calls.push('persist:' + value); saved.set(key, value); } },
        setCharacterSelectionVisibility: (selector, visible) => { calls.push('visibility:' + visible); form.offsetWidth = visible ? 10 : 0; },
        $: () => { throw new Error('search controls must not use jQuery'); } };
    extract('function initCharacterSearch()', 'async function measureCharacterSearchForPerf(', context)();
    extract('function ensureCharacterLibraryToolbarCompatBridges()', 'function getReactCharacterLibraryPanelBridge()', context)();
    ready.ready(); expect(classes.has('active')).toBe(true); expect(form.offsetWidth).toBe(10);
    button.dispatchEvent(new Event('click')); listeners.click({ target: button });
    expect(calls).toEqual(['visibility:true', 'visibility:false', 'persist:false', 'react-focus']);
    expect(classes.has('active')).toBe(false); expect(saved.get('characterSearchFormVisible')).toBe('false');
    button.dispatchEvent(new Event('click')); listeners.click({ target: button });
    expect(calls.slice(-4)).toEqual(['visibility:true', 'persist:true', 'legacy-focus', 'react-focus']);
    expect(classes.has('active')).toBe(true);
    // Ancestor hidden: jQuery :visible remains false even when inline style says shown.
    form.offsetWidth = 0; form.getClientRects = () => [];
    button.dispatchEvent(new Event('click')); expect(saved.get('characterSearchFormVisible')).toBe('true');
    saved.set('characterSearchFormVisible', 'false'); ready.ready(); expect(classes.has('active')).toBe(false);
});
test('React list and toolbar snapshots read the live bulk class without jQuery', () => {
    let active = false;
    const list = { classList: { contains: name => name === 'bulk_select' && active } };
    const context = {
        document: { getElementById: id => id === 'rm_print_characters_block' ? list : null, querySelector: () => null },
        $: () => { throw new Error('bulk class read must not use jQuery'); },
        characterGroupOverlay: { selectedCharacters: [1] }, enrichCharacterLibraryPageEntities: x => x,
        CHARACTER_LIST_PAGE_SIZE_OPTIONS: [10], getCharacterListPaginationRangeLabel: () => '',
        entitiesFilter: { hasAnyFilter: () => false }, this_chid: 0,
        getCharacterLibraryToolbarSearchQuery: () => '', getCharacterLibraryToolbarSortValue: () => '',
        getCharacterLibrarySortOptions: () => [], createCharacterTagFilterViewState: () => ({}),
    };
    const panel = extract('function createCharacterLibraryPanelStateSnapshot(', 'function createCharacterLibraryToolbarStateSnapshot()', context);
    const toolbar = extract('function createCharacterLibraryToolbarStateSnapshot()', 'async function mountReactCharacterLibraryPanel(', context);
    const args = { listElement: list, pageEntities: [], renderPlan: {}, currentPage: 1, pageSize: 10 };
    expect(panel(args).bulkMode).toBe(false); expect(toolbar().isBulkEdit).toBe(false);
    active = true;
    expect(panel(args).bulkMode).toBe(true); expect(toolbar().isBulkEdit).toBe(true);
    context.document.getElementById = () => null;
    expect(panel(args).bulkMode).toBe(false); expect(toolbar().isBulkEdit).toBe(false);
});

test('authoring popup draft reads the world mirror, fallbacks and greetings without jQuery', () => {
    const field = { value: 'World A' };
    const context = { document: { getElementById: () => field }, $: () => { throw new Error('world mirror must not use jQuery'); },
        getCurrentCharacterAuthoringMode: () => 'edit', getCurrentCharacterAuthoringSource: () => ({ data: { alternate_greetings: ['hi'], extensions: { world: 'Fallback' } } }),
        create_save: { alternate_greetings: [], world: 'Draft' } };
    const sync = extract('function syncAuthoringDraftFromPopups(', 'async function reopenCharacterAuthoringAfterLegacyPopup(', context);
    const draft = {}; sync(draft);
    expect(draft.characterWorld).toBe('World A'); expect(draft.alternateGreetings).toEqual(['hi']);
    field.value = ''; sync(draft); expect(draft.characterWorld).toBe('Fallback');
    context.document.getElementById = () => null; sync(draft); expect(draft.characterWorld).toBe('Fallback');
});

test('create mode restores the world mirror without emitting events', () => {
    const field = new EventTarget(); field.value = 'old'; const event = jest.fn();
    field.addEventListener('input', event); field.addEventListener('change', event);
    const chain = new Proxy({}, { get: () => () => chain });
    const context = { document: { getElementById: id => id === 'character_world' ? field : null, querySelectorAll: () => [] },
        $: selector => { if (selector === '#character_world') throw new Error('world restore must not use jQuery'); return chain; },
        selected_button: '', create_save: { world: 'Story' }, default_avatar: '', formatCreatorNotes: () => '',
        setWorldInfoButtonClass: jest.fn(), updateFavButtonState: jest.fn(), checkEmbeddedWorld: jest.fn(), setCharacterSelectionVisibility: jest.fn() };
    const create = extract('function select_rm_create(', 'function select_rm_characters(', context);
    create({ switchMenu: false });
    expect(field.value).toBe('Story'); expect(event).not.toHaveBeenCalled();
    context.create_save.world = undefined; create({ switchMenu: false }); expect(field.value).toBe('');
});

test('delete reconcile passes the live bulk class to its page plan without jQuery', async () => {
    const list = { classList: { contains: key => key === 'bulk_select' } };
    const plan = jest.fn(() => ({ mode: 'fallback' }));
    const context = { document: { getElementById: () => list }, $: () => { throw new Error('delete bulk read must not use jQuery'); },
        getCharacterListCurrentPage: () => 1, getCharacterListCurrentPageSize: () => 10, createCharacterListEntitySnapshot: () => ({}),
        getEntitiesList: () => [], entitiesFilter: { hasAnyFilter: () => false }, isBogusFolderOpen: () => false,
        createCharacterDeleteReconcilePlan: plan, console };
    const reconcile = extract('async function reconcileCharacterListAfterDelete(', '/** Checks the state of the current search', context);
    expect(await reconcile({ beforeSnapshot: {}, deletedAvatars: [] })).toBe(false);
    expect(plan).toHaveBeenCalledWith(expect.objectContaining({ isBulkEdit: true }));
});

test('greetings popup edits a draft, reorders and commits without jQuery', async () => {
    class Node extends EventTarget {
        constructor() { super(); this.children = []; this.style = {}; this.dataset = {}; this.value = ''; this.textContent = ''; this.scrollHeight = 123; this.scrollTop = 0; this.parts = {}; }
        append(child) { this.children.push(child); }
        querySelector(selector) {
            const match = selector.match(/^\.alternate_greeting\[data-index="(\d+)"\]$/);
            if (match) return (this.parts['.alternate_greetings_list']?.children ?? this.children).find(child => child.dataset.index === match[1]) ?? null;
            return this.parts[selector] ?? null;
        }
        querySelectorAll(selector) { return selector === '.alternate_greetings_list .alternate_greeting' ? this.parts['.alternate_greetings_list'].children : []; }
        setAttribute(key, value) { if (key === 'data-index') this.dataset.index = String(value); else this[key] = String(value); }
    }
    const makeRoot = () => { const node = new Node(); for (const key of ['.alternate_greetings_list', '.alternate_grettings_hint', '.add_alternate_greeting']) node.parts[key] = new Node(); return node; };
    const makeRow = () => { const node = new Node(); for (const key of ['.alternate_greeting_text', '.editor_maximize', '.greeting_index', '.delete_alternate_greeting', '.move_up_alternate_greeting', '.move_down_alternate_greeting']) node.parts[key] = new Node(); return node; };
    let root, instance; const create_save = { alternate_greetings: ['first', 'second'] };
    class Popup { constructor(content, _type, _value, options) { root = content; this.options = options; instance = this; } show() {} async complete(result) { this.result = result; await this.options.onClose(this); } }
    const context = { document: { querySelector: selector => selector === '.open_alternate_greetings' ? { dataset: { chid: '-1' } } : selector === '#alternate_greetings_template .alternate_grettings' ? { cloneNode: makeRoot } : selector === '#alternate_greeting_form_template .alternate_greeting' ? { cloneNode: makeRow } : null },
        $: () => { throw new Error('greetings popup must not use jQuery'); }, menu_type: 'create', create_save, characters: {}, Popup,
        POPUP_TYPE: { TEXT: 1, CONFIRM: 2 }, POPUP_RESULT: { AFFIRMATIVE: 1 }, t: strings => strings.join(''), callGenericPopup: jest.fn() };
    context.updateAlternateGreetingsHintVisibility = extract('function updateAlternateGreetingsHintVisibility(', 'async function openAlternateGreetings()', context);
    context.addAlternateGreeting = extract('function addAlternateGreeting(', '/**\n * Imports supported files', context);
    const open = extract('async function openAlternateGreetings()', 'function addAlternateGreeting(', context);
    context.openAlternateGreetings = open;
    await open();
    const list = root.parts['.alternate_greetings_list'];
    expect(list.children).toHaveLength(2); expect(root.parts['.alternate_grettings_hint'].style.display).toBe('none');
    const first = list.children[0], second = list.children[1];
    first.parts['.alternate_greeting_text'].value = 'edited';
    first.parts['.alternate_greeting_text'].dispatchEvent(new Event('input'));
    second.parts['.move_up_alternate_greeting'].dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    expect(first.parts['.alternate_greeting_text'].value).toBe('second');
    expect(second.parts['.alternate_greeting_text'].value).toBe('edited');
    root.parts['.add_alternate_greeting'].dispatchEvent(new Event('click'));
    expect(list.children).toHaveLength(3); expect(list.scrollTop).toBe(123);
    expect(create_save.alternate_greetings).toEqual(['first', 'second']);
    instance.result = 1; await instance.options.onClose(instance);
    expect(create_save.alternate_greetings).toEqual(['second', 'edited', '']);

    await open();
    root.parts['.alternate_greetings_list'].children[0].parts['.alternate_greeting_text'].value = 'cancelled';
    root.parts['.alternate_greetings_list'].children[0].parts['.alternate_greeting_text'].dispatchEvent(new Event('input'));
    instance.result = 0; await instance.options.onClose(instance);
    expect(create_save.alternate_greetings).toEqual(['second', 'edited', '']);

    context.menu_type = 'edit'; context.characters['17'] = { data: { alternate_greetings: ['A', 'B'] } };
    context.document.querySelector = selector => selector === '.open_alternate_greetings' ? { dataset: { chid: '17' } } : selector === '#alternate_greetings_template .alternate_grettings' ? { cloneNode: makeRoot } : selector === '#alternate_greeting_form_template .alternate_greeting' ? { cloneNode: makeRow } : null;
    context.unshallowCharacter = jest.fn(async () => {}); context.createOrEditCharacter = jest.fn(async () => {});
    context.callGenericPopup.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await open(); expect(context.unshallowCharacter).toHaveBeenCalledWith('17');
    const deleteButton = root.parts['.alternate_greetings_list'].children[0].parts['.delete_alternate_greeting'];
    deleteButton.dispatchEvent(new Event('click', { cancelable: true })); await new Promise(resolve => setImmediate(resolve));
    expect(context.characters['17'].data.alternate_greetings).toEqual(['A', 'B']);
    deleteButton.dispatchEvent(new Event('click', { cancelable: true })); await new Promise(resolve => setImmediate(resolve));
    expect(context.characters['17'].data.alternate_greetings).toEqual(['B']);
    expect(context.createOrEditCharacter).toHaveBeenCalledTimes(1);
    expect(root.parts['.alternate_greetings_list'].children).toHaveLength(1);
});
