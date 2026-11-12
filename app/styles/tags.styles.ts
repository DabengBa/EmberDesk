import * as stylex from '@stylexjs/stylex';

/**
 * Local chrome for the tag management / bulk tag surfaces. Item rows, chips
 * and controls keep their legacy classes in public/css/tags.css; only the
 * additions React needs (keyboard focus ring, suggestion list) live here.
 */
export const tagSurfaceStyles = stylex.create({
    focusable: {
        outlineStyle: 'none',
        outlineWidth: 0,
        borderRadius: '4px',
        ':focus-visible': {
            outlineWidth: '2px',
            outlineStyle: 'solid',
            outlineColor: 'var(--SmartThemeQuoteColor)',
            outlineOffset: '2px',
        },
    },
    pickerAnchor: {
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
    },
    nameInput: {
        font: 'inherit',
        minWidth: 0,
    },
    name: {
        minWidth: 0,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
    },
    counter: {
        whiteSpace: 'nowrap',
    },
    suggestionAnchor: {
        position: 'relative',
        flex: 1,
        minWidth: 0,
    },
    suggestionList: {
        position: 'absolute',
        top: '100%',
        left: 0,
        right: 0,
        zIndex: 10000,
        maxHeight: '240px',
        overflowY: 'auto',
        margin: 0,
        padding: '4px 0',
        listStyle: 'none',
        borderRadius: '5px',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'var(--SmartThemeBorderColor)',
        backgroundColor: 'var(--SmartThemeBlurTintColor)',
        boxShadow: '0 4px 12px var(--black50a)',
    },
    suggestionItem: {
        padding: '3px 8px',
        cursor: 'pointer',
        backgroundColor: 'transparent',
    },
    suggestionActive: {
        backgroundColor: 'color-mix(in srgb, var(--SmartThemeQuoteColor) 25%, transparent)',
    },
    status: {
        minHeight: '1.2em',
        opacity: 0.85,
    },
});
