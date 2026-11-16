import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/scripts/chat-ops-service.js', import.meta.url), 'utf8');

test('opening a chat updates the hidden chat name before saving the character without jQuery', async () => {
    const code = source.slice(source.indexOf('export async function openCharacterChat('), source.indexOf('/**\n * Fetches the metadata of all past chats'));
    const input = { value: 'old' };
    const state = { isChatSaving: false, characters: [{ chat: 'old' }], this_chid: 0, chat_metadata: { old: true }, mainChatVisibleStartIndices: new Map() };
    const save = jest.fn(async () => { expect(input.value).toBe('new'); });
    const env = {
        state, globalThis: { document: { getElementById: id => id === 'selected_chat_pole' ? input : null } },
        waitUntilCondition: async () => {}, debounce_timeout: { extended: 1 },
        getCurrentChatId: () => 'old', clearChat: jest.fn(async () => {}), getChat: async () => true,
        createOrEditCharacter: save, CustomEvent: class { constructor(type) { this.type = type; } },
        $: () => { throw Error('chat selection must not depend on jQuery'); },
    };
    const open = new Function(...Object.keys(env), `${code.replace('export ', '')}; return openCharacterChat;`)(...Object.values(env));
    await open('new');
    expect(state.characters[0].chat).toBe('new');
    expect(state.chat_metadata).toEqual({});
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ type: 'newChat' }));
});

test('closing a deleted chat clears only direct heading children before selecting the character view', async () => {
    const code = source.slice(source.indexOf('export async function closeCurrentChatForDelete()'));
    const heading = { textContent: 'name' };
    const nestedHeading = { textContent: 'keep' };
    const select = jest.fn();
    const state = { is_send_press: false, isChatSaving: false };
    const env = {
        state, globalThis: { document: { getElementById: () => ({ children: [heading, nestedHeading] }) } },
        runDeleteCharacterClosePreflight: async options => { options.selectCharactersView(); return true; },
        select_rm_characters: select,
        $: () => { throw Error('chat closing must not depend on jQuery'); },
    };
    heading.tagName = 'H2'; nestedHeading.tagName = 'DIV';
    const close = new Function(...Object.keys(env), `${code.replace('export ', '')}; return closeCurrentChatForDelete;`)(...Object.values(env));
    await expect(close()).resolves.toBe(true);
    expect(heading.textContent).toBe('');
    expect(nestedHeading.textContent).toBe('keep');
    expect(select).toHaveBeenCalledTimes(1);
});

test('renaming the active chat applies the server-sanitized name before saving and reload', async () => {
    const code = source.slice(source.indexOf('export async function renameCharacterChat('), source.indexOf('export async function closeCurrentChatForDelete()'));
    const input = { value: 'old' };
    const state = { characters: [{ chat: 'old', avatar: 'a.png' }], this_chid: 0, chat: [] };
    const order = [];
    const env = {
        state, chatSessionVersion: 1, getCurrentChatId: () => 'old', equalsIgnoreCaseAndAccents: () => false,
        withCurrentChatDeleteVersion: async () => ({ ok: true, json: async () => ({ version: 'v', sanitizedFileName: 'safe' }) }),
        renameComposerDraftContext: () => order.push('draft'),
        globalThis: { document: { getElementById: () => input } },
        createOrEditCharacter: async () => { expect(input.value).toBe('safe'); order.push('save'); },
        reloadCurrentChat: async () => order.push('reload'),
        eventSource: { emit: async () => order.push('event') }, event_types: { CHAT_RENAMED: 'renamed' },
        toastr: { error: jest.fn() }, t: strings => strings[0],
        $: () => { throw Error('chat rename must not depend on jQuery'); },
    };
    const rename = new Function(...Object.keys(env), `${code.replace('export ', '')}; return renameCharacterChat;`)(...Object.values(env));
    await expect(rename({ characterId: 0, oldFileName: 'old', newFileName: 'unsafe', loader: false })).resolves.toBe(true);
    expect(state.characters[0].chat).toBe('safe');
    expect(order).toEqual(['draft', 'save', 'reload', 'event']);
});

test.each([
    ['visible interactive element by width', { matches: () => true, offsetWidth: 1, offsetHeight: 0, getClientRects: () => [] }, false],
    ['visible interactive element by client rect', { matches: () => true, offsetWidth: 0, offsetHeight: 0, getClientRects: () => [1] }, false],
    ['hidden interactive element', { matches: () => true, offsetWidth: 0, offsetHeight: 0, getClientRects: () => [] }, true],
    ['noninteractive element', { matches: () => false }, true],
    ['missing focused element', null, true],
])('delayed chat focus handles %s without jQuery', async (_name, activeElement, shouldFocus) => {
    const start = source.indexOf('const focusContext = getComposerSnapshot().contextKey;');
    const end = source.indexOf('\n        });', source.indexOf('delay(debounce_timeout.short).then(() => {', start)) + '\n        });'.length;
    const focus = jest.fn();
    let task;
    const schedule = new Function('delay', 'debounce_timeout', '$', 'document', 'getComposerSnapshot', 'subscribeComposerState', 'requestComposerFocus', source.slice(start, end));
    schedule(() => ({ then: fn => { task = Promise.resolve().then(fn); } }), { short: 1 }, () => { throw Error('focus must not depend on jQuery'); }, { activeElement }, () => ({ contextKey: 'chat' }), () => () => {}, focus);
    await task;
    expect(focus).toHaveBeenCalledTimes(shouldFocus ? 1 : 0);
});
