import { expect, test } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';

// Characterization only: these are explicit examples, not a proposed SQL contract.
test('real browser character filters and sorting preserve current observable examples', async ({ page }) => {
    await testSetup.awaitST({ page });

    const observed = await page.evaluate(async () => {
        const { FilterHelper, FILTER_TYPES, FILTER_STATES } = await import('/scripts/filters.js');
        const { power_user, sortEntitiesList } = await import('/scripts/power-user.js');
        const { tag_map } = await import('/scripts/tags.js');
        const keys = ['u005-a.png', 'u005-b.png', 'u005-c.png'];
        const previousTags = keys.map(key => Object.getOwnPropertyDescriptor(tag_map, key));
        const sortSettings = {
            sort_field: power_user.sort_field,
            sort_order: power_user.sort_order,
            sort_rule: power_user.sort_rule,
        };
        const select = document.querySelector('#character_sort_order');
        const selectedOptions = select ? Array.from(select.options, option => option.selected) : [];

        try {
            tag_map[keys[0]] = ['red', 'round'];
            tag_map[keys[1]] = ['red', 'round', 'blocked'];
            tag_map[keys[2]] = ['red'];
            const data = [
                { type: 'character', id: 'a', item: { avatar: keys[0], name: 'Café Noir', fav: true } },
                { type: 'character', id: 'b', item: { avatar: keys[1], name: 'CAFE Light', fav: false } },
                { type: 'character', id: 'c', item: { avatar: keys[2], name: 'Beta', fav: 'false' } },
                { type: 'tag', id: 'folder', item: { name: 'Cafe Folder', fav: false } },
                { type: 'tag', id: 'other-folder', item: { name: 'Other Folder', fav: false } },
            ];
            const ids = rows => rows.map(row => row.id);
            const filter = new FilterHelper(() => {});
            const set = (type, value) => filter.setFilterData(type, value, true);
            const result = {};
            set(FILTER_TYPES.SEARCH, 'cAfE');
            result.search = ids(filter.applyFilters(data));
            set(FILTER_TYPES.SEARCH, 'noÏr');
            result.searchInteriorAccentedQuery = ids(filter.applyFilters(data));
            set(FILTER_TYPES.SEARCH, '');
            set(FILTER_TYPES.TAG, { selected: ['red', 'round'], excluded: [] });
            result.tagsAnd = ids(filter.applyFilters(data));
            set(FILTER_TYPES.TAG, { selected: ['red', 'round'], excluded: ['blocked'] });
            result.tagsExcluded = ids(filter.applyFilters(data));
            set(FILTER_TYPES.TAG, { selected: [], excluded: [] });
            for (const state of ['UNDEFINED', 'SELECTED', 'EXCLUDED']) {
                set(FILTER_TYPES.FAV, FILTER_STATES[state]);
                result[`fav${state}`] = ids(filter.applyFilters(data));
            }
            set(FILTER_TYPES.FAV, FILTER_STATES.SELECTED);
            set(FILTER_TYPES.TAG, { selected: ['red'], excluded: ['blocked'] });
            set(FILTER_TYPES.SEARCH, 'cafe');
            result.combined = ids(filter.applyFilters(data));

            // Avoid the UI's temporary search-sort option without firing change/save.
            if (select) {
                const option = Array.from(select.options).find(item => item.dataset.field !== 'search');
                if (option) option.selected = true;
            }
            const rows = [
                { type: 'character', id: 'b', item: { name: 'Beta', count: 2, fav: true, create_date: '2021-01-01T00:00:00Z' } },
                { type: 'tag', id: 'folder-z', item: { name: 'Zulu' } },
                { type: 'character', id: 'c', item: { name: 'Gamma', count: 10, fav: false, create_date: '2022-01-01T00:00:00Z' } },
                { type: 'tag', id: 'folder-a', item: { name: 'Alpha' } },
                { type: 'character', id: 'a', item: { name: 'Alpha', count: 1, fav: false, create_date: '2020-01-01T00:00:00Z' } },
            ];
            function sorted(field, order, rule = 'string') {
                Object.assign(power_user, { sort_field: field, sort_order: order, sort_rule: rule });
                const copy = rows.slice();
                sortEntitiesList(copy, false, filter);
                return ids(copy);
            }
            result.nameAsc = sorted('name', 'asc');
            result.nameDesc = sorted('name', 'desc');
            result.countAsc = sorted('count', 'asc');
            result.countDesc = sorted('count', 'desc');
            result.favAsc = sorted('fav', 'asc', 'boolean');
            result.favDesc = sorted('fav', 'desc', 'boolean');
            result.dateAsc = sorted('create_date', 'asc');
            result.dateDesc = sorted('create_date', 'desc');
            result.random = sorted('name', 'random');
            return result;
        } finally {
            keys.forEach((key, index) => {
                if (previousTags[index]) Object.defineProperty(tag_map, key, previousTags[index]);
                else delete tag_map[key];
            });
            Object.assign(power_user, sortSettings);
            if (select) Array.from(select.options).forEach((option, index) => { option.selected = selectedOptions[index]; });
        }
    });

    expect(observed.search).toEqual(['a', 'b', 'folder']);
    // The accented query matches inside the name, not only at its beginning.
    expect(observed.searchInteriorAccentedQuery).toEqual(['a']);
    expect(observed.tagsAnd).toEqual(['a', 'b', 'folder', 'other-folder']);
    expect(observed.tagsExcluded).toEqual(['a', 'folder', 'other-folder']);
    expect(observed.favUNDEFINED).toEqual(['a', 'b', 'c', 'folder', 'other-folder']);
    // The string 'false' is truthy in the existing favorite filter.
    expect(observed.favSELECTED).toEqual(['a', 'c', 'folder', 'other-folder']);
    expect(observed.favEXCLUDED).toEqual(['b', 'folder', 'other-folder']);
    expect(observed.combined).toEqual(['a', 'folder']);
    expect(observed.nameAsc).toEqual(['folder-z', 'folder-a', 'a', 'b', 'c']);
    expect(observed.nameDesc).toEqual(['folder-z', 'folder-a', 'c', 'b', 'a']);
    expect(observed.countAsc).toEqual(['folder-z', 'folder-a', 'a', 'b', 'c']);
    expect(observed.countDesc).toEqual(['folder-z', 'folder-a', 'c', 'b', 'a']);
    expect(observed.favAsc).toEqual(['folder-z', 'folder-a', 'c', 'a', 'b']);
    expect(observed.favDesc).toEqual(['folder-z', 'folder-a', 'b', 'c', 'a']);
    expect(observed.dateAsc).toEqual(['folder-z', 'folder-a', 'a', 'b', 'c']);
    expect(observed.dateDesc).toEqual(['folder-z', 'folder-a', 'c', 'b', 'a']);
    expect(observed.random.slice().sort()).toEqual(['a', 'b', 'c', 'folder-a', 'folder-z']);
});
