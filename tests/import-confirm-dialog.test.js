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

describe('unified character import confirmation dialog', () => {
    test('Import All selects every option and submits the dialog', () => {
        const source = read('public/scripts/import-confirm-dialog.js');
        const importAllButtonStart = source.indexOf('text: t`Import All`');
        const importAllButtonEnd = source.indexOf('}],', importAllButtonStart);
        const importAllButtonSource = source.slice(importAllButtonStart, importAllButtonEnd);

        expect(importAllButtonStart).toBeGreaterThanOrEqual(0);
        expect(importAllButtonEnd).toBeGreaterThan(importAllButtonStart);
        expect(importAllButtonSource).toContain('result: POPUP_RESULT.AFFIRMATIVE');
        expect(importAllButtonSource).toContain('cb.checked = true');
        expect(importAllButtonSource).toContain('importAllChoices = {');
    });

    test('keeps import confirmation styling in the shared popup stylesheet', () => {
        const source = read('public/scripts/import-confirm-dialog.js');
        const popupStyles = read('public/css/popup.css');

        expect(source).not.toContain('<style>');
        expect(source).toContain('class="import-confirm-dialog"');
        expect(source).toContain('class="import-opt-title"');
        expect(source).toContain('class="import-opt-char"');
        expect(source).toContain('class="import-opt-list"');
        expect(source).toContain('class="import-opt-item"');
        expect(source).toContain('class="import-opt-body"');
        expect(source).toContain('class="import-opt-label"');
        expect(source).toContain('class="import-opt-meta"');
        expect(source).toContain('class="import-opt-chip"');
        expect(source).toContain('class="import-opt-overwrite"');

        expect(popupStyles).toContain('.import-confirm-dialog');
        expect(popupStyles).toContain('.import-opt-char');
        expect(popupStyles).toContain('var(--SmartThemeQuoteColor)');
        expect(popupStyles).toContain('var(--SmartThemeEmColor)');
        expect(popupStyles).toContain('var(--SmartThemeBorderColor)');
        expect(popupStyles).toContain('@media (max-width: 480px)');
        expect(popupStyles).toContain('.popup-controls');
        expect(popupStyles).toContain('flex-wrap: wrap;');
    });
});
