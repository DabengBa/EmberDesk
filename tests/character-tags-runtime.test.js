import { expect, jest, test } from '@jest/globals';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

globalThis.$ = jest.fn(() => ({ children: () => ({ each: jest.fn() }) }));
jest.unstable_mockModule('../public/scripts/notifications.js', () => ({ default: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.unstable_mockModule('../public/lib.js', () => ({ DOMPurify: {} }));

jest.unstable_mockModule('../public/scripts/events.js', () => ({ eventSource: { on: jest.fn(), makeFirst: jest.fn() }, event_types: { CHARACTER_DUPLICATED: 'duplicated', CHAT_CHANGED: 'chat' } }));
jest.unstable_mockModule('../public/scripts/filters.js', () => {
    const FILTER_STATES = Object.fromEntries(['SELECTED', 'EXCLUDED', 'UNDEFINED'].map(key => [key, { key, class: key.toLowerCase() }]));
    const stateKey = state => typeof state === 'string' ? state : Object.keys(FILTER_STATES).find(key => FILTER_STATES[key] === state);
    return { FILTER_TYPES: { TAG: 'tag', FAV: 'fav' }, FILTER_STATES, DEFAULT_FILTER_STATE: 'UNDEFINED', isFilterState: (a, b) => stateKey(a) === stateKey(b), FilterHelper: class {} };
});
jest.unstable_mockModule('../public/scripts/utils.js', () => ({ download: jest.fn(), parseJsonFile: jest.fn(), uuidv4: () => 'id', equalsIgnoreCaseAndAccents: (a, b) => a.toLowerCase() === b.toLowerCase(), includesIgnoreCaseAndAccents: jest.fn(), removeFromArray: (items, item) => { const index = items.indexOf(item); if (index === -1) return false; items.splice(index, 1); return true; }, getFreeName: jest.fn(), findChar: jest.fn(), escapeHtml: x => x }));
jest.unstable_mockModule('../public/scripts/power-user.js', () => ({ power_user: { tag_sort_mode: 'manual' } }));
jest.unstable_mockModule('../public/scripts/popup.js', () => ({ POPUP_RESULT: { AFFIRMATIVE: 1 }, POPUP_TYPE: { CONFIRM: 1 }, Popup: {}, callGenericPopup: jest.fn() }));
jest.unstable_mockModule('../public/scripts/keyboard.js', () => ({ INTERACTABLE_CONTROL_CLASS: 'interactable' }));
jest.unstable_mockModule('../public/scripts/templates.js', () => ({ renderTemplateAsync: jest.fn() }));
jest.unstable_mockModule('../public/scripts/i18n.js', () => ({ t: parts => parts.join(''), translate: x => x }));
jest.unstable_mockModule('../public/scripts/util/AccountStorage.js', () => ({ accountStorage: { getItem: jest.fn(() => null), setItem: jest.fn() } }));
jest.unstable_mockModule('../public/scripts/workspace-panels-react-bridge.js', () => ({ loadWorkspacePanelsModule: jest.fn() }));

const { registerCharacterTagsShellContext } = await import('../public/scripts/character-tags-shell-context.js');
const tags = await import('../public/scripts/tags.js');

test('React message rows own live character tag attributes while legacy projection leaves them alone', async () => {
    const original = { document: globalThis.document, window: globalThis.window };
    const readChildren = jest.fn(() => { throw new Error('React-owned messages must not be mutated'); });
    const chat = { dataset: { reactMainChatOwner: 'react' }, get children() { return readChildren(); } };
    globalThis.document = { getElementById: id => id === 'chat' ? chat : null };
    globalThis.window = { location: { origin: 'https://example.test' } };
    registerCharacterTagsShellContext({ state: { characters: [{ avatar: 'a b.png' }] }, saveSettingsDebounced: jest.fn(), printCharactersDebounced: jest.fn() });
    const req = createRequire(new URL('../package.json', import.meta.url));
    const { transformWithOxc } = await import('vite');
    const source = fs.readFileSync(new URL('../app/components/main-chat/MainChatMessageRow.tsx', import.meta.url), 'utf8');
    const compiled = (await transformWithOxc(source, 'MainChatMessageRow.tsx', { jsx: { runtime: 'automatic' } })).code
        .replace(/^import .*;\s*$/gm, '').replace('export const MainChatMessageRow =', 'const MainChatMessageRow =');
    const module = { exports: {} };
    const bulk = { subscribe: () => () => {}, getSnapshot: () => ({ active: false, selected: null }) };
    const imports = {
        '../../compat/i18n.js': { translate: x => x, useTranslated: () => {} },
        '../../compat/frontend-frames': { useFrontendFrames: () => {} },
        '../../lib/dialogue-service': { getWorkspaceBulkDeleteController: () => bulk },
    };
    const React = req('react');
    const { jsx: _jsx, jsxs: _jsxs } = req('react/jsx-runtime');
    const { memo, useEffect, useLayoutEffect, useRef, useState } = React;
    const useSyncExternalStore = (subscribe, getSnapshot, getServerSnapshot = getSnapshot) => React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    const { translate, useTranslated } = imports['../../compat/i18n.js'];
    const { useFrontendFrames } = imports['../../compat/frontend-frames'];
    const { getWorkspaceBulkDeleteController } = imports['../../lib/dialogue-service'];
    const DOMPurify = req('dompurify');
    new Function('module', 'memo', 'useEffect', 'useLayoutEffect', 'useRef', 'useState', 'useSyncExternalStore', 'DOMPurify', 'translate', 'useTranslated', 'useFrontendFrames', 'getWorkspaceBulkDeleteController', '_jsx', '_jsxs', `${compiled}\nmodule.exports = { MainChatMessageRow };`)(module, memo, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, DOMPurify, translate, useTranslated, useFrontendFrames, getWorkspaceBulkDeleteController, _jsx, _jsxs);
    const { renderToStaticMarkup } = req('react-dom/server');
    const message = { id: '0', uid: 'u', role: 'character', name: 'Alice', avatarUrl: '/thumbnail?file=a%20b.png', rootClassNames: [], state: 'finalized' };
    const render = () => renderToStaticMarkup(React.createElement(module.exports.MainChatMessageRow, { message }));
    try {
        tags.loadTagsSettings({ tags: [{ id: 't', name: 'Café, au lait' }], tag_map: { 'a b.png': ['t'] } });
        expect(render()).toContain('data-char-tags="Café  au lait"');
        expect(render()).toContain('data-char-tag-cafe-au-lait=""');
        const runtime = globalThis[Symbol.for('emberdesk.messageTagRuntime')];
        const notify = jest.fn(); const unsubscribe = runtime.subscribe(notify);
        tags.createTagManagementRuntime().commands.renameTag('t', 'Renamed');
        expect(notify).toHaveBeenCalled();
        expect(render()).toContain('data-char-tag-renamed=""');
        expect(render()).not.toContain('data-char-tag-cafe-au-lait');
        message.avatarUrl = '/thumbnail?file=other.png';
        expect(render()).not.toContain('data-char-tags=');
        notify.mockClear();
        tags.loadTagsSettings({ tags: [{ id: 'x', name: 'Élite' }, { id: 'y', name: 'Elite' }, { id: 'z', name: '!!!' }], tag_map: { 'force.png': ['x', 'y', 'z', 'missing'] } });
        expect(notify).toHaveBeenCalledTimes(1);
        message.avatarUrl = '/thumbnail?file=force.png';
        const forceMarkup = render();
        expect(forceMarkup).toContain('data-char-tags="Élite,Elite,!!!"');
        expect(forceMarkup.match(/data-char-tag-elite=/g)).toHaveLength(1);
        expect(forceMarkup).not.toContain('data-char-tag-="');
        message.avatarUrl = '/user-avatar.png';
        expect(render()).not.toContain('data-char-tags=');
        unsubscribe();
        notify.mockClear();
        tags.loadTagsSettings({ tags: [], tag_map: {} });
        expect(notify).not.toHaveBeenCalled();
        expect(() => tags.applyCharacterTagsToMessageDivs()).not.toThrow();
        expect(readChildren).not.toHaveBeenCalled();
    } finally { globalThis.document = original.document; globalThis.window = original.window; }
});

test('React folder bridge opens nested folders and backs out via the real tag model without jQuery', () => {
    const source = fs.readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');
    const start = source.indexOf('function getReactCharacterLibraryPanelBridge() {');
    const end = source.indexOf('\nasync function loadReactCharacterLibraryPanelModule()', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const model = { tag: { selected: [], excluded: [] } };
    const helper = { getFilterData: key => model[key], setFilterData: (key, value) => { model[key] = value; } };
    registerCharacterTagsShellContext({ state: { entitiesFilter: helper, characters: [] }, saveSettingsDebounced: jest.fn(), printCharactersDebounced: jest.fn() });
    tags.loadTagsSettings({ tags: [{ id: '1', name: 'One', folder_type: 'CLOSED' }, { id: '2', name: 'Two', folder_type: 'CLOSED' }], tag_map: {} });
    const getBridge = vm.runInNewContext(`(${source.slice(start, end)})`, {
        chooseBogusFolder: tags.chooseBogusFolder,
        $: () => { throw new Error('React folder bridge must not use jQuery'); },
    });
    const bridge = getBridge();
    bridge.onOpenFolder(1);
    bridge.onOpenFolder('2');
    expect(model.tag.selected).toEqual(['1', '2']);
    bridge.onBackFolder();
    expect(model.tag.selected).toEqual(['1']);
    bridge.onBackFolder();
    expect(model.tag.selected).toEqual([]);
    bridge.onBackFolder();
    expect(model.tag.selected).toEqual([]);
});

test('the actual React folder row renders and opens through its bridge without a legacy folder renderer', async () => {
    const { transformWithOxc } = await import('vite');
    const source = fs.readFileSync(new URL('../app/components/character-library/CharacterLibraryFolderRow.tsx', import.meta.url), 'utf8');
    const compiled = (await transformWithOxc(source, 'CharacterLibraryFolderRow.tsx', { jsx: { runtime: 'automatic' } })).code
        .replace(/^import .*;\s*$/gm, '').replace('export function CharacterLibraryFolderRow', 'function CharacterLibraryFolderRow');
    const req = createRequire(new URL('../package.json', import.meta.url));
    const React = req('react');
    const { jsx, jsxs } = req('react/jsx-runtime');
    const folderRow = new Function('_jsx', '_jsxs', `${compiled}\nreturn CharacterLibraryFolderRow;`)(jsx, jsxs);
    const onOpen = jest.fn();
    const originalDollar = globalThis.$;
    globalThis.$ = () => { throw new Error('React folder row must not use jQuery'); };
    try {
        const props = { id: 'folder-a', name: 'Folder A', count: 2, hiddenCount: 1, onOpen };
        const markup = req('react-dom/server').renderToStaticMarkup(React.createElement(folderRow, props));
        expect(markup).toContain('id="BogusFolderfolder-a"');
        expect(markup).toContain('2 characters');
        expect(markup).toContain('1 hidden');
        const event = { preventDefault: jest.fn(), stopPropagation: jest.fn() };
        folderRow(props).props.onClick(event);
        expect(onOpen).toHaveBeenCalledWith('folder-a');
        expect(event.preventDefault).toHaveBeenCalledTimes(1);
        expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    } finally { globalThis.$ = originalDollar; }
});

test('React filter commands cycle tags and favorites, update the view and persist without jQuery', async () => {
    const { accountStorage } = await import('../public/scripts/util/AccountStorage.js');
    const original = { document: globalThis.document, $: globalThis.$ };
    const input = new EventTarget(); input.value = 'query';
    globalThis.document = { querySelector: selector => selector === '#character_search_bar' ? input : null, getElementById: () => null };
    globalThis.$ = () => { throw new Error('React tag filters must not use jQuery'); };
    const data = { tag: { selected: [], excluded: [] }, fav: 'UNDEFINED' };
    const helper = { getFilterData: key => data[key], setFilterData: (key, value) => { data[key] = value; } };
    const save = jest.fn(), refresh = jest.fn();
    registerCharacterTagsShellContext({ state: { entitiesFilter: helper, characters: [{ avatar: 'a.png' }] }, saveSettingsDebounced: save, printCharactersDebounced: refresh });
    tags.loadTagsSettings({ tags: [{ id: 't', name: 'Tag' }], tag_map: { 'a.png': ['t'] } });
    accountStorage.setItem.mockClear();
    try {
        expect(tags.cycleCharacterTagFilterState('t', helper)).toBe('SELECTED');
        expect(data.tag).toEqual({ selected: ['t'], excluded: [] });
        expect(tags.createCharacterTagFilterViewState(helper).activeTags[0]).toMatchObject({ id: 't', filterState: 'SELECTED' });
        expect(tags.cycleCharacterTagFilterState('t', helper)).toBe('EXCLUDED');
        expect(data.tag).toEqual({ selected: [], excluded: ['t'] });
        expect(tags.runCharacterTagFilterAction('1', helper)).toBe(true);
        expect(data.fav).toBe('SELECTED');
        expect(accountStorage.setItem).toHaveBeenCalledWith('CharacterList_TagFilterState_FAV', 'SELECTED');
        expect(accountStorage.setItem).toHaveBeenCalledWith('CharacterList_tag_t', 'EXCLUDED');
        tags.onClearAllFiltersClick(helper);
        expect(data).toEqual({ tag: { selected: [], excluded: [] }, fav: 'UNDEFINED' });
        expect(input.value).toBe('');
        expect(tags.tags[0].filter_state).toBe('UNDEFINED');
        expect(save).toHaveBeenCalled(); expect(refresh).toHaveBeenCalled();
    } finally { globalThis.document = original.document; globalThis.$ = original.$; }
});

test('tag module initializes without a global jQuery dependency', async () => {
    const original = { document: globalThis.document, $: globalThis.$ };
    globalThis.document = { querySelector: () => null };
    globalThis.$ = () => { throw new Error('tag module import must not use jQuery'); };
    try {
        await jest.isolateModulesAsync(async () => {
            const isolated = await import('../public/scripts/tags.js');
            expect(isolated.importTags).toBeInstanceOf(Function);
        });
    } finally { globalThis.document = original.document; globalThis.$ = original.$; }
});

test('plain tag list appends and removes a rendered tag without jQuery', async () => {
    const original = { document: globalThis.document, $: globalThis.$ };
    class Node extends EventTarget {
        constructor() { super(); this.style = {}; this.attrs = {}; this.children = []; this.classList = { add: jest.fn() }; }
        setAttribute(name, value) { this.attrs[name] = value; }
        getAttribute(name) { return name === 'id' ? this.id : this.attrs[name]; }
        querySelector(selector) { return this.parts?.[selector] ?? null; }
        querySelectorAll(selector) { return selector === '.tag' ? this.children : []; }
        append(node) { this.children.push(node); node.remove = () => { this.children = this.children.filter(child => child !== node); }; }
    }
    const template = { cloneNode() { const node = new Node(); node.parts = { '.tag_name': new Node(), '.tag_remove': new Node() }; return node; } };
    globalThis.document = { querySelector: selector => selector === '#tag_template .tag' ? template : null };
    globalThis.$ = () => { throw new Error('plain tag list must not use jQuery'); };
    try {
        await jest.isolateModulesAsync(async () => {
            const isolated = await import('../public/scripts/tags.js');
            const host = new Node(), remove = jest.fn(() => true);
            isolated.appendTagToList(host, { id: 't', name: 'Tag', color: 'red', color2: 'white' }, { removable: true, removeAction: remove });

            expect(host.children).toHaveLength(1);
            const node = host.children[0];
            expect(node.id).toBe('t'); expect(node.parts['.tag_name'].textContent).toBe('Tag');
            expect(node.style).toEqual({ backgroundColor: 'red', color: 'white' });
            isolated.appendTagToList(host, { id: 't', name: 'Tag' });
            expect(host.children).toHaveLength(1);
            node.parts['.tag_remove'].dispatchEvent(new Event('click'));
            expect(remove).toHaveBeenCalledWith(expect.objectContaining({ id: 't' }));
            expect(host.children).toHaveLength(0);
            const other = new Node();
            isolated.appendTagToList({ jquery: '3.7.1', 0: host, 1: other, length: 2 }, { id: 'b', name: 'Both' }, { removable: true, removeAction: () => false });
            expect(host.children).toHaveLength(1); expect(other.children).toHaveLength(1);
            other.children[0].parts['.tag_remove'].dispatchEvent(new Event('click'));
            expect(other.children).toHaveLength(1);
        });
    } finally { globalThis.document = original.document; globalThis.$ = original.$; }
});

test('interactive tag invokes its action and renders in the native list without jQuery', async () => {
    const original = { document: globalThis.document, $: globalThis.$ };
    class Node extends EventTarget {
        constructor() { super(); this.style = {}; this.children = []; this.classList = { add: jest.fn() }; }
        setAttribute() {}
        getAttribute(name) { return name === 'id' ? this.id : null; }
        querySelector(selector) { return this.parts?.[selector] ?? null; }
        querySelectorAll() { return this.children; }
        append(node) { this.children.push(node); }
    }
    const template = { cloneNode() { const node = new Node(); node.parts = { '.tag_name': new Node(), '.tag_remove': new Node() }; return node; } };
    globalThis.document = { querySelector: selector => selector === '#tag_template .tag' ? template : null };
    globalThis.$ = () => { throw new Error('interactive tag must not use jQuery'); };
    try {
        await jest.isolateModulesAsync(async () => {
            const isolated = await import('../public/scripts/tags.js');
            const context = await import('../public/scripts/character-tags-shell-context.js');
            const helper = {};
            context.registerCharacterTagsShellContext({ state: { entitiesFilter: helper } });

            const host = new Node(), action = jest.fn();
            isolated.appendTagToList(host, { id: 'a', name: 'Action' }, { action });
            expect(host.children).toHaveLength(1);
            const event = new Event('click');
            host.children[0].dispatchEvent(event);
            expect(action).toHaveBeenCalledWith(helper, event);
        });
    } finally { globalThis.document = original.document; globalThis.$ = original.$; }
});

test('folder rendering preserves identity, colors, counters and avatar target without jQuery', async () => {
    const original = { document: globalThis.document, $: globalThis.$ };
    class Node {
        constructor() { this.style = {}; this.attrs = {}; this.classList = { add: jest.fn() }; }
        setAttribute(key, value) { this.attrs[key] = value; }
        querySelector(key) { return this.parts[key]; }
        querySelectorAll(key) { return [this.parts[key]]; }
    }
    const folder = new Node();
    folder.parts = Object.fromEntries(['.avatar', '.ch_name', '.bogus_folder_hidden_counter', '.bogus_folder_counter', '.bogus_folder_icon', '.bogus_folder_avatars_block'].map(key => [key, new Node()]));
    globalThis.document = { querySelector: selector => selector === '#bogus_folder_template .bogus_folder_select' ? { cloneNode: () => folder } : null };
    globalThis.$ = () => { throw new Error('folder must not use jQuery'); };
    try {
        await jest.isolateModulesAsync(async () => {
            const isolated = await import('../public/scripts/tags.js');
            const context = await import('../public/scripts/character-tags-shell-context.js');
            const build = jest.fn();
            context.registerCharacterTagsShellContext({ buildAvatarList: build });
            const entities = [{ id: 1 }];
            expect(isolated.getTagBlock({ id: 'a', name: 'Folder', folder_type: 'OPEN', color: 'red' }, entities, 2)).toBe(folder);
            expect(folder.id).toBe('BogusFoldera');
            expect(folder.attrs.tagid).toBe('a');
            expect(folder.parts['.avatar'].style.backgroundColor).toBe('red');
            expect(folder.parts['.bogus_folder_hidden_counter'].textContent).toBe('2 hidden');
            expect(build).toHaveBeenCalledWith([folder.parts['.bogus_folder_avatars_block']], entities);
        });
    } finally { globalThis.document = original.document; globalThis.$ = original.$; }
});

test('assigning a tag reprints a native list without jQuery', async () => {
    const original = { document: globalThis.document, $: globalThis.$ };
    class Node extends EventTarget {
        constructor() { super(); this.style = {}; this.attrs = {}; this.children = []; this.classList = { add: jest.fn(), contains: () => false }; }
        setAttribute(name, value) { this.attrs[name] = value; }
        getAttribute(name) { return name === 'id' ? this.id : this.attrs[name]; }
        querySelector(selector) { return this.parts?.[selector] ?? null; }
        querySelectorAll(selector) { return selector === '.tag' ? this.children : []; }
        append(node) { this.children.push(node); }
        replaceChildren() { this.children = []; }
    }
    const template = { cloneNode() { const node = new Node(); node.parts = { '.tag_name': new Node(), '.tag_remove': new Node() }; return node; } };
    globalThis.document = { querySelector: selector => selector === '#tag_template .tag' ? template : null, getElementById: () => null };
    globalThis.$ = () => { throw new Error('native list reprint must not use jQuery'); };
    try {
        await jest.isolateModulesAsync(async () => {
            const isolated = await import('../public/scripts/tags.js');
            const context = await import('../public/scripts/character-tags-shell-context.js');
            context.registerCharacterTagsShellContext({ state: { characters: [{ avatar: 'a.png' }] }, saveSettingsDebounced: jest.fn(), printCharactersDebounced: jest.fn() });
            const tag = { id: 't', name: 'Tag', sort_order: 1 };
            isolated.loadTagsSettings({ tags: [tag], tag_map: {} });
            const host = new Node();
            expect(isolated.addTagsToEntity(tag, 'a.png', { tagListSelector: host, tagListOptions: { forEntityOrKey: 'a.png', sort: false } })).toBe(true);
            expect(isolated.tag_map['a.png']).toEqual(['t']);
            expect(host.children).toHaveLength(1);
            expect(host.children[0].parts['.tag_name'].textContent).toBe('Tag');
            isolated.printTagList(host, { tags: [tag], forEntityOrKey: 'a.png', sort: false, empty: false });
            expect(host.children).toHaveLength(1);
            const legacyHost = new Node();
            const wrapper = { jquery: '3.5.1', 0: legacyHost, length: 1, empty: jest.fn(() => legacyHost.replaceChildren()), hasClass: jest.fn(() => false) };
            isolated.printTagList(wrapper, { tags: [tag], forEntityOrKey: 'a.png', sort: false });
            expect(wrapper.empty).not.toHaveBeenCalled();
            expect(wrapper.hasClass).not.toHaveBeenCalled();
            expect(legacyHost.children[0].id).toBe('t');
            globalThis.document.querySelectorAll = () => [host, legacyHost];
            isolated.printTagList('.tags', { tags: [tag], forEntityOrKey: 'a.png', sort: false });
            expect(host.children).toHaveLength(1);
            expect(legacyHost.children).toHaveLength(1);
        });
    } finally { globalThis.document = original.document; globalThis.$ = original.$; }
});
test('bulk editor uses live character owner and persists only valid captured avatar keys', () => {
    const originalDocument = globalThis.document;
    globalThis.document = { getElementById: () => null };
    let characters = [{ avatar: 'a.png' }, { avatar: 'b.png' }];
    const save = jest.fn(), refresh = jest.fn();
    registerCharacterTagsShellContext({ state: { get characters() { return characters; } }, saveSettingsDebounced: save, printCharactersDebounced: refresh });
    tags.loadTagsSettings({ tags: [{ id: 't', name: 'Tag' }], tag_map: {} });
    const runtime = tags.createBulkTagEditorRuntime(['a.png', 'b.png']);
    characters = [{ avatar: 'b.png' }, { avatar: 'c.png' }];
    try {
        runtime.commands.addTag('t');
        expect(tags.tag_map).toEqual({ 'b.png': ['t'] });
        expect(save).toHaveBeenCalledTimes(1);
        expect(refresh).toHaveBeenCalledTimes(1);
    } finally { globalThis.document = originalDocument; }
});

test('character library manager mounts into popup without jQuery and cleans up on close', async () => {
    const { callGenericPopup } = await import('../public/scripts/popup.js');
    const { loadWorkspacePanelsModule } = await import('../public/scripts/workspace-panels-react-bridge.js');
    const originalDocument = globalThis.document;
    const originalDollar = globalThis.$;
    const cleanup = jest.fn();
    const mount = jest.fn(() => cleanup);
    let close;
    const closed = new Promise(resolve => { close = resolve; });
    const elements = [];
    globalThis.document = { createElement: jest.fn(() => {
        const element = { children: [], append(child) { this.children.push(child); } };
        elements.push(element);
        return element;
    }) };
    globalThis.$ = () => { throw new Error('manager must not depend on jQuery'); };
    callGenericPopup.mockImplementation(content => {
        expect(content).toBe(elements[0]);
        expect(content.id).toBe('tag_view_list');
        expect(content.children).toEqual([elements[1]]);
        return closed;
    });    loadWorkspacePanelsModule.mockResolvedValue({ mountTagManagement: mount });
    try {
        const opening = tags.openCharacterTagManager();
        await Promise.resolve();
        expect(callGenericPopup).toHaveBeenCalledTimes(1);
        expect(mount).toHaveBeenCalledWith(elements[1], expect.objectContaining({ runtime: expect.any(Object) }));
        expect(cleanup).not.toHaveBeenCalled();
        close();
        await opening;
        expect(cleanup).toHaveBeenCalledTimes(1);
    } finally {
        globalThis.document = originalDocument;
        globalThis.$ = originalDollar;
    }
});

test('clearing character filters resets search and emits a bubbling input without jQuery', () => {
    const oldDocument = globalThis.document, oldDollar = globalThis.$;
    const input = new EventTarget(); input.value = 'search';
    const listener = jest.fn(); input.addEventListener('input', listener);
    globalThis.document = { querySelector: selector => selector === '#character_search_bar' ? input : null };
    globalThis.$ = () => { throw new Error('clear filters must not use jQuery'); };
    const helper = { getFilterData: key => key === 'tag' ? { selected: [], excluded: [] } : 'UNDEFINED' };
    registerCharacterTagsShellContext({ state: { entitiesFilter: helper } });
    try {
        tags.onClearAllFiltersClick(helper);
        expect(input.value).toBe('');
        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener.mock.calls[0][0].bubbles).toBe(true);
    } finally { globalThis.document = oldDocument; globalThis.$ = oldDollar; }
});

test('tag deletion dialog creates its preview and merges associations without jQuery', async () => {
    const { callGenericPopup } = await import('../public/scripts/popup.js');
    const { renderTemplateAsync } = await import('../public/scripts/templates.js');
    const original = { document: globalThis.document, HTMLElement: globalThis.HTMLElement, $: globalThis.$ };
    class Element { constructor() { this.style = {}; } }
    const name = { textContent: '' }, remove = new Element();
    const preview = new Element(); preview.cloneNode = () => preview; preview.querySelector = selector => selector === '.tag_name' ? name : remove;
    const list = { append: jest.fn() }, select = { value: 'b' };
    const host = { set innerHTML(value) { this.html = value; }, querySelector: selector => selector === '#tag_to_delete' ? list : select };
    globalThis.document = { createElement: () => host, querySelector: () => preview, getElementById: () => null }; globalThis.HTMLElement = Element;
    globalThis.$ = () => { throw new Error('delete dialog must not use jQuery'); };
    renderTemplateAsync.mockResolvedValue('<select id="merge_tag_select"></select>');
    callGenericPopup.mockImplementation(async (content, type, input, options) => {
        expect(content).toBe(host); expect(name.textContent).toBe('Alpha');
        expect(preview.id).toBe('a'); expect(preview.style.backgroundColor).toBe('red');
        expect(remove.style.display).toBe('none'); expect(list.append).toHaveBeenCalledWith(preview);
        options.onClosing({ result: 1 });
        return 1;
    });
    registerCharacterTagsShellContext({ state: { characters: [] }, saveSettingsDebounced: jest.fn(), printCharactersDebounced: jest.fn() });
    tags.loadTagsSettings({ tags: [{ id: 'a', name: 'Alpha', color: 'red' }, { id: 'b', name: 'Beta' }], tag_map: { x: ['a'] } });
    try {
        await tags.createTagManagementRuntime().commands.deleteTag('a');
        expect(tags.tag_map.x).toEqual(['b']);
    } finally { globalThis.document = original.document; globalThis.HTMLElement = original.HTMLElement; globalThis.$ = original.$; }
});

test('tag initialization handles delegated manager click and registers events without jQuery', async () => {
    const { eventSource } = await import('../public/scripts/events.js');
    const { callGenericPopup } = await import('../public/scripts/popup.js');
    const { loadWorkspacePanelsModule } = await import('../public/scripts/workspace-panels-react-bridge.js');
    const original = { document: globalThis.document, Element: globalThis.Element, $: globalThis.$ };
    class Element extends EventTarget {
        closest(selector) { return selector === '.tags_view' ? this : null; }
        append() {}
    }
    const doc = new Element(); doc.createElement = () => new Element();
    globalThis.document = doc; globalThis.Element = Element;
    globalThis.$ = () => { throw new Error('tag initialization must not use jQuery'); };
    registerCharacterTagsShellContext({ state: { entitiesFilter: { getFilterData: () => ({ selected: [], excluded: [] }), setFilterData: jest.fn() } } });
    const cleanup = jest.fn();
    loadWorkspacePanelsModule.mockResolvedValue({ mountTagManagement: () => cleanup });
    callGenericPopup.mockResolvedValue(undefined);
    try {
        tags.initTags();
        expect(eventSource.on).toHaveBeenCalledWith('duplicated', expect.any(Function));
        expect(eventSource.makeFirst).toHaveBeenCalledWith('chat', expect.any(Function));
        const event = new Event('click', { bubbles: true, cancelable: true });
        doc.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
        await Promise.resolve(); await Promise.resolve();
        expect(callGenericPopup).toHaveBeenCalled();
        expect(cleanup).toHaveBeenCalledTimes(1);
    } finally { globalThis.document = original.document; globalThis.Element = original.Element; globalThis.$ = original.$; }
});

test('message tag projection updates selected direct rows and preserves unrelated attributes without jQuery', () => {
    const original = { document: globalThis.document, window: globalThis.window, $: globalThis.$ };
    function message(id, src, initial = {}) {
        const attrs = new Map(Object.entries({ mesid: String(id), ...initial }));
        return {
            matches: selector => selector.split(',').some(part => part === '.mes' || part === `.mes[mesid="${id}"]`),
            get attributes() { return [...attrs.keys()].map(name => ({ name })); },
            removeAttribute: name => attrs.delete(name), setAttribute: (name, value) => attrs.set(name, value),
            querySelector: selector => selector === '.avatar img' && src ? { getAttribute: () => src } : null,
            attrs,
        };
    }
    const first = message(1, '/thumbnail?type=avatar&file=a.png', { 'data-char-tag-stale': '', 'data-other': 'keep' });
    const second = message(2, '/thumbnail?type=avatar&file=a.png', { 'data-char-tags': 'unchanged' });
    const missing = message(3, null, { 'data-char-tag-stale': '', 'data-char-tags': 'stale' });
    const child = { matches: () => false, attributes: [] };
    globalThis.document = { getElementById: id => id === 'chat' ? { children: [first, second, missing, child] } : null };
    globalThis.window = { location: { origin: 'https://example.test' } };
    globalThis.$ = () => { throw new Error('message projection must not use jQuery'); };
    tags.loadTagsSettings({ tags: [{ id: 'a', name: 'Café, Hello_World!' }, { id: 'b', name: '!!!' }], tag_map: { 'a.png': ['a', 'b'] } });
    try {
        tags.applyCharacterTagsToMessageDivs({ mesIds: [1, 3] });
        expect(Object.fromEntries(first.attrs)).toEqual({ mesid: '1', 'data-other': 'keep', 'data-char-tags': 'Café  Hello_World!,!!!', 'data-char-tag-cafe-hello-world': '' });
        expect(Object.fromEntries(second.attrs)).toEqual({ mesid: '2', 'data-char-tags': 'unchanged' });
        expect(Object.fromEntries(missing.attrs)).toEqual({ mesid: '3' });
        tags.applyCharacterTagsToMessageDivs();
        expect(second.attrs.get('data-char-tags')).toBe('Café  Hello_World!,!!!');
        tags.loadTagsSettings({ tags: [], tag_map: {} });
        tags.applyCharacterTagsToMessageDivs({ mesIds: 2 });
        expect(Object.fromEntries(second.attrs)).toEqual({ mesid: '2' });
    } finally { globalThis.document = original.document; globalThis.window = original.window; globalThis.$ = original.$; }
});

test('ASK import displays existing, new and folder tags and removal affects the final assignment without jQuery', async () => {
    const { callGenericPopup } = await import('../public/scripts/popup.js');
    const { renderTemplateAsync } = await import('../public/scripts/templates.js');
    const original = { document: globalThis.document, $: globalThis.$ };
    class Node extends EventTarget {
        constructor() { super(); this.style = {}; this.children = []; this.attrs = {}; this.classList = { add: jest.fn(), contains: () => false }; }
        setAttribute(name, value) { this.attrs[name] = value; }
        append(node) { this.children.push(node); node.remove = () => { this.children = this.children.filter(child => child !== node); }; }
        querySelector(selector) { return this.elements?.[selector] ?? null; }
    }
    const lists = Object.fromEntries(['#import_existing_tags_list', '#import_new_tags_list', '#import_folder_tags_list', '#folder_tags_block'].map(key => [key, new Node()]));
    const host = new Node(); host.elements = lists;
    const template = { cloneNode() { const node = new Node(); node.elements = { '.tag_name': new Node(), '.tag_remove': new Node() }; return node; } };
    globalThis.document = { createElement: () => host, querySelector: selector => selector === '#tag_template .tag' ? template : null, getElementById: () => null };
    globalThis.$ = () => { throw new Error('ASK tag import must not use jQuery'); };
    const character = { avatar: 'a.png', name: 'Alice', tags: ['Existing', 'Fresh', 'ROOT', 'TAVERN'] };
    let characters = [character];
    const save = jest.fn(), refresh = jest.fn();
    registerCharacterTagsShellContext({ state: { get characters() { return characters; }, entitiesFilter: { getFilterData: () => ({ selected: ['folder'], excluded: [] }) } }, saveSettingsDebounced: save, printCharactersDebounced: refresh });

    tags.loadTagsSettings({ tags: [{ id: 'e', name: 'Existing', sort_order: 1 }, { id: 'folder', name: 'Folder', folder_type: 'OPEN', sort_order: 2 }], tag_map: {} });
    renderTemplateAsync.mockResolvedValue('<div>import</div>');
    callGenericPopup.mockImplementation(async content => {
        expect(content).toBe(host);
        expect(lists['#import_existing_tags_list'].children[0].elements['.tag_name'].textContent).toBe('Existing');
        expect(lists['#import_new_tags_list'].children[0].elements['.tag_name'].textContent).toBe('Fresh');
        expect(lists['#import_folder_tags_list'].children[0].elements['.tag_name'].textContent).toBe('Folder');
        lists['#import_new_tags_list'].children[0].elements['.tag_remove'].dispatchEvent(new Event('click'));
        expect(lists['#import_new_tags_list'].children).toHaveLength(0);
        return 1;
    });
    try {
        expect(await tags.importTags(character)).toBe(true);
        expect(tags.tag_map['a.png']).toEqual(['e', 'folder']);
        expect(tags.tags.some(tag => tag.name === 'Fresh')).toBe(false);
        expect(save).toHaveBeenCalled(); expect(refresh).toHaveBeenCalled();
        tags.loadTagsSettings({ tags: [{ id: 'e', name: 'Existing' }, { id: 'folder', name: 'Folder', folder_type: 'OPEN' }], tag_map: {} });
        callGenericPopup.mockResolvedValue(4);
        expect(await tags.importTags(character)).toBe(true);
        expect(tags.tag_map['a.png']).toEqual(['e', 'folder']);
        expect(tags.tags.some(tag => tag.name === 'Fresh')).toBe(false);
        tags.loadTagsSettings({ tags: [{ id: 'e', name: 'Existing' }, { id: 'folder', name: 'Folder', folder_type: 'OPEN' }], tag_map: {} });
        callGenericPopup.mockResolvedValue(2);
        expect(await tags.importTags(character)).toBeUndefined();
        expect(tags.tag_map['a.png']).toBeUndefined();
        callGenericPopup.mockImplementation(async () => { characters = []; return 1; });
        expect(await tags.importTags(character)).toBe(false);
        expect(tags.tag_map['a.png']).toBeUndefined();
        expect(tags.tags.some(tag => tag.name === 'Fresh')).toBe(false);
    } finally { globalThis.document = original.document; globalThis.$ = original.$; }
});


test('ASK import limits card tags to 50 and retains removals without jQuery', async () => {
    const { callGenericPopup } = await import('../public/scripts/popup.js');
    const { renderTemplateAsync } = await import('../public/scripts/templates.js');
    const original = { document: globalThis.document, $: globalThis.$ };
    class Node extends EventTarget {
        constructor() {
            super(); this.style = {}; this.children = []; this.attrs = {};
            const classes = new Set();
            this.classList = { add: (...names) => names.forEach(name => classes.add(name)), contains: name => classes.has(name) };
        }
        setAttribute(name, value) { this.attrs[name] = value; }
        getAttribute(name) { return name === 'id' ? this.id : this.attrs[name]; }
        append(node) { this.children.push(node); node.remove = () => { this.children = this.children.filter(child => child !== node); }; }
        replaceChildren() { this.children = []; }
        querySelector(selector) { return this.parts?.[selector] ?? null; }
        querySelectorAll(selector) { return selector === '.tag' ? this.children : []; }
    }
    const lists = Object.fromEntries(['#import_existing_tags_list', '#import_new_tags_list', '#import_folder_tags_list', '#folder_tags_block'].map(key => [key, new Node()]));
    const host = new Node(); host.parts = lists;
    const template = { cloneNode() { const node = new Node(); node.parts = { '.tag_name': new Node(), '.tag_remove': new Node() }; return node; } };
    globalThis.document = { createElement: () => host, querySelector: selector => selector === '#tag_template .tag' ? template : null, getElementById: () => null };
    globalThis.$ = () => { throw new Error('interactive import must not use jQuery'); };
    const existing = Array.from({ length: 51 }, (_, i) => ({ id: `t${i}`, name: `Tag ${i}`, sort_order: i }));
    const character = { avatar: 'long.png', name: 'Long', tags: existing.map(tag => tag.name) };
    registerCharacterTagsShellContext({ state: { characters: [character], entitiesFilter: { getFilterData: () => ({ selected: [], excluded: [] }) } }, saveSettingsDebounced: jest.fn(), printCharactersDebounced: jest.fn() });
    tags.loadTagsSettings({ tags: existing, tag_map: {} });
    renderTemplateAsync.mockResolvedValue('<div>import</div>');
    callGenericPopup.mockImplementation(async () => {
        const list = lists['#import_existing_tags_list'];
        expect(list.children).toHaveLength(50);
        expect(list.children.some(node => node.id === 't50')).toBe(false);
        list.children[0].parts['.tag_remove'].dispatchEvent(new Event('click'));
        expect(list.children).toHaveLength(49);
        expect(list.children.some(node => node.id === 't0')).toBe(false);
        return 1;
    });
    try {
        expect(await tags.importTags(character)).toBe(true);
        expect(tags.tag_map['long.png']).toHaveLength(49);
        expect(tags.tag_map['long.png']).not.toContain('t0');
        expect(tags.tag_map['long.png']).not.toContain('t50');
    } finally { globalThis.document = original.document; globalThis.$ = original.$; }
});

test('tag entity key lookup accepts selector, element and legacy wrapper without jQuery', () => {
    const original = { document: globalThis.document, $: globalThis.$ };
    const root = { parentElement: null, getAttribute: () => null };
    const row = { parentElement: root, getAttribute: name => name === 'data-chid' ? '0' : null };
    const nested = { parentElement: row, getAttribute: () => null };
    globalThis.document = { querySelectorAll: selector => selector === '.nested' ? [nested] : [], getElementById: () => null };
    globalThis.$ = () => { throw new Error('entity key lookup must not use jQuery'); };
    registerCharacterTagsShellContext({ state: { characters: [{ avatar: 'lookup.png' }] }, saveSettingsDebounced: jest.fn(), printCharactersDebounced: jest.fn() });
    tags.loadTagsSettings({ tags: [], tag_map: { 'lookup.png': [] } });
    try {
        expect(tags.getTagKeyForEntityElement('.nested')).toBe('lookup.png');
        expect(tags.getTagKeyForEntityElement(nested)).toBe('lookup.png');
        expect(tags.getTagKeyForEntityElement({ jquery: '3.7.1', 0: nested, length: 1 })).toBe('lookup.png');
        expect(tags.getTagKeyForEntityElement('.missing')).toBeUndefined();
    } finally { globalThis.document = original.document; globalThis.$ = original.$; }
});

test('removing an entity tag updates selector and legacy-wrapper lists without jQuery', () => {
    const original = { document: globalThis.document, $: globalThis.$ };
    const removed = [];
    const tagNodes = id => [{ getAttribute: () => id, remove: () => removed.push(id) }, { getAttribute: () => 'other', remove: () => removed.push('other') }];
    const first = { querySelectorAll: () => tagNodes('t') }, second = { querySelectorAll: () => tagNodes('t') };
    globalThis.document = { querySelectorAll: () => [first, second], getElementById: () => null };
    globalThis.$ = () => { throw new Error('tag removal must not use jQuery'); };
    const character = { avatar: 'a.png' }, tag = { id: 't', name: 'Tag' };
    registerCharacterTagsShellContext({ state: { characters: [character] }, saveSettingsDebounced: jest.fn(), printCharactersDebounced: jest.fn() });
    try {
        tags.loadTagsSettings({ tags: [tag], tag_map: { 'a.png': ['t'] } });
        expect(tags.removeTagFromEntity(tag, 'a.png', { tagListSelector: '.tags' })).toBe(true);
        expect(removed).toEqual(['t', 't']);
        tags.loadTagsSettings({ tags: [tag], tag_map: { 'a.png': ['t'] } });
        expect(tags.removeTagFromEntity(tag, 'a.png', { tagListSelector: { jquery: '3.7.1', 0: first, length: 1 } })).toBe(true);
        expect(removed).toEqual(['t', 't', 't']);
    } finally { globalThis.document = original.document; globalThis.$ = original.$; }
});

test('createTagMapFromList reads selector and legacy-wrapper lists without jQuery', () => {
    const original = { document: globalThis.document, $: globalThis.$ };
    const first = { querySelectorAll: () => [{ getAttribute: () => 'a' }, { getAttribute: () => 'b' }] };
    const second = { querySelectorAll: () => [{ getAttribute: () => 'b' }] };
    globalThis.document = { querySelectorAll: () => [first, second], getElementById: () => null };
    globalThis.$ = () => { throw new Error('reading tag list must not use jQuery'); };
    registerCharacterTagsShellContext({ state: { characters: [] }, saveSettingsDebounced: jest.fn(), printCharactersDebounced: jest.fn() });


    tags.loadTagsSettings({ tags: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], tag_map: {} });
    try {
        tags.createTagMapFromList('.tags', 'first');
        expect(tags.tag_map.first).toEqual(['a', 'b']);
        tags.createTagMapFromList({ jquery: '3.7.1', 0: second, length: 1 }, 'second');
        expect(tags.tag_map.second).toEqual(['b']);
        tags.createTagMapFromList([first, second], 'array');
        expect(tags.tag_map.array).toEqual(['a', 'b']);
    } finally { globalThis.document = original.document; globalThis.$ = original.$; }
});

test('invalid tag list selectors fail natively without invoking jQuery', () => {
    const original = { document: globalThis.document, $: globalThis.$ };
    const invalid = new SyntaxError('invalid native selector');
    globalThis.document = { querySelectorAll: () => { throw invalid; } };
    globalThis.$ = jest.fn(() => []);
    try {
        expect(() => tags.createTagMapFromList(':invalid-pseudo', 'first')).toThrow(invalid);
        expect(globalThis.$).not.toHaveBeenCalled();
    } finally { globalThis.document = original.document; globalThis.$ = original.$; }
});

test('native filter tag cycles selection and exclusion and updates the model', async () => {
    const original = { document: globalThis.document, $: globalThis.$ };
    class Node extends EventTarget {
        constructor() {
            super(); this.style = {}; this.children = []; this.attrs = {};
            const classes = new Set();
            this.classList = { add: (...items) => items.forEach(item => classes.add(item)), toggle: (item, enabled) => enabled ? classes.add(item) : classes.delete(item), contains: item => classes.has(item) };
        }
        setAttribute(key, value) { this.attrs[key] = String(value); }
        getAttribute(key) { return key === 'id' ? this.id : this.attrs[key] ?? null; }
        querySelector(selector) { return this.parts?.[selector] ?? null; }
        querySelectorAll(selector) {
            if (selector === '.tag') return this.children;
            if (selector.includes('.selected')) return this.children.filter(node => node.classList.contains('selected'));
            if (selector.includes('.excluded')) return this.children.filter(node => node.classList.contains('excluded'));
            return [];
        }
        closest() { return null; }
        append(node) { this.children.push(node); node.parentElement = this; }
    }
    const template = { cloneNode() { const node = new Node(); node.parts = { '.tag_name': new Node(), '.tag_remove': new Node() }; return node; } };
    globalThis.document = { querySelector: selector => selector === '#tag_template .tag' ? template : null };
    globalThis.$ = () => { throw new Error('filter must not use jQuery'); };
    try {
        await jest.isolateModulesAsync(async () => {
            const isolated = await import('../public/scripts/tags.js');
            const context = await import('../public/scripts/character-tags-shell-context.js');
            const helper = { getFilterData: () => ({ selected: [], excluded: [] }), setFilterData: jest.fn() };
            context.registerCharacterTagsShellContext({ state: { entitiesFilter: helper, DEFAULT_PRINT_TIMEOUT: 0 }, saveSettingsDebounced: jest.fn() });
            const tag = { id: 't', name: 'Tag' }, host = new Node();
            isolated.loadTagsSettings({ tags: [tag], tag_map: {} });
            isolated.appendTagToList(host, tag, { isFilter: true, isGeneralList: true });
            host.children[0].dispatchEvent(new Event('click'));
            expect(helper.setFilterData).toHaveBeenLastCalledWith('tag', { selected: ['t'], excluded: [] });
            host.children[0].dispatchEvent(new Event('click'));
            expect(helper.setFilterData).toHaveBeenLastCalledWith('tag', { selected: [], excluded: ['t'] });
        });
    } finally { globalThis.document = original.document; globalThis.$ = original.$; }
});

test('private legacy three-state toggler retains state transitions without an unused synthetic-click branch', () => {
    const source = fs.readFileSync(new URL('../public/scripts/tags.js', import.meta.url), 'utf8');
    const body = source.slice(source.indexOf('function toggleTagThreeState('), source.indexOf('\nfunction runTagFilters('));
    expect(body).not.toContain('simulateClick');
    const FILTER_STATES = Object.fromEntries(['SELECTED', 'EXCLUDED', 'UNDEFINED'].map(key => [key, { class: key.toLowerCase() }]));
    const toggle = vm.runInNewContext(`(${body})`, { FILTER_STATES, DEFAULT_FILTER_STATE: 'UNDEFINED', console });
    const classes = new Set(); let state;
    const element = { getAttribute() { return state; }, setAttribute(_key, value) { state = value; }, classList: { toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); } } };
    expect(toggle(element)).toBe('SELECTED'); expect([...classes]).toEqual(['selected']);
    expect(toggle(element)).toBe('EXCLUDED'); expect([...classes]).toEqual(['excluded']);
    expect(toggle(element, { stateOverride: 'UNDEFINED' })).toBe('UNDEFINED'); expect([...classes]).toEqual(['undefined']);
});
