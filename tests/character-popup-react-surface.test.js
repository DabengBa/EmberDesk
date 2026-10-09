import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function readRepoFile(relativePath) {
    return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

describe('Advanced Definitions popup React surface', () => {
    const indexHtml = readRepoFile('public/index.html');
    const popup = readRepoFile('app/components/character-popup/CharacterPopup.tsx');
    const script = readRepoFile('public/script.js');

    test('popup shell stays in index.html while inner markup is React-owned', () => {
        expect(indexHtml).toContain('id="character_popup"');
        const block = indexHtml.match(/<div id="character_popup"[^>]*>([\s\S]*?)<\/div>/)?.[0] ?? '';
        expect(block).toContain('class="flex-container flexFlowColumn flexNoGap"');
        expect(block).not.toContain('id="character_popup_ok"');
        expect(block).not.toContain('id="system_prompt_textarea"');
    });

    test('React component preserves all contract IDs', () => {
        const ids = [
            'character_popup_text', 'character_popup-button-h3', 'character_cross',
            'system_prompt_textarea', 'post_history_instructions_textarea',
            'creator_textarea', 'character_version_textarea',
            'creator_notes_textarea', 'tags_textarea',
            'scenario_div', 'scenario_pole',
            'depth_prompt_div', 'depth_prompt_prompt', 'depth_prompt_depth',
            'depth_prompt_role', 'mes_example_div', 'mes_example_textarea',
            'character_popup_ok',
        ];
        for (const id of ids) {
            expect(popup).toContain(`id="${id}"`);
        }
        // form= association with the character form is a live contract.
        expect(popup).toContain('form="form_create"');
        // editor_maximize uses data-for to locate its target textarea.
        expect(popup).toContain('data-for="system_prompt_textarea"');
        expect(popup).toContain('data-macros');
    });

    test('mount runs before initSecrets and inside startup', () => {
        expect(script).toContain('async function mountCharacterPopup()');
        expect(script).toContain('module.mountCharacterPopup(host)');
        const mountIdx = script.indexOf("measureStartupStage('mountCharacterPopup'");
        const secretsIdx = script.indexOf("measureStartupStage('initSecrets'");
        const legacyBindIdx = script.indexOf('await bindLegacyShellHandlers()');
        const domHandlersSource = readRepoFile('public/scripts/dom-handlers.js');
        expect(domHandlersSource).toContain("$('#character_cross').on('click'");
        expect(mountIdx).toBeGreaterThan(-1);
        expect(mountIdx).toBeLessThan(secretsIdx);
        expect(mountIdx).toBeLessThan(legacyBindIdx);
    });
});
