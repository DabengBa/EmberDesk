import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { EventEmitter } from '../public/lib/eventemitter.js';

const source = readFileSync(new URL('../public/scripts/chats.js', import.meta.url), 'utf8');
const functionSource = source.slice(source.indexOf('async function onImageSwiped('), source.indexOf('\nlet openAttachmentPicker'));
const initSource = source.slice(source.indexOf('export function initChatUtilities('));

function setup({ count = 2, animating = false, gallery = true } = {}) {
    const message = { extra: { media: Array.from({ length: count }, (_, index) => ({ url: String(index) })), media_index: 0 } };
    const row = { querySelector: jest.fn(() => animating ? {} : null) };
    const legacyElement = { 0: row, jquery: '3.0', find: jest.fn(() => ({ hasClass: () => animating })) };
    const wrap = jest.fn(() => legacyElement);
    const sequence = [];
    const emit = jest.fn(async (_event, payload) => {
        sequence.push(['event', payload.message.extra.media_index]);
        expect(payload.element).toBe(legacyElement);
        expect(payload.element[0]).toBe(row);
    });
    const save = jest.fn(async () => { sequence.push(['save', message.extra.media_index]); });
    const append = jest.fn((mes, element) => { sequence.push(['append', mes.extra.media_index, element]); });
    const env = { chat: [message], $: wrap, getMediaIndex: mes => mes.extra.media_index,
        getMediaDisplay: () => gallery ? 'gallery' : 'list', MEDIA_DISPLAY: { GALLERY: 'gallery' },
        SWIPE_DIRECTION: { LEFT: 'left', RIGHT: 'right' }, eventSource: { emit }, event_types: { IMAGE_SWIPED: 'image_swiped' },
        saveChatConditional: save, appendMediaToMessage: append, console: { warn: jest.fn() } };
    const swipe = new Function(...Object.keys(env), `${functionSource}; return onImageSwiped;`)(...Object.values(env));
    return { swipe, row, message, wrap, legacyElement, emit, save, append, sequence };
}

test.each([['left', 1], ['right', 1]])('swipe %s emits the original jQuery payload before updating and passes the same collection to media rendering', async (direction, index) => {
    const h = setup();
    await h.swipe(0, h.row, direction);
    expect(h.row.querySelector).toHaveBeenCalledWith('.mes_img.fa-fade, .mes_video.fa-fade');
    expect(h.emit).toHaveBeenCalledWith('image_swiped', { message: h.message, element: h.legacyElement, direction });
    expect(h.sequence).toEqual([['event', 0], ['save', index], ['append', index, h.legacyElement]]);
    expect(h.wrap).toHaveBeenCalledTimes(1);
});

test('awaits consumers and preserves their mutations to the emitted collection for media rendering', async () => {
    const h = setup();
    let release;
    h.emit.mockImplementationOnce(async (_name, payload) => {
        await new Promise(resolve => { release = resolve; });
        payload.element[0] = { replacement: true };
    });
    const pending = h.swipe(0, h.row, 'right');
    expect(h.save).not.toHaveBeenCalled();
    release();
    await pending;
    expect(h.append).toHaveBeenCalledWith(h.message, h.legacyElement);
    expect(h.append.mock.calls[0][1][0]).toEqual({ replacement: true });
});
test('single-item gallery still emits before declining to swipe', async () => {
    const h = setup({ count: 1 });
    await h.swipe(0, h.row, 'right');
    expect(h.emit).toHaveBeenCalledTimes(1);
    expect(h.save).not.toHaveBeenCalled();
    expect(h.append).not.toHaveBeenCalled();
});

test.each([{ animating: true }, { gallery: false }, { count: 0 }])('ignored swipe does not construct a legacy event payload %#', async options => {
    const h = setup(options);
    await h.swipe(0, h.row, 'right');
    expect(h.emit).not.toHaveBeenCalled();
    expect(h.wrap).not.toHaveBeenCalled();
});

test('without jQuery a swipe emits, saves and renders with the native row', async () => {
    const emitter = new EventEmitter();
    const emit = jest.spyOn(emitter, 'emit');
    const save = jest.fn(async () => {});
    const append = jest.fn();
    const row = { querySelector: () => null };
    const previousStorage = globalThis.localStorage;
    globalThis.localStorage = { getItem: () => 'true' };
    const trace = jest.spyOn(console, 'trace').mockImplementation(() => {});
    const message = { extra: { media: [{}, {}], media_index: 0 } };
    const observations = [];
    const listener = jest.fn(async payload => {
        observations.push([payload.element, payload.message.extra.media_index, save.mock.calls.length]);
    });
    emitter.on('image_swiped', listener);
    const env = { chat: [message], $: undefined, getMediaIndex: () => 0,
        getMediaDisplay: () => 'gallery', MEDIA_DISPLAY: { GALLERY: 'gallery' },
        SWIPE_DIRECTION: { LEFT: 'left', RIGHT: 'right' }, eventSource: emitter,
        event_types: { IMAGE_SWIPED: 'image_swiped' }, saveChatConditional: save,
        appendMediaToMessage: append, console: { warn: jest.fn() } };
    const swipe = new Function(...Object.keys(env), `${functionSource}; return onImageSwiped;`)(...Object.values(env));
    try {
        await swipe(0, row, 'right');
        expect(emit).toHaveBeenCalledWith('image_swiped', { message, element: row, direction: 'right' });
        expect(trace).toHaveBeenCalledWith('Event emitted: image_swiped', [{ message, element: row, direction: 'right' }]);
        expect(listener).toHaveBeenCalledTimes(1);
        expect(observations).toEqual([[row, 0, 0]]);
        expect(save).toHaveBeenCalledTimes(1);
        expect(message.extra.media_index).toBe(1);
        expect(append).toHaveBeenCalledWith(message, row);
    } finally {
        trace.mockRestore();
        if (previousStorage === undefined) delete globalThis.localStorage;
        else globalThis.localStorage = previousStorage;
    }
});

test('real emitter traces the original jQuery payload even with no listeners', async () => {
    const emitter = new EventEmitter();
    const previousStorage = globalThis.localStorage;
    globalThis.localStorage = { getItem: () => 'true' };
    const trace = jest.spyOn(console, 'trace').mockImplementation(() => {});
    const row = { querySelector: () => null };
    const collection = { 0: row, jquery: '3.5.1' };
    const message = { extra: { media: [{}, {}], media_index: 0 } };
    const append = jest.fn();
    const env = { chat: [message], $: () => collection, getMediaIndex: () => 0,
        getMediaDisplay: () => 'gallery', MEDIA_DISPLAY: { GALLERY: 'gallery' },
        SWIPE_DIRECTION: { LEFT: 'left', RIGHT: 'right' }, eventSource: emitter,
        event_types: { IMAGE_SWIPED: 'image_swiped' }, saveChatConditional: jest.fn(async () => {}),
        appendMediaToMessage: append, console: { warn: jest.fn() } };
    const swipe = new Function(...Object.keys(env), `${functionSource}; return onImageSwiped;`)(...Object.values(env));
    try {
        await swipe(0, row, 'right');
        expect(trace).toHaveBeenCalledWith('Event emitted: image_swiped', [{ message, element: collection, direction: 'right' }]);
        expect(append).toHaveBeenCalledWith(message, collection);
    } finally {
        trace.mockRestore();
        if (previousStorage === undefined) delete globalThis.localStorage;
        else globalThis.localStorage = previousStorage;
    }
});

test.each(['collection', 'native'])('React swipe buttons delegate the native row using a %s chat root', async rootType => {
    const handlers = [];
    const root = { nodeType: 1, contains: () => true, addEventListener: (type, fn) => { if (type === 'click') handlers.push(fn); } };
    const swipe = jest.fn(async () => {});
    const env = { document: { addEventListener() {}, getElementById: id => id === 'send_textarea' ? { addEventListener() {} } : null },
        chatElement: rootType === 'native' ? root : [root], eventSource: { on() {} }, event_types: { CHAT_CHANGED: 'changed' },
        openAttachmentPicker: null, DragAndDropHandler: class {}, checkForCreatorNotesStyles() {},
        onImageSwiped: swipe, SWIPE_DIRECTION: { LEFT: 'left', RIGHT: 'right' },
        $: () => { throw Error('swipe delegate must not wrap the row'); } };
    new Function(...Object.keys(env), `${initSource.replace('export ', '')}; initChatUtilities(() => []);`)(...Object.values(env));
    const row = { getAttribute: () => '7' };
    for (const [selector, direction] of [['.mes_img_swipe_left', 'left'], ['.mes_img_swipe_right', 'right']]) {
        const button = { closest: query => query === '.mes' ? row : null };
        for (const handler of handlers) handler({ target: { closest: query => query === selector ? button : null } });
        await new Promise(resolve => setImmediate(resolve));
        expect(swipe).toHaveBeenLastCalledWith(7, row, direction);
    }
});
