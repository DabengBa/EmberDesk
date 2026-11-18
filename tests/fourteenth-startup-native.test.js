import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test.each(['loading', 'interactive', 'complete'])('binds once without jQuery at %s', readyState => {
    const source = readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');
    const start = source.indexOf('// MARK: DOM Handlers Start');
    const bindLegacyShellHandlers = jest.fn();
    const document = { readyState, addEventListener: jest.fn() };
    const setTimeout = jest.fn();
    vm.runInNewContext(source.slice(start), { document, bindLegacyShellHandlers, setTimeout });
    expect(bindLegacyShellHandlers).not.toHaveBeenCalled();
    if (readyState === 'loading') {
        expect(setTimeout).not.toHaveBeenCalled();
        expect(document.addEventListener).toHaveBeenCalledTimes(1);
        expect(document.addEventListener).toHaveBeenCalledWith('DOMContentLoaded', bindLegacyShellHandlers, { once: true });
        document.addEventListener.mock.calls[0][1]();
    } else {
        expect(document.addEventListener).not.toHaveBeenCalled();
        expect(setTimeout).toHaveBeenCalledTimes(1);
        expect(setTimeout).toHaveBeenCalledWith(bindLegacyShellHandlers, 0);
        setTimeout.mock.calls[0][0]();
    }
    expect(bindLegacyShellHandlers).toHaveBeenCalledTimes(1);
});
