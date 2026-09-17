export function AdvancedFormattingPanel() {
    return (
        <>
                <div className="flex-container alignItemsBaseline">
                    <h3 className="margin0 flex1 flex-container alignItemsBaseline">
                        <span data-i18n="Advanced Formatting">
                            Advanced Formatting
                        </span>

                        <a href="usage/core-concepts/advancedformatting/" className="notes-link" target="_blank">
                            <span className="fa-solid fa-circle-question note-link-span"></span>
                        </a>
                    </h3>
                    <div className="flex-container" data-cc-null>
                        <input id="af_master_import_file" type="file" hidden accept=".json" className="displayNone" />
                        <div id="af_master_import" className="menu_button menu_button_icon" title={"Import Advanced Formatting settings\n\nYou can also provide legacy files for Instruct and Context templates."} data-i18n="[title]Import Advanced Formatting settings">
                            <i className="fa-solid fa-file-import" />
                            <span data-i18n="Master Import">Master Import</span>
                        </div>
                        <div id="af_master_export" className="menu_button menu_button_icon" title="Export Advanced Formatting settings" data-i18n="[title]Export Advanced Formatting settings">
                            <i className="fa-solid fa-file-export" />
                            <span data-i18n="Master Export">Master Export</span>
                        </div>
                    </div>
                </div>
                <div id="advanced-formatting-cc-notice" className="info-block warning">
                    <i className="fa-solid fa-triangle-exclamation" />
                    <span data-i18n="Grayed-out options have no effect when Chat Completion API is used.">
                        Grayed-out options have no effect when Chat Completion API is used.
                    </span>
                </div>
                <div className="flex-container spaceEvenly">
                    <div id="ContextSettings" className="flex-container flexNoGap flexFlowColumn flex1">
                        <div>
                            <h4 className="standoutHeader title_restorable" data-cc-null>
                                <div>
                                    <span data-i18n="Context Template">Context Template</span>
                                </div>
                                <div className="flex-container">
                                    <label htmlFor="context_derived" className="checkbox_label flex1" title="Derive from Model Metadata, if possible." data-i18n="[title]context_derived">
                                        <input id="context_derived" type="checkbox" style={{ "display": "none" }} />
                                        <small><i className="fa-solid fa-bolt menu_button margin0" /></small>
                                    </label>
                                </div>
                            </h4>
                            <div className="flex-container" title="Select your current Context Template" data-i18n="[title]Select your current Context Template" data-cc-null>
                                <select id="context_presets" data-preset-manager-htmlFor="context" className="flex1 text_pole"></select>
                                <div className="flex-container justifyCenter gap3px">
                                    <input type="file" hidden data-preset-manager-file="context" accept=".json, .settings" />
                                    <i data-preset-manager-update="context" className="menu_button fa-solid fa-save" title="Update current template" data-i18n="[title]Update current template" />
                                    <i data-preset-manager-rename="context" className="menu_button fa-pencil fa-solid" title="Rename current template" data-i18n="[title]Rename current template" />
                                    <i data-preset-manager-new="context" className="menu_button fa-solid fa-file-circle-plus" title="Save template as" data-i18n="[title]Save template as" />
                                    <i data-preset-manager-import="context" className="displayNone menu_button fa-solid fa-file-import" title="Import template" data-i18n="[title]Import template" />
                                    <i data-preset-manager-export="context" className="displayNone menu_button fa-solid fa-file-export" title="Export template" data-i18n="[title]Export template" />
                                    <i data-preset-manager-restore="context" className="menu_button fa-solid fa-recycle" title="Restore current template" data-i18n="[title]Restore current template" />
                                    <i id="context_delete_preset" data-preset-manager-delete="context" className="menu_button fa-solid fa-trash-can" title="Delete the template" data-i18n="[title]Delete the template" />
                                </div>
                            </div>
                            <div>
                                <div data-cc-null>
                                    <label htmlFor="context_story_string" className="flex-container">
                                        <small data-i18n="Story String">Story String</small>
                                        <i className="editor_maximize fa-solid fa-maximize right_menu_button" data-for="context_story_string" title="Expand the editor" data-i18n="[title]Expand the editor" />
                                    </label>
                                    <textarea id="context_story_string" data-macros className="text_pole textarea_compact autoSetHeight"></textarea>
                                </div>
                                <div className="flex-container flexFlowColumn" data-cc-null>
                                    <div id="context_story_string_position_block">
                                        <label htmlFor="context_story_string_position">
                                            <small data-i18n="Position:">Position:</small>
                                        </label>
                                        <select id="context_story_string_position" className="text_pole">
                                            <option value="0" data-i18n="Default (top of context)">Default (top of context)</option>
                                            <option value="1" data-i18n="In-chat @ Depth">In-chat @ Depth</option>
                                        </select>
                                    </div>
                                    <div id="context_story_string_inject_settings" className="flex-container">
                                        <div className="flex1">
                                            <label htmlFor="context_story_string_depth">
                                                <small data-i18n="Depth:">Depth:</small>
                                            </label>
                                            <input type="number" id="context_story_string_depth" className="text_pole" min="0" max="" />
                                        </div>
                                        <div className="flex1">
                                            <label htmlFor="context_story_string_role">
                                                <small data-i18n="Role:">Role:</small>
                                            </label>
                                            <select id="context_story_string_role" className="text_pole">
                                                <option data-i18n="System" value="0">System</option>
                                                <option data-i18n="User" value="1">User</option>
                                                <option data-i18n="Assistant" value="2">Assistant</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex-container" data-cc-null>
                                    <div className="flex1">
                                        <label htmlFor="context_example_separator">
                                            <small data-i18n="Example Separator">Example Separator</small>
                                        </label>
                                        <div>
                                            <textarea id="context_example_separator" data-macros className="text_pole textarea_compact autoSetHeight"></textarea>
                                        </div>
                                    </div>
                                    <div className="flex1">
                                        <label htmlFor="context_chat_start">
                                            <small data-i18n="Chat Start">Chat Start</small>
                                        </label>
                                        <div>
                                            <textarea id="context_chat_start" data-macros className="text_pole textarea_compact autoSetHeight"></textarea>
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <h4 className="standoutHeader">
                                        <span data-i18n="Context Formatting">
                                            Context Formatting
                                        </span>
                                    </h4>

                                    <label className="checkbox_label" htmlFor="always-force-name2-checkbox" data-cc-null>
                                        <input id="always-force-name2-checkbox" type="checkbox" />
                                        <small data-i18n="Always add character's name to prompt">
                                            Always add character's name to prompt
                                        </small>
                                    </label>
                                    <label className="checkbox_label" htmlFor="single_line" data-cc-null>
                                        <input id="single_line" type="checkbox" />
                                        <small data-i18n="Generate only one line per request">
                                            Generate only one line per request
                                        </small>
                                    </label>
                                    <label className="checkbox_label" htmlFor="collapse-newlines-checkbox">
                                        <input id="collapse-newlines-checkbox" type="checkbox" />
                                        <small data-i18n="Collapse Consecutive Newlines">
                                            Collapse Consecutive Newlines
                                        </small>
                                    </label>
                                    <label className="checkbox_label" htmlFor="trim_spaces">
                                        <input id="trim_spaces" type="checkbox" />
                                        <small data-i18n="Trim spaces">Trim spaces</small>
                                        <i className="fa-sm fa-solid fa-exclamation-triangle warning" title="Disabling is not recommended." data-i18n="[title]Disabling is not recommended." />
                                    </label>
                                    <label className="checkbox_label" htmlFor="trim_sentences_checkbox">
                                        <input id="trim_sentences_checkbox" type="checkbox" />
                                        <small data-i18n="Trim Incomplete Sentences">
                                            Trim Incomplete Sentences
                                        </small>
                                    </label>
                                    <label className="checkbox_label" title="Add Chat Start and Example Separator to a list of stopping strings." data-i18n="[title]Add Chat Start and Example Separator to a list of stopping strings." data-cc-null>
                                        <input id="context_use_stop_strings" type="checkbox" />
                                        <small data-i18n="Separators as Stop Strings">Separators as Stop Strings</small>
                                    </label>
                                    <label className="checkbox_label" title="Add Character and User names to a list of stopping strings." data-i18n="[title]Add Character and User names to a list of stopping strings." data-cc-null>
                                        <input id="context_names_as_stop_strings" type="checkbox" />
                                        <small data-i18n="Names as Stop Strings">Names as Stop Strings</small>
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div id="InstructSettingsColumn" className="flex-container flexNoGap flexFlowColumn flex1" data-cc-null>
                        <h4 className="standoutHeader title_restorable justifySpaceBetween">
                            <div className="flex-container">
                                <span data-i18n="Instruct Template">Instruct Template</span>
                            </div>
                            <div className="flex-container">
                                <label htmlFor="instruct_derived" className="checkbox_label flex1" title="Derive from Model Metadata, if possible." data-i18n="[title]instruct_derived">
                                    <input id="instruct_derived" type="checkbox" style={{ "display": "none" }} />
                                    <small><i className="fa-solid fa-bolt menu_button margin0" /></small>
                                </label>
                                <label htmlFor="instruct_bind_to_context" className="checkbox_label flex1" title={"Bind to Context\nIf enabled, Context templates will be automatically selected based on selected Instruct template name or by preference."} data-i18n="[title]instruct_bind_to_context">
                                    <input id="instruct_bind_to_context" type="checkbox" style={{ "display": "none" }} />
                                    <small><i className="fa-solid fa-link menu_button margin0" /></small>
                                </label>
                                <label id="instruct_enabled_label" htmlFor="instruct_enabled" className="checkbox_label flex1" title="Enable Instruct Mode" data-i18n="[title]instruct_enabled">
                                    <input id="instruct_enabled" type="checkbox" style={{ "display": "none" }} />
                                    <small><i className="fa-solid fa-power-off menu_button togglable margin0" /></small>
                                </label>
                            </div>
                        </h4>
                        <div id="instructSettingsBlock">


                            <div className="flex-container" title="Select your current Instruct Template" data-i18n="[title]Select your current Instruct Template">
                                <select id="instruct_presets" data-preset-manager-htmlFor="instruct" className="flex1 text_pole"></select>
                                <div className="flex-container margin0 justifyCenter gap3px">
                                    <input type="file" hidden data-preset-manager-file="instruct" accept=".json, .settings" />
                                    <i data-preset-manager-update="instruct" className="menu_button fa-solid fa-save" title="Update current template" data-i18n="[title]Update current template" />
                                    <i data-preset-manager-rename="instruct" className="menu_button fa-pencil fa-solid" title="Rename current template" data-i18n="[title]Rename current template" />
                                    <i data-preset-manager-new="instruct" className="menu_button fa-solid fa-file-circle-plus" title="Save template as" data-i18n="[title]Save template as" />
                                    <i data-preset-manager-import="instruct" className="displayNone menu_button fa-solid fa-file-import" title="Import template" data-i18n="[title]Import template" />
                                    <i data-preset-manager-export="instruct" className="displayNone menu_button fa-solid fa-file-export" title="Export template" data-i18n="[title]Export template" />
                                    <i data-preset-manager-restore="instruct" className="menu_button fa-solid fa-recycle" title="Restore current template" data-i18n="[title]Restore current template" />
                                    <i data-preset-manager-delete="instruct" className="menu_button fa-solid fa-trash-can" title="Delete template" data-i18n="[title]Delete template" />
                                </div>
                            </div>
                            <label>
                                <small>
                                    <span data-i18n="Activation Regex">Activation Regex</span>
                                    <span className="fa-solid fa-circle-question" data-i18n="[title]instruct_template_activation_regex_desc" title="When connecting to an API or choosing a model, automatically activate this Instruct Template if the model name matches the provided regular expression."></span>
                                </small>
                            </label>
                            <div>
                                <input type="text" id="instruct_activation_regex" className="text_pole textarea_compact" placeholder="e.g. /llama(-)?[3|3.1]/i" />
                            </div>
                            <div>
                                <label htmlFor="instruct_wrap" className="checkbox_label">
                                    <input id="instruct_wrap" type="checkbox" />
                                    <small data-i18n="Wrap Sequences with Newline">Wrap Sequences with Newline</small>
                                </label>
                                <label htmlFor="instruct_macro" className="checkbox_label">
                                    <input id="instruct_macro" type="checkbox" />
                                    <small data-i18n="Replace Macro in Sequences">Replace Macro in Sequences</small>
                                </label>
                                <label htmlFor="instruct_sequences_as_stop_strings" className="checkbox_label">
                                    <input id="instruct_sequences_as_stop_strings" type="checkbox" />
                                    <small data-i18n="Sequences as Stop Strings">Sequences as Stop Strings</small>
                                </label>
                                <label htmlFor="instruct_skip_examples" className="checkbox_label">
                                    <input id="instruct_skip_examples" type="checkbox" />
                                    <small data-i18n="Skip Example Dialogues Formatting">Skip Example Dialogues Formatting</small>
                                </label>
                                <div>
                                    <small data-i18n="Include Names">
                                        Include Names
                                    </small>
                                    <select id="instruct_names_behavior">
                                        <option value="none" data-i18n="Never">Never</option>
                                        <option value="force" data-i18n="Force">Force</option>
                                        <option value="always" data-i18n="Always">Always</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div id="InstructSequencesColumn" className="wide100p flexFlowColumn">
                            <h4 className="standoutHeader title_restorable">
                                <b>
                                    <span data-i18n="Instruct Sequences">
                                        Instruct Sequences
                                    </span>
                                </b>
                            </h4>
                            {/* We keep some auto-open so the user would know what is going on in the picked template */}
                            <details open>
                                <summary>
                                    <span data-i18n="Story String Sequences">Story String Sequences</span>
                                    <small className="fa-solid fa-question-circle" title="Used in Default position only." data-i18n="[title]Used in Default position only."></small>
                                </summary>
                                <div className="flex-container">
                                    <div className="flexAuto" title="Inserted before a Story String." data-i18n="[title]Inserted before a Story String.">
                                        <label htmlFor="instruct_story_string_prefix">
                                            <small data-i18n="Story String Prefix">Story String Prefix</small>
                                        </label>
                                        <div>
                                            <textarea id="instruct_story_string_prefix" className="text_pole textarea_compact autoSetHeight"></textarea>
                                        </div>
                                    </div>
                                    <div className="flexAuto" title="Inserted after a Story String." data-i18n="[title]Inserted after a Story String.">
                                        <label htmlFor="instruct_story_string_suffix">
                                            <small data-i18n="Story String Suffix">Story String Suffix</small>
                                        </label>
                                        <div>
                                            <textarea id="instruct_story_string_suffix" className="text_pole wide100p textarea_compact autoSetHeight"></textarea>
                                        </div>
                                    </div>
                                </div>
                            </details>
                            <details open>
                                <summary data-i18n="User Message Sequences">User Message Sequences</summary>
                                <div className="flex-container">
                                    <div className="flexAuto" title="Inserted before a User message and as a last prompt line when impersonating." data-i18n="[title]Inserted before a User message and as a last prompt line when impersonating.">
                                        <small data-i18n="User Prefix">User Message Prefix</small>
                                        <textarea id="instruct_input_sequence" data-macros className="text_pole textarea_compact autoSetHeight"></textarea>
                                    </div>
                                    <div className="flexAuto" title="Inserted after a User message." data-i18n="[title]Inserted after a User message.">
                                        <small data-i18n="User Suffix">User Message Suffix</small>
                                        <textarea id="instruct_input_suffix" data-macros className="text_pole wide100p textarea_compact autoSetHeight"></textarea>
                                    </div>
                                </div>
                            </details>
                            <details open>
                                <summary data-i18n="Assistant Message Sequences">Assistant Message Sequences</summary>
                                <div className="flex-container">
                                    <div className="flexAuto" title="Inserted before an Assistant message and as a last prompt line when generating an AI reply." data-i18n="[title]Inserted before an Assistant message and as a last prompt line when generating an AI reply.">
                                        <small data-i18n="Assistant Prefix">Assistant Message Prefix</small>
                                        <textarea id="instruct_output_sequence" data-macros className="text_pole wide100p textarea_compact autoSetHeight"></textarea>
                                    </div>
                                    <div className="flexAuto" title="Inserted after an Assistant message." data-i18n="[title]Inserted after an Assistant message.">
                                        <small data-i18n="Assistant Suffix">Assistant Message Suffix</small>
                                        <textarea id="instruct_output_suffix" data-macros className="text_pole wide100p textarea_compact autoSetHeight"></textarea>
                                    </div>
                                </div>
                            </details>
                            <details>
                                <summary data-i18n="System Message Sequences">System Message Sequences</summary>
                                <div className="flex-container">
                                    <div className="flexAuto" id="instruct_system_sequence_block" title="Inserted before a System (added by slash commands or extensions) message." data-i18n="[title]Inserted before a System (added by slash commands or extensions) message.">
                                        <small data-i18n="System Prefix">System Message Prefix</small>
                                        <textarea id="instruct_system_sequence" data-macros className="text_pole textarea_compact autoSetHeight"></textarea>
                                    </div>
                                    <div className="flexAuto" id="instruct_system_suffix_block" title="Inserted after a System message." data-i18n="[title]Inserted after a System message.">
                                        <small data-i18n="System Suffix">System Message Suffix</small>
                                        <textarea id="instruct_system_suffix" data-macros className="text_pole wide100p textarea_compact autoSetHeight"></textarea>
                                    </div>
                                </div>
                                <div className="flexBasis100p" title="If enabled, System Sequences will be the same as User Sequences." data-i18n="[title]If enabled, System Sequences will be the same as User Sequences.">
                                    <label className="checkbox_label" htmlFor="instruct_system_same_as_user">
                                        <input id="instruct_system_same_as_user" type="checkbox" />
                                        <small data-i18n="System same as User">System same as User</small>
                                    </label>
                                </div>
                            </details>
                            <details>
                                <summary data-i18n="Misc. Sequences">Misc. Sequences</summary>
                                <div className="flex-container">
                                    <div className="flexAuto" title="Inserted before the first Assistant's message." data-i18n="[title]Inserted before the first Assistant's message.">
                                        <small data-i18n="First Assistant Prefix">First Assistant Prefix</small>
                                        <textarea id="instruct_first_output_sequence" data-macros className="text_pole textarea_compact autoSetHeight"></textarea>
                                    </div>
                                    <div className="flexAuto" title="Inserted before the last Assistant's message or as a last prompt line when generating an AI reply (except a neutral/system role)." data-i18n="[title]instruct_last_output_sequence">
                                        <small data-i18n="Last Assistant Prefix">Last Assistant Prefix</small>
                                        <textarea id="instruct_last_output_sequence" data-macros className="text_pole wide100p textarea_compact autoSetHeight"></textarea>
                                    </div>
                                </div>
                                <div className="flex-container">
                                    <div className="flexAuto" title="Inserted before the first User's message." data-i18n="[title]Inserted before the first User's message.">
                                        <small data-i18n="First User Prefix">First User Prefix</small>
                                        <textarea id="instruct_first_input_sequence" data-macros className="text_pole textarea_compact autoSetHeight"></textarea>
                                    </div>
                                    <div className="flexAuto" title="Inserted before the last User's message or as a last prompt line when generating an impersonation." data-i18n="[title]instruct_last_input_sequence">
                                        <small data-i18n="Last User Prefix">Last User Prefix</small>
                                        <textarea id="instruct_last_input_sequence" data-macros className="text_pole wide100p textarea_compact autoSetHeight"></textarea>
                                    </div>
                                </div>
                                <div className="flex-container">
                                    <div className="flexAuto" title="Will be inserted as a last prompt line when using system/neutral generation." data-i18n="[title]Will be inserted as a last prompt line when using system/neutral generation.">
                                        <small data-i18n="System Instruction Prefix">System Instruction Prefix</small>
                                        <textarea id="instruct_last_system_sequence" data-macros className="text_pole textarea_compact autoSetHeight"></textarea>
                                    </div>
                                    <div className="flexAuto" title="If a stop sequence is generated, everything past it will be removed from the output (inclusive)." data-i18n="[title]If a stop sequence is generated, everything past it will be removed from the output (inclusive).">
                                        <small data-i18n="Stop Sequence">Stop Sequence</small>
                                        <textarea id="instruct_stop_sequence" data-macros className="text_pole textarea_compact autoSetHeight"></textarea>
                                    </div>
                                </div>
                                <div className="flex-container">
                                    <div className="flexAuto" title="Will be inserted at the start of the chat history if it doesn't start with a User message." data-i18n="[title]Will be inserted at the start of the chat history if it doesn't start with a User message.">
                                        <small data-i18n="User Filler Message">User Filler Message</small>
                                        <textarea id="instruct_user_alignment_message" data-macros className="text_pole textarea_compact autoSetHeight"></textarea>
                                    </div>
                                </div>
                            </details>
                        </div>
                    </div>
                    <div id="SystemPromptColumn" className="flex-container flexNoGap flexFlowColumn flex1">
                        <h4 className="standoutHeader title_restorable justifySpaceBetween" data-cc-null>
                            <div className="flex-container">
                                <span data-i18n="System Prompt">System Prompt</span>
                            </div>
                            <div className="flex-container">
                                <label id="sysprompt_enabled_label" htmlFor="sysprompt_enabled" className="checkbox_label flex1" title="Enable System Prompt" data-i18n="[title]sysprompt_enabled">
                                    <input id="sysprompt_enabled" type="checkbox" style={{ "display": "none" }} />
                                    <small><i className="fa-solid fa-power-off menu_button togglable margin0" /></small>
                                </label>
                            </div>
                        </h4>
                        <div id="SystemPromptBlock" className="marginBot10" data-cc-null>
                            <div className="flex-container" title="Select your current System Prompt" data-i18n="[title]Select your current System Prompt">
                                <select id="sysprompt_select" data-preset-manager-htmlFor="sysprompt" className="flex1 text_pole"></select>
                                <div className="flex-container margin0 justifyCenter gap3px">
                                    <input type="file" hidden data-preset-manager-file="sysprompt" accept=".json, .settings" />
                                    <i data-preset-manager-update="sysprompt" className="menu_button fa-solid fa-save" title="Update current prompt" data-i18n="[title]Update current prompt" />
                                    <i data-preset-manager-rename="sysprompt" className="menu_button fa-pencil fa-solid" title="Rename current prompt" data-i18n="[title]Rename current prompt" />
                                    <i data-preset-manager-new="sysprompt" className="menu_button fa-solid fa-file-circle-plus" title="Save prompt as" data-i18n="[title]Save prompt as" />
                                    <i data-preset-manager-import="sysprompt" className="displayNone menu_button fa-solid fa-file-import" title="Import template" data-i18n="[title]Import template" />
                                    <i data-preset-manager-export="sysprompt" className="displayNone menu_button fa-solid fa-file-export" title="Export template" data-i18n="[title]Export template" />
                                    <i data-preset-manager-restore="sysprompt" className="menu_button fa-solid fa-recycle" title="Restore current prompt" data-i18n="[title]Restore current prompt" />
                                    <i data-preset-manager-delete="sysprompt" className="menu_button fa-solid fa-trash-can" title="Delete prompt" data-i18n="[title]Delete prompt" />
                                </div>
                            </div>

                            <div>
                                <label htmlFor="sysprompt_content" className="flex-container">
                                    <small data-i18n="Prompt Content">Prompt Content</small>
                                    <i className="editor_maximize fa-solid fa-maximize right_menu_button" data-for="sysprompt_content" title="Expand the editor" data-i18n="[title]Expand the editor" />
                                </label>
                                <textarea id="sysprompt_content" data-macros className="text_pole textarea_compact autoSetHeight"></textarea>
                            </div>

                            <div>
                                <label htmlFor="sysprompt_post_history" className="flex-container">
                                    <small data-i18n="Post-History Instructions">Post-History Instructions</small>
                                    <i className="editor_maximize fa-solid fa-maximize right_menu_button" data-for="sysprompt_post_history" title="Expand the editor" data-i18n="[title]Expand the editor" />
                                </label>
                                <textarea id="sysprompt_post_history" data-macros className="text_pole textarea_compact autoSetHeight"></textarea>
                            </div>
                        </div>

                        <div>
                            <h4 className="range-block-title justifyLeft standoutHeader">
                                <span data-i18n="Custom Stopping Strings">
                                    Custom Stopping Strings
                                </span>
                                <a href="usage/core-concepts/advancedformatting/#custom-stopping-strings" className="notes-link" target="_blank">
                                    <span className="fa-solid fa-circle-question note-link-span"></span>
                                </a>
                            </h4>
                            <div>
                                <small>
                                    <span data-i18n="JSON serialized array of strings">JSON serialized array of strings</span>
                                    <i className="fa-solid fa-question-circle opacity50p" title={"e.g: [\"Ford\", \"BMW\", \"Fiat\"]"} />
                                </small>
                            </div>
                            <div>
                                <textarea id="custom_stopping_strings" className="text_pole textarea_compact monospace autoSetHeight"></textarea>
                            </div>
                            <label className="checkbox_label" htmlFor="custom_stopping_strings_macro">
                                <input id="custom_stopping_strings_macro" type="checkbox" defaultChecked />
                                <small data-i18n="Replace Macro in Stop Strings">
                                    Replace Macro in Stop Strings
                                </small>
                            </label>
                        </div>

                        <div name="tokenizerSettingsBlock" data-cc-null>
                            <div name="tokenizerSelectorBlock">
                                <h4 className="standoutHeader"><span data-i18n="Tokenizer">Tokenizer</span>
                                    <a href="usage/prompts/tokenizer/" className="notes-link" target="_blank">
                                        <span className="fa-solid fa-circle-question note-link-span"></span>
                                    </a>
                                </h4>
                                <select id="tokenizer">
                                    <option value="99">Best match (recommended)</option>
                                    <option value="0">None / Estimated</option>
                                    <option value="1">GPT-2</option>
                                    {/* Option #2 was a legacy GPT-2/3 tokenizer */}
                                    <option value="3">Llama 1/2</option>
                                    <option value="12">Llama 3</option>
                                    <option value="13">Gemma / Gemini</option>
                                    <option value="14">Jamba</option>
                                    <option value="15">Qwen2</option>
                                    <option value="16">Command-R</option>
                                    <option value="19">Command-A</option>
                                    <option value="4">NerdStash (NovelAI Clio)</option>
                                    <option value="5">NerdStash v2 (NovelAI Kayra)</option>
                                    <option value="7">Mistral V1</option>
                                    <option value="17">Mistral Nemo</option>
                                    <option value="8">Yi</option>
                                    <option value="11">Claude 1/2</option>
                                    <option value="18">DeepSeek V3</option>
                                    <option value="6">API (WebUI / koboldcpp)</option>
                                </select>
                            </div>
                            <div className="range-block flex-container flexnowrap" name="tokenPaddingBlock">
                                <div className="range-block-title justifyLeft">
                                    <small data-i18n="Token Padding">
                                        Token Padding
                                    </small>
                                </div>
                                <input id="token_padding" className="text_pole textarea_compact" type="number" min="-2048" max="2048" step="1" />
                            </div>
                        </div>
                        <div>
                            <h4 className="standoutHeader">
                                <span data-i18n="Reasoning">Reasoning</span>
                            </h4>
                            <div>
                                <div className="flex-container alignItemsBaseline">
                                    <label className="checkbox_label flex1" htmlFor="reasoning_auto_parse" title="Automatically parse reasoning blocks from main content between the reasoning prefix/suffix. Both fields must be defined and non-empty." data-i18n="[title]reasoning_auto_parse">
                                        <input id="reasoning_auto_parse" type="checkbox" />
                                        <small data-i18n="Auto-Parse">
                                            Auto-Parse
                                        </small>
                                    </label>
                                    <label className="checkbox_label flex1" htmlFor="reasoning_auto_expand" title="Automatically expand reasoning blocks." data-i18n="[title]reasoning_auto_expand">
                                        <input id="reasoning_auto_expand" type="checkbox" />
                                        <small data-i18n="Auto-Expand">
                                            Auto-Expand
                                        </small>
                                    </label>
                                    <label className="checkbox_label flex1" htmlFor="reasoning_show_hidden" title="Show reasoning time for models with hidden reasoning." data-i18n="[title]reasoning_show_hidden">
                                        <input id="reasoning_show_hidden" type="checkbox" />
                                        <small data-i18n="Show Hidden">
                                            Show Hidden
                                        </small>
                                    </label>
                                </div>
                                <div className="flex-container alignItemsBaseline">
                                    <label className="checkbox_label flex1" htmlFor="reasoning_add_to_prompts" title="Add existing reasoning blocks to prompts. To add a new reasoning block, use the message edit menu." data-i18n="[title]reasoning_add_to_prompts">
                                        <input id="reasoning_add_to_prompts" type="checkbox" />
                                        <small data-i18n="Add to Prompts">
                                            Add to Prompts
                                        </small>
                                    </label>
                                    <div className="flex1 flex-container alignItemsBaseline" title="Maximum number of reasoning blocks to be added per prompt, counting from the last message." data-i18n="[title]reasoning_max_additions">
                                        <input id="reasoning_max_additions" className="text_pole textarea_compact widthUnset" type="number" min="0" max="999" />
                                        <small data-i18n="Max">Max</small>
                                    </div>
                                </div>
                                <details>
                                    <summary data-i18n="Reasoning Formatting">
                                        Reasoning Formatting
                                    </summary>
                                    <div className="flex-container" title="Select your current Reasoning Template" data-i18n="[title]Select your current Reasoning Template">
                                        <select id="reasoning_select" data-preset-manager-htmlFor="reasoning" className="flex1 text_pole"></select>
                                        <div className="flex-container margin0 justifyCenter gap3px">
                                            <input type="file" hidden data-preset-manager-file="reasoning" accept=".json, .settings" />
                                            <i data-preset-manager-update="reasoning" className="menu_button fa-solid fa-save" title="Update current template" data-i18n="[title]Update current template" />
                                            <i data-preset-manager-rename="reasoning" className="menu_button fa-pencil fa-solid" title="Rename current template" data-i18n="[title]Rename current template" />
                                            <i data-preset-manager-new="reasoning" className="menu_button fa-solid fa-file-circle-plus" title="Save template as" data-i18n="[title]Save template as" />
                                            <i data-preset-manager-import="reasoning" className="displayNone menu_button fa-solid fa-file-import" title="Import template" data-i18n="[title]Import template" />
                                            <i data-preset-manager-export="reasoning" className="displayNone menu_button fa-solid fa-file-export" title="Export template" data-i18n="[title]Export template" />
                                            <i data-preset-manager-restore="reasoning" className="menu_button fa-solid fa-recycle" title="Restore current template" data-i18n="[title]Restore current template" />
                                            <i data-preset-manager-delete="reasoning" className="menu_button fa-solid fa-trash-can" title="Delete template" data-i18n="[title]Delete template" />
                                        </div>
                                    </div>
                                    <div className="flex-container">
                                        <div className="flex1" title="Inserted before the reasoning content." data-i18n="[title]reasoning_prefix">
                                            <small data-i18n="Prefix">Prefix</small>
                                            <textarea id="reasoning_prefix" data-macros className="text_pole textarea_compact autoSetHeight"></textarea>
                                        </div>
                                        <div className="flex1" title="Inserted after the reasoning content." data-i18n="[title]reasoning_suffix">
                                            <small data-i18n="Suffix">Suffix</small>
                                            <textarea id="reasoning_suffix" data-macros className="text_pole textarea_compact autoSetHeight"></textarea>
                                        </div>
                                    </div>
                                    <div className="flex-container">
                                        <div className="flex1" title="Inserted between the reasoning and the message content." data-i18n="[title]reasoning_separator">
                                            <small data-i18n="Separator">Separator</small>
                                            <textarea id="reasoning_separator" data-macros className="text_pole textarea_compact autoSetHeight"></textarea>
                                        </div>
                                    </div>
                                </details>
                            </div>
                        </div>
                        <div>
                            <h4 className="standoutHeader" data-i18n="Miscellaneous">Miscellaneous</h4>
                            <div name="bindModelPresetBlock" data-cc-null>
                                <label htmlFor="bind_model_templates" className="checkbox_label">
                                    <input id="bind_model_templates" type="checkbox" />
                                    <small data-i18n="Bind Model to Templates">Bind Model to Templates</small>
                                    <span className="fa-solid fa-circle-question" data-i18n="[title]bind_model_templates_desc" title="When connecting to an API or choosing a model, automatically activate the current Instruct and Context templates if the model name or its chat template matches the currently loaded model."></span>
                                </label>
                            </div>
                            <div>
                                <small>
                                    <span data-i18n="Non-markdown strings">
                                        Non-markdown strings
                                    </span>
                                </small>
                                <div>
                                    <input id="markdown_escape_strings" data-macros className="text_pole textarea_compact" type="text" data-i18n="[placeholder]comma delimited,no spaces between" placeholder="comma delimited,no spaces between" />
                                </div>
                            </div>

                            <div name="startReplyWithBlock">
                                <div>
                                    <small>
                                        <span data-i18n="Start Reply With">
                                            Start Reply With
                                        </span>
                                    </small>
                                    <div>
                                        <textarea id="start_reply_with" data-macros className="text_pole textarea_compact autoSetHeight"></textarea>
                                    </div>
                                    <label className="checkbox_label" htmlFor="chat-show-reply-prefix-checkbox">
                                        <input id="chat-show-reply-prefix-checkbox" type="checkbox" />
                                        <small data-i18n="Show reply prefix in chat">
                                            Show reply prefix in chat
                                        </small>
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
        </>
    );
}
