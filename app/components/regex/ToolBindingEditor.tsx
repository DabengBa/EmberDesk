import { translate, useTranslated } from '@/compat/i18n.js';

export function ToolBindingEditor() {
    useTranslated('');
    return (
<div id="tool_binding_editor_template">
    <div className="regex_editor">
        <h3 className="flex-container justifyCenter alignItemsBaseline">
            <strong>{translate('Tool binding editor')}</strong>
        </h3>
        <small className="flex-container extensions_info">
            {translate('Registers a function tool on generation requests. When the model calls it, the action runs (receiving only args); the result is written back as a tool message and generation continues.')}
        </small>
        <hr />

        <div className="flex-container flexFlowColumn">
            <div className="flex1">
                <label htmlFor="tb_name" className="title_restorable">
                    <small>{translate('Tool name (tools[].function.name)')}</small>
                </label>
                <div>
                    <input id="tb_name" className="text_pole textarea_compact" type="text" required aria-describedby="tb_name_error" aria-label="Tool name" />
                    <small id="tb_name_error" className="regex-validation-error" role="alert" hidden></small>
                </div>
            </div>
            <div className="flex1">
                <label htmlFor="tb_display_name" className="title_restorable">
                    <small>{translate('Display name (optional)')}</small>
                </label>
                <div>
                    <input id="tb_display_name" className="text_pole textarea_compact" type="text" aria-label="Display name" />
                </div>
            </div>
            <div className="flex1">
                <label htmlFor="tb_description" className="title_restorable">
                    <small>{translate('Description (sent to the model)')}</small>
                </label>
                <div>
                    <textarea id="tb_description" className="text_pole wide100p textarea_compact" rows={2} aria-label={translate('Description')} placeholder={translate('The model uses this to decide when to call the tool')}></textarea>
                </div>
            </div>
            <div className="flex1">
                <label htmlFor="tb_parameters" className="title_restorable">
                    <small>{translate('Parameter JSON Schema')}</small>
                </label>
                <div>
                    <textarea id="tb_parameters" className="text_pole wide100p textarea_compact" rows={6} aria-describedby="tb_parameters_error" aria-label="Parameters JSON Schema" placeholder='{"type":"object","properties":{}}'></textarea>
                    <small id="tb_parameters_error" className="regex-validation-error" role="alert" hidden></small>
                </div>
            </div>
            <div className="flex1">
                <label htmlFor="tb_action_body" className="title_restorable">
                    <small>{translate('Action (async (args) => result; receives only args)')}</small>
                </label>
                <div>
                    <textarea id="tb_action_body" className="text_pole wide100p textarea_compact" rows={6} aria-label="Action body" placeholder={'return JSON.stringify({ ok: true });'} spellCheck={false}></textarea>
                </div>
            </div>
            <div className="flex1">
                <label htmlFor="tb_format_message" className="title_restorable">
                    <small>{translate('Call hint format (optional, (parameters) => string)')}</small>
                </label>
                <div>
                    <textarea id="tb_format_message" className="text_pole wide100p textarea_compact" rows={3} aria-label="Format message body" spellCheck={false}></textarea>
                </div>
            </div>
        </div>

        <div className="flex-container regex-editor-options marginTop5">
            <div className="flex1 regex-editor-option-group">
                <h4>{translate('Options')}</h4>
                <label className="checkbox flex-container" title={translate('Send this tool with generation requests when enabled')}>
                    <input type="checkbox" name="tb_enabled" defaultChecked />
                    <span>{translate('Enable')}</span>
                </label>
                <label className="checkbox flex-container" title={translate('Calls are hidden from the chat and do not continue generation')}>
                    <input type="checkbox" name="tb_stealth" />
                    <span>{translate('Stealth (hidden calls, no continuation)')}</span>
                </label>
            </div>
        </div>
    </div>
</div>
    );
}
