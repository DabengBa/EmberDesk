import { world_names } from './world-info-state.js';

/** Interactive editor commands; the workbench session remains the sole editor owner. */
export function createWorldInfoEditorUi({ getWorldInfoWorkbenchSession, worldInfoRepository, loadWorldInfo, createWorldInfoEntry, showLocalDialog, t, moveWorldInfoEntry }) {
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

        let content = t`Apply your current sorting to the "Order" field. The Order values will go down from the chosen number.`;
        if (moreThan100) {
            content += '\n' + t`More than 100 entries in this world. If you don't choose a number higher than that, the lower entries will default to 0.` + `\n${t`Usual default: 100`}\n${t`Minimum: ${entryCount}`}`;
        }

        const response = await showLocalDialog({ scope: 'world-info', title: t`Apply Current Sorting`, message: content, fields: [{ type: 'text', name: 'start', label: t`Start number`, value: '100' }], actions: [{ id: 'apply', label: t`Apply`, variant: 'primary' }, { id: 'cancel', label: t`Cancel` }], initialFocus: 'start' });
        const result = response?.action === 'apply' ? response.values.start : null;
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
        const confirmation = await showLocalDialog({ scope: 'world-info', title: t`Delete ${uids.length} world info entries?`, message: t`This action is irreversible!`, actions: [{ id: 'delete', label: t`Delete`, variant: 'destructive' }, { id: 'cancel', label: t`Cancel` }] });
        if (confirmation?.action !== 'delete' || !isCurrent()) {
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

        const targets = world_names.filter(worldName => worldName !== resolvedSource);
        if (targets.length === 0) {
            toastr.warning(t`There are no other lorebooks to move to.`);
            return false;
        }

        const result = await showLocalDialog({ scope: 'world-info', title: t`Move/Copy '${sourceName}' to:`, fields: [{ type: 'select', name: 'target', label: t`Target Lorebook`, value: '', options: [{ value: '', label: `-- ${t`Select Target Lorebook`} --` }, ...targets.map(name => ({ value: name, label: name }))] }], actions: [{ id: 'move', label: t`Move`, variant: 'primary', required: ['target'] }, { id: 'copy', label: t`Copy`, required: ['target'] }, { id: 'cancel', label: t`Cancel` }], initialFocus: 'target' });
        const selectedTargetName = result?.values.target;
        if (!['move', 'copy'].includes(result?.action) || !targets.includes(selectedTargetName)) {
            return false;
        }
        return await moveWorldInfoEntry(resolvedSource, selectedTargetName, sourceUid, { deleteOriginal: result.action === 'move' });
    }
    return { createWorldInfoEntryFromEditor, backfillWorldInfoMemosFromWorkbench, promptApplyWorldInfoCurrentSorting, bulkDeleteWorldInfoEntries, bulkSetWorldInfoEntriesEnabled, promptMoveOrCopyWorldInfoEntry };
}
