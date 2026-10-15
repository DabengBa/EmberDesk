import * as stylex from '@stylexjs/stylex';
import type { StyleXStyles } from '@stylexjs/stylex';
import type { MouseEvent } from 'react';
import { controlStyles } from '@/styles/controls.styles';



/**
 * Shared pill switch: a role="switch" button with track + knob.
 * `onToggle` receives the next checked value and the click event so callers
 * inside clickable rows can stopPropagation.
 */
export function FieldSwitch({
    checked,
    onToggle,
    disabled = false,
    title,
    ariaLabel,
    attrs,
    variant = 'accent',
    sx,
}: {
    checked: boolean;
    onToggle: (next: boolean, event: MouseEvent<HTMLButtonElement>) => void;
    disabled?: boolean;
    title?: string;
    ariaLabel?: string;
    /** Extra HTML attributes (data-*, id, name, aria-*) spread onto the root element. */
    attrs?: Record<string, string>;
    /** 'accent' = theme accent; 'success' = green enabled-state semantics. */
    variant?: 'accent' | 'success';
    sx?: StyleXStyles;
}) {
    const onStyle = variant === 'success' ? controlStyles.switchOnSuccess : controlStyles.switchOn;
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={ariaLabel}
            title={title}
            disabled={disabled}
            {...attrs}
            {...stylex.props(controlStyles.switch, checked ? onStyle : null, sx ?? null)}
            onClick={event => onToggle(!checked, event)}
        >
            <span {...stylex.props(controlStyles.switchKnob, checked ? controlStyles.switchKnobOn : null)} aria-hidden="true" />
        </button>
    );
}
