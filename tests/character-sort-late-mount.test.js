import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from '@jest/globals';
import { runInNewContext } from 'node:vm';
import { loadTsModule } from './helpers/load-ts-module.mjs';

test('loading saved sort selects the matching option without jQuery or requiring a mounted selector', async () => {
    const source = readFileSync(new URL('../public/scripts/power-user.js', import.meta.url), 'utf8');
    const start = source.indexOf('export async function loadPowerUserSettings(');
    const end = source.indexOf('\n}', start) + 2;
    const options = [
        { dataset: { field: 'name', order: 'asc' }, selected: true },
        { dataset: { field: 'date_last_chat', order: 'desc' }, selected: false },
    ];
    let selector = { options };
    const load = runInNewContext(`(${source.slice(start, end).replace('export async function', 'async function')})`, {
        power_user: { sort_field: 'name', sort_order: 'asc' },
        document: { getElementById: id => id === 'character_sort_order' ? selector : null },
        normalizeFrontendFramesSettings: value => value,
        switchReducedMotion() {}, reloadMarkdownProcessor() {}, applyToastrPosition() {},
    });
    await load({ power_user: { sort_field: 'date_last_chat', sort_order: 'desc' } });
    assert.equal(options[1].selected, true);
    selector = null;
    await load({ power_user: { sort_field: 'name', sort_order: 'asc' } });
});

test('temporary search sort selects once, respects manual choices, and restores persisted order on clear', async () => {
    const { updateCharacterSearchSort } = await loadTsModule('app/lib/workspace-drawer-service.ts');
    const search = { hidden: true, selected: false, dataset: { field: 'search', order: 'desc' } };
    const name = { hidden: false, selected: true, dataset: { field: 'name', order: 'asc' } };
    const recent = { hidden: false, selected: false, dataset: { field: 'date_last_chat', order: 'desc' } };
    const selector = { options: [search, name, recent] };
    const saved = { field: 'name', order: 'asc' };
    assert.equal(updateCharacterSearchSort(null, 'cafe', saved), false);
    assert.equal(updateCharacterSearchSort(selector, 'cafe', saved), true);
    assert.equal(search.hidden, false);
    assert.equal(search.selected, true);
    search.selected = false;
    recent.selected = true;
    assert.equal(updateCharacterSearchSort(selector, 'cafe', saved), false);
    assert.equal(recent.selected, true);
    assert.equal(updateCharacterSearchSort(selector, '', saved), false);
    assert.equal(search.hidden, true);
    assert.equal(name.selected, true);
    assert.equal(updateCharacterSearchSort(selector, '', saved), false);
});

test('sort command persists normal selections but not temporary search', () => {
    const source = readFileSync(new URL('../public/scripts/power-user.js', import.meta.url), 'utf8');
    const start = source.indexOf('export function applyCharacterSortSelection(');
    assert.notEqual(start, -1, 'explicit sort command exists');
    const end = source.indexOf('\n}', start) + 2;
    const power_user = { sort_field: 'name', sort_order: 'asc', sort_rule: 'string' };
    let prints = 0, saves = 0, changes = 0;
    const command = runInNewContext(`(${source.slice(start, end).replace('export function', 'function')})`, {
        power_user, markCharacterSortChanged: () => changes++, printCharactersDebounced: () => prints++, saveSettingsDebounced: () => saves++,
    });
    command({ field: 'name', order: 'desc', rule: 'string' });
    assert.deepEqual(power_user, { sort_field: 'name', sort_order: 'desc', sort_rule: 'string' });
    command({ field: 'search' });
    assert.equal(power_user.sort_order, 'desc');
    assert.equal(prints, 2); assert.equal(saves, 2); assert.equal(changes, 1);
});

test('sort reads the selected temporary search option without jQuery, including before mount', () => {
    const source = readFileSync(new URL('../public/scripts/power-user.js', import.meta.url), 'utf8');
    const start = source.indexOf('export function sortEntitiesList(');
    const end = source.indexOf('\n}', start) + 2;
    let searchSelected = false;
    const document = { querySelector: selector => {
        assert.equal(selector, '#character_sort_order option[data-field="search"]:checked');
        return searchSelected ? {} : null;
    } };
    const sort = runInNewContext(`(${source.slice(start, end).replace('export function', 'function')})`, {
        document, power_user: { sort_field: 'name', sort_order: 'asc' },
        entitiesFilter: { getScore: (_type, key) => key === 'character.a' ? 2 : 1 },
        FILTER_TYPES: { SEARCH: 'search' }, sortFunc: (a, b) => a.name.localeCompare(b.name),
    });
    const rows = [{ type: 'character', id: 'a', item: { name: 'A' } }, { type: 'character', id: 'b', item: { name: 'B' } }];
    sort(rows, false);
    assert.deepEqual(rows.map(row => row.id), ['a', 'b']);
    searchSelected = true;
    sort(rows, false);
    assert.deepEqual(rows.map(row => row.id), ['b', 'a']);
});
test('sort selection has no retired document-wide jQuery change owner', () => {
    const source = readFileSync(new URL('../public/scripts/power-user.js', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\.on\('change', '#character_sort_order'/);
});

test('right panel and programmatic toolbar route sort through the same command', () => {
    const panel = readFileSync(new URL('../app/components/right-nav/RightNavPanel.tsx', import.meta.url), 'utf8');
    const shell = readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');
    assert.match(panel, /onCharacterSortChange/);
    assert.match(panel, /selectedOptions\[0\]/);
    assert.match(shell, /onCharacterSortChange:\s*applyCharacterSortSelection/);
    assert.doesNotMatch(shell, /\$\('#character_sort_order'\)\.trigger\('change'\)/);
    const start = shell.indexOf('function verifyCharactersSearchSortRule()');
    const end = shell.indexOf('\n}', start) + 2;
    const searchOwner = shell.slice(start, end);
    assert.match(searchOwner, /updateCharacterSearchSort\(selector, searchTerm/);
    assert.doesNotMatch(searchOwner, /searchOption\.(?:prop|attr|removeAttr)/);
});
