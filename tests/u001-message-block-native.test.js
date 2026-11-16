import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/scripts/message-service.js', import.meta.url), 'utf8');
const code = source.slice(source.indexOf('export function updateMessageBlock('), source.indexOf('/**\n * Ensures that the message media properties are arrays')).replace('export ', '');

test.each([true, false])('legacy block refresh uses native row lookup with wrapped=%s', wrapped => {
    const text = { innerHTML: 'old' };
    const row = { querySelectorAll: jest.fn(() => [text]) };
    const root = { querySelectorAll: jest.fn(() => [row]) };
    const state = { chatElement: wrapped ? { jquery: 'legacy', 0: root } : root };
    const reasoning = jest.fn(), copy = jest.fn(), media = jest.fn();
    const format = jest.fn(() => '<p>safe formatted</p>');
    const env = { state, isReactMainChatOwner: () => false, messageFormatting: format, updateReasoningUI: reasoning, addCopyToCodeBlocks: copy, appendMediaToMessage: media, $: () => { throw Error('single-row lookup must not depend on jQuery'); } };
    const update = new Function(...Object.keys(env), `${code}; return updateMessageBlock;`)(...Object.values(env));
    const message = { mes: 'original', name: 'A', extra: { display_text: 'display' } };
    update(4, message);
    expect(root.querySelectorAll).toHaveBeenCalledWith('[mesid="4"]');
    expect(format).toHaveBeenCalledWith('display', 'A', undefined, undefined, 4, {}, false);
    expect(text.innerHTML).toBe('<p>safe formatted</p>');
    expect(reasoning).toHaveBeenCalledWith(row);
    expect(copy).toHaveBeenCalledWith(row);
    expect(media).toHaveBeenCalledWith(message, row);
    update(4, message, { rerenderMessage: false });
    expect(format).toHaveBeenCalledTimes(1);
});

test('React block refresh updates state and schedules mount without touching legacy DOM', () => {
    const state = { chat: [{}], get chatElement() { throw Error('React owns the list'); } };
    const mount = jest.fn();
    const update = new Function('state', 'isReactMainChatOwner', 'mountReactMainChatMessageListPanel', `${code}; return updateMessageBlock;`)(state, () => true, mount);
    const message = { mes: 'changed' };
    update(0, message);
    expect(state.chat[0]).toBe(message);
    expect(mount).toHaveBeenCalledTimes(1);
});

test.each([0, 2])('legacy %i matching rows update without jQuery', count => {
    const texts = Array.from({ length: count }, () => ({ innerHTML: '' }));
    const rows = texts.map(text => ({ querySelectorAll: () => [text] }));
    const root = { querySelectorAll: () => rows };
    const wrapped = { jquery: 'legacy', 0: root, find: () => { throw Error('block lookup must not use jQuery'); } };
    const reasoning = jest.fn(), copy = jest.fn(), media = jest.fn();
    const env = { state: { chatElement: wrapped }, isReactMainChatOwner: () => false, messageFormatting: () => 'formatted', updateReasoningUI: reasoning, addCopyToCodeBlocks: copy, appendMediaToMessage: media };
    const update = new Function(...Object.keys(env), `${code}; return updateMessageBlock;`)(...Object.values(env));
    const message = { mes: 'content' };
    update(4, message);
    expect(texts.map(text => text.innerHTML)).toEqual(Array(count).fill('formatted'));
    expect(reasoning).toHaveBeenCalledWith(rows);
    expect(copy).toHaveBeenCalledWith(rows);
    expect(media).toHaveBeenCalledWith(message, rows);
});
