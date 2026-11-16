import notificationOwner from './notifications.js';
import { world_names } from './world-info-state.js';

const toastr = notificationOwner.native ?? notificationOwner;

/** Character embedded-book and global-selection shell UI compatibility. */
export function createWorldInfoReferenceUi({ characters, accountStorage, callGenericPopup, POPUP_TYPE, Popup, t, convertCharacterBook, saveWorldInfo, updateWorldInfoList, getWorldInfoShell, selectWorldInfoEditorName, setWorldInfoGlobalActiveNames }) {
    function setWorldInfoButtonClass(chid, forceValue = undefined) {
        if (forceValue !== undefined) {
            document.querySelectorAll('#set_character_world, #world_button').forEach(button => button.classList.toggle('world_set', forceValue));
            return;
        }

        if (chid === undefined) {
            return;
        }

        const world = characters[chid]?.data?.extensions?.world;
        const worldSet = Boolean(world && world_names.includes(world));
        document.querySelectorAll('#set_character_world, #world_button').forEach(button => button.classList.toggle('world_set', worldSet));
    }

    function checkEmbeddedWorld(chid) {
        const importControl = document.querySelector('#import_character_info');
        if (importControl) importControl.style.display = 'none';

        if (chid === undefined) {
            return false;
        }

        if (characters[chid]?.data?.character_book) {
            if (importControl) {
                importControl.worldInfoChid = chid;
                importControl.style.display = '';
            }

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
        const chid = document.querySelector('#import_character_info')?.worldInfoChid;

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
        const characterWorld = document.getElementById('character_world');
        if (characterWorld) {
            characterWorld.value = bookName;
            characterWorld.dispatchEvent(new Event('change', { bubbles: true }));
        }

        toastr.success(t`The world '${bookName}' has been imported and linked to the character successfully.`, t`World/Lorebook imported`);

        if (world_names.includes(bookName)) {
            //show&draw the WI panel before..
            await getWorldInfoShell().openWorldInfoPanel();
            //..auto-opening the new imported WI
            await selectWorldInfoEditorName(bookName);
        }

        setWorldInfoButtonClass(chid, true);
    }

    return {
        setWorldInfoButtonClass,
        checkEmbeddedWorld,
        importEmbeddedWorldInfo,
        onWorldInfoChange: setWorldInfoGlobalActiveNames,
    };
}
