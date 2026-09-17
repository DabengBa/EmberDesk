export function PowerUserPanel() {
    return (
        <>
                <div className="flex-container flexFlowColumn">
                    <div name="userSettingsRowOne" className="flex-container flexFlowRow alignitemscenter spaceBetween">
                        <div className="flex-container">
                            <div className="flex-container flexnowrap alignItemsBaseline">
                                <h3 className="margin0">
                                    <span data-i18n="User Settings">User Settings</span>

                                    <a href="usage/user-settings/" className="notes-link" target="_blank">
                                        <span className="fa-solid fa-circle-question note-link-span"></span>
                                    </a>
                                </h3>
                            </div>
                        </div>
                        <div id="UI-language-block" className="flex-container alignItemsBaseline">
                            <span data-i18n="UI Language">Language:</span>
                            <select id="ui_language_select" className="flex1 margin0 text_pole">
                                <option value="" data-i18n="Default">Default</option>
                                <option value="en">English</option>
                            </select>
                        </div>
                        <small id="version_display"></small>
                    </div>
                    <div name="UserSettingsRowTwo" className="flex-container flexFlowRow">
                        <div id="account_controls" className="flex-container">
                            <div id="account_button" className="margin0 menu_button_icon menu_button">
                                <i className="fa-fw fa-solid fa-user-shield"  />
                                <span data-i18n="Account">Account</span>
                            </div>
                            <div id="admin_button" className="margin0 menu_button_icon menu_button">
                                <i className="fa-fw fa-solid fa-user-tie"  />
                                <span data-i18n="Admin Panel">Admin Panel</span>
                            </div>
                            <div id="logout_button" className="margin0 menu_button_icon menu_button">
                                <i className="fa-fw fa-solid fa-right-from-bracket"  />
                                <span data-i18n="Logout">Logout</span>
                            </div>
                        </div>
                        <textarea id="settingsSearch" className="textarea_compact flex1" rows={1} placeholder="Search Settings" data-i18n="[placeholder]Search Settings"></textarea>
                    </div>
                </div>
                <div id="user-settings-block-content" className="flex-container spaceEvenly">
                    <div name="UserSettingsFirstColumn" id="UI-Theme-Block" className="flex-container flexFlowColumn wide100p flex1">
                        <div id="UI-presets-block" className="flex-container flexFlowColumn">
                            <h4 className="title_restorable">
                                <span data-i18n="UI Theme">UI Theme</span>
                                <div className="flex-container">
                                    <div id="ui_preset_import_button" className="menu_button menu_button_icon margin0" title="Import a theme file" data-i18n="[title]Import a theme file">
                                        <i className="fa-solid fa-file-import"  />
                                    </div>
                                    <div id="ui_preset_export_button" className="menu_button menu_button_icon margin0" title="Export a theme file" data-i18n="[title]Export a theme file">
                                        <i className="fa-solid fa-file-export"  />
                                    </div>
                                    <div id="ui-preset-delete-button" className="menu_button menu_button_icon margin0" title="Delete a theme" data-i18n="[title]Delete a theme">
                                        <i className="fa-solid fa-trash-can"  />
                                    </div>
                                </div>
                                <input type="file" id="ui_preset_import_file" accept=".json" hidden />
                            </h4>
                            <div className="flex-container flexnowrap alignitemscenter">
                                <select id="themes" className="margin0">
                                </select>
                                <div id="ui-preset-update-button" title="Update a theme file" data-i18n="[title]Update a theme file" className="menu_button margin0">
                                    <i className="fa-solid fa-save"  />
                                </div>
                                <div id="ui-preset-save-button" title="Save as a new theme" data-i18n="[title]Save as a new theme" className="menu_button margin0">
                                    <i className="fa-solid fa-file-circle-plus"  />
                                </div>
                            </div>
                        </div>
                        <div name="themeElements" className="flex-container flexFlowColumn flexNoGap">
                            {/* <h4><span data-i18n="UI Colors">Theme Settings</span></h4> */}
                            <div name="AvatarAndChatDisplay" className="flex-container flexFlowColumn">
                                <div className="flex-container alignItemsBaseline" title="This style applies to all avatars globaly, including your Persona, Character Management, Account selection, etc." data-i18n="[title]This style applies to all avatars globaly, including your Persona, Character Management, Account selection, etc.">
                                    <span data-i18n="Avatar Style:">Avatars:</span>
                                    <select id="avatar_style" className="widthNatural flex1 margin0 text_pole">
                                        <option value="0" data-i18n="Circle">Circle</option>
                                        <option value="2" data-i18n="Square">Square</option>
                                        <option value="3" data-i18n="Rounded">Rounded</option>
                                        <option value="1" data-i18n="Rectangle">Rectangle</option>
                                    </select>
                                </div>
                                <div className="flex-container alignItemsBaseline">
                                    <span data-i18n="Chat Style:">Chat Style:</span>
                                    <select id="chat_display" className="widthNatural flex1 margin0 text_pole">
                                        <option value="0" data-i18n="Flat">Flat</option>
                                        <option value="1" data-i18n="Bubbles">Bubbles</option>
                                        <option value="2" data-i18n="Document">Document</option>
                                    </select>
                                </div>
                                <div className="flex-container alignitemscenter" title="Default display style for media attachments in chat messages. Extensions can override this setting." data-i18n="[title]Default display style for media attachments in chat messages. Extensions can override this setting.">
                                    <span data-i18n="Media Style:">Media Style:</span>
                                    <select id="media_display" className="widthNatural flex1 margin0 text_pole">
                                        <option value="list" data-i18n="List">List</option>
                                        <option value="gallery" data-i18n="Gallery">Gallery</option>
                                    </select>
                                </div>
                                <div className="flex-container alignItemsBaseline">
                                    <span data-i18n="Notifications:">Notifications:</span>
                                    <select id="toastr_position" className="widthNatural flex1 margin0 text_pole">
                                        <option value="toast-top-left" data-i18n="Top Left">Top Left</option>
                                        <option value="toast-top-center" data-i18n="Top Center">Top Center</option>
                                        <option value="toast-top-right" data-i18n="Top Right">Top Right</option>
                                        <option value="toast-bottom-left" data-i18n="Bottom Left">Bottom Left</option>
                                        <option value="toast-bottom-center" data-i18n="Bottom Center">Bottom Center</option>
                                        <option value="toast-bottom-right" data-i18n="Bottom Right">Bottom Right</option>
                                    </select>
                                </div>
                            </div>
                            <div className="inline-drawer wide100p flexFlowColumn">
                                <div className="inline-drawer-toggle inline-drawer-header userSettingsInnerExpandable" title="Specify colors for your theme." data-i18n="[title]Specify colors for your theme.">
                                    <b><span data-i18n="Theme Colors">Theme Colors</span></b>
                                    <div className="fa-solid fa-circle-chevron-down inline-drawer-icon down"></div>
                                </div>
                                <div className="inline-drawer-content">
                                    <div id="color-picker-block" className="flex-container flexFlowColumn flexNoGap">
                                        <div className="flex-container">
                                            <toolcool-color-picker id="main-text-color-picker"></toolcool-color-picker>
                                            <span data-i18n="Main Text">Main Text</span>
                                        </div>
                                        <div className="flex-container">
                                            <toolcool-color-picker id="italics-color-picker"></toolcool-color-picker>
                                            <span data-i18n="Italics Text">Italics Text</span>
                                        </div>
                                        <div className="flex-container">
                                            <toolcool-color-picker id="underline-color-picker"></toolcool-color-picker>
                                            <span data-i18n="Underlined Text">Underlined Text</span>
                                        </div>
                                        <div className="flex-container">
                                            <toolcool-color-picker id="quote-color-picker"></toolcool-color-picker>
                                            <span data-i18n="Quote Text">Quote Text</span>
                                        </div>
                                        <div className="flex-container">
                                            <toolcool-color-picker id="shadow-color-picker"></toolcool-color-picker>
                                            <span data-i18n="Shadow Color">Text Shadow</span>
                                        </div>
                                        <div className="flex-container">
                                            <toolcool-color-picker id="chat-tint-color-picker"></toolcool-color-picker>
                                            <span data-i18n="Chat Background">Chat Background</span>
                                        </div>
                                        <div className="flex-container">
                                            <toolcool-color-picker id="blur-tint-color-picker"></toolcool-color-picker>
                                            <span data-i18n="UI Background">UI Background</span>
                                        </div>
                                        <div className="flex-container">
                                            <toolcool-color-picker id="border-color-picker"></toolcool-color-picker>
                                            <span data-i18n="UI Border">UI Border</span>
                                        </div>
                                        <div className="flex-container">
                                            <toolcool-color-picker id="user-mes-blur-tint-color-picker"></toolcool-color-picker>
                                            <span data-i18n="User Message Blur Tint">User Message</span>
                                        </div>
                                        <div className="flex-container">
                                            <toolcool-color-picker id="bot-mes-blur-tint-color-picker"></toolcool-color-picker>
                                            <span data-i18n="AI Message Blur Tint">AI Message</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <hr />
                            <div name="FontBlurChatWidthBlock" className="flex-container">

                                <div className="alignitemscenter flex-container flexFlowColumn flexBasis48p flexGrow flexShrink gap0">
                                    <small>
                                        <span>
                                            <span data-i18n="Chat Width">Chat Width</span>
                                            <i className="fa-solid fa-desktop"  />
                                        </span>
                                        <div className="fa-solid fa-circle-info opacity50p" data-i18n="[title]Width of the main chat window in % of screen width" title="Width of the main chat window in % of screen width"></div>
                                    </small>
                                    <input className="neo-range-slider" type="range" id="chat_width_slider" name="chat_width_slider" min="25" max="100" step="1" />
                                    <input className="neo-range-input" type="number" min="25" max="100" step="1" data-for="chat_width_slider" id="chat_width_slider_counter" />
                                </div>

                                <div className="alignitemscenter flex-container flexFlowColumn flexBasis48p flexGrow flexShrink gap0">
                                    <small>
                                        <span data-i18n="Font Scale">Font Scale</span>
                                        <div className="fa-solid fa-circle-info opacity50p" data-i18n="[title]Font size" title="Font size"></div>
                                    </small>
                                    <input className="neo-range-slider" type="range" id="font_scale" name="font_scale" min="0.5" max="1.5" step="0.01" />
                                    <input className="neo-range-input" type="number" min="0.5" max="1.5" step="0.01" data-for="font_scale" id="font_scale_counter" />
                                </div>

                                <div className="alignitemscenter flex-container flexFlowColumn flexBasis48p flexGrow flexShrink gap0">
                                    <small>
                                        <span data-i18n="Blur Strength">Blur Strength</span>
                                        <div className="fa-solid fa-circle-info opacity50p" data-i18n="[title]Blur strength on UI panels." title="Blur strength on UI panels."></div>
                                    </small>
                                    <input className="neo-range-slider" type="range" id="blur_strength" name="blur_strength" min="0" max="30" step="1" />
                                    <input className="neo-range-input" type="number" min="0" max="30" step="1" data-for="blur_strength" id="blur_strength_counter" />
                                </div>

                                <div className="alignitemscenter flex-container flexFlowColumn flexBasis48p flexGrow flexShrink gap0">
                                    <small>
                                        <span data-i18n="Text Shadow Width">Shadow Width</span>
                                        <div className="fa-solid fa-circle-info opacity50p" data-i18n="[title]Strength of the text shadows" title="Strength of the text shadows"></div>
                                    </small>
                                    <input className="neo-range-slider" type="range" id="shadow_width" name="shadow_width" min="0" max="5" step="1" />
                                    <input className="neo-range-input" type="number" min="0" max="5" step="1" data-for="shadow_width" id="shadow_width_counter" />
                                </div>
                            </div>
                            <hr />
                            <div name="themeToggles">
                                {/* <h4 data-i18n="Theme Toggles">Theme Toggles</h4> */}

                                <label htmlFor="reduced_motion" className="checkbox_label" title="Disable animations and transitions" data-i18n="[title]Disables animations and transitions">
                                    <input id="reduced_motion" type="checkbox" />
                                    <small data-i18n="Reduced Motion">Reduced Motion</small>
                                </label>
                                <label htmlFor="fast_ui_mode" className="checkbox_label" title="Remove blur from window backgrounds, for faster rendering." data-i18n="[title]removes blur from window backgrounds">
                                    <input id="fast_ui_mode" type="checkbox" />
                                    <small data-i18n="No Blur Effect">No Blur Effect</small>
                                </label>
                                <label htmlFor="noShadowsmode" className="checkbox_label" title="Remove text shadow effect." data-i18n="[title]Remove text shadow effect">
                                    <input id="noShadowsmode" type="checkbox" />
                                    <small data-i18n="No Text Shadows">No Text Shadows</small>
                                </label>
                                <label htmlFor="expandMessageActions" className="checkbox_label" title="Always show the full list of the Message Actions context items for chat messages, instead of hiding them behind '...'." data-i18n="[title]Always show the full list of the Message Actions context items for chat messages, instead of hiding them behind '...'">
                                    <input id="expandMessageActions" type="checkbox" />
                                    <small data-i18n="Auto-Expand Message Actions">Expand Message Actions</small>
                                </label>
                                <label htmlFor="enableZenSliders" className="checkbox_label" title="Alternative UI for numeric sampling parameters with fewer steps." data-i18n="[title]Alternative UI for numeric sampling parameters with fewer steps">
                                    <input id="enableZenSliders" type="checkbox" />
                                    <small data-i18n="Zen Sliders">Zen Sliders</small>
                                </label>
                                <label htmlFor="enableLabMode" className="checkbox_label" title="Entirely unrestrict all numeric sampling parameters." data-i18n="[title]Entirely unrestrict all numeric sampling parameters">
                                    <input id="enableLabMode" type="checkbox" />
                                    <small data-i18n="Mad Lab Mode">Mad Lab Mode</small>
                                </label>
                                <label htmlFor="messageTimerEnabled" className="checkbox_label" title="Time the AI's message generation, and show the duration in the chat log." data-i18n="[title]Time the AI's message generation, and show the duration in the chat log">
                                    <input id="messageTimerEnabled" type="checkbox" />
                                    <small data-i18n="Message Timer">Message Timer</small>
                                </label>
                                <label htmlFor="messageTimestampsEnabled" className="checkbox_label" title="Show a timestamp for each message in the chat log." data-i18n="[title]Show a timestamp for each message in the chat log">
                                    <input id="messageTimestampsEnabled" type="checkbox" />
                                    <small data-i18n="Chat Timestamps">Chat Timestamps</small>
                                </label>
                                <label htmlFor="messageModelIconEnabled" className="checkbox_label" title="Show an icon for the API that generated the message." data-i18n="[title]Show an icon for the API that generated the message">
                                    <input id="messageModelIconEnabled" type="checkbox" />
                                    <small data-i18n="Model Icon">Model Icons</small>
                                </label>
                                <label htmlFor="mesIDDisplayEnabled" className="checkbox_label" title="Show sequential message numbers in the chat log." data-i18n="[title]Show sequential message numbers in the chat log">
                                    <input id="mesIDDisplayEnabled" type="checkbox" />
                                    <small data-i18n="Message IDs">Message IDs</small>
                                </label>
                                <label htmlFor="hideChatAvatarsEnabled" className="checkbox_label" title="Hide avatars, only in chat messages." data-i18n="[title]Hide avatars, only in chat messages.">
                                    <input id="hideChatAvatarsEnabled" type="checkbox" />
                                    <small data-i18n="Hide Chat Avatars">Hide Chat Avatars</small>
                                </label>
                                <label htmlFor="messageTokensEnabled" className="checkbox_label" title="Show the number of tokens for each message in the chat log." data-i18n="[title]Show the number of tokens in each message in the chat log">
                                    <input id="messageTokensEnabled" type="checkbox" />
                                    <small data-i18n="Show Message Token Count">Message Token Count</small>
                                </label>
                                <label htmlFor="compact_input_area" className="checkbox_label" title="Single-row message input area. Mobile only, no effect on PC." data-i18n="[title]Single-row message input area. Mobile only, no effect on PC">
                                    <input id="compact_input_area" type="checkbox" />
                                    <small data-i18n="Compact Input Area (Mobile)">Compact Input Area</small><i className="fa-solid fa-mobile-screen-button"  />
                                </label>
                                <label htmlFor="show_swipe_num_all_messages" className="checkbox_label" title="Display swipe numbers for all messages, not just the last." data-i18n="[title]Display swipe numbers for all messages, not just the last.">
                                    <input id="show_swipe_num_all_messages" type="checkbox" />
                                    <small data-i18n="Swipe # for All Messages">Swipe # for All Messages</small>
                                </label>
                                <label htmlFor="hotswapEnabled" className="checkbox_label" title="In the Character Management panel, show quick selection buttons for favorited characters." data-i18n="[title]In the Character Management panel, show quick selection buttons for favorited characters">
                                    <input id="hotswapEnabled" type="checkbox" />
                                    <small data-i18n="Characters Hotswap">Characters Hotswap</small>
                                </label>
                                <label htmlFor="zoomed_avatar_magnification" className="checkbox_label" title="Enable magnification for zoomed avatar display." data-i18n="[title]Enable magnification for zoomed avatar display.">
                                    <input id="zoomed_avatar_magnification" type="checkbox" />
                                    <small data-i18n="Avatar Hover Magnification">Avatar Hover Magnification</small>
                                    <i title="Enables a magnification effect on hover when you display the zoomed avatar after clicking an avatar's image in chat." data-i18n="[title]Enables a magnification effect on hover when you display the zoomed avatar after clicking an avatar's image in chat." className="right_menu_button fa-solid fa-circle-exclamation"  />
                                </label>
                                <label htmlFor="bogus_folders" className="checkbox_label" title="Show tagged character folders in the character list." data-i18n="[title]Show tagged character folders in the character list">
                                    <input id="bogus_folders" type="checkbox" />
                                    <small data-i18n="Tags as Folders">Tags as Folders</small>
                                    <i title="Recent change: Tags must be marked as folders in the Tag Management menu to appear as such. Click here to bring it up." data-i18n="[title]Tags_as_Folders_desc" className="tags_view right_menu_button fa-solid fa-circle-exclamation"  />
                                </label>
                                <label htmlFor="click_to_edit" className="checkbox_label" title="Click the message text in the chat log to edit it." data-i18n="[title]Click the message text in the chat log to edit it.">
                                    <input id="click_to_edit" type="checkbox" />
                                    <small data-i18n="Click to Edit">Click to Edit</small>
                                </label>
                            </div>
                        </div>
                    </div>
                    <div name="UserSettingsSecondColumn" id="UI-Customization" className="flex-container flexFlowColumn wide100p flexNoGap flex1">
                        <div name="CharacterHandlingToggles">
                            <h4 data-i18n="Character Handling">
                                Character Handling
                            </h4>
                            <div className="flex-container alignitemscenter" title="If set in the advanced character definitions, this field will be displayed in the characters list." data-i18n="[title]If set in the advanced character definitions, this field will be displayed in the characters list.">
                                <label htmlFor="aux_field"><small data-i18n="Char List Subheader">Char List Subheader</small></label>
                                <select id="aux_field" className="widthNatural flex1 margin0">
                                    <option data-i18n="Character Version" value="character_version">Character Version</option>
                                    <option data-i18n="Created by" value="creator">Created by</option>
                                </select>
                            </div>
                            <div className="flex-container alignitemscenter" title="Defines on importing cards which action should be chosen for importing its listed tags. 'Ask' will always display the dialog." data-i18n="[title]Defines on importing cards which action should be chosen for importing its listed tags. 'Ask' will always display the dialog.">
                                <label htmlFor="tag_import_setting"><small data-i18n="Import Card Tags">Import Card Tags</small></label>
                                <select id="tag_import_setting" className="widthNatural flex1 margin0">
                                    <option data-i18n="Ask" value="1">Ask</option>
                                    <option data-i18n="tag_import_none" value="2">None</option>
                                    <option data-i18n="tag_import_all" value="3">All</option>
                                    <option data-i18n="tag_import_existing" value="4">Existing</option>
                                </select>
                            </div>
                            <label className="checkbox_label" htmlFor="fuzzy_search_checkbox" title="Use fuzzy matching, and search characters in the list by all data fields, not just by a name substring." data-i18n="[title]Use fuzzy matching, and search characters in the list by all data fields, not just by a name substring">
                                <input id="fuzzy_search_checkbox" type="checkbox" />
                                <small data-i18n="Advanced Character Search">Advanced Character Search</small>
                            </label>
                            <label htmlFor="prefer_character_prompt" title="If checked and the character card contains a prompt override (System Prompt), use that instead." data-i18n="[title]If checked and the character card contains a prompt override (System Prompt), use that instead" className="checkbox_label">
                                <input id="prefer_character_prompt" type="checkbox" />
                                <small data-i18n="Prefer Character Card Prompt">Prefer Char. Prompt</small>
                            </label>
                            <label htmlFor="prefer_character_jailbreak" title="If checked and the character card contains a Post-History Instructions override, use that instead." data-i18n="[title]If checked and the character card contains a Post-History Instructions override, use that instead" className="checkbox_label">
                                <input id="prefer_character_jailbreak" type="checkbox" />
                                <small data-i18n="Prefer Character Card Instructions">Prefer Char. Instructions</small>
                            </label>
                            <label className="checkbox_label" htmlFor="never_resize_avatars" title={'Avoid cropping and resizing imported character images. When off, crop/resize to 512x768.\nThis will disable the upload cropping popup for avatars.'} data-i18n="[title]never_resize_avatars_tooltip">
                                <input id="never_resize_avatars" type="checkbox" />
                                <small data-i18n="Never resize avatars">Never resize avatars</small>
                            </label>
                            <label className="checkbox_label" htmlFor="show_card_avatar_urls" title="Show actual file names on the disk, in the characters list display only." data-i18n="[title]Show actual file names on the disk, in the characters list display only">
                                <input id="show_card_avatar_urls" type="checkbox" />
                                <small data-i18n="Show avatar filenames">Show avatar filenames</small>
                            </label>
                            <label className="checkbox_label" htmlFor="spoiler_free_mode" title="Hide character definitions from the editor panel behind a spoiler button." data-i18n="[title]Hide character definitions from the editor panel behind a spoiler button">
                                <input id="spoiler_free_mode" type="checkbox" />
                                <small data-i18n="Spoiler Free Mode">Spoiler Free Mode</small>
                            </label>

                        </div>

                        <div name="MiscellaneousToggles">
                            <h4><span data-i18n="Miscellaneous">Miscellaneous</span></h4>
                            <div className="flex-container flexGap2">
                                <div id="reload_chat" className="menu_button whitespacenowrap" data-i18n="[title]Reload and redraw the currently open chat" title="Reload and redraw the currently open chat.">
                                    <small data-i18n="Reload Chat">Reload Chat</small>
                                </div>
                                <div id="debug_menu" className="menu_button whitespacenowrap">
                                    <small data-i18n="Debug Menu">Debug Menu</small>
                                </div>
                                <div id="data_maid_button" className="menu_button whitespacenowrap" title="Find and delete backups, unused chats, files, images, etc." data-i18n="[title]Find and delete backups, unused chats, files, images, etc.">
                                    <small data-i18n="Clean-Up">Clean-Up</small>
                                </div>
                            </div>
                            <label id="smooth_streaming_control" className="checkbox_label" htmlFor="smooth_streaming">
                                <input id="smooth_streaming" type="checkbox" />
                                <div className="flex-container alignItemsBaseline">
                                    <small data-i18n="Smooth Streaming">
                                        Smooth Streaming
                                    </small>
                                </div>
                            </label>
                            <label id="smooth_streaming_no_think_control" className="checkbox_label" htmlFor="smooth_streaming_no_think" title="Bypass smooth streaming in reasoning blocks." data-i18n="[title]Bypass smooth streaming in reasoning blocks.">
                                <input id="smooth_streaming_no_think" type="checkbox" />
                                <small data-i18n="Exclude 'Thinking...'">
                                    Exclude 'Thinking...'
                                </small>
                            </label>
                            <div id="smooth_streaming_speed_control" className="wide100p">
                                <input type="range" id="smooth_streaming_speed" name="smooth_streaming_speed" min="0" max="100" step="10" defaultValue="50" />
                                <div className="slider_hint">
                                    <span data-i18n="Slow">Slow</span>
                                    <span></span>
                                    <span data-i18n="Fast">Fast</span>
                                </div>
                            </div>
                            <label className="checkbox_label" htmlFor="stream_fade_in" title="Fade in streamed text when it appears, instead of it just popping in." data-i18n="[title]Fade in streamed text when it appears, instead of it just popping in">
                                <input id="stream_fade_in" type="checkbox" />
                                <small data-i18n="Stream Fade-In">Stream Fade-In</small>
                                <i className="fa-solid fa-flask" data-i18n="[title]Experimental feature. May not work for all backends." title="Experimental feature. May not work for all backends."  />
                            </label>

                            <label htmlFor="play_message_sound" className="checkbox_label" title="Play a sound when a message generation finishes." data-i18n="[title]Play a sound when a message generation finishes">
                                <input id="play_message_sound" type="checkbox" />
                                <audio id="audio_message_sound" src="sounds/message.mp3" hidden></audio>
                                <span>
                                    <small data-i18n="Message Sound">Message Sound</small>
                                </span>
                            </label>
                            <label htmlFor="play_sound_unfocused" className="checkbox_label" title="Only play a sound when ST's browser tab is unfocused." data-i18n="[title]Only play a sound when ST's browser tab is unfocused">
                                <input id="play_sound_unfocused" type="checkbox" />
                                <small data-i18n="Background Sound Only">Background Sound Only</small>
                            </label>
                            <label className="checkbox_label" htmlFor="relaxed_api_urls" title="Reduce the formatting requirements on API URLs." data-i18n="[title]Reduce the formatting requirements on API URLs">
                                <input id="relaxed_api_urls" type="checkbox" />
                                <small data-i18n="Relaxed API URLS">Relaxed API URLs</small>
                            </label>
                            <label className="checkbox_label" htmlFor="world_import_dialog" title="Ask to import the World Info/Lorebook for every new character with embedded lorebook. If unchecked, a brief message will be shown instead." data-i18n="[title]Ask to import the World Info/Lorebook for every new character with embedded lorebook. If unchecked, a brief message will be shown instead">
                                <input id="world_import_dialog" type="checkbox" />
                                <small data-i18n="Lorebook Import Dialog">Lorebook Import Dialog</small>
                            </label>
                            <label className="checkbox_label" htmlFor=" enable_auto_select_input" title="Enable auto-select of input text in some text fields when clicking/selecting them. Applies to popup input textboxes, and possible other custom input fields." data-i18n="[title]Enable auto-select of input text in some text fields when clicking/selecting them. Applies to popup input textboxes, and possible other custom input fields.">
                                <input id="enable_auto_select_input" type="checkbox" />
                                <small data-i18n="Auto-select Input Text">Auto-select Input Text</small>
                            </label>
                            <label className="checkbox_label alignItemsCenter" htmlFor="enable_md_hotkeys" data-i18n="[title]markdown_hotkeys_desc" title="Enable hotkeys for inserting markdown format characters in certain text input boxes. See '/help hotkeys'.">
                                <input id="enable_md_hotkeys" type="checkbox" />
                                <small>
                                    <span data-i18n="Markdown Hotkeys">Markdown Hotkeys</span>
                                    <i className="fa-brands fa-markdown"  />
                                </small>
                            </label>
                            <label className="checkbox_label" htmlFor="restore_user_input" title="Restore unsaved user input on page refresh." data-i18n="[title]Restore unsaved user input on page refresh">
                                <input id="restore_user_input" type="checkbox" />
                                <small data-i18n="Restore User Input">Restore User Input</small>
                            </label>
                            <div className="flex-container alignItemsCenter">
                                <label id="movingUIModeCheckBlock" htmlFor="movingUImode" className="checkbox_label" title="Allow repositioning certain UI elements by dragging them. PC only, no effect on mobile." data-i18n="[title]Allow repositioning certain UI elements by dragging them. PC only, no effect on mobile">
                                    <input id="movingUImode" type="checkbox" />
                                    <small>
                                        <span data-i18n="Movable UI Panels">MovingUI</span>
                                        <i className="fa-solid fa-desktop"  />
                                    </small>
                                </label>
                                <div id="movingUIreset" title="Reset MovingUI panel sizes/locations." className="menu_button margin0" data-i18n="[title]Reset MovingUI panel sizes/locations.">
                                    <i className=" fa-solid fa-recycle margin-r5"  />
                                    <span data-i18n="mui_reset">Reset</span>
                                </div>
                            </div>
                            <div id="MovingUI-presets-block" className="flex-container alignitemscenter">
                                <div className="flex-container alignItemsFlexEnd">
                                    <label htmlFor="movingUIPresets" title="MovingUI preset. Predefined/saved draggable positions." data-i18n="[title]MovingUI preset. Predefined/saved draggable positions">
                                        <small data-i18n="MUI Preset">MovingUI Preset:</small>
                                        <div className="flex-container flexnowrap">
                                            <select id="movingUIPresets" className="widthNatural flex1 margin0">
                                            </select>
                                        </div>
                                    </label>
                                    <div id="movingui-preset-save-button" title="Save changes to a new MovingUI preset file." data-i18n="[title]Save movingUI changes to a new file" className="menu_button margin0 fa-solid fa-save"></div>
                                </div>
                            </div>
                            <div id="CustomCSS-block" className="flex-container flexFlowColumn">
                                <h4 className="title_restorable" title="Apply a custom CSS style to all of the ST GUI." data-i18n="[title]Apply a custom CSS style to all of the ST GUI">
                                    <span data-i18n="Custom CSS">Custom CSS</span>
                                    <i className="editor_maximize fa-solid fa-maximize right_menu_button" data-for="customCSS" title="Expand the editor" data-i18n="[title]Expand the editor"  />
                                </h4>
                                <div id="CustomCSS-textAreaBlock" className="flex-container flexnowrap alignitemscenter">
                                    <textarea id="customCSS" className="text_pole margin0 margin-r5 textarea_compact monospace" rows={8}></textarea>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div name="UserSettingsThirdColumn" id="power-user-options-block" className="flex-container wide100p flex1">
                        <div id="power-user-option-checkboxes">

                            <div name="ChatMessageHandlingToggles">
                                <h4 data-i18n="Chat/Message Handling">Chat/Message Handling</h4>
                                <div className="flex-container">
                                    <div className="alignitemscenter flex-container flexFlowColumn flexBasis48p flexGrow flexShrink gap0">
                                        <small>
                                            <span data-i18n="# Messages to Load"># Msg. to Load</span>

                                            <div className="fa-solid fa-circle-info opacity50p" data-i18n="[title]The number of chat history messages to load before pagination." title="The number of chat history messages to load before pagination."></div>
                                        </small>
                                        <input className="neo-range-slider" type="range" id="chat_truncation" name="chat_truncation" min="0" max="1000" step="5" />
                                        <input className="neo-range-input" type="number" min="0" max="1000" step="5" data-for="chat_truncation" id="chat_truncation_counter" />
                                        <small data-i18n="(0 = All)">(0 = All)</small>
                                    </div>

                                    <div className="alignitemscenter flex-container flexFlowColumn flexBasis48p flexGrow flexShrink gap0">
                                        <small>
                                            <span data-i18n="Streaming FPS">Streaming FPS</span>
                                            <div className="fa-solid fa-circle-info opacity50p" data-i18n="[title]Update speed of streamed text." title="Update speed of streamed text."></div>
                                        </small>
                                        <input className="neo-range-slider" type="range" id="streaming_fps" name="streaming_fps" min="5" max="100" step="5" />
                                        <input className="neo-range-input" type="number" min="5" max="100" step="5" data-for="streaming_fps" id="streaming_fps_counter" />
                                    </div>
                                </div>
                                <div id="examples-behavior-block">
                                    <label htmlFor="example_messages_behavior">
                                        <small data-i18n="Example Messages Behavior">
                                            Example Messages Behavior:
                                        </small>
                                    </label>
                                    <select id="example_messages_behavior">
                                        <option value="normal" data-i18n="Gradual push-out">Gradual push-out</option>
                                        <option value="keep" data-i18n="Always include examples">Always include examples</option>
                                        <option value="strip" data-i18n="Never include examples">Never include examples</option>
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="image_overswipe">
                                        <small data-i18n="Image Swipe Behavior:">
                                            Image Swipe Behavior:
                                        </small>
                                    </label>
                                    <select id="image_overswipe">
                                        <option value="generate" data-i18n="Generate new">Generate new</option>
                                        <option value="rollover" data-i18n="Roll over">Roll over</option>
                                    </select>
                                </div>
                                <div className="flex-container alignitemscenter">
                                    <small data-i18n="Send on Enter">
                                        Enter to Send:
                                    </small>
                                    <select id="send_on_enter" className="widthNatural flex1 margin0">
                                        <option value="-1" data-i18n="Disabled">Disabled</option>
                                        <option value="0" data-i18n="Automatic (PC)">Automatic (PC)</option>
                                        <option value="1" data-i18n="Enabled">Enabled</option>
                                    </select>
                                </div>
                                <label className="checkbox_label" htmlFor="continue_on_send">
                                    <input id="continue_on_send" type="checkbox" />
                                    <small data-i18n="Press Send to continue">
                                        "Send" to Continue
                                    </small>
                                </label>
                                <label className="checkbox_label" htmlFor="quick_continue" title="Show a button in the input area to ask the AI to continue (extend) its last message." data-i18n="[title]Show a button in the input area to ask the AI to continue (extend) its last message">
                                    <input id="quick_continue" type="checkbox" />
                                    <small data-i18n="Quick 'Continue' button">
                                        Quick "Continue" button
                                    </small>
                                </label>
                                <label className="checkbox_label" htmlFor="quick_impersonate" title="Show a button in the input area to ask the AI to impersonate your character for a single message." data-i18n="[title]Show a button in the input area to ask the AI to impersonate your character for a single message">
                                    <input id="quick_impersonate" type="checkbox" />
                                    <small data-i18n="Quick 'Impersonate' button">
                                        Quick "Impersonate" button
                                    </small>
                                </label>
                                <div className="checkbox-container flex-container">
                                    <label className="checkbox_label" htmlFor="swipes-checkbox" title="Show arrow buttons on the last in-chat message to generate alternative AI responses. Both PC and mobile." data-i18n="[title]Show arrow buttons on the last in-chat message to generate alternative AI responses. Both PC and mobile">
                                        <input id="swipes-checkbox" type="checkbox" />
                                        <small data-i18n="Swipes">Swipes</small><i className="fa-solid fa-desktop"  /><i className="fa-solid fa-mobile-screen-button"  />
                                    </label>
                                    <label className="checkbox_label" htmlFor="gestures-checkbox" title="Allow using swiping gestures on the last in-chat message to trigger swipe generation. Mobile only, no effect on PC." data-i18n="[title]Allow using swiping gestures on the last in-chat message to trigger swipe generation. Mobile only, no effect on PC">
                                        <input id="gestures-checkbox" type="checkbox" />
                                        <small data-i18n="Gestures">Gestures</small>
                                        <i className="fa-solid fa-mobile-screen-button"  />
                                    </label>
                                </div>
                                <label className="checkbox_label" htmlFor="auto-load-chat-checkbox">
                                    <input id="auto-load-chat-checkbox" type="checkbox" />
                                    <small data-i18n="Auto-load Last Chat">Auto-load Last Chat</small>
                                </label>
                                <label htmlFor="auto_scroll_chat_to_bottom" className="checkbox_label">
                                    <input id="auto_scroll_chat_to_bottom" type="checkbox" />
                                    <small data-i18n="Auto-scroll Chat">Auto-scroll Chat</small>
                                </label>
                                <label className="checkbox_label" htmlFor="auto_save_msg_edits" title="Save edits to messages without confirmation as you type." data-i18n="[title]Save edits to messages without confirmation as you type">
                                    <input id="auto_save_msg_edits" type="checkbox" />
                                    <small data-i18n="Auto-save Message Edits">Auto-save Message Edits</small>
                                </label>
                                <label className="checkbox_label" htmlFor="confirm_message_delete">
                                    <input id="confirm_message_delete" type="checkbox" />
                                    <small data-i18n="Confirm message deletion">Confirm message deletion</small>
                                </label>
                                <label className="checkbox_label" htmlFor="auto_fix_generated_markdown">
                                    <input id="auto_fix_generated_markdown" type="checkbox" />
                                    <small data-i18n="Auto-fix Markdown">Auto-fix Markdown</small>
                                </label>
                                <label className="checkbox_label" htmlFor="forbid_external_media" title="Disallow embedded media from other domains in chat messages." data-i18n="[title]Disallow embedded media from other domains in chat messages">
                                    <input id="forbid_external_media" type="checkbox" />
                                    <small data-i18n="Forbid External Media">Forbid External Media</small>
                                </label>
                                <label className="checkbox_label" htmlFor="allow_name2_display">
                                    <input id="allow_name2_display" type="checkbox" />
                                    <small data-i18n="Allow {{char}}: in bot messages">Show {'{{'}char{'}}'}: in responses</small>
                                </label>
                                <label className="checkbox_label" htmlFor="allow_name1_display">
                                    <input id="allow_name1_display" type="checkbox" />
                                    <small data-i18n="Allow {{user}}: in bot messages">Show {'{{'}user{'}}'}: in responses</small>
                                </label>
                                <label className="checkbox_label" htmlFor="encode_tags" title="Skip encoding < and > characters in message text, allowing a subset of HTML markup as well as Markdown." data-i18n="[title]Skip encoding  and  characters in message text, allowing a subset of HTML markup as well as Markdown">
                                    <input id="encode_tags" type="checkbox" />
                                    <small data-i18n="Show tags in responses">Show &lt;tags&gt; in responses</small>
                                </label>
                                <label className="checkbox_label" htmlFor="experimental_macro_engine" title={`Experimental new Macro Engine.

Allows nested macros to be resolved correctly and has a dedicated, logical replacement order.
The new engine is designed to cleanly replace the old regex-based macro system.`}>
                                    <input id="experimental_macro_engine" type="checkbox" />
                                    <small data-i18n="Experimental Macro Engine">Experimental Macro Engine</small>
                                    <i className="fa-solid fa-flask" title="Experimental feature. Currently in development to test." data-i18n="[title]Experimental feature. Currently in development to test."  />
                                </label>
                                <label className="checkbox_label" htmlFor="console_log_prompts">
                                    <input id="console_log_prompts" type="checkbox" />
                                    <small data-i18n="Log prompts to console">Log prompts to console</small>
                                </label>
                                <label className="checkbox_label" htmlFor="request_token_probabilities" title="Requests logprobs from the API for the Token Probabilities feature." data-i18n="[title]Requests logprobs from the API for the Token Probabilities feature">
                                    <input id="request_token_probabilities" type="checkbox" />
                                    <small data-i18n="Request token probabilities">Request token probabilities</small>
                                </label>
                                <label className="checkbox_label" htmlFor="pin_styles" title="Always render style tags from greetings, even if the message is unloaded due to lazy loading." data-i18n="[title]Always render style tags from greetings, even if the message is unloaded due to lazy loading.">
                                    <input id="pin_styles" type="checkbox" />
                                    <small data-i18n="Pin greeting message styles">Pin greeting message styles</small>
                                </label>
                                <div className="inline-drawer wide100p flexFlowColumn">
                                    <div className="inline-drawer-toggle inline-drawer-header userSettingsInnerExpandable" title="Automatically reject and re-generate AI message based on configurable criteria." data-i18n="[title]Automatically reject and re-generate AI message based on configurable criteria">
                                        <b><span data-i18n="Auto-swipe">Auto-swipe</span></b>
                                        <div className="fa-solid fa-circle-chevron-down inline-drawer-icon down"></div>
                                    </div>
                                    <div className="inline-drawer-content">
                                        <label className="checkbox_label" htmlFor="auto_swipe" title="Enable the auto-swipe function. Settings in this section only have an effect when auto-swipe is enabled." data-i18n="[title]Enable the auto-swipe function. Settings in this section only have an effect when auto-swipe is enabled">
                                            <input id="auto_swipe" type="checkbox" />
                                            <small data-i18n="Enabled">Enabled</small>
                                        </label>
                                        <small data-i18n="Minimum generated message length">Minimum generated message length</small>
                                        <input id="auto_swipe_minimum_length" name="auto_swipe_minimum_length" type="number" min="0" step="1" defaultValue="0" className="text_pole" title="If the generated message is shorter than these many characters, trigger an auto-swipe." data-i18n="[title]If the generated message is shorter than these many characters, trigger an auto-swipe" />
                                        <small data-i18n="Blacklisted words">Blacklisted words</small>
                                        <div className="auto_swipe">
                                            <textarea id="auto_swipe_blacklist" name="auto_swipe_blacklist" data-i18n="[placeholder]words you dont want generated separated by comma ','" placeholder="words you don't want generated separated by comma ','" className="text_pole textarea_compact" defaultValue="" autoComplete="off" rows={3}></textarea>
                                            <small data-i18n="Blacklisted word count to swipe">Blacklisted word count to swipe</small>
                                            <input id="auto_swipe_blacklist_threshold" name="auto_swipe_blacklist_threshold" type="number" min="0" step="1" defaultValue="1" className="text_pole" title="Minimum number of blacklisted words detected to trigger an auto-swipe." data-i18n="[title]Minimum number of blacklisted words detected to trigger an auto-swipe" />
                                        </div>
                                    </div>
                                </div>
                                <div name="AutoContiueBlock" className="inline-drawer wide100p flexFlowColumn">
                                    <div className="inline-drawer-toggle inline-drawer-header userSettingsInnerExpandable" data-i18n="[title]Automatically 'continue' a response if the model stopped before reaching a certain amount of tokens." title="Automatically 'continue' a response if the model stopped before reaching a certain amount of tokens.">
                                        <b><span data-i18n="Auto-Continue">Auto-Continue</span></b>
                                        <div className="fa-solid fa-circle-chevron-down inline-drawer-icon down"></div>
                                    </div>
                                    <div className="inline-drawer-content">
                                        <div className="flex-container">
                                            <label className="checkbox_label" htmlFor="auto_continue_enabled">
                                                <input id="auto_continue_enabled" type="checkbox" />
                                                <small data-i18n="Enabled">
                                                    Enabled
                                                </small>
                                            </label>
                                            <label className="checkbox_label" htmlFor="auto_continue_allow_chat_completions">
                                                <input id="auto_continue_allow_chat_completions" type="checkbox" />
                                                <small data-i18n="Allow for Chat Completion APIs">
                                                    Allow for Chat Completion APIs
                                                </small>
                                            </label>
                                        </div>
                                        <div className="auto_continue_settings_block">
                                            <label htmlFor="auto_continue_target_length">
                                                <small data-i18n="Target length (tokens)">Target length (tokens)</small>
                                                <input id="auto_continue_target_length" type="number" className="text_pole textarea_compact" min="0" max="1024" />
                                            </label>
                                        </div>
                                    </div>


                                </div>
                            </div>
                            <div name="AutoCompleteToggle" className="inline-drawer wide100p flexFlowColumn">
                                <div className="inline-drawer-toggle inline-drawer-header userSettingsInnerExpandable" title="Options for the various autocomplete input boxes.">
                                    <b><span data-i18n="AutoComplete Settings">AutoComplete Settings</span></b>
                                    <div className="fa-solid fa-circle-chevron-down inline-drawer-icon down"></div>
                                </div>
                                <div className="inline-drawer-content">
                                    <div className="flex1" title="When to show the autocomplete for slash commands and macros." data-i18n="[title]When to show the autocomplete for slash commands and macros.">
                                        <label htmlFor="stscript_autocomplete_state">
                                            <small data-i18n="Visibility">Visibility</small>
                                        </label>
                                        <select id="stscript_autocomplete_state">
                                            <option value="0" data-i18n="Don't show">Don't show</option>
                                            <option value="1" data-i18n="Input length > 1">Input length &gt; 1</option>
                                            <option value="2" data-i18n="Always show">Always show</option>
                                        </select>
                                    </div>
                                    <label className="checkbox_label" htmlFor="stscript_autocomplete_autoHide">
                                        <input id="stscript_autocomplete_autoHide" type="checkbox" />
                                        <small data-i18n="Automatically hide details">
                                            Automatically hide details
                                        </small>
                                    </label>
                                    <label className="checkbox_label" htmlFor="stscript_autocomplete_showInAllMacroFields" title="Show macro autocomplete in all macro-enabled fields. When off, autocomplete only shows in expanded editors or when pressing Ctrl+Space." data-i18n="[title]Show macro autocomplete in all macro-enabled fields. When off, autocomplete only shows in expanded editors or when pressing Ctrl+Space.">
                                        <input id="stscript_autocomplete_showInAllMacroFields" type="checkbox" />
                                        <small data-i18n="Show in all macro fields">
                                            Show in all macro fields
                                        </small>
                                    </label>
                                    <div className="flex-container">
                                        <div className="flex1" title="Determines how entries are found for autocomplete." data-i18n="[title]Determines how entries are found for autocomplete.">
                                            <label htmlFor="stscript_matching">
                                                <small data-i18n="Autocomplete Matching">Matching</small>
                                            </label>
                                            <select id="stscript_matching">
                                                <option data-i18n="Starts with" value="strict">Starts with</option>
                                                <option data-i18n="Includes" value="includes">Includes</option>
                                                <option data-i18n="Fuzzy" value="fuzzy">Fuzzy</option>
                                            </select>
                                        </div>
                                        <div className="flex1" title="Sets the style of the autocomplete." data-i18n="[title]Sets the style of the autocomplete.">
                                            <label htmlFor="stscript_autocomplete_style">
                                                <small data-i18n="Autocomplete Style">Style</small>
                                            </label>
                                            <div className="flex-container flexFlowRow alignItemsBaseline">
                                                <select id="stscript_autocomplete_style">
                                                    <option data-i18n="Follow Theme" value="theme">Follow Theme</option>
                                                    <option data-i18n="Dark" value="dark">Dark</option>
                                                    <option data-i18n="Light" value="light">Light</option>
                                                </select>
                                                {/* <div className="menu_button fa-solid fa-pen-to-square" title="Customize colors"></div> */}
                                            </div>
                                        </div>
                                    </div>
                                    <div title="Determines which keys select an item from the AutoComplete suggestions">
                                        <label>
                                            <small data-i18n="Keyboard">Keyboard:</small>
                                        </label>
                                        <select id="stscript_autocomplete_select">
                                            <option value="3" data-i18n="Select with Tab or Enter">Select with Tab or Enter</option>
                                            <option value="1" data-i18n="Select with Tab">Select with Tab</option>
                                            <option value="2" data-i18n="Select with Enter">Select with Enter</option>
                                        </select>
                                    </div>
                                    <div className="flex-container flexFlowColumn gap0" title="Sets the font size of the autocomplete." data-i18n="[title]Sets the font size of the autocomplete.">
                                        <label htmlFor="stscript_autocomplete_font_scale"><small>Font Scale</small></label>
                                        <input className="neo-range-slider" type="range" id="stscript_autocomplete_font_scale" min="0.5" max="2" step="0.01" />
                                        <input className="neo-range-input" type="number" min="0.5" max="2" step="0.01" data-for="stscript_autocomplete_font_scale" id="stscript_autocomplete_font_scale_counter" />
                                    </div>
                                    <div title="Sets the width of the autocomplete." data-i18n="[title]Sets the width of the autocomplete.">
                                        <label htmlFor="stscript_autocomplete_width">
                                            <small data-i18n="Autocomplete Width">Width</small>
                                        </label>
                                        <div className="doubleRangeContainer">
                                            <div className="doubleRangeInputContainer">
                                                <input type="range" id="stscript_autocomplete_width_left" min="0" max="2" step="1" />
                                                <datalist id="stscript_autocomplete_width_left_values">
                                                    <option value="0" label="input" title="chat input box" data-i18n="[title]chat input box"></option>
                                                    <option value="1" label="chat" title="entire chat width" data-i18n="[title]entire chat width"></option>
                                                    <option value="2" label="full" title="full window width" data-i18n="[title]full window width"></option>
                                                </datalist>
                                            </div>
                                            <div className="doubleRangeInputContainer">
                                                <input type="range" id="stscript_autocomplete_width_right" min="0" max="2" step="1" />
                                                <datalist id="stscript_autocomplete_width_right_values">
                                                    <option value="0" label="input" title="chat input box" data-i18n="[title]chat input box"></option>
                                                    <option value="1" label="chat" title="entire chat width" data-i18n="[title]entire chat width"></option>
                                                    <option value="2" label="full" title="full window width" data-i18n="[title]full window width"></option>
                                                </datalist>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div name="STscriptToggles">
                                <h4 data-i18n="STscript Settings">STscript Settings</h4>
                                <div title="Sets default flags for the STscript parser." data-i18n="[title]Sets default flags for the STscript parser.">
                                    <label><small data-i18n="Parser Flags">Parser Flags</small></label>
                                    <label className="checkbox_label" title="Switch to stricter escaping, allowing all delimiting characters to be escaped with a backslash, and backslashes to be escaped as well." data-i18n="[title]Switch to stricter escaping, allowing all delimiting characters to be escaped with a backslash, and backslashes to be escaped as well.">
                                        <input id="stscript_parser_flag_strict_escaping" type="checkbox" />
                                        <span>
                                            <small data-i18n="STRICT_ESCAPING">STRICT_ESCAPING</small>
                                        </span>
                                        <a href="usage/st-script/#strict-escaping" target="_blank" className="notes-link">
                                            <span className="fa-solid fa-circle-question note-link-span"></span>
                                        </a>
                                    </label>
                                    <label className="checkbox_label" title={`Prevents {{getvar::}} {{getglobalvar::}} macros from having literal macro-like values auto-evaluated.
e.g. "{{newline}}" remains as literal string "{{newline}}"

(This is done by internally replacing {{getvar::}} {{getglobalvar::}} macros with scoped variables.)`} data-i18n="[title]stscript_parser_flag_replace_getvar_label">
                                        <input id="stscript_parser_flag_replace_getvar" type="checkbox" />
                                        <span>
                                            <small data-i18n="REPLACE_GETVAR">REPLACE_GETVAR</small>
                                        </span>
                                        <a href="usage/st-script/#replace-variable-macros" target="_blank" className="notes-link">
                                            <span className="fa-solid fa-circle-question note-link-span"></span>
                                        </a>
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
        </>
    );
}
