import { forwardRef, useImperativeHandle, useState } from 'react';
import { ContractButton } from '../contract/ContractButton';
import { ContractIconButton } from '../contract/ContractIconButton';
import { translate, useTranslated } from '@/compat/i18n.js';
import type { RegexScriptType } from './regex-list-types';
import type { RegexDebugGroup, RegexDebugResult, RegexDebuggerHandle } from './regex-types';

type Props = {
    getGroups?: () => RegexDebugGroup[];
    reorder?: (key: string, ids: string[]) => Promise<'saved'>;
    runForDebug?: (groups: RegexDebugGroup[], input: string, options: { displayMode: 'replace' | 'highlight'; renderMode: 'text' | 'message' }) => RegexDebugResult;
    openEditor?: (type: RegexScriptType, id?: string) => void;
    commands?: { openStepsPopup(html: string): void; openFinalPopup(result: { text: string; html?: string }): void };
};
const noGroups = () => [];
export const RegexDebugger = forwardRef<RegexDebuggerHandle, Props>(function RegexDebugger({ getGroups = noGroups, reorder, runForDebug, openEditor, commands }, ref) {
    useTranslated('');
    const [groups, setGroups] = useState<RegexDebugGroup[]>(() => getGroups());
    const [input, setInput] = useState('');
    const [result, setResult] = useState<RegexDebugResult | null>(null);
    const [displayMode, setDisplayMode] = useState<'replace' | 'highlight'>('replace');
    const [renderMode, setRenderMode] = useState<'text' | 'message'>('text');
    const [pending, setPending] = useState(false);
    const [status, setStatus] = useState('');
    useImperativeHandle(ref, () => ({ refresh: () => { setGroups(getGroups()); setResult(null); setStatus(''); } }), [getGroups]);
    function move(groupIndex: number, index: number, direction: number) {
        setGroups(current => current.map((group, i) => {
            if (i !== groupIndex) return group;
            const rules = [...group.rules]; const target = index + direction;
            if (target < 0 || target >= rules.length) return group;
            [rules[index], rules[target]] = [rules[target], rules[index]];
            return { ...group, rules };
        }));
    }
    async function save() {
        if (!reorder || pending) return;
        setPending(true); setStatus('');
        try { for (const group of groups) await reorder(group.key, group.rules.map(rule => rule.id)); setStatus(translate('Order saved')); }
        catch (error) { setStatus(`${translate('Order not saved')}: ${error instanceof Error ? error.message : String(error)}`); }
        finally { setPending(false); }
    }
    function run() {
        try { if (runForDebug) setResult(runForDebug(groups.map(group => ({ ...group, rules: group.rules.filter(rule => rule.enabled !== false) })), input, { displayMode, renderMode })); }
        catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }
    }
    const stepsHtml = result?.steps.map(step => `<div class="step-result"${step.id ? ` id="step-result-${escapeHtml(step.id)}"` : ''}><div class="step-header"><strong>${escapeHtml(step.label)}</strong></div><pre class="step-output">${step.html}</pre></div>`).join('') ?? '';
    return <div id="regex_debugger_popup" className="regex-debugger-container">
        <div className="regex-debugger-rules-list">
            <h3><i className="fa-solid fa-list-ol" /> {translate('Active Rules')}</h3>
            <ContractButton id="regex_debugger_save_order" className="menu_button menu_button_icon" label="Save Order" disabled={pending} onClick={() => void save()} />
            <output>{status}</output>
            <div id="regex_debugger_empty" className="regex-debugger-no-rules" aria-live="polite" hidden={groups.some(group => group.rules.length)}><p>{translate('Create a regex rule before testing transformations.')}</p><ContractButton id="regex_debugger_create_rule" label="New global regex script" onClick={() => openEditor?.(0)} /></div>
            <div id="regex_debugger_rules">{groups.map((group, groupIndex) => <section key={group.key}><h4>{group.label}</h4><ul id={`regex_debugger_rules_${group.key === 'global' || group.key === 'preset' || group.key === 'scoped' ? group.key : group.type !== undefined ? ({ 0: 'global', 2: 'preset', 1: 'scoped' } as const)[group.type] : groupIndex === 0 ? 'global' : groupIndex === 1 ? 'preset' : 'scoped'}`} className="sortable-list">{group.rules.map((rule, index) => <li key={rule.id} className="regex-debugger-rule" data-id={rule.id}><label className="checkbox"><span className="sr-only">{translate('Rule enabled')}: {rule.name}</span><input type="checkbox" className="rule-enabled" checked={rule.enabled !== false} onChange={event => { const enabled = event.target.checked; setGroups(current => current.map((item, i) => i === groupIndex ? { ...item, rules: item.rules.map((r, j) => j === index ? { ...r, enabled } : r) } : item)); }} /></label><div className="rule-details"><span className="rule-name">{rule.name}</span><code className="rule-regex">{rule.pattern}</code><small className="rule-scope">{group.label}</small></div><ContractIconButton label={`Edit ${rule.name}`} className="edit_rule" icon={<i className="fa-solid fa-pencil" />} onClick={() => openEditor?.(group.type ?? (groupIndex === 0 ? 0 : groupIndex === 1 ? 2 : 1), rule.id)} /><ContractIconButton label={`Move ${rule.name} up`} icon={<i className="fa-solid fa-arrow-up" />} disabled={index === 0 || pending} onClick={() => move(groupIndex, index, -1)} /><ContractIconButton label={`Move ${rule.name} down`} icon={<i className="fa-solid fa-arrow-down" />} disabled={index === group.rules.length - 1 || pending} onClick={() => move(groupIndex, index, 1)} /></li>)}</ul></section>)}</div>
        </div>
        <div className="regex-debugger-tester"><h3><i className="fa-solid fa-vial" /> {translate('Testing Area')}</h3><div className="regex-debugger-io">
            <label htmlFor="regex_debugger_raw_input">{translate('Raw Input')}</label><textarea id="regex_debugger_raw_input" className="text_pole autoSetHeight" rows={4} value={input} onChange={event => setInput(event.target.value)} />
            <div id="regex_debugger_run_test_header" className="flex-container"><ContractButton id="regex_debugger_run_test" label="Run Test" onClick={run} /><div className="radio_group"><label><input type="radio" name="display_mode" value="replace" checked={displayMode === 'replace'} onChange={() => setDisplayMode('replace')} />{translate('Replace')}</label><label><input type="radio" name="display_mode" value="highlight" checked={displayMode === 'highlight'} onChange={() => setDisplayMode('highlight')} />{translate('Highlight')}</label></div><select id="regex_debugger_render_mode" aria-label={translate('Render mode')} value={renderMode} onChange={event => setRenderMode(event.target.value as 'text' | 'message')}><option value="text">{translate('Render as Text')}</option><option value="message">{translate('Render as Message')}</option></select></div>
            <output id="regex_debugger_result_hint" hidden={!!result}>{translate('Run a test to see each transformation and the final output.')}</output>
            <div className="regex-debugger-results" hidden={!result}><div className="results-header"><h4>{translate('Step-by-step Transformation')}</h4><ContractIconButton id="regex_debugger_expand_steps" label="Expand transformation steps" icon={<i className="fa-solid fa-expand" />} onClick={() => commands?.openStepsPopup(stepsHtml)} /></div><div id="regex_debugger_steps_output" className="results-box" dangerouslySetInnerHTML={{ __html: stepsHtml }} /><div className="results-header"><h4>{translate('Final Output')}</h4><ContractIconButton id="regex_debugger_expand_final" label="Expand final output" icon={<i className="fa-solid fa-expand" />} onClick={() => commands?.openFinalPopup({ text: result?.final ?? '', html: result?.finalHtml })} /></div>{result?.finalHtml !== undefined ? <div id="regex_debugger_final_output" className="results-box final-output" dangerouslySetInnerHTML={{ __html: result.finalHtml }} /> : <div id="regex_debugger_final_output" className="results-box final-output">{result?.final}</div>}</div>
        </div></div>
        <template id="regex_debugger_rule_template" /><template id="regex_debugger_step_template" />
    </div>;
});

function escapeHtml(value: string) { return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char); }
