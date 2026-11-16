import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/scripts/message-service.js', import.meta.url), 'utf8');
const start = source.indexOf('export function scrollChatToBottom(');
const end = source.indexOf('/**\n * Formats a message according to user settings', start);
const code = source.slice(start, end).replace('export ', '');

function createScroll(state, requestAnimationFrame, cancelAnimationFrame) {
    return new Function('state', 'requestAnimationFrame', 'cancelAnimationFrame', `let requestId = null; ${code}; return scrollChatToBottom;`)(state, requestAnimationFrame, cancelAnimationFrame);
}

test('scrolls each injected chat element to the first root height immediately', () => {
    const first = { scrollHeight: 400, scrollTop: 2 };
    const second = { scrollHeight: 800, scrollTop: 3 };
    const scroll = createScroll({ chatElement: [first, second] }, jest.fn(), jest.fn());
    scroll();
    expect([first.scrollTop, second.scrollTop]).toEqual([400, 400]);
});

test('scrolls a native chat root without a collection', () => {
    const root = { nodeType: 1, scrollHeight: 400, scrollTop: 2 };
    const scroll = createScroll({ chatElement: root }, jest.fn(), jest.fn());
    scroll();
    expect(root.scrollTop).toBe(400);
});

test('coalesces pending frames including request id zero and uses latest height', () => {
    const root = { scrollHeight: 100, scrollTop: 10 };
    const callbacks = new Map();
    let id = 0;
    const request = jest.fn(callback => { const current = id++; callbacks.set(current, callback); return current; });
    const cancel = jest.fn(current => callbacks.delete(current));
    const scroll = createScroll({ chatElement: [root] }, request, cancel);
    scroll({ waitForFrame: true });
    root.scrollHeight = 250;
    scroll({ waitForFrame: true });
    expect(cancel).toHaveBeenCalledWith(0);
    expect(root.scrollTop).toBe(10);
    callbacks.get(1)();
    expect(root.scrollTop).toBe(250);
    scroll();
    expect(cancel).toHaveBeenCalledTimes(1);
});
