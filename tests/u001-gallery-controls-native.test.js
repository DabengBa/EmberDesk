import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/scripts/message-service.js', import.meta.url), 'utf8');
const code = source.slice(source.indexOf('export function appendMediaToMessage('), source.indexOf('export function addCopyToCodeBlocks(')).replace('export ', '');

test('native gallery refresh clones controls and appends the selected media with its counter', async () => {
    const counter = { textContent: '' };
    const controls = { querySelectorAll: selector => selector === '.mes_img_swipe_counter' ? [counter] : [] };
    const controlsTemplate = { cloneNode: jest.fn(() => controls) };
    const image = { setAttribute: jest.fn(), removeAttribute: jest.fn(), classList: { remove: jest.fn() }, complete: true };
    const mediaTemplate = { setAttribute: jest.fn(), querySelector: () => image, classList: { add: jest.fn() }, append: jest.fn() };
    const mediaWrapper = { querySelectorAll: () => [], replaceChildren: jest.fn(), append: jest.fn() };
    const row = { setAttribute: jest.fn(), removeAttribute: jest.fn(), querySelectorAll: selector => selector === '.mes_media_wrapper' ? [mediaWrapper] : [] };

    const env = {
        ensureMessageMediaIsArray() {}, isReactMainChatOwner: () => false,
        state: { chatElement: { scrollHeight: 100, scrollTop: 10 } },
        SCROLL_BEHAVIOR: { KEEP: 'keep', ADJUST: 'adjust', NONE: 'none' },
        MEDIA_DISPLAY: { LIST: 'list', GALLERY: 'gallery' }, MEDIA_TYPE: { IMAGE: 'image', VIDEO: 'video', AUDIO: 'audio' },
        getMediaDisplay: () => 'gallery', getMediaIndex: () => 1,
        document: { querySelectorAll: selector => selector === '#message_gallery_controls .mes_img_swipes' ? [controlsTemplate] : [], querySelector: () => ({ cloneNode: () => mediaTemplate }) },
        $: () => { throw Error('gallery controls must not use jQuery'); },
        delay: () => new Promise(() => {}), debounce_timeout: { short: 1 }, mountReactMainChatMessageListPanel: jest.fn(),
    };
    const append = new Function(...Object.keys(env), `${code}; return appendMediaToMessage;`)(...Object.values(env));
    const message = { extra: { media: [{ type: 'image', url: '/one' }, { type: 'image', url: '/two' }] } };
    append(message, row, 'keep');
    await new Promise(resolve => setImmediate(resolve));
    expect(controlsTemplate.cloneNode).toHaveBeenCalledWith(true);
    expect(counter.textContent).toBe('2/2');
    expect(image.setAttribute).toHaveBeenCalledWith('src', '/two');
    expect(mediaTemplate.classList.add).toHaveBeenCalledWith('img_swipes');
    expect(mediaTemplate.append).toHaveBeenCalledWith(controls);
    expect(mediaWrapper.append).toHaveBeenCalledWith(mediaTemplate);
});
