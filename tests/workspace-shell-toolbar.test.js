import { describe, expect, test } from '@jest/globals';

import { readRepoFile } from './helpers/frontend-structure-contract.js';

describe('workspace shell toolbar', () => {
    test('groups navigation controls and preserves a clear keyboard and responsive hierarchy', () => {
        const styles = readRepoFile('app/styles/workspace-panels.styles.ts');
        const workspaceSource = readRepoFile('app/workspace-panels.tsx');
        const toolbarStyles = styles.match(/export const workspaceShellStyles = stylex\.create\(([\s\S]*?)\n\}\);/)?.[1] ?? '';
        const navStyles = toolbarStyles.match(/\n    nav: \{([\s\S]*?)\n    \},/)?.[1] ?? '';
        const navButtonStyles = toolbarStyles.match(/\n    navButton: \{([\s\S]*?)\n    \},/)?.[1] ?? '';

        expect(navStyles).toContain('borderWidth: \'1px\'');
        expect(navStyles).toContain('backgroundColor:');
        expect(navButtonStyles).toContain("minHeight: '36px'");
        expect(navButtonStyles).toContain("':focus-visible': '2px solid var(--interactable-outline-color)'");
        expect(navButtonStyles).toContain("outlineOffset: {\n            ':focus-visible': '2px'");
        expect(toolbarStyles).toContain('[shellChromeNarrow]');
        expect(workspaceSource).toContain('<nav {...stylex.props(workspaceShellStyles.nav)} aria-label={translate(\'Workspace navigation\')}>');
        expect(workspaceSource).toContain('aria-label={panelActionLabel}');
        expect(workspaceSource).toContain('aria-pressed={entry.panelKind ? isPanelEntryActive : undefined}');
        expect(workspaceSource).toContain('<span {...stylex.props(workspaceShellStyles.navButtonLabel)}>{entry.label}</span>');
    });
});
