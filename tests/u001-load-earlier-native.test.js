import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/scripts/chat-ops-service.js', import.meta.url), 'utf8');
const code = source.slice(source.indexOf('export async function loadEarlierChatMessages('), source.indexOf('export async function printMessages()')).replace('export ', '');

test.each([true, false])('load earlier inserts in order and preserves scroll using native chat root (wrapped=%s)', async wrapped => {
    class Element {}
    const first = new Element();
    first.matches = selector => selector === '.mes';
    first.getAttribute = () => '2';
    first.before = jest.fn();
    const button = new Element();
    button.matches = () => false;
    button.remove = jest.fn();
    const root = { children: [button, first], scrollHeight: 100, scrollTop: 0, prepend: jest.fn() };
    const rows = [new Element(), new Element()];
    const emitted = jest.fn(async () => {});


    const env = {
        state: { chatElement: wrapped ? { jquery: 'legacy', 0: root } : root, chat: ['a', 'b', 'c'] },
        isReactMainChatOwner: () => false, CHAT_TRUNCATION: 2,
        document: { getElementById: id => id === 'show_more_messages' ? button : null },
        getLastMessageId: () => 2, isElementInViewport: element => { expect(element).toBe(button); return true; },
        clamp: (x, min, max) => Math.max(min, Math.min(max, x)),
        updateMessageElement: (_message, { messageId }) => { root.scrollHeight = 180; return { 0: rows[messageId] }; },
        HTMLElement: Element, applyStylePins: jest.fn(), eventSource: { emit: emitted }, event_types: { MORE_MESSAGES_LOADED: 'more' },
        mountReactMainChatMessageListPanel: jest.fn(), $: () => { throw Error('load earlier must not use jQuery'); },
    };
    const load = new Function(...Object.keys(env), `${code}; return loadEarlierChatMessages;`)(...Object.values(env));
    await load(2);
    expect(first.before).toHaveBeenCalledWith(...rows);
    expect(button.remove).toHaveBeenCalledTimes(1);
    expect(root.scrollTop).toBe(80);
    expect(env.applyStylePins).toHaveBeenCalledTimes(1);
    expect(emitted).toHaveBeenCalledWith('more');
});

test('load earlier inserts after the button when no message is displayed', async () => {
    class Element {}
    const row = new Element();
    const button = new Element();
    button.matches = () => false;
    button.after = jest.fn();
    button.remove = jest.fn();
    const root = { children: [button], scrollHeight: 50, prepend: jest.fn() };
    const env = {
        state: { chatElement: root, chat: ['a'] }, isReactMainChatOwner: () => false, CHAT_TRUNCATION: 1,
        document: { getElementById: () => button }, getLastMessageId: () => 0, isElementInViewport: () => false,
        clamp: (x, min, max) => Math.max(min, Math.min(max, x)), updateMessageElement: () => row,
        HTMLElement: Element, applyStylePins: jest.fn(), eventSource: { emit: jest.fn(async () => {}) },
        event_types: { MORE_MESSAGES_LOADED: 'more' }, mountReactMainChatMessageListPanel: jest.fn(),
    };
    const load = new Function(...Object.keys(env), `${code}; return loadEarlierChatMessages;`)(...Object.values(env));
    await load();
    expect(button.after).toHaveBeenCalledWith(row);
    expect(button.remove).toHaveBeenCalled();
    expect(root.prepend).not.toHaveBeenCalled();
});
