import { useSyncExternalStore } from 'react';
import { translate } from '@/compat/i18n.js';
import type { ToolBindingsService } from '@/lib/tool-bindings-service';
import { ContractButton } from '../contract/ContractButton';

export type ToolBindingsBridge = {
    service: ToolBindingsService;
    openEditor: (id: string | null) => void | Promise<void>;
    deleteBinding: (id: string) => void | Promise<void>;
};

export function ToolBindingsPanel({ bridge }: { bridge: ToolBindingsBridge }) {
    const { service } = bridge;
    const { bindings, forceTool } = useSyncExternalStore(service.subscribe, service.getSnapshot, service.getSnapshot);
    return <>
        <style>{`
            input.enable_scoped.tool-binding-enabled { display: block !important; }
            .tool-binding-toggle:has(.tool-binding-enabled:focus-visible) {
                outline: 2px solid var(--SmartThemeQuoteColor);
                outline-offset: 2px;
            }
        `}</style>
        <div className="flex-container">
            <ContractButton id="open_tool_binding_editor" className="menu_button menu_button_icon" label={translate('+ Tool binding')} nativeTitle title={translate('New tool binding')} onClick={() => void bridge.openEditor(null)} icon={<i className="fa-solid fa-wrench" aria-hidden="true" />} />
            <div className="flex1" />
            <label className="checkbox flex-container margin-r5 tool-binding-toggle" htmlFor="tool_choice_required" title={translate('Force the model to call a tool on every request (tool_choice: required)')}>
                <input type="checkbox" id="tool_choice_required" className="sr-only tool-binding-enabled" aria-label={translate('Force call')} checked={forceTool} onChange={event => service.setForceTool(event.target.checked)} />
                <span className="tool-binding-toggle-on fa-solid fa-toggle-on fa-lg" title={translate('tool_choice: required')} />
                <span className="tool-binding-toggle-off fa-solid fa-toggle-off fa-lg" title={translate('tool_choice: auto')} />
            </label>
            <span className="marginLeft5 opacity50p" title={translate('tool_choice: auto → required')}>{translate('Force call')}</span>
        </div><hr />
        <small>{translate('When enabled this ships as a real function tool with generation requests; the action receives only args.')}</small>
        <div id="saved_tool_bindings" className="flex-container regex-script-container flexFlowColumn">
            {bindings.length === 0 && <div className="regex-script-empty">{translate('No tool bindings yet.')}</div>}
            {bindings.map(binding => <div key={binding.id} className="regex-script-label tool-binding-label flex-container flexnowrap">
                <div className="regex_script_name tool-binding-name flex1 overflow-hidden" title={binding.name}>{binding.displayName ? `${binding.displayName} (${binding.name})` : binding.name}{binding.stealth && <i className="fa-solid fa-ghost fa-sm marginLeft5" title={translate('Stealth: hidden from chat, no follow-up generation')} />}</div>
                <div className="flex-container flexnowrap">
                    <label className="checkbox flex-container margin-r5 tool-binding-toggle" title={translate('Enabled')}><input type="checkbox" className="sr-only enable_scoped tool-binding-enabled" aria-label={`${translate('Enabled')}: ${binding.displayName || binding.name}`} checked={binding.enabled} onChange={event => service.save({ ...binding, enabled: event.target.checked })} /><span className="tool-binding-toggle-on fa-solid fa-toggle-on" title={translate('Enabled')} /><span className="tool-binding-toggle-off fa-solid fa-toggle-off" title={translate('Disabled')} /></label>
                    <button type="button" className="menu_button tool-binding-edit" title={translate('Edit')} aria-label={translate('Edit')} onClick={() => void bridge.openEditor(binding.id)}><i className="fa-solid fa-pencil" /></button>
                    <button type="button" className="menu_button tool-binding-delete" title={translate('Delete')} aria-label={translate('Delete')} onClick={() => void bridge.deleteBinding(binding.id)}><i className="fa-solid fa-trash" /></button>
                </div>
            </div>)}
        </div>
    </>;
}
