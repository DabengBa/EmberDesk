import { useState, useSyncExternalStore } from 'react';
import { translate, useTranslated } from '@/compat/i18n.js';
import type { WorldInfoSelectorRuntime } from './world-info-selector-types';

export function WorldInfoEditorMirror({ runtime }: { runtime: WorldInfoSelectorRuntime }) {
    useTranslated('');
    const snapshot = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
    const [error, setError] = useState('');
    async function changeEditor(name: string) {
        setError('');
        try {
            await runtime.selectEditorName(name);
        } catch {
            setError(translate('World Info action failed. Please try again.'));
        }
    }
    return <>
        <select id="world_editor_select" hidden value={snapshot.editorWorldName} onChange={event => {
            void changeEditor(event.target.value);
        }}>
            <option value="">{translate('--- Pick to Edit ---')}</option>
            {snapshot.worldNames.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
        {error && <span role="alert">{error}</span>}
    </>;
}
