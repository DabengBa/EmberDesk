import { describe, expect, test } from '@jest/globals';

import { applyI18nTranslations, parseI18nAttributeSpecs } from '../public/scripts/i18n-data.js';

function createFakeElement(dataI18n) {
    const attributes = new Map([['data-i18n', dataI18n]]);

    return {
        textContent: '',
        getAttribute(name) {
            return attributes.get(name) ?? null;
        },
        setAttribute(name, value) {
            attributes.set(name, String(value));
        },
        readAttribute(name) {
            return attributes.get(name) ?? null;
        },
    };
}

describe('i18n data helpers', () => {
    test('parses multi-attribute data-i18n entries without merging attribute names', () => {
        expect(parseI18nAttributeSpecs('[title][aria-label]Delete Character')).toEqual([
            {
                raw: '[title][aria-label]Delete Character',
                attributes: ['title', 'aria-label'],
                key: 'Delete Character',
            },
        ]);
    });

    test('applies one translation value to multiple bound attributes', () => {
        const element = createFakeElement('[title][aria-label]Delete Character');

        applyI18nTranslations(element, element.getAttribute('data-i18n'), {
            'Delete Character': '删除角色',
        });

        expect(element.readAttribute('title')).toBe('删除角色');
        expect(element.readAttribute('aria-label')).toBe('删除角色');
    });

    test('keeps plain text translation behavior for non-attribute entries', () => {
        const element = createFakeElement('Favorite');

        applyI18nTranslations(element, element.getAttribute('data-i18n'), {
            Favorite: '星标',
        });

        expect(element.textContent).toBe('星标');
    });
});
