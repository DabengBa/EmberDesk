import { describe, expect, test } from '@jest/globals';
import { readRepoFile } from './helpers/frontend-compatibility-contract.js';

describe('small configuration drawers React surface (Wave A)', () => {
    const cases = [
        {
            name: 'floating prompt (Authors Note)',
            shellId: 'floatingPrompt',
            component: 'app/components/panels/FloatingPromptPanel.tsx',
            adapter: 'public/scripts/authors-note.js',
            mountFn: 'mountFloatingPromptPanel',
            ids: [
                'floatingPromptheader',
                'floatingPromptMaximize',
                'ANClose',
                'ANBlockToggle',
                'extension_floating_prompt',
                'extension_floating_prompt_token_counter',
                'extension_floating_allow_wi_scan',
                'extension_floating_position_before',
                'extension_floating_position_after',
                'extension_floating_position_depth',
                'extension_floating_depth',
                'extension_floating_role',
                'extension_floating_interval',
                'extension_floating_counter',
                'extension_floating_chara',
                'extension_use_floating_chara',
                'extension_floating_default',
            ],
        },
        {
            name: 'CFG scale config',
            shellId: 'cfgConfig',
            component: 'app/components/panels/CfgConfigPanel.tsx',
            adapter: 'public/scripts/cfg-scale.js',
            mountFn: 'mountCfgConfigPanel',
            ids: [
                'cfgConfigheader',
                'cfgConfigMaximize',
                'CFGClose',
                'chat_cfg_guidance_scale',
                'chat_cfg_guidance_scale_counter',
                'chat_cfg_negative_prompt',
                'chat_cfg_positive_prompt',
                'chara_cfg_guidance_scale',
                'global_cfg_guidance_scale',
            ],
        },
        {
            name: 'logprobs viewer',
            shellId: 'logprobsViewer',
            component: 'app/components/panels/LogprobsViewerPanel.tsx',
            adapter: 'public/scripts/logprobs.js',
            mountFn: 'mountLogprobsViewerPanel',
            ids: [
                'logprobsViewerheader',
                'logprobsMaximizeToggle',
                'logprovsViewerBlockToggle',
                'logprobsViewerClose',
                'logprobsReroll',
                'logprobs_generation_output',
                'logprobs_selected_top_logprobs',
            ],
        },
    ];

    const advancedFormatting = {
        name: 'Advanced Formatting (instruct/context/sysprompt)',
        shellId: 'AdvancedFormatting',
        component: 'app/components/panels/AdvancedFormattingPanel.tsx',
        adapter: 'public/scripts/instruct-mode.js',
        mountFn: 'mountAdvancedFormattingPanel',
        ids: [
            'context_story_string',
            'context_story_string_position',
            'context_story_string_depth',
            'context_example_separator',
            'context_chat_start',
            'instruct_macro',
            'instruct_activation_regex',
            'instruct_input_sequence',
            'instruct_output_sequence',
            'instruct_system_sequence',
            'instruct_stop_sequence',
            'instruct_user_alignment_message',
            'sysprompt_content',
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

    test('logprobs dynamic output containers stay legacy-writable', () => {
        const component = readRepoFile('app/components/panels/LogprobsViewerPanel.tsx');
        // logprobs.js empties/appends into these containers at runtime.
        expect(component).toContain('id="logprobs_generation_output"');
        expect(component).toContain('logprobs_candidate_list');
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
