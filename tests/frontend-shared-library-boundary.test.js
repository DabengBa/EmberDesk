/* global globalThis, window */
import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

jest.setTimeout(120000);

const expectedExportNames = [
    'lodash',
    'Fuse',
    'DOMPurify',
    'hljs',
    'localforage',
    'Handlebars',
    'css',
    'Bowser',
    'DiffMatchPatch',
    'Readability',
    'isProbablyReaderable',
    'SVGInject',
    'showdown',
    'moment',
    'seedrandom',
    'Popper',
    'droll',
    'morphdom',
    'slideToggle',
    'chalk',
    'yaml',
    'chevrotain',
    'gzipSync',
    'gzip',
    'sha256',
];

const legacyGlobalNames = [
    '_',
    'Fuse',
    'DOMPurify',
    'hljs',
    'localforage',
    'Handlebars',
    'diff_match_patch',
    'SVGInject',
    'showdown',
    'moment',
    'Popper',
    'droll',
];

async function importFreshLib() {
    return import(`../public/lib.js?cacheBust=${Date.now()}-${Math.random()}`);
}

describe('frontend shared library boundary', () => {
    const originalDataRoot = globalThis.DATA_ROOT;
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;
    const originalSha256NoNodeJs = globalThis.JS_SHA256_NO_NODE_JS;

    beforeEach(() => {
        const documentStub = {
            addEventListener: () => {},
            createElement: () => ({
                setAttribute: () => {},
                addEventListener: () => {},
                removeEventListener: () => {},
                appendChild: () => {},
                style: {},
            }),
            documentElement: {
                style: {},
            },
        };
        const windowStub = Object.assign(Object.create(globalThis), {
            document: documentStub,
            JS_SHA256_NO_NODE_JS: true,
        });
        windowStub.window = windowStub;
        windowStub.self = windowStub;
        globalThis.window = windowStub;
        globalThis.document = documentStub;
        globalThis.JS_SHA256_NO_NODE_JS = true;
    });

    afterEach(() => {
        if (originalWindow === undefined) {
            delete globalThis.window;
        } else {
            globalThis.window = originalWindow;
        }
        if (originalDocument === undefined) {
            delete globalThis.document;
        } else {
            globalThis.document = originalDocument;
        }
        if (originalDataRoot === undefined) {
            delete globalThis.DATA_ROOT;
        } else {
            globalThis.DATA_ROOT = originalDataRoot;
        }
        if (originalSha256NoNodeJs === undefined) {
            delete globalThis.JS_SHA256_NO_NODE_JS;
        } else {
            globalThis.JS_SHA256_NO_NODE_JS = originalSha256NoNodeJs;
        }
    });

    test('exports the documented default keys and named module values', async () => {
        const lib = await importFreshLib();

        expect(Object.keys(lib.default).sort()).toEqual(expectedExportNames.toSorted());
        for (const exportName of expectedExportNames) {
            expect(lib).toHaveProperty(exportName);
            expect(lib.default[exportName]).toBe(lib[exportName]);
        }
        expect(lib.slideToggle).toEqual(expect.any(Function));
    });

    test('installs documented legacy globals without clobbering existing values', async () => {
        const lib = await importFreshLib();
        const sentinel = { providedByExtension: true };
        window.DOMPurify = sentinel;

        lib.initLibraryShims();
        lib.initLibraryShims();

        for (const globalName of legacyGlobalNames) {
            expect(window).toHaveProperty(globalName);
        }
        expect(window.DOMPurify).toBe(sentinel);
    });

    test('vite output remains importable as a module', async () => {
        const viteOutputFile = path.resolve(process.cwd(), '..', 'dist/lib/lib.js');

        // Vite 构建应该已经完成（由 CI 或手动运行 pnpm run build:lib）
        expect(fs.existsSync(viteOutputFile)).toBe(true);

        const builtLib = await import(`${pathToFileURL(viteOutputFile).href}?cacheBust=${Date.now()}`);
        expect(builtLib).toHaveProperty('initLibraryShims');
        expect(Object.keys(builtLib.default).sort()).toEqual(expectedExportNames.toSorted());
    });

});
