import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('real search-sort update flashes its actual select node and stops the animation', () => {
    const utils = readFileSync(new URL('../public/scripts/utils.js', import.meta.url), 'utf8');
    const script = readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');
    const classes = new Set(), properties = {};
    const select = { nodeType: 1, classList: { add: (...names) => names.forEach(name => classes.add(name)), remove: (...names) => names.forEach(name => classes.delete(name)) },
        style: { setProperty: (name, value) => { properties[name] = value; } }, get offsetWidth() { return 100; } };
    let interval, timeout; const clearInterval = jest.fn();
    const timerContext = { setInterval: fn => { interval = fn; return 1; }, setTimeout: fn => { timeout = fn; }, clearInterval };
    const utilStart = utils.indexOf('export function flashHighlight('), utilEnd = utils.indexOf('\n/**', utilStart);
    const flashHighlight = runInNewContext(`(${utils.slice(utilStart, utilEnd).replace('export ', '')})`, timerContext);
    const requestSync = jest.fn(), update = jest.fn(() => true);
    const context = { document: { getElementById: () => select }, entitiesFilter: { getFilterData: () => 'alice' }, FILTER_TYPES: { SEARCH: 'search' },
        optionsMenuModuleRef: { updateCharacterSearchSort: update }, power_user: { sort_field: 'name', sort_order: 'asc' },
        $: () => { throw new Error('search sort highlight must not use jQuery'); }, flashHighlight,
        updateCharacterLibraryToolbarOwnerState: jest.fn(), getSelectedCharacterLibrarySortValue: () => '1:name', syncReactCharacterLibraryToolbarState: requestSync };
    const start = script.indexOf('function verifyCharactersSearchSortRule()'), end = script.indexOf('\n/**', start);
    const verify = runInNewContext(`(${script.slice(start, end)})`, context);
    verify(); expect(update).toHaveBeenCalledWith(select, 'alice', { field: 'name', order: 'asc' });
    expect(classes).toEqual(new Set(['flash', 'animated'])); expect(properties['--animation-duration']).toBe('2000ms');
    interval(); expect(classes).toEqual(new Set(['flash', 'animated'])); timeout();
    expect(classes.size).toBe(0); expect(properties['--animation-duration']).toBe(''); expect(clearInterval).toHaveBeenCalledWith(1);
    expect(requestSync).toHaveBeenCalledTimes(1);
});

test('shared highlight still supports the existing jquery collection callers', () => {
    const source = readFileSync(new URL('../public/scripts/utils.js', import.meta.url), 'utf8');
    const start = source.indexOf('export function flashHighlight('), end = source.indexOf('\n/**', start);
    let repeat, finish; const clearInterval = jest.fn();
    const flash = runInNewContext(`(${source.slice(start, end).replace('export ', '')})`, { setInterval: fn => { repeat = fn; return 7; }, setTimeout: fn => { finish = fn; }, clearInterval });
    const collection = { 0: { offsetWidth: 5 }, addClass: jest.fn(), removeClass: jest.fn(), css: jest.fn() };
    flash(collection, 5000); repeat(); finish();
    expect(collection.addClass).toHaveBeenCalledTimes(2); expect(collection.removeClass).toHaveBeenCalledTimes(2);
    expect(collection.css.mock.calls).toEqual([['--animation-duration', '2000ms'], ['--animation-duration', '']]);
    expect(clearInterval).toHaveBeenCalledWith(7);
});
