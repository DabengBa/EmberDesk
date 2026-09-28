import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function readRepoFile(relativePath) {
    return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

describe('right navigation panel React surface', () => {
    const indexHtml = readRepoFile('public/index.html');
    const panel = readRepoFile('app/components/right-nav/RightNavPanel.tsx');
    const script = readRepoFile('public/script.js');
    const rossMods = readRepoFile('public/scripts/RossAscends-mods.js');
    const bulkOverlay = readRepoFile('public/scripts/BulkEditOverlay.js');

    test('nav shell stays in index.html while inner markup is React-owned', () => {
        expect(indexHtml).toContain('id="right-nav-panel"');
        const block = indexHtml.match(/<nav id="right-nav-panel"[^>]*>([\s\S]*?)<\/nav>/)?.[0] ?? '';
        expect(block).toContain('class="drawer-content closedDrawer fillRight"');
        expect(block).not.toContain('id="form_create"');
        expect(block).not.toContain('id="rm_print_characters_block"');
    });

    test('React component preserves contract IDs and data attributes', () => {
        const ids = [
            'right-nav-panelheader', 'CharListButtonAndHotSwaps',
            'rm_button_panel_pin_div', 'rm_button_panel_pin', 'rm_button_characters',
            'HotSwapWrapper', 'rm_PinAndTabs', 'right-nav-panel-tabs',
            'rm_button_selected_ch', 'temporary_chat_status', 'result_info',
            'result_info_text', 'result_info_total_tokens', 'result_info_permanent_tokens',
            'chartokenwarning', 'hideCharPanelAvatarButton',
            'rm_ch_create_block', 'form_create', 'character_name_pole',
            'avatar_div', 'avatar_load_preview', 'add_avatar_button',
            'rm_button_back', 'favorite_button', 'world_button', 'delete_button',
            'fav_checkbox', 'create_button', 'create_button_label',
            'char-management-dropdown', 'advanced_div',
            'export_button', 'dupe_button', 'tags_div', 'tagInput', 'tagList',
            'spoiler_free_desc', 'creator_notes_spoiler', 'creator_notes_empty',
            'creators_note_desc_hidden', 'descriptionWrapper', 'description_textarea',
            'firstMessageWrapper', 'firstmessage_textarea', 'hidden-divs',
            'character_json_data', 'avatar_url_pole', 'selected_chat_pole',
            'create_date_pole', 'last_mes_pole', 'character_world',
            'rm_character_import', 'form_import', 'character_import_file',
            'character_import_file_type', 'character_replace_file',
            'rm_characters_block', 'charListFixedTop', 'rm_button_bar',
            'rm_button_create', 'character_import_button', 'external_import_button',
            'rm_buttons_container', 'character_sort_order', 'rm_button_search',
            'charListGridToggle', 'bulkEditButton', 'bulkSelectionHint',
            'bulkSelectedCount', 'bulkSelectAllButton', 'bulkDeleteButton',
            'form_character_search_form', 'character_search_bar',
            'character_search_status', 'rm_print_characters_pagination',
            'rm_print_characters_block',
        ];
        for (const id of ids) {
            expect(panel).toContain(`id="${id}"`);
        }
        // data-for editor_maximize targets and no_favs hotswap label are live.
        expect(panel).toContain('data-for="description_textarea"');
        expect(panel).toContain('no_favs=');
        // Protected character-list selectors and grid toggle contracts.
        expect(panel).toContain('className="character_search_status"');
        expect(panel).toContain('bulkEditOptionElement');
    });

    test('mount runs before registerCoreModules (initRossMods)', () => {
        const mountIdx = script.indexOf("measureStartupStage('mountRightNavPanel'");
        const coreIdx = script.indexOf("measureStartupStage('registerCoreModules'");
        expect(mountIdx).toBeGreaterThan(-1);
        expect(mountIdx).toBeLessThan(coreIdx);
    });

    test('RossAscends panel captures resolve at init, not module eval', () => {
        expect(rossMods).toContain('RPanelPin = document.getElementById(\'rm_button_panel_pin\')');
        expect(rossMods).toContain('SelectedCharacterTab = document.getElementById(\'rm_button_selected_ch\')');
        expect(rossMods).not.toContain('var RPanelPin = document.getElementById');
        // Module-level bindings moved into initRossMods.
        const initIdx = rossMods.indexOf('export function initRossMods()');
        const bindIdx = rossMods.indexOf("$('#rm_ch_create_block').on('input'");
        expect(bindIdx).toBeGreaterThan(initIdx);
    });

    test('BulkEditOverlay resolves its container lazily', () => {
        expect(bulkOverlay).toContain('get container()');
        expect(bulkOverlay).not.toContain('this.container = document.getElementById');
    });
});
