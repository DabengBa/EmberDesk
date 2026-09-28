/**
 * Character context menu markup (React-owned inside #character_context_menu).
 * The shell keeps its hidden class and is positioned by BulkEditOverlay;
 * menu item buttons are bound by CharacterContextMenu's constructor.
 */
export function CharacterContextMenu() {
    return (
        <ul>
            <li><button id="character_context_menu_favorite" data-i18n="Favorite">Favorite</button></li>
            <li><button id="character_context_menu_tag" data-i18n="Tag">Tag</button></li>
            <li><button id="character_context_menu_duplicate" data-i18n="Duplicate">Duplicate</button></li>
            <li><button id="character_context_menu_delete" data-i18n="Delete">Delete</button></li>
        </ul>
    );
}
