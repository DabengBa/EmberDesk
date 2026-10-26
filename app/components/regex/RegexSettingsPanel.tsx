import { useState } from 'react';
import { ContractButton } from '../contract/ContractButton';
import { ContractIconButton } from '../contract/ContractIconButton';
import { WorkspacePanelChrome } from '../panels/WorkspacePanelChrome';
import { translate, useTranslated } from '@/compat/i18n.js';

/**
 * Regex drawer. Two tabs: the legacy regex workbench (markup kept mounted at
 * all times because extensions/regex/index.js binds handlers directly to
 * these ids) and the user-level tool-bindings list managed by
 * public/scripts/tool-bindings.js.
 */
export function RegexSettingsPanel() {
    useTranslated('');
    const [tab, setTab] = useState<'regex' | 'tools'>('regex');
    return (
<div className="regex_settings">
    <WorkspacePanelChrome title={translate('Regex')} icon="fa-solid fa-code" grabberId="RegexPanelheader">
        <div>
            <div className="wpc-tabs" role="tablist" aria-label={translate('Regex panel sections')}>
                <button type="button" role="tab" aria-selected={tab === 'regex'} className={`wpc-tab${tab === 'regex' ? ' wpc-tab-active' : ''}`} onClick={() => setTab('regex')}>{translate('Regex')}</button>
                <button type="button" role="tab" aria-selected={tab === 'tools'} className={`wpc-tab${tab === 'tools' ? ' wpc-tab-active' : ''}`} onClick={() => setTab('tools')}>{translate('Tool bindings')}</button>
            </div>
            <div id="regex_tab_content" className={tab === 'regex' ? '' : 'displayNone'}>
            <div className="flex-container">
                <ContractButton id="open_regex_editor" className="menu_button menu_button_icon" label="+ Global" labelKey="ext_regex_new_global_script" nativeTitle title={translate("New global regex script")} icon={<i className="fa-solid fa-pen-to-square" aria-hidden="true" />} />
                <ContractButton id="open_preset_editor" className="menu_button menu_button_icon" label="+ Preset" labelKey="ext_regex_new_preset_script" nativeTitle title={translate("New preset regex script")} icon={<i className="fa-solid fa-sliders" aria-hidden="true" />} />
                <ContractButton id="open_scoped_editor" className="menu_button menu_button_icon" label="+ Scoped" labelKey="ext_regex_new_scoped_script" nativeTitle title={translate("New scoped regex script")} icon={<i className="fa-solid fa-address-card" aria-hidden="true" />} />
                <ContractButton id="import_regex" className="menu_button menu_button_icon" label="Import" labelKey="ext_regex_import_script" icon={<i className="fa-solid fa-file-import" aria-hidden="true" />} />
                <input type="file" id="import_regex_file" hidden accept="*.json" multiple />
                <label htmlFor="regex_bulk_edit" className="menu_button menu_button_icon">
                    <input id="regex_bulk_edit" type="checkbox" className="displayNone" />
                    <i className="fa-solid fa-edit" />
                    <small >{translate('Bulk Edit')}</small>
                </label>
                <ContractButton id="open_regex_debugger" className="menu_button menu_button_icon" label="Debugger" labelKey="ext_regex_debugger" nativeTitle title={translate("Advanced Regex Debugger")} icon={<i className="fa-solid fa-bug-slash" aria-hidden="true" />} />
            </div>
            <hr className="regex_bulk_operations_hr" />
            <div className="regex_bulk_operations flex-container">
                <ContractIconButton id="bulk_select_all_toggle" className="menu_button menu_button_icon" label="Toggle Select All" title={translate("Toggle Select All")} nativeTitle icon={<i className="fa-solid fa-check-double" aria-hidden="true" />} />
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
                    <strong className="flex1" >{translate('Regex Presets')}</strong>
                </div>
                <small >{translate('Save and switch between groups of enabled regex scripts.')}</small>
                <div className="flex-container marginTop5">
                    <select id="regex_presets" className="text_pole flex1" aria-label={translate('Regex presets')}></select>
                    <ContractIconButton id="regex_preset_create" className="menu_button" label="Create a new regex preset" nativeTitle title={translate("Create a new regex preset")} icon={<i className="fa-solid fa-file-circle-plus" aria-hidden="true" />} />
                    <ContractIconButton id="regex_preset_update" className="menu_button" label="Update existing regex preset" nativeTitle title={translate("Update existing regex preset")} icon={<i className="fa-solid fa-save" aria-hidden="true" />} />
                    <ContractIconButton id="regex_preset_apply" className="menu_button" label="Re-apply current preset" nativeTitle title={translate("Re-apply current preset")} icon={<i className="fa-solid fa-recycle" aria-hidden="true" />} />
                    <ContractIconButton id="regex_preset_delete" className="menu_button" label="Delete current preset" nativeTitle title={translate("Delete current preset")} icon={<i className="fa-solid fa-trash" aria-hidden="true" />} />
                </div>
            </div>
            <hr />
            <div id="global_scripts_block">
                <div>
                    <strong >{translate('Global Scripts')}</strong>
                </div>
                <small >{translate('Available for all characters. Saved to local settings.')}</small>
                <div id="saved_regex_scripts" no-scripts-text="No scripts found" data-i18n="[no-scripts-text]No scripts found" className="flex-container regex-script-container flexFlowColumn"></div>
            </div>
            <hr />
            <div id="preset_scripts_block">
                <div className="flex-container alignItemsBaseline">
                    <strong className="flex1" >{translate('Preset Scripts')}</strong>
                    <label id="toggle_preset_regex" className="checkbox flex-container" htmlFor="regex_preset_toggle">
                        <input type="checkbox" id="regex_preset_toggle" className="enable_scoped" />
                        <span className="sr-only">{translate("Toggle preset regex scripts")}</span>
                        <span className="regex-toggle-on fa-solid fa-toggle-on fa-lg" data-i18n="[title]ext_regex_disallow_preset" title={translate("Disallow using preset regex")}></span>
                        <span className="regex-toggle-off fa-solid fa-toggle-off fa-lg" data-i18n="[title]ext_regex_allow_preset" title={translate("Allow using preset regex")}></span>
                    </label>
                </div>
                <small >{translate('Only available for this preset. Saved to the preset data.')}</small>
                <div id="saved_preset_scripts" no-scripts-text="No scripts found" data-i18n="[no-scripts-text]No scripts found" className="flex-container regex-script-container flexFlowColumn"></div>
            </div>
            <hr />
            <div id="scoped_scripts_block">
                <div className="flex-container alignItemsBaseline">
                    <strong className="flex1" >{translate('Scoped Scripts')}</strong>
                    <label id="toggle_scoped_regex" className="checkbox flex-container" htmlFor="regex_scoped_toggle">
                        <input type="checkbox" id="regex_scoped_toggle" className="enable_scoped" />
                        <span className="sr-only">{translate("Toggle scoped regex scripts")}</span>
                        <span className="regex-toggle-on fa-solid fa-toggle-on fa-lg" data-i18n="[title]ext_regex_disallow_scoped" title={translate("Disallow using scoped regex")}></span>
                        <span className="regex-toggle-off fa-solid fa-toggle-off fa-lg" data-i18n="[title]ext_regex_allow_scoped" title={translate("Allow using scoped regex")}></span>
                    </label>
                </div>
                <small >{translate('Only available for this character. Saved to the card data.')}</small>
                <div id="saved_scoped_scripts" no-scripts-text="No scripts found" data-i18n="[no-scripts-text]No scripts found" className="flex-container regex-script-container flexFlowColumn"></div>
            </div>
            </div>
            <div id="tool_bindings_tab_content" className={tab === 'tools' ? '' : 'displayNone'}>
                <div className="flex-container">
                    <ContractButton id="open_tool_binding_editor" className="menu_button menu_button_icon" label={translate('+ Tool binding')} nativeTitle title={translate("New tool binding")} icon={<i className="fa-solid fa-wrench" aria-hidden="true" />} />
                    <div className="flex1"></div>
                    <label className="checkbox flex-container margin-r5" htmlFor="tool_choice_required" title={translate("Force the model to call a tool on every request (tool_choice: required)")}>
                        <input type="checkbox" id="tool_choice_required" className="enable_scoped tool-binding-enabled" />
                        <span className="tool-binding-toggle-on fa-solid fa-toggle-on fa-lg" title={translate("tool_choice: required")}></span>
                        <span className="tool-binding-toggle-off fa-solid fa-toggle-off fa-lg" title={translate("tool_choice: auto")}></span>
                    </label>
                    <span className="marginLeft5 opacity50p" title={translate("tool_choice: auto \u2192 required")}>{translate('Force call')}</span>
                </div>
                <hr />
                <small>{translate('When enabled this ships as a real function tool with generation requests; the action receives only args.')}</small>
                <div id="saved_tool_bindings" className="flex-container regex-script-container flexFlowColumn"></div>
            </div>
        </div>
    </WorkspacePanelChrome>
</div>
    );
}
