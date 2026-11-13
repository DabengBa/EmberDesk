import { describe, expect, jest, test } from '@jest/globals';
import * as chevrotain from 'chevrotain';

jest.unstable_mockModule('../public/lib.js', () => ({ DOMPurify: {}, chevrotain }));
jest.unstable_mockModule('../public/scripts/utils.js', () => ({ debounce: fn => fn, escapeRegex: value => value }));
jest.unstable_mockModule('../public/scripts/macros/engine/MacroBrowser.js', () => ({
    formatMacroSignature: jest.fn(), createSourceIndicator: jest.fn(), createAliasIndicator: jest.fn(), renderMacroDetails: jest.fn(),
}));

async function importFreshAutocompleteModule() {
    return import(`../public/scripts/autocomplete/autocomplete-ranking.js?cacheBust=${Date.now()}-${Math.random()}`);
}

describe('autocomplete ranking helpers', () => {
    test('macro suggestions are not truncated when chat text starts with a slash', async () => {
        const { AutoComplete } = await import('../public/scripts/autocomplete/AutoComplete.js');
        const textarea = { value: '/{{', selectionStart: 3 };
        const options = Array.from({ length: 40 }, (_, index) => ({ name: `macro-${index}`, value: `macro-${index}` }));
        const ac = Object.create(AutoComplete.prototype);
        Object.assign(ac, {
            textarea, checkIfActivate: () => true,
            getNameAt: async () => ({ name: '', start: 3, optionList: options }),
            makeItem: () => ({}), fuzzyScore: () => {}, updateName: () => {},
            selectDefaultItem: result => result[0], renderDebounced: () => {},
        });
        const previousDocument = globalThis.document;
        globalThis.document = { activeElement: textarea };
        try {
            await ac.show(true);
            expect(ac.result).toHaveLength(40);
        } finally {
            globalThis.document = previousDocument;
        }
    });

    test('keeps exact and prefix matches ahead of fuzzy matches', async () => {
        const { sortAutocompleteResults } = await importFreshAutocompleteModule();

        const sorted = sortAutocompleteResults([
            { name: 'checkpoint-create', value: 'checkpoint-create' },
            { name: 'continue', value: 'continue' },
            { name: 'context', value: 'context' },
            { name: 'count', value: 'count' },
        ], { query: 'cont', matchType: 'fuzzy' });

        expect(sorted.map(option => option.name).slice(0, 3)).toEqual(['continue', 'context', 'count']);
    });

    test('macro autocomplete preserves its icon, slash syntax and variable shorthand', async () => {
        const { EnhancedMacroAutoCompleteOption, parseMacroContext } = await import('../public/scripts/autocomplete/EnhancedMacroAutoCompleteOption.js');
        const option = new EnhancedMacroAutoCompleteOption({ name: '//', minArgs: 0, maxArgs: 0, list: null }, { fullText: '/' });
        expect(option.typeIcon).toBe('{{');
        expect(option.replacementStartOffset).toBe(-1);
        expect(option.valueProvider()).toBe('//}}');
        expect(parseMacroContext('/if', 3).identifier).toBe('/if');
        expect(parseMacroContext('//', 2).identifier).toBe('//');
        expect(parseMacroContext('.counter+=2', 11)).toMatchObject({ isVariableShorthand: true, variableName: 'counter', variableOperator: '+=', variableValue: '2' });
    });
});
