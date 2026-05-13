import { describe, expect, test } from '@jest/globals';

import {
    buildWorldInfoReplayState,
    getCharacterCardTagId,
    resolveTextGenDeferredReplay,
} from '../public/scripts/deferred-panel-replays.js';

describe('deferred panel replay helpers', () => {
    test('rehydrates textgen panel state even when another API is active', () => {
        expect(resolveTextGenDeferredReplay({ mainApi: 'kobold' })).toEqual({
            shouldHydrateSettings: true,
            shouldBindPanelControls: true,
            shouldValidateSamplers: true,
            shouldSyncMainApiVisibility: false,
        });
    });

    test('syncs textgen visibility when text completion is the active API', () => {
        expect(resolveTextGenDeferredReplay({ mainApi: 'textgenerationwebui' })).toEqual({
            shouldHydrateSettings: true,
            shouldBindPanelControls: true,
            shouldValidateSamplers: true,
            shouldSyncMainApiVisibility: true,
        });
    });

    test('rebuilds world info editor options from persisted names and selections', () => {
        expect(buildWorldInfoReplayState({
            worldNames: ['alpha', 'beta'],
            selectedWorldInfo: ['beta'],
            editorSelectedName: 'alpha',
        })).toEqual({
            globalOptions: [
                { text: 'alpha', value: '0', selected: false },
                { text: 'beta', value: '1', selected: true },
            ],
            editorOptions: [
                { text: 'alpha', value: '0', selected: true },
                { text: 'beta', value: '1', selected: false },
            ],
        });
    });

    test('keeps character card inline tags on canonical ids', () => {
        expect(getCharacterCardTagId('tag-123')).toBe('tag-123');
    });
});
