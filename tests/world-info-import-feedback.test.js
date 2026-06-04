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
    test('file import change flow batches selected files and restores input state', () => {
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
        expect(source).toContain('export async function importWorldInfoFiles(files)');
        expect(changeHandler).toContain('const files = Array.from(e.target.files ?? []);');
        expect(changeHandler).toContain('try {');
        expect(changeHandler).toContain('await importWorldInfoFiles(files);');
        expect(changeHandler).toContain('finally {');
        expect(changeHandler).toContain("e.target.value = '';");
        expect(changeHandler).not.toContain('e.target.files[0]');
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

    test('world import input supports multi-file selection', () => {
        const panelHtml = read('public/panels/world-info-body.html');
        const worldInfoCss = read('public/css/world-info.css');

        expect(panelHtml).toContain('id="world_import_file"');
        expect(panelHtml).toContain('accept=".json,.lorebook,.png"');
        expect(panelHtml).toMatch(/<input[^>]+id="world_import_file"[^>]+multiple/);
        expect(panelHtml).toContain('id="world_import_menu_item"');
        expect(worldInfoCss).toContain('#world_more_menu_dropdown .options-menu[aria-disabled="true"]');
        expect(worldInfoCss).toContain('pointer-events: none;');
    });

    test('world import queue runs sequentially and summarizes partial outcomes', () => {
        const source = read('public/scripts/world-info.js');
        const batchSource = extractBlock(
            source,
            'export async function importWorldInfoFiles(files)',
            'export async function importWorldInfo(file',
        );

        expect(source).toContain('function createWorldInfoImportResult(status, file, worldName = null)');
        expect(source).toContain('function summarizeWorldInfoBatchImport(results)');
        expect(source).toContain('function showWorldInfoBatchImportSummary(summary)');
        expect(batchSource).toContain('const queue = Array.from(files ?? []).filter(Boolean);');
        expect(batchSource).toContain('if (worldInfoImportBusy) {');
        expect(batchSource).toContain('setWorldImportBusy(true, { showToast: false });');
        expect(batchSource).toContain('for (let index = 0; index < queue.length; index++) {');
        expect(batchSource).toContain('const file = queue[index];');
        expect(batchSource).toContain('await importWorldInfo(file');
        expect(batchSource).toContain('results.push(result);');
        expect(batchSource).toContain('catch (error) {');
        expect(batchSource).toContain("createWorldInfoImportResult('failed', file)");
        expect(batchSource).toContain('showWorldInfoBatchImportSummary(summary);');
        expect(batchSource).toContain('setWorldImportBusy(false);');
        expect(batchSource).not.toContain('Promise.all');
    });

    test('world import batch supports drag-drop, conflict choices, and cancel remaining', () => {
        const source = read('public/scripts/world-info.js');
        const panelInit = extractBlock(
            source,
            "if (!worldInfoPanelInitialized && document.querySelector('#world_editor_select')) {",
            '// More menu toggle',
        );
        const batchSource = extractBlock(
            source,
            'export async function importWorldInfoFiles(files)',
            'export async function importWorldInfo(file',
        );

        expect(source).toContain("import { DragAndDropHandler } from './dragdrop.js';");
        expect(panelInit).toContain("new DragAndDropHandler('#world_popup'");
        expect(panelInit).toContain('await importWorldInfoFiles(files);');
        expect(source).toContain('function showWorldInfoBatchConflictPopup(conflicts)');
        expect(source).toContain('POPUP_RESULT.CUSTOM1');
        expect(source).toContain('WORLD_INFO_IMPORT_CONFLICT_CHOICE');
        expect(source).toContain('function updateWorldInfoBatchProgress(batchState, index, total, file)');
        expect(source).toContain('world-info-batch-cancel');
        expect(source).toContain('batchState.cancelRequested = true;');
        expect(batchSource).toContain('if (batchState.cancelRequested) {');
        expect(batchSource).toContain("createWorldInfoImportResult('skipped', file)");
        expect(batchSource).toContain('result.unprocessed = true;');
    });

    test('world import derives reusable format and entry-count metadata', () => {
        const source = read('public/scripts/world-info.js');
        const importSource = extractBlock(
            source,
            'export async function importWorldInfo(file',
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

    test('world import returns structured results for batch summaries', () => {
        const source = read('public/scripts/world-info.js');
        const importSource = extractBlock(
            source,
            'export async function importWorldInfo(file',
            'export function openWorldInfoEditor(worldName)',
        );

        expect(importSource).toContain("return createWorldInfoImportResult('skipped', file);");
        expect(importSource).toContain("return createWorldInfoImportResult('failed', file);");
        expect(importSource).toContain("return createWorldInfoImportResult('cancelled', file, sanitizedWorldName);");
        expect(importSource).toContain("return createWorldInfoImportResult('success', file, data.name);");
        expect(importSource).toContain('overwriteMode = WORLD_INFO_IMPORT_CONFLICT_CHOICE.CONFIRM');
        expect(importSource).toContain('prepareWorldInfoImportOverwrite(sanitizedWorldName, metadata, overwriteMode)');
    });

    test('world import overwrite confirmation includes context and safe action labels', () => {
        const worldInfoSource = read('public/scripts/world-info.js');
        const utilsSource = read('public/scripts/utils.js');
        const importSource = extractBlock(
            worldInfoSource,
            'export async function importWorldInfo(file',
            'export function openWorldInfoEditor(worldName)',
        );
        const prepareOverwriteSource = extractBlock(
            worldInfoSource,
            'async function prepareWorldInfoImportOverwrite',
            'const saveSettingsDebounced',
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
        expect(importSource).toContain('prepareWorldInfoImportOverwrite(sanitizedWorldName, metadata, overwriteMode)');
        expect(prepareOverwriteSource).toContain('contextHtml: buildWorldInfoImportContextHtml(metadata)');
        expect(prepareOverwriteSource).toContain("okButton: buildWorldInfoOverwriteButtonLabel(metadata)");
        expect(prepareOverwriteSource).toContain("cancelButton: t`Cancel`");
        expect(prepareOverwriteSource).toContain('defaultResult: POPUP_RESULT.NEGATIVE');
        expect(prepareOverwriteSource).toContain('popup.cancelButton.focus()');
        expect(prepareOverwriteSource).toContain('buildWorldInfoOverwriteButtonLabel(metadata)');
        expect(worldInfoSource).toContain('formatWorldInfoEntryCount(metadata?.entryCount)');
    });

    test('world import classifies parsing, PNG, large-file, and network outcomes', () => {
        const source = read('public/scripts/world-info.js');
        const importSource = extractBlock(
            source,
            'export async function importWorldInfo(file',
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
            'export async function importWorldInfo(file',
            'export function openWorldInfoEditor(worldName)',
        );

        expect(importSource).toContain('buildWorldInfoImportSuccessMessage(data.name, metadata)');
        expect(source).toContain('Switched to the imported World Info.');
        expect(source).toContain('formatWorldInfoImportSummary(metadata)');
        expect(importSource).not.toContain('World Info "${data.name}" imported successfully!');
    });
});
