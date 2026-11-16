import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

test('attachment selection shows names and total size, then resets when the chat changes', async () => {
    const source = readFileSync(new URL('../public/scripts/chats.js', import.meta.url), 'utf8');
    const fn = source.slice(source.indexOf('async function onFileAttach('), source.indexOf('\n/**\n * Deletes file from a message.'));
    const field = () => ({ textContent: '', setAttribute: jest.fn() });
    const name = field();
    const size = field();
    const form = { querySelector: selector => selector === '.file_name' ? name : size, classList: { remove: jest.fn() }, reset: jest.fn() };
    const once = jest.fn();
    const env = {
        document: { getElementById: () => form }, validateFile: async () => true,
        humanFileSize: n => `${n} bytes`, getCurrentChatId: () => 'chat',
        eventSource: { once }, event_types: { CHAT_CHANGED: 'chat-changed' },
        t: (strings, ...values) => strings.reduce((s, part, i) => s + part + (values[i] ?? ''), ''),
        $: () => { throw Error('attachment form must not depend on jQuery'); },
    };
    const attach = new Function(...Object.keys(env), `${fn}; return onFileAttach;`)(...Object.values(env));
    await attach([{ name: 'a.txt', size: 3 }, { name: 'b.txt', size: 4 }]);
    expect(name.textContent).toBe('2 files selected');
    expect(name.setAttribute).toHaveBeenCalledWith('title', 'a.txt\nb.txt');
    expect(size.textContent).toBe('7 bytes');
    expect(size.setAttribute).toHaveBeenCalledWith('title', '7');
    expect(form.classList.remove).toHaveBeenCalledWith('displayNone');
    expect(once).toHaveBeenCalledWith('chat-changed', expect.any(Function));
    once.mock.calls[0][1]();
    expect(form.reset).toHaveBeenCalledTimes(1);
});
