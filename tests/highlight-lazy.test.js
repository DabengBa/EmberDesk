import { expect, jest, test } from '@jest/globals';
import { highlightCodeBlock } from '../public/scripts/highlight-code-block.js';

function fixture(className = '') {
    const button = { parentNode: null };
    const code = {
        className, parentNode: { className: '' }, textContent: 'sample code', dataset: {},
        appendChild: jest.fn(child => { child.parentNode = code; }),
        removeChild: jest.fn(child => { child.parentNode = null; }),
    };
    return { code, button };
}

test.each(['language-js', 'js'])('common alias %s highlights synchronously without loading the full registry', className => {
    const { code, button } = fixture(className);
    const hljs = { getLanguage: name => name === 'js', highlightElement: jest.fn(), loadAllLanguages: jest.fn() };
    highlightCodeBlock(hljs, code, button);
    expect(hljs.highlightElement).toHaveBeenCalledWith(code);
    expect(hljs.loadAllLanguages).not.toHaveBeenCalled();
});

test.each(['language-rust', '', 'rust', 'language-unknown'])('deferred block %s keeps its copy button while waiting and after highlighting', async className => {
    const { code, button } = fixture(className);
    let resolve;
    const ready = new Promise(done => { resolve = done; });
    const hljs = { getLanguage: () => false, highlightElement: jest.fn(), loadAllLanguages: jest.fn(() => ready) };
    highlightCodeBlock(hljs, code, button);
    code.appendChild(button);
    expect(hljs.highlightElement).not.toHaveBeenCalled();
    expect(button.parentNode).toBe(code);
    resolve();
    await ready;
    await Promise.resolve();
    expect(hljs.highlightElement).toHaveBeenCalledWith(code);
    expect(button.parentNode).toBe(code);
    expect(code.removeChild).toHaveBeenCalledWith(button);
});

test('no-highlight bypasses loading and failed loads retain copy', async () => {
    const { code, button } = fixture('no-highlight');
    const hljs = { getLanguage: () => false, highlightElement: jest.fn(), loadAllLanguages: jest.fn(() => Promise.reject(Error('offline'))) };
    highlightCodeBlock(hljs, code, button);
    expect(hljs.loadAllLanguages).not.toHaveBeenCalled();
    code.className = 'language-rust';
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
        highlightCodeBlock(hljs, code, button);
        code.appendChild(button);
        await Promise.resolve();
        await Promise.resolve();
        expect(button.parentNode).toBe(code);
        expect(hljs.highlightElement).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalled();
    } finally { warn.mockRestore(); }
});
