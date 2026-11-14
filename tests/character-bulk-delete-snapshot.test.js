import { beforeEach, expect, jest, test } from '@jest/globals';

const characters = [];
const deleteCharacter = jest.fn();
const fetchMock = jest.fn();
const popupCalls = [];
const captureCascadeChoices = jest.fn();
const hideLoader = jest.fn();
const waitUntilCondition = jest.fn();
let popupResult = true;


jest.unstable_mockModule('../public/scripts/events.js', () => ({
    eventSource: { on: jest.fn(), emit: jest.fn(() => Promise.resolve()) }, event_types: {},
}));
jest.unstable_mockModule('../public/scripts/request-context.js', () => ({ getRequestHeaders: () => ({}) }));
jest.unstable_mockModule('../public/scripts/RossAscends-mods.js', () => ({ favsToHotswap: jest.fn() }));
jest.unstable_mockModule('../public/scripts/action-loader.js', () => ({
    loader: { show: jest.fn(() => ({ hide: hideLoader })), ToastMode: { STATIC: 'static' } },
}));
jest.unstable_mockModule('../public/scripts/popup.js', () => ({
    POPUP_TYPE: { CONFIRM: 1 }, POPUP_RESULT: { NEGATIVE: 0, CUSTOM1: 2, AFFIRMATIVE: 1 },
    Popup: class {
        constructor(html, type, value, options) { this.options = options; popupCalls.push({ html, type, value, options }); }
        async show() { if (popupResult) this.options.onClosing(); return popupResult; }
    },
}));
jest.unstable_mockModule('../public/scripts/world-cascade-dialog.js', () => ({
    buildCascadeSectionHtml: jest.fn(worldInfos => worldInfos.length ? '<div>worlds</div>' : null), captureCascadeChoices,
}));
jest.unstable_mockModule('../public/scripts/utils.js', () => ({ waitUntilCondition }));
jest.unstable_mockModule('../public/scripts/constants.js', () => ({ debounce_timeout: { extended: 1 } }));
jest.unstable_mockModule('../public/scripts/tags.js', () => ({
    createBulkTagEditorRuntime: jest.fn(), openCharacterTagManager: jest.fn(),
    getTagKeyForEntity: jest.fn(), getTagsList: jest.fn(), printTagList: jest.fn(),
    tag_map: {}, compareTagsForSort: jest.fn(), removeTagFromMap: jest.fn(), importTags: jest.fn(), tag_import_setting: {},
}));
jest.unstable_mockModule('../public/scripts/i18n.js', () => ({
    t: (parts, ...values) => parts.reduce((result, part, i) => result + part + (values[i] ?? ''), ''),
    translate: text => text,
}));

const { BulkEditOverlay } = await import('../public/scripts/BulkEditOverlay.js');
const { registerCharacterLifecycleShellContext } = await import('../public/scripts/character-lifecycle-shell-context.js');
const { resolveCharacterAvatarsByIds } = await import('../public/scripts/character-list-state.js');
const overlay = new BulkEditOverlay();

beforeEach(() => {
    registerCharacterLifecycleShellContext({
        state: { get characters() { return characters; }, is_send_press: false, this_chid: undefined, name2: 'neutral', neutralCharacterName: 'neutral' },
        deleteCharacter, stopGeneration: jest.fn(), syncReactCharacterLibraryToolbarState: jest.fn(),
    });
    characters.splice(0, characters.length);
    overlay.selectedCharacters.length = 0;
    popupCalls.length = 0;
    popupResult = true;
    deleteCharacter.mockReset().mockResolvedValue(true);
    fetchMock.mockReset();
    captureCascadeChoices.mockReset().mockReturnValue({ deleteWorlds: [], clearWorldReferences: false });
    hideLoader.mockClear();
    globalThis.fetch = fetchMock;
    globalThis.document = { getElementById: () => ({ checked: true }) };
    globalThis.toastr = { success: jest.fn() };
});

test('freezes the selected name and avatar before preflight while the list and selection change', async () => {
    const alpha = { avatar: 'a.png', name: 'Alpha' };
    const beta = { avatar: 'b.png', name: 'Beta' };
    characters.push(alpha, beta);
    overlay.selectedCharacters.push(0);
    let finishPreflight;
    fetchMock.mockReturnValue(new Promise(resolve => { finishPreflight = resolve; }));

    const pending = overlay.handleContextMenuDelete();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ avatars: ['a.png'] });
    characters.splice(0, 2, beta, alpha);
    alpha.avatar = 'changed.png';
    alpha.name = 'Changed';
    overlay.selectedCharacters.splice(0, 1, 1);
    finishPreflight({ ok: true, json: async () => ({ worldInfos: [] }) });
    await pending;

    expect(popupCalls[0].html).toContain('<span class="tag">Alpha</span>');
    expect(popupCalls[0].html).not.toContain('Beta');
    expect(deleteCharacter).toHaveBeenCalledWith(['a.png'], expect.objectContaining({
        deleteContext: { source: 'bulk', selectedCount: 1 },
    }));
});

test('avatar resolver preserves order, duplicates and filters invalid avatars and indices', () => {
    const entries = [{ avatar: 'a.png' }, null, { avatar: '' }, { avatar: 42 }, { avatar: 'b.png' }];
    expect(resolveCharacterAvatarsByIds(entries, [4, 1, 0, 8, 2, 3, 4])).toEqual(['b.png', 'a.png', 'b.png']);
});

test('mixed valid and invalid selections use matching count, escaped names and targets', async () => {
    characters.push({ avatar: 'a.png', name: '<A & "B">' }, { avatar: '', name: 'Invalid' }, { avatar: 'b.png', name: 'Beta' });
    overlay.selectedCharacters.push(2, 1, 99, 0);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ worldInfos: [] }) });
    await overlay.handleContextMenuDelete();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ avatars: ['b.png', 'a.png'] });
    expect(popupCalls[0].html).toContain('Delete 2 characters?');
    expect(popupCalls[0].html).toContain('<span class="tag">Beta</span><span class="tag">&lt;A &amp; &quot;B&quot;&gt;</span>');
    expect(popupCalls[0].html).not.toContain('Invalid');
    expect(deleteCharacter).toHaveBeenCalledWith(['b.png', 'a.png'], expect.objectContaining({ deleteContext: { source: 'bulk', selectedCount: 2 } }));
});

test('empty or entirely invalid selection does nothing', async () => {
    await overlay.handleContextMenuDelete();
    characters.push({ avatar: '', name: 'invalid' });
    overlay.selectedCharacters.push(0, 99);
    await overlay.handleContextMenuDelete();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(popupCalls).toHaveLength(0);
    expect(deleteCharacter).not.toHaveBeenCalled();
});

test('cancel confirmation never deletes', async () => {
    characters.push({ avatar: 'a.png', name: 'Alpha' });
    overlay.selectedCharacters.push(0);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ worldInfos: [] }) });
    popupResult = false;
    await overlay.handleContextMenuDelete();
    expect(popupCalls).toHaveLength(1);
    expect(deleteCharacter).not.toHaveBeenCalled();
    expect(hideLoader).not.toHaveBeenCalled();
});

test('wait condition observes the live send state before deleting', async () => {
    let sending = true;
    const stopGeneration = jest.fn();
    const observed = [];
    registerCharacterLifecycleShellContext({
        state: { get characters() { return characters; }, get is_send_press() { return sending; }, this_chid: undefined, name2: 'neutral', neutralCharacterName: 'neutral' },
        deleteCharacter, stopGeneration, syncReactCharacterLibraryToolbarState: jest.fn(),
    });
    waitUntilCondition.mockImplementation(async check => {
        observed.push(check());
        sending = false;
        observed.push(check());
    });
    characters.push({ avatar: 'a.png', name: 'Alpha' });
    overlay.selectedCharacters.push(0);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ worldInfos: [] }) });
    await overlay.handleContextMenuDelete();
    expect(stopGeneration).toHaveBeenCalledTimes(1);
    expect(waitUntilCondition).toHaveBeenCalledTimes(1);
    expect(observed).toEqual([false, true]);
    expect(deleteCharacter).toHaveBeenCalledTimes(1);
});

test('preflight failure degrades gracefully and passes chat and world options to deletion', async () => {
    characters.push({ avatar: 'a.png', name: 'Alpha' });
    overlay.selectedCharacters.push(0);
    fetchMock.mockRejectedValue(new Error('offline'));
    globalThis.document.getElementById = () => ({ checked: false });
    captureCascadeChoices.mockReturnValue({ deleteWorlds: ['Lore'], clearWorldReferences: true });
    await overlay.handleContextMenuDelete();
    expect(popupCalls[0].html).toContain('Alpha');
    expect(deleteCharacter).toHaveBeenCalledWith(['a.png'], {
        deleteChats: false, deleteWorlds: ['Lore'], clearWorldReferences: true,
        temporaryChatAcknowledged: true, deleteContext: { source: 'bulk', selectedCount: 1 },
    });
    expect(hideLoader).toHaveBeenCalledTimes(1);
});

test('world cascade preflight and selected options are passed through', async () => {
    characters.push({ avatar: 'a.png', name: 'Alpha' });
    overlay.selectedCharacters.push(0);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ worldInfos: [{ name: 'Lore' }] }) });
    captureCascadeChoices.mockReturnValue({ deleteWorlds: ['Lore'], clearWorldReferences: true });
    await overlay.handleContextMenuDelete();
    expect(popupCalls[0].html).toContain('<div>worlds</div>');
    expect(popupCalls[0].options.customButtons).toHaveLength(1);
    expect(deleteCharacter).toHaveBeenCalledWith(['a.png'], expect.objectContaining({
        deleteChats: true, deleteWorlds: ['Lore'], clearWorldReferences: true,
    }));
});
