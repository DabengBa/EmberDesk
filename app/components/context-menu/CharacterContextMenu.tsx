import { useTranslated } from '@/compat/i18n.js';
/**
 * Character context menu markup (React-owned inside #character_context_menu).
 * The shell keeps its hidden class and is positioned by BulkEditOverlay;
 * menu item buttons are bound by CharacterContextMenu's constructor.
 */
export function CharacterContextMenu() {
    return (
        <ul>
            <li><button id="character_context_menu_favorite" >{useTranslated('Favorite')}</button></li>
            <li><button id="character_context_menu_tag" >{useTranslated('Tag')}</button></li>
            <li><button id="character_context_menu_duplicate" >{useTranslated('Duplicate')}</button></li>
            <li><button id="character_context_menu_delete" >{useTranslated('Delete')}</button></li>
        </ul>
    );
}
