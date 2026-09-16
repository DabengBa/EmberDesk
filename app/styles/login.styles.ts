import * as stylex from '@stylexjs/stylex';

const loginFadeIn = stylex.keyframes({
    from: { opacity: 0, transform: 'translateY(10px)' },
    to: { opacity: 1, transform: 'translateY(0)' },
});

const loginShake = stylex.keyframes({
    '0%, 100%': { transform: 'translateX(0)' },
    '20%': { transform: 'translateX(-4px)' },
    '40%': { transform: 'translateX(4px)' },
    '60%': { transform: 'translateX(-4px)' },
    '80%': { transform: 'translateX(2px)' },
});

const smallPhone = '@media (max-width: 480px)';
const reducedMotion = '@media (prefers-reduced-motion: reduce)';

export const loginStyles = stylex.create({
    page: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100dvh',
        background: 'color-mix(in srgb, var(--SmartThemeBlurTintColor) 92%, var(--black70a) 8%)',
        padding: '18px',
    },
    card: {
        width: '100%',
        maxWidth: {
            default: '392px',
            [smallPhone]: '100%',
        },
        padding: {
            default: '18px 20px 20px',
            [smallPhone]: '18px 15px',
        },
        background: 'color-mix(in srgb, var(--SmartThemeBlurTintColor) 72%, var(--black70a) 28%)',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'color-mix(in srgb, var(--SmartThemeBorderColor) 74%, var(--SmartThemeBodyColor) 10%)',
        borderRadius: '10px',
        animation: {
            default: `${loginFadeIn} 180ms ease-out`,
            [reducedMotion]: 'none',
        },
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: '10px',
        marginBottom: '18px',
        paddingBottom: '12px',
        borderBottomWidth: '1px',
        borderBottomStyle: 'solid',
        borderBottomColor: 'color-mix(in srgb, var(--SmartThemeBorderColor) 72%, transparent)',
    },
    logo: {
        width: '30px',
        height: '30px',
    },
    headerTitle: {
        fontFamily: 'var(--mainFontFamily)',
        fontSize: '1.2rem',
        fontWeight: 700,
        color: 'var(--SmartThemeBodyColor)',
        margin: 0,
        lineHeight: 1.25,
        textShadow: 'none',
        textWrap: 'balance',
    },
    form: {
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
    },
    fieldStack: {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
    },
    fieldGroup: {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
    },
    fieldGroupSecurity: {
        paddingTop: '14px',
        borderTopWidth: '1px',
        borderTopStyle: 'solid',
        borderTopColor: 'color-mix(in srgb, var(--SmartThemeBorderColor) 62%, transparent)',
    },
    field: {
        marginBottom: 0,
    },
    fieldLabel: {
        display: 'block',
        fontFamily: 'var(--mainFontFamily)',
        fontSize: '0.95rem',
        fontWeight: 500,
        color: 'var(--SmartThemeBodyColor)',
        marginBottom: '5px',
        lineHeight: 1.3,
        textShadow: 'none',
    },
    labelNote: {
        color: 'var(--SmartThemeEmColor)',
        fontSize: '0.82em',
        fontWeight: 400,
    },
    input: {
        width: '100%',
        height: {
            default: '38px',
            [smallPhone]: '44px',
        },
        padding: '4px 8px',
        background: {
            default: 'var(--form-control-bg)',
            ':focus': 'var(--form-control-bg-focus)',
        },
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: {
            default: 'var(--form-control-border-color)',
            ':focus': 'var(--form-control-border-color-focus)',
        },
        borderRadius: '5px',
        color: 'var(--SmartThemeBodyColor)',
        fontFamily: 'var(--mainFontFamily)',
        fontSize: '1rem',
        lineHeight: 1.5,
        transition: 'background-color 150ms ease-out, border-color 150ms ease-out',
        textShadow: 'none',
        '::placeholder': {
            color: 'color-mix(in srgb, var(--SmartThemeBodyColor) 62%, var(--SmartThemeBlurTintColor) 38%)',
        },
        outline: {
            ':focus': '1px solid var(--interactable-outline-color-faint)',
        },
        outlineOffset: {
            ':focus': '1px',
        },
    },
    recoveryNote: {
        margin: '0 0 12px',
        padding: '7px 10px',
        background: 'color-mix(in srgb, var(--SmartThemeBlurTintColor) 76%, var(--black70a) 24%)',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'color-mix(in srgb, var(--SmartThemeBorderColor) 66%, transparent)',
        borderRadius: '5px',
        color: 'var(--SmartThemeEmColor)',
        fontFamily: 'var(--mainFontFamily)',
        fontSize: '0.85rem',
        lineHeight: 1.4,
        textShadow: 'none',
    },
    inputWrap: {
        position: 'relative',
    },
    inputInWrap: {
        paddingRight: '36px',
    },
    passwordToggle: {
        position: 'absolute',
        right: '8px',
        top: '50%',
        transform: 'translateY(-50%)',
        background: 'none',
        border: 'none',
        color: {
            default: 'var(--SmartThemeEmColor)',
            ':hover': 'var(--SmartThemeBodyColor)',
        },
        cursor: 'pointer',
        padding: '4px',
        fontSize: '14px',
        lineHeight: 1,
        textShadow: 'none',
        outline: {
            ':focus-visible': '1px solid var(--interactable-outline-color)',
        },
        outlineOffset: {
            ':focus-visible': '2px',
        },
        borderRadius: {
            ':focus-visible': '5px',
        },
    },
    actions: {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
    },
    btn: {
        width: '100%',
        height: 'auto',
        marginTop: 0,
        padding: {
            default: '7px 10px',
            [smallPhone]: '8px 10px',
        },
        background: {
            default: 'var(--SmartThemeBlurTintColor)',
            ':hover': 'color-mix(in srgb, var(--SmartThemeBodyColor) 15%, var(--SmartThemeBlurTintColor) 85%)',
        },
        color: 'var(--SmartThemeBodyColor)',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'var(--SmartThemeBorderColor)',
        borderRadius: '5px',
        fontFamily: 'var(--mainFontFamily)',
        fontSize: '0.95rem',
        fontWeight: 500,
        cursor: {
            default: 'pointer',
            ':disabled': 'not-allowed',
        },
        transition: 'background 250ms ease-out',
        lineHeight: 1.3,
        textShadow: 'none',
        opacity: {
            ':disabled': 0.5,
        },
        outline: {
            ':focus-visible': '1px solid var(--interactable-outline-color)',
        },
        outlineOffset: {
            ':focus-visible': '2px',
        },
    },
    forgot: {
        display: 'block',
        width: '100%',
        marginTop: '10px',
        padding: 0,
        border: 0,
        background: 'transparent',
        textAlign: 'center',
        fontFamily: 'var(--mainFontFamily)',
        fontSize: '0.8rem',
        color: {
            default: 'var(--SmartThemeEmColor)',
            ':hover': 'var(--SmartThemeBodyColor)',
        },
        textDecoration: {
            default: 'none',
            ':hover': 'underline',
        },
        textShadow: 'none',
        outline: {
            ':focus-visible': '1px solid var(--interactable-outline-color)',
        },
        outlineOffset: {
            ':focus-visible': '2px',
        },
    },
    error: {
        display: 'none',
        marginTop: '12px',
        marginBottom: '10px',
        padding: '7px 10px',
        background: 'color-mix(in srgb, var(--ember-deep, rgb(100, 0, 0)) 72%, var(--black70a) 28%)',
        color: 'var(--clay-warning)',
        borderRadius: '5px',
        fontFamily: 'var(--mainFontFamily)',
        fontSize: '0.8rem',
        lineHeight: 1.4,
        textShadow: 'none',
    },
    errorVisible: {
        display: 'block',
    },
    errorShake: {
        animation: {
            default: `${loginShake} 400ms ease-out`,
            [reducedMotion]: 'none',
        },
    },
});
