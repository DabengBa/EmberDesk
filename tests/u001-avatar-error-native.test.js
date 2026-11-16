import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/scripts/message-service.js', import.meta.url), 'utf8');
const start = source.indexOf('export function updateMessageElement(');
const end = source.indexOf('/**\n * Returns the URL of the avatar', start);
const code = source.slice(start, end).replace('export ', '');

test('legacy message avatar load failure shows the missing-avatar icon without jQuery event handlers', () => {
    const listeners = {};
    const parent = { innerHTML: '' };
    const image = { style: {}, parentElement: parent, addEventListener: (name, callback) => { listeners[name] = callback; } };
    const root = { querySelectorAll: selector => selector === '.avatar img' ? [image] : [] };
    const chain = { attr: jest.fn(function () { return this; }), text: jest.fn(function () { return this; }), html: jest.fn(function () { return this; }) };
    const collection = { 0: root, length: 1, closest: () => ({ length: 0 }), attr: jest.fn(), find: () => chain, addClass: jest.fn() };
    const env = {
        state: { chat: [], default_user_avatar: '/user.png' }, SCROLL_BEHAVIOR: { NONE: 'none' },
        timestampToMoment: () => ({ isValid: () => false }), buildChatMessageRenderDescriptor: () => ({}),
        buildChatMessageRichBody: () => ({ messageHtml: 'hello' }), formatGenerationTimer: () => ({}),
        buildChatMessageRowPopulation: () => ({ attributes: {}, timer: {}, classes: {} }),
        updateReasoningUI: jest.fn(), appendMediaToMessage: jest.fn(), addCopyToCodeBlocks: jest.fn(),
        $: () => { throw Error('avatar error must not need jQuery'); },
    };
    const update = new Function(...Object.keys(env), `${code}; return updateMessageElement;`)(...Object.values(env));
    const message = { is_user: true, mes: 'hello' };
    expect(update(message, { messageId: 1, messageElement: collection })).toBe(collection);
    listeners.error();
    expect(image.style.display).toBe('none');
    expect(parent.innerHTML).toBe('<div class="missing-avatar fa-solid fa-user-slash"></div>');
    expect(env.appendMediaToMessage).toHaveBeenCalledWith(message, collection, 'none');
    const missing = { ...collection, length: 0 };
    expect(() => update(message, { messageId: 1, messageElement: missing })).not.toThrow();
});
