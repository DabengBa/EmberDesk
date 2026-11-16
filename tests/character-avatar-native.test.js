import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

jest.unstable_mockModule('../public/scripts/notifications.js', () => ({ default: {} }));
jest.unstable_mockModule('../public/scripts/utils.js', () => ({ throttle: fn => fn }));
jest.unstable_mockModule('../public/scripts/constants.js', () => ({ debounce_timeout: {} }));
jest.unstable_mockModule('../public/scripts/events.js', () => ({ eventSource: { on: jest.fn() }, event_types: {} }));
jest.unstable_mockModule('../public/scripts/main-chat-composer-service.js', () => ({ renameComposerDraftContext: jest.fn(), setComposerDraftContext: jest.fn(), requestComposerFocus: jest.fn() }));
jest.unstable_mockModule('../public/scripts/workspace-interaction-commands.js', () => ({ installWorkspaceInteractionCommands: jest.fn() }));
jest.unstable_mockModule('../public/scripts/chat-ui-motion.js', () => ({ transitionOpacity: jest.fn() }));

const { registerDomHandlersShellContext } = await import('../public/scripts/dom-handlers-shell-context.js');
const { bindLegacyShellHandlers } = await import('../public/scripts/dom-handlers.js');

test('real legacy favorite click updates state before row and save, while create never persists', async () => {
    const button = new EventTarget(), calls = [], state = { fav_ch_checked: false, menu_type: 'edit', this_chid: 7 };
    const stop = new Error('favorite bound');
    const shell = new Proxy({ state, initCharacterSearch: () => {},
        updateFavButtonState: value => { state.fav_ch_checked = value; calls.push(['state', value]); },
        updateCharacterRow: (id, data) => calls.push(['row', id, data.fav, state.fav_ch_checked]),
        saveCharacterDebounced: () => calls.push(['save', state.fav_ch_checked]) },
    { get: (target, key) => key in target ? target[key] : jest.fn() });
    registerDomHandlersShellContext(shell);
    globalThis.document = { addEventListener: () => {}, getElementById: id => id === 'favorite_button' ? button : id === 'chat' ? new EventTarget() : null };
    globalThis.window = {}; globalThis.CSS = { supports: () => true };
    globalThis.__emberDeskBulkDeleteController = { setSelectionHandler: jest.fn() };
    const chain = { on: () => chain };
    globalThis.$ = selector => {
        if (selector === '#favorite_button') throw new Error('favorite click must not use jQuery');
        if (selector === '#options_button') throw stop;
        return chain;
    };
    await expect(bindLegacyShellHandlers()).rejects.toBe(stop);
    button.dispatchEvent(new Event('click'));
    expect(calls).toEqual([['state', true], ['row', 7, true, true], ['save', true]]);
    state.menu_type = 'create'; button.dispatchEvent(new Event('click'));
    expect(calls.at(-1)).toEqual(['state', false]); expect(calls).toHaveLength(4);
});

test('the real create button enters create mode and remounts authoring in order without jQuery binding', async () => {
    const button = new EventTarget();
    const calls = []; const state = {};
    const stop = new Error('finished create binding');
    const shell = new Proxy({ state, select_rm_create: () => calls.push(`select:${state.selected_button}`), queueReactCharacterAuthoringRemount: () => calls.push('remount') },
        { get: (target, key) => key in target ? target[key] : jest.fn() });
    registerDomHandlersShellContext(shell);
    globalThis.document = { getElementById: id => id === 'rm_button_create' ? button : null, addEventListener: () => {} };
    globalThis.window = {}; globalThis.CSS = { supports: () => true };
    globalThis.__emberDeskBulkDeleteController = { setSelectionHandler: jest.fn() };
    const chain = { on: () => chain };
    globalThis.$ = selector => { if (selector === '#rm_button_create') throw new Error('create button must not bind with jQuery'); if (selector === '#rm_button_selected_ch') throw stop; return chain; };
    await expect(bindLegacyShellHandlers()).rejects.toBe(stop);
    button.dispatchEvent(new Event('click', { bubbles: true }));
    expect(calls).toEqual(['select:create', 'remount']);
});

test('real shell binding handles native and programmatic change on the same avatar input without a jQuery selector', async () => {
    const input = new EventTarget();
    const chat = new EventTarget();
    const stop = new Error('finished avatar binding');
    const readAvatar = jest.fn();
    const shell = new Proxy({ state: {}, read_avatar_load: readAvatar }, { get: (target, key) => key in target ? target[key] : jest.fn() });
    registerDomHandlersShellContext(shell);
    globalThis.document = { addEventListener: () => {}, getElementById: id => id === 'add_avatar_button' ? input : id === 'chat' ? chat : null };
    globalThis.window = {};
    globalThis.CSS = { supports: () => true };
    globalThis.__emberDeskBulkDeleteController = { setSelectionHandler: jest.fn() };
    const chain = { on: () => chain };
    globalThis.$ = selector => {
        if (selector === '#add_avatar_button') throw new Error('avatar change handler must not use jQuery');
        if (selector === '#form_create') throw stop;
        return chain;
    };
    await expect(bindLegacyShellHandlers()).rejects.toBe(stop);
    input.files = [{ name: 'portrait.png' }];
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(readAvatar).toHaveBeenCalledTimes(2);
    expect(readAvatar).toHaveBeenNthCalledWith(1, input);
    expect(readAvatar).toHaveBeenNthCalledWith(2, input);
});

test('create-draft restoration sends the actual file input to the existing processor without jQuery', () => {
    const source = readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');
    const start = source.indexOf('function select_rm_create(');
    const end = source.indexOf('function select_rm_characters(', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const files = [{ name: 'draft.png' }];
    const input = { files: null };
    const stop = new Error('draft restored');
    const readAvatar = jest.fn(() => { throw stop; });
    const context = {
        selected_button: 'create', create_save: { avatar: files },
        document: { getElementById: id => id === 'add_avatar_button' ? input : null },
        read_avatar_load: readAvatar,
        $: () => { throw new Error('draft avatar restoration must not use jQuery'); },
    };
    const select = runInNewContext(`(${source.slice(start, end).replace(/\/\*\*[\s\S]*?\*\/\s*$/, '')})`, context);
    expect(() => select({ switchMenu: false })).toThrow(stop);
    expect(input.files).toBe(files);
    expect(readAvatar).toHaveBeenCalledWith(input);
});

test('legacy jQuery synthetic change reaches the same processor once without duplicating native changes', async () => {
    const input = new EventTarget();
    const stop = new Error('finished avatar binding');
    const readAvatar = jest.fn();
    registerDomHandlersShellContext(new Proxy({ state: {}, read_avatar_load: readAvatar }, { get: (target, key) => key in target ? target[key] : jest.fn() }));
    globalThis.document = { addEventListener: () => {}, getElementById: id => id === 'add_avatar_button' ? input : id === 'chat' ? new EventTarget() : null };
    globalThis.window = {};
    globalThis.CSS = { supports: () => true };
    globalThis.__emberDeskBulkDeleteController = { setSelectionHandler: jest.fn() };
    let syntheticHandler;
    const chain = { on: () => chain };
    globalThis.$ = selector => {
        if (selector === '#form_create') throw stop;
        if (selector === input) return { on: (type, handler) => { if (type === 'change') syntheticHandler = handler; } };
        return chain;
    };
    await expect(bindLegacyShellHandlers()).rejects.toBe(stop);
    expect(typeof syntheticHandler).toBe('function');
    input.files = [{ name: 'portrait.png' }];
    input.dispatchEvent(new Event('change', { bubbles: true }));
    syntheticHandler.call(input, { isTrigger: undefined });
    syntheticHandler.call(input, { isTrigger: 3 }); // jQuery trigger
    syntheticHandler.call(input, { isTrigger: 2 }); // jQuery triggerHandler
    expect(readAvatar).toHaveBeenCalledTimes(3);
    expect(readAvatar).toHaveBeenNthCalledWith(1, input);
    expect(readAvatar).toHaveBeenNthCalledWith(2, input);
    expect(readAvatar).toHaveBeenNthCalledWith(3, input);
});
