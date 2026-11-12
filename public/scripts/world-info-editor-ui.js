import { world_names } from './world-info-state.js';

/** Interactive editor commands; the workbench session remains the sole editor owner. */
export function createWorldInfoEditorUi({ getWorldInfoWorkbenchSession, worldInfoRepository, loadWorldInfo, createWorldInfoEntry, Popup, POPUP_TYPE, POPUP_RESULT, t, moveWorldInfoEntry }) {
    async function createWorldInfoEntryFromEditor() {
        const session = getWorldInfoWorkbenchSession();
        const worldName = session.getSelectedWorldName();
        if (!worldName) {
            return null;
        }
        const isCurrent = session.captureSelectionGuard();

        const entry = await worldInfoRepository.mutate(worldName, async save => {
            const data = await loadWorldInfo(worldName);
            if (!data?.entries) return null;
            const created = createWorldInfoEntry(worldName, data);
            if (!created) return null;
            await save(data);
            return created;
        });
        if (!entry) return null;
        if (isCurrent()) {
            await session.selectEntry(entry.uid);
        }
        return entry;
    }

    /** Backfill empty entry memos with primary keywords. */
    async function backfillWorldInfoMemosFromWorkbench() {
        const session = getWorldInfoWorkbenchSession();
        const counter = await session.backfillMemos();
        if (counter > 0) {
            toastr.info(t`Backfilled ${counter} titles`);
        }
        return counter;
    }

    /**
     * Prompt for a start number then rewrite entry `order` values to follow the
     * currently displayed sorting (workbench command).
     * @returns {Promise<number|false>} count of updated entries, or false when cancelled
     */
    async function promptApplyWorldInfoCurrentSorting() {
        const session = getWorldInfoWorkbenchSession();
        const name = session.getSelectedWorldName();
        if (!name) {
            return false;
        }

        const isCurrent = session.captureSelectionGuard();
        const data = await loadWorldInfo(name);
        if (!isCurrent()) {
            return false;
        }
        const entryCount = Object.keys(data?.entries ?? {}).length;
        const moreThan100 = entryCount > 100;

        let content = '<span>' + t`Apply your current sorting to the "Order" field. The Order values will go down from the chosen number.` + '</span>';
        if (moreThan100) {
            content += '<div class="m-t-1"><i class="fa-solid fa-triangle-exclamation" style="color: var(--clay-warning);"></i> ' + t`More than 100 entries in this world. If you don't choose a number higher than that, the lower entries will default to 0.<br />(Usual default: 100)<br />Minimum: ${entryCount}` + '</div>';
        }

        const result = await Popup.show.input(t`Apply Current Sorting`, content, '100', { okButton: t`Apply`, cancelButton: 'Cancel' });
        if (!result || !isCurrent()) {
            return false;
        }

        const start = Number(result);
        if (isNaN(start) || start < 0) {
            toastr.error(t`Invalid number: ${result}`, t`Apply Current Sorting`);
            return false;
        }
        if (start < entryCount) {
            toastr.warning(t`A number lower than the entry count has been chosen. All entries below that will default to 0.`, t`Apply Current Sorting`);
        }

        const updated = await session.applySortingAsOrder(start);
        if (updated > 0) {
            toastr.info(t`Updated ${updated} Order values`, 'Apply Custom Sorting');
        } else {
            toastr.info('All values up to date', 'Apply Custom Sorting');
        }
        return updated;
    }

    /**
     * Confirm then delete multiple entries in the selected world (workbench command).
     * @param {Array<string|number>} uids
     * @returns {Promise<number|false>} count of deleted entries, or false when cancelled
     */
    async function bulkDeleteWorldInfoEntries(uids) {
        const session = getWorldInfoWorkbenchSession();
        if (!session.getSelectedWorldName() || !Array.isArray(uids) || uids.length === 0) {
            return false;
        }

        const isCurrent = session.captureSelectionGuard();
        const confirmation = await Popup.show.confirm(
            t`Delete ${uids.length} world info entries?`,
            t`This action is irreversible!`,
        );
        if (!confirmation || !isCurrent()) {
            return false;
        }

        const deleted = await session.deleteEntries(uids);
        if (deleted > 0) {
            toastr.info(t`Deleted ${deleted} entries`);
        }
        return deleted;
    }

    /**
     * Enable or disable multiple entries in the selected world (workbench command).
     * @param {Array<string|number>} uids
     * @param {boolean} enabled
     * @returns {Promise<number>} count of updated entries
     */
    async function bulkSetWorldInfoEntriesEnabled(uids, enabled) {
        const session = getWorldInfoWorkbenchSession();
        const updated = await session.setEntriesEnabled(uids, enabled);
        if (updated > 0) {
            toastr.info(enabled ? t`Enabled ${updated} entries` : t`Disabled ${updated} entries`);
        }
        return updated;
    }

    /**
     * Move or copy an entry to another lorebook via confirm popup (workbench command
     * and legacy card button share this path).
     * @param {string|number} uid
     * @param {string} [sourceWorld] defaults to the workbench-selected world
     * @returns {Promise<boolean>}
     */
    async function promptMoveOrCopyWorldInfoEntry(uid, sourceWorld = '') {
        const session = getWorldInfoWorkbenchSession();
        const resolvedSource = sourceWorld || session.getSelectedWorldName();
        if (!resolvedSource) {
            return false;
        }

        const sourceWorldInfo = await loadWorldInfo(resolvedSource);
        if (!sourceWorldInfo) {
            return false;
        }
        const sourceUid = String(uid ?? '');
        const sourceName = sourceWorldInfo.entries?.[sourceUid]?.comment;
        if (sourceName === undefined) {
            return false;
        }

        const select = document.createElement('select');
        select.id = 'move_entry_target_select';
        select.setAttribute('aria-label', t`Target Lorebook`);
        select.classList.add('text_pole', 'wide100p', 'marginTop10');
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = `-- ${t`Select Target Lorebook`} --`;
        select.appendChild(defaultOption);
        let selectableWorldCount = 0;
        world_names.forEach(worldName => {
            if (worldName !== resolvedSource) {
                const option = document.createElement('option');
                option.value = worldName;
                option.textContent = worldName;
                select.appendChild(option);
                selectableWorldCount++;
            }
        });
        if (selectableWorldCount === 0) {
            toastr.warning(t`There are no other lorebooks to move to.`);
            return false;
        }

        const wrapper = document.createElement('div');
        wrapper.textContent = t`Move/Copy '${sourceName}' to:`;
        const container = document.createElement('div');
        container.appendChild(wrapper);
        container.appendChild(select);
        let selectedTargetName = '';
        const popup = new Popup(container, POPUP_TYPE.CONFIRM, '', {
            cancelButton: t`Cancel`,
            defaultResult: POPUP_RESULT.NEGATIVE,
            customButtons: [{ text: t`Move`, result: POPUP_RESULT.CUSTOM1 }, { text: t`Copy`, result: POPUP_RESULT.CUSTOM2 }],
            onClosing: (instance) => instance.result <= POPUP_RESULT.NEGATIVE || selectedTargetName !== '',
        });
        const actions = popup.dlg.querySelectorAll('.popup-button-custom');
        actions.forEach(action => { action.disabled = true; });
        select.addEventListener('change', function () {
            selectedTargetName = String(this.value ?? '');
            actions.forEach(action => { action.disabled = selectedTargetName === ''; });
        });
        popup.okButton.style.display = 'none';
        const popupConfirm = await popup.show();
        if (!popupConfirm || selectedTargetName === '') {
            return false;
        }
        return await moveWorldInfoEntry(resolvedSource, selectedTargetName, sourceUid, { deleteOriginal: popupConfirm === POPUP_RESULT.CUSTOM1 });
    }
    return { createWorldInfoEntryFromEditor, backfillWorldInfoMemosFromWorkbench, promptApplyWorldInfoCurrentSorting, bulkDeleteWorldInfoEntries, bulkSetWorldInfoEntriesEnabled, promptMoveOrCopyWorldInfoEntry };
}
