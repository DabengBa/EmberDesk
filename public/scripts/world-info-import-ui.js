import { runWorldInfoFileImport, runWorldInfoBatchImport } from './world-info-import-command.js';
import { createWorldInfoImportResult, summarizeWorldInfoBatchImport } from './world-info-import-results.js';

/** World Info import presentation and command adapters; editor state remains in the session. */
export function createWorldInfoImportUi({ getWorldNames, deleteWorldInfo, updateWorldInfoList, selectWorldInfoEditorName, eventSource, event_types, getSanitizedFilename, equalsIgnoreCaseAndAccents, checkOverwriteExistingData, escapeHtml, parseJsonFile, getFileBuffer, extractDataFromPng, getRequestHeaders, t, translate, showLocalDialog, beginLocalDialogOperation }) {
    let worldInfoImportBusy = false;
    let worldInfoImportToast = null;
    function setWorldImportBusy(isBusy, { showToast = true } = {}) {
        worldInfoImportBusy = Boolean(isBusy);
        const importIcon = $('#world_import_menu_item').find('i').first();

        $('#world_import_file').prop('disabled', worldInfoImportBusy);
        $('#world_import_menu_item')
            .toggleClass('disabled', worldInfoImportBusy)
            .attr('aria-disabled', String(worldInfoImportBusy));

        if (worldInfoImportBusy) {
            importIcon.removeClass('fa-file-import').addClass('fa-spinner fa-spin');

            if (showToast && !worldInfoImportToast) {
                worldInfoImportToast = toastr.info(t`Importing World Info...`, t`Please wait`, { timeOut: 0, extendedTimeOut: 0 });
            }
        } else {
            importIcon.removeClass('fa-spinner fa-spin').addClass('fa-file-import');

            if (worldInfoImportToast) {
                toastr.clear(worldInfoImportToast, { force: true });
                worldInfoImportToast = null;
            }
        }
    }

    function formatWorldInfoEntryCount(entryCount) {
        if (!Number.isFinite(entryCount)) {
            return '';
        }

        return entryCount === 1 ? t`1 entry` : t`${entryCount} entries`;
    }

    function formatWorldInfoImportSummary(metadata) {
        if (!metadata?.formatLabel) {
            return '';
        }

        const formatLabel = translate(metadata.formatLabel);
        const entryCount = formatWorldInfoEntryCount(metadata.entryCount);
        return entryCount ? `${formatLabel}, ${entryCount}` : formatLabel;
    }

    function buildWorldInfoImportContextHtml(metadata) {
        const summary = formatWorldInfoImportSummary(metadata);
        if (!summary) {
            return '';
        }

        return `<p>${t`Detected import`}: ${escapeHtml(summary)}</p>`;
    }

    function buildWorldInfoOverwriteButtonLabel(metadata) {
        const entryCount = formatWorldInfoEntryCount(metadata?.entryCount);
        return entryCount ? `${t`Overwrite and Import`} (${entryCount})` : t`Overwrite and Import`;
    }

    function buildWorldInfoImportSuccessMessage(name, metadata) {
        const summary = formatWorldInfoImportSummary(metadata);
        const summaryText = summary ? ` (${summary})` : '';
        return `${t`World Info "${name}" imported successfully!`}${summaryText} ${t`Switched to the imported World Info.`}`;
    }

    const WORLD_INFO_IMPORT_CONFLICT_CHOICE = Object.freeze({
        CONFIRM: 'confirm',
        OVERWRITE: 'overwrite',
        SKIP: 'skip',
        CANCEL: 'cancel',
    });

    const WORLD_INFO_IMPORT_BATCH_FILE_LIMIT = 50;
    const WORLD_INFO_IMPORT_ACCEPTED_EXTENSIONS = ['.json', '.lorebook', '.png'];

    function getWorldInfoImportBaseName(file) {
        const fileName = file?.name ?? '';
        const extensionIndex = fileName.lastIndexOf('.');
        return extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName;
    }

    function findExistingWorldInfoName(name) {
        return getWorldNames()?.find(existingName => equalsIgnoreCaseAndAccents(existingName, name)) ?? null;
    }

    async function getWorldInfoImportTargetName(file) {
        return getSanitizedFilename(getWorldInfoImportBaseName(file));
    }

    function isWorldInfoImportFileSupported(file) {
        const fileName = file?.name?.toLowerCase?.() ?? '';
        return WORLD_INFO_IMPORT_ACCEPTED_EXTENSIONS.some(extension => fileName.endsWith(extension));
    }

    function prepareWorldInfoImportQueue(files) {
        const selectedFiles = Array.from(files ?? []).filter(Boolean);
        const supportedFiles = selectedFiles.filter(file => isWorldInfoImportFileSupported(file));
        const unsupportedFiles = selectedFiles.filter(file => !isWorldInfoImportFileSupported(file));
        const queue = supportedFiles.slice(0, WORLD_INFO_IMPORT_BATCH_FILE_LIMIT);
        const overflowFiles = supportedFiles.slice(WORLD_INFO_IMPORT_BATCH_FILE_LIMIT);
        const skippedResults = [
            ...unsupportedFiles.map(file => createWorldInfoImportResult('skipped', file, null, { reason: 'unsupported-extension' })),
            ...overflowFiles.map(file => createWorldInfoImportResult('skipped', file, null, { reason: 'batch-limit' })),
        ];

        return { selectedFiles, queue, unsupportedFiles, overflowFiles, skippedResults };
    }

    async function getWorldInfoBatchImportConflicts(files) {
        const conflicts = [];

        for (const file of files) {
            const targetName = await getWorldInfoImportTargetName(file);
            const existingName = findExistingWorldInfoName(targetName);
            if (existingName) {
                conflicts.push({ file, targetName, existingName });
            }
        }

        return conflicts;
    }

    function formatWorldInfoImportBatchSummary(summary) {
        const parts = [];

        if (summary.successCount > 0) {
            parts.push(t`${summary.successCount} imported`);
        }

        if (summary.failedCount > 0) {
            parts.push(t`${summary.failedCount} failed`);
        }

        if (summary.skippedCount > 0) {
            parts.push(t`${summary.skippedCount} skipped`);
        }

        if (summary.unprocessedCount > 0) {
            parts.push(t`${summary.unprocessedCount} unprocessed`);
        }

        return parts.join(', ');
    }

    function showWorldInfoBatchImportSummary(summary) {
        const detail = formatWorldInfoImportBatchSummary(summary);
        const total = t`${summary.totalCount} total`;

        if (summary.successCount > 0 && summary.failedCount === 0 && summary.skippedCount === 0 && summary.unprocessedCount === 0) {
            toastr.success(t`World Info batch import complete: ${detail} (${total}).`);
            return;
        }

        if (summary.successCount > 0) {
            toastr.warning(t`World Info batch import partially complete: ${detail} (${total}).`);
            return;
        }

        toastr.warning(t`World Info batch import finished with no new World Info imported: ${detail} (${total}).`);
    }

    function buildWorldInfoBatchProgressHtml(index, total, file, { status = 'importing' } = {}) {
        const isCheckingTarget = status === 'checking-target';
        const percent = total > 0 ? Math.round(((isCheckingTarget ? index - 1 : index) / total) * 100) : 0;
        const statusText = isCheckingTarget
            ? t`Checking import target for file ${index} of ${total}`
            : t`Importing file ${index} of ${total}`;

        return `
            <div>${statusText}</div>
            <div><strong>${escapeHtml(file?.name ?? t`Unknown file`)}</strong></div>
            <div>${t`Progress`}: ${percent}%</div>
            <button type="button" class="menu_button world-info-batch-cancel" aria-label="${escapeHtml(t`Cancel remaining World Info imports`)}">${t`Cancel remaining`}</button>
        `;
    }

    async function waitForWorldInfoBatchCancelPrompt(batchState) {
        while (batchState.cancelPromptOpen) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    function updateWorldInfoBatchProgress(batchState, index, total, file, { status = 'importing' } = {}) {
        const progressIndex = index + 1;
        const progressHtml = buildWorldInfoBatchProgressHtml(progressIndex, total, file, { status });
        const progressTitle = status === 'checking-target' ? t`Preparing World Info Import` : t`Importing World Info`;

        if (!worldInfoImportToast) {
            worldInfoImportToast = toastr.info(progressHtml, progressTitle, {
                timeOut: 0,
                extendedTimeOut: 0,
                tapToDismiss: false,
                progressBar: true,
                escapeHtml: false,
                html: true,
            });
        } else {
            worldInfoImportToast.find('.toast-title').text(progressTitle);
            worldInfoImportToast.find('.toast-message').html(progressHtml);
        }

        worldInfoImportToast.find('.toast-message')
            .attr('role', 'status')
            .attr('aria-live', 'polite')
            .attr('aria-atomic', 'true');

        const percent = total > 0 ? Math.round((progressIndex / total) * 100) : 0;
        worldInfoImportToast.find('.toast-progress').css('width', `${percent}%`);
        worldInfoImportToast.find('.world-info-batch-cancel').off('click').on('click', async (event) => {
            const button = $(event.currentTarget);
            button.prop('disabled', true);
            batchState.cancelPromptOpen = true;

            try {
                const confirmed = await showLocalDialog({ scope: 'world-info', title: t`Cancel remaining imports?`, message: t`The current file will finish. Files still waiting in the batch will be skipped.`, actions: [{ id: 'stop', label: t`Cancel remaining`, variant: 'destructive' }, { id: 'keep', label: t`Keep importing` }], initialFocus: 'keep' });

                if (confirmed?.action === 'stop') {
                    batchState.cancelRequested = true;
                    button.text(t`Cancelling...`);
                } else {
                    button.prop('disabled', false);
                }
            } finally {
                batchState.cancelPromptOpen = false;
            }
        });
    }


    async function showWorldInfoBatchConflictPopup(conflicts, signal) {
        if (conflicts.length === 0) {
            return WORLD_INFO_IMPORT_CONFLICT_CHOICE.CONFIRM;
        }

        const conflictItems = conflicts.map(conflict => `${conflict.file.name} → ${conflict.existingName}`);
        const result = await showLocalDialog({ scope: 'world-info', signal, title: t`World Info import conflicts`, message: `${t`Some selected files will overwrite existing World Info.`}\n${t`Choose how to handle these conflicts before the batch starts.`}`, list: { items: conflictItems, moreLabel: t`Show remaining conflicts` }, actions: [{ id: 'overwrite', label: t`Overwrite all`, variant: 'destructive' }, { id: 'confirm', label: t`Ask for each conflict` }, { id: 'skip', label: t`Skip all` }, { id: 'cancel', label: t`Cancel batch` }], initialFocus: 'cancel' });
        return Object.values(WORLD_INFO_IMPORT_CONFLICT_CHOICE).includes(result?.action) ? result.action : WORLD_INFO_IMPORT_CONFLICT_CHOICE.CANCEL;
    }

    async function prepareWorldInfoImportOverwrite(sanitizedWorldName, metadata, overwriteMode, signal) {
        const existingName = findExistingWorldInfoName(sanitizedWorldName);

        if (!existingName) {
            return true;
        }

        if (overwriteMode === WORLD_INFO_IMPORT_CONFLICT_CHOICE.SKIP) {
            return false;
        }

        if (overwriteMode === WORLD_INFO_IMPORT_CONFLICT_CHOICE.OVERWRITE) {
            toastr.info(`Overwriting Existing World Info:<br />${escapeHtml(existingName)}`, t`World Info Import`, { escapeHtml: false });
            if (signal?.aborted) return false;
            if (!await deleteWorldInfo(existingName)) throw new Error('Failed to delete existing World Info');
            return 'deleted';
        }

        const confirmed = await checkOverwriteExistingData('World Info', getWorldNames(), sanitizedWorldName, {
            interactive: true,
            actionName: 'Import',

            contextHtml: buildWorldInfoImportContextHtml(metadata),
            confirm: async ({ title, typeLabel, existing }) => (await showLocalDialog({ scope: 'world-info', signal, title, message: `${t`A ${typeLabel} with the same name already exists:`}\n${existing}\n${formatWorldInfoImportSummary(metadata)}\n${t`Do you want to overwrite it?`}`, actions: [{ id: 'overwrite', label: buildWorldInfoOverwriteButtonLabel(metadata), variant: 'destructive' }, { id: 'cancel', label: t`Cancel` }], initialFocus: 'cancel' }))?.action === 'overwrite',
        });
        if (!confirmed || signal?.aborted) return false;
        if (!await deleteWorldInfo(existingName)) throw new Error('Failed to delete existing World Info');
        return 'deleted';
    }

    async function importWorldInfoFiles(files) {
        const operation = beginLocalDialogOperation('world-info');
        try {
            return await runWorldInfoBatchImport(files, {
                signal: operation.signal,
                prepare: prepareWorldInfoImportQueue,
                isBusy: () => worldInfoImportBusy,
                setBusy: busy => setWorldImportBusy(busy, { showToast: false }),
                warnUnsupported: count => toastr.warning(t`${count} unsupported file(s) skipped. Supported formats: .json, .lorebook, .png.`, t`World Info Import`),
                warnOverflow: count => toastr.warning(t`Only the first ${WORLD_INFO_IMPORT_BATCH_FILE_LIMIT} World Info files will be imported. ${count} extra file(s) were skipped.`, t`World Info Import`),
                warnPrescan: () => toastr.warning(t`Conflict pre-scan failed. EmberDesk will ask about overwrites one file at a time.`, t`World Info Import`),
                findConflicts: getWorldInfoBatchImportConflicts,
                chooseConflicts: conflicts => showWorldInfoBatchConflictPopup(conflicts, operation.signal),
                waitForCancelPrompt: waitForWorldInfoBatchCancelPrompt,
                progress: updateWorldInfoBatchProgress,
                importFile: importWorldInfo,
                summarize: summarizeWorldInfoBatchImport,
                showSummary: showWorldInfoBatchImportSummary,
                notifySuccess: () => { void eventSource.emit(event_types.WORLDINFO_SETTINGS_UPDATED); },
            });
        } finally { operation.release(); }
    }

    /**
     * Imports world info from a file.
     * @param {File} file File to import
     */
    async function importWorldInfo(file, options = {}) {
        return runWorldInfoFileImport(file, options, {
            parseJsonFile, getFileBuffer, extractDataFromPng, getWorldInfoImportBaseName,
            getSanitizedFilename, prepareWorldInfoImportOverwrite, getRequestHeaders,
            fetch, FormData, t, toastr,
            onImported: async (name, metadata) => {
                await updateWorldInfoList();
                if (getWorldNames().includes(name)) await selectWorldInfoEditorName(name);
                toastr.success(buildWorldInfoImportSuccessMessage(name, metadata));
            },
        });
    }
    return { importWorldInfo, importWorldInfoFiles, isWorldInfoImportBusy: () => worldInfoImportBusy };
}
