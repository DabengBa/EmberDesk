import { world_info, world_names } from './world-info-state.js';

/** Interactive book management and reference cascade feedback. */
export function createWorldInfoBookUi({ getFreeWorldName, Popup, POPUP_TYPE, POPUP_RESULT, PopupUtils, t, createNewWorldInfo, getSelectedWorldInfoEditorName, loadWorldInfo, download, renameWorldInfo, saveWorldInfo, updateWorldInfoList, selectWorldInfoEditorName, hideWorldEditor, getRequestHeaders, buildCascadeSectionHtml, captureCascadeChoices, flushDeletedWorldsFromUI, saveSettingsDebounced, deleteWorldInfo }) {
    async function promptToCreateWorldInfo() {
        const tempName = getFreeWorldName();
        const finalName = await Popup.show.input(t`Create a new World Info`, t`Enter a name for the new file:`, tempName);

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

        await renameWorldInfo(worldName, data);
        return true;
    }

    async function duplicateCurrentWorldInfo() {
        const { worldName, data } = await getCurrentWorldInfoEditorState();
        if (!worldName || !data) {
            return false;
        }

        const tempName = getFreeWorldName(worldName);
        const finalName = await Popup.show.input('Create a new World Info?', 'Enter a name for the new file:', tempName);

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
            const cascadeHtml = buildCascadeSectionHtml(worldInfos);
            const refId = `world-clear-refs-${Date.now()}`;
            const refCheckboxHtml = `<div class="delete-dialog-option" style="margin-top:10px;">
                <input type="checkbox" id="${refId}"><label for="${refId}">${t`Also clear world info references in bound characters`}</label>
            </div>`;
            const fullHtml = `<h3>${t`Delete the World/Lorebook: "${worldName}"?`}</h3>${cascadeHtml}${refCheckboxHtml}`;

            let capturedCascade = { deleteWorlds: [], clearWorldReferences: false };
            const popup = new Popup(fullHtml, POPUP_TYPE.CONFIRM, '', {
                okButton: t`Delete`,
                cancelButton: t`Cancel`,
                wider: true,
                leftAlign: true,
                defaultResult: POPUP_RESULT.NEGATIVE,
                customButtons: [{
                    text: t`Delete ${worldInfos.length} linked world book(s)`,
                    result: POPUP_RESULT.CUSTOM1,
                    classes: ['popup-button-danger'],
                }],
                onClosing: () => {
                    capturedCascade = captureCascadeChoices();
                    capturedCascade.clearWorldReferences = !!document.getElementById(refId)?.checked;
                    return true;
                },
                onOpen: (popupInstance) => {
                    document.querySelectorAll('.world-cascade-checkbox').forEach((checkbox) => { checkbox.checked = true; });
                    const deleteAllButton = popupInstance.dlg.querySelector(`[data-result="${POPUP_RESULT.CUSTOM1}"]`);
                    if (deleteAllButton) {
                        deleteAllButton.classList.add('popup-button-danger');
                        deleteAllButton.addEventListener('click', () => {
                            document.querySelectorAll('.world-cascade-checkbox').forEach((checkbox) => { checkbox.checked = true; });
                            popupInstance.complete(POPUP_RESULT.AFFIRMATIVE);
                        });
                    }
                },
            });
            popup.okButton.classList.add('popup-button-danger');
            const result = await popup.show();
            if (!result || capturedCascade.deleteWorlds.length === 0) {
                return false;
            }

            if (capturedCascade.clearWorldReferences) {
                await fetch('/api/worldinfo/delete-cascade', {
                    method: 'POST',
                    headers: getRequestHeaders(),
                    body: JSON.stringify({ worlds: capturedCascade.deleteWorlds, clear_references: true }),
                });
                await flushDeletedWorldsFromUI(capturedCascade.deleteWorlds);
                return true;
            }
        } else {
            const popup = new Popup(
                PopupUtils.BuildTextWithHeader(`Delete the World/Lorebook: "${worldName}"?`, t`This action is irreversible!`),
                POPUP_TYPE.CONFIRM,
                '',
                {
                    okButton: t`Delete`,
                    cancelButton: t`Cancel`,
                    defaultResult: POPUP_RESULT.NEGATIVE,
                },
            );
            popup.okButton.classList.add('popup-button-danger');
            const confirmed = await popup.show();
            if (!confirmed) {
                return false;
            }
        }

        if (removeDeletedWorldInfoAuxiliaryReferences(worldName)) {
            saveSettingsDebounced();
        }

        await deleteWorldInfo(worldName);
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
