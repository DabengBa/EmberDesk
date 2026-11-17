import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';

jest.unstable_mockModule('../public/scripts/notifications.js', () => ({ default: {} }));
jest.unstable_mockModule('../public/scripts/events.js', () => ({ eventSource: {}, event_types: {} }));
jest.unstable_mockModule('../public/scripts/frontend-frame.js', () => ({ isFrontendContent: () => false }));
jest.unstable_mockModule('../public/scripts/utils.js', () => ({ uuidv4: () => 'id', formatTime: value => String(value) }));
const { registerMessageShellContext } = await import('../public/scripts/message-shell-context.js');
const { appendMediaToMessage } = await import('../public/scripts/message-service.js');
const { AudioPlayer } = await import('../public/scripts/audio-player.js');

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

test('legacy media adjusts scroll with a native chat root', async () => {
    chatRoot.nodeType = 1;
    registerMessageShellContext({ state: { chatElement: chatRoot }, isReactMainChatOwner: () => false,
        delay: () => timeout.promise, mountReactMainChatMessageListPanel: mount });
    mediaWrapper.onReplace = () => { chatRoot.scrollHeight = 150; };
    appendMediaToMessage({ extra: { media: [{ type: 'image', url: '/image' }] } }, row, 'adjust');
    created.image.dispatch('load');
    await flush();
    expect(chatRoot.scrollTop).toBe(80);
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

test('separate native rows receive distinct file and media nodes, while a null row is safe', async () => {
    const second = new Element('mes'); const secondFile = new Element('mes_file_wrapper'); const secondMedia = new Element('mes_media_wrapper');
    second.append(new Element('mes_text'), secondFile, secondMedia);
    const message = { extra: { media: [{ type: 'video', url: '/broken' }], files: [{ name: 'note', size: 1 }] } };
    appendMediaToMessage(message, row, 'none');
    const firstVideo = created.video;
    appendMediaToMessage(message, second, 'none');
    const secondVideo = created.video;
    firstVideo.dispatch('error'); secondVideo.dispatch('error'); await flush();
    expect(firstVideo.classList.contains('error')).toBe(true);
    expect(secondVideo.classList.contains('error')).toBe(true);
    expect(mediaWrapper.children).toHaveLength(1); expect(secondMedia.children).toHaveLength(1);
    expect(mediaWrapper.children[0]).not.toBe(secondMedia.children[0]);
    expect(fileWrapper.children[0]).not.toBe(secondFile.children[0]);
    expect(() => appendMediaToMessage({ extra: {} }, null, 'none')).not.toThrow();
});

test('real audio player receives native nodes and destroys listeners on observed removal', async () => {
    const observers = [];
    globalThis.HTMLElement = Element;
    globalThis.HTMLAudioElement = Media;
    globalThis.MutationObserver = class {
        constructor(callback) { this.callback = callback; this.observe = jest.fn(); this.disconnect = jest.fn(); observers.push(this); }
    };
    document.body = {}; document.removeEventListener = jest.fn();
    let player;
    class RecordingPlayer extends AudioPlayer { constructor(...args) { super(...args); player = this; } }
    registerMessageShellContext({ state: { chatElement: chatRoot, AudioPlayer: RecordingPlayer }, isReactMainChatOwner: () => false,
        delay: () => timeout.promise, mountReactMainChatMessageListPanel: mount });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
        appendMediaToMessage({ extra: { media: [{ type: 'audio', url: '/audio' }] } }, row, 'none');
        const audio = created.audio; const container = player.container;
        expect(player.audio).toBe(audio);
        expect(observers[0].observe).toHaveBeenCalledWith(document.body, { childList: true, subtree: true });
        audio.dispatch('loadeddata'); await flush();
        expect(mediaWrapper.children[0]).toBe(container);
        appendMediaToMessage({ extra: {} }, row, 'none');
        expect(mediaWrapper.children).toEqual([]);
        // A browser delivers MutationObserver callbacks asynchronously; simulate delivery.
        observers[0].callback([{ removedNodes: [container] }]);
        expect(player.isDestroyed).toBe(true);
        expect(observers[0].disconnect).toHaveBeenCalledTimes(1);
        expect(audio.listeners.timeupdate).toHaveLength(0);
    } finally {
        warn.mockRestore(); delete globalThis.HTMLElement; delete globalThis.HTMLAudioElement; delete globalThis.MutationObserver;
    }
});
