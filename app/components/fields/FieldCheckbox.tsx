import * as stylex from '@stylexjs/stylex';
import type { StyleXStyles } from '@stylexjs/stylex';
import type { InputHTMLAttributes } from 'react';
import { controlStyles } from '@/styles/controls.styles';



/**
 * Shared native checkbox with the standard accent/focus treatment.
 * Label/description markup stays with the caller; this owns only the input.
 */
export function FieldCheckbox({
    sx,
    ...rest
}: {
    sx?: StyleXStyles;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'sx'>) {
    return (
        <input
            type="checkbox"
            {...rest}
            {...stylex.props(controlStyles.checkbox, sx ?? null)}
        />
    );
}
