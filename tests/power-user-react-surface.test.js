import { describe, expect, test } from '@jest/globals';
import { readRepoFile } from './helpers/frontend-compatibility-contract.js';

describe('power-user settings drawer React surface (Wave A)', () => {
    test('React owns the drawer markup; only Frontend Frames remains', () => {
        const panel = readRepoFile('app/components/power-user/PowerUserPanel.tsx');
        const indexHtml = readRepoFile('public/index.html');

        // The surviving controls are the Frontend Frames settings bound by ID
        // in loadPowerUserSettings / registerPowerUserEvents.
        for (const id of [
            'user-settings-block-content',
            'frontend_frames_enabled',
            'frontend_frames_depth',
            'frontend_frames_depth_ignore_hidden',
            'frontend_frames_collapse_code_block',
            'frontend_frames_skip_highlight',
            'frontend_frames_use_blob_url',
            'frontend_frames_allow_streaming',
        ]) {
            expect(panel).toContain(`id="${id}"`);
        }

        // Retired controls are gone from the drawer markup.
        for (const id of [
            'ui_language_select',
            'version_display',
            'settingsSearch',
            'account_button',
            'admin_button',
            'logout_button',
            'swipes-checkbox',
            'example_messages_behavior',
            'reload_chat',
            'debug_menu',
            'data_maid_button',
            'smooth_streaming',
            'stscript_autocomplete_state',
            'stscript_matching',
        ]) {
            expect(panel).not.toContain(`id="${id}"`);
        }

        // The drawer-content element stays as the mount shell.
        expect(indexHtml).toContain('id="user-settings-block"');
        // The inner markup moved out of index.html.
        expect(indexHtml).not.toContain('user-settings-block-content');
        expect(indexHtml).not.toContain('id="ui_language_select"');
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
