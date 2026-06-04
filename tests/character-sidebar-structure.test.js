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

describe('character detail sidebar structure', () => {
    test('solo character editor uses the compact detail panel structure', () => {
        const indexHtml = read('public/index.html');

        expect(indexHtml).toContain('character-detail-panel');
        expect(indexHtml).toContain('character-detail-primary-actions');
        expect(indexHtml).toContain('character-detail-main');
        expect(indexHtml).toContain('character-detail-hidden-actions');
        expect(indexHtml).toContain('character-detail-section');
        expect(indexHtml).toContain('id="character_action_duplicate"');
        expect(indexHtml).toContain('id="character_action_export"');
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

        expect(source).toContain('function toggleCharacterExportPopup(referenceElement = document.getElementById(\'export_button\'))');
        expect(source).toContain('case \'character_action_connected_personas\':');
        expect(source).toContain('case \'character_action_export\':');
        expect(source).toContain('case \'character_action_duplicate\':');
        expect(source).toContain('case \'character_action_advanced\':');
    });

    test('export format options are real buttons for keyboard and assistive tech', () => {
        const indexHtml = read('public/index.html');
        const accessibilitySource = read('public/scripts/a11y.js');

        expect(indexHtml).toMatch(/<button[^>]*class="export_format list-group-item"[^>]*data-format="png"[^>]*type="button"[^>]*>PNG<\/button>/);
        expect(indexHtml).toMatch(/<button[^>]*class="export_format list-group-item"[^>]*data-format="json"[^>]*type="button"[^>]*>JSON<\/button>/);
        expect(accessibilitySource).toContain('function isNativeInteractiveElement(element)');
        expect(accessibilitySource).toMatch(/if \(isNativeInteractiveElement\(element\)\) \{\s+return;\s+\}\s+element\.setAttribute\('role', 'listitem'\);/);
    });

    test('export format popup keeps keyboard focus and reports export results', () => {
        const source = read('public/script.js');

        expect(source).toContain('function closeCharacterExportPopup({ restoreFocus = true } = {})');
        expect(source).toContain('exportPopup.querySelector(\'.export_format\')?.focus();');
        expect(source).toMatch(/event\.key === 'Escape'[\s\S]+closeCharacterExportPopup\(\)/);
        expect(source).toMatch(/exportPopupTrigger\.focus\(\)/);
        expect(source).toMatch(/toastr\.success\([\s\S]+Character export download started\./);
        expect(source).toMatch(/toastr\.error\([\s\S]+Could not download file/);
    });
});
