import { describe, expect, test } from '@jest/globals';
import { readRepoFile } from './helpers/frontend-compatibility-contract.js';
import {
    collectDisallowedCssImports,
    collectTailwindUsage,
} from './helpers/stylex-guardrails.js';

describe('StyleX/Astryx foundation (Phase 0)', () => {
    test('wires the StyleX unplugin into the React app but not the lib boundary', () => {
        const viteConfig = readRepoFile('vite.config.ts');

        expect(viteConfig).toContain("import stylex from '@stylexjs/unplugin/vite'");

        const appMode = viteConfig.split('// React application mode')[1];
        const libMode = viteConfig.match(/if \(isLibBuild\)[\s\S]*?\n    \}/)?.[0] ?? '';
        expect(appMode).toContain('stylex()');
        expect(libMode).not.toContain('stylex()');
    });

    test('panel styles are built with the SPA rather than injected by the loader', () => {
        const bridge = readRepoFile('public/scripts/workspace-panels-react-bridge.js');
        const script = readRepoFile('public/script.js');
        const root = readRepoFile('app/routes/__root.tsx');

        expect(root).toContain("import '@astryxdesign/core/astryx.css'");
        expect(bridge).not.toContain('workspace-panels.css');
        expect(script).not.toContain('character-library-panel.css');
    });

    test('theme token bridge maps SmartTheme runtime variables to Astryx tokens', () => {
        const themeTokens = readRepoFile('app/lib/theme-tokens.ts');

        expect(themeTokens).toContain('defineTheme');
        for (const smartVar of [
            '--SmartThemeBodyColor',
            '--SmartThemeFadedColor',
            '--SmartThemeBorderColor',
            '--SmartThemeBlurTintColor',
            '--SmartThemeShadowColor',
            '--SmartThemeChatTintColor',
        ]) {
            expect(themeTokens).toContain(smartVar);
        }
        for (const astryxToken of [
            '--color-accent',
            '--color-text-primary',
            '--color-text-secondary',
            '--color-background-surface',
            '--color-background-body',
            '--color-border',
            '--color-shadow',
        ]) {
            expect(themeTokens).toContain(astryxToken);
        }
    });

    test('the app and portal surfaces apply the EmberDesk Astryx theme', () => {
        const client = readRepoFile('app/client.tsx');
        const workspacePanels = readRepoFile('app/workspace-panels.tsx');

        const characterLibraryPanel = readRepoFile('app/character-library-panel.tsx');

        for (const source of [client, workspacePanels, characterLibraryPanel]) {
            expect(source).toContain("import { Theme } from '@astryxdesign/core'");
            expect(source).toContain('emberDeskTheme');
            expect(source).toContain('<Theme theme={emberDeskTheme}');
        }
    });

    test('StyleX conversion keeps diagnostics DOM contract hooks on data attributes', () => {
        const panelShell = readRepoFile('app/components/panels/WorkspacePanelShell.tsx');

        expect(panelShell).toContain("import * as stylex from '@stylexjs/stylex'");
        expect(panelShell).toContain('stylex.create');
        expect(panelShell).toContain('data-workspace-panel-diagnostics={kind}');
        expect(panelShell).not.toContain('className="workspace-panel-diagnostics"');

        const legacyCss = readPublicOrRepoStyle();
        expect(legacyCss).not.toContain('.workspace-panel-diagnostics');
    });

    test('renders an Astryx component inside the bridged theme (SSR smoke)', async () => {
        const React = await import('react');
        const { renderToString } = await import('react-dom/server');
        const { Button, Theme, defineTheme } = await import('@astryxdesign/core');

        const theme = defineTheme({
            name: 'smoke',
            tokens: { '--color-accent': 'var(--SmartThemeBorderColor, #2694FE)' },
        });
        const html = renderToString(
            React.createElement(Theme, { theme, mode: 'dark' }, React.createElement(Button, null, 'OK')),
        );

        expect(html).toContain('data-astryx-theme="smoke"');
        expect(html).toContain('data-theme="dark"');
        expect(html).toContain('astryx-button');
        expect(html).toContain('>OK<');
    });

    test('guardrails: no new ordinary CSS imports or Tailwind utilities inside app/', () => {
        expect(collectDisallowedCssImports()).toEqual([]);
        expect(collectTailwindUsage()).toEqual([]);
    });

    test('keeps protected character-list and extension contracts untouched', () => {
        const script = readRepoFile('public/script.js') + readRepoFile('public/scripts/public-api.js');
        const legacyCss = readPublicOrRepoStyle() + readRepoFile('public/css/tags.css');
        const indexHtml = readRepoFile('app/components/workspace/WorkspaceHost.tsx');

        for (const protectedSelector of [
            '.character_select',
            '.bogus_folder_select',
            '.character_selected',
            '.bulk_select_checkbox',
            '.tags_inline',
            '.ch_fav',
        ]) {
            expect(legacyCss).toContain(protectedSelector);
        }
        for (const contract of [
            'eventSource',
            'event_types',
            'globalThis.SillyTavern',
            'data-chid',
        ]) {
            expect(script + indexHtml).toContain(contract);
        }
    });
});

function readPublicOrRepoStyle() {
    return readRepoFile('public/style.css');
}
