import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/scripts/message-service.js', import.meta.url), 'utf8');
const code = source.slice(source.indexOf('export function appendMediaToMessage('), source.indexOf('export function addCopyToCodeBlocks(')).replace('export ', '');

test('native row file attachments clone the real template shape and retain safe text and indices', () => {
    const clones = [];
    const makeClone = () => {
        const name = { textContent: '', setAttribute: jest.fn(), removeAttribute: jest.fn() };
        const size = { textContent: '', setAttribute: jest.fn(), removeAttribute: jest.fn() };
        const node = { setAttribute: jest.fn(), querySelectorAll: selector => selector === '.mes_file_name' ? [name] : selector === '.mes_file_size' ? [size] : [] };
        clones.push({ node, name, size });
        return node;
    };
    const template = { cloneNode: jest.fn(makeClone) };
    const fileWrapper = { replaceChildren: jest.fn(), append: jest.fn() };
    const mediaWrapper = { replaceChildren: jest.fn() };
    const row = { removeAttribute() {}, querySelectorAll: selector => ({ '.mes_file_wrapper': [fileWrapper], '.mes_media_wrapper': [mediaWrapper] })[selector] ?? [] };

    const env = {
        ensureMessageMediaIsArray() {}, isReactMainChatOwner: () => false,
        state: { chatElement: { scrollHeight: 50, scrollTop: 10 } },
        SCROLL_BEHAVIOR: { KEEP: 'keep', ADJUST: 'adjust', NONE: 'none' },
        document: { querySelectorAll: selector => selector === '#message_file_template .mes_file_container' ? [template] : [] },
        $: () => { throw Error('file template must not use jQuery'); },
        humanFileSize: size => `${size} bytes`,
    };
    const append = new Function(...Object.keys(env), `${code}; return appendMediaToMessage;`)(...Object.values(env));
    append({ extra: { files: [{ name: '<img src=x>', size: 0 }, { name: 'notes.txt', size: 12 }] } }, row, 'keep');
    expect(fileWrapper.replaceChildren).toHaveBeenCalledTimes(1);
    expect(template.cloneNode).toHaveBeenCalledTimes(2);
    expect(clones[0].node.setAttribute).toHaveBeenCalledWith('data-index', '0');
    expect(clones[1].node.setAttribute).toHaveBeenCalledWith('data-index', '1');
    expect(clones[0].name.textContent).toBe('<img src=x>');
    expect(clones[0].name.setAttribute).toHaveBeenCalledWith('title', '<img src=x>');
    expect(clones[0].size.textContent).toBe('0 bytes');
    expect(clones[0].size.setAttribute).toHaveBeenCalledWith('title', '0');
    expect(clones[1].name.textContent).toBe('notes.txt');
    expect(fileWrapper.append.mock.calls).toEqual([[clones[0].node], [clones[1].node]]);
    expect(mediaWrapper.replaceChildren).toHaveBeenCalledTimes(1);
});

test('React owner refreshes without accessing legacy template or jQuery', () => {
    const refresh = jest.fn();
    const env = {
        ensureMessageMediaIsArray: jest.fn(), isReactMainChatOwner: () => true,
        scheduleMainChatMessageListPanelRefresh: refresh,
        SCROLL_BEHAVIOR: { ADJUST: 'adjust' },
        document: { querySelectorAll: () => { throw Error('React must not use legacy templates'); } },
        $: () => { throw Error('React must not use jQuery'); },
    };
    const append = new Function(...Object.keys(env), `${code}; return appendMediaToMessage;`)(...Object.values(env));
    const message = { extra: { files: [{ name: 'notes.txt', size: 12 }] } };
    append(message, null);
    expect(env.ensureMessageMediaIsArray).toHaveBeenCalledWith(message);
    expect(refresh).toHaveBeenCalledTimes(1);
});
