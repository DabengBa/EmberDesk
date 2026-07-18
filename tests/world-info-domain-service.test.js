import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('world info domain and workbench services', () => {
    test('domain module owns pure entry projection helpers without DOM access', async () => {
        const domain = await import(`../public/scripts/world-info-domain.js?t=${Date.now()}`);

        const entry = {
            uid: 3,
            comment: 'Hero',
            key: ['sword', 'blade'],
            keysecondary: ['steel'],
            constant: false,
            disable: false,
            order: 50,
            position: 0,
            content: 'A sharp blade',
            selective: true,
            selectiveLogic: 0,
            probability: 100,
            useProbability: true,
            depth: 4,
            vectorized: true,
        };

        expect(domain.getWorldInfoWorkbenchPositionLabel(entry)).toBe('角色定义前');
        expect(domain.buildWorldInfoWorkbenchEntrySummary(entry)).toMatchObject({
            uid: '3',
            title: 'Hero',
            keywordsSummary: 'sword, blade',
            hasSecondaryKeys: true,
            order: 50,
        });
        const detail = domain.buildWorldInfoWorkbenchEntryDetail(entry);
        expect(detail).toMatchObject({
            uid: '3',
            comment: 'Hero',
            content: 'A sharp blade',
            vectorized: true,
        });
        expect(detail.key).toEqual(['sword', 'blade']);

        const source = read('public/scripts/world-info-domain.js');
        expect(source).not.toMatch(/\$\(|document\.|jQuery|select2/i);
    });

    test('domain sort and filter pipeline does not read workbench DOM', async () => {
        const domain = await import(`../public/scripts/world-info-domain.js?t=${Date.now()}`);

        const entries = [
            { uid: 1, order: 10, comment: 'B', key: [], keysecondary: [], displayIndex: 1 },
            { uid: 2, order: 20, comment: 'A', key: [], keysecondary: [], displayIndex: 0, disable: true },
            { uid: 3, order: 5, comment: 'C', key: [], keysecondary: [], displayIndex: 2, constant: true },
        ];

        const byOrder = domain.sortWorldInfoEntries([...entries], {
            customSort: { sortField: 'order', sortOrder: 'desc', sortRule: null },
        });
        expect(byOrder.map(e => e.uid)).toEqual([2, 1, 3]);

        const byPriority = domain.sortWorldInfoEntries([...entries], {
            customSort: { sortField: 'order', sortOrder: 'desc', sortRule: 'priority' },
        });
        expect(byPriority.map(e => e.uid)).toEqual([3, 1, 2]);

        const filled = domain.addMissingWorldInfoFields([{ uid: 9, key: 'not-array' }]);
        expect(Array.isArray(filled[0].key)).toBe(true);
        expect(filled[0].characterFilter).toEqual({ isExclude: false, names: [], tags: [] });

        const source = read('public/scripts/world-info-domain.js');
        expect(source).not.toContain("$('#world_info_sort_order')");
        expect(source).not.toContain('worldInfoFilter');
    });

    test('workbench service owns selection state and entry list without workbench DOM', async () => {
        const service = await import(`../public/scripts/world-info-workbench-service.js?t=${Date.now()}`);

        const books = {
            Alpha: {
                entries: {
                    1: {
                        uid: 1,
                        comment: 'One',
                        key: ['alpha'],
                        keysecondary: [],
                        order: 10,
                        position: 0,
                        content: 'one body',
                        constant: false,
                        disable: false,
                    },
                    2: {
                        uid: 2,
                        comment: 'Two',
                        key: ['beta'],
                        keysecondary: [],
                        order: 20,
                        position: 1,
                        content: 'two body',
                        constant: true,
                        disable: false,
                    },
                },
            },
            Beta: {
                entries: {
                    5: {
                        uid: 5,
                        comment: 'Five',
                        key: [],
                        keysecondary: [],
                        order: 1,
                        position: 0,
                        content: 'five',
                        constant: false,
                        disable: false,
                    },
                },
            },
        };

        const session = service.createWorldInfoWorkbenchSession({
            worldNames: ['Alpha', 'Beta'],
            selectedWorldInfo: ['Beta'],
            loadWorldInfo: async (name) => structuredClone(books[name] ?? null),
            saveWorldInfo: async (name, data) => {
                books[name] = structuredClone(data);
            },
            getSortOption: () => ({ sortField: 'order', sortOrder: 'desc', sortRule: null }),
        });

        expect(session.getSelectedWorldName()).toBe('');
        await session.selectWorldIndex(0);
        expect(session.getSelectedWorldName()).toBe('Alpha');

        const summaries = await session.getEntrySummaries();
        expect(summaries.map(s => s.uid)).toEqual(['2', '1']);

        session.applySearchQuery('no matching entry');
        expect(await session.getEntrySummaries()).toHaveLength(0);
        await session.selectWorldIndex(1);
        expect(session.getSearchQuery()).toBe('');
        expect((await session.getEntrySummaries()).map(summary => summary.uid)).toEqual(['5']);

        await session.selectEntry('1');
        const detail = await session.getSelectedEntryDetail();
        expect(detail).toBeNull();

        await session.selectWorldIndex(0);
        await session.selectEntry('1');
        const alphaDetail = await session.getSelectedEntryDetail();
        expect(alphaDetail.comment).toBe('One');

        const updated = await session.updateEntryFields('1', { comment: 'One Renamed', content: 'updated' });
        expect(updated).toBe(true);
        expect(books.Alpha.entries[1].comment).toBe('One Renamed');
        expect(books.Alpha.entries[1].content).toBe('updated');

        const snapshot = await session.getFacadeSnapshot();
        expect(snapshot).toMatchObject({
            editorWorldName: 'Alpha',
            hasEditorWorld: true,
            selectedEntryUid: '1',
            globalActiveNames: ['Beta'],
            entryCount: 2,
        });
        expect(snapshot.selectedEntry.comment).toBe('One Renamed');

        const source = read('public/scripts/world-info-workbench-service.js');
        expect(source).not.toMatch(/\$\(|document\.|select2/i);
        expect(source).not.toContain('world-info-body');
    });

    test('world-info facade reuses domain and workbench service modules', () => {
        const source = read('public/scripts/world-info.js');
        expect(source).toContain("from './world-info-domain.js'");
        expect(source).toContain("from './world-info-workbench-service.js'");
        expect(source).toContain('createWorldInfoWorkbenchSession');
        // workbench projection helpers should not re-implement position labels inline once extracted
        expect(source).not.toContain("case world_info_position.before: return '角色定义前'");
    });

    test('workbench service builds React panel state without workbench DOM', async () => {
        const service = await import(`../public/scripts/world-info-workbench-service.js?t=${Date.now()}`);
        const books = {
            Alpha: {
                entries: {
                    1: {
                        uid: 1,
                        comment: 'One',
                        key: ['alpha'],
                        keysecondary: [],
                        order: 10,
                        position: 0,
                        content: 'one body',
                        constant: false,
                        disable: false,
                    },
                },
            },
        };
        const session = service.createWorldInfoWorkbenchSession({
            worldNames: ['Alpha'],
            selectedWorldInfo: ['Alpha'],
            loadWorldInfo: async (name) => structuredClone(books[name] ?? null),
            saveWorldInfo: async () => {},
        });
        await session.selectWorldIndex(0);
        session.applySearchQuery('');
        session.applySortOption('8');
        const state = await session.getReactPanelState();
        expect(state.selectedWorldName).toBe('Alpha');
        expect(state.selectedWorldIndex).toBe('0');
        expect(state.entrySummaries).toHaveLength(1);
        expect(state.sortValue).toBe('8');
        expect(state.canCreateEntry).toBe(true);
        expect(state.worldNames[0]).toMatchObject({ value: '0', label: 'Alpha', selected: true });
        expect(state.sortOptions.some(option => option.value === '0')).toBe(true);

        const pure = service.buildWorldInfoReactPanelState({
            editorWorldName: '',
            entryCount: 0,
            entrySummaries: [],
            selectedEntryUid: '',
            selectedEntry: null,
            hasEditorWorld: false,
            globalActiveNames: [],
            globalActiveCount: 0,
        }, { worldNames: ['Alpha', 'Beta'] });
        expect(pure.selectedWorldIndex).toBe('');
        expect(pure.canCreateEntry).toBe(false);
        expect(pure.worldNames).toHaveLength(2);
    });

    test('workbench service preserves injected fuzzy filters and relevance scores', async () => {
        const service = await import(`../public/scripts/world-info-workbench-service.js?t=${Date.now()}`);
        const entries = {
            1: { uid: 1, comment: 'First', group: 'target', key: [], keysecondary: [], order: 100, position: 0, content: '', constant: false, disable: false },
            2: { uid: 2, comment: 'Second', group: 'target', key: [], keysecondary: [], order: 1, position: 0, content: '', constant: false, disable: false },
            3: { uid: 3, comment: 'Other', group: 'other', key: [], keysecondary: [], order: 50, position: 0, content: '', constant: false, disable: false },
        };
        const session = service.createWorldInfoWorkbenchSession({
            worldNames: ['Alpha'],
            initialSortValue: '8',
            loadWorldInfo: async () => ({ entries }),
            applyFilters: values => values.filter(entry => entry.group === 'target'),
            getSearchScore: uid => ({ 1: 0.8, 2: 0.1 })[uid],
        });

        await session.selectWorldIndex(0);
        expect(session.getSortValue()).toBe('8');
        session.applySearchQuery('target');
        session.applySortOption('14');

        expect((await session.getEntrySummaries()).map(summary => summary.uid)).toEqual(['2', '1']);
        expect((await session.getReactPanelState()).sortOptions.find(option => option.value === '14')).toMatchObject({
            hidden: false,
        });
    });


    test('public world-info barrel re-exports domain and workbench service without re-owning pure projection logic', () => {
        const source = read('public/scripts/world-info.js');
        // Pure projection helpers are thin wrappers over domain module.
        expect(source).toContain('return domainGetWorldInfoWorkbenchPositionLabel(entry);');
        expect(source).toContain('return domainBuildWorldInfoWorkbenchEntrySummary(entry);');
        expect(source).toContain('return domainBuildWorldInfoWorkbenchEntryDetail(entry);');
        expect(source).toContain('return domainSortWorldInfoEntries(data,');
        expect(source).toContain('createWorldInfoWorkbenchSession');
        expect(source).toContain('getWorldInfoReactPanelState');
        // Session is the mutable workbench state owner used by facade APIs.
        expect(source).toContain('function getWorldInfoWorkbenchSession()');
        expect(source).toContain("initialSortValue: String(accountStorage.getItem(SORT_ORDER_KEY) || '0')");
        expect(source).toContain('applyFilters: (entries) => worldInfoFilter.applyFilters(entries)');
        expect(source).toContain('getSearchScore: (uid) => worldInfoFilter.getScore(FILTER_TYPES.WORLD_INFO_SEARCH, uid)');
        expect(source).toContain('export function setWorldInfoGlobalActiveNames(names)');
        expect(source).toContain('await saveWorldInfo(worldName, data, true);');
        expect(source).toContain('await session.selectEntry(entry.uid);');
        expect(source).toContain('session.getFacadeSnapshot()');
        // Shell context remains the only shell dependency seam (no script.js import).
        expect(source).toContain("from './world-info-shell-context.js'");
        expect(source).not.toContain("from '../script.js'");
    });

});
