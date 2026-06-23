import { describe, expect, test } from '@jest/globals';

async function importFreshAutocompleteModule() {
    return import(`../public/scripts/autocomplete/autocomplete-ranking.js?cacheBust=${Date.now()}-${Math.random()}`);
}

describe('autocomplete ranking helpers', () => {
    test('limits bare slash-command suggestions to a focused default set', async () => {
        const { limitAutocompleteResults } = await importFreshAutocompleteModule();

        const options = Array.from({ length: 40 }, (_, index) => ({ name: `command-${index}`, value: `command-${index}` }));

        expect(limitAutocompleteResults(options, { query: '', isSlashCommand: true })).toHaveLength(12);
    });

    test('keeps exact and prefix command matches ahead of fuzzy matches', async () => {
        const { sortAutocompleteResults } = await importFreshAutocompleteModule();

        const sorted = sortAutocompleteResults([
            { name: 'checkpoint-create', value: 'checkpoint-create' },
            { name: 'continue', value: 'continue' },
            { name: 'context', value: 'context' },
            { name: 'count', value: 'count' },
        ], { query: 'cont', matchType: 'fuzzy' });

        expect(sorted.map(option => option.name).slice(0, 3)).toEqual(['continue', 'context', 'count']);
    });
});
