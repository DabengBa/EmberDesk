import { beforeEach, expect, jest, test } from '@jest/globals';

const state = { chat: [], chat_metadata: {}, characters: [{ chat: 'first', name: 'Alice', avatar: 'a.png' }], this_chid: 0, system_message_types: { NARRATOR: 'narrator' } };
const shell = {
    state, unshallowCharacter: async () => {}, uuidv4: () => 'integrity',
    queueMainChatMessageListScrollRestore: () => {}, getChatResult: async () => {},
    delay: () => new Promise(() => {}), t: strings => strings.join(''),
    compressRequest: async request => request,
};
jest.unstable_mockModule('../public/scripts/events.js', () => ({ eventSource: { emit: jest.fn() }, event_types: {} }));
jest.unstable_mockModule('../public/scripts/constants.js', () => ({ CHAT_TRUNCATION: {}, debounce_timeout: {} }));
jest.unstable_mockModule('../public/scripts/request-context.js', () => ({ getRequestHeaders: () => ({}) }));
jest.unstable_mockModule('../public/scripts/character-lifecycle-service.js', () => ({ createOrEditCharacter: jest.fn() }));
jest.unstable_mockModule('../public/scripts/message-service.js', () => ({ ensureMessageMediaIsArray: jest.fn(), scrollChatToBottom: jest.fn(), updateMessageElement: jest.fn() }));
jest.unstable_mockModule('../public/scripts/delete-character-preflight.js', () => ({ runDeleteCharacterClosePreflight: jest.fn() }));
jest.unstable_mockModule('../public/scripts/chat-ops-shell-context.js', () => ({ requireChatOpsShellContext: () => shell }));
jest.unstable_mockModule('../public/scripts/main-chat-greetings.js', () => ({ buildGreetingOptions: jest.fn(), canSwitchGreeting: jest.fn(), replaceGreeting: jest.fn() }));
const { getComposerSnapshot, setComposerDraftContext, setComposerValue } = await import('../public/scripts/main-chat-composer-service.js');
const { getChat, saveChat, withCurrentChatDeleteVersion, renamePastChats, deleteCharacterChatByName, renameCharacterChat } = await import('../public/scripts/chat-ops-service.js');
const response = (data, version) => ({ ok: true, headers: new Headers(version ? { 'X-Chat-Version': version } : {}), json: async () => structuredClone(data) });

beforeEach(() => {
    state.characters[0].chat = 'first';
    state.chat = [];
    state.chat_metadata = {};
    globalThis.toastr = { error: jest.fn() };
});

test('loads a version and advances it for consecutive actual saves', async () => {
    const calls = [];
    globalThis.fetch = jest.fn(async (url, request) => {
        if (url.endsWith('/get')) return response([{ chat_metadata: {} }, { mes: 'hello' }], 'a'.repeat(32));
        const body = JSON.parse(request.body);
        calls.push(body);
        if (!body.version || !body.operationId) return { ok: false, status: 428, json: async () => ({ error: 'chat_precondition_required' }) };
        return response({ version: (calls.length === 1 ? 'b' : 'c').repeat(32) });
    });
    expect(await getChat()).toBe(true);
    expect(await saveChat()).toBe(true);
    expect(await saveChat()).toBe(true);
    expect(calls.map(x => x.version)).toEqual(['a'.repeat(32), 'b'.repeat(32)]);
    expect(calls[0].operationId).not.toBe(calls[1].operationId);
});

test('missing chat and branch use create instead of an update', async () => {
    const saves = [];
    globalThis.fetch = jest.fn(async (url, request) => {
        if (url.endsWith('/get')) return response({});
        const body = JSON.parse(request.body); saves.push(body);
        return body.create && body.operationId ? response({ version: 'd'.repeat(32) }) : { ok: false, status: 428, json: async () => ({}) };
    });
    expect(await getChat()).toBe(true);
    expect(await saveChat()).toBe(true);
    expect(await saveChat({ chatName: 'branch' })).toBe(true);
    expect(saves.every(x => x.create === true && !('version' in x))).toBe(true);
});

test('retries an ambiguous network failure using the identical operation and payload', async () => {
    const saves = [];
    globalThis.fetch = jest.fn(async (url, request) => {
        if (url.endsWith('/get')) return response([{ chat_metadata: {} }], 'a'.repeat(32));
        saves.push(request.body);
        if (saves.length === 1) throw new TypeError('disconnected');
        return response({ version: 'b'.repeat(32) });
    });
    await getChat();
    expect(await saveChat()).toBe(true);
    expect(saves).toHaveLength(2);
    expect(saves[0]).toEqual(saves[1]);
});

test('a stalled save stops blocking after bounded attempts and keeps its operation for retry', async () => {
    jest.useFakeTimers();
    try {
        const requests = [];
        globalThis.fetch = jest.fn(async (url, request) => {
            if (url.endsWith('/get')) return response([{ chat_metadata: {} }], 'a'.repeat(32));
            requests.push(request.body);
            return new Promise((resolve, reject) => request.signal?.addEventListener('abort', () => reject(new Error('timed out')), { once: true }));
        });
        await getChat();
        const saving = saveChat();
        await jest.advanceTimersByTimeAsync(31000);
        expect(await saving).toBe(false);
        expect(requests).toHaveLength(2);
        expect(requests[0]).toBe(requests[1]);
    } finally {
        jest.useRealTimers();
    }
});

test('conflicts stop further writes and inform the user without overwriting local chat', async () => {
    globalThis.fetch = jest.fn(async url => url.endsWith('/get')
        ? response([{ chat_metadata: {} }, { mes: 'local' }], 'a'.repeat(32))
        : { ok: false, status: 409, json: async () => ({ error: 'chat_conflict' }) });
    await getChat();
    expect(await saveChat()).toBe(false);
    expect(await saveChat()).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(state.chat[0].mes).toBe('local');
    expect(globalThis.toastr.error).toHaveBeenCalled();
});

test('an in-place reload waiting on a conflicting save cannot replace local edits', async () => {
    let release, entered;
    const gate = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { entered = resolve; });
    shell.captureChatSaveRecovery = () => ({});
    shell.preserveChatSaveConflict = async () => {};
    globalThis.fetch = jest.fn(async url => {
        if (url.endsWith('/get')) return response([{ chat_metadata: {} }, { mes: 'server copy' }], 'a'.repeat(32));
        entered(); await gate;
        return { ok: false, status: 409 };
    });
    await getChat();
    state.chat.push({ mes: 'local late edit' });
    const saving = saveChat();
    await started;
    const loading = getChat();
    release();
    expect(await saving).toBe(false);
    expect(await loading).toBe(false);
    expect(state.chat.some(message => message.mes === 'local late edit')).toBe(true);
    delete shell.captureChatSaveRecovery;
    delete shell.preserveChatSaveConflict;
});
test('a response for an old session cannot give the new session its version', async () => {
    let release, entered;
    const gate = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { entered = resolve; });
    globalThis.fetch = jest.fn(async (url, request) => {
        if (url.endsWith('/get')) {
            const name = JSON.parse(request.body).file_name;
            return response([{ chat_metadata: {} }, { mes: name }], (name === 'first' ? 'a' : 'c').repeat(32));
        }
        if (JSON.parse(request.body).file_name === 'first') { entered(); await gate; return response({ version: 'b'.repeat(32) }); }
        expect(JSON.parse(request.body).version).toBe('c'.repeat(32));
        return response({ version: 'd'.repeat(32) });
    });
    await getChat();
    const saving = saveChat();
    await started;
    state.characters[0].chat = 'second';
    state.chat = [];
    await getChat();
    release();
    await saving;
    expect(await saveChat()).toBe(true);
});

test('current delete waits for a running save and uses its confirmed version, not a fresh GET', async () => {
    let release, entered;
    const gate = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { entered = resolve; });
    globalThis.fetch = jest.fn(async url => {
        if (url.endsWith('/get')) return response([{ chat_metadata: {} }], 'a'.repeat(32));
        entered(); await gate;
        return response({ version: 'b'.repeat(32) });
    });
    await getChat();
    const saving = saveChat();
    await started;
    const remove = jest.fn(async version => { expect(version).toBe('b'.repeat(32)); });
    const deleting = Promise.resolve().then(() => withCurrentChatDeleteVersion({ avatar: 'a.png', chat: 'first' }, remove));
    deleting.catch(() => {});
    await Promise.resolve();
    expect(remove).not.toHaveBeenCalled();
    release();
    expect(await saving).toBe(true);
    await deleting;
    expect(remove).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls.filter(([url]) => url.endsWith('/get'))).toHaveLength(1);
    expect(await saveChat()).toBe(false);
});

test('current delete rejects identity change while waiting rather than deleting another session', async () => {
    let release, entered;
    const gate = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { entered = resolve; });
    globalThis.fetch = jest.fn(async url => {
        if (url.endsWith('/get')) return response([{ chat_metadata: {} }], 'a'.repeat(32));
        entered(); await gate;
        return response({ version: 'b'.repeat(32) });
    });
    await getChat();
    const saving = saveChat();
    await started;
    const remove = jest.fn();
    const deleting = Promise.resolve().then(() => withCurrentChatDeleteVersion({ avatar: 'a.png', chat: 'first' }, remove));
    deleting.catch(() => {});
    state.characters[0].chat = 'other'; state.chat = [];
    release(); await saving;
    await expect(deleting).rejects.toThrow();
    expect(remove).not.toHaveBeenCalled();
});

test('rename past chats uses the version returned by the matching read and a stable retry body', async () => {
    const bodies = [];
    globalThis.fetch = jest.fn(async (url, request) => {
        if (url.endsWith('/chats') && !url.endsWith('/get')) return response([{ file_name: 'past.jsonl' }]);
        if (url.endsWith('/get')) return response([{ chat_metadata: {} }, { name: 'old', mes: 'hi' }], 'a'.repeat(32));
        bodies.push(request.body);
        if (bodies.length === 1) throw new TypeError('connection lost');
        const body = JSON.parse(request.body);
        return body.version === 'a'.repeat(32) && body.operationId ? response({ version: 'b'.repeat(32) }) : { ok: false, status: 428, json: async () => ({}) };
    });
    await renamePastChats('old.png', 'a.png', 'new');
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toBe(bodies[1]);
    expect(globalThis.toastr.error).not.toHaveBeenCalled();
});

test('a newly replaced same-name chat cannot reuse an earlier session version', async () => {
    globalThis.fetch = jest.fn(async () => response([{ chat_metadata: {} }], 'a'.repeat(32)));
    await getChat();
    state.chat = [];
    const remove = jest.fn();
    await expect(withCurrentChatDeleteVersion({ avatar: 'a.png', chat: 'first' }, remove)).rejects.toThrow('version is unavailable');
    expect(await saveChat()).toBe(false);
    expect(remove).not.toHaveBeenCalled();
});

test('an ambiguous delete leaves the old token unusable for a queued save', async () => {
    globalThis.fetch = jest.fn(async () => response([{ chat_metadata: {} }], 'a'.repeat(32)));
    await getChat();
    await expect(withCurrentChatDeleteVersion({ avatar: 'a.png', chat: 'first' }, async () => { throw new TypeError('connection lost'); })).rejects.toThrow('connection lost');
    expect(await saveChat()).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
});

test('deleting a non-current history chat still delegates without entering current recovery', async () => {
    shell.beginChatRecovery = jest.fn();
    shell.deleteHistoryChatConditional = jest.fn(async () => {});
    await deleteCharacterChatByName(0, 'other');
    expect(shell.beginChatRecovery).not.toHaveBeenCalled();
    expect(shell.deleteHistoryChatConditional).toHaveBeenCalledWith({ avatar: 'a.png', chat: 'other' });
});

test('renaming the open chat uses its confirmed version and retries the same operation', async () => {
    shell.getCurrentChatId = () => 'first';
    shell.equalsIgnoreCaseAndAccents = () => false;
    shell.reloadCurrentChat = async () => {};
    globalThis.$ = () => ({ val: () => {} });
    const writes = [];
    globalThis.fetch = jest.fn(async (url, request) => {
        if (url.endsWith('/get')) return response([{ chat_metadata: {} }], 'a'.repeat(32));
        writes.push(request.body);
        if (writes.length === 1) throw new TypeError('lost');
        return response({ version: 'b'.repeat(32), sanitizedFileName: 'renamed' });
    });
    await getChat();
    expect(await renameCharacterChat({ characterId: 0, oldFileName: 'first', newFileName: 'renamed', loader: false })).toBe(true);
    expect(writes).toHaveLength(2);
    expect(writes[0]).toBe(writes[1]);
    expect(JSON.parse(writes[0])).toMatchObject({ version: 'a'.repeat(32), operationId: expect.any(String) });
    expect(fetch.mock.calls.filter(([url]) => url.endsWith('/get'))).toHaveLength(1);
});

test('renaming a non-current chat reads its own version', async () => {
    shell.getCurrentChatId = () => null;
    shell.equalsIgnoreCaseAndAccents = () => false;
    globalThis.fetch = jest.fn(async (url, request) => {
        if (url.endsWith('/get')) {
            expect(JSON.parse(request.body).file_name).toBe('past');
            return response([{ chat_metadata: {} }], 'e'.repeat(32));
        }
        expect(JSON.parse(request.body)).toMatchObject({ version: 'e'.repeat(32), operationId: expect.any(String) });
        return response({ version: 'f'.repeat(32), sanitizedFileName: 'renamed' });
    });
    expect(await renameCharacterChat({ characterId: 0, oldFileName: 'past', newFileName: 'renamed', loader: false })).toBe(true);
    expect(state.characters[0].chat).toBe('first');
});

test('renaming the open chat preserves its avatar-scoped draft before the reload changes context', async () => {
    shell.getCurrentChatId = () => state.characters[0].chat;
    shell.equalsIgnoreCaseAndAccents = () => false;
    shell.reloadCurrentChat = async () => {
        setComposerDraftContext({ avatarId: 'a.png', chatId: state.characters[0].chat });
    };
    globalThis.$ = () => ({ val: () => {} });
    globalThis.fetch = jest.fn(async url => url.endsWith('/get')
        ? response([{ chat_metadata: {} }], 'a'.repeat(32))
        : response({ version: 'b'.repeat(32), sanitizedFileName: 'renamed' }));
    setComposerDraftContext({ avatarId: 'a.png', chatId: 'first' });
    setComposerValue('Alice draft');
    await getChat();
    expect(await renameCharacterChat({ characterId: 0, oldFileName: 'first', newFileName: 'renamed', loader: false })).toBe(true);
    expect(getComposerSnapshot()).toMatchObject({ contextKey: '["a.png","renamed"]', value: 'Alice draft' });
    setComposerDraftContext({ avatarId: 'b.png', chatId: 'renamed' });
    expect(getComposerSnapshot().value).toBe('');
    setComposerDraftContext({ avatarId: 'a.png', chatId: 'renamed' });
    expect(getComposerSnapshot().value).toBe('Alice draft');
});

test('late rename completion does not change or reload a switched chat', async () => {
    shell.getCurrentChatId = () => 'first';
    shell.equalsIgnoreCaseAndAccents = () => false;
    shell.reloadCurrentChat = jest.fn();
    let release, entered;
    const gate = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { entered = resolve; });
    globalThis.fetch = jest.fn(async url => {
        if (url.endsWith('/get')) return response([{ chat_metadata: {} }], 'a'.repeat(32));
        entered(); await gate;
        return response({ version: 'b'.repeat(32), sanitizedFileName: 'renamed' });
    });
    await getChat();
    const task = renameCharacterChat({ characterId: 0, oldFileName: 'first', newFileName: 'renamed', loader: false });
    await started;
    state.characters[0].chat = 'other'; state.chat = [];
    release();
    expect(await task).toBe(true);
    expect(state.characters[0].chat).toBe('other');
    expect(shell.reloadCurrentChat).not.toHaveBeenCalled();
});
