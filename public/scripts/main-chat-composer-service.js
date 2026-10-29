/**
 * Typed owner of the main-chat composer text value.
 *
 * #send_textarea is rendered once by React as an uncontrolled element; this
 * service is the single command/state path for its value. All reads and writes
 * (submit flows, /send-style commands, macros, and injected composer text,
 * autocomplete clearing, React runtime commands) must go through this module
 * instead of touching `#send_textarea` `.val()`/`.value` directly. The DOM node
 * remains an event source for user typing (native 'input' events sync the
 * state) and a render detail only.
 */

const COMPOSER_ELEMENT_ID = 'send_textarea';

let composerValue = '';
let listenerBound = false;
const listeners = new Set();

/**
 * Per-chat draft store. Each chat context keeps its own pending text so a
 * half-written message stays with the chat it belongs to instead of leaking
 * into the next one. `null`/`undefined` contexts share the '' bucket.
 */
const composerDrafts = new Map();
let draftContextKey = null;
let draftContextReady = false;

function getComposerElement() {
    const element = document.getElementById(COMPOSER_ELEMENT_ID);
    return element instanceof HTMLTextAreaElement ? element : null;
}

function emitChange() {
    for (const listener of listeners) {
        listener(composerValue);
    }
}

function handleDocumentInput(event) {
    const target = event.target;
    if (!(target instanceof HTMLTextAreaElement) || target.id !== COMPOSER_ELEMENT_ID) {
        return;
    }
    if (target.value === composerValue) {
        return;
    }
    composerValue = target.value;
    emitChange();
}

/**
 * Binds the delegated input listener once. Safe to call before the composer
 * element exists and idempotent afterwards. Called eagerly at module load so
 * no keystroke is missed, and re-invoked after the React mount to reconcile
 * the freshly rendered node with existing state.
 */
export function initMainChatComposerService() {
    if (typeof document === 'undefined') {
        return;
    }
    if (!listenerBound) {
        document.addEventListener('input', handleDocumentInput, true);
        listenerBound = true;
    }
    const element = getComposerElement();
    if (element && composerValue && element.value !== composerValue) {
        element.value = composerValue;
        element.dispatchEvent(new Event('input', { bubbles: true }));
    }
}

initMainChatComposerService();

/**
 * Current composer text. Returns the canonical state value; the DOM node is
 * only a render detail for it.
 * @returns {string}
 */
export function getComposerValue() {
    initMainChatComposerService();
    return composerValue;
}

/**
 * Replaces the composer text. Writes the DOM node when present and dispatches
 * a bubbling 'input' event so existing listeners (autocomplete, snapshot
 * projection, style hooks) keep working.
 * @param {string} value
 */
export function setComposerValue(value) {
    initMainChatComposerService();
    const nextValue = String(value ?? '');
    composerValue = nextValue;
    const element = getComposerElement();
    if (element) {
        if (element.value !== nextValue) {
            element.value = nextValue;
        }
        element.dispatchEvent(new Event('input', { bubbles: true }));
    }
    emitChange();
}

/**
 * Clears the composer text.
 */
export function clearComposerValue() {
    setComposerValue('');
}

/**
 * Subscribes to composer value changes (typing, programmatic sets, and clears).
 * @param {(value: string) => void} listener
 * @returns {() => void} unsubscribe
 */
export function subscribeComposerValue(listener) {
    initMainChatComposerService();
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/**
 * Switches the active chat draft context. The current text is stashed under
 * the outgoing context key and the incoming context's saved draft is restored
 * (empty when none exists). The first call only adopts the key so text typed
 * before any chat context is known (e.g. pre-login or neutral surface) is not
 * destroyed.
 * @param {string|number|null|undefined} contextKey Stable chat identifier (e.g. getCurrentChatId()).
 */
export function setComposerDraftContext(contextKey) {
    initMainChatComposerService();
    const nextKey = contextKey === null || contextKey === undefined ? '' : String(contextKey);
    if (!draftContextReady) {
        draftContextReady = true;
        draftContextKey = nextKey;
        return;
    }
    if (nextKey === draftContextKey) {
        return;
    }
    composerDrafts.set(draftContextKey, composerValue);
    draftContextKey = nextKey;
    setComposerValue(composerDrafts.get(nextKey) ?? '');
}

/**
 * Migrates a stashed draft when its chat is renamed. CHAT_RENAMED reports file
 * names with the .jsonl extension while draft keys are extension-less chat ids.
 * @param {string} oldFileName Previous chat file name.
 * @param {string} newFileName New chat file name.
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
    if (draftContextReady && draftContextKey === from) {
        draftContextKey = to;
    }
}
