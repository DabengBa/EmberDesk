import { useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';

/** Synchronize the compatibility select with temporary search ordering. */
export function updateCharacterSearchSort(
    selector: Pick<HTMLSelectElement, 'options'> | null,
    searchTerm: unknown,
    saved: { field: string; order: string },
): boolean {
    if (!selector) return false;
    const options = Array.from(selector.options);
    const search = options.find(option => option.dataset.field === 'search');
    if (!search) return false;
    if (searchTerm && search.hidden) {
        search.hidden = false;
        search.selected = true;
        return true;
    }
    if (!searchTerm && !search.hidden) {
        search.hidden = true;
        const previous = options.find(option => option.dataset.field === saved.field && option.dataset.order === saved.order);
        if (previous) previous.selected = true;
    }
    return false;
}

export function numericWheelValue(current: number, step: number, min: number, max: number, deltaY: number): number | null {
    if (Number.isNaN(current) || Number.isNaN(step) || step <= 0 || deltaY === 0) return null;
    let value = Math.round((current + (deltaY > 0 ? -step : step)) / step) * step;
    if (!Number.isNaN(min)) value = Math.max(value, min);
    if (!Number.isNaN(max)) value = Math.min(value, max);
    return Math.round(value * 1e10) / 1e10;
}

export function useInlineDrawer() {
    const [open, setOpen] = useState(false);
    const content = useRef<HTMLDivElement>(null);
    const changed = useRef(false);
    useLayoutEffect(() => {
        if (!changed.current || !content.current || CSS.supports('field-sizing', 'content')) return;
        for (const textarea of content.current.querySelectorAll('textarea.autoSetHeight')) {
            if (textarea instanceof HTMLTextAreaElement) {
                textarea.style.height = '0px';
                textarea.style.height = `${textarea.scrollHeight + 3}px`;
            }
        }
    }, [open]);
    const toggle = (header: HTMLElement) => {
        header.closest('.inline-drawer')?.dispatchEvent(new CustomEvent('inline-drawer-toggle', { bubbles: true }));
        changed.current = true;
        setOpen(value => !value);
    };
    return {
        open, content,
        onClick(event: MouseEvent<HTMLElement>) {
            if (event.target instanceof Element && event.target.classList.contains('text_pole')) return;
            toggle(event.currentTarget);
        },
        onKeyDown(event: KeyboardEvent<HTMLElement>) {
            if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
            event.preventDefault();
            toggle(event.currentTarget);
        },
    };
}

export { createWorkspaceDrawerService } from './workspace-drawer-domain';
export type { WorkspaceDrawer, WorkspaceDrawerPorts } from './workspace-drawer-domain';
