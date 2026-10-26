import { describe, expect, test } from '@jest/globals';
import { readRepoFile } from './helpers/frontend-structure-contract.js';

describe('locale remediation wiring', () => {
    test.each([
        ['Regenerate reply', '重新生成回复'],
        ['Wire Log', '链路日志'],
        ['Type /? for commands.', '输入 /? 查看命令。'],
    ])('workspace copy %s has a Chinese translation', (key, translation) => {
        const zh = JSON.parse(readRepoFile('public/locales/zh-cn.json'));
        expect(zh[key]).toBe(translation);
    });
    test('all options-menu labels have Chinese dictionary coverage', () => {
        const source = readRepoFile('app/components/options-menu/OptionsMenu.tsx');
        const zh = JSON.parse(readRepoFile('public/locales/zh-cn.json'));
        const labels = [...source.matchAll(/label=(?:"([^"]+)"|\{translate\('([^']+)'\)\})/g)]
            .map(match => match[1] ?? match[2]);
        expect(labels).toHaveLength(8);
        for (const label of labels) {
            expect(zh[label]).toMatch(/[\u4e00-\u9fff]/);
        }
    });
    test('options-menu hands stable source keys to ContractButton instead of pre-translated labels', () => {
        const source = readRepoFile('app/components/options-menu/OptionsMenu.tsx');
        // ContractButton resolves the label with useTranslated(), so it also
        // owns the i18n:applied subscription. Pre-translating here would bind
        // the data-i18n key to the translated text and break locale reload.
        expect(source).not.toMatch(/label=\{translate\(/);
        expect(source).toContain('label="Wire Log"');
        expect(source).not.toContain('useTranslated(\'\')');
        expect(source).not.toContain('@/compat/i18n.js');
    });
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
        expect(source).toContain('translate(entry.status)');
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
        expect(source).toContain('aria-label={translate(\'Maximize editing ${0}\').replace(\'${0}\', translate(text))}');
        expect(source).toContain('aria-label={translate(\'Unsaved change\')}');
        expect(source).toContain('aria-label={translate(\'${0} actions\').replace(\'${0}\', title)}');
        const zh = JSON.parse(readRepoFile('public/locales/zh-cn.json'));
        for (const key of ['${0} actions', 'Maximize editing ${0}', 'Maximize editing', 'All', 'Wire Log records']) {
            expect(zh[key]).toMatch(/[\u4e00-\u9fff]/);
        }
    });
});
