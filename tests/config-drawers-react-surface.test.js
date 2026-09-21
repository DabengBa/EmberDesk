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

    test('all three mounts run before getSettings', () => {
        const script = readRepoFile('public/script.js');
        const stageIndex = script.indexOf("measureStartupStage('mountConfigDrawers'");
        const settingsIndex = script.indexOf('await getSettings(initLoaderHandle)');
        expect(stageIndex).toBeGreaterThan(-1);
        expect(settingsIndex).toBeGreaterThan(-1);
        expect(stageIndex).toBeLessThan(settingsIndex);
    });
});
