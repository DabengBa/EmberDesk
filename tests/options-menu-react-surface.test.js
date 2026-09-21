import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function readRepoFile(relativePath) {
    return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

describe('options menu + character context menu React surfaces', () => {
    const indexHtml = readRepoFile('public/index.html');
    const options = readRepoFile('app/components/options-menu/OptionsMenu.tsx');
    const ctxMenu = readRepoFile('app/components/context-menu/CharacterContextMenu.tsx');
    const script = readRepoFile('public/script.js');

    test('options shell stays legacy-owned; items are React-owned', () => {
        const block = indexHtml.match(/<div id="options"[^>]*>([\s\S]*?)<\/div>/)?.[0] ?? '';
        expect(block).toContain('id="options"');
        expect(block).toContain('style="display: none;"');
        expect(block).not.toContain('options-content');
    });

    test('options component preserves item IDs and the duplicate close-chat ID', () => {
        const ids = [
            'option_back_to_main',
            'option_start_new_chat', 'option_select_chat', 'option_delete_mes',
            'option_regenerate', 'option_impersonate', 'option_continue',
        ];
        for (const id of ids) {
            expect(options).toContain(`id="${id}"`);
        }
        // Legacy markup duplicates option_close_chat; both elements are kept.
        expect(options.match(/id="option_close_chat"/g)).toHaveLength(2);
    });

    test('character context menu items are React-owned with shell preserved', () => {
        expect(indexHtml).toContain('id="character_context_menu"');
        expect(indexHtml).not.toContain('id="character_context_menu_favorite"');
        const ids = [
            'character_context_menu_favorite', 'character_context_menu_tag',
            'character_context_menu_duplicate', 'character_context_menu_persona',
            'character_context_menu_delete',
        ];
        for (const id of ids) {
            expect(ctxMenu).toContain(`id="${id}"`);
        }
    });

    test('both mounts run before registerCoreModules', () => {
        const coreIdx = script.indexOf("measureStartupStage('registerCoreModules'");
        const optIdx = script.indexOf("measureStartupStage('mountOptionsMenu'");
        const ctxIdx = script.indexOf("measureStartupStage('mountCharacterContextMenu'");
        expect(optIdx).toBeGreaterThan(-1);
        expect(ctxIdx).toBeGreaterThan(-1);
        expect(optIdx).toBeLessThan(coreIdx);
        expect(ctxIdx).toBeLessThan(coreIdx);
    });
});
