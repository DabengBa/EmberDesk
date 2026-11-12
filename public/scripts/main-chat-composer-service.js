/** DOM-independent state for the main-chat composer. */

/**
 * @typedef {object} ComposerSnapshot
 * @property {string} value
 * @property {string|null} contextKey
 * @property {number} revision
 * @property {number} contextRevision
 * @property {number} selectionStart
 * @property {number} selectionEnd
 * @property {'none'|'forward'|'backward'} selectionDirection
 * @property {boolean} focused
 * @property {boolean} composing
 * @property {number} focusRequest
 */
/** @type {ComposerSnapshot} */
let snapshot = {
    value: '',
    contextKey: null,
    revision: 0,
    contextRevision: 0,
    selectionStart: 0,
    selectionEnd: 0,
    selectionDirection: 'none',
    focused: false,
    composing: false,
    focusRequest: 0,
};

const stateListeners = new Set();
const valueListeners = new Set();
const composerDrafts = new Map();
let draftContextReady = false;

function publish(next) {
    if (Object.keys(next).every(key => next[key] === snapshot[key])) {
        return;
    }
    const previous = snapshot;
    snapshot = { ...previous, ...next };
    for (const listener of stateListeners) {
        listener();
    }
    if (snapshot.value !== previous.value) {
        for (const listener of valueListeners) {
            listener(snapshot.value);
        }
    }
}

function selectionFor(value, start, end, direction) {
    const clamp = position => Math.max(0, Math.min(value.length, Math.trunc(position)));
    const selectionEnd = clamp(end);
    return {
        selectionStart: Math.min(clamp(start), selectionEnd),
        selectionEnd,
        selectionDirection: ['forward', 'backward', 'none'].includes(direction) ? direction : 'none',
    };
}


/** @returns {typeof snapshot} */
export function getComposerSnapshot() {
    return snapshot;
}

/** @param {() => void} listener */
export function subscribeComposerState(listener) {
    stateListeners.add(listener);
    return () => stateListeners.delete(listener);
}

/** @returns {string} */
export function getComposerValue() {
    return snapshot.value;
}

/** @param {(value: string) => void} listener */
export function subscribeComposerValue(listener) {
    valueListeners.add(listener);
    return () => valueListeners.delete(listener);
}

/**
 * @param {string} value
 * @param {{expected?: typeof snapshot, selectionStart?: number, selectionEnd?: number, selectionDirection?: 'forward'|'backward'|'none'}} [options]
 * @returns {boolean} Whether the write was accepted.
 */
export function setComposerValue(value, options = {}) {
    const { expected } = options;
    if (expected && (expected.contextKey !== snapshot.contextKey || expected.revision !== snapshot.revision)) {
        return false;
    }
    const nextValue = String(value ?? '');
    const selection = selectionFor(nextValue, options.selectionStart ?? nextValue.length, options.selectionEnd ?? nextValue.length, options.selectionDirection ?? 'none');
    publish({
        value: nextValue,
        revision: snapshot.revision + Number(nextValue !== snapshot.value),
        ...selection,
    });
    return true;
}

/** @param {Parameters<typeof setComposerValue>[1]} [options] */
export function clearComposerValue(options = {}) {
    return setComposerValue('', options);
}

/**
 * @param {{selectionStart?: number, selectionEnd?: number, selectionDirection?: 'forward'|'backward'|'none', focused?: boolean, composing?: boolean}} patch
 */
export function updateComposerInteraction(patch) {
    const selection = selectionFor(
        snapshot.value,
        patch.selectionStart ?? snapshot.selectionStart,
        patch.selectionEnd ?? snapshot.selectionEnd,
        patch.selectionDirection ?? snapshot.selectionDirection,
    );
    publish({
        ...selection,
        focused: patch.focused === undefined ? snapshot.focused : Boolean(patch.focused),
        composing: patch.composing === undefined ? snapshot.composing : Boolean(patch.composing),
    });
}

export function requestComposerFocus() {
    publish({ focusRequest: snapshot.focusRequest + 1 });
}

/** @param {string|number|null|undefined} contextKey */
export function setComposerDraftContext(contextKey) {
    const nextKey = contextKey === null || contextKey === undefined ? '' : String(contextKey);
    if (!draftContextReady) {
        draftContextReady = true;
        publish({ contextKey: nextKey, revision: snapshot.revision + 1, contextRevision: snapshot.contextRevision + 1 });
        return;
    }
    if (nextKey === snapshot.contextKey) {
        return;
    }
    composerDrafts.set(snapshot.contextKey, snapshot.value);
    const value = composerDrafts.get(nextKey) ?? '';
    publish({
        contextKey: nextKey,
        value,
        revision: snapshot.revision + 1,
        contextRevision: snapshot.contextRevision + 1,
        ...selectionFor(value, value.length, value.length, 'none'),
    });
}

/**
 * @param {string} oldFileName
 * @param {string} newFileName
 */
export function renameComposerDraftContext(oldFileName, newFileName) {
    const from = String(oldFileName ?? '').replace(/\.jsonl$/i, '');
    const to = String(newFileName ?? '').replace(/\.jsonl$/i, '');
    if (from === to) {
        return;
    }
    if (composerDrafts.has(from)) {
        composerDrafts.set(to, composerDrafts.get(from));
        composerDrafts.delete(from);
    }
    publish({
        contextKey: draftContextReady && snapshot.contextKey === from ? to : snapshot.contextKey,
        revision: snapshot.revision + 1,
        contextRevision: snapshot.contextRevision + Number(draftContextReady && snapshot.contextKey === from),
    });
}
