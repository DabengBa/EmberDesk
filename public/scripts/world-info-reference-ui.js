import { world_names, selected_world_info, setSelectedWorldInfo } from './world-info-state.js';

/** Character embedded-book and global-selection shell UI compatibility. */
export function createWorldInfoReferenceUi({ characters, accountStorage, callGenericPopup, POPUP_TYPE, Popup, t, convertCharacterBook, saveWorldInfo, updateWorldInfoList, getWorldInfoShell, selectWorldInfoEditorName, getWIElement, isTrueBoolean, saveSettingsDebounced, eventSource, event_types }) {
    function setWorldInfoButtonClass(chid, forceValue = undefined) {
        if (forceValue !== undefined) {
            $('#set_character_world, #world_button').toggleClass('world_set', forceValue);
            return;
        }

        if (chid === undefined) {
            return;
        }

        const world = characters[chid]?.data?.extensions?.world;
        const worldSet = Boolean(world && world_names.includes(world));
        $('#set_character_world, #world_button').toggleClass('world_set', worldSet);
    }

    function checkEmbeddedWorld(chid) {
        $('#import_character_info').hide();

        if (chid === undefined) {
            return false;
        }

        if (characters[chid]?.data?.character_book) {
            $('#import_character_info').data('chid', chid).show();

            // Only show the alert once per character
            const checkKey = `AlertWI_${characters[chid].avatar}`;
            const worldName = characters[chid]?.data?.extensions?.world;
            if (!accountStorage.getItem(checkKey) && (!worldName || !world_names.includes(worldName))) {
                accountStorage.setItem(checkKey, 'true');

                {
                    const html = `<h3>This character has an embedded World/Lorebook.</h3>
                    <h3>Would you like to import it now?</h3>
                    <div class="m-b-1">If you want to import it later, select "Import Card Lore" in the "More..." dropdown menu on the character panel.</div>`;
                    const checkResult = (result) => {
                        if (result) {
                            importEmbeddedWorldInfo(true);
                        }
                    };
                    callGenericPopup(html, POPUP_TYPE.CONFIRM, '', { okButton: 'Yes' }).then(checkResult);
                }
            }
            return true;
        }

        return false;
    }

    async function importEmbeddedWorldInfo(skipPopup = false) {
        const chid = $('#import_character_info').data('chid');

        if (chid === undefined || chid === -1) {
            return;
        }

        const hasEmbed = checkEmbeddedWorld(chid);

        if (!hasEmbed) {
            toastr.info(t`This character card does not contain embedded World/Lorebook data.`);
            return;
        }

        const bookName = characters[chid]?.data?.character_book?.name || `${characters[chid]?.name}'s Lorebook`;

        if (!skipPopup) {
            const confirmation = await Popup.show.confirm(t`Are you sure you want to import '${bookName}'?`, world_names.includes(bookName) ? t`It will overwrite the World/Lorebook with the same name.` : '');
            if (!confirmation) {
                return;
            }
        }

        const convertedBook = convertCharacterBook(characters[chid].data.character_book);

        await saveWorldInfo(bookName, convertedBook, true);
        await updateWorldInfoList();
        $('#character_world').val(bookName).trigger('change');

        toastr.success(t`The world '${bookName}' has been imported and linked to the character successfully.`, t`World/Lorebook imported`);

        if (world_names.includes(bookName)) {
            //show&draw the WI panel before..
            await getWorldInfoShell().openWorldInfoPanel();
            //..auto-opening the new imported WI
            await selectWorldInfoEditorName(bookName);
        }

        setWorldInfoButtonClass(chid, true);
    }

    function onWorldInfoChange(args, text) {
        if (args !== '__notSlashCommand__') { // if it's a slash command
            const silent = isTrueBoolean(args.silent);
            if (text.trim() !== '') { // and args are provided
                const slashInputSplitText = text.trim().toLowerCase().split(',');

                slashInputSplitText.forEach((worldName) => {
                    const wiElement = getWIElement(worldName);
                    if (wiElement.length > 0) {
                        const name = wiElement.text();
                        switch (args.state) {
                            case 'off': {
                                if (selected_world_info.includes(name)) {
                                    selected_world_info.splice(selected_world_info.indexOf(name), 1);
                                    wiElement.prop('selected', false);
                                    if (!silent) toastr.success(t`Deactivated world: ${name}`);
                                } else {
                                    if (!silent) toastr.error(t`World was not active: ${name}`);
                                }
                                break;
                            }
                            case 'toggle': {
                                if (selected_world_info.includes(name)) {
                                    selected_world_info.splice(selected_world_info.indexOf(name), 1);
                                    wiElement.prop('selected', false);
                                    if (!silent) toastr.success(t`Deactivated world: ${name}`);
                                } else {
                                    selected_world_info.push(name);
                                    wiElement.prop('selected', true);
                                    if (!silent) toastr.success(t`Activated world: ${name}`);
                                }
                                break;
                            }
                            case 'on':
                            default: {
                                selected_world_info.push(name);
                                wiElement.prop('selected', true);
                                if (!silent) toastr.success(t`Activated world: ${name}`);
                            }
                        }
                    } else {
                        if (!silent) toastr.error(t`No world found named: ${worldName}`);
                    }
                });
                $('#world_info').trigger('change');
            } else { // if no args, unset all worlds
                if (!silent) toastr.success(t`Deactivated all worlds`);
                setSelectedWorldInfo([]);
                $('#world_info').val(null).trigger('change');
            }
        } else { //if it's a pointer selection
            const tempWorldInfo = [];
            const val = $('#world_info').val();
            const selectedWorlds = (Array.isArray(val) ? val : val ? [val] : []).map((e) => String(e)).filter(Boolean);
            if (selectedWorlds.length > 0) {
                selectedWorlds.forEach((existingWorldName) => {
                    if (world_names.includes(existingWorldName)) {
                        tempWorldInfo.push(existingWorldName);
                    } else {
                        const wiElement = getWIElement(existingWorldName);
                        wiElement.prop('selected', false);
                        toastr.error(t`The world with ${existingWorldName} is invalid or corrupted.`);
                    }
                });
            }
            setSelectedWorldInfo(tempWorldInfo);
        }

        saveSettingsDebounced();
        eventSource.emit(event_types.WORLDINFO_SETTINGS_UPDATED);
        return '';
    }
    return { setWorldInfoButtonClass, checkEmbeddedWorld, importEmbeddedWorldInfo, onWorldInfoChange };
}
