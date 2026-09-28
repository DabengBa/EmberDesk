/**
 * Typed owner of the main-chat composer text value.
 *
 * #send_textarea is rendered once by React as an uncontrolled element; this
 * service is the single command/state path for its value. All reads and writes
 * (submit flows, /send-style commands, macros, impersonate injection,
 * autocomplete clearing, React runtime commands) must go through this module
 * instead of touching `#send_textarea` `.val()`/`.value` directly. The DOM node
 * remains an event source for user typing (native 'input' events sync the
 * state) and a render detail only.
 */

const COMPOSER_ELEMENT_ID = 'send_textarea';

let composerValue = '';
let listenerBound = false;
const listeners = new Set();

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
