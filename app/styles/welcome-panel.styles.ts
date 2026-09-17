import * as stylex from '@stylexjs/stylex';

export const welcomePanelStyles = stylex.create({
    panel: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        padding: '12px 14px',
        width: '100%',
        [stylex.when.ancestor('[data-bubblechat]')]: {
            borderRadius: 10,
            backgroundColor: 'var(--SmartThemeBotMesBlurTintColor)',
            borderWidth: 1,
            borderStyle: 'solid',
            borderColor: 'var(--SmartThemeBorderColor)',
            marginBottom: 5,
        },
    },
    headerTitle: {
        margin: 0,
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 9,
        minHeight: 42,
        padding: '6px 12px 6px 7px',
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: 'color-mix(in srgb, var(--SmartThemeQuoteColor) 34%, var(--SmartThemeBorderColor) 66%)',
        borderRadius: 12,
        background: 'linear-gradient(135deg, color-mix(in srgb, var(--SmartThemeQuoteColor) 18%, transparent), transparent 62%), color-mix(in srgb, var(--SmartThemeBlurTintColor) 92%, var(--black50a) 8%)',
        boxShadow: '0 10px 28px color-mix(in srgb, var(--black70a) 52%, transparent)',
    },
    headerVersion: {
        color: 'var(--SmartThemeBodyColor)',
        fontSize: 'calc(var(--mainFontSize) * 1.05)',
        fontWeight: 700,
        letterSpacing: '0.01em',
    },
    headerLogo: {
        width: 30,
        height: 30,
        filter: 'drop-shadow(0 0 8px color-mix(in srgb, var(--SmartThemeQuoteColor) 58%, transparent))',
    },
});
