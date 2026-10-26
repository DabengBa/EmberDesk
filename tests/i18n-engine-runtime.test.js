import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const localesDir = path.join(repoRoot, 'public', 'locales');

// public/scripts/i18n.js pulls in the whole legacy shell through power-user.js,
// which needs a browser. Only that import is stubbed; the locale engine, its
// data helpers and the shared ui-locale module all run for real.
await jest.unstable_mockModule('../public/scripts/power-user.js', () => ({
    registerDebugFunction: () => {},
}));

const browserGlobals = ['localStorage', 'fetch', 'document', 'Document', 'DOMParser', 'CustomEvent', 'MutationObserver', '$', 'toastr', 'location'];

function installBrowserStubs({ savedLanguage = null, localeDataAvailable = true } = {}) {
    const storage = new Map();
    if (savedLanguage !== null) {
        storage.set('language', savedLanguage);
    }
    const dispatched = [];

    globalThis.localStorage = {
        getItem: key => (storage.has(key) ? storage.get(key) : null),
        setItem: (key, value) => storage.set(key, String(value)),
        removeItem: key => storage.delete(key),
    };
    globalThis.fetch = async (url) => {
        const file = path.join(localesDir, path.basename(String(url)));
        if (!localeDataAvailable || !fs.existsSync(file)) {
            return { ok: false, json: async () => ({}) };
        }
        return { ok: true, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) };
    };
    globalThis.CustomEvent = class CustomEvent {
        constructor(type) {
            this.type = type;
        }
    };
    globalThis.MutationObserver = class MutationObserver {
        observe() {}
    };
    globalThis.Document = class Document {};
    globalThis.document = Object.assign(new globalThis.Document(), {
        documentElement: { lang: '' },
        dispatchEvent: event => dispatched.push(event.type),
    });
    // Every document has no data-i18n elements in these tests, so the DOM walk
    // is empty; applyLocale still has to reach its notification step.
    globalThis.$ = () => ({ find: () => ({ each: () => {} }), on: () => {}, get: () => ({}) });
    globalThis.toastr = { success: () => {}, info: () => {}, warning: () => {} };
    globalThis.location = { reload: jest.fn() };

    return { storage, dispatched };
}

/**
 * Loads the real locale engine with stubbed browser globals.
 * @returns {Promise<{ engine: any, storage: Map<string,string>, dispatched: string[] }>}
 */
async function loadEngine(options = {}) {
    const stubs = installBrowserStubs(options);
    jest.resetModules();
    const engine = await import('../public/scripts/i18n.js');
    await engine.initLocales();
    return { engine, ...stubs };
}

describe('i18n engine runtime', () => {
    beforeEach(() => {
        browserGlobals.forEach(key => delete globalThis[key]);
    });

    afterEach(() => {
        browserGlobals.forEach(key => delete globalThis[key]);
        jest.resetModules();
    });

    test('new installs without a saved language load zh-cn', async () => {
        const { engine } = await loadEngine();

        expect(engine.getCurrentLocale()).toBe('zh-cn');
        expect(engine.translate('Save settings')).toBe('保存设置');
        expect(engine.translate('Sign in')).toBe('登录');
    });

    test('a saved english selection loads the english surface', async () => {
        const { engine } = await loadEngine({ savedLanguage: 'en' });

        expect(engine.getCurrentLocale()).toBe('en');
        // English is the source text; no translation table is needed.
        expect(engine.translate('Save settings')).toBe('Save settings');
        expect(engine.translate('Sign in')).toBe('Sign in');
    });

    test('retired or unknown saved languages resolve to zh-cn', async () => {
        for (const saved of ['de-de', 'zh-tw', 'not-a-locale', '']) {
            const { engine } = await loadEngine({ savedLanguage: saved });
            expect({ saved, locale: engine.getCurrentLocale() }).toEqual({ saved, locale: 'zh-cn' });
            browserGlobals.forEach(key => delete globalThis[key]);
        }
    });

    test('dynamic strings translate through the live locale context', async () => {
        const { engine } = await loadEngine();

        // toasts, validation messages and computed labels share the engine with
        // static data-i18n markup.
        expect(engine.translate('Clear filters')).toBe('清除筛选');
        expect(engine.translate('Search chats')).toBe('搜索聊天');
        expect(engine.t`Connected. The endpoint returned ${3} models.`).toBe('连接成功，接口返回 3 个模型。');
        expect(engine.t`Account locked. Try again in ${30} seconds.`).toBe('账号已锁定，请在 30 秒后重试。');
    });

    test('dynamic strings fall back to the source text in english', async () => {
        const { engine } = await loadEngine({ savedLanguage: 'en' });

        expect(engine.translate('Clear filters')).toBe('Clear filters');
        expect(engine.t`Connected. The endpoint returned ${3} models.`).toBe('Connected. The endpoint returned 3 models.');
    });

    test('user authored strings survive the round trip untouched', async () => {
        const { engine } = await loadEngine();
        const authored = '我的角色说：Hello, world!';

        expect(engine.translate(authored)).toBe(authored);
        expect(engine.translate('')).toBe('');
    });

    test('selection persists the language and reloads the page', async () => {
        const { engine, storage } = await loadEngine();

        engine.chooseLocale('en');

        expect(storage.get('language')).toBe('en');
        expect(globalThis.location.reload).toHaveBeenCalledTimes(1);
    });

    test('selecting an unsupported language persists the zh-cn fallback', async () => {
        const { engine, storage } = await loadEngine();

        engine.chooseLocale('klingon');

        expect(storage.get('language')).toBe('zh-cn');
    });

    test('notifies React subscribers even when the locale has no translation data', async () => {
        const { engine, dispatched } = await loadEngine({ savedLanguage: 'en', localeDataAvailable: false });

        expect(dispatched).toContain('i18n:applied');
        expect(engine.translate('Save settings')).toBe('Save settings');
        expect(engine.translate('Clear filters')).toBe('Clear filters');
    });

    test('the document language follows the active locale', async () => {
        const english = await loadEngine({ savedLanguage: 'en' });
        expect(globalThis.document.documentElement.lang).toBe('en');

        browserGlobals.forEach(key => delete globalThis[key]);
        const chinese = await loadEngine();
        expect(globalThis.document.documentElement.lang).toBe('zh-cn');
        expect(english.engine.getCurrentLocale()).toBe('en');
        expect(chinese.engine.getCurrentLocale()).toBe('zh-cn');
    });
});
