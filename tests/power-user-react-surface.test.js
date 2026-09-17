import { describe, expect, test } from '@jest/globals';
import { readRepoFile } from './helpers/frontend-compatibility-contract.js';

describe('power-user settings drawer React surface (Wave A)', () => {
    test('React owns the drawer markup with every legacy element ID preserved', () => {
        const panel = readRepoFile('app/components/power-user/PowerUserPanel.tsx');
        const indexHtml = readRepoFile('public/index.html');

        // A representative slice of the IDs power-user.js binds in
        // loadPowerUserSettings / registerPowerUserEvents.
        for (const id of [
            'user-settings-block-content',
            'ui_language_select',
            'settingsSearch',
            'themes',
            'ui_preset_import_button',
            'ui_preset_export_button',
            'ui-preset-delete-button',
            'ui-preset-save-button',
            'avatar_style',
            'chat_display',
            'toastr_position',
            'main-text-color-picker',
            'chat_width_slider',
            'font_scale',
            'blur_strength',
            'shadow_width',
            'messageTimerEnabled',
            'messageTimestampsEnabled',
            'allow_name1_display',
            'allow_name2_display',
            'encode_tags',
            'experimental_macro_engine',
            'stscript_parser_flag_replace_getvar',
            'stscript_autocomplete_state',
            'smooth_streaming',
            'smooth_streaming_speed',
            'streaming_fps',
            'chat_truncation',
            'auto_swipe',
            'auto_swipe_minimum_length',
            'auto_swipe_blacklist',
            'auto_swipe_blacklist_threshold',
            'tag_import_setting',
        ]) {
            expect(panel).toContain(`id="${id}"`);
        }

        // The drawer-content element stays as the mount shell.
        expect(indexHtml).toContain('id="user-settings-block"');
        // The inner markup moved out of index.html.
        expect(indexHtml).not.toContain('user-settings-block-content');
        expect(indexHtml).not.toContain('id="ui_language_select"');
    });

    test('name= layout attributes are preserved for [name=...] CSS selectors', () => {
        const panel = readRepoFile('app/components/power-user/PowerUserPanel.tsx');
        const styleCss = readRepoFile('public/style.css');

        // style.css targets these layout divs via attribute selectors.
        expect(styleCss).toContain('#user-settings-block [name="MiscellaneousToggles"]');
        for (const name of [
            'userSettingsRowOne',
            'UserSettingsRowTwo',
            'MiscellaneousToggles',
            'UserSettingsThirdColumn',
        ]) {
            expect(panel).toContain(`name="${name}"`);
        }
    });

    test('mount runs before getSettings bindings attach', () => {
        const powerUser = readRepoFile('public/scripts/power-user.js');
        const script = readRepoFile('public/script.js');
        const workspacePanels = readRepoFile('app/workspace-panels.tsx');

        expect(powerUser).toContain('export async function mountPowerUserPanel(');
        expect(powerUser).toContain('loadWorkspacePanelsModule');
        expect(powerUser).toContain('module.mountPowerUserPanel(host)');
        expect(workspacePanels).toContain('export function mountPowerUserPanel(');
        expect(workspacePanels).toContain('PowerUserPanel');

        const mountIndex = script.indexOf("measureStartupStage('mountPowerUserPanel'");
        const settingsIndex = script.indexOf('await getSettings(initLoaderHandle)');
        expect(mountIndex).toBeGreaterThan(-1);
        expect(settingsIndex).toBeGreaterThan(-1);
        expect(mountIndex).toBeLessThan(settingsIndex);
    });
});
