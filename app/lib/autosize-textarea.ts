import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * Autosize a textarea to its content height. Besides re-fitting on `value`
 * change, a ResizeObserver re-measures whenever the element becomes visible
 * again after being mounted/hidden (where scrollHeight reads ~0 and the
 * pinned inline height would otherwise stay collapsed forever).
 */
export function useAutosizeTextareaRef<T extends HTMLTextAreaElement = HTMLTextAreaElement>(
    value: string,
): RefObject<T | null> {
    const ref = useRef<T | null>(null);

    const fitToContent = useCallback(() => {
        const element = ref.current;
        if (!element) {
            return;
        }
        element.style.height = 'auto';
        element.style.height = `${element.scrollHeight}px`;
    }, []);

    useLayoutEffect(fitToContent, [value, fitToContent]);

    useEffect(() => {
        const element = ref.current;
        if (!element || typeof ResizeObserver === 'undefined') {
            return;
        }
        const observer = new ResizeObserver(() => {
            const target = ref.current;
            if (!target || target.getBoundingClientRect().width === 0) {
                return;
            }
            if (target.style.height !== `${target.scrollHeight}px`) {
                fitToContent();
            }
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, [fitToContent]);

    return ref;
}
