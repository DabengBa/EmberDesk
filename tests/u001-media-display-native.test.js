import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/scripts/message-service.js', import.meta.url), 'utf8');
const code = source.slice(source.indexOf('export function appendMediaToMessage('), source.indexOf('export function addCopyToCodeBlocks(')).replace('export ', '');

test('media visibility updates each native row without jQuery attribute or text traversal', async () => {
    const makeRow = () => {
        const attributes = new Map([['data-media-display', 'gallery']]);
        const classes = new Set(['inline_media']);
        const text = { classList: { toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name) } };
        return { attributes, classes, setAttribute: (name, value) => attributes.set(name, String(value)), removeAttribute: name => attributes.delete(name), querySelectorAll: selector => selector === '.mes_text' ? [text] : [] };
    };
    const rows = [makeRow(), makeRow()];

    const image = { setAttribute: jest.fn(), removeAttribute: jest.fn(), classList: { remove: jest.fn() }, complete: true };
    const template = { setAttribute: jest.fn(), querySelector: () => image };
    const env = {
        ensureMessageMediaIsArray: jest.fn(), isReactMainChatOwner: () => false,
        state: { chatElement: { scrollHeight: 100, scrollTop: 0 } },
        SCROLL_BEHAVIOR: { KEEP: 'keep', ADJUST: 'adjust', NONE: 'none' },
        MEDIA_DISPLAY: { LIST: 'list', GALLERY: 'gallery' }, MEDIA_TYPE: { IMAGE: 'image', VIDEO: 'video', AUDIO: 'audio' },
        getMediaDisplay: () => 'list', document: { querySelector: () => ({ cloneNode: () => template }) },
        delay: () => new Promise(() => {}), debounce_timeout: { short: 1 }, mountReactMainChatMessageListPanel: jest.fn(),
    };
    const append = new Function(...Object.keys(env), `${code}; return appendMediaToMessage;`)(...Object.values(env));
    for (const row of rows) append({ extra: {} }, row, 'none');
    for (const row of rows) {
        expect(row.attributes.has('data-media-display')).toBe(false);
        expect(row.classes.has('inline_media')).toBe(false);
    }
    for (const row of rows) append({ extra: { media: [{ type: 'image', url: '/image.png' }], inline_image: false } }, row, 'none');
    for (const row of rows) {
        expect(row.attributes.get('data-media-display')).toBe('list');
        expect(row.classes.has('inline_media')).toBe(true);
    }
    await new Promise(resolve => setImmediate(resolve));

});
