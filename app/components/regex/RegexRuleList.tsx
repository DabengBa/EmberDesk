import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { translate } from '@/compat/i18n.js';
import { ContractButton } from '../contract/ContractButton';
import { ContractIconButton } from '../contract/ContractIconButton';
import type { RegexListAction, RegexListBridge, RegexListGroup, RegexRuleRef, RegexScriptType } from './regex-list-types';

const refKey = (ref: RegexRuleRef) => JSON.stringify([ref.groupKey, ref.id]);
const scopeName = (type: RegexScriptType) => type === 0 ? 'Global' : type === 2 ? 'Preset' : 'Scoped';
const targets: { type: RegexScriptType; label: string; icon: string }[] = [
    { type: 0, label: 'Move to global scripts', icon: 'globe' },
    { type: 2, label: 'Move to preset scripts', icon: 'sliders' },
    { type: 1, label: 'Move to scoped scripts', icon: 'address-card' },
];
const icon = (name: string) => <i className={`fa-solid fa-${name}`} aria-hidden="true" />;

export function useRegexList(bridge: RegexListBridge) {
    const snapshot = useSyncExternalStore(bridge.subscribe, bridge.getSnapshot, bridge.getSnapshot);
    const [selected, setSelected] = useState<RegexRuleRef[]>([]);
    const [bulk, setBulk] = useState(false);
    const [pending, setPending] = useState(false);
    const busy = useRef(false);
    // A failure is bound to one target and one write stage so a later success
    // can only clear what it actually completed — a save-only action must not
    // hide an unresolved authorization failure.
    const [failures, setFailures] = useState<Record<string, { label: string; stage: string }>>({});
    const [saved, setSaved] = useState('');
    const all = snapshot.groups.flatMap(group => group.rules.map(rule => ({ groupKey: group.key, id: rule.id })));
    const live = new Set(all.map(refKey));
    const selectedLive = selected.filter(ref => live.has(refKey(ref)));
    useEffect(() => {
        const currentLive = new Set(snapshot.groups.flatMap(group => group.rules.map(rule => refKey({ groupKey: group.key, id: rule.id }))));
        setSelected(previous => {
            const next = previous.filter(ref => currentLive.has(refKey(ref)));
            return next.length === previous.length ? previous : next;
        });
    }, [snapshot]);
    const execute = async (action: RegexListAction) => {
        if (busy.current) return;
        busy.current = true;
        setPending(true);
        setSaved('');
        const keys = new Set(action.kind === 'reorder' ? [action.groupKey] : action.refs.map(ref => ref.groupKey));
        let destinationKey: string | undefined;
        if (action.kind === 'move') {
            destinationKey = snapshot.groups.find(group => group.type === action.toType && group.available)?.key;
            if (destinationKey) keys.add(destinationKey);
        }
        const labels = [...keys].map(key => {
            const group = snapshot.groups.find(item => item.key === key);
            return group ? `${translate(scopeName(group.type))} (${key})` : key;
        });
        const failureKey = (key: string, stage = 'save') => `${key}::${stage}`;
        try {
            const result = await bridge.execute(action);
            if (result === 'saved') {
                setFailures(previous => {
                    const next = { ...previous };
                    keys.forEach(key => { delete next[failureKey(key)]; delete next[failureKey(key, 'conflict')]; });
                    // Only an action that actually attempted authorization may
                    // clear an authorization failure for the bound target.
                    if (action.kind === 'enable' && action.authorize === true) {
                        keys.forEach(key => { delete next[failureKey(key, 'authorize')]; });
                    }
                    if (action.kind === 'move' && destinationKey) {
                        delete next[failureKey(destinationKey, 'authorize')];
                    }
                    return next;
                });
                setSaved(`${translate('Saved')}: ${labels.join(', ')}`);
            }
        } catch (error) {
            console.error('Regex list operation failed', error);
            const detail = error as { stage?: string; groupKey?: string };
            setFailures(previous => {
                const next = { ...previous };
                if (detail?.groupKey) {
                    const stage = detail.stage ?? 'save';
                    const group = snapshot.groups.find(item => item.key === detail.groupKey);
                    const label = group ? `${translate(scopeName(group.type))} (${group.key})` : detail.groupKey;
                    next[failureKey(detail.groupKey, stage)] = { label, stage };
                } else {
                    [...keys].forEach((key, index) => { next[failureKey(key)] = { label: labels[index], stage: 'save' }; });
                }
                return next;
            });
        } finally {
            busy.current = false;
            setPending(false);
        }
    };
    const toggle = (ref: RegexRuleRef) => setSelected(previous => previous.some(item => refKey(item) === refKey(ref))
        ? previous.filter(item => refKey(item) !== refKey(ref)) : [...previous, ref]);
    const reorder = (group: RegexListGroup, from: number, to: number) => {
        if (pending || from === to || to < 0 || to >= group.rules.length) return;
        const ids = group.rules.map(rule => rule.id);
        const [id] = ids.splice(from, 1);
        ids.splice(to, 0, id);
        void execute({ kind: 'reorder', groupKey: group.key, ids });
    };
    return { snapshot, selected: selectedLive, bulk, setBulk, pending, failures, saved, all, toggle, setSelected, execute, reorder };
}

type List = ReturnType<typeof useRegexList>;

export function RegexBulkControls({ list }: { list: List }) {
    const { selected, pending, snapshot } = list;
    const disabled = pending || selected.length === 0;
    return <>
        {list.bulk && <><hr /><div className="regex-react-bulk flex-container">
            <ContractIconButton id="bulk_select_all_toggle" className="menu_button menu_button_icon" label="Toggle Select All" nativeTitle title="Toggle Select All" disabled={pending || !list.all.length} icon={icon('check-double')} onClick={() => list.setSelected(selected.length === list.all.length ? [] : list.all)} />
            <ContractButton id="bulk_enable_regex" className="menu_button menu_button_icon" label="Enable" icon={icon('toggle-on')} disabled={disabled} onClick={() => void list.execute({ kind: 'enable', refs: selected, enabled: true })} />
            <ContractButton id="bulk_disable_regex" className="menu_button menu_button_icon" label="Disable" icon={icon('toggle-off')} disabled={disabled} onClick={() => void list.execute({ kind: 'enable', refs: selected, enabled: false })} />
            {targets.map(target => {
                const destination = snapshot.groups.find(group => group.type === target.type);
                const eligible = selected.some(ref => ref.groupKey !== destination?.key);
                return <ContractButton key={target.type} id={`bulk_regex_move_to_${target.type === 0 ? 'global' : target.type === 2 ? 'preset' : 'scoped'}`} className="menu_button menu_button_icon" label={target.label} icon={icon(target.icon)} disabled={disabled || !destination?.available || !eligible} onClick={() => void list.execute({ kind: 'move', refs: selected.filter(ref => ref.groupKey !== destination?.key), toType: target.type })} />;
            })}
            <ContractButton id="bulk_export_regex" className="menu_button menu_button_icon" label="Export" icon={icon('file-export')} disabled={disabled} onClick={() => void list.execute({ kind: 'export', refs: selected })} />
            <ContractButton id="bulk_delete_regex" className="menu_button menu_button_icon" label="Delete" icon={icon('trash')} disabled={disabled} onClick={() => void list.execute({ kind: 'delete', refs: selected })} />
        </div></>}
        <div className="regex-list-status" aria-live="polite">
            {pending && <div className="regex-list-status-pending">{translate('Saving…')}</div>}
            {Object.entries(list.failures).map(([key, failure]) => <div key={key} className="regex-list-status-failure">{failure.stage === 'authorize' ? translate('Authorization not saved') : translate('Not saved')}: {failure.label}</div>)}
            {!pending && list.saved && <div className="regex-list-status-saved">{list.saved}</div>}
        </div>
    </>;
}

export function RegexRuleGroup({ list, type }: { list: List; type: RegexScriptType }) {
    const group = list.snapshot.groups.find(item => item.type === type);
    if (!group) return null;
    return <>{group.rules.map((rule, index) => <RegexRuleRow key={refKey({ groupKey: group.key, id: rule.id })} list={list} group={group} rule={rule} index={index} />)}</>;
}

function RegexRuleRow({ list, group, rule, index }: { list: List; group: RegexListGroup; rule: RegexListGroup['rules'][number]; index: number }) {
    const [open, setOpen] = useState(false);
    const menu = useRef<HTMLDivElement>(null);
    const trigger = useRef<HTMLSpanElement>(null);
    const menuId = useId();
    const ref = { groupKey: group.key, id: rule.id };
    const label = rule.scriptName;
    useEffect(() => {
        if (!open) return;
        const outside = (event: MouseEvent) => { if (event.target instanceof Node && !menu.current?.contains(event.target)) setOpen(false); };
        const escape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); trigger.current?.querySelector('button')?.focus(); }
        };
        document.addEventListener('click', outside);
        document.addEventListener('keydown', escape);
        return () => { document.removeEventListener('click', outside); document.removeEventListener('keydown', escape); };
    }, [open]);
    const command = (action: RegexListAction) => { setOpen(false); void list.execute(action); };
    return <div className={`regex-script-label regex-react-row${rule.disabled ? ' regex-react-disabled' : ''}`} onDragOver={event => { if (!list.pending) event.preventDefault(); }} onDrop={event => {
        event.preventDefault();
        const payload = event.dataTransfer.getData('application/x-ember-regex');
        try {
            const source: unknown = JSON.parse(payload);
            if (Array.isArray(source) && source[0] === group.key && typeof source[1] === 'number') list.reorder(group, source[1], index);
        } catch { /* Ignore unrelated drag data. */ }
    }}>
        {list.bulk && <input type="checkbox" className="regex-react-select" aria-label={`${translate('Select')} ${label}`} checked={list.selected.some(item => refKey(item) === refKey(ref))} disabled={list.pending} onChange={() => list.toggle(ref)} />}
        <span className="regex-react-drag" draggable={!list.pending} title={translate('Drag to reorder')} onDragStart={event => { event.dataTransfer.setData('application/x-ember-regex', JSON.stringify([group.key, index])); event.dataTransfer.effectAllowed = 'move'; }}>{icon('grip-lines')}</span>
        <span className="regex_script_name" title={label}>{label}</span>
        <div className="regex-react-actions">
            <ContractIconButton label={`${translate('Move')} ${label} ${translate('up')}`} nativeTitle title="Move up" icon={icon('arrow-up')} disabled={list.pending || index === 0} onClick={() => list.reorder(group, index, index - 1)} />
            <ContractIconButton label={`${translate('Move')} ${label} ${translate('down')}`} nativeTitle title="Move down" icon={icon('arrow-down')} disabled={list.pending || index === group.rules.length - 1} onClick={() => list.reorder(group, index, index + 1)} />
            <ContractIconButton label={`${translate(rule.disabled ? 'Enable' : 'Disable')} ${label}`} nativeTitle title={rule.disabled ? 'Enable script' : 'Disable script'} icon={icon(rule.disabled ? 'toggle-off' : 'toggle-on')} disabled={list.pending} onClick={() => command({ kind: 'enable', refs: [ref], enabled: rule.disabled, authorize: true })} />
            <div className="regex-react-menu" ref={menu}>
                <span ref={trigger}><ContractIconButton label={`${translate('More options for')} ${label}`} nativeTitle title="Show more options" icon={icon('ellipsis')} disabled={list.pending} onClick={() => setOpen(value => !value)} {...{ 'aria-expanded': open, 'aria-controls': menuId }} /></span>
                {open && <div id={menuId} className="regex-react-menu-items">
                    {targets.filter(target => target.type !== group.type).map(target => <ContractButton key={target.type} label={target.label} icon={icon(target.icon)} disabled={list.pending || !list.snapshot.groups.find(item => item.type === target.type)?.available} onClick={() => command({ kind: 'move', refs: [ref], toType: target.type })} />)}
                    <ContractButton label="Export" icon={icon('file-export')} disabled={list.pending} onClick={() => command({ kind: 'export', refs: [ref] })} />
                </div>}
            </div>
            <ContractIconButton label={`${translate('Edit')} ${label}`} nativeTitle title="Edit script" icon={icon('pencil')} disabled={list.pending} onClick={() => command({ kind: 'edit', refs: [ref] })} />
            <ContractIconButton label={`${translate('Delete')} ${label}`} nativeTitle title="Delete script" icon={icon('trash')} disabled={list.pending} onClick={() => command({ kind: 'delete', refs: [ref] })} />
        </div>
    </div>;
}
