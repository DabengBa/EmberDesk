import * as stylex from '@stylexjs/stylex';

const motionOk = '@media (prefers-reduced-motion: no-preference)';

/**
 * Shared chip-style list editor chrome (character tags, WI keywords, ...).
 * Keep in sync with usages in app/components/fields/TagChipInput.tsx.
 */
export const chipInputStyles = stylex.create({
    box: {
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '4px',
        padding: '3px 5px',
        minHeight: 'calc(var(--mainFontSize) * 1.9)',
        borderRadius: '5px',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: {
            default: 'var(--form-control-border-color)',
            ':focus-within': 'color-mix(in srgb, var(--SmartThemeQuoteColor) 65%, transparent)',
        },
        backgroundColor: 'var(--form-control-bg)',
        boxShadow: {
            ':focus-within': '0 0 0 3px color-mix(in srgb, var(--SmartThemeQuoteColor) 16%, transparent)',
        },
        cursor: 'text',
        transition: {
            [motionOk]: 'border-color 0.12s ease, box-shadow 0.12s ease',
        },
    },
    chip: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        maxWidth: '100%',
        padding: '1px 4px 1px 8px',
        borderRadius: '6px',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'color-mix(in srgb, var(--SmartThemeQuoteColor) 38%, transparent)',
        backgroundColor: 'color-mix(in srgb, var(--SmartThemeQuoteColor) 10%, transparent)',
        color: 'color-mix(in srgb, var(--SmartThemeBodyColor) 88%, transparent)',
        fontFamily: 'var(--monoFontFamily)',
        fontSize: 'calc(var(--mainFontSize) * 0.76)',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
    },
    chipRemove: {
        flex: '0 0 auto',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '15px',
        height: '15px',
        borderRadius: '4px',
        borderWidth: 0,
        backgroundColor: {
            default: 'transparent',
            ':hover': 'color-mix(in srgb, var(--SmartThemeQuoteColor) 26%, transparent)',
        },
        color: {
            default: 'color-mix(in srgb, var(--SmartThemeBodyColor) 50%, transparent)',
            ':hover': 'var(--SmartThemeQuoteColor)',
        },
        fontSize: 'calc(var(--mainFontSize) * 0.72)',
        lineHeight: 1,
        cursor: 'pointer',
        padding: 0,
    },
    input: {
        flex: '1 1 48px',
        minWidth: '48px',
        borderWidth: 0,
        backgroundColor: 'transparent',
        color: 'inherit',
        fontFamily: 'var(--monoFontFamily)',
        fontSize: 'calc(var(--mainFontSize) * 0.82)',
        padding: '2px 2px',
        outline: 'none',
    },
});
