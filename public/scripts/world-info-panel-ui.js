import { world_names } from './world-info-state.js';

let menuBindings;

/** Bind the preserved shell controls without owning editor state. */
export function createWorldInfoPanelUi({ characters, checkEmbeddedWorld, openWorldInfoEditor, importEmbeddedWorldInfo, saveCharacterDebounced, addLongPressEvent, assignLorebookToChat, t, isWorldInfoImportBusy, importWorldInfoFiles, DragAndDropHandler, getFreeWorldName, Popup, createNewWorldInfo }) {
    let worldInfoCoreInitialized = false;
    let worldInfoPanelInitialized = false;

    let worldInfoImportDragDropHandler = null;

    function closeMoreMenu({ restoreFocus = false } = {}) {
        const dropdown = document.querySelector('#world_more_menu_dropdown');
        if (dropdown) dropdown.style.display = 'none';
        const moreMenu = document.querySelector('#world_more_menu');
        moreMenu?.setAttribute('aria-expanded', 'false');
        document.querySelector('#WorldInfo')?.classList.remove('wi-more-menu-open');
        if (restoreFocus) {
            moreMenu?.focus();
        }
    }

    function initWorldInfo() {
        if (!worldInfoCoreInitialized) {
            document.getElementById('world_button')?.addEventListener('click', async function (event) {
                const openSetWorldMenu = () => {
                    const dropdown = document.getElementById('char-management-dropdown');
                    const option = document.getElementById('set_character_world');
                    if (!dropdown || !option) return;
                    dropdown.value = option.value;
                    dropdown.dispatchEvent(new Event('change', { bubbles: true }));
                };
                const storedChid = document.getElementById('set_character_world')?.dataset.chid;
                const chid = storedChid === '-1' ? -1 : storedChid;

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
                this.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
            });

            document.addEventListener('click', event => {
                const target = event.target instanceof Element ? event.target : event.target?.parentElement;
                if (target?.closest('.chat_lorebook_button')) {
                    void assignLorebookToChat(event);
                }
            });
            addLongPressEvent('.chat_lorebook_button', function () {
                assignLorebookToChat({ shiftKey: true, altKey: false });
            });

            worldInfoCoreInitialized = true;
        }

        if (!worldInfoPanelInitialized && document.querySelector('#world_import_file')) {
            // More menu: import
            document.querySelector('#world_import_menu_item')?.addEventListener('click', function () {
                if (isWorldInfoImportBusy()) {
                    return;
                }

                document.querySelector('#world_import_file')?.click();
                closeMoreMenu();
            });

            document.querySelector('#world_import_file').addEventListener('change', async function (e) {
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
            menuBindings?.abort();
            menuBindings = new AbortController();
            const bindingOptions = { signal: menuBindings.signal };
            const moreMenu = document.querySelector('#world_more_menu');
            const dropdown = document.querySelector('#world_more_menu_dropdown');
            moreMenu?.addEventListener('click', function (e) {
                e.stopPropagation();
                if (!dropdown) return;
                const isVisible = dropdown.style.display === 'none';
                dropdown.style.display = isVisible ? '' : 'none';
                document.querySelector('#WorldInfo')?.classList.toggle('wi-more-menu-open', isVisible);
                this.setAttribute('aria-expanded', String(isVisible));
                if (isVisible) {
                    [...dropdown.querySelectorAll('[role="menuitem"]')].find(item => item.getClientRects().length)?.focus();
                }
            }, bindingOptions);
            moreMenu?.addEventListener('keydown', function (e) {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    closeMoreMenu({ restoreFocus: true });
                    return;
                }

                if (e.key !== 'Enter' && e.key !== ' ') {
                    return;
                }

                e.preventDefault();
                this.click();
            }, bindingOptions);

            document.querySelectorAll('#world_more_menu_dropdown .options-menu').forEach(item => item.addEventListener('keydown', function (e) {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    closeMoreMenu({ restoreFocus: true });
                    return;
                }

                if (e.key !== 'Enter' && e.key !== ' ') {
                    return;
                }

                e.preventDefault();
                this.click();
            }, bindingOptions));

            document.addEventListener('click', function (e) {
                if (!(e.target instanceof Element) || !e.target.closest('#world_more_menu_wrapper')) {
                    closeMoreMenu();
                }
            }, bindingOptions);

            // More menu: create new world (uses separate ID to avoid conflict with new-entry button)
            document.querySelector('#world_create_world')?.addEventListener('click', async () => {
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
