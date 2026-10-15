import { WorkspacePanelChrome } from './WorkspacePanelChrome';

export function WorldInfoPanel() {
    return (
        <WorkspacePanelChrome
            title="世界书"
            icon="fa-solid fa-book-atlas"
            grabberId="WorldInfoheader"
        >
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
                                            <input className="neo-range-slider" type="range" id="world_info_depth" name="world_info_depth" min="0" max="1000" step="1" aria-label="Scan Depth" data-i18n="[aria-label]Scan Depth" />
                                            <input className="neo-range-input" type="number" min="0" max="1000" step="1" data-for="world_info_depth" id="world_info_depth_counter" aria-label="Scan Depth" data-i18n="[aria-label]Scan Depth" />
                                        </div>

                                        <div className="alignitemscenter flex-container flexFlowColumn flexGrow flexShrink flexBasis48p">
                                            <small data-i18n="Insertion Strategy">
                                                Insertion Strategy
                                            </small>
                                            <select id="world_info_character_strategy" className="flexGrow margin0" aria-label="Insertion Strategy" data-i18n="[aria-label]Insertion Strategy">
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
        </WorkspacePanelChrome>
    );
}
