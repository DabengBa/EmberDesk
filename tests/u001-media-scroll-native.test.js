import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/scripts/message-service.js', import.meta.url), 'utf8');
const code = source.slice(source.indexOf('export function appendMediaToMessage('), source.indexOf('export function addCopyToCodeBlocks(')).replace('export ', '');
const displayRow = () => ({ setAttribute: jest.fn(), removeAttribute: jest.fn(), querySelectorAll: () => [] });

test.each([['keep', 40], ['adjust', 90], ['none', 40]])('file refresh preserves %s scrolling behavior with the injected chat root', (behavior, expected) => {
    const root = { scrollHeight: 100, scrollTop: 40 };
    const template = { setAttribute: jest.fn(), querySelectorAll: () => [{ setAttribute: jest.fn() }] };
    const fileWrapper = { replaceChildren: jest.fn(() => { root.scrollHeight = 150; }), append: jest.fn() };
    const mediaWrapper = { replaceChildren: jest.fn() };
    const text = { toggleClass: jest.fn() };
    const messageRow = { jquery: 'legacy', *[Symbol.iterator]() { yield { ...displayRow(), querySelectorAll: selector => ({ '.mes_file_wrapper': [fileWrapper], '.mes_media_wrapper': [mediaWrapper] })[selector] ?? [] }; } };
    const env = {
        ensureMessageMediaIsArray: jest.fn(), isReactMainChatOwner: () => false,
        state: { chatElement: { 0: root, jquery: 'legacy' } },
        SCROLL_BEHAVIOR: { KEEP: 'keep', ADJUST: 'adjust', NONE: 'none' },
        document: { querySelectorAll: () => [{ cloneNode: () => template }] }, humanFileSize: () => '1 KB',
    };
    const append = new Function(...Object.keys(env), `${code}; return appendMediaToMessage;`)(...Object.values(env));
    append({ extra: { files: [{ name: 'note.txt', size: 1024 }] } }, messageRow, behavior);
    expect(fileWrapper.append).toHaveBeenCalledWith(template);
    expect(mediaWrapper.replaceChildren).toHaveBeenCalledTimes(1);
    expect(root.scrollTop).toBe(expected);
});

test('image load completion adjusts scroll after the media wrapper is replaced', async () => {
    const root = { scrollHeight: 100, scrollTop: 40 };
    const image = { setAttribute: jest.fn(), removeAttribute: jest.fn(), classList: { remove: jest.fn() }, complete: true };
    const template = { setAttribute: jest.fn(), querySelector: () => image };
    const mediaWrapper = {
        querySelectorAll: () => [],
        replaceChildren: jest.fn(),
        append: jest.fn(() => { root.scrollHeight = 175; }),
    };
    const fileWrapper = { replaceChildren: jest.fn() };
    const text = { toggleClass: jest.fn() };
    const row = { jquery: 'legacy', *[Symbol.iterator]() { yield { ...displayRow(), querySelectorAll: selector => ({ '.mes_file_wrapper': [fileWrapper], '.mes_media_wrapper': [mediaWrapper] })[selector] ?? [] }; } };
    const mount = jest.fn();
    const env = {
        ensureMessageMediaIsArray: jest.fn(), isReactMainChatOwner: () => false,
        state: { chatElement: { 0: root } }, SCROLL_BEHAVIOR: { KEEP: 'keep', ADJUST: 'adjust', NONE: 'none' },
        MEDIA_DISPLAY: { LIST: 'list', GALLERY: 'gallery' }, MEDIA_TYPE: { IMAGE: 'image', VIDEO: 'video', AUDIO: 'audio' },
        getMediaDisplay: () => 'list', document: { querySelector: () => ({ cloneNode: () => template }) },
        delay: () => new Promise(() => {}), debounce_timeout: { short: 1 }, mountReactMainChatMessageListPanel: mount,
    };
    const append = new Function(...Object.keys(env), `${code}; return appendMediaToMessage;`)(...Object.values(env));
    append({ extra: { media: [{ type: 'image', url: '/image.png' }] } }, row, 'adjust');
    await new Promise(resolve => setImmediate(resolve));
    expect(mediaWrapper.append).toHaveBeenCalledWith(template);
    expect(root.scrollTop).toBe(115);
    expect(mount).toHaveBeenCalledTimes(1);
});

test('media refresh restores current playback after replacing existing media', async () => {
    class Media {
        static HAVE_NOTHING = 0;
        static HAVE_METADATA = 1;
        constructor(time, paused) {
            Object.assign(this, { currentSrc: '/audio.mp3', currentTime: time, paused, readyState: 1 });
            this.play = jest.fn();
        }
    }
    const oldAudio = new Media(28, false);
    const newAudio = new Media(0, true);
    let current = [oldAudio];
    const mediaWrapper = {
        querySelectorAll: () => current,
        replaceChildren() { current = []; },
        append() { current = [newAudio]; },
    };
    const image = { setAttribute: jest.fn(), removeAttribute: jest.fn(), classList: { remove: jest.fn() }, complete: true };
    const template = { setAttribute: jest.fn(), querySelector: () => image };
    const row = { jquery: 'legacy', *[Symbol.iterator]() { yield { ...displayRow(), querySelectorAll: selector => selector === '.mes_media_wrapper' ? [mediaWrapper] : [] }; } };
    const env = {
        ensureMessageMediaIsArray: jest.fn(), isReactMainChatOwner: () => false,
        state: { chatElement: { 0: { scrollHeight: 100, scrollTop: 40 } } },
        SCROLL_BEHAVIOR: { KEEP: 'keep', ADJUST: 'adjust', NONE: 'none' },
        MEDIA_DISPLAY: { LIST: 'list', GALLERY: 'gallery' }, MEDIA_TYPE: { IMAGE: 'image', VIDEO: 'video', AUDIO: 'audio' },
        HTMLMediaElement: Media, getMediaDisplay: () => 'list', document: { querySelector: () => ({ cloneNode: () => template }) },
        delay: () => new Promise(() => {}), debounce_timeout: { short: 1 }, mountReactMainChatMessageListPanel: jest.fn(),
    };
    const append = new Function(...Object.keys(env), `${code}; return appendMediaToMessage;`)(...Object.values(env));
    append({ extra: { media: [{ type: 'image', url: '/image.png' }] } }, row, 'none');
    await new Promise(resolve => setImmediate(resolve));
    expect(newAudio.currentTime).toBe(28);
    expect(newAudio.play).toHaveBeenCalledTimes(1);
});
