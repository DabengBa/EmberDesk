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
    test('the bootstrapped typed controller is the only dialogue result owner', () => {
        const script = read('public/script.js');
        const handlers = read('public/script.js');
        expect(script).toContain('dialogueController = workspace.createDialogueController()');
        expect(script).not.toContain('dialogueResolve');
        expect(handlers).not.toContain('state.dialogueResolve');
        expect(handlers).toContain('const controller = dialogueController');
    });
    test('bulk deletion uses the typed selection rather than a second shell index', () => {
        const controls = read('app/components/dialogue-popups/DialoguePopups.tsx');
        const script = read('public/script.js');
        expect(controls).toContain('controller.confirm(deletingLabel(), deleteFrom)');
        expect(script).toContain('deleteFrom: index => getChatMessageCommands().deleteFrom(index)');
        expect(script).not.toContain('this_del_mes');
    });
    test('dialogue controls accept direct React command callbacks', () => {
        const source = read('app/components/dialogue-popups/DialoguePopups.tsx');
        expect(source).toContain('commands?.confirmDialoguePopup');
        expect(source).toContain('commands?.cancelDialoguePopup');
        expect(read('public/script.js')).toContain('runDialoguePopupCommand');
        expect(read('app/workspace-panels.tsx')).toContain('<DialoguePopupControls commands={commands}');
    });
    test('confirmation popup buttons are React-owned contract buttons bound by ID', () => {
        const source = read('app/components/dialogue-popups/DialoguePopups.tsx');

        expect(source).toMatch(/<ContractButton[^>]*id="dialogue_popup_ok"[^>]*className="menu_button"[^>]*label="Delete"[^>]*labelClassName="dialogue-popup-btn-label"[^>]*data-result="1"[^>]*\/>/);
        expect(source).toMatch(/<ContractButton[^>]*id="dialogue_popup_cancel"[^>]*className="menu_button"[^>]*label="Cancel"[^>]*data-result="0"[^>]*\/>/);
        expect(source).toMatch(/<ContractButton[^\n]*id="dialogue_del_mes_ok"[^\n]*className="menu_button"[^\n]*label="Delete"[^\n]*disabled=\{state.selected === null \|\| state.busy\}[^\n]*\/>/);
        expect(source).toMatch(/<ContractButton[^>]*id="dialogue_del_mes_cancel"[^>]*className="menu_button"[^>]*label="Cancel"[^>]*disabled=\{state.busy\}[^>]*\/>/);
    });

    test('popup shells stay legacy markup while control containers are React mount targets', () => {
        const index = read('app/components/workspace/WorkspaceHost.tsx');

        expect(index).toContain('id="dialogue_popup_holder"');
        expect(index).toContain('id="dialogue_popup_text"');
        expect(index).toContain('id="dialogue_popup_input"');
        expect(index).toContain('id="dialogue_popup_controls"');
        expect(index).toContain('id="dialogue_del_mes"');
        expect(index).not.toContain('id="dialogue_popup_ok" className="menu_button"');
        expect(index).not.toContain('id="dialogue_del_mes_ok"');
    });

    test('dialogue controls mount after their controller without native click handlers', () => {
        const scriptSource = read('public/script.js');
        const domHandlersSource = read('public/script.js');

        expect(domHandlersSource).not.toContain('bindLegacyShellHandlers');
        expect(domHandlersSource).not.toContain("$(document).on('click', '#dialogue_popup_ok'");
        expect(domHandlersSource).not.toContain("$(document).on('click', '#dialogue_popup_cancel'");
        const controllerIdx = scriptSource.indexOf('dialogueController = workspace.createDialogueController()');
        const mountIdx = scriptSource.indexOf("measureStartupStage('mountDialoguePopupControls'");
        expect(controllerIdx).toBeGreaterThanOrEqual(0);
        expect(mountIdx).toBeGreaterThan(controllerIdx);
        expect(scriptSource).toContain("measureStartupStage('mountDialogueDelMesControls'");
    });
});
