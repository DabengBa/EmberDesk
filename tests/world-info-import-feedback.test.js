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

function extractBlock(source, startNeedle, endNeedle) {
    const start = source.indexOf(startNeedle);
    const end = source.indexOf(endNeedle, start);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    return source.slice(start, end);
}

describe('world info import feedback', () => {
    test('file import change flow restores busy state after every import outcome', () => {
        const source = read('public/scripts/world-info.js');
        const changeHandler = extractBlock(
            source,
            "$('#world_import_file').on('change'",
            '// More menu toggle',
        );
        const busyHelper = extractBlock(
            source,
            'function setWorldImportBusy(isBusy)',
            'const saveSettingsDebounced',
        );

        expect(source).toContain('let worldInfoImportBusy = false;');
        expect(source).toContain('let worldInfoImportToast = null;');
        expect(source).toContain('function setWorldImportBusy(isBusy)');
        expect(changeHandler).toContain('setWorldImportBusy(true);');
        expect(changeHandler).toContain('try {');
        expect(changeHandler).toContain('await importWorldInfo(file);');
        expect(changeHandler).toContain('finally {');
        expect(changeHandler).toContain('setWorldImportBusy(false);');
        expect(changeHandler).toContain("e.target.value = '';");
        expect(busyHelper).toContain("$('#world_import_file').prop('disabled', worldInfoImportBusy);");
        expect(busyHelper).toContain(".attr('aria-disabled', String(worldInfoImportBusy));");
        expect(busyHelper).toContain('fa-spinner fa-spin');
        expect(busyHelper).toContain('toastr.clear(worldInfoImportToast');
    });

    test('import menu blocks duplicate file picker opens while import is busy', () => {
        const source = read('public/scripts/world-info.js');
        const clickHandler = extractBlock(
            source,
            "$('#world_import_menu_item').on('click'",
            "$('#world_import_file').on('change'",
        );

        expect(clickHandler).toContain('if (worldInfoImportBusy) {');
        expect(clickHandler).toContain('return;');
        expect(clickHandler.indexOf('if (worldInfoImportBusy) {')).toBeLessThan(clickHandler.indexOf("$('#world_import_file').trigger('click');"));
    });

    test('embedded world import reports a selected character without embedded data', () => {
        const source = read('public/scripts/world-info.js');
        const importEmbeddedSource = extractBlock(
            source,
            'export async function importEmbeddedWorldInfo(skipPopup = false)',
            'export function onWorldInfoChange(args, text)',
        );

        expect(importEmbeddedSource).toContain('if (chid === undefined || chid === -1) {');
        expect(importEmbeddedSource).toContain('if (!hasEmbed) {');
        expect(importEmbeddedSource).toContain('toastr.info(t`This character card does not contain embedded World/Lorebook data.`);');
        expect(importEmbeddedSource.indexOf('if (chid === undefined || chid === -1) {')).toBeLessThan(importEmbeddedSource.indexOf('toastr.info(t`This character card does not contain embedded World/Lorebook data.`);'));
    });

    test('world import input remains a single-file import contract', () => {
        const panelHtml = read('public/panels/world-info-body.html');
        const worldInfoCss = read('public/css/world-info.css');

        expect(panelHtml).toContain('id="world_import_file"');
        expect(panelHtml).toContain('accept=".json,.lorebook,.png"');
        expect(panelHtml).toContain('id="world_import_menu_item"');
        expect(panelHtml).not.toMatch(/<input[^>]+id="world_import_file"[^>]+multiple/);
        expect(worldInfoCss).toContain('#world_more_menu_dropdown .options-menu[aria-disabled="true"]');
        expect(worldInfoCss).toContain('pointer-events: none;');
    });
});
