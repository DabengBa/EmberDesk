import { describe, expect, test } from '@jest/globals';

import {
    DEFAULT_FRONTEND_FRAME_SETTINGS,
    FRONTEND_CODE_COLLAPSED_ATTR,
    FRONTEND_CODE_TOGGLE_CLASS,
    FRONTEND_FRAME_EVENTS,
    FRONTEND_FRAME_IFRAME_CLASS,
    FRONTEND_FRAME_MARKERS,
    FRONTEND_FRAME_SLOT_ATTR,
    FRONTEND_FRAME_SLOT_CLASS,
    FRONTEND_FRAME_TOGGLE_CLASS,
    FRONTEND_FRAMES_CHANGED_EVENT,
    buildFrontendFrameDocument,
    computeDepthEligible,
    findFrontendBlocks,
    isFrontendContent,
    mountFrontendFrames,
    normalizeFrontendFramesSettings,
    rewriteVhExpressions,
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

describe('rewriteVhExpressions', () => {
    test('rewrites stylesheet min-height vh declarations', () => {
        const result = rewriteVhExpressions('.app { min-height: 50vh; } .b { min-height: 100vh }');
        expect(result).toContain('min-height: calc(var(--ed-viewport-height) * 0.5)');
        expect(result).toContain('min-height: var(--ed-viewport-height)');
    });

    test('rewrites inline style attribute min-height', () => {
        const result = rewriteVhExpressions('<div style="min-height: 80vh; color: red"></div>');
        expect(result).toContain('min-height: calc(var(--ed-viewport-height) * 0.8)');
        expect(result).toContain('color: red');
    });

    test('rewrites JS style.minHeight assignments and setProperty', () => {
        const assigned = rewriteVhExpressions("el.style.minHeight = '30vh';");
        expect(assigned).toContain("calc(var(--ed-viewport-height) * 0.3)");
        const viaSetProperty = rewriteVhExpressions('el.style.setProperty("min-height", "40vh");');
        expect(viaSetProperty).toContain('calc(var(--ed-viewport-height) * 0.4)');
    });

    test('leaves non-vh content untouched', () => {
        const source = '<style>.a { min-height: 200px; height: 50vh; }</style>';
        expect(rewriteVhExpressions(source)).toBe(source);
    });
});

describe('buildFrontendFrameDocument', () => {
    const documentHtml = buildFrontendFrameDocument('<html><body><div id="app"></div></body></html>', {
        frameId: 'ed-frame--3--0',
        messageId: '3',
        userAvatarUrl: '/thumbnail?type=persona&file=u.png',
        charAvatarUrl: '/thumbnail?type=avatar&file=c.png',
    });

    test('injects reset styles, viewport meta, and avatar helper classes', () => {
        expect(documentHtml).toContain('content="width=device-width, initial-scale=1.0"');
        expect(documentHtml).toContain('margin:0!important');
        expect(documentHtml).toContain("url('/thumbnail?type=persona&file=u.png')");
        expect(documentHtml).toContain("url('/thumbnail?type=avatar&file=c.png')");
    });

    test('exposes frame identity via EmberDeskFrame meta and predefine', () => {
        expect(documentHtml).toContain('"frameId":"ed-frame--3--0"');
        expect(documentHtml).toContain('"messageId":"3"');
        expect(documentHtml).toContain('window.EmberDeskFrame');
    });

    test('defines both viewport variables and copies shared globals', () => {
        expect(documentHtml).toContain("'--ed-viewport-height'");
        expect(documentHtml).toContain("'--TH-viewport-height'");
        expect(documentHtml).toContain("'_', '$', 'jQuery', 'showdown', 'DOMPurify', 'hljs', 'moment', 'SVGInject'");
    });

    test('places user content after the injected scripts inside body', () => {
        const predefineIndex = documentHtml.indexOf('EmberDeskFrame = Object.freeze');
        const contentIndex = documentHtml.indexOf('<div id="app"></div>');
        expect(predefineIndex).toBeGreaterThan(-1);
        expect(contentIndex).toBeGreaterThan(predefineIndex);
        expect(documentHtml).toContain('</body>\n</html>');
    });

    test('adds a base href only in blob-url mode', () => {
        const blobDoc = buildFrontendFrameDocument('<html></html>', {
            useBlobUrl: true,
            baseHref: 'http://localhost:8000',
        });
        expect(blobDoc).toContain('<base href="http://localhost:8000">');
        const srcdocDoc = buildFrontendFrameDocument('<html></html>', { useBlobUrl: false });
        expect(srcdocDoc).not.toContain('<base href');
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
            allow_streaming: 'yes',
        });
        expect(normalized).toEqual({
            enabled: false,
            depth: 3,
            depth_ignore_hidden: false,
            collapse_code_block: 'all',
            use_blob_url: true,
            skip_highlight: false,
            allow_streaming: false,
        });
    });

    test('rejects invalid collapse modes and depths', () => {
        expect(normalizeFrontendFramesSettings({ collapse_code_block: 'everything' }).collapse_code_block).toBe('frontend_only');
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
        expect(FRONTEND_FRAME_TOGGLE_CLASS).toBe('ed-frontend-frame__toggle');
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
