import { describe, expect, test } from '@jest/globals';
import { readRepoFile } from './helpers/frontend-structure-contract.js';

describe('locale remediation wiring', () => {
    test('nested prompt slot components subscribe themselves, without cloning or remounting', () => {
        const panels = readRepoFile('app/workspace-panels.tsx');
        expect(panels).not.toContain('cloneElement');
        const prompts = readRepoFile('app/components/prompt-panel/PromptPanel.tsx');
        for (const name of ['PromptManagerList', 'PromptInspectorButton', 'PromptManagerAddButton']) {
            expect(prompts).toMatch(new RegExp(`function ${name}[^\\n]*\\{\\n\\s*useTranslated\\(''\\)`));
        }
    });
    test('raw regex accessibility text is translated', () => {
        expect(readRepoFile('app/components/regex/RegexSettingsPanel.tsx')).toContain('aria-label={translate(\'Regex presets\')}');
        expect(readRepoFile('app/components/regex/RegexDebugger.tsx')).toContain('aria-label={translate(\'Render mode\')}');
    });
    test('wire status and counts are localized without changing protocol values', () => {
        const source = readRepoFile('app/components/wire-log/WireLogBrowser.tsx');
        expect(source).toContain("translate(entry.status)");
        expect(source).not.toContain('} msg ·');
        const zh = JSON.parse(readRepoFile('public/locales/zh-cn.json'));
        for (const key of ['completed', 'pending', 'error', '${0} messages', '${0} tools', 'Unsaved change']) {
            expect(zh[key]).toMatch(/[\u4e00-\u9fff]/);
        }
    });
    test('wire log status filter options and list label are translated', () => {
        const source = readRepoFile('app/components/wire-log/WireLogBrowser.tsx');
        expect(source).toContain('<option value="">{translate(\'All\')}</option>');
        for (const status of ['completed', 'error', 'pending']) {
            expect(source).toContain(`<option value="${status}">{translate('${status}')}</option>`);
        }
        expect(source).toContain('aria-label={translate(\'Wire Log records\')}');
    });
    test('authoring field labels translate their expand and dirty affordances', () => {
        const source = readRepoFile('app/workspace-panels.tsx');
        expect(source).toContain("aria-label={translate('Maximize editing ${0}').replace('${0}', translate(text))}");
        expect(source).toContain("aria-label={translate('Unsaved change')}");
        expect(source).toContain("aria-label={translate('${0} actions').replace('${0}', title)}");
        const zh = JSON.parse(readRepoFile('public/locales/zh-cn.json'));
        for (const key of ['${0} actions', 'Maximize editing ${0}', 'Maximize editing', 'All', 'Wire Log records']) {
            expect(zh[key]).toMatch(/[\u4e00-\u9fff]/);
        }
    });
});
