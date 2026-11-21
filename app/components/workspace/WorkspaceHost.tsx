import { useEffect, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { translate } from '../../compat/i18n';
import { startWorkspace, useWorkspacePresentation } from './workspace-entry';

export function WorkspaceHost() {
    const [draggableTemplate, setDraggableTemplate] = useState<HTMLTemplateElement | null>(null);
    const [startup, setStartup] = useState<'loading' | 'ready' | 'failed'>('loading');
    const ready = startup === 'ready';
    useWorkspacePresentation();

    useEffect(() => {
        // The native template fragment and all legacy hosts are committed now.
        if (!draggableTemplate) return;
        let active = true;
        void startWorkspace(() => {
            // Commit the interactive hosts before notifying native APP_READY listeners.
            flushSync(() => setStartup('ready'));
        }).catch(error => {
            if (!active) return;
            console.error('Failed to start the workspace:', error);
            setStartup('failed');
        });
        return () => { active = false; };
    }, [draggableTemplate]);

    return (
        <>
            <meta name="theme-color" content="#333" />

            <div id="bg1"></div>
            <div id="character_context_menu" className="hidden">
            </div>
            <div id="top-settings-holder" inert={!ready}>
                <div id="WI-SP-button" className="drawer">
                    <div id="WorldInfo" className="drawer-content closedDrawer">
                    </div>
                </div>
                <div id="settings-panel-button" className="drawer">
                    <div id="SettingsPanel" className="drawer-content closedDrawer">
                        {/* React-owned surface: mounted on first open via mountSettingsPanel(). */}
                    </div>
                </div>
                <div id="regex-panel-button" className="drawer">
                    <div id="RegexPanel" className="drawer-content closedDrawer">
                        {/* React-owned surface: mounted by the regex feature init via mountRegexSettings(). */}
                    </div>
                </div>
                <div id="leftNavHolder" className="drawer">
                    <nav id="left-nav-panel" className="drawer-content closedDrawer fillLeft">
                    </nav>
                </div>
                <div id="rightNavHolder" className="drawer">
                    <nav id="right-nav-panel" className="drawer-content closedDrawer fillRight">
                    </nav>
                </div>
            </div>
            {/* various fullscreen popups */}
            <div {...{ name: 'templatesAndPopupsWrapper' }}> {/* this div is just for IDE sanity for quick collapsing */}
                {/* Point to this element when you need a no-op selector */}
                <template id="NULL_SELECTOR" className="displayNone"></template>
                <div id="export_format_popup" className="list-group">
                </div>
                <div id="zoomed_avatar_template" className="template_element">
                    <div className="zoomed_avatar">
                        <div className="panelControlBar flex-container">
                            <button type="button" className="fa-fw fa-solid fa-circle-xmark dragClose" id="closeZoom" aria-label="Close avatar preview" title="Close avatar preview" data-i18n="[aria-label][title]Close avatar preview"></button>
                        </div>
                        <div className="zoomed_avatar_container">
                            <img className="zoomed_avatar_img" src="img/No-Image-Placeholder.svg" alt="" />
                        </div>
                    </div>
                </div>
                <template id="generic_draggable_template" ref={setDraggableTemplate} />
                {draggableTemplate && createPortal(
                    <div className="draggable">
                        <div className="dragTitle"></div>
                        <div className="panelControlBar flex-container">
                            <div className="fa-fw fa-solid fa-grip drag-grabber"></div>
                            <div className="fa-fw fa-solid fa-circle-xmark dragClose"></div>
                        </div>
                    </div>,
                    draggableTemplate.content,
                )}

                <div id="shadow_popup">
                    <div id="dialogue_popup">
                        <div id="dialogue_popup_holder">
                            <div id="dialogue_popup_text">
                                <h3 className="margin0">text</h3>
                            </div>
                            <textarea id="dialogue_popup_input" className="text_pole" rows={1}></textarea>
                            <div id="dialogue_popup_controls">
                            </div>
                        </div>
                    </div>
                </div>
                <div id="character_popup" className="flex-container flexFlowColumn flexNoGap">
                </div>

                <dialog id="shadow_select_chat_popup" aria-labelledby="selectChatPopupHeaderText">
                    <div id="select_chat_popup">
                    </div>
                </dialog>
                {/* templates for JS to reuse when needed */}

                <div id="past_chat_template" className="template_element">
                    <div className="select_chat_block_wrapper flex-container">
                        <div className="select_chat_block  wide100p flex-container" {...{ file_name: '' }}>
                            <div className="avatar"><img src="img/No-Image-Placeholder.svg" loading="lazy" decoding="async" /></div>
                            <div className="select_chat_name_wrapper">
                                <div className="flex-container alignItemsCenter">
                                    <small className="select_chat_block_filename select_chat_block_filename_item"></small>
                                    <div title="Rename chat file" className="renameChatButton hoverglow opacity50p fa-solid fa-pencil fa-sm" data-i18n="[title]Rename chat file"></div>
                                </div>
                                <div className="flex-container gap10px alignItemsCenter">
                                    <div className="select_chat_info flex-container">
                                        <small className="chat_messages_date select_chat_block_filename_item"></small>
                                        <small className="chat_file_size select_chat_block_filename_item"></small>
                                        <small className="chat_messages_num select_chat_block_filename_item"></small>
                                    </div>
                                    <div className="select_chat_actions flex-container gap10px">
                                        <button type="button" title="Export JSONL chat file" aria-label="Export JSONL chat file" data-format="jsonl" className="exportRawChatButton chat-file-action fa-solid fa-file-export" data-i18n="[title][aria-label]Export JSONL chat file"></button>
                                        <button type="button" title="Download chat as plain text document" aria-label="Download chat as plain text document" data-format="txt" className="exportChatButton chat-file-action fa-solid fa-file-lines" data-i18n="[title][aria-label]Download chat as plain text document"></button>
                                        <button type="button" title="Delete chat file" aria-label="Delete chat file" {...{ file_name: '' }} className="PastChat_cross chat-file-action fa-solid fa-skull" data-i18n="[title][aria-label]Delete chat file"></button>
                                    </div>
                                </div>
                            </div>
                            <div className="select_chat_block_mes"></div>
                        </div>
                    </div>
                </div>
                <div id="tag_view_template" className="template_element">
                    <div className="tag_view_item">
                        <div className="drag-handle" data-i18n="[title]Drag to reorder tag">☰</div>
                        <div title="Tag as folder" className="tag_as_folder fa-solid fa-folder-open right_menu_button" data-i18n="[title]Use tag as folder">
                            <span className="tag_folder_indicator"></span>
                        </div>
                        <div className="right_menu_button fa-solid fa-eye fa-fw eye-toggle"></div>
                        <div className="tag_view_color_picker" data-value="color"></div>
                        <div className="tag_view_color_picker" data-value="color2"></div>
                        <div className="tag_view_name" contentEditable="true"></div>
                        <div className="tag_view_counter"><span className="tag_view_counter_value"></span>&nbsp;<span data-i18n="tag_entries">entries</span></div>
                        <div title="Delete tag" className="tag_delete fa-solid fa-trash-can right_menu_button" data-i18n="[title]Delete tag"></div>
                    </div>
                </div>
                <div id="entry_edit_template" className="template_element">
                    <div className="world_entry">
                        <form className="world_entry_form wi-card-entry">
                            <div className="inline-drawer wide100p">
                                <div className="wi-card-header inline-drawer-header gap5px padding0">
                                    <div className="wi-card-expand-button fa-solid fa-chevron-right" role="button" tabIndex={0} title="Expand entry" aria-label="Expand entry" aria-expanded="false" data-i18n="[title]Expand entry"></div>
                                    <div className="wi-card-body-wrap">
                                        <div className="wi-card-title-row flex-container alignitemscenter wide100p">
                                            <div className="wi-card-title-field">
                                                <textarea className="wi-card-title-input text_pole" rows={1} name="comment" title="Edit entry title" data-i18n="[placeholder]Entry Title/Memo;[title]Edit entry title" placeholder="Entry Title/Memo"></textarea>
                                                <i className="wi-card-title-edit fa-solid fa-pencil" aria-hidden="true"></i>
                                            </div>
                                            <select name="position" className="wi-card-position-control" title="Position" data-i18n="[title]Position">
                                                <option value="0" data-role="">WI</option>
                                                <option value="4" data-role="0">@D ⚙️</option>
                                                <option value="4" data-role="1">@D 👤</option>
                                                <option value="4" data-role="2">@D 🤖</option>
                                            </select>
                                            <select name="entryStateSelector" className="text_pole widthNatural margin0" data-i18n="[title]WI Entry Status:🔵 Constant🟢 Normal" title="WI Entry Status:&#13;🔵 Constant&#13;🟢 Normal">
                                                <option value="constant" title="Constant" data-i18n="[title]WI_Entry_Status_Constant">🔵</option>
                                                <option value="normal" title="Normal" data-i18n="[title]WI_Entry_Status_Normal">🟢</option>
                                            </select>
                                        </div>
                                    </div>
                                    <button type="button" className="wi-card-active-toggle killSwitch" name="entryKillSwitch" title="Toggle entry active state" data-i18n="[title]Toggle entry active state" aria-label="Toggle entry active state" aria-pressed="true">
                                        <span className="wi-card-active-toggle-track">
                                            <span className="wi-card-active-toggle-knob"></span>
                                        </span>
                                    </button>
                                </div>
                                <div className="inline-drawer-content inline-drawer-outlet flex-container paddingBottom5px wide100p">
                                    {/* Outlet for world_entry_edit (accordion form) */}
                                </div>
                            </div>
                        </form>
                    </div>
                    <div className="world_entry_edit">
                        <div className="wi-accordion" data-group="trigger" data-default="open">
                            <div className="wi-accordion-header" data-i18n="Trigger Conditions">Trigger Conditions</div>
                            <div className="wi-accordion-content">
                        <div className="flex-container wide100p alignitemscenter">
                            <div {...{ name: 'keywordsAndLogicBlock' }} className="flex-container wide100p alignitemscenter">
                                <div className="world_entry_form_control keyprimary flex1">
                                    <small className="textAlignCenter" data-i18n="Primary Keywords">Primary Keywords</small>
                                    <select className="keyprimaryselect keyselect" name="key" data-i18n="[placeholder]Keywords or Regexes" {...{ placeholder: 'Keywords or Regexes' }} multiple></select>
                                    <textarea className="text_pole keyprimarytextpole mobile" name="key" rows={1} data-i18n="[placeholder]Comma separated list" placeholder="Comma separated list" style={{ display: "none" }}></textarea>
                                </div>
                            </div>
                            <div {...{ name: 'perEntryOverridesBlock' }} className="flex-container wide100p alignitemscenter">
                                <div className="world_entry_form_control flex1">
                                    <small className="textAlignCenter" data-i18n="Scan Depth">Scan Depth</small>
                                    <input className="text_pole margin0" name="scanDepth" type="number" placeholder="Use global setting" data-i18n="[placeholder]Use global setting" max="1000" />
                                </div>
                                <div className="world_entry_form_control flex1">
                                    <small className="textAlignCenter" data-i18n="Case-Sensitive">Case-Sensitive</small>
                                    <select name="caseSensitive" className="text_pole widthNatural margin0">
                                        <option value="null" data-i18n="Use global">Use global</option>
                                        <option value="true" data-i18n="Yes">Yes</option>
                                        <option value="false" data-i18n="No">No</option>
                                    </select>
                                </div>
                                <div className="world_entry_form_control flex1">
                                    <small className="textAlignCenter" data-i18n="Whole Words">Whole Words</small>
                                    <select name="matchWholeWords" className="text_pole widthNatural margin0">
                                        <option value="null" data-i18n="Use global">Use global</option>
                                        <option value="true" data-i18n="Yes">Yes</option>
                                        <option value="false" data-i18n="No">No</option>
                                    </select>
                                </div>
                            </div>
                            </div></div>
                            <div className="wi-accordion" data-group="content" data-default="open">
                            <div className="wi-accordion-header" data-i18n="Content">Content</div>
                            <div className="wi-accordion-content">
                            <div {...{ name: 'contentAndCharFilterBlock' }} className="world_entry_thin_controls wi-content-grid flex2">
                                <div className="world_entry_form_control flex1">
                                    <button type="button" className="wi-content-open" title="Open content editor" data-i18n="[title]Open content editor">
                                        <span className="wi-content-preview is-empty" data-i18n="No content yet">No content yet</span>
                                        <span className="wi-content-summary-meta">
                                            <span className="wi-content-counter">
                                                <span data-i18n="extension_token_counter">Tokens:</span>&nbsp;<span className="world_entry_form_token_counter" data-first-run="true">counting...</span>
                                            </span>
                                            <span className="wi-content-summary-icon fa-solid fa-expand" aria-hidden="true"></span>
                                        </span>
                                    </button>
                                    <div className="wi-content-editor-modal" role="dialog" aria-modal="true" aria-labelledby="wi-content-editor-title" aria-hidden="true" hidden>
                                        <div className="wi-content-editor-backdrop"></div>
                                        <div className="wi-content-editor-panel">
                                            <div className="wi-content-editor-header">
                                                <div className="wi-content-editor-heading">
                                                    <strong className="wi-content-editor-title" id="wi-content-editor-title" data-i18n="Content editor">Content editor</strong>
                                                    <span className="wi-content-editor-meta">
                                                        <span data-i18n="extension_token_counter">Tokens:</span>&nbsp;<span className="world_entry_form_token_counter" data-first-run="true">counting...</span>
                                                        <span className="world_entry_form_uid_value" data-first-run="true"></span>
                                                    </span>
                                                </div>
                                                <button type="button" className="menu_button menu_button_icon wi-content-editor-close" title="Close" data-i18n="[title]Close">
                                                    <i className="fa-solid fa-xmark"></i>
                                                </button>
                                            </div>
                                            <textarea className="text_pole" name="content" rows={16} data-i18n="[placeholder]What this keyword should mean to the AI, sent verbatim" placeholder="What this keyword should mean to the AI, sent verbatim"></textarea>
                                            <div className="wi-content-editor-footer">
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            </div></div>
                            <div className="wi-accordion" data-group="matchScope" data-default="closed">
                            <div className="wi-accordion-header" data-i18n="Match Scope">Match Scope</div>
                            <div className="wi-accordion-content">
                                <div className="flex-container flexFlowRow flexGap10">
                                    <small className="flex-container flex1 flexFlowColumn">
                                        <label className="checkbox flex-container alignItemsCenter flexNoGap">
                                            <input type="checkbox" name="matchCharacterDescription" />
                                            <span data-i18n="Character Description">Character Description</span>
                                        </label>
                                        <label className="checkbox flex-container alignItemsCenter flexNoGap">
                                            <input type="checkbox" name="matchScenario" />
                                            <span data-i18n="Scenario">Scenario</span>
                                        </label>
                                    </small>
                                    <label className="checkbox flex-container alignItemsCenter flexNoGap">
                                        <input type="checkbox" name="matchCharacterDepthPrompt" />
                                        <span data-i18n="Character's Note">Character's Note</span>
                                    </label>
                                    <label className="checkbox flex-container alignItemsCenter flexNoGap">
                                        <input type="checkbox" name="matchCreatorNotes" />
                                        <span data-i18n="Creator's Notes">Creator's Notes</span>
                                    </label>
                                </div>
                            </div></div>
                            <div className="wi-accordion" data-group="injection" data-default="closed">
                            <div className="wi-accordion-header" data-i18n="Injection Settings">Injection Settings</div>
                            <div className="wi-accordion-content" data-populate="injection">
                            </div></div>
                            <div className="world_entry_thin_controls commentContainer">
                            </div>
                        </div>
                        <div className="wi-accordion" data-group="advanced" data-default="closed">
                        <div className="wi-accordion-header" data-i18n="Advanced">Advanced</div>
                        <div className="wi-accordion-content">
                        <div className="flex-container wide100p flexGap10">
                            <div className="flex4 flex-container flexFlowColumn flexNoGap">
                                <div className="flex-container justifySpaceBetween">
                                    <small {...{ htmlFor: 'characterFilter' }} data-i18n="Filter to Characters or Tags">
                                        Filter to Characters or Tags
                                    </small>
                                    <label className="checkbox_label flexNoGap margin-r5" htmlFor="character_exclusion">
                                        <input type="checkbox" name="character_exclusion" />
                                        <span>
                                            <small title="Switch the Character/Tags filter around to exclude the listed characters and tags from matching for this entry" data-i18n="[title]Switch the Character/Tags filter around to exclude the listed characters and tags from matching for this entry">
                                                <span data-i18n="Exclude">Exclude</span>
                                                <div className="fa-solid fa-circle-info opacity50p"></div>
                                            </small>
                                        </span>
                                    </label>
                                </div>
                                <div className="range-block-range">
                                    <select name="characterFilter" multiple>
                                        <option value="" data-i18n="-- Characters not found --">
                                            -- Characters not found --
                                        </option>
                                    </select>
                                </div>
                            </div>
                            <div className="flex4">
                                <div className="flex-container justifySpaceBetween">
                                    <small>
                                        <span data-i18n="Filter to Generation Triggers">
                                            Filter to Generation Triggers
                                        </span>
                                    </small>
                                    {/* Not a real control. Used to make label heights even. */}
                                    <label className="checkbox_label" htmlFor="__invisible">
                                        <input type="checkbox" name="__invisible" />
                                        <span><small>&nbsp;</small></span>
                                    </label>
                                </div>
                                <div className="range-block-range">
                                    <select name="triggers" multiple>
                                        <option data-i18n="All" value="all">All</option>
                                        <option data-i18n="Normal" value="normal">Normal</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        </div></div>
                        <div {...{ name: 'WIEntryBottomControls' }} className="flex-container flex1 justifySpaceBetween world_entry_form_horizontal">
                            <div className="flex-container flexFlowColumn flexNoGap wi-enter-footer-text">
                                <label className="checkbox flex-container">
                                    <input type="checkbox" name="useProbability" />
                                    <span data-i18n="Use Probability">Use Probability</span>
                                </label>
                                <label className="checkbox flex-container">
                                    <input type="checkbox" name="addMemo" />
                                    <span data-i18n="Add Memo">Add Memo</span>
                                </label>
                            </div>
                            <div className="wi-card-actions flex-container alignitemscenter">
                                <i className="menu_button move_entry_button fa-solid fa-right-left" title="Move/Copy Entry to Another Lorebook" data-i18n="[title]Move/Copy Entry to Another Lorebook"></i>
                                <i className="menu_button duplicate_entry_button fa-solid fa-paste" title="Duplicate world info entry" data-i18n="[title]Duplicate world info entry"></i>
                                <i className="menu_button delete_entry_button fa-solid fa-trash-can" title="Delete world info entry" data-i18n="[title]Delete world info entry"></i>
                            </div>
                        </div>
                        </div>
                    </div>
                </div>
            <div id="character_template" className="template_element">
                <div className="character_select entity_block flex-container wide100p alignitemsflexstart" {...{ chid: '' }} id="">
                    <div className="avatar" title="">
                        <img src="img/No-Image-Placeholder.svg" loading="lazy" decoding="async" />
                        <i className="ch_fav_icon fa-solid fa-star" aria-hidden="true"></i>
                    </div>
                    <div className="flex-container wide100pLess70px character_select_container">
                        <div className="wide100p character_name_block">
                            <span className="ch_name"></span>
                            <small className="ch_additional_info ch_add_placeholder">+++</small>
                        </div>
                        <input className="ch_fav" defaultValue="" hidden />
                        <div className="ch_description"></div>
                        <div className="tags tags_inline"></div>
                    </div>
                </div>
            </div>
            <div id="tag_template" className="template_element">
                <span id="" className="tag">
                    <span className="tag_name"></span>
                    <i className="fa-solid fa-circle-xmark tag_remove"></i>
                </span>
            </div>
            <div id="message_template" className="template_element">
                <div className="mes" {...{ mesid: '', ch_name: '', is_user: '', is_system: '' }}>
                    <div className="for_checkbox"></div><input type="checkbox" className="del_checkbox" />
                    <div className="mesAvatarWrapper">
                        <div className="avatar">
                            <img src="img/No-Image-Placeholder.svg" />
                        </div>
                        <div className="mes_timer"></div>
                    </div>
                    <div className="mes_block">
                        <div className="ch_name flex-container justifySpaceBetween">
                            <div className="flex-container flex1 alignitemscenter">
                                <div className="flex-container alignItemsBaseline">
                                    <span className="name_text">{'${characterName}'}</span>
                                    <i className="mes_ghost fa-solid fa-ghost" title="This message is invisible for the AI" data-i18n="[title]This message is invisible for the AI"></i>
                                    <small className="timestamp"></small>
                                </div>
                            </div>
                            <div className="mes_buttons">
                                <div title="Message Actions" className="mes_button extraMesButtonsHint fa-solid fa-ellipsis" data-i18n="[title]Message Actions;[aria-label]Message Actions" role="button" aria-label="Message Actions" tabIndex={0}></div>
                                <div className="extraMesButtons">
                                    <div title="Translate message" className="mes_button mes_translate fa-solid fa-language" data-i18n="[title]Translate message;[aria-label]Translate message" role="button" aria-label="Translate message" tabIndex={0}></div>
                                    <div title="Generate Image" className="mes_button sd_message_gen fa-solid fa-paintbrush" data-i18n="[title]Generate Image;[aria-label]Generate Image" role="button" aria-label="Generate Image" tabIndex={0}></div>
                                    <div title="Narrate" className="mes_button mes_narrate fa-solid fa-bullhorn" data-i18n="[title]Narrate;[aria-label]Narrate" role="button" aria-label="Narrate" tabIndex={0}></div>
                                    <div title="Exclude message from prompts" className="mes_button mes_hide fa-solid fa-eye" data-i18n="[title]Exclude message from prompts;[aria-label]Exclude message from prompts" role="button" aria-label="Exclude message from prompts" tabIndex={0}></div>
                                    <div title="Include message in prompts" className="mes_button mes_unhide fa-solid fa-eye-slash" data-i18n="[title]Include message in prompts;[aria-label]Include message in prompts" role="button" aria-label="Include message in prompts" tabIndex={0}></div>
                                    <div title="Toggle media display style" className="mes_button mes_media_gallery fa-solid fa-photo-film" data-i18n="[title]Toggle media display style;[aria-label]Toggle media display style" role="button" aria-label="Toggle media display style" tabIndex={0}></div>
                                    <div title="Toggle media display style" className="mes_button mes_media_list fa-solid fa-table-cells-large" data-i18n="[title]Toggle media display style;[aria-label]Toggle media display style" role="button" aria-label="Toggle media display style" tabIndex={0}></div>
                                    <div title="Embed file or image" className="mes_button mes_embed fa-solid fa-paperclip" data-i18n="[title]Embed file or image;[aria-label]Embed file or image" role="button" aria-label="Embed file or image" tabIndex={0}></div>
                                    <div title="Create branch" className="mes_button mes_create_branch fa-regular fa-code-branch" data-i18n="[title]Create Branch;[aria-label]Create branch" role="button" aria-label="Create branch" tabIndex={0}></div>
                                    <div title="Copy" className="mes_button mes_copy fa-solid fa-copy " data-i18n="[title]Copy;[aria-label]Copy" role="button" aria-label="Copy" tabIndex={0}></div>
                                </div>
                                <div title="Edit" className="mes_button mes_edit fa-solid fa-pencil " data-i18n="[title]Edit;[aria-label]Edit" role="button" aria-label="Edit" tabIndex={0}></div>
                            </div>
                            <div className="mes_edit_buttons">
                                <div className="mes_edit_done menu_button  fa-solid fa-check" title="Confirm" data-i18n="[title]Confirm;[aria-label]Confirm" role="button" aria-label="Confirm" tabIndex={0}></div>
                                <div className="mes_edit_copy menu_button  fa-solid fa-copy" title="Copy this message" data-i18n="[title]Copy this message;[aria-label]Copy this message" role="button" aria-label="Copy this message" tabIndex={0}></div>
                                <div className="mes_edit_add_reasoning menu_button fa-solid fa-lightbulb" title="Add a reasoning block" data-i18n="[title]Add a reasoning block;[aria-label]Add a reasoning block" role="button" aria-label="Add a reasoning block" tabIndex={0}></div>
                                <div className="mes_edit_delete menu_button  fa-solid fa-trash-can" title="Delete this message" data-i18n="[title]Delete this message;[aria-label]Delete this message" role="button" aria-label="Delete this message" tabIndex={0}></div>
                                <div className="mes_edit_up menu_button  fa-solid fa-chevron-up " title="Move message up" data-i18n="[title]Move message up;[aria-label]Move message up" role="button" aria-label="Move message up" tabIndex={0}></div>
                                <div className="mes_edit_down menu_button  fa-solid fa-chevron-down" title="Move message down" data-i18n="[title]Move message down;[aria-label]Move message down" role="button" aria-label="Move message down" tabIndex={0}></div>
                                <div className="mes_edit_cancel menu_button  fa-solid fa-xmark" title="Cancel" data-i18n="[title]Cancel;[aria-label]Cancel" role="button" aria-label="Cancel" tabIndex={0} data-action="cancel-edit"></div>
                            </div>
                        </div>
                        <details className="mes_reasoning_details">
                            <summary className="mes_reasoning_summary flex-container">
                                <div className="mes_reasoning_header_block flex-container">
                                    <div className="mes_reasoning_header flex-container">
                                        <span className="mes_reasoning_header_title" data-i18n="Thought for some time">Thought for some time</span>
                                        <div className="mes_reasoning_arrow fa-solid fa-chevron-up"></div>
                                    </div>
                                </div>
                                <div className="mes_reasoning_actions flex-container">
                                    <div className="mes_reasoning_edit_done menu_button edit_button fa-solid fa-check" title="Confirm" data-i18n="[title]Confirm Edit;[aria-label]Confirm Edit" role="button" aria-label="Confirm Edit" tabIndex={0}></div>
                                    <div className="mes_reasoning_delete menu_button edit_button fa-solid fa-trash-can" title="Remove reasoning" data-i18n="[title]Remove reasoning;[aria-label]Remove reasoning" role="button" aria-label="Remove reasoning" tabIndex={0}></div>
                                    <div className="mes_reasoning_edit_cancel menu_button edit_button fa-solid fa-xmark" title="Cancel edit" data-i18n="[title]Cancel edit;[aria-label]Cancel edit" role="button" aria-label="Cancel edit" tabIndex={0}></div>
                                    <div className="mes_reasoning_close_all mes_button fa-solid fa-minimize" title="Collapse all reasoning blocks" data-i18n="[title]Collapse all reasoning blocks;[aria-label]Collapse all reasoning blocks" role="button" aria-label="Collapse all reasoning blocks" tabIndex={0}></div>
                                    <div className="mes_reasoning_copy mes_button fa-solid fa-copy" title="Copy reasoning" data-i18n="[title]Copy reasoning;[aria-label]Copy reasoning" role="button" aria-label="Copy reasoning" tabIndex={0}></div>
                                    <div className="mes_reasoning_edit mes_button fa-solid fa-pencil" title="Edit reasoning" data-i18n="[title]Edit reasoning;[aria-label]Edit reasoning" role="button" aria-label="Edit reasoning" tabIndex={0}></div>
                                </div>
                            </summary>
                            <div className="mes_reasoning"></div>
                        </details>
                        <div className="mes_text"></div>
                        <div className="mes_media_wrapper"></div>
                        <div className="mes_file_wrapper"></div>
                        <div className="mes_bias"></div>
                    </div>
                </div>
            </div>
            <div id="bogus_folder_template" className="template_element">
                <div className="bogus_folder_select entity_block flex-container wide100p alignitemsflexstart">
                    <div className="avatar flex alignitemscenter textAlignCenter">
                        <i className="bogus_folder_icon fa-solid fa-xl"></i>
                    </div>
                    <div className="flex-container wide100pLess70px character_select_container">
                        <div className="wide100p character_name_block">
                            <span className="ch_name"></span>
                            <small className="ch_additional_info bogus_folder_counter"></small>
                        </div>
                        <small className="character_name_block_sub_line bogus_folder_hidden_counter"></small>
                        <div className="bogus_folder_avatars_block avatars_inline avatars_inline_small tags tags_inline"></div>
                    </div>
                </div>
            </div>
            <div id="bogus_folder_back_template" className="template_element">
                <div className="bogus_folder_select bogus_folder_select_back flex-container wide100p alignitemsflexstart" id="BogusFolderBack" {...{ tagid: 'back' }}>
                    <div className="avatar flex alignitemscenter textAlignCenter">
                        <i className="bogus_folder_icon fa-solid fa-xl fa-right-from-bracket fa-flip-horizontal"></i>
                    </div>
                    <div className="bogus_folder_back_placeholder flex alignitemscenter textAlignCenter">
                        <i className="bogus_folder_icon fa-solid fa-xl fa-right-from-bracket fa-flip-horizontal"></i>
                    </div>
                    <div className="flex-container wide100pLess70px character_select_container height100p alignitemscenter">
                        <div className="wide100p character_name_block">
                            <span className="ch_name" data-i18n="Go back">Go back</span>
                        </div>
                    </div>
                </div>
            </div>
            <div id="inline_avatar_template" className="template_element">
                <div className="avatar inline_avatar flex alignitemscenter textAlignCenter">
                    <img src="img/No-Image-Placeholder.svg" loading="lazy" decoding="async" />
                </div>
            </div>
            <div id="alternate_greetings_template" className="template_element">
                <div className="alternate_grettings flexFlowColumn flex-container">
                    <div className="title_restorable">
                        <h3><span data-i18n="Alternate Greetings" className="mdhotkey_location">Alternate Greetings</span></h3>
                        <div className="menu_button menu_button_icon add_alternate_greeting">
                            <i className="fa-solid fa-plus"></i>
                            <span data-i18n="Add">Add</span>
                        </div>
                    </div>
                    <small className="justifyLeft" data-i18n="Alternate_Greetings_desc">
                        Alternate first-message texts stored with the character card.
                    </small>
                    <hr />
                    <div className="alternate_greetings_list flexFlowColumn flex-container wide100p">
                        <strong className="alternate_grettings_hint margin-bot-10px">
                            <span data-i18n="alternate_greetings_hint_1">Click the</span> <i className="fa-solid fa-plus"></i> <span data-i18n="alternate_greetings_hint_2">button to get started!</span>
                        </strong>
                    </div>
                </div>
            </div>
            <div id="alternate_greeting_form_template" className="template_element">
                <div className="alternate_greeting">
                    <details open>
                        <summary>
                            <div className="title_restorable gap5px">
                                <div className="flex-container alignItemsCenter">
                                    <strong><span data-i18n="Alternate Greeting #">Alternate Greeting #</span><span className="greeting_index"></span></strong>
                                    <i className="editor_maximize fa-solid fa-expand right_menu_button" title="Expand the editor" data-i18n="[title]Expand the editor"></i>
                                </div>
                                <span className="expander"></span>
                                <div className="menu_button menu_button_icon move_up_alternate_greeting" title="Move up" data-i18n="[title]Move up">
                                    <i className="fa-solid fa-chevron-up"></i>
                                </div>
                                <div className="menu_button menu_button_icon move_down_alternate_greeting" title="Move down" data-i18n="[title]Move down">
                                    <i className="fa-solid fa-chevron-down"></i>
                                </div>
                                <div className="menu_button menu_button_icon delete_alternate_greeting">
                                    <i className="fa-solid fa-trash-alt"></i>
                                    <span data-i18n="Delete">Delete</span>
                                </div>
                            </div>
                        </summary>
                        <textarea data-macros="" name="alternate_greetings" data-i18n="[placeholder](This will be the first message from the character that starts every chat)" placeholder="(This will be the first message from the character that starts every chat)" className="text_pole textarea_compact alternate_greeting_text" defaultValue="" autoComplete="off" rows={12}></textarea>
                    </details>
                </div>
            </div>

            {/* Media Templates */}
            <div id="message_file_template" className="template_element">
                <div className="mes_media_container mes_file_container">
                    <div className="fa-lg fa-solid fa-file-alt mes_file_icon"></div>
                    <div className="mes_file_name"></div>
                    <div className="mes_file_size"></div>
                    <div className="right_menu_button mes_file_open fa-solid fa-magnifying-glass" title="View contents" data-i18n="[title]View contents"></div>
                    <div className="right_menu_button mes_file_delete fa-solid fa-trash-can" title="Remove the file" data-i18n="[title]Remove the file"></div>
                </div>
            </div>

            <div id="message_image_template" className="template_element">
                <div className="mes_media_container mes_img_container">
                    <div className="mes_img_controls">
                        <div title="Expand and zoom" className="right_menu_button fa-lg fa-solid fa-magnifying-glass mes_media_enlarge" data-i18n="[title]Expand and zoom"></div>
                        <div title="Caption" className="right_menu_button fa-lg fa-solid fa-envelope-open-text mes_img_caption" data-i18n="[title]Caption"></div>
                        <div title="Delete" className="right_menu_button fa-lg fa-solid fa-trash-can mes_media_delete" data-i18n="[title]Delete"></div>
                    </div>
                    <img className="mes_img" src="img/No-Image-Placeholder.svg" />
                </div>
            </div>

            <div id="message_video_template" className="template_element">
                <div className="mes_media_container mes_video_container">
                    <div className="mes_video_controls">
                        <div title="Expand and zoom" className="right_menu_button fa-lg fa-solid fa-magnifying-glass mes_media_enlarge" data-i18n="[title]Expand and zoom"></div>
                        <div title="Caption" className="right_menu_button fa-lg fa-solid fa-envelope-open-text mes_img_caption" data-i18n="[title]Caption"></div>
                        <div title="Delete" className="right_menu_button fa-lg fa-solid fa-trash-can mes_media_delete" data-i18n="[title]Delete"></div>
                    </div>
                    <video className="mes_video" controls preload="metadata"></video>
                </div>
            </div>

            <div id="message_gallery_controls" className="template_element">
                <div className="mes_img_swipes">
                    <div title="Swipe left" className="right_menu_button fa-lg fa-solid fa-chevron-left mes_img_swipe_left" data-i18n="[title]Swipe left;[aria-label]Swipe left" role="button" aria-label="Swipe left" tabIndex={0}></div>
                    <div className="mes_img_swipe_counter">1/1</div>
                    <div title="Swipe right" className="right_menu_button fa-lg fa-solid fa-chevron-right mes_img_swipe_right" data-i18n="[title]Swipe right;[aria-label]Swipe right" role="button" aria-label="Swipe right" tabIndex={0}></div>
                </div>
            </div>

            <div id="message_audio_template" className="template_element">
                <div className="mes_media_container mes_audio_container audio-player">
                    <audio className="mes_audio" preload="auto" hidden></audio>
                    <div className="audio-player-header">
                        <div className="audio-player-title">Audio</div>
                        <div className="right_menu_button mes_media_delete fa-fw fa-solid fa-trash-can" title="Delete" data-i18n="[title]Delete"></div>
                    </div>
                    <div className="audio-player-controls">
                        <button className="audio-player-play-pause right_menu_button fa-fw fa-solid fa-play" title="Play" data-i18n="[title]Play"></button>
                        <div className="audio-player-time">
                            <span className="audio-player-current-time">0:00</span>
                            <span className="audio-player-time-separator">/</span>
                            <span className="audio-player-total-time">0:00</span>
                        </div>
                        <div className="audio-player-progress">
                            <div className="audio-player-progress-bar"></div>
                        </div>
                        <div className="audio-player-volume-control">
                            <button className="audio-player-volume right_menu_button fa-fw fa-solid fa-volume-high" title="Mute" data-i18n="[title]Mute"></button>
                        </div>
                    </div>
                </div>
            </div>
            <div id="sheld">
                <div id="chat" inert={!ready}>
                </div>
                <div id="chat_reply_actions" inert={!ready} />
                <div id="form_sheld" inert={!ready}>
                    <div id="dialogue_del_mes">
                    </div>
                    <div id="send_form" className="no-connection">
                    </div>
                </div>
                {!ready && (
                    <div id="workspace-startup">
                        <div className="workspace-startup-chat">
                            {startup === 'failed' ? (
                                <div className="workspace-startup-error">
                                    <p role="alert">{translate('Unable to start the workspace.')}</p>
                                    <button type="button" className="menu_button" onClick={() => location.reload()}>
                                        {translate('Reload page')}
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <div className="workspace-startup-lines" aria-hidden="true"><span /><span /></div>
                                    <div className="workspace-startup-lines workspace-startup-lines-user" aria-hidden="true"><span /></div>
                                    <output className="workspace-startup-status">{translate('Loading workspace…')}</output>
                                </>
                            )}
                        </div>
                        <div className="workspace-startup-composer" aria-hidden="true"><span /><span /></div>
                    </div>
                )}
            </div>
            {/* popups live outside sheld to avoid blur conflicts */}
            <div id="options" className="font-family-reset" style={{ display: "none" }}>
            </div>
        </>
    );
}
