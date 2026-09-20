import { Tooltip, type TooltipProps } from '@astryxdesign/core';
import type { ReactElement, ReactNode } from 'react';
import { useTranslated } from '../../compat/i18n.js';

/**
 * Contract-preserving tooltip wrapper for non-button elements.
 *
 * For elements whose legacy `title` attribute cannot ride the
 * Button/IconButton `tooltip` prop (plain divs, spans, inputs that stay
 * uncontrolled). Wraps the child (display:contents — the child's ref and
 * DOM contract are preserved) and renders the Astryx tooltip surface.
 *
 * The wrapped element should NOT keep a `title` attribute or a
 * `data-i18n="[title]…"` spec — that would render a second, native tooltip.
 */
export interface ContractTooltipProps {
    /** Tooltip text (English fallback). */
    title: string;
    /** i18n key for the tooltip; defaults to `title` itself. */
    titleKey?: string;
    placement?: TooltipProps['placement'];
    alignment?: TooltipProps['alignment'];
    delay?: TooltipProps['delay'];
    children: ReactNode;
}

export function ContractTooltip({
    title,
    titleKey,
    placement,
    alignment,
    delay,
    children,
}: ContractTooltipProps): ReactElement {
    const content = useTranslated(title, titleKey ?? null);
    return (
        <Tooltip content={content} placement={placement} alignment={alignment} delay={delay}>
            {children}
        </Tooltip>
    );
}
