import { useEffect, useState } from 'react';
import { ContractIconButton } from '../contract/ContractIconButton';
import { translate } from '@/compat/i18n.js';
import type { RegexPresetController } from './regex-types';

export function RegexPresetControls({ controller, onError }: { controller?: RegexPresetController; onError(message: string): void }) {
    const [, update] = useState(0);
    const [pending, setPending] = useState(false);
    useEffect(() => controller?.subscribe?.(() => update(value => value + 1)), [controller]);
    const state = controller?.list() ?? { presets: [], selected: '' };
    async function command(action: () => unknown) {
        if (pending) return;
        setPending(true);
        try { await action(); update(value => value + 1); }
        catch (error) { onError(error instanceof Error ? error.message : String(error)); update(value => value + 1); }
        finally { setPending(false); }
    }
    return <div className="flex-container marginTop5">
        <select id="regex_presets" className="text_pole flex1" aria-label={translate('Regex presets')} value={state.selected} disabled={!controller || pending} onChange={event => { const id = event.target.value; void command(() => controller?.select(id)); }}>
            {!state.presets.length && <option value="">{translate('No presets')}</option>}
            {state.presets.map(preset => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
        </select>
        <ContractIconButton id="regex_preset_create" className="menu_button" label="Create a new regex preset" nativeTitle title={translate('Create a new regex preset')} disabled={!controller || pending} icon={<i className="fa-solid fa-file-circle-plus" aria-hidden="true" />} onClick={() => void command(() => controller?.create())} />
        <ContractIconButton id="regex_preset_update" className="menu_button" label="Update existing regex preset" nativeTitle title={translate('Update existing regex preset')} disabled={!controller || pending || !state.selected} icon={<i className="fa-solid fa-save" aria-hidden="true" />} onClick={() => void command(() => controller?.update())} />
        <ContractIconButton id="regex_preset_apply" className="menu_button" label="Re-apply current preset" nativeTitle title={translate('Re-apply current preset')} disabled={!controller || pending || !state.selected} icon={<i className="fa-solid fa-recycle" aria-hidden="true" />} onClick={() => void command(() => controller?.apply())} />
        <ContractIconButton id="regex_preset_delete" className="menu_button" label="Delete current preset" nativeTitle title={translate('Delete current preset')} disabled={!controller || pending || !state.selected} icon={<i className="fa-solid fa-trash" aria-hidden="true" />} onClick={() => void command(() => controller?.delete())} />
    </div>;
}
