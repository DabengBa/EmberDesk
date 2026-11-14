import { world_names } from './world-info-state.js';

/** Bind the preserved shell controls without owning editor state. */
export function createWorldInfoPanelUi({ characters, checkEmbeddedWorld, openWorldInfoEditor, importEmbeddedWorldInfo, saveCharacterDebounced, addLongPressEvent, assignLorebookToChat, t, isWorldInfoImportBusy, importWorldInfoFiles, DragAndDropHandler, getFreeWorldName, Popup, createNewWorldInfo }) {
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

    function initWorldInfo() {
        if (!worldInfoCoreInitialized) {
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

            worldInfoCoreInitialized = true;
        }

        if (!worldInfoPanelInitialized && document.querySelector('#world_import_file')) {
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

            worldInfoPanelInitialized = true;
        }
    }
    return initWorldInfo;
}
