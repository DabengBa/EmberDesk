import { IconButton } from '@astryxdesign/core';
import type { CSSProperties, MouseEventHandler, ReactNode } from 'react';
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
    /** Icon node — typically `<i className="fa-solid fa-x" aria-hidden />`. */
    icon: ReactNode;
    variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';
    size?: 'sm' | 'md' | 'lg';
    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
    onClick?: MouseEventHandler<HTMLButtonElement>;
    style?: CSSProperties;
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
    icon,
    variant = 'ghost',
    size,
    type = 'button',
    disabled = false,
    onClick,
    style,
    tabIndex,
    ...rest
}: ContractIconButtonProps) {
    const resolvedLabel = useTranslated(label, labelKey ?? null);
    const tooltip = useTranslated(title ?? '', titleKey ?? null);
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
            tooltip={tooltip || undefined}
            style={style}
            tabIndex={tabIndex}
            data-i18n={i18nSpec({ ariaLabel: labelKey ?? label })}
            {...rest}
        />
    );
}
