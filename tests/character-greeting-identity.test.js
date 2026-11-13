import { beforeEach, expect, jest, test } from '@jest/globals';

const state = { settingsReady: true, create_save: {}, characters: [{ avatar: 'a' }], this_chid: 0, favsToHotswap: jest.fn(), chat: [], chat_metadata: {} };
const shell = {
    state,
    getCurrentCharacterAuthoringMode: () => 'edit',
    getCurrentCharacterAuthoringSource: () => state.characters[0],
    getDraftTagIds: jest.fn(() => []),
    applyCharacterAuthoringSaveModel: jest.fn(), getOneCharacter: jest.fn(),
    getFirstMessage: jest.fn((_text, options) => ({ mes: 'transformed new', extra: options?.recordGreetingIdentity ? { greeting_identity: { index: 0, text: 'new', rendered: 'transformed new' } } : {} })),
    clearChat: jest.fn(), printMessages: jest.fn(), saveChatConditional: jest.fn(),
};
jest.unstable_mockModule('../public/scripts/events.js', () => ({ eventSource: { emit: jest.fn() }, event_types: {} }));
jest.unstable_mockModule('../public/scripts/character-authoring.js', () => ({ buildCharacterAuthoringFormData: () => ({ get: () => 'a' }), getCharacterAuthoringWriteUrl: () => '/edit' }));
jest.unstable_mockModule('../public/scripts/character-list-state.js', () => ({ getCharacterDeleteCandidates: jest.fn(), shouldRefreshCharacterAfterEdit: () => true }));
jest.unstable_mockModule('../public/scripts/request-context.js', () => ({ getRequestHeaders: () => ({}) }));
jest.unstable_mockModule('../public/scripts/character-lifecycle-shell-context.js', () => ({ requireCharacterLifecycleShellContext: () => shell }));
const { createOrEditCharacter, saveCharacterAuthoringFromPayload } = await import('../public/scripts/character-lifecycle-service.js');

beforeEach(() => {
    state.chat_metadata = {};
    state.chat = [];
    shell.getFirstMessage.mockClear();
    shell.saveChatConditional.mockClear();
    globalThis.document = { getElementById: () => null };
    globalThis.fetch = jest.fn(async () => ({ ok: true }));
    globalThis.CustomEvent = class CustomEvent {};
    globalThis.FormData = class FormData { get(key) { return key === 'avatar_url' ? 'a' : null; } set() {} delete() {} append() {} };
    globalThis.$ = () => ({ html() { return this; }, get() { return {}; }, attr() { return 'editcharacter'; }, val() { return this; }, clone() { return this; }, replaceWith() { return this; }, data() { return 0; } });
});

const paths = [
    ['authoring', () => saveCharacterAuthoringFromPayload({ fields: { name: 'Character' }, changedFields: ['firstMessage'] })],
    ['legacy', () => createOrEditCharacter()],
];
test.each(paths)('%s preserves known greeting identity when regenerating', async (_name, save) => {
    state.chat = [{ mes: 'transformed old', extra: { greeting_identity: { index: 0, text: 'old', rendered: 'transformed old' } } }];
    await save();
    expect(state.chat[0].extra.greeting_identity).toEqual({ index: 0, text: 'new', rendered: 'transformed new' });
    expect(shell.saveChatConditional).toHaveBeenCalled();
});

test.each(paths)('%s does not infer identity for unknown or modified history', async (_name, save) => {
    for (const extra of [{}, { greeting_identity: { index: 0, text: 'old', rendered: 'different' } }]) {
        state.chat = [{ mes: 'transformed old', extra }];
        await save();
        expect(state.chat[0].extra.greeting_identity).toBeUndefined();
    }
});

test.each(paths)('%s leaves explicitly selected or tainted greetings untouched', async (_name, save) => {
    for (const metadata of [{ greeting: { index: 1, text: 'selected' } }, { tainted: true }]) {
        const message = { mes: 'transformed old', extra: { greeting_identity: { index: 0, text: 'old', rendered: 'transformed old' } } };
        state.chat = [message];
        state.chat_metadata = metadata;
        shell.saveChatConditional.mockClear();
        await save();
        expect(state.chat[0]).toBe(message);
        expect(shell.saveChatConditional).not.toHaveBeenCalled();
    }
});
