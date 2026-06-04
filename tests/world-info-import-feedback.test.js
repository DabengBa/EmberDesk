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

    test('world import derives reusable format and entry-count metadata', () => {
        const source = read('public/scripts/world-info.js');
        const importSource = extractBlock(
            source,
            'export async function importWorldInfo(file)',
            'export function openWorldInfoEditor(worldName)',
        );

        expect(source).toContain('const WORLD_INFO_IMPORT_LARGE_FILE_THRESHOLD_BYTES = 10 * 1024 * 1024;');
        expect(source).toContain('function detectWorldInfoImportMetadata(jsonData, { sourceFormatLabel = \'World Info JSON\' } = {})');
        expect(source).toContain('function countWorldInfoEntries(data)');
        expect(source).toContain('function formatWorldInfoImportSummary(metadata)');
        expect(source).toContain("formatLabel: 'Novel Lorebook'");
        expect(source).toContain("formatLabel: 'Agnai Memory Book'");
        expect(source).toContain("formatLabel: 'Risu Lorebook'");
        expect(source).toContain('formatLabel: sourceFormatLabel');
        expect(importSource).toContain("detectWorldInfoImportMetadata(jsonData, { sourceFormatLabel: file.name.endsWith('.png') ? 'PNG NAI data' : 'World Info JSON' })");
        expect(importSource).toContain("formData.append('convertedData', JSON.stringify(metadata.convertedData));");
        expect(source).toContain('formatWorldInfoImportSummary(metadata)');
        expect(source).toContain('countWorldInfoEntries(metadata.convertedData');
    });

    test('world import overwrite confirmation includes context and safe action labels', () => {
        const worldInfoSource = read('public/scripts/world-info.js');
        const utilsSource = read('public/scripts/utils.js');
        const importSource = extractBlock(
            worldInfoSource,
            'export async function importWorldInfo(file)',
            'export function openWorldInfoEditor(worldName)',
        );
        const overwriteHelper = extractBlock(
            utilsSource,
            'export async function checkOverwriteExistingData',
            'export function getFreeName',
        );

        expect(overwriteHelper).toContain('contextHtml = null');
        expect(overwriteHelper).toContain('confirmOptions = {}');
        expect(overwriteHelper).toContain('${contextHtml ?? \'\'}');
        expect(overwriteHelper).toContain('Popup.show.confirm');
        expect(overwriteHelper).toContain('confirmOptions');
        expect(importSource).toContain('contextHtml: buildWorldInfoImportContextHtml(metadata)');
        expect(importSource).toContain("okButton: buildWorldInfoOverwriteButtonLabel(metadata)");
        expect(importSource).toContain("cancelButton: t`Cancel`");
        expect(importSource).toContain('defaultResult: POPUP_RESULT.NEGATIVE');
        expect(importSource).toContain('popup.cancelButton.focus()');
        expect(importSource).toContain('buildWorldInfoOverwriteButtonLabel(metadata)');
        expect(worldInfoSource).toContain('formatWorldInfoEntryCount(metadata?.entryCount)');
    });

    test('world import classifies parsing, PNG, large-file, and network outcomes', () => {
        const source = read('public/scripts/world-info.js');
        const importSource = extractBlock(
            source,
            'export async function importWorldInfo(file)',
            'export function openWorldInfoEditor(worldName)',
        );

        expect(importSource).toContain('file.size > WORLD_INFO_IMPORT_LARGE_FILE_THRESHOLD_BYTES');
        expect(importSource).toContain('toastr.info(t`This file is large. Importing may take longer than usual.`)');
        expect(importSource).toContain("extractDataFromPng(buffer, 'naidata')");
        expect(importSource).toContain("extractDataFromPng(buffer, 'chara')");
        expect(importSource).toContain('This PNG contains character card data, but no World Info data. To import the character card, use character import.');
        expect(importSource).toContain('This PNG file does not contain importable World Info data.');
        expect(importSource).toContain('File contents are damaged or in an unsupported format. Please check that the file is complete.');
        expect(importSource).toContain('Unsupported World Info file format. Supported formats: World Info JSON (SillyTavern compatible), PNG NAI data, Novel Lorebook, Agnai Memory Book, Risu Lorebook.');
        expect(importSource).toContain('result.status === 413');
        expect(importSource).toContain('File is too large. Please check the file contents or compress it before retrying.');
        expect(importSource).toContain('Import failed. Please check your connection and try again.');
        expect(importSource).toContain('console.error');
    });

    test('world import success toast reports imported context and automatic editor switch', () => {
        const source = read('public/scripts/world-info.js');
        const importSource = extractBlock(
            source,
            'export async function importWorldInfo(file)',
            'export function openWorldInfoEditor(worldName)',
        );

        expect(importSource).toContain('buildWorldInfoImportSuccessMessage(data.name, metadata)');
        expect(source).toContain('Switched to the imported World Info.');
        expect(source).toContain('formatWorldInfoImportSummary(metadata)');
        expect(importSource).not.toContain('World Info "${data.name}" imported successfully!');
    });
});
