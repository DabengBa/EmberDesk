import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from '@jest/globals';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('legacy dialogue popup structure', () => {
    test('confirmation popup buttons are React-owned contract buttons bound by ID', () => {
        const source = read('app/components/dialogue-popups/DialoguePopups.tsx');

        expect(source).toMatch(/<ContractButton[^>]*id="dialogue_popup_ok"[^>]*className="menu_button"[^>]*label="Delete"[^>]*labelClassName="dialogue-popup-btn-label"[^>]*data-result="1"[^>]*\/>/);
        expect(source).toMatch(/<ContractButton[^>]*id="dialogue_popup_cancel"[^>]*className="menu_button"[^>]*label="Cancel"[^>]*data-result="0"[^>]*\/>/);
        expect(source).toMatch(/<ContractButton[^>]*id="dialogue_del_mes_ok"[^>]*className="menu_button"[^>]*label="Delete"[^>]*\/>/);
        expect(source).toMatch(/<ContractButton[^>]*id="dialogue_del_mes_cancel"[^>]*className="menu_button"[^>]*label="Cancel"[^>]*\/>/);
    });

    test('popup shells stay legacy markup while control containers are React mount targets', () => {
        const index = read('public/index.html');

        expect(index).toContain('id="dialogue_popup_holder"');
        expect(index).toContain('id="dialogue_popup_text"');
        expect(index).toContain('id="dialogue_popup_input"');
        expect(index).toContain('id="dialogue_popup_controls"');
        expect(index).toContain('id="dialogue_del_mes"');
        expect(index).not.toContain('id="dialogue_popup_ok" class="menu_button"');
        expect(index).not.toContain('id="dialogue_del_mes_ok"');
    });

    test('control mounts run before the ID-bound click handlers', () => {
        const scriptSource = read('public/script.js');
        const domHandlersSource = read('public/scripts/dom-handlers.js');

        expect(domHandlersSource).toContain('mountDialoguePopupControls()');
        expect(domHandlersSource).toContain('mountDialogueDelMesControls()');
        const mountIdx = domHandlersSource.indexOf('mountDialoguePopupControls()');
        const bindIdx = domHandlersSource.indexOf("$('#dialogue_popup_ok').on('click'");
        expect(mountIdx).toBeGreaterThanOrEqual(0);
        expect(bindIdx).toBeGreaterThan(mountIdx);

        expect(scriptSource).toContain("measureStartupStage('mountDialoguePopupControls'");
        expect(scriptSource).toContain("measureStartupStage('mountDialogueDelMesControls'");
    });
});
