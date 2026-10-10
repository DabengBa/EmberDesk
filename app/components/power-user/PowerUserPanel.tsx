import { ContractButton } from '../contract/ContractButton';
import { ContractIconButton } from '../contract/ContractIconButton';
export function PowerUserPanel() {
    return (
        <>
                <div className="flex-container flexFlowColumn">
                    <div name="userSettingsRowOne" className="flex-container flexFlowRow alignitemscenter spaceBetween">
                        <div className="flex-container">
                            <div className="flex-container flexnowrap alignItemsBaseline">
                                <h3 className="margin0">
                                    <span data-i18n="User Settings">User Settings</span>

                                    <a href="usage/user-settings/" className="notes-link" target="_blank" rel="noreferrer" aria-label="User settings documentation">
                                        <span className="fa-solid fa-circle-question note-link-span" aria-hidden="true"></span>
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
                            <ContractButton id="account_button" className="margin0 menu_button_icon menu_button" label="Account" icon={<i className="fa-fw fa-solid fa-user-shield" aria-hidden="true" />} />
                            <ContractButton id="admin_button" className="margin0 menu_button_icon menu_button" label="Admin Panel" icon={<i className="fa-fw fa-solid fa-user-tie" aria-hidden="true" />} />
                            <ContractButton id="logout_button" className="margin0 menu_button_icon menu_button" label="Logout" icon={<i className="fa-fw fa-solid fa-right-from-bracket" aria-hidden="true" />} />
                        </div>
                        <textarea id="settingsSearch" className="textarea_compact flex1" rows={1} placeholder="Search Settings" data-i18n="[placeholder]Search Settings"></textarea>
                    </div>
                </div>
                <div id="user-settings-block-content" className="flex-container spaceEvenly">
                    <div name="UserSettingsFirstColumn" id="UI-Theme-Block" className="flex-container flexFlowColumn wide100p flex1">
                        <div name="themeElements" className="flex-container flexFlowColumn flexNoGap">
                            {/* <h4><span data-i18n="UI Colors">Theme Settings</span></h4> */}
                            <div name="AvatarAndChatDisplay" className="flex-container flexFlowColumn">
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
                            </div>
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
                                <label htmlFor="messageTimestampsEnabled" className="checkbox_label" title="Show a timestamp for each message in the chat log." data-i18n="[title]Show a timestamp for each message in the chat log">
                                    <input id="messageTimestampsEnabled" type="checkbox" />
                                    <small data-i18n="Chat Timestamps">Chat Timestamps</small>
                                </label>
                                <label htmlFor="messageTokensEnabled" className="checkbox_label" title="Show the number of tokens for each message in the chat log." data-i18n="[title]Show the number of tokens in each message in the chat log">
                                    <input id="messageTokensEnabled" type="checkbox" />
                                    <small data-i18n="Show Message Token Count">Message Token Count</small>
                                </label>
                                <label htmlFor="compact_input_area" className="checkbox_label" title="Single-row message input area. Mobile only, no effect on PC." data-i18n="[title]Single-row message input area. Mobile only, no effect on PC">
                                    <input id="compact_input_area" type="checkbox" />
                                    <small data-i18n="Compact Input Area (Mobile)">Compact Input Area</small><i className="fa-solid fa-mobile-screen-button"  />
                                </label>
                            </div>
                        </div>
                    </div>
                    <div name="UserSettingsSecondColumn" id="UI-Customization" className="flex-container flexFlowColumn wide100p flexNoGap flex1">
                        <div name="MiscellaneousToggles">
                            <h4><span data-i18n="Miscellaneous">Miscellaneous</span></h4>
                            <div className="flex-container flexGap2">
                                <ContractButton id="reload_chat" className="menu_button whitespacenowrap" label="Reload Chat" title="Reload and redraw the currently open chat." nativeTitle />
                                <ContractButton id="debug_menu" className="menu_button whitespacenowrap" label="Debug Menu" />
                                <ContractButton id="data_maid_button" className="menu_button whitespacenowrap" label="Clean-Up" title="Find and delete backups, unused chats, files, images, etc." nativeTitle />
                            </div>
                            <label id="smooth_streaming_control" className="checkbox_label" htmlFor="smooth_streaming">
                                <input id="smooth_streaming" type="checkbox" />
                                <small className="flex-container alignItemsBaseline" data-i18n="Smooth Streaming">
                                    Smooth Streaming
                                </small>
                            </label>

                            <div id="CustomCSS-block" className="flex-container flexFlowColumn">
                                <h4 className="title_restorable" title="Apply a custom CSS style to all of the ST GUI." data-i18n="[title]Apply a custom CSS style to all of the ST GUI">
                                    <span data-i18n="Custom CSS">Custom CSS</span>
                                    <ContractIconButton data-for="customCSS" className="editor_maximize right_menu_button" label="Expand the editor" title="Expand the editor" nativeTitle icon={<i className="fa-solid fa-maximize" aria-hidden="true" />} />
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
                                <div className="checkbox-container flex-container">
                                    <label className="checkbox_label" htmlFor="swipes-checkbox" title="Show arrow buttons on the last in-chat message to generate alternative AI responses. Both PC and mobile." data-i18n="[title]Show arrow buttons on the last in-chat message to generate alternative AI responses. Both PC and mobile">
                                        <input id="swipes-checkbox" type="checkbox" />
                                        <small data-i18n="Swipes">Swipes</small><i className="fa-solid fa-desktop"  /><i className="fa-solid fa-mobile-screen-button"  />
                                    </label>
                                </div>
                                <label className="checkbox_label" htmlFor="auto_fix_generated_markdown">
                                    <input id="auto_fix_generated_markdown" type="checkbox" />
                                    <small data-i18n="Auto-fix Markdown">Auto-fix Markdown</small>
                                </label>
                                <label className="checkbox_label" htmlFor="forbid_external_media" title="Disallow embedded media from other domains in chat messages." data-i18n="[title]Disallow embedded media from other domains in chat messages">
                                    <input id="forbid_external_media" type="checkbox" />
                                    <small data-i18n="Forbid External Media">Forbid External Media</small>
                                </label>
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
                                    </div>
                                </div>
                            </div>
                            <div name="FrontendFramesToggle" className="inline-drawer wide100p flexFlowColumn">
                                <div className="inline-drawer-toggle inline-drawer-header userSettingsInnerExpandable" title="Render complete HTML documents inside message code blocks as live frames.">
                                    <b><span data-i18n="Frontend Frames">Frontend Frames</span></b>
                                    <div className="fa-solid fa-circle-chevron-down inline-drawer-icon down"></div>
                                </div>
                                <div className="inline-drawer-content">
                                    <label className="checkbox_label" htmlFor="frontend_frames_enabled" title="Render complete HTML documents in message code blocks as live iframes. The frame runs same-origin scripts from the card, so only enable this for content you trust." data-i18n="[title]Render complete HTML documents in message code blocks as live iframes. The frame runs same-origin scripts from the card, so only enable this for content you trust.">
                                        <input id="frontend_frames_enabled" type="checkbox" />
                                        <small data-i18n="Enable frontend frames">Enable frontend frames</small>
                                    </label>
                                    <div title="How many floors, counting backwards from the newest message, may render frames. 0 means all floors. Hidden/system floors do not count when the ignore-hidden option is on." data-i18n="[title]How many floors, counting backwards from the newest message, may render frames. 0 means all floors.">
                                        <label htmlFor="frontend_frames_depth">
                                            <small data-i18n="Render depth (0 = all)">Render depth (0 = all)</small>
                                        </label>
                                        <input id="frontend_frames_depth" type="number" className="text_pole textarea_compact" min="0" step="1" />
                                    </div>
                                    <label className="checkbox_label" htmlFor="frontend_frames_depth_ignore_hidden" title="Skip hidden/system messages when counting render depth." data-i18n="[title]Skip hidden/system messages when counting render depth.">
                                        <input id="frontend_frames_depth_ignore_hidden" type="checkbox" />
                                        <small data-i18n="Ignore hidden floors in depth">Ignore hidden floors in depth</small>
                                    </label>
                                    <div title="When to collapse the source code block behind a toggle once a frame is rendered." data-i18n="[title]When to collapse the source code block behind a toggle once a frame is rendered.">
                                        <label htmlFor="frontend_frames_collapse_code_block">
                                            <small data-i18n="Collapse code blocks">Collapse code blocks</small>
                                        </label>
                                        <select id="frontend_frames_collapse_code_block">
                                            <option data-i18n="Frontend blocks only" value="frontend_only">Frontend blocks only</option>
                                            <option data-i18n="All code blocks" value="all">All code blocks</option>
                                            <option data-i18n="Never" value="none">Never</option>
                                        </select>
                                    </div>
                                    <label className="checkbox_label" htmlFor="frontend_frames_skip_highlight" title="Skip syntax highlighting for code blocks that render as frontend frames." data-i18n="[title]Skip syntax highlighting for code blocks that render as frontend frames.">
                                        <input id="frontend_frames_skip_highlight" type="checkbox" />
                                        <small data-i18n="Skip highlight on framed blocks">Skip highlight on framed blocks</small>
                                    </label>
                                    <label className="checkbox_label" htmlFor="frontend_frames_use_blob_url" title="Debug: load frames via blob URLs instead of srcdoc." data-i18n="[title]Debug: load frames via blob URLs instead of srcdoc.">
                                        <input id="frontend_frames_use_blob_url" type="checkbox" />
                                        <small data-i18n="Use blob URLs (debug)">Use blob URLs (debug)</small>
                                    </label>
                                    <label className="checkbox_label" htmlFor="frontend_frames_allow_streaming" title="Render frames while a message is still streaming. Only documents in already-closed code fences mount." data-i18n="[title]Render frames while a message is still streaming. Only documents in already-closed code fences mount.">
                                        <input id="frontend_frames_allow_streaming" type="checkbox" />
                                        <small data-i18n="Render while streaming">Render while streaming</small>
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
        </>
    );
}
