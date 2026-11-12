import { ContractButton } from '../contract/ContractButton';
import { translate, useTranslated } from '@/compat/i18n.js';
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import type { RegexEditorHandle, RegexScript } from './regex-types';

const emptyScript: RegexScript = { id: '', scriptName: '', findRegex: '', replaceString: '', trimStrings: [], disabled: false, markdownOnly: true, promptOnly: false, runOnEdit: true, substituteRegex: 0, minDepth: null, maxDepth: null, placement: [1] };
type Props = { initial?: RegexScript | null; onRun?: (script: RegexScript, input: string) => string; infoFor?: (script: RegexScript) => string; onValidityChange?: (valid: boolean) => void };
function isPatternValid(pattern: string, substitute: number) {
    if (!pattern.trim()) return false;
    if (substitute !== 0 && pattern.includes('{{')) return true;
    try {
        const match = pattern.match(/(\/?)(.+)\1([a-z]*)/i);
        if (!match) return false;
        if (match[3] && !/^(?!.*?(.).*?\1)[gmixXsuUAJ]+$/.test(match[3])) new RegExp(pattern);
        else new RegExp(match[2], match[3]);
        return true;
    } catch { return false; }
}
export const RegexEditor = forwardRef<RegexEditorHandle, Props>(function RegexEditor({ initial, onRun = (_script, input) => input, infoFor = () => '', onValidityChange }, ref) {
    useTranslated('');
    const root = useRef<HTMLDivElement>(null);
    const [draft, setDraft] = useState<RegexScript>(() => {
        // Existing rules keep legacy semantics: missing flags mean false.
        // Only new rules default markdownOnly/runOnEdit to true.
        const base = initial ? { ...emptyScript, markdownOnly: false, runOnEdit: false } : emptyScript;
        return { ...base, ...initial, placement: initial?.placement ?? [1], trimStrings: initial?.trimStrings ?? [] };
    });
    const [trimText, setTrimText] = useState(() => (initial?.trimStrings ?? []).join('\n'));
    const [testMode, setTestMode] = useState(false);
    const [testInput, setTestInput] = useState('');
    const [errors, setErrors] = useState({ name: '', find: '', placement: '' });
    const change = (patch: Partial<RegexScript>) => setDraft(current => ({ ...current, ...patch }));
    useImperativeHandle(ref, () => ({
        getDraft: () => ({ ...draft, scriptName: draft.scriptName.trim() }),
        validate: () => {
            const next = { name: draft.scriptName.trim() ? '' : translate('Enter a script name.'), find: isPatternValid(draft.findRegex, draft.substituteRegex) ? '' : translate('Enter a valid regular expression.'), placement: draft.placement.length ? '' : translate('Select at least one affected area.') };
            setErrors(next);
            const first = next.name ? '#regex_script_name' : next.find ? '#find_regex' : next.placement ? 'input[name="replace_position"]' : '';
            if (first) root.current?.querySelector<HTMLInputElement>(first)?.focus();
            onValidityChange?.(!first);
            return !first;
        },
    }), [draft, onValidityChange]);
    return (
<div id="regex_editor_template" ref={root}>
    <div className="regex_editor">
        <h3 className="flex-container justifyCenter alignItemsBaseline">
            <strong >{translate('Regex Editor')}</strong>
            <a href="extensions/regex/" className="notes-link" target="_blank" rel="noopener noreferrer" aria-label="Regex documentation">
                <span className="note-link-span">?</span>
            </a>
            <ContractButton id="regex_test_mode_toggle" className="menu_button menu_button_icon" label="Test Mode" onClick={() => setTestMode(value => !value)} icon={<i className="fa-solid fa-bug fa-sm" aria-hidden="true" />} />
        </h3>

        <small className="flex-container extensions_info" >{translate('Regex is a tool to find/replace strings using regular expressions. If you want to learn more, click on the ? next to the title.')}</small>
        <hr />

        <div id="regex_info_block_wrapper">
            <div id="regex_info_block" className="info-block">{infoFor(draft)}</div>
            <a id="regex_info_block_flags_hint" href="extensions/regex/#flags" target="_blank" rel="noopener noreferrer" aria-label="Regex flags documentation">
                <i className="fa-solid fa-circle-info" data-i18n="[title]ext_regex_flags_help" title="Click here to learn more about regex flags." />
            </a>
        </div>

        <div id="regex_test_mode" className={`flex1 flex-container${testMode ? '' : ' displayNone'}`} hidden={!testMode}>
            <div className="flex1">
                <label className="title_restorable" htmlFor="regex_test_input">
                    <small >{translate('Input')}</small>
                </label>
                <textarea id="regex_test_input" className="text_pole textarea_compact" rows={4} data-i18n="[placeholder]ext_regex_test_input_placeholder" placeholder="Type here..." value={testInput} onChange={event => setTestInput(event.target.value)}></textarea>
            </div>
            <div className="flex1">
                <label className="title_restorable" htmlFor="regex_test_output">
                    <small >{translate('Output')}</small>
                </label>
                <textarea id="regex_test_output" className="text_pole textarea_compact" rows={4} data-i18n="[placeholder]ext_regex_output_placeholder" placeholder="Empty" value={testMode ? onRun(draft, testInput) : ''} readOnly></textarea>
            </div>
            <hr />
        </div>

        <div className="flex-container flexFlowColumn">
            <div className="flex1">
                <label htmlFor="regex_script_name" className="title_restorable">
                    <small >{translate('Script Name')}</small>
                </label>
                <div>
                    <input id="regex_script_name" className="regex_script_name text_pole textarea_compact" type="text" required aria-describedby="regex_name_error" aria-invalid={!!errors.name} aria-label="Script Name" data-i18n="[aria-label]Script Name" value={draft.scriptName} onChange={event => change({ scriptName: event.target.value })} />
                    <small id="regex_name_error" className="regex-validation-error" role="alert" hidden={!errors.name}>{errors.name}</small>
                </div>
            </div>
            <div className="flex1">
                <label htmlFor="find_regex" className="title_restorable">
                    <small >{translate('Find Regex')}</small>
                </label>
                <div>
                    <input id="find_regex" className="find_regex text_pole textarea_compact" type="text" required aria-describedby="regex_find_error" aria-invalid={!!errors.find} aria-label="Find Regex" data-i18n="[aria-label]Find Regex" value={draft.findRegex} onChange={event => change({ findRegex: event.target.value })} />
                    <small id="regex_find_error" className="regex-validation-error" role="alert" hidden={!errors.find}>{errors.find}</small>
                </div>
            </div>
            <div className="flex1">
                <label htmlFor="regex_replace_string" className="title_restorable">
                    <small >{translate('Replace With')}</small>
                </label>
                <div>
                    <textarea id="regex_replace_string" className="regex_replace_string text_pole wide100p textarea_compact" aria-label="Replace With" data-i18n="[aria-label]Replace With;[placeholder]ext_regex_replace_string_placeholder" placeholder="Use {{match}} to include the matched text from the Find Regex, $1, $2, etc. for numbered capture groups, or $<name> for named capture groups." rows={3} value={draft.replaceString} onChange={event => change({ replaceString: event.target.value })}></textarea>
                </div>
            </div>
            <div className="flex1">
                <label htmlFor="regex_trim_strings" className="title_restorable">
                    <small >{translate('Trim Out')}</small>
                </label>
                <div>
                    <textarea id="regex_trim_strings" className="regex_trim_strings text_pole wide100p textarea_compact" aria-label="Trim Out" data-i18n="[aria-label]Trim Out;[placeholder]ext_regex_trim_placeholder" placeholder="Globally trims any unwanted parts from a regex match before replacement. Separate each element by an enter." rows={3} value={trimText} onChange={event => { setTrimText(event.target.value); change({ trimStrings: event.target.value.split('\n').filter(Boolean) }); }}></textarea>
                </div>
            </div>
        </div>

        <div className="flex-container regex-editor-options">
            <div className="flex1 regex-editor-option-group" role="group" aria-label="Affects" aria-describedby="regex_placement_error" data-i18n="[aria-label]ext_regex_affects">
                <h4 >{translate('Affects')}</h4>
                <small id="regex_placement_error" className="regex-validation-error" role="alert" hidden={!errors.placement}>{errors.placement}</small>
                <div data-i18n="[title]ext_regex_user_input_desc" title="Messages sent by the user.">
                    <label className="checkbox flex-container">
                        <input type="checkbox" name="replace_position" value="1" checked={draft.placement.includes(1)} aria-invalid={!!errors.placement} onChange={event => change({ placement: event.target.checked ? [...draft.placement, 1] : draft.placement.filter(value => value !== 1) })} />
                        <span >{translate('User Input')}</span>
                    </label>
                </div>
                <div data-i18n="[title]ext_regex_ai_input_desc" title="Messages received from the Generation API.">
                    <label className="checkbox flex-container">
                        <input type="checkbox" name="replace_position" value="2" checked={draft.placement.includes(2)} aria-invalid={!!errors.placement} onChange={event => change({ placement: event.target.checked ? [...draft.placement, 2] : draft.placement.filter(value => value !== 2) })} />
                        <span >{translate('AI Output')}</span>
                    </label>
                </div>
                <div data-i18n="[title]ext_regex_slash_desc" title="Messages sent using STscript commands.">
                    <label className="checkbox flex-container">
                        <input type="checkbox" name="replace_position" value="3" checked={draft.placement.includes(3)} aria-invalid={!!errors.placement} onChange={event => change({ placement: event.target.checked ? [...draft.placement, 3] : draft.placement.filter(value => value !== 3) })} />
                        <span >{translate('Slash Commands')}</span>
                    </label>
                </div>
                <div data-i18n="[title]ext_regex_wi_desc" title="Lorebook/World Info entry contents. Requires 'Only Format Prompt' to be checked!">
                    <label className="checkbox flex-container">
                        <input type="checkbox" name="replace_position" value="5" checked={draft.placement.includes(5)} aria-invalid={!!errors.placement} onChange={event => change({ placement: event.target.checked ? [...draft.placement, 5] : draft.placement.filter(value => value !== 5) })} />
                        <span >{translate('World Info')}</span>
                    </label>
                </div>
                <div data-i18n="[title]ext_regex_reasoning_desc" title="Reasoning block contents. When 'Only Format Prompt' is checked, it will also affect the reasoning contents added to the prompt.">
                    <label className="checkbox flex-container">
                        <input type="checkbox" name="replace_position" value="6" checked={draft.placement.includes(6)} aria-invalid={!!errors.placement} onChange={event => change({ placement: event.target.checked ? [...draft.placement, 6] : draft.placement.filter(value => value !== 6) })} />
                        <span >{translate('Reasoning')}</span>
                    </label>
                </div>
                <div className="flex-container wide100p marginTop5">
                    <div className="flex1 flex-container flexNoGap">
                        <small data-i18n="[title]ext_regex_min_depth_desc" title="When applied to prompts or display, only affect messages that are at least N levels deep. 0 = last message, 1 = penultimate message, etc. System prompt and utility prompts are not affected. When blank / 'Unlimited' or -1, also affect message to continue on Continue.">
                            <span >{translate('Min Depth')}</span>
                            <span className="fa-solid fa-circle-question note-link-span"></span>
                        </small>
                        <input name="min_depth" className="text_pole textarea_compact" type="number" min="-1" max="9999" aria-label="Min Depth" data-i18n="[aria-label]Min Depth;[placeholder]ext_regex_min_depth_placeholder" placeholder="Unlimited" value={draft.minDepth ?? ''} onChange={event => change({ minDepth: event.target.value === '' ? null : Number(event.target.value) })} />
                    </div>
                    <div className="flex1 flex-container flexNoGap">
                        <small data-i18n="[title]ext_regex_max_depth_desc" title="When applied to prompts or display, only affect messages no more than N levels deep. 0 = last message, 1 = penultimate message, etc. System prompt and utility prompts are not affected. Max must be greater than Min for regex to apply.">
                            <span >{translate('Max Depth')}</span>
                            <span className="fa-solid fa-circle-question note-link-span"></span>
                        </small>
                        <input name="max_depth" className="text_pole textarea_compact" type="number" min="0" max="9999" aria-label="Max Depth" data-i18n="[aria-label]Max Depth;[placeholder]ext_regex_min_depth_placeholder" placeholder="Unlimited" value={draft.maxDepth ?? ''} onChange={event => change({ maxDepth: event.target.value === '' ? null : Number(event.target.value) })} />
                    </div>
                </div>
            </div>
            <div className="flex1 regex-editor-option-group">
                <h4 >{translate('Other Options')}</h4>
                <label className="checkbox flex-container">
                    <input type="checkbox" name="disabled" checked={draft.disabled} onChange={event => change({ disabled: event.target.checked })} />
                    <span >{translate('Disabled')}</span>
                </label>
                <label className="checkbox flex-container" data-i18n="[title]ext_regex_run_on_edit_desc" title="Run the regex script when the message belonging a to specified role(s) is edited.">
                    <input type="checkbox" name="run_on_edit" checked={draft.runOnEdit} onChange={event => change({ runOnEdit: event.target.checked })} />
                    <span >{translate('Run On Edit')}</span>
                </label>
                <label className="checkbox flex-container flexNoGap marginBot5" data-i18n="[title]ext_regex_substitute_regex_desc" title={"Substitute {{macros}} in Find Regex before running it"} aria-label="Macros in Find Regex">
                    <span>
                        <small >{translate('Macros in Find Regex')}</small>
                        <span className="fa-solid fa-circle-question note-link-span"></span>
                    </span>
                    <select name="substitute_regex" className="text_pole textarea_compact margin0" value={draft.substituteRegex} onChange={event => change({ substituteRegex: Number(event.target.value) })}>
                        <option value="0" >{translate("Don't substitute")}</option>
                        <option value="1" >{translate('Substitute (raw)')}</option>
                        <option value="2" >{translate('Substitute (escaped)')}</option>
                    </select>
                </label>
                <span>
                    <small >{translate('Ephemerality')}</small>
                    <span className="fa-solid fa-circle-question note-link-span" data-i18n="[title]ext_regex_other_options_desc" title={"By default, regex scripts alter the chat file directly and irreversibly.\rEnabling either (or both) of the options below will prevent chat file alteration, while still altering the specified item(s)."}></span>
                </span>
                <label className="checkbox flex-container" data-i18n="[title]ext_regex_only_format_visual_desc" title="Chat history file contents won't change, but regex will be applied to the messages displayed in the Chat UI.">
                    <input type="checkbox" name="only_format_display" checked={draft.markdownOnly} onChange={event => change({ markdownOnly: event.target.checked })} />
                    <span >{translate('Alter Chat Display')}</span>
                </label>
                <label className="checkbox flex-container" data-i18n="[title]ext_regex_only_format_prompt_desc" title="Chat history file contents won't change, but regex will be applied to the outgoing prompt before it is sent to the LLM.">
                    <input type="checkbox" name="only_format_prompt" checked={draft.promptOnly} onChange={event => change({ promptOnly: event.target.checked })} />
                    <span >{translate('Alter Outgoing Prompt')}</span>
                </label>

            </div>
        </div>
    </div>
</div>
    );
});
