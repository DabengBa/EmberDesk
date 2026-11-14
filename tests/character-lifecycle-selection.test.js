import { beforeEach, expect, jest, test } from '@jest/globals';

const emit = jest.fn(async () => {});
jest.unstable_mockModule('../public/scripts/events.js', () => ({ eventSource: { emit }, event_types: { CHARACTER_DUPLICATED: 'duplicated' } }));
jest.unstable_mockModule('../public/scripts/character-authoring.js', () => ({ buildCharacterAuthoringFormData: jest.fn(), getCharacterAuthoringWriteUrl: jest.fn() }));
jest.unstable_mockModule('../public/scripts/character-list-state.js', () => ({ getCharacterDeleteCandidates: jest.fn(), shouldRefreshCharacterAfterEdit: jest.fn() }));
jest.unstable_mockModule('../public/scripts/request-context.js', () => ({ getRequestHeaders: () => ({ 'Content-Type': 'application/json' }) }));
jest.unstable_mockModule('../public/scripts/workspace-panels-react-bridge.js', () => ({ loadWorkspacePanelsModule: jest.fn() }));
const { registerCharacterLifecycleShellContext } = await import('../public/scripts/character-lifecycle-shell-context.js');
const { selectCharacterById, duplicateCharacter } = await import('../public/scripts/character-lifecycle-service.js');
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
