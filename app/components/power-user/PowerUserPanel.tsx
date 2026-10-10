import { ContractButton } from '../contract/ContractButton';
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
                                <div className="checkbox-container flex-container">
                                    <label className="checkbox_label" htmlFor="swipes-checkbox" title="Show arrow buttons on the last in-chat message to generate alternative AI responses. Both PC and mobile." data-i18n="[title]Show arrow buttons on the last in-chat message to generate alternative AI responses. Both PC and mobile">
                                        <input id="swipes-checkbox" type="checkbox" />
                                        <small data-i18n="Swipes">Swipes</small><i className="fa-solid fa-desktop"  /><i className="fa-solid fa-mobile-screen-button"  />
                                    </label>
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
