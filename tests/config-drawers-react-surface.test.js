import { describe, expect, test } from '@jest/globals';
import { readRepoFile } from './helpers/frontend-compatibility-contract.js';

describe('retired Advanced Formatting drawer', () => {
    test('drawer host, mount adapter, and panel component are gone', () => {
        const indexHtml = readRepoFile('public/index.html');
        const adapter = readRepoFile('public/scripts/power-user.js');
        const workspacePanels = readRepoFile('app/workspace-panels.tsx');
        const script = readRepoFile('public/script.js');

        expect(indexHtml).not.toContain('id="AdvancedFormatting"');
        expect(indexHtml).not.toContain('id="advanced-formatting-button"');
        expect(adapter).not.toContain('mountAdvancedFormattingPanel');
        expect(workspacePanels).not.toContain('AdvancedFormattingPanel');
        expect(script).not.toContain('mountAdvancedFormattingPanel()');
    });

    test('retired drawer element ids are not rebound by legacy modules', () => {
        const powerUser = readRepoFile('public/scripts/power-user.js');
        const sysprompt = readRepoFile('public/scripts/sysprompt.js');
        const reasoning = readRepoFile('public/scripts/reasoning.js');

        for (const source of [powerUser, sysprompt, reasoning]) {
            expect(source).not.toContain('#sysprompt_select');
            expect(source).not.toContain('#sysprompt_content');
            expect(source).not.toContain('#reasoning_select');
            expect(source).not.toContain('#tokenizer');
            expect(source).not.toContain('#start_reply_with');
        }
    });

    test('tokenizer options are data-driven, not DOM-discovered', () => {
        const tokenizers = readRepoFile('public/scripts/tokenizers.js');
        expect(tokenizers).toContain('TOKENIZER_OPTIONS');
        expect(tokenizers).not.toContain("$('#tokenizer')");
        expect(tokenizers).not.toContain("$('#tokenizer').find('option')");
    });
});

describe('formatting presets in the React Settings surface', () => {
    test('preset rows and master import/export live in the advanced settings tab', () => {
        const surface = readRepoFile('app/components/settings/SettingsSurface.tsx');
        const rows = readRepoFile('app/components/settings/TemplatePresetManager.tsx');

        expect(surface).toContain('apiId="sysprompt"');
        expect(surface).toContain('apiId="reasoning"');
        expect(surface).toContain('FormattingMasterActions');
        expect(surface).not.toContain("target: 'AdvancedFormatting'");

        expect(rows).toContain('commands?.formattingPreset');
        expect(rows).toContain("action: 'save'");
        expect(rows).toContain("action: 'rename'");
        expect(rows).toContain("action: 'delete'");
        expect(rows).toContain("action: 'restore'");
    });

    test('legacy preset-manager keeps formatting CRUD helpers and openai delegation', () => {
        const presetManager = readRepoFile('public/scripts/preset-manager.js');

        for (const helper of [
            'getFormattingPresetList',
            'syncFormattingPresetList',
            'saveFormattingPreset',
            'deleteFormattingPreset',
            'restoreFormattingPreset',
        ]) {
            expect(presetManager).toContain(`export `);
            expect(presetManager).toContain(helper);
        }
        // The surviving openai preset select still uses delegated actions.
        expect(presetManager).toContain('$(document).on(\'click\', \'[data-preset-manager-delete]\'');
        expect(presetManager).not.toContain('af_master');
        expect(presetManager).not.toContain('performMasterImport');
        expect(presetManager).not.toContain('performMasterExport');
    });

    test('runtime command contract: formattingPreset is end-to-end', () => {
        const provider = readRepoFile('public/scripts/react-runtime-provider.js');
        const script = readRepoFile('public/script.js');
        const port = readRepoFile('app/compat/runtime-port.ts');

        expect(provider).toContain("'formattingPreset'");
        expect(script).toContain('formattingPreset: async (request)');
        expect(port).toContain('formattingPreset(request: FormattingPresetRequest)');
    });

    test('config drawer mounts still run before getSettings', () => {
        const script = readRepoFile('public/script.js');
        const stageIndex = script.indexOf("measureStartupStage('mountConfigDrawers'");
        const settingsIndex = script.indexOf('await getSettings(initLoaderHandle)');
        expect(stageIndex).toBeGreaterThan(-1);
        expect(settingsIndex).toBeGreaterThan(-1);
        expect(stageIndex).toBeLessThan(settingsIndex);
    });
});
