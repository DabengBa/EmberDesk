import { Button, type ButtonProps, type ButtonSize, type ButtonVariant } from '@astryxdesign/core';
import type { CSSProperties, MouseEventHandler, ReactNode } from 'react';
import { useTranslated } from '../../compat/i18n.js';
import { i18nSpec } from './contract-i18n';

/**
 * Contract-preserving wrapper over Astryx Button.
 *
 * Bridges the legacy DOM contract onto the component:
 * - `id`, `className`, `data-*`, `role`, `tabIndex`, `style` pass straight
 *   through (BaseProps keeps them), so delegated jQuery handlers and
 *   source-contract tests keep matching the rendered `<button>`.
 * - `title`/`titleKey` becomes the Astryx `tooltip` prop, translated via
 *   `useTranslated` (re-renders when applyLocale finishes after mount).
 * - `label` stays the accessible name; when the button shows text, a child
 *   `<span data-i18n>` keeps the observer-facing translation hook.
 */
export interface ContractButtonProps {
    id?: string;
    /** Legacy contract classes (e.g. 'menu_button interactable'). */
    className?: string;
    /** Accessible name + default visible text (English fallback). */
    label: string;
    /** i18n key for the label; defaults to `label` itself. */
    labelKey?: string;
    /** Tooltip text (English fallback). */
    title?: string;
    /** i18n key for the tooltip; defaults to `title` itself. */
    titleKey?: string;
    /** Leading icon — pass a FontAwesome node like `<i className="fa-solid fa-x" />`. */
    icon?: ReactNode;
    /** Icon-only button: label renders as aria-label only. */
    iconOnly?: boolean;
    variant?: ButtonVariant;
    size?: ButtonSize;
    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
    onClick?: MouseEventHandler<HTMLButtonElement>;
    clickAction?: ButtonProps['clickAction'];
    width?: ButtonProps['width'];
    endContent?: ReactNode;
    style?: CSSProperties;
    role?: string;
    tabIndex?: number;
    /** Additional `data-*` / aria attributes forwarded to the button. */
    [key: `data-${string}`]: string | undefined;
}

export function ContractButton({
    id,
    className,
    label,
    labelKey,
    title,
    titleKey,
    icon,
    iconOnly = false,
    variant = 'secondary',
    size,
    type = 'button',
    disabled = false,
    onClick,
    clickAction,
    width,
    endContent,
    style,
    role,
    tabIndex,
    ...rest
}: ContractButtonProps) {
    const resolvedLabel = useTranslated(label, labelKey ?? null);
    const tooltip = useTranslated(title ?? '', titleKey ?? null);
    const ariaKey = labelKey ?? label;
    return (
        <Button
            id={id}
            className={className}
            variant={variant}
            size={size}
            type={type}
            isDisabled={disabled}
            onClick={onClick}
            clickAction={clickAction}
            width={width}
            icon={icon}
            isIconOnly={iconOnly}
            label={resolvedLabel}
            tooltip={tooltip || undefined}
            endContent={iconOnly ? undefined : endContent}
            style={style}
            role={role}
            tabIndex={tabIndex}
            data-i18n={i18nSpec({ ariaLabel: ariaKey })}
            {...rest}
        >
            {iconOnly ? undefined : <span data-i18n={ariaKey}>{resolvedLabel}</span>}
        </Button>
    );
}
