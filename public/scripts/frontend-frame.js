/**
 * Message frontend frames: renders fenced code blocks that contain a complete
 * HTML document as live same-origin srcdoc iframes inside `.mes_text`.
 *
 * This is a first-party reimplementation of the JS-Slash-Runner "frontend
 * rendering" behavior contract (detection rule, slot wrapping, viewport-height
 * rewriting, avatar helper classes, auto-height). No upstream code is vendored.
 *
 * The module is deliberately STATELESS and import-free: the workspace React
 * bundle inlines its own copy of anything it imports, so all runtime facts
 * (settings, eligibility, avatars, event emission) arrive via the `ctx`
 * argument and all teardown state lives in DOM markers. Pure helpers stay
 * DOM-free so they are unit-testable under the node Jest environment.
 */

export const FRONTEND_FRAME_MARKERS = Object.freeze(['html>', '<head>', '<body']);

export const FRONTEND_FRAME_SLOT_CLASS = 'ed-frontend-frame';
export const FRONTEND_FRAME_SLOT_ATTR = 'data-frontend-slot';
export const FRONTEND_FRAME_IFRAME_CLASS = 'ed-frontend-frame__iframe';
export const FRONTEND_FRAME_TOGGLE_CLASS = 'ed-frontend-frame__toggle';
export const FRONTEND_CODE_TOGGLE_CLASS = 'ed-code-collapse-toggle';
export const FRONTEND_CODE_COLLAPSED_ATTR = 'data-ed-code-collapsed';

export const FRONTEND_FRAME_EVENTS = Object.freeze({
    started: 'frontend_frame_render_started',
    ended: 'frontend_frame_render_ended',
});

/** Document-level signal asking mounted rows to re-run their frame scan. */
export const FRONTEND_FRAMES_CHANGED_EVENT = 'ed:frontend-frames-changed';

export const FRONTEND_FRAME_COLLAPSE_MODES = Object.freeze(['all', 'frontend_only', 'none']);

export const DEFAULT_FRONTEND_FRAME_SETTINGS = Object.freeze({
    enabled: true,
    depth: 0,
    depth_ignore_hidden: true,
    collapse_code_block: 'frontend_only',
    use_blob_url: false,
    skip_highlight: true,
    allow_streaming: false,
});

/**
 * Normalizes a persisted `power_user.frontend_frames` value. The settings load
 * path shallow-assigns `power_user`, so stored partial/garbage values must be
 * rebuilt against defaults here.
 * @param {unknown} value Stored value
 * @returns {{enabled:boolean,depth:number,depth_ignore_hidden:boolean,collapse_code_block:string,use_blob_url:boolean,skip_highlight:boolean,allow_streaming:boolean}}
 */
export function normalizeFrontendFramesSettings(value) {
    const defaults = DEFAULT_FRONTEND_FRAME_SETTINGS;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { ...defaults };
    }
    const input = /** @type {Record<string, unknown>} */ (value);
    const boolOr = (key) => typeof input[key] === 'boolean' ? input[key] : defaults[key];
    return {
        enabled: boolOr('enabled'),
        depth: Number.isInteger(input.depth) && /** @type {number} */ (input.depth) >= 0 ? /** @type {number} */ (input.depth) : defaults.depth,
        depth_ignore_hidden: boolOr('depth_ignore_hidden'),
        collapse_code_block: FRONTEND_FRAME_COLLAPSE_MODES.includes(/** @type {string} */ (input.collapse_code_block))
            ? /** @type {string} */ (input.collapse_code_block)
            : defaults.collapse_code_block,
        use_blob_url: boolOr('use_blob_url'),
        skip_highlight: boolOr('skip_highlight'),
        allow_streaming: boolOr('allow_streaming'),
    };
}

/**
 * Upstream-compatible detection: a `<pre>` is a frontend document when its text
 * content contains `html>`, `<head>`, or `<body`.
 * @param {unknown} text Code block text content
 * @returns {boolean}
 */
export function isFrontendContent(text) {
    const value = String(text ?? '');
    return FRONTEND_FRAME_MARKERS.some(marker => value.includes(marker));
}

/**
 * Rewrites `min-height: Nvh` occurrences (stylesheet declarations, inline style
 * attributes, `style.minHeight` assignments, `setProperty('min-height', ...)`) to
 * `var(--ed-viewport-height)` calc expressions, matching the upstream behavior.
 * @param {string} content HTML document source
 * @returns {string}
 */
export function rewriteVhExpressions(content) {
    let result = String(content ?? '');

    const hasCssMinVh = /min-height\s*:\s*[^;{}]*\d+(?:\.\d+)?vh/gi.test(result);
    const hasInlineStyleVh = /style\s*=\s*(["'])[\s\S]*?min-height\s*:\s*[^;]*?\d+(?:\.\d+)?vh[\s\S]*?\1/gi.test(result);
    const hasJsVh = /(\.style\.minHeight\s*=\s*(["']))([\s\S]*?vh)(\2)/gi.test(result)
        || /(setProperty\s*\(\s*(["'])min-height\2\s*,\s*(["']))([\s\S]*?vh)(\3\s*\))/gi.test(result);

    if (!hasCssMinVh && !hasInlineStyleVh && !hasJsVh) {
        return result;
    }

    const convertVhToVariable = (value) => value.replace(/(\d+(?:\.\d+)?)vh\b/gi, (match, amount) => {
        const parsed = parseFloat(amount);
        if (!Number.isFinite(parsed)) {
            return match;
        }
        const variableExpression = 'var(--ed-viewport-height)';
        if (parsed === 100) {
            return variableExpression;
        }
        return `calc(${variableExpression} * ${parsed / 100})`;
    });

    result = result.replace(
        /(min-height\s*:\s*)([^;{}]*?\d+(?:\.\d+)?vh)(?=\s*[;}])/gi,
        (_match, prefix, value) => `${prefix}${convertVhToVariable(value)}`,
    );

    result = result.replace(
        /(style\s*=\s*(["']))([^"'"]*?)(\2)/gi,
        (match, prefix, _quote, styleContent, suffix) => {
            if (!/min-height\s*:\s*[^;]*vh/i.test(styleContent)) {
                return match;
            }
            const replaced = styleContent.replace(
                /(min-height\s*:\s*)([^;]*?\d+(?:\.\d+)?vh)/gi,
                (_m, p1, p2) => `${p1}${convertVhToVariable(p2)}`,
            );
            return `${prefix}${replaced}${suffix}`;
        },
    );

    result = result.replace(
        /(\.style\.minHeight\s*=\s*(["']))([\s\S]*?)(\2)/gi,
        (match, prefix, _quote, value, suffix) => {
            if (!/\b\d+(?:\.\d+)?vh\b/i.test(value)) {
                return match;
            }
            return `${prefix}${convertVhToVariable(value)}${suffix}`;
        },
    );

    result = result.replace(
        /(setProperty\s*\(\s*(["'])min-height\2\s*,\s*(["']))([\s\S]*?)(\3\s*\))/gi,
        (match, prefix, _q1, _q2, value, suffix) => {
            if (!/\b\d+(?:\.\d+)?vh\b/i.test(value)) {
                return match;
            }
            return `${prefix}${convertVhToVariable(value)}${suffix}`;
        },
    );

    return result;
}

/**
 * Escapes a URL for interpolation inside a single-quoted CSS `url('...')`.
 * @param {unknown} url
 * @returns {string}
 */
function escapeCssUrl(url) {
    return String(url ?? '').replace(/[\\'"<>\n\r]/g, '');
}

const FRAME_PREDEFINE_SCRIPT = `(function () {
    'use strict';
    var meta = window.__ED_FRAME_META__ || {};
    try { delete window.__ED_FRAME_META__; } catch (e) { window.__ED_FRAME_META__ = undefined; }
    try {
        var parentWindow = window.parent;
        ['_', '$', 'jQuery', 'showdown', 'DOMPurify', 'hljs', 'moment', 'SVGInject'].forEach(function (key) {
            if (window[key] === undefined && parentWindow && parentWindow[key] !== undefined) {
                window[key] = parentWindow[key];
            }
        });
    } catch (e) { /* same-origin copy is best-effort */ }
    window.EmberDeskFrame = Object.freeze({
        frameId: typeof meta.frameId === 'string' ? meta.frameId : '',
        messageId: typeof meta.messageId === 'string' ? meta.messageId : '',
    });
    var updateViewportVars = function () {
        try {
            var height = window.parent && window.parent.innerHeight;
            if (typeof height === 'number' && isFinite(height) && height > 0) {
                var value = height + 'px';
                document.documentElement.style.setProperty('--ed-viewport-height', value);
                document.documentElement.style.setProperty('--TH-viewport-height', value);
            }
        } catch (e) { /* parent access is best-effort */ }
    };
    updateViewportVars();
    try {
        if (window.parent) {
            window.parent.addEventListener('resize', updateViewportVars);
        }
        window.addEventListener('resize', updateViewportVars);
        window.addEventListener('pagehide', function () {
            try { window.parent && window.parent.removeEventListener('resize', updateViewportVars); } catch (e) { /* ignore */ }
        });
    } catch (e) { /* ignore */ }
    var scheduled = false;
    var lastMeasure = 0;
    var HEIGHT_INTERVAL = 500;
    var measure = function () {
        scheduled = false;
        lastMeasure = Date.now();
        try {
            var body = document.body;
            var frame = window.frameElement;
            if (!body || !frame) { return; }
            var height = body.scrollHeight;
            if (isFinite(height) && height > 0) {
                frame.style.height = height + 'px';
            }
        } catch (e) { /* ignore */ }
    };
    var post = function () {
        if (scheduled) { return; }
        scheduled = true;
        var raf = window.requestAnimationFrame || function (cb) { return setTimeout(cb, 16); };
        var elapsed = Date.now() - lastMeasure;
        if (elapsed >= HEIGHT_INTERVAL) {
            raf(measure);
        } else {
            setTimeout(function () { raf(measure); }, HEIGHT_INTERVAL - elapsed);
        }
    };
    var observe = function () {
        try {
            if (typeof ResizeObserver === 'function') {
                var observer = new ResizeObserver(function () { post(); });
                observer.observe(document.documentElement);
                if (document.body) { observer.observe(document.body); }
            }
        } catch (e) { /* ignore */ }
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { post(); observe(); });
    } else {
        post();
        observe();
    }
    window.addEventListener('load', post);
})();`;

/**
 * Builds the full frame document string (used as `srcdoc` or blob source).
 * @param {string} code User HTML document source (vh already rewritten)
 * @param {object} [options]
 * @param {string} [options.frameId]
 * @param {string} [options.messageId]
 * @param {string} [options.userAvatarUrl]
 * @param {string} [options.charAvatarUrl]
 * @param {boolean} [options.useBlobUrl] Adds <base href> for blob-URL debugging
 * @param {string} [options.baseHref]
 * @returns {string}
 */
export function buildFrontendFrameDocument(code, {
    frameId = '',
    messageId = '',
    userAvatarUrl = '',
    charAvatarUrl = '',
    useBlobUrl = false,
    baseHref = '',
} = {}) {
    const content = rewriteVhExpressions(code);
    const metaJson = JSON.stringify({ frameId: String(frameId), messageId: String(messageId) });
    const userAvatar = escapeCssUrl(userAvatarUrl);
    const charAvatar = escapeCssUrl(charAvatarUrl);
    const baseTag = useBlobUrl && baseHref ? `<base href="${escapeCssUrl(baseHref)}">` : '';

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
${baseTag}<style>
*,*::before,*::after{box-sizing:border-box;}
html,body{margin:0!important;padding:0;overflow:hidden!important;max-width:100%!important;}
.user_avatar,.user-avatar{background-image:url('${userAvatar}')}
.char_avatar,.char-avatar{background-image:url('${charAvatar}')}
</style>
<script>window.__ED_FRAME_META__=${metaJson};</script>
<script>${FRAME_PREDEFINE_SCRIPT}</script>
</head>
<body>
${content}
</body>
</html>
`;
}

/**
 * Lists `<pre>` blocks under `rootEl` that qualify as frontend documents and are
 * not already wrapped in a frame slot. Visibility is intentionally NOT a filter:
 * blocks inside closed `<details>` still render, matching upstream.
 * @param {ParentNode|null|undefined} rootEl
 * @returns {HTMLPreElement[]}
 */
export function findFrontendBlocks(rootEl) {
    if (!rootEl || typeof rootEl.querySelectorAll !== 'function') {
        return [];
    }
    return Array.from(rootEl.querySelectorAll('pre'))
        .filter(pre => !pre.closest(`.${FRONTEND_FRAME_SLOT_CLASS}`) && isFrontendContent(pre.textContent));
}

/**
 * Computes whether a message may mount frames under the render-depth window.
 * `depth` counts floors from the newest rendered message backwards; `0` means
 * all rendered floors. With `depthIgnoreHidden`, `is_system` floors neither
 * render frames nor consume depth budget.
 * @param {object} options
 * @param {string|number} options.messageId Target message id
 * @param {ReadonlyArray<string|number>} options.renderedIds Currently rendered floor ids in order
 * @param {Record<string, boolean>} [options.isSystemById]
 * @param {number} [options.depth]
 * @param {boolean} [options.depthIgnoreHidden]
 * @returns {boolean}
 */
export function computeDepthEligible({ messageId, renderedIds, isSystemById = {}, depth = 0, depthIgnoreHidden = true } = {}) {
    const id = String(messageId);
    const ids = Array.isArray(renderedIds) ? renderedIds.map(String) : [];
    if (!ids.includes(id)) {
        return false;
    }
    if (depthIgnoreHidden && isSystemById[id] === true) {
        return false;
    }
    if (!Number.isFinite(depth) || depth <= 0) {
        return true;
    }
    let counted = 0;
    for (let index = ids.length - 1; index >= 0; index--) {
        const rowId = ids[index];
        if (depthIgnoreHidden && isSystemById[rowId] === true) {
            continue;
        }
        counted += 1;
        if (rowId === id) {
            return counted <= depth;
        }
        if (counted > depth) {
            return false;
        }
    }
    return false;
}

/**
 * @typedef {object} FrontendFrameContext
 * @property {object} [settings] Raw or normalized `power_user.frontend_frames`
 * @property {boolean} [eligible] Pre-mount depth eligibility (default true)
 * @property {string|number} [messageId] Owning message id
 * @property {string} [userAvatarUrl]
 * @property {string} [charAvatarUrl]
 * @property {string} [baseHref] Base href for blob-URL mode
 * @property {(eventName:string, frameId:string)=>void} [emit] Host event emitter
 * @property {(text:string)=>string} [translate] Optional label translator
 */

/**
 * Removes one mounted frame slot: the hidden source `<pre>` is restored to the
 * slot's position and the iframe subtree is destroyed. Blob URLs are revoked.
 * @param {Element} slot `.ed-frontend-frame` element
 */
export function unmountFrontendSlot(slot) {
    if (!slot || !slot.parentNode) {
        return;
    }
    const iframe = slot.querySelector('iframe');
    const src = iframe?.getAttribute('src') ?? '';
    if (src.startsWith('blob:')) {
        try {
            URL.revokeObjectURL(src);
        } catch { /* revoke is best-effort */ }
    }
    const pre = slot.querySelector(':scope > pre');
    if (pre instanceof HTMLElement) {
        pre.style.display = '';
        slot.replaceWith(pre);
    } else {
        slot.remove();
    }
}

/**
 * Undoes all frame slots and generic code-collapse decorations under `rootEl`.
 * @param {ParentNode|null|undefined} rootEl
 */
export function unmountFrontendFrames(rootEl) {
    if (!rootEl || typeof rootEl.querySelectorAll !== 'function') {
        return;
    }
    rootEl.querySelectorAll(`.${FRONTEND_FRAME_SLOT_CLASS}`).forEach(slot => unmountFrontendSlot(slot));
    rootEl.querySelectorAll(`.${FRONTEND_CODE_TOGGLE_CLASS}`).forEach(toggle => toggle.remove());
    rootEl.querySelectorAll(`pre[${FRONTEND_CODE_COLLAPSED_ATTR}]`).forEach(pre => {
        if (pre instanceof HTMLElement) {
            pre.style.display = '';
        }
        pre.removeAttribute(FRONTEND_CODE_COLLAPSED_ATTR);
    });
}

/**
 * Expanded/collapsed user intent survives React `innerHTML` rewrites: remounted
 * slots restore the last toggle state from this per-page-process set.
 * @type {Set<string>}
 */
const expandedBlockKeys = new Set();

function expandedKey(kind, messageId, index) {
    return `${kind}::${String(messageId)}::${index}`;
}

/**
 * Adds a collapse/expand toggle to a non-frontend `<pre>` (`collapse_code_block: 'all'`).
 * @param {HTMLPreElement} pre
 * @param {string} expandKey
 * @param {(text:string)=>string} translate
 */
function decoratePlainCodeBlock(pre, expandKey, translate) {
    if (!(pre instanceof HTMLElement) || pre.hasAttribute(FRONTEND_CODE_COLLAPSED_ATTR)) {
        return;
    }
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = FRONTEND_CODE_TOGGLE_CLASS;
    toggle.addEventListener('click', () => {
        const hidden = pre.style.display === 'none';
        pre.style.display = hidden ? '' : 'none';
        toggle.textContent = hidden ? translate('Hide code block') : translate('Show code block');
        toggle.setAttribute('aria-expanded', String(hidden));
        if (hidden) {
            expandedBlockKeys.add(expandKey);
        } else {
            expandedBlockKeys.delete(expandKey);
        }
    });
    const expanded = expandedBlockKeys.has(expandKey);
    toggle.textContent = expanded ? translate('Hide code block') : translate('Show code block');
    toggle.setAttribute('aria-expanded', String(expanded));
    pre.setAttribute(FRONTEND_CODE_COLLAPSED_ATTR, '1');
    pre.style.display = expanded ? '' : 'none';
    pre.parentNode?.insertBefore(toggle, pre);
}

/**
 * Mounts one frame slot around a qualifying `<pre>`.
 * @param {HTMLPreElement} pre
 * @param {object} options
 * @param {string} options.frameId
 * @param {string} options.document Assembled frame document
 * @param {boolean} options.useBlobUrl
 * @param {boolean} options.showToggle
 * @param {(text:string)=>string} options.translate
 * @param {(eventName:string, frameId:string)=>void|null} [options.emit]
 */
function mountFrontendSlot(pre, { frameId, document: frameDocument, useBlobUrl, showToggle, translate, emit }) {
    const slot = document.createElement('div');
    slot.className = FRONTEND_FRAME_SLOT_CLASS;
    slot.setAttribute(FRONTEND_FRAME_SLOT_ATTR, frameId);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = FRONTEND_FRAME_TOGGLE_CLASS;
    toggle.addEventListener('click', () => {
        const hidden = pre.style.display === 'none';
        pre.style.display = hidden ? '' : 'none';
        toggle.textContent = hidden ? translate('Hide frontend code block') : translate('Show frontend code block');
        toggle.setAttribute('aria-expanded', String(hidden));
        if (hidden) {
            expandedBlockKeys.add(frameId);
        } else {
            expandedBlockKeys.delete(frameId);
        }
    });
    const expanded = expandedBlockKeys.has(frameId);
    toggle.textContent = expanded ? translate('Hide frontend code block') : translate('Show frontend code block');
    toggle.setAttribute('aria-expanded', String(expanded));

    const iframe = document.createElement('iframe');
    iframe.className = FRONTEND_FRAME_IFRAME_CLASS;
    iframe.title = frameId;
    iframe.setAttribute('loading', 'lazy');
    iframe.addEventListener('load', () => emit?.(FRONTEND_FRAME_EVENTS.ended, frameId));

    pre.replaceWith(slot);
    if (showToggle) {
        slot.appendChild(toggle);
    }
    pre.style.display = showToggle && !expanded ? 'none' : '';
    slot.appendChild(pre);
    slot.appendChild(iframe);

    if (useBlobUrl) {
        const blob = new Blob([frameDocument], { type: 'text/html' });
        iframe.src = URL.createObjectURL(blob);
    } else {
        iframe.srcdoc = frameDocument;
    }

    emit?.(FRONTEND_FRAME_EVENTS.started, frameId);
}

/**
 * Scans `mesTextEl` for frontend `<pre>` blocks and mounts same-origin frames.
 * Idempotent: already-slotted blocks are skipped, and ineligible/disabled calls
 * remove any previously mounted frames under the root.
 * @param {Element|null|undefined} mesTextEl The `.mes_text` host element
 * @param {FrontendFrameContext} [ctx]
 * @returns {number} Number of blocks mounted this call
 */
export function mountFrontendFrames(mesTextEl, ctx = {}) {
    if (!mesTextEl || typeof mesTextEl.querySelectorAll !== 'function') {
        return 0;
    }
    const settings = normalizeFrontendFramesSettings(ctx.settings);
    const translate = typeof ctx.translate === 'function' ? ctx.translate : (text) => text;

    if (!settings.enabled || ctx.eligible === false) {
        unmountFrontendFrames(mesTextEl);
        return 0;
    }

    const messageId = String(ctx.messageId ?? mesTextEl.closest('.mes')?.getAttribute('mesid') ?? '');

    if (settings.collapse_code_block === 'all') {
        let codeIndex = 0;
        mesTextEl.querySelectorAll('pre').forEach(pre => {
            if (!pre.closest(`.${FRONTEND_FRAME_SLOT_CLASS}`)) {
                if (!isFrontendContent(pre.textContent)) {
                    decoratePlainCodeBlock(pre, expandedKey('code', messageId, codeIndex), translate);
                }
                codeIndex += 1;
            }
        });
    }

    const blocks = findFrontendBlocks(mesTextEl);
    blocks.forEach((pre, index) => {
        const frameId = `ed-frame--${messageId}--${index}`;
        const frameDocument = buildFrontendFrameDocument(pre.textContent ?? '', {
            frameId,
            messageId,
            userAvatarUrl: ctx.userAvatarUrl,
            charAvatarUrl: ctx.charAvatarUrl,
            useBlobUrl: settings.use_blob_url,
            baseHref: ctx.baseHref,
        });
        mountFrontendSlot(pre, {
            frameId,
            document: frameDocument,
            useBlobUrl: settings.use_blob_url,
            showToggle: settings.collapse_code_block !== 'none',
            translate,
            emit: ctx.emit,
        });
    });
    return blocks.length;
}
