import { describe, expect, test } from '@jest/globals';

import {
    buildWorldInfoReplayState,
    getCharacterCardTagId,
} from '../public/scripts/deferred-panel-replays.js';

describe('deferred panel replay helpers', () => {
    test('rebuilds world info editor options from persisted names and selections', () => {
        expect(buildWorldInfoReplayState({
            worldNames: ['alpha', 'beta'],
            selectedWorldInfo: ['beta'],
            editorSelectedName: 'alpha',
        })).toEqual({
            globalOptions: [
                { text: 'alpha', value: 'alpha', selected: false },
                { text: 'beta', value: 'beta', selected: true },
            ],
            editorOptions: [
                { text: 'alpha', value: 'alpha', selected: true },
                { text: 'beta', value: 'beta', selected: false },
            ],
        });
    });

    test('keeps character card inline tags on canonical ids', () => {
        expect(getCharacterCardTagId('tag-123')).toBe('tag-123');
    });
});
