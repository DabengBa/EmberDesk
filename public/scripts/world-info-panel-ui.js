import { world_names } from './world-info-state.js';

/** Bind the preserved shell controls without owning editor state. */
export function createWorldInfoPanelUi({ onWorldInfoChange, characters, checkEmbeddedWorld, openWorldInfoEditor, importEmbeddedWorldInfo, saveCharacterDebounced, addLongPressEvent, assignLorebookToChat, t, refreshGlobalWorldInfoSelectorState, refreshGlobalWorldInfoSelectorLabels, select2ChoiceClickSubscribe, getSelectedWorldInfoEditorName, selectWorldInfoEditorName, isWorldInfoImportBusy, importWorldInfoFiles, DragAndDropHandler, getFreeWorldName, Popup, createNewWorldInfo, isEditorSelectMirrorSuppressed, isMobile }) {
    let worldInfoCoreInitialized = false;
    let worldInfoPanelInitialized = false;

    let worldInfoImportDragDropHandler = null;

    function closeMoreMenu({ restoreFocus = false } = {}) {
        $('#world_more_menu_dropdown').hide();
        const moreMenu = $('#world_more_menu');
        moreMenu.attr('aria-expanded', 'false');
        $('#WorldInfo').removeClass('wi-more-menu-open');
        if (restoreFocus) {
            moreMenu.trigger('focus');
        }
    }

    function getWorldInfoSelect2Language() {
        return {
            removeAllItems: () => t`Remove all items`,
            removeItem: () => t`Remove item`,
        };
    }

    function initWorldInfo() {
        if (!worldInfoCoreInitialized) {
            const globalWorldInfoSelector = $('#world_info');

            globalWorldInfoSelector.on('mousedown change', async function (e) {
                // If there's no world names, don't do anything
                if (world_names.length === 0) {
                    e.preventDefault();
                    return;
                }

                onWorldInfoChange('__notSlashCommand__');
            });

            $('#world_button').on('click', async function (event) {
                const openSetWorldMenu = () => $('#char-management-dropdown').val($('#set_character_world').val()).trigger('change');
                const chid = $('#set_character_world').data('chid');

                if (chid === -1) {
                    openSetWorldMenu();
                    return;
                }

                const worldName = characters[chid]?.data?.extensions?.world;
                const hasEmbed = checkEmbeddedWorld(chid);
                if (worldName && world_names.includes(worldName) && !event.shiftKey && !event.altKey) {
                    openWorldInfoEditor(worldName);
                } else if (hasEmbed && !event.shiftKey && !event.altKey) {
                    await importEmbeddedWorldInfo();
                    saveCharacterDebounced();
                } else {
                    openSetWorldMenu();
                }
            });
            addLongPressEvent('#world_button', function () {
                $(this).trigger($.Event('click', { shiftKey: true }));
            });

            $(document).on('click', '.chat_lorebook_button', assignLorebookToChat);
            addLongPressEvent('.chat_lorebook_button', function () {
                assignLorebookToChat({ shiftKey: true, altKey: false });
            });

            if (!globalWorldInfoSelector.data('select2')) {
                globalWorldInfoSelector.select2({
                    width: '100%',
                    placeholder: globalWorldInfoSelector.attr('data-placeholder') || t`No global worlds active. Select one or more worlds.`,
                    allowClear: true,
                    closeOnSelect: false,
                    language: getWorldInfoSelect2Language(),
                });
                globalWorldInfoSelector.on('select2:select select2:unselect', () => refreshGlobalWorldInfoSelectorState());
                refreshGlobalWorldInfoSelectorLabels();

                select2ChoiceClickSubscribe(globalWorldInfoSelector, target => {
                    const name = $(target).text();
                    const alreadySelectedInEditor = getSelectedWorldInfoEditorName() === name;
                    if (world_names.includes(name) && !alreadySelectedInEditor) {
                        void selectWorldInfoEditorName(name);
                        console.log('Quick selection of world', name);
                    } else {
                        console.warn('lets not reload an already loaded list yes?');
                    }
                }, { buttonStyle: true, closeDrawer: true });
            }

            worldInfoCoreInitialized = true;
        }

        if (!worldInfoPanelInitialized && document.querySelector('#world_editor_select')) {
            // More menu: import
            $('#world_import_menu_item').on('click', function () {
                if (isWorldInfoImportBusy()) {
                    return;
                }

                $('#world_import_file').trigger('click');
                closeMoreMenu();
            });

            $('#world_import_file').on('change', async function (e) {
                if (!(e.target instanceof HTMLInputElement)) {
                    return;
                }

                const files = Array.from(e.target.files ?? []);
                if (files.length === 0) {
                    e.target.value = '';
                    return;
                }

                try {
                    await importWorldInfoFiles(files);
                } finally {
                    e.target.value = '';
                }
            });

            if (!worldInfoImportDragDropHandler) {
                worldInfoImportDragDropHandler = new DragAndDropHandler('#world_popup', async (files) => {
                    await importWorldInfoFiles(files);
                });
            }

            // More menu toggle
            $('#world_more_menu').off('click.worldMoreMenuToggle keydown.worldMoreMenuToggle').on('click.worldMoreMenuToggle', function (e) {
                e.stopPropagation();
                const menu = $('#world_more_menu_dropdown');
                menu.toggle();
                const isVisible = menu.is(':visible');
                $('#WorldInfo').toggleClass('wi-more-menu-open', isVisible);
                $(this).attr('aria-expanded', String(isVisible));
                if (isVisible) {
                    menu.find('[role="menuitem"]:visible').first().trigger('focus');
                }
            }).on('keydown.worldMoreMenuToggle', function (e) {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    closeMoreMenu({ restoreFocus: true });
                    return;
                }

                if (e.key !== 'Enter' && e.key !== ' ') {
                    return;
                }

                e.preventDefault();
                $(this).trigger('click');
            });

            $('#world_more_menu_dropdown .options-menu').off('keydown.worldMoreMenuItem').on('keydown.worldMoreMenuItem', function (e) {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    closeMoreMenu({ restoreFocus: true });
                    return;
                }

                if (e.key !== 'Enter' && e.key !== ' ') {
                    return;
                }

                e.preventDefault();
                $(this).trigger('click');
            });

            $(document).off('click.worldMoreMenu').on('click.worldMoreMenu', function (e) {
                if (!$(e.target).closest('#world_more_menu_wrapper').length) {
                    closeMoreMenu();
                }
            });

            // More menu: create new world (uses separate ID to avoid conflict with new-entry button)
            $('#world_create_world').on('click', async () => {
                const tempName = getFreeWorldName();
                const finalName = await Popup.show.input(t`Create a new World Info`, t`Enter a name for the new file:`, tempName);

                if (finalName) {
                    await createNewWorldInfo(finalName, { interactive: true });
                }
                closeMoreMenu();
            });

            $('#world_editor_select').on('change', async () => {
                if (isEditorSelectMirrorSuppressed()) {
                    return;
                }
                // Funnel: any direct .val(...).trigger('change') write lands here and
                // is resolved through the session-owned selection path.
                const rawName = String($('#world_editor_select').val() ?? '');
                await selectWorldInfoEditorName(rawName);
            });


            if (!isMobile()) {
                $('#world_editor_select').select2({
                    placeholder: t`--- Pick to Edit ---`,
                    searchInputPlaceholder: t`Search...`,
                    allowClear: true,
                    closeOnSelect: true,
                    multiple: false,
                    language: getWorldInfoSelect2Language(),
                });
            }

            worldInfoPanelInitialized = true;
        }
    }
    return initWorldInfo;
}
