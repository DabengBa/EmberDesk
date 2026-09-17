export function PromptManagerPopup() {
    return (
        <>
            <div id="completion_prompt_manager_popup_inspect">
                <h3>Inspect</h3>
                <div className="completion_prompt_manager_popup_entry">
                    <form className="completion_prompt_manager_popup_entry_form">
                        <div className="completion_prompt_manager_popup_entry_form_control">
                            <div className="completion_prompt_manager_popup_header">
                                <label htmlFor="completion_prompt_manager_popup_entry_form_prompt">
                                    <span>Prompt List</span>
                                </label>
                                <a id="completion_prompt_manager_popup_close_button" title="close" data-i18n="[title]close" className="fa-solid fa-close menu_button"></a>
                            </div>
                            <div className="text_muted">The list of prompts associated with this marker.</div>
                            <div id="completion_prompt_manager_popup_entry_form_inspect_list"></div>
                        </div>
                    </form>
                </div>
            </div>
            <div id="completion_prompt_manager_popup_edit">
                <h3 data-i18n="prompt_manager_edit">Edit</h3>
                <div className="completion_prompt_manager_popup_entry">
                    <form className="completion_prompt_manager_popup_entry_form">
                        <div className="flex-container gap10px">
                            <div className="completion_prompt_manager_popup_entry_form_control flex1">
                                <label htmlFor="completion_prompt_manager_popup_entry_form_name">
                                    <span data-i18n="prompt_manager_name">Name</span>
                                </label>
                                <input id="completion_prompt_manager_popup_entry_form_name" className="text_pole" type="text" name="name" />
                                <div className="text_muted" data-i18n="A name for this prompt.">A name for this prompt.</div>
                            </div>
                            <div className="completion_prompt_manager_popup_entry_form_control flex1">
                                <label htmlFor="completion_prompt_manager_popup_entry_form_role">
                                    <span data-i18n="Role">Role</span>
                                </label>
                                <select id="completion_prompt_manager_popup_entry_form_role" className="text_pole" name="role">
                                    <option data-i18n="System" value="system">System</option>
                                    <option data-i18n="User" value="user">User</option>
                                    <option data-i18n="AI Assistant" value="assistant">AI Assistant</option>
                                </select>
                                <div className="text_muted" data-i18n="To whom this message will be attributed.">To whom this message will be attributed.</div>
                            </div>
                            <div className="completion_prompt_manager_popup_entry_form_control flex1">
                                <label htmlFor="completion_prompt_manager_popup_entry_form_injection_trigger">
                                    <span data-i18n="Triggers">Triggers</span>
                                </label>
                                <select id="completion_prompt_manager_popup_entry_form_injection_trigger" className="text_pole" name="injection_trigger" multiple>
                                    <option data-i18n="Normal" value="normal">Normal</option>
                                    <option data-i18n="Continue" value="continue">Continue</option>
                                    <option data-i18n="Impersonate" value="impersonate">Impersonate</option>
                                    <option data-i18n="Swipe" value="swipe">Swipe</option>
                                    <option data-i18n="Regenerate" value="regenerate">Regenerate</option>
                                    <option data-i18n="Quiet" value="quiet">Quiet</option>
                                </select>
                                <div className="text_muted" data-i18n="Filter to specific generation types.">
                                    Filter to specific generation types.
                                </div>
                            </div>
                        </div>
                        <div className="flex-container gap10px">
                            <div className="completion_prompt_manager_popup_entry_form_control flex1">
                                <label htmlFor="completion_prompt_manager_popup_entry_form_injection_position">
                                    <span data-i18n="prompt_manager_position">Position</span>
                                </label>
                                <select id="completion_prompt_manager_popup_entry_form_injection_position" className="text_pole" name="injection_position">
                                    <option data-i18n="prompt_manager_relative" value="0">Relative</option>
                                    <option data-i18n="prompt_manager_in_chat" value="1">In-chat</option>
                                </select>
                                <div className="text_muted" data-i18n="Relative (to other prompts in prompt manager) or In-chat @ Depth.">Relative (to other prompts in prompt manager) or In-chat @ Depth.</div>
                            </div>
                            <div id="completion_prompt_manager_depth_block" className="completion_prompt_manager_popup_entry_form_control flex1">
                                <label htmlFor="completion_prompt_manager_popup_entry_form_injection_depth">
                                    <span data-i18n="prompt_manager_depth">Depth</span>
                                </label>
                                <input id="completion_prompt_manager_popup_entry_form_injection_depth" className="text_pole" type="number" name="injection_depth" min="0" max="9999" defaultValue="4" />
                                <div className="text_muted" data-i18n="0 = after the last message, 1 = before the last message, etc.">0 = after the last message, 1 = before the last message, etc.</div>
                            </div>
                            <div id="completion_prompt_manager_order_block" className="completion_prompt_manager_popup_entry_form_control flex1">
                                <label htmlFor="completion_prompt_manager_popup_entry_form_injection_order">
                                    <span data-i18n="prompt_manager_order">Order</span>
                                    <i className="fas fa-info-circle" title="Prompt injections from other sources (World Info, Author's Note, etc.) always have a default order of 100." data-i18n="[title]prompt_manager_order_note" />
                                </label>
                                <input id="completion_prompt_manager_popup_entry_form_injection_order" className="text_pole" type="number" name="injection_order" min="0" max="9999" defaultValue="100" />
                                <div className="text_muted" data-i18n="Ordered from low/top to high/bottom, and at same order: Assistant, User, System.">Ordered from low/top to high/bottom, and at same order: Assistant, User, System.</div>
                            </div>
                        </div>
                        <div className="completion_prompt_manager_popup_entry_form_control">
                            <div className="flex-container alignItemsCenter" data-i18n="[external_piece_text]The content of this prompt is pulled from elsewhere and cannot be edited here." external_piece_text="The content of this prompt is pulled from elsewhere and cannot be edited here.">
                                <div className="flex1">
                                    <label htmlFor="completion_prompt_manager_popup_entry_form_prompt">
                                        <span data-i18n="Prompt">Prompt</span>
                                    </label>
                                </div>
                                <div id="completion_prompt_manager_forbid_overrides_block">
                                    <label className="checkbox_label" htmlFor="completion_prompt_manager_popup_entry_form_forbid_overrides" title="This prompt cannot be overridden by character cards, even if overrides are preferred." data-i18n="[title]This prompt cannot be overridden by character cards, even if overrides are preferred.">
                                        <input type="checkbox" id="completion_prompt_manager_popup_entry_form_forbid_overrides" name="forbid_overrides" />
                                        <span data-i18n="prompt_manager_forbid_overrides">Forbid Overrides</span>
                                    </label>
                                </div>
                            </div>
                            <div id="completion_prompt_manager_popup_entry_source_block">
                                <b data-i18n="Source:">Source:</b>
                                <span>&nbsp;</span>
                                <span id="completion_prompt_manager_popup_entry_source"></span>
                            </div>
                            <textarea id="completion_prompt_manager_popup_entry_form_prompt" className="text_pole" name="prompt" data-macros data-macros-autocomplete="always" data-macros-autocomplete-style="expanded" placeholder="The prompt to be sent." data-i18n="[placeholder]The prompt to be sent."></textarea>
                        </div>
                        <div className="completion_prompt_manager_popup_entry_form_footer">
                            <a id="completion_prompt_manager_popup_entry_form_close" title="Close" data-i18n="[title]close" className="fa-solid fa-close menu_button"></a>
                            <a id="completion_prompt_manager_popup_entry_form_reset" title="Reset" data-i18n="[title]reset" className="fa-solid fa-undo menu_button"></a>
                            <a id="completion_prompt_manager_popup_entry_form_save" title="Save" data-i18n="[title]save" className="fa-solid fa-save menu_button" data-pm-prompt=""></a>
                        </div>
                    </form>
                </div>
            </div>
        </>
    );
}
