import { describe, expect, test, afterEach } from '@jest/globals';
import { translate, t, getCurrentLocale, resetI18nBridgeForTests } from '../app/compat/i18n.js';

describe('app i18n bridge', () => {
    afterEach(() => {
        delete globalThis.SillyTavern;
        resetI18nBridgeForTests();
    });

    test('falls back to source text without SillyTavern context', () => {
        expect(translate('Hello')).toBe('Hello');
        expect(t`Count ${3} items`).toBe('Count 3 items');
        expect(getCurrentLocale()).toBe(String(navigator.language || 'en').toLowerCase());
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
});
