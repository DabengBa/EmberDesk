import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL(`../public/scripts/${name}.js`, import.meta.url), 'utf8');
const extract = (source, start, end, env = {}) => new Function(...Object.keys(env), `${source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start))).replace('export ', '')}; return ${start.match(/function\s+(\w+)/)[1]};`)(...Object.values(env));

test('native height and CSS order utilities require no jQuery', async () => {
    const source = read('utils');
    const styles = new Map();
    const env = { delay: async () => {}, getComputedStyle: node => styles.get(node) };
    const reset = extract(source, 'export async function resetScrollHeight(', '\n/**', env);
    const init = extract(source, 'export async function initScrollHeight(', '\n/**', env);
    const sort = extract(source, 'export function sortByCssOrder(', '\n/**', env);
    const a = { style: {}, scrollHeight: 40 }, b = { style: {} };
    styles.set(a, { height: '20px', order: '2' });
    styles.set(b, { order: '5' });
    await reset(a);
    expect(a.style.height).toBe('43px');
    await init(a);
    expect(a.style.height).toBe('43px');
    expect(sort(a, b)).toBe(-3);
});

test('native shake does not reference a jQuery global', () => {
    const shake = extract(read('utils'), 'export function shakeElement(', '\n/**');
    const animation = {};
    const element = { animate: jest.fn(() => animation) };
    expect(shake(element, 12, 150, 'linear')).toBe(animation);
    expect(element.animate).toHaveBeenCalledWith([{ transform: 'translateX(0)' }, { transform: 'translateX(12px)' }, { transform: 'translateX(0)' }], { duration: 150, easing: 'linear' });
});

test('pagination helpers update native DOM titles and selected attributes', () => {
    const source = read('utils');
    const localized = new Map(['Next page', 'Previous page', 'First page', 'Last page'].map(title => [title, { title }]));
    const old = { removeAttribute: jest.fn() }, selected = { setAttribute: jest.fn() };
    const select = { querySelectorAll: () => [old], options: [{ value: '10' }, Object.assign(selected, { value: '20' })] };
    const container = { querySelectorAll: selector => {
        const match = selector.match(/^\[title="(.+)"\]$/);
        return match ? [localized.get(match[1])] : [];
    }, querySelector: () => select };
    const t = strings => `translated ${strings[0]}`;
    const localize = new Function('t', `${source.slice(source.indexOf('export const localizePagination'), source.indexOf('\n/**', source.indexOf('export const localizePagination'))).replace('export ', '')}; return localizePagination;`)(t);
    const change = new Function(`${source.slice(source.indexOf('export const paginationDropdownChangeHandler'), source.indexOf('\n/**', source.indexOf('export const paginationDropdownChangeHandler'))).replace('export ', '')}; return paginationDropdownChangeHandler;`)();
    localize(container);
    expect(localized.get('Next page').title).toBe('translated Next page');
    change({ currentTarget: container }, 20);
    expect(old.removeAttribute).toHaveBeenCalledWith('selected');
    expect(selected.setAttribute).toHaveBeenCalledWith('selected', '');
});

test('image swipe emits the native row before save and media refresh even if $ exists', async () => {
    const source = read('chats');
    const row = { querySelector: () => null };
    const message = { extra: { media: [{}, {}], media_index: 0 } };
    const order = [];
    const env = { chat: [message], $: () => { throw Error('jQuery must not be called'); },
        getMediaIndex: m => m.extra.media_index, getMediaDisplay: () => 'gallery', MEDIA_DISPLAY: { GALLERY: 'gallery' },
        SWIPE_DIRECTION: { LEFT: 'left', RIGHT: 'right' }, event_types: { IMAGE_SWIPED: 'swipe' },
        eventSource: { emit: async (_type, payload) => { order.push(['event', payload.element, message.extra.media_index]); } },
        saveChatConditional: async () => { order.push(['save', message.extra.media_index]); },
        appendMediaToMessage: (_message, element) => { order.push(['render', element]); }, console };
    const swipe = extract(source, 'async function onImageSwiped(', '\nlet openAttachmentPicker', env);
    await swipe(0, row, 'right');
    expect(order).toEqual([['event', row, 0], ['save', 1], ['render', row]]);
});

test('message adapters no longer use jQuery or collection-specific shell contracts', () => {
    for (const file of ['message-service', 'chats', 'chat-ops-service', 'generation-service']) {
        const source = read(file);
        expect(source).not.toMatch(/\.jquery\b|\.pushStack\(|typeof \$ === 'function'|chatElement\?\.\[0\]|chatElement\[0\]/);
    }
});

// Exercise the actual media module with native DOM-shaped fixtures.
jest.unstable_mockModule('../public/scripts/notifications.js', () => ({ default: {} }));
jest.unstable_mockModule('../public/scripts/events.js', () => ({ eventSource: {}, event_types: {} }));
jest.unstable_mockModule('../public/scripts/frontend-frame.js', () => ({ isFrontendContent: () => false }));
jest.unstable_mockModule('../public/scripts/utils.js', () => ({ uuidv4: () => 'id', formatTime: value => String(value) }));
const { registerMessageShellContext } = await import('../public/scripts/message-shell-context.js');
const { appendMediaToMessage, updateMessageBlock } = await import('../public/scripts/message-service.js');

// Small DOM fixture; calls the actual module export and registered shell.
class Element {
    constructor(name = '') {
        this.name = name; this.children = []; this.attributes = {}; this.listeners = {}; this.classes = new Set(name ? [name] : []);
        this.classList = {
            add: (...values) => values.forEach(value => this.classes.add(value)),
            remove: (...values) => values.forEach(value => this.classes.delete(value)),
            toggle: (value, enabled) => enabled ? this.classes.add(value) : this.classes.delete(value),
            contains: value => this.classes.has(value),
        };
        this.textContent = '';
    }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    getAttribute(key) { return this.attributes[key] ?? null; }
    removeAttribute(key) { delete this.attributes[key]; }
    addEventListener(type, callback) { (this.listeners[type] ??= []).push(callback); }
    removeEventListener(type, callback) { this.listeners[type] = (this.listeners[type] ?? []).filter(listener => listener !== callback); }
    closest() { return null; }
    contains(node) { return this === node || this.children.some(child => child.contains(node)); }
    dispatch(type) { for (const callback of this.listeners[type] ?? []) callback(); }
    append(...nodes) { this.children.push(...nodes); }
    appendChild(node) { this.append(node); return node; }
    replaceChildren(...nodes) { this.children = [...nodes]; this.onReplace?.(); }
    querySelectorAll(selector) {
        const names = selector.split(',').map(part => part.trim().replace(/^\./, ''));
        const result = [];
        const visit = node => { for (const child of node.children) { if (names.includes(child.name) || names.includes(child.name.replace(/^mes_/, ''))) result.push(child); visit(child); } };
        visit(this);
        return result;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
    cloneNode() { const copy = new this.constructor(this.name); copy.complete = this.complete; copy.readyState = this.readyState; copy.children = this.children.map(child => child.cloneNode(true)); return copy; }
}
class Media extends Element {
    static HAVE_NOTHING = 0; static HAVE_METADATA = 1; static HAVE_CURRENT_DATA = 2;
    constructor(name) { super(name); this.readyState = 0; this.currentTime = 0; this.paused = true; this.play = jest.fn(); }
    get currentSrc() { return this.getAttribute('src') ?? ''; }
}
const flush = () => new Promise(resolve => setImmediate(resolve));
let row, fileWrapper, mediaWrapper, templates, created, timeout, mount, players, chatRoot;

beforeEach(() => {
    row = new Element('mes'); fileWrapper = new Element('mes_file_wrapper'); mediaWrapper = new Element('mes_media_wrapper');
    row.append(new Element('mes_text'), fileWrapper, mediaWrapper);
    templates = {}; created = {};
    const makeTemplate = (kind, containerName, child) => {
        const container = new Element(containerName); container.append(child);
        const clone = container.cloneNode.bind(container);
        container.cloneNode = () => { const node = clone(true); created[kind] = node.children[0]; return node; };
        templates[`#message_${kind}_template .${containerName}`] = [container];
    };
    const image = new Element('mes_img'); image.complete = false;
    makeTemplate('image', 'mes_img_container', image);
    makeTemplate('video', 'mes_video_container', new Media('mes_video'));
    makeTemplate('audio', 'mes_audio_container', new Media('mes_audio'));
    const file = new Element('mes_file_container'); file.append(new Element('mes_file_name'), new Element('mes_file_size'));
    templates['#message_file_template .mes_file_container'] = [file];
    const controls = new Element('mes_img_swipes'); controls.append(new Element('mes_img_swipe_counter'));
    templates['#message_gallery_controls .mes_img_swipes'] = [controls];
    globalThis.document = { querySelectorAll: selector => templates[selector] ?? [], querySelector: selector => templates[selector]?.[0] ?? null };
    globalThis.HTMLMediaElement = Media;
    globalThis.$ = () => { throw new Error('media rendering must not invoke jQuery'); };
    timeout = {}; timeout.promise = new Promise(resolve => { timeout.resolve = resolve; });
    mount = jest.fn(); players = []; chatRoot = { scrollHeight: 100, scrollTop: 30 };
    class AudioPlayer { constructor(audio, container) { players.push({ audio, container }); } }
    registerMessageShellContext({ state: { chatElement: chatRoot, AudioPlayer }, isReactMainChatOwner: () => false,
        delay: () => timeout.promise, humanFileSize: size => `${size} bytes`, mountReactMainChatMessageListPanel: mount });
});
afterEach(() => { delete globalThis.document; delete globalThis.HTMLMediaElement; delete globalThis.$; });

test('native row renders image/video/audio after load, restores playback and adjusts scrolling', async () => {
    const oldVideo = new Media('mes_video'); oldVideo.setAttribute('src', '/video'); oldVideo.readyState = 2; oldVideo.currentTime = 18; oldVideo.paused = false;
    mediaWrapper.append(oldVideo); mediaWrapper.onReplace = () => { chatRoot.scrollHeight = 150; };
    const message = { extra: { inline_image: false, title: 'fallback', media: [
        { type: 'image', url: '/image', title: 'image title' }, { type: 'video', url: '/video' }, { type: 'audio', url: '/audio' },
    ], files: [{ name: '<notes>', size: 3 }] } };
    appendMediaToMessage(message, row, 'adjust');
    expect(fileWrapper.querySelector('.mes_file_name').textContent).toBe('<notes>');
    expect(mediaWrapper.children).toEqual([oldVideo]); expect(players).toHaveLength(1);
    created.image.dispatch('error'); created.video.dispatch('loadeddata'); players[0].audio.dispatch('loadeddata');
    await flush();
    expect(mediaWrapper.children.map(node => node.name)).toEqual(['mes_img_container', 'mes_video_container', 'mes_audio_container']);
    expect(created.image.getAttribute('src')).toBe('/image'); expect(created.image.getAttribute('title')).toBe('image title');
    expect(created.image.classList.contains('error')).toBe(true); expect(created.image.getAttribute('alt')).toBe('');
    expect(created.video.getAttribute('title')).toBe('fallback'); expect(created.video.currentTime).toBe(0);
    created.video.dispatch('loadedmetadata');
    expect(created.video.currentTime).toBe(18); expect(created.video.play).toHaveBeenCalledTimes(1);
    expect(players[0].container).toBe(mediaWrapper.children[2]);
    expect(row.getAttribute('data-media-display')).toBe('list'); expect(row.querySelector('.mes_text').classList.contains('inline_media')).toBe(true);
    expect(chatRoot.scrollTop).toBe(80); expect(mount).toHaveBeenCalledTimes(1);
});

test('gallery timeout inserts selected image, supports native row and preserves keep-scroll', async () => {
    chatRoot.scrollTop = 45; mediaWrapper.onReplace = () => { chatRoot.scrollHeight = 200; chatRoot.scrollTop = 99; };
    appendMediaToMessage({ extra: { media_display: 'gallery', media_index: 1, media: [{ type: 'image', url: '/one' }, { type: 'image', url: '/two' }] } }, row, 'keep');
    timeout.resolve(); await flush();
    const container = mediaWrapper.children[0];
    expect(container.getAttribute('data-index')).toBe('1'); expect(container.classList.contains('img_swipes')).toBe(true);
    expect(container.querySelector('.mes_img').getAttribute('src')).toBe('/two');
    expect(container.querySelector('.mes_img_swipe_counter').textContent).toBe('2/2'); expect(chatRoot.scrollTop).toBe(45);
});

test('empty attachments clear previous containers without changing scroll or mounting', () => {
    fileWrapper.append(new Element('old-file')); mediaWrapper.append(new Element('old-media'));
    appendMediaToMessage({ extra: {} }, row, 'none');
    expect(fileWrapper.children).toEqual([]); expect(mediaWrapper.children).toEqual([]);
    expect(chatRoot.scrollTop).toBe(30); expect(mount).not.toHaveBeenCalled();
});

test('React owner schedules refresh without mutating the native row', () => {
    const schedule = jest.fn();
    registerMessageShellContext({ state: { chatElement: chatRoot }, isReactMainChatOwner: () => true, scheduleMainChatMessageListPanelRefresh: schedule });
    appendMediaToMessage({ extra: { media: [{ type: 'image', url: '/image' }] } }, row);
    expect(mediaWrapper.children).toEqual([]);
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(mount).not.toHaveBeenCalled();
});

test('React owner updates chat state and mounts without touching the DOM', () => {
    const message = { mes: 'updated' };
    const chat = [{}];
    registerMessageShellContext({ state: { chat, chatElement: { querySelectorAll: () => { throw Error('React owns rows'); } } },
        isReactMainChatOwner: () => true, mountReactMainChatMessageListPanel: mount });
    updateMessageBlock(0, message);
    expect(chat[0]).toBe(message);
    expect(mount).toHaveBeenCalledTimes(1);
});
