import { describe, expect, test } from '@jest/globals';

import {
    CHARACTER_LIST_PAGE_SIZE_OPTIONS,
    createCharacterListEntitySnapshot,
    createCharacterListPageRenderPlan,
    getCharacterListEntityKey,
    getCharacterListPaginationRangeLabel,
} from '../public/scripts/character-list-render-state.js';

describe('character list render state helpers', () => {
    test('creates stable internal keys while leaving DOM ids outside the helper', () => {
        expect(getCharacterListEntityKey({
            type: 'character',
            id: 12,
            item: { avatar: 'alpha.png' },
        })).toBe('character:alpha.png');

        expect(getCharacterListEntityKey({
            type: 'group',
            id: 'group-fallback',
            item: { id: 'group-1' },
        })).toBe('group:group-1');

        expect(getCharacterListEntityKey({
            type: 'tag',
            id: 'tag-fallback',
            item: { id: 'folder-1' },
        })).toBe('tag:folder-1');
    });

    test('builds an entity snapshot without changing entity order or ids', () => {
        const entities = [
            { type: 'character', id: 0, item: { avatar: 'alpha.png' } },
            { type: 'group', id: 'group-1', item: { id: 'group-1' } },
            { type: 'tag', id: 'folder-1', item: { id: 'folder-1' }, entities: [] },
        ];

        const snapshot = createCharacterListEntitySnapshot(entities);

        expect(snapshot.total).toBe(3);
        expect(snapshot.keys).toEqual(['character:alpha.png', 'group:group-1', 'tag:folder-1']);
        expect(snapshot.entities.map(entity => entity.id)).toEqual([0, 'group-1', 'folder-1']);
        expect(snapshot.entities.map(entity => entity.renderIndex)).toEqual([0, 1, 2]);
    });

    test('formats pagination range labels with plugin-provided totals or snapshot fallback', () => {
        expect(getCharacterListPaginationRangeLabel({
            currentPage: 1,
            totalNumber: 14,
            pageSize: 25,
            fallbackTotal: 99,
        })).toBe('1-14 / 14');

        expect(getCharacterListPaginationRangeLabel({
            currentPage: 2,
            totalNumber: 0,
            pageSize: 10,
            fallbackTotal: 14,
        })).toBe('11-14 / 14');

        expect(getCharacterListPaginationRangeLabel({
            currentPage: 1,
            totalNumber: 0,
            pageSize: 10,
            fallbackTotal: 0,
        })).toBe('0-0 / 0');
    });

    test('describes current page rendering without rendering DOM', () => {
        const plan = createCharacterListPageRenderPlan({
            pageEntities: [
                { type: 'character', id: 0, item: { avatar: 'alpha.png' } },
                { type: 'tag', id: 'folder-1', item: { id: 'folder-1' }, entities: [] },
            ],
            includeBackBlock: true,
            totalCharacters: 4,
            totalGroups: 1,
            hasActiveFilter: true,
        });

        expect(plan.includeBackBlock).toBe(true);
        expect(plan.showEmptyBlock).toBe(false);
        expect(plan.displayCount).toBe(1);
        expect(plan.hiddenCount).toBe(4);
        expect(plan.showHiddenBlock).toBe(true);
    });

    test('keeps the accepted character list page-size options stable', () => {
        expect(CHARACTER_LIST_PAGE_SIZE_OPTIONS).toEqual([10, 25, 50, 100, 250, 500, 1000]);
    });
});
