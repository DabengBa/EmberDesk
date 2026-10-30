import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * Autosize a textarea to its content height. Besides re-fitting on `value`
 * change, a ResizeObserver re-measures whenever the content height changes —
 * most notably when the element becomes visible again after being
 * mounted/hidden (where scrollHeight reads ~0 and the pinned inline height
 * would otherwise stay collapsed forever). A height the user set via the
 * native resize handle is kept: the observer only refits when scrollHeight
 * itself changed, never on manual drags.
 */
export function useAutosizeTextareaRef<T extends HTMLTextAreaElement = HTMLTextAreaElement>(
    value: string,
): RefObject<T | null> {
    const ref = useRef<T | null>(null);
    const fittedHeightRef = useRef<string>('');

    const fitToContent = useCallback(() => {
        const element = ref.current;
        if (!element) {
            return;
        }
        const inlineHeight = element.style.height;
        const manualHeight = inlineHeight && inlineHeight !== fittedHeightRef.current
            ? parseFloat(inlineHeight)
            : null;
        element.style.height = 'auto';
        const contentHeight = element.scrollHeight;
        const next = manualHeight !== null && Number.isFinite(manualHeight)
            ? Math.max(contentHeight, manualHeight)
            : contentHeight;
        element.style.height = `${next}px`;
        fittedHeightRef.current = `${next}px`;
    }, []);

    useLayoutEffect(fitToContent, [value, fitToContent]);

    useEffect(() => {
        const element = ref.current;
        if (!element || typeof ResizeObserver === 'undefined') {
            return;
        }
        let lastScrollHeight = element.scrollHeight;
        const observer = new ResizeObserver(() => {
            const target = ref.current;
            if (!target || target.getBoundingClientRect().width === 0) {
                return;
            }
            if (target.scrollHeight !== lastScrollHeight) {
                lastScrollHeight = target.scrollHeight;
                fitToContent();
            }
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, [fitToContent]);

    return ref;
}
