export function CfgConfigPanel() {
    return (
        <>
            <div className="panelControlBar flex-container alignItemsBaseline">
                <div id="cfgConfigheader" className="fa-fw fa-solid fa-grip drag-grabber"></div>
                <div id="cfgConfigMaximize" className="inline-drawer-maximize">
                    <i className="floating_panel_maximize fa-fw fa-solid fa-window-maximize" />
                </div>
                <div id="CFGClose" className="fa-fw fa-solid fa-circle-xmark floating_panel_close"></div>
            </div>
            <div name="cfgConfigHolder" className="scrollY">
                <div id="chat_cfg_container">
                    <div className="inline-drawer">
                        <div id="CFGBlockToggle" className="inline-drawer-toggle inline-drawer-header">
                            <b data-i18n="Chat CFG">Chat CFG</b>
                            <div className="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                        </div>
                        <div className="inline-drawer-content">
                            <small>
                                <b data-i18n="Unique to this chat">Unique to this chat</b>.<br />
                            </small>
                            <label htmlFor="chat_cfg_guidance_scale">
                                <span data-i18n="Scale">Scale</span>
                                <small data-i18n="1 = disabled">1 = disabled</small>
                            </label>
                            <div className="range-block-range-and-counter">
                                <div className="range-block-range">
                                    <input type="range" id="chat_cfg_guidance_scale" name="volume" min="0.10" max="4.00" step="0.05" />
                                </div>
                                <div className="range-block-counter">
                                    <input type="number" min="0.10" max="4.00" step="0.05" data-htmlFor="chat_cfg_guidance_scale" id="chat_cfg_guidance_scale_counter" />
                                </div>
                            </div>
                            <div>
                                <label htmlFor="chat_cfg_negative_prompt">
                                    <span data-i18n="Negative Prompt">Negative Prompt</span>
                                </label>
                                <textarea id="chat_cfg_negative_prompt" rows={2} className="text_pole textarea_compact" data-i18n="[placeholder]write short replies, write replies using past tense" placeholder="write short replies, write replies using past tense"></textarea>
                                <label htmlFor="chat_cfg_positive_prompt">
                                    <span data-i18n="Positive Prompt">Positive Prompt</span>
                                </label>
                                <textarea id="chat_cfg_positive_prompt" rows={2} className="text_pole textarea_compact" data-i18n="[placeholder]write short replies, write replies using past tense" placeholder="write short replies, write replies using past tense"></textarea>
                            </div>
                        </div>
                    </div>
                </div>
                <div id="chara_cfg_container">
                    <hr className="sysHR" />
                    <div className="inline-drawer">
                        <div id="charaANBlockToggle" className="inline-drawer-toggle inline-drawer-header">
                            <b data-i18n="Character CFG">Character CFG</b>
                            <div className="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                        </div>
                        <div className="inline-drawer-content">
                            <small><b data-i18n="Will be automatically added as the CFG for this character.">Will be automatically added as the CFG for this character.</b></small>
                            <br />
                            <label htmlFor="chara_cfg_guidance_scale">
                                <span data-i18n="Scale">Scale</span>
                                <small data-i18n="1 = disabled">1 = disabled</small>
                            </label>
                            <div className="range-block-range-and-counter">
                                <div className="range-block-range">
                                    <input type="range" id="chara_cfg_guidance_scale" name="volume" min="0.10" max="4.00" step="0.05" />
                                </div>
                                <div className="range-block-counter">
                                    <input type="number" min="0.10" max="4.00" step="0.05" data-htmlFor="chara_cfg_guidance_scale" id="chara_cfg_guidance_scale_counter" />
                                </div>
                            </div>
                            <div>
                                <label htmlFor="chara_cfg_negative_prompt">
                                    <span data-i18n="Negative Prompt">Negative Prompt</span>
                                </label>
                                <textarea id="chara_cfg_negative_prompt" rows={2} className="text_pole textarea_compact" data-i18n="[placeholder]write short replies, write replies using past tense" placeholder="write short replies, write replies using past tense"></textarea>
                                <label htmlFor="chara_cfg_positive_prompt">
                                    <span data-i18n="Positive Prompt">Positive Prompt</span>
                                </label>
                                <textarea id="chara_cfg_positive_prompt" rows={2} className="text_pole textarea_compact" data-i18n="[placeholder]write short replies, write replies using past tense" placeholder="write short replies, write replies using past tense"></textarea>
                            </div>
                        </div>
                    </div>
                </div>
                <div id="global_cfg_container">
                    <hr className="sysHR" />
                    <div className="inline-drawer">
                        <div id="defaultANBlockToggle" className="inline-drawer-toggle inline-drawer-header">
                            <b data-i18n="Global CFG">Global CFG</b>
                            <div className="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                        </div>
                        <div className="inline-drawer-content">
                            <small><b data-i18n="Will be used as the default CFG options for every chat unless overridden.">Will be used as the default CFG options for every chat unless overridden.</b></small>
                            <br />
                            <label htmlFor="global_cfg_guidance_scale">
                                <span data-i18n="Scale">Scale</span>
                                <small data-i18n="1 = disabled">1 = disabled</small>
                            </label>
                            <div className="range-block-range-and-counter">
                                <div className="range-block-range">
                                    <input type="range" id="global_cfg_guidance_scale" name="volume" min="0.10" max="4.00" step="0.05" />
                                </div>
                                <div className="range-block-counter">
                                    <input type="number" min="0.10" max="4.00" step="0.05" data-htmlFor="global_cfg_guidance_scale" id="global_cfg_guidance_scale_counter" />
                                </div>
                            </div>
                            <div>
                                <label htmlFor="global_cfg_negative_prompt">
                                    <span data-i18n="Negative Prompt">Negative Prompt</span>
                                </label>
                                <textarea id="global_cfg_negative_prompt" rows={2} className="text_pole textarea_compact" data-i18n="[placeholder]write short replies, write replies using past tense" placeholder="write short replies, write replies using past tense"></textarea>
                                <label htmlFor="global_cfg_positive_prompt">
                                    <span data-i18n="Positive Prompt">Positive Prompt</span>
                                </label>
                                <textarea id="global_cfg_positive_prompt" rows={2} className="text_pole textarea_compact" data-i18n="[placeholder]write short replies, write replies using past tense" placeholder="write short replies, write replies using past tense"></textarea>
                            </div>
                        </div>
                    </div>
                </div>
                <div id="cfg_prompt_combine_container">
                    <hr className="sysHR" />
                    <div className="inline-drawer">
                        <div id="defaultANBlockToggle" className="inline-drawer-toggle inline-drawer-header">
                            <b data-i18n="CFG Prompt Cascading">CFG Prompt Cascading</b>
                            <div className="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                        </div>
                        <div className="inline-drawer-content">
                            <div className="flex-container flexFlowColumn">
                                <small>
                                    <b data-i18n="Combine positive/negative prompts from other boxes.">Combine positive/negative prompts from other boxes.</b>
                                    <br />
                                    <span data-i18n="For example, ticking the chat, global, and character boxes combine all negative prompts into a comma-separated string.">For example, ticking the chat, global, and character boxes combine all negative prompts into a comma-separated string.</span>
                                </small>
                            </div>
                            <br />
                            <div className="flex-container flexFlowColumn">
                                <label htmlFor="cfg_prompt_combine">
                                    <span data-i18n="Always Include">Always Include</span>
                                </label>
                                <label className="checkbox_label">
                                    <input type="checkbox" name="cfg_prompt_combine" defaultValue="0" />
                                    <span data-i18n="Chat Negatives">Chat Negatives</span>
                                </label>
                                <label className="checkbox_label">
                                    <input type="checkbox" name="cfg_prompt_combine" defaultValue="1" />
                                    <span data-i18n="Character Negatives">Character Negatives</span>
                                </label>
                                <label className="checkbox_label">
                                    <input type="checkbox" name="cfg_prompt_combine" defaultValue="2" />
                                    <span data-i18n="Global Negatives">Global Negatives</span>
                                </label>
                            </div>
                            <div className="flex-container flexFlowColumn">
                                <label>
                                    <span data-i18n="Custom Separator:">Custom Separator:</span> <input id="cfg_prompt_separator" className="text_pole textarea_compact widthUnset" placeholder={"\"\\n\""} type="text" />
                                </label>
                                <label>
                                    <span data-i18n="Insertion Depth:">Insertion Depth:</span> <input id="cfg_prompt_insertion_depth" className="text_pole widthUnset" type="number" min="0" max="99" />
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
