import { ContractButton } from '../contract/ContractButton';
import { ContractIconButton } from '../contract/ContractIconButton';
/**
 * Right navigation panel markup (React-owned inside #right-nav-panel).
 * Contains the character create/edit form (#form_create), the import form,
 * and the character list chrome. Behavior stays legacy: script.js binds
 * #form_create submit + toolbar buttons, tags.js owns .rm_tag_filter and
 * #tagInput/#tagList, bulk-edit owns the bulk controls, and the character
 * list itself is rendered dynamically into #rm_print_characters_block.
 */
export function RightNavPanel() {
    return (
        <>
                <ContractIconButton id="right-nav-panelheader" className="drag-grabber" label="Action" icon={<i className="fa-solid fa-grip" aria-hidden="true" />} />
                <div id="CharListButtonAndHotSwaps" className="flex-container flexnowrap">
                    <div className="flexFlowColumn flex-container">
                        <div id="rm_button_panel_pin_div" className="alignitemsflexstart" title="Locked = Character Management panel will stay open" data-i18n="[title]Locked = Character Management panel will stay open">
                            <input type="checkbox" id="rm_button_panel_pin" />
                            <label htmlFor="rm_button_panel_pin">
                                <div className="fa-solid unchecked fa-unlock right_menu_button"></div>
                                <div className="fa-solid checked fa-lock right_menu_button"></div>
                            </label>
                        </div>
                        <ContractIconButton id="rm_button_characters" tabIndex={0} className="right_menu_button" label="Characters" nativeTitle title="Select/Create Characters" icon={<i className="fa-solid fa-list-ul" aria-hidden="true" />} />
                    </div>
                    <div id="HotSwapWrapper" className="alignitemscenter flex-container margin0auto wide100p">
                        <div className="hotswap avatars_inline scroll-reset-container expander" data-i18n="[no_favs]Favorite characters to add them to HotSwaps" no_favs="Favorite characters to add them to HotSwaps">
                        </div>
                    </div>
                </div>

                {/* Keep this wrapper stable for the right navigation panel. */}
                <div id="rm_PinAndTabs">
                    <div id="right-nav-panel-tabs" className="">
                        <div id="rm_button_selected_ch">
                            <h2 className="interactable"></h2>
                            <span id="temporary_chat_status" className="temporary-chat-status" data-i18n="Temporary chat" aria-live="polite" aria-hidden="true" hidden>Temporary chat</span>
                        </div>
                        <div id="result_info" className="flex-container" style={{ "display": "none" }}>
                            <div id="result_info_text" title="Token counts may be inaccurate and provided just for reference." data-i18n="[title]Token counts may be inaccurate and provided just for reference.">
                                <div>
                                    <strong id="result_info_total_tokens" title="Total tokens" data-i18n="[title]Total tokens"><span data-i18n="Calculating...">Calculating...</span></strong>{'\u00a0'}<span data-i18n="Tokens">Tokens</span>
                                </div>
                                <div>
                                    <small title="Permanent tokens" data-i18n="[title]Permanent tokens">
                                        (<span id="result_info_permanent_tokens"></span>{'\u00a0'}<span data-i18n="Permanent">Permanent</span>)
                                    </small>
                                </div>
                            </div>
                            <a id="chartokenwarning" className="right_menu_button fa-solid fa-triangle-exclamation" href="usage/core-concepts/characterdesign/#character-tokens" target="_blank" title="About Token 'Limits'" data-i18n="[title]About Token 'Limits'"></a>
                            <ContractIconButton id="hideCharPanelAvatarButton" className="right_menu_button" label="Toggle character info panel" nativeTitle title="Toggle character info panel" icon={<i className="fa-solid fa-eye" aria-hidden="true" />} />
                        </div>
                    </div>
                </div>
                {/* end right navigation panel wrapper */}

                <div className="scrollableInner">
                    <div name="Solo Char Create/Edit Panel" id="rm_ch_create_block" className="right_menu flex-container flexFlowColumn character-detail-panel" style={{ "display": "none" }}>
                        <form id="form_create" action="javascript:void(null);" method="post" encType="multipart/form-data">
                            <div id="avatar-and-name-block" className="character-detail-identity">
                                <div id="name_div" className="character-detail-name">
                                    <input id="character_name_pole" name="ch_name" className="text_pole" data-i18n="[placeholder]Name this character" placeholder="Name this character" defaultValue="" autoComplete="off" />
                                    <div className="extension_token_counter character-detail-name-meta">
                                        <span data-i18n="extension_token_counter">Tokens:</span> <span data-token-counter="character_name_pole" data-token-permanent="true">counting...</span>
                                    </div>
                                </div>
                                <div className="flex-container flexFlowColumn expander flexNoGap character-detail-main">
                                    <div id="avatar_div" className="avatar_div buttons_block alignitemsflexstart justifySpaceBetween flexnowrap character-detail-hero">
                                        <label id="avatar_div_div" className="add_avatar avatar character-detail-avatar" htmlFor="add_avatar_button" title="Click to select a new avatar for this character" data-i18n="[title]Click to select a new avatar for this character">
                                            <img id="avatar_load_preview" src="img/ai4.png" alt="avatar" />
                                            <input hidden type="file" id="add_avatar_button" name="avatar" accept="image/*" />
                                        </label>
                                        <div className="flex-container" id="avatar_controls">
                                            <div className="form_create_bottom_buttons_block buttons_block character-detail-primary-actions">
                                                <ContractIconButton id="rm_button_back" className="menu_button" label="Back" icon={<i className="fa-solid fa-left-long" aria-hidden="true" />} />
                                                {/* <ContractIconButton id="renameCharButton" className="menu_button" label="Rename Character" nativeTitle title="Rename Character" icon={<i className="fa-solid fa-user-pen" aria-hidden="true" />} /> */}
                                                <div className="character-detail-action-icons">
                                                    <ContractIconButton id="favorite_button" className="menu_button" label="Add to Favorites" nativeTitle title="Add to Favorites" icon={<i className="fa-solid fa-star" aria-hidden="true" />} />
                                                    <ContractIconButton id="world_button" className="menu_button" label="Character Lore" nativeTitle title={"Character Lore\n\nClick to load\nShift/Alt-click or long-press to open 'Link to World Info' popup"} titleKey="world_button_title" icon={<i className="fa-solid fa-globe" aria-hidden="true" />} />
                                                    <button id="delete_button" type="button" className="menu_button fa-solid fa-skull red_button" title="Delete Character" aria-label="Delete Character" data-i18n="[title][aria-label]Delete Character"></button>
                                                </div>
                                                <input type="hidden" id="fav_checkbox" name="fav" />
                                                <label htmlFor="create_button" id="create_button_label" className="menu_button fa-solid fa-user-check" title="Create Character" data-i18n="[title]Create Character">
                                                    <input type="submit" id="create_button" name="create_button" />
                                                </label>
                                                <label className="character-detail-more" htmlFor="char-management-dropdown">
                                                    <select id="char-management-dropdown" className="text_pole" defaultValue="default">
                                                        <option value="default" disabled data-i18n="More...">More...</option>
                                                        <option id="character_action_advanced" data-i18n="Advanced Definition">
                                                            Advanced Definition
                                                        </option>
                                                        <option id="set_character_world" data-i18n="Link to World Info">
                                                            Link to World Info
                                                        </option>
                                                        <option id="character_action_chat_lorebook" data-i18n="Chat Lore">
                                                            Chat Lore
                                                        </option>
                                                        <option id="import_character_info" data-i18n="Import Card Lore">
                                                            Import Card Lore
                                                        </option>
                                                        <option id="set_chat_character_settings" data-i18n="Character Settings Overrides">
                                                            Character Settings Overrides
                                                        </option>
                                                        <option id="character_action_connected_personas" className="character-detail-edit-action" data-i18n="Connected Personas">
                                                            Connected Personas
                                                        </option>
                                                        <option id="convert_to_persona" data-i18n="Convert to Persona">
                                                            Convert to Persona
                                                        </option>
                                                        <option id="renameCharButton" data-i18n="Rename">
                                                            Rename
                                                        </option>
                                                        <option id="character_source" data-i18n="Link to Source">
                                                            Link to Source
                                                        </option>
                                                        <option id="replace_update" data-i18n="Replace / Update">
                                                            Replace / Update
                                                        </option>
                                                        <option id="import_tags" data-i18n="Import Tags">
                                                            Import Tags
                                                        </option>
                                                        <option id="character_action_export" className="character-detail-edit-action" data-i18n="Export and Download">
                                                            Export
                                                        </option>
                                                        <option id="character_action_duplicate" className="character-detail-edit-action" data-i18n="Duplicate Character">
                                                            Duplicate
                                                        </option>
                                                        <option id="delete_from_dropdown" className="red_button character-detail-edit-action" data-i18n="Delete Character">
                                                            Delete Character
                                                        </option>
                                                    </select>
                                                </label>
                                            </div>
                                            <div className="character-detail-hidden-actions" aria-hidden="true">
                                                <ContractIconButton id="advanced_div" className="menu_button" label="Advanced Definitions" nativeTitle title="Advanced Definitions" titleKey="Advanced Definition" icon={<i className="fa-solid fa-book" aria-hidden="true" />} />
                                                <ContractIconButton className="chat_lorebook_button menu_button" label="Chat Lore" nativeTitle title={"Chat Lore\n\nClick to load\nShift/Alt-click or long-press to open 'Link to Chat Lorebook' popup"} titleKey="chat_lorebook_button_title" icon={<i className="fa-solid fa-passport" aria-hidden="true" />} />
                                                <ContractIconButton id="char_connections_button" className="menu_button" label="Connected Personas" nativeTitle title="Connected Personas" icon={<i className="fa-solid fa-face-smile" aria-hidden="true" />} />
                                                <ContractIconButton id="export_button" className="menu_button" label="Export and Download" nativeTitle title="Export and Download" icon={<i className="fa-solid fa-file-export" aria-hidden="true" />} />
                                                {/* <ContractIconButton id="set_chat_character_settings" className="menu_button" label="Set a chat scenario override" nativeTitle title="Set a chat scenario override" icon={<i className="fa-solid fa-scroll" aria-hidden="true" />} /> */}
                                                {/* <ContractIconButton id="set_character_world" className="menu_button" label="Set a character World Info / Lorebook" nativeTitle title="Set a character World Info / Lorebook" icon={<i className="fa-solid fa-globe" aria-hidden="true" />} /> */}
                                                <ContractIconButton id="dupe_button" className="menu_button" label="Duplicate Character" nativeTitle title="Duplicate Character" icon={<i className="fa-solid fa-clone" aria-hidden="true" />} />
                                            </div>
                                        </div>
                                    </div>
                                    <div id="tags_div">
                                        <div className="tag_controls">
                                            <input id="tagInput" className="text_pole textarea_compact tag_input wide100p margin0" data-i18n="[placeholder]Search / Create Tags" placeholder="Search / Create tags" />
                                            <ContractIconButton className="tags_view menu_button" label="View all tags" title="View all tags" nativeTitle icon={<i className="fa-solid fa-tags" aria-hidden="true" />} />
                                        </div>
                                        <div id="tagList" className="tags"></div>
                                    </div>
                                </div>
                            </div>
                            <div id="spoiler_free_desc" className="inline-drawer flex-container flexFlowColumn flexNoGap character-detail-section character-detail-notes">
                                <div className="inline-drawer-toggle inline-drawer-header padding0 gap5px standoutHeader">
                                    <div id="creators_notes_div" className="title_restorable flexGap5 wide100p character-detail-section-header">
                                        <span className="flex1" data-i18n="Creator's Notes">Creator's Notes</span>
                                        <ContractIconButton id="creators_note_styles_button" className="margin0 menu_button" label="Allow / Forbid the use of global styles for this character." nativeTitle title="Allow / Forbid the use of global styles for this character." icon={<i className="fa-solid fa-palette fa-fw" aria-hidden="true" />} />
                                        <ContractIconButton id="spoiler_free_desc_button" className="margin0 menu_button" label="Show / Hide Description and First Message" nativeTitle title="Show / Hide Description and First Message" icon={<i className="fa-solid fa-eye fa-fw" aria-hidden="true" />} />
                                    </div>
                                    <div className="flex-container widthFitContent">
                                        <div className="inline-drawer-icon fa-solid fa-circle-chevron-down down interactable"></div>
                                    </div>
                                </div>
                                <div className="inline-drawer-content">
                                    <div id="creator_notes_spoiler"></div>
                                    <div id="creator_notes_empty" data-i18n="No Creator's Notes provided.">
                                        No Creator's Notes provided.
                                    </div>
                                </div>
                            </div>
                            <small id="creators_note_desc_hidden" data-i18n="Character details are hidden.">Character details are hidden.</small>
                            <div id="descriptionWrapper" className="flex-container flexFlowColumn flex1 character-detail-section">
                                <div id="description_div" className="title_restorable character-detail-section-header">
                                    <div className="flex-container alignitemscenter">
                                        <span data-i18n="Character Description" className="mdhotkey_location">Description</span>
                                        <ContractIconButton className="editor_maximize right_menu_button" data-for="description_textarea" label="Expand the editor" title="Expand the editor" nativeTitle icon={<i className="fa-solid fa-maximize" aria-hidden="true" />} />
                                        <a href="usage/core-concepts/characterdesign/#character-description" className="notes-link" target="_blank">
                                            <span className="fa-solid fa-circle-question note-link-span"></span>
                                        </a>
                                    </div>
                                    <div id="character_open_media_overrides" className="menu_button menu_button_icon open_media_overrides" title="Click to allow/forbid the use of external media for this character." aria-label="External media" data-i18n="[title]Click to allow/forbid the use of external media for this character.">
                                        <i id="character_media_allowed_icon" className="fa-solid fa-fw fa-link" />
                                        <i id="character_media_forbidden_icon" className="fa-solid fa-fw fa-link-slash" />
                                        <span data-i18n="Ext. Media">
                                            Ext. Media
                                        </span>
                                    </div>
                                </div>
                                <textarea id="description_textarea" className="mdHotkeys" data-macros data-i18n="[placeholder]Description" placeholder="Description" name="description"></textarea>
                                <div className="extension_token_counter">
                                    <span data-i18n="extension_token_counter">Tokens:</span> <span data-token-counter="description_textarea" data-token-permanent="true">counting...</span>
                                </div>
                            </div>
                            <div id="firstMessageWrapper" className="flex-container flexFlowColumn flex1 character-detail-section">
                                <div id="first_message_div" className="title_restorable character-detail-section-header">
                                    <div className="flex-container alignitemscenter flex1">
                                        <span data-i18n="First message" className="mdhotkey_location">First message</span>
                                        <ContractIconButton className="editor_maximize right_menu_button" data-for="firstmessage_textarea" label="Expand the editor" title="Expand the editor" nativeTitle icon={<i className="fa-solid fa-maximize" aria-hidden="true" />} />
                                        <a href="usage/core-concepts/characterdesign/#first-message" className="notes-link" target="_blank">
                                            <span className="fa-solid fa-circle-question note-link-span"></span>
                                        </a>
                                    </div>
                                    <ContractButton className="menu_button menu_button_icon open_alternate_greetings margin0" label="Alt. Greetings" ariaLabel="Alternate greetings" title="Click to set additional greeting messages" nativeTitle icon={<i className="fa-solid fa-message" aria-hidden="true" />} />
                                </div>
                                <textarea id="firstmessage_textarea" className="mdHotkeys" data-macros data-i18n="[placeholder]First message" placeholder="First message" name="first_mes"></textarea>
                                <div className="extension_token_counter">
                                    <span data-i18n="extension_token_counter">Tokens:</span> <span data-token-counter="firstmessage_textarea">counting...</span>
                                </div>
                            </div>
                            {/* these divs are invisible and used for server communication purposes */}
                            <div id="hidden-divs">
                                <input id="character_json_data" name="json_data" type="hidden" />
                                <input id="avatar_url_pole" name="avatar_url" type="hidden" />
                                <input id="selected_chat_pole" name="chat" type="hidden" />
                                <input id="create_date_pole" name="create_date" type="hidden" />
                                <input id="last_mes_pole" name="last_mes" type="hidden" />
                                <input id="character_world" name="world" type="hidden" />
                            </div>
                            {/* now back to normal divs for display purposes*/}
                        </form>
                    </div>
                    <div id="rm_character_import" className="right_menu" style={{ "display": "none" }}>
                        <form id="form_import" action="javascript:void(null);" method="post" encType="multipart/form-data">
                            <input multiple type="file" id="character_import_file" accept=".json, image/png, .yaml, .yml, .charx, .byaf" name="avatar" />
                            <input id="character_import_file_type" name="file_type" className="text_pole" defaultValue="" autoComplete="off" />
                        </form>
                        <input type="file" id="character_replace_file" accept=".json, image/png, .yaml, .yml, .charx, .byaf" name="replace_avatar" hidden />
                    </div>
                    <div name="Character List Panel" id="rm_characters_block" className="right_menu">
                        <div id="charListFixedTop">
                            <div id="rm_button_bar">
                                <div className="character-list-tool-group character-list-create-group">
                                    <ContractButton id="rm_button_create" className="menu_button character-list-action" label="New" labelKey="Character Toolbar New" labelClassName="character-list-action-label" ariaLabel="Create New Character" title="Create New Character" nativeTitle icon={<i className="fa-solid fa-user-plus" aria-hidden="true" />} />
                                    <ContractButton id="character_import_button" className="menu_button character-list-action" label="File" labelKey="Character Toolbar File" labelClassName="character-list-action-label" ariaLabel="Import Character from File" title="Import Character from File" nativeTitle icon={<i className="fa-solid fa-file-import" aria-hidden="true" />} />
                                    <ContractButton id="external_import_button" className="menu_button character-list-action" label="URL" labelKey="Character Toolbar URL" labelClassName="character-list-action-label" ariaLabel="Import content from external URL" title="Import content from external URL" nativeTitle icon={<i className="fa-solid fa-cloud-arrow-down" aria-hidden="true" />} />
                                    <div id="rm_buttons_container">
                                        {/* Container for additional buttons added by extensions */}
                                    </div>
                                </div>
                                <div className="character-list-tool-group character-list-sort-group">
                                    <label htmlFor="character_sort_order" className="character-list-sort-label" data-i18n="Character Toolbar Sort">Sort</label>
                                    <select id="character_sort_order" className="flex1 text_pole textarea_compact" title="Characters sorting order" data-i18n="[title]Characters sorting order">
                                        <option data-field="search" data-order="desc" data-i18n="Search" hidden>Search</option>
                                        <option data-field="name" data-order="asc" data-i18n="A-Z">A-Z</option>
                                        <option data-field="name" data-order="desc" data-i18n="Z-A">Z-A</option>
                                        <option data-field="create_date" data-order="desc" data-i18n="Newest">Newest</option>
                                        <option data-field="create_date" data-order="asc" data-i18n="Oldest">Oldest</option>
                                        <option data-field="fav" data-order="desc" data-rule="boolean" data-i18n="Favorites">Favorites</option>
                                        <option data-field="date_last_chat" data-order="desc" data-i18n="Recent">Recent</option>
                                        <option data-field="chat_size" data-order="desc" data-i18n="Most chats">Most chats</option>
                                        <option data-field="chat_size" data-order="asc" data-i18n="Least chats">Least chats</option>
                                        <option data-field="data_size" data-order="desc" data-i18n="Most tokens">Most tokens</option>
                                        <option data-field="data_size" data-order="asc" data-i18n="Least tokens">Least tokens</option>
                                        <option data-field="name" data-order="random" data-i18n="Random">Random</option>
                                    </select>
                                </div>
                                <div className="character-list-tool-group character-list-view-group">
                                    <ContractButton id="rm_button_search" className="right_menu_button character-list-action" label="Find" labelKey="Character Toolbar Find" labelClassName="character-list-action-label" ariaLabel="Toggle search bar" title="Toggle search bar" nativeTitle icon={<i className="fa-fw fa-solid fa-search" aria-hidden="true" />} />
                                    <ContractButton id="charListGridToggle" className="menu_button character-list-action" label="Grid" labelKey="Character Toolbar Grid" labelClassName="character-list-action-label" ariaLabel="Toggle character grid view" title="Toggle character grid view" nativeTitle icon={<i className="fa-solid fa-table-cells-large" aria-hidden="true" />} />
                                    <ContractButton id="bulkEditButton" className="menu_button bulkEditButton character-list-action" label="Bulk" labelKey="Character Toolbar Bulk" labelClassName="character-list-action-label" ariaLabel="Bulk edit characters" title={"Bulk edit characters\r\rClick to toggle characters\rShift + Click to select/deselect a range of characters\rRight-click for actions"} titleKey="Bulk_edit_characters" nativeTitle tabIndex={0} icon={<i className="fa-solid fa-edit" aria-hidden="true" />} />
                                </div>
                                <div className="character-list-tool-group character-list-bulk-actions" aria-live="polite">
                                    <span id="bulkSelectionHint" className="bulkEditOptionElement character-list-bulk-hint" data-i18n="Click character cards to select" style={{ "display": "none" }}>Click character cards to select</span>
                                    <div id="bulkSelectedCount" className="bulkEditOptionElement paginationjs-nav" style={{ "display": "none" }} role="status"></div>
                                    <ContractButton id="bulkSelectAllButton" className="menu_button bulkEditOptionElement bulkSelectAllButton character-list-action" label="All" labelKey="Character Toolbar All" labelClassName="character-list-action-label" ariaLabel="Bulk select all characters" title="Bulk select all characters" nativeTitle style={{ "display": "none" }} icon={<i className="fa-solid fa-check-double" aria-hidden="true" />} />
                                    <ContractButton id="bulkDeleteButton" className="menu_button bulkEditOptionElement bulkDeleteButton character-list-action" label="Del" labelKey="Character Toolbar Delete" labelClassName="character-list-action-label" ariaLabel="Bulk delete characters" title="Bulk delete characters" nativeTitle style={{ "display": "none" }} icon={<i className="fa-solid fa-trash" aria-hidden="true" />} />
                                </div>
                            </div>
                            <div id="form_character_search_form">
                                <input id="character_search_bar" className="text_pole textarea_compact width100p" type="search" data-i18n="[placeholder]Search..." placeholder="Search..." />
                                <div id="character_search_status" className="character_search_status" data-i18n="Filtering characters…" aria-live="polite" hidden>Filtering characters…</div>
                            </div>
                            <div className="rm_tag_controls">
                                <div className="tags rm_tag_filter"></div>
                                <div className="tags rm_tag_bogus_drilldown"></div>
                            </div>
                        </div>

                        <div id="rm_print_characters_pagination">
                        </div>
                        <div id="rm_print_characters_block" className="flexFlowColumn"></div>
                    </div>
                </div>
        </>
    );
}
