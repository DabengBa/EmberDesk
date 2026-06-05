import { describe, expect, test } from '@jest/globals';

import {
    buildVariantComparison,
    compareScenarioPayloads,
    summarizeScenarioPayload,
    summarizeInteractionSamples,
    validateInteractionPath,
} from '../src/interaction-performance-report.js';

describe('interaction performance report helpers', () => {
    test('summarizes browser and server timing distributions', () => {
        const summary = summarizeInteractionSamples([
            { timing: { browserMs: 12, serverRouteMs: 4 } },
            { timing: { browserMs: 18, serverRouteMs: 6 } },
            { timing: { browserMs: 24, serverRouteMs: 10 } },
            { timing: { browserMs: 30, serverRouteMs: 12 } },
        ]);

        expect(summary).toEqual({
            sampleCount: 4,
            browserMs: {
                median: 21,
                p90: 30,
                min: 12,
                max: 30,
            },
            serverRouteMs: {
                median: 8,
                p90: 12,
                min: 4,
                max: 12,
            },
            deleteFlowMs: {
                median: null,
                p90: null,
                min: null,
                max: null,
            },
            deleteRequestMs: {
                median: null,
                p90: null,
                min: null,
                max: null,
            },
            preDeleteChatLookupMs: {
                median: null,
                p90: null,
                min: null,
                max: null,
            },
            groupsRefreshMs: {
                median: null,
                p90: null,
                min: null,
                max: null,
            },
            characterPrintMs: {
                median: null,
                p90: null,
                min: null,
                max: null,
            },
            characterPageLoadedLagMs: {
                median: null,
                p90: null,
                min: null,
                max: null,
            },
            firstListItemVisibleMs: {
                median: null,
                p90: null,
                min: null,
                max: null,
            },
            firstListItemClickableMs: {
                median: null,
                p90: null,
                min: null,
                max: null,
            },
            filterInputToPageLoadedMs: {
                median: null,
                p90: null,
                min: null,
                max: null,
            },
            filterInputToBusyClearMs: {
                median: null,
                p90: null,
                min: null,
                max: null,
            },
            paginationScrollRestored: {
                sampleCount: 0,
                trueCount: 0,
                falseCount: 0,
                allTrue: null,
            },
        });
    });

    test('summarizes character-library UX metrics', () => {
        const summary = summarizeInteractionSamples([
            {
                timing: {
                    firstListItemVisibleMs: 42,
                    firstListItemClickableMs: 55,
                    characterPageLoadedLagMs: 65,
                    filterInputToPageLoadedMs: 130,
                    filterInputToBusyClearMs: 118,
                    paginationScrollRestored: true,
                },
            },
            {
                timing: {
                    firstListItemVisibleMs: 50,
                    firstListItemClickableMs: 64,
                    characterPageLoadedLagMs: 80,
                    filterInputToPageLoadedMs: 160,
                    filterInputToBusyClearMs: 140,
                    paginationScrollRestored: false,
                },
            },
        ]);

        expect(summary.firstListItemVisibleMs.median).toBe(46);
        expect(summary.firstListItemClickableMs.median).toBe(59.5);
        expect(summary.characterPageLoadedLagMs.median).toBe(72.5);
        expect(summary.filterInputToPageLoadedMs.median).toBe(145);
        expect(summary.filterInputToBusyClearMs.median).toBe(129);
        expect(summary.paginationScrollRestored).toEqual({
            sampleCount: 2,
            trueCount: 1,
            falseCount: 1,
            allTrue: false,
        });
    });

    test('builds an on/off variant comparison with deltas', () => {
        const comparison = buildVariantComparison(
            [
                { timing: { browserMs: 10, serverRouteMs: 4 } },
                { timing: { browserMs: 14, serverRouteMs: 5 } },
            ],
            [
                { timing: { browserMs: 20, serverRouteMs: 8 } },
                { timing: { browserMs: 24, serverRouteMs: 10 } },
            ],
        );

        expect(comparison.sqliteOn.browserMs.median).toBe(12);
        expect(comparison.sqliteOff.browserMs.median).toBe(22);
        expect(comparison.delta.browserMsMedian).toEqual({
            absoluteMs: -10,
            relativePct: -45.45,
        });
        expect(comparison.delta.serverRouteMsMedian).toEqual({
            absoluteMs: -4.5,
            relativePct: -50,
        });
    });

    test('builds variant comparison deltas for character-library UX timing metrics', () => {
        const comparison = buildVariantComparison(
            [
                { timing: { firstListItemVisibleMs: 40, firstListItemClickableMs: 52, filterInputToBusyClearMs: 120 } },
                { timing: { firstListItemVisibleMs: 44, firstListItemClickableMs: 58, filterInputToBusyClearMs: 140 } },
            ],
            [
                { timing: { firstListItemVisibleMs: 80, firstListItemClickableMs: 104, filterInputToBusyClearMs: 200 } },
                { timing: { firstListItemVisibleMs: 88, firstListItemClickableMs: 116, filterInputToBusyClearMs: 220 } },
            ],
        );

        expect(comparison.sqliteOn.firstListItemVisibleMs.median).toBe(42);
        expect(comparison.sqliteOn.firstListItemClickableMs.median).toBe(55);
        expect(comparison.delta.firstListItemVisibleMsMedian).toEqual({
            absoluteMs: -42,
            relativePct: -50,
        });
        expect(comparison.delta.firstListItemClickableMsMedian).toEqual({
            absoluteMs: -55,
            relativePct: -50,
        });
        expect(comparison.delta.filterInputToBusyClearMsMedian).toEqual({
            absoluteMs: -80,
            relativePct: -38.1,
        });
    });

    test('compares character list payloads by semantic fields only', () => {
        const result = compareScenarioPayloads(
            'characters_all_warm_repeat',
            [
                {
                    avatar: 'alpha.png',
                    name: 'Alpha',
                    chat: 'Alpha - last',
                    fav: false,
                    chat_size: 55,
                    date_last_chat: 100,
                    data_size: 200,
                    date_added: 111,
                    create_date: '2026-05-10T00:00:00.000Z',
                    json_data: 'on-side-extra',
                    tags: ['a'],
                    shallow: false,
                    data: {
                        name: 'Alpha',
                        character_version: '2.0',
                        creator: 'tester',
                        creator_notes: 'notes',
                        tags: ['a'],
                        extensions: {
                            fav: false,
                            world: '',
                        },
                    },
                },
            ],
            [
                {
                    avatar: 'alpha.png',
                    name: 'Alpha',
                    chat: 'Alpha - last',
                    fav: false,
                    chat_size: 55,
                    date_last_chat: 100,
                    data_size: 200,
                    date_added: 999,
                    create_date: '2026-05-11T00:00:00.000Z',
                    json_data: 'off-side-extra',
                    tags: ['a'],
                    shallow: false,
                    data: {
                        name: 'Alpha',
                        character_version: '2.0',
                        creator: 'tester',
                        creator_notes: 'notes',
                        tags: ['a'],
                        extensions: {
                            fav: false,
                            world: '',
                        },
                    },
                },
            ],
        );

        expect(result.matches).toBe(true);
    });

    test('compares character get payloads including derived lorebook state', () => {
        const matches = compareScenarioPayloads(
            'characters_get_warm_repeat',
            {
                avatar: 'legacy.png',
                name: 'Legacy',
                chat: 'Legacy - last',
                fav: false,
                chat_size: 10,
                date_last_chat: 20,
                data_size: 30,
                json_data: 'ignored',
                data: {
                    name: 'Legacy',
                    character_version: '2.0',
                    creator: 'tester',
                    creator_notes: 'notes',
                    tags: [],
                    extensions: { fav: false, world: 'lore' },
                    character_book: {
                        entries: [
                            {
                                uid: 1,
                                key: 'topic',
                                content: 'same lore',
                                order: 0,
                                position: 0,
                                disable: false,
                                selective: false,
                            },
                        ],
                    },
                },
            },
            {
                avatar: 'legacy.png',
                name: 'Legacy',
                chat: 'Legacy - last',
                fav: false,
                chat_size: 10,
                date_last_chat: 20,
                data_size: 30,
                data: {
                    name: 'Legacy',
                    character_version: '2.0',
                    creator: 'tester',
                    creator_notes: 'notes',
                    tags: [],
                    extensions: { fav: false, world: 'lore' },
                    character_book: {
                        entries: [
                            {
                                uid: 1,
                                key: 'topic',
                                content: 'same lore',
                                order: 0,
                                position: 0,
                                disable: false,
                                selective: false,
                            },
                        ],
                    },
                },
            },
        );

        const mismatch = compareScenarioPayloads(
            'characters_get_warm_repeat',
            {
                avatar: 'legacy.png',
                name: 'Legacy',
                chat: 'Legacy - last',
                fav: false,
                chat_size: 10,
                date_last_chat: 20,
                data_size: 30,
                data: {
                    name: 'Legacy',
                    character_version: '2.0',
                    creator: 'tester',
                    creator_notes: 'notes',
                    tags: [],
                    extensions: { fav: false, world: 'lore' },
                    character_book: {
                        entries: [
                            {
                                uid: 1,
                                key: 'topic',
                                content: 'old lore',
                                order: 0,
                                position: 0,
                                disable: false,
                                selective: false,
                            },
                        ],
                    },
                },
            },
            {
                avatar: 'legacy.png',
                name: 'Legacy',
                chat: 'Legacy - last',
                fav: false,
                chat_size: 10,
                date_last_chat: 20,
                data_size: 30,
                data: {
                    name: 'Legacy',
                    character_version: '2.0',
                    creator: 'tester',
                    creator_notes: 'notes',
                    tags: [],
                    extensions: { fav: false, world: 'lore' },
                    character_book: {
                        entries: [
                            {
                                uid: 1,
                                key: 'topic',
                                content: 'new lore',
                                order: 0,
                                position: 0,
                                disable: false,
                                selective: false,
                            },
                        ],
                    },
                },
            },
        );

        expect(matches.matches).toBe(true);
        expect(mismatch.matches).toBe(false);
    });

    test('validates expected indexed versus filesystem route paths', () => {
        expect(validateInteractionPath(
            'characters_all_warm_repeat',
            'sqlite_on',
            'characters_all:indexed',
        )).toEqual({
            expectedPath: 'characters_all:indexed',
            matches: true,
        });

        expect(validateInteractionPath(
            'characters_get_warm_repeat',
            'sqlite_off',
            'characters_get:indexed',
        )).toEqual({
            expectedPath: 'characters_get:filesystem',
            matches: false,
        });

        expect(validateInteractionPath(
            'character_delete_refresh_ui',
            'sqlite_on',
            null,
        )).toEqual({
            expectedPath: null,
            matches: true,
        });

        expect(validateInteractionPath(
            'character_library_first_interactive',
            'sqlite_off',
            null,
        )).toEqual({
            expectedPath: null,
            matches: true,
        });
    });

    test('compares delete-refresh payloads without timing noise', () => {
        const result = compareScenarioPayloads(
            'character_delete_refresh_ui',
            {
                deletedAvatar: 'alpha.png',
                characterCountBefore: 180,
                characterCountAfter: 179,
                groupCountAfter: 0,
                renderedCharacterCount: 179,
                renderedGroupCount: 0,
                metrics: {
                    deleteFlowMs: 120,
                    deleteRequestMs: 12,
                    preDeleteChatLookupMs: 14,
                    groupsRefreshMs: 3,
                    characterPrintMs: 88,
                    characterPageLoadedLagMs: 5,
                },
            },
            {
                deletedAvatar: 'alpha.png',
                characterCountBefore: 180,
                characterCountAfter: 179,
                groupCountAfter: 0,
                renderedCharacterCount: 179,
                renderedGroupCount: 0,
                metrics: {
                    deleteFlowMs: 220,
                    deleteRequestMs: 20,
                    preDeleteChatLookupMs: 18,
                    groupsRefreshMs: 4,
                    characterPrintMs: 90,
                    characterPageLoadedLagMs: 8,
                },
            },
        );

        expect(result.matches).toBe(true);
        expect(result.normalizedOn).toEqual({
            deletedAvatar: 'alpha.png',
            characterCountBefore: 180,
            characterCountAfter: 179,
            groupCountAfter: 0,
            renderedCharacterCount: 179,
            renderedGroupCount: 0,
        });
    });

    test('summarizes delete-refresh payloads with flow metrics', () => {
        const summary = summarizeScenarioPayload(
            'character_delete_refresh_ui',
            {
                deletedAvatar: 'alpha.png',
                characterCountBefore: 180,
                characterCountAfter: 179,
                groupCountAfter: 0,
                renderedCharacterCount: 179,
                renderedGroupCount: 0,
                metrics: {
                    deleteFlowMs: 120,
                    deleteRequestMs: 12,
                    preDeleteChatLookupMs: 14,
                    groupsRefreshMs: 3,
                    characterPrintMs: 88,
                    characterPageLoadedLagMs: 5,
                },
            },
        );

        expect(summary).toEqual({
            deletedAvatar: 'alpha.png',
            characterCountBefore: 180,
            characterCountAfter: 179,
            groupCountAfter: 0,
            renderedCharacterCount: 179,
            renderedGroupCount: 0,
            metrics: {
                deleteFlowMs: 120,
                deleteRequestMs: 12,
                preDeleteChatLookupMs: 14,
                groupsRefreshMs: 3,
                characterPrintMs: 88,
                characterPageLoadedLagMs: 5,
            },
        });
    });

    test('compares character-library UX payloads without timing noise', () => {
        const result = compareScenarioPayloads(
            'character_library_filter_response',
            {
                query: 'Perf',
                renderedCharacterCount: 12,
                busyCleared: true,
                pageLoaded: true,
                metrics: {
                    filterInputToBusyClearMs: 120,
                    filterInputToPageLoadedMs: 140,
                },
            },
            {
                query: 'Perf',
                renderedCharacterCount: 12,
                busyCleared: true,
                pageLoaded: true,
                metrics: {
                    filterInputToBusyClearMs: 220,
                    filterInputToPageLoadedMs: 260,
                },
            },
        );

        expect(result.matches).toBe(true);
        expect(result.normalizedOn).toEqual({
            query: 'Perf',
            renderedCharacterCount: 12,
            renderedGroupCount: 0,
            firstListItemClickable: false,
            busyCleared: true,
            pageLoaded: true,
            paginationScrollRestored: null,
        });
    });
});
