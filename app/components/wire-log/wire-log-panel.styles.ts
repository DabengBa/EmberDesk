import * as stylex from '@stylexjs/stylex';

/**
 * Wire Log overlay chrome. Mirrors the prompt-inspector overlay so both
 * diagnostics surfaces read as one family; the browser inside keeps its own
 * `wire-log.styles.ts` module.
 */

export const panelStyles = stylex.create({
    overlay: {
        width: '100%',
        height: '100%',
        maxWidth: 'none',
        maxHeight: 'none',
        margin: 0,
        borderWidth: 0,
        color: 'inherit',
        position: 'fixed',
        inset: 0,
        zIndex: 4000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        padding: '4vh 4vw',
    },
    panel: {
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        width: '1100px',
        maxWidth: '100%',
        height: '820px',
        maxHeight: '100%',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'var(--SmartThemeBorderColor)',
        borderRadius: '10px',
        backgroundColor: 'var(--SmartThemeBlurTintColor)',
        boxShadow: '0 8px 40px rgba(0, 0, 0, 0.5)',
        overflow: 'hidden',
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '8px',
        flexShrink: 0,
        borderBottomWidth: '1px',
        borderBottomStyle: 'solid',
        borderBottomColor: 'var(--SmartThemeBorderColor)',
        padding: '12px 14px',
    },
    title: {
        fontSize: '1rem',
        fontWeight: 600,
    },
    scope: {
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        maxWidth: '40%',
        color: 'var(--SmartThemeFadedColor, rgb(188, 188, 180))',
        fontFamily: 'var(--monoFontFamily, monospace)',
        fontSize: '0.85rem',
    },
    spacer: {
        flex: '1 1 auto',
    },
    button: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '32px',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'var(--SmartThemeBorderColor)',
        borderRadius: '5px',
        backgroundColor: 'var(--black50a)',
        color: 'var(--SmartThemeBodyColor)',
        fontFamily: 'inherit',
        fontSize: '0.85rem',
        cursor: 'pointer',
        padding: '4px 10px',
        whiteSpace: 'nowrap',
        opacity: { ':disabled': 0.55 },
    },
    buttonActive: {
        borderColor: 'var(--SmartThemeQuoteColor)',
        color: 'var(--SmartThemeQuoteColor)',
    },
    body: {
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        padding: '10px 14px',
    },
});
