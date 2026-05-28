import { describe, expect, test } from '@jest/globals';

import {
    CHARACTER_LIST_PAGE_SIZE_OPTIONS,
    createCharacterListEntitySnapshot,
    createCharacterListPageReconcilePlan,
    createCharacterListPageRenderPlan,
    createCharacterBulkDeletePagePlan,
    createCharacterDeleteReconcilePlan,
    getCharacterListEntityKey,
    getCharacterListPaginationRangeLabel,
    syncCharacterListRowIdentity,
} from '../public/scripts/character-list-render-state.js';

function createFakeRow(id, avatar) {
    const attributes = new Map([
        ['data-chid', String(id)],
        ['chid', String(id)],
        ['data-avatar', avatar],
    ]);

    return {
        id: `CharID${id}`,
        getAttribute: name => attributes.get(name) ?? null,
        setAttribute: (name, value) => {
            attributes.set(name, String(value));
        },
    };
}

function createFakeContainer(rows) {
    return {
        rows,
        querySelectorAll: selector => selector === '.character_select' ? rows : [],
    };
}

function characterEntity(id, avatar) {
    return {
        type: 'character',
        id,
        item: { avatar },
    };
}

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

    test('plans a page reconcile by reusing, reordering, inserting, and removing entity rows', () => {
        const beforeSnapshot = createCharacterListEntitySnapshot([
            characterEntity(0, 'alpha.png'),
            characterEntity(1, 'beta.png'),
            characterEntity(2, 'gamma.png'),
        ]);
        const afterSnapshot = createCharacterListEntitySnapshot([
            characterEntity(0, 'gamma.png'),
            characterEntity(1, 'alpha.png'),
            characterEntity(2, 'delta.png'),
        ]);
        const pageEntities = afterSnapshot.entities;

        const plan = createCharacterListPageReconcilePlan({
            beforePageEntities: beforeSnapshot.entities,
            afterSnapshot,
            pageEntities,
            currentPage: 1,
            pageSize: 3,
            totalCharacters: 3,
            totalGroups: 0,
            hasActiveFilter: false,
        });

        expect(plan.mode).toBe('incremental');
        expect(plan.orderedKeys).toEqual(['character:gamma.png', 'character:alpha.png', 'character:delta.png']);
        expect(plan.reusedKeys).toEqual(['character:gamma.png', 'character:alpha.png']);
        expect(plan.insertedKeys).toEqual(['character:delta.png']);
        expect(plan.removedKeys).toEqual(['character:beta.png']);
        expect(plan.requiresIdentitySync).toBe(true);
        expect(plan.paginationLabel).toBe('1-3 / 3');
        expect(plan.renderPlan.pageEntities.map(entity => entity.item.avatar)).toEqual(['gamma.png', 'alpha.png', 'delta.png']);
    });

    test('falls back from page reconcile for ambiguous or unsupported page states', () => {
        const beforeSnapshot = createCharacterListEntitySnapshot([
            characterEntity(0, 'alpha.png'),
            characterEntity(1, 'beta.png'),
        ]);
        const afterSnapshot = createCharacterListEntitySnapshot([
            characterEntity(0, 'alpha.png'),
            characterEntity(1, 'alpha.png'),
        ]);

        expect(createCharacterListPageReconcilePlan({
            beforePageEntities: beforeSnapshot.entities,
            afterSnapshot,
            pageEntities: afterSnapshot.entities,
            currentPage: 1,
            pageSize: 2,
            totalCharacters: 2,
            totalGroups: 0,
            hasActiveFilter: false,
        })).toMatchObject({ mode: 'fallback', reason: 'duplicate-entity-key' });

        expect(createCharacterListPageReconcilePlan({
            beforePageEntities: beforeSnapshot.entities,
            afterSnapshot: createCharacterListEntitySnapshot([
                characterEntity(0, 'alpha.png'),
            ]),
            pageEntities: [characterEntity(0, 'alpha.png')],
            currentPage: 1,
            pageSize: 2,
            totalCharacters: 1,
            totalGroups: 0,
            includeBackBlock: true,
            hasActiveFilter: false,
        })).toMatchObject({ mode: 'fallback', reason: 'back-block' });
    });

    test('plans ordinary single-delete reconcile with the current page filled from the after snapshot', () => {
        const beforeSnapshot = createCharacterListEntitySnapshot([
            characterEntity(0, 'alpha.png'),
            characterEntity(1, 'beta.png'),
            characterEntity(2, 'gamma.png'),
        ]);
        const afterSnapshot = createCharacterListEntitySnapshot([
            characterEntity(0, 'alpha.png'),
            characterEntity(1, 'gamma.png'),
        ]);

        const plan = createCharacterDeleteReconcilePlan({
            beforeSnapshot,
            afterSnapshot,
            deletedAvatars: ['beta.png'],
            currentPage: 1,
            pageSize: 2,
            hasActiveFilter: false,
            isBulkEdit: false,
            isBogusFolderOpen: false,
            isPrintPending: false,
        });

        expect(plan.mode).toBe('incremental');
        expect(plan.deletedKeys).toEqual(['character:beta.png']);
        expect(plan.pageEntities.map(entity => entity.item.avatar)).toEqual(['alpha.png', 'gamma.png']);
        expect(plan.requiresIdentitySync).toBe(true);
        expect(plan.paginationLabel).toBe('1-2 / 2');
    });

    test('falls back for complex or unsafe delete states', () => {
        const beforeSnapshot = createCharacterListEntitySnapshot([
            characterEntity(0, 'alpha.png'),
            characterEntity(1, 'beta.png'),
        ]);
        const afterSnapshot = createCharacterListEntitySnapshot([
            characterEntity(0, 'alpha.png'),
        ]);

        expect(createCharacterDeleteReconcilePlan({
            beforeSnapshot,
            afterSnapshot,
            deletedAvatars: ['beta.png', 'gamma.png'],
            currentPage: 1,
            pageSize: 2,
        })).toMatchObject({ mode: 'fallback', reason: 'multi-delete' });

        expect(createCharacterDeleteReconcilePlan({
            beforeSnapshot,
            afterSnapshot,
            deletedAvatars: ['beta.png'],
            currentPage: 1,
            pageSize: 2,
            hasActiveFilter: true,
        })).toMatchObject({ mode: 'fallback', reason: 'active-filter' });

        expect(createCharacterDeleteReconcilePlan({
            beforeSnapshot,
            afterSnapshot,
            deletedAvatars: ['beta.png'],
            currentPage: 1,
            pageSize: 2,
            isBulkEdit: true,
        })).toMatchObject({ mode: 'fallback', reason: 'bulk-edit' });

        expect(createCharacterDeleteReconcilePlan({
            beforeSnapshot,
            afterSnapshot,
            deletedAvatars: ['beta.png'],
            currentPage: 1,
            pageSize: 2,
            isBogusFolderOpen: true,
        })).toMatchObject({ mode: 'fallback', reason: 'bogus-folder' });
    });

    test('plans bulk delete target pages from the after snapshot', () => {
        const afterSecondPageDelete = createCharacterListEntitySnapshot([
            characterEntity(0, 'alpha.png'),
            characterEntity(1, 'bravo.png'),
            characterEntity(2, 'charlie.png'),
            characterEntity(3, 'delta.png'),
            characterEntity(4, 'echo.png'),
            characterEntity(5, 'hotel.png'),
            characterEntity(6, 'india.png'),
            characterEntity(7, 'juliet.png'),
            characterEntity(8, 'kilo.png'),
            characterEntity(9, 'lima.png'),
        ]);

        const secondPagePlan = createCharacterBulkDeletePagePlan({
            afterSnapshot: afterSecondPageDelete,
            deletedAvatars: ['foxtrot.png', 'golf.png'],
            currentPage: 2,
            pageSize: 5,
        });

        expect(secondPagePlan.mode).toBe('incremental');
        expect(secondPagePlan.currentPage).toBe(2);
        expect(secondPagePlan.pageEntities.map(entity => entity.item.avatar)).toEqual([
            'hotel.png',
            'india.png',
            'juliet.png',
            'kilo.png',
            'lima.png',
        ]);
        expect(secondPagePlan.paginationLabel).toBe('6-10 / 10');

        const afterLastPageDelete = createCharacterListEntitySnapshot([
            characterEntity(0, 'alpha.png'),
            characterEntity(1, 'bravo.png'),
            characterEntity(2, 'charlie.png'),
            characterEntity(3, 'delta.png'),
            characterEntity(4, 'echo.png'),
            characterEntity(5, 'foxtrot.png'),
            characterEntity(6, 'golf.png'),
            characterEntity(7, 'hotel.png'),
        ]);

        const clampedPlan = createCharacterBulkDeletePagePlan({
            afterSnapshot: afterLastPageDelete,
            deletedAvatars: ['india.png', 'juliet.png', 'kilo.png'],
            currentPage: 3,
            pageSize: 5,
        });

        expect(clampedPlan.mode).toBe('incremental');
        expect(clampedPlan.currentPage).toBe(2);
        expect(clampedPlan.pageEntities.map(entity => entity.item.avatar)).toEqual(['foxtrot.png', 'golf.png', 'hotel.png']);
        expect(clampedPlan.paginationLabel).toBe('6-8 / 8');
    });

    test('falls back from bulk delete page planning for unsafe states', () => {
        const afterSnapshot = createCharacterListEntitySnapshot([
            characterEntity(0, 'alpha.png'),
        ]);

        expect(createCharacterBulkDeletePagePlan({
            afterSnapshot,
            deletedAvatars: [],
            currentPage: 1,
            pageSize: 5,
        })).toMatchObject({ mode: 'fallback', reason: 'no-deleted-avatars' });

        expect(createCharacterBulkDeletePagePlan({
            afterSnapshot,
            deletedAvatars: ['bravo.png'],
            currentPage: 1,
            pageSize: 5,
            hasActiveFilter: true,
        })).toMatchObject({ mode: 'fallback', reason: 'active-filter' });

        expect(createCharacterBulkDeletePagePlan({
            afterSnapshot,
            deletedAvatars: ['bravo.png'],
            currentPage: 1,
            pageSize: 5,
            isBogusFolderOpen: true,
        })).toMatchObject({ mode: 'fallback', reason: 'bogus-folder' });

        expect(createCharacterBulkDeletePagePlan({
            afterSnapshot: createCharacterListEntitySnapshot([
                characterEntity(0, 'alpha.png'),
                characterEntity(1, 'alpha.png'),
            ]),
            deletedAvatars: ['bravo.png'],
            currentPage: 1,
            pageSize: 5,
        })).toMatchObject({ mode: 'fallback', reason: 'duplicate-entity-key' });
    });

    test('syncs visible character row identity after deleting a middle row', () => {
        const alpha = createFakeRow(0, 'alpha.png');
        const gamma = createFakeRow(2, 'gamma.png');
        const container = createFakeContainer([alpha, gamma]);

        const changed = syncCharacterListRowIdentity(container, [
            characterEntity(0, 'alpha.png'),
            characterEntity(1, 'gamma.png'),
        ]);

        expect(changed).toBe(2);
        expect(alpha.getAttribute('data-chid')).toBe('0');
        expect(alpha.getAttribute('chid')).toBe('0');
        expect(alpha.id).toBe('CharID0');
        expect(gamma.getAttribute('data-chid')).toBe('1');
        expect(gamma.getAttribute('chid')).toBe('1');
        expect(gamma.id).toBe('CharID1');
    });

    test('syncs visible character row identity after row moves and inserts', () => {
        const gamma = createFakeRow(2, 'gamma.png');
        const alpha = createFakeRow(0, 'alpha.png');
        const delta = createFakeRow(99, 'delta.png');
        const container = createFakeContainer([gamma, alpha, delta]);

        const changed = syncCharacterListRowIdentity(container, [
            characterEntity(0, 'gamma.png'),
            characterEntity(1, 'alpha.png'),
            characterEntity(2, 'delta.png'),
        ]);

        expect(changed).toBe(3);
        expect(gamma.getAttribute('data-chid')).toBe('0');
        expect(gamma.getAttribute('chid')).toBe('0');
        expect(gamma.id).toBe('CharID0');
        expect(alpha.getAttribute('data-chid')).toBe('1');
        expect(alpha.getAttribute('chid')).toBe('1');
        expect(alpha.id).toBe('CharID1');
        expect(delta.getAttribute('data-chid')).toBe('2');
        expect(delta.getAttribute('chid')).toBe('2');
        expect(delta.id).toBe('CharID2');
    });
});
