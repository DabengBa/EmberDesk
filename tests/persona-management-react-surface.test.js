import { describe, expect, test } from '@jest/globals';
import { readRepoFile } from './helpers/frontend-compatibility-contract.js';

describe('persona management React surface (Wave A)', () => {
    test('React owns the drawer markup with every legacy element ID preserved', () => {
        const panel = readRepoFile('app/components/personas/PersonaManagementPanel.tsx');
        const indexHtml = readRepoFile('public/index.html');

        // Legacy bindings in personas.js / power-user.js attach by ID.
        for (const id of [
            'personas_backup',
            'personas_restore',
            'personas_restore_input',
            'persona-management-block',
            'create_dummy_persona',
            'persona_search_bar',
            'persona_sort_order',
            'persona_pagination_container',
            'persona_grid_toggle',
            'user_avatar_block',
            'form_upload_avatar',
            'avatar_upload_file',
            'avatar_upload_overwrite',
            'persona_controls',
            'your_name',
            'persona_rename_button',
            'sync_name_button',
            'persona_lore_button',
            'persona_set_image_button',
            'persona_duplicate_button',
            'persona_delete_button',
            'persona-management-dropdown',
            'persona_lorebook_link',
            'persona_description',
            'persona_description_token_count',
            'persona_description_position',
            'persona_depth_position_settings',
            'persona_depth_value',
            'persona_depth_role',
            'persona_connections_buttons',
            'lock_persona_default',
            'lock_persona_to_char',
            'lock_user_name',
            'persona_connections_info_block',
            'persona_connections_list',
            'persona_show_notifications',
            'persona_allow_multi_connections',
            'persona_auto_lock',
        ]) {
            expect(panel).toContain(`id="${id}"`);
        }

        // The drawer-content element stays as the mount shell.
        expect(indexHtml).toContain('id="PersonaManagement"');
        expect(indexHtml).not.toContain('persona_controls_buttons_block');
    });

    test('mount happens before settings-driven bindings attach', () => {
        const personas = readRepoFile('public/scripts/personas.js');
        const script = readRepoFile('public/script.js');
        const workspacePanels = readRepoFile('app/workspace-panels.tsx');

        expect(personas).toContain('export async function mountPersonaManagementPanel(');
        expect(personas).toContain('loadWorkspacePanelsModule');
        expect(personas).toContain('module.mountPersonaManagement(host)');
        expect(workspacePanels).toContain('export function mountPersonaManagement(');
        expect(workspacePanels).toContain('PersonaManagementPanel');

        // getSettings() binds persona checkboxes via power-user.js, so the
        // React mount must be an earlier startup stage.
        const mountIndex = script.indexOf("measureStartupStage('mountPersonaManagement'");
        const settingsIndex = script.indexOf('await getSettings(initLoaderHandle)');
        const initIndex = script.indexOf('await initPersonas()');
        expect(mountIndex).toBeGreaterThan(-1);
        expect(settingsIndex).toBeGreaterThan(-1);
        expect(initIndex).toBeGreaterThan(-1);
        expect(mountIndex).toBeLessThan(settingsIndex);
        expect(settingsIndex).toBeLessThan(initIndex);
    });

    test('persona-owned CSS moved to StyleX while shared state rules stay legacy', () => {
        const styles = readRepoFile('app/styles/persona-panel.styles.ts');
        const styleCss = readRepoFile('public/style.css');

        expect(styles).toContain('stylex.create');
        expect(styleCss).not.toContain('#user_avatar_block {');
        expect(styleCss).not.toContain('#persona_controls .persona_name');
        expect(styleCss).not.toContain('#user_avatar_block .avatar_upload');

        // Legacy JS toggles these state classes at runtime; their styling stays.
        expect(styleCss).toContain('.avatar-container.selected');
        expect(styleCss).toContain('#lock_persona_default.locked');
    });
});
