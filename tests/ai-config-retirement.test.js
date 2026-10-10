import { describe, expect, test } from '@jest/globals';
import { readRepoFile } from './helpers/frontend-compatibility-contract.js';

describe('AI Response Configuration drawer retirement', () => {
    const indexHtml = readRepoFile('public/index.html');
    const script = readRepoFile('public/script.js');
    const store = readRepoFile('app/stores/workspace-panel-store.js');
    const workspacePanels = readRepoFile('app/workspace-panels.tsx');
    const workspaceCommands = readRepoFile('app/compat/workspace-commands.ts');
    const settingsSurface = readRepoFile('app/components/settings/SettingsSurface.tsx');

    test('the left-nav drawer shell and React panel markup are gone', () => {
        expect(indexHtml).not.toContain('id="left-nav-panel"');
        expect(indexHtml).not.toContain('id="ai-config-button"');
        expect(indexHtml).not.toContain('id="completion_prompt_manager_popup"');
        expect(() => readRepoFile('app/components/ai-config/AiConfigPanel.tsx')).toThrow();
        expect(() => readRepoFile('app/components/panels/PromptManagerPopup.tsx')).toThrow();
    });

    test('workspace shell no longer exposes the drawer slot or compat commands', () => {
        expect(script).not.toContain('mountAiConfigPanel');
        expect(script).not.toContain('openAIConfigDrawer');
        expect(script).not.toContain('openWorkspaceShellAiConfigDrawer');
        expect(script).not.toContain("'left-nav-panel'");
        expect(store).not.toContain('aiConfigDrawer');
        expect(workspacePanels).not.toContain('mountAiConfigPanel');
        expect(workspacePanels).not.toContain('openAIConfigDrawer');
        for (const command of ['openAIConfig', 'openFormatting', 'openAIConfigDrawer']) {
            expect(workspaceCommands).not.toContain(`${command}(`);
        }
        expect(settingsSurface).not.toContain('left-nav-panel');
    });

    test('oai_settings stays authoritative for generation without drawer bindings', () => {
        const openai = readRepoFile('public/scripts/openai.js');
        // The PromptManager service object still assembles prompts at generate
        // time; its drawer/popup/render surface is fully retired.
        const promptManager = readRepoFile('public/scripts/PromptManager.js');
        expect(promptManager).toContain('getPromptCollection');
        expect(promptManager).toContain('sanitizeServiceSettings');
        for (const dead of ['render(', 'showPopup', 'makeDraggable', 'renderPromptManager', 'prompt_manager_popup', 'loadPromptIntoEditForm', 'tryGenerate']) {
            expect(promptManager).not.toContain(dead);
        }
        expect(openai).not.toContain('mountPromptManagerPopup');
        expect(openai).not.toContain('promptManager.render');
        expect(openai).not.toContain('promptManager.tryGenerate');
    });
});
