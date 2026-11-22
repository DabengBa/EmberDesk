import { describe, expect, test, afterEach } from '@jest/globals';
import * as i18n from '../app/compat/i18n.js';
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

    test('falls back to source text without the workspace locale', () => {
        expect(translate('Hello')).toBe('Hello');
        expect(t`Count ${3} items`).toBe('Count 3 items');
        expect(getCurrentLocale()).toBe('zh-cn');
    });

    test('uses the explicitly supplied live workspace locale, not the legacy global', () => {
        const calls = [];
        let locale = 'zh-cn';
        globalThis.SillyTavern = {
            getContext: () => { throw new Error('unexpected global context read'); },
        };
        expect(translate('Save')).toBe('Save');
        i18n.installWorkspaceI18n({
            translate: (text, key) => { calls.push(['translate', text, key]); return `T:${text}`; },
            t: (strings, ...values) => { calls.push(['t', strings.join(''), values]); return 'T:' + strings.join('|') + ':' + values.join(','); },
            getCurrentLocale: () => locale,
        });

        expect(translate('Save')).toBe('T:Save');
        expect(getCurrentLocale()).toBe('zh-cn');
        locale = 'en';
        expect(getCurrentLocale()).toBe('en');
        expect(t`Delete ${'Seraphina'} now`).toBe('T:Delete | now:Seraphina');
        expect(calls.map(c => c[0])).toEqual(['translate', 't']);
    });


    test('standalone pages fall back to the source text before the locale loads', () => {
        // /login and /setup render without any shell context; an unloaded locale
        // must not render empty labels.
        expect(translate('Sign in')).toBe('Sign in');
        expect(t`Connected. The endpoint returned ${2} models.`).toBe('Connected. The endpoint returned 2 models.');
        expect(getCurrentLocale()).toBe('zh-cn');
    });

    test('interpolates indexed placeholders through the bridge', () => {
        i18n.installWorkspaceI18n({
                translate: (text) => text,
                // Faithful legacy semantics: `${index}` placeholders replaced by value.
                t: (strings, ...values) => strings
                    .reduce((result, string, i) => result + string + (values[i] !== undefined ? `\${${i}}` : ''), '')
                    .replace(/\$\{(\d+)\}/g, (match, index) => String(values[Number(index)])),
                getCurrentLocale: () => 'en',
        });

        expect(t`Count ${3} items`).toBe('Count 3 items');
        expect(t`${'a'} and ${'b'}`).toBe('a and b');
    });
});
