import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createRuntimeSettingsConflictGuard } from '../public/scripts/react-runtime-provider.js';
import { createRuntimeSettingsPersistence } from '../public/scripts/runtime-settings-persistence.js';

// Component-level DOM double: real browser/dialog and real jQuery integration are
// separately owned by the coordinator's browser validation.
class Element {
    constructor(tag = 'div') {
        this.tagName = tag.toUpperCase();
        this.nodeType = 1;
        this.children = [];
        this.parentNode = null;
        this.attributes = {};
        this.style = {};
        this.listeners = {};
        this.className = '';
        this.textContent = '';
        this.innerHTML = '';
        this.classList = {
            add: (...names) => { this.className = [...new Set([...this.className.split(' ').filter(Boolean), ...names])].join(' '); },
            remove: (...names) => { this.className = this.className.split(' ').filter(name => !names.includes(name)).join(' '); },
            toggle: (name, force) => { if (force ?? !this.classList.contains(name)) this.classList.add(name); else this.classList.remove(name); },
            contains: name => this.className.split(' ').includes(name),
        };
    }
    setAttribute(name, value) { this.attributes[name] = String(value); if (name === 'id') this.id = String(value); }
    removeAttribute(name) { delete this.attributes[name]; }
    get firstElementChild() { return this.children[0] ?? null; }
    get lastElementChild() { return this.children.at(-1) ?? null; }
    append(...nodes) { for (const node of nodes) { node.remove(); node.parentNode = this; this.children.push(node); } }
    replaceChildren(...nodes) { for (const child of [...this.children]) child.remove(); this.append(...nodes); }
    prepend(...nodes) { for (const node of nodes.reverse()) { node.remove(); node.parentNode = this; this.children.unshift(node); } }
    remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; }
    contains(node) { return this === node || this.children.some(child => child.contains(node)); }
    addEventListener(type, callback) { (this.listeners[type] ??= []).push(callback); }
    dispatch(type, event = {}) {
        const e = { target: this, stopPropagation() { this.stopped = true; }, ...event };
        for (const callback of this.listeners[type] ?? []) callback(e);
        if (!e.stopped && this.parentNode) this.parentNode.dispatch(type, e);
    }
    querySelector(selector) {
        for (const child of this.children) {
            if (selector.startsWith('.') && child.classList.contains(selector.slice(1))) return child;
            const found = child.querySelector(selector);
            if (found) return found;
        }
        return null;
    }
}

const originalDocument = globalThis.document;
const originalJQuery = globalThis.jQuery;
const fakeJQuery = element => ({ 0: element, length: element ? 1 : 0, jquery: 'test' });
let notifications;
let sanitize;

beforeEach(async () => {
    jest.useFakeTimers();
    const body = new Element('body');
    globalThis.document = {
        body,
        activeElement: null,
        createElement: tag => new Element(tag),
        getElementById: id => {
            const find = element => element.id === id ? element : element.children.map(find).find(Boolean);
            return find(body) ?? null;
        },
        querySelector: selector => selector === 'body' ? body : null,
    };
    globalThis.jQuery = fakeJQuery;
    jest.resetModules();
    sanitize = jest.fn(input => {
        const fragment = new Element('fragment');
        fragment.textContent = `sanitized: ${input}`;
        return fragment;
    });
    jest.unstable_mockModule('../public/lib.js', () => ({ DOMPurify: { sanitize } }));
    notifications = (await import('../public/scripts/notifications.js')).default;
    notifications.options = { showDuration: 0, hideDuration: 0 };
});

afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
    if (originalJQuery === undefined) delete globalThis.jQuery; else globalThis.jQuery = originalJQuery;
});

describe('native notifications compatibility', () => {
    test('DOM double lastElementChild tracks empty, appended and removed children', () => {
        const parent = new Element(), first = new Element(), last = new Element();
        expect(parent.lastElementChild).toBeNull();
        parent.append(first);
        expect(parent.lastElementChild).toBe(first);
        parent.append(last);
        expect(parent.lastElementChild).toBe(last);
        last.remove();
        expect(parent.lastElementChild).toBe(first);
        first.remove();
        expect(parent.lastElementChild).toBeNull();
    });

    test('World Info cascade failure keeps references and reports through the real subscriber without jQuery', async () => {
        const t = (parts, ...values) => parts.reduce((value, part, i) => value + part + (values[i] ?? ''), '');
        const source = readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');
        const start = source.indexOf('toastr.subscribe(function (args) {');
        const end = source.indexOf('\n});', start) + '\n});'.length;
        expect(start).toBeGreaterThanOrEqual(0);
        runInNewContext(source.slice(start, end), { toastr: notifications, t });
        const world = { charLore: [{ name: 'character', extraBooks: ['A'] }] };
        jest.unstable_mockModule('../public/scripts/world-info-state.js', () => ({ world_info: world, world_names: ['A'] }));
        const { createWorldInfoBookUi } = await import('../public/scripts/world-info-book-ui.js');
        const oldFetch = globalThis.fetch;
        globalThis.fetch = jest.fn()
            .mockResolvedValueOnce({ ok: true, json: async () => ({ worldInfos: [{ name: 'A', entryCount: 1, boundCharacters: ['character'], deleteCandidateAvatars: [] }] }) })
            .mockResolvedValueOnce({ ok: false, status: 500 });
        delete globalThis.jQuery;
        const flush = jest.fn(), remove = jest.fn(), save = jest.fn();
        const ui = createWorldInfoBookUi({
            getSelectedWorldInfoEditorName: () => 'A', getRequestHeaders: () => ({}), t,
            showLocalDialog: async () => ({ action: 'delete', values: { 'world-0': true, clearReferences: true } }),
            flushDeletedWorldsFromUI: flush, deleteWorldInfo: remove, saveSettingsDebounced: save,
        });
        try {
            expect(await ui.deleteCurrentWorldInfo()).toBe(false);
            expect(world.charLore[0].extraBooks).toEqual(['A']);
            expect(flush).not.toHaveBeenCalled();
            expect(remove).not.toHaveBeenCalled();
            expect(save).not.toHaveBeenCalled();
            const toast = document.getElementById('toast-container').firstElementChild;
            expect(toast.querySelector('.toast-message').textContent).toContain('Failed to delete World Info');
            expect(toast.classList.contains('interactable')).toBe(true);
        } finally { globalThis.fetch = oldFetch; }
    });

    test('World Info batch import reports HTTP 413 and clears progress without jQuery', async () => {
        const t = (parts, ...values) => parts.reduce((value, part, i) => value + part + (values[i] ?? ''), '');
        jest.unstable_mockModule('../public/scripts/i18n.js', () => ({ t, translate: value => value }));
        const source = readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');
        const start = source.indexOf('toastr.subscribe(function (args) {');
        const end = source.indexOf('\n});', start) + '\n});'.length;
        expect(start).toBeGreaterThanOrEqual(0);
        runInNewContext(source.slice(start, end), { toastr: notifications, t });
        const { createWorldInfoImportUi } = await import('../public/scripts/world-info-import-ui.js');
        const input = {}, menu = new Element('div');
        document.querySelector = selector => selector === '#world_import_file' ? input : selector === '#world_import_menu_item' ? menu : document.body;
        const oldFetch = globalThis.fetch, OldFormData = globalThis.FormData;
        let resolveFetch, fetchStarted;
        const started = new Promise(resolve => { fetchStarted = resolve; });
        globalThis.fetch = jest.fn(() => { fetchStarted(); return new Promise(resolve => { resolveFetch = resolve; }); });
        globalThis.FormData = class { append() {} };
        delete globalThis.jQuery;
        const release = jest.fn(), update = jest.fn(), select = jest.fn();
        const ui = createWorldInfoImportUi({
            getWorldNames: () => [], getSanitizedFilename: name => name, equalsIgnoreCaseAndAccents: (a, b) => a === b,
            beginLocalDialogOperation: () => ({ signal: new AbortController().signal, release }),
            parseJsonFile: async () => ({ entries: {} }), getRequestHeaders: () => ({}),
            updateWorldInfoList: update, selectWorldInfoEditorName: select,
            eventSource: { emit: jest.fn() }, event_types: {}, t, translate: value => value, escapeHtml: value => value,
        });
        try {
            const operation = ui.importWorldInfoFiles([{ name: 'large.json', size: 1 }]);
            await started;
            const progress = document.getElementById('toast-container').firstElementChild;
            expect(input.disabled).toBe(true);
            resolveFetch({ ok: false, status: 413, statusText: 'too large' });
            expect((await operation)[0].status).toBe('failed');
            expect(progress.parentNode).toBeNull();
            expect(input.disabled).toBe(false);
            expect(release).toHaveBeenCalledTimes(1);
            expect(update).not.toHaveBeenCalled();
            expect(select).not.toHaveBeenCalled();
            const messages = document.getElementById('toast-container').children.map(toast => toast.querySelector('.toast-message').textContent);
            expect(messages.some(message => message.includes('File is too large'))).toBe(true);
            expect(messages.some(message => message.includes('1 failed'))).toBe(true);
        } finally { globalThis.fetch = oldFetch; globalThis.FormData = OldFormData; }
    });

    test('legacy notification and container return native handles without jQuery, after synchronous subscriber', () => {
        delete globalThis.jQuery;
        const calls = [];
        notifications.subscribe(event => calls.push([event.state, document.getElementById('toast-container')?.firstElementChild]));
        const toast = notifications.error('save failed', '', { timeOut: 0 });
        expect(calls).toEqual([['visible', toast]]);
        expect(notifications.getContainer()).toBe(toast.parentNode);
        notifications.clear(toast, { force: true });
        expect(toast.parentNode).toBeNull();
    });

    test.each([409, 500])('real settings save reports HTTP %i without jQuery masking the failure', async status => {
        delete globalThis.jQuery;
        const source = readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');
        const start = source.indexOf('const runtimeSettingsPersistence = createRuntimeSettingsPersistence({');
        const end = source.indexOf('\n/**', source.indexOf('export async function saveSettings(', start));
        const context = {
            createRuntimeSettingsPersistence, runtimeSettingsConflict: createRuntimeSettingsConflictGuard(),
            settingsReady: true, generationCaller: { TempResponseLength: { isCustomized: () => false } }, currentVersion: '1', settings: {},
            resolvePersistedCurrentVersion: () => '1', accountStorage: { getState: () => ({}) }, active_character: null,
            amount_gen: 1, max_context: 1, main_api: 'x', getWorldInfoSettings: () => ({}), power_user: {},
            feature_settings: {}, tags: [], tag_map: {}, oai_settings: {}, background_settings: {}, settingsDocumentRevision: 1,
            beginSettingsSaveSnapshot: () => ({}), finishSettingsSaveSnapshot: () => {}, compressRequest: async value => value,
            getRequestHeaders: () => ({}), fetch: async () => ({ ok: false, status, statusText: 'offline', json: async () => ({ settings_revision: 2 }) }),
            eventSource: { emit: async () => {} }, event_types: {}, toastr: notifications, t: strings => strings[0],
            window: { dispatchEvent: jest.fn() }, Event: class Event {}, saveSettingsDebounced: jest.fn(), console: { warn: jest.fn(), error: jest.fn() },
        };
        const save = runInNewContext(`(() => { ${source.slice(start, end).replace('export async function', 'async function')}; return saveSettings; })()`, context);
        await expect(save(0, { strict: true })).rejects.toThrow(status === 409 ? 'revision conflict' : 'offline');
        expect(document.getElementById('toast-container').firstElementChild).not.toBeNull();
    });

    test('actual World Info and Regex notification paths run through the startup subscriber without jQuery', async () => {
        const notificationModule = await import('../public/scripts/notifications.js');
        const native = notificationModule.default.native ?? notificationModule.default;
        const source = readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');
        const start = source.indexOf('toastr.subscribe(function (args) {');
        const end = source.indexOf('\n});', start) + '\n});'.length;
        expect(start).toBeGreaterThanOrEqual(0);
        const t = (parts, ...values) => parts.reduce((value, part, i) => value + part + (values[i] ?? ''), '');
        runInNewContext(source.slice(start, end), { toastr: notifications, t });

        jest.unstable_mockModule('../public/scripts/world-info-state.js', () => ({ world_names: [] }));
        jest.unstable_mockModule('../public/scripts/i18n.js', () => ({ t, translate: value => value }));
        const { createWorldInfoReferenceUi } = await import('../public/scripts/world-info-reference-ui.js');
        const { createRegexPresetController } = await import('../public/scripts/extensions/regex/regex-preset-controller.js');
        const control = { worldInfoChid: 0, style: {} };
        globalThis.document.querySelector = selector => selector === '#import_character_info' ? control : globalThis.document.body;
        delete globalThis.jQuery;
        const ui = createWorldInfoReferenceUi({ characters: [{ data: {} }], t });
        await ui.importEmbeddedWorldInfo();
        const first = globalThis.document.getElementById('toast-container').firstElementChild;
        expect(first.querySelector('.toast-message').textContent).toContain('does not contain embedded');
        expect(first.classList.contains('interactable')).toBe(true);
        expect(first.attributes.title).toBe('Tap to close');

        const regexSource = readFileSync(new URL('../public/scripts/extensions/regex/index.js', import.meta.url), 'utf8');
        const initStart = regexSource.indexOf('export async function init()');
        const binding = regexSource.match(/^const toastr = .*;$/m)?.[0];
        expect(binding).toBeDefined();
        let controller;
        const panel = new Element('section');
        const regexContext = {
            document: { getElementById: () => panel, createElement: tag => new Element(tag), addEventListener: jest.fn() },
            feature_settings: {}, migrateSettings: () => {},
            loadWorkspacePanelsModule: async () => ({ mountRegexSettings: jest.fn() }),
            regexListBridge: { refresh: jest.fn() },
            createRegexPresetController: config => { controller = createRegexPresetController(config); return controller; },
            getScriptsByType: () => [], getScriptsForTarget: () => [], captureRegexTarget: () => {},
            saveScriptsByType: () => {}, saveSettingsStrict: () => {}, refreshRegexEffects: () => {},
            notificationOwner: notifications, uuidv4: () => {}, SCRIPT_TYPES: {}, regexToolbar: {}, getToolBindingsBridge: () => ({}),
            loadRegexScripts: async () => {}, eventSource: { on: jest.fn() }, event_types: {},
            onMainApiChanged: () => {}, checkCharEmbeddedRegexScripts: () => {}, purgeEmbeddedRegexScripts: () => {},
            onPresetRenamed: () => {}, checkPresetEmbeddedRegexScripts: () => {}, purgePresetEmbeddedRegexScripts: () => {},
        };
        await runInNewContext(`(() => { ${binding} return (${regexSource.slice(initStart).replace('export ', '')}); })()`, regexContext)();
        await controller.delete();
        const second = globalThis.document.getElementById('toast-container').firstElementChild;
        expect(second.querySelector('.toast-message').textContent).toContain('Could not find the preset to delete');
        expect(second.classList.contains('interactable')).toBe(true);
        native.clear(second, { force: true });
        expect(second.parentNode).toBeNull();
    });

    test('native and legacy handles share configuration, duplicate detection and clearing', async () => {
        const native = notifications.native;
        const first = native.info('same', '', { timeOut: 0, preventDuplicates: true });
        expect(first.nodeType).toBe(1);
        expect(notifications.info('same', '', { timeOut: 0, preventDuplicates: true })).toBeUndefined();
        const legacy = notifications.warning('legacy', '', { timeOut: 0 });
        expect(legacy[0].parentNode).toBe(first.parentNode);
        expect(notifications.getContainer()[0]).toBe(native.getContainer());
        native.clear(legacy, { force: true });
        notifications.clear(first, { force: true });
        expect(legacy[0].parentNode).toBeNull();
        expect(first.parentNode).toBeNull();
        expect(globalThis.toastr).toBe(notifications);
        expect(globalThis.emberDeskNotifications).toBe(notifications);
    });

    test('real World Info batch progress and cleanup work without jQuery through the startup subscriber', async () => {
        const t = (parts, ...values) => parts.reduce((value, part, i) => value + part + (values[i] ?? ''), '');
        jest.unstable_mockModule('../public/scripts/i18n.js', () => ({ t, translate: value => value }));
        const { createWorldInfoImportUi } = await import('../public/scripts/world-info-import-ui.js');
        const source = readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');
        const start = source.indexOf('toastr.subscribe(function (args) {');
        const end = source.indexOf('\n});', start) + '\n});'.length;
        runInNewContext(source.slice(start, end), { toastr: notifications, t });
        const input = {}, menu = new Element('div');
        globalThis.document.querySelector = selector => selector === '#world_import_file' ? input : selector === '#world_import_menu_item' ? menu : globalThis.document.body;
        const oldFetch = globalThis.fetch, OldFormData = globalThis.FormData;
        let resolveFetch, fetchStarted;
        const started = new Promise(resolve => { fetchStarted = resolve; });
        globalThis.fetch = jest.fn(() => { fetchStarted(); return new Promise(resolve => { resolveFetch = resolve; }); });
        globalThis.FormData = class { append() {} };
        delete globalThis.jQuery;
        const release = jest.fn();
        const ui = createWorldInfoImportUi({
            getWorldNames: () => [], getSanitizedFilename: name => name, equalsIgnoreCaseAndAccents: (a, b) => a === b,
            beginLocalDialogOperation: () => ({ signal: new AbortController().signal, release }),
            parseJsonFile: async () => ({ entries: {} }), getRequestHeaders: () => ({}),
            updateWorldInfoList: async () => {}, selectWorldInfoEditorName: async () => {},
            eventSource: { emit: jest.fn() }, event_types: {}, t, translate: value => value, escapeHtml: value => value,
        });
        try {
            const operation = ui.importWorldInfoFiles([{ name: 'first.json', size: 1 }]);
            await started;
            const progress = globalThis.document.getElementById('toast-container').firstElementChild;
            expect(input.disabled).toBe(true);
            expect(progress.classList.contains('toast-non-interactable')).toBe(true);
            expect(progress.querySelector('.toast-message').attributes.role).toBe('status');
            expect(progress.querySelector('.toast-progress').style.width).toBe('100%');
            expect(sanitize).toHaveBeenCalled();
            resolveFetch({ ok: true, json: async () => ({ name: 'first' }) });
            expect((await operation)[0].status).toBe('success');
            expect(progress.parentNode).toBeNull();
            expect(input.disabled).toBe(false);
            expect(release).toHaveBeenCalledTimes(1);
        } finally { globalThis.fetch = oldFetch; globalThis.FormData = OldFormData; }
    });
    test('routes both HTML strings through the sanitizer, including global false', () => {
        notifications.options.escapeHtml = false;
        const message = '<img src=x onerror=alert(1)><b>message</b>';
        const title = '<svg onload=alert(2)></svg><u>title</u>';
        const toast = notifications.info(message, title, { timeOut: 0 });
        expect(sanitize).toHaveBeenCalledWith(message, { RETURN_DOM_FRAGMENT: true });
        expect(sanitize).toHaveBeenCalledWith(title, { RETURN_DOM_FRAGMENT: true });
        expect(toast[0].querySelector('.toast-message').children[0].textContent).toBe(`sanitized: ${message}`);
        expect(toast[0].querySelector('.toast-title').children[0].textContent).toBe(`sanitized: ${title}`);
    });

    test('exposes a notification API and escapes strings by default, with explicit trusted HTML', () => {
        expect(notifications).toBeDefined();
        const safe = notifications.info('<img src=x onerror=bad()>', '<b>title</b>', { timeOut: 0 });
        expect(safe[0].querySelector('.toast-message').textContent).toBe('<img src=x onerror=bad()>');
        expect(safe[0].querySelector('.toast-title').textContent).toBe('<b>title</b>');
        const trusted = notifications.success('<b>ok</b>', '', { escapeHtml: false, timeOut: 0 });
        expect(trusted[0].querySelector('.toast-message').children[0].textContent).toBe('sanitized: <b>ok</b>');
    });

    test('preserves supplied DOM and listeners, sticky progress, and force clear with focus', () => {
        const button = globalThis.document.createElement('button');
        const clicked = jest.fn();
        button.addEventListener('click', clicked);
        const toast = notifications.info(fakeJQuery(button), 'Loading', { timeOut: 0, extendedTimeOut: 0, tapToDismiss: false, progressBar: true });
        expect(toast[0].querySelector('.toast-message').children[0]).toBe(button);
        expect(toast[0].querySelector('.toast-progress')).not.toBeNull();
        button.dispatch('click');
        expect(clicked).toHaveBeenCalledTimes(1);
        jest.advanceTimersByTime(20000);
        expect(toast[0].parentNode).not.toBeNull();
        globalThis.document.activeElement = button;
        notifications.clear(toast);
        expect(toast[0].parentNode).not.toBeNull();
        notifications.clear(toast, { force: true });
        expect(toast[0].parentNode).toBeNull();
    });

    test('click and close callbacks dismiss once; close does not invoke onclick', () => {
        const onclick = jest.fn(); const onCloseClick = jest.fn(); const onHidden = jest.fn();
        const clicked = notifications.warning('retry', '', { timeOut: 0, onclick, onHidden });
        clicked[0].dispatch('click');
        expect(onclick).toHaveBeenCalledTimes(1);
        expect(onHidden).toHaveBeenCalledTimes(1);
        expect(clicked[0].parentNode).toBeNull();
        const closed = notifications.error('error', '', { timeOut: 0, closeButton: true, onclick, onCloseClick, onHidden });
        closed[0].querySelector('.toast-close-button').dispatch('click');
        expect(onCloseClick).toHaveBeenCalledTimes(1);
        expect(onclick).toHaveBeenCalledTimes(1);
        expect(onHidden).toHaveBeenCalledTimes(2);
        expect(closed[0].parentNode).toBeNull();
    });

    test('click dismisses a focused toast but preserves a focused descendant', () => {
        const self = notifications.info('focused toast', '', { timeOut: 0 });
        globalThis.document.activeElement = self[0];
        self[0].dispatch('click');
        expect(self[0].parentNode).toBeNull();

        const input = globalThis.document.createElement('input');
        const containing = notifications.info(input, '', { timeOut: 0 });
        globalThis.document.activeElement = input;
        input.dispatch('click');
        expect(containing[0].parentNode).not.toBeNull();
        notifications.clear(containing);
        expect(containing[0].parentNode).not.toBeNull();
        notifications.clear(containing, { force: true });
        expect(containing[0].parentNode).toBeNull();
    });

    test('clearing a stale or empty specified handle does not clear other notifications', () => {
        const stale = notifications.info('A', '', { timeOut: 0 });
        notifications.clear(stale);
        const active = notifications.info('B', '', { timeOut: 0 });
        notifications.clear(stale);
        expect(active[0].parentNode).not.toBeNull();
        notifications.clear(fakeJQuery(null));
        expect(active[0].parentNode).not.toBeNull();
        notifications.clear(undefined);
        expect(active[0].parentNode).toBeNull();
    });

    test('publishes visibility with options and reuses a container moved inside a dialog', () => {
        const subscriber = jest.fn();
        notifications.subscribe(subscriber);
        const dialog = globalThis.document.createElement('dialog');
        globalThis.document.body.append(dialog);
        const container = globalThis.document.createElement('div');
        container.setAttribute('id', 'toast-container');
        dialog.append(container);
        const toast = notifications.info('hello', '', { timeOut: 10 });
        expect(toast[0].parentNode).toBe(container);
        expect(notifications.getContainer(undefined, false)[0]).toBe(container);
        expect(subscriber.mock.calls[0][0]).toMatchObject({ state: 'visible', options: { timeOut: 10 } });
        jest.advanceTimersByTime(10);
        expect(subscriber.mock.calls[1][0].state).toBe('hidden');
    });

    test('prevents consecutive duplicates and clear(undefined) clears all unfocused toasts', () => {
        const first = notifications.info('same', '', { timeOut: 0, preventDuplicates: true });
        expect(notifications.info('same', '', { timeOut: 0, preventDuplicates: true })).toBeUndefined();
        const other = notifications.info('other', '', { timeOut: 0 });
        notifications.clear(undefined);
        expect(first[0].parentNode).toBeNull();
        expect(other[0].parentNode).toBeNull();
    });

    test('hover pauses a timeout and the extended timeout starts on leave', () => {
        const hidden = jest.fn();
        const toast = notifications.info('timed', '', { timeOut: 100, extendedTimeOut: 80, progressBar: true, onHidden: hidden });
        jest.advanceTimersByTime(50);
        expect(Number.parseFloat(toast[0].querySelector('.toast-progress').style.width)).toBeLessThanOrEqual(50);
        toast[0].dispatch('mouseenter');
        jest.advanceTimersByTime(1000);
        expect(toast[0].parentNode).not.toBeNull();
        toast[0].dispatch('mouseleave');
        jest.advanceTimersByTime(79);
        expect(toast[0].parentNode).not.toBeNull();
        jest.advanceTimersByTime(1);
        expect(toast[0].parentNode).toBeNull();
        expect(hidden).toHaveBeenCalledTimes(1);
    });

    test('supports global options, per-toast overrides, and both insertion orders', () => {
        notifications.options = { newestOnTop: false, timeOut: 0, positionClass: 'toast-top-center', showDuration: 0, hideDuration: 0 };
        const first = notifications.success('first');
        const second = notifications.error('second');
        const newest = notifications.warning('newest', '', { newestOnTop: true });
        const container = notifications.getContainer(undefined, false)[0];
        expect(container.className).toBe('toast-top-center');
        expect(container.children).toEqual([newest[0], first[0], second[0]]);
        expect(first[0].attributes['aria-live']).toBe('polite');
        expect(second[0].attributes['aria-live']).toBe('assertive');
    });

    test('fades with configured durations and publishes lifecycle after animation completes', () => {
        const lifecycle = [];
        notifications.subscribe(event => lifecycle.push(event.state));
        const toast = notifications.info('animated', '', {
            timeOut: 0, showDuration: 250, hideDuration: 180, showEasing: 'linear', hideEasing: 'linear',
            onShown: () => lifecycle.push('shown'), onHidden: () => lifecycle.push('onHidden'),
        });
        expect(lifecycle).toEqual(['visible']);
        expect(toast[0].style.transition).toContain('250ms linear');
        jest.advanceTimersByTime(249);
        expect(lifecycle).toEqual(['visible']);
        jest.advanceTimersByTime(1);
        expect(lifecycle).toEqual(['visible', 'shown']);
        toast[0].dispatch('click');
        expect(toast[0].parentNode).not.toBeNull();
        expect(toast[0].style.transition).toContain('180ms linear');
        jest.advanceTimersByTime(179);
        expect(lifecycle).toEqual(['visible', 'shown']);
        jest.advanceTimersByTime(1);
        expect(toast[0].parentNode).toBeNull();
        expect(lifecycle).toEqual(['visible', 'shown', 'onHidden', 'hidden']);
    });

    test('queues dismissal during fade-in, respects close overrides and clears without hidden callback', () => {
        const lifecycle = [];
        const toast = notifications.info('animated', '', {
            timeOut: 0, closeButton: true, showDuration: 100, hideDuration: 200, closeDuration: 50,
            onShown: () => lifecycle.push('shown'), onHidden: () => lifecycle.push('hidden'),
        });
        toast[0].querySelector('.toast-close-button').dispatch('click');
        jest.advanceTimersByTime(99);
        expect(lifecycle).toEqual([]);
        jest.advanceTimersByTime(1);
        expect(lifecycle).toEqual(['shown']);
        jest.advanceTimersByTime(49);
        expect(toast[0].parentNode).not.toBeNull();
        jest.advanceTimersByTime(1);
        expect(lifecycle).toEqual(['shown', 'hidden']);
        expect(toast[0].parentNode).toBeNull();

        const cleared = notifications.info('clear', '', { timeOut: 0, hideDuration: 80, onHidden: () => lifecycle.push('unexpected') });
        notifications.clear(cleared);
        expect(cleared[0].parentNode).not.toBeNull();
        jest.advanceTimersByTime(80);
        expect(cleared[0].parentNode).toBeNull();
        expect(lifecycle).toEqual(['shown', 'hidden']);
    });

    test('timeout waits for fade-in before fading out; remove cancels pending callbacks', () => {
        const events = [];
        const timed = notifications.info('timed', '', {
            timeOut: 30, showDuration: 100, hideDuration: 80,
            onShown: () => events.push('shown'), onHidden: () => events.push('hidden'),
        });
        jest.advanceTimersByTime(100);
        expect(events).toEqual(['shown']);
        expect(timed[0].parentNode).not.toBeNull();
        jest.advanceTimersByTime(80);
        expect(events).toEqual(['shown', 'hidden']);
        expect(timed[0].parentNode).toBeNull();

        const removed = notifications.info('removed', '', {
            timeOut: 0, showDuration: 100, onShown: () => events.push('unexpected'),
        });
        notifications.remove(removed);
        jest.advanceTimersByTime(100);
        expect(removed[0].parentNode).toBeNull();
        expect(events).toEqual(['shown', 'hidden']);
    });
});
