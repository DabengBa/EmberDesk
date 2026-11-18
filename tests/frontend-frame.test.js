import { describe, expect, test } from '@jest/globals';

import * as frontendFrameModule from '../public/scripts/frontend-frame.js';
import {
    DEFAULT_FRONTEND_FRAME_SETTINGS,
    FRONTEND_CODE_COLLAPSED_ATTR,
    FRONTEND_CODE_TOGGLE_CLASS,
    FRONTEND_FRAME_EVENTS,
    FRONTEND_FRAME_IFRAME_CLASS,
    FRONTEND_FRAME_MARKERS,
    FRONTEND_FRAME_SLOT_ATTR,
    FRONTEND_FRAME_SLOT_CLASS,
    FRONTEND_FRAMES_CHANGED_EVENT,
    computeDepthEligible,
    findFrontendBlocks,
    isFrontendContent,
    mountFrontendFrames,
    normalizeFrontendFramesSettings,
} from '../public/scripts/frontend-frame.js';

describe('frontend-frame detection', () => {
    test('matches the upstream is_frontend marker rule', () => {
        expect(isFrontendContent('<!DOCTYPE html><html><body>hi</body></html>')).toBe(true);
        expect(isFrontendContent('<html><body>hi</body></html>')).toBe(true);
        expect(isFrontendContent('<div></div><head><title>t</title>')).toBe(true);
        expect(isFrontendContent('<div><body>partial</body>')).toBe(true);

        expect(isFrontendContent('const x = 1; console.log(x);')).toBe(false);
        expect(isFrontendContent('<div class="app"></div>')).toBe(false);
        expect(isFrontendContent('')).toBe(false);
        expect(isFrontendContent(null)).toBe(false);
        expect(isFrontendContent(undefined)).toBe(false);
    });

    test('findFrontendBlocks picks only unsuspended frontend pres', () => {
        const frontendPre = {
            textContent: '<html><body>app</body></html>',
            closest: () => null,
        };
        const slottedPre = {
            textContent: '<html><body>app</body></html>',
            closest: (selector) => selector === `.${FRONTEND_FRAME_SLOT_CLASS}` ? {} : null,
        };
        const plainPre = {
            textContent: 'console.log(1);',
            closest: () => null,
        };
        const root = { querySelectorAll: () => [frontendPre, slottedPre, plainPre] };

        expect(findFrontendBlocks(root)).toEqual([frontendPre]);
        expect(findFrontendBlocks(null)).toEqual([]);
        expect(findFrontendBlocks({})).toEqual([]);
    });
});

describe('normalizeFrontendFramesSettings', () => {
    test('returns defaults for missing or malformed values', () => {
        expect(normalizeFrontendFramesSettings(undefined)).toEqual(DEFAULT_FRONTEND_FRAME_SETTINGS);
        expect(normalizeFrontendFramesSettings(null)).toEqual(DEFAULT_FRONTEND_FRAME_SETTINGS);
        expect(normalizeFrontendFramesSettings('yes')).toEqual(DEFAULT_FRONTEND_FRAME_SETTINGS);
        expect(normalizeFrontendFramesSettings([])).toEqual(DEFAULT_FRONTEND_FRAME_SETTINGS);
    });

    test('keeps valid fields and repairs invalid ones', () => {
        const normalized = normalizeFrontendFramesSettings({
            enabled: false,
            depth: 3,
            depth_ignore_hidden: false,
            collapse_code_block: 'all',
            use_blob_url: true,
            skip_highlight: false,
        });
        expect(normalized).toEqual({
            enabled: false,
            depth: 3,
            depth_ignore_hidden: false,
            collapse_code_block: 'all',

            skip_highlight: false,
        });
    });

    test('drops the retired allow_streaming key instead of round-tripping it', () => {
        // A stale `allow_streaming: true` in a stored document must not survive
        // normalization: there is no streaming preview left to enable.
        expect(normalizeFrontendFramesSettings({ allow_streaming: true })).not.toHaveProperty('allow_streaming');
        expect(Object.keys(normalizeFrontendFramesSettings({ allow_streaming: true })).sort()).toEqual([
            'collapse_code_block',
            'depth',
            'depth_ignore_hidden',
            'enabled',
            'skip_highlight',

        ]);
    });

    test('rejects invalid collapse modes and depths', () => {
        expect(normalizeFrontendFramesSettings({ collapse_code_block: 'everything' }).collapse_code_block).toBe('none');
        expect(normalizeFrontendFramesSettings({ collapse_code_block: 'frontend_only' }).collapse_code_block).toBe('none');
        expect(normalizeFrontendFramesSettings({ depth: -2 }).depth).toBe(0);
        expect(normalizeFrontendFramesSettings({ depth: 1.5 }).depth).toBe(0);
    });
});

describe('computeDepthEligible', () => {
    const renderedIds = ['0', '1', '2', '3', '4'];

    test('depth 0 renders every rendered floor', () => {
        for (const id of renderedIds) {
            expect(computeDepthEligible({ messageId: id, renderedIds, depth: 0 })).toBe(true);
        }
    });

    test('depth counts backwards from the newest rendered floor', () => {
        expect(computeDepthEligible({ messageId: '4', renderedIds, depth: 1 })).toBe(true);
        expect(computeDepthEligible({ messageId: '3', renderedIds, depth: 2 })).toBe(true);
        expect(computeDepthEligible({ messageId: '3', renderedIds, depth: 1 })).toBe(false);
        expect(computeDepthEligible({ messageId: '0', renderedIds, depth: 2 })).toBe(false);
    });

    test('unrendered messages are never eligible', () => {
        expect(computeDepthEligible({ messageId: '9', renderedIds, depth: 0 })).toBe(false);
        expect(computeDepthEligible({ messageId: '9', renderedIds: [], depth: 0 })).toBe(false);
    });

    test('depth_ignore_hidden skips system floors in counting and rendering', () => {
        const isSystemById = { '4': true };
        expect(computeDepthEligible({ messageId: '4', renderedIds, isSystemById, depth: 0, depthIgnoreHidden: true })).toBe(false);
        // '3' becomes the newest countable floor
        expect(computeDepthEligible({ messageId: '3', renderedIds, isSystemById, depth: 1, depthIgnoreHidden: true })).toBe(true);
        expect(computeDepthEligible({ messageId: '3', renderedIds, isSystemById, depth: 1, depthIgnoreHidden: false })).toBe(false);
    });
});

describe('mountFrontendFrames guards (DOM-free short-circuits)', () => {
    const emptyHost = { querySelectorAll: () => [] };

    test('returns 0 without a host element', () => {
        expect(mountFrontendFrames(null)).toBe(0);
        expect(mountFrontendFrames(undefined, {})).toBe(0);
    });

    test('returns 0 when disabled or depth-ineligible', () => {
        expect(mountFrontendFrames(emptyHost, { settings: { enabled: false } })).toBe(0);
        expect(mountFrontendFrames(emptyHost, { eligible: false })).toBe(0);
    });
});

describe('first-party frame markers', () => {
    test('marker vocabulary is stable for future mutation-detector whitelisting', () => {
        expect(FRONTEND_FRAME_SLOT_CLASS).toBe('ed-frontend-frame');
        expect(FRONTEND_FRAME_SLOT_ATTR).toBe('data-frontend-slot');
        expect(FRONTEND_FRAME_IFRAME_CLASS).toBe('ed-frontend-frame__iframe');
        expect(FRONTEND_CODE_TOGGLE_CLASS).toBe('ed-code-collapse-toggle');
        expect(FRONTEND_CODE_COLLAPSED_ATTR).toBe('data-ed-code-collapsed');
        expect(FRONTEND_FRAME_MARKERS).toEqual(['html>', '<head>', '<body']);
        expect(FRONTEND_FRAME_EVENTS).toEqual({
            started: 'frontend_frame_render_started',
            ended: 'frontend_frame_render_ended',
        });
        expect(FRONTEND_FRAMES_CHANGED_EVENT).toBe('ed:frontend-frames-changed');
    });
});

describe('retired streaming preview surface', () => {
    test('exports no streaming preview runtime', () => {
        // The streaming preview could not be proven reliable (per-token
        // innerHTML rewrites destroy any iframe inside `.mes_text`, and no path
        // establishes closed-fence DOM provenance), so the whole surface is
        // gone rather than left as a misleading option.
        for (const retiredExport of [
            'FRONTEND_STREAM_HOST_CLASS',
            'findClosedFrontendDocuments',
            'mountStreamingFrames',
            'unmountStreamingFrames',
        ]) {
            expect(frontendFrameModule).not.toHaveProperty(retiredExport);
        }
    });
});
