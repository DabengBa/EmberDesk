import { beforeEach, expect, jest, test } from '@jest/globals';

const characters = [];
const fetchMock = jest.fn();
const getCharacters = jest.fn();
const favsToHotswap = jest.fn();
const emit = jest.fn(() => Promise.resolve());


jest.unstable_mockModule('../public/scripts/events.js', () => ({ eventSource: { on: jest.fn(), emit }, event_types: {} }));
jest.unstable_mockModule('../public/scripts/request-context.js', () => ({ getRequestHeaders: () => ({ 'Content-Type': 'application/json' }) }));
jest.unstable_mockModule('../public/scripts/RossAscends-mods.js', () => ({ favsToHotswap }));
jest.unstable_mockModule('../public/scripts/action-loader.js', () => ({ loader: {}, ToastMode: {} }));
jest.unstable_mockModule('../public/scripts/popup.js', () => ({ POPUP_TYPE: {}, POPUP_RESULT: {}, Popup: class {} }));
jest.unstable_mockModule('../public/scripts/world-cascade-dialog.js', () => ({ buildCascadeSectionHtml: jest.fn(), captureCascadeChoices: jest.fn() }));
jest.unstable_mockModule('../public/scripts/utils.js', () => ({ waitUntilCondition: jest.fn() }));
jest.unstable_mockModule('../public/scripts/constants.js', () => ({ debounce_timeout: { extended: 1 } }));
jest.unstable_mockModule('../public/scripts/tags.js', () => ({
    createBulkTagEditorRuntime: jest.fn(), openCharacterTagManager: jest.fn(),
    getTagKeyForEntity: jest.fn(), getTagsList: jest.fn(), printTagList: jest.fn(),
    tag_map: {}, compareTagsForSort: jest.fn(), removeTagFromMap: jest.fn(), importTags: jest.fn(), tag_import_setting: {},
}));
jest.unstable_mockModule('../public/scripts/i18n.js', () => ({ t: parts => parts.join(''), translate: text => text }));

const { BulkEditOverlay, BulkEditOverlayState, CharacterContextMenu } = await import('../public/scripts/BulkEditOverlay.js');
const { registerCharacterLifecycleShellContext } = await import('../public/scripts/character-lifecycle-shell-context.js');
const overlay = new BulkEditOverlay();
const character = (name, avatar, fav = false) => ({ name, avatar, fav, data: { extensions: { fav } } });
const deferred = () => {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
};

beforeEach(async () => {
    registerCharacterLifecycleShellContext({
        state: { get characters() { return characters; } },
        getCharacters, syncReactCharacterLibraryToolbarState: jest.fn(),
    });
    characters.splice(0);
    overlay.selectedCharacters.splice(0);
    fetchMock.mockReset();
    getCharacters.mockReset().mockResolvedValue(undefined);
    favsToHotswap.mockReset().mockResolvedValue(undefined);
    emit.mockClear();
    globalThis.fetch = fetchMock;
    globalThis.toastr = { error: jest.fn() };
    globalThis.document = { getElementById: jest.fn(() => null) };
    overlay.selectState();
    await Promise.resolve();
});

test('real bulk handler never toggles the replacement row after the selected character moves', async () => {
    const alpha = character('Alpha', 'a.png');
    const beta = character('Beta', 'b.png');
    characters.push(alpha, beta);
    overlay.selectedCharacters.push(0);
    const request = deferred();
    fetchMock.mockReturnValue(request.promise);
    const betaRow = { classList: { toggle: jest.fn() } };
    document.getElementById.mockReturnValue(betaRow);

    const pending = overlay.handleContextMenuFavorite();
    expect(fetchMock).toHaveBeenCalledWith('/api/characters/merge-attributes', expect.objectContaining({
        method: 'POST', headers: { 'Content-Type': 'application/json' },
    }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
        name: 'Alpha', avatar: 'a.png', data: { extensions: { fav: true } }, fav: true,
    });
    characters.splice(0, 2, beta, alpha);
    request.resolve({ ok: true });
    await pending;

    expect(betaRow.classList.toggle).not.toHaveBeenCalled();
    expect(getCharacters).toHaveBeenCalledTimes(1);
    expect(favsToHotswap).toHaveBeenCalledTimes(1);
    expect(overlay.state).toBe(BulkEditOverlayState.browse);
});

test('single favorite resolves after its row is unmounted, rather than rejecting', async () => {
    characters.push(character('Alpha', 'a.png'));
    const request = deferred();
    fetchMock.mockReturnValue(request.promise);
    const pending = CharacterContextMenu.favorite(0);
    request.resolve({ ok: true });
    await expect(pending).resolves.toBeUndefined();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).avatar).toBe('a.png');
});

test('HTTP failure preserves the error message and never toggles a row', async () => {
    characters.push(character('Alpha', 'a.png', true));
    const row = { classList: { toggle: jest.fn() } };
    document.getElementById.mockReturnValue(row);
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ message: 'Denied', error: 'fav' }) });
    await expect(CharacterContextMenu.favorite(0)).resolves.toBeUndefined();
    await Promise.resolve();
    expect(globalThis.toastr.error).toHaveBeenCalledWith('Character not saved. Error: Denied. Field: fav');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).fav).toBe(false);
    expect(row.classList.toggle).not.toHaveBeenCalled();
});

test('mixed success, HTTP failure and network rejection still run the bulk completion flow', async () => {
    characters.push(character('Alpha', 'a.png'), character('Beta', 'b.png'), character('Gamma', 'c.png'));
    overlay.selectedCharacters.push(0, 1, 2);
    fetchMock.mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: false, json: async () => ({ message: 'Denied', error: 'fav' }) })
        .mockRejectedValueOnce(new Error('offline'));
    const row = { classList: { toggle: jest.fn() } };
    document.getElementById.mockReturnValue(row);
    await overlay.handleContextMenuFavorite();
    expect(fetchMock.mock.calls.map(call => JSON.parse(call[1].body).avatar)).toEqual(['a.png', 'b.png', 'c.png']);
    expect(globalThis.toastr.error).toHaveBeenCalledWith('Character not saved. Error: Denied. Field: fav');
    expect(row.classList.toggle).not.toHaveBeenCalled();
    expect(getCharacters).toHaveBeenCalledTimes(1);
    expect(favsToHotswap).toHaveBeenCalledTimes(1);
    expect(overlay.state).toBe(BulkEditOverlayState.browse);
});

test('single network failure remains a rejected operation', async () => {
    characters.push(character('Alpha', 'a.png'));
    fetchMock.mockRejectedValue(new Error('offline'));
    await expect(CharacterContextMenu.favorite(0)).rejects.toThrow('offline');
});
