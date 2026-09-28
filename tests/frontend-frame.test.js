import { describe, expect, test } from '@jest/globals';

import {
    DEFAULT_FRONTEND_FRAME_SETTINGS,
    FRONTEND_CODE_COLLAPSED_ATTR,
    FRONTEND_CODE_TOGGLE_CLASS,
    FRONTEND_FRAME_ALLOWED_EVENTS,
    FRONTEND_FRAME_EVENTS,
    FRONTEND_FRAME_IFRAME_CLASS,
    FRONTEND_FRAME_MARKERS,
    FRONTEND_FRAME_SLOT_ATTR,
    FRONTEND_FRAME_SLOT_CLASS,
    FRONTEND_FRAME_TOGGLE_CLASS,
    FRONTEND_FRAMES_CHANGED_EVENT,
    FRONTEND_STREAM_HOST_CLASS,
    buildFrontendFrameDocument,
    computeDepthEligible,
    createFrameBridge,
    findClosedFrontendDocuments,
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
        const assigned = rewriteVhExpressions('el.style.minHeight = \'30vh\';');
        expect(assigned).toContain('calc(var(--ed-viewport-height) * 0.3)');
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
        expect(documentHtml).toContain('url(\'/thumbnail?type=persona&file=u.png\')');
        expect(documentHtml).toContain('url(\'/thumbnail?type=avatar&file=c.png\')');
    });

    test('exposes frame identity via EmberDeskFrame meta and predefine', () => {
        expect(documentHtml).toContain('"frameId":"ed-frame--3--0"');
        expect(documentHtml).toContain('"messageId":"3"');
        expect(documentHtml).toContain('window.EmberDeskFrame');
    });

    test('defines both viewport variables and copies shared globals', () => {
        expect(documentHtml).toContain('\'--ed-viewport-height\'');
        expect(documentHtml).toContain('\'--TH-viewport-height\'');
        expect(documentHtml).toContain('\'_\', \'$\', \'jQuery\', \'showdown\', \'DOMPurify\', \'hljs\', \'moment\', \'SVGInject\'');
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
        expect(FRONTEND_STREAM_HOST_CLASS).toBe('ed-frontend-stream');
        expect(FRONTEND_FRAME_MARKERS).toEqual(['html>', '<head>', '<body']);
        expect(FRONTEND_FRAME_EVENTS).toEqual({
            started: 'frontend_frame_render_started',
            ended: 'frontend_frame_render_ended',
        });
        expect(FRONTEND_FRAMES_CHANGED_EVENT).toBe('ed:frontend-frames-changed');
    });
});

describe('findClosedFrontendDocuments', () => {
    const doc = '<!DOCTYPE html><html><body>card</body></html>';

    test('extracts closed fenced frontend documents', () => {
        const text = `intro\n\`\`\`html\n${doc}\n\`\`\`\noutro`;
        expect(findClosedFrontendDocuments(text)).toEqual([doc]);
    });

    test('skips fences still open while streaming', () => {
        const openTail = `\`\`\`html\n${doc.slice(0, 20)}`;
        const closedThenOpen = `\`\`\`html\n${doc}\n\`\`\`\n\`\`\`html\n${doc.slice(0, 10)}`;
        expect(findClosedFrontendDocuments(openTail)).toEqual([]);
        expect(findClosedFrontendDocuments(closedThenOpen)).toEqual([doc]);
    });

    test('skips non-frontend fenced blocks and plain text', () => {
        const text = '```js\nconst x = 1;\n```\nno fence here';
        expect(findClosedFrontendDocuments(text)).toEqual([]);
        expect(findClosedFrontendDocuments('')).toEqual([]);
        expect(findClosedFrontendDocuments(null)).toEqual([]);
    });

    test('supports tilde fences and multiple documents in order', () => {
        const docTwo = '<html><head></head><body>second</body></html>';
        const text = `~~~html\n${doc}\n~~~\nmid\n\`\`\`\n${docTwo}\n\`\`\``;
        expect(findClosedFrontendDocuments(text)).toEqual([doc, docTwo]);
    });
});

describe('createFrameBridge', () => {
    function makeEventSource() {
        const listeners = new Map();
        return {
            fired: [],
            on(name, fn) {
                listeners.set(name, [...(listeners.get(name) ?? []), fn]);
            },
            removeListener(name, fn) {
                listeners.set(name, (listeners.get(name) ?? []).filter(entry => entry !== fn));
            },
            emit(name, payload) {
                for (const fn of listeners.get(name) ?? []) {
                    fn(payload);
                }
            },
            count(name) {
                return (listeners.get(name) ?? []).length;
            },
        };
    }

    test('bridges whitelisted events and wraps handlers', () => {
        const eventSource = makeEventSource();
        const bridge = createFrameBridge({ eventSource });
        const seen = [];
        expect(bridge.on('message_received', payload => seen.push(payload))).toBe(true);
        expect(eventSource.count('message_received')).toBe(1);
        eventSource.emit('message_received', { id: 7 });
        expect(seen).toEqual([{ id: 7 }]);
    });

    test('rejects non-whitelisted events and non-function handlers', () => {
        const eventSource = makeEventSource();
        const bridge = createFrameBridge({ eventSource });
        expect(bridge.on('api_request_started', () => {})).toBe(false);
        expect(bridge.on('message_received', 'not-a-function')).toBe(false);
        expect(eventSource.count('api_request_started')).toBe(0);
        expect(FRONTEND_FRAME_ALLOWED_EVENTS).toContain('message_received');
        expect(FRONTEND_FRAME_ALLOWED_EVENTS).not.toContain('api_request_started');
    });

    test('off removes matching subscriptions; dispose removes all', () => {
        const eventSource = makeEventSource();
        const bridge = createFrameBridge({ eventSource });
        const a = () => {};
        const b = () => {};
        bridge.on('message_received', a);
        bridge.on('message_received', b);
        bridge.on('generation_ended', a);
        expect(bridge.off('message_received', a)).toBe(true);
        expect(eventSource.count('message_received')).toBe(1);
        expect(eventSource.count('generation_ended')).toBe(1);
        bridge.dispose();
        expect(bridge.subscriptionCount).toBe(0);
        expect(eventSource.count('message_received')).toBe(0);
        expect(eventSource.count('generation_ended')).toBe(0);
    });

    test('getContext returns a frozen snapshot and survives factory errors', () => {
        const bridge = createFrameBridge({
            getContextSnapshot: () => ({ frameId: 'f1', nested: { x: 1 } }),
        });
        const snapshot = bridge.getContext();
        expect(snapshot).toEqual({ frameId: 'f1', nested: { x: 1 } });
        expect(Object.isFrozen(snapshot)).toBe(true);
        expect(createFrameBridge({ getContextSnapshot: () => { throw new Error('boom'); } }).getContext()).toBe(null);
        expect(createFrameBridge({}).getContext()).toBe(null);
    });

    test('bridges without eventSource still serve getContext', () => {
        const bridge = createFrameBridge({ getContextSnapshot: () => ({ messageId: '3' }) });
        expect(bridge.on('message_received', () => {})).toBe(false);
        expect(bridge.getContext()).toEqual({ messageId: '3' });
    });
});

describe('frame document bridge payload', () => {
    test('injects allowedEvents and EmberDeskFrame bridge calls into the document', () => {
        const doc = buildFrontendFrameDocument('<html><body>x</body></html>', { frameId: 'f9', messageId: '3' });
        expect(doc).toContain('"allowedEvents"');
        expect(doc).toContain('"message_received"');
        expect(doc).toContain('__ED_FRAME_API__');
        expect(doc).toContain('frameId: typeof meta.frameId');
    });
});
