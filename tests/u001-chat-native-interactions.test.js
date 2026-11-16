import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/scripts/chats.js', import.meta.url), 'utf8');
const initSource = source.slice(source.indexOf('export function initChatUtilities('));

function setup() {
    const listeners = new Map();
    const form = { addEventListener: jest.fn(), classList: { add: jest.fn() } };
    const input = { files: [], addEventListener: jest.fn(), removeEventListener: jest.fn(), click: jest.fn() };
    const textarea = { addEventListener: jest.fn() };
    const mediaListeners = new Map();
    const chatRoot = { contains: () => true, addEventListener: (type, fn) => mediaListeners.set(type, [...(mediaListeners.get(type) ?? []), fn]) };
    const document = {
        addEventListener: (type, fn) => listeners.set(type, [...(listeners.get(type) ?? []), fn]),
        getElementById: id => ({ file_form: form, file_form_input: input, send_textarea: textarea }[id] ?? null),
    };
    const jq = jest.fn(() => ({ on: jest.fn(), off: jest.fn(), trigger: jest.fn() }));
    const chat = [{ extra: {} }];
    const save = jest.fn(async () => {});
    const emit = jest.fn(async () => {});
    const refresh = jest.fn();
    const hide = jest.fn(async () => {});
    const expand = jest.fn();
    const remove = jest.fn(async () => {});
    const openFile = jest.fn(async () => {});
    const env = {
        document, $: jq, chat, saveChatConditional: save,
        eventSource: { emit, on: jest.fn() }, event_types: { MESSAGE_UPDATED: 'updated', CHAT_CHANGED: 'changed' },
        requireGenerationShellContext: () => ({ scheduleMainChatMessageListPanelRefresh: refresh }),
        hideChatMessageRange: hide, chatElement: { 0: chatRoot, on: jest.fn() },
        expandMessageMedia: expand, deleteMessageMedia: remove,
        viewMessageFile: openFile,
        openAttachmentPicker: null, HTMLInputElement: class {}, DragAndDropHandler: class {},
        checkForCreatorNotesStyles: jest.fn(), console,
    };
    const init = new Function(...Object.keys(env), `${initSource.replace('export ', '')}; return initChatUtilities;`)(...Object.values(env));
    init(() => []);
    return { listeners, mediaListeners, chat, save, emit, refresh, hide, expand, remove, openFile, jq };
}

test('React message action descendants delegate to the matching row without jQuery', async () => {
    const h = setup();
    const row = { getAttribute: name => name === 'mesid' ? '0' : null };
    const button = { closest: selector => selector === '.mes' ? row : null };
    const child = { closest: selector => selector === '.mes_pin' ? button : null };
    for (const listener of h.listeners.get('click') ?? []) listener({ target: child });


    await new Promise(resolve => setImmediate(resolve));
    expect(h.chat[0].extra.pinned).toBe(true);
    expect(h.save).toHaveBeenCalledTimes(1);
    expect(h.emit).toHaveBeenCalledWith('updated', 0);
    expect(h.refresh).toHaveBeenCalledTimes(1);
});

test('media actions delegate from descendants in the chat to the correct message and attachment', () => {
    const h = setup();
    const row = { getAttribute: () => '4' };
    const media = { getAttribute: () => '2' };
    const button = { closest: selector => selector === '.mes' ? row : selector === '.mes_media_container' ? media : null };
    const child = { closest: selector => selector === '.mes_img' ? button : null };
    for (const listener of h.mediaListeners.get('click') ?? []) listener({ target: child });
    expect(h.expand).toHaveBeenCalledWith(4, 2);
    expect(h.jq).not.toHaveBeenCalledWith(row);
});

test('media deletion passes the native row to the message operation', async () => {
    const h = setup();
    const row = { getAttribute: () => '4' };
    const media = { getAttribute: () => '2' };
    const button = { closest: selector => selector === '.mes' ? row : selector === '.mes_media_container' ? media : null };
    const child = { closest: selector => selector === '.mes_media_delete' ? button : null };
    for (const listener of h.mediaListeners.get('click') ?? []) listener({ target: child });
    await new Promise(resolve => setImmediate(resolve));
    expect(h.remove).toHaveBeenCalledWith(4, 2, row);
    expect(h.jq).not.toHaveBeenCalledWith(row);
});

test('hide and file-open actions keep message and attachment indices from the row', async () => {
    const h = setup();
    const row = { getAttribute: () => '8' };
    const file = { getAttribute: () => '3' };
    const button = { closest: selector => selector === '.mes' ? row : selector === '.mes_file_container' ? file : null };
    for (const selected of ['.mes_hide', '.mes_file_open']) {
        const child = { closest: selector => selector === selected ? button : null };
        for (const listener of h.listeners.get('click') ?? []) listener({ target: child });
    }
    await new Promise(resolve => setImmediate(resolve));
    expect(h.hide).toHaveBeenCalledWith(8, 8, false);
    expect(h.openFile).toHaveBeenCalledWith(8, 3);
});
test('embedding twice replaces the prior picker handler and updates the latest message', async () => {
    const embedSource = source.slice(source.indexOf('function embedMessageFile('), source.indexOf('\n/**\n * Appends file content'));
    class Input {
        files = [{ name: 'note.txt' }];
        listeners = new Set();
        addEventListener(_type, fn) { this.listeners.add(fn); }
        removeEventListener(_type, fn) { this.listeners.delete(fn); }
        click() {}
    }
    const input = new Input();
    const messages = [{}, {}];
    const populate = jest.fn(async () => {});
    const emit = jest.fn(async () => {});
    const append = jest.fn();
    const save = jest.fn(async () => {});
    const env = {
        document: { getElementById: () => input }, HTMLInputElement: Input, chat: messages,
        $: () => { throw new Error('embed picker must not depend on jQuery'); },
        validateFile: async () => true, populateFileAttachment: populate, appendMediaToMessage: append,
        eventSource: { emit }, event_types: { MESSAGE_FILE_EMBEDDED: 'embedded' },
        saveChatConditional: save, SCROLL_BEHAVIOR: { KEEP: 'keep' }, console,
    };
    const embed = new Function(...Object.keys(env), `let embedChangeHandler; ${embedSource}; return embedMessageFile;`)(...Object.values(env));
    embed(0, 'old-row');
    embed(1, 'new-row');
    expect(input.listeners.size).toBe(1);
    for (const listener of input.listeners) await listener({ target: input });
    expect(populate).toHaveBeenCalledWith(messages[1], 'embed_file_input');
    expect(emit).toHaveBeenCalledWith('embedded', 1);
    expect(append).toHaveBeenCalledWith(messages[1], 'new-row', 'keep');
    expect(save).toHaveBeenCalledTimes(1);
});

test('attachment picker merges the latest selection once without jQuery', async () => {
    class Input {
        files = [{ name: 'old' }];
        listeners = new Set();
        addEventListener(type, fn) { if (type === 'change') this.listeners.add(fn); }
        removeEventListener(type, fn) { if (type === 'change') this.listeners.delete(fn); }
        click() {}
    }
    const input = new Input();
    class Transfer {
        files = [];
        items = { add: file => this.files.push(file) };
    }
    const attach = jest.fn(async () => {});

    const merge = jest.fn((old, current) => [...old, ...current]);
    const document = {
        addEventListener() {},
        getElementById: id => id === 'file_form_input' ? input : id === 'send_textarea' ? { addEventListener() {} } : null,
    };
    const env = {
        document, HTMLInputElement: Input, DataTransfer: Transfer, merge,
        $: element => {
            if (element === input) throw Error('picker must not depend on jQuery');
            return { on() {} };
        },
        openAttachmentPicker: null, onFileAttach: attach, isSameFile: () => false,
        eventSource: { on() {} }, event_types: { CHAT_CHANGED: 'changed' },
        chatElement: {}, DragAndDropHandler: class {}, checkForCreatorNotesStyles() {},
    };
    const init = new Function(...Object.keys(env), `${initSource.replace('export ', '')}; return () => { initChatUtilities(merge); return openAttachmentPicker; };`)(...Object.values(env));
    const open = init();
    open();
    open();
    input.files = [{ name: 'new' }];
    expect(input.listeners.size).toBe(1);
    for (const listener of input.listeners) await listener();
    expect(attach).toHaveBeenCalledWith([{ name: 'old' }, { name: 'new' }]);
});

test('expanded editor copies input back to its original field and emits a bubbling input event', async () => {
    const listeners = [];
    const original = {
        value: 'original', dataset: { macros: '' }, classList: { contains: () => true },
        getAttribute: name => name === 'aria-label' ? 'Description' : null,
        hasAttribute: () => false,
        labels: [], previousElementSibling: null, selectionStart: 1, selectionEnd: 3,
        dispatchEvent: jest.fn(),
    };
    const created = [];
    const document = {
        addEventListener: (type, fn) => { if (type === 'click') listeners.push(fn); },
        getElementById: id => id === 'description' ? original : id === 'send_textarea' ? { addEventListener() {} } : null,
        createElement: tag => {
            const element = { tag, dataset: {}, classList: { add() {} }, setAttribute() {}, append() {}, appendChild() {}, addEventListener(type, fn) { this[type] = fn; }, focus() {}, setSelectionRange: jest.fn() };
            created.push(element);
            return element;
        },
    };
    const popup = jest.fn(async (_wrapper, _type, _text, options) => options.onOpen());
    class FakeEvent { constructor(type, options) { this.type = type; this.bubbles = options.bubbles; } }
    const env = {
        document, Event: FakeEvent, $: () => { throw Error('editor must not depend on jQuery'); },
        callGenericPopup: popup, POPUP_TYPE: { TEXT: 'text' }, t: strings => strings[0],
        openAttachmentPicker: null, chatElement: {}, DragAndDropHandler: class {},
        eventSource: { on() {} }, event_types: { CHAT_CHANGED: 'changed' }, checkForCreatorNotesStyles() {},
    };
    // Other, not-yet-migrated registrations remain jQuery-based.
    env.$ = element => {
        if (element === document) return { on() {} };
        if (element === '#creators_note_styles_button') return { on() {} };
        throw Error('editor must not depend on jQuery');
    };
    new Function(...Object.keys(env), `${initSource.replace('export ', '')}; initChatUtilities(() => []);`)(...Object.values(env));
    const button = { getAttribute: name => name === 'data-for' ? 'description' : null };
    const child = { closest: selector => selector === '.editor_maximize' ? button : null };
    const event = { target: child, preventDefault: jest.fn(), stopPropagation: jest.fn() };
    for (const listener of listeners) listener(event);
    const textarea = created.find(element => element.tag === 'textarea');
    expect(textarea.value).toBe('original');
    expect(textarea.dataset.macrosAutocomplete).toBe('always');
    expect(textarea.setSelectionRange).toHaveBeenCalledWith(1, 3);
    textarea.value = 'updated';
    textarea.input();
    expect(original.value).toBe('updated');
    expect(original.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'input', bubbles: true }));
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
});

test('creator styles button registers natively and preserves its state classes', () => {
    const clickHandlers = [];
    const toggle = jest.fn();
    const button = { addEventListener: (type, fn) => { if (type === 'click') clickHandlers.push(fn); }, classList: { toggle } };
    const document = {
        addEventListener() {},
        getElementById: id => id === 'creators_note_styles_button' ? button : id === 'send_textarea' ? { addEventListener() {} } : null,
    };
    const dialog = jest.fn();
    const env = {
        document, $: () => { throw Error('creator styles button must not use jQuery'); },
        openGlobalStylesPreferenceDialog: dialog, openAttachmentPicker: null,
        chatElement: {}, DragAndDropHandler: class {}, eventSource: { on() {} },
        event_types: { CHAT_CHANGED: 'changed' }, checkForCreatorNotesStyles() {},
    };
    new Function(...Object.keys(env), `${initSource.replace('export ', '')}; initChatUtilities(() => []);`)(...Object.values(env));
    const event = { stopPropagation: jest.fn() };
    expect(clickHandlers).toHaveLength(1);
    clickHandlers[0](event);
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(dialog).toHaveBeenCalled();

    const fn = source.slice(source.indexOf('function setGlobalStylesButtonClass('), source.indexOf('\n/**', source.indexOf('function setGlobalStylesButtonClass(')));
    const setClass = new Function('document', '$', `${fn}; return setGlobalStylesButtonClass;`)(document, env.$);
    setClass(null);
    setClass(true);
    setClass(false);
    expect(toggle.mock.calls).toEqual([
        ['empty', true], ['allowed', false], ['forbidden', false],
        ['empty', false], ['allowed', true], ['forbidden', false],
        ['empty', false], ['allowed', false], ['forbidden', true],
    ]);
});
