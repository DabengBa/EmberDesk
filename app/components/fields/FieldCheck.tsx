import * as stylex from '@stylexjs/stylex';
import type { StyleXStyles } from '@stylexjs/stylex';
import { controlStyles } from '@/styles/controls.styles';



/**
 * Decorative checked-box indicator for contexts where a native checkbox
 * input cannot sit inside the interactive row (e.g. the row itself is the
 * click target). Purely visual — accessibility is owned by the row.
 */
export function FieldCheck({
    checked,
    sx,
}: {
    checked: boolean;
    sx?: StyleXStyles;
}) {
    return (
        <span {...stylex.props(controlStyles.check, checked ? controlStyles.checkOn : null, sx ?? null)} aria-hidden="true">
            <i className="fa-solid fa-check" aria-hidden="true" />
        </span>
    );
}
