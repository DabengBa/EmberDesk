import { debounce_timeout } from './constants.js';

// jQuery's delegated handlers run before body handlers, even when the latter
// were registered first. Keep that ordering for the nested drop zones.
const dispatchers = new WeakMap();
const eventTypes = ['dragover', 'dragleave', 'drop'];

function subscribe(handler) {
    const body = document.body;
    let state = dispatchers.get(body);
    if (!state) {
        state = { handlers: new Set(), listeners: new Map() };
        for (const type of eventTypes) {
            const listener = event => {
                const handlers = [...state.handlers];
                let target = event.target;
                if (target?.nodeType && target.nodeType !== 1) target = target.parentElement;
                for (let node = target; node && node !== body; node = node.parentElement) {
                    const matches = handlers.filter(item => item.selector !== 'body' && node.matches?.(item.selector));
                    if (matches.length) {
                        for (const item of matches) {
                            if (item.dispatch(event, node, body)) break;
                        }
                        return;
                    }
                }
                for (const item of handlers) {
                    if (item.selector === 'body' && item.dispatch(event, body, body)) break;
                }
            };
            state.listeners.set(type, listener);
            body.addEventListener(type, listener);
        }
        dispatchers.set(body, state);
    }
    state.handlers.add(handler);
    handler.subscriptionBody = body;
}

function unsubscribe(handler) {
    const body = handler.subscriptionBody;
    const state = body && dispatchers.get(body);
    if (!state) return;
    state.handlers.delete(handler);
    handler.subscriptionBody = null;
    if (!state.handlers.size) {
        for (const [type, listener] of state.listeners) body.removeEventListener(type, listener);
        dispatchers.delete(body);
    }
}

/** Drag and drop styling and file callbacks, delegated from the document body. */
export class DragAndDropHandler {
    /**
     * @param {string} selector CSS selector for the drop targets
     * @param {(files: File[], event: DragEvent & {originalEvent: DragEvent}) => void} onDropCallback
     * @param {{noAnimation?: boolean}} options
     */
    constructor(selector, onDropCallback, { noAnimation = false } = {}) {
        this.selector = selector;
        this.onDropCallback = onDropCallback;
        this.noAnimation = noAnimation;
        this.dragLeaveTimeout = null;
        this.subscriptionBody = null;
        this.init();
    }

    /** Stop this handler without affecting other drop zones. */
    destroy() {
        const body = this.subscriptionBody;
        if (!body) return;
        unsubscribe(this);
        clearTimeout(this.dragLeaveTimeout);
        this.dragLeaveTimeout = null;
        const remaining = body && dispatchers.get(body)?.handlers;
        this.forEachTarget(target => {
            const owners = remaining ? [...remaining].filter(handler => target.matches(handler.selector)) : [];
            if (!owners.length) target.classList.remove('drop_target', 'dragover');
            if (!owners.some(handler => handler.noAnimation)) target.classList.remove('no_animation');
        });
    }

    /** Start (or restart) this handler without registering it twice. */
    init() {
        if (!this.subscriptionBody) subscribe(this);
        this.forEachTarget(target => {
            target.classList.add('drop_target');
            if (this.noAnimation) target.classList.add('no_animation');
        });
    }

    forEachTarget(callback) {
        document.querySelectorAll(this.selector).forEach(callback);
    }

    dispatch(event, currentTarget, delegateTarget) {
        event.preventDefault();
        event.stopPropagation();
        clearTimeout(this.dragLeaveTimeout);
        if (event.type === 'dragover') {
            this.forEachTarget(target => {
                target.classList.add('drop_target', 'dragover');
                if (this.noAnimation) target.classList.add('no_animation');
            });
        } else if (event.type === 'dragleave') {
            this.dragLeaveTimeout = setTimeout(() => {
                this.forEachTarget(target => target.classList.remove('dragover'));
            }, debounce_timeout.quick);
        } else {
            this.forEachTarget(target => target.classList.remove('dragover'));
            // Existing chat and character consumers read originalEvent.dataTransfer.
            // Bind DOM methods/getters to the actual native event for brand checks.
            let immediateStopped = false;
            const compatibleEvent = new Proxy(event, {
                get(nativeEvent, property) {
                    if (property === 'originalEvent') return nativeEvent;
                    if (property === 'currentTarget') return currentTarget;
                    if (property === 'delegateTarget') return delegateTarget;
                    if (property === 'stopImmediatePropagation') return () => {
                        immediateStopped = true;
                        nativeEvent.stopImmediatePropagation();
                    };
                    const value = Reflect.get(nativeEvent, property, nativeEvent);
                    return typeof value === 'function' ? value.bind(nativeEvent) : value;
                },
            });
            this.onDropCallback(Array.from(event.dataTransfer.files), compatibleEvent);
            return immediateStopped;
        }
        return false;
    }
}
