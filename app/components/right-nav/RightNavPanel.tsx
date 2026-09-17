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
                <div id="right-nav-panelheader" className="fa-solid fa-grip drag-grabber">
                </div>
                <div id="CharListButtonAndHotSwaps" className="flex-container flexnowrap">
                    <div className="flexFlowColumn flex-container">
                        <div id="rm_button_panel_pin_div" className="alignitemsflexstart" title="Locked = Character Management panel will stay open" data-i18n="[title]Locked = Character Management panel will stay open">
                            <input type="checkbox" id="rm_button_panel_pin" />
                            <label htmlFor="rm_button_panel_pin">
                                <div className="fa-solid unchecked fa-unlock right_menu_button"></div>
                                <div className="fa-solid checked fa-lock right_menu_button"></div>
                            </label>
                        </div>
                        <div className="right_menu_button fa-solid fa-list-ul" id="rm_button_characters" title="Select/Create Characters" data-i18n="[title]Select/Create Characters;[aria-label]Characters" role="button" aria-label="Characters" tabIndex={0}></div>
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
                            <i title="Click for stats!" data-i18n="[title]Click for stats!" className="fa-solid fa-ranking-star right_menu_button rm_stats_button" />
                            <i title="Toggle character info panel" data-i18n="[title]Toggle character info panel" id="hideCharPanelAvatarButton" className="fa-solid fa-eye right_menu_button" />
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
                                                <div id="rm_button_back" className="menu_button fa-solid fa-left-long "></div>
                                                {/* <div id="renameCharButton" className="menu_button fa-solid fa-user-pen" title="Rename Character"></div> */}
                                                <div className="character-detail-action-icons">
                                                    <div id="favorite_button" className="menu_button fa-solid fa-star" title="Add to Favorites" data-i18n="[title]Add to Favorites"></div>
                                                    <div id="world_button" className="menu_button fa-solid fa-globe" title={"Character Lore\n\nClick to load\nShift/Alt-click or long-press to open 'Link to World Info' popup"} data-i18n="[title]world_button_title"></div>
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
                                                        <option id="set_as_assistant" data-i18n="Set / Unset as Welcome Page Assistant">
                                                            Set / Unset as Welcome Page Assistant
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
                                                <div id="advanced_div" className="menu_button fa-solid fa-book " title="Advanced Definitions" data-i18n="[title]Advanced Definition"></div>
                                                <div className="chat_lorebook_button menu_button fa-solid fa-passport" title={"Chat Lore\n\nClick to load\nShift/Alt-click or long-press to open 'Link to Chat Lorebook' popup"} data-i18n="[title]chat_lorebook_button_title"></div>
                                                <div id="char_connections_button" className="menu_button fa-solid fa-face-smile" title="Connected Personas" data-i18n="[title]Connected Personas"></div>
                                                <div id="export_button" className="menu_button fa-solid fa-file-export " title="Export and Download" data-i18n="[title]Export and Download"></div>
                                                {/* <div id="set_chat_character_settings" className="menu_button fa-solid fa-scroll" title="Set a chat scenario override"></div> */}
                                                {/* <div id="set_character_world" className="menu_button fa-solid fa-globe" title="Set a character World Info / Lorebook"></div> */}
                                                <div id="dupe_button" className="menu_button fa-solid fa-clone " title="Duplicate Character" data-i18n="[title]Duplicate Character"></div>
                                            </div>
                                        </div>
                                    </div>
                                    <div id="tags_div">
                                        <div className="tag_controls">
                                            <input id="tagInput" className="text_pole textarea_compact tag_input wide100p margin0" data-i18n="[placeholder]Search / Create Tags" placeholder="Search / Create tags" />
                                            <div className="tags_view menu_button fa-solid fa-tags" title="View all tags" data-i18n="[title]View all tags"></div>
                                        </div>
                                        <div id="tagList" className="tags"></div>
                                    </div>
                                </div>
                            </div>
                            <div id="spoiler_free_desc" className="inline-drawer flex-container flexFlowColumn flexNoGap character-detail-section character-detail-notes">
                                <div className="inline-drawer-toggle inline-drawer-header padding0 gap5px standoutHeader">
                                    <div id="creators_notes_div" className="title_restorable flexGap5 wide100p character-detail-section-header">
                                        <span className="flex1" data-i18n="Creator's Notes">Creator's Notes</span>
                                        <div id="creators_note_styles_button" className="margin0 menu_button fa-solid fa-palette fa-fw" title="Allow / Forbid the use of global styles for this character." data-i18n="[title]Allow / Forbid the use of global styles for this character."></div>
                                        <div id="spoiler_free_desc_button" className="margin0 menu_button fa-solid fa-eye fa-fw" title="Show / Hide Description and First Message" data-i18n="[title]Show / Hide Description and First Message"></div>
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
                                        <i className="editor_maximize fa-solid fa-maximize right_menu_button" data-for="description_textarea" title="Expand the editor" data-i18n="[title]Expand the editor" />
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
                                        <i className="editor_maximize fa-solid fa-maximize right_menu_button" data-for="firstmessage_textarea" title="Expand the editor" data-i18n="[title]Expand the editor" />
                                        <a href="usage/core-concepts/characterdesign/#first-message" className="notes-link" target="_blank">
                                            <span className="fa-solid fa-circle-question note-link-span"></span>
                                        </a>
                                    </div>
                                    <div className="menu_button menu_button_icon open_alternate_greetings margin0 fa-solid fa-message" title="Click to set additional greeting messages" aria-label="Alternate greetings" data-i18n="[title]Click to set additional greeting messages">
                                        <span data-i18n="Alt. Greetings">
                                            Alt. Greetings
                                        </span>
                                    </div>
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
                                    <div id="rm_button_create" title="Create New Character" data-i18n="[title]Create New Character" className="menu_button fa-solid fa-user-plus character-list-action" role="button" aria-label="Create New Character"><span className="character-list-action-label" data-i18n="Character Toolbar New">New</span></div>
                                    <div id="character_import_button" title="Import Character from File" data-i18n="[title]Import Character from File" className="menu_button fa-solid fa-file-import character-list-action" role="button" aria-label="Import Character from File"><span className="character-list-action-label" data-i18n="Character Toolbar File">File</span></div>
                                    <div id="external_import_button" title="Import content from external URL" data-i18n="[title]Import content from external URL" className="menu_button fa-solid fa-cloud-arrow-down character-list-action" role="button" aria-label="Import content from external URL"><span className="character-list-action-label" data-i18n="Character Toolbar URL">URL</span></div>
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
                                    <div id="rm_button_search" className="right_menu_button fa-fw fa-solid fa-search character-list-action" title="Toggle search bar" data-i18n="[title]Toggle search bar" role="button" aria-label="Toggle search bar"><span className="character-list-action-label" data-i18n="Character Toolbar Find">Find</span></div>
                                    <i id="charListGridToggle" className="fa-solid fa-table-cells-large menu_button character-list-action" title="Toggle character grid view" data-i18n="[title]Toggle character grid view" role="button" aria-label="Toggle character grid view"><span className="character-list-action-label" data-i18n="Character Toolbar Grid">Grid</span></i>
                                    <i id="bulkEditButton" className="fa-solid fa-edit menu_button bulkEditButton character-list-action" title={"Bulk edit characters\r\rClick to toggle characters\rShift + Click to select/deselect a range of characters\rRight-click for actions"} data-i18n="[title]Bulk_edit_characters" role="button" aria-label="Bulk edit characters" tabIndex={0}><span className="character-list-action-label" data-i18n="Character Toolbar Bulk">Bulk</span></i>
                                </div>
                                <div className="character-list-tool-group character-list-bulk-actions" aria-live="polite">
                                    <span id="bulkSelectionHint" className="bulkEditOptionElement character-list-bulk-hint" data-i18n="Click character cards to select" style={{ "display": "none" }}>Click character cards to select</span>
                                    <div id="bulkSelectedCount" className="bulkEditOptionElement paginationjs-nav" style={{ "display": "none" }} role="status"></div>
                                    <i id="bulkSelectAllButton" className="fa-solid fa-check-double menu_button bulkEditOptionElement bulkSelectAllButton character-list-action" title="Bulk select all characters" data-i18n="[title]Bulk select all characters" style={{ "display": "none" }} role="button" aria-label="Bulk select all characters"><span className="character-list-action-label" data-i18n="Character Toolbar All">All</span></i>
                                    <i id="bulkDeleteButton" className="fa-solid fa-trash menu_button bulkEditOptionElement bulkDeleteButton character-list-action" title="Bulk delete characters" data-i18n="[title]Bulk delete characters" style={{ "display": "none" }} role="button" aria-label="Bulk delete characters"><span className="character-list-action-label" data-i18n="Character Toolbar Delete">Del</span></i>
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
