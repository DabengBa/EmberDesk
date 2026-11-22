import { expect, jest, test } from '@jest/globals';

jest.unstable_mockModule('../public/scripts/power-user.js', () => ({ fuzzySearchWorldInfo: jest.fn() }));
jest.unstable_mockModule('../public/scripts/tags.js', () => ({ tag_map: {} }));
jest.unstable_mockModule('../public/scripts/utils.js', () => ({ includesIgnoreCaseAndAccents: jest.fn() }));

const filters = await import('../public/scripts/filters.js');

test('the domain owner exposes one live filter with the injected refresh callback', () => {
    const refresh = jest.fn();
    const filter = filters.initializeEntitiesFilter(refresh);
    expect(filters.entitiesFilter).toBe(filter);
    expect(filters.initializeEntitiesFilter(jest.fn())).toBe(filter);
    filter.setFilterData(filters.FILTER_TYPES.SEARCH, 'Alice');
    expect(filter.getFilterData(filters.FILTER_TYPES.SEARCH)).toBe('Alice');
    expect(refresh).toHaveBeenCalled();
});
