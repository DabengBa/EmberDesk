import * as stylex from '@stylexjs/stylex';

const motionOk = '@media (prefers-reduced-motion: no-preference)';

/**
 * Shared control chrome for StyleX surfaces: switches, checkboxes,
 * decorative check marks, and segmented option groups. Keep in sync with
 * usages in app/components/fields/.
 */
export const controlStyles = stylex.create({
    /* Pill switch (role="switch" button + knob). Canonical 34×18 track. */
    switch: {
        position: 'relative',
        flex: '0 0 auto',
        width: '34px',
        height: '18px',
        borderRadius: '999px',
        alignSelf: 'center',
        padding: 0,
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'color-mix(in srgb, var(--SmartThemeBodyColor) 30%, transparent)',
        backgroundColor: 'color-mix(in srgb, var(--SmartThemeBodyColor) 18%, transparent)',
        cursor: 'pointer',
        transition: {
            [motionOk]: 'background-color 0.14s ease, border-color 0.14s ease',
        },
        outline: {
            ':focus-visible': '1px solid var(--interactable-outline-color)',
        },
        outlineOffset: {
            ':focus-visible': '1px',
        },
        opacity: {
            ':disabled': 0.5,
        },
    },
    switchOn: {
        borderColor: 'color-mix(in srgb, var(--SmartThemeQuoteColor) 60%, transparent)',
        backgroundColor: 'color-mix(in srgb, var(--SmartThemeQuoteColor) 55%, transparent)',
    },
    /* Green "enabled" semantics — entry-state switches on list rows. */
    switchOnSuccess: {
        borderColor: 'color-mix(in srgb, var(--success-green) 70%, transparent)',
        backgroundColor: 'color-mix(in srgb, var(--success-green) 65%, transparent)',
    },
    switchKnob: {
        position: 'absolute',
        top: '2px',
        left: '2px',
        width: '12px',
        height: '12px',
        borderRadius: '999px',
        backgroundColor: 'color-mix(in srgb, var(--SmartThemeBodyColor) 80%, transparent)',
        transition: {
            [motionOk]: 'transform 0.14s ease, background-color 0.14s ease',
        },
    },
    switchKnobOn: {
        transform: 'translateX(16px)',
        backgroundColor: '#fff',
    },
    /* Native checkbox input — compact accent-tinted box. */
    checkbox: {
        width: '16px',
        height: '16px',
        marginTop: '2px',
        accentColor: 'var(--SmartThemeQuoteColor)',
        cursor: 'pointer',
        outline: {
            ':focus-visible': '1px solid var(--interactable-outline-color)',
        },
        outlineOffset: { ':focus-visible': '2px' },
    },
    /* Decorative checked-box indicator for non-input contexts (list rows). */
    check: {
        flex: '0 0 auto',
        width: '16px',
        height: '16px',
        marginTop: '2px',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'color-mix(in srgb, var(--SmartThemeBorderColor) 90%, var(--SmartThemeBodyColor) 10%)',
        borderRadius: '4px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.68em',
        lineHeight: 1,
        color: 'transparent',
    },
    checkOn: {
        backgroundColor: 'var(--SmartThemeQuoteColor)',
        color: 'var(--SmartThemeBlurTintColor)',
        borderColor: 'var(--SmartThemeQuoteColor)',
    },
    /* Segmented option group (role="group" + aria-pressed buttons). */
    segmented: {
        display: 'inline-flex',
        alignItems: 'stretch',
        borderRadius: '8px',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'color-mix(in srgb, var(--SmartThemeBorderColor) 72%, transparent)',
        backgroundColor: 'color-mix(in srgb, var(--SmartThemeBlurTintColor) 70%, var(--black70a) 30%)',
        overflow: 'hidden',
    },
    segOption: {
        padding: '4px 10px',
        borderWidth: 0,
        borderStyle: 'none',
        backgroundColor: 'transparent',
        color: 'color-mix(in srgb, var(--SmartThemeBodyColor) 66%, transparent)',
        fontSize: 'calc(var(--mainFontSize) * 0.78)',
        fontWeight: 600,
        fontFamily: 'inherit',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        transition: {
            [motionOk]: 'background-color 0.12s ease, color 0.12s ease',
        },
        outline: {
            ':focus-visible': '1px solid var(--interactable-outline-color)',
        },
        outlineOffset: {
            ':focus-visible': '1px',
        },
    },
    segOptionOn: {
        backgroundColor: 'color-mix(in srgb, var(--SmartThemeQuoteColor) 22%, transparent)',
        color: 'var(--SmartThemeQuoteColor)',
    },
    segOptionDisabled: {
        opacity: 0.5,
        cursor: 'default',
    },
});
