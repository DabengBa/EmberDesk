import { ContractButton } from '../contract/ContractButton';
import { ContractIconButton } from '../contract/ContractIconButton';
import * as stylex from '@stylexjs/stylex';
import { personaPanelStyles as styles } from '../../styles/persona-panel.styles';

/**
 * Presentational owner of the Persona Management drawer content.
 * Element IDs and behavior classes are preserved verbatim: personas.js keeps
 * owning behavior (bindings, lock state, connections) while the avatar list
 * inside #user_avatar_block is React-owned via mountPersonaAvatarList.
 */
export function PersonaManagementPanel() {
    return (
        <div className="flex-container wide100p alignitemscenter spaceBetween flexNoGap" data-react-persona-panel="true">
            <div className="flex-container alignItemsBaseline wide100p">
                <div className="flex1 flex-container alignItemsBaseline">
                    <h3 className="margin0">
                        <span data-i18n="Persona Management">Persona Management</span>
                        <a href="usage/core-concepts/personas/" target="_blank" rel="noreferrer" aria-label="Persona documentation">
                            <span className="fa-solid fa-circle-question note-link-span" aria-hidden="true" />
                        </a>
                    </h3>
                </div>
                <div className="flex-container">
                    <ContractButton id="personas_backup" className="menu_button menu_button_icon" label="Backup" nativeTitle title="Backup your personas to a file" icon={<i className="fa-solid fa-file-export" aria-hidden="true" />} />
                    <ContractButton id="personas_restore" className="menu_button menu_button_icon" label="Restore" nativeTitle title="Restore your personas from a file" icon={<i className="fa-solid fa-file-import" aria-hidden="true" />} />
                    <input id="personas_restore_input" type="file" accept=".json" hidden />
                </div>
            </div>
            <div id="persona-management-block" className="flex-container wide100p flexGap10">
                <div className="persona_management_left_column flex1 overflowHidden wide100p">
                    <div className="flex-container marginBot10 alignitemscenter">
                        <ContractButton id="create_dummy_persona" className="menu_button menu_button_icon" label="Create" title="Create a dummy persona" nativeTitle icon={<i className="fa-solid fa-person-circle-question fa-fw" aria-hidden="true" />} />
                        <input id="persona_search_bar" className="text_pole width100p flex1 margin0" type="search" data-i18n="[placeholder]Search..." placeholder="Search..." />
                        <select id="persona_sort_order" className="margin0" defaultValue="asc">
                            <option value="search" data-i18n="Search" hidden>Search</option>
                            <option value="asc">A-Z</option>
                            <option value="desc">Z-A</option>
                        </select>
                        <div id="persona_pagination_container" className="flex1" />
                        <ContractIconButton id="persona_grid_toggle" className="menu_button" label="Toggle grid view" nativeTitle title="Toggle grid view" icon={<i className="fa-solid fa-table-cells-large" aria-hidden="true" />} />
                    </div>
                    <div id="user_avatar_block" className={stylex.props(styles.avatarBlock).className ?? ''} data-i18n="[no_desc_text]No persona description" {...{ no_desc_text: '[No description]' } as Record<string, string>} />
                    <form id="form_upload_avatar" method="post" encType="multipart/form-data" onSubmit={event => event.preventDefault()}>
                        <input type="file" id="avatar_upload_file" accept="image/*" name="avatar" />
                        <input type="hidden" id="avatar_upload_overwrite" name="overwrite_name" value="" />
                    </form>
                </div>
                <div className="persona_management_right_column flex1">
                    <div className="persona_management_current_persona">
                        <h4 className="standoutHeader" data-i18n="Current Persona">Current Persona</h4>

                        <div id="persona_controls" className="flex-container">
                            <h5 id="your_name" className={`persona_name ${stylex.props(styles.personaName).className ?? ''}`}>[Persona Name]</h5>
                            <div className="persona_controls_buttons_block buttons_block">
                                <ContractIconButton id="persona_rename_button" className="menu_button" label="Rename Persona" nativeTitle title="Rename Persona" icon={<i className="fa-solid fa-pencil" aria-hidden="true" />} />
                                <ContractIconButton id="sync_name_button" className="menu_button" label="Click to set user name for all messages" nativeTitle title="Click to set user name for all messages" icon={<i className="fa-solid fa-sync" aria-hidden="true" />} />
                                <ContractIconButton id="persona_lore_button" className="menu_button" label="Persona Lore&#10;&#10;Click to load&#10;Shift/Alt-click or long-press to open 'Link to Persona Lorebook' popup" nativeTitle title="Persona Lore&#10;&#10;Click to load&#10;Shift/Alt-click or long-press to open 'Link to Persona Lorebook' popup" icon={<i className="fa-solid fa-globe" aria-hidden="true" />} />
                                <ContractIconButton id="persona_set_image_button" className="menu_button" label="Change Persona Image" nativeTitle title="Change Persona Image" icon={<i className="fa-solid fa-image" aria-hidden="true" />} />
                                <ContractIconButton id="persona_duplicate_button" className="menu_button" label="Duplicate Persona" nativeTitle title="Duplicate Persona" icon={<i className="fa-solid fa-clone" aria-hidden="true" />} />
                                <ContractIconButton id="persona_delete_button" className="menu_button red_button" label="Delete Persona" nativeTitle title="Delete Persona" icon={<i className="fa-solid fa-skull" aria-hidden="true" />} />
                            </div>
                            <label className="flex1 height100p" htmlFor="persona-management-dropdown">
                                <span className="sr-only">Persona actions</span>
                                <select id="persona-management-dropdown" className="text_pole" defaultValue="default">
                                    <option value="default" disabled data-i18n="More...">More...</option>
                                    <option id="persona_lorebook_link" data-i18n="Link to Persona Lorebook">Link to Persona Lorebook</option>
                                </select>
                            </label>
                        </div>

                        <h4 className="flex-container alignItemsBaseline">
                            <span data-i18n="Persona Description">Persona Description</span>
                            <ContractIconButton data-for="persona_description" className="editor_maximize right_menu_button" label="Expand the editor" title="Expand the editor" nativeTitle icon={<i className="fa-solid fa-maximize" aria-hidden="true" />} />
                        </h4>
                        <textarea id="persona_description" name="persona_description" data-macros="" data-i18n="[placeholder]Example: [{{user}} is a 28-year-old Romanian cat girl.]" placeholder={'Example:\n[{{user}} is a 28-year-old Romanian cat girl.]'} className="text_pole textarea_compact" defaultValue="" autoComplete="off" rows={8} />

                        <div className="flex-container justifySpaceBetween">
                            <h4 data-i18n="Position">Position</h4>
                            <div className="extension_token_counter widthFitContent">
                                <span data-i18n="Tokens persona description">Tokens</span>: <span id="persona_description_token_count">0</span>
                            </div>
                        </div>

                        <div className="persona_management_description_position_container">
                            <select id="persona_description_position" defaultValue="0">
                                <option value="9" data-i18n="None (disabled)">None (disabled)</option>
                                <option value="0" data-i18n="In Story String / Prompt Manager">In Story String / Prompt Manager</option>
                                <option value="2" data-i18n="Top of Author's Note">Top of Author's Note</option>
                                <option value="3" data-i18n="Bottom of Author's Note">Bottom of Author's Note</option>
                                <option value="4" data-i18n="In-chat @ Depth">In-chat @ Depth</option>
                            </select>
                            <div id="persona_depth_position_settings" className="flex-container">
                                <div className="flex1">
                                    <label htmlFor="persona_depth_value" data-i18n="Depth:">Depth:</label>
                                    <input id="persona_depth_value" className="text_pole" type="number" min="0" max="9999" step="1" />
                                </div>
                                <div className="flex1">
                                    <label htmlFor="persona_depth_role" data-i18n="Role:">Role:</label>
                                    <select id="persona_depth_role" className="text_pole" defaultValue="0">
                                        <option data-i18n="System" value="0">System</option>
                                        <option data-i18n="User" value="1">User</option>
                                        <option data-i18n="Assistant" value="2">Assistant</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <h4 data-i18n="Connections">Connections</h4>
                        <div id="persona_connections_buttons" className={`flex-container ${stylex.props(styles.connectionsButtons).className ?? ''}`}>
                            <ContractButton id="lock_persona_default" className="menu_button menu_button_icon" label="Default" title="Click to select this as default persona for the new chats. Click again to remove it." nativeTitle icon={<i className="icon fa-solid fa-crown fa-fw" aria-hidden="true" />} />
                            <ContractButton id="lock_persona_to_char" className="menu_button menu_button_icon" label="Character" title="Click to lock your selected persona to the current character. Click again to remove the lock." nativeTitle icon={<i className="icon fa-solid fa-unlock fa-fw" aria-hidden="true" />} />
                            <ContractButton id="lock_user_name" className="menu_button menu_button_icon" label="Chat" title="Click to lock your selected persona to the current chat. Click again to remove the lock." nativeTitle icon={<i className="icon fa-solid fa-unlock fa-fw" aria-hidden="true" />} />
                        </div>
                        <div id="persona_connections_info_block" />
                        <div id="persona_connections_list" className="text_muted m-b-1 avatars_inline avatars_multiline scroll-reset-container expander" />
                    </div>

                    <div className="persona_management_global_settings">
                        <h4 className="standoutHeader" data-i18n="Global Settings">Global Settings</h4>

                        <div className="range-block">
                            <label htmlFor="persona_show_notifications" className="checkbox_label">
                                <input id="persona_show_notifications" type="checkbox" />
                                <span data-i18n="Show notifications on switching personas">Show notifications on switching personas</span>
                            </label>
                        </div>
                        <div className="range-block">
                            <label htmlFor="persona_allow_multi_connections" className="checkbox_label" title="When multiple personas are connected to a character, a popup will appear to select which one to use." data-i18n="[title]When multiple personas are connected to a character, a popup will appear to select which one to use">
                                <input id="persona_allow_multi_connections" type="checkbox" />
                                <span data-i18n="Allow multiple persona connections per character">Allow multiple persona connections per character</span>
                            </label>
                        </div>
                        <div className="range-block">
                            <label htmlFor="persona_auto_lock" className="checkbox_label" title="Whenever a persona is selected, it will be locked to the current chat and automatically selected when the chat is opened." data-i18n="[title]Whenever a persona is selected, it will be locked to the current chat and automatically selected when the chat is opened.">
                                <input id="persona_auto_lock" type="checkbox" />
                                <span data-i18n="Auto-lock a chosen persona to the chat">Auto-lock a chosen persona to the chat</span>
                            </label>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
