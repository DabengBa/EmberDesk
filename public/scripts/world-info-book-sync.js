import { world_names, selected_world_info, worldInfoCache, setWorldNames, setSelectedWorldInfo } from './world-info-state.js';

/** Synchronize book lists and deleted references with the existing shell. */
export function createWorldInfoBookSync({ getRequestHeaders, getSelectedWorldInfoEditorName, getWorldInfoWorkbenchSession, hideWorldEditor, setWorldInfoButtonClass, getCurrentShellMenuType, saveCharacterDebounced, saveSettingsDebounced }) {
    async function updateWorldInfoList() {
        const result = await fetch('/api/settings/get', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({}),
        });

        if (!result.ok) return false;
        const data = await result.json();
        const editorSelected = getSelectedWorldInfoEditorName();
        setWorldNames(Array.isArray(data.world_names) ? data.world_names : []);
        setSelectedWorldInfo(selected_world_info.filter(name => world_names.includes(name)));
        const session = getWorldInfoWorkbenchSession();
        session.setWorldNames(world_names);
        session.setSelectedWorldInfo(selected_world_info);
        if (editorSelected && !world_names.includes(editorSelected)) {
            await hideWorldEditor();
        }
        return true;
    }

    /**
     * Flushes deleted world names from all client-side UI state.
     * Call after worlds are confirmed deleted on the server.
     * @param {string[]} worldNames
     */
    async function flushDeletedWorldsFromUI(worldNames) {
        const names = new Set(worldNames);

        for (const name of names) {
            worldInfoCache.delete(name);
        }

        let needsSave = false;
        const before = selected_world_info.length;
        setSelectedWorldInfo(selected_world_info.filter((e) => !names.has(e)));
        if (selected_world_info.length !== before) {
            needsSave = true;
        }

        const wasEditingDeletedWorld = names.has(
            getSelectedWorldInfoEditorName(),
        );

        // These deletions are already confirmed. Publish them and clean up
        // references even if the subsequent server-list refresh is unavailable.
        setWorldNames(world_names.filter(name => !names.has(name)));
        const session = getWorldInfoWorkbenchSession();
        session.setWorldNames(world_names);
        session.setSelectedWorldInfo(selected_world_info);
        if (wasEditingDeletedWorld) {
            await hideWorldEditor();
        }

        const charWorld = $('#character_world').val();
        if (names.has(charWorld)) {
            $('#character_world').val('').trigger('change');
            setWorldInfoButtonClass(undefined, false);
            if (getCurrentShellMenuType() !== 'create') {
                saveCharacterDebounced();
            }
        }

        if (needsSave) {
            saveSettingsDebounced();
        }
        try {
            await updateWorldInfoList();
        } catch (error) {
            // The delete already succeeded and local cleanup is complete.
            // Do not report a failed delete because an optional refresh failed.
            console.warn('Failed to refresh World Info list after confirmed deletion:', error);
        }
    }
    return { updateWorldInfoList, flushDeletedWorldsFromUI };
}
