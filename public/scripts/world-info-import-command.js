import { createWorldInfoImportResult } from './world-info-import-results.js';
import { convertAgnaiMemoryBook, convertNovelLorebook, convertRisuLorebook } from './world-info-converters.js';

const WORLD_INFO_IMPORT_LARGE_FILE_THRESHOLD_BYTES = 10 * 1024 * 1024;

/** Import one file; shell-specific dialogs, notifications and navigation are injected. */
export async function runWorldInfoFileImport(file, { overwriteMode = 'confirm', signal } = {}, deps) {
    const { parseJsonFile, getFileBuffer, extractDataFromPng, getWorldInfoImportBaseName,
        getSanitizedFilename, prepareWorldInfoImportOverwrite, getRequestHeaders, fetch, t, toastr } = deps;
    if (!file) return createWorldInfoImportResult('skipped', file);
    const isPngImport = file.name.toLowerCase().endsWith('.png');
    if (file.size > WORLD_INFO_IMPORT_LARGE_FILE_THRESHOLD_BYTES) toastr.info(t`This file is large. Importing may take longer than usual.`);
    const formData = new deps.FormData();
    formData.append('avatar', file);
    let metadata;
    try {
        let jsonData;
        if (isPngImport) {
            const buffer = new Uint8Array(await getFileBuffer(file));
            jsonData = extractDataFromPng(buffer, 'naidata');
            if (jsonData === undefined || jsonData === null) {
                const characterData = extractDataFromPng(buffer, 'chara');
                if (characterData !== undefined && characterData !== null) {
                    toastr.error(t`This PNG contains character card data, but no World Info data. To import the character card, use character import.`);
                } else {
                    toastr.error(t`This PNG file does not contain importable World Info data.`);
                }
                return createWorldInfoImportResult('failed', file);
            }
        } else {
            jsonData = await parseJsonFile(file);
        }
        if (jsonData === undefined || jsonData === null) {
            toastr.error(t`File contents are damaged or in an unsupported format. Please check that the file is complete.`);
            return createWorldInfoImportResult('failed', file);
        }
        metadata = detectWorldInfoImportMetadata(jsonData, { sourceFormatLabel: isPngImport ? 'PNG NAI data' : 'World Info JSON' });
        if (metadata.unsupported) {
            toastr.error(t`Unsupported World Info file format. Supported formats: World Info JSON (SillyTavern compatible), PNG NAI data, Novel Lorebook, Agnai Memory Book, Risu Lorebook.`);
            return createWorldInfoImportResult('failed', file);
        }
        if (metadata.convertedData) formData.append('convertedData', JSON.stringify(metadata.convertedData));
    } catch (error) {
        console.error('Error parsing world info import file:', error);
        toastr.error(t`File contents are damaged or in an unsupported format. Please check that the file is complete.`);
        return createWorldInfoImportResult('failed', file);
    }
    const worldName = getWorldInfoImportBaseName(file);
    const sanitizedWorldName = await getSanitizedFilename(worldName);
    if (signal?.aborted) return createWorldInfoImportResult('cancelled', file, sanitizedWorldName);
    let allowed;
    try { allowed = await prepareWorldInfoImportOverwrite(sanitizedWorldName, metadata, overwriteMode, signal); } catch (error) {
        console.error('Error preparing World Info overwrite:', error);
        toastr.error(t`Import failed. Please check your connection and try again.`);
        return createWorldInfoImportResult('failed', file, sanitizedWorldName);
    }
    if (!allowed) return createWorldInfoImportResult('cancelled', file, sanitizedWorldName);
    // Once deletion has succeeded, finish the matching import to avoid losing the original.
    if (signal?.aborted && allowed !== 'deleted') return createWorldInfoImportResult('cancelled', file, sanitizedWorldName);
    try {
        const result = await fetch('/api/worldinfo/import', {
            method: 'POST', headers: getRequestHeaders({ omitContentType: true }), body: formData, cache: 'no-cache',
        });
        if (!result.ok) {
            if (result.status === 413) {
                console.error('Error importing world info: file too large', result.status, result.statusText);
                toastr.error(t`File is too large. Please check the file contents or compress it before retrying.`);
                return createWorldInfoImportResult('failed', file);
            }
            throw new Error(`Failed to import world info: ${result.statusText}`);
        }
        const data = await result.json();
        if (data.name) {
            await deps.onImported(data.name, metadata);
            return createWorldInfoImportResult('success', file, data.name);
        }
        return createWorldInfoImportResult('failed', file);
    } catch (error) {
        console.error('Error importing world info:', error);
        toastr.error(t`Import failed. Please check your connection and try again.`);
        return createWorldInfoImportResult('failed', file);
    }
}

export function countWorldInfoEntries(data) {
    const entries = data?.entries;
    if (Array.isArray(entries)) return entries.length;
    if (entries && typeof entries === 'object') return Object.keys(entries).length;
    return null;
}

export function detectWorldInfoImportMetadata(jsonData, { sourceFormatLabel = 'World Info JSON' } = {}) {
    let formatLabel;
    let convertedData;
    if (jsonData?.lorebookVersion !== undefined) {
        console.log('Converting Novel Lorebook');
        formatLabel = 'Novel Lorebook';
        convertedData = convertNovelLorebook(jsonData);
    } else if (jsonData?.kind === 'memory') {
        console.log('Converting Agnai Memory Book');
        formatLabel = 'Agnai Memory Book';
        convertedData = convertAgnaiMemoryBook(jsonData);
    } else if (jsonData?.type === 'risu') {
        console.log('Converting Risu Lorebook');
        formatLabel = 'Risu Lorebook';
        convertedData = convertRisuLorebook(jsonData);
    } else if (jsonData && typeof jsonData === 'object' && 'entries' in jsonData) {
        return { formatLabel: sourceFormatLabel, convertedData: null, entryCount: countWorldInfoEntries(jsonData), unsupported: false };
    } else {
        return { formatLabel: '', convertedData: null, entryCount: null, unsupported: true };
    }
    return { formatLabel, convertedData, entryCount: countWorldInfoEntries(convertedData), unsupported: false };
}

/** Coordinate preparation, conflict handling and result reporting for a batch. */
export async function runWorldInfoBatchImport(files, deps) {
    const { selectedFiles, queue, unsupportedFiles, overflowFiles, skippedResults } = deps.prepare(files);
    if (selectedFiles.length === 0) return [createWorldInfoImportResult('skipped', null)];
    if (deps.isBusy()) return selectedFiles.map(file => createWorldInfoImportResult('skipped', file, null, { reason: 'busy' }));
    if (unsupportedFiles.length > 0) deps.warnUnsupported(unsupportedFiles.length);
    if (overflowFiles.length > 0) deps.warnOverflow(overflowFiles.length);
    if (queue.length === 0) {
        deps.showSummary(deps.summarize(skippedResults));
        return skippedResults;
    }
    const results = [...skippedResults];
    const state = { cancelRequested: false, cancelPromptOpen: false };
    let completed = false;
    deps.setBusy(true);
    try {
        let conflicts = [];
        try {
            conflicts = await deps.findConflicts(queue);
        } catch (error) {
            console.error('World Info batch conflict pre-scan failed:', error);
            deps.warnPrescan();
        }
        const conflictChoice = deps.signal?.aborted ? 'cancel' : await deps.chooseConflicts(conflicts);
        results.push(...await runWorldInfoImportQueue({
            queue, state, conflictChoice, conflicts, signal: deps.signal,
            waitForCancelPrompt: deps.waitForCancelPrompt, progress: deps.progress, importFile: deps.importFile,
        }));
        const summary = deps.summarize(results);
        completed = true;
        deps.setBusy(false);
        if (results.some(result => result.status === 'success')) deps.notifySuccess();
        deps.showSummary(summary);
        return results;
    } finally {
        if (!completed) deps.setBusy(false);
    }
}

/** Execute the already prepared batch; presentation and dialogs stay in the shell. */
export async function runWorldInfoImportQueue({ queue, state, conflictChoice, conflicts, signal, waitForCancelPrompt, progress, importFile }) {
    const conflictFiles = new Set(conflicts.map(conflict => conflict.file));
    const results = [];
    state.cancelRequested = conflictChoice === 'cancel';
    for (let index = 0; index < queue.length; index++) {
        const file = queue[index];
        await waitForCancelPrompt(state);
        if (signal?.aborted) state.cancelRequested = true;
        if (state.cancelRequested) {
            results.push(createWorldInfoImportResult('skipped', file, null, { unprocessed: true, reason: 'cancelled-remaining' }));
            continue;
        }
        if (conflictChoice === 'skip' && conflictFiles.has(file)) {
            results.push(createWorldInfoImportResult('skipped', file));
            continue;
        }
        const overwriteMode = conflictFiles.has(file) ? conflictChoice : 'confirm';
        progress(state, index, queue.length, file, { status: overwriteMode === 'confirm' ? 'checking-target' : 'importing' });
        try {
            results.push(await importFile(file, { overwriteMode, signal }) ?? createWorldInfoImportResult('skipped', file));
        } catch (error) {
            console.error('Error importing world info batch file:', error);
            results.push(createWorldInfoImportResult('failed', file));
        }
    }
    return results;
}
