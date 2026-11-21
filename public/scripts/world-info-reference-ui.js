import notificationOwner from './notifications.js';
import { setImportedWorldInfoPositions } from './world-info-import-placement.js';
import { world_names } from './world-info-state.js';

const toastr = notificationOwner.native ?? notificationOwner;

/** Character embedded-book and global-selection shell UI compatibility. */
export function createWorldInfoReferenceUi({ characters, accountStorage, callGenericPopup, POPUP_TYPE, Popup, t, convertCharacterBook, getSanitizedFilename, saveWorldInfo, updateWorldInfoList, persistEmbeddedWorldLink, getWorldInfoShell, selectWorldInfoEditorName, setWorldInfoGlobalActiveNames }) {
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

        const character = characters[chid];
        const book = character?.data?.character_book;
        if (book) {
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
                            void importEmbeddedWorldInfo(true, character, book);
                        }
                    };
                    callGenericPopup(html, POPUP_TYPE.CONFIRM, '', { okButton: 'Yes' }).then(checkResult);
                }
            }
            return true;
        }

        return false;
    }

    async function importEmbeddedWorldInfo(skipPopup = false, character = characters[document.querySelector('#import_character_info')?.worldInfoChid], book = character?.data?.character_book) {
        if (!character?.avatar) return false;
        if (!book) {
            toastr.info(t`This character card does not contain embedded World/Lorebook data.`);
            return;
        }

        const requestedName = book.name || `${character.name}'s Lorebook`;
        let bookName;
        try {
            bookName = (await getSanitizedFilename(String(requestedName).trim())).trim();
            if (!bookName) throw new Error('The sanitized book name is empty');
        } catch (error) {
            console.error('Embedded world name is invalid', error);
            toastr.error(t`Could not import the world '${requestedName}'.`);
            return false;
        }

        if (!skipPopup) {
            const confirmation = await Popup.show.confirm(t`Are you sure you want to import '${bookName}'?`, world_names.includes(bookName) ? t`It will overwrite the World/Lorebook with the same name.` : '');
            if (!confirmation) {
                return;
            }
        }

        try {
            const convertedBook = convertCharacterBook(book);
            setImportedWorldInfoPositions(convertedBook.entries);
            await saveWorldInfo(bookName, convertedBook, true);
        } catch (error) {
            console.error('Embedded world import failed', error);
            toastr.error(t`Could not import the world '${bookName}'.`);
            return false;
        }
        let linked = false;
        try {
            await persistEmbeddedWorldLink(character, bookName);
            linked = true;
        } catch (error) {
            console.error('Embedded world link failed', error);
            toastr.warning(t`The world '${bookName}' was saved but could not be linked to the character.`);
        }
        if (linked) toastr.success(t`The world '${bookName}' has been imported and linked to the character successfully.`, t`World/Lorebook imported`);
        await updateWorldInfoList();

        if (world_names.includes(bookName)) {
            //show&draw the WI panel before..
            await getWorldInfoShell().openWorldInfoPanel();
            //..auto-opening the new imported WI
            await selectWorldInfoEditorName(bookName);
        }

        return linked;
    }

    return {
        setWorldInfoButtonClass,
        checkEmbeddedWorld,
        importEmbeddedWorldInfo,
        onWorldInfoChange: setWorldInfoGlobalActiveNames,
    };
}
