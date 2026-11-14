import { useRef, useState } from 'react';

export type CharacterWorldInfoEditorProps = {
    characterName: string;
    primaryWorld: string;
    auxWorlds: string[];
    worldNames: string[];
    onPrimaryChange: (name: string) => Promise<void>;
    onAuxChange: (names: string[]) => Promise<void>;
};

export function CharacterWorldInfoEditor(props: CharacterWorldInfoEditorProps) {
    const [primary, setPrimary] = useState(props.primaryWorld);
    const [aux, setAux] = useState(props.auxWorlds);
    const [search, setSearch] = useState('');
    const [pending, setPending] = useState(false);
    const [error, setError] = useState('');
    const busy = useRef(false);
    const names = Array.from(new Set([...props.worldNames, ...aux, ...(primary ? [primary] : [])]));
    const matching = names.filter(name => name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
    async function save(action: () => Promise<void>, update: () => void) {
        if (busy.current) return;
        busy.current = true;
        setPending(true);
        setError('');
        try { await action(); update(); }
        catch (cause: unknown) { setError(cause instanceof Error ? cause.message : 'Could not save. Try again.'); }
        finally { busy.current = false; setPending(false); }
    }
    return <div className="character_world range-block flexFlowColumn flex-container">
        <h3>Select a World Info file for <span className="character_name">{props.characterName}</span>:</h3>
        <label>Search Lorebooks<input className="text_pole wide100p" type="search" value={search} onChange={event => setSearch(event.target.value)} /></label>
        <label><h4>Primary Lorebook</h4>
            <span>A selected World Info will be bound to this character and embedded on export.</span>
            <select className="character_world_info_selector wide100p" value={primary} disabled={pending} onChange={event => {
                const next = event.target.value;
                void save(() => props.onPrimaryChange(next), () => setPrimary(next));
            }}>
                <option value="">--- None ---</option>
                {names.filter(name => name === primary || matching.includes(name)).map(name => <option key={name} value={name}>{name}</option>)}
            </select>
        </label>
        <fieldset disabled={pending} style={{ minWidth: 0 }}>
            <legend>Additional Lorebooks</legend>
            <p>These choices are optional and won't be preserved on character export.</p>
            {matching.length === 0 && <p>No matching Lorebooks.</p>}
            {matching.map(name => <label key={name} style={{ display: 'flex', alignItems: 'center', gap: '0.5em', overflowWrap: 'anywhere' }}>
                <input type="checkbox" style={{ flexShrink: 0 }} checked={aux.includes(name)} onChange={event => {
                    const next = event.target.checked ? [...aux, name] : aux.filter(item => item !== name);
                    void save(() => props.onAuxChange(next), () => setAux(next));
                }} /><span style={{ minWidth: 0 }}>{name}</span>
            </label>)}
            {aux.length > 0 && <button type="button" className="menu_button" style={{ width: 'fit-content', maxWidth: '100%' }} onClick={() => { void save(() => props.onAuxChange([]), () => setAux([])); }}>Clear additional Lorebooks</button>}
        </fieldset>
        {pending && <output>Saving…</output>}
        {error && <p role="alert">{error}</p>}
    </div>;
}
