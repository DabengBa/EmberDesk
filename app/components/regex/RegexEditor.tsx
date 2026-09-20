import { ContractButton } from '../contract/ContractButton';
export function RegexEditor() {
    return (
<div id="regex_editor_template">
    <div className="regex_editor">
        <h3 className="flex-container justifyCenter alignItemsBaseline">
            <strong data-i18n="Regex Editor">Regex Editor</strong>
            <a href="#" className="notes-link" target="_blank" rel="noopener noreferrer">
                <span className="note-link-span">?</span>
            </a>
            <ContractButton id="regex_test_mode_toggle" className="menu_button menu_button_icon" label="Test Mode" icon={<i className="fa-solid fa-bug fa-sm" aria-hidden="true" />} />
        </h3>

        <small className="flex-container extensions_info" data-i18n="ext_regex_desc">
            Regex is a tool to find/replace strings using regular expressions. If you want to learn more, click on the ? next to the title.
        </small>
        <hr />

        <div id="regex_info_block_wrapper">
            <div id="regex_info_block" className="info-block"></div>
            <a id="regex_info_block_flags_hint" href="#" target="_blank" rel="noopener noreferrer">
                <i className="fa-solid fa-circle-info" data-i18n="[title]ext_regex_flags_help" title="Click here to learn more about regex flags." />
            </a>
        </div>

        <div id="regex_test_mode" className="flex1 flex-container displayNone">
            <div className="flex1">
                <label className="title_restorable" htmlFor="regex_test_input">
                    <small data-i18n="Input">Input</small>
                </label>
                <textarea id="regex_test_input" className="text_pole textarea_compact" rows={4} data-i18n="[placeholder]ext_regex_test_input_placeholder" placeholder="Type here..."></textarea>
            </div>
            <div className="flex1">
                <label className="title_restorable" htmlFor="regex_test_output">
                    <small data-i18n="Output">Output</small>
                </label>
                <textarea id="regex_test_output" className="text_pole textarea_compact" rows={4} data-i18n="[placeholder]ext_regex_output_placeholder" placeholder="Empty" readOnly></textarea>
            </div>
            <hr />
        </div>

        <div className="flex-container flexFlowColumn">
            <div className="flex1">
                <label htmlFor="regex_script_name" className="title_restorable">
                    <small data-i18n="Script Name">Script Name</small>
                </label>
                <div>
                    <input className="regex_script_name text_pole textarea_compact" type="text" />
                </div>
            </div>
            <div className="flex1">
                <label htmlFor="find_regex" className="title_restorable">
                    <small data-i18n="Find Regex">Find Regex</small>
                </label>
                <div>
                    <input className="find_regex text_pole textarea_compact" type="text" />
                </div>
            </div>
            <div className="flex1">
                <label htmlFor="regex_replace_string" className="title_restorable">
                    <small data-i18n="Replace With">Replace With</small>
                </label>
                <div>
                    <textarea className="regex_replace_string text_pole wide100p textarea_compact" data-i18n="[placeholder]ext_regex_replace_string_placeholder" placeholder="Use {{match}} to include the matched text from the Find Regex, $1, $2, etc. for numbered capture groups, or $<name> for named capture groups." rows={3}></textarea>
                </div>
            </div>
            <div className="flex1">
                <label htmlFor="regex_trim_strings" className="title_restorable">
                    <small data-i18n="Trim Out">Trim Out</small>
                </label>
                <div>
                    <textarea className="regex_trim_strings text_pole wide100p textarea_compact" data-i18n="[placeholder]ext_regex_trim_placeholder" placeholder="Globally trims any unwanted parts from a regex match before replacement. Separate each element by an enter." rows={3}></textarea>
                </div>
            </div>
        </div>

        <div className="flex-container">
            <div className="flex1 wi-enter-footer-text flex-container flexFlowColumn flexNoGap alignitemsstart">
                <small data-i18n="ext_regex_affects">Affects</small>
                <div data-i18n="[title]ext_regex_user_input_desc" title="Messages sent by the user.">
                    <label className="checkbox flex-container">
                        <input type="checkbox" name="replace_position" defaultValue="1" />
                        <span data-i18n="ext_regex_user_input">User Input</span>
                    </label>
                </div>
                <div data-i18n="[title]ext_regex_ai_input_desc" title="Messages received from the Generation API.">
                    <label className="checkbox flex-container">
                        <input type="checkbox" name="replace_position" defaultValue="2" />
                        <span data-i18n="ext_regex_ai_output">AI Output</span>
                    </label>
                </div>
                <div data-i18n="[title]ext_regex_slash_desc" title="Messages sent using STscript commands.">
                    <label className="checkbox flex-container">
                        <input type="checkbox" name="replace_position" defaultValue="3" />
                        <span data-i18n="Slash Commands">Slash Commands</span>
                    </label>
                </div>
                <div data-i18n="[title]ext_regex_wi_desc" title="Lorebook/World Info entry contents. Requires 'Only Format Prompt' to be checked!">
                    <label className="checkbox flex-container">
                        <input type="checkbox" name="replace_position" defaultValue="5" />
                        <span data-i18n="World Info">World Info</span>
                    </label>
                </div>
                <div data-i18n="[title]ext_regex_reasoning_desc" title="Reasoning block contents. When 'Only Format Prompt' is checked, it will also affect the reasoning contents added to the prompt.">
                    <label className="checkbox flex-container">
                        <input type="checkbox" name="replace_position" defaultValue="6" />
                        <span data-i18n="Reasoning">Reasoning</span>
                    </label>
                </div>
                <div className="flex-container wide100p marginTop5">
                    <div className="flex1 flex-container flexNoGap">
                        <small data-i18n="[title]ext_regex_min_depth_desc" title="When applied to prompts or display, only affect messages that are at least N levels deep. 0 = last message, 1 = penultimate message, etc. System prompt and utility prompts are not affected. When blank / 'Unlimited' or -1, also affect message to continue on Continue.">
                            <span data-i18n="Min Depth">Min Depth</span>
                            <span className="fa-solid fa-circle-question note-link-span"></span>
                        </small>
                        <input name="min_depth" className="text_pole textarea_compact" type="number" min="-1" max="9999" data-i18n="[placeholder]ext_regex_min_depth_placeholder" placeholder="Unlimited" />
                    </div>
                    <div className="flex1 flex-container flexNoGap">
                        <small data-i18n="[title]ext_regex_max_depth_desc" title="When applied to prompts or display, only affect messages no more than N levels deep. 0 = last message, 1 = penultimate message, etc. System prompt and utility prompts are not affected. Max must be greater than Min for regex to apply.">
                            <span data-i18n="Max Depth">Max Depth</span>
                            <span className="fa-solid fa-circle-question note-link-span"></span>
                        </small>
                        <input name="max_depth" className="text_pole textarea_compact" type="number" min="0" max="9999" data-i18n="[placeholder]ext_regex_min_depth_placeholder" placeholder="Unlimited" />
                    </div>
                </div>
            </div>
            <div className="flex1 wi-enter-footer-text flex-container flexFlowColumn flexNoGap alignitemsstart">
                <small data-i18n="ext_regex_other_options">Other Options</small>
                <label className="checkbox flex-container">
                    <input type="checkbox" name="disabled" />
                    <span data-i18n="Disabled">Disabled</span>
                </label>
                <label className="checkbox flex-container" data-i18n="[title]ext_regex_run_on_edit_desc" title="Run the regex script when the message belonging a to specified role(s) is edited.">
                    <input type="checkbox" name="run_on_edit" />
                    <span data-i18n="Run On Edit">Run On Edit</span>
                </label>
                <label className="checkbox flex-container flexNoGap marginBot5" data-i18n="[title]ext_regex_substitute_regex_desc" title={"Substitute {{macros}} in Find Regex before running it"}>
                    <span>
                        <small data-i18n="Macro in Find Regex">Macros in Find Regex</small>
                        <span className="fa-solid fa-circle-question note-link-span"></span>
                    </span>
                    <select name="substitute_regex" className="text_pole textarea_compact margin0">
                        <option value="0" data-i18n="Don't substitute">Don't substitute</option>
                        <option value="1" data-i18n="Substitute (raw)">Substitute (raw)</option>
                        <option value="2" data-i18n="Substitute (escaped)">Substitute (escaped)</option>
                    </select>
                </label>
                <span>
                    <small data-i18n="Ephemerality">Ephemerality</small>
                    <span className="fa-solid fa-circle-question note-link-span" data-i18n="[title]ext_regex_other_options_desc" title={"By default, regex scripts alter the chat file directly and irreversibly.\rEnabling either (or both) of the options below will prevent chat file alteration, while still altering the specified item(s)."}></span>
                </span>
                <label className="checkbox flex-container" data-i18n="[title]ext_regex_only_format_visual_desc" title="Chat history file contents won't change, but regex will be applied to the messages displayed in the Chat UI.">
                    <input type="checkbox" name="only_format_display" />
                    <span data-i18n="Only Format Display">Alter Chat Display</span>
                </label>
                <label className="checkbox flex-container" data-i18n="[title]ext_regex_only_format_prompt_desc" title="Chat history file contents won't change, but regex will be applied to the outgoing prompt before it is sent to the LLM.">
                    <input type="checkbox" name="only_format_prompt" />
                    <span data-i18n="Only Format Prompt (?)">Alter Outgoing Prompt</span>
                </label>

            </div>
        </div>
    </div>
</div>
    );
}
