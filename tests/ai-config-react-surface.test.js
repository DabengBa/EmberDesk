import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function readRepoFile(relativePath) {
    return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

describe('AI Response Configuration drawer React surface', () => {
    const indexHtml = readRepoFile('public/index.html');
    const panel = readRepoFile('app/components/ai-config/AiConfigPanel.tsx');
    const presetMenu = readRepoFile('app/components/ai-config/PresetActionsMenu.tsx');
    const script = readRepoFile('public/script.js');

    test('left-nav-panel shell is preserved while inner markup moves to React', () => {
        expect(indexHtml).toContain('id="left-nav-panel"');
        const block = indexHtml.match(/<div id="left-nav-panel"[^>]*>([\s\S]*?)<\/div>/)?.[0] ?? '';
        expect(block).toContain('class="drawer-content fillLeft closedDrawer"');
        expect(block).not.toContain('id="ai_response_configuration"');
        expect(block).not.toContain('id="settings_preset_openai"');
    });

    test('React component preserves contract IDs and data attributes', () => {
        const ids = [
            'left-nav-panelheader', 'lm_button_panel_pin_div', 'lm_button_panel_pin',
            'labModeWarning', 'ai_response_configuration', 'respective-presets-block',
            'openai_api-presets', 'settings_preset_openai',
            'bind_preset_to_connection', 'temp_openai',
            'top_p_openai', 'freq_pen_openai', 'pres_pen_openai',
            'n_openai', 'openai_function_calling',
            'impersonation_prompt_textarea', 'newchat_prompt_textarea',
            'newexamplechat_prompt_textarea', 'continue_nudge_prompt_textarea',
            'continue_postfix', 'continue_prefill', 'names_behavior',
            'character_names_display', 'send_if_empty_textarea',
            'wi_format_textarea', 'scenario_format_textarea',
            'personality_format_textarea',
        ];
        for (const id of ids) {
            expect(panel).toContain(`id="${id}"`);
        }
        // Preset action IDs moved into the ⋮ menu component; they stay mounted
        // because initOpenAI binds them by ID.
        for (const id of ['import_oai_preset', 'export_oai_preset', 'delete_oai_preset', 'update_oai_preset', 'new_oai_preset', 'openai_preset_import_file']) {
            expect(presetMenu).toContain(`id="${id}"`);
        }
        expect(presetMenu).toContain('data-preset-manager-rename="openai"');
        // data-for counters and preset-manager wiring are live legacy contracts.
        expect(panel).toContain('data-preset-manager-for="openai"');
        expect(panel).toContain('data-for="temp_openai"');
    });

    test('preset ⋮ menu is a React-owned floating menu over the legacy classes', () => {
        // React state toggles the .show contract class; items never unmount.
        expect(presetMenu).toContain('preset-popup-menu');
        expect(presetMenu).toContain('preset-popup-menu-item');
        expect(presetMenu).toContain('preset-menu-trigger');
        expect(presetMenu).toContain('aria-haspopup="menu"');
        expect(presetMenu).toContain('preset-menu-danger');
        expect(presetMenu).toContain('event.key === \'Escape\'');
        // The row keeps only the select + trigger (actions folded into the menu).
        const selectRow = panel.match(/settings_preset_openai[\s\S]*?<\/div>/)?.[0] ?? '';
        expect(selectRow).not.toContain('preset-action-btn');
        // jQuery open/close bindings are retired (React owns .show).
        const openai = readRepoFile('public/scripts/openai.js');
        expect(openai).not.toContain('$(\'.preset-menu-trigger\').on(\'click\'');
        expect(openai).not.toContain('removeClass(\'show\')');
        // Item action bindings remain direct-by-ID in initOpenAI.
        expect(openai).toContain('$(\'#delete_oai_preset\').on(\'click\'');
        expect(openai).toContain('$(\'#update_oai_preset\').on(\'click\'');
    });

    test('mount runs before initSecrets and initPresetManager', () => {
        const mountIdx = script.indexOf('measureStartupStage(\'mountAiConfigPanel\'');
        const secretsIdx = script.indexOf('measureStartupStage(\'initSecrets\'');
        const presetIdx = script.indexOf('measureStartupStage(\'initPresetManager\'');
        const coreIdx = script.indexOf('measureStartupStage(\'registerCoreModules\'');
        expect(mountIdx).toBeGreaterThan(-1);
        expect(mountIdx).toBeLessThan(secretsIdx);
        expect(mountIdx).toBeLessThan(coreIdx);
        expect(mountIdx).toBeLessThan(presetIdx);
    });
});
