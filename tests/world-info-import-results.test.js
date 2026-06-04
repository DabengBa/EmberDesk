import { describe, expect, test } from '@jest/globals';

import { createWorldInfoImportResult, summarizeWorldInfoBatchImport } from '../public/scripts/world-info-import-results.js';

describe('world info import results', () => {
    test('creates stable result objects with optional unprocessed reason', () => {
        const file = { name: 'lore.json' };

        expect(createWorldInfoImportResult('success', file, 'lore')).toEqual({
            status: 'success',
            fileName: 'lore.json',
            worldName: 'lore',
        });

        expect(createWorldInfoImportResult('skipped', file, null, { unprocessed: true, reason: 'cancelled-remaining' })).toEqual({
            status: 'skipped',
            fileName: 'lore.json',
            worldName: null,
            unprocessed: true,
            reason: 'cancelled-remaining',
        });
    });

    test('summarizes success, failure, skipped, cancelled, and unprocessed outcomes', () => {
        const results = [
            createWorldInfoImportResult('success', { name: 'one.json' }, 'one'),
            createWorldInfoImportResult('failed', { name: 'bad.json' }),
            createWorldInfoImportResult('cancelled', { name: 'cancel.json' }),
            createWorldInfoImportResult('skipped', { name: 'skip.json' }),
            createWorldInfoImportResult('skipped', { name: 'later.json' }, null, { unprocessed: true }),
        ];

        expect(summarizeWorldInfoBatchImport(results)).toEqual({
            successCount: 1,
            failedCount: 1,
            skippedCount: 2,
            unprocessedCount: 1,
            totalCount: 5,
        });
    });
});
