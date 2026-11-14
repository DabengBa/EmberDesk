import { useState, useSyncExternalStore } from 'react';
import { translate } from '@/compat/i18n.js';
import type { WorldInfoSelectorRuntime } from './world-info-selector-types';

export function WorldInfoGlobalSelector({ runtime }: {
    runtime: WorldInfoSelectorRuntime;
}) {
    const snapshot = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
    const [search, setSearch] = useState('');
    const [error, setError] = useState('');
    const matching = snapshot.worldNames.filter(name => name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));

    function changeActivation(update: (active: readonly string[]) => string[]) {
        setError('');
        try {
            runtime.setGlobalActiveNames(update(runtime.getSnapshot().globalActiveNames));
        } catch {
            setError(translate('World Info action failed. Please try again.'));
        }
    }

    async function openWorld(name: string) {
        setError('');
        if (runtime.getSnapshot().editorWorldName === name) return;
        try {
            await runtime.selectEditorName(name);
        } catch {
            setError(translate('World Info action failed. Please try again.'));
        }
    }

    return <div id="world_info" className="wi-global-selector">
        <span id="wiGlobalCount" className="wi-global-count" aria-live="polite">{snapshot.globalActiveNames.length === 1 ? translate('1 active') : translate('${0} active').replace('${0}', String(snapshot.globalActiveNames.length))}</span>
        {snapshot.globalActiveNames.length > 0 && <fieldset className="wi-global-selected" aria-label={translate('Globally enabled world books')}>
            {snapshot.globalActiveNames.map(name => <span className="wi-global-chip" key={name}>
                <button type="button" className="wi-global-chip-open" title={translate('Open ${0} in editor').replace('${0}', name)} aria-label={translate('Open ${0} in editor').replace('${0}', name)} onClick={() => { void openWorld(name); }}>{name}</button>
                <button type="button" className="wi-global-chip-remove" aria-label={translate('Remove ${0} from global World Info').replace('${0}', name)} onClick={() => changeActivation(active => active.filter(item => item !== name))}>×</button>
            </span>)}
            <button type="button" className="wi-global-clear" onClick={() => changeActivation(() => [])}>{translate('Clear all')}</button>
        </fieldset>}
        <details className="wi-global-picker">
            <summary>{translate('Select global World Info')}</summary>
            <div className="wi-global-picker-content">
                <input type="search" className="text_pole wide100p" aria-label={translate('Search global World Info')} placeholder={translate('Search World Info')} value={search} onChange={event => setSearch(event.target.value)} />
                <fieldset className="wi-global-options" aria-label={translate('Global World Info')}>
                    {matching.map(name => <label className="wi-global-option" key={name}>
                        <input type="checkbox" checked={snapshot.globalActiveNames.includes(name)} onChange={event => {
                            const checked = event.target.checked;
                            changeActivation(active => checked ? [...active.filter(item => item !== name), name] : active.filter(item => item !== name));
                        }} />
                        <span>{name}</span>
                    </label>)}
                    {matching.length === 0 && <div className="wi-global-empty">{snapshot.worldNames.length === 0 ? translate('No World Info found.') : translate('No matching World Info.')}</div>}
                </fieldset>
            </div>
        </details>
        {error && <div className="wi-global-error" role="alert">{error}</div>}
    </div>;
}
