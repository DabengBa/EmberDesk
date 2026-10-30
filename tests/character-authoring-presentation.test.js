import fs from 'node:fs';

const source = fs.readFileSync(new URL('../app/workspace-panels.tsx', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../app/styles/workspace-panels.styles.ts', import.meta.url), 'utf8');

describe('character authoring presentation', () => {
    test('omits unsupported-field notice and alternate greeting content preview', () => {
        const panel = source.match(/function AuthoringWorkspacePanel\([\s\S]*?(?=\nfunction MainChatMessageListWorkspacePanel)/)?.[0] ?? '';
        expect(panel).not.toContain('unsupportedFields');
        expect(panel).not.toContain('authoringStyles.panelWarning');
        expect(panel).not.toContain('authoringStyles.greetingPreview');
    });

    test('localizes mode labels and character counts as complete phrases', () => {
        const panel = source.match(/function AuthoringWorkspacePanel\([\s\S]*?(?=\nfunction MainChatMessageListWorkspacePanel)/)?.[0] ?? '';
        // The editing-mode kicker was removed; the header keeps save status only.
        expect(panel).not.toContain("'Editing'");
        expect(panel).toContain("translate('${0} characters').replace('${0}', String(descriptionValue.length))");
    });

    test('makes long-text expansion discoverable and gives footer actions a shared hierarchy', () => {
        expect(source).toContain("title={translate('Maximize editing')}");
        // Icon-only expand affordance — no visible 'Expand' label text.
        expect(source).not.toContain("{translate('Expand')}");
        expect(source).toContain('fa-solid fa-expand');
        expect(styles).toContain("resize: 'vertical'");
        expect(styles).toContain('secondaryText:');
        expect(source).toContain('authoringStyles.footerPrimaryActions');
        expect(styles).toContain('footerPrimaryActions:');
    });
});
