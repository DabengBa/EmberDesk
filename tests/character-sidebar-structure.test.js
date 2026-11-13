import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from '@jest/globals';
import { loadTsModule } from './helpers/load-ts-module.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('character detail sidebar structure', () => {
    test('solo character editor uses the compact detail panel structure', () => {
        const rightNavPanel = read('app/components/right-nav/RightNavPanel.tsx');

        expect(rightNavPanel).toContain('character-detail-panel');
        expect(rightNavPanel).toContain('character-detail-primary-actions');
        expect(rightNavPanel).toContain('character-detail-main');
        expect(rightNavPanel).toContain('character-detail-hidden-actions');
        expect(rightNavPanel).toContain('character-detail-section');
        expect(rightNavPanel).toContain('id="character_action_duplicate"');
        expect(rightNavPanel).toContain('id="character_action_export"');
    });

    test('character detail panel has a dedicated visual layer', () => {
        const css = read('public/style.css');

        expect(css).toContain('.character-detail-panel #form_create');
        expect(css).toContain('#avatar-and-name-block.character-detail-identity');
        expect(css).toContain('.character-detail-hidden-actions');
        expect(css).toContain('.character-detail-section textarea');
        expect(css).toContain('.character-detail-panel .extension_token_counter');
    });

    test('more menu delegates compact actions to existing character controls', () => {
        const source = read('public/script.js');
        const domHandlersSource = read('public/scripts/dom-handlers.js');

        expect(source).toContain('function toggleCharacterExportPopup(referenceElement = document.getElementById(\'export_button\'))');
        expect(domHandlersSource).toContain('case \'character_action_export\':');
        expect(domHandlersSource).toContain('case \'character_action_duplicate\':');
        expect(domHandlersSource).toContain('case \'delete_from_dropdown\':');
    });

    test('export format options are real buttons for keyboard and assistive tech', () => {
        const exportFormatPopup = read('app/components/export-format/ExportFormatPopup.tsx');
        const accessibilitySource = read('public/scripts/a11y.js');

        expect(exportFormatPopup).toMatch(/<ContractButton[^>]*className="export_format list-group-item"[^>]*data-format="png"[^>]*label="PNG"[^>]*onClick=/);
        expect(exportFormatPopup).toMatch(/<ContractButton[^>]*className="export_format list-group-item"[^>]*data-format="json"[^>]*label="JSON"[^>]*onClick=/);
        const contractButton = read('app/components/contract/ContractButton.tsx');
        expect(contractButton).toContain("type = 'button'");
        expect(contractButton).toContain('<Button');
        expect(accessibilitySource).toContain('function isNativeInteractiveElement(element)');
        expect(accessibilitySource).toMatch(/if \(isNativeInteractiveElement\(element\)\) \{\s+return;\s+\}\s+element\.setAttribute\('role', 'listitem'\);/);
    });

    test('export format popup keeps keyboard focus and reports export results', async () => {
        const source = read('public/script.js');
        const domHandlersSource = read('public/scripts/dom-handlers.js');

        expect(source).toContain('function closeCharacterExportPopup({ restoreFocus = true } = {})');
        expect(source).toContain("document.querySelector('#export_format_popup .export_format')?.focus()");
        expect(domHandlersSource).toContain('createExportPopupDismissal(');
        const { createExportPopupController, createExportPopupDismissal, exportCharacter } = await loadTsModule('app/lib/history-panel-service.ts');
        const calls = [];
        const popup = createExportPopupController({ position: () => {}, show: () => {}, hide: () => calls.push('hide'), update: () => {}, focusFirst: () => calls.push('first'), restoreFocus: trigger => calls.push(`focus:${trigger}`) });
        const dismissal = createExportPopupDismissal({ isOpen: popup.isOpen, close: popup.close });
        popup.toggle('trigger');
        expect(dismissal.key('Escape')).toBe(true);
        expect(calls).toEqual(['first', 'hide', 'focus:trigger']);
        await exportCharacter('json', { close: () => calls.push('close'), save: async () => calls.push('save'), request: async () => ({ ok: true, data: 'blob' }), download: async () => calls.push('download'), failure: () => calls.push('failure') });
        expect(calls.slice(-3)).toEqual(['close', 'save', 'download']);
        await exportCharacter('png', { close: () => {}, save: async () => {}, request: async () => ({ ok: false }), download: async () => calls.push('download'), failure: () => calls.push('failure') });
        expect(calls.at(-1)).toBe('failure');
        expect(domHandlersSource).toMatch(/toastr\.error\([\s\S]+Could not download file/);
    });
});
