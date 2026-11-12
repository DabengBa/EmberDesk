import fs from 'node:fs';
import vm from 'node:vm';
import { describe, expect, test } from '@jest/globals';
import { createCharacterTagsService } from '../public/scripts/character-tags-service.js';

describe('character tag service', () => {
    test('folder filtering hides closed-folder members unless opened and keeps search matches', () => {
        const service = createCharacterTagsService({ getTags: () => [], getMap: () => ({}), getCharacters: () => [],
            equalNames: (a, b) => a === b, newTag: name => ({ id: name, name }), changed: () => {} });        const folder = { type: 'tag', id: 'f', item: { id: 'f', folder_type: 'CLOSED' }, entities: [] };
        const character = { type: 'character', id: 'a' };
        const data = { selected: [], excluded: [] };
        const isTagged = (entity, id) => entity === character && id === 'f';
        expect(service.filterEntities([folder, character], data, { globalDisplayFilters: true, search: 'a', isTagged })).toEqual([folder]);
        expect(service.filterEntities([folder, character], { ...data, selected: ['f'] }, { globalDisplayFilters: true, isTagged })).toEqual([character]);
    });
    test('draft ids remain separate from card tags and are copied defensively', () => {
        const tags = [{ id: 't', name: 'Global' }];
        const map = {};
        const service = createCharacterTagsService({ getTags: () => tags, getMap: () => map,
            getCharacters: () => [{ avatar: 'a', data: { tags: ['card-only'] } }],
            equalNames: (a, b) => a === b, newTag: name => ({ id: name, name }), changed: () => {} });
        expect(service.getDraft()).toEqual([]);
        service.setDraft(['t', 'missing', 't']);
        const draft = service.getDraft();
        draft.push('external');
        service.replace('a', service.getDraft());
        expect(map.a).toEqual(['t']);
        service.setDraft([]);
        expect(service.getDraft()).toEqual([]);
    });
    test('filter state is derived without DOM, preserving unrelated selections', () => {
        const service = createCharacterTagsService({ getTags: () => [], getMap: () => ({}), getCharacters: () => [],
            equalNames: (a, b) => a === b, newTag: name => ({ id: name, name }), changed: () => {} });
        const initial = { selected: ['a', 'b'], excluded: ['c'] };
        expect(service.filterState(initial, 'b', 'EXCLUDED')).toEqual({ selected: ['a'], excluded: ['c', 'b'] });
        expect(service.filterState(initial, 'a', 'UNDEFINED')).toEqual({ selected: ['b'], excluded: ['c'] });
        expect(initial.selected).toEqual(['a', 'b']);
    });

    test('bulk captured avatars skip deleted characters even when their stale map remains', () => {
        const tags = [{ id: 't', name: 'Tag' }];
        const map = { a: [], b: [] };
        const characters = [{ avatar: 'a' }, { avatar: 'b' }];
        const service = createCharacterTagsService({ getTags: () => tags, getMap: () => map, getCharacters: () => characters,
            equalNames: (a, b) => a === b, newTag: name => ({ id: name, name }), changed: () => {} });
        const captured = characters.map(c => c.avatar);
        characters.splice(0, 1);
        characters.push({ avatar: 'c' });
        service.assign(captured, ['t']);
        expect(map).toEqual({ a: [], b: ['t'] });
    });
    test('management, copy, rename keys and sort operate on the live model', () => {
        const tags = [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }, { id: 'c', name: 'Charlie' }];
        const map = { old: ['a', 'b'], other: ['b'] };
        const service = createCharacterTagsService({ getTags: () => tags, getMap: () => map,
            getCharacters: () => [{ avatar: 'old' }, { avatar: 'other' }],
            equalNames: (a, b) => a.toLowerCase() === b.toLowerCase(), newTag: name => ({ id: name, name }), changed: () => {} });
        expect(service.rename('a', 'beta')).toBe(false);
        expect(service.rename('a', 'Apple')).toBe(true);
        service.setProperty('a', 'color', 'red');
        service.reorder(['c', 'a', 'b']);
        expect(service.sorted(tags, 'manual').map(t => t.id)).toEqual(['c', 'a', 'b']);
        expect(service.sorted(tags, 'by_entries').map(t => t.id)).toEqual(['b', 'a', 'c']);
        service.copyKey('old', 'other');
        expect(map.other).toEqual(['b', 'a']);
        service.renameKey('old', 'new');
        expect(map.new).toEqual(['a', 'b']);
        expect(map.old).toBeUndefined();
        service.deleteTag('a', 'b');
        expect(tags.map(t => t.id)).toEqual(['b', 'c']);
        expect(map.new).toEqual(['b']);
        expect(map.other).toEqual(['b']);
    });

    test('overwrite restore resolves both id and name collisions and remaps every existing reference', () => {
        const tags = [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }];
        const map = { x: ['a', 'b'], y: ['b'] };
        const service = createCharacterTagsService({ getTags: () => tags, getMap: () => map,
            getCharacters: () => [{ avatar: 'x' }, { avatar: 'y' }],
            equalNames: (a, b) => a.toLowerCase() === b.toLowerCase(), newTag: name => ({ id: name, name }), changed: () => {} });
        service.restore({ tags: [{ id: 'a', name: 'Beta', color: 'red' }], tag_map: { x: ['a'] } }, true);
        expect(tags).toEqual([{ id: 'a', name: 'Beta', color: 'red' }]);
        expect(map).toEqual({ x: ['a'], y: ['a'] });
    });

    test('restores matching names with existing ids and warns for invalid references', () => {
        const tags = [{ id: 'old', name: 'Existing' }];
        const map = { a: [] };
        let notifications = 0;
        const service = createCharacterTagsService({
            getTags: () => tags, getMap: () => map, getCharacters: () => [{ avatar: 'a' }],
            equalNames: (a, b) => a.toLowerCase() === b.toLowerCase(),
            newTag: name => ({ id: name, name }), changed: () => notifications++,
        });
        const result = service.restore({ tags: [{ id: 'new', name: 'existing' }, {}], tag_map: { a: ['new', 'missing'], gone: ['new'] } });
        expect(result.valid).toBe(true);
        expect(result.warnings).toHaveLength(3);
        expect(map.a).toEqual(['old']);
        expect(notifications).toBe(1);
        expect(service.restore({ tags: [], tag_map: null }).valid).toBe(false);
    });
    test('uses live avatar keys and persists only effective bulk edits', () => {
        const tags = [{ id: 'one', name: 'One' }, { id: 'two', name: 'Two' }];
        const map = { a: ['one'], b: ['one', 'two'] };
        const characters = [{ avatar: 'a' }, { avatar: 'b' }];
        let notifications = 0;
        const service = createCharacterTagsService({
            getTags: () => tags, getMap: () => map, getCharacters: () => characters,
            equalNames: (a, b) => a.toLowerCase() === b.toLowerCase(),
            newTag: name => ({ id: name, name }), changed: () => notifications++,
        });
        const captured = characters.map(character => character.avatar);
        characters.reverse();
        expect(service.mutual(captured).map(tag => tag.id)).toEqual(['one']);
        expect(service.remove(captured, ['one'])).toBe(true);
        expect(map).toEqual({ a: [], b: ['two'] });
        expect(service.assign(captured, ['two', 'missing'])).toBe(true);
        expect(service.assign(captured, ['two'])).toBe(false);
        expect(service.reset(captured)).toBe(true);
        expect(map).toEqual({ a: [], b: [] });
        expect(notifications).toBe(3);
        expect(service.create('oNe')).toBe(tags[0]);
    });
});

describe('legacy tag association regression', () => {
    test('removing an absent tag does not delete the last association', () => {
        const source = fs.readFileSync(new URL('../public/scripts/tags.js', import.meta.url), 'utf8');
        const start = source.indexOf('function removeTagFromMap(');
        const end = source.indexOf('\nfunction findTag(', start);
        expect(start).toBeGreaterThanOrEqual(0);
        expect(end).toBeGreaterThan(start);
        const tagMap = { 'avatar.png': ['kept'] };
        const remove = vm.runInNewContext(`(${source.slice(start, end)})`, {
            characterTagsService: createCharacterTagsService({
                getTags: () => [{ id: 'kept', name: 'Kept' }], getMap: () => tagMap,
                getCharacters: () => [{ avatar: 'avatar.png' }], equalNames: (a, b) => a === b,
                newTag: name => ({ id: name, name }), changed: () => {},
            }),
            getTagKeyForEntity: key => key,
            getTagKey: () => null,
        });

        expect(remove('missing', 'avatar.png')).toBe(false);
        expect(tagMap['avatar.png']).toEqual(['kept']);
    });
});

describe('tag runtime snapshots', () => {
    test('snapshot references remain stable until published and unsubscribe stops notifications', () => {
        const source = fs.readFileSync(new URL('../public/scripts/tags.js', import.meta.url), 'utf8');
        const start = source.indexOf('function createTagRuntime(');
        const end = source.indexOf('\nfunction getTagViews(', start);
        const context = vm.createContext({ tagRevision: 0, tagListeners: new Set() });
        const factory = vm.runInContext(`(${source.slice(start, end)})`, context);
        let count = 0;
        const runtime = factory(() => ({ value: count }), {});
        const first = runtime.getSnapshot();
        expect(runtime.getSnapshot()).toBe(first);
        const unsubscribe = runtime.subscribe(() => count++);
        context.tagRevision++;
        for (const listener of context.tagListeners) listener();
        expect(runtime.getSnapshot()).not.toBe(first);
        expect(runtime.getSnapshot().value).toBe(1);
        unsubscribe();
        for (const listener of context.tagListeners) listener();
        expect(count).toBe(1);
    });
});

describe('folder navigation', () => {
    test('opens folders and goes back through filter commands without reading React DOM', () => {
        const source = fs.readFileSync(new URL('../public/scripts/tags.js', import.meta.url), 'utf8');
        const start = source.indexOf('function chooseBogusFolder(');
        const end = source.indexOf('\n/**', start);
        const calls = [];
        const choose = vm.runInNewContext(`(${source.slice(start, end)})`, {
            $: () => { throw new Error('folder navigation must not read React DOM'); },
            getOpenBogusFolders: () => [{ id: 'first' }, { id: 'last' }],
            setCharacterTagFilterState: (...args) => calls.push(args),
            FILTER_STATES: { SELECTED: { key: 'SELECTED' } },
            DEFAULT_FILTER_STATE: 'UNDEFINED',
            entitiesFilter: {},
        });

        choose(null, 'first');
        choose(null, 'back');
        expect(calls.map(call => call.slice(0, 2))).toEqual([
            ['first', 'SELECTED'], ['last', 'UNDEFINED'],
        ]);
    });
});
