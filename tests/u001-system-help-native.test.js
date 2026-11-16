import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

test('help link descendants dispatch the selected help type and prevent navigation without jQuery', () => {
    const source = readFileSync(new URL('../public/scripts/system-messages.js', import.meta.url), 'utf8');
    const functionStart = source.indexOf('export function sendSystemMessage(');
    const registration = source.slice(source.indexOf('\n}\n', functionStart) + 3);
    const listeners = [];
    const document = { addEventListener: (type, fn) => { if (type === 'click') listeners.push(fn); } };
    const send = jest.fn();
    const types = { FORMATTING: 'format', HOTKEYS: 'hotkeys', MACROS: 'macros', HELP: 'help' };
    new Function('document', '$', 'sendSystemMessage', 'system_message_types', registration)(
        document, () => { throw Error('help delegation must not depend on jQuery'); }, send, types,
    );
    const preventDefault = jest.fn();
    for (const value of ['2', ' HotKey ', 'macros', '1']) {
        const link = { getAttribute: () => value };
        const child = { closest: selector => selector.toLowerCase() === '[data-displayhelp]' ? link : null };
        for (const listener of listeners) listener({ target: child, preventDefault });
    }
    expect(send.mock.calls).toEqual([['format'], ['hotkeys'], ['macros'], ['help']]);
    expect(preventDefault).toHaveBeenCalledTimes(4);
});
