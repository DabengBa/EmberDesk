import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ChangeEvent, ComponentProps, ReactNode, SyntheticEvent } from 'react';
import type { PresetService } from '../../lib/preset-service';
import { ContractIconButton } from '../contract/ContractIconButton';
import { PresetActionsMenu } from './PresetActionsMenu';
import { translate, useTranslated } from '@/compat/i18n.js';

function NumericInput({ current, scale = 1, commit, unit, ...props }: Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'type'> & { current: number; scale?: number; commit: (value: number) => boolean; unit?: string }) {
    const input = useRef<HTMLInputElement>(null);
    const [error, setError] = useState(false);
    const lastCommitted = useRef(current);
    useEffect(() => {
        if (current !== lastCommitted.current && input.current) {
            input.current.value = String(current / scale);
            setError(false);
        }
        lastCommitted.current = current;
    }, [current, scale]);
    const apply = (element: HTMLInputElement) => {
        if (!element.validity.valid || element.value === '') return false;
        const next = Math.round(element.valueAsNumber * scale * 100) / 100;
        if (Number.isFinite(next) && commit(next)) { lastCommitted.current = next; return true; }
        return false;
    };
    const errorId = `${props.id}-error`;
    const control = <input {...props} ref={input} type="number" inputMode="decimal" required defaultValue={current / scale} aria-invalid={error || undefined} aria-describedby={error ? errorId : undefined} onChange={event => {
        if (apply(event.currentTarget)) setError(false);
    }} onBlur={event => {
        event.stopPropagation();
        setError(!apply(event.currentTarget));
    }} />;
    return <>{unit ? <div className="input-with-unit" data-unit={unit}>{control}</div> : control}{error && <span id={errorId} role="alert">{translate('Enter a valid number within the allowed range and step.')}</span>}</>;
}
/**
 * AI Response Configuration drawer markup (React-owned shell inside
 * #left-nav-panel). Preset parameters use the live preset service; IDs remain
 * for non-owning legacy compatibility. `promptList` is the
 * React-owned prompt list rendered inside #completion_prompt_manager.
 */
export function AiConfigPanel({ presetService, promptList, presetSaveButton, promptHeaderActions }: { presetService: PresetService; promptList?: ReactNode; presetSaveButton?: (onSave: () => void, busy: boolean) => ReactNode; promptHeaderActions?: ReactNode }) {
    useTranslated('');
    const snapshot = useSyncExternalStore(presetService.subscribe, presetService.getSnapshot, presetService.getSnapshot);
    const [fieldError, setFieldError] = useState('');
    const [busy, setBusy] = useState(false);
    const run = async (action: () => Promise<unknown> | undefined) => {
        if (busy) return;
        setBusy(true); setFieldError('');
        try { await action(); } catch (error) { setFieldError(error instanceof Error ? error.message : String(error)); }
        finally { setBusy(false); }
    };
    const set = (field: string, value: unknown) => {
        try { presetService.setField(field, value); setFieldError(''); return true; }
        catch (error) { setFieldError(error instanceof Error ? error.message : String(error)); return false; }
    };
    const numeric = (field: string, scale = 1) => ({ key: `${snapshot.selected}:${field}`, current: Number(snapshot.settings[field] ?? 0), scale, commit: (next: number) => set(field, next) });
    const value = (field: string) => String(snapshot.settings[field] ?? '');
    const text = (field: string) => ({ value: value(field), onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => set(field, event.target.value) });
    const number = (field: string, scale = 1) => ({ value: Number(snapshot.settings[field] ?? 0) / scale, onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        if (event.target.value !== '') set(field, Math.round(Number(event.target.value) * scale * 100) / 100);
    } });
    const checkbox = (field: string) => ({ checked: Boolean(snapshot.settings[field]), onChange: (event: ChangeEvent<HTMLInputElement>) => set(field, event.target.checked) });
    const radio = (field: string, option: string) => ({ value: option, checked: value(field) === option, onChange: () => set(field, option) });
    // The legacy document-wide counter handler also targets this CSS class.
    // Keep the styling while preventing it from mutating the controlled slider.
    const stopCounterEvent = (event: SyntheticEvent) => event.stopPropagation();
    const controlledCounter = { onInput: stopCounterEvent, onKeyDown: stopCounterEvent, onKeyUp: stopCounterEvent, onMouseUp: stopCounterEvent, onBlur: stopCounterEvent };
    return (
        <>
                <div id="left-nav-panelheader" className="fa-solid fa-grip drag-grabber" aria-hidden="true"></div>
                <div className="workspace-panel-header">
                    <div className="workspace-panel-title" >{translate('Presets')}</div>
                </div>
                <div className="scrollableInner">
                    <div className="flex-container flexNoGap" id="ai_response_configuration">
                        <section className="ai-config-section width100p" id="respective-presets-block" aria-labelledby="ai-config-presets-title">
                            <div id="openai_api-presets">
                                <div>
                                    <div className="config-section-header" id="ai-config-presets-title"><span >{translate('Preset')}</span></div>
                                    <div className="flex-container flexNoGap">
                                        <select id="settings_preset_openai" className="flex1 text_pole" value={snapshot.names.includes(snapshot.selected) ? snapshot.selected : ''} disabled={busy} onChange={event => void run(() => presetService.requestSelect(event.target.value))}>
                                            {!snapshot.names.includes(snapshot.selected) && <option value="">{snapshot.selected ? `${snapshot.selected} (${translate('not installed')})` : translate('No preset applied')}</option>}
                                            {snapshot.names.map(name => <option value={name} key={name}>{name}</option>)}
                                        </select>
                                    </div>
                                    <div className="preset-actions-row">
                                        {presetSaveButton?.(() => void run(() => presetService.saveCurrent()), busy)}
                                        <button type="button" id="new_oai_preset" className="menu_button" disabled={busy} onClick={() => void run(() => presetService.create())} title={translate('Create a new preset from the current configuration')}>
                                            <i className="fa-solid fa-file-circle-plus" aria-hidden="true" /> {translate('New preset')}
                                        </button>
                                        <PresetActionsMenu busy={busy} onRename={() => void run(() => presetService.renameCurrent())} onRestore={() => void run(() => presetService.restoreCurrent())} onDelete={() => void run(() => presetService.deleteCurrent())} onImport={file => void run(() => presetService.importFile(file))} onExport={() => void run(() => presetService.exportFile())} />
                                    </div>
                                    {fieldError && <div role="alert">{fieldError}</div>}
                                </div>
                            </div>
                        </section>
                        <section className="ai-config-section width100p" id="advanced-ai-config-block" aria-labelledby="ai-config-prompt-title">
                            <div id="openai_settings">
                                <div className="config-section-header prompt-panel-title-row" id="ai-config-prompt-title">
                                    <span >{translate('Prompt Manager')}</span>
                                    {promptHeaderActions}
                                </div>
                                <div className="range-block m-b-1">
                                    <div id="completion_prompt_manager">{promptList}</div>
                                </div>
                            </div>
                        </section>
                        <section className="ai-config-section width100p" id="respective-ranges-and-temps" aria-labelledby="ai-config-parameters-title">
                            <div className="config-section-header" id="ai-config-parameters-title"><span >{translate('Generation Parameters')}</span></div>

                            <div id="range_block_openai">
                                <div className="range-block-pair">
                                    <div className="range-block">
                                        <div className="range-block-title" >{translate('Context')}</div>
                                        <NumericInput id="openai_max_context" className="text_pole" unit="k" data-unit="k" min="0.5" step="0.5" {...numeric('openai_max_context', 1000)} />
                                    </div>
                                    <div className="range-block">
                                        <div className="range-block-title" >{translate('Max Response')}</div>
                                        <NumericInput id="openai_max_tokens" className="text_pole" unit="k" data-unit="k" min="0.1" max="128" step="0.1" {...numeric('openai_max_tokens', 1000)} />
                                    </div>
                                </div>
                                <div className="range-block">
                                    <label htmlFor="stream_toggle" title="Enable OpenAI completion streaming" data-i18n="[title]Enable OpenAI completion streaming" className="ai-switch-row widthFreeExpand">
                                        <input id="stream_toggle" type="checkbox" className="ai-switch-input" {...checkbox('stream_openai')} />
                                        <span className="ai-switch" aria-hidden="true"><span className="ai-switch-thumb" /></span>
                                        <span >{translate('Streaming')}</span>
                                    </label>
                                </div>
                                <div className="range-block" data-source="openai">
                                    <div className="range-block-title" >{translate('Reasoning Effort')}</div>
                                    <div className="wide100p">
                                        <div className="segmented-control" data-sync-select="openai_reasoning_effort">
                                            <label className="seg-option"><input type="radio" name="reasoning_effort_ui" {...radio('reasoning_effort', 'auto')} /><span >{translate('Auto')}</span></label>
                                            <label className="seg-option"><input type="radio" name="reasoning_effort_ui" {...radio('reasoning_effort', 'low')} /><span >{translate('Low')}</span></label>
                                            <label className="seg-option"><input type="radio" name="reasoning_effort_ui" {...radio('reasoning_effort', 'medium')} /><span >{translate('Medium')}</span></label>
                                            <label className="seg-option"><input type="radio" name="reasoning_effort_ui" {...radio('reasoning_effort', 'high')} /><span >{translate('High')}</span></label>
                                        </div>
                                        <select id="openai_reasoning_effort" className="displayNone" {...text('reasoning_effort')}>
                                            <option value="auto">Auto</option>
                                            <option value="low">Low</option>
                                            <option value="medium">Medium</option>
                                            <option value="high">High</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </section>
                        <div className="inline-drawer wide100p">
                            <div className="inline-drawer-toggle inline-drawer-header">
                                <b>{translate('Advanced')}</b>
                                <div className="fa-solid fa-circle-chevron-down inline-drawer-icon down"></div>
                            </div>
                            <div className="inline-drawer-content">
                        <div className="config-section-header"><span>{translate('Features')}</span></div>
                        <div className="features-grid">
                            <div className="range-block" data-source="openai">
                                <label htmlFor="openai_media_inlining" className="checkbox_label widthFreeExpand">
                                    <input id="openai_media_inlining" type="checkbox" {...checkbox('media_inlining')} />
                                    <span >{translate('Inline Media')}</span>
                                </label>
                            </div>
                            <div className="range-block" data-source="openai">
                                <label htmlFor="openai_show_thoughts" className="checkbox_label widthFreeExpand">
                                    <input id="openai_show_thoughts" type="checkbox" {...checkbox('show_thoughts')} />
                                    <span >{translate('Model Reasoning')}</span>
                                </label>
                            </div>
                        </div>
                        <div className="config-section-header"><span>{translate('Advanced Sampling')}</span></div>
                        <div className="range-block-pair" data-source="openai">
                            <div className="range-block">
                                <div className="range-block-title" >{translate('Temperature')}</div>
                                <div className="wide100p">
                                    <input className="neo-range-slider" type="range" id="temp_openai" min="0" max="2.0" step="0.01" {...number('temp_openai')} />
                                    <NumericInput className="neo-range-input" id="temp_openai_counter" data-for="temp_openai" min="0" max="2" step="0.01" {...controlledCounter} {...numeric('temp_openai')} />
                                </div>
                            </div>
                            <div className="range-block">
                                <div className="range-block-title" >{translate('Top P')}</div>
                                <div className="wide100p">
                                    <input className="neo-range-slider" type="range" id="top_p_openai" min="0" max="1" step="0.01" {...number('top_p_openai')} />
                                    <NumericInput className="neo-range-input" id="top_p_openai_counter" data-for="top_p_openai" min="0" max="1" step="0.01" {...controlledCounter} {...numeric('top_p_openai')} />
                                </div>
                            </div>
                        </div>
                        <div className="range-block-pair" data-source="openai">
                            <div className="range-block">
                                <div className="range-block-title" >{translate('Freq Penalty')}</div>
                                <div className="wide100p">
                                    <NumericInput id="freq_pen_openai" className="text_pole" min="-2" max="2" step="0.01" {...numeric('freq_pen_openai')} />
                                </div>
                            </div>
                            <div className="range-block">
                                <div className="range-block-title" >{translate('Pres Penalty')}</div>
                                <div className="wide100p">
                                    <NumericInput id="pres_pen_openai" className="text_pole" min="-2" max="2" step="0.01" {...numeric('pres_pen_openai')} />
                                </div>
                            </div>
                        </div>
                        <div className="range-block full-width" data-source="openai">
                            <div className="range-block-title" >{translate('Verbosity')}</div>
                            <div className="wide100p">
                                <div className="segmented-control" data-sync-select="openai_verbosity">
                                    <label className="seg-option"><input type="radio" name="verbosity_ui" {...radio('verbosity', 'auto')} /><span >{translate('Auto')}</span></label>
                                    <label className="seg-option"><input type="radio" name="verbosity_ui" {...radio('verbosity', 'low')} /><span >{translate('Low')}</span></label>
                                    <label className="seg-option"><input type="radio" name="verbosity_ui" {...radio('verbosity', 'medium')} /><span >{translate('Medium')}</span></label>
                                    <label className="seg-option"><input type="radio" name="verbosity_ui" {...radio('verbosity', 'high')} /><span >{translate('High')}</span></label>
                                </div>
                                <select id="openai_verbosity" className="displayNone" {...text('verbosity')}>
                                    <option value="auto">Auto</option>
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                </select>
                            </div>
                        </div>
                        <div className="range-block full-width" data-source="openai">
                            <div className="range-block-title" >{translate('Interleaved Thinking')}</div>
                            <div className="wide100p">
                                <select id="tool_reasoning_mode" className="text_pole" disabled={!snapshot.settings.show_thoughts} {...text('tool_reasoning_mode')}>
                                    <option value="disabled">{translate('Disabled')}</option>
                                    <option value="since_last_user">{translate('Since Last User')}</option>
                                    <option value="active_chain">{translate('Active Tool Chain')}</option>
                                </select>
                            </div>
                        </div>
                        <div className="config-section-header"><span>{translate('Image Generation')}</span></div>
                        <div className="range-block full-width" data-source="openai">
                            <div className="range-block-title"><small >{translate('Image Quality')}</small></div>
                            <select id="openai_inline_image_quality" className="text_pole" {...text('inline_image_quality')}>
                                <option value="auto">{translate('Auto')}</option>
                                <option value="low">{translate('Low')}</option>
                                <option value="high">{translate('High')}</option>
                            </select>
                        </div>
                        <div className="config-section-header"><span>{translate('Settings')}</span></div>
                        <div className="range-block">
                            <div className="range-block-title" >{translate('Character Names')}<small id="character_names_display">{translate(({ '-1': 'None', '0': 'Default', '1': 'Completion', '2': 'Content' } as Record<string, string>)[value('names_behavior')] ?? '')}</small></div>
                            <div className="wide100p">
                                <select id="names_behavior" className="text_pole" {...number('names_behavior')}>
                                    <option value="-1" >{translate('None')}</option>
                                    <option value="0" >{translate('Default')}</option>
                                    <option value="1" >{translate('Completion')}</option>
                                    <option value="2" >{translate('Content')}</option>
                                </select>
                            </div>
                        </div>
                        <div className="range-block">
                            <label htmlFor="squash_system_messages" className="checkbox_label widthFreeExpand">
                                <input id="squash_system_messages" type="checkbox" {...checkbox('squash_system_messages')} />
                                <span >{translate('Squash system messages')}</span>
                            </label>
                        </div>
                        <div className="config-section-header"><span>{translate('Templates')}</span></div>
                        <div className="range-block">
                            <div className="range-block-title openai_restorable">
                                <span >{translate('World Info')}<code>{0}</code></span>
                                <ContractIconButton id="wi_format_restore" onClick={() => presetService.restore('wi_format')} className="right_menu_button" label="Restore default format" nativeTitle title="Restore default format" icon={<i className="fa-solid fa-clock-rotate-left" aria-hidden="true" />} />
                            </div>
                            <div className="wide100p">
                                <textarea id="wi_format_textarea" className="text_pole textarea_compact autoSetHeight" rows={3} placeholder={"2014"} {...text('wi_format')}></textarea>
                            </div>
                        </div>
                        <div className="range-block">
                            <div className="range-block-title openai_restorable">
                                <span >{translate('Description')}<code>{0}</code></span>
                                <ContractIconButton id="description_format_restore" onClick={() => presetService.restore('description_format')} className="right_menu_button" label="Restore default format" nativeTitle title="Restore default format" icon={<i className="fa-solid fa-clock-rotate-left" aria-hidden="true" />} />
                            </div>
                            <div className="wide100p">
                                <textarea id="description_format_textarea" className="text_pole textarea_compact autoSetHeight" rows={3} placeholder={"2014"} {...text('description_format')}></textarea>
                            </div>
                        </div>
                        <div className="range-block">
                            <div className="range-block-title openai_restorable">
                                <span >{translate('New Chat')}</span>
                                <ContractIconButton id="newchat_prompt_restore" onClick={() => presetService.restore('new_chat_prompt')} className="right_menu_button" label="Restore new chat prompt" nativeTitle title="Restore new chat prompt" icon={<i className="fa-solid fa-clock-rotate-left" aria-hidden="true" />} />
                            </div>
                            <div className="wide100p">
                                <textarea id="newchat_prompt_textarea" className="text_pole textarea_compact autoSetHeight" name="new_chat" rows={3} placeholder={"2014"} {...text('new_chat_prompt')}></textarea>
                            </div>
                        </div>
                        <div className="config-section-header"><span>{translate('Other')}</span></div>
                        <div className="range-block">
                            <div className="range-block-title" >{translate('Empty Message Fallback')}</div>
                            <div className="wide100p">
                                <textarea id="send_if_empty_textarea" className="text_pole textarea_compact autoSetHeight" name="send_if_empty" rows={3} placeholder={"2014"} {...text('send_if_empty')}></textarea>
                            </div>
                        </div>
                            </div>
                        </div>
                    </div>
                </div>
        </>
    );
}
