export function RegexSettingsPanel() {
    return (
<div className="regex_settings">
    <div className="inline-drawer">
        <div className="inline-drawer-toggle inline-drawer-header">
            <b data-i18n="ext_regex_title">
                Regex
            </b>
            <div className="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div className="inline-drawer-content">
            <div className="flex-container">
                <div id="open_regex_editor" className="menu_button menu_button_icon" data-i18n="[title]ext_regex_new_global_script_desc" title="New global regex script">
                    <i className="fa-solid fa-pen-to-square" />
                    <small data-i18n="ext_regex_new_global_script">+ Global</small>
                </div>
                <div id="open_preset_editor" className="menu_button menu_button_icon" data-i18n="[title]ext_regex_new_preset_script_desc" title="New preset regex script">
                    <i className="fa-solid fa-sliders" />
                    <small data-i18n="ext_regex_new_preset_script">+ Preset</small>
                </div>
                <div id="open_scoped_editor" className="menu_button menu_button_icon" data-i18n="[title]ext_regex_new_scoped_script_desc" title="New scoped regex script">
                    <i className="fa-solid fa-address-card" />
                    <small data-i18n="ext_regex_new_scoped_script">+ Scoped</small>
                </div>
                <div id="import_regex" className="menu_button menu_button_icon">
                    <i className="fa-solid fa-file-import" />
                    <small data-i18n="ext_regex_import_script">Import</small>
                </div>
                <input type="file" id="import_regex_file" hidden accept="*.json" multiple />
                <label htmlFor="regex_bulk_edit" className="menu_button menu_button_icon">
                    <input id="regex_bulk_edit" type="checkbox" className="displayNone" />
                    <i className="fa-solid fa-edit" />
                    <small data-i18n="ext_regex_bulk_edit">Bulk Edit</small>
                </label>
                <div id="open_regex_debugger" className="menu_button menu_button_icon" data-i18n="[title]ext_regex_debugger_desc" title="Advanced Regex Debugger">
                    <i className="fa-solid fa-bug-slash" />
                    <small data-i18n="ext_regex_debugger">Debugger</small>
                </div>
            </div>
            <hr className="regex_bulk_operations_hr" />
            <div className="regex_bulk_operations flex-container">
                <div id="bulk_select_all_toggle" className="menu_button menu_button_icon" title="Toggle Select All">
                    <i className="fa-solid fa-check-double" />
                </div>
                <div id="bulk_enable_regex" className="menu_button menu_button_icon">
                    <i className="fa-solid fa-toggle-on" />
                    <small data-i18n="Enable">Enable</small>
                </div>
                <div id="bulk_disable_regex" className="menu_button menu_button_icon">
                    <i className="fa-solid fa-toggle-off" />
                    <small data-i18n="Disable">Disable</small>
                </div>
                <div id="bulk_regex_move_to_global" className="menu_button menu_button_icon" hidden>
                    <i className="fa-solid fa-globe" />
                    <small data-i18n="ext_regex_move_to_global">Move to global scripts</small>
                </div>
                <div id="bulk_regex_move_to_preset" className="menu_button menu_button_icon" hidden>
                    <i className="fa-solid fa-sliders" />
                    <small data-i18n="ext_regex_move_to_preset">Move to preset scripts</small>
                </div>
                <div id="bulk_regex_move_to_scoped" className="menu_button menu_button_icon" hidden>
                    <i className="fa-solid fa-address-card" />
                    <small data-i18n="ext_regex_move_to_scoped">Move to scoped scripts</small>
                </div>
                <div id="bulk_export_regex" className="menu_button menu_button_icon">
                    <i className="fa-solid fa-file-export" />
                    <small data-i18n="Export">Export</small>
                </div>
                <div id="bulk_delete_regex" className="menu_button menu_button_icon">
                    <i className="fa-solid fa-trash" />
                    <small data-i18n="Delete">Delete</small>
                </div>
            </div>
            <hr />
            <div id="regex_presets_block">
                <div className="flex-container alignItemsBaseline">
                    <strong className="flex1" data-i18n="ext_regex_presets">Regex Presets</strong>
                </div>
                <small data-i18n="ext_regex_presets_desc">
                    Save and switch between groups of enabled regex scripts.
                </small>
                <div className="flex-container marginTop5">
                    <select id="regex_presets" className="text_pole flex1"></select>
                    <div id="regex_preset_create" className="menu_button fa-solid fa-file-circle-plus" data-i18n="[title]ext_regex_preset_create" title="Create a new regex preset"></div>
                    <div id="regex_preset_update" className="menu_button fa-solid fa-save" data-i18n="[title]ext_regex_preset_update" title="Update existing regex preset"></div>
                    <div id="regex_preset_apply" className="menu_button fa-solid fa-recycle" data-i18n="[title]ext_regex_preset_apply" title="Re-apply current preset"></div>
                    <div id="regex_preset_delete" className="menu_button fa-solid fa-trash" data-i18n="[title]ext_regex_preset_delete" title="Delete current preset"></div>
                </div>
            </div>
            <hr />
            <div id="global_scripts_block">
                <div>
                    <strong data-i18n="ext_regex_global_scripts">Global Scripts</strong>
                </div>
                <small data-i18n="ext_regex_global_scripts_desc">
                    Available for all characters. Saved to local settings.
                </small>
                <div id="saved_regex_scripts" no-scripts-text="No scripts found" data-i18n="[no-scripts-text]No scripts found" className="flex-container regex-script-container flexFlowColumn"></div>
            </div>
            <hr />
            <div id="preset_scripts_block">
                <div className="flex-container alignItemsBaseline">
                    <strong className="flex1" data-i18n="ext_regex_preset_scripts">Preset Scripts</strong>
                    <label id="toggle_preset_regex" className="checkbox flex-container" htmlFor="regex_preset_toggle">
                        <input type="checkbox" id="regex_preset_toggle" className="enable_scoped" />
                        <span className="regex-toggle-on fa-solid fa-toggle-on fa-lg" data-i18n="[title]ext_regex_disallow_preset" title="Disallow using preset regex"></span>
                        <span className="regex-toggle-off fa-solid fa-toggle-off fa-lg" data-i18n="[title]ext_regex_allow_preset" title="Allow using preset regex"></span>
                    </label>
                </div>
                <small data-i18n="ext_regex_preset_scripts_desc">
                    Only available for this preset. Saved to the preset data.
                </small>
                <div id="saved_preset_scripts" no-scripts-text="No scripts found" data-i18n="[no-scripts-text]No scripts found" className="flex-container regex-script-container flexFlowColumn"></div>
            </div>
            <hr />
            <div id="scoped_scripts_block">
                <div className="flex-container alignItemsBaseline">
                    <strong className="flex1" data-i18n="ext_regex_scoped_scripts">Scoped Scripts</strong>
                    <label id="toggle_scoped_regex" className="checkbox flex-container" htmlFor="regex_scoped_toggle">
                        <input type="checkbox" id="regex_scoped_toggle" className="enable_scoped" />
                        <span className="regex-toggle-on fa-solid fa-toggle-on fa-lg" data-i18n="[title]ext_regex_disallow_scoped" title="Disallow using scoped regex"></span>
                        <span className="regex-toggle-off fa-solid fa-toggle-off fa-lg" data-i18n="[title]ext_regex_allow_scoped" title="Allow using scoped regex"></span>
                    </label>
                </div>
                <small data-i18n="ext_regex_scoped_scripts_desc">
                    Only available for this character. Saved to the card data.
                </small>
                <div id="saved_scoped_scripts" no-scripts-text="No scripts found" data-i18n="[no-scripts-text]No scripts found" className="flex-container regex-script-container flexFlowColumn"></div>
            </div>
        </div>
    </div>
</div>
    );
}
