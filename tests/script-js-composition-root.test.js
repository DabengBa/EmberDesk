import { afterEach, describe, expect, jest, test } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import {
    FIRST_PARTY_SCRIPT_JS_IMPORT_CONTRACT,
    FIRST_PARTY_SCRIPT_JS_IMPORT_ALLOWLIST,
    collectFirstPartyScriptJsImports,
    collectFirstPartyScriptJsImporters,
    collectForbiddenNameImporters,
} from './helpers/script-js-reverse-import-contract.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function withScriptContractFixture(files, callback) {
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-script-contract-'));
    const scriptsRoot = path.join(fixtureRoot, 'public/scripts');
    fs.mkdirSync(scriptsRoot, { recursive: true });

    try {
        for (const [relativePath, source] of Object.entries(files)) {
            const absolutePath = path.join(scriptsRoot, relativePath);
            fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
            fs.writeFileSync(absolutePath, source);
        }
        return callback(fixtureRoot);
    } finally {
        fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }
}

async function importRequestContextModule() {
    return import(`../public/scripts/request-context.js?requestContext=${Date.now()}-${Math.random()}`);
}

async function importPublicApiModule() {
    return import(`../public/scripts/public-api.js?publicApi=${Date.now()}-${Math.random()}`);
}

const originalGlobals = {
    SillyTavern: globalThis.SillyTavern,
    $: globalThis.$,
    fetch: globalThis.fetch,
    console: globalThis.console,
};

afterEach(() => {
    globalThis.SillyTavern = originalGlobals.SillyTavern;
    globalThis.$ = originalGlobals.$;
    globalThis.fetch = originalGlobals.fetch;
    globalThis.console = originalGlobals.console;
});

describe('script.js composition-root reverse-import contract', () => {
    test('first-party public/scripts modules cannot add new script.js reverse imports', () => {
        const actual = collectFirstPartyScriptJsImports();
        const allowlist = [...FIRST_PARTY_SCRIPT_JS_IMPORT_CONTRACT]
            .map(record => ({
                file: record.file,
                kind: record.kind,
                specifier: record.specifier,
                names: [...record.names].sort(),
            }))
            .sort((left, right) => left.file.localeCompare(right.file) || left.kind.localeCompare(right.kind) || left.specifier.localeCompare(right.specifier));

        expect(actual).toEqual(allowlist);
        expect(collectFirstPartyScriptJsImporters()).toEqual([...FIRST_PARTY_SCRIPT_JS_IMPORT_ALLOWLIST].sort());
    });

    test('no first-party module may import eventSource or event_types from script.js', () => {
        const hits = collectForbiddenNameImporters(['eventSource', 'event_types']);
        expect(hits).toEqual([]);
    });

    test('no first-party module may import getRequestHeaders from script.js', () => {
        const hits = collectForbiddenNameImporters(['getRequestHeaders']);
        expect(hits).toEqual([]);
    });

    test('detects side-effect, namespace, re-export, query, and dynamic reverse imports in contract fixtures', () => {
        withScriptContractFixture({
            'side-effect.js': 'import \'../script.js\';\n',
            'namespace.js': 'import * as shell from \'../script.js\';\nshell.eventSource.emit(\'event\');\n',
            'dynamic-namespace.js': 'const shell = await import(\'../script.js\');\nshell.event_types.APP_READY;\n',
            'dynamic-named.js': 'const { getRequestHeaders } = await import(\'../script.js\');\n',
            're-export.js': 'export { getRequestHeaders } from \'../script.js?cache=1\';\n',
            'export-all.js': 'export * from \'../script.js\';\n',
            'comment-only.js': '/** @type {import(\'../script.js\').eventSource} */\n',
        }, fixtureRoot => {
            expect(collectFirstPartyScriptJsImports(fixtureRoot)).toEqual([
                { file: 'dynamic-named.js', kind: 'dynamic', names: ['getRequestHeaders'], specifier: '../script.js' },
                { file: 'dynamic-namespace.js', kind: 'dynamic', names: ['<dynamic>'], specifier: '../script.js' },
                { file: 'export-all.js', kind: 'export', names: ['*'], specifier: '../script.js' },
                { file: 'namespace.js', kind: 'import', names: ['*'], specifier: '../script.js' },
                { file: 're-export.js', kind: 'export', names: ['getRequestHeaders'], specifier: '../script.js?cache=1' },
                { file: 'side-effect.js', kind: 'import', names: ['<side-effect>'], specifier: '../script.js' },
            ]);
            expect(collectForbiddenNameImporters(['eventSource', 'event_types', 'getRequestHeaders'], fixtureRoot)).toEqual([
                { file: 'dynamic-named.js', names: ['getRequestHeaders'] },
                { file: 'dynamic-namespace.js', names: ['event_types'] },
                { file: 'export-all.js', names: ['eventSource', 'event_types', 'getRequestHeaders'] },
                { file: 'namespace.js', names: ['eventSource'] },
                { file: 're-export.js', names: ['getRequestHeaders'] },
            ]);
        });
    });
});

describe('request context runtime contract', () => {
    test('preserves the pre-token CSRF header shape and supports omitContentType', async () => {
        const module = await importRequestContextModule();

        expect(module.getRequestHeaders()).toEqual({
            'Content-Type': 'application/json',
            'X-CSRF-Token': undefined,
        });
        expect(module.getRequestHeaders({ omitContentType: true })).toEqual({
            'X-CSRF-Token': undefined,
        });
    });

    test('loads the CSRF token into subsequent request headers', async () => {
        const module = await importRequestContextModule();
        globalThis.fetch = jest.fn(async () => ({
            json: async () => ({ token: 'csrf-test-token' }),
        }));

        await expect(module.loadCsrfToken()).resolves.toBeUndefined();
        expect(module.getRequestHeaders()).toEqual({
            'Content-Type': 'application/json',
            'X-CSRF-Token': 'csrf-test-token',
        });
    });

    test('propagates CSRF fetch errors to the bootstrap owner', async () => {
        const module = await importRequestContextModule();
        globalThis.fetch = jest.fn(async () => {
            throw new Error('csrf unavailable');
        });

        await expect(module.loadCsrfToken()).rejects.toThrow('csrf unavailable');
    });

    test('provides the current token for multipart requests without setting a content type', async () => {
        const module = await importRequestContextModule();
        globalThis.fetch = jest.fn(async () => ({ json: async () => ({ token: 'loaded-token' }) }));
        await module.loadCsrfToken();
        expect(module.getRequestHeaders({ omitContentType: true })).toEqual({ 'X-CSRF-Token': 'loaded-token' });
    });
});

describe('standalone mode runtime contract', () => {
    test.each([true, false])('preserves body classes when standalone is %s', standalone => {
        const source = read('public/script.js');
        const start = source.indexOf('function initStandaloneMode() {');
        const end = source.indexOf('\nexport function cancelStatusCheck', start);
        expect(start).toBeGreaterThanOrEqual(0);
        expect(end).toBeGreaterThan(start);

        const classes = new Set(['existing']);
        const body = { classList: { add: value => classes.add(value) } };
        const matchMedia = jest.fn(() => ({ matches: standalone }));
        const jquery = jest.fn(() => ({ addClass: value => body.classList.add(value) }));
        vm.runInNewContext(`${source.slice(start, end)}\ninitStandaloneMode();`, {
            window: { matchMedia }, document: { body }, $: jquery,
        });

        expect(matchMedia).toHaveBeenCalledWith('(display-mode: standalone)');
        expect([...classes]).toEqual(standalone ? ['existing', 'PWA'] : ['existing']);
    });
});

describe('native-ready entry DOM contracts', () => {

    function classList(initial) {
        const values = new Set(initial);
        return {
            values,
            toggle(name, force) { if (force) values.add(name); else values.delete(name); },
            remove(name) { values.delete(name); },
        };
    }

    function runtime(elements, extra = {}) {
        const document = { getElementById: id => elements[id] ?? null };
        const $ = selector => {
            const element = elements[selector.slice(1)];
            return {
                toggleClass(name, force) { element?.classList.toggle(name, force); return this; },
                removeClass(name) { element?.classList.remove(name); return this; },
                css(property, value) { if (element) element.style[property] = value; return this; },
                text(value) { if (element) element.textContent = value; return this; },
            };
        };
        return { document, $, ...extra };
    }

    test.each(['cover', 'contain', 'stretch', 'center', 'classic'])('background fitting %s preserves unrelated classes', fitting => {
        const source = read('public/script.js');
        const start = source.indexOf('function setFittingClass(fitting) {');
        const end = source.indexOf('\nexport function applyActiveBackground()', start);
        expect(start).toBeGreaterThanOrEqual(0);
        expect(end).toBeGreaterThan(start);
        const background = { classList: classList(['existing', 'cover', 'stretch']) };
        const context = runtime({ bg1: background }, { fitting });
        vm.runInNewContext(`${source.slice(start, end)}\nsetFittingClass(fitting);`, context);
        expect([...background.classList.values].sort()).toEqual(['existing', ...(['cover', 'contain', 'stretch', 'center'].includes(fitting) ? [fitting] : [])].sort());
        expect(() => vm.runInNewContext(`${source.slice(start, end)}\nsetFittingClass(fitting);`, runtime({}, { fitting }))).not.toThrow();
    });

    test.each(['confirm', 'cancel'])('dialogue hide %s retains its class and display contract', kind => {
        const source = read('public/script.js');
        const start = source.indexOf('hide: kind => {', source.indexOf('async function mountDialoguePopupControls()'));
        const end = source.indexOf('schedule: callback =>', start);
        expect(start).toBeGreaterThanOrEqual(0);
        expect(end).toBeGreaterThan(start);
        const shadow = { style: { display: 'block' } };
        const popup = { classList: classList(['existing', 'large_dialogue_popup', 'wide_dialogue_popup', 'wider_dialogue_popup']) };
        const expression = `({${source.slice(start, end)}}).hide(kind)`;
        vm.runInNewContext(expression, runtime({ shadow_popup: shadow, dialogue_popup: popup }, { kind }));
        expect(shadow.style.display).toBe('none');
        expect([...popup.classList.values].sort()).toEqual(['existing', 'wider_dialogue_popup', ...(kind === 'cancel' ? ['wide_dialogue_popup'] : [])].sort());
        expect(() => vm.runInNewContext(expression, runtime({}, { kind }))).not.toThrow();
    });

    test.each(['no_connection', 'connected'])('connection hint updates for %s', onlineStatus => {
        const source = read('public/script.js');
        const start = source.indexOf('export function displayOnlineStatus() {');
        const end = source.indexOf('\n/**\n * Sets the duration of JS animations.', start);
        expect(start).toBeGreaterThanOrEqual(0);
        expect(end).toBeGreaterThan(start);
        const hint = { textContent: 'old' };
        const expression = `${source.slice(start, end).replace('export function', 'function')}\ndisplayOnlineStatus();`;
        const context = runtime({ send_textarea_hint: hint }, { online_status: onlineStatus, t: strings => strings[0] });
        vm.runInNewContext(expression, context);
        expect(hint.textContent).toBe(onlineStatus === 'no_connection' ? 'Send requires an API connection.' : '');
        expect(() => vm.runInNewContext(expression, runtime({}, { online_status: onlineStatus, t: strings => strings[0] }))).not.toThrow();
    });
});

describe('public browser API runtime contract', () => {
    test('does not install the public API until explicitly called', async () => {
        const module = await importPublicApiModule();

        expect(globalThis.SillyTavern).toBeUndefined();

        const libs = { jquery: {} };
        const getContext = jest.fn();
        module.installPublicBrowserApi({ libs, getContext });

        expect(globalThis.SillyTavern).toEqual({ libs, getContext });
    });
});

describe('workspace bootstrap contract', () => {
    test('uses bootstrapWorkspace as the startup entry and keeps the old name out', () => {
        const source = read('public/script.js');

        expect(source).toContain('async function bootstrapWorkspace()');
        expect(source).toContain("document.addEventListener('DOMContentLoaded', bindLegacyShellHandlers, { once: true })");
        expect(read('public/scripts/dom-handlers.js')).toContain('await bootstrapWorkspace();');
        expect(source).toContain('export { getRequestHeaders } from \'./scripts/request-context.js\';');
        expect(source).toContain('installPublicBrowserApi({ libs, getContext });');
        expect(source).not.toContain('firstLoadInit');
    });
});
