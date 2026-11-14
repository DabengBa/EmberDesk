// One opacity animation per element; a newer request owns its completion.
const activeOpacity = new WeakMap();

export function cancelOpacity(element) {
    const active = activeOpacity.get(element);
    if (!active) return;
    activeOpacity.delete(element);
    active.cancel();
}

export function transitionOpacity(element, { opacity, duration = 0, easing = 'linear', complete, settled, isCurrent = () => true } = {}) {
    if (!element) return;
    cancelOpacity(element);
    const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const finish = () => {
        try {
            if (!isCurrent()) return;
            element.style.opacity = String(opacity);
            complete?.call(element);
        } finally {
            settled?.call(element);
        }
    };
    if (!duration || reduced || typeof element.animate !== 'function') {
        finish();
        return;
    }
    const from = globalThis.getComputedStyle?.(element)?.opacity || element.style.opacity || '1';
    let animation;
    try {
        animation = element.animate([{ opacity: from }, { opacity: String(opacity) }], { duration, easing, fill: 'forwards' });
    } catch {
        finish();
        return;
    }
    activeOpacity.set(element, animation);
    animation.finished.then(() => {
        try {
            if (activeOpacity.get(element) !== animation) return;
            activeOpacity.delete(element);
            const current = isCurrent();
            if (current) element.style.opacity = String(opacity);
            animation.cancel();
            if (current) complete?.call(element);
        } finally {
            settled?.call(element);
        }
    }, () => {
        if (activeOpacity.get(element) === animation) activeOpacity.delete(element);
        settled?.call(element);
    });
}

export function scrollChatTo(chat, top) {
    if (!chat) return;
    const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (typeof chat.scrollTo === 'function') chat.scrollTo({ top, behavior: reduced ? 'instant' : 'smooth' });
    else chat.scrollTop = top;
}
