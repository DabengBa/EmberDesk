import { DOMPurify } from '../lib.js';

// DOM rendering is native; jQuery is retained only for legacy toast handles.
const defaults = {
    tapToDismiss: true,
    toastClass: 'toast',
    containerId: 'toast-container',
    closeButton: false,
    closeOnHover: true,
    showMethod: 'fadeIn',
    showDuration: 300,
    showEasing: 'swing',
    hideMethod: 'fadeOut',
    hideDuration: 1000,
    hideEasing: 'swing',
    closeMethod: false,
    closeDuration: false,
    closeEasing: false,
    extendedTimeOut: 1000,
    iconClasses: { error: 'toast-error', info: 'toast-info', success: 'toast-success', warning: 'toast-warning' },
    positionClass: 'toast-top-right',
    timeOut: 5000,
    titleClass: 'toast-title',
    messageClass: 'toast-message',
    escapeHtml: true,
    target: 'body',
    closeClass: 'toast-close-button',
    newestOnTop: true,
    preventDuplicates: false,
    progressBar: false,
    progressClass: 'toast-progress',
    rtl: false,
};

const active = new Map();
let subscriber;
let previousMessage;
let nextId = 0;

function wrap(element) {
    return typeof globalThis.jQuery === 'function' ? globalThis.jQuery(element) : element;
}

function getNativeContainer(options, create = false) {
    const settings = { ...defaults, ...notifications.options, ...options };
    let container = document.getElementById(settings.containerId);
    if (!container && create) {
        container = document.createElement('div');
        container.setAttribute('id', settings.containerId);
        if (settings.positionClass) container.className = settings.positionClass;
        let target = typeof settings.target === 'string' ? document.querySelector(settings.target) : settings.target;
        // A cleared last toast removes its container. Recreate it in the open
        // dialog rather than behind the browser's modal top layer.
        if (target === document.body) {
            target = Array.from(document.querySelectorAll?.('dialog[open]:not([closing])') ?? []).pop() || target;
        }
        target.append(container);
    }
    return container;
}

export function setNotificationHtml(parent, value) {
    parent.replaceChildren(DOMPurify.sanitize(String(value), { RETURN_DOM_FRAGMENT: true }));
}

function appendContent(parent, value, escapeHtml) {
    // A jQuery collection or DOM node is already explicit trusted DOM. Move the
    // original nodes so their event listeners and mutable state survive.
    if (value?.nodeType) {
        parent.append(value);
    } else if (value?.jquery) {
        for (const node of Array.from(value)) parent.append(node);
    } else if (escapeHtml) {
        parent.textContent = String(value);
    } else {
        setNotificationHtml(parent, value);
    }
}

function finishRemoval(element, notify) {
    const record = active.get(element);
    if (!record) return;
    clearTimeout(record.timer);
    clearInterval(record.progressTimer);
    clearTimeout(record.animationTimer);
    active.delete(element);
    const container = element.parentNode;
    element.remove();
    if (container && !container.children.length) {
        container.remove();
        previousMessage = undefined;
    }
    if (notify) {
        record.options.onHidden?.();
        record.event.state = 'hidden';
        record.event.endTime = new Date();
        subscriber?.(record.event);
    }
}

// CSS transitions leave the final opacity to the existing toastr stylesheet,
// including its hover rule. The queued operations mirror jQuery's fade queue.
function animate(element, record, fadeIn, duration, easing, complete) {
    const milliseconds = Math.max(0, Number(duration) || 0);
    if (fadeIn) element.style.opacity = '0';
    if (!milliseconds) {
        element.style.opacity = fadeIn ? '' : '0';
        complete();
        return;
    }
    element.style.transition = 'none';
    // Commit the initial style before starting the transition.
    void element.offsetWidth;
    const timing = easing === 'linear' ? 'linear' : 'cubic-bezier(0.445, 0.05, 0.55, 0.95)';
    element.style.transition = `opacity ${milliseconds}ms ${timing}`;
    element.style.opacity = fadeIn ? '' : '0';
    record.animationTimer = setTimeout(() => {
        element.style.transition = '';
        complete();
    }, milliseconds);
}

function removeToast(element, force = false, notify = false, close = false) {
    const record = active.get(element);
    if (!record || record.dismissing || (!force && document.activeElement !== element && element.contains(document.activeElement))) return false;
    record.dismissing = true;
    clearTimeout(record.timer);
    clearInterval(record.progressTimer);
    const duration = close && record.options.closeDuration !== false ? record.options.closeDuration : record.options.hideDuration;
    const easing = close && record.options.closeEasing !== false ? record.options.closeEasing : record.options.hideEasing;
    const hide = () => animate(element, record, false, duration, easing, () => finishRemoval(element, notify));
    if (record.showing) record.afterShow = hide; else hide();
    return true;
}

function clear(toast, options) {
    const element = toast?.nodeType ? toast : toast?.[0];
    if (toast != null) {
        if (element) removeToast(element, !!options?.force);
        return;
    }
    for (const item of [...active.keys()].reverse()) removeToast(item);
}

function show(type, message, title, override) {
    const options = { ...defaults, ...notifications.options, ...override };
    if (options.preventDuplicates) {
        if (message === previousMessage) return undefined;
        previousMessage = message;
    }
    const container = getNativeContainer(options, true);
    const element = document.createElement('div');
    element.className = `${options.toastClass} ${override?.iconClass || options.iconClasses[type]}`;
    if (options.rtl) element.classList.add('rtl');
    element.setAttribute('aria-live', type === 'success' || type === 'info' ? 'polite' : 'assertive');

    let progress;
    if (options.progressBar) {
        progress = document.createElement('div');
        progress.className = options.progressClass;
        element.append(progress);
    }
    if (options.closeButton) {
        const close = document.createElement('button');
        close.setAttribute('type', 'button');
        close.setAttribute('role', 'button');
        close.className = options.closeClass;
        close.textContent = '×';
        close.addEventListener('click', event => {
            event.stopPropagation();
            options.onCloseClick?.(event);
            removeToast(element, true, true, true);
        });
        element.prepend(close);
    }
    if (title) {
        const heading = document.createElement('div');
        heading.className = options.titleClass;
        appendContent(heading, title, options.escapeHtml);
        element.append(heading);
    }
    if (message) {
        const content = document.createElement('div');
        content.className = options.messageClass;
        appendContent(content, message, options.escapeHtml);
        element.append(content);
    }
    if (options.newestOnTop) container.prepend(element); else container.append(element);

    const event = { toastId: ++nextId, state: 'visible', startTime: new Date(), options, map: { type, iconClass: override?.iconClass || options.iconClasses[type], message, optionsOverride: override, title } };
    const record = { options, event, timer: undefined, progressTimer: undefined, showing: true };
    active.set(element, record);

    animate(element, record, true, options.showDuration, options.showEasing, () => {
        record.showing = false;
        options.onShown?.();
        record.afterShow?.();
    });

    function schedule(delay) {
        clearTimeout(record.timer);
        clearInterval(record.progressTimer);
        record.timer = setTimeout(() => removeToast(element, false, true), delay);
        if (progress && delay > 0) {
            const end = Date.now() + Number(delay);
            record.progressTimer = setInterval(() => { progress.style.width = `${(end - Date.now()) / delay * 100}%`; }, 10);
        }
    }

    if (options.timeOut > 0) schedule(options.timeOut);
    if (options.closeOnHover) {
        element.addEventListener('mouseenter', () => { clearTimeout(record.timer); clearInterval(record.progressTimer); });
        element.addEventListener('mouseleave', () => { if (options.timeOut > 0 || options.extendedTimeOut > 0) schedule(options.extendedTimeOut); });
    }
    if (options.onclick || options.tapToDismiss) {
        element.addEventListener('click', clickEvent => {
            options.onclick?.(clickEvent);
            removeToast(element, false, true);
        });
    }
    subscriber?.(event);
    return element;
}

function showLegacy(type, message, title, options) {
    const element = show(type, message, title, options);
    return element === undefined ? undefined : wrap(element);
}

const notifications = {
    options: {},
    clear,
    remove(toast) {
        const element = toast?.nodeType ? toast : toast?.[0];
        if (element) {
            if (document.activeElement === element || !element.contains(document.activeElement)) finishRemoval(element, false);
        } else {
            for (const item of [...active.keys()]) finishRemoval(item, false);
        }
    },
    getContainer(options, create = false) { return wrap(getNativeContainer(options, create)); },
    subscribe(callback) { subscriber = callback; },
    error(message, title, options) { return showLegacy('error', message, title, options); },
    info(message, title, options) { return showLegacy('info', message, title, options); },
    success(message, title, options) { return showLegacy('success', message, title, options); },
    warning(message, title, options) { return showLegacy('warning', message, title, options); },
};

// The native facade shares all state with the legacy public singleton.
notifications.native = {
    getContainer: getNativeContainer,
    clear,
    remove: notifications.remove,
    error(message, title, options) { return show('error', message, title, options); },
    info(message, title, options) { return show('info', message, title, options); },
    success(message, title, options) { return show('success', message, title, options); },
    warning(message, title, options) { return show('warning', message, title, options); },
};

// Third-party extensions and the tokenizer boundary still use the public
// toastr global. React panels use the named bridge to avoid bundling a second
// copy of this stateful module.
globalThis.toastr = notifications;
globalThis.emberDeskNotifications = notifications;

export { notifications };
export default notifications;
