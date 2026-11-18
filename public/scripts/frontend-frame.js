/** Renders message HTML in opaque-origin iframes inside the owning row. */

export const FRONTEND_FRAME_MARKERS = Object.freeze(['html>', '<head>', '<body']);

export const FRONTEND_FRAME_SLOT_CLASS = 'ed-frontend-frame';
export const FRONTEND_FRAME_SLOT_ATTR = 'data-frontend-slot';
export const FRONTEND_FRAME_IFRAME_CLASS = 'ed-frontend-frame__iframe';
export const FRONTEND_CODE_TOGGLE_CLASS = 'ed-code-collapse-toggle';
export const FRONTEND_CODE_COLLAPSED_ATTR = 'data-ed-code-collapsed';

export const FRONTEND_FRAME_EVENTS = Object.freeze({
    started: 'frontend_frame_render_started',
    ended: 'frontend_frame_render_ended',
});

/** Document-level signal asking mounted rows to re-run their frame scan. */
export const FRONTEND_FRAMES_CHANGED_EVENT = 'ed:frontend-frames-changed';

export const FRONTEND_FRAME_COLLAPSE_MODES = Object.freeze(['all', 'none']);

export const DEFAULT_FRONTEND_FRAME_SETTINGS = Object.freeze({
    enabled: true,
    depth: 0,
    depth_ignore_hidden: true,
    collapse_code_block: 'none',

    skip_highlight: true,
});

/**
 * Normalizes a persisted `power_user.frontend_frames` value. The settings load
 * path shallow-assigns `power_user`, so stored partial/garbage values must be
 * rebuilt against defaults here.
 * @param {unknown} value Stored value
 * @returns {{enabled:boolean,depth:number,depth_ignore_hidden:boolean,collapse_code_block:string,skip_highlight:boolean}}
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

        skip_highlight: boolOr('skip_highlight'),
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
 * @property {string} [frameIdSeed] Stable identity across message index changes
 * @property {(eventName:string, frameId:string)=>void} [emit] Host-only lifecycle emitter
 * @property {(text:string)=>string} [translate] Optional label translator
 */

/**
 * Removes one mounted frame slot: the hidden source `<pre>` is restored to the
 * slot's position and the iframe subtree is destroyed.
 * @param {Element} slot `.ed-frontend-frame` element
 */
export function unmountFrontendSlot(slot) {
    const pre = slot.querySelector(':scope > details > pre');
    if (pre instanceof HTMLElement) {
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
 * Mounts one isolated iframe and a host-owned disclosure for its inert source.
 * @param {HTMLPreElement} pre
 * @param {string} frameId
 * @param {FrontendFrameContext['emit']} emit
 * @param {(text:string)=>string} translate
 */
function mountFrontendSlot(pre, frameId, emit, translate) {
    const slot = document.createElement('div');
    slot.className = FRONTEND_FRAME_SLOT_CLASS;
    slot.setAttribute(FRONTEND_FRAME_SLOT_ATTR, frameId);

    const iframe = document.createElement('iframe');
    iframe.className = FRONTEND_FRAME_IFRAME_CLASS;
    iframe.title = frameId;
    iframe.setAttribute('loading', 'lazy');
    // Do not mint an app-origin blob URL for untrusted executable documents.
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.srcdoc = pre.textContent ?? '';
    iframe.addEventListener('load', () => emit?.(FRONTEND_FRAME_EVENTS.ended, frameId));

    const source = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = translate('View HTML source');
    source.appendChild(summary);
    pre.replaceWith(slot);
    source.appendChild(pre);
    slot.appendChild(source);
    emit?.(FRONTEND_FRAME_EVENTS.started, frameId);
    slot.prepend(iframe);
}

/**
 * Scans `mesTextEl` for frontend `<pre>` blocks and mounts isolated frames.
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
    const frameIdSeed = String(ctx.frameIdSeed ?? messageId);

    if (settings.collapse_code_block === 'all') {
        let codeIndex = 0;
        mesTextEl.querySelectorAll('pre').forEach(pre => {
            if (!pre.closest(`.${FRONTEND_FRAME_SLOT_CLASS}`)) {
                if (!isFrontendContent(pre.textContent)) {
                    decoratePlainCodeBlock(pre, expandedKey('code', frameIdSeed, codeIndex), translate);
                }
                codeIndex += 1;
            }
        });
    }

    const blocks = findFrontendBlocks(mesTextEl);
    blocks.forEach((pre, index) => {
        const frameId = `ed-frame--${frameIdSeed}--${index}`;
        mountFrontendSlot(pre, frameId, ctx.emit, translate);
    });
    return blocks.length;
}
