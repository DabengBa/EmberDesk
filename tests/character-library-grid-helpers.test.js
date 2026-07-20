import { describe, expect, test } from '@jest/globals';
import {
    getCharacterLibraryGridColumnCount,
    getCharacterLibraryGridRowRange,
    getCharacterLibraryGridRowCount,
} from '../app/lib/character-library-grid-helpers.js';

describe('character library grid virtualization', () => {
    test('packs a narrow library drawer into bounded card rows', () => {
        expect(getCharacterLibraryGridColumnCount(104)).toBe(1);
        expect(getCharacterLibraryGridColumnCount(216)).toBe(2);
        expect(getCharacterLibraryGridColumnCount(328)).toBe(3);
        expect(getCharacterLibraryGridColumnCount(1200)).toBe(3);
    });

    test('maps card rows to contiguous entity ranges', () => {
        expect(getCharacterLibraryGridRowCount(7, 3)).toBe(3);
        expect(getCharacterLibraryGridRowRange(0, 3)).toEqual({ start: 0, end: 3 });
        expect(getCharacterLibraryGridRowRange(1, 3)).toEqual({ start: 3, end: 6 });
        expect(getCharacterLibraryGridRowRange(2, 3)).toEqual({ start: 6, end: 9 });
    });
});
