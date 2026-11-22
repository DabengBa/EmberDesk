import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

jest.unstable_mockModule('../public/scripts/notifications.js', () => ({ default: {} }));
jest.unstable_mockModule('../public/scripts/events.js', () => ({ eventSource: {}, event_types: {} }));
jest.unstable_mockModule('../public/scripts/character-authoring.js', () => ({ buildCharacterAuthoringFormData: jest.fn(), getCharacterAuthoringWriteUrl: jest.fn() }));
jest.unstable_mockModule('../public/scripts/character-list-state.js', () => ({ getCharacterDeleteCandidates: jest.fn(), shouldRefreshCharacterAfterEdit: jest.fn() }));
jest.unstable_mockModule('../public/scripts/request-context.js', () => ({ getRequestHeaders: jest.fn() }));
jest.unstable_mockModule('../public/scripts/workspace-panels-react-bridge.js', () => ({ loadWorkspacePanelsModule: jest.fn() }));
jest.unstable_mockModule('../public/scripts/utils.js', () => ({ escapeHtml: value => value, waitUntilCondition: jest.fn() }));
jest.unstable_mockModule('../public/scripts/world-cascade-dialog.js', () => ({ buildCascadeSectionHtml: jest.fn(), showDeleteConfirmWithCascade: jest.fn() }));
const lifecycle = await import('../public/scripts/character-lifecycle-service.js');

test('real create-mode hide and selection visibility preserve inline and stylesheet display across repeated switches', () => {
    const option = { nodeName: 'OPTION', style: { display: '' }, cssHidden: true, isConnected: true };
    const action2 = { nodeName: 'OPTION', style: { display: 'grid' }, isConnected: true };
    const duplicate = { nodeName: 'BUTTON', style: { display: 'flex' }, isConnected: true };
    const settings = { nodeName: 'OPTION', style: { display: '' }, isConnected: true };
    const chat = { nodeName: 'BUTTON', style: { display: '' }, isConnected: true };
    const matches = { '#dupe_button': [duplicate], '.character-detail-edit-action': [option, action2], '#set_chat_character_settings': [settings], '.form_create_bottom_buttons_block .chat_lorebook_button': [chat] };
    const body = { appendChild: node => { node.parentNode = body; return node; }, removeChild: jest.fn() };
    const doc = { body, createElement: tag => ({ nodeName: tag, style: {} }), defaultView: { getComputedStyle: el => ({ display: el.style.display || (el.cssHidden ? 'none' : el.nodeName === 'OPTION' ? 'block' : 'inline-block') }) } };
    for (const el of [option, action2, duplicate, settings, chat]) el.ownerDocument = doc;
    doc.querySelectorAll = selector => matches[selector] ?? [];
    doc.getElementById = () => null;
    globalThis.document = doc;
    const source = readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');
    const start = source.indexOf('function select_rm_create('), end = source.indexOf('function select_rm_characters(', start);
    expect(start).toBeGreaterThan(-1); expect(end).toBeGreaterThan(start);
    const chain = new Proxy({}, { get: () => () => chain });
    const $ = selector => { if (selector in matches) throw new Error('create visibility must not use jQuery'); return chain; };
    const context = { document: doc, $, selected_button: '', create_save: {}, default_avatar: '', formatCreatorNotes: () => '', setWorldInfoButtonClass: jest.fn(), updateFavButtonState: jest.fn(), checkEmbeddedWorld: jest.fn(), setCharacterSelectionVisibility: lifecycle.setCharacterSelectionVisibility };
    const create = runInNewContext(`(${source.slice(start, end).replace(/\/\*\*[\s\S]*?\*\/\s*$/, '')})`, context);
    create({ switchMenu: false });
    expect([option, action2, duplicate, settings, chat].map(el => el.style.display)).toEqual(['none', 'none', 'none', 'none', 'none']);
    create({ switchMenu: false }); // A repeated hide must not overwrite the saved inline values.
    for (const selector of Object.keys(matches)) lifecycle.setCharacterSelectionVisibility(selector, true);
    expect([option, action2, duplicate, settings, chat].map(el => el.style.display)).toEqual(['block', 'grid', 'flex', '', '']);
    create({ switchMenu: false });
    for (const selector of Object.keys(matches)) lifecycle.setCharacterSelectionVisibility(selector, true);
    expect([option, action2, duplicate, settings, chat].map(el => el.style.display)).toEqual(['block', 'grid', 'flex', '', '']);
    expect(() => lifecycle.setCharacterSelectionVisibility('.missing', true)).not.toThrow();
});

test('visibility handles detached controls, already hidden controls and a hidden default without emitting events', () => {
    const detached = { nodeName: 'CUSTOM-A', style: { display: 'none' }, isConnected: false, dispatchEvent: jest.fn() };
    const hiddenDefault = { nodeName: 'CUSTOM-B', style: { display: 'none' }, isConnected: true, dispatchEvent: jest.fn() };
    const body = { appendChild: node => node, removeChild: jest.fn() };
    const doc = { body, createElement: name => ({ nodeName: name, style: {} }), defaultView: { getComputedStyle: () => ({ display: 'none' }) }, querySelectorAll: () => [detached, hiddenDefault] };
    detached.ownerDocument = doc; hiddenDefault.ownerDocument = doc;
    globalThis.document = doc;
    lifecycle.setCharacterSelectionVisibility('.controls', false);
    lifecycle.setCharacterSelectionVisibility('.controls', true);
    expect(detached.style.display).toBe('');
    expect(hiddenDefault.style.display).toBe('block');
    expect(detached.dispatchEvent).not.toHaveBeenCalled();
    expect(hiddenDefault.dispatchEvent).not.toHaveBeenCalled();
});

test('search APP_READY and clicks use the real paired display helper for the legacy form', () => {
    const form = { nodeName: 'DIV', style: { display: 'flex' }, isConnected: true,
        get offsetWidth() { return this.style.display === 'none' ? 0 : 100; }, offsetHeight: 0, getClientRects: () => [] };
    const button = new EventTarget(), classes = new Set();
    button.classList = { toggle: (name, on) => on ? classes.add(name) : classes.delete(name) };
    const input = Object.assign(new EventTarget(), { focus: jest.fn() });
    const body = { appendChild: el => el, removeChild: jest.fn() };
    const doc = { body, createElement: nodeName => ({ nodeName, style: {} }), defaultView: { getComputedStyle: el => ({ display: el.style.display || 'flex' }) },
        querySelectorAll: selector => selector === '#form_character_search_form' ? [form] : [],
        getElementById: id => ({ form_character_search_form: form, rm_button_search: button, character_search_bar: input })[id] ?? null };
    form.ownerDocument = doc; globalThis.document = doc;
    const source = readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');
    const start = source.indexOf('function initCharacterSearch()'), end = source.indexOf('async function measureCharacterSearchForPerf(', start);
    let ready; const saved = new Map();
    const context = { document: doc, debounce: fn => fn, entitiesFilter: {}, FILTER_TYPES: {},
        setCharacterSelectionVisibility: lifecycle.setCharacterSelectionVisibility,
        eventSource: { on: (_, callback) => { ready = callback; } }, event_types: { APP_READY: 'ready' },
        accountStorage: { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) },
        $: () => { throw new Error('legacy search must not use jQuery'); } };
    runInNewContext(`(${source.slice(start, end)})`, context)();
    ready(); expect(form.style.display).toBe('none'); expect(classes.has('active')).toBe(false);
    button.dispatchEvent(new Event('click'));
    expect(form.style.display).toBe('flex'); expect(saved.get('characterSearchFormVisible')).toBe('true'); expect(input.focus).toHaveBeenCalledTimes(1);
    button.dispatchEvent(new Event('click')); expect(form.style.display).toBe('none'); expect(saved.get('characterSearchFormVisible')).toBe('false');
});
