import { beforeEach, expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

jest.unstable_mockModule('../public/scripts/notifications.js', () => ({ default: new Proxy({}, { get: (_target, key) => globalThis.toastr?.[key] }) }));
const emit = jest.fn(async () => {});jest.unstable_mockModule('../public/scripts/events.js', () => ({ eventSource: { emit }, event_types: { CHARACTER_EDITED: 'edited', CHARACTER_DUPLICATED: 'duplicated' } }));
jest.unstable_mockModule('../public/scripts/character-authoring.js', () => ({ buildCharacterAuthoringFormData: jest.fn(), getCharacterAuthoringWriteUrl: jest.fn() }));
jest.unstable_mockModule('../public/scripts/character-list-state.js', () => ({ getCharacterDeleteCandidates: jest.fn(), shouldRefreshCharacterAfterEdit: () => true }));
jest.unstable_mockModule('../public/scripts/request-context.js', () => ({ getRequestHeaders: () => ({}) }));
jest.unstable_mockModule('../public/scripts/workspace-panels-react-bridge.js', () => ({ loadWorkspacePanelsModule: jest.fn() }));
const { registerCharacterLifecycleShellContext } = await import('../public/scripts/character-lifecycle-shell-context.js');
const lifecycle = await import('../public/scripts/character-lifecycle-service.js');
let state, shell, identity;

function fakeAvatarInput(file = { name: 'avatar.png' }) {
    const input = new EventTarget();
    input.files = [file];
    let value = 'C:\\fakepath\\avatar.png';
    Object.defineProperty(input, 'value', {
        get: () => value,
        set: next => { value = next; if (next === '') input.files = []; },
    });
    return input;
}

beforeEach(() => {
    emit.mockClear();
    identity = {};
    state = { settingsReady: true, this_chid: '0', characters: [{ avatar: 'alice.png', canonical_card_version: 'form-version', data: {} }, { avatar: 'bob.png', data: {} }], chat: [], chat_metadata: {}, favsToHotswap: jest.fn() };
    shell = {
        state, getDraftTagIds: () => [], getCharacterWorldDraftIdentity: () => identity,
        getOneCharacter: jest.fn(async () => {}), getFirstMessage: jest.fn(() => ({ mes: 'Alice greeting' })),
        clearChat: jest.fn(async () => {}), printMessages: jest.fn(), saveChatConditional: jest.fn(),
        setTemporaryChatStatus: jest.fn(), select_rm_create: jest.fn(), formatCreatorNotes: () => '', timestampToMoment: () => ({ toISOString: () => '' }),
        updateFavButtonState: jest.fn(), getThumbnailUrl: () => '', setWorldInfoButtonClass: jest.fn(), checkEmbeddedWorld: jest.fn(), getCharacterSource: () => null, saveSettingsDebounced: jest.fn(),
        t: strings => strings.join(''),
    };
    registerCharacterLifecycleShellContext(shell);
    const field = { html() { return this; }, get: () => ({}), attr: (_name, value) => value === undefined ? 'editcharacter' : field, data: () => '0', val(value) { return value === undefined ? '' : this; }, clone() { return this; }, replaceWith() {} };
    globalThis.$ = () => field;
    globalThis.document = { getElementById: id => id === 'form_create' ? { getAttribute: () => 'editcharacter', setAttribute: jest.fn() } : null, querySelector: () => ({ dataset: { chid: '0' } }), querySelectorAll: () => [] };
    globalThis.FormData = class extends Map { constructor() { super([['avatar_url', 'alice.png']]); } };
    globalThis.CustomEvent = class {};
    globalThis.toastr = { error: jest.fn(), warning: jest.fn(), success: jest.fn(), info: jest.fn() };
    lifecycle.select_selected_character('0', { switchMenu: false });
    emit.mockClear();
});

test('legacy edit sends greetings belonging to the editor identity without jQuery data', async () => {
    state.characters[0].data.alternate_greetings = ['Alice greeting'];
    state.characters[1].data.alternate_greetings = ['Bob one', 'Bob two'];
    document.querySelector = () => ({ dataset: { chid: '1' } });
    globalThis.FormData = class extends Map {
        constructor() { super([['avatar_url', 'alice.png']]); this.appended = []; }
        append(key, value) { this.appended.push([key, value]); }
    };
    const oldDollar = globalThis.$;
    globalThis.$ = selector => {
        if (selector === '.open_alternate_greetings') throw new Error('edit greeting identity must not use jQuery');
        return oldDollar(selector);
    };
    globalThis.fetch = jest.fn(async () => ({ ok: false }));
    await lifecycle.createOrEditCharacter();
    expect(fetch.mock.calls[0][1].body.appended).toEqual([['alternate_greetings', 'Bob one'], ['alternate_greetings', 'Bob two']]);
});

test('legacy full form retains its captured version and draft on conflict', async () => {
    state.characters[0].canonical_card_version = 'newer-roster-version';
    globalThis.fetch = jest.fn(async () => ({ ok: false, status: 409 }));
    await lifecycle.createOrEditCharacter();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe('/api/characters/edit');
    expect(fetch.mock.calls[0][1].body.get('expected_card_json')).toBe('form-version');
    expect(toastr.error).toHaveBeenCalledWith(expect.stringContaining('draft has been kept'));
    expect(shell.getOneCharacter).not.toHaveBeenCalled();
});

test.each(['old-chat', 'draft-chat'])('recent-chat merge rebases the legacy edit without overwriting a pending chat (%s)', async currentChat => {
    const previous = JSON.stringify({ chat: 'old-chat' });
    const cardJson = JSON.stringify({ chat: 'new-chat' });
    const next = JSON.stringify({ chat: 'new-chat', json_data: cardJson });
    Object.assign(state.characters[0], { chat: 'old-chat', canonical_card_version: previous });
    const chat = { value: currentChat }, json = { value: previous };
    const getElement = document.getElementById;
    document.getElementById = id => id === 'selected_chat_pole' ? chat : id === 'character_json_data' ? json : getElement(id);
    lifecycle.select_selected_character('0', { switchMenu: false });
    chat.value = currentChat;
    globalThis.FormData = class extends Map {
        constructor() { super([['avatar_url', 'alice.png'], ['chat', chat.value], ['json_data', json.value]]); }
    };
    globalThis.fetch = jest.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ canonical_card_version: next }) })
        .mockResolvedValueOnce({ ok: false, status: 409 });
    const source = readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');
    const start = source.indexOf('export async function updateRemoteChatName(');
    const updateRemoteChatName = runInNewContext(`(${source.slice(start + 'export '.length, source.indexOf('\n}', start) + 2)})`, {
        characters: state.characters, fetch, getRequestHeaders: () => ({}),
        getCharacterPatchVersion: async character => character.canonical_card_version,
        acknowledgeLegacyCharacterWrite: lifecycle.acknowledgeLegacyCharacterWrite,
    });

    await updateRemoteChatName(0, 'new-chat');
    await lifecycle.createOrEditCharacter();
    const { body } = fetch.mock.calls[1][1];
    expect(body.get('expected_card_json')).toBe(next);
    expect(body.get('chat')).toBe(currentChat === 'old-chat' ? 'new-chat' : currentChat);
    expect(body.get('json_data')).toBe(cardJson);
});

test('acknowledged favorite is carried into the next legacy full write', async () => {
    const favoriteVersion = JSON.stringify({ fav: true, data: { extensions: { fav: true } } });
    shell.updateFavButtonState.mockImplementation(value => { state.fav_ch_checked = value; });
    state.fav_ch_checked = false;
    globalThis.fetch = jest.fn(async () => ({ ok: false, status: 409 }));

    lifecycle.acknowledgeLegacyCharacterWrite('alice.png', 'form-version', favoriteVersion, { favorite: true });
    await lifecycle.createOrEditCharacter();
    const { body } = fetch.mock.calls[0][1];
    expect(body.get('expected_card_json')).toBe(favoriteVersion);
    expect(body.get('fav')).toBe('true');
});

test('new-chat reselection uses the committed card after an authoring projection error', async () => {
    const { buildCharacterAuthoringFormData } = await import('../public/scripts/character-authoring.js');
    const savedVersion = JSON.stringify({ description: 'saved description' });
    state.create_save = {};
    Object.assign(shell, {
        getCurrentCharacterAuthoringMode: () => 'edit',
        getCurrentCharacterAuthoringSource: () => state.characters[0],
        applyCharacterAuthoringSaveModel: jest.fn(),
    });
    shell.getOneCharacter.mockImplementation(async () => {
        Object.assign(state.characters[0], { canonical_card_version: savedVersion, json_data: savedVersion });
    });
    buildCharacterAuthoringFormData.mockReturnValue(new Map([['avatar_url', 'alice.png'], ['expected_card_json', 'form-version']]));
    globalThis.fetch = jest.fn()
        .mockResolvedValueOnce({
            ok: false, status: 500,
            json: async () => ({ error: 'projection_failed', authority_committed: true, canonical_card_version: savedVersion }),
        })
        .mockResolvedValueOnce({ ok: false, status: 409 });
    try {
        await lifecycle.saveCharacterAuthoringFromPayload({ fields: { name: 'Alice' }, expectedCardJson: 'form-version' });
        // getChatResult fills the form again before new chat calls the legacy save.
        lifecycle.select_selected_character('0', { switchMenu: false });
        await lifecycle.createOrEditCharacter(new CustomEvent('newChat'));
        expect(fetch.mock.calls[1][1].body.get('expected_card_json')).toBe(savedVersion);
    } finally {
        buildCharacterAuthoringFormData.mockReset();
    }
});

test.each([
    ['matching authoring write', 'alice.png', 'form-version', false, true],
    ['matching authoring write with projection failure', 'alice.png', 'form-version', true, true],
    ['authoring write based on another snapshot', 'alice.png', 'other-version', false, false],
    ['authoring write for another avatar', 'bob.png', 'form-version', false, false],
])('%s only rebases the corresponding legacy form', async (_label, avatar, expectedCardJson, projectionFailed, advances) => {
    const { buildCharacterAuthoringFormData } = await import('../public/scripts/character-authoring.js');
    const savedVersion = JSON.stringify({ description: 'saved description', data: { extensions: { regex_scripts: [] } } });
    const jsonField = { value: '{"description":"old description"}' };
    const getElement = document.getElementById;
    document.getElementById = id => id === 'character_json_data' ? jsonField : getElement(id);
    state.create_save = {};
    Object.assign(shell, {
        getCurrentCharacterAuthoringMode: () => 'edit',
        getCurrentCharacterAuthoringSource: () => ({ avatar }),
        applyCharacterAuthoringSaveModel: jest.fn(),
    });
    buildCharacterAuthoringFormData.mockReturnValue(new Map([['avatar_url', avatar], ['expected_card_json', expectedCardJson]]));
    globalThis.fetch = jest.fn()
        .mockResolvedValueOnce({
            ok: !projectionFailed, status: projectionFailed ? 500 : 200,
            json: async () => ({ error: 'projection_failed', authority_committed: true, canonical_card_version: savedVersion }),
        })
        .mockResolvedValueOnce({ ok: false, status: 409 });
    try {
        await lifecycle.saveCharacterAuthoringFromPayload({ fields: { name: 'Alice' }, expectedCardJson, changedFields: [] });
        await lifecycle.createOrEditCharacter(new CustomEvent('newChat'));
        expect(fetch.mock.calls[1][1].body.get('expected_card_json')).toBe(advances ? savedVersion : 'form-version');
        expect(jsonField.value).toBe(advances ? savedVersion : '{"description":"old description"}');
    } finally {
        buildCharacterAuthoringFormData.mockReset();
    }
});

test('a completed edit refreshes its card but does not touch another selected chat', async () => {
    let respond;
    globalThis.fetch = jest.fn(() => new Promise(resolve => { respond = resolve; }));
    const saving = lifecycle.createOrEditCharacter();
    state.this_chid = '1';
    identity = {};
    const bobChat = [{ mes: 'Bob conversation' }];
    state.chat = bobChat;
    respond({ ok: true, json: async () => ({ canonical_card_version: 'new-version' }) });
    await saving;
    expect(shell.getOneCharacter).toHaveBeenCalledWith('alice.png');
    expect(shell.getFirstMessage).not.toHaveBeenCalled();
    expect(shell.clearChat).not.toHaveBeenCalled();
    expect(state.chat).toBe(bobChat);
    expect(emit).not.toHaveBeenCalledWith('edited', expect.objectContaining({ detail: expect.objectContaining({ id: '1' }) }));
});

test('leaving and reopening the same character invalidates an earlier edit completion', async () => {
    let refreshed;
    globalThis.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ canonical_card_version: 'new-version' }) }));
    shell.getOneCharacter.mockImplementation(() => new Promise(resolve => { refreshed = resolve; }));
    const saving = lifecycle.createOrEditCharacter();
    for (let i = 0; i < 8 && !refreshed; i++) await Promise.resolve();
    identity = {};
    refreshed();
    await saving;
    expect(shell.getFirstMessage).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
});

test('authoring reads legacy fallback fields without jQuery before issuing the write', async () => {
    const { buildCharacterAuthoringFormData } = await import('../public/scripts/character-authoring.js');
    const oldDocument = globalThis.document, oldDollar = globalThis.$;
    const fields = {
        selected_chat_pole: { value: 'chat-legacy' }, create_date_pole: { value: 'date-legacy' },
        character_json_data: { value: '{"legacy":true}' }, add_avatar_button: { files: [] },
    };
    globalThis.document = { getElementById: id => fields[id] ?? null };
    globalThis.$ = () => { throw new Error('authoring fallback must not use jQuery'); };
    state.create_save = {};
    shell.getCurrentCharacterAuthoringMode = () => 'edit';
    shell.getCurrentCharacterAuthoringSource = () => ({ avatar: 'alice.png' });


    const sentinel = new Error('stop after building');
    buildCharacterAuthoringFormData.mockImplementation(() => { throw sentinel; });
    try {
        await expect(lifecycle.saveCharacterAuthoringFromPayload({ fields: { name: 'Alice' }, expectedCardJson: 'form-version' })).rejects.toBe(sentinel);
        expect(buildCharacterAuthoringFormData).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
            existingAvatar: 'alice.png', chat: 'chat-legacy', createDate: 'date-legacy', jsonData: '{"legacy":true}', avatarFile: null,
        }));
    } finally {
        buildCharacterAuthoringFormData.mockReset(); globalThis.document = oldDocument; globalThis.$ = oldDollar;
    }
});

test('conditional edit advances its version and reports a committed projection failure', async () => {
    const { buildCharacterAuthoringFormData } = await import('../public/scripts/character-authoring.js');
    state.create_save = {};
    shell.getCurrentCharacterAuthoringMode = () => 'edit';
    shell.getCurrentCharacterAuthoringSource = () => ({ avatar: 'alice.png' });
    shell.applyCharacterAuthoringSaveModel = jest.fn();
    buildCharacterAuthoringFormData.mockReturnValue(new Map([['avatar_url', 'alice.png']]));
    globalThis.fetch = jest.fn(async () => ({ ok: false, status: 500, json: async () => ({ error: 'projection_failed', authority_committed: true, canonical_card_version: 'new-version' }) }));
    try {
        const result = await lifecycle.saveCharacterAuthoringFromPayload({ fields: { name: 'Alice' }, expectedCardJson: 'old-version', changedFields: ['description'] });
        expect(result).toEqual(expect.objectContaining({ ok: true, canonicalCardVersion: 'new-version', projectionFailed: true }));
        expect(toastr.warning).toHaveBeenCalled();
    } finally { buildCharacterAuthoringFormData.mockReset(); }
});

test('character conflict guidance matches in English and Chinese', () => {
    const locales = JSON.parse(readFileSync(new URL('../public/locales/zh-cn.json', import.meta.url), 'utf8'));
    const key = 'This character changed elsewhere. Your draft has been kept; copy your changes before reloading.';
    expect(locales[key]).toMatch(/重新加载前复制/);
});

test('legacy creation validates the native form without jQuery before generating', async () => {
    const oldDocument = globalThis.document, oldDollar = globalThis.$;
    const form = { getAttribute: () => 'createcharacter' }, avatar = { innerHTML: 'stale' };
    globalThis.document = { getElementById: id => ({ form_create: form, rm_info_avatar: avatar, character_name_pole: { value: 'Alice' } })[id] ?? null };
    globalThis.$ = () => { throw new Error('legacy form validation must not use jQuery'); };
    state.is_send_press = true;
    globalThis.fetch = jest.fn();
    try {
        await lifecycle.createOrEditCharacter();
        expect(avatar.innerHTML).toBe('');
        expect(fetch).not.toHaveBeenCalled();
        expect(toastr.error).toHaveBeenCalled();
    } finally { globalThis.document = oldDocument; globalThis.$ = oldDollar; }
});

test('successful legacy creation clears all field mirrors without jQuery or change events', async () => {
    const fields = Object.fromEntries(['character_name_pole', 'description_textarea', 'tags_textarea', 'depth_prompt_depth', 'depth_prompt_role'].map(id => [id, { value: 'stale' }]));
    const mirrorChanged = jest.fn();
    for (const id of ['character_world', 'alternate_greetings_template']) {
        fields[id] = new EventTarget();
        fields[id].value = 'stale';
        fields[id].addEventListener('change', mirrorChanged);
        fields[id].addEventListener('input', mirrorChanged);
    }
    const form = { getAttribute: () => 'createcharacter' };
    fields.form_create = form;
    const cross = new EventTarget();
    cross.click = jest.fn(() => cross.dispatchEvent(new Event('click', { bubbles: true, cancelable: true })));
    fields.character_cross = cross;
    const popup = { style: { display: 'block' } };
    fields.character_popup = popup;
    state.is_advanced_char_open = true;
    const transition = jest.fn((_element, options) => options.complete());
    const handlerSource = readFileSync(new URL('../public/scripts/dom-handlers.js', import.meta.url), 'utf8');
    const closeBody = handlerSource.match(/document\.getElementById\('character_cross'\)\?\.addEventListener\('click', function \(\) \{([\s\S]*?)\n    \}\);/);
    expect(closeBody).not.toBeNull();
    cross.addEventListener('click', new Function('state', 'document', 'transitionOpacity', `return function() {${closeBody[1]}\n};`)(state, { getElementById: id => fields[id] ?? null }, transition));
    const avatarInput = fakeAvatarInput();
    const avatarChange = jest.fn();
    avatarInput.addEventListener('change', avatarChange);
    fields.add_avatar_button = avatarInput;
    fields['character_popup-button-h3'] = { textContent: 'Edit character' };
    fields.character_name_pole.value = 'New';
    globalThis.document = { getElementById: id => fields[id] ?? null };
    globalThis.FormData = class extends Map { constructor() { super(); } append(key, value) { this.set(key, value); } };
    const chain = { trigger() { return this; }, val() { return this; }, clone() { return this; }, replaceWith() { return this; }, text() { return this; } };
    globalThis.$ = selector => {
        if (selector === '#add_avatar_button') throw new Error('avatar reset must preserve the input without jQuery');
        if (selector === '#character_cross') throw new Error('creation popup close must not use jQuery');
        if (['#character_name_pole', '#description_textarea', '#tags_textarea', '#depth_prompt_depth', '#depth_prompt_role', '#character_popup-button-h3', '#character_world', '#alternate_greetings_template'].includes(selector)) throw new Error(`creation reset uses jQuery: ${selector}`);
        return chain;
    };
    state.create_save = { alternate_greetings: [], extensions: {}, extra_books: [] };
    state.depth_prompt_depth_default = 4; state.depth_prompt_role_default = 0;
    Object.assign(shell, { assignTagIdsToAvatar: jest.fn(), getCharacters: jest.fn(async () => { expect(state.is_advanced_char_open).toBe(false); }), select_rm_info: jest.fn() });
    globalThis.fetch = jest.fn(async () => ({ ok: true, text: async () => 'new.png' }));
    await lifecycle.createOrEditCharacter();
    expect(cross.click).toHaveBeenCalledTimes(1);
    expect(transition).toHaveBeenCalledWith(popup, expect.objectContaining({ opacity: 0 }));
    expect(popup.style.display).toBe('none');
    expect(fields.character_name_pole.value).toBe('');
    expect(fields.description_textarea.value).toBe('');
    expect(fields.tags_textarea.value).toBe('');
    expect(fields.character_world.value).toBe('');
    expect(fields.alternate_greetings_template.value).toBe('');
    expect(mirrorChanged).not.toHaveBeenCalled();
    expect(String(fields.depth_prompt_depth.value)).toBe('4');
    expect(String(fields.depth_prompt_role.value)).toBe('0');
    expect(fields['character_popup-button-h3'].textContent).toBe('Create character');
    expect(state.create_save).toEqual(expect.objectContaining({ name: '', world: '', depth_prompt_depth: 4, depth_prompt_role: 0, alternate_greetings: [] }));
    expect(shell.assignTagIdsToAvatar).toHaveBeenCalledWith('new.png', []);
    expect(shell.select_rm_info).toHaveBeenCalledWith('char_create', 'new.png', 'alice.png');
    expect(fields.add_avatar_button).toBe(avatarInput);
    expect(avatarInput.files).toHaveLength(0);
    expect(avatarChange).not.toHaveBeenCalled();
    avatarInput.dispatchEvent(new Event('change'));
    expect(avatarChange).toHaveBeenCalledTimes(1);
});

test('a current character edit restores the save control without jQuery', async () => {
    const saveButton = { setAttribute: jest.fn() };
    const avatarInput = fakeAvatarInput();
    const avatarChange = jest.fn();
    avatarInput.addEventListener('change', avatarChange);
    globalThis.document = { getElementById: id => id === 'form_create' ? { getAttribute: () => 'editcharacter' } : id === 'create_button' ? saveButton : id === 'add_avatar_button' ? avatarInput : null, querySelector: () => ({ dataset: { chid: '0' } }) };
    const field = { data: () => '0', val() { return this; }, clone() { return this; }, replaceWith() {} };
    globalThis.$ = selector => {
        if (selector === '#create_button') throw new Error('edit save control must not use jQuery');
        if (selector === '#add_avatar_button') throw new Error('avatar reset must preserve the input without jQuery');
        return field;
    };
    state.chat_metadata.tainted = true;
    globalThis.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ canonical_card_version: 'new-version' }) }));
    await lifecycle.createOrEditCharacter();
    expect(saveButton.setAttribute).toHaveBeenCalledWith('value', 'Save');
    expect(emit).toHaveBeenCalledWith('edited', expect.objectContaining({ detail: expect.objectContaining({ id: '0' }) }));
    expect(avatarInput.files).toHaveLength(0);
    expect(avatarChange).not.toHaveBeenCalled();
    avatarInput.dispatchEvent(new Event('change'));
    expect(avatarChange).toHaveBeenCalledTimes(1);
});

test('authoring does not save a shallow character without a version', async () => {
    state.create_save = {};
    state.characters[0].shallow = true;
    Object.assign(shell, {
        getCurrentCharacterAuthoringMode: () => 'edit',
        getCurrentCharacterAuthoringSource: () => state.characters[0],
        applyCharacterAuthoringSaveModel: jest.fn(),
    });
    globalThis.fetch = jest.fn();
    await expect(lifecycle.saveCharacterAuthoringFromPayload({ fields: { name: 'Alice' } })).rejects.toThrow('Character not loaded');
    expect(fetch).not.toHaveBeenCalled();
});

test('authoring returns the version from the committed write', async () => {
    const { buildCharacterAuthoringFormData, getCharacterAuthoringWriteUrl } = await import('../public/scripts/character-authoring.js');
    state.create_save = {};
    Object.assign(shell, {
        getCurrentCharacterAuthoringMode: () => 'edit',
        getCurrentCharacterAuthoringSource: () => state.characters[0],
        applyCharacterAuthoringSaveModel: jest.fn(),
    });
    buildCharacterAuthoringFormData.mockReturnValue(new Map([['avatar_url', 'alice.png']]));
    getCharacterAuthoringWriteUrl.mockReturnValue('/api/characters/edit');
    globalThis.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ canonical_card_version: 'committed version' }) }));
    try {
        const result = await lifecycle.saveCharacterAuthoringFromPayload({ fields: { name: 'Alice' }, expectedCardJson: 'old version', changedFields: [] });
        expect(result.canonicalCardVersion).toBe('committed version');
    } finally {
        buildCharacterAuthoringFormData.mockReset();
        getCharacterAuthoringWriteUrl.mockReset();
    }
});

test('authoring forwards its snapshot and surfaces a conflict without refreshing the draft source', async () => {
    const { buildCharacterAuthoringFormData, getCharacterAuthoringWriteUrl } = await import('../public/scripts/character-authoring.js');
    state.create_save = {};
    Object.assign(shell, {
        getCurrentCharacterAuthoringMode: () => 'edit',
        getCurrentCharacterAuthoringSource: () => state.characters[0],
        applyCharacterAuthoringSaveModel: jest.fn(),
    });

    const form = new Map([['avatar_url', 'alice.png']]);
    buildCharacterAuthoringFormData.mockReturnValue(form);
    getCharacterAuthoringWriteUrl.mockReturnValue('/api/characters/edit');
    globalThis.fetch = jest.fn(async () => ({ ok: false, status: 409 }));
    const model = { fields: { name: 'Alice', description: 'unsaved draft' }, expectedCardJson: 'old version' };
    try {
        await expect(lifecycle.saveCharacterAuthoringFromPayload(model)).rejects.toThrow('status 409');
        expect(buildCharacterAuthoringFormData).toHaveBeenCalledWith(model, expect.anything());
        expect(fetch.mock.calls[0][1].body).toBe(form);
        expect(toastr.error).toHaveBeenCalledWith(expect.stringContaining('draft has been kept'));
        expect(shell.getOneCharacter).not.toHaveBeenCalled();
        expect(model.fields.description).toBe('unsaved draft');
    } finally {
        buildCharacterAuthoringFormData.mockReset();
        getCharacterAuthoringWriteUrl.mockReset();
    }
});
test('payload edit clears the uploaded file without replacing its input or losing change listeners', async () => {
    const { buildCharacterAuthoringFormData, getCharacterAuthoringWriteUrl } = await import('../public/scripts/character-authoring.js');
    const file = new File(['avatar'], 'avatar.png', { type: 'image/png' });
    const avatarInput = fakeAvatarInput(file);
    const avatarChange = jest.fn();
    avatarInput.addEventListener('change', avatarChange);
    globalThis.document = { getElementById: id => id === 'add_avatar_button' ? avatarInput : null };
    globalThis.$ = () => { throw new Error('avatar reset must preserve the input without jQuery'); };
    state.create_save = { avatar: [file] };
    Object.assign(shell, {
        getCurrentCharacterAuthoringMode: () => 'edit',
        getCurrentCharacterAuthoringSource: () => state.characters[0],
        ensureImageFormatSupported: jest.fn(async value => value),
        applyCharacterAuthoringSaveModel: jest.fn(),
    });
    buildCharacterAuthoringFormData.mockReturnValue(new Map([['avatar_url', 'alice.png']]));
    getCharacterAuthoringWriteUrl.mockReturnValue('/api/characters/edit');
    globalThis.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ canonical_card_version: 'new-version' }) }));
    try {
        const result = await lifecycle.saveCharacterAuthoringFromPayload({ fields: { name: 'Alice' }, expectedCardJson: 'form-version', changedFields: [] });
        expect(result.ok).toBe(true);
        expect(avatarInput.files).toHaveLength(0);
        expect(state.create_save.avatar).toBeNull();
        expect(avatarChange).not.toHaveBeenCalled();
        avatarInput.dispatchEvent(new Event('change'));
        expect(avatarChange).toHaveBeenCalledTimes(1);
    } finally {
        buildCharacterAuthoringFormData.mockReset();
        getCharacterAuthoringWriteUrl.mockReset();
    }
});
