import { defineTheme } from '@astryxdesign/core';

/**
 * EmberDesk → Astryx theme bridge.
 *
 * The legacy SmartTheme runtime remains the single source of truth for user
 * themes: `public/scripts/power-user.js` writes `--SmartTheme*` custom
 * properties on `document.documentElement` from theme JSON and user settings,
 * and user custom CSS may override any of them at runtime.
 *
 * Astryx components read `--color-*` design tokens (plain CSS custom
 * properties declared on `[data-astryx-theme]`). This theme maps each Astryx
 * token to a `var(--SmartTheme*, fallback)` reference so runtime theme
 * switches and user custom CSS keep working without re-rendering React.
 */

const smartThemeVar = (name: string, fallback: string) => `var(${name}, ${fallback})`;

export const SMART_THEME_TOKEN_MAP = {
    accent: 'SmartThemeBorderColor',
    body: 'SmartThemeBodyColor',
    faded: 'SmartThemeFadedColor',
    em: 'SmartThemeEmColor',
    quote: 'SmartThemeQuoteColor',
    underline: 'SmartThemeUnderlineColor',
    blurTint: 'SmartThemeBlurTintColor',
    chatTint: 'SmartThemeChatTintColor',
    userMesBlurTint: 'SmartThemeUserMesBlurTintColor',
    botMesBlurTint: 'SmartThemeBotMesBlurTintColor',
    shadow: 'SmartThemeShadowColor',
    fastUiBg: 'SmartThemeFastUIBGColor',
} as const;

export const emberDeskTheme = defineTheme({
    name: 'emberdesk',
    tokens: {
        '--color-accent': smartThemeVar('--SmartThemeBorderColor', '#2694FE'),
        '--color-text-accent': smartThemeVar('--SmartThemeBorderColor', '#3E9EFB'),
        '--color-icon-accent': smartThemeVar('--SmartThemeBorderColor', '#2694FE'),
        '--color-text-primary': smartThemeVar('--SmartThemeBodyColor', '#DFE2E5'),
        '--color-text-secondary': smartThemeVar('--SmartThemeFadedColor', '#AAAFB5'),
        '--color-icon-primary': smartThemeVar('--SmartThemeBodyColor', '#DFE2E5'),
        '--color-icon-secondary': smartThemeVar('--SmartThemeFadedColor', '#AAAFB5'),
        '--color-background-surface': smartThemeVar('--SmartThemeBlurTintColor', '#1F1F22'),
        '--color-background-body': smartThemeVar('--SmartThemeBlurTintColor', '#111112'),
        '--color-background-card': smartThemeVar('--SmartThemeBlurTintColor', '#1F1F22'),
        '--color-background-popover': smartThemeVar('--SmartThemeBlurTintColor', '#28292C'),
        '--color-overlay': smartThemeVar('--SmartThemeBlurTintColor', '#11111299'),
        '--color-border': smartThemeVar('--SmartThemeBorderColor', '#F2F4F619'),
        '--color-border-emphasized': smartThemeVar('--SmartThemeBorderColor', '#494D53'),
        '--color-shadow': smartThemeVar('--SmartThemeShadowColor', 'rgba(0, 0, 0, 0.3)'),
        '--color-background-muted': smartThemeVar('--SmartThemeChatTintColor', '#1111127F'),

        // Status colors — legacy runtime vars (--error-color may be unset;
        // --ember-red is the canonical red).
        '--color-error': 'var(--error-color, var(--ember-red, #E5484D))',
        '--color-success': 'var(--success-green, rgb(88, 182, 0))',
        '--color-warning': 'var(--warning, var(--ember-red, #E5484D))',

        // Typography — user font settings live in --mainFontFamily /
        // --mainFontSize (power-user settings, runtime-mutable).
        '--font-family-body': 'var(--mainFontFamily, "Noto Sans", sans-serif)',
        '--font-family-heading': 'var(--mainFontFamily, "Noto Sans", sans-serif)',
        '--font-family-code': 'var(--monoFontFamily, "Noto Sans Mono", "Courier New", Consolas, monospace)',
        '--text-body-size': 'var(--mainFontSize, 15px)',
        '--font-size-base': 'var(--mainFontSize, 15px)',

        // Motion — user animation speed (--animation-duration, power-user).
        '--duration-fast': 'var(--animation-duration, 125ms)',
        '--duration-medium': 'calc(var(--animation-duration, 125ms) * 2)',
        '--duration-slow': 'calc(var(--animation-duration, 125ms) * 4)',
    },
});
