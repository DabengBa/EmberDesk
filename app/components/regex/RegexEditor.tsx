import { ContractButton } from '../contract/ContractButton';
import { translate, useTranslated } from '@/compat/i18n.js';
export function RegexEditor() {
    useTranslated('');
    return (
<div id="regex_editor_template">
    <div className="regex_editor">
        <h3 className="flex-container justifyCenter alignItemsBaseline">
            <strong >{translate('Regex Editor')}</strong>
            <a href="extensions/regex/" className="notes-link" target="_blank" rel="noopener noreferrer" aria-label="Regex documentation">
                <span className="note-link-span">?</span>
            </a>
            <ContractButton id="regex_test_mode_toggle" className="menu_button menu_button_icon" label="Test Mode" icon={<i className="fa-solid fa-bug fa-sm" aria-hidden="true" />} />
        </h3>

        <small className="flex-container extensions_info" >{translate('Regex is a tool to find/replace strings using regular expressions. If you want to learn more, click on the ? next to the title.')}</small>
        <hr />

        <div id="regex_info_block_wrapper">
            <div id="regex_info_block" className="info-block"></div>
            <a id="regex_info_block_flags_hint" href="extensions/regex/#flags" target="_blank" rel="noopener noreferrer" aria-label="Regex flags documentation">
                <i className="fa-solid fa-circle-info" data-i18n="[title]ext_regex_flags_help" title="Click here to learn more about regex flags." />
            </a>
        </div>

        <div id="regex_test_mode" className="flex1 flex-container displayNone">
            <div className="flex1">
                <label className="title_restorable" htmlFor="regex_test_input">
                    <small >{translate('Input')}</small>
                </label>
                <textarea id="regex_test_input" className="text_pole textarea_compact" rows={4} data-i18n="[placeholder]ext_regex_test_input_placeholder" placeholder="Type here..."></textarea>
            </div>
            <div className="flex1">
                <label className="title_restorable" htmlFor="regex_test_output">
                    <small >{translate('Output')}</small>
                </label>
                <textarea id="regex_test_output" className="text_pole textarea_compact" rows={4} data-i18n="[placeholder]ext_regex_output_placeholder" placeholder="Empty" readOnly></textarea>
            </div>
            <hr />
        </div>

        <div className="flex-container flexFlowColumn">
            <div className="flex1">
                <label htmlFor="regex_script_name" className="title_restorable">
                    <small >{translate('Script Name')}</small>
                </label>
                <div>
                    <input id="regex_script_name" className="regex_script_name text_pole textarea_compact" type="text" required aria-describedby="regex_name_error" aria-label="Script Name" data-i18n="[aria-label]Script Name" />
                    <small id="regex_name_error" className="regex-validation-error" role="alert" hidden></small>
                </div>
            </div>
            <div className="flex1">
                <label htmlFor="find_regex" className="title_restorable">
                    <small >{translate('Find Regex')}</small>
                </label>
                <div>
                    <input id="find_regex" className="find_regex text_pole textarea_compact" type="text" required aria-describedby="regex_find_error" aria-label="Find Regex" data-i18n="[aria-label]Find Regex" />
                    <small id="regex_find_error" className="regex-validation-error" role="alert" hidden></small>
                </div>
            </div>
            <div className="flex1">
                <label htmlFor="regex_replace_string" className="title_restorable">
                    <small >{translate('Replace With')}</small>
                </label>
                <div>
                    <textarea id="regex_replace_string" className="regex_replace_string text_pole wide100p textarea_compact" aria-label="Replace With" data-i18n="[aria-label]Replace With;[placeholder]ext_regex_replace_string_placeholder" placeholder="Use {{match}} to include the matched text from the Find Regex, $1, $2, etc. for numbered capture groups, or $<name> for named capture groups." rows={3}></textarea>
                </div>
            </div>
            <div className="flex1">
                <label htmlFor="regex_trim_strings" className="title_restorable">
                    <small >{translate('Trim Out')}</small>
                </label>
                <div>
                    <textarea id="regex_trim_strings" className="regex_trim_strings text_pole wide100p textarea_compact" aria-label="Trim Out" data-i18n="[aria-label]Trim Out;[placeholder]ext_regex_trim_placeholder" placeholder="Globally trims any unwanted parts from a regex match before replacement. Separate each element by an enter." rows={3}></textarea>
                </div>
            </div>
        </div>

        <div className="flex-container regex-editor-options">
            <div className="flex1 regex-editor-option-group" role="group" aria-label="Affects" aria-describedby="regex_placement_error" data-i18n="[aria-label]ext_regex_affects">
                <h4 >{translate('Affects')}</h4>
                <small id="regex_placement_error" className="regex-validation-error" role="alert" hidden></small>
                <div data-i18n="[title]ext_regex_user_input_desc" title="Messages sent by the user.">
                    <label className="checkbox flex-container">
                        <input type="checkbox" name="replace_position" defaultValue="1" />
                        <span >{translate('User Input')}</span>
                    </label>
                </div>
                <div data-i18n="[title]ext_regex_ai_input_desc" title="Messages received from the Generation API.">
                    <label className="checkbox flex-container">
                        <input type="checkbox" name="replace_position" defaultValue="2" />
                        <span >{translate('AI Output')}</span>
                    </label>
                </div>
                <div data-i18n="[title]ext_regex_slash_desc" title="Messages sent using STscript commands.">
                    <label className="checkbox flex-container">
                        <input type="checkbox" name="replace_position" defaultValue="3" />
                        <span >{translate('Slash Commands')}</span>
                    </label>
                </div>
                <div data-i18n="[title]ext_regex_wi_desc" title="Lorebook/World Info entry contents. Requires 'Only Format Prompt' to be checked!">
                    <label className="checkbox flex-container">
                        <input type="checkbox" name="replace_position" defaultValue="5" />
                        <span >{translate('World Info')}</span>
                    </label>
                </div>
                <div data-i18n="[title]ext_regex_reasoning_desc" title="Reasoning block contents. When 'Only Format Prompt' is checked, it will also affect the reasoning contents added to the prompt.">
                    <label className="checkbox flex-container">
                        <input type="checkbox" name="replace_position" defaultValue="6" />
                        <span >{translate('Reasoning')}</span>
                    </label>
                </div>
                <div className="flex-container wide100p marginTop5">
                    <div className="flex1 flex-container flexNoGap">
                        <small data-i18n="[title]ext_regex_min_depth_desc" title="When applied to prompts or display, only affect messages that are at least N levels deep. 0 = last message, 1 = penultimate message, etc. System prompt and utility prompts are not affected. When blank / 'Unlimited' or -1, also affect message to continue on Continue.">
                            <span >{translate('Min Depth')}</span>
                            <span className="fa-solid fa-circle-question note-link-span"></span>
                        </small>
                        <input name="min_depth" className="text_pole textarea_compact" type="number" min="-1" max="9999" aria-label="Min Depth" data-i18n="[aria-label]Min Depth;[placeholder]ext_regex_min_depth_placeholder" placeholder="Unlimited" />
                    </div>
                    <div className="flex1 flex-container flexNoGap">
                        <small data-i18n="[title]ext_regex_max_depth_desc" title="When applied to prompts or display, only affect messages no more than N levels deep. 0 = last message, 1 = penultimate message, etc. System prompt and utility prompts are not affected. Max must be greater than Min for regex to apply.">
                            <span >{translate('Max Depth')}</span>
                            <span className="fa-solid fa-circle-question note-link-span"></span>
                        </small>
                        <input name="max_depth" className="text_pole textarea_compact" type="number" min="0" max="9999" aria-label="Max Depth" data-i18n="[aria-label]Max Depth;[placeholder]ext_regex_min_depth_placeholder" placeholder="Unlimited" />
                    </div>
                </div>
            </div>
            <div className="flex1 regex-editor-option-group">
                <h4 >{translate('Other Options')}</h4>
                <label className="checkbox flex-container">
                    <input type="checkbox" name="disabled" />
                    <span >{translate('Disabled')}</span>
                </label>
                <label className="checkbox flex-container" data-i18n="[title]ext_regex_run_on_edit_desc" title="Run the regex script when the message belonging a to specified role(s) is edited.">
                    <input type="checkbox" name="run_on_edit" />
                    <span >{translate('Run On Edit')}</span>
                </label>
                <label className="checkbox flex-container flexNoGap marginBot5" data-i18n="[title]ext_regex_substitute_regex_desc" title={"Substitute {{macros}} in Find Regex before running it"} aria-label="Macros in Find Regex">
                    <span>
                        <small >{translate('Macros in Find Regex')}</small>
                        <span className="fa-solid fa-circle-question note-link-span"></span>
                    </span>
                    <select name="substitute_regex" className="text_pole textarea_compact margin0">
                        <option value="0" >{translate("Don't substitute")}</option>
                        <option value="1" >{translate('Substitute (raw)')}</option>
                        <option value="2" >{translate('Substitute (escaped)')}</option>
                    </select>
                </label>
                <span>
                    <small >{translate('Ephemerality')}</small>
                    <span className="fa-solid fa-circle-question note-link-span" data-i18n="[title]ext_regex_other_options_desc" title={"By default, regex scripts alter the chat file directly and irreversibly.\rEnabling either (or both) of the options below will prevent chat file alteration, while still altering the specified item(s)."}></span>
                </span>
                <label className="checkbox flex-container" data-i18n="[title]ext_regex_only_format_visual_desc" title="Chat history file contents won't change, but regex will be applied to the messages displayed in the Chat UI.">
                    <input type="checkbox" name="only_format_display" />
                    <span >{translate('Alter Chat Display')}</span>
                </label>
                <label className="checkbox flex-container" data-i18n="[title]ext_regex_only_format_prompt_desc" title="Chat history file contents won't change, but regex will be applied to the outgoing prompt before it is sent to the LLM.">
                    <input type="checkbox" name="only_format_prompt" />
                    <span >{translate('Alter Outgoing Prompt')}</span>
                </label>

            </div>
        </div>
    </div>
</div>
    );
}
