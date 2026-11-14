import { useEffect, useRef, useState } from 'react';
import { ContractButton } from '../contract/ContractButton';

import { WorkspacePanelChrome } from '../panels/WorkspacePanelChrome';
import { translate, useTranslated } from '@/compat/i18n.js';
import { RegexBulkControls, RegexRuleGroup, useRegexList } from './RegexRuleList';
import type { RegexListBridge } from './regex-list-types';
import type { RegexPresetController, RegexToolbar } from './regex-types';
import { RegexPresetControls } from './RegexPresetControls';
import { ToolBindingsPanel, type ToolBindingsBridge } from './ToolBindingsPanel';

/**
 * Regex drawer. Two tabs: the legacy regex workbench (markup kept mounted at
 * all times because extensions/regex/index.js binds handlers directly to
 * these ids) and the user-level tool-bindings list managed by
 * public/scripts/tool-bindings.js.
 */
export function RegexSettingsPanel({ list: listBridge, bridge, toolbar, presets, toolBindings }: { list?: RegexListBridge; bridge?: RegexListBridge; toolbar?: RegexToolbar; presets?: RegexPresetController; toolBindings?: ToolBindingsBridge }) {
    useTranslated('');
    const [tab, setTab] = useState<'regex' | 'tools'>('regex');
    const list = useRegexList((listBridge ?? bridge)!);
    const fileInput = useRef<HTMLInputElement>(null);
    const [scopedAllowed, setScopedAllowed] = useState(toolbar?.scopedAllowed ?? false);
    const [presetAllowed, setPresetAllowed] = useState(toolbar?.presetAllowed ?? false);
    useEffect(() => { setScopedAllowed(toolbar?.scopedAllowed ?? false); }, [toolbar?.scopedAllowed]);
    useEffect(() => { setPresetAllowed(toolbar?.presetAllowed ?? false); }, [toolbar?.presetAllowed]);
    function dispatch(action: () => unknown) { Promise.resolve().then(action).catch(error => toolbar?.onError(error instanceof Error ? error.message : String(error))); }
    function authorize(kind: 'scoped' | 'preset', value: boolean) {
        const setter = kind === 'scoped' ? setScopedAllowed : setPresetAllowed;
        const action = kind === 'scoped' ? toolbar?.setScopedAllowed : toolbar?.setPresetAllowed;
        setter(value);
        (async () => action?.(value))().catch(error => { setter((kind === 'scoped' ? toolbar?.scopedAllowed : toolbar?.presetAllowed) ?? false); toolbar?.onError(error instanceof Error ? error.message : String(error)); });
    }
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
                <ContractButton id="open_regex_editor" className="menu_button menu_button_icon" label="+ Global" labelKey="ext_regex_new_global_script" nativeTitle title={translate("New global regex script")} onClick={() => dispatch(() => toolbar?.openEditor(0))} icon={<i className="fa-solid fa-pen-to-square" aria-hidden="true" />} />
                <ContractButton id="open_preset_editor" className="menu_button menu_button_icon" label="+ Preset" labelKey="ext_regex_new_preset_script" nativeTitle title={translate("New preset regex script")} onClick={() => dispatch(() => toolbar?.openEditor(2))} icon={<i className="fa-solid fa-sliders" aria-hidden="true" />} />
                <ContractButton id="open_scoped_editor" className="menu_button menu_button_icon" label="+ Scoped" labelKey="ext_regex_new_scoped_script" nativeTitle title={translate("New scoped regex script")} onClick={() => dispatch(() => toolbar?.openEditor(1))} icon={<i className="fa-solid fa-address-card" aria-hidden="true" />} />
                <ContractButton id="import_regex" className="menu_button menu_button_icon" label="Import" labelKey="ext_regex_import_script" onClick={() => fileInput.current?.click()} icon={<i className="fa-solid fa-file-import" aria-hidden="true" />} />
                <input type="file" id="import_regex_file" hidden accept="*.json" multiple ref={fileInput} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ''; if (files.length) dispatch(() => toolbar?.importFiles(files)); }} />
                <label htmlFor="regex_bulk_edit" className="menu_button menu_button_icon">
                    <input id="regex_bulk_edit" type="checkbox" className="sr-only" checked={list.bulk} disabled={list.pending} onChange={event => list.setBulk(event.target.checked)} />
                    <i className="fa-solid fa-edit" />
                    <small >{translate('Bulk Edit')}</small>
                </label>
                <ContractButton id="open_regex_debugger" className="menu_button menu_button_icon" label="Debugger" labelKey="ext_regex_debugger" nativeTitle title={translate("Advanced Regex Debugger")} onClick={() => dispatch(() => toolbar?.openDebugger())} icon={<i className="fa-solid fa-bug-slash" aria-hidden="true" />} />
            </div>
            <RegexBulkControls list={list} />
            <hr />
            <div id="regex_presets_block">
                <div className="flex-container alignItemsBaseline">
                    <strong className="flex1" >{translate('Regex Presets')}</strong>
                </div>
                <small >{translate('Save and switch between groups of enabled regex scripts.')}</small>
                <RegexPresetControls controller={presets} onError={message => toolbar?.onError(message)} />
            </div>
            <hr />
            <div id="global_scripts_block">
                <div>
                    <strong >{translate('Global Scripts')}</strong>
                </div>
                <small >{translate('Available for all characters. Saved to local settings.')}</small>
                <div id="saved_regex_scripts" no-scripts-text="No scripts found" data-i18n="[no-scripts-text]No scripts found" className="flex-container regex-script-container flexFlowColumn"><RegexRuleGroup list={list} type={0} /></div>
            </div>
            <hr />
            <div id="preset_scripts_block">
                <div className="flex-container alignItemsBaseline">
                    <strong className="flex1" >{translate('Preset Scripts')}</strong>
                    <label id="toggle_preset_regex" className="checkbox flex-container" htmlFor="regex_preset_toggle">
                        <input type="checkbox" id="regex_preset_toggle" className="enable_scoped" checked={presetAllowed} onChange={event => authorize('preset', event.target.checked)} />
                        <span className="sr-only">{translate("Toggle preset regex scripts")}</span>
                        <span className="regex-toggle-on fa-solid fa-toggle-on fa-lg" data-i18n="[title]ext_regex_disallow_preset" title={translate("Disallow using preset regex")}></span>
                        <span className="regex-toggle-off fa-solid fa-toggle-off fa-lg" data-i18n="[title]ext_regex_allow_preset" title={translate("Allow using preset regex")}></span>
                    </label>
                </div>
                <small >{translate('Only available for this preset. Saved to the preset data.')}</small>
                <div id="saved_preset_scripts" no-scripts-text="No scripts found" data-i18n="[no-scripts-text]No scripts found" className="flex-container regex-script-container flexFlowColumn"><RegexRuleGroup list={list} type={2} /></div>
            </div>
            <hr />
            <div id="scoped_scripts_block">
                <div className="flex-container alignItemsBaseline">
                    <strong className="flex1" >{translate('Scoped Scripts')}</strong>
                    <label id="toggle_scoped_regex" className="checkbox flex-container" htmlFor="regex_scoped_toggle">
                        <input type="checkbox" id="regex_scoped_toggle" className="enable_scoped" checked={scopedAllowed} onChange={event => authorize('scoped', event.target.checked)} />
                        <span className="sr-only">{translate("Toggle scoped regex scripts")}</span>
                        <span className="regex-toggle-on fa-solid fa-toggle-on fa-lg" data-i18n="[title]ext_regex_disallow_scoped" title={translate("Disallow using scoped regex")}></span>
                        <span className="regex-toggle-off fa-solid fa-toggle-off fa-lg" data-i18n="[title]ext_regex_allow_scoped" title={translate("Allow using scoped regex")}></span>
                    </label>
                </div>
                <small >{translate('Only available for this character. Saved to the card data.')}</small>
                <div id="saved_scoped_scripts" no-scripts-text="No scripts found" data-i18n="[no-scripts-text]No scripts found" className="flex-container regex-script-container flexFlowColumn"><RegexRuleGroup list={list} type={1} /></div>
            </div>
            </div>
            <div id="tool_bindings_tab_content" className={tab === 'tools' ? '' : 'displayNone'}>
                {toolBindings && <ToolBindingsPanel bridge={toolBindings} />}
            </div>
        </div>
    </WorkspacePanelChrome>
</div>
    );
}
