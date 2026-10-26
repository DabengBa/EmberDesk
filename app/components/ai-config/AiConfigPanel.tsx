import type { ReactNode } from 'react';
import { ContractIconButton } from '../contract/ContractIconButton';
import { PresetActionsMenu } from './PresetActionsMenu';
import { translate, useTranslated } from '@/compat/i18n.js';
/**
 * AI Response Configuration drawer markup (React-owned shell inside
 * #left-nav-panel). Behavior stays legacy: openai.js/power-user.js bind the
 * preserved IDs during initOpenAI/getSettings. `promptList` is the
 * React-owned prompt list rendered inside #completion_prompt_manager.
 */
export function AiConfigPanel({ promptList, presetSaveButton, promptHeaderActions }: { promptList?: ReactNode; presetSaveButton?: ReactNode; promptHeaderActions?: ReactNode }) {
    useTranslated('');
    return (
        <>
                <div id="left-nav-panelheader" className="fa-solid fa-grip drag-grabber" aria-hidden="true"></div>
                <div className="workspace-panel-header">
                    <div className="workspace-panel-title" >{translate('Presets')}</div>
                </div>
                <div className="scrollableInner">
                    <div className="flex-container flexNoGap" id="ai_response_configuration">
                        <section className="ai-config-section width100p" id="respective-presets-block" aria-labelledby="ai-config-presets-title">
                            <div id="openai_api-presets">
                                <div>
                                    <div className="config-section-header" id="ai-config-presets-title"><span >{translate('Preset')}</span></div>
                                    <div className="flex-container flexNoGap">
                                        <select id="settings_preset_openai" className="flex1 text_pole" data-preset-manager-for="openai">
                                            <option value="gui" >{translate('Default')}</option>
                                        </select>
                                    </div>
                                    <div className="preset-actions-row">
                                        {presetSaveButton}
                                        <button type="button" id="new_oai_preset" className="menu_button" title={translate('Create a new preset from the current configuration')}>
                                            <i className="fa-solid fa-file-circle-plus" aria-hidden="true" /> {translate('New preset')}
                                        </button>
                                        <PresetActionsMenu />
                                    </div>
                                </div>
                            </div>
                        </section>
                        <section className="ai-config-section width100p" id="advanced-ai-config-block" aria-labelledby="ai-config-prompt-title">
                            <div id="openai_settings">
                                <div className="config-section-header prompt-panel-title-row" id="ai-config-prompt-title">
                                    <span >{translate('Prompt Manager')}</span>
                                    {promptHeaderActions}
                                </div>
                                <div className="range-block m-b-1">
                                    <div id="completion_prompt_manager">{promptList}</div>
                                </div>
                            </div>
                        </section>
                        <section className="ai-config-section width100p" id="respective-ranges-and-temps" aria-labelledby="ai-config-parameters-title">
                            <div className="config-section-header" id="ai-config-parameters-title"><span >{translate('Generation Parameters')}</span></div>
                            <div id="range_block_openai">
                                <div className="range-block-pair">
                                    <div className="range-block">
                                        <div className="range-block-title" >{translate('Context')}</div>
                                        <div className="input-with-unit" data-unit="k">
                                            <input type="number" id="openai_max_context" className="text_pole" data-unit="k" min="0.5" step="0.5" />
                                        </div>
                                    </div>
                                    <div className="range-block">
                                        <div className="range-block-title" >{translate('Max Response')}</div>
                                        <div className="input-with-unit" data-unit="k">
                                            <input type="number" id="openai_max_tokens" className="text_pole" data-unit="k" min="0.1" max="128" step="0.1" />
                                        </div>
                                    </div>
                                </div>
                                <div className="range-block">
                                    <label htmlFor="stream_toggle" title="Enable OpenAI completion streaming" data-i18n="[title]Enable OpenAI completion streaming" className="ai-switch-row widthFreeExpand">
                                        <input id="stream_toggle" type="checkbox" className="ai-switch-input" />
                                        <span className="ai-switch" aria-hidden="true"><span className="ai-switch-thumb" /></span>
                                        <span >{translate('Streaming')}</span>
                                    </label>
                                </div>
                                <div className="range-block" data-source="openai">
                                    <div className="range-block-title" >{translate('Reasoning Effort')}</div>
                                    <div className="wide100p">
                                        <div className="segmented-control" data-sync-select="openai_reasoning_effort">
                                            <label className="seg-option"><input type="radio" name="reasoning_effort_ui" defaultValue="auto" /><span >{translate('Auto')}</span></label>
                                            <label className="seg-option"><input type="radio" name="reasoning_effort_ui" defaultValue="low" /><span >{translate('Low')}</span></label>
                                            <label className="seg-option"><input type="radio" name="reasoning_effort_ui" defaultValue="medium" /><span >{translate('Medium')}</span></label>
                                            <label className="seg-option"><input type="radio" name="reasoning_effort_ui" defaultValue="high" /><span >{translate('High')}</span></label>
                                        </div>
                                        <select id="openai_reasoning_effort" className="displayNone">
                                            <option value="auto">Auto</option>
                                            <option value="low">Low</option>
                                            <option value="medium">Medium</option>
                                            <option value="high">High</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </section>
                        <div className="inline-drawer wide100p">
                            <div className="inline-drawer-toggle inline-drawer-header">
                                <b>{translate('Advanced')}</b>
                                <div className="fa-solid fa-circle-chevron-down inline-drawer-icon down"></div>
                            </div>
                            <div className="inline-drawer-content">
                        <div className="config-section-header"><span>{translate('Features')}</span></div>
                        <div className="features-grid">
                            <div className="range-block" data-source="openai">
                                <label htmlFor="openai_media_inlining" className="checkbox_label widthFreeExpand">
                                    <input id="openai_media_inlining" type="checkbox" />
                                    <span >{translate('Inline Media')}</span>
                                </label>
                            </div>
                            <div className="range-block" data-source="openai">
                                <label htmlFor="openai_show_thoughts" className="checkbox_label widthFreeExpand">
                                    <input id="openai_show_thoughts" type="checkbox" />
                                    <span >{translate('Model Reasoning')}</span>
                                </label>
                            </div>
                        </div>
                        <div className="config-section-header"><span>{translate('Advanced Sampling')}</span></div>
                        <div className="range-block-pair" data-source="openai">
                            <div className="range-block">
                                <div className="range-block-title" >{translate('Temperature')}</div>
                                <div className="wide100p">
                                    <input className="neo-range-slider" type="range" id="temp_openai" min="0" max="2.0" step="0.01" />
                                    <input className="neo-range-input" type="number" id="temp_openai_counter" data-for="temp_openai" min="0" max="2.0" step="0.01" />
                                </div>
                            </div>
                            <div className="range-block">
                                <div className="range-block-title" >{translate('Top P')}</div>
                                <div className="wide100p">
                                    <input className="neo-range-slider" type="range" id="top_p_openai" min="0" max="1" step="0.01" />
                                    <input className="neo-range-input" type="number" id="top_p_openai_counter" data-for="top_p_openai" min="0" max="1" step="0.01" />
                                </div>
                            </div>
                        </div>
                        <div className="range-block-pair" data-source="openai">
                            <div className="range-block">
                                <div className="range-block-title" >{translate('Freq Penalty')}</div>
                                <div className="wide100p">
                                    <input type="number" id="freq_pen_openai" className="text_pole" min="-2" max="2" step="0.01" />
                                </div>
                            </div>
                            <div className="range-block">
                                <div className="range-block-title" >{translate('Pres Penalty')}</div>
                                <div className="wide100p">
                                    <input type="number" id="pres_pen_openai" className="text_pole" min="-2" max="2" step="0.01" />
                                </div>
                            </div>
                        </div>
                        <div className="range-block full-width" data-source="openai">
                            <div className="range-block-title" >{translate('Verbosity')}</div>
                            <div className="wide100p">
                                <div className="segmented-control" data-sync-select="openai_verbosity">
                                    <label className="seg-option"><input type="radio" name="verbosity_ui" defaultValue="auto" /><span >{translate('Auto')}</span></label>
                                    <label className="seg-option"><input type="radio" name="verbosity_ui" defaultValue="low" /><span >{translate('Low')}</span></label>
                                    <label className="seg-option"><input type="radio" name="verbosity_ui" defaultValue="medium" /><span >{translate('Medium')}</span></label>
                                    <label className="seg-option"><input type="radio" name="verbosity_ui" defaultValue="high" /><span >{translate('High')}</span></label>
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
                            <div className="range-block-title" >{translate('Interleaved Thinking')}</div>
                            <div className="wide100p">
                                <select id="tool_reasoning_mode" className="text_pole">
                                    <option value="disabled">{translate('Disabled')}</option>
                                    <option value="since_last_user">{translate('Since Last User')}</option>
                                    <option value="active_chain">{translate('Active Tool Chain')}</option>
                                </select>
                            </div>
                        </div>
                        <div className="config-section-header"><span>{translate('Image Generation')}</span></div>
                        <div className="range-block full-width" data-source="openai">
                            <div className="range-block-title"><small >{translate('Image Quality')}</small></div>
                            <select id="openai_inline_image_quality" className="text_pole">
                                <option value="auto">{translate('Auto')}</option>
                                <option value="low">{translate('Low')}</option>
                                <option value="high">{translate('High')}</option>
                            </select>
                        </div>
                        <div className="config-section-header"><span>{translate('Settings')}</span></div>
                        <div className="range-block">
                            <div className="range-block-title" >{translate('Character Names')}<small id="character_names_display"></small></div>
                            <div className="wide100p">
                                <select id="names_behavior" className="text_pole">
                                    <option value="-1" >{translate('None')}</option>
                                    <option value="0" >{translate('Default')}</option>
                                    <option value="1" >{translate('Completion')}</option>
                                    <option value="2" >{translate('Content')}</option>
                                </select>
                            </div>
                        </div>
                        <div className="range-block">
                            <label htmlFor="squash_system_messages" className="checkbox_label widthFreeExpand">
                                <input id="squash_system_messages" type="checkbox" />
                                <span >{translate('Squash system messages')}</span>
                            </label>
                        </div>
                        <div className="config-section-header"><span>{translate('Templates')}</span></div>
                        <div className="range-block">
                            <div className="range-block-title openai_restorable">
                                <span >{translate('World Info')}<code>{0}</code></span>
                                <ContractIconButton id="wi_format_restore" className="right_menu_button" label="Restore default format" nativeTitle title="Restore default format" icon={<i className="fa-solid fa-clock-rotate-left" aria-hidden="true" />} />
                            </div>
                            <div className="wide100p">
                                <textarea id="wi_format_textarea" className="text_pole textarea_compact autoSetHeight" rows={3} placeholder={"2014"}></textarea>
                            </div>
                        </div>
                        <div className="range-block">
                            <div className="range-block-title openai_restorable">
                                <span >{translate('Description')}<code>{0}</code></span>
                                <ContractIconButton id="description_format_restore" className="right_menu_button" label="Restore default format" nativeTitle title="Restore default format" icon={<i className="fa-solid fa-clock-rotate-left" aria-hidden="true" />} />
                            </div>
                            <div className="wide100p">
                                <textarea id="description_format_textarea" className="text_pole textarea_compact autoSetHeight" rows={3} placeholder={"2014"}></textarea>
                            </div>
                        </div>
                        <div className="range-block">
                            <div className="range-block-title openai_restorable">
                                <span >{translate('New Chat')}</span>
                                <ContractIconButton id="newchat_prompt_restore" className="right_menu_button" label="Restore new chat prompt" nativeTitle title="Restore new chat prompt" icon={<i className="fa-solid fa-clock-rotate-left" aria-hidden="true" />} />
                            </div>
                            <div className="wide100p">
                                <textarea id="newchat_prompt_textarea" className="text_pole textarea_compact autoSetHeight" name="new_chat" rows={3} placeholder={"2014"}></textarea>
                            </div>
                        </div>
                        <div className="config-section-header"><span>{translate('Other')}</span></div>
                        <div className="range-block">
                            <div className="range-block-title" >{translate('Empty Message Fallback')}</div>
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
