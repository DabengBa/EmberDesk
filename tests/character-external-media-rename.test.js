import { beforeEach, expect, jest, test } from '@jest/globals';

const state = {};
const shell = {
    state, t: strings => strings[0], getCharaFilename: (_id, options) => options.manualAvatarKey,
    renameTagKey: jest.fn(), deleteTagKey: avatar => { delete state.tag_map[avatar]; }, saveSettingsDebounced: jest.fn(), delay: jest.fn(),
    setCharacterId: id => { state.this_chid = id; },
    prepareChatTransition: jest.fn(async () => {}),
    getCharacters: () => { state.characters = [{ name: 'New', avatar: 'new.png' }]; },
    selectCharacterById: id => { state.this_chid = id; },
};
jest.unstable_mockModule('../public/scripts/events.js', () => ({ eventSource: { emit: jest.fn() }, event_types: {} }));
jest.unstable_mockModule('../public/scripts/character-authoring.js', () => ({ buildCharacterAuthoringFormData: jest.fn(), getCharacterAuthoringWriteUrl: jest.fn() }));
jest.unstable_mockModule('../public/scripts/character-list-state.js', () => ({ getCharacterDeleteCandidates: (characters, ids) => ids.map(avatar => ({ avatar, character: characters.find(c => c.avatar === avatar), index: 0 })), shouldRefreshCharacterAfterEdit: jest.fn() }));
jest.unstable_mockModule('../public/scripts/request-context.js', () => ({ getRequestHeaders: () => ({}) }));
jest.unstable_mockModule('../public/scripts/character-lifecycle-shell-context.js', () => ({ requireCharacterLifecycleShellContext: () => shell }));
const { renameCharacter, deleteCharacter } = await import('../public/scripts/character-lifecycle-service.js');
const { setCharacterExternalMediaAuthorization } = await import('../public/scripts/character-external-media-authorization.js');

beforeEach(() => {
    Object.assign(state, { characters: [{ name: 'Old', avatar: 'old.png' }], this_chid: 0, world_info: {}, active_character: null,
        power_user: { external_media_allowed_overrides: ['old.png', 'other.png'], external_media_forbidden_overrides: ['old.png', 'blocked.png'] } });
    shell.saveSettingsDebounced.mockClear();
    shell.prepareChatTransition.mockReset().mockResolvedValue(undefined);
    globalThis.toastr = { success: jest.fn(), error: jest.fn(), warning: jest.fn() };
    globalThis.location = { reload: jest.fn() };
    globalThis.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ avatar: 'new.png' }) }));
});

test('rename does not send a request when chat recovery cannot be checkpointed', async () => {
    shell.prepareChatTransition.mockRejectedValueOnce(new Error('recovery unavailable'));
    expect(await renameCharacter('New', { silent: true, renameChats: false })).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(state.characters[state.this_chid].avatar).toBe('old.png');
    expect(location.reload).not.toHaveBeenCalled();
});

test('rename retains the current chat when a write starts after the server commit', async () => {
    shell.prepareChatTransition.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('write pending'));
    expect(await renameCharacter('New', { silent: true, renameChats: false })).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(state.characters[state.this_chid].avatar).toBe('old.png');
    expect(location.reload).not.toHaveBeenCalled();
});

test('successful rename moves historical grants and denials, leaving no reusable old avatar grant', async () => {
    expect(await renameCharacter('New', { silent: true, renameChats: false })).toBe(true);
    expect(state.power_user.external_media_allowed_overrides).toEqual(['new.png', 'other.png']);
    expect(state.power_user.external_media_forbidden_overrides).toEqual(['new.png', 'blocked.png']);
    expect(shell.saveSettingsDebounced).not.toHaveBeenCalled();
});

test('failed rename does not alter the authorization', async () => {
    globalThis.fetch = jest.fn(async () => ({ ok: false }));
    expect(await renameCharacter('New', { silent: true })).toBe(false);
    expect(state.power_user.external_media_allowed_overrides).toEqual(['old.png', 'other.png']);
    expect(shell.saveSettingsDebounced).not.toHaveBeenCalled();
});

test('stale rename snapshot cannot restore a later revocation', async () => {
    state.settingsDocumentRevision = 12;
    state.power_user.external_media_allowed_overrides = [];
    globalThis.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ avatar: 'new.png', settings_revision: 11, mediaAuthorization: { external_media_allowed_overrides: ['new.png'] } }) }));
    expect(await renameCharacter('New', { silent: true, renameChats: false })).toBe(true);
    expect(state.power_user.external_media_allowed_overrides).toEqual([]);
    expect(state.settingsDocumentRevision).toBe(12);
});

test('rename retires the old local grant even when an unrelated settings save is newer', async () => {
    state.settingsDocumentRevision = 12;
    globalThis.fetch = jest.fn(async () => ({ ok: true, json: async () => ({
        avatar: 'new.png',
        settings_revision: 11,
        mediaAuthorization: { external_media_allowed_overrides: ['new.png'] },
    }) }));
    expect(await renameCharacter('New', { silent: true, renameChats: false })).toBe(true);
    expect(state.power_user.external_media_allowed_overrides).toEqual(['new.png', 'other.png']);
    expect(state.power_user.external_media_allowed_overrides).not.toContain('old.png');
    expect(state.settingsDocumentRevision).toBe(12);
});

test('successful deletion removes the old authorization so a reused avatar is not trusted', async () => {
    Object.assign(shell, { cancelCharacterSave: jest.fn(), closeCurrentChatForDelete: async () => true,
        getPastCharacterChats: async () => [], markPerfInteractionMetric: jest.fn(), select_rm_info: jest.fn(), removeCharacterFromUI: jest.fn() });
    Object.assign(state, { accountStorage: { removeItem: jest.fn() }, tag_map: {}, characterDeleteReconcileGeneration: 0 });
    expect(await deleteCharacter('old.png', { deleteWorlds: [] })).toBe(true);
    expect(state.power_user.external_media_allowed_overrides).toEqual(['other.png']);
    expect(state.power_user.external_media_forbidden_overrides).toEqual(['blocked.png']);
    expect(shell.saveSettingsDebounced).not.toHaveBeenCalled();
});

test('a pending revoke that fails after a rename cannot restore the old avatar grant', async () => {
    state.settingsDocumentRevision = 12;
    state.power_user.external_media_allowed_overrides = ['old.png', 'other.png'];
    let reject;
    const pending = new Promise((_, r) => { reject = r; });
    const revoke = setCharacterExternalMediaAuthorization({
        settings: state.power_user,
        characterId: 'old.png',
        allowed: false,
        getCurrentCharacterId: () => state.characters[state.this_chid]?.avatar,
        save: () => pending,
        refresh: () => {},
    });
    expect(state.power_user.external_media_allowed_overrides).toEqual(['other.png']);
    globalThis.fetch = jest.fn(async () => ({ ok: true, json: async () => ({
        avatar: 'new.png',
        settings_revision: 11,
        mediaAuthorization: { external_media_allowed_overrides: ['new.png'], external_media_forbidden_overrides: [] },
    }) }));
    expect(await renameCharacter('New', { silent: true, renameChats: false })).toBe(true);
    reject(new Error('offline'));
    await revoke;
    expect(state.power_user.external_media_allowed_overrides).toEqual(['other.png']);
    expect(state.power_user.external_media_allowed_overrides).not.toContain('old.png');
    expect(state.power_user.external_media_allowed_overrides).not.toContain('new.png');
    expect(state.settingsDocumentRevision).toBe(12);
});

test('a pending grant that fails after a rename cannot leave the successor grant behind', async () => {
    state.settingsDocumentRevision = 12;
    state.power_user.external_media_allowed_overrides = [];
    state.power_user.external_media_forbidden_overrides = [];
    let reject;
    const pending = new Promise((_, r) => { reject = r; });
    const grant = setCharacterExternalMediaAuthorization({
        settings: state.power_user,
        characterId: 'old.png',
        allowed: true,
        getCurrentCharacterId: () => state.characters[state.this_chid]?.avatar,
        save: () => pending,
        refresh: () => {},
    });
    expect(state.power_user.external_media_allowed_overrides).toEqual(['old.png']);
    // No authorization snapshot: the rename moves the optimistic grant locally.
    expect(await renameCharacter('New', { silent: true, renameChats: false })).toBe(true);
    expect(state.power_user.external_media_allowed_overrides).toEqual(['new.png']);
    reject(new Error('offline'));
    await grant;
    expect(state.power_user.external_media_allowed_overrides).toEqual([]);
});

test('a pending grant failure cannot remove a successor grant from a current rename snapshot', async () => {
    state.settingsDocumentRevision = null;
    state.power_user.external_media_allowed_overrides = [];
    state.power_user.external_media_forbidden_overrides = [];
    let reject;
    const pending = new Promise((_, r) => { reject = r; });
    const grant = setCharacterExternalMediaAuthorization({
        settings: state.power_user,
        characterId: 'old.png',
        allowed: true,
        getCurrentCharacterId: () => state.characters[state.this_chid]?.avatar,
        save: () => pending,
        refresh: () => {},
    });
    globalThis.fetch = jest.fn(async () => ({ ok: true, json: async () => ({
        avatar: 'new.png',
        settings_revision: 12,
        mediaAuthorization: { external_media_allowed_overrides: ['new.png'], external_media_forbidden_overrides: [] },
    }) }));
    expect(await renameCharacter('New', { silent: true, renameChats: false })).toBe(true);
    expect(state.power_user.external_media_allowed_overrides).toEqual(['new.png']);
    expect(state.settingsDocumentRevision).toBe(12);
    reject(new Error('offline'));
    await grant;
    // The rename snapshot is authoritative server state; a failed optimistic
    // grant must not delete the successor grant it reported.
    expect(state.power_user.external_media_allowed_overrides).toEqual(['new.png']);
});

test('a pending revoke that fails after deletion cannot restore the deleted avatar grant', async () => {
    Object.assign(shell, { cancelCharacterSave: jest.fn(), closeCurrentChatForDelete: async () => true,
        getPastCharacterChats: async () => [], markPerfInteractionMetric: jest.fn(), select_rm_info: jest.fn(), removeCharacterFromUI: jest.fn() });


    Object.assign(state, { accountStorage: { removeItem: jest.fn() }, tag_map: {}, characterDeleteReconcileGeneration: 0 });
    let reject;
    const pending = new Promise((_, r) => { reject = r; });
    const revoke = setCharacterExternalMediaAuthorization({
        settings: state.power_user,
        characterId: 'old.png',
        allowed: false,
        getCurrentCharacterId: () => 'old.png',
        save: () => pending,
        refresh: () => {},
    });
    expect(await deleteCharacter('old.png', { deleteWorlds: [] })).toBe(true);
    reject(new Error('offline'));
    await revoke;
    expect(state.power_user.external_media_allowed_overrides).toEqual(['other.png']);
    expect(state.power_user.external_media_forbidden_overrides).toEqual(['blocked.png']);
});

test.each([true, false])('current rename snapshot merges unchanged characters (concurrent grant succeeds: %s)', async succeeds => {
    state.settingsDocumentRevision = 10;
    state.power_user.external_media_allowed_overrides = ['old.png', 'stale.png'];
    state.power_user.external_media_forbidden_overrides = ['old.png', 'other.png', 'stale.png'];
    let releaseRename, settle;
    const renameResponse = new Promise(r => { releaseRename = r; });
    const authorizationResponse = new Promise((resolve, reject) => { settle = succeeds ? resolve : reject; });
    globalThis.fetch = jest.fn(() => renameResponse);
    const rename = renameCharacter('New', { silent: true, renameChats: false });
    const grant = setCharacterExternalMediaAuthorization({ settings: state.power_user, characterId: 'other.png', allowed: true,
        getCurrentCharacterId: () => 'other.png', save: () => authorizationResponse, refresh: () => {} });
    releaseRename({ ok: true, json: async () => ({ avatar: 'new.png', settings_revision: 11,
        mediaAuthorization: { external_media_allowed_overrides: ['new.png', 'server.png'], external_media_forbidden_overrides: ['new.png', 'other.png', 'server-blocked.png'] } }) });
    expect(await rename).toBe(true);
    expect(state.power_user.external_media_allowed_overrides).toEqual(expect.arrayContaining(['new.png', 'other.png', 'server.png']));
    expect(state.power_user.external_media_allowed_overrides).not.toContain('stale.png');
    expect(state.power_user.external_media_forbidden_overrides).not.toContain('other.png');
    expect(state.power_user.external_media_forbidden_overrides).toContain('server-blocked.png');
    settle(new Error('offline'));
    expect(await grant).toBe(succeeds);
    expect(state.power_user.external_media_allowed_overrides.includes('other.png')).toBe(succeeds);
    expect(state.power_user.external_media_forbidden_overrides.includes('other.png')).toBe(!succeeds);
});

test.each([true, false])('completed concurrent revoke survives rename snapshot (succeeds: %s)', async succeeds => {
    state.settingsDocumentRevision = 10;
    let releaseRename, settle;
    const renameResponse = new Promise(r => { releaseRename = r; });
    const authorizationResponse = new Promise((resolve, reject) => { settle = succeeds ? resolve : reject; });
    globalThis.fetch = jest.fn(() => renameResponse);
    const rename = renameCharacter('New', { silent: true, renameChats: false });
    const revoke = setCharacterExternalMediaAuthorization({ settings: state.power_user, characterId: 'other.png', allowed: false,
        getCurrentCharacterId: () => 'other.png', save: () => authorizationResponse, refresh: () => {} });
    settle(new Error('offline'));
    expect(await revoke).toBe(succeeds);
    releaseRename({ ok: true, json: async () => ({ avatar: 'new.png', settings_revision: 11,
        mediaAuthorization: { external_media_allowed_overrides: ['new.png', 'other.png', 'server.png'], external_media_forbidden_overrides: [] } }) });
    expect(await rename).toBe(true);
    expect(state.power_user.external_media_allowed_overrides.includes('other.png')).toBe(!succeeds);
    expect(state.power_user.external_media_allowed_overrides).toContain('server.png');
});

test.each([true, false])('pending unrelated revoke preserves local state until it settles (succeeds: %s)', async succeeds => {
    state.settingsDocumentRevision = 10;
    let settle;
    const response = new Promise((resolve, reject) => { settle = succeeds ? resolve : reject; });
    const revoke = setCharacterExternalMediaAuthorization({ settings: state.power_user, characterId: 'other.png', allowed: false,
        getCurrentCharacterId: () => 'other.png', save: () => response, refresh: () => {} });
    globalThis.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ avatar: 'new.png', settings_revision: 11,
        mediaAuthorization: { external_media_allowed_overrides: ['new.png', 'other.png'], external_media_forbidden_overrides: [] } }) }));
    expect(await renameCharacter('New', { silent: true, renameChats: false })).toBe(true);
    expect(state.power_user.external_media_allowed_overrides).not.toContain('other.png');
    settle(new Error('offline'));
    expect(await revoke).toBe(succeeds);
    expect(state.power_user.external_media_allowed_overrides.includes('other.png')).toBe(!succeeds);
});

test.each([true, false])('completed concurrent grant survives rename snapshot (succeeds: %s)', async succeeds => {
    state.settingsDocumentRevision = 10;
    state.power_user.external_media_allowed_overrides = ['old.png'];
    let releaseRename, settle;
    const renameResponse = new Promise(r => { releaseRename = r; });
    const authorizationResponse = new Promise((resolve, reject) => { settle = succeeds ? resolve : reject; });
    globalThis.fetch = jest.fn(() => renameResponse);
    const rename = renameCharacter('New', { silent: true, renameChats: false });
    const grant = setCharacterExternalMediaAuthorization({ settings: state.power_user, characterId: 'other.png', allowed: true,
        getCurrentCharacterId: () => 'other.png', save: () => authorizationResponse, refresh: () => {} });
    settle(new Error('offline'));
    expect(await grant).toBe(succeeds);
    releaseRename({ ok: true, json: async () => ({ avatar: 'new.png', settings_revision: 11,
        mediaAuthorization: { external_media_allowed_overrides: ['new.png'], external_media_forbidden_overrides: [] } }) });
    expect(await rename).toBe(true);
    expect(state.power_user.external_media_allowed_overrides.includes('other.png')).toBe(succeeds);
});

test.each([[true, true], [true, false], [false, true], [false, false]])(
    'pending old-avatar authorization (grant: %s, succeeds: %s) respects current rename snapshot', async (allowed, succeeds) => {
        state.settingsDocumentRevision = 10;
        state.power_user.external_media_allowed_overrides = allowed ? [] : ['old.png'];
        let settle;
        const response = new Promise((resolve, reject) => { settle = succeeds ? resolve : reject; });
        const authorization = setCharacterExternalMediaAuthorization({ settings: state.power_user, characterId: 'old.png', allowed,
            getCurrentCharacterId: () => 'old.png', save: () => response, refresh: () => {} });
        globalThis.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ avatar: 'new.png', settings_revision: 11,
            mediaAuthorization: { external_media_allowed_overrides: ['new.png'], external_media_forbidden_overrides: [] } }) }));
        expect(await renameCharacter('New', { silent: true, renameChats: false })).toBe(true);
        expect(state.power_user.external_media_allowed_overrides.includes('new.png')).toBe(allowed);
        settle(new Error('offline'));
        expect(await authorization).toBe(succeeds);
        expect(state.power_user.external_media_allowed_overrides).not.toContain('old.png');
        expect(state.power_user.external_media_allowed_overrides.includes('new.png')).toBe(allowed);
    },
);
test('an unrelated pending revoke survives an older rename snapshot and its successful response', async () => {
    state.settingsDocumentRevision = 10;
    let resolve;
    const pending = new Promise(r => { resolve = r; });
    const revoke = setCharacterExternalMediaAuthorization({ settings: state.power_user, characterId: 'other.png', allowed: false,
        getCurrentCharacterId: () => 'other.png', save: () => pending, refresh: () => {} });
    globalThis.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ avatar: 'new.png', settings_revision: 11,
        mediaAuthorization: { external_media_allowed_overrides: ['new.png', 'other.png'], external_media_forbidden_overrides: ['new.png', 'blocked.png'] } }) }));
    expect(await renameCharacter('New', { silent: true, renameChats: false })).toBe(true);
    expect(state.power_user.external_media_allowed_overrides).not.toContain('other.png');
    resolve();
    expect(await revoke).toBe(true);
    expect(state.power_user.external_media_allowed_overrides).not.toContain('other.png');
});

test('an older rename snapshot cannot resurrect an unrelated deleted character', async () => {
    state.settingsDocumentRevision = 10;
    state.characters.push({ name: 'Other', avatar: 'other.png' });


    Object.assign(shell, { cancelCharacterSave: jest.fn(), closeCurrentChatForDelete: async () => true,
        getPastCharacterChats: async () => [], markPerfInteractionMetric: jest.fn(), select_rm_info: jest.fn(), removeCharacterFromUI: jest.fn() });
    Object.assign(state, { accountStorage: { removeItem: jest.fn() }, tag_map: {}, characterDeleteReconcileGeneration: 0 });
    let release;
    const response = new Promise(r => { release = r; });
    globalThis.fetch = jest.fn(async url => url.endsWith('/rename') ? response : { ok: true });
    const rename = renameCharacter('New', { silent: true, renameChats: false });
    expect(await deleteCharacter('other.png', { deleteWorlds: [] })).toBe(true);
    release({ ok: true, json: async () => ({ avatar: 'new.png', settings_revision: 11,
        mediaAuthorization: { external_media_allowed_overrides: ['new.png', 'other.png'], external_media_forbidden_overrides: ['new.png', 'blocked.png'] } }) });
    expect(await rename).toBe(true);
    expect(state.power_user.external_media_allowed_overrides).not.toContain('other.png');
});

test('a later deletion of the rename successor is not undone by the delayed rename response', async () => {
    state.settingsDocumentRevision = 10;
    state.characters.push({ name: 'New', avatar: 'new.png' });
    Object.assign(shell, { cancelCharacterSave: jest.fn(), closeCurrentChatForDelete: async () => true,
        getPastCharacterChats: async () => [], markPerfInteractionMetric: jest.fn(), select_rm_info: jest.fn(), removeCharacterFromUI: jest.fn() });
    Object.assign(state, { accountStorage: { removeItem: jest.fn() }, tag_map: {}, characterDeleteReconcileGeneration: 0 });
    let release;
    const response = new Promise(r => { release = r; });
    globalThis.fetch = jest.fn(async url => url.endsWith('/rename') ? response : { ok: true });
    const rename = renameCharacter('New', { silent: true, renameChats: false });
    expect(await deleteCharacter('new.png', { deleteWorlds: [] })).toBe(true);
    release({ ok: true, json: async () => ({ avatar: 'new.png', settings_revision: 11,
        mediaAuthorization: { external_media_allowed_overrides: ['new.png'], external_media_forbidden_overrides: [] } }) });
    expect(await rename).toBe(true);
    expect(state.power_user.external_media_allowed_overrides).not.toContain('new.png');
});

test('a pending revoke of the successor survives the delayed rename snapshot', async () => {
    state.settingsDocumentRevision = 10;
    let releaseRename, releaseRevoke;
    const renameResponse = new Promise(r => { releaseRename = r; });


    const revokeResponse = new Promise(r => { releaseRevoke = r; });
    globalThis.fetch = jest.fn(() => renameResponse);
    const rename = renameCharacter('New', { silent: true, renameChats: false });
    const revoke = setCharacterExternalMediaAuthorization({ settings: state.power_user, characterId: 'new.png', allowed: false,
        getCurrentCharacterId: () => 'new.png', save: () => revokeResponse, refresh: () => {} });
    releaseRename({ ok: true, json: async () => ({ avatar: 'new.png', settings_revision: 11,
        mediaAuthorization: { external_media_allowed_overrides: ['new.png'], external_media_forbidden_overrides: [] } }) });
    expect(await rename).toBe(true);
    expect(state.power_user.external_media_allowed_overrides).not.toContain('new.png');
    releaseRevoke();
    expect(await revoke).toBe(true);
    expect(state.power_user.external_media_allowed_overrides).not.toContain('new.png');
});

test('a pending revoke of the renamed character is not overwritten by its rename snapshot', async () => {
    state.settingsDocumentRevision = 10;
    let resolve;
    const pending = new Promise(r => { resolve = r; });
    const revoke = setCharacterExternalMediaAuthorization({ settings: state.power_user, characterId: 'old.png', allowed: false,
        getCurrentCharacterId: () => 'old.png', save: () => pending, refresh: () => {} });
    globalThis.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ avatar: 'new.png', settings_revision: 11,
        mediaAuthorization: { external_media_allowed_overrides: ['new.png', 'other.png'], external_media_forbidden_overrides: [] } }) }));
    expect(await renameCharacter('New', { silent: true, renameChats: false })).toBe(true);
    expect(state.power_user.external_media_allowed_overrides).not.toContain('new.png');
    resolve();
    expect(await revoke).toBe(true);
    expect(state.power_user.external_media_allowed_overrides).not.toContain('new.png');
});

test('a failed pending revoke cannot restore a membership a newer rename snapshot removed', async () => {
    state.settingsDocumentRevision = 10;
    let reject;
    const pending = new Promise((_, r) => { reject = r; });
    const revoke = setCharacterExternalMediaAuthorization({ settings: state.power_user, characterId: 'other.png', allowed: false,
        getCurrentCharacterId: () => 'other.png', save: () => pending, refresh: () => {} });
    expect(state.power_user.external_media_allowed_overrides).toEqual(['old.png']);
    globalThis.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ avatar: 'new.png', settings_revision: 11,
        mediaAuthorization: { external_media_allowed_overrides: ['new.png'], external_media_forbidden_overrides: ['new.png', 'blocked.png'] } }) }));
    expect(await renameCharacter('New', { silent: true, renameChats: false })).toBe(true);
    expect(state.power_user.external_media_allowed_overrides).toEqual(['new.png']);
    reject(new Error('offline'));
    expect(await revoke).toBe(false);
    expect(state.power_user.external_media_allowed_overrides).toEqual(['new.png']);
    expect(state.power_user.external_media_forbidden_overrides).toEqual(expect.arrayContaining(['new.png', 'blocked.png']));
});

test('a revocation retired by a 404 cannot be replaced by the successor grant from a rename snapshot', async () => {
    state.settingsDocumentRevision = 10;
    const error = new Error('CSS authorization save failed: 404');
    error.retireAuthorization = true;
    const revoke = setCharacterExternalMediaAuthorization({ settings: state.power_user, characterId: 'old.png', allowed: false,
        getCurrentCharacterId: () => 'old.png', save: async () => { throw error; }, refresh: () => {} });
    expect(await revoke).toBe(false);
    expect(state.power_user.external_media_allowed_overrides).toEqual(['other.png']);
    globalThis.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ avatar: 'new.png', settings_revision: 11,
        mediaAuthorization: { external_media_allowed_overrides: ['new.png', 'other.png'], external_media_forbidden_overrides: [] } }) }));
    expect(await renameCharacter('New', { silent: true, renameChats: false })).toBe(true);
    expect(state.power_user.external_media_allowed_overrides).toEqual(['other.png']);
});

test('a failed old grant cannot remove a newer successor grant after local rename migration', async () => {
    state.settingsDocumentRevision = 10;
    state.power_user.external_media_allowed_overrides = [];
    state.power_user.external_media_forbidden_overrides = [];
    let reject;
    const pending = new Promise((_, r) => { reject = r; });


    const grant = setCharacterExternalMediaAuthorization({ settings: state.power_user, characterId: 'old.png', allowed: true,
        getCurrentCharacterId: () => 'old.png', save: () => pending, refresh: () => {} });
    expect(state.power_user.external_media_allowed_overrides).toEqual(['old.png']);
    expect(await renameCharacter('New', { silent: true, renameChats: false })).toBe(true);
    expect(state.power_user.external_media_allowed_overrides).toEqual(['new.png']);
    expect(await setCharacterExternalMediaAuthorization({ settings: state.power_user, characterId: 'new.png', allowed: true,
        getCurrentCharacterId: () => 'new.png', save: async () => {}, refresh: () => {} })).toBe(true);
    reject(new Error('offline'));
    expect(await grant).toBe(false);
    expect(state.power_user.external_media_allowed_overrides).toEqual(['new.png']);
});

test('a grant retired by a 404 is not migrated by a later rename without a snapshot', async () => {
    state.power_user.external_media_allowed_overrides = [];
    state.power_user.external_media_forbidden_overrides = [];
    const error = new Error('CSS authorization save failed: 404');
    error.retireAuthorization = true;
    expect(await setCharacterExternalMediaAuthorization({ settings: state.power_user, characterId: 'old.png', allowed: true,
        getCurrentCharacterId: () => 'old.png', save: async () => { throw error; }, refresh: () => {} })).toBe(false);
    expect(await renameCharacter('New', { silent: true, renameChats: false })).toBe(true);
    expect(state.power_user.external_media_allowed_overrides).toEqual([]);
});
