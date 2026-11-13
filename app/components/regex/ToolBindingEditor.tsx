import { useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { isValidToolName, sanitizeToolParameters } from '../../../public/scripts/tool-bindings-core.js';
import type { ToolBinding } from '@/lib/tool-bindings-service';
import { translate, useTranslated } from '@/compat/i18n.js';

export type ToolBindingEditorController = { submit: () => ToolBinding | null };
export type ToolBindingEditorProps = { existing: ToolBinding | null; bindings: ToolBinding[]; controller: ToolBindingEditorController };

export function ToolBindingEditor({ existing, bindings, controller }: ToolBindingEditorProps) {
    useTranslated('');
    const [draft, setDraft] = useState(() => ({ name: existing?.name ?? '', displayName: existing?.displayName ?? '', description: existing?.description ?? '', parameters: JSON.stringify(existing?.parameters ?? { type: 'object', properties: {} }, null, 2), actionBody: existing?.actionBody ?? '', formatMessageBody: existing?.formatMessageBody ?? '', enabled: existing?.enabled ?? true, stealth: existing?.stealth ?? false }));
    const [errors, setErrors] = useState({ name: '', parameters: '' });
    const nameInput = useRef<HTMLInputElement>(null);
    const parametersInput = useRef<HTMLTextAreaElement>(null);
    useLayoutEffect(() => {
        controller.submit = () => {
            const name = draft.name.trim();
            let nameError = isValidToolName(name) ? '' : translate('Enter a tool name (1-64 chars: letters, digits, _ and -).');
            if (name && bindings.some(binding => binding.name === name && binding.id !== existing?.id)) nameError = translate('A tool with this name already exists.');
            let parameters: object = { type: 'object', properties: {} };
            let parametersError = '';
            try {
                if (draft.parameters.trim()) parameters = sanitizeToolParameters(JSON.parse(draft.parameters));
            } catch {
                parametersError = translate('Parameters must be a valid JSON Schema object.');
            }
            flushSync(() => setErrors({ name: nameError, parameters: parametersError }));
            if (nameError || parametersError) { (nameError ? nameInput : parametersInput).current?.focus(); return null; }
            return { ...draft, id: existing?.id ?? `tb_${Date.now()}_${Math.random().toString(36).slice(2)}`, name, displayName: draft.displayName.trim(), parameters };
        };
        return () => { controller.submit = () => null; };
    }, [bindings, controller, draft, existing]);
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
                    <input id="tb_name" value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} ref={nameInput} aria-invalid={Boolean(errors.name)} className="text_pole textarea_compact" type="text" required aria-describedby="tb_name_error" aria-label="Tool name" />
                    <small id="tb_name_error" className="regex-validation-error" role="alert" hidden={!errors.name}>{errors.name}</small>
                </div>
            </div>
            <div className="flex1">
                <label htmlFor="tb_display_name" className="title_restorable">
                    <small>{translate('Display name (optional)')}</small>
                </label>
                <div>
                    <input id="tb_display_name" value={draft.displayName} onChange={event => setDraft({ ...draft, displayName: event.target.value })} className="text_pole textarea_compact" type="text" aria-label="Display name" />
                </div>
            </div>
            <div className="flex1">
                <label htmlFor="tb_description" className="title_restorable">
                    <small>{translate('Description (sent to the model)')}</small>
                </label>
                <div>
                    <textarea id="tb_description" value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} className="text_pole wide100p textarea_compact" rows={2} aria-label={translate('Description')} placeholder={translate('The model uses this to decide when to call the tool')}></textarea>
                </div>
            </div>
            <div className="flex1">
                <label htmlFor="tb_parameters" className="title_restorable">
                    <small>{translate('Parameter JSON Schema')}</small>
                </label>
                <div>
                    <textarea id="tb_parameters" value={draft.parameters} onChange={event => setDraft({ ...draft, parameters: event.target.value })} ref={parametersInput} aria-invalid={Boolean(errors.parameters)} className="text_pole wide100p textarea_compact" rows={6} aria-describedby="tb_parameters_error" aria-label="Parameters JSON Schema" placeholder='{"type":"object","properties":{}}'></textarea>
                    <small id="tb_parameters_error" className="regex-validation-error" role="alert" hidden={!errors.parameters}>{errors.parameters}</small>
                </div>
            </div>
            <div className="flex1">
                <label htmlFor="tb_action_body" className="title_restorable">
                    <small>{translate('Action (async (args) => result; receives only args)')}</small>
                </label>
                <div>
                    <textarea id="tb_action_body" value={draft.actionBody} onChange={event => setDraft({ ...draft, actionBody: event.target.value })} className="text_pole wide100p textarea_compact" rows={6} aria-label="Action body" placeholder={'return JSON.stringify({ ok: true });'} spellCheck={false}></textarea>
                </div>
            </div>
            <div className="flex1">
                <label htmlFor="tb_format_message" className="title_restorable">
                    <small>{translate('Call hint format (optional, (parameters) => string)')}</small>
                </label>
                <div>
                    <textarea id="tb_format_message" value={draft.formatMessageBody} onChange={event => setDraft({ ...draft, formatMessageBody: event.target.value })} className="text_pole wide100p textarea_compact" rows={3} aria-label="Format message body" spellCheck={false}></textarea>
                </div>
            </div>
        </div>

        <div className="flex-container regex-editor-options marginTop5">
            <div className="flex1 regex-editor-option-group">
                <h4>{translate('Options')}</h4>
                <label className="checkbox flex-container" title={translate('Send this tool with generation requests when enabled')}>
                    <input type="checkbox" name="tb_enabled" checked={draft.enabled} onChange={event => setDraft({ ...draft, enabled: event.target.checked })} />
                    <span>{translate('Enable')}</span>
                </label>
                <label className="checkbox flex-container" title={translate('Calls are hidden from the chat and do not continue generation')}>
                    <input type="checkbox" name="tb_stealth" checked={draft.stealth} onChange={event => setDraft({ ...draft, stealth: event.target.checked })} />
                    <span>{translate('Stealth (hidden calls, no continuation)')}</span>
                </label>
            </div>
        </div>
    </div>
</div>
    );
}
