import * as stylex from '@stylexjs/stylex';

const overlayFadeIn = stylex.keyframes({
    from: { opacity: 0 },
    to: { opacity: 1 },
});

const reducedMotion = '@media (prefers-reduced-motion: reduce)';
const narrow = '@media (max-width: 720px)';
const medium = '@media (max-width: 960px)';
const phone = '@media (max-width: 639px)';

export const settingsStyles = stylex.create({
    page: {
        '--settings-body': 'var(--SmartThemeBodyColor, rgb(220, 220, 210))',
        '--settings-faded': 'var(--SmartThemeFadedColor, rgb(188, 188, 180))',
        '--settings-muted': 'color-mix(in srgb, var(--settings-body) 62%, var(--settings-surface) 38%)',
        '--settings-surface': 'var(--SmartThemeBlurTintColor, rgb(23, 23, 23))',
        '--settings-surface-raised': 'color-mix(in srgb, var(--settings-surface) 78%, var(--black70a, rgba(0, 0, 0, 0.7)) 22%)',
        '--settings-surface-sunken': 'color-mix(in srgb, var(--settings-surface) 42%, var(--black70a, rgba(0, 0, 0, 0.7)) 58%)',
        '--settings-border': 'color-mix(in srgb, var(--SmartThemeBorderColor, rgba(0, 0, 0, 0.5)) 72%, var(--settings-body) 12%)',
        '--settings-focus': 'var(--interactable-outline-color, var(--SmartThemeQuoteColor, rgb(232, 138, 36)))',
        '--settings-accent': 'var(--SmartThemeQuoteColor, rgb(232, 138, 36))',
        '--settings-danger': 'var(--clay-warning, rgb(215, 136, 114))',
        '--settings-success': 'var(--success-green, rgb(88, 182, 0))',
        minHeight: '100dvh',
        background: 'radial-gradient(circle at top left, color-mix(in srgb, var(--settings-accent) 8%, transparent) 0 18rem, transparent 28rem), color-mix(in srgb, var(--settings-surface) 92%, var(--black70a, rgba(0, 0, 0, 0.7)) 8%)',
        color: 'var(--settings-body)',
        fontFamily: 'var(--mainFontFamily, \'Noto Sans\', system-ui, sans-serif)',
        fontSize: 'var(--mainFontSize, 15px)',
        textShadow: 'none',
    },
    pageOverlay: {
        minHeight: 0,
        height: '100%',
        background: 'radial-gradient(circle at top left, color-mix(in srgb, var(--settings-accent) 8%, transparent) 0 12rem, transparent 22rem), color-mix(in srgb, var(--settings-surface) 92%, var(--black70a, rgba(0, 0, 0, 0.7)) 8%)',
    },
    layout: {
        display: 'flex',
        width: 'min(100%, 1280px)',
        margin: '0 auto',
        padding: {
            default: '20px',
            [medium]: '10px',
        },
        gap: '15px',
        flexDirection: {
            default: 'row',
            [medium]: 'column',
        },
    },
    layoutOverlay: {
        width: '100%',
        maxWidth: 'none',
        height: {
            default: '100%',
            // On phone the dialog itself scrolls; letting the layout grow
            // naturally keeps the tab panel readable instead of squeezing it
            // against the fixed-height side panels.
            [phone]: 'auto',
        },
        margin: 0,
        padding: '15px',
        minHeight: {
            [phone]: '100%',
        },
    },
    panel: {
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'var(--settings-border)',
        borderRadius: '10px',
        background: 'var(--settings-surface-raised)',
        backdropFilter: 'blur(calc(var(--SmartThemeBlurStrength, 10) * 1px))',
        padding: {
            default: null,
            [narrow]: '10px',
        },
    },
    mainPanel: {
        flex: '1 1 auto',
        minWidth: 0,
        padding: {
            default: '20px',
            [narrow]: '10px',
        },
    },
    mainPanelOverlay: {
        display: 'flex',
        minHeight: 0,
        maxHeight: '100%',
        overflow: 'hidden',
        flexDirection: 'column',
    },
    pageHeaderRow: {
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '1rem',
        flexWrap: 'wrap',
    },
    workspaceLink: {
        textDecoration: 'none',
        whiteSpace: 'nowrap',
    },
    pageHeader: {
        marginBottom: '15px',
    },
    pageTitle: {
        margin: 0,
        color: 'var(--settings-body)',
        fontSize: '1.5rem',
        fontWeight: 700,
        lineHeight: 1.4,
    },
    pageTitleOverlay: {
        fontSize: '1.05rem',
        fontWeight: 600,
    },
    pageSummary: {
        maxWidth: '72ch',
        margin: '5px 0 0',
        color: 'var(--settings-muted)',
        fontSize: '0.95rem',
        lineHeight: 1.5,
    },
    tabs: {
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
    },
    tabsList: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '5px',
    },
    button: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '32px',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'var(--settings-border)',
        borderRadius: '5px',
        background: {
            default: 'var(--settings-surface)',
            ':hover': 'color-mix(in srgb, var(--settings-body) 10%, var(--settings-surface) 90%)',
        },
        color: 'var(--settings-body)',
        fontFamily: 'inherit',
        fontSize: '0.95rem',
        fontWeight: 500,
        lineHeight: 1.3,
        cursor: {
            default: 'pointer',
            ':disabled': 'not-allowed',
        },
        opacity: {
            ':disabled': 0.55,
        },
        transition: 'background-color 250ms ease-out, border-color 250ms ease-out, color 250ms ease-out, opacity 250ms ease-out',
        transitionDuration: {
            [reducedMotion]: '0.01ms',
        },
        outline: {
            ':focus-visible': '1px solid var(--settings-focus)',
        },
        outlineOffset: { ':focus-visible': '2px' },
        padding: '5px 10px',
        whiteSpace: 'nowrap',
        width: {
            [narrow]: '100%',
        },
    },
    buttonPrimary: {
        borderColor: 'color-mix(in srgb, var(--settings-accent) 58%, var(--settings-border) 42%)',
        background: 'color-mix(in srgb, var(--settings-accent) 28%, var(--settings-surface) 72%)',
    },
    buttonSecondary: {
        background: 'transparent',
    },
    overlayClose: {
        width: 'auto',
        flex: '0 0 auto',
    },
    tab: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '32px',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'var(--settings-border)',
        borderRadius: '5px',
        background: {
            default: 'var(--settings-surface)',
            ':hover': 'color-mix(in srgb, var(--settings-body) 10%, var(--settings-surface) 90%)',
        },
        color: 'var(--settings-body)',
        fontFamily: 'inherit',
        fontSize: '0.95rem',
        fontWeight: 500,
        lineHeight: 1.3,
        cursor: 'pointer',
        transition: 'background-color 250ms ease-out, border-color 250ms ease-out, color 250ms ease-out, opacity 250ms ease-out',
        transitionDuration: {
            [reducedMotion]: '0.01ms',
        },
        padding: '5px 10px',
        outline: {
            ':focus-visible': '1px solid var(--settings-focus)',
        },
        outlineOffset: { ':focus-visible': '2px' },
    },
    tabActive: {
        borderColor: 'color-mix(in srgb, var(--settings-accent) 62%, var(--settings-border) 38%)',
        background: 'color-mix(in srgb, var(--settings-accent) 18%, var(--settings-surface) 82%)',
    },
    tabsDescription: {
        margin: 0,
        color: 'var(--settings-muted)',
        fontSize: '0.9rem',
        lineHeight: 1.4,
    },
    visuallyHidden: {
        position: 'absolute',
        width: '1px',
        height: '1px',
        margin: '-1px',
        overflow: 'hidden',
        clip: 'rect(0 0 0 0)',
        clipPath: 'inset(50%)',
        whiteSpace: 'nowrap',
    },
    stack: {
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        marginTop: '15px',
    },
    form: {
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
    },
    stackOverlay: {
        display: 'flex',
        minHeight: 0,
        flex: '1 1 auto',
        flexDirection: 'column',
    },
    section: {
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'var(--settings-border)',
        borderRadius: '10px',
        background: 'var(--settings-surface-raised)',
        backdropFilter: 'blur(calc(var(--SmartThemeBlurStrength, 10) * 1px))',
        padding: {
            default: '15px',
            [narrow]: '10px',
        },
    },
    sectionHeader: {
        marginBottom: '10px',
    },
    sectionTitle: {
        margin: 0,
        color: 'var(--settings-body)',
        fontSize: '1.05rem',
        fontWeight: 600,
        lineHeight: 1.4,
    },
    mutedText: {
        color: 'var(--settings-muted)',
        fontSize: '0.9rem',
        lineHeight: 1.45,
    },
    sectionDescription: {
        margin: '3px 0 0',
    },
    grid: {
        display: 'grid',
        gridTemplateColumns: {
            default: 'repeat(2, minmax(0, 1fr))',
            [narrow]: '1fr',
        },
        gap: '10px',
    },
    field: {
        display: 'flex',
        minWidth: 0,
        flexDirection: 'column',
        gap: '5px',
    },
    spanAll: {
        gridColumn: '1 / -1',
    },
    fieldLabel: {
        color: 'var(--settings-body)',
        fontSize: '0.95rem',
        fontWeight: 500,
        lineHeight: 1.3,
    },
    fieldDescription: {
        color: 'var(--settings-muted)',
        fontSize: '0.9rem',
        lineHeight: 1.45,
        position: {
            default: 'absolute',
            [stylex.when.ancestor(':hover')]: 'static',
            [stylex.when.ancestor(':focus-within')]: 'static',
        },
        width: {
            default: '1px',
            [stylex.when.ancestor(':hover')]: 'auto',
            [stylex.when.ancestor(':focus-within')]: 'auto',
        },
        height: {
            default: '1px',
            [stylex.when.ancestor(':hover')]: 'auto',
            [stylex.when.ancestor(':focus-within')]: 'auto',
        },
        margin: {
            default: '-1px',
            [stylex.when.ancestor(':hover')]: '2px 0 0',
            [stylex.when.ancestor(':focus-within')]: '2px 0 0',
        },
        overflow: {
            default: 'hidden',
            [stylex.when.ancestor(':hover')]: 'visible',
            [stylex.when.ancestor(':focus-within')]: 'visible',
        },
        clip: {
            default: 'rect(0 0 0 0)',
            [stylex.when.ancestor(':hover')]: 'auto',
            [stylex.when.ancestor(':focus-within')]: 'auto',
        },
        clipPath: {
            default: 'inset(50%)',
            [stylex.when.ancestor(':hover')]: 'none',
            [stylex.when.ancestor(':focus-within')]: 'none',
        },
        whiteSpace: {
            default: 'nowrap',
            [stylex.when.ancestor(':hover')]: 'normal',
            [stylex.when.ancestor(':focus-within')]: 'normal',
        },
    },
    input: {
        width: '100%',
        minHeight: '34px',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: {
            default: 'var(--form-control-border-color, var(--settings-border))',
            ':focus': 'var(--form-control-border-color-focus, var(--settings-focus))',
        },
        borderRadius: '5px',
        background: {
            default: 'var(--form-control-bg, var(--settings-surface-sunken))',
            ':focus': 'var(--form-control-bg-focus, var(--settings-surface-sunken))',
        },
        color: 'var(--settings-body)',
        fontFamily: 'inherit',
        fontSize: '0.95rem',
        lineHeight: 1.4,
        padding: '5px 10px',
        transition: 'background-color 250ms ease-out, border-color 250ms ease-out, opacity 250ms ease-out',
        transitionDuration: {
            [reducedMotion]: '0.01ms',
        },
        '::placeholder': {
            color: 'color-mix(in srgb, var(--settings-body) 52%, var(--settings-surface) 48%)',
        },
        outline: {
            default: 'none',
            ':focus-visible': '1px solid var(--settings-focus)',
        },
        outlineOffset: { ':focus-visible': '2px' },
    },
    textarea: {
        minHeight: '112px',
        resize: 'vertical',
    },
    select: {
        appearance: 'none',
        paddingRight: '28px',
        backgroundImage: 'url(\'/img/down-arrow.svg\')',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 8px center',
        backgroundSize: '8px 5px',
    },
    toggle: {
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '10px',
        minHeight: '44px',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'var(--settings-border)',
        borderRadius: '5px',
        background: 'var(--settings-surface-sunken)',
        padding: '10px',
    },
    toggleBody: {
        display: 'flex',
        minWidth: 0,
        flexDirection: 'column',
        gap: '4px',
    },
    checkbox: {
        width: '16px',
        height: '16px',
        marginTop: '2px',
        accentColor: 'var(--settings-accent)',
        outline: {
            ':focus-visible': '1px solid var(--settings-focus)',
        },
        outlineOffset: { ':focus-visible': '2px' },
    },
    fieldError: {
        color: 'var(--settings-danger)',
        fontSize: '0.9rem',
        lineHeight: 1.4,
    },
    status: {
        display: 'block',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'var(--settings-border)',
        borderRadius: '5px',
        padding: '10px',
        color: 'var(--settings-body)',
        fontSize: '0.95rem',
        lineHeight: 1.4,
    },
    statusInfo: {
        background: 'var(--settings-surface-sunken)',
    },
    statusSuccess: {
        borderColor: 'color-mix(in srgb, var(--settings-success) 55%, var(--settings-border) 45%)',
        background: 'color-mix(in srgb, var(--settings-success) 15%, var(--settings-surface) 85%)',
    },
    statusError: {
        borderColor: 'color-mix(in srgb, var(--settings-danger) 55%, var(--settings-border) 45%)',
        background: 'color-mix(in srgb, var(--settings-danger) 14%, var(--settings-surface) 86%)',
        color: 'var(--settings-danger)',
    },
    inlinePanel: {
        gridColumn: '1 / -1',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'var(--settings-border)',
        borderRadius: '10px',
        background: 'var(--settings-surface-sunken)',
        padding: '12px',
    },
    inlineHeader: {
        display: 'flex',
        alignItems: {
            default: 'flex-start',
            [narrow]: 'stretch',
        },
        justifyContent: 'space-between',
        gap: '10px',
        flexDirection: {
            default: 'row',
            [narrow]: 'column',
        },
    },
    inlineActions: {
        display: 'flex',
        gap: '10px',
        marginTop: '10px',
        alignItems: {
            [narrow]: 'stretch',
        },
        flexDirection: {
            default: 'row',
            [narrow]: 'column',
        },
    },
    inlineActionsInput: {
        flex: '1 1 auto',
    },
    pill: {
        display: 'inline-flex',
        alignItems: 'center',
        minHeight: '24px',
        maxWidth: '100%',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'var(--settings-border)',
        borderRadius: '5px',
        padding: '2px 6px',
        color: 'var(--settings-muted)',
        fontSize: '0.8rem',
        lineHeight: 1.3,
        whiteSpace: 'nowrap',
    },
    saveBar: {
        gridColumn: '1 / -1',
        display: 'flex',
        alignItems: {
            default: 'center',
            [narrow]: 'stretch',
        },
        justifyContent: 'space-between',
        gap: '10px',
        flexDirection: {
            default: 'row',
            [narrow]: 'column',
        },
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'var(--settings-border)',
        borderRadius: '10px',
        background: 'var(--settings-surface-raised)',
        padding: '10px',
    },
    saveBarOverlay: {
        flex: '0 0 auto',
    },
    side: {
        display: 'flex',
        width: 'min(100%, 360px)',
        flex: {
            default: '0 0 360px',
            [medium]: '0 0 auto',
        },
        flexDirection: 'column',
        gap: '10px',
    },
    sidePanel: {
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'var(--settings-border)',
        borderRadius: '10px',
        background: 'var(--settings-surface-raised)',
        backdropFilter: 'blur(calc(var(--SmartThemeBlurStrength, 10) * 1px))',
        padding: {
            default: '15px',
            [narrow]: '10px',
        },
    },
    metrics: {
        display: 'grid',
        gridTemplateColumns: {
            default: '1fr',
            [medium]: 'repeat(3, minmax(0, 1fr))',
            [narrow]: '1fr',
        },
        gap: '10px',
        marginTop: '10px',
    },
    metric: {
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'var(--settings-border)',
        borderRadius: '5px',
        background: 'var(--settings-surface-sunken)',
        padding: '10px',
    },
    metricLabel: {
        color: 'var(--settings-muted)',
        fontSize: '0.78rem',
        lineHeight: 1.2,
    },
    metricValue: {
        marginTop: '4px',
        color: 'var(--settings-body)',
        fontSize: '1.5rem',
        fontWeight: 700,
        lineHeight: 1.2,
    },
    diagnosticsBody: {
        marginTop: '10px',
    },
    diagnosticsGroup: {
        marginTop: {
            default: '10px',
            ':first-child': 0,
        },
    },
    diagnosticsTitle: {
        margin: '0 0 5px',
        color: 'var(--settings-body)',
        fontSize: '0.95rem',
        fontWeight: 500,
    },
    diagnosticsList: {
        color: 'var(--settings-muted)',
        fontSize: '0.9rem',
        lineHeight: 1.45,
        margin: 0,
        paddingLeft: '18px',
    },
    tabPanelOverlay: {
        minHeight: 0,
        overflow: 'auto',
        paddingRight: '2px',
        flex: '1 1 auto',
    },
    overlay: {
        position: {
            default: 'relative',
            [phone]: 'absolute',
        },
        margin: 'auto',
        padding: 0,
        zIndex: 1,
        maxWidth: 'none',
        maxHeight: 'none',
        width: {
            default: 'min(92vw, 1180px)',
            [phone]: '100vw',
        },
        height: {
            default: 'min(92dvh, 880px)',
            [phone]: 'calc(100dvh - var(--topBarBlockSize, 40px))',
        },
        pointerEvents: 'auto',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'color-mix(in srgb, var(--SmartThemeBorderColor, rgba(0,0,0,0.5)) 72%, var(--SmartThemeBodyColor, rgb(220,220,210)) 12%)',
        borderRadius: {
            default: '10px',
            [phone]: 0,
        },
        overflow: 'hidden',
        background: 'color-mix(in srgb, var(--SmartThemeBlurTintColor, rgb(23, 23, 23)) 78%, rgba(0, 0, 0, 0.7) 22%)',
        boxShadow: '0 8px 32px color-mix(in srgb, rgba(0, 0, 0, 0.7) 55%, transparent)',
        animation: {
            default: `${overlayFadeIn} 120ms ease-out both`,
            [phone]: `${overlayFadeIn} 150ms ease-out both`,
            [reducedMotion]: 'none',
        },
        outline: {
            ':focus': 'none',
        },
        top: {
            [phone]: 'var(--topBarBlockSize, 40px)',
        },
        left: {
            [phone]: 0,
        },
        overflowY: {
            [phone]: 'auto',
        },
    },
    overlayHost: {
        position: 'fixed',
        inset: 0,
        zIndex: 4150,
        display: {
            default: 'grid',
            [phone]: 'block',
        },
        placeItems: 'center',
        pointerEvents: 'none',
    },
    overlayBackdrop: {
        position: 'absolute',
        inset: 0,
        top: 'var(--topBarBlockSize, 40px)',
        zIndex: 0,
        pointerEvents: 'auto',
        background: 'color-mix(in srgb, var(--SmartThemeBlurTintColor, rgb(23, 23, 23)) 72%, transparent)',
        backdropFilter: 'blur(calc(var(--SmartThemeBlurStrength, 10) * 2px))',
        WebkitBackdropFilter: 'blur(calc(var(--SmartThemeBlurStrength, 10) * 2px))',
        animation: {
            default: `${overlayFadeIn} 150ms ease-out both`,
            [reducedMotion]: 'none',
        },
    },
});
