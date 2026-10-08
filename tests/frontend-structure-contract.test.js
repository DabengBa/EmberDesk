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
        const aiConfigPanel = readRepoFile('app/components/ai-config/AiConfigPanel.tsx');

        expect(getTagById(aiConfigPanel, 'ai_response_configuration')).toContain('className="flex-container flexNoGap"');
        expect(getTagByClass(aiConfigPanel, 'preset-header')).toContain('className="margin0 title_restorable preset-header"');
    });

    test('checks button affordance and readable marker failures', () => {
        const indexHtml = readRepoFile('public/index.html');

        expectButtonAffordance(getTagByClass(indexHtml, 'swipe_left'), 'Previous swipe', {
            contractName: 'previous swipe button',
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
