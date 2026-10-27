import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from '@jest/globals';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const i18nSource = fs.readFileSync(path.join(repoRoot, 'public', 'scripts', 'i18n.js'), 'utf8');
const uiLocaleSource = fs.readFileSync(path.join(repoRoot, 'public', 'scripts', 'ui-locale.js'), 'utf8');
const zhCn = JSON.parse(fs.readFileSync(path.join(repoRoot, 'public', 'locales', 'zh-cn.json'), 'utf8'));
// English ships no resource: the translation key is the English source text, so
// the engine's `localeData?.[key] ?? text` fallback already renders English.
const shippedLocales = fs.readdirSync(path.join(repoRoot, 'public', 'locales')).sort();

// Mirrors the locale resolution contract implemented by public/scripts/i18n.js
// (public/scripts/ui-locale.js). One authority, one storage key, and
// default to Simplified Chinese for missing, empty, or unknown values.
const STORAGE_KEY = 'language';
const DEFAULT_LOCALE = 'zh-cn';
const SUPPORTED = ['zh-cn', 'en'];

function resolveLocale(saved) {
    const normalized = String(saved ?? '').trim().toLowerCase();
    return SUPPORTED.includes(normalized) ? normalized : DEFAULT_LOCALE;
}

function translateWith(localeData, text, key = null) {
    const translationKey = key || text;
    return localeData?.[translationKey] ?? text;
}

describe('i18n locale contract', () => {
    test('defaults to Simplified Chinese when nothing is saved', () => {
        expect(resolveLocale(null)).toBe('zh-cn');
        expect(resolveLocale(undefined)).toBe('zh-cn');
        expect(resolveLocale('')).toBe('zh-cn');
        expect(resolveLocale('   ')).toBe('zh-cn');
    });

    test('accepts the supported languages and normalizes case', () => {
        expect(resolveLocale('zh-cn')).toBe('zh-cn');
        expect(resolveLocale('en')).toBe('en');
        expect(resolveLocale('EN')).toBe('en');
        expect(resolveLocale('Zh-CN')).toBe('zh-cn');
    });

    test('falls back to Simplified Chinese for retired or unknown locale values', () => {
        // Locales that used to exist before the Simplified-Chinese-only refactor.
        for (const retired of ['de-de', 'fr-fr', 'ja-jp', 'zh-tw', 'ar-sa']) {
            expect(resolveLocale(retired)).toBe('zh-cn');
        }
        expect(resolveLocale('klingon')).toBe('zh-cn');
    });

    test('english is the source text and needs no translation table', () => {
        expect(translateWith(null, 'Save settings')).toBe('Save settings');
        // Keys with indexed placeholders keep the placeholders in the fallback text.
        expect(translateWith(null, 'Connected. The endpoint returned ${0} models.')).toBe('Connected. The endpoint returned ${0} models.');
    });

    test('simplified Chinese translations win over the English source text', () => {
        expect(translateWith(zhCn, 'Save settings')).toBe('保存设置');
        expect(translateWith(zhCn, 'Sign in')).toBe('登录');
        expect(translateWith(zhCn, 'Settings', 'Wrong key still resolves by key')).toBe(zhCn['Wrong key still resolves by key'] ?? 'Settings');
    });

    test('interpolation replaces indexed placeholders after translation', () => {
        const interpolate = (template, values) => String(template).replace(/\$\{(\d+)\}/g, (match, index) => String(values[index] ?? match));

        expect(interpolate(translateWith(zhCn, 'Connected. The endpoint returned ${0} models.'), [7]))
            .toBe('连接成功，接口返回 7 个模型。');
        expect(interpolate(translateWith(zhCn, 'Account locked. Try again in ${0} seconds.'), [30]))
            .toBe('账号已锁定，请在 30 秒后重试。');
        // English (no resource) keeps the source text with the value substituted.
        expect(interpolate(translateWith(null, 'Account locked. Try again in ${0} seconds.'), [30]))
            .toBe('Account locked. Try again in 30 seconds.');
    });
});

describe('i18n locale resources', () => {
    test('only Simplified Chinese ships a translation resource', () => {
        // English is the source text, so its resource would be a 4000-key identity
        // table that duplicates every markup string. The engine renders English
        // through the `localeData?.[key] ?? text` fallback, which is covered by
        // the runtime tests below.
        expect(shippedLocales).toEqual(['zh-cn.json']);
    });

    test('english renders the source text instead of a duplicated resource', () => {
        expect(translateWith(null, 'Save settings')).toBe('Save settings');
        expect(translateWith(null, 'Clear filters')).toBe('Clear filters');
    });

    test('simplified Chinese resource translates the previously mixed surfaces', () => {
        const expected = {
            'Clear filters': '清除筛选',
            'Search chats': '搜索聊天',
            'Loading…': '加载中…',
            'Save settings': '保存设置',
            'Sign in': '登录',
            'Please enter a username': '请输入用户名',
            'Settings sections': '设置分区',
            'Switching the language reloads the page.': '切换语言会重新加载页面。',
            'Collapse ordinary code blocks': '折叠普通代码块',
            'Ordinary code blocks': '普通代码块',
            'Generation failed. You can retry by sending a new message or keep chatting.':
                '生成失败。你可以重新发送一条消息重试，或继续聊天。',
        };

        for (const [key, value] of Object.entries(expected)) {
            expect(zhCn[key]).toBe(value);
        }
    });

    test('keeps protocol, product, and technical terms untranslated', () => {
        const terms = ['API', 'URL', 'GitHub', 'Discord', 'NovelAI', 'KoboldAI', 'ggml-org/llama.cpp', 'CFG'];
        for (const term of terms) {
            expect(zhCn[term]).toBe(term);
        }
    });
});

describe('i18n engine wiring', () => {
    test('locale is resolved from the saved language value, not the browser locale', () => {
        expect(i18nSource).toContain("} from './ui-locale.js';");
        expect(i18nSource).toContain('let localeFile = readStoredUiLocale();');
        expect(i18nSource).not.toContain('navigator.language');
        expect(uiLocaleSource).toContain(`export const UI_LOCALE_STORAGE_KEY = '${STORAGE_KEY}';`);
        expect(uiLocaleSource).toContain('localStorage?.getItem(UI_LOCALE_STORAGE_KEY)');
    });

    test('declares Simplified Chinese and English as the shipped languages', () => {
        expect(i18nSource).toContain("{ lang: 'zh-cn', display: '简体中文' }");
        expect(i18nSource).toContain("{ lang: 'en', display: 'English' }");
    });

    test('selection persists and reloads so one locale context survives', () => {
        expect(i18nSource).toContain('export function chooseLocale(language)');
        expect(i18nSource).toContain('localStorage.setItem(storageKey, resolveUiLocale(language));');
        expect(i18nSource).toContain('location.reload();');
    });

    test('the i18n:applied event fires even when the active locale has no translations', () => {
        expect(i18nSource).toContain('if (!localeData) {');
        expect(i18nSource).not.toContain('Object.keys(localeData).length === 0');
        expect(i18nSource).toContain("document.dispatchEvent(new CustomEvent('i18n:applied'));");
    });

    test('the shared locale authority owns the storage key, default, and reload', () => {
        expect(uiLocaleSource).toContain(`export const UI_LOCALE_STORAGE_KEY = '${STORAGE_KEY}';`);
        expect(uiLocaleSource).toContain(`export const DEFAULT_UI_LOCALE = '${DEFAULT_LOCALE}';`);
        expect(uiLocaleSource).toContain('localStorage.setItem(UI_LOCALE_STORAGE_KEY, resolveUiLocale(language));');
        expect(uiLocaleSource).toContain('location.reload();');
        // Both consumers import the authority instead of duplicating the rules.
        expect(i18nSource).toContain('readStoredUiLocale');
        expect(fs.readFileSync(path.join(repoRoot, 'app', 'client.tsx'), 'utf8')).toContain('readStoredUiLocale');
        expect(fs.readFileSync(path.join(repoRoot, 'app', 'components', 'settings', 'SettingsSurface.tsx'), 'utf8'))
            .toContain('setUiLocale');
    });
});

describe('mixed-language regressions', () => {
    const read = relativePath => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

    test('standalone React surfaces render translated copy instead of hardcoded Chinese', () => {
        const surfaces = [
            'app/components/login/LoginForm.tsx',
            'app/components/login/RecoveryForm.tsx',
            'app/components/setup/SetupForm.tsx',
            'app/routes/setup.tsx',
            'app/components/settings/SettingsSurface.tsx',
            'app/components/settings/SettingsTabs.tsx',
        ];

        for (const surface of surfaces) {
            const source = read(surface);
            const hardcodedCjk = [...source.matchAll(/'([^'\n]*[\u4e00-\u9fff][^'\n]*)'/g)]
                .map(match => match[1])
                .filter(value => !value.startsWith('//'));
            expect({ surface, hardcodedCjk }).toEqual({ surface, hardcodedCjk: [] });
        }
    });

    test('the settings surface offers the language selector backed by the shared storage key', () => {
        const surface = read('app/components/settings/SettingsSurface.tsx');
        expect(surface).toContain('id="settings-ui-language"');
        expect(surface).toContain('value={uiLocale}');
        expect(surface).toContain('onChange={event => setUiLocale(event.target.value)}');
        expect(surface).toContain('uiLocaleOptions.map');
        expect(surface).toContain("t('Switching the language reloads the page.')");
    });

    test('standalone react pages do not import the legacy shell', () => {
        for (const surface of ['app/client.tsx', 'app/components/settings/SettingsSurface.tsx', 'app/routes/login.tsx', 'app/routes/setup.tsx']) {
            const source = read(surface);
            expect(source).not.toMatch(/from '(?:\.\.\/)*(?:\.\.\/)?script\.js'/);
            expect(source).not.toContain("from '@sillytavern/script.js'");
        }
        expect(read('app/client.tsx')).toContain('document.documentElement.lang = readStoredUiLocale();');
    });

    test('react-owned text is translated by React instead of the legacy observer', () => {
        // Text-mode React copy resolves through translate()/useTranslated() at
        // render time, so switching locale re-renders it without the observer
        // writing textContent over React's children.
        const composer = read('app/components/composer/ChatComposer.tsx');
        expect(composer).toContain("translate('Type /? for commands. Send requires an API connection.')");
        expect(composer).not.toContain('data-react-i18n-children=""');

        // Mounted before initLocales, so the menu must re-render on i18n:applied.
        const contextMenu = read('app/components/context-menu/CharacterContextMenu.tsx');
        expect(contextMenu).toContain("useTranslated('Favorite')");
    });
});
