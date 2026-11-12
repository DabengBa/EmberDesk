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
    test('save delegates to the confirmed persistence owner', () => {
        const source = read('public/scripts/world-info.js');
        const body = extractBlock(source, 'export async function saveWorldInfo', 'const { renameWorldInfo');
        expect(body).toContain('return worldInfoRepository.save(name, data);');
    });

    test('batch conflicts expose the full list and an explicit cancellation result', async () => {
        const source = read('public/scripts/world-info-import-ui.js');
        const body = extractBlock(source, 'async function showWorldInfoBatchConflictPopup', 'async function prepareWorldInfoImportOverwrite');
        const choice = { CONFIRM: 'confirm', OVERWRITE: 'overwrite', SKIP: 'skip', CANCEL: 'cancel' };
        const conflicts = Array.from({ length: 15 }, (_, index) => ({ file: { name: `file-${index}.json` }, existingName: `Book-${index}` }));
        let request;
        const helpers = new Function('t', 'showLocalDialog', 'WORLD_INFO_IMPORT_CONFLICT_CHOICE', `${body}; return { showWorldInfoBatchConflictPopup };`)(
            (strings, ...values) => strings.reduce((text, part, index) => text + part + (values[index] ?? ''), ''),
            async value => { request = value; return null; },
            choice,
        );
        await expect(helpers.showWorldInfoBatchConflictPopup(conflicts)).resolves.toBe('cancel');
        expect(request.list.items).toContain('file-14.json → Book-14');
        expect(request.list.moreLabel).toBe('Show remaining conflicts');
        expect(request.message).not.toContain('file-14.json → Book-14');
        expect(request.actions.map(action => action.id)).toEqual(['overwrite', 'confirm', 'skip', 'cancel']);
        expect(request.scope).toBe('world-info');
    });

    test.each([10, 11])('batch conflict list keeps every mapping and cancellation focus at %i items', async count => {
        const source = read('public/scripts/world-info-import-ui.js');
        const body = extractBlock(source, 'async function showWorldInfoBatchConflictPopup', 'async function prepareWorldInfoImportOverwrite');
        const choice = { CONFIRM: 'confirm', OVERWRITE: 'overwrite', SKIP: 'skip', CANCEL: 'cancel' };
        const conflicts = Array.from({ length: count }, (_, index) => ({
            file: { name: index === 0 ? '<unsafe-file>.json' : `file-${index}.json` },
            existingName: index === 0 ? '<unsafe-book>' : `Book-${index}`,
        }));
        const requests = [];
        const helpers = new Function('t', 'showLocalDialog', 'WORLD_INFO_IMPORT_CONFLICT_CHOICE', `${body}; return { showWorldInfoBatchConflictPopup };`)(
            (strings, ...values) => strings.reduce((text, part, index) => text + part + (values[index] ?? ''), ''),
            async request => { requests.push(request); return null; },
            choice,
        );

        await expect(helpers.showWorldInfoBatchConflictPopup(conflicts)).resolves.toBe('cancel');

        const request = requests[0];
        expect(request.message).toContain('Some selected files will overwrite existing World Info.');
        expect(request.message).toContain('Choose how to handle these conflicts before the batch starts.');
        expect(request.list).toEqual({
            items: conflicts.map(conflict => `${conflict.file.name} → ${conflict.existingName}`),
            moreLabel: 'Show remaining conflicts',
        });
        expect(request.list.items).toHaveLength(count);
        expect(request.list.items.at(-1)).toBe(`${conflicts.at(-1).file.name} → ${conflicts.at(-1).existingName}`);
        expect(request.list.items[0]).toBe('<unsafe-file>.json → <unsafe-book>');
        expect(request.actions.map(action => action.id)).toEqual(['overwrite', 'confirm', 'skip', 'cancel']);
        expect(request.initialFocus).toBe('cancel');
        expect(request.scope).toBe('world-info');
    });

    test('file import change flow batches selected files and restores input state', () => {
        const source = read('public/scripts/world-info.js');
        const panel = read('public/scripts/world-info-panel-ui.js');
        const ui = read('public/scripts/world-info-import-ui.js');
        const changeHandler = extractBlock(
            panel,
            '$(\'#world_import_file\').on(\'change\'',
            '// More menu toggle',
        );
        const busyHelper = extractBlock(
            ui,
            'function setWorldImportBusy(isBusy',
            'function formatWorldInfoEntryCount',
        );

        expect(ui).toContain('let worldInfoImportBusy = false;');
        expect(ui).toContain('let worldInfoImportToast = null;');
        expect(ui).toContain('function setWorldImportBusy(isBusy, { showToast = true } = {})');
        expect(ui).toContain('async function importWorldInfoFiles(files)');
        expect(source).toContain('createWorldInfoImportUi({');
        expect(source).toContain('getRequestHeaders, t, translate, showLocalDialog,');
        expect(changeHandler).toContain('const files = Array.from(e.target.files ?? []);');
        expect(changeHandler).toContain('try {');
        expect(changeHandler).toContain('await importWorldInfoFiles(files);');
        expect(changeHandler).toContain('finally {');
        expect(changeHandler).toContain('e.target.value = \'\';');
        expect(changeHandler).not.toContain('e.target.files[0]');
        expect(busyHelper).toContain('$(\'#world_import_file\').prop(\'disabled\', worldInfoImportBusy);');
        expect(busyHelper).toContain('.attr(\'aria-disabled\', String(worldInfoImportBusy));');
        expect(busyHelper).toContain('fa-spinner fa-spin');
        expect(busyHelper).toContain('toastr.clear(worldInfoImportToast');
    });

    test('import menu blocks duplicate file picker opens while import is busy', () => {
        const source = read('public/scripts/world-info-panel-ui.js');
        const clickHandler = extractBlock(
            source,
            '$(\'#world_import_menu_item\').on(\'click\'',
            '$(\'#world_import_file\').on(\'change\'',
        );

        expect(clickHandler).toContain('if (isWorldInfoImportBusy()) {');
        expect(clickHandler).toContain('return;');
        expect(clickHandler.indexOf('if (isWorldInfoImportBusy()) {')).toBeLessThan(clickHandler.indexOf('$(\'#world_import_file\').trigger(\'click\');'));
    });

    test('embedded world import reports a selected character without embedded data', () => {
        const source = read('public/scripts/world-info-reference-ui.js');
        const importEmbeddedSource = extractBlock(
            source,
            'async function importEmbeddedWorldInfo(skipPopup = false)',
            'function onWorldInfoChange()',
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
        expect(panelHtml).toContain('id="world_more_menu"');
        expect(panelHtml).toContain('aria-haspopup="menu"');
        expect(panelHtml).toContain('aria-expanded="false"');
        expect(panelHtml).toContain('id="world_more_menu_dropdown" class="options-content" role="menu"');
        expect(panelHtml).toContain('id="world_import_menu_item"');
        expect(panelHtml).toContain('role="menuitem" tabindex="0" data-i18n="Import World Info" id="world_import_menu_item"');
        expect(worldInfoCss).toContain('#world_more_menu_dropdown .options-menu[aria-disabled="true"]');
        expect(worldInfoCss).toContain('pointer-events: none;');
    });

    test('world import queue runs sequentially and summarizes partial outcomes', () => {
        const source = read('public/scripts/world-info-import-ui.js');
        const command = read('public/scripts/world-info-import-command.js');
        const batchSource = extractBlock(
            source,
            'async function importWorldInfoFiles(files)',
            'async function importWorldInfo(file',
        );

        expect(source).toContain('import { createWorldInfoImportResult, summarizeWorldInfoBatchImport } from \'./world-info-import-results.js\';');
        expect(source).toContain('function showWorldInfoBatchImportSummary(summary)');
        expect(source).toContain('summary.unprocessedCount === 0');
        expect(source).toContain('const WORLD_INFO_IMPORT_BATCH_FILE_LIMIT = 50;');
        expect(source).toContain('const WORLD_INFO_IMPORT_ACCEPTED_EXTENSIONS = [\'.json\', \'.lorebook\', \'.png\'];');
        expect(source).toContain('function prepareWorldInfoImportQueue(files)');
        expect(batchSource).toContain('prepare: prepareWorldInfoImportQueue');
        expect(batchSource).toContain('isBusy: () => worldInfoImportBusy');
        expect(batchSource).toContain('setBusy: busy => setWorldImportBusy(busy, { showToast: false })');
        expect(batchSource).toContain('runWorldInfoBatchImport(files, {');
        expect(command).toContain('const { selectedFiles, queue, unsupportedFiles, overflowFiles, skippedResults } = deps.prepare(files);');
        expect(command).toContain('if (deps.isBusy())');
        expect(command).toContain('deps.setBusy(true);');
        expect(command).toContain('runWorldInfoImportQueue({');
        expect(command).toContain('for (let index = 0; index < queue.length; index++) {');
        expect(command).toContain('await importFile(file, { overwriteMode, signal })');
        expect(command).toContain('createWorldInfoImportResult(\'failed\', file)');
        expect(batchSource).toContain('showSummary: showWorldInfoBatchImportSummary');
        expect(command).toContain('deps.showSummary(summary);');
        expect(command).toContain('deps.setBusy(false);');
        expect(batchSource).not.toContain('Promise.all');
    });

    test('batch imports report a final batch summary after per-file results', () => {
        const source = read('public/scripts/world-info-import-ui.js');
        const importSource = extractBlock(
            source,
            'async function importWorldInfo(file',
            'return { importWorldInfo, importWorldInfoFiles,' ,
        );
        const batchSource = extractBlock(
            source,
            'async function importWorldInfoFiles(files)',
            'async function importWorldInfo(file',
        );

        expect(importSource).toContain('toastr.success(buildWorldInfoImportSuccessMessage(name, metadata));');
        expect(batchSource).toContain('showSummary: showWorldInfoBatchImportSummary');
        expect(read('public/scripts/world-info-import-command.js')).toContain('deps.showSummary(summary);');
    });

    test('world import batch supports drag-drop, conflict choices, and cancel remaining', () => {
        const source = read('public/scripts/world-info.js');
        const panel = read('public/scripts/world-info-panel-ui.js');
        const ui = read('public/scripts/world-info-import-ui.js');
        const command = read('public/scripts/world-info-import-command.js');
        const panelInit = extractBlock(
            panel,
            'if (!worldInfoPanelInitialized && document.querySelector(\'#world_editor_select\')) {',
            '// More menu toggle',
        );
        const batchSource = extractBlock(
            ui,
            'async function importWorldInfoFiles(files)',
            'async function importWorldInfo(file',
        );

        expect(source).toContain('import { DragAndDropHandler } from \'./dragdrop.js\';');
        expect(panelInit).toContain('new DragAndDropHandler(\'#world_popup\'');
        expect(panelInit).toContain('await importWorldInfoFiles(files);');
        expect(ui).toContain('function showWorldInfoBatchConflictPopup(conflicts, signal)');
        expect(ui).toContain("id: 'skip', label: t`Skip all`");
        expect(ui).toContain('WORLD_INFO_IMPORT_CONFLICT_CHOICE');
        expect(ui).toContain('function updateWorldInfoBatchProgress(batchState, index, total, file, { status = \'importing\' } = {})');
        expect(ui).toContain('Checking import target for file ${index} of ${total}');
        expect(command).toContain("overwriteMode === 'confirm' ? 'checking-target' : 'importing'");
        expect(ui).toContain('world-info-batch-cancel');
        expect(ui).toContain('batchState.cancelRequested = true;');
        expect(ui).toContain('role\', \'status\'');
        expect(ui).toContain('aria-live\', \'polite\'');
        expect(ui).toContain('Cancel remaining imports?');
        expect(ui).toContain('Ask for each conflict');
        expect(batchSource).toContain('runWorldInfoBatchImport(files, {');
        expect(command).toContain('runWorldInfoImportQueue({');
        expect(command).toContain('if (state.cancelRequested) {');
        expect(command).toContain('createWorldInfoImportResult(\'skipped\', file)');
        expect(command).toContain('unprocessed: true, reason: \'cancelled-remaining\'');
    });

    test('world import more menu exposes keyboard-operable menu items', () => {
        const source = read('public/scripts/world-info-panel-ui.js');
        const menuSource = extractBlock(
            source,
            '// More menu toggle',
            '$(document).off(\'click.worldMoreMenu\')',
        );

        expect(menuSource).toContain('$(this).attr(\'aria-expanded\', String(isVisible));');
        expect(menuSource).toContain('menu.find(\'[role="menuitem"]:visible\').first().trigger(\'focus\');');
        expect(menuSource).toContain('$(\'#world_more_menu_dropdown .options-menu\').off(\'keydown.worldMoreMenuItem\').on(\'keydown.worldMoreMenuItem\'');
        expect(menuSource).toContain('e.key !== \'Enter\' && e.key !== \' \'');
        expect(menuSource).toContain('$(this).trigger(\'click\');');
    });

    test('world import feedback has zh-cn translations for batch and overwrite copy', () => {
        const locale = JSON.parse(read('public/locales/zh-cn.json'));
        const requiredKeys = [
            'World Info Import',
            'World Info JSON',
            'PNG NAI data',
            'Detected import',
            'Overwrite and Import',
            'World Info batch import complete: ${0} (${1}).',
            'World Info batch import partially complete: ${0} (${1}).',
            'World Info batch import finished with no new World Info imported: ${0} (${1}).',
            'Checking import target for file ${0} of ${1}',
            'Preparing World Info Import',
            'World Info import conflicts',
            'Ask for each conflict',
            '${0} unsupported file(s) skipped. Supported formats: .json, .lorebook, .png.',
            'A ${0} with the same name already exists:',
            '${0} ${1} cancelled. A ${2} with the same name already exists:',
            'This file is large. Importing may take longer than usual.',
            'This PNG contains character card data, but no World Info data. To import the character card, use character import.',
            'This PNG file does not contain importable World Info data.',
            'File contents are damaged or in an unsupported format. Please check that the file is complete.',
            'Unsupported World Info file format. Supported formats: World Info JSON (SillyTavern compatible), PNG NAI data, Novel Lorebook, Agnai Memory Book, Risu Lorebook.',
            'File is too large. Please check the file contents or compress it before retrying.',
            'Import failed. Please check your connection and try again.',
        ];

        for (const key of requiredKeys) {
            expect(locale[key]).toBeTruthy();
            expect(locale[key]).not.toBe(key);
        }
    });

    test('world import derives reusable format and entry-count metadata', () => {
        const source = read('public/scripts/world-info-import-ui.js');
        const command = read('public/scripts/world-info-import-command.js');
        const importSource = read('public/scripts/world-info-import-command.js');

        expect(command).toContain('const WORLD_INFO_IMPORT_LARGE_FILE_THRESHOLD_BYTES = 10 * 1024 * 1024;');
        expect(command).toContain('function detectWorldInfoImportMetadata(jsonData, { sourceFormatLabel = \'World Info JSON\' } = {})');
        expect(command).toContain('function countWorldInfoEntries(data)');
        expect(source).toContain('function formatWorldInfoImportSummary(metadata)');
        expect(source).toContain('const formatLabel = translate(metadata.formatLabel);');
        expect(command).toContain("formatLabel = 'Novel Lorebook'");
        expect(command).toContain("formatLabel = 'Agnai Memory Book'");
        expect(command).toContain("formatLabel = 'Risu Lorebook'");
        expect(command).toContain('formatLabel: sourceFormatLabel');
        expect(importSource).toContain('const isPngImport = file.name.toLowerCase().endsWith(\'.png\');');
        expect(importSource).toContain('if (isPngImport) {');
        expect(importSource).toContain('detectWorldInfoImportMetadata(jsonData, { sourceFormatLabel: isPngImport ? \'PNG NAI data\' : \'World Info JSON\' })');
        expect(importSource).toContain('formData.append(\'convertedData\', JSON.stringify(metadata.convertedData));');
        expect(source).toContain('formatWorldInfoImportSummary(metadata)');
        expect(command).toContain('countWorldInfoEntries(convertedData');
    });

    test('world import returns structured results for batch summaries', () => {
        const source = read('public/scripts/world-info.js');
        const importSource = read('public/scripts/world-info-import-command.js');

        expect(importSource).toContain('return createWorldInfoImportResult(\'skipped\', file);');
        expect(importSource).toContain('return createWorldInfoImportResult(\'failed\', file);');
        expect(importSource).toContain('return createWorldInfoImportResult(\'cancelled\', file, sanitizedWorldName);');
        expect(importSource).toContain('return createWorldInfoImportResult(\'success\', file, data.name);');
        expect(importSource).toContain('overwriteMode = \'confirm\'');
        expect(importSource).toContain('prepareWorldInfoImportOverwrite(sanitizedWorldName, metadata, overwriteMode, signal)');
    });

    test('world import overwrite confirmation includes context and safe action labels', () => {
        const worldInfoSource = read('public/scripts/world-info-import-ui.js');
        const utilsSource = read('public/scripts/utils.js');
        const importSource = read('public/scripts/world-info-import-command.js');
        const prepareOverwriteSource = extractBlock(
            worldInfoSource,
            'async function prepareWorldInfoImportOverwrite',
            'async function importWorldInfoFiles',
        );
        const overwriteHelper = extractBlock(
            utilsSource,
            'export async function checkOverwriteExistingData',
            'export function getFreeName',
        );

        expect(overwriteHelper).toContain('contextHtml = null');
        expect(overwriteHelper).toContain('confirmOptions = {}');
        expect(overwriteHelper).toContain('const translatedActionTitle = translate(actionTitle);');
        expect(overwriteHelper).toContain('const title = translatedActionTitle === actionTitle ? `${typeLabel} ${actionLabel}` : translatedActionTitle;');
        expect(overwriteHelper).toContain('${contextHtml ?? \'\'}');
        expect(overwriteHelper).toContain('Popup.show.confirm');
        expect(overwriteHelper).toContain('confirmOptions');
        expect(importSource).toContain('prepareWorldInfoImportOverwrite(sanitizedWorldName, metadata, overwriteMode, signal)');
        expect(prepareOverwriteSource).toContain('contextHtml: buildWorldInfoImportContextHtml(metadata)');
        expect(prepareOverwriteSource).toContain('label: buildWorldInfoOverwriteButtonLabel(metadata)');
        expect(prepareOverwriteSource).toContain("id: 'cancel', label: t`Cancel`");
        expect(prepareOverwriteSource).toContain("initialFocus: 'cancel'");
        expect(prepareOverwriteSource).toContain('formatWorldInfoImportSummary(metadata)');
        expect(prepareOverwriteSource).toContain('buildWorldInfoOverwriteButtonLabel(metadata)');
        expect(worldInfoSource).toContain('formatWorldInfoEntryCount(metadata?.entryCount)');
    });

    test('world import classifies parsing, PNG, large-file, and network outcomes', () => {
        const source = read('public/scripts/world-info.js');
        const utilsSource = read('public/scripts/utils.js');
        const importSource = read('public/scripts/world-info-import-command.js');
        const parseJsonSource = extractBlock(
            utilsSource,
            'export async function parseJsonFile(file)',
            'export function copyText',
        );

        expect(importSource).toContain('file.size > WORLD_INFO_IMPORT_LARGE_FILE_THRESHOLD_BYTES');
        expect(importSource).toContain('toastr.info(t`This file is large. Importing may take longer than usual.`)');
        expect(importSource).toContain('extractDataFromPng(buffer, \'naidata\')');
        expect(importSource).toContain('extractDataFromPng(buffer, \'chara\')');
        expect(importSource).toContain('This PNG contains character card data, but no World Info data. To import the character card, use character import.');
        expect(importSource).toContain('This PNG file does not contain importable World Info data.');
        expect(importSource).toContain('File contents are damaged or in an unsupported format. Please check that the file is complete.');
        expect(importSource).toContain('Unsupported World Info file format. Supported formats: World Info JSON (SillyTavern compatible), PNG NAI data, Novel Lorebook, Agnai Memory Book, Risu Lorebook.');
        expect(importSource).toContain('result.status === 413');
        expect(importSource).toContain('File is too large. Please check the file contents or compress it before retrying.');
        expect(importSource).toContain('Import failed. Please check your connection and try again.');
        expect(importSource).toContain('console.error');
        expect(parseJsonSource).toContain('try {');
        expect(parseJsonSource).toContain('resolve(JSON.parse(String(event.target.result)))');
        expect(parseJsonSource).toContain('} catch (error) {');
        expect(parseJsonSource).toContain('reject(error);');
    });

    test('world import success toast reports imported context and automatic editor switch', () => {
        const source = read('public/scripts/world-info-import-ui.js');
        const importSource = extractBlock(
            source,
            'async function importWorldInfo(file',
            'return { importWorldInfo, importWorldInfoFiles,',
        );

        expect(importSource).toContain('buildWorldInfoImportSuccessMessage(name, metadata)');
        expect(source).toContain('Switched to the imported World Info.');
        expect(source).toContain('formatWorldInfoImportSummary(metadata)');
        expect(importSource).not.toContain('World Info "${data.name}" imported successfully!');
    });
});
