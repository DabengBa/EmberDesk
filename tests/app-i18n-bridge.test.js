import { describe, expect, test, afterEach } from '@jest/globals';
import {
    translate,
    t,
    getCurrentLocale,
    resetI18nBridgeForTests,
} from '../app/compat/i18n.js';

describe('app i18n bridge', () => {
    afterEach(() => {
        delete globalThis.SillyTavern;
        delete globalThis.localStorage;
        resetI18nBridgeForTests();
    });

    test('falls back to source text without SillyTavern context', () => {
        expect(translate('Hello')).toBe('Hello');
        expect(t`Count ${3} items`).toBe('Count 3 items');
        expect(getCurrentLocale()).toBe('zh-cn');
    });

    test('delegates to legacy i18n via SillyTavern.getContext', () => {
        const calls = [];
        globalThis.SillyTavern = {
            getContext: () => ({
                translate: (text, key) => { calls.push(['translate', text, key]); return `T:${text}`; },
                t: (strings, ...values) => { calls.push(['t', strings.join(''), values]); return 'T:' + strings.join('|') + ':' + values.join(','); },
                getCurrentLocale: () => 'zh-cn',
            }),
        };

        expect(translate('Save')).toBe('T:Save');
        expect(getCurrentLocale()).toBe('zh-cn');
        expect(t`Delete ${'Seraphina'} now`).toBe('T:Delete | now:Seraphina');
        expect(calls.map(c => c[0])).toEqual(['translate', 't']);
    });

    test('caches resolved functions across calls', () => {
        let contexts = 0;
        globalThis.SillyTavern = {
            getContext: () => {
                contexts++;
                return {
                    translate: (text) => text,
                    t: (s, ...v) => s.join('') + v.join(''),
                    getCurrentLocale: () => 'en',
                };
            },
        };
        translate('a');
        translate('b');
        getCurrentLocale();
        expect(contexts).toBe(1);
    });

    test('tolerates a context without i18n functions', () => {
        globalThis.SillyTavern = { getContext: () => ({}) };
        expect(translate('Fallback')).toBe('Fallback');
    });

    test('standalone pages fall back to the source text before the locale loads', () => {
        // /login and /setup render without any shell context; an unloaded locale
        // must not render empty labels.
        expect(translate('Sign in')).toBe('Sign in');
        expect(t`Connected. The endpoint returned ${2} models.`).toBe('Connected. The endpoint returned 2 models.');
        expect(getCurrentLocale()).toBe('zh-cn');
    });

    test('interpolates indexed placeholders through the bridge', () => {
        globalThis.SillyTavern = {
            getContext: () => ({
                translate: (text) => text,
                // Faithful legacy semantics: `${index}` placeholders replaced by value.
                t: (strings, ...values) => strings
                    .reduce((result, string, i) => result + string + (values[i] !== undefined ? `\${${i}}` : ''), '')
                    .replace(/\$\{(\d+)\}/g, (match, index) => String(values[Number(index)])),
                getCurrentLocale: () => 'en',
            }),
        };

        expect(t`Count ${3} items`).toBe('Count 3 items');
        expect(t`${'a'} and ${'b'}`).toBe('a and b');
    });
});
