export function FloatingPromptPanel() {
    return (
        <>
            <div className="panelControlBar flex-container alignItemsBaseline">
                <div id="floatingPromptheader" className="fa-fw fa-solid fa-grip drag-grabber"></div>
                <div id="floatingPromptMaximize" className="inline-drawer-maximize">
                    <i className="floating_panel_maximize fa-fw fa-solid fa-window-maximize" />
                </div>
                <div id="ANClose" className="fa-fw fa-solid fa-circle-xmark floating_panel_close"></div>
            </div>
            <div name="floatingPromptHolder" className="scrollY">
                <div className="inline-drawer">
                    <div id="ANBlockToggle" className="inline-drawer-toggle inline-drawer-header">
                        <b data-i18n="Author's Note">Author's Note</b>
                        <div className="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                    </div>
                    <div className="inline-drawer-content">
                        <small>
                            <b data-i18n="Unique to this chat">Unique to this chat</b>.<br />
                            <span data-i18n="Branches inherit the Note from their parent, and can be changed individually after that.">Branches inherit the Note from their parent, and can be changed individually after that.</span><br />
                        </small>
                        <textarea id="extension_floating_prompt" data-macros className="text_pole textarea_compact" rows={8}></textarea>
                        <div className="extension_token_counter">
                            <span data-i18n="extension_token_counter">Tokens:</span> <span id="extension_floating_prompt_token_counter">0</span>
                        </div>
                        <label className="checkbox_label" htmlFor="extension_floating_allow_wi_scan">
                            <input id="extension_floating_allow_wi_scan" type="checkbox" />
                            <span data-i18n="Include in World Info Scanning">Include in World Info Scanning</span>
                        </label>
                        <div className="floating_prompt_radio_group">
                            <label className="checkbox_label" htmlFor="extension_floating_position_before">
                                <input type="radio" id="extension_floating_position_before" name="extension_floating_position" defaultValue="2" />
                                <span data-i18n="Before Main Prompt / Story String">Before Main Prompt / Story String</span>
                            </label>
                            <label className="checkbox_label" htmlFor="extension_floating_position_after">
                                <input type="radio" id="extension_floating_position_after" name="extension_floating_position" defaultValue="0" />
                                <span data-i18n="After Main Prompt / Story String">After Main Prompt / Story String</span>
                            </label>
                            <label className="checkbox_label alignItemsCenter" htmlFor="extension_floating_position_depth">
                                <input type="radio" id="extension_floating_position_depth" name="extension_floating_position" defaultValue="1" />
                                <span data-i18n="In-chat @ Depth">In-chat @ Depth</span>
                                <input id="extension_floating_depth" className="text_pole textarea_compact widthNatural" type="number" min="0" max="9999" />
                                <span data-i18n="as">as</span>
                                <select id="extension_floating_role" className="text_pole widthNatural">
                                    <option data-i18n="System" value="0">System</option>
                                    <option data-i18n="User" value="1">User</option>
                                    <option data-i18n="Assistant" value="2">Assistant</option>
                                </select>
                            </label>
                        </div>
                        {/*<label htmlFor="extension_floating_interval">In-Chat Insertion Depth</label>*/}
                        <div className="flex-container">
                            <label htmlFor="extension_floating_interval" className="flex-container flexNoGap flexFlowColumn">
                                <span data-i18n="Insertion Frequency">Insertion Frequency</span>
                                <small data-i18n="(0 = Disable, 1 = Always)">(0 = Disable, 1 = Always)</small>
                            </label>
                            <input id="extension_floating_interval" className="text_pole widthUnset" type="number" min="0" max="9999" />
                        </div>
                        <br />
                        <span><span data-i18n="User inputs until next insertion:">User inputs until next insertion:</span> <span id="extension_floating_counter">(disabled)</span></span>
                    </div>
                </div>
                <hr className="sysHR" />
                <div className="inline-drawer">
                    <div id="charaANBlockToggle" className="inline-drawer-toggle inline-drawer-header">
                        <div className="flex-container flexFlowColumn">
                            <b data-i18n="Character Author's Note (Private)">
                                Character Author's Note (Private)
                            </b>
                            <small data-i18n="Won't be shared with the character card on export.">
                                Won't be shared with the character card on export.
                            </small>
                        </div>
                        <div className="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                    </div>
                    <div className="inline-drawer-content">
                        <small data-i18n="Will be automatically added as the author's note for this character.">Will be automatically added as the author's note for this character.</small>
                        <textarea id="extension_floating_chara" data-macros className="text_pole textarea_compact" rows={8} placeholder={"Example:\n[Scenario: wacky adventures; Genre: romantic comedy; Style: verbose, creative]"}></textarea>
                        <div className="extension_token_counter">
                            <span data-i18n="extension_token_counter">Tokens:</span> <span id="extension_floating_chara_token_counter">0</span>
                        </div>
                        <label className="checkbox_label" htmlFor="extension_use_floating_chara">
                            <input id="extension_use_floating_chara" type="checkbox" />
                            <span data-i18n="Use character author's note">Use character author's note</span>
                        </label>
                        <div className="floating_prompt_radio_group">
                            <label>
                                <input type="radio" name="extension_floating_char_position" defaultValue="0" />
                                <span data-i18n="Replace Author's Note">Replace Author's Note</span>
                            </label>
                            <label>
                                <input type="radio" name="extension_floating_char_position" defaultValue="1" />
                                <span data-i18n="Top of Author's Note">Top of Author's Note</span>
                            </label>
                            <label>
                                <input type="radio" name="extension_floating_char_position" defaultValue="2" />
                                <span data-i18n="Bottom of Author's Note">Bottom of Author's Note</span>
                            </label>
                        </div>
                    </div>
                </div>
                <hr className="sysHR" />
                <div className="inline-drawer">
                    <div id="defaultANBlockToggle" className="inline-drawer-toggle inline-drawer-header">
                        <b data-i18n="Default Author's Note">Default Author's Note</b>
                        <div className="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                    </div>
                    <div className="inline-drawer-content">
                        <small data-i18n="Will be automatically added as the Author's Note for all new chats.">Will be automatically added as the Author's Note for all new chats.</small>
                        <textarea id="extension_floating_default" data-macros className="text_pole textarea_compact" rows={8} placeholder={"Example:\n[Scenario: wacky adventures; Genre: romantic comedy; Style: verbose, creative]"}></textarea>
                        <div className="extension_token_counter">
                            <span data-i18n="extension_token_counter">Tokens:</span> <span id="extension_floating_default_token_counter">0</span>
                        </div>
                        <div className="floating_prompt_radio_group">
                            <label className="checkbox_label" htmlFor="extension_default_position_before">
                                <input type="radio" id="extension_default_position_before" name="extension_default_position" defaultValue="2" />
                                <span data-i18n="Before Main Prompt / Story String">Before Main Prompt / Story String</span>
                            </label>
                            <label className="checkbox_label" htmlFor="extension_default_position_after">
                                <input type="radio" id="extension_default_position_after" name="extension_default_position" defaultValue="0" />
                                <span data-i18n="After Main Prompt / Story String">After Main Prompt / Story String</span>
                            </label>
                            <label className="checkbox_label alignItemsCenter" htmlFor="extension_default_position_depth">
                                <input type="radio" id="extension_default_position_depth" name="extension_default_position" defaultValue="1" />
                                <span data-i18n="In-chat @ Depth">In-chat @ Depth</span>
                                <input id="extension_default_depth" className="text_pole textarea_compact widthNatural" type="number" min="0" max="9999" />
                                <span data-i18n="as">as</span>
                                <select id="extension_default_role" className="text_pole widthNatural">
                                    <option data-i18n="System" value="0">System</option>
                                    <option data-i18n="User" value="1">User</option>
                                    <option data-i18n="Assistant" value="2">Assistant</option>
                                </select>
                            </label>
                        </div>
                        <div className="flex-container">
                            <label htmlFor="extension_default_interval" className="flex-container flexNoGap flexFlowColumn">
                                <span data-i18n="Insertion Frequency">Insertion Frequency</span>
                                <small data-i18n="(0 = Disable, 1 = Always)">(0 = Disable, 1 = Always)</small>
                            </label>
                            <input id="extension_default_interval" className="text_pole widthUnset" type="number" min="0" max="9999" />
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
