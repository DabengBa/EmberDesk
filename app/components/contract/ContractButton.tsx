import { Button, type ButtonProps, type ButtonSize, type ButtonVariant } from '@astryxdesign/core';
import type { StyleXStyles } from '@stylexjs/stylex';
import { useCallback, type CSSProperties, type MouseEventHandler, type ReactNode } from 'react';
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
    /**
     * Accessible name when it differs from the visible label (e.g. icon+short
     * label toolbar buttons whose aria-label carries the full action name).
     * Defaults to `label`.
     */
    ariaLabel?: string;
    /** i18n key for `ariaLabel`; defaults to `ariaLabel` itself. */
    ariaLabelKey?: string;
    /** Class applied to the visible label span (legacy label hooks). */
    labelClassName?: string;
    /** Tooltip text (English fallback). */
    title?: string;
    /** i18n key for the tooltip; defaults to `title` itself. */
    titleKey?: string;
    /**
     * Emit a real `title` attribute instead of the Astryx tooltip layer.
     * See ContractIconButton: use inside dense legacy rows/popups where an
     * anchor-positioned tooltip element would overflow document scrollWidth.
     */
    nativeTitle?: boolean;
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
    /** StyleX overrides merged by Astryx `xstyle` (boosted specificity). */
    xstyle?: StyleXStyles;
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
    ariaLabel,
    ariaLabelKey,
    labelClassName,
    title,
    titleKey,
    nativeTitle = false,
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
    xstyle,
    role,
    tabIndex,
    ...rest
}: ContractButtonProps) {
    const resolvedLabel = useTranslated(label, labelKey ?? null);
    const resolvedAriaLabel = useTranslated(ariaLabel ?? label, ariaLabelKey ?? null);
    const resolvedTitle = useTranslated(title ?? '', titleKey ?? null);
    const ariaKey = ariaLabelKey ?? ariaLabel ?? label;
    const nativeTitleRef = useCallback((el: HTMLButtonElement | null) => {
        if (el && resolvedTitle) {
            el.setAttribute('title', resolvedTitle);
        }
    }, [resolvedTitle]);
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
            label={resolvedAriaLabel}
            tooltip={nativeTitle ? undefined : resolvedTitle || undefined}
            endContent={iconOnly ? undefined : endContent}
            style={style}
            xstyle={xstyle}
            role={role}
            tabIndex={tabIndex}
            ref={nativeTitle ? nativeTitleRef : undefined}
            data-i18n={i18nSpec({ title: nativeTitle ? titleKey ?? title : undefined, ariaLabel: ariaKey })}
            {...rest}
        >
            {iconOnly ? undefined : <span className={labelClassName} data-i18n={labelKey ?? label}>{resolvedLabel}</span>}
        </Button>
    );
}
