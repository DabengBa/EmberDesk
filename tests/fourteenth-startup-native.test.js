import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test.each(['loading', 'interactive', 'complete'])('binds once without jQuery at %s', async readyState => {
    const source = readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');
    const start = source.indexOf('// MARK: DOM Handlers Start');
    const bindLegacyShellHandlers = jest.fn();
    let listener;
    const document = { readyState, addEventListener: jest.fn((name, callback) => { expect(name).toBe('DOMContentLoaded'); listener = callback; }) };
    vm.runInNewContext(source.slice(start), { document, bindLegacyShellHandlers });
    if (readyState === 'loading') {
        expect(bindLegacyShellHandlers).not.toHaveBeenCalled();
        listener();
    }
    expect(bindLegacyShellHandlers).toHaveBeenCalledTimes(1);
});
