import { describe, expect, test } from '@jest/globals';

import {
    expectButtonAffordance,
    expectContainsMarkers,
    expectDocumentOrder,
    expectNotContainsMarkers,
    expectUniqueMarker,
    getTagByClass,
    getTagById,
    readRepoFile,
} from './helpers/frontend-structure-contract.js';

describe('frontend structure contract helpers', () => {
    test('reads repository files and locates tags by id or class', () => {
        const indexHtml = readRepoFile('public/index.html');

        expect(getTagById(indexHtml, 'fallback_provider_section')).toContain('data-doc-id="feature.fallback_provider"');
        expect(getTagByClass(indexHtml, 'fallback_provider_save_key')).toContain('id="fallback_provider_save_key"');
    });

    test('checks button affordance and readable marker failures', () => {
        const indexHtml = readRepoFile('public/index.html');

        expectButtonAffordance(getTagByClass(indexHtml, 'fallback_provider_save_key'), 'Save fallback API key', {
            contractName: 'fallback provider save key',
        });

        expect(() => getTagByClass(indexHtml, 'missing_contract_class', { contractName: 'sample contract' }))
            .toThrow('sample contract: expected a tag with class "missing_contract_class"');
    });

    test('checks marker presence absence uniqueness and document order', () => {
        const sample = '<section id="first"></section><button id="second" role="button"></button>';

        expectContainsMarkers(sample, ['id="first"', 'id="second"'], { contractName: 'sample markers' });
        expectNotContainsMarkers(sample, ['id="third"'], { contractName: 'sample markers' });
        expectUniqueMarker(sample, 'id="second"', { contractName: 'sample unique marker' });
        expectDocumentOrder(sample, ['id="first"', 'id="second"'], { contractName: 'sample order' });

        expect(() => expectDocumentOrder(sample, ['id="second"', 'id="first"'], { contractName: 'bad order' }))
            .toThrow('bad order: marker id="first" is not after the previous marker');
    });
});
