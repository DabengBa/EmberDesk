import { IconButton } from '@astryxdesign/core';
import type { StyleXStyles } from '@stylexjs/stylex';
import { useCallback, type CSSProperties, type MouseEventHandler, type ReactNode } from 'react';
import { useTranslated } from '../../compat/i18n.js';
import { i18nSpec } from './contract-i18n';

/**
 * Contract-preserving wrapper over Astryx IconButton.
 *
 * Replaces legacy icon-only action elements like
 * `<div id="send_but" className="fa-solid fa-paper-plane interactable"
 *   role="button" title="…" data-i18n="[title]…;[aria-label]…">` with a real
 * `<button>` that keeps the same `id`/classes/`data-*` so delegated jQuery
 * handlers and contract tests keep matching.
 */
export interface ContractIconButtonProps {
    id?: string;
    /** Legacy contract classes (e.g. 'interactable displayNone'). */
    className?: string;
    /** Accessible name (English fallback; rendered as aria-label). */
    label: string;
    /** i18n key for the label; defaults to `label` itself. */
    labelKey?: string;
    /** Tooltip text (English fallback). */
    title?: string;
    /** i18n key for the tooltip; defaults to `title` itself. */
    titleKey?: string;
    /**
     * Emit a real `title` attribute instead of the Astryx tooltip layer.
     * Use for contract elements inside dense legacy flex rows where an
     * anchor-positioned tooltip element would extend past the viewport edge
     * and widen document scrollWidth (e.g. the chat composer). The legacy
     * i18n `[title]` spec keeps translating the attribute.
     */
    nativeTitle?: boolean;
    /** Icon node — typically `<i className="fa-solid fa-x" aria-hidden />`. */
    icon: ReactNode;
    variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';
    size?: 'sm' | 'md' | 'lg';
    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
    onClick?: MouseEventHandler<HTMLButtonElement>;
    style?: CSSProperties;
    /**
     * StyleX overrides merged by Astryx `xstyle`. Note StyleX atomic classes
     * carry boosted specificity (`:not(#\#)` ×3 ≈ 0-4-0), so they override
     * ordinary legacy stylesheet rules — inline `.css()` writes still win,
     * which is the escape hatch used by legacy visibility toggles.
     */
    xstyle?: StyleXStyles;
    tabIndex?: number;
    [key: `data-${string}`]: string | undefined;
}

export function ContractIconButton({
    id,
    className,
    label,
    labelKey,
    title,
    titleKey,
    nativeTitle = false,
    icon,
    variant = 'ghost',
    size,
    type = 'button',
    disabled = false,
    onClick,
    style,
    xstyle,
    tabIndex,
    ...rest
}: ContractIconButtonProps) {
    const resolvedLabel = useTranslated(label, labelKey ?? null);
    const resolvedTitle = useTranslated(title ?? '', titleKey ?? null);
    const nativeTitleRef = useCallback((el: HTMLButtonElement | null) => {
        if (el && resolvedTitle) {
            el.setAttribute('title', resolvedTitle);
        }
    }, [resolvedTitle]);
    return (
        <IconButton
            id={id}
            className={className}
            variant={variant}
            size={size}
            type={type}
            isDisabled={disabled}
            onClick={onClick}
            icon={icon}
            label={resolvedLabel}
            tooltip={nativeTitle ? undefined : resolvedTitle || undefined}
            style={style}
            xstyle={xstyle}
            tabIndex={tabIndex}
            ref={nativeTitle ? nativeTitleRef : undefined}
            data-i18n={i18nSpec({ title: nativeTitle ? titleKey ?? title : undefined, ariaLabel: labelKey ?? label })}
            {...rest}
        />
    );
}
