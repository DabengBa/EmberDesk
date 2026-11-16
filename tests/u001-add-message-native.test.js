import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/scripts/message-service.js', import.meta.url), 'utf8');
const start = source.indexOf('export function addOneMessage(');
const end = source.indexOf('/**\n * Creates the element of a single message', start);
const code = source.slice(start, end).replace('export ', '');

test('legacy appended message updates the last row and leaves existing messages intact', () => {
    const row = () => {
        const classes = new Set(['last_mes']);
        return { classes, classList: { remove: name => classes.delete(name), add: name => classes.add(name) } };
    };
    const first = row(), second = row(), added = row();
    const rows = [first, second];
    const root = { querySelectorAll: jest.fn(() => rows), append: (...nodes) => rows.push(...nodes) };
    const created = { jquery: 'legacy', 0: added, length: 1, [Symbol.iterator]: Array.prototype[Symbol.iterator] };
    const state = { chat: [], chatElement: { jquery: 'legacy', 0: root, length: 1, append: () => { throw new Error('message insertion must not use jQuery'); } } };
    const env = { state, isReactMainChatOwner: () => false, updateMessageElement: jest.fn(() => created), SCROLL_BEHAVIOR: { NONE: 'none', ADJUST: 'adjust' }, scrollChatToBottom: jest.fn(), applyCharacterTagsToMessageDivs: jest.fn(), updateEditArrowClasses: jest.fn() };
    const add = new Function(...Object.keys(env), `${code}; return addOneMessage;`)(...Object.values(env));
    const message = { mes: 'hi' };
    state.chat.push(message);
    expect(add(message)).toBe(created);
    expect(first.classes.has('last_mes')).toBe(false);
    expect(second.classes.has('last_mes')).toBe(false);
    expect(added.classes.has('last_mes')).toBe(true);
    expect(env.scrollChatToBottom).toHaveBeenCalledWith({ waitForFrame: true });    expect(env.applyCharacterTagsToMessageDivs).toHaveBeenCalledWith({ mesIds: 0 });
    expect(env.updateEditArrowClasses).toHaveBeenCalledTimes(1);
});

test.each(['insertBefore', 'insertAfter'])('legacy relative %s inserts the rendered row without jQuery', option => {
    const classes = new Set();
    const added = { classList: { remove: name => classes.delete(name), add: name => classes.add(name) } };
    const existing = { classList: { remove() {}, add() {} } };
    const rows = [existing];
    const parent = { insertBefore: (node, reference) => { const i = reference ? rows.indexOf(reference) : rows.length; rows.splice(i, 0, node); } };
    existing.parentNode = parent;
    Object.defineProperty(existing, 'nextSibling', { get: () => rows[rows.indexOf(existing) + 1] ?? null });
    const root = { querySelectorAll: selector => selector === '.mes' ? rows : [existing] };
    const created = { jquery: 'legacy', 0: added, length: 1, [Symbol.iterator]: Array.prototype[Symbol.iterator] };
    const state = { chat: [], chatElement: { jquery: 'legacy', 0: root, length: 1, find: () => { throw Error('relative insertion must not use jQuery'); } } };
    const env = { state, isReactMainChatOwner: () => false, updateMessageElement: () => created, SCROLL_BEHAVIOR: { NONE: 'none', ADJUST: 'adjust' }, scrollChatToBottom: jest.fn(), applyCharacterTagsToMessageDivs: jest.fn(), updateEditArrowClasses: jest.fn(), $: () => { throw Error('relative insertion must not use jQuery'); } };
    const add = new Function(...Object.keys(env), `${code}; return addOneMessage;`)(...Object.values(env));
    expect(add({ mes: 'hi' }, { [option]: 0, scroll: false })).toBe(created);
    expect(rows).toEqual(option === 'insertBefore' ? [added, existing] : [existing, added]);
});
