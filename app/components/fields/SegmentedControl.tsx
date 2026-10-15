import * as stylex from '@stylexjs/stylex';
import type { StyleXStyles } from '@stylexjs/stylex';
import type { ReactNode } from 'react';
import { controlStyles } from '@/styles/controls.styles';



export type SegmentedControlOption<T extends string | number | boolean> = {
    value: T;
    label: ReactNode;
    disabled?: boolean;
};

/**
 * Shared segmented option group: role="group" container of aria-pressed
 * buttons. `fallbackLabel` renders one disabled "pressed" option when the
 * current value is not among `options` (e.g. retired values round-tripping).
 */
export function SegmentedControl<T extends string | number | boolean>({
    options,
    value,
    onSelect,
    ariaLabel,
    attrs,
    fallbackLabel,
    sx,
}: {
    options: ReadonlyArray<SegmentedControlOption<T>>;
    value: T;
    onSelect: (value: T) => void;
    ariaLabel: string;
    /** Extra HTML attributes (data-*, id, name, aria-*) spread onto the root element. */
    attrs?: Record<string, string>;
    fallbackLabel?: ReactNode;
    sx?: StyleXStyles;
}) {
    const hasMatch = options.some(option => option.value === value);
    return (
        <div {...stylex.props(controlStyles.segmented, sx ?? null)} role="group" aria-label={ariaLabel} {...attrs}>
            {options.map(option => (
                <button
                    key={String(option.value)}
                    type="button"
                    {...stylex.props(
                        controlStyles.segOption,
                        value === option.value ? controlStyles.segOptionOn : null,
                        option.disabled ? controlStyles.segOptionDisabled : null,
                    )}
                    aria-pressed={value === option.value}
                    disabled={option.disabled}
                    onClick={() => {
                        if (value !== option.value && !option.disabled) {
                            onSelect(option.value);
                        }
                    }}
                >
                    {option.label}
                </button>
            ))}
            {!hasMatch && fallbackLabel !== undefined ? (
                <button
                    type="button"
                    {...stylex.props(controlStyles.segOption, controlStyles.segOptionDisabled)}
                    disabled
                    aria-pressed="true"
                >
                    {fallbackLabel}
                </button>
            ) : null}
        </div>
    );
}
