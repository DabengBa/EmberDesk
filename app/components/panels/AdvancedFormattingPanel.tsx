import { ContractButton } from '../contract/ContractButton';
import { ContractIconButton } from '../contract/ContractIconButton';
import { PresetManagerActionsMenu } from '../preset-manager/PresetManagerActionsMenu';
export function AdvancedFormattingPanel() {
    return (
        <>
                <div className="flex-container alignItemsBaseline">
                    <h3 className="margin0 flex1 flex-container alignItemsBaseline">
                        <span data-i18n="Advanced Formatting">
                            Advanced Formatting
                        </span>

                        <a href="usage/core-concepts/advancedformatting/" className="notes-link" target="_blank" rel="noreferrer" aria-label="Advanced Formatting documentation">
                            <span className="fa-solid fa-circle-question note-link-span" aria-hidden="true"></span>
                        </a>
                    </h3>
                    <div className="flex-container">
                        <input id="af_master_import_file" type="file" hidden accept=".json" className="displayNone" />
                        <ContractButton id="af_master_import" className="menu_button menu_button_icon" label="Master Import" title="Import Advanced Formatting settings" titleKey="Import Advanced Formatting settings" nativeTitle icon={<i className="fa-solid fa-file-import" aria-hidden="true" />} />
                        <ContractButton id="af_master_export" className="menu_button menu_button_icon" label="Master Export" nativeTitle title="Export Advanced Formatting settings" icon={<i className="fa-solid fa-file-export" aria-hidden="true" />} />
                    </div>
                </div>
                <div className="flex-container spaceEvenly">
                    <div id="ContextSettings" className="flex-container flexNoGap flexFlowColumn flex1">
                        <div>
                            <h4 className="standoutHeader">
                                <span data-i18n="Context Formatting">
                                    Context Formatting
                                </span>
                            </h4>

                            <label className="checkbox_label" htmlFor="always-force-name2-checkbox">
                                <input id="always-force-name2-checkbox" type="checkbox" />
                                <small data-i18n="Always add character's name to prompt">
                                    Always add character's name to prompt
                                </small>
                            </label>
                            <label className="checkbox_label" htmlFor="single_line">
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
                        </div>
                    </div>
                    <div id="SystemPromptColumn" className="flex-container flexNoGap flexFlowColumn flex1">
                        <h4 className="standoutHeader title_restorable justifySpaceBetween">
                            <div className="flex-container">
                                <span data-i18n="System Prompt">System Prompt</span>
                            </div>
                            <div className="flex-container">
                                <label id="sysprompt_enabled_label" htmlFor="sysprompt_enabled" className="checkbox_label flex1" title="Enable System Prompt" data-i18n="[title]sysprompt_enabled">
                                    <input id="sysprompt_enabled" type="checkbox" style={{ "display": "none" }} />
                                    <small><i className="fa-solid fa-power-off menu_button togglable margin0" /></small>
                                    <span className="sr-only">Enable System Prompt</span>
                                </label>
                            </div>
                        </h4>
                        <div id="SystemPromptBlock" className="marginBot10">
                            <div className="flex-container" title="Select your current System Prompt" data-i18n="[title]Select your current System Prompt">
                                <select id="sysprompt_select" data-preset-manager-for="sysprompt" className="flex1 text_pole" aria-label="System Prompt"></select>
                                <div className="flex-container margin0 justifyCenter gap3px">
                                    <input type="file" hidden data-preset-manager-file="sysprompt" accept=".json, .settings" />
                                    <PresetManagerActionsMenu apiId="sysprompt" noun="prompt" />
                                </div>
                            </div>

                            <div>
                                <label htmlFor="sysprompt_content" className="flex-container">
                                    <small data-i18n="Prompt Content">Prompt Content</small>
                                    <ContractIconButton data-for="sysprompt_content" className="editor_maximize right_menu_button" label="Expand the editor" title="Expand the editor" nativeTitle icon={<i className="fa-solid fa-maximize" aria-hidden="true" />} />
                                </label>
                                <textarea id="sysprompt_content" data-macros className="text_pole textarea_compact autoSetHeight"></textarea>
                            </div>

                            <div>
                                <label htmlFor="sysprompt_post_history" className="flex-container">
                                    <small data-i18n="Post-History Instructions">Post-History Instructions</small>
                                    <ContractIconButton data-for="sysprompt_post_history" className="editor_maximize right_menu_button" label="Expand the editor" title="Expand the editor" nativeTitle icon={<i className="fa-solid fa-maximize" aria-hidden="true" />} />
                                </label>
                                <textarea id="sysprompt_post_history" data-macros className="text_pole textarea_compact autoSetHeight"></textarea>
                            </div>
                        </div>

                        <div>
                            <h4 className="range-block-title justifyLeft standoutHeader">
                                <span data-i18n="Custom Stopping Strings">
                                    Custom Stopping Strings
                                </span>
                                <a href="usage/core-concepts/advancedformatting/#custom-stopping-strings" className="notes-link" target="_blank" rel="noreferrer" aria-label="Custom stopping strings documentation">
                                    <span className="fa-solid fa-circle-question note-link-span" aria-hidden="true"></span>
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

                        <div name="tokenizerSettingsBlock">
                            <div name="tokenizerSelectorBlock">
                                <h4 className="standoutHeader"><span data-i18n="Tokenizer">Tokenizer</span>
                                    <a href="usage/prompts/tokenizer/" className="notes-link" target="_blank" rel="noreferrer" aria-label="Tokenizer documentation">
                                        <span className="fa-solid fa-circle-question note-link-span" aria-hidden="true"></span>
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
                                        <select id="reasoning_select" data-preset-manager-for="reasoning" className="flex1 text_pole" aria-label="Reasoning Template"></select>
                                        <div className="flex-container margin0 justifyCenter gap3px">
                                            <input type="file" hidden data-preset-manager-file="reasoning" accept=".json, .settings" />
                                            <PresetManagerActionsMenu apiId="reasoning" noun="template" />
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
