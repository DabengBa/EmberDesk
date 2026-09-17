export function WorldInfoPanel() {
    return (
        <>
                <div id="WorldInfoheader" className="fa-solid fa-grip drag-grabber"></div>
                <div className="flex-container alignitemscenter gap10px">
                    <div id="WI_panel_pin_div" title="Locked = World Editor will stay open" data-i18n="[title]Locked = World Editor will stay open">
                        <input type="checkbox" id="WI_panel_pin" />
                        <label htmlFor="WI_panel_pin">
                            <div className="unchecked fa-solid fa-unlock "></div>
                            <div className="checked fa-solid fa-lock "></div>
                        </label>
                    </div>
                    <h3 className="margin0">
                        <span data-i18n="Worlds/Lorebooks">Worlds/Lorebooks</span>
                        <a href="usage/core-concepts/worldinfo/" className="notes-link" target="_blank">
                            <span className="fa-solid fa-circle-question note-link-span"></span>
                        </a>
                    </h3>
                </div>
                <div id="wi-holder" className="margin5 wi-workbench">
                    <section id="wiGlobalPanel" className="wi-section wi-global-panel" aria-labelledby="wiGlobalPanelTitle">
                        <div className="wi-section-header">
                            <div className="wi-section-heading">
                                <span id="wiGlobalPanelTitle" className="wi-section-title" data-i18n="Global World Info">Global World Info</span>
                                <span className="wi-section-subtitle" data-i18n="Applies to all chats">Applies to all chats</span>
                                <span id="wiGlobalCount" className="wi-global-count" aria-live="polite">0 active</span>
                            </div>
                        </div>
                        <div id="wiTopBlock" className="wi-global-grid inline-drawer wide100p">
                            <div id="WIMultiSelector" className="wi-global-control">
                                <select id="world_info" multiple aria-label="Global World Info active in all chats" data-placeholder="No global worlds active. Select one or more worlds.">
                                    <option value="" data-i18n="-- World Info not found --">-- World Info not found -- </option>
                                </select>
                            </div>
                            <div className="wi-global-settings">
                                <div className="wi-settings-toggle inline-drawer-toggle inline-drawer-header">
                                    <span data-i18n="Activation Rules">Activation Rules</span>
                                    <div className="fa-solid fa-circle-chevron-down inline-drawer-icon down"></div>
                                </div>
                            </div>
                            <div className="inline-drawer-content wi-global-rules-content">
                                <div id="wiActivationSettings" className="flex-container">
                                    <div id="wiSliders" className="flex2 flex-container">
                                        <div className="alignitemscenter flex-container flexFlowColumn flexGrow flexShrink gap0 flexBasis48p">
                                            <small>
                                                <span data-i18n="Scan Depth">Scan Depth</span>
                                            </small>
                                            <input className="neo-range-slider" type="range" id="world_info_depth" name="world_info_depth" min="0" max="1000" step="1" />
                                            <input className="neo-range-input" type="number" min="0" max="1000" step="1" data-htmlFor="world_info_depth" id="world_info_depth_counter" />
                                        </div>

                                            <div className="alignitemscenter flex-container flexFlowColumn flexGrow flexShrink gap0 flexBasis48p">
                                                <small>
                                                    <span data-i18n="Context %">Context %</span>
                                                </small>
                                                <input className="neo-range-slider" type="range" id="world_info_budget" name="world_info_budget" min="1" max="100" step="1" />
                                                <input className="neo-range-input" type="number" min="1" max="100" step="1" data-htmlFor="world_info_budget" id="world_info_budget_counter" />
                                            </div>

                                            <div className="alignitemscenter flex-container flexFlowColumn flexGrow flexShrink gap0 flexBasis48p">
                                                <small>
                                                    <span data-i18n="Budget Cap">Budget Cap</span>
                                                    <div className="fa-solid fa-circle-info opacity50p" data-i18n="[title](0 = disabled)" title="(0 = disabled)"></div>
                                                </small>
                                                <input className="neo-range-slider" type="range" id="world_info_budget_cap" name="world_info_budget_cap" min="0" max="65536" step="1" />
                                                <input className="neo-range-input" type="number" min="0" max="65536" step="1" data-htmlFor="world_info_budget_cap" id="world_info_budget_cap_counter" />
                                            </div>

                                            <div className="alignitemscenter flex-container flexFlowColumn flexGrow flexShrink gap0 flexBasis48p" title="Scan chronologically until reached min entries or token budget." data-i18n="[title]Scan chronologically until reached min entries or token budget.">
                                                <small>
                                                    <span data-i18n="Min Activations">Min Activations</span>
                                                    <div className="fa-solid fa-triangle-exclamation opacity50p" data-i18n="[title](disabled when max recursion steps are used)" title="(disabled when max recursion steps are used)"></div>
                                                </small>
                                                <input className="neo-range-slider" type="range" id="world_info_min_activations" name="world_info_min_activations" min="0" max="100" step="1" />
                                                <input className="neo-range-input" type="number" min="0" max="100" step="1" data-htmlFor="world_info_min_activations" id="world_info_min_activations_counter" />
                                            </div>

                                            <div className="alignitemscenter flex-container flexFlowColumn flexGrow flexShrink gap0 flexBasis48p" title="Scan chronologically until reached min entries or token budget." data-i18n="[title]Scan chronologically until reached min entries or token budget.">
                                                <small>
                                                    <span data-i18n="Max Depth">Max Depth</span>
                                                    <div className="fa-solid fa-circle-info opacity50p" data-i18n="[title](0 = unlimited, use budget)" title="(0 = unlimited, use budget)"></div>
                                                </small>
                                                <input className="neo-range-slider" type="range" id="world_info_min_activations_depth_max" name="volume" min="0" max="100" step="1" />
                                                <input className="neo-range-input" type="number" min="0" max="100" step="1" data-htmlFor="world_info_min_activations_depth_max" id="world_info_min_activations_depth_max_counter" />
                                            </div>
                                            <div className="alignitemscenter flex-container flexFlowColumn flexGrow flexShrink gap0 flexBasis48p" title="Cap the number of entry activation recursions" data-i18n="[title]Cap the number of entry activation recursions">
                                                <small>
                                                    <span data-i18n="Max Recursion Steps">Max Recursion Steps</span>
                                                    <div className="fa-solid fa-triangle-exclamation opacity50p" data-i18n="[title]0 = unlimited, 1 = scans once and doesn't recurse, 2 = scans once and recurses once, etc" title={"0 = unlimited, 1 = scans once and doesn't recurse, 2 = scans once and recurses once, etc\n(disabled when min activations are used)"}></div>
                                                </small>
                                                <input className="neo-range-slider" type="range" id="world_info_max_recursion_steps" name="world_info_max_recursion_steps" min="0" max="10" step="1" />
                                                <input className="neo-range-input" type="number" min="0" max="10" step="1" data-htmlFor="world_info_max_recursion_steps" id="world_info_max_recursion_steps_counter" />
                                            </div>

                                            <div className="alignitemscenter flex-container flexFlowColumn flexGrow flexShrink flexBasis48p">
                                                <small data-i18n="Insertion Strategy">
                                                    Insertion Strategy
                                                </small>
                                                <select id="world_info_character_strategy" className="flexGrow margin0">
                                                    <option value="0" data-i18n="Sorted Evenly">Sorted Evenly</option>
                                                    <option value="1" data-i18n="Character Lore First">Character Lore First</option>
                                                    <option value="2" data-i18n="Global Lore First">Global Lore First</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div id="wiCheckboxes" className="flex1 flex-container flexFlowColumn">
                                            <label title="Include names with each message into the context for scanning" data-i18n="[title]Include names with each message into the context for scanning" className="checkbox_label flex1">
                                                <input id="world_info_include_names" type="checkbox" />
                                                <small data-i18n="Include Names" className="whitespacenowrap flex1">
                                                    Include Names
                                                </small>
                                            </label>
                                            <label title="Entries can activate other entries by mentioning their keywords" data-i18n="[title]Entries can activate other entries by mentioning their keywords" className="checkbox_label flex1">
                                                <input id="world_info_recursive" type="checkbox" />
                                                <small data-i18n="Recursive Scan" className="whitespacenowrap flex1">
                                                    Recursive Scan
                                                </small>
                                            </label>
                                            <label title="Lookup for the entry keys in the context will respect the case" data-i18n="[title]Lookup for the entry keys in the context will respect the case" className="checkbox_label flex1">
                                                <input id="world_info_case_sensitive" type="checkbox" />
                                                <small data-i18n="Case Sensitive" className="whitespacenowrap flex1">
                                                    Case-sensitive
                                                </small>
                                            </label>
                                            <label title="If the entry key consists of only one word, it would not be matched as part of other words" data-i18n="[title]If the entry key consists of only one word, it would not be matched as part of other words" className="checkbox_label flex1">
                                                <input id="world_info_match_whole_words" type="checkbox" />
                                                <small data-i18n="Match Whole Words" className="whitespacenowrap flex1">
                                                    Match Whole Words
                                                </small>
                                            </label>
                                            <label title="Only the entries with the most number of key matches will be selected for Inclusion Group filtering" data-i18n="[title]Only the entries with the most number of key matches will be selected for Inclusion Group filtering" className="checkbox_label flex1">
                                                <input id="world_info_use_group_scoring" type="checkbox" />
                                                <small data-i18n="Use Group Scoring" className="whitespacenowrap flex1">
                                                    Use Group Scoring
                                                </small>
                                            </label>
                                            <label title="Alert if your world info is greater than the allocated budget." data-i18n="[title]Alert if your world info is greater than the allocated budget." className="checkbox_label flex1">
                                                <input id="world_info_overflow_alert" type="checkbox" />
                                                <small data-i18n="Alert On Overflow" className="whitespacenowrap flex1">
                                                    Alert On Overflow
                                                </small>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                    </section>
                    <section id="wiEditorPanel" className="wi-section wi-editor-panel" aria-labelledby="wiEditorPanelTitle">
                        <div className="wi-section-header">
                            <div className="wi-section-heading">
                                <span id="wiEditorPanelTitle" className="wi-section-title" data-i18n="World Info Editor">World Info Editor</span>
                                <span className="wi-section-subtitle" data-i18n="Edit entries">Edit entries</span>
                            </div>
                        </div>
                        <div id="world_popup" data-deferred-panel="world-info-body">
                            <div className="deferred-panel-placeholder" style={{ "padding": "1em", "color": "var(--SmartThemeQuoteColor)", "textAlign": "center" }}>
                                <i className="fa-solid fa-spinner fa-spin" /> <span data-i18n="Loading…">Loading…</span>
                            </div>
                        </div>
                    </section>
                </div>
        </>
    );
}
