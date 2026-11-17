import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';

jest.unstable_mockModule('../public/scripts/notifications.js', () => ({ default: {} }));
jest.unstable_mockModule('../public/scripts/events.js', () => ({ eventSource: {}, event_types: {} }));
jest.unstable_mockModule('../public/scripts/frontend-frame.js', () => ({ isFrontendContent: () => false }));
jest.unstable_mockModule('../public/scripts/utils.js', () => ({ uuidv4: () => 'id' }));
jest.unstable_mockModule('../public/scripts/chat-message-render-service.js', () => ({
    buildChatMessageRichBodyRender: () => ({ messageHtml: '<p>rendered</p>', biasHtml: '<em>bias</em>' }),
}));
const { registerMessageShellContext } = await import('../public/scripts/message-shell-context.js');
const { addOneMessage, updateMessageElement } = await import('../public/scripts/message-service.js');

class Node {
    constructor() {
        this.attributes = {}; this.nodes = {}; this.listeners = {}; this.children = []; this.style = {};
        this.classes = new Set();
        this.classList = { add: (...names) => names.forEach(name => this.classes.add(name)),
            remove: name => this.classes.delete(name), toggle: (name, value) => value ? this.classes.add(name) : this.classes.delete(name) };
    }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    removeAttribute(name) { delete this.attributes[name]; }
    getAttribute(name) { return this.attributes[name] ?? null; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    querySelectorAll(selector) { return this.nodes[selector] ?? []; }
    closest() { return this.reactOwned ? this : null; }
    append(...nodes) { this.children.push(...nodes); }
    cloneNode() { return makeRow(); }
}
function makeRow() {
    const row = new Node();
    for (const selector of ['.avatar img', '.ch_name .name_text', '.timestamp', '.mes_timer', '.mes_bias', '.mes_text', '.mes_file_wrapper', '.mes_media_wrapper']) {
        row.nodes[selector] = [new Node()];
    }
    for (const selector of ['.mes_file_wrapper', '.mes_media_wrapper']) row.nodes[selector][0].replaceChildren = jest.fn();
    row.nodes['.avatar img'][0].parentElement = new Node();
    return row;
}
let state, reasoning, refresh, root, template;
beforeEach(() => {
    template = makeRow(); root = new Node();
    root.nodes['.mes'] = root.children;
    state = { chat: [], chatElement: root, messageTemplate: template, default_user_avatar: '/user', characters: [], hljs: {} };
    reasoning = jest.fn(); refresh = jest.fn();
    registerMessageShellContext({ state, isReactMainChatOwner: () => false, updateReasoningUI: reasoning,
        scheduleMainChatMessageListPanelRefresh: refresh, timestampToMoment: () => ({ isValid: () => true, format: () => 'date' }),
        updateEditArrowClasses: jest.fn(), applyCharacterTagsToMessageDivs: jest.fn() });
    globalThis.$ = () => { throw Error('message template must not construct jQuery'); };
});
afterEach(() => { delete globalThis.$; });

test('real addOneMessage clones and populates a native template, returning its row', () => {
    const message = { name: 'User', is_user: true, mes: 'hello', title: 'title', extra: { isSmallSys: true, tool_invocations: [], reply_pipeline_display: 'hidden' } };
    state.chat.push(message);
    const result = addOneMessage(message, { scroll: false });
    const row = result;
    expect(row).not.toBe(template); expect(root.children).toEqual([row]);
    expect(row.getAttribute('mesid')).toBe('0'); expect(row.getAttribute('ch_name')).toBe('User');
    expect(row.getAttribute('title')).toBe('title');
    expect(row.querySelectorAll('.avatar img')[0].getAttribute('src')).toBe('/user');
    expect(row.querySelectorAll('.ch_name .name_text')[0].textContent).toBe('User');
    expect(row.querySelectorAll('.timestamp')[0].textContent).toBe('date');
    expect(row.querySelectorAll('.mes_bias')[0].innerHTML).toBe('<em>bias</em>');
    expect(row.querySelectorAll('.mes_text')[0].innerHTML).toBe('<p>rendered</p>');
    expect([...row.classes]).toEqual(expect.arrayContaining(['smallSysMes', 'toolCall', 'replyPipelineHidden', 'last_mes']));
    expect(reasoning).toHaveBeenCalledTimes(1);
});

test('real recovery update preserves each supplied row identity and handles every row', () => {
    const rows = [makeRow(), makeRow()];
    const message = { name: 'User', is_user: true, mes: 'hello', extra: {} }; state.chat.push(message);
    for (const row of rows) {
        expect(updateMessageElement(message, { messageId: 0, messageElement: row })).toBe(row);
        expect(row.getAttribute('mesid')).toBe('0');
        expect(row.querySelectorAll('.mes_text')[0].innerHTML).toBe('<p>rendered</p>');
        const avatar = row.querySelectorAll('.avatar img')[0]; avatar.listeners.error();
        expect(avatar.style.display).toBe('none');
        expect(avatar.parentElement.innerHTML).toContain('missing-avatar');
    }
});

test('real addOneMessage can insert a native template without a collection', () => {
    state.messageTemplate = template;
    const message = { name: 'User', is_user: true, mes: 'hello', extra: {} }; state.chat.push(message);
    const row = addOneMessage(message, { scroll: false });
    expect(row).not.toBe(template);
    expect(root.children).toEqual([row]);
    expect(row.getAttribute('mesid')).toBe('0');
});

test('addOneMessage inserts and marks a row with a native chat root', () => {
    root.nodeType = 1;
    state.chatElement = root;
    const message = { name: 'User', is_user: true, mes: 'hello', extra: {} };
    state.chat.push(message);
    const result = addOneMessage(message, { scroll: false });
    expect(root.children).toEqual([result]);
    expect(result.classes.has('last_mes')).toBe(true);
});

test('native recovery row preserves input identity and populates a generation timer', () => {
    const row = makeRow();
    const message = { name: 'User', is_user: true, mes: 'hello', gen_started: 'start', gen_finished: 'finish', extra: { token_count: 8 } };
    state.chat.push(message);
    state.moment = () => ({ diff: () => 2, format: () => 'time' });
    expect(updateMessageElement(message, { messageId: 0, messageElement: row })).toBe(row);
    const timer = row.querySelectorAll('.mes_timer')[0];
    expect(timer.textContent).toBe('2.0s');
    expect(timer.getAttribute('title')).toContain('Token rate: 4.000 t/s');
    expect(reasoning).toHaveBeenCalledWith(row);
});

test('recovery with no supplied row clones and populates the native template', () => {
    const message = { name: 'User', is_user: true, mes: 'hello', extra: {} }; state.chat.push(message);
    const row = updateMessageElement(message, {});
    expect(row).not.toBe(template);
    expect(row.getAttribute('mesid')).toBe('0');
    expect(reasoning).toHaveBeenCalledWith(row);
});

test('React-owned native row refreshes without legacy DOM writes', () => {
    const row = makeRow(); row.reactOwned = true;

    const closest = jest.spyOn(row, 'closest');
    const query = jest.spyOn(row, 'querySelectorAll');
    const setAttribute = jest.spyOn(row, 'setAttribute');
    const addClass = jest.spyOn(row.classList, 'add');
    row.nodes['.mes_text'][0].innerHTML = 'React-owned content';

    expect(updateMessageElement({}, { messageElement: row })).toBe(row);
    expect(closest).toHaveBeenCalledWith('[data-main-chat-message-row-owner="react"]');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(reasoning).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(setAttribute).not.toHaveBeenCalled();
    expect(addClass).not.toHaveBeenCalled();
    expect(row.nodes['.mes_text'][0].innerHTML).toBe('React-owned content');
});
