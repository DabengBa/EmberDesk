import { describe, expect, test } from '@jest/globals';
import { readRepoFile } from './helpers/frontend-compatibility-contract.js';

describe('small configuration drawers React surface (Wave A)', () => {
    const cases = [];

    const advancedFormatting = {
        name: 'Advanced Formatting (sysprompt/reasoning)',
        shellId: 'AdvancedFormatting',
        component: 'app/components/panels/AdvancedFormattingPanel.tsx',
        adapter: 'public/scripts/power-user.js',
        mountFn: 'mountAdvancedFormattingPanel',
        ids: [
            'sysprompt_content',
            'sysprompt_post_history',
            'custom_stopping_strings',
            'reasoning_prefix',
        ],
    };

    for (const c of [...cases, advancedFormatting]) {
        test(`${c.name}: React owns content, legacy shell stays`, () => {
            const component = readRepoFile(c.component);
            const indexHtml = readRepoFile('public/index.html');
            const adapter = readRepoFile(c.adapter);
            const workspacePanels = readRepoFile('app/workspace-panels.tsx');

            for (const id of c.ids) {
                expect(component).toContain(`id="${id}"`);
                expect(indexHtml).not.toContain(`id="${id}"`);
            }
            expect(indexHtml).toContain(`id="${c.shellId}"`);
            expect(adapter).toContain(`export async function ${c.mountFn}(`);
            expect(adapter).toContain('loadWorkspacePanelsModule');
            expect(adapter).toContain(`module.${c.mountFn}(host)`);
            expect(workspacePanels).toContain(`export function ${c.mountFn}(`);
        });
    }

    test('preset-manager action rows collapse into ⋮ floating menus', () => {
        const component = readRepoFile('app/components/panels/AdvancedFormattingPanel.tsx');
        const menu = readRepoFile('app/components/preset-manager/PresetManagerActionsMenu.tsx');
        // Rows keep only the select + hidden file input + menu trigger.
        expect(component).toContain('PresetManagerActionsMenu apiId="sysprompt"');
        expect(component).toContain('PresetManagerActionsMenu apiId="reasoning"');
        expect(component).toContain('data-preset-manager-file="sysprompt"');
        expect(component).toContain('data-preset-manager-file="reasoning"');
        // Selects must carry data-preset-manager-for: registerPresetManagers()
        // scans `select[data-preset-manager-for]`, so the html2jsx-mangled
        // htmlFor variant would leave both managers permanently unregistered.
        expect(component).toContain('data-preset-manager-for="sysprompt"');
        expect(component).toContain('data-preset-manager-for="reasoning"');
        expect(component).not.toContain('data-preset-manager-htmlFor');
        expect(component).not.toContain('data-preset-manager-update=');
        // Menu emits the delegated data-preset-manager-* contract attrs.
        for (const action of ['update', 'new', 'rename', 'import', 'export', 'restore', 'delete']) {
            expect(menu).toContain(`data-preset-manager-${action}`);
        }
        expect(menu).toContain('preset-menu-danger');
        expect(menu).toContain('aria-haspopup="menu"');
        expect(menu).toContain('event.key === \'Escape\'');
        // preset-manager.js keeps the document-delegated handlers.
        const presetManager = readRepoFile('public/scripts/preset-manager.js');
        expect(presetManager).toContain('$(document).on(\'click\', \'[data-preset-manager-delete]\'');
    });

    test('all three mounts run before getSettings', () => {
        const script = readRepoFile('public/script.js');
        const stageIndex = script.indexOf("measureStartupStage('mountConfigDrawers'");
        const settingsIndex = script.indexOf('await getSettings(initLoaderHandle)');
        expect(stageIndex).toBeGreaterThan(-1);
        expect(settingsIndex).toBeGreaterThan(-1);
        expect(stageIndex).toBeLessThan(settingsIndex);
    });
});
