import { describe, expect, test } from '@jest/globals';

import { parseTransitionDurationMs, shouldAnimateOverlayHide } from '../public/scripts/startup-helpers.js';

describe('startup loader helpers', () => {
    test('should parse the longest transition duration in milliseconds', () => {
        expect(parseTransitionDurationMs('0s')).toBe(0);
        expect(parseTransitionDurationMs('120ms')).toBe(120);
        expect(parseTransitionDurationMs('0.2s')).toBe(200);
        expect(parseTransitionDurationMs('75ms, 0.4s')).toBe(400);
    });

    test('should skip animation when startup hide is marked immediate', () => {
        expect(shouldAnimateOverlayHide({ transitionDuration: '0.2s', immediate: false })).toBe(true);
        expect(shouldAnimateOverlayHide({ transitionDuration: '0.2s', immediate: true })).toBe(false);
        expect(shouldAnimateOverlayHide({ transitionDuration: '0s', immediate: false })).toBe(false);
    });
});
