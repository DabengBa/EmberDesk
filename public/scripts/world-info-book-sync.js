import { world_names, selected_world_info, worldInfoCache, setWorldNames, setSelectedWorldInfo } from './world-info-state.js';

/** Synchronize book lists and deleted references with the existing shell. */
export function createWorldInfoBookSync({ getRequestHeaders, getSelectedWorldInfoEditorName, getWorldInfoWorkbenchSession, refreshGlobalWorldInfoSelectorLabels, syncWorldInfoEditorSelectorUi, hideWorldEditor, setWorldInfoButtonClass, getCurrentShellMenuType, saveCharacterDebounced, saveSettingsDebounced }) {
    async function updateWorldInfoList() {
        const result = await fetch('/api/settings/get', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({}),
        });

        if (result.ok) {
            const data = await result.json();
            const editorSelected = getSelectedWorldInfoEditorName();
            setWorldNames(data.world_names?.length ? data.world_names : []);
            const session = getWorldInfoWorkbenchSession();
            session.setWorldNames(world_names);
            session.setSelectedWorldInfo(selected_world_info);
            $('#world_info').find('option[value!=""]').remove();
            $('#world_editor_select').find('option[value!=""]').remove();

            world_names.forEach((item) => {
                const globalListOption = new Option(item, item);
                globalListOption.selected = selected_world_info.includes(item);
                const editorListOption = new Option(item, item);
                editorListOption.selected = editorSelected === item;
                $('#world_info').append(globalListOption);
                $('#world_editor_select').append(editorListOption);
            });
            refreshGlobalWorldInfoSelectorLabels();
            // Repaint the select2 widget so the hidden mirror doesn't render a
            // stale book name after the option rebuild.
            syncWorldInfoEditorSelectorUi(session.getSelectedWorldName());
            if (editorSelected && !world_names.includes(editorSelected)) {
                // The selected book vanished without a flush (e.g. external
                // deletion); don't leave its stale entries rendered.
                await hideWorldEditor();
            }
        }
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

        await updateWorldInfoList();

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
    }
    return { updateWorldInfoList, flushDeletedWorldsFromUI };
}
