import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

test('branch menu fallback restores visibility without jQuery, including a failed React projection', () => {
    const source = readFileSync(new URL('../public/scripts/chat-branch.js', import.meta.url), 'utf8');
    const code = source.slice(source.indexOf('const branchButtonDisplays ='), source.indexOf('// Export is used by Timelines')).replace('export ', '');
    const element = { style: { display: 'inline-flex' }, tagName: 'BUTTON' };
    const document = { getElementById: () => element };
    const metadata = { main_chat: null };
    let fail = false;
    const show = new Function('document', 'getComputedStyle', 'chat_metadata', 'setOptionsMenuBranchVisibility', '$', 'WeakMap', `${code}; return showBranchChatButtons;`)(document, () => ({ display: element.style.display || 'inline-block' }), metadata, () => { if (fail) throw Error('mount'); return false; }, () => { throw Error('fallback must not use jQuery'); }, WeakMap);
    show();
    expect(element.style.display).toBe('none');
    metadata.main_chat = 'parent';
    show();
    expect(element.style.display).toBe('inline-flex');
    fail = true;
    show();
    expect(element.style.display).toBe('none');
});

test('React projection owns branch visibility when mounted', () => {
    const source = readFileSync(new URL('../public/scripts/chat-branch.js', import.meta.url), 'utf8');
    const code = source.slice(source.indexOf('const branchButtonDisplays ='), source.indexOf('// Export is used by Timelines')).replace('export ', '');
    const project = jest.fn(() => true);
    const document = { getElementById: () => { throw Error('React owns the menu'); } };
    const show = new Function('document', 'chat_metadata', 'setOptionsMenuBranchVisibility', `${code}; return showBranchChatButtons;`)(document, { main_chat: 'parent' }, project);
    show();
    expect(project).toHaveBeenCalledWith(true);
});

test('branch fallback overrides stylesheet display none with the default element display', () => {
    const source = readFileSync(new URL('../public/scripts/chat-branch.js', import.meta.url), 'utf8');
    const code = source.slice(source.indexOf('const branchButtonDisplays ='), source.indexOf('// Export is used by Timelines')).replace('export ', '');
    const button = { style: { display: 'none' }, tagName: 'BUTTON' };
    const probe = { remove: jest.fn() };
    const document = { getElementById: () => button, createElement: () => probe, body: { appendChild: jest.fn() } };
    const show = new Function('document', 'getComputedStyle', 'chat_metadata', 'setOptionsMenuBranchVisibility', `${code}; return showBranchChatButtons;`)(document, element => ({ display: element === probe ? 'inline-block' : 'none' }), { main_chat: 'parent' }, () => false);
    show();
    expect(button.style.display).toBe('inline-block');
    expect(probe.remove).toHaveBeenCalled();
});

test('branch button descendants start a branch for their message, ignoring missing IDs', async () => {
    const source = readFileSync(new URL('../public/scripts/chat-branch.js', import.meta.url), 'utf8');
    const initSource = source.slice(source.indexOf('export function initBranchUI()')).replace('export ', '');
    const listeners = [];
    const branch = jest.fn(async () => {});
    const document = { addEventListener: (_type, fn) => listeners.push(fn) };
    const init = new Function('document', 'branchChat', '$', `${initSource}; return initBranchUI;`)(document, branch, () => { throw Error('branch click must not depend on jQuery'); });
    init();
    const fire = id => {
        const row = { getAttribute: () => id };
        const button = { closest: selector => selector === '.mes' ? row : null };
        const child = { closest: selector => selector === '.mes_create_branch' ? button : null };
        for (const listener of listeners) listener({ target: child });
    };
    fire('7');
    fire(null);
    await new Promise(resolve => setImmediate(resolve));
    expect(branch).toHaveBeenCalledTimes(1);
    expect(branch).toHaveBeenCalledWith(7);
});
