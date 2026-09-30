import { ContractIconButton } from '../contract/ContractIconButton';
import { PresetActionsMenu } from './PresetActionsMenu';
/**
 * AI Response Configuration drawer markup (React-owned shell inside
 * #left-nav-panel). Behavior stays legacy: openai.js/power-user.js bind the
 * preserved IDs during initOpenAI/getSettings.
 */
export function AiConfigPanel() {
    return (
        <>
                <div id="left-nav-panelheader" className="fa-solid fa-grip drag-grabber"></div>
                <div id="lm_button_panel_pin_div" title="Locked = AI Configuration panel will stay open" data-i18n="[title]AI Configuration panel will stay open">
                    <input type="checkbox" id="lm_button_panel_pin" />
                    <label htmlFor="lm_button_panel_pin">
                        <span className="sr-only" data-i18n="AI Configuration panel will stay open">AI Configuration panel will stay open</span>
                        <div className="unchecked fa-solid fa-unlock right_menu_button"></div>
                        <div className="checked fa-solid fa-lock right_menu_button"></div>
                    </label>
                </div>
                <div id="labModeWarning" className="redWarningBG textAlignCenter displayNone" data-i18n="MAD LAB MODE ON">MAD LAB MODE ON</div>
                <div className="scrollableInner">
                    <div className="flex-container flexNoGap" id="ai_response_configuration">
                        <div id="respective-presets-block" className="width100p">
                            <div id="openai_api-presets">
                                <div>
                                    <div className="margin0 title_restorable preset-header">
                                        <strong>
                                            <span data-i18n="openaipresets">Presets</span>
                                        </strong>

                                        <div className="flex-container gap3px">
                                            <PresetActionsMenu />
                                        </div>
                                    </div>

                                    <div className="flex-container flexNoGap">
                                        <select id="settings_preset_openai" className="flex1 text_pole" data-preset-manager-for="openai">
                                            <option value="gui" data-i18n="Default">Default</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div id="respective-ranges-and-temps" className="width100p">
                            <div id="range_block_openai">
                                <div className="range-block-pair">
                                    <div className="range-block">
                                        <div className="range-block-title" data-i18n="Context">Context</div>
                                        <div className="input-with-unit" data-unit="k">
                                            <input type="number" id="openai_max_context" className="text_pole" data-unit="k" min="0.5" step="0.5" />
                                        </div>
                                    </div>
                                    <div className="range-block">
                                        <div className="range-block-title" data-i18n="Max Response">Max Response</div>
                                        <div className="input-with-unit" data-unit="k">
                                            <input type="number" id="openai_max_tokens" className="text_pole" data-unit="k" min="0.1" max="128" step="0.1" />
                                        </div>
                                    </div>
                                </div>
                                <div className="range-block">
                                    <label htmlFor="stream_toggle" title="Enable OpenAI completion streaming" data-i18n="[title]Enable OpenAI completion streaming" className="ai-switch-row widthFreeExpand">
                                        <input id="stream_toggle" type="checkbox" className="ai-switch-input" />
                                        <span className="ai-switch" aria-hidden="true"><span className="ai-switch-thumb" /></span>
                                        <span data-i18n="Streaming">Streaming</span>
                                    </label>
                                </div>
                            </div>
                        </div>
                        <div id="advanced-ai-config-block" className="width100p">
                            <div id="openai_settings">
                                <div className="range-block" data-source="openai">
                                    <div className="range-block-title" data-i18n="Reasoning Effort">Reasoning Effort</div>
                                    <div className="wide100p">
                                        <div className="segmented-control" data-sync-select="openai_reasoning_effort">
                                            <label className="seg-option"><input type="radio" name="reasoning_effort_ui" defaultValue="auto" /><span data-i18n="openai_reasoning_effort_auto">Auto</span></label>
                                            <label className="seg-option"><input type="radio" name="reasoning_effort_ui" defaultValue="low" /><span data-i18n="openai_reasoning_effort_low">Low</span></label>
                                            <label className="seg-option"><input type="radio" name="reasoning_effort_ui" defaultValue="medium" /><span data-i18n="openai_reasoning_effort_medium">Medium</span></label>
                                            <label className="seg-option"><input type="radio" name="reasoning_effort_ui" defaultValue="high" /><span data-i18n="openai_reasoning_effort_high">High</span></label>
                                        </div>
                                        <select id="openai_reasoning_effort" className="displayNone">
                                            <option value="auto">Auto</option>
                                            <option value="low">Low</option>
                                            <option value="medium">Medium</option>
                                            <option value="high">High</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="config-section-header"><span data-i18n="Prompt Manager">Prompt Manager</span></div>
                                <div className="range-block m-b-1">
                                    <div id="completion_prompt_manager"></div>
                                </div>
                            </div>
                        </div>
                        <div className="inline-drawer wide100p">
                            <div className="inline-drawer-toggle inline-drawer-header">
                                <b data-i18n="Advanced">高级</b>
                                <div className="fa-solid fa-circle-chevron-down inline-drawer-icon down"></div>
                            </div>
                            <div className="inline-drawer-content">
                        <div className="config-section-header"><span data-i18n="Features">功能</span></div>
                        <div className="features-grid">
                            <div className="range-block" data-source="openai">
                                <label htmlFor="openai_function_calling" className="checkbox_label widthFreeExpand">
                                    <input id="openai_function_calling" type="checkbox" />
                                    <span data-i18n="Enable function calling">Function Calling</span>
                                </label>
                                <div id="tool_call_recurse_limit_block" className="wide100p" style={{ "marginTop": "4px" }}>
                                    <div className="range-block-title"><small data-i18n="Tool Call Recurse Limit">Recurse Limit</small></div>
                                    <div className="wide100p">
                                        <input type="number" id="tool_call_recurse_limit" className="text_pole" min="1" max="50" step="1" />
                                    </div>
                                </div>
                            </div>
                            <div className="range-block" data-source="openai">
                                <label htmlFor="openai_media_inlining" className="checkbox_label widthFreeExpand">
                                    <input id="openai_media_inlining" type="checkbox" />
                                    <span data-i18n="Send inline media">Inline Media</span>
                                </label>
                            </div>
                            <div className="range-block" data-source="openai">
                                <label htmlFor="openai_show_thoughts" className="checkbox_label widthFreeExpand">
                                    <input id="openai_show_thoughts" type="checkbox" />
                                    <span data-i18n="Request model reasoning">Model Reasoning</span>
                                </label>
                            </div>
                        </div>
                        <div className="config-section-header"><span data-i18n="Advanced Sampling">高级采样</span></div>
                        <div className="range-block-pair" data-source="openai">
                            <div className="range-block">
                                <div className="range-block-title" data-i18n="Temperature">Temperature</div>
                                <div className="wide100p">
                                    <input className="neo-range-slider" type="range" id="temp_openai" min="0" max="2.0" step="0.01" />
                                    <input className="neo-range-input" type="number" id="temp_openai_counter" data-for="temp_openai" min="0" max="2.0" step="0.01" />
                                </div>
                            </div>
                            <div className="range-block">
                                <div className="range-block-title" data-i18n="Top P">Top P</div>
                                <div className="wide100p">
                                    <input className="neo-range-slider" type="range" id="top_p_openai" min="0" max="1" step="0.01" />
                                    <input className="neo-range-input" type="number" id="top_p_openai_counter" data-for="top_p_openai" min="0" max="1" step="0.01" />
                                </div>
                            </div>
                        </div>
                        <div className="range-block-pair" data-source="openai">
                            <div className="range-block">
                                <div className="range-block-title" data-i18n="Frequency Penalty">Freq Penalty</div>
                                <div className="wide100p">
                                    <input type="number" id="freq_pen_openai" className="text_pole" min="-2" max="2" step="0.01" />
                                </div>
                            </div>
                            <div className="range-block">
                                <div className="range-block-title" data-i18n="Presence Penalty">Pres Penalty</div>
                                <div className="wide100p">
                                    <input type="number" id="pres_pen_openai" className="text_pole" min="-2" max="2" step="0.01" />
                                </div>
                            </div>
                        </div>
                        <div className="range-block" data-source="openai">
                            <div className="range-block-title" data-i18n="Swipes">Swipes</div>
                            <div className="wide100p">
                                <input type="number" id="n_openai" className="text_pole" min="1" defaultValue="1" />
                            </div>
                        </div>
                        <div className="range-block full-width" data-source="openai">
                            <div className="range-block-title" data-i18n="Verbosity">Verbosity</div>
                            <div className="wide100p">
                                <div className="segmented-control" data-sync-select="openai_verbosity">
                                    <label className="seg-option"><input type="radio" name="verbosity_ui" defaultValue="auto" /><span data-i18n="openai_verbosity_auto">Auto</span></label>
                                    <label className="seg-option"><input type="radio" name="verbosity_ui" defaultValue="low" /><span data-i18n="openai_verbosity_low">Low</span></label>
                                    <label className="seg-option"><input type="radio" name="verbosity_ui" defaultValue="medium" /><span data-i18n="openai_verbosity_medium">Medium</span></label>
                                    <label className="seg-option"><input type="radio" name="verbosity_ui" defaultValue="high" /><span data-i18n="openai_verbosity_high">High</span></label>
                                </div>
                                <select id="openai_verbosity" className="displayNone">
                                    <option value="auto">Auto</option>
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                </select>
                            </div>
                        </div>
                        <div className="range-block full-width" data-source="openai">
                            <div className="range-block-title" data-i18n="Interleaved Thinking">Interleaved Thinking</div>
                            <div className="wide100p">
                                <select id="tool_reasoning_mode" className="text_pole">
                                    <option data-i18n="Disabled" value="disabled">Disabled</option>
                                    <option data-i18n="Since Last User Message" value="since_last_user">Since Last User</option>
                                    <option data-i18n="Active Tool Chain" value="active_chain">Active Tool Chain</option>
                                </select>
                            </div>
                        </div>
                        <div className="config-section-header"><span data-i18n="Image Generation">图片生成</span></div>
                        <div className="range-block full-width" data-source="openai">
                            <div className="range-block-title"><small data-i18n="Inline Image Quality">Image Quality</small></div>
                            <select id="openai_inline_image_quality" className="text_pole">
                                <option data-i18n="openai_inline_image_quality_auto" value="auto">Auto</option>
                                <option data-i18n="openai_inline_image_quality_low" value="low">Low</option>
                                <option data-i18n="openai_inline_image_quality_high" value="high">High</option>
                            </select>
                        </div>
                        <div className="config-section-header"><span data-i18n="Settings">设置</span></div>
                        <div className="range-block">
                            <div className="range-block-title" data-i18n="Character Names Behavior">Character Names <small id="character_names_display"></small></div>
                            <div className="wide100p">
                                <select id="names_behavior" className="text_pole">
                                    <option value="-1" data-i18n="None">None</option>
                                    <option value="0" data-i18n="Default">Default</option>
                                    <option value="1" data-i18n="Completion Object">Completion</option>
                                    <option value="2" data-i18n="Message Content">Content</option>
                                </select>
                            </div>
                        </div>
                        <div className="range-block">
                            <div className="range-block-title" data-i18n="Continue Postfix">Continue Postfix <small id="continue_postfix_display"></small></div>
                            <div className="wide100p">
                                <select id="continue_postfix_select" className="text_pole">
                                    <option value="0" data-i18n="None">None</option>
                                    <option value="1" data-i18n="Space">Space</option>
                                    <option value="2" data-i18n="Newline">Newline</option>
                                    <option value="3" data-i18n="Double Newline">Double Newline</option>
                                </select>
                                <input type="hidden" id="continue_postfix" />
                            </div>
                        </div>
                        <div className="range-block">
                            <label htmlFor="continue_prefill" className="checkbox_label widthFreeExpand">
                                <input id="continue_prefill" type="checkbox" />
                                <span data-i18n="Continue prefill">Continue prefill</span>
                            </label>
                        </div>
                        <div className="range-block">
                            <label htmlFor="squash_system_messages" className="checkbox_label widthFreeExpand">
                                <input id="squash_system_messages" type="checkbox" />
                                <span data-i18n="Squash system messages">Squash system messages</span>
                            </label>
                        </div>
                        <div className="config-section-header"><span data-i18n="Templates">模板</span></div>
                        <div className="range-block">
                            <div className="range-block-title openai_restorable">
                                <span data-i18n="Impersonation prompt">Impersonation</span>
                                <ContractIconButton id="impersonation_prompt_restore" className="right_menu_button" label="Restore default prompt" nativeTitle title="Restore default prompt" icon={<i className="fa-solid fa-clock-rotate-left" aria-hidden="true" />} />
                            </div>
                            <div className="wide100p">
                                <textarea id="impersonation_prompt_textarea" className="text_pole textarea_compact autoSetHeight" name="impersonation_prompt" rows={3} placeholder={"2014"}></textarea>
                            </div>
                        </div>
                        <div className="range-block">
                            <div className="range-block-title openai_restorable">
                                <span data-i18n="World Info Format Template">World Info <code>{0}</code></span>
                                <ContractIconButton id="wi_format_restore" className="right_menu_button" label="Restore default format" nativeTitle title="Restore default format" icon={<i className="fa-solid fa-clock-rotate-left" aria-hidden="true" />} />
                            </div>
                            <div className="wide100p">
                                <textarea id="wi_format_textarea" className="text_pole textarea_compact autoSetHeight" rows={3} placeholder={"2014"}></textarea>
                            </div>
                        </div>
                        <div className="range-block">
                            <div className="range-block-title openai_restorable">
                                <span data-i18n="Scenario Format Template">Scenario <code>{'{{'}scenario{'}}'}</code></span>
                                <ContractIconButton id="scenario_format_restore" className="right_menu_button" label="Restore default format" nativeTitle title="Restore default format" icon={<i className="fa-solid fa-clock-rotate-left" aria-hidden="true" />} />
                            </div>
                            <div className="wide100p">
                                <textarea id="scenario_format_textarea" className="text_pole textarea_compact autoSetHeight" rows={3} placeholder={"2014"}></textarea>
                            </div>
                        </div>
                        <div className="range-block">
                            <div className="range-block-title openai_restorable">
                                <span data-i18n="Personality Format Template">Personality <code>{'{{'}personality{'}}'}</code></span>
                                <ContractIconButton id="personality_format_restore" className="right_menu_button" label="Restore default format" nativeTitle title="Restore default format" icon={<i className="fa-solid fa-clock-rotate-left" aria-hidden="true" />} />
                            </div>
                            <div className="wide100p">
                                <textarea id="personality_format_textarea" className="text_pole textarea_compact autoSetHeight" rows={3} placeholder={"2014"}></textarea>
                            </div>
                        </div>
                        <div className="range-block">
                            <div className="range-block-title openai_restorable">
                                <span data-i18n="New Chat">New Chat</span>
                                <ContractIconButton id="newchat_prompt_restore" className="right_menu_button" label="Restore new chat prompt" nativeTitle title="Restore new chat prompt" icon={<i className="fa-solid fa-clock-rotate-left" aria-hidden="true" />} />
                            </div>
                            <div className="wide100p">
                                <textarea id="newchat_prompt_textarea" className="text_pole textarea_compact autoSetHeight" name="new_chat" rows={3} placeholder={"2014"}></textarea>
                            </div>
                        </div>
                        <div className="range-block">
                            <div className="range-block-title openai_restorable">
                                <span data-i18n="New Example Chat">Example Chat</span>
                                <ContractIconButton id="newexamplechat_prompt_restore" className="right_menu_button" label="Restore new example chat prompt" nativeTitle title="Restore new example chat prompt" icon={<i className="fa-solid fa-clock-rotate-left" aria-hidden="true" />} />
                            </div>
                            <div className="wide100p">
                                <textarea id="newexamplechat_prompt_textarea" className="text_pole textarea_compact autoSetHeight" name="new_example_chat" rows={3} placeholder={"2014"}></textarea>
                            </div>
                        </div>
                        <div className="range-block">
                            <div className="range-block-title openai_restorable">
                                <span data-i18n="Continue nudge">Continue Nudge</span>
                                <ContractIconButton id="continue_nudge_prompt_restore" className="right_menu_button" label="Restore new chat prompt" nativeTitle title="Restore new chat prompt" icon={<i className="fa-solid fa-clock-rotate-left" aria-hidden="true" />} />
                            </div>
                            <div className="wide100p">
                                <textarea id="continue_nudge_prompt_textarea" className="text_pole textarea_compact autoSetHeight" name="continue_nudge" rows={3} placeholder={"2014"}></textarea>
                            </div>
                        </div>
                        <div className="config-section-header"><span data-i18n="Other">其他</span></div>
                        <div className="range-block">
                            <div className="range-block-title" data-i18n="Replace empty message">Empty Message Fallback</div>
                            <div className="wide100p">
                                <textarea id="send_if_empty_textarea" className="text_pole textarea_compact autoSetHeight" name="send_if_empty" rows={3} placeholder={"2014"}></textarea>
                            </div>
                        </div>
                            </div>
                        </div>
                    </div>
                </div>
        </>
    );
}
