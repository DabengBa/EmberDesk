import { ContractButton } from '../contract/ContractButton';
import { ContractIconButton } from '../contract/ContractIconButton';
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
                <ContractButton id="open_regex_editor" className="menu_button menu_button_icon" label="+ Global" labelKey="ext_regex_new_global_script" nativeTitle title="New global regex script" icon={<i className="fa-solid fa-pen-to-square" aria-hidden="true" />} />
                <ContractButton id="open_preset_editor" className="menu_button menu_button_icon" label="+ Preset" labelKey="ext_regex_new_preset_script" nativeTitle title="New preset regex script" icon={<i className="fa-solid fa-sliders" aria-hidden="true" />} />
                <ContractButton id="open_scoped_editor" className="menu_button menu_button_icon" label="+ Scoped" labelKey="ext_regex_new_scoped_script" nativeTitle title="New scoped regex script" icon={<i className="fa-solid fa-address-card" aria-hidden="true" />} />
                <ContractButton id="import_regex" className="menu_button menu_button_icon" label="Import" labelKey="ext_regex_import_script" icon={<i className="fa-solid fa-file-import" aria-hidden="true" />} />
                <input type="file" id="import_regex_file" hidden accept="*.json" multiple />
                <label htmlFor="regex_bulk_edit" className="menu_button menu_button_icon">
                    <input id="regex_bulk_edit" type="checkbox" className="displayNone" />
                    <i className="fa-solid fa-edit" />
                    <small data-i18n="ext_regex_bulk_edit">Bulk Edit</small>
                </label>
                <ContractButton id="open_regex_debugger" className="menu_button menu_button_icon" label="Debugger" labelKey="ext_regex_debugger" nativeTitle title="Advanced Regex Debugger" icon={<i className="fa-solid fa-bug-slash" aria-hidden="true" />} />
            </div>
            <hr className="regex_bulk_operations_hr" />
            <div className="regex_bulk_operations flex-container">
                <ContractIconButton id="bulk_select_all_toggle" className="menu_button menu_button_icon" label="Toggle Select All" title="Toggle Select All" nativeTitle icon={<i className="fa-solid fa-check-double" aria-hidden="true" />} />
                <ContractButton id="bulk_enable_regex" className="menu_button menu_button_icon" label="Enable" icon={<i className="fa-solid fa-toggle-on" aria-hidden="true" />} />
                <ContractButton id="bulk_disable_regex" className="menu_button menu_button_icon" label="Disable" icon={<i className="fa-solid fa-toggle-off" aria-hidden="true" />} />
                <ContractButton id="bulk_regex_move_to_global" style={{ "display": "none" }} className="menu_button menu_button_icon" label="Move to global scripts" labelKey="ext_regex_move_to_global" icon={<i className="fa-solid fa-globe" aria-hidden="true" />} />
                <ContractButton id="bulk_regex_move_to_preset" style={{ "display": "none" }} className="menu_button menu_button_icon" label="Move to preset scripts" labelKey="ext_regex_move_to_preset" icon={<i className="fa-solid fa-sliders" aria-hidden="true" />} />
                <ContractButton id="bulk_regex_move_to_scoped" style={{ "display": "none" }} className="menu_button menu_button_icon" label="Move to scoped scripts" labelKey="ext_regex_move_to_scoped" icon={<i className="fa-solid fa-address-card" aria-hidden="true" />} />
                <ContractButton id="bulk_export_regex" className="menu_button menu_button_icon" label="Export" icon={<i className="fa-solid fa-file-export" aria-hidden="true" />} />
                <ContractButton id="bulk_delete_regex" className="menu_button menu_button_icon" label="Delete" icon={<i className="fa-solid fa-trash" aria-hidden="true" />} />
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
                    <select id="regex_presets" className="text_pole flex1" aria-label="Regex presets"></select>
                    <ContractIconButton id="regex_preset_create" className="menu_button" label="Create a new regex preset" nativeTitle title="Create a new regex preset" icon={<i className="fa-solid fa-file-circle-plus" aria-hidden="true" />} />
                    <ContractIconButton id="regex_preset_update" className="menu_button" label="Update existing regex preset" nativeTitle title="Update existing regex preset" icon={<i className="fa-solid fa-save" aria-hidden="true" />} />
                    <ContractIconButton id="regex_preset_apply" className="menu_button" label="Re-apply current preset" nativeTitle title="Re-apply current preset" icon={<i className="fa-solid fa-recycle" aria-hidden="true" />} />
                    <ContractIconButton id="regex_preset_delete" className="menu_button" label="Delete current preset" nativeTitle title="Delete current preset" icon={<i className="fa-solid fa-trash" aria-hidden="true" />} />
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
                        <span className="sr-only">Toggle preset regex scripts</span>
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
                        <span className="sr-only">Toggle scoped regex scripts</span>
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
