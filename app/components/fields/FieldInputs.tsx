import * as stylex from '@stylexjs/stylex';
import type { StyleXStyles } from '@stylexjs/stylex';
import type { ComponentPropsWithRef } from 'react';

function mergedClassName(sx: StyleXStyles | undefined, className: string | undefined) {
    const sxClass = sx ? stylex.props(sx).className ?? '' : '';
    return ['text_pole', sxClass, className].filter(Boolean).join(' ');
}

/**
 * Field wrappers around the shared `text_pole` theme skin: the legacy class
 * supplies the themed look, `sx` layers StyleX overrides on top.
 */
export function FieldTextInput({
    sx,
    className,
    ...rest
}: {
    sx?: StyleXStyles;
} & ComponentPropsWithRef<'input'>) {
    return <input className={mergedClassName(sx, className)} {...rest} />;
}

export function FieldTextArea({
    sx,
    className,
    ...rest
}: {
    sx?: StyleXStyles;
} & ComponentPropsWithRef<'textarea'>) {
    return <textarea className={mergedClassName(sx, className)} {...rest} />;
}

export function FieldSelect({
    sx,
    className,
    children,
    ...rest
}: {
    sx?: StyleXStyles;
} & ComponentPropsWithRef<'select'>) {
    return <select className={mergedClassName(sx, className)} {...rest}>{children}</select>;
}
