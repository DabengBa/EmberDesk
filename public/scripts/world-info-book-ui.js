import { world_info, world_names } from './world-info-state.js';

/** Interactive book management and reference cascade feedback. */
export function createWorldInfoBookUi({ getFreeWorldName, showLocalDialog, t, createNewWorldInfo, getSelectedWorldInfoEditorName, loadWorldInfo, download, renameWorldInfo, saveWorldInfo, updateWorldInfoList, selectWorldInfoEditorName, hideWorldEditor, getRequestHeaders, flushDeletedWorldsFromUI, saveSettingsDebounced, deleteWorldInfo }) {
    async function promptToCreateWorldInfo() {
        const tempName = getFreeWorldName();
        const result = await showLocalDialog({ scope: 'world-info', title: t`Create a new World Info`, fields: [{ name: 'name', type: 'text', label: t`Enter a name for the new file:`, value: tempName }], actions: [{ id: 'create', label: t`Create`, variant: 'primary' }, { id: 'cancel', label: t`Cancel` }], initialFocus: 'name' });
        const finalName = result?.action === 'create' ? result.values.name : null;

        if (!finalName) {
            return false;
        }

        return await createNewWorldInfo(finalName, { interactive: true });
    }

    async function exportCurrentWorldInfo() {
        const worldName = getSelectedWorldInfoEditorName();
        if (!worldName) {
            return false;
        }

        const data = await loadWorldInfo(worldName);
        if (!data) {
            return false;
        }

        download(JSON.stringify(data), `${worldName}.json`, 'application/json');
        return true;
    }

    async function getCurrentWorldInfoEditorState() {
        const worldName = getSelectedWorldInfoEditorName();
        if (!worldName) {
            return { worldName: '', data: null };
        }

        return {
            worldName,
            data: await loadWorldInfo(worldName),
        };
    }

    async function renameCurrentWorldInfo() {
        const { worldName, data } = await getCurrentWorldInfoEditorState();
        if (!worldName || !data) {
            return false;
        }

        return await renameWorldInfo(worldName, data);
    }

    async function duplicateCurrentWorldInfo() {
        const { worldName, data } = await getCurrentWorldInfoEditorState();
        if (!worldName || !data) {
            return false;
        }

        const tempName = getFreeWorldName(worldName);
        const result = await showLocalDialog({ scope: 'world-info', title: t`Create a new World Info?`, fields: [{ name: 'name', type: 'text', label: t`Enter a name for the new file:`, value: tempName }], actions: [{ id: 'create', label: t`Create`, variant: 'primary' }, { id: 'cancel', label: t`Cancel` }], initialFocus: 'name' });
        const finalName = result?.action === 'create' ? result.values.name : null;

        if (!finalName) {
            return false;
        }

        await saveWorldInfo(finalName, data, true);
        await updateWorldInfoList();

        if (world_names.includes(finalName)) {
            await selectWorldInfoEditorName(finalName);
        } else {
            await hideWorldEditor();
        }

        return true;
    }

    function removeDeletedWorldInfoAuxiliaryReferences(worldName) {
        if (!world_info.charLore) {
            return false;
        }

        let changed = false;
        for (let index = world_info.charLore.length - 1; index >= 0; index -= 1) {
            const charLore = world_info.charLore[index];
            if (!charLore.extraBooks?.includes(worldName)) {
                continue;
            }

            const nextBooks = charLore.extraBooks.filter((entry) => entry !== worldName);
            if (nextBooks.length === 0) {
                world_info.charLore.splice(index, 1);
            } else {
                charLore.extraBooks = nextBooks;
            }
            changed = true;
        }

        return changed;
    }

    async function deleteWorldInfoWithCascade(worldName) {
        let worldInfos = [];
        try {
            const preflight = await fetch('/api/worldinfo/delete-preflight', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({ name: worldName }),
            });
            if (preflight.ok) {
                const data = await preflight.json();
                worldInfos = data.worldInfos ?? [];
            }
        } catch {
            // If preflight fails, fall through to simple confirmation.
        }

        const hasBoundCharacters = worldInfos.some(world => world.boundCharacters.length > 0);

        if (hasBoundCharacters) {
            const result = await showLocalDialog({
                scope: 'world-info', title: t`Delete the World/Lorebook: "${worldName}"?`,
                fields: [...worldInfos.map((world, index) => {
                    const otherCount = world.boundCharacters.length - world.deleteCandidateAvatars.length;
                    const warning = otherCount > 0 ? ` — ${t`${otherCount} other character(s) are still using this world info.`}` : '';
                    return { name: `world-${index}`, type: 'checkbox', label: `${world.name} — ${world.entryCount} ${t`entries`}${warning}`, value: true };
                }), { name: 'clearReferences', type: 'checkbox', label: t`Also clear world info references in bound characters`, value: false }],
                actions: [{ id: 'delete', label: t`Delete`, variant: 'destructive' }, { id: 'all', label: t`Delete ${worldInfos.length} linked world book(s)`, variant: 'destructive' }, { id: 'cancel', label: t`Cancel` }], initialFocus: 'cancel',
            });
            if (!result || result.action === 'cancel') return false;
            const deleteWorlds = worldInfos.filter((world, index) => result.action === 'all' || result.values[`world-${index}`]).map(world => world.name);
            if (deleteWorlds.length === 0) {
                return false;
            }

            if (result.values.clearReferences) {
                const response = await fetch('/api/worldinfo/delete-cascade', {
                    method: 'POST',
                    headers: getRequestHeaders(),
                    body: JSON.stringify({ worlds: deleteWorlds, clear_references: true }),
                });
                if (!response.ok) {
                    toastr.error(t`Failed to delete World Info.`);
                    return false;
                }
                await flushDeletedWorldsFromUI(deleteWorlds);
                return true;
            }
        } else {
            const confirmed = await showLocalDialog({ scope: 'world-info', title: t`Delete the World/Lorebook: "${worldName}"?`, message: t`This action is irreversible!`, actions: [{ id: 'delete', label: t`Delete`, variant: 'destructive' }, { id: 'cancel', label: t`Cancel` }], initialFocus: 'cancel' });
            if (confirmed?.action !== 'delete') {
                return false;
            }
        }

        if (!await deleteWorldInfo(worldName)) {
            toastr.error(t`Failed to delete World Info.`);
            return false;
        }
        if (removeDeletedWorldInfoAuxiliaryReferences(worldName)) {
            saveSettingsDebounced();
        }


        return true;
    }

    async function deleteCurrentWorldInfo() {
        const worldName = getSelectedWorldInfoEditorName();
        if (!worldName) {
            return false;
        }

        return await deleteWorldInfoWithCascade(worldName);
    }
    return { promptToCreateWorldInfo, exportCurrentWorldInfo, renameCurrentWorldInfo, duplicateCurrentWorldInfo, deleteCurrentWorldInfo };
}
