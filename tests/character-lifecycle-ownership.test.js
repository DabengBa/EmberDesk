import { beforeEach, expect, jest, test } from '@jest/globals';

const emit = jest.fn(async () => {});
jest.unstable_mockModule('../public/scripts/events.js', () => ({ eventSource: { emit }, event_types: { CHARACTER_EDITED: 'edited', CHARACTER_DUPLICATED: 'duplicated' } }));
jest.unstable_mockModule('../public/scripts/character-authoring.js', () => ({ buildCharacterAuthoringFormData: jest.fn(), getCharacterAuthoringWriteUrl: jest.fn() }));
jest.unstable_mockModule('../public/scripts/character-list-state.js', () => ({ getCharacterDeleteCandidates: jest.fn(), shouldRefreshCharacterAfterEdit: () => true }));
jest.unstable_mockModule('../public/scripts/request-context.js', () => ({ getRequestHeaders: () => ({}) }));
jest.unstable_mockModule('../public/scripts/workspace-panels-react-bridge.js', () => ({ loadWorkspacePanelsModule: jest.fn() }));
const { registerCharacterLifecycleShellContext } = await import('../public/scripts/character-lifecycle-shell-context.js');
const lifecycle = await import('../public/scripts/character-lifecycle-service.js');
let state, shell, identity;

beforeEach(() => {
    emit.mockClear();
    identity = {};
    state = { settingsReady: true, this_chid: '0', characters: [{ avatar: 'alice.png', data: {} }, { avatar: 'bob.png', data: {} }], chat: [], chat_metadata: {}, favsToHotswap: jest.fn() };
    shell = {
        state, getDraftTagIds: () => [], getCharacterWorldDraftIdentity: () => identity,
        getOneCharacter: jest.fn(async () => {}), getFirstMessage: jest.fn(() => ({ mes: 'Alice greeting' })),
        clearChat: jest.fn(async () => {}), printMessages: jest.fn(), saveChatConditional: jest.fn(),
        t: strings => strings.join(''),
    };
    registerCharacterLifecycleShellContext(shell);
    const field = { html() { return this; }, get: () => ({}), attr: (_name, value) => value === undefined ? 'editcharacter' : field, data: () => '0', val(value) { return value === undefined ? '' : this; }, clone() { return this; }, replaceWith() {} };
    globalThis.$ = () => field;
    globalThis.FormData = class extends Map { constructor() { super([['avatar_url', 'alice.png']]); } };
    globalThis.CustomEvent = class {};
    globalThis.toastr = { error: jest.fn(), warning: jest.fn(), success: jest.fn(), info: jest.fn() };
});

test('a completed edit refreshes its card but does not touch another selected chat', async () => {
    let respond;
    globalThis.fetch = jest.fn(() => new Promise(resolve => { respond = resolve; }));
    const saving = lifecycle.createOrEditCharacter();
    state.this_chid = '1';
    identity = {};
    const bobChat = [{ mes: 'Bob conversation' }];
    state.chat = bobChat;
    respond({ ok: true });
    await saving;
    expect(shell.getOneCharacter).toHaveBeenCalledWith('alice.png');
    expect(shell.getFirstMessage).not.toHaveBeenCalled();
    expect(shell.clearChat).not.toHaveBeenCalled();
    expect(state.chat).toBe(bobChat);
    expect(emit).not.toHaveBeenCalledWith('edited', expect.objectContaining({ detail: expect.objectContaining({ id: '1' }) }));
});

test('leaving and reopening the same character invalidates an earlier edit completion', async () => {
    let refreshed;
    globalThis.fetch = jest.fn(async () => ({ ok: true }));
    shell.getOneCharacter.mockImplementation(() => new Promise(resolve => { refreshed = resolve; }));
    const saving = lifecycle.createOrEditCharacter();
    for (let i = 0; i < 8 && !refreshed; i++) await Promise.resolve();
    identity = {};
    refreshed();
    await saving;
    expect(shell.getFirstMessage).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
});
