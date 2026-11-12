import { world_info, world_names, selected_world_info } from './world-info-state.js';

/** Book lifecycle and character/chat reference operations. */
export function createWorldInfoBookCommands({ POPUP_TYPE, showLocalDialog, t, equalsIgnoreCaseAndAccents, saveWorldInfo, getWIElement, selectWorldInfoEditorName, saveSettingsDebounced, characters, getRequestHeaders, getOneCharacter, getCurrentShellCharacterId, select_selected_character, setWorldInfoButtonClass, flushDeletedWorldsFromUI, getSanitizedFilename, checkOverwriteExistingData, updateWorldInfoList, hideWorldEditor, chat_metadata, METADATA_KEY, openWorldInfoEditor, renderTemplateAsync, getCurrentChatId, saveMetadata, callGenericPopup, loadWorldInfo, deleteWIOriginalDataValue, getSelectedWorldInfoEditorName, reloadEditor, getCurrentShellMenuType, create_save, createOrEditCharacter, getCharaFilename, normalizeArray }) {
    async function renameWorldInfo(name, data) {
        const oldName = name;
        const result = await showLocalDialog({ scope: 'world-info', title: t`Rename World Info`, fields: [{ type: 'text', name: 'name', label: t`Enter a new name:`, value: oldName }], actions: [{ id: 'rename', label: t`Rename`, variant: 'primary' }, { id: 'cancel', label: t`Cancel` }], initialFocus: 'name' });
        const newName = result?.action === 'rename' ? result.values.name : null;

        if (oldName === newName || !newName) {
            console.debug('World info rename cancelled');
            return false;
        }
        if (equalsIgnoreCaseAndAccents(oldName, newName)) {
            toastr.warning(t`Name not accepted, as it is the same as before (ignoring case and accents).`, t`Rename World Info`);
            return false;
        }

        const entryPreviouslySelected = selected_world_info.findIndex((e) => e === oldName);

        await saveWorldInfo(newName, data, true);
        let deleted = false;
        try {
            deleted = await deleteWorldInfo(oldName);
        } catch (error) {
            console.error('Failed to delete the original World Info after renaming:', error);
        }
        if (!deleted) {
            toastr.error(t`The new World Info was saved, but the original could not be deleted.`);
            return false;
        }

        await updateWorldInfoLinks(oldName, newName);

        if (entryPreviouslySelected !== -1) {
            const wiElement = getWIElement(newName);
            wiElement.prop('selected', true);
            $('#world_info').trigger('change');
        }

        if (world_names.includes(newName)) {
            await selectWorldInfoEditorName(newName);
        }
        return true;
    }

    /**
     * Retargets all character lore links from an old world info name to a new one, with an optional confirmation for primary lorebook links
     * @param {string} oldName Previous WI file name
     * @param {string} newName New WI file name
     * @returns {Promise<void>}
     */
    async function updateWorldInfoLinks(oldName, newName) {
        const existingCharLores = world_info.charLore?.filter((e) => e.extraBooks.includes(oldName));
        if (existingCharLores && existingCharLores.length > 0) {
            existingCharLores.forEach((charLore) => {
                const tempCharLore = charLore.extraBooks.filter((e) => e !== oldName);
                tempCharLore.push(newName);
                charLore.extraBooks = tempCharLore;
            });
            saveSettingsDebounced();
        }

        // find all characters using the old lorebook name as their primary world
        const linkedChIDs = [];
        characters.forEach((character, chid) => {
            if (character.data?.extensions?.world === oldName) {
                linkedChIDs.push(chid);
            }
        });

        if (!linkedChIDs.length) {
            return;
        }

        // Trigger the confirmation popup
        const updatePastLinksConfirm = (await showLocalDialog({ scope: 'world-info', title: t`World/Lorebook renamed!`, message: t`Auxiliary Lorebook links have been updated. Would you like to update primary lorebook links for ${linkedChIDs.length} character(s) as well?`, actions: [{ id: 'update', label: t`Update`, variant: 'primary' }, { id: 'cancel', label: t`Cancel` }] }))?.action === 'update';

        if (updatePastLinksConfirm) {
            let activeCharacterUpdated = false;

            for (const chid of linkedChIDs) {
                const character = characters[chid];

                try {
                    // /merge-attributes API call to update the file on the backend silently
                    const response = await fetch('/api/characters/merge-attributes', {
                        method: 'POST',
                        headers: getRequestHeaders(),
                        body: JSON.stringify({
                            avatar: character.avatar,
                            data: {
                                extensions: {
                                    world: newName,
                                },
                            },
                        }),
                    });

                    if (!response.ok) {
                        throw new Error(`Merge API returned ${response.status}`);
                    }

                    // used to update the data in the browser's memory
                    await getOneCharacter(character.avatar);

                    // Flag if the currently open character was affected
                    if (String(chid) === String(getCurrentShellCharacterId())) {
                        activeCharacterUpdated = true;
                    }

                    toastr.success(`Successfully updated link for ${character.name}.`);
                } catch (e) {
                    toastr.error(`Failed to update link for ${character.name}.`);
                    console.error(`Backend update for character ${character.name} failed:`, e);
                }
            }

            // update the UI fields
            // only required if the currently selected character was changed
            if (activeCharacterUpdated) {
                select_selected_character(getCurrentShellCharacterId(), { switchMenu: false });
                setWorldInfoButtonClass(getCurrentShellCharacterId(), true);
            }
        }
    }

    /**
     * Deletes a world info with the given name
     *
     * @param {string} worldInfoName - The name of the world info to delete
     * @returns {Promise<boolean>} A promise that resolves to true if the world info was successfully deleted, false otherwise
     */
    async function deleteWorldInfo(worldInfoName) {
        if (!world_names.includes(worldInfoName)) {
            return false;
        }

        const response = await fetch('/api/worldinfo/delete', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ name: worldInfoName }),
        });

        if (!response.ok) {
            return false;
        }

        await flushDeletedWorldsFromUI([worldInfoName]);
        return true;
    }

    function getFreeWorldEntryUid(data) {
        if (!data || !('entries' in data)) {
            return null;
        }

        const MAX_UID = 1_000_000; // <- should be safe enough :)
        for (let uid = 0; uid < MAX_UID; uid++) {
            if (uid in data.entries) {
                continue;
            }
            return uid;
        }

        return null;
    }


    /**
     * Generates a free world name based on the given input name.
     * If the input name is null, a default name is used.
     * If the input name already exists, a numbered suffix is added.
     *
     * @param {string|null} worldName - The name to base the new world name on. If null, a default name is used.
     * @param {Object} [options={}] - Optional parameters.
     * @param {boolean} [options.stripIndex=true] - Whether to strip any numbered suffix from the input name before generating the new name.
     * @return {string|undefined} The generated free world name, or undefined if no free name could be found after trying 100,000 times.
     */
    function getFreeWorldName(worldName = null, { stripIndex = true } = {}) {
        worldName ??= t`New World`;
        if (stripIndex) {
            worldName = worldName.replace(/\s*\(\d+\)$/, '');
        }
        const MAX_FREE_NAME = 100_000;
        for (let index = 1; index < MAX_FREE_NAME; index++) {
            const newName = `${worldName} (${index})`;
            if (world_names.includes(newName)) {
                continue;
            }
            return newName;
        }

        return undefined;
    }

    /**
     * Creates a new world info/lorebook with the given name.
     * Checks if a world with the same name already exists, providing a warning or optionally a user confirmation dialog.
     *
     * @param {string} worldName - The name of the new world info
     * @param {Object} options - Optional parameters
     * @param {boolean} [options.interactive=false] - Whether to show a confirmation dialog when overwriting an existing world
     * @returns {Promise<boolean>} - True if the world info was successfully created, false otherwise
     */
    async function createNewWorldInfo(worldName, { interactive = false } = {}) {
        const worldInfoTemplate = { entries: {} };

        if (!worldName) {
            return false;
        }

        const sanitizedWorldName = await getSanitizedFilename(worldName);
        const existingName = world_names.find(name => equalsIgnoreCaseAndAccents(name, sanitizedWorldName));

        const allowed = await checkOverwriteExistingData('World Info', world_names, sanitizedWorldName, { interactive: interactive, actionName: 'Create', confirm: async ({ title, typeLabel, existing }) => (await showLocalDialog({ scope: 'world-info', title, message: `${t`A ${typeLabel} with the same name already exists:`}\n${existing}\n${t`Do you want to overwrite it?`}`, actions: [{ id: 'overwrite', label: t`Overwrite`, variant: 'destructive' }, { id: 'cancel', label: t`Cancel` }], initialFocus: 'cancel' }))?.action === 'overwrite' });
        if (!allowed) {
            return false;
        }

        if (existingName) {
            try {
                if (!await deleteWorldInfo(existingName)) {
                    throw new Error(`Failed to delete existing World Info '${existingName}' before overwrite.`);
                }
            } catch (error) {
                toastr.error(t`Failed to delete World Info.`);
                console.error('Failed to delete existing World Info before overwrite:', error);
                return false;
            }
        }

        await saveWorldInfo(worldName, worldInfoTemplate, true);
        await updateWorldInfoList();

        if (world_names.includes(worldName)) {
            await selectWorldInfoEditorName(worldName);
        } else {
            await hideWorldEditor();
        }

        return true;
    }

    async function assignLorebookToChat({ shiftKey, altKey }) {
        const selectedName = chat_metadata[METADATA_KEY];

        if (selectedName && !shiftKey && !altKey) {
            openWorldInfoEditor(selectedName);
            return;
        }

        const template = $(await renderTemplateAsync('chatLorebook'));

        const worldSelect = template.find('select');
        const chatName = template.find('.chat_name');
        chatName.text(getCurrentChatId());

        for (const worldName of world_names) {
            const option = document.createElement('option');
            option.value = worldName;
            option.innerText = worldName;
            option.selected = selectedName === worldName;
            worldSelect.append(option);
        }

        worldSelect.on('change', function () {
            const worldName = $(this).val();

            if (worldName) {
                chat_metadata[METADATA_KEY] = worldName;
                $('.chat_lorebook_button').addClass('world_set');
            } else {
                delete chat_metadata[METADATA_KEY];
                $('.chat_lorebook_button').removeClass('world_set');
            }

            saveMetadata();
        });

        await callGenericPopup(template, POPUP_TYPE.TEXT);
    }

    /**
     * Moves a World Info entry from a source lorebook to a target lorebook.
     *
     * @param {string} sourceName - The name of the source lorebook file.
     * @param {string} targetName - The name of the target lorebook file.
     * @param {string|number} uid - The UID of the entry to move from the source lorebook.
     * @param {Object} options - Additional options for the move operation.
     * @param {boolean} [options.deleteOriginal=true] - Whether to delete the original entry from the source lorebook after moving it.
     * @returns {Promise<boolean>} True if the move was successful, false otherwise.
     */
    async function moveWorldInfoEntry(sourceName, targetName, uid, { deleteOriginal = true } = {}) {
        if (sourceName === targetName) {
            return false;
        }

        if (!world_names.includes(sourceName)) {
            toastr.error(t`Source lorebook '${sourceName}' not found.`);
            console.error(`[WI Move] Source lorebook '${sourceName}' does not exist.`);
            return false;
        }

        if (!world_names.includes(targetName)) {
            toastr.error(t`Target lorebook '${targetName}' not found.`);
            console.error(`[WI Move] Target lorebook '${targetName}' does not exist.`);
            return false;
        }

        const entryUidString = String(uid);

        try {
            const sourceData = await loadWorldInfo(sourceName);
            const targetData = await loadWorldInfo(targetName);

            if (!sourceData || !sourceData.entries) {
                toastr.error(t`Failed to load data for source lorebook '${sourceName}'.`);
                console.error(`[WI Move] Could not load source data for '${sourceName}'.`);
                return false;
            }
            if (!targetData || !targetData.entries) {
                toastr.error(t`Failed to load data for target lorebook '${targetName}'.`);
                console.error(`[WI Move] Could not load target data for '${targetName}'.`);
                return false;
            }

            if (!sourceData.entries[entryUidString]) {
                toastr.error(t`Entry not found in source lorebook '${sourceName}'.`);
                console.error(`[WI Move] Entry UID ${entryUidString} not found in '${sourceName}'.`);
                return false;
            }

            const entryToMove = structuredClone(sourceData.entries[entryUidString]);

            const newUid = getFreeWorldEntryUid(targetData);
            if (newUid === null) {
                console.error(`[WI Move] Failed to get a free UID in '${targetName}'.`);
                return false;
            }

            entryToMove.uid = newUid;
            // Place the entry at the end of the target lorebook
            const maxDisplayIndex = Object.values(targetData.entries).reduce((max, entry) => Math.max(max, entry.displayIndex ?? -1), -1);
            entryToMove.displayIndex = maxDisplayIndex + 1;

            targetData.entries[newUid] = entryToMove;

            if (deleteOriginal) {
                delete sourceData.entries[entryUidString];
                // Remove from originalData if it exists
                deleteWIOriginalDataValue(sourceData, entryUidString);
                // TODO: setWIOriginalDataValue
                console.debug(`[WI Move] Removed entry UID ${entryUidString} from source '${sourceName}'.`);
            }

            await saveWorldInfo(targetName, targetData, true);
            console.debug(`[WI Move] Saved target lorebook '${targetName}'.`);
            await saveWorldInfo(sourceName, sourceData, true);
            console.debug(`[WI Move] Saved source lorebook '${sourceName}'.`);

            console.log(`[WI Move] ${entryToMove.comment} ${deleteOriginal ? 'moved' : 'copied'} successfully to '${targetName}'.`);

            // Check if the currently viewed book in the editor is the source or target and reload it
            const currentEditorBookName = getSelectedWorldInfoEditorName();
            if (currentEditorBookName === sourceName || currentEditorBookName === targetName) {
                await reloadEditor(currentEditorBookName);
            }

            toastr.success(deleteOriginal
                ? t`Entry moved successfully from '${sourceName}' to '${targetName}'.`
                : t`Entry copied successfully to '${targetName}'.`);

            return true;
        } catch (error) {
            toastr.error(t`An unexpected error occurred while moving the entry: ${error.message}`);
            console.error('[WI Move] Unexpected error:', error);
            return false;
        }
    }


    /**
     * Updates the primary world info linked to a character.
     * Can also unset it to null.
     * @param {string} name - The name of the world info to link to the character.
     */
    async function charUpdatePrimaryWorld(name) {
        const previousValue = $('#character_world').val();
        $('#character_world').val(name);

        console.debug('Character world selected:', name);

        if (getCurrentShellMenuType() == 'create') {
            create_save.world = name;
            return;
        }

        if (previousValue && !name) {
            try {
                // Dirty hack to remove embedded lorebook from character JSON data.
                const data = JSON.parse(String($('#character_json_data').val()));

                if (data?.data?.character_book) {
                    data.data.character_book = undefined;
                }

                $('#character_json_data').val(JSON.stringify(data));
                toastr.info(t`Embedded lorebook will be removed from this character.`);
            } catch {
                console.error('Failed to parse character JSON data.');
            }
        }

        await createOrEditCharacter();

        setWorldInfoButtonClass(undefined, !!name);
    }

    /**
     * Adds one or more auxiliary world books to a character.
     * @param {string} characterKey - The key of the character to add auxiliary world books to
     * @param {string|string[]} nameOrNames - The name or names of the auxiliary world books to add
     */
    async function charUpdateAddAuxWorld(characterKey, nameOrNames) {
        const fileName = getCharaFilename(null, { manualAvatarKey: characterKey });
        const toAdd = Array.isArray(nameOrNames) ? nameOrNames : [nameOrNames];
        updateAuxBooks(fileName, curr => [...curr, ...toAdd]);
    }

    /**
     * Replaces the entire list of auxiliary world books for a character.
     * @param {string} fileName - The filename of the character to update
     * @param {string[]} books - The new list of auxiliary world books to replace the existing list with
     */
    function charSetAuxWorlds(fileName, books) {
        updateAuxBooks(fileName, _ => Array.isArray(books) ? books : []);
    }

    function updateAuxBooks(fileName, computeNext) {
        if (getCurrentShellMenuType() === 'create') {
            const current = create_save.extra_books ?? [];
            create_save.extra_books = normalizeArray(computeNext(current));
            return; // no debounced save in create flow
        }

        if (!fileName) return;

        const charLore = world_info.charLore ?? [];
        const idx = charLore.findIndex(e => e.name === fileName);
        const current = idx !== -1 ? (charLore[idx].extraBooks ?? []) : [];
        const next = normalizeArray(computeNext(current));

        if (next.length === 0) {
            if (idx !== -1) charLore.splice(idx, 1);
        } else if (idx === -1) {
            charLore.push({ name: fileName, extraBooks: next });
        } else {
            charLore[idx] = { ...charLore[idx], extraBooks: next };
        }

        Object.assign(world_info, { charLore });
        saveSettingsDebounced();
    }
    return { renameWorldInfo, deleteWorldInfo, getFreeWorldEntryUid, getFreeWorldName, createNewWorldInfo, assignLorebookToChat, moveWorldInfoEntry, charUpdatePrimaryWorld, charUpdateAddAuxWorld, charSetAuxWorlds };
}
