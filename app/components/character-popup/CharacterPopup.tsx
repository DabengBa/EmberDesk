import { ContractButton } from '../contract/ContractButton';
import { ContractIconButton } from '../contract/ContractIconButton';

/**
 * Advanced Definitions popup markup (React-owned inside #character_popup).
 * The popup shell stays legacy-owned: script.js toggles display/opacity and
 * binds #character_cross / #character_popup_ok after mount. Field IDs,
 * form="form_create" associations, and data-macros attributes are preserved.
 */
export function CharacterPopup() {
    return (
        <>
            <div id="character_popup_text">
                <h3 id="character_popup-button-h3" className="margin0"></h3> <span data-i18n="Advanced Definitions">- Advanced
                    Definitions</span>
            </div>
            <hr className="margin-bot-10px" />
            <ContractIconButton id="character_cross" label="Close" icon={<i className="fa-solid fa-circle-xmark" aria-hidden="true" />} />
            <div className="inline-drawer">
                <div className="inline-drawer-toggle inline-drawer-header">
                    <h4>
                        <span data-i18n="Prompt Overrides">Prompt Overrides</span>
                        <small data-i18n="(For Chat Completion and Instruct Mode)">(For Chat Completion and Instruct Mode)</small>
                    </h4>
                    <div className="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div className="inline-drawer-content">
                    <small data-i18n="Insert {{original}} into either box to include the respective default prompt from system settings.">Insert {'{{'}original{'}}'} into either box to include the respective default prompt from system settings.</small>
                    <div>
                        <h4 className="flex-container alignItemsBaseline">
                            <span data-i18n="Main Prompt">Main Prompt</span>
                            <ContractIconButton className="editor_maximize right_menu_button" data-for="system_prompt_textarea" label="Expand the editor" title="Expand the editor" icon={<i className="fa-solid fa-maximize" aria-hidden="true" />} />
                        </h4>
                        <textarea id="system_prompt_textarea" name="system_prompt" data-macros data-i18n="[placeholder]Any contents here will replace the default Main Prompt used for this character. (v2 spec: system_prompt)" placeholder={"Any contents here will replace the default Main Prompt used for this character.\n(v2 spec: system_prompt)"} form="form_create" className="text_pole" autoComplete="off" rows={3}></textarea>
                        <div className="extension_token_counter">
                            <span data-i18n="extension_token_counter">Tokens:</span> <span data-token-counter="system_prompt_textarea">counting...</span>
                        </div>
                    </div>
                    <div>
                        <h4 className="flex-container alignItemsBaseline">
                            <span data-i18n="Post-History Instructions">Post-History Instructions</span>
                            <ContractIconButton className="editor_maximize right_menu_button" data-for="post_history_instructions_textarea" label="Expand the editor" title="Expand the editor" icon={<i className="fa-solid fa-maximize" aria-hidden="true" />} />
                        </h4>
                        <textarea id="post_history_instructions_textarea" name="post_history_instructions" data-macros data-i18n="[placeholder]Any contents here will replace the default Post-History Instructions used for this character. (v2 spec: post_history_instructions)" placeholder={"Any contents here will replace the default Post-History Instructions used for this character.\n(v2 spec: post_history_instructions)"} form="form_create" className="text_pole" autoComplete="off" rows={3}></textarea>
                        <div className="extension_token_counter">
                            <span data-i18n="extension_token_counter">Tokens:</span> <span data-token-counter="post_history_instructions_textarea">counting...</span>
                        </div>
                    </div>
                </div>
            </div>
            <hr />
            <div className="inline-drawer">
                <div className="inline-drawer-toggle inline-drawer-header">
                    <h4 data-i18n="Creator's Metadata (Not sent with the AI prompt)">{/* This data-i18n attribute on the left is kept for backward compatibility, use the ones below when translating */}
                        <span data-i18n="Creator's Metadata">Creator's Metadata</span>
                        <small data-i18n="(Not sent with the AI Prompt)">(Not sent with the AI Prompt)</small>
                    </h4>
                    <div className="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div className="inline-drawer-content">
                    <small data-i18n="Everything here is optional">Everything here is optional</small>
                    <div className="flex-container flexnowrap">
                        <div className="flex1">
                            <h4 data-i18n="Created by">Created by</h4>
                            <textarea id="creator_textarea" name="creator" data-i18n="[placeholder](Botmaker's name / Contact Info)" placeholder="(Botmaker's name / Contact info)" form="form_create" className="text_pole" autoComplete="off" rows={2}></textarea>
                        </div>
                        <div className="flex1">
                            <h4 data-i18n="Character Version">Character Version</h4>
                            <textarea id="character_version_textarea" name="character_version" data-i18n="[placeholder](If you want to track character versions)" placeholder="(If you want to track character versions)" form="form_create" className="text_pole" autoComplete="off" rows={2}></textarea>
                        </div>
                    </div>
                    <div className="flex-container flexnowrap">
                        <div className="flex1">
                            <h4 className="flex-container alignItemsBaseline">
                                <span data-i18n="Creator's Notes">Creator's Notes</span>
                                <ContractIconButton className="editor_maximize" data-for="creator_notes_textarea" label="Expand the editor" title="Expand the editor" icon={<i className="fa-solid fa-maximize" aria-hidden="true" />} />
                            </h4>
                            <textarea id="creator_notes_textarea" name="creator_notes" data-i18n="[placeholder](Describe the bot, give use tips, or list the chat models it has been tested on. This will be displayed in the character list.)" placeholder="(Describe the bot, give use tips, or list the chat models it has been tested on. This will be displayed in the character list.)" form="form_create" className="text_pole" autoComplete="off" rows={4}></textarea>
                        </div>
                        <div className="flex1">
                            <h4 className="flex-container alignItemsBaseline">
                                <span data-i18n="Tags to Embed">Tags to Embed</span>
                                <ContractIconButton className="editor_maximize" data-for="tags_textarea" label="Expand the editor" title="Expand the editor" icon={<i className="fa-solid fa-maximize" aria-hidden="true" />} />
                            </h4>
                            <textarea id="tags_textarea" name="tags" data-i18n="[placeholder](Write a comma-separated list of tags)" placeholder="(Write a comma-separated list of tags)" form="form_create" className="text_pole" autoComplete="off" rows={4}></textarea>
                        </div>
                    </div>
                </div>
            </div>
            <hr />
            <div id="personality_div">
                <h4 className="flex-container alignItemsBaseline">
                    <span data-i18n="Personality summary">Personality summary</span>
                    <ContractIconButton className="editor_maximize right_menu_button" data-for="personality_textarea" label="Expand the editor" title="Expand the editor" icon={<i className="fa-solid fa-maximize" aria-hidden="true" />} />
                    <a href="usage/core-concepts/characterdesign/#personality-summary" className="notes-link" target="_blank"><span className="fa-solid fa-circle-question note-link-span"></span></a>
                </h4>
                <textarea id="personality_textarea" name="personality" data-macros data-i18n="[placeholder](A brief description of the personality)" placeholder="(A brief description of the personality)" form="form_create" className="text_pole" autoComplete="off" rows={4}></textarea>
                <div className="extension_token_counter">
                    <span data-i18n="extension_token_counter">Tokens:</span> <span data-token-counter="personality_textarea" data-token-permanent="true">counting...</span>
                </div>
            </div>
            <div id="scenario_div">
                <h4 className="flex-container alignItemsBaseline">
                    <span data-i18n="Scenario">Scenario</span>
                    <ContractIconButton className="editor_maximize right_menu_button" data-for="scenario_pole" label="Expand the editor" title="Expand the editor" icon={<i className="fa-solid fa-maximize" aria-hidden="true" />} />
                    <a href="usage/core-concepts/characterdesign/#scenario" className="notes-link" target="_blank">
                        <span className="fa-solid fa-circle-question note-link-span"></span>
                    </a>
                </h4>
                <textarea id="scenario_pole" name="scenario" data-macros data-i18n="[placeholder](Circumstances and context of the interaction)" placeholder="(Circumstances and context of the interaction)" className="text_pole" defaultValue="" autoComplete="off" form="form_create" rows={4}></textarea>
                <div className="extension_token_counter">
                    <span data-i18n="extension_token_counter">Tokens:</span> <span data-token-counter="scenario_pole" data-token-permanent="true">counting...</span>
                </div>
            </div>
            <div id="depth_prompt_div" className="flex-container">
                <div className="flex1">
                    <h4 className="flex-container alignItemsBaseline">
                        <span data-i18n="Character's Note">
                            Character's Note
                        </span>
                        <ContractIconButton className="editor_maximize right_menu_button" data-for="depth_prompt_prompt" label="Expand the editor" title="Expand the editor" icon={<i className="fa-solid fa-maximize" aria-hidden="true" />} />
                    </h4>
                    <textarea id="depth_prompt_prompt" name="depth_prompt_prompt" data-macros className="text_pole" rows={5} autoComplete="off" form="form_create" data-i18n="[placeholder](Text to be inserted in-chat @ designated depth and role)" placeholder="(Text to be inserted in-chat @ designated depth and role)"></textarea>
                </div>
                <div>
                    <h4>
                        <span data-i18n="@ Depth">
                            @ Depth
                        </span>
                    </h4>
                    <input id="depth_prompt_depth" name="depth_prompt_depth" className="text_pole textarea_compact m-t-0" type="number" min="0" max="9999" defaultValue="4" form="form_create" />
                    <h4>
                        <span data-i18n="Role">
                            Role
                        </span>
                    </h4>
                    <select id="depth_prompt_role" name="depth_prompt_role" form="form_create" className="text_pole textarea_compact m-t-0">
                        <option value="system" data-i18n="System">System</option>
                        <option value="user" data-i18n="User">User</option>
                        <option value="assistant" data-i18n="Assistant">Assistant</option>
                    </select>
                    <div className="extension_token_counter">
                        <span data-i18n="extension_token_counter">Tokens:</span> <span data-token-counter="depth_prompt_prompt" data-token-permanent="true">counting...</span>
                    </div>
                </div>
            </div>
            <hr />
            <div id="mes_example_div" className="flex-container flexFlowColumn">
                <div>
                    <h4 className="flex-container alignItemsBaseline">
                        <span data-i18n="Examples of dialogue" className="mdhotkey_location">Examples of dialogue</span>
                        <ContractIconButton className="editor_maximize right_menu_button" data-for="mes_example_textarea" label="Expand the editor" title="Expand the editor" icon={<i className="fa-solid fa-maximize" aria-hidden="true" />} />
                    </h4>
                    <h5>
                        <span data-i18n="Important to set the character's writing style.">Important to set the character's writing style.</span>
                        <a href="usage/core-concepts/characterdesign/#examples-of-dialogue" className="notes-link" target="_blank">
                            <span className="fa-solid fa-circle-question note-link-span"></span>
                        </a>
                    </h5>
                </div>
                <textarea id="mes_example_textarea" className="flexGrow mdHotkeys" name="mes_example" data-macros data-i18n="[placeholder](Examples of chat dialog. Begin each example with START on a new line.)" placeholder="(Examples of chat dialog. Begin each example with <START> on a new line.)" form="form_create" rows={6}></textarea>
                <div className="extension_token_counter">
                    <span data-i18n="extension_token_counter">Tokens:</span> <span data-token-counter="mes_example_textarea">counting...</span>
                </div>
                {/* TODO: Example chats handhold-editor concept: https://gist.github.com/Cohee1207/50da02a4001ac1adae9b440f9b8e1079 */}
            </div>
            <ContractButton id="character_popup_ok" className="menu_button" label="Save" />
        </>
    );
}
